-- Checklist de entrada com termo: quando o pet chega (banho e tosa "Chegou", check-in da creche ou do hotel), a equipe confere em
-- uma folha rápida como ele chegou (temperamento, alergias e cuidados, lesões/feridas/pulgas/carrapatos/nós que já existiam, com
-- até 4 fotos, pet idoso ou doente, pertences deixados e observações). Depois, o "Aceite do tutor": (a) no aparelho da loja, o
-- tutor lê um texto curto (modelo do pet shop) e assina com o dedo + nome; ou (b) recebe um link pelo WhatsApp
-- (/gestao/entrada/<código>, 7 dias), vê o resumo e as fotos e toca em "Li e concordo" (guarda hora, IP e navegador).
-- Na saída, os pertences aparecem para devolver ("Devolver: coleira, caminha") com uma caixa para marcar.
--
-- Só entram objetos novos: tabelas novas (entradas, entrada_lixo, entrada_acessos), funções novas, um bucket privado ("entrada") e
-- políticas novas nele. agendamentos, estadias e pets (permissão por coluna) não mudam: a entrada é uma linha à parte, ligada ao
-- horário ou à estadia. As opções moram em petshops.opcoes (gravadas por petshop_salvar_opcoes, só o dono):
--   "entrada.exigir"  'idosos' (padrão: a folha abre sozinha no Chegou/check-in de pet com 8 anos ou mais), 'todos' ou 'opcional'.
--                     Sempre dá para pular: a folha nunca trava o atendimento.
--   "entrada.termo"   o texto do aceite (vazio = o texto padrão do aplicativo). O texto lido fica guardado em cada entrada.
-- Nada aqui guarda dinheiro.
--
-- 1. Quem lê e grava: a equipe do pet shop pela área da visita (agendamento: Agenda; estadia: Creche e hotel). A tabela só se lê
--    pela regra; gravar é só pelas funções (entrada_salvar, entrada_assinar, entrada_link, entrada_devolver).
-- 2. Fotos e assinatura: bucket privado "entrada", em <petshop>/<aleatório>.jpg (fotos, até 4) e <petshop>/<aleatório>.png
--    (assinatura). A página pública nunca recebe caminho nem assinatura: o servidor dela pede a foto por número (entrada_foto).
--    As assinaturas das fotos para a página são feitas pelo aparelho de quem gera o link (8 dias) e entregues a entrada_link.
-- 3. Página pública: entrada_publica(código) devolve só o resumo da entrada, o texto do termo e o pet shop. Nada do tutor.
--    entrada_aceitar(código, nome, ip, navegador) grava o aceite uma vez (o servidor da página passa o IP e o navegador).
--    Freio: 60 aberturas e 400 fotos por minuto por entrada, 10 aceites por minuto (PT429).
-- 4. Mudar a entrada depois do aceite apaga o aceite (o tutor aceita de novo o que mudou) e o link antigo deixa de valer.
-- 5. Faxina: entrada_faxina(petshop) devolve os arquivos para o aparelho apagar (fila + arquivos soltos de mais de um dia).

-- ---------- a tabela ----------
create table public.entradas (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  pet_id uuid not null,
  agendamento_id uuid references public.agendamentos (id) on delete cascade,
  estadia_id uuid references public.estadias (id) on delete cascade,
  temperamento text[] not null default '{}' check (temperamento <@ array['calmo', 'agitado', 'morde', 'medo']::text[]),
  cuidados text check (char_length(cuidados) <= 600),
  lesoes text[] not null default '{}' check (lesoes <@ array['ferida', 'lesao', 'pulgas', 'carrapatos', 'nos']::text[]),
  lesoes_obs text check (char_length(lesoes_obs) <= 300),
  idoso_doente boolean not null default false,
  pertences text[] not null default '{}' check (pertences <@ array['coleira', 'guia', 'caminha', 'brinquedo', 'remedio', 'racao']::text[]),
  pertences_outros text check (char_length(pertences_outros) <= 200),
  obs text check (char_length(obs) <= 1000),
  fotos text[] not null default '{}' check (cardinality(fotos) <= 4),
  -- o código da assinatura de cada foto para a página pública (mesma ordem de fotos), refeito a cada link
  assinaturas text[] not null default '{}' check (cardinality(assinaturas) <= 4),
  termo text not null default '' check (char_length(termo) <= 3000),
  aceite text check (aceite in ('aparelho', 'link')),
  aceite_nome text check (char_length(aceite_nome) <= 120),
  aceite_assinatura text,
  aceito_em timestamptz,
  aceite_ip text check (char_length(aceite_ip) <= 64),
  aceite_navegador text check (char_length(aceite_navegador) <= 300),
  token text unique check (token ~ '^[0-9a-f]{64}$'),
  token_expira timestamptz,
  link_criado_em timestamptz,
  devolvido_em timestamptz,
  devolvido_por uuid references auth.users (id) on delete set null,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check ((agendamento_id is null) <> (estadia_id is null)),
  check ((aceito_em is null) = (aceite is null)),
  foreign key (pet_id, petshop_id) references public.pets (id, petshop_id) on delete cascade
);
create unique index entradas_agendamento on public.entradas (agendamento_id) where agendamento_id is not null;
create unique index entradas_estadia on public.entradas (estadia_id) where estadia_id is not null;
create index on public.entradas (petshop_id, criado_em desc);

