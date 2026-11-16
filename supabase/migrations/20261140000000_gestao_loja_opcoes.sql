-- Opções da loja: margem e custo médio, código de barras e fornecedores.
-- Cada pet shop liga o que usa em `petshops.opcoes` ("loja.margem", "loja.codigo_barras", "loja.fornecedores").
-- Só acrescenta: colunas novas aceitam vazio e, com as opções desligadas, o estoque se comporta como antes.
-- O código que já está no ar segue funcionando (ele lê colunas pelo nome e chama as mesmas funções).

-- ---------- fornecedores ----------
create table public.fornecedores (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 120),
  telefone text check (telefone is null or char_length(telefone) <= 30),
  observacoes text check (observacoes is null or char_length(observacoes) <= 1000),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (id, petshop_id)
);
create index fornecedores_petshop_id_nome_idx on public.fornecedores (petshop_id, nome);
alter table public.fornecedores enable row level security;

-- Quem cuida do estoque lê e escreve; conta só para consulta lê e não grava. Fornecedor não é apagado: sai da lista (ativo = false).
create policy fornecedores_ler on public.fornecedores for select to authenticated
  using ((select public.tenho_area(petshop_id, array['estoque'])));
create policy fornecedores_criar on public.fornecedores for insert to authenticated
  with check ((select public.tenho_area(petshop_id, array['estoque'])) and (select public.acesso_liberado(petshop_id)));
create policy fornecedores_editar on public.fornecedores for update to authenticated
  using ((select public.tenho_area(petshop_id, array['estoque'])) and (select public.acesso_liberado(petshop_id)))
  with check ((select public.tenho_area(petshop_id, array['estoque'])));
revoke all on public.fornecedores from anon, authenticated;
grant select, insert, update on public.fornecedores to authenticated;

-- ---------- produtos ----------
alter table public.produtos
  add column codigo_barras text check (codigo_barras is null or char_length(codigo_barras) between 1 and 64),
  -- custo da última entrada (reservado, como `custo`); com a margem ligada, `custo` passa a ser o custo médio
  add column ultimo_custo numeric(10,2) check (ultimo_custo is null or ultimo_custo >= 0),
  -- último fornecedor: muda sozinho a cada entrada com fornecedor
  add column fornecedor_id uuid,
  add constraint produtos_fornecedor_fkey foreign key (fornecedor_id, petshop_id) references public.fornecedores (id, petshop_id);
-- o custo de hoje é o da última entrada: vira o ponto de partida do último custo
update public.produtos set ultimo_custo = custo where custo is not null;
-- um código de barras por produto da lista, em cada pet shop
create unique index produtos_codigo_barras_idx on public.produtos (petshop_id, codigo_barras) where codigo_barras is not null and ativo;
create index produtos_fornecedor_idx on public.produtos (fornecedor_id) where fornecedor_id is not null;
-- as colunas livres continuam lidas pelo nome; custo e último custo só pelas funções
grant select (codigo_barras, fornecedor_id) on public.produtos to authenticated;

-- ---------- movimentos ----------
alter table public.movimentos_estoque
  add column fornecedor_id uuid,
  -- venda que gerou esta saída (lançamento do financeiro). Sem chave estrangeira de propósito:
  -- quando a venda é apagada, a saída fica apontando para um lançamento que não existe mais e sai dos relatórios.
  add column lancamento_id uuid,
  add constraint movimentos_estoque_fornecedor_fkey foreign key (fornecedor_id, petshop_id) references public.fornecedores (id, petshop_id);
create index movimentos_estoque_fornecedor_idx on public.movimentos_estoque (fornecedor_id, criado_em desc) where fornecedor_id is not null;
create index movimentos_estoque_lancamento_idx on public.movimentos_estoque (lancamento_id) where lancamento_id is not null;
create index movimentos_estoque_produto_idx on public.movimentos_estoque (produto_id, criado_em desc);
grant select (fornecedor_id, lancamento_id) on public.movimentos_estoque to authenticated;

