-- Senha do painel do administrador (no lugar do segundo fator TOTP de 20261245).
--
-- O dono pediu: nada de código no celular; uma senha só do painel, que só ele sabe, e que só troca por e-mail.
--
-- 1. Senha do painel por admin (admin_senhas): só o hash bcrypt (pgcrypto, custo 12) fica guardado. Ninguém lê pela API:
--    a tabela não tem regra de leitura e nenhum papel da API tem permissão nela (nem a chave de serviço).
-- 2. Abrir o painel: admin_painel_abrir(senha) confere a senha e registra a "sessão do painel" (admin_painel_sessoes) para a
--    sessão de login de quem chama (o `session_id` do token do Supabase Auth, que o cliente não escolhe) e para o usuário,
--    por 12 horas. Outro login (outro aparelho, entrar de novo) tem outro `session_id`: começa com o painel fechado. Sair da
--    conta apaga a sessão de login no Auth, e o painel fecha junto na hora.
-- 3. sou_admin() = está em admins E tem o painel aberto nesta sessão de login. Todas as admin_*, as regras da Escola e a rota
--    /api/gestao/admin/copia perguntam sou_admin() e herdam a exigência. sessao_forte() (aal2) deixa de existir.
-- 4. Freio: 5 senhas erradas seguidas travam as tentativas daquele usuário por 15 minutos (admin_senha_tentativas). Senha
--    certa zera a conta. Quem não é admin recebe as mesmas respostas, no mesmo tempo (o bcrypt roda contra um hash de mentira).
-- 5. Registrar ou trocar a senha: admin_senha_definir(nova) só aceita quem acabou de chegar por um link (ou código) mandado
--    ao e-mail da conta pelo Supabase Auth: o token traz em `amr` o método `otp` (link de entrada, código do e-mail e link de
--    "esqueci a senha" saem assim no Auth de hoje; `magiclink` e `recovery` são os nomes do fluxo PKCE) com a hora da
--    chegada, que precisa ter no máximo 15 minutos. Trocar a senha fecha todas as sessões do painel daquele admin, zera o
--    freio e abre o painel só na sessão que trocou. (`otp` também é o método do código por SMS: o login por telefone está
--    desligado neste projeto e precisa continuar assim.)
--    A senha fica ligada ao e-mail da conta de quando foi registrada: se o e-mail da conta mudar depois, a troca por e-mail
--    é recusada ('email_trocado') até o painel ser aberto uma vez com a senha atual (quem sabe a senha confirma o e-mail
--    novo). Assim, quem só tem a senha da conta não troca o e-mail para receber o link e tomar o painel.
-- 6. admin_painel_fechar(): fecha o painel desta sessão sem sair da conta.
-- 7. admin_situacao(): o que a tela precisa (é admin? tem senha? painel aberto? até quando? pode registrar a senha agora?
--    travado até quando?). Não dá acesso a nada; quem não é admin só recebe admin = false.
-- 8. Cópia completa: gestao_copia_tabelas() lista só as tabelas que a chave de serviço consegue ler. As três tabelas daqui
--    ficam fora do .zip (o hash não sai do banco nem na cópia), e a cópia não quebra ao esbarrar nelas.
-- 9. As três tabelas entram em gestao_tabelas() (são do Gestão: não seguram o login de ninguém na hora de apagar a conta).
--
-- A senha nunca é gravada em texto, nem em log, erro ou auditoria: as funções só guardam o hash e devolvem motivos curtos.
--
-- Funções substituídas (cópia da última versão, mudando só o necessário):
--   sou_admin()        20261245000000_gestao_seguranca_reforcos.sql   painel aberto no lugar da sessão forte
--   admin_situacao()   20261245000000_gestao_seguranca_reforcos.sql   devolve a situação da senha e do painel
--   gestao_copia_tabelas()   20261199000000_gestao_lgpd.sql           só as tabelas que a chave de serviço lê
--   gestao_tabelas()         20261236000000_gestao_lgpd_rodada9.sql   as três tabelas novas entram na lista do Gestão
-- Função apagada: sessao_forte() (20261245), que só essas duas usavam.
--
-- Pode rodar de novo sem erro (create or replace / if not exists / drop if exists).

-- As funções daqui leem auth.sessions (a sessão de login ainda existe?). Se quem aplica não pode ler, para aqui, e não
-- com o dono trancado do lado de fora depois.
do $$ begin
  if not has_table_privilege(current_user, 'auth.sessions', 'select') then
    raise exception 'O papel % não lê auth.sessions: a senha do painel (20261247) depende disso. Nada foi aplicado.', current_user;
  end if;
