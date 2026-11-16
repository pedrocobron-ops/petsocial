-- Creche: quando um cão sai (o plano ganha data de fim).
-- Só acrescenta: uma coluna nova em creche_cobrancas, duas funções novas e duas funções trocadas com a mesma assinatura.
-- O código de hoje segue funcionando: a coluna nova tem valor padrão, as funções trocadas devolvem o mesmo para planos sem fim
-- e as funções novas só são chamadas pelo código novo.
--
-- 1. A mensalidade sugerida do mês em que o plano termina é proporcional aos dias do plano até o fim, pela mesma conta da
--    primeira cobrança (dia fechado e dia em que o negócio não abre ficam fora dos dois lados). Sem fim no mês, nada muda.
--    A geração automática continua criando só a mensalidade cheia: a do mês da saída espera a conferência em Gerar cobranças.
-- 2. Dias extras e taxas de busca que iriam para a cobrança do mês seguinte, de um plano que acabou, entram na cobrança do mês
--    da saída (se ainda não foi paga) ou numa cobrança de "acerto da saída" (creche_saida_extras).
-- 3. Mensalidade já paga não muda: quem recebe pode anotar na cobrança o que ficou para devolver (creche_cobranca_anotar).

alter table public.creche_cobrancas add column acerto_saida boolean not null default false;
grant select (acerto_saida) on public.creche_cobrancas to authenticated;
comment on column public.creche_cobrancas.acerto_saida is 'Cobrança de acerto depois que o plano acabou: só os dias extras e as taxas que ficaram sem cobrar (sem mensalidade).';

-- ============================================================
-- 1. Mensalidade sugerida: conta também o fim do plano (igual a sugestaoDoMes em src/lib/gestao/creche.ts)
-- ============================================================
create or replace function public.creche_sugestao_mensal(p_plano uuid, p_mes date, p_valor numeric) returns numeric
language sql stable security definer set search_path = '' as $$
  select case when t.todos = 0 or t.restam = t.todos then p_valor
              else round(p_valor * t.restam / t.todos, 2) end
  from public.creche_planos pl
  join public.petshops s on s.id = pl.petshop_id,
  lateral (
    select count(*) filter (where d::date >= pl.inicio and (pl.fim is null or d::date <= pl.fim)
                              and not (pl.pausa_de is not null and d::date between pl.pausa_de and pl.pausa_ate)) as restam,
           count(*) as todos
    from generate_series(date_trunc('month', p_mes)::date, (date_trunc('month', p_mes) + interval '1 month - 1 day')::date, interval '1 day') d
    where extract(dow from d)::smallint = any (pl.dias) and public.creche_abre(s.horario, d::date)
      and not public.dia_fechado(pl.petshop_id, d::date)
  ) t
  where pl.id = p_plano
$$;

-- ============================================================
-- 2. A conta a receber do acerto da saída: "Acerto da saída · Pingo", sem a linha de mensalidade zerada.
--    Para as outras cobranças, igual à de 20261150.
-- ============================================================
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
  v_t int;
  v_taxas numeric;
  v_dos_dias numeric;
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
  if c.acerto_saida then
    v_desc := 'Acerto da saída · ' || coalesce(v_pet, 'pet');
    v_itens := '[]'::jsonb;
    if c.valor_mensal > 0 then
      v_itens := jsonb_build_array(jsonb_build_object('tipo', 'servico', 'nome', 'Mensalidade de ' || public.creche_nome_mes(c.mes), 'qtd', 1, 'valor', c.valor_mensal));
    end if;
  else
    v_desc := 'Mensalidade de ' || public.creche_nome_mes(c.mes) || ' · ' || coalesce(v_pet, 'pet');
    v_itens := jsonb_build_array(jsonb_build_object('tipo', 'servico', 'nome', 'Mensalidade de ' || public.creche_nome_mes(c.mes), 'qtd', 1, 'valor', c.valor_mensal));
  end if;
  -- valor_extras soma os dias extras e as taxas de busca fora do horário; cada um vira uma linha da conta
  v_t := jsonb_array_length(c.taxas);
  select coalesce(sum((x ->> 'valor')::numeric), 0) into v_taxas from jsonb_array_elements(c.taxas) x;
  v_dos_dias := c.valor_extras - v_taxas;
  if v_n > 0 and v_dos_dias > 0 then
    select string_agg(to_char((x ->> 'dia')::date, 'DD/MM'), ', ' order by x ->> 'dia') into v_dias from jsonb_array_elements(c.extras) x;
    v_unit := round(v_dos_dias / v_n, 2);
    if v_unit * v_n = v_dos_dias then
      v_itens := v_itens || jsonb_build_object('tipo', 'servico', 'nome', case when v_n = 1 then 'Dia extra (' else 'Dias extras (' end || v_dias || ')', 'qtd', v_n, 'valor', v_unit);
    else
      v_itens := v_itens || jsonb_build_object('tipo', 'servico', 'nome', 'Dias extras (' || v_dias || ')', 'qtd', 1, 'valor', v_dos_dias);
    end if;
  end if;
  if v_t > 0 and v_taxas > 0 then
    select string_agg(to_char((x ->> 'dia')::date, 'DD/MM'), ', ' order by x ->> 'dia') into v_dias from jsonb_array_elements(c.taxas) x;
    v_unit := round(v_taxas / v_t, 2);
    if v_unit * v_t = v_taxas then
      v_itens := v_itens || jsonb_build_object('tipo', 'extra', 'nome', 'Busca fora do horário (' || v_dias || ')', 'qtd', v_t, 'valor', v_unit);
    else
      v_itens := v_itens || jsonb_build_object('tipo', 'extra', 'nome', 'Busca fora do horário (' || v_dias || ')', 'qtd', 1, 'valor', v_taxas);
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

-- ============================================================
-- 3. Dias extras e taxas que ficaram sem cobrança quando o plano acabou
-- ============================================================
-- Os dias extras (em que o pet veio) e as taxas de busca mandadas para a mensalidade, até o fim do plano, que não estão em
-- nenhuma cobrança. Vão para a cobrança do mês da saída, se ela está aberta e não foi paga; senão, para a do mês seguinte
-- (aberta e não paga) ou para uma cobrança nova de acerto da saída nesse mês seguinte, só com eles. Devolve a cobrança.
create function public.creche_saida_extras(p_plano uuid) returns uuid
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
      extras = v_extras, taxas = v_taxas, valor_extras = v_extras_total + v_taxas_total, desconto = 0, total = v_extras_total + v_taxas_total,
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
revoke all on function public.creche_saida_extras(uuid) from public, anon;
grant execute on function public.creche_saida_extras(uuid) to authenticated;

-- ============================================================
-- 4. Anotação numa cobrança, mesmo já paga ("pagou o mês inteiro, saiu em 13/11: devolver R$ 320,00")
-- ============================================================
-- Só muda a observação (que não vai na mensagem ao tutor). Valor, vencimento e recebimento ficam como estão.
create function public.creche_cobranca_anotar(p_id uuid, p_obs text) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.creche_cobrancas;
begin
  select * into c from public.creche_cobrancas where id = p_id for update;
  if not found or not public.cuido_do_financeiro(c.petshop_id) then raise exception 'Cobrança não encontrada.'; end if;
  if not public.acesso_liberado(c.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  update public.creche_cobrancas set obs = nullif(left(btrim(coalesce(p_obs, '')), 300), '') where id = c.id;
end $$;
revoke all on function public.creche_cobranca_anotar(uuid, text) from public, anon;
grant execute on function public.creche_cobranca_anotar(uuid, text) to authenticated;
