-- Mozart: modo automático (opcional, por pessoa) e o botão Desfazer.
--
-- 1. profissionais.mozart_automatico (padrão false): a escolha de cada pessoa, guardada no banco (vale em todos os aparelhos).
--    Ninguém muda a coluna pela API (sem permissão de leitura nem de escrita): só `mozart_automatico_ligar`, que grava o
--    aceite (quem, quando, IP e navegador) em `mozart_automatico_aceites`. O dono sempre pode ligar; a equipe só quando o dono
--    liga "Permitir modo automático para a equipe" (petshops.opcoes, chave mozart.automatico_equipe, padrão false).
--    Vale só quando a coluna está ligada E o último aceite da pessoa naquele pet shop é de ligar (a coluna sozinha não basta).
-- 2. mozart_automatico_estado: o que a tela e a rota do Mozart leem (ligado, pode, efetivo, dono, equipe).
-- 3. mozart_acoes e mozart_acoes_linhas: cada ação feita no automático e o que ela gravou, linha a linha (antes e depois),
--    para o Desfazer. A rota abre a ação (`mozart_acao_comecar`, que confere de novo se o automático vale para a pessoa) e
--    grava com o cabeçalho x-mozart-acao; o gatilho `mozart_capturar` (nas tabelas que as ferramentas do Mozart mexem) anota
--    só o que a própria gravação mudou (não o que outros gatilhos mudaram por consequência: pg_trigger_depth() = 1), só da
--    ação aberta da própria pessoa, nos primeiros 5 minutos. As linhas guardadas saem em 2 dias; as ações, em 30.
-- 4. mozart_desfazer(ação): desfaz numa transação só (tudo ou nada), COM AS REGRAS DE QUEM PEDE (security invoker: as
--    políticas, as permissões de coluna e os gatilhos valem igual às telas; a trava do caixa fechado também). O que cada
--    linha vira:
--    - criada: horário desmarcado (cancelado); reserva ou estadia cancelada; lançamento apagado (a mesma regra de apagar das
--      telas); movimento de estoque desfeito com um movimento contrário; produto, serviço, pacote ou pet apagado se nada usa,
--      senão desativado; pacote vendido apagado se ainda não foi usado; caixa aberto apagado se não tem lançamento; conta fixa
--      pela função de apagar; o resto, apagado.
--    - mudada: volta ao que era (só as colunas que a ação mudou), se ninguém mexeu nelas depois. Horário que volta a valer
--      (desmarcado que volta, remarcação desfeita) só se o horário ainda está livre.
--    - apagada (bloqueio): volta.
--    Só quem fez ou o dono, em até 24 horas.
--
-- Nenhuma função antiga muda: tudo aqui é novo.

-- ============================================================
-- 1. A escolha de cada pessoa e o aceite
-- ============================================================
alter table public.profissionais add column if not exists mozart_automatico boolean not null default false;
comment on column public.profissionais.mozart_automatico is
  'Modo automático do Mozart ligado por esta pessoa (padrão false). Só muda por mozart_automatico_ligar, que grava o aceite.';
revoke select (mozart_automatico), update (mozart_automatico), insert (mozart_automatico) on public.profissionais from anon, authenticated;

create table if not exists public.mozart_automatico_aceites (
  id bigint generated always as identity primary key,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  nome text check (char_length(nome) <= 120),
  ligou boolean not null,
  versao text not null check (versao ~ '^[0-9A-Za-z._-]{1,20}$'),
  em timestamptz not null default now(),
  ip text check (char_length(ip) <= 64),
  navegador text check (char_length(navegador) <= 300)
);
create index if not exists mozart_automatico_aceites_pessoa on public.mozart_automatico_aceites (petshop_id, user_id, em desc);
alter table public.mozart_automatico_aceites enable row level security;
revoke all on public.mozart_automatico_aceites from public, anon, authenticated;
grant select on public.mozart_automatico_aceites to authenticated;
drop policy if exists mozart_automatico_aceites_ler on public.mozart_automatico_aceites;
create policy mozart_automatico_aceites_ler on public.mozart_automatico_aceites for select to authenticated
  using (user_id = (select auth.uid()) or (select public.sou_dono(petshop_id)));
