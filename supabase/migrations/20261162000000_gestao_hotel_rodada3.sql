-- Consertos do hotel (rodada 3, persona do hotel). Só acréscimo: funções trocadas com a mesma assinatura.
-- Segura ANTES de publicar o aplicativo novo, num banco com 34→48, 50→56 e 58 (sem 49 e sem 57): nada aqui lê coluna
-- que a 49 ou a 57 fecham pela API; as funções leem as tabelas por dentro (security definer).
--
-- 1. hotel_noite: temporada com DIÁRIA PRÓPRIA vale mais que o preço de feriado (o "Réveillon" de 30/12 a 01/01 a R$ 180
--    passa a valer no 31/12 e no 01/01). Temporada com acréscimo (% ou R$) continua cedendo ao preço de feriado.
--    É a mesma regra de `precoDasNoites` (src/lib/gestao/hotel.ts). O app que está no ar faz a conta antiga na tela
--    (feriado sempre vence): só muda algo para quem tem temporada de diária própria com feriado dentro, e só até publicar.

create or replace function public.hotel_noite(p_petshop uuid, p_dia date, p_base numeric, p_segundo boolean)
returns table (cheia numeric, desconto numeric, valor numeric, marca text)
language plpgsql stable security definer set search_path = '' as $$
declare
  o jsonb; f jsonb; t jsonb;
  v_nome text; v_modo text; v_val numeric; v_pct numeric;
begin
  if p_base is null or p_dia is null then return; end if;
  select s.opcoes into o from public.petshops s where s.id = p_petshop;
  if not found then return; end if;
  o := coalesce(o, '{}'::jsonb);

  -- a temporada da noite (a mais curta; mesmo tamanho, a que começa depois; ainda igual, a primeira da lista)
  if o -> 'hotel.temporadas' -> 'ativo' = 'true'::jsonb and jsonb_typeof(o -> 'hotel.temporadas' -> 'lista') = 'array' then
    select x.t into t
    from jsonb_array_elements(o -> 'hotel.temporadas' -> 'lista') with ordinality as x(t, ord)
    where jsonb_typeof(x.t) = 'object'
      and jsonb_typeof(x.t -> 'de') = 'string' and jsonb_typeof(x.t -> 'ate') = 'string'
      and public.dia_iso(x.t ->> 'de') is not null and public.dia_iso(x.t ->> 'ate') is not null
      and public.dia_iso(x.t ->> 'ate') >= public.dia_iso(x.t ->> 'de')
      and jsonb_typeof(x.t -> 'valor') = 'number' and (x.t ->> 'valor')::numeric >= 0
      and p_dia between public.dia_iso(x.t ->> 'de') and public.dia_iso(x.t ->> 'ate')
    order by public.dia_iso(x.t ->> 'ate') - public.dia_iso(x.t ->> 'de'), public.dia_iso(x.t ->> 'de') desc, x.ord
    limit 1;
  end if;

  -- feriado: vale, a não ser que a temporada da noite tenha diária própria
  if t is null or t ->> 'modo' is distinct from 'valor' then
    select h.feriado into f from public.hotel_precos h where h.petshop_id = p_petshop;
    if f is not null and f -> 'ativo' = 'true'::jsonb and jsonb_typeof(f -> 'valor') = 'number' and (f ->> 'valor')::numeric >= 0
       and (f ->> 'modo' = 'valor' or (f ->> 'valor')::numeric > 0) then
      select d.nome into v_nome from public.dias_especiais d where d.petshop_id = p_petshop and d.dia = p_dia and d.feriado;
      if found then
        v_nome := regexp_replace(coalesce(v_nome, ''), '^\s+|\s+$', '', 'g');
        marca := case when v_nome <> '' then 'Feriado: ' || v_nome else 'Feriado' end;
        v_modo := case when f ->> 'modo' in ('valor', 'mais') then f ->> 'modo' else 'pct' end;
        v_val := (f ->> 'valor')::numeric;
      end if;
    end if;
  end if;

  if marca is null and t is not null then
    v_nome := case when jsonb_typeof(t -> 'nome') = 'string' then regexp_replace(left(t ->> 'nome', 40), '^\s+|\s+$', '', 'g') else '' end;
    marca := case when v_nome <> '' then v_nome else 'Temporada' end;
    v_modo := case when t ->> 'modo' in ('valor', 'mais') then t ->> 'modo' else 'pct' end;
    v_val := (t ->> 'valor')::numeric;
  end if;

  cheia := round(case when marca is null then p_base when v_modo = 'valor' then v_val when v_modo = 'mais' then p_base + v_val
                      else p_base * (100 + v_val) / 100 end, 2);
  desconto := 0;
  if coalesce(p_segundo, false) and o -> 'hotel.desconto_segundo_pet' -> 'ativo' = 'true'::jsonb
     and jsonb_typeof(o -> 'hotel.desconto_segundo_pet' -> 'pct') = 'number' then
    v_pct := least(100, (o -> 'hotel.desconto_segundo_pet' ->> 'pct')::numeric);
    if v_pct > 0 then desconto := round(cheia * v_pct / 100, 2); end if;
  end if;
  valor := cheia - desconto;
  return next;