end $$;

-- ============================================================
-- 1. Tabelas (ninguém lê nem escreve pela API)
-- ============================================================
create table if not exists public.admin_senhas (
  user_id uuid primary key references public.admins (user_id) on delete cascade,
  hash text not null check (hash like '$2_$%'),
  definida_em timestamptz not null default now(),
  email text
);
alter table public.admin_senhas add column if not exists email text;
comment on column public.admin_senhas.email is 'O e-mail da conta quando a senha foi registrada (ou da última vez que o painel abriu com ela). Trocar a senha por e-mail só vale para este e-mail.';
alter table public.admin_senhas enable row level security;
revoke all on public.admin_senhas from public, anon, authenticated, service_role;
comment on table public.admin_senhas is 'Senha do painel do administrador: só o hash bcrypt. Sem leitura pela API (nem com a chave de serviço). Só as funções admin_painel_abrir e admin_senha_definir tocam aqui.';

create table if not exists public.admin_painel_sessoes (
  sessao_id uuid primary key,
  user_id uuid not null references public.admins (user_id) on delete cascade,
  aberta_em timestamptz not null default now(),
  vale_ate timestamptz not null
);
create index if not exists admin_painel_sessoes_user_idx on public.admin_painel_sessoes (user_id);
alter table public.admin_painel_sessoes enable row level security;
revoke all on public.admin_painel_sessoes from public, anon, authenticated, service_role;
comment on table public.admin_painel_sessoes is 'Painel do administrador aberto: uma linha por sessão de login (session_id do token do Auth) em que a senha do painel foi conferida. Vale até vale_ate ou até a sessão de login acabar.';

create table if not exists public.admin_senha_tentativas (
  user_id uuid primary key references auth.users (id) on delete cascade,
  erros smallint not null default 0,
  bloqueado_ate timestamptz,
  ultima_em timestamptz
);
alter table public.admin_senha_tentativas enable row level security;
revoke all on public.admin_senha_tentativas from public, anon, authenticated, service_role;
comment on table public.admin_senha_tentativas is 'Freio da senha do painel: erros seguidos por usuário (admin ou não, para a resposta ser a mesma) e até quando as tentativas ficam travadas.';

-- ============================================================
-- 2. Peças de dentro (ninguém chama pela API)
-- ============================================================
-- A sessão de login de quem chama: o session_id do token (conferido pelo Auth; o cliente não manda), só se ela ainda
-- existe no Auth e é deste usuário. Saiu da conta = não existe mais.
create or replace function public.painel_sessao() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id
  from (select coalesce((select auth.jwt()) ->> 'session_id', '') as t) x
  join auth.sessions s on s.id = case when x.t ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then x.t::uuid end
  where s.user_id = (select auth.uid())
$$;
revoke execute on function public.painel_sessao() from public, anon, authenticated;

-- o painel está aberto nesta sessão de login
create or replace function public.painel_aberto() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admin_painel_sessoes p
    where p.sessao_id = public.painel_sessao() and p.user_id = (select auth.uid()) and p.vale_ate > now())
$$;
revoke execute on function public.painel_aberto() from public, anon, authenticated;

-- Quem chama acabou de chegar por um link ou código mandado ao e-mail da conta: o token traz em amr o método e a hora.
-- Vale por 15 minutos depois da chegada (a hora não muda quando o token é renovado).
create or replace function public.painel_chegou_por_email() returns boolean
language sql stable set search_path = '' as $$
  select exists (
    select 1
    from jsonb_array_elements(case when jsonb_typeof(x.j -> 'amr') = 'array' then x.j -> 'amr' else '[]'::jsonb end) a
    where jsonb_typeof(a) = 'object'
      and a ->> 'method' in ('otp', 'magiclink', 'recovery')
      and coalesce(a ->> 'timestamp', '') ~ '^[0-9]{1,12}$'
      and (a ->> 'timestamp')::bigint between extract(epoch from now())::bigint - 900 and extract(epoch from now())::bigint + 60)
  from (select coalesce((select auth.jwt()), '{}'::jsonb) as j) x
$$;
revoke execute on function public.painel_chegou_por_email() from public, anon, authenticated;

