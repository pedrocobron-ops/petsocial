-- Alterações em valores com lugar fixo (Financeiro, aba Alterações) e comissão linha por linha.
--
-- 1. `alteracoes_do_periodo`: a mesma lista de `alteracoes_de_valores` (Hoje), mas por período e com as alterações da própria
--    pessoa quando ela pede ("Todas, inclui as minhas"). O dono que trabalha sozinho passa a ver o que ele mesmo mudou.
--    O aviso da tela Hoje continua só com o que os outros mudaram (função de antes, sem mudança).
-- 2. `comissao_linhas_calc` (interna): a conta da comissão linha por linha (cada serviço de cada atendimento, os extras, o
--    pacote e os produtos), com a base, o percentual e o valor. `comissao_calcular` passa a somar essas linhas: a mesma conta,
--    escrita uma vez só, para o total de Relatórios, "Minha comissão" e o extrato linha por linha darem sempre o mesmo número.
-- 3. `comissao_extrato`: o extrato de um período (totais, linhas, pagamentos). Quem cuida do financeiro vê todo mundo; as
--    outras pessoas só o próprio (a mesma regra de "Minha comissão"). Usado pelo detalhe da comissão em Relatórios e pelo Mozart.
--
-- Aditiva: funções novas; `comissao_calcular` é trocada com a mesma assinatura e o mesmo resultado. O código de hoje continua
-- igual (não chama as novas). Pode rodar de novo.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Alterações em valores por período
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.alteracoes_do_periodo(p uuid, p_desde timestamptz, p_ate timestamptz, p_minhas boolean default false)
returns table (id uuid, tipo text, quando timestamptz, quem_nome text, descricao text, de numeric, para numeric, abaixo_do_custo boolean,
  minha boolean, lancamento_id uuid)
language sql stable security definer set search_path = '' as $$
  with eu as (select (select auth.uid()) as uid), bruto as (
    select a.id, a.acao, a.quando, a.quem, a.quem_nome, a.lancamento_id, l.itens, l.agendamento_id, l.categoria, a.antes, a.depois, l.forma, l.pagamentos,
      coalesce(nullif(btrim(coalesce(l.descricao, a.antes ->> 'descricao')), ''), l.categoria, a.antes ->> 'categoria', 'Lançamento') as descricao,
      case when a.acao = 'apagou' then (a.antes ->> 'valor')::numeric when a.antes ? 'valor' then (a.antes ->> 'valor')::numeric else l.valor end as de,
      case when a.acao = 'apagou' then null when a.depois ? 'valor' then (a.depois ->> 'valor')::numeric else l.valor end as para
    from public.lancamentos_alteracoes a
    left join public.lancamentos l on l.id = a.lancamento_id
    where a.petshop_id = p and a.quando >= p_desde and a.quando <= p_ate
      and (a.acao = 'apagou' or a.antes ?| array['valor', 'forma', 'pagamentos', 'data', 'tipo'])
      -- baixa de uma conta a pagar ou desfazer de recebimento não é "valor recebido alterado"
      and coalesce((a.antes ->> 'pago')::boolean, true)
  ), com_forma as (
    select b.*,
      b.acao <> 'apagou' and (b.antes ? 'forma' or b.antes ? 'pagamentos') as mudou_forma,
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
        where x.custo > 0) - 0.005, false) as abaixo_do_custo,
      case when b.acao = 'apagou' then null else b.lancamento_id end as lancamento_id
    from com_forma b
    union all
    select x.id, x.tipo, x.quando, x.quem, x.quem_nome, x.item, x.de, x.para, x.abaixo_do_custo, x.lancamento_id
    from public.precos_alterados x
    where x.petshop_id = p and x.quando >= p_desde and x.quando <= p_ate
  )
  select t.id, t.tipo, t.quando, t.quem_nome, t.descricao, t.de, t.para, t.abaixo_do_custo, t.quem is not distinct from eu.uid, t.lancamento_id
  from tudo t, eu
  where (select public.cuido_do_financeiro(p)) and p_desde is not null and p_ate is not null and p_ate >= p_desde
    and p_ate - p_desde <= interval '400 days'
    and (p_minhas or t.quem is distinct from eu.uid)
  order by t.quando desc
  limit 1000
