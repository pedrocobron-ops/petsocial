-- Rodada 9 (N6): a equipe do chão (tosador, monitor) e os cuidados do hotel.
--
-- 1. Comissão sem preço: quem não tem Caixa, Financeiro nem Relatórios recebe só o TOTAL da própria comissão e a quantidade de
--    atendimentos. Base, percentual e o valor de cada linha saem vazios (o valor da linha dividido pelo percentual dá o preço do serviço).
--    O dono pode liberar os valores por linha (opção "comissao.mostrar_valores", desligada). Para essa pessoa o extrato vale sempre
--    por mês inteiro: pedir um dia só não isola o valor de um atendimento.
-- 2. Quadro do dia: "Entregue ao tutor" conclui o atendimento (como o Concluir da Agenda): aparece em Atendimentos para cobrar
--    e conta para a comissão.
-- 3. Mensalista: plano, valor e primeira cobrança numa gravação só (tudo ou nada).

/* ---------- 1. comissão ---------- */

/** Quem fala recebe os valores da comissão por linha (base, percentual, valor de cada atendimento)? */
create or replace function public.comissao_mostra_valores(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select public.tenho_area(p, array['caixa', 'financeiro', 'relatorios']))
    or coalesce((select jsonb_typeof(s.opcoes -> 'comissao.mostrar_valores') = 'boolean' and (s.opcoes ->> 'comissao.mostrar_valores')::boolean
                 from public.petshops s where s.id = p and s.id in (select public.meus_petshops())), false)
$$;
revoke execute on function public.comissao_mostra_valores(uuid) from public, anon;
grant execute on function public.comissao_mostra_valores(uuid) to authenticated;

-- copiada da 20261142 (última definição) + os valores vazios para quem não recebe
create or replace function public.minha_comissao(p_petshop uuid) returns jsonb
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
  v_ve boolean;
  v_tem boolean;
begin
  select * into eu from public.profissionais x where x.petshop_id = p_petshop and x.user_id = (select auth.uid()) and x.ativo limit 1;
  if not found then return null; end if;
  v_ve := public.comissao_mostra_valores(p_petshop);
  v_tem := coalesce(eu.comissao_pct, 0) > 0;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p_petshop;
  v_mes := date_trunc('month', (now() at time zone v_fuso)::date)::date;
  for i in 0..1 loop
    v_de := (v_mes - make_interval(months => i))::date;
    v_ate := (v_de + interval '1 month - 1 day')::date;
    select * into c from public.comissao_calcular(p_petshop, v_de, v_ate, eu.id);
    v_tem := v_tem or coalesce(c.comissao, 0) > 0;
    v_meses := v_meses || jsonb_build_object(
      'de', v_de, 'ate', v_ate,
      'atendimentos', coalesce(c.atendimentos, 0), 'com_pacote', coalesce(c.com_pacote, 0),
      'base', case when v_ve then coalesce(c.base, 0) end, 'base_produtos', case when v_ve then coalesce(c.base_produtos, 0) end,
      'comissao_servicos', case when v_ve then coalesce(c.comissao_servicos, 0) end,
      'comissao_produtos', case when v_ve then coalesce(c.comissao_produtos, 0) end, 'comissao', coalesce(c.comissao, 0),
      'pagos', coalesce((select jsonb_agg(jsonb_build_object('de', g.de, 'ate', g.ate, 'valor', g.valor, 'pago_em', g.pago_em) order by g.de)
        from public.comissoes_pagas g where g.profissional_id = eu.id and g.de <= v_ate and g.ate >= v_de), '[]'::jsonb));
  end loop;
  return jsonb_build_object('profissional_id', eu.id, 'pct', case when v_ve then eu.comissao_pct end, 'meses', v_meses,
    'so_total', not v_ve, 'tem_comissao', v_tem);
end $$;
revoke execute on function public.minha_comissao(uuid) from public, anon;
grant execute on function public.minha_comissao(uuid) to authenticated;

