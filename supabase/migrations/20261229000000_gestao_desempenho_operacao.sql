-- Rodada 9 (N2): desempenho do banco e operação.
--
-- 1. Índices nas chaves estrangeiras que as telas e as exclusões usam (estadias por pet, horários por pacote, lançamentos por
--    cliente, por caixa e por atendimento, horários por profissional) e por pet shop nas tabelas que ainda não tinham.
--    Em produção, com tabela grande, prefira criar ANTES, fora de transação, com CREATE INDEX CONCURRENTLY e o mesmo nome
--    (o "if not exists" daqui passa direto): estadias_pet_id_idx, agendamentos_pacote_cliente_idx, agendamentos_profissional_idx,
--    lancamentos_cliente_idx, lancamentos_caixa_idx, lancamentos_agendamento_idx, movimentos_lotes_petshop_idx.
-- 2. link_vaga e conflitos_agenda: só olham os horários que começaram até 7 dias antes (não a história toda da loja).
-- 3. indicadores_do_periodo: a tabela dos meses agrupada uma vez (mesmo resultado); pacotes_acabando procura a última vez só
--    de quem precisa; partes_do_lancamento, partes_por_servico e lucro_repartir percorrem os itens sem abrir consulta;
--    comissao_linhas_calc soma "cobrar a diferença" uma vez por pet shop (antes, uma busca por atendimento).
-- 4. Apagar a conta de um pet shop com história: em lotes, por tabela, das folhas para a raiz, retomando de onde parou
--    (gestao_exclusoes_processar, gestao_loja_apagar, gestao_loja_plano), com o andamento em exclusoes_conta. Os logins que
--    sobram ficam na fila logins_lixo até saírem do Auth (gestao_logins_lixo, gestao_login_lixo_feito).
-- 5. Operação: rotinas_execucoes (última vez que cada rotina agendada rodou), rotina_anotar, admin_rotinas; erro_do_banco
--    grava em erros_app o que antes só virava aviso no log (creche_taxi_anotar, contas_fixas_gerar_todas); gestao_hoje diz
--    quais partes falharam (chave "falhas", a tela registra).
-- 6. link_inicial: as oito leituras da abertura do link do cliente numa ida só.
--
-- Funções trocadas (cópia da definição mais recente + a mudança):
--   link_vaga (20261148), conflitos_agenda (20261177), pacotes_acabando (20261205), indicadores_do_periodo (20261224),
--   partes_do_lancamento (20261216), partes_por_servico (20261147), lucro_repartir (20261193), comissao_linhas_calc (20261200),
--   creche_taxi_anotar (20261218), contas_fixas_gerar_todas (20261212), gestao_hoje (20261223), admin_exclusoes (20261199),
--   gestao_exclusoes_processar (20261213; ganhou p_segundos com padrão, a de dois parâmetros sai).

-- ───────────────────────── 1. índices ─────────────────────────
create index if not exists estadias_pet_id_idx on public.estadias (pet_id);
create index if not exists agendamentos_pacote_cliente_idx on public.agendamentos (pacote_cliente_id) where pacote_cliente_id is not null;
create index if not exists agendamentos_profissional_idx on public.agendamentos (profissional_id, inicio) where profissional_id is not null;
create index if not exists lancamentos_cliente_idx on public.lancamentos (cliente_id, data desc) where cliente_id is not null;
create index if not exists lancamentos_caixa_idx on public.lancamentos (caixa_id) where caixa_id is not null;
create index if not exists lancamentos_agendamento_idx on public.lancamentos (agendamento_id) where agendamento_id is not null;
-- por pet shop, nas tabelas que só tinham índice por outra coluna (a exclusão da conta e a lista dos caixas leem por pet shop)
create index if not exists caixas_petshop_aberto_idx on public.caixas (petshop_id, aberto_em desc);
create index if not exists movimentos_lotes_petshop_idx on public.movimentos_lotes (petshop_id);
create index if not exists produtos_lotes_petshop_idx on public.produtos_lotes (petshop_id);
create index if not exists contagens_itens_petshop_idx on public.contagens_itens (petshop_id);
create index if not exists produtos_kit_itens_petshop_idx on public.produtos_kit_itens (petshop_id);
create index if not exists estadias_horas_hist_petshop_idx on public.estadias_horas_hist (petshop_id);
create index if not exists lancamentos_entregue_petshop_idx on public.lancamentos_entregue (petshop_id);
create index if not exists convites_equipe_petshop_idx on public.convites_equipe (petshop_id);
create index if not exists pacotes_petshop_idx on public.pacotes (petshop_id);
create index if not exists series_agenda_petshop_idx on public.series_agenda (petshop_id);
create index if not exists caderno_reservas_petshop_idx on public.caderno_reservas (petshop_id);
create index if not exists mozart_tempos_petshop_idx on public.mozart_tempos (petshop_id);
create index if not exists presenca_petshop_idx on public.presenca (petshop_id);

-- ───────────────────────── 2. vaga do link e conflito na agenda ─────────────────────────
-- Nenhum horário da agenda dura 7 dias (hospedagem é estadia, não horário): o limite de baixo deixa o índice
-- (petshop_id, inicio) trazer só a semana em volta. Os bloqueios continuam sem limite (férias duram mais de uma semana).
CREATE OR REPLACE FUNCTION public.link_vaga(p_petshop uuid, p_inicio timestamp with time zone, p_fim timestamp with time zone)
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
    (select count(*) from public.agendamentos where petshop_id = p_petshop and status not in ('cancelado', 'faltou') and inicio < p_fim and fim > p_inicio and inicio > p_inicio - interval '7 days')
    + (select count(*) from public.pedidos_agendamento where petshop_id = p_petshop and status = 'pendente' and tipo = 'servico' and inicio < p_fim and fim > p_inicio and inicio > p_inicio - interval '7 days')
    + (select count(distinct profissional_id) from public.bloqueios where petshop_id = p_petshop and profissional_id is not null and inicio < p_fim and fim > p_inicio)
  into v_ocupados;
  return v_ocupados < v_cap;
end $function$;

CREATE OR REPLACE FUNCTION public.conflitos_agenda(p_petshop uuid, p_profissional uuid, p_inicio timestamp with time zone, p_fim timestamp with time zone, p_ignorar uuid DEFAULT NULL::uuid)
 RETURNS SETOF agendamentos
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
      and inicio < p_fim and fim > p_inicio and inicio > p_inicio - interval '7 days'
      and (p_ignorar is null or id <> p_ignorar)
  loop
    -- sem área de dinheiro: o preço e o valor guardado na conclusão (20261169) saem em branco
    -- (jsonb_populate_record ignora a coluna que ainda não existe)
    if not v_vejo then r := jsonb_populate_record(r, '{"preco": null, "valor_concluido": null, "concluido_servicos": null}'::jsonb); end if;
    return next r;
  end loop;
end $function$;