alter table public.entradas enable row level security;
revoke all on public.entradas from public, anon, authenticated;
grant select on public.entradas to authenticated;
create policy entradas_ler on public.entradas for select to authenticated
  using (petshop_id in (select public.meus_petshops())
    and public.tenho_area(petshop_id, case when agendamento_id is not null then array['agenda'] else array['creche_hotel'] end));

-- ---------- a fila de arquivos para apagar ----------
create table public.entrada_lixo (
  caminho text primary key,
  petshop_id uuid not null, -- sem chave estrangeira: a fila fica mesmo quando o pet shop sai
  motivo text not null default 'apagado',
  criado_em timestamptz not null default now(),
  tentativas int not null default 0
);
create index on public.entrada_lixo (petshop_id, tentativas);
alter table public.entrada_lixo enable row level security;
revoke all on public.entrada_lixo from public, anon, authenticated;

create function public.entrada_para_lixo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.entrada_lixo (caminho, petshop_id, motivo)
  select f, old.petshop_id, 'apagado' from unnest(old.fotos || case when old.aceite_assinatura is not null then array[old.aceite_assinatura] else '{}'::text[] end) f
  on conflict (caminho) do nothing;
  return old;
end $$;
create trigger entrada_para_lixo after delete on public.entradas
  for each row execute function public.entrada_para_lixo();

-- ---------- o freio da página ----------
create table public.entrada_acessos (
  entrada_id uuid not null references public.entradas (id) on delete cascade,
  tipo text not null,
  minuto timestamptz not null,
  n int not null default 0,
  primary key (entrada_id, tipo, minuto)
);
alter table public.entrada_acessos enable row level security;
revoke all on public.entrada_acessos from public, anon, authenticated;

create function public.entrada_frear(p_entrada uuid, p_tipo text, p_limite int) returns void
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  insert into public.entrada_acessos as a (entrada_id, tipo, minuto, n) values (p_entrada, p_tipo, date_trunc('minute', now()), 1)
  on conflict (entrada_id, tipo, minuto) do update set n = a.n + 1
  returning a.n into v_n;
  if v_n = 1 then delete from public.entrada_acessos a where a.entrada_id = p_entrada and a.minuto < now() - interval '10 minutes'; end if;
  if v_n > p_limite then
    raise exception 'Muitos acessos a esta página agora. Espere um minuto e abra de novo.' using errcode = 'PT429';
  end if;
end $$;

-- a área da visita
create function public.entrada_area(p_agendamento uuid) returns text[]
language sql immutable set search_path = '' as $$
  select case when p_agendamento is not null then array['agenda'] else array['creche_hotel'] end
$$;

