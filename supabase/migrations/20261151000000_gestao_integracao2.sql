-- Integração da terceira rodada. Tudo aqui é acréscimo (funções novas): o aplicativo que está no ar não usa nada disto.
-- Aplicar ANTES de publicar o código novo, junto com as migrações 20261144 a 20261150 (menos a 20261149, que vem depois).

-- ---------- check-outs para cobrar, sem filtrar pela coluna reservada ----------
-- Depois da migração 20261149 ninguém filtra `estadias` por `valor_cobrado` pela API (a coluna deixa de ser lida direto).
-- Esta função entrega, só para quem recebe (Caixa, Financeiro, Relatórios ou o dono), as estadias encerradas que saíram
-- sem valor lançado: é a lista "Check-outs para cobrar" e o aviso da tela Hoje.
create function public.estadias_para_cobrar(p uuid) returns table (id uuid, saida timestamptz)
language sql stable security definer set search_path = '' as $$
  select e.id, e.saida
  from public.estadias e
  where e.petshop_id = p and e.status = 'encerrada' and e.valor_cobrado is null and e.diarias_cobradas is not null
    and e.mensalista is null and position('Saiu usando o pacote.' in coalesce(e.obs, '')) = 0
    and (select public.tenho_area(p, array['caixa', 'financeiro', 'relatorios']))
$$;
revoke execute on function public.estadias_para_cobrar(uuid) from public, anon;
grant execute on function public.estadias_para_cobrar(uuid) to authenticated;

-- Acerta um check-out que ficou para cobrar: grava as diárias e o valor cobrado só se a estadia ainda está sem valor
-- (duas pessoas recebendo a mesma estadia ao mesmo tempo: só a primeira grava). Mesma permissão de editar a estadia
-- pela tabela (área Creche e hotel, conta liberada), e só quem recebe.
create function public.estadia_acertar(p_id uuid, p_diarias integer, p_valor numeric, p_obs text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_petshop uuid;
begin
  select e.petshop_id into v_petshop from public.estadias e where e.id = p_id;
  if v_petshop is null
     or not (select public.tenho_area(v_petshop, array['creche_hotel']))
     or not (select public.tenho_area(v_petshop, array['caixa', 'financeiro', 'relatorios']))
     or not (select public.acesso_liberado(v_petshop)) then
    raise exception 'Só quem cuida do caixa acerta esse check-out.';
  end if;
  if p_diarias is null or p_diarias < 1 or p_valor is null or p_valor < 0 then raise exception 'Confira as diárias e o valor.'; end if;
  update public.estadias e set diarias_cobradas = p_diarias, valor_cobrado = round(p_valor, 2), obs = coalesce(p_obs, e.obs)
    where e.id = p_id and e.status = 'encerrada' and e.valor_cobrado is null and e.mensalista is null;
  return found;
end $$;
revoke execute on function public.estadia_acertar(uuid, integer, numeric, text) from public, anon;
grant execute on function public.estadia_acertar(uuid, integer, numeric, text) to authenticated;

-- ---------- repetição "até eu cancelar" com vários serviços ----------
-- Mesma função da migração 20261144 (mesma assinatura); agora os horários novos levam também os outros serviços do
-- horário copiado (tabela agendamento_servicos, da migração 20261147). Série com um serviço só: igual a antes.
create or replace function public.serie_continuar(p_serie uuid, p_depois_de timestamptz, p_vezes integer default 12) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  s public.series_agenda;
  m public.agendamentos;
  v_fuso text;
  v_ultimo timestamptz;
  v_local timestamp;
  v_quando timestamptz;
  v_feitos integer := 0;
  v_voltas integer := 0;
  v_novo uuid;
begin
  select * into s from public.series_agenda where serie_id = p_serie for update;
  if not found or s.encerrada_em is not null then return 0; end if;
  select max(a.inicio) into v_ultimo from public.agendamentos a where a.serie_id = p_serie and a.petshop_id = s.petshop_id;
  if v_ultimo is null or v_ultimo > p_depois_de then return 0; end if;
  select * into m from public.agendamentos a
    where a.serie_id = p_serie and a.petshop_id = s.petshop_id and a.status not in ('cancelado', 'faltou') order by a.inicio desc limit 1;
  if not found then return 0; end if;
  select coalesce(x.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops x where x.id = s.petshop_id;
  -- o dia vem do último horário da série; a hora, do último que está de pé
  v_local := (v_ultimo at time zone v_fuso)::date + (m.inicio at time zone v_fuso)::time;
  while v_feitos < least(greatest(coalesce(p_vezes, 12), 1), 26) and v_voltas < 80 loop
    v_voltas := v_voltas + 1;
    v_local := v_local + make_interval(days => 7 * s.cada_semanas);
    v_quando := v_local at time zone v_fuso;
    continue when v_quando < now();
    insert into public.agendamentos (petshop_id, pet_id, servico_id, profissional_id, inicio, fim, preco, obs, leva_traz, endereco_leva_traz, criado_por, serie_id)
    values (s.petshop_id, m.pet_id, m.servico_id, m.profissional_id, v_quando, v_quando + (m.fim - m.inicio), m.preco, m.obs, m.leva_traz, m.endereco_leva_traz,
      (select auth.uid()), p_serie)
    returning id into v_novo;
    insert into public.agendamento_servicos (petshop_id, agendamento_id, servico_id, preco, ordem)
      select x.petshop_id, v_novo, x.servico_id, x.preco, x.ordem from public.agendamento_servicos x where x.agendamento_id = m.id;
    v_feitos := v_feitos + 1;
  end loop;
  return v_feitos;
end $$;

-- ---------- quem veio buscar: apagar a anotação ----------
-- Saída desfeita e refeita com "Seguir sem marcar": a anotação antiga de quem buscou precisa sair. Faltava poder apagar.
grant delete on public.estadias_retiradas to authenticated;
create policy estadias_retiradas_remover on public.estadias_retiradas for delete to authenticated
  using ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)));

