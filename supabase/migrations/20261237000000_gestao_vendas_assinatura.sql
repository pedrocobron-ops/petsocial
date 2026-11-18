-- Rodada 9, vendas: assinatura, quem vende, de onde veio cada pet shop e cupons.
--
-- 1. Depois do teste de 7 dias a conta fica só para consulta, sempre (antes, isso só valia com a chave 'assinatura_aberta').
--    Sem link de pagamento cadastrado, a pessoa assina falando com a equipe pelo WhatsApp e o administrador libera no painel.
--    Para ninguém ser pego de surpresa, todo teste que acabaria em menos de 7 dias ganha 7 dias a partir de agora, uma vez só.
-- 2. Assinatura atrasada: continua liberada por N dias depois do dia em que a cobrança não foi aprovada
--    (config_interna 'assinatura_atraso_dias', padrão 10) e então fica só para consulta, até o pagamento entrar.
-- 3. Quem vende (direito do consumidor): nome, documento, endereço e contato em config_interna
--    ('vendedor_nome', 'vendedor_documento', 'vendedor_endereco', 'vendedor_contato'), gravados pelo administrador e lidos por
--    qualquer pessoa (aparecem no rodapé da página de venda e na tela Assinatura quando preenchidos).
-- 4. De onde veio o pet shop: código do vendedor (?v=) e utm_* guardados uma vez, no cadastro; e o "quero ajuda da equipe
--    pelo WhatsApp durante o teste" (com a hora do aceite). Só o administrador lê.
-- 5. Painel do administrador: pet shops por vendedor e pagamentos com cupom (o cupom vem no aviso da Cakto, em payload.cupom).

-- ============================================================
-- 1 e 2. Acesso liberado
-- ============================================================
create table if not exists public.assinatura_atrasos (
  petshop_id uuid primary key references public.petshops(id) on delete cascade,
  desde timestamptz not null default now()
);
alter table public.assinatura_atrasos enable row level security;
revoke all on public.assinatura_atrasos from public, anon, authenticated;

create or replace function public.assinatura_anotar_atraso() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'atrasada' then
    insert into public.assinatura_atrasos (petshop_id) values (new.id) on conflict (petshop_id) do nothing;
  else
    delete from public.assinatura_atrasos where petshop_id = new.id;
  end if;
  return new;
end $$;
revoke execute on function public.assinatura_anotar_atraso() from public, anon, authenticated;

drop trigger if exists gestao_assinatura_atraso on public.petshops;
create trigger gestao_assinatura_atraso after insert or update of status on public.petshops
  for each row execute function public.assinatura_anotar_atraso();

-- quem já estava atrasada começa a contar de agora
insert into public.assinatura_atrasos (petshop_id) select id from public.petshops where status = 'atrasada' on conflict (petshop_id) do nothing;

-- quando a conta atrasada fica só para consulta (null = não está atrasada)
create or replace function public.assinatura_trava_em(p uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select a.desde + make_interval(days => public.link_limite('assinatura_atraso_dias', 10))
    from public.assinatura_atrasos a join public.petshops s on s.id = a.petshop_id
   where a.petshop_id = p and s.status = 'atrasada'
$$;
revoke execute on function public.assinatura_trava_em(uuid) from public, anon, authenticated;

-- copiada da 20261199 (LGPD); muda o teste (vale o prazo, sempre) e a atrasada (liberada só até a data da trava)
create or replace function public.acesso_liberado(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.petshops
    where id = p and (
      status in ('ativa', 'cortesia')
      or (status = 'atrasada' and coalesce(public.assinatura_trava_em(p) > now(), true))
      or (status = 'teste' and teste_ate > now())
      or (status = 'cancelada' and pago_ate > now())
    )
  ) and not exists (
    select 1 from public.exclusoes_conta x where x.petshop_id = p and x.cancelado_em is null and x.apagado_em is null
  )
$$;

-- uma vez só: quem estava no teste sem prazo (a regra antiga) ganha 7 dias a partir de agora
do $$
begin
  if not exists (select 1 from public.config_interna where chave = 'teste_prazo_unico_em') then
    if not exists (select 1 from public.config_interna where chave = 'assinatura_aberta') then
      update public.petshops set teste_ate = now() + interval '7 days'
       where status = 'teste' and teste_ate < now() + interval '7 days';
    end if;
    insert into public.config_interna (chave, valor) values ('teste_prazo_unico_em', now()::text);
  end if;
end $$;

-- a situação da assinatura do pet shop, para a tela avisar antes de travar (só quem é da equipe)
create or replace function public.assinatura_situacao(p uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if p not in (select public.meus_petshops()) then raise exception 'Acesso restrito.'; end if;
  return jsonb_build_object(
    'liberado', public.acesso_liberado(p),
    'atraso_desde', (select a.desde from public.assinatura_atrasos a join public.petshops s on s.id = a.petshop_id where a.petshop_id = p and s.status = 'atrasada'),
    'trava_em', public.assinatura_trava_em(p),
    'atraso_dias', public.link_limite('assinatura_atraso_dias', 10));
end $$;
revoke execute on function public.assinatura_situacao(uuid) from public, anon;
grant execute on function public.assinatura_situacao(uuid) to authenticated;

-- ============================================================
-- 3. Quem vende
-- ============================================================
create or replace function public.gestao_vendedor() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'nome', (select nullif(btrim(valor), '') from public.config_interna where chave = 'vendedor_nome'),
    'documento', (select nullif(btrim(valor), '') from public.config_interna where chave = 'vendedor_documento'),
    'endereco', (select nullif(btrim(valor), '') from public.config_interna where chave = 'vendedor_endereco'),
    'contato', (select nullif(btrim(valor), '') from public.config_interna where chave = 'vendedor_contato')))
