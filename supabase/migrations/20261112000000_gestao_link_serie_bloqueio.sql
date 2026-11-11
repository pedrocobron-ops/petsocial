-- Link de agendamento para o tutor, horários que se repetem e bloqueio de horário.

-- ============================================================
-- Agendamento que se repete: os horários da mesma série dividem um `serie_id`
-- ============================================================
alter table public.agendamentos add column serie_id uuid;
create index on public.agendamentos (serie_id) where serie_id is not null;

-- itens de uma venda ou comanda (produto, quantidade, valor), para consultar depois
alter table public.lancamentos add column itens jsonb;

-- ============================================================
-- Bloqueio de horário (almoço, folga, feriado). Sem profissional = vale para o pet shop inteiro.
-- ============================================================
create table public.bloqueios (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  profissional_id uuid,
  inicio timestamptz not null,
  fim timestamptz not null,
  motivo text check (char_length(motivo) <= 80),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  check (fim > inicio),
  unique (id, petshop_id),
  foreign key (profissional_id, petshop_id) references public.profissionais (id, petshop_id) on delete cascade
);
create index on public.bloqueios (petshop_id, inicio);
alter table public.bloqueios enable row level security;

-- ============================================================
-- Link de agendamento: o tutor pede um horário; a equipe aceita ou recusa
-- ============================================================
alter table public.petshops
  add column link_codigo text not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  add column link_ativo boolean not null default false,
  add column link_aviso text check (char_length(link_aviso) <= 240);
alter table public.petshops add constraint petshops_link_codigo_key unique (link_codigo);
grant update (link_ativo, link_aviso) on public.petshops to authenticated;

create table public.pedidos_agendamento (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  tutor_nome text not null check (char_length(tutor_nome) between 2 and 120),
  telefone text not null check (char_length(telefone) between 8 and 20),
  pet_nome text not null check (char_length(pet_nome) between 1 and 80),
  especie text not null default 'cao' check (especie in ('cao', 'gato', 'outro')),
  porte text check (porte in ('P', 'M', 'G', 'GG')),
  servico_id uuid,
  inicio timestamptz not null,
  fim timestamptz not null,
  obs text check (char_length(obs) <= 300),
  status text not null default 'pendente' check (status in ('pendente', 'aceito', 'recusado')),
  agendamento_id uuid,
  criado_em timestamptz not null default now(),
  check (fim > inicio),
  unique (id, petshop_id),
  foreign key (servico_id, petshop_id) references public.servicos (id, petshop_id) on delete set null (servico_id),
  foreign key (agendamento_id, petshop_id) references public.agendamentos (id, petshop_id) on delete set null (agendamento_id)
);
create index on public.pedidos_agendamento (petshop_id, status, inicio);
alter table public.pedidos_agendamento enable row level security;

-- a equipe lê, recusa e apaga; quem cria é só a função pública (link_pedir)
create policy pedidos_agendamento_ler on public.pedidos_agendamento for select to authenticated using (petshop_id in (select public.meus_petshops()));
create policy pedidos_agendamento_editar on public.pedidos_agendamento for update to authenticated
  using (petshop_id in (select public.meus_petshops()) and (select public.acesso_liberado(petshop_id))) with check (petshop_id in (select public.meus_petshops()));
create policy pedidos_agendamento_remover on public.pedidos_agendamento for delete to authenticated
  using (petshop_id in (select public.meus_petshops()) and (select public.acesso_liberado(petshop_id)));
revoke insert, update on public.pedidos_agendamento from anon, authenticated;
grant update (status) on public.pedidos_agendamento to authenticated;

create policy bloqueios_ler on public.bloqueios for select to authenticated using (petshop_id in (select public.meus_petshops()));
create policy bloqueios_criar on public.bloqueios for insert to authenticated with check (petshop_id in (select public.meus_petshops()) and (select public.acesso_liberado(petshop_id)));
create policy bloqueios_editar on public.bloqueios for update to authenticated
  using (petshop_id in (select public.meus_petshops()) and (select public.acesso_liberado(petshop_id))) with check (petshop_id in (select public.meus_petshops()));
create policy bloqueios_remover on public.bloqueios for delete to authenticated
  using (petshop_id in (select public.meus_petshops()) and (select public.acesso_liberado(petshop_id)));

