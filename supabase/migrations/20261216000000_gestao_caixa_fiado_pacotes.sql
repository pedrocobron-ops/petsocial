-- Caixa, fiado, comprovante, descontos e pacotes (achados das testadoras Neide e Bia, rodada final).
--
-- O que entra (só acrescenta, menos as trocas listadas no fim deste cabeçalho):
--
-- A. Comprovante do atendimento com o que entrou junto para o fiado (Neide, M1)
--    * lancamentos_entregue: quanto o cliente entregou em dinheiro ("Recebeu quanto?") numa conta, para o comprovante dizer o
--      troco depois. Só guarda (comprovante_guardar_entregue); quem lê é comprovante_do_agendamento.
--    * comprovante_do_agendamento(agendamento): para quem recebe (Caixa, Financeiro, Relatórios), o que entrou na mesma operação
--      para as contas antigas do tutor (a baixa de cada conta é anotada em operacoes_feitas com a chave
--      "<chave da conta>:antiga:<id da conta antiga>"): quanto, como (forma e partes) e quanto ficou faltando; e o dinheiro entregue.
--
-- B. Pacote com preço por porte (Neide)
--    * pacotes.precos_porte (jsonb, opcional): {"P": 160, "M": 180, "G": 200, "GG": 220}. Sem leitura pela API (como pacotes.preco):
--      quem tem Pacotes, Financeiro ou Relatórios lê por precos_porte_dos_pacotes(p).
--    * anotar_preco_do_pacote: o preço "da lista" na venda é o do porte do pet (sem preço para o porte: o preço único).
--
-- C. Promoção de aniversário do pet (Neide)
--    * promocoes.aniversario: a promoção só vale quando o horário cai de 7 dias antes a 7 dias depois do aniversário do pet
--      (pets.nascimento; o ano não importa). Continua tendo dias da semana, hora, serviços e % ou R$ como as outras.
--    * promo_do_horario_do_pet(petshop, serviço, pet, início, criado até): a de promo_do_horario, mais as de aniversário do pet.
--
-- Trocas (cópia fiel da versão mais nova, com o acréscimo indicado):
--    * anotar_preco_do_pacote (20261152): preço da lista pelo porte do pet.
--    * promo_do_horario (20261207): deixa de fora as promoções de aniversário (sem o pet não dá para saber).
--    * agendamentos_promo (20261205): usa promo_do_horario_do_pet (com o pet do horário).
--    * promocao_salvar (20261207): grava também `aniversario`.
--    * link_promocoes (20261207): o link não mostra as promoções de aniversário (valem só para o pet do aniversário).

-- =====================================================================================================================
-- A. Comprovante
-- =====================================================================================================================

create table if not exists public.lancamentos_entregue (
  lancamento_id uuid primary key references public.lancamentos (id) on delete cascade,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  entregue numeric(10, 2) not null check (entregue > 0 and entregue < 100000000),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now()
);
alter table public.lancamentos_entregue enable row level security;
revoke all on public.lancamentos_entregue from anon, authenticated;

-- Guarda quanto o cliente entregou em dinheiro numa conta já recebida (uma vez; a segunda chamada não muda nada).
create or replace function public.comprovante_guardar_entregue(p_lancamento uuid, p_entregue numeric) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  l public.lancamentos;
begin
  select * into l from public.lancamentos x where x.id = p_lancamento;
  if not found or not public.tenho_area(l.petshop_id, array['caixa', 'financeiro', 'relatorios']) then raise exception 'Lançamento não encontrado.'; end if;
  if l.tipo <> 'entrada' or not l.pago then raise exception 'Só uma entrada já recebida.'; end if;
  if p_entregue is null or p_entregue <= 0 or p_entregue >= 100000000 then raise exception 'Confira o valor entregue.'; end if;
  insert into public.lancamentos_entregue (lancamento_id, petshop_id, entregue, criado_por)
    values (l.id, l.petshop_id, round(p_entregue, 2), (select auth.uid()))
    on conflict (lancamento_id) do nothing;
  return found;
