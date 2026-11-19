-- Horário de cada serviço e da creche e do hotel.
--
-- O dono contou: "domingo o pet shop fecha, mas a creche e o hotel funcionam". Até aqui havia um horário só
-- (`petshops.horario`). Agora:
--   - `petshops.horario` continua sendo o horário do pet shop (e o padrão de tudo);
--   - `petshops.horario_creche` e `petshops.horario_hotel`: a janela de chegada e de busca em cada dia da semana.
--     null = igual ao pet shop;
--   - `servicos.horario`: o horário próprio de um serviço da agenda. null = segue o pet shop.
-- O formato é o mesmo de `petshops.horario` ({"0".."6": {"abre": "HH:MM", "fecha": "HH:MM"} | null}), sem almoço:
-- o almoço do pet shop vale para os serviços que seguem o horário do pet shop.
-- Quem muda: o mesmo de `petshops.horario` (a política petshops_editar e servicos_editar: só o dono).
--
-- 1. horario_valido: confere o formato (dias de 0 a 6, abre e fecha em HH:MM, fecha depois de abrir, ao menos um dia aberto).
-- 2. As colunas novas, com a conferência, e o acesso pelas colunas (como as outras de petshops e servicos).
-- 3. Creche: abre pelo horário da creche (ou, sem ele, pelo do pet shop): creche_chamada, creche_falta_futura,
--    creche_planos_ocupam, creche_reservar_extra, creche_sugestao_mensal, link_espera_pedir, link_estadia_cheios.
-- 4. gestao_base: + horario_creche e horario_hotel no pet shop e horario em cada serviço.
-- 5. link_info: + horario_creche e horario_hotel (já com o do pet shop quando não há) e o horário próprio de cada serviço.
-- 6. link_horarios: o horário de cada serviço escolhido (o principal e os outros); o horário livre precisa caber em todos.
-- 7. link_estadia_dia_recusado (nova): a chegada e a busca pelo horário da creche ou do hotel; link_hotel_dia_recusado
--    passa a chamar a nova com 'hotel'. link_pedir_com_termos chama a nova com o tipo do pedido.
--
-- Trocas (cópia fiel da definição mais recente, mais o que está dito):
--   creche_chamada (20261161), creche_falta_futura (20261183), creche_planos_ocupam (20261150),
--   creche_reservar_extra (20261153), creche_sugestao_mensal (20261167), link_espera_pedir (20261151),
--   link_estadia_cheios (20261145), gestao_base (20261235), link_info (20261235), link_horarios (20261239),
--   link_hotel_dia_recusado (20261168, vira a link_estadia_dia_recusado), link_pedir_com_termos (20261235).
-- O aplicativo que está no ar continua funcionando: sem as colunas novas preenchidas, tudo segue o horário do pet shop.

