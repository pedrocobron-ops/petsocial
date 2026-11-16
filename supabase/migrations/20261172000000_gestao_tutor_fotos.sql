-- Página do tutor, acabamento (continua a 20261163): fotos que não ficam órfãs, prazo de guarda das fotos, fotos que o tutor
-- abre sem depender do cabeçalho x-tutor-token, e um freio leve para quem tentar puxar a página muitas vezes.
--
-- Só entram objetos novos (duas tabelas, duas colunas novas em diario_fotos, funções novas, um gatilho e uma política nova no
-- bucket) e a troca do corpo de tutor_pagina, com a mesma assinatura e a mesma resposta de antes, mais as chaves
-- "dias_fotos" e "foto_dias". O código no ar segue igual neste banco (com ou sem as migrações 49 e 57). Nada aqui guarda dinheiro.
--
-- 1. Arquivos órfãos. O banco não consegue apagar o arquivo do bucket (o Storage proíbe apagar direto em storage.objects:
--    o arquivo ficaria no disco). Então, quando a linha da foto sai (apagada, prazo vencido, ou em cascata ao apagar a
--    estadia, o pet, o tutor ou o pet shop), um gatilho põe o caminho na fila diario_fotos_lixo. Quando o dono ou a equipe
--    da creche e do hotel abre a tela, o aplicativo pede a faxina (diario_faxina): ela apaga as fotos fora do prazo, põe na
--    fila os arquivos que subiram sem linha há mais de um dia e devolve a lista para apagar pela API do Storage (a política
--    diario_lixo_apagar deixa apagar só o que está na fila). O que já sumiu do bucket sai da fila. Repetir não estraga nada.
-- 2. Prazo: opção "casa.tutor".dias_fotos = 30, 60, 90 ou 180 (padrão 90). A página do tutor nunca mostra foto fora do prazo,
--    mesmo antes da faxina rodar.
-- 3. Fotos sem cabeçalho: quem manda a foto (ou a faxina) assina o endereço do arquivo por 30 dias e guarda só o código da
--    assinatura (diario_fotos.assinatura). O servidor da página do tutor confere o link do tutor a cada foto (tutor_foto) e
--    entrega o arquivo; o endereço assinado nunca vai ao navegador. Sem assinatura válida, o servidor cai no caminho antigo
--    (cabeçalho x-tutor-token).
-- 4. Freio: até 30 aberturas da página e 400 fotos por minuto por link (erro PT429, que o PostgREST devolve como 429).

-- ---------- o prazo das fotos ----------
create function public.tutor_dias_fotos(p uuid) returns int
language sql stable security definer set search_path = '' as $$
  select case when v in (30, 60, 90, 180) then v else 90 end
  from (select (select case when (s.opcoes -> 'casa.tutor' ->> 'dias_fotos') ~ '^[0-9]{1,4}$' then (s.opcoes -> 'casa.tutor' ->> 'dias_fotos')::int end
                from public.petshops s where s.id = p) as v) x
$$;

