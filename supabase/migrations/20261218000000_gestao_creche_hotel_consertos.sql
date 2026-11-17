-- Rodada final dos testadores (Rafael, creche; Bia, hotel): creche e hotel.
--
-- 1. Táxi pet (leva e traz) do mensalista: cada plano pode ter táxi (ida, volta ou ida e volta) com preço por dia que veio ou
--    um valor fixo por mês. O dia de táxi fica anotado quando o pet chega pela chamada (tabela `creche_taxi`, sem valor para a
--    equipe sem dinheiro) e entra na cobrança do mês seguinte, como a taxa de busca fora do horário; o valor fixo entra na
--    cobrança do próprio mês. Na cobrança, o táxi fica em `taxas`, com "tipo": "taxi" ou "taxi_mes" (as taxas de busca fora do
--    horário continuam sem "tipo"). O app antigo soma as linhas de táxi junto das taxas (o total é o mesmo).
-- 2. Indicadores: reservas canceladas da creche e do hotel entram nos cancelamentos; o sinal (e o pago adiantado) não conta como
--    uma conta a mais; o valor médio por conta soma só as contas contadas (com o sinal que foi descontado delas); noites do hotel.
-- 3. Link do cliente: a hora de entrada e de saída do hotel (Meu pet shop), a chave Pix (com o sinal ligado) e os planos mensais
--    da creche (só com a opção ligada).
-- 4. Velocidade: medido numa loja com 40 pets, 25 mensalistas, 300 estadias e 600 lançamentos, cada leitura das telas Hotel,
--    Creche e Cobranças leva menos de 12 ms no banco (indicadores, 45 ms): a demora é de idas e voltas em fila, consertada no app.
--    Nenhum índice novo aqui.
--
-- Funções trocadas (cópia da última definição, mais a mudança):
--   creche_cobranca_criar, creche_saida_extras  ← 20261173000000_gestao_creche_experiencia_irmaos.sql
--   indicadores_do_periodo                      ← 20261204000000_gestao_taxas_indicadores.sql
--   link_hotel_opcoes                           ← 20261181000000_gestao_hotel_checkout_conferido.sql
--   estadia_sinal                               ← 20261178000000_gestao_dinheiro_tudo_ou_nada.sql

-- =====================================================================================================================
-- 1. Táxi pet do mensalista
-- =====================================================================================================================

-- ida, volta ou ida e volta (sem valor: a equipe que faz a rota lê); null = sem táxi
alter table public.creche_planos add column if not exists taxi text check (taxi is null or taxi in ('ida', 'volta', 'ida_volta'));
grant update (taxi) on public.creche_planos to authenticated;

-- o preço do táxi fica junto dos valores do plano (só quem cuida do financeiro lê e grava)
alter table public.creche_planos_valores add column if not exists taxi_valor numeric(10, 2)
  check (taxi_valor is null or (taxi_valor >= 0 and taxi_valor <= 9999.99));
alter table public.creche_planos_valores add column if not exists taxi_modo text not null default 'dia' check (taxi_modo in ('dia', 'mes'));

