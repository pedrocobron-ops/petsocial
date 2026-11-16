-- Creche: dia de experiência, desconto para irmãos e extrato do mês por cachorro.
-- Tudo é opcional por negócio e começa desligado (opções em petshops.opcoes, ligadas em Meu pet shop).
-- Só acrescenta: duas colunas novas com valor padrão (creche_cobrancas.desconto_irmao, estadias.experiencia), uma em
-- pedidos_agendamento, funções novas e funções trocadas com a mesma assinatura. O código que está no ar continua funcionando:
-- com as opções desligadas (o código de hoje nem consegue ligar), o desconto de irmão é sempre zero e nenhum dia é de experiência,
-- então as funções trocadas devolvem e gravam o mesmo de antes. Não depende da 20261149 nem da 20261157 (as "depois do deploy").
--
-- 1. Desconto para irmãos ('creche.desconto_irmao' = {ativo, tipo: 'pct' | 'reais', valor, qual: 'mais_barato' | 'segundo'}):
--    quando o mesmo tutor tem mais de um cão com plano no mês, um paga a mensalidade cheia e os outros têm o desconto.
--    'mais_barato': paga cheio o plano de mensalidade mais alta (empate: o plano que começou antes); 'segundo': paga cheio o plano
--    que começou antes. Conta como irmão no mês o plano que vale em algum dia do mês (sem pausa o mês todo) e tem valor.
--    O desconto vale só sobre a mensalidade (não sobre dias extras nem taxas). Em % vale sobre a mensalidade do mês (proporcional
--    ou cheia); em R$, num mês proporcional, acompanha a proporção (R$ × mensalidade do mês / mensalidade cheia).
--    Fica dentro de `desconto` (o total continua mensalidade + extras − desconto, para tudo o que já lê a cobrança) e a parte do
--    irmão fica anotada em `desconto_irmao`, para a cobrança, a mensagem e o extrato mostrarem a linha "Desconto irmão".
--    Mesma conta em src/lib/gestao/creche.ts (descontoIrmao). Cobrança já paga, ou com parte recebida, não muda.
-- 2. Dia de experiência ('creche.experiencia' = {ativo, max, link}, preço em 'creche.experiencia_preco', fora do que a equipe lê):
--    um dia avulso de creche marcado em `estadias.experiencia`, para cão que ainda não tem plano, até `max` por cão. O banco põe o
--    preço do dia de experiência (zero = gratuito). O tutor pode pedir pelo link (pedidos_agendamento.experiencia); no aceite, a
--    estadia criada vira dia de experiência se ainda couber.
-- 3. Extrato por cachorro: só leitura, nada no banco.

-- ============================================================
-- Colunas
-- ============================================================
alter table public.creche_cobrancas add column if not exists desconto_irmao numeric(10, 2) not null default 0 check (desconto_irmao >= 0);
grant select (desconto_irmao) on public.creche_cobrancas to authenticated;
comment on column public.creche_cobrancas.desconto_irmao is 'Parte de `desconto` que é o desconto para irmãos (opção creche.desconto_irmao). O total já desconta.';

alter table public.estadias add column if not exists experiencia boolean not null default false;
grant select (experiencia) on public.estadias to authenticated;
comment on column public.estadias.experiencia is 'Dia de experiência da creche (opção creche.experiencia): dia avulso de um cão que ainda não é mensalista.';

alter table public.pedidos_agendamento add column if not exists experiencia boolean not null default false;
grant select (experiencia) on public.pedidos_agendamento to authenticated;
comment on column public.pedidos_agendamento.experiencia is 'O tutor pediu dia de experiência pelo link (creche).';

