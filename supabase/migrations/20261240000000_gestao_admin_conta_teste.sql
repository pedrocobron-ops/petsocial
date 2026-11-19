-- Painel do administrador: "conta de teste" fora dos números, e dois índices para o Financeiro e a Agenda.
--
-- 1. petshops.conta_teste (padrão false). Só o administrador muda, pela função admin_conta_teste (a coluna não tem permissão
--    de leitura nem de escrita para quem usa o aplicativo). Nada é marcado pelo nome: esta migração marca só as contas cujo
--    dono entra com e-mail terminado em @teste-maestro.local ou @teste-auto.local (contas criadas pela equipe e pelos testes).
-- 2. admin_painel: + conta_teste (a lista Contas mostra todas, com a marca; os números das abas ficam sem as de teste).
-- 3. Números sem as contas de teste: admin_visao_geral, admin_pagantes, admin_vendas, admin_conversas_numeros (no geral;
--    pedindo um pet shop, mostra o dele) e admin_mozart_tempos.
-- 4. Índices: os apagados do mês no Financeiro (lancamentos_alteracoes pela data do lançamento apagado) e os bloqueios da
--    semana na Agenda (pelo fim: sem ele, a consulta "começa antes do fim da semana" lia todos os bloqueios antigos).
--
-- Trocas (cópia fiel da definição mais recente, mais o que está dito):
--   admin_painel            20261111000000_gestao_base.sql
--   admin_visao_geral       20261175000000_gestao_admin_painel.sql
--   admin_pagantes          20261206000000_gestao_admin_pagantes.sql
--   admin_vendas            20261237000000_gestao_vendas_assinatura.sql
--   admin_conversas_numeros 20261236000000_gestao_lgpd_rodada9.sql
--   admin_mozart_tempos     20261211000000_gestao_mozart_tempos.sql

-- ============================================================
-- 1. A marca
-- ============================================================
alter table public.petshops add column if not exists conta_teste boolean not null default false;
comment on column public.petshops.conta_teste is 'Conta de teste (da equipe ou dos testes automáticos): fica fora dos números do painel do administrador. Só o administrador muda (admin_conta_teste).';
revoke select (conta_teste), update (conta_teste), insert (conta_teste) on public.petshops from anon, authenticated;

update public.petshops p set conta_teste = true
where not p.conta_teste and exists (
  select 1 from public.profissionais d join auth.users u on u.id = d.user_id
  where d.petshop_id = p.id and d.papel = 'dono'
    and (lower(u.email) like '%@teste-maestro.local' or lower(u.email) like '%@teste-auto.local'));

