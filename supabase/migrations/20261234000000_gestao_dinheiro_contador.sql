-- Maestro Pet Gestão — rodada 9, onda 2 (N4): definições do dinheiro, arredondamento e planilhas para o contador
--
-- Só acrescenta ou troca funções (mesma assinatura): o código que está no ar continua funcionando neste banco.
--
--  1. anotar_preco_da_venda (copiada da 20261224): um centavo de diferença entre a soma dos itens e o total não é
--     "desconto dado" (venda por peso: 0,35 kg × 18,90 = 6,615). Passa a anotar só acima de um centavo.
--  2. estadias_zzz_trava_de_preco (copiada da 20261231): um centavo de folga na conta mínima do hotel.
--  3. contas_do_valor_medio (nova, interna) e indicadores_do_periodo (copiada da 20261224): "Valor médio por conta" com uma
--     definição só; cada serviço ganha "pagos" (o par pagos · valor de Quanto sobrou), além de "vezes" (feitos).
--  4. dinheiro_cadeia (nova): Recebido − devolvido − crédito deixado + crédito usado = Faturamento − despesas = Resultado
--     − taxas. A conta única das telas, das planilhas e do Mozart.
--  5. lancamentos_para_contador (nova): taxa, parcelas, repasses, data do atendimento, "lançado em", retroativo, devolvido,
--     trocado e custo dos produtos de cada lançamento, e os movimentos de crédito do período.
--  6. saldos_em_aberto (nova): fiado, crédito de tutores, pacotes vendidos e não usados, sinais de reservas.

-- =====================================================================================================================
-- 1. Um centavo de arredondamento não é desconto do caixa
-- =====================================================================================================================
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
  v_promo jsonb;
  v_principal uuid;
  v_promo_usado numeric := 0;
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
    -- a linha da promoção do horário (negativa, "promo": true) não entra na soma: o desconto dela continua sendo visto
    -- abaixo (promo_usos), como quando a promoção vinha só como valor menor
    if i ->> 'promo' = 'true' then continue; end if;
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
  -- a promoção do horário (o dono montou): não é desconto do caixa. Fica em promo_usos; o resto segue a regra de sempre.
  if new.agendamento_id is not null and v_desc > 0.005 then
    select a.promo, a.servico_id into v_promo, v_principal from public.agendamentos a where a.id = new.agendamento_id and a.petshop_id = new.petshop_id;
    v_promo_usado := least(public.promo_desconto(v_promo, new.petshop_id, new.itens, v_principal), v_desc);
    if v_promo_usado > 0 then
      insert into public.promo_usos (petshop_id, promo_id, promo_nome, agendamento_id, lancamento_id, desconto)
        values (new.petshop_id, case when (v_promo ->> 'id') ~ '^[0-9a-fA-F-]{36}$' then (v_promo ->> 'id')::uuid end,
                left(coalesce(v_promo ->> 'nome', 'Promoção'), 60), new.agendamento_id, new.id, v_promo_usado)
        on conflict (lancamento_id) do nothing;
      v_desc := v_desc - v_promo_usado;
    end if;
  end if;
  -- um centavo de folga: a soma dos itens arredonda cada linha (venda por peso); um centavo de diferença não é desconto de ninguém
  if v_desc > 0.015 then
    -- o limite arredonda para baixo, em centavos (a tela mostra o mesmo número)
    if v_travado and not v_fin and v_desc > floor(v_soma * v_max + 0.000001) / 100 + 0.005 then
      if v_max > 0 then
        raise exception 'O desconto passa do máximo de % por cento que o caixa pode dar (% nesta conta). Peça para o dono ou para quem vê o financeiro.',
          replace(trim(to_char(v_max, 'FM990D99'), ',.'), '.', ','), public.em_reais(floor(v_soma * v_max + 0.000001) / 100);
      end if;
      raise exception 'Só o dono ou quem vê o financeiro dá desconto na venda.';
    end if;
    insert into public.precos_alterados (petshop_id, lancamento_id, tipo, item, de, para, quem, quem_nome)
      values (new.petshop_id, new.id, 'desconto', left(coalesce(nullif(btrim(new.descricao), ''), new.categoria), 120), v_soma - v_promo_usado, coalesce(new.valor_original, new.valor), v_user, v_nome);
  end if;
  return null;
end $$;
revoke execute on function public.anotar_preco_da_venda() from public, anon, authenticated;