-- ───────────────────────── 3. relatórios ─────────────────────────
CREATE OR REPLACE FUNCTION public.pacotes_acabando(p uuid, p_pet uuid DEFAULT NULL::uuid)
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
      select z.id, z.pet_id, z.nome, z.total, z.usados, z.vence_em, z.servico_id, z.pacote_id,
             (case when z.cheio then z.acabou_cheio
                   else coalesce(z.acabou_k, (select max(a.inicio) from public.agendamentos a
                          where a.pacote_cliente_id = z.id and a.petshop_id = p and a.status = 'concluido')) end at time zone v_fuso)::date as acabou_em,
             z.dias, z.pet, z.tutor, z.motivo,
             case z.motivo when 'acabou' then 1 when 'vencido' then 2 when 'ultimo' then 3 else 4 end as ordem from (
        select k.id, k.pet_id, k.nome, k.total, k.usados, k.vence_em, k.servico_id, k.pacote_id,
               (k.usados >= k.total) as cheio, k.acabou_em as acabou_k, w.acabou as acabou_cheio,
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
          cross join lateral (select case when k.usados >= k.total then coalesce(k.acabou_em, (select max(a.inicio) from public.agendamentos a
                                where a.pacote_cliente_id = k.id and a.petshop_id = k.petshop_id and a.status = 'concluido')) end as acabou) w
         where k.petshop_id = p and (p_pet is null or k.pet_id = p_pet) and pp.ativo
           and not exists (select 1 from public.pacotes_clientes k2 where k2.petshop_id = p and k2.pet_id = k.pet_id and k2.id <> k.id
                             and k2.ativo and k2.usados < k2.total and (k2.vence_em is null or k2.vence_em >= v_hoje) and k2.criado_em > k.criado_em)
      ) z where z.motivo is not null
      order by 1 limit 200
    ) y), '[]'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.indicadores_do_periodo(p uuid, p_de date, p_ate date)
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
  sinais_id as materialized (select distinct x.id from sinais x where x.id is not null),
  sinais_pagos as materialized (
    select x.conta ->> 'lancamento_id' as lancamento, sum(x.sinal) as sinal
    from sinais x where x.sinal_estado = 'pago' and x.conta ->> 'lancamento_id' is not null group by 1
  ),
  ent as materialized (
    select l.id, l.data, l.valor, (l.conta_id is null and l.diferenca_de is null) as principal,
      (s1.id is not null or s2.id is not null) as do_sinal,
      coalesce(sp.sinal, 0) as sinal_descontado
    from public.lancamentos l
    left join sinais_id s1 on s1.id = l.id
    left join sinais_id s2 on s2.id = l.conta_id
    left join sinais_pagos sp on sp.lancamento = l.id::text
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
  -- a tabela dos meses: cada parte é agrupada uma vez por mês (antes, cada mês relia cada parte inteira)
  ent_m as (
    select to_char(e.data, 'YYYY-MM') as mes, sum(e.valor) as entradas,
      count(*) filter (where e.principal and not e.do_sinal) as contas,
      sum(e.valor + e.sinal_descontado) filter (where e.principal and not e.do_sinal) as valor_contas
    from ent e group by 1
  ),
  sai_m as (
    select to_char(s.data, 'YYYY-MM') as mes, sum(s.valor) filter (where s.devolucao) as devolvido, sum(s.valor) filter (where not s.devolucao) as saiu
    from sai s group by 1
  ),
  cred_m as (
    select to_char(c.dia, 'YYYY-MM') as mes, sum(c.valor) filter (where c.valor > 0) as deixado,
      -sum(c.valor) filter (where c.valor < 0 and c.lancamento_id is null) as usado_fora
    from cred c group by 1
  ),
  tx_m as (select to_char(t.data, 'YYYY-MM') as mes, sum(t.taxa) as taxas from tx t group by 1),
  ag_m as (
    select to_char(a.local, 'YYYY-MM') as mes, count(*) filter (where a.status = 'concluido') as atendimentos,
      count(*) filter (where a.status = 'faltou') as faltas, count(*) filter (where a.status = 'cancelado') as cancelados, count(*) as marcados
    from ag a group by 1
  ),
  er_m as (
    select to_char(x.dia, 'YYYY-MM') as mes, count(*) as estadias_marcadas, count(*) filter (where x.status = 'cancelada') as estadias_canceladas
    from er x group by 1
  ),
  ec_m as (select to_char(x.dia, 'YYYY-MM') as mes, count(*) as canceladas_no_periodo from ec x group by 1),
  nh_m as (select to_char(x.dia, 'YYYY-MM') as mes, count(*) as noites_hotel from nh x where x.dia between p_de and p_ate group by 1),
  es_m as (
    select to_char(e.dia, 'YYYY-MM') as mes, count(*) filter (where e.tipo = 'creche') as creche, count(*) filter (where e.tipo = 'hotel') as hotel
    from es e group by 1
  ),
  cli_m as (select to_char(n.dia, 'YYYY-MM') as mes, count(distinct n.cliente_id) as clientes from noper n group by 1),
  prim_m as (select to_char(x.dia, 'YYYY-MM') as mes, count(*) as primeira_vez from prim x where x.dia between p_de and p_ate group by 1),
  mm as (
    select m.mes, m.de, m.ate,
      coalesce(e.entradas, 0) as entradas, coalesce(e.contas, 0) as contas, coalesce(e.valor_contas, 0) as valor_contas,
      coalesce(s.devolvido, 0) as devolvido, coalesce(s.saiu, 0) as saiu,
      coalesce(c.deixado, 0) as deixado, coalesce(c.usado_fora, 0) as usado_fora,
      coalesce(t.taxas, 0) as taxas,
      coalesce(a.atendimentos, 0) as atendimentos, coalesce(a.faltas, 0) as faltas, coalesce(a.cancelados, 0) as cancelados, coalesce(a.marcados, 0) as marcados,
      coalesce(r.estadias_marcadas, 0) as estadias_marcadas, coalesce(r.estadias_canceladas, 0) as estadias_canceladas,
      coalesce(k.canceladas_no_periodo, 0) as canceladas_no_periodo, coalesce(h.noites_hotel, 0) as noites_hotel,
      coalesce(o.creche, 0) as creche, coalesce(o.hotel, 0) as hotel,
      coalesce(l.clientes, 0) as clientes, coalesce(v.primeira_vez, 0) as primeira_vez
    from meses m
    left join ent_m e on e.mes = m.mes
    left join sai_m s on s.mes = m.mes
    left join cred_m c on c.mes = m.mes
    left join tx_m t on t.mes = m.mes
    left join ag_m a on a.mes = m.mes
    left join er_m r on r.mes = m.mes
    left join ec_m k on k.mes = m.mes
    left join nh_m h on h.mes = m.mes
    left join es_m o on o.mes = m.mes
    left join cli_m l on l.mes = m.mes
    left join prim_m v on v.mes = m.mes
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

CREATE OR REPLACE FUNCTION public.partes_do_lancamento(p_valor numeric, p_itens jsonb)
 RETURNS TABLE(servico numeric, produto numeric, extra numeric)
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  x jsonb;
  i int;
  q numeric;
  v numeric;
  b_s numeric := 0; b_p numeric := 0; b_e numeric := 0;
  v_abate numeric := 0;
  v_tira numeric;
  v_soma numeric;
  v_sobra numeric;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then return next; return; end if;
  for i in 0..jsonb_array_length(p_itens) - 1 loop
    x := p_itens -> i;
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

CREATE OR REPLACE FUNCTION public.partes_por_servico(p_agendamento uuid, p_total numeric, p_itens jsonb, p_com_itens boolean)
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
  j int;
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
      for j in 0..jsonb_array_length(p_itens) - 1 loop
        x := p_itens -> j;
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

CREATE OR REPLACE FUNCTION public.lucro_repartir(p_total numeric, p_itens jsonb, p_tipo text)
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
  for i in 0..jsonb_array_length(p_itens) - 1 loop
    x := p_itens -> i;
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

CREATE OR REPLACE FUNCTION public.comissao_linhas_calc(p_petshop uuid, p_de date, p_ate date, p_profissional uuid DEFAULT NULL::uuid)
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
  ), difs as materialized (
    -- o que foi recebido à parte depois de a conta fechar, por atendimento (pela coluna; nas antigas, pela marca no item)
    select x.ag, sum(x.v) as valor from (
      select d.diferenca_de::text as ag, coalesce(d.valor_original, d.valor) as v
        from public.lancamentos d
       where d.petshop_id = p_petshop and d.tipo = 'entrada' and d.agendamento_id is null and d.diferenca_de is not null
      union all
      select m.ag, coalesce(d.valor_original, d.valor)
        from public.lancamentos d
        cross join lateral (
          select distinct e ->> 'diferenca_de' as ag
            from jsonb_array_elements(case when jsonb_typeof(d.itens) = 'array' then d.itens else '[]'::jsonb end) e
           where jsonb_typeof(e) = 'object' and jsonb_typeof(e -> 'diferenca_de') = 'string'
        ) m
       where d.petshop_id = p_petshop and d.tipo = 'entrada' and d.agendamento_id is null and d.diferenca_de is null
         and jsonb_typeof(d.itens) = 'array' and d.itens @? '$[*].diferenca_de'
    ) x group by x.ag
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
    left join difs df on l.id is not null and df.ag = a.id::text
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

-- ───────────────────────── 5a. erros do banco em erros_app ─────────────────────────
-- Erro que uma função do banco engole para não derrubar a gravação: além do aviso no log, uma linha em erros_app
-- (origem "servidor", tipo "banco", rota "banco:<função>"), com o mesmo freio e a mesma limpeza de erro_registrar. Nunca lança.
create or replace function public.erro_do_banco(p_onde text, p_mensagem text, p_petshop uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.erro_registrar('servidor', 'banco', left(coalesce(p_onde, 'banco') || ': ' || coalesce(p_mensagem, '(sem mensagem)'), 500),
    'ErroNoBanco', null, 'banco:' || coalesce(p_onde, ''), null, null, null, p_petshop, 'banco', false);
exception when others then
  null;
end $$;
revoke execute on function public.erro_do_banco(text, text, uuid) from public, anon, authenticated;
grant execute on function public.erro_do_banco(text, text, uuid) to service_role;

CREATE OR REPLACE FUNCTION public.creche_taxi_anotar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_taxi text; v_valor numeric; v_modo text; v_fuso text;
begin
  begin
    if tg_op = 'UPDATE' and new.status is not distinct from old.status and new.mensalista is not distinct from old.mensalista
       and new.plano_id is not distinct from old.plano_id then
      return null;
    end if;
    if new.tipo = 'creche' and new.plano_id is not null and new.mensalista is not null and new.status in ('em_casa', 'encerrada') then
      if exists (select 1 from public.creche_taxi t where t.estadia_id = new.id) then return null; end if;
      select pl.taxi, v.taxi_valor, v.taxi_modo into v_taxi, v_valor, v_modo
        from public.creche_planos pl left join public.creche_planos_valores v on v.plano_id = pl.id
       where pl.id = new.plano_id and pl.petshop_id = new.petshop_id;
      if v_taxi is null or coalesce(v_modo, 'dia') <> 'dia' or coalesce(v_valor, 0) <= 0 then return null; end if;
      select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = new.petshop_id;
      insert into public.creche_taxi (estadia_id, petshop_id, pet_id, plano_id, dia, taxi, valor)
        values (new.id, new.petshop_id, new.pet_id, new.plano_id, coalesce(new.dia, (new.entrada at time zone v_fuso)::date), v_taxi, v_valor)
        on conflict (estadia_id) do nothing;
    else
      delete from public.creche_taxi t where t.estadia_id = new.id and t.cobranca_id is null;
    end if;
  exception when others then
    -- o táxi é um apoio da cobrança: nunca derruba a chamada
    raise warning 'creche_taxi_anotar: %', sqlerrm;
    perform public.erro_do_banco('creche_taxi_anotar', sqlerrm, new.petshop_id);
  end;
  return null;
end $function$;

CREATE OR REPLACE FUNCTION public.contas_fixas_gerar_todas()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_total integer := 0; v_p uuid;
begin
  for v_p in select distinct c.petshop_id from public.contas_fixas c where c.ativa loop
    if not public.acesso_liberado(v_p) then continue; end if;
    begin
      v_total := v_total + public.contas_fixas_gerar_interno(v_p, null);
    exception when others then
      raise warning 'contas fixas de %: %', v_p, sqlerrm;
      perform public.erro_do_banco('contas_fixas_gerar_todas', sqlerrm, v_p);
    end;
  end loop;
  return v_total;
end $function$;

CREATE OR REPLACE FUNCTION public.gestao_hoje(p uuid, a jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_ini timestamptz := (a->>'hoje_ini')::timestamptz;
  v_amanha timestamptz := (a->>'amanha')::timestamptz;
  v_depois timestamptz := (a->>'depois')::timestamptz;
  v_seg timestamptz := (a->>'seg')::timestamptz;
  v_seg7 timestamptz := (a->>'seg7')::timestamptz;
  v_ha30 timestamptz := (a->>'ha30')::timestamptz;
  v_dia date := (a->>'dia')::date;
  v_ha6 date := (a->>'ha6')::date;
  v_mais7 date := (a->>'mais7')::date;
  v_estoque boolean := coalesce((a->>'estoque')::boolean, false);
  v_fin boolean := coalesce((a->>'financeiro')::boolean, false);
  v_cuido boolean := coalesce((a->>'cuido')::boolean, false);
  v_pacotes boolean := coalesce((a->>'pacotes')::boolean, false);
  v_cobrar boolean := coalesce((a->>'cobrar')::boolean, false);
  v_cobrar_hoje boolean := coalesce((a->>'cobrar_hoje')::boolean, false);
  v_devol text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(a->'devolucao', '[]'::jsonb)) x), array[]::text[]);
  v_r jsonb := '{}'::jsonb;
  v_lista jsonb;
  v_ids uuid[];
  v_x jsonb;
  v_n int;
  v_falhas jsonb := '[]'::jsonb;
begin
  -- agenda de hoje, com pet, tutor, serviços e profissional (o mesmo que SELECT_AGENDAMENTO)
  select coalesce(jsonb_agg(to_jsonb(x) order by x.inicio, x.id), '[]'::jsonb), coalesce(array_agg(x.id), array[]::uuid[]) into v_lista, v_ids from (
    select g.id, g.petshop_id, g.pet_id, g.servico_id, g.profissional_id, g.inicio, g.fim, g.status, g.obs, g.leva_traz, g.endereco_leva_traz,
      g.checklist, g.pacote_cliente_id, g.lembrete_em, g.origem, g.criado_por, g.criado_em, g.serie_id, g.foto_antes, g.foto_depois,
      g.pronto_avisado_em, g.sem_cobranca, g.sem_cobranca_em, g.sem_cobranca_nome, g.promo,
      (select to_jsonb(y) from (
        select pe.id, pe.nome, pe.foto, pe.porte, pe.especie, pe.raca, pe.alertas, pe.sexo,
          (select to_jsonb(z) from (select c.id, c.nome, c.telefone from public.clientes c where c.id = pe.cliente_id) z) as clientes
        from public.pets pe where pe.id = g.pet_id) y) as pets,
      (select to_jsonb(y) from (select s.id, s.nome, s.cor, s.categoria from public.servicos s where s.id = g.servico_id) y) as servicos,
      (select to_jsonb(y) from (select f.id, f.nome, f.cor from public.profissionais f where f.id = g.profissional_id) y) as profissionais,
      coalesce((select jsonb_agg(to_jsonb(y) order by y.ordem, y.id) from (
        select o.id, o.servico_id, o.ordem,
          (select to_jsonb(w) from (select s.id, s.nome, s.cor, s.categoria from public.servicos s where s.id = o.servico_id) w) as servicos
        from public.agendamento_servicos o where o.agendamento_id = g.id) y), '[]'::jsonb) as agendamento_servicos
    from public.agendamentos g
    where g.petshop_id = p and g.inicio >= v_ini and g.inicio < v_amanha
  ) x;
  v_r := v_r || jsonb_build_object('lista', v_lista);
  -- os preços: a mesma função de sempre (só quem recebe vê; os outros recebem a lista sem preço)
  begin
    v_r := v_r || jsonb_build_object('precos', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'preco', r.preco)) from public.agendamentos_precos(p, v_ids) r), '[]'::jsonb));
  exception when others then v_falhas := v_falhas || jsonb_build_object('parte', 'precos', 'erro', left(sqlerrm, 300)); v_r := v_r || jsonb_build_object('precos', null);
  end;

  v_r := v_r || jsonb_build_object(
    'amanha', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select g.id, g.lembrete_em, g.status,
        (select to_jsonb(y) from (select (select to_jsonb(z) from (select c.id, c.telefone from public.clientes c where c.id = pe.cliente_id) z) as clientes
           from public.pets pe where pe.id = g.pet_id) y) as pets
      from public.agendamentos g where g.petshop_id = p and g.inicio >= v_amanha and g.inicio < v_depois) x), '[]'::jsonb),
    'em_casa', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select e.id, e.status, e.entrada, e.saida_prevista from public.estadias e
      where e.petshop_id = p and e.status in ('em_casa', 'reservada') limit 1000) x), '[]'::jsonb),
    'contagens', public.gestao_contagens(p),
    'semana', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select g.inicio, g.status from public.agendamentos g where g.petshop_id = p and g.inicio >= v_seg and g.inicio < v_seg7) x), '[]'::jsonb),
    -- serviços mais pedidos nos últimos 30 dias: na ordem em que cada um apareceu primeiro (a tela ordena pelo total)
    'servicos_mes', coalesce((select jsonb_agg(jsonb_build_object('rotulo', x.nome, 'valor', x.n, 'cor', x.cor) order by x.primeiro) from (
      select y.nome, count(*) as n, (array_agg(y.cor order by y.k))[1] as cor, min(y.k) as primeiro from (
        select s.nome, s.cor, row_number() over (order by g.inicio, g.id) as k
        from public.agendamentos g join public.servicos s on s.id = g.servico_id
        where g.petshop_id = p and g.inicio >= v_ha30 and g.inicio < v_amanha and g.status not in ('cancelado', 'faltou')) y
      group by y.nome) x), '[]'::jsonb),
    'proximos', coalesce((select jsonb_agg(to_jsonb(x) order by x.inicio, x.id) from (
      select g.id, g.inicio, (select to_jsonb(y) from (select pe.nome from public.pets pe where pe.id = g.pet_id) y) as pets
      from public.agendamentos g where g.petshop_id = p and g.inicio >= v_amanha and g.status in ('marcado', 'confirmado')
      order by g.inicio, g.id limit 2) x), '[]'::jsonb),
    'sem_fechar_total', (select count(*) from public.agendamentos g where g.petshop_id = p and g.inicio < v_ini and g.status in ('marcado', 'confirmado', 'em_atendimento')),
    'sem_fechar', coalesce((select jsonb_agg(to_jsonb(x) order by x.inicio, x.id) from (
      select g.id, g.inicio, (select to_jsonb(y) from (select pe.nome from public.pets pe where pe.id = g.pet_id) y) as pets
      from public.agendamentos g where g.petshop_id = p and g.inicio < v_ini and g.status in ('marcado', 'confirmado', 'em_atendimento')
      order by g.inicio, g.id limit 3) x), '[]'::jsonb)
  );

  -- estoque, dinheiro e pacotes: só para quem tem a área (como na leitura antiga)
  if v_estoque then
    v_r := v_r || jsonb_build_object('acabando', coalesce((select jsonb_agg(to_jsonb(x) order by x.nome, x.id) from (
      select d.id, d.nome, d.estoque, d.estoque_minimo from public.produtos d
      where d.petshop_id = p and d.ativo and d.estoque_minimo > 0) x), '[]'::jsonb));
  end if;
  if v_fin then
    v_r := v_r || jsonb_build_object('entradas', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select l.valor, l.tipo, l.categoria from public.lancamentos l
      where l.petshop_id = p and l.pago and l.movimento is null and l.data = v_dia) x), '[]'::jsonb));
  end if;
  if v_cuido then
    v_r := v_r || jsonb_build_object(
      'contas', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select l.id, l.valor, l.vencimento, l.tipo, l.categoria from public.lancamentos l
        where l.petshop_id = p and not l.pago and l.vencimento <= v_dia) x), '[]'::jsonb),
      'ultimos7', coalesce((select jsonb_agg(jsonb_build_object('data', x.data, 'valor', x.valor) order by x.data) from (
        select l.data, sum(l.valor) as valor from public.lancamentos l
        where l.petshop_id = p and l.pago and l.tipo = 'entrada' and l.movimento is null and l.data >= v_ha6 and l.data <= v_dia
        group by l.data) x), '[]'::jsonb));
    -- devolução ao tutor e crédito deixado (ajustesDoFaturamento): cada parte que falhar vale vazia, como antes
    begin
      v_x := coalesce((select jsonb_agg(to_jsonb(x) order by x.data, x.id) from (
        select l.id, l.valor, l.data, l.cliente_id from public.lancamentos l
        where l.petshop_id = p and l.tipo = 'saida' and l.pago and l.movimento is null and l.categoria = any (v_devol)
          and l.data >= v_ha6 and l.data <= v_dia) x), '[]'::jsonb);
    exception when others then v_falhas := v_falhas || jsonb_build_object('parte', 'devolucoes', 'erro', left(sqlerrm, 300)); v_x := '[]'::jsonb;
    end;
    v_r := v_r || jsonb_build_object('devolucoes', v_x);
    begin
      v_x := coalesce((select jsonb_agg(to_jsonb(x) order by x.criado_em, x.id) from (
        select c.id, c.valor, c.criado_em, c.lancamento_id, c.cliente_id from public.clientes_creditos c
        where c.petshop_id = p and c.criado_em >= (a->>'cred_de')::timestamptz and c.criado_em < (a->>'cred_ate')::timestamptz) x), '[]'::jsonb);
    exception when others then v_falhas := v_falhas || jsonb_build_object('parte', 'creditos', 'erro', left(sqlerrm, 300)); v_x := '[]'::jsonb;
    end;
    v_r := v_r || jsonb_build_object('creditos', v_x);
  end if;
  if v_pacotes then
    v_r := v_r || jsonb_build_object('pacotes', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select k.id from public.pacotes_clientes k
      where k.petshop_id = p and k.ativo and k.vence_em >= v_dia and k.vence_em <= v_mais7) x), '[]'::jsonb));
  end if;

  -- saúde vencendo (buscarSaudeVencendo): os cuidados até o limite, depois os outros dos mesmos pets, e o nome dos pets ativos
  begin
    v_r := v_r || jsonb_build_object('saude', jsonb_build_object(
      'perto', coalesce((select jsonb_agg(to_jsonb(x) order by x.vence_em, x.id) from (
        select h.id, h.pet_id, h.tipo, h.nome, h.aplicado_em, h.vence_em, h.criado_em from public.pets_saude h
        where h.petshop_id = p and h.vence_em <= (a->>'saude_ate')::date) x), '[]'::jsonb),
      'depois', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from (
        select h.id, h.pet_id, h.tipo, h.nome, h.aplicado_em, h.vence_em, h.criado_em from public.pets_saude h
        where h.petshop_id = p and (h.vence_em > (a->>'saude_ate')::date or h.vence_em is null)
          and h.pet_id in (select q.pet_id from public.pets_saude q where q.petshop_id = p and q.vence_em <= (a->>'saude_ate')::date)) x), '[]'::jsonb),
      'pets', coalesce((select jsonb_agg(jsonb_build_object('id', pe.id, 'nome', pe.nome)) from public.pets pe
        where pe.petshop_id = p and pe.ativo
          and pe.id in (select q.pet_id from public.pets_saude q where q.petshop_id = p and q.vence_em <= (a->>'saude_ate')::date)), '[]'::jsonb)));
  exception when others then v_falhas := v_falhas || jsonb_build_object('parte', 'saude', 'erro', left(sqlerrm, 300)); v_r := v_r || jsonb_build_object('saude', null);
  end;

  -- creche e hotel para quem recebe: check-outs sem cobrança e saídas depois do horário esperando a decisão da taxa
  if v_cobrar then
    begin
      select count(*) into v_n from (select 1 from public.estadias_para_cobrar(p) limit 150) x;
    exception when others then v_falhas := v_falhas || jsonb_build_object('parte', 'para_cobrar', 'erro', left(sqlerrm, 300)); v_n := 0;
    end;
    v_r := v_r || jsonb_build_object('para_cobrar', v_n);
    begin
      select count(*) into v_n from public.creche_atrasos t
       where t.petshop_id = p and (t.estado = 'pendente' or (t.estado = 'recebida' and t.lancamento_id is null));
    exception when others then v_falhas := v_falhas || jsonb_build_object('parte', 'atrasos', 'erro', left(sqlerrm, 300)); v_n := 0;
    end;
    v_r := v_r || jsonb_build_object('atrasos', v_n);
  end if;

  -- horários de hoje concluídos que ninguém cobrou (a marca "Falta cobrar" da lista e da frase do Mozart)
  if v_cobrar_hoje then
    begin
      v_r := v_r || jsonb_build_object('cobrar_hoje', coalesce((select jsonb_agg(c.id) from public.agendamentos_para_cobrar(p, v_dia, v_dia) c), '[]'::jsonb));
    exception when others then v_falhas := v_falhas || jsonb_build_object('parte', 'cobrar_hoje', 'erro', left(sqlerrm, 300)); v_r := v_r || jsonb_build_object('cobrar_hoje', null);
    end;
  end if;

  if jsonb_array_length(v_falhas) > 0 then v_r := v_r || jsonb_build_object('falhas', v_falhas); end if;
  return v_r;