comment on table public.mozart_automatico_aceites is
  'Quem ligou e desligou o modo automático do Mozart, quando, de onde e com qual versão do aviso. Só mozart_automatico_ligar grava.';

-- o automático vale para esta pessoa neste pet shop? (sem conferir a escolha dela)
create or replace function public.mozart_automatico_pode(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profissionais pr join public.petshops s on s.id = pr.petshop_id
     where pr.petshop_id = p and pr.user_id = (select auth.uid()) and pr.ativo
       and (pr.papel = 'dono' or coalesce((s.opcoes ->> 'mozart.automatico_equipe')::boolean, false))
  )
$$;
revoke execute on function public.mozart_automatico_pode(uuid) from public, anon, authenticated;

-- ligado de verdade: a escolha guardada, o último aceite de ligar e a permissão
create or replace function public.mozart_automatico_vale(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.mozart_automatico_pode(p)
     and exists (select 1 from public.profissionais pr where pr.petshop_id = p and pr.user_id = (select auth.uid()) and pr.ativo and pr.mozart_automatico)
     and coalesce((select a.ligou from public.mozart_automatico_aceites a where a.petshop_id = p and a.user_id = (select auth.uid()) order by a.em desc, a.id desc limit 1), false)
$$;
revoke execute on function public.mozart_automatico_vale(uuid) from public, anon, authenticated;

create or replace function public.mozart_automatico_estado(p_petshop uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  pr public.profissionais;
  v_equipe boolean;
begin
  select * into pr from public.profissionais x where x.petshop_id = p_petshop and x.user_id = (select auth.uid()) and x.ativo limit 1;
  if pr.id is null then raise exception 'Você não faz parte deste pet shop.' using errcode = '42501'; end if;
  select coalesce((s.opcoes ->> 'mozart.automatico_equipe')::boolean, false) into v_equipe from public.petshops s where s.id = p_petshop;
  return jsonb_build_object(
    'ligado', pr.mozart_automatico,
    'pode', pr.papel = 'dono' or v_equipe,
    'efetivo', public.mozart_automatico_vale(p_petshop),
    'dono', pr.papel = 'dono',
    'equipe', v_equipe,
    'aceito_em', (select a.em from public.mozart_automatico_aceites a where a.petshop_id = p_petshop and a.user_id = pr.user_id and a.ligou order by a.em desc limit 1));
end $$;
revoke execute on function public.mozart_automatico_estado(uuid) from public, anon;
grant execute on function public.mozart_automatico_estado(uuid) to authenticated;

-- liga (com o aceite do aviso) ou desliga. Ligar sem permissão é recusado; desligar sempre vale.
create or replace function public.mozart_automatico_ligar(p_petshop uuid, p_ligar boolean, p_versao text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pr public.profissionais;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta para continuar.' using errcode = '28000'; end if;
  select * into pr from public.profissionais x where x.petshop_id = p_petshop and x.user_id = (select auth.uid()) and x.ativo limit 1 for update;
  if pr.id is null then raise exception 'Você não faz parte deste pet shop.' using errcode = '42501'; end if;
  if coalesce(p_ligar, false) then
    if not public.mozart_automatico_pode(p_petshop) then
      raise exception 'O dono não liberou o modo automático para a equipe.' using errcode = '42501';
    end if;
    if coalesce(p_versao, '') !~ '^[0-9A-Za-z._-]{1,20}$' then raise exception 'Marque Entendi para ligar.' using errcode = '22023'; end if;
  end if;
  update public.profissionais x set mozart_automatico = coalesce(p_ligar, false) where x.id = pr.id;
  insert into public.mozart_automatico_aceites (petshop_id, user_id, nome, ligou, versao, ip, navegador)
  values (p_petshop, pr.user_id, left(pr.nome, 120), coalesce(p_ligar, false), coalesce(nullif(p_versao, ''), '-'), public.rede_ip(),
          nullif(left(coalesce(nullif(current_setting('request.headers', true), '')::jsonb ->> 'user-agent', ''), 300), ''));
  return public.mozart_automatico_estado(p_petshop);
end $$;
revoke execute on function public.mozart_automatico_ligar(uuid, boolean, text) from public, anon;
grant execute on function public.mozart_automatico_ligar(uuid, boolean, text) to authenticated;

-- ============================================================
-- 2. As ações feitas no automático
-- ============================================================
create table if not exists public.mozart_acoes (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  uso_id text not null check (char_length(uso_id) between 1 and 200),
  ferramenta text not null check (char_length(ferramenta) between 1 and 80),
  resumo jsonb check (resumo is null or (jsonb_typeof(resumo) = 'object' and pg_column_size(resumo) <= 16000)),
  estado text not null default 'gravando' check (estado in ('gravando', 'feita', 'falhou', 'desfeita')),
  criado_em timestamptz not null default now(),
  feito_em timestamptz,
  desfeito_em timestamptz,
  desfeito_por uuid references auth.users (id) on delete set null
);
create unique index if not exists mozart_acoes_uso on public.mozart_acoes (petshop_id, uso_id);
create index if not exists mozart_acoes_quando on public.mozart_acoes (petshop_id, criado_em desc);
alter table public.mozart_acoes enable row level security;
revoke all on public.mozart_acoes from public, anon, authenticated;
grant select on public.mozart_acoes to authenticated;
drop policy if exists mozart_acoes_ler on public.mozart_acoes;
create policy mozart_acoes_ler on public.mozart_acoes for select to authenticated
  using (user_id = (select auth.uid()) or (select public.sou_dono(petshop_id)));
comment on table public.mozart_acoes is
  'Ações do Mozart feitas no modo automático (uma por ferramenta), para o botão Desfazer. Só as funções mozart_acao_* e mozart_desfazer gravam.';

create table if not exists public.mozart_acoes_linhas (
  id bigint generated always as identity primary key,
  acao_id uuid not null references public.mozart_acoes (id) on delete cascade,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  tabela text not null,
  chave text not null,
  linha_id text not null,
  op text not null check (op in ('INSERT', 'UPDATE', 'DELETE')),
  antes jsonb,
  depois jsonb,
  em timestamptz not null default now()
);
create index if not exists mozart_acoes_linhas_acao on public.mozart_acoes_linhas (acao_id, id);
create index if not exists mozart_acoes_linhas_quando on public.mozart_acoes_linhas (petshop_id, em);
alter table public.mozart_acoes_linhas enable row level security;
revoke all on public.mozart_acoes_linhas from public, anon, authenticated;
comment on table public.mozart_acoes_linhas is
  'O que cada ação do modo automático gravou (antes e depois de cada linha). Ninguém lê pela API: só mozart_desfazer usa. Sai em 2 dias.';

-- abre uma ação: confere de novo se o automático vale para quem pede (a rota nunca confia no aparelho)
create or replace function public.mozart_acao_comecar(p_petshop uuid, p_uso text, p_ferramenta text, p_resumo jsonb default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  a public.mozart_acoes;
begin
  if (select auth.uid()) is null then raise exception 'Entre na sua conta para continuar.' using errcode = '28000'; end if;
  if not public.mozart_automatico_vale(p_petshop) then
    raise exception 'O modo automático não está ligado para você neste pet shop.' using errcode = '42501';
  end if;
  if not public.acesso_liberado(p_petshop) then raise exception 'A conta está só para consulta.' using errcode = '42501'; end if;
  if coalesce(p_uso, '') = '' or char_length(p_uso) > 200 or coalesce(p_ferramenta, '') !~ '^[a-z_]{1,80}$' then
    raise exception 'Pedido inválido.' using errcode = '22023';
  end if;
  -- faxina: o que já não dá para desfazer
  delete from public.mozart_acoes_linhas l where l.petshop_id = p_petshop and l.em < now() - interval '2 days';
  delete from public.mozart_acoes x where x.petshop_id = p_petshop and x.criado_em < now() - interval '30 days';

  select * into a from public.mozart_acoes x where x.petshop_id = p_petshop and x.uso_id = p_uso for update;
  if a.id is not null then
    if a.user_id is distinct from (select auth.uid()) then raise exception 'Pedido inválido.' using errcode = '42501'; end if;
    if a.estado in ('gravando', 'falhou') then
      delete from public.mozart_acoes_linhas l where l.acao_id = a.id;
      update public.mozart_acoes x set estado = 'gravando', criado_em = now(), feito_em = null where x.id = a.id;
    end if;
    return a.id;
  end if;
  insert into public.mozart_acoes (petshop_id, user_id, uso_id, ferramenta, resumo)
  values (p_petshop, (select auth.uid()), p_uso, p_ferramenta,
          case when p_resumo is not null and jsonb_typeof(p_resumo) = 'object' and pg_column_size(p_resumo) <= 16000 then p_resumo end)
  returning * into a;
  return a.id;
end $$;
revoke execute on function public.mozart_acao_comecar(uuid, text, text, jsonb) from public, anon;
grant execute on function public.mozart_acao_comecar(uuid, text, text, jsonb) to authenticated;

-- fecha a ação: feita (aparece o Desfazer) ou falhou
create or replace function public.mozart_acao_terminar(p_acao uuid, p_ok boolean) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  update public.mozart_acoes x set estado = case when p_ok then 'feita' else 'falhou' end, feito_em = now()
   where x.id = p_acao and x.user_id = (select auth.uid()) and x.estado = 'gravando';
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke execute on function public.mozart_acao_terminar(uuid, boolean) from public, anon;
grant execute on function public.mozart_acao_terminar(uuid, boolean) to authenticated;

-- ============================================================
-- 3. O gatilho que anota o que a ação gravou
-- ============================================================
create or replace function public.mozart_capturar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_h text := current_setting('request.headers', true);
  v_acao uuid;
  v_petshop uuid;
  v_chave text := coalesce(tg_argv[0], 'id');
  v_antes jsonb;
  v_depois jsonb;
  v_id text;
begin
  -- o caminho comum (toda gravação que não é do automático) sai aqui, sem ler nada
  if v_h is null or strpos(v_h, 'x-mozart-acao') = 0 or pg_trigger_depth() > 1 then return null; end if;
  begin v_acao := (v_h::jsonb ->> 'x-mozart-acao')::uuid; exception when others then return null; end;
  if v_acao is null then return null; end if;
  select x.petshop_id into v_petshop from public.mozart_acoes x
   where x.id = v_acao and x.user_id = (select auth.uid()) and x.estado = 'gravando' and x.criado_em > now() - interval '5 minutes';
  if v_petshop is null then return null; end if;
  if tg_op = 'INSERT' then
    v_depois := to_jsonb(new); v_id := v_depois ->> v_chave;
  elsif tg_op = 'DELETE' then
    v_antes := to_jsonb(old); v_id := v_antes ->> v_chave;
  else
    -- só as colunas que mudaram
    select jsonb_object_agg(o.key, o.value), jsonb_object_agg(o.key, coalesce(to_jsonb(new) -> o.key, 'null'::jsonb))
      into v_antes, v_depois
      from jsonb_each(to_jsonb(old)) o
     where (to_jsonb(new) -> o.key) is distinct from o.value;
    if v_antes is null then return null; end if;
    v_id := to_jsonb(new) ->> v_chave;
  end if;
  if v_id is null then return null; end if;
  insert into public.mozart_acoes_linhas (acao_id, petshop_id, tabela, chave, linha_id, op, antes, depois)
  values (v_acao, v_petshop, tg_table_name, v_chave, v_id, tg_op, v_antes, v_depois);
  return null;
end $$;
revoke execute on function public.mozart_capturar() from public, anon, authenticated;

do $$
declare
  t record;
begin
  for t in select * from (values
    ('agendamentos', 'id'), ('bloqueios', 'id'), ('estadias', 'id'), ('estadias_cuidados', 'id'), ('estadias_ocorrencias', 'id'),
    ('quadro_atendimento', 'agendamento_id'), ('lancamentos', 'id'), ('movimentos_estoque', 'id'), ('produtos', 'id'),
    ('servicos', 'id'), ('pacotes', 'id'), ('pacotes_clientes', 'id'), ('pets', 'id'), ('pets_saude', 'id'), ('clientes', 'id'),
    ('clientes_creditos', 'id'), ('caixas', 'id'), ('petshops', 'id'), ('contas_fixas', 'id')) v(tabela, chave)
  loop
    if pg_catalog.to_regclass('public.' || t.tabela) is null then continue; end if;
    execute format('drop trigger if exists mozart_capturar on public.%I', t.tabela);
    execute format('create trigger mozart_capturar after insert or update or delete on public.%I for each row execute function public.mozart_capturar(%L)', t.tabela, t.chave);
  end loop;
end $$;

-- ============================================================
-- 4. Desfazer
-- ============================================================
-- Lê o que a ação gravou e confere, com a linha travada, se ninguém mexeu depois. Só por dentro de mozart_desfazer
-- (a marca da transação), que roda com as regras de quem pede.
create or replace function public.mozart_desfazer_ler(p_acao uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.mozart_acoes;
  l public.mozart_acoes_linhas;
  v_atual jsonb;
  v_igual boolean;
  v_sai jsonb := '[]'::jsonb;
  v_ger text[];
begin
  if coalesce(current_setting('mozart.desfazendo', true), '') <> coalesce(p_acao::text, '-') then
    raise exception 'Pedido inválido.' using errcode = '42501';
  end if;
  select * into a from public.mozart_acoes x where x.id = p_acao for update;
  if a.id is null or not exists (select 1 from public.profissionais pr where pr.petshop_id = a.petshop_id and pr.user_id = (select auth.uid()) and pr.ativo) then
    raise exception 'Não achei essa ação.' using errcode = 'P0002';
  end if;
  if a.user_id is distinct from (select auth.uid()) and not public.sou_dono(a.petshop_id) then
    raise exception 'Só quem pediu ou o dono pode desfazer.' using errcode = '42501';
  end if;
  if a.estado = 'desfeita' then raise exception 'Isso já foi desfeito.' using errcode = 'P0001'; end if;
  if a.estado <> 'feita' then raise exception 'Essa ação não chegou a ser gravada.' using errcode = 'P0001'; end if;
  if a.criado_em < now() - interval '24 hours' then
    raise exception 'O Desfazer vale por 24 horas. Agora, mude pela tela.' using errcode = 'P0001';
  end if;
  if not public.acesso_liberado(a.petshop_id) then raise exception 'A conta está só para consulta.' using errcode = '42501'; end if;

  for l in select * from public.mozart_acoes_linhas x where x.acao_id = a.id order by x.id desc loop
    execute format('select to_jsonb(t) from public.%I t where t.%I = $1::uuid for update', l.tabela, l.chave) into v_atual using l.linha_id;
    v_igual := v_atual is not null;
    if l.op = 'UPDATE' and v_atual is not null then
      select coalesce(bool_and((v_atual -> d.key) is not distinct from d.value), true) into v_igual from jsonb_each(l.depois) d;
    end if;
    -- colunas calculadas pelo banco não voltam à mão
    select coalesce(array_agg(at.attname::text), '{}') into v_ger from pg_catalog.pg_attribute at
     where at.attrelid = ('public.' || l.tabela)::regclass and at.attnum > 0 and (at.attgenerated <> '' or at.attidentity <> '');
    v_sai := v_sai || jsonb_build_array(jsonb_build_object(
      'tabela', l.tabela, 'chave', l.chave, 'id', l.linha_id, 'op', l.op, 'existe', v_atual is not null, 'igual', v_igual,
      'antes', case when l.op = 'UPDATE' then l.antes - v_ger when l.op = 'DELETE' then l.antes - v_ger end,
      -- da linha criada, só o que o desfazer usa
      'depois', case when l.op = 'INSERT' then jsonb_strip_nulls(jsonb_build_object(
          'petshop_id', l.depois -> 'petshop_id', 'produto_id', l.depois -> 'produto_id', 'tipo', l.depois -> 'tipo',
          'quantidade', l.depois -> 'quantidade', 'lancamento_id', l.depois -> 'lancamento_id', 'lote', l.depois -> 'lote',
          'validade', l.depois -> 'validade', 'kit_movimento_id', l.depois -> 'kit_movimento_id')) end,
      'atual', case when v_atual is null then null when l.tabela = 'agendamentos' then jsonb_build_object(
          'status', v_atual -> 'status', 'inicio', v_atual -> 'inicio', 'fim', v_atual -> 'fim', 'pet_id', v_atual -> 'pet_id',
          'profissional_id', v_atual -> 'profissional_id', 'petshop_id', v_atual -> 'petshop_id')
        when l.tabela = 'estadias' then jsonb_build_object('status', v_atual -> 'status')
        when l.tabela = 'pacotes_clientes' then jsonb_build_object('usados', v_atual -> 'usados')
        when l.tabela = 'caixas' then jsonb_build_object('fechado_em', v_atual -> 'fechado_em', 'petshop_id', v_atual -> 'petshop_id')
        when l.tabela = 'contas_fixas' then jsonb_build_object('petshop_id', v_atual -> 'petshop_id')
        when l.tabela = 'movimentos_estoque' then jsonb_build_object('tipo', v_atual -> 'tipo')
        -- o caixa do lançamento já fechou? (quem só opera o caixa nem enxerga mais a linha: a frase sai igual para todos)
        when l.tabela = 'lancamentos' then jsonb_build_object('caixa_fechado', exists (
          select 1 from public.caixas cx where cx.id = nullif(v_atual ->> 'caixa_id', '')::uuid and cx.fechado_em is not null)) end));
  end loop;
  return jsonb_build_object('petshop_id', a.petshop_id, 'ferramenta', a.ferramenta, 'linhas', v_sai);
end $$;
revoke execute on function public.mozart_desfazer_ler(uuid) from public, anon;
grant execute on function public.mozart_desfazer_ler(uuid) to authenticated;

-- fecha o desfazer: a ação fica desfeita e a conta fixa do mês que o desfazer tirou de A pagar pode voltar a ser criada
create or replace function public.mozart_desfazer_fim(p_acao uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('mozart.desfazendo', true), '') <> coalesce(p_acao::text, '-') then
    raise exception 'Pedido inválido.' using errcode = '42501';
  end if;
  delete from public.contas_fixas_puladas k
   using public.mozart_acoes_linhas l
   where l.acao_id = p_acao and l.tabela = 'lancamentos' and l.op = 'INSERT'
     and (l.depois ->> 'conta_fixa_id') is not null and k.conta_fixa_id = (l.depois ->> 'conta_fixa_id')::uuid
     and k.competencia = (l.depois ->> 'competencia')::date;
  update public.mozart_acoes x set estado = 'desfeita', desfeito_em = now(), desfeito_por = (select auth.uid()) where x.id = p_acao;
end $$;
revoke execute on function public.mozart_desfazer_fim(uuid) from public, anon;
grant execute on function public.mozart_desfazer_fim(uuid) to authenticated;

-- Desfaz a ação inteira (tudo ou nada), com as regras de quem pede. Devolve {ok, ferramenta}; o que não dá para desfazer
-- sobe como erro com a frase para a pessoa.
create or replace function public.mozart_desfazer(p_acao uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v jsonb;
  l jsonb;
  t text;
  k text;
  v_id text;
  v_op text;
  v_cols text;
  v_n integer;
  v_atual jsonb;
  v_alvo jsonb;
  v_pet uuid;
  v_prof uuid;
  v_ini timestamptz;
  v_fim timestamptz;
  v_petshop uuid;
begin
  perform pg_catalog.set_config('mozart.desfazendo', p_acao::text, true);
  v := public.mozart_desfazer_ler(p_acao);
  v_petshop := (v ->> 'petshop_id')::uuid;
  for l in select x from jsonb_array_elements(v -> 'linhas') x loop
    t := l ->> 'tabela'; k := l ->> 'chave'; v_id := l ->> 'id'; v_op := l ->> 'op'; v_atual := l -> 'atual';

    if v_op = 'UPDATE' then
      if not (l ->> 'existe')::boolean then raise exception 'Isso foi apagado depois. Nada foi desfeito.'; end if;
      if not (l ->> 'igual')::boolean then raise exception 'Isso foi mudado depois por alguém. Nada foi desfeito.'; end if;
      if l -> 'antes' is null or l -> 'antes' = '{}'::jsonb then continue; end if;
      if t = 'agendamentos' then
        -- o horário volta a valer: só se o lugar ainda está livre
        v_alvo := v_atual || (l -> 'antes');
        if (v_alvo ->> 'status') not in ('cancelado', 'faltou')
           and ((v_atual ->> 'status') in ('cancelado', 'faltou') or (l -> 'antes') ? 'inicio' or (l -> 'antes') ? 'fim' or (l -> 'antes') ? 'profissional_id') then
          v_ini := (v_alvo ->> 'inicio')::timestamptz; v_fim := (v_alvo ->> 'fim')::timestamptz;
          v_pet := (v_alvo ->> 'pet_id')::uuid; v_prof := nullif(v_alvo ->> 'profissional_id', '')::uuid;
          if exists (select 1 from public.agendamentos g
                      where g.petshop_id = v_petshop and g.id <> v_id::uuid and g.status not in ('cancelado', 'faltou')
                        and g.inicio < v_fim and g.fim > v_ini and (g.pet_id = v_pet or (v_prof is not null and g.profissional_id = v_prof)))
             or exists (select 1 from public.bloqueios b
                         where b.petshop_id = v_petshop and b.inicio < v_fim and b.fim > v_ini and (b.profissional_id is null or b.profissional_id = v_prof)) then
            raise exception 'O horário de antes já foi ocupado. Nada foi desfeito.';
          end if;
        end if;
      end if;
      select string_agg(format('%I = r.%I', c, c), ', ') into v_cols from jsonb_object_keys(l -> 'antes') c;
      execute format('update public.%I x set %s from jsonb_populate_record(null::public.%I, $1) r where x.%I = $2::uuid', t, v_cols, t, k)
        using l -> 'antes', v_id;
      get diagnostics v_n = row_count;
      if v_n = 0 then raise exception 'Com o seu acesso não dá para desfazer isso.'; end if;

    elsif v_op = 'DELETE' then
      execute format('insert into public.%I select * from jsonb_populate_record(null::public.%I, $1)', t, t) using l -> 'antes';

    else -- INSERT
      if not (l ->> 'existe')::boolean then continue; end if; -- já não existe: nada a desfazer nesta linha
      if t = 'agendamentos' then
        if (v_atual ->> 'status') in ('cancelado', 'faltou') then continue; end if;
        if (v_atual ->> 'status') not in ('marcado', 'confirmado') then
          raise exception 'Esse horário já começou ou foi atendido. Nada foi desfeito.';
        end if;
        update public.agendamentos g set status = 'cancelado' where g.id = v_id::uuid and g.status in ('marcado', 'confirmado');
      elsif t = 'estadias' then
        if (v_atual ->> 'status') = 'cancelada' then continue; end if;
        if (v_atual ->> 'status') = 'encerrada' then raise exception 'Essa estadia já foi encerrada. Nada foi desfeito.'; end if;
        update public.estadias e set status = 'cancelada' where e.id = v_id::uuid and e.status in ('reservada', 'em_casa');
      elsif t = 'movimentos_estoque' then
        if (l -> 'depois' ->> 'kit_movimento_id') is not null then continue; end if;
        if (l -> 'depois' ->> 'tipo') not in ('entrada', 'saida') then
          raise exception 'Acerto de saldo não se desfaz: faça um novo acerto no Estoque.';
        end if;
        insert into public.movimentos_estoque (petshop_id, produto_id, tipo, quantidade, motivo, origem, criado_por)
        values ((l -> 'depois' ->> 'petshop_id')::uuid, (l -> 'depois' ->> 'produto_id')::uuid,
                case when l -> 'depois' ->> 'tipo' = 'entrada' then 'saida' else 'entrada' end,
                (l -> 'depois' ->> 'quantidade')::numeric,
                case when (l -> 'depois' ->> 'lancamento_id') is not null then 'Venda desfeita' else 'Desfeito pelo Mozart' end,
                'assistente', (select auth.uid()));
      elsif t = 'pacotes_clientes' then
        if coalesce((v_atual ->> 'usados')::integer, 0) > 0 then raise exception 'Esse pacote já foi usado. Nada foi desfeito.'; end if;
        delete from public.pacotes_clientes x where x.id = v_id::uuid and x.usados = 0;
      elsif t = 'caixas' then
        if (v_atual ->> 'fechado_em') is not null then raise exception 'Esse caixa já foi fechado. Nada foi desfeito.'; end if;
        begin
          delete from public.caixas x where x.id = v_id::uuid and x.fechado_em is null;
        exception when foreign_key_violation then
          raise exception 'Esse caixa já tem lançamentos. Nada foi desfeito.';
        end;
      elsif t = 'contas_fixas' then
        perform public.contas_fixas_apagar((v_atual ->> 'petshop_id')::uuid, v_id::uuid);
        continue;
      elsif t = 'lancamentos' then
        if coalesce((v_atual ->> 'caixa_fechado')::boolean, false) then
          raise exception 'Este lançamento é de um caixa já fechado e não pode ser apagado. Se precisar corrigir, lance um ajuste.';
        end if;
        delete from public.lancamentos x where x.id = v_id::uuid;
      elsif t in ('produtos', 'servicos', 'pacotes', 'pets') then
        -- apaga se nada usa; senão, tira da lista
        begin
          execute format('delete from public.%I x where x.id = $1::uuid', t) using v_id;
        exception when foreign_key_violation then
          execute format('update public.%I x set ativo = false where x.id = $1::uuid', t) using v_id;
        end;
      else
        begin
          execute format('delete from public.%I x where x.%I = $1::uuid', t, k) using v_id;
        exception when foreign_key_violation then
          raise exception 'Isso já está sendo usado em outro lugar. Nada foi desfeito.';
        end;
      end if;
      get diagnostics v_n = row_count;
      if v_n = 0 then raise exception 'Com o seu acesso não dá para desfazer isso.'; end if;
    end if;
  end loop;
  perform public.mozart_desfazer_fim(p_acao);
  return jsonb_build_object('ok', true, 'ferramenta', v ->> 'ferramenta');
end $$;
revoke execute on function public.mozart_desfazer(uuid) from public, anon;
grant execute on function public.mozart_desfazer(uuid) to authenticated;
