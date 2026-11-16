-- Mais de um serviço no mesmo horário (ex.: Banho + Hidratação + Corte de unha), cada um com o seu preço e a sua comissão.
-- O serviço principal continua em `agendamentos.servico_id` e `agendamentos.preco`, do jeito de sempre; os outros serviços
-- do mesmo horário ficam numa tabela filha. Horário com um serviço só não tem linha nenhuma aqui e segue igual em tudo.
-- Tudo é somado ao que existe: uma tabela nova, funções novas e a conta da comissão trocada mantendo a assinatura e dando
-- o mesmo resultado para todo horário sem serviço a mais. O aplicativo que está no ar continua funcionando.

-- ---------- os outros serviços de um horário ----------
-- A chave é um id próprio (e não o par horário + serviço) de propósito: assim a tabela não vira uma "ponte" entre
-- agendamentos e servicos para a API, e a leitura `agendamentos -> servicos(...)` que o aplicativo faz continua com um caminho só.
create table public.agendamento_servicos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  agendamento_id uuid not null,
  servico_id uuid not null,
  preco numeric(10, 2) check (preco is null or (preco >= 0 and preco <= 99999.99)),
  ordem smallint not null default 0,
  criado_em timestamptz not null default now(),
  unique (agendamento_id, servico_id),
  foreign key (agendamento_id, petshop_id) references public.agendamentos (id, petshop_id) on delete cascade,
  foreign key (servico_id, petshop_id) references public.servicos (id, petshop_id)
);
create index on public.agendamento_servicos (petshop_id);
create index on public.agendamento_servicos (servico_id);

-- Quem lê e quem grava: igual ao horário. Lê quem é da equipe; grava quem marca (Agenda) e quem fecha a conta
-- (Caixa ou Financeiro), porque mexer nos serviços de um horário é alterar o horário.
alter table public.agendamento_servicos enable row level security;
revoke all on public.agendamento_servicos from anon, authenticated;
grant select, insert, update, delete on public.agendamento_servicos to authenticated;
create policy agendamento_servicos_ler on public.agendamento_servicos for select to authenticated
  using (petshop_id in (select public.meus_petshops()));
create policy agendamento_servicos_criar on public.agendamento_servicos for insert to authenticated
  with check ((select public.tenho_area(petshop_id, array['agenda', 'caixa', 'financeiro'])) and (select public.acesso_liberado(petshop_id)));
create policy agendamento_servicos_editar on public.agendamento_servicos for update to authenticated
  using ((select public.tenho_area(petshop_id, array['agenda', 'caixa', 'financeiro'])) and (select public.acesso_liberado(petshop_id)))
  with check (petshop_id in (select public.meus_petshops()));
create policy agendamento_servicos_remover on public.agendamento_servicos for delete to authenticated
  using ((select public.tenho_area(petshop_id, array['agenda', 'caixa', 'financeiro'])) and (select public.acesso_liberado(petshop_id)));

-- Atendimento concluído ou com dinheiro lançado: os outros serviços dele seguem a mesma proteção do horário
-- (proteger_concluido). Concluído sem dinheiro: muda quem recebe. Com pagamento, conta a receber ou pacote usado:
-- só o dono ou quem cuida do financeiro. Com o pagamento num caixa já fechado: só o dono.
create function public.proteger_servicos_do_concluido() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  a public.agendamentos;
  v_conta boolean;
  v_fechado boolean;
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.agendamento_id is distinct from old.agendamento_id or new.petshop_id is distinct from old.petshop_id) then
    raise exception 'Um serviço não muda de um horário para outro. Tire daqui e junte no outro horário.';
  end if;
  if tg_op = 'UPDATE' and new.preco is not distinct from old.preco and new.servico_id is not distinct from old.servico_id then
    return new;
  end if;
  if tg_op = 'DELETE' then
    select * into a from public.agendamentos x where x.id = old.agendamento_id;
  else
    select * into a from public.agendamentos x where x.id = new.agendamento_id;
  end if;
  if not found then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  select count(*) > 0, coalesce(bool_or(l.pago and c.fechado_em is not null), false) into v_conta, v_fechado
    from public.lancamentos l left join public.caixas c on c.id = l.caixa_id
    where l.agendamento_id = a.id and l.tipo = 'entrada';
  v_conta := v_conta or a.pacote_cliente_id is not null;
  if a.status <> 'concluido' and not v_conta then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if v_fechado then
    if not public.sou_dono(a.petshop_id) then
      raise exception 'O pagamento deste atendimento está em um caixa já fechado. Só o dono do pet shop pode mudar os serviços dele.';
    end if;
  elsif v_conta then
    if not public.cuido_do_financeiro(a.petshop_id) then
      raise exception 'Este atendimento tem pagamento lançado. Só o dono ou quem cuida do financeiro pode mudar os serviços dele.';
    end if;
  elsif not public.tenho_area(a.petshop_id, array['caixa', 'financeiro', 'relatorios']) then
    raise exception 'Este atendimento já foi concluído. Só quem cuida do financeiro pode mudar os serviços dele.';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
