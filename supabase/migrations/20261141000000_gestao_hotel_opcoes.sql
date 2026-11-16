-- Hotel e creche com opções: sinal na reserva, conta do check-out com a composição guardada, ficha de cuidados da estadia,
-- acomodação, mensagens enviadas e o link do cliente com hora de chegada e de saída e mais de um pet por pedido.
-- Tudo aqui é acréscimo: colunas novas vazias, tabelas novas e funções novas. O aplicativo que já está no ar segue igual
-- (a única função trocada, link_pedir_estadia, ganha três parâmetros com padrão e responde igual a quem não os manda).

-- ---------- estadia: o que não é dinheiro ----------
-- acomodacao: o código de uma acomodação da lista do pet shop (opção "hotel.acomodacoes").
-- cuidados: comida e remédio combinados para a estadia: [{ id, tipo, oque, quanto, horas: ["08:00"] }].
-- avisos: quando cada mensagem foi mandada para o tutor: { chegada: "2026-11-13T12:00:00Z", ... }.
-- sinal_estado: só a situação do sinal, sem valor (o valor fica em estadias_valores, para quem recebe).
alter table public.estadias
  add column acomodacao text check (acomodacao is null or char_length(acomodacao) between 1 and 40),
  add column cuidados jsonb check (cuidados is null or jsonb_typeof(cuidados) = 'array'),
  add column avisos jsonb not null default '{}'::jsonb check (jsonb_typeof(avisos) = 'object'),
  add column sinal_estado text check (sinal_estado in ('a_receber', 'pago', 'devolvido', 'mantido'));

-- ---------- estadia: o dinheiro (só para quem recebe: Caixa, Financeiro ou Relatórios, e o dono) ----------
create table public.estadias_valores (
  estadia_id uuid primary key references public.estadias (id) on delete cascade,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  -- sinal: valor combinado; a situação; o lançamento (recebido ou a receber) e, se foi devolvido, o lançamento da devolução
  sinal numeric(10, 2) check (sinal is null or (sinal > 0 and sinal <= 99999.99)),
  sinal_estado text check (sinal_estado in ('a_receber', 'pago', 'devolvido', 'mantido')),
  sinal_lancamento_id uuid,
  sinal_pago_em date,
  sinal_pagamento jsonb,
  sinal_devolucao_id uuid,
  sinal_devolvido_em date,
  -- taxas marcadas na reserva: [{ id, nome, por, valor }]
  taxas jsonb check (taxas is null or jsonb_typeof(taxas) = 'array'),
  -- a conta do check-out como foi cobrada (noite a noite, taxas, extras, produtos, sinal, total, pagamento)
  conta jsonb check (conta is null or jsonb_typeof(conta) = 'object'),
  atualizado_em timestamptz not null default now(),
  check ((sinal is null) = (sinal_estado is null))
);
create index on public.estadias_valores (petshop_id);
create index on public.estadias_valores (sinal_lancamento_id) where sinal_lancamento_id is not null;
alter table public.estadias_valores enable row level security;
revoke all on public.estadias_valores from anon, authenticated;
grant select, insert, update on public.estadias_valores to authenticated;
create policy estadias_valores_ler on public.estadias_valores for select to authenticated
  using ((select public.tenho_area(petshop_id, array['caixa', 'financeiro', 'relatorios'])));
create policy estadias_valores_criar on public.estadias_valores for insert to authenticated
  with check ((select public.tenho_area(petshop_id, array['caixa', 'financeiro', 'relatorios'])) and (select public.acesso_liberado(petshop_id)));
create policy estadias_valores_editar on public.estadias_valores for update to authenticated
  using ((select public.tenho_area(petshop_id, array['caixa', 'financeiro', 'relatorios'])) and (select public.acesso_liberado(petshop_id)))
  with check ((select public.tenho_area(petshop_id, array['caixa', 'financeiro', 'relatorios'])));

-- O pet shop da linha é sempre o da estadia, e a situação do sinal vai para a estadia (sem o valor).
create function public.estadias_valores_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_petshop uuid;
begin
  select e.petshop_id into v_petshop from public.estadias e where e.id = new.estadia_id;
  if v_petshop is null then raise exception 'Estadia não encontrada.'; end if;
  new.petshop_id := v_petshop;
  new.atualizado_em := now();
  return new;
end $$;
create trigger estadias_valores_conferir before insert or update on public.estadias_valores
  for each row execute function public.estadias_valores_conferir();