-- ============================================================
-- Opções: o preço do dia de experiência e o valor do desconto de irmão ficam fora do que a equipe sem dinheiro lê
-- ============================================================
-- Igual à 20261169, com 'creche.experiencia_preco' fora e 'creche.desconto_irmao' só com o "ativo".
create or replace function public.opcoes_sem_valores(o jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(x.k, case
      when x.k in ('hotel.diaria_por_porte', 'hotel.temporadas', 'hotel.desconto_segundo_pet', 'hotel.taxas', 'creche.desconto_irmao')
        then jsonb_build_object('ativo', case when jsonb_typeof(x.v) = 'object' then coalesce(x.v -> 'ativo', 'false'::jsonb) else 'false'::jsonb end)
      else x.v end), '{}'::jsonb)
  from jsonb_each(coalesce(o, '{}'::jsonb)) as x(k, v)
  where x.k not in ('dinheiro.multa_fixa', 'dinheiro.multa_pct', 'dinheiro.juros_mes_pct', 'dinheiro.taxa_falta', 'creche.experiencia_preco')
$$;

-- ============================================================
-- 1. Desconto para irmãos
-- ============================================================
create or replace function public.creche_irmao_ligado(p_petshop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.opcoes -> 'creche.desconto_irmao' -> 'ativo' = 'true'::jsonb
      and jsonb_typeof(s.opcoes -> 'creche.desconto_irmao' -> 'valor') = 'number'
      and (s.opcoes -> 'creche.desconto_irmao' ->> 'valor')::numeric > 0
      and coalesce(s.opcoes -> 'creche.desconto_irmao' ->> 'tipo', '') in ('pct', 'reais')
    from public.petshops s where s.id = p_petshop), false)
$$;
revoke execute on function public.creche_irmao_ligado(uuid) from public, anon, authenticated;

-- O desconto de irmão de um plano num mês, para a mensalidade `p_mensal` (a cheia é `p_cheio`). Zero quando a opção está
-- desligada, quando o tutor não tem outro cão com plano no mês ou quando este é o plano que paga cheio.
create or replace function public.creche_desconto_irmao(p_plano uuid, p_mes date, p_mensal numeric, p_cheio numeric) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare
  pl public.creche_planos;
  o jsonb;
  v_valor numeric;
  v_tipo text;
  v_qual text;
  v_cliente uuid;
  v_mes date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_n int;
  v_esta boolean;
  v_primeiro uuid;
  v_desc numeric;
begin
  if coalesce(p_mensal, 0) <= 0 then return 0; end if;
  select * into pl from public.creche_planos where id = p_plano;
  if not found or not public.creche_irmao_ligado(pl.petshop_id) then return 0; end if;
  select s.opcoes -> 'creche.desconto_irmao' into o from public.petshops s where s.id = pl.petshop_id;
  v_valor := (o ->> 'valor')::numeric;
  v_tipo := o ->> 'tipo';
  v_qual := case when o ->> 'qual' = 'segundo' then 'segundo' else 'mais_barato' end;
  select x.cliente_id into v_cliente from public.pets x where x.id = pl.pet_id;
  if v_cliente is null then return 0; end if;
  with irmaos as (
    select p2.id, p2.inicio, p2.criado_em, v2.valor_mensal
      from public.creche_planos p2
      join public.pets x on x.id = p2.pet_id
      join public.creche_planos_valores v2 on v2.plano_id = p2.id
     where p2.petshop_id = pl.petshop_id and x.cliente_id = v_cliente
       and p2.inicio <= v_fim and (p2.fim is null or p2.fim >= v_mes)
       and public.creche_sugestao_mensal(p2.id, v_mes, 1) > 0
  )
  select count(*), bool_or(i.id = pl.id),
         (array_agg(i.id order by case when v_qual = 'segundo' then 0 else -i.valor_mensal end, i.inicio, i.criado_em, i.id))[1]
    into v_n, v_esta, v_primeiro
    from irmaos i;
  if v_n < 2 or not coalesce(v_esta, false) or v_primeiro = pl.id then return 0; end if;
  if v_tipo = 'pct' then
    v_desc := round(p_mensal * least(v_valor, 100) / 100, 2);
  elsif coalesce(p_cheio, 0) > 0 and p_mensal < p_cheio then
    v_desc := round(v_valor * p_mensal / p_cheio, 2);
  else
    v_desc := v_valor;
  end if;
  return least(greatest(v_desc, 0), p_mensal);
end $$;
revoke execute on function public.creche_desconto_irmao(uuid, date, numeric, numeric) from public, anon, authenticated;