-- A senha como entra no bcrypt: o SHA-256 dela em hexadecimal (64 letras). O bcrypt só olha os primeiros 72 bytes; assim a
-- senha inteira conta, com acento ou não.
create or replace function public.painel_senha_prep(p_senha text) returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(convert_to(coalesce(p_senha, ''), 'UTF8'), 'sha256'), 'hex')
$$;
revoke execute on function public.painel_senha_prep(text) from public, anon, authenticated;

-- hash novo (bcrypt, custo 12; o hash de mentira de admin_painel_abrir tem o mesmo custo)
create or replace function public.painel_senha_hash(p_senha text) returns text
language sql volatile set search_path = '' as $$
  select extensions.crypt(public.painel_senha_prep(p_senha), extensions.gen_salt('bf', 12))
$$;
revoke execute on function public.painel_senha_hash(text) from public, anon, authenticated;

-- ============================================================
-- 3. sou_admin() e admin_situacao()
-- ============================================================
create or replace function public.sou_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid())) and public.painel_aberto()
$$;

-- Para a tela do painel: é da equipe Maestro Pet? Já registrou a senha do painel? O painel está aberto nesta sessão? Pode
-- registrar a senha agora (chegou pelo e-mail há pouco)? As tentativas estão travadas? Não dá acesso a nada.
create or replace function public.admin_situacao() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_sid uuid; v_ate timestamptz;
begin
  if v_uid is null or not exists (select 1 from public.admins where user_id = v_uid) then
    return jsonb_build_object('admin', false, 'tem_senha', false, 'aberto', false, 'vale_ate', null, 'pode_definir', false, 'bloqueado_ate', null);
  end if;
  v_sid := public.painel_sessao();
  select p.vale_ate into v_ate from public.admin_painel_sessoes p where p.sessao_id = v_sid and p.user_id = v_uid and p.vale_ate > now();
  return jsonb_build_object(
    'admin', true,
    'tem_senha', exists (select 1 from public.admin_senhas s where s.user_id = v_uid),
    'aberto', v_ate is not null,
    'vale_ate', v_ate,
    'pode_definir', v_sid is not null and public.painel_chegou_por_email(),
    'bloqueado_ate', (select t.bloqueado_ate from public.admin_senha_tentativas t where t.user_id = v_uid and t.bloqueado_ate > now()));
end $$;
revoke execute on function public.admin_situacao() from public, anon;
grant execute on function public.admin_situacao() to authenticated;

-- a sessão forte (aal2) não é mais usada por ninguém
drop function if exists public.sessao_forte();

