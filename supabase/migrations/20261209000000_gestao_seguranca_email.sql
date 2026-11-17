-- Segurança do e-mail: o projeto do Supabase desligou "Confirm email". Uma conta nova já nasce com email_confirmed_at,
-- então o e-mail de uma conta NÃO prova que a caixa de entrada é da pessoa. Nada que dá acesso pode depender só dele.
--
-- 1. Convite da equipe: deixa de ligar o login ao convite pelo e-mail (entrar()). Agora vale um CÓDIGO aleatório que vai no
--    link do convite (só o hash fica no banco), com validade de 7 dias e uso único, e o e-mail da conta tem que ser o do convite.
--    Convites antigos (sem código) não são ligados mais: a tela Equipe mostra "Mande o convite de novo".
-- 2. Escola: as compras ficam ligadas ao e-mail da compra, mas só aparecem para quem PROVOU o e-mail da conta com um código
--    ou link mandado para ele (sessão com amr otp/magiclink/recovery..., verificada depois que o e-mail foi posto na conta).
-- 3. Cakto: o pagamento é ligado pela assinatura, pelo callback assinado do link de pagamento (já existia) ou, por último,
--    pelo e-mail do dono, só se esse e-mail já estava na conta antes da compra. O e-mail gravado de uma compra anterior
--    (cakto_email) deixa de puxar compras novas.
--
-- Funções substituídas (cópia da última versão, mudando só o necessário):
--   entrar()            20261111000000_gestao_base.sql            sem a ligação automática pelo e-mail
--   meu_email()         20261125000000_gestao_escola.sql          só devolve o e-mail provado
--   cakto_evento(...)   20261177000000_gestao_revisao_consertos.sql  e-mail do dono só se já estava na conta antes da compra; sem cakto_email

-- ============================================================
-- Quando cada login passou a ter o e-mail que tem agora
-- ============================================================
create table public.emails_desde (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  desde timestamptz not null default now()
);
alter table public.emails_desde enable row level security;
revoke all on public.emails_desde from public, anon, authenticated;

create function public.emails_desde_gravar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or lower(coalesce(old.email, '')) is distinct from lower(coalesce(new.email, '')) then
    begin
      insert into public.emails_desde (user_id, email, desde) values (new.id, lower(coalesce(new.email, '')), now())
        on conflict (user_id) do update set email = excluded.email, desde = excluded.desde;
    exception when others then
      raise warning 'emails_desde_gravar: %', sqlerrm;
    end;
  end if;
  return new;
end $$;
revoke execute on function public.emails_desde_gravar() from public, anon, authenticated;

drop trigger if exists gestao_emails_desde on auth.users;
create trigger gestao_emails_desde after insert or update of email on auth.users
  for each row execute function public.emails_desde_gravar();

-- quem já existe: o melhor que se sabe é a criação da conta
insert into public.emails_desde (user_id, email, desde)
  select u.id, lower(coalesce(u.email, '')), u.created_at from auth.users u
  on conflict (user_id) do nothing;

-- ============================================================
-- E-mail provado (código ou link mandado para a caixa de entrada)
-- ============================================================
create table public.emails_confirmados (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  confirmado_em timestamptz not null default now()
);
alter table public.emails_confirmados enable row level security;
revoke all on public.emails_confirmados from public, anon, authenticated;

-- Contas de antes da mudança que confirmaram o e-mail pelo link (a confirmação veio depois da criação; com "Confirm email"
-- desligado as duas datas são iguais). Elas já tinham provado o e-mail.
insert into public.emails_confirmados (user_id, email, confirmado_em)
  select u.id, lower(u.email), u.email_confirmed_at from auth.users u
   where u.email is not null and u.email <> '' and u.email_confirmed_at > u.created_at + interval '5 seconds'
  on conflict (user_id) do nothing;

-- Grava a prova quando a sessão atual nasceu de um código ou link mandado para o e-mail, DEPOIS que esse e-mail foi posto
-- na conta (troca de e-mail depois do código não vale) e o e-mail da ficha da sessão é o mesmo da conta. Devolve se o
-- e-mail atual da conta está provado.
create function public.email_provar() returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_jwt jsonb := (select auth.jwt());
  v_email text;
  v_desde timestamptz;
  v_quando timestamptz;
