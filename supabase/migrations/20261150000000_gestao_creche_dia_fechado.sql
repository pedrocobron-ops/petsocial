-- Creche: dia fechado nas contas do banco e taxa de busca fora do horário do mensalista.
--
-- 1) Dia marcado como fechado (dias_especiais, de 20261145) passa a valer também nas funções da creche, do mesmo jeito
--    que o dia da semana em que o negócio não abre: nenhum mensalista é esperado, nenhum ocupa vaga, o dia não é "do plano"
--    na chamada (quem vier entra por "Veio fora do dia", como dia extra ou sem cobrança, escolhido por quem marca) e o dia
--    fica fora da conta da mensalidade proporcional (não dá desconto nem aumenta, igual ao dia da semana fechado).
-- 2) Mensalista que sai depois do horário, com a regra de taxa ligada (hotel_precos.atraso): a saída de um toque anota o
--    atraso, sem valor e sem cobrar. Quem recebe decide depois: cobrar na próxima mensalidade, receber na hora ou não cobrar.
--
-- Só acrescenta: uma tabela, uma coluna com valor padrão, três funções novas e seis funções trocadas com a mesma assinatura.
-- Sem nenhuma data em dias_especiais e sem a regra de atraso ligada, as funções trocadas respondem exatamente o que
-- respondiam: o aplicativo que está no ar hoje segue igual neste banco.

-- ============================================================
-- Taxa de busca fora do horário do mensalista
-- ============================================================
-- Uma linha por saída de mensalista fora do horário. Nasce 'pendente' (sem valor) e fica assim até quem recebe decidir:
-- 'mensalidade' (entra na próxima cobrança do mês, como os dias extras), 'recebida' (recebida na hora, ligada ao lançamento)
-- ou 'dispensada' (não cobrar). 'recebida' sem lançamento (o recebimento foi apagado no Financeiro) volta a pedir decisão.
-- Tem valor: só lê quem recebe (Caixa, Financeiro ou Relatórios), como hotel_precos. Só grava pelas funções abaixo.
create table public.creche_atrasos (
  estadia_id uuid primary key references public.estadias (id) on delete cascade,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  pet_id uuid not null,
  plano_id uuid references public.creche_planos (id) on delete set null,
  dia date not null,
  saiu_em timestamptz not null,
  -- a hora combinada na regra quando o pet saiu ("18:30"); não é valor
  limite text not null default '' check (char_length(limite) <= 5),
  estado text not null default 'pendente' check (estado in ('pendente', 'mensalidade', 'recebida', 'dispensada')),
  valor numeric(10, 2) check (valor is null or (valor > 0 and valor <= 9999.99)),
  cobranca_id uuid references public.creche_cobrancas (id) on delete set null,
  lancamento_id uuid references public.lancamentos (id) on delete set null,
  decidido_por uuid references auth.users (id) on delete set null,
  decidido_em timestamptz,
  criado_em timestamptz not null default now(),
  foreign key (pet_id, petshop_id) references public.pets (id, petshop_id) on delete cascade,
  check ((estado in ('mensalidade', 'recebida')) = (valor is not null)),
  check (cobranca_id is null or estado = 'mensalidade')
);
create index on public.creche_atrasos (petshop_id, estado);
create index on public.creche_atrasos (pet_id) where estado = 'mensalidade' and cobranca_id is null;
create index on public.creche_atrasos (cobranca_id) where cobranca_id is not null;
create index on public.creche_atrasos (lancamento_id) where lancamento_id is not null;
alter table public.creche_atrasos enable row level security;
revoke all on public.creche_atrasos from anon, authenticated;
grant select on public.creche_atrasos to authenticated;
create policy creche_atrasos_ler on public.creche_atrasos for select to authenticated
  using ((select public.tenho_area(petshop_id, array['caixa', 'financeiro', 'relatorios'])));

-- As taxas de busca fora do horário que entraram na cobrança do mês: [{"dia": "2026-10-03", "valor": 25}].
-- O valor delas fica somado em valor_extras, junto com os dias extras (o total continua mensalidade + valor_extras - desconto).
alter table public.creche_cobrancas add column taxas jsonb not null default '[]'::jsonb check (jsonb_typeof(taxas) = 'array');

