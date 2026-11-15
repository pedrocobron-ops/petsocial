-- Dinheiro, rodada de correções 5: devolução e crédito do tutor nas contas, diferença ligada ao atendimento, uma regra só
-- para o limite de desconto, saída de estoque do check-out ligada à venda e quem deve na lista de tutores.
--
-- Só acrescenta (colunas novas, funções novas, gatilhos novos) e troca funções mantendo a assinatura e as colunas devolvidas
-- (`comissao_calcular`, `diferencas_do_agendamento`, `anotar_preco_da_venda`, `saida_de_estoque_conferir`). Não depende da 49 nem
-- da 57. O código que está no ar hoje continua funcionando: ele não grava as colunas novas, e as funções trocadas dão o mesmo
-- resultado para o que ele grava (a única mudança que ele sente é o limite de desconto do caixa arredondar para baixo, como a
-- tela já mostra).

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. "Cobrar a diferença": a entrada fica ligada ao atendimento
-- ---------------------------------------------------------------------------------------------------------------------
-- A conta do atendimento é uma só (índice lancamentos_um_por_atendimento), então a diferença não usa `agendamento_id`:
-- tem a coluna dela, `diferenca_de`. A tela grava a marca `diferenca_de` no item (como antes); o banco preenche a coluna
-- pela marca e confere que a diferença ainda falta (segunda aba, toque duplo com outra chave). Entradas antigas, só com a
-- marca, continuam valendo nas contas abaixo.

alter table public.lancamentos add column if not exists diferenca_de uuid;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'lancamentos_diferenca_de_fkey') then
    alter table public.lancamentos add constraint lancamentos_diferenca_de_fkey foreign key (diferenca_de, petshop_id)
      references public.agendamentos (id, petshop_id) on delete set null (diferenca_de);
  end if;
end $$;
create index if not exists lancamentos_diferenca_de_idx on public.lancamentos (diferenca_de) where diferenca_de is not null;

-- O que o horário vale hoje (o principal, ou só os outros quando o principal foi pelo pacote) menos o que a conta fechada
-- cobrou pelos serviços (as linhas de serviço; sem itens, a conta cheia) e as diferenças já recebidas. A mesma conta da tela.
create or replace function public.diferenca_que_falta(p_agendamento uuid, p_sem uuid default null) returns numeric
language sql stable security definer set search_path = '' as $$
  with a as (select * from public.agendamentos x where x.id = p_agendamento),
  horario as (
    select case when a.pacote_cliente_id is not null then 0 else coalesce(a.preco, 0) end
      + coalesce((select sum(coalesce(e.preco, 0)) from public.agendamento_servicos e where e.agendamento_id = a.id), 0) as valor
    from a
  ), conta as (
    select coalesce(sum(case when jsonb_typeof(l.itens) = 'array' and exists (select 1 from jsonb_array_elements(l.itens) i where i ->> 'tipo' = 'servico')
        then (select sum(case when jsonb_typeof(i -> 'valor') = 'number' then (i ->> 'valor')::numeric * case when jsonb_typeof(i -> 'qtd') = 'number' then (i ->> 'qtd')::numeric else 1 end else 0 end)
              from jsonb_array_elements(l.itens) i where i ->> 'tipo' = 'servico')
        else coalesce(l.valor_original, l.valor) end), 0) as valor
    from a join public.lancamentos l on l.agendamento_id = a.id and l.tipo = 'entrada'
  ), dif as (
    select coalesce(sum(coalesce(l.valor_original, l.valor)), 0) as valor
    from a join public.lancamentos l on l.petshop_id = a.petshop_id and l.tipo = 'entrada' and l.agendamento_id is null
      and (l.diferenca_de = a.id or (l.diferenca_de is null and jsonb_typeof(l.itens) = 'array'
           and l.itens @> jsonb_build_array(jsonb_build_object('diferenca_de', a.id::text))))
    where p_sem is null or l.id <> p_sem
  )
  select round(horario.valor - conta.valor - dif.valor, 2) from horario, conta, dif
