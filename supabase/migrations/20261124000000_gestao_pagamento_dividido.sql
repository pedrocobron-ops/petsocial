-- Pagamento dividido (parte Pix, parte dinheiro) e movimentos de gaveta (sangria e suprimento).

-- `pagamentos`: quando a conta foi paga com mais de uma forma, a lista [{ "forma": "pix", "valor": 30 }, { "forma": "dinheiro", "valor": 20 }].
-- A soma é igual a `valor`. Vazio (null) = pago inteiro com `forma`.
alter table public.lancamentos add column pagamentos jsonb check (pagamentos is null or jsonb_typeof(pagamentos) = 'array');

-- `movimento`: dinheiro que só entrou ou saiu da gaveta, sem ser venda nem despesa.
-- 'sangria' (tipo saida) = tirei dinheiro da gaveta; 'suprimento' (tipo entrada) = coloquei troco. Não entra no resultado do mês.
alter table public.lancamentos add column movimento text check (movimento in ('sangria', 'suprimento'));

create or replace function public.travar_caixa_fechado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.caixa_id is not null and exists (select 1 from public.caixas c where c.id = old.caixa_id and c.fechado_em is not null) then
    if tg_op = 'DELETE' then
      if not exists (select 1 from public.petshops p where p.id = old.petshop_id) then return old; end if;
      raise exception 'Este lançamento é de um caixa já fechado e não pode ser apagado. Se precisar corrigir, lance um ajuste.';
    end if;
    if new.valor is distinct from old.valor or new.tipo is distinct from old.tipo or new.forma is distinct from old.forma
       or new.data is distinct from old.data or new.pago is distinct from old.pago or new.caixa_id is distinct from old.caixa_id
       or new.pagamentos is distinct from old.pagamentos or new.movimento is distinct from old.movimento then
      raise exception 'Este lançamento é de um caixa já fechado e não pode ser alterado. Se precisar corrigir, lance um ajuste.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
