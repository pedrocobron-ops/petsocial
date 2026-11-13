-- Integração: o sinal da reserva (hotel) junto com a conta recebida em partes (recebimentos).
-- O problema: o sinal "a receber" é uma conta comum. Quando o tutor pagava só uma parte dela (R$ 40 de R$ 100),
-- a reserva passava a dizer que o sinal era de R$ 60 (o que faltava), e no check-out só R$ 60 eram descontados:
-- os R$ 40 já recebidos eram cobrados de novo. Agora a reserva guarda as duas coisas:
--   sinal          = o valor combinado (o cheio: o que falta + o que já entrou em partes);
--   sinal_recebido = quanto desse sinal já foi recebido de verdade.
-- Tudo aqui é acréscimo (uma coluna com padrão e funções trocadas com a mesma assinatura): o aplicativo que está
-- no ar não usa nada disto e segue igual.

alter table public.estadias_valores
  add column if not exists sinal_recebido numeric(10, 2) not null default 0 check (sinal_recebido >= 0);

-- O quanto já entrou é sempre refeito pelo banco, venha a mudança de onde vier (tela da reserva, Financeiro, Caixa):
-- sinal pago = o sinal inteiro; sinal a receber = as partes já recebidas da conta dele.
create or replace function public.estadias_valores_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_petshop uuid;
begin
  select e.petshop_id into v_petshop from public.estadias e where e.id = new.estadia_id;
  if v_petshop is null then raise exception 'Estadia não encontrada.'; end if;
  new.petshop_id := v_petshop;
  new.atualizado_em := now();
  if new.sinal_estado = 'pago' then
    new.sinal_recebido := coalesce(new.sinal, 0);
  elsif new.sinal_estado = 'a_receber' then
    new.sinal_recebido := case when new.sinal_lancamento_id is null then 0
      else least(coalesce(new.sinal, 0), public.recebido_em_partes(new.sinal_lancamento_id)) end;
  elsif new.sinal_estado is null then
    new.sinal_recebido := 0;
  elsif tg_op = 'UPDATE' and (select auth.uid()) is not null then
    -- devolvido ou mantido: fica o que tinha entrado até ali (o aplicativo não escreve este campo)
    new.sinal_recebido := old.sinal_recebido;
  end if;
  return new;
end $$;

-- A conta do sinal mudou em outra tela (baixa inteira, parte recebida, valor corrigido, parte apagada, conta apagada):
-- a reserva acompanha, sempre com o valor cheio do sinal.
create or replace function public.estadias_sinal_do_lancamento() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_recebido numeric;
  v_hoje date;
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.petshops p where p.id = old.petshop_id) then return null; end if;
    -- conta do sinal apagada depois de ter parte recebida: o que entrou continua valendo como sinal pago
    -- (as partes seguem no financeiro como entradas comuns); sem parte recebida, a reserva fica sem sinal, como antes.
    v_recebido := coalesce(old.valor_original - old.valor, 0);
    if v_recebido > 0 then
      select (now() at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date into v_hoje from public.petshops s where s.id = old.petshop_id;
      update public.estadias_valores v set sinal = v_recebido, sinal_estado = 'pago', sinal_lancamento_id = null, sinal_pago_em = v_hoje, sinal_pagamento = null
        where v.sinal_lancamento_id = old.id and v.sinal_estado in ('a_receber', 'pago');
    else
      update public.estadias_valores v set sinal = null, sinal_estado = null, sinal_lancamento_id = null, sinal_pago_em = null, sinal_pagamento = null
        where v.sinal_lancamento_id = old.id and v.sinal_estado in ('a_receber', 'pago');
    end if;
    update public.estadias_valores v set sinal_devolucao_id = null, sinal_devolvido_em = null, sinal_estado = 'mantido'
      where v.sinal_devolucao_id = old.id and v.sinal_estado = 'devolvido';
    return null;
  end if;
  if new.pago is distinct from old.pago or new.valor is distinct from old.valor or new.valor_original is distinct from old.valor_original
     or new.data is distinct from old.data or new.forma is distinct from old.forma or new.pagamentos is distinct from old.pagamentos then
    update public.estadias_valores v set
        sinal = case when coalesce(new.valor_original, new.valor) > 0 then coalesce(new.valor_original, new.valor) else v.sinal end,
        sinal_estado = case when new.pago then 'pago' else 'a_receber' end,
        sinal_pago_em = case when new.pago then new.data else null end,
        sinal_pagamento = case when new.pago then jsonb_build_object('forma', new.forma, 'pagamentos', new.pagamentos) else null end
      where v.sinal_lancamento_id = new.id and v.sinal_estado in ('a_receber', 'pago');
  end if;
  return null;
end $$;

revoke execute on function public.estadias_valores_conferir(), public.estadias_sinal_do_lancamento() from public, anon, authenticated;

-- O que já está guardado: sinal pago vale inteiro; sinal a receber que teve parte recebida volta ao valor cheio
-- (o gatilho acima refaz o "já recebido" de cada linha tocada).
update public.estadias_valores v set sinal_recebido = v.sinal where v.sinal_estado = 'pago' and v.sinal is not null and v.sinal_recebido is distinct from v.sinal;
update public.estadias_valores v set sinal = coalesce(l.valor_original, l.valor), sinal_recebido = coalesce(l.valor_original - l.valor, 0)
  from public.lancamentos l
  where l.id = v.sinal_lancamento_id and v.sinal_estado = 'a_receber' and not l.pago and l.valor_original is not null;
update public.estadias_valores v set sinal = l.valor_original, sinal_recebido = l.valor_original
  from public.lancamentos l
  where l.id = v.sinal_lancamento_id and v.sinal_estado = 'pago' and l.pago and l.valor_original is not null and v.sinal is distinct from l.valor_original;

-- sinal devolvido, ou mantido depois de pago: ele tinha entrado inteiro
update public.estadias_valores v set sinal_recebido = v.sinal
  where v.sinal_estado in ('devolvido', 'mantido') and v.sinal_pago_em is not null and v.sinal is not null and v.sinal_recebido is distinct from v.sinal;

-- Comissão paga: se a despesa dela tem o valor corrigido no Financeiro, a marca de "paga" acompanha
-- (antes a pessoa via em Minha comissão o valor antigo). Apagar a despesa continua desfazendo a marca, como sempre.
create or replace function public.comissao_paga_acompanha() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.valor is distinct from old.valor and new.valor > 0 then
    update public.comissoes_pagas g set valor = new.valor where g.lancamento_id = new.id and g.valor is distinct from new.valor;
  end if;
  return null;
end $$;
drop trigger if exists comissao_paga_acompanha on public.lancamentos;
create trigger comissao_paga_acompanha after update of valor on public.lancamentos
  for each row when (old.tipo = 'saida') execute function public.comissao_paga_acompanha();
revoke execute on function public.comissao_paga_acompanha() from public, anon, authenticated;

notify pgrst, 'reload schema';