-- Um dia de táxi por presença (estadia de mensalista em que o pet veio). O valor é o do plano no dia.
create table if not exists public.creche_taxi (
  estadia_id uuid primary key references public.estadias (id) on delete cascade,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  pet_id uuid not null,
  plano_id uuid references public.creche_planos (id) on delete set null,
  dia date not null,
  taxi text not null check (taxi in ('ida', 'volta', 'ida_volta')),
  valor numeric(10, 2) not null check (valor > 0 and valor <= 9999.99),
  cobranca_id uuid references public.creche_cobrancas (id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists creche_taxi_petshop on public.creche_taxi (petshop_id, dia);
create index if not exists creche_taxi_sem_cobranca on public.creche_taxi (pet_id) where cobranca_id is null;
create index if not exists creche_taxi_cobranca on public.creche_taxi (cobranca_id) where cobranca_id is not null;
alter table public.creche_taxi enable row level security;
revoke all on public.creche_taxi from anon, authenticated;
grant select on public.creche_taxi to authenticated;
drop policy if exists creche_taxi_ler on public.creche_taxi;
create policy creche_taxi_ler on public.creche_taxi for select to authenticated
  using ((select public.tenho_area(petshop_id, array['caixa', 'financeiro', 'relatorios'])));

-- A presença do mensalista vira (ou deixa de ser) um dia de táxi. Só anota com o táxi por dia no plano e valor maior que zero.
-- Dia já cobrado não muda; a presença desfeita (ou a reserva de dia extra cancelada) tira o dia ainda sem cobrança.
create or replace function public.creche_taxi_anotar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_taxi text; v_valor numeric; v_modo text; v_fuso text;
begin
  begin
    if tg_op = 'UPDATE' and new.status is not distinct from old.status and new.mensalista is not distinct from old.mensalista
       and new.plano_id is not distinct from old.plano_id then
      return null;
    end if;
    if new.tipo = 'creche' and new.plano_id is not null and new.mensalista is not null and new.status in ('em_casa', 'encerrada') then
      if exists (select 1 from public.creche_taxi t where t.estadia_id = new.id) then return null; end if;
      select pl.taxi, v.taxi_valor, v.taxi_modo into v_taxi, v_valor, v_modo
        from public.creche_planos pl left join public.creche_planos_valores v on v.plano_id = pl.id
       where pl.id = new.plano_id and pl.petshop_id = new.petshop_id;
      if v_taxi is null or coalesce(v_modo, 'dia') <> 'dia' or coalesce(v_valor, 0) <= 0 then return null; end if;
      select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = new.petshop_id;
      insert into public.creche_taxi (estadia_id, petshop_id, pet_id, plano_id, dia, taxi, valor)
        values (new.id, new.petshop_id, new.pet_id, new.plano_id, coalesce(new.dia, (new.entrada at time zone v_fuso)::date), v_taxi, v_valor)
        on conflict (estadia_id) do nothing;
    else
      delete from public.creche_taxi t where t.estadia_id = new.id and t.cobranca_id is null;
    end if;
  exception when others then
    -- o táxi é um apoio da cobrança: nunca derruba a chamada
    raise warning 'creche_taxi_anotar: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.creche_taxi_anotar() from public, anon, authenticated;
drop trigger if exists creche_taxi_anotar on public.estadias;
create trigger creche_taxi_anotar after insert or update of status, mensalista, plano_id on public.estadias
  for each row execute function public.creche_taxi_anotar();

-- Cobrança cancelada ou marcada como paga por fora: os dias de táxi dela voltam a ficar sem cobrança (entram na próxima),
-- como os dias extras e as taxas de busca (creche_cobranca_cancelar e creche_cobrancas_por_fora soltam os deles).
create or replace function public.creche_taxi_soltar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status <> 'aberta' and old.status = 'aberta' then
    update public.creche_taxi t set cobranca_id = null where t.cobranca_id = new.id;
  end if;
  return null;
end $$;
revoke execute on function public.creche_taxi_soltar() from public, anon, authenticated;
drop trigger if exists creche_taxi_soltar on public.creche_cobrancas;
create trigger creche_taxi_soltar after update of status on public.creche_cobrancas
  for each row execute function public.creche_taxi_soltar();

-- Cobrança do mês (igual à de 20261173), mais o táxi: os dias de táxi de meses anteriores ainda sem cobrança e, com o táxi
-- por mês, o valor fixo do próprio mês. As linhas vão em `taxas` com "tipo" e o valor soma em valor_extras.
create or replace function public.creche_cobranca_criar(p_plano uuid, p_mes date, p_valor numeric default null, p_desconto numeric default 0, p_vencimento date default null, p_obs text default null, p_reabrir boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  pl public.creche_planos;
  s public.petshops;
  v public.creche_planos_valores;
  c public.creche_cobrancas;
  v_mes date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_cliente uuid;
  v_mensal numeric(10, 2);
  v_unit numeric(10, 2);
  v_extras jsonb;
  v_extras_total numeric(10, 2);
  v_taxas jsonb;
  v_taxas_total numeric(10, 2);
  v_taxi jsonb;
  v_taxi_total numeric(10, 2);
  v_desconto numeric(10, 2) := greatest(coalesce(p_desconto, 0), 0);
  v_irmao numeric(10, 2) := 0;
  v_venc date;
  v_id uuid;
begin
  select * into pl from public.creche_planos where id = p_plano for update;
  if not found or not public.cuido_do_financeiro(pl.petshop_id) then raise exception 'Plano não encontrado.'; end if;
  if not public.acesso_liberado(pl.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if p_mes is null then raise exception 'Escolha o mês.'; end if;
  select * into c from public.creche_cobrancas where plano_id = pl.id and mes = v_mes;
  if found and (c.status = 'aberta' or not coalesce(p_reabrir, false)) then return c.id; end if;
  if pl.inicio > v_fim or (pl.fim is not null and pl.fim < v_mes) then raise exception 'O plano não vale nesse mês.'; end if;
  -- mês anterior à primeira cobrança escolhida (foi pago por fora do sistema): não gera
  if c.id is null and pl.primeira_cobranca is not null and v_mes < pl.primeira_cobranca then
    raise exception 'Este plano começa a ser cobrado em % (os meses anteriores foram pagos por fora).', public.creche_nome_mes(pl.primeira_cobranca);
  end if;
  select * into s from public.petshops where id = pl.petshop_id;
  select * into v from public.creche_planos_valores where plano_id = pl.id;
  if v.plano_id is null then raise exception 'Defina o valor da mensalidade deste plano antes de gerar a cobrança.'; end if;
  v_mensal := coalesce(p_valor, public.creche_sugestao_mensal(pl.id, v_mes, v.valor_mensal));
  if v_mensal < 0 or v_mensal > 99999.99 then raise exception 'Confira o valor da mensalidade.'; end if;
  v_unit := coalesce(v.valor_extra, s.diaria_creche, 0);
  -- só o dia extra em que o pet veio (reserva de dia extra que não virou presença não é cobrada)
  select coalesce(jsonb_agg(jsonb_build_object('dia', e.dia, 'valor', v_unit) order by e.dia), '[]'::jsonb), coalesce(count(*) * v_unit, 0)
    into v_extras, v_extras_total
    from public.estadias e
    where e.pet_id = pl.pet_id and e.mensalista = 'extra' and e.status in ('em_casa', 'encerrada') and e.cobranca_id is null and e.dia < v_mes;
  -- taxas de busca fora do horário de meses anteriores que quem recebe mandou para a mensalidade (mesma regra dos dias extras)
  select coalesce(jsonb_agg(jsonb_build_object('dia', a.dia, 'valor', a.valor) order by a.dia, a.estadia_id), '[]'::jsonb), coalesce(sum(a.valor), 0)
    into v_taxas, v_taxas_total
    from public.creche_atrasos a
    where a.pet_id = pl.pet_id and a.estado = 'mensalidade' and a.cobranca_id is null and a.dia < v_mes;
  -- táxi: os dias de meses anteriores (mesma regra) e o valor fixo do mês
  select coalesce(jsonb_agg(jsonb_build_object('dia', t.dia, 'valor', t.valor, 'tipo', 'taxi') order by t.dia, t.estadia_id), '[]'::jsonb), coalesce(sum(t.valor), 0)
    into v_taxi, v_taxi_total
    from public.creche_taxi t
    where t.pet_id = pl.pet_id and t.cobranca_id is null and t.dia < v_mes;
  if pl.taxi is not null and v.taxi_modo = 'mes' and coalesce(v.taxi_valor, 0) > 0 then
    v_taxi := v_taxi || jsonb_build_array(jsonb_build_object('dia', v_mes, 'valor', v.taxi_valor, 'tipo', 'taxi_mes'));
    v_taxi_total := v_taxi_total + v.taxi_valor;
  end if;
  v_taxas := v_taxas || v_taxi;
  v_taxas_total := v_taxas_total + v_taxi_total;
  v_extras_total := v_extras_total + v_taxas_total;
  if v_desconto > v_mensal + v_extras_total then raise exception 'O desconto é maior que a cobrança.'; end if;
  -- desconto para irmãos (opção da creche): entra junto do desconto, e fica anotado à parte para aparecer na cobrança
  v_irmao := public.creche_desconto_irmao(pl.id, v_mes, v_mensal, v.valor_mensal);
  if v_irmao > 0 then
    v_desconto := least(v_desconto + v_irmao, v_mensal + v_extras_total);
    v_irmao := least(v_irmao, v_desconto);
  end if;
  v_venc := coalesce(p_vencimento, greatest(make_date(extract(year from v_mes)::int, extract(month from v_mes)::int, pl.vence_dia), least(pl.inicio, v_fim)));
  select cliente_id into v_cliente from public.pets where id = pl.pet_id;

  if c.id is not null then
    update public.creche_cobrancas set status = 'aberta', por_fora = false, cliente_id = v_cliente, valor_cheio = v.valor_mensal, valor_mensal = v_mensal, extras = v_extras, taxas = v_taxas,
      valor_extras = v_extras_total, desconto = v_desconto, desconto_irmao = v_irmao, total = v_mensal + v_extras_total - v_desconto, vencimento = v_venc,
      obs = nullif(left(btrim(coalesce(p_obs, '')), 300), ''), cobrado_em = null, lancamento_id = null
      where id = c.id returning id into v_id;
  else
    insert into public.creche_cobrancas (petshop_id, plano_id, pet_id, cliente_id, mes, valor_cheio, valor_mensal, extras, taxas, valor_extras, desconto, desconto_irmao, total, vencimento, obs)
      values (pl.petshop_id, pl.id, pl.pet_id, v_cliente, v_mes, v.valor_mensal, v_mensal, v_extras, v_taxas, v_extras_total, v_desconto, v_irmao,
        v_mensal + v_extras_total - v_desconto, v_venc, nullif(left(btrim(coalesce(p_obs, '')), 300), ''))
      returning id into v_id;
  end if;
  perform set_config('maestro.creche', '1', true);
  update public.estadias e set cobranca_id = v_id
    where e.pet_id = pl.pet_id and e.mensalista = 'extra' and e.status in ('em_casa', 'encerrada') and e.cobranca_id is null and e.dia < v_mes;
  update public.creche_atrasos a set cobranca_id = v_id
    where a.pet_id = pl.pet_id and a.estado = 'mensalidade' and a.cobranca_id is null and a.dia < v_mes;
  update public.creche_taxi t set cobranca_id = v_id
    where t.pet_id = pl.pet_id and t.cobranca_id is null and t.dia < v_mes;
  perform public.creche_cobranca_lancar(v_id);
  -- o irmão que entrou agora pode mudar quem paga cheio: as outras cobranças abertas da família no mês acompanham
  perform public.creche_irmaos_refazer(pl.petshop_id, v_cliente, v_mes);
  return v_id;
end $$;

-- Dias extras e taxas que ficaram sem cobrança quando o plano acabou (igual à de 20261173), mais os dias de táxi.
create or replace function public.creche_saida_extras(p_plano uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  pl public.creche_planos;
  s public.petshops;
  v public.creche_planos_valores;
  c public.creche_cobrancas;
  v_hoje date;
  v_mes date;
  v_depois date;
  v_unit numeric(10, 2);
  v_extras jsonb;
  v_extras_total numeric(10, 2);
  v_taxas jsonb;
  v_taxas_total numeric(10, 2);
  v_taxi jsonb;
  v_taxi_total numeric(10, 2);
  v_cliente uuid;
  v_id uuid;
begin
  select * into pl from public.creche_planos where id = p_plano for update;
  if not found or not public.cuido_do_financeiro(pl.petshop_id) then raise exception 'Plano não encontrado.'; end if;
  if not public.acesso_liberado(pl.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  select * into s from public.petshops where id = pl.petshop_id;
  v_hoje := (now() at time zone s.fuso)::date;
  if pl.fim is null or pl.fim > v_hoje then raise exception 'O plano ainda não terminou: os dias extras entram na próxima cobrança.'; end if;
  select * into v from public.creche_planos_valores where plano_id = pl.id;
  v_unit := coalesce(v.valor_extra, s.diaria_creche, 0);
  v_mes := date_trunc('month', pl.fim)::date;
  v_depois := (v_mes + interval '1 month')::date;

  select coalesce(jsonb_agg(jsonb_build_object('dia', e.dia, 'valor', v_unit) order by e.dia), '[]'::jsonb), coalesce(count(*) * v_unit, 0)
    into v_extras, v_extras_total
    from public.estadias e
    where e.pet_id = pl.pet_id and e.mensalista = 'extra' and e.status in ('em_casa', 'encerrada') and e.cobranca_id is null and e.dia <= pl.fim;
  select coalesce(jsonb_agg(jsonb_build_object('dia', a.dia, 'valor', a.valor) order by a.dia, a.estadia_id), '[]'::jsonb), coalesce(sum(a.valor), 0)
    into v_taxas, v_taxas_total
    from public.creche_atrasos a
    where a.pet_id = pl.pet_id and a.estado = 'mensalidade' and a.cobranca_id is null and a.dia <= pl.fim;
  select coalesce(jsonb_agg(jsonb_build_object('dia', t.dia, 'valor', t.valor, 'tipo', 'taxi') order by t.dia, t.estadia_id), '[]'::jsonb), coalesce(sum(t.valor), 0)
    into v_taxi, v_taxi_total
    from public.creche_taxi t
    where t.pet_id = pl.pet_id and t.cobranca_id is null and t.dia <= pl.fim;
  v_taxas := v_taxas || v_taxi;
  v_taxas_total := v_taxas_total + v_taxi_total;
  if jsonb_array_length(v_extras) = 0 and jsonb_array_length(v_taxas) = 0 then
    raise exception 'Não há dia extra nem taxa sem cobrança.';
  end if;

  -- a cobrança do mês da saída, aberta e sem pagamento completo
  select * into c from public.creche_cobrancas where plano_id = pl.id and mes = v_mes;
  if c.id is null and (pl.primeira_cobranca is null or pl.primeira_cobranca <= v_mes) and pl.inicio < v_depois then
    -- ainda vai ser gerada: os dias extras de meses anteriores entram nela sozinhos; os do mês da saída, depois de gerar
    raise exception 'Gere antes a cobrança de % em Gerar cobranças. Depois, os dias que faltam entram nela.', public.creche_nome_mes(v_mes);
  end if;
  if c.id is null or c.status <> 'aberta' or public.creche_cobranca_paga(c.lancamento_id) then
    -- senão, a do mês seguinte (o acerto)
    select * into c from public.creche_cobrancas where plano_id = pl.id and mes = v_depois for update;
    if c.id is not null and c.status = 'aberta' and public.creche_cobranca_paga(c.lancamento_id) then
      raise exception 'A cobrança de % deste plano já foi paga. Desfaça o recebimento antes.', public.creche_nome_mes(v_depois);
    end if;
  end if;

  select cliente_id into v_cliente from public.pets where id = pl.pet_id;
  if c.id is not null and c.status = 'aberta' then
    update public.creche_cobrancas set extras = extras || v_extras, taxas = taxas || v_taxas,
      valor_extras = valor_extras + v_extras_total + v_taxas_total, total = valor_mensal + valor_extras + v_extras_total + v_taxas_total - desconto
      where id = c.id returning id into v_id;
  elsif c.id is not null then
    -- cancelada (ou paga por fora) no mês seguinte: volta como acerto, só com o que ficou sem cobrar
    update public.creche_cobrancas set status = 'aberta', por_fora = false, acerto_saida = true, cliente_id = v_cliente, valor_cheio = 0, valor_mensal = 0,
      extras = v_extras, taxas = v_taxas, valor_extras = v_extras_total + v_taxas_total, desconto = 0, desconto_irmao = 0, total = v_extras_total + v_taxas_total,
      vencimento = v_hoje, obs = null, cobrado_em = null, lancamento_id = null
      where id = c.id returning id into v_id;
  else
    insert into public.creche_cobrancas (petshop_id, plano_id, pet_id, cliente_id, mes, valor_cheio, valor_mensal, extras, taxas, valor_extras, desconto, total, vencimento, acerto_saida)
      values (pl.petshop_id, pl.id, pl.pet_id, v_cliente, v_depois, 0, 0, v_extras, v_taxas, v_extras_total + v_taxas_total, 0, v_extras_total + v_taxas_total, v_hoje, true)
      returning id into v_id;
  end if;
  perform set_config('maestro.creche', '1', true);
  update public.estadias e set cobranca_id = v_id
    where e.pet_id = pl.pet_id and e.mensalista = 'extra' and e.status in ('em_casa', 'encerrada') and e.cobranca_id is null and e.dia <= pl.fim;
  update public.creche_atrasos a set cobranca_id = v_id
    where a.pet_id = pl.pet_id and a.estado = 'mensalidade' and a.cobranca_id is null and a.dia <= pl.fim;
  update public.creche_taxi t set cobranca_id = v_id
    where t.pet_id = pl.pet_id and t.cobranca_id is null and t.dia <= pl.fim;
  perform public.creche_cobranca_lancar(v_id);
  return v_id;
end $$;

-- As viagens do táxi do mensalista, na tela Leva e traz (buscar = ida, levar = volta), por plano e dia. Como nas outras viagens,
-- marcar Buscado ou Entregue em casa não faz a chegada nem a saída na chamada; levar de volta só depois que o pet chegou.
create table if not exists public.creche_taxi_viagens (
  plano_id uuid not null references public.creche_planos (id) on delete cascade,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  dia date not null,
  perna text not null check (perna in ('buscar', 'levar')),
  feito_em timestamptz not null default now(),
  feito_por uuid references auth.users (id) on delete set null,
  primary key (plano_id, dia, perna)
);
create index if not exists creche_taxi_viagens_dia on public.creche_taxi_viagens (petshop_id, dia);
alter table public.creche_taxi_viagens enable row level security;
revoke all on public.creche_taxi_viagens from anon, authenticated;
grant select on public.creche_taxi_viagens to authenticated;
drop policy if exists creche_taxi_viagens_ler on public.creche_taxi_viagens;
create policy creche_taxi_viagens_ler on public.creche_taxi_viagens for select to authenticated
  using ((select public.tenho_area(petshop_id, array['creche_hotel'])));

create or replace function public.creche_taxi_viagem_marcar(p_petshop uuid, p_plano uuid, p_dia date, p_perna text, p_feito boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pl public.creche_planos;
  v public.creche_taxi_viagens;
begin
  if not public.tenho_area(p_petshop, array['creche_hotel']) then raise exception 'Sem acesso à creche e hotel.'; end if;
  if not public.acesso_liberado(p_petshop) then raise exception 'A conta está só para consulta.'; end if;
  if p_perna is null or p_perna not in ('buscar', 'levar') or p_dia is null then raise exception 'Viagem inválida.'; end if;
  select * into pl from public.creche_planos x where x.id = p_plano and x.petshop_id = p_petshop;
  if pl.id is null then raise exception 'Plano não encontrado.'; end if;
  if not coalesce(p_feito, true) then
    delete from public.creche_taxi_viagens x where x.plano_id = p_plano and x.dia = p_dia and x.perna = p_perna;
    return jsonb_build_object('perna', p_perna, 'feito_em', null);
  end if;
  if pl.taxi is null or (p_perna = 'buscar' and pl.taxi = 'volta') or (p_perna = 'levar' and pl.taxi = 'ida') then
    raise exception 'O plano deste pet não tem táxi para %.', case p_perna when 'buscar' then 'buscar o pet' else 'levar o pet de volta' end;
  end if;
  if p_perna = 'levar' and not exists (select 1 from public.estadias e where e.petshop_id = p_petshop and e.plano_id = p_plano and e.dia = p_dia
      and e.status in ('em_casa', 'encerrada')) then
    raise exception 'O pet ainda não chegou à creche hoje.';
  end if;
  insert into public.creche_taxi_viagens as x (plano_id, petshop_id, dia, perna, feito_por)
    values (p_plano, p_petshop, p_dia, p_perna, (select auth.uid()))
    on conflict (plano_id, dia, perna) do nothing;
  select * into v from public.creche_taxi_viagens x where x.plano_id = p_plano and x.dia = p_dia and x.perna = p_perna;
  return jsonb_build_object('perna', v.perna, 'feito_em', v.feito_em);
end $$;
revoke all on function public.creche_taxi_viagem_marcar(uuid, uuid, date, text, boolean) from public, anon;
grant execute on function public.creche_taxi_viagem_marcar(uuid, uuid, date, text, boolean) to authenticated;

-- O sinal da reserva cancelada pode virar crédito do tutor: o cancelamento leva o passo "credito" (o crédito é da estadia
-- cancelada). Igual à de 20261178000000_gestao_dinheiro_tudo_ou_nada.sql, mais o passo "credito" (conferido contra a estadia).
create or replace function public.estadia_sinal(p_petshop uuid, p_estadia uuid, p_chave text, p_passos jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.lote_conferir_alvo(p_passos, array['estadia_cancelar'], 'id', p_estadia);
  perform public.lote_conferir_alvo(p_passos, array['estadia_valores', 'credito'], 'estadia', p_estadia);
  return public.operacao_tudo_ou_nada(p_petshop, p_chave, p_passos, array['lancamento', 'apagar_aberto', 'receber', 'estadia_valores', 'estadia_cancelar', 'credito']);
end $$;
revoke execute on function public.estadia_sinal(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.estadia_sinal(uuid, uuid, text, jsonb) to authenticated;

-- =====================================================================================================================
-- 2. Indicadores (igual à de 20261204, com):
--    * `contas` sem as entradas do sinal (e do pago adiantado) da estadia: elas são parte da conta do check-out;
--    * `valor_contas`: o que as contas contadas somaram, com o sinal descontado delas no check-out (o valor médio usa isto);
--    * `estadias_marcadas` e `estadias_canceladas`: reservas e estadias da creche e do hotel (sem as presenças de mensalista),
--      pelo dia da entrada;
--    * `noites_hotel`: noites de hotel ocupadas no mês (estadias abertas e encerradas).
-- =====================================================================================================================
create or replace function public.indicadores_do_periodo(p uuid, p_de date, p_ate date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fuso text;
  v_din boolean;
  v_ini timestamptz;
  v_fim timestamptz;
  v_res jsonb;
begin
  if (select auth.uid()) is null or p is null or not (p in (select public.meus_petshops())) then
    raise exception 'Sem acesso a este pet shop.' using errcode = '42501';
  end if;
  if not public.tenho_area(p, array['relatorios']) then
    raise exception 'Os indicadores são de quem vê os relatórios.' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 372 then raise exception 'Escolha um período de até um ano.'; end if;
  v_din := public.cuido_do_financeiro(p) and public.vejo_financeiro(p);
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p;
  v_ini := p_de::timestamp at time zone v_fuso;
  v_fim := (p_ate + 1)::timestamp at time zone v_fuso;

  with meses as (
    select to_char(m, 'YYYY-MM') as mes, greatest(m::date, p_de) as de, least((m + interval '1 month' - interval '1 day')::date, p_ate) as ate
    from generate_series(date_trunc('month', p_de::timestamp), date_trunc('month', p_ate::timestamp), interval '1 month') m
  ),
  ag as materialized (
    select a.id, a.status, a.servico_id, (a.inicio at time zone v_fuso) as local, pe.cliente_id
    from public.agendamentos a left join public.pets pe on pe.id = a.pet_id
    where a.petshop_id = p and a.inicio >= v_ini and a.inicio < v_fim
  ),
  es as materialized (
    select e.id, e.tipo, (e.saida at time zone v_fuso)::date as dia, pe.cliente_id
    from public.estadias e left join public.pets pe on pe.id = e.pet_id
    where e.petshop_id = p and e.status = 'encerrada' and e.saida >= v_ini and e.saida < v_fim
  ),
  -- reservas e estadias (sem as presenças de mensalista), pelo dia da entrada: marcadas e canceladas
  er as materialized (
    select e.status, (e.entrada at time zone v_fuso)::date as dia
    from public.estadias e
    where e.petshop_id = p and e.mensalista is null and e.entrada >= v_ini and e.entrada < v_fim
  ),
  -- noites de hotel ocupadas: cada noite de uma estadia de hotel aberta ou encerrada que cai no período
  nh as (
    select g.d::date as dia
    from public.estadias e
    cross join lateral generate_series((e.entrada at time zone v_fuso)::date,
      greatest((e.entrada at time zone v_fuso)::date, (coalesce(e.saida, e.saida_prevista, e.entrada + interval '1 day') at time zone v_fuso)::date - 1),
      interval '1 day') g(d)
    where e.petshop_id = p and e.tipo = 'hotel' and e.status in ('em_casa', 'encerrada')
      and e.entrada < v_fim and coalesce(e.saida, e.saida_prevista, e.entrada + interval '1 day') > v_ini
  ),
  sinais as materialized (
    select v.sinal_lancamento_id as id, v.sinal_estado, v.sinal, v.conta
    from public.estadias_valores v
    where v.petshop_id = p and (v.sinal_lancamento_id is not null or v.conta is not null)
  ),
  ent as materialized (
    select l.id, l.data, l.valor, (l.conta_id is null and l.diferenca_de is null) as principal,
      exists (select 1 from sinais x where x.id is not null and (x.id = l.id or x.id = l.conta_id)) as do_sinal,
      coalesce((select sum(x.sinal) from sinais x where x.sinal_estado = 'pago' and x.conta ->> 'lancamento_id' = l.id::text), 0) as sinal_descontado
    from public.lancamentos l
    where l.petshop_id = p and l.tipo = 'entrada' and l.pago and l.movimento is null and l.data between p_de and p_ate
  ),
  sai as (
    select l.data, l.valor, l.categoria in ('Devolução', 'Devolução de sinal') as devolucao
    from public.lancamentos l
    where l.petshop_id = p and l.tipo = 'saida' and l.pago and l.movimento is null and l.data between p_de and p_ate
  ),
  cred as (
    select (c.criado_em at time zone v_fuso)::date as dia, c.valor, c.lancamento_id
    from public.clientes_creditos c
    where c.petshop_id = p and c.criado_em >= v_ini and c.criado_em < v_fim
  ),
  tx as (
    select l.data, t.taxa from ent l join public.lancamentos_taxas t on t.lancamento_id = l.id where t.petshop_id = p
  ),
  -- visitas: atendimento concluído ou estadia encerrada, de 60 dias antes do começo até o fim (para o retorno)
  vis as materialized (
    select pe.cliente_id, (a.inicio at time zone v_fuso)::date as dia
    from public.agendamentos a join public.pets pe on pe.id = a.pet_id
    where a.petshop_id = p and a.status = 'concluido' and a.inicio >= ((p_de - 60)::timestamp at time zone v_fuso) and a.inicio < v_fim and pe.cliente_id is not null
    union
    select pe.cliente_id, (e.saida at time zone v_fuso)::date
    from public.estadias e join public.pets pe on pe.id = e.pet_id
    where e.petshop_id = p and e.status = 'encerrada' and e.saida >= ((p_de - 60)::timestamp at time zone v_fuso) and e.saida < v_fim and pe.cliente_id is not null
  ),
  noper as (select distinct v.cliente_id, v.dia from vis v where v.dia between p_de and p_ate),
  -- a primeira visita da vida de cada cliente atendido no período
  prim as (
    select c.cliente_id, least(
      (select min((a.inicio at time zone v_fuso)::date) from public.agendamentos a join public.pets pe on pe.id = a.pet_id
        where a.petshop_id = p and a.status = 'concluido' and pe.cliente_id = c.cliente_id),
      (select min((e.saida at time zone v_fuso)::date) from public.estadias e join public.pets pe on pe.id = e.pet_id
        where e.petshop_id = p and e.status = 'encerrada' and pe.cliente_id = c.cliente_id)) as dia
    from (select distinct n.cliente_id from noper n) c
  ),
  pc as materialized (select * from public.lucro_pecas(p, p_de, p_ate)),
  mm as (
    select m.mes, m.de, m.ate,
      (select coalesce(sum(e.valor), 0) from ent e where e.data between m.de and m.ate) as entradas,
      (select count(*) from ent e where e.principal and not e.do_sinal and e.data between m.de and m.ate) as contas,
      (select coalesce(sum(e.valor + e.sinal_descontado), 0) from ent e where e.principal and not e.do_sinal and e.data between m.de and m.ate) as valor_contas,
      (select coalesce(sum(s.valor), 0) from sai s where s.devolucao and s.data between m.de and m.ate) as devolvido,
      (select coalesce(sum(s.valor), 0) from sai s where not s.devolucao and s.data between m.de and m.ate) as saiu,
      (select coalesce(sum(c.valor) filter (where c.valor > 0), 0) from cred c where c.dia between m.de and m.ate) as deixado,
      (select coalesce(-sum(c.valor) filter (where c.valor < 0 and c.lancamento_id is null), 0) from cred c where c.dia between m.de and m.ate) as usado_fora,
      (select coalesce(sum(t.taxa), 0) from tx t where t.data between m.de and m.ate) as taxas,
      (select count(*) from ag a where a.status = 'concluido' and a.local::date between m.de and m.ate) as atendimentos,
      (select count(*) from ag a where a.status = 'faltou' and a.local::date between m.de and m.ate) as faltas,
      (select count(*) from ag a where a.status = 'cancelado' and a.local::date between m.de and m.ate) as cancelados,
      (select count(*) from ag a where a.local::date between m.de and m.ate) as marcados,
      (select count(*) from er x where x.dia between m.de and m.ate) as estadias_marcadas,
      (select count(*) from er x where x.status = 'cancelada' and x.dia between m.de and m.ate) as estadias_canceladas,
      (select count(*) from nh x where x.dia between m.de and m.ate) as noites_hotel,
      (select count(*) from es e where e.tipo = 'creche' and e.dia between m.de and m.ate) as creche,
      (select count(*) from es e where e.tipo = 'hotel' and e.dia between m.de and m.ate) as hotel,
      (select count(distinct n.cliente_id) from noper n where n.dia between m.de and m.ate) as clientes,
      (select count(*) from prim x where x.dia between m.de and m.ate) as primeira_vez
    from meses m
  ),
  sv as (
    select coalesce(x.servico_id::text, '-') as k, x.servico_id, count(*) as vezes
    from (
      select a.servico_id from ag a where a.status = 'concluido'
      union all
      select s.servico_id from ag a join public.agendamento_servicos s on s.agendamento_id = a.id where a.status = 'concluido' and s.petshop_id = p
    ) x group by 1, 2
  ),
  svr as (select coalesce(x.servico_id::text, '-') as k, sum(x.valor) as receita from pc x where x.tipo = 'servico' group by 1),
  pr as (
    select x.produto_id, coalesce(x.produto_id::text, 'nome:' || lower(x.nome)) as k, (array_agg(x.nome))[1] as nome, sum(x.qtd) as quantidade, sum(x.valor) as receita
    from pc x where x.tipo = 'produto' group by 1, 2
  ),
  mapa as (
    select (extract(isodow from a.local)::int - 1) as d, extract(hour from a.local)::int as h, count(*) as n
    from ag a where a.status <> 'cancelado' group by 1, 2
  )
  select jsonb_build_object(
    'de', p_de, 'ate', p_ate, 'dinheiro', v_din,
    'meses', coalesce((select jsonb_agg(jsonb_build_object(
        'mes', x.mes, 'de', x.de, 'ate', x.ate,
        'faturamento', case when v_din then x.entradas - x.devolvido - x.deixado + x.usado_fora end,
        'entradas', case when v_din then x.entradas end,
        'contas', x.contas,
        'valor_contas', case when v_din then x.valor_contas end,
        'valor_medio', case when v_din and x.contas > 0 then round(x.valor_contas / x.contas, 2) end,
        'saiu', case when v_din then x.saiu end,
        'resultado', case when v_din then x.entradas - x.devolvido - x.deixado + x.usado_fora - x.saiu end,
        'taxas', case when v_din then x.taxas end,
        'resultado_depois_taxas', case when v_din then x.entradas - x.devolvido - x.deixado + x.usado_fora - x.saiu - x.taxas end,
        'atendimentos', x.atendimentos, 'faltas', x.faltas, 'cancelados', x.cancelados, 'marcados', x.marcados,
        'estadias_marcadas', x.estadias_marcadas, 'estadias_canceladas', x.estadias_canceladas, 'noites_hotel', x.noites_hotel,
        'estadias_creche', x.creche, 'estadias_hotel', x.hotel,
        'clientes', x.clientes, 'primeira_vez', x.primeira_vez, 'voltaram', x.clientes - x.primeira_vez) order by x.mes) from mm x), '[]'::jsonb),
    'clientes', (select count(distinct n.cliente_id) from noper n),
    'primeira_vez', (select count(*) from prim x where x.dia between p_de and p_ate),
    'retorno_60', jsonb_build_object(
      'clientes', (select count(distinct n.cliente_id) from noper n),
      'voltaram', (select count(distinct n.cliente_id) from noper n
                    where exists (select 1 from vis w where w.cliente_id = n.cliente_id and w.dia < n.dia and w.dia >= n.dia - 60))),
    'servicos', coalesce((select jsonb_agg(jsonb_build_object(
        'servico_id', s.servico_id, 'nome', coalesce(se.nome, 'Sem serviço escolhido'), 'vezes', s.vezes,
        'receita', case when v_din then coalesce(r.receita, 0) end) order by s.vezes desc, coalesce(se.nome, ''))
      from (select * from sv order by vezes desc limit 10) s
      left join public.servicos se on se.id = s.servico_id and se.petshop_id = p
      left join svr r on r.k = s.k), '[]'::jsonb),
    'produtos', coalesce((select jsonb_agg(jsonb_build_object(
        'produto_id', x.produto_id, 'nome', coalesce(po.nome, x.nome, 'Produto'), 'unidade', coalesce(po.unidade, 'un'), 'quantidade', x.quantidade,
        'receita', case when v_din then x.receita end) order by x.quantidade desc, x.receita desc)
      from (select * from pr where pr.quantidade > 0 order by pr.quantidade desc, pr.receita desc limit 10) x
      left join public.produtos po on po.id = x.produto_id and po.petshop_id = p), '[]'::jsonb),
    'mapa', coalesce((select jsonb_agg(jsonb_build_object('d', m.d, 'h', m.h, 'n', m.n) order by m.d, m.h) from mapa m), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;
revoke execute on function public.indicadores_do_periodo(uuid, date, date) from public, anon;
grant execute on function public.indicadores_do_periodo(uuid, date, date) to authenticated;

-- =====================================================================================================================
-- 3. Link do cliente
-- =====================================================================================================================

-- A hora de entrada e de saída do hotel (Meu pet shop, Opções do hotel: "hotel.horas" = { "entrada": "14:00", "saida": "12:00" }).
-- Hora que não é HH:MM fica de fora.
create or replace function public.hotel_horas_de(p_opcoes jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(p_opcoes -> 'hotel.horas') = 'object' then jsonb_strip_nulls(jsonb_build_object(
      'entrada', case when coalesce(p_opcoes -> 'hotel.horas' ->> 'entrada', '') ~ '^([01]\d|2[0-3]):[0-5]\d$' then p_opcoes -> 'hotel.horas' ->> 'entrada' end,
      'saida', case when coalesce(p_opcoes -> 'hotel.horas' ->> 'saida', '') ~ '^([01]\d|2[0-3]):[0-5]\d$' then p_opcoes -> 'hotel.horas' ->> 'saida' end))
    end
$$;
revoke execute on function public.hotel_horas_de(jsonb) from public, anon;

-- A chave Pix que o tutor vê: a do hotel (sinal) ou a das Opções de cobrança. Vazio = nenhuma.
create or replace function public.pix_do_petshop(p_opcoes jsonb) returns text
language sql immutable set search_path = '' as $$
  select nullif(left(btrim(coalesce(nullif(btrim(coalesce(p_opcoes ->> 'hotel.pix', '')), ''), p_opcoes ->> 'dinheiro.pix', '')), 120), '')
$$;
revoke execute on function public.pix_do_petshop(jsonb) from public, anon;

-- Opções do hotel para o link (igual à de 20261181), mais: `horas` (entrada e saída do hotel, quando o dono preencheu) e `pix`
-- (a chave, só com o sinal ligado: é para pagar o sinal depois da confirmação). O app antigo ignora as chaves novas.
create or replace function public.link_hotel_opcoes(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sinal', case when coalesce((p.opcoes -> 'hotel.sinal' ->> 'ativo')::boolean, false) then jsonb_build_object(
      'modo', p.opcoes -> 'hotel.sinal' ->> 'modo', 'valor', p.opcoes -> 'hotel.sinal' -> 'valor',
      'politica', p.opcoes -> 'hotel.sinal' ->> 'politica', 'creche', coalesce((p.opcoes -> 'hotel.sinal' ->> 'creche')::boolean, false)) else null end,
    'preco', case when p.opcoes -> 'hotel.link_sem_preco' = 'true'::jsonb then jsonb_build_object('mostrar', false)
      else (
        select jsonb_build_object('mostrar', true, 'de', min(d.v), 'ate', max(d.v),
          'varia', (p.opcoes -> 'hotel.temporadas' -> 'ativo' = 'true'::jsonb and jsonb_typeof(p.opcoes -> 'hotel.temporadas' -> 'lista') = 'array'
                    and jsonb_array_length(p.opcoes -> 'hotel.temporadas' -> 'lista') > 0)
                or exists (select 1 from public.hotel_precos h where h.petshop_id = p.id and h.feriado -> 'ativo' = 'true'::jsonb)
                   and exists (select 1 from public.dias_especiais x where x.petshop_id = p.id and x.feriado and x.dia >= (now() at time zone p.fuso)::date))
        from (select public.diaria_sugerida(p.id, 'hotel', t.porte) as v from (values (null::text), ('P'), ('M'), ('G'), ('GG')) as t(porte)) d
      ) end,
    'atraso', case when p.opcoes -> 'hotel.link_sem_preco' = 'true'::jsonb then null else (
      select jsonb_build_object('hora', h.atraso -> 'hotel' ->> 'hora', 'valor', h.atraso -> 'hotel' -> 'valor',
        'tolerancia', case when jsonb_typeof(h.atraso -> 'tolerancia') = 'number' then least(180, greatest(0, round((h.atraso ->> 'tolerancia')::numeric))) else 0 end)
      from public.hotel_precos h
      where h.petshop_id = p.id and h.atraso -> 'ativo' = 'true'::jsonb
        and coalesce(h.atraso -> 'hotel' ->> 'hora', '') ~ '^([01]\d|2[0-3]):[0-5]\d$'
        and jsonb_typeof(h.atraso -> 'hotel' -> 'valor') = 'number' and (h.atraso -> 'hotel' ->> 'valor')::numeric > 0
    ) end,
    -- desconto do segundo pet (o link já aplica na estimativa): o "Tirar dúvida" pode responder
    'segundo', case when p.opcoes -> 'hotel.link_sem_preco' = 'true'::jsonb then null
      when p.opcoes -> 'hotel.desconto_segundo_pet' -> 'ativo' = 'true'::jsonb and jsonb_typeof(p.opcoes -> 'hotel.desconto_segundo_pet' -> 'pct') = 'number'
        and (p.opcoes -> 'hotel.desconto_segundo_pet' ->> 'pct')::numeric > 0
      then least(100, (p.opcoes -> 'hotel.desconto_segundo_pet' ->> 'pct')::numeric) end,
    'busca_ate', public.hotel_busca_ate(p.id),
    'busca_hora', (select h.atraso -> 'hotel' ->> 'hora' from public.hotel_precos h where h.petshop_id = p.id and public.hotel_busca_ate(p.id) is not null),
    'horas', public.hotel_horas_de(p.opcoes),
    'pix', case when coalesce((p.opcoes -> 'hotel.sinal' ->> 'ativo')::boolean, false) then public.pix_do_petshop(p.opcoes) end
  )
  from public.petshops p
  where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)
$$;

-- Os planos mensais da creche para o link (Meu pet shop, Mais opções da creche: "Mostrar os planos mensais no link").
-- Só com a creche pedida pelo link e a opção ligada; com "esconder os preços do link" ligado, os planos saem sem valor.
-- Devolve { planos: [{ nome, vezes, valor }], pix } ou null.
create or replace function public.link_creche_planos(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when coalesce(p.link_creche, false) and p.opcoes -> 'creche.planos_no_link' = 'true'::jsonb then jsonb_build_object(
      'planos', coalesce((select jsonb_agg(jsonb_build_object('nome', m.nome, 'vezes', m.vezes,
          'valor', case when p.opcoes -> 'hotel.link_sem_preco' = 'true'::jsonb then null else m.valor_mensal end)
          order by m.vezes nulls last, m.valor_mensal, m.nome)
        from public.creche_modelos m where m.petshop_id = p.id and m.ativo), '[]'::jsonb),
      'pix', public.pix_do_petshop(p.opcoes))
    end
  from public.petshops p
  where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)
$$;
revoke execute on function public.link_creche_planos(text) from public;
grant execute on function public.link_creche_planos(text) to anon, authenticated;

-- Os nomes dos dias fechados (feriado, folga), para o link dizer "Não abrimos em sexta, 20/11 (Consciência Negra)" em vez de
-- parecer que a creche nunca abre às sextas. Só os que têm nome.
create or replace function public.link_fechados_nomes(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_object_agg(d.dia::text, btrim(d.nome)), '{}'::jsonb)
  from public.petshops p
  join public.dias_especiais d on d.petshop_id = p.id and d.fechado
  where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)
    and nullif(btrim(coalesce(d.nome, '')), '') is not null
    and d.dia >= (now() at time zone p.fuso)::date and d.dia <= (now() at time zone p.fuso)::date + 400
$$;
revoke execute on function public.link_fechados_nomes(text) from public;
grant execute on function public.link_fechados_nomes(text) to anon, authenticated;
