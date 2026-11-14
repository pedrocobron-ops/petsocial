-- Página do tutor (opção "casa.tutor", desligada por padrão): fotos do dia do pet na creche e no hotel, e um link
-- particular por tutor (/gestao/tutor/<código>) com o diário, as fotos, o que está marcado e os avisos de vacina.
--
-- Só entram objetos novos: duas tabelas, funções novas, um bucket privado e políticas novas nele. Nenhuma tabela,
-- coluna ou função que já existia muda, então o código no ar segue igual neste banco (com ou sem as migrações 49 e 57).
-- Nada aqui guarda dinheiro, e a página do tutor não mostra preço.
--
-- Fotos: bucket privado "diario", arquivo em <petshop>/<pet>/<dia>/<aleatório>.jpg. A equipe do pet shop lê; o tutor só
-- lê com o código do link no cabeçalho "x-tutor-token" (o servidor da página pede endereços assinados que valem 15 min).
-- Sem o código, ninguém lista nem baixa nada.

-- ---------- a opção ----------
create function public.tutor_pagina_ligada(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select coalesce((s.opcoes -> 'casa.tutor' ->> 'ativo')::boolean, false) from public.petshops s where s.id = p), false)
$$;

-- a primeira pasta do caminho, como uuid (ou nada, se não for)
create function public.diario_pasta(p_nome text) returns uuid
language sql immutable set search_path = '' as $$
  select case when split_part(p_nome, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(p_nome, '/', 1)::uuid end
$$;

-- ---------- fotos do dia ----------
create table public.diario_fotos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  estadia_id uuid not null references public.estadias (id) on delete cascade,
  pet_id uuid not null references public.pets (id) on delete cascade,
  dia date not null,
  caminho text not null unique check (char_length(caminho) between 10 and 200),
  legenda text check (char_length(legenda) <= 200),
  bytes int,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id) on delete set null,
  criado_nome text
);
create index on public.diario_fotos (petshop_id, dia);
create index on public.diario_fotos (pet_id, dia desc);
create index on public.diario_fotos (estadia_id);
alter table public.diario_fotos enable row level security;
revoke all on public.diario_fotos from anon, authenticated;
grant select, insert, delete on public.diario_fotos to authenticated;
create policy diario_fotos_ler on public.diario_fotos for select to authenticated
  using (petshop_id in (select public.meus_petshops()));
create policy diario_fotos_criar on public.diario_fotos for insert to authenticated
  with check ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)) and (select public.tutor_pagina_ligada(petshop_id)));
-- apagar: o dono, ou quem mandou a foto
create policy diario_fotos_apagar on public.diario_fotos for delete to authenticated
  using (petshop_id in (select public.meus_petshops()) and ((select public.sou_dono(petshop_id)) or criado_por = (select auth.uid())));

-- Confere a foto: o pet e o pet shop vêm da estadia, o dia é sempre hoje (no fuso do pet shop), a estadia está na casa
-- ou saiu hoje, o arquivo já está no bucket, na pasta do pet shop, e o pet tem no máximo 10 fotos no dia.
create function public.diario_fotos_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare e public.estadias; v_fuso text; v_hoje date; v_bytes bigint;
begin
  select * into e from public.estadias x where x.id = new.estadia_id;
  if not found then raise exception 'Estadia não encontrada.'; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = e.petshop_id;
  v_hoje := (now() at time zone v_fuso)::date;
  if not (e.status = 'em_casa' or (e.status = 'encerrada' and e.saida is not null and (e.saida at time zone v_fuso)::date = v_hoje)) then
    raise exception 'Só dá para pôr fotos de quem está na casa hoje.';
  end if;
  new.petshop_id := e.petshop_id;
  new.pet_id := e.pet_id;
  new.dia := v_hoje;
  new.criado_em := now();
  new.legenda := nullif(left(trim(coalesce(new.legenda, '')), 200), '');
  if public.diario_pasta(new.caminho) is distinct from e.petshop_id or new.caminho like '%..%' then raise exception 'Foto fora da pasta do pet shop.'; end if;
  select coalesce((o.metadata ->> 'size')::bigint, 0) into v_bytes from storage.objects o where o.bucket_id = 'diario' and o.name = new.caminho;
  if not found then raise exception 'A foto não chegou. Tente de novo.'; end if;
  new.bytes := least(v_bytes, 2147483647)::int;
  perform pg_advisory_xact_lock(hashtext('diario_fotos' || e.pet_id::text || v_hoje::text));
  if (select count(*) from public.diario_fotos f where f.pet_id = e.pet_id and f.dia = v_hoje) >= 10 then
    raise exception 'Este pet já tem 10 fotos hoje. Apague uma para pôr outra.';
  end if;
  if (select auth.uid()) is not null then
    new.criado_por := (select auth.uid());
    new.criado_nome := public.casa_quem_escreve(e.petshop_id);
  end if;
  return new;