begin
  if v_user is null then return false; end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_user;
  if coalesce(v_email, '') = '' then return false; end if;
  if exists (select 1 from public.emails_confirmados c where c.user_id = v_user and c.email = v_email) then return true; end if;
  if lower(coalesce(v_jwt ->> 'email', '')) <> v_email then return false; end if;
  select max(to_timestamp((a ->> 'timestamp')::bigint)) into v_quando
    from jsonb_array_elements(case when jsonb_typeof(v_jwt -> 'amr') = 'array' then v_jwt -> 'amr' else '[]'::jsonb end) a
   where a ->> 'method' in ('otp', 'magiclink', 'recovery', 'email/signup', 'email_change', 'invite')
     and (a ->> 'timestamp') ~ '^[0-9]{1,12}$';
  if v_quando is null then return false; end if;
  select d.desde into v_desde from public.emails_desde d where d.user_id = v_user and d.email = v_email;
  -- o amr vem em segundos inteiros: um segundo de folga
  if v_desde is null or v_quando + interval '1 second' < v_desde then return false; end if;
  insert into public.emails_confirmados (user_id, email, confirmado_em) values (v_user, v_email, now())
    on conflict (user_id) do update set email = excluded.email, confirmado_em = excluded.confirmado_em;
  return true;
end $$;
revoke execute on function public.email_provar() from public, anon;
grant execute on function public.email_provar() to authenticated;

-- Mesmo nome e mesmo uso (regras da Escola: escola_compras_ler e o arquivo em storage). Antes: o e-mail da ficha da sessão.
-- Agora: o e-mail da conta só se ele foi provado; senão '' (não bate com compra nenhuma).
create or replace function public.meu_email() returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select c.email from public.emails_confirmados c join auth.users u on u.id = c.user_id
     where c.user_id = (select auth.uid()) and c.email = lower(u.email)), '')
$$;
revoke execute on function public.meu_email() from public, anon;
grant execute on function public.meu_email() to authenticated;

-- ============================================================
-- Convite da equipe por código
-- ============================================================
-- Um código por convite (a pessoa da equipe). Só o hash sha256 fica guardado. Ninguém lê direto.
create table public.convites_equipe (
  profissional_id uuid primary key references public.profissionais (id) on delete cascade,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  codigo_hash text not null unique check (codigo_hash ~ '^[0-9a-f]{64}$'),
  email text not null,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  usado_em timestamptz,
  usado_por uuid
);
alter table public.convites_equipe enable row level security;
revoke all on public.convites_equipe from public, anon, authenticated;