$$;
revoke execute on function public.gestao_vendedor() from public;
grant execute on function public.gestao_vendedor() to anon, authenticated;

create or replace function public.admin_vendedor_salvar(p_nome text, p_documento text, p_endereco text default null, p_contato text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  for r in select * from (values ('vendedor_nome', p_nome, 120), ('vendedor_documento', p_documento, 40),
                                 ('vendedor_endereco', p_endereco, 200), ('vendedor_contato', p_contato, 120)) as t(chave, valor, maximo) loop
    if nullif(btrim(coalesce(r.valor, '')), '') is null then
      delete from public.config_interna where chave = r.chave;
    else
      insert into public.config_interna (chave, valor) values (r.chave, left(btrim(regexp_replace(r.valor, '\s+', ' ', 'g')), r.maximo))
        on conflict (chave) do update set valor = excluded.valor;
    end if;
  end loop;
  return public.gestao_vendedor();
end $$;
revoke execute on function public.admin_vendedor_salvar(text, text, text, text) from public, anon;
grant execute on function public.admin_vendedor_salvar(text, text, text, text) to authenticated;

-- copiada da 20261158; ganha quem vende e os dias de tolerância do atraso (as chaves de antes continuam iguais)
create or replace function public.gestao_assinatura() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'aberta', exists (select 1 from public.config_interna where chave = 'assinatura_aberta'),
    'links', coalesce((select jsonb_object_agg(substr(chave, 12), valor) from public.config_interna
                        where chave like 'cakto\_link\_%' and valor like 'https://%'), '{}'::jsonb),
    'atraso_dias', public.link_limite('assinatura_atraso_dias', 10),
    'vendedor', public.gestao_vendedor())
$$;
revoke execute on function public.gestao_assinatura() from public;
grant execute on function public.gestao_assinatura() to anon, authenticated;

-- dias de tolerância do atraso, pelo painel (0 a 60)
create or replace function public.admin_atraso_dias(p_dias int) returns int
language plpgsql security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  if p_dias is null or p_dias < 0 or p_dias > 60 then raise exception 'Escolha de 0 a 60 dias.'; end if;
  insert into public.config_interna (chave, valor) values ('assinatura_atraso_dias', p_dias::text)
    on conflict (chave) do update set valor = excluded.valor;
  return p_dias;
end $$;
revoke execute on function public.admin_atraso_dias(int) from public, anon;
grant execute on function public.admin_atraso_dias(int) to authenticated;

-- ============================================================
-- 4. De onde veio o pet shop
-- ============================================================
create table if not exists public.petshops_origem (
  petshop_id uuid primary key references public.petshops(id) on delete cascade,
  vendedor text check (vendedor ~ '^[a-z0-9_-]{1,40}$'),
  utm jsonb not null default '{}'::jsonb check (jsonb_typeof(utm) = 'object'),
  quer_ajuda boolean not null default false,
  quer_ajuda_em timestamptz,
  criado_em timestamptz not null default now()
);
alter table public.petshops_origem enable row level security;
revoke all on public.petshops_origem from public, anon, authenticated;
create index if not exists petshops_origem_vendedor_idx on public.petshops_origem (vendedor) where vendedor is not null;

