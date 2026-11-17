-- Promoção em dias fracos, aniversário do tutor e aviso de pacote acabando.
--
-- O que entra (só acrescenta, menos as trocas listadas no fim deste cabeçalho):
--
-- A. Promoções (o dono monta em Meu pet shop): "Terça e quarta, 10% no banho", "antes das 11h, R$ 10 off".
--    * promocoes: nome que o cliente vê, dias da semana, faixa de hora (opcional), serviços (lista vazia = todos do banho e tosa),
--      % ou R$, começo e fim (opcionais), ligada ou não. A equipe lê; só o dono grava (promocao_salvar, promocao_apagar).
--    * agendamentos.promo (jsonb): a promoção que vale para o horário, copiada na hora de marcar (nome, tipo, valor e serviços).
--      Mudar ou apagar a promoção depois não mexe nos horários já marcados. O banco põe sozinho, ao marcar (por qualquer caminho:
--      tela, Mozart, repetição, pedido do link), quando o dia, a hora e o serviço batem. Horário marcado antes de a promoção existir
--      não ganha a promoção (nem ao remarcar). A equipe não escreve a promoção pela API: só tira ou põe de volta
--      (agendamento_promo_usar), ou pede ao marcar que ela venha tirada ({"tirada": true}).
--      O preço do horário (agendamentos.preco) continua o da lista, pelas regras de sempre. A promoção é uma linha de desconto
--      na conta: "Promoção Terça do banho −10%".
--    * pedidos_agendamento.promo: o pedido do link leva a promoção que valia no horário pedido; quando o pedido é aceito,
--      o horário fica com ela (mesmo que a promoção tenha mudado depois do pedido).
--    * link_promocoes(código): para a página do link mostrar "10% off" nos horários (só nome, dias, horas, serviços e valor).
--    * Conta do atendimento: o desconto da promoção não conta como desconto dado pelo caixa (não é recusado pelo preço travado
--      nem anotado em Alterações em valores) e fica registrado em promo_usos (quanto de desconto e em qual conta).
--    * relatorio_promocoes(p, de, até): quantos horários usaram cada promoção e o desconto dado (quem vê o dinheiro).
--
-- B. Aniversário do tutor:
--    * clientes.nascimento (date, opcional). Sem o ano, guarda o ano 1904: é bissexto (cabe 29/02) e ninguém vivo nasceu nele.
--      A tela mostra só dia e mês quando o ano é 1904. (clientes tem permissão por tabela: a coluna já sai para a equipe.)
--    * Mandar mensagens ganha o tipo 'niver_tutor' (uma vez por ano, quem tem pet ativo, nascido em 29/02 recebe no dia 28/02
--      em ano que não é bissexto). O texto é do pet shop (modelos_mensagem 'chamar.niver_tutor'; vazio = texto padrão).
--
-- C. Pacote acabando:
--    * pacotes_clientes.acabou_em: quando o último uso foi marcado (o banco põe; desfazer o uso limpa).
--    * pacotes_acabando(p, pet): pacotes com 1 uso sobrando, que acabaram nos últimos 30 dias, vencendo em até 7 dias ou vencidos
--      há até 30 dias, de pets que ainda não têm outro pacote valendo. Para o aviso na ficha, no horário, na conta e em Pacotes.
--
-- Trocas (cópia fiel da versão anterior, com o acréscimo indicado):
--    * mensagens_enviadas_tipo_check: aceita também 'niver_tutor'.
--    * gestao_modo_envio (20261198): mais o bloco 'niver_tutor' e o modelo 'chamar.niver_tutor'.
--    * modo_envio_marcar (20261198): mais o tipo 'niver_tutor' (ref = o tutor; áreas Agenda, Clientes ou Creche e hotel).
--    * cliente_dados (20261199): o cadastro.csv leva o aniversário do tutor.
--    (cliente_anonimizar NÃO é trocada: um gatilho em clientes apaga o aniversário quando ela apaga os dados do tutor.)
--    * anotar_preco_da_venda (20261170): o desconto da promoção do horário sai do "desconto do caixa" e vai para promo_usos.

-- =====================================================================================================================
-- A. Promoções
-- =====================================================================================================================

