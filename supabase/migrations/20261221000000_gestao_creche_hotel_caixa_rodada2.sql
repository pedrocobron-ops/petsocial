-- Segunda rodada dos testadores no site real (Rafael, creche; Bia, hotel; Juliana e Neide): creche, hotel, caixa e relatórios.
-- Só acrescenta: funções novas e funções trocadas com a mesma assinatura (ou parâmetros novos com valor padrão).
-- O código de hoje (main) segue funcionando no banco novo.
--
-- 1. A conta a receber da mensalidade (o que aparece em "Recebi esta conta" e no comprovante) dá a cada linha de `taxas` o nome
--    certo: o táxi pet do mês é "Táxi pet do mês" (antes saía como "Busca fora do horário (01/11)") e os dias de táxi,
--    "Táxi pet (03/11, 05/11)". As contas já criadas são refeitas (só os itens; valor e datas não mudam).
--
-- Funções trocadas (cópia da última definição, mais a mudança):
--   creche_cobranca_lancar   ← 20261167000000_gestao_creche_saida.sql

-- =====================================================================================================================
-- 1. Itens da conta da mensalidade: táxi com o nome do táxi
-- =====================================================================================================================

-- Os itens da conta de uma cobrança: mensalidade, dias extras, taxas de busca fora do horário, dias de táxi e táxi do mês.
create or replace function public.creche_cobranca_itens(c public.creche_cobrancas) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_itens jsonb;
  v_dias text;
  v_unit numeric;
  v_n int;
  v_t int;
  v_todas numeric;
  v_taxas numeric;
  v_dos_dias numeric;
  v_taxi_dias numeric;
  v_taxi_n int;
  v_taxi_mes numeric;