create or replace function public.admin_conta_teste(p_petshop uuid, p_teste boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v boolean;
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  update public.petshops set conta_teste = coalesce(p_teste, false) where id = p_petshop returning conta_teste into v;
  if not found then raise exception 'Pet shop não encontrado.'; end if;
  return v;
end $$;
revoke execute on function public.admin_conta_teste(uuid, boolean) from public, anon;
grant execute on function public.admin_conta_teste(uuid, boolean) to authenticated;

-- ============================================================
-- 2. Lista de pet shops com a marca
-- ============================================================
create or replace function public.admin_painel() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return (
    select coalesce(jsonb_agg(x order by x.criado_em desc), '[]'::jsonb) from (
      select p.id, p.nome, p.cidade, p.uf, p.telefone, p.status, p.plano, p.teste_ate, p.criado_em, p.assinatura_desde,
        p.cakto_email, p.conta_teste,
        (select u.email from public.profissionais d join auth.users u on u.id = d.user_id
           where d.petshop_id = p.id and d.papel = 'dono' order by d.criado_em limit 1) as dono_email,
        (select d.nome from public.profissionais d where d.petshop_id = p.id and d.papel = 'dono' order by d.criado_em limit 1) as dono_nome,
        (select count(*) from public.profissionais d where d.petshop_id = p.id and d.ativo) as equipe,
        (select count(*) from public.clientes c where c.petshop_id = p.id) as clientes,
        (select count(*) from public.pets c where c.petshop_id = p.id) as pets,
        (select count(*) from public.agendamentos a where a.petshop_id = p.id) as agendamentos,
        (select count(*) from public.agendamentos a where a.petshop_id = p.id and a.criado_em > now() - interval '7 days') as agendamentos_7d,
        (select count(*) from public.assistente_eventos a where a.petshop_id = p.id) as pedidos_assistente,
        (select max(a.criado_em) from public.agendamentos a where a.petshop_id = p.id) as ultimo_agendamento,
        (select n.nota from public.notas_admin n where n.petshop_id = p.id) as nota
      from public.petshops p
    ) x
  );
end $$;

-- ============================================================
-- 3. Números sem as contas de teste
-- ============================================================
create or replace function public.admin_visao_geral() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return jsonb_build_object(
    'agora', now(),
    'contas_teste', (select count(*) from public.petshops where conta_teste),
    'status', (
      select jsonb_build_object(
        'total', count(*),
        'teste', count(*) filter (where status = 'teste' and teste_ate > now()),
        'teste_vencido', count(*) filter (where status = 'teste' and teste_ate <= now()),
        'ativa', count(*) filter (where status = 'ativa'),
        'atrasada', count(*) filter (where status = 'atrasada'),
        'cancelada', count(*) filter (where status = 'cancelada'),
        'cortesia', count(*) filter (where status = 'cortesia'))
      from public.petshops where not conta_teste),
    -- cadastros por dia (horário de Brasília), 90 dias, com os dias sem cadastro
    'cadastros', (
      select coalesce(jsonb_agg(jsonb_build_object('dia', d.dia::date, 'n', coalesce(c.n, 0)) order by d.dia), '[]'::jsonb)
      from generate_series(v_hoje - 89, v_hoje, interval '1 day') as d(dia)
      left join (
        select (criado_em at time zone 'America/Sao_Paulo')::date as dia, count(*) as n
        from public.petshops where criado_em >= (v_hoje - 89)::timestamp at time zone 'America/Sao_Paulo' and not conta_teste
        group by 1
      ) c on c.dia = d.dia::date),
    -- turmas por semana de cadastro (segunda a domingo), 12 semanas
    'turmas', (
      select coalesce(jsonb_agg(t order by t.semana), '[]'::jsonb) from (
        select date_trunc('week', (p.criado_em at time zone 'America/Sao_Paulo'))::date as semana,
          count(*) as cadastros,
          count(*) filter (where p.status = 'cortesia') as cortesia,
          count(*) filter (where p.status = 'teste' and p.teste_ate > now()) as testando,
          count(*) filter (where p.status <> 'cortesia' and (p.assinatura_desde is not null or p.status in ('ativa', 'atrasada'))) as assinaram
        from public.petshops p
        where p.criado_em >= (date_trunc('week', v_hoje::timestamp) - interval '11 weeks') at time zone 'America/Sao_Paulo'
          and not p.conta_teste
        group by 1
      ) t),
    -- planos de quem está pagando (ou atrasado) e cortesias, por período de cobrança
    'planos', (
      select coalesce(jsonb_agg(jsonb_build_object('plano', plano, 'meses', periodo_meses, 'status', status, 'n', n)), '[]'::jsonb) from (
        select plano, periodo_meses, status, count(*) as n from public.petshops
        where status in ('ativa', 'atrasada', 'cortesia') and not conta_teste group by 1, 2, 3
      ) x),
    -- cancelamentos por mês, 12 meses: troca de status registrada ou aviso de cancelamento da Cakto (um por pet shop por mês)
    'cancelamentos', (
      select coalesce(jsonb_agg(jsonb_build_object('mes', to_char(m.mes, 'YYYY-MM'), 'n', coalesce(c.n, 0)) order by m.mes), '[]'::jsonb)
      from generate_series(date_trunc('month', v_hoje::timestamp) - interval '11 months', date_trunc('month', v_hoje::timestamp), interval '1 month') as m(mes)
      left join (
        select mes, count(distinct petshop_id) as n from (
          select h.petshop_id, date_trunc('month', h.em at time zone 'America/Sao_Paulo') as mes
            from public.petshop_status_hist h where h.para = 'cancelada'
          union
          select e.petshop_id, date_trunc('month', e.recebido_em at time zone 'America/Sao_Paulo')
            from public.cakto_eventos e
            where e.petshop_id is not null and e.evento in ('subscription_canceled', 'subscription_paused', 'refund', 'chargeback')
        ) u
        where not exists (select 1 from public.petshops s where s.id = u.petshop_id and s.conta_teste)
        group by mes
      ) c on c.mes = m.mes),
    'canceladas_sem_data', (
      select count(*) from public.petshops p where p.status = 'cancelada' and not p.conta_teste
        and not exists (select 1 from public.petshop_status_hist h where h.petshop_id = p.id and h.para = 'cancelada')
        and not exists (select 1 from public.cakto_eventos e where e.petshop_id = p.id
                        and e.evento in ('subscription_canceled', 'subscription_paused', 'refund', 'chargeback')))
  );
end $$;

create or replace function public.admin_pagantes() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hist_desde timestamptz;
  v_mes date := date_trunc('month', now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  select min(em) into v_hist_desde from public.petshop_status_hist;
  return jsonb_build_object(
    'meta', 15,
    'agora', now(),
    'hoje', (select count(*) from public.petshops where status in ('ativa', 'atrasada') and not conta_teste),
    'lojas', (
      select coalesce(jsonb_agg(x order by x.desde nulls last, x.nome), '[]'::jsonb) from (
        select p.id, p.nome, p.status, p.plano, p.periodo_meses, p.pago_ate,
          coalesce(p.assinatura_desde,
            (select min(h.em) from public.petshop_status_hist h where h.petshop_id = p.id and h.para in ('ativa', 'atrasada'))) as desde,
          (select max(h.em) from public.petshop_status_hist h where h.petshop_id = p.id and h.para = p.status) as status_desde
        from public.petshops p where p.status in ('ativa', 'atrasada') and not p.conta_teste
      ) x),
    'historico_desde', v_hist_desde,
    -- fim de cada um dos 6 meses fechados (meia-noite do dia 1 do mês seguinte, hora de Brasília)
    'meses', (
      select jsonb_agg(jsonb_build_object(
          'mes', to_char(m.ini, 'YYYY-MM'),
          'fim', m.fim,
          'confiavel', v_hist_desde is not null and m.fim >= v_hist_desde,
          'n', (select count(*) from public.petshops p
                 where not p.conta_teste and public.admin_status_em(p.id, m.fim) in ('ativa', 'atrasada')
                   and (p.assinatura_desde is null or p.assinatura_desde <= m.fim))
        ) order by m.ini)
      from (
        select (v_mes - make_interval(months => k))::date as ini,
               ((v_mes - make_interval(months => k - 1))::timestamp at time zone 'America/Sao_Paulo') as fim
        from generate_series(1, 6) k
      ) m),
    'passos', (select coalesce(jsonb_object_agg(passo, feito_em), '{}'::jsonb) from public.admin_empresa_passos)
  );
end $$;

create or replace function public.admin_vendas() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return jsonb_build_object(
    'lojas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'nome', s.nome, 'criado_em', s.criado_em, 'status', s.status, 'plano', s.plano, 'meses', s.periodo_meses,
        'teste_ate', s.teste_ate, 'vendedor', o.vendedor, 'utm', coalesce(o.utm, '{}'::jsonb), 'quer_ajuda', coalesce(o.quer_ajuda, false),
        -- o telefone só vem para quem pediu a ajuda da equipe
        'telefone', case when o.quer_ajuda then s.telefone end,
        'cupom', (select upper(e.payload ->> 'cupom') from public.cakto_eventos e
                   where e.petshop_id = s.id and nullif(e.payload ->> 'cupom', '') is not null
                     and e.evento in ('purchase_approved', 'subscription_created') order by e.id limit 1)
      ) order by s.criado_em desc)
      from public.petshops s left join public.petshops_origem o on o.petshop_id = s.id
      where not s.conta_teste
        and (o.vendedor is not null or o.utm <> '{}'::jsonb or o.quer_ajuda
         or exists (select 1 from public.cakto_eventos e where e.petshop_id = s.id and nullif(e.payload ->> 'cupom', '') is not null))
    ), '[]'::jsonb),
    'pagamentos', coalesce((
      select jsonb_agg(x.j order by x.id desc) from (
        select e.id, jsonb_build_object(
          'id', e.id, 'recebido_em', e.recebido_em, 'evento', e.evento, 'petshop_id', e.petshop_id,
          'nome', (select s.nome from public.petshops s where s.id = e.petshop_id),
          'vendedor', (select o.vendedor from public.petshops_origem o where o.petshop_id = e.petshop_id),
          'cupom', upper(nullif(e.payload ->> 'cupom', '')), 'valor', e.payload -> 'valor', 'desconto', e.payload -> 'desconto',
          'plano', (select c.valor from public.config_interna c where c.chave = 'cakto_oferta_' || (e.payload ->> 'oferta'))) as j
        from public.cakto_eventos e
        where e.evento in ('purchase_approved', 'subscription_renewed', 'subscription_late_recovered')
          and e.petshop_id is not null and e.recebido_em > now() - interval '400 days'
          and not exists (select 1 from public.petshops s where s.id = e.petshop_id and s.conta_teste)
        order by e.id desc limit 1000) x
    ), '[]'::jsonb));