-- O dono gera (ou gera de novo) o código do convite. O código anterior deixa de valer. Devolve o código (só desta vez).
create function public.convite_gerar(p_profissional uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.profissionais;
  v_codigo text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  select * into v from public.profissionais where id = p_profissional;
  if not found or not public.sou_dono(v.petshop_id) then raise exception 'Pessoa da equipe não encontrada.'; end if;
  if not public.acesso_liberado(v.petshop_id) then raise exception 'A conta está só para consulta. Para mandar convites, veja a tela Assinatura.'; end if;
  if not v.ativo then raise exception 'Esta pessoa está desativada. Reative antes de mandar o convite.'; end if;
  if v.user_id is not null then raise exception 'Esta pessoa já entrou com a própria conta.'; end if;
  if nullif(trim(coalesce(v.email_convite, '')), '') is null then raise exception 'Escreva o e-mail da pessoa antes de mandar o convite.'; end if;
  insert into public.convites_equipe (profissional_id, petshop_id, codigo_hash, email, criado_por, criado_em, expira_em)
    values (v.id, v.petshop_id, encode(extensions.digest(v_codigo, 'sha256'), 'hex'), lower(trim(v.email_convite)), (select auth.uid()), now(), now() + interval '7 days')
    on conflict (profissional_id) do update set codigo_hash = excluded.codigo_hash, email = excluded.email, criado_por = excluded.criado_por,
      criado_em = excluded.criado_em, expira_em = excluded.expira_em, usado_em = null, usado_por = null;
  return v_codigo;
end $$;
revoke execute on function public.convite_gerar(uuid) from public, anon;
grant execute on function public.convite_gerar(uuid) to authenticated;

-- Quem abriu o link do convite, já logado: liga a conta à equipe. Precisa do código certo, dentro da validade, ainda não
-- usado, e o e-mail da conta igual ao do convite. Devolve o pet shop.
create function public.convite_aceitar(p_codigo text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_email text;
  c public.convites_equipe;
  v public.profissionais;
begin
  if v_user is null then raise exception 'Entre na sua conta para aceitar o convite.'; end if;
  if p_codigo is null or btrim(p_codigo) !~ '^[0-9A-Fa-f]{32}$' then
    raise exception 'Este link de convite não vale. Peça ao dono do pet shop para mandar o convite de novo.';
  end if;
  select * into c from public.convites_equipe
   where codigo_hash = encode(extensions.digest(lower(btrim(p_codigo)), 'sha256'), 'hex') for update;
  if not found then raise exception 'Este link de convite não vale mais. Peça ao dono do pet shop para mandar o convite de novo.'; end if;
  -- a mesma pessoa abrindo o link de novo: já está na equipe
  if c.usado_em is not null then
    if c.usado_por = v_user and exists (select 1 from public.profissionais x where x.id = c.profissional_id and x.user_id = v_user and x.ativo) then
      return c.petshop_id;
    end if;
    raise exception 'Este convite já foi usado. Peça ao dono do pet shop para mandar o convite de novo.';
  end if;
  if c.expira_em < now() then raise exception 'Este convite venceu. Peça ao dono do pet shop para mandar o convite de novo.'; end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_user;
  select * into v from public.profissionais where id = c.profissional_id for update;
  if not found or not v.ativo or v.user_id is not null
     or lower(trim(coalesce(v.email_convite, ''))) <> c.email then
    raise exception 'Este link de convite não vale mais. Peça ao dono do pet shop para mandar o convite de novo.';
  end if;
  if coalesce(v_email, '') <> c.email then
    raise exception 'Este convite foi feito para outro e-mail. Entre com a conta do e-mail que recebeu o convite.';
  end if;
  if exists (select 1 from public.profissionais x where x.petshop_id = c.petshop_id and x.user_id = v_user) then
    raise exception 'Esta conta já está na equipe deste pet shop.';
  end if;
  update public.profissionais set user_id = v_user where id = v.id;
  update public.convites_equipe set usado_em = now(), usado_por = v_user where profissional_id = c.profissional_id;
  return c.petshop_id;
end $$;
revoke execute on function public.convite_aceitar(text) from public, anon;
grant execute on function public.convite_aceitar(text) to authenticated;

-- Para a tela Equipe (só o dono): até quando vale o link de cada convite. Sem linha = convite sem link (antigo): mandar de novo.
create function public.convites_situacao(p uuid) returns table (profissional_id uuid, expira_em timestamptz, usado boolean)
language sql stable security definer set search_path = '' as $$
  select c.profissional_id, c.expira_em, c.usado_em is not null
    from public.convites_equipe c join public.profissionais x on x.id = c.profissional_id
   where c.petshop_id = p and (select public.sou_dono(p)) and c.email = lower(trim(coalesce(x.email_convite, '')))
$$;
revoke execute on function public.convites_situacao(uuid) from public, anon;
grant execute on function public.convites_situacao(uuid) to authenticated;

-- Trocou o e-mail, tirou o acesso, desativou ou a pessoa saiu: o código deixa de valer.
create function public.convites_equipe_invalidar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if lower(trim(coalesce(new.email_convite, ''))) is distinct from lower(trim(coalesce(old.email_convite, '')))
     or (old.ativo and not new.ativo)
     or (old.user_id is not null and new.user_id is distinct from old.user_id) then
    delete from public.convites_equipe where profissional_id = new.id;
  end if;
  return new;
end $$;
revoke execute on function public.convites_equipe_invalidar() from public, anon, authenticated;
create trigger profissionais_convite_invalidar after update of email_convite, ativo, user_id on public.profissionais
  for each row execute function public.convites_equipe_invalidar();

-- Mesma função da 20261111 (base), sem a ligação automática pelo e-mail: o convite agora entra só por convite_aceitar.
create or replace function public.entrar() returns setof public.profissionais
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then return; end if;
  return query select * from public.profissionais where user_id = v_user and ativo order by criado_em;
end $$;
revoke execute on function public.entrar() from public, anon;
grant execute on function public.entrar() to authenticated;

-- ============================================================
-- Cakto: e-mail do dono só se já estava na conta antes da compra
-- ============================================================
-- Mesma assinatura e mesmo corpo da 20261177. Muda como acha a conta quando não há assinatura nem callback assinado:
--   - sai o cakto_email (e-mail de uma compra anterior): uma compra paga com o e-mail de outra pessoa não puxa mais as
--     compras novas dessa pessoa;
--   - o e-mail do dono só vale se ele já estava na conta ANTES da compra (payload 'pago_em', que a rota manda; sem ele,
--     agora). Quem cria a conta ou troca o e-mail depois de ver uma compra alheia não recebe o pagamento.
-- O que não casa fica "sem conta" no painel do administrador, que liga na mão.
create or replace function public.cakto_evento(p_segredo text, p_evento text, p_email text, p_assinatura text, p_payload jsonb,
  p_oferta text default null, p_callback text default null, p_produto text default null, p_produto_curto text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_petshop uuid;
  v_produto text;
  v_pedido text := nullif(btrim(coalesce(p_payload ->> 'pedido', '')), '');
  v_por_assinatura boolean := false;
  v_conflito uuid;
  v_negativo boolean := p_evento in ('subscription_late', 'subscription_renewal_refused', 'subscription_canceled', 'subscription_paused', 'refund', 'chargeback');
  v_compra timestamptz := now();
begin
  if not public.cakto_segredo_ok(p_segredo) then return 'recusado'; end if;

  -- outro produto da mesma conta Cakto (ex.: um guia vendido pelo webhook da Escola): não mexe em assinatura nenhuma
  select valor into v_produto from public.config_interna where chave = 'cakto_produto_gestao';
  if v_produto is not null and (p_produto is not null or p_produto_curto is not null)
     and v_produto is distinct from p_produto and v_produto is distinct from p_produto_curto then
    return 'outro_produto';
  end if;

  -- o mesmo aviso de novo (reenvio da Cakto ou alguém repetindo): não estende o pago_ate outra vez
  if v_pedido is not null and not public.webhook_primeira_vez('cakto:'
       || case when p_evento in ('purchase_approved', 'subscription_renewed', 'subscription_late_recovered') then 'pago' else coalesce(p_evento, '') end
       || ':' || v_pedido) then
    return 'repetido';
  end if;

  -- quando a compra foi feita (nunca depois de agora)
  begin
    v_compra := least(now(), coalesce(nullif(btrim(coalesce(p_payload ->> 'pago_em', '')), '')::timestamptz, now()));
  exception when others then
    v_compra := now();
  end;

  select id into v_petshop from public.petshops where p_assinatura is not null and cakto_assinatura = p_assinatura limit 1;
  v_por_assinatura := v_petshop is not null;
  if v_petshop is null and p_callback ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{32}$' then
    select c.petshop_id into v_petshop from public.cakto_callbacks c
      where c.petshop_id = split_part(p_callback, '.', 1)::uuid and c.ficha = lower(split_part(p_callback, '.', 2));
  end if;
  if v_petshop is null and nullif(btrim(coalesce(p_email, '')), '') is not null then
    select p.petshop_id into v_petshop
      from public.profissionais p join auth.users u on u.id = p.user_id
      join public.emails_desde d on d.user_id = u.id and d.email = lower(u.email)
      where p.papel = 'dono' and lower(u.email) = lower(btrim(p_email)) and d.desde <= v_compra
      order by p.criado_em desc limit 1;
  end if;

  if v_petshop is not null and not v_por_assinatura then
    if v_negativo then
      if v_pedido is null or not exists (
          select 1 from public.cakto_eventos e
          where e.petshop_id = v_petshop and e.payload ->> 'pedido' = v_pedido
            and e.evento in ('purchase_approved', 'subscription_created', 'subscription_renewed', 'subscription_late_recovered', 'subscription_resumed')) then
        v_conflito := v_petshop; v_petshop := null;
      end if;
    elsif exists (select 1 from public.petshops x where x.id = v_petshop and x.status in ('ativa', 'atrasada')
                    and x.cakto_assinatura is not null and x.cakto_assinatura is distinct from p_assinatura) then
      v_conflito := v_petshop; v_petshop := null;
    end if;
  end if;

  insert into public.cakto_eventos (evento, email, petshop_id, payload)
    values (p_evento, p_email, v_petshop,
      coalesce(p_payload, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('oferta', p_oferta, 'assinatura', p_assinatura, 'conflito_com', v_conflito)));

  if v_conflito is not null then return 'conflito'; end if;
  if v_petshop is null then return 'sem_conta'; end if;
  return public.cakto_aplicar(v_petshop, p_evento, p_email, p_assinatura, p_oferta, now());
end $$;
revoke execute on function public.cakto_evento(text, text, text, text, jsonb, text, text, text, text) from public;
grant execute on function public.cakto_evento(text, text, text, text, jsonb, text, text, text, text) to anon, authenticated;
