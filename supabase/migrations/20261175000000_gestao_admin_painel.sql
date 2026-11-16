-- Painel do dono da plataforma: visão geral (status, cadastros, conversão do teste, receita estimada, cancelamentos, planos),
-- uso por conta (última atividade, dias ativos, ações em 14 dias, sinais de risco) e detalhe de conta (histórico do status).
-- Só números e dados do negócio (nome, plano, status, contato do dono). Nada de clientes, pets ou valores dos pet shops.
-- Aditiva: tabela nova, gatilho novo em petshops (só grava histórico), índices e funções novas. O código de hoje não muda.

-- Histórico de status: cada troca de status de um pet shop, venha da Cakto, do painel ou do próprio sistema.
create table if not exists public.petshop_status_hist (
  id bigint generated always as identity primary key,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  de public.status_assinatura,
  para public.status_assinatura not null,
  plano text,
  em timestamptz not null default now()
);
create index if not exists petshop_status_hist_petshop_idx on public.petshop_status_hist (petshop_id, em desc);
create index if not exists petshop_status_hist_para_idx on public.petshop_status_hist (para, em);
-- sem regra de acesso: só as funções abaixo leem
alter table public.petshop_status_hist enable row level security;
revoke all on public.petshop_status_hist from public, anon, authenticated;

create or replace function public.petshop_status_registrar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status is distinct from old.status then
    insert into public.petshop_status_hist (petshop_id, de, para, plano) values (new.id, old.status, new.status, new.plano);
  end if;
  return new;
end $$;
revoke execute on function public.petshop_status_registrar() from public, anon, authenticated;
drop trigger if exists petshops_status_hist on public.petshops;
create trigger petshops_status_hist after update of status on public.petshops
  for each row execute function public.petshop_status_registrar();

-- Índices para contar "o que cada pet shop fez" sem varrer as tabelas inteiras.
create index if not exists agendamentos_petshop_criado_idx on public.agendamentos (petshop_id, criado_em);
create index if not exists lancamentos_petshop_criado_idx on public.lancamentos (petshop_id, criado_em);
create index if not exists estadias_petshop_criado_idx on public.estadias (petshop_id, criado_em);
create index if not exists clientes_petshop_criado_idx on public.clientes (petshop_id, criado_em);
create index if not exists cakto_eventos_petshop_idx on public.cakto_eventos (petshop_id, recebido_em desc) where petshop_id is not null;

-- ------------------------------------------------------------
-- Visão geral: só contagens.
-- ------------------------------------------------------------
create or replace function public.admin_visao_geral() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return jsonb_build_object(
    'agora', now(),
    'status', (
      select jsonb_build_object(
        'total', count(*),
        'teste', count(*) filter (where status = 'teste' and teste_ate > now()),
        'teste_vencido', count(*) filter (where status = 'teste' and teste_ate <= now()),
        'ativa', count(*) filter (where status = 'ativa'),
        'atrasada', count(*) filter (where status = 'atrasada'),
        'cancelada', count(*) filter (where status = 'cancelada'),
        'cortesia', count(*) filter (where status = 'cortesia'))
      from public.petshops),
    -- cadastros por dia (horário de Brasília), 90 dias, com os dias sem cadastro
    'cadastros', (
      select coalesce(jsonb_agg(jsonb_build_object('dia', d.dia::date, 'n', coalesce(c.n, 0)) order by d.dia), '[]'::jsonb)
      from generate_series(v_hoje - 89, v_hoje, interval '1 day') as d(dia)
      left join (
        select (criado_em at time zone 'America/Sao_Paulo')::date as dia, count(*) as n
        from public.petshops where criado_em >= (v_hoje - 89)::timestamp at time zone 'America/Sao_Paulo'
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
        group by 1
      ) t),
    -- planos de quem está pagando (ou atrasado) e cortesias, por período de cobrança
    'planos', (
      select coalesce(jsonb_agg(jsonb_build_object('plano', plano, 'meses', periodo_meses, 'status', status, 'n', n)), '[]'::jsonb) from (
        select plano, periodo_meses, status, count(*) as n from public.petshops
        where status in ('ativa', 'atrasada', 'cortesia') group by 1, 2, 3
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
        ) u group by mes
      ) c on c.mes = m.mes),
    'canceladas_sem_data', (
      select count(*) from public.petshops p where p.status = 'cancelada'
        and not exists (select 1 from public.petshop_status_hist h where h.petshop_id = p.id and h.para = 'cancelada')
        and not exists (select 1 from public.cakto_eventos e where e.petshop_id = p.id
                        and e.evento in ('subscription_canceled', 'subscription_paused', 'refund', 'chargeback')))
  );