begin
  if c.acerto_saida then
    v_itens := '[]'::jsonb;
    if c.valor_mensal > 0 then
      v_itens := jsonb_build_array(jsonb_build_object('tipo', 'servico', 'nome', 'Mensalidade de ' || public.creche_nome_mes(c.mes), 'qtd', 1, 'valor', c.valor_mensal));
    end if;
  else
    v_itens := jsonb_build_array(jsonb_build_object('tipo', 'servico', 'nome', 'Mensalidade de ' || public.creche_nome_mes(c.mes), 'qtd', 1, 'valor', c.valor_mensal));
  end if;
  v_n := jsonb_array_length(coalesce(c.extras, '[]'::jsonb));
  -- valor_extras soma os dias extras, as taxas de busca fora do horário e o táxi; cada um vira uma linha da conta
  select coalesce(sum((x ->> 'valor')::numeric), 0) into v_todas from jsonb_array_elements(coalesce(c.taxas, '[]'::jsonb)) x;
  select count(*), coalesce(sum((x ->> 'valor')::numeric), 0) into v_t, v_taxas
    from jsonb_array_elements(coalesce(c.taxas, '[]'::jsonb)) x where x ->> 'tipo' is null;
  select count(*), coalesce(sum((x ->> 'valor')::numeric), 0) into v_taxi_n, v_taxi_dias
    from jsonb_array_elements(coalesce(c.taxas, '[]'::jsonb)) x where x ->> 'tipo' = 'taxi';
  select coalesce(sum((x ->> 'valor')::numeric), 0) into v_taxi_mes
    from jsonb_array_elements(coalesce(c.taxas, '[]'::jsonb)) x where x ->> 'tipo' = 'taxi_mes';
  v_dos_dias := c.valor_extras - v_todas;
  if v_n > 0 and v_dos_dias > 0 then
    select string_agg(to_char((x ->> 'dia')::date, 'DD/MM'), ', ' order by x ->> 'dia') into v_dias from jsonb_array_elements(c.extras) x;
    v_unit := round(v_dos_dias / v_n, 2);
    if v_unit * v_n = v_dos_dias then
      v_itens := v_itens || jsonb_build_object('tipo', 'servico', 'nome', case when v_n = 1 then 'Dia extra (' else 'Dias extras (' end || v_dias || ')', 'qtd', v_n, 'valor', v_unit);
    else
      v_itens := v_itens || jsonb_build_object('tipo', 'servico', 'nome', 'Dias extras (' || v_dias || ')', 'qtd', 1, 'valor', v_dos_dias);
    end if;
  end if;
  if v_t > 0 and v_taxas > 0 then
    select string_agg(to_char((x ->> 'dia')::date, 'DD/MM'), ', ' order by x ->> 'dia') into v_dias
      from jsonb_array_elements(c.taxas) x where x ->> 'tipo' is null;
    v_unit := round(v_taxas / v_t, 2);
    if v_unit * v_t = v_taxas then
      v_itens := v_itens || jsonb_build_object('tipo', 'extra', 'nome', 'Busca fora do horário (' || v_dias || ')', 'qtd', v_t, 'valor', v_unit);
    else
      v_itens := v_itens || jsonb_build_object('tipo', 'extra', 'nome', 'Busca fora do horário (' || v_dias || ')', 'qtd', 1, 'valor', v_taxas);
    end if;
  end if;
  if v_taxi_n > 0 and v_taxi_dias > 0 then
    select string_agg(to_char((x ->> 'dia')::date, 'DD/MM'), ', ' order by x ->> 'dia') into v_dias
      from jsonb_array_elements(c.taxas) x where x ->> 'tipo' = 'taxi';
    v_unit := round(v_taxi_dias / v_taxi_n, 2);
    if v_unit * v_taxi_n = v_taxi_dias then
      v_itens := v_itens || jsonb_build_object('tipo', 'extra', 'nome', 'Táxi pet (' || v_dias || ')', 'qtd', v_taxi_n, 'valor', v_unit);
    else
      v_itens := v_itens || jsonb_build_object('tipo', 'extra', 'nome', 'Táxi pet (' || v_dias || ')', 'qtd', 1, 'valor', v_taxi_dias);
    end if;
  end if;
  if v_taxi_mes > 0 then
    v_itens := v_itens || jsonb_build_object('tipo', 'extra', 'nome', 'Táxi pet do mês', 'qtd', 1, 'valor', v_taxi_mes);
  end if;
  return v_itens;
end $$;
revoke execute on function public.creche_cobranca_itens(public.creche_cobrancas) from public, anon, authenticated;

