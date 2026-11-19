-- Link do cliente: mais de um serviço no mesmo pedido (ex.: Banho e tosa + Hidratação + Corte de unhas).
--
-- O serviço principal continua em `pedidos_agendamento.servico_id`, do jeito de sempre; os outros ficam em
-- `pedidos_agendamento.outros_servicos` (lista de ids, na ordem que o tutor escolheu). Pedido com um serviço só não tem nada
-- ali e segue igual em tudo. Ao aceitar, vira UM horário com todos os serviços: os outros entram em `agendamento_servicos`
-- (a mesma tabela que a agenda e o Mozart usam para "mais de um serviço no mesmo horário"), cada um com o preço da lista.
--
-- 1. pedidos_agendamento.outros_servicos (uuid[], até 6).
-- 2. link_extras: confere a lista que veio do link (serviços ativos do pet shop, sem creche e hotel, sem repetir).
-- 3. link_horarios: + p_extras. A duração de cada pet é a soma dos serviços.
-- 4. link_pedir: uma versão nova com p_extras (obrigatório, para não haver duas funções que servem à mesma chamada);
--    a de sempre (sem p_extras) passa a chamar a nova. link_pedir_com_termos chama uma ou outra pelos nomes dos argumentos.
-- 5. pedidos_valor_visto: o valor que o tutor viu é a soma dos serviços (promoção só no principal, como na agenda);
--    com mais de um serviço, guarda também cada serviço com o valor dele (`servicos`).
-- 6. pedido_aceitar: os outros serviços entram no horário, com o preço da lista no porte.
-- 7. agendamento_preco_da_tabela: com o porte respondido na hora de aceitar, também os outros serviços sem preço.
-- 8. link_pedido: o nome de todos os serviços ("Banho e tosa + Hidratação"), a lista dos nomes e os ids dos outros.
-- 9. link_pedido_pedir_horario: outra data com a duração de todos os serviços.
--
-- Trocas (cópia fiel da definição mais recente, mais o que está dito):
--   link_horarios (20261145), link_pedir (20261157), pedidos_valor_visto (20261235), pedido_aceitar (20261137),
--   agendamento_preco_da_tabela (20261157), link_pedido (20261235), link_pedido_pedir_horario (20261235).
-- O aplicativo que está no ar continua funcionando: todas as chamadas de antes servem do mesmo jeito.

-- ---------- 1. os outros serviços do pedido ----------
alter table public.pedidos_agendamento
  add column if not exists outros_servicos uuid[] check (outros_servicos is null or cardinality(outros_servicos) <= 6);

-- ---------- 2. a lista que veio do link ----------
-- '[]' ou null: lista vazia. Algo errado (não é lista, id que não é do pet shop, creche, hotel, serviço desligado): null.
create or replace function public.link_extras(p_petshop uuid, p_principal uuid, p_extras jsonb) returns uuid[]
language plpgsql stable security definer set search_path = '' as $$
declare
  v uuid[] := '{}';
  x jsonb;
  v_id uuid;
