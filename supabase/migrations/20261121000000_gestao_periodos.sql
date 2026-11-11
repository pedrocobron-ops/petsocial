-- Planos de 3 e 6 meses: guarda até quando a assinatura está paga, para quem cancela no meio do período continuar usando até o fim.
-- A ligação da oferta ao plano aceita o período: 'solo' (mensal), 'solo:3' ou 'solo:6'.

alter table public.petshops add column pago_ate timestamptz, add column periodo_meses integer not null default 1;

create or replace function public.acesso_liberado(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.petshops
    where id = p and (status in ('ativa', 'atrasada', 'cortesia') or (status = 'teste' and teste_ate > now()) or (status = 'cancelada' and pago_ate > now()))
  )
$$;

create or replace function public.cakto_evento(p_segredo text, p_evento text, p_email text, p_assinatura text, p_payload jsonb, p_oferta text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
  v_petshop uuid;
  v_status public.status_assinatura;
  v_valor text;
  v_plano text;
  v_meses integer;
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
      -- pagamento que entrou: paga mais um período a partir de agora (com um dia de folga). Devolução ou contestação: zera.
      pago_ate = case
        when p_evento in ('purchase_approved', 'subscription_renewed', 'subscription_late_recovered')
          then now() + make_interval(months => coalesce(v_meses, periodo_meses, 1), days => 1)
        when p_evento in ('refund', 'chargeback') then null
        else pago_ate end,
      cakto_email = coalesce(cakto_email, lower(p_email)),
      cakto_assinatura = coalesce(p_assinatura, cakto_assinatura),
      assinatura_desde = case when v_status = 'ativa' then coalesce(assinatura_desde, now()) else assinatura_desde end
    where id = v_petshop;
  return 'ok';
end $$;
