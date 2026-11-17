-- =====================================================================================================================
-- Crédito em quantas vezes em todas as telas que recebem, e o parcelado separado por mês em "A receber da maquininha"
-- =====================================================================================================================
-- Acrescenta uma tabela pequena com o seu gatilho (quem recebeu cada conta) e troca duas funções da 20261204 (taxas da
-- maquininha), copiadas da definição de lá e mudadas só no que está descrito abaixo. As permissões de cada uma continuam as
-- mesmas. O aplicativo de antes continua igual com esta migração aplicada (as respostas só ganham uma chave a mais).
--
-- 1. lancamentos_recebidos: quem recebeu e quando, para a conta a receber que virou paga (o "Recebi" da conta inteira, pelo
--    receber_conta ou pela baixa do Financeiro). Uma linha por lançamento; o gatilho grava quando "pago" passa de não para sim
--    (a última vez vale). Ninguém grava direto; quem cuida do financeiro lê (como lancamentos_taxas).
--    maquininha_parcelas(p, ids, vezes): a tela anota em quantas vezes foi o crédito logo depois de gravar o pagamento.
--    Antes, quem não cuida do financeiro (recepção, pelo caixa) só anotava nos lançamentos que ELA criou nos últimos 30 minutos.
--    Agora também nas contas que ELA recebeu inteiras nos últimos 30 minutos (lancamentos_recebidos): o fiado, a mensalidade
--    da creche, o sinal — a conta foi anotada por outra pessoa, às vezes dias antes, e quem recebeu é quem diz em quantas
--    vezes foi. A venda ou a conta recebida por outra pessoa continua fora. O resto não muda: só entrada paga com crédito, do
--    próprio pet shop, com o caixa aberto (ou sem caixa), só quem tem a área Caixa, Financeiro ou Relatórios, de 1 a 12 vezes,
--    até 20 de uma vez.
--
-- 2. taxas_do_periodo(p, de, até): "A receber da maquininha" separa o crédito parcelado em parcelas, uma por mês:
--    a parcela 1 cai em dia do pagamento + dias para cair (o mesmo dia de antes) e a parcela n, 30 dias depois da anterior
--    (dia + dias + 30 × (n − 1)), a regra do "parcelado lojista". O líquido (valor − taxa) é dividido em partes iguais,
--    cortadas no centavo; o centavo que sobra fica na primeira parcela (3x de R$ 277,00 = 92,34 + 92,33 + 92,33).
--    Débito, Pix, crédito à vista e o resto da resposta (taxa, cartão, por forma) continuam iguais. Para achar as parcelas
--    que ainda vão cair, olha os pagamentos dos últimos 460 dias (antes 130): 120 dias para cair + 11 meses de parcelas.
--    Um pagamento sem parcela em aberto não aparece, como antes. Chave nova na resposta: "parcelado" (true quando alguma
--    parcela em aberto é de crédito parcelado), para a tela explicar a regra numa linha.
-- =====================================================================================================================

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Quem recebeu a conta, e maquininha_parcelas (a definição da 20261204, com "ou a conta que eu recebi agora")
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.lancamentos_recebidos (
  lancamento_id uuid primary key references public.lancamentos (id) on delete cascade,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  recebido_por uuid references auth.users (id) on delete set null,
  recebido_em timestamptz not null default now()
);
create index if not exists lancamentos_recebidos_petshop_idx on public.lancamentos_recebidos (petshop_id);
alter table public.lancamentos_recebidos enable row level security;
revoke all on public.lancamentos_recebidos from public, anon, authenticated;
grant select on public.lancamentos_recebidos to authenticated;
drop policy if exists lancamentos_recebidos_ler on public.lancamentos_recebidos;
create policy lancamentos_recebidos_ler on public.lancamentos_recebidos for select to authenticated
  using (petshop_id in (select public.petshops_do_financeiro()));

create or replace function public.lancamento_recebido_por() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.lancamentos_recebidos as r (lancamento_id, petshop_id, recebido_por, recebido_em)
    values (new.id, new.petshop_id, (select auth.uid()), now())
  on conflict (lancamento_id) do update set recebido_por = excluded.recebido_por, recebido_em = excluded.recebido_em;
  return null;
end $$;
revoke execute on function public.lancamento_recebido_por() from public, anon, authenticated;
drop trigger if exists lancamento_recebido_por on public.lancamentos;
create trigger lancamento_recebido_por after update of pago on public.lancamentos
  for each row when (old.pago is false and new.pago is true and new.tipo = 'entrada')
  execute function public.lancamento_recebido_por();

create or replace function public.maquininha_parcelas(p uuid, p_ids uuid[], p_parcelas int)
returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_fin boolean;
  v_n int := 0;
  l record;
