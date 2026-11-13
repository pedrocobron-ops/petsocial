-- Link do cliente: aceite de regras e de vacinas em dia, e o tutor cancelando ou pedindo outra data pela página do pedido.
-- Tudo opcional e desligado: as chaves ficam em petshops.opcoes ("link.termos", "link.termos_texto", "link.termos_vacinas",
-- "link.cancelar", "link.cancelar_horas"). Sem as chaves, nada muda.
-- Só acrescenta: colunas novas em pedidos_agendamento e funções novas. link_pedir, link_pedir_estadia, link_horarios,
-- link_estadia_cheios, link_pedido e pedido_aceitar seguem como estavam, então o código de antes continua funcionando neste banco.
-- A única função trocada é link_vaga (mesma assinatura), no fim do arquivo, para consertar uma conta de vagas.

-- ---------- o que o pedido guarda ----------
-- Aceite: quando foi, o texto exato que o tutor leu e se declarou as vacinas em dia.
-- Cancelado pelo tutor: status vira 'recusado' (libera a vaga e deixa pedir de novo) com cliente_cancelou_em preenchido;
--   avisado_em volta a ficar vazio para o pedido aparecer para a equipe até alguém ver.
-- Pedido do tutor que a equipe resolve: cliente_pediu = 'mudar' (outra data) ou 'cancelar' (há dinheiro no meio: quem decide é o dono).
alter table public.pedidos_agendamento
  add column termos_aceitos_em timestamptz,
  add column termos_texto text check (char_length(termos_texto) <= 2000),
  add column termos_vacinas boolean,
  add column cliente_cancelou_em timestamptz,
  add column cliente_pediu text check (cliente_pediu in ('cancelar', 'mudar')),
  add column cliente_pediu_em timestamptz,
  add column cliente_recado text check (char_length(cliente_recado) <= 300),
  add column cliente_pedido_visto_em timestamptz;
-- a equipe só marca que já viu o pedido do tutor; o resto quem grava são as funções abaixo
grant update (cliente_pedido_visto_em) on public.pedidos_agendamento to authenticated;

-- ---------- as opções do link, lidas com cuidado (o campo é livre) ----------
create function public.link_opcoes_de(p_opcoes jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  -- chave ausente ou com outro tipo vale desligado (nunca nulo: quem lê decide com sim ou não)
  select jsonb_build_object(
    'termos', coalesce((p_opcoes -> 'link.termos') = 'true'::jsonb, false)
      and (t.texto <> '' or coalesce((p_opcoes -> 'link.termos_vacinas') = 'true'::jsonb, false)),
    'texto', t.texto,
    'vacinas', coalesce((p_opcoes -> 'link.termos_vacinas') = 'true'::jsonb, false),
    'cancelar', coalesce((p_opcoes -> 'link.cancelar') = 'true'::jsonb, false),
    'horas', case when jsonb_typeof(p_opcoes -> 'link.cancelar_horas') = 'number'
      then least(720, greatest(0, round((p_opcoes ->> 'link.cancelar_horas')::numeric)))::int else 24 end
  )
  from (select case when jsonb_typeof(p_opcoes -> 'link.termos_texto') = 'string' then left(btrim(p_opcoes ->> 'link.termos_texto'), 2000) else '' end as texto) t
$$;
revoke execute on function public.link_opcoes_de(jsonb) from public, anon, authenticated;

-- O que a página do link mostra: as regras que o tutor precisa aceitar (escritas pelo dono) e se ele pode cancelar por lá.
create function public.link_opcoes(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'termos', case when (o.v ->> 'termos')::boolean then jsonb_build_object('texto', o.v ->> 'texto', 'vacinas', (o.v ->> 'vacinas')::boolean) else null end,
    'cancelar', case when (o.v ->> 'cancelar')::boolean then jsonb_build_object('horas', (o.v ->> 'horas')::int) else null end
  )
  from public.petshops p, lateral (select public.link_opcoes_de(p.opcoes) as v) o
  where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)
$$;

-- Nome de quem é o link, mesmo com o link desligado (para a página dizer com quem falar). Só o nome.
create function public.link_nome(p_codigo text) returns text
language sql stable security definer set search_path = '' as $$
  select p.nome from public.petshops p where p.link_codigo = p_codigo
$$;

