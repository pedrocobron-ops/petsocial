-- Dinheiro, rodada de correções 3:
--  1. "Não cobrar" fica com quem e quando, aparece no aviso do dono (Alterações em valores) e, com o preço travado,
--     é só com o dono ou com quem vê o financeiro.
--  2. Preço travado vale também para marcar o horário (preço da lista) e para o pacote (usos, validade e serviço do modelo).
--     Sem a trava, horário marcado abaixo da lista e pacote fora do modelo ficam anotados.
--  3. Serviço já feito tirado da conta fica anotado; com a trava, só o dono ou quem vê o financeiro tira.
--  4. Venda já recebida com o valor baixado: anotada como tal (com "abaixo do custo"); com a trava, quem só opera o caixa não baixa.
--  5. "Atendimentos para cobrar" desde o primeiro dia (antes, só depois da primeira conta fechada pelo sistema).
--  6. Fechar o caixa: quantas alterações em valores houve desde que ele abriu (só a contagem, sem valores).
--
-- Só acrescenta (colunas, funções, gatilhos; a checagem de `precos_alterados.tipo` aceita mais tipos). Não depende da 49 nem da 57.
-- O código que está no ar continua funcionando: as funções trocadas têm a mesma assinatura e devolvem as mesmas colunas;
-- os gatilhos novos só recusam o que a trava ligada já prometia recusar (pet shop sem a trava não tem nada recusado a mais).

-- ---------------------------------------------------------------------------------------------------------------------
-- Alterações em valores: tipos novos e o horário de cada uma
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.precos_alterados add column if not exists agendamento_id uuid references public.agendamentos (id) on delete set null;
create index if not exists precos_alterados_agendamento_idx on public.precos_alterados (agendamento_id) where agendamento_id is not null;
alter table public.precos_alterados drop constraint if exists precos_alterados_tipo_check;
alter table public.precos_alterados add constraint precos_alterados_tipo_check
  check (tipo in ('preco', 'desconto', 'sem_cobranca', 'servico_tirado', 'preco_agenda', 'pacote'));

-- Preço da lista de um serviço para o porte do pet (sem porte ou sem preço para o porte: o primeiro preço que houver).
create or replace function public.preco_lista_do_servico(p_petshop uuid, p_servico uuid, p_pet uuid) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.servicos;
  v_porte text;
begin
  if p_servico is null then return null; end if;
  select * into s from public.servicos x where x.id = p_servico and x.petshop_id = p_petshop;
  if not found then return null; end if;
  select x.porte into v_porte from public.pets x where x.id = p_pet and x.petshop_id = p_petshop;
  return coalesce(case v_porte when 'P' then s.preco_p when 'M' then s.preco_m when 'G' then s.preco_g when 'GG' then s.preco_gg end,
    s.preco_p, s.preco_m, s.preco_g, s.preco_gg);
end $$;
revoke execute on function public.preco_lista_do_servico(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.preco_travado(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.opcoes -> 'dinheiro.preco_travado' = 'true'::jsonb from public.petshops s where s.id = p), false)
$$;
revoke execute on function public.preco_travado(uuid) from public, anon, authenticated;

create or replace function public.nome_na_equipe(p uuid) returns text
language sql stable security definer set search_path = '' as $$
  select x.nome from public.profissionais x where x.petshop_id = p and x.user_id = (select auth.uid()) limit 1
$$;
revoke execute on function public.nome_na_equipe(uuid) from public, anon, authenticated;

-- "R$ 75,00"
create or replace function public.em_reais(v numeric) returns text
language sql immutable set search_path = '' as $$
  select 'R$ ' || replace(to_char(coalesce(v, 0), 'FM999999990D00'), '.', ',')
$$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. "Não cobrar": quem, quando, aviso ao dono e a trava
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.agendamentos add column if not exists sem_cobranca_por uuid references auth.users (id) on delete set null;
alter table public.agendamentos add column if not exists sem_cobranca_em timestamptz;
alter table public.agendamentos add column if not exists sem_cobranca_nome text;
-- com a 20261157 a leitura de agendamentos é coluna por coluna (a 57 também libera estas)
grant select (sem_cobranca_por, sem_cobranca_em, sem_cobranca_nome) on public.agendamentos to authenticated;

