-- =====================================================================================================================
-- Loja e estoque: "Ver custo e margem", entrada com despesa numa gravação só, orçamento com serviço a marcar depois,
-- contas fixas do período em "Quanto sobrou"
-- =====================================================================================================================
-- Achados da testadora Camila (loja + banho e tosa). Só acrescenta: funções trocadas mantêm a assinatura e são copiadas da
-- última definição (arquivo indicado em cada uma), mudadas só no que está descrito. O aplicativo de antes continua igual com
-- esta migração aplicada (só a equipe com Estoque e sem dinheiro deixa de receber o custo, que é o conserto).
--
-- 1. Custo e margem com chave própria. Antes, quem tinha a área Estoque recebia o custo de cada produto, o custo das compras,
--    o custo dos lotes e a diferença da contagem a preço de custo. Agora isso é de quem "vê o custo" (vejo_custo): o dono, quem
--    cuida do financeiro (Financeiro ou Relatórios), o gerente sem áreas marcadas, e quem tem a chave "custo" ligada em Equipe
--    (acessos contém 'custo'; desligada por padrão). A chave não liga ve_financeiro: ela só mostra o custo dos produtos.
--    Trocadas (só a conferência de área): custos_dos_produtos, custos_dos_movimentos (20261126), custos_dos_movimentos_do_petshop
--    (20261133), produtos_reservado, custos_das_compras (20261140), produto_lotes, estoque_vencendo, contagem_ler,
--    contagens_lista, contagem_ajustar (20261201). Em estoque_vencendo e na contagem o valor a preço de custo era de quem vê o
--    financeiro (vejo_financeiro, que inclui quem só opera o caixa); agora é de quem vê o custo.
--    profissionais_acessos_check (20261117) aceita 'custo'. Gatilho novo produto_custo_guardar: gravar o custo vazio direto
--    (a ficha de antes, por quem não vê o custo) não apaga o custo do produto.
--    devolucoes (20261200): os itens guardam o custo unitário; a leitura direta passa a ser só de quem cuida do financeiro
--    (o aplicativo só lê com Financeiro ou Relatórios; venda_devolver é security definer e não muda).
-- 2. estoque_entrada(p, chave, movimento, despesa): a entrada no estoque e a despesa da compra (paga, ou a pagar com
--    vencimento) na mesma transação: as duas entram, ou nenhuma. Com a mesma chave de novo devolve o que já fez.
-- 3. orcamentos.valor_vendido: quanto entrou na venda do orçamento (o valor do lançamento), gravado por orcamento_marcar
--    (20261200, que ganha só essa linha). Orçamento com serviço que virou venda sem o horário continua aceitando o horário
--    depois (orcamento_marcar já completava a ligação que faltava). Os convertidos antigos ganham o valor do lançamento.
-- 4. contas_fixas_situacao(p, de, até): cada conta fixa em cada mês do período, com o que aconteceu de verdade: paga,
--    a pagar, ainda vai entrar em A pagar (e quando), excluída, pausada, ou não existe porque a conta começou depois do
--    vencimento daquele mês. Para "Quanto sobrou" mostrar o que ainda falta pagar e para o Mozart não deduzir nada.
-- =====================================================================================================================

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Quem vê o custo
-- ---------------------------------------------------------------------------------------------------------------------
-- a chave nova "custo" entra na lista das áreas aceitas (20261117)
alter table public.profissionais drop constraint if exists profissionais_acessos_check;
alter table public.profissionais add constraint profissionais_acessos_check
  check (acessos is null or acessos <@ array['agenda', 'clientes', 'creche_hotel', 'pacotes', 'caixa', 'financeiro', 'relatorios', 'estoque', 'custo']::text[]);