-- copiada da 20261184 (última definição) + os valores vazios e o mês inteiro para quem não recebe
create or replace function public.comissao_extrato(p_petshop uuid, p_de date, p_ate date, p_profissional uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fin boolean;
  v_eu uuid;
  v_quem uuid;
  v_ve boolean;
  v_de date := p_de;
  v_ate date := p_ate;
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
  v_ve := v_fin or public.comissao_mostra_valores(p_petshop);
  -- quem recebe só o total: o período vale por mês inteiro (um dia só mostraria o valor de um atendimento)
  if not v_ve then
    v_de := date_trunc('month', p_de)::date;
    v_ate := (date_trunc('month', p_ate) + interval '1 month - 1 day')::date;
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'profissional_id', p.id, 'nome', p.nome, 'pct', case when v_ve then p.comissao_pct end,
        'de', v_de, 'ate', v_ate, 'so_total', not v_ve,
        'atendimentos', coalesce(c.atendimentos, 0), 'com_pacote', coalesce(c.com_pacote, 0),
        'base', case when v_ve then coalesce(c.base, 0) end, 'base_produtos', case when v_ve then coalesce(c.base_produtos, 0) end,
        'comissao_servicos', case when v_ve then coalesce(c.comissao_servicos, 0) end,
        'comissao_produtos', case when v_ve then coalesce(c.comissao_produtos, 0) end, 'comissao', coalesce(c.comissao, 0),
        'pago', coalesce((select sum(g.valor) from public.comissoes_pagas g where g.profissional_id = p.id and g.de >= v_de and g.ate <= v_ate), 0),
        'pagamentos', coalesce((select jsonb_agg(jsonb_build_object('de', g.de, 'ate', g.ate, 'valor', g.valor, 'pago_em', g.pago_em) order by g.de, g.pago_em)
          from public.comissoes_pagas g where g.profissional_id = p.id and g.de <= v_ate and g.ate >= v_de), '[]'::jsonb),
        'linhas', coalesce((select jsonb_agg(jsonb_build_object(
            'agendamento_id', l.agendamento_id, 'inicio', l.inicio, 'tipo', l.tipo,
            'pet', (select pe.nome from public.agendamentos a join public.pets pe on pe.id = a.pet_id where a.id = l.agendamento_id),
            'servico', case l.tipo when 'extra' then 'Extras da conta' when 'produto' then 'Produtos vendidos na conta'
              else coalesce((select sv.nome from public.servicos sv where sv.id = l.servico_id), 'Serviço') end,
            'base', case when v_ve then round(l.base, 2) end, 'pct', case when v_ve then l.pct end,
            'valor', case when v_ve then round(l.valor, 2) end, 'valor_exato', case when v_ve then l.valor end) order by l.inicio, l.agendamento_id)
          from public.comissao_linhas_calc(p_petshop, v_de, v_ate, p.id) l where l.tipo <> 'nada'), '[]'::jsonb)
      ) order by coalesce(c.comissao, 0) desc, p.nome)
    from public.profissionais p
    left join public.comissao_calcular(p_petshop, v_de, v_ate, v_quem) c on c.profissional_id = p.id
    where p.petshop_id = p_petshop and (v_quem is null or p.id = v_quem)
      and (p.comissao_pct > 0 or coalesce(c.comissao, 0) > 0 or p.id = v_quem)
      and (p.ativo or coalesce(c.atendimentos, 0) > 0)
  ), '[]'::jsonb);
end $$;
revoke execute on function public.comissao_extrato(uuid, date, date, uuid) from public, anon;
grant execute on function public.comissao_extrato(uuid, date, date, uuid) to authenticated;

/* ---------- 2. quadro do dia: entregue conclui ---------- */

