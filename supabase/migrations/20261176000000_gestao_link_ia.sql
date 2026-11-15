-- ============================================================
-- Tirar dúvidas do cliente no link (resposta automática).
-- Opção nova em petshops.opcoes: "link.ia" (true = o link do cliente mostra o "Tirar dúvida"). Sem a chave, nada muda.
-- A rota do servidor monta o que o assistente sabe só pelas funções públicas do link (as mesmas que a página já usa);
-- aqui ficam só: saber se a opção está ligada, a contagem por dia (freio de gasto) e o resumo do mês para o dono.
-- O texto das perguntas NÃO é guardado: a tabela tem só números.
-- Aditiva: tabela e funções novas; admin_uso_contas() mantém a assinatura (jsonb) e ganha uma chave.
-- Segura antes do deploy: o código de hoje não chama nada daqui.
-- ============================================================

create table if not exists public.link_ia_uso (
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  dia date not null,
  perguntas int not null default 0 check (perguntas >= 0),
  respondidas int not null default 0 check (respondidas >= 0),
  sem_resposta int not null default 0 check (sem_resposta >= 0),
  primary key (petshop_id, dia)
);
alter table public.link_ia_uso enable row level security;
-- sem regra: ninguém lê nem grava direto; só as funções abaixo
revoke all on public.link_ia_uso from public, anon, authenticated;

-- A opção está ligada neste link? (link ativo, conta liberada e a chave "link.ia")
create or replace function public.link_ia_ligada(p_codigo text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select p.opcoes -> 'link.ia' = 'true'::jsonb
    from public.petshops p
    where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)), false)
$$;

-- Conta uma pergunta antes de chamar o modelo. Limite por pet shop por dia (do fuso dele):
-- config_interna 'link_ia_dia' (padrão 100). Devolve { ok } ou { ok: false, motivo: 'desligado' | 'limite' }.
create or replace function public.link_ia_contar(p_codigo text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_dia date; v_lim int; v_n int;
begin
  select p.id, (now() at time zone p.fuso)::date into v_id, v_dia
  from public.petshops p
  where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id) and p.opcoes -> 'link.ia' = 'true'::jsonb;
  if v_id is null then return jsonb_build_object('ok', false, 'motivo', 'desligado'); end if;
  v_lim := public.link_limite('link_ia_dia', 100);
  if v_lim <= 0 then return jsonb_build_object('ok', false, 'motivo', 'limite'); end if;
  insert into public.link_ia_uso as u (petshop_id, dia, perguntas) values (v_id, v_dia, 1)
  on conflict (petshop_id, dia) do update set perguntas = u.perguntas + 1 where u.perguntas < v_lim
  returning u.perguntas into v_n;
  if v_n is null then return jsonb_build_object('ok', false, 'motivo', 'limite'); end if;
  return jsonb_build_object('ok', true);
end $$;

-- Depois da resposta: soma em "respondidas" ou "sem_resposta" (nunca passa do número de perguntas do dia).
create or replace function public.link_ia_registrar(p_codigo text, p_respondida boolean) returns void
language sql volatile security definer set search_path = '' as $$
  update public.link_ia_uso u
  set respondidas = u.respondidas + case when p_respondida then 1 else 0 end,
      sem_resposta = u.sem_resposta + case when p_respondida then 0 else 1 end
  from public.petshops p
  where p.link_codigo = p_codigo and u.petshop_id = p.id and u.dia = (now() at time zone p.fuso)::date
    and u.respondidas + u.sem_resposta < u.perguntas
$$;

-- Para Meu pet shop: quantas perguntas o link recebeu neste mês (do fuso do pet shop). Só para quem é da equipe.
create or replace function public.link_ia_mes(p_petshop uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'perguntas', coalesce(sum(u.perguntas), 0), 'respondidas', coalesce(sum(u.respondidas), 0),
    'sem_resposta', coalesce(sum(u.sem_resposta), 0), 'limite_dia', public.link_limite('link_ia_dia', 100))
  from public.petshops p
  left join public.link_ia_uso u on u.petshop_id = p.id
    and u.dia >= date_trunc('month', (now() at time zone p.fuso))::date
  where p.id = p_petshop and p.id in (select public.meus_petshops())
  group by p.id