-- =====================================================================================================================
-- 2. Trava de preço do hotel com um centavo de folga
-- =====================================================================================================================
create or replace function public.estadias_zzz_trava_de_preco() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_lista numeric; v_ref numeric; v_n int; v_pelas int; v_ctx jsonb; v_txt text; v_pacote boolean := false; v_soma numeric := 0;
  v_conta numeric; v_max numeric; v_op jsonb; v_trava boolean; v_fin boolean; v_pode numeric; v_rotulo text; v_palavra text;
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then return null; end if;
  if coalesce(current_setting('maestro.creche', true), '') = '1' or coalesce(current_setting('maestro.hotel', true), '') = '1' then return null; end if;
  if new.mensalista is not null then return null; end if;
  if not (select public.tenho_area(new.petshop_id, array['caixa', 'financeiro', 'relatorios'])) then return null; end if;
  v_rotulo := public.estadia_rotulo(new);

  -- a diária combinada abaixo da lista (o dia de experiência tem o preço dele, posto pelo banco)
  if not coalesce(new.experiencia, false) and new.valor_diaria is not null
     and (tg_op = 'INSERT' or new.valor_diaria is distinct from old.valor_diaria or new.tipo is distinct from old.tipo) then
    v_lista := public.diaria_sugerida(new.petshop_id, new.tipo, (select p.porte from public.pets p where p.id = new.pet_id));
    v_ref := case when tg_op = 'UPDATE' and new.tipo is not distinct from old.tipo and old.valor_diaria is not null and not coalesce(old.experiencia, false)
                  then least(old.valor_diaria, coalesce(v_lista, old.valor_diaria)) else v_lista end;
    if v_ref is not null then
      perform public.conferir_valor_baixou(new.petshop_id, 'diaria', v_rotulo, v_ref, new.valor_diaria,
        format('A diária %s é %s. Com o preço travado, só o dono ou quem vê o financeiro combina uma diária menor.',
          case when new.tipo = 'hotel' then 'do hotel' else 'da creche' end, public.em_reais(v_ref)));
    end if;
  end if;

  if tg_op = 'INSERT' or new.status <> 'encerrada' then return null; end if;
  if not (old.status <> 'encerrada' or new.valor_cobrado is distinct from old.valor_cobrado or new.diarias_cobradas is distinct from old.diarias_cobradas) then
    return null;
  end if;
  -- só há o que conferir quando a conta foi fechada com valor (em branco fica em "Check-outs para cobrar")
  if new.valor_cobrado is null then return null; end if;

  v_txt := coalesce(current_setting('maestro.estadia_conta', true), '');
  if v_txt <> '' then
    begin
      v_ctx := v_txt::jsonb;
      if v_ctx ->> 'estadia' = new.id::text then
        v_pacote := coalesce((v_ctx ->> 'pacote')::boolean, false);
        v_soma := coalesce((v_ctx ->> 'soma')::numeric, 0);
      end if;
    exception when others then v_pacote := false; v_soma := 0;
    end;
  end if;

  v_pelas := public.estadia_diarias_pelas_datas(new, new.saida);
  v_n := coalesce(new.diarias_cobradas, v_pelas);
  v_palavra := case when new.tipo = 'hotel' then 'noite' else 'diária' end;
  -- menos diárias do que as datas mostram
  if v_n < v_pelas and (old.status <> 'encerrada' or new.diarias_cobradas is distinct from old.diarias_cobradas) then
    perform public.conferir_valor_baixou(new.petshop_id, 'diarias',
      format('%s: %s em vez de %s', v_rotulo, v_n || ' ' || v_palavra || case when v_n = 1 then '' else 's' end, v_pelas || ' ' || v_palavra || case when v_pelas = 1 then '' else 's' end),
      public.estadia_diarias_da_conta(new, v_pelas, new.saida), public.estadia_diarias_da_conta(new, v_n, new.saida),
      format('Pelas datas %s. Com o preço travado, só o dono ou quem vê o financeiro cobra menos.',
        case when v_pelas = 1 then 'é 1 ' || v_palavra else 'são ' || v_pelas || ' ' || v_palavra || 's' end),
      null, false, null);
  end if;

  -- o valor cobrado abaixo da conta
  if old.status <> 'encerrada' or new.valor_cobrado is distinct from old.valor_cobrado then
    v_conta := greatest(public.estadia_conta_minima(new, v_n, new.saida, v_pacote), v_soma);
    -- um centavo de folga: a tela e o banco podem arredondar uma diária fracionada ou uma promoção em % em lados diferentes
    if new.valor_cobrado < v_conta - 0.015 then
      select s.opcoes into v_op from public.petshops s where s.id = new.petshop_id;
      v_trava := coalesce(v_op -> 'dinheiro.preco_travado' = 'true'::jsonb, false);
      v_fin := public.cuido_do_financeiro(new.petshop_id);
      if v_trava and not v_fin then
        v_max := case when jsonb_typeof(v_op -> 'dinheiro.desconto_max_caixa') = 'number' then least(100, greatest(0, (v_op ->> 'dinheiro.desconto_max_caixa')::numeric)) else 0 end;
        -- o limite arredonda para baixo, em centavos (como na venda)
        v_pode := floor(v_conta * v_max + 0.000001) / 100;
        if v_conta - new.valor_cobrado > v_pode + 0.015 then
          if v_max > 0 then
            raise exception 'Pela conta, a estadia dá %. O desconto passa do máximo de % por cento que o caixa pode dar (% nesta conta). Peça para o dono ou para quem vê o financeiro.',
              public.em_reais(v_conta), replace(trim(to_char(v_max, 'FM990D99'), ',.'), '.', ','), public.em_reais(v_pode)
              using hint = 'maestro:preco_travado';
          end if;
          raise exception 'Pela conta, a estadia dá %. Com o preço travado, só o dono ou quem vê o financeiro cobra menos.', public.em_reais(v_conta)
            using hint = 'maestro:preco_travado';
        end if;
      end if;
      insert into public.precos_alterados (petshop_id, tipo, item, de, para, quem, quem_nome)
        values (new.petshop_id, 'checkout', left(v_rotulo, 200), v_conta, new.valor_cobrado, (select auth.uid()), public.nome_na_equipe(new.petshop_id));
    end if;
  end if;
  return null;
