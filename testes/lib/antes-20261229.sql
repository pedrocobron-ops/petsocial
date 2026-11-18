-- As funções que a migração 20261229 trocou, como eram antes (cópia das definições anteriores), num esquema à parte.
-- Usado por testes/banco/desempenho-operacao.js: __ANTES__ vira o nome de um esquema só daquela rodada, apagado no fim.
-- As chamadas de dentro continuam indo às funções de public (as de hoje).

CREATE OR REPLACE FUNCTION __ANTES__.link_vaga(p_petshop uuid, p_inicio timestamp with time zone, p_fim timestamp with time zone)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cap int;
  v_ocupados int;
begin
  if exists (select 1 from public.bloqueios where petshop_id = p_petshop and profissional_id is null and inicio < p_fim and fim > p_inicio) then
    return false;
  end if;
  select coalesce(
    (select vagas from public.petshops where id = p_petshop),
    (select greatest(1, count(*))::int from public.profissionais where petshop_id = p_petshop and ativo and atende)
  ) into v_cap;
  select
    (select count(*) from public.agendamentos where petshop_id = p_petshop and status not in ('cancelado', 'faltou') and inicio < p_fim and fim > p_inicio)
    + (select count(*) from public.pedidos_agendamento where petshop_id = p_petshop and status = 'pendente' and tipo = 'servico' and inicio < p_fim and fim > p_inicio)
    + (select count(distinct profissional_id) from public.bloqueios where petshop_id = p_petshop and profissional_id is not null and inicio < p_fim and fim > p_inicio)
  into v_ocupados;
  return v_ocupados < v_cap;
end $function$;

CREATE OR REPLACE FUNCTION __ANTES__.conflitos_agenda(p_petshop uuid, p_profissional uuid, p_inicio timestamp with time zone, p_fim timestamp with time zone, p_ignorar uuid DEFAULT NULL::uuid)
 RETURNS SETOF public.agendamentos
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  r public.agendamentos;
  v_vejo boolean;
begin
  if not exists (select 1 from public.meus_petshops() m where m = p_petshop) then return; end if;
  v_vejo := public.tenho_area(p_petshop, array['caixa', 'financeiro', 'relatorios']);
  for r in select * from public.agendamentos
    where petshop_id = p_petshop and profissional_id = p_profissional
      and status not in ('cancelado', 'faltou')
      and inicio < p_fim and fim > p_inicio
      and (p_ignorar is null or id <> p_ignorar)
  loop
    -- sem área de dinheiro: o preço e o valor guardado na conclusão (20261169) saem em branco
    -- (jsonb_populate_record ignora a coluna que ainda não existe)
    if not v_vejo then r := jsonb_populate_record(r, '{"preco": null, "valor_concluido": null, "concluido_servicos": null}'::jsonb); end if;
    return next r;
  end loop;
end $function$;