$$;
revoke execute on function public.diferenca_que_falta(uuid, uuid) from public, anon, authenticated;

create or replace function public.diferenca_ligar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_falta numeric;
begin
  if new.tipo <> 'entrada' or new.agendamento_id is not null then
    new.diferenca_de := null;
    return new;
  end if;
  if new.diferenca_de is null and jsonb_typeof(new.itens) = 'array' then
    select (i ->> 'diferenca_de')::uuid into v_id from jsonb_array_elements(new.itens) i
      where coalesce(i ->> 'diferenca_de', '') ~ '^[0-9a-fA-F-]{36}$' limit 1;
    if v_id is not null and exists (select 1 from public.agendamentos a where a.id = v_id and a.petshop_id = new.petshop_id) then
      new.diferenca_de := v_id;
    end if;
  end if;
  if new.diferenca_de is null or (select auth.uid()) is null then return new; end if;
  -- uma de cada vez por atendimento: a segunda espera a primeira e vê o que ela já recebeu
  perform 1 from public.agendamentos a where a.id = new.diferenca_de for update;
  v_falta := public.diferenca_que_falta(new.diferenca_de);
  if coalesce(new.valor_original, new.valor) > v_falta + 0.005 then
    if v_falta <= 0.005 then
      raise exception 'A diferença deste atendimento já foi recebida. Atualize a tela.';
    end if;
    raise exception 'Deste atendimento falta receber só % de diferença. Atualize a tela.', public.em_reais(v_falta);
  end if;
  return new;
end $$;
revoke execute on function public.diferenca_ligar() from public, anon, authenticated;
drop trigger if exists diferenca_ligar on public.lancamentos;
create trigger diferenca_ligar before insert on public.lancamentos for each row execute function public.diferenca_ligar();

-- Quanto já foi cobrado à parte por "Cobrar a diferença". Mesma função da migração 20261169 (mesma assinatura), contando
-- também a coluna nova.
create or replace function public.diferencas_do_agendamento(p_agendamento uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(coalesce(l.valor_original, l.valor)), 0)
  from public.agendamentos a
  join public.lancamentos l on l.petshop_id = a.petshop_id and l.tipo = 'entrada' and l.agendamento_id is null
    and (l.diferenca_de = a.id or (l.diferenca_de is null and jsonb_typeof(l.itens) = 'array'
         and l.itens @> jsonb_build_array(jsonb_build_object('diferenca_de', a.id::text))))
  where a.id = p_agendamento and (select public.tenho_area(a.petshop_id, array['caixa', 'financeiro', 'relatorios']))
$$;
revoke execute on function public.diferencas_do_agendamento(uuid) from public, anon;
grant execute on function public.diferencas_do_agendamento(uuid) to authenticated;

-- As diferenças de vários atendimentos de uma vez (Relatórios).
create or replace function public.diferencas_dos_agendamentos(p_petshop uuid, p_ids uuid[])
returns table (agendamento_id uuid, valor numeric)
language sql stable security definer set search_path = '' as $$
  select a.id, sum(coalesce(l.valor_original, l.valor))
  from public.agendamentos a
  join public.lancamentos l on l.petshop_id = a.petshop_id and l.tipo = 'entrada' and l.agendamento_id is null
    and (l.diferenca_de = a.id or (l.diferenca_de is null and jsonb_typeof(l.itens) = 'array'
         and l.itens @> jsonb_build_array(jsonb_build_object('diferenca_de', a.id::text))))
  where a.petshop_id = p_petshop and a.id = any (p_ids[1:2000])
    and (select public.tenho_area(p_petshop, array['caixa', 'financeiro', 'relatorios']))
  group by a.id