$$;
revoke execute on function public.alteracoes_do_periodo(uuid, timestamptz, timestamptz, boolean) from public, anon;
grant execute on function public.alteracoes_do_periodo(uuid, timestamptz, timestamptz, boolean) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. A comissão linha por linha (interna) e o total como a soma das linhas
-- ---------------------------------------------------------------------------------------------------------------------
-- Uma linha por parte de cada atendimento concluído:
--   servico  cada serviço do horário, com o valor cobrado dele (desconto já repartido) e o percentual que vale para ele
--   extra    os extras da conta (só com "Extras contam para a comissão"), no percentual do serviço principal
--   pacote   horário com vários serviços pago pelo pacote ou ainda sem conta: o serviço principal pelo preço da agenda
--   produto  produtos vendidos na conta do atendimento (com "Comissão sobre produtos")
--   nada     atendimento sem nenhuma parte com valor (só para contar o atendimento)
-- `valor` = base × percentual / 100, sem arredondar (o total arredonda a soma, como sempre foi).
-- É a conta da migração 20261170 (comissao_calcular), sem mudança: só separada em linhas.
create or replace function public.comissao_linhas_calc(p_petshop uuid, p_de date, p_ate date, p_profissional uuid default null)
returns table (profissional_id uuid, agendamento_id uuid, inicio timestamptz, pacote boolean, tipo text, servico_id uuid, base numeric, pct numeric, valor numeric)
language sql stable security definer set search_path = '' as $$
  with s as (
    select coalesce(x.fuso, 'America/Sao_Paulo') as fuso,
      coalesce(x.opcoes -> 'comissao.em_extras' = 'true'::jsonb, false) as em_extras,
      coalesce(x.opcoes -> 'comissao.por_servico' = 'true'::jsonb, false) as por_servico,
      case when coalesce(x.opcoes -> 'comissao.em_produtos' = 'true'::jsonb, false) and jsonb_typeof(x.opcoes -> 'comissao.produtos_pct') = 'number'
        then least(100, greatest(0, (x.opcoes ->> 'comissao.produtos_pct')::numeric)) else 0 end as produtos_pct
    from public.petshops x where x.id = p_petshop
  ), ags as (
    select a.id, a.inicio, a.servico_id, a.profissional_id, a.preco, a.pacote_cliente_id, p.comissao_pct, s.por_servico,
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
  ), partes as (
    -- um só serviço: o serviço (e os extras) no percentual do serviço
    select g.id, 1 as ordem, 'servico' as tipo, g.servico_id, g.base_servico as base, g.pct from ags g where not g.varios
    union all
    select g.id, 8, 'extra', null::uuid, g.base_extra, g.pct from ags g where g.base_extra <> 0
    -- vários serviços: cada um com o valor dele e o percentual que vale para ele
    union all
    select g.id, 2, 'servico', r.servico_id, r.valor, case when g.por_servico then coalesce(c2.pct, g.comissao_pct) else g.comissao_pct end
    from ags g
    cross join lateral (
      select t.servico_id, t.valor from public.partes_por_servico(g.id, g.base_servico, g.itens, g.parte_servico is not null) t where g.conta_id is not null
      union all
      select e.servico_id, coalesce(e.preco, 0) from public.agendamento_servicos e where g.conta_id is null and e.agendamento_id = g.id
    ) r
    left join public.comissao_servicos c2 on c2.servico_id = r.servico_id
    where g.varios
    union all
    select g.id, 1, case when g.pacote_cliente_id is not null then 'pacote' else 'servico' end, g.servico_id, coalesce(g.preco, 0), g.pct from ags g where g.varios and (g.conta_id is null or g.pacote_cliente_id is not null)
    union all
    select g.id, 9, 'produto', null::uuid, g.produtos, g.produtos_pct from ags g where g.produtos <> 0
  )
  select g.profissional_id, g.id, g.inicio, (g.pacote or (g.varios and g.pacote_cliente_id is not null)),
    coalesce(x.tipo, 'nada'), x.servico_id, coalesce(x.base, 0), coalesce(x.pct, 0), coalesce(x.base * x.pct / 100, 0)
  from ags g
  left join partes x on x.id = g.id
  order by g.inicio, g.id, x.ordem
$$;
revoke execute on function public.comissao_linhas_calc(uuid, date, date, uuid) from public, anon, authenticated;

-- Mesma assinatura e mesmo resultado da migração 20261170: agora é a soma das linhas acima.
create or replace function public.comissao_calcular(p_petshop uuid, p_de date, p_ate date, p_profissional uuid default null)
returns table (profissional_id uuid, atendimentos integer, com_pacote integer, base numeric, base_produtos numeric, comissao_servicos numeric, comissao_produtos numeric, comissao numeric)
language sql stable security definer set search_path = '' as $$
  select x.profissional_id, count(distinct x.agendamento_id)::integer, (count(distinct x.agendamento_id) filter (where x.pacote))::integer,
    round(coalesce(sum(x.base) filter (where x.tipo <> 'produto'), 0), 2),
    round(coalesce(sum(x.base) filter (where x.tipo = 'produto'), 0), 2),
    round(coalesce(sum(x.valor) filter (where x.tipo <> 'produto'), 0), 2),
    round(coalesce(sum(x.valor) filter (where x.tipo = 'produto'), 0), 2),
    round(coalesce(sum(x.valor) filter (where x.tipo <> 'produto'), 0), 2) + round(coalesce(sum(x.valor) filter (where x.tipo = 'produto'), 0), 2)
  from public.comissao_linhas_calc(p_petshop, p_de, p_ate, p_profissional) x
  group by x.profissional_id