-- Há vaga nesse intervalo? Conta atendimentos, pedidos pendentes e bloqueios contra o número de pessoas que atendem.
create function public.link_vaga(p_petshop uuid, p_inicio timestamptz, p_fim timestamptz) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cap int;
  v_ocupados int;
begin
  if exists (select 1 from public.bloqueios where petshop_id = p_petshop and profissional_id is null and inicio < p_fim and fim > p_inicio) then
    return false;
  end if;
  select greatest(1, count(*)) into v_cap from public.profissionais where petshop_id = p_petshop and ativo and atende;
  select
    (select count(*) from public.agendamentos where petshop_id = p_petshop and status not in ('cancelado', 'faltou') and inicio < p_fim and fim > p_inicio)
    + (select count(*) from public.pedidos_agendamento where petshop_id = p_petshop and status = 'pendente' and inicio < p_fim and fim > p_inicio)
    + (select count(distinct profissional_id) from public.bloqueios where petshop_id = p_petshop and profissional_id is not null and inicio < p_fim and fim > p_inicio)
  into v_ocupados;
  return v_ocupados < v_cap;
end $$;

-- O que a página pública mostra: nome, contato, horário e serviços. Só com o link ligado e a conta em dia.
create function public.link_info(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'nome', p.nome, 'telefone', p.telefone, 'cidade', p.cidade, 'uf', p.uf, 'horario', p.horario, 'aviso', p.link_aviso,
    'hoje', (now() at time zone p.fuso)::date,
    'servicos', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'duracao_min', s.duracao_min, 'cor', s.cor,
        'preco_p', s.preco_p, 'preco_m', s.preco_m, 'preco_g', s.preco_g, 'preco_gg', s.preco_gg) order by s.ordem, s.nome)
      from public.servicos s where s.petshop_id = p.id and s.ativo and s.categoria not in ('creche', 'hotel')
    ), '[]'::jsonb)
  )
  from public.petshops p
  where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)
$$;

-- Horários de início livres num dia (de meia em meia hora), no fuso do pet shop.
create function public.link_horarios(p_codigo text, p_servico uuid, p_dia date) returns setof text
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.petshops;
  v_dur int;
  v_h jsonb;
  v_abre int;
  v_fecha int;
  m int;
  v_ini timestamptz;
begin
  select * into v from public.petshops where link_codigo = p_codigo and link_ativo;
  if not found or not public.acesso_liberado(v.id) then return; end if;
  select duracao_min into v_dur from public.servicos where id = p_servico and petshop_id = v.id and ativo and categoria not in ('creche', 'hotel');
  if not found then return; end if;
  if p_dia < (now() at time zone v.fuso)::date or p_dia > (now() at time zone v.fuso)::date + 60 then return; end if;
  v_h := v.horario -> (extract(dow from p_dia)::int)::text;
  if v_h is null or jsonb_typeof(v_h) <> 'object' then return; end if;
  v_abre := extract(hour from (v_h ->> 'abre')::time)::int * 60 + extract(minute from (v_h ->> 'abre')::time)::int;
  v_fecha := extract(hour from (v_h ->> 'fecha')::time)::int * 60 + extract(minute from (v_h ->> 'fecha')::time)::int;
  m := v_abre;
  while m + v_dur <= v_fecha loop
    v_ini := (p_dia::timestamp + make_interval(mins => m)) at time zone v.fuso;
    if v_ini >= now() + interval '2 hours' and public.link_vaga(v.id, v_ini, v_ini + make_interval(mins => v_dur)) then
      return next to_char(m / 60, 'FM00') || ':' || to_char(m % 60, 'FM00');
    end if;
    m := m + 30;
  end loop;
end $$;