end
$function$;

-- ───────────────────────── 4. apagar a conta de um pet shop com história ─────────────────────────
alter table public.exclusoes_conta
  add column if not exists comecou_em timestamptz,
  add column if not exists tentativas integer not null default 0,
  add column if not exists tentou_em timestamptz,
  add column if not exists erro text,
  add column if not exists linhas_apagadas bigint not null default 0,
  add column if not exists membros uuid[];
comment on column public.exclusoes_conta.comecou_em is 'quando a faxina começou a apagar os dados (daí em diante não dá para cancelar)';
comment on column public.exclusoes_conta.membros is 'logins da equipe, guardados no começo da exclusão para apagar os que sobrarem; some no fim';

-- Depois que os dados começaram a sair, o pedido não pode mais ser cancelado (a loja estaria pela metade).
create or replace function public.exclusoes_conta_sem_volta() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.cancelado_em is not null and old.cancelado_em is null and old.comecou_em is not null then
    raise exception 'Os dados deste pet shop já começaram a ser apagados. Não dá mais para cancelar.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists exclusoes_conta_sem_volta on public.exclusoes_conta;
create trigger exclusoes_conta_sem_volta before update of cancelado_em on public.exclusoes_conta
  for each row execute function public.exclusoes_conta_sem_volta();