create or replace function public.vejo_custo(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.tenho_area(p, array['custo', 'financeiro', 'relatorios'])
$$;
revoke execute on function public.vejo_custo(uuid) from public, anon;
grant execute on function public.vejo_custo(uuid) to authenticated;

-- 20261126 (custos_dos_produtos, custos_dos_movimentos)
create or replace function public.custos_dos_produtos(p uuid) returns table (id uuid, custo numeric)
language sql stable security definer set search_path = '' as $$
  select x.id, x.custo from public.produtos x
  where x.petshop_id = p and (select public.vejo_custo(p))
$$;
create or replace function public.custos_dos_movimentos(p_produto uuid) returns table (id uuid, custo_unitario numeric)
language sql stable security definer set search_path = '' as $$
  select m.id, m.custo_unitario from public.movimentos_estoque m
  where m.produto_id = p_produto and (select public.vejo_custo(m.petshop_id))
$$;
-- 20261133
create or replace function public.custos_dos_movimentos_do_petshop(p uuid) returns table (id uuid, custo_unitario numeric)
language sql stable security definer set search_path = '' as $$
  select m.id, m.custo_unitario from public.movimentos_estoque m
  where m.petshop_id = p and (select public.vejo_custo(p))
$$;
-- 20261140
create or replace function public.produtos_reservado(p uuid) returns table (id uuid, custo numeric, ultimo_custo numeric)
language sql stable security definer set search_path = '' as $$
  select x.id, x.custo, x.ultimo_custo from public.produtos x
  where x.petshop_id = p and (select public.vejo_custo(p))
$$;
create or replace function public.custos_das_compras(p uuid, p_fornecedor uuid) returns table (id uuid, custo_unitario numeric)
language sql stable security definer set search_path = '' as $$
  select m.id, m.custo_unitario from public.movimentos_estoque m
  where m.petshop_id = p and m.fornecedor_id = p_fornecedor and m.tipo = 'entrada'
    and (select public.vejo_custo(p))
$$;

-- 20261201: lotes de um produto (o custo do lote só para quem vê o custo)
create or replace function public.produto_lotes(p uuid, p_produto uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'lote', l.lote, 'validade', l.validade, 'quantidade', l.quantidade,
      'custo_unitario', case when public.vejo_custo(p) then l.custo_unitario end)
    order by l.validade nulls last, l.criado_em, l.id), '[]'::jsonb)
  from public.produtos_lotes l
  where l.petshop_id = p and l.produto_id = p_produto and l.quantidade > 0 and p in (select public.meus_petshops())
$$;

-- 20261201: vencendo (valor a preço de custo só para quem vê o custo)
create or replace function public.estoque_vencendo(p uuid, p_dias integer default 60) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_hoje date;
  v_valor boolean;
begin
  if (select auth.uid()) is null or p is null or not (p in (select public.meus_petshops())) then
    raise exception 'Sem acesso a este pet shop.' using errcode = '42501';
  end if;
  if not public.tenho_area(p, array['estoque', 'financeiro', 'relatorios']) then
    raise exception 'A validade dos produtos é com quem cuida do estoque.' using errcode = '42501';
  end if;
  v_hoje := (now() at time zone coalesce((select s.fuso from public.petshops s where s.id = p), 'America/Sao_Paulo'))::date;
  v_valor := public.vejo_custo(p);
  return jsonb_build_object('hoje', v_hoje, 'com_valor', v_valor, 'lotes', coalesce((
    select jsonb_agg(jsonb_build_object(
      'lote_id', l.id, 'produto_id', pr.id, 'nome', pr.nome, 'unidade', pr.unidade, 'categoria', pr.categoria, 'lote', l.lote, 'validade', l.validade,
      'quantidade', l.quantidade, 'dias', l.validade - v_hoje,
      'valor', case when v_valor and coalesce(l.custo_unitario, pr.custo) is not null then round(l.quantidade * coalesce(l.custo_unitario, pr.custo), 2) end
    ) order by l.validade, pr.nome, l.id)
    from public.produtos_lotes l join public.produtos pr on pr.id = l.produto_id
    where l.petshop_id = p and pr.ativo and l.quantidade > 0 and l.validade is not null
      and l.validade <= v_hoje + greatest(0, least(coalesce(p_dias, 60), 120))), '[]'::jsonb));