-- O valor que o atendimento cobraria (o principal fica de fora quando foi pelo pacote).
create or replace function public.valor_do_horario(p_agendamento uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select (case when a.pacote_cliente_id is null then coalesce(a.preco, 0) else 0 end)
    + coalesce((select sum(coalesce(e.preco, 0)) from public.agendamento_servicos e where e.agendamento_id = a.id), 0)
  from public.agendamentos a where a.id = p_agendamento
$$;
revoke execute on function public.valor_do_horario(uuid) from public, anon, authenticated;

create or replace function public.sem_cobranca_quem() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.sem_cobranca is not distinct from old.sem_cobranca then
    new.sem_cobranca_por := old.sem_cobranca_por; new.sem_cobranca_em := old.sem_cobranca_em; new.sem_cobranca_nome := old.sem_cobranca_nome;
    return new;
  end if;
  if not new.sem_cobranca then
    new.sem_cobranca_por := null; new.sem_cobranca_em := null; new.sem_cobranca_nome := null;
    return new;
  end if;
  if (select auth.uid()) is not null and pg_trigger_depth() <= 1 and public.preco_travado(new.petshop_id)
     and not public.cuido_do_financeiro(new.petshop_id) and tg_op = 'UPDATE' and coalesce(public.valor_do_horario(new.id), 0) > 0 then
    raise exception 'Com o preço travado, só o dono ou quem vê o financeiro decide não cobrar um atendimento.';
  end if;
  new.sem_cobranca_por := (select auth.uid());
  new.sem_cobranca_em := now();
  new.sem_cobranca_nome := public.nome_na_equipe(new.petshop_id);
  return new;
end $$;
revoke execute on function public.sem_cobranca_quem() from public, anon, authenticated;
drop trigger if exists sem_cobranca_quem on public.agendamentos;
create trigger sem_cobranca_quem before insert or update on public.agendamentos for each row execute function public.sem_cobranca_quem();

create or replace function public.anotar_sem_cobranca() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_valor numeric;
  v_item text;
begin
  if (select auth.uid()) is null or not new.sem_cobranca or old.sem_cobranca then return null; end if;
  v_valor := coalesce(public.valor_do_horario(new.id), 0);
  if v_valor <= 0 then return null; end if;
  select left(coalesce(p.nome, 'Pet') || ', ' || coalesce(
      (select string_agg(n, ' + ') from (
         select s.nome as n, 0 as o from public.servicos s where s.id = new.servico_id
         union all
         select s.nome, e.ordem from public.agendamento_servicos e join public.servicos s on s.id = e.servico_id where e.agendamento_id = new.id
         order by 2) z), 'atendimento')
      || ' de ' || to_char(new.inicio at time zone coalesce((select x.fuso from public.petshops x where x.id = new.petshop_id), 'America/Sao_Paulo'), 'DD/MM'), 120)
    into v_item
    from public.pets p where p.id = new.pet_id;
  insert into public.precos_alterados (petshop_id, agendamento_id, tipo, item, de, para, quem, quem_nome)
    values (new.petshop_id, new.id, 'sem_cobranca', coalesce(v_item, 'Atendimento'), v_valor, 0, (select auth.uid()), new.sem_cobranca_nome);
  return null;
end $$;
revoke execute on function public.anotar_sem_cobranca() from public, anon, authenticated;
drop trigger if exists anotar_sem_cobranca on public.agendamentos;
create trigger anotar_sem_cobranca after update of sem_cobranca on public.agendamentos for each row execute function public.anotar_sem_cobranca();

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Preço do horário: trava e anotação
-- ---------------------------------------------------------------------------------------------------------------------
-- Vale para quem tem área de dinheiro (Caixa, Financeiro, Relatórios). Quem não tem não escolhe preço (o banco põe o da lista).

create or replace function public.travar_preco_do_horario() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_lista numeric;
  v_pet uuid;
  v_servico uuid;
  v_nome text;
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then return new; end if;
  if tg_op = 'UPDATE' and new.preco is not distinct from old.preco and new.servico_id is not distinct from old.servico_id
     and (to_jsonb(new) ->> 'pet_id') is not distinct from (to_jsonb(old) ->> 'pet_id') then return new; end if;
  if new.preco is null or not public.preco_travado(new.petshop_id) or public.cuido_do_financeiro(new.petshop_id)
     or not public.tenho_area(new.petshop_id, array['caixa', 'financeiro', 'relatorios']) then return new; end if;
  if tg_table_name = 'agendamento_servicos' then
    select a.pet_id into v_pet from public.agendamentos a where a.id = new.agendamento_id;
  else
    v_pet := new.pet_id;
  end if;
  v_servico := new.servico_id;
  v_lista := public.preco_lista_do_servico(new.petshop_id, v_servico, v_pet);
  if v_lista is null or abs(new.preco - v_lista) <= 0.005 then return new; end if;
  select s.nome into v_nome from public.servicos s where s.id = v_servico;
  raise exception 'Com o preço travado, % fica pelo preço da lista: %. Só o dono ou quem vê o financeiro marca com outro valor.',
    coalesce(v_nome, 'o serviço'), public.em_reais(v_lista);
end $$;
revoke execute on function public.travar_preco_do_horario() from public, anon, authenticated;
drop trigger if exists travar_preco_do_horario on public.agendamentos;
create trigger travar_preco_do_horario before insert or update of preco, servico_id, pet_id on public.agendamentos
  for each row execute function public.travar_preco_do_horario();
drop trigger if exists travar_preco_do_horario on public.agendamento_servicos;
create trigger travar_preco_do_horario before insert or update of preco, servico_id on public.agendamento_servicos
  for each row execute function public.travar_preco_do_horario();

-- Marcou abaixo do preço da lista: fica anotado (quem marca com o preço da lista, ou acima, não aparece)
create or replace function public.anotar_preco_do_horario() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_lista numeric;
  v_pet uuid;
  v_ag uuid;
  v_item text;
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 or new.preco is null then return null; end if;
  if tg_op = 'UPDATE' and new.preco is not distinct from old.preco and new.servico_id is not distinct from old.servico_id then return null; end if;
  if not public.tenho_area(new.petshop_id, array['caixa', 'financeiro', 'relatorios']) then return null; end if;
  if tg_table_name = 'agendamento_servicos' then
    v_ag := new.agendamento_id;
  else
    v_ag := new.id;
  end if;
  select a.pet_id into v_pet from public.agendamentos a where a.id = v_ag;
  v_lista := public.preco_lista_do_servico(new.petshop_id, new.servico_id, v_pet);
  if v_lista is null or new.preco >= v_lista - 0.005 then return null; end if;
  select left(coalesce(s.nome, 'Serviço') || ' de ' || coalesce(p.nome, 'pet'), 120) into v_item
    from public.servicos s, public.pets p where s.id = new.servico_id and p.id = v_pet;
  insert into public.precos_alterados (petshop_id, agendamento_id, tipo, item, de, para, quem, quem_nome)
    values (new.petshop_id, v_ag, 'preco_agenda', coalesce(v_item, 'Serviço'), v_lista, new.preco, (select auth.uid()), public.nome_na_equipe(new.petshop_id));
  return null;
end $$;
revoke execute on function public.anotar_preco_do_horario() from public, anon, authenticated;
drop trigger if exists anotar_preco_do_horario on public.agendamentos;
create trigger anotar_preco_do_horario after insert or update of preco, servico_id on public.agendamentos
  for each row execute function public.anotar_preco_do_horario();
drop trigger if exists anotar_preco_do_horario on public.agendamento_servicos;
create trigger anotar_preco_do_horario after insert or update of preco, servico_id on public.agendamento_servicos
  for each row execute function public.anotar_preco_do_horario();

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Serviço já feito tirado da conta
-- ---------------------------------------------------------------------------------------------------------------------
-- "Já feito": horário concluído ou que já começou. Horário marcado para a frente muda à vontade, sem anotação.

create or replace function public.servico_tirado() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a public.agendamentos;
  v_item text;
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 or coalesce(old.preco, 0) <= 0 then
    if tg_op = 'DELETE' then return old; end if;
    return null;
  end if;
  select * into a from public.agendamentos x where x.id = old.agendamento_id;
  if not found or not (a.status = 'concluido' or a.inicio <= now()) or a.status in ('cancelado', 'faltou') then
    if tg_op = 'DELETE' then return old; end if;
    return null;
  end if;
  if tg_when = 'BEFORE' then
    if public.preco_travado(old.petshop_id) and not public.cuido_do_financeiro(old.petshop_id) then
      raise exception 'Com o preço travado, só o dono ou quem vê o financeiro tira da conta um serviço que já foi feito.';
    end if;
    return old;
  end if;
  select left(coalesce(s.nome, 'Serviço') || ' de ' || coalesce(p.nome, 'pet') || ', ' ||
      to_char(a.inicio at time zone coalesce((select x.fuso from public.petshops x where x.id = a.petshop_id), 'America/Sao_Paulo'), 'DD/MM'), 120)
    into v_item from public.servicos s, public.pets p where s.id = old.servico_id and p.id = a.pet_id;
  insert into public.precos_alterados (petshop_id, agendamento_id, tipo, item, de, para, quem, quem_nome)
    values (old.petshop_id, a.id, 'servico_tirado', coalesce(v_item, 'Serviço'), old.preco, 0, (select auth.uid()), public.nome_na_equipe(old.petshop_id));
  return null;
end $$;
revoke execute on function public.servico_tirado() from public, anon, authenticated;
drop trigger if exists servico_tirado_trava on public.agendamento_servicos;
create trigger servico_tirado_trava before delete on public.agendamento_servicos for each row execute function public.servico_tirado();
drop trigger if exists servico_tirado_anota on public.agendamento_servicos;
create trigger servico_tirado_anota after delete on public.agendamento_servicos for each row execute function public.servico_tirado();

-- ---------------------------------------------------------------------------------------------------------------------
-- Pacote: usos, validade e serviço do modelo
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.pacote_fora_do_modelo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m public.pacotes;
  v_dias integer;
  v_partes text[] := '{}';
  v_pet text;
  v_trava boolean;
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then
    if tg_when = 'BEFORE' then return new; end if;
    return null;
  end if;
  if tg_op = 'UPDATE' and new.total is not distinct from old.total and new.vence_em is not distinct from old.vence_em
     and new.servico_id is not distinct from old.servico_id then
    if tg_when = 'BEFORE' then return new; end if;
    return null;
  end if;
  if not public.tenho_area(new.petshop_id, array['caixa', 'financeiro', 'relatorios', 'pacotes']) then
    if tg_when = 'BEFORE' then return new; end if;
    return null;
  end if;
  if tg_op = 'INSERT' then
    if new.pacote_id is null then
      if tg_when = 'BEFORE' then return new; end if;
      return null;
    end if;
    select * into m from public.pacotes x where x.id = new.pacote_id and x.petshop_id = new.petshop_id;
    if not found then
      if tg_when = 'BEFORE' then return new; end if;
      return null;
    end if;
    v_dias := case when new.vence_em is null then null else new.vence_em - new.comprado_em end;
    if new.total <> m.quantidade then v_partes := v_partes || (new.total || ' usos (o modelo tem ' || m.quantidade || ')'); end if;
    if v_dias is null or v_dias > m.validade_dias then
      v_partes := v_partes || (case when v_dias is null then 'sem validade' else 'validade de ' || v_dias || ' dias' end || ' (o modelo tem ' || m.validade_dias || ' dias)');
    end if;
    if new.servico_id is distinct from m.servico_id then v_partes := v_partes || 'outro serviço'::text; end if;
  else
    if new.total > old.total then v_partes := v_partes || ('usos de ' || old.total || ' para ' || new.total); end if;
    if old.vence_em is not null and (new.vence_em is null or new.vence_em > old.vence_em) then
      v_partes := v_partes || ('validade de ' || to_char(old.vence_em, 'DD/MM/YYYY') || ' para ' || coalesce(to_char(new.vence_em, 'DD/MM/YYYY'), 'sem validade'));
    end if;
    if new.servico_id is distinct from old.servico_id then v_partes := v_partes || 'outro serviço'::text; end if;
  end if;
  if cardinality(v_partes) = 0 then
    if tg_when = 'BEFORE' then return new; end if;
    return null;
  end if;
  if tg_when = 'BEFORE' then
    v_trava := public.preco_travado(new.petshop_id) and not public.cuido_do_financeiro(new.petshop_id);
    if v_trava then
      if tg_op = 'INSERT' then
        raise exception 'Com o preço travado, o pacote sai como o modelo: % usos e validade de % dias. Só o dono ou quem vê o financeiro muda.', m.quantidade, m.validade_dias;
      end if;
      raise exception 'Com o preço travado, só o dono ou quem vê o financeiro aumenta os usos ou a validade de um pacote.';
    end if;
    return new;
  end if;
  select p.nome into v_pet from public.pets p where p.id = new.pet_id;
  insert into public.precos_alterados (petshop_id, pacote_cliente_id, tipo, item, de, para, quem, quem_nome)
    values (new.petshop_id, new.id, 'pacote',
      left('Pacote ' || new.nome || ' de ' || coalesce(v_pet, 'pet') || ': ' || array_to_string(v_partes, ', '), 200),
      null, new.preco, (select auth.uid()), public.nome_na_equipe(new.petshop_id));
  return null;
end $$;
revoke execute on function public.pacote_fora_do_modelo() from public, anon, authenticated;
drop trigger if exists pacote_fora_do_modelo_trava on public.pacotes_clientes;
create trigger pacote_fora_do_modelo_trava before insert or update of total, vence_em, servico_id on public.pacotes_clientes
  for each row execute function public.pacote_fora_do_modelo();
drop trigger if exists pacote_fora_do_modelo_anota on public.pacotes_clientes;
create trigger pacote_fora_do_modelo_anota after insert or update of total, vence_em, servico_id on public.pacotes_clientes
  for each row execute function public.pacote_fora_do_modelo();

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Venda já recebida com o valor baixado
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.travar_valor_da_venda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then return new; end if;
  if coalesce(current_setting('maestro.recebimento', true), '') = '1' or coalesce(current_setting('maestro.creche', true), '') = '1' then return new; end if;
  if not old.pago or old.tipo <> 'entrada' or old.movimento is not null or old.conta_id is not null then return new; end if;
  if old.itens is null and old.agendamento_id is null then return new; end if;
  if new.valor >= old.valor - 0.005 then return new; end if;
  if public.preco_travado(old.petshop_id) and not public.cuido_do_financeiro(old.petshop_id) then
    raise exception 'Com o preço travado, só o dono ou quem vê o financeiro baixa o valor de uma venda já recebida.';
  end if;
  return new;
end $$;
revoke execute on function public.travar_valor_da_venda() from public, anon, authenticated;
drop trigger if exists travar_valor_da_venda on public.lancamentos;
create trigger travar_valor_da_venda before update of valor on public.lancamentos for each row execute function public.travar_valor_da_venda();

-- Mesmas colunas de antes. Novidades: tipos novos de `precos_alterados` passam como estão; valor de venda baixado vira
-- `alterou_venda`, com `abaixo_do_custo` quando o novo valor fica abaixo do custo dos produtos da venda.
create or replace function public.alteracoes_de_valores(p uuid, p_todas boolean default false)
returns table (id uuid, tipo text, quando timestamptz, quem_nome text, descricao text, de numeric, para numeric, abaixo_do_custo boolean, nova boolean)
language sql stable security definer set search_path = '' as $$
  with eu as (
    select (select auth.uid()) as uid,
      coalesce((select v.visto_em from public.alteracoes_vistas v where v.petshop_id = p and v.user_id = (select auth.uid())),
        (select s.criado_em from public.petshops s where s.id = p)) as visto
  ), bruto as (
    select a.id, a.acao, a.quando, a.quem, a.quem_nome, l.itens, l.agendamento_id, l.categoria,
      coalesce(nullif(btrim(coalesce(l.descricao, a.antes ->> 'descricao')), ''), l.categoria, a.antes ->> 'categoria', 'Lançamento') as descricao,
      case when a.acao = 'apagou' then (a.antes ->> 'valor')::numeric when a.antes ? 'valor' then (a.antes ->> 'valor')::numeric else l.valor end as de,
      case when a.acao = 'apagou' then null when a.depois ? 'valor' then (a.depois ->> 'valor')::numeric else l.valor end as para
    from public.lancamentos_alteracoes a
    left join public.lancamentos l on l.id = a.lancamento_id
    where a.petshop_id = p and a.quando >= now() - interval '60 days'
      and (a.acao = 'apagou' or a.antes ?| array['valor', 'forma', 'pagamentos', 'data', 'tipo'])
      -- baixa de uma conta a pagar ou desfazer de recebimento não é "valor recebido alterado"
      and coalesce((a.antes ->> 'pago')::boolean, true)
  ), tudo as (
    select b.id,
      case when b.acao = 'apagou' then 'apagou'
           when b.de is not null and b.para is not null and b.para < b.de - 0.005 and (b.itens is not null or b.agendamento_id is not null) then 'alterou_venda'
           else 'alterou' end as tipo,
      b.quando, b.quem, b.quem_nome, b.descricao, b.de, b.para,
      coalesce(b.acao <> 'apagou' and b.para is not null and jsonb_typeof(b.itens) = 'array' and b.para < (
        select sum(case when jsonb_typeof(i -> 'qtd') = 'number' then (i ->> 'qtd')::numeric else 1 end * x.custo)
        from jsonb_array_elements(b.itens) i
        join public.produtos x on x.petshop_id = p and i ->> 'tipo' = 'produto' and (i ->> 'produto_id') ~ '^[0-9a-fA-F-]{36}$' and x.id = (i ->> 'produto_id')::uuid
        where x.custo > 0) - 0.005, false) as abaixo_do_custo
    from bruto b
    union all
    select x.id, x.tipo, x.quando, x.quem, x.quem_nome, x.item, x.de, x.para, x.abaixo_do_custo
    from public.precos_alterados x
    where x.petshop_id = p and x.quando >= now() - interval '60 days'
  )
  select t.id, t.tipo, t.quando, t.quem_nome, t.descricao, t.de, t.para, t.abaixo_do_custo, t.quando > eu.visto
  from tudo t, eu
  where (select public.cuido_do_financeiro(p)) and t.quem is distinct from eu.uid and (p_todas or t.quando > eu.visto)
  order by t.quando desc
  limit 200
$$;
revoke execute on function public.alteracoes_de_valores(uuid, boolean) from public, anon;
grant execute on function public.alteracoes_de_valores(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Atendimentos para cobrar desde o primeiro dia
-- ---------------------------------------------------------------------------------------------------------------------
-- Antes: só para quem já tinha fechado uma conta de atendimento pelo sistema. Agora também para o pet shop novo
-- (até 60 dias de conta), para quem usa o Caixa (já abriu um caixa) e para quem tem alguém da equipe com Caixa.
-- Pet shop antigo que só marca "concluído" e nunca usou caixa nem conta segue sem a lista, como antes.

create or replace function public.agendamentos_para_cobrar(p uuid, p_de date default null, p_ate date default null)
returns table (id uuid, inicio timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.inicio
  from public.petshops s
  join public.agendamentos a on a.petshop_id = s.id
  where s.id = p
    and (select public.tenho_area(p, array['agenda', 'caixa', 'financeiro', 'relatorios']))
    and (s.criado_em >= now() - interval '60 days'
      or exists (select 1 from public.lancamentos u where u.petshop_id = p and u.agendamento_id is not null and u.tipo = 'entrada')
      or exists (select 1 from public.caixas c where c.petshop_id = p)
      or exists (select 1 from public.profissionais x where x.petshop_id = p and x.ativo and x.papel <> 'dono' and 'caixa' = any (coalesce(x.acessos, '{}'))))
    and a.status = 'concluido' and not a.sem_cobranca
    and a.inicio >= (coalesce(p_de, (now() at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date - 45)::timestamp at time zone coalesce(s.fuso, 'America/Sao_Paulo'))
    and a.inicio < ((coalesce(p_ate, (now() at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date) + 1)::timestamp at time zone coalesce(s.fuso, 'America/Sao_Paulo'))
    and not exists (select 1 from public.lancamentos l where l.agendamento_id = a.id and l.tipo = 'entrada')
    and (case when a.pacote_cliente_id is null then coalesce(a.preco, 0) else 0 end
       + coalesce((select sum(coalesce(e.preco, 0)) from public.agendamento_servicos e where e.agendamento_id = a.id), 0)) > 0
  order by a.inicio
$$;
revoke execute on function public.agendamentos_para_cobrar(uuid, date, date) from public, anon;
grant execute on function public.agendamentos_para_cobrar(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. Fechar o caixa: quantas alterações em valores desde que ele abriu (sem valores: quem só opera o caixa também vê)
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.caixa_alteracoes(p_caixa uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select case when not (select public.tenho_area(c.petshop_id, array['caixa', 'financeiro', 'relatorios'])) then 0 else (
      (select count(*) from public.lancamentos_alteracoes a
        where a.petshop_id = c.petshop_id and a.quando >= c.aberto_em and a.quando <= coalesce(c.fechado_em, now())
          and (a.acao = 'apagou' or a.antes ?| array['valor', 'forma', 'pagamentos', 'data', 'tipo'])
          and coalesce((a.antes ->> 'pago')::boolean, true))
      + (select count(*) from public.precos_alterados x
        where x.petshop_id = c.petshop_id and x.quando >= c.aberto_em and x.quando <= coalesce(c.fechado_em, now()))
    )::integer end
  from public.caixas c where c.id = p_caixa
$$;
revoke execute on function public.caixa_alteracoes(uuid) from public, anon;
grant execute on function public.caixa_alteracoes(uuid) to authenticated;
