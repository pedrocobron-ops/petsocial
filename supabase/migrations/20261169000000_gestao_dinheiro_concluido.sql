-- Dinheiro, rodada de correções 4: uma regra só, conferida no banco.
--
-- Com o preço travado (`dinheiro.preco_travado`), quem não é o dono nem cuida do financeiro não diminui o dinheiro de um
-- atendimento que já foi concluído, por caminho nenhum: voltar para marcado e trocar o serviço, o preço ou o porte; apagar da
-- agenda; tirar um serviço; mudar o preço de venda de um produto; dar saída de estoque como "Venda" sem o dinheiro entrar.
-- Sem a trava, cada um desses caminhos fica anotado em "Alterações em valores", com quem fez.
-- Também anotados: saída de estoque por perda (e saldo corrigido para menos), porte do pet trocado para menor com horário
-- recente, e a forma de pagamento trocada ("de Dinheiro para Pix") aparece na frase.
--
-- A conferência é uma função só (`conferir_valor_baixou`): recusa com a trava, anota sem ela.
-- O valor de um atendimento na hora em que foi concluído fica guardado pelo banco (`agendamentos.valor_concluido`): é a
-- referência para "baixou ou não". A tela não lê nem grava essa coluna (ela não tem grant de leitura; o banco ignora o que vier).
--
-- Só acrescenta (colunas, funções, gatilhos; a checagem de `precos_alterados.tipo` aceita mais tipos). Não depende da 49 nem
-- da 57. Funções trocadas mantêm a assinatura e as colunas devolvidas (`alteracoes_de_valores`, `servico_tirado`,
-- `opcoes_sem_valores`). O código que está no ar continua funcionando: pet shop sem a trava não tem nada recusado a mais.

-- ---------------------------------------------------------------------------------------------------------------------
-- Alterações em valores: tipos novos
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.precos_alterados drop constraint if exists precos_alterados_tipo_check;
alter table public.precos_alterados add constraint precos_alterados_tipo_check
  check (tipo in ('preco', 'desconto', 'sem_cobranca', 'servico_tirado', 'preco_agenda', 'pacote',
    'atendimento_baixou', 'atendimento_reaberto', 'atendimento_apagado', 'preco_produto', 'estoque_venda', 'estoque_saida', 'porte'));
-- a saída de estoque anotada como venda sem dinheiro sai da lista quando a venda é ligada a ela (tela antiga: liga depois)
alter table public.precos_alterados add column if not exists movimento_id uuid;
create index if not exists precos_alterados_movimento_idx on public.precos_alterados (movimento_id) where movimento_id is not null;

-- ---------------------------------------------------------------------------------------------------------------------
-- A regra, reutilizável
-- ---------------------------------------------------------------------------------------------------------------------
-- Baixou (p_para < p_de), ou mudou quando `p_qualquer`: com a trava e sem ser o dono ou quem cuida do financeiro, recusa com
-- `p_recusa` (sem `p_recusa`, só anota); senão anota em precos_alterados. Devolve true quando anotou.

create or replace function public.conferir_valor_baixou(p_petshop uuid, p_tipo text, p_item text, p_de numeric, p_para numeric,
  p_recusa text default null, p_agendamento uuid default null, p_qualquer boolean default false, p_movimento uuid default null)
returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or p_de is null then return false; end if;
  if p_qualquer then
    if abs(p_de - coalesce(p_para, 0)) <= 0.005 then return false; end if;
  elsif coalesce(p_para, 0) >= p_de - 0.005 then
    return false;
  end if;
  if p_recusa is not null and public.preco_travado(p_petshop) and not public.cuido_do_financeiro(p_petshop) then
    raise exception '%', p_recusa;
  end if;
  insert into public.precos_alterados (petshop_id, agendamento_id, movimento_id, tipo, item, de, para, quem, quem_nome)
    values (p_petshop, p_agendamento, p_movimento, p_tipo, left(coalesce(nullif(btrim(p_item), ''), 'Item'), 200), p_de, coalesce(p_para, 0),
      (select auth.uid()), public.nome_na_equipe(p_petshop));
  return true;
