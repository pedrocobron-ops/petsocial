-- Painel do administrador da plataforma: uso de cada pet shop (tempo, última vez visto, telas) e conversas com o Mozart e a Ajuda.

create table public.presenca (
  user_id uuid not null references auth.users (id) on delete cascade,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  visto_em timestamptz not null default now(),
  contado_em timestamptz not null default now(),
  area text,
  primary key (user_id, petshop_id)
);
create table public.uso_diario (
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  dia date not null,
  area text not null,
  minutos integer not null default 0,
  primary key (petshop_id, user_id, dia, area)
);
create index on public.uso_diario (petshop_id, dia);
create table public.conversas (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  canal text not null check (canal in ('mozart', 'ajuda')),
  pergunta text not null,
  resposta text,
  resolveu boolean,
  pediu_equipe boolean not null default false,
  criado_em timestamptz not null default now()
);
create index on public.conversas (criado_em desc);
create index on public.conversas (petshop_id, criado_em desc);

-- sem regra de acesso: só as funções abaixo leem e gravam
alter table public.presenca enable row level security;
alter table public.uso_diario enable row level security;
alter table public.conversas enable row level security;

-- O aplicativo chama a cada minuto com a tela aberta. Conta no máximo um minuto por minuto.
create function public.marcar_uso(p_petshop uuid, p_area text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_eu uuid := (select auth.uid());
  v_area text := left(coalesce(nullif(btrim(p_area), ''), 'hoje'), 40);
  v_contado timestamptz;
begin
  if v_eu is null or p_petshop not in (select public.meus_petshops()) then return; end if;
  select contado_em into v_contado from public.presenca where user_id = v_eu and petshop_id = p_petshop;
  if v_contado is null then
    insert into public.presenca (user_id, petshop_id, area) values (v_eu, p_petshop, v_area)
      on conflict (user_id, petshop_id) do update set visto_em = now(), area = excluded.area;
    return;
  end if;
  if now() - v_contado >= interval '50 seconds' then
    update public.presenca set visto_em = now(), contado_em = now(), area = v_area where user_id = v_eu and petshop_id = p_petshop;
    -- só conta o minuto se a pessoa estava mesmo com a tela aberta (sem buraco grande desde a última marca)
    if now() - v_contado < interval '3 minutes' then
      insert into public.uso_diario (petshop_id, user_id, dia, area, minutos)
        values (p_petshop, v_eu, (now() at time zone 'America/Sao_Paulo')::date, v_area, 1)
        on conflict (petshop_id, user_id, dia, area) do update set minutos = public.uso_diario.minutos + 1;
    end if;
  else
    update public.presenca set visto_em = now(), area = v_area where user_id = v_eu and petshop_id = p_petshop;
  end if;
end $$;

create function public.registrar_conversa(p_petshop uuid, p_canal text, p_pergunta text, p_resposta text, p_pediu_equipe boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null or p_petshop not in (select public.meus_petshops()) then return null; end if;
  if p_canal not in ('mozart', 'ajuda') or coalesce(btrim(p_pergunta), '') = '' then return null; end if;
  insert into public.conversas (petshop_id, user_id, canal, pergunta, resposta, pediu_equipe)
    values (p_petshop, (select auth.uid()), p_canal, left(p_pergunta, 2000), left(p_resposta, 4000), coalesce(p_pediu_equipe, false))
    returning id into v_id;
  return v_id;
end $$;

create function public.avaliar_conversa(p_id uuid, p_resolveu boolean default null, p_pediu_equipe boolean default null) returns void
language sql security definer set search_path = '' as $$
  update public.conversas set resolveu = coalesce(p_resolveu, resolveu), pediu_equipe = coalesce(p_pediu_equipe, pediu_equipe)
  where id = p_id and user_id = (select auth.uid());
$$;

create function public.admin_uso() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return (
    select coalesce(jsonb_agg(x), '[]'::jsonb) from (
      select p.id,
        (select max(pr.visto_em) from public.presenca pr where pr.petshop_id = p.id) as visto_em,
        (select count(*) from public.presenca pr where pr.petshop_id = p.id and pr.visto_em > now() - interval '3 minutes') as online,
        (select coalesce(sum(u.minutos), 0) from public.uso_diario u where u.petshop_id = p.id and u.dia > current_date - 7) as min_7d,
        (select coalesce(sum(u.minutos), 0) from public.uso_diario u where u.petshop_id = p.id and u.dia > current_date - 30) as min_30d,
        (select count(distinct u.dia) from public.uso_diario u where u.petshop_id = p.id and u.dia > current_date - 30) as dias_30d,
        (select coalesce(jsonb_object_agg(a.area, a.m), '{}'::jsonb) from
           (select u.area, sum(u.minutos) as m from public.uso_diario u where u.petshop_id = p.id and u.dia > current_date - 30 group by u.area) a) as areas,
        (select coalesce(jsonb_agg(jsonb_build_object('nome', d.nome, 'visto_em', pr.visto_em, 'area', pr.area) order by pr.visto_em desc), '[]'::jsonb)
           from public.presenca pr join public.profissionais d on d.user_id = pr.user_id and d.petshop_id = pr.petshop_id where pr.petshop_id = p.id) as pessoas,
        (select count(*) from public.conversas c where c.petshop_id = p.id and c.canal = 'mozart' and c.criado_em > now() - interval '30 days') as mozart_30d,
        (select count(*) from public.conversas c where c.petshop_id = p.id and c.canal = 'ajuda' and c.criado_em > now() - interval '30 days') as ajuda_30d
      from public.petshops p
    ) x
  );
end $$;

create function public.admin_conversas(p_petshop uuid default null, p_canal text default null, p_limite integer default 300) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return (
    select coalesce(jsonb_agg(x order by x.criado_em desc), '[]'::jsonb) from (
      select c.id, c.petshop_id, p.nome as petshop, c.canal, c.pergunta, c.resposta, c.resolveu, c.pediu_equipe, c.criado_em,
        (select d.nome from public.profissionais d where d.user_id = c.user_id and d.petshop_id = c.petshop_id limit 1) as pessoa
      from public.conversas c join public.petshops p on p.id = c.petshop_id
      where (p_petshop is null or c.petshop_id = p_petshop) and (p_canal is null or c.canal = p_canal)
      order by c.criado_em desc limit least(greatest(coalesce(p_limite, 300), 1), 1000)
    ) x
  );
end $$;

revoke execute on function public.marcar_uso(uuid, text), public.registrar_conversa(uuid, text, text, text, boolean), public.avaliar_conversa(uuid, boolean, boolean),
  public.admin_uso(), public.admin_conversas(uuid, text, integer) from public, anon;
grant execute on function public.marcar_uso(uuid, text), public.registrar_conversa(uuid, text, text, text, boolean), public.avaliar_conversa(uuid, boolean, boolean),
  public.admin_uso(), public.admin_conversas(uuid, text, integer) to authenticated;