-- A saída nessa hora passou do horário da creche combinado na regra (com a tolerância)? Devolve a hora da regra ("18:30"), ou nada.
-- Mesma conta de `atrasoSugerido` em src/lib/gestao/feriados.ts: só a hora do dia, regra ligada, com hora e valor preenchidos.
create function public.creche_saida_atrasada(p_petshop uuid, p_quando timestamptz) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_regra jsonb;
  v_fuso text;
  v_hora text;
  v_tol int := 0;
  v_local timestamp;
begin
  select r.atraso, s.fuso into v_regra, v_fuso from public.hotel_precos r join public.petshops s on s.id = r.petshop_id where r.petshop_id = p_petshop;
  if not found or p_quando is null or jsonb_typeof(v_regra -> 'ativo') is distinct from 'boolean' or not (v_regra ->> 'ativo')::boolean then return null; end if;
  v_hora := v_regra -> 'creche' ->> 'hora';
  if v_hora is null or v_hora !~ '^([01]\d|2[0-3]):[0-5]\d$' then return null; end if;
  if jsonb_typeof(v_regra -> 'creche' -> 'valor') is distinct from 'number' or (v_regra -> 'creche' ->> 'valor')::numeric <= 0 then return null; end if;
  if jsonb_typeof(v_regra -> 'tolerancia') = 'number' and (v_regra ->> 'tolerancia')::numeric >= 0 then
    v_tol := least(180, round((v_regra ->> 'tolerancia')::numeric))::int;
  end if;
  v_local := p_quando at time zone v_fuso;
  if extract(hour from v_local)::int * 60 + extract(minute from v_local)::int <= left(v_hora, 2)::int * 60 + right(v_hora, 2)::int + v_tol then return null; end if;
  return v_hora;
end $$;
revoke execute on function public.creche_saida_atrasada(uuid, timestamptz) from public, anon, authenticated;

-- ============================================================
-- Dia fechado nas contas da creche
-- ============================================================
-- Vagas: no dia marcado como fechado nenhum mensalista ocupa vaga (igual ao dia da semana em que o negócio não abre).
-- É a mesma regra de `mensalistasNoDia` em src/lib/gestao/creche.ts. O aceite de pedido e o link contam por aqui.
create or replace function public.creche_planos_ocupam(p_petshop uuid, p_dia date, p_hoje date) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from public.creche_planos pl
  join public.petshops s on s.id = pl.petshop_id
  join public.pets pt on pt.id = pl.pet_id and pt.ativo
  where pl.petshop_id = p_petshop and p_dia >= p_hoje
    and pl.inicio <= p_dia and (pl.fim is null or pl.fim >= p_dia)
    and not (pl.pausa_de is not null and p_dia between pl.pausa_de and pl.pausa_ate)
    and extract(dow from p_dia)::smallint = any (pl.dias)
    and public.creche_abre(s.horario, p_dia)
    and not public.dia_fechado(pl.petshop_id, p_dia)
    and not exists (select 1 from public.creche_faltas f where f.pet_id = pl.pet_id and f.dia = p_dia)
    and not exists (
      select 1 from public.estadias e
      where e.pet_id = pl.pet_id and e.tipo = 'creche' and (
        (e.status in ('reservada', 'em_casa')
          and public.estadia_ocupa(e.tipo, e.status, (e.entrada at time zone s.fuso)::date, (e.saida_prevista at time zone s.fuso)::date, p_dia, p_hoje))
        or (e.status = 'encerrada' and coalesce(e.dia, (e.entrada at time zone s.fuso)::date) = p_dia)))
$$;

-- Mensalidade proporcional: o dia fechado fica fora da conta, dos dois lados (não é dia do plano), igual ao dia da semana
-- em que o negócio não abre. Feriado no mês não dá desconto. (Mesma conta de `sugestaoDoMes` em src/lib/gestao/creche.ts.)
create or replace function public.creche_sugestao_mensal(p_plano uuid, p_mes date, p_valor numeric) returns numeric
language sql stable security definer set search_path = '' as $$
  select case when t.todos = 0 or t.restam = t.todos then p_valor
              else round(p_valor * t.restam / t.todos, 2) end
  from public.creche_planos pl
  join public.petshops s on s.id = pl.petshop_id,
  lateral (
    select count(*) filter (where d::date >= pl.inicio and not (pl.pausa_de is not null and d::date between pl.pausa_de and pl.pausa_ate)) as restam, count(*) as todos
    from generate_series(date_trunc('month', p_mes)::date, (date_trunc('month', p_mes) + interval '1 month - 1 day')::date, interval '1 day') d
    where extract(dow from d)::smallint = any (pl.dias) and public.creche_abre(s.horario, d::date)
      and not public.dia_fechado(pl.petshop_id, d::date)
  ) t
  where pl.id = p_plano
