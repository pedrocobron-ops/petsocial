-- Estoque: validade e lote, kits e combos, contagem de estoque (inventário).
-- Só acrescenta (colunas, tabelas, funções); as funções do estoque que já existiam são trocadas por versões que fazem o mesmo
-- de antes para produto sem lote e sem kit.
--
-- 1. Validade e lote: na entrada de mercadoria, lote e validade (opcionais). O saldo de cada lote fica em produtos_lotes.
--    A saída tira primeiro do lote que vence antes (ou do lote escolhido); o que passa dos lotes sai do saldo "sem lote".
--    Produto sem lote nenhum: nada muda. "Controlar validade" (produtos.controla_validade) só liga os campos na tela.
-- 2. Kits: produto do tipo 'kit' feito de outros produtos (produtos_kit_itens). Saída do kit = saída de cada produto do kit
--    (com os lotes); o saldo do kit é quantos dá para montar e o custo é a soma do custo dos produtos (os dois guardados e
--    refeitos sozinhos). A saída do kit fica ligada à venda com o custo do kit; as saídas dos produtos do kit, com o mesmo
--    motivo, não se ligam à venda (o custo da venda não conta duas vezes) e entram na média do "O que comprar".
-- 3. Contagem: começar (tudo, uma categoria ou um fornecedor), contar no celular, pausar e continuar, revisar e ajustar o
--    estoque de uma vez (movimentos 'ajuste' com motivo 'Contagem'), histórico com quem e quando.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Colunas e tabelas
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.produtos add column if not exists tipo text not null default 'produto';
alter table public.produtos add column if not exists controla_validade boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'produtos_tipo_check') then
    alter table public.produtos add constraint produtos_tipo_check check (tipo in ('produto', 'kit'));
  end if;
end $$;
-- produtos tem permissão por coluna: as colunas novas precisam ser liberadas para leitura
grant select (tipo, controla_validade) on public.produtos to authenticated;

-- lotes de cada produto: o saldo de cada lote (validade e código do lote opcionais, um dos dois sempre)
create table if not exists public.produtos_lotes (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  produto_id uuid not null,
  lote text check (lote is null or char_length(lote) between 1 and 60),
  validade date check (validade is null or validade between date '2000-01-01' and date '2100-12-31'),
  quantidade numeric(12,3) not null default 0 check (quantidade >= 0),
  -- custo da entrada do lote (reservado: só pelas funções)
  custo_unitario numeric(10,2) check (custo_unitario is null or custo_unitario >= 0),
  criado_em timestamptz not null default now(),
  check (lote is not null or validade is not null),
  foreign key (produto_id, petshop_id) references public.produtos (id, petshop_id) on delete cascade
);
create unique index if not exists produtos_lotes_unico on public.produtos_lotes (produto_id, coalesce(lower(lote), ''), coalesce(validade, date '2100-12-31'));
create index if not exists produtos_lotes_validade on public.produtos_lotes (petshop_id, validade) where quantidade > 0;
alter table public.produtos_lotes enable row level security;
revoke all on public.produtos_lotes from public, anon, authenticated;
grant select (id, petshop_id, produto_id, lote, validade, quantidade, criado_em) on public.produtos_lotes to authenticated;
drop policy if exists produtos_lotes_ler on public.produtos_lotes;
create policy produtos_lotes_ler on public.produtos_lotes for select to authenticated
  using (petshop_id in (select public.meus_petshops()));

-- o que cada movimento tirou ou pôs em cada lote (+ entrou, − saiu)
create table if not exists public.movimentos_lotes (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  movimento_id uuid not null references public.movimentos_estoque (id) on delete cascade,
  lote_id uuid not null references public.produtos_lotes (id) on delete cascade,
  quantidade numeric(12,3) not null check (quantidade <> 0),
  criado_em timestamptz not null default now()
);
create index if not exists movimentos_lotes_movimento on public.movimentos_lotes (movimento_id);
create index if not exists movimentos_lotes_lote on public.movimentos_lotes (lote_id);
alter table public.movimentos_lotes enable row level security;
revoke all on public.movimentos_lotes from public, anon, authenticated;
grant select (id, petshop_id, movimento_id, lote_id, quantidade, criado_em) on public.movimentos_lotes to authenticated;
drop policy if exists movimentos_lotes_ler on public.movimentos_lotes;
create policy movimentos_lotes_ler on public.movimentos_lotes for select to authenticated
  using (petshop_id in (select public.meus_petshops()));

-- movimentos: lote da entrada (código e validade digitados), lote escolhido na saída, e a saída do kit que gerou esta
alter table public.movimentos_estoque add column if not exists lote text;
alter table public.movimentos_estoque add column if not exists validade date;
alter table public.movimentos_estoque add column if not exists lote_id uuid references public.produtos_lotes (id) on delete set null;
alter table public.movimentos_estoque add column if not exists kit_movimento_id uuid references public.movimentos_estoque (id) on delete cascade;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'movimentos_estoque_lote_check') then
    alter table public.movimentos_estoque add constraint movimentos_estoque_lote_check
      check ((lote is null or char_length(lote) between 1 and 60) and (validade is null or validade between date '2000-01-01' and date '2100-12-31'));
  end if;
end $$;
create index if not exists movimentos_estoque_kit_idx on public.movimentos_estoque (kit_movimento_id) where kit_movimento_id is not null;
grant select (lote, validade, lote_id, kit_movimento_id) on public.movimentos_estoque to authenticated;

