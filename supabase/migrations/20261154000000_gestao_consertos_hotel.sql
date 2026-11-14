-- Consertos do hotel: o preço que o link do cliente mostra passa a sair das mesmas regras da conta (porte, temporada,
-- feriado e desconto do segundo pet), calculado aqui no banco; e o pedido aceito pelo link já nasce com o sinal da regra.
-- Tudo aqui é acréscimo: funções novas e uma função trocada com a mesma assinatura (link_hotel_opcoes, que só ganha
-- chaves novas na resposta). O aplicativo que está no ar não chama nenhuma das funções novas e segue igual neste banco.
-- Nada aqui depende da migração 20261149 (a que fecha as colunas de valor): as funções leem as tabelas por dentro.
--
-- AS REGRAS DE PREÇO MORAM EM DOIS LUGARES E TÊM DE DAR O MESMO CENTAVO: aqui (hotel_noite, hotel_previsto) e em
-- src/lib/gestao/hotel.ts (precoDasNoites, diasDeSegundoPet). Mudou num, mude no outro e rode a comparação
-- (scripts da rodada: compara centenas de combinações com a conta do aplicativo).

-- "2026-12-24" vira data; qualquer outra coisa (texto torto, 30 de fevereiro) vira nulo, sem erro.
create function public.dia_iso(p text) returns date
language plpgsql immutable set search_path = '' as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}$' then return null; end if;
  return p::date;
exception when others then
  return null;
end $$;
revoke execute on function public.dia_iso(text) from public, anon, authenticated;

-- O preço de UMA noite do hotel. É a mesma conta de `precoDasNoites`:
--   1. começa na diária combinada (p_base);
--   2. noite de feriado (data marcada como feriado, com o preço de feriado ligado e com valor): vale o preço de feriado;
--   3. senão, noite dentro de uma temporada: vale a temporada. Se mais de uma temporada pega a noite, vale a MAIS CURTA
--      (a mais específica: o Réveillon dentro das Férias); com o mesmo tamanho, a que começa depois; ainda igual, a primeira da lista;
--   4. p_segundo: tira o desconto do segundo pet, em % sobre o preço da noite.
-- Cada conta é arredondada em centavos. Só para uso das outras funções do banco.
create function public.hotel_noite(p_petshop uuid, p_dia date, p_base numeric, p_segundo boolean)
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

  if marca is null and o -> 'hotel.temporadas' -> 'ativo' = 'true'::jsonb and jsonb_typeof(o -> 'hotel.temporadas' -> 'lista') = 'array' then
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
    if t is not null then
      v_nome := case when jsonb_typeof(t -> 'nome') = 'string' then regexp_replace(left(t ->> 'nome', 40), '^\s+|\s+$', '', 'g') else '' end;
      marca := case when v_nome <> '' then v_nome else 'Temporada' end;
      v_modo := case when t ->> 'modo' in ('valor', 'mais') then t ->> 'modo' else 'pct' end;
      v_val := (t ->> 'valor')::numeric;
    end if;
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

-- Total previsto de uma reserva (diárias pelas regras + taxas marcadas), como o cartão da reserva mostra.
-- Nulo quando não dá para prever (sem diária combinada ou sem saída prevista).
-- Desconto do segundo pet, a mesma regra de `diasDeSegundoPet`: na noite em que mais de um pet do mesmo tutor está
-- no hotel, paga a diária cheia o de diária combinada MAIS ALTA; os outros têm o desconto. Com a diária igual,
-- paga cheio a reserva feita primeiro. Só para uso das outras funções do banco.
create function public.hotel_previsto(p_estadia uuid) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare
  e public.estadias; s public.petshops;
  v_cliente uuid; v_ini date; v_n int; v_hoje date; v_total numeric := 0; v_taxas numeric := 0; v_dia date; v_seg boolean; x record;
