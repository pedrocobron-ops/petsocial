-- Consertos da creche (rodada de achados do Rafael):
-- 1. Primeira cobrança de um mensalista: quem recebe escolhe (já pago por fora / proporcional / mês inteiro).
--    A geração automática não cria mais cobrança que já nasce vencida sem essa escolha.
-- 2. Cobranças "pagas por fora" de uma vez (o negócio começou a usar o sistema no meio do mês).
-- 3. Plano de mensalista: criar, mudar, pausar e encerrar só o dono ou quem cuida do financeiro
--    (ou a equipe, se o dono ligar a opção 'creche.equipe_muda_plano').
-- 4. Reposição marcada por quem não recebe fica esperando a conferência de quem recebe.
-- 5. Reserva de dia extra para mensalista (vai para a cobrança do mês, não vira diária avulsa).
-- 6. Modelos de plano (2x, 3x, 5x por semana com preço).
-- Só acrescenta: tabelas, colunas e funções novas; função trocada mantém a assinatura. O código antigo segue funcionando.

-- ============================================================
-- 1. Primeira cobrança
-- ============================================================
-- O primeiro mês que o plano cobra (dia 1 do mês). Vazio = ninguém escolheu ainda.
alter table public.creche_planos add column primeira_cobranca date check (primeira_cobranca is null or extract(day from primeira_cobranca) = 1);
grant insert (primeira_cobranca), update (primeira_cobranca) on public.creche_planos to authenticated;

-- Cobrança que o dono marcou como "paga por fora do sistema": fica cancelada (sem conta a receber) e não é gerada de novo.
alter table public.creche_cobrancas add column por_fora boolean not null default false;
grant select (por_fora) on public.creche_cobrancas to authenticated;

-- ============================================================
-- 3. Quem pode mexer no plano
-- ============================================================
create or replace function public.creche_plano_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_equipe boolean;
begin
  new.dias := (select array_agg(d order by d) from (select distinct unnest(new.dias) as d) x);
  -- o plano decide o que é cobrado: só o dono ou quem cuida do financeiro cria e muda (a equipe, só se o dono ligou a opção)
  if (select auth.uid()) is not null and not (public.sou_dono(new.petshop_id) or public.cuido_do_financeiro(new.petshop_id)) then
    select coalesce(jsonb_typeof(s.opcoes -> 'creche.equipe_muda_plano') = 'boolean' and (s.opcoes ->> 'creche.equipe_muda_plano')::boolean, false)
      into v_equipe from public.petshops s where s.id = new.petshop_id;
    if not coalesce(v_equipe, false) and (tg_op = 'INSERT'
        or (new.dias, new.vence_dia, new.inicio, new.fim, new.pausa_de, new.pausa_ate, new.pet_id)
           is distinct from (old.dias, old.vence_dia, old.inicio, old.fim, old.pausa_de, old.pausa_ate, old.pet_id)) then
      raise exception 'Só o dono ou quem cuida do financeiro cadastra, muda, pausa ou encerra o plano de um mensalista.';
    end if;
    -- a primeira cobrança é sempre escolha de quem recebe
    if tg_op = 'INSERT' then new.primeira_cobranca := null; else new.primeira_cobranca := old.primeira_cobranca; end if;
  end if;
  -- quem grava dois planos do mesmo pet ao mesmo tempo espera a vez
  perform 1 from public.pets where id = new.pet_id for update;
  if exists (
    select 1 from public.creche_planos o
    where o.pet_id = new.pet_id and o.id <> new.id
      and o.inicio <= coalesce(new.fim, 'infinity'::date) and coalesce(o.fim, 'infinity'::date) >= new.inicio
  ) then
    raise exception 'Este pet já tem um plano de creche nesse período. Encerre o plano atual antes de criar outro.';
  end if;
  return new;
end $$;

create function public.creche_plano_apagar_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_equipe boolean;
begin
  -- apagar em cascata (pet ou negócio removido) e o banco por dentro passam
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then return old; end if;
  if public.sou_dono(old.petshop_id) or public.cuido_do_financeiro(old.petshop_id) then return old; end if;
  select coalesce(jsonb_typeof(s.opcoes -> 'creche.equipe_muda_plano') = 'boolean' and (s.opcoes ->> 'creche.equipe_muda_plano')::boolean, false)
    into v_equipe from public.petshops s where s.id = old.petshop_id;
  if not coalesce(v_equipe, false) then
    raise exception 'Só o dono ou quem cuida do financeiro cadastra, muda, pausa ou encerra o plano de um mensalista.';
  end if;
  return old;