-- A mesma de 20261167, com os itens montados por creche_cobranca_itens.
create or replace function public.creche_cobranca_lancar(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.creche_cobrancas;
  v_pet text;
  v_itens jsonb;
  v_desc text;
  v_recebido numeric := 0;
begin
  select * into c from public.creche_cobrancas where id = p_id;
  select nome into v_pet from public.pets where id = c.pet_id;
  if c.lancamento_id is not null then v_recebido := public.recebido_em_partes(c.lancamento_id); end if;
  if c.status <> 'aberta' or c.total <= 0 then
    if v_recebido > 0 then
      raise exception 'Esta mensalidade já teve % recebidos. Para cancelar ou zerar, apague antes esses recebimentos no Financeiro.', replace(to_char(v_recebido, 'FM999999990D00'), '.', ',');
    end if;
    if c.lancamento_id is not null then
      update public.creche_cobrancas set lancamento_id = null where id = c.id;
      delete from public.lancamentos where id = c.lancamento_id and not pago;
    end if;
    return;
  end if;
  if v_recebido > 0 and c.total <= v_recebido then
    raise exception 'Esta mensalidade já teve % recebidos: o total precisa ficar maior que isso.', replace(to_char(v_recebido, 'FM999999990D00'), '.', ',');
  end if;
  if c.acerto_saida then
    v_desc := 'Acerto da saída · ' || coalesce(v_pet, 'pet');
  else
    v_desc := 'Mensalidade de ' || public.creche_nome_mes(c.mes) || ' · ' || coalesce(v_pet, 'pet');
  end if;
  v_itens := public.creche_cobranca_itens(c);
  if c.lancamento_id is not null then
    update public.lancamentos set valor = c.total - v_recebido, data = c.vencimento, vencimento = c.vencimento, descricao = v_desc, itens = v_itens, cliente_id = c.cliente_id
      where id = c.lancamento_id and not pago;
  else
    insert into public.lancamentos (petshop_id, tipo, valor, forma, categoria, descricao, data, vencimento, pago, cliente_id, origem, criado_por, itens)
      values (c.petshop_id, 'entrada', c.total, null, 'Creche: mensalidade', v_desc, c.vencimento, c.vencimento, false, c.cliente_id, 'tela', (select auth.uid()), v_itens)
      returning id into c.lancamento_id;
    update public.creche_cobrancas set lancamento_id = c.lancamento_id where id = c.id;
  end if;
end $$;

-- As contas já criadas com táxi: só os itens são refeitos (uma conta que o banco recusa mudar fica como estava).
do $$
declare
  c public.creche_cobrancas;
  v jsonb;
begin
  for c in select * from public.creche_cobrancas x
            where x.lancamento_id is not null
              and exists (select 1 from jsonb_array_elements(coalesce(x.taxas, '[]'::jsonb)) t where t ->> 'tipo' in ('taxi', 'taxi_mes'))
  loop
    v := public.creche_cobranca_itens(c);
    begin
      update public.lancamentos l set itens = v where l.id = c.lancamento_id and l.itens is distinct from v;
    exception when others then
      raise notice 'conta % ficou como estava: %', c.lancamento_id, sqlerrm;
    end;
  end loop;
end $$;

-- =====================================================================================================================
-- 2. Indicadores: reservas canceladas pelo dia em que foram canceladas
-- =====================================================================================================================
-- A reserva cancelada hoje para uma data futura não aparecia nos cancelamentos (a conta era pelo dia da entrada). O dia do
-- cancelamento fica anotado aqui (sem leitura pela API: só as funções leem); as reservas canceladas antes desta migração ganham
-- o dia pelo que ficou gravado do cancelamento (crédito do sinal ou devolução), ou continuam pelo dia da entrada.
create table if not exists public.estadias_canceladas (
  estadia_id uuid primary key references public.estadias (id) on delete cascade,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  cancelada_em timestamptz not null default now()
);
create index if not exists estadias_canceladas_petshop on public.estadias_canceladas (petshop_id, cancelada_em);
alter table public.estadias_canceladas enable row level security;
revoke all on public.estadias_canceladas from anon, authenticated;

create or replace function public.estadias_cancelada_anotar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    if new.status = 'cancelada' and (tg_op = 'INSERT' or old.status is distinct from 'cancelada') then
      insert into public.estadias_canceladas (estadia_id, petshop_id) values (new.id, new.petshop_id)
        on conflict (estadia_id) do update set cancelada_em = now();
    elsif tg_op = 'UPDATE' and old.status = 'cancelada' and new.status is distinct from 'cancelada' then
      delete from public.estadias_canceladas c where c.estadia_id = new.id;
    end if;
  exception when others then
    -- é só para os indicadores: nunca derruba o cancelamento
    raise warning 'estadias_cancelada_anotar: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.estadias_cancelada_anotar() from public, anon, authenticated;
drop trigger if exists estadias_zz_cancelada_anotar on public.estadias;
create trigger estadias_zz_cancelada_anotar after insert or update of status on public.estadias
  for each row execute function public.estadias_cancelada_anotar();

insert into public.estadias_canceladas (estadia_id, petshop_id, cancelada_em)
select e.id, e.petshop_id, x.quando
from public.estadias e
cross join lateral (
  select coalesce(
    (select min(c.criado_em) from public.clientes_creditos c where c.estadia_id = e.id and c.valor > 0),
    (select v.sinal_devolvido_em::timestamptz from public.estadias_valores v where v.estadia_id = e.id)) as quando
) x
where e.status = 'cancelada' and x.quando is not null
on conflict (estadia_id) do nothing;

-- Indicadores (igual à de 20261218), mais `estadias_canceladas_no_periodo`: as reservas canceladas no período, pelo dia do
-- cancelamento. `estadias_canceladas` continua pelo dia da entrada (é a parte de `estadias_marcadas`).
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
  pr as (
    select x.produto_id, coalesce(x.produto_id::text, 'nome:' || lower(x.nome)) as k, (array_agg(x.nome))[1] as nome, sum(x.qtd) as quantidade, sum(x.valor) as receita
    from pc x where x.tipo = 'produto' group by 1, 2
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
-- 3. Lista de espera: o pet que entrou na lista com os dias ainda livres não vira "Abriu vaga"
-- =====================================================================================================================
-- A tela anota se os dias estavam cheios quando o pet entrou na lista. Com vaga (false), a linha diz "tem vaga nesses dias"
-- e não vira o aviso "Abriu vaga". Sem a anotação (pedidos antigos, app antigo), tudo segue como antes.
alter table public.lista_espera add column if not exists cheio_ao_entrar boolean;
comment on column public.lista_espera.cheio_ao_entrar is 'Os dias estavam cheios quando o pet entrou na lista? false = entrou com vaga (não vira o aviso "Abriu vaga"); null = não anotado.';

-- =====================================================================================================================
-- 4. Primeiros passos: "Fazer o primeiro check-in" só fica feito com um pet que entrou na casa
-- =====================================================================================================================
-- Antes, aceitar o primeiro pedido do link (uma reserva) já dava "Primeiros passos concluídos". `checkins` conta as estadias
-- em casa ou encerradas. Igual à de 20261185000000_gestao_velocidade.sql, mais `checkins`.
create or replace function public.gestao_contagens(p uuid)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $$
  select jsonb_build_object(
    'pets', (select count(*) from public.pets x where x.petshop_id = p),
    'agendamentos', (select count(*) from public.agendamentos x where x.petshop_id = p),
    'concluidos', (select count(*) from public.agendamentos x where x.petshop_id = p and x.status = 'concluido'),
    'lembrados', (select count(*) from public.agendamentos x where x.petshop_id = p and x.lembrete_em is not null),
    'estadias', (select count(*) from public.estadias x where x.petshop_id = p),
    'checkins', (select count(*) from public.estadias x where x.petshop_id = p and x.status in ('em_casa', 'encerrada')),
    'produtos', (select count(*) from public.produtos x where x.petshop_id = p)
  )
$$;
revoke execute on function public.gestao_contagens(uuid) from public, anon;
grant execute on function public.gestao_contagens(uuid) to authenticated;

-- O crédito do tutor que veio de uma estadia (sobra do sinal, reserva cancelada): lido pela estadia no check-out e no cancelamento.
create index if not exists clientes_creditos_estadia_idx on public.clientes_creditos (estadia_id) where estadia_id is not null;

-- =====================================================================================================================
-- 5. Apagar um horário da agenda: só o dono ou quem vê o financeiro (como o horário concluído)
-- =====================================================================================================================
-- Quem só usa a agenda (sem ver valores) desmarca o horário: ele fica no histórico como cancelado. Apagar some com o horário
-- sem registro; antes, a equipe só da agenda apagava um horário marcado. O concluído já tinha a regra (conferir_valor_baixou).
drop policy if exists agendamentos_remover on public.agendamentos;
create policy agendamentos_remover on public.agendamentos for delete to authenticated
  using ((select public.tenho_area(petshop_id, array['agenda'])) and (select public.acesso_liberado(petshop_id))
         and (select public.vejo_financeiro(petshop_id)));
