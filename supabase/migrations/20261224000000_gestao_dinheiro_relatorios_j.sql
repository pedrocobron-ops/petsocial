-- Rodada 8 (J): dinheiro e relatórios que batem entre si (Sandra, "completa", e os outros dois testadores).
--
-- 1. Troca e devolução nos relatórios de produto: o que voltou sai da quantidade vendida e da receita.
--    · devolucoes_por_produto(p, de, até): as devoluções do período por produto (quantidade, valor que voltou, custo que voltou
--      ao estoque, unidades sem custo), pelo dia da devolução: a mesma conta de "Quanto sobrou" (lucro_do_periodo, 20261200).
--      Para Relatórios > Produtos e o cartão "Produtos vendidos no mês" do Financeiro.
--    · indicadores_do_periodo (última: 20261221): "Produtos mais vendidos" já sem o que voltou. Só muda o CTE pr.
-- 2. Fiado: o que conta no limite é o que o tutor deve agora. Mensalidade da creche e sinal de reserva que ainda não venceram
--    são de um serviço que ainda vai acontecer: ficam de fora do limite até vencer (e aparecem como "a vencer").
--    · conta_fora_do_limite(...): a regra (a mesma de foraDoLimite em src/lib/gestao/fiado.ts).
--    · fiado_deve (última: 20261200): mesma assinatura, sem as contas acima.
--    · fiado_situacao (última: 20261200): devolve também vencido, vence_hoje, a_vencer, total e fora_do_limite.
-- 3. Promoção do horário (aniversário, dia fraco) gravada como uma linha negativa da conta ("promo": true), para o desconto sair
--    só do serviço (partes_do_lancamento já abate linha negativa primeiro do serviço). anotar_preco_da_venda (última: 20261205)
--    ignora essa linha na soma, então a promoção continua indo para promo_usos e não vira "desconto do caixa".
-- 4. Planilha de clientes com nascimento e sexo do pet: importar_clientes (última: 20261217), mesma assinatura.
-- Tudo aditivo: o app de antes continua funcionando (sem linha de promoção, nada muda; linha de planilha sem nascimento e sexo
-- entra como antes).

-- =====================================================================================================================
-- 1. Devoluções por produto no período
-- =====================================================================================================================
create or replace function public.devolucoes_por_produto(p uuid, p_de date, p_ate date)
returns table (produto_id uuid, nome text, quantidade numeric, avariados numeric, valor numeric, custo_volta numeric, sem_custo numeric)
language sql stable security definer set search_path = '' as $$
  select (i ->> 'produto_id')::uuid, (array_agg(i ->> 'nome'))[1], sum((i ->> 'qtd')::numeric),
    sum(coalesce((i ->> 'avariados')::numeric, 0)), sum((i ->> 'valor')::numeric),
    sum(round(((i ->> 'qtd')::numeric - coalesce((i ->> 'avariados')::numeric, 0)) * coalesce((i ->> 'custo')::numeric, 0), 2)),
    sum(case when i ->> 'custo' is null then (i ->> 'qtd')::numeric - coalesce((i ->> 'avariados')::numeric, 0) else 0 end)
  from public.devolucoes dv cross join lateral jsonb_array_elements(dv.itens) i
  where dv.petshop_id = p and coalesce(dv.saida_id, dv.credito_id) is not null
    and (select public.tenho_area(p, array['financeiro', 'relatorios']))
    and dv.criado_em >= (p_de::timestamp at time zone coalesce((select x.fuso from public.petshops x where x.id = p), 'America/Sao_Paulo'))
    and dv.criado_em < ((p_ate + 1)::timestamp at time zone coalesce((select x.fuso from public.petshops x where x.id = p), 'America/Sao_Paulo'))
  group by 1
$$;
revoke execute on function public.devolucoes_por_produto(uuid, date, date) from public, anon;
grant execute on function public.devolucoes_por_produto(uuid, date, date) to authenticated;

