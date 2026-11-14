-- APLICAR SÓ DEPOIS de publicar o código que acompanha esta migração (junto com a 20261149 ou depois dela).
-- O código antigo lê `agendamentos.preco`, `agendamento_servicos.preco`, `servicos.preco_*`, `produtos.preco_venda` e
-- `petshops.diaria_creche/diaria_hotel` direto da tabela (e chama link_pedir, link_pedir_estadia e link_espera_pedir direto)
-- e para de funcionar com esta migração. O código novo lê os valores pelas funções abaixo e, enquanto esta migração não chega,
-- lê direto da tabela (as funções ainda não existem): funciona antes e depois.
--
-- Fecha a leitura direta: quem não tem Caixa, Financeiro nem Relatórios deixa de enxergar pela API o preço de cada horário
-- (e de cada serviço a mais), a lista de preços dos serviços, as diárias padrão da creche e do hotel e (sem Estoque também)
-- o preço de venda dos produtos. A comissão de cada um segue pela função minha_comissao.
-- Quem não recebe e marca um horário não manda preço: o banco coloca o preço da lista para o porte do pet.
--
-- E o link do cliente: as funções de pedido de sempre saem do alcance do público. Todo pedido passa por link_pedir_com_termos,
-- que confere o aceite das regras quando o pet shop pede (sem regras, passa direto, como antes).

-- ---------- colunas fechadas ----------
-- Coluna nova em agendamentos, agendamento_servicos ou servicos daqui para a frente precisa de `grant select (coluna)`.
revoke select on public.agendamentos from anon, authenticated;
grant select (id, petshop_id, pet_id, servico_id, profissional_id, inicio, fim, status, obs, leva_traz, endereco_leva_traz, checklist,
  pacote_cliente_id, lembrete_em, origem, criado_por, criado_em, serie_id, foto_antes, foto_depois, pronto_avisado_em, sem_cobranca)
  on public.agendamentos to authenticated;
-- colunas da 20261160 (quem marcou "não cobrar" e quando), que vem antes desta
grant select (sem_cobranca_por, sem_cobranca_em, sem_cobranca_nome) on public.agendamentos to authenticated;

revoke select on public.agendamento_servicos from anon, authenticated;
grant select (id, petshop_id, agendamento_id, servico_id, ordem, criado_em) on public.agendamento_servicos to authenticated;

revoke select on public.servicos from anon, authenticated;
grant select (id, petshop_id, nome, categoria, duracao_min, cor, ordem, ativo, criado_em) on public.servicos to authenticated;

-- produtos e petshops já tinham a leitura coluna por coluna
revoke select (preco_venda) on public.produtos from anon, authenticated;
revoke select (diaria_creche, diaria_hotel) on public.petshops from anon, authenticated;

-- ---------- os valores, só para quem pode ver ----------
-- Preço da lista de cada serviço: Caixa, Financeiro, Relatórios (e o dono). Para o resto da equipe, só se o preço
-- muda com o porte (`varia`), sem valor nenhum: a tela pergunta o porte antes de marcar, como sempre.
create or replace function public.servicos_precos(p uuid)
returns table (id uuid, preco_p numeric, preco_m numeric, preco_g numeric, preco_gg numeric, varia boolean)
language sql stable security definer set search_path = '' as $$
  select s.id,
    case when v.pode then s.preco_p end, case when v.pode then s.preco_m end,
    case when v.pode then s.preco_g end, case when v.pode then s.preco_gg end,
    (select count(distinct x) from unnest(array[s.preco_p, s.preco_m, s.preco_g, s.preco_gg]) x where x is not null) > 1
  from public.servicos s, lateral (select public.tenho_area(p, array['caixa', 'financeiro', 'relatorios']) as pode) v
  where s.petshop_id = p and p in (select public.meus_petshops())
$$;

-- Preço combinado de cada horário e de cada serviço a mais dele (id da linha; agendamento_id = o horário).
create or replace function public.agendamentos_precos(p uuid, p_ids uuid[])
returns table (id uuid, agendamento_id uuid, preco numeric)
language sql stable security definer set search_path = '' as $$
  select a.id, a.id, a.preco from public.agendamentos a
  where a.petshop_id = p and a.id = any (p_ids) and (select public.tenho_area(p, array['caixa', 'financeiro', 'relatorios']))
  union all
  select x.id, x.agendamento_id, x.preco from public.agendamento_servicos x
  where x.petshop_id = p and x.agendamento_id = any (p_ids) and (select public.tenho_area(p, array['caixa', 'financeiro', 'relatorios']))