end $$;

-- ------------------------------------------------------------
-- Uso por conta, 14 dias: quando entrou, quando gravou algo, em quantos dias usou e quantas ações de cada tipo.
-- Conta só quantidades; nenhum nome de cliente ou pet e nenhum valor.
-- ------------------------------------------------------------
create or replace function public.admin_uso_contas() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_desde timestamptz := now() - interval '14 days';
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date - 13;
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return (
    select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select p.id, p.nome, p.status, p.plano, p.teste_ate, p.criado_em,
        public.limite_de_acessos(p.plano) as limite,
        eq.pessoas, eq.ultimo_login,
        (select max(pr.visto_em) from public.presenca pr where pr.petshop_id = p.id) as visto_em,
        greatest(
          (select max(a.criado_em) from public.agendamentos a where a.petshop_id = p.id),
          (select max(l.criado_em) from public.lancamentos l where l.petshop_id = p.id),
          (select max(e.criado_em) from public.estadias e where e.petshop_id = p.id),
          (select max(c.criado_em) from public.clientes c where c.petshop_id = p.id)) as ultima_gravacao,
        (select count(*) from public.agendamentos a where a.petshop_id = p.id and a.criado_em >= v_desde) as agendamentos_14,
        (select count(*) from public.lancamentos l where l.petshop_id = p.id and l.criado_em >= v_desde and l.tipo = 'entrada' and l.movimento is null) as vendas_14,
        (select count(*) from public.estadias e where e.petshop_id = p.id and e.criado_em >= v_desde and e.tipo = 'creche') as creche_14,
        (select count(*) from public.estadias e where e.petshop_id = p.id and e.criado_em >= v_desde and e.tipo = 'hotel') as hotel_14,
        (select count(*) from public.clientes c where c.petshop_id = p.id and c.criado_em >= v_desde) as clientes_14,
        (select count(*) from (
            select u.dia from public.uso_diario u where u.petshop_id = p.id and u.dia >= v_dia
            union select (a.criado_em at time zone 'America/Sao_Paulo')::date from public.agendamentos a where a.petshop_id = p.id and a.criado_em >= v_desde
            union select (l.criado_em at time zone 'America/Sao_Paulo')::date from public.lancamentos l where l.petshop_id = p.id and l.criado_em >= v_desde
            union select (e.criado_em at time zone 'America/Sao_Paulo')::date from public.estadias e where e.petshop_id = p.id and e.criado_em >= v_desde
          ) d where d.dia >= v_dia) as dias_14,
        (select coalesce(jsonb_agg(distinct u.area), '[]'::jsonb) from public.uso_diario u where u.petshop_id = p.id and u.dia >= v_dia) as areas_14
      from public.petshops p
      cross join lateral (
        select count(*) filter (where d.ativo and (d.user_id is not null or nullif(trim(coalesce(d.email_convite, '')), '') is not null)) as pessoas,
          max(u.last_sign_in_at) filter (where d.ativo) as ultimo_login
        from public.profissionais d left join auth.users u on u.id = d.user_id
        where d.petshop_id = p.id
      ) eq
    ) x
  );
end $$;

-- ------------------------------------------------------------
-- Detalhe de uma conta: assinatura e histórico do status (trocas registradas e avisos da Cakto, só o nome do aviso e a data).
-- ------------------------------------------------------------
create or replace function public.admin_conta(p_petshop uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return (
    select jsonb_build_object(
      'id', p.id, 'status', p.status, 'plano', p.plano, 'periodo_meses', p.periodo_meses,
      'teste_ate', p.teste_ate, 'pago_ate', p.pago_ate, 'assinatura_desde', p.assinatura_desde, 'criado_em', p.criado_em,
      'historico', (
        select coalesce(jsonb_agg(h order by h.em desc), '[]'::jsonb) from (
          select 'status' as tipo, s.em, s.de::text as de, s.para::text as para, null::text as evento
            from public.petshop_status_hist s where s.petshop_id = p.id
          union all
          select 'cakto', e.recebido_em, null, null, e.evento
            from public.cakto_eventos e where e.petshop_id = p.id
          order by 2 desc limit 100
        ) h)
    )
    from public.petshops p where p.id = p_petshop
  );
end $$;

revoke execute on function public.admin_visao_geral(), public.admin_uso_contas(), public.admin_conta(uuid) from public, anon;
grant execute on function public.admin_visao_geral(), public.admin_uso_contas(), public.admin_conta(uuid) to authenticated;