-- ---------- 1. o formato ----------
create or replace function public.horario_valido(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select p is not null and jsonb_typeof(p) = 'object'
    and not exists (select 1 from jsonb_object_keys(p) k where k !~ '^[0-6]$')
    and not exists (
      select 1 from jsonb_each(p) e
      where jsonb_typeof(e.value) <> 'null' and (
        jsonb_typeof(e.value) <> 'object'
        or exists (select 1 from jsonb_object_keys(e.value) c where c not in ('abre', 'fecha'))
        or coalesce(e.value ->> 'abre', '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
        or coalesce(e.value ->> 'fecha', '') !~ '^([01]\d|2[0-3]):[0-5]\d$'
        or e.value ->> 'fecha' <= e.value ->> 'abre'))
    and exists (select 1 from jsonb_each(p) e where jsonb_typeof(e.value) = 'object')
$$;

-- ---------- 2. as colunas ----------
alter table public.petshops
  add column if not exists horario_creche jsonb constraint petshops_horario_creche_ok check (horario_creche is null or public.horario_valido(horario_creche)),
  add column if not exists horario_hotel jsonb constraint petshops_horario_hotel_ok check (horario_hotel is null or public.horario_valido(horario_hotel));
alter table public.servicos
  add column if not exists horario jsonb constraint servicos_horario_ok check (horario is null or public.horario_valido(horario));

grant select (horario_creche, horario_hotel), update (horario_creche, horario_hotel) on public.petshops to authenticated;
grant select (horario) on public.servicos to authenticated;

-- ---------- 3. creche: o horário da creche ----------
CREATE OR REPLACE FUNCTION public.creche_chamada(p_plano uuid, p_dia date, p_acao text, p_avisou boolean DEFAULT false, p_forcar boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  pl public.creche_planos;
  s public.petshops;
  v_pet public.pets;
  v_e public.estadias;
  v_outra public.estadias;
  v_hoje date;
  v_do_plano boolean;
  v_vacinas text;
  v_falta boolean;
  v_limite text;
  v_reservada boolean;
  v_como text;
  v_conferir boolean := false;
  v_recebe boolean;
  v_repoe date;
  v_sem_falta boolean := false;
  v_livre boolean := p_acao = 'reposicao_livre';
  v_cabe boolean;
begin
  select * into pl from public.creche_planos where id = p_plano for update;
  if not found or not public.tenho_area(pl.petshop_id, array['creche_hotel']) then raise exception 'Plano não encontrado.'; end if;
  if not public.acesso_liberado(pl.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if p_acao not in ('chegou', 'extra', 'reposicao', 'reposicao_livre', 'saiu', 'faltou', 'desfazer') then raise exception 'Ação inválida.'; end if;
  v_recebe := public.sou_dono(pl.petshop_id) or public.cuido_do_financeiro(pl.petshop_id);
  if v_livre and not v_recebe then raise exception 'Só o dono ou quem cuida do financeiro libera uma reposição sem falta para repor.'; end if;
  if v_livre then p_acao := 'reposicao'; end if;
  select * into s from public.petshops where id = pl.petshop_id;
  select * into v_pet from public.pets where id = pl.pet_id;
  v_hoje := (now() at time zone s.fuso)::date;
  if p_dia is null or p_dia > v_hoje then raise exception 'Não dá para fazer a chamada de um dia que ainda não chegou.'; end if;
  -- dias passados: os deste mês (e a última semana, para o esquecimento da virada do mês)
  if p_dia < least(date_trunc('month', v_hoje)::date, v_hoje - 7) then raise exception 'A chamada só pode ser corrigida nos dias deste mês.'; end if;
  if p_dia < pl.inicio or (pl.fim is not null and p_dia > pl.fim) then raise exception 'O plano de % não vale nesse dia.', v_pet.nome; end if;
  -- dia do plano: dia da semana dele, fora da pausa, com o pet shop aberto e sem estar marcado como dia fechado
  v_do_plano := extract(dow from p_dia)::smallint = any (pl.dias) and public.creche_abre(coalesce(s.horario_creche, s.horario), p_dia) and not public.dia_fechado(pl.petshop_id, p_dia)
    and not (pl.pausa_de is not null and p_dia between pl.pausa_de and pl.pausa_ate);
  perform set_config('maestro.creche', '1', true);

  select * into v_e from public.estadias where pet_id = pl.pet_id and dia = p_dia and mensalista is not null and status <> 'cancelada';
  v_falta := exists (select 1 from public.creche_faltas where pet_id = pl.pet_id and dia = p_dia);
  -- dia extra reservado antes (a reserva ainda não virou presença)
  v_reservada := v_e.id is not null and v_e.status = 'reservada';

  if p_acao in ('chegou', 'extra', 'reposicao') then
    if v_e.id is not null and not v_reservada then return jsonb_build_object('ok', true, 'repetido', true, 'estadia', v_e.id); end if;
    if not v_reservada then
      if p_acao = 'chegou' and not v_do_plano then raise exception 'Esse dia não é do plano de %. Use "Veio fora do dia".', v_pet.nome; end if;
      if p_acao <> 'chegou' and v_do_plano then raise exception 'Esse dia já é do plano de %. Marque "Chegou" na chamada.', v_pet.nome; end if;
    end if;
    -- check-in avulso no mesmo dia (feito pelo formulário de sempre): não entra de novo
    select * into v_outra from public.estadias e where e.pet_id = pl.pet_id and e.status in ('reservada', 'em_casa', 'encerrada') and e.mensalista is null
      and e.tipo = 'creche' and (e.entrada at time zone s.fuso)::date = p_dia limit 1;
    if found then raise exception '% já tem uma estadia avulsa nesse dia. Veja em Casa agora ou no Histórico.', v_pet.nome; end if;
    v_como := case when p_acao = 'chegou' then (case when v_reservada then v_e.mensalista else 'plano' end) else p_acao end;
    -- reposição: precisa de uma falta para repor (pela regra do negócio). Sem falta, só quem recebe libera, e fica anotado.
    if v_como = 'reposicao' then
      select c.cabe, c.repoe into v_cabe, v_repoe from public.creche_reposicao_cabe(pl.id, p_dia) c;
      if not v_cabe then
        if not v_livre then
          raise exception using errcode = 'P0001', hint = 'sem_falta',
            message = format('%s não tem falta para repor%s. Marque como dia extra%s.', v_pet.nome,
              case coalesce(s.opcoes ->> 'creche.reposicao_prazo', '') when 'mes' then ' neste mês' when 'mes_seguinte' then ' dentro do prazo (até o fim do mês seguinte à falta)' else '' end,
              case when v_recebe then ' ou libere a reposição assim mesmo' else ' ou fale com o dono' end);
        end if;
        v_sem_falta := true;
      end if;
    end if;
    if s.creche_bloqueia_vacina and p_dia = v_hoje then
      v_vacinas := public.creche_vacinas_vencidas(pl.pet_id, v_hoje);
      if v_vacinas is not null and not (coalesce(p_forcar, false) and public.sou_dono(pl.petshop_id)) then
        raise exception 'VACINA_VENCIDA: %', v_vacinas;
      end if;
    end if;
    delete from public.creche_faltas where pet_id = pl.pet_id and dia = p_dia;
    if p_dia = v_hoje then
      select * into v_outra from public.estadias e where e.pet_id = pl.pet_id and e.status = 'em_casa' limit 1;
      if found then
        raise exception '% já está na casa desde %. Faça a saída antes de marcar a chegada de hoje.', v_pet.nome, to_char(v_outra.entrada at time zone s.fuso, 'DD/MM');
      end if;
      if v_reservada then
        update public.estadias set status = 'em_casa', entrada = now(), saida_prevista = null, mensalista = v_como where id = v_e.id returning * into v_e;
      else
        insert into public.estadias (petshop_id, pet_id, tipo, entrada, status, plano_id, mensalista, dia)
          values (pl.petshop_id, pl.pet_id, 'creche', now(), 'em_casa', pl.id, v_como, p_dia)
          returning * into v_e;
      end if;
    elsif v_reservada then
      update public.estadias set status = 'encerrada', saida = (p_dia::timestamp + time '18:00') at time zone s.fuso, saida_prevista = null, mensalista = v_como, diarias_cobradas = 1
        where id = v_e.id returning * into v_e;
    else
      -- dia que já passou: a presença entra encerrada, das 8h às 18h daquele dia
      insert into public.estadias (petshop_id, pet_id, tipo, entrada, saida, status, plano_id, mensalista, dia, diarias_cobradas)
        values (pl.petshop_id, pl.pet_id, 'creche', (p_dia::timestamp + time '08:00') at time zone s.fuso, (p_dia::timestamp + time '18:00') at time zone s.fuso,
          'encerrada', pl.id, v_como, p_dia, 1)
        returning * into v_e;
    end if;
    -- toda reposição fica anotada, com a falta que ela repõe. A de quem não recebe espera a conferência de quem recebe;
    -- a de quem recebe já entra aceita.
    if v_como = 'reposicao' then
      insert into public.creche_reposicoes (estadia_id, petshop_id, pet_id, plano_id, dia, marcado_por, estado, decidido_por, decidido_em, sem_falta, falta_dia)
        values (v_e.id, pl.petshop_id, pl.pet_id, pl.id, p_dia, (select auth.uid()),
          case when v_recebe then 'aceita' else 'pendente' end,
          case when v_recebe then (select auth.uid()) end, case when v_recebe then now() end, v_sem_falta, v_repoe)
        on conflict (estadia_id) do nothing;
      v_conferir := not v_recebe;
    end if;
    return jsonb_build_object('ok', true, 'estadia', v_e.id, 'conferir', v_conferir, 'repoe', v_repoe, 'sem_falta', v_sem_falta);
  end if;

  if p_acao = 'saiu' then
    if v_e.id is null or v_e.status <> 'em_casa' then return jsonb_build_object('ok', true, 'repetido', true); end if;
    update public.estadias set status = 'encerrada', saida = now(), diarias_cobradas = 1 where id = v_e.id;
    -- saiu depois do horário combinado (regra ligada em Meu pet shop): fica anotado para quem recebe decidir a taxa. Nada é cobrado aqui.
    v_limite := public.creche_saida_atrasada(pl.petshop_id, now());
    if v_limite is not null then
      insert into public.creche_atrasos (estadia_id, petshop_id, pet_id, plano_id, dia, saiu_em, limite)
        values (v_e.id, pl.petshop_id, pl.pet_id, pl.id, p_dia, now(), v_limite) on conflict (estadia_id) do nothing;
      return jsonb_build_object('ok', true, 'estadia', v_e.id, 'atraso', true);
    end if;
    return jsonb_build_object('ok', true, 'estadia', v_e.id);
  end if;

  if p_acao = 'faltou' then
    -- dia extra reservado e o pet não veio: a reserva é cancelada (não é falta: o dia não era do plano) e nada é cobrado
    if v_reservada then
      update public.estadias set status = 'cancelada' where id = v_e.id;
      return jsonb_build_object('ok', true, 'reserva', 'cancelada');
    end if;
    if v_e.id is not null then raise exception '% já está com presença nesse dia. Desfaça a presença antes de marcar a falta.', v_pet.nome; end if;
    if not v_do_plano then raise exception 'Esse dia não é do plano de %.', v_pet.nome; end if;
    insert into public.creche_faltas (petshop_id, plano_id, pet_id, dia, avisou) values (pl.petshop_id, pl.id, pl.pet_id, p_dia, coalesce(p_avisou, false))
      on conflict (pet_id, dia) do update set avisou = excluded.avisou;
    return jsonb_build_object('ok', true);
  end if;

  -- desfazer: a falta some; a saída de hoje volta para "na casa"; a chegada (ou a presença de um dia passado) é apagada
  if v_falta then
    delete from public.creche_faltas where pet_id = pl.pet_id and dia = p_dia;
    return jsonb_build_object('ok', true, 'desfeito', 'falta');
  end if;
  if v_e.id is null or v_reservada then return jsonb_build_object('ok', true, 'repetido', true); end if;
  if v_e.cobranca_id is not null then raise exception 'Esse dia extra já entrou numa cobrança. Cancele a cobrança antes de desfazer.'; end if;
  -- taxa de busca fora do horário desta saída: se já foi cobrada, a saída não se desfaz; se não, a anotação some junto
  if exists (select 1 from public.creche_atrasos a where a.estadia_id = v_e.id and (a.cobranca_id is not null or (a.estado = 'recebida' and a.lancamento_id is not null))) then
    raise exception 'A taxa de busca fora do horário desta saída já foi cobrada. Para desfazer a saída, antes cancele a cobrança do mês ou apague o recebimento da taxa no Financeiro.';
  end if;
  delete from public.creche_atrasos where estadia_id = v_e.id;
  if v_e.status = 'encerrada' and p_dia = v_hoje then
    if exists (select 1 from public.estadias e where e.pet_id = pl.pet_id and e.status = 'em_casa') then
      raise exception '% já está na casa em outra estadia.', v_pet.nome;
    end if;
    update public.estadias set status = 'em_casa', saida = null, diarias_cobradas = null, valor_cobrado = null where id = v_e.id;
    return jsonb_build_object('ok', true, 'desfeito', 'saida');
  end if;
  delete from public.estadias where id = v_e.id;
  return jsonb_build_object('ok', true, 'desfeito', 'presenca');
exception when unique_violation then
  -- outra pessoa marcou no mesmo instante
  return jsonb_build_object('ok', true, 'repetido', true);
end $function$;

CREATE OR REPLACE FUNCTION public.creche_falta_futura(p_plano uuid, p_dia date, p_marcar boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if not (extract(dow from p_dia)::smallint = any (pl.dias)) or not public.creche_abre(coalesce(s.horario_creche, s.horario), p_dia) or public.dia_fechado(pl.petshop_id, p_dia) then
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
end $function$;

CREATE OR REPLACE FUNCTION public.creche_planos_ocupam(p_petshop uuid, p_dia date, p_hoje date)
 RETURNS integer
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select count(*)::int
  from public.creche_planos pl
  join public.petshops s on s.id = pl.petshop_id
  join public.pets pt on pt.id = pl.pet_id and pt.ativo
  where pl.petshop_id = p_petshop and p_dia >= p_hoje
    and pl.inicio <= p_dia and (pl.fim is null or pl.fim >= p_dia)
    and not (pl.pausa_de is not null and p_dia between pl.pausa_de and pl.pausa_ate)
    and extract(dow from p_dia)::smallint = any (pl.dias)
    and public.creche_abre(coalesce(s.horario_creche, s.horario), p_dia)
    and not public.dia_fechado(pl.petshop_id, p_dia)
    and not exists (select 1 from public.creche_faltas f where f.pet_id = pl.pet_id and f.dia = p_dia)
    and not exists (
      select 1 from public.estadias e
      where e.pet_id = pl.pet_id and e.tipo = 'creche' and (
        (e.status in ('reservada', 'em_casa')
          and public.estadia_ocupa(e.tipo, e.status, (e.entrada at time zone s.fuso)::date, (e.saida_prevista at time zone s.fuso)::date, p_dia, p_hoje))
        or (e.status = 'encerrada' and coalesce(e.dia, (e.entrada at time zone s.fuso)::date) = p_dia)))
$function$;

CREATE OR REPLACE FUNCTION public.creche_reservar_extra(p_plano uuid, p_dia date, p_obs text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  pl public.creche_planos;
  s public.petshops;
  v_pet public.pets;
  v_hoje date;
  v_id uuid;
begin
  select * into pl from public.creche_planos where id = p_plano for update;
  if not found or not public.tenho_area(pl.petshop_id, array['creche_hotel']) then raise exception 'Plano não encontrado.'; end if;
  if not public.acesso_liberado(pl.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  select * into s from public.petshops where id = pl.petshop_id;
  select * into v_pet from public.pets where id = pl.pet_id;
  v_hoje := (now() at time zone s.fuso)::date;
  if p_dia is null or p_dia < v_hoje then raise exception 'Escolha um dia de hoje em diante.'; end if;
  if p_dia > v_hoje + 365 then raise exception 'Essa data está longe demais.'; end if;
  if p_dia < pl.inicio or (pl.fim is not null and p_dia > pl.fim) then raise exception 'O plano de % não vale nesse dia.', v_pet.nome; end if;
  if extract(dow from p_dia)::smallint = any (pl.dias) and public.creche_abre(coalesce(s.horario_creche, s.horario), p_dia) and not public.dia_fechado(pl.petshop_id, p_dia)
     and not (pl.pausa_de is not null and p_dia between pl.pausa_de and pl.pausa_ate) then
    raise exception 'Esse dia já é do plano de %: não precisa reservar.', v_pet.nome;
  end if;
  if exists (select 1 from public.estadias e where e.pet_id = pl.pet_id and e.dia = p_dia and e.mensalista is not null and e.status <> 'cancelada') then
    raise exception '% já está marcado nesse dia.', v_pet.nome;
  end if;
  if exists (select 1 from public.estadias e where e.pet_id = pl.pet_id and e.status in ('reservada', 'em_casa')
      and public.estadia_ocupa(e.tipo, e.status, (e.entrada at time zone s.fuso)::date, (e.saida_prevista at time zone s.fuso)::date, p_dia, v_hoje)) then
    raise exception '% já tem reserva ou está na casa nesse dia.', v_pet.nome;
  end if;
  perform set_config('maestro.creche', '1', true);
  insert into public.estadias (petshop_id, pet_id, tipo, entrada, saida_prevista, status, plano_id, mensalista, dia, obs)
    values (pl.petshop_id, pl.pet_id, 'creche', (p_dia::timestamp + time '08:00') at time zone s.fuso, (p_dia::timestamp + time '18:00') at time zone s.fuso,
      'reservada', pl.id, 'extra', p_dia, nullif(left(btrim(coalesce(p_obs, '')), 600), ''))
    returning id into v_id;
  return v_id;
end $function$;

CREATE OR REPLACE FUNCTION public.creche_sugestao_mensal(p_plano uuid, p_mes date, p_valor numeric)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select case when t.todos = 0 or t.restam = t.todos then p_valor
              else round(p_valor * t.restam / t.todos, 2) end
  from public.creche_planos pl
  join public.petshops s on s.id = pl.petshop_id,
  lateral (
    select count(*) filter (where d::date >= pl.inicio and (pl.fim is null or d::date <= pl.fim)
                              and not (pl.pausa_de is not null and d::date between pl.pausa_de and pl.pausa_ate)) as restam,
           count(*) as todos
    from generate_series(date_trunc('month', p_mes)::date, (date_trunc('month', p_mes) + interval '1 month - 1 day')::date, interval '1 day') d
    where extract(dow from d)::smallint = any (pl.dias) and public.creche_abre(coalesce(s.horario_creche, s.horario), d::date)
      and not public.dia_fechado(pl.petshop_id, d::date)
  ) t
  where pl.id = p_plano
$function$;

CREATE OR REPLACE FUNCTION public.link_espera_pedir(p_codigo text, p_tipo text, p_entrada date, p_saida date, p_tutor text, p_telefone text, p_pet text, p_especie text DEFAULT 'cao'::text, p_porte text DEFAULT NULL::text, p_obs text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.petshops;
  v_fone text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_hoje date;
  v_ate date;
  v_cheios int;
  v_id uuid;
begin
  select * into v from public.petshops where link_codigo = p_codigo and link_ativo;
  if not found or not public.acesso_liberado(v.id) or not public.link_espera_ativa(p_codigo) then return jsonb_build_object('ok', false, 'erro', 'fechado'); end if;
  if p_tipo is null or p_tipo not in ('creche', 'hotel') or (p_tipo = 'creche' and not v.link_creche) or (p_tipo = 'hotel' and not v.link_hotel) then
    return jsonb_build_object('ok', false, 'erro', 'fechado');
  end if;
  v_hoje := (now() at time zone v.fuso)::date;
  if char_length(trim(coalesce(p_tutor, ''))) < 2 or not public.fone_plausivel(v_fone) or char_length(trim(coalesce(p_pet, ''))) < 1 then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end if;
  if p_entrada is null or p_saida is null or p_entrada < v_hoje or p_entrada > v_hoje + 365
     or p_saida < p_entrada or (p_tipo = 'hotel' and p_saida = p_entrada) or p_saida > p_entrada + 60 then
    return jsonb_build_object('ok', false, 'erro', 'datas');
  end if;
  v_ate := case when p_tipo = 'hotel' then p_saida - 1 else p_saida end;
  if p_tipo = 'creche' and exists (select 1 from generate_series(p_entrada, v_ate, interval '1 day') d where not public.creche_abre(coalesce(v.horario_creche, v.horario), d::date) or public.dia_fechado(v.id, d::date)) then
    return jsonb_build_object('ok', false, 'erro', 'nao_abre');
  end if;
  select count(*) into v_cheios from public.link_estadia_cheios(p_codigo, p_tipo, p_entrada, v_ate);
  if v_cheios = 0 then return jsonb_build_object('ok', false, 'erro', 'tem_vaga'); end if;
  if exists (
    select 1 from public.lista_espera q
    where q.petshop_id = v.id and q.tipo = p_tipo and q.status in ('esperando', 'chamado')
      and right(q.telefone, 8) = right(v_fone, 8) and lower(trim(q.pet_nome)) = lower(trim(p_pet))
      and q.entrada <= p_saida and q.saida >= p_entrada
  ) then
    return jsonb_build_object('ok', false, 'erro', 'repetido');
  end if;
  if (select count(*) from public.lista_espera where petshop_id = v.id and telefone = v_fone and status in ('esperando', 'chamado') and saida >= v_hoje) >= 6
     or (select count(*) from public.lista_espera where petshop_id = v.id and origem = 'link' and criado_em > now() - interval '1 day') >= 60 then
    return jsonb_build_object('ok', false, 'erro', 'limite');
  end if;
  insert into public.lista_espera (petshop_id, tipo, entrada, saida, pet_nome, tutor_nome, telefone, especie, porte, obs, origem)
  values (v.id, p_tipo, p_entrada, p_saida, left(trim(p_pet), 80), left(trim(p_tutor), 120), v_fone,
    case when p_especie in ('cao', 'gato', 'outro') then p_especie else 'cao' end,
    case when p_porte in ('P', 'M', 'G', 'GG') then p_porte else null end,
    nullif(left(trim(coalesce(p_obs, '')), 300), ''), 'link')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $function$;

CREATE OR REPLACE FUNCTION public.link_estadia_cheios(p_codigo text, p_tipo text, p_de date, p_ate date)
 RETURNS SETOF date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select d::date
  from public.petshops p, generate_series(p_de, least(p_ate, p_de + 62), interval '1 day') d
  where p.link_codigo = p_codigo and p.link_ativo and p_tipo in ('creche', 'hotel')
    and ((p_tipo = 'creche' and (not public.creche_abre(coalesce(p.horario_creche, p.horario), d::date) or public.dia_fechado(p.id, d::date)))
     or ((case p_tipo when 'creche' then p.vagas_creche else p.vagas_hotel end) is not null
    and (
      (select count(*) from public.estadias e where e.petshop_id = p.id and e.tipo = p_tipo and e.status in ('reservada', 'em_casa')
         and public.estadia_ocupa(e.tipo, e.status, (e.entrada at time zone p.fuso)::date, (e.saida_prevista at time zone p.fuso)::date, d::date, (now() at time zone p.fuso)::date))
      + (select count(*) from public.pedidos_agendamento x where x.petshop_id = p.id and x.tipo = p_tipo and x.status = 'pendente'
         and public.estadia_ocupa(x.tipo, 'reservada', (x.inicio at time zone p.fuso)::date, (x.fim at time zone p.fuso)::date, d::date, (now() at time zone p.fuso)::date))
      + (case when p_tipo = 'creche' then public.creche_planos_ocupam(p.id, d::date, (now() at time zone p.fuso)::date) else 0 end)
    ) >= (case p_tipo when 'creche' then p.vagas_creche else p.vagas_hotel end)))
$function$;

-- ---------- 4. o que o aplicativo lê ao abrir ----------
CREATE OR REPLACE FUNCTION public.gestao_base(p uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  return jsonb_build_object(
    'petshop', (
      select to_jsonb(x) from (
        select s.id, s.nome, s.telefone, s.cidade, s.uf, s.endereco, s.bairro, s.complemento, s.fuso, s.horario, s.horario_creche, s.horario_hotel, s.status, s.plano, s.teste_ate, s.assinatura_desde,
          s.criado_por, s.criado_em, s.whatsapp, s.link_codigo, s.link_ativo, s.link_aviso, s.vagas, s.guia_feito_em, s.logo, s.tema,
          s.pago_ate, s.periodo_meses, s.vagas_creche, s.vagas_hotel, s.link_creche, s.link_hotel, s.fidelidade_cada,
          s.fidelidade_premio, s.fidelidade_desde, s.modulos, s.principal, s.creche_bloqueia_vacina
        from public.petshops s where s.id = p
      ) x
    ),
    'reservado', coalesce((select jsonb_agg(to_jsonb(r)) from public.petshop_reservado(p) r), '[]'::jsonb),
    'diarias', coalesce((select jsonb_agg(to_jsonb(r)) from public.petshop_diarias(p) r), '[]'::jsonb),
    'opcoes', public.petshop_opcoes(p),
    'equipe', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.criado_em) from (
        select e.id, e.petshop_id, e.user_id, e.nome, e.papel, e.ve_financeiro, e.cor, e.escala, e.atende, e.ativo, e.criado_em,
          e.funcao, e.acessos
        from public.profissionais e where e.petshop_id = p
      ) x
    ), '[]'::jsonb),
    'equipe_reservado', coalesce((select jsonb_agg(to_jsonb(r)) from public.equipe_reservado(p) r), '[]'::jsonb),
    'servicos', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.ordem, x.nome, x.id) from (
        select v.id, v.petshop_id, v.nome, v.categoria, v.duracao_min, v.cor, v.ordem, v.ativo, v.criado_em, v.horario
        from public.servicos v where v.petshop_id = p
      ) x
    ), '[]'::jsonb),
    'servicos_precos', coalesce((select jsonb_agg(to_jsonb(r)) from public.servicos_precos(p) r), '[]'::jsonb)
  );
end
$function$;

-- ---------- 5. a página do link ----------
CREATE OR REPLACE FUNCTION public.link_info(p_codigo text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'nome', p.nome, 'telefone', p.telefone, 'cidade', p.cidade, 'uf', p.uf, 'horario', p.horario,
    'horario_creche', coalesce(p.horario_creche, p.horario), 'horario_hotel', coalesce(p.horario_hotel, p.horario), 'aviso', p.link_aviso,
    'endereco', p.endereco, 'bairro', p.bairro, 'complemento', p.complemento,
    'logo', p.logo, 'tema', p.tema,
    'hoje', (now() at time zone p.fuso)::date,
    'creche', case when p.link_creche then jsonb_build_object('diaria', p.diaria_creche) else null end,
    'hotel', case when p.link_hotel then jsonb_build_object('diaria', p.diaria_hotel) else null end,
    'servicos', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'duracao_min', s.duracao_min, 'cor', s.cor,
        'preco_p', s.preco_p, 'preco_m', s.preco_m, 'preco_g', s.preco_g, 'preco_gg', s.preco_gg, 'horario', s.horario) order by s.ordem, s.nome)
      from public.servicos s where s.petshop_id = p.id and s.ativo and s.categoria not in ('creche', 'hotel')
    ), '[]'::jsonb)
  )
  from public.petshops p
  where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)
