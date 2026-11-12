-- Escola de Gestão: materiais comprados na Cakto podem ser lidos dentro do sistema.

-- O arquivo (PDF) de cada produto, enviado pela equipe Maestro Pet. `slug` é o do catálogo do site.
create table public.escola_materiais (
  slug text primary key check (slug ~ '^[a-z0-9-]{1,60}$'),
  arquivo text not null check (char_length(arquivo) <= 200),
  tamanho bigint,
  atualizado_em timestamptz not null default now()
);
-- Quem comprou o quê. Vale pelo e-mail da compra: tem que ser o mesmo da conta.
create table public.escola_compras (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(email) and char_length(email) between 3 and 200),
  slug text not null check (slug ~ '^[a-z0-9-]{1,60}$'),
  origem text not null default 'cakto' check (origem in ('cakto', 'manual')),
  pedido text,
  criado_em timestamptz not null default now(),
  unique (email, slug)
);
alter table public.escola_materiais enable row level security;
alter table public.escola_compras enable row level security;

create function public.meu_email() returns text
language sql stable set search_path = '' as $$ select lower(coalesce((select auth.jwt()) ->> 'email', '')) $$;

-- todo mundo logado sabe quais materiais já têm arquivo; só a equipe Maestro Pet grava
create policy escola_materiais_ler on public.escola_materiais for select to authenticated using (true);
create policy escola_materiais_criar on public.escola_materiais for insert to authenticated with check ((select public.sou_admin()));
create policy escola_materiais_editar on public.escola_materiais for update to authenticated using ((select public.sou_admin())) with check ((select public.sou_admin()));
create policy escola_materiais_remover on public.escola_materiais for delete to authenticated using ((select public.sou_admin()));
grant select, insert, update, delete on public.escola_materiais to authenticated;
-- cada um vê só as próprias compras
create policy escola_compras_ler on public.escola_compras for select to authenticated using (email = (select public.meu_email()) or (select public.sou_admin()));
grant select on public.escola_compras to authenticated;

-- arquivos: pasta com o slug do produto. Lê quem comprou; grava só a equipe Maestro Pet.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('escola', 'escola', false, 52428800, array['application/pdf'])
  on conflict (id) do nothing;
create policy escola_ler on storage.objects for select to authenticated
  using (bucket_id = 'escola' and ((select public.sou_admin()) or exists (
    select 1 from public.escola_compras c where c.email = (select public.meu_email()) and c.slug = (storage.foldername(name))[1])));
create policy escola_enviar on storage.objects for insert to authenticated with check (bucket_id = 'escola' and (select public.sou_admin()));
create policy escola_trocar on storage.objects for update to authenticated using (bucket_id = 'escola' and (select public.sou_admin()));
create policy escola_apagar on storage.objects for delete to authenticated using (bucket_id = 'escola' and (select public.sou_admin()));

-- Aviso da Cakto para um produto da escola: compra aprovada libera, devolução ou contestação tira.
create function public.escola_evento(p_segredo text, p_evento text, p_email text, p_slug text, p_pedido text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare v_hash text; v_email text := lower(trim(coalesce(p_email, '')));
begin
  select valor into v_hash from public.config_interna where chave = 'cakto_segredo_sha256';
  if v_hash is null or p_segredo is null or encode(extensions.digest(p_segredo, 'sha256'), 'hex') <> v_hash then return 'recusado'; end if;
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
revoke execute on function public.escola_evento(text, text, text, text, text) from public;
grant execute on function public.escola_evento(text, text, text, text, text) to anon, authenticated;

-- Painel do administrador: quantas pessoas têm cada material, liberar e tirar na mão.
create function public.admin_escola() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return jsonb_build_object(
    'materiais', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public.escola_materiais m),
    'compras', (select coalesce(jsonb_agg(to_jsonb(c) order by c.criado_em desc), '[]'::jsonb) from (select * from public.escola_compras order by criado_em desc limit 500) c)
  );
end $$;
create function public.admin_escola_liberar(p_email text, p_slug text, p_tirar boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  if p_tirar then
    delete from public.escola_compras where email = lower(trim(p_email)) and slug = p_slug;
  else
    insert into public.escola_compras (email, slug, origem) values (lower(trim(p_email)), p_slug, 'manual') on conflict (email, slug) do nothing;
  end if;
end $$;
revoke execute on function public.admin_escola(), public.admin_escola_liberar(text, text, boolean) from public, anon;
grant execute on function public.admin_escola(), public.admin_escola_liberar(text, text, boolean) to authenticated;