$$;
revoke execute on function public.comissao_calcular(uuid, date, date, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Extrato da comissão de um período
-- ---------------------------------------------------------------------------------------------------------------------
-- [{profissional_id, nome, pct, atendimentos, com_pacote, base, base_produtos, comissao_servicos, comissao_produtos, comissao,
--   pago (pagamentos inteiros dentro das datas), pagamentos:[{de, ate, valor, pago_em}] (os que tocam as datas),
--   linhas:[{agendamento_id, inicio, pet, servico, tipo, base, pct, valor}]}]
-- Quem cuida do financeiro: todo mundo com comissão (ou só p_profissional). As outras pessoas: só o próprio extrato,
-- seja qual for o p_profissional pedido.
create or replace function public.comissao_extrato(p_petshop uuid, p_de date, p_ate date, p_profissional uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fin boolean;
  v_eu uuid;
  v_quem uuid;
begin
  if (select auth.uid()) is null or p_petshop is null or not (p_petshop in (select public.meus_petshops())) then
    raise exception 'Sem acesso a este pet shop.' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 366 then
    raise exception 'Escolha um período de até um ano.';
  end if;
  v_fin := public.cuido_do_financeiro(p_petshop);
  select x.id into v_eu from public.profissionais x where x.petshop_id = p_petshop and x.user_id = (select auth.uid()) and x.ativo limit 1;
  if v_fin then v_quem := p_profissional;
  elsif v_eu is null then return '[]'::jsonb;
  else v_quem := v_eu;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'profissional_id', p.id, 'nome', p.nome, 'pct', p.comissao_pct,
        'atendimentos', coalesce(c.atendimentos, 0), 'com_pacote', coalesce(c.com_pacote, 0),
        'base', coalesce(c.base, 0), 'base_produtos', coalesce(c.base_produtos, 0),
        'comissao_servicos', coalesce(c.comissao_servicos, 0), 'comissao_produtos', coalesce(c.comissao_produtos, 0), 'comissao', coalesce(c.comissao, 0),
        'pago', coalesce((select sum(g.valor) from public.comissoes_pagas g where g.profissional_id = p.id and g.de >= p_de and g.ate <= p_ate), 0),
        'pagamentos', coalesce((select jsonb_agg(jsonb_build_object('de', g.de, 'ate', g.ate, 'valor', g.valor, 'pago_em', g.pago_em) order by g.de, g.pago_em)
          from public.comissoes_pagas g where g.profissional_id = p.id and g.de <= p_ate and g.ate >= p_de), '[]'::jsonb),
        'linhas', coalesce((select jsonb_agg(jsonb_build_object(
            'agendamento_id', l.agendamento_id, 'inicio', l.inicio, 'tipo', l.tipo,
            'pet', (select pe.nome from public.agendamentos a join public.pets pe on pe.id = a.pet_id where a.id = l.agendamento_id),
            'servico', case l.tipo when 'extra' then 'Extras da conta' when 'produto' then 'Produtos vendidos na conta'
              else coalesce((select sv.nome from public.servicos sv where sv.id = l.servico_id), 'Serviço') end,
            'base', round(l.base, 2), 'pct', l.pct, 'valor', round(l.valor, 2), 'valor_exato', l.valor) order by l.inicio, l.agendamento_id)
          from public.comissao_linhas_calc(p_petshop, p_de, p_ate, p.id) l where l.tipo <> 'nada'), '[]'::jsonb)
      ) order by coalesce(c.comissao, 0) desc, p.nome)
    from public.profissionais p
    left join public.comissao_calcular(p_petshop, p_de, p_ate, v_quem) c on c.profissional_id = p.id
    where p.petshop_id = p_petshop and (v_quem is null or p.id = v_quem)
      and (p.comissao_pct > 0 or coalesce(c.comissao, 0) > 0 or p.id = v_quem)
      and (p.ativo or coalesce(c.atendimentos, 0) > 0)
  ), '[]'::jsonb);
end $$;
revoke execute on function public.comissao_extrato(uuid, date, date, uuid) from public, anon;
grant execute on function public.comissao_extrato(uuid, date, date, uuid) to authenticated;