end $$;
create trigger diario_fotos_conferir before insert on public.diario_fotos
  for each row execute function public.diario_fotos_conferir();

-- ---------- o link de cada tutor ----------
-- O código tem 64 letras e números (dois uuid aleatórios, mais de 240 bits): não dá para adivinhar.
create table public.tutor_links (
  cliente_id uuid primary key references public.clientes (id) on delete cascade,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  token text not null unique check (char_length(token) between 40 and 100),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id) on delete set null,
  visto_em timestamptz
);
create index on public.tutor_links (petshop_id);
alter table public.tutor_links enable row level security;
revoke all on public.tutor_links from anon, authenticated;
grant select on public.tutor_links to authenticated;
-- quem manda o link é quem cuida dos clientes ou da creche e do hotel; criar, trocar e desligar é pelas funções abaixo
create policy tutor_links_ler on public.tutor_links for select to authenticated
  using ((select public.tenho_area(petshop_id, array['creche_hotel', 'clientes'])));

create function public.tutor_codigo_novo() returns text
language sql volatile set search_path = '' as $$
  select replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')
$$;

-- O link do tutor (cria na primeira vez). Precisa da opção ligada.
create function public.tutor_link(p_cliente uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_petshop uuid; v_token text;
begin
  select c.petshop_id into v_petshop from public.clientes c where c.id = p_cliente;
  if v_petshop is null or not public.tenho_area(v_petshop, array['creche_hotel', 'clientes']) then raise exception 'Tutor não encontrado.'; end if;
  if not public.tutor_pagina_ligada(v_petshop) then raise exception 'A página do tutor está desligada em Meu pet shop.'; end if;
  select l.token into v_token from public.tutor_links l where l.cliente_id = p_cliente;
  if v_token is not null then return v_token; end if;
  if not public.acesso_liberado(v_petshop) then raise exception 'A conta está só para consulta.'; end if;
  insert into public.tutor_links (cliente_id, petshop_id, token, criado_por)
  values (p_cliente, v_petshop, public.tutor_codigo_novo(), (select auth.uid()))
  on conflict (cliente_id) do nothing;
  select l.token into v_token from public.tutor_links l where l.cliente_id = p_cliente;
  return v_token;
end $$;

-- Troca o código: o link antigo para de funcionar na hora. Só o dono.
create function public.tutor_link_trocar(p_cliente uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare v_petshop uuid; v_token text := public.tutor_codigo_novo();
begin
  select c.petshop_id into v_petshop from public.clientes c where c.id = p_cliente;
  if v_petshop is null or not public.sou_dono(v_petshop) then raise exception 'Só o dono troca o link do tutor.'; end if;
  if not public.tutor_pagina_ligada(v_petshop) then raise exception 'A página do tutor está desligada em Meu pet shop.'; end if;
  insert into public.tutor_links (cliente_id, petshop_id, token, criado_por)
  values (p_cliente, v_petshop, v_token, (select auth.uid()))
  on conflict (cliente_id) do update set token = excluded.token, criado_em = now(), criado_por = excluded.criado_por, visto_em = null;
  return v_token;
end $$;

-- Desliga o link deste tutor (um novo só sai quando alguém mandar a página de novo). Só o dono.
create function public.tutor_link_desligar(p_cliente uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_petshop uuid;
begin
  select c.petshop_id into v_petshop from public.clientes c where c.id = p_cliente;
  if v_petshop is null or not public.sou_dono(v_petshop) then raise exception 'Só o dono desliga o link do tutor.'; end if;
  delete from public.tutor_links where cliente_id = p_cliente;
end $$;

-- O tutor dono deste código, se o link vale agora (opção ligada e conta liberada).
create function public.tutor_do_codigo(p_token text) returns public.tutor_links
language sql stable security definer set search_path = '' as $$
  select l.* from public.tutor_links l
  where p_token is not null and char_length(p_token) between 40 and 100 and l.token = p_token
    and public.tutor_pagina_ligada(l.petshop_id) and public.acesso_liberado(l.petshop_id)
$$;

-- A foto é de um pet deste tutor? (o bucket pergunta, com o código que veio no cabeçalho x-tutor-token)
create function public.tutor_ve_foto(p_nome text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_token text; l public.tutor_links;
begin
  begin
    v_token := nullif(current_setting('request.headers', true), '')::json ->> 'x-tutor-token';
  exception when others then return false;
  end;
  if v_token is null then return false; end if;
  l := public.tutor_do_codigo(v_token);
  if l.cliente_id is null then return false; end if;
  return exists (
    select 1 from public.diario_fotos f join public.pets p on p.id = f.pet_id
    where f.caminho = p_nome and f.petshop_id = l.petshop_id and p.cliente_id = l.cliente_id
  );
end $$;

-- Tudo o que a página do tutor mostra, sem preço. Nada (null) quando o código não vale.
create function public.tutor_pagina(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l public.tutor_links;
  s public.petshops;
  v_hoje date;
  v_pets jsonb;
begin
  l := public.tutor_do_codigo(p_token);
  if l.cliente_id is null then return null; end if;
  select * into s from public.petshops where id = l.petshop_id;
  v_hoje := (now() at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date;
  if l.visto_em is null or l.visto_em < now() - interval '10 minutes' then
    update public.tutor_links set visto_em = now() where cliente_id = l.cliente_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'nome', p.nome, 'especie', p.especie, 'sexo', p.sexo, 'foto', p.foto,
    -- está na casa agora?
    'na_casa', (select jsonb_build_object('tipo', e.tipo, 'entrada', e.entrada, 'saida_prevista', e.saida_prevista)
                from public.estadias e where e.pet_id = p.id and e.petshop_id = s.id and e.status = 'em_casa' order by e.entrada desc limit 1),
    -- os dias com diário ou foto, dos últimos 30 dias (no máximo 14)
    'dias', coalesce((
      select jsonb_agg(d.j order by d.dia desc) from (
        select x.dia, jsonb_build_object(
          'dia', x.dia,
          'tipo', (select e.tipo from public.estadias e where e.id = x.estadia_id),
          'itens', coalesce((select r.itens from public.estadias_diario r where r.estadia_id = x.estadia_id and r.dia = x.dia), '[]'::jsonb),
          'nota', (select r.nota from public.estadias_diario r where r.estadia_id = x.estadia_id and r.dia = x.dia),
          'ocorrencias', coalesce((select jsonb_agg(jsonb_build_object('tipo', o.tipo, 'texto', o.texto, 'quando', o.quando) order by o.quando)
                          from public.estadias_ocorrencias o where o.estadia_id = x.estadia_id and o.no_diario
                            and (o.quando at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date = x.dia), '[]'::jsonb),
          'fotos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'caminho', f.caminho, 'legenda', f.legenda, 'em', f.criado_em) order by f.criado_em)
                    from public.diario_fotos f where f.estadia_id = x.estadia_id and f.dia = x.dia), '[]'::jsonb)
        ) as j
        from (
          select distinct on (u.dia) u.estadia_id, u.dia from (
            select r.estadia_id, r.dia from public.estadias_diario r join public.estadias e on e.id = r.estadia_id
              where e.pet_id = p.id and r.petshop_id = s.id and r.dia > v_hoje - 30
                and (jsonb_array_length(r.itens) > 0 or nullif(trim(coalesce(r.nota, '')), '') is not null)
            union all
            select f.estadia_id, f.dia from public.diario_fotos f where f.pet_id = p.id and f.petshop_id = s.id and f.dia > v_hoje - 30
          ) u order by u.dia desc
          limit 14
        ) x
      ) d), '[]'::jsonb),
    -- o que está marcado (sem preço)
    'agenda', coalesce((
      select jsonb_agg(jsonb_build_object('inicio', a.inicio, 'servico', sv.nome) order by a.inicio)
      from (select * from public.agendamentos a where a.pet_id = p.id and a.petshop_id = s.id and a.inicio >= now()
              and a.status in ('marcado', 'confirmado') order by a.inicio limit 8) a
      left join public.servicos sv on sv.id = a.servico_id), '[]'::jsonb),
    'reservas', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', e.tipo, 'entrada', e.entrada, 'saida_prevista', e.saida_prevista) order by e.entrada)
      from (select * from public.estadias e where e.pet_id = p.id and e.petshop_id = s.id and e.status = 'reservada'
              and e.entrada >= now() - interval '1 day' order by e.entrada limit 8) e), '[]'::jsonb),
    -- vacinas e cuidados vencidos ou vencendo nos próximos 45 dias (o registro mais novo de cada um)
    'saude', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', v.tipo, 'nome', v.nome, 'vence_em', v.vence_em) order by v.vence_em)
      from (select distinct on (lower(h.nome)) h.tipo, h.nome, h.vence_em from public.pets_saude h
              where h.pet_id = p.id and h.petshop_id = s.id
              order by lower(h.nome), h.aplicado_em desc nulls last, h.vence_em desc nulls last) v
      where v.vence_em is not null and v.vence_em <= v_hoje + 45), '[]'::jsonb)
  ) order by p.nome), '[]'::jsonb)
  into v_pets
  from public.pets p where p.cliente_id = l.cliente_id and p.petshop_id = s.id and p.ativo;

  return jsonb_build_object(
    'petshop', jsonb_build_object('nome', s.nome, 'logo', s.logo, 'tema', s.tema, 'telefone', s.telefone, 'cidade', s.cidade, 'uf', s.uf, 'fuso', coalesce(s.fuso, 'America/Sao_Paulo')),
    'tutor', (select split_part(trim(c.nome), ' ', 1) from public.clientes c where c.id = l.cliente_id),
    'hoje', v_hoje,
    'pets', v_pets
  );
