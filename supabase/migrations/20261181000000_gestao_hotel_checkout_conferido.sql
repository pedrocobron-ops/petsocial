-- Hotel e creche: o check-out confere com o que já foi pago, e o check-in feito por engano pode ser desfeito.
--
-- 1. O check-out (função `estadia_checkout`, migração 20261178) passa a conferir, no fim da mesma transação, se o que entra
--    agora (a conta da estadia, paga ou a receber) mais o crédito do tutor usado mais o sinal que a reserva já tem passam do
--    total da estadia que a própria operação grava. Antes, se a folha abria e a pessoa tocava em "Receber" antes do sinal
--    chegar do banco, o total ia inteiro para o caixa e o sinal era cobrado duas vezes. Agora o banco recusa e nada é gravado.
--    O sinal é lido do banco depois de todos os passos (o gatilho do sinal já acertou: a conta dele recebida junto vira
--    "pago"; a conta dele apagada porque o pet saiu antes vale só o que já tinha entrado).
--    Pagar a mais de propósito continua possível pelos caminhos que já existem: "Pago a mais" (devolver, deixar de crédito ou
--    não devolver) não lança entrada, e um acréscimo digitado aumenta o total gravado junto com o valor recebido.
-- 2. Check-in pela reserva: o banco guarda a data reservada (`estadias_checkin_feito`) e a função `estadia_desfazer_checkin`
--    volta a estadia para "reservada", na data de antes, no mesmo dia do check-in. Na casa ainda não houve check-out, então
--    não há cobrança para desfazer (o sinal fica como estava).
--
-- Só acrescenta (uma tabela, um gatilho e funções; `estadia_checkout` e `link_hotel_opcoes` mantêm a assinatura). O código no ar continua igual:
-- ele já manda o total da estadia como "valor da estadia + sinal descontado", então a conferência só recusa o caso do erro.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Check-out conferido com o que já foi pago
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.estadia_checkout_conferir(p_petshop uuid, p_estadia uuid, p_passos jsonb, p_res jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_total numeric := 0;
  v_agora numeric := 0;
  v_credito numeric := 0;
  v_sinal numeric := 0;
  v_ids uuid[];
begin
  if (select auth.uid()) is null or p_petshop is null or not (p_petshop in (select public.meus_petshops())) then
    raise exception 'Sem acesso a este pet shop.' using errcode = '42501';
  end if;
  -- a mesma chave de novo devolve o que a primeira vez fez (que já foi conferida)
  if coalesce((p_res ->> 'repetido')::boolean, false) then return; end if;

  -- o total da estadia que esta operação grava (encerrar ou acertar)
  select coalesce(case x ->> 't' when 'estadia_fechar' then (x ->> 'valor_cobrado')::numeric else (x ->> 'valor')::numeric end, 0)
    into v_total
    from jsonb_array_elements(p_passos) x where x ->> 't' in ('estadia_fechar', 'estadia_acertar') limit 1;
  v_total := coalesce(v_total, 0);

  -- o que entrou agora pela estadia: as entradas lançadas nesta operação (as contas antigas recebidas junto não são lançamentos novos)
  select array_agg((p ->> 'id')::uuid) into v_ids
    from jsonb_array_elements(coalesce(p_res -> 'passos', '[]'::jsonb)) p where p ->> 't' = 'lancamento' and p ? 'id';
  if v_ids is not null then
    select coalesce(sum(l.valor), 0) into v_agora from public.lancamentos l
      where l.petshop_id = p_petshop and l.tipo = 'entrada' and l.id = any (v_ids);
  end if;
  -- o crédito do tutor usado nesta conta (movimento negativo); o que fica de crédito (positivo) não é recebimento
  select coalesce(sum(-(x ->> 'valor')::numeric), 0) into v_credito
    from jsonb_array_elements(p_passos) x where x ->> 't' = 'credito' and (x ->> 'valor')::numeric < 0;

  if v_agora + v_credito <= 0.004 then return; end if;

  -- o sinal da reserva como ficou depois dos passos: pago (inteiro, ou o que entrou dele) ou a receber à parte (o cheio)
  select coalesce(case when v.sinal_estado in ('pago', 'a_receber') then v.sinal end, 0) into v_sinal
    from public.estadias_valores v where v.estadia_id = p_estadia and v.petshop_id = p_petshop;
  v_sinal := coalesce(v_sinal, 0);

  if round(v_agora + v_credito + v_sinal, 2) > round(v_total, 2) + 0.009 then
    raise exception '%', case when v_sinal > 0
        then format('Esta estadia já tem %s de sinal. Com o total de %s, falta receber %s, e não %s. Nada foi gravado: a conta foi lida de novo.',
          public.em_reais(v_sinal), public.em_reais(v_total), public.em_reais(greatest(0, round(v_total - v_sinal, 2))), public.em_reais(round(v_agora + v_credito, 2)))
        else format('O valor recebido (%s) passa do total da estadia (%s). Nada foi gravado.', public.em_reais(round(v_agora + v_credito, 2)), public.em_reais(v_total)) end
      using hint = 'maestro:passa_do_devido';
  end if;
end $$;
revoke execute on function public.estadia_checkout_conferir(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.estadia_checkout_conferir(uuid, uuid, jsonb, jsonb) to authenticated;

-- A mesma de 20261178, com a conferência no fim (na mesma transação: se recusar, nada do que veio antes fica gravado).
create or replace function public.estadia_checkout(p_petshop uuid, p_estadia uuid, p_chave text, p_passos jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_res jsonb;
begin
  perform public.lote_conferir_alvo(p_passos, array['estadia_fechar', 'estadia_acertar'], 'id', p_estadia);
  perform public.lote_conferir_alvo(p_passos, array['estadia_valores'], 'estadia', p_estadia);
  v_res := public.operacao_tudo_ou_nada(p_petshop, p_chave, p_passos,
    array['estadia_fechar', 'estadia_acertar', 'pacote', 'apagar_aberto', 'credito', 'lancamento', 'receber', 'estoque', 'estadia_valores']);
  perform public.estadia_checkout_conferir(p_petshop, p_estadia, p_passos, v_res);
  return v_res;
end $$;
revoke execute on function public.estadia_checkout(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.estadia_checkout(uuid, uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Desfazer o check-in (no mesmo dia)
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.estadias_checkin_feito (
  estadia_id uuid primary key references public.estadias (id) on delete cascade,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  entrada_reservada timestamptz not null,
  feito_em timestamptz not null default now(),
  feito_por uuid
);
create index if not exists estadias_checkin_feito_petshop on public.estadias_checkin_feito (petshop_id);
alter table public.estadias_checkin_feito enable row level security;
drop policy if exists estadias_checkin_feito_ler on public.estadias_checkin_feito;
create policy estadias_checkin_feito_ler on public.estadias_checkin_feito for select to authenticated
  using (petshop_id in (select public.meus_petshops()));
revoke all on public.estadias_checkin_feito from anon, authenticated;
grant select on public.estadias_checkin_feito to authenticated;

-- reserva que entrou na casa: guarda a data reservada; saiu da casa (check-out, cancelada, voltou a reserva): apaga
create or replace function public.estadias_checkin_anotar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'reservada' and new.status = 'em_casa' and new.mensalista is null then
    insert into public.estadias_checkin_feito (estadia_id, petshop_id, entrada_reservada, feito_em, feito_por)
    values (new.id, new.petshop_id, old.entrada, now(), (select auth.uid()))
    on conflict (estadia_id) do update set entrada_reservada = excluded.entrada_reservada, feito_em = excluded.feito_em, feito_por = excluded.feito_por;
  elsif old.status = 'em_casa' and new.status is distinct from 'em_casa' then
    delete from public.estadias_checkin_feito c where c.estadia_id = new.id;
  end if;
  return null;
end $$;
revoke execute on function public.estadias_checkin_anotar() from public, anon, authenticated;
drop trigger if exists estadias_zz_checkin_anotar on public.estadias;
create trigger estadias_zz_checkin_anotar after update of status on public.estadias
  for each row execute function public.estadias_checkin_anotar();

-- Volta para "reservada", na data reservada. Roda com o login de quem chamou (a mesma regra de quem faz o check-in).
create or replace function public.estadia_desfazer_checkin(p_estadia uuid) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  c public.estadias_checkin_feito;
  v_fuso text;
  v_id uuid;
begin
  select * into c from public.estadias_checkin_feito x where x.estadia_id = p_estadia;
  if not found then raise exception 'Este check-in não pode mais ser desfeito. Para mudar a data, use Editar.' using hint = 'maestro:sem_desfazer'; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = c.petshop_id;
  if (c.feito_em at time zone v_fuso)::date <> (now() at time zone v_fuso)::date then
    raise exception 'O check-in só pode ser desfeito no mesmo dia. Para mudar a data, use Editar.' using hint = 'maestro:sem_desfazer';
  end if;
  update public.estadias e set status = 'reservada', entrada = c.entrada_reservada
    where e.id = p_estadia and e.petshop_id = c.petshop_id and e.status = 'em_casa'
    returning e.id into v_id;
  if v_id is null then raise exception 'Essa estadia já tinha sido alterada. Atualize a lista.' using hint = 'maestro:estadia_ja'; end if;
  return jsonb_build_object('ok', true, 'entrada', c.entrada_reservada);
end $$;
revoke execute on function public.estadia_desfazer_checkin(uuid) from public, anon;
grant execute on function public.estadia_desfazer_checkin(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Link: o "Tirar dúvida" sabe do desconto do segundo pet (a mesma de 20261168, com a chave "segundo" a mais)
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.link_hotel_opcoes(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sinal', case when coalesce((p.opcoes -> 'hotel.sinal' ->> 'ativo')::boolean, false) then jsonb_build_object(
      'modo', p.opcoes -> 'hotel.sinal' ->> 'modo', 'valor', p.opcoes -> 'hotel.sinal' -> 'valor',
      'politica', p.opcoes -> 'hotel.sinal' ->> 'politica', 'creche', coalesce((p.opcoes -> 'hotel.sinal' ->> 'creche')::boolean, false)) else null end,
    'preco', case when p.opcoes -> 'hotel.link_sem_preco' = 'true'::jsonb then jsonb_build_object('mostrar', false)
      else (
        select jsonb_build_object('mostrar', true, 'de', min(d.v), 'ate', max(d.v),
          'varia', (p.opcoes -> 'hotel.temporadas' -> 'ativo' = 'true'::jsonb and jsonb_typeof(p.opcoes -> 'hotel.temporadas' -> 'lista') = 'array'
                    and jsonb_array_length(p.opcoes -> 'hotel.temporadas' -> 'lista') > 0)
                or exists (select 1 from public.hotel_precos h where h.petshop_id = p.id and h.feriado -> 'ativo' = 'true'::jsonb)
                   and exists (select 1 from public.dias_especiais x where x.petshop_id = p.id and x.feriado and x.dia >= (now() at time zone p.fuso)::date))
        from (select public.diaria_sugerida(p.id, 'hotel', t.porte) as v from (values (null::text), ('P'), ('M'), ('G'), ('GG')) as t(porte)) d
      ) end,
    'atraso', case when p.opcoes -> 'hotel.link_sem_preco' = 'true'::jsonb then null else (
      select jsonb_build_object('hora', h.atraso -> 'hotel' ->> 'hora', 'valor', h.atraso -> 'hotel' -> 'valor',
        'tolerancia', case when jsonb_typeof(h.atraso -> 'tolerancia') = 'number' then least(180, greatest(0, round((h.atraso ->> 'tolerancia')::numeric))) else 0 end)
      from public.hotel_precos h
      where h.petshop_id = p.id and h.atraso -> 'ativo' = 'true'::jsonb
        and coalesce(h.atraso -> 'hotel' ->> 'hora', '') ~ '^([01]\d|2[0-3]):[0-5]\d$'
        and jsonb_typeof(h.atraso -> 'hotel' -> 'valor') = 'number' and (h.atraso -> 'hotel' ->> 'valor')::numeric > 0
    ) end,
    -- desconto do segundo pet (o link já aplica na estimativa): o "Tirar dúvida" pode responder
    'segundo', case when p.opcoes -> 'hotel.link_sem_preco' = 'true'::jsonb then null
      when p.opcoes -> 'hotel.desconto_segundo_pet' -> 'ativo' = 'true'::jsonb and jsonb_typeof(p.opcoes -> 'hotel.desconto_segundo_pet' -> 'pct') = 'number'
        and (p.opcoes -> 'hotel.desconto_segundo_pet' ->> 'pct')::numeric > 0
      then least(100, (p.opcoes -> 'hotel.desconto_segundo_pet' ->> 'pct')::numeric) end,
    'busca_ate', public.hotel_busca_ate(p.id),
    'busca_hora', (select h.atraso -> 'hotel' ->> 'hora' from public.hotel_precos h where h.petshop_id = p.id and public.hotel_busca_ate(p.id) is not null)
  )
  from public.petshops p
  where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)
$$;