end $$;
revoke execute on function public.estadias_zzz_trava_de_preco() from public, anon, authenticated;

-- =====================================================================================================================
-- 3. Valor médio por conta: UMA definição (Relatórios, Indicadores, planilha e Mozart)
-- =====================================================================================================================
-- Conta = uma entrada paga no período que fecha um atendimento, uma venda de balcão, um check-out ou um lançamento à mão:
--   · a linha principal (não a parte de uma conta recebida em partes, nem a diferença cobrada depois);
--   · sem o sinal de reserva (ele entra na conta do check-out, somado de volta) e sem a venda de pacote (contada à parte);
--   · multa e juros não são uma conta: o valor soma na média, a contagem não;
--   · venda devolvida inteira e a entrada de uma troca ficam fora.
-- valor da conta = o valor cheio dela (recebida em partes: `valor_original`) + o sinal descontado no check-out.
create or replace function public.contas_do_valor_medio(p uuid, p_de date, p_ate date)
returns table (contas bigint, valor numeric, pacotes bigint, valor_pacotes numeric)
language sql stable security definer set search_path = '' as $$
  with sinais as materialized (
    select v.sinal_lancamento_id as id, v.sinal_estado, v.sinal, v.conta
    from public.estadias_valores v
    where v.petshop_id = p and (v.sinal_lancamento_id is not null or v.conta is not null)
  ),
  ent as materialized (
    select l.id, l.valor, coalesce(l.valor_original, l.valor) as cheio, l.categoria, l.multa_de,
      (l.conta_id is null and l.diferenca_de is null) as principal,
      exists (select 1 from sinais x where x.id is not null and (x.id = l.id or x.id = l.conta_id)) as do_sinal,
      coalesce((select sum(x.sinal) from sinais x where x.sinal_estado = 'pago' and x.conta ->> 'lancamento_id' = l.id::text), 0) as sinal_descontado,
      exists (select 1 from public.devolucoes d where d.petshop_id = p and d.modo = 'troca' and d.entrada_id = l.id) as de_troca,
      coalesce((select sum(d.valor) from public.devolucoes d where d.petshop_id = p and d.venda_id = l.id and coalesce(d.saida_id, d.credito_id) is not null), 0)
        + coalesce((select sum(s.valor) from public.lancamentos s where s.petshop_id = p and s.devolucao_de = l.id and s.tipo = 'saida' and s.pago), 0) as devolvido
    from public.lancamentos l
    where l.petshop_id = p and l.tipo = 'entrada' and l.pago and l.movimento is null and l.data between p_de and p_ate
  ),
  c as (
    select e.* from ent e
    where e.principal and not e.do_sinal and e.multa_de is null and e.categoria <> 'Pacotes' and not e.de_troca
      and not (e.devolvido > 0 and e.devolvido >= e.cheio - 0.005)
  )
  select (select count(*) from c),
    coalesce((select sum(c.cheio + c.sinal_descontado) from c), 0)
      + case when exists (select 1 from c) then coalesce((select sum(e.valor) from ent e where e.multa_de is not null), 0) else 0 end,
    (select count(*) from ent e where e.principal and e.categoria = 'Pacotes'),
    coalesce((select sum(e.cheio) from ent e where e.principal and e.categoria = 'Pacotes'), 0)
$$;
revoke execute on function public.contas_do_valor_medio(uuid, date, date) from public, anon, authenticated;