end $$;

create or replace function public.admin_conversas_numeros(p_petshop uuid default null, p_dias integer default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_dias integer := least(greatest(coalesce(p_dias, 30), 1), 365); v_desde timestamptz;
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  v_desde := now() - make_interval(days => v_dias);
  -- no geral, sem as contas de teste; pedindo um pet shop, os números dele (mesmo sendo de teste)
  return jsonb_build_object('dias', v_dias)
    || (select jsonb_build_object(
          'conversas', count(*), 'mozart', count(*) filter (where c.canal = 'mozart'), 'ajuda', count(*) filter (where c.canal = 'ajuda'),
          'nao_resolveu', count(*) filter (where c.resolveu is false), 'resolveu', count(*) filter (where c.resolveu is true),
          'pediu_equipe', count(*) filter (where c.pediu_equipe), 'lojas', count(distinct c.petshop_id))
        from public.conversas c where c.criado_em >= v_desde
          and (case when p_petshop is null then not exists (select 1 from public.petshops s where s.id = c.petshop_id and s.conta_teste) else c.petshop_id = p_petshop end))
    || (select jsonb_build_object(
          'pedidos', count(*), 'erros', count(*) filter (where t.fim in ('erro', 'demorou')), 'recusas', count(*) filter (where t.fim = 'recusa'),
          'limites', count(*) filter (where t.fim = 'limite'), 'ferramentas', coalesce(sum(t.ferramentas), 0),
          'tokens_entrada', coalesce(sum(t.tokens_entrada), 0), 'tokens_saida', coalesce(sum(t.tokens_saida), 0),
          'tokens_cache', coalesce(sum(coalesce(t.tokens_cache_lidos, 0)), 0))
        from public.mozart_tempos t where t.em >= v_desde
          and (case when p_petshop is null then not exists (select 1 from public.petshops s where s.id = t.petshop_id and s.conta_teste) else t.petshop_id = p_petshop end))
    || jsonb_build_object('aberturas', (select count(*) from public.equipe_maestro_acessos a where a.em >= v_desde
          and (case when p_petshop is null then not exists (select 1 from public.petshops s where s.id = a.petshop_id and s.conta_teste) else a.petshop_id = p_petshop end)));
end $$;

create or replace function public.admin_mozart_tempos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return (
    select jsonb_build_object(
      'pedidos', count(*),
      'mediana_ms', percentile_cont(0.5) within group (order by total_ms),
      'p90_ms', percentile_cont(0.9) within group (order by total_ms),
      'primeiro_mediana_ms', percentile_cont(0.5) within group (order by coalesce(primeiro_ms, sinal_ms)),
      'primeiro_p90_ms', percentile_cont(0.9) within group (order by coalesce(primeiro_ms, sinal_ms)),
      'voltas_media', round(avg(voltas)::numeric, 2),
      'tokens_entrada_media', round(avg(tokens_entrada)),
      'tokens_saida_media', round(avg(tokens_saida)),
      'tokens_cache_lidos_media', round(avg(tokens_cache_lidos)))
    from public.mozart_tempos t
    where em > now() - interval '7 days' and fim in ('ok', 'cartao', 'demorou')
      and not exists (select 1 from public.petshops s where s.id = t.petshop_id and s.conta_teste));
end $$;

-- ============================================================
-- 4. Índices
-- ============================================================
-- Financeiro: "valores recebidos neste mês que alguém apagou depois" filtra pela data guardada no lançamento apagado
create index if not exists lancamentos_alteracoes_apagou_data_idx
  on public.lancamentos_alteracoes (petshop_id, ((antes ->> 'data'))) where acao = 'apagou';
-- Agenda: bloqueios que cruzam a semana (início antes do fim da semana e fim depois do começo)
create index if not exists bloqueios_petshop_id_fim_idx on public.bloqueios (petshop_id, fim);
