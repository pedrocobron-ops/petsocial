-- Creche, rodada de consertos 7 (achados do Rafael, rodada 3):
-- 1. Saldo de reposição: uma reposição (dia sem cobrança) precisa de uma falta para repor. A regra de quais faltas valem
--    fica nas opções do negócio ('creche.reposicao_prazo' e 'creche.reposicao_so_avisou', desligadas = qualquer falta do
--    plano, sem prazo). Sem falta para repor, a equipe não marca; o dono ou quem cuida do financeiro pode liberar assim
--    mesmo (ação 'reposicao_livre'), e fica anotado.
--    Toda reposição fica anotada em creche_reposicoes, também a marcada pelo dono (já aceita), com a falta que ela repõe.
-- 2. A geração automática das mensalidades não cria cobrança que nasceria vencida quando quem recebe acabou de escolher
--    "Cobrar por aqui" (primeira cobrança = este mês, ainda sem nenhuma cobrança do plano).
-- Só acrescenta: colunas com padrão, função nova, funções trocadas com a mesma assinatura. O código de hoje segue
-- funcionando: a única mudança que ele vê é a recusa de uma reposição sem falta para repor, com a explicação em português.
-- Não depende das migrações 20261149 nem 20261157.

-- ============================================================
-- 1. Saldo de reposição
-- ============================================================
alter table public.creche_reposicoes add column if not exists sem_falta boolean not null default false;
alter table public.creche_reposicoes add column if not exists falta_dia date;
-- a tabela já tem "grant select" inteiro para authenticated (vale para as colunas novas); só quem recebe lê (RLS)

-- Até quando uma falta pode ser reposta, pela regra do negócio.
create or replace function public.creche_reposicao_prazo(p_opcoes jsonb, p_falta date) returns date
language sql immutable set search_path = '' as $$
  select case coalesce(p_opcoes ->> 'creche.reposicao_prazo', '')
    when 'mes' then (date_trunc('month', p_falta) + interval '1 month - 1 day')::date
    when 'mes_seguinte' then (date_trunc('month', p_falta) + interval '2 months - 1 day')::date
    else 'infinity'::date end
$$;

-- Casa cada reposição do plano com uma falta (a de prazo mais curto que ainda vale), na ordem das datas.
-- p_novo: um dia a mais para testar ("cabe mais esta reposição?"). Devolve as faltas, as reposições e o par de cada uma.
create or replace function public.creche_reposicao_casar(p_plano uuid, p_novo date default null)
returns table (falta date, avisou boolean, prazo date, reposicao date)
language plpgsql stable security definer set search_path = '' as $$
declare
  pl public.creche_planos;
  v_opcoes jsonb;
  v_so_avisou boolean;
  f_dia date[]; f_avisou boolean[]; f_prazo date[]; f_par date[];
  r date;
  i int; v_melhor int;
begin
  select * into pl from public.creche_planos where id = p_plano;
  if not found then return; end if;
  select coalesce(s.opcoes, '{}'::jsonb) into v_opcoes from public.petshops s where s.id = pl.petshop_id;
  v_so_avisou := coalesce(jsonb_typeof(v_opcoes -> 'creche.reposicao_so_avisou') = 'boolean' and (v_opcoes ->> 'creche.reposicao_so_avisou')::boolean, false);
  select coalesce(array_agg(x.dia order by x.dia), '{}'), coalesce(array_agg(x.avisou order by x.dia), '{}'),
         coalesce(array_agg(public.creche_reposicao_prazo(v_opcoes, x.dia) order by x.dia), '{}')
    into f_dia, f_avisou, f_prazo
    from public.creche_faltas x where x.plano_id = pl.id and (not v_so_avisou or x.avisou);
  f_par := array_fill(null::date, array[greatest(cardinality(f_dia), 1)]);
  for r in
    select d from (
      select e.dia as d from public.estadias e
      where e.plano_id = pl.id and e.mensalista = 'reposicao' and e.status <> 'cancelada' and e.dia is not null
        and (p_novo is null or e.dia <> p_novo)
        and not exists (select 1 from public.creche_reposicoes cr where cr.estadia_id = e.id and cr.sem_falta)
      union all select p_novo where p_novo is not null
    ) t order by d
  loop
    v_melhor := null;
    for i in 1 .. cardinality(f_dia) loop
      if f_par[i] is null and f_dia[i] < r and f_prazo[i] >= r and (v_melhor is null or f_prazo[i] < f_prazo[v_melhor]) then v_melhor := i; end if;
    end loop;
    if v_melhor is not null then f_par[v_melhor] := r;
    else falta := null; avisou := null; prazo := null; reposicao := r; return next; end if;
  end loop;
  for i in 1 .. cardinality(f_dia) loop
    falta := f_dia[i]; avisou := f_avisou[i]; prazo := f_prazo[i]; reposicao := f_par[i]; return next;
  end loop;
