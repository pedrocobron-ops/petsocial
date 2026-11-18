-- Hoje: a agenda do dia traz o sexo do pet (os textos dizem "Pipoca marcada"), igual à leitura pela API (SELECT_AGENDAMENTO).
-- gestao_hoje: cópia de 20261205500000 + pe.sexo.
create or replace function public.gestao_hoje(p uuid, a jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path to ''
as $$
declare
  v_ini timestamptz := (a->>'hoje_ini')::timestamptz;
  v_amanha timestamptz := (a->>'amanha')::timestamptz;
  v_depois timestamptz := (a->>'depois')::timestamptz;
  v_seg timestamptz := (a->>'seg')::timestamptz;
  v_seg7 timestamptz := (a->>'seg7')::timestamptz;
  v_ha30 timestamptz := (a->>'ha30')::timestamptz;
  v_dia date := (a->>'dia')::date;
  v_ha6 date := (a->>'ha6')::date;
  v_mais7 date := (a->>'mais7')::date;
  v_estoque boolean := coalesce((a->>'estoque')::boolean, false);
  v_fin boolean := coalesce((a->>'financeiro')::boolean, false);
  v_cuido boolean := coalesce((a->>'cuido')::boolean, false);
  v_pacotes boolean := coalesce((a->>'pacotes')::boolean, false);
  v_cobrar boolean := coalesce((a->>'cobrar')::boolean, false);
  v_cobrar_hoje boolean := coalesce((a->>'cobrar_hoje')::boolean, false);
  v_devol text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(a->'devolucao', '[]'::jsonb)) x), array[]::text[]);
  v_r jsonb := '{}'::jsonb;
  v_lista jsonb;
  v_ids uuid[];
  v_x jsonb;
  v_n int;
