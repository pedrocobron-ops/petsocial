-- Creche: consertos do teste em produção (Rafael).
-- Só acrescenta: uma tabela nova (estadias_horas_hist), duas funções novas e índices. Nenhuma função antiga muda,
-- nenhuma coluna antiga muda. O código de hoje (origin/main) segue igual: ele não chama nada daqui.
-- Pode rodar de novo sem erro (create ... if not exists / create or replace / drop policy if exists).
--
-- 1. Falta avisada com antecedência: o tutor avisa na segunda que o cão não vem na quinta. A falta fica anotada já com
--    "avisou" (vale para a regra de reposição, que só repõe depois do dia da falta) e a vaga do dia fica livre.
--    Não é pausa: o plano e a mensalidade não mudam.
-- 2. Corrigir a hora de chegada e de saída de um dia de creche (e de uma estadia de hotel): só o dono ou quem cuida do
--    financeiro, com o motivo anotado (estadias_horas_hist). A taxa de busca fora do horário de um mensalista é refeita
--    pela hora nova quando ainda não foi cobrada.
-- 3. Índices para Casa agora, Chamada e Mensalistas (as consultas filtram por pet shop + status, pet + dia e plano).

-- ============================================================
-- 1. Falta avisada para um dia que ainda vai chegar
-- ============================================================
create or replace function public.creche_falta_futura(p_plano uuid, p_dia date, p_marcar boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pl public.creche_planos;
  s public.petshops;
  v_pet public.pets;
  v_hoje date;
begin
  select * into pl from public.creche_planos where id = p_plano for update;
  if not found or not public.tenho_area(pl.petshop_id, array['creche_hotel']) then raise exception 'Plano não encontrado.'; end if;
  if not public.acesso_liberado(pl.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  select * into s from public.petshops where id = pl.petshop_id;
  select * into v_pet from public.pets where id = pl.pet_id;
  v_hoje := (now() at time zone s.fuso)::date;
  if p_dia is null or p_dia <= v_hoje then raise exception 'A falta de hoje ou de um dia que passou é marcada na chamada do dia.'; end if;
  if p_dia > v_hoje + 92 then raise exception 'Dá para anotar a falta avisada até 3 meses à frente.'; end if;
  if not coalesce(p_marcar, true) then
    delete from public.creche_faltas where pet_id = pl.pet_id and dia = p_dia and plano_id = pl.id;
    return jsonb_build_object('ok', true, 'desfeito', true);
  end if;
  if p_dia < pl.inicio or (pl.fim is not null and p_dia > pl.fim) then raise exception 'O plano de % não vale nesse dia.', v_pet.nome; end if;
  if not (extract(dow from p_dia)::smallint = any (pl.dias)) or not public.creche_abre(s.horario, p_dia) or public.dia_fechado(pl.petshop_id, p_dia) then
    raise exception 'Esse dia não é do plano de %: não precisa anotar falta.', v_pet.nome;
  end if;
  if pl.pausa_de is not null and p_dia between pl.pausa_de and pl.pausa_ate then
    raise exception 'O plano de % está em pausa nesse dia: não precisa anotar falta.', v_pet.nome;
  end if;
  if exists (select 1 from public.estadias e where e.pet_id = pl.pet_id and e.tipo = 'creche' and e.status <> 'cancelada'
             and coalesce(e.dia, (e.entrada at time zone s.fuso)::date) = p_dia) then
    raise exception '% já tem uma reserva de creche nesse dia. Cancele a reserva antes de anotar a falta.', v_pet.nome;
  end if;
  insert into public.creche_faltas (petshop_id, plano_id, pet_id, dia, avisou) values (pl.petshop_id, pl.id, pl.pet_id, p_dia, true)
    on conflict (pet_id, dia) do update set avisou = true;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.creche_falta_futura(uuid, date, boolean) from public, anon;
grant execute on function public.creche_falta_futura(uuid, date, boolean) to authenticated;

-- ============================================================
-- 2. Corrigir a hora de chegada e de saída
-- ============================================================
create table if not exists public.estadias_horas_hist (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  estadia_id uuid not null references public.estadias (id) on delete cascade,
  entrada_antes timestamptz,
  entrada_depois timestamptz,
  saida_antes timestamptz,
  saida_depois timestamptz,
  motivo text not null default '' check (char_length(motivo) <= 200),
  -- o que aconteceu com a taxa de busca fora do horário (sem valor): '', 'refeita', 'tirada', 'anotada', 'mantida'
  taxa text not null default '' check (char_length(taxa) <= 20),
  feito_por uuid default auth.uid() references auth.users (id) on delete set null,
  feito_em timestamptz not null default now()
);
create index if not exists estadias_horas_hist_estadia on public.estadias_horas_hist (estadia_id, feito_em desc);
alter table public.estadias_horas_hist enable row level security;
revoke all on public.estadias_horas_hist from anon, authenticated;
grant select on public.estadias_horas_hist to authenticated;
drop policy if exists estadias_horas_hist_ler on public.estadias_horas_hist;
create policy estadias_horas_hist_ler on public.estadias_horas_hist for select to authenticated
  using ((select public.tenho_area(petshop_id, array['creche_hotel'])));

-- p_entrada / p_saida: a hora nova (vazio = fica como está). Só para quem é dono ou cuida do financeiro.
-- Dia de creche: as horas ficam no mesmo dia. A saída só existe em estadia encerrada. Nada no futuro.
create or replace function public.estadia_corrigir_horas(p_estadia uuid, p_entrada timestamptz default null, p_saida timestamptz default null, p_motivo text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  e public.estadias;
  s public.petshops;
  v_pet text;
  v_entrada timestamptz;
  v_saida timestamptz;
  v_dia date;
  v_limite text;
  a public.creche_atrasos;
  v_cobrada boolean := false;
  v_taxa text := '';
begin
  select * into e from public.estadias where id = p_estadia for update;
  if not found or not public.tenho_area(e.petshop_id, array['creche_hotel']) then raise exception 'Estadia não encontrada.'; end if;
  if not (public.sou_dono(e.petshop_id) or public.cuido_do_financeiro(e.petshop_id)) then
    raise exception 'Só o dono ou quem cuida do financeiro corrige a hora de chegada ou de saída.';
  end if;
  if not public.acesso_liberado(e.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if e.status not in ('em_casa', 'encerrada') then raise exception 'Só dá para corrigir a hora de quem já chegou.'; end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 3 then raise exception 'Escreva o motivo da correção (fica anotado).'; end if;
  select * into s from public.petshops where id = e.petshop_id;
  select nome into v_pet from public.pets where id = e.pet_id;
  v_entrada := coalesce(p_entrada, e.entrada);
  v_saida := case when e.status = 'encerrada' then coalesce(p_saida, e.saida) else null end;
  if p_saida is not null and e.status <> 'encerrada' then raise exception '% ainda está na casa: a saída é marcada no Saiu.', v_pet; end if;
  if v_entrada > now() + interval '5 minutes' or (v_saida is not null and v_saida > now() + interval '5 minutes') then
    raise exception 'A hora não pode ficar no futuro.';
  end if;
  if v_saida is not null and v_saida <= v_entrada then raise exception 'A saída precisa ser depois da chegada.'; end if;
  if e.tipo = 'creche' then
    v_dia := coalesce(e.dia, (e.entrada at time zone s.fuso)::date);
    if (v_entrada at time zone s.fuso)::date <> v_dia or (v_saida is not null and (v_saida at time zone s.fuso)::date <> v_dia) then
      raise exception 'Num dia de creche, a chegada e a saída ficam no mesmo dia (%).', to_char(v_dia, 'DD/MM');
    end if;
  end if;
  if v_entrada = e.entrada and v_saida is not distinct from e.saida then return jsonb_build_object('ok', true, 'igual', true); end if;

  -- taxa de busca fora do horário (mensalista da creche): refeita pela hora nova enquanto não foi cobrada
  if e.tipo = 'creche' and e.status = 'encerrada' and v_saida is distinct from e.saida then
    select * into a from public.creche_atrasos where estadia_id = e.id for update;
    v_limite := public.creche_saida_atrasada(e.petshop_id, v_saida);
    if a.estadia_id is not null then
      v_cobrada := a.cobranca_id is not null or (a.estado = 'recebida' and a.lancamento_id is not null);
      if v_cobrada and v_limite is null then
        raise exception 'A taxa de busca fora do horário desta saída já foi cobrada. Para pôr a saída dentro do horário, antes cancele a cobrança do mês ou apague o recebimento da taxa no Financeiro.';
      end if;
      if v_cobrada then
        update public.creche_atrasos set saiu_em = v_saida where estadia_id = e.id; v_taxa := 'mantida';
      elsif v_limite is null then
        delete from public.creche_atrasos where estadia_id = e.id; v_taxa := 'tirada';
      else
        -- ainda fora do horário: volta para a decisão de quem recebe (cobrar ou não), com a hora nova
        update public.creche_atrasos set saiu_em = v_saida, limite = v_limite, estado = 'pendente', valor = null, decidido_por = null, decidido_em = null
          where estadia_id = e.id;
        v_taxa := 'refeita';
      end if;
    elsif v_limite is not null and e.plano_id is not null then
      insert into public.creche_atrasos (estadia_id, petshop_id, pet_id, plano_id, dia, saiu_em, limite)
        values (e.id, e.petshop_id, e.pet_id, e.plano_id, v_dia, v_saida, v_limite) on conflict (estadia_id) do nothing;
      v_taxa := 'anotada';
    end if;
  end if;

  perform set_config('maestro.creche', '1', true);
  update public.estadias set entrada = v_entrada, saida = v_saida where id = e.id;
  insert into public.estadias_horas_hist (petshop_id, estadia_id, entrada_antes, entrada_depois, saida_antes, saida_depois, motivo, taxa)
    values (e.petshop_id, e.id, e.entrada, v_entrada, e.saida, v_saida, left(btrim(p_motivo), 200), v_taxa);
  return jsonb_build_object('ok', true, 'taxa', v_taxa);
end $$;
revoke all on function public.estadia_corrigir_horas(uuid, timestamptz, timestamptz, text) from public, anon;
grant execute on function public.estadia_corrigir_horas(uuid, timestamptz, timestamptz, text) to authenticated;
