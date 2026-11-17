-- =====================================================================================================================
-- Taxas da maquininha e Indicadores (gráficos de Relatórios)
-- =====================================================================================================================
-- Só acrescenta: duas tabelas novas, um gatilho novo em lancamentos (depois de gravar) e funções novas. Muda uma função
-- que já existia, só acrescentando chaves na resposta:
--   · lucro_do_periodo (a definição da 20261200, igual, com "taxas_maquininha" e "resultado_depois_taxas" a mais).
-- O aplicativo de antes continua igual com esta migração aplicada.
--
-- Taxas da maquininha
--   · taxas_maquininha: o que a maquininha cobra, por forma (débito, crédito à vista, crédito parcelado, Pix): % de cada
--     venda, um valor fixo por venda (se tiver) e em quantos dias o dinheiro cai. Só o dono grava; quem cuida do
--     financeiro lê. Uma linha por pet shop.
--   · lancamentos_taxas: a taxa de cada entrada paga com cartão ou Pix, calculada NA HORA DO PAGAMENTO com as taxas da loja
--     daquele momento (a regra fica guardada na linha). Mudar as taxas depois não muda o que já foi pago. Pagamento
--     dividido: cada parte paga a taxa da sua forma. Quem cuida do financeiro lê; ninguém grava direto (só o gatilho).
--   · lancamentos não ganha coluna: a equipe que lê lançamentos (recepção, pelo caixa) não enxerga taxa nenhuma.
--   · Caixa fechado: a taxa é calculada quando o lançamento entra ou muda. O caixa fechado já não deixa mudar valor, forma
--     nem pagamentos; as parcelas só são anotadas com o caixa aberto (maquininha_parcelas).
--   · Nada muda no dinheiro do cliente: o preço é o mesmo; a taxa só mostra quanto a loja recebe de verdade.
--
-- Indicadores: indicadores_do_periodo, uma ida ao banco para os gráficos (por mês). As mesmas regras de Relatórios e de
-- Quanto sobrou: faturamento = entradas pagas − devoluções − crédito deixado + crédito usado fora; resultado = faturamento −
-- saídas (sem devolução); peças de serviço e produto por lucro_pecas. Quem não vê o dinheiro recebe só as contagens.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. As taxas da loja
-- ---------------------------------------------------------------------------------------------------------------------
-- "2" a "12" → % de cada número de parcelas (só as que a loja quiser; o resto usa a % do parcelado)
create or replace function public.taxa_parcelas_ok(j jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select j is not null and jsonb_typeof(j) = 'object' and not exists (
    select 1 from jsonb_each(j) x
    where x.key !~ '^([2-9]|1[0-2])$' or jsonb_typeof(x.value) <> 'number' or (x.value #>> '{}')::numeric < 0 or (x.value #>> '{}')::numeric > 30)
$$;
revoke execute on function public.taxa_parcelas_ok(jsonb) from public, anon;
grant execute on function public.taxa_parcelas_ok(jsonb) to authenticated;

create table if not exists public.taxas_maquininha (
  petshop_id uuid primary key references public.petshops (id) on delete cascade,
  debito_pct numeric(5, 2) not null default 0 check (debito_pct between 0 and 30),
  debito_fixo numeric(6, 2) not null default 0 check (debito_fixo between 0 and 50),
  debito_dias smallint not null default 1 check (debito_dias between 0 and 120),
  credito_pct numeric(5, 2) not null default 0 check (credito_pct between 0 and 30),
  credito_fixo numeric(6, 2) not null default 0 check (credito_fixo between 0 and 50),
  credito_dias smallint not null default 30 check (credito_dias between 0 and 120),
  -- parcelado: em branco, usa a do crédito à vista
  parcelado_pct numeric(5, 2) check (parcelado_pct is null or parcelado_pct between 0 and 30),
  parcelado_dias smallint check (parcelado_dias is null or parcelado_dias between 0 and 120),
  parcelas_pct jsonb not null default '{}'::jsonb check (public.taxa_parcelas_ok(parcelas_pct)),
  pix_pct numeric(5, 2) not null default 0 check (pix_pct between 0 and 30),
  pix_fixo numeric(6, 2) not null default 0 check (pix_fixo between 0 and 50),
  pix_dias smallint not null default 0 check (pix_dias between 0 and 120),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null
);
alter table public.taxas_maquininha enable row level security;
revoke all on public.taxas_maquininha from public, anon, authenticated;
grant select, insert, update, delete on public.taxas_maquininha to authenticated;
drop policy if exists taxas_maquininha_ler on public.taxas_maquininha;
create policy taxas_maquininha_ler on public.taxas_maquininha for select to authenticated
  using (petshop_id in (select public.petshops_do_financeiro()));
drop policy if exists taxas_maquininha_criar on public.taxas_maquininha;
create policy taxas_maquininha_criar on public.taxas_maquininha for insert to authenticated
  with check ((select public.sou_dono(taxas_maquininha.petshop_id)));
drop policy if exists taxas_maquininha_editar on public.taxas_maquininha;
create policy taxas_maquininha_editar on public.taxas_maquininha for update to authenticated
  using ((select public.sou_dono(taxas_maquininha.petshop_id))) with check ((select public.sou_dono(taxas_maquininha.petshop_id)));
drop policy if exists taxas_maquininha_apagar on public.taxas_maquininha;
create policy taxas_maquininha_apagar on public.taxas_maquininha for delete to authenticated
  using ((select public.sou_dono(taxas_maquininha.petshop_id)));

-- quem mudou e quando: sempre do banco (o que a tela manda é ignorado)
create or replace function public.taxas_maquininha_carimbo() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  new.atualizado_por := (select auth.uid());
  return new;
end $$;
revoke execute on function public.taxas_maquininha_carimbo() from public, anon, authenticated;
drop trigger if exists taxas_maquininha_carimbo on public.taxas_maquininha;
create trigger taxas_maquininha_carimbo before insert or update on public.taxas_maquininha
  for each row execute function public.taxas_maquininha_carimbo();

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. A conta da taxa (a mesma de src/lib/gestao/maquininha.ts, calcularTaxa)
-- ---------------------------------------------------------------------------------------------------------------------
-- p_regra: a linha de taxas_maquininha em jsonb. As partes por forma são as de partesPorForma (dinheiro.ts): pagamento
-- dividido soma por forma; se as partes não fecham com o valor, vale a forma do lançamento.
-- Cada parte em débito, crédito ou Pix: taxa = valor × % + fixo (arredondada ao centavo, nunca mais que a parte);
-- crédito em 2 ou mais vezes usa a % daquele número de parcelas, senão a do parcelado, senão a do crédito à vista.
-- cai_em = dia do pagamento + dias para cair.
-- Devolve {taxa, cartao, partes: [{forma, valor, parcelas, pct, fixo, taxa, dias, cai_em}]}.
create or replace function public.taxa_calcular(p_regra jsonb, p_valor numeric, p_forma text, p_pagamentos jsonb, p_parcelas int, p_data date)
returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  x jsonb;
  v numeric;
  v_soma numeric := 0;
  v_partes jsonb := '{}'::jsonb;
  k text;
  v_valor numeric;
  v_pct numeric;
  v_fixo numeric;
  v_dias int;
  v_taxa numeric;
  v_n int := coalesce(p_parcelas, 1);
  v_saida jsonb := '[]'::jsonb;
  v_total numeric := 0;
  v_cartao numeric := 0;
begin
  if p_regra is null or p_valor is null or p_valor <= 0 then return jsonb_build_object('taxa', 0, 'cartao', 0, 'partes', '[]'::jsonb); end if;
  if p_pagamentos is not null and jsonb_typeof(p_pagamentos) = 'array' then
    for x in select * from jsonb_array_elements(p_pagamentos) loop
      if jsonb_typeof(x) <> 'object' then continue; end if;
      begin v := round((x ->> 'valor')::numeric, 2); exception when others then continue; end;
      if v is null or v <= 0 then continue; end if;
      k := case when x ->> 'forma' in ('dinheiro', 'pix', 'debito', 'credito', 'outro') then x ->> 'forma' else 'outro' end;
      v_partes := v_partes || jsonb_build_object(k, coalesce((v_partes ->> k)::numeric, 0) + v);
      v_soma := v_soma + v;
    end loop;
  end if;
  if v_soma = 0 or round(v_soma, 2) <> round(p_valor, 2) then
    v_partes := jsonb_build_object(case when p_forma in ('dinheiro', 'pix', 'debito', 'credito', 'outro') then p_forma else 'outro' end, round(p_valor, 2));
  end if;
  for k in select unnest(array['debito', 'credito', 'pix']) loop
    if not (v_partes ? k) then continue; end if;
    v_valor := (v_partes ->> k)::numeric;
    if k = 'debito' then
      v_pct := coalesce((p_regra ->> 'debito_pct')::numeric, 0); v_fixo := coalesce((p_regra ->> 'debito_fixo')::numeric, 0); v_dias := coalesce((p_regra ->> 'debito_dias')::int, 0);
    elsif k = 'pix' then
      v_pct := coalesce((p_regra ->> 'pix_pct')::numeric, 0); v_fixo := coalesce((p_regra ->> 'pix_fixo')::numeric, 0); v_dias := coalesce((p_regra ->> 'pix_dias')::int, 0);
    elsif v_n >= 2 then
      v_pct := coalesce((p_regra -> 'parcelas_pct' ->> v_n::text)::numeric, (p_regra ->> 'parcelado_pct')::numeric, (p_regra ->> 'credito_pct')::numeric, 0);
      v_fixo := coalesce((p_regra ->> 'credito_fixo')::numeric, 0);
      v_dias := coalesce((p_regra ->> 'parcelado_dias')::int, (p_regra ->> 'credito_dias')::int, 0);
    else
      v_pct := coalesce((p_regra ->> 'credito_pct')::numeric, 0); v_fixo := coalesce((p_regra ->> 'credito_fixo')::numeric, 0); v_dias := coalesce((p_regra ->> 'credito_dias')::int, 0);
    end if;
    v_taxa := least(v_valor, round(v_valor * v_pct / 100 + v_fixo, 2));
    v_total := v_total + v_taxa;
    v_cartao := v_cartao + v_valor;
    v_saida := v_saida || jsonb_build_object('forma', k, 'valor', v_valor, 'parcelas', case when k = 'credito' then greatest(v_n, 1) end,
      'pct', v_pct, 'fixo', v_fixo, 'taxa', v_taxa, 'dias', v_dias, 'cai_em', p_data + v_dias);
  end loop;
  return jsonb_build_object('taxa', round(v_total, 2), 'cartao', round(v_cartao, 2), 'partes', v_saida);
end $$;
revoke execute on function public.taxa_calcular(jsonb, numeric, text, jsonb, int, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. A taxa de cada entrada paga (guardada no pagamento)
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.lancamentos_taxas (
  lancamento_id uuid primary key references public.lancamentos (id) on delete cascade,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  parcelas smallint check (parcelas is null or parcelas between 1 and 12),
  taxa numeric(10, 2) not null default 0 check (taxa >= 0),
  cartao numeric(10, 2) not null default 0 check (cartao >= 0),
  partes jsonb not null default '[]'::jsonb,
  -- as taxas da loja no momento do pagamento (mudar as taxas depois não mexe aqui)
  regra jsonb not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz
);
create index if not exists lancamentos_taxas_petshop_idx on public.lancamentos_taxas (petshop_id);
alter table public.lancamentos_taxas enable row level security;
revoke all on public.lancamentos_taxas from public, anon, authenticated;
grant select on public.lancamentos_taxas to authenticated;
drop policy if exists lancamentos_taxas_ler on public.lancamentos_taxas;
create policy lancamentos_taxas_ler on public.lancamentos_taxas for select to authenticated
  using (petshop_id in (select public.petshops_do_financeiro()));

-- refaz a taxa de um lançamento (com a regra guardada; sem ela, a da loja agora). Sem cartão nem Pix e sem linha: nada.
create or replace function public.taxa_do_lancamento(p_id uuid, p_parcelas int default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  l public.lancamentos;
  t public.lancamentos_taxas;
  v_regra jsonb;
  v_parc int;
  v_conta jsonb;
begin
  select * into l from public.lancamentos x where x.id = p_id;
  if not found then return; end if;
  select * into t from public.lancamentos_taxas x where x.lancamento_id = p_id;
  if not (l.tipo = 'entrada' and l.pago and l.movimento is null) then
    if t.lancamento_id is not null then delete from public.lancamentos_taxas x where x.lancamento_id = p_id; end if;
    return;
  end if;
  if t.lancamento_id is not null then
    v_regra := t.regra;
  else
    select to_jsonb(m) - 'petshop_id' - 'atualizado_em' - 'atualizado_por' into v_regra from public.taxas_maquininha m where m.petshop_id = l.petshop_id;
    if v_regra is null then return; end if;
  end if;
  v_parc := coalesce(p_parcelas, t.parcelas);
  v_conta := public.taxa_calcular(v_regra, l.valor, l.forma, l.pagamentos, v_parc, l.data);
  if t.lancamento_id is null and jsonb_array_length(v_conta -> 'partes') = 0 then return; end if;
  insert into public.lancamentos_taxas as y (lancamento_id, petshop_id, parcelas, taxa, cartao, partes, regra)
    values (l.id, l.petshop_id, v_parc, (v_conta ->> 'taxa')::numeric, (v_conta ->> 'cartao')::numeric, v_conta -> 'partes', v_regra)
  on conflict (lancamento_id) do update set parcelas = excluded.parcelas, taxa = excluded.taxa, cartao = excluded.cartao, partes = excluded.partes,
    atualizado_em = now();
end $$;
revoke execute on function public.taxa_do_lancamento(uuid, int) from public, anon, authenticated;

create or replace function public.lancamento_taxa_maquininha() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.valor is not distinct from old.valor and new.forma is not distinct from old.forma
     and new.pagamentos is not distinct from old.pagamentos and new.pago is not distinct from old.pago and new.data is not distinct from old.data
     and new.tipo is not distinct from old.tipo and new.movimento is not distinct from old.movimento then
    return null;
  end if;
  -- só entrada paga interessa: o resto passa direto (sem ler nada)
  if tg_op = 'INSERT' and not (new.tipo = 'entrada' and new.pago and new.movimento is null) then return null; end if;
  perform public.taxa_do_lancamento(new.id);
  return null;
end $$;
revoke execute on function public.lancamento_taxa_maquininha() from public, anon, authenticated;
drop trigger if exists lancamento_taxa_maquininha on public.lancamentos;
create trigger lancamento_taxa_maquininha after insert or update on public.lancamentos
  for each row execute function public.lancamento_taxa_maquininha();

-- Crédito parcelado: a tela anota em quantas vezes logo depois de gravar (recepção e financeiro). Só entrada paga com
-- crédito, do próprio pet shop, com o caixa aberto (ou sem caixa); quem não cuida do financeiro só nas que lançou há pouco.
-- Devolve quantos lançamentos foram anotados.
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
      and (v_fin or (x.criado_por = (select auth.uid()) and x.criado_em > now() - interval '30 minutes'))
  loop
    perform public.taxa_do_lancamento(l.id, p_parcelas);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.maquininha_parcelas(uuid, uuid[], int) from public, anon;
grant execute on function public.maquininha_parcelas(uuid, uuid[], int) to authenticated;

-- A loja quer saber em quantas vezes foi o crédito? (tem taxa de parcelado). Qualquer pessoa da loja: não diz valor.
create or replace function public.maquininha_pergunta_parcelas(p uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.taxas_maquininha m
    where m.petshop_id = p and p in (select public.meus_petshops())
      and (m.parcelado_pct is not null or m.parcelado_dias is not null or m.parcelas_pct <> '{}'::jsonb)
  )
$$;
revoke execute on function public.maquininha_pergunta_parcelas(uuid) from public, anon;
grant execute on function public.maquininha_pergunta_parcelas(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Taxas do período e o que a maquininha ainda vai pagar (Financeiro e Relatórios)
-- ---------------------------------------------------------------------------------------------------------------------
-- As mesmas entradas do faturamento (entrada, paga, sem gaveta, pela data). a_receber: as partes que caem depois de hoje
-- (de pagamentos dos últimos 130 dias), por dia, já sem a taxa.
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
  ar as (
    select x.cai_em, sum(x.valor - x.taxa) as valor
    from public.lancamentos_taxas t join public.lancamentos l on l.id = t.lancamento_id
    cross join lateral jsonb_to_recordset(t.partes) as x(valor numeric, taxa numeric, cai_em date)
    where t.petshop_id = p and l.petshop_id = p and l.tipo = 'entrada' and l.pago and l.movimento is null
      and l.data >= v_hoje - 130 and x.cai_em > v_hoje
    group by x.cai_em
  )
  select jsonb_build_object(
    'de', p_de, 'ate', p_ate, 'hoje', v_hoje,
    'configurada', exists (select 1 from public.taxas_maquininha m where m.petshop_id = p),
    'taxa', coalesce((select sum(taxa) from tx), 0),
    'cartao', coalesce((select sum(cartao) from tx), 0),
    'lancamentos', (select count(*) from tx where tx.taxa > 0),
    'por_forma', coalesce((select jsonb_agg(jsonb_build_object('forma', pt.forma, 'valor', pt.valor, 'taxa', pt.taxa) order by pt.forma) from pt), '[]'::jsonb),
    'a_receber', coalesce((select jsonb_agg(jsonb_build_object('dia', ar.cai_em, 'valor', ar.valor) order by ar.cai_em) from ar), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;
revoke execute on function public.taxas_do_periodo(uuid, date, date) from public, anon;
grant execute on function public.taxas_do_periodo(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. "Quanto sobrou" com a taxa da maquininha (a definição da 20261200, igual, com duas chaves a mais)
-- ---------------------------------------------------------------------------------------------------------------------
-- taxas_maquininha: a soma das taxas das entradas do período; resultado_depois_taxas = resultado − taxas.
-- "resultado" continua o mesmo do Financeiro (entrou − saiu): a taxa é uma linha à parte.
create or replace function public.lucro_do_periodo(p_petshop uuid, p_de date, p_ate date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fuso text;
  v_opcoes jsonb;
  v_res jsonb;
begin
  if (select auth.uid()) is null or p_petshop is null or not (p_petshop in (select public.meus_petshops())) then
    raise exception 'Sem acesso a este pet shop.' using errcode = '42501';
  end if;
  if not public.cuido_do_financeiro(p_petshop) then
    raise exception 'Quanto sobrou é com quem cuida do financeiro.' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 366 then
    raise exception 'Escolha um período de até um ano.';
  end if;
  select coalesce(s.fuso, 'America/Sao_Paulo'), coalesce(s.opcoes, '{}'::jsonb) into v_fuso, v_opcoes from public.petshops s where s.id = p_petshop;

  with pc as materialized (select * from public.lucro_pecas(p_petshop, p_de, p_ate)),
  com as materialized (select * from public.lucro_comissoes(p_petshop, p_de, p_ate)),
  sv as (
    select coalesce(a.servico_id, b.servico_id) as servico_id, coalesce(a.quantidade, 0) as quantidade, coalesce(a.receita, 0) as receita, coalesce(b.comissao, 0) as comissao
    from (select x.servico_id, coalesce(x.servico_id::text, '-') as k, sum(x.qtd) as quantidade, sum(x.valor) as receita from pc x where x.tipo = 'servico' group by x.servico_id) a
    full join (select y.servico_id, coalesce(y.servico_id::text, '-') as k, sum(y.comissao) as comissao from com y where y.tipo = 'servico' group by y.servico_id) b on b.k = a.k
  ),
  -- produto: custo de cada venda (a peça principal de cada conta)
  pp as (
    select x.produto_id, x.nome, x.qtd, x.valor,
      case when x.qtd > 0 and mv.n > 0 and mv.n = mv.nc then mv.c end as custo_salvo,
      case when x.qtd > 0 and not (mv.n > 0 and mv.n = mv.nc) and pr.custo is not null then round(x.qtd * pr.custo, 2) end as custo_cadastro,
      case when x.qtd > 0 and not (mv.n > 0 and mv.n = mv.nc) and pr.custo is null then x.qtd else 0 end as sem_custo
    from pc x
    left join public.produtos pr on pr.id = x.produto_id and pr.petshop_id = p_petshop
    left join lateral (
      select count(*) as n, count(m.custo_unitario) as nc, sum(round(m.quantidade * m.custo_unitario, 2)) as c
      from public.movimentos_estoque m
      where x.produto_id is not null and m.lancamento_id = x.conta and m.produto_id = x.produto_id and m.tipo = 'saida' and m.motivo = 'Venda'
    ) mv on true
    where x.tipo = 'produto'
  ),
  pd as (
    select coalesce(a.produto_id, b.produto_id) as produto_id, coalesce(a.nome, b.nome) as nome,
      coalesce(a.quantidade, 0) as quantidade, coalesce(a.receita, 0) as receita, coalesce(a.custo_salvo, 0) as custo_salvo,
      coalesce(a.custo_cadastro, 0) as custo_cadastro, coalesce(a.sem_custo, 0) as sem_custo, coalesce(b.comissao, 0) as comissao
    from (
      select x.produto_id, coalesce(x.produto_id::text, 'nome:' || lower(x.nome)) as k, (array_agg(x.nome))[1] as nome, sum(x.qtd) as quantidade, sum(x.valor) as receita,
        sum(coalesce(x.custo_salvo, 0)) as custo_salvo, sum(coalesce(x.custo_cadastro, 0)) as custo_cadastro, sum(x.sem_custo) as sem_custo
      from pp x group by x.produto_id, coalesce(x.produto_id::text, 'nome:' || lower(x.nome))
    ) a
    full join (select y.produto_id, coalesce(y.produto_id::text, 'nome:' || lower(y.nome)) as k, (array_agg(y.nome))[1] as nome, sum(y.comissao) as comissao
      from com y where y.tipo = 'produto' group by y.produto_id, coalesce(y.produto_id::text, 'nome:' || lower(y.nome))) b on b.k = a.k
  ),
  dvp as (
    select (i ->> 'produto_id')::uuid as produto_id, (array_agg(i ->> 'nome'))[1] as nome, sum((i ->> 'qtd')::numeric) as quantidade,
      sum(coalesce((i ->> 'avariados')::numeric, 0)) as avariados, sum((i ->> 'valor')::numeric) as valor,
      sum(round(((i ->> 'qtd')::numeric - coalesce((i ->> 'avariados')::numeric, 0)) * coalesce((i ->> 'custo')::numeric, 0), 2)) as custo_volta,
      sum(case when i ->> 'custo' is null then (i ->> 'qtd')::numeric - coalesce((i ->> 'avariados')::numeric, 0) else 0 end) as sem_custo
    from public.devolucoes dv cross join lateral jsonb_array_elements(dv.itens) i
    where dv.petshop_id = p_petshop and coalesce(dv.saida_id, dv.credito_id) is not null
      and dv.criado_em >= (p_de::timestamp at time zone v_fuso) and dv.criado_em < ((p_ate + 1)::timestamp at time zone v_fuso)
    group by 1
  ),
  dev as (
    select coalesce(sum(l.valor), 0) as v from public.lancamentos l
    where l.petshop_id = p_petshop and l.tipo = 'saida' and l.pago and l.movimento is null and l.categoria in ('Devolução', 'Devolução de sinal')
      and l.data between p_de and p_ate
  ),
  cred as (
    select coalesce(sum(c.valor) filter (where c.valor > 0), 0) as deixado,
      coalesce(-sum(c.valor) filter (where c.valor < 0 and c.lancamento_id is null), 0) as usado_fora
    from public.clientes_creditos c
    where c.petshop_id = p_petshop and c.criado_em >= (p_de::timestamp at time zone v_fuso) and c.criado_em < ((p_ate + 1)::timestamp at time zone v_fuso)
  ),
  sai as (
    select l.categoria, sum(l.valor) as valor from public.lancamentos l
    where l.petshop_id = p_petshop and l.tipo = 'saida' and l.pago and l.movimento is null and l.categoria not in ('Devolução', 'Devolução de sinal')
      and l.data between p_de and p_ate
    group by l.categoria
  ),
  ent as (select coalesce(sum(x.valor), 0) as v from pc x),
  -- taxa da maquininha das entradas do período (guardada no pagamento)
  txm as (
    select coalesce(sum(t.taxa), 0) as v from public.lancamentos_taxas t join public.lancamentos l on l.id = t.lancamento_id
    where t.petshop_id = p_petshop and l.petshop_id = p_petshop and l.tipo = 'entrada' and l.pago and l.movimento is null and l.data between p_de and p_ate
  )
  select jsonb_build_object(
    'de', p_de, 'ate', p_ate,
    'comissao_como_custo', coalesce(v_opcoes -> 'lucro.comissao_custo' = 'true'::jsonb, false),
    'servicos', coalesce((select jsonb_agg(jsonb_build_object(
        'servico_id', s.servico_id, 'nome', coalesce(sv2.nome, 'Sem serviço escolhido'), 'quantidade', s.quantidade, 'receita', s.receita,
        'custo_material_unitario', sv2.custo_material, 'comissao', s.comissao) order by s.receita desc, sv2.nome)
      from sv s left join public.servicos sv2 on sv2.id = s.servico_id and sv2.petshop_id = p_petshop), '[]'::jsonb),
    'produtos', coalesce((select jsonb_agg(jsonb_build_object(
        'produto_id', d.produto_id, 'nome', coalesce(pr.nome, d.nome, 'Produto'), 'unidade', coalesce(pr.unidade, 'un'), 'quantidade', d.quantidade,
        'receita', d.receita, 'custo_salvo', d.custo_salvo, 'custo_cadastro', d.custo_cadastro, 'sem_custo', d.sem_custo, 'comissao', d.comissao)
        order by d.receita desc, coalesce(pr.nome, d.nome))
      from pd d left join public.produtos pr on pr.id = d.produto_id and pr.petshop_id = p_petshop), '[]'::jsonb),
    'devolucoes', coalesce((select jsonb_agg(jsonb_build_object(
        'produto_id', v.produto_id, 'nome', coalesce(pr.nome, v.nome, 'Produto'), 'unidade', coalesce(pr.unidade, 'un'), 'quantidade', v.quantidade,
        'avariados', v.avariados, 'valor', v.valor, 'custo_volta', v.custo_volta, 'sem_custo', v.sem_custo) order by v.valor desc, coalesce(pr.nome, v.nome))
      from dvp v left join public.produtos pr on pr.id = v.produto_id and pr.petshop_id = p_petshop), '[]'::jsonb),
    'extras', jsonb_build_object(
      'receita', (select coalesce(sum(x.valor), 0) from pc x where x.tipo = 'extra'),
      'comissao', (select coalesce(sum(y.comissao), 0) from com y where y.tipo = 'extra')),
    'outros', coalesce((select jsonb_agg(jsonb_build_object('categoria', o.categoria, 'valor', o.valor, 'lancamentos', o.n) order by o.valor desc, o.categoria)
      from (select x.categoria, sum(x.valor) as valor, count(distinct x.lancamento_id) as n from pc x where x.tipo = 'outro' group by x.categoria) o), '[]'::jsonb),
    'entradas', (select v from ent),
    'devolvido', (select v from dev),
    'credito_deixado', (select deixado from cred),
    'credito_usado_fora', (select usado_fora from cred),
    'faturamento', (select v from ent) - (select v from dev) - (select deixado from cred) + (select usado_fora from cred),
    'saidas', coalesce((select jsonb_agg(jsonb_build_object('categoria', s.categoria, 'valor', s.valor) order by s.valor desc, s.categoria) from sai s), '[]'::jsonb),
    'saiu', (select coalesce(sum(s.valor), 0) from sai s),
    'resultado', (select v from ent) - (select v from dev) - (select deixado from cred) + (select usado_fora from cred) - (select coalesce(sum(s.valor), 0) from sai s),
    'comissao_total', (select coalesce(sum(y.comissao), 0) from com y),
    'taxas_maquininha', (select v from txm),
    'resultado_depois_taxas', (select v from ent) - (select v from dev) - (select deixado from cred) + (select usado_fora from cred) - (select coalesce(sum(s.valor), 0) from sai s) - (select v from txm)
  ) into v_res;
  return v_res;
end $$;
revoke execute on function public.lucro_do_periodo(uuid, date, date) from public, anon;
grant execute on function public.lucro_do_periodo(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. Indicadores (Relatórios, Indicadores): os números dos gráficos, por mês, numa ida só
-- ---------------------------------------------------------------------------------------------------------------------
-- Quem vê: área Relatórios. Dinheiro (faturamento, valor médio, taxas, resultado, receita por serviço e produto): só quem
-- cuida do financeiro e vê o financeiro; os outros recebem só as contagens (as chaves de dinheiro vêm null).
-- Cada mês do período (o primeiro e o último cortados nas datas escolhidas) traz:
--   faturamento: a regra de Relatórios e de Quanto sobrou (entradas pagas − devoluções − crédito deixado + crédito usado fora);
--   contas: entradas pagas principais (nem parte de conta nem "cobrar a diferença"); valor_medio = faturamento ÷ contas;
--   saiu e resultado (faturamento − saídas sem devolução, o "Resultado do mês" do Financeiro); taxas e resultado_depois_taxas;
--   atendimentos (concluídos, pelo dia do horário), estadias (encerradas, pelo dia da saída), faltas, cancelados, marcados;
--   clientes atendidos, os de primeira vez (a primeira visita da vida foi naquele mês) e os que voltaram.
-- Do período inteiro: retorno em 60 dias (dos clientes atendidos, quantos tiveram uma visita até 60 dias depois de outra),
-- serviços e produtos mais vendidos (vezes da agenda; receita e quantidade de lucro_pecas, as de Quanto sobrou) e o mapa de
-- dia da semana × hora (tudo o que foi marcado, menos os cancelados). Visita = atendimento concluído ou estadia encerrada.
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
  ent as materialized (
    select l.id, l.data, l.valor, (l.conta_id is null and l.diferenca_de is null) as principal
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
      (select count(*) from ent e where e.principal and e.data between m.de and m.ate) as contas,
      (select coalesce(sum(s.valor), 0) from sai s where s.devolucao and s.data between m.de and m.ate) as devolvido,
      (select coalesce(sum(s.valor), 0) from sai s where not s.devolucao and s.data between m.de and m.ate) as saiu,
      (select coalesce(sum(c.valor) filter (where c.valor > 0), 0) from cred c where c.dia between m.de and m.ate) as deixado,
      (select coalesce(-sum(c.valor) filter (where c.valor < 0 and c.lancamento_id is null), 0) from cred c where c.dia between m.de and m.ate) as usado_fora,
      (select coalesce(sum(t.taxa), 0) from tx t where t.data between m.de and m.ate) as taxas,
      (select count(*) from ag a where a.status = 'concluido' and a.local::date between m.de and m.ate) as atendimentos,
      (select count(*) from ag a where a.status = 'faltou' and a.local::date between m.de and m.ate) as faltas,
      (select count(*) from ag a where a.status = 'cancelado' and a.local::date between m.de and m.ate) as cancelados,
      (select count(*) from ag a where a.local::date between m.de and m.ate) as marcados,
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
        'valor_medio', case when v_din and x.contas > 0 then round((x.entradas - x.devolvido - x.deixado + x.usado_fora) / x.contas, 2) end,
        'saiu', case when v_din then x.saiu end,
        'resultado', case when v_din then x.entradas - x.devolvido - x.deixado + x.usado_fora - x.saiu end,
        'taxas', case when v_din then x.taxas end,
        'resultado_depois_taxas', case when v_din then x.entradas - x.devolvido - x.deixado + x.usado_fora - x.saiu - x.taxas end,
        'atendimentos', x.atendimentos, 'faltas', x.faltas, 'cancelados', x.cancelados, 'marcados', x.marcados,
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
