-- Painel do administrador: clientes pagantes rumo aos 15 (hora de abrir a empresa) e a lista de passos para abrir o CNPJ.
--
-- Quem conta como pagante: status 'ativa' ou 'atrasada'.
--   ativa    = a Cakto avisou pagamento (compra, renovação, recuperação) ou o admin marcou à mão;
--   atrasada = a assinatura segue de pé, só a cobrança do mês falhou (a Cakto ainda tenta cobrar).
--   Ficam de fora: 'teste' (não pagou), 'cortesia' (usa sem pagar) e 'cancelada' (mesmo com pago_ate no futuro:
--   pagou o período, mas não renova).
--
-- Evolução por mês: o status de cada conta no fim de cada mês sai de petshop_status_hist (gravado a cada troca de
-- status desde 20261175). Antes do primeiro registro não dá para saber; esses meses voltam marcados como não confiáveis.
-- Só cria objetos novos; nada é alterado.

-- ------------------------------------------------------------
-- Passos para abrir a empresa: uma linha por passo marcado como feito
-- ------------------------------------------------------------
create table if not exists public.admin_empresa_passos (
  passo text primary key check (passo in ('contador', 'cnpj', 'cakto', 'dados', 'advogado', 'notas')),
  feito_em timestamptz not null default now(),
  feito_por uuid references auth.users (id) on delete set null
);
-- sem regra de acesso: só as funções abaixo leem e gravam
alter table public.admin_empresa_passos enable row level security;
revoke all on public.admin_empresa_passos from public, anon, authenticated;

-- ------------------------------------------------------------
-- Status de uma conta num instante, pelo histórico de trocas
-- ------------------------------------------------------------
-- uso interno (só admin_pagantes chama): sem definer e sem permissão para ninguém
create or replace function public.admin_status_em(p_petshop uuid, p_quando timestamptz) returns public.status_assinatura
language sql stable set search_path = '' as $$
  select case when p.criado_em > p_quando then null else coalesce(
    -- a última troca até o instante
    (select h.para from public.petshop_status_hist h where h.petshop_id = p.id and h.em <= p_quando order by h.em desc, h.id desc limit 1),
    -- sem troca até lá: o status de antes da primeira troca depois dele
    (select h.de from public.petshop_status_hist h where h.petshop_id = p.id and h.em > p_quando order by h.em, h.id limit 1),
    -- nunca trocou: o status de hoje
    p.status) end
  from public.petshops p where p.id = p_petshop
$$;
revoke execute on function public.admin_status_em(uuid, timestamptz) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Pagantes hoje, a lista, os últimos 6 meses e os passos marcados
-- ------------------------------------------------------------
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
    'hoje', (select count(*) from public.petshops where status in ('ativa', 'atrasada')),
    'lojas', (
      select coalesce(jsonb_agg(x order by x.desde nulls last, x.nome), '[]'::jsonb) from (
        select p.id, p.nome, p.status, p.plano, p.periodo_meses, p.pago_ate,
          coalesce(p.assinatura_desde,
            (select min(h.em) from public.petshop_status_hist h where h.petshop_id = p.id and h.para in ('ativa', 'atrasada'))) as desde,
          (select max(h.em) from public.petshop_status_hist h where h.petshop_id = p.id and h.para = p.status) as status_desde
        from public.petshops p where p.status in ('ativa', 'atrasada')
      ) x),
    'historico_desde', v_hist_desde,
    -- fim de cada um dos 6 meses fechados (meia-noite do dia 1 do mês seguinte, hora de Brasília)
    'meses', (
      select jsonb_agg(jsonb_build_object(
          'mes', to_char(m.ini, 'YYYY-MM'),
          'fim', m.fim,
          'confiavel', v_hist_desde is not null and m.fim >= v_hist_desde,
          'n', (select count(*) from public.petshops p
                 where public.admin_status_em(p.id, m.fim) in ('ativa', 'atrasada')
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
revoke execute on function public.admin_pagantes() from public, anon;
grant execute on function public.admin_pagantes() to authenticated;

-- ------------------------------------------------------------
-- Marcar ou desmarcar um passo; devolve os passos marcados
-- ------------------------------------------------------------
create or replace function public.admin_empresa_marcar(p_passo text, p_feito boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  if p_passo is null or p_passo not in ('contador', 'cnpj', 'cakto', 'dados', 'advogado', 'notas') then
    raise exception 'Passo desconhecido.';
  end if;
  if coalesce(p_feito, false) then
    insert into public.admin_empresa_passos (passo, feito_por) values (p_passo, (select auth.uid())) on conflict (passo) do nothing;
  else
    delete from public.admin_empresa_passos where passo = p_passo;
  end if;
  return (select coalesce(jsonb_object_agg(passo, feito_em), '{}'::jsonb) from public.admin_empresa_passos);
end $$;
revoke execute on function public.admin_empresa_marcar(text, boolean) from public, anon;
grant execute on function public.admin_empresa_marcar(text, boolean) to authenticated;