end $$;

-- 20261201: contagem (custo e valor da diferença só para quem vê o custo)
create or replace function public.contagem_ler(p_contagem uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.contagens;
  v_valor boolean;
begin
  select * into c from public.contagens where id = p_contagem;
  if c.id is null or not (c.petshop_id in (select public.meus_petshops())) then raise exception 'Contagem não encontrada.'; end if;
  perform public.contagem_pode(c.petshop_id);
  v_valor := public.vejo_custo(c.petshop_id);
  return jsonb_build_object(
    'id', c.id, 'nome', c.nome, 'status', c.status, 'categoria', c.categoria, 'fornecedor_id', c.fornecedor_id,
    'criado_em', c.criado_em, 'criado_por_nome', c.criado_por_nome, 'atualizado_em', c.atualizado_em,
    'concluida_em', c.concluida_em, 'concluida_por_nome', c.concluida_por_nome, 'ajustados', c.ajustados,
    'com_valor', v_valor, 'diferenca_valor', case when v_valor then c.diferenca_valor end,
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'produto_id', pr.id, 'nome', pr.nome, 'unidade', pr.unidade, 'categoria', pr.categoria, 'codigo_barras', pr.codigo_barras,
        'saldo', pr.estoque, 'contado', i.contado, 'esperado', i.esperado, 'contado_em', i.contado_em,
        'contado_por_nome', (select e.nome from public.profissionais e where e.petshop_id = c.petshop_id and e.user_id = i.contado_por limit 1),
        'diferenca', case when c.status = 'concluida' then i.ajustado_para - i.ajustado_de when i.contado is not null then i.contado - i.esperado end,
        'custo', case when v_valor then coalesce(i.custo, pr.custo) end,
        'valor', case when v_valor and coalesce(i.custo, pr.custo) is not null and i.contado is not null then
          round((case when c.status = 'concluida' then i.ajustado_para - i.ajustado_de else i.contado - i.esperado end) * coalesce(i.custo, pr.custo), 2) end,
        'ajustado_de', i.ajustado_de, 'ajustado_para', i.ajustado_para
      ) order by pr.nome, pr.id)
      from public.contagens_itens i join public.produtos pr on pr.id = i.produto_id where i.contagem_id = c.id), '[]'::jsonb));
end $$;

create or replace function public.contagens_lista(p uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_valor boolean;
begin
  if p is null or not (p in (select public.meus_petshops())) then raise exception 'Sem acesso a este pet shop.' using errcode = '42501'; end if;
  perform public.contagem_pode(p);
  v_valor := public.vejo_custo(p);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'nome', c.nome, 'status', c.status, 'criado_em', c.criado_em, 'criado_por_nome', c.criado_por_nome,
      'atualizado_em', c.atualizado_em, 'concluida_em', c.concluida_em, 'concluida_por_nome', c.concluida_por_nome,
      'ajustados', c.ajustados, 'diferenca_valor', case when v_valor then c.diferenca_valor end,
      'itens', (select count(*) from public.contagens_itens i where i.contagem_id = c.id),
      'contados', (select count(*) from public.contagens_itens i where i.contagem_id = c.id and i.contado is not null)
    ) order by c.criado_em desc)
    from (select * from public.contagens x where x.petshop_id = p order by x.criado_em desc limit 100) c), '[]'::jsonb);
end $$;

