-- Rodada 8 (primeiro uso): o aviso de remarcação só aparece para horário que foi mesmo remarcado.
--
-- O banco anota sozinho quando o início de um horário muda (`agendamentos.remarcado_em`). A tela lê pela função
-- `agendamento_remarcado_em`, e não pela coluna, para não depender da lista de colunas liberadas de `agendamentos`
-- (migração 20261157, que pode ser aplicada depois desta e refaz essa lista).
--
-- Só acrescenta: coluna nova (vazia), gatilho novo e função nova. O código de hoje não lê a coluna e continua igual.

alter table public.agendamentos add column if not exists remarcado_em timestamptz;
grant select (remarcado_em) on public.agendamentos to authenticated;

create or replace function public.anotar_remarcacao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.inicio is distinct from old.inicio then
    new.remarcado_em := now();
  end if;
  return new;
end;
$$;

drop trigger if exists anotar_remarcacao on public.agendamentos;
create trigger anotar_remarcacao
  before update of inicio on public.agendamentos
  for each row execute function public.anotar_remarcacao();

-- quando o horário foi remarcado pela última vez (null = nunca), só para a equipe do pet shop
create or replace function public.agendamento_remarcado_em(p_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select a.remarcado_em from public.agendamentos a
  where a.id = p_id and a.petshop_id in (select public.meus_petshops());
$$;
revoke all on function public.agendamento_remarcado_em(uuid) from public, anon;
grant execute on function public.agendamento_remarcado_em(uuid) to authenticated;