create function public.estadias_valores_espelhar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('maestro.hotel', '1', true);
  update public.estadias e set sinal_estado = new.sinal_estado where e.id = new.estadia_id and e.sinal_estado is distinct from new.sinal_estado;
  perform set_config('maestro.hotel', '', true);
  return null;
end $$;
create trigger estadias_valores_espelhar after insert or update of sinal_estado on public.estadias_valores
  for each row execute function public.estadias_valores_espelhar();

-- A situação do sinal na estadia só muda por aqui. E reserva com sinal pago só é cancelada por quem recebe,
-- que decide na hora se o sinal fica ou é devolvido (o dinheiro nunca some sem alguém decidir).
create function public.estadias_guardar_sinal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if tg_op = 'INSERT' then
    new.sinal_estado := null;
    return new;
  end if;
  if new.sinal_estado is distinct from old.sinal_estado and coalesce(current_setting('maestro.hotel', true), '') <> '1' then
    new.sinal_estado := old.sinal_estado;
  end if;
  if new.status = 'cancelada' and old.status <> 'cancelada' and new.sinal_estado in ('a_receber', 'pago') then
    raise exception 'Esta reserva tem sinal. Quem cuida do caixa cancela e diz o que fazer com o sinal.';
  end if;
  return new;
end $$;
create trigger estadias_guardar_sinal before insert or update on public.estadias
  for each row execute function public.estadias_guardar_sinal();

-- O sinal é um lançamento comum (recebido, ou a receber). Se ele recebe baixa, muda de valor ou é apagado em outra tela,
-- a reserva acompanha.
create function public.estadias_sinal_do_lancamento() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if not exists (select 1 from public.petshops p where p.id = old.petshop_id) then return null; end if;
    update public.estadias_valores v set sinal = null, sinal_estado = null, sinal_lancamento_id = null, sinal_pago_em = null, sinal_pagamento = null
      where v.sinal_lancamento_id = old.id and v.sinal_estado in ('a_receber', 'pago');
    update public.estadias_valores v set sinal_devolucao_id = null, sinal_devolvido_em = null, sinal_estado = 'mantido'
      where v.sinal_devolucao_id = old.id and v.sinal_estado = 'devolvido';
    return null;
  end if;
  if new.pago is distinct from old.pago or new.valor is distinct from old.valor or new.data is distinct from old.data
     or new.forma is distinct from old.forma or new.pagamentos is distinct from old.pagamentos then
    update public.estadias_valores v set
        sinal = case when new.valor > 0 then new.valor else v.sinal end,
        sinal_estado = case when new.pago then 'pago' else 'a_receber' end,
        sinal_pago_em = case when new.pago then new.data else null end,
        sinal_pagamento = case when new.pago then jsonb_build_object('forma', new.forma, 'pagamentos', new.pagamentos) else null end
      where v.sinal_lancamento_id = new.id and v.sinal_estado in ('a_receber', 'pago');
  end if;
  return null;
end $$;
create trigger estadias_sinal_do_lancamento after update or delete on public.lancamentos
  for each row execute function public.estadias_sinal_do_lancamento();

revoke execute on function public.estadias_valores_conferir(), public.estadias_valores_espelhar(), public.estadias_guardar_sinal(),
  public.estadias_sinal_do_lancamento() from public, anon, authenticated;

-- ---------- ficha de cuidados: o que foi feito em cada dia ----------
create table public.estadias_cuidados (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  estadia_id uuid not null references public.estadias (id) on delete cascade,
  -- item: o `id` do cuidado em estadias.cuidados; hora: o horário combinado ("08:00"), ou vazio
  item text not null check (char_length(item) between 1 and 40),
  dia date not null,
  hora text not null default '' check (char_length(hora) <= 5),
  feito_em timestamptz not null default now(),
  feito_por uuid references auth.users (id) on delete set null,
  feito_nome text,
  unique (estadia_id, item, dia, hora)
);
create index on public.estadias_cuidados (petshop_id, dia);
alter table public.estadias_cuidados enable row level security;
revoke all on public.estadias_cuidados from anon, authenticated;
grant select, insert, delete on public.estadias_cuidados to authenticated;
create policy estadias_cuidados_ler on public.estadias_cuidados for select to authenticated
  using (petshop_id in (select public.meus_petshops()));
create policy estadias_cuidados_criar on public.estadias_cuidados for insert to authenticated
  with check ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)));
create policy estadias_cuidados_remover on public.estadias_cuidados for delete to authenticated
  using ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)));