create table public.promocoes (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  -- o nome que o cliente vê: "Terça do banho"
  nome text not null check (char_length(btrim(nome)) between 2 and 60),
  -- dias da semana (0 = domingo ... 6 = sábado)
  dias smallint[] not null check (cardinality(dias) between 1 and 7 and dias <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  -- faixa de hora do começo do atendimento (de: a partir de; ate: antes de). As duas em branco = o dia todo.
  hora_de time,
  hora_ate time,
  -- serviços da promoção; vazio = todos os serviços do banho e tosa
  servicos uuid[] not null default '{}' check (cardinality(servicos) <= 50),
  tipo text not null check (tipo in ('pct', 'reais')),
  valor numeric(10, 2) not null check (valor > 0 and (tipo <> 'pct' or valor <= 90) and valor <= 9999),
  comeca_em date,
  termina_em date,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  criado_por uuid,
  atualizado_em timestamptz not null default now(),
  check (hora_de is null or hora_ate is null or hora_de < hora_ate),
  check (comeca_em is null or termina_em is null or comeca_em <= termina_em)
);
create index promocoes_loja on public.promocoes (petshop_id, ativa);
alter table public.promocoes enable row level security;
revoke all on public.promocoes from public, anon, authenticated;
grant select on public.promocoes to authenticated;
create policy promocoes_ler on public.promocoes for select to authenticated
  using (petshop_id in (select public.meus_petshops()));

-- o desconto de cada promoção dado em cada conta (o banco grava, na conta do atendimento)
create table public.promo_usos (
  id bigint generated always as identity primary key,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  -- sem chave estrangeira: o registro fica se a promoção for apagada (o nome vai junto)
  promo_id uuid,
  promo_nome text not null,
  agendamento_id uuid references public.agendamentos (id) on delete set null,
  lancamento_id uuid references public.lancamentos (id) on delete cascade,
  desconto numeric(10, 2) not null check (desconto >= 0),
  criado_em timestamptz not null default now()
);
create index promo_usos_loja on public.promo_usos (petshop_id, criado_em);
create unique index promo_usos_lancamento on public.promo_usos (lancamento_id);
alter table public.promo_usos enable row level security;
revoke all on public.promo_usos from public, anon, authenticated;

-- a promoção do horário e a do pedido do link
alter table public.agendamentos add column if not exists promo jsonb check (promo is null or jsonb_typeof(promo) = 'object');
-- agendamentos tem a leitura coluna por coluna (20261157)
grant select (promo) on public.agendamentos to authenticated;
alter table public.pedidos_agendamento add column if not exists promo jsonb check (promo is null or jsonb_typeof(promo) = 'object');

-- ---------- ajudantes ----------
-- O serviço entra na promoção? Lista vazia = todos os serviços do banho e tosa (nem creche, nem hotel, nem loja).
create function public.promo_servico_entra(p_servicos jsonb, p_petshop uuid, p_servico uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_servico is not null and case
    when jsonb_typeof(p_servicos) = 'array' and jsonb_array_length(p_servicos) > 0 then p_servicos ? p_servico::text
    else exists (select 1 from public.servicos s where s.id = p_servico and s.petshop_id = p_petshop and s.categoria in ('banho', 'tosa', 'banho_tosa', 'outro'))
  end
$$;
revoke execute on function public.promo_servico_entra(jsonb, uuid, uuid) from public, anon, authenticated;

-- A promoção (cópia) que vale para um serviço num instante, entre as criadas até `p_criado_ate`.
-- Mais de uma: a que dá mais desconto no preço da lista para o porte (empate: a mais antiga).
-- Só responde de dentro de um gatilho (como preco_de_tabela): chamada direta pela API devolve vazio.
create function public.promo_do_horario(p_petshop uuid, p_servico uuid, p_porte text, p_inicio timestamptz, p_criado_ate timestamptz) returns jsonb
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
   where x.petshop_id = p_petshop and x.ativa and x.criado_em <= coalesce(p_criado_ate, now())
     and v_dow = any (x.dias)
     and (x.hora_de is null or v_hora >= x.hora_de) and (x.hora_ate is null or v_hora < x.hora_ate)
     and (x.comeca_em is null or v_dia >= x.comeca_em) and (x.termina_em is null or v_dia <= x.termina_em)
     and public.promo_servico_entra(to_jsonb(x.servicos), p_petshop, p_servico)
   order by case x.tipo when 'pct' then round(coalesce(v_preco, 100) * x.valor / 100, 2) else least(x.valor, coalesce(v_preco, 100)) end desc, x.criado_em, x.id
   limit 1;
  return r;
end $$;
revoke execute on function public.promo_do_horario(uuid, uuid, text, timestamptz, timestamptz) from public, anon;
grant execute on function public.promo_do_horario(uuid, uuid, text, timestamptz, timestamptz) to authenticated;

-- Quanto a promoção tira de uma conta: soma as linhas de serviço que entram na promoção (a linha sem servico_id é o serviço
-- principal do horário); % = soma × %, arredondado no centavo; R$ = o valor, até a soma. A mesma conta de descontoDaPromo
-- (src/lib/gestao/promocoes.ts).
create function public.promo_desconto(p_promo jsonb, p_petshop uuid, p_itens jsonb, p_principal uuid) returns numeric
language plpgsql stable security definer set search_path = '' as $$
declare
  v_base numeric := 0; i jsonb; v_serv uuid; v_qtd numeric;
begin
  if p_promo is null or coalesce(p_promo ->> 'tirada', '') = 'true' or jsonb_typeof(p_itens) <> 'array' then return 0; end if;
  for i in select * from jsonb_array_elements(p_itens) loop
    if jsonb_typeof(i) <> 'object' or i ->> 'tipo' <> 'servico' or jsonb_typeof(i -> 'valor') <> 'number' then continue; end if;
    v_serv := case when (i ->> 'servico_id') ~ '^[0-9a-fA-F-]{36}$' then (i ->> 'servico_id')::uuid else p_principal end;
    v_qtd := case when jsonb_typeof(i -> 'qtd') = 'number' then (i ->> 'qtd')::numeric else 1 end;
    if public.promo_servico_entra(p_promo -> 'servicos', p_petshop, v_serv) then
      v_base := v_base + round(v_qtd * (i ->> 'valor')::numeric, 2);
    end if;
  end loop;
  if v_base <= 0 then return 0; end if;
  if p_promo ->> 'tipo' = 'pct' then return round(v_base * (p_promo ->> 'valor')::numeric / 100, 2); end if;
  return least((p_promo ->> 'valor')::numeric, v_base);
end $$;
revoke execute on function public.promo_desconto(jsonb, uuid, jsonb, uuid) from public, anon, authenticated;

-- ---------- o horário ganha a promoção ao ser marcado ----------
-- Roda como quem grava (sem security definer) para saber se veio da API (authenticated) ou de uma função do banco.
--  * marcar pela API: o banco põe a promoção que vale (o que veio no campo é ignorado; {"tirada": true} = marcar sem ela).
--  * marcar por uma função do banco (pedido do link, repetição): sem promoção no campo, o banco põe a que vale.
--  * alterar pela API: a promoção não muda pelo campo. Remarcou (dia, hora ou serviço) um horário ainda por fazer: vale a
--    promoção do novo dia e hora, entre as que já existiam quando o horário foi marcado. Promoção tirada continua tirada.
create function public.agendamentos_promo() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_api boolean := current_user = 'authenticated';
  v_tirar boolean := false;
  v_porte text;
begin
  if tg_op = 'INSERT' then
    if v_api then
      v_tirar := coalesce(new.promo ->> 'tirada', '') = 'true';
      new.promo := null;
    elsif new.promo is not null then
      return new;
    end if;
    select x.porte into v_porte from public.pets x where x.id = new.pet_id and x.petshop_id = new.petshop_id;
    new.promo := public.promo_do_horario(new.petshop_id, new.servico_id, v_porte, new.inicio, now());
    if v_tirar and new.promo is not null then new.promo := new.promo || '{"tirada": true}'::jsonb; end if;
    return new;
  end if;
  if not v_api then return new; end if;
  new.promo := old.promo;
  if (new.inicio is distinct from old.inicio or new.servico_id is distinct from old.servico_id)
     and new.status in ('marcado', 'confirmado') and coalesce(old.promo ->> 'tirada', '') <> 'true' then
    select x.porte into v_porte from public.pets x where x.id = new.pet_id and x.petshop_id = new.petshop_id;
    new.promo := public.promo_do_horario(new.petshop_id, new.servico_id, v_porte, new.inicio, old.criado_em);
  end if;
  return new;
end $$;
revoke execute on function public.agendamentos_promo() from public, anon, authenticated;
create trigger agendamentos_promo before insert or update on public.agendamentos
  for each row execute function public.agendamentos_promo();

-- ---------- o pedido do link leva a promoção ----------
create function public.pedidos_promo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.promo := case when new.tipo = 'servico' then public.promo_do_horario(new.petshop_id, new.servico_id, new.porte, new.inicio, now()) end;
  return new;
end $$;
revoke execute on function public.pedidos_promo() from public, anon, authenticated;
create trigger pedidos_promo before insert on public.pedidos_agendamento
  for each row execute function public.pedidos_promo();

-- pedido aceito: o horário fica com a promoção do pedido (a que o cliente viu), menos se alguém já tirou
create function public.pedidos_promo_aceito() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.promo is not null and new.agendamento_id is not null and old.agendamento_id is null then
    update public.agendamentos a set promo = new.promo
     where a.id = new.agendamento_id and a.petshop_id = new.petshop_id
       and coalesce(a.promo ->> 'tirada', '') <> 'true' and a.promo is distinct from new.promo;
  end if;
  return null;
end $$;
revoke execute on function public.pedidos_promo_aceito() from public, anon, authenticated;
create trigger pedidos_promo_aceito after update of agendamento_id on public.pedidos_agendamento
  for each row execute function public.pedidos_promo_aceito();

-- ---------- o dono monta as promoções ----------
-- p_dados: { nome, dias: [2, 3], hora_de: "08:00" | null, hora_ate: "11:00" | null, servicos: [uuid] (vazio = todos do banho e tosa),
--            tipo: "pct" | "reais", valor, comeca_em, termina_em, ativa }. p_id null = nova. Devolve o id.
create function public.promocao_salvar(p uuid, p_id uuid, p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid; v_servicos uuid[]; v_dias smallint[]; v_nome text; v_tipo text; v_valor numeric;
  v_de time; v_ate time; v_ini date; v_fim date;
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
  exception when others then
    raise exception 'Confira os dados da promoção.' using errcode = '22023';
  end;
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
    insert into public.promocoes (petshop_id, nome, dias, hora_de, hora_ate, servicos, tipo, valor, comeca_em, termina_em, ativa, criado_por)
    values (p, v_nome, v_dias, v_de, v_ate, v_servicos, v_tipo, round(v_valor, 2), v_ini, v_fim, coalesce((p_dados ->> 'ativa')::boolean, true), (select auth.uid()))
    returning id into v_id;
  else
    update public.promocoes x set nome = v_nome, dias = v_dias, hora_de = v_de, hora_ate = v_ate, servicos = v_servicos, tipo = v_tipo,
      valor = round(v_valor, 2), comeca_em = v_ini, termina_em = v_fim, ativa = coalesce((p_dados ->> 'ativa')::boolean, x.ativa), atualizado_em = now()
     where x.id = p_id and x.petshop_id = p
    returning x.id into v_id;
    if v_id is null then raise exception 'Promoção não encontrada.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

create function public.promocao_apagar(p uuid, p_id uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if not public.sou_dono(p) then raise exception 'Só o dono do pet shop mexe nas promoções.' using errcode = '42501'; end if;
  if not public.acesso_liberado(p) then raise exception 'O acesso do pet shop está bloqueado.' using errcode = '42501'; end if;
  delete from public.promocoes where id = p_id and petshop_id = p;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

-- ---------- tirar ou pôr de volta a promoção de um horário ----------
-- Quem marca (Agenda) e quem recebe (Caixa, Financeiro, Relatórios). Depois da conta lançada, não muda mais.
-- Pôr de volta: a cópia que o horário já tinha; sem cópia, a promoção que vale (entre as que existiam quando ele foi marcado).
create function public.agendamento_promo_usar(p_id uuid, p_usar boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  a public.agendamentos; v_porte text; v_promo jsonb;
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
      select x.porte into v_porte from public.pets x where x.id = a.pet_id and x.petshop_id = a.petshop_id;
      -- promo_do_horario só responde de dentro de um gatilho: aqui a conta é feita direto
      select jsonb_build_object('id', x.id, 'nome', x.nome, 'tipo', x.tipo, 'valor', x.valor, 'servicos', to_jsonb(x.servicos)) into v_promo
        from public.promocoes x, lateral (select coalesce(s.fuso, 'America/Sao_Paulo') as fuso from public.petshops s where s.id = a.petshop_id) f
       where x.petshop_id = a.petshop_id and x.ativa and x.criado_em <= a.criado_em
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

-- ---------- link do cliente ----------
-- Só o que o cliente precisa para ver "10% off" no horário: nome, dias, horas, serviços (já abertos: os do link) e o valor.
create function public.link_promocoes(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'nome', x.nome, 'dias', to_jsonb(x.dias), 'hora_de', to_char(x.hora_de, 'HH24:MI'), 'hora_ate', to_char(x.hora_ate, 'HH24:MI'),
      'tipo', x.tipo, 'valor', x.valor, 'comeca_em', x.comeca_em, 'termina_em', x.termina_em,
      'servicos', coalesce((select jsonb_agg(s.id order by s.ordem, s.nome) from public.servicos s
                    where s.petshop_id = p.id and s.ativo and s.categoria not in ('creche', 'hotel')
                      and public.promo_servico_entra(to_jsonb(x.servicos), p.id, s.id)), '[]'::jsonb))
      order by x.criado_em), '[]'::jsonb)
    from public.petshops p
    join public.promocoes x on x.petshop_id = p.id and x.ativa
   where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)
     and (x.termina_em is null or x.termina_em >= (now() at time zone p.fuso)::date)
$$;

-- ---------- relatório ----------
-- Por promoção, no período (dia do horário): horários marcados com ela (sem os cancelados, faltas e tiradas), quantos foram
-- concluídos, quantas contas tiveram o desconto e quanto de desconto foi dado (pelo dia da conta). Quem vê o dinheiro.
create function public.relatorio_promocoes(p uuid, p_de date, p_ate date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_fuso text;
begin
  if not public.tenho_area(p, array['financeiro', 'relatorios']) then raise exception 'Sem permissão para este relatório.' using errcode = '42501'; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', z.id, 'nome', z.nome, 'marcados', z.marcados, 'concluidos', z.concluidos,
             'contas', z.contas, 'desconto', z.desconto) order by z.desconto desc, z.marcados desc, z.nome)
    from (
      select k.id, max(k.nome) as nome, sum(k.marcados)::int as marcados, sum(k.concluidos)::int as concluidos,
             sum(k.contas)::int as contas, round(sum(k.desconto), 2) as desconto
      from (
        select (a.promo ->> 'id') as id, a.promo ->> 'nome' as nome, 1 as marcados, case when a.status = 'concluido' then 1 else 0 end as concluidos,
               0 as contas, 0::numeric as desconto
          from public.agendamentos a
         where a.petshop_id = p and a.promo is not null and coalesce(a.promo ->> 'tirada', '') <> 'true'
           and a.status not in ('cancelado', 'faltou')
           and (a.inicio at time zone v_fuso)::date between p_de and p_ate
        union all
        select u.promo_id::text, u.promo_nome, 0, 0, 1, u.desconto
          from public.promo_usos u join public.lancamentos l on l.id = u.lancamento_id
         where u.petshop_id = p and l.data between p_de and p_ate
      ) k
      group by k.id
    ) z), '[]'::jsonb);
