-- Ajustes achados no teste de volume (pet shop com milhares de produtos e movimentos).
-- Só acrescenta: pode ser aplicada antes de o aplicativo novo subir. O aplicativo antigo não usa esta função,
-- e o novo volta ao jeito antigo (um pedido por produto) se ela ainda não existir.

-- Custo unitário de todos os movimentos de estoque do pet shop numa consulta só.
-- A cópia de segurança pedia o custo produto por produto (custos_dos_movimentos): com 1.300 produtos eram 1.300 pedidos.
-- Mesma conferência de área das outras funções de custo: estoque, financeiro ou relatórios.
create or replace function public.custos_dos_movimentos_do_petshop(p uuid) returns table (id uuid, custo_unitario numeric)
language sql stable security definer set search_path = '' as $$
  select m.id, m.custo_unitario from public.movimentos_estoque m
  where m.petshop_id = p and (select public.tenho_area(p, array['estoque', 'financeiro', 'relatorios']))
$$;
revoke execute on function public.custos_dos_movimentos_do_petshop(uuid) from public, anon;
grant execute on function public.custos_dos_movimentos_do_petshop(uuid) to authenticated;
