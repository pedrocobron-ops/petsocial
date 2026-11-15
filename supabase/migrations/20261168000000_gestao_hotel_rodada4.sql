-- Hotel, rodada 4 de consertos. Só acrescenta: uma tabela nova, duas colunas novas na lista de espera e funções.
-- As funções trocadas mantêm a assinatura e fazem o mesmo que antes para o app que está no ar hoje.
-- Pode entrar ANTES do app novo (não depende da migração 20261149 nem da 20261157).

-- 1. Crédito do tutor. Quando o tutor pagou adiantado mais do que a estadia custou (buscou o pet antes), a diferença pode
--    ficar como crédito para a próxima conta. Cada linha é um movimento: valor positivo = crédito deixado, negativo = crédito usado.
--    O saldo é a soma. Só quem mexe com dinheiro lê; ninguém grava direto: só pela função abaixo (que confere o saldo).
create table if not exists public.clientes_creditos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops(id) on delete cascade,
  cliente_id uuid not null,
  valor numeric(10,2) not null check (valor <> 0 and abs(valor) <= 99999.99),
  estadia_id uuid references public.estadias(id) on delete set null,
  motivo text check (char_length(motivo) <= 200),
  chave text check (char_length(chave) <= 200),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users(id) on delete set null,
  foreign key (cliente_id, petshop_id) references public.clientes(id, petshop_id) on delete cascade,
  unique (petshop_id, chave)
);
create index if not exists clientes_creditos_cliente_idx on public.clientes_creditos (petshop_id, cliente_id, criado_em);
alter table public.clientes_creditos enable row level security;
drop policy if exists clientes_creditos_ler on public.clientes_creditos;
create policy clientes_creditos_ler on public.clientes_creditos for select to authenticated
  using ((select public.tenho_area(clientes_creditos.petshop_id, array['caixa', 'financeiro', 'relatorios'])));
revoke all on public.clientes_creditos from anon, authenticated;
grant select on public.clientes_creditos to authenticated;

-- Deixar (p_valor > 0) ou usar (p_valor < 0) crédito do tutor. Confere quem pede (as mesmas áreas que fecham a conta da
-- estadia), trava o tutor para duas telas não usarem o mesmo crédito, e não deixa o saldo ficar negativo.
-- Com a mesma chave de novo, devolve o que já gravou (toque duplo, segunda aba).
create or replace function public.credito_do_tutor_mover(p_petshop uuid, p_cliente uuid, p_valor numeric, p_estadia uuid default null, p_motivo text default null, p_chave text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_saldo numeric;
  v_id uuid;
begin
  if not public.tenho_area(p_petshop, array['caixa', 'financeiro', 'relatorios']) or not public.acesso_liberado(p_petshop) then
    raise exception 'Só quem mexe com dinheiro deixa ou usa crédito do tutor.' using errcode = '42501';
  end if;
  if p_valor is null or p_valor = 0 or abs(p_valor) > 99999.99 or round(p_valor, 2) <> p_valor then
    return jsonb_build_object('ok', false, 'erro', 'valor');
  end if;
  perform 1 from public.clientes c where c.id = p_cliente and c.petshop_id = p_petshop for update;
  if not found then return jsonb_build_object('ok', false, 'erro', 'cliente'); end if;
  if p_estadia is not null and not exists (select 1 from public.estadias e where e.id = p_estadia and e.petshop_id = p_petshop) then
    return jsonb_build_object('ok', false, 'erro', 'estadia');
  end if;
  if p_chave is not null then
    select id into v_id from public.clientes_creditos where petshop_id = p_petshop and chave = p_chave;
    if found then
      select coalesce(sum(valor), 0) into v_saldo from public.clientes_creditos where petshop_id = p_petshop and cliente_id = p_cliente;
      return jsonb_build_object('ok', true, 'id', v_id, 'saldo', v_saldo, 'repetido', true);
    end if;
  end if;
  select coalesce(sum(valor), 0) into v_saldo from public.clientes_creditos where petshop_id = p_petshop and cliente_id = p_cliente;
  if p_valor < 0 and v_saldo + p_valor < 0 then
    return jsonb_build_object('ok', false, 'erro', 'saldo', 'saldo', v_saldo);
  end if;
  insert into public.clientes_creditos (petshop_id, cliente_id, valor, estadia_id, motivo, chave, criado_por)
  values (p_petshop, p_cliente, p_valor, p_estadia, nullif(left(btrim(coalesce(p_motivo, '')), 200), ''), p_chave, (select auth.uid()))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'saldo', v_saldo + p_valor);