$$;

-- Chamada: igual a antes, e
-- - dia marcado como fechado não é dia do plano: "chegou" e "faltou" são recusados; quem vier entra como 'extra' ou
--   'reposicao' (sem cobrança), que é a escolha de quem marca na tela. Nunca vira dia do plano nem dia extra sozinho;
-- - "saiu" depois do horário, com a regra de taxa ligada, anota o atraso (sem valor) e devolve 'atraso': true;
-- - "desfazer" a saída apaga a anotação do atraso; se a taxa já foi cobrada, pede para desfazer a cobrança antes.
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

  if p_acao in ('chegou', 'extra', 'reposicao') then
    if v_e.id is not null then return jsonb_build_object('ok', true, 'repetido', true, 'estadia', v_e.id); end if;
    if p_acao = 'chegou' and not v_do_plano then raise exception 'Esse dia não é do plano de %. Use "Veio fora do dia".', v_pet.nome; end if;
    if p_acao <> 'chegou' and v_do_plano then raise exception 'Esse dia já é do plano de %. Marque "Chegou" na chamada.', v_pet.nome; end if;
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
    if p_dia = v_hoje then
      select * into v_outra from public.estadias e where e.pet_id = pl.pet_id and e.status = 'em_casa' limit 1;
      if found then
        raise exception '% já está na casa desde %. Faça a saída antes de marcar a chegada de hoje.', v_pet.nome, to_char(v_outra.entrada at time zone s.fuso, 'DD/MM');
      end if;
      insert into public.estadias (petshop_id, pet_id, tipo, entrada, status, plano_id, mensalista, dia)
        values (pl.petshop_id, pl.pet_id, 'creche', now(), 'em_casa', pl.id, case p_acao when 'chegou' then 'plano' else p_acao end, p_dia)
        returning * into v_e;
    else
      -- dia que já passou: a presença entra encerrada, das 8h às 18h daquele dia
      insert into public.estadias (petshop_id, pet_id, tipo, entrada, saida, status, plano_id, mensalista, dia, diarias_cobradas)
        values (pl.petshop_id, pl.pet_id, 'creche', (p_dia::timestamp + time '08:00') at time zone s.fuso, (p_dia::timestamp + time '18:00') at time zone s.fuso,
          'encerrada', pl.id, case p_acao when 'chegou' then 'plano' else p_acao end, p_dia, 1)
        returning * into v_e;
    end if;
    return jsonb_build_object('ok', true, 'estadia', v_e.id);
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
  if v_e.id is null then return jsonb_build_object('ok', true, 'repetido', true); end if;
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

-- ============================================================
-- Cobrança do mês: as taxas de busca fora do horário entram como os dias extras
-- ============================================================
-- Igual a antes; as taxas que quem recebe mandou para a mensalidade (de meses anteriores, ainda sem cobrança) entram em
-- `taxas` e somam em valor_extras. Sem nenhuma taxa, a cobrança sai idêntica.
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
  select * into s from public.petshops where id = pl.petshop_id;
  select * into v from public.creche_planos_valores where plano_id = pl.id;
  if v.plano_id is null then raise exception 'Defina o valor da mensalidade deste plano antes de gerar a cobrança.'; end if;
  v_mensal := coalesce(p_valor, public.creche_sugestao_mensal(pl.id, v_mes, v.valor_mensal));
  if v_mensal < 0 or v_mensal > 99999.99 then raise exception 'Confira o valor da mensalidade.'; end if;
  v_unit := coalesce(v.valor_extra, s.diaria_creche, 0);
  select coalesce(jsonb_agg(jsonb_build_object('dia', e.dia, 'valor', v_unit) order by e.dia), '[]'::jsonb), coalesce(count(*) * v_unit, 0)
    into v_extras, v_extras_total
    from public.estadias e
    where e.pet_id = pl.pet_id and e.mensalista = 'extra' and e.status <> 'cancelada' and e.cobranca_id is null and e.dia < v_mes;
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
    update public.creche_cobrancas set status = 'aberta', cliente_id = v_cliente, valor_cheio = v.valor_mensal, valor_mensal = v_mensal, extras = v_extras, taxas = v_taxas,
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
    where e.pet_id = pl.pet_id and e.mensalista = 'extra' and e.status <> 'cancelada' and e.cobranca_id is null and e.dia < v_mes;
  update public.creche_atrasos a set cobranca_id = v_id
    where a.pet_id = pl.pet_id and a.estado = 'mensalidade' and a.cobranca_id is null and a.dia < v_mes;
  perform public.creche_cobranca_lancar(v_id);
  return v_id;