end $$;
revoke execute on function public.conferir_valor_baixou(uuid, text, text, numeric, numeric, text, uuid, boolean, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Atendimento concluído: o valor fica guardado
-- ---------------------------------------------------------------------------------------------------------------------

-- O valor cheio do horário: o principal (com o preço dado) mais os outros serviços (o pacote não tira nada daqui).
create or replace function public.valor_cheio_do_horario(p_agendamento uuid, p_preco numeric) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(p_preco, 0) + coalesce((select sum(coalesce(e.preco, 0)) from public.agendamento_servicos e where e.agendamento_id = p_agendamento), 0)
$$;
revoke execute on function public.valor_cheio_do_horario(uuid, numeric) from public, anon, authenticated;

-- "Banho e tosa + Hidratação" do horário (o principal dado e os outros como estão agora)
create or replace function public.servicos_do_horario_texto(p_agendamento uuid, p_servico uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(string_agg(n, ' + ' order by o), 'atendimento') from (
    select s.nome as n, 0 as o from public.servicos s where s.id = p_servico
    union all
    select s.nome, e.ordem from public.agendamento_servicos e join public.servicos s on s.id = e.servico_id where e.agendamento_id = p_agendamento
  ) z
$$;
revoke execute on function public.servicos_do_horario_texto(uuid, uuid) from public, anon, authenticated;

-- "Bob, 14/11"
create or replace function public.pet_e_dia(p_petshop uuid, p_pet uuid, p_inicio timestamptz) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.nome from public.pets p where p.id = p_pet), 'Pet') || ', ' ||
    to_char(p_inicio at time zone coalesce((select x.fuso from public.petshops x where x.id = p_petshop), 'America/Sao_Paulo'), 'DD/MM')
$$;
revoke execute on function public.pet_e_dia(uuid, uuid, timestamptz) from public, anon, authenticated;

alter table public.agendamentos add column if not exists valor_concluido numeric(10, 2);
-- os serviços na hora em que foi concluído ("Banho e tosa + Hidratação"), para a frase do que mudou depois
alter table public.agendamentos add column if not exists concluido_servicos text;
-- sem grant de leitura: é a referência do banco, não um valor para a tela

-- os que já estão concluídos começam com o valor de agora
update public.agendamentos a set valor_concluido = public.valor_cheio_do_horario(a.id, a.preco),
    concluido_servicos = public.servicos_do_horario_texto(a.id, a.servico_id)
  where a.status = 'concluido' and a.valor_concluido is null;

create or replace function public.valor_do_concluido() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_frio numeric;
  v_agora numeric;
  v_quem boolean := (select auth.uid()) is not null and pg_trigger_depth() <= 1;
  v_conta boolean;
  v_antes text;
  v_depois text;
  v_rotulo text;
