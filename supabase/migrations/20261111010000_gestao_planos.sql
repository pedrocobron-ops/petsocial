-- Planos por número de acessos: solo (1), equipe (3) e petshop (6). Todas as funções em todos os planos.
-- O plano com WhatsApp deixa de ser um plano e vira um interruptor interno (ainda não público).

alter table public.petshops add column whatsapp boolean not null default false;
alter table public.petshops drop constraint petshops_plano_check;
update public.petshops set whatsapp = true where plano = 'gestao_whatsapp';
update public.petshops set plano = 'petshop' where plano not in ('solo', 'equipe', 'petshop');
alter table public.petshops alter column plano set default 'petshop';
alter table public.petshops add constraint petshops_plano_check check (plano in ('solo', 'equipe', 'petshop'));

create function public.limite_de_acessos(p_plano text) returns int
language sql immutable set search_path = '' as $$
  select case p_plano when 'solo' then 1 when 'equipe' then 3 else 6 end
$$;

-- Um acesso é uma pessoa ativa com login ou com convite pendente. O dono conta.
create function public.conferir_acessos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_limite int;
  v_usados int;
  v_ocupa boolean := new.ativo and (new.user_id is not null or nullif(trim(coalesce(new.email_convite, '')), '') is not null);
  v_ocupava boolean := tg_op = 'UPDATE' and old.ativo and (old.user_id is not null or nullif(trim(coalesce(old.email_convite, '')), '') is not null);
begin
  if not v_ocupa or v_ocupava then return new; end if;
  select public.limite_de_acessos(plano) into v_limite from public.petshops where id = new.petshop_id;
  select count(*) into v_usados from public.profissionais
    where petshop_id = new.petshop_id and id <> new.id and ativo
      and (user_id is not null or nullif(trim(coalesce(email_convite, '')), '') is not null);
  if v_usados >= v_limite then
    raise exception 'O plano atual permite % com login. Para dar acesso a mais gente, mude de plano na tela Assinatura.',
      case v_limite when 1 then '1 pessoa' else v_limite || ' pessoas' end;
  end if;
  return new;
end $$;
create trigger profissionais_acessos before insert or update on public.profissionais
  for each row execute function public.conferir_acessos();

-- O aviso da Cakto passa a dizer qual oferta foi comprada: a oferta define o plano.
-- O vínculo oferta → plano fica em config_interna, com a chave 'cakto_oferta_<id da oferta>' e o valor 'solo', 'equipe' ou 'petshop'.
drop function public.cakto_evento(text, text, text, text, jsonb);
create function public.cakto_evento(p_segredo text, p_evento text, p_email text, p_assinatura text, p_payload jsonb, p_oferta text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
  v_petshop uuid;
  v_status public.status_assinatura;
  v_plano text;
begin
  select valor into v_hash from public.config_interna where chave = 'cakto_segredo_sha256';
  if v_hash is null or p_segredo is null
     or encode(extensions.digest(p_segredo, 'sha256'), 'hex') <> v_hash then
    return 'recusado';
  end if;

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

  select id into v_petshop from public.petshops where p_assinatura is not null and cakto_assinatura = p_assinatura limit 1;
  if v_petshop is null and p_email is not null then
    select id into v_petshop from public.petshops where lower(cakto_email) = lower(p_email) order by criado_em desc limit 1;
  end if;
  if v_petshop is null and p_email is not null then
    select p.petshop_id into v_petshop
      from public.profissionais p join auth.users u on u.id = p.user_id
      where p.papel = 'dono' and lower(u.email) = lower(p_email)
      order by p.criado_em desc limit 1;
  end if;

  insert into public.cakto_eventos (evento, email, petshop_id, payload) values (p_evento, p_email, v_petshop, p_payload);

  if v_petshop is null then return 'sem_conta'; end if;
  if v_status is null then return 'ignorado'; end if;

  if p_oferta is not null then
    select valor into v_plano from public.config_interna where chave = 'cakto_oferta_' || p_oferta and valor in ('solo', 'equipe', 'petshop');
  end if;

  update public.petshops set
      status = case when status = 'cortesia' then status else v_status end,
      plano = case when v_status = 'ativa' and v_plano is not null then v_plano else plano end,
      cakto_email = coalesce(cakto_email, lower(p_email)),
      cakto_assinatura = coalesce(p_assinatura, cakto_assinatura),
      assinatura_desde = case when v_status = 'ativa' then coalesce(assinatura_desde, now()) else assinatura_desde end
    where id = v_petshop;
  return 'ok';
end $$;

revoke execute on function public.cakto_evento(text, text, text, text, jsonb, text), public.conferir_acessos(), public.limite_de_acessos(text) from public, anon, authenticated;
grant execute on function public.cakto_evento(text, text, text, text, jsonb, text) to anon, authenticated;
grant execute on function public.limite_de_acessos(text) to authenticated;
