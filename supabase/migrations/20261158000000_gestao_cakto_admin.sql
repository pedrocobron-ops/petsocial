-- Cakto sem SQL e sem chat: o administrador grava a chave secreta do webhook (só o hash), liga cada oferta ao plano,
-- cola os links de pagamento e liga ao pet shop certo um pagamento que chegou com outro e-mail.
-- Tudo aditivo: o código que está no ar continua chamando cakto_evento e escola_evento do mesmo jeito.
--
-- Chaves em config_interna:
--   cakto_segredo_sha256          segredo antigo (webhook da Escola, ou o único que existia)
--   cakto_segredo_gestao_sha256   segredo do webhook novo, só do produto Maestro Pet Gestão
--   cakto_segredo_*_em            quando cada um foi gravado pela tela
--   cakto_oferta_<id da oferta>   'solo:1', 'equipe:3', 'petshop:6' (já existia)
--   cakto_oferta_de_<plano>:<m>   id da oferta daquele plano e período (para a tela mostrar)
--   cakto_link_<plano>:<m>        link de pagamento daquele plano e período (lido pela tela Assinatura)
--   cakto_produto_gestao          id ou código curto do produto Gestão: avisos de outros produtos são ignorados
--   assinatura_aberta             (já existia) o fim do teste passa a valer

