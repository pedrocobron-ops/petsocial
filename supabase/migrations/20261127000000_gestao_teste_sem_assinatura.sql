-- Enquanto a assinatura não abriu (não existe link de pagamento), ninguém fica bloqueado por fim de teste:
-- a pessoa não teria como pagar. Quando os links entrarem, grava-se a chave 'assinatura_aberta' em config_interna
-- e o teste volta a valer pelo prazo.
create or replace function public.acesso_liberado(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.petshops
    where id = p and (
      status in ('ativa', 'atrasada', 'cortesia')
      or (status = 'teste' and (teste_ate > now() or not exists (select 1 from public.config_interna where chave = 'assinatura_aberta')))
      or (status = 'cancelada' and pago_ate > now())
    )
  )
$$;