-- ---------- gravar ----------
-- Cria (p_id nulo) ou corrige a entrada de uma visita (uma por horário ou estadia). p_dados: { temperamento: [..], cuidados,
-- lesoes: [..], lesoes_obs, idoso_doente, pertences: [..], pertences_outros, obs, termo }. p_fotos: ["<petshop>/<x>.jpg", ...]
-- (até 4, já no bucket). Mudança depois do aceite apaga o aceite e o link. Devolve { id, aceite_zerado }.
create function public.entrada_salvar(p_petshop uuid, p_id uuid, p_pet uuid, p_agendamento uuid, p_estadia uuid, p_dados jsonb, p_fotos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_pet uuid;
  e public.entradas;
  v_fotos text[] := '{}';
  v_temp text[]; v_les text[]; v_pert text[];
  v_cuid text; v_lobs text; v_pout text; v_obs text; v_termo text; v_idoso boolean;
  v_mudou boolean;
  x text;
begin
  if (p_agendamento is null) = (p_estadia is null) then raise exception 'A entrada é de um atendimento ou de uma estadia.'; end if;
  if not public.tenho_area(p_petshop, public.entrada_area(p_agendamento)) then
    raise exception '%', case when p_agendamento is not null then 'Sem acesso à agenda.' else 'Sem acesso à creche e ao hotel.' end;
  end if;
  if not public.acesso_liberado(p_petshop) then raise exception 'A conta está só para consulta.'; end if;

  if p_agendamento is not null then
    select a.pet_id into v_pet from public.agendamentos a where a.id = p_agendamento and a.petshop_id = p_petshop;
  else
    select s.pet_id into v_pet from public.estadias s where s.id = p_estadia and s.petshop_id = p_petshop and s.status in ('reservada', 'em_casa', 'encerrada');
  end if;
  if v_pet is null or v_pet is distinct from p_pet then raise exception 'Visita não encontrada.'; end if;

  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'Dados da entrada inválidos.'; end if;
  begin
    v_temp := coalesce(array(select distinct jsonb_array_elements_text(coalesce(p_dados -> 'temperamento', '[]'::jsonb)) order by 1), '{}');
    v_les := coalesce(array(select distinct jsonb_array_elements_text(coalesce(p_dados -> 'lesoes', '[]'::jsonb)) order by 1), '{}');
    v_pert := coalesce(array(select distinct jsonb_array_elements_text(coalesce(p_dados -> 'pertences', '[]'::jsonb)) order by 1), '{}');
  exception when others then raise exception 'Dados da entrada inválidos.';
  end;
  if not (v_temp <@ array['calmo', 'agitado', 'morde', 'medo']::text[]) or not (v_les <@ array['ferida', 'lesao', 'pulgas', 'carrapatos', 'nos']::text[])
     or not (v_pert <@ array['coleira', 'guia', 'caminha', 'brinquedo', 'remedio', 'racao']::text[]) then
    raise exception 'Dados da entrada inválidos.';
  end if;
  v_cuid := nullif(trim(p_dados ->> 'cuidados'), '');
  v_lobs := nullif(trim(p_dados ->> 'lesoes_obs'), '');
  v_pout := nullif(trim(p_dados ->> 'pertences_outros'), '');
  v_obs := nullif(trim(p_dados ->> 'obs'), '');
  v_termo := coalesce(trim(p_dados ->> 'termo'), '');
  v_idoso := coalesce((p_dados ->> 'idoso_doente')::boolean, false);
  if char_length(coalesce(v_cuid, '')) > 600 then raise exception 'Alergias e cuidados: até 600 letras.'; end if;
  if char_length(coalesce(v_lobs, '')) > 300 then raise exception 'O que já tinha no corpo: até 300 letras.'; end if;
  if char_length(coalesce(v_pout, '')) > 200 then raise exception 'Outros pertences: até 200 letras.'; end if;
  if char_length(coalesce(v_obs, '')) > 1000 then raise exception 'Observações: até 1.000 letras.'; end if;
  if char_length(v_termo) > 3000 then raise exception 'O texto do aceite ficou grande demais.'; end if;

  if jsonb_typeof(coalesce(p_fotos, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_fotos, '[]'::jsonb)) > 4 then
    raise exception 'Até 4 fotos na entrada.';
  end if;
  for x in select jsonb_array_elements_text(coalesce(p_fotos, '[]'::jsonb)) loop
    if x !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' or public.diario_pasta(x) is distinct from p_petshop then raise exception 'Foto fora da pasta do pet shop.'; end if;
    if not exists (select 1 from storage.objects o where o.bucket_id = 'entrada' and o.name = x) then raise exception 'A foto não chegou. Tente de novo.'; end if;
    if x = any (v_fotos) then raise exception 'Foto repetida.'; end if;
    if exists (select 1 from public.entradas o where x = any (o.fotos) and o.id is distinct from p_id
                 and (p_id is not null or o.agendamento_id is distinct from p_agendamento or o.estadia_id is distinct from p_estadia)) then
      raise exception 'Foto de outra entrada.';
    end if;
    v_fotos := v_fotos || x;
  end loop;

  -- dois toques no Salvar: a segunda gravação vira correção da primeira
  if p_id is null then
    perform pg_advisory_xact_lock(hashtextextended('entrada:' || coalesce(p_agendamento, p_estadia)::text, 0));
    select * into e from public.entradas o where o.petshop_id = p_petshop
      and (o.agendamento_id = p_agendamento or o.estadia_id = p_estadia) for update;
  else
    select * into e from public.entradas o where o.id = p_id and o.petshop_id = p_petshop for update;
    if e.id is null or e.agendamento_id is distinct from p_agendamento or e.estadia_id is distinct from p_estadia then raise exception 'Entrada não encontrada.'; end if;
  end if;

  if e.id is null then
    insert into public.entradas (petshop_id, pet_id, agendamento_id, estadia_id, temperamento, cuidados, lesoes, lesoes_obs, idoso_doente,
      pertences, pertences_outros, obs, fotos, termo, criado_por)
    values (p_petshop, p_pet, p_agendamento, p_estadia, v_temp, v_cuid, v_les, v_lobs, v_idoso, v_pert, v_pout, v_obs, v_fotos, v_termo, (select auth.uid()))
    returning * into e;
    return jsonb_build_object('id', e.id, 'aceite_zerado', false);
  end if;

  v_mudou := e.temperamento is distinct from v_temp or e.cuidados is distinct from v_cuid or e.lesoes is distinct from v_les
    or e.lesoes_obs is distinct from v_lobs or e.idoso_doente is distinct from v_idoso or e.pertences is distinct from v_pert
    or e.pertences_outros is distinct from v_pout or e.obs is distinct from v_obs or e.fotos is distinct from v_fotos;
  if not v_mudou and e.termo = v_termo then return jsonb_build_object('id', e.id, 'aceite_zerado', false); end if;

  insert into public.entrada_lixo (caminho, petshop_id, motivo)
  select f, p_petshop, 'trocada' from unnest(e.fotos) f where not (f = any (v_fotos))
  on conflict (caminho) do nothing;
  if v_mudou and e.aceite_assinatura is not null then
    insert into public.entrada_lixo (caminho, petshop_id, motivo) values (e.aceite_assinatura, p_petshop, 'aceite_refeito') on conflict (caminho) do nothing;
  end if;
  update public.entradas o set temperamento = v_temp, cuidados = v_cuid, lesoes = v_les, lesoes_obs = v_lobs, idoso_doente = v_idoso,
    pertences = v_pert, pertences_outros = v_pout, obs = v_obs, fotos = v_fotos,
    assinaturas = case when v_mudou then '{}' else o.assinaturas end,
    -- o texto do termo só muda enquanto não há aceite (o aceito fica com o texto que foi lido)
    termo = case when o.aceito_em is null or v_mudou then v_termo else o.termo end,
    aceite = case when v_mudou then null else o.aceite end, aceite_nome = case when v_mudou then null else o.aceite_nome end,
    aceite_assinatura = case when v_mudou then null else o.aceite_assinatura end, aceito_em = case when v_mudou then null else o.aceito_em end,
    aceite_ip = case when v_mudou then null else o.aceite_ip end, aceite_navegador = case when v_mudou then null else o.aceite_navegador end,
    token = case when v_mudou then null else o.token end, token_expira = case when v_mudou then null else o.token_expira end,
    link_criado_em = case when v_mudou then null else o.link_criado_em end,
    atualizado_em = now()
  where o.id = e.id;
  return jsonb_build_object('id', e.id, 'aceite_zerado', v_mudou and e.aceito_em is not null);
end $$;

-- O tutor assina no aparelho da loja: o nome e a imagem da assinatura (PNG no bucket). Guarda a hora, o IP e o navegador do
-- pedido. Já aceita: devolve o aceite que está guardado (dois toques gravam uma vez).
create function public.entrada_assinar(p_id uuid, p_nome text, p_assinatura text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.entradas; v_cab jsonb; v_nome text := trim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
begin
  select * into e from public.entradas o where o.id = p_id for update;
  if e.id is null or e.petshop_id not in (select public.meus_petshops()) or not public.tenho_area(e.petshop_id, public.entrada_area(e.agendamento_id)) then
    raise exception 'Entrada não encontrada.';
  end if;
  if not public.acesso_liberado(e.petshop_id) then raise exception 'A conta está só para consulta.'; end if;
  if e.aceito_em is not null then
    return jsonb_build_object('aceite', e.aceite, 'aceito_em', e.aceito_em, 'nome', e.aceite_nome, 'ja_estava', true);
  end if;
  if char_length(v_nome) < 2 or char_length(v_nome) > 120 then raise exception 'Escreva o nome de quem assina.'; end if;
  if coalesce(p_assinatura, '') !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.png$' or public.diario_pasta(p_assinatura) is distinct from e.petshop_id then
    raise exception 'Assinatura fora da pasta do pet shop.';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'entrada' and o.name = p_assinatura) then raise exception 'A assinatura não chegou. Tente de novo.'; end if;
  if exists (select 1 from public.entradas o where o.aceite_assinatura = p_assinatura) then raise exception 'Assinatura de outra entrada.'; end if;
  begin v_cab := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then v_cab := null; end;
  update public.entradas o set aceite = 'aparelho', aceite_nome = v_nome, aceite_assinatura = p_assinatura, aceito_em = now(),
    aceite_ip = nullif(left(trim(split_part(coalesce(v_cab ->> 'cf-connecting-ip', v_cab ->> 'x-forwarded-for', v_cab ->> 'x-real-ip', ''), ',', 1)), 64), ''),
    aceite_navegador = nullif(left(coalesce(v_cab ->> 'user-agent', ''), 300), ''),
    token = null, token_expira = null, atualizado_em = now()
  where o.id = e.id returning * into e;
  return jsonb_build_object('aceite', e.aceite, 'aceito_em', e.aceito_em, 'nome', e.aceite_nome, 'ja_estava', false);
end $$;

-- O link para o tutor aceitar pelo celular (7 dias). Link ainda valendo: o mesmo código. p_fotos: [{caminho, assinatura}] com a
-- assinatura de cada foto feita agora pelo aparelho (vale um pouco mais que o link). Devolve { token, expira }.
create function public.entrada_link(p_id uuid, p_fotos jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.entradas; v_assin text[] := '{}'; f text; s text;
begin
  select * into e from public.entradas o where o.id = p_id for update;
  if e.id is null or e.petshop_id not in (select public.meus_petshops()) or not public.tenho_area(e.petshop_id, public.entrada_area(e.agendamento_id)) then
    raise exception 'Entrada não encontrada.';
  end if;
  if not public.acesso_liberado(e.petshop_id) then raise exception 'A conta está só para consulta.'; end if;
  if e.aceito_em is not null then raise exception 'O tutor já aceitou esta entrada.'; end if;
  if jsonb_typeof(coalesce(p_fotos, '[]'::jsonb)) <> 'array' then raise exception 'Fotos inválidas.'; end if;
  foreach f in array e.fotos loop
    select x ->> 'assinatura' into s from jsonb_array_elements(coalesce(p_fotos, '[]'::jsonb)) x where x ->> 'caminho' = f limit 1;
    if s is null or s !~ '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' or char_length(s) > 2000 then raise exception 'Foto sem assinatura. Tente de novo.'; end if;
    v_assin := v_assin || s;
  end loop;
  update public.entradas o set assinaturas = v_assin,
    token = case when o.token is not null and o.token_expira > now() then o.token else encode(extensions.gen_random_bytes(32), 'hex') end,
    token_expira = case when o.token is not null and o.token_expira > now() then o.token_expira else now() + interval '7 days' end,
    link_criado_em = case when o.token is not null and o.token_expira > now() then o.link_criado_em else now() end
  where o.id = e.id returning * into e;
  return jsonb_build_object('token', e.token, 'expira', e.token_expira);
end $$;

-- Pertences devolvidos na saída (ou desmarcar). Devolve a hora (ou nulo).
create function public.entrada_devolver(p_id uuid, p_devolvido boolean) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare e public.entradas;
begin
  select * into e from public.entradas o where o.id = p_id;
  if e.id is null or e.petshop_id not in (select public.meus_petshops()) or not public.tenho_area(e.petshop_id, public.entrada_area(e.agendamento_id)) then
    raise exception 'Entrada não encontrada.';
  end if;
  if not public.acesso_liberado(e.petshop_id) then raise exception 'A conta está só para consulta.'; end if;
  update public.entradas o set devolvido_em = case when p_devolvido then coalesce(o.devolvido_em, now()) end,
    devolvido_por = case when p_devolvido then coalesce(o.devolvido_por, (select auth.uid())) end
  where o.id = e.id returning * into e;
  return e.devolvido_em;
end $$;

-- ---------- a página pública ----------
create function public.entrada_do_codigo(p_token text) returns public.entradas
language sql stable security definer set search_path = '' as $$
  select e.* from public.entradas e
   where p_token ~ '^[0-9a-f]{64}$' and e.token = p_token and e.token_expira > now() and public.acesso_liberado(e.petshop_id)
$$;

-- Só o que a página mostra: o pet shop, o pet, o resumo da entrada, o texto do termo e o aceite. Nada do tutor, nenhum caminho.
create function public.entrada_publica(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.entradas; s public.petshops; p public.pets; v_tipo text;
begin
  e := public.entrada_do_codigo(p_token);
  if e.id is null then return null; end if;
  perform public.entrada_frear(e.id, 'pagina', 60);
  select * into s from public.petshops where id = e.petshop_id;
  select * into p from public.pets where id = e.pet_id;
  v_tipo := case when e.agendamento_id is not null then 'banho' else (select x.tipo from public.estadias x where x.id = e.estadia_id) end;
  return jsonb_build_object(
    'petshop', jsonb_build_object('nome', s.nome, 'logo', s.logo, 'tema', s.tema, 'telefone', s.telefone, 'fuso', coalesce(s.fuso, 'America/Sao_Paulo')),
    'pet', jsonb_build_object('nome', p.nome, 'sexo', p.sexo, 'especie', p.especie),
    'tipo', v_tipo, 'criado_em', e.criado_em,
    'temperamento', to_jsonb(e.temperamento), 'cuidados', e.cuidados, 'lesoes', to_jsonb(e.lesoes), 'lesoes_obs', e.lesoes_obs,
    'idoso_doente', e.idoso_doente, 'pertences', to_jsonb(e.pertences), 'pertences_outros', e.pertences_outros, 'obs', e.obs,
    'fotos', cardinality(e.fotos), 'termo', e.termo,
    'aceito_em', e.aceito_em, 'aceite_nome', e.aceite_nome, 'expira_em', e.token_expira);
end $$;

-- Uma foto (0 a 3) para o servidor da página: o caminho e a assinatura.
create function public.entrada_foto(p_token text, p_n int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.entradas;
begin
  e := public.entrada_do_codigo(p_token);
  if e.id is null or p_n is null or p_n < 0 or p_n >= cardinality(e.fotos) or p_n >= cardinality(e.assinaturas) then return null; end if;
  perform public.entrada_frear(e.id, 'foto', 400);
  return jsonb_build_object('caminho', e.fotos[p_n + 1], 'assinatura', e.assinaturas[p_n + 1]);
end $$;

-- "Li e concordo" pelo link: o servidor da página passa o IP e o navegador de quem tocou. Uma vez só (o segundo toque devolve o
-- aceite guardado). Devolve { aceito_em, nome }.
create function public.entrada_aceitar(p_token text, p_nome text, p_ip text, p_navegador text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.entradas; v_nome text := trim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
begin
  e := public.entrada_do_codigo(p_token);
  if e.id is null then raise exception 'Este link não vale mais. Peça um novo ao pet shop.'; end if;
  perform public.entrada_frear(e.id, 'aceite', 10);
  select * into e from public.entradas o where o.id = e.id for update;
  if e.aceito_em is not null then return jsonb_build_object('aceito_em', e.aceito_em, 'nome', e.aceite_nome, 'ja_estava', true); end if;
  if char_length(v_nome) < 2 or char_length(v_nome) > 120 then raise exception 'Escreva o seu nome.'; end if;
  update public.entradas o set aceite = 'link', aceite_nome = v_nome, aceito_em = now(),
    aceite_ip = nullif(left(trim(coalesce(p_ip, '')), 64), ''), aceite_navegador = nullif(left(coalesce(p_navegador, ''), 300), ''), atualizado_em = now()
  where o.id = e.id returning * into e;
  return jsonb_build_object('aceito_em', e.aceito_em, 'nome', e.aceite_nome, 'ja_estava', false);
end $$;

-- ---------- faxina ----------
create function public.entrada_pode_limpar(p_nome text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.entrada_lixo l
                  where l.caminho = p_nome and l.petshop_id = public.diario_pasta(p_nome)
                    and public.tenho_area(l.petshop_id, array['agenda', 'creche_hotel']))
     and not exists (select 1 from public.entradas e where p_nome = any (e.fotos) or e.aceite_assinatura = p_nome)
$$;
create function public.entrada_arquivo_em_uso(p_nome text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.entradas e where p_nome = any (e.fotos) or e.aceite_assinatura = p_nome)
$$;

-- Põe na fila o que subiu e não entrou em entrada nenhuma (mais de um dia), tira da fila o que já sumiu do bucket e devolve
-- {apagar: [caminhos]} para o aparelho apagar pela API do Storage.
create function public.entrada_faxina(p_petshop uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_apagar jsonb;
begin
  if not public.tenho_area(p_petshop, array['agenda', 'creche_hotel']) then raise exception 'Sem acesso.'; end if;
  perform pg_advisory_xact_lock(hashtext('entrada_faxina' || p_petshop::text));
  insert into public.entrada_lixo (caminho, petshop_id, motivo)
  select o.name, p_petshop, 'sem_entrada' from storage.objects o
   where o.bucket_id = 'entrada' and left(o.name, 37) = p_petshop::text || '/' and o.created_at < now() - interval '1 day'
     and not public.entrada_arquivo_em_uso(o.name)
   limit 500
  on conflict (caminho) do nothing;
  delete from public.entrada_lixo l
   where l.petshop_id = p_petshop
     and not exists (select 1 from storage.objects o where o.bucket_id = 'entrada' and o.name = l.caminho);
  with v as (
    update public.entrada_lixo l set tentativas = l.tentativas + 1
     where l.caminho in (select x.caminho from public.entrada_lixo x where x.petshop_id = p_petshop and x.tentativas < 20 order by x.criado_em limit 200)
    returning l.caminho)
  select coalesce(jsonb_agg(v.caminho), '[]'::jsonb) into v_apagar from v;
  return jsonb_build_object('apagar', v_apagar);
end $$;

revoke execute on function public.entrada_para_lixo(), public.entrada_frear(uuid, text, int), public.entrada_area(uuid),
  public.entrada_salvar(uuid, uuid, uuid, uuid, uuid, jsonb, jsonb), public.entrada_assinar(uuid, text, text), public.entrada_link(uuid, jsonb),
  public.entrada_devolver(uuid, boolean), public.entrada_do_codigo(text), public.entrada_publica(text), public.entrada_foto(text, int),
  public.entrada_aceitar(text, text, text, text), public.entrada_pode_limpar(text), public.entrada_arquivo_em_uso(text), public.entrada_faxina(uuid)
  from public, anon, authenticated;
grant execute on function public.entrada_salvar(uuid, uuid, uuid, uuid, uuid, jsonb, jsonb), public.entrada_assinar(uuid, text, text),
  public.entrada_link(uuid, jsonb), public.entrada_devolver(uuid, boolean), public.entrada_faxina(uuid) to authenticated;
-- o bucket confere com o papel de quem pede
grant execute on function public.entrada_pode_limpar(text), public.entrada_arquivo_em_uso(text) to authenticated;
-- o servidor da página pública só tem a chave pública (anon)
grant execute on function public.entrada_publica(text), public.entrada_foto(text, int), public.entrada_aceitar(text, text, text, text) to anon, authenticated;

-- ---------- o bucket privado ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('entrada', 'entrada', false, 1572864, array['image/jpeg', 'image/png'])
  on conflict (id) do nothing;

-- a equipe da agenda ou da creche e do hotel vê os arquivos do pet shop (prévia, comprovante, assinar para o link)
create policy entrada_equipe_ler on storage.objects for select to authenticated
  using (bucket_id = 'entrada' and public.diario_pasta(name) in (select public.meus_petshops())
    and public.tenho_area(public.diario_pasta(name), array['agenda', 'creche_hotel']));
-- e manda foto (.jpg) ou assinatura (.png), com a conta liberada, só em <petshop>/<aleatório>
create policy entrada_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'entrada' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png)$'
    and public.diario_pasta(name) in (select public.meus_petshops())
    and public.tenho_area(public.diario_pasta(name), array['agenda', 'creche_hotel'])
    and public.acesso_liberado(public.diario_pasta(name)));
-- apagar: o que está na fila, ou o arquivo que a própria pessoa subiu e ainda não entrou em entrada nenhuma
create policy entrada_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'entrada' and (public.entrada_pode_limpar(name)
    or (owner_id = (select auth.uid())::text and public.diario_pasta(name) in (select public.meus_petshops()) and not public.entrada_arquivo_em_uso(name))));

notify pgrst, 'reload schema';