-- ============================================================
-- 4. Abrir e fechar o painel
-- ============================================================
-- Confere a senha do painel e abre o painel nesta sessão de login por 12 horas.
-- Devolve {ok: true, vale_ate} ou {ok: false, motivo}: 'senha' (com restam), 'bloqueado' (com bloqueado_ate) ou 'sessao'.
-- Quem não é admin (ou é e ainda não tem senha) recebe 'senha' e 'bloqueado' do mesmo jeito e no mesmo tempo.
-- A contagem dos erros é gravada antes de responder (a função responde, não levanta erro: o que foi contado fica).
create or replace function public.admin_painel_abrir(p_senha text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_sid uuid;
  v_hash text;
  v_ok boolean;
  v_ate timestamptz;
  t public.admin_senha_tentativas;
  -- hash bcrypt (custo 12) de um texto aleatório que ninguém guardou: para quem não tem senha gastar o mesmo tempo
  c_mentira constant text := '$2a$12$0D.yNATOd.Sk9SLqHxRJ8O7xjBy064PhEw5m1sfnXdelvQ7WdEG72';
begin
  if v_uid is null then raise exception 'Entre na sua conta para continuar.' using errcode = '28000'; end if;
  v_sid := public.painel_sessao();
  if v_sid is null then return jsonb_build_object('ok', false, 'motivo', 'sessao'); end if;

  -- uma tentativa de cada vez por usuário: pedidos ao mesmo tempo não passam do limite juntos
  insert into public.admin_senha_tentativas (user_id) values (v_uid) on conflict (user_id) do nothing;
  select * into t from public.admin_senha_tentativas x where x.user_id = v_uid for update;
  if t.bloqueado_ate is not null and t.bloqueado_ate > now() then
    return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'bloqueado_ate', t.bloqueado_ate);
  end if;

  select s.hash into v_hash from public.admin_senhas s join public.admins a on a.user_id = s.user_id where s.user_id = v_uid;
  -- sempre confere (o bcrypt compara em tempo constante); senha grande demais nem entra na conta
  v_ok := extensions.crypt(public.painel_senha_prep(left(coalesce(p_senha, ''), 201)), coalesce(v_hash, c_mentira)) = coalesce(v_hash, c_mentira);
  v_ok := coalesce(v_ok, false) and v_hash is not null and p_senha is not null and char_length(p_senha) <= 200;

  if not v_ok then
    if t.erros + 1 >= 5 then
      update public.admin_senha_tentativas x set erros = 0, bloqueado_ate = now() + interval '15 minutes', ultima_em = now()
       where x.user_id = v_uid returning x.bloqueado_ate into v_ate;
      return jsonb_build_object('ok', false, 'motivo', 'bloqueado', 'bloqueado_ate', v_ate);
    end if;
    update public.admin_senha_tentativas x set erros = t.erros + 1, bloqueado_ate = null, ultima_em = now() where x.user_id = v_uid;
    return jsonb_build_object('ok', false, 'motivo', 'senha', 'restam', 5 - (t.erros + 1));
  end if;

  update public.admin_senha_tentativas x set erros = 0, bloqueado_ate = null, ultima_em = now() where x.user_id = v_uid;
  -- quem sabe a senha confirma o e-mail de agora da conta (a troca da senha por e-mail vale para ele)
  update public.admin_senhas s set email = (select lower(btrim(u.email)) from auth.users u where u.id = v_uid)
   where s.user_id = v_uid and s.email is distinct from (select lower(btrim(u.email)) from auth.users u where u.id = v_uid);
  -- faxina: o que venceu e o que ficou de sessões de login que já acabaram
  delete from public.admin_painel_sessoes p
   where p.user_id = v_uid and (p.vale_ate <= now() or not exists (select 1 from auth.sessions s where s.id = p.sessao_id));
  insert into public.admin_painel_sessoes as p (sessao_id, user_id, aberta_em, vale_ate)
  values (v_sid, v_uid, now(), now() + interval '12 hours')
  on conflict (sessao_id) do update set aberta_em = excluded.aberta_em, vale_ate = excluded.vale_ate where p.user_id = excluded.user_id
  returning p.vale_ate into v_ate;
  if v_ate is null then return jsonb_build_object('ok', false, 'motivo', 'sessao'); end if;
  return jsonb_build_object('ok', true, 'vale_ate', v_ate);
end $$;
revoke execute on function public.admin_painel_abrir(text) from public, anon;
grant execute on function public.admin_painel_abrir(text) to authenticated;

-- Fecha o painel desta sessão de login, sem sair da conta. true = estava aberto.
create or replace function public.admin_painel_fechar() returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_t text := coalesce((select auth.jwt()) ->> 'session_id', ''); v_n integer;
begin
  if v_uid is null then raise exception 'Entre na sua conta para continuar.' using errcode = '28000'; end if;
  if v_t !~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' then return false; end if;
  delete from public.admin_painel_sessoes p where p.sessao_id = v_t::uuid and p.user_id = v_uid;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;
revoke execute on function public.admin_painel_fechar() from public, anon;
grant execute on function public.admin_painel_fechar() to authenticated;