-- indicadores_do_periodo: a definição da 20261224 com o valor médio único e "pagos" por serviço
-- (rodada 9, junção) base: a versão rápida da 20261229 (tabela por mês com group by), mais o valor médio, os pacotes e os pagos desta rodada
CREATE OR REPLACE FUNCTION public.indicadores_do_periodo(p uuid, p_de date, p_ate date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- reservas canceladas pelo dia do cancelamento (as antigas, sem o dia anotado, pelo dia da entrada): cancelar hoje uma
  -- reserva para o mês que vem aparece hoje
  ec as materialized (
    select coalesce((c.cancelada_em at time zone v_fuso)::date, (e.entrada at time zone v_fuso)::date) as dia
    from public.estadias e left join public.estadias_canceladas c on c.estadia_id = e.id
    where e.petshop_id = p and e.mensalista is null and e.status = 'cancelada'
      and coalesce(c.cancelada_em, e.entrada) >= v_ini and coalesce(c.cancelada_em, e.entrada) < v_fim
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
  sinais_id as materialized (select distinct x.id from sinais x where x.id is not null),
  sinais_pagos as materialized (
    select x.conta ->> 'lancamento_id' as lancamento, sum(x.sinal) as sinal
    from sinais x where x.sinal_estado = 'pago' and x.conta ->> 'lancamento_id' is not null group by 1
  ),
  ent as materialized (
    select l.id, l.data, l.valor, (l.conta_id is null and l.diferenca_de is null) as principal,
      (s1.id is not null or s2.id is not null) as do_sinal,
      coalesce(sp.sinal, 0) as sinal_descontado
    from public.lancamentos l
    left join sinais_id s1 on s1.id = l.id
    left join sinais_id s2 on s2.id = l.conta_id
    left join sinais_pagos sp on sp.lancamento = l.id::text
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
  -- a tabela dos meses: cada parte é agrupada uma vez por mês (antes, cada mês relia cada parte inteira)
  ent_m as (
    select to_char(e.data, 'YYYY-MM') as mes, sum(e.valor) as entradas,
      count(*) filter (where e.principal and not e.do_sinal) as contas,
      sum(e.valor + e.sinal_descontado) filter (where e.principal and not e.do_sinal) as valor_contas
    from ent e group by 1
  ),
  sai_m as (
    select to_char(s.data, 'YYYY-MM') as mes, sum(s.valor) filter (where s.devolucao) as devolvido, sum(s.valor) filter (where not s.devolucao) as saiu
    from sai s group by 1
  ),
  cred_m as (
    select to_char(c.dia, 'YYYY-MM') as mes, sum(c.valor) filter (where c.valor > 0) as deixado,
      -sum(c.valor) filter (where c.valor < 0 and c.lancamento_id is null) as usado_fora
    from cred c group by 1
  ),
  tx_m as (select to_char(t.data, 'YYYY-MM') as mes, sum(t.taxa) as taxas from tx t group by 1),
  ag_m as (
    select to_char(a.local, 'YYYY-MM') as mes, count(*) filter (where a.status = 'concluido') as atendimentos,
      count(*) filter (where a.status = 'faltou') as faltas, count(*) filter (where a.status = 'cancelado') as cancelados, count(*) as marcados
    from ag a group by 1
  ),
  er_m as (
    select to_char(x.dia, 'YYYY-MM') as mes, count(*) as estadias_marcadas, count(*) filter (where x.status = 'cancelada') as estadias_canceladas
    from er x group by 1
  ),
  ec_m as (select to_char(x.dia, 'YYYY-MM') as mes, count(*) as canceladas_no_periodo from ec x group by 1),
  nh_m as (select to_char(x.dia, 'YYYY-MM') as mes, count(*) as noites_hotel from nh x where x.dia between p_de and p_ate group by 1),
  es_m as (
    select to_char(e.dia, 'YYYY-MM') as mes, count(*) filter (where e.tipo = 'creche') as creche, count(*) filter (where e.tipo = 'hotel') as hotel
    from es e group by 1
  ),
  cli_m as (select to_char(n.dia, 'YYYY-MM') as mes, count(distinct n.cliente_id) as clientes from noper n group by 1),
  prim_m as (select to_char(x.dia, 'YYYY-MM') as mes, count(*) as primeira_vez from prim x where x.dia between p_de and p_ate group by 1),
  mm as (
    select m.mes, m.de, m.ate,
      coalesce(e.entradas, 0) as entradas, vm.contas as contas, vm.valor as valor_contas, vm.pacotes as pacotes, vm.valor_pacotes as valor_pacotes,
      coalesce(s.devolvido, 0) as devolvido, coalesce(s.saiu, 0) as saiu,
      coalesce(c.deixado, 0) as deixado, coalesce(c.usado_fora, 0) as usado_fora,
      coalesce(t.taxas, 0) as taxas,
      coalesce(a.atendimentos, 0) as atendimentos, coalesce(a.faltas, 0) as faltas, coalesce(a.cancelados, 0) as cancelados, coalesce(a.marcados, 0) as marcados,
      coalesce(r.estadias_marcadas, 0) as estadias_marcadas, coalesce(r.estadias_canceladas, 0) as estadias_canceladas,
      coalesce(k.canceladas_no_periodo, 0) as canceladas_no_periodo, coalesce(h.noites_hotel, 0) as noites_hotel,
      coalesce(o.creche, 0) as creche, coalesce(o.hotel, 0) as hotel,
      coalesce(l.clientes, 0) as clientes, coalesce(v.primeira_vez, 0) as primeira_vez
    from meses m cross join lateral public.contas_do_valor_medio(p, m.de, m.ate) vm
    left join ent_m e on e.mes = m.mes
    left join sai_m s on s.mes = m.mes
    left join cred_m c on c.mes = m.mes
    left join tx_m t on t.mes = m.mes
    left join ag_m a on a.mes = m.mes
    left join er_m r on r.mes = m.mes
    left join ec_m k on k.mes = m.mes
    left join nh_m h on h.mes = m.mes
    left join es_m o on o.mes = m.mes
    left join cli_m l on l.mes = m.mes
    left join prim_m v on v.mes = m.mes
  ),
  sv as (
    select coalesce(x.servico_id::text, '-') as k, x.servico_id, count(*) as vezes
    from (
      select a.servico_id from ag a where a.status = 'concluido'
      union all
      select s.servico_id from ag a join public.agendamento_servicos s on s.agendamento_id = a.id where a.status = 'concluido' and s.petshop_id = p
    ) x group by 1, 2
  ),
  svr as (select coalesce(x.servico_id::text, '-') as k, sum(x.valor) as receita, sum(x.qtd) as pagos from pc x where x.tipo = 'servico' group by 1),
  -- troca e devolução: o que voltou no período sai da quantidade e da receita (pelo dia da devolução, como em Quanto sobrou)
  dvp as (
    select (i ->> 'produto_id')::uuid as produto_id, sum((i ->> 'qtd')::numeric) as quantidade, sum((i ->> 'valor')::numeric) as valor
    from public.devolucoes dv cross join lateral jsonb_array_elements(dv.itens) i
    where dv.petshop_id = p and coalesce(dv.saida_id, dv.credito_id) is not null and dv.criado_em >= v_ini and dv.criado_em < v_fim
      and (i ->> 'produto_id') is not null
    group by 1
  ),
  pr0 as (
    select x.produto_id, coalesce(x.produto_id::text, 'nome:' || lower(x.nome)) as k, (array_agg(x.nome))[1] as nome, sum(x.qtd) as quantidade, sum(x.valor) as receita
    from pc x where x.tipo = 'produto' group by 1, 2
  ),
  pr as (
    select a.produto_id, a.k, a.nome, a.quantidade - coalesce(d.quantidade, 0) as quantidade, a.receita - coalesce(d.valor, 0) as receita
    from pr0 a left join dvp d on d.produto_id = a.produto_id
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
        'pacotes', x.pacotes, 'valor_pacotes', case when v_din then x.valor_pacotes end,
        'saiu', case when v_din then x.saiu end,
        'resultado', case when v_din then x.entradas - x.devolvido - x.deixado + x.usado_fora - x.saiu end,
        'taxas', case when v_din then x.taxas end,
        'resultado_depois_taxas', case when v_din then x.entradas - x.devolvido - x.deixado + x.usado_fora - x.saiu - x.taxas end,
        'atendimentos', x.atendimentos, 'faltas', x.faltas, 'cancelados', x.cancelados, 'marcados', x.marcados,
        'estadias_marcadas', x.estadias_marcadas, 'estadias_canceladas', x.estadias_canceladas, 'estadias_canceladas_no_periodo', x.canceladas_no_periodo, 'noites_hotel', x.noites_hotel,
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
        'pagos', coalesce(r.pagos, 0), 'receita', case when v_din then coalesce(r.receita, 0) end) order by s.vezes desc, coalesce(se.nome, ''))
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
end $function$;
revoke execute on function public.indicadores_do_periodo(uuid, date, date) from public, anon;
grant execute on function public.indicadores_do_periodo(uuid, date, date) to authenticated;

-- =====================================================================================================================
-- 4. A cadeia do dinheiro: UMA conta, com cada passo com nome (Financeiro, Relatórios, Caixa, planilhas e Mozart)
-- =====================================================================================================================
--   Recebido (dinheiro, Pix e cartão que entraram de verdade: sem o que foi pago com crédito do tutor e sem o produto de uma troca)
--   − Devolvido aos tutores (sem o produto de uma troca)
--   − Crédito deixado para tutores (o dinheiro ficou, mas ainda é deles)
--   + Crédito usado por tutores (numa conta ou no check-out)
--   = Faturamento            (o mesmo de sempre: entradas lançadas − devoluções − crédito deixado + crédito usado no check-out)
--   − Despesas (as saídas pagas que não são devolução; a retirada do dono está aqui dentro e sai também à parte)
--   = Resultado
--   − Taxas da maquininha (as guardadas em cada pagamento)
--   = Resultado depois das taxas
-- Tudo pelo dia do lançamento; o crédito, pelo dia em que aconteceu NO FUSO DO PET SHOP.
create or replace function public.dinheiro_cadeia(p uuid, p_de date, p_ate date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fuso text; v_ini timestamptz; v_fim timestamptz; v_res jsonb;
begin
  if (select auth.uid()) is null or p is null or not (p in (select public.meus_petshops())) then
    raise exception 'Sem acesso a este pet shop.' using errcode = '42501';
  end if;
  if not public.cuido_do_financeiro(p) then
    raise exception 'Estes números são com quem cuida do financeiro.' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 372 then raise exception 'Escolha um período de até um ano.'; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p;
  v_ini := p_de::timestamp at time zone v_fuso;
  v_fim := (p_ate + 1)::timestamp at time zone v_fuso;

  with ent as materialized (
    select l.id, l.valor, least(greatest(coalesce(l.credito_usado, 0), 0), l.valor) as credito
    from public.lancamentos l
    where l.petshop_id = p and l.tipo = 'entrada' and l.pago and l.movimento is null and l.data between p_de and p_ate
  ),
  sai as materialized (
    select l.id, l.valor, l.categoria, l.categoria in ('Devolução', 'Devolução de sinal') as devolucao
    from public.lancamentos l
    where l.petshop_id = p and l.tipo = 'saida' and l.pago and l.movimento is null and l.data between p_de and p_ate
  ),
  tro as materialized (
    select d.entrada_id, d.saida_id, least(d.valor, coalesce(d.valor_novos, 0)) as v
    from public.devolucoes d where d.petshop_id = p and d.modo = 'troca'
      and (d.entrada_id in (select e.id from ent e) or d.saida_id in (select s.id from sai s))
  ),
  cred as (
    select coalesce(sum(c.valor) filter (where c.valor > 0), 0) as deixado,
      coalesce(-sum(c.valor) filter (where c.valor < 0 and c.lancamento_id is null), 0) as usado_fora
    from public.clientes_creditos c where c.petshop_id = p and c.criado_em >= v_ini and c.criado_em < v_fim
  ),
  n as (
    select
      (select coalesce(sum(e.valor), 0) from ent e) as lancado,
      (select coalesce(sum(e.credito), 0) from ent e) as credito_nas_contas,
      (select coalesce(sum(t.v), 0) from tro t where t.entrada_id in (select e.id from ent e)) as troca_e,
      (select coalesce(sum(t.v), 0) from tro t where t.saida_id in (select s.id from sai s where s.devolucao)) as troca_s,
      (select coalesce(sum(s.valor), 0) from sai s where s.devolucao) as devolvido_bruto,
      (select count(*) from sai s where s.devolucao) as devolucoes,
      (select coalesce(sum(s.valor), 0) from sai s where not s.devolucao) as despesas,
      (select coalesce(sum(s.valor), 0) from sai s where s.categoria = 'Retirada do dono') as retirada,
      (select count(*) from ent e) as entradas, (select count(*) from sai s where not s.devolucao) as saidas,
      (select deixado from cred) as deixado, (select usado_fora from cred) as usado_fora,
      (select coalesce(sum(t.taxa), 0) from public.lancamentos_taxas t where t.petshop_id = p and t.lancamento_id in (select e.id from ent e)) as taxas
  ),
  vm as (select * from public.contas_do_valor_medio(p, p_de, p_ate)),
  sv as (
    select x.servico_id, sum(x.qtd) as pagos, sum(x.valor) as valor
    from public.lucro_pecas(p, p_de, p_ate) x where x.tipo = 'servico' group by x.servico_id
  )
  select jsonb_build_object(
    'de', p_de, 'ate', p_ate, 'hoje', (now() at time zone v_fuso)::date,
    'lancado', n.lancado, 'entradas', n.entradas,
    'credito_nas_contas', n.credito_nas_contas, 'troca', n.troca_e,
    'recebido', n.lancado - n.credito_nas_contas - n.troca_e,
    'devolvido', n.devolvido_bruto - n.troca_s, 'devolvido_bruto', n.devolvido_bruto, 'devolucoes', n.devolucoes,
    'credito_deixado', n.deixado,
    'credito_usado', n.credito_nas_contas + n.usado_fora, 'credito_usado_fora', n.usado_fora,
    'faturamento', n.lancado - n.devolvido_bruto - n.deixado + n.usado_fora,
    'despesas', n.despesas, 'saidas', n.saidas, 'retirada_do_dono', n.retirada,
    'resultado', n.lancado - n.devolvido_bruto - n.deixado + n.usado_fora - n.despesas,
    'taxas', n.taxas,
    'resultado_depois_taxas', n.lancado - n.devolvido_bruto - n.deixado + n.usado_fora - n.despesas - n.taxas,
    'fecha', (n.troca_e = n.troca_s),
    'valor_medio', (select jsonb_build_object('contas', vm.contas, 'valor', vm.valor,
        'medio', case when vm.contas > 0 then round(vm.valor / vm.contas, 2) end,
        'pacotes', vm.pacotes, 'valor_pacotes', vm.valor_pacotes) from vm),
    'servicos', coalesce((select jsonb_agg(jsonb_build_object('servico_id', s.servico_id, 'nome', coalesce(se.nome, 'Sem serviço escolhido'),
        'pagos', s.pagos, 'valor', s.valor) order by s.valor desc, se.nome)
      from sv s left join public.servicos se on se.id = s.servico_id and se.petshop_id = p), '[]'::jsonb)
  ) into v_res from n;
  return v_res;
end $$;
revoke execute on function public.dinheiro_cadeia(uuid, date, date) from public, anon;
grant execute on function public.dinheiro_cadeia(uuid, date, date) to authenticated;

-- =====================================================================================================================
-- 5. Para o contador: o que falta em cada lançamento para fazer a escrita (taxa, parcelas, repasse, datas, custo)
-- =====================================================================================================================
-- Uma linha por lançamento do período (pago, pela data do pagamento; em aberto, pelo dia em que foi anotado), só com o que
-- as planilhas não tinham. As telas juntam com os lançamentos que já leram (mesmo id).
--   data_servico: o dia do atendimento, do check-out ou do começo da dívida (competência);
--   lancado_em: quando foi lançado de verdade, no fuso do pet shop; retroativo: a data do lançamento é anterior a esse dia;
--   taxa, parcelas, cartao e repasses (cada parcela com o dia em que cai e o valor já sem a taxa);
--   devolvido (dinheiro ou crédito que voltou para o tutor), trocado (produto de troca: não é dinheiro);
--   custo: o custo dos produtos que saíram do estoque nesta venda.
-- Também os movimentos de crédito do período (para a soma das planilhas dar o faturamento).
create or replace function public.lancamentos_para_contador(p uuid, p_de date, p_ate date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fuso text; v_ini timestamptz; v_fim timestamptz; v_hoje date; v_res jsonb;
begin
  if (select auth.uid()) is null or p is null or not (p in (select public.meus_petshops())) then
    raise exception 'Sem acesso a este pet shop.' using errcode = '42501';
  end if;
  if not public.cuido_do_financeiro(p) then
    raise exception 'As planilhas do financeiro são com quem cuida do financeiro.' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 372 then raise exception 'Escolha um período de até um ano.'; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p;
  v_ini := p_de::timestamp at time zone v_fuso;
  v_fim := (p_ate + 1)::timestamp at time zone v_fuso;
  v_hoje := (now() at time zone v_fuso)::date;

  with l as materialized (
    select x.*, coalesce(x.pago_em, x.criado_em) at time zone v_fuso as feito
    from public.lancamentos x
    where x.petshop_id = p
      and ((x.pago and x.data between p_de and p_ate)
        or (not x.pago and x.criado_em >= v_ini and x.criado_em < v_fim))
  ),
  linhas as (
    select l.id,
      coalesce(
        (select (a.inicio at time zone v_fuso)::date from public.agendamentos a
          where a.id = coalesce(l.agendamento_id, l.diferenca_de, (select c.agendamento_id from public.lancamentos c where c.id = l.conta_id))),
        (select (coalesce(e.saida, e.entrada) at time zone v_fuso)::date from public.estadias_valores v join public.estadias e on e.id = v.estadia_id
          where v.petshop_id = p and (v.conta ->> 'lancamento_id' = l.id::text or v.conta ->> 'lancamento_id' = l.conta_id::text) limit 1),
        (select d.devido_desde from public.lancamentos d where d.id = l.conta_id),
        l.devido_desde,
        (select (d.criado_em at time zone v_fuso)::date from public.lancamentos d where d.id = l.conta_id),
        case when l.pago then l.data else (l.criado_em at time zone v_fuso)::date end) as data_servico,
      l.feito, (l.pago and l.data < l.feito::date) as retroativo,
      t.taxa, t.parcelas, t.cartao,
      (select jsonb_agg(jsonb_build_object('forma', r.forma, 'parcela', r.k, 'de', r.n, 'cai_em', r.cai_em, 'valor', r.valor, 'taxa', r.taxa, 'bruto', r.bruto) order by r.cai_em, r.forma)
        from (
          select x.forma, k, q.n, x.cai_em + 30 * (k - 1) as cai_em,
            case when k = 1 then (x.valor - x.taxa) - trunc((x.valor - x.taxa) / q.n, 2) * (q.n - 1) else trunc((x.valor - x.taxa) / q.n, 2) end as valor,
            case when k = 1 then x.taxa - trunc(x.taxa / q.n, 2) * (q.n - 1) else trunc(x.taxa / q.n, 2) end as taxa,
            case when k = 1 then x.valor - trunc(x.valor / q.n, 2) * (q.n - 1) else trunc(x.valor / q.n, 2) end as bruto
          from jsonb_to_recordset(t.partes) as x(forma text, valor numeric, taxa numeric, cai_em date, parcelas int)
          cross join lateral (select case when x.forma = 'credito' then least(greatest(coalesce(x.parcelas, 1), 1), 12) else 1 end as n) q
          cross join lateral generate_series(1, q.n) k
          where x.cai_em is not null
        ) r) as repasses,
      case when l.tipo = 'entrada' then
        coalesce((select sum(d.valor) from public.devolucoes d where d.petshop_id = p and d.venda_id = l.id and coalesce(d.saida_id, d.credito_id) is not null), 0)
        + coalesce((select sum(s.valor) from public.lancamentos s where s.petshop_id = p and s.devolucao_de = l.id and s.tipo = 'saida' and s.pago), 0)
      else 0 end as devolvido,
      coalesce((select sum(least(d.valor, coalesce(d.valor_novos, 0))) from public.devolucoes d
        where d.petshop_id = p and d.modo = 'troca' and (d.entrada_id = l.id or d.saida_id = l.id)), 0) as trocado,
      (select sum(round(m.quantidade * m.custo_unitario, 2)) from public.movimentos_estoque m
        where m.petshop_id = p and m.lancamento_id = l.id and m.tipo = 'saida' and m.motivo = 'Venda') as custo
    from l left join public.lancamentos_taxas t on t.lancamento_id = l.id and l.tipo = 'entrada' and l.pago and l.movimento is null
  )
  select jsonb_build_object(
    'de', p_de, 'ate', p_ate, 'hoje', v_hoje,
    'linhas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'data_servico', x.data_servico, 'lancado_em', to_char(x.feito, 'YYYY-MM-DD"T"HH24:MI'), 'retroativo', x.retroativo,
        'taxa', x.taxa, 'parcelas', x.parcelas, 'cartao', x.cartao, 'repasses', coalesce(x.repasses, '[]'::jsonb),
        'devolvido', x.devolvido, 'trocado', x.trocado, 'custo', x.custo)) from linhas x), '[]'::jsonb),
    'creditos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'dia', (c.criado_em at time zone v_fuso)::date, 'hora', to_char(c.criado_em at time zone v_fuso, 'HH24:MI'),
        'cliente_id', c.cliente_id, 'cliente', cl.nome, 'valor', c.valor, 'motivo', c.motivo, 'lancamento_id', c.lancamento_id, 'estadia_id', c.estadia_id)
        order by c.criado_em, c.id)
      from public.clientes_creditos c left join public.clientes cl on cl.id = c.cliente_id
      where c.petshop_id = p and c.criado_em >= v_ini and c.criado_em < v_fim), '[]'::jsonb)
  ) into v_res;
  return v_res;
