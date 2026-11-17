-- Sugestão de compra e etiquetas do estoque.
-- Só acrescenta: uma coluna nova em produtos ("vem em caixa de X") e a função que gera o código interno
-- (Code 128, "MP" + 6 números, um por produto, sem repetir no pet shop) para quem não tem código de barras na embalagem.

-- ---------- produtos: quantas unidades vêm na caixa do fornecedor ----------
-- A sugestão de compra arredonda para caixas inteiras quando o produto tem esse número.
alter table public.produtos
  add column if not exists embalagem_qtd numeric(10,3) check (embalagem_qtd is null or (embalagem_qtd > 0 and embalagem_qtd <= 100000));
-- produtos tem permissão por coluna: a coluna nova precisa ser liberada para leitura
grant select (embalagem_qtd) on public.produtos to authenticated;

-- ---------- código interno ----------
-- Dá um código a cada produto pedido que ainda não tem código de barras. Produto que já tem código fica como está.
-- Os números seguem o maior "MP" já usado no pet shop (também nos produtos fora da lista), um pedido de cada vez.
-- Só quem cuida do estoque, com o acesso liberado. Devolve o código de cada produto pedido.
create or replace function public.produtos_gerar_codigos(p_petshop uuid, p_produtos uuid[])
returns table (id uuid, codigo_barras text)
language plpgsql security definer set search_path = '' as $$
declare
  v_ultimo integer;
  v_id uuid;
begin
  if p_petshop is null or not (select public.tenho_area(p_petshop, array['estoque'])) then
    raise exception 'Só quem cuida do estoque gera código interno.' using errcode = '42501';
  end if;
  if not (select public.acesso_liberado(p_petshop)) then
    raise exception 'Conta só para consulta.' using errcode = '42501';
  end if;
  if coalesce(array_length(p_produtos, 1), 0) > 1000 then
    raise exception 'No máximo 1000 produtos por vez.';
  end if;
  -- um pedido por pet shop de cada vez: dois toques ao mesmo tempo não dão o mesmo número
  perform pg_advisory_xact_lock(hashtextextended('produtos_gerar_codigos:' || p_petshop::text, 0));
  select coalesce(max(substring(x.codigo_barras from 3)::integer), 0) into v_ultimo
    from public.produtos x where x.petshop_id = p_petshop and x.codigo_barras ~ '^MP[0-9]{6}$';
  for v_id in
    select x.id from public.produtos x
    where x.petshop_id = p_petshop and x.id = any (p_produtos) and x.ativo and x.codigo_barras is null
    order by x.nome, x.id
  loop
    v_ultimo := v_ultimo + 1;
    if v_ultimo > 999999 then raise exception 'Acabaram os códigos internos deste pet shop.'; end if;
    update public.produtos x set codigo_barras = 'MP' || lpad(v_ultimo::text, 6, '0') where x.id = v_id;
  end loop;
  return query select x.id, x.codigo_barras from public.produtos x where x.petshop_id = p_petshop and x.id = any (p_produtos);
end
$$;
revoke execute on function public.produtos_gerar_codigos(uuid, uuid[]) from public, anon;
grant execute on function public.produtos_gerar_codigos(uuid, uuid[]) to authenticated;