-- ============================================================
-- 5. Registrar ou trocar a senha do painel (só chegando pelo e-mail)
-- ============================================================
-- Devolve {ok: true, vale_ate} ou {ok: false, motivo}: 'email' (não chegou pelo link do e-mail há pouco; também é a
-- resposta para quem não é admin), 'email_trocado' (o e-mail da conta mudou depois que a senha foi registrada: abrir o
-- painel uma vez com a senha atual libera), 'curta' (menos de 10), 'longa' (mais de 200) ou 'igual_email'.
-- Com a senha gravada: fecha as sessões do painel deste admin, zera o freio e abre o painel só nesta sessão de login.
create or replace function public.admin_senha_definir(p_nova text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_sid uuid;
  v_email text;
  v_ate timestamptz;
begin
  if v_uid is null then raise exception 'Entre na sua conta para continuar.' using errcode = '28000'; end if;
  v_sid := public.painel_sessao();
  if v_sid is null or not public.painel_chegou_por_email() or not exists (select 1 from public.admins a where a.user_id = v_uid) then
    return jsonb_build_object('ok', false, 'motivo', 'email');
  end if;
  select lower(btrim(coalesce(u.email, ''))) into v_email from auth.users u where u.id = v_uid;
  -- a senha já registrada vale para o e-mail de quando foi registrada: e-mail da conta trocado depois não troca a senha
  if exists (select 1 from public.admin_senhas s where s.user_id = v_uid and s.email is not null and s.email <> v_email) then
    return jsonb_build_object('ok', false, 'motivo', 'email_trocado');
  end if;
  if p_nova is null or char_length(p_nova) < 10 or char_length(btrim(p_nova)) < 10 then return jsonb_build_object('ok', false, 'motivo', 'curta'); end if;
  if char_length(p_nova) > 200 then return jsonb_build_object('ok', false, 'motivo', 'longa'); end if;
  if lower(btrim(p_nova)) = v_email then return jsonb_build_object('ok', false, 'motivo', 'igual_email'); end if;

  insert into public.admin_senhas as s (user_id, hash, definida_em, email) values (v_uid, public.painel_senha_hash(p_nova), now(), v_email)
  on conflict (user_id) do update set hash = excluded.hash, definida_em = excluded.definida_em, email = excluded.email;
  delete from public.admin_painel_sessoes p where p.user_id = v_uid;
  delete from public.admin_senha_tentativas x where x.user_id = v_uid;
  insert into public.admin_painel_sessoes (sessao_id, user_id, aberta_em, vale_ate)
  values (v_sid, v_uid, now(), now() + interval '12 hours') returning vale_ate into v_ate;
  return jsonb_build_object('ok', true, 'vale_ate', v_ate);
end $$;
revoke execute on function public.admin_senha_definir(text) from public, anon;
grant execute on function public.admin_senha_definir(text) to authenticated;

-- ============================================================
-- 6. Cópia completa: as tabelas da senha do painel ficam de fora
-- ============================================================
-- A rota da cópia lê cada tabela com a chave de serviço. Tabela que a chave de serviço não lê (as três daqui) não entra na
-- lista: o hash da senha não sai nem na cópia, e a cópia não para com "permission denied".
create or replace function public.gestao_copia_tabelas() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'tabela', c.relname,
    'colunas', (select coalesce(jsonb_agg(a.attname order by a.attnum), '[]'::jsonb) from pg_attribute a
                 where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and not public.copia_coluna_fora(c.relname, a.attname)),
    'fora', (select coalesce(jsonb_agg(a.attname order by a.attnum), '[]'::jsonb) from pg_attribute a
              where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped and public.copia_coluna_fora(c.relname, a.attname)),
    'ordem', coalesce((select jsonb_agg(a.attname order by k.n) from pg_index i
                         cross join lateral unnest(i.indkey::int2[]) with ordinality as k(att, n)
                         join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.att
                        where i.indrelid = c.oid and i.indisprimary), '[]'::jsonb)
  ) order by c.relname), '[]'::jsonb)
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
    and has_table_privilege('service_role', c.oid, 'select')
$$;

-- ============================================================
-- 7. As tabelas novas são do Gestão (apagar o login não esbarra nelas)
-- ============================================================
-- login_fora_do_gestao() olha toda tabela com coluna de login que não está nesta lista; fora dela, o login nunca seria apagado.
create or replace function public.gestao_tabelas() returns oid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct x.o), '{}') from (
    select pg_catalog.to_regclass(t.tabela)::oid as o from public.gestao_loja_plano() t
    union all
    select pg_catalog.to_regclass('public.' || n)::oid from unnest(array[
      'petshops', 'aceites', 'admins', 'admin_empresa_passos', 'emails_confirmados', 'emails_desde', 'exclusoes_conta', 'lgpd_registros',
      'logins_lixo', 'logins_mantidos', 'registros_acesso', 'equipe_maestro_acessos', 'documentos_versoes', 'lojas_novas_rede',
      'rotinas_execucoes', 'cakto_eventos', 'cakto_callbacks', 'config_interna', 'escola_materiais', 'escola_compras', 'convites_equipe_antigos',
      'convite_consultas', 'diario_fotos_lixo', 'webhook_vistos', 'vendas_uso', 'erros_app', 'erros_app_resolvidos', 'erros_app_contagem',
      'erros_app_freio', 'boletim_lixo', 'arquivos_lixo', 'fotos_autorizacao_freio', 'entrada_lixo', 'notas_admin',
      'admin_senhas', 'admin_painel_sessoes', 'admin_senha_tentativas']) n
  ) x where x.o is not null
$$;

notify pgrst, 'reload schema';
