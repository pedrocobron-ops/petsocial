-- Recebimentos: o que os testes com donos de verdade pediram em volta de receber dinheiro.
-- 1) Receber uma parte de uma conta (fiado, pacote, mensalidade, hotel): a parte recebida vira uma entrada paga de verdade
--    (no caixa aberto, com forma de pagamento) e o resto continua na mesma conta a receber.
-- 2) "Cobrado em" nas contas dos clientes, para a cobrança pelo WhatsApp lembrar quando foi mandada.
-- 3) Comissão: percentual por serviço, comissão paga (uma vez por período) e "Minha comissão" para a própria pessoa.
-- Tudo é somado ao que existe: colunas novas sem obrigação, funções novas, e as funções trocadas mantêm a assinatura
-- e fazem o mesmo de antes enquanto ninguém recebeu uma conta em partes. O aplicativo que está no ar continua funcionando.

-- ---------- conta recebida em partes ----------
-- `conta_id`: esta entrada paga é uma parte recebida daquela conta a receber.
-- `valor_original`: numa conta que já teve parte recebida, o valor cheio dela (o que falta + o que já foi recebido em partes).
--                   `valor` continua sendo o que falta (ou, depois de quitada, a última parte paga).
-- `cobrado_em`: quando a cobrança desta conta foi mandada pelo WhatsApp pela última vez.
alter table public.lancamentos
  add column conta_id uuid references public.lancamentos (id) on delete set null,
  add column valor_original numeric(10, 2) check (valor_original is null or valor_original > 0),
  add column cobrado_em timestamptz;
create index lancamentos_conta_id_idx on public.lancamentos (conta_id) where conta_id is not null;

-- Quanto já foi recebido em partes de uma conta.
create function public.recebido_em_partes(p_conta uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.valor), 0) from public.lancamentos l where l.conta_id = p_conta and l.pago
$$;
revoke execute on function public.recebido_em_partes(uuid) from public, anon, authenticated;

-- `conta_id` e `valor_original` são escritos só pelo banco (pela função de receber e pelos gatilhos abaixo):
-- o que vier do aplicativo nesses dois campos é recusado ou ignorado. O valor cheio é sempre refeito pela conta.
create function public.manter_conta_em_partes() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_banco boolean := (select auth.uid()) is null or pg_trigger_depth() > 1 or coalesce(current_setting('maestro.recebimento', true), '') = '1';
  v_partes numeric;
begin
  if tg_op = 'INSERT' then
    if not v_banco and (new.conta_id is not null or new.valor_original is not null) then
      raise exception 'Para receber uma parte de uma conta, use o botão Recebi.';
    end if;
    return new;
  end if;
  if not v_banco and new.conta_id is distinct from old.conta_id then
    raise exception 'Este recebimento é parte de uma conta e não pode ser ligado a outra.';
  end if;
  if coalesce(current_setting('maestro.recebimento', true), '') = '1' then return new; end if;
  if old.valor_original is null then
    new.valor_original := null;
  else
    v_partes := public.recebido_em_partes(old.id);
    new.valor_original := case when v_partes > 0 then new.valor + v_partes else null end;
  end if;
  return new;
end $$;
create trigger manter_conta_em_partes before insert or update on public.lancamentos
  for each row execute function public.manter_conta_em_partes();

-- Uma parte recebida foi apagada ou teve o valor corrigido: a conta acompanha.
-- Conta ainda em aberto: o que foi apagado volta a ser devido. Conta já quitada: só o valor cheio é refeito.
create function public.parte_de_conta_mudou() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  c public.lancamentos;
  v_volta numeric;