begin
  select * into e from public.estadias where id = p_estadia;
  if not found or e.valor_diaria is null or e.saida_prevista is null then return null; end if;
  select * into s from public.petshops where id = e.petshop_id;
  v_hoje := (now() at time zone s.fuso)::date;
  v_ini := (e.entrada at time zone s.fuso)::date;
  v_n := (e.saida_prevista at time zone s.fuso)::date - v_ini;
  v_n := greatest(1, case when e.tipo = 'hotel' then v_n else v_n + 1 end);
  if e.tipo <> 'hotel' then
    v_total := round(v_n * e.valor_diaria, 2);
  else
    select p.cliente_id into v_cliente from public.pets p where p.id = e.pet_id;
    for i in 0 .. least(v_n, 400) - 1 loop
      v_dia := v_ini + i;
      v_seg := v_cliente is not null and exists (
        select 1 from public.estadias o join public.pets q on q.id = o.pet_id
        where o.petshop_id = e.petshop_id and o.tipo = 'hotel' and o.status <> 'cancelada' and o.id <> e.id and o.pet_id <> e.pet_id
          and q.cliente_id = v_cliente
          -- quem paga cheio: diária mais alta; no empate, a reserva mais antiga
          and (coalesce(o.valor_diaria, 0) > e.valor_diaria
               or (coalesce(o.valor_diaria, 0) = e.valor_diaria and (o.criado_em, o.id) < (e.criado_em, e.id)))
          -- a outra estadia pega esta noite? (encerrada: as noites cobradas, que nunca passam do dia da saída;
          -- se foram cobradas mais noites do que as datas mostram, as a mais contam para trás)
          and case
            when o.status = 'encerrada' then (
              select v_dia >= c.ini - greatest(0, c.n - c.pelas_datas) and v_dia < c.ini - greatest(0, c.n - c.pelas_datas) + c.n
              from (select (o.entrada at time zone s.fuso)::date as ini,
                      greatest(1, (coalesce(o.saida, o.entrada) at time zone s.fuso)::date - (o.entrada at time zone s.fuso)::date) as pelas_datas,
                      least(400, greatest(0, coalesce(o.diarias_cobradas, greatest(1, (coalesce(o.saida, o.entrada) at time zone s.fuso)::date - (o.entrada at time zone s.fuso)::date)))) as n) c)
            when v_dia < (o.entrada at time zone s.fuso)::date then false
            when o.saida_prevista is null then o.status = 'em_casa' or v_dia = (o.entrada at time zone s.fuso)::date
            else v_dia < (o.saida_prevista at time zone s.fuso)::date or v_dia = (o.entrada at time zone s.fuso)::date
                 or (o.status = 'em_casa' and v_dia <= v_hoje)
          end);
      select n.valor into x from public.hotel_noite(e.petshop_id, v_dia, e.valor_diaria, v_seg) n;
      v_total := v_total + coalesce(x.valor, 0);
    end loop;
  end if;
  select coalesce(sum(round((case when t ->> 'por' = 'noite' then v_n else 1 end) * (t ->> 'valor')::numeric, 2)), 0) into v_taxas
    from public.estadias_valores v, jsonb_array_elements(v.taxas) t
    where v.estadia_id = e.id and jsonb_typeof(v.taxas) = 'array' and jsonb_typeof(t -> 'nome') = 'string' and jsonb_typeof(t -> 'valor') = 'number';
  return round(v_total + v_taxas, 2);
end $$;
revoke execute on function public.hotel_previsto(uuid) from public, anon, authenticated;

-- ---------- link do cliente ----------
-- Opção nova, sem preço dentro: "hotel.link_sem_preco" (true = o link do cliente não mostra diária nem estimativa).

-- O que o link precisa saber das opções do hotel. Igual a antes (o sinal) e mais a chave `preco`:
--   mostrar: o dono deixa o link mostrar preço; de/ate: a menor e a maior diária comum (sem temporada nem feriado);
--   varia: o preço muda com as datas (há temporada ou preço de feriado ligado).
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
      ) end
  )
  from public.petshops p
  where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)
$$;

-- A estimativa que o link mostra para as datas e os pets escolhidos, pelas regras da conta do aplicativo.
--   p_pets: [{ "porte": "P" | "M" | "G" | "GG" | null }], até 5. Pet sem porte usa a diária comum do hotel.
--   p_juntos: verdadeiro = os pets são do mesmo pedido (vale o desconto do segundo pet entre eles: o de diária mais alta
--   paga cheio, os outros têm o desconto; diária igual, o primeiro da lista paga cheio). Falso = cada linha é uma conta
--   separada (a página usa para mostrar "de tanto a tanto, conforme o porte" antes de o tutor dizer o porte).
-- Não olha outras reservas do tutor (o link não sabe quem ele é): por isso é estimativa, e a página diz "cerca de".
-- O sinal é o da regra do dono, calculado sobre esta estimativa (em %), ou o valor fixo por pet.
-- Responde nulo quando o link não está no ar, o hotel não está no link, o dono escondeu o preço, as datas não servem
-- ou algum pet ficou sem diária (porte sem preço e hotel sem diária comum).
create function public.link_hotel_estimativa(p_codigo text, p_entrada date, p_saida date, p_pets jsonb, p_juntos boolean default true) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.petshops;
  v_sinal jsonb; v_pct numeric; v_fixo numeric;
  v_pets jsonb := '[]'::jsonb; v_noites jsonb; v_total numeric := 0; v_sinal_total numeric := 0; v_tem_sinal boolean := false;
  v_tot numeric; v_base numeric; v_sin numeric; v_varia boolean := false; v_desc boolean := false;
  r record; n record;