end $$;

-- A conta a receber ganha uma linha "Busca fora do horário (datas)" quando a cobrança tem taxas. Sem taxa, os itens são os de antes.
create or replace function public.creche_cobranca_lancar(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.creche_cobrancas;
  v_pet text;
  v_itens jsonb;
  v_desc text;
  v_dias text;
  v_unit numeric;
  v_n int;
  v_t int;
  v_taxas numeric;
  v_dos_dias numeric;
  v_recebido numeric := 0;
begin
  select * into c from public.creche_cobrancas where id = p_id;
  select nome into v_pet from public.pets where id = c.pet_id;
  if c.lancamento_id is not null then v_recebido := public.recebido_em_partes(c.lancamento_id); end if;
  perform set_config('maestro.creche', '1', true);
  if c.status <> 'aberta' or c.total <= 0 then
    if v_recebido > 0 then
      raise exception 'Esta mensalidade já teve % recebidos. Para cancelar ou zerar, apague antes esses recebimentos no Financeiro.', replace(to_char(v_recebido, 'FM999999990D00'), '.', ',');
    end if;
    if c.lancamento_id is not null then
      update public.creche_cobrancas set lancamento_id = null where id = c.id;
      delete from public.lancamentos where id = c.lancamento_id and not pago;
    end if;
    return;
  end if;
  if v_recebido > 0 and c.total <= v_recebido then
    raise exception 'Esta mensalidade já teve % recebidos: o total precisa ficar maior que isso.', replace(to_char(v_recebido, 'FM999999990D00'), '.', ',');
  end if;
  v_n := jsonb_array_length(c.extras);
  v_desc := 'Mensalidade de ' || public.creche_nome_mes(c.mes) || ' · ' || coalesce(v_pet, 'pet');
  v_itens := jsonb_build_array(jsonb_build_object('tipo', 'servico', 'nome', 'Mensalidade de ' || public.creche_nome_mes(c.mes), 'qtd', 1, 'valor', c.valor_mensal));
  -- valor_extras soma os dias extras e as taxas de busca fora do horário; cada um vira uma linha da conta
  v_t := jsonb_array_length(c.taxas);
  select coalesce(sum((x ->> 'valor')::numeric), 0) into v_taxas from jsonb_array_elements(c.taxas) x;
  v_dos_dias := c.valor_extras - v_taxas;
  if v_n > 0 and v_dos_dias > 0 then
    select string_agg(to_char((x ->> 'dia')::date, 'DD/MM'), ', ' order by x ->> 'dia') into v_dias from jsonb_array_elements(c.extras) x;
    v_unit := round(v_dos_dias / v_n, 2);
    if v_unit * v_n = v_dos_dias then
      v_itens := v_itens || jsonb_build_object('tipo', 'servico', 'nome', case when v_n = 1 then 'Dia extra (' else 'Dias extras (' end || v_dias || ')', 'qtd', v_n, 'valor', v_unit);
    else
      v_itens := v_itens || jsonb_build_object('tipo', 'servico', 'nome', 'Dias extras (' || v_dias || ')', 'qtd', 1, 'valor', v_dos_dias);
    end if;
  end if;
  if v_t > 0 and v_taxas > 0 then
    select string_agg(to_char((x ->> 'dia')::date, 'DD/MM'), ', ' order by x ->> 'dia') into v_dias from jsonb_array_elements(c.taxas) x;
    v_unit := round(v_taxas / v_t, 2);
    if v_unit * v_t = v_taxas then
      v_itens := v_itens || jsonb_build_object('tipo', 'extra', 'nome', 'Busca fora do horário (' || v_dias || ')', 'qtd', v_t, 'valor', v_unit);
    else
      v_itens := v_itens || jsonb_build_object('tipo', 'extra', 'nome', 'Busca fora do horário (' || v_dias || ')', 'qtd', 1, 'valor', v_taxas);
    end if;
  end if;
  if c.lancamento_id is not null then
    update public.lancamentos set valor = c.total - v_recebido, data = c.vencimento, vencimento = c.vencimento, descricao = v_desc, itens = v_itens, cliente_id = c.cliente_id
      where id = c.lancamento_id and not pago;
  else
    insert into public.lancamentos (petshop_id, tipo, valor, forma, categoria, descricao, data, vencimento, pago, cliente_id, origem, criado_por, itens)
      values (c.petshop_id, 'entrada', c.total, null, 'Creche: mensalidade', v_desc, c.vencimento, c.vencimento, false, c.cliente_id, 'tela', (select auth.uid()), v_itens)
      returning id into c.lancamento_id;
    update public.creche_cobrancas set lancamento_id = c.lancamento_id where id = c.id;
  end if;
end $$;

-- Cancelar a cobrança: as taxas, como os dias extras, voltam a ficar sem cobrança e entram na próxima.
create or replace function public.creche_cobranca_cancelar(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.creche_cobrancas;
begin
  select * into c from public.creche_cobrancas where id = p_id for update;
  if not found or not public.cuido_do_financeiro(c.petshop_id) then raise exception 'Cobrança não encontrada.'; end if;
  if not public.acesso_liberado(c.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if c.status <> 'aberta' then return; end if;
  if public.creche_cobranca_paga(c.lancamento_id) then raise exception 'Esta mensalidade já foi paga. Desfaça o recebimento antes de cancelar.'; end if;
  update public.creche_cobrancas set status = 'cancelada' where id = c.id;
  perform public.creche_cobranca_lancar(c.id);
  update public.estadias set cobranca_id = null where cobranca_id = c.id;
  update public.creche_atrasos set cobranca_id = null where cobranca_id = c.id;
end $$;

-- ============================================================
-- Anotar e decidir a taxa
-- ============================================================
-- Saída de mensalista feita fora da chamada (Encerrar o dia, cartão de quem ficou sem plano): a tela pede para o banco
-- conferir a hora da saída e anotar o atraso, sem valor. Qualquer pessoa da creche chama; devolve se ficou anotado.
create function public.creche_atraso_anotar(p_estadia uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  e public.estadias;
  s public.petshops;
  v_limite text;
begin
  select * into e from public.estadias where id = p_estadia;
  if not found or not public.tenho_area(e.petshop_id, array['creche_hotel']) then raise exception 'Saída não encontrada.'; end if;
  if not public.acesso_liberado(e.petshop_id) then return false; end if;
  -- só a saída de agora há pouco de um mensalista da creche
  if e.tipo <> 'creche' or e.mensalista is null or e.status <> 'encerrada' or e.saida is null or e.saida < now() - interval '12 hours' or e.saida > now() + interval '5 minutes' then
    return false;
  end if;
  v_limite := public.creche_saida_atrasada(e.petshop_id, e.saida);
  if v_limite is null then return false; end if;
  select * into s from public.petshops where id = e.petshop_id;
  insert into public.creche_atrasos (estadia_id, petshop_id, pet_id, plano_id, dia, saiu_em, limite)
    values (e.id, e.petshop_id, e.pet_id, e.plano_id, coalesce(e.dia, (e.saida at time zone s.fuso)::date), e.saida, v_limite)
    on conflict (estadia_id) do nothing;
  return true;
end $$;

-- Quem recebe decide a taxa de uma saída de mensalista: 'mensalidade' (entra na próxima cobrança do mês), 'recebida'
-- (recebida na hora: a tela reserva sem lançamento, lança o pagamento e chama de novo com o lançamento), 'dispensada'
-- (não cobrar) ou 'pendente' (volta a pedir decisão). p_valor é o valor que a pessoa viu na tela; vazio = o da regra.
-- Sem anotação ainda (a tela decidiu na hora da saída), a linha é criada aqui.
create function public.creche_atraso_decidir(p_estadia uuid, p_decisao text, p_valor numeric default null, p_lancamento uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e public.estadias;
  a public.creche_atrasos;
  s public.petshops;
  v_regra jsonb;
  v_valor numeric;
  v_eu uuid := (select auth.uid());
  v_aberta boolean;
begin
  select * into e from public.estadias where id = p_estadia for update;
  if not found or not public.tenho_area(e.petshop_id, array['caixa', 'financeiro', 'relatorios']) then raise exception 'Saída não encontrada.'; end if;
  if not public.acesso_liberado(e.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if p_decisao is null or p_decisao not in ('mensalidade', 'recebida', 'dispensada', 'pendente') then raise exception 'Ação inválida.'; end if;
  if e.tipo <> 'creche' or e.mensalista is null or e.status <> 'encerrada' then
    raise exception 'Esta decisão vale para a saída de um mensalista da creche.';
  end if;
  -- a cobrança do mês junta as taxas com os planos do pet travados: quem decide espera a vez
  perform 1 from public.creche_planos where pet_id = e.pet_id for update;
  select * into a from public.creche_atrasos where estadia_id = e.id for update;
  if a.estadia_id is not null then
    if a.cobranca_id is not null then raise exception 'Esta taxa já entrou na cobrança do mês. Para mudar, cancele a cobrança em Creche, Cobranças.'; end if;
    if a.estado = 'recebida' and a.lancamento_id is not null then raise exception 'Esta taxa já foi recebida. Para mudar, apague o recebimento no Financeiro.'; end if;
    -- ainda pede decisão: pendente, ou recebida que ficou sem lançamento
    v_aberta := a.estado = 'pendente' or (a.estado = 'recebida' and (a.decidido_por is not distinct from v_eu or a.decidido_em < now() - interval '2 minutes'));
    if a.estado = 'recebida' and not v_aberta then raise exception 'Outra pessoa está recebendo esta taxa agora. Atualize a tela em um instante.'; end if;
    if not v_aberta and p_decisao <> 'pendente' and a.decidido_por is distinct from v_eu then
      raise exception 'Outra pessoa já decidiu esta taxa.';
    end if;
  elsif p_decisao = 'pendente' then
    return jsonb_build_object('ok', true, 'estado', null);
  end if;
  select * into s from public.petshops where id = e.petshop_id;
  select r.atraso into v_regra from public.hotel_precos r where r.petshop_id = e.petshop_id;
  if p_decisao in ('mensalidade', 'recebida') then
    v_valor := coalesce(p_valor, case when jsonb_typeof(v_regra -> 'creche' -> 'valor') = 'number' then (v_regra -> 'creche' ->> 'valor')::numeric end);
    if v_valor is null or v_valor <= 0 or v_valor > 9999.99 then raise exception 'Confira o valor da taxa.'; end if;
    v_valor := round(v_valor, 2);
  end if;
  if p_decisao = 'recebida' and p_lancamento is not null
     and not exists (select 1 from public.lancamentos l where l.id = p_lancamento and l.petshop_id = e.petshop_id and l.tipo = 'entrada') then
    raise exception 'Recebimento não encontrado.';
  end if;
  insert into public.creche_atrasos (estadia_id, petshop_id, pet_id, plano_id, dia, saiu_em, limite, estado, valor, lancamento_id, decidido_por, decidido_em)
    values (e.id, e.petshop_id, e.pet_id, e.plano_id, coalesce(e.dia, (coalesce(e.saida, now()) at time zone s.fuso)::date), coalesce(e.saida, now()),
      coalesce(case when (v_regra -> 'creche' ->> 'hora') ~ '^([01]\d|2[0-3]):[0-5]\d$' then v_regra -> 'creche' ->> 'hora' end, ''),
      p_decisao, v_valor, case when p_decisao = 'recebida' then p_lancamento end,
      case when p_decisao = 'pendente' then null else v_eu end, case when p_decisao = 'pendente' then null else now() end)
    on conflict (estadia_id) do update set estado = excluded.estado, valor = excluded.valor, lancamento_id = excluded.lancamento_id,
      decidido_por = excluded.decidido_por, decidido_em = excluded.decidido_em;
  return jsonb_build_object('ok', true, 'estado', p_decisao);
end $$;

revoke execute on function public.creche_atraso_anotar(uuid), public.creche_atraso_decidir(uuid, text, numeric, uuid) from public, anon;
grant execute on function public.creche_atraso_anotar(uuid), public.creche_atraso_decidir(uuid, text, numeric, uuid) to authenticated;

notify pgrst, 'reload schema';