end $$;
revoke execute on function public.comprovante_guardar_entregue(uuid, numeric) from public, anon;
grant execute on function public.comprovante_guardar_entregue(uuid, numeric) to authenticated;

-- O que o comprovante de um atendimento precisa além das entradas dele (recebimentos_do_agendamento):
-- {"entregue": 100, "antigas": [{"conta": id, "descricao": "...", "recebido": 25, "falta": 30, "forma": "dinheiro", "pagamentos": [...]}]}
create or replace function public.comprovante_do_agendamento(p_agendamento uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_petshop uuid;
  v_antigas jsonb := '[]'::jsonb;
  v_entregue numeric;
  l record;
  o record;
  v_conta uuid;
  v_pago public.lancamentos;
  v_desc text;
begin
  select a.petshop_id into v_petshop from public.agendamentos a where a.id = p_agendamento;
  if v_petshop is null or not public.tenho_area(v_petshop, array['caixa', 'financeiro', 'relatorios']) then return null; end if;
  for l in
    select x.id, x.chave from public.lancamentos x
     where x.agendamento_id = p_agendamento and x.petshop_id = v_petshop and x.tipo = 'entrada' and x.pago
     order by x.criado_em, x.id
  loop
    if v_entregue is null then
      select e.entregue into v_entregue from public.lancamentos_entregue e where e.lancamento_id = l.id;
    end if;
    if l.chave is null then continue; end if;
    for o in
      select f.chave, f.resultado from public.operacoes_feitas f
       where f.petshop_id = v_petshop and left(f.chave, char_length(l.chave) + 8) = l.chave || ':antiga:'
       order by f.criado_em, f.chave
    loop
      begin
        v_conta := substr(o.chave, char_length(l.chave) + 9)::uuid;
      exception when others then continue;
      end;
      -- a parte paga (conta recebida em parte) ou a própria conta (recebida inteira): a forma e as partes de cada forma
      v_pago := null;
      if (o.resultado ->> 'parte_id') is not null then
        select * into v_pago from public.lancamentos x where x.id = (o.resultado ->> 'parte_id')::uuid and x.petshop_id = v_petshop;
      else
        select * into v_pago from public.lancamentos x where x.id = v_conta and x.petshop_id = v_petshop and x.pago;
      end if;
      select coalesce(nullif(btrim(x.descricao), ''), x.categoria) into v_desc from public.lancamentos x where x.id = v_conta;
      v_antigas := v_antigas || jsonb_build_array(jsonb_build_object(
        'conta', v_conta, 'descricao', coalesce(v_desc, 'Conta de antes'),
        'recebido', coalesce((o.resultado ->> 'recebido')::numeric, 0), 'falta', greatest(coalesce((o.resultado ->> 'falta')::numeric, 0), 0),
        'forma', v_pago.forma, 'pagamentos', v_pago.pagamentos));
    end loop;
  end loop;
  return jsonb_build_object('entregue', v_entregue, 'antigas', v_antigas);
end $$;
revoke execute on function public.comprovante_do_agendamento(uuid) from public, anon;
grant execute on function public.comprovante_do_agendamento(uuid) to authenticated;

-- =====================================================================================================================
-- A2. Fiado trazido do caderno: vence no dia anotado (Neide, M2)
-- =====================================================================================================================
-- A tela agora grava a dívida do caderno com o vencimento no dia em que ela começou ("deve desde"), ou no dia da importação
-- quando o caderno não dizia a data. As que já foram trazidas ganharam "importação + 7 dias": voltam para o dia certo.
-- (A importação do caderno grava com a chave "<operação>:divida:<linha>"; só essas contas, ainda em aberto, mudam.)
do $$
begin
  perform set_config('maestro.creche', '1', true);
  update public.lancamentos l
     set vencimento = least(l.vencimento, coalesce(l.devido_desde, (l.criado_em at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date)),
         data = least(l.data, coalesce(l.devido_desde, (l.criado_em at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date))
    from public.petshops s
   where s.id = l.petshop_id and not l.pago and l.tipo = 'entrada' and l.chave like '%:divida:%' and l.vencimento is not null
     and l.vencimento > coalesce(l.devido_desde, (l.criado_em at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date);
  perform set_config('maestro.creche', '', true);
end $$;

-- =====================================================================================================================
-- A3. De onde veio o dinheiro de uma conta com abatimento (Bia, M3)
-- =====================================================================================================================
-- Troca de partes_do_lancamento (20261142), a mesma conta de partesDoLancamento (dinheiro.ts): linha negativa (sinal já pago,
-- crédito usado, promoção da diária) abate primeiro o serviço (diárias), depois produtos, depois extras. Antes ela era ignorada
-- e o que faltava era rateado: R$ 260 de diárias + R$ 40 de taxa − R$ 78 de sinal = R$ 222 mostrava a taxa como R$ 29,60.
-- Conta sem linha negativa: igual a antes.
create or replace function public.partes_do_lancamento(p_valor numeric, p_itens jsonb) returns table (servico numeric, produto numeric, extra numeric)
language plpgsql immutable set search_path = '' as $$
declare
  x jsonb;
  q numeric;
  v numeric;
  b_s numeric := 0; b_p numeric := 0; b_e numeric := 0;
  v_abate numeric := 0;
  v_tira numeric;
  v_soma numeric;
  v_sobra numeric;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then return next; return; end if;
  for x in select * from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(x) <> 'object' then continue; end if;
    begin
      q := coalesce((x ->> 'qtd')::numeric, 1);
      v := coalesce((x ->> 'valor')::numeric, 0);
    exception when others then continue;
    end;
    if q * v < 0 then v_abate := v_abate - q * v;
    elsif x ->> 'tipo' = 'servico' then b_s := b_s + q * v;
    elsif x ->> 'tipo' = 'produto' then b_p := b_p + q * v;
    else b_e := b_e + q * v;
    end if;
  end loop;
  v_tira := least(b_s, v_abate); b_s := b_s - v_tira; v_abate := v_abate - v_tira;
  v_tira := least(b_p, v_abate); b_p := b_p - v_tira; v_abate := v_abate - v_tira;
  v_tira := least(b_e, v_abate); b_e := b_e - v_tira; v_abate := v_abate - v_tira;
  v_soma := b_s + b_p + b_e;
  if v_soma <= 0 then return next; return; end if;
  servico := round(b_s / v_soma * p_valor, 2);
  produto := round(b_p / v_soma * p_valor, 2);
  extra := round(b_e / v_soma * p_valor, 2);
  v_sobra := p_valor - servico - produto - extra;
  if v_sobra <> 0 then
    if produto > servico and produto >= extra then produto := produto + v_sobra;
    elsif extra > servico and extra > produto then extra := extra + v_sobra;
    else servico := servico + v_sobra;
    end if;
  end if;
  return next;
end $$;
revoke execute on function public.partes_do_lancamento(numeric, jsonb) from public, anon, authenticated;

-- =====================================================================================================================
-- B. Pacote com preço por porte (Neide: "tive de criar 4 banhos porte pequeno, e seriam outros modelos para M e G")
-- =====================================================================================================================
-- pacotes.precos_porte: {"P": 160, "M": 180, "G": 200, "GG": 220} (só os portes que o dono preencheu). Na venda, o preço
-- da lista é o do porte do pet; pet sem porte (ou porte sem preço): o preço único (pacotes.preco), como sempre.
-- Como pacotes.preco, a coluna não sai pela API: quem tem Pacotes, Financeiro ou Relatórios lê por precos_porte_dos_pacotes.

alter table public.pacotes add column if not exists precos_porte jsonb;
create or replace function public.precos_porte_valido(p jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select jsonb_typeof(p) = 'object' and not exists (
    select 1 from jsonb_each(p) e
     where e.key not in ('P', 'M', 'G', 'GG') or jsonb_typeof(e.value) <> 'number'
        or (e.value #>> '{}')::numeric < 0 or (e.value #>> '{}')::numeric > 99999.99)
$$;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pacotes_precos_porte_check') then
    alter table public.pacotes add constraint pacotes_precos_porte_check check (precos_porte is null or public.precos_porte_valido(precos_porte));
  end if;
end $$;

create or replace function public.precos_porte_dos_pacotes(p uuid) returns table (id uuid, precos_porte jsonb)
language sql stable security definer set search_path = '' as $$
  select x.id, x.precos_porte from public.pacotes x
   where x.petshop_id = p and x.precos_porte is not null and (select public.tenho_area(p, array['pacotes', 'financeiro', 'relatorios']))
$$;
revoke execute on function public.precos_porte_dos_pacotes(uuid) from public, anon;
grant execute on function public.precos_porte_dos_pacotes(uuid) to authenticated;

-- Cópia fiel de anotar_preco_do_pacote (20261152), mais: o preço da lista é o do porte do pet (sem preço para o porte: o único).
create or replace function public.anotar_preco_do_pacote() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_nome text;
  v_tabela numeric;
  v_travado boolean;
  v_fin boolean;
begin
  if v_user is null then return null; end if;
  -- quem não recebe não vê nem digita preço: nada a comparar
  if not public.tenho_area(new.petshop_id, array['caixa', 'financeiro', 'relatorios']) then return null; end if;
  select coalesce(s.opcoes -> 'dinheiro.preco_travado' = 'true'::jsonb, false) into v_travado from public.petshops s where s.id = new.petshop_id;
  v_fin := public.cuido_do_financeiro(new.petshop_id);
  if new.pacote_id is null then
    if v_travado and not v_fin then raise exception 'Com o preço travado, venda um pacote da lista. Pacote com preço livre é com o dono ou com quem vê o financeiro.'; end if;
    return null;
  end if;
  select coalesce((m.precos_porte ->> pt.porte)::numeric, m.preco) into v_tabela
    from public.pacotes m left join public.pets pt on pt.id = new.pet_id and pt.petshop_id = new.petshop_id
   where m.id = new.pacote_id and m.petshop_id = new.petshop_id;
  if v_tabela is null or abs(new.preco - v_tabela) <= 0.005 then return null; end if;
  if v_travado and not v_fin then
    raise exception 'O preço deste pacote é %. Só o dono ou quem vê o financeiro muda o preço na venda.', 'R$ ' || replace(to_char(v_tabela, 'FM999999990D00'), '.', ',');
  end if;
  select x.nome into v_nome from public.profissionais x where x.petshop_id = new.petshop_id and x.user_id = v_user limit 1;
  insert into public.precos_alterados (petshop_id, pacote_cliente_id, tipo, item, de, para, quem, quem_nome)
    values (new.petshop_id, new.id, 'preco', left('Pacote ' || new.nome, 120), v_tabela, new.preco, v_user, v_nome);
  return null;
end $$;
revoke execute on function public.anotar_preco_do_pacote() from public, anon, authenticated;

-- =====================================================================================================================
-- C. Promoção de aniversário do pet (Neide: "na semana do aniversário, o horário já vem com Parabéns −10%")
-- =====================================================================================================================
-- Opcional: o dono liga numa promoção ("Só perto do aniversário do pet"). Ela vale nos horários de banho e tosa que caem de
-- 7 dias antes a 7 dias depois do aniversário do pet (pets.nascimento; o ano não importa; 29/02 vale como 28/02 em ano
-- comum). Pet sem data de nascimento não ganha. A equipe tira do horário como qualquer promoção.

alter table public.promocoes add column if not exists aniversario boolean not null default false;

-- O dia `p_dia` cai a até `p_janela` dias do aniversário (dia e mês de `p_nascimento`), em qualquer ano (perto da virada também).
create or replace function public.niver_perto(p_nascimento date, p_dia date, p_janela integer default 7) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  y integer;
  d date;
begin
  if p_nascimento is null or p_dia is null then return false; end if;
  for y in extract(year from p_dia)::int - 1 .. extract(year from p_dia)::int + 1 loop
    begin
      d := make_date(y, extract(month from p_nascimento)::int, extract(day from p_nascimento)::int);
    exception when others then
      d := make_date(y, 2, 28); -- 29/02 em ano comum
    end;
    if abs(p_dia - d) <= coalesce(p_janela, 7) then return true; end if;
  end loop;
  return false;
end $$;
revoke execute on function public.niver_perto(date, date, integer) from public, anon, authenticated;

-- Cópia fiel de promo_do_horario (20261207), mais: sem o pet, a promoção de aniversário fica de fora.
create or replace function public.promo_do_horario(p_petshop uuid, p_servico uuid, p_porte text, p_inicio timestamptz, p_criado_ate timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fuso text; v_dia date; v_hora time; v_dow int; v_preco numeric; r jsonb;
begin
  if pg_trigger_depth() < 1 or p_servico is null or p_inicio is null then return null; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p_petshop;
  v_dia := (p_inicio at time zone v_fuso)::date;
  v_hora := (p_inicio at time zone v_fuso)::time;
  v_dow := extract(dow from v_dia)::int;
  select coalesce(case p_porte when 'P' then s.preco_p when 'M' then s.preco_m when 'G' then s.preco_g when 'GG' then s.preco_gg end,
                  s.preco_p, s.preco_m, s.preco_g, s.preco_gg, 100)
    into v_preco from public.servicos s where s.id = p_servico and s.petshop_id = p_petshop;
  select jsonb_build_object('id', x.id, 'nome', x.nome, 'tipo', x.tipo, 'valor', x.valor, 'servicos', to_jsonb(x.servicos)) into r
    from public.promocoes x
   where x.petshop_id = p_petshop and x.ativa and x.banho_tosa and not x.aniversario and x.criado_em <= coalesce(p_criado_ate, now())
     and v_dow = any (x.dias)
     and (x.hora_de is null or v_hora >= x.hora_de) and (x.hora_ate is null or v_hora < x.hora_ate)
     and (x.comeca_em is null or v_dia >= x.comeca_em) and (x.termina_em is null or v_dia <= x.termina_em)
     and public.promo_servico_entra(to_jsonb(x.servicos), p_petshop, p_servico)
   order by case x.tipo when 'pct' then round(coalesce(v_preco, 100) * x.valor / 100, 2) else least(x.valor, coalesce(v_preco, 100)) end desc, x.criado_em, x.id
   limit 1;
  return r;
end $$;

-- A de promo_do_horario para um pet: entram também as promoções de aniversário quando o horário cai perto do aniversário dele.
-- Mais de uma: a que dá mais desconto (empate: a mais antiga). Só responde de dentro de um gatilho.
create or replace function public.promo_do_horario_do_pet(p_petshop uuid, p_servico uuid, p_pet uuid, p_inicio timestamptz, p_criado_ate timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fuso text; v_dia date; v_hora time; v_dow int; v_preco numeric; v_porte text; v_nasc date; r jsonb;
begin
  if pg_trigger_depth() < 1 or p_servico is null or p_inicio is null then return null; end if;
  select x.porte, x.nascimento into v_porte, v_nasc from public.pets x where x.id = p_pet and x.petshop_id = p_petshop;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p_petshop;
  v_dia := (p_inicio at time zone v_fuso)::date;
  v_hora := (p_inicio at time zone v_fuso)::time;
  v_dow := extract(dow from v_dia)::int;
  select coalesce(case v_porte when 'P' then s.preco_p when 'M' then s.preco_m when 'G' then s.preco_g when 'GG' then s.preco_gg end,
                  s.preco_p, s.preco_m, s.preco_g, s.preco_gg, 100)
    into v_preco from public.servicos s where s.id = p_servico and s.petshop_id = p_petshop;
  select jsonb_build_object('id', x.id, 'nome', x.nome, 'tipo', x.tipo, 'valor', x.valor, 'servicos', to_jsonb(x.servicos)) into r
    from public.promocoes x
   where x.petshop_id = p_petshop and x.ativa and x.banho_tosa and x.criado_em <= coalesce(p_criado_ate, now())
     and (not x.aniversario or public.niver_perto(v_nasc, v_dia, 7))
     and v_dow = any (x.dias)
     and (x.hora_de is null or v_hora >= x.hora_de) and (x.hora_ate is null or v_hora < x.hora_ate)
     and (x.comeca_em is null or v_dia >= x.comeca_em) and (x.termina_em is null or v_dia <= x.termina_em)
     and public.promo_servico_entra(to_jsonb(x.servicos), p_petshop, p_servico)
   order by case x.tipo when 'pct' then round(coalesce(v_preco, 100) * x.valor / 100, 2) else least(x.valor, coalesce(v_preco, 100)) end desc, x.criado_em, x.id
   limit 1;
  return r;
end $$;
revoke execute on function public.promo_do_horario_do_pet(uuid, uuid, uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.promo_do_horario_do_pet(uuid, uuid, uuid, timestamptz, timestamptz) to authenticated;

-- Cópia fiel de agendamentos_promo (20261205), mais: a promoção vem de promo_do_horario_do_pet (com o pet do horário).
create or replace function public.agendamentos_promo() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_api boolean := current_user = 'authenticated';
  v_tirar boolean := false;
begin
  if tg_op = 'INSERT' then
    if v_api then
      v_tirar := coalesce(new.promo ->> 'tirada', '') = 'true';
      new.promo := null;
    elsif new.promo is not null then
      return new;
    end if;
    new.promo := public.promo_do_horario_do_pet(new.petshop_id, new.servico_id, new.pet_id, new.inicio, now());
    if v_tirar and new.promo is not null then new.promo := new.promo || '{"tirada": true}'::jsonb; end if;
    return new;
  end if;
  if not v_api then return new; end if;
  new.promo := old.promo;
  if (new.inicio is distinct from old.inicio or new.servico_id is distinct from old.servico_id)
     and new.status in ('marcado', 'confirmado') and coalesce(old.promo ->> 'tirada', '') <> 'true' then
    new.promo := public.promo_do_horario_do_pet(new.petshop_id, new.servico_id, new.pet_id, new.inicio, old.criado_em);
  end if;
  return new;
end $$;
revoke execute on function public.agendamentos_promo() from public, anon, authenticated;

-- Cópia fiel de agendamento_promo_usar (20261207), mais: ao pôr de volta sem cópia, a de aniversário só vale perto do aniversário do pet.
create or replace function public.agendamento_promo_usar(p_id uuid, p_usar boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.agendamentos; v_porte text; v_promo jsonb; v_nasc date;
begin
  select * into a from public.agendamentos x where x.id = p_id for update;
  if not found or not public.tenho_area(a.petshop_id, array['agenda', 'caixa', 'financeiro', 'relatorios']) then
    raise exception 'Horário não encontrado.' using errcode = 'P0002';
  end if;
  if not public.acesso_liberado(a.petshop_id) then raise exception 'O acesso do pet shop está bloqueado.' using errcode = '42501'; end if;
  if exists (select 1 from public.lancamentos l where l.petshop_id = a.petshop_id and l.agendamento_id = a.id and l.tipo = 'entrada' and l.movimento is null) then
    raise exception 'A conta deste horário já foi lançada: a promoção não muda mais.' using errcode = '22023';
  end if;
  if coalesce(p_usar, false) then
    if a.promo is not null then
      v_promo := a.promo - 'tirada';
    else
      select x.porte, x.nascimento into v_porte, v_nasc from public.pets x where x.id = a.pet_id and x.petshop_id = a.petshop_id;
      -- promo_do_horario só responde de dentro de um gatilho: aqui a conta é feita direto
      select jsonb_build_object('id', x.id, 'nome', x.nome, 'tipo', x.tipo, 'valor', x.valor, 'servicos', to_jsonb(x.servicos)) into v_promo
        from public.promocoes x, lateral (select coalesce(s.fuso, 'America/Sao_Paulo') as fuso from public.petshops s where s.id = a.petshop_id) f
       where x.petshop_id = a.petshop_id and x.ativa and x.banho_tosa and x.criado_em <= a.criado_em
         and (not x.aniversario or public.niver_perto(v_nasc, (a.inicio at time zone f.fuso)::date, 7))
         and extract(dow from (a.inicio at time zone f.fuso))::int = any (x.dias)
         and (x.hora_de is null or (a.inicio at time zone f.fuso)::time >= x.hora_de) and (x.hora_ate is null or (a.inicio at time zone f.fuso)::time < x.hora_ate)
         and (x.comeca_em is null or (a.inicio at time zone f.fuso)::date >= x.comeca_em) and (x.termina_em is null or (a.inicio at time zone f.fuso)::date <= x.termina_em)
         and public.promo_servico_entra(to_jsonb(x.servicos), a.petshop_id, a.servico_id)
       order by x.criado_em limit 1;
    end if;
  else
    v_promo := case when a.promo is null then null else a.promo || '{"tirada": true}'::jsonb end;
  end if;
  update public.agendamentos x set promo = v_promo where x.id = a.id;
  return v_promo;
end $$;

-- Cópia fiel de promocao_salvar (20261207), mais: `aniversario` (padrão não). A de aniversário vale só no banho e tosa.
create or replace function public.promocao_salvar(p uuid, p_id uuid, p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid; v_servicos uuid[]; v_dias smallint[]; v_nome text; v_tipo text; v_valor numeric;
  v_de time; v_ate time; v_ini date; v_fim date; v_banho boolean; v_casa text[]; v_niver boolean;
begin
  if not public.sou_dono(p) then raise exception 'Só o dono do pet shop mexe nas promoções.' using errcode = '42501'; end if;
  if not public.acesso_liberado(p) then raise exception 'O acesso do pet shop está bloqueado.' using errcode = '42501'; end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'Faltam os dados da promoção.' using errcode = '22023'; end if;
  v_nome := btrim(coalesce(p_dados ->> 'nome', ''));
  if char_length(v_nome) < 2 or char_length(v_nome) > 60 then raise exception 'Dê um nome à promoção (de 2 a 60 letras).' using errcode = '22023'; end if;
  begin
    v_dias := array(select distinct (x)::smallint from jsonb_array_elements_text(coalesce(p_dados -> 'dias', '[]'::jsonb)) x order by 1);
    v_servicos := array(select distinct (x)::uuid from jsonb_array_elements_text(coalesce(p_dados -> 'servicos', '[]'::jsonb)) x);
    v_de := nullif(p_dados ->> 'hora_de', '')::time;
    v_ate := nullif(p_dados ->> 'hora_ate', '')::time;
    v_ini := nullif(p_dados ->> 'comeca_em', '')::date;
    v_fim := nullif(p_dados ->> 'termina_em', '')::date;
    v_valor := (p_dados ->> 'valor')::numeric;
    v_banho := coalesce((p_dados ->> 'banho_tosa')::boolean, true);
    v_casa := array(select distinct x from jsonb_array_elements_text(case when jsonb_typeof(p_dados -> 'casa') = 'array' then p_dados -> 'casa' else '[]'::jsonb end) x order by 1);
    v_niver := coalesce((p_dados ->> 'aniversario')::boolean, false);
  exception when others then
    raise exception 'Confira os dados da promoção.' using errcode = '22023';
  end;
  if not (v_casa <@ array['creche', 'hotel']::text[]) then raise exception 'A promoção vale para banho e tosa, creche ou hotel.' using errcode = '22023'; end if;
  if not v_banho and cardinality(v_casa) = 0 then raise exception 'Escolha onde a promoção vale: banho e tosa, creche ou hotel.' using errcode = '22023'; end if;
  -- a de aniversário vale só no banho e tosa (é do pet do horário; creche e hotel não entram)
  if v_niver then v_banho := true; v_casa := '{}'; end if;
  if not v_banho then v_servicos := '{}'; v_de := null; v_ate := null; end if;
  if cardinality(v_dias) = 0 then raise exception 'Escolha pelo menos um dia da semana.' using errcode = '22023'; end if;
  v_tipo := p_dados ->> 'tipo';
  if v_tipo not in ('pct', 'reais') then raise exception 'Escolha se o desconto é em %% ou em reais.' using errcode = '22023'; end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Escreva o valor do desconto.' using errcode = '22023'; end if;
  if v_tipo = 'pct' and v_valor > 90 then raise exception 'O desconto pode ser de até 90%%.' using errcode = '22023'; end if;
  if v_de is not null and v_ate is not null and v_de >= v_ate then raise exception 'A hora de começo precisa ser antes da hora de fim.' using errcode = '22023'; end if;
  if v_ini is not null and v_fim is not null and v_ini > v_fim then raise exception 'A data de começo precisa ser antes da data de fim.' using errcode = '22023'; end if;
  if exists (select 1 from unnest(v_servicos) s where not exists (select 1 from public.servicos x where x.id = s and x.petshop_id = p)) then
    raise exception 'Algum serviço escolhido não é deste pet shop.' using errcode = '22023';
  end if;
  if p_id is null then
    if (select count(*) from public.promocoes x where x.petshop_id = p) >= 30 then raise exception 'Cabem até 30 promoções. Apague as que não usa mais.' using errcode = '22023'; end if;
    insert into public.promocoes (petshop_id, nome, dias, hora_de, hora_ate, servicos, tipo, valor, comeca_em, termina_em, ativa, criado_por, banho_tosa, casa, aniversario)
    values (p, v_nome, v_dias, v_de, v_ate, v_servicos, v_tipo, round(v_valor, 2), v_ini, v_fim, coalesce((p_dados ->> 'ativa')::boolean, true), (select auth.uid()), v_banho, v_casa, v_niver)
    returning id into v_id;
  else
    update public.promocoes x set nome = v_nome, dias = v_dias, hora_de = v_de, hora_ate = v_ate, servicos = v_servicos, tipo = v_tipo,
      valor = round(v_valor, 2), comeca_em = v_ini, termina_em = v_fim, ativa = coalesce((p_dados ->> 'ativa')::boolean, x.ativa), atualizado_em = now(),
      banho_tosa = v_banho, casa = v_casa, aniversario = v_niver
     where x.id = p_id and x.petshop_id = p
    returning x.id into v_id;
    if v_id is null then raise exception 'Promoção não encontrada.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

-- Cópia fiel de link_promocoes (20261207), mais: sem as de aniversário (valem só para o pet do aniversário, não para todos).
create or replace function public.link_promocoes(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'nome', x.nome, 'dias', to_jsonb(x.dias), 'hora_de', to_char(x.hora_de, 'HH24:MI'), 'hora_ate', to_char(x.hora_ate, 'HH24:MI'),
      'tipo', x.tipo, 'valor', x.valor, 'comeca_em', x.comeca_em, 'termina_em', x.termina_em,
      'banho_tosa', x.banho_tosa,
      'casa', to_jsonb(array(select c from unnest(x.casa) c where (c = 'creche' and coalesce(p.link_creche, false)) or (c = 'hotel' and coalesce(p.link_hotel, false)) order by c)),
      'servicos', case when x.banho_tosa then coalesce((select jsonb_agg(s.id order by s.ordem, s.nome) from public.servicos s
                    where s.petshop_id = p.id and s.ativo and s.categoria not in ('creche', 'hotel')
                      and public.promo_servico_entra(to_jsonb(x.servicos), p.id, s.id)), '[]'::jsonb) else '[]'::jsonb end)
      order by x.criado_em), '[]'::jsonb)
    from public.petshops p
    join public.promocoes x on x.petshop_id = p.id and x.ativa
   where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)
     and not x.aniversario
     and (x.termina_em is null or x.termina_em >= (now() at time zone p.fuso)::date)
$$;
