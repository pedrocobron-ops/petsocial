-- =====================================================================================================================
-- Relatórios: "Quanto sobrou" (lucro por serviço e por produto) e "Por pessoa" (produtividade da equipe)
-- =====================================================================================================================
-- Só acrescenta: coluna nova em servicos e em lancamentos, um gatilho que preenche quem vendeu e funções novas.
-- O aplicativo de antes continua igual com esta migração aplicada (nenhuma função existente muda).
--
-- A conta (as duas funções leem as mesmas "peças"):
--   Cada entrada recebida no período (lancamentos: entrada, paga, sem movimento de gaveta, pela data) é repartida em peças
--   que somam exatamente o valor dela (o que entrou de verdade, desconto incluído):
--     · conta de atendimento: a parte de serviço é dividida entre os serviços do horário por partes_por_servico (a mesma
--       divisão da comissão); os produtos, linha por linha; os extras ficam como "extras da conta";
--     · parte de uma conta recebida em partes: reparte pelos itens da conta (a mesma proporção);
--     · "Cobrar a diferença": vai inteira para os serviços daquele atendimento (como na comissão);
--     · venda de balcão: produtos linha por linha; serviço com servico_id vira serviço;
--     · o resto (pacotes, creche, hotel, mensalidade, multa, outras entradas) fica em "outros lançamentos", por categoria.
--   A soma de todas as peças é o "Entrou" do Financeiro, ao centavo. Depois vêm os mesmos ajustes do faturamento
--   (devoluções, crédito deixado e usado) e as saídas: o resultado é o "Resultado do mês" do Financeiro.
--   Quantidade conta uma vez, na entrada principal (a conta quitada), nunca nas partes nem na diferença.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Custo do material de cada serviço (opcional; em branco = não informado). Só o dono grava e lê.
-- ---------------------------------------------------------------------------------------------------------------------
-- servicos tem permissão por coluna (20261157): como os preços, a coluna nova não tem select para a equipe;
-- o dono lê por servicos_custos. Gravar segue a regra da tabela (servicos_editar: só o dono).
alter table public.servicos add column if not exists custo_material numeric(10, 2)
  check (custo_material is null or (custo_material >= 0 and custo_material <= 99999));
grant insert (custo_material), update (custo_material) on public.servicos to authenticated;

create or replace function public.servicos_custos(p uuid)
returns table (id uuid, custo_material numeric)
language sql stable security definer set search_path = '' as $$
  select s.id, s.custo_material from public.servicos s
  where s.petshop_id = p and (select public.sou_dono(p))