begin
  if (select auth.uid()) is null or p is null or not (p in (select public.meus_petshops())) then
    raise exception 'Sem acesso a este pet shop.' using errcode = '42501';
  end if;
  if not public.tenho_area(p, array['caixa', 'financeiro', 'relatorios']) then
    raise exception 'Só quem recebe anota as parcelas.' using errcode = '42501';
  end if;
  if p_parcelas is null or p_parcelas < 1 or p_parcelas > 12 then raise exception 'Escolha de 1 a 12 vezes.'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then return 0; end if;
  if cardinality(p_ids) > 20 then raise exception 'Muitos lançamentos de uma vez.'; end if;
  v_fin := public.cuido_do_financeiro(p);
  for l in
    select x.id from public.lancamentos x
    where x.id = any (p_ids) and x.petshop_id = p and x.tipo = 'entrada' and x.pago and x.movimento is null
      and (x.forma = 'credito' or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(x.pagamentos) = 'array' then x.pagamentos else '[]'::jsonb end) e where e ->> 'forma' = 'credito'))
      and (x.caixa_id is null or exists (select 1 from public.caixas c where c.id = x.caixa_id and c.fechado_em is null))
      and (v_fin or (x.criado_por = (select auth.uid()) and x.criado_em > now() - interval '30 minutes')
        -- a conta inteira que eu recebi agora (o "Recebi"), mesmo que outra pessoa tenha anotado a conta
        or exists (select 1 from public.lancamentos_recebidos r where r.lancamento_id = x.id and r.recebido_por = (select auth.uid())
          and r.recebido_em > now() - interval '30 minutes'))
  loop
    perform public.taxa_do_lancamento(l.id, p_parcelas);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.maquininha_parcelas(uuid, uuid[], int) from public, anon;
grant execute on function public.maquininha_parcelas(uuid, uuid[], int) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. taxas_do_periodo (a definição da 20261204, com o crédito parcelado separado em parcelas em "a_receber")
-- ---------------------------------------------------------------------------------------------------------------------
-- As mesmas entradas do faturamento (entrada, paga, sem gaveta, pela data). a_receber: as parcelas que caem depois de hoje,
-- por dia, já sem a taxa. Crédito em n vezes: n parcelas, a cada 30 dias a partir do dia em que cai a primeira.
create or replace function public.taxas_do_periodo(p uuid, p_de date, p_ate date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hoje date;
  v_res jsonb;
begin
  if (select auth.uid()) is null or p is null or not (p in (select public.meus_petshops())) then
    raise exception 'Sem acesso a este pet shop.' using errcode = '42501';
  end if;
  if not public.cuido_do_financeiro(p) then
    raise exception 'As taxas da maquininha são com quem cuida do financeiro.' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 372 then raise exception 'Escolha um período de até um ano.'; end if;
  select (now() at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date into v_hoje from public.petshops s where s.id = p;
  with tx as (
    select t.*, l.data from public.lancamentos_taxas t join public.lancamentos l on l.id = t.lancamento_id
    where t.petshop_id = p and l.petshop_id = p and l.tipo = 'entrada' and l.pago and l.movimento is null and l.data between p_de and p_ate
  ),
  pt as (select x.forma, sum(x.valor) as valor, sum(x.taxa) as taxa from tx cross join lateral jsonb_to_recordset(tx.partes) as x(forma text, valor numeric, taxa numeric) group by x.forma),
  -- cada parte em parcelas: 1 para débito, Pix e crédito à vista; n para o crédito em n vezes
  pa as (
    select x.cai_em, x.valor - x.taxa as liquido, q.n, (q.n > 1) as parcelado
    from public.lancamentos_taxas t join public.lancamentos l on l.id = t.lancamento_id
    cross join lateral jsonb_to_recordset(t.partes) as x(forma text, valor numeric, taxa numeric, cai_em date, parcelas int)
    cross join lateral (select case when x.forma = 'credito' then least(greatest(coalesce(x.parcelas, 1), 1), 12) else 1 end as n) q
    where t.petshop_id = p and l.petshop_id = p and l.tipo = 'entrada' and l.pago and l.movimento is null
      and l.data >= v_hoje - 460 and x.cai_em + 30 * (q.n - 1) > v_hoje
  ),
  pc as (
    select pa.cai_em + 30 * (k - 1) as cai_em, pa.parcelado,
      case when k = 1 then pa.liquido - trunc(pa.liquido / pa.n, 2) * (pa.n - 1) else trunc(pa.liquido / pa.n, 2) end as valor
    from pa cross join lateral generate_series(1, pa.n) k
  ),
  ar as (select pc.cai_em, sum(pc.valor) as valor, bool_or(pc.parcelado) as parcelado from pc where pc.cai_em > v_hoje group by pc.cai_em)
  select jsonb_build_object(
    'de', p_de, 'ate', p_ate, 'hoje', v_hoje,
    'configurada', exists (select 1 from public.taxas_maquininha m where m.petshop_id = p),
    'taxa', coalesce((select sum(taxa) from tx), 0),
    'cartao', coalesce((select sum(cartao) from tx), 0),
    'lancamentos', (select count(*) from tx where tx.taxa > 0),
    'por_forma', coalesce((select jsonb_agg(jsonb_build_object('forma', pt.forma, 'valor', pt.valor, 'taxa', pt.taxa) order by pt.forma) from pt), '[]'::jsonb),
    'a_receber', coalesce((select jsonb_agg(jsonb_build_object('dia', ar.cai_em, 'valor', ar.valor) order by ar.cai_em) from ar), '[]'::jsonb),
    'parcelado', coalesce((select bool_or(ar.parcelado) from ar), false)
  ) into v_res;
  return v_res;
end $$;
revoke execute on function public.taxas_do_periodo(uuid, date, date) from public, anon;
grant execute on function public.taxas_do_periodo(uuid, date, date) to authenticated;