end $$;

revoke execute on function public.promocao_salvar(uuid, uuid, jsonb), public.promocao_apagar(uuid, uuid), public.agendamento_promo_usar(uuid, boolean),
  public.relatorio_promocoes(uuid, date, date) from public, anon;
grant execute on function public.promocao_salvar(uuid, uuid, jsonb), public.promocao_apagar(uuid, uuid), public.agendamento_promo_usar(uuid, boolean),
  public.relatorio_promocoes(uuid, date, date) to authenticated;
revoke execute on function public.link_promocoes(text) from public;
grant execute on function public.link_promocoes(text) to anon, authenticated;

-- ---------- a conta do atendimento: o desconto da promoção ----------
-- Cópia fiel de anotar_preco_da_venda (20261170, a versão em vigor). Diferença: o desconto da promoção do horário
-- (promo_desconto) sai do desconto do caixa: não passa pelo limite do preço travado, não vai para Alterações em valores
-- e fica em promo_usos. O que passar da promoção segue a regra de sempre (o "de" anotado já é o valor com a promoção).
create or replace function public.anotar_preco_da_venda() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_nome text;
  v_op jsonb;
  v_travado boolean;
  v_max numeric;
  v_fin boolean;
  i jsonb;
  v_valor numeric;
  v_qtd numeric;
  v_tabela numeric;
  v_custo numeric;
  v_soma numeric := 0;
  v_item text;
  v_desc numeric;
  v_promo jsonb;
  v_principal uuid;
  v_promo_usado numeric := 0;
