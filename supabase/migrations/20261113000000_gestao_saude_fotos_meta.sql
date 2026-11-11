-- Ficha de saúde do pet, fotos de antes e depois, aviso de pet pronto, meta do mês,
-- série de bloqueios e pedido pelo link com mais de um pet.

alter table public.bloqueios add column serie_id uuid;
create index on public.bloqueios (serie_id) where serie_id is not null;

alter table public.agendamentos
  add column foto_antes text,
  add column foto_depois text,
  add column pronto_avisado_em timestamptz;

alter table public.petshops add column meta_mes numeric(10, 2) check (meta_mes is null or meta_mes >= 0);
grant update (meta_mes) on public.petshops to authenticated;

-- ============================================================
-- Saúde do pet: vacina, vermífugo, antipulgas e outros cuidados com data de vencimento
-- ============================================================
create table public.pets_saude (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null,
  pet_id uuid not null,
  tipo text not null default 'vacina' check (tipo in ('vacina', 'vermifugo', 'antipulgas', 'outro')),
  nome text not null check (char_length(nome) between 1 and 80),
  aplicado_em date,
  vence_em date,
  obs text check (char_length(obs) <= 300),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (id, petshop_id),
  foreign key (pet_id, petshop_id) references public.pets (id, petshop_id) on delete cascade
);
create index on public.pets_saude (petshop_id, vence_em);
create index on public.pets_saude (pet_id);
alter table public.pets_saude enable row level security;
create policy pets_saude_ler on public.pets_saude for select to authenticated using (petshop_id in (select public.meus_petshops()));
create policy pets_saude_criar on public.pets_saude for insert to authenticated with check (petshop_id in (select public.meus_petshops()) and (select public.acesso_liberado(petshop_id)));
create policy pets_saude_editar on public.pets_saude for update to authenticated
  using (petshop_id in (select public.meus_petshops()) and (select public.acesso_liberado(petshop_id))) with check (petshop_id in (select public.meus_petshops()));
create policy pets_saude_remover on public.pets_saude for delete to authenticated
  using (petshop_id in (select public.meus_petshops()) and (select public.acesso_liberado(petshop_id)));

-- ============================================================
-- Link de agendamento: mais de um pet no mesmo pedido (um horário atrás do outro)
-- ============================================================
alter table public.pedidos_agendamento add column grupo_id uuid;

drop function public.link_pedir(text, uuid, date, text, text, text, text, text, text, text);
drop function public.link_horarios(text, uuid, date);

-- `p_pets` = quantos pets vêm juntos (1 a 4): o horário precisa caber todos, um depois do outro.
create function public.link_horarios(p_codigo text, p_servico uuid, p_dia date, p_pets int default 1) returns setof text
language plpgsql stable security definer set search_path = '' as $$
declare
  v public.petshops;
  v_dur int;
  v_h jsonb;
  v_abre int;
  v_fecha int;
  m int;
  v_ini timestamptz;
  n int := least(4, greatest(1, coalesce(p_pets, 1)));
begin
  select * into v from public.petshops where link_codigo = p_codigo and link_ativo;
  if not found or not public.acesso_liberado(v.id) then return; end if;
  select duracao_min * n into v_dur from public.servicos where id = p_servico and petshop_id = v.id and ativo and categoria not in ('creche', 'hotel');
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

-- `p_outros` = outros pets do mesmo tutor: [{"nome": "...", "especie": "cao", "porte": "P"}] (até 3).
create function public.link_pedir(
  p_codigo text, p_servico uuid, p_dia date, p_hora text, p_tutor text, p_telefone text, p_pet text,
  p_especie text default 'cao', p_porte text default null, p_obs text default null, p_outros jsonb default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.petshops;
  v_fone text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_dur int;
  v_ini timestamptz;
  v_pets jsonb;
  v_grupo uuid;
  n int;
  i int;
  v_p jsonb;
begin
  select * into v from public.petshops where link_codigo = p_codigo and link_ativo;
  if not found or not public.acesso_liberado(v.id) then return jsonb_build_object('ok', false, 'erro', 'fechado'); end if;
  v_pets := jsonb_build_array(jsonb_build_object('nome', p_pet, 'especie', p_especie, 'porte', p_porte))
    || case when jsonb_typeof(p_outros) = 'array' then p_outros else '[]'::jsonb end;
  n := jsonb_array_length(v_pets);
  if n > 4 or char_length(trim(coalesce(p_tutor, ''))) < 2 or char_length(v_fone) not between 10 and 13
     or exists (select 1 from jsonb_array_elements(v_pets) e where jsonb_typeof(e) <> 'object' or char_length(trim(coalesce(e ->> 'nome', ''))) < 1) then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end if;
  if p_hora is null or p_hora !~ '^\d{2}:\d{2}$' or not exists (select 1 from public.link_horarios(p_codigo, p_servico, p_dia, n) h where h = p_hora) then
    return jsonb_build_object('ok', false, 'erro', 'ocupado');
  end if;
  if (select count(*) from public.pedidos_agendamento where petshop_id = v.id and telefone = v_fone and status = 'pendente') + n > 6
     or (select count(*) from public.pedidos_agendamento where petshop_id = v.id and criado_em > now() - interval '1 day') >= 60 then
    return jsonb_build_object('ok', false, 'erro', 'limite');
  end if;
  select duracao_min into v_dur from public.servicos where id = p_servico and petshop_id = v.id;
  v_ini := (p_dia::timestamp + p_hora::time) at time zone v.fuso;
  if n > 1 then v_grupo := gen_random_uuid(); end if;
  for i in 0 .. n - 1 loop
    v_p := v_pets -> i;
    insert into public.pedidos_agendamento (petshop_id, tutor_nome, telefone, pet_nome, especie, porte, servico_id, inicio, fim, obs, grupo_id)
    values (v.id, left(trim(p_tutor), 120), v_fone, left(trim(v_p ->> 'nome'), 80),
      case when v_p ->> 'especie' in ('cao', 'gato', 'outro') then v_p ->> 'especie' else 'cao' end,
      case when v_p ->> 'porte' in ('P', 'M', 'G', 'GG') then v_p ->> 'porte' else null end,
      p_servico, v_ini + make_interval(mins => v_dur * i), v_ini + make_interval(mins => v_dur * (i + 1)),
      nullif(left(trim(coalesce(p_obs, '')), 300), ''), v_grupo);
  end loop;
  return jsonb_build_object('ok', true, 'pets', n);
end $$;

revoke execute on function public.link_horarios(text, uuid, date, int),
  public.link_pedir(text, uuid, date, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.link_horarios(text, uuid, date, int),
  public.link_pedir(text, uuid, date, text, text, text, text, text, text, text, jsonb) to anon, authenticated;