CREATE OR REPLACE FUNCTION __ANTES__.pacotes_acabando(p uuid, p_pet uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_fuso text; v_hoje date;
begin
  if not exists (select 1 from public.profissionais x where x.petshop_id = p and x.user_id = (select auth.uid()) and x.ativo) then return '[]'::jsonb; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p;
  v_hoje := (now() at time zone v_fuso)::date;
  return coalesce((
    select jsonb_agg(to_jsonb(y) - 'ordem' order by y.ordem, y.vence_em nulls last, y.pet ->> 'nome') from (
      select z.*, case z.motivo when 'acabou' then 1 when 'vencido' then 2 when 'ultimo' then 3 else 4 end as ordem from (
        select k.id, k.pet_id, k.nome, k.total, k.usados, k.vence_em, k.servico_id, k.pacote_id,
               (w.acabou at time zone v_fuso)::date as acabou_em,
               case when k.vence_em is null then null else k.vence_em - v_hoje end as dias,
               jsonb_build_object('id', pp.id, 'nome', pp.nome, 'sexo', pp.sexo, 'foto', pp.foto, 'especie', pp.especie) as pet,
               case when c.id is null then null else jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'nao_quer', c.nao_quer_mensagens) end as tutor,
               case
                 when k.usados >= k.total then case when w.acabou is not null and (w.acabou at time zone v_fuso)::date >= v_hoje - 30 then 'acabou' end
                 when not k.ativo then null
                 when k.vence_em is not null and k.vence_em < v_hoje then case when k.vence_em >= v_hoje - 30 then 'vencido' end
                 when k.total - k.usados = 1 then 'ultimo'
                 when k.vence_em is not null and k.vence_em <= v_hoje + 7 then 'vencendo'
               end as motivo
          from public.pacotes_clientes k
          join public.pets pp on pp.id = k.pet_id and pp.petshop_id = k.petshop_id
          left join public.clientes c on c.id = pp.cliente_id
          cross join lateral (select coalesce(k.acabou_em, (select max(a.inicio) from public.agendamentos a
                                where a.pacote_cliente_id = k.id and a.petshop_id = k.petshop_id and a.status = 'concluido')) as acabou) w
         where k.petshop_id = p and (p_pet is null or k.pet_id = p_pet) and pp.ativo
           and not exists (select 1 from public.pacotes_clientes k2 where k2.petshop_id = p and k2.pet_id = k.pet_id and k2.id <> k.id
                             and k2.ativo and k2.usados < k2.total and (k2.vence_em is null or k2.vence_em >= v_hoje) and k2.criado_em > k.criado_em)
      ) z where z.motivo is not null
      order by 1 limit 200
    ) y), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION __ANTES__.indicadores_do_periodo(p uuid, p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fuso text;
  v_din boolean;
  v_ini timestamptz;
  v_fim timestamptz;
  v_res jsonb;
begin
  if (select auth.uid()) is null or p is null or not (p in (select public.meus_petshops())) then
    raise exception 'Sem acesso a este pet shop.' using errcode = '42501';
  end if;
  if not public.tenho_area(p, array['relatorios']) then
    raise exception 'Os indicadores são de quem vê os relatórios.' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 372 then raise exception 'Escolha um período de até um ano.'; end if;
  v_din := public.cuido_do_financeiro(p) and public.vejo_financeiro(p);
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p;
  v_ini := p_de::timestamp at time zone v_fuso;
  v_fim := (p_ate + 1)::timestamp at time zone v_fuso;

  with meses as (
    select to_char(m, 'YYYY-MM') as mes, greatest(m::date, p_de) as de, least((m + interval '1 month' - interval '1 day')::date, p_ate) as ate
    from generate_series(date_trunc('month', p_de::timestamp), date_trunc('month', p_ate::timestamp), interval '1 month') m
  ),
  ag as materialized (
    select a.id, a.status, a.servico_id, (a.inicio at time zone v_fuso) as local, pe.cliente_id
    from public.agendamentos a left join public.pets pe on pe.id = a.pet_id
    where a.petshop_id = p and a.inicio >= v_ini and a.inicio < v_fim
  ),
  es as materialized (
    select e.id, e.tipo, (e.saida at time zone v_fuso)::date as dia, pe.cliente_id
    from public.estadias e left join public.pets pe on pe.id = e.pet_id
    where e.petshop_id = p and e.status = 'encerrada' and e.saida >= v_ini and e.saida < v_fim
  ),
  -- reservas e estadias (sem as presenças de mensalista), pelo dia da entrada: marcadas e canceladas
  er as materialized (
    select e.status, (e.entrada at time zone v_fuso)::date as dia
    from public.estadias e
    where e.petshop_id = p and e.mensalista is null and e.entrada >= v_ini and e.entrada < v_fim
  ),
  -- reservas canceladas pelo dia do cancelamento (as antigas, sem o dia anotado, pelo dia da entrada): cancelar hoje uma
  -- reserva para o mês que vem aparece hoje
  ec as materialized (
    select coalesce((c.cancelada_em at time zone v_fuso)::date, (e.entrada at time zone v_fuso)::date) as dia
    from public.estadias e left join public.estadias_canceladas c on c.estadia_id = e.id
    where e.petshop_id = p and e.mensalista is null and e.status = 'cancelada'
      and coalesce(c.cancelada_em, e.entrada) >= v_ini and coalesce(c.cancelada_em, e.entrada) < v_fim
  ),
  -- noites de hotel ocupadas: cada noite de uma estadia de hotel aberta ou encerrada que cai no período
  nh as (
    select g.d::date as dia
    from public.estadias e
    cross join lateral generate_series((e.entrada at time zone v_fuso)::date,
      greatest((e.entrada at time zone v_fuso)::date, (coalesce(e.saida, e.saida_prevista, e.entrada + interval '1 day') at time zone v_fuso)::date - 1),
      interval '1 day') g(d)
    where e.petshop_id = p and e.tipo = 'hotel' and e.status in ('em_casa', 'encerrada')
      and e.entrada < v_fim and coalesce(e.saida, e.saida_prevista, e.entrada + interval '1 day') > v_ini
  ),
  sinais as materialized (
    select v.sinal_lancamento_id as id, v.sinal_estado, v.sinal, v.conta
    from public.estadias_valores v
    where v.petshop_id = p and (v.sinal_lancamento_id is not null or v.conta is not null)
  ),
  ent as materialized (
    select l.id, l.data, l.valor, (l.conta_id is null and l.diferenca_de is null) as principal,
      exists (select 1 from sinais x where x.id is not null and (x.id = l.id or x.id = l.conta_id)) as do_sinal,
      coalesce((select sum(x.sinal) from sinais x where x.sinal_estado = 'pago' and x.conta ->> 'lancamento_id' = l.id::text), 0) as sinal_descontado
    from public.lancamentos l
    where l.petshop_id = p and l.tipo = 'entrada' and l.pago and l.movimento is null and l.data between p_de and p_ate
  ),
  sai as (
    select l.data, l.valor, l.categoria in ('Devolução', 'Devolução de sinal') as devolucao
    from public.lancamentos l
    where l.petshop_id = p and l.tipo = 'saida' and l.pago and l.movimento is null and l.data between p_de and p_ate
  ),
  cred as (
    select (c.criado_em at time zone v_fuso)::date as dia, c.valor, c.lancamento_id
    from public.clientes_creditos c
    where c.petshop_id = p and c.criado_em >= v_ini and c.criado_em < v_fim
  ),
  tx as (
    select l.data, t.taxa from ent l join public.lancamentos_taxas t on t.lancamento_id = l.id where t.petshop_id = p
  ),
  -- visitas: atendimento concluído ou estadia encerrada, de 60 dias antes do começo até o fim (para o retorno)
  vis as materialized (
    select pe.cliente_id, (a.inicio at time zone v_fuso)::date as dia
    from public.agendamentos a join public.pets pe on pe.id = a.pet_id
    where a.petshop_id = p and a.status = 'concluido' and a.inicio >= ((p_de - 60)::timestamp at time zone v_fuso) and a.inicio < v_fim and pe.cliente_id is not null
    union
    select pe.cliente_id, (e.saida at time zone v_fuso)::date
    from public.estadias e join public.pets pe on pe.id = e.pet_id
    where e.petshop_id = p and e.status = 'encerrada' and e.saida >= ((p_de - 60)::timestamp at time zone v_fuso) and e.saida < v_fim and pe.cliente_id is not null
  ),
  noper as (select distinct v.cliente_id, v.dia from vis v where v.dia between p_de and p_ate),
  -- a primeira visita da vida de cada cliente atendido no período
  prim as (
    select c.cliente_id, least(
      (select min((a.inicio at time zone v_fuso)::date) from public.agendamentos a join public.pets pe on pe.id = a.pet_id
        where a.petshop_id = p and a.status = 'concluido' and pe.cliente_id = c.cliente_id),
      (select min((e.saida at time zone v_fuso)::date) from public.estadias e join public.pets pe on pe.id = e.pet_id
        where e.petshop_id = p and e.status = 'encerrada' and pe.cliente_id = c.cliente_id)) as dia
    from (select distinct n.cliente_id from noper n) c
  ),
  pc as materialized (select * from public.lucro_pecas(p, p_de, p_ate)),
  mm as (
    select m.mes, m.de, m.ate,
      (select coalesce(sum(e.valor), 0) from ent e where e.data between m.de and m.ate) as entradas,
      (select count(*) from ent e where e.principal and not e.do_sinal and e.data between m.de and m.ate) as contas,
      (select coalesce(sum(e.valor + e.sinal_descontado), 0) from ent e where e.principal and not e.do_sinal and e.data between m.de and m.ate) as valor_contas,
      (select coalesce(sum(s.valor), 0) from sai s where s.devolucao and s.data between m.de and m.ate) as devolvido,
      (select coalesce(sum(s.valor), 0) from sai s where not s.devolucao and s.data between m.de and m.ate) as saiu,
      (select coalesce(sum(c.valor) filter (where c.valor > 0), 0) from cred c where c.dia between m.de and m.ate) as deixado,
      (select coalesce(-sum(c.valor) filter (where c.valor < 0 and c.lancamento_id is null), 0) from cred c where c.dia between m.de and m.ate) as usado_fora,
      (select coalesce(sum(t.taxa), 0) from tx t where t.data between m.de and m.ate) as taxas,
      (select count(*) from ag a where a.status = 'concluido' and a.local::date between m.de and m.ate) as atendimentos,
      (select count(*) from ag a where a.status = 'faltou' and a.local::date between m.de and m.ate) as faltas,
      (select count(*) from ag a where a.status = 'cancelado' and a.local::date between m.de and m.ate) as cancelados,
      (select count(*) from ag a where a.local::date between m.de and m.ate) as marcados,
      (select count(*) from er x where x.dia between m.de and m.ate) as estadias_marcadas,
      (select count(*) from er x where x.status = 'cancelada' and x.dia between m.de and m.ate) as estadias_canceladas,
      (select count(*) from ec x where x.dia between m.de and m.ate) as canceladas_no_periodo,
      (select count(*) from nh x where x.dia between m.de and m.ate) as noites_hotel,
      (select count(*) from es e where e.tipo = 'creche' and e.dia between m.de and m.ate) as creche,
      (select count(*) from es e where e.tipo = 'hotel' and e.dia between m.de and m.ate) as hotel,
      (select count(distinct n.cliente_id) from noper n where n.dia between m.de and m.ate) as clientes,
      (select count(*) from prim x where x.dia between m.de and m.ate) as primeira_vez
    from meses m
  ),
  sv as (
    select coalesce(x.servico_id::text, '-') as k, x.servico_id, count(*) as vezes
    from (
      select a.servico_id from ag a where a.status = 'concluido'
      union all
      select s.servico_id from ag a join public.agendamento_servicos s on s.agendamento_id = a.id where a.status = 'concluido' and s.petshop_id = p
    ) x group by 1, 2
  ),
  svr as (select coalesce(x.servico_id::text, '-') as k, sum(x.valor) as receita from pc x where x.tipo = 'servico' group by 1),
  -- troca e devolução: o que voltou no período sai da quantidade e da receita (pelo dia da devolução, como em Quanto sobrou)
  dvp as (
    select (i ->> 'produto_id')::uuid as produto_id, sum((i ->> 'qtd')::numeric) as quantidade, sum((i ->> 'valor')::numeric) as valor
    from public.devolucoes dv cross join lateral jsonb_array_elements(dv.itens) i
    where dv.petshop_id = p and coalesce(dv.saida_id, dv.credito_id) is not null and dv.criado_em >= v_ini and dv.criado_em < v_fim
      and (i ->> 'produto_id') is not null
    group by 1
  ),
  pr0 as (
    select x.produto_id, coalesce(x.produto_id::text, 'nome:' || lower(x.nome)) as k, (array_agg(x.nome))[1] as nome, sum(x.qtd) as quantidade, sum(x.valor) as receita
    from pc x where x.tipo = 'produto' group by 1, 2
  ),
  pr as (
    select a.produto_id, a.k, a.nome, a.quantidade - coalesce(d.quantidade, 0) as quantidade, a.receita - coalesce(d.valor, 0) as receita
    from pr0 a left join dvp d on d.produto_id = a.produto_id
  ),
  mapa as (
    select (extract(isodow from a.local)::int - 1) as d, extract(hour from a.local)::int as h, count(*) as n
    from ag a where a.status <> 'cancelado' group by 1, 2
  )
  select jsonb_build_object(
    'de', p_de, 'ate', p_ate, 'dinheiro', v_din,
    'meses', coalesce((select jsonb_agg(jsonb_build_object(
        'mes', x.mes, 'de', x.de, 'ate', x.ate,
        'faturamento', case when v_din then x.entradas - x.devolvido - x.deixado + x.usado_fora end,
        'entradas', case when v_din then x.entradas end,
        'contas', x.contas,
        'valor_contas', case when v_din then x.valor_contas end,
        'valor_medio', case when v_din and x.contas > 0 then round(x.valor_contas / x.contas, 2) end,
        'saiu', case when v_din then x.saiu end,
        'resultado', case when v_din then x.entradas - x.devolvido - x.deixado + x.usado_fora - x.saiu end,
        'taxas', case when v_din then x.taxas end,
        'resultado_depois_taxas', case when v_din then x.entradas - x.devolvido - x.deixado + x.usado_fora - x.saiu - x.taxas end,
        'atendimentos', x.atendimentos, 'faltas', x.faltas, 'cancelados', x.cancelados, 'marcados', x.marcados,
        'estadias_marcadas', x.estadias_marcadas, 'estadias_canceladas', x.estadias_canceladas, 'estadias_canceladas_no_periodo', x.canceladas_no_periodo, 'noites_hotel', x.noites_hotel,
        'estadias_creche', x.creche, 'estadias_hotel', x.hotel,
        'clientes', x.clientes, 'primeira_vez', x.primeira_vez, 'voltaram', x.clientes - x.primeira_vez) order by x.mes) from mm x), '[]'::jsonb),
    'clientes', (select count(distinct n.cliente_id) from noper n),
    'primeira_vez', (select count(*) from prim x where x.dia between p_de and p_ate),
    'retorno_60', jsonb_build_object(
      'clientes', (select count(distinct n.cliente_id) from noper n),
      'voltaram', (select count(distinct n.cliente_id) from noper n
                    where exists (select 1 from vis w where w.cliente_id = n.cliente_id and w.dia < n.dia and w.dia >= n.dia - 60))),
    'servicos', coalesce((select jsonb_agg(jsonb_build_object(
        'servico_id', s.servico_id, 'nome', coalesce(se.nome, 'Sem serviço escolhido'), 'vezes', s.vezes,
        'receita', case when v_din then coalesce(r.receita, 0) end) order by s.vezes desc, coalesce(se.nome, ''))
      from (select * from sv order by vezes desc limit 10) s
      left join public.servicos se on se.id = s.servico_id and se.petshop_id = p
      left join svr r on r.k = s.k), '[]'::jsonb),
    'produtos', coalesce((select jsonb_agg(jsonb_build_object(
        'produto_id', x.produto_id, 'nome', coalesce(po.nome, x.nome, 'Produto'), 'unidade', coalesce(po.unidade, 'un'), 'quantidade', x.quantidade,
        'receita', case when v_din then x.receita end) order by x.quantidade desc, x.receita desc)
      from (select * from pr where pr.quantidade > 0 order by pr.quantidade desc, pr.receita desc limit 10) x
      left join public.produtos po on po.id = x.produto_id and po.petshop_id = p), '[]'::jsonb),
    'mapa', coalesce((select jsonb_agg(jsonb_build_object('d', m.d, 'h', m.h, 'n', m.n) order by m.d, m.h) from mapa m), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $function$;

CREATE OR REPLACE FUNCTION __ANTES__.partes_do_lancamento(p_valor numeric, p_itens jsonb)
 RETURNS TABLE(servico numeric, produto numeric, extra numeric)
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  x jsonb;
  q numeric;
  v numeric;
  b_s numeric := 0; b_p numeric := 0; b_e numeric := 0;
  v_abate numeric := 0;
  v_tira numeric;
  v_soma numeric;
  v_sobra numeric;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then return next; return; end if;
  for x in select * from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(x) <> 'object' then continue; end if;
    begin
      q := coalesce((x ->> 'qtd')::numeric, 1);
      v := coalesce((x ->> 'valor')::numeric, 0);
    exception when others then continue;
    end;
    if q * v < 0 then v_abate := v_abate - q * v;
    elsif x ->> 'tipo' = 'servico' then b_s := b_s + q * v;
    elsif x ->> 'tipo' = 'produto' then b_p := b_p + q * v;
    else b_e := b_e + q * v;
    end if;
  end loop;
  v_tira := least(b_s, v_abate); b_s := b_s - v_tira; v_abate := v_abate - v_tira;
  v_tira := least(b_p, v_abate); b_p := b_p - v_tira; v_abate := v_abate - v_tira;
  v_tira := least(b_e, v_abate); b_e := b_e - v_tira; v_abate := v_abate - v_tira;
  v_soma := b_s + b_p + b_e;
  if v_soma <= 0 then return next; return; end if;
  servico := round(b_s / v_soma * p_valor, 2);
  produto := round(b_p / v_soma * p_valor, 2);
  extra := round(b_e / v_soma * p_valor, 2);
  v_sobra := p_valor - servico - produto - extra;
  if v_sobra <> 0 then
    if produto > servico and produto >= extra then produto := produto + v_sobra;
    elsif extra > servico and extra > produto then extra := extra + v_sobra;
    else servico := servico + v_sobra;
    end if;
  end if;
  return next;
end $function$;

CREATE OR REPLACE FUNCTION __ANTES__.partes_por_servico(p_agendamento uuid, p_total numeric, p_itens jsonb, p_com_itens boolean)
 RETURNS TABLE(servico_id uuid, valor numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  a public.agendamentos;
  v_ids uuid[] := '{}';
  v_pesos numeric[] := '{}';
  x jsonb;
  e record;
  q numeric;
  v numeric;
  v_sid uuid;
  v_pos int;
  v_soma numeric := 0;
  v_dado numeric := 0;
  v_maior int := 1;
  i int;
begin
  select * into a from public.agendamentos g where g.id = p_agendamento;
  if not found then return; end if;
  -- o principal na frente (mesmo sem serviço escolhido), depois os outros na ordem
  v_ids := array[a.servico_id];
  v_pesos := array[0::numeric];
  for e in select s.servico_id, s.preco from public.agendamento_servicos s where s.agendamento_id = a.id order by s.ordem, s.servico_id loop
    v_ids := v_ids || e.servico_id;
    v_pesos := v_pesos || (case when p_com_itens then 0 else coalesce(e.preco, 0) end);
  end loop;
  if p_com_itens then
    if p_itens is not null and jsonb_typeof(p_itens) = 'array' then
      for x in select * from jsonb_array_elements(p_itens) loop
        if jsonb_typeof(x) <> 'object' or x ->> 'tipo' is distinct from 'servico' then continue; end if;
        begin
          q := coalesce((x ->> 'qtd')::numeric, 1);
          v := coalesce((x ->> 'valor')::numeric, 0);
        exception when others then continue;
        end;
        begin
          v_sid := (x ->> 'servico_id')::uuid;
        exception when others then v_sid := null;
        end;
        v_pos := 1;
        if v_sid is not null then
          for i in 2..coalesce(array_length(v_ids, 1), 1) loop
            if v_ids[i] = v_sid then v_pos := i; exit; end if;
          end loop;
        end if;
        v_pesos[v_pos] := v_pesos[v_pos] + greatest(0, q * v);
      end loop;
    end if;
  elsif a.pacote_cliente_id is null then
    v_pesos[1] := coalesce(a.preco, 0);
  end if;
  for i in 1..array_length(v_pesos, 1) loop
    v_soma := v_soma + v_pesos[i];
    if v_pesos[i] > v_pesos[v_maior] then v_maior := i; end if;
  end loop;
  if v_soma <= 0 then
    servico_id := v_ids[1]; valor := p_total; return next;
    return;
  end if;
  for i in 1..array_length(v_pesos, 1) loop
    v_pesos[i] := round(p_total * v_pesos[i] / v_soma, 2);
    v_dado := v_dado + v_pesos[i];
  end loop;
  v_pesos[v_maior] := v_pesos[v_maior] + (p_total - v_dado);
  for i in 1..array_length(v_pesos, 1) loop
    if v_pesos[i] <> 0 or i = v_maior then
      servico_id := v_ids[i]; valor := v_pesos[i]; return next;
    end if;
  end loop;
end $function$;

CREATE OR REPLACE FUNCTION __ANTES__.lucro_repartir(p_total numeric, p_itens jsonb, p_tipo text)
 RETURNS TABLE(servico_id uuid, produto_id uuid, nome text, qtd numeric, valor numeric)
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  x jsonb;
  q numeric; v numeric; v_id uuid; v_nome text; v_chave text;
  k text[] := '{}'; ids uuid[] := '{}'; nomes text[] := '{}'; qs numeric[] := '{}'; ws numeric[] := '{}';
  v_pos int; v_soma numeric := 0; v_dado numeric := 0; v_maior int := 1; i int; n int;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or p_total is null then return; end if;
  for x in select * from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(x) <> 'object' or x ->> 'tipo' is distinct from p_tipo then continue; end if;
    begin
      q := coalesce((x ->> 'qtd')::numeric, 1);
      v := coalesce((x ->> 'valor')::numeric, 0);
    exception when others then continue;
    end;
    begin
      v_id := nullif(x ->> case when p_tipo = 'produto' then 'produto_id' else 'servico_id' end, '')::uuid;
    exception when others then v_id := null;
    end;
    v_nome := coalesce(nullif(btrim(x ->> 'nome'), ''), 'Item');
    v_chave := coalesce(v_id::text, 'nome:' || lower(v_nome));
    v_pos := array_position(k, v_chave);
    if v_pos is null then
      k := k || v_chave; ids := ids || v_id; nomes := nomes || v_nome; qs := qs || 0::numeric; ws := ws || 0::numeric;
      v_pos := array_length(k, 1);
    end if;
    qs[v_pos] := qs[v_pos] + q;
    ws[v_pos] := ws[v_pos] + greatest(0, q * v);
  end loop;
  n := coalesce(array_length(k, 1), 0);
  if n = 0 then return; end if;
  for i in 1..n loop
    v_soma := v_soma + ws[i];
    if ws[i] > ws[v_maior] then v_maior := i; end if;
  end loop;
  for i in 1..n loop
    ws[i] := case when v_soma > 0 then round(p_total * ws[i] / v_soma, 2) else 0 end;
    v_dado := v_dado + ws[i];
  end loop;
  ws[v_maior] := ws[v_maior] + (p_total - v_dado);
  for i in 1..n loop
    servico_id := case when p_tipo = 'servico' then ids[i] end;
    produto_id := case when p_tipo = 'produto' then ids[i] end;
    nome := nomes[i]; qtd := qs[i]; valor := ws[i];
    return next;
  end loop;
end $function$;

CREATE OR REPLACE FUNCTION __ANTES__.comissao_linhas_calc(p_petshop uuid, p_de date, p_ate date, p_profissional uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profissional_id uuid, agendamento_id uuid, inicio timestamp with time zone, pacote boolean, tipo text, servico_id uuid, base numeric, pct numeric, valor numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with s as (
    select coalesce(x.fuso, 'America/Sao_Paulo') as fuso,
      coalesce(x.opcoes -> 'comissao.em_extras' = 'true'::jsonb, false) as em_extras,
      coalesce(x.opcoes -> 'comissao.por_servico' = 'true'::jsonb, false) as por_servico,
      case when coalesce(x.opcoes -> 'comissao.em_produtos' = 'true'::jsonb, false) and jsonb_typeof(x.opcoes -> 'comissao.produtos_pct') = 'number'
        then least(100, greatest(0, (x.opcoes ->> 'comissao.produtos_pct')::numeric)) else 0 end as produtos_pct
    from public.petshops x where x.id = p_petshop
  ), ags as (
    select a.id, a.inicio, a.servico_id, a.profissional_id, a.preco, a.pacote_cliente_id, p.comissao_pct, s.por_servico,
      l.id as conta_id, l.itens, pt.servico as parte_servico, coalesce(l.valor_original, l.valor) as valor_conta,
      exists (select 1 from public.agendamento_servicos e where e.agendamento_id = a.id) as varios,
      (l.id is null and a.pacote_cliente_id is not null) as pacote,
      case when l.id is not null then coalesce(pt.servico, coalesce(l.valor_original, l.valor)) + coalesce(df.valor, 0) else coalesce(a.preco, 0) end as base_servico,
      case when l.id is not null and s.em_extras then coalesce(pt.extra, 0) else 0 end as base_extra,
      case when l.id is not null and s.produtos_pct > 0 then greatest(0, coalesce(pt.produto, 0) - coalesce(dv.valor, 0)) else 0 end as produtos,
      case when s.por_servico then coalesce(cs.pct, p.comissao_pct) else p.comissao_pct end as pct,
      s.produtos_pct
    from s
    join public.agendamentos a on a.petshop_id = p_petshop and a.status = 'concluido' and a.profissional_id is not null
      and a.inicio >= (p_de::timestamp at time zone s.fuso) and a.inicio < ((p_ate + 1)::timestamp at time zone s.fuso)
    join public.profissionais p on p.id = a.profissional_id
    left join public.lancamentos l on l.agendamento_id = a.id and l.tipo = 'entrada'
    left join public.comissao_servicos cs on cs.servico_id = a.servico_id
    left join lateral public.partes_do_lancamento(coalesce(l.valor_original, l.valor), l.itens) pt on l.id is not null
    -- "Cobrar a diferença": o que foi recebido à parte depois de a conta fechar
    left join lateral (
      select sum(coalesce(d.valor_original, d.valor)) as valor from public.lancamentos d
      where d.petshop_id = p_petshop and d.tipo = 'entrada' and d.agendamento_id is null
        and (d.diferenca_de = a.id or (d.diferenca_de is null and jsonb_typeof(d.itens) = 'array'
             and d.itens @> jsonb_build_array(jsonb_build_object('diferenca_de', a.id::text))))
    ) df on l.id is not null
    -- produtos desta conta que voltaram (troca ou devolução que continua valendo)
    left join lateral (
      select sum(v.valor) as valor from public.devolucoes v
      where v.venda_id = l.id and v.petshop_id = p_petshop and coalesce(v.saida_id, v.credito_id) is not null
    ) dv on l.id is not null
    where p_profissional is null or a.profissional_id = p_profissional
  ), partes as (
    -- um só serviço: o serviço (e os extras) no percentual do serviço
    select g.id, 1 as ordem, 'servico' as tipo, g.servico_id, g.base_servico as base, g.pct from ags g where not g.varios
    union all
    select g.id, 8, 'extra', null::uuid, g.base_extra, g.pct from ags g where g.base_extra <> 0
    -- vários serviços: cada um com o valor dele e o percentual que vale para ele
    union all
    select g.id, 2, 'servico', r.servico_id, r.valor, case when g.por_servico then coalesce(c2.pct, g.comissao_pct) else g.comissao_pct end
    from ags g
    cross join lateral (
      select t.servico_id, t.valor from public.partes_por_servico(g.id, g.base_servico, g.itens, g.parte_servico is not null) t where g.conta_id is not null
      union all
      select e.servico_id, coalesce(e.preco, 0) from public.agendamento_servicos e where g.conta_id is null and e.agendamento_id = g.id
    ) r
    left join public.comissao_servicos c2 on c2.servico_id = r.servico_id
    where g.varios
    union all
    select g.id, 1, case when g.pacote_cliente_id is not null then 'pacote' else 'servico' end, g.servico_id, coalesce(g.preco, 0), g.pct from ags g where g.varios and (g.conta_id is null or g.pacote_cliente_id is not null)
    union all
    select g.id, 9, 'produto', null::uuid, g.produtos, g.produtos_pct from ags g where g.produtos <> 0
  )
  select g.profissional_id, g.id, g.inicio, (g.pacote or (g.varios and g.pacote_cliente_id is not null)),
    coalesce(x.tipo, 'nada'), x.servico_id, coalesce(x.base, 0), coalesce(x.pct, 0), coalesce(x.base * x.pct / 100, 0)
  from ags g
  left join partes x on x.id = g.id
  order by g.inicio, g.id, x.ordem
$function$;