-- ---------- pedido com aceite ----------
-- Chama a função de pedido de sempre (link_pedir ou link_pedir_estadia) com os mesmos argumentos, pelo nome de cada um,
-- e grava o aceite no pedido na mesma transação. Assim, argumento novo que essas funções ganharem passa por aqui sem mudança.
-- Com as regras ligadas, só entra se o tutor aceitou exatamente o texto que está valendo (e as vacinas, se o dono pede).
create function public.link_pedir_com_termos(p_funcao text, p_args jsonb, p_termos text default null, p_vacinas boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.petshops;
  o jsonb;
  v_lista text;
  r jsonb;
  v_id uuid;
  v_grupo uuid;
begin
  if p_funcao not in ('link_pedir', 'link_pedir_estadia') or jsonb_typeof(p_args) <> 'object'
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
    select grupo_id into v_grupo from public.pedidos_agendamento where id = v_id;
    update public.pedidos_agendamento
      set termos_aceitos_em = now(), termos_texto = nullif(o ->> 'texto', ''), termos_vacinas = (o ->> 'vacinas')::boolean
      where petshop_id = v.id and (id = v_id or (v_grupo is not null and grupo_id = v_grupo));
  end if;
  return r;
end $$;

-- ---------- a página do pedido: o que o tutor pode fazer ----------
-- Situação de cada pet do pedido para cancelar:
--   'pendente' (ainda sem resposta), 'ativo' (aceito e ainda por vir), 'cliente' (o tutor cancelou), 'fechado' (o resto).
create function public.link_pedido_itens(p_id uuid) returns table (id uuid, estado text, comeca timestamptz, dinheiro boolean, chave text)
language sql stable security definer set search_path = '' as $$
  select x.id,
    case when x.cliente_cancelou_em is not null then 'cliente'
         when x.status = 'pendente' then 'pendente'
         when x.status = 'aceito' and (a.status in ('marcado', 'confirmado') or e.status = 'reservada') then 'ativo'
         else 'fechado' end,
    coalesce(a.inicio, e.entrada, x.inicio),
    -- dinheiro no meio: sinal da reserva (pago ou a receber), conta lançada para o horário ou uso de pacote
    coalesce(e.sinal_estado in ('a_receber', 'pago'), false) or a.pacote_cliente_id is not null
      or exists (select 1 from public.lancamentos l where l.agendamento_id = a.id and l.tipo = 'entrada'),
    -- a mesma identificação que a página monta com o que link_pedido devolve (pet, dia e hora)
    x.pet_nome || '|' || to_char(coalesce(a.inicio, e.entrada, x.inicio) at time zone s.fuso, 'YYYY-MM-DD')
      || '|' || to_char(coalesce(a.inicio, x.inicio) at time zone s.fuso, 'HH24:MI')
  from public.pedidos_agendamento p
  join public.petshops s on s.id = p.petshop_id
  join public.pedidos_agendamento x on x.id = p.id or (p.grupo_id is not null and x.grupo_id = p.grupo_id and x.petshop_id = p.petshop_id)
  left join public.agendamentos a on a.id = x.agendamento_id
  left join public.estadias e on e.id = x.estadia_id
  where p.id = p_id
$$;
revoke execute on function public.link_pedido_itens(uuid) from public, anon, authenticated;

-- Quem tem o endereço do pedido vê o que pode fazer com ele. Não mostra nada além do próprio pedido.
create function public.link_pedido_cliente(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.pedidos_agendamento;
  s public.petshops;
  o jsonb;
  v_pend boolean; v_ativo boolean; v_comeca timestamptz; v_itens jsonb;
  v_limite timestamptz;
  v_liga boolean;
  q public.pedidos_agendamento;
begin
  select * into p from public.pedidos_agendamento where id = p_id;
  if not found then return null; end if;
  select * into s from public.petshops where id = p.petshop_id;
  o := public.link_opcoes_de(s.opcoes);
  select coalesce(bool_or(i.estado = 'pendente'), false), coalesce(bool_or(i.estado = 'ativo'), false),
      min(i.comeca) filter (where i.estado = 'ativo'),
      jsonb_agg(jsonb_build_object('chave', i.chave, 'cancelado_cliente', i.estado = 'cliente'))
    into v_pend, v_ativo, v_comeca, v_itens
    from public.link_pedido_itens(p_id) i;
  v_limite := v_comeca - make_interval(hours => (o ->> 'horas')::int);
  v_liga := (o ->> 'cancelar')::boolean and s.link_ativo and public.acesso_liberado(s.id);
  -- o último recado do tutor neste pedido (outra data, ou cancelamento que depende do dono)
  select x.* into q from public.pedidos_agendamento x
    where x.cliente_pediu is not null and (x.id = p.id or (p.grupo_id is not null and x.grupo_id = p.grupo_id and x.petshop_id = p.petshop_id))
    order by x.cliente_pediu_em desc limit 1;
  return jsonb_build_object(
    'ligado', v_liga,
    'horas', (o ->> 'horas')::int,
    'aberto', v_pend or v_ativo,
    'limite', v_limite,
    -- pedido sem resposta cancela a qualquer hora; o que já foi aceito respeita o prazo
    'no_prazo', not v_ativo or now() <= v_limite,
    'itens', coalesce(v_itens, '[]'::jsonb),
    'pediu', q.cliente_pediu, 'pediu_em', q.cliente_pediu_em, 'recado', q.cliente_recado,
    'termos_aceitos_em', p.termos_aceitos_em
  );
end $$;

-- O tutor cancela o pedido (todos os pets dele).
-- Sem resposta ainda: só cancela. Aceito: desmarca o horário ou cancela a reserva, dentro do prazo do dono, e a vaga volta.
-- Com dinheiro no meio (sinal, conta lançada, pacote) nada é desfeito aqui: fica um pedido de cancelamento para o dono decidir,
-- do mesmo jeito que ele já faz ao cancelar uma reserva com sinal. Nenhum valor é devolvido por esta função.
-- Tocar duas vezes não faz nada na segunda.
create function public.link_pedido_cancelar(p_id uuid, p_recado text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.pedidos_agendamento;
  s public.petshops;
  o jsonb;
  i record;
  v_recado text := nullif(left(btrim(coalesce(p_recado, '')), 300), '');
  v_comeca timestamptz;
  n_cancelados int := 0;
  n_pedidos int := 0;
begin
  select * into p from public.pedidos_agendamento where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'erro', 'nao_achei'); end if;
  select * into s from public.petshops where id = p.petshop_id;
  o := public.link_opcoes_de(s.opcoes);
  if not ((o ->> 'cancelar')::boolean and s.link_ativo and public.acesso_liberado(s.id)) then return jsonb_build_object('ok', false, 'erro', 'desligado'); end if;
  -- trava os pedidos do grupo, sempre na mesma ordem, para dois toques não se atropelarem
  perform 1 from public.pedidos_agendamento x
    where x.id = p.id or (p.grupo_id is not null and x.grupo_id = p.grupo_id and x.petshop_id = p.petshop_id)
    order by x.id for update;
  select min(t.comeca) into v_comeca from public.link_pedido_itens(p_id) t where t.estado = 'ativo';
  if v_comeca is not null and now() > v_comeca - make_interval(hours => (o ->> 'horas')::int) then
    return jsonb_build_object('ok', false, 'erro', 'prazo', 'horas', (o ->> 'horas')::int);
  end if;
  for i in select t.* from public.link_pedido_itens(p_id) t where t.estado in ('pendente', 'ativo') order by t.id loop
    if i.estado = 'ativo' and i.dinheiro then
      update public.pedidos_agendamento
        set cliente_pediu = 'cancelar', cliente_pediu_em = now(), cliente_recado = v_recado, cliente_pedido_visto_em = null
        where id = i.id;
      n_pedidos := n_pedidos + 1;
    else
      if i.estado = 'ativo' then
        update public.agendamentos a set status = 'cancelado'
          from public.pedidos_agendamento x where x.id = i.id and a.id = x.agendamento_id and a.status in ('marcado', 'confirmado');
        update public.estadias e set status = 'cancelada'
          from public.pedidos_agendamento x where x.id = i.id and e.id = x.estadia_id and e.status = 'reservada';
      end if;
      update public.pedidos_agendamento
        set status = 'recusado', cliente_cancelou_em = now(), avisado_em = null, cliente_recado = coalesce(v_recado, cliente_recado),
            cliente_pediu = null, cliente_pediu_em = null, cliente_pedido_visto_em = null
        where id = i.id;
      n_cancelados := n_cancelados + 1;
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'cancelados', n_cancelados, 'pedidos', n_pedidos);
end $$;

-- O tutor pede outra data: fica um recado no pedido para a equipe responder. Nada é desmarcado: o que está combinado segue valendo.
create function public.link_pedido_pedir_mudanca(p_id uuid, p_recado text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  p public.pedidos_agendamento;
  s public.petshops;
  o jsonb;
  v_recado text := left(btrim(coalesce(p_recado, '')), 300);
  v_comeca timestamptz;
  n int;
begin
  select * into p from public.pedidos_agendamento where id = p_id;
  if not found then return jsonb_build_object('ok', false, 'erro', 'nao_achei'); end if;
  select * into s from public.petshops where id = p.petshop_id;
  o := public.link_opcoes_de(s.opcoes);
  if not ((o ->> 'cancelar')::boolean and s.link_ativo and public.acesso_liberado(s.id)) then return jsonb_build_object('ok', false, 'erro', 'desligado'); end if;
  if char_length(v_recado) < 3 then return jsonb_build_object('ok', false, 'erro', 'recado'); end if;
  perform 1 from public.pedidos_agendamento x
    where x.id = p.id or (p.grupo_id is not null and x.grupo_id = p.grupo_id and x.petshop_id = p.petshop_id)
    order by x.id for update;
  select min(t.comeca) into v_comeca from public.link_pedido_itens(p_id) t where t.estado = 'ativo';
  if v_comeca is not null and now() > v_comeca - make_interval(hours => (o ->> 'horas')::int) then
    return jsonb_build_object('ok', false, 'erro', 'prazo', 'horas', (o ->> 'horas')::int);
  end if;
  update public.pedidos_agendamento x
    set cliente_pediu = 'mudar', cliente_pediu_em = now(), cliente_recado = v_recado, cliente_pedido_visto_em = null
    where x.id in (select t.id from public.link_pedido_itens(p_id) t where t.estado in ('pendente', 'ativo'));
  get diagnostics n = row_count;
  if n = 0 then return jsonb_build_object('ok', false, 'erro', 'fechado'); end if;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.link_opcoes(text), public.link_nome(text), public.link_pedir_com_termos(text, jsonb, text, boolean),
  public.link_pedido_cliente(uuid), public.link_pedido_cancelar(uuid, text), public.link_pedido_pedir_mudanca(uuid, text) from public;
grant execute on function public.link_opcoes(text), public.link_nome(text), public.link_pedir_com_termos(text, jsonb, text, boolean),
  public.link_pedido_cliente(uuid), public.link_pedido_cancelar(uuid, text), public.link_pedido_pedir_mudanca(uuid, text) to anon, authenticated;

-- ---------- conserto: pedido de creche ou de hotel esperando resposta não ocupa horário de banho ----------
-- link_vaga contava todo pedido pendente que cruzava o horário, inclusive os de creche e hotel (que duram dias):
-- um pedido de hotel sem resposta escondia os horários de banho do período inteiro. Mesma assinatura; só a conta mudou.
create or replace function public.link_vaga(p_petshop uuid, p_inicio timestamptz, p_fim timestamptz) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cap int;
  v_ocupados int;
begin
  if exists (select 1 from public.bloqueios where petshop_id = p_petshop and profissional_id is null and inicio < p_fim and fim > p_inicio) then
    return false;
  end if;
  select coalesce(
    (select vagas from public.petshops where id = p_petshop),
    (select greatest(1, count(*))::int from public.profissionais where petshop_id = p_petshop and ativo and atende)
  ) into v_cap;
  select
    (select count(*) from public.agendamentos where petshop_id = p_petshop and status not in ('cancelado', 'faltou') and inicio < p_fim and fim > p_inicio)
    + (select count(*) from public.pedidos_agendamento where petshop_id = p_petshop and status = 'pendente' and tipo = 'servico' and inicio < p_fim and fim > p_inicio)
    + (select count(distinct profissional_id) from public.bloqueios where petshop_id = p_petshop and profissional_id is not null and inicio < p_fim and fim > p_inicio)
  into v_ocupados;
  return v_ocupados < v_cap;
end $$;

notify pgrst, 'reload schema';