$$;

-- Preço de venda dos produtos: quem vende (Caixa), quem cuida do estoque e quem vê o dinheiro.
create or replace function public.produtos_precos(p uuid)
returns table (id uuid, preco_venda numeric)
language sql stable security definer set search_path = '' as $$
  select x.id, x.preco_venda from public.produtos x
  where x.petshop_id = p and (select public.tenho_area(p, array['caixa', 'financeiro', 'relatorios', 'estoque']))
$$;

-- Diárias padrão da creche e do hotel.
create or replace function public.petshop_diarias(p uuid)
returns table (id uuid, diaria_creche numeric, diaria_hotel numeric)
language sql stable security definer set search_path = '' as $$
  select x.id, x.diaria_creche, x.diaria_hotel from public.petshops x
  where x.id = p and (select public.tenho_area(p, array['caixa', 'financeiro', 'relatorios']))
$$;

revoke execute on function public.servicos_precos(uuid), public.agendamentos_precos(uuid, uuid[]), public.produtos_precos(uuid),
  public.petshop_diarias(uuid) from public, anon;
grant execute on function public.servicos_precos(uuid), public.agendamentos_precos(uuid, uuid[]), public.produtos_precos(uuid),
  public.petshop_diarias(uuid) to authenticated;

-- ---------- quem não recebe não grava preço ----------
-- O preço da lista de um serviço para o porte do pet (a mesma conta de precoDoServico em src/lib/gestao/util.ts:
-- o do porte; sem porte, ou porte sem preço, o primeiro preço preenchido). Só responde de dentro de um gatilho:
-- chamada direta pela API devolve vazio.
create or replace function public.preco_de_tabela(p_petshop uuid, p_servico uuid, p_pet uuid) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.servicos;
  v_porte text;
begin
  if pg_trigger_depth() < 1 or p_servico is null then return null; end if;
  select * into s from public.servicos x where x.id = p_servico and x.petshop_id = p_petshop;
  if not found then return null; end if;
  select x.porte into v_porte from public.pets x where x.id = p_pet and x.petshop_id = p_petshop;
  return coalesce(case v_porte when 'P' then s.preco_p when 'M' then s.preco_m when 'G' then s.preco_g when 'GG' then s.preco_gg end,
    s.preco_p, s.preco_m, s.preco_g, s.preco_gg);
end $$;
revoke execute on function public.preco_de_tabela(uuid, uuid, uuid) from public, anon;
grant execute on function public.preco_de_tabela(uuid, uuid, uuid) to authenticated;

-- Gravação direta pela API (papel authenticated) de quem não tem Caixa, Financeiro nem Relatórios:
-- ao marcar, o preço é o da lista; ao trocar o serviço ou o pet, volta a ser o da lista; em qualquer outra edição não muda.
-- As funções do banco (security definer: aceitar pedido do link, continuar repetição) gravam o preço que elas calculam.
-- Roda como quem grava (sem security definer) justamente para saber se veio da API ou de uma função do banco.
create or replace function public.agendamentos_guardar_preco() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' or (select auth.uid()) is null then return new; end if;
  if (select public.tenho_area(new.petshop_id, array['caixa', 'financeiro', 'relatorios'])) then return new; end if;
  if tg_op = 'INSERT' or new.servico_id is distinct from old.servico_id or new.pet_id is distinct from old.pet_id then
    new.preco := public.preco_de_tabela(new.petshop_id, new.servico_id, new.pet_id);
  else
    new.preco := old.preco;
  end if;
  return new;
end $$;
revoke execute on function public.agendamentos_guardar_preco() from public, anon, authenticated;
drop trigger if exists agendamentos_guardar_preco on public.agendamentos;
create trigger agendamentos_guardar_preco before insert or update on public.agendamentos
  for each row execute function public.agendamentos_guardar_preco();

create or replace function public.agendamento_servicos_guardar_preco() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_pet uuid;
begin
  if current_user <> 'authenticated' or (select auth.uid()) is null then return new; end if;
  if (select public.tenho_area(new.petshop_id, array['caixa', 'financeiro', 'relatorios'])) then return new; end if;
  if tg_op = 'INSERT' or new.servico_id is distinct from old.servico_id then
    select a.pet_id into v_pet from public.agendamentos a where a.id = new.agendamento_id and a.petshop_id = new.petshop_id;
    new.preco := public.preco_de_tabela(new.petshop_id, new.servico_id, v_pet);
  else
    new.preco := old.preco;
  end if;
  return new;