end $$;
revoke execute on function public.credito_do_tutor_mover(uuid, uuid, numeric, uuid, text, text) from public, anon;
grant execute on function public.credito_do_tutor_mover(uuid, uuid, numeric, uuid, text, text) to authenticated;

-- Juntar clientes repetidos (Clientes > juntar): o crédito vai junto com os lançamentos.
-- Mesma função da migração 20261137 (mesma assinatura), com o crédito a mais.
create or replace function public.clientes_juntar_ao_apagar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_para uuid := nullif(current_setting('gestao.juntar_para', true), '')::uuid;
begin
  if v_para is not null and v_para <> old.id
     and exists (select 1 from public.clientes c where c.id = v_para and c.petshop_id = old.petshop_id) then
    update public.lancamentos set cliente_id = v_para where cliente_id = old.id and petshop_id = old.petshop_id;
    update public.clientes_creditos set cliente_id = v_para where cliente_id = old.id and petshop_id = old.petshop_id;
  end if;
  return old;
end $$;

-- 2. Lista de espera: a hora de chegada e a de buscar que a pessoa pediu (antes ficavam só os dias).
alter table public.lista_espera add column if not exists hora_entrada text check (hora_entrada ~ '^([01]\d|2[0-3]):[0-5]\d$');
alter table public.lista_espera add column if not exists hora_saida text check (hora_saida ~ '^([01]\d|2[0-3]):[0-5]\d$');

-- 3. Hotel: até que horas dá para buscar com a taxa de busca fora do horário. Com a taxa ligada (hora e valor), a busca
--    depois do horário do dia é aceita até 3 horas depois da hora da taxa (no máximo 23h); sem a taxa, null (vale o horário).
create or replace function public.hotel_busca_ate(p_petshop uuid) returns text
language sql stable security definer set search_path = '' as $$
  select to_char(least(time '23:00', ((h.atraso -> 'hotel' ->> 'hora')::time + interval '3 hours')::time), 'HH24:MI')
  from public.hotel_precos h
  where h.petshop_id = p_petshop and h.atraso -> 'ativo' = 'true'::jsonb
    and coalesce(h.atraso -> 'hotel' ->> 'hora', '') ~ '^([01]\d|2[0-3]):[0-5]\d$'
    and (h.atraso -> 'hotel' ->> 'hora')::time <= time '20:00'
    and jsonb_typeof(h.atraso -> 'hotel' -> 'valor') = 'number' and (h.atraso -> 'hotel' ->> 'valor')::numeric > 0
$$;
revoke execute on function public.hotel_busca_ate(uuid) from public, anon, authenticated;