-- Toda saída guarda o custo do produto naquele momento (o que a tela mandar é ignorado: quem vende pode não ver custo).
-- Assim a margem de uma venda antiga não muda quando o custo muda depois.
create or replace function public.preparar_movimento_estoque() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo = 'saida' then
    new.custo_unitario := (select x.custo from public.produtos x where x.id = new.produto_id);
  end if;
  return new;
end $$;
revoke execute on function public.preparar_movimento_estoque() from public, anon, authenticated;
create trigger movimentos_estoque_prepara before insert on public.movimentos_estoque
  for each row execute function public.preparar_movimento_estoque();

-- Entrada: soma o saldo e atualiza o custo.
--  - margem desligada (como sempre foi): o custo do produto passa a ser o da última entrada;
--  - margem ligada ("loja.margem"): custo médio = (saldo de antes × custo médio + quantidade × custo da entrada) ÷ saldo novo,
--    arredondado em centavos. Saldo zerado ou negativo, ou produto ainda sem custo: vale o custo da entrada.
--    Entrada sem custo (venda desfeita, por exemplo) não mexe no custo.
-- Nos dois casos guarda o último custo e o último fornecedor.
create or replace function public.aplicar_movimento_estoque() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_media boolean;
begin
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
  elsif new.tipo = 'saida' then
    update public.produtos set estoque = estoque - new.quantidade where id = new.produto_id;
  else
    update public.produtos set estoque = new.quantidade where id = new.produto_id;
  end if;
  return new;
end $$;

-- ---------- valores reservados, só para quem cuida do estoque ou do financeiro ----------
-- Custo (médio, com a margem ligada) e último custo de cada produto.
create or replace function public.produtos_reservado(p uuid) returns table (id uuid, custo numeric, ultimo_custo numeric)
language sql stable security definer set search_path = '' as $$
  select x.id, x.custo, x.ultimo_custo from public.produtos x
  where x.petshop_id = p and (select public.tenho_area(p, array['estoque', 'financeiro', 'relatorios']))
$$;
revoke execute on function public.produtos_reservado(uuid) from public, anon;
grant execute on function public.produtos_reservado(uuid) to authenticated;

-- Custo unitário das compras feitas de um fornecedor.
create or replace function public.custos_das_compras(p uuid, p_fornecedor uuid) returns table (id uuid, custo_unitario numeric)
language sql stable security definer set search_path = '' as $$
  select m.id, m.custo_unitario from public.movimentos_estoque m
  where m.petshop_id = p and m.fornecedor_id = p_fornecedor and m.tipo = 'entrada'
    and (select public.tenho_area(p, array['estoque', 'financeiro', 'relatorios']))
$$;
revoke execute on function public.custos_das_compras(uuid, uuid) from public, anon;
grant execute on function public.custos_das_compras(uuid, uuid) to authenticated;

-- Saídas marcadas como venda, com o custo guardado na hora, para o relatório de produtos:
--  - ligadas a um lançamento com data dentro do período (a venda que está no financeiro);
--  - sem lançamento (baixa feita por quem não lança dinheiro), pelo dia em que saíram, no fuso do pet shop.
create or replace function public.custos_das_vendas(p uuid, p_de date, p_ate date)
returns table (id uuid, lancamento_id uuid, produto_id uuid, quantidade numeric, custo_unitario numeric, criado_em timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.lancamento_id, m.produto_id, m.quantidade, m.custo_unitario, m.criado_em
  from public.movimentos_estoque m
  where m.petshop_id = p and m.tipo = 'saida' and m.motivo = 'Venda'
    and (select public.tenho_area(p, array['financeiro', 'relatorios']))
    and (
      (m.lancamento_id is not null and exists (
        select 1 from public.lancamentos l where l.id = m.lancamento_id and l.petshop_id = p and l.data between p_de and p_ate))
      or (m.lancamento_id is null
        and (m.criado_em at time zone coalesce((select x.fuso from public.petshops x where x.id = p), 'America/Sao_Paulo'))::date between p_de and p_ate)
    )
$$;
revoke execute on function public.custos_das_vendas(uuid, date, date) from public, anon;
grant execute on function public.custos_das_vendas(uuid, date, date) to authenticated;