$$;

revoke execute on function public.link_ia_ligada(text), public.link_ia_contar(text), public.link_ia_registrar(text, boolean), public.link_ia_mes(uuid) from public;
grant execute on function public.link_ia_ligada(text), public.link_ia_contar(text), public.link_ia_registrar(text, boolean) to anon, authenticated;
revoke execute on function public.link_ia_mes(uuid) from anon;
grant execute on function public.link_ia_mes(uuid) to authenticated;

-- ------------------------------------------------------------
-- Painel do administrador: a mesma função de 20261175, com 'ia_link_14' (perguntas no link nos últimos 14 dias).
-- ------------------------------------------------------------
create or replace function public.admin_uso_contas() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_desde timestamptz := now() - interval '14 days';
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date - 13;
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return (
    select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select p.id, p.nome, p.status, p.plano, p.teste_ate, p.criado_em,
        public.limite_de_acessos(p.plano) as limite,
        eq.pessoas, eq.ultimo_login,
        (select max(pr.visto_em) from public.presenca pr where pr.petshop_id = p.id) as visto_em,
        greatest(
          (select max(a.criado_em) from public.agendamentos a where a.petshop_id = p.id),
          (select max(l.criado_em) from public.lancamentos l where l.petshop_id = p.id),
          (select max(e.criado_em) from public.estadias e where e.petshop_id = p.id),
          (select max(c.criado_em) from public.clientes c where c.petshop_id = p.id)) as ultima_gravacao,
        (select count(*) from public.agendamentos a where a.petshop_id = p.id and a.criado_em >= v_desde) as agendamentos_14,
        (select count(*) from public.lancamentos l where l.petshop_id = p.id and l.criado_em >= v_desde and l.tipo = 'entrada' and l.movimento is null) as vendas_14,
        (select count(*) from public.estadias e where e.petshop_id = p.id and e.criado_em >= v_desde and e.tipo = 'creche') as creche_14,
        (select count(*) from public.estadias e where e.petshop_id = p.id and e.criado_em >= v_desde and e.tipo = 'hotel') as hotel_14,
        (select count(*) from public.clientes c where c.petshop_id = p.id and c.criado_em >= v_desde) as clientes_14,
        (select coalesce(sum(i.perguntas), 0) from public.link_ia_uso i where i.petshop_id = p.id and i.dia >= v_dia) as ia_link_14,
        (select count(*) from (
            select u.dia from public.uso_diario u where u.petshop_id = p.id and u.dia >= v_dia
            union select (a.criado_em at time zone 'America/Sao_Paulo')::date from public.agendamentos a where a.petshop_id = p.id and a.criado_em >= v_desde
            union select (l.criado_em at time zone 'America/Sao_Paulo')::date from public.lancamentos l where l.petshop_id = p.id and l.criado_em >= v_desde
            union select (e.criado_em at time zone 'America/Sao_Paulo')::date from public.estadias e where e.petshop_id = p.id and e.criado_em >= v_desde
          ) d where d.dia >= v_dia) as dias_14,
        (select coalesce(jsonb_agg(distinct u.area), '[]'::jsonb) from public.uso_diario u where u.petshop_id = p.id and u.dia >= v_dia) as areas_14
      from public.petshops p
      cross join lateral (
        select count(*) filter (where d.ativo and (d.user_id is not null or nullif(trim(coalesce(d.email_convite, '')), '') is not null)) as pessoas,
          max(u.last_sign_in_at) filter (where d.ativo) as ultimo_login
        from public.profissionais d left join auth.users u on u.id = d.user_id
        where d.petshop_id = p.id
      ) eq
    ) x
  );
end $$;
revoke execute on function public.admin_uso_contas() from public, anon;
grant execute on function public.admin_uso_contas() to authenticated;
