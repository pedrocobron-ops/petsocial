-- Quadro de atendimento (banho e tosa) e táxi pet (leva e traz).
--
-- Só entram objetos novos e uma troca de função (opcoes_sem_valores, que ganha a chave da taxa de leva e traz):
--   · tabelas quadro_atendimento e leva_traz_viagens (só leitura pela regra; gravar só pelas funções);
--   · funções quadro_mover e leva_traz_marcar (security definer, área Agenda, conta liberada, dois toques = um);
--   · gatilho quadro_status_mudou em agendamentos (AFTER UPDATE OF status): anota a hora da chegada e limpa o quadro.
-- agendamentos não ganha coluna nem muda de regra: o status continua com o mesmo sentido de sempre
-- (marcado, confirmado, em_atendimento, concluido, faltou, cancelado). O quadro é uma linha à parte por horário.
--
-- 1. Quadro: as colunas saem do status + a etapa guardada aqui.
--      Esperando           status marcado ou confirmado (do dia)
--      No banho            em_atendimento sem etapa, ou etapa 'banho'
--      Secando / tosa      etapa 'secagem' ou 'tosa'
--      Pronto para buscar  etapa 'pronto' e ainda não entregue (em_atendimento, ou concluido = conta já fechada)
--      Entregue            entregue_em preenchido, ou concluido sem passar pelo quadro (quem não usa o quadro não vê nada mudar)
--    O quadro nunca conclui nem cobra: "Fechar a conta" continua no horário, como sempre. Mover para uma etapa com o pet ainda
--    marcado ou confirmado é o mesmo "Chegou: iniciar atendimento" (status em_atendimento). Voltar para Esperando devolve o status
--    de antes (marcado ou confirmado). O "Avisar que terminou" continua gravando agendamentos.pronto_avisado_em como antes.
-- 2. Leva e traz: agendamentos.leva_traz e endereco_leva_traz já existem. Cada horário com leva e traz tem duas viagens:
--    'buscar' (na casa do tutor, antes) e 'levar' (de volta, depois). leva_traz_marcar grava a hora em que foi feita
--    (ou desfaz). Levar de volta também marca o pet como entregue no quadro.
-- 3. Taxa de leva e traz: petshops.opcoes "taxi.taxa" = { modo: 'fixo' | 'bairro', valor: número, bairros: [{ nome, valor }] }.
--    Gravada pelo dono (petshop_salvar_opcoes). Só aparece como sugestão em Fechar a conta: nenhum preço muda sozinho.
--    Quem não recebe (sem Caixa, Financeiro nem Relatórios) não lê a chave (opcoes_sem_valores).
-- Nada aqui guarda dado novo do tutor: só horas (chegada, etapa, entregue, buscado, levado) e quem marcou.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Quadro de atendimento
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.quadro_atendimento (
  agendamento_id uuid primary key,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  etapa text check (etapa in ('banho', 'secagem', 'tosa', 'pronto')),
  etapa_em timestamptz,
  chegou_em timestamptz,
  status_antes text check (status_antes in ('marcado', 'confirmado')),
  entregue_em timestamptz,
  atualizado_por uuid references auth.users (id) on delete set null,
  atualizado_em timestamptz not null default now(),
  foreign key (agendamento_id, petshop_id) references public.agendamentos (id, petshop_id) on delete cascade
);
create index if not exists quadro_atendimento_petshop on public.quadro_atendimento (petshop_id, atualizado_em desc);

alter table public.quadro_atendimento enable row level security;
revoke all on public.quadro_atendimento from public, anon, authenticated;
grant select on public.quadro_atendimento to authenticated;
drop policy if exists quadro_atendimento_ler on public.quadro_atendimento;
create policy quadro_atendimento_ler on public.quadro_atendimento for select to authenticated
  using (petshop_id in (select public.meus_petshops()) and (select public.tenho_area(petshop_id, array['agenda'])));

-- A chegada pode vir por qualquer tela (Agenda "Chegou", Mozart, o próprio quadro): o gatilho anota a hora uma vez.
-- Voltou para marcado, confirmado, cancelado ou faltou: o quadro daquele horário é apagado.
-- Nunca derruba a mudança de status (o quadro é só um apoio): um erro aqui vira aviso no log do banco.
create or replace function public.quadro_status_mudou() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  begin
    if new.status = 'em_atendimento' and old.status in ('marcado', 'confirmado') then
      insert into public.quadro_atendimento as q (agendamento_id, petshop_id, chegou_em, status_antes, atualizado_por)
      values (new.id, new.petshop_id, now(), old.status::text, (select auth.uid()))
      on conflict (agendamento_id) do update
        set chegou_em = coalesce(q.chegou_em, excluded.chegou_em), status_antes = coalesce(q.status_antes, excluded.status_antes);
    elsif new.status in ('marcado', 'confirmado', 'cancelado', 'faltou') then
      delete from public.quadro_atendimento q where q.agendamento_id = new.id;
    end if;
  exception when others then
    raise warning 'quadro_status_mudou: %', sqlerrm;
  end;
  return null;
end $$;
revoke all on function public.quadro_status_mudou() from public, anon, authenticated;