$function$;

-- ---------- 6. horários livres dentro do horário de todos os serviços ----------
-- Cada serviço escolhido (o principal e os outros) vale no horário próprio (servicos.horario) ou, sem ele, no do pet shop.
-- O horário livre precisa caber em todos: abre na maior hora de abrir e fecha na menor hora de fechar. O almoço do pet shop
-- vale quando algum dos serviços segue o horário do pet shop. Serviço fechado no dia: nenhum horário.
CREATE OR REPLACE FUNCTION public.link_horarios(p_codigo text, p_servico uuid, p_dia date, p_pets integer DEFAULT 1, p_extras jsonb DEFAULT NULL::jsonb)
 RETURNS SETOF text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.petshops;
  v_dur int;
  v_h jsonb;
  v_al jsonb;
  v_abre int;
  v_fecha int;
  v_ai int;
  v_af int;
  m int;
  v_ini timestamptz;
  n int := least(4, greatest(1, coalesce(p_pets, 1)));
  v_extras uuid[];
  v_loja boolean := false;
  x record;
begin
  select * into v from public.petshops where link_codigo = p_codigo and link_ativo;
  if not found or not public.acesso_liberado(v.id) then return; end if;
  v_extras := public.link_extras(v.id, p_servico, p_extras);
  if v_extras is null then return; end if;
  select duracao_min into v_dur from public.servicos where id = p_servico and petshop_id = v.id and ativo and categoria not in ('creche', 'hotel');
  if not found then return; end if;
  -- cada pet faz todos os serviços, um depois do outro; os pets também vêm um depois do outro
  v_dur := least(1440, v_dur + coalesce((select sum(s.duracao_min) from public.servicos s where s.id = any (v_extras) and s.petshop_id = v.id), 0)::int) * n;
  if p_dia < (now() at time zone v.fuso)::date or p_dia > (now() at time zone v.fuso)::date + 60 then return; end if;
  if public.dia_fechado(v.id, p_dia) then return; end if;
  -- a janela do dia: a parte em que todos os serviços escolhidos funcionam
  v_abre := 0;
  v_fecha := 1440;
  for x in select s.horario is null as da_loja, coalesce(s.horario, v.horario) -> (extract(dow from p_dia)::int)::text as dia
           from public.servicos s where s.petshop_id = v.id and (s.id = p_servico or s.id = any (v_extras)) loop
    v_h := x.dia;
    if v_h is null or jsonb_typeof(v_h) <> 'object' or coalesce(v_h ->> 'abre', '') !~ '^\d{2}:\d{2}' or coalesce(v_h ->> 'fecha', '') !~ '^\d{2}:\d{2}' then
      return;
    end if;
    v_abre := greatest(v_abre, extract(hour from (v_h ->> 'abre')::time)::int * 60 + extract(minute from (v_h ->> 'abre')::time)::int);
    v_fecha := least(v_fecha, extract(hour from (v_h ->> 'fecha')::time)::int * 60 + extract(minute from (v_h ->> 'fecha')::time)::int);
    v_loja := v_loja or x.da_loja;
  end loop;
  -- o almoço do pet shop (só vale no dia em que o pet shop abre antes e continua aberto depois, como na tela)
  v_h := v.horario -> (extract(dow from p_dia)::int)::text;
  if v_loja and v_h is not null and jsonb_typeof(v_h) = 'object' then
    v_al := v_h -> 'almoco';
    if v_al is not null and jsonb_typeof(v_al) = 'object' and (v_al ->> 'de') ~ '^\d{2}:\d{2}' and (v_al ->> 'ate') ~ '^\d{2}:\d{2}' then
      v_ai := left(v_al ->> 'de', 2)::int * 60 + substr(v_al ->> 'de', 4, 2)::int;
      v_af := left(v_al ->> 'ate', 2)::int * 60 + substr(v_al ->> 'ate', 4, 2)::int;
      if not (v_af > v_ai
              and extract(hour from (v_h ->> 'abre')::time)::int * 60 + extract(minute from (v_h ->> 'abre')::time)::int < v_ai
              and extract(hour from (v_h ->> 'fecha')::time)::int * 60 + extract(minute from (v_h ->> 'fecha')::time)::int > v_af) then
        v_ai := null;
      end if;
    end if;
  end if;
  m := v_abre;
  while m + v_dur <= v_fecha loop
    v_ini := (p_dia::timestamp + make_interval(mins => m)) at time zone v.fuso;
    if (v_ai is null or m >= v_af or m + v_dur <= v_ai)
       and v_ini >= now() + interval '2 hours' and public.link_vaga(v.id, v_ini, v_ini + make_interval(mins => v_dur)) then
      return next to_char(m / 60, 'FM00') || ':' || to_char(m % 60, 'FM00');
    end if;
    m := m + 30;
  end loop;