-- ---------- a assinatura de cada foto ----------
alter table public.diario_fotos add column assinatura text check (assinatura ~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' and char_length(assinatura) <= 2000);
alter table public.diario_fotos add column assinatura_vale_ate timestamptz;

-- Guarda as assinaturas que o aparelho da equipe acabou de pedir ao Storage: [{id, assinatura, segundos}].
-- O Storage só aceita a assinatura para o arquivo dela; aqui só confere o formato e o pet shop.
create function public.diario_fotos_assinar(p_petshop uuid, p_lista jsonb) returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if not public.tenho_area(p_petshop, array['creche_hotel']) then raise exception 'Sem acesso à creche e ao hotel.'; end if;
  if jsonb_typeof(p_lista) is distinct from 'array' or jsonb_array_length(p_lista) > 500 then raise exception 'Lista inválida.'; end if;
  update public.diario_fotos f
     set assinatura = x.assinatura,
         assinatura_vale_ate = now() + make_interval(secs => greatest(0, least(x.segundos, 30 * 86400) - 3600))
    from jsonb_to_recordset(p_lista) as x(id uuid, assinatura text, segundos int)
   where f.id = x.id and f.petshop_id = p_petshop
     and x.assinatura ~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' and char_length(x.assinatura) <= 2000
     and coalesce(x.segundos, 0) > 3600;
  get diagnostics n = row_count;
  return n;
end $$;

-- ---------- a fila de arquivos para apagar ----------
create table public.diario_fotos_lixo (
  caminho text primary key,
  petshop_id uuid not null, -- sem chave estrangeira: a fila fica mesmo quando o pet shop sai
  motivo text not null default 'apagada',
  criado_em timestamptz not null default now(),
  tentativas int not null default 0
);
create index on public.diario_fotos_lixo (petshop_id, tentativas);
alter table public.diario_fotos_lixo enable row level security;
revoke all on public.diario_fotos_lixo from public, anon, authenticated;

create function public.diario_fotos_para_lixo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.diario_fotos_lixo (caminho, petshop_id, motivo)
  values (old.caminho, old.petshop_id, coalesce(nullif(current_setting('gestao.diario_motivo', true), ''), 'apagada'))
  on conflict (caminho) do nothing;
  return old;
end $$;
create trigger diario_fotos_para_lixo after delete on public.diario_fotos
  for each row execute function public.diario_fotos_para_lixo();

-- O arquivo está na fila do pet shop de quem pede, com acesso à creche e ao hotel (e não tem mais foto no diário)?
-- O bucket pergunta antes de apagar.
create function public.diario_pode_limpar(p_nome text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.diario_fotos_lixo l
                  where l.caminho = p_nome and l.petshop_id = public.diario_pasta(p_nome)
                    and public.tenho_area(l.petshop_id, array['creche_hotel']))
     and not exists (select 1 from public.diario_fotos f where f.caminho = p_nome)
$$;

create policy diario_lixo_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'diario' and public.diario_pode_limpar(name));

-- A faxina do pet shop: apaga as fotos fora do prazo, põe na fila os arquivos sem foto (mais de um dia), tira da fila o que
-- já sumiu do bucket e devolve {apagar: [caminhos], assinar: [{id, caminho}]} para o aparelho resolver pela API do Storage.
create function public.diario_faxina(p_petshop uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_fuso text; v_hoje date; v_dias int; v_apagar jsonb; v_assinar jsonb; v_vencidas int;
begin
  if not public.tenho_area(p_petshop, array['creche_hotel']) then raise exception 'Sem acesso à creche e ao hotel.'; end if;
  perform pg_advisory_xact_lock(hashtext('diario_faxina' || p_petshop::text));
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p_petshop;
  v_hoje := (now() at time zone coalesce(v_fuso, 'America/Sao_Paulo'))::date;
  v_dias := public.tutor_dias_fotos(p_petshop);

  -- fotos fora do prazo (o gatilho põe o arquivo na fila)
  perform set_config('gestao.diario_motivo', 'prazo', true);
  delete from public.diario_fotos f where f.petshop_id = p_petshop and f.dia <= v_hoje - v_dias;
  get diagnostics v_vencidas = row_count;
  perform set_config('gestao.diario_motivo', '', true);

  -- arquivos que subiram e não viraram foto (o envio falhou no meio)
  insert into public.diario_fotos_lixo (caminho, petshop_id, motivo)
  select o.name, p_petshop, 'sem_foto' from storage.objects o
   where o.bucket_id = 'diario' and left(o.name, 37) = p_petshop::text || '/' and o.created_at < now() - interval '1 day'
     and not exists (select 1 from public.diario_fotos f where f.caminho = o.name)
   limit 500
  on conflict (caminho) do nothing;

  -- o que já saiu do bucket sai da fila
  delete from public.diario_fotos_lixo l
   where l.petshop_id = p_petshop
     and not exists (select 1 from storage.objects o where o.bucket_id = 'diario' and o.name = l.caminho);

  -- o resto, para o aparelho apagar (desiste depois de 20 tentativas)
  with v as (
    update public.diario_fotos_lixo l set tentativas = l.tentativas + 1
     where l.caminho in (select x.caminho from public.diario_fotos_lixo x where x.petshop_id = p_petshop and x.tentativas < 20 order by x.criado_em limit 200)
    returning l.caminho)
  select coalesce(jsonb_agg(v.caminho), '[]'::jsonb) into v_apagar from v;

  -- fotos no prazo sem assinatura (ou vencendo em menos de 7 dias)
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'caminho', f.caminho)), '[]'::jsonb) into v_assinar
    from (select f.id, f.caminho from public.diario_fotos f
           where f.petshop_id = p_petshop and (f.assinatura is null or f.assinatura_vale_ate is null or f.assinatura_vale_ate < now() + interval '7 days')
           order by f.criado_em desc limit 200) f;

  return jsonb_build_object('apagar', v_apagar, 'assinar', v_assinar, 'vencidas', v_vencidas, 'dias', v_dias);