end $$;
create trigger creche_plano_apagar_conferir before delete on public.creche_planos
  for each row execute function public.creche_plano_apagar_conferir();

-- ============================================================
-- 4. Reposição que espera conferência
-- ============================================================
-- Uma linha por reposição ("não cobrar") marcada por quem não recebe. Quem recebe aceita ou manda cobrar como dia extra.
create table public.creche_reposicoes (
  estadia_id uuid primary key references public.estadias (id) on delete cascade,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  pet_id uuid not null,
  plano_id uuid references public.creche_planos (id) on delete set null,
  dia date not null,
  estado text not null default 'pendente' check (estado in ('pendente', 'aceita', 'extra')),
  marcado_por uuid references auth.users (id) on delete set null,
  marcado_em timestamptz not null default now(),
  decidido_por uuid references auth.users (id) on delete set null,
  decidido_em timestamptz,
  foreign key (pet_id, petshop_id) references public.pets (id, petshop_id) on delete cascade
);
create index on public.creche_reposicoes (petshop_id, estado);
alter table public.creche_reposicoes enable row level security;
revoke all on public.creche_reposicoes from anon, authenticated;
grant select on public.creche_reposicoes to authenticated;
create policy creche_reposicoes_ler on public.creche_reposicoes for select to authenticated
  using ((select public.sou_dono(petshop_id)) or (select public.cuido_do_financeiro(petshop_id)));