end $$;
revoke all on function public.creche_reposicao_casar(uuid, date) from public, anon, authenticated;

-- Cabe mais uma reposição no dia? Cabe quando ela não deixa nenhuma reposição a mais sem falta (a conta é refeita do zero).
-- 'repoe' é a falta que ficou com ela (pode ficar vazia quando a conta troca os pares).
create or replace function public.creche_reposicao_cabe(p_plano uuid, p_dia date, out cabe boolean, out repoe date)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_antes int; v_depois int;
begin
  select count(*) into v_antes from public.creche_reposicao_casar(p_plano) c where c.falta is null;
  select count(*) into v_depois from public.creche_reposicao_casar(p_plano, p_dia) c where c.falta is null;
  -- (uma reposição que já existe nesse dia conta igual nas duas contas: cabe)
  cabe := v_depois <= v_antes;
  -- sem lugar, ela não repõe falta nenhuma (a conta a deixaria com a falta de outra reposição)
  if cabe then
    select c.falta into repoe from public.creche_reposicao_casar(p_plano, p_dia) c where c.reposicao = p_dia and c.falta is not null limit 1;
  end if;
end $$;
revoke all on function public.creche_reposicao_cabe(uuid, date) from public, anon, authenticated;

-- O saldo de reposição de um mensalista, para a tela (sem valor nenhum: só datas).
-- p_dia: o dia em que a reposição seria marcada (vazio = hoje). 'cabe' diz se dá para marcar mais uma nesse dia,
-- e 'repoe' qual falta ela repõe. 'livres' são as faltas que ainda podem ser repostas nesse dia.
create or replace function public.creche_reposicao_saldo(p_plano uuid, p_dia date default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  pl public.creche_planos;
  s public.petshops;
  v_dia date;
  v_repoe date;
  v_cabe boolean;
begin
  select * into pl from public.creche_planos where id = p_plano;
  if not found or not public.tenho_area(pl.petshop_id, array['creche_hotel']) then raise exception 'Plano não encontrado.'; end if;
  select * into s from public.petshops where id = pl.petshop_id;
  v_dia := coalesce(p_dia, (now() at time zone s.fuso)::date);
  select c.cabe, c.repoe into v_cabe, v_repoe from public.creche_reposicao_cabe(pl.id, v_dia) c;
  return jsonb_build_object(
    'cabe', v_cabe,
    'repoe', v_repoe,
    'prazo', coalesce(s.opcoes ->> 'creche.reposicao_prazo', ''),
    'so_avisou', coalesce(jsonb_typeof(s.opcoes -> 'creche.reposicao_so_avisou') = 'boolean' and (s.opcoes ->> 'creche.reposicao_so_avisou')::boolean, false),
    -- faltas ainda sem reposição que valem no dia (sem contar a reposição que se está testando)
    'livres', coalesce((select jsonb_agg(c.falta order by c.falta) from public.creche_reposicao_casar(pl.id) c
                         where c.falta is not null and c.reposicao is null and c.falta < v_dia and c.prazo >= v_dia), '[]'::jsonb),
    -- faltas sem reposição cujo prazo já passou
    'vencidas', coalesce((select jsonb_agg(c.falta order by c.falta) from public.creche_reposicao_casar(pl.id) c
                         where c.falta is not null and c.reposicao is null and c.prazo < v_dia), '[]'::jsonb),
    'pares', coalesce((select jsonb_agg(jsonb_build_object('falta', c.falta, 'reposicao', c.reposicao) order by c.reposicao)
                        from public.creche_reposicao_casar(pl.id) c where c.falta is not null and c.reposicao is not null), '[]'::jsonb),
    'sem_falta', coalesce((select jsonb_agg(e.dia order by e.dia) from public.estadias e
                            join public.creche_reposicoes cr on cr.estadia_id = e.id and cr.sem_falta
                            where e.plano_id = pl.id and e.mensalista = 'reposicao' and e.status <> 'cancelada'), '[]'::jsonb)
  );
end $$;
revoke all on function public.creche_reposicao_saldo(uuid, date) from public, anon;
grant execute on function public.creche_reposicao_saldo(uuid, date) to authenticated;

-- A chamada, com o saldo de reposição. Mesma assinatura; ação nova 'reposicao_livre' (só dono ou quem cuida do financeiro).
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
end $$;

-- ============================================================
-- 2. Geração automática e "Cobrar por aqui"
-- ============================================================
-- Igual à de 20261153, e também espera a escolha na tela quando a primeira cobrança é deste mês (quem recebe tocou
-- "Cobrar por aqui" depois de ter marcado o mês como pago por fora) e ela já nasceria vencida.
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
      -- primeira cobrança do plano, sem escolha do jeito de cobrar, e que já nasceria vencida: espera a escolha na tela
      and not ((pl.primeira_cobranca is null or pl.primeira_cobranca = v_mes)
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