begin
  if tg_op = 'INSERT' then
    new.valor_concluido := case when new.status = 'concluido' then coalesce(new.preco, 0) end;
    new.concluido_servicos := case when new.status = 'concluido' then public.servicos_do_horario_texto(new.id, new.servico_id) end;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if not v_quem or old.sem_cobranca or old.pacote_cliente_id is not null then return old; end if;
    v_frio := coalesce(old.valor_concluido, case when old.status = 'concluido' then public.valor_cheio_do_horario(old.id, old.preco) end);
    if coalesce(v_frio, 0) <= 0 then return old; end if;
    -- com conta fechada, o dinheiro fica no lançamento (e só o dono ou quem cuida do financeiro apaga: proteger_concluido)
    if exists (select 1 from public.lancamentos l where l.agendamento_id = old.id and l.tipo = 'entrada') then return old; end if;
    perform public.conferir_valor_baixou(old.petshop_id, 'atendimento_apagado',
      public.servicos_do_horario_texto(old.id, old.servico_id) || ' de ' || public.pet_e_dia(old.petshop_id, old.pet_id, old.inicio)
        || case when old.status = 'concluido' then ', concluído e sem conta fechada' else ', que já tinha sido concluído' end,
      v_frio, 0, 'Com o preço travado, só o dono ou quem vê o financeiro apaga da agenda um atendimento que já foi concluído.');
    return old;
  end if;

  -- UPDATE: quem guarda o valor é o banco (o que a tela mandar é ignorado)
  if pg_trigger_depth() <= 1 then new.valor_concluido := old.valor_concluido; new.concluido_servicos := old.concluido_servicos; end if;
  v_frio := coalesce(old.valor_concluido, case when old.status = 'concluido' then public.valor_cheio_do_horario(old.id, old.preco) end);

  if v_quem and coalesce(v_frio, 0) > 0 and not old.sem_cobranca and old.pacote_cliente_id is null
     and (old.status = 'concluido' or new.status = 'concluido') then
    v_conta := exists (select 1 from public.lancamentos l where l.agendamento_id = old.id and l.tipo = 'entrada');
    if not v_conta then
      if old.status = 'concluido' and new.status <> 'concluido' then
        v_rotulo := case new.status when 'cancelado' then 'desmarcado' when 'faltou' then 'falta' when 'em_atendimento' then 'em atendimento' when 'confirmado' then 'confirmado' else 'marcado' end;
        perform public.conferir_valor_baixou(old.petshop_id, 'atendimento_reaberto',
          public.servicos_do_horario_texto(old.id, old.servico_id) || ' de ' || public.pet_e_dia(old.petshop_id, old.pet_id, old.inicio)
            || ', concluído e sem conta fechada, voltou para ' || v_rotulo,
          v_frio, 0, 'Com o preço travado, só o dono ou quem vê o financeiro volta para marcado um atendimento que já foi concluído. Se falta cobrar, feche a conta pelo preço do horário.',
          old.id);
      elsif new.status = 'concluido' then
        v_agora := public.valor_cheio_do_horario(new.id, new.preco);
        if v_agora < v_frio - 0.005 then
          v_antes := coalesce(old.concluido_servicos, public.servicos_do_horario_texto(old.id, old.servico_id));
          v_depois := public.servicos_do_horario_texto(new.id, new.servico_id);
          perform public.conferir_valor_baixou(old.petshop_id, 'atendimento_baixou',
            public.pet_e_dia(old.petshop_id, old.pet_id, old.inicio) || ': ' ||
              case when v_antes = v_depois then v_depois else v_antes || ' virou ' || v_depois end,
            v_frio, v_agora,
            'Com o preço travado, só o dono ou quem vê o financeiro baixa o valor de um atendimento já concluído (era ' || public.em_reais(v_frio) || ').',
            old.id);
        end if;
      end if;
    end if;
  end if;

  -- concluído (de novo ou ainda): o valor guardado passa a ser o de agora
  if new.status = 'concluido' then
    new.valor_concluido := public.valor_cheio_do_horario(new.id, new.preco);
    new.concluido_servicos := public.servicos_do_horario_texto(new.id, new.servico_id);
  end if;
  return new;
end $$;
revoke execute on function public.valor_do_concluido() from public, anon, authenticated;
drop trigger if exists valor_do_concluido on public.agendamentos;
-- o nome deixa este gatilho por último entre os "before" (depois de proteger_concluido e da trava do preço)
create trigger valor_do_concluido before insert or update or delete on public.agendamentos
  for each row execute function public.valor_do_concluido();

-- Serviços a mais de um horário concluído: conferidos no fim da operação (trocar um por outro apaga e junta na mesma chamada)
create or replace function public.valor_do_concluido_servicos() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a public.agendamentos;
  v_agora numeric;