$$;
revoke execute on function public.servicos_custos(uuid) from public, anon;
grant execute on function public.servicos_custos(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Quem vendeu: lancamentos.vendido_por (a pessoa da equipe logada quando a entrada foi lançada)
-- ---------------------------------------------------------------------------------------------------------------------
-- As vendas de antes não guardavam quem vendeu (criado_por é quem lançou, e nem sempre existe). A partir desta migração,
-- toda entrada nova guarda a pessoa da equipe de quem lançou; quem manda outra pessoa da mesma loja fica com ela.
alter table public.lancamentos add column if not exists vendido_por uuid references public.profissionais (id) on delete set null;
create index if not exists lancamentos_vendido_por_idx on public.lancamentos (vendido_por) where vendido_por is not null;

create or replace function public.lancamento_vendido_por()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo <> 'entrada' or new.movimento is not null then
    new.vendido_por := null;
    return new;
  end if;
  if new.vendido_por is not null and not exists (
    select 1 from public.profissionais x where x.id = new.vendido_por and x.petshop_id = new.petshop_id) then
    new.vendido_por := null;
  end if;
  if new.vendido_por is null and (select auth.uid()) is not null then
    select x.id into new.vendido_por from public.profissionais x
    where x.petshop_id = new.petshop_id and x.user_id = (select auth.uid()) and x.ativo limit 1;
  end if;
  return new;
end $$;
revoke execute on function public.lancamento_vendido_por() from public, anon, authenticated;
drop trigger if exists lancamento_vendido_por on public.lancamentos;
create trigger lancamento_vendido_por before insert on public.lancamentos
  for each row execute function public.lancamento_vendido_por();

-- desde quando o banco guarda quem vendeu (o relatório diz "desde <data>" para períodos mais antigos)
insert into public.config_interna (chave, valor) values ('vendido_por_desde', to_char((now() at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD'))
  on conflict (chave) do nothing;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2b. Velocidade: a comissão procura a "Cobrar a diferença" pela marca no item (itens @> [{diferenca_de}]) em cada atendimento.
-- Sem índice, cada atendimento lia todas as entradas soltas da loja (1,4 s num mês cheio; com o índice, 0,08 s).
-- ---------------------------------------------------------------------------------------------------------------------
create index if not exists lancamentos_itens_diferenca_idx on public.lancamentos using gin (itens jsonb_path_ops)
  where tipo = 'entrada' and agendamento_id is null and diferenca_de is null;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Repartir uma parte da conta entre as linhas de um tipo (serviço ou produto), na proporção de cada linha
-- ---------------------------------------------------------------------------------------------------------------------
-- Linhas do mesmo serviço (servico_id) ou do mesmo produto (produto_id; sem ele, pelo nome) juntam. Cada parte é
-- arredondada em centavos e o que sobra vai para a maior (empate: a primeira). A soma é sempre p_total.
create or replace function public.lucro_repartir(p_total numeric, p_itens jsonb, p_tipo text)
returns table (servico_id uuid, produto_id uuid, nome text, qtd numeric, valor numeric)
language plpgsql immutable set search_path = '' as $$
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
end $$;
revoke execute on function public.lucro_repartir(numeric, jsonb, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. As peças do período (interna): cada entrada recebida repartida em serviço, produto, extra e outro
-- ---------------------------------------------------------------------------------------------------------------------
-- tipo: servico | produto | extra | outro. `qtd` só na entrada principal (a conta quitada ou a venda), zero nas partes.
-- `conta`: o lançamento que guarda os itens (a própria entrada, ou a conta de que ela é parte); o estoque liga a saída nele.
-- `profissional_id`: quem atendeu o horário; `vendido_por`: quem lançou a conta.
create or replace function public.lucro_pecas(p uuid, p_de date, p_ate date)
returns table (lancamento_id uuid, conta uuid, principal boolean, agendamento_id uuid, profissional_id uuid, vendido_por uuid,
  tipo text, servico_id uuid, produto_id uuid, nome text, categoria text, qtd numeric, valor numeric)
language sql stable security definer set search_path = '' as $$
  with e as (
    select l.id, l.valor, l.diferenca_de, (l.conta_id is null and l.diferenca_de is null) as principal,
      coalesce(pa.id, l.id) as conta,
      case when l.diferenca_de is not null then dc.itens when pa.id is not null then pa.itens else l.itens end as itens,
      case when l.diferenca_de is not null then l.diferenca_de when pa.id is not null then pa.agendamento_id else l.agendamento_id end as ag,
      case when pa.id is not null then pa.vendido_por else l.vendido_por end as vend,
      case when pa.id is not null then pa.categoria else l.categoria end as cat
    from public.lancamentos l
    left join public.lancamentos pa on pa.id = l.conta_id
    left join lateral (
      select d.itens from public.lancamentos d where d.agendamento_id = l.diferenca_de and d.tipo = 'entrada' limit 1
    ) dc on l.diferenca_de is not null
    where l.petshop_id = p and l.tipo = 'entrada' and l.pago and l.movimento is null and l.data between p_de and p_ate
  ), pt as (
    select e.*, a.profissional_id as prof, (a.id is not null) as tem_ag, (x.servico is not null) as com_itens,
      case when e.diferenca_de is not null then e.valor
           when x.servico is null then case when a.id is not null then e.valor else 0 end
           else x.servico end as v_serv,
      case when e.diferenca_de is not null or x.servico is null then 0 else x.produto end as v_prod,
      case when e.diferenca_de is not null or x.servico is null then 0 else x.extra end as v_ext,
      case when e.diferenca_de is null and x.servico is null and a.id is null then e.valor else 0 end as v_outro
    from e
    left join public.agendamentos a on a.id = e.ag and a.petshop_id = p
    left join lateral public.partes_do_lancamento(e.valor, e.itens) x on true
  )
  -- serviço de um atendimento: a mesma divisão da comissão
  select pt.id, pt.conta, pt.principal, pt.ag, pt.prof, pt.vend, 'servico', r.servico_id, null::uuid, null::text, pt.cat, 0::numeric, r.valor
  from pt cross join lateral public.partes_por_servico(pt.ag, pt.v_serv, pt.itens, pt.com_itens) r
  where pt.tem_ag and pt.v_serv <> 0
  union all
  -- serviço sem atendimento (venda de balcão, check-out): linha com servico_id vira serviço; sem ele, fica em outros
  select pt.id, pt.conta, pt.principal, null, null, pt.vend, case when r.servico_id is null then 'outro' else 'servico' end, r.servico_id, null, null, pt.cat,
    case when pt.principal and r.servico_id is not null then r.qtd else 0 end, r.valor
  from pt cross join lateral public.lucro_repartir(pt.v_serv, pt.itens, 'servico') r
  where not pt.tem_ag and pt.v_serv <> 0
  union all
  -- produtos, linha por linha
  select pt.id, pt.conta, pt.principal, case when pt.tem_ag then pt.ag end, pt.prof, pt.vend, 'produto', null, r.produto_id, r.nome, pt.cat,
    case when pt.principal then r.qtd else 0 end, r.valor
  from pt cross join lateral public.lucro_repartir(pt.v_prod, pt.itens, 'produto') r
  where pt.v_prod <> 0
  union all
  -- extras: da conta do atendimento; fora de atendimento, ficam em outros
  select pt.id, pt.conta, pt.principal, case when pt.tem_ag then pt.ag end, pt.prof, pt.vend, case when pt.tem_ag then 'extra' else 'outro' end,
    null, null, null, pt.cat, 0, pt.v_ext
  from pt where pt.v_ext <> 0
  union all
  select pt.id, pt.conta, pt.principal, null, null, pt.vend, 'outro', null, null, null, pt.cat, 0, pt.v_outro
  from pt where pt.v_outro <> 0
  union all
  -- quantidade: cada serviço do horário conta uma vez, na conta principal (mesmo o que saiu do pacote)
  select pt.id, pt.conta, true, pt.ag, pt.prof, pt.vend, 'servico', s.servico_id, null, null, pt.cat, 1, 0
  from pt cross join lateral (
    select a.servico_id from public.agendamentos a where a.id = pt.ag
    union all
    select es.servico_id from public.agendamento_servicos es where es.agendamento_id = pt.ag
  ) s
  where pt.principal and pt.tem_ag
$$;
revoke execute on function public.lucro_pecas(uuid, date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. A comissão do período em linhas do relatório (interna): por serviço, extras e produtos
-- ---------------------------------------------------------------------------------------------------------------------
-- Vem de comissao_linhas_calc (a conta de Relatórios e de "Minha comissão"). A comissão sobre produtos é dividida entre
-- os produtos da conta do atendimento, na proporção de cada linha. Cada linha é arredondada e o centavo que sobra vai para a
-- maior, para a soma ser exatamente o total de comissao_calcular (arredondado por pessoa, como é pago).
create or replace function public.lucro_comissoes(p uuid, p_de date, p_ate date)
returns table (tipo text, servico_id uuid, produto_id uuid, nome text, comissao numeric)
language sql stable security definer set search_path = '' as $$
  with todas as materialized (select * from public.comissao_linhas_calc(p, p_de, p_ate)),
  c as (select * from todas where tipo <> 'nada' and valor <> 0),
  exatas as (
    select case when c.tipo in ('servico', 'pacote') then 'servico' else 'extra' end as tipo, c.servico_id, null::uuid as produto_id, null::text as nome, c.valor
    from c where c.tipo <> 'produto'
    union all
    select 'produto', null, r.produto_id, r.nome, c.valor * r.valor / nullif(sum(r.valor) over (partition by c.agendamento_id, c.profissional_id), 0)
    from c
    join public.lancamentos l on l.agendamento_id = c.agendamento_id and l.tipo = 'entrada'
    cross join lateral public.lucro_repartir(1000000, l.itens, 'produto') r
    where c.tipo = 'produto'
  ), linhas as (
    select x.tipo, x.servico_id, x.produto_id, (array_agg(x.nome))[1] as nome, sum(x.valor) as exata
    from exatas x group by x.tipo, x.servico_id, x.produto_id, case when x.produto_id is null then lower(x.nome) end
  ), total as (
    -- a mesma conta de comissao_calcular (que soma estas linhas): serviços e produtos arredondados por pessoa
    select coalesce(sum(t.v), 0) as v from (
      select round(coalesce(sum(x.valor) filter (where x.tipo <> 'produto'), 0), 2) + round(coalesce(sum(x.valor) filter (where x.tipo = 'produto'), 0), 2) as v
      from todas x group by x.profissional_id
    ) t
  ), redondas as (
    select l.*, round(l.exata, 2) as r, row_number() over (order by l.exata desc, l.tipo, l.servico_id, l.produto_id, l.nome) as n
    from linhas l
  )
  select r.tipo, r.servico_id, r.produto_id, r.nome,
    r.r + case when r.n = 1 then (select v from total) - (select coalesce(sum(r2.r), 0) from redondas r2) else 0 end
  from redondas r
$$;
revoke execute on function public.lucro_comissoes(uuid, date, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. "Quanto sobrou": um pedido só para o relatório inteiro. Só o dono e quem cuida do financeiro.
-- ---------------------------------------------------------------------------------------------------------------------
-- {de, ate, comissao_como_custo, servicos:[{servico_id, nome, quantidade, receita, custo_material_unitario, comissao}],
--  produtos:[{produto_id, nome, unidade, quantidade, receita, custo_salvo, custo_cadastro, sem_custo, comissao}],
--  extras:{receita, comissao}, outros:[{categoria, valor, lancamentos}],
--  entradas, devolvido, credito_deixado, credito_usado_fora, faturamento, saidas:[{categoria, valor}], saiu, resultado, comissao_total}
-- Produto: custo_salvo = o custo guardado na saída do estoque daquela venda; sem ele, custo_cadastro = produtos.custo de hoje
-- × quantidade; sem os dois, sem_custo conta as unidades. Nada é estimado além disso.
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
  ent as (select coalesce(sum(x.valor), 0) as v from pc x)
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
    'comissao_total', (select coalesce(sum(y.comissao), 0) from com y)
  ) into v_res;
  return v_res;
end $$;
revoke execute on function public.lucro_do_periodo(uuid, date, date) from public, anon;
grant execute on function public.lucro_do_periodo(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 7. "Por pessoa": produtividade da equipe no período, um pedido só
-- ---------------------------------------------------------------------------------------------------------------------
-- {de, ate, so_eu, vendido_por_desde, pessoas:[{profissional_id, nome, cor, ativo, atendimentos, contas, vendas, vendas_valor,
--   servicos_valor, receita, comissao}], sem_pessoa:{servicos_valor, vendas, vendas_valor, receita}}
-- Atendimentos: horários concluídos da pessoa no período (a mesma contagem da comissão). Serviços e extras de uma conta de
-- atendimento vão para quem atendeu; produto vendido na conta do atendimento também (como a comissão sobre produtos);
-- venda de balcão, para quem lançou (vendido_por, guardado desde vendido_por_desde). `contas`: entradas principais
-- (contas quitadas e vendas) da pessoa. A soma das pessoas com sem_pessoa é a receita das linhas de "Quanto sobrou".
-- Quem não cuida do financeiro recebe só a própria linha (como "Minha comissão"), seja qual for o período.
create or replace function public.equipe_do_periodo(p_petshop uuid, p_de date, p_ate date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fin boolean;
  v_eu uuid;
  v_fuso text;
  v_res jsonb;
begin
  if (select auth.uid()) is null or p_petshop is null or not (p_petshop in (select public.meus_petshops())) then
    raise exception 'Sem acesso a este pet shop.' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 366 then
    raise exception 'Escolha um período de até um ano.';
  end if;
  v_fin := public.cuido_do_financeiro(p_petshop);
  select x.id into v_eu from public.profissionais x where x.petshop_id = p_petshop and x.user_id = (select auth.uid()) and x.ativo limit 1;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p_petshop;

  with pc as (
    select x.*, case when x.tipo = 'produto' and x.profissional_id is null then x.vendido_por else x.profissional_id end as quem
    from public.lucro_pecas(p_petshop, p_de, p_ate) x where x.tipo <> 'outro'
  ),
  por as (
    select x.quem,
      sum(x.valor) filter (where x.tipo in ('servico', 'extra')) as servicos_valor,
      sum(x.valor) filter (where x.tipo = 'produto') as vendas_valor,
      count(distinct x.lancamento_id) filter (where x.tipo = 'produto' and x.qtd > 0) as vendas,
      count(distinct x.lancamento_id) filter (where x.principal) as contas,
      sum(x.valor) as receita
    from pc x group by x.quem
  ),
  ags as (
    select a.profissional_id, count(*) as n from public.agendamentos a
    where a.petshop_id = p_petshop and a.status = 'concluido' and a.profissional_id is not null
      and a.inicio >= (p_de::timestamp at time zone v_fuso) and a.inicio < ((p_ate + 1)::timestamp at time zone v_fuso)
    group by a.profissional_id
  ),
  com as (select * from public.comissao_calcular(p_petshop, p_de, p_ate, case when v_fin then null else v_eu end))
  select jsonb_build_object(
    'de', p_de, 'ate', p_ate, 'so_eu', not v_fin,
    'vendido_por_desde', (select c.valor from public.config_interna c where c.chave = 'vendido_por_desde'),
    'pessoas', coalesce((select jsonb_agg(jsonb_build_object(
        'profissional_id', pf.id, 'nome', pf.nome, 'cor', pf.cor, 'ativo', pf.ativo,
        'atendimentos', coalesce(g.n, 0), 'contas', coalesce(o.contas, 0), 'vendas', coalesce(o.vendas, 0), 'vendas_valor', coalesce(o.vendas_valor, 0),
        'servicos_valor', coalesce(o.servicos_valor, 0), 'receita', coalesce(o.receita, 0), 'comissao', coalesce(c.comissao, 0))
        order by coalesce(o.receita, 0) desc, coalesce(g.n, 0) desc, pf.nome)
      from public.profissionais pf
      left join por o on o.quem = pf.id
      left join ags g on g.profissional_id = pf.id
      left join com c on c.profissional_id = pf.id
      where pf.petshop_id = p_petshop
        and (v_fin or pf.id = v_eu)
        and (pf.id = v_eu or coalesce(o.receita, 0) <> 0 or coalesce(g.n, 0) > 0 or coalesce(c.comissao, 0) <> 0 or (pf.ativo and pf.atende))), '[]'::jsonb),
    'sem_pessoa', case when v_fin then (select jsonb_build_object('servicos_valor', coalesce(o.servicos_valor, 0), 'vendas', coalesce(o.vendas, 0),
        'vendas_valor', coalesce(o.vendas_valor, 0), 'receita', coalesce(o.receita, 0)) from (select 1) um left join por o on o.quem is null) end
  ) into v_res;
  if v_eu is null and not v_fin then
    return jsonb_build_object('de', p_de, 'ate', p_ate, 'so_eu', true, 'pessoas', '[]'::jsonb);
  end if;
  return v_res;
end $$;
revoke execute on function public.equipe_do_periodo(uuid, date, date) from public, anon;
grant execute on function public.equipe_do_periodo(uuid, date, date) to authenticated;
