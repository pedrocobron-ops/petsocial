-- Erros que as pessoas encontram no aplicativo (navegador e servidor), sem serviço pago e sem dado pessoal.
-- O navegador e o servidor mandam um resumo já limpo (mensagem curta, primeiras linhas da pilha, rota sem ids, versão,
-- tamanho da tela, navegador) por `erro_registrar`; o banco limpa de novo, limita tamanhos, freia excesso e junta repetições.
-- O painel do administrador (aba Erros) lê por `admin_erros` e marca como resolvido por `admin_erro_resolver`.
-- Aditiva: só tabelas e funções novas. O código de hoje não chama nada disto; o código novo funciona sem esta migração
-- (o envio falha calado).

-- ------------------------------------------------------------
-- Tabelas (RLS ligado e nenhum acesso direto: só as funções abaixo)
-- ------------------------------------------------------------
create table if not exists public.erros_app (
  id bigint generated always as identity primary key,
  assinatura text not null,
  origem text not null check (origem in ('navegador', 'servidor')),
  tipo text not null,
  nome text,
  mensagem text not null,
  pilha text,
  rota text,
  versao text,
  navegador text,
  tela text,
  petshop_id uuid references public.petshops (id) on delete set null,
  papel text,
  areas text[],
  aparelho text not null,
  contagem integer not null default 1,
  primeiro_em timestamptz not null default now(),
  ultimo_em timestamptz not null default now()
);
create index if not exists erros_app_junta_idx on public.erros_app (assinatura, aparelho, ultimo_em desc);
create index if not exists erros_app_ultimo_idx on public.erros_app (ultimo_em);
alter table public.erros_app enable row level security;
revoke all on public.erros_app from public, anon, authenticated;

-- "Resolvido": some do painel até acontecer de novo numa versão que não estava no ar quando foi marcado.
create table if not exists public.erros_app_resolvidos (
  assinatura text primary key,
  resolvido_em timestamptz not null default now(),
  versoes text[] not null default '{}',
  por uuid
);
alter table public.erros_app_resolvidos enable row level security;
revoke all on public.erros_app_resolvidos from public, anon, authenticated;

-- Só contagens por dia: falhas sem internet (não viram erro) e envios descartados pelo freio.
create table if not exists public.erros_app_contagem (
  dia date not null,
  tipo text not null,
  n integer not null default 0,
  primary key (dia, tipo)
);
alter table public.erros_app_contagem enable row level security;
revoke all on public.erros_app_contagem from public, anon, authenticated;

-- Freio de envios: por aparelho e por pet shop a cada minuto, e geral a cada hora.
create table if not exists public.erros_app_freio (
  chave text not null,
  janela timestamptz not null,
  n integer not null default 0,
  primary key (chave, janela)
);
create index if not exists erros_app_freio_janela_idx on public.erros_app_freio (janela);
alter table public.erros_app_freio enable row level security;
revoke all on public.erros_app_freio from public, anon, authenticated;