begin
  select * into a from public.agendamentos x where x.id = coalesce(case when tg_op = 'DELETE' then old.agendamento_id else new.agendamento_id end, old.agendamento_id);
  if not found or a.status <> 'concluido' then return null; end if;
  v_agora := public.valor_cheio_do_horario(a.id, a.preco);
  if (select auth.uid()) is not null and a.valor_concluido is not null and v_agora < a.valor_concluido - 0.005
     and not a.sem_cobranca and a.pacote_cliente_id is null
     and not exists (select 1 from public.lancamentos l where l.agendamento_id = a.id and l.tipo = 'entrada') then
    if exists (select 1 from public.precos_alterados x where x.agendamento_id = a.id and x.quando = now() and x.tipo in ('servico_tirado', 'atendimento_baixou')) then
      -- já anotado nesta operação (serviço tirado da conta): com a trava, a recusa vale do mesmo jeito
      if public.preco_travado(a.petshop_id) and not public.cuido_do_financeiro(a.petshop_id) then
        raise exception 'Com o preço travado, só o dono ou quem vê o financeiro baixa o valor de um atendimento já concluído (era %).', public.em_reais(a.valor_concluido);
      end if;
    else
      perform public.conferir_valor_baixou(a.petshop_id, 'atendimento_baixou',
        public.pet_e_dia(a.petshop_id, a.pet_id, a.inicio) || ': ' || coalesce(a.concluido_servicos || ' virou ', 'ficou ') || public.servicos_do_horario_texto(a.id, a.servico_id),
        a.valor_concluido, v_agora,
        'Com o preço travado, só o dono ou quem vê o financeiro baixa o valor de um atendimento já concluído (era ' || public.em_reais(a.valor_concluido) || ').',
        a.id);
    end if;
  end if;
  -- o valor guardado acompanha (o gatilho do horário recalcula)
  update public.agendamentos x set valor_concluido = v_agora, concluido_servicos = public.servicos_do_horario_texto(a.id, a.servico_id)
    where x.id = a.id and (x.valor_concluido is distinct from v_agora or x.concluido_servicos is distinct from public.servicos_do_horario_texto(a.id, a.servico_id));
  return null;
end $$;
revoke execute on function public.valor_do_concluido_servicos() from public, anon, authenticated;
drop trigger if exists valor_do_concluido_servicos on public.agendamento_servicos;
create constraint trigger valor_do_concluido_servicos after insert or update or delete on public.agendamento_servicos
  deferrable initially deferred for each row execute function public.valor_do_concluido_servicos();

-- ---------------------------------------------------------------------------------------------------------------------
-- Preço de venda de produto
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.preco_do_produto_mudou() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 or new.preco_venda is not distinct from old.preco_venda or old.preco_venda is null then
    return new;
  end if;
  perform public.conferir_valor_baixou(new.petshop_id, 'preco_produto', new.nome, old.preco_venda, new.preco_venda,
    'Com o preço travado, só o dono ou quem vê o financeiro muda o preço de venda de um produto.', null, true);
  return new;
end $$;
revoke execute on function public.preco_do_produto_mudou() from public, anon, authenticated;
drop trigger if exists preco_do_produto_mudou on public.produtos;
create trigger preco_do_produto_mudou before update of preco_venda on public.produtos
  for each row execute function public.preco_do_produto_mudou();

-- ---------------------------------------------------------------------------------------------------------------------
-- Saídas de estoque
-- ---------------------------------------------------------------------------------------------------------------------
-- "Venda" sem o dinheiro lançado junto (a saída não aponta para uma venda deste produto): com a trava, recusa; sem ela, anota.
-- Perda, vencido, qualquer outro motivo (menos uso no banho) e saldo corrigido para menos: anota, pelo custo.

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
    -- a venda deste produto já entrou: a saída aponta para ela, ou (telas que dão a saída sem ligar, como o check-out do hotel)
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
drop trigger if exists saida_de_estoque_conferir on public.movimentos_estoque;
-- depois de movimentos_estoque_prepara (ordem alfabética), antes de o saldo mudar
create trigger saida_de_estoque_conferir before insert on public.movimentos_estoque
  for each row execute function public.saida_de_estoque_conferir();

