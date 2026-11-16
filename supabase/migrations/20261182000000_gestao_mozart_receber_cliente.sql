-- Receber o que um cliente deve, de uma vez (o Mozart e quem mais precisar): várias contas a receber do mesmo tutor,
-- da mais antiga para a mais nova, numa transação só, pelo mesmo motor das telas (operacao_tudo_ou_nada + receber_conta).
-- O que o cliente pagou a mais pode ficar de crédito para ele (lançamento pago + crédito do tutor, juntos).
-- Só acrescenta uma função: o app publicado hoje não usa e continua igual.

create or replace function public.cliente_receber_contas(p_petshop uuid, p_cliente uuid, p_chave text, p_passos jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  x jsonb;
  v_ok boolean;
  v_receber integer := 0;
begin
  if p_petshop is null or p_cliente is null or not public.tenho_area(p_petshop, array['caixa', 'financeiro', 'relatorios']) then
    raise exception 'Só quem mexe com dinheiro recebe as contas de um cliente.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_passos) is distinct from 'array' then raise exception 'Nada para gravar.'; end if;
  for x in select y from jsonb_array_elements(p_passos) y loop
    if x ->> 't' = 'receber' then
      v_receber := v_receber + 1;
      -- a conta é deste cliente, deste pet shop, e é a receber (o resto receber_conta confere)
      v_ok := null;
      select true into v_ok from public.lancamentos l
        where l.id = (x ->> 'conta')::uuid and l.petshop_id = p_petshop and l.cliente_id = p_cliente and l.tipo = 'entrada';
      if v_ok is distinct from true then raise exception 'Conta não encontrada para este cliente. Atualize e tente de novo.'; end if;
    elsif x ->> 't' = 'lancamento' then
      if (x -> 'linha' ->> 'cliente_id') is distinct from p_cliente::text or (x -> 'linha' ->> 'tipo') is distinct from 'entrada'
        or coalesce((x -> 'linha' ->> 'pago')::boolean, true) is not true then
        raise exception 'Esta operação só lança o que o próprio cliente pagou.';
      end if;
    elsif x ->> 't' = 'credito' then
      if (x ->> 'cliente') is distinct from p_cliente::text or coalesce((x ->> 'valor')::numeric, 0) <= 0 then
        raise exception 'Esta operação só deixa crédito para o próprio cliente.';
      end if;
    end if;
  end loop;
  if v_receber = 0 then raise exception 'Nenhuma conta para receber.'; end if;
  return public.operacao_tudo_ou_nada(p_petshop, p_chave, p_passos, array['receber', 'lancamento', 'credito']);
end $$;
revoke execute on function public.cliente_receber_contas(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.cliente_receber_contas(uuid, uuid, text, jsonb) to authenticated;
