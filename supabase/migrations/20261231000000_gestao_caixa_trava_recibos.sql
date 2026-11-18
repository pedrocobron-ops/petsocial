-- Rodada 9 (N5): caixa, trava de preço e recibos.
--
--  1. A trava de preço (`dinheiro.preco_travado` + `dinheiro.desconto_max_caixa`) vale também para creche e hotel: a diária
--     da reserva ou do check-in, o número de diárias do check-out, o valor cobrado na saída e as taxas combinadas na reserva.
--     Com a trava, quem não é o dono nem cuida do financeiro é recusado; sem a trava (ou quando é o dono ou o financeiro que
--     muda), fica anotado em Alterações em valores (tipos novos: `diaria`, `diarias`, `checkout`).
--     · estadia_diarias_da_conta, estadia_conta_minima, estadias_zzz_trava_de_preco (gatilho novo em estadias),
--       estadias_valores_trava_taxas (gatilho novo em estadias_valores), estadia_checkout_contexto.
--     · estadia_checkout (última: 20261181): mesma assinatura; antes dos passos, diz ao gatilho o que a conta tem a mais
--       (taxas, extras e produtos) e se as diárias saíram de um pacote do próprio pet.
--  2. Apagar um valor já recebido, com a trava, é igual a baixar o preço: recusado para quem só opera o caixa
--     (gatilho novo `travar_venda_apagada`). `travar_valor_da_venda` (última: 20261160): vale para toda entrada recebida
--     (antes, só as que tinham itens ou horário: a estadia sem itens ficava de fora).
--  3. Limite de fiado conferido no fim da gravação, pelo que FICA devendo (conta anotada inteira e recebida em parte na mesma
--     operação): gatilho `fiado_limite_no_fim` (constraint trigger adiado) no lugar do `fiado_limite_conferir` (antes de inserir).
--  4. Falta com a taxa numa gravação só: `agendamento_faltou`.
--  5. Devolução e troca aparecem em Alterações em valores (tipo `devolucao`, gatilho em `devolucoes`); devolução de um
--     valor recebido ligada à entrada (`lancamentos.devolucao_de`, função `entrada_devolver`).
--
-- Só acrescenta. O app que está no ar continua funcionando: as funções trocadas têm a mesma assinatura; pet shop sem a trava
-- não tem nada recusado a mais (só anotado); o limite de fiado recusa o mesmo de antes, menos a conta paga em parte que cabe.

-- ---------------------------------------------------------------------------------------------------------------------
-- Alterações em valores: tipos novos (junta com os que já existem, sem tirar nenhum)
-- ---------------------------------------------------------------------------------------------------------------------
do $$
declare
  v_def text;
  v_tipos text[];