begin
  if v_user is null or new.tipo <> 'entrada' or new.conta_id is not null or new.movimento is not null then return null; end if;
  if new.itens is null or jsonb_typeof(new.itens) <> 'array' then return null; end if;
  -- só a conta do atendimento e a venda de produtos têm preço de tabela para comparar
  if new.agendamento_id is null and new.categoria <> 'Venda de produtos' then return null; end if;
  select s.opcoes into v_op from public.petshops s where s.id = new.petshop_id;
  v_travado := coalesce(v_op -> 'dinheiro.preco_travado' = 'true'::jsonb, false);
  v_max := case when jsonb_typeof(v_op -> 'dinheiro.desconto_max_caixa') = 'number' then least(100, greatest(0, (v_op ->> 'dinheiro.desconto_max_caixa')::numeric)) else 0 end;
  v_fin := public.cuido_do_financeiro(new.petshop_id);
  select x.nome into v_nome from public.profissionais x where x.petshop_id = new.petshop_id and x.user_id = v_user limit 1;

  for i in select * from jsonb_array_elements(new.itens) loop
    if jsonb_typeof(i) <> 'object' or jsonb_typeof(i -> 'valor') <> 'number' then continue; end if;
    v_valor := (i ->> 'valor')::numeric;
    v_qtd := case when jsonb_typeof(i -> 'qtd') = 'number' then (i ->> 'qtd')::numeric else 1 end;
    v_soma := v_soma + round(v_qtd * v_valor, 2);
    v_item := left(coalesce(nullif(btrim(i ->> 'nome'), ''), 'Item'), 120);
    v_tabela := null; v_custo := null;
    if i ->> 'tipo' = 'produto' and (i ->> 'produto_id') ~ '^[0-9a-fA-F-]{36}$' then
      select x.preco_venda, x.custo into v_tabela, v_custo from public.produtos x where x.id = (i ->> 'produto_id')::uuid and x.petshop_id = new.petshop_id;
    elsif i ->> 'tipo' = 'servico' and new.agendamento_id is not null then
      if (i ->> 'servico_id') ~ '^[0-9a-fA-F-]{36}$' then
        select e.preco into v_tabela from public.agendamento_servicos e where e.agendamento_id = new.agendamento_id and e.servico_id = (i ->> 'servico_id')::uuid limit 1;
      else
        select a.preco into v_tabela from public.agendamentos a where a.id = new.agendamento_id;
      end if;
    end if;
    -- um centavo de folga: venda por peso arredonda o preço de uma unidade
    if v_tabela is not null and abs(v_valor - v_tabela) > 0.011 then
      if v_travado and not v_fin then
        raise exception 'O preço de % é %. Só o dono ou quem vê o financeiro muda o preço na venda.', v_item, 'R$ ' || replace(to_char(v_tabela, 'FM999999990D00'), '.', ',');
      end if;
      insert into public.precos_alterados (petshop_id, lancamento_id, tipo, item, de, para, qtd, abaixo_do_custo, quem, quem_nome)
        values (new.petshop_id, new.id, 'preco', v_item, v_tabela, v_valor, v_qtd, coalesce(v_custo > 0 and v_valor < v_custo, false), v_user, v_nome);
    end if;
  end loop;

  v_desc := v_soma - coalesce(new.valor_original, new.valor);
  -- a promoção do horário (o dono montou): não é desconto do caixa. Fica em promo_usos; o resto segue a regra de sempre.
  if new.agendamento_id is not null and v_desc > 0.005 then
    select a.promo, a.servico_id into v_promo, v_principal from public.agendamentos a where a.id = new.agendamento_id and a.petshop_id = new.petshop_id;
    v_promo_usado := least(public.promo_desconto(v_promo, new.petshop_id, new.itens, v_principal), v_desc);
    if v_promo_usado > 0 then
      insert into public.promo_usos (petshop_id, promo_id, promo_nome, agendamento_id, lancamento_id, desconto)
        values (new.petshop_id, case when (v_promo ->> 'id') ~ '^[0-9a-fA-F-]{36}$' then (v_promo ->> 'id')::uuid end,
                left(coalesce(v_promo ->> 'nome', 'Promoção'), 60), new.agendamento_id, new.id, v_promo_usado)
        on conflict (lancamento_id) do nothing;
      v_desc := v_desc - v_promo_usado;
    end if;
  end if;
  if v_desc > 0.005 then
    -- o limite arredonda para baixo, em centavos (a tela mostra o mesmo número)
    if v_travado and not v_fin and v_desc > floor(v_soma * v_max + 0.000001) / 100 + 0.005 then
      if v_max > 0 then
        raise exception 'O desconto passa do máximo de % por cento que o caixa pode dar (% nesta conta). Peça para o dono ou para quem vê o financeiro.',
          replace(trim(to_char(v_max, 'FM990D99'), ',.'), '.', ','), public.em_reais(floor(v_soma * v_max + 0.000001) / 100);
      end if;
      raise exception 'Só o dono ou quem vê o financeiro dá desconto na venda.';
    end if;
    insert into public.precos_alterados (petshop_id, lancamento_id, tipo, item, de, para, quem, quem_nome)
      values (new.petshop_id, new.id, 'desconto', left(coalesce(nullif(btrim(new.descricao), ''), new.categoria), 120), v_soma - v_promo_usado, coalesce(new.valor_original, new.valor), v_user, v_nome);
  end if;
  return null;
end $$;
revoke execute on function public.anotar_preco_da_venda() from public, anon, authenticated;

-- =====================================================================================================================
-- B. Aniversário do tutor
-- =====================================================================================================================

-- Sem o ano: 1904 (bissexto, cabe 29/02; ninguém vivo nasceu nele). A tela mostra só dia e mês.
alter table public.clientes add column if not exists nascimento date
  check (nascimento is null or (nascimento >= date '1904-01-01' and nascimento <= date '2100-12-31'));

-- Faz aniversário no dia? Nascido em 29/02 comemora em 28/02 nos anos que não são bissextos.
create function public.niver_no_dia(p_nascimento date, p_dia date) returns boolean
language sql immutable set search_path = '' as $$
  select p_nascimento is not null and p_dia is not null and (
    (extract(month from p_nascimento) = extract(month from p_dia) and extract(day from p_nascimento) = extract(day from p_dia))
    or (extract(month from p_nascimento) = 2 and extract(day from p_nascimento) = 29 and extract(month from p_dia) = 2 and extract(day from p_dia) = 28
        and extract(day from (make_date(extract(year from p_dia)::int, 3, 1) - 1)) = 28))
$$;

alter table public.mensagens_enviadas drop constraint mensagens_enviadas_tipo_check;
alter table public.mensagens_enviadas add constraint mensagens_enviadas_tipo_check
  check (tipo in ('lembrete', 'chegada', 'pronto', 'saude', 'niver', 'pacote', 'cobranca', 'volta', 'niver_tutor'));

revoke execute on function public.niver_no_dia(date, date) from public, anon, authenticated;

-- ---------- Mandar mensagens: 'niver_tutor' ----------
-- Cópia fiel de gestao_modo_envio (20261198), mais o bloco 'niver_tutor' (junto do aniversário do pet: Agenda, Clientes ou
-- Creche e hotel) e o modelo 'chamar.niver_tutor'.
create or replace function public.gestao_modo_envio(p uuid, p_dias integer default 15) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fuso text; v_hoje date; v_ini timestamptz; v_fim timestamptz; v_amanha_fim timestamptz;
  a_agenda boolean := public.tenho_area(p, array['agenda']);
  a_casa boolean := public.tenho_area(p, array['creche_hotel']);
  a_cli boolean := public.tenho_area(p, array['clientes']);
  a_din boolean := public.tenho_area(p, array['caixa', 'financeiro', 'relatorios']);
  a_pac boolean := public.tenho_area(p, array['pacotes']);
  v_dias integer := least(greatest(coalesce(p_dias, 15), 0), 60);
  i jsonb := '{}'::jsonb;
