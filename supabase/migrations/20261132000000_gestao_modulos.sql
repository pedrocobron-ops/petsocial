-- O que o negócio faz: banho e tosa, creche, hotel, venda de produtos (loja) e pacotes.
-- A escolha só mostra ou esconde telas e dicas; nada é apagado. Vazio (null) = usa tudo, como os pet shops de antes.
alter table public.petshops
  add column modulos text[] check (
    modulos is null
    or (cardinality(modulos) between 1 and 5 and modulos <@ array['banho_tosa', 'creche', 'hotel', 'loja', 'pacotes']::text[]));
-- A equipe lê; só o dono altera (a regra petshops_editar já confere o dono).
grant select (modulos) on public.petshops to authenticated;
grant update (modulos) on public.petshops to authenticated;

-- Criar o pet shop já com a escolha. Os serviços de banho e tosa só entram para quem faz banho e tosa.
-- O parâmetro novo tem padrão: a chamada antiga, com os 5 nomes, segue funcionando e cria tudo como antes.
drop function public.criar_petshop(text, text, text, text, text);
create function public.criar_petshop(p_nome text, p_seu_nome text, p_telefone text default null, p_cidade text default null, p_uf text default null,
  p_modulos text[] default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_modulos text[];
begin
  if v_user is null then raise exception 'Faça login para continuar.'; end if;
  if (select count(*) from public.profissionais where user_id = v_user and papel = 'dono') >= 3 then
    raise exception 'Esta conta já tem o número máximo de pet shops.';
  end if;
  -- sem repetição e na ordem de sempre; lista vazia vale como "usa tudo"
  select array_agg(m order by array_position(array['banho_tosa', 'creche', 'hotel', 'loja', 'pacotes']::text[], m))
    into v_modulos from (select distinct unnest(p_modulos) as m) x where m is not null;
  insert into public.petshops (nome, telefone, cidade, uf, criado_por, modulos)
    values (trim(p_nome), nullif(trim(p_telefone), ''), nullif(trim(p_cidade), ''), nullif(upper(trim(p_uf)), ''), v_user, v_modulos)
    returning id into v_id;
  insert into public.profissionais (petshop_id, user_id, nome, papel, ve_financeiro, cor)
    values (v_id, v_user, coalesce(nullif(trim(p_seu_nome), ''), 'Você'), 'dono', true, '#1e3a2f');
  if v_modulos is null or 'banho_tosa' = any (v_modulos) then
    insert into public.servicos (petshop_id, nome, categoria, duracao_min, cor, ordem) values
      (v_id, 'Banho', 'banho', 60, '#3b82a0', 1),
      (v_id, 'Banho e tosa', 'banho_tosa', 120, '#f97316', 2),
      (v_id, 'Tosa higiênica', 'tosa', 45, '#7c6fb0', 3),
      (v_id, 'Hidratação', 'outro', 30, '#4d8f6b', 4),
      (v_id, 'Corte de unhas', 'outro', 15, '#b0763f', 5);
  end if;
  return v_id;
end $$;
revoke execute on function public.criar_petshop(text, text, text, text, text, text[]) from public, anon, authenticated;
grant execute on function public.criar_petshop(text, text, text, text, text, text[]) to authenticated;

notify pgrst, 'reload schema';