$$;
revoke execute on function public.diferencas_dos_agendamentos(uuid, uuid[]) from public, anon;
grant execute on function public.diferencas_dos_agendamentos(uuid, uuid[]) to authenticated;

-- Comissão: mesma função da migração 20261147 (mesma assinatura e colunas). Diferença: a diferença recebida à parte entra na
-- parte de serviço da conta do atendimento (e segue a regra de cada serviço, como o resto da conta).
create or replace function public.comissao_calcular(p_petshop uuid, p_de date, p_ate date, p_profissional uuid default null)
returns table (profissional_id uuid, atendimentos integer, com_pacote integer, base numeric, base_produtos numeric, comissao_servicos numeric, comissao_produtos numeric, comissao numeric)
language sql stable security definer set search_path = '' as $$
  with s as (
    select coalesce(x.fuso, 'America/Sao_Paulo') as fuso,
      coalesce(x.opcoes -> 'comissao.em_extras' = 'true'::jsonb, false) as em_extras,
      coalesce(x.opcoes -> 'comissao.por_servico' = 'true'::jsonb, false) as por_servico,
      case when coalesce(x.opcoes -> 'comissao.em_produtos' = 'true'::jsonb, false) and jsonb_typeof(x.opcoes -> 'comissao.produtos_pct') = 'number'
        then least(100, greatest(0, (x.opcoes ->> 'comissao.produtos_pct')::numeric)) else 0 end as produtos_pct
    from public.petshops x where x.id = p_petshop
  ), ags as (
    select a.id, a.profissional_id, a.preco, a.pacote_cliente_id, p.comissao_pct, s.por_servico,
      l.id as conta_id, l.itens, pt.servico as parte_servico, coalesce(l.valor_original, l.valor) as valor_conta,
      exists (select 1 from public.agendamento_servicos e where e.agendamento_id = a.id) as varios,
      (l.id is null and a.pacote_cliente_id is not null) as pacote,
      case when l.id is not null then coalesce(pt.servico, coalesce(l.valor_original, l.valor)) + coalesce(df.valor, 0) else coalesce(a.preco, 0) end as base_servico,
      case when l.id is not null and s.em_extras then coalesce(pt.extra, 0) else 0 end as base_extra,
      case when l.id is not null and s.produtos_pct > 0 then coalesce(pt.produto, 0) else 0 end as produtos,
      case when s.por_servico then coalesce(cs.pct, p.comissao_pct) else p.comissao_pct end as pct,
      s.produtos_pct
    from s
    join public.agendamentos a on a.petshop_id = p_petshop and a.status = 'concluido' and a.profissional_id is not null
      and a.inicio >= (p_de::timestamp at time zone s.fuso) and a.inicio < ((p_ate + 1)::timestamp at time zone s.fuso)
    join public.profissionais p on p.id = a.profissional_id
    left join public.lancamentos l on l.agendamento_id = a.id and l.tipo = 'entrada'
    left join public.comissao_servicos cs on cs.servico_id = a.servico_id
    left join lateral public.partes_do_lancamento(coalesce(l.valor_original, l.valor), l.itens) pt on l.id is not null
    -- "Cobrar a diferença": o que foi recebido à parte depois de a conta fechar
    left join lateral (
      select sum(coalesce(d.valor_original, d.valor)) as valor from public.lancamentos d
      where d.petshop_id = p_petshop and d.tipo = 'entrada' and d.agendamento_id is null
        and (d.diferenca_de = a.id or (d.diferenca_de is null and jsonb_typeof(d.itens) = 'array'
             and d.itens @> jsonb_build_array(jsonb_build_object('diferenca_de', a.id::text))))
    ) df on l.id is not null
    where p_profissional is null or a.profissional_id = p_profissional
  ), contas as (
    select g.profissional_id, g.produtos, g.produtos_pct,
      (g.pacote or (g.varios and g.pacote_cliente_id is not null)) as pacote,
      case when not g.varios then g.base_servico + g.base_extra
        else g.base_extra + coalesce(v.base, 0) + case when g.conta_id is null or g.pacote_cliente_id is not null then coalesce(g.preco, 0) else 0 end
      end as base,
      case when not g.varios then (g.base_servico + g.base_extra) * g.pct
        else g.base_extra * g.pct + coalesce(v.pontos, 0) + case when g.conta_id is null or g.pacote_cliente_id is not null then coalesce(g.preco, 0) * g.pct else 0 end
      end as pontos
    from ags g
    left join lateral (
      -- cada serviço do horário com o valor dele e o percentual que vale para ele
      select sum(r.valor) as base, sum(r.valor * case when g.por_servico then coalesce(c2.pct, g.comissao_pct) else g.comissao_pct end) as pontos
      from (
        select t.servico_id, t.valor from public.partes_por_servico(g.id, g.base_servico, g.itens, g.parte_servico is not null) t where g.conta_id is not null
        union all
        select e.servico_id, coalesce(e.preco, 0) from public.agendamento_servicos e where g.conta_id is null and e.agendamento_id = g.id
      ) r
      left join public.comissao_servicos c2 on c2.servico_id = r.servico_id
    ) v on g.varios
  )
  select g.profissional_id, count(*)::integer, (count(*) filter (where g.pacote))::integer,
    round(sum(g.base), 2), round(sum(g.produtos), 2),
    round(sum(g.pontos / 100), 2), round(sum(g.produtos) * max(g.produtos_pct) / 100, 2),
    round(sum(g.pontos / 100), 2) + round(sum(g.produtos) * max(g.produtos_pct) / 100, 2)
  from contas g group by g.profissional_id