-- A tela antiga dá a saída e liga a venda depois: ligada a uma venda deste produto, a anotação de "sem dinheiro" sai.
create or replace function public.saida_de_estoque_ligada() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.lancamento_id is not null and new.lancamento_id is distinct from old.lancamento_id and new.motivo = 'Venda'
     and exists (select 1 from public.lancamentos l where l.id = new.lancamento_id and l.petshop_id = new.petshop_id and l.tipo = 'entrada'
       and jsonb_typeof(l.itens) = 'array' and l.itens @> jsonb_build_array(jsonb_build_object('produto_id', new.produto_id::text))) then
    delete from public.precos_alterados x where x.movimento_id = new.id and x.tipo = 'estoque_venda';
  end if;
  return null;
end $$;
revoke execute on function public.saida_de_estoque_ligada() from public, anon, authenticated;
drop trigger if exists saida_de_estoque_ligada on public.movimentos_estoque;
create trigger saida_de_estoque_ligada after update of lancamento_id on public.movimentos_estoque
  for each row execute function public.saida_de_estoque_ligada();

-- ---------------------------------------------------------------------------------------------------------------------
-- Porte do pet trocado para menor, com horário nos últimos 7 dias ou hoje
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.porte_do_pet_baixou() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_ordem constant text[] := array['P', 'M', 'G', 'GG'];
  v_nome constant text[] := array['Pequeno', 'Médio', 'Grande', 'Gigante'];
  v_de integer := array_position(v_ordem, old.porte);
  v_para integer := array_position(v_ordem, new.porte);
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 or v_de is null or v_para is null or v_para >= v_de then return null; end if;
  if not exists (select 1 from public.agendamentos a where a.pet_id = new.id and a.petshop_id = new.petshop_id
      and a.status <> 'cancelado' and a.inicio >= now() - interval '7 days' and a.inicio < now() + interval '1 day') then
    return null;
  end if;
  insert into public.precos_alterados (petshop_id, tipo, item, de, para, quem, quem_nome)
    values (new.petshop_id, 'porte', left(new.nome || ': de ' || v_nome[v_de] || ' para ' || v_nome[v_para] || ', com atendimento nos últimos dias', 200),
      null, 0, (select auth.uid()), public.nome_na_equipe(new.petshop_id));
  return null;
end $$;
revoke execute on function public.porte_do_pet_baixou() from public, anon, authenticated;
drop trigger if exists porte_do_pet_baixou on public.pets;
create trigger porte_do_pet_baixou after update of porte on public.pets for each row execute function public.porte_do_pet_baixou();

-- ---------------------------------------------------------------------------------------------------------------------
-- "Cobrar a diferença" de um atendimento já pago: a entrada da diferença não liga ao horário (a conta do horário é uma só),
-- leva a marca `diferenca_de` no item. Esta função diz quanto já foi cobrado assim (para quem recebe).
-- ---------------------------------------------------------------------------------------------------------------------

create or replace function public.diferencas_do_agendamento(p_agendamento uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(coalesce(l.valor_original, l.valor)), 0)
  from public.agendamentos a
  join public.lancamentos l on l.petshop_id = a.petshop_id and l.tipo = 'entrada' and l.agendamento_id is null
    and jsonb_typeof(l.itens) = 'array' and l.itens @> jsonb_build_array(jsonb_build_object('diferenca_de', a.id::text))
  where a.id = p_agendamento and (select public.tenho_area(a.petshop_id, array['caixa', 'financeiro', 'relatorios']))
