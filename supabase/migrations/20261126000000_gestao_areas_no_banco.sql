-- O acesso por área passa a valer também no banco, e não só nas telas.
-- 1) Custo de produto, preço de pacote, comissão e e-mail de convite deixam de ser lidos direto da tabela:
--    só saem pelas funções abaixo, que conferem a área de quem pede.
-- 2) Gravar em estoque, pacotes, creche e hotel, clientes e agenda exige a área correspondente.

-- A área vale para a pessoa? Mesma regra do aplicativo (src/lib/gestao/acessos.ts).
create function public.tenho_area(p uuid, p_areas text[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profissionais x
    where x.petshop_id = p and x.user_id = (select auth.uid()) and x.ativo and (
      x.papel = 'dono'
      or (x.acessos is not null and exists (
            select 1 from unnest(x.acessos) a
            where a = any (p_areas) and (a not in ('caixa', 'financeiro', 'relatorios') or x.ve_financeiro)))
      or (x.acessos is null and (
            x.papel = 'gerente'
            or p_areas && array['agenda', 'clientes', 'creche_hotel', 'pacotes', 'estoque']
            or (x.ve_financeiro and p_areas && array['caixa', 'financeiro', 'relatorios'])))
    )
  )
$$;
revoke execute on function public.tenho_area(uuid, text[]) from public, anon;
grant execute on function public.tenho_area(uuid, text[]) to authenticated;

-- ---------- colunas reservadas ----------
revoke select on public.produtos from anon, authenticated;
grant select (id, petshop_id, nome, categoria, unidade, preco_venda, estoque, estoque_minimo, ativo, criado_em) on public.produtos to authenticated;
revoke select on public.movimentos_estoque from anon, authenticated;
grant select (id, petshop_id, produto_id, tipo, quantidade, motivo, origem, criado_por, criado_em) on public.movimentos_estoque to authenticated;
revoke select on public.pacotes from anon, authenticated;
grant select (id, petshop_id, nome, servico_id, quantidade, validade_dias, ativo, criado_em) on public.pacotes to authenticated;
revoke select on public.pacotes_clientes from anon, authenticated;
grant select (id, petshop_id, pet_id, pacote_id, nome, servico_id, total, usados, comprado_em, vence_em, ativo, criado_em) on public.pacotes_clientes to authenticated;
revoke select on public.profissionais from anon, authenticated;
grant select (id, petshop_id, user_id, nome, papel, ve_financeiro, cor, escala, atende, ativo, criado_em, funcao, acessos) on public.profissionais to authenticated;

-- Custo de cada produto: quem cuida do estoque ou vê o financeiro.
create function public.custos_dos_produtos(p uuid) returns table (id uuid, custo numeric)
language sql stable security definer set search_path = '' as $$
  select x.id, x.custo from public.produtos x
  where x.petshop_id = p and (select public.tenho_area(p, array['estoque', 'financeiro', 'relatorios']))
$$;
create function public.custos_dos_movimentos(p_produto uuid) returns table (id uuid, custo_unitario numeric)
language sql stable security definer set search_path = '' as $$
  select m.id, m.custo_unitario from public.movimentos_estoque m
  where m.produto_id = p_produto and (select public.tenho_area(m.petshop_id, array['estoque', 'financeiro', 'relatorios']))
$$;
-- Preço dos pacotes (modelos e vendidos): quem vende pacote ou vê o financeiro.
create function public.precos_dos_pacotes(p uuid) returns table (id uuid, preco numeric, vendido boolean)
language sql stable security definer set search_path = '' as $$
  select x.id, x.preco, false from public.pacotes x
    where x.petshop_id = p and (select public.tenho_area(p, array['pacotes', 'financeiro', 'relatorios']))
  union all
  select x.id, x.preco, true from public.pacotes_clientes x
    where x.petshop_id = p and (select public.tenho_area(p, array['pacotes', 'financeiro', 'relatorios']))
$$;
-- Comissão: dono e quem vê relatórios. E-mail do convite: só o dono. Cada um vê a própria linha.
create function public.equipe_reservado(p uuid) returns table (id uuid, comissao_pct numeric, email_convite text)
language sql stable security definer set search_path = '' as $$
  select x.id,
    case when (select public.sou_dono(p)) or (select public.tenho_area(p, array['relatorios', 'financeiro'])) or x.user_id = (select auth.uid()) then x.comissao_pct else null end,
    case when (select public.sou_dono(p)) or x.user_id = (select auth.uid()) then x.email_convite else null end
  from public.profissionais x
  where x.petshop_id = p and p in (select public.meus_petshops())
$$;
revoke execute on function public.custos_dos_produtos(uuid), public.custos_dos_movimentos(uuid), public.precos_dos_pacotes(uuid), public.equipe_reservado(uuid) from public, anon;
grant execute on function public.custos_dos_produtos(uuid), public.custos_dos_movimentos(uuid), public.precos_dos_pacotes(uuid), public.equipe_reservado(uuid) to authenticated;

-- ---------- gravar exige a área ----------
-- Produtos: só quem cuida do estoque cria, altera e apaga (a baixa da venda é feita pelo gatilho do movimento).
drop policy produtos_criar on public.produtos;
drop policy produtos_editar on public.produtos;
drop policy produtos_remover on public.produtos;
create policy produtos_criar on public.produtos for insert to authenticated
  with check ((select public.tenho_area(petshop_id, array['estoque'])) and (select public.acesso_liberado(petshop_id)));
create policy produtos_editar on public.produtos for update to authenticated
  using ((select public.tenho_area(petshop_id, array['estoque'])) and (select public.acesso_liberado(petshop_id)))
  with check (petshop_id in (select public.meus_petshops()));
create policy produtos_remover on public.produtos for delete to authenticated
  using ((select public.tenho_area(petshop_id, array['estoque'])) and (select public.acesso_liberado(petshop_id)));

-- Movimentos de estoque: quem cuida do estoque, e quem vende (agenda e caixa dão baixa na venda). Apagar: só estoque.
drop policy movimentos_estoque_criar on public.movimentos_estoque;
drop policy movimentos_estoque_editar on public.movimentos_estoque;
drop policy movimentos_estoque_remover on public.movimentos_estoque;
create policy movimentos_estoque_criar on public.movimentos_estoque for insert to authenticated
  with check ((select public.tenho_area(petshop_id, array['estoque', 'agenda', 'caixa', 'financeiro'])) and (select public.acesso_liberado(petshop_id)));
create policy movimentos_estoque_editar on public.movimentos_estoque for update to authenticated
  using ((select public.tenho_area(petshop_id, array['estoque'])) and (select public.acesso_liberado(petshop_id)))
  with check (petshop_id in (select public.meus_petshops()));
create policy movimentos_estoque_remover on public.movimentos_estoque for delete to authenticated
  using ((select public.tenho_area(petshop_id, array['estoque'])) and (select public.acesso_liberado(petshop_id)));

-- Modelos de pacote: só quem cuida de pacotes.
drop policy pacotes_criar on public.pacotes;
drop policy pacotes_editar on public.pacotes;
drop policy pacotes_remover on public.pacotes;
create policy pacotes_criar on public.pacotes for insert to authenticated
  with check ((select public.tenho_area(petshop_id, array['pacotes'])) and (select public.acesso_liberado(petshop_id)));
create policy pacotes_editar on public.pacotes for update to authenticated
  using ((select public.tenho_area(petshop_id, array['pacotes'])) and (select public.acesso_liberado(petshop_id)))
  with check (petshop_id in (select public.meus_petshops()));
create policy pacotes_remover on public.pacotes for delete to authenticated
  using ((select public.tenho_area(petshop_id, array['pacotes'])) and (select public.acesso_liberado(petshop_id)));

-- Pacotes vendidos: vender e apagar é de quem cuida de pacotes; dar baixa num uso também vale para agenda e creche.
drop policy pacotes_clientes_criar on public.pacotes_clientes;
drop policy pacotes_clientes_editar on public.pacotes_clientes;
drop policy pacotes_clientes_remover on public.pacotes_clientes;
create policy pacotes_clientes_criar on public.pacotes_clientes for insert to authenticated
  with check ((select public.tenho_area(petshop_id, array['pacotes'])) and (select public.acesso_liberado(petshop_id)));
create policy pacotes_clientes_editar on public.pacotes_clientes for update to authenticated
  using ((select public.tenho_area(petshop_id, array['pacotes', 'agenda', 'creche_hotel'])) and (select public.acesso_liberado(petshop_id)))
  with check (petshop_id in (select public.meus_petshops()));
create policy pacotes_clientes_remover on public.pacotes_clientes for delete to authenticated
  using ((select public.tenho_area(petshop_id, array['pacotes'])) and (select public.acesso_liberado(petshop_id)));

-- Estadias: só quem cuida de creche e hotel. (O pedido aceito pelo link entra pela função pedido_aceitar.)
drop policy estadias_criar on public.estadias;
drop policy estadias_editar on public.estadias;
drop policy estadias_remover on public.estadias;
create policy estadias_criar on public.estadias for insert to authenticated
  with check ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)));
create policy estadias_editar on public.estadias for update to authenticated
  using ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)))
  with check (petshop_id in (select public.meus_petshops()));
create policy estadias_remover on public.estadias for delete to authenticated
  using ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)));

-- Serviços e preços: só o dono (a tela Meu pet shop já é só dele).
drop policy servicos_criar on public.servicos;
drop policy servicos_editar on public.servicos;
drop policy servicos_remover on public.servicos;
create policy servicos_criar on public.servicos for insert to authenticated
  with check ((select public.sou_dono(petshop_id)) and (select public.acesso_liberado(petshop_id)));
create policy servicos_editar on public.servicos for update to authenticated
  using ((select public.sou_dono(petshop_id)) and (select public.acesso_liberado(petshop_id)))
  with check (petshop_id in (select public.meus_petshops()));
create policy servicos_remover on public.servicos for delete to authenticated
  using ((select public.sou_dono(petshop_id)) and (select public.acesso_liberado(petshop_id)));