$$;
revoke execute on function public.comissao_calcular(uuid, date, date, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Crédito do tutor usado numa conta (atendimento, creche, A receber)
-- ---------------------------------------------------------------------------------------------------------------------
-- A conta é lançada pelo valor cheio; `credito_usado` diz quanto dela foi pago com o crédito do tutor (no pagamento, é a parte
-- "outro"). O banco tira o crédito do tutor na mesma gravação, pela mesma função de sempre (`credito_do_tutor_mover`), com o
-- movimento ligado à conta (`clientes_creditos.lancamento_id`): sem saldo, nada é gravado; apagar a conta, ou desfazer o
-- recebimento, devolve o crédito. O crédito não é dinheiro que entrou hoje: o caixa não conta essa parte.

alter table public.lancamentos add column if not exists credito_usado numeric(10,2);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'lancamentos_credito_usado_check') then
    alter table public.lancamentos add constraint lancamentos_credito_usado_check check (credito_usado is null or credito_usado > 0);
  end if;
end $$;
alter table public.clientes_creditos add column if not exists lancamento_id uuid references public.lancamentos (id) on delete cascade;
create index if not exists clientes_creditos_lancamento_idx on public.clientes_creditos (lancamento_id) where lancamento_id is not null;

create or replace function public.credito_usado_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_outro numeric;
begin
  if tg_op = 'UPDATE' then
    -- recebimento desfeito: o crédito volta para o tutor (o movimento sai no gatilho de depois)
    if old.pago and not new.pago then new.credito_usado := null; return new; end if;
    if new.credito_usado is distinct from old.credito_usado and coalesce(current_setting('maestro.credito', true), '') <> '1' then
      raise exception 'O crédito usado numa conta não muda por aqui. Para devolver o crédito, apague o recebimento.';
    end if;
  end if;
  if new.credito_usado is null then return new; end if;
  if new.tipo <> 'entrada' or not new.pago or new.movimento is not null or new.cliente_id is null then
    raise exception 'O crédito do tutor só paga uma conta recebida de um tutor.';
  end if;
  v_outro := case when jsonb_typeof(new.pagamentos) = 'array' and jsonb_array_length(new.pagamentos) > 1
    then coalesce((select sum((x ->> 'valor')::numeric) from jsonb_array_elements(new.pagamentos) x where x ->> 'forma' = 'outro' and jsonb_typeof(x -> 'valor') = 'number'), 0)
    when new.forma = 'outro' then new.valor else 0 end;
  if new.credito_usado > new.valor + 0.005 or new.credito_usado > v_outro + 0.005 then
    raise exception 'Confira o crédito usado: ele é uma parte do pagamento desta conta.';
  end if;
  return new;