begin
  -- agenda de hoje, com pet, tutor, serviços e profissional (o mesmo que SELECT_AGENDAMENTO)
  select coalesce(jsonb_agg(to_jsonb(x) order by x.inicio, x.id), '[]'::jsonb), coalesce(array_agg(x.id), array[]::uuid[]) into v_lista, v_ids from (
    select g.id, g.petshop_id, g.pet_id, g.servico_id, g.profissional_id, g.inicio, g.fim, g.status, g.obs, g.leva_traz, g.endereco_leva_traz,
      g.checklist, g.pacote_cliente_id, g.lembrete_em, g.origem, g.criado_por, g.criado_em, g.serie_id, g.foto_antes, g.foto_depois,
      g.pronto_avisado_em, g.sem_cobranca, g.sem_cobranca_em, g.sem_cobranca_nome, g.promo,
      (select to_jsonb(y) from (
        select pe.id, pe.nome, pe.foto, pe.porte, pe.especie, pe.raca, pe.alertas, pe.sexo,
          (select to_jsonb(z) from (select c.id, c.nome, c.telefone from public.clientes c where c.id = pe.cliente_id) z) as clientes
        from public.pets pe where pe.id = g.pet_id) y) as pets,
      (select to_jsonb(y) from (select s.id, s.nome, s.cor, s.categoria from public.servicos s where s.id = g.servico_id) y) as servicos,
      (select to_jsonb(y) from (select f.id, f.nome, f.cor from public.profissionais f where f.id = g.profissional_id) y) as profissionais,
      coalesce((select jsonb_agg(to_jsonb(y) order by y.ordem, y.id) from (
        select o.id, o.servico_id, o.ordem,
          (select to_jsonb(w) from (select s.id, s.nome, s.cor, s.categoria from public.servicos s where s.id = o.servico_id) w) as servicos
        from public.agendamento_servicos o where o.agendamento_id = g.id) y), '[]'::jsonb) as agendamento_servicos
    from public.agendamentos g
    where g.petshop_id = p and g.inicio >= v_ini and g.inicio < v_amanha
  ) x;
  v_r := v_r || jsonb_build_object('lista', v_lista);
  -- os preços: a mesma função de sempre (só quem recebe vê; os outros recebem a lista sem preço)
  begin
    v_r := v_r || jsonb_build_object('precos', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'preco', r.preco)) from public.agendamentos_precos(p, v_ids) r), '[]'::jsonb));
  exception when others then v_r := v_r || jsonb_build_object('precos', null);
  end;

  v_r := v_r || jsonb_build_object(
    'amanha', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select g.id, g.lembrete_em, g.status,
        (select to_jsonb(y) from (select (select to_jsonb(z) from (select c.id, c.telefone from public.clientes c where c.id = pe.cliente_id) z) as clientes
           from public.pets pe where pe.id = g.pet_id) y) as pets
      from public.agendamentos g where g.petshop_id = p and g.inicio >= v_amanha and g.inicio < v_depois) x), '[]'::jsonb),
    'em_casa', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select e.id, e.status, e.entrada, e.saida_prevista from public.estadias e
      where e.petshop_id = p and e.status in ('em_casa', 'reservada') limit 1000) x), '[]'::jsonb),
    'contagens', public.gestao_contagens(p),
    'semana', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select g.inicio, g.status from public.agendamentos g where g.petshop_id = p and g.inicio >= v_seg and g.inicio < v_seg7) x), '[]'::jsonb),
    -- serviços mais pedidos nos últimos 30 dias: na ordem em que cada um apareceu primeiro (a tela ordena pelo total)
    'servicos_mes', coalesce((select jsonb_agg(jsonb_build_object('rotulo', x.nome, 'valor', x.n, 'cor', x.cor) order by x.primeiro) from (
      select y.nome, count(*) as n, (array_agg(y.cor order by y.k))[1] as cor, min(y.k) as primeiro from (
        select s.nome, s.cor, row_number() over (order by g.inicio, g.id) as k
        from public.agendamentos g join public.servicos s on s.id = g.servico_id
        where g.petshop_id = p and g.inicio >= v_ha30 and g.inicio < v_amanha and g.status not in ('cancelado', 'faltou')) y
      group by y.nome) x), '[]'::jsonb),
    'proximos', coalesce((select jsonb_agg(to_jsonb(x) order by x.inicio, x.id) from (
      select g.id, g.inicio, (select to_jsonb(y) from (select pe.nome from public.pets pe where pe.id = g.pet_id) y) as pets
      from public.agendamentos g where g.petshop_id = p and g.inicio >= v_amanha and g.status in ('marcado', 'confirmado')
      order by g.inicio, g.id limit 2) x), '[]'::jsonb),
    'sem_fechar_total', (select count(*) from public.agendamentos g where g.petshop_id = p and g.inicio < v_ini and g.status in ('marcado', 'confirmado', 'em_atendimento')),
    'sem_fechar', coalesce((select jsonb_agg(to_jsonb(x) order by x.inicio, x.id) from (
      select g.id, g.inicio, (select to_jsonb(y) from (select pe.nome from public.pets pe where pe.id = g.pet_id) y) as pets
      from public.agendamentos g where g.petshop_id = p and g.inicio < v_ini and g.status in ('marcado', 'confirmado', 'em_atendimento')
      order by g.inicio, g.id limit 3) x), '[]'::jsonb)
  );

  -- estoque, dinheiro e pacotes: só para quem tem a área (como na leitura antiga)
  if v_estoque then
    v_r := v_r || jsonb_build_object('acabando', coalesce((select jsonb_agg(to_jsonb(x) order by x.nome, x.id) from (
      select d.id, d.nome, d.estoque, d.estoque_minimo from public.produtos d
      where d.petshop_id = p and d.ativo and d.estoque_minimo > 0) x), '[]'::jsonb));
  end if;
  if v_fin then
    v_r := v_r || jsonb_build_object('entradas', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select l.valor, l.tipo, l.categoria from public.lancamentos l
      where l.petshop_id = p and l.pago and l.movimento is null and l.data = v_dia) x), '[]'::jsonb));
  end if;
  if v_cuido then
    v_r := v_r || jsonb_build_object(
      'contas', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select l.id, l.valor, l.vencimento, l.tipo, l.categoria from public.lancamentos l
        where l.petshop_id = p and not l.pago and l.vencimento <= v_dia) x), '[]'::jsonb),
      'ultimos7', coalesce((select jsonb_agg(jsonb_build_object('data', x.data, 'valor', x.valor) order by x.data) from (
        select l.data, sum(l.valor) as valor from public.lancamentos l
        where l.petshop_id = p and l.pago and l.tipo = 'entrada' and l.movimento is null and l.data >= v_ha6 and l.data <= v_dia
        group by l.data) x), '[]'::jsonb));
    -- devolução ao tutor e crédito deixado (ajustesDoFaturamento): cada parte que falhar vale vazia, como antes
    begin
      v_x := coalesce((select jsonb_agg(to_jsonb(x) order by x.data, x.id) from (
        select l.id, l.valor, l.data, l.cliente_id from public.lancamentos l
        where l.petshop_id = p and l.tipo = 'saida' and l.pago and l.movimento is null and l.categoria = any (v_devol)
          and l.data >= v_ha6 and l.data <= v_dia) x), '[]'::jsonb);
    exception when others then v_x := '[]'::jsonb;
    end;
    v_r := v_r || jsonb_build_object('devolucoes', v_x);
    begin
      v_x := coalesce((select jsonb_agg(to_jsonb(x) order by x.criado_em, x.id) from (
        select c.id, c.valor, c.criado_em, c.lancamento_id, c.cliente_id from public.clientes_creditos c
        where c.petshop_id = p and c.criado_em >= (a->>'cred_de')::timestamptz and c.criado_em < (a->>'cred_ate')::timestamptz) x), '[]'::jsonb);
    exception when others then v_x := '[]'::jsonb;
    end;
    v_r := v_r || jsonb_build_object('creditos', v_x);
  end if;
  if v_pacotes then
    v_r := v_r || jsonb_build_object('pacotes', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select k.id from public.pacotes_clientes k
      where k.petshop_id = p and k.ativo and k.vence_em >= v_dia and k.vence_em <= v_mais7) x), '[]'::jsonb));
  end if;

  -- saúde vencendo (buscarSaudeVencendo): os cuidados até o limite, depois os outros dos mesmos pets, e o nome dos pets ativos
  begin
    v_r := v_r || jsonb_build_object('saude', jsonb_build_object(
      'perto', coalesce((select jsonb_agg(to_jsonb(x) order by x.vence_em, x.id) from (
        select h.id, h.pet_id, h.tipo, h.nome, h.aplicado_em, h.vence_em, h.criado_em from public.pets_saude h
        where h.petshop_id = p and h.vence_em <= (a->>'saude_ate')::date) x), '[]'::jsonb),
      'depois', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from (
        select h.id, h.pet_id, h.tipo, h.nome, h.aplicado_em, h.vence_em, h.criado_em from public.pets_saude h
        where h.petshop_id = p and (h.vence_em > (a->>'saude_ate')::date or h.vence_em is null)
          and h.pet_id in (select q.pet_id from public.pets_saude q where q.petshop_id = p and q.vence_em <= (a->>'saude_ate')::date)) x), '[]'::jsonb),
      'pets', coalesce((select jsonb_agg(jsonb_build_object('id', pe.id, 'nome', pe.nome)) from public.pets pe
        where pe.petshop_id = p and pe.ativo
          and pe.id in (select q.pet_id from public.pets_saude q where q.petshop_id = p and q.vence_em <= (a->>'saude_ate')::date)), '[]'::jsonb)));
  exception when others then v_r := v_r || jsonb_build_object('saude', null);
  end;

  -- creche e hotel para quem recebe: check-outs sem cobrança e saídas depois do horário esperando a decisão da taxa
  if v_cobrar then
    begin
      select count(*) into v_n from (select 1 from public.estadias_para_cobrar(p) limit 150) x;
    exception when others then v_n := 0;
    end;
    v_r := v_r || jsonb_build_object('para_cobrar', v_n);
    begin
      select count(*) into v_n from public.creche_atrasos t
       where t.petshop_id = p and (t.estado = 'pendente' or (t.estado = 'recebida' and t.lancamento_id is null));
    exception when others then v_n := 0;
    end;
    v_r := v_r || jsonb_build_object('atrasos', v_n);
  end if;

  -- horários de hoje concluídos que ninguém cobrou (a marca "Falta cobrar" da lista e da frase do Mozart)
  if v_cobrar_hoje then
    begin
      v_r := v_r || jsonb_build_object('cobrar_hoje', coalesce((select jsonb_agg(c.id) from public.agendamentos_para_cobrar(p, v_dia, v_dia) c), '[]'::jsonb));
    exception when others then v_r := v_r || jsonb_build_object('cobrar_hoje', null);
    end;
  end if;

  return v_r;
end
$$;

revoke execute on function public.gestao_hoje(uuid, jsonb) from public, anon;
grant execute on function public.gestao_hoje(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