end $$;

-- ---------- o freio da página do tutor ----------
create table public.tutor_acessos (
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  tipo text not null,
  minuto timestamptz not null,
  n int not null default 0,
  primary key (cliente_id, tipo, minuto)
);
alter table public.tutor_acessos enable row level security;
revoke all on public.tutor_acessos from public, anon, authenticated;

-- Conta um acesso deste link no minuto; passou do limite, para com o erro PT429 (o PostgREST devolve 429).
-- Como o erro desfaz a transação, a conta não cresce além do limite.
create function public.tutor_frear(p_cliente uuid, p_tipo text, p_limite int) returns void
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  insert into public.tutor_acessos as a (cliente_id, tipo, minuto, n) values (p_cliente, p_tipo, date_trunc('minute', now()), 1)
  on conflict (cliente_id, tipo, minuto) do update set n = a.n + 1
  returning a.n into v_n;
  if v_n = 1 then delete from public.tutor_acessos a where a.cliente_id = p_cliente and a.minuto < now() - interval '10 minutes'; end if;
  if v_n > p_limite then
    raise exception 'Muitos acessos a esta página agora. Espere um minuto e abra de novo.' using errcode = 'PT429';
  end if;
end $$;

-- ---------- uma foto, para o servidor da página do tutor ----------
-- Confere o link (opção ligada, conta liberada), que a foto é de um pet deste tutor e está no prazo.
-- Devolve o caminho e a assinatura (só se ainda vale), ou nada.
create function public.tutor_foto(p_token text, p_foto uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.tutor_links; v_fuso text; v_hoje date; f public.diario_fotos;
begin
  l := public.tutor_do_codigo(p_token);
  if l.cliente_id is null then return null; end if;
  perform public.tutor_frear(l.cliente_id, 'foto', 400);
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = l.petshop_id;
  v_hoje := (now() at time zone coalesce(v_fuso, 'America/Sao_Paulo'))::date;
  select x.* into f from public.diario_fotos x join public.pets p on p.id = x.pet_id
   where x.id = p_foto and x.petshop_id = l.petshop_id and p.cliente_id = l.cliente_id and p.petshop_id = l.petshop_id
     and x.dia > v_hoje - public.tutor_dias_fotos(l.petshop_id);
  if f.id is null then return null; end if;
  return jsonb_build_object('caminho', f.caminho,
    'assinatura', case when f.assinatura_vale_ate > now() + interval '5 minutes' then f.assinatura end);
end $$;

-- ---------- a página (mesma assinatura e mesma resposta; agora com prazo e freio) ----------
create or replace function public.tutor_pagina(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l public.tutor_links;
  s public.petshops;
  v_hoje date;
  v_dias int;
  v_pets jsonb;
begin
  l := public.tutor_do_codigo(p_token);
  if l.cliente_id is null then return null; end if;
  perform public.tutor_frear(l.cliente_id, 'pagina', 30);
  select * into s from public.petshops where id = l.petshop_id;
  v_hoje := (now() at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date;
  v_dias := public.tutor_dias_fotos(s.id);
  if l.visto_em is null or l.visto_em < now() - interval '10 minutes' then
    update public.tutor_links set visto_em = now() where cliente_id = l.cliente_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'nome', p.nome, 'especie', p.especie, 'sexo', p.sexo, 'foto', p.foto,
    -- está na casa agora?
    'na_casa', (select jsonb_build_object('tipo', e.tipo, 'entrada', e.entrada, 'saida_prevista', e.saida_prevista)
                from public.estadias e where e.pet_id = p.id and e.petshop_id = s.id and e.status = 'em_casa' order by e.entrada desc limit 1),
    -- os dias com diário (últimos 30 dias) ou foto (dentro do prazo das fotos), no máximo 14
    'dias', coalesce((
      select jsonb_agg(d.j order by d.dia desc) from (
        select x.dia, jsonb_build_object(
          'dia', x.dia,
          'tipo', (select e.tipo from public.estadias e where e.id = x.estadia_id),
          'itens', coalesce((select r.itens from public.estadias_diario r where r.estadia_id = x.estadia_id and r.dia = x.dia), '[]'::jsonb),
          'nota', (select r.nota from public.estadias_diario r where r.estadia_id = x.estadia_id and r.dia = x.dia),
          'ocorrencias', coalesce((select jsonb_agg(jsonb_build_object('tipo', o.tipo, 'texto', o.texto, 'quando', o.quando) order by o.quando)
                          from public.estadias_ocorrencias o where o.estadia_id = x.estadia_id and o.no_diario
                            and (o.quando at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date = x.dia), '[]'::jsonb),
          'fotos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'caminho', f.caminho, 'legenda', f.legenda, 'em', f.criado_em) order by f.criado_em)
                    from public.diario_fotos f where f.estadia_id = x.estadia_id and f.dia = x.dia and f.dia > v_hoje - v_dias), '[]'::jsonb)
        ) as j
        from (
          select distinct on (u.dia) u.estadia_id, u.dia from (
            select r.estadia_id, r.dia from public.estadias_diario r join public.estadias e on e.id = r.estadia_id
              where e.pet_id = p.id and r.petshop_id = s.id and r.dia > v_hoje - 30
                and (jsonb_array_length(r.itens) > 0 or nullif(trim(coalesce(r.nota, '')), '') is not null)
            union all
            select f.estadia_id, f.dia from public.diario_fotos f where f.pet_id = p.id and f.petshop_id = s.id and f.dia > v_hoje - v_dias
          ) u order by u.dia desc
          limit 14
        ) x
      ) d), '[]'::jsonb),
    -- o que está marcado (sem preço)
    'agenda', coalesce((
      select jsonb_agg(jsonb_build_object('inicio', a.inicio, 'servico', sv.nome) order by a.inicio)
      from (select * from public.agendamentos a where a.pet_id = p.id and a.petshop_id = s.id and a.inicio >= now()
              and a.status in ('marcado', 'confirmado') order by a.inicio limit 8) a
      left join public.servicos sv on sv.id = a.servico_id), '[]'::jsonb),
    'reservas', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', e.tipo, 'entrada', e.entrada, 'saida_prevista', e.saida_prevista) order by e.entrada)
      from (select * from public.estadias e where e.pet_id = p.id and e.petshop_id = s.id and e.status = 'reservada'
              and e.entrada >= now() - interval '1 day' order by e.entrada limit 8) e), '[]'::jsonb),
    -- vacinas e cuidados vencidos ou vencendo nos próximos 45 dias (o registro mais novo de cada um)
    'saude', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', v.tipo, 'nome', v.nome, 'vence_em', v.vence_em) order by v.vence_em)
      from (select distinct on (lower(h.nome)) h.tipo, h.nome, h.vence_em from public.pets_saude h
              where h.pet_id = p.id and h.petshop_id = s.id
              order by lower(h.nome), h.aplicado_em desc nulls last, h.vence_em desc nulls last) v
      where v.vence_em is not null and v.vence_em <= v_hoje + 45), '[]'::jsonb)
  ) order by p.nome), '[]'::jsonb)
  into v_pets
  from public.pets p where p.cliente_id = l.cliente_id and p.petshop_id = s.id and p.ativo;

  return jsonb_build_object(
    'petshop', jsonb_build_object('nome', s.nome, 'logo', s.logo, 'tema', s.tema, 'telefone', s.telefone, 'cidade', s.cidade, 'uf', s.uf, 'fuso', coalesce(s.fuso, 'America/Sao_Paulo')),
    'tutor', (select split_part(trim(c.nome), ' ', 1) from public.clientes c where c.id = l.cliente_id),
    'hoje', v_hoje,
    'dias_fotos', v_dias,
    'pets', v_pets
  );
end $$;

revoke execute on function public.tutor_dias_fotos(uuid), public.diario_fotos_assinar(uuid, jsonb), public.diario_fotos_para_lixo(),
  public.diario_pode_limpar(text), public.diario_faxina(uuid), public.tutor_frear(uuid, text, int), public.tutor_foto(text, uuid)
  from public, anon, authenticated;
grant execute on function public.diario_fotos_assinar(uuid, jsonb), public.diario_faxina(uuid), public.tutor_dias_fotos(uuid) to authenticated;
-- o bucket confere com o papel de quem pede
grant execute on function public.diario_pode_limpar(text) to authenticated;
-- o servidor da página do tutor só tem a chave pública (anon)
grant execute on function public.tutor_foto(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