begin
  if p_extras is null or jsonb_typeof(p_extras) = 'null' then return v; end if;
  if jsonb_typeof(p_extras) <> 'array' or jsonb_array_length(p_extras) > 6 then return null; end if;
  for x in select e from jsonb_array_elements(p_extras) e loop
    if jsonb_typeof(x) <> 'string' or (x #>> '{}') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
    v_id := (x #>> '{}')::uuid;
    if v_id = p_principal or v_id = any (v) then continue; end if;
    if not exists (select 1 from public.servicos s where s.id = v_id and s.petshop_id = p_petshop and s.ativo and s.categoria not in ('creche', 'hotel')) then
      return null;
    end if;
    v := v || v_id;
  end loop;
  return v;
end $$;
revoke execute on function public.link_extras(uuid, uuid, jsonb) from public, anon, authenticated;

-- ---------- 3. horários livres para todos os serviços ----------
drop function if exists public.link_horarios(text, uuid, date, integer);
create function public.link_horarios(p_codigo text, p_servico uuid, p_dia date, p_pets integer default 1, p_extras jsonb default null)
returns setof text
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.petshops;
  v_dur int;
  v_h jsonb;
  v_al jsonb;
  v_abre int;
  v_fecha int;
  v_ai int;
  v_af int;
  m int;
  v_ini timestamptz;
  n int := least(4, greatest(1, coalesce(p_pets, 1)));
  v_extras uuid[];
begin
  select * into v from public.petshops where link_codigo = p_codigo and link_ativo;
  if not found or not public.acesso_liberado(v.id) then return; end if;
  v_extras := public.link_extras(v.id, p_servico, p_extras);
  if v_extras is null then return; end if;
  select duracao_min into v_dur from public.servicos where id = p_servico and petshop_id = v.id and ativo and categoria not in ('creche', 'hotel');
  if not found then return; end if;
  -- cada pet faz todos os serviços, um depois do outro; os pets também vêm um depois do outro
  v_dur := least(1440, v_dur + coalesce((select sum(s.duracao_min) from public.servicos s where s.id = any (v_extras) and s.petshop_id = v.id), 0)::int) * n;
  if p_dia < (now() at time zone v.fuso)::date or p_dia > (now() at time zone v.fuso)::date + 60 then return; end if;
  if public.dia_fechado(v.id, p_dia) then return; end if;
  v_h := v.horario -> (extract(dow from p_dia)::int)::text;
  if v_h is null or jsonb_typeof(v_h) <> 'object' then return; end if;
  v_abre := extract(hour from (v_h ->> 'abre')::time)::int * 60 + extract(minute from (v_h ->> 'abre')::time)::int;
  v_fecha := extract(hour from (v_h ->> 'fecha')::time)::int * 60 + extract(minute from (v_h ->> 'fecha')::time)::int;
  v_al := v_h -> 'almoco';
  if v_al is not null and jsonb_typeof(v_al) = 'object' and (v_al ->> 'de') ~ '^\d{2}:\d{2}' and (v_al ->> 'ate') ~ '^\d{2}:\d{2}' then
    v_ai := left(v_al ->> 'de', 2)::int * 60 + substr(v_al ->> 'de', 4, 2)::int;
    v_af := left(v_al ->> 'ate', 2)::int * 60 + substr(v_al ->> 'ate', 4, 2)::int;
    if not (v_af > v_ai and v_abre < v_ai and v_fecha > v_af) then v_ai := null; end if;
  end if;
  m := v_abre;
  while m + v_dur <= v_fecha loop
    v_ini := (p_dia::timestamp + make_interval(mins => m)) at time zone v.fuso;
    if (v_ai is null or m >= v_af or m + v_dur <= v_ai)
       and v_ini >= now() + interval '2 hours' and public.link_vaga(v.id, v_ini, v_ini + make_interval(mins => v_dur)) then
      return next to_char(m / 60, 'FM00') || ':' || to_char(m % 60, 'FM00');
    end if;
    m := m + 30;
  end loop;
end $$;
revoke execute on function public.link_horarios(text, uuid, date, integer, jsonb) from public;
grant execute on function public.link_horarios(text, uuid, date, integer, jsonb) to anon, authenticated, service_role;

-- ---------- 4. o pedido com os outros serviços ----------
-- p_extras vem antes dos argumentos com valor padrão e não tem padrão: uma chamada sem p_extras só serve à função de
-- sempre (logo abaixo), e uma com p_extras só serve a esta.
create or replace function public.link_pedir(p_codigo text, p_servico uuid, p_dia date, p_hora text, p_tutor text, p_telefone text, p_pet text,
  p_extras jsonb, p_especie text default 'cao', p_porte text default null, p_obs text default null, p_outros jsonb default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.petshops;
  v_fone text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_dur int;
  v_ini timestamptz;
  v_pets jsonb;
  v_grupo uuid;
  v_id uuid;
  v_primeiro uuid;
  n int;
  i int;
  v_p jsonb;
  v_extras uuid[];
begin
  select * into v from public.petshops where link_codigo = p_codigo and link_ativo;
  if not found or not public.acesso_liberado(v.id) then return jsonb_build_object('ok', false, 'erro', 'fechado'); end if;
  v_extras := public.link_extras(v.id, p_servico, p_extras);
  if v_extras is null then return jsonb_build_object('ok', false, 'erro', 'dados'); end if;
  v_pets := jsonb_build_array(jsonb_build_object('nome', p_pet, 'especie', p_especie, 'porte', p_porte))
    || case when jsonb_typeof(p_outros) = 'array' then p_outros else '[]'::jsonb end;
  n := jsonb_array_length(v_pets);
  if n > 4 or char_length(trim(coalesce(p_tutor, ''))) < 2 or char_length(v_fone) not between 10 and 13
     or exists (select 1 from jsonb_array_elements(v_pets) e where jsonb_typeof(e) <> 'object' or char_length(trim(coalesce(e ->> 'nome', ''))) < 1) then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end if;
  if p_hora is null or p_hora !~ '^\d{2}:\d{2}$'
     or not exists (select 1 from public.link_horarios(p_codigo, p_servico, p_dia, n, to_jsonb(v_extras)) h where h = p_hora) then
    return jsonb_build_object('ok', false, 'erro', 'ocupado');
  end if;
  if (select count(*) from public.pedidos_agendamento where petshop_id = v.id and telefone = v_fone and status = 'pendente') + n > 6
     or (select count(*) from public.pedidos_agendamento where petshop_id = v.id and criado_em > now() - interval '1 day') >= 60 then
    return jsonb_build_object('ok', false, 'erro', 'limite');
  end if;
  select duracao_min into v_dur from public.servicos where id = p_servico and petshop_id = v.id;
  v_dur := least(1440, v_dur + coalesce((select sum(s.duracao_min) from public.servicos s where s.id = any (v_extras) and s.petshop_id = v.id), 0)::int);
  v_ini := (p_dia::timestamp + p_hora::time) at time zone v.fuso;
  if n > 1 then v_grupo := gen_random_uuid(); end if;
  for i in 0 .. n - 1 loop
    v_p := v_pets -> i;
    insert into public.pedidos_agendamento (petshop_id, tutor_nome, telefone, pet_nome, especie, porte, servico_id, outros_servicos, inicio, fim, obs, grupo_id)
    values (v.id, left(trim(p_tutor), 120), v_fone, left(trim(v_p ->> 'nome'), 80),
      case when v_p ->> 'especie' in ('cao', 'gato', 'outro') then v_p ->> 'especie' else 'cao' end,
      case when v_p ->> 'porte' in ('P', 'M', 'G', 'GG') then v_p ->> 'porte' else null end,
      p_servico, nullif(v_extras, '{}'), v_ini + make_interval(mins => v_dur * i), v_ini + make_interval(mins => v_dur * (i + 1)),
      nullif(left(trim(coalesce(p_obs, '')), 300), ''), v_grupo)
    returning id into v_id;
    if i = 0 then v_primeiro := v_id; end if;
  end loop;
  return jsonb_build_object('ok', true, 'pets', n, 'id', v_primeiro);
end $$;
revoke execute on function public.link_pedir(text, uuid, date, text, text, text, text, jsonb, text, text, text, jsonb) from public, anon, authenticated;

-- a de sempre: um serviço só
create or replace function public.link_pedir(p_codigo text, p_servico uuid, p_dia date, p_hora text, p_tutor text, p_telefone text, p_pet text,
  p_especie text default 'cao', p_porte text default null, p_obs text default null, p_outros jsonb default null)
returns jsonb
language sql security definer set search_path = '' as $$
  select public.link_pedir(p_codigo => p_codigo, p_servico => p_servico, p_dia => p_dia, p_hora => p_hora, p_tutor => p_tutor,
    p_telefone => p_telefone, p_pet => p_pet, p_extras => null::jsonb, p_especie => p_especie, p_porte => p_porte, p_obs => p_obs, p_outros => p_outros)
$$;
revoke execute on function public.link_pedir(text, uuid, date, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;

-- ---------- 5. o valor que o tutor viu: a soma dos serviços ----------
create or replace function public.pedidos_valor_visto() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s record; v_base numeric; v_min numeric; v_max numeric; v jsonb;
  v_ids uuid[]; i int; v_desc numeric; v_desc_min numeric; v_desc_max numeric;
  v_certo boolean := true; v_lista jsonb := '[]'::jsonb;
  t_base_de numeric := 0; t_base_ate numeric := 0; t_de numeric := 0; t_ate numeric := 0;
begin
  begin
    if new.tipo <> 'servico' or new.servico_id is null then return null; end if;
    v_ids := array[new.servico_id] || coalesce(new.outros_servicos, '{}'::uuid[]);
    for i in 1 .. cardinality(v_ids) loop
      select x.nome, x.preco_p, x.preco_m, x.preco_g, x.preco_gg into s from public.servicos x where x.id = v_ids[i] and x.petshop_id = new.petshop_id;
      if not found then return null; end if;
      select min(y), max(y) into v_min, v_max from unnest(array[s.preco_p, s.preco_m, s.preco_g, s.preco_gg]) y where y is not null;
      -- um serviço sem preço: o pedido todo fica "a combinar" (sem valor guardado), como um serviço sozinho sem preço
      if v_min is null then return null; end if;
      v_base := case new.porte when 'P' then s.preco_p when 'M' then s.preco_m when 'G' then s.preco_g when 'GG' then s.preco_gg end;
      if v_base is null and v_min = v_max then v_base := v_min; end if;
      -- a promoção do horário vale para o serviço principal (como no horário da agenda)
      if v_base is not null then
        v_desc := case when i = 1 then public.promo_desconto_no_preco(new.promo, v_base) else 0 end;
        v_lista := v_lista || jsonb_build_object('nome', s.nome, 'base', v_base, 'valor', v_base - v_desc);
        t_base_de := t_base_de + v_base; t_base_ate := t_base_ate + v_base;
        t_de := t_de + v_base - v_desc; t_ate := t_ate + v_base - v_desc;
      else
        v_certo := false;
        v_desc_min := case when i = 1 then public.promo_desconto_no_preco(new.promo, v_min) else 0 end;
        v_desc_max := case when i = 1 then public.promo_desconto_no_preco(new.promo, v_max) else 0 end;
        v_lista := v_lista || jsonb_build_object('nome', s.nome, 'base_de', v_min, 'base_ate', v_max, 'de', v_min - v_desc_min, 'ate', v_max - v_desc_max);
        t_base_de := t_base_de + v_min; t_base_ate := t_base_ate + v_max;
        t_de := t_de + v_min - v_desc_min; t_ate := t_ate + v_max - v_desc_max;
      end if;
    end loop;
    v := jsonb_build_object('tipo', 'servico', 'porte', new.porte);
    if v_certo then
      v := v || jsonb_build_object('base', t_base_de, 'valor', t_de);
    else
      v := v || jsonb_build_object('base_de', t_base_de, 'base_ate', t_base_ate, 'de', t_de, 'ate', t_ate);
    end if;
    if cardinality(v_ids) > 1 then v := v || jsonb_build_object('servicos', v_lista); end if;
    if new.promo is not null then
      v := v || jsonb_build_object('promo', jsonb_build_object('nome', new.promo ->> 'nome', 'tipo', new.promo ->> 'tipo', 'valor', new.promo -> 'valor'));
    end if;
    insert into public.pedidos_valores (pedido_id, petshop_id, visto) values (new.id, new.petshop_id, v) on conflict (pedido_id) do nothing;
  exception when others then
    -- o valor guardado é um apoio: nunca derruba o pedido
    raise warning 'pedidos_valor_visto: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.pedidos_valor_visto() from public, anon, authenticated;

-- ---------- 6. aceitar: um horário com todos os serviços ----------
create or replace function public.pedido_aceitar(p_id uuid, p_profissional uuid default null, p_forcar boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v public.pedidos_agendamento;
  s public.petshops;
  v_cliente uuid;
  v_pet uuid;
  v_porte text;
  v_preco numeric(10, 2);
  v_ag uuid;
  v_de date; v_ate date; v_hoje date; v_vagas int; v_cheio date; v_outra public.estadias;
begin
  select * into v from public.pedidos_agendamento where id = p_id for update;
  if not found or v.petshop_id not in (select public.meus_petshops()) then raise exception 'Pedido não encontrado.'; end if;
  if not public.acesso_liberado(v.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if v.status <> 'pendente' then raise exception 'Esse pedido já foi respondido.'; end if;
  if p_profissional is not null and not exists (select 1 from public.profissionais where id = p_profissional and petshop_id = v.petshop_id) then
    raise exception 'Profissional inválido.';
  end if;
  select * into s from public.petshops where id = v.petshop_id;

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

  if v.tipo in ('creche', 'hotel') then
    v_hoje := (now() at time zone s.fuso)::date;
    v_de := (v.inicio at time zone s.fuso)::date;
    v_ate := (v.fim at time zone s.fuso)::date;
    select * into v_outra from public.estadias e
      where e.pet_id = v_pet and e.status in ('reservada', 'em_casa')
        and (e.entrada at time zone s.fuso)::date <= v_ate
        and coalesce((e.saida_prevista at time zone s.fuso)::date, case when e.status = 'em_casa' then v_ate else (e.entrada at time zone s.fuso)::date end) >= v_de
      limit 1;
    if found then
      raise exception '% já tem % de % a % nessas datas. Recuse este pedido ou mude a outra reserva antes.', v.pet_nome,
        case when v_outra.status = 'em_casa' then 'estadia' else 'reserva' end,
        to_char(v_outra.entrada at time zone s.fuso, 'DD/MM'), coalesce(to_char(v_outra.saida_prevista at time zone s.fuso, 'DD/MM'), 'sem saída marcada');
    end if;
    v_vagas := case v.tipo when 'creche' then s.vagas_creche else s.vagas_hotel end;
    if v_vagas is not null and not coalesce(p_forcar, false) then
      select min(d::date) into v_cheio from generate_series(v_de, case when v.tipo = 'hotel' then v_ate - 1 else v_ate end, interval '1 day') d
        where (select count(*) from public.estadias e where e.petshop_id = s.id and e.tipo = v.tipo and e.status in ('reservada', 'em_casa')
                 and public.estadia_ocupa(e.tipo, e.status, (e.entrada at time zone s.fuso)::date, (e.saida_prevista at time zone s.fuso)::date, d::date, v_hoje))
              + (case when v.tipo = 'creche' then public.creche_planos_ocupam(s.id, d::date, v_hoje) else 0 end) >= v_vagas;
      if v_cheio is not null then
        raise exception 'CASA_CHEIA: em % a % já está com as % vagas ocupadas.', to_char(v_cheio, 'DD/MM'), case v.tipo when 'creche' then 'creche' else 'casa do hotel' end, v_vagas;
      end if;
    end if;
    insert into public.estadias (petshop_id, pet_id, tipo, entrada, saida_prevista, valor_diaria, status, obs)
      values (v.petshop_id, v_pet, v.tipo, v.inicio, v.fim, case v.tipo when 'creche' then s.diaria_creche else s.diaria_hotel end, 'reservada', v.obs)
      returning id into v_ag;
    update public.pedidos_agendamento set status = 'aceito', estadia_id = v_ag where id = p_id;
    return v_ag;
  end if;

  select case coalesce(v_porte, v.porte) when 'P' then preco_p when 'M' then preco_m when 'G' then preco_g when 'GG' then preco_gg else null end
    into v_preco from public.servicos where id = v.servico_id;
  insert into public.agendamentos (petshop_id, pet_id, servico_id, profissional_id, inicio, fim, preco, obs, origem, criado_por)
    values (v.petshop_id, v_pet, v.servico_id, p_profissional, v.inicio, v.fim, v_preco, v.obs, 'link', (select auth.uid()))
    returning id into v_ag;
  -- os outros serviços do pedido entram no mesmo horário, cada um com o preço da lista no porte (a mesma regra do principal)
  if cardinality(coalesce(v.outros_servicos, '{}'::uuid[])) > 0 then
    insert into public.agendamento_servicos (petshop_id, agendamento_id, servico_id, preco, ordem)
    select v.petshop_id, v_ag, x.id,
        case coalesce(v_porte, v.porte) when 'P' then x.preco_p when 'M' then x.preco_m when 'G' then x.preco_g when 'GG' then x.preco_gg else null end,
        t.ordem::smallint
      from unnest(v.outros_servicos) with ordinality t(id, ordem)
      join public.servicos x on x.id = t.id and x.petshop_id = v.petshop_id
      where x.id is distinct from v.servico_id
      order by t.ordem
    on conflict (agendamento_id, servico_id) do nothing;
  end if;
  update public.pedidos_agendamento set status = 'aceito', agendamento_id = v_ag where id = p_id;
  return v_ag;
end $$;
revoke execute on function public.pedido_aceitar(uuid, uuid, boolean) from public, anon;
grant execute on function public.pedido_aceitar(uuid, uuid, boolean) to authenticated;

-- ---------- 7. o porte respondido na hora de aceitar: o preço de todos os serviços ----------
create or replace function public.agendamento_preco_da_tabela(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  a public.agendamentos;
  s public.servicos;
  v_porte text;
  v_preco numeric;
  v_outros int := 0;
  v_mudou boolean := false;
begin
  select * into a from public.agendamentos x where x.id = p_id;
  if not found or not public.tenho_area(a.petshop_id, array['agenda']) or not public.acesso_liberado(a.petshop_id) then
    return false;
  end if;
  select x.porte into v_porte from public.pets x where x.id = a.pet_id and x.petshop_id = a.petshop_id;
  if v_porte is null then return false; end if;
  -- os outros serviços do horário que estão sem preço
  update public.agendamento_servicos o
     set preco = case v_porte when 'P' then x.preco_p when 'M' then x.preco_m when 'G' then x.preco_g when 'GG' then x.preco_gg end
    from public.servicos x
   where o.agendamento_id = a.id and o.petshop_id = a.petshop_id and o.preco is null and x.id = o.servico_id and x.petshop_id = a.petshop_id
     and (case v_porte when 'P' then x.preco_p when 'M' then x.preco_m when 'G' then x.preco_g when 'GG' then x.preco_gg end) is not null;
  get diagnostics v_outros = row_count;
  if a.preco is null then
    select * into s from public.servicos x where x.id = a.servico_id and x.petshop_id = a.petshop_id;
    if s.id is not null then
      v_preco := case v_porte when 'P' then s.preco_p when 'M' then s.preco_m when 'G' then s.preco_g when 'GG' then s.preco_gg end;
      if v_preco is not null then
        update public.agendamentos x set preco = v_preco where x.id = a.id and x.preco is null;
        v_mudou := found;
      end if;
    end if;
  end if;
  return v_mudou or v_outros > 0;
end $$;
revoke execute on function public.agendamento_preco_da_tabela(uuid) from public, anon;
grant execute on function public.agendamento_preco_da_tabela(uuid) to authenticated;

-- ---------- 8. a página do pedido: todos os serviços ----------
create or replace function public.link_pedido(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'petshop', s.nome, 'telefone', s.telefone, 'codigo', s.link_codigo, 'tutor', split_part(p.tutor_nome, ' ', 1),
    'logo', s.logo, 'tema', s.tema,
    'endereco', s.endereco, 'bairro', s.bairro, 'complemento', s.complemento, 'cidade', s.cidade, 'uf', s.uf,
    'itens', (
      select jsonb_agg(jsonb_build_object(
        'pet', x.pet_nome,
        'servico', case x.tipo when 'creche' then 'Creche' when 'hotel' then 'Hotel'
                   else nullif(concat_ws(' + ', sv.nome, (select string_agg(o.nome, ' + ' order by t.ordem)
                     from unnest(x.outros_servicos) with ordinality t(id, ordem) join public.servicos o on o.id = t.id and o.petshop_id = x.petshop_id)), '') end,
        'servico_id', case when x.tipo = 'servico' then x.servico_id end,
        -- com mais de um serviço: os nomes, um por um, e os ids dos outros (para pedir outra data com a duração de todos)
        'servicos', case when x.tipo = 'servico' and cardinality(coalesce(x.outros_servicos, '{}'::uuid[])) > 0 then
                      (select jsonb_agg(n.nome order by n.ordem) from (
                         select sv.nome, 0::bigint as ordem where sv.nome is not null
                         union all
                         select o.nome, t.ordem from unnest(x.outros_servicos) with ordinality t(id, ordem) join public.servicos o on o.id = t.id and o.petshop_id = x.petshop_id
                       ) n) end,
        'extras', case when x.tipo = 'servico' and cardinality(coalesce(x.outros_servicos, '{}'::uuid[])) > 0 then to_jsonb(x.outros_servicos) end,
        'tipo', x.tipo,
        'dia', to_char(coalesce(a.inicio, e.entrada, x.inicio) at time zone s.fuso, 'YYYY-MM-DD'),
        'hora', to_char(coalesce(a.inicio, x.inicio) at time zone s.fuso, 'HH24:MI'),
        'ate', case when x.tipo <> 'servico' then to_char(coalesce(e.saida_prevista, x.fim) at time zone s.fuso, 'YYYY-MM-DD') else null end,
        'ate_hora', case when x.tipo <> 'servico' then to_char(coalesce(e.saida_prevista, x.fim) at time zone s.fuso, 'HH24:MI') else null end,
        'hora_fim', case when x.tipo = 'servico' then to_char(coalesce(a.fim, x.fim) at time zone s.fuso, 'HH24:MI') else null end,
        'inicio', coalesce(a.inicio, e.entrada, x.inicio),
        'fim', coalesce(a.fim, e.saida_prevista, x.fim),
        'valor', (select pv.visto from public.pedidos_valores pv where pv.pedido_id = x.id),
        'status', case
          when x.status = 'aceito' and (a.status in ('cancelado', 'faltou') or e.status = 'cancelada') then 'cancelado'
          when x.status = 'aceito' and (a.status = 'concluido' or e.status = 'encerrada') then 'concluido'
          else x.status end
      ) order by x.inicio)
      from public.pedidos_agendamento x
      left join public.servicos sv on sv.id = x.servico_id
      left join public.agendamentos a on a.id = x.agendamento_id
      left join public.estadias e on e.id = x.estadia_id
      where x.id = p.id or (p.grupo_id is not null and x.grupo_id = p.grupo_id)
    )
  )
  from public.pedidos_agendamento p join public.petshops s on s.id = p.petshop_id
  where p.id = p_id
$$;

-- ---------- 9. outra data com a duração de todos os serviços ----------
create or replace function public.link_pedido_pedir_horario(p_id uuid, p_dia date, p_hora text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.pedidos_agendamento; s public.petshops; n int; v_recado text;
begin
  select * into p from public.pedidos_agendamento where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'erro', 'nao_achei'); end if;
  if p.tipo <> 'servico' or p.servico_id is null then return jsonb_build_object('ok', false, 'erro', 'fechado'); end if;
  select * into s from public.petshops where id = p.petshop_id;
  select count(*) into n from public.link_pedido_itens(p_id) t where t.estado in ('pendente', 'ativo');
  if n = 0 then return jsonb_build_object('ok', false, 'erro', 'fechado'); end if;
  if p_dia is null or coalesce(p_hora, '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
     or not exists (select 1 from public.link_horarios(s.link_codigo, p.servico_id, p_dia, n, to_jsonb(coalesce(p.outros_servicos, '{}'::uuid[]))) h where h = p_hora) then
    return jsonb_build_object('ok', false, 'erro', 'ocupado');
  end if;
  v_recado := 'Quero mudar para ' || (array['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'])[extract(dow from p_dia)::int + 1]
    || ', ' || to_char(p_dia, 'DD/MM') || ', às ' || p_hora || ' (horário que estava livre no link).';
  return public.link_pedido_pedir_mudanca(p_id, v_recado) || jsonb_build_object('recado', v_recado);
end $$;