drop trigger if exists quadro_status_mudou on public.agendamentos;
create trigger quadro_status_mudou after update of status on public.agendamentos
  for each row when (old.status is distinct from new.status) execute function public.quadro_status_mudou();

-- Move um pet no quadro. p_para: 'esperando', 'banho', 'secagem', 'tosa', 'pronto' ou 'entregue'.
-- Dois toques (ou duas pessoas) com o mesmo destino: o segundo não muda nada (a hora da etapa fica a do primeiro).
-- Devolve { status, etapa, etapa_em, chegou_em, entregue_em }.
create or replace function public.quadro_mover(p_petshop uuid, p_agendamento uuid, p_para text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a record;
  q public.quadro_atendimento;
  v_fuso text;
  v_hoje date;
begin
  if not public.tenho_area(p_petshop, array['agenda']) then raise exception 'Sem acesso à agenda.'; end if;
  if not public.acesso_liberado(p_petshop) then raise exception 'A conta está só para consulta.'; end if;
  if p_para is null or p_para not in ('esperando', 'banho', 'secagem', 'tosa', 'pronto', 'entregue') then
    raise exception 'Etapa inválida.';
  end if;

  select g.id, g.status, g.inicio into a from public.agendamentos g
   where g.id = p_agendamento and g.petshop_id = p_petshop for update;
  if a.id is null then raise exception 'Horário não encontrado.'; end if;
  if a.status in ('cancelado', 'faltou') then raise exception 'Este horário foi desmarcado ou ficou como falta.'; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p_petshop;
  v_hoje := (now() at time zone v_fuso)::date;
  if (a.inicio at time zone v_fuso)::date > v_hoje then raise exception 'O quadro é só para os horários de hoje.'; end if;

  select * into q from public.quadro_atendimento x where x.agendamento_id = p_agendamento for update;

  if p_para = 'esperando' then
    if a.status = 'concluido' then raise exception 'A conta deste atendimento já foi fechada: ele não volta para Esperando.'; end if;
    if a.status = 'em_atendimento' then
      -- o gatilho apaga a linha do quadro
      update public.agendamentos g set status = coalesce(q.status_antes, 'confirmado')::public.status_agendamento where g.id = p_agendamento;
    end if;
    delete from public.quadro_atendimento x where x.agendamento_id = p_agendamento;
    return jsonb_build_object('status', coalesce(q.status_antes, case when a.status = 'em_atendimento' then 'confirmado' else a.status::text end),
                              'etapa', null, 'etapa_em', null, 'chegou_em', null, 'entregue_em', null);
  end if;

  if p_para = 'entregue' then
    if a.status in ('marcado', 'confirmado') then raise exception 'O pet ainda não chegou.'; end if;
    insert into public.quadro_atendimento as x (agendamento_id, petshop_id, etapa, etapa_em, entregue_em, atualizado_por)
    values (p_agendamento, p_petshop, 'pronto', now(), now(), (select auth.uid()))
    on conflict (agendamento_id) do update
      set entregue_em = coalesce(x.entregue_em, excluded.entregue_em),
          etapa = coalesce(x.etapa, excluded.etapa), etapa_em = coalesce(x.etapa_em, excluded.etapa_em),
          atualizado_por = case when x.entregue_em is null then excluded.atualizado_por else x.atualizado_por end,
          atualizado_em = case when x.entregue_em is null then now() else x.atualizado_em end
    returning * into q;
  else
    -- chegou agora: o mesmo "Chegou: iniciar atendimento" da Agenda (o gatilho anota a hora e o status de antes)
    if a.status in ('marcado', 'confirmado') then
      update public.agendamentos g set status = 'em_atendimento' where g.id = p_agendamento;
      a.status := 'em_atendimento';
    end if;
    -- sem linha aqui, o pet já estava em atendimento antes (o gatilho não viu a chegada): a hora da chegada fica em branco
    insert into public.quadro_atendimento as x (agendamento_id, petshop_id, etapa, etapa_em, chegou_em, atualizado_por)
    values (p_agendamento, p_petshop, p_para, now(), null, (select auth.uid()))
    on conflict (agendamento_id) do update
      set etapa_em = case when x.etapa is distinct from excluded.etapa or x.entregue_em is not null then now() else x.etapa_em end,
          atualizado_por = case when x.etapa is distinct from excluded.etapa or x.entregue_em is not null then excluded.atualizado_por else x.atualizado_por end,
          atualizado_em = case when x.etapa is distinct from excluded.etapa or x.entregue_em is not null then now() else x.atualizado_em end,
          etapa = excluded.etapa,
          entregue_em = null,
          chegou_em = coalesce(x.chegou_em, excluded.chegou_em)
    returning * into q;
  end if;

  return jsonb_build_object('status', a.status::text, 'etapa', q.etapa, 'etapa_em', q.etapa_em, 'chegou_em', q.chegou_em, 'entregue_em', q.entregue_em);
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Leva e traz: as viagens de cada horário
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.leva_traz_viagens (
  agendamento_id uuid not null,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  perna text not null check (perna in ('buscar', 'levar')),
  feito_em timestamptz not null default now(),
  feito_por uuid references auth.users (id) on delete set null,
  primary key (agendamento_id, perna),
  foreign key (agendamento_id, petshop_id) references public.agendamentos (id, petshop_id) on delete cascade
);
create index if not exists leva_traz_viagens_petshop on public.leva_traz_viagens (petshop_id, feito_em desc);

alter table public.leva_traz_viagens enable row level security;
revoke all on public.leva_traz_viagens from public, anon, authenticated;
grant select on public.leva_traz_viagens to authenticated;
drop policy if exists leva_traz_viagens_ler on public.leva_traz_viagens;
create policy leva_traz_viagens_ler on public.leva_traz_viagens for select to authenticated
  using (petshop_id in (select public.meus_petshops()) and (select public.tenho_area(petshop_id, array['agenda'])));

-- Marca (p_feito true) ou desfaz (false) a viagem 'buscar' ou 'levar' de um horário com leva e traz.
-- Dois toques: a hora fica a do primeiro. Levar de volta também deixa o pet como entregue no quadro.
-- Devolve { perna, feito_em } (feito_em nulo depois de desfazer).
create or replace function public.leva_traz_marcar(p_petshop uuid, p_agendamento uuid, p_perna text, p_feito boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a record;
  v public.leva_traz_viagens;
begin
  if not public.tenho_area(p_petshop, array['agenda']) then raise exception 'Sem acesso à agenda.'; end if;
  if not public.acesso_liberado(p_petshop) then raise exception 'A conta está só para consulta.'; end if;
  if p_perna is null or p_perna not in ('buscar', 'levar') then raise exception 'Viagem inválida.'; end if;

  select g.id, g.status, g.leva_traz into a from public.agendamentos g
   where g.id = p_agendamento and g.petshop_id = p_petshop for update;
  if a.id is null then raise exception 'Horário não encontrado.'; end if;
  if not a.leva_traz then raise exception 'Este horário não tem leva e traz.'; end if;

  if not coalesce(p_feito, true) then
    delete from public.leva_traz_viagens x where x.agendamento_id = p_agendamento and x.perna = p_perna;
    if p_perna = 'levar' then
      update public.quadro_atendimento q set entregue_em = null, atualizado_por = (select auth.uid()), atualizado_em = now()
       where q.agendamento_id = p_agendamento and q.entregue_em is not null;
    end if;
    return jsonb_build_object('perna', p_perna, 'feito_em', null);
  end if;

  if a.status in ('cancelado', 'faltou') then raise exception 'Este horário foi desmarcado ou ficou como falta.'; end if;
  if p_perna = 'levar' and a.status in ('marcado', 'confirmado') then raise exception 'O pet ainda não chegou ao pet shop.'; end if;

  insert into public.leva_traz_viagens as x (agendamento_id, petshop_id, perna, feito_por)
  values (p_agendamento, p_petshop, p_perna, (select auth.uid()))
  on conflict (agendamento_id, perna) do nothing;
  select * into v from public.leva_traz_viagens x where x.agendamento_id = p_agendamento and x.perna = p_perna;

  if p_perna = 'levar' then
    insert into public.quadro_atendimento as q (agendamento_id, petshop_id, etapa, etapa_em, entregue_em, atualizado_por)
    values (p_agendamento, p_petshop, 'pronto', v.feito_em, v.feito_em, (select auth.uid()))
    on conflict (agendamento_id) do update set entregue_em = coalesce(q.entregue_em, excluded.entregue_em),
      etapa = coalesce(q.etapa, excluded.etapa), etapa_em = coalesce(q.etapa_em, excluded.etapa_em);
  end if;

  return jsonb_build_object('perna', v.perna, 'feito_em', v.feito_em);
end $$;

revoke all on function public.quadro_mover(uuid, uuid, text) from public, anon;
grant execute on function public.quadro_mover(uuid, uuid, text) to authenticated;
revoke all on function public.leva_traz_marcar(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.leva_traz_marcar(uuid, uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Taxa de leva e traz: fora das opções de quem não recebe
-- ---------------------------------------------------------------------------------------------------------------------
-- SUBSTITUI opcoes_sem_valores (última versão: 20261200, que tirou dinheiro.limite_fiado). Só acrescenta 'taxi.taxa'.
create or replace function public.opcoes_sem_valores(o jsonb)
returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(x.k, case
      when x.k in ('hotel.diaria_por_porte', 'hotel.temporadas', 'hotel.desconto_segundo_pet', 'hotel.taxas', 'creche.desconto_irmao')
        then jsonb_build_object('ativo', case when jsonb_typeof(x.v) = 'object' then coalesce(x.v -> 'ativo', 'false'::jsonb) else 'false'::jsonb end)
      else x.v end), '{}'::jsonb)
  from jsonb_each(coalesce(o, '{}'::jsonb)) as x(k, v)
  where x.k not in ('dinheiro.multa_fixa', 'dinheiro.multa_pct', 'dinheiro.juros_mes_pct', 'dinheiro.taxa_falta', 'creche.experiencia_preco',
                    'comissao.produtos_pct', 'dinheiro.limite_fiado', 'taxi.taxa')
$$;