-- Quem marcou é sempre quem está logado, com o nome da equipe; o pet shop é o da estadia.
create function public.estadias_cuidados_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_petshop uuid;
begin
  select e.petshop_id into v_petshop from public.estadias e where e.id = new.estadia_id;
  if v_petshop is null then raise exception 'Estadia não encontrada.'; end if;
  new.petshop_id := v_petshop;
  new.feito_em := now();
  if (select auth.uid()) is not null then
    new.feito_por := (select auth.uid());
    select x.nome into new.feito_nome from public.profissionais x where x.petshop_id = v_petshop and x.user_id = (select auth.uid()) limit 1;
  end if;
  return new;
end $$;
create trigger estadias_cuidados_conferir before insert on public.estadias_cuidados
  for each row execute function public.estadias_cuidados_conferir();
revoke execute on function public.estadias_cuidados_conferir() from public, anon, authenticated;

-- ---------- pedido pelo link: o tutor já foi avisado da resposta? ----------
-- O aviso "avise o tutor" deixa de sumir ao recarregar a tela: fica no pedido até alguém avisar.
-- Os pedidos respondidos antes desta mudança entram como já avisados, para não voltarem todos de uma vez.
alter table public.pedidos_agendamento add column avisado_em timestamptz;
update public.pedidos_agendamento set avisado_em = criado_em where status <> 'pendente';
grant update (avisado_em) on public.pedidos_agendamento to authenticated;

-- ---------- link do cliente ----------
-- O que o link precisa saber das opções do hotel: se há sinal na reserva (regra e texto da política, escritos pelo dono).
create function public.link_hotel_opcoes(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'sinal', case when coalesce((p.opcoes -> 'hotel.sinal' ->> 'ativo')::boolean, false) then jsonb_build_object(
      'modo', p.opcoes -> 'hotel.sinal' ->> 'modo', 'valor', p.opcoes -> 'hotel.sinal' -> 'valor',
      'politica', p.opcoes -> 'hotel.sinal' ->> 'politica', 'creche', coalesce((p.opcoes -> 'hotel.sinal' ->> 'creche')::boolean, false)) else null end
  )
  from public.petshops p
  where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)
$$;
revoke execute on function public.link_hotel_opcoes(text) from public;
grant execute on function public.link_hotel_opcoes(text) to anon, authenticated;