-- ------------------------------------------------------------
-- Limpeza de texto (segunda demão; o navegador já limpou): e-mail, uuid, ficha longa, número comprido, valor em reais,
-- endereço com consulta (?...) ou âncora (#...).
-- ------------------------------------------------------------
create or replace function public.erro_limpar(p text, p_max integer) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v text := left(coalesce(p, ''), 4000);
begin
  v := regexp_replace(v, '[\x01-\x09\x0b-\x1f\x7f]', ' ', 'g');
  v := regexp_replace(v, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[email]', 'g');
  v := regexp_replace(v, '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}', ':id', 'g');
  v := regexp_replace(v, '(\S)[?#][^\s)''"]*?(?=:[0-9]+:[0-9]+|[\s)''"]|$)', '\1', 'g');
  v := regexp_replace(v, 'eyJ[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*', ':token', 'g');
  v := regexp_replace(v, '(?=[A-Za-z_-]*[0-9])[A-Za-z0-9_-]{24,}', ':token', 'g');
  v := regexp_replace(v, 'R\$\s?-?[0-9][0-9.,]*', 'R$ :valor', 'g');
  v := regexp_replace(v, '[0-9]{8,}', ':n', 'g');
  v := regexp_replace(v, '\+?\(?[0-9]{2,3}\)?[\s.-]?9?[0-9]{4}[\s.-]?[0-9]{4}', ':n', 'g');
  return nullif(btrim(left(v, greatest(p_max, 0))), '');
end $$;
revoke execute on function public.erro_limpar(text, integer) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Registrar um erro (anônimo e logado). Nunca falha para quem chama: o que passa do limite é descartado calado.
-- Limites: mensagem 500, pilha 1500 (6 linhas), rota 200, nome 80, versão 40, navegador 60, tela 20, aparelho 40.
-- Freio: 30 envios por aparelho por minuto, 60 por pet shop por minuto, 1000 no total por hora.
-- Junta repetições: a mesma assinatura no mesmo aparelho e versão em até 10 minutos soma na contagem em vez de criar linha.
-- Guarda 30 dias (a limpeza roda junto com a criação de uma linha nova, por índice).
-- ------------------------------------------------------------
create or replace function public.erro_registrar(
  p_origem text,
  p_tipo text,
  p_mensagem text,
  p_nome text default null,
  p_pilha text default null,
  p_rota text default null,
  p_versao text default null,
  p_navegador text default null,
  p_tela text default null,
  p_petshop uuid default null,
  p_aparelho text default null,
  p_sem_internet boolean default false
) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ap text := left(regexp_replace(coalesce(p_aparelho, ''), '[^A-Za-z0-9_-]', '', 'g'), 40);
  v_origem text := case when p_origem = 'servidor' then 'servidor' else 'navegador' end;
  v_tipo text := case when p_tipo in ('erro', 'promessa', 'tela', 'banco', 'servidor') then p_tipo else 'erro' end;
  v_n integer;
  v_loja uuid;
  v_papel text;
  v_areas text[];
  v_msg text; v_nome text; v_pilha text; v_rota text; v_versao text; v_nav text; v_tela text;
  v_ass text;
  v_id bigint;
begin
  if v_ap = '' then v_ap := 'sem'; end if;

  -- freio por aparelho (minuto) e geral (hora)
  insert into public.erros_app_freio as f (chave, janela, n) values ('a:' || v_ap, date_trunc('minute', now()), 1)
    on conflict (chave, janela) do update set n = f.n + 1 returning f.n into v_n;
  if v_n > 30 then return; end if;
  insert into public.erros_app_freio as f (chave, janela, n) values ('geral', date_trunc('hour', now()), 1)
    on conflict (chave, janela) do update set n = f.n + 1 returning f.n into v_n;
  if v_n > 1000 then
    insert into public.erros_app_contagem as c (dia, tipo, n) values (v_hoje, 'descartado', 1)
      on conflict (dia, tipo) do update set n = c.n + 1;
    return;
  end if;

  if coalesce(p_sem_internet, false) then
    insert into public.erros_app_contagem as c (dia, tipo, n) values (v_hoje, 'sem_internet', 1)
      on conflict (dia, tipo) do update set n = c.n + 1;
    return;
  end if;

  -- pet shop: só se existe; papel e áreas vêm do banco (da equipe de quem está logado), nunca do aparelho
  if p_petshop is not null then
    select x.id into v_loja from public.petshops x where x.id = p_petshop;
    if v_loja is not null then
      insert into public.erros_app_freio as f (chave, janela, n) values ('p:' || v_loja::text, date_trunc('minute', now()), 1)
        on conflict (chave, janela) do update set n = f.n + 1 returning f.n into v_n;
      if v_n > 60 then return; end if;
      if v_uid is not null then
        select case when pr.papel::text = 'dono' then 'dono' else 'equipe' end,
               case when pr.papel::text = 'dono' then null else coalesce(pr.acessos, '{}') end
          into v_papel, v_areas
          from public.profissionais pr where pr.petshop_id = v_loja and pr.user_id = v_uid and pr.ativo limit 1;
      end if;
    end if;
  end if;
  if v_papel is null then v_papel := case when v_uid is null then 'anonimo' else 'logado' end; end if;

  v_msg := coalesce(public.erro_limpar(p_mensagem, 500), '(sem mensagem)');
  v_nome := public.erro_limpar(regexp_replace(coalesce(p_nome, ''), '[^A-Za-z0-9_ .:-]', '', 'g'), 80);
  v_pilha := public.erro_limpar(array_to_string((string_to_array(left(coalesce(p_pilha, ''), 3000), E'\n'))[1:6], E'\n'), 1500);
  v_rota := public.erro_limpar(p_rota, 200);
  v_versao := public.erro_limpar(regexp_replace(coalesce(p_versao, ''), '[^A-Za-z0-9_.-]', '', 'g'), 40);
  v_nav := public.erro_limpar(regexp_replace(coalesce(p_navegador, ''), '[^A-Za-z0-9_ .()/-]', '', 'g'), 60);
  v_tela := left(regexp_replace(coalesce(p_tela, ''), '[^0-9x]', '', 'g'), 20);

  -- assinatura: origem + tipo + mensagem sem números + primeira linha da pilha + rota
  v_ass := md5(v_origem || '|' || v_tipo || '|' || regexp_replace(v_msg, '[0-9]+', '0', 'g') || '|'
    || coalesce(split_part(v_pilha, E'\n', 1), '') || '|' || coalesce(v_rota, ''));

  update public.erros_app e set contagem = e.contagem + 1, ultimo_em = now()
    where e.id = (select x.id from public.erros_app x
                   where x.assinatura = v_ass and x.aparelho = v_ap and x.ultimo_em > now() - interval '10 minutes'
                     and x.versao is not distinct from v_versao
                   order by x.ultimo_em desc limit 1)
    returning e.id into v_id;
  if v_id is not null then return; end if;

  insert into public.erros_app (assinatura, origem, tipo, nome, mensagem, pilha, rota, versao, navegador, tela, petshop_id, papel, areas, aparelho)
    values (v_ass, v_origem, v_tipo, v_nome, v_msg, v_pilha, v_rota, v_versao, v_nav, nullif(v_tela, ''), v_loja, v_papel, v_areas, v_ap);

  -- faxina (barata, por índice)
  delete from public.erros_app where ultimo_em < now() - interval '30 days';
  delete from public.erros_app_freio where janela < now() - interval '2 hours';
  delete from public.erros_app_contagem where dia < v_hoje - 31;
exception when others then
  -- quem manda o erro nunca recebe erro de volta
  return;
end $$;
revoke execute on function public.erro_registrar(text, text, text, text, text, text, text, text, text, uuid, text, boolean) from public;
grant execute on function public.erro_registrar(text, text, text, text, text, text, text, text, text, uuid, text, boolean) to anon, authenticated;

-- ------------------------------------------------------------
-- Painel: erros agrupados pela assinatura, no período (horas, até 31 dias). Só dados técnicos e quantidades.
-- ------------------------------------------------------------
create or replace function public.admin_erros(p_horas integer default 24, p_resolvidos boolean default false) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_horas integer := least(greatest(coalesce(p_horas, 24), 1), 24 * 31);
  v_desde timestamptz;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_dias integer;
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  v_desde := now() - make_interval(hours => v_horas);
  v_dias := greatest(1, ceil(v_horas / 24.0)::integer);
  return jsonb_build_object(
    'agora', now(),
    'sem_internet', (select coalesce(sum(n), 0) from public.erros_app_contagem where tipo = 'sem_internet' and dia > v_hoje - v_dias),
    'descartados', (select coalesce(sum(n), 0) from public.erros_app_contagem where tipo = 'descartado' and dia > v_hoje - v_dias),
    'grupos', coalesce((
      select jsonb_agg(s.g order by s.ultimo desc)
      from (
        select jsonb_build_object(
          'assinatura', e.assinatura,
          'origem', min(e.origem),
          'tipo', min(e.tipo),
          'nome', (array_agg(e.nome order by e.ultimo_em desc))[1],
          'mensagem', (array_agg(e.mensagem order by e.ultimo_em desc))[1],
          'pilha', (array_agg(e.pilha order by e.ultimo_em desc))[1],
          'rota', min(e.rota),
          'vezes', sum(e.contagem),
          'aparelhos', count(distinct e.aparelho),
          'lojas', count(distinct e.petshop_id),
          'primeiro_em', min(e.primeiro_em),
          'ultimo_em', max(e.ultimo_em),
          'versoes', to_jsonb(array_remove(array_agg(distinct e.versao), null)),
          'navegadores', to_jsonb(array_remove(array_agg(distinct e.navegador), null)),
          'telas', to_jsonb(array_remove(array_agg(distinct e.tela), null)),
          'papeis', to_jsonb(array_remove(array_agg(distinct e.papel), null)),
          'areas', coalesce((select jsonb_agg(distinct a) from public.erros_app y, unnest(y.areas) a
                    where y.assinatura = e.assinatura and y.ultimo_em >= v_desde), '[]'::jsonb),
          'resolvido_em', r.resolvido_em,
          'voltou', r.assinatura is not null and exists (
            select 1 from public.erros_app y where y.assinatura = e.assinatura and y.ultimo_em > r.resolvido_em
              and not (coalesce(y.versao, '') = any (r.versoes)))
        ) as g, max(e.ultimo_em) as ultimo, r.assinatura is not null as marcado
        from public.erros_app e
        left join public.erros_app_resolvidos r on r.assinatura = e.assinatura
        where e.ultimo_em >= v_desde
        group by e.assinatura, r.assinatura, r.resolvido_em, r.versoes
        order by max(e.ultimo_em) desc
        limit 300
      ) s
      where p_resolvidos or not s.marcado or (s.g->>'voltou')::boolean
    ), '[]'::jsonb)
  );
end $$;
revoke execute on function public.admin_erros(integer, boolean) from public, anon;
grant execute on function public.admin_erros(integer, boolean) to authenticated;

-- Marcar (ou desmarcar) como resolvido: guarda as versões em que já aconteceu; volta a aparecer se acontecer noutra.
create or replace function public.admin_erro_resolver(p_assinatura text, p_resolvido boolean default true) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  if coalesce(p_resolvido, true) then
    insert into public.erros_app_resolvidos (assinatura, resolvido_em, versoes, por)
      values (p_assinatura, now(),
              coalesce((select array_agg(distinct coalesce(versao, '')) from public.erros_app where assinatura = p_assinatura), '{}'),
              auth.uid())
      on conflict (assinatura) do update set resolvido_em = excluded.resolvido_em, versoes = excluded.versoes, por = excluded.por;
  else
    delete from public.erros_app_resolvidos where assinatura = p_assinatura;
  end if;
end $$;
revoke execute on function public.admin_erro_resolver(text, boolean) from public, anon;
grant execute on function public.admin_erro_resolver(text, boolean) to authenticated;