end $$;
revoke execute on function public.credito_usado_conferir() from public, anon, authenticated;
drop trigger if exists credito_usado_conferir on public.lancamentos;
create trigger credito_usado_conferir before insert or update of credito_usado, pago on public.lancamentos
  for each row execute function public.credito_usado_conferir();

create or replace function public.credito_usado_mover() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r jsonb;
begin
  if tg_op = 'UPDATE' and old.pago and not new.pago then
    delete from public.clientes_creditos c where c.lancamento_id = new.id;
    return null;
  end if;
  if coalesce(new.credito_usado, 0) <= 0 or exists (select 1 from public.clientes_creditos c where c.lancamento_id = new.id) then return null; end if;
  r := public.credito_do_tutor_mover(new.petshop_id, new.cliente_id, -new.credito_usado, null,
    left('Usado: ' || coalesce(nullif(btrim(new.descricao), ''), new.categoria), 200), 'credito-usado:' || new.id::text);
  if not coalesce((r ->> 'ok')::boolean, false) then
    if r ->> 'erro' = 'saldo' then
      raise exception 'O crédito do tutor mudou: agora é de %. Atualize a tela.', public.em_reais(coalesce((r ->> 'saldo')::numeric, 0));
    end if;
    raise exception 'Não consegui usar o crédito do tutor.';
  end if;
  update public.clientes_creditos c set lancamento_id = new.id where c.id = (r ->> 'id')::uuid;
  return null;
end $$;
revoke execute on function public.credito_usado_mover() from public, anon, authenticated;
drop trigger if exists credito_usado_mover on public.lancamentos;
create trigger credito_usado_mover after insert or update of credito_usado, pago on public.lancamentos
  for each row execute function public.credito_usado_mover();