-- Grava uma vez, pelo dono, no dia em que o pet shop nasce (depois disso ninguém troca o vendedor).
create or replace function public.origem_registrar(p uuid, p_vendedor text default null, p_utm jsonb default null, p_quer_ajuda boolean default false) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_vendedor text := lower(btrim(coalesce(p_vendedor, '')));
  v_utm jsonb := '{}'::jsonb;
  v_n int;
  k text;
begin
  if not public.sou_dono(p) then raise exception 'Acesso restrito.'; end if;
  if not exists (select 1 from public.petshops s where s.id = p and s.criado_em > now() - interval '1 day') then return false; end if;
  if v_vendedor !~ '^[a-z0-9_-]{1,40}$' then v_vendedor := null; end if;
  if jsonb_typeof(p_utm) = 'object' then
    foreach k in array array['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] loop
      if jsonb_typeof(p_utm -> k) = 'string' and btrim(p_utm ->> k) <> '' then
        v_utm := v_utm || jsonb_build_object(k, left(btrim(p_utm ->> k), 80));
      end if;
    end loop;
  end if;
  insert into public.petshops_origem (petshop_id, vendedor, utm, quer_ajuda, quer_ajuda_em)
    values (p, v_vendedor, v_utm, coalesce(p_quer_ajuda, false), case when p_quer_ajuda then now() end)
    on conflict (petshop_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;
revoke execute on function public.origem_registrar(uuid, text, jsonb, boolean) from public, anon;
grant execute on function public.origem_registrar(uuid, text, jsonb, boolean) to authenticated;

-- ============================================================
-- 5. Painel: pet shops por vendedor e pagamentos com cupom
-- ============================================================
create or replace function public.admin_vendas() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return jsonb_build_object(
    'lojas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'nome', s.nome, 'criado_em', s.criado_em, 'status', s.status, 'plano', s.plano, 'meses', s.periodo_meses,
        'teste_ate', s.teste_ate, 'vendedor', o.vendedor, 'utm', coalesce(o.utm, '{}'::jsonb), 'quer_ajuda', coalesce(o.quer_ajuda, false),
        -- o telefone só vem para quem pediu a ajuda da equipe
        'telefone', case when o.quer_ajuda then s.telefone end,
        'cupom', (select upper(e.payload ->> 'cupom') from public.cakto_eventos e
                   where e.petshop_id = s.id and nullif(e.payload ->> 'cupom', '') is not null
                     and e.evento in ('purchase_approved', 'subscription_created') order by e.id limit 1)
      ) order by s.criado_em desc)
      from public.petshops s left join public.petshops_origem o on o.petshop_id = s.id
      where o.vendedor is not null or o.utm <> '{}'::jsonb or o.quer_ajuda
         or exists (select 1 from public.cakto_eventos e where e.petshop_id = s.id and nullif(e.payload ->> 'cupom', '') is not null)
    ), '[]'::jsonb),
    'pagamentos', coalesce((
      select jsonb_agg(x.j order by x.id desc) from (
        select e.id, jsonb_build_object(
          'id', e.id, 'recebido_em', e.recebido_em, 'evento', e.evento, 'petshop_id', e.petshop_id,
          'nome', (select s.nome from public.petshops s where s.id = e.petshop_id),
          'vendedor', (select o.vendedor from public.petshops_origem o where o.petshop_id = e.petshop_id),
          'cupom', upper(nullif(e.payload ->> 'cupom', '')), 'valor', e.payload -> 'valor', 'desconto', e.payload -> 'desconto',
          'plano', (select c.valor from public.config_interna c where c.chave = 'cakto_oferta_' || (e.payload ->> 'oferta'))) as j
        from public.cakto_eventos e
        where e.evento in ('purchase_approved', 'subscription_renewed', 'subscription_late_recovered')
          and e.petshop_id is not null and e.recebido_em > now() - interval '400 days'
        order by e.id desc limit 1000) x
    ), '[]'::jsonb));
end $$;
revoke execute on function public.admin_vendas() from public, anon;
grant execute on function public.admin_vendas() to authenticated;
