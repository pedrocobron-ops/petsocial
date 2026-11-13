-- Fidelidade: o dono combina "a cada N atendimentos concluídos, o tutor ganha um prêmio".
-- A contagem é por tutor e vale a partir do dia em que o programa foi ligado (fidelidade_desde; vazio = desligado).

alter table public.petshops
  add column fidelidade_cada int check (fidelidade_cada between 2 and 50),
  add column fidelidade_premio text check (char_length(fidelidade_premio) <= 80),
  add column fidelidade_desde date,
  add constraint petshops_fidelidade_completa check (
    fidelidade_desde is null or (fidelidade_cada is not null and char_length(btrim(coalesce(fidelidade_premio, ''))) > 0));
-- A equipe lê; só o dono altera (a regra petshops_editar já confere o dono).
grant select (fidelidade_cada, fidelidade_premio, fidelidade_desde) on public.petshops to authenticated;
grant update (fidelidade_cada, fidelidade_premio, fidelidade_desde) on public.petshops to authenticated;

-- Cada prêmio entregue. Guarda o prêmio e quantos atendimentos ele consumiu, para a conta não mudar
-- se o dono trocar o prêmio ou o número depois.
create table public.fidelidade_resgates (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  cliente_id uuid not null,
  premio text not null check (char_length(premio) between 1 and 80),
  atendimentos int not null check (atendimentos between 2 and 50),
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  foreign key (cliente_id, petshop_id) references public.clientes (id, petshop_id) on delete cascade
);
create index on public.fidelidade_resgates (petshop_id, cliente_id);
alter table public.fidelidade_resgates enable row level security;

revoke all on public.fidelidade_resgates from anon, authenticated;
grant select, insert, delete on public.fidelidade_resgates to authenticated;

-- A equipe vê; entrega e desfaz quem atende no balcão (agenda, caixa ou clientes), com a conta liberada.
create policy fidelidade_resgates_ler on public.fidelidade_resgates for select to authenticated
  using (petshop_id in (select public.meus_petshops()));
create policy fidelidade_resgates_criar on public.fidelidade_resgates for insert to authenticated
  with check ((select public.tenho_area(petshop_id, array['agenda', 'caixa', 'clientes'])) and (select public.acesso_liberado(petshop_id))
    and criado_por is not distinct from (select auth.uid()));
create policy fidelidade_resgates_remover on public.fidelidade_resgates for delete to authenticated
  using ((select public.tenho_area(petshop_id, array['agenda', 'caixa', 'clientes'])) and (select public.acesso_liberado(petshop_id)));
