-- Importações e rascunhos (rodada de conserto depois dos testadores; agente D).
--
-- 1. rascunhos: o que a pessoa começou e ainda não salvou, guardado no banco (por pet shop e por pessoa), para voltar depois de
--    recarregar a página, trocar de aplicativo no celular ou abrir de outro aparelho. Hoje: a conferência da leitura do caderno
--    (a leitura é paga: recarregar não pode obrigar a ler de novo). A própria rota /api/gestao/caderno grava a leitura assim que
--    ela chega; a tela grava as correções. Sai ao salvar ou descartar, e sozinho depois de 7 dias.
-- 2. importacoes + importar_clientes: a planilha de clientes e pets entra numa operação só, no banco (tudo ou nada). Sair da tela
--    no meio não deixa metade; o resumo é contado na mesma transação (bate com o que entrou) e fica guardado, para qualquer
--    aparelho ver a última importação e desfazer (importacao_desfazer_registro, que usa a importacao_desfazer da 20261137).
--    A mesma chave (toque duplo, nova tentativa) devolve o que já entrou, sem gravar de novo.
--
-- Só acrescenta: nenhuma função existente é trocada.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Rascunhos
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.rascunhos (
  petshop_id uuid not null references public.petshops(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- de quê: 'caderno', 'caderno_pet:<id do pet>' (carteirinha)…
  tipo text not null check (tipo ~ '^[a-z_]{2,30}(:[0-9a-f-]{36})?$'),
  dados jsonb not null check (octet_length(dados::text) <= 2000000),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (petshop_id, user_id, tipo)
);
alter table public.rascunhos enable row level security;
-- cada pessoa só vê e mexe nos próprios rascunhos, e só nos pet shops em que está
drop policy if exists rascunhos_meus on public.rascunhos;
create policy rascunhos_meus on public.rascunhos for all to authenticated
  using (user_id = (select auth.uid()) and petshop_id in (select public.meus_petshops()))
  with check (user_id = (select auth.uid()) and petshop_id in (select public.meus_petshops()));
revoke all on public.rascunhos from anon, public;
grant select, insert, update, delete on public.rascunhos to authenticated;

create or replace function public.rascunho_tocar() returns trigger language plpgsql set search_path = '' as $$
begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists rascunhos_tocar on public.rascunhos;
create trigger rascunhos_tocar before update on public.rascunhos for each row execute function public.rascunho_tocar();

-- rascunho esquecido sai depois de 7 dias (a tela também ignora e apaga o velho ao abrir)
create or replace function public.rascunhos_faxina() returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  delete from public.rascunhos r where r.atualizado_em < now() - interval '7 days';
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.rascunhos_faxina() from public, anon, authenticated;
grant execute on function public.rascunhos_faxina() to service_role;
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      execute $c$select cron.schedule('gestao-rascunhos-velhos', '41 6 * * *', 'select public.rascunhos_faxina()')$c$;
    exception when others then
      raise notice 'pg_cron indisponível aqui (%): o rascunho velho sai quando a tela abre.', sqlerrm;
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Importação de clientes e pets pela planilha, no banco
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.importacoes (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops(id) on delete cascade,
  chave text not null,
  tipo text not null default 'clientes' check (tipo in ('clientes')),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  -- contagens do que entrou (a tela monta as frases do resumo a partir delas)
  resumo jsonb not null default '{}'::jsonb,
  -- o que esta importação criou (para desfazer)
  clientes uuid[] not null default '{}',
  pets uuid[] not null default '{}',
  desfeita_em timestamptz,
  desfeita jsonb,
  unique (petshop_id, chave)
);
create index if not exists importacoes_petshop_idx on public.importacoes (petshop_id, criado_em desc);
alter table public.importacoes enable row level security;
drop policy if exists importacoes_ler on public.importacoes;
create policy importacoes_ler on public.importacoes for select to authenticated
  using (petshop_id in (select public.meus_petshops()) and (select public.tenho_area(petshop_id, array['clientes'])));
revoke all on public.importacoes from anon, public;
grant select on public.importacoes to authenticated;

-- nome comparável: sem acento, minúsculo, sem espaço sobrando (o mesmo que semAcento da tela)
create or replace function public.imp_chave_nome(t text) returns text language sql immutable parallel safe set search_path = '' as $$
  select lower(btrim(regexp_replace(translate(coalesce(t, ''),
    'áàâãäåéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
    'aaaaaaeeeeiiiiooooouuuucnyyAAAAAAEEEEIIIIOOOOOUUUUCNY'), '\s+', ' ', 'g')))
$$;
-- os 8 últimos algarismos do telefone (com DDD): é por eles que dois cadastros são o mesmo telefone (fimDoTelefone da tela)
create or replace function public.imp_fim_fone(t text) returns text language sql immutable parallel safe set search_path = '' as $$
  select case when length(d) >= 10 then right(d, 8) else '' end
    from (select regexp_replace(regexp_replace(coalesce(t, ''), '\D', '', 'g'), '^0+', '') as d) x
$$;
create index if not exists clientes_imp_fone_idx on public.clientes (petshop_id, public.imp_fim_fone(telefone));
create index if not exists clientes_imp_nome_idx on public.clientes (petshop_id, public.imp_chave_nome(nome));

/*
  importar_clientes(p_petshop, p_chave, p_linhas, p_extra): uma linha por pet (o tutor com dois pets vem em duas linhas;
  a tela já separou "Luna, Bob" em duas). Cada linha: tutor, fone (já limpo), email, endereco, pet, especie, especie_dada,
  raca, porte, obs, alertas. Mesmas regras de antes, agora numa transação só:
  - mesmo telefone (8 últimos algarismos) é a mesma pessoa; mesmo nome com outro telefone é outra pessoa (homônimo);
  - quem já existe só ganha o que estava em branco (telefone, e-mail, endereço; raça, porte, observações, alertas);
  - o mesmo pet duas vezes na planilha: linha repetida (completa) ou, se a espécie, a raça ou o porte diferem, fica de fora.
  p_extra: o que só a tela sabe (telefones incompletos, linhas com dois telefones, planilha sem coluna de pet), guardado no resumo.
  Devolve { id, em, resumo, clientes, pets, repetida }.
*/
create or replace function public.importar_clientes(p_petshop uuid, p_chave text, p_linhas jsonb, p_extra jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = ''
-- cada linha procura o tutor e o pet pelos índices de telefone e nome; com a tabela recém-criada (estatística de "vazia") o
-- planejador escolheria ler a tabela inteira a cada linha e 2.000 linhas passariam do tempo do banco
set enable_seqscan = off
as $$
declare
  v_id uuid; v_em timestamptz; i public.importacoes;
  r jsonb; p public.pets;
  v_nome text; v_fone text; v_cf text; v_email text; v_end text;
  v_cli uuid; v_homon uuid; v_fone_h text; v_outro boolean;
  v_pet text; v_esp text; v_esp_dada boolean; v_raca text; v_porte text; v_obs text; v_alerta text;
  n_tut int := 0; n_pets int := 0; ja_estavam int := 0; repetidas int := 0; homonimos int := 0; com_alerta int := 0;
  comp_tut uuid[] := '{}'; comp_pets uuid[] := '{}'; mesmo_nome text[] := '{}';
  novos_cli uuid[] := '{}'; novos_pets uuid[] := '{}';
  v_resumo jsonb; extra jsonb := coalesce(p_extra, '{}'::jsonb);
begin
  if p_petshop is null or p_petshop not in (select public.meus_petshops()) then raise exception 'Pet shop não encontrado.'; end if;
  if not public.acesso_liberado(p_petshop) then raise exception 'Sua conta está só para consulta.'; end if;
  if not public.tenho_area(p_petshop, array['clientes']) then raise exception 'Você não tem permissão para mexer nos clientes.'; end if;
  if p_chave is null or length(p_chave) not between 8 and 200 then raise exception 'Pedido incompleto.'; end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then raise exception 'A planilha veio vazia.'; end if;
  if jsonb_array_length(p_linhas) > 4000 then raise exception 'Traga até 2.000 linhas por vez.'; end if;

  -- a mesma importação de novo (toque duplo, a internet caiu e a pessoa tentou de novo): devolve o que já entrou
  insert into public.importacoes (petshop_id, chave, tipo, criado_por) values (p_petshop, p_chave, 'clientes', auth.uid())
    on conflict (petshop_id, chave) do nothing returning id, criado_em into v_id, v_em;
  if v_id is null then
    select * into i from public.importacoes x where x.petshop_id = p_petshop and x.chave = p_chave;
    return jsonb_build_object('id', i.id, 'em', i.criado_em, 'resumo', i.resumo, 'clientes', to_jsonb(i.clientes), 'pets', to_jsonb(i.pets), 'repetida', true);
  end if;

  for r in select value from jsonb_array_elements(p_linhas) loop
    continue when jsonb_typeof(r) <> 'object';
    v_nome := left(btrim(regexp_replace(coalesce(r->>'tutor', ''), '\s+', ' ', 'g')), 120);
    continue when v_nome = '';
    v_fone := nullif(regexp_replace(coalesce(r->>'fone', ''), '\D', '', 'g'), '');
    v_cf := public.imp_fim_fone(v_fone);
    if v_cf = '' then v_fone := null; end if;
    v_email := nullif(left(btrim(coalesce(r->>'email', '')), 160), '');
    v_end := nullif(left(btrim(coalesce(r->>'endereco', '')), 200), '');

    -- o tutor: pelo telefone; senão pelo nome, se o telefone não for outro
    v_cli := null; v_outro := false;
    if v_cf <> '' then
      select c.id into v_cli from public.clientes c
        where c.petshop_id = p_petshop and public.imp_fim_fone(c.telefone) = v_cf order by c.criado_em, c.id limit 1;
    end if;
    if v_cli is null then
      v_homon := null; v_fone_h := '';
      select c.id, public.imp_fim_fone(c.telefone) into v_homon, v_fone_h from public.clientes c
        where c.petshop_id = p_petshop and public.imp_chave_nome(c.nome) = public.imp_chave_nome(v_nome)
        order by (c.id = any (novos_cli)) desc, c.criado_em desc, c.id desc limit 1;
      v_outro := v_homon is not null and v_cf <> '' and coalesce(v_fone_h, '') <> '' and v_fone_h <> v_cf;
      if not v_outro then v_cli := v_homon; end if;
    end if;
    if v_cli is null then
      insert into public.clientes (petshop_id, nome, telefone, email, endereco) values (p_petshop, v_nome, v_fone, v_email, v_end)
        returning id into v_cli;
      novos_cli := novos_cli || v_cli;
      n_tut := n_tut + 1;
      if v_outro then homonimos := homonimos + 1; end if;
    else
      -- já existe: só preenche o que está em branco, nunca troca o que a pessoa já tinha
      update public.clientes c set
          telefone = case when coalesce(btrim(c.telefone), '') = '' and v_fone is not null then v_fone else c.telefone end,
          email = case when coalesce(btrim(c.email), '') = '' and v_email is not null then v_email else c.email end,
          endereco = case when coalesce(btrim(c.endereco), '') = '' and v_end is not null then v_end else c.endereco end
        where c.id = v_cli and ((coalesce(btrim(c.telefone), '') = '' and v_fone is not null)
          or (coalesce(btrim(c.email), '') = '' and v_email is not null) or (coalesce(btrim(c.endereco), '') = '' and v_end is not null));
      if found and not (v_cli = any (novos_cli)) and not (v_cli = any (comp_tut)) then comp_tut := comp_tut || v_cli; end if;
    end if;

    -- o pet
    v_pet := left(btrim(regexp_replace(coalesce(r->>'pet', ''), '\s+', ' ', 'g')), 80);
    continue when v_pet = '';
    v_esp := case r->>'especie' when 'gato' then 'gato' when 'outro' then 'outro' else 'cao' end;
    v_esp_dada := coalesce(r->>'especie_dada', '') = 'true';
    v_raca := nullif(left(btrim(coalesce(r->>'raca', '')), 60), '');
    v_porte := case when r->>'porte' in ('P', 'M', 'G', 'GG') then r->>'porte' end;
    v_obs := nullif(left(btrim(coalesce(r->>'obs', '')), 600), '');
    v_alerta := nullif(left(btrim(coalesce(r->>'alertas', '')), 600), '');

    select * into p from public.pets x
      where x.petshop_id = p_petshop and x.cliente_id = v_cli and public.imp_chave_nome(x.nome) = public.imp_chave_nome(v_pet)
      order by x.criado_em, x.id limit 1;
    if not found then
      insert into public.pets (petshop_id, cliente_id, nome, especie, raca, porte, obs, alertas)
        values (p_petshop, v_cli, v_pet, v_esp, v_raca, v_porte, v_obs, v_alerta) returning id into p.id;
      novos_pets := novos_pets || p.id;
      n_pets := n_pets + 1;
      if v_alerta is not null then com_alerta := com_alerta + 1; end if;
      continue;
    end if;
    if p.id = any (novos_pets) then
      -- mesmo tutor, mesmo nome de pet, duas linhas: linha repetida ou dois pets de verdade?
      if (v_esp_dada and v_esp <> p.especie)
        or (v_raca is not null and coalesce(p.raca, '') <> '' and public.imp_chave_nome(v_raca) <> public.imp_chave_nome(p.raca))
        or (v_porte is not null and p.porte is not null and v_porte <> p.porte) then
        mesmo_nome := mesmo_nome || format('%s (de %s)', v_pet, v_nome);
        continue;
      end if;
      repetidas := repetidas + 1;
    end if;
    update public.pets x set
        raca = case when coalesce(btrim(x.raca), '') = '' and v_raca is not null then v_raca else x.raca end,
        porte = case when x.porte is null and v_porte is not null then v_porte else x.porte end,
        obs = case when coalesce(btrim(x.obs), '') = '' and v_obs is not null then v_obs else x.obs end,
        alertas = case when coalesce(btrim(x.alertas), '') = '' and v_alerta is not null then v_alerta else x.alertas end
      where x.id = p.id and ((coalesce(btrim(x.raca), '') = '' and v_raca is not null) or (x.porte is null and v_porte is not null)
        or (coalesce(btrim(x.obs), '') = '' and v_obs is not null) or (coalesce(btrim(x.alertas), '') = '' and v_alerta is not null));
    if found then
      if not (p.id = any (novos_pets)) and not (p.id = any (comp_pets)) then comp_pets := comp_pets || p.id; end if;
    elsif not (p.id = any (novos_pets)) then
      ja_estavam := ja_estavam + 1;
    end if;
  end loop;

  v_resumo := jsonb_build_object(
    'tutores_novos', n_tut, 'pets_novos', n_pets,
    'tutores_completados', cardinality(comp_tut), 'pets_completados', cardinality(comp_pets),
    'ja_estavam', ja_estavam, 'linhas_repetidas', repetidas, 'mesmo_nome', to_jsonb(mesmo_nome),
    'homonimos', homonimos, 'com_alerta', com_alerta,
    'linhas', jsonb_array_length(p_linhas),
    -- o que só a tela sabe (listas curtas de nomes, para a pessoa conferir)
    'fone_ruim', case when jsonb_typeof(extra->'fone_ruim') = 'array' then (select coalesce(jsonb_agg(left(x, 120)), '[]') from (select jsonb_array_elements_text(extra->'fone_ruim') x limit 200) y) else '[]' end,
    'dois_fones', case when jsonb_typeof(extra->'dois_fones') = 'array' then (select coalesce(jsonb_agg(left(x, 120)), '[]') from (select jsonb_array_elements_text(extra->'dois_fones') x limit 200) y) else '[]' end,
    'sem_pet', coalesce(extra->>'sem_pet', '') = 'true',
    'separados', case when jsonb_typeof(extra->'separados') = 'number' then (extra->>'separados')::int else 0 end
  );
  update public.importacoes set resumo = v_resumo, clientes = novos_cli, pets = novos_pets where id = v_id;
  return jsonb_build_object('id', v_id, 'em', v_em, 'resumo', v_resumo, 'clientes', to_jsonb(novos_cli), 'pets', to_jsonb(novos_pets), 'repetida', false);
end $$;
revoke execute on function public.importar_clientes(uuid, text, jsonb, jsonb) from public, anon;
grant execute on function public.importar_clientes(uuid, text, jsonb, jsonb) to authenticated;

-- desfaz uma importação guardada (as mesmas regras da importacao_desfazer: só o que ninguém usou, até 7 dias) e anota que foi desfeita
create or replace function public.importacao_desfazer_registro(p_petshop uuid, p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare i public.importacoes; r jsonb;
begin
  if p_petshop is null or p_petshop not in (select public.meus_petshops()) then raise exception 'Pet shop não encontrado.'; end if;
  select * into i from public.importacoes x where x.id = p_id and x.petshop_id = p_petshop for update;
  if not found then raise exception 'Importação não encontrada.'; end if;
  if i.desfeita_em is not null then return coalesce(i.desfeita, '{}'::jsonb) || jsonb_build_object('ja_desfeita', true); end if;
  r := public.importacao_desfazer(p_petshop, i.clientes, i.pets); -- confere conta liberada e a área de clientes
  update public.importacoes set desfeita_em = now(), desfeita = r where id = p_id;
  return r;
end $$;
revoke execute on function public.importacao_desfazer_registro(uuid, uuid) from public, anon;
grant execute on function public.importacao_desfazer_registro(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
