-- Dinheiro protegido: achados dos testes com uma loja que tem equipe e caixa.
-- 1) Quem só opera o caixa lê e grava só o que é do caixa (o caixa aberto, o que entrou hoje e as contas que os clientes
--    ficaram de pagar). Despesas, contas a pagar e o histórico ficam com o dono e com quem tem Financeiro ou Relatórios.
-- 2) Valor já recebido não muda em silêncio: toda alteração ou exclusão fica anotada (quem, quando, de quanto para quanto).
-- 3) Atendimento pago só é reaberto, alterado ou apagado por quem cuida do financeiro; com o caixa fechado, só pelo dono.
-- 4) O caixa fecha com a conta feita pelo banco na hora, e nada entra num caixa enquanto ele está sendo fechado.
-- Tudo aqui convive com o aplicativo que já está no ar: o dono e quem cuida do financeiro continuam como estavam.

-- ---------- quem vê o quê ----------
-- Dono, ou quem tem a área Financeiro ou Relatórios: vê e mexe em todo o dinheiro.
create function public.cuido_do_financeiro(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.tenho_area(p, array['financeiro', 'relatorios'])
$$;

-- Pet shops em que a pessoa vê todo o dinheiro (para as regras lerem uma vez só por consulta).
create function public.petshops_do_financeiro() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select x.petshop_id from public.profissionais x
  where x.user_id = (select auth.uid()) and x.ativo and public.tenho_area(x.petshop_id, array['financeiro', 'relatorios'])
$$;

-- Pet shops em que a pessoa opera o caixa: o dia de hoje lá e o caixa aberto (se houver).
-- Perto da meia-noite valem dois dias, porque o aparelho pode estar num fuso do Brasil diferente do fuso do pet shop.
create function public.meus_caixas() returns table (petshop_id uuid, hoje date, caixa_id uuid)
language sql stable security definer set search_path = '' as $$
  select distinct x.petshop_id, (now() at time zone f.fuso)::date, c.id
  from public.profissionais x
  join public.petshops p on p.id = x.petshop_id
  cross join lateral (values (coalesce(p.fuso, 'America/Sao_Paulo')), ('America/Noronha'), ('America/Sao_Paulo'), ('America/Manaus'), ('America/Rio_Branco')) f (fuso)
  left join public.caixas c on c.petshop_id = x.petshop_id and c.fechado_em is null
  where x.user_id = (select auth.uid()) and x.ativo and public.tenho_area(x.petshop_id, array['caixa'])
$$;

revoke execute on function public.cuido_do_financeiro(uuid), public.petshops_do_financeiro(), public.meus_caixas() from public, anon;
grant execute on function public.cuido_do_financeiro(uuid), public.petshops_do_financeiro(), public.meus_caixas() to authenticated;

-- ---------- colunas novas ----------
-- Quando um valor já recebido foi alterado pela última vez (as listas mostram a etiqueta "alterado").
alter table public.lancamentos add column alterado_em timestamptz;
-- Dinheiro que o sistema esperava na gaveta quando o caixa foi fechado (conta feita pelo banco).
alter table public.caixas add column valor_esperado numeric(10, 2);

-- ---------- conta da gaveta, feita pelo banco ----------
-- A parte em dinheiro de um lançamento (no pagamento dividido, só a parte em dinheiro). Mesma conta do aplicativo.
create function public.parte_em_dinheiro(p_valor numeric, p_forma text, p_pagamentos jsonb) returns numeric
language plpgsql immutable set search_path = '' as $$
declare
  x jsonb;
  v numeric;
  v_soma numeric := 0;
  v_dinheiro numeric := 0;
begin
  if p_pagamentos is not null and jsonb_typeof(p_pagamentos) = 'array' then
    for x in select * from jsonb_array_elements(p_pagamentos) loop
      if jsonb_typeof(x) <> 'object' then continue; end if;
      begin
        v := (x ->> 'valor')::numeric;
      exception when others then continue;
      end;
      if v is null or v <= 0 then continue; end if;
      v_soma := v_soma + v;
      if x ->> 'forma' = 'dinheiro' then v_dinheiro := v_dinheiro + v; end if;
    end loop;
    if v_soma > 0 and round(v_soma, 2) = round(p_valor, 2) then return round(v_dinheiro, 2); end if;
  end if;
  return case when p_forma = 'dinheiro' then p_valor else 0 end;
end $$;

-- Dinheiro esperado na gaveta: troco inicial + recebido em dinheiro + colocado na gaveta − pago em dinheiro − tirado da gaveta.
create function public.caixa_esperado(p_caixa uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select round(c.valor_inicial + coalesce(sum(
    case when l.movimento = 'suprimento' then l.valor
         when l.movimento = 'sangria' then -l.valor
         when l.tipo = 'entrada' then public.parte_em_dinheiro(l.valor, l.forma, l.pagamentos)
         else -public.parte_em_dinheiro(l.valor, l.forma, l.pagamentos) end), 0), 2)
  from public.caixas c
  left join public.lancamentos l on l.caixa_id = c.id and l.pago
  where c.id = p_caixa
  group by c.id, c.valor_inicial
$$;
revoke execute on function public.parte_em_dinheiro(numeric, text, jsonb), public.caixa_esperado(uuid) from public, anon, authenticated;

-- Caixa fechado não muda. Caixa aberto: o troco inicial só muda com quem cuida do financeiro,
-- e ao fechar o banco anota a hora, quem fechou e o dinheiro esperado.
create or replace function public.travar_caixa() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.fechado_em is not null then
    if tg_op = 'DELETE' then
      if not exists (select 1 from public.petshops p where p.id = old.petshop_id) then return old; end if;
      raise exception 'Este caixa já foi fechado e não pode ser apagado.';
    end if;
    raise exception 'Este caixa já foi fechado e não pode ser alterado.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  if (select auth.uid()) is not null
     and (new.valor_inicial is distinct from old.valor_inicial or new.aberto_em is distinct from old.aberto_em or new.aberto_por is distinct from old.aberto_por)
     and not public.cuido_do_financeiro(old.petshop_id) then
    raise exception 'Só o dono ou quem cuida do financeiro pode mudar o troco inicial de um caixa aberto.';
  end if;
  if new.fechado_em is not null then
    new.fechado_em := clock_timestamp();
    if (select auth.uid()) is not null then new.fechado_por := (select auth.uid()); end if;
    new.valor_esperado := public.caixa_esperado(old.id);
  else
    new.valor_esperado := null;
  end if;
  return new;
end $$;

-- Caixas já fechados ganham o esperado (a trava de caixa fechado fica de lado só durante esta conta).
alter table public.caixas disable trigger travar_caixa;
update public.caixas set valor_esperado = public.caixa_esperado(id) where fechado_em is not null;
alter table public.caixas enable trigger travar_caixa;

-- Fechar o caixa conferindo a conta na hora. `p_esperado` é o que a pessoa viu na tela enquanto contava:
-- se mudou (alguém recebeu ou pagou nesse meio tempo), não fecha e devolve o esperado de agora.
create function public.fechar_caixa(p_caixa uuid, p_contado numeric, p_obs text default null, p_esperado numeric default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.caixas;
  v_esperado numeric;
begin
  select * into c from public.caixas x where x.id = p_caixa for update;
  if not found or not public.tenho_area(c.petshop_id, array['caixa', 'financeiro', 'relatorios']) then
    raise exception 'Caixa não encontrado.';
  end if;
  if not public.acesso_liberado(c.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if p_contado is null or p_contado < 0 or p_contado >= 100000000 then
    raise exception 'Conte o dinheiro da gaveta e escreva o valor.';
  end if;
  if c.fechado_em is not null then return jsonb_build_object('fechado', false, 'motivo', 'ja_fechado'); end if;
  v_esperado := public.caixa_esperado(p_caixa);
  if p_esperado is not null and round(p_esperado, 2) <> v_esperado then
    return jsonb_build_object('fechado', false, 'motivo', 'mudou', 'esperado', v_esperado);
  end if;
  update public.caixas set fechado_em = clock_timestamp(), valor_contado = round(p_contado, 2), obs = nullif(trim(left(coalesce(p_obs, ''), 500)), '')
    where id = p_caixa;
  return jsonb_build_object('fechado', true, 'esperado', v_esperado);
end $$;
revoke execute on function public.fechar_caixa(uuid, numeric, text, numeric) from public, anon;
grant execute on function public.fechar_caixa(uuid, numeric, text, numeric) to authenticated;

-- Lançamento de caixa fechado: só a descrição muda. Nada entra num caixa fechado,
-- nem no instante em que ele está sendo fechado (o lançamento espera o fechamento terminar e aí é recusado).
create or replace function public.travar_caixa_fechado() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_direto boolean := pg_trigger_depth() = 1;
begin
  if tg_op = 'INSERT' then
    if new.caixa_id is not null then
      perform 1 from public.caixas c where c.id = new.caixa_id for share;
      if exists (select 1 from public.caixas c where c.id = new.caixa_id and c.fechado_em is not null) then
        raise exception 'Este caixa já foi fechado. Abra um caixa novo para lançar.';
      end if;
    end if;
    -- quem lançou é sempre quem está logado
    if (select auth.uid()) is not null then new.criado_por := (select auth.uid()); end if;
    return new;
  end if;
  if old.caixa_id is not null and exists (select 1 from public.caixas c where c.id = old.caixa_id and c.fechado_em is not null) then
    if tg_op = 'DELETE' then
      if not exists (select 1 from public.petshops p where p.id = old.petshop_id) then return old; end if;
      raise exception 'Este lançamento é de um caixa já fechado e não pode ser apagado. Se precisar corrigir, lance um ajuste.';
    end if;
    if new.valor is distinct from old.valor or new.tipo is distinct from old.tipo or new.forma is distinct from old.forma
       or new.data is distinct from old.data or new.pago is distinct from old.pago or new.caixa_id is distinct from old.caixa_id
       or new.pagamentos is distinct from old.pagamentos or new.movimento is distinct from old.movimento
       or new.categoria is distinct from old.categoria or new.itens is distinct from old.itens
       or (v_direto and (new.agendamento_id is distinct from old.agendamento_id or new.cliente_id is distinct from old.cliente_id)) then
      raise exception 'Este lançamento é de um caixa já fechado e não pode ser alterado. Se precisar corrigir, lance um ajuste.';
    end if;
  elsif tg_op = 'UPDATE' and new.caixa_id is distinct from old.caixa_id and new.caixa_id is not null then
    perform 1 from public.caixas c where c.id = new.caixa_id for share;
    if exists (select 1 from public.caixas c where c.id = new.caixa_id and c.fechado_em is not null) then
      raise exception 'Este caixa já foi fechado. Abra um caixa novo para lançar.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- ---------- quem lê e grava cada lançamento ----------
drop policy lancamentos_ler on public.lancamentos;
drop policy lancamentos_criar on public.lancamentos;
drop policy lancamentos_editar on public.lancamentos;
drop policy lancamentos_remover on public.lancamentos;

-- Quem só opera o caixa lê: (a) o caixa aberto, menos as saídas de outra pessoa que não passaram pela gaveta;
-- (b) o que entrou hoje e o que ela mesma lançou hoje; (c) as contas que os clientes ficaram de pagar.
create policy lancamentos_ler on public.lancamentos for select to authenticated using (
  petshop_id in (select public.petshops_do_financeiro())
  or (caixa_id in (select m.caixa_id from public.meus_caixas() m)
      and (tipo = 'entrada' or movimento is not null or forma = 'dinheiro' or criado_por = (select auth.uid())))
  or (pago and (petshop_id, data) in (select m.petshop_id, m.hoje from public.meus_caixas() m)
      and (tipo = 'entrada' or criado_por = (select auth.uid())))
  or (not pago and tipo = 'entrada' and (cliente_id is not null or agendamento_id is not null)
      and petshop_id in (select m.petshop_id from public.meus_caixas() m))
);
-- Quem só opera o caixa lança: dinheiro de hoje (no caixa aberto ou fora dele) e a conta que o cliente vai pagar depois.
create policy lancamentos_criar on public.lancamentos for insert to authenticated with check (
  (select public.acesso_liberado(petshop_id)) and (
    petshop_id in (select public.petshops_do_financeiro())
    or (pago and (petshop_id, data) in (select m.petshop_id, m.hoje from public.meus_caixas() m)
        and (caixa_id is null or caixa_id in (select m.caixa_id from public.meus_caixas() m)))
    or (not pago and tipo = 'entrada' and (cliente_id is not null or agendamento_id is not null)
        and petshop_id in (select m.petshop_id from public.meus_caixas() m))
  )
);
-- Quem só opera o caixa altera: o que ela mesma lançou no caixa que ainda está aberto, e dá baixa na conta de um cliente.
create policy lancamentos_editar on public.lancamentos for update to authenticated using (
  (select public.acesso_liberado(petshop_id)) and (
    petshop_id in (select public.petshops_do_financeiro())
    or (pago and criado_por = (select auth.uid()) and caixa_id in (select m.caixa_id from public.meus_caixas() m))
    or (not pago and tipo = 'entrada' and (cliente_id is not null or agendamento_id is not null)
        and petshop_id in (select m.petshop_id from public.meus_caixas() m))
  )
) with check (
  petshop_id in (select public.petshops_do_financeiro())
  or (pago and (caixa_id in (select m.caixa_id from public.meus_caixas() m)
                or (caixa_id is null and (petshop_id, data) in (select m.petshop_id, m.hoje from public.meus_caixas() m))))
  or (not pago and tipo = 'entrada' and (cliente_id is not null or agendamento_id is not null)
      and petshop_id in (select m.petshop_id from public.meus_caixas() m))
);
-- Quem só opera o caixa apaga: o que ela mesma lançou no caixa aberto, ou a conta a receber que ela mesma anotou.
create policy lancamentos_remover on public.lancamentos for delete to authenticated using (
  (select public.acesso_liberado(petshop_id)) and (
    petshop_id in (select public.petshops_do_financeiro())
    or (criado_por = (select auth.uid()) and (
          (pago and caixa_id in (select m.caixa_id from public.meus_caixas() m))
          or (not pago and tipo = 'entrada' and (cliente_id is not null or agendamento_id is not null)
              and petshop_id in (select m.petshop_id from public.meus_caixas() m))))
  )
);

-- Caixas: quem tem Caixa, Financeiro ou Relatórios (a mesma regra das áreas). Apagar um caixa: só quem cuida do financeiro.
drop policy caixas_ler on public.caixas;
drop policy caixas_criar on public.caixas;
drop policy caixas_editar on public.caixas;
drop policy caixas_remover on public.caixas;
create policy caixas_ler on public.caixas for select to authenticated
  using ((select public.tenho_area(petshop_id, array['caixa', 'financeiro', 'relatorios'])));
create policy caixas_criar on public.caixas for insert to authenticated
  with check ((select public.tenho_area(petshop_id, array['caixa', 'financeiro', 'relatorios'])) and (select public.acesso_liberado(petshop_id)));
create policy caixas_editar on public.caixas for update to authenticated
  using ((select public.tenho_area(petshop_id, array['caixa', 'financeiro', 'relatorios'])) and (select public.acesso_liberado(petshop_id)))
  with check ((select public.tenho_area(petshop_id, array['caixa', 'financeiro', 'relatorios'])));
create policy caixas_remover on public.caixas for delete to authenticated
  using ((select public.cuido_do_financeiro(petshop_id)) and (select public.acesso_liberado(petshop_id)));

-- ---------- valor recebido não muda em silêncio ----------
create table public.lancamentos_alteracoes (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  lancamento_id uuid not null,
  acao text not null check (acao in ('alterou', 'apagou')),
  quem uuid references auth.users (id) on delete set null,
  quem_nome text,
  quando timestamptz not null default now(),
  -- alterou: só os campos que mudaram, antes e depois. apagou: o lançamento inteiro em `antes`.
  antes jsonb not null,
  depois jsonb
);
create index on public.lancamentos_alteracoes (petshop_id, quando desc);
create index on public.lancamentos_alteracoes (lancamento_id);
alter table public.lancamentos_alteracoes enable row level security;
revoke all on public.lancamentos_alteracoes from anon, authenticated;
grant select on public.lancamentos_alteracoes to authenticated;
-- Só o banco escreve aqui (pelo gatilho abaixo). Quem cuida do financeiro lê tudo, inclusive o que foi apagado;
-- quem opera o caixa lê as alterações dos lançamentos que enxerga.
create policy lancamentos_alteracoes_ler on public.lancamentos_alteracoes for select to authenticated using (
  petshop_id in (select public.petshops_do_financeiro())
  or (acao = 'alterou' and exists (select 1 from public.lancamentos l where l.id = lancamento_id))
);

-- Antes de alterar ou apagar: marca o lançamento recebido como alterado e confere o que cada um pode.
-- Quem não cuida do financeiro só corrige valor, forma, categoria e descrição do que ela mesma lançou no caixa aberto,
-- e numa conta a receber só dá baixa.
create function public.proteger_recebido() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_meu_aberto boolean;
begin
  if v_user is null or pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and old.pago and (
       new.valor is distinct from old.valor or new.forma is distinct from old.forma or new.pagamentos is distinct from old.pagamentos
       or new.tipo is distinct from old.tipo or new.data is distinct from old.data or new.pago is distinct from old.pago
       or new.caixa_id is distinct from old.caixa_id or new.movimento is distinct from old.movimento
       or new.categoria is distinct from old.categoria or new.descricao is distinct from old.descricao or new.itens is distinct from old.itens) then
    new.alterado_em := clock_timestamp();
  elsif tg_op = 'UPDATE' then
    new.alterado_em := old.alterado_em;
  end if;
  -- as rotinas da creche (mensalidades) fazem as próprias conferências
  if coalesce(current_setting('maestro.creche', true), '') = '1' or public.cuido_do_financeiro(old.petshop_id) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  v_meu_aberto := old.criado_por = v_user and old.caixa_id is not null
    and exists (select 1 from public.caixas c where c.id = old.caixa_id and c.fechado_em is null);
  if tg_op = 'DELETE' then
    if old.pago and not coalesce(v_meu_aberto, false) then
      raise exception 'Só o dono ou quem cuida do financeiro pode apagar um valor já recebido.';
    end if;
    return old;
  end if;
  if old.pago then
    if new.alterado_em is distinct from old.alterado_em and not coalesce(v_meu_aberto, false) then
      raise exception 'Só o dono ou quem cuida do financeiro pode alterar um valor já recebido.';
    end if;
    if new.pago is distinct from old.pago or new.data is distinct from old.data or new.tipo is distinct from old.tipo
       or new.caixa_id is distinct from old.caixa_id or new.movimento is distinct from old.movimento then
      raise exception 'Só o dono ou quem cuida do financeiro pode mudar o dia, o tipo ou o caixa de um valor já recebido.';
    end if;
  elsif new.valor is distinct from old.valor or new.tipo is distinct from old.tipo or new.categoria is distinct from old.categoria
        or new.vencimento is distinct from old.vencimento or new.itens is distinct from old.itens or new.descricao is distinct from old.descricao
        or new.movimento is distinct from old.movimento then
    raise exception 'Só o dono ou quem cuida do financeiro pode alterar uma conta a receber. Você pode dar baixa quando o cliente pagar.';
  end if;
  return new;
end $$;
create trigger proteger_recebido before update or delete on public.lancamentos
  for each row execute function public.proteger_recebido();

-- Depois de alterar ou apagar um valor recebido: anota quem, quando e o que mudou.
create function public.anotar_alteracao() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_nome text;
  v_antes jsonb := '{}';
  v_depois jsonb := '{}';
  k text;
begin
  if v_user is null or not old.pago then return null; end if;
  if not exists (select 1 from public.petshops p where p.id = old.petshop_id) then return null; end if;
  select x.nome into v_nome from public.profissionais x where x.petshop_id = old.petshop_id and x.user_id = v_user limit 1;
  if tg_op = 'DELETE' then
    insert into public.lancamentos_alteracoes (petshop_id, lancamento_id, acao, quem, quem_nome, antes)
      values (old.petshop_id, old.id, 'apagou', v_user, v_nome, to_jsonb(old));
    return null;
  end if;
  foreach k in array array['valor', 'forma', 'pagamentos', 'tipo', 'data', 'pago', 'caixa_id', 'movimento', 'categoria', 'descricao', 'itens'] loop
    if to_jsonb(new) -> k is distinct from to_jsonb(old) -> k then
      v_antes := v_antes || jsonb_build_object(k, to_jsonb(old) -> k);
      v_depois := v_depois || jsonb_build_object(k, to_jsonb(new) -> k);
    end if;
  end loop;
  if v_antes <> '{}'::jsonb then
    insert into public.lancamentos_alteracoes (petshop_id, lancamento_id, acao, quem, quem_nome, antes, depois)
      values (old.petshop_id, old.id, 'alterou', v_user, v_nome, v_antes, v_depois);
  end if;
  return null;
end $$;
create trigger anotar_alteracao after update or delete on public.lancamentos
  for each row execute function public.anotar_alteracao();
revoke execute on function public.proteger_recebido(), public.anotar_alteracao() from public, anon, authenticated;

-- ---------- atendimento concluído ou pago ----------
-- Concluído e sem dinheiro lançado: muda quem recebe (Caixa, Financeiro ou Relatórios), como antes.
-- Com pagamento, conta a receber ou pacote usado: só o dono ou quem cuida do financeiro reabre, altera ou apaga,
-- mesmo depois de reaberto. Com o pagamento num caixa já fechado: só o dono.
create or replace function public.proteger_concluido() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_conta boolean;
  v_fechado boolean;
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  select count(*) > 0, coalesce(bool_or(l.pago and c.fechado_em is not null), false) into v_conta, v_fechado
    from public.lancamentos l left join public.caixas c on c.id = l.caixa_id
    where l.agendamento_id = old.id and l.tipo = 'entrada';
  v_conta := v_conta or old.pacote_cliente_id is not null;
  if old.status <> 'concluido' and not v_conta then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and not (
       new.preco is distinct from old.preco or new.profissional_id is distinct from old.profissional_id
       or new.servico_id is distinct from old.servico_id or new.pet_id is distinct from old.pet_id
       or (old.status = 'concluido' and (new.status is distinct from old.status or new.inicio is distinct from old.inicio))) then
    return new;
  end if;
  if v_fechado then
    if not public.sou_dono(old.petshop_id) then
      raise exception 'O pagamento deste atendimento está em um caixa já fechado. Só o dono do pet shop pode reabrir, alterar ou apagar.';
    end if;
  elsif v_conta then
    if not public.cuido_do_financeiro(old.petshop_id) then
      raise exception 'Este atendimento tem pagamento lançado. Só o dono ou quem cuida do financeiro pode reabrir, alterar ou apagar.';
    end if;
  elsif not public.tenho_area(old.petshop_id, array['caixa', 'financeiro', 'relatorios']) then
    if tg_op = 'DELETE' then
      raise exception 'Este atendimento já foi concluído. Só quem cuida do financeiro pode apagar.';
    end if;
    raise exception 'Este atendimento já foi concluído. Só quem cuida do financeiro pode alterar.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- O recebimento de um atendimento (um por vez), para quem recebe: a agenda mostra se aquele horário já foi pago
-- sem abrir o histórico de recebimentos para quem só opera o caixa.
create function public.recebimentos_do_agendamento(p_agendamento uuid) returns setof public.lancamentos
language sql stable security definer set search_path = '' as $$
  select l.* from public.lancamentos l
  join public.agendamentos a on a.id = l.agendamento_id and a.petshop_id = l.petshop_id
  where a.id = p_agendamento and l.tipo = 'entrada'
    and (select public.tenho_area(a.petshop_id, array['caixa', 'financeiro', 'relatorios']))
$$;
revoke execute on function public.recebimentos_do_agendamento(uuid) from public, anon;
grant execute on function public.recebimentos_do_agendamento(uuid) to authenticated;

-- ---------- meta do mês ----------
-- A meta é assunto do financeiro: quem só opera o caixa não recebe.
create or replace function public.petshop_reservado(p uuid) returns table (id uuid, meta_mes numeric)
language sql stable security definer set search_path = '' as $$
  select x.id, x.meta_mes from public.petshops x
  where x.id = p and (select public.cuido_do_financeiro(p))
$$;

notify pgrst, 'reload schema';