end $$;
revoke execute on function public.hotel_noite(uuid, date, numeric, boolean) from public, anon, authenticated;

-- 2. Link do cliente, hotel: a chegada e a busca não podem cair num dia marcado como fechado em "Feriados e dias fechados",
--    num dia da semana em que o negócio não abre (pelo horário de Meu pet shop) nem fora do horário daquele dia.
--    O formulário do dono só avisa (ele decide); o link recusa e diz por quê, e a página do link já não deixa escolher.
--    Sem horário preenchido em Meu pet shop, vale todo dia e toda hora, como sempre. As noites no meio não importam.
--    Resposta: null = pode; senão { ok: false, erro: 'dia_fechado' | 'fora_do_horario', quando: 'entrada' | 'saida', dia, nome?, abre?, fecha? }.
create or replace function public.link_hotel_dia_recusado(p_petshop uuid, p_dia date, p_hora text, p_quando text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_horario jsonb; v_nome text; d jsonb; v_h time;
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
  if v_h < left(d ->> 'abre', 5)::time or v_h > left(d ->> 'fecha', 5)::time then
    return jsonb_build_object('ok', false, 'erro', 'fora_do_horario', 'quando', p_quando, 'dia', p_dia, 'abre', left(d ->> 'abre', 5), 'fecha', left(d ->> 'fecha', 5));
  end if;
  return null;
end $$;
revoke execute on function public.link_hotel_dia_recusado(uuid, date, text, text) from public, anon, authenticated;

-- Mesma função (mesma assinatura) da migração 20261151, com a conferência acima antes de gravar o pedido de hotel.
create or replace function public.link_pedir_com_termos(p_funcao text, p_args jsonb, p_termos text default null, p_vacinas boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.petshops;
  o jsonb;
  v_lista text;
  r jsonb;
  v_id uuid;
  v_grupo uuid;
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
  if (o ->> 'termos')::boolean then
    if regexp_replace(btrim(coalesce(p_termos, '')), '\r', '', 'g') <> regexp_replace(o ->> 'texto', '\r', '', 'g')
       or ((o ->> 'vacinas')::boolean and not coalesce(p_vacinas, false)) then
      return jsonb_build_object('ok', false, 'erro', 'termos');
    end if;
  end if;
  select string_agg(format('%I => %L', e.key,
      case jsonb_typeof(e.value) when 'null' then null when 'string' then e.value #>> '{}' else e.value::text end), ', ')
    into v_lista from jsonb_each(p_args) e;
  begin
    execute format('select public.%I(%s)', p_funcao, v_lista) into r;
  exception when undefined_function or invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end;
  if (o ->> 'termos')::boolean and r ->> 'ok' = 'true' and (r ->> 'id') is not null then
    v_id := (r ->> 'id')::uuid;
    if p_funcao = 'link_espera_pedir' then
      perform set_config('maestro.link', '1', true);
      update public.lista_espera set termos_aceitos_em = now() where id = v_id and petshop_id = v.id;
      perform set_config('maestro.link', '', true);
      return r;
    end if;
    select grupo_id into v_grupo from public.pedidos_agendamento where id = v_id;
    update public.pedidos_agendamento
      set termos_aceitos_em = now(), termos_texto = nullif(o ->> 'texto', ''), termos_vacinas = (o ->> 'vacinas')::boolean
      where petshop_id = v.id and (id = v_id or (v_grupo is not null and grupo_id = v_grupo));
  end if;
  return r;
end $$;

-- 3. Link do cliente: a estimativa avisa a taxa de busca fora do horário do hotel (quando o dono ligou a taxa e deixa o link
--    mostrar preço). Mesma função da migração 20261154 (mesma assinatura), com a chave nova `atraso` na resposta:
--    { hora: "18:00", tolerancia: 30, valor: 40 } ou null. O app antigo ignora a chave.
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
    ) end
  )
  from public.petshops p
  where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)
$$;

-- 4. Caixa: a hora em que a conta foi PAGA. O sinal criado em A receber às 17h59 e recebido às 18h32 aparecia às 17h59
--    (a hora em que foi criado), antes até de o caixa abrir. Coluna nova `lancamentos.pago_em`, preenchida só pelo banco:
--    lançado já pago = agora; conta que passa de a receber para paga = agora; volta para a receber = vazio.
--    As linhas antigas ficam vazias e a tela usa `criado_em`, como sempre. O app antigo não lê a coluna e segue igual.
alter table public.lancamentos add column if not exists pago_em timestamptz;

create or replace function public.lancamento_pago_em() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.pago_em := case when new.pago then now() else null end;
  elsif new.pago and not coalesce(old.pago, false) then
    new.pago_em := now();
  elsif not new.pago then
    new.pago_em := null;
  else
    new.pago_em := old.pago_em;
  end if;
  return new;
end $$;
revoke execute on function public.lancamento_pago_em() from public, anon, authenticated;
drop trigger if exists lancamento_pago_em on public.lancamentos;
create trigger lancamento_pago_em before insert or update on public.lancamentos
  for each row execute function public.lancamento_pago_em();

notify pgrst, 'reload schema';