end $$;
revoke execute on function public.lancamentos_para_contador(uuid, date, date) from public, anon;
grant execute on function public.lancamentos_para_contador(uuid, date, date) to authenticated;

-- =====================================================================================================================
-- 6. Saldos em aberto (hoje): o que o pet shop tem a receber e o que deve em serviço ou dinheiro aos tutores
-- =====================================================================================================================
--   fiado: contas a receber em aberto, por cliente;
--   credito: crédito de tutores ainda não usado, por tutor;
--   pacotes: pacotes vendidos e ainda não usados (o serviço devido = usos que faltam × preço pago por uso);
--   sinais: sinais já recebidos de reservas que ainda não viraram estadia encerrada.
create or replace function public.saldos_em_aberto(p uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fuso text; v_hoje date; v_res jsonb;
begin
  if (select auth.uid()) is null or p is null or not (p in (select public.meus_petshops())) then
    raise exception 'Sem acesso a este pet shop.' using errcode = '42501';
  end if;
  if not public.cuido_do_financeiro(p) then
    raise exception 'Os saldos são com quem cuida do financeiro.' using errcode = '42501';
  end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p;
  v_hoje := (now() at time zone v_fuso)::date;

  with fi as (
    select l.cliente_id, max(c.nome) as nome, count(*) as contas, sum(l.valor) as valor, min(coalesce(l.devido_desde, (l.criado_em at time zone v_fuso)::date)) as desde,
      min(l.vencimento) as vence, count(*) filter (where l.vencimento < v_hoje) as atrasadas
    from public.lancamentos l left join public.clientes c on c.id = l.cliente_id
    where l.petshop_id = p and l.tipo = 'entrada' and not l.pago and l.movimento is null
    group by l.cliente_id
  ),
  cr as (
    select c.cliente_id, max(cl.nome) as nome, sum(c.valor) as valor, max((c.criado_em at time zone v_fuso)::date) as ultimo
    from public.clientes_creditos c left join public.clientes cl on cl.id = c.cliente_id
    where c.petshop_id = p group by c.cliente_id having sum(c.valor) <> 0
  ),
  pa as (
    select k.id, k.nome, pe.nome as pet, cl.nome as tutor, k.total, k.usados, k.total - k.usados as faltam, k.preco, k.comprado_em, k.vence_em,
      case when k.total > 0 then round(k.preco * (k.total - k.usados) / k.total, 2) else 0 end as devido
    from public.pacotes_clientes k left join public.pets pe on pe.id = k.pet_id left join public.clientes cl on cl.id = pe.cliente_id
    where k.petshop_id = p and k.ativo and k.usados < k.total and (k.vence_em is null or k.vence_em >= v_hoje)
  ),
  si as (
    select e.id, pe.nome as pet, cl.nome as tutor, e.tipo, (e.entrada at time zone v_fuso)::date as entrada, e.status,
      case when v.sinal_estado = 'pago' then coalesce(nullif(v.sinal_recebido, 0), v.sinal) else v.sinal_recebido end as recebido, v.sinal_pago_em
    from public.estadias_valores v join public.estadias e on e.id = v.estadia_id
      left join public.pets pe on pe.id = e.pet_id left join public.clientes cl on cl.id = pe.cliente_id
    where v.petshop_id = p and e.status in ('reservada', 'em_casa')
      and (v.sinal_estado = 'pago' or (v.sinal_estado = 'a_receber' and v.sinal_recebido > 0))
  )
  select jsonb_build_object(
    'hoje', v_hoje,
    'fiado', jsonb_build_object('total', coalesce((select sum(valor) from fi), 0), 'contas', coalesce((select sum(contas) from fi), 0),
      'linhas', coalesce((select jsonb_agg(jsonb_build_object('cliente_id', f.cliente_id, 'nome', f.nome, 'contas', f.contas, 'valor', f.valor,
        'desde', f.desde, 'vence', f.vence, 'atrasadas', f.atrasadas) order by f.valor desc, f.nome) from fi f), '[]'::jsonb)),
    'credito', jsonb_build_object('total', coalesce((select sum(valor) from cr), 0),
      'linhas', coalesce((select jsonb_agg(jsonb_build_object('cliente_id', c.cliente_id, 'nome', c.nome, 'valor', c.valor, 'ultimo', c.ultimo) order by c.valor desc, c.nome) from cr c), '[]'::jsonb)),
    'pacotes', jsonb_build_object('total', coalesce((select sum(devido) from pa), 0), 'usos', coalesce((select sum(faltam) from pa), 0),
      'linhas', coalesce((select jsonb_agg(jsonb_build_object('id', k.id, 'nome', k.nome, 'pet', k.pet, 'tutor', k.tutor, 'total', k.total, 'usados', k.usados,
        'faltam', k.faltam, 'preco', k.preco, 'devido', k.devido, 'comprado_em', k.comprado_em, 'vence_em', k.vence_em) order by k.comprado_em, k.id) from pa k), '[]'::jsonb)),
    'sinais', jsonb_build_object('total', coalesce((select sum(recebido) from si), 0),
      'linhas', coalesce((select jsonb_agg(jsonb_build_object('estadia_id', s.id, 'pet', s.pet, 'tutor', s.tutor, 'tipo', s.tipo, 'entrada', s.entrada,
        'status', s.status, 'recebido', s.recebido, 'pago_em', s.sinal_pago_em) order by s.entrada, s.id) from si s where s.recebido > 0), '[]'::jsonb))
  ) into v_res;
  return v_res;
end $$;
revoke execute on function public.saldos_em_aberto(uuid) from public, anon;
grant execute on function public.saldos_em_aberto(uuid) to authenticated;
