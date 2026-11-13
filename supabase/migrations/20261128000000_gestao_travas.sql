-- Travas achadas na segunda rodada de testes: caixa fechado de verdade, horário concluído protegido e limites de valor.

-- ---------- caixa fechado ----------
-- Um caixa fechado não reabre, não muda e não é apagado (a não ser junto com o pet shop inteiro).
create function public.travar_caixa() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.fechado_em is not null then
    if tg_op = 'DELETE' then
      if not exists (select 1 from public.petshops p where p.id = old.petshop_id) then return old; end if;
      raise exception 'Este caixa já foi fechado e não pode ser apagado.';
    end if;
    raise exception 'Este caixa já foi fechado e não pode ser alterado.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger travar_caixa before update or delete on public.caixas for each row execute function public.travar_caixa();

-- Lançamento de caixa fechado: só a descrição muda. Nada entra depois num caixa fechado.
-- (Quando um cliente ou um horário é apagado, o banco desliga o lançamento dele sozinho: isso continua valendo.)
create or replace function public.travar_caixa_fechado() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_direto boolean := pg_trigger_depth() = 1;
begin
  if tg_op = 'INSERT' then
    if new.caixa_id is not null and exists (select 1 from public.caixas c where c.id = new.caixa_id and c.fechado_em is not null) then
      raise exception 'Este caixa já foi fechado. Abra um caixa novo para lançar.';
    end if;
    -- quem lançou é sempre quem está logado
    if (select auth.uid()) is not null then new.criado_por := (select auth.uid()); end if;
    return new;
  end if;
  if old.caixa_id is not null and exists (select 1 from public.caixas c where c.id = old.caixa_id and c.fechado_em is not null) then
    if tg_op = 'DELETE' then
      if not exists (select 1 from public.petshops p where p.id = old.petshop_id) then return old; end if;
      raise exception 'Este lançamento é de um caixa já fechado e não pode ser apagado. Se precisar corrigir, lance um ajuste.';
    end if;
    if new.valor is distinct from old.valor or new.tipo is distinct from old.tipo or new.forma is distinct from old.forma
       or new.data is distinct from old.data or new.pago is distinct from old.pago or new.caixa_id is distinct from old.caixa_id
       or new.pagamentos is distinct from old.pagamentos or new.movimento is distinct from old.movimento
       or new.categoria is distinct from old.categoria or new.itens is distinct from old.itens
       or (v_direto and (new.agendamento_id is distinct from old.agendamento_id or new.cliente_id is distinct from old.cliente_id)) then
      raise exception 'Este lançamento é de um caixa já fechado e não pode ser alterado. Se precisar corrigir, lance um ajuste.';
    end if;
  elsif tg_op = 'UPDATE' and new.caixa_id is distinct from old.caixa_id and new.caixa_id is not null
        and exists (select 1 from public.caixas c where c.id = new.caixa_id and c.fechado_em is not null) then
    raise exception 'Este caixa já foi fechado. Abra um caixa novo para lançar.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger travar_caixa_fechado on public.lancamentos;
create trigger travar_caixa_fechado before insert or update or delete on public.lancamentos
  for each row execute function public.travar_caixa_fechado();

-- ---------- horário concluído ----------
-- Atendimento concluído mexe com comissão e relatório: só quem vê o financeiro (ou o dono) muda preço, profissional,
-- serviço, pet ou a situação dele, e só essa pessoa apaga.
create function public.proteger_concluido() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 or old.status <> 'concluido' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if (select public.vejo_financeiro(old.petshop_id)) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Este atendimento já foi concluído. Só quem cuida do financeiro pode apagar.';
  end if;
  if new.status is distinct from old.status or new.preco is distinct from old.preco or new.profissional_id is distinct from old.profissional_id
     or new.servico_id is distinct from old.servico_id or new.pet_id is distinct from old.pet_id or new.inicio is distinct from old.inicio then
    raise exception 'Este atendimento já foi concluído. Só quem cuida do financeiro pode alterar.';
  end if;
  return new;
end $$;
create trigger proteger_concluido before update or delete on public.agendamentos for each row execute function public.proteger_concluido();

-- Agenda: gravar exige a área (quem cuida de creche e de pacotes não mexe na agenda por fora).
drop policy agendamentos_criar on public.agendamentos;
drop policy agendamentos_editar on public.agendamentos;
drop policy agendamentos_remover on public.agendamentos;
create policy agendamentos_criar on public.agendamentos for insert to authenticated
  with check ((select public.tenho_area(petshop_id, array['agenda'])) and (select public.acesso_liberado(petshop_id)));
create policy agendamentos_editar on public.agendamentos for update to authenticated
  using ((select public.tenho_area(petshop_id, array['agenda', 'caixa', 'financeiro'])) and (select public.acesso_liberado(petshop_id)))
  with check (petshop_id in (select public.meus_petshops()));
create policy agendamentos_remover on public.agendamentos for delete to authenticated
  using ((select public.tenho_area(petshop_id, array['agenda'])) and (select public.acesso_liberado(petshop_id)));

-- ---------- limites de valor ----------
update public.pacotes set preco = 0 where preco < 0;
update public.pacotes_clientes set preco = 0 where preco < 0;
update public.produtos set preco_venda = null where preco_venda < 0;
update public.produtos set custo = null where custo < 0;
alter table public.pacotes add constraint pacotes_preco_positivo check (preco >= 0);
alter table public.pacotes_clientes add constraint pacotes_clientes_preco_positivo check (preco >= 0);
alter table public.produtos add constraint produtos_valores_positivos check (coalesce(preco_venda, 0) >= 0 and coalesce(custo, 0) >= 0);