-- Indicadores: igual à de 20261221000000_gestao_creche_hotel_caixa_rodada2.sql; só "pr" desconta as devoluções (dvp).
create or replace function public.indicadores_do_periodo(p uuid, p_de date, p_ate date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
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
end $$;
revoke execute on function public.indicadores_do_periodo(uuid, date, date) from public, anon;
grant execute on function public.indicadores_do_periodo(uuid, date, date) to authenticated;


-- =====================================================================================================================
-- 2. Fiado: vencido, vence hoje, a vencer; o limite conta o que é devido agora
-- =====================================================================================================================
-- Conta a receber que ainda não conta no limite: vence depois de hoje e é de um serviço que ainda vai acontecer
-- (mensalidade da creche gerada para o mês, sinal de reserva). Fiado de venda ou de atendimento já feito sempre conta.
create or replace function public.conta_fora_do_limite(p_categoria text, p_descricao text, p_vencimento date, p_hoje date) returns boolean
language sql immutable set search_path = '' as $$
  select p_vencimento is not null and p_vencimento > p_hoje
    and (p_categoria = 'Creche: mensalidade' or coalesce(p_descricao, '') ~* '^\s*(sinal da reserva|pago adiantado):')
$$;
revoke execute on function public.conta_fora_do_limite(text, text, date, date) from public, anon;
grant execute on function public.conta_fora_do_limite(text, text, date, date) to authenticated;

-- O dia de hoje no fuso do pet shop.
create or replace function public.hoje_do_petshop(p uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce((select s.fuso from public.petshops s where s.id = p), 'America/Sao_Paulo'))::date
$$;
revoke execute on function public.hoje_do_petshop(uuid) from public, anon, authenticated;

-- Igual à de 20261200, sem as contas que ainda não contam no limite.
create or replace function public.fiado_deve(p_petshop uuid, p_cliente uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.valor), 0) from public.lancamentos l
  where l.petshop_id = p_petshop and l.cliente_id = p_cliente and l.tipo = 'entrada' and not l.pago and l.movimento is null
    and not public.conta_fora_do_limite(l.categoria, l.descricao, l.vencimento, public.hoje_do_petshop(p_petshop))
$$;
revoke execute on function public.fiado_deve(uuid, uuid) from public, anon, authenticated;