begin
  select * into s from public.petshops where link_codigo = p_codigo and link_ativo;
  if not found or not public.acesso_liberado(s.id) or not s.link_hotel then return null; end if;
  if s.opcoes -> 'hotel.link_sem_preco' = 'true'::jsonb then return null; end if;
  if p_entrada is null or p_saida is null or p_saida <= p_entrada or p_saida > p_entrada + 60 then return null; end if;
  if p_pets is null or jsonb_typeof(p_pets) <> 'array' or jsonb_array_length(p_pets) < 1 or jsonb_array_length(p_pets) > 5 then return null; end if;

  v_sinal := s.opcoes -> 'hotel.sinal';
  if v_sinal -> 'ativo' = 'true'::jsonb and jsonb_typeof(v_sinal -> 'valor') = 'number' and (v_sinal ->> 'valor')::numeric > 0 then
    if v_sinal ->> 'modo' = 'valor' then v_fixo := round((v_sinal ->> 'valor')::numeric, 2); else v_pct := (v_sinal ->> 'valor')::numeric; end if;
    v_tem_sinal := true;
  end if;

  for r in
    select t.ord, t.porte, t.base,
      -- lugar na fila de quem paga cheio: diária mais alta primeiro; no empate, a ordem do pedido
      row_number() over (order by t.base desc nulls last, t.ord) as lugar
    from (
      select x.ord, case when x.p ->> 'porte' in ('P', 'M', 'G', 'GG') then x.p ->> 'porte' else null end as porte,
        public.diaria_sugerida(s.id, 'hotel', case when x.p ->> 'porte' in ('P', 'M', 'G', 'GG') then x.p ->> 'porte' else null end) as base
      from jsonb_array_elements(p_pets) with ordinality as x(p, ord)
    ) t
    order by t.ord
  loop
    if r.base is null then return null; end if;
    v_noites := '[]'::jsonb; v_tot := 0;
    for i in 0 .. (p_saida - p_entrada) - 1 loop
      select * into n from public.hotel_noite(s.id, p_entrada + i, r.base, coalesce(p_juntos, true) and r.lugar > 1);
      v_tot := v_tot + n.valor;
      v_varia := v_varia or n.marca is not null;
      v_desc := v_desc or n.desconto > 0;
      v_noites := v_noites || jsonb_build_object('dia', p_entrada + i, 'valor', n.valor, 'cheia', n.cheia, 'desconto', n.desconto, 'marca', n.marca);
    end loop;
    v_sin := case when v_fixo is not null then v_fixo when v_pct is not null and v_tot > 0 then round(v_tot * v_pct / 100, 2) else null end;
    v_sinal_total := v_sinal_total + coalesce(v_sin, 0);
    v_total := v_total + v_tot;
    v_pets := v_pets || jsonb_build_object('porte', r.porte, 'diaria', r.base, 'total', v_tot, 'sinal', v_sin, 'noites', v_noites);
  end loop;

  return jsonb_build_object(
    'noites', p_saida - p_entrada, 'pets', v_pets, 'total', v_total,
    -- alguma noite saiu diferente da diária comum (temporada ou feriado) / teve desconto do segundo pet
    'varia', v_varia, 'desconto', v_desc,
    'sinal', case when v_tem_sinal and v_sinal_total > 0 then v_sinal_total else null end);
end $$;
revoke execute on function public.link_hotel_estimativa(text, date, date, jsonb, boolean) from public;
grant execute on function public.link_hotel_estimativa(text, date, date, jsonb, boolean) to anon, authenticated;