begin
  if not exists (select 1 from public.profissionais x where x.petshop_id = p and x.user_id = (select auth.uid()) and x.ativo) then return null; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p;
  v_hoje := (now() at time zone v_fuso)::date;
  v_ini := v_hoje::timestamp at time zone v_fuso;
  v_fim := (v_hoje + 1)::timestamp at time zone v_fuso;
  v_amanha_fim := (v_hoje + 2)::timestamp at time zone v_fuso;

  -- lembrete dos horários de amanhã que ainda não tiveram lembrete
  if a_agenda then
    i := i || jsonb_build_object('lembrete', coalesce((
      select jsonb_agg(x order by x.inicio) from (
        select a.id, a.inicio,
               jsonb_build_object('id', pp.id, 'nome', pp.nome, 'sexo', pp.sexo) as pet,
               jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'nao_quer', c.nao_quer_mensagens) as tutor,
               (select jsonb_build_object('nome', s.nome) from public.servicos s where s.id = a.servico_id) as servicos,
               coalesce((select jsonb_agg(jsonb_build_object('ordem', x2.ordem, 'servicos', jsonb_build_object('nome', s2.nome)) order by x2.ordem)
                  from public.agendamento_servicos x2 join public.servicos s2 on s2.id = x2.servico_id where x2.agendamento_id = a.id), '[]'::jsonb) as agendamento_servicos
          from public.agendamentos a join public.pets pp on pp.id = a.pet_id left join public.clientes c on c.id = pp.cliente_id
         where a.petshop_id = p and a.inicio >= v_fim and a.inicio < v_amanha_fim
           and a.status in ('marcado', 'confirmado') and a.lembrete_em is null
         order by a.inicio limit 300) x), '[]'::jsonb));

    -- pet pronto: atendimento de hoje concluído e o tutor ainda não foi avisado
    i := i || jsonb_build_object('pronto', coalesce((
      select jsonb_agg(x order by x.inicio desc) from (
        select a.id, a.inicio,
               jsonb_build_object('id', pp.id, 'nome', pp.nome, 'sexo', pp.sexo) as pet,
               jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'nao_quer', c.nao_quer_mensagens) as tutor,
               (select jsonb_build_object('nome', s.nome) from public.servicos s where s.id = a.servico_id) as servicos,
               coalesce((select jsonb_agg(jsonb_build_object('ordem', x2.ordem, 'servicos', jsonb_build_object('nome', s2.nome)) order by x2.ordem)
                  from public.agendamento_servicos x2 join public.servicos s2 on s2.id = x2.servico_id where x2.agendamento_id = a.id), '[]'::jsonb) as agendamento_servicos
          from public.agendamentos a join public.pets pp on pp.id = a.pet_id left join public.clientes c on c.id = pp.cliente_id
         where a.petshop_id = p and a.inicio >= v_ini and a.inicio < v_fim
           and a.status = 'concluido' and a.pronto_avisado_em is null
         order by a.inicio desc limit 200) x), '[]'::jsonb));
  end if;

  -- aviso de chegada das reservas de amanhã (creche avulsa e hotel; o mensalista vem todo dia e não entra)
  if a_casa then
    i := i || jsonb_build_object('chegada', coalesce((
      select jsonb_agg(x order by x.entrada) from (
        select e.id, e.tipo, e.entrada, e.saida_prevista,
               jsonb_build_object('id', pp.id, 'nome', pp.nome, 'sexo', pp.sexo) as pet,
               jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'nao_quer', c.nao_quer_mensagens) as tutor
          from public.estadias e join public.pets pp on pp.id = e.pet_id left join public.clientes c on c.id = pp.cliente_id
         where e.petshop_id = p and e.status = 'reservada' and e.plano_id is null
           and e.entrada >= v_fim and e.entrada < v_amanha_fim
           and (e.avisos ->> 'chegada') is null
         order by e.entrada limit 200) x), '[]'::jsonb));
  end if;

  if a_agenda or a_casa or a_cli then
    -- vacina e cuidado vencendo nos próximos dias (ou vencido há até 30 dias): a dose mais nova de cada um,
    -- sem mensagem de saúde para ela nos últimos 30 dias
    i := i || jsonb_build_object('saude', coalesce((
      select jsonb_agg(x order by x.vence_em, x.pet_id) from (
        select d.id, d.pet_id, d.tipo, d.nome, d.vence_em,
               jsonb_build_object('id', pp.id, 'nome', pp.nome, 'sexo', pp.sexo) as pet,
               jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'nao_quer', c.nao_quer_mensagens) as tutor
          from (select distinct on (s.pet_id, s.tipo, lower(s.nome)) s.id, s.pet_id, s.tipo, s.nome, s.vence_em
                  from public.pets_saude s where s.petshop_id = p
                 order by s.pet_id, s.tipo, lower(s.nome), s.vence_em desc nulls first) d
          join public.pets pp on pp.id = d.pet_id left join public.clientes c on c.id = pp.cliente_id
         where pp.ativo and d.vence_em is not null and d.vence_em between v_hoje - 30 and v_hoje + v_dias
           and not exists (select 1 from public.mensagens_enviadas m where m.petshop_id = p and m.tipo = 'saude' and m.ref = d.id and m.dia > v_hoje - 30)
         order by d.vence_em limit 300) x), '[]'::jsonb));

    -- aniversário hoje (uma mensagem por ano)
    i := i || jsonb_build_object('niver', coalesce((
      select jsonb_agg(x order by x.nome) from (
        select pp.id, pp.nome, pp.nascimento,
               jsonb_build_object('id', pp.id, 'nome', pp.nome, 'sexo', pp.sexo) as pet,
               jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'nao_quer', c.nao_quer_mensagens) as tutor
          from public.pets pp left join public.clientes c on c.id = pp.cliente_id
         where pp.petshop_id = p and pp.ativo and pp.nascimento is not null
           and extract(month from pp.nascimento) = extract(month from v_hoje) and extract(day from pp.nascimento) = extract(day from v_hoje)
           and not exists (select 1 from public.mensagens_enviadas m where m.petshop_id = p and m.tipo = 'niver' and m.ref = pp.id and m.dia > v_hoje - 300)
         order by pp.nome limit 200) x), '[]'::jsonb));

    -- aniversário do tutor hoje (uma mensagem por ano), de quem tem pet ativo; nascido em 29/02, no dia 28/02 em ano não bissexto
    i := i || jsonb_build_object('niver_tutor', coalesce((
      select jsonb_agg(x order by x.nome) from (
        select c.id, c.nome, c.nascimento,
               coalesce((select jsonb_agg(jsonb_build_object('id', pp.id, 'nome', pp.nome, 'sexo', pp.sexo) order by pp.nome)
                  from public.pets pp where pp.cliente_id = c.id and pp.petshop_id = p and pp.ativo), '[]'::jsonb) as pets,
               jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'nao_quer', c.nao_quer_mensagens) as tutor
          from public.clientes c
         where c.petshop_id = p and c.nascimento is not null and public.niver_no_dia(c.nascimento, v_hoje)
           and exists (select 1 from public.pets pp where pp.cliente_id = c.id and pp.petshop_id = p and pp.ativo)
           and not exists (select 1 from public.mensagens_enviadas m where m.petshop_id = p and m.tipo = 'niver_tutor' and m.ref = c.id and m.dia > v_hoje - 300)
         order by c.nome limit 200) x), '[]'::jsonb));
  end if;

  -- pacote no último uso: o horário de hoje usa a última sessão, ou a última sessão foi usada nos últimos 14 dias
  if a_pac then
    i := i || jsonb_build_object('pacote', coalesce((
      select jsonb_agg(x order by x.nome) from (
        select pc.id, pc.nome, pc.total, pc.usados,
               jsonb_build_object('id', pp.id, 'nome', pp.nome, 'sexo', pp.sexo) as pet,
               jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'nao_quer', c.nao_quer_mensagens) as tutor
          from public.pacotes_clientes pc join public.pets pp on pp.id = pc.pet_id left join public.clientes c on c.id = pp.cliente_id
         where pc.petshop_id = p and pc.ativo and pp.ativo and pc.total > 0
           and ((pc.total - pc.usados = 1 and exists (select 1 from public.agendamentos a where a.pacote_cliente_id = pc.id
                   and a.inicio >= v_ini and a.inicio < v_fim and a.status not in ('cancelado', 'faltou')))
             or (pc.usados >= pc.total and exists (select 1 from public.agendamentos a where a.pacote_cliente_id = pc.id
                   and a.inicio >= v_ini - interval '14 days' and a.inicio < v_fim and a.status = 'concluido')))
           and not exists (select 1 from public.mensagens_enviadas m where m.petshop_id = p and m.tipo = 'pacote' and m.ref = pc.id)
         order by pc.nome limit 200) x), '[]'::jsonb));
  end if;

  -- cobrança gentil: contas de clientes vencidas (ou sem vencimento) em aberto; quem foi cobrado nos últimos 7 dias fica de fora
  if a_din then
    i := i || jsonb_build_object('cobranca', coalesce((
      select jsonb_agg(x order by x.total desc) from (
        select c.id as cliente_id, sum(l.valor) as total,
               jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'nao_quer', c.nao_quer_mensagens) as tutor,
               jsonb_agg(jsonb_build_object('id', l.id, 'valor', l.valor, 'valor_original', l.valor_original, 'descricao', l.descricao,
                 'categoria', l.categoria, 'vencimento', l.vencimento, 'multa_recebida', l.multa_recebida, 'multa_recebida_em', l.multa_recebida_em)
                 order by l.vencimento nulls last, l.criado_em) as contas
          from public.lancamentos l join public.clientes c on c.id = l.cliente_id
         where l.petshop_id = p and l.tipo = 'entrada' and not l.pago and (l.vencimento is null or l.vencimento <= v_hoje)
           and not exists (select 1 from public.lancamentos l2 where l2.petshop_id = p and l2.cliente_id = c.id and not l2.pago
                             and l2.cobrado_em > now() - interval '7 days')
           and not exists (select 1 from public.mensagens_enviadas m where m.petshop_id = p and m.tipo = 'cobranca' and m.ref = l.id and m.dia > v_hoje - 7)
         group by c.id
        having sum(l.valor) > 0
         order by sum(l.valor) desc limit 200) x), '[]'::jsonb));
  end if;

  -- chamar de volta: pets que não vêm há 60 dias ou mais e não têm nada marcado (a regra de visitas_dos_pets);
  -- tutor chamado nos últimos 30 dias fica de fora
  if a_cli then
    i := i || jsonb_build_object('volta', coalesce((
      select jsonb_agg(x order by x.ultima desc) from (
        select pp.id, v.ultima, v.servico,
               jsonb_build_object('id', pp.id, 'nome', pp.nome, 'sexo', pp.sexo) as pet,
               jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'nao_quer', c.nao_quer_mensagens) as tutor
          from (select (e ->> 0)::uuid as pet_id, (e ->> 1)::timestamptz as ultima, e ->> 2 as servico, (e ->> 3)::boolean as marcado
                  from jsonb_array_elements(public.visitas_dos_pets(p, v_ini, now())) e) v
          join public.pets pp on pp.id = v.pet_id join public.clientes c on c.id = pp.cliente_id
         where pp.petshop_id = p and pp.ativo and not v.marcado and v.ultima is not null
           and (v.ultima at time zone v_fuso)::date <= v_hoje - 60
           and not exists (select 1 from public.mensagens_enviadas m where m.petshop_id = p and m.tipo = 'volta' and m.ref = c.id and m.dia > v_hoje - 30)
         order by v.ultima desc limit 300) x), '[]'::jsonb));
  end if;

  return jsonb_build_object('dia', v_hoje, 'itens', i, 'modelos', (
    select coalesce(jsonb_object_agg(mm.chave, mm.texto), '{}'::jsonb) from public.modelos_mensagem mm
     where mm.petshop_id = p and mm.chave in ('chamar.volta', 'chamar.niver', 'chamar.niver_tutor')));