-- Igual à de 20261200, com a dívida separada por vencimento: vencido, vence hoje, a vencer (o total) e o que fica fora do limite.
-- "deve" continua sendo o que conta no limite.
create or replace function public.fiado_situacao(p_petshop uuid, p_cliente uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_lim numeric; v_deve numeric; v_proprio numeric; v_nome text; v_hoje date; v_div record;
begin
  if not public.tenho_area(p_petshop, array['caixa', 'financeiro', 'relatorios']) then
    raise exception 'Só quem mexe com dinheiro vê o fiado.' using errcode = '42501';
  end if;
  select c.limite_fiado, c.nome into v_proprio, v_nome from public.clientes c where c.id = p_cliente and c.petshop_id = p_petshop;
  if not found then return null; end if;
  v_hoje := public.hoje_do_petshop(p_petshop);
  v_lim := public.fiado_limite_de(p_petshop, p_cliente);
  v_deve := public.fiado_deve(p_petshop, p_cliente);
  select coalesce(sum(l.valor) filter (where l.vencimento < v_hoje), 0) as vencido,
         coalesce(sum(l.valor) filter (where l.vencimento = v_hoje or l.vencimento is null), 0) as hoje,
         coalesce(sum(l.valor) filter (where l.vencimento > v_hoje), 0) as depois,
         coalesce(sum(l.valor), 0) as total,
         coalesce(sum(l.valor) filter (where public.conta_fora_do_limite(l.categoria, l.descricao, l.vencimento, v_hoje)), 0) as fora
    into v_div
    from public.lancamentos l
   where l.petshop_id = p_petshop and l.cliente_id = p_cliente and l.tipo = 'entrada' and not l.pago and l.movimento is null;
  return jsonb_build_object('nome', v_nome, 'limite', v_lim, 'do_cliente', v_proprio is not null, 'deve', v_deve,
    'disponivel', case when v_lim is null then null else greatest(v_lim - v_deve, 0) end,
    'vencido', v_div.vencido, 'vence_hoje', v_div.hoje, 'a_vencer', v_div.depois, 'total', v_div.total, 'fora_do_limite', v_div.fora);
end $$;
revoke execute on function public.fiado_situacao(uuid, uuid) from public, anon;
grant execute on function public.fiado_situacao(uuid, uuid) to authenticated;

-- =====================================================================================================================
-- 3. Promoção do horário como linha da conta
-- =====================================================================================================================
-- Cópia de anotar_preco_da_venda (20261205000000_gestao_promo_niver_pacote.sql). Diferença: a linha com "promo": true (a
-- promoção do horário, negativa) não entra na soma dos itens.
create or replace function public.anotar_preco_da_venda() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_nome text;
  v_op jsonb;
  v_travado boolean;
  v_max numeric;
  v_fin boolean;
  i jsonb;
  v_valor numeric;
  v_qtd numeric;
  v_tabela numeric;
  v_custo numeric;
  v_soma numeric := 0;
  v_item text;
  v_desc numeric;
  v_promo jsonb;
  v_principal uuid;
  v_promo_usado numeric := 0;
begin
  if v_user is null or new.tipo <> 'entrada' or new.conta_id is not null or new.movimento is not null then return null; end if;
  if new.itens is null or jsonb_typeof(new.itens) <> 'array' then return null; end if;
  -- só a conta do atendimento e a venda de produtos têm preço de tabela para comparar
  if new.agendamento_id is null and new.categoria <> 'Venda de produtos' then return null; end if;
  select s.opcoes into v_op from public.petshops s where s.id = new.petshop_id;
  v_travado := coalesce(v_op -> 'dinheiro.preco_travado' = 'true'::jsonb, false);
  v_max := case when jsonb_typeof(v_op -> 'dinheiro.desconto_max_caixa') = 'number' then least(100, greatest(0, (v_op ->> 'dinheiro.desconto_max_caixa')::numeric)) else 0 end;
  v_fin := public.cuido_do_financeiro(new.petshop_id);
  select x.nome into v_nome from public.profissionais x where x.petshop_id = new.petshop_id and x.user_id = v_user limit 1;

  for i in select * from jsonb_array_elements(new.itens) loop
    if jsonb_typeof(i) <> 'object' or jsonb_typeof(i -> 'valor') <> 'number' then continue; end if;
    -- a linha da promoção do horário (negativa, "promo": true) não entra na soma: o desconto dela continua sendo visto
    -- abaixo (promo_usos), como quando a promoção vinha só como valor menor
    if i ->> 'promo' = 'true' then continue; end if;
    v_valor := (i ->> 'valor')::numeric;
    v_qtd := case when jsonb_typeof(i -> 'qtd') = 'number' then (i ->> 'qtd')::numeric else 1 end;
    v_soma := v_soma + round(v_qtd * v_valor, 2);
    v_item := left(coalesce(nullif(btrim(i ->> 'nome'), ''), 'Item'), 120);
    v_tabela := null; v_custo := null;
    if i ->> 'tipo' = 'produto' and (i ->> 'produto_id') ~ '^[0-9a-fA-F-]{36}$' then
      select x.preco_venda, x.custo into v_tabela, v_custo from public.produtos x where x.id = (i ->> 'produto_id')::uuid and x.petshop_id = new.petshop_id;
    elsif i ->> 'tipo' = 'servico' and new.agendamento_id is not null then
      if (i ->> 'servico_id') ~ '^[0-9a-fA-F-]{36}$' then
        select e.preco into v_tabela from public.agendamento_servicos e where e.agendamento_id = new.agendamento_id and e.servico_id = (i ->> 'servico_id')::uuid limit 1;
      else
        select a.preco into v_tabela from public.agendamentos a where a.id = new.agendamento_id;
      end if;
    end if;
    -- um centavo de folga: venda por peso arredonda o preço de uma unidade
    if v_tabela is not null and abs(v_valor - v_tabela) > 0.011 then
      if v_travado and not v_fin then
        raise exception 'O preço de % é %. Só o dono ou quem vê o financeiro muda o preço na venda.', v_item, 'R$ ' || replace(to_char(v_tabela, 'FM999999990D00'), '.', ',');
      end if;
      insert into public.precos_alterados (petshop_id, lancamento_id, tipo, item, de, para, qtd, abaixo_do_custo, quem, quem_nome)
        values (new.petshop_id, new.id, 'preco', v_item, v_tabela, v_valor, v_qtd, coalesce(v_custo > 0 and v_valor < v_custo, false), v_user, v_nome);
    end if;
  end loop;

  v_desc := v_soma - coalesce(new.valor_original, new.valor);
  -- a promoção do horário (o dono montou): não é desconto do caixa. Fica em promo_usos; o resto segue a regra de sempre.
  if new.agendamento_id is not null and v_desc > 0.005 then
    select a.promo, a.servico_id into v_promo, v_principal from public.agendamentos a where a.id = new.agendamento_id and a.petshop_id = new.petshop_id;
    v_promo_usado := least(public.promo_desconto(v_promo, new.petshop_id, new.itens, v_principal), v_desc);
    if v_promo_usado > 0 then
      insert into public.promo_usos (petshop_id, promo_id, promo_nome, agendamento_id, lancamento_id, desconto)
        values (new.petshop_id, case when (v_promo ->> 'id') ~ '^[0-9a-fA-F-]{36}$' then (v_promo ->> 'id')::uuid end,
                left(coalesce(v_promo ->> 'nome', 'Promoção'), 60), new.agendamento_id, new.id, v_promo_usado)
        on conflict (lancamento_id) do nothing;
      v_desc := v_desc - v_promo_usado;
    end if;
  end if;
  if v_desc > 0.005 then
    -- o limite arredonda para baixo, em centavos (a tela mostra o mesmo número)
    if v_travado and not v_fin and v_desc > floor(v_soma * v_max + 0.000001) / 100 + 0.005 then
      if v_max > 0 then
        raise exception 'O desconto passa do máximo de % por cento que o caixa pode dar (% nesta conta). Peça para o dono ou para quem vê o financeiro.',
          replace(trim(to_char(v_max, 'FM990D99'), ',.'), '.', ','), public.em_reais(floor(v_soma * v_max + 0.000001) / 100);
      end if;
      raise exception 'Só o dono ou quem vê o financeiro dá desconto na venda.';
    end if;
    insert into public.precos_alterados (petshop_id, lancamento_id, tipo, item, de, para, quem, quem_nome)
      values (new.petshop_id, new.id, 'desconto', left(coalesce(nullif(btrim(new.descricao), ''), new.categoria), 120), v_soma - v_promo_usado, coalesce(new.valor_original, new.valor), v_user, v_nome);
  end if;
  return null;
end $$;
revoke execute on function public.anotar_preco_da_venda() from public, anon, authenticated;

-- =====================================================================================================================
-- 4. Planilha de clientes: nascimento e sexo do pet
-- =====================================================================================================================
-- Cópia de importar_clientes (20261217000000_gestao_importar_rascunhos.sql), com nascimento (AAAA-MM-DD; ano 1904 = sem ano)
-- e sexo (M ou F) do pet em cada linha: pet novo entra com eles; pet que já existe só ganha o que estava em branco. O resumo
-- conta com_nascimento e guarda as datas que a tela não conseguiu ler (nascimento_ruim). Linhas sem esses campos: como antes.
create or replace function public.importar_clientes(p_petshop uuid, p_chave text, p_linhas jsonb, p_extra jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = ''
-- cada linha procura o tutor e o pet pelos índices de telefone e nome; com a tabela recém-criada (estatística de "vazia") o
-- planejador escolheria ler a tabela inteira a cada linha e 2.000 linhas passariam do tempo do banco
set enable_seqscan = off
as $$
declare
  v_id uuid; v_em timestamptz; i public.importacoes;
  r jsonb; p public.pets;
  v_nome text; v_fone text; v_cf text; v_email text; v_end text;
  v_cli uuid; v_homon uuid; v_fone_h text; v_outro boolean;
  v_pet text; v_esp text; v_esp_dada boolean; v_raca text; v_porte text; v_obs text; v_alerta text;
  v_nasc date; v_sexo text; com_nasc int := 0;
  n_tut int := 0; n_pets int := 0; ja_estavam int := 0; repetidas int := 0; homonimos int := 0; com_alerta int := 0;
  comp_tut uuid[] := '{}'; comp_pets uuid[] := '{}'; mesmo_nome text[] := '{}';
  novos_cli uuid[] := '{}'; novos_pets uuid[] := '{}';
  v_resumo jsonb; extra jsonb := coalesce(p_extra, '{}'::jsonb);
begin
  if p_petshop is null or p_petshop not in (select public.meus_petshops()) then raise exception 'Pet shop não encontrado.'; end if;
  if not public.acesso_liberado(p_petshop) then raise exception 'Sua conta está só para consulta.'; end if;
  if not public.tenho_area(p_petshop, array['clientes']) then raise exception 'Você não tem permissão para mexer nos clientes.'; end if;
  if p_chave is null or length(p_chave) not between 8 and 200 then raise exception 'Pedido incompleto.'; end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then raise exception 'A planilha veio vazia.'; end if;
  if jsonb_array_length(p_linhas) > 4000 then raise exception 'Traga até 2.000 linhas por vez.'; end if;

  -- a mesma importação de novo (toque duplo, a internet caiu e a pessoa tentou de novo): devolve o que já entrou
  insert into public.importacoes (petshop_id, chave, tipo, criado_por) values (p_petshop, p_chave, 'clientes', auth.uid())
    on conflict (petshop_id, chave) do nothing returning id, criado_em into v_id, v_em;
  if v_id is null then
    select * into i from public.importacoes x where x.petshop_id = p_petshop and x.chave = p_chave;
    return jsonb_build_object('id', i.id, 'em', i.criado_em, 'resumo', i.resumo, 'clientes', to_jsonb(i.clientes), 'pets', to_jsonb(i.pets), 'repetida', true);
  end if;

  for r in select value from jsonb_array_elements(p_linhas) loop
    continue when jsonb_typeof(r) <> 'object';
    v_nome := left(btrim(regexp_replace(coalesce(r->>'tutor', ''), '\s+', ' ', 'g')), 120);
    continue when v_nome = '';
    v_fone := nullif(regexp_replace(coalesce(r->>'fone', ''), '\D', '', 'g'), '');
    v_cf := public.imp_fim_fone(v_fone);
    if v_cf = '' then v_fone := null; end if;
    v_email := nullif(left(btrim(coalesce(r->>'email', '')), 160), '');
    v_end := nullif(left(btrim(coalesce(r->>'endereco', '')), 200), '');

    -- o tutor: pelo telefone; senão pelo nome, se o telefone não for outro
    v_cli := null; v_outro := false;
    if v_cf <> '' then
      select c.id into v_cli from public.clientes c
        where c.petshop_id = p_petshop and public.imp_fim_fone(c.telefone) = v_cf order by c.criado_em, c.id limit 1;
    end if;
    if v_cli is null then
      v_homon := null; v_fone_h := '';
      select c.id, public.imp_fim_fone(c.telefone) into v_homon, v_fone_h from public.clientes c
        where c.petshop_id = p_petshop and public.imp_chave_nome(c.nome) = public.imp_chave_nome(v_nome)
        order by (c.id = any (novos_cli)) desc, c.criado_em desc, c.id desc limit 1;
      v_outro := v_homon is not null and v_cf <> '' and coalesce(v_fone_h, '') <> '' and v_fone_h <> v_cf;
      if not v_outro then v_cli := v_homon; end if;
    end if;
    if v_cli is null then
      insert into public.clientes (petshop_id, nome, telefone, email, endereco) values (p_petshop, v_nome, v_fone, v_email, v_end)
        returning id into v_cli;
      novos_cli := novos_cli || v_cli;
      n_tut := n_tut + 1;
      if v_outro then homonimos := homonimos + 1; end if;
    else
      -- já existe: só preenche o que está em branco, nunca troca o que a pessoa já tinha
      update public.clientes c set
          telefone = case when coalesce(btrim(c.telefone), '') = '' and v_fone is not null then v_fone else c.telefone end,
          email = case when coalesce(btrim(c.email), '') = '' and v_email is not null then v_email else c.email end,
          endereco = case when coalesce(btrim(c.endereco), '') = '' and v_end is not null then v_end else c.endereco end
        where c.id = v_cli and ((coalesce(btrim(c.telefone), '') = '' and v_fone is not null)
          or (coalesce(btrim(c.email), '') = '' and v_email is not null) or (coalesce(btrim(c.endereco), '') = '' and v_end is not null));
      if found and not (v_cli = any (novos_cli)) and not (v_cli = any (comp_tut)) then comp_tut := comp_tut || v_cli; end if;
    end if;

    -- o pet
    v_pet := left(btrim(regexp_replace(coalesce(r->>'pet', ''), '\s+', ' ', 'g')), 80);
    continue when v_pet = '';
    v_esp := case r->>'especie' when 'gato' then 'gato' when 'outro' then 'outro' else 'cao' end;
    v_esp_dada := coalesce(r->>'especie_dada', '') = 'true';
    v_raca := nullif(left(btrim(coalesce(r->>'raca', '')), 60), '');
    v_porte := case when r->>'porte' in ('P', 'M', 'G', 'GG') then r->>'porte' end;
    v_obs := nullif(left(btrim(coalesce(r->>'obs', '')), 600), '');
    v_alerta := nullif(left(btrim(coalesce(r->>'alertas', '')), 600), '');
    -- nascimento (AAAA-MM-DD; 1904 = sem ano, como na ficha) e sexo do pet, quando a planilha traz
    v_nasc := null;
    if coalesce(r->>'nascimento', '') ~ '^\d{4}-\d{2}-\d{2}$' then
      begin
        v_nasc := (r->>'nascimento')::date;
        if v_nasc > current_date or (v_nasc < date '1980-01-01' and extract(year from v_nasc) <> 1904) then v_nasc := null; end if;
      exception when others then v_nasc := null;
      end;
    end if;
    v_sexo := case when r->>'sexo' in ('M', 'F') then r->>'sexo' end;

    select * into p from public.pets x
      where x.petshop_id = p_petshop and x.cliente_id = v_cli and public.imp_chave_nome(x.nome) = public.imp_chave_nome(v_pet)
      order by x.criado_em, x.id limit 1;
    if not found then
      insert into public.pets (petshop_id, cliente_id, nome, especie, raca, porte, obs, alertas, nascimento, sexo)
        values (p_petshop, v_cli, v_pet, v_esp, v_raca, v_porte, v_obs, v_alerta, v_nasc, v_sexo) returning id into p.id;
      novos_pets := novos_pets || p.id;
      n_pets := n_pets + 1;
      if v_nasc is not null then com_nasc := com_nasc + 1; end if;
      if v_alerta is not null then com_alerta := com_alerta + 1; end if;
      continue;
    end if;
    if p.id = any (novos_pets) then
      -- mesmo tutor, mesmo nome de pet, duas linhas: linha repetida ou dois pets de verdade?
      if (v_esp_dada and v_esp <> p.especie)
        or (v_raca is not null and coalesce(p.raca, '') <> '' and public.imp_chave_nome(v_raca) <> public.imp_chave_nome(p.raca))
        or (v_porte is not null and p.porte is not null and v_porte <> p.porte) then
        mesmo_nome := mesmo_nome || format('%s (de %s)', v_pet, v_nome);
        continue;
      end if;
      repetidas := repetidas + 1;
    end if;
    update public.pets x set
        raca = case when coalesce(btrim(x.raca), '') = '' and v_raca is not null then v_raca else x.raca end,
        porte = case when x.porte is null and v_porte is not null then v_porte else x.porte end,
        obs = case when coalesce(btrim(x.obs), '') = '' and v_obs is not null then v_obs else x.obs end,
        alertas = case when coalesce(btrim(x.alertas), '') = '' and v_alerta is not null then v_alerta else x.alertas end,
        nascimento = case when x.nascimento is null and v_nasc is not null then v_nasc else x.nascimento end,
        sexo = case when x.sexo is null and v_sexo is not null then v_sexo else x.sexo end
      where x.id = p.id and ((coalesce(btrim(x.raca), '') = '' and v_raca is not null) or (x.porte is null and v_porte is not null)
        or (coalesce(btrim(x.obs), '') = '' and v_obs is not null) or (coalesce(btrim(x.alertas), '') = '' and v_alerta is not null)
        or (x.nascimento is null and v_nasc is not null) or (x.sexo is null and v_sexo is not null));
    if found then
      if not (p.id = any (novos_pets)) and not (p.id = any (comp_pets)) then comp_pets := comp_pets || p.id; end if;
    elsif not (p.id = any (novos_pets)) then
      ja_estavam := ja_estavam + 1;
    end if;
  end loop;

  v_resumo := jsonb_build_object(
    'tutores_novos', n_tut, 'pets_novos', n_pets,
    'tutores_completados', cardinality(comp_tut), 'pets_completados', cardinality(comp_pets),
    'ja_estavam', ja_estavam, 'linhas_repetidas', repetidas, 'mesmo_nome', to_jsonb(mesmo_nome),
    'homonimos', homonimos, 'com_alerta', com_alerta,
    'linhas', jsonb_array_length(p_linhas),
    -- o que só a tela sabe (listas curtas de nomes, para a pessoa conferir)
    'fone_ruim', case when jsonb_typeof(extra->'fone_ruim') = 'array' then (select coalesce(jsonb_agg(left(x, 120)), '[]') from (select jsonb_array_elements_text(extra->'fone_ruim') x limit 200) y) else '[]' end,
    'dois_fones', case when jsonb_typeof(extra->'dois_fones') = 'array' then (select coalesce(jsonb_agg(left(x, 120)), '[]') from (select jsonb_array_elements_text(extra->'dois_fones') x limit 200) y) else '[]' end,
    'sem_pet', coalesce(extra->>'sem_pet', '') = 'true',
    'separados', case when jsonb_typeof(extra->'separados') = 'number' then (extra->>'separados')::int else 0 end,
    'com_nascimento', com_nasc,
    'nascimento_ruim', case when jsonb_typeof(extra->'nascimento_ruim') = 'array' then (select coalesce(jsonb_agg(left(x, 120)), '[]') from (select jsonb_array_elements_text(extra->'nascimento_ruim') x limit 200) y) else '[]' end
  );
  update public.importacoes set resumo = v_resumo, clientes = novos_cli, pets = novos_pets where id = v_id;
  return jsonb_build_object('id', v_id, 'em', v_em, 'resumo', v_resumo, 'clientes', to_jsonb(novos_cli), 'pets', to_jsonb(novos_pets), 'repetida', false);
end $$;
revoke execute on function public.importar_clientes(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.importar_clientes(uuid, text, jsonb, jsonb) to authenticated;

