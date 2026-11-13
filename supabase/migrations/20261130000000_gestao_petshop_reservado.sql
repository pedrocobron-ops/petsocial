-- A meta do mês e os dados da assinatura na Cakto deixam de ser lidos direto da tabela do pet shop.
-- A meta sai pela função abaixo, só para quem vê o financeiro. Os dados da Cakto ficam só no painel do administrador.
create function public.petshop_reservado(p uuid) returns table (id uuid, meta_mes numeric)
language sql stable security definer set search_path = '' as $$
  select x.id, x.meta_mes from public.petshops x
  where x.id = p and (select public.vejo_financeiro(p))
$$;
revoke execute on function public.petshop_reservado(uuid) from public, anon;
grant execute on function public.petshop_reservado(uuid) to authenticated;

revoke select on public.petshops from anon, authenticated;
grant select (id, nome, telefone, cidade, uf, fuso, horario, status, plano, teste_ate, assinatura_desde, criado_por, criado_em, whatsapp,
  link_codigo, link_ativo, link_aviso, vagas, guia_feito_em, logo, tema, pago_ate, periodo_meses, diaria_creche, diaria_hotel,
  vagas_creche, vagas_hotel, link_creche, link_hotel) on public.petshops to authenticated;
