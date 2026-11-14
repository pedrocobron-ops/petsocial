-- Área principal do negócio: a que aparece primeiro no menu e na tela inicial.
-- Vazio (null) = sem área principal, tudo na ordem de sempre, como os pet shops de antes.
-- Pacotes não entra: é um jeito de vender, não uma área. Quando o pet shop marcou o que faz, a principal é uma das marcadas.
alter table public.petshops
  add column principal text
    constraint petshops_principal_check check (principal is null or principal in ('banho_tosa', 'creche', 'hotel', 'loja')),
  add constraint petshops_principal_nos_modulos check (principal is null or modulos is null or principal = any (modulos));
-- A equipe lê; só o dono altera (a regra petshops_editar já confere o dono).
grant select (principal) on public.petshops to authenticated;
grant update (principal) on public.petshops to authenticated;

-- Criar o pet shop já com a área principal.
-- O parâmetro novo tem padrão: a chamada de hoje, com os 6 nomes, segue funcionando e cria sem área principal, como antes.
-- Área principal que não vale (fora da lista ou fora do que foi marcado) entra vazia, em vez de impedir a criação.
drop function public.criar_petshop(text, text, text, text, text, text[]);
create function public.criar_petshop(p_nome text, p_seu_nome text, p_telefone text default null, p_cidade text default null, p_uf text default null,
  p_modulos text[] default null, p_principal text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_modulos text[];
  v_principal text;
begin
  if v_user is null then raise exception 'Faça login para continuar.'; end if;
  if (select count(*) from public.profissionais where user_id = v_user and papel = 'dono') >= 3 then
    raise exception 'Esta conta já tem o número máximo de pet shops.';
  end if;
  -- sem repetição e na ordem de sempre; lista vazia vale como "usa tudo"
  select array_agg(m order by array_position(array['banho_tosa', 'creche', 'hotel', 'loja', 'pacotes']::text[], m))
    into v_modulos from (select distinct unnest(p_modulos) as m) x where m is not null;
  if p_principal in ('banho_tosa', 'creche', 'hotel', 'loja') and (v_modulos is null or p_principal = any (v_modulos)) then
    v_principal := p_principal;
  end if;
  insert into public.petshops (nome, telefone, cidade, uf, criado_por, modulos, principal)
    values (trim(p_nome), nullif(trim(p_telefone), ''), nullif(trim(p_cidade), ''), nullif(upper(trim(p_uf)), ''), v_user, v_modulos, v_principal)
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
revoke execute on function public.criar_petshop(text, text, text, text, text, text[], text) from public, anon, authenticated;
grant execute on function public.criar_petshop(text, text, text, text, text, text[], text) to authenticated;

notify pgrst, 'reload schema';
