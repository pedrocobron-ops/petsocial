-- Consertos da revisão de segurança (seg4). Só entram objetos novos e funções trocadas com a MESMA assinatura.
-- Pode rodar antes do deploy (banco com 34→48, 50→56, 58, 60–62, sem 49/57): nada aqui depende da 49 nem da 57.
--
-- 1. Link do cliente: limite de envios por hora (por loja, por telefone e por aparelho/rede) nas funções que o anônimo chama
--    para gravar (pedido de serviço, creche, hotel, lista de espera, cancelar, pedir outra data).
--    Os limites antigos continuam valendo dentro de link_pedir/link_pedir_estadia/link_espera_pedir (6 pendentes por telefone,
--    60 por dia por loja). Os novos ficam em config_interna (o administrador pode mudar sem migração):
--      link_limite_loja_hora (25), link_limite_loja_dia (120), link_limite_fone_hora (5), link_limite_fone_abertos (6),
--      link_limite_rede_hora (10), link_limite_pedido_hora (6).
--    Resposta quando passa do limite: { ok:false, erro:'limite', motivo:'muitos', mensagem:'...' } nos pedidos novos (o app
--    antigo já entende 'limite') e { ok:false, erro:'muitos', mensagem } em cancelar/pedir outra data.
-- 2. Webhook da Cakto e da Escola: o mesmo aviso repetido (mesmo evento do mesmo pedido) não é aplicado de novo.
-- 3. Funções de gatilho sem EXECUTE para anon/authenticated (gatilho não confere esse direito ao disparar).

-- ---------- 1. limites do link ----------
create table if not exists public.link_envios (
  id bigint generated always as identity primary key,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  tipo text not null check (tipo in ('pedido', 'espera', 'cancelar', 'mudar')),
  fone text,            -- últimos 8 dígitos do WhatsApp (o mesmo número com ou sem 55/DDD conta junto)
  rede text,            -- hash do IP de quem enviou (quando o banco recebe o cabeçalho); nunca o IP em si
  pedido_id uuid,
  em timestamptz not null default now()
);
create index if not exists link_envios_loja_em on public.link_envios (petshop_id, em);
create index if not exists link_envios_pedido_em on public.link_envios (pedido_id, em) where pedido_id is not null;
alter table public.link_envios enable row level security;
revoke all on public.link_envios from public, anon, authenticated;

-- número inteiro guardado em config_interna, com padrão
create or replace function public.link_limite(p_chave text, p_padrao int) returns int
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when valor ~ '^\d{1,6}$' then valor::int end from public.config_interna where chave = p_chave), p_padrao)
$$;
revoke execute on function public.link_limite(text, int) from public, anon, authenticated;

-- de onde veio o pedido: hash do primeiro IP que o Supabase repassa (cf-connecting-ip / x-forwarded-for). Sem cabeçalho: null.
create or replace function public.link_rede() returns text
language plpgsql stable security definer set search_path = '' as $$
declare h jsonb; ip text;
begin
  begin h := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then h := null; end;
  ip := btrim(coalesce(h ->> 'cf-connecting-ip', split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1), h ->> 'x-real-ip', ''));
  if ip = '' then return null; end if;
  return md5('maestro-link:' || ip);
end $$;
revoke execute on function public.link_rede() from public, anon, authenticated;

create or replace function public.link_fone_chave(p_fone text) returns text
language sql immutable set search_path = '' as $$
  select nullif(right(regexp_replace(coalesce(p_fone, ''), '\D', '', 'g'), 8), '')
$$;
revoke execute on function public.link_fone_chave(text) from public, anon, authenticated;