create trigger proteger_servicos_do_concluido before insert or update or delete on public.agendamento_servicos
  for each row execute function public.proteger_servicos_do_concluido();
revoke execute on function public.proteger_servicos_do_concluido() from public, anon, authenticated;

-- Deixa os outros serviços de um horário iguais à lista recebida ([{servico_id, preco}], na ordem), numa operação só:
-- tira os que saíram, junta os novos e acerta o preço dos que ficaram. Roda com as permissões de quem chama
-- (as regras da tabela e a proteção de atendimento concluído valem). O serviço principal do horário não entra na lista.
create function public.agendamento_servicos_definir(p_agendamento uuid, p_servicos jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  a public.agendamentos;
  x jsonb;
  v_ids uuid[] := '{}';
  v_id uuid;
  v_preco numeric;
  v_ordem smallint := 0;
begin
  select * into a from public.agendamentos g where g.id = p_agendamento;
  if not found then raise exception 'Horário não encontrado.'; end if;
  if p_servicos is not null and jsonb_typeof(p_servicos) <> 'array' then raise exception 'Confira os serviços do horário.'; end if;
  if jsonb_array_length(coalesce(p_servicos, '[]'::jsonb)) > 10 then raise exception 'Um horário aceita até dez serviços a mais.'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_servicos, '[]'::jsonb)) loop
    begin
      v_id := (x ->> 'servico_id')::uuid;
      v_preco := round((x ->> 'preco')::numeric, 2);
    exception when others then raise exception 'Confira os serviços do horário.';
    end;
    if v_id is null then raise exception 'Confira os serviços do horário.'; end if;
    if v_id = a.servico_id or v_id = any (v_ids) then continue; end if;
    v_ids := v_ids || v_id;
  end loop;
  delete from public.agendamento_servicos s where s.agendamento_id = a.id and not (s.servico_id = any (v_ids));
  for x in select * from jsonb_array_elements(coalesce(p_servicos, '[]'::jsonb)) loop
    v_id := (x ->> 'servico_id')::uuid;
    if not (v_id = any (v_ids)) then continue; end if;
    v_ids := array_remove(v_ids, v_id);
    v_preco := round((x ->> 'preco')::numeric, 2);
    v_ordem := v_ordem + 1;
    insert into public.agendamento_servicos (petshop_id, agendamento_id, servico_id, preco, ordem)
      values (a.petshop_id, a.id, v_id, v_preco, v_ordem)
      on conflict (agendamento_id, servico_id) do update set preco = excluded.preco, ordem = excluded.ordem
      where public.agendamento_servicos.preco is distinct from excluded.preco or public.agendamento_servicos.ordem is distinct from excluded.ordem;
  end loop;
  return v_ordem;
end $$;
revoke execute on function public.agendamento_servicos_definir(uuid, jsonb) from public, anon;
grant execute on function public.agendamento_servicos_definir(uuid, jsonb) to authenticated;