begin
  if old.conta_id is null then return null; end if;
  if tg_op = 'UPDATE' and new.valor is not distinct from old.valor and new.conta_id is not distinct from old.conta_id then return null; end if;
  select * into c from public.lancamentos x where x.id = old.conta_id for update;
  if not found then return null; end if;
  v_volta := case when tg_op = 'DELETE' or new.conta_id is null then old.valor else old.valor - new.valor end;
  if c.pago then
    update public.lancamentos set valor_original = valor_original where id = c.id;
  else
    if c.valor + v_volta <= 0 then
      raise exception 'Este recebimento é parte de uma conta: ele não pode passar de % (o que já foi recebido mais o que falta). Para quitar a conta, use o botão Recebi.',
        replace(to_char(old.valor + c.valor - 0.01, 'FM999999990D00'), '.', ',');
    end if;
    update public.lancamentos set valor = c.valor + v_volta where id = c.id;
  end if;
  return null;
end $$;
create trigger parte_de_conta_mudou after delete or update on public.lancamentos
  for each row execute function public.parte_de_conta_mudou();
revoke execute on function public.manter_conta_em_partes(), public.parte_de_conta_mudou() from public, anon, authenticated;

-- As partes de um pagamento dividido, conferidas: formas válidas e soma igual ao total. Uma forma só devolve null.
create function public.pagamentos_conferidos(p_pagamentos jsonb, p_total numeric) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  x jsonb;
  v numeric;
  v_soma numeric := 0;
  v_saida jsonb := '[]'::jsonb;
begin
  if p_pagamentos is null or jsonb_typeof(p_pagamentos) <> 'array' or jsonb_array_length(p_pagamentos) < 2 then return null; end if;
  if jsonb_array_length(p_pagamentos) > 3 then raise exception 'O pagamento pode ser dividido em até três formas.'; end if;
  for x in select * from jsonb_array_elements(p_pagamentos) loop
    if jsonb_typeof(x) <> 'object' or coalesce(x ->> 'forma', '') not in ('dinheiro', 'pix', 'debito', 'credito', 'outro') or jsonb_typeof(x -> 'valor') <> 'number' then
      raise exception 'Confira as formas do pagamento dividido.';
    end if;
    v := round((x ->> 'valor')::numeric, 2);
    if v <= 0 then raise exception 'Cada parte do pagamento precisa ter um valor.'; end if;
    v_soma := v_soma + v;
    v_saida := v_saida || jsonb_build_object('forma', x ->> 'forma', 'valor', v);
  end loop;
  if v_soma <> round(p_total, 2) then raise exception 'As partes do pagamento não fecham com o total.'; end if;
  return v_saida;
end $$;
revoke execute on function public.pagamentos_conferidos(jsonb, numeric) from public, anon, authenticated;

