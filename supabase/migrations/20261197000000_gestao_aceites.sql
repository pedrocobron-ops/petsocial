-- Aceite dos Termos de uso e da Política de privacidade do Gestão, com a versão de cada documento.
-- Só acrescenta: tabela nova, gatilho novo no cadastro e funções novas. Nada antigo muda.
--
-- * Cadastro: a tela manda as versões aceitas em `raw_user_meta_data.aceite` ({"termos": "2.0", "privacidade": "2.0"}).
--   O gatilho grava o aceite na hora em que o login nasce (vale também quando o e-mail ainda vai ser confirmado).
-- * Versão nova: o aplicativo mostra a tela de aceite e chama `aceitar_documentos` (grava quem, quando, IP e navegador).
-- * Ninguém grava, muda ou apaga direto na tabela. Cada pessoa lê só os próprios aceites; o admin lê todos pelo painel.
-- * Se o login for apagado, o registro fica (com o e-mail da época), como prova do aceite.

create table if not exists public.aceites (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  email text,
  documento text not null check (documento in ('termos', 'privacidade')),
  versao text not null check (versao ~ '^[0-9A-Za-z._-]{1,20}$'),
  aceito_em timestamptz not null default now(),
  origem text not null check (origem in ('cadastro', 'reaceite')),
  ip text check (length(ip) <= 64),
  navegador text check (length(navegador) <= 300)
);
create unique index if not exists aceites_um_por_versao on public.aceites (user_id, documento, versao) where user_id is not null;
create index if not exists aceites_quando on public.aceites (aceito_em desc);

alter table public.aceites enable row level security;
revoke all on public.aceites from anon, authenticated;
grant select on public.aceites to authenticated;
drop policy if exists "aceites: cada um lê os seus" on public.aceites;
create policy "aceites: cada um lê os seus" on public.aceites for select to authenticated using (user_id = (select auth.uid()));

-- Cadastro: copia o aceite que veio da tela. Nunca derruba o cadastro (o projeto do Supabase é dividido com outro app).
create or replace function public.aceites_do_cadastro() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v jsonb := new.raw_user_meta_data -> 'aceite';
  d text;
begin
  if v is null or jsonb_typeof(v) <> 'object' then return new; end if;
  begin
    foreach d in array array['termos', 'privacidade'] loop
      if jsonb_typeof(v -> d) = 'string' and (v ->> d) ~ '^[0-9A-Za-z._-]{1,20}$' then
        insert into public.aceites (user_id, email, documento, versao, origem)
        values (new.id, lower(new.email), d, v ->> d, 'cadastro')
        on conflict (user_id, documento, versao) where user_id is not null do nothing;
      end if;
    end loop;
  exception when others then
    raise warning 'aceites_do_cadastro: %', sqlerrm;
  end;
  return new;
end $$;
revoke execute on function public.aceites_do_cadastro() from public, anon, authenticated;

drop trigger if exists gestao_aceites_do_cadastro on auth.users;
create trigger gestao_aceites_do_cadastro after insert on auth.users
  for each row execute function public.aceites_do_cadastro();

-- Aceite de uma versão nova, pela tela do aplicativo. Devolve os aceites da pessoa para essas versões.
create or replace function public.aceitar_documentos(p_termos text, p_privacidade text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_cab jsonb;
  v_ip text;
  v_nav text;
begin
  if v_uid is null then raise exception 'Entre na sua conta para continuar.' using errcode = '28000'; end if;
  if coalesce(p_termos, '') !~ '^[0-9A-Za-z._-]{1,20}$' or coalesce(p_privacidade, '') !~ '^[0-9A-Za-z._-]{1,20}$' then
    raise exception 'Versão inválida.' using errcode = '22023';
  end if;
  begin v_cab := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then v_cab := null; end;
  v_ip := left(trim(split_part(coalesce(v_cab ->> 'x-forwarded-for', v_cab ->> 'x-real-ip', ''), ',', 1)), 64);
  v_nav := left(coalesce(v_cab ->> 'user-agent', ''), 300);
  insert into public.aceites (user_id, email, documento, versao, origem, ip, navegador)
  select v_uid, (select lower(u.email) from auth.users u where u.id = v_uid), x.d, x.v, 'reaceite', nullif(v_ip, ''), nullif(v_nav, '')
  from (values ('termos', p_termos), ('privacidade', p_privacidade)) as x(d, v)
  on conflict (user_id, documento, versao) where user_id is not null do nothing;
  return (select coalesce(jsonb_agg(jsonb_build_object('documento', a.documento, 'versao', a.versao, 'aceito_em', a.aceito_em) order by a.documento), '[]'::jsonb)
          from public.aceites a where a.user_id = v_uid and ((a.documento = 'termos' and a.versao = p_termos) or (a.documento = 'privacidade' and a.versao = p_privacidade)));
end $$;
revoke execute on function public.aceitar_documentos(text, text) from public, anon;
grant execute on function public.aceitar_documentos(text, text) to authenticated;

-- Painel do administrador: os aceites mais recentes, com o pet shop de cada pessoa, e a contagem por versão.
create or replace function public.admin_aceites(p_busca text default null, p_limite integer default 300) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_busca text := nullif(lower(trim(coalesce(p_busca, ''))), '');
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return jsonb_build_object(
    'versoes', (select coalesce(jsonb_agg(jsonb_build_object('documento', documento, 'versao', versao, 'pessoas', n, 'ultimo', ultimo) order by documento, ultimo desc), '[]'::jsonb)
                from (select documento, versao, count(*) as n, max(aceito_em) as ultimo from public.aceites group by documento, versao) v),
    'aceites', (select coalesce(jsonb_agg(to_jsonb(r) order by r.aceito_em desc), '[]'::jsonb) from (
      select a.id, a.user_id, a.email, a.documento, a.versao, a.aceito_em, a.origem, a.ip, a.navegador,
             (select string_agg(distinct p.nome, ', ') from public.profissionais pr join public.petshops p on p.id = pr.petshop_id where pr.user_id = a.user_id) as petshops
      from public.aceites a
      where v_busca is null or a.email like '%' || v_busca || '%'
      order by a.aceito_em desc
      limit greatest(1, least(coalesce(p_limite, 300), 2000))
    ) r)
  );
end $$;
revoke execute on function public.admin_aceites(text, integer) from public, anon;
grant execute on function public.admin_aceites(text, integer) to authenticated;