-- ---------- lista de espera pelo link ----------
-- Dia marcado como fechado não tem lista de espera na creche (antes só o dia da semana sem atendimento era recusado;
-- o dia fechado voltava de link_estadia_cheios como "cheio" e o pedido de espera entrava). Mesma assinatura.
create or replace function public.link_espera_pedir(
  p_codigo text, p_tipo text, p_entrada date, p_saida date, p_tutor text, p_telefone text, p_pet text,
  p_especie text default 'cao', p_porte text default null, p_obs text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
  if p_tipo = 'creche' and exists (select 1 from generate_series(p_entrada, v_ate, interval '1 day') d where not public.creche_abre(v.horario, d::date) or public.dia_fechado(v.id, d::date)) then
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
end $$;

-- Com as regras do link ligadas, o pedido de espera também só entra com o aceite, e a data do aceite fica guardada.
alter table public.lista_espera add column termos_aceitos_em timestamptz;
-- Mesma função da migração 20261148 (mesma assinatura), aceitando também link_espera_pedir.
create or replace function public.link_pedir_com_termos(p_funcao text, p_args jsonb, p_termos text default null, p_vacinas boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.petshops;
  o jsonb;
  v_lista text;
  r jsonb;
  v_id uuid;
  v_grupo uuid;
begin
  if p_funcao not in ('link_pedir', 'link_pedir_estadia', 'link_espera_pedir') or jsonb_typeof(p_args) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_args) k where k !~ '^p_[a-z_]{1,40}$') then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end if;
  select * into v from public.petshops where link_codigo = p_args ->> 'p_codigo' and link_ativo;
  if not found or not public.acesso_liberado(v.id) then return jsonb_build_object('ok', false, 'erro', 'fechado'); end if;
  o := public.link_opcoes_de(v.opcoes);
  if (o ->> 'termos')::boolean then
    if regexp_replace(btrim(coalesce(p_termos, '')), '\r', '', 'g') <> regexp_replace(o ->> 'texto', '\r', '', 'g')
       or ((o ->> 'vacinas')::boolean and not coalesce(p_vacinas, false)) then
      return jsonb_build_object('ok', false, 'erro', 'termos');
    end if;
  end if;
  select string_agg(format('%I => %L', e.key,
      case jsonb_typeof(e.value) when 'null' then null when 'string' then e.value #>> '{}' else e.value::text end), ', ')
    into v_lista from jsonb_each(p_args) e;
  begin
    execute format('select public.%I(%s)', p_funcao, v_lista) into r;
  exception when undefined_function or invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end;
  if (o ->> 'termos')::boolean and r ->> 'ok' = 'true' and (r ->> 'id') is not null then
    v_id := (r ->> 'id')::uuid;
    if p_funcao = 'link_espera_pedir' then
      perform set_config('maestro.link', '1', true);
      update public.lista_espera set termos_aceitos_em = now() where id = v_id and petshop_id = v.id;
      perform set_config('maestro.link', '', true);
      return r;
    end if;
    select grupo_id into v_grupo from public.pedidos_agendamento where id = v_id;
    update public.pedidos_agendamento
      set termos_aceitos_em = now(), termos_texto = nullif(o ->> 'texto', ''), termos_vacinas = (o ->> 'vacinas')::boolean
      where petshop_id = v.id and (id = v_id or (v_grupo is not null and grupo_id = v_grupo));
  end if;
  return r;
end $$;

-- A data do aceite só é gravada pela função do link: pela tela, a equipe não cria nem muda.
create or replace function public.lista_espera_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.petshop_id := old.petshop_id; new.origem := old.origem; new.criado_em := old.criado_em; new.criado_por := old.criado_por; new.criado_nome := old.criado_nome;
    if coalesce(current_setting('maestro.link', true), '') <> '1' then new.termos_aceitos_em := old.termos_aceitos_em; end if;
  else
    new.criado_em := now();
    -- pelo link ninguém está logado: a função do link grava a origem; pela tela, é sempre "equipe"
    if (select auth.uid()) is not null then
      new.origem := 'equipe';
      new.termos_aceitos_em := null;
      new.criado_por := (select auth.uid());
      new.criado_nome := public.casa_quem_escreve(new.petshop_id);
    end if;
  end if;
  if new.pet_id is not null and not exists (select 1 from public.pets p where p.id = new.pet_id and p.petshop_id = new.petshop_id) then
    raise exception 'Pet não encontrado neste pet shop.';
  end if;
  return new;
end $$;
revoke execute on function public.lista_espera_conferir() from public, anon, authenticated;

notify pgrst, 'reload schema';