-- ---------- quanto foi cobrado por cada serviço ----------
-- Divide a parte de serviço de uma conta (`p_total`, já com o desconto rateado) entre os serviços do horário.
-- Peso de cada serviço: o valor da linha dele na conta (as linhas de serviço guardam `servico_id`; linha sem ele, ou de um
-- serviço que não está mais no horário, é do serviço principal). Conta sem itens: pesa pelo preço combinado na agenda
-- (com pacote, o principal fica de fora: ele foi pago pelo pacote). Cada parte é arredondada em centavos e o centavo que
-- sobra vai para a maior (empate: a primeira, com o principal na frente). A soma das partes é sempre `p_total`.
-- É a mesma conta do aplicativo (partesPorServico).
create function public.partes_por_servico(p_agendamento uuid, p_total numeric, p_itens jsonb, p_com_itens boolean)
returns table (servico_id uuid, valor numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  a public.agendamentos;
  v_ids uuid[] := '{}';
  v_pesos numeric[] := '{}';
  x jsonb;
  e record;
  q numeric;
  v numeric;
  v_sid uuid;
  v_pos int;
  v_soma numeric := 0;
  v_dado numeric := 0;
  v_maior int := 1;
  i int;
begin
  select * into a from public.agendamentos g where g.id = p_agendamento;
  if not found then return; end if;
  -- o principal na frente (mesmo sem serviço escolhido), depois os outros na ordem
  v_ids := array[a.servico_id];
  v_pesos := array[0::numeric];
  for e in select s.servico_id, s.preco from public.agendamento_servicos s where s.agendamento_id = a.id order by s.ordem, s.servico_id loop
    v_ids := v_ids || e.servico_id;
    v_pesos := v_pesos || (case when p_com_itens then 0 else coalesce(e.preco, 0) end);
  end loop;
  if p_com_itens then
    if p_itens is not null and jsonb_typeof(p_itens) = 'array' then
      for x in select * from jsonb_array_elements(p_itens) loop
        if jsonb_typeof(x) <> 'object' or x ->> 'tipo' is distinct from 'servico' then continue; end if;
        begin
          q := coalesce((x ->> 'qtd')::numeric, 1);
          v := coalesce((x ->> 'valor')::numeric, 0);
        exception when others then continue;
        end;
        begin
          v_sid := (x ->> 'servico_id')::uuid;
        exception when others then v_sid := null;
        end;
        v_pos := 1;
        if v_sid is not null then
          for i in 2..coalesce(array_length(v_ids, 1), 1) loop
            if v_ids[i] = v_sid then v_pos := i; exit; end if;
          end loop;
        end if;
        v_pesos[v_pos] := v_pesos[v_pos] + greatest(0, q * v);
      end loop;
    end if;
  elsif a.pacote_cliente_id is null then
    v_pesos[1] := coalesce(a.preco, 0);
  end if;
  for i in 1..array_length(v_pesos, 1) loop
    v_soma := v_soma + v_pesos[i];
    if v_pesos[i] > v_pesos[v_maior] then v_maior := i; end if;
  end loop;
  if v_soma <= 0 then
    servico_id := v_ids[1]; valor := p_total; return next;
    return;
  end if;
  for i in 1..array_length(v_pesos, 1) loop
    v_pesos[i] := round(p_total * v_pesos[i] / v_soma, 2);
    v_dado := v_dado + v_pesos[i];
  end loop;
  v_pesos[v_maior] := v_pesos[v_maior] + (p_total - v_dado);
  for i in 1..array_length(v_pesos, 1) loop
    if v_pesos[i] <> 0 or i = v_maior then
      servico_id := v_ids[i]; valor := v_pesos[i]; return next;
    end if;
  end loop;
end $$;
revoke execute on function public.partes_por_servico(uuid, numeric, jsonb, boolean) from public, anon, authenticated;

-- ---------- comissão: cada serviço do horário pela sua regra ----------
-- Mesma assinatura e, para horário com um serviço só, exatamente a mesma conta de antes.
-- Horário com outros serviços:
--   com conta fechada: a parte de serviço da conta é dividida entre os serviços (partes_por_servico) e cada parte rende
--     o percentual do seu serviço (com "comissão por serviço" ligada) ou o da pessoa; se o principal foi pelo pacote,
--     ele soma o preço da agenda, como todo atendimento de pacote;
--   sem conta fechada: cada serviço conta pelo preço combinado na agenda.
-- Extras e produtos da conta seguem como antes (os extras, pelo percentual do serviço principal).
create or replace function public.comissao_calcular(p_petshop uuid, p_de date, p_ate date, p_profissional uuid default null)
returns table (profissional_id uuid, atendimentos integer, com_pacote integer, base numeric, base_produtos numeric, comissao_servicos numeric, comissao_produtos numeric, comissao numeric)
language sql stable security definer set search_path = '' as $$
  with s as (
    select coalesce(x.fuso, 'America/Sao_Paulo') as fuso,
      coalesce(x.opcoes -> 'comissao.em_extras' = 'true'::jsonb, false) as em_extras,
      coalesce(x.opcoes -> 'comissao.por_servico' = 'true'::jsonb, false) as por_servico,
      case when coalesce(x.opcoes -> 'comissao.em_produtos' = 'true'::jsonb, false) and jsonb_typeof(x.opcoes -> 'comissao.produtos_pct') = 'number'
        then least(100, greatest(0, (x.opcoes ->> 'comissao.produtos_pct')::numeric)) else 0 end as produtos_pct
    from public.petshops x where x.id = p_petshop
  ), ags as (
    select a.id, a.profissional_id, a.preco, a.pacote_cliente_id, p.comissao_pct, s.por_servico,
      l.id as conta_id, l.itens, pt.servico as parte_servico, coalesce(l.valor_original, l.valor) as valor_conta,
      exists (select 1 from public.agendamento_servicos e where e.agendamento_id = a.id) as varios,
      (l.id is null and a.pacote_cliente_id is not null) as pacote,
      case when l.id is not null then coalesce(pt.servico, coalesce(l.valor_original, l.valor)) else coalesce(a.preco, 0) end as base_servico,
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
    where p_profissional is null or a.profissional_id = p_profissional
  ), contas as (
    select g.profissional_id, g.produtos, g.produtos_pct,
      (g.pacote or (g.varios and g.pacote_cliente_id is not null)) as pacote,
      case when not g.varios then g.base_servico + g.base_extra
        else g.base_extra + coalesce(v.base, 0) + case when g.conta_id is null or g.pacote_cliente_id is not null then coalesce(g.preco, 0) else 0 end
      end as base,
      case when not g.varios then (g.base_servico + g.base_extra) * g.pct
        else g.base_extra * g.pct + coalesce(v.pontos, 0) + case when g.conta_id is null or g.pacote_cliente_id is not null then coalesce(g.preco, 0) * g.pct else 0 end
      end as pontos
    from ags g
    left join lateral (
      -- cada serviço do horário com o valor dele e o percentual que vale para ele
      select sum(r.valor) as base, sum(r.valor * case when g.por_servico then coalesce(c2.pct, g.comissao_pct) else g.comissao_pct end) as pontos
      from (
        select t.servico_id, t.valor from public.partes_por_servico(g.id, g.base_servico, g.itens, g.parte_servico is not null) t where g.conta_id is not null
        union all
        select e.servico_id, coalesce(e.preco, 0) from public.agendamento_servicos e where g.conta_id is null and e.agendamento_id = g.id
      ) r
      left join public.comissao_servicos c2 on c2.servico_id = r.servico_id
    ) v on g.varios
  )
  select g.profissional_id, count(*)::integer, (count(*) filter (where g.pacote))::integer,
    round(sum(g.base), 2), round(sum(g.produtos), 2),
    round(sum(g.pontos / 100), 2), round(sum(g.produtos) * max(g.produtos_pct) / 100, 2),
    round(sum(g.pontos / 100), 2) + round(sum(g.produtos) * max(g.produtos_pct) / 100, 2)
  from contas g group by g.profissional_id
$$;
revoke execute on function public.comissao_calcular(uuid, date, date, uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