-- Pedido de creche ou hotel: agora com a hora de chegada e de saída e com mais pets do mesmo tutor no mesmo pedido.
-- Os três parâmetros novos têm padrão: quem chama do jeito antigo (dez parâmetros) recebe o mesmo de antes (8h às 18h, um pet).
-- Cada pet vira um pedido, todos com o mesmo grupo. A conta de vagas é a de sempre (link_estadia_cheios), conferida pet a pet:
-- o pedido que acabou de entrar já ocupa vaga para o próximo. Se faltar vaga para algum, nenhum entra.
drop function public.link_pedir_estadia(text, text, date, date, text, text, text, text, text, text);
create function public.link_pedir_estadia(
  p_codigo text, p_tipo text, p_entrada date, p_saida date, p_tutor text, p_telefone text, p_pet text,
  p_especie text default 'cao', p_porte text default null, p_obs text default null,
  p_hora_entrada text default null, p_hora_saida text default null, p_mais_pets jsonb default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.petshops;
  v_fone text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_hoje date;
  v_id uuid;
  v_primeiro uuid;
  v_cheio date;
  v_h1 time := time '08:00';
  v_h2 time := time '18:00';
  v_pets jsonb := jsonb_build_array(jsonb_build_object('nome', p_pet, 'especie', p_especie, 'porte', p_porte));
  v_grupo uuid;
  x jsonb;
  v_nome text;
begin
  select * into v from public.petshops where link_codigo = p_codigo and link_ativo;
  if not found or not public.acesso_liberado(v.id) then return jsonb_build_object('ok', false, 'erro', 'fechado'); end if;
  if p_tipo not in ('creche', 'hotel') or (p_tipo = 'creche' and not v.link_creche) or (p_tipo = 'hotel' and not v.link_hotel) then
    return jsonb_build_object('ok', false, 'erro', 'fechado');
  end if;
  v_hoje := (now() at time zone v.fuso)::date;
  if p_mais_pets is not null and jsonb_typeof(p_mais_pets) = 'array' then
    if jsonb_array_length(p_mais_pets) > 3 then return jsonb_build_object('ok', false, 'erro', 'dados'); end if;
    v_pets := v_pets || p_mais_pets;
  end if;
  if char_length(trim(coalesce(p_tutor, ''))) < 2 or not public.fone_plausivel(v_fone) then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end if;
  for x in select * from jsonb_array_elements(v_pets) loop
    if jsonb_typeof(x) <> 'object' or char_length(trim(coalesce(x ->> 'nome', ''))) < 1 then return jsonb_build_object('ok', false, 'erro', 'dados'); end if;
  end loop;
  if (select count(distinct lower(trim(y ->> 'nome'))) from jsonb_array_elements(v_pets) y) < jsonb_array_length(v_pets) then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end if;
  if p_entrada is null or p_saida is null or p_entrada < v_hoje or p_entrada > v_hoje + 365
     or p_saida < p_entrada or (p_tipo = 'hotel' and p_saida = p_entrada) or p_saida > p_entrada + 60 then
    return jsonb_build_object('ok', false, 'erro', 'datas');
  end if;
  if coalesce(p_hora_entrada, '') ~ '^([01]\d|2[0-3]):[0-5]\d$' then v_h1 := p_hora_entrada::time; end if;
  if coalesce(p_hora_saida, '') ~ '^([01]\d|2[0-3]):[0-5]\d$' then v_h2 := p_hora_saida::time; end if;
  -- no mesmo dia (creche de um dia), a saída vem depois da chegada
  if p_saida = p_entrada and v_h2 <= v_h1 then return jsonb_build_object('ok', false, 'erro', 'horas'); end if;
  -- o mesmo tutor pedindo de novo o mesmo pet para datas que se cruzam: avisa em vez de duplicar
  if exists (
    select 1 from public.pedidos_agendamento q, jsonb_array_elements(v_pets) y
    where q.petshop_id = v.id and q.tipo in ('creche', 'hotel') and q.status in ('pendente', 'aceito')
      and right(q.telefone, 8) = right(v_fone, 8) and lower(trim(q.pet_nome)) = lower(trim(y ->> 'nome'))
      and (q.inicio at time zone v.fuso)::date <= p_saida and (q.fim at time zone v.fuso)::date >= p_entrada
      and (q.fim at time zone v.fuso)::date >= v_hoje
  ) then
    return jsonb_build_object('ok', false, 'erro', 'repetido');
  end if;
  if (select count(*) from public.pedidos_agendamento where petshop_id = v.id and telefone = v_fone and status = 'pendente') + jsonb_array_length(v_pets) > 6
     or (select count(*) from public.pedidos_agendamento where petshop_id = v.id and criado_em > now() - interval '1 day') >= 60 then
    return jsonb_build_object('ok', false, 'erro', 'limite');
  end if;
  if jsonb_array_length(v_pets) > 1 then v_grupo := gen_random_uuid(); end if;
  begin
    for x in select * from jsonb_array_elements(v_pets) loop
      select min(d) into v_cheio from public.link_estadia_cheios(p_codigo, p_tipo, p_entrada, case when p_tipo = 'hotel' then p_saida - 1 else p_saida end) d;
      if v_cheio is not null then raise exception using errcode = 'P0001', message = 'LOTADO'; end if;
      v_nome := left(trim(x ->> 'nome'), 80);
      insert into public.pedidos_agendamento (petshop_id, tutor_nome, telefone, pet_nome, especie, porte, inicio, fim, obs, tipo, grupo_id)
      values (v.id, left(trim(p_tutor), 120), v_fone, v_nome,
        case when x ->> 'especie' in ('cao', 'gato', 'outro') then x ->> 'especie' else 'cao' end,
        case when x ->> 'porte' in ('P', 'M', 'G', 'GG') then x ->> 'porte' else null end,
        (p_entrada::timestamp + v_h1) at time zone v.fuso, (p_saida::timestamp + v_h2) at time zone v.fuso,
        nullif(left(trim(coalesce(p_obs, '')), 300), ''), p_tipo, v_grupo)
      returning id into v_id;
      v_primeiro := coalesce(v_primeiro, v_id);
    end loop;
  exception when sqlstate 'P0001' then
    return jsonb_build_object('ok', false, 'erro', 'lotado', 'dia', v_cheio);
  end;
  return jsonb_build_object('ok', true, 'pets', jsonb_array_length(v_pets), 'id', v_primeiro);
end $$;
revoke execute on function public.link_pedir_estadia(text, text, date, date, text, text, text, text, text, text, text, text, jsonb) from public;
grant execute on function public.link_pedir_estadia(text, text, date, date, text, text, text, text, text, text, text, text, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