create or replace function public.contagem_ajustar(p_contagem uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.contagens;
  i record;
  v_novo numeric;
  v_mov uuid;
  n integer := 0;
  v_total numeric := 0;
begin
  select * into c from public.contagens where id = p_contagem for update;
  if c.id is null or not (c.petshop_id in (select public.meus_petshops())) then raise exception 'Contagem não encontrada.'; end if;
  perform public.contagem_pode(c.petshop_id);
  if not public.acesso_liberado(c.petshop_id) then raise exception 'Conta só para consulta.' using errcode = '42501'; end if;
  if c.status = 'concluida' then
    return jsonb_build_object('ajustados', c.ajustados, 'repetido', true,
      'diferenca_valor', case when public.vejo_custo(c.petshop_id) then c.diferenca_valor end);
  end if;
  if c.status = 'cancelada' then raise exception 'Esta contagem foi cancelada.' using hint = 'maestro:contagem_fechada'; end if;
  if not exists (select 1 from public.contagens_itens x where x.contagem_id = c.id and x.contado is not null) then
    raise exception 'Nenhum produto foi contado ainda.';
  end if;
  for i in
    select x.produto_id, x.contado, x.esperado, pr.estoque, pr.custo
    from public.contagens_itens x join public.produtos pr on pr.id = x.produto_id
    where x.contagem_id = c.id and x.contado is not null
    order by x.produto_id
    for update of pr
  loop
    v_novo := greatest(0, i.estoque + (i.contado - i.esperado));
    v_mov := null;
    if v_novo <> i.estoque then
      insert into public.movimentos_estoque (petshop_id, produto_id, tipo, quantidade, motivo, criado_por)
      values (c.petshop_id, i.produto_id, 'ajuste', v_novo, 'Contagem', (select auth.uid()))
      returning id into v_mov;
      n := n + 1;
      if i.custo is not null then v_total := v_total + round((v_novo - i.estoque) * i.custo, 2); end if;
    end if;
    update public.contagens_itens set custo = i.custo, ajustado_de = i.estoque, ajustado_para = v_novo, movimento_id = v_mov
      where contagem_id = c.id and produto_id = i.produto_id;
  end loop;
  update public.contagens set status = 'concluida', concluida_em = now(), concluida_por = (select auth.uid()),
    concluida_por_nome = public.nome_na_equipe(c.petshop_id), ajustados = n, diferenca_valor = v_total, atualizado_em = now()
    where id = c.id;
  return jsonb_build_object('ajustados', n, 'repetido', false, 'diferenca_valor', case when public.vejo_custo(c.petshop_id) then v_total end);
end $$;

-- Quem não vê o custo recebe o custo vazio. A ficha do produto do aplicativo de antes salvava o custo que leu: vazio apagaria
-- o custo do produto. Gravado direto (não por um gatilho de movimento), por quem não vê o custo, "custo vazio" não apaga.
create or replace function public.produto_custo_guardar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.custo is null and old.custo is not null and new.tipo = 'produto' and pg_trigger_depth() = 1 and (select auth.uid()) is not null
     and not public.vejo_custo(new.petshop_id) then
    new.custo := old.custo;
  end if;
  return new;
end $$;
revoke execute on function public.produto_custo_guardar() from public, anon, authenticated;
drop trigger if exists produto_custo_guardar on public.produtos;
create trigger produto_custo_guardar before update of custo on public.produtos
  for each row execute function public.produto_custo_guardar();

-- 20261200: devoluções (com o custo de cada item) só para quem cuida do financeiro
drop policy if exists devolucoes_ler on public.devolucoes;
create policy devolucoes_ler on public.devolucoes for select to authenticated
  using ((select public.tenho_area(devolucoes.petshop_id, array['financeiro', 'relatorios'])));

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Entrada no estoque com a despesa da compra, numa gravação só
-- ---------------------------------------------------------------------------------------------------------------------
-- p_movimento: {produto_id, quantidade, custo_unitario?, fornecedor_id?, lote?, validade?, motivo?}
-- p_despesa (opcional): {valor, descricao?, categoria?, pago (padrão true), forma (quando pago), vencimento (quando a pagar)}
-- Roda com o login de quem chama: valem as regras de sempre (quem dá entrada no estoque; quem lança dinheiro; caixa;
-- conta a pagar só para quem cuida do financeiro). Se uma das duas é recusada, nenhuma fica gravada.
-- A entrada fica com a chave "<chave>:entrada" e a despesa com "<chave>" (as mesmas da tela de antes).
create or replace function public.estoque_entrada(p_petshop uuid, p_chave text, p_movimento jsonb, p_despesa jsonb default null)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_feito jsonb;
  v_mov uuid;
  v_lanc uuid;
  v_fuso text;
  v_hoje date;
  v_pago boolean;
  v_valor numeric;
  v_forma text;
  v_data date;
  v_caixa uuid;
  v_res jsonb;
begin
  if (select auth.uid()) is null or p_petshop is null or not (p_petshop in (select public.meus_petshops())) then
    raise exception 'Sem acesso a este pet shop.' using errcode = '42501';
  end if;
  if p_chave is null or char_length(p_chave) not between 8 and 100 then raise exception 'Operação sem chave. Atualize a tela e tente de novo.'; end if;
  if jsonb_typeof(p_movimento) is distinct from 'object' or (p_movimento ->> 'produto_id') is null then raise exception 'Diga o produto da entrada.'; end if;
  if coalesce((p_movimento ->> 'quantidade')::numeric, 0) <= 0 then raise exception 'Diga quantas unidades entraram.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_petshop::text || ':lote:' || p_chave, 0));
  v_feito := public.lote_ja_feito(p_petshop, p_chave);
  if v_feito is not null then return v_feito || jsonb_build_object('repetido', true); end if;

  insert into public.movimentos_estoque (petshop_id, produto_id, tipo, quantidade, custo_unitario, motivo, criado_por, fornecedor_id, lote, validade, chave)
  values (p_petshop, (p_movimento ->> 'produto_id')::uuid, 'entrada', (p_movimento ->> 'quantidade')::numeric,
    nullif(p_movimento ->> 'custo_unitario', '')::numeric, coalesce(nullif(btrim(p_movimento ->> 'motivo'), ''), 'Compra'), (select auth.uid()),
    nullif(p_movimento ->> 'fornecedor_id', '')::uuid, left(nullif(btrim(p_movimento ->> 'lote'), ''), 60), nullif(p_movimento ->> 'validade', '')::date,
    p_chave || ':entrada')
  on conflict (petshop_id, chave) do nothing
  returning id into v_mov;
  if v_mov is null then
    select m.id into v_mov from public.movimentos_estoque m where m.petshop_id = p_petshop and m.chave = p_chave || ':entrada';
  end if;

  if jsonb_typeof(p_despesa) = 'object' then
    v_valor := round((p_despesa ->> 'valor')::numeric, 2);
    if v_valor is null or v_valor <= 0 then raise exception 'Confira o valor da compra.'; end if;
    v_pago := coalesce((p_despesa ->> 'pago')::boolean, true);
    v_forma := p_despesa ->> 'forma';
    if v_pago and coalesce(v_forma, '') not in ('dinheiro', 'pix', 'debito', 'credito', 'outro') then
      raise exception 'Escolha como você pagou a compra.' using hint = 'maestro:forma';
    end if;
    select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p_petshop;
    v_hoje := (now() at time zone coalesce(v_fuso, 'America/Sao_Paulo'))::date;
    if v_pago then
      v_data := v_hoje;
      select c.id into v_caixa from public.caixas c where c.petshop_id = p_petshop and c.fechado_em is null limit 1;
    else
      v_data := nullif(p_despesa ->> 'vencimento', '')::date;
      if v_data is null then raise exception 'Escolha o dia de pagar a compra.' using hint = 'maestro:vencimento'; end if;
    end if;
    begin
      insert into public.lancamentos (petshop_id, tipo, valor, forma, categoria, descricao, data, vencimento, pago, caixa_id, origem, criado_por, chave)
      values (p_petshop, 'saida', v_valor, case when v_pago then v_forma end, coalesce(nullif(btrim(p_despesa ->> 'categoria'), ''), 'Produtos e material'),
        left(nullif(btrim(p_despesa ->> 'descricao'), ''), 200), v_data, case when v_pago then null else v_data end, v_pago, v_caixa, 'tela',
        (select auth.uid()), p_chave)
      on conflict (petshop_id, chave) do nothing
      returning id into v_lanc;
    exception when insufficient_privilege then
      raise exception '%', case when v_pago then 'Só quem cuida do caixa ou do financeiro lança a compra como despesa.'
        else 'Só quem cuida do financeiro anota uma compra para pagar depois.' end using errcode = '42501';
    end;
    if v_lanc is null then
      select l.id into v_lanc from public.lancamentos l where l.petshop_id = p_petshop and l.chave = p_chave;
    end if;
  end if;

  v_res := jsonb_build_object('ok', true, 'movimento_id', v_mov, 'lancamento_id', v_lanc);
  perform public.lote_guardar(p_petshop, p_chave, v_res);
  return v_res;
end $$;
revoke execute on function public.estoque_entrada(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.estoque_entrada(uuid, text, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Orçamento: quanto entrou na venda
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.orcamentos add column if not exists valor_vendido numeric(10, 2);

-- 20261200, com valor_vendido = o valor do lançamento da venda
create or replace function public.orcamento_marcar(p_orcamento uuid, p_lancamento uuid default null, p_agendamento uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.orcamentos;
begin
  select * into o from public.orcamentos x where x.id = p_orcamento for update;
  if not found or (select auth.uid()) is null or not public.tenho_area(o.petshop_id, array['caixa', 'financeiro', 'relatorios'])
     or not public.acesso_liberado(o.petshop_id) then
    raise exception 'Orçamento não encontrado. Atualize a tela.' using errcode = '42501';
  end if;
  if p_lancamento is null and p_agendamento is null then raise exception 'Diga a venda ou o horário do orçamento.'; end if;
  if p_lancamento is not null and not exists (select 1 from public.lancamentos l where l.id = p_lancamento and l.petshop_id = o.petshop_id and l.tipo = 'entrada') then
    raise exception 'Venda não encontrada.';
  end if;
  if p_agendamento is not null and not exists (select 1 from public.agendamentos a where a.id = p_agendamento and a.petshop_id = o.petshop_id) then
    raise exception 'Horário não encontrado.';
  end if;
  perform set_config('maestro.orcamento_marcar', o.id::text, true);
  update public.orcamentos x set status = 'convertido', convertido_em = coalesce(x.convertido_em, now()), convertido_por = coalesce(x.convertido_por, (select auth.uid())),
      lancamento_id = coalesce(p_lancamento, x.lancamento_id), agendamento_id = coalesce(p_agendamento, x.agendamento_id),
      valor_vendido = coalesce((select l.valor from public.lancamentos l where l.id = p_lancamento), x.valor_vendido)
    where x.id = o.id
    returning * into o;
  perform set_config('maestro.orcamento_marcar', '', true);
  return jsonb_build_object('id', o.id, 'status', o.status, 'lancamento_id', o.lancamento_id, 'agendamento_id', o.agendamento_id);
end $$;

-- os convertidos de antes: o valor do lançamento (sem o gatilho, que não deixa mexer em convertido)
alter table public.orcamentos disable trigger orcamento_conferir;
update public.orcamentos o set valor_vendido = l.valor
  from public.lancamentos l where l.id = o.lancamento_id and o.valor_vendido is null;
alter table public.orcamentos enable trigger orcamento_conferir;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Contas fixas no período: o que aconteceu com cada uma
-- ---------------------------------------------------------------------------------------------------------------------
-- Uma linha por conta fixa e por mês do período em que ela vence (vencimento entre de e até):
--   situacao 'paga'           (pago_em, valor pago)
--            'a_pagar'        (em A pagar, valor e se é estimado)
--            'vai_entrar'     (ainda não entrou em A pagar: entra_em = vencimento − antecedência; valor da conta fixa)
--            'excluida'       (alguém tirou de A pagar; não volta)
--            'pausada'        (conta fixa pausada e o mês não foi criado)
--            'antes_do_inicio' (o vencimento daquele mês é antes do "começa em": a conta daquele mês não existe)
-- Também as contas de conta fixa apagada (lançamento com competência sem a conta fixa). Só quem cuida do financeiro.
create or replace function public.contas_fixas_situacao(p uuid, p_de date, p_ate date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_res jsonb;
begin
  if (select auth.uid()) is null or p is null or not (p in (select public.meus_petshops())) or not public.cuido_do_financeiro(p) then
    raise exception 'As contas fixas são do dono e de quem cuida do financeiro.' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 372 then raise exception 'Escolha um período de até um ano.'; end if;
  with meses as (
    select c.id as conta_id, c.nome, c.valor as valor_conta, c.valor_varia, c.ativa, c.comeca_em, c.termina_em, c.dia,
           m::date as comp, public.contas_fixas_vencimento(m::date, c.dia) as venc
      from public.contas_fixas c
      cross join generate_series(date_trunc('month', p_de::timestamp), date_trunc('month', p_ate::timestamp), interval '1 month') m
     where c.petshop_id = p
       and mod(mod(extract(month from m)::int - c.mes_inicial, public.contas_fixas_passo(c.frequencia)) + public.contas_fixas_passo(c.frequencia),
               public.contas_fixas_passo(c.frequencia)) = 0
  ), linhas as (
    select x.conta_id, x.nome, x.comp, x.venc, x.comeca_em,
           l.id as lancamento_id, l.pago, l.data as pago_em, coalesce(l.valor, x.valor_conta) as valor,
           coalesce(l.valor_estimado, x.valor_varia) as estimado,
           case when l.id is not null and l.pago then 'paga'
                when l.id is not null then 'a_pagar'
                when exists (select 1 from public.contas_fixas_puladas k where k.conta_fixa_id = x.conta_id and k.competencia = x.comp) then 'excluida'
                when x.venc < x.comeca_em then 'antes_do_inicio'
                when x.termina_em is not null and x.venc > x.termina_em then null
                when not x.ativa then 'pausada'
                else 'vai_entrar' end as situacao
      from meses x
      left join public.lancamentos l on l.petshop_id = p and l.conta_fixa_id = x.conta_id and l.competencia = x.comp
     where x.venc between p_de and p_ate
    union all
    select null, coalesce(l.descricao, 'Conta fixa'), l.competencia, l.vencimento, null, l.id, l.pago, l.data, l.valor, l.valor_estimado,
           case when l.pago then 'paga' else 'a_pagar' end
      from public.lancamentos l
     where l.petshop_id = p and l.tipo = 'saida' and l.competencia is not null and l.conta_fixa_id is null
       and l.vencimento between p_de and p_ate
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'conta_fixa_id', y.conta_id, 'nome', y.nome, 'mes', to_char(y.comp, 'YYYY-MM'), 'vencimento', y.venc, 'situacao', y.situacao,
      'valor', y.valor, 'estimado', coalesce(y.estimado, false), 'lancamento_id', y.lancamento_id,
      'pago_em', case when y.situacao = 'paga' then y.pago_em end,
      'entra_em', case when y.situacao = 'vai_entrar' then y.venc - public.contas_fixas_antecedencia() end,
      'comeca_em', case when y.situacao = 'antes_do_inicio' then y.comeca_em end
    ) order by y.venc, y.nome), '[]'::jsonb)
    into v_res
    from linhas y where y.situacao is not null;
  return v_res;
end $$;
revoke execute on function public.contas_fixas_situacao(uuid, date, date) from public, anon;
grant execute on function public.contas_fixas_situacao(uuid, date, date) to authenticated;
