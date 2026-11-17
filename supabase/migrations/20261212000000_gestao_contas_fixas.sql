-- =====================================================================================================================
-- Contas fixas (aluguel, luz, água, internet, salários, contador, sistema…) no Financeiro
-- =====================================================================================================================
-- O pet shop cadastra uma vez as contas que se repetem e o sistema põe a conta do mês em "A pagar" sozinho, 10 dias antes
-- do vencimento (contas_fixas_antecedencia). Quem vê e mexe: só o dono e quem cuida do financeiro (cuido_do_financeiro).
--
-- Objetos novos
--   · contas_fixas: nome, categoria (as de saída), dia do vencimento (1 a 31; em mês mais curto, o último dia), valor, se o
--     valor é fixo ou varia (estimado), de quanto em quanto tempo (mensal, trimestral, semestral, anual, com o mês da
--     primeira), começa em, termina em (se quiser), ativa (pausar), forma (só anotação: Pix, boleto, débito automático…).
--     Leitura: quem cuida do financeiro. Gravação: só pelas funções contas_fixas_salvar e contas_fixas_apagar.
--   · contas_fixas_puladas: o mês de uma conta fixa que alguém excluiu de A pagar. Não volta a ser criado.
--   · lancamentos ganha conta_fixa_id + competencia (o mês, dia 1) e valor_estimado. Uma conta por conta fixa por mês
--     (índice único). Só o sistema liga um lançamento a uma conta fixa (gatilho lancamentos_conta_fixa_conferir).
--     valor_estimado sai sozinho quando o valor muda ou a conta é paga. Mudar o valor de uma conta segue as regras de
--     sempre de lancamentos_alteracoes (anotar_alteracao: depois de paga, fica anotado quem mudou e o valor de antes).
--   · contas_fixas_gerar(p): cria as contas que vencem em até 10 dias (e as que ficaram para trás, até 12 meses), uma por
--     mês, sem repetir e sem refazer as excluídas. Nunca antes do "começa em" nem antes do mês em que a conta fixa foi
--     cadastrada; nunca depois do "termina em"; conta pausada não gera. A tela chama ao abrir Financeiro, Hoje e o Bom dia;
--     a faxina diária (gestao_faxina_banco) chama para todos os pet shops (contas_fixas_gerar_todas).
--   · contas_fixas_valor(p, conta, mês, valor): "a luz deste mês veio R$ 380" (Mozart): acerta o valor da conta do mês
--     (cria a do mês se ainda não foi criada). Conta já paga não muda por aqui.
--   · contas_fixas_resumo(p): quanto custa manter o pet shop por mês (as não mensais divididas pelos meses) e quanto já
--     entrou no mês (o faturamento de lucro_do_periodo, a mesma regra de Relatórios).
--   · contas_fixas_do_periodo(p, de, até): as saídas pagas do período separadas em "Contas fixas" e as outras categorias,
--     e por mês. Os totais são os mesmos de lucro_do_periodo e indicadores_do_periodo (que NÃO mudam): é só a separação.
--
-- Funções trocadas (cópia da versão mais nova + acréscimos):
--   · gestao_bom_dia (20261201): + "contas_fixas" (vencidas, de hoje e de amanhã), só para quem cuida do financeiro e vê o
--     dinheiro.
--   · gestao_faxina_banco (20261210): + contas_fixas_gerar_todas().
-- =====================================================================================================================

-- quantos dias antes do vencimento a conta do mês entra em A pagar (o mesmo número em src/lib/gestao/contas-fixas.ts)
create or replace function public.contas_fixas_antecedencia() returns integer
language sql immutable set search_path = '' as $$ select 10 $$;
grant execute on function public.contas_fixas_antecedencia() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.contas_fixas (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 1 and 60),
  categoria text not null default 'Outros' check (char_length(btrim(categoria)) between 1 and 60),
  dia smallint not null check (dia between 1 and 31),
  valor numeric(10, 2) not null check (valor > 0 and valor < 100000000),
  valor_varia boolean not null default false,
  frequencia text not null default 'mensal' check (frequencia in ('mensal', 'trimestral', 'semestral', 'anual')),
  mes_inicial smallint not null default 1 check (mes_inicial between 1 and 12),
  comeca_em date not null default current_date,
  termina_em date check (termina_em is null or termina_em >= comeca_em),
  ativa boolean not null default true,
  forma text check (forma is null or char_length(forma) <= 60),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id) on delete set null,
  atualizado_em timestamptz not null default now(),
  unique (id, petshop_id)
);
create index if not exists contas_fixas_petshop_idx on public.contas_fixas (petshop_id);
alter table public.contas_fixas enable row level security;
revoke all on public.contas_fixas from public, anon, authenticated;
grant select on public.contas_fixas to authenticated;
drop policy if exists contas_fixas_ler on public.contas_fixas;
create policy contas_fixas_ler on public.contas_fixas for select to authenticated
  using (petshop_id in (select public.petshops_do_financeiro()));