-- composição dos kits
create table if not exists public.produtos_kit_itens (
  kit_id uuid not null,
  componente_id uuid not null,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  quantidade numeric(12,3) not null check (quantidade > 0 and quantidade <= 100000),
  primary key (kit_id, componente_id),
  check (kit_id <> componente_id),
  foreign key (kit_id, petshop_id) references public.produtos (id, petshop_id) on delete cascade,
  foreign key (componente_id, petshop_id) references public.produtos (id, petshop_id) on delete cascade
);
create index if not exists produtos_kit_itens_componente on public.produtos_kit_itens (componente_id);
alter table public.produtos_kit_itens enable row level security;
revoke all on public.produtos_kit_itens from public, anon, authenticated;
grant select (kit_id, componente_id, petshop_id, quantidade) on public.produtos_kit_itens to authenticated;
drop policy if exists produtos_kit_itens_ler on public.produtos_kit_itens;
create policy produtos_kit_itens_ler on public.produtos_kit_itens for select to authenticated
  using (petshop_id in (select public.meus_petshops()));

-- contagens de estoque (lidas e gravadas só pelas funções)
create table if not exists public.contagens (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 160),
  categoria text check (categoria is null or char_length(categoria) between 1 and 120),
  fornecedor_id uuid,
  status text not null default 'aberta' check (status in ('aberta', 'pausada', 'concluida', 'cancelada')),
  chave text check (chave is null or char_length(chave) between 8 and 120),
  criado_por uuid references auth.users (id) on delete set null,
  criado_por_nome text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  concluida_por uuid references auth.users (id) on delete set null,
  concluida_por_nome text,
  concluida_em timestamptz,
  ajustados integer,
  diferenca_valor numeric(12,2)
);
create unique index if not exists contagens_chave on public.contagens (petshop_id, chave);
create index if not exists contagens_petshop on public.contagens (petshop_id, criado_em desc);
alter table public.contagens enable row level security;
revoke all on public.contagens from public, anon, authenticated;