-- Logins que sobraram de uma conta apagada e ainda precisam sair do Auth. Antes, se o servidor falhasse ao apagar um login, a
-- lista se perdia (o pet shop já tinha sido apagado) e o e-mail ficava no Auth para sempre. Agora ficam nesta fila até saírem.
create table if not exists public.logins_lixo (
  user_id uuid primary key,
  petshop_id uuid,
  criado_em timestamptz not null default now(),
  tentativas integer not null default 0,
  erro text check (char_length(erro) <= 300)
);
alter table public.logins_lixo enable row level security;
revoke all on public.logins_lixo from anon, authenticated;

-- Os próximos logins a apagar. Antes de devolver, tira da fila quem já saiu do Auth e quem deixou de estar solto (entrou em
-- outro pet shop, virou da equipe Maestro Pet ou não é login do Maestro): esses nunca são apagados.
create or replace function public.gestao_logins_lixo(p_limite integer default 50, p_petshop uuid default null) returns uuid[]
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.logins_lixo l
   where not exists (select 1 from auth.users u where u.id = l.user_id and coalesce(u.raw_user_meta_data ->> 'app', '') = 'maestro')
      or exists (select 1 from public.profissionais m where m.user_id = l.user_id)
      or exists (select 1 from public.admins a where a.user_id = l.user_id);
  return coalesce((select array_agg(x.user_id) from (
    select l.user_id from public.logins_lixo l where (p_petshop is null or l.petshop_id = p_petshop) and l.tentativas < 30
     order by l.tentativas, l.criado_em limit least(greatest(coalesce(p_limite, 50), 1), 500)) x), '{}');