-- Receber uma conta de cliente, inteira ou uma parte, numa operação só.
-- Quem recebe: o dono e quem cuida do financeiro (qualquer conta a receber) e quem opera o caixa (as contas de clientes),
-- como na baixa de sempre. Quem só opera o caixa recebe com a data de hoje.
-- Inteira: a própria conta vira paga (igual à baixa de sempre). Parte: nasce uma entrada paga ligada à conta
-- (no caixa aberto, se o dinheiro andou hoje) e a conta fica com o que falta, no mesmo vencimento ou num novo.
-- `p_multa`: multa e juros que o cliente pagou junto, numa entrada separada (categoria "Multa e juros"). Nunca entra sozinha.
create function public.receber_conta(p_conta uuid, p_valor numeric, p_forma text, p_pagamentos jsonb default null, p_data date default null,
  p_novo_vencimento date default null, p_multa numeric default null, p_multa_forma text default null, p_multa_pagamentos jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  l public.lancamentos;
  v_fin boolean;
  v_fuso text;
  v_hoje date;
  v_data date;
  v_eh_hoje boolean;
  v_caixa uuid;
  v_valor numeric(10, 2) := round(p_valor, 2);
  v_multa numeric(10, 2) := round(coalesce(p_multa, 0), 2);
  v_pg jsonb;
  v_parte uuid;
  v_multa_id uuid;
  v_nome text;
begin
  select * into l from public.lancamentos x where x.id = p_conta for update;
  if not found then raise exception 'Conta não encontrada.'; end if;
  v_fin := public.cuido_do_financeiro(l.petshop_id);
  if not v_fin and not (public.tenho_area(l.petshop_id, array['caixa']) and l.tipo = 'entrada' and (l.cliente_id is not null or l.agendamento_id is not null)) then
    raise exception 'Conta não encontrada.';
  end if;
  if not public.acesso_liberado(l.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if l.pago then raise exception 'Esta conta já tinha sido baixada. Atualize a tela.'; end if;
  if l.tipo <> 'entrada' or l.movimento is not null then raise exception 'Só uma conta a receber pode ser recebida por aqui.'; end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Escreva quanto o cliente pagou.'; end if;
  if v_valor > l.valor then
    raise exception 'O cliente deve % nesta conta. Para receber a mais, lance a diferença como outra entrada.', replace(to_char(l.valor, 'FM999999990D00'), '.', ',');
  end if;
  if coalesce(p_forma, '') not in ('dinheiro', 'pix', 'debito', 'credito', 'outro') then raise exception 'Escolha como o cliente pagou.'; end if;
  if v_multa < 0 or v_multa > 99999.99 then raise exception 'Confira o valor da multa e dos juros.'; end if;
  if v_multa > 0 and coalesce(p_multa_forma, p_forma) not in ('dinheiro', 'pix', 'debito', 'credito', 'outro') then raise exception 'Escolha como o cliente pagou.'; end if;

  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = l.petshop_id;
  v_hoje := (now() at time zone v_fuso)::date;
  v_data := coalesce(p_data, v_hoje);
  -- perto da meia-noite o aparelho pode estar num fuso do Brasil diferente do fuso do pet shop (mesma folga de meus_caixas)
  v_eh_hoje := v_data = v_hoje or v_data between (now() at time zone 'America/Rio_Branco')::date and (now() at time zone 'America/Noronha')::date;
  if not v_eh_hoje then
    if not v_fin then raise exception 'Só quem cuida do financeiro recebe com a data de outro dia.'; end if;
    if v_data > v_hoje then raise exception 'Escolha um dia até hoje.'; end if;
  end if;
  -- só entra no caixa aberto quando o dinheiro andou hoje
  if v_eh_hoje then
    select c.id into v_caixa from public.caixas c where c.petshop_id = l.petshop_id and c.fechado_em is null;
  end if;
  v_pg := public.pagamentos_conferidos(p_pagamentos, v_valor);
  v_nome := coalesce(nullif(btrim(l.descricao), ''), l.categoria);

  if v_valor = l.valor then
    update public.lancamentos set pago = true, data = v_data, forma = p_forma, pagamentos = v_pg, caixa_id = v_caixa where id = l.id;
  else
    perform set_config('maestro.recebimento', '1', true);
    insert into public.lancamentos (petshop_id, tipo, valor, forma, pagamentos, categoria, descricao, data, pago, caixa_id, cliente_id, origem, criado_por, conta_id)
      values (l.petshop_id, 'entrada', v_valor, p_forma, v_pg, l.categoria, left(v_nome, 110) || ' (parte)', v_data, true, v_caixa, l.cliente_id, 'tela', (select auth.uid()), l.id)
      returning id into v_parte;
    -- a conta fica com o que falta. Quem só opera o caixa não altera conta a receber por fora: aqui a conferência já foi feita.
    perform set_config('maestro.creche', '1', true);
    update public.lancamentos set valor = l.valor - v_valor, valor_original = coalesce(l.valor_original, l.valor),
        vencimento = coalesce(p_novo_vencimento, l.vencimento), data = coalesce(p_novo_vencimento, l.vencimento, l.data)
      where id = l.id;
    perform set_config('maestro.creche', '', true);
    perform set_config('maestro.recebimento', '', true);
    -- mensalidade da creche: a cobrança continua com o total cheio; só o vencimento acompanha quando muda
    if p_novo_vencimento is not null then
      update public.creche_cobrancas c set vencimento = p_novo_vencimento where c.lancamento_id = l.id and c.status = 'aberta';
    end if;
  end if;

  if v_multa > 0 then
    insert into public.lancamentos (petshop_id, tipo, valor, forma, pagamentos, categoria, descricao, data, pago, caixa_id, cliente_id, origem, criado_por)
      values (l.petshop_id, 'entrada', v_multa, coalesce(p_multa_forma, p_forma), public.pagamentos_conferidos(p_multa_pagamentos, v_multa), 'Multa e juros',
        left('Multa e juros · ' || v_nome, 120), v_data, true, v_caixa, l.cliente_id, 'tela', (select auth.uid()))
      returning id into v_multa_id;
  end if;
  return jsonb_build_object('quitada', v_valor = l.valor, 'recebido', v_valor, 'falta', l.valor - v_valor, 'parte_id', v_parte, 'multa_id', v_multa_id, 'no_caixa', v_caixa is not null);
end $$;
revoke execute on function public.receber_conta(uuid, numeric, text, jsonb, date, date, numeric, text, jsonb) from public, anon;
grant execute on function public.receber_conta(uuid, numeric, text, jsonb, date, date, numeric, text, jsonb) to authenticated;

-- As partes já recebidas de uma conta (para mostrar "pago R$ 50,00 em 10/11, Pix" dentro da conta).
-- Quem só opera o caixa não lê o histórico de recebimentos; aqui ela vê só as partes da conta de cliente que está recebendo.
create function public.partes_da_conta(p_conta uuid) returns table (id uuid, valor numeric, data date, forma text, pagamentos jsonb, criado_em timestamptz, quem text)
language sql stable security definer set search_path = '' as $$
  select l.id, l.valor, l.data, l.forma, l.pagamentos, l.criado_em,
    (select x.nome from public.profissionais x where x.petshop_id = l.petshop_id and x.user_id = l.criado_por limit 1)
  from public.lancamentos l
  join public.lancamentos c on c.id = l.conta_id
  where c.id = p_conta and l.pago
    and ((select public.cuido_do_financeiro(c.petshop_id))
      or ((select public.tenho_area(c.petshop_id, array['caixa'])) and c.tipo = 'entrada' and (c.cliente_id is not null or c.agendamento_id is not null)))
  order by l.data, l.criado_em
$$;
revoke execute on function public.partes_da_conta(uuid) from public, anon;
grant execute on function public.partes_da_conta(uuid) to authenticated;

-- ---------- mensalidade da creche com parte recebida ----------
-- A cobrança guarda o total cheio; a conta a receber dela fica com o que falta. Sem parte recebida, tudo como antes.
create or replace function public.creche_cobranca_lancar(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.creche_cobrancas;
  v_pet text;
  v_itens jsonb;
  v_desc text;
  v_dias text;
  v_unit numeric;
  v_n int;
  v_recebido numeric := 0;
begin
  select * into c from public.creche_cobrancas where id = p_id;
  select nome into v_pet from public.pets where id = c.pet_id;
  if c.lancamento_id is not null then v_recebido := public.recebido_em_partes(c.lancamento_id); end if;
  perform set_config('maestro.creche', '1', true);
  if c.status <> 'aberta' or c.total <= 0 then
    if v_recebido > 0 then
      raise exception 'Esta mensalidade já teve % recebidos. Para cancelar ou zerar, apague antes esses recebimentos no Financeiro.', replace(to_char(v_recebido, 'FM999999990D00'), '.', ',');
    end if;
    if c.lancamento_id is not null then
      update public.creche_cobrancas set lancamento_id = null where id = c.id;
      delete from public.lancamentos where id = c.lancamento_id and not pago;
    end if;
    return;
  end if;
  if v_recebido > 0 and c.total <= v_recebido then
    raise exception 'Esta mensalidade já teve % recebidos: o total precisa ficar maior que isso.', replace(to_char(v_recebido, 'FM999999990D00'), '.', ',');
  end if;
  v_n := jsonb_array_length(c.extras);
  v_desc := 'Mensalidade de ' || public.creche_nome_mes(c.mes) || ' · ' || coalesce(v_pet, 'pet');
  v_itens := jsonb_build_array(jsonb_build_object('tipo', 'servico', 'nome', 'Mensalidade de ' || public.creche_nome_mes(c.mes), 'qtd', 1, 'valor', c.valor_mensal));
  if v_n > 0 and c.valor_extras > 0 then
    select string_agg(to_char((x ->> 'dia')::date, 'DD/MM'), ', ' order by x ->> 'dia') into v_dias from jsonb_array_elements(c.extras) x;
    v_unit := round(c.valor_extras / v_n, 2);
    if v_unit * v_n = c.valor_extras then
      v_itens := v_itens || jsonb_build_object('tipo', 'servico', 'nome', case when v_n = 1 then 'Dia extra (' else 'Dias extras (' end || v_dias || ')', 'qtd', v_n, 'valor', v_unit);
    else
      v_itens := v_itens || jsonb_build_object('tipo', 'servico', 'nome', 'Dias extras (' || v_dias || ')', 'qtd', 1, 'valor', c.valor_extras);
    end if;
  end if;
  if c.lancamento_id is not null then
    update public.lancamentos set valor = c.total - v_recebido, data = c.vencimento, vencimento = c.vencimento, descricao = v_desc, itens = v_itens, cliente_id = c.cliente_id
      where id = c.lancamento_id and not pago;
  else
    insert into public.lancamentos (petshop_id, tipo, valor, forma, categoria, descricao, data, vencimento, pago, cliente_id, origem, criado_por, itens)
      values (c.petshop_id, 'entrada', c.total, null, 'Creche: mensalidade', v_desc, c.vencimento, c.vencimento, false, c.cliente_id, 'tela', (select auth.uid()), v_itens)
      returning id into c.lancamento_id;
    update public.creche_cobrancas set lancamento_id = c.lancamento_id where id = c.id;
  end if;
end $$;

-- A conta a receber de uma mensalidade mudou no Financeiro: a cobrança acompanha, contando o que já foi recebido em partes.
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
        valor_mensal = c.valor_mensal + greatest(0, v_total - (c.valor_mensal + c.valor_extras)),
        vencimento = coalesce(new.vencimento, c.vencimento)
        where c.lancamento_id = new.id and c.status = 'aberta';
    end if;
  end if;
  return new;
end $$;

-- ---------- comissão ----------
-- Percentual de comissão por serviço (quando a opção "comissão por serviço" está ligada, vale mais que o da pessoa).
-- Como o percentual de cada pessoa, só o dono e quem cuida do financeiro leem; só o dono muda.
create table public.comissao_servicos (
  servico_id uuid primary key,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  pct numeric(5, 2) not null check (pct between 0 and 100),
  foreign key (servico_id, petshop_id) references public.servicos (id, petshop_id) on delete cascade
);
create index on public.comissao_servicos (petshop_id);
alter table public.comissao_servicos enable row level security;
revoke all on public.comissao_servicos from anon, authenticated;
grant select, insert, update, delete on public.comissao_servicos to authenticated;
create policy comissao_servicos_ler on public.comissao_servicos for select to authenticated
  using ((select public.cuido_do_financeiro(petshop_id)));
create policy comissao_servicos_criar on public.comissao_servicos for insert to authenticated
  with check ((select public.sou_dono(petshop_id)) and (select public.acesso_liberado(petshop_id)));
create policy comissao_servicos_editar on public.comissao_servicos for update to authenticated
  using ((select public.sou_dono(petshop_id)) and (select public.acesso_liberado(petshop_id)))
  with check ((select public.sou_dono(petshop_id)));
create policy comissao_servicos_remover on public.comissao_servicos for delete to authenticated
  using ((select public.sou_dono(petshop_id)) and (select public.acesso_liberado(petshop_id)));

-- Comissão marcada como paga: o período de uma pessoa e a despesa que foi lançada. Só o banco escreve (comissao_pagar).
-- Apagar a despesa no Financeiro desfaz a marca.
create table public.comissoes_pagas (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  profissional_id uuid not null,
  de date not null,
  ate date not null check (ate >= de),
  valor numeric(10, 2) not null check (valor > 0),
  lancamento_id uuid not null references public.lancamentos (id) on delete cascade,
  pago_por uuid references auth.users (id) on delete set null,
  pago_em timestamptz not null default now(),
  foreign key (profissional_id, petshop_id) references public.profissionais (id, petshop_id) on delete cascade
);
create index on public.comissoes_pagas (petshop_id, profissional_id, de);
create index on public.comissoes_pagas (lancamento_id);
alter table public.comissoes_pagas enable row level security;
revoke all on public.comissoes_pagas from anon, authenticated;
grant select on public.comissoes_pagas to authenticated;
create policy comissoes_pagas_ler on public.comissoes_pagas for select to authenticated
  using ((select public.cuido_do_financeiro(petshop_id)));

-- Divide o valor de uma conta entre serviço, produto e extra, conforme os itens, com o desconto rateado.
-- A mesma conta do aplicativo (partesDoLancamento): o centavo que sobra vai para a maior parte. Sem itens, tudo nulo.
create function public.partes_do_lancamento(p_valor numeric, p_itens jsonb) returns table (servico numeric, produto numeric, extra numeric)
language plpgsql immutable set search_path = '' as $$
declare
  x jsonb;
  q numeric;
  v numeric;
  b_s numeric := 0; b_p numeric := 0; b_e numeric := 0;
  v_soma numeric;
  v_sobra numeric;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then return next; return; end if;
  for x in select * from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(x) <> 'object' then continue; end if;
    begin
      q := coalesce((x ->> 'qtd')::numeric, 1);
      v := coalesce((x ->> 'valor')::numeric, 0);
    exception when others then continue;
    end;
    if x ->> 'tipo' = 'servico' then b_s := b_s + greatest(0, q * v);
    elsif x ->> 'tipo' = 'produto' then b_p := b_p + greatest(0, q * v);
    else b_e := b_e + greatest(0, q * v);
    end if;
  end loop;
  v_soma := b_s + b_p + b_e;
  if v_soma <= 0 then return next; return; end if;
  servico := round(b_s / v_soma * p_valor, 2);
  produto := round(b_p / v_soma * p_valor, 2);
  extra := round(b_e / v_soma * p_valor, 2);
  v_sobra := p_valor - servico - produto - extra;
  if v_sobra <> 0 then
    if produto > servico and produto >= extra then produto := produto + v_sobra;
    elsif extra > servico and extra > produto then extra := extra + v_sobra;
    else servico := servico + v_sobra;
    end if;
  end if;
  return next;
end $$;

-- A comissão de cada profissional num período (dias no fuso do pet shop), pelos atendimentos concluídos.
-- Base de cada atendimento: a parte de serviço da conta (com o desconto rateado; conta recebida em partes vale pelo valor cheio);
-- sem conta fechada ou pago com pacote, o preço da agenda. Opções do negócio (petshops.opcoes), todas desligadas por padrão:
--   comissao.em_extras   — os extras da conta entram na base;
--   comissao.por_servico — o percentual do serviço (comissao_servicos) vale mais que o da pessoa;
--   comissao.em_produtos — os produtos da conta do atendimento rendem `comissao.produtos_pct` por cento.
create function public.comissao_calcular(p_petshop uuid, p_de date, p_ate date, p_profissional uuid default null)
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
    select a.profissional_id,
      (l.id is null and a.pacote_cliente_id is not null) as pacote,
      case when l.id is not null then coalesce(pt.servico, coalesce(l.valor_original, l.valor)) else coalesce(a.preco, 0) end
        + case when l.id is not null and s.em_extras then coalesce(pt.extra, 0) else 0 end as base,
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
    where p_profissional is null or a.profissional_id = p_profissional
  )
  select g.profissional_id, count(*)::integer, (count(*) filter (where g.pacote))::integer,
    round(sum(g.base), 2), round(sum(g.produtos), 2),
    round(sum(g.base * g.pct / 100), 2), round(sum(g.produtos) * max(g.produtos_pct) / 100, 2),
    round(sum(g.base * g.pct / 100), 2) + round(sum(g.produtos) * max(g.produtos_pct) / 100, 2)
  from ags g group by g.profissional_id
$$;
revoke execute on function public.partes_do_lancamento(numeric, jsonb), public.comissao_calcular(uuid, date, date, uuid) from public, anon, authenticated;

-- Relatórios: a comissão de todos no período. Só o dono e quem cuida do financeiro.
create function public.comissao_do_periodo(p_petshop uuid, p_de date, p_ate date)
returns table (profissional_id uuid, nome text, cor text, ativo boolean, pct numeric, atendimentos integer, com_pacote integer, base numeric, base_produtos numeric,
  comissao_servicos numeric, comissao_produtos numeric, comissao numeric)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nome, p.cor, p.ativo, p.comissao_pct, coalesce(c.atendimentos, 0), coalesce(c.com_pacote, 0), coalesce(c.base, 0), coalesce(c.base_produtos, 0),
    coalesce(c.comissao_servicos, 0), coalesce(c.comissao_produtos, 0), coalesce(c.comissao, 0)
  from public.profissionais p
  left join public.comissao_calcular(p_petshop, p_de, p_ate) c on c.profissional_id = p.id
  where p.petshop_id = p_petshop and (select public.cuido_do_financeiro(p_petshop))
    and p_de is not null and p_ate is not null and p_ate >= p_de and p_ate - p_de <= 366
    and (p.comissao_pct > 0 or coalesce(c.comissao, 0) > 0)
    and (p.ativo or coalesce(c.atendimentos, 0) > 0)
  order by coalesce(c.comissao, 0) desc, p.nome
$$;
revoke execute on function public.comissao_do_periodo(uuid, date, date) from public, anon;
grant execute on function public.comissao_do_periodo(uuid, date, date) to authenticated;

-- "Minha comissão": a comissão de quem está logado, do mês atual e do anterior, e o que já foi marcado como pago.
-- Não mostra nada do financeiro do pet shop nem a comissão de outra pessoa.
create function public.minha_comissao(p_petshop uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  eu public.profissionais;
  v_fuso text;
  v_mes date;
  v_meses jsonb := '[]'::jsonb;
  v_de date;
  v_ate date;
  c record;
  i int;
begin
  select * into eu from public.profissionais x where x.petshop_id = p_petshop and x.user_id = (select auth.uid()) and x.ativo limit 1;
  if not found then return null; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p_petshop;
  v_mes := date_trunc('month', (now() at time zone v_fuso)::date)::date;
  for i in 0..1 loop
    v_de := (v_mes - make_interval(months => i))::date;
    v_ate := (v_de + interval '1 month - 1 day')::date;
    select * into c from public.comissao_calcular(p_petshop, v_de, v_ate, eu.id);
    v_meses := v_meses || jsonb_build_object(
      'de', v_de, 'ate', v_ate,
      'atendimentos', coalesce(c.atendimentos, 0), 'com_pacote', coalesce(c.com_pacote, 0), 'base', coalesce(c.base, 0), 'base_produtos', coalesce(c.base_produtos, 0),
      'comissao_servicos', coalesce(c.comissao_servicos, 0), 'comissao_produtos', coalesce(c.comissao_produtos, 0), 'comissao', coalesce(c.comissao, 0),
      'pagos', coalesce((select jsonb_agg(jsonb_build_object('de', g.de, 'ate', g.ate, 'valor', g.valor, 'pago_em', g.pago_em) order by g.de)
        from public.comissoes_pagas g where g.profissional_id = eu.id and g.de <= v_ate and g.ate >= v_de), '[]'::jsonb));
  end loop;
  return jsonb_build_object('profissional_id', eu.id, 'pct', eu.comissao_pct, 'meses', v_meses);
end $$;
revoke execute on function public.minha_comissao(uuid) from public, anon;
grant execute on function public.minha_comissao(uuid) to authenticated;

-- Marcar a comissão de uma pessoa num período como paga: lança a despesa (categoria "Comissão", no caixa aberto se houver)
-- e guarda o período. O banco refaz a conta: se o valor da tela não é mais o de agora, não paga. Período já pago é recusado.
create function public.comissao_pagar(p_profissional uuid, p_de date, p_ate date, p_forma text, p_valor numeric) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.profissionais;
  g public.comissoes_pagas;
  v_valor numeric;
  v_fuso text;
  v_hoje date;
  v_caixa uuid;
  v_id uuid;
begin
  select * into p from public.profissionais x where x.id = p_profissional for update;
  if not found or not public.cuido_do_financeiro(p.petshop_id) then raise exception 'Pessoa não encontrada.'; end if;
  if not public.acesso_liberado(p.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 366 then raise exception 'Confira o período.'; end if;
  if coalesce(p_forma, '') not in ('dinheiro', 'pix', 'debito', 'credito', 'outro') then raise exception 'Escolha como pagou.'; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p.petshop_id;
  v_hoje := (now() at time zone v_fuso)::date;
  if p_ate > v_hoje then raise exception 'O período ainda não acabou. Escolha um período que termine até hoje.'; end if;
  select * into g from public.comissoes_pagas x where x.profissional_id = p.id and x.de <= p_ate and x.ate >= p_de order by x.de limit 1;
  if found then
    raise exception 'A comissão de % de % a % já foi marcada como paga. Para pagar de novo, desfaça antes esse pagamento.',
      p.nome, to_char(g.de, 'DD/MM/YYYY'), to_char(g.ate, 'DD/MM/YYYY');
  end if;
  select c.comissao into v_valor from public.comissao_calcular(p.petshop_id, p_de, p_ate, p.id) c;
  v_valor := coalesce(v_valor, 0);
  if v_valor <= 0 then raise exception 'Não há comissão para pagar neste período.'; end if;
  if p_valor is null or round(p_valor, 2) <> v_valor then
    raise exception 'A comissão deste período mudou para %. Atualize a tela e confira antes de pagar.', replace(to_char(v_valor, 'FM999999990D00'), '.', ',');
  end if;
  select c.id into v_caixa from public.caixas c where c.petshop_id = p.petshop_id and c.fechado_em is null;
  insert into public.lancamentos (petshop_id, tipo, valor, forma, categoria, descricao, data, pago, caixa_id, origem, criado_por)
    values (p.petshop_id, 'saida', v_valor, p_forma, 'Comissão', left('Comissão de ' || p.nome || ' · ' || to_char(p_de, 'DD/MM') || ' a ' || to_char(p_ate, 'DD/MM/YYYY'), 120),
      v_hoje, true, v_caixa, 'tela', (select auth.uid()))
    returning id into v_id;
  insert into public.comissoes_pagas (petshop_id, profissional_id, de, ate, valor, lancamento_id, pago_por)
    values (p.petshop_id, p.id, p_de, p_ate, v_valor, v_id, (select auth.uid()));
  return v_id;
end $$;
revoke execute on function public.comissao_pagar(uuid, date, date, text, numeric) from public, anon;
grant execute on function public.comissao_pagar(uuid, date, date, text, numeric) to authenticated;

notify pgrst, 'reload schema';