-- Pagar com o crédito do tutor (uma parte ou tudo) uma conta a receber: o mesmo recebimento de sempre (`receber_conta`, forma
-- "outro"), marcado como crédito. A mesma chave de novo devolve o que já foi feito.
create or replace function public.receber_conta_com_credito(p_conta uuid, p_valor numeric, p_chave text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l public.lancamentos;
  v jsonb;
  v_id uuid;
begin
  select * into l from public.lancamentos x where x.id = p_conta;
  if not found then raise exception 'Conta não encontrada.'; end if;
  if l.cliente_id is null then raise exception 'Esta conta não está no nome de um tutor: não dá para usar crédito.'; end if;
  v := public.receber_conta(p_conta, p_valor, 'outro', null, null, null, null, null, null, p_chave);
  if coalesce((v ->> 'repetido')::boolean, false) then return v; end if;
  v_id := coalesce((v ->> 'parte_id')::uuid, p_conta);
  perform set_config('maestro.credito', '1', true);
  update public.lancamentos set credito_usado = round(p_valor, 2) where id = v_id;
  perform set_config('maestro.credito', '', true);
  return v || jsonb_build_object('credito', round(p_valor, 2));
end $$;
revoke execute on function public.receber_conta_com_credito(uuid, numeric, text) from public, anon;
grant execute on function public.receber_conta_com_credito(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Quem deve e quem tem crédito, para a lista de tutores (só para quem mexe com dinheiro)
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.tutores_dinheiro(p_petshop uuid)
returns table (cliente_id uuid, deve numeric, vencido numeric, contas integer, credito numeric)
language sql stable security definer set search_path = '' as $$
  with ok as (select public.tenho_area(p_petshop, array['caixa', 'financeiro', 'relatorios']) as pode),
  hoje as (select (now() at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date as d from public.petshops s where s.id = p_petshop),
  dev as (
    select l.cliente_id, sum(l.valor) as deve, sum(l.valor) filter (where coalesce(l.vencimento, l.data) < (select d from hoje)) as vencido, count(*)::integer as contas
    from public.lancamentos l
    where l.petshop_id = p_petshop and l.tipo = 'entrada' and not l.pago and l.movimento is null and l.cliente_id is not null
    group by l.cliente_id
  ), cre as (
    select c.cliente_id, sum(c.valor) as credito from public.clientes_creditos c where c.petshop_id = p_petshop group by c.cliente_id
  )
  select coalesce(dev.cliente_id, cre.cliente_id), coalesce(dev.deve, 0), coalesce(dev.vencido, 0), coalesce(dev.contas, 0), coalesce(cre.credito, 0)
  from dev full join cre on cre.cliente_id = dev.cliente_id, ok
  where ok.pode and (coalesce(dev.deve, 0) > 0 or coalesce(cre.credito, 0) <> 0)
$$;
revoke execute on function public.tutores_dinheiro(uuid) from public, anon;
grant execute on function public.tutores_dinheiro(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Limite de desconto do caixa: a mesma regra da tela (arredonda para baixo, nunca passa do percentual)
-- ---------------------------------------------------------------------------------------------------------------------
-- Mesma função da migração 20261152. Diferença: o limite é floor(soma × % ) / 100 (5% de R$ 127,50 = R$ 6,37), como a tela.
create or replace function public.anotar_preco_da_venda() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_nome text;
  v_op jsonb;
  v_travado boolean;
  v_max numeric;
  v_fin boolean;
  i jsonb;
  v_valor numeric;
  v_qtd numeric;
  v_tabela numeric;
  v_custo numeric;
  v_soma numeric := 0;
  v_item text;
  v_desc numeric;
begin
  if v_user is null or new.tipo <> 'entrada' or new.conta_id is not null or new.movimento is not null then return null; end if;
  if new.itens is null or jsonb_typeof(new.itens) <> 'array' then return null; end if;
  -- só a conta do atendimento e a venda de produtos têm preço de tabela para comparar
  if new.agendamento_id is null and new.categoria <> 'Venda de produtos' then return null; end if;
  select s.opcoes into v_op from public.petshops s where s.id = new.petshop_id;
  v_travado := coalesce(v_op -> 'dinheiro.preco_travado' = 'true'::jsonb, false);
  v_max := case when jsonb_typeof(v_op -> 'dinheiro.desconto_max_caixa') = 'number' then least(100, greatest(0, (v_op ->> 'dinheiro.desconto_max_caixa')::numeric)) else 0 end;
  v_fin := public.cuido_do_financeiro(new.petshop_id);
  select x.nome into v_nome from public.profissionais x where x.petshop_id = new.petshop_id and x.user_id = v_user limit 1;

  for i in select * from jsonb_array_elements(new.itens) loop
    if jsonb_typeof(i) <> 'object' or jsonb_typeof(i -> 'valor') <> 'number' then continue; end if;
    v_valor := (i ->> 'valor')::numeric;
    v_qtd := case when jsonb_typeof(i -> 'qtd') = 'number' then (i ->> 'qtd')::numeric else 1 end;
    v_soma := v_soma + round(v_qtd * v_valor, 2);
    v_item := left(coalesce(nullif(btrim(i ->> 'nome'), ''), 'Item'), 120);
    v_tabela := null; v_custo := null;
    if i ->> 'tipo' = 'produto' and (i ->> 'produto_id') ~ '^[0-9a-fA-F-]{36}$' then
      select x.preco_venda, x.custo into v_tabela, v_custo from public.produtos x where x.id = (i ->> 'produto_id')::uuid and x.petshop_id = new.petshop_id;
    elsif i ->> 'tipo' = 'servico' and new.agendamento_id is not null then
      if (i ->> 'servico_id') ~ '^[0-9a-fA-F-]{36}$' then
        select e.preco into v_tabela from public.agendamento_servicos e where e.agendamento_id = new.agendamento_id and e.servico_id = (i ->> 'servico_id')::uuid limit 1;
      else
        select a.preco into v_tabela from public.agendamentos a where a.id = new.agendamento_id;
      end if;
    end if;
    -- um centavo de folga: venda por peso arredonda o preço de uma unidade
    if v_tabela is not null and abs(v_valor - v_tabela) > 0.011 then
      if v_travado and not v_fin then
        raise exception 'O preço de % é %. Só o dono ou quem vê o financeiro muda o preço na venda.', v_item, 'R$ ' || replace(to_char(v_tabela, 'FM999999990D00'), '.', ',');
      end if;
      insert into public.precos_alterados (petshop_id, lancamento_id, tipo, item, de, para, qtd, abaixo_do_custo, quem, quem_nome)
        values (new.petshop_id, new.id, 'preco', v_item, v_tabela, v_valor, v_qtd, coalesce(v_custo > 0 and v_valor < v_custo, false), v_user, v_nome);
    end if;
  end loop;

  v_desc := v_soma - coalesce(new.valor_original, new.valor);
  if v_desc > 0.005 then
    -- o limite arredonda para baixo, em centavos (a tela mostra o mesmo número)
    if v_travado and not v_fin and v_desc > floor(v_soma * v_max + 0.000001) / 100 + 0.005 then
      if v_max > 0 then
        raise exception 'O desconto passa do máximo de % por cento que o caixa pode dar (% nesta conta). Peça para o dono ou para quem vê o financeiro.',
          replace(trim(to_char(v_max, 'FM990D99'), ',.'), '.', ','), public.em_reais(floor(v_soma * v_max + 0.000001) / 100);
      end if;
      raise exception 'Só o dono ou quem vê o financeiro dá desconto na venda.';
    end if;
    insert into public.precos_alterados (petshop_id, lancamento_id, tipo, item, de, para, quem, quem_nome)
      values (new.petshop_id, new.id, 'desconto', left(coalesce(nullif(btrim(new.descricao), ''), new.categoria), 120), v_soma, coalesce(new.valor_original, new.valor), v_user, v_nome);
  end if;
  return null;
end $$;
revoke execute on function public.anotar_preco_da_venda() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Produtos do check-out (hotel e creche): a saída do estoque fica ligada à venda
-- ---------------------------------------------------------------------------------------------------------------------
-- O check-out passa a mandar o lançamento da conta (`lancamento_id`); quando a conta não gera lançamento (o sinal ou o
-- crédito do tutor já pagaram tudo), manda a estadia (`estadia_id`). A regra dos 15 minutos fica só de reserva (tela antiga).

alter table public.movimentos_estoque add column if not exists estadia_id uuid references public.estadias (id) on delete set null;
create index if not exists movimentos_estoque_estadia_idx on public.movimentos_estoque (estadia_id) where estadia_id is not null;
grant select (estadia_id) on public.movimentos_estoque to authenticated;

-- Mesma função da migração 20261169 (mesma assinatura). Diferença: saída como "Venda" ligada a uma estadia encerrada há
-- pouco (o produto saiu na conta do check-out) também vale como venda com o dinheiro junto.
create or replace function public.saida_de_estoque_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  p public.produtos;
  v_valor numeric;
  v_qtd text;
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 or new.tipo not in ('saida', 'ajuste') then return new; end if;
  -- a mesma chave de novo (toque duplo) não grava outra vez: não anota outra vez
  if new.chave is not null and exists (select 1 from public.movimentos_estoque m where m.petshop_id = new.petshop_id and m.chave = new.chave) then return new; end if;
  select * into p from public.produtos x where x.id = new.produto_id and x.petshop_id = new.petshop_id;
  if not found then return new; end if;
  if new.tipo = 'saida' and new.motivo = 'Venda' then
    -- a conta do check-out que não lançou dinheiro (sinal ou crédito pagaram): a saída aponta para a estadia acertada agora
    if new.estadia_id is not null and new.lancamento_id is null and exists (select 1 from public.estadias e where e.id = new.estadia_id
        and e.petshop_id = new.petshop_id and e.status = 'encerrada' and e.saida >= now() - interval '1 day')
        and public.tenho_area(new.petshop_id, array['caixa', 'financeiro', 'relatorios']) then
      return new;
    end if;
    -- a venda deste produto já entrou: a saída aponta para ela, ou (tela antiga, que dá a saída sem ligar)
    -- esta pessoa lançou agora há pouco uma entrada com este produto
    if exists (select 1 from public.lancamentos l where l.petshop_id = new.petshop_id and l.tipo = 'entrada'
        and jsonb_typeof(l.itens) = 'array' and l.itens @> jsonb_build_array(jsonb_build_object('produto_id', new.produto_id::text))
        and (l.id = new.lancamento_id
          or (new.lancamento_id is null and l.criado_em >= now() - interval '15 minutes' and l.criado_por = (select auth.uid())))) then
      return new;
    end if;
    v_valor := round(new.quantidade * coalesce(p.preco_venda, 0), 2);
    v_qtd := trim(to_char(new.quantidade, 'FM999999990.###'), '.');
    -- quem não recebe dinheiro (sem Caixa nem Financeiro) não teria como vender: fica anotado para o dono, sem recusar
    perform public.conferir_valor_baixou(new.petshop_id, 'estoque_venda',
      replace(v_qtd, '.', ',') || ' ' || p.unidade || ' de ' || p.nome || ': saída como venda, sem o dinheiro lançado',
      v_valor, 0, case when public.tenho_area(new.petshop_id, array['caixa', 'financeiro', 'relatorios'])
        then 'Com o preço travado, a venda de um produto é pelo Vender, para o dinheiro entrar junto com a saída do estoque.' end,
      null, false, new.id);
    return new;
  end if;
  if new.tipo = 'saida' then
    if new.motivo = 'Uso no banho' then return new; end if;
    v_valor := round(new.quantidade * coalesce(nullif(p.custo, 0), p.preco_venda, 0), 2);
    v_qtd := replace(trim(to_char(new.quantidade, 'FM999999990.###'), '.'), '.', ',');
    perform public.conferir_valor_baixou(new.petshop_id, 'estoque_saida',
      v_qtd || ' ' || p.unidade || ' de ' || p.nome || ' (' || coalesce(nullif(btrim(new.motivo), ''), 'sem motivo') || ')', v_valor, 0, null, null, false, new.id);
    return new;
  end if;
  -- saldo corrigido: só quando fica menor
  if new.quantidade < p.estoque then
    v_valor := round((p.estoque - new.quantidade) * coalesce(nullif(p.custo, 0), p.preco_venda, 0), 2);
    perform public.conferir_valor_baixou(new.petshop_id, 'estoque_saida',
      'Saldo de ' || p.nome || ' corrigido de ' || replace(trim(to_char(p.estoque, 'FM999999990.###'), '.'), '.', ',') || ' para '
        || replace(trim(to_char(new.quantidade, 'FM999999990.###'), '.'), '.', ',') || ' ' || p.unidade
        || case when coalesce(nullif(btrim(new.motivo), ''), 'Contagem') <> 'Contagem' then ' (' || btrim(new.motivo) || ')' else '' end,
      v_valor, 0, null, null, false, new.id);
  end if;
  return new;
end $$;
revoke execute on function public.saida_de_estoque_conferir() from public, anon, authenticated;

notify pgrst, 'reload schema';