end $$;
revoke execute on function public.gestao_logins_lixo(integer, uuid) from public, anon, authenticated;
grant execute on function public.gestao_logins_lixo(integer, uuid) to service_role;

-- O servidor conta como foi: saiu do Auth (sai da fila) ou falhou (fica, com a tentativa e o motivo).
create or replace function public.gestao_login_lixo_feito(p_user uuid, p_ok boolean, p_erro text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_ok then delete from public.logins_lixo where user_id = p_user;
  else update public.logins_lixo set tentativas = tentativas + 1, erro = left(coalesce(p_erro, 'falhou'), 300) where user_id = p_user;
  end if;
end $$;
revoke execute on function public.gestao_login_lixo_feito(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.gestao_login_lixo_feito(uuid, boolean, text) to service_role;

-- A ordem de apagar: todas as tabelas que a exclusão do pet shop levaria em cascata, das folhas para a raiz (uma tabela só
-- sai depois de todas as que apontam para ela). modo "loja": apaga por petshop_id; "pai": tabela sem petshop_id, apaga pelas
-- linhas do pai; "sem": não sei apagar em lote; "fora": tabela de fora da cascata que aponta para uma de dentro. Com "sem"
-- ou "fora", gestao_loja_apagar não usa os lotes (vai pela cascata de sempre) e o teste banco/apagar-loja.js acusa.
create or replace function public.gestao_loja_plano()
returns table (ordem integer, tabela text, modo text, pai text, coluna text, coluna_pai text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_raiz oid := 'public.petshops'::regclass::oid;
  v_fecho oid[] := array['public.petshops'::regclass::oid];
  v_novos oid[];
  v_resto oid[];
  v_t oid;
  v_n integer := 0;
  r record;
begin
  loop
    select array_agg(distinct c.conrelid) into v_novos from pg_catalog.pg_constraint c
     where c.contype = 'f' and c.confdeltype = 'c' and c.confrelid = any (v_fecho) and not (c.conrelid = any (v_fecho));
    exit when v_novos is null;
    v_fecho := v_fecho || v_novos;
  end loop;
  v_resto := array_remove(v_fecho, v_raiz);
  while coalesce(cardinality(v_resto), 0) > 0 loop
    v_t := null;
    select x.t into v_t from unnest(v_resto) x(t)
     where not exists (select 1 from pg_catalog.pg_constraint c
                        where c.contype = 'f' and c.confrelid = x.t and c.conrelid <> x.t and c.conrelid = any (v_resto))
     order by x.t::regclass::text limit 1;
    if v_t is null then
      select x.t into v_t from unnest(v_resto) x(t) order by x.t::regclass::text limit 1; -- ciclo: qualquer uma
    end if;
    v_n := v_n + 1;
    ordem := v_n; tabela := v_t::regclass::text; modo := 'sem'; pai := null; coluna := null; coluna_pai := null;
    if exists (select 1 from pg_catalog.pg_attribute a where a.attrelid = v_t and a.attname = 'petshop_id' and not a.attisdropped) then
      modo := 'loja';
    else
      select c.confrelid::regclass::text, a.attname::text, b.attname::text into pai, coluna, coluna_pai
        from pg_catalog.pg_constraint c
        join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
        join pg_catalog.pg_attribute b on b.attrelid = c.confrelid and b.attnum = c.confkey[1]
       where c.conrelid = v_t and c.contype = 'f' and c.confdeltype = 'c' and c.confrelid = any (v_fecho) and c.confrelid <> v_raiz
         and cardinality(c.conkey) = 1
         and exists (select 1 from pg_catalog.pg_attribute p where p.attrelid = c.confrelid and p.attname = 'petshop_id' and not p.attisdropped)
       order by c.conname limit 1;
      if pai is not null then modo := 'pai'; end if;
    end if;
    return next;
    v_resto := array_remove(v_resto, v_t);
  end loop;
  -- tabela de fora da cascata apontando para uma de dentro (fora o próprio pet shop): os lotes deixariam a ligação solta
  for r in select distinct c.conrelid::regclass::text as t from pg_catalog.pg_constraint c
            where c.contype = 'f' and c.confrelid = any (v_fecho) and c.confrelid <> v_raiz and not (c.conrelid = any (v_fecho)) loop
    v_n := v_n + 1;
    ordem := v_n; tabela := r.t; modo := 'fora'; pai := null; coluna := null; coluna_pai := null;
    return next;
  end loop;
end $$;
revoke execute on function public.gestao_loja_plano() from public, anon, authenticated;
grant execute on function public.gestao_loja_plano() to service_role;

-- Apaga um pet shop marcado para exclusão, até a hora p_ate. Devolve {feito, linhas, usuarios}.
-- Os lotes saem sem os gatilhos e sem a conferência de ligação (session_replication_role = replica, só dentro desta
-- transação): as travas do dinheiro (caixa fechado, valores guardados) existem para o uso normal e não deixam apagar linha a
-- linha, e a conferência de cada ligação é o que fazia a cascata de uma loja grande não terminar. Por isso a ordem é das
-- folhas para a raiz (se parar no meio, o que ficou continua inteiro) e, no fim, o pet shop sai pela cascata normal, com tudo
-- ligado de novo: o que tiver sobrado (linha nova, tabela nova) sai por ela, e as ligações são conferidas.
create or replace function public.gestao_loja_apagar(p_pedido bigint, p_ate timestamptz, p_lote integer default 5000)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  x public.exclusoes_conta;
  r record;
  v_sql text;
  v_n bigint;
  v_total bigint := 0;
  v_lote integer := least(greatest(coalesce(p_lote, 5000), 1), 50000);
  v_rapido boolean := true;
  v_parou boolean := false;
  v_soltos uuid[];
begin
  select * into x from public.exclusoes_conta where id = p_pedido and cancelado_em is null and apagado_em is null for update;
  if not found then return jsonb_build_object('feito', false, 'linhas', 0, 'usuarios', '[]'::jsonb, 'sumiu', true); end if;

  if x.comecou_em is null then
    -- só na primeira vez: os logins da equipe, os arquivos para a fila e os convites antigos (o que os gatilhos fariam)
    select coalesce(array_agg(distinct m.user_id), '{}') into x.membros from public.profissionais m where m.petshop_id = x.petshop_id and m.user_id is not null;
    insert into public.arquivos_lixo (bucket, caminho, petshop_id, motivo)
    select o.bucket_id, o.name, x.petshop_id, 'conta_apagada' from storage.objects o
     where o.bucket_id in ('pets', 'diario', 'boletim', 'caderno-tmp', 'entrada') and o.name like x.petshop_id::text || '/%'
    on conflict do nothing;
    insert into public.convites_equipe_antigos (codigo_hash, petshop_id, motivo)
    select c.codigo_hash, c.petshop_id, case when c.usado_em is not null then 'usado' else 'cancelado' end
      from public.convites_equipe c where c.petshop_id = x.petshop_id and c.codigo_hash ~ '^[0-9a-f]{64}$'
    on conflict (codigo_hash) do update set motivo = excluded.motivo, em = now();
    update public.exclusoes_conta set comecou_em = now(), membros = x.membros where id = x.id;
  end if;

  if exists (select 1 from public.gestao_loja_plano() t where t.modo in ('sem', 'fora')) then v_rapido := false; end if;
  if v_rapido then
    begin
      -- como comando (não set_config): é assim que o Supabase deixa o dono das funções trocar este ajuste
      set local session_replication_role = replica;
      if current_setting('session_replication_role') <> 'replica' then v_rapido := false; end if;
    exception when others then v_rapido := false;
    end;
  end if;

  if v_rapido then
    for r in select * from public.gestao_loja_plano() t order by t.ordem loop
      if r.modo = 'loja' then
        v_sql := format('delete from %s where ctid = any (array(select t.ctid from %s t where t.petshop_id = $1 limit $2))', r.tabela, r.tabela);
      else
        v_sql := format('delete from %s where ctid = any (array(select t.ctid from %s t where t.%I in (select p.%I from %s p where p.petshop_id = $1) limit $2))',
          r.tabela, r.tabela, r.coluna, r.coluna_pai, r.pai);
      end if;
      loop
        execute v_sql using x.petshop_id, v_lote;
        get diagnostics v_n = row_count;
        v_total := v_total + v_n;
        exit when v_n < v_lote;
        if clock_timestamp() >= p_ate then v_parou := true; exit; end if;
      end loop;
      exit when v_parou;
      if clock_timestamp() >= p_ate then v_parou := true; exit; end if;
    end loop;
    set local session_replication_role = origin;
    if v_parou then
      update public.exclusoes_conta set linhas_apagadas = linhas_apagadas + v_total, tentou_em = now(), erro = null where id = x.id;
      return jsonb_build_object('feito', false, 'linhas', v_total, 'usuarios', '[]'::jsonb);
    end if;
  end if;

  -- o pet shop e o que tiver sobrado, pela cascata normal (as ligações entre tabelas da mesma loja conferidas no fim: 20261213)
  set constraints all deferred;
  delete from public.petshops where id = x.petshop_id;
  delete from public.entrada_lixo where petshop_id = x.petshop_id;
  -- logins do Maestro que não ficaram em nenhum outro pet shop e não são da equipe Maestro Pet
  select coalesce(array_agg(u.id), '{}') into v_soltos from auth.users u
   where u.id = any (coalesce(x.membros, '{}')) and coalesce(u.raw_user_meta_data ->> 'app', '') = 'maestro'
     and not exists (select 1 from public.profissionais m where m.user_id = u.id)
     and not exists (select 1 from public.admins a where a.user_id = u.id);
  insert into public.logins_lixo (user_id, petshop_id) select u, x.petshop_id from unnest(v_soltos) u on conflict (user_id) do nothing;
  update public.exclusoes_conta set apagado_em = now(), usuarios = cardinality(v_soltos), membros = null, erro = null,
    linhas_apagadas = linhas_apagadas + v_total, tentou_em = now() where id = x.id;
  insert into public.lgpd_registros (petshop_id, quem, quem_nome, acao, detalhe)
  values (x.petshop_id, null, 'Maestro Pet (automático)', 'conta_apagada', jsonb_build_object('pedido_em', x.pedido_em, 'logins', cardinality(v_soltos)));
  return jsonb_build_object('feito', true, 'linhas', v_total, 'usuarios', to_jsonb(v_soltos));
end $$;
revoke execute on function public.gestao_loja_apagar(bigint, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.gestao_loja_apagar(bigint, timestamptz, integer) to service_role;

-- A faxina chama até acabar: cada chamada trabalha no máximo p_segundos (padrão 5, abaixo do limite de 8 s de uma consulta
-- pela API) e grava o que fez; a próxima retoma. Devolve {lojas, usuarios} como antes, mais {pendentes, linhas, falhas}.
-- Uma loja que der erro fica anotada (tentativas, erro, e uma linha em erros_app) e as outras seguem.
drop function if exists public.gestao_exclusoes_processar(uuid, integer);
create or replace function public.gestao_exclusoes_processar(p_petshop uuid default null, p_limite integer default 5, p_segundos numeric default 5)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  x public.exclusoes_conta;
  v_ate timestamptz := clock_timestamp() + make_interval(secs => least(greatest(coalesce(p_segundos, 5), 0.2), 600)::double precision);
  v_r jsonb;
  v_lojas integer := 0;
  v_linhas bigint := 0;
  v_falhas integer := 0;
  v_usuarios uuid[] := '{}';
  v_erro text;
begin
  perform pg_advisory_xact_lock(hashtext('gestao_exclusoes_processar'));
  for x in select * from public.exclusoes_conta
            where cancelado_em is null and apagado_em is null and apagar_em <= now() and (p_petshop is null or petshop_id = p_petshop)
            order by (comecou_em is null), tentativas, apagar_em limit least(greatest(coalesce(p_limite, 5), 1), 50) loop
    begin
      v_r := public.gestao_loja_apagar(x.id, v_ate);
    exception when others then
      v_erro := sqlerrm;
      v_falhas := v_falhas + 1;
      update public.exclusoes_conta set tentativas = tentativas + 1, tentou_em = now(), erro = left(v_erro, 500) where id = x.id;
      perform public.erro_do_banco('gestao_exclusoes_processar', v_erro, null);
      continue;
    end;
    v_linhas := v_linhas + coalesce((v_r ->> 'linhas')::bigint, 0);
    if (v_r ->> 'feito')::boolean then
      v_lojas := v_lojas + 1;
      v_usuarios := v_usuarios || coalesce((select array_agg(u::uuid) from jsonb_array_elements_text(v_r -> 'usuarios') u), '{}');
    end if;
    exit when clock_timestamp() >= v_ate;
  end loop;
  return jsonb_build_object('lojas', v_lojas, 'usuarios', to_jsonb(v_usuarios), 'linhas', v_linhas, 'falhas', v_falhas,
    'pendentes', (select count(*) from public.exclusoes_conta e
                   where e.cancelado_em is null and e.apagado_em is null and e.apagar_em <= now() and (p_petshop is null or e.petshop_id = p_petshop)));
end $$;
revoke execute on function public.gestao_exclusoes_processar(uuid, integer, numeric) from public, anon, authenticated;
grant execute on function public.gestao_exclusoes_processar(uuid, integer, numeric) to service_role;

CREATE OR REPLACE FUNCTION public.admin_exclusoes()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.sou_admin() then raise exception 'Sem acesso.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', x.id, 'petshop_id', x.petshop_id, 'petshop', x.petshop_nome, 'pedido_nome', x.pedido_nome, 'pedido_email', x.pedido_email,
      'pedido_em', x.pedido_em, 'apagar_em', x.apagar_em, 'cancelado_em', x.cancelado_em, 'apagado_em', x.apagado_em, 'usuarios', x.usuarios,
      'comecou_em', x.comecou_em, 'tentativas', x.tentativas, 'tentou_em', x.tentou_em, 'erro', x.erro, 'linhas_apagadas', x.linhas_apagadas,
      'atrasada', (x.cancelado_em is null and x.apagado_em is null and x.apagar_em < now() - interval '2 days'))
      order by (x.cancelado_em is null and x.apagado_em is null) desc, x.apagar_em desc)
    from (select * from public.exclusoes_conta order by (cancelado_em is null and apagado_em is null) desc, pedido_em desc limit 100) x), '[]'::jsonb);
