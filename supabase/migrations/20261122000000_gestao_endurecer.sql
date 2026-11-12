-- Correções achadas no teste com três perfis de cliente.

-- 1) Um recebimento por atendimento: duas pessoas fechando a mesma conta ao mesmo tempo não lançam em dobro.
create unique index lancamentos_um_por_atendimento on public.lancamentos (agendamento_id)
  where agendamento_id is not null and tipo = 'entrada';

-- 2) Caixa fechado não muda mais: o lançamento que entrou num caixa já fechado não pode ser apagado nem ter
--    valor, forma, tipo, data ou situação alterados. (Trocar descrição ou desligar de um cliente apagado continua valendo.)
create function public.travar_caixa_fechado() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.caixa_id is not null and exists (select 1 from public.caixas c where c.id = old.caixa_id and c.fechado_em is not null) then
    if tg_op = 'DELETE' then
      -- apagar o pet shop inteiro (ou o caixa) leva os lançamentos junto: isso segue valendo
      if not exists (select 1 from public.petshops p where p.id = old.petshop_id) then return old; end if;
      raise exception 'Este lançamento é de um caixa já fechado e não pode ser apagado. Se precisar corrigir, lance um ajuste.';
    end if;
    if new.valor is distinct from old.valor or new.tipo is distinct from old.tipo or new.forma is distinct from old.forma
       or new.data is distinct from old.data or new.pago is distinct from old.pago or new.caixa_id is distinct from old.caixa_id then
      raise exception 'Este lançamento é de um caixa já fechado e não pode ser alterado. Se precisar corrigir, lance um ajuste.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger travar_caixa_fechado before update or delete on public.lancamentos
  for each row execute function public.travar_caixa_fechado();

-- 3) Excluir cliente ou pet de vez leva o histórico junto: só o dono (e os sócios) pode.
drop policy clientes_remover on public.clientes;
create policy clientes_remover on public.clientes for delete to authenticated
  using ((select public.sou_dono(petshop_id)) and (select public.acesso_liberado(petshop_id)));
drop policy pets_remover on public.pets;
create policy pets_remover on public.pets for delete to authenticated
  using ((select public.sou_dono(petshop_id)) and (select public.acesso_liberado(petshop_id)));

-- 4) Creche e hotel: preço fixo da diária e número de vagas, e o mesmo pet não fica duas vezes "na casa".
alter table public.petshops
  add column diaria_creche numeric(10, 2) check (diaria_creche is null or diaria_creche >= 0),
  add column diaria_hotel numeric(10, 2) check (diaria_hotel is null or diaria_hotel >= 0),
  add column vagas_creche integer check (vagas_creche is null or vagas_creche between 1 and 500),
  add column vagas_hotel integer check (vagas_hotel is null or vagas_hotel between 1 and 500);
grant update (diaria_creche, diaria_hotel, vagas_creche, vagas_hotel) on public.petshops to authenticated;
create unique index estadias_um_na_casa on public.estadias (pet_id) where status = 'em_casa';

-- 5) Preço nunca negativo.
update public.servicos set preco_p = null where preco_p < 0;
update public.servicos set preco_m = null where preco_m < 0;
update public.servicos set preco_g = null where preco_g < 0;
update public.servicos set preco_gg = null where preco_gg < 0;
alter table public.servicos add constraint servicos_preco_positivo
  check (coalesce(preco_p, 0) >= 0 and coalesce(preco_m, 0) >= 0 and coalesce(preco_g, 0) >= 0 and coalesce(preco_gg, 0) >= 0);
update public.estadias set valor_diaria = null where valor_diaria < 0;
alter table public.estadias add constraint estadias_diaria_positiva check (valor_diaria is null or valor_diaria >= 0);
