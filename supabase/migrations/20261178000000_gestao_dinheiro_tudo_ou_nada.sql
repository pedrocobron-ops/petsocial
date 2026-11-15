-- Dinheiro: cada operação é tudo ou nada.
--
-- Antes, o check-out do hotel e da creche, o sinal da reserva, o "Fechar a conta" do atendimento e a baixa de uma conta com
-- crédito do tutor eram várias gravações seguidas, feitas uma a uma pelo navegador. Se a internet caía no meio, ficava metade:
-- a estadia encerrada sem o dinheiro, o sinal lançado sem ligar à reserva, o pacote sem baixa, o crédito usado sem o resto.
-- Agora a tela monta a lista do que gravar e manda tudo numa chamada só. O banco faz tudo na mesma transação: se uma parte
-- falha, nada fica gravado. A chave da operação (`useOperacao`) faz a nova tentativa devolver o que já foi feito, sem repetir.
--
-- Como as gravações rodam: as funções novas são SECURITY INVOKER (rodam com o login de quem chamou). Assim valem, sem cópia,
-- as mesmas regras de hoje: RLS de cada tabela (quem pode lançar em outro dia, quem lê o caixa), os grants por coluna das
-- migrações 49 e 57, as travas de preço e os gatilhos de crédito e de estoque, e as funções protegidas que já existem
-- (`receber_conta`, `receber_conta_com_credito`, `credito_do_tutor_mover`, `estadia_acertar`, `agendamento_servicos_definir`).
-- Nenhuma delas dá a ninguém um poder que a pessoa já não tinha pela tela. Só o registro da operação feita
-- (`operacoes_feitas`, sem acesso pela API) passa por duas funções SECURITY DEFINER pequenas, que conferem o pet shop e a pessoa.
--
-- Só acrescenta: funções novas e um gatilho que recusa usar um pacote além do total. Não muda tabela nem coluna, então não
-- mexe nos grants das migrações 49 e 57 (pode ser aplicada antes delas e antes do deploy). O código que está no ar continua
-- funcionando: ele não chama as funções novas, e o gatilho só recusa o que já era um erro (pacote usado mais vezes do que tem).

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Registro da operação feita (a mesma chave de novo devolve o resultado da primeira vez)
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.lote_ja_feito(p_petshop uuid, p_chave text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select o.resultado from public.operacoes_feitas o
  where o.petshop_id = p_petshop and o.chave = 'lote:' || p_chave and o.criado_por = (select auth.uid())
    and p_petshop in (select public.meus_petshops())
$$;
revoke execute on function public.lote_ja_feito(uuid, text) from public, anon;
grant execute on function public.lote_ja_feito(uuid, text) to authenticated;

create or replace function public.lote_guardar(p_petshop uuid, p_chave text, p_resultado jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or p_petshop is null or not (p_petshop in (select public.meus_petshops())) then
    raise exception 'Sem acesso a este pet shop.' using errcode = '42501';
  end if;
  insert into public.operacoes_feitas (petshop_id, chave, resultado, criado_por)
  values (p_petshop, 'lote:' || p_chave, coalesce(p_resultado, '{}'::jsonb), (select auth.uid()))
  on conflict (petshop_id, chave) do nothing;
end $$;
revoke execute on function public.lote_guardar(uuid, text, jsonb) from public, anon;
grant execute on function public.lote_guardar(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. O motor: uma lista de passos, numa transação só
-- ---------------------------------------------------------------------------------------------------------------------
-- Cada passo é um objeto com "t" (o tipo). Um passo pode dar nome ao lançamento que criou ("nome": "principal") e os passos
-- seguintes usam o id dele escrevendo "$ref:principal" no lugar do id (sem lançamento com esse nome, vira null).
-- Tipos:
--   sem_recebimento {agendamento}                       recusa se o atendimento já tem recebimento
--   servicos        {agendamento, servicos}             serviços a mais do horário (agendamento_servicos_definir)
--   pacote          {id, n}                             usa n do pacote, somando no banco (nunca passa do total)
--   agendamento     {id, status?, pacote_cliente_id?, sem_cobranca?}
--   lancamento      {nome?, chave?, linha:{tipo, valor, forma, categoria, descricao, data, vencimento, pago, agendamento_id,
--                    cliente_id, origem, itens, pagamentos, credito_usado}}   (entra no caixa aberto só quando a data é hoje)
--   receber         {conta, valor, forma, pagamentos?, data?, novo_vencimento?, multa?, multa_forma?, multa_pagamentos?,
--                    chave?, esperado?}                 receber_conta; com "esperado", confere antes o que falta (quitar)
--   receber_credito {conta, valor, chave?}              receber_conta_com_credito
--   credito         {cliente, valor, estadia?, motivo?, chave?}   credito_do_tutor_mover (recusa sem saldo)
--   estoque         {linhas:[{produto_id, quantidade, lancamento_id?, estadia_id?, chave?}]}   saída "Venda"
--   apagar_aberto   {id, exige?}                        apaga uma conta ainda não paga
--   estadia_fechar  {id, saida, diarias, valor_cobrado, obs?}     check-out (só de quem está na casa)
--   estadia_acertar {id, diarias, valor, obs?}          estadia_acertar (check-out que ficou para cobrar)
--   estadia_cancelar {id}                               cancela uma reserva
--   estadia_valores {estadia, modo: "upsert"|"update", campos:{sinal…, taxas, conta}}
create or replace function public.operacao_tudo_ou_nada(p_petshop uuid, p_chave text, p_passos jsonb, p_tipos text[] default null)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_feito jsonb;
  v_refs jsonb := '{}'::jsonb;
  v_res jsonb := '[]'::jsonb;
  v_passo jsonb;
  v_txt text;
  k text;
  v_t text;
  v_id uuid;
  v_r jsonb;
  v_l public.lancamentos;
  v_fuso text;
  v_hoje date;
  v_hojes date[];
  v_caixa uuid;
  v_valor numeric;
  v_pago boolean;
  v_n integer;
  v_u integer;
  v_tot integer;
  v_sets text[];
  v_cols text[];
  v_linha jsonb;
  v_campos constant text[] := array['sinal', 'sinal_estado', 'sinal_lancamento_id', 'sinal_pago_em', 'sinal_pagamento', 'sinal_devolucao_id',
    'sinal_devolvido_em', 'taxas', 'conta'];
begin
  if (select auth.uid()) is null or p_petshop is null or not (p_petshop in (select public.meus_petshops())) then
    raise exception 'Sem acesso a este pet shop.' using errcode = '42501';
  end if;
  if p_chave is null or char_length(p_chave) not between 8 and 110 then raise exception 'Operação sem chave. Atualize a tela e tente de novo.'; end if;
  if jsonb_typeof(p_passos) is distinct from 'array' or jsonb_array_length(p_passos) not between 1 and 80 then
    raise exception 'Nada para gravar.';
  end if;
  -- a mesma chave ao mesmo tempo (internet que repetiu o pedido): a segunda espera a primeira e devolve o que ela fez
  perform pg_advisory_xact_lock(hashtextextended(p_petshop::text || ':lote:' || p_chave, 0));
  v_feito := public.lote_ja_feito(p_petshop, p_chave);
  if v_feito is not null then return v_feito || jsonb_build_object('repetido', true); end if;

  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p_petshop;
  v_hoje := (now() at time zone coalesce(v_fuso, 'America/Sao_Paulo'))::date;
  -- a mesma folga de fuso das regras do caixa (meus_caixas): o aparelho pode estar num fuso vizinho
  select array_agg(distinct (now() at time zone f)::date) into v_hojes
    from unnest(array[coalesce(v_fuso, 'America/Sao_Paulo'), 'America/Noronha', 'America/Sao_Paulo', 'America/Manaus', 'America/Rio_Branco']) f;

  for v_passo in select x from jsonb_array_elements(p_passos) x loop
    if jsonb_typeof(v_passo) is distinct from 'object' then raise exception 'Passo inválido.'; end if;
    v_t := v_passo ->> 't';
    if p_tipos is not null and not (v_t = any (p_tipos)) then raise exception 'Passo % não vale nesta operação.', coalesce(v_t, '?'); end if;
    -- ids dos lançamentos criados nos passos anteriores
    v_txt := v_passo::text;
    for k in select jsonb_object_keys(v_refs) loop
      v_txt := replace(v_txt, '"$ref:' || k || '"', (v_refs -> k)::text);
    end loop;
    v_txt := regexp_replace(v_txt, '"\$ref:[A-Za-z0-9_]+"', 'null', 'g');
    v_passo := v_txt::jsonb;
    v_r := null;

    if v_t = 'sem_recebimento' then
      if exists (select 1 from public.recebimentos_do_agendamento((v_passo ->> 'agendamento')::uuid)) then
        raise exception 'Este atendimento já tem recebimento lançado.' using hint = 'maestro:ja_recebido';
      end if;

    elsif v_t = 'servicos' then
      perform public.agendamento_servicos_definir((v_passo ->> 'agendamento')::uuid, coalesce(v_passo -> 'servicos', '[]'::jsonb));

    elsif v_t = 'pacote' then
      v_n := coalesce((v_passo ->> 'n')::integer, 1);
      if v_n < 1 then raise exception 'Confira quantos usos do pacote.'; end if;
      update public.pacotes_clientes p set usados = p.usados + v_n, ativo = (p.usados + v_n) < p.total
        where p.id = (v_passo ->> 'id')::uuid and p.petshop_id = p_petshop and p.usados + v_n <= p.total
        returning p.usados, p.total into v_u, v_tot;
      if not found then
        select p.total - p.usados into v_u from public.pacotes_clientes p where p.id = (v_passo ->> 'id')::uuid and p.petshop_id = p_petshop;
        if v_u is null then raise exception 'Pacote não encontrado. Atualize a tela.'; end if;
        raise exception 'O pacote só tem % para usar agora. Atualize a tela.', greatest(v_u, 0) using hint = 'maestro:pacote';
      end if;
      v_r := jsonb_build_object('usados', v_u, 'total', v_tot);

    elsif v_t = 'agendamento' then
      v_sets := array[]::text[];
      if v_passo ? 'status' then v_sets := v_sets || 'status = $3 ->> ''status'''::text; end if;
      if v_passo ? 'pacote_cliente_id' then v_sets := v_sets || '"pacote_cliente_id" = ($3 ->> ''pacote_cliente_id'')::uuid'::text; end if;
      if v_passo ? 'sem_cobranca' then v_sets := v_sets || 'sem_cobranca = ($3 ->> ''sem_cobranca'')::boolean'::text; end if;
      if cardinality(v_sets) > 0 then
        v_id := null;
        execute format('update public.agendamentos set %s where id = $1 and petshop_id = $2 returning id', array_to_string(v_sets, ', '))
          into v_id using (v_passo ->> 'id')::uuid, p_petshop, v_passo;
        if v_id is null then raise exception 'Este horário não foi encontrado. Atualize a tela.'; end if;
      end if;

    elsif v_t = 'lancamento' then
      v_l := jsonb_populate_record(null::public.lancamentos, coalesce(v_passo -> 'linha', '{}'::jsonb));
      v_pago := coalesce(v_l.pago, true);
      v_caixa := null;
      -- só o dinheiro de hoje entra no caixa aberto (lançamento de outro dia fica fora da conferência da gaveta)
      if v_pago and coalesce(v_l.data, v_hoje) = any (v_hojes) then
        select c.id into v_caixa from public.caixas c where c.petshop_id = p_petshop and c.fechado_em is null limit 1;
      end if;
      v_id := null;
      begin
        insert into public.lancamentos (petshop_id, tipo, valor, forma, categoria, descricao, data, vencimento, pago, caixa_id, agendamento_id,
          cliente_id, origem, criado_por, itens, pagamentos, credito_usado, chave)
        values (p_petshop, v_l.tipo, v_l.valor, v_l.forma, coalesce(v_l.categoria, 'Outros'), v_l.descricao, coalesce(v_l.data, v_hoje), v_l.vencimento,
          v_pago, v_caixa, v_l.agendamento_id, v_l.cliente_id, coalesce(v_l.origem, 'tela'), (select auth.uid()), v_l.itens, v_l.pagamentos,
          v_l.credito_usado, nullif(v_passo ->> 'chave', ''))
        on conflict (petshop_id, chave) do nothing
        returning id into v_id;
      exception
        when unique_violation then
          raise exception 'Este atendimento já tem recebimento lançado. Atualize a tela para ver.' using hint = 'maestro:ja_recebido';
        when insufficient_privilege then
          if coalesce(v_l.data, v_hoje) <> all (v_hojes) then
            raise exception 'Só quem cuida do financeiro lança um valor em outro dia. Lance com a data de hoje ou peça para o dono.' using errcode = '42501';
          end if;
          raise;
      end;
      if v_id is null then
        -- a chave já tinha sido gravada (uma tentativa antiga, pelas telas de antes): vale a primeira gravação
        select x.id into v_id from public.lancamentos x where x.petshop_id = p_petshop and x.chave = v_passo ->> 'chave';
        if v_id is null then raise exception 'Não deu para gravar o lançamento. Tente de novo.'; end if;
      end if;
      if coalesce(v_passo ->> 'nome', '') <> '' then v_refs := v_refs || jsonb_build_object(v_passo ->> 'nome', v_id); end if;
      select to_jsonb(x) into v_linha from public.lancamentos x where x.id = v_id;
      v_r := jsonb_build_object('id', v_id, 'linha', v_linha);

    elsif v_t = 'receber' then
      v_id := (v_passo ->> 'conta')::uuid;
      if v_id is null then raise exception 'Conta não encontrada.'; end if;
      if v_passo ? 'esperado' then
        select x.valor, x.pago into v_valor, v_pago from public.lancamentos x where x.id = v_id and x.petshop_id = p_petshop;
        if not found or v_pago then raise exception 'Esta conta já tinha sido baixada.' using hint = 'maestro:conta_mudou'; end if;
        if round(v_valor, 2) <> round((v_passo ->> 'esperado')::numeric, 2) then
          raise exception 'Esta conta mudou enquanto a tela estava aberta: agora faltam %. Atualize e receba de novo.', public.em_reais(v_valor)
            using hint = 'maestro:conta_mudou';
        end if;
      end if;
      v_r := public.receber_conta(v_id, (v_passo ->> 'valor')::numeric, v_passo ->> 'forma',
        case when jsonb_typeof(v_passo -> 'pagamentos') = 'array' and jsonb_array_length(v_passo -> 'pagamentos') > 1 then v_passo -> 'pagamentos' end,
        (v_passo ->> 'data')::date, (v_passo ->> 'novo_vencimento')::date,
        nullif((v_passo ->> 'multa')::numeric, 0), v_passo ->> 'multa_forma',
        case when jsonb_typeof(v_passo -> 'multa_pagamentos') = 'array' and jsonb_array_length(v_passo -> 'multa_pagamentos') > 1 then v_passo -> 'multa_pagamentos' end,
        nullif(v_passo ->> 'chave', ''));

    elsif v_t = 'receber_credito' then
      v_r := public.receber_conta_com_credito((v_passo ->> 'conta')::uuid, (v_passo ->> 'valor')::numeric, nullif(v_passo ->> 'chave', ''));

    elsif v_t = 'credito' then
      v_r := public.credito_do_tutor_mover(p_petshop, (v_passo ->> 'cliente')::uuid, round((v_passo ->> 'valor')::numeric, 2),
        (v_passo ->> 'estadia')::uuid, v_passo ->> 'motivo', nullif(v_passo ->> 'chave', ''));
      if not coalesce((v_r ->> 'ok')::boolean, false) then
        if v_r ->> 'erro' = 'saldo' then
          raise exception 'O crédito do tutor mudou: agora é de %. Atualize a tela.', public.em_reais(coalesce((v_r ->> 'saldo')::numeric, 0)) using hint = 'maestro:credito';
        end if;
        raise exception '%', case v_r ->> 'erro' when 'cliente' then 'Tutor não encontrado.' else 'Não consegui gravar o crédito do tutor.' end;
      end if;

    elsif v_t = 'estoque' then
      insert into public.movimentos_estoque (petshop_id, produto_id, tipo, quantidade, motivo, criado_por, lancamento_id, estadia_id, chave)
      select p_petshop, (x ->> 'produto_id')::uuid, 'saida', (x ->> 'quantidade')::numeric, 'Venda', (select auth.uid()),
        (x ->> 'lancamento_id')::uuid, case when x ->> 'lancamento_id' is null then (x ->> 'estadia_id')::uuid end, nullif(x ->> 'chave', '')
      from jsonb_array_elements(coalesce(v_passo -> 'linhas', '[]'::jsonb)) x
      on conflict (petshop_id, chave) do nothing;

    elsif v_t = 'apagar_aberto' then
      v_id := null;
      delete from public.lancamentos x where x.id = (v_passo ->> 'id')::uuid and x.petshop_id = p_petshop and not x.pago returning x.id into v_id;
      if v_id is null and coalesce((v_passo ->> 'exige')::boolean, false) then
        raise exception 'Não consegui tirar essa conta: ela pode já ter sido paga, ou foi anotada por outra pessoa.' using hint = 'maestro:apagar';
      end if;
      v_r := jsonb_build_object('apagou', v_id is not null);

    elsif v_t = 'estadia_fechar' then
      v_id := null;
      update public.estadias e set status = 'encerrada', saida = (v_passo ->> 'saida')::timestamptz, diarias_cobradas = (v_passo ->> 'diarias')::integer,
          valor_cobrado = (v_passo ->> 'valor_cobrado')::numeric, obs = case when v_passo ? 'obs' then v_passo ->> 'obs' else e.obs end
        where e.id = (v_passo ->> 'id')::uuid and e.petshop_id = p_petshop and e.status = 'em_casa'
        returning e.id into v_id;
      if v_id is null then raise exception 'Esse check-out já tinha sido feito. Atualize a lista.' using hint = 'maestro:estadia_ja'; end if;

    elsif v_t = 'estadia_acertar' then
      if not public.estadia_acertar((v_passo ->> 'id')::uuid, (v_passo ->> 'diarias')::integer, (v_passo ->> 'valor')::numeric, v_passo ->> 'obs') then
        raise exception 'Essa estadia já tinha sido acertada. Atualize a lista.' using hint = 'maestro:estadia_ja';
      end if;

    elsif v_t = 'estadia_cancelar' then
      v_id := null;
      update public.estadias e set status = 'cancelada' where e.id = (v_passo ->> 'id')::uuid and e.petshop_id = p_petshop and e.status = 'reservada'
        returning e.id into v_id;
      if v_id is null then raise exception 'Essa reserva já tinha sido alterada. Atualize a lista.' using hint = 'maestro:estadia_ja'; end if;

    elsif v_t = 'estadia_valores' then
      select array_agg(c order by c) into v_cols from jsonb_object_keys(coalesce(v_passo -> 'campos', '{}'::jsonb)) c where c = any (v_campos);
      if coalesce(cardinality(v_cols), 0) = 0 then raise exception 'Nada para guardar na estadia.'; end if;
      if v_passo ->> 'modo' = 'update' then
        execute format('update public.estadias_valores v set %s from jsonb_populate_record(null::public.estadias_valores, $1) r where v.estadia_id = $2 and v.petshop_id = $3',
          (select string_agg(format('%I = r.%I', c, c), ', ') from unnest(v_cols) c))
          using v_passo -> 'campos', (v_passo ->> 'estadia')::uuid, p_petshop;
      else
        execute format('insert into public.estadias_valores as v (estadia_id, petshop_id, %s) select $2, $3, %s from jsonb_populate_record(null::public.estadias_valores, $1) r '
          || 'on conflict (estadia_id) do update set %s',
          (select string_agg(format('%I', c), ', ') from unnest(v_cols) c),
          (select string_agg(format('r.%I', c), ', ') from unnest(v_cols) c),
          (select string_agg(format('%I = excluded.%I', c, c), ', ') from unnest(v_cols) c))
          using v_passo -> 'campos', (v_passo ->> 'estadia')::uuid, p_petshop;
      end if;

    else
      raise exception 'Passo desconhecido: %.', coalesce(v_t, '?');
    end if;
    v_res := v_res || jsonb_build_array(jsonb_build_object('t', v_t) || coalesce(v_r, '{}'::jsonb));
  end loop;

  v_feito := jsonb_build_object('ok', true, 'ids', v_refs, 'passos', v_res);
  perform public.lote_guardar(p_petshop, p_chave, v_feito);
  return v_feito;
end $$;
revoke execute on function public.operacao_tudo_ou_nada(uuid, text, jsonb, text[]) from public, anon;
grant execute on function public.operacao_tudo_ou_nada(uuid, text, jsonb, text[]) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. As operações com nome (cada uma aceita só os passos dela, e só da estadia, do horário ou da conta que diz)
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.lote_conferir_alvo(p_passos jsonb, p_tipos text[], p_campo text, p_alvo uuid) returns void
language plpgsql immutable set search_path = '' as $$
declare x jsonb;
begin
  for x in select y from jsonb_array_elements(p_passos) y loop
    if x ->> 't' = any (p_tipos) and (x ->> p_campo) is distinct from p_alvo::text then
      raise exception 'Esta operação só mexe em um registro de cada vez.';
    end if;
  end loop;
end $$;

-- Check-out do hotel ou da creche (ou o acerto de um check-out que ficou para cobrar): encerra, dá baixa no pacote, usa ou
-- deixa crédito, devolve o que foi pago a mais, lança o pagamento (ou a conta a receber), recebe as contas antigas junto,
-- tira os produtos do estoque e guarda a conta, tudo junto.
create or replace function public.estadia_checkout(p_petshop uuid, p_estadia uuid, p_chave text, p_passos jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.lote_conferir_alvo(p_passos, array['estadia_fechar', 'estadia_acertar'], 'id', p_estadia);
  perform public.lote_conferir_alvo(p_passos, array['estadia_valores'], 'estadia', p_estadia);
  return public.operacao_tudo_ou_nada(p_petshop, p_chave, p_passos,
    array['estadia_fechar', 'estadia_acertar', 'pacote', 'apagar_aberto', 'credito', 'lancamento', 'receber', 'estoque', 'estadia_valores']);
end $$;
revoke execute on function public.estadia_checkout(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.estadia_checkout(uuid, uuid, text, jsonb) to authenticated;

-- Sinal da reserva: lançar e ligar à reserva; cancelar com o sinal (devolver, manter, tirar a conta), tudo junto.
create or replace function public.estadia_sinal(p_petshop uuid, p_estadia uuid, p_chave text, p_passos jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.lote_conferir_alvo(p_passos, array['estadia_cancelar'], 'id', p_estadia);
  perform public.lote_conferir_alvo(p_passos, array['estadia_valores'], 'estadia', p_estadia);
  return public.operacao_tudo_ou_nada(p_petshop, p_chave, p_passos, array['lancamento', 'apagar_aberto', 'receber', 'estadia_valores', 'estadia_cancelar']);
end $$;
revoke execute on function public.estadia_sinal(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.estadia_sinal(uuid, uuid, text, jsonb) to authenticated;

-- "Fechar a conta" do atendimento (inteira, em parte, paga depois, com crédito, com pacote), tudo junto: serviços do horário,
-- pacote, lançamento, crédito, parte paga, contas antigas, estoque e o atendimento concluído.
create or replace function public.agendamento_fechar_conta(p_petshop uuid, p_agendamento uuid, p_chave text, p_passos jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.lote_conferir_alvo(p_passos, array['agendamento'], 'id', p_agendamento);
  perform public.lote_conferir_alvo(p_passos, array['sem_recebimento', 'servicos'], 'agendamento', p_agendamento);
  return public.operacao_tudo_ou_nada(p_petshop, p_chave, p_passos,
    array['sem_recebimento', 'servicos', 'pacote', 'agendamento', 'lancamento', 'receber', 'receber_credito', 'estoque']);
end $$;
revoke execute on function public.agendamento_fechar_conta(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.agendamento_fechar_conta(uuid, uuid, text, jsonb) to authenticated;

-- Venda no balcão: o lançamento (pago ou a receber) e a saída dos produtos do estoque, junto.
create or replace function public.venda_registrar(p_petshop uuid, p_chave text, p_passos jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  return public.operacao_tudo_ou_nada(p_petshop, p_chave, p_passos, array['lancamento', 'estoque']);
end $$;
revoke execute on function public.venda_registrar(uuid, text, jsonb) from public, anon;
grant execute on function public.venda_registrar(uuid, text, jsonb) to authenticated;

-- Receber uma conta a receber com o crédito do tutor e o resto pela forma escolhida, junto.
create or replace function public.conta_receber_junto(p_petshop uuid, p_conta uuid, p_chave text, p_passos jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
begin
  perform public.lote_conferir_alvo(p_passos, array['receber', 'receber_credito'], 'conta', p_conta);
  return public.operacao_tudo_ou_nada(p_petshop, p_chave, p_passos, array['receber', 'receber_credito']);
end $$;
revoke execute on function public.conta_receber_junto(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.conta_receber_junto(uuid, uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Pacote: nunca passa do total
-- ---------------------------------------------------------------------------------------------------------------------
-- O uso do pacote agora soma no banco (passo "pacote"). O gatilho também recusa, venha de onde vier, subir os usos além do
-- total (duas telas usando o último uso ao mesmo tempo). Descer (desfazer um uso) e mexer em pacotes antigos continuam livres.
create or replace function public.pacote_usos_conferir() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.usados > old.usados and new.usados > new.total then
    raise exception 'O pacote não tem mais usos: % de % já foram usados. Atualize a tela.', old.usados, new.total using hint = 'maestro:pacote';
  end if;
  return new;
end $$;
revoke execute on function public.pacote_usos_conferir() from public, anon, authenticated;
drop trigger if exists pacote_usos_conferir on public.pacotes_clientes;
create trigger pacote_usos_conferir before update of usados on public.pacotes_clientes
  for each row execute function public.pacote_usos_conferir();

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Saldo do crédito do tutor, somado no banco (a tela lia só os 200 movimentos mais novos)
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.credito_saldo(p_petshop uuid, p_cliente uuid) returns numeric
language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(c.valor), 0) from public.clientes_creditos c where c.petshop_id = p_petshop and c.cliente_id = p_cliente
$$;
revoke execute on function public.credito_saldo(uuid, uuid) from public, anon;
grant execute on function public.credito_saldo(uuid, uuid) to authenticated;