end $$;
revoke execute on function public.agendamento_servicos_guardar_preco() from public, anon, authenticated;
drop trigger if exists agendamento_servicos_guardar_preco on public.agendamento_servicos;
create trigger agendamento_servicos_guardar_preco before insert or update on public.agendamento_servicos
  for each row execute function public.agendamento_servicos_guardar_preco();

-- Pedido do link aceito sem o porte: depois que a equipe responde o porte, o horário que ficou sem valor ganha o preço
-- da lista para esse porte. Só preenche valor em branco; quem chama precisa da Agenda. Não devolve valor nenhum.
create or replace function public.agendamento_preco_da_tabela(p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  a public.agendamentos;
  s public.servicos;
  v_porte text;
  v_preco numeric;
begin
  select * into a from public.agendamentos x where x.id = p_id;
  if not found or a.preco is not null or not public.tenho_area(a.petshop_id, array['agenda']) or not public.acesso_liberado(a.petshop_id) then
    return false;
  end if;
  select * into s from public.servicos x where x.id = a.servico_id and x.petshop_id = a.petshop_id;
  select x.porte into v_porte from public.pets x where x.id = a.pet_id and x.petshop_id = a.petshop_id;
  if s.id is null or v_porte is null then return false; end if;
  v_preco := case v_porte when 'P' then s.preco_p when 'M' then s.preco_m when 'G' then s.preco_g when 'GG' then s.preco_gg end;
  if v_preco is null then return false; end if;
  update public.agendamentos x set preco = v_preco where x.id = a.id and x.preco is null;
  return found;
end $$;
revoke execute on function public.agendamento_preco_da_tabela(uuid) from public, anon;
grant execute on function public.agendamento_preco_da_tabela(uuid) to authenticated;

-- ---------- funções que liam as colunas fechadas como quem chama ----------
-- Mesma assinatura e o mesmo resultado; agora sem ler o preço do horário nem do serviço a mais.
create or replace function public.agendamento_servicos_definir(p_agendamento uuid, p_servicos jsonb) returns integer
language plpgsql set search_path = '' as $$
declare
  v_ag uuid;
  v_petshop uuid;
  v_principal uuid;
  x jsonb;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_preco numeric;
  v_ordem smallint := 0;
begin
  select g.id, g.petshop_id, g.servico_id into v_ag, v_petshop, v_principal from public.agendamentos g where g.id = p_agendamento;
  if v_ag is null then raise exception 'Horário não encontrado.'; end if;
  if p_servicos is not null and jsonb_typeof(p_servicos) <> 'array' then raise exception 'Confira os serviços do horário.'; end if;
  if jsonb_array_length(coalesce(p_servicos, '[]'::jsonb)) > 10 then raise exception 'Um horário aceita até dez serviços a mais.'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_servicos, '[]'::jsonb)) loop
    begin
      v_id := (x ->> 'servico_id')::uuid;
      v_preco := round((x ->> 'preco')::numeric, 2);
    exception when others then raise exception 'Confira os serviços do horário.';
    end;
    if v_id is null then raise exception 'Confira os serviços do horário.'; end if;
    if v_id = v_principal or v_id = any (v_ids) then continue; end if;
    v_ids := v_ids || v_id;
  end loop;
  delete from public.agendamento_servicos s where s.agendamento_id = v_ag and not (s.servico_id = any (v_ids));
  for x in select * from jsonb_array_elements(coalesce(p_servicos, '[]'::jsonb)) loop
    v_id := (x ->> 'servico_id')::uuid;
    if not (v_id = any (v_ids)) then continue; end if;
    v_ids := array_remove(v_ids, v_id);
    v_preco := round((x ->> 'preco')::numeric, 2);
    v_ordem := v_ordem + 1;
    -- a linha que já existe só é regravada (o gatilho do concluído deixa passar quando nada mudou)
    update public.agendamento_servicos s set preco = v_preco, ordem = v_ordem where s.agendamento_id = v_ag and s.servico_id = v_id;
    if not found then
      insert into public.agendamento_servicos (petshop_id, agendamento_id, servico_id, preco, ordem)
        values (v_petshop, v_ag, v_id, v_preco, v_ordem);
    end if;
  end loop;
  return v_ordem;
end $$;