create table if not exists public.contagens_itens (
  contagem_id uuid not null references public.contagens (id) on delete cascade,
  produto_id uuid not null references public.produtos (id) on delete cascade,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  -- quanto a pessoa contou; o saldo do sistema na hora em que contou (a diferença é contado − esperado)
  contado numeric(12,3) check (contado is null or (contado >= 0 and contado <= 10000000)),
  esperado numeric(12,3),
  contado_por uuid references auth.users (id) on delete set null,
  contado_em timestamptz,
  -- na conclusão: o custo de cada unidade, o saldo de antes e o de depois, o movimento gravado
  custo numeric(10,2),
  ajustado_de numeric(12,3),
  ajustado_para numeric(12,3),
  movimento_id uuid references public.movimentos_estoque (id) on delete set null,
  primary key (contagem_id, produto_id)
);
alter table public.contagens_itens enable row level security;
revoke all on public.contagens_itens from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Kits: saldo e custo do kit, refeitos quando os produtos do kit mudam
-- ---------------------------------------------------------------------------------------------------------------------
-- Saldo do kit = quantos kits dá para montar com o saldo de cada produto (nunca menos de zero; sem produto, zero).
-- Custo do kit = soma do custo × quantidade de cada produto (sem o custo de algum, o kit fica sem custo).
create or replace function public.kits_recalcular(p_kits uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.produtos k set
    estoque = coalesce((select greatest(0, min(floor(c.estoque / i.quantidade))) from public.produtos_kit_itens i
      join public.produtos c on c.id = i.componente_id where i.kit_id = k.id), 0),
    custo = (select case when count(*) > 0 and count(c.custo) = count(*) then round(sum(c.custo * i.quantidade), 2) end
      from public.produtos_kit_itens i join public.produtos c on c.id = i.componente_id where i.kit_id = k.id)
  where k.id = any (p_kits) and k.tipo = 'kit';
end $$;
revoke execute on function public.kits_recalcular(uuid[]) from public, anon, authenticated;

-- produto do kit mudou de saldo ou de custo: os kits em que ele entra acompanham
create or replace function public.produto_mudou_kits() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v uuid[];
begin
  select array_agg(i.kit_id) into v from public.produtos_kit_itens i where i.componente_id = new.id;
  if v is not null then perform public.kits_recalcular(v); end if;
  return null;
end $$;
revoke execute on function public.produto_mudou_kits() from public, anon, authenticated;
drop trigger if exists produto_mudou_kits on public.produtos;
create trigger produto_mudou_kits after update of estoque, custo on public.produtos
  for each row when (new.tipo = 'produto' and (new.estoque is distinct from old.estoque or new.custo is distinct from old.custo))
  execute function public.produto_mudou_kits();

-- tipo não muda depois de criado; kit nasce com saldo zero e sem controle de validade
create or replace function public.produto_tipo_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.tipo is distinct from old.tipo then
    raise exception 'Um produto não vira kit, nem um kit vira produto. Crie um novo.';
  end if;
  if new.tipo = 'kit' then
    new.controla_validade := false;
    if tg_op = 'INSERT' then new.estoque := 0; new.custo := null; end if;
  end if;
  return new;
end $$;
revoke execute on function public.produto_tipo_conferir() from public, anon, authenticated;
drop trigger if exists produto_tipo_conferir on public.produtos;
create trigger produto_tipo_conferir before insert or update of tipo, controla_validade on public.produtos
  for each row execute function public.produto_tipo_conferir();

-- Os produtos do kit (troca a lista inteira, tudo junto). p_itens: [{componente_id, quantidade}]. Só quem cuida do estoque.
create or replace function public.kit_definir_itens(p_kit uuid, p_itens jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  k public.produtos;
  x jsonb;
  v_c uuid;
  v_q numeric;
  n integer := 0;
begin
  select * into k from public.produtos where id = p_kit for update;
  if k.id is null or not (k.petshop_id in (select public.meus_petshops())) then raise exception 'Kit não encontrado.'; end if;
  if not public.tenho_area(k.petshop_id, array['estoque']) then raise exception 'Só quem cuida do estoque monta kits.' using errcode = '42501'; end if;
  if not public.acesso_liberado(k.petshop_id) then raise exception 'Conta só para consulta.' using errcode = '42501'; end if;
  if k.tipo <> 'kit' then raise exception 'Este produto não é um kit.'; end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'Escolha pelo menos um produto para o kit.'; end if;
  if jsonb_array_length(p_itens) > 30 then raise exception 'No máximo 30 produtos num kit.'; end if;
  delete from public.produtos_kit_itens where kit_id = p_kit;
  for x in select y from jsonb_array_elements(p_itens) y loop
    v_c := nullif(x ->> 'componente_id', '')::uuid;
    v_q := round((x ->> 'quantidade')::numeric, 3);
    if v_c is null or v_q is null or v_q <= 0 or v_q > 100000 then raise exception 'Confira as quantidades do kit.'; end if;
    if not exists (select 1 from public.produtos c where c.id = v_c and c.petshop_id = k.petshop_id and c.tipo = 'produto' and c.ativo) then
      raise exception 'Um dos produtos do kit não foi encontrado (kit não entra em outro kit).';
    end if;
    insert into public.produtos_kit_itens (kit_id, componente_id, petshop_id, quantidade) values (p_kit, v_c, k.petshop_id, v_q)
      on conflict (kit_id, componente_id) do update set quantidade = public.produtos_kit_itens.quantidade + excluded.quantidade;
    n := n + 1;
  end loop;
  perform public.kits_recalcular(array[p_kit]);
  select * into k from public.produtos where id = p_kit;
  return jsonb_build_object('itens', n, 'estoque', k.estoque);
end $$;
revoke execute on function public.kit_definir_itens(uuid, jsonb) from public, anon;
grant execute on function public.kit_definir_itens(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Movimentos: kits e lotes
-- ---------------------------------------------------------------------------------------------------------------------
-- Tira dos lotes: primeiro o escolhido, depois o que vence antes. Devolve quanto saiu dos lotes (o resto sai do "sem lote").
create or replace function public.lotes_consumir(p_mov uuid, p_petshop uuid, p_produto uuid, p_qtd numeric, p_preferido uuid)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v_falta numeric := coalesce(p_qtd, 0);
  v_tira numeric;
  l record;
begin
  if v_falta <= 0 then return 0; end if;
  for l in
    select x.id, x.quantidade from public.produtos_lotes x
    where x.produto_id = p_produto and x.quantidade > 0
    order by case when x.id = p_preferido then 0 else 1 end, x.validade nulls last, x.criado_em, x.id
    for update
  loop
    v_tira := least(l.quantidade, v_falta);
    update public.produtos_lotes set quantidade = quantidade - v_tira where id = l.id;
    insert into public.movimentos_lotes (petshop_id, movimento_id, lote_id, quantidade) values (p_petshop, p_mov, l.id, -v_tira);
    v_falta := v_falta - v_tira;
    exit when v_falta <= 0;
  end loop;
  return coalesce(p_qtd, 0) - v_falta;
end $$;
revoke execute on function public.lotes_consumir(uuid, uuid, uuid, numeric, uuid) from public, anon, authenticated;

-- Antes de gravar: custo da saída (como antes; no kit, a soma dos produtos), conferências do kit e do lote,
-- e o lote da entrada (o mesmo código e validade somam no lote que já existe).
create or replace function public.preparar_movimento_estoque() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p public.produtos;
  v_lote text;
begin
  select * into p from public.produtos x where x.id = new.produto_id;
  if new.kit_movimento_id is not null and pg_trigger_depth() <= 1 then
    raise exception 'Movimento de kit é feito pelo próprio kit.';
  end if;
  if p.tipo = 'kit' then
    if new.tipo = 'ajuste' then
      raise exception 'O kit não tem saldo próprio: corrija o saldo dos produtos do kit.';
    end if;
    if new.tipo = 'entrada' and not (coalesce(new.motivo, '') ~* '(venda desfeita|devolu)') then
      raise exception 'Kit não recebe entrada: dê entrada nos produtos do kit.';
    end if;
    new.lote := null; new.validade := null; new.lote_id := null;
  end if;
  if new.tipo = 'saida' then
    if p.tipo = 'kit' then
      new.custo_unitario := (select case when count(*) > 0 and count(c.custo) = count(*) then round(sum(c.custo * i.quantidade), 2) end
        from public.produtos_kit_itens i join public.produtos c on c.id = i.componente_id where i.kit_id = p.id);
    else
      new.custo_unitario := p.custo;
    end if;
  end if;
  -- lote escolhido (saída) ou já conhecido (entrada): tem de ser deste produto
  if new.lote_id is not null and not exists (select 1 from public.produtos_lotes l where l.id = new.lote_id and l.produto_id = new.produto_id) then
    raise exception 'Este lote não é deste produto.';
  end if;
  if new.tipo <> 'entrada' then
    new.lote := null; new.validade := null;
  else
    v_lote := nullif(btrim(coalesce(new.lote, '')), '');
    new.lote := v_lote;
    if new.lote_id is null and (v_lote is not null or new.validade is not null) and p.tipo = 'produto' then
      select l.id into new.lote_id from public.produtos_lotes l
       where l.produto_id = new.produto_id and coalesce(lower(l.lote), '') = coalesce(lower(v_lote), '')
         and coalesce(l.validade, date '2100-12-31') = coalesce(new.validade, date '2100-12-31');
      if new.lote_id is null then
        insert into public.produtos_lotes (petshop_id, produto_id, lote, validade) values (new.petshop_id, new.produto_id, v_lote, new.validade)
        on conflict do nothing returning id into new.lote_id;
        if new.lote_id is null then
          select l.id into new.lote_id from public.produtos_lotes l
           where l.produto_id = new.produto_id and coalesce(lower(l.lote), '') = coalesce(lower(v_lote), '')
             and coalesce(l.validade, date '2100-12-31') = coalesce(new.validade, date '2100-12-31');
        end if;
      end if;
    end if;
  end if;
  return new;
end $$;

-- Depois de gravar: o saldo (como antes), os lotes, e no kit a saída (ou a volta) de cada produto do kit.
create or replace function public.aplicar_movimento_estoque() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_media boolean;
  v_tipo text;
  v_antes numeric;
  v_soma numeric;
  k record;
begin
  select x.tipo, x.estoque into v_tipo, v_antes from public.produtos x where x.id = new.produto_id for update;
  if v_tipo = 'kit' then
    -- um movimento por produto do kit, com o mesmo motivo, ligado a este (sem a venda: o custo da venda fica no kit)
    for k in select i.componente_id, i.quantidade from public.produtos_kit_itens i where i.kit_id = new.produto_id order by i.componente_id loop
      insert into public.movimentos_estoque (petshop_id, produto_id, tipo, quantidade, motivo, origem, criado_por, kit_movimento_id)
      values (new.petshop_id, k.componente_id, new.tipo, round(new.quantidade * k.quantidade, 3), new.motivo, new.origem, new.criado_por, new.id);
    end loop;
    perform public.kits_recalcular(array[new.produto_id]);
    return new;
  end if;

  if new.tipo = 'entrada' then
    v_media := new.custo_unitario is not null and coalesce(
      (select (x.opcoes -> 'loja.margem') = 'true'::jsonb from public.petshops x where x.id = new.petshop_id), false);
    update public.produtos
      set custo = case
            when new.custo_unitario is null then custo
            when not v_media or custo is null or estoque <= 0 or estoque + new.quantidade <= 0 then new.custo_unitario
            else round((estoque * custo + new.quantidade * new.custo_unitario) / (estoque + new.quantidade), 2)
          end,
          ultimo_custo = coalesce(new.custo_unitario, ultimo_custo),
          fornecedor_id = coalesce(new.fornecedor_id, fornecedor_id),
          estoque = estoque + new.quantidade
      where id = new.produto_id;
    if new.lote_id is not null and new.quantidade > 0 then
      update public.produtos_lotes l set
          custo_unitario = case when new.custo_unitario is null then l.custo_unitario
            when l.custo_unitario is null or l.quantidade <= 0 then new.custo_unitario
            else round((l.quantidade * l.custo_unitario + new.quantidade * new.custo_unitario) / (l.quantidade + new.quantidade), 2) end,
          quantidade = l.quantidade + new.quantidade
        where l.id = new.lote_id;
      insert into public.movimentos_lotes (petshop_id, movimento_id, lote_id, quantidade) values (new.petshop_id, new.id, new.lote_id, new.quantidade);
    end if;
  elsif new.tipo = 'saida' then
    update public.produtos set estoque = estoque - new.quantidade where id = new.produto_id;
    perform public.lotes_consumir(new.id, new.petshop_id, new.produto_id, new.quantidade, new.lote_id);
  else
    update public.produtos set estoque = new.quantidade where id = new.produto_id;
    -- saldo corrigido para baixo do que está nos lotes: os lotes acompanham (primeiro o que vence antes)
    select coalesce(sum(l.quantidade), 0) into v_soma from public.produtos_lotes l where l.produto_id = new.produto_id and l.quantidade > 0;
    if v_soma > new.quantidade then
      perform public.lotes_consumir(new.id, new.petshop_id, new.produto_id, v_soma - new.quantidade, new.lote_id);
    end if;
  end if;
  return new;
end $$;

-- Venda que não liga o produto do kit à venda: os relatórios de venda por produto não contam as saídas dos produtos do kit
create or replace function public.custos_das_vendas(p uuid, p_de date, p_ate date)
returns table (id uuid, lancamento_id uuid, produto_id uuid, quantidade numeric, custo_unitario numeric, criado_em timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.lancamento_id, m.produto_id, m.quantidade, m.custo_unitario, m.criado_em
  from public.movimentos_estoque m
  where m.petshop_id = p and m.tipo = 'saida' and m.motivo = 'Venda' and m.kit_movimento_id is null
    and (select public.tenho_area(p, array['financeiro', 'relatorios']))
    and (
      (m.lancamento_id is not null and exists (
        select 1 from public.lancamentos l where l.id = m.lancamento_id and l.petshop_id = p and l.data between p_de and p_ate))
      or (m.lancamento_id is null
        and (m.criado_em at time zone coalesce((select x.fuso from public.petshops x where x.id = p), 'America/Sao_Paulo'))::date between p_de and p_ate)
    )
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Validade: o que está vencido ou vencendo, e a baixa como perda
-- ---------------------------------------------------------------------------------------------------------------------
-- Lotes com saldo que venceram ou vencem em até p_dias (até 120). Valor (saldo × custo do lote ou do produto) só para quem vê o
-- financeiro. Quem cuida do estoque ou do financeiro.
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
  v_valor := public.vejo_financeiro(p);
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
revoke execute on function public.estoque_vencendo(uuid, integer) from public, anon;
grant execute on function public.estoque_vencendo(uuid, integer) to authenticated;

-- Lotes de um produto com saldo (para escolher na saída e ver na ficha), na ordem em que saem.
create or replace function public.produto_lotes(p uuid, p_produto uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'lote', l.lote, 'validade', l.validade, 'quantidade', l.quantidade,
      'custo_unitario', case when public.tenho_area(p, array['estoque', 'financeiro', 'relatorios']) then l.custo_unitario end)
    order by l.validade nulls last, l.criado_em, l.id), '[]'::jsonb)
  from public.produtos_lotes l
  where l.petshop_id = p and l.produto_id = p_produto and l.quantidade > 0 and p in (select public.meus_petshops())
$$;
revoke execute on function public.produto_lotes(uuid, uuid) from public, anon;
grant execute on function public.produto_lotes(uuid, uuid) to authenticated;

-- Dá baixa nos lotes como perda (motivo "Vencido"), tudo junto: uma saída por lote, do saldo inteiro do lote.
-- Mesma chave de novo não tira outra vez. Devolve { baixados, quantidade }.
create or replace function public.lotes_baixar_perda(p_petshop uuid, p_lotes uuid[], p_chave text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l record;
  n integer := 0;
  v_id uuid;
begin
  if p_petshop is null or not public.tenho_area(p_petshop, array['estoque']) then
    raise exception 'Só quem cuida do estoque dá baixa em produto vencido.' using errcode = '42501';
  end if;
  if not public.acesso_liberado(p_petshop) then raise exception 'Conta só para consulta.' using errcode = '42501'; end if;
  if p_chave is null or char_length(p_chave) not between 8 and 80 then raise exception 'Chave da operação inválida.'; end if;
  if coalesce(array_length(p_lotes, 1), 0) = 0 or array_length(p_lotes, 1) > 500 then raise exception 'Escolha de 1 a 500 lotes.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('lotes_baixar_perda:' || p_petshop::text, 0));
  for l in
    select x.id, x.produto_id, x.quantidade from public.produtos_lotes x
    where x.petshop_id = p_petshop and x.id = any (p_lotes) order by x.validade nulls last, x.id
  loop
    if exists (select 1 from public.movimentos_estoque m where m.petshop_id = p_petshop and m.chave = p_chave || ':' || l.id::text) then
      n := n + 1; continue;
    end if;
    if l.quantidade <= 0 then continue; end if;
    v_id := null;
    insert into public.movimentos_estoque (petshop_id, produto_id, tipo, quantidade, motivo, criado_por, lote_id, chave)
    values (p_petshop, l.produto_id, 'saida', l.quantidade, 'Vencido', (select auth.uid()), l.id, p_chave || ':' || l.id::text)
    on conflict (petshop_id, chave) do nothing returning id into v_id;
    n := n + 1;
  end loop;
  return jsonb_build_object('baixados', n);
end $$;
revoke execute on function public.lotes_baixar_perda(uuid, uuid[], text) from public, anon;
grant execute on function public.lotes_baixar_perda(uuid, uuid[], text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Contagem de estoque
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.contagem_pode(p uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or p is null or not public.tenho_area(p, array['estoque']) then
    raise exception 'A contagem de estoque é com quem cuida do estoque.' using errcode = '42501';
  end if;
end $$;
revoke execute on function public.contagem_pode(uuid) from public, anon, authenticated;

-- Começa uma contagem: todos os produtos ativos (sem kits), ou só de uma categoria, ou só de um fornecedor.
-- Mesma chave de novo devolve a mesma contagem.
create or replace function public.contagem_iniciar(p_petshop uuid, p_categoria text, p_fornecedor uuid, p_chave text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_nome text;
  v_cat text := nullif(btrim(coalesce(p_categoria, '')), '');
  v_hoje date;
begin
  perform public.contagem_pode(p_petshop);
  if not public.acesso_liberado(p_petshop) then raise exception 'Conta só para consulta.' using errcode = '42501'; end if;
  if p_chave is null or char_length(p_chave) not between 8 and 120 then raise exception 'Chave da operação inválida.'; end if;
  select c.id into v_id from public.contagens c where c.petshop_id = p_petshop and c.chave = p_chave;
  if v_id is not null then return v_id; end if;
  if p_fornecedor is not null and not exists (select 1 from public.fornecedores f where f.id = p_fornecedor and f.petshop_id = p_petshop) then
    raise exception 'Fornecedor não encontrado.';
  end if;
  v_hoje := (now() at time zone coalesce((select s.fuso from public.petshops s where s.id = p_petshop), 'America/Sao_Paulo'))::date;
  v_nome := 'Contagem de ' || to_char(v_hoje, 'DD/MM') || ' · ' || case
    when p_fornecedor is not null then 'fornecedor ' || (select f.nome from public.fornecedores f where f.id = p_fornecedor)
    when v_cat is not null then v_cat
    else 'todos os produtos' end;
  insert into public.contagens (petshop_id, nome, categoria, fornecedor_id, chave, criado_por, criado_por_nome)
  values (p_petshop, left(v_nome, 160), v_cat, p_fornecedor, p_chave, (select auth.uid()), public.nome_na_equipe(p_petshop))
  on conflict (petshop_id, chave) do nothing returning id into v_id;
  if v_id is null then
    select c.id into v_id from public.contagens c where c.petshop_id = p_petshop and c.chave = p_chave;
    return v_id;
  end if;
  insert into public.contagens_itens (contagem_id, produto_id, petshop_id)
  select v_id, x.id, p_petshop from public.produtos x
  where x.petshop_id = p_petshop and x.ativo and x.tipo = 'produto'
    and (v_cat is null or lower(btrim(coalesce(x.categoria, ''))) = lower(v_cat))
    and (p_fornecedor is null or x.fornecedor_id = p_fornecedor);
  if not found then
    raise exception 'Nenhum produto para contar com essa escolha.';
  end if;
  return v_id;
end $$;
revoke execute on function public.contagem_iniciar(uuid, text, uuid, text) from public, anon;
grant execute on function public.contagem_iniciar(uuid, text, uuid, text) to authenticated;

-- Anota o que foi contado (vários de uma vez; o celular manda o que juntou). p_itens: [{produto_id, contado}] (contado null limpa).
-- O saldo do sistema na hora fica guardado ao lado: a diferença é sobre ele. Produto fora da lista entra (leitor de código).
create or replace function public.contagem_marcar(p_contagem uuid, p_itens jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.contagens;
  x jsonb;
  v_p uuid;
  v_q numeric;
  n integer := 0;
begin
  select * into c from public.contagens where id = p_contagem for update;
  if c.id is null then raise exception 'Contagem não encontrada.'; end if;
  perform public.contagem_pode(c.petshop_id);
  if not public.acesso_liberado(c.petshop_id) then raise exception 'Conta só para consulta.' using errcode = '42501'; end if;
  if c.status in ('concluida', 'cancelada') then
    raise exception 'Esta contagem já foi %.', case c.status when 'concluida' then 'concluída' else 'cancelada' end using hint = 'maestro:contagem_fechada';
  end if;
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) > 2000 then raise exception 'Lista inválida.'; end if;
  for x in select y from jsonb_array_elements(p_itens) y loop
    v_p := nullif(x ->> 'produto_id', '')::uuid;
    v_q := case when x ? 'contado' and jsonb_typeof(x -> 'contado') = 'number' then round((x ->> 'contado')::numeric, 3) end;
    if v_p is null then continue; end if;
    if v_q is not null and (v_q < 0 or v_q > 10000000) then raise exception 'Confira as quantidades contadas.'; end if;
    if not exists (select 1 from public.produtos pr where pr.id = v_p and pr.petshop_id = c.petshop_id and pr.tipo = 'produto') then continue; end if;
    insert into public.contagens_itens as i (contagem_id, produto_id, petshop_id, contado, esperado, contado_por, contado_em)
    select c.id, v_p, c.petshop_id, v_q, case when v_q is null then null else pr.estoque end,
      case when v_q is null then null else (select auth.uid()) end, case when v_q is null then null else now() end
    from public.produtos pr where pr.id = v_p
    on conflict (contagem_id, produto_id) do update set contado = excluded.contado, esperado = excluded.esperado,
      contado_por = excluded.contado_por, contado_em = excluded.contado_em;
    n := n + 1;
  end loop;
  update public.contagens set atualizado_em = now(), status = case when status = 'pausada' then 'aberta' else status end where id = c.id;
  return jsonb_build_object('gravados', n);
end $$;
revoke execute on function public.contagem_marcar(uuid, jsonb) from public, anon;
grant execute on function public.contagem_marcar(uuid, jsonb) to authenticated;

-- Pausar, continuar ou cancelar.
create or replace function public.contagem_status(p_contagem uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.contagens;
begin
  select * into c from public.contagens where id = p_contagem for update;
  if c.id is null then raise exception 'Contagem não encontrada.'; end if;
  perform public.contagem_pode(c.petshop_id);
  if p_status not in ('aberta', 'pausada', 'cancelada') then raise exception 'Situação inválida.'; end if;
  if c.status in ('concluida', 'cancelada') then
    if c.status = p_status then return; end if;
    raise exception 'Esta contagem já foi %.', case c.status when 'concluida' then 'concluída' else 'cancelada' end using hint = 'maestro:contagem_fechada';
  end if;
  update public.contagens set status = p_status, atualizado_em = now() where id = c.id;
end $$;
revoke execute on function public.contagem_status(uuid, text) from public, anon;
grant execute on function public.contagem_status(uuid, text) to authenticated;

-- Uma contagem inteira: cada produto com o saldo de agora, o esperado, o contado, a diferença e (para quem vê o financeiro) o valor.
create or replace function public.contagem_ler(p_contagem uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  c public.contagens;
  v_valor boolean;
begin
  select * into c from public.contagens where id = p_contagem;
  if c.id is null or not (c.petshop_id in (select public.meus_petshops())) then raise exception 'Contagem não encontrada.'; end if;
  perform public.contagem_pode(c.petshop_id);
  v_valor := public.vejo_financeiro(c.petshop_id);
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
revoke execute on function public.contagem_ler(uuid) from public, anon;
grant execute on function public.contagem_ler(uuid) to authenticated;

-- As contagens do pet shop, da mais nova para a mais velha (até 100), com quem e quando.
create or replace function public.contagens_lista(p uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_valor boolean;
begin
  if p is null or not (p in (select public.meus_petshops())) then raise exception 'Sem acesso a este pet shop.' using errcode = '42501'; end if;
  perform public.contagem_pode(p);
  v_valor := public.vejo_financeiro(p);
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'nome', c.nome, 'status', c.status, 'criado_em', c.criado_em, 'criado_por_nome', c.criado_por_nome,
      'atualizado_em', c.atualizado_em, 'concluida_em', c.concluida_em, 'concluida_por_nome', c.concluida_por_nome,
      'ajustados', c.ajustados, 'diferenca_valor', case when v_valor then c.diferenca_valor end,
      'itens', (select count(*) from public.contagens_itens i where i.contagem_id = c.id),
      'contados', (select count(*) from public.contagens_itens i where i.contagem_id = c.id and i.contado is not null)
    ) order by c.criado_em desc)
    from (select * from public.contagens x where x.petshop_id = p order by x.criado_em desc limit 100) c), '[]'::jsonb);
end $$;
revoke execute on function public.contagens_lista(uuid) from public, anon;
grant execute on function public.contagens_lista(uuid) to authenticated;

-- "Ajustar estoque": tudo de uma vez. Cada produto contado com diferença vira um movimento 'ajuste' (motivo 'Contagem'):
-- saldo de agora + (contado − esperado), assim o que vendeu entre a contagem e o ajuste não se perde. Produto não contado
-- fica como está. A contagem fica concluída com quem e quando; tocar de novo devolve o mesmo resultado.
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
      'diferenca_valor', case when public.vejo_financeiro(c.petshop_id) then c.diferenca_valor end);
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
  return jsonb_build_object('ajustados', n, 'repetido', false, 'diferenca_valor', case when public.vejo_financeiro(c.petshop_id) then v_total end);
end $$;
revoke execute on function public.contagem_ajustar(uuid) from public, anon;
grant execute on function public.contagem_ajustar(uuid) to authenticated;


-- ---------------------------------------------------------------------------------------------------------------------
-- 6. "Bom dia" do Mozart: a mesma função da 20261196, com a linha da validade para quem cuida do estoque
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.gestao_bom_dia(p uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fuso text; v_hoje date; v_ini timestamptz; v_fim timestamptz;
  a_agenda boolean := public.tenho_area(p, array['agenda']);
  a_casa boolean := public.tenho_area(p, array['creche_hotel']);
  a_cli boolean := public.tenho_area(p, array['clientes']);
  a_din boolean := public.tenho_area(p, array['caixa', 'financeiro', 'relatorios']);
  a_pac boolean := public.tenho_area(p, array['pacotes']);
  a_est boolean := public.tenho_area(p, array['estoque']);
  v_pets boolean;
  v_vem jsonb;
  r jsonb := '{}'::jsonb;
begin
  if not exists (select 1 from public.profissionais x where x.petshop_id = p and x.user_id = (select auth.uid()) and x.ativo) then return null; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p;
  v_hoje := (now() at time zone v_fuso)::date;
  v_ini := v_hoje::timestamp at time zone v_fuso;
  v_fim := (v_hoje + 1)::timestamp at time zone v_fuso;
  v_pets := a_agenda or a_casa or a_cli;
  r := jsonb_build_object('dia', v_hoje);

  -- os pets que vêm hoje: horário na agenda (área Agenda) e creche ou chegada no hotel (área Creche e hotel)
  select coalesce(jsonb_agg(jsonb_build_object('pet_id', w.pet_id, 'quando', w.quando)), '[]'::jsonb) into v_vem from (
  select v.pet_id, min(v.quando) as quando from (
    select a.pet_id, a.inicio as quando from public.agendamentos a
     where a_agenda and a.petshop_id = p and a.inicio >= v_ini and a.inicio < v_fim and a.status not in ('cancelado', 'faltou')
    union all
    select e.pet_id, e.entrada from public.estadias e
     where a_casa and e.petshop_id = p and e.status in ('reservada', 'em_casa')
       and ((e.tipo = 'creche' and coalesce(e.dia, (e.entrada at time zone v_fuso)::date) = v_hoje)
         or (e.tipo = 'hotel' and (e.entrada at time zone v_fuso)::date = v_hoje))
  ) v group by v.pet_id) w;

  if a_agenda then
    r := r || jsonb_build_object('agenda', coalesce((
      select jsonb_agg(jsonb_build_array(a.inicio, a.fim) order by a.inicio) from public.agendamentos a
       where a.petshop_id = p and a.inicio >= v_ini and a.inicio < v_fim and a.status not in ('cancelado', 'faltou')), '[]'::jsonb));
  end if;

  if a_casa then
    r := r || jsonb_build_object('casa', jsonb_build_object(
      'em_casa', (select count(*) from public.estadias e where e.petshop_id = p and e.status = 'em_casa'),
      'chegam', (select count(*) from public.estadias e where e.petshop_id = p and e.status = 'reservada' and e.entrada >= v_ini and e.entrada < v_fim),
      'saem', (select count(*) from public.estadias e where e.petshop_id = p and e.status = 'em_casa' and e.saida_prevista >= v_ini and e.saida_prevista < v_fim)));
  end if;

  -- quem deve (conta a receber já vencida ou sem vencimento) e vem hoje: só para quem mexe com dinheiro
  if a_din then
    r := r || jsonb_build_object('devem', coalesce((
      select jsonb_agg(x order by x.valor desc, x.tutor) from (
        select c.nome as tutor, sum(l.valor) as valor,
               (select min(v.quando) from jsonb_to_recordset(v_vem) as v(pet_id uuid, quando timestamptz) join public.pets pp on pp.id = v.pet_id where pp.cliente_id = c.id) as quando,
               (select jsonb_agg(pp.nome order by pp.nome) from jsonb_to_recordset(v_vem) as v(pet_id uuid, quando timestamptz) join public.pets pp on pp.id = v.pet_id where pp.cliente_id = c.id) as pets
          from public.lancamentos l join public.clientes c on c.id = l.cliente_id
         where l.petshop_id = p and l.tipo = 'entrada' and not l.pago and (l.vencimento is null or l.vencimento <= v_hoje)
           and exists (select 1 from jsonb_to_recordset(v_vem) as v(pet_id uuid, quando timestamptz) join public.pets pp on pp.id = v.pet_id where pp.cliente_id = c.id)
         group by c.id, c.nome
        having sum(l.valor) > 0
         limit 5) x), '[]'::jsonb));
  end if;

  -- vacinas e cuidados vencidos ou vencendo em 15 dias dos pets que vêm hoje (a dose mais nova de cada um)
  if v_pets then
    r := r || jsonb_build_object('vacinas', coalesce((
      select jsonb_agg(x order by x.vence_em, x.pet) from (
        select pp.nome as pet, pp.sexo, d.nome, d.tipo, d.vence_em from (
          select distinct on (s.pet_id, s.tipo, lower(s.nome)) s.pet_id, s.tipo, s.nome, s.vence_em
            from public.pets_saude s join jsonb_to_recordset(v_vem) as v(pet_id uuid, quando timestamptz) on v.pet_id = s.pet_id
           where s.petshop_id = p
           order by s.pet_id, s.tipo, lower(s.nome), s.vence_em desc nulls first) d
          join public.pets pp on pp.id = d.pet_id
         where d.vence_em is not null and d.vence_em <= v_hoje + 15
         limit 5) x), '[]'::jsonb));
    r := r || jsonb_build_object('niver', coalesce((
      select jsonb_agg(x order by x.pet) from (
        select pp.nome as pet, pp.sexo, exists (select 1 from jsonb_to_recordset(v_vem) as v(pet_id uuid, quando timestamptz) where v.pet_id = pp.id) as vem
          from public.pets pp
         where pp.petshop_id = p and pp.ativo and pp.nascimento is not null
           and extract(month from pp.nascimento) = extract(month from v_hoje) and extract(day from pp.nascimento) = extract(day from v_hoje)
         order by pp.nome limit 5) x), '[]'::jsonb));
  end if;

  -- pacote no último uso: o horário de hoje (ainda não concluído) usa a última sessão do pacote
  if a_pac and a_agenda then
    r := r || jsonb_build_object('pacotes', coalesce((
      select jsonb_agg(x order by x.quando) from (
        select pp.nome as pet, pp.sexo, pc.nome, a.inicio as quando
          from public.agendamentos a join public.pacotes_clientes pc on pc.id = a.pacote_cliente_id join public.pets pp on pp.id = a.pet_id
         where a.petshop_id = p and a.inicio >= v_ini and a.inicio < v_fim and a.status not in ('cancelado', 'faltou', 'concluido')
           and pc.ativo and pc.total - pc.usados <= 1
         order by a.inicio limit 5) x), '[]'::jsonb));
  end if;

  -- validade dos produtos (só para quem cuida do estoque, e só quando tem algo vencido ou vencendo em 30 dias)
  if a_est then
    r := r || coalesce((
      select jsonb_build_object('validade', jsonb_build_object(
          'vencidos', count(distinct pr.id) filter (where l.validade < v_hoje),
          'vencendo', count(distinct pr.id) filter (where l.validade >= v_hoje),
          'primeiro', (array_agg(pr.nome order by l.validade, pr.nome))[1]))
        from public.produtos_lotes l join public.produtos pr on pr.id = l.produto_id
       where l.petshop_id = p and pr.ativo and l.quantidade > 0 and l.validade is not null and l.validade <= v_hoje + 30
      having count(*) > 0), '{}'::jsonb);
  end if;

  return r;
end $$;

revoke execute on function public.gestao_bom_dia(uuid) from public, anon;
grant execute on function public.gestao_bom_dia(uuid) to authenticated;

notify pgrst, 'reload schema';