-- O tutor pede o horário. Confere tudo de novo no servidor e limita pedidos repetidos.
create function public.link_pedir(
  p_codigo text, p_servico uuid, p_dia date, p_hora text, p_tutor text, p_telefone text, p_pet text,
  p_especie text default 'cao', p_porte text default null, p_obs text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.petshops;
  v_fone text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_dur int;
  v_ini timestamptz;
begin
  select * into v from public.petshops where link_codigo = p_codigo and link_ativo;
  if not found or not public.acesso_liberado(v.id) then return jsonb_build_object('ok', false, 'erro', 'fechado'); end if;
  if char_length(trim(coalesce(p_tutor, ''))) < 2 or char_length(trim(coalesce(p_pet, ''))) < 1 or char_length(v_fone) not between 10 and 13 then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end if;
  if p_hora is null or p_hora !~ '^\d{2}:\d{2}$' or not exists (select 1 from public.link_horarios(p_codigo, p_servico, p_dia) h where h = p_hora) then
    return jsonb_build_object('ok', false, 'erro', 'ocupado');
  end if;
  if (select count(*) from public.pedidos_agendamento where petshop_id = v.id and telefone = v_fone and status = 'pendente') >= 3
     or (select count(*) from public.pedidos_agendamento where petshop_id = v.id and criado_em > now() - interval '1 day') >= 60 then
    return jsonb_build_object('ok', false, 'erro', 'limite');
  end if;
  select duracao_min into v_dur from public.servicos where id = p_servico and petshop_id = v.id;
  v_ini := (p_dia::timestamp + p_hora::time) at time zone v.fuso;
  insert into public.pedidos_agendamento (petshop_id, tutor_nome, telefone, pet_nome, especie, porte, servico_id, inicio, fim, obs)
  values (v.id, left(trim(p_tutor), 120), v_fone, left(trim(p_pet), 80),
    case when p_especie in ('cao', 'gato', 'outro') then p_especie else 'cao' end,
    case when p_porte in ('P', 'M', 'G', 'GG') then p_porte else null end,
    p_servico, v_ini, v_ini + make_interval(mins => v_dur), nullif(left(trim(coalesce(p_obs, '')), 300), ''));
  return jsonb_build_object('ok', true);
end $$;

-- A equipe aceita: acha (ou cadastra) o tutor pelo telefone e o pet pelo nome, e marca o horário.
create function public.pedido_aceitar(p_id uuid, p_profissional uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v public.pedidos_agendamento;
  v_cliente uuid;
  v_pet uuid;
  v_porte text;
  v_preco numeric(10, 2);
  v_ag uuid;
begin
  select * into v from public.pedidos_agendamento where id = p_id for update;
  if not found or v.petshop_id not in (select public.meus_petshops()) then raise exception 'Pedido não encontrado.'; end if;
  if not public.acesso_liberado(v.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if v.status <> 'pendente' then raise exception 'Esse pedido já foi respondido.'; end if;
  if p_profissional is not null and not exists (select 1 from public.profissionais where id = p_profissional and petshop_id = v.petshop_id) then
    raise exception 'Profissional inválido.';
  end if;

  select id into v_cliente from public.clientes
    where petshop_id = v.petshop_id and right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8) = right(v.telefone, 8)
    order by criado_em limit 1;
  if v_cliente is null then
    insert into public.clientes (petshop_id, nome, telefone) values (v.petshop_id, v.tutor_nome, v.telefone) returning id into v_cliente;
  end if;
  select id, porte into v_pet, v_porte from public.pets
    where petshop_id = v.petshop_id and cliente_id = v_cliente and lower(trim(nome)) = lower(trim(v.pet_nome)) order by criado_em limit 1;
  if v_pet is null then
    insert into public.pets (petshop_id, cliente_id, nome, especie, porte) values (v.petshop_id, v_cliente, v.pet_nome, v.especie, v.porte)
      returning id, porte into v_pet, v_porte;
  end if;
  select case coalesce(v_porte, v.porte) when 'P' then preco_p when 'M' then preco_m when 'G' then preco_g when 'GG' then preco_gg else null end
    into v_preco from public.servicos where id = v.servico_id;
  insert into public.agendamentos (petshop_id, pet_id, servico_id, profissional_id, inicio, fim, preco, obs, origem, criado_por)
    values (v.petshop_id, v_pet, v.servico_id, p_profissional, v.inicio, v.fim, v_preco, v.obs, 'link', (select auth.uid()))
    returning id into v_ag;
  update public.pedidos_agendamento set status = 'aceito', agendamento_id = v_ag where id = p_id;
  return v_ag;
end $$;

revoke execute on function
  public.link_vaga(uuid, timestamptz, timestamptz), public.link_info(text), public.link_horarios(text, uuid, date),
  public.link_pedir(text, uuid, date, text, text, text, text, text, text, text), public.pedido_aceitar(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.link_info(text), public.link_horarios(text, uuid, date),
  public.link_pedir(text, uuid, date, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.pedido_aceitar(uuid, uuid) to authenticated;