end $function$;

-- ───────────────────────── 5b. rotinas agendadas: a última vez que cada uma rodou ─────────────────────────
create table if not exists public.rotinas_execucoes (
  nome text primary key check (char_length(nome) between 1 and 60),
  criada_em timestamptz not null default now(),
  ultima_em timestamptz,
  ultima_ok_em timestamptz,
  ultimo_erro text check (char_length(ultimo_erro) <= 500),
  ultimo_erro_em timestamptz,
  falhas_seguidas integer not null default 0,
  resultado jsonb
);
alter table public.rotinas_execucoes enable row level security;
revoke all on public.rotinas_execucoes from anon, authenticated;
insert into public.rotinas_execucoes (nome) values ('faxina') on conflict do nothing;

-- Só o servidor (chave de serviço) anota. p_ok: rodou até o fim; p_erro: a frase curta do que deu errado.
create or replace function public.rotina_anotar(p_nome text, p_ok boolean, p_resultado jsonb default null, p_erro text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.rotinas_execucoes as r (nome, ultima_em, ultima_ok_em, ultimo_erro, ultimo_erro_em, falhas_seguidas, resultado)
  values (left(p_nome, 60), now(), case when p_ok then now() end, case when not p_ok then left(coalesce(p_erro, 'falhou'), 500) end,
          case when not p_ok then now() end, case when p_ok then 0 else 1 end, case when p_ok then p_resultado end)
  on conflict (nome) do update set
    ultima_em = now(),
    ultima_ok_em = case when p_ok then now() else r.ultima_ok_em end,
    ultimo_erro = case when p_ok then r.ultimo_erro else left(coalesce(p_erro, 'falhou'), 500) end,
    ultimo_erro_em = case when p_ok then r.ultimo_erro_em else now() end,
    falhas_seguidas = case when p_ok then 0 else r.falhas_seguidas + 1 end,
    resultado = case when p_ok then p_resultado else r.resultado end;
end $$;
revoke execute on function public.rotina_anotar(text, boolean, jsonb, text) from public, anon, authenticated;
grant execute on function public.rotina_anotar(text, boolean, jsonb, text) to service_role;

-- Painel do administrador: cada rotina com a última vez que rodou bem e se está atrasada (mais de 36 horas sem rodar bem,
-- para rotinas diárias), as tarefas do pg_cron (quando o banco tem) e as contas com a exclusão vencida há mais de 2 dias.
create or replace function public.admin_rotinas() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_rotinas jsonb;
  v_cron jsonb := '[]'::jsonb;
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
      'nome', r.nome, 'onde', 'servidor', 'ultima_em', r.ultima_em, 'ultima_ok_em', r.ultima_ok_em, 'ultimo_erro', r.ultimo_erro,
      'ultimo_erro_em', r.ultimo_erro_em, 'falhas_seguidas', r.falhas_seguidas, 'resultado', r.resultado,
      'atrasada', coalesce(r.ultima_ok_em, r.criada_em) < now() - interval '36 hours') order by r.nome), '[]'::jsonb)
    into v_rotinas from public.rotinas_execucoes r;
  if to_regclass('cron.job') is not null and to_regclass('cron.job_run_details') is not null then
    begin
      execute $q$
        select coalesce(jsonb_agg(jsonb_build_object(
            'nome', j.jobname, 'onde', 'banco', 'ultima_em', d.ultima_em, 'ultima_ok_em', d.ultima_ok_em, 'ultimo_erro', d.ultimo_erro,
            'ultimo_erro_em', d.ultimo_erro_em, 'falhas_seguidas', null, 'resultado', null,
            'atrasada', j.active and d.ultima_em is not null and coalesce(d.ultima_ok_em, '-infinity') < now() - interval '36 hours') order by j.jobname), '[]'::jsonb)
        from cron.job j
        left join lateral (
          select max(x.start_time) as ultima_em, max(x.end_time) filter (where x.status = 'succeeded') as ultima_ok_em,
                 max(x.start_time) filter (where x.status = 'failed') as ultimo_erro_em,
                 (select left(y.return_message, 300) from cron.job_run_details y where y.jobid = j.jobid and y.status = 'failed' order by y.start_time desc limit 1) as ultimo_erro
          from cron.job_run_details x where x.jobid = j.jobid and x.start_time > now() - interval '15 days'
        ) d on true
        where j.jobname like 'gestao-%'
      $q$ into v_cron;
    exception when others then v_cron := '[]'::jsonb;
    end;
  end if;
  return jsonb_build_object('agora', now(), 'rotinas', v_rotinas || coalesce(v_cron, '[]'::jsonb),
    'exclusoes_atrasadas', (select count(*) from public.exclusoes_conta e
                             where e.cancelado_em is null and e.apagado_em is null and e.apagar_em < now() - interval '2 days'));
end $$;
revoke execute on function public.admin_rotinas() from public, anon;
grant execute on function public.admin_rotinas() to authenticated;

-- ───────────────────────── 6. link do cliente: a abertura numa ida só ─────────────────────────
-- As mesmas oito funções públicas que a página já chamava, uma a uma, juntas numa resposta (nenhum dado a mais).
create or replace function public.link_inicial(p_codigo text) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'info', public.link_info(p_codigo),
    'nome', public.link_nome(p_codigo),
    'google', public.link_google(p_codigo),
    'promocoes', public.link_promocoes(p_codigo),
    'fechados', coalesce((select jsonb_agg(d) from public.link_fechados(p_codigo) d), '[]'::jsonb),
    'ia', public.link_ia_ligada(p_codigo),
    'hotel', public.link_hotel_opcoes(p_codigo),
    'opcoes', public.link_opcoes(p_codigo))
$$;
revoke execute on function public.link_inicial(text) from public;
grant execute on function public.link_inicial(text) to anon, authenticated, service_role;