-- Refaz o desconto de irmão das cobranças abertas de um tutor (de um mês, ou de todos com `p_mes` nulo): só as que não têm nenhum
-- recebimento. Com a opção desligada não mexe em nada, a não ser com `p_forcar` (o dono desligou e pediu para tirar o desconto).
-- Devolve quantas cobranças mudaram.
create or replace function public.creche_irmaos_refazer(p_petshop uuid, p_cliente uuid, p_mes date default null, p_forcar boolean default false) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  c public.creche_cobrancas;
  v_novo numeric(10, 2);
  v_desc numeric(10, 2);
  v_n int := 0;
begin
  if p_cliente is null then return 0; end if;
  if not coalesce(p_forcar, false) and not public.creche_irmao_ligado(p_petshop) then return 0; end if;
  for c in
    select cc.* from public.creche_cobrancas cc join public.pets x on x.id = cc.pet_id
     where cc.petshop_id = p_petshop and x.cliente_id = p_cliente and cc.status = 'aberta' and not cc.acerto_saida
       and (p_mes is null or cc.mes = date_trunc('month', p_mes)::date)
     order by cc.mes, cc.id
     for update of cc
  loop
    if c.lancamento_id is not null and (public.creche_cobranca_paga(c.lancamento_id) or public.recebido_em_partes(c.lancamento_id) > 0) then continue; end if;
    v_novo := public.creche_desconto_irmao(c.plano_id, c.mes, c.valor_mensal, c.valor_cheio);
    if v_novo = c.desconto_irmao then continue; end if;
    v_desc := greatest(0, c.desconto - c.desconto_irmao) + v_novo;
    if v_desc > c.valor_mensal + c.valor_extras then v_desc := c.valor_mensal + c.valor_extras; end if;
    v_novo := least(v_novo, v_desc);
    update public.creche_cobrancas set desconto_irmao = v_novo, desconto = v_desc, total = valor_mensal + valor_extras - v_desc where id = c.id;
    perform public.creche_cobranca_lancar(c.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.creche_irmaos_refazer(uuid, uuid, date, boolean) from public, anon, authenticated;

-- O dono ligou, mudou ou desligou o desconto de irmão em Meu pet shop: as cobranças abertas (sem recebimento) do mês corrente
-- em diante acompanham a regra nova. Só quem cuida do financeiro. Devolve quantas mudaram.
create or replace function public.creche_irmaos_aplicar(p_petshop uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  s public.petshops;
  v_mes date;
  r record;
  v_n int := 0;
begin
  if not public.cuido_do_financeiro(p_petshop) then raise exception 'Só quem cuida do financeiro muda as cobranças.'; end if;
  if not public.acesso_liberado(p_petshop) then raise exception 'Sua conta está só para consulta.'; end if;
  select * into s from public.petshops where id = p_petshop;
  v_mes := date_trunc('month', (now() at time zone s.fuso))::date;
  for r in
    select distinct x.cliente_id, cc.mes from public.creche_cobrancas cc join public.pets x on x.id = cc.pet_id
     where cc.petshop_id = p_petshop and cc.status = 'aberta' and cc.mes >= v_mes and x.cliente_id is not null
  loop
    v_n := v_n + public.creche_irmaos_refazer(p_petshop, r.cliente_id, r.mes, true);
  end loop;
  return v_n;
end $$;
revoke execute on function public.creche_irmaos_aplicar(uuid) from public, anon;
grant execute on function public.creche_irmaos_aplicar(uuid) to authenticated;

-- O plano mudou (começo, fim, pausa, dias, valor): quem paga cheio pode mudar, e as cobranças abertas da família acompanham.
create or replace function public.creche_irmaos_plano_mudou() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_pet uuid;
  v_cliente uuid;
begin
  if not public.creche_irmao_ligado(new.petshop_id) then return new; end if;
  if tg_table_name = 'creche_planos' then v_pet := new.pet_id;
  else select pet_id into v_pet from public.creche_planos where id = new.plano_id; end if;
  select cliente_id into v_cliente from public.pets where id = v_pet;
  perform public.creche_irmaos_refazer(new.petshop_id, v_cliente, null);
  return new;
end $$;
revoke execute on function public.creche_irmaos_plano_mudou() from public, anon, authenticated;
drop trigger if exists creche_irmaos_plano on public.creche_planos;
create trigger creche_irmaos_plano after insert or update of inicio, fim, pausa_de, pausa_ate, dias, pet_id on public.creche_planos
  for each row execute function public.creche_irmaos_plano_mudou();
drop trigger if exists creche_irmaos_valor on public.creche_planos_valores;
create trigger creche_irmaos_valor after insert or update of valor_mensal on public.creche_planos_valores
  for each row execute function public.creche_irmaos_plano_mudou();

-- ------------------------------------------------------------
-- Cobrança do mês (igual à de 20261153, com o desconto de irmão e a família acompanhando)
-- ------------------------------------------------------------
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
  perform public.creche_cobranca_lancar(v_id);
  -- o irmão que entrou agora pode mudar quem paga cheio: as outras cobranças abertas da família no mês acompanham
  perform public.creche_irmaos_refazer(pl.petshop_id, v_cliente, v_mes);
  return v_id;
end $$;
-- Alterar a cobrança (igual à de 20261138): `p_desconto` é o desconto combinado; o de irmão continua à parte. Mudou a mensalidade
-- e a opção está ligada: o desconto de irmão é refeito sobre o valor novo; desligada, fica o que já estava (no máximo a mensalidade).
create or replace function public.creche_cobranca_editar(p_id uuid, p_valor numeric, p_desconto numeric, p_vencimento date, p_obs text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.creche_cobrancas;
  v_desconto numeric(10, 2) := greatest(coalesce(p_desconto, 0), 0);
  v_irmao numeric(10, 2);
begin
  select * into c from public.creche_cobrancas where id = p_id for update;
  if not found or not public.cuido_do_financeiro(c.petshop_id) then raise exception 'Cobrança não encontrada.'; end if;
  if not public.acesso_liberado(c.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if c.status <> 'aberta' then raise exception 'Esta cobrança foi cancelada.'; end if;
  if public.creche_cobranca_paga(c.lancamento_id) then raise exception 'Esta mensalidade já foi paga. Desfaça o recebimento antes de alterar.'; end if;
  if p_valor is null or p_valor < 0 or p_valor > 99999.99 then raise exception 'Confira o valor da mensalidade.'; end if;
  if p_vencimento is null then raise exception 'Escolha o vencimento.'; end if;
  v_irmao := c.desconto_irmao;
  if p_valor <> c.valor_mensal and not c.acerto_saida then
    v_irmao := case when public.creche_irmao_ligado(c.petshop_id) then public.creche_desconto_irmao(c.plano_id, c.mes, p_valor, c.valor_cheio)
                    else least(c.desconto_irmao, p_valor) end;
  end if;
  if v_desconto + v_irmao > p_valor + c.valor_extras then raise exception 'O desconto é maior que a cobrança.'; end if;
  update public.creche_cobrancas set valor_mensal = p_valor, desconto = v_desconto + v_irmao, desconto_irmao = v_irmao,
    total = p_valor + valor_extras - v_desconto - v_irmao,
    vencimento = p_vencimento, obs = nullif(left(btrim(coalesce(p_obs, '')), 300), '') where id = c.id;
  perform public.creche_cobranca_lancar(c.id);
end $$;

-- A conta a receber mudou de valor no Financeiro (igual à de 20261142): o desconto de irmão nunca passa do desconto.
create or replace function public.creche_lancamento_da_cobranca() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_total numeric;
begin
  if coalesce(current_setting('maestro.creche', true), '') = '1' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if exists (select 1 from public.creche_cobrancas c where c.lancamento_id = old.id and c.status = 'aberta')
       and exists (select 1 from public.petshops p where p.id = old.petshop_id) then
      raise exception 'Esta conta é de uma mensalidade da creche. Para cancelar ou desfazer, abra Creche, Cobranças.';
    end if;
    return old;
  end if;
  if new.valor is distinct from old.valor or new.vencimento is distinct from old.vencimento then
    if exists (select 1 from public.creche_cobrancas c where c.lancamento_id = new.id and c.status = 'aberta') then
      v_total := new.valor + public.recebido_em_partes(new.id);
      update public.creche_cobrancas c set
        total = v_total,
        desconto = greatest(0, c.valor_mensal + c.valor_extras - v_total),
        desconto_irmao = least(c.desconto_irmao, greatest(0, c.valor_mensal + c.valor_extras - v_total)),
        valor_mensal = c.valor_mensal + greatest(0, v_total - (c.valor_mensal + c.valor_extras)),
        vencimento = coalesce(new.vencimento, c.vencimento)
        where c.lancamento_id = new.id and c.status = 'aberta';
    end if;
  end if;
  return new;
end $$;

-- Dias extras e taxas que ficaram sem cobrança quando o plano acabou (igual à de 20261167; a cobrança de acerto não tem desconto)
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
  perform public.creche_cobranca_lancar(v_id);
  return v_id;
end $$;

-- ============================================================
-- 2. Dia de experiência
-- ============================================================
create or replace function public.creche_experiencia_ligada(p_petshop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select s.opcoes -> 'creche.experiencia' -> 'ativo' = 'true'::jsonb from public.petshops s where s.id = p_petshop), false)
$$;
revoke execute on function public.creche_experiencia_ligada(uuid) from public, anon, authenticated;

-- Quantos dias de experiência cada cão pode ter (1 a 10; sem número, 1).
create or replace function public.creche_experiencia_max(p_petshop uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce((select case when jsonb_typeof(s.opcoes -> 'creche.experiencia' -> 'max') = 'number'
      then greatest(1, least(10, round((s.opcoes -> 'creche.experiencia' ->> 'max')::numeric)::int)) end
    from public.petshops s where s.id = p_petshop), 1)
$$;
revoke execute on function public.creche_experiencia_max(uuid) from public, anon, authenticated;

-- Marcar (ou desmarcar) um dia de creche como de experiência. Confere a opção, se o cão já é mensalista e o limite por cão, e põe
-- o preço do dia de experiência (zero = gratuito). Desmarcado antes da saída, volta a diária de sempre.
-- O nome com "zz" faz este gatilho correr depois de estadias_guardar_valores (os gatilhos correm em ordem de nome).
create or replace function public.estadias_zz_experiencia() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_nome text;
  v_porte text;
  v_max int;
  v_n int;
  v_preco jsonb;
begin
  if tg_op = 'INSERT' and not new.experiencia then return new; end if;
  if tg_op = 'UPDATE' and new.experiencia is not distinct from old.experiencia and new.tipo is not distinct from old.tipo then return new; end if;
  if tg_op = 'UPDATE' and not new.experiencia and not old.experiencia then return new; end if;
  select x.nome, x.porte into v_nome, v_porte from public.pets x where x.id = new.pet_id;
  if tg_op = 'UPDATE' and old.status = 'encerrada' and new.experiencia is distinct from old.experiencia then
    raise exception 'O dia de % já terminou: não dá mais para mudar se foi dia de experiência.', coalesce(v_nome, 'este pet');
  end if;
  if not new.experiencia then
    if new.status <> 'encerrada' then new.valor_diaria := public.diaria_sugerida(new.petshop_id, new.tipo, v_porte); end if;
    return new;
  end if;
  if new.tipo <> 'creche' or new.mensalista is not null then
    raise exception 'O dia de experiência é só para um dia avulso de creche.';
  end if;
  if tg_op = 'UPDATE' and old.experiencia then return new; end if;
  if not public.creche_experiencia_ligada(new.petshop_id) then
    raise exception 'O dia de experiência está desligado. O dono liga em Meu pet shop, Opções da creche.';
  end if;
  if exists (select 1 from public.creche_planos p where p.pet_id = new.pet_id) then
    raise exception '% já é mensalista: o dia de experiência é para quem ainda não tem plano.', coalesce(v_nome, 'Este pet');
  end if;
  v_max := public.creche_experiencia_max(new.petshop_id);
  select count(*) into v_n from public.estadias e
    where e.pet_id = new.pet_id and e.experiencia and e.status <> 'cancelada' and e.id <> new.id;
  if v_n >= v_max then
    raise exception '% já teve % (o limite por cão é %).', coalesce(v_nome, 'Este pet'),
      case when v_n = 1 then '1 dia de experiência' else v_n || ' dias de experiência' end, v_max;
  end if;
  select s.opcoes -> 'creche.experiencia_preco' into v_preco from public.petshops s where s.id = new.petshop_id;
  new.valor_diaria := case when jsonb_typeof(v_preco) = 'number' then least(99999.99, greatest(0, (v_preco #>> '{}')::numeric)) else 0 end;
  return new;
end $$;
revoke execute on function public.estadias_zz_experiencia() from public, anon, authenticated;
drop trigger if exists estadias_zz_experiencia on public.estadias;
create trigger estadias_zz_experiencia before insert or update of experiencia, tipo on public.estadias
  for each row execute function public.estadias_zz_experiencia();

-- Pedido pelo link com dia de experiência, aceito: a estadia criada vira dia de experiência, se ainda couber (opção ligada, cão sem
-- plano, dentro do limite). Se não couber, fica um dia avulso comum e o aceite segue.
create or replace function public.pedidos_experiencia_aceite() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.experiencia and new.estadia_id is not null and old.estadia_id is null then
    begin
      update public.estadias set experiencia = true where id = new.estadia_id and not experiencia and tipo = 'creche';
    exception when others then
      null;
    end;
  end if;
  return new;
end $$;
revoke execute on function public.pedidos_experiencia_aceite() from public, anon, authenticated;
drop trigger if exists pedidos_experiencia_aceite on public.pedidos_agendamento;
create trigger pedidos_experiencia_aceite after update of estadia_id on public.pedidos_agendamento
  for each row execute function public.pedidos_experiencia_aceite();

-- O que o link do cliente precisa saber do dia de experiência: se está ligado no link, quantos por cão e o preço
-- (nulo quando o dono esconde o preço no link; zero = gratuito).
create or replace function public.link_creche_experiencia(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when public.creche_experiencia_ligada(p.id) and coalesce(p.opcoes -> 'creche.experiencia' -> 'link' = 'true'::jsonb, false)
    then jsonb_build_object('ativo', true, 'max', public.creche_experiencia_max(p.id),
      'preco', case when p.opcoes -> 'hotel.link_sem_preco' = 'true'::jsonb then null
                    when jsonb_typeof(p.opcoes -> 'creche.experiencia_preco') = 'number' then greatest(0, (p.opcoes ->> 'creche.experiencia_preco')::numeric)
                    else 0 end)
    else jsonb_build_object('ativo', false) end
  from public.petshops p
  where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)
$$;
revoke execute on function public.link_creche_experiencia(text) from public;
grant execute on function public.link_creche_experiencia(text) to anon, authenticated;

-- Pedido pelo link (igual à de 20261168, com o dia de experiência: a chave p_experiencia sai dos argumentos e vai para o pedido)
create or replace function public.link_pedir_com_termos(p_funcao text, p_args jsonb, p_termos text default null, p_vacinas boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.petshops;
  o jsonb;
  v_lista text;
  r jsonb;
  v_id uuid;
  v_grupo uuid;
  v_args jsonb := p_args;
  v_he text;
  v_hs text;
  v_exp boolean := false;
begin
  if p_funcao not in ('link_pedir', 'link_pedir_estadia', 'link_espera_pedir') or jsonb_typeof(p_args) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_args) k where k !~ '^p_[a-z_]{1,40}$') then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end if;
  select * into v from public.petshops where link_codigo = p_args ->> 'p_codigo' and link_ativo;
  if not found or not public.acesso_liberado(v.id) then return jsonb_build_object('ok', false, 'erro', 'fechado'); end if;
  o := public.link_opcoes_de(v.opcoes);
  -- dia de experiência (opção da creche): o tutor marca no pedido de creche de um dia só; o pedido guarda a marca
  if p_funcao = 'link_pedir_estadia' and p_args ? 'p_experiencia' then
    v_exp := p_args -> 'p_experiencia' = 'true'::jsonb;
    v_args := v_args - 'p_experiencia';
    if v_exp and (p_args ->> 'p_tipo' is distinct from 'creche' or p_args ->> 'p_entrada' is distinct from p_args ->> 'p_saida'
                  or not public.creche_experiencia_ligada(v.id)) then
      return jsonb_build_object('ok', false, 'erro', 'experiencia');
    end if;
  end if;
  -- hotel: chegada e busca só em dia que abre e dentro do horário de funcionamento daquele dia (ver link_hotel_dia_recusado)
  if p_funcao = 'link_pedir_estadia' and p_args ->> 'p_tipo' = 'hotel' then
    r := public.link_hotel_dia_recusado(v.id, public.dia_iso(p_args ->> 'p_entrada'), coalesce(p_args ->> 'p_hora_entrada', '08:00'), 'entrada');
    if r is null then r := public.link_hotel_dia_recusado(v.id, public.dia_iso(p_args ->> 'p_saida'), coalesce(p_args ->> 'p_hora_saida', '18:00'), 'saida'); end if;
    if r is not null then return r; end if;
  end if;
  if p_funcao = 'link_espera_pedir' then
    v_he := case when p_args ->> 'p_hora_entrada' ~ '^([01]\d|2[0-3]):[0-5]\d$' then p_args ->> 'p_hora_entrada' end;
    v_hs := case when p_args ->> 'p_hora_saida' ~ '^([01]\d|2[0-3]):[0-5]\d$' then p_args ->> 'p_hora_saida' end;
    v_args := v_args - 'p_hora_entrada' - 'p_hora_saida';
  end if;
  if (o ->> 'termos')::boolean then
    if regexp_replace(btrim(coalesce(p_termos, '')), '\r', '', 'g') <> regexp_replace(o ->> 'texto', '\r', '', 'g')
       or ((o ->> 'vacinas')::boolean and not coalesce(p_vacinas, false)) then
      return jsonb_build_object('ok', false, 'erro', 'termos');
    end if;
  end if;
  select string_agg(format('%I => %L', e.key,
      case jsonb_typeof(e.value) when 'null' then null when 'string' then e.value #>> '{}' else e.value::text end), ', ')
    into v_lista from jsonb_each(v_args) e;
  begin
    execute format('select public.%I(%s)', p_funcao, v_lista) into r;
  exception when undefined_function or invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end;
  if p_funcao = 'link_espera_pedir' and r ->> 'ok' = 'true' and (r ->> 'id') is not null then
    v_id := (r ->> 'id')::uuid;
    perform set_config('maestro.link', '1', true);
    update public.lista_espera
      set hora_entrada = coalesce(v_he, hora_entrada), hora_saida = coalesce(v_hs, hora_saida),
          termos_aceitos_em = case when (o ->> 'termos')::boolean then now() else termos_aceitos_em end
      where id = v_id and petshop_id = v.id;
    perform set_config('maestro.link', '', true);
    return r;
  end if;
  if v_exp and r ->> 'ok' = 'true' and (r ->> 'id') is not null then
    v_id := (r ->> 'id')::uuid;
    select grupo_id into v_grupo from public.pedidos_agendamento where id = v_id;
    update public.pedidos_agendamento set experiencia = true
      where petshop_id = v.id and (id = v_id or (v_grupo is not null and grupo_id = v_grupo));
  end if;
  if (o ->> 'termos')::boolean and r ->> 'ok' = 'true' and (r ->> 'id') is not null then
    v_id := (r ->> 'id')::uuid;
    select grupo_id into v_grupo from public.pedidos_agendamento where id = v_id;
    update public.pedidos_agendamento
      set termos_aceitos_em = now(), termos_texto = nullif(o ->> 'texto', ''), termos_vacinas = (o ->> 'vacinas')::boolean
      where petshop_id = v.id and (id = v_id or (v_grupo is not null and grupo_id = v_grupo));
  end if;
  return r;
end $$;

notify pgrst, 'reload schema';