-- copiada da 20261203 (última definição) + "Entregue ao tutor" conclui o atendimento que estava em atendimento
create or replace function public.quadro_mover(p_petshop uuid, p_agendamento uuid, p_para text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a record;
  q public.quadro_atendimento;
  v_fuso text;
  v_hoje date;
begin
  if not public.tenho_area(p_petshop, array['agenda']) then raise exception 'Sem acesso à agenda.'; end if;
  if not public.acesso_liberado(p_petshop) then raise exception 'A conta está só para consulta.'; end if;
  if p_para is null or p_para not in ('esperando', 'banho', 'secagem', 'tosa', 'pronto', 'entregue') then
    raise exception 'Etapa inválida.';
  end if;

  select g.id, g.status, g.inicio into a from public.agendamentos g
   where g.id = p_agendamento and g.petshop_id = p_petshop for update;
  if a.id is null then raise exception 'Horário não encontrado.'; end if;
  if a.status in ('cancelado', 'faltou') then raise exception 'Este horário foi desmarcado ou ficou como falta.'; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p_petshop;
  v_hoje := (now() at time zone v_fuso)::date;
  if (a.inicio at time zone v_fuso)::date > v_hoje then raise exception 'O quadro é só para os horários de hoje.'; end if;

  select * into q from public.quadro_atendimento x where x.agendamento_id = p_agendamento for update;

  if p_para = 'esperando' then
    if a.status = 'concluido' then raise exception 'Este atendimento já foi concluído: ele não volta para Esperando.'; end if;
    if a.status = 'em_atendimento' then
      -- o gatilho apaga a linha do quadro
      update public.agendamentos g set status = coalesce(q.status_antes, 'confirmado')::public.status_agendamento where g.id = p_agendamento;
    end if;
    delete from public.quadro_atendimento x where x.agendamento_id = p_agendamento;
    return jsonb_build_object('status', coalesce(q.status_antes, case when a.status = 'em_atendimento' then 'confirmado' else a.status::text end),
                              'etapa', null, 'etapa_em', null, 'chegou_em', null, 'entregue_em', null);
  end if;

  if p_para = 'entregue' then
    if a.status in ('marcado', 'confirmado') then raise exception 'O pet ainda não chegou.'; end if;
    insert into public.quadro_atendimento as x (agendamento_id, petshop_id, etapa, etapa_em, entregue_em, atualizado_por)
    values (p_agendamento, p_petshop, 'pronto', now(), now(), (select auth.uid()))
    on conflict (agendamento_id) do update
      set entregue_em = coalesce(x.entregue_em, excluded.entregue_em),
          etapa = coalesce(x.etapa, excluded.etapa), etapa_em = coalesce(x.etapa_em, excluded.etapa_em),
          atualizado_por = case when x.entregue_em is null then excluded.atualizado_por else x.atualizado_por end,
          atualizado_em = case when x.entregue_em is null then now() else x.atualizado_em end
    returning * into q;
    -- o pet foi embora: o atendimento fica concluído (o mesmo "Concluir atendimento" da Agenda). Sem conta fechada,
    -- aparece como Falta cobrar para quem cuida do caixa e conta para a comissão de quem atendeu.
    if a.status = 'em_atendimento' then
      update public.agendamentos g set status = 'concluido' where g.id = p_agendamento;
      a.status := 'concluido';
    end if;
  else
    -- chegou agora: o mesmo "Chegou: iniciar atendimento" da Agenda (o gatilho anota a hora e o status de antes)
    if a.status in ('marcado', 'confirmado') then
      update public.agendamentos g set status = 'em_atendimento' where g.id = p_agendamento;
      a.status := 'em_atendimento';
    end if;
    -- sem linha aqui, o pet já estava em atendimento antes (o gatilho não viu a chegada): a hora da chegada fica em branco
    insert into public.quadro_atendimento as x (agendamento_id, petshop_id, etapa, etapa_em, chegou_em, atualizado_por)
    values (p_agendamento, p_petshop, p_para, now(), null, (select auth.uid()))
    on conflict (agendamento_id) do update
      set etapa_em = case when x.etapa is distinct from excluded.etapa or x.entregue_em is not null then now() else x.etapa_em end,
          atualizado_por = case when x.etapa is distinct from excluded.etapa or x.entregue_em is not null then excluded.atualizado_por else x.atualizado_por end,
          atualizado_em = case when x.etapa is distinct from excluded.etapa or x.entregue_em is not null then now() else x.atualizado_em end,
          etapa = excluded.etapa,
          entregue_em = null,
          chegou_em = coalesce(x.chegou_em, excluded.chegou_em)
    returning * into q;
  end if;

  return jsonb_build_object('status', a.status::text, 'etapa', q.etapa, 'etapa_em', q.etapa_em, 'chegou_em', q.chegou_em, 'entregue_em', q.entregue_em);
end $$;
revoke execute on function public.quadro_mover(uuid, uuid, text) from public, anon;
grant execute on function public.quadro_mover(uuid, uuid, text) to authenticated;

-- quem já foi entregue pelo quadro e ficou "em atendimento" (últimos 45 dias, a janela de Atendimentos para cobrar): conclui agora.
-- Um por um: o que o banco recusar fica como está.
do $$
declare r record;
begin
  for r in
    select a.id from public.quadro_atendimento q join public.agendamentos a on a.id = q.agendamento_id
    where q.entregue_em is not null and a.status = 'em_atendimento' and a.inicio >= now() - interval '45 days'
  loop
    begin
      update public.agendamentos set status = 'concluido' where id = r.id;
    exception when others then
      raise notice 'entregue sem concluir %: %', r.id, sqlerrm;
    end;
  end loop;
end $$;

/* ---------- 3. mensalista numa gravação só ---------- */

-- Plano, valor (só de quem cuida do financeiro) e primeira cobrança: tudo ou nada. Roda com o acesso de quem chamou
-- (as regras das tabelas e os gatilhos valem como sempre).
create or replace function public.creche_plano_salvar(p_petshop uuid, p_pet uuid, p_plano uuid, p_campos jsonb, p_valores jsonb default null, p_cobranca jsonb default null)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid := p_plano;
  v_cobranca uuid;
  c jsonb := coalesce(p_campos, '{}'::jsonb);
  v_dias smallint[] := coalesce((select array_agg(x::smallint) from jsonb_array_elements_text(coalesce(c -> 'dias', '[]'::jsonb)) x), array[]::smallint[]);
begin
  if p_petshop is null or not (p_petshop in (select public.meus_petshops())) then raise exception 'Sem acesso a este pet shop.' using errcode = '42501'; end if;
  if v_id is null then
    insert into public.creche_planos (petshop_id, pet_id, dias, vence_dia, inicio, fim, obs, pausa_de, pausa_ate, taxi, primeira_cobranca)
    values (p_petshop, p_pet, v_dias, coalesce((c ->> 'vence_dia')::smallint, 5), (c ->> 'inicio')::date, (c ->> 'fim')::date, nullif(c ->> 'obs', ''),
      (c ->> 'pausa_de')::date, (c ->> 'pausa_ate')::date, nullif(c ->> 'taxi', ''), (c ->> 'primeira_cobranca')::date)
    returning id into v_id;
  else
    update public.creche_planos set dias = v_dias, vence_dia = coalesce((c ->> 'vence_dia')::smallint, vence_dia), inicio = (c ->> 'inicio')::date, fim = (c ->> 'fim')::date,
      obs = nullif(c ->> 'obs', ''), pausa_de = (c ->> 'pausa_de')::date, pausa_ate = (c ->> 'pausa_ate')::date, taxi = nullif(c ->> 'taxi', ''),
      primeira_cobranca = case when c ? 'primeira_cobranca' then (c ->> 'primeira_cobranca')::date else primeira_cobranca end
    where id = p_plano and petshop_id = p_petshop
    returning id into v_id;
    if v_id is null then raise exception 'Plano não encontrado, ou você não pode mudar este plano.'; end if;
  end if;
  if p_valores is not null then
    insert into public.creche_planos_valores as v (plano_id, petshop_id, valor_mensal, valor_extra, modelo_id, taxi_valor, taxi_modo, atualizado_em)
    values (v_id, p_petshop, (p_valores ->> 'valor_mensal')::numeric, (p_valores ->> 'valor_extra')::numeric, (p_valores ->> 'modelo_id')::uuid,
      (p_valores ->> 'taxi_valor')::numeric, coalesce(nullif(p_valores ->> 'taxi_modo', ''), 'dia'), now())
    on conflict (plano_id) do update set valor_mensal = excluded.valor_mensal, valor_extra = excluded.valor_extra, modelo_id = excluded.modelo_id,
      taxi_valor = excluded.taxi_valor, taxi_modo = excluded.taxi_modo, atualizado_em = now();
  end if;
  if p_cobranca is not null then
    v_cobranca := public.creche_cobranca_criar(v_id, (p_cobranca ->> 'mes')::date, (p_cobranca ->> 'valor')::numeric, 0, (p_cobranca ->> 'vencimento')::date);
  end if;
  return jsonb_build_object('id', v_id, 'cobranca_id', v_cobranca);
end $$;
revoke execute on function public.creche_plano_salvar(uuid, uuid, uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.creche_plano_salvar(uuid, uuid, uuid, jsonb, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';
