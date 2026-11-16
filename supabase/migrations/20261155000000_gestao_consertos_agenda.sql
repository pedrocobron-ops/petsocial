-- Maestro Pet Gestão — fuso do pet shop pela UF.
--
-- `petshops.fuso` nasce 'America/Sao_Paulo' e nenhuma tela o mudava. Para quem está no Acre, Amazonas, Roraima, Rondônia,
-- Mato Grosso ou Mato Grosso do Sul (1 ou 2 horas atrás de Brasília), o banco fazia as contas no horário errado:
--   - o link do cliente oferecia os horários do funcionamento na hora de Brasília (abre às 8h em Manaus, o link oferecia 7h);
--   - "hoje" no banco (chamada da creche, cobranças do mês, caixa, comissão) virava o dia seguinte uma ou duas horas
--     antes da meia-noite do pet shop.
-- Agora o fuso acompanha a UF: um gatilho acerta `fuso` quando o pet shop nasce com UF e quando a UF muda.
-- UF em branco não mexe em nada (continua 'America/Sao_Paulo', que serve para 21 estados e o DF).
--
-- Só acrescenta: duas funções, um gatilho e o acerto dos pet shops que já têm UF de fuso diferente.
-- O código de hoje não lê nem grava `fuso` (só o banco usa), então segue funcionando igual antes e depois.

create or replace function public.fuso_da_uf(p_uf text) returns text
language sql immutable set search_path = '' as $$
  select case upper(btrim(coalesce(p_uf, '')))
    when 'AC' then 'America/Rio_Branco'
    when 'AM' then 'America/Manaus'
    when 'RR' then 'America/Boa_Vista'
    when 'RO' then 'America/Porto_Velho'
    when 'MT' then 'America/Cuiaba'
    when 'MS' then 'America/Campo_Grande'
    when '' then null
    else 'America/Sao_Paulo'
  end
$$;

create or replace function public.petshops_fuso_da_uf() returns trigger
language plpgsql set search_path = '' as $$
begin
  -- só quando a UF chega ou muda, e só se ninguém escolheu o fuso nesta mesma gravação
  if new.uf is not null and btrim(new.uf) <> '' and (tg_op = 'INSERT' or new.uf is distinct from old.uf) then
    if tg_op = 'INSERT' or new.fuso is not distinct from old.fuso then
      new.fuso := coalesce(public.fuso_da_uf(new.uf), new.fuso);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists petshops_fuso_da_uf on public.petshops;
create trigger petshops_fuso_da_uf before insert or update of uf on public.petshops
  for each row execute function public.petshops_fuso_da_uf();

revoke execute on function public.fuso_da_uf(text), public.petshops_fuso_da_uf() from public, anon;
grant execute on function public.fuso_da_uf(text) to authenticated;

-- pet shops que já existem nesses estados e ainda estão no fuso de Brasília
update public.petshops set fuso = public.fuso_da_uf(uf)
  where uf is not null and upper(btrim(uf)) in ('AC', 'AM', 'RR', 'RO', 'MT', 'MS') and fuso = 'America/Sao_Paulo';