-- ------------------------------------------------------------
-- Segredo: aceita o da Gestão ou o antigo
-- ------------------------------------------------------------
create or replace function public.cakto_segredo_ok(p_segredo text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_segredo is not null and length(p_segredo) > 0 and exists (
    select 1 from public.config_interna
    where chave in ('cakto_segredo_sha256', 'cakto_segredo_gestao_sha256')
      and valor = encode(extensions.digest(p_segredo, 'sha256'), 'hex'))
$$;
revoke execute on function public.cakto_segredo_ok(text) from public, anon, authenticated;

-- ------------------------------------------------------------
-- O que um aviso faz no pet shop (usado pelo webhook e pela ligação manual)
-- ------------------------------------------------------------
create or replace function public.cakto_aplicar(p_petshop uuid, p_evento text, p_email text, p_assinatura text, p_oferta text, p_quando timestamptz default now())
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_status public.status_assinatura;
  v_valor text;
  v_plano text;
  v_meses integer;
begin
  v_status := case p_evento
    when 'subscription_created' then 'ativa'
    when 'purchase_approved' then 'ativa'
    when 'subscription_renewed' then 'ativa'
    when 'subscription_late_recovered' then 'ativa'
    when 'subscription_resumed' then 'ativa'
    when 'subscription_late' then 'atrasada'
    when 'subscription_renewal_refused' then 'atrasada'
    when 'subscription_canceled' then 'cancelada'
    when 'subscription_paused' then 'cancelada'
    when 'refund' then 'cancelada'
    when 'chargeback' then 'cancelada'
    else null end;
  if v_status is null then return 'ignorado'; end if;

  if p_oferta is not null then
    select valor into v_valor from public.config_interna where chave = 'cakto_oferta_' || p_oferta;
    if split_part(v_valor, ':', 1) in ('solo', 'equipe', 'petshop') then
      v_plano := split_part(v_valor, ':', 1);
      v_meses := case split_part(v_valor, ':', 2) when '3' then 3 when '6' then 6 else 1 end;
    end if;
  end if;

  update public.petshops set
      status = case when status = 'cortesia' then status else v_status end,
      plano = case when v_status = 'ativa' and v_plano is not null then v_plano else plano end,
      periodo_meses = case when v_status = 'ativa' and v_meses is not null then v_meses else periodo_meses end,
      -- pagamento que entrou: paga mais um período a partir dele (com um dia de folga). Devolução ou contestação: zera.
      pago_ate = case
        when p_evento in ('purchase_approved', 'subscription_renewed', 'subscription_late_recovered')
          then greatest(coalesce(pago_ate, p_quando), p_quando + make_interval(months => coalesce(v_meses, periodo_meses, 1), days => 1))
        when p_evento in ('refund', 'chargeback') then null
        else pago_ate end,
      cakto_email = coalesce(cakto_email, lower(nullif(trim(p_email), ''))),
      cakto_assinatura = coalesce(p_assinatura, cakto_assinatura),
      assinatura_desde = case when v_status = 'ativa' then coalesce(assinatura_desde, p_quando) else assinatura_desde end
    where id = p_petshop;
  return 'ok';
end $$;
revoke execute on function public.cakto_aplicar(uuid, text, text, text, text, timestamptz) from public, anon, authenticated;

-- ------------------------------------------------------------
-- Webhook: mesmo nome e mesmos parâmetros de antes, mais três opcionais
-- ------------------------------------------------------------
drop function if exists public.cakto_evento(text, text, text, text, jsonb, text);
create function public.cakto_evento(p_segredo text, p_evento text, p_email text, p_assinatura text, p_payload jsonb, p_oferta text default null,
  p_callback text default null, p_produto text default null, p_produto_curto text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_petshop uuid;
  v_produto text;
begin
  if not public.cakto_segredo_ok(p_segredo) then return 'recusado'; end if;

  -- outro produto da mesma conta Cakto (ex.: um guia vendido pelo webhook da Escola): não mexe em assinatura nenhuma
  select valor into v_produto from public.config_interna where chave = 'cakto_produto_gestao';
  if v_produto is not null and (p_produto is not null or p_produto_curto is not null)
     and v_produto is distinct from p_produto and v_produto is distinct from p_produto_curto then
    return 'outro_produto';
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

-- Escola: mesma função, agora aceitando qualquer um dos dois segredos
create or replace function public.escola_evento(p_segredo text, p_evento text, p_email text, p_slug text, p_pedido text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare v_email text := lower(trim(coalesce(p_email, '')));
begin
  if not public.cakto_segredo_ok(p_segredo) then return 'recusado'; end if;
  if v_email = '' or p_slug is null or p_slug !~ '^[a-z0-9-]{1,60}$' then return 'ignorado'; end if;
  if p_evento = 'purchase_approved' then
    insert into public.escola_compras (email, slug, origem, pedido) values (v_email, p_slug, 'cakto', left(p_pedido, 80))
      on conflict (email, slug) do nothing;
    return 'ok';
  elsif p_evento in ('refund', 'chargeback') then
    delete from public.escola_compras where email = v_email and slug = p_slug and origem = 'cakto';
    return 'ok';
  end if;
  return 'ignorado';
end $$;

-- ------------------------------------------------------------
-- Público: só os links de pagamento e se a assinatura abriu
-- ------------------------------------------------------------
create or replace function public.gestao_assinatura() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'aberta', exists (select 1 from public.config_interna where chave = 'assinatura_aberta'),
    'links', coalesce((select jsonb_object_agg(substr(chave, 12), valor) from public.config_interna
                        where chave like 'cakto\_link\_%' and valor like 'https://%'), '{}'::jsonb))
$$;
revoke execute on function public.gestao_assinatura() from public;
grant execute on function public.gestao_assinatura() to anon, authenticated;

-- ------------------------------------------------------------
-- Administrador
-- ------------------------------------------------------------
create or replace function public.admin_cakto() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  select jsonb_build_object(
    'segredo_gestao', exists (select 1 from public.config_interna where chave = 'cakto_segredo_gestao_sha256'),
    'segredo_gestao_em', (select valor from public.config_interna where chave = 'cakto_segredo_gestao_sha256_em'),
    'segredo_escola', exists (select 1 from public.config_interna where chave = 'cakto_segredo_sha256'),
    'segredo_escola_em', (select valor from public.config_interna where chave = 'cakto_segredo_sha256_em'),
    'produto', (select valor from public.config_interna where chave = 'cakto_produto_gestao'),
    'aberta', exists (select 1 from public.config_interna where chave = 'assinatura_aberta'),
    'ofertas', coalesce((select jsonb_object_agg(substr(chave, 17), valor) from public.config_interna where chave like 'cakto\_oferta\_de\_%'), '{}'::jsonb),
    'links', coalesce((select jsonb_object_agg(substr(chave, 12), valor) from public.config_interna where chave like 'cakto\_link\_%'), '{}'::jsonb),
    -- ligações oferta → plano que não vieram desta tela (gravadas antes, por SQL)
    'antigas', coalesce((select jsonb_object_agg(substr(chave, 14), valor) from public.config_interna c
                          where chave like 'cakto\_oferta\_%' and chave not like 'cakto\_oferta\_de\_%'
                            and not exists (select 1 from public.config_interna d where d.chave like 'cakto\_oferta\_de\_%' and d.valor = substr(c.chave, 14))), '{}'::jsonb)
  ) into v;
  return v;
end $$;

-- grava a chave secreta de um webhook: guarda só o sha256, nunca devolve o valor
create or replace function public.admin_cakto_segredo(p_qual text, p_segredo text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_chave text; v_s text := trim(coalesce(p_segredo, ''));
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  v_chave := case p_qual when 'gestao' then 'cakto_segredo_gestao_sha256' when 'escola' then 'cakto_segredo_sha256' else null end;
  if v_chave is null then raise exception 'Webhook desconhecido.'; end if;
  if length(v_s) < 8 or length(v_s) > 200 or v_s ~ '\s' then raise exception 'Essa chave não parece a da Cakto. Copie de novo, sem espaços.'; end if;
  insert into public.config_interna (chave, valor) values (v_chave, encode(extensions.digest(v_s, 'sha256'), 'hex'))
    on conflict (chave) do update set valor = excluded.valor;
  insert into public.config_interna (chave, valor) values (v_chave || '_em', now()::text)
    on conflict (chave) do update set valor = excluded.valor;
end $$;

-- liga a oferta da Cakto a um plano e período e guarda o link de pagamento. Vazio tira.
create or replace function public.admin_cakto_oferta(p_plano text, p_meses integer, p_oferta text, p_link text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_k text;
  v_of text := nullif(trim(coalesce(p_oferta, '')), '');
  v_link text := nullif(trim(coalesce(p_link, '')), '');
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  if p_plano not in ('solo', 'equipe', 'petshop') or p_meses not in (1, 3, 6) then raise exception 'Plano ou período desconhecido.'; end if;
  if v_of is not null and v_of !~ '^[A-Za-z0-9_-]{3,64}$' then raise exception 'O código da oferta tem só letras e números (ex.: a8BcHrY).'; end if;
  if v_link is not null and (v_link !~ '^https://[^\s<>"]+$' or length(v_link) > 400) then raise exception 'O link precisa começar com https:// e não pode ter espaços.'; end if;
  v_k := p_plano || ':' || p_meses;
  if v_of is null then
    delete from public.config_interna where chave = 'cakto_oferta_de_' || v_k;
  else
    -- a ligação antiga de outra oferta fica: assinante antigo continua renovando no plano certo
    insert into public.config_interna (chave, valor) values ('cakto_oferta_' || v_of, v_k) on conflict (chave) do update set valor = excluded.valor;
    insert into public.config_interna (chave, valor) values ('cakto_oferta_de_' || v_k, v_of) on conflict (chave) do update set valor = excluded.valor;
  end if;
  if v_link is null then
    delete from public.config_interna where chave = 'cakto_link_' || v_k;
  else
    insert into public.config_interna (chave, valor) values ('cakto_link_' || v_k, v_link) on conflict (chave) do update set valor = excluded.valor;
  end if;
end $$;

create or replace function public.admin_cakto_produto(p_produto text) returns void
language plpgsql security definer set search_path = '' as $$
declare v text := nullif(trim(coalesce(p_produto, '')), '');
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  if v is not null and v !~ '^[A-Za-z0-9_-]{3,64}$' then raise exception 'O código do produto tem só letras, números e traços.'; end if;
  if v is null then delete from public.config_interna where chave = 'cakto_produto_gestao';
  else insert into public.config_interna (chave, valor) values ('cakto_produto_gestao', v) on conflict (chave) do update set valor = excluded.valor;
  end if;
end $$;

-- abre a assinatura: a partir daí o teste vencido deixa a conta só para consulta
create or replace function public.admin_cakto_abrir(p_aberta boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  if p_aberta then
    insert into public.config_interna (chave, valor) values ('assinatura_aberta', now()::text) on conflict (chave) do nothing;
  else
    delete from public.config_interna where chave = 'assinatura_aberta';
  end if;
end $$;

-- pagamentos que chegaram sem achar o pet shop (e-mail diferente da conta)
create or replace function public.admin_cakto_sem_conta() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'evento', e.evento, 'email', e.email, 'recebido_em', e.recebido_em,
      'oferta', e.payload->>'oferta', 'assinatura', e.payload->>'assinatura', 'valor', e.payload->'valor',
      'plano', (select c.valor from public.config_interna c where c.chave = 'cakto_oferta_' || (e.payload->>'oferta'))
    ) order by e.id desc)
    from public.cakto_eventos e
    where e.petshop_id is null and coalesce(e.payload->>'descartado', '') = ''
      and e.evento in ('purchase_approved', 'subscription_created', 'subscription_renewed', 'subscription_late_recovered', 'subscription_resumed',
                       'subscription_late', 'subscription_renewal_refused', 'subscription_canceled', 'subscription_paused', 'refund', 'chargeback')
      and e.recebido_em > now() - interval '180 days'
  ), '[]'::jsonb);
end $$;

-- liga um pagamento sem conta a um pet shop: aplica, em ordem, os avisos soltos da mesma assinatura (ou do mesmo e-mail)
create or replace function public.admin_cakto_ligar(p_evento bigint, p_petshop uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_ev public.cakto_eventos;
  v_ass text;
  r record;
  n integer := 0;
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  select * into v_ev from public.cakto_eventos where id = p_evento;
  if v_ev.id is null or v_ev.petshop_id is not null then raise exception 'Esse pagamento já foi ligado ou não existe.'; end if;
  if not exists (select 1 from public.petshops where id = p_petshop) then raise exception 'Pet shop não encontrado.'; end if;
  v_ass := nullif(v_ev.payload->>'assinatura', '');
  for r in
    select * from public.cakto_eventos e
    where e.petshop_id is null and coalesce(e.payload->>'descartado', '') = ''
      and (e.id = p_evento
        or (v_ass is not null and e.payload->>'assinatura' = v_ass)
        or (v_ass is null and e.payload->>'assinatura' is null and v_ev.email is not null and lower(e.email) = lower(v_ev.email)))
    order by e.id
  loop
    update public.cakto_eventos set petshop_id = p_petshop,
        payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('ligado_em', now(), 'ligado_por', (select auth.uid()))
      where id = r.id;
    perform public.cakto_aplicar(p_petshop, r.evento, r.email, nullif(r.payload->>'assinatura', ''), nullif(r.payload->>'oferta', ''), r.recebido_em);
    n := n + 1;
  end loop;
  return n;
end $$;

-- some da lista (ex.: aviso de teste da Cakto, compra de outra coisa)
create or replace function public.admin_cakto_descartar(p_evento bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  update public.cakto_eventos set payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('descartado', now())
    where id = p_evento and petshop_id is null;
end $$;

revoke execute on function public.admin_cakto(), public.admin_cakto_segredo(text, text), public.admin_cakto_oferta(text, integer, text, text),
  public.admin_cakto_produto(text), public.admin_cakto_abrir(boolean), public.admin_cakto_sem_conta(),
  public.admin_cakto_ligar(bigint, uuid), public.admin_cakto_descartar(bigint) from public, anon;
grant execute on function public.admin_cakto(), public.admin_cakto_segredo(text, text), public.admin_cakto_oferta(text, integer, text, text),
  public.admin_cakto_produto(text), public.admin_cakto_abrir(boolean), public.admin_cakto_sem_conta(),
  public.admin_cakto_ligar(bigint, uuid), public.admin_cakto_descartar(bigint) to authenticated;