-- ---------- pedido aceito pelo link: o sinal da regra ----------
-- Com "Sinal na reserva" ligado, a reserva feita dentro do aplicativo já nasce com o sinal em A receber, pelo valor da regra.
-- O pedido aceito pelo link passa a nascer igual: a tela chama esta função logo depois de aceitar (e de acertar a diária do porte).
-- Quem aceita pode não mexer com dinheiro: a conta é feita aqui, pela regra do dono, e o valor só volta para quem recebe.
-- Não faz nada (e diz por quê) quando a opção está desligada, o tipo não tem sinal, a reserva já tem sinal, o pet está sem tutor
-- ou a regra é em % e não dá para prever o total.
create function public.pedido_criar_sinal(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.pedidos_agendamento; e public.estadias; s public.petshops;
  o jsonb; v_valor numeric; v_cliente uuid; v_pet text; v_hoje date; v_chegada date; v_quando date; v_lanc uuid;
  v_recebe boolean;
begin
  select * into v from public.pedidos_agendamento where id = p_id;
  if not found or v.petshop_id not in (select public.meus_petshops())
     or not (select public.tenho_area(v.petshop_id, array['agenda', 'creche_hotel', 'caixa', 'financeiro'])) then
    raise exception 'Pedido não encontrado.';
  end if;
  if not public.acesso_liberado(v.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if v.status <> 'aceito' or v.estadia_id is null then return jsonb_build_object('criado', false, 'motivo', 'pedido'); end if;
  select * into e from public.estadias where id = v.estadia_id for update;
  if not found or e.status <> 'reservada' then return jsonb_build_object('criado', false, 'motivo', 'reserva'); end if;
  select * into s from public.petshops where id = v.petshop_id;
  o := s.opcoes -> 'hotel.sinal';
  if o is null or o -> 'ativo' is distinct from 'true'::jsonb or jsonb_typeof(o -> 'valor') <> 'number' or (o ->> 'valor')::numeric <= 0
     or (e.tipo <> 'hotel' and o -> 'creche' is distinct from 'true'::jsonb) then
    return jsonb_build_object('criado', false, 'motivo', 'desligado');
  end if;
  if exists (select 1 from public.estadias_valores x where x.estadia_id = e.id and x.sinal is not null) then
    return jsonb_build_object('criado', false, 'motivo', 'ja_tem');
  end if;
  select p.cliente_id, p.nome into v_cliente, v_pet from public.pets p where p.id = e.pet_id;
  if v_cliente is null then return jsonb_build_object('criado', false, 'motivo', 'sem_tutor'); end if;
  v_valor := case when o ->> 'modo' = 'valor' then round((o ->> 'valor')::numeric, 2)
                  else round(public.hotel_previsto(e.id) * (o ->> 'valor')::numeric / 100, 2) end;
  if v_valor is null or v_valor <= 0 or v_valor > 99999.99 then return jsonb_build_object('criado', false, 'motivo', 'sem_valor'); end if;

  -- o prazo do sinal: dois dias, ou o dia da chegada se ela vier antes (o mesmo padrão do formulário de reserva)
  v_hoje := (now() at time zone s.fuso)::date;
  v_chegada := (e.entrada at time zone s.fuso)::date;
  v_quando := case when v_chegada > v_hoje and v_chegada < v_hoje + 2 then v_chegada else v_hoje + 2 end;
  insert into public.lancamentos (petshop_id, tipo, valor, forma, categoria, descricao, data, vencimento, pago, cliente_id, origem, criado_por)
    values (e.petshop_id, 'entrada', v_valor, null, 'Creche e hotel',
      'Sinal da reserva: ' || case when e.tipo = 'hotel' then 'hotel' else 'creche' end || ' de ' || coalesce(v_pet, 'pet') || ', ' || to_char(v_chegada, 'DD/MM'),
      v_quando, v_quando, false, v_cliente, 'sistema', (select auth.uid()))
    returning id into v_lanc;
  insert into public.estadias_valores (estadia_id, petshop_id, sinal, sinal_estado, sinal_lancamento_id)
    values (e.id, e.petshop_id, v_valor, 'a_receber', v_lanc)
    on conflict (estadia_id) do update set sinal = excluded.sinal, sinal_estado = excluded.sinal_estado, sinal_lancamento_id = excluded.sinal_lancamento_id,
      sinal_pago_em = null, sinal_pagamento = null, sinal_devolucao_id = null, sinal_devolvido_em = null;
  v_recebe := (select public.tenho_area(v.petshop_id, array['caixa', 'financeiro', 'relatorios']));
  return jsonb_build_object('criado', true, 'valor', case when v_recebe then v_valor else null end, 'quando', v_quando);
end $$;
revoke execute on function public.pedido_criar_sinal(uuid) from public, anon;
grant execute on function public.pedido_criar_sinal(uuid) to authenticated;

-- Para a página de acompanhar o pedido: o sinal da reserva (ou das reservas do mesmo pedido), se houver.
-- Só a soma e a situação: "a_receber" enquanto faltar algum, "pago" quando todos estiverem pagos.
create function public.link_pedido_sinal(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when count(*) = 0 then null else jsonb_build_object(
    'valor', sum(x.sinal), 'estado', case when bool_and(x.sinal_estado = 'pago') then 'pago' else 'a_receber' end) end
  from public.pedidos_agendamento p
  join public.pedidos_agendamento q on q.petshop_id = p.petshop_id and (q.id = p.id or (p.grupo_id is not null and q.grupo_id = p.grupo_id))
  join public.estadias e on e.id = q.estadia_id and e.status in ('reservada', 'em_casa')
  join public.estadias_valores x on x.estadia_id = e.id and x.sinal is not null and x.sinal_estado in ('a_receber', 'pago')
  where p.id = p_id and q.status = 'aceito'
$$;
revoke execute on function public.link_pedido_sinal(uuid) from public;
grant execute on function public.link_pedido_sinal(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