end $$;

revoke execute on function public.tutor_pagina_ligada(uuid), public.diario_fotos_conferir(), public.tutor_codigo_novo(),
  public.tutor_link(uuid), public.tutor_link_trocar(uuid), public.tutor_link_desligar(uuid), public.tutor_do_codigo(text),
  public.tutor_ve_foto(text), public.tutor_pagina(text), public.diario_pasta(text) from public, anon, authenticated;
grant execute on function public.tutor_pagina_ligada(uuid), public.diario_pasta(text), public.tutor_link(uuid), public.tutor_link_trocar(uuid), public.tutor_link_desligar(uuid) to authenticated;
-- o bucket confere a foto com o papel de quem pede (anon para o tutor)
grant execute on function public.tutor_ve_foto(text) to anon, authenticated;
grant execute on function public.tutor_pagina(text) to anon, authenticated;

-- ---------- o bucket privado ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('diario', 'diario', false, 1572864, array['image/jpeg', 'image/webp'])
  on conflict (id) do nothing;

-- a equipe do pet shop vê as fotos do pet shop
create policy diario_equipe_ler on storage.objects for select to authenticated
  using (bucket_id = 'diario' and public.diario_pasta(name) in (select public.meus_petshops()));
-- o tutor, só as fotos dos pets dele, com o código do link
create policy diario_tutor_ler on storage.objects for select to anon, authenticated
  using (bucket_id = 'diario' and public.tutor_ve_foto(name));
-- quem trabalha na creche e no hotel manda foto, com a opção ligada
create policy diario_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'diario' and public.diario_pasta(name) in (select public.meus_petshops())
    and public.tenho_area(public.diario_pasta(name), array['creche_hotel'])
    and public.acesso_liberado(public.diario_pasta(name)) and public.tutor_pagina_ligada(public.diario_pasta(name)));
-- apagar o arquivo: só depois de a foto sair do diário (ou se ela nem entrou), pelo dono ou por quem mandou
create policy diario_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'diario' and public.diario_pasta(name) in (select public.meus_petshops())
    and (public.sou_dono(public.diario_pasta(name)) or owner_id = (select auth.uid())::text)
    and not exists (select 1 from public.diario_fotos f where f.caminho = name));

notify pgrst, 'reload schema';