-- A chamada, com duas novidades: a reposição de quem não recebe fica para conferência, e a reserva de dia extra
-- (estadia 'reservada' com marca de mensalista) vira presença quando o pet chega.
create or replace function public.creche_chamada(p_plano uuid, p_dia date, p_acao text, p_avisou boolean default false, p_forcar boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
begin
  select * into pl from public.creche_planos where id = p_plano for update;
  if not found or not public.tenho_area(pl.petshop_id, array['creche_hotel']) then raise exception 'Plano não encontrado.'; end if;
  if not public.acesso_liberado(pl.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if p_acao not in ('chegou', 'extra', 'reposicao', 'saiu', 'faltou', 'desfazer') then raise exception 'Ação inválida.'; end if;
  select * into s from public.petshops where id = pl.petshop_id;
  select * into v_pet from public.pets where id = pl.pet_id;
  v_hoje := (now() at time zone s.fuso)::date;
  if p_dia is null or p_dia > v_hoje then raise exception 'Não dá para fazer a chamada de um dia que ainda não chegou.'; end if;
  -- dias passados: os deste mês (e a última semana, para o esquecimento da virada do mês)
  if p_dia < least(date_trunc('month', v_hoje)::date, v_hoje - 7) then raise exception 'A chamada só pode ser corrigida nos dias deste mês.'; end if;
  if p_dia < pl.inicio or (pl.fim is not null and p_dia > pl.fim) then raise exception 'O plano de % não vale nesse dia.', v_pet.nome; end if;
  -- dia do plano: dia da semana dele, fora da pausa, com o pet shop aberto e sem estar marcado como dia fechado
  v_do_plano := extract(dow from p_dia)::smallint = any (pl.dias) and public.creche_abre(s.horario, p_dia) and not public.dia_fechado(pl.petshop_id, p_dia)
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
    if s.creche_bloqueia_vacina and p_dia = v_hoje then
      v_vacinas := public.creche_vacinas_vencidas(pl.pet_id, v_hoje);
      if v_vacinas is not null and not (coalesce(p_forcar, false) and public.sou_dono(pl.petshop_id)) then
        raise exception 'VACINA_VENCIDA: %', v_vacinas;
      end if;
    end if;
    delete from public.creche_faltas where pet_id = pl.pet_id and dia = p_dia;
    -- a reserva de dia extra continua dia extra quando a pessoa só toca em "Chegou"
    v_como := case when p_acao = 'chegou' then (case when v_reservada then v_e.mensalista else 'plano' end) else p_acao end;
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
    -- "não cobrar" marcado por quem não recebe: fica anotado e espera a conferência de quem recebe
    if v_como = 'reposicao' and not (public.sou_dono(pl.petshop_id) or public.cuido_do_financeiro(pl.petshop_id)) then
      insert into public.creche_reposicoes (estadia_id, petshop_id, pet_id, plano_id, dia, marcado_por)
        values (v_e.id, pl.petshop_id, pl.pet_id, pl.id, p_dia, (select auth.uid())) on conflict (estadia_id) do nothing;
      v_conferir := true;
    end if;
    return jsonb_build_object('ok', true, 'estadia', v_e.id, 'conferir', v_conferir);
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
end $$;

-- Quem recebe confere a reposição: 'aceitar' (fica sem cobrança) ou 'extra' (vira dia extra e entra na cobrança do mês).
create function public.creche_reposicao_decidir(p_estadia uuid, p_decisao text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r public.creche_reposicoes;
begin
  select * into r from public.creche_reposicoes where estadia_id = p_estadia for update;
  if not found or not (public.sou_dono(r.petshop_id) or public.cuido_do_financeiro(r.petshop_id)) then raise exception 'Reposição não encontrada.'; end if;
  if not public.acesso_liberado(r.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if p_decisao not in ('aceitar', 'extra') then raise exception 'Decisão inválida.'; end if;
  if r.estado <> 'pendente' then return; end if;
  if p_decisao = 'extra' then
    perform set_config('maestro.creche', '1', true);
    update public.estadias set mensalista = 'extra' where id = r.estadia_id and mensalista = 'reposicao';
  end if;
  update public.creche_reposicoes set estado = case p_decisao when 'extra' then 'extra' else 'aceita' end, decidido_por = (select auth.uid()), decidido_em = now()
    where estadia_id = r.estadia_id;
end $$;
revoke all on function public.creche_reposicao_decidir(uuid, text) from public, anon;
grant execute on function public.creche_reposicao_decidir(uuid, text) to authenticated;

-- ============================================================
-- 5. Reserva de dia extra para mensalista
-- ============================================================
-- Reserva uma vaga para o mensalista num dia que não é do plano. Fica como reserva de creche com a marca de dia extra:
-- ocupa a vaga, aparece na chamada do dia e, quando o pet vem, entra na próxima cobrança do mês (nunca vira diária avulsa).
create function public.creche_reservar_extra(p_plano uuid, p_dia date, p_obs text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
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
  if extract(dow from p_dia)::smallint = any (pl.dias) and public.creche_abre(s.horario, p_dia) and not public.dia_fechado(pl.petshop_id, p_dia)
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
end $$;
revoke all on function public.creche_reservar_extra(uuid, date, text) from public, anon;
grant execute on function public.creche_reservar_extra(uuid, date, text) to authenticated;

-- ============================================================
-- 1 (continuação). Cobrança: respeita a primeira cobrança, não cobra reserva que não virou presença
-- ============================================================
create or replace function public.creche_cobranca_criar(p_plano uuid, p_mes date, p_valor numeric default null, p_desconto numeric default 0, p_vencimento date default null, p_obs text default null, p_reabrir boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  pl public.creche_planos;
  s public.petshops;
  v public.creche_planos_valores;
  c public.creche_cobrancas;
  v_mes date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_cliente uuid;
  v_mensal numeric(10, 2);
  v_unit numeric(10, 2);
  v_extras jsonb;
  v_extras_total numeric(10, 2);
  v_taxas jsonb;
  v_taxas_total numeric(10, 2);
  v_desconto numeric(10, 2) := greatest(coalesce(p_desconto, 0), 0);
  v_venc date;
  v_id uuid;
begin
  select * into pl from public.creche_planos where id = p_plano for update;
  if not found or not public.cuido_do_financeiro(pl.petshop_id) then raise exception 'Plano não encontrado.'; end if;
  if not public.acesso_liberado(pl.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if p_mes is null then raise exception 'Escolha o mês.'; end if;
  select * into c from public.creche_cobrancas where plano_id = pl.id and mes = v_mes;
  if found and (c.status = 'aberta' or not coalesce(p_reabrir, false)) then return c.id; end if;
  if pl.inicio > v_fim or (pl.fim is not null and pl.fim < v_mes) then raise exception 'O plano não vale nesse mês.'; end if;
  -- mês anterior à primeira cobrança escolhida (foi pago por fora do sistema): não gera
  if c.id is null and pl.primeira_cobranca is not null and v_mes < pl.primeira_cobranca then
    raise exception 'Este plano começa a ser cobrado em % (os meses anteriores foram pagos por fora).', public.creche_nome_mes(pl.primeira_cobranca);
  end if;
  select * into s from public.petshops where id = pl.petshop_id;
  select * into v from public.creche_planos_valores where plano_id = pl.id;
  if v.plano_id is null then raise exception 'Defina o valor da mensalidade deste plano antes de gerar a cobrança.'; end if;
  v_mensal := coalesce(p_valor, public.creche_sugestao_mensal(pl.id, v_mes, v.valor_mensal));
  if v_mensal < 0 or v_mensal > 99999.99 then raise exception 'Confira o valor da mensalidade.'; end if;
  v_unit := coalesce(v.valor_extra, s.diaria_creche, 0);
  -- só o dia extra em que o pet veio (reserva de dia extra que não virou presença não é cobrada)
  select coalesce(jsonb_agg(jsonb_build_object('dia', e.dia, 'valor', v_unit) order by e.dia), '[]'::jsonb), coalesce(count(*) * v_unit, 0)
    into v_extras, v_extras_total
    from public.estadias e
    where e.pet_id = pl.pet_id and e.mensalista = 'extra' and e.status in ('em_casa', 'encerrada') and e.cobranca_id is null and e.dia < v_mes;
  -- taxas de busca fora do horário de meses anteriores que quem recebe mandou para a mensalidade (mesma regra dos dias extras)
  select coalesce(jsonb_agg(jsonb_build_object('dia', a.dia, 'valor', a.valor) order by a.dia, a.estadia_id), '[]'::jsonb), coalesce(sum(a.valor), 0)
    into v_taxas, v_taxas_total
    from public.creche_atrasos a
    where a.pet_id = pl.pet_id and a.estado = 'mensalidade' and a.cobranca_id is null and a.dia < v_mes;
  v_extras_total := v_extras_total + v_taxas_total;
  if v_desconto > v_mensal + v_extras_total then raise exception 'O desconto é maior que a cobrança.'; end if;
  v_venc := coalesce(p_vencimento, greatest(make_date(extract(year from v_mes)::int, extract(month from v_mes)::int, pl.vence_dia), least(pl.inicio, v_fim)));
  select cliente_id into v_cliente from public.pets where id = pl.pet_id;

  if c.id is not null then
    update public.creche_cobrancas set status = 'aberta', por_fora = false, cliente_id = v_cliente, valor_cheio = v.valor_mensal, valor_mensal = v_mensal, extras = v_extras, taxas = v_taxas,
      valor_extras = v_extras_total, desconto = v_desconto, total = v_mensal + v_extras_total - v_desconto, vencimento = v_venc,
      obs = nullif(left(btrim(coalesce(p_obs, '')), 300), ''), cobrado_em = null, lancamento_id = null
      where id = c.id returning id into v_id;
  else
    insert into public.creche_cobrancas (petshop_id, plano_id, pet_id, cliente_id, mes, valor_cheio, valor_mensal, extras, taxas, valor_extras, desconto, total, vencimento, obs)
      values (pl.petshop_id, pl.id, pl.pet_id, v_cliente, v_mes, v.valor_mensal, v_mensal, v_extras, v_taxas, v_extras_total, v_desconto,
        v_mensal + v_extras_total - v_desconto, v_venc, nullif(left(btrim(coalesce(p_obs, '')), 300), ''))
      returning id into v_id;
  end if;
  perform set_config('maestro.creche', '1', true);
  update public.estadias e set cobranca_id = v_id
    where e.pet_id = pl.pet_id and e.mensalista = 'extra' and e.status in ('em_casa', 'encerrada') and e.cobranca_id is null and e.dia < v_mes;
  update public.creche_atrasos a set cobranca_id = v_id
    where a.pet_id = pl.pet_id and a.estado = 'mensalidade' and a.cobranca_id is null and a.dia < v_mes;
  perform public.creche_cobranca_lancar(v_id);
  return v_id;
end $$;

-- A geração automática (ao abrir Cobranças ou a tela Hoje) cria só o que não pede decisão:
-- mensalidade cheia, dentro da primeira cobrança escolhida, e nunca a primeira cobrança de um plano quando ela já nasceria vencida.
create or replace function public.creche_gerar_cobrancas(p_petshop uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  s public.petshops;
  v_hoje date;
  v_mes date;
  v_fim date;
  v_n int := 0;
  r record;
begin
  if not public.cuido_do_financeiro(p_petshop) or not public.acesso_liberado(p_petshop) then return 0; end if;
  select * into s from public.petshops where id = p_petshop;
  v_hoje := (now() at time zone s.fuso)::date;
  v_mes := date_trunc('month', v_hoje)::date;
  v_fim := (v_mes + interval '1 month - 1 day')::date;
  for r in
    select pl.id, v.valor_mensal from public.creche_planos pl
    join public.creche_planos_valores v on v.plano_id = pl.id
    where pl.petshop_id = p_petshop and pl.inicio <= v_fim and (pl.fim is null or pl.fim >= v_mes)
      and not exists (select 1 from public.creche_cobrancas c where c.plano_id = pl.id and c.mes = v_mes)
      and (pl.primeira_cobranca is null or pl.primeira_cobranca <= v_mes)
      -- primeira cobrança do plano, sem escolha de quem recebe, e que já nasceria vencida: espera a escolha na tela
      and not (pl.primeira_cobranca is null
        and not exists (select 1 from public.creche_cobrancas c where c.plano_id = pl.id)
        and greatest(make_date(extract(year from v_mes)::int, extract(month from v_mes)::int, pl.vence_dia), least(pl.inicio, v_fim)) < v_hoje)
  loop
    if public.creche_sugestao_mensal(r.id, v_mes, r.valor_mensal) = r.valor_mensal then
      perform public.creche_cobranca_criar(r.id, v_mes);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;

-- ============================================================
-- 2. Pagas por fora, de uma vez
-- ============================================================
-- Marca cobranças abertas e ainda sem nenhum recebimento como pagas por fora do sistema: a conta sai de A receber,
-- nada entra no caixa e a cobrança não é gerada de novo. Os dias extras e as taxas que estavam nela voltam para a próxima.
create function public.creche_cobrancas_por_fora(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  c public.creche_cobrancas;
  v_n int := 0;
begin
  for c in select * from public.creche_cobrancas where id = any (coalesce(p_ids, '{}'::uuid[])) order by id for update loop
    if not public.cuido_do_financeiro(c.petshop_id) then raise exception 'Cobrança não encontrada.'; end if;
    if not public.acesso_liberado(c.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
    if c.status <> 'aberta' then continue; end if;
    -- com recebimento (inteiro ou em parte) não é "por fora": fica como está
    if c.lancamento_id is not null and (public.creche_cobranca_paga(c.lancamento_id) or public.recebido_em_partes(c.lancamento_id) > 0) then continue; end if;
    update public.creche_cobrancas set status = 'cancelada', por_fora = true where id = c.id;
    perform public.creche_cobranca_lancar(c.id);
    perform set_config('maestro.creche', '1', true);
    update public.estadias set cobranca_id = null where cobranca_id = c.id;
    update public.creche_atrasos set cobranca_id = null where cobranca_id = c.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke all on function public.creche_cobrancas_por_fora(uuid[]) from public, anon;
grant execute on function public.creche_cobrancas_por_fora(uuid[]) to authenticated;

-- ============================================================
-- 6. Modelos de plano
-- ============================================================
-- "2x por semana · R$ 480": escolhido no cadastro do mensalista, preenche a mensalidade. Tem preço: só quem cuida do financeiro lê e grava.
create table public.creche_modelos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 60),
  -- quantos dias por semana o modelo cobre (só para sugerir o modelo quando os dias são marcados); vazio = qualquer quantidade
  vezes smallint check (vezes is null or vezes between 1 and 7),
  valor_mensal numeric(10, 2) not null check (valor_mensal >= 0 and valor_mensal <= 99999.99),
  valor_extra numeric(10, 2) check (valor_extra is null or (valor_extra >= 0 and valor_extra <= 99999.99)),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index on public.creche_modelos (petshop_id);
alter table public.creche_modelos enable row level security;
revoke all on public.creche_modelos from anon, authenticated;
grant select, insert, update, delete on public.creche_modelos to authenticated;
create policy creche_modelos_ler on public.creche_modelos for select to authenticated
  using ((select public.cuido_do_financeiro(petshop_id)));
create policy creche_modelos_criar on public.creche_modelos for insert to authenticated
  with check ((select public.cuido_do_financeiro(petshop_id)) and (select public.acesso_liberado(petshop_id)));
create policy creche_modelos_editar on public.creche_modelos for update to authenticated
  using ((select public.cuido_do_financeiro(petshop_id)) and (select public.acesso_liberado(petshop_id)))
  with check ((select public.cuido_do_financeiro(petshop_id)));
create policy creche_modelos_remover on public.creche_modelos for delete to authenticated
  using ((select public.cuido_do_financeiro(petshop_id)) and (select public.acesso_liberado(petshop_id)));

-- O modelo de onde veio o preço do plano (para o reajuste do modelo poder acompanhar os planos).
alter table public.creche_planos_valores add column modelo_id uuid references public.creche_modelos (id) on delete set null;
create index on public.creche_planos_valores (modelo_id) where modelo_id is not null;