end $$;

-- Cópia fiel de modo_envio_marcar (20261198), mais o tipo 'niver_tutor' (ref = o tutor). Sem marca em outra tela: só o registro.
create or replace function public.modo_envio_marcar(p uuid, p_tipo text, p_refs uuid[]) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_eu uuid; v_fuso text; v_hoje date; v_validas uuid[]; v_novas uuid[]; v_agora timestamptz := now();
  v_areas text[] := case p_tipo
    when 'lembrete' then array['agenda'] when 'pronto' then array['agenda']
    when 'chegada' then array['creche_hotel']
    when 'saude' then array['agenda', 'clientes', 'creche_hotel'] when 'niver' then array['agenda', 'clientes', 'creche_hotel']
    when 'pacote' then array['pacotes'] when 'cobranca' then array['caixa', 'financeiro', 'relatorios']
    when 'volta' then array['clientes']
    when 'niver_tutor' then array['agenda', 'clientes', 'creche_hotel'] end;
begin
  if v_areas is null then raise exception 'Tipo de mensagem desconhecido.' using errcode = '22023'; end if;
  if p_refs is null or cardinality(p_refs) = 0 or cardinality(p_refs) > 50 then raise exception 'Mande de 1 a 50 itens.' using errcode = '22023'; end if;
  select x.id into v_eu from public.profissionais x where x.petshop_id = p and x.user_id = (select auth.uid()) and x.ativo;
  if v_eu is null or not public.tenho_area(p, v_areas) then raise exception 'Sem permissão para esta mensagem.' using errcode = '42501'; end if;
  if not public.acesso_liberado(p) then raise exception 'O acesso do pet shop está bloqueado.' using errcode = '42501'; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p;
  v_hoje := (v_agora at time zone v_fuso)::date;

  -- só o que é deste pet shop e cabe no tipo
  v_validas := case p_tipo
    when 'lembrete' then array(select a.id from public.agendamentos a where a.petshop_id = p and a.id = any (p_refs))
    when 'pronto' then array(select a.id from public.agendamentos a where a.petshop_id = p and a.id = any (p_refs))
    when 'chegada' then array(select e.id from public.estadias e where e.petshop_id = p and e.id = any (p_refs))
    when 'saude' then array(select s.id from public.pets_saude s where s.petshop_id = p and s.id = any (p_refs))
    when 'niver' then array(select x.id from public.pets x where x.petshop_id = p and x.id = any (p_refs))
    when 'pacote' then array(select x.id from public.pacotes_clientes x where x.petshop_id = p and x.id = any (p_refs))
    when 'cobranca' then array(select l.id from public.lancamentos l where l.petshop_id = p and l.id = any (p_refs) and l.tipo = 'entrada' and l.cliente_id is not null)
    when 'volta' then array(select c.id from public.clientes c where c.petshop_id = p and c.id = any (p_refs))
    when 'niver_tutor' then array(select c.id from public.clientes c where c.petshop_id = p and c.id = any (p_refs)) end;

  with novas as (
    insert into public.mensagens_enviadas (petshop_id, tipo, ref, dia, enviado_em, enviado_por)
    select p, p_tipo, r, v_hoje, v_agora, v_eu from unnest(v_validas) r
    on conflict (petshop_id, tipo, ref, dia) do nothing
    returning ref)
  select coalesce(array_agg(ref), '{}') into v_novas from novas;

  -- a marca das outras telas, só para o que entrou agora
  if cardinality(v_novas) > 0 then
    if p_tipo = 'lembrete' then
      update public.agendamentos set lembrete_em = v_agora where petshop_id = p and id = any (v_novas);
    elsif p_tipo = 'pronto' then
      update public.agendamentos set pronto_avisado_em = coalesce(pronto_avisado_em, v_agora) where petshop_id = p and id = any (v_novas);
    elsif p_tipo = 'chegada' then
      update public.estadias set avisos = coalesce(avisos, '{}'::jsonb) || jsonb_build_object('chegada', to_char(v_agora at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
       where petshop_id = p and id = any (v_novas);
    elsif p_tipo = 'cobranca' then
      update public.lancamentos set cobrado_em = v_agora where petshop_id = p and id = any (v_novas) and not pago;
    end if;
  end if;

  return jsonb_build_object('marcadas', cardinality(v_novas), 'ja_estavam', cardinality(v_validas) - cardinality(v_novas),
    'ignoradas', cardinality(p_refs) - cardinality(v_validas), 'enviado_em', v_agora);
end $$;

-- ---------- LGPD: o aniversário do tutor ----------
-- Cópia fiel de cliente_dados (20261199); o cadastro.csv leva a coluna Aniversário (sem o ano: só dia e mês).
create or replace function public.cliente_dados(p_cliente uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.clientes;
  v_fuso text;
  v_pets uuid[];
  v_fone text;
  v_arquivos jsonb := '[]'::jsonb;
begin
  select * into c from public.clientes where id = p_cliente;
  if not found or not public.sou_dono(c.petshop_id) then raise exception 'Cliente não encontrado.'; end if;
  select s.fuso into v_fuso from public.petshops s where s.id = c.petshop_id;
  select coalesce(array_agg(p.id), '{}') into v_pets from public.pets p where p.cliente_id = c.id and p.petshop_id = c.petshop_id;
  v_fone := nullif(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), '');

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'cadastro.csv', 'explica', 'O cadastro do tutor: nome, telefone, e-mail, endereço, aniversário e observações.',
    'colunas', jsonb_build_array('Nome', 'Telefone', 'E-mail', 'Endereço', 'Aniversário', 'Observações', 'Cliente desde'),
    'linhas', jsonb_build_array(jsonb_build_array(c.nome, c.telefone, c.email, c.endereco,
      case when c.nascimento is null then null when extract(year from c.nascimento) = 1904 then to_char(c.nascimento, 'DD/MM') else to_char(c.nascimento, 'DD/MM/YYYY') end,
      c.obs, to_char(c.criado_em at time zone v_fuso, 'DD/MM/YYYY')))));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'pets.csv', 'explica', 'Os pets do tutor.',
    'colunas', jsonb_build_array('Pet', 'Espécie', 'Raça', 'Porte', 'Sexo', 'Nascimento', 'Alertas', 'Observações', 'Ativo', 'Adicionado em'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(p.nome, p.especie, p.raca, p.porte, p.sexo, to_char(p.nascimento, 'DD/MM/YYYY'), p.alertas, p.obs,
                 case when p.ativo then 'Sim' else 'Não' end, to_char(p.criado_em at time zone v_fuso, 'DD/MM/YYYY')) order by p.nome)
               from public.pets p where p.id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'saude.csv', 'explica', 'Vacinas, vermífugos, antipulgas e outros cuidados anotados na ficha dos pets.',
    'colunas', jsonb_build_array('Pet', 'Tipo', 'Nome', 'Aplicado em', 'Vence em', 'Observações'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(p.nome, s.tipo, s.nome, to_char(s.aplicado_em, 'DD/MM/YYYY'), to_char(s.vence_em, 'DD/MM/YYYY'), s.obs) order by s.criado_em)
               from public.pets_saude s join public.pets p on p.id = s.pet_id where s.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'contatos.csv', 'explica', 'Outras pessoas anotadas para buscar ou para chamar em uma emergência.',
    'colunas', jsonb_build_array('Pet', 'Nome', 'Telefone', 'Relação', 'Observações'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(p.nome, k.nome, k.telefone, k.relacao, k.obs) order by k.criado_em)
               from public.pets_contatos k left join public.pets p on p.id = k.pet_id
              where k.petshop_id = c.petshop_id and (k.cliente_id = c.id or k.pet_id = any (v_pets))), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'agendamentos.csv', 'explica', 'Os horários de banho, tosa e outros serviços, com a situação e o preço.',
    'colunas', jsonb_build_array('Dia', 'Hora', 'Pet', 'Serviço', 'Situação', 'Preço', 'Leva e traz', 'Endereço do leva e traz', 'Observações'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(a.inicio at time zone v_fuso, 'DD/MM/YYYY'), to_char(a.inicio at time zone v_fuso, 'HH24:MI'),
                 p.nome, v.nome, a.status, public.lgpd_dinheiro(a.preco), case when a.leva_traz then 'Sim' else 'Não' end, a.endereco_leva_traz, a.obs) order by a.inicio)
               from public.agendamentos a join public.pets p on p.id = a.pet_id left join public.servicos v on v.id = a.servico_id
              where a.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'estadias.csv', 'explica', 'As estadias de creche e hotel.',
    'colunas', jsonb_build_array('Tipo', 'Pet', 'Entrada', 'Saída prevista', 'Saída', 'Situação', 'Diária', 'Valor cobrado', 'Observações'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(e.tipo, p.nome, to_char(e.entrada at time zone v_fuso, 'DD/MM/YYYY HH24:MI'),
                 to_char(e.saida_prevista at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), to_char(e.saida at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), e.status,
                 public.lgpd_dinheiro(e.valor_diaria), public.lgpd_dinheiro(e.valor_cobrado), e.obs) order by e.entrada)
               from public.estadias e join public.pets p on p.id = e.pet_id where e.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'pacotes.csv', 'explica', 'Os pacotes comprados, com quanto já foi usado.',
    'colunas', jsonb_build_array('Pacote', 'Pet', 'Total', 'Usados', 'Preço', 'Comprado em', 'Vence em'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(k.nome, p.nome, k.total, k.usados, public.lgpd_dinheiro(k.preco), to_char(k.comprado_em, 'DD/MM/YYYY'),
                 to_char(k.vence_em, 'DD/MM/YYYY')) order by k.comprado_em)
               from public.pacotes_clientes k join public.pets p on p.id = k.pet_id where k.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'mensalidades.csv', 'explica', 'As mensalidades da creche.',
    'colunas', jsonb_build_array('Mês', 'Pet', 'Total', 'Vencimento', 'Situação'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(m.mes, 'MM/YYYY'), p.nome, public.lgpd_dinheiro(m.total), to_char(m.vencimento, 'DD/MM/YYYY'), m.status) order by m.mes)
               from public.creche_cobrancas m join public.pets p on p.id = m.pet_id where m.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'financeiro.csv', 'explica', 'O que o tutor pagou e o que ficou a receber. Saídas (devoluções) com valor negativo.',
    'colunas', jsonb_build_array('Data', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'Pago', 'Vencimento'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(l.data, 'DD/MM/YYYY'), l.tipo, l.categoria, l.descricao,
                 public.lgpd_dinheiro(case when l.tipo = 'saida' then -l.valor else l.valor end), case when l.pago then 'Sim' else 'Não' end,
                 to_char(l.vencimento, 'DD/MM/YYYY')) order by l.data, l.criado_em)
               from public.lancamentos l where l.petshop_id = c.petshop_id and l.cliente_id = c.id and l.movimento is null), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'credito.csv', 'explica', 'Os movimentos do crédito do tutor (o que ficou guardado e o que foi usado).',
    'colunas', jsonb_build_array('Quando', 'Valor', 'Motivo'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(k.criado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), public.lgpd_dinheiro(k.valor), k.motivo) order by k.criado_em)
               from public.clientes_creditos k where k.petshop_id = c.petshop_id and k.cliente_id = c.id), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'boletins.csv', 'explica', 'Os boletins mandados ao tutor (só as informações; as fotos ficam no aplicativo).',
    'colunas', jsonb_build_array('Pet', 'Feito em', 'Mandado em', 'Fotos', 'Página no ar até', 'Recado'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(p.nome, to_char(b.criado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'),
                 to_char(b.enviado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), coalesce(cardinality(b.fotos), 0),
                 to_char(b.expira_em at time zone v_fuso, 'DD/MM/YYYY'), b.texto) order by b.criado_em)
               from public.boletins b join public.pets p on p.id = b.pet_id where b.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'autorizacoes-de-fotos.csv', 'explica', 'As autorizações para postar as fotos dos pets nas redes do pet shop, com o texto que o tutor aceitou e quando tirou.',
    'colunas', jsonb_build_array('Pet', 'Autorizado em', 'Quais fotos', 'Perfil para marcar', 'Texto aceito', 'Tirada em'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(p.nome, to_char(f.autorizado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'),
                 case f.escopo when 'boletim' then 'Só as daquele boletim' else 'Daquele boletim e das próximas visitas' end, f.marcar, f.texto,
                 to_char(f.retirado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI')) order by f.autorizado_em)
               from public.fotos_autorizacoes f join public.pets p on p.id = f.pet_id where f.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'pedidos-pelo-link.csv', 'explica', 'Os pedidos feitos pelo link de agendamento com o mesmo telefone do tutor.',
    'colunas', jsonb_build_array('Pedido em', 'Nome', 'Pet', 'Para', 'Para quando', 'Situação', 'Aceitou as regras em'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(d.criado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), d.tutor_nome, d.pet_nome, d.tipo,
                 to_char(d.inicio at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), d.status, to_char(d.termos_aceitos_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI')) order by d.criado_em)
               from public.pedidos_agendamento d
              where v_fone is not null and d.petshop_id = c.petshop_id and regexp_replace(d.telefone, '\D', '', 'g') = v_fone), '[]'::jsonb)));

  perform public.lgpd_anotar(c.petshop_id, 'baixou_tutor', jsonb_build_object('cliente_id', c.id));
  return jsonb_build_object('cliente', c.nome, 'petshop', (select s.nome from public.petshops s where s.id = c.petshop_id),
                            'gerado_em', now(), 'arquivos', v_arquivos);
end $$;

-- Apagar os dados de um tutor (cliente_anonimizar) apaga também o aniversário. cliente_anonimizar não é trocada aqui: outra
-- migração (20261202500000, checklist de entrada) também a troca, e copiar uma versão dela desfaria a outra conforme a ordem.
-- Em vez disso, um gatilho: quando cliente_anonimizar troca o nome por "Cliente removido" (ela marca maestro.lgpd = 1 na
-- transação), o aniversário vai junto. Fora dela, nada muda.
create function public.clientes_lgpd_nascimento() returns trigger
language plpgsql set search_path = '' as $$
begin
  if coalesce(current_setting('maestro.lgpd', true), '') = '1' and new.nome = 'Cliente removido' then
    new.nascimento := null;
  end if;
  return new;
end $$;
revoke execute on function public.clientes_lgpd_nascimento() from public, anon, authenticated;
create trigger clientes_lgpd_nascimento before update of nome on public.clientes
  for each row execute function public.clientes_lgpd_nascimento();

-- =====================================================================================================================
-- C. Pacote acabando
-- =====================================================================================================================

-- quando o último uso foi marcado (o banco põe; desfazer o uso limpa). pacotes_clientes tem a leitura coluna por coluna.
alter table public.pacotes_clientes add column if not exists acabou_em timestamptz;
grant select (acabou_em) on public.pacotes_clientes to authenticated;

create function public.pacotes_acabou_em() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.usados >= new.total then
    new.acabou_em := case when tg_op = 'UPDATE' and old.usados >= old.total then coalesce(old.acabou_em, now()) else now() end;
  else
    new.acabou_em := null;
  end if;
  return new;
end $$;
revoke execute on function public.pacotes_acabou_em() from public, anon, authenticated;
create trigger pacotes_acabou_em before insert or update on public.pacotes_clientes
  for each row execute function public.pacotes_acabou_em();

-- Pacotes para oferecer a renovação (os números são os mesmos de src/lib/gestao/pacote-acabando.ts):
--   'acabou'   usou tudo nos últimos 30 dias (sem a data do último uso, vale o dia do último horário que usou o pacote)
--   'vencido'  ainda tinha uso e venceu nos últimos 30 dias
--   'ultimo'   sobra 1 uso
--   'vencendo' vence de hoje a 7 dias
-- Pet desativado ou que já tem outro pacote valendo (comprado depois) fica de fora. Toda a equipe vê (como a lista de Pacotes).
create function public.pacotes_acabando(p uuid, p_pet uuid default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_fuso text; v_hoje date;
begin
  if not exists (select 1 from public.profissionais x where x.petshop_id = p and x.user_id = (select auth.uid()) and x.ativo) then return '[]'::jsonb; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p;
  v_hoje := (now() at time zone v_fuso)::date;
  return coalesce((
    select jsonb_agg(to_jsonb(y) - 'ordem' order by y.ordem, y.vence_em nulls last, y.pet ->> 'nome') from (
      select z.*, case z.motivo when 'acabou' then 1 when 'vencido' then 2 when 'ultimo' then 3 else 4 end as ordem from (
        select k.id, k.pet_id, k.nome, k.total, k.usados, k.vence_em, k.servico_id, k.pacote_id,
               (w.acabou at time zone v_fuso)::date as acabou_em,
               case when k.vence_em is null then null else k.vence_em - v_hoje end as dias,
               jsonb_build_object('id', pp.id, 'nome', pp.nome, 'sexo', pp.sexo, 'foto', pp.foto, 'especie', pp.especie) as pet,
               case when c.id is null then null else jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'nao_quer', c.nao_quer_mensagens) end as tutor,
               case
                 when k.usados >= k.total then case when w.acabou is not null and (w.acabou at time zone v_fuso)::date >= v_hoje - 30 then 'acabou' end
                 when not k.ativo then null
                 when k.vence_em is not null and k.vence_em < v_hoje then case when k.vence_em >= v_hoje - 30 then 'vencido' end
                 when k.total - k.usados = 1 then 'ultimo'
                 when k.vence_em is not null and k.vence_em <= v_hoje + 7 then 'vencendo'
               end as motivo
          from public.pacotes_clientes k
          join public.pets pp on pp.id = k.pet_id and pp.petshop_id = k.petshop_id
          left join public.clientes c on c.id = pp.cliente_id
          cross join lateral (select coalesce(k.acabou_em, (select max(a.inicio) from public.agendamentos a
                                where a.pacote_cliente_id = k.id and a.petshop_id = k.petshop_id and a.status = 'concluido')) as acabou) w
         where k.petshop_id = p and (p_pet is null or k.pet_id = p_pet) and pp.ativo
           and not exists (select 1 from public.pacotes_clientes k2 where k2.petshop_id = p and k2.pet_id = k.pet_id and k2.id <> k.id
                             and k2.ativo and k2.usados < k2.total and (k2.vence_em is null or k2.vence_em >= v_hoje) and k2.criado_em > k.criado_em)
      ) z where z.motivo is not null
      order by 1 limit 200
    ) y), '[]'::jsonb);
end $$;
revoke execute on function public.pacotes_acabando(uuid, uuid) from public, anon;
grant execute on function public.pacotes_acabando(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