-- Agora como função do banco (copia o preço do último horário da série, que quem chama pode não ver);
-- confere o que as regras da tabela conferiam: da equipe, com a Agenda e com a conta liberada.
create or replace function public.serie_continuar(p_serie uuid, p_depois_de timestamptz, p_vezes integer default 12) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  s public.series_agenda;
  m public.agendamentos;
  v_fuso text;
  v_ultimo timestamptz;
  v_local timestamp;
  v_quando timestamptz;
  v_feitos integer := 0;
  v_voltas integer := 0;
  v_novo uuid;
begin
  select * into s from public.series_agenda where serie_id = p_serie;
  if not found or s.encerrada_em is not null then return 0; end if;
  if not public.tenho_area(s.petshop_id, array['agenda']) or not public.acesso_liberado(s.petshop_id) then return 0; end if;
  perform 1 from public.series_agenda where serie_id = p_serie for update;
  select max(a.inicio) into v_ultimo from public.agendamentos a where a.serie_id = p_serie and a.petshop_id = s.petshop_id;
  if v_ultimo is null or v_ultimo > p_depois_de then return 0; end if;
  select * into m from public.agendamentos a
    where a.serie_id = p_serie and a.petshop_id = s.petshop_id and a.status not in ('cancelado', 'faltou') order by a.inicio desc limit 1;
  if not found then return 0; end if;
  select coalesce(x.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops x where x.id = s.petshop_id;
  -- o dia vem do último horário da série; a hora, do último que está de pé
  v_local := (v_ultimo at time zone v_fuso)::date + (m.inicio at time zone v_fuso)::time;
  while v_feitos < least(greatest(coalesce(p_vezes, 12), 1), 26) and v_voltas < 80 loop
    v_voltas := v_voltas + 1;
    v_local := v_local + make_interval(days => 7 * s.cada_semanas);
    v_quando := v_local at time zone v_fuso;
    continue when v_quando < now();
    insert into public.agendamentos (petshop_id, pet_id, servico_id, profissional_id, inicio, fim, preco, obs, leva_traz, endereco_leva_traz, criado_por, serie_id)
    values (s.petshop_id, m.pet_id, m.servico_id, m.profissional_id, v_quando, v_quando + (m.fim - m.inicio), m.preco, m.obs, m.leva_traz, m.endereco_leva_traz,
      (select auth.uid()), p_serie)
    returning id into v_novo;
    insert into public.agendamento_servicos (petshop_id, agendamento_id, servico_id, preco, ordem)
      select x.petshop_id, v_novo, x.servico_id, x.preco, x.ordem from public.agendamento_servicos x where x.agendamento_id = m.id;
    v_feitos := v_feitos + 1;
  end loop;
  return v_feitos;
end $$;
revoke execute on function public.serie_continuar(uuid, timestamptz, integer) from public, anon;
grant execute on function public.serie_continuar(uuid, timestamptz, integer) to authenticated;

-- Mesma assinatura (as telas só contam quantos são). Agora como função do banco, só para a equipe do pet shop,
-- e com o preço em branco para quem não recebe.
create or replace function public.conflitos_agenda(p_petshop uuid, p_profissional uuid, p_inicio timestamptz, p_fim timestamptz, p_ignorar uuid default null)
returns setof public.agendamentos
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.agendamentos;
  v_vejo boolean;
begin
  if not exists (select 1 from public.meus_petshops() m where m = p_petshop) then return; end if;
  v_vejo := public.tenho_area(p_petshop, array['caixa', 'financeiro', 'relatorios']);
  for r in select * from public.agendamentos
    where petshop_id = p_petshop and profissional_id = p_profissional
      and status not in ('cancelado', 'faltou')
      and inicio < p_fim and fim > p_inicio
      and (p_ignorar is null or id <> p_ignorar)
  loop
    if not v_vejo then r.preco := null; end if;
    return next r;
  end loop;
end $$;
revoke execute on function public.conflitos_agenda(uuid, uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.conflitos_agenda(uuid, uuid, timestamptz, timestamptz, uuid) to authenticated;

-- ---------- link do cliente: todo pedido passa pelo aceite ----------
-- O código novo chama só link_pedir_com_termos (que, sem regras ligadas, chama a função de sempre do mesmo jeito).
-- As funções de sempre seguem existindo para ela; o público não chama mais direto.
revoke execute on function public.link_pedir(text, uuid, date, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.link_pedir_estadia(text, text, date, date, text, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.link_espera_pedir(text, text, date, date, text, text, text, text, text, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