create table if not exists public.contas_fixas_puladas (
  conta_fixa_id uuid not null,
  petshop_id uuid not null,
  competencia date not null check (competencia = date_trunc('month', competencia::timestamp)::date),
  criado_em timestamptz not null default now(),
  primary key (conta_fixa_id, competencia),
  foreign key (conta_fixa_id, petshop_id) references public.contas_fixas (id, petshop_id) on delete cascade
);
create index if not exists contas_fixas_puladas_petshop_idx on public.contas_fixas_puladas (petshop_id);
alter table public.contas_fixas_puladas enable row level security;
revoke all on public.contas_fixas_puladas from public, anon, authenticated;
grant select on public.contas_fixas_puladas to authenticated;
drop policy if exists contas_fixas_puladas_ler on public.contas_fixas_puladas;
create policy contas_fixas_puladas_ler on public.contas_fixas_puladas for select to authenticated
  using (petshop_id in (select public.petshops_do_financeiro()));

-- a ligação do lançamento com a conta fixa (as regras de leitura de lancamentos continuam as mesmas: a conta a pagar
-- só é lida por quem cuida do financeiro)
alter table public.lancamentos add column if not exists conta_fixa_id uuid;
alter table public.lancamentos add column if not exists competencia date;
alter table public.lancamentos add column if not exists valor_estimado boolean not null default false;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'lancamentos_conta_fixa_fkey') then
    alter table public.lancamentos add constraint lancamentos_conta_fixa_fkey foreign key (conta_fixa_id, petshop_id)
      references public.contas_fixas (id, petshop_id) on delete set null (conta_fixa_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lancamentos_competencia_check') then
    alter table public.lancamentos add constraint lancamentos_competencia_check
      check (competencia is null or (tipo = 'saida' and competencia = date_trunc('month', competencia::timestamp)::date));
  end if;
end $$;
create unique index if not exists lancamentos_conta_fixa_mes_uniq on public.lancamentos (conta_fixa_id, competencia) where conta_fixa_id is not null;
-- as colunas novas seguem as permissões de tabela de lancamentos (já dadas a authenticated); o gatilho abaixo não deixa
-- ninguém ligar ou desligar um lançamento de uma conta fixa pela API
grant select (conta_fixa_id, competencia, valor_estimado) on public.lancamentos to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Gatilhos em lancamentos
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.lancamentos_conta_fixa_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_banco boolean := coalesce(current_setting('maestro.conta_fixa', true), '') = '1' or pg_trigger_depth() > 1 or (select auth.uid()) is null;
begin
  if not v_banco then
    if tg_op = 'INSERT' then
      if new.conta_fixa_id is not null or new.competencia is not null then
        raise exception 'As contas fixas entram em A pagar sozinhas. Cadastre em Financeiro, Contas fixas.';
      end if;
      new.valor_estimado := false;
    else
      if new.conta_fixa_id is distinct from old.conta_fixa_id or new.competencia is distinct from old.competencia then
        raise exception 'Este lançamento é de uma conta fixa e continua ligado a ela.';
      end if;
      if new.valor_estimado and not old.valor_estimado then new.valor_estimado := false; end if;
    end if;
  end if;
  -- o "valor estimado" acaba quando a pessoa escreve o valor da conta ou paga
  if tg_op = 'UPDATE' and old.valor_estimado and (new.valor is distinct from old.valor or (new.pago and not old.pago)) then
    new.valor_estimado := false;
  end if;
  return new;
end $$;
revoke execute on function public.lancamentos_conta_fixa_conferir() from public, anon, authenticated;
drop trigger if exists lancamentos_conta_fixa_conferir on public.lancamentos;
create trigger lancamentos_conta_fixa_conferir before insert or update on public.lancamentos
  for each row execute function public.lancamentos_conta_fixa_conferir();

-- excluiu a conta do mês de A pagar: aquele mês não volta a ser criado
create or replace function public.lancamentos_conta_fixa_pulada() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.conta_fixa_id is not null and old.competencia is not null then
    insert into public.contas_fixas_puladas (conta_fixa_id, petshop_id, competencia)
    select old.conta_fixa_id, old.petshop_id, old.competencia
     where exists (select 1 from public.contas_fixas c where c.id = old.conta_fixa_id and c.petshop_id = old.petshop_id)
    on conflict do nothing;
  end if;
  return null;
end $$;
revoke execute on function public.lancamentos_conta_fixa_pulada() from public, anon, authenticated;
drop trigger if exists lancamentos_conta_fixa_pulada on public.lancamentos;
create trigger lancamentos_conta_fixa_pulada after delete on public.lancamentos
  for each row when (old.conta_fixa_id is not null) execute function public.lancamentos_conta_fixa_pulada();

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. As contas de cada mês
-- ---------------------------------------------------------------------------------------------------------------------
-- de quantos em quantos meses
create or replace function public.contas_fixas_passo(p_frequencia text) returns integer
language sql immutable set search_path = '' as $$
  select case p_frequencia when 'mensal' then 1 when 'trimestral' then 3 when 'semestral' then 6 else 12 end
$$;
grant execute on function public.contas_fixas_passo(text) to authenticated;

-- o vencimento da conta no mês (dia 31 em fevereiro: o último dia do mês)
create or replace function public.contas_fixas_vencimento(p_mes date, p_dia integer) returns date
language sql immutable set search_path = '' as $$
  select make_date(extract(year from p_mes)::int, extract(month from p_mes)::int,
    least(p_dia, extract(day from (date_trunc('month', p_mes::timestamp) + interval '1 month' - interval '1 day'))::int))
$$;
grant execute on function public.contas_fixas_vencimento(date, integer) to authenticated;

-- O trabalho (sem conferir quem chama: só as funções abaixo e a faxina usam). p_hoje: para os testes.
create or replace function public.contas_fixas_gerar_interno(p uuid, p_hoje date default null) returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_fuso text;
  v_hoje date;
  v_ate date;
  v_n integer;
begin
  if p is null then return 0; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p;
  if not found then return 0; end if;
  v_hoje := coalesce(p_hoje, (now() at time zone v_fuso)::date);
  v_ate := v_hoje + public.contas_fixas_antecedencia();
  -- dois pedidos ao mesmo tempo (Hoje e Bom dia abrem juntos): um espera o outro
  perform pg_advisory_xact_lock(hashtextextended('contas_fixas_gerar:' || p::text, 0));
  perform set_config('maestro.conta_fixa', '1', true);
  insert into public.lancamentos (petshop_id, tipo, valor, categoria, descricao, data, vencimento, pago, forma, origem, chave,
                                  conta_fixa_id, competencia, valor_estimado)
  select c.petshop_id, 'saida', c.valor, c.categoria, c.nome, x.venc, x.venc, false, null, 'sistema',
         'conta-fixa:' || c.id::text || ':' || to_char(x.comp, 'YYYY-MM'), c.id, x.comp, c.valor_varia
    from public.contas_fixas c
    cross join lateral (
      select m::date as comp, public.contas_fixas_vencimento(m::date, c.dia) as venc
        from generate_series(
               greatest(date_trunc('month', greatest(c.comeca_em, (c.criado_em at time zone v_fuso)::date)::timestamp),
                        date_trunc('month', v_hoje::timestamp) - interval '12 months'),
               date_trunc('month', v_ate::timestamp), interval '1 month') m
       where mod(mod(extract(month from m)::int - c.mes_inicial, public.contas_fixas_passo(c.frequencia)) + public.contas_fixas_passo(c.frequencia),
                 public.contas_fixas_passo(c.frequencia)) = 0
    ) x
   where c.petshop_id = p and c.ativa
     and x.venc >= c.comeca_em and x.venc <= v_ate
     and (c.termina_em is null or x.venc <= c.termina_em)
     and not exists (select 1 from public.contas_fixas_puladas k where k.conta_fixa_id = c.id and k.competencia = x.comp)
     and not exists (select 1 from public.lancamentos l where l.conta_fixa_id = c.id and l.competencia = x.comp)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  perform set_config('maestro.conta_fixa', '', true);
  return v_n;
end $$;
revoke execute on function public.contas_fixas_gerar_interno(uuid, date) from public, anon, authenticated;

-- A tela chama ao abrir Financeiro, Hoje e o Bom dia. Quem não cuida do financeiro (ou pet shop com a assinatura parada):
-- não faz nada e devolve 0.
create or replace function public.contas_fixas_gerar(p uuid) returns integer
language plpgsql volatile security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or p is null or not public.cuido_do_financeiro(p) or not public.acesso_liberado(p) then return 0; end if;
  return public.contas_fixas_gerar_interno(p, null);
end $$;
revoke execute on function public.contas_fixas_gerar(uuid) from public, anon;
grant execute on function public.contas_fixas_gerar(uuid) to authenticated;

-- A faxina diária: todos os pet shops com conta fixa ativa e a assinatura em dia. Um pet shop com problema não para os outros.
create or replace function public.contas_fixas_gerar_todas() returns integer
language plpgsql volatile security definer set search_path = '' as $$
declare v_total integer := 0; v_p uuid;
begin
  for v_p in select distinct c.petshop_id from public.contas_fixas c where c.ativa loop
    if not public.acesso_liberado(v_p) then continue; end if;
    begin
      v_total := v_total + public.contas_fixas_gerar_interno(v_p, null);
    exception when others then
      raise warning 'contas fixas de %: %', v_p, sqlerrm;
    end;
  end loop;
  return v_total;
end $$;
revoke execute on function public.contas_fixas_gerar_todas() from public, anon, authenticated;
grant execute on function public.contas_fixas_gerar_todas() to service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Cadastrar, mudar e apagar
-- ---------------------------------------------------------------------------------------------------------------------
-- p_conta: { id?, nome, categoria, dia, valor, valor_varia, frequencia, mes_inicial?, comeca_em?, termina_em?, ativa?, forma? }
-- Com id (a tela manda um id novo para uma conta nova): se já existe neste pet shop, muda; se não, cria com esse id.
-- O mesmo pedido duas vezes (toque duplo) dá o mesmo resultado. Depois de salvar, já cria a conta do mês se ela vence em
-- até 10 dias. Devolve { id, gerados }.
create or replace function public.contas_fixas_salvar(p uuid, p_conta jsonb) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_id uuid;
  v_nome text := btrim(coalesce(p_conta ->> 'nome', ''));
  v_cat text := btrim(coalesce(p_conta ->> 'categoria', ''));
  v_dia integer;
  v_valor numeric;
  v_varia boolean := coalesce((p_conta ->> 'valor_varia')::boolean, false);
  v_freq text := coalesce(nullif(p_conta ->> 'frequencia', ''), 'mensal');
  v_mes integer;
  v_comeca date;
  v_termina date;
  v_ativa boolean := coalesce((p_conta ->> 'ativa')::boolean, true);
  v_forma text := nullif(btrim(coalesce(p_conta ->> 'forma', '')), '');
  v_fuso text;
  v_hoje date;
  v_antes public.contas_fixas;
  v_gerados integer;
begin
  if (select auth.uid()) is null or p is null or not public.cuido_do_financeiro(p) then
    raise exception 'As contas fixas são do dono e de quem cuida do financeiro.' using errcode = '42501';
  end if;
  if not public.acesso_liberado(p) then
    raise exception 'A assinatura deste pet shop está parada: dá para ver, mas não para mudar.' using errcode = '42501';
  end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p;
  v_hoje := (now() at time zone v_fuso)::date;
  begin
    v_id := nullif(p_conta ->> 'id', '')::uuid;
    v_dia := (p_conta ->> 'dia')::integer;
    v_valor := round((p_conta ->> 'valor')::numeric, 2);
    v_mes := nullif(p_conta ->> 'mes_inicial', '')::integer;
    v_comeca := nullif(p_conta ->> 'comeca_em', '')::date;
    v_termina := nullif(p_conta ->> 'termina_em', '')::date;
  exception when others then
    raise exception 'Confira o dia, o valor e as datas da conta fixa.';
  end;
  if v_nome = '' then raise exception 'Escreva o nome da conta (ex.: Aluguel).'; end if;
  if char_length(v_nome) > 60 then raise exception 'O nome da conta pode ter até 60 letras.'; end if;
  if v_cat = '' then v_cat := 'Outros'; end if;
  if char_length(v_cat) > 60 then raise exception 'Escolha uma categoria da lista.'; end if;
  if v_cat in ('Devolução', 'Devolução de sinal') then raise exception 'Devolução não é conta fixa: escolha outra categoria.'; end if;
  if v_dia is null or v_dia < 1 or v_dia > 31 then raise exception 'O dia do vencimento vai de 1 a 31.'; end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Escreva o valor da conta.'; end if;
  if v_valor >= 100000000 then raise exception 'Esse valor é grande demais.'; end if;
  if v_freq not in ('mensal', 'trimestral', 'semestral', 'anual') then raise exception 'Escolha de quanto em quanto tempo a conta vence.'; end if;
  if v_forma is not null and char_length(v_forma) > 60 then raise exception 'A forma de pagamento pode ter até 60 letras.'; end if;

  select * into v_antes from public.contas_fixas c where c.id = v_id for update;
  if found and v_antes.petshop_id <> p then raise exception 'Conta fixa não encontrada. Atualize a tela.'; end if;
  v_comeca := coalesce(v_comeca, v_antes.comeca_em, v_hoje);
  if v_termina is not null and v_termina < v_comeca then raise exception 'O fim não pode ser antes do começo.'; end if;
  v_mes := coalesce(v_mes, v_antes.mes_inicial::integer, extract(month from v_comeca)::integer);
  if v_mes < 1 or v_mes > 12 then raise exception 'Escolha o mês da primeira conta.'; end if;
  if v_freq = 'mensal' then v_mes := 1; end if;

  if v_antes.id is null then
    insert into public.contas_fixas (id, petshop_id, nome, categoria, dia, valor, valor_varia, frequencia, mes_inicial, comeca_em, termina_em, ativa, forma, criado_por)
    values (coalesce(v_id, gen_random_uuid()), p, v_nome, v_cat, v_dia, v_valor, v_varia, v_freq, v_mes, v_comeca, v_termina, v_ativa, v_forma, (select auth.uid()))
    returning id into v_id;
  else
    update public.contas_fixas c
       set nome = v_nome, categoria = v_cat, dia = v_dia, valor = v_valor, valor_varia = v_varia, frequencia = v_freq, mes_inicial = v_mes,
           comeca_em = v_comeca, termina_em = v_termina, ativa = v_ativa, forma = v_forma, atualizado_em = now()
     where c.id = v_id;
  end if;
  v_gerados := public.contas_fixas_gerar_interno(p, null);
  return jsonb_build_object('id', v_id, 'gerados', v_gerados);
end $$;
revoke execute on function public.contas_fixas_salvar(uuid, jsonb) from public, anon;
grant execute on function public.contas_fixas_salvar(uuid, jsonb) to authenticated;

-- Apaga a conta fixa. As contas que ela já pôs em A pagar (e as pagas) continuam lá, como contas comuns.
create or replace function public.contas_fixas_apagar(p uuid, p_id uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_n integer;
begin
  if (select auth.uid()) is null or p is null or not public.cuido_do_financeiro(p) then
    raise exception 'As contas fixas são do dono e de quem cuida do financeiro.' using errcode = '42501';
  end if;
  if not public.acesso_liberado(p) then
    raise exception 'A assinatura deste pet shop está parada: dá para ver, mas não para mudar.' using errcode = '42501';
  end if;
  perform set_config('maestro.conta_fixa', '1', true);
  delete from public.contas_fixas c where c.id = p_id and c.petshop_id = p;
  get diagnostics v_n = row_count;
  perform set_config('maestro.conta_fixa', '', true);
  return v_n > 0;
end $$;
revoke execute on function public.contas_fixas_apagar(uuid, uuid) from public, anon;
grant execute on function public.contas_fixas_apagar(uuid, uuid) to authenticated;

-- "A luz deste mês veio R$ 380": o valor da conta de um mês (p_mes: qualquer dia do mês). Cria a conta do mês se ela
-- ainda não entrou em A pagar (mesmas regras: começo, fim, mês da repetição, pausada, excluída). Conta paga não muda.
create or replace function public.contas_fixas_valor(p uuid, p_conta uuid, p_mes date, p_valor numeric) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c public.contas_fixas;
  l public.lancamentos;
  v_comp date;
  v_venc date;
  v_valor numeric := round(p_valor, 2);
  v_antes numeric;
  v_criada boolean := false;
begin
  if (select auth.uid()) is null or p is null or not public.cuido_do_financeiro(p) then
    raise exception 'As contas fixas são do dono e de quem cuida do financeiro.' using errcode = '42501';
  end if;
  if not public.acesso_liberado(p) then
    raise exception 'A assinatura deste pet shop está parada: dá para ver, mas não para mudar.' using errcode = '42501';
  end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Escreva o valor da conta.'; end if;
  if v_valor >= 100000000 then raise exception 'Esse valor é grande demais.'; end if;
  if p_mes is null then raise exception 'Diga de qual mês é a conta.'; end if;
  select * into c from public.contas_fixas x where x.id = p_conta and x.petshop_id = p;
  if not found then raise exception 'Conta fixa não encontrada.'; end if;
  v_comp := date_trunc('month', p_mes::timestamp)::date;
  v_venc := public.contas_fixas_vencimento(v_comp, c.dia);
  perform pg_advisory_xact_lock(hashtextextended('contas_fixas_gerar:' || p::text, 0));
  select * into l from public.lancamentos x where x.conta_fixa_id = c.id and x.competencia = v_comp for update;
  if found then
    if l.pago then raise exception 'A conta de % de % já foi paga. Para corrigir, abra o lançamento em Financeiro.', c.nome, to_char(v_comp, 'MM/YYYY'); end if;
    v_antes := l.valor;
    update public.lancamentos x set valor = v_valor, valor_estimado = false where x.id = l.id;
  else
    if mod(mod(extract(month from v_comp)::int - c.mes_inicial, public.contas_fixas_passo(c.frequencia)) + public.contas_fixas_passo(c.frequencia), public.contas_fixas_passo(c.frequencia)) <> 0
       or v_venc < c.comeca_em or (c.termina_em is not null and v_venc > c.termina_em) then
      raise exception '% não tem conta em %.', c.nome, to_char(v_comp, 'MM/YYYY');
    end if;
    if not c.ativa then raise exception '% está pausada. Ligue de novo em Financeiro, Contas fixas.', c.nome; end if;
    if exists (select 1 from public.contas_fixas_puladas k where k.conta_fixa_id = c.id and k.competencia = v_comp) then
      raise exception 'A conta de % de % foi excluída de A pagar. Se precisar, anote de novo em Financeiro, A pagar.', c.nome, to_char(v_comp, 'MM/YYYY');
    end if;
    perform set_config('maestro.conta_fixa', '1', true);
    insert into public.lancamentos (petshop_id, tipo, valor, categoria, descricao, data, vencimento, pago, origem, chave, conta_fixa_id, competencia, valor_estimado)
    values (p, 'saida', v_valor, c.categoria, c.nome, v_venc, v_venc, false, 'sistema', 'conta-fixa:' || c.id::text || ':' || to_char(v_comp, 'YYYY-MM'), c.id, v_comp, false)
    returning * into l;
    perform set_config('maestro.conta_fixa', '', true);
    v_criada := true;
  end if;
  return jsonb_build_object('lancamento_id', l.id, 'nome', c.nome, 'competencia', v_comp, 'vencimento', v_venc, 'valor', v_valor, 'antes', v_antes, 'criada', v_criada);
end $$;
revoke execute on function public.contas_fixas_valor(uuid, uuid, date, numeric) from public, anon;
grant execute on function public.contas_fixas_valor(uuid, uuid, date, numeric) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Quanto custa manter o pet shop
-- ---------------------------------------------------------------------------------------------------------------------
-- total_mensal: as contas fixas ativas (sem as que já terminaram e as que só começam depois deste mês), as não mensais
-- divididas pelos meses (trimestral ÷ 3, semestral ÷ 6, anual ÷ 12), arredondado no centavo no fim.
-- faturamento_mes: do dia 1 até hoje, o "faturamento" de lucro_do_periodo (a regra de Relatórios e da meta do mês).
-- pct: quanto do total já entrou, arredondado para baixo (99,6% não vira 100%).
create or replace function public.contas_fixas_resumo(p uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fuso text;
  v_hoje date;
  v_ini date;
  v_fim date;
  v_total numeric;
  v_n integer;
  v_nao_mensais integer;
  v_fat numeric;
begin
  if (select auth.uid()) is null or p is null or not public.cuido_do_financeiro(p) or not public.vejo_financeiro(p) then
    raise exception 'As contas fixas são do dono e de quem cuida do financeiro.' using errcode = '42501';
  end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p;
  v_hoje := (now() at time zone v_fuso)::date;
  v_ini := date_trunc('month', v_hoje::timestamp)::date;
  v_fim := (v_ini + interval '1 month' - interval '1 day')::date;
  select coalesce(sum(c.valor / public.contas_fixas_passo(c.frequencia)), 0), count(*), count(*) filter (where c.frequencia <> 'mensal')
    into v_total, v_n, v_nao_mensais
    from public.contas_fixas c
   where c.petshop_id = p and c.ativa and c.comeca_em <= v_fim and (c.termina_em is null or c.termina_em >= v_hoje);
  v_total := round(v_total, 2);
  v_fat := coalesce((public.lucro_do_periodo(p, v_ini, v_hoje) ->> 'faturamento')::numeric, 0);
  return jsonb_build_object(
    'de', v_ini, 'ate', v_hoje, 'contas', v_n, 'nao_mensais', v_nao_mensais,
    'total_mensal', v_total, 'faturamento_mes', v_fat,
    'pct', case when v_total > 0 then floor(greatest(v_fat, 0) / v_total * 100)::integer end,
    'falta', greatest(0, v_total - v_fat));
end $$;
revoke execute on function public.contas_fixas_resumo(uuid) from public, anon;
grant execute on function public.contas_fixas_resumo(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. Relatórios: as saídas pagas do período em "Contas fixas" e as outras categorias
-- ---------------------------------------------------------------------------------------------------------------------
-- As mesmas saídas que lucro_do_periodo e indicadores_do_periodo somam em "saiu" (pagas, sem sangria e suprimento, sem
-- devolução), pelo dia do pagamento. Conta fixa = lançamento que veio de uma conta fixa (competencia preenchida; continua
-- contando como conta fixa se a conta fixa for apagada depois). "saiu" = total + soma de "outras".
create or replace function public.contas_fixas_do_periodo(p uuid, p_de date, p_ate date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_res jsonb;
begin
  if (select auth.uid()) is null or p is null or not (p in (select public.meus_petshops())) or not public.cuido_do_financeiro(p) then
    raise exception 'As contas fixas são do dono e de quem cuida do financeiro.' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 372 then raise exception 'Escolha um período de até um ano.'; end if;
  with s as (
    select l.data, l.valor, l.categoria, l.conta_fixa_id, l.competencia is not null as fixa, l.descricao
      from public.lancamentos l
     where l.petshop_id = p and l.tipo = 'saida' and l.pago and l.movimento is null
       and l.categoria not in ('Devolução', 'Devolução de sinal') and l.data between p_de and p_ate
  )
  select jsonb_build_object(
    'de', p_de, 'ate', p_ate,
    'saiu', (select coalesce(sum(s.valor), 0) from s),
    'total', (select coalesce(sum(s.valor), 0) from s where s.fixa),
    'contas', coalesce((select jsonb_agg(jsonb_build_object('conta_fixa_id', x.conta_fixa_id, 'nome', x.nome, 'valor', x.valor, 'vezes', x.vezes) order by x.valor desc, x.nome)
      from (select s.conta_fixa_id, coalesce(max(cf.nome), max(s.descricao), 'Conta fixa') as nome, sum(s.valor) as valor, count(*) as vezes
              from s left join public.contas_fixas cf on cf.id = s.conta_fixa_id and cf.petshop_id = p
             where s.fixa group by s.conta_fixa_id, case when s.conta_fixa_id is null then s.descricao end) x), '[]'::jsonb),
    'outras', coalesce((select jsonb_agg(jsonb_build_object('categoria', o.categoria, 'valor', o.valor) order by o.valor desc, o.categoria)
      from (select s.categoria, sum(s.valor) as valor from s where not s.fixa group by s.categoria) o), '[]'::jsonb),
    'meses', coalesce((select jsonb_agg(jsonb_build_object('mes', m.mes, 'saiu', m.saiu, 'contas_fixas', m.fixas) order by m.mes)
      from (select to_char(s.data, 'YYYY-MM') as mes, sum(s.valor) as saiu, coalesce(sum(s.valor) filter (where s.fixa), 0) as fixas from s group by 1) m), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;
revoke execute on function public.contas_fixas_do_periodo(uuid, date, date) from public, anon;
grant execute on function public.contas_fixas_do_periodo(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 7. Bom dia do Mozart: a definição da 20261201, igual, com "contas_fixas" a mais
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.gestao_bom_dia(p uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fuso text; v_hoje date; v_ini timestamptz; v_fim timestamptz;
  a_agenda boolean := public.tenho_area(p, array['agenda']);
  a_casa boolean := public.tenho_area(p, array['creche_hotel']);
  a_cli boolean := public.tenho_area(p, array['clientes']);
  a_din boolean := public.tenho_area(p, array['caixa', 'financeiro', 'relatorios']);
  a_pac boolean := public.tenho_area(p, array['pacotes']);
  a_est boolean := public.tenho_area(p, array['estoque']);
  a_fin boolean := public.cuido_do_financeiro(p) and public.vejo_financeiro(p);
  v_pets boolean;
  v_vem jsonb;
  r jsonb := '{}'::jsonb;
begin
  if not exists (select 1 from public.profissionais x where x.petshop_id = p and x.user_id = (select auth.uid()) and x.ativo) then return null; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p;
  v_hoje := (now() at time zone v_fuso)::date;
  v_ini := v_hoje::timestamp at time zone v_fuso;
  v_fim := (v_hoje + 1)::timestamp at time zone v_fuso;
  v_pets := a_agenda or a_casa or a_cli;
  r := jsonb_build_object('dia', v_hoje);

  -- os pets que vêm hoje: horário na agenda (área Agenda) e creche ou chegada no hotel (área Creche e hotel)
  select coalesce(jsonb_agg(jsonb_build_object('pet_id', w.pet_id, 'quando', w.quando)), '[]'::jsonb) into v_vem from (
  select v.pet_id, min(v.quando) as quando from (
    select a.pet_id, a.inicio as quando from public.agendamentos a
     where a_agenda and a.petshop_id = p and a.inicio >= v_ini and a.inicio < v_fim and a.status not in ('cancelado', 'faltou')
    union all
    select e.pet_id, e.entrada from public.estadias e
     where a_casa and e.petshop_id = p and e.status in ('reservada', 'em_casa')
       and ((e.tipo = 'creche' and coalesce(e.dia, (e.entrada at time zone v_fuso)::date) = v_hoje)
         or (e.tipo = 'hotel' and (e.entrada at time zone v_fuso)::date = v_hoje))
  ) v group by v.pet_id) w;

  if a_agenda then
    r := r || jsonb_build_object('agenda', coalesce((
      select jsonb_agg(jsonb_build_array(a.inicio, a.fim) order by a.inicio) from public.agendamentos a
       where a.petshop_id = p and a.inicio >= v_ini and a.inicio < v_fim and a.status not in ('cancelado', 'faltou')), '[]'::jsonb));
  end if;

  if a_casa then
    r := r || jsonb_build_object('casa', jsonb_build_object(
      'em_casa', (select count(*) from public.estadias e where e.petshop_id = p and e.status = 'em_casa'),
      'chegam', (select count(*) from public.estadias e where e.petshop_id = p and e.status = 'reservada' and e.entrada >= v_ini and e.entrada < v_fim),
      'saem', (select count(*) from public.estadias e where e.petshop_id = p and e.status = 'em_casa' and e.saida_prevista >= v_ini and e.saida_prevista < v_fim)));
  end if;

  -- quem deve (conta a receber já vencida ou sem vencimento) e vem hoje: só para quem mexe com dinheiro
  if a_din then
    r := r || jsonb_build_object('devem', coalesce((
      select jsonb_agg(x order by x.valor desc, x.tutor) from (
        select c.nome as tutor, sum(l.valor) as valor,
               (select min(v.quando) from jsonb_to_recordset(v_vem) as v(pet_id uuid, quando timestamptz) join public.pets pp on pp.id = v.pet_id where pp.cliente_id = c.id) as quando,
               (select jsonb_agg(pp.nome order by pp.nome) from jsonb_to_recordset(v_vem) as v(pet_id uuid, quando timestamptz) join public.pets pp on pp.id = v.pet_id where pp.cliente_id = c.id) as pets
          from public.lancamentos l join public.clientes c on c.id = l.cliente_id
         where l.petshop_id = p and l.tipo = 'entrada' and not l.pago and (l.vencimento is null or l.vencimento <= v_hoje)
           and exists (select 1 from jsonb_to_recordset(v_vem) as v(pet_id uuid, quando timestamptz) join public.pets pp on pp.id = v.pet_id where pp.cliente_id = c.id)
         group by c.id, c.nome
        having sum(l.valor) > 0
         limit 5) x), '[]'::jsonb));
  end if;

  -- vacinas e cuidados vencidos ou vencendo em 15 dias dos pets que vêm hoje (a dose mais nova de cada um)
  if v_pets then
    r := r || jsonb_build_object('vacinas', coalesce((
      select jsonb_agg(x order by x.vence_em, x.pet) from (
        select pp.nome as pet, pp.sexo, d.nome, d.tipo, d.vence_em from (
          select distinct on (s.pet_id, s.tipo, lower(s.nome)) s.pet_id, s.tipo, s.nome, s.vence_em
            from public.pets_saude s join jsonb_to_recordset(v_vem) as v(pet_id uuid, quando timestamptz) on v.pet_id = s.pet_id
           where s.petshop_id = p
           order by s.pet_id, s.tipo, lower(s.nome), s.vence_em desc nulls first) d
          join public.pets pp on pp.id = d.pet_id
         where d.vence_em is not null and d.vence_em <= v_hoje + 15
         limit 5) x), '[]'::jsonb));
    r := r || jsonb_build_object('niver', coalesce((
      select jsonb_agg(x order by x.pet) from (
        select pp.nome as pet, pp.sexo, exists (select 1 from jsonb_to_recordset(v_vem) as v(pet_id uuid, quando timestamptz) where v.pet_id = pp.id) as vem
          from public.pets pp
         where pp.petshop_id = p and pp.ativo and pp.nascimento is not null
           and extract(month from pp.nascimento) = extract(month from v_hoje) and extract(day from pp.nascimento) = extract(day from v_hoje)
         order by pp.nome limit 5) x), '[]'::jsonb));
  end if;

  -- pacote no último uso: o horário de hoje (ainda não concluído) usa a última sessão do pacote
  if a_pac and a_agenda then
    r := r || jsonb_build_object('pacotes', coalesce((
      select jsonb_agg(x order by x.quando) from (
        select pp.nome as pet, pp.sexo, pc.nome, a.inicio as quando
          from public.agendamentos a join public.pacotes_clientes pc on pc.id = a.pacote_cliente_id join public.pets pp on pp.id = a.pet_id
         where a.petshop_id = p and a.inicio >= v_ini and a.inicio < v_fim and a.status not in ('cancelado', 'faltou', 'concluido')
           and pc.ativo and pc.total - pc.usados <= 1
         order by a.inicio limit 5) x), '[]'::jsonb));
  end if;

  -- validade dos produtos (só para quem cuida do estoque, e só quando tem algo vencido ou vencendo em 30 dias)
  if a_est then
    r := r || coalesce((
      select jsonb_build_object('validade', jsonb_build_object(
          'vencidos', count(distinct pr.id) filter (where l.validade < v_hoje),
          'vencendo', count(distinct pr.id) filter (where l.validade >= v_hoje),
          'primeiro', (array_agg(pr.nome order by l.validade, pr.nome))[1]))
        from public.produtos_lotes l join public.produtos pr on pr.id = l.produto_id
       where l.petshop_id = p and pr.ativo and l.quantidade > 0 and l.validade is not null and l.validade <= v_hoje + 30
      having count(*) > 0), '{}'::jsonb);
  end if;

  -- contas fixas vencidas, de hoje e de amanhã (só para quem cuida do financeiro e vê o dinheiro)
  if a_fin then
    r := r || jsonb_build_object('contas_fixas', coalesce((
      select jsonb_agg(jsonb_build_object('nome', x.nome, 'valor', x.valor, 'vencimento', x.vencimento, 'estimado', x.valor_estimado) order by x.vencimento, x.nome) from (
        select coalesce(cf.nome, l.descricao, 'Conta fixa') as nome, l.valor, l.vencimento, l.valor_estimado
          from public.lancamentos l left join public.contas_fixas cf on cf.id = l.conta_fixa_id and cf.petshop_id = p
         where l.petshop_id = p and l.tipo = 'saida' and not l.pago and l.competencia is not null and l.vencimento <= v_hoje + 1
         order by l.vencimento, coalesce(cf.nome, l.descricao) limit 5) x), '[]'::jsonb));
  end if;

  return r;
end $$;

revoke execute on function public.gestao_bom_dia(uuid) from public, anon;
grant execute on function public.gestao_bom_dia(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 8. Faxina diária: a definição da 20261210, igual, com as contas fixas de todos os pet shops
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.gestao_faxina_banco() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_albuns int; v_reservas int; v_acessos int; v_conversas int; v_eventos int; v_contas int;
begin
  v_albuns := public.boletim_faxina_geral();
  delete from public.caderno_reservas r where r.criado_em < now() - interval '1 day';
  get diagnostics v_reservas = row_count;
  -- Marco Civil, art. 15: registro de acesso guardado por 6 meses, depois apagado
  delete from public.registros_acesso r where r.em < now() - interval '6 months';
  get diagnostics v_acessos = row_count;
  -- conversas com o Mozart e a Ajuda, e o histórico do Mozart: 12 meses
  delete from public.conversas c where c.criado_em < now() - interval '12 months';
  get diagnostics v_conversas = row_count;
  delete from public.assistente_eventos e where e.criado_em < now() - interval '12 months';
  get diagnostics v_eventos = row_count;
  -- contas fixas: a conta do mês entra em A pagar 10 dias antes do vencimento, mesmo sem ninguém abrir o aplicativo
  v_contas := public.contas_fixas_gerar_todas();
  return jsonb_build_object('albuns', v_albuns, 'reservas', v_reservas, 'acessos', v_acessos, 'conversas', v_conversas, 'eventos', v_eventos, 'contas_fixas', v_contas);
end $$;
revoke execute on function public.gestao_faxina_banco() from public, anon, authenticated;
grant execute on function public.gestao_faxina_banco() to service_role;

notify pgrst, 'reload schema';