begin
  select pg_get_constraintdef(c.oid) into v_def from pg_constraint c
    where c.conname = 'precos_alterados_tipo_check' and c.conrelid = 'public.precos_alterados'::regclass;
  select array_agg(distinct m[1]) into v_tipos from regexp_matches(coalesce(v_def, ''), '''([a-z_]+)''::text', 'g') m;
  v_tipos := (select array_agg(distinct t order by t) from unnest(coalesce(v_tipos, array[]::text[])
    || array['preco', 'desconto', 'sem_cobranca', 'servico_tirado', 'preco_agenda', 'pacote', 'atendimento_baixou', 'atendimento_reaberto',
             'atendimento_apagado', 'preco_produto', 'estoque_venda', 'estoque_saida', 'porte', 'diaria', 'diarias', 'checkout', 'devolucao']) t);
  alter table public.precos_alterados drop constraint if exists precos_alterados_tipo_check;
  execute format('alter table public.precos_alterados add constraint precos_alterados_tipo_check check (tipo = any (%L::text[]))', v_tipos);
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Creche e hotel dentro da trava de preço
-- ---------------------------------------------------------------------------------------------------------------------

-- "Hotel de Fred, 14/11" (o dia da entrada)
create or replace function public.estadia_rotulo(e public.estadias) returns text
language sql stable security definer set search_path = '' as $$
  select case when e.tipo = 'hotel' then 'Hotel' else 'Creche' end || ' de ' || coalesce((select p.nome from public.pets p where p.id = e.pet_id), 'pet')
    || ', ' || to_char(e.entrada at time zone coalesce((select x.fuso from public.petshops x where x.id = e.petshop_id), 'America/Sao_Paulo'), 'DD/MM')
$$;
revoke execute on function public.estadia_rotulo(public.estadias) from public, anon, authenticated;

-- Diárias pelas datas: hotel conta as noites; creche, os dias em que o pet esteve aqui. Sempre pelo menos 1 (como `contarDiarias`).
create or replace function public.estadia_diarias_pelas_datas(e public.estadias, p_saida timestamptz) returns integer
language sql stable security definer set search_path = '' as $$
  select greatest(1, case when e.tipo = 'hotel' then d.dias else d.dias + 1 end)
  from (select (coalesce(p_saida, e.saida, now()) at time zone f.fuso)::date - (e.entrada at time zone f.fuso)::date as dias
        from (select coalesce((select x.fuso from public.petshops x where x.id = e.petshop_id), 'America/Sao_Paulo') as fuso) f) d
$$;
revoke execute on function public.estadia_diarias_pelas_datas(public.estadias, timestamptz) from public, anon, authenticated;

-- O total das diárias de `p_n` diárias, pelas regras do pet shop: creche = n × diária; hotel = noite a noite (temporada,
-- feriado e desconto do segundo pet, a mesma regra de `hotel_previsto`). As noites terminam no dia da saída; noites a mais do
-- que as datas mostram contam para trás (como `diasDasNoites`). Sem diária combinada vale a da lista.
create or replace function public.estadia_diarias_da_conta(e public.estadias, p_n integer, p_saida timestamptz) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fuso text; v_base numeric; v_ini date; v_pelas int; v_n int := least(greatest(coalesce(p_n, 1), 0), 400);
  v_cliente uuid; v_hoje date; v_dia date; v_seg boolean; v_total numeric := 0; x record;
begin
  v_base := coalesce(e.valor_diaria, public.diaria_sugerida(e.petshop_id, e.tipo, (select p.porte from public.pets p where p.id = e.pet_id)));
  if v_base is null then return 0; end if;
  if e.tipo <> 'hotel' then return round(v_n * v_base, 2); end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = e.petshop_id;
  v_hoje := (now() at time zone v_fuso)::date;
  v_ini := (e.entrada at time zone v_fuso)::date;
  v_pelas := greatest(1, (coalesce(p_saida, e.saida, now()) at time zone v_fuso)::date - v_ini);
  if v_n > v_pelas then v_ini := v_ini - (v_n - v_pelas); end if;
  select p.cliente_id into v_cliente from public.pets p where p.id = e.pet_id;
  for i in 0 .. v_n - 1 loop
    v_dia := v_ini + i;
    v_seg := v_cliente is not null and exists (
      select 1 from public.estadias o join public.pets q on q.id = o.pet_id
      where o.petshop_id = e.petshop_id and o.tipo = 'hotel' and o.status <> 'cancelada' and o.id <> e.id and o.pet_id <> e.pet_id
        and q.cliente_id = v_cliente
        and (coalesce(o.valor_diaria, 0) > v_base
             or (coalesce(o.valor_diaria, 0) = v_base and (o.criado_em, o.id) < (e.criado_em, e.id)))
        and case
          when o.status = 'encerrada' then (
            select v_dia >= c.ini - greatest(0, c.n - c.pelas_datas) and v_dia < c.ini - greatest(0, c.n - c.pelas_datas) + c.n
            from (select (o.entrada at time zone v_fuso)::date as ini,
                    greatest(1, (coalesce(o.saida, o.entrada) at time zone v_fuso)::date - (o.entrada at time zone v_fuso)::date) as pelas_datas,
                    least(400, greatest(0, coalesce(o.diarias_cobradas, greatest(1, (coalesce(o.saida, o.entrada) at time zone v_fuso)::date - (o.entrada at time zone v_fuso)::date)))) as n) c)
          when v_dia < (o.entrada at time zone v_fuso)::date then false
          when o.saida_prevista is null then o.status = 'em_casa' or v_dia = (o.entrada at time zone v_fuso)::date
          else v_dia < (o.saida_prevista at time zone v_fuso)::date or v_dia = (o.entrada at time zone v_fuso)::date
               or (o.status = 'em_casa' and v_dia <= v_hoje)
        end);
    select n.valor into x from public.hotel_noite(e.petshop_id, v_dia, v_base, v_seg) n;
    v_total := v_total + coalesce(x.valor, 0);
  end loop;
  return round(v_total, 2);
end $$;
revoke execute on function public.estadia_diarias_da_conta(public.estadias, integer, timestamptz) from public, anon, authenticated;

-- O mínimo que a conta da estadia dá sem ninguém mexer: diárias pelas regras, menos o máximo que a promoção da reserva pode
-- dar, mais as taxas combinadas na reserva. (Extras, produtos e taxa de busca fora do horário só aumentam a conta.)
create or replace function public.estadia_conta_minima(e public.estadias, p_n integer, p_saida timestamptz, p_pacote boolean default false) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare
  v_diarias numeric := 0; v_promo numeric := 0; v_taxas numeric := 0; v_n int := greatest(coalesce(p_n, 1), 1);
begin
  if not coalesce(p_pacote, false) then
    v_diarias := public.estadia_diarias_da_conta(e, v_n, p_saida);
    if e.promo is not null and coalesce(e.promo ->> 'tirada', '') <> 'true' and jsonb_typeof(e.promo -> 'valor') = 'number' then
      v_promo := case when e.promo ->> 'tipo' = 'pct' then round(v_diarias * least(100, greatest(0, (e.promo ->> 'valor')::numeric)) / 100, 2)
                      else least(v_diarias, greatest(0, (e.promo ->> 'valor')::numeric) * v_n) end;
    end if;
  end if;
  select coalesce(sum(round((case when t ->> 'por' = 'noite' then v_n else 1 end) * (t ->> 'valor')::numeric, 2)), 0) into v_taxas
    from public.estadias_valores v, jsonb_array_elements(v.taxas) t
    where v.estadia_id = e.id and jsonb_typeof(v.taxas) = 'array' and jsonb_typeof(t -> 'nome') = 'string' and jsonb_typeof(t -> 'valor') = 'number';
  return round(greatest(v_diarias - v_promo, 0) + v_taxas, 2);
end $$;
revoke execute on function public.estadia_conta_minima(public.estadias, integer, timestamptz, boolean) from public, anon, authenticated;

-- A trava em estadias. Roda depois dos outros gatilhos (o dia de experiência e quem não mexe com dinheiro já foram acertados).
-- Só olha quem tem área de dinheiro: para os outros, `estadias_guardar_valores` já põe a diária da lista e deixa o valor em branco.
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
    if new.valor_cobrado < v_conta - 0.005 then
      select s.opcoes into v_op from public.petshops s where s.id = new.petshop_id;
      v_trava := coalesce(v_op -> 'dinheiro.preco_travado' = 'true'::jsonb, false);
      v_fin := public.cuido_do_financeiro(new.petshop_id);
      if v_trava and not v_fin then
        v_max := case when jsonb_typeof(v_op -> 'dinheiro.desconto_max_caixa') = 'number' then least(100, greatest(0, (v_op ->> 'dinheiro.desconto_max_caixa')::numeric)) else 0 end;
        -- o limite arredonda para baixo, em centavos (como na venda)
        v_pode := floor(v_conta * v_max + 0.000001) / 100;
        if v_conta - new.valor_cobrado > v_pode + 0.005 then
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
drop trigger if exists estadias_zzz_trava_de_preco on public.estadias;
create trigger estadias_zzz_trava_de_preco after insert or update on public.estadias for each row execute function public.estadias_zzz_trava_de_preco();

-- Taxas combinadas na reserva: tirar ou baixar depois é baixar a conta.
create or replace function public.estadias_valores_trava_taxas() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_antes numeric; v_depois numeric; e public.estadias;
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 or new.taxas is not distinct from old.taxas then return null; end if;
  select coalesce(sum((t ->> 'valor')::numeric), 0) into v_antes from jsonb_array_elements(case when jsonb_typeof(old.taxas) = 'array' then old.taxas else '[]'::jsonb end) t
    where jsonb_typeof(t -> 'valor') = 'number';
  select coalesce(sum((t ->> 'valor')::numeric), 0) into v_depois from jsonb_array_elements(case when jsonb_typeof(new.taxas) = 'array' then new.taxas else '[]'::jsonb end) t
    where jsonb_typeof(t -> 'valor') = 'number';
  if v_depois >= v_antes - 0.005 then return null; end if;
  select * into e from public.estadias x where x.id = new.estadia_id;
  if not found or e.status in ('encerrada', 'cancelada') then return null; end if;
  perform public.conferir_valor_baixou(new.petshop_id, 'checkout', 'Taxas da reserva: ' || public.estadia_rotulo(e), v_antes, v_depois,
    'Com o preço travado, só o dono ou quem vê o financeiro tira uma taxa combinada na reserva.');
  return null;
end $$;
revoke execute on function public.estadias_valores_trava_taxas() from public, anon, authenticated;
drop trigger if exists estadias_valores_trava_taxas on public.estadias_valores;
create trigger estadias_valores_trava_taxas after update of taxas on public.estadias_valores for each row execute function public.estadias_valores_trava_taxas();

-- O que o check-out conta ao gatilho: quanto a conta montada na tela soma (com taxas, extras e produtos) e se as diárias
-- saíram de um pacote do próprio pet (com usos para todas as diárias). O passo do pacote só passa se o pacote tiver saldo.
create or replace function public.estadia_checkout_contexto(p_petshop uuid, p_estadia uuid, p_passos jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_pet uuid; v_n int; v_pacote boolean := false; v_soma numeric := 0;
begin
  if (select auth.uid()) is null or p_petshop is null or not (p_petshop in (select public.meus_petshops())) then return null; end if;
  if jsonb_typeof(p_passos) is distinct from 'array' then return null; end if;
  select e.pet_id into v_pet from public.estadias e where e.id = p_estadia and e.petshop_id = p_petshop;
  if v_pet is null then return null; end if;
  begin
    select (x ->> 'diarias')::int into v_n from jsonb_array_elements(p_passos) x where x ->> 't' in ('estadia_fechar', 'estadia_acertar') limit 1;
    select exists (
      select 1 from jsonb_array_elements(p_passos) x
      join public.pacotes_clientes p on p.id = (x ->> 'id')::uuid and p.petshop_id = p_petshop
      where x ->> 't' = 'pacote' and p.pet_id = v_pet and coalesce((x ->> 'n')::int, 1) >= coalesce(v_n, 1)) into v_pacote;
    select coalesce(max((x -> 'campos' -> 'conta' ->> 'soma')::numeric), 0) into v_soma
      from jsonb_array_elements(p_passos) x
      where x ->> 't' = 'estadia_valores' and jsonb_typeof(x -> 'campos' -> 'conta' -> 'soma') = 'number';
  exception when others then
    v_pacote := false; v_soma := 0;
  end;
  return jsonb_build_object('estadia', p_estadia, 'pacote', v_pacote, 'soma', greatest(coalesce(v_soma, 0), 0));
end $$;
revoke execute on function public.estadia_checkout_contexto(uuid, uuid, jsonb) from public, anon;
grant execute on function public.estadia_checkout_contexto(uuid, uuid, jsonb) to authenticated;

-- A mesma de 20261181, com o contexto para a trava de preço (o gatilho de estadias confere na hora de encerrar ou acertar).
create or replace function public.estadia_checkout(p_petshop uuid, p_estadia uuid, p_chave text, p_passos jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_res jsonb;
begin
  perform public.lote_conferir_alvo(p_passos, array['estadia_fechar', 'estadia_acertar'], 'id', p_estadia);
  perform public.lote_conferir_alvo(p_passos, array['estadia_valores'], 'estadia', p_estadia);
  perform set_config('maestro.estadia_conta', coalesce(public.estadia_checkout_contexto(p_petshop, p_estadia, p_passos)::text, ''), true);
  v_res := public.operacao_tudo_ou_nada(p_petshop, p_chave, p_passos,
    array['estadia_fechar', 'estadia_acertar', 'pacote', 'apagar_aberto', 'credito', 'lancamento', 'receber', 'estoque', 'estadia_valores']);
  perform set_config('maestro.estadia_conta', '', true);
  perform public.estadia_checkout_conferir(p_petshop, p_estadia, p_passos, v_res);
  return v_res;
end $$;
revoke execute on function public.estadia_checkout(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.estadia_checkout(uuid, uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Apagar ou baixar um valor já recebido, com a trava
-- ---------------------------------------------------------------------------------------------------------------------

-- A mesma de 20261160, valendo para toda entrada recebida (a estadia paga sem itens ficava de fora).
create or replace function public.travar_valor_da_venda() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then return new; end if;
  if coalesce(current_setting('maestro.recebimento', true), '') = '1' or coalesce(current_setting('maestro.creche', true), '') = '1' then return new; end if;
  if not old.pago or old.tipo <> 'entrada' or old.movimento is not null or old.conta_id is not null then return new; end if;
  if new.valor >= old.valor - 0.005 then return new; end if;
  if public.preco_travado(old.petshop_id) and not public.cuido_do_financeiro(old.petshop_id) then
    raise exception 'Com o preço travado, só o dono ou quem vê o financeiro baixa o valor de uma venda já recebida.';
  end if;
  return new;
end $$;
revoke execute on function public.travar_valor_da_venda() from public, anon, authenticated;

-- Apagar é baixar para zero: com a trava, quem só opera o caixa não apaga uma entrada já recebida (nem a do próprio caixa aberto).
-- A parte de uma conta a receber (desfazer um recebimento) continua pela regra de sempre: a dívida volta a ficar aberta.
create or replace function public.travar_venda_apagada() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then return old; end if;
  if coalesce(current_setting('maestro.recebimento', true), '') = '1' or coalesce(current_setting('maestro.creche', true), '') = '1' then return old; end if;
  if not old.pago or old.tipo <> 'entrada' or old.movimento is not null or old.conta_id is not null then return old; end if;
  -- o pet shop inteiro sendo apagado (ou a conta do dono) não passa por aqui com login de equipe
  if not exists (select 1 from public.petshops p where p.id = old.petshop_id) then return old; end if;
  if public.preco_travado(old.petshop_id) and not public.cuido_do_financeiro(old.petshop_id) then
    raise exception 'Com o preço travado, só o dono ou quem vê o financeiro apaga um valor já recebido. Para devolver um produto, use Troca ou devolução.'
      using hint = 'maestro:preco_travado';
  end if;
  return old;
end $$;
revoke execute on function public.travar_venda_apagada() from public, anon, authenticated;
drop trigger if exists travar_venda_apagada on public.lancamentos;
create trigger travar_venda_apagada before delete on public.lancamentos for each row execute function public.travar_venda_apagada();

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Limite de fiado pelo que fica devendo
-- ---------------------------------------------------------------------------------------------------------------------
-- A conta a receber nova é conferida no fim da gravação: se uma parte foi paga na mesma operação (conta do atendimento com
-- "pagou só isso"), conta só o que ficou. As mesmas exceções de antes (mensalidade da creche, dívida trazida, movimento).

create or replace function public.fiado_limite_no_fim() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  l public.lancamentos; v_lim numeric; v_deve numeric; v_outras numeric; v_lib uuid; v_nome text;
begin
  if new.tipo <> 'entrada' or new.pago or new.cliente_id is null or new.movimento is not null or new.conta_id is not null
     or new.devido_desde is not null or new.categoria = 'Creche: mensalidade' or (select auth.uid()) is null then
    return null;
  end if;
  -- como a conta ficou no fim: paga inteira ou apagada na mesma operação, nada a conferir
  select * into l from public.lancamentos x where x.id = new.id;
  if not found or l.pago or l.tipo <> 'entrada' or l.cliente_id is null or l.valor <= 0 then return null; end if;
  v_lim := public.fiado_limite_de(l.petshop_id, l.cliente_id);
  if v_lim is null then return null; end if;
  v_deve := public.fiado_deve(l.petshop_id, l.cliente_id);
  -- o que o cliente já devia, sem esta conta (ela pode estar ou não na soma: sinal e mensalidade que ainda vão vencer ficam fora)
  v_outras := v_deve - case when l.movimento is null and not public.conta_fora_do_limite(l.categoria, l.descricao, l.vencimento, public.hoje_do_petshop(l.petshop_id))
                            then l.valor else 0 end;
  if v_outras + l.valor <= v_lim + 0.005 then return null; end if;
  update public.fiado_liberacoes f set usado_em = now(), lancamento_id = l.id
    where f.id = (select g.id from public.fiado_liberacoes g
                  where g.petshop_id = l.petshop_id and g.cliente_id = l.cliente_id and g.usado_em is null
                    and g.criado_em > now() - interval '30 minutes' and g.valor >= l.valor - 0.005
                  order by g.criado_em desc limit 1 for update skip locked)
    returning f.id into v_lib;
  if v_lib is not null then return null; end if;
  select split_part(btrim(c.nome), ' ', 1) into v_nome from public.clientes c where c.id = l.cliente_id;
  v_nome := coalesce(nullif(v_nome, ''), 'O cliente');
  if v_outras <= 0.005 then
    raise exception '% ficaria devendo %: passa do limite de %.', v_nome, public.em_reais(l.valor), public.em_reais(v_lim)
      using hint = 'maestro:limite_fiado';
  end if;
  raise exception '% já deve %; com esta conta passa do limite de %.', v_nome, public.em_reais(v_outras), public.em_reais(v_lim)
    using hint = 'maestro:limite_fiado';
end $$;
revoke execute on function public.fiado_limite_no_fim() from public, anon, authenticated;
drop trigger if exists fiado_limite_conferir on public.lancamentos;
drop trigger if exists fiado_limite_no_fim on public.lancamentos;
create constraint trigger fiado_limite_no_fim after insert on public.lancamentos deferrable initially deferred
  for each row execute function public.fiado_limite_no_fim();

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Falta com a taxa, numa gravação só
-- ---------------------------------------------------------------------------------------------------------------------

-- A taxa de falta das Opções de cobrança (0 = desligada). Só responde para quem mexe com dinheiro.
create or replace function public.taxa_de_falta(p uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select case when (select public.tenho_area(p, array['caixa', 'financeiro', 'relatorios']))
                   and jsonb_typeof(s.opcoes -> 'dinheiro.taxa_falta') = 'number' and (s.opcoes ->> 'dinheiro.taxa_falta')::numeric > 0
              then round(least((s.opcoes ->> 'dinheiro.taxa_falta')::numeric, 99999.99), 2) else 0 end
  from public.petshops s where s.id = p
$$;
revoke execute on function public.taxa_de_falta(uuid) from public, anon;
grant execute on function public.taxa_de_falta(uuid) to authenticated;

-- Marca a falta e, se pedido, anota a taxa de falta para o tutor (a receber em 7 dias), tudo junto: ou as duas coisas, ou nada.
-- Roda com o login de quem chamou (valem as regras de sempre: quem muda a agenda, quem anota conta, limite de fiado).
-- Devolve {ok, status_antes, taxa, lancamento_id}. A mesma chave de novo não anota a taxa duas vezes.
create or replace function public.agendamento_faltou(p_agendamento uuid, p_taxa boolean default false, p_chave text default null) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_petshop uuid; v_antes text; v_pet uuid; v_inicio timestamptz; v_cliente uuid; v_pet_nome text; v_taxa numeric := 0; v_id uuid;
  v_fuso text; v_hoje date; v_chave text := nullif(btrim(coalesce(p_chave, '')), '');
begin
  select a.petshop_id, a.status::text, a.pet_id, a.inicio into v_petshop, v_antes, v_pet, v_inicio from public.agendamentos a where a.id = p_agendamento;
  if v_petshop is null then raise exception 'Este horário não foi encontrado. Atualize a tela.'; end if;
  if v_antes = 'concluido' then raise exception 'Este atendimento já foi concluído: não dá para marcar falta.'; end if;
  if v_antes <> 'faltou' then
    update public.agendamentos set status = 'faltou' where id = p_agendamento and petshop_id = v_petshop;
    if not found then raise exception 'Não deu para marcar a falta. Atualize a tela.'; end if;
  end if;
  if coalesce(p_taxa, false) then
    v_taxa := coalesce(public.taxa_de_falta(v_petshop), 0);
    select p.cliente_id, p.nome into v_cliente, v_pet_nome from public.pets p where p.id = v_pet;
    if v_taxa > 0 and v_cliente is not null then
      if v_chave is not null and (char_length(v_chave) < 8 or char_length(v_chave) > 120) then raise exception 'Chave da operação inválida.'; end if;
      select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = v_petshop;
      v_hoje := (now() at time zone coalesce(v_fuso, 'America/Sao_Paulo'))::date;
      insert into public.lancamentos (petshop_id, tipo, valor, forma, categoria, descricao, data, vencimento, pago, cliente_id, origem, criado_por, chave)
      values (v_petshop, 'entrada', v_taxa, null, 'Outros',
        left('Taxa de falta ' || to_char(v_inicio at time zone coalesce(v_fuso, 'America/Sao_Paulo'), 'DD/MM') || coalesce(' (' || v_pet_nome || ')', ''), 120),
        v_hoje + 7, v_hoje + 7, false, v_cliente, 'tela', (select auth.uid()), v_chave)
      on conflict (petshop_id, chave) do nothing
      returning id into v_id;
      if v_id is null and v_chave is not null then
        select x.id into v_id from public.lancamentos x where x.petshop_id = v_petshop and x.chave = v_chave;
      end if;
    else
      v_taxa := 0;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'status_antes', v_antes, 'taxa', case when v_id is null then 0 else v_taxa end, 'lancamento_id', v_id);
end $$;
revoke execute on function public.agendamento_faltou(uuid, boolean, text) from public, anon;
grant execute on function public.agendamento_faltou(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Devolução: aparece em Alterações em valores e fica ligada à entrada
-- ---------------------------------------------------------------------------------------------------------------------

-- Troca e devolução de produto (função venda_devolver): uma linha em Alterações, com quem fez.
create or replace function public.devolucao_anotar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_item text;
begin
  if (select auth.uid()) is null then return null; end if;
  begin
    select left(string_agg(replace(trim(to_char((i ->> 'qtd')::numeric, 'FM999999990.###'), '.'), '.', ',') || ' ' || (i ->> 'nome'), ' + '), 150)
      into v_item from jsonb_array_elements(new.itens) i;
    v_item := case new.modo when 'troca' then 'Troca: ' when 'credito' then 'Devolução para crédito: ' else 'Devolução em dinheiro: ' end || coalesce(v_item, 'produto');
    insert into public.precos_alterados (petshop_id, lancamento_id, tipo, item, de, para, quem, quem_nome)
      values (new.petshop_id, new.venda_id, 'devolucao', left(v_item, 200), new.valor,
        case when new.modo = 'troca' then coalesce(new.valor_novos, 0) else 0 end, (select auth.uid()), public.nome_na_equipe(new.petshop_id));
  exception when others then
    -- a anotação é um apoio: nunca derruba a devolução
    raise warning 'devolucao_anotar: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.devolucao_anotar() from public, anon, authenticated;
drop trigger if exists devolucao_anotar on public.devolucoes;
create trigger devolucao_anotar after insert on public.devolucoes for each row execute function public.devolucao_anotar();

-- Devolução de um valor recebido (serviço, estadia, qualquer entrada): a saída fica ligada à entrada que ela devolve.
alter table public.lancamentos add column if not exists devolucao_de uuid references public.lancamentos (id) on delete set null;
create index if not exists lancamentos_devolucao_de_idx on public.lancamentos (devolucao_de) where devolucao_de is not null;

-- Quanto já foi devolvido de uma entrada (pelas saídas ligadas a ela).
create or replace function public.entrada_devolvido(p_entrada uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(d.valor), 0) from public.lancamentos d where d.devolucao_de = p_entrada and d.tipo = 'saida' and d.pago
$$;
revoke execute on function public.entrada_devolvido(uuid) from public, anon, authenticated;

-- Devolve ao cliente o valor (inteiro ou uma parte) de uma entrada já recebida: lança a saída "Devolução" de hoje, na forma
-- escolhida, ligada à entrada; nunca passa do que foi recebido menos o que já voltou. Anota em Alterações em valores.
-- Quem só opera o caixa precisa do caixa aberto (o dinheiro sai da gaveta dele). A mesma chave de novo devolve o que já fez.
create or replace function public.entrada_devolver(p_petshop uuid, p_entrada uuid, p_valor numeric, p_forma text, p_chave text, p_motivo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  l public.lancamentos; v_ja numeric; v_valor numeric := round(p_valor, 2); v_caixa uuid; v_fin boolean; v_fuso text; v_hoje date; v_id uuid; v_desc text;
begin
  if v_uid is null or p_petshop is null or not (p_petshop in (select public.meus_petshops())) then
    raise exception 'Sem acesso a este pet shop.' using errcode = '42501';
  end if;
  if not public.tenho_area(p_petshop, array['caixa', 'financeiro']) or not public.acesso_liberado(p_petshop) then
    raise exception 'Devolver um valor é com quem mexe com dinheiro (Caixa ou Financeiro).' using errcode = '42501';
  end if;
  if p_chave is null or char_length(p_chave) not between 8 and 100 then raise exception 'Operação sem chave. Atualize a tela e tente de novo.'; end if;
  perform pg_advisory_xact_lock(hashtextextended('devolucao-venda:' || coalesce(p_entrada::text, ''), 0));
  select x.id into v_id from public.lancamentos x where x.petshop_id = p_petshop and x.chave = p_chave || ':devolver';
  if v_id is not null then return jsonb_build_object('ok', true, 'repetido', true, 'saida_id', v_id); end if;
  select * into l from public.lancamentos x where x.id = p_entrada and x.petshop_id = p_petshop;
  if not found or l.tipo <> 'entrada' or l.movimento is not null or not l.pago then raise exception 'Este valor não foi encontrado entre os recebidos. Atualize a tela.'; end if;
  if p_forma is null or p_forma not in ('dinheiro', 'pix', 'debito', 'credito', 'outro') then raise exception 'Escolha como o dinheiro volta para o cliente.'; end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Escreva quanto volta para o cliente.'; end if;
  v_ja := public.entrada_devolvido(l.id)
    + coalesce((select sum(d.valor) from public.devolucoes d where d.venda_id = l.id and d.petshop_id = p_petshop and coalesce(d.saida_id, d.credito_id) is not null), 0);
  if v_valor > l.valor - v_ja + 0.005 then
    raise exception 'Desta entrada de % %. Dá para devolver até %.', public.em_reais(l.valor),
      case when v_ja > 0 then 'já voltaram ' || public.em_reais(v_ja) else 'nada voltou ainda' end, public.em_reais(greatest(l.valor - v_ja, 0))
      using hint = 'maestro:devolucao_passou';
  end if;
  v_fin := public.cuido_do_financeiro(p_petshop);
  select c.id into v_caixa from public.caixas c where c.petshop_id = p_petshop and c.fechado_em is null limit 1;
  if v_caixa is null and not v_fin then
    raise exception 'O caixa está fechado. Abra o caixa para mexer no dinheiro.' using hint = 'maestro:caixa_fechado';
  end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p_petshop;
  v_hoje := (now() at time zone v_fuso)::date;
  v_desc := left('Devolução: ' || coalesce(nullif(btrim(l.descricao), ''), l.categoria) || ' (recebido em ' || to_char(l.data, 'DD/MM') || ')'
    || coalesce(' · ' || nullif(btrim(p_motivo), ''), ''), 200);
  insert into public.lancamentos (petshop_id, tipo, valor, forma, categoria, descricao, data, pago, caixa_id, cliente_id, origem, criado_por, chave, devolucao_de)
  values (p_petshop, 'saida', v_valor, p_forma, 'Devolução', v_desc, v_hoje, true, v_caixa, l.cliente_id, 'tela', v_uid, p_chave || ':devolver', l.id)
  returning id into v_id;
  insert into public.precos_alterados (petshop_id, lancamento_id, tipo, item, de, para, quem, quem_nome)
    values (p_petshop, l.id, 'devolucao', left('Devolução em ' || case p_forma when 'dinheiro' then 'dinheiro' when 'pix' then 'Pix' when 'debito' then 'débito' when 'credito' then 'crédito' else 'outra forma' end
      || ': ' || coalesce(nullif(btrim(l.descricao), ''), l.categoria), 200), l.valor, l.valor - v_ja - v_valor, v_uid, public.nome_na_equipe(p_petshop));
  return jsonb_build_object('ok', true, 'saida_id', v_id, 'valor', v_valor, 'no_caixa', v_caixa is not null, 'ja_devolvido', v_ja + v_valor);
end $$;
revoke execute on function public.entrada_devolver(uuid, uuid, numeric, text, text, text) from public, anon;
grant execute on function public.entrada_devolver(uuid, uuid, numeric, text, text, text) to authenticated;

-- Quanto já voltou de cada entrada (para a tela marcar "devolvido" e saber quanto ainda dá para devolver).
create or replace function public.entradas_devolvidas(p_petshop uuid, p_ids uuid[]) returns table (entrada_id uuid, devolvido numeric)
language sql stable security definer set search_path = '' as $$
  select x.id, sum(x.v) from (
    select d.devolucao_de as id, d.valor as v from public.lancamentos d
      where d.petshop_id = p_petshop and d.devolucao_de = any (p_ids) and d.tipo = 'saida' and d.pago
    union all
    select d.venda_id, d.valor from public.devolucoes d
      where d.petshop_id = p_petshop and d.venda_id = any (p_ids) and coalesce(d.saida_id, d.credito_id) is not null
  ) x
  where (select public.tenho_area(p_petshop, array['caixa', 'financeiro', 'relatorios'])) and cardinality(p_ids) <= 2000
  group by x.id
$$;
revoke execute on function public.entradas_devolvidas(uuid, uuid[]) from public, anon;
grant execute on function public.entradas_devolvidas(uuid, uuid[]) to authenticated;

-- Troca: quanto de cada lançamento é só o produto trocado (não é dinheiro). O Caixa tira essa parte de "Entrou hoje".
create or replace function public.trocas_do_caixa(p_petshop uuid, p_ids uuid[]) returns table (lancamento_id uuid, trocado numeric)
language sql stable security definer set search_path = '' as $$
  select x.id, sum(x.v) from (
    select d.entrada_id as id, least(d.valor, coalesce(d.valor_novos, 0)) as v from public.devolucoes d
      where d.petshop_id = p_petshop and d.modo = 'troca' and d.entrada_id = any (p_ids)
    union all
    select d.saida_id, least(d.valor, coalesce(d.valor_novos, 0)) from public.devolucoes d
      where d.petshop_id = p_petshop and d.modo = 'troca' and d.saida_id = any (p_ids)
  ) x
  where (select public.tenho_area(p_petshop, array['caixa', 'financeiro', 'relatorios'])) and cardinality(p_ids) <= 2000 and x.id is not null
  group by x.id
$$;
revoke execute on function public.trocas_do_caixa(uuid, uuid[]) from public, anon;
grant execute on function public.trocas_do_caixa(uuid, uuid[]) to authenticated;