$$;
revoke execute on function public.diferencas_do_agendamento(uuid) from public, anon;
grant execute on function public.diferencas_do_agendamento(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Serviço já feito tirado da conta (mesma regra; a frase da recusa fala do valor)
-- ---------------------------------------------------------------------------------------------------------------------
-- Igual à 20261160; só passa pela função da regra.

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
  select left(coalesce(s.nome, 'Serviço') || ' de ' || public.pet_e_dia(a.petshop_id, a.pet_id, a.inicio), 120)
    into v_item from public.servicos s where s.id = old.servico_id;
  perform public.conferir_valor_baixou(old.petshop_id, 'servico_tirado', coalesce(v_item, 'Serviço'), old.preco, 0, null, a.id);
  return null;
end $$;
revoke execute on function public.servico_tirado() from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- Alterações em valores: a forma de pagamento trocada diz de qual para qual (e o que muda na gaveta)
-- ---------------------------------------------------------------------------------------------------------------------

-- quanto de um lançamento (como estava em `j`) é em dinheiro
create or replace function public.parte_em_dinheiro(j jsonb, p_valor numeric) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when jsonb_typeof(j -> 'pagamentos') = 'array' and jsonb_array_length(j -> 'pagamentos') > 1 then
      coalesce((select sum((x ->> 'valor')::numeric) from jsonb_array_elements(j -> 'pagamentos') x where x ->> 'forma' = 'dinheiro'), 0)
    when j ->> 'forma' = 'dinheiro' then coalesce(p_valor, 0)
    else 0 end
$$;

-- "Pix", "Dinheiro e Pix"
create or replace function public.forma_por_extenso(j jsonb) returns text
language sql immutable set search_path = '' as $$
  select case
    when jsonb_typeof(j -> 'pagamentos') = 'array' and jsonb_array_length(j -> 'pagamentos') > 1 then
      (select string_agg(case x ->> 'forma' when 'pix' then 'Pix' when 'dinheiro' then 'Dinheiro' when 'debito' then 'Débito' when 'credito' then 'Crédito' else 'Outro' end
         || ' ' || public.em_reais((x ->> 'valor')::numeric), ' e ') from jsonb_array_elements(j -> 'pagamentos') x)
    else case j ->> 'forma' when 'pix' then 'Pix' when 'dinheiro' then 'Dinheiro' when 'debito' then 'Débito' when 'credito' then 'Crédito'
      when 'outro' then 'Outro' else 'sem forma' end end
$$;

-- Mesmas colunas de antes. Novo: troca de forma de pagamento vira `alterou_forma`, com "de Dinheiro para Pix" e o que a
-- gaveta passou a esperar na descrição (a tela antiga mostra a descrição como está).
create or replace function public.alteracoes_de_valores(p uuid, p_todas boolean default false)
returns table (id uuid, tipo text, quando timestamptz, quem_nome text, descricao text, de numeric, para numeric, abaixo_do_custo boolean, nova boolean)
language sql stable security definer set search_path = '' as $$
  with eu as (
    select (select auth.uid()) as uid,
      coalesce((select v.visto_em from public.alteracoes_vistas v where v.petshop_id = p and v.user_id = (select auth.uid())),
        (select s.criado_em from public.petshops s where s.id = p)) as visto
  ), bruto as (
    select a.id, a.acao, a.quando, a.quem, a.quem_nome, l.itens, l.agendamento_id, l.categoria, a.antes, a.depois, l.forma, l.pagamentos,
      coalesce(nullif(btrim(coalesce(l.descricao, a.antes ->> 'descricao')), ''), l.categoria, a.antes ->> 'categoria', 'Lançamento') as descricao,
      case when a.acao = 'apagou' then (a.antes ->> 'valor')::numeric when a.antes ? 'valor' then (a.antes ->> 'valor')::numeric else l.valor end as de,
      case when a.acao = 'apagou' then null when a.depois ? 'valor' then (a.depois ->> 'valor')::numeric else l.valor end as para
    from public.lancamentos_alteracoes a
    left join public.lancamentos l on l.id = a.lancamento_id
    where a.petshop_id = p and a.quando >= now() - interval '60 days'
      and (a.acao = 'apagou' or a.antes ?| array['valor', 'forma', 'pagamentos', 'data', 'tipo'])
      -- baixa de uma conta a pagar ou desfazer de recebimento não é "valor recebido alterado"
      and coalesce((a.antes ->> 'pago')::boolean, true)
  ), com_forma as (
    select b.*,
      b.acao <> 'apagou' and (b.antes ? 'forma' or b.antes ? 'pagamentos') as mudou_forma,
      -- a forma de antes e a de depois, cada uma com o que não mudou vindo do lançamento
      jsonb_build_object('forma', case when b.antes ? 'forma' then b.antes -> 'forma' else to_jsonb(b.forma) end,
        'pagamentos', case when b.antes ? 'pagamentos' then b.antes -> 'pagamentos' else b.pagamentos end) as f_antes,
      jsonb_build_object('forma', case when b.depois ? 'forma' then b.depois -> 'forma' else to_jsonb(b.forma) end,
        'pagamentos', case when b.depois ? 'pagamentos' then b.depois -> 'pagamentos' else b.pagamentos end) as f_depois
    from bruto b
  ), tudo as (
    select b.id,
      case when b.acao = 'apagou' then 'apagou'
           when b.de is not null and b.para is not null and b.para < b.de - 0.005 and (b.itens is not null or b.agendamento_id is not null) then 'alterou_venda'
           when b.mudou_forma and public.forma_por_extenso(b.f_antes) <> public.forma_por_extenso(b.f_depois) then 'alterou_forma'
           else 'alterou' end as tipo,
      b.quando, b.quem, b.quem_nome,
      case when b.mudou_forma and public.forma_por_extenso(b.f_antes) <> public.forma_por_extenso(b.f_depois) then
        b.descricao || ' (de ' || public.forma_por_extenso(b.f_antes) || ' para ' || public.forma_por_extenso(b.f_depois)
          || case
               when public.parte_em_dinheiro(b.f_antes, b.de) - public.parte_em_dinheiro(b.f_depois, b.para) > 0.005
                 then '; a gaveta passou a esperar ' || public.em_reais(public.parte_em_dinheiro(b.f_antes, b.de) - public.parte_em_dinheiro(b.f_depois, b.para)) || ' a menos'
               when public.parte_em_dinheiro(b.f_depois, b.para) - public.parte_em_dinheiro(b.f_antes, b.de) > 0.005
                 then '; a gaveta passou a esperar ' || public.em_reais(public.parte_em_dinheiro(b.f_depois, b.para) - public.parte_em_dinheiro(b.f_antes, b.de)) || ' a mais'
               else '' end || ')'
      else b.descricao end as descricao,
      b.de, b.para,
      coalesce(b.acao <> 'apagou' and b.para is not null and jsonb_typeof(b.itens) = 'array' and b.para < (
        select sum(case when jsonb_typeof(i -> 'qtd') = 'number' then (i ->> 'qtd')::numeric else 1 end * x.custo)
        from jsonb_array_elements(b.itens) i
        join public.produtos x on x.petshop_id = p and i ->> 'tipo' = 'produto' and (i ->> 'produto_id') ~ '^[0-9a-fA-F-]{36}$' and x.id = (i ->> 'produto_id')::uuid
        where x.custo > 0) - 0.005, false) as abaixo_do_custo
    from com_forma b
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
-- Opção nova com valor: taxa de falta ("Faltou" oferece anotar). Fica fora do que a equipe sem dinheiro lê.
-- ---------------------------------------------------------------------------------------------------------------------
-- Igual à 20261144, com 'dinheiro.taxa_falta' na lista.

create or replace function public.opcoes_sem_valores(o jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(x.k, case
      when x.k in ('hotel.diaria_por_porte', 'hotel.temporadas', 'hotel.desconto_segundo_pet', 'hotel.taxas')
        then jsonb_build_object('ativo', case when jsonb_typeof(x.v) = 'object' then coalesce(x.v -> 'ativo', 'false'::jsonb) else 'false'::jsonb end)
      else x.v end), '{}'::jsonb)
  from jsonb_each(coalesce(o, '{}'::jsonb)) as x(k, v)
  where x.k not in ('dinheiro.multa_fixa', 'dinheiro.multa_pct', 'dinheiro.juros_mes_pct', 'dinheiro.taxa_falta')
$$;
