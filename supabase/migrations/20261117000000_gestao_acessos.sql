-- Acesso por área e mais de um dono.
-- `acessos`: áreas que a pessoa abre no aplicativo (agenda, clientes, creche_hotel, pacotes, caixa, financeiro,
-- relatorios, estoque). Vazio (null) = o padrão do papel. Dono sempre abre tudo.
-- O dinheiro continua protegido no banco por `ve_financeiro` (a tela liga essa chave quando marca caixa, financeiro
-- ou relatórios); as outras áreas são organizadas pelo aplicativo.
alter table public.profissionais add column acessos text[]
  check (acessos is null or acessos <@ array['agenda', 'clientes', 'creche_hotel', 'pacotes', 'caixa', 'financeiro', 'relatorios', 'estoque']::text[]);
grant update (acessos) on public.profissionais to authenticated;

-- O titular (quem criou a conta: o dono mais antigo) não pode deixar de ser dono nem ser desativado,
-- nem por ele mesmo nem por outro dono. Assim a conta nunca fica sem responsável.
create function public.proteger_titular() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_titular uuid;
begin
  select id into v_titular from public.profissionais where petshop_id = old.petshop_id and papel = 'dono' order by criado_em, id limit 1;
  if old.id = v_titular then
    if tg_op = 'DELETE' then
      -- apagar o pet shop inteiro (cascata) continua permitido
      if exists (select 1 from public.petshops where id = old.petshop_id) then
        raise exception 'O titular da conta não pode ser removido.';
      end if;
      return old;
    end if;
    if new.papel <> 'dono' or not new.ativo then
      raise exception 'O titular da conta continua como dono. Para trocar o titular, fale com a nossa equipe.';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke execute on function public.proteger_titular() from public, anon, authenticated;

create trigger profissionais_titular before update of papel, ativo or delete on public.profissionais
  for each row execute function public.proteger_titular();