-- Mesma função da migração 20261162 (mesma assinatura). Diferença: buscar o pet depois do horário do dia é aceito quando o
-- hotel cobra a taxa de busca fora do horário, até `hotel_busca_ate`; a recusa diz até que horas dá (`ate`).
create or replace function public.link_hotel_dia_recusado(p_petshop uuid, p_dia date, p_hora text, p_quando text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_horario jsonb; v_nome text; d jsonb; v_h time; v_ate text;
begin
  if p_dia is null then return null; end if;
  select d2.nome into v_nome from public.dias_especiais d2 where d2.petshop_id = p_petshop and d2.dia = p_dia and d2.fechado;
  if found then
    return jsonb_build_object('ok', false, 'erro', 'dia_fechado', 'quando', p_quando, 'dia', p_dia, 'nome', nullif(btrim(coalesce(v_nome, '')), ''));
  end if;
  select s.horario into v_horario from public.petshops s where s.id = p_petshop;
  if not public.creche_abre(v_horario, p_dia) then
    return jsonb_build_object('ok', false, 'erro', 'dia_fechado', 'quando', p_quando, 'dia', p_dia);
  end if;
  d := v_horario -> (extract(dow from p_dia)::int::text);
  if d is null or jsonb_typeof(d) <> 'object' or coalesce(d ->> 'abre', '') !~ '^\d{2}:\d{2}' or coalesce(d ->> 'fecha', '') !~ '^\d{2}:\d{2}'
     or coalesce(p_hora, '') !~ '^([01]\d|2[0-3]):[0-5]\d$' then
    return null;
  end if;
  v_h := p_hora::time;
  if p_quando = 'saida' and v_h > left(d ->> 'fecha', 5)::time then
    v_ate := public.hotel_busca_ate(p_petshop);
    if v_ate is not null and v_h <= v_ate::time then return null; end if;
  end if;
  if v_h < left(d ->> 'abre', 5)::time or v_h > left(d ->> 'fecha', 5)::time then
    return jsonb_build_object('ok', false, 'erro', 'fora_do_horario', 'quando', p_quando, 'dia', p_dia, 'abre', left(d ->> 'abre', 5), 'fecha', left(d ->> 'fecha', 5),
      'ate', case when p_quando = 'saida' then public.hotel_busca_ate(p_petshop) end);
  end if;
  return null;
end $$;
revoke execute on function public.link_hotel_dia_recusado(uuid, date, text, text) from public, anon, authenticated;

-- Mesma função da migração 20261162 (mesma assinatura). Diferença: o pedido de lista de espera pelo link pode trazer
-- p_hora_entrada e p_hora_saida; elas não vão para link_espera_pedir (que não as conhece) e ficam gravadas na linha criada.
create or replace function public.link_pedir_com_termos(p_funcao text, p_args jsonb, p_termos text default null, p_vacinas boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.petshops;
  o jsonb;
  v_lista text;
  r jsonb;
  v_id uuid;
  v_grupo uuid;
  v_args jsonb := p_args;
  v_he text;
  v_hs text;
begin
  if p_funcao not in ('link_pedir', 'link_pedir_estadia', 'link_espera_pedir') or jsonb_typeof(p_args) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_args) k where k !~ '^p_[a-z_]{1,40}$') then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end if;
  select * into v from public.petshops where link_codigo = p_args ->> 'p_codigo' and link_ativo;
  if not found or not public.acesso_liberado(v.id) then return jsonb_build_object('ok', false, 'erro', 'fechado'); end if;
  o := public.link_opcoes_de(v.opcoes);
  -- hotel: chegada e busca só em dia que abre e dentro do horário de funcionamento daquele dia (ver link_hotel_dia_recusado)
  if p_funcao = 'link_pedir_estadia' and p_args ->> 'p_tipo' = 'hotel' then
    r := public.link_hotel_dia_recusado(v.id, public.dia_iso(p_args ->> 'p_entrada'), coalesce(p_args ->> 'p_hora_entrada', '08:00'), 'entrada');
    if r is null then r := public.link_hotel_dia_recusado(v.id, public.dia_iso(p_args ->> 'p_saida'), coalesce(p_args ->> 'p_hora_saida', '18:00'), 'saida'); end if;
    if r is not null then return r; end if;
  end if;
  if p_funcao = 'link_espera_pedir' then
    v_he := case when p_args ->> 'p_hora_entrada' ~ '^([01]\d|2[0-3]):[0-5]\d$' then p_args ->> 'p_hora_entrada' end;
    v_hs := case when p_args ->> 'p_hora_saida' ~ '^([01]\d|2[0-3]):[0-5]\d$' then p_args ->> 'p_hora_saida' end;
    v_args := v_args - 'p_hora_entrada' - 'p_hora_saida';
  end if;
  if (o ->> 'termos')::boolean then
    if regexp_replace(btrim(coalesce(p_termos, '')), '\r', '', 'g') <> regexp_replace(o ->> 'texto', '\r', '', 'g')
       or ((o ->> 'vacinas')::boolean and not coalesce(p_vacinas, false)) then
      return jsonb_build_object('ok', false, 'erro', 'termos');
    end if;
  end if;
  select string_agg(format('%I => %L', e.key,
      case jsonb_typeof(e.value) when 'null' then null when 'string' then e.value #>> '{}' else e.value::text end), ', ')
    into v_lista from jsonb_each(v_args) e;
  begin
    execute format('select public.%I(%s)', p_funcao, v_lista) into r;
  exception when undefined_function or invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end;
  if p_funcao = 'link_espera_pedir' and r ->> 'ok' = 'true' and (r ->> 'id') is not null then
    v_id := (r ->> 'id')::uuid;
    perform set_config('maestro.link', '1', true);
    update public.lista_espera
      set hora_entrada = coalesce(v_he, hora_entrada), hora_saida = coalesce(v_hs, hora_saida),
          termos_aceitos_em = case when (o ->> 'termos')::boolean then now() else termos_aceitos_em end
      where id = v_id and petshop_id = v.id;
    perform set_config('maestro.link', '', true);
    return r;
  end if;
  if (o ->> 'termos')::boolean and r ->> 'ok' = 'true' and (r ->> 'id') is not null then
    v_id := (r ->> 'id')::uuid;
    select grupo_id into v_grupo from public.pedidos_agendamento where id = v_id;
    update public.pedidos_agendamento
      set termos_aceitos_em = now(), termos_texto = nullif(o ->> 'texto', ''), termos_vacinas = (o ->> 'vacinas')::boolean
      where petshop_id = v.id and (id = v_id or (v_grupo is not null and grupo_id = v_grupo));
  end if;
  return r;
end $$;

-- 4. Opções do hotel para o link: mesma função da migração 20261162 (mesma assinatura), com a chave nova `busca_ate`
--    ("21:00" ou null): até que horas o tutor pode marcar a busca com a taxa de busca fora do horário. O app antigo ignora a chave.
create or replace function public.link_hotel_opcoes(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sinal', case when coalesce((p.opcoes -> 'hotel.sinal' ->> 'ativo')::boolean, false) then jsonb_build_object(
      'modo', p.opcoes -> 'hotel.sinal' ->> 'modo', 'valor', p.opcoes -> 'hotel.sinal' -> 'valor',
      'politica', p.opcoes -> 'hotel.sinal' ->> 'politica', 'creche', coalesce((p.opcoes -> 'hotel.sinal' ->> 'creche')::boolean, false)) else null end,
    'preco', case when p.opcoes -> 'hotel.link_sem_preco' = 'true'::jsonb then jsonb_build_object('mostrar', false)
      else (
        select jsonb_build_object('mostrar', true, 'de', min(d.v), 'ate', max(d.v),
          'varia', (p.opcoes -> 'hotel.temporadas' -> 'ativo' = 'true'::jsonb and jsonb_typeof(p.opcoes -> 'hotel.temporadas' -> 'lista') = 'array'
                    and jsonb_array_length(p.opcoes -> 'hotel.temporadas' -> 'lista') > 0)
                or exists (select 1 from public.hotel_precos h where h.petshop_id = p.id and h.feriado -> 'ativo' = 'true'::jsonb)
                   and exists (select 1 from public.dias_especiais x where x.petshop_id = p.id and x.feriado and x.dia >= (now() at time zone p.fuso)::date))
        from (select public.diaria_sugerida(p.id, 'hotel', t.porte) as v from (values (null::text), ('P'), ('M'), ('G'), ('GG')) as t(porte)) d
      ) end,
    'atraso', case when p.opcoes -> 'hotel.link_sem_preco' = 'true'::jsonb then null else (
      select jsonb_build_object('hora', h.atraso -> 'hotel' ->> 'hora', 'valor', h.atraso -> 'hotel' -> 'valor',
        'tolerancia', case when jsonb_typeof(h.atraso -> 'tolerancia') = 'number' then least(180, greatest(0, round((h.atraso ->> 'tolerancia')::numeric))) else 0 end)
      from public.hotel_precos h
      where h.petshop_id = p.id and h.atraso -> 'ativo' = 'true'::jsonb
        and coalesce(h.atraso -> 'hotel' ->> 'hora', '') ~ '^([01]\d|2[0-3]):[0-5]\d$'
        and jsonb_typeof(h.atraso -> 'hotel' -> 'valor') = 'number' and (h.atraso -> 'hotel' ->> 'valor')::numeric > 0
    ) end,
    'busca_ate', public.hotel_busca_ate(p.id),
    'busca_hora', (select h.atraso -> 'hotel' ->> 'hora' from public.hotel_precos h where h.petshop_id = p.id and public.hotel_busca_ate(p.id) is not null)
  )
  from public.petshops p
  where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)
$$;

notify pgrst, 'reload schema';