-- muitos envios novos agora? (pedido de serviço/creche/hotel ou lista de espera)
create or replace function public.link_muitos_envios(p_petshop uuid, p_fone text, p_rede text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  -- um envio de cada vez por loja: a conta não escapa com vários pedidos ao mesmo tempo
  perform pg_advisory_xact_lock(hashtextextended('link_envios:' || p_petshop::text, 0));
  if (select count(*) from public.link_envios where petshop_id = p_petshop and tipo in ('pedido', 'espera') and em > now() - interval '1 hour')
       >= public.link_limite('link_limite_loja_hora', 25)
     or (select count(*) from public.link_envios where petshop_id = p_petshop and tipo in ('pedido', 'espera') and em > now() - interval '1 day')
       >= public.link_limite('link_limite_loja_dia', 120) then
    return true;
  end if;
  if p_fone is not null then
    if (select count(*) from public.link_envios where petshop_id = p_petshop and fone = p_fone and tipo in ('pedido', 'espera') and em > now() - interval '1 hour')
         >= public.link_limite('link_limite_fone_hora', 5) then
      return true;
    end if;
    -- pedidos ainda sem resposta deste WhatsApp (um pedido com vários pets conta uma vez) + lista de espera em aberto
    if (select count(distinct coalesce(grupo_id, id)) from public.pedidos_agendamento
          where petshop_id = p_petshop and status = 'pendente' and public.link_fone_chave(telefone) = p_fone)
       + (select count(*) from public.lista_espera
          where petshop_id = p_petshop and status in ('esperando', 'chamado') and saida >= current_date and public.link_fone_chave(telefone) = p_fone)
         >= public.link_limite('link_limite_fone_abertos', 6) then
      return true;
    end if;
  end if;
  if p_rede is not null and (select count(*) from public.link_envios where petshop_id = p_petshop and rede = p_rede and tipo in ('pedido', 'espera') and em > now() - interval '1 hour')
       >= public.link_limite('link_limite_rede_hora', 10) then
    return true;
  end if;
  return false;
end $$;
revoke execute on function public.link_muitos_envios(uuid, text, text) from public, anon, authenticated;

-- Mesma função da 20261162 (mesma assinatura; os dias fechados e o horário do hotel continuam conferidos), com o limite de envios.
create or replace function public.link_pedir_com_termos(p_funcao text, p_args jsonb, p_termos text default null, p_vacinas boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.petshops;
  o jsonb;
  v_lista text;
  r jsonb;
  v_id uuid;
  v_grupo uuid;
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
  -- hotel: chegada e busca só em dia que abre e dentro do horário de funcionamento daquele dia (ver link_hotel_dia_recusado)
  if p_funcao = 'link_pedir_estadia' and p_args ->> 'p_tipo' = 'hotel' then
    r := public.link_hotel_dia_recusado(v.id, public.dia_iso(p_args ->> 'p_entrada'), coalesce(p_args ->> 'p_hora_entrada', '08:00'), 'entrada');
    if r is null then r := public.link_hotel_dia_recusado(v.id, public.dia_iso(p_args ->> 'p_saida'), coalesce(p_args ->> 'p_hora_saida', '18:00'), 'saida'); end if;
    if r is not null then return r; end if;
  end if;
  if (o ->> 'termos')::boolean then
    if regexp_replace(btrim(coalesce(p_termos, '')), '\r', '', 'g') <> regexp_replace(o ->> 'texto', '\r', '', 'g')
       or ((o ->> 'vacinas')::boolean and not coalesce(p_vacinas, false)) then
      return jsonb_build_object('ok', false, 'erro', 'termos');
    end if;
  end if;
  -- muitos pedidos de uma vez (da loja toda, do mesmo WhatsApp ou da mesma rede): pede para tentar mais tarde
  v_fone := public.link_fone_chave(p_args ->> 'p_telefone');
  v_rede := public.link_rede();
  if public.link_muitos_envios(v.id, v_fone, v_rede) then
    return jsonb_build_object('ok', false, 'erro', 'limite', 'motivo', 'muitos',
      'mensagem', 'Recebemos muitos pedidos agora. Tente de novo mais tarde ou chame no WhatsApp.');
  end if;
  select string_agg(format('%I => %L', e.key,
      case jsonb_typeof(e.value) when 'null' then null when 'string' then e.value #>> '{}' else e.value::text end), ', ')
    into v_lista from jsonb_each(p_args) e;
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

-- cancelar / pedir outra data: o mesmo pedido não manda recado sem parar (conta o grupo inteiro)
create or replace function public.link_pedido_muitos(p_id uuid, p_tipo text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare p public.pedidos_agendamento; n int;
begin
  select * into p from public.pedidos_agendamento where id = p_id;
  if not found then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('link_envios:' || p.petshop_id::text, 0));
  select count(*) into n from public.link_envios e
    where e.petshop_id = p.petshop_id and e.tipo in ('cancelar', 'mudar') and e.em > now() - interval '1 hour'
      and e.pedido_id in (select x.id from public.pedidos_agendamento x
                          where x.id = p.id or (p.grupo_id is not null and x.grupo_id = p.grupo_id and x.petshop_id = p.petshop_id));
  if n >= public.link_limite('link_limite_pedido_hora', 6) then return true; end if;
  insert into public.link_envios (petshop_id, tipo, fone, rede, pedido_id)
    values (p.petshop_id, p_tipo, public.link_fone_chave(p.telefone), public.link_rede(), p.id);
  return false;
end $$;
revoke execute on function public.link_pedido_muitos(uuid, text) from public, anon, authenticated;

-- As duas funções abaixo: mesma assinatura e mesmo corpo da 20261148, com a conta de recados por hora logo depois das conferências.
create or replace function public.link_pedido_cancelar(p_id uuid, p_recado text default null) returns jsonb
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
  if public.link_pedido_muitos(p.id, 'cancelar') then
    return jsonb_build_object('ok', false, 'erro', 'muitos', 'mensagem', 'Recebemos muitos pedidos agora. Tente de novo mais tarde ou chame no WhatsApp.');
  end if;
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

create or replace function public.link_pedido_pedir_mudanca(p_id uuid, p_recado text) returns jsonb
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
  if public.link_pedido_muitos(p.id, 'mudar') then
    return jsonb_build_object('ok', false, 'erro', 'muitos', 'mensagem', 'Recebemos muitos pedidos agora. Tente de novo mais tarde ou chame no WhatsApp.');
  end if;
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

revoke execute on function public.link_pedir_com_termos(text, jsonb, text, boolean),
  public.link_pedido_cancelar(uuid, text), public.link_pedido_pedir_mudanca(uuid, text) from public;
grant execute on function public.link_pedir_com_termos(text, jsonb, text, boolean),
  public.link_pedido_cancelar(uuid, text), public.link_pedido_pedir_mudanca(uuid, text) to anon, authenticated;

-- ---------- 2. webhook: o mesmo aviso repetido não vale duas vezes ----------
-- Chave do aviso: evento + id do pedido da Cakto (data.id, que o app já guarda em payload.pedido desde a 20261158).
-- Aviso sem pedido não tem chave (não dá para saber se é repetido) e segue como antes.
create table if not exists public.webhook_vistos (
  chave text primary key check (char_length(chave) <= 300),
  visto_em timestamptz not null default now()
);
alter table public.webhook_vistos enable row level security;
revoke all on public.webhook_vistos from public, anon, authenticated;

-- true na primeira vez que a chave aparece; false se já foi vista
create or replace function public.webhook_primeira_vez(p_chave text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_chave is null then return true; end if;
  insert into public.webhook_vistos (chave) values (left(p_chave, 300)) on conflict (chave) do nothing;
  get diagnostics n = row_count;
  return n = 1;
end $$;
revoke execute on function public.webhook_primeira_vez(text) from public, anon, authenticated;

-- Mesma assinatura e mesmo corpo da 20261158, com a conferência de aviso repetido depois do segredo e do produto.
create or replace function public.cakto_evento(p_segredo text, p_evento text, p_email text, p_assinatura text, p_payload jsonb, p_oferta text default null,
  p_callback text default null, p_produto text default null, p_produto_curto text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_petshop uuid;
  v_produto text;
  v_pedido text := nullif(btrim(coalesce(p_payload ->> 'pedido', '')), '');
begin
  if not public.cakto_segredo_ok(p_segredo) then return 'recusado'; end if;

  -- outro produto da mesma conta Cakto (ex.: um guia vendido pelo webhook da Escola): não mexe em assinatura nenhuma
  select valor into v_produto from public.config_interna where chave = 'cakto_produto_gestao';
  if v_produto is not null and (p_produto is not null or p_produto_curto is not null)
     and v_produto is distinct from p_produto and v_produto is distinct from p_produto_curto then
    return 'outro_produto';
  end if;

  -- o mesmo aviso de novo (reenvio da Cakto ou alguém repetindo): não estende o pago_ate outra vez
  -- (a doc da Cakto manda usar o id do pedido como chave; os três avisos de pagamento contam como um só: o mesmo pedido pago
  --  não paga duas vezes, nem chegando como purchase_approved e depois como subscription_renewed)
  if v_pedido is not null and not public.webhook_primeira_vez('cakto:'
       || case when p_evento in ('purchase_approved', 'subscription_renewed', 'subscription_late_recovered') then 'pago' else coalesce(p_evento, '') end
       || ':' || v_pedido) then
    return 'repetido';
  end if;

  -- 1) assinatura já conhecida; 2) o link de pagamento leva o id do pet shop (?callback=); 3) e-mail da compra; 4) e-mail do dono
  select id into v_petshop from public.petshops where p_assinatura is not null and cakto_assinatura = p_assinatura limit 1;
  if v_petshop is null and p_callback ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select id into v_petshop from public.petshops where id = p_callback::uuid;
  end if;
  if v_petshop is null and p_email is not null then
    select id into v_petshop from public.petshops where lower(cakto_email) = lower(p_email) order by criado_em desc limit 1;
  end if;
  if v_petshop is null and p_email is not null then
    select p.petshop_id into v_petshop
      from public.profissionais p join auth.users u on u.id = p.user_id
      where p.papel = 'dono' and lower(u.email) = lower(p_email)
      order by p.criado_em desc limit 1;
  end if;

  insert into public.cakto_eventos (evento, email, petshop_id, payload)
    values (p_evento, p_email, v_petshop,
      coalesce(p_payload, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('oferta', p_oferta, 'assinatura', p_assinatura)));

  if v_petshop is null then return 'sem_conta'; end if;
  return public.cakto_aplicar(v_petshop, p_evento, p_email, p_assinatura, p_oferta, now());
end $$;
revoke execute on function public.cakto_evento(text, text, text, text, jsonb, text, text, text, text) from public;
grant execute on function public.cakto_evento(text, text, text, text, jsonb, text, text, text, text) to anon, authenticated;

-- Escola: mesma assinatura. Compra repetida já não duplicava (on conflict); agora um aviso repetido também não devolve o acesso
-- depois de um reembolso, e o reembolso de um pedido antigo não apaga a compra de um pedido novo.
create or replace function public.escola_evento(p_segredo text, p_evento text, p_email text, p_slug text, p_pedido text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_pedido text := nullif(left(btrim(coalesce(p_pedido, '')), 80), '');
begin
  if not public.cakto_segredo_ok(p_segredo) then return 'recusado'; end if;
  if v_email = '' or p_slug is null or p_slug !~ '^[a-z0-9-]{1,60}$' then return 'ignorado'; end if;
  if p_evento not in ('purchase_approved', 'refund', 'chargeback') then return 'ignorado'; end if;
  if v_pedido is not null and not public.webhook_primeira_vez('escola:' || p_evento || ':' || p_slug || ':' || v_pedido) then
    return 'repetido';
  end if;
  if p_evento = 'purchase_approved' then
    insert into public.escola_compras (email, slug, origem, pedido) values (v_email, p_slug, 'cakto', v_pedido)
      on conflict (email, slug) do nothing;
    return 'ok';
  end if;
  delete from public.escola_compras
    where email = v_email and slug = p_slug and origem = 'cakto' and (v_pedido is null or pedido is null or pedido = v_pedido);
  return 'ok';
end $$;
revoke execute on function public.escola_evento(text, text, text, text, text) from public;
grant execute on function public.escola_evento(text, text, text, text, text) to anon, authenticated;

-- ---------- 3. funções de gatilho: ninguém chama direto ----------
revoke execute on function public.travar_caixa(), public.travar_caixa_fechado(), public.proteger_concluido(),
  public.creche_plano_apagar_conferir(), public.creche_plano_conferir(), public.estadias_travar_mensalista(),
  public.petshops_fuso_da_uf() from public, anon, authenticated;

notify pgrst, 'reload schema';
