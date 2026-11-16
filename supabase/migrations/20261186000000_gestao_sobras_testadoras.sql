-- Sobras das testadoras (Neide): dívida trazida do caderno com a data de quando começou.
--
-- `lancamentos.devido_desde` (opcional): numa conta a receber anotada à mão ("Anotar o que X deve"), o dia em que o cliente
-- passou a dever, quando é antes de hoje (a página "quem me deve" do caderno). Serve só para mostrar "desde <dia>" e ordenar.
-- Não muda nenhuma regra de dinheiro: a conta continua sendo um valor a receber, com `data` = vencimento como sempre, e o
-- dinheiro só entra no caixa e no faturamento no dia em que for recebido. Não entra em relatório nem em caixa de dia nenhum.
--
-- Regras no banco: só em entrada ainda não paga quando anotada (depois de recebida a data fica, como histórico), não depois de
-- hoje (com a mesma folga de fuso das regras do caixa: um dia) e não antes de 2000.
--
-- Aditiva: coluna nova, nula, sem valor padrão; a tabela não tem permissão por coluna (o grant da tabela já cobre). O código de
-- hoje continua igual (não lê nem grava a coluna). Pode rodar de novo.

alter table public.lancamentos add column if not exists devido_desde date;

do $$ begin
  alter table public.lancamentos add constraint lancamentos_devido_desde_check
    check (devido_desde is null or (tipo = 'entrada' and devido_desde >= date '2000-01-01'));
exception when duplicate_object then null; end $$;

create or replace function public.lancamentos_devido_desde_conferir()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.devido_desde is null then return new; end if;
  if tg_op = 'UPDATE' and new.devido_desde is not distinct from old.devido_desde then return new; end if;
  if new.pago then
    raise exception 'A data de quando o cliente passou a dever vale só para conta a receber.';
  end if;
  if new.devido_desde > current_date + 1 then
    raise exception 'A data de quando o cliente passou a dever não pode ser depois de hoje.';
  end if;
  return new;
end $$;

drop trigger if exists devido_desde_conferir on public.lancamentos;
create trigger devido_desde_conferir before insert or update of devido_desde on public.lancamentos
  for each row execute function public.lancamentos_devido_desde_conferir();