end $function$;

-- ---------- 7. a hora de chegar e de buscar na creche e no hotel ----------
CREATE OR REPLACE FUNCTION public.link_estadia_dia_recusado(p_petshop uuid, p_tipo text, p_dia date, p_hora text, p_quando text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_horario jsonb; v_nome text; d jsonb; v_h time; v_ate text;
begin
  if p_dia is null then return null; end if;
  select d2.nome into v_nome from public.dias_especiais d2 where d2.petshop_id = p_petshop and d2.dia = p_dia and d2.fechado;
  if found then
    return jsonb_build_object('ok', false, 'erro', 'dia_fechado', 'quando', p_quando, 'dia', p_dia, 'nome', nullif(btrim(coalesce(v_nome, '')), ''));
  end if;
  select case p_tipo when 'creche' then coalesce(s.horario_creche, s.horario) when 'hotel' then coalesce(s.horario_hotel, s.horario) else s.horario end
    into v_horario from public.petshops s where s.id = p_petshop;
  if not public.creche_abre(v_horario, p_dia) then
    return jsonb_build_object('ok', false, 'erro', 'dia_fechado', 'quando', p_quando, 'dia', p_dia);
  end if;
  d := v_horario -> (extract(dow from p_dia)::int::text);
  if d is null or jsonb_typeof(d) <> 'object' or coalesce(d ->> 'abre', '') !~ '^\d{2}:\d{2}' or coalesce(d ->> 'fecha', '') !~ '^\d{2}:\d{2}'
     or coalesce(p_hora, '') !~ '^([01]\d|2[0-3]):[0-5]\d$' then
    return null;
  end if;
  v_h := p_hora::time;
  if p_quando = 'saida' and v_h > left(d ->> 'fecha', 5)::time then
    v_ate := public.hotel_busca_ate(p_petshop);
    if v_ate is not null and v_h <= v_ate::time then return null; end if;
  end if;
  if v_h < left(d ->> 'abre', 5)::time or v_h > left(d ->> 'fecha', 5)::time then
    return jsonb_build_object('ok', false, 'erro', 'fora_do_horario', 'quando', p_quando, 'dia', p_dia, 'abre', left(d ->> 'abre', 5), 'fecha', left(d ->> 'fecha', 5),
      'ate', case when p_quando = 'saida' then public.hotel_busca_ate(p_petshop) end);
  end if;
  return null;
end $function$;
revoke execute on function public.link_estadia_dia_recusado(uuid, text, date, text, text) from public, anon, authenticated;

-- a de antes continua respondendo pelo hotel (para quem ainda chamar por ela)
create or replace function public.link_hotel_dia_recusado(p_petshop uuid, p_dia date, p_hora text, p_quando text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select public.link_estadia_dia_recusado(p_petshop, 'hotel', p_dia, p_hora, p_quando)
$$;
revoke execute on function public.link_hotel_dia_recusado(uuid, date, text, text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.link_pedir_com_termos(p_funcao text, p_args jsonb, p_termos text DEFAULT NULL::text, p_vacinas boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.petshops;
  o jsonb;
  v_lista text;
  r jsonb;
  v_id uuid;
  v_grupo uuid;
  v_args jsonb := p_args;
  v_he text;
  v_hs text;
  v_exp boolean := false;
  v_fone text;
  v_rede text;
begin
  if p_funcao not in ('link_pedir', 'link_pedir_estadia', 'link_espera_pedir') or jsonb_typeof(p_args) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_args) k where k !~ '^p_[a-z_]{1,40}$') then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end if;
  select * into v from public.petshops where link_codigo = p_args ->> 'p_codigo' and link_ativo;
  if not found or not public.acesso_liberado(v.id) then return jsonb_build_object('ok', false, 'erro', 'fechado'); end if;
  o := public.link_opcoes_de(v.opcoes);
  -- dia de experiência (opção da creche): o tutor marca no pedido de creche de um dia só; o pedido guarda a marca
  if p_funcao = 'link_pedir_estadia' and p_args ? 'p_experiencia' then
    v_exp := p_args -> 'p_experiencia' = 'true'::jsonb;
    v_args := v_args - 'p_experiencia';
    if v_exp and (p_args ->> 'p_tipo' is distinct from 'creche' or p_args ->> 'p_entrada' is distinct from p_args ->> 'p_saida'
                  or not public.creche_experiencia_ligada(v.id)) then
      return jsonb_build_object('ok', false, 'erro', 'experiencia');
    end if;
  end if;
  -- hotel: chegada e busca só em dia que abre e dentro do horário do hotel daquele dia (ver link_estadia_dia_recusado)
  if p_funcao = 'link_pedir_estadia' and p_args ->> 'p_tipo' = 'hotel' then
    r := public.link_estadia_dia_recusado(v.id, 'hotel', public.dia_iso(p_args ->> 'p_entrada'), coalesce(p_args ->> 'p_hora_entrada', '08:00'), 'entrada');
    if r is null then r := public.link_estadia_dia_recusado(v.id, 'hotel', public.dia_iso(p_args ->> 'p_saida'), coalesce(p_args ->> 'p_hora_saida', '18:00'), 'saida'); end if;
    if r is not null then return r; end if;
  end if;
  -- creche: chegada e busca dentro do horário da creche no dia (só quando a página manda as horas)
  if p_funcao = 'link_pedir_estadia' and p_args ->> 'p_tipo' = 'creche' and p_args ? 'p_hora_entrada' and p_args ? 'p_hora_saida' then
    r := public.link_estadia_dia_recusado(v.id, 'creche', public.dia_iso(p_args ->> 'p_entrada'), p_args ->> 'p_hora_entrada', 'entrada');
    if r is null then
      r := public.link_estadia_dia_recusado(v.id, 'creche', public.dia_iso(p_args ->> 'p_saida'), p_args ->> 'p_hora_saida', 'entrada');
      if r is not null then r := r || jsonb_build_object('quando', 'saida'); end if;
    end if;
    if r is not null then return r; end if;
  end if;
  -- creche e hotel: chegada hoje numa hora que já passou
  if p_funcao = 'link_pedir_estadia' and coalesce(p_args ->> 'p_hora_entrada', '') ~ '^([01]\d|2[0-3]):[0-5]\d$'
     and public.dia_iso(p_args ->> 'p_entrada') = (now() at time zone v.fuso)::date
     and (p_args ->> 'p_hora_entrada')::time < (now() at time zone v.fuso)::time then
    return jsonb_build_object('ok', false, 'erro', 'datas', 'motivo', 'hora_passou');
  end if;
  if p_funcao = 'link_espera_pedir' then
    v_he := case when p_args ->> 'p_hora_entrada' ~ '^([01]\d|2[0-3]):[0-5]\d$' then p_args ->> 'p_hora_entrada' end;
    v_hs := case when p_args ->> 'p_hora_saida' ~ '^([01]\d|2[0-3]):[0-5]\d$' then p_args ->> 'p_hora_saida' end;
    v_args := v_args - 'p_hora_entrada' - 'p_hora_saida';
  end if;
  if (o ->> 'termos')::boolean then
    if regexp_replace(btrim(coalesce(p_termos, '')), '\r', '', 'g') <> regexp_replace(o ->> 'texto', '\r', '', 'g')
       or ((o ->> 'vacinas')::boolean and not coalesce(p_vacinas, false)) then
      return jsonb_build_object('ok', false, 'erro', 'termos');
    end if;
  end if;
  -- muitos pedidos de uma vez (da loja toda, do mesmo WhatsApp ou da mesma rede): pede para tentar mais tarde (da 20261164)
  v_fone := public.link_fone_chave(p_args ->> 'p_telefone');
  v_rede := public.link_rede();
  if public.link_muitos_envios(v.id, v_fone, v_rede) then
    return jsonb_build_object('ok', false, 'erro', 'limite', 'motivo', 'muitos',
      'mensagem', 'Recebemos muitos pedidos agora. Tente de novo mais tarde ou chame no WhatsApp.');
  end if;
  select string_agg(format('%I => %L', e.key,
      case jsonb_typeof(e.value) when 'null' then null when 'string' then e.value #>> '{}' else e.value::text end), ', ')
    into v_lista from jsonb_each(v_args) e;
  begin
    execute format('select public.%I(%s)', p_funcao, v_lista) into r;
  exception when undefined_function or invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end;
  if r ->> 'ok' = 'true' then
    insert into public.link_envios (petshop_id, tipo, fone, rede, pedido_id)
      values (v.id, case when p_funcao = 'link_espera_pedir' then 'espera' else 'pedido' end, v_fone, v_rede,
              case when (r ->> 'id') ~* '^[0-9a-f-]{36}$' then (r ->> 'id')::uuid end);
  end if;
  -- o valor que a página mostrou (estimativa do hotel, diárias da creche) fica guardado com o pedido
  if p_funcao = 'link_pedir_estadia' and r ->> 'ok' = 'true' and (r ->> 'id') ~* '^[0-9a-f-]{36}$' then
    begin
      perform public.pedidos_estadia_visto((r ->> 'id')::uuid, v_args);
    exception when others then
      raise warning 'pedidos_estadia_visto: %', sqlerrm;
    end;
  end if;
  if p_funcao = 'link_espera_pedir' and r ->> 'ok' = 'true' and (r ->> 'id') is not null then
    v_id := (r ->> 'id')::uuid;
    perform set_config('maestro.link', '1', true);
    update public.lista_espera
      set hora_entrada = coalesce(v_he, hora_entrada), hora_saida = coalesce(v_hs, hora_saida),
          termos_aceitos_em = case when (o ->> 'termos')::boolean then now() else termos_aceitos_em end
      where id = v_id and petshop_id = v.id;
    perform set_config('maestro.link', '', true);
    return r;
  end if;
  if v_exp and r ->> 'ok' = 'true' and (r ->> 'id') is not null then
    v_id := (r ->> 'id')::uuid;
    select grupo_id into v_grupo from public.pedidos_agendamento where id = v_id;
    update public.pedidos_agendamento set experiencia = true
      where petshop_id = v.id and (id = v_id or (v_grupo is not null and grupo_id = v_grupo));
  end if;
  if (o ->> 'termos')::boolean and r ->> 'ok' = 'true' and (r ->> 'id') is not null then
    v_id := (r ->> 'id')::uuid;
    select grupo_id into v_grupo from public.pedidos_agendamento where id = v_id;
    update public.pedidos_agendamento
      set termos_aceitos_em = now(), termos_texto = nullif(o ->> 'texto', ''), termos_vacinas = (o ->> 'vacinas')::boolean
      where petshop_id = v.id and (id = v_id or (v_grupo is not null and grupo_id = v_grupo));
  end if;
  return r;
end $function$;
