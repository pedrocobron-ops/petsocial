-- Leva e traz e promoção em dias fracos também na creche e no hotel (estadias).
--
-- O que entra (só acrescenta, menos as trocas listadas no fim deste cabeçalho):
--
-- A. Leva e traz das estadias
--    * estadias.leva_traz_buscar (buscar o pet em casa no dia da entrada), estadias.leva_traz_levar (levar de volta no dia da
--      saída) e estadias.endereco_leva_traz (vazio = o endereço da ficha do tutor). estadias tem a leitura coluna por coluna
--      (20261149): cada coluna nova ganha `grant select (col)`. Gravar: a equipe já grava estadias pela API com permissão na tabela
--      inteira (insert e update), então as colunas novas já entram; o `grant insert/update (col)` abaixo deixa isso escrito,
--      para continuar valendo se um dia a permissão da tabela virar coluna por coluna.
--    * leva_traz_estadias: as viagens feitas de cada estadia (buscar, levar), irmã de leva_traz_viagens (que é dos horários e
--      tem o horário na chave: mexer nela seria trocar a chave de uma tabela em uso). Só leitura pela regra (área Creche e
--      hotel); gravar só por leva_traz_estadia_marcar (área Creche e hotel, conta liberada, dois toques = um).
--    * Quais viagens caem no dia (a tela faz a conta, src/lib/gestao/quadro.ts viagensDaEstadia):
--        hotel: buscar no dia da entrada, levar no dia da saída (a de verdade, ou a prevista);
--        creche avulsa: as duas no dia.
--      Mensalista da creche fica de fora: o dia do plano só vira estadia quando o pet chega (Chamada), então não há o que buscar
--      antes. Para isso seria preciso o leva e traz no plano e a lista calculada pelos dias esperados (faltas, pausas, feriados):
--      fica para depois.
--    * Taxa: a mesma de Meu pet shop (petshops.opcoes "taxi.taxa"), só como sugestão no check-out. Nenhum preço muda sozinho.
--
-- B. Promoção em dias fracos na creche e no hotel
--    * promocoes.banho_tosa (vale no banho e tosa, como sempre: padrão sim) e promocoes.casa (lista: 'creche' e/ou 'hotel').
--      "Segunda tem 15% na diária da creche" = banho_tosa falso, casa {creche}, dias {1}. Faixa de hora não vale para estadias.
--    * estadias.promo (jsonb): a cópia da promoção, posta pelo banco ao marcar (gatilho estadias_promo, como agendamentos.promo):
--      a API não escreve; {"tirada": true} ao marcar = sem ela. Remarcar uma reserva procura de novo, entre as promoções que já
--      existiam quando ela foi marcada: reserva marcada antes da promoção nunca ganha a promoção.
--        hotel: vale nas noites que caem nos dias da promoção (a cópia guarda os dias, o começo e o fim);
--        creche: vale no dia.
--      Mensalista (o dia é do plano) e dia de experiência (preço próprio) não ganham promoção.
--    * estadia_promo_usar: tirar ou pôr de volta (Creche e hotel, Caixa, Financeiro, Relatórios), até a conta ser fechada.
--    * O pedido do link de creche e hotel leva a promoção que valia (pedidos_promo) e, aceito, a estadia fica com ela
--      (gatilho pedidos_promo_estadia).
--    * Check-out: a promoção é uma linha de desconto na conta (a tela calcula; a equipe pode tirar antes de receber). A conta
--      guardada (estadias_valores.conta.promo) vai para promo_usos (gatilho estadias_valores_promo), com o desconto limitado
--      pelo que a promoção da estadia pode dar.
--    * relatorio_promocoes passa a contar as estadias.
--
-- Trocas (cópia fiel da versão anterior, com o acréscimo indicado):
--    * promo_do_horario (20261205): só promoções com banho_tosa.
--    * agendamento_promo_usar (20261205): só promoções com banho_tosa ao pôr de volta.
--    * promocao_salvar (20261205): grava banho_tosa e casa.
--    * link_promocoes (20261205): leva banho_tosa e casa; sem banho_tosa, a lista de serviços vem vazia.
--    * pedidos_promo (20261205): também nos pedidos de creche e hotel.
--    * relatorio_promocoes (20261205): mais as estadias marcadas com a promoção e o desconto delas.
-- opcoes_sem_valores não é trocada ('taxi.taxa' já está fora das opções de quem não recebe desde 20261203).

-- =====================================================================================================================
-- A. Leva e traz das estadias
-- =====================================================================================================================

alter table public.estadias add column if not exists leva_traz_buscar boolean not null default false;
alter table public.estadias add column if not exists leva_traz_levar boolean not null default false;
alter table public.estadias add column if not exists endereco_leva_traz text
  check (endereco_leva_traz is null or char_length(endereco_leva_traz) <= 300);
grant select (leva_traz_buscar, leva_traz_levar, endereco_leva_traz) on public.estadias to authenticated;
grant insert (leva_traz_buscar, leva_traz_levar, endereco_leva_traz), update (leva_traz_buscar, leva_traz_levar, endereco_leva_traz)
  on public.estadias to authenticated;

create table if not exists public.leva_traz_estadias (
  estadia_id uuid not null references public.estadias (id) on delete cascade,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  perna text not null check (perna in ('buscar', 'levar')),
  feito_em timestamptz not null default now(),
  feito_por uuid references auth.users (id) on delete set null,
  primary key (estadia_id, perna)
);
create index if not exists leva_traz_estadias_petshop on public.leva_traz_estadias (petshop_id, feito_em desc);

alter table public.leva_traz_estadias enable row level security;
revoke all on public.leva_traz_estadias from public, anon, authenticated;
grant select on public.leva_traz_estadias to authenticated;
drop policy if exists leva_traz_estadias_ler on public.leva_traz_estadias;
create policy leva_traz_estadias_ler on public.leva_traz_estadias for select to authenticated
  using (petshop_id in (select public.meus_petshops()) and (select public.tenho_area(petshop_id, array['creche_hotel'])));

-- Marca (p_feito true) ou desfaz (false) a viagem 'buscar' ou 'levar' de uma estadia com leva e traz.
-- Dois toques: a hora fica a do primeiro. Não faz check-in nem check-out (isso continua na Creche e hotel).
-- Devolve { perna, feito_em } (feito_em nulo depois de desfazer).
create or replace function public.leva_traz_estadia_marcar(p_petshop uuid, p_estadia uuid, p_perna text, p_feito boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e record;
  v public.leva_traz_estadias;
begin
  if not public.tenho_area(p_petshop, array['creche_hotel']) then raise exception 'Sem acesso à creche e hotel.'; end if;
  if not public.acesso_liberado(p_petshop) then raise exception 'A conta está só para consulta.'; end if;
  if p_perna is null or p_perna not in ('buscar', 'levar') then raise exception 'Viagem inválida.'; end if;

  select x.id, x.status, x.leva_traz_buscar, x.leva_traz_levar into e from public.estadias x
   where x.id = p_estadia and x.petshop_id = p_petshop for update;
  if e.id is null then raise exception 'Estadia não encontrada.'; end if;
  if (p_perna = 'buscar' and not e.leva_traz_buscar) or (p_perna = 'levar' and not e.leva_traz_levar) then
    raise exception 'Esta estadia não tem leva e traz para %.', case p_perna when 'buscar' then 'buscar o pet' else 'levar o pet de volta' end;
  end if;

  if not coalesce(p_feito, true) then
    delete from public.leva_traz_estadias x where x.estadia_id = p_estadia and x.perna = p_perna;
    return jsonb_build_object('perna', p_perna, 'feito_em', null);
  end if;

  if e.status = 'cancelada' then raise exception 'Esta estadia foi cancelada.'; end if;
  if p_perna = 'levar' and e.status = 'reservada' then raise exception 'O pet ainda não chegou à casa.'; end if;

  insert into public.leva_traz_estadias as x (estadia_id, petshop_id, perna, feito_por)
  values (p_estadia, p_petshop, p_perna, (select auth.uid()))
  on conflict (estadia_id, perna) do nothing;
  select * into v from public.leva_traz_estadias x where x.estadia_id = p_estadia and x.perna = p_perna;
  return jsonb_build_object('perna', v.perna, 'feito_em', v.feito_em);
end $$;
revoke all on function public.leva_traz_estadia_marcar(uuid, uuid, text, boolean) from public, anon;
grant execute on function public.leva_traz_estadia_marcar(uuid, uuid, text, boolean) to authenticated;

-- =====================================================================================================================
-- B. Promoção na creche e no hotel
-- =====================================================================================================================

alter table public.promocoes add column if not exists banho_tosa boolean not null default true;
alter table public.promocoes add column if not exists casa text[] not null default '{}'
  check (casa <@ array['creche', 'hotel']::text[]);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'promocoes_tem_onde') then
    alter table public.promocoes add constraint promocoes_tem_onde check (banho_tosa or cardinality(casa) > 0);
  end if;
end $$;
-- promocoes tem leitura da tabela inteira (20261205): as colunas novas já saem para a equipe.

-- a promoção da estadia (estadias tem a leitura coluna por coluna)
alter table public.estadias add column if not exists promo jsonb check (promo is null or jsonb_typeof(promo) = 'object');
grant select (promo) on public.estadias to authenticated;

-- o desconto dado nas estadias (o banco grava, a partir da conta guardada no check-out)
alter table public.promo_usos add column if not exists estadia_id uuid references public.estadias (id) on delete set null;
create unique index if not exists promo_usos_estadia on public.promo_usos (estadia_id) where estadia_id is not null;

-- ---------- a promoção que vale para uma estadia ----------
-- As noites (hotel) ou os dias (creche) de p_entrada até antes de p_saida; sem saída: a noite da entrada e as 6 seguintes
-- (hotel) ou o dia da entrada (creche). Vale a promoção ligada, criada até p_criado_ate, para o tipo, com pelo menos uma noite
-- (ou o dia) num dos dias da semana dela, dentro do começo e do fim. Mais de uma: a que dá mais desconto pela diária
-- (empate: a mais antiga). A cópia guarda os dias, o começo e o fim: o check-out confere noite a noite.
-- Só responde de dentro de um gatilho (como promo_do_horario): chamada direta pela API devolve vazio.
create or replace function public.promo_da_estadia(p_petshop uuid, p_tipo text, p_entrada timestamptz, p_saida timestamptz, p_diaria numeric, p_criado_ate timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fuso text; v_ini date; v_fim date; r jsonb;
begin
  if pg_trigger_depth() < 1 or p_tipo not in ('creche', 'hotel') or p_entrada is null then return null; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p_petshop;
  v_ini := (p_entrada at time zone v_fuso)::date;
  v_fim := case when p_saida is not null and (p_saida at time zone v_fuso)::date > v_ini then (p_saida at time zone v_fuso)::date - 1
                when p_tipo = 'hotel' and p_saida is null then v_ini + 6
                else v_ini end;
  v_fim := least(v_fim, v_ini + 59);
  select jsonb_build_object('id', x.id, 'nome', x.nome, 'tipo', x.tipo, 'valor', x.valor, 'dias', to_jsonb(x.dias),
           'comeca_em', x.comeca_em, 'termina_em', x.termina_em, 'casa', p_tipo) into r
    from public.promocoes x
    cross join lateral (
      select count(*) as n from generate_series(v_ini, v_fim, interval '1 day') g(d)
       where extract(dow from g.d)::int = any (x.dias)
         and (x.comeca_em is null or g.d::date >= x.comeca_em) and (x.termina_em is null or g.d::date <= x.termina_em)) k
   where x.petshop_id = p_petshop and x.ativa and x.criado_em <= coalesce(p_criado_ate, now())
     and p_tipo = any (x.casa) and k.n > 0
   order by k.n * case x.tipo when 'pct' then round(coalesce(p_diaria, 100) * x.valor / 100, 2) else least(x.valor, coalesce(p_diaria, 100)) end desc,
            x.criado_em, x.id
   limit 1;
  return r;
end $$;
revoke execute on function public.promo_da_estadia(uuid, text, timestamptz, timestamptz, numeric, timestamptz) from public, anon;
grant execute on function public.promo_da_estadia(uuid, text, timestamptz, timestamptz, numeric, timestamptz) to authenticated;

-- ---------- a estadia ganha a promoção ao ser marcada ----------
-- Roda como quem grava (sem security definer) para saber se veio da API (authenticated) ou de uma função do banco.
--  * marcar pela API: o banco põe a promoção que vale (o que veio no campo é ignorado; {"tirada": true} = marcar sem ela).
--  * marcar por uma função do banco (pedido do link, dia extra): sem promoção no campo, o banco põe a que vale.
--  * alterar pela API: a promoção não muda pelo campo. Mudou a entrada, a saída prevista ou o tipo de uma estadia ainda aberta:
--    vale a promoção das novas datas, entre as que já existiam quando ela foi marcada. Promoção tirada continua tirada.
--  * mensalista e dia de experiência: sem promoção.
create or replace function public.estadias_promo() returns trigger
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
    if new.mensalista is null and not coalesce(new.experiencia, false) and new.status in ('reservada', 'em_casa') then
      new.promo := public.promo_da_estadia(new.petshop_id, new.tipo, new.entrada, new.saida_prevista, new.valor_diaria, now());
      if v_tirar and new.promo is not null then new.promo := new.promo || '{"tirada": true}'::jsonb; end if;
    end if;
    return new;
  end if;
  if not v_api then return new; end if;
  new.promo := old.promo;
  if new.mensalista is not null or coalesce(new.experiencia, false) then
    new.promo := null;
  elsif (new.entrada is distinct from old.entrada or new.saida_prevista is distinct from old.saida_prevista or new.tipo is distinct from old.tipo)
     and old.status in ('reservada', 'em_casa') and new.status in ('reservada', 'em_casa') and coalesce(old.promo ->> 'tirada', '') <> 'true' then
    new.promo := public.promo_da_estadia(new.petshop_id, new.tipo, new.entrada, new.saida_prevista, new.valor_diaria, old.criado_em);
  end if;
  return new;
end $$;
revoke execute on function public.estadias_promo() from public, anon, authenticated;
drop trigger if exists estadias_promo on public.estadias;
create trigger estadias_promo before insert or update on public.estadias
  for each row execute function public.estadias_promo();

-- ---------- tirar ou pôr de volta a promoção de uma estadia ----------
-- Quem cuida da creche e hotel e quem recebe (Caixa, Financeiro, Relatórios). Depois da conta fechada, não muda mais.
-- Pôr de volta: a cópia que a estadia já tinha; sem cópia, a promoção que vale (entre as que existiam quando ela foi marcada).
create or replace function public.estadia_promo_usar(p_id uuid, p_usar boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e public.estadias; v_promo jsonb; v_fuso text; v_ini date; v_fim date;
begin
  select * into e from public.estadias x where x.id = p_id for update;
  if not found or not public.tenho_area(e.petshop_id, array['creche_hotel', 'caixa', 'financeiro', 'relatorios']) then
    raise exception 'Estadia não encontrada.' using errcode = 'P0002';
  end if;
  if not public.acesso_liberado(e.petshop_id) then raise exception 'O acesso do pet shop está bloqueado.' using errcode = '42501'; end if;
  if e.status = 'cancelada' or (e.status = 'encerrada' and e.valor_cobrado is not null)
     or exists (select 1 from public.estadias_valores v where v.estadia_id = e.id and v.conta is not null) then
    raise exception 'A conta desta estadia já foi fechada: a promoção não muda mais.' using errcode = '22023';
  end if;
  if e.mensalista is not null or e.experiencia then
    raise exception 'Mensalista e dia de experiência não têm promoção.' using errcode = '22023';
  end if;
  if coalesce(p_usar, false) then
    if e.promo is not null then
      v_promo := e.promo - 'tirada';
    else
      -- promo_da_estadia só responde de dentro de um gatilho: aqui a conta é feita direto (a mesma regra)
      select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = e.petshop_id;
      v_ini := (e.entrada at time zone v_fuso)::date;
      v_fim := case when e.saida_prevista is not null and (e.saida_prevista at time zone v_fuso)::date > v_ini then (e.saida_prevista at time zone v_fuso)::date - 1
                    when e.tipo = 'hotel' and e.saida_prevista is null then v_ini + 6 else v_ini end;
      v_fim := least(v_fim, v_ini + 59);
      select jsonb_build_object('id', x.id, 'nome', x.nome, 'tipo', x.tipo, 'valor', x.valor, 'dias', to_jsonb(x.dias),
               'comeca_em', x.comeca_em, 'termina_em', x.termina_em, 'casa', e.tipo) into v_promo
        from public.promocoes x
       where x.petshop_id = e.petshop_id and x.ativa and x.criado_em <= e.criado_em and e.tipo = any (x.casa)
         and exists (select 1 from generate_series(v_ini, v_fim, interval '1 day') g(d)
                      where extract(dow from g.d)::int = any (x.dias)
                        and (x.comeca_em is null or g.d::date >= x.comeca_em) and (x.termina_em is null or g.d::date <= x.termina_em))
       order by x.criado_em limit 1;
    end if;
  else
    v_promo := case when e.promo is null then null else e.promo || '{"tirada": true}'::jsonb end;
  end if;
  update public.estadias x set promo = v_promo where x.id = e.id;
  return v_promo;
end $$;
revoke execute on function public.estadia_promo_usar(uuid, boolean) from public, anon;
grant execute on function public.estadia_promo_usar(uuid, boolean) to authenticated;

-- ---------- o pedido do link de creche e hotel: aceito, a estadia fica com a promoção do pedido ----------
create or replace function public.pedidos_promo_estadia() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.promo is not null and new.tipo in ('creche', 'hotel') and new.estadia_id is not null and old.estadia_id is null then
    update public.estadias e set promo = new.promo
     where e.id = new.estadia_id and e.petshop_id = new.petshop_id and e.mensalista is null and not e.experiencia
       and e.status in ('reservada', 'em_casa')
       and coalesce(e.promo ->> 'tirada', '') <> 'true' and e.promo is distinct from new.promo;
  end if;
  return null;
end $$;
revoke execute on function public.pedidos_promo_estadia() from public, anon, authenticated;
drop trigger if exists pedidos_promo_estadia on public.pedidos_agendamento;
create trigger pedidos_promo_estadia after update of estadia_id on public.pedidos_agendamento
  for each row execute function public.pedidos_promo_estadia();

-- ---------- o desconto dado no check-out vai para promo_usos ----------
-- A tela guarda a conta em estadias_valores.conta, com promo = { id, nome, desconto } quando a linha da promoção ficou na conta.
-- O banco anota uma vez por estadia, só se a estadia tem a promoção (não tirada), e nunca mais do que ela pode dar:
-- % da promoção sobre as diárias, ou o valor em reais por diária, até o total das diárias.
create or replace function public.estadias_valores_promo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  e record; v_desc numeric; v_max numeric; v_diarias numeric; v_n numeric; v_lanc uuid;
begin
  begin
    if new.conta is null or jsonb_typeof(new.conta -> 'promo') <> 'object' then return null; end if;
    if jsonb_typeof(new.conta -> 'promo' -> 'desconto') <> 'number' then return null; end if;
    v_desc := round((new.conta -> 'promo' ->> 'desconto')::numeric, 2);
    if v_desc <= 0 then return null; end if;
    select x.id, x.petshop_id, x.promo into e from public.estadias x where x.id = new.estadia_id and x.petshop_id = new.petshop_id;
    if e.id is null or e.promo is null or coalesce(e.promo ->> 'tirada', '') = 'true' then return null; end if;
    v_diarias := case when jsonb_typeof(new.conta -> 'total_diarias') = 'number' then (new.conta ->> 'total_diarias')::numeric else 0 end;
    v_n := case when jsonb_typeof(new.conta -> 'diarias') = 'number' then (new.conta ->> 'diarias')::numeric else 1 end;
    v_max := case when e.promo ->> 'tipo' = 'pct' then round(v_diarias * (e.promo ->> 'valor')::numeric / 100, 2)
                  else least(v_diarias, (e.promo ->> 'valor')::numeric * greatest(v_n, 1)) end;
    v_desc := least(v_desc, greatest(v_max, 0));
    if v_desc <= 0 then return null; end if;
    v_lanc := case when (new.conta ->> 'lancamento_id') ~ '^[0-9a-fA-F-]{36}$' then (new.conta ->> 'lancamento_id')::uuid end;
    if v_lanc is not null and not exists (select 1 from public.lancamentos l where l.id = v_lanc and l.petshop_id = new.petshop_id) then v_lanc := null; end if;
    insert into public.promo_usos (petshop_id, promo_id, promo_nome, estadia_id, lancamento_id, desconto)
      values (new.petshop_id, case when (e.promo ->> 'id') ~ '^[0-9a-fA-F-]{36}$' then (e.promo ->> 'id')::uuid end,
              left(coalesce(e.promo ->> 'nome', 'Promoção'), 60), new.estadia_id, v_lanc, v_desc)
      on conflict do nothing;
  exception when others then
    -- o relatório é só um apoio: nunca derruba o check-out
    raise warning 'estadias_valores_promo: %', sqlerrm;
  end;
  return null;
end $$;
revoke execute on function public.estadias_valores_promo() from public, anon, authenticated;
drop trigger if exists estadias_valores_promo on public.estadias_valores;
create trigger estadias_valores_promo after insert or update of conta on public.estadias_valores
  for each row execute function public.estadias_valores_promo();

-- ---------- trocas ----------

-- Cópia fiel de promo_do_horario (20261205), mais: só promoções que valem no banho e tosa (x.banho_tosa).
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
   where x.petshop_id = p_petshop and x.ativa and x.banho_tosa and x.criado_em <= coalesce(p_criado_ate, now())
     and v_dow = any (x.dias)
     and (x.hora_de is null or v_hora >= x.hora_de) and (x.hora_ate is null or v_hora < x.hora_ate)
     and (x.comeca_em is null or v_dia >= x.comeca_em) and (x.termina_em is null or v_dia <= x.termina_em)
     and public.promo_servico_entra(to_jsonb(x.servicos), p_petshop, p_servico)
   order by case x.tipo when 'pct' then round(coalesce(v_preco, 100) * x.valor / 100, 2) else least(x.valor, coalesce(v_preco, 100)) end desc, x.criado_em, x.id
   limit 1;
  return r;
end $$;

-- Cópia fiel de agendamento_promo_usar (20261205), mais: ao pôr de volta sem cópia, só promoções do banho e tosa (x.banho_tosa).
create or replace function public.agendamento_promo_usar(p_id uuid, p_usar boolean) returns jsonb
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
       where x.petshop_id = a.petshop_id and x.ativa and x.banho_tosa and x.criado_em <= a.criado_em
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

-- Cópia fiel de promocao_salvar (20261205), mais: banho_tosa (padrão sim) e casa ('creche', 'hotel'). Pelo menos um dos dois.
-- Sem banho e tosa, a lista de serviços e a faixa de hora não valem (ficam em branco).
-- p_dados: { nome, dias: [2, 3], hora_de, hora_ate, servicos, tipo, valor, comeca_em, termina_em, ativa, banho_tosa, casa: ["creche"] }.
create or replace function public.promocao_salvar(p uuid, p_id uuid, p_dados jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid; v_servicos uuid[]; v_dias smallint[]; v_nome text; v_tipo text; v_valor numeric;
  v_de time; v_ate time; v_ini date; v_fim date; v_banho boolean; v_casa text[];
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
  exception when others then
    raise exception 'Confira os dados da promoção.' using errcode = '22023';
  end;
  if not (v_casa <@ array['creche', 'hotel']::text[]) then raise exception 'A promoção vale para banho e tosa, creche ou hotel.' using errcode = '22023'; end if;
  if not v_banho and cardinality(v_casa) = 0 then raise exception 'Escolha onde a promoção vale: banho e tosa, creche ou hotel.' using errcode = '22023'; end if;
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
    insert into public.promocoes (petshop_id, nome, dias, hora_de, hora_ate, servicos, tipo, valor, comeca_em, termina_em, ativa, criado_por, banho_tosa, casa)
    values (p, v_nome, v_dias, v_de, v_ate, v_servicos, v_tipo, round(v_valor, 2), v_ini, v_fim, coalesce((p_dados ->> 'ativa')::boolean, true), (select auth.uid()), v_banho, v_casa)
    returning id into v_id;
  else
    update public.promocoes x set nome = v_nome, dias = v_dias, hora_de = v_de, hora_ate = v_ate, servicos = v_servicos, tipo = v_tipo,
      valor = round(v_valor, 2), comeca_em = v_ini, termina_em = v_fim, ativa = coalesce((p_dados ->> 'ativa')::boolean, x.ativa), atualizado_em = now(),
      banho_tosa = v_banho, casa = v_casa
     where x.id = p_id and x.petshop_id = p
    returning x.id into v_id;
    if v_id is null then raise exception 'Promoção não encontrada.' using errcode = 'P0002'; end if;
  end if;
  return v_id;
end $$;

-- Cópia fiel de link_promocoes (20261205), mais: banho_tosa e casa; sem banho e tosa, a lista de serviços vem vazia.
-- A creche e o hotel só aparecem quando o link recebe pedido deles (link_creche, link_hotel).
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
     and (x.termina_em is null or x.termina_em >= (now() at time zone p.fuso)::date)
$$;

-- Cópia fiel de pedidos_promo (20261205), mais: o pedido de creche ou hotel (que não é dia de experiência) leva a promoção
-- da estadia pedida (pela diária sugerida do porte).
create or replace function public.pedidos_promo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.promo := case when new.tipo = 'servico' then public.promo_do_horario(new.petshop_id, new.servico_id, new.porte, new.inicio, now())
                    when new.tipo in ('creche', 'hotel') and not coalesce(new.experiencia, false)
                      then public.promo_da_estadia(new.petshop_id, new.tipo, new.inicio, new.fim, public.diaria_sugerida(new.petshop_id, new.tipo, new.porte), now()) end;
  return new;
end $$;

-- Cópia fiel de relatorio_promocoes (20261205), mais: as estadias marcadas com a promoção (estadias, encerradas: pelo dia da
-- entrada, sem as canceladas e as tiradas) e o desconto delas em promo_usos (pelo dia da conta; sem conta lançada, pelo dia em
-- que foi anotado). Os campos de antes (marcados, concluidos) continuam sendo dos horários.
create or replace function public.relatorio_promocoes(p uuid, p_de date, p_ate date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_fuso text;
begin
  if not public.tenho_area(p, array['financeiro', 'relatorios']) then raise exception 'Sem permissão para este relatório.' using errcode = '42501'; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', z.id, 'nome', z.nome, 'marcados', z.marcados, 'concluidos', z.concluidos,
             'estadias', z.estadias, 'encerradas', z.encerradas,
             'contas', z.contas, 'desconto', z.desconto) order by z.desconto desc, z.marcados desc, z.nome)
    from (
      select k.id, max(k.nome) as nome, sum(k.marcados)::int as marcados, sum(k.concluidos)::int as concluidos,
             sum(k.estadias)::int as estadias, sum(k.encerradas)::int as encerradas,
             sum(k.contas)::int as contas, round(sum(k.desconto), 2) as desconto
      from (
        select (a.promo ->> 'id') as id, a.promo ->> 'nome' as nome, 1 as marcados, case when a.status = 'concluido' then 1 else 0 end as concluidos,
               0 as estadias, 0 as encerradas, 0 as contas, 0::numeric as desconto
          from public.agendamentos a
         where a.petshop_id = p and a.promo is not null and coalesce(a.promo ->> 'tirada', '') <> 'true'
           and a.status not in ('cancelado', 'faltou')
           and (a.inicio at time zone v_fuso)::date between p_de and p_ate
        union all
        select (e.promo ->> 'id'), e.promo ->> 'nome', 0, 0, 1, case when e.status = 'encerrada' then 1 else 0 end, 0, 0
          from public.estadias e
         where e.petshop_id = p and e.promo is not null and coalesce(e.promo ->> 'tirada', '') <> 'true'
           and e.status <> 'cancelada'
           and (e.entrada at time zone v_fuso)::date between p_de and p_ate
        union all
        select u.promo_id::text, u.promo_nome, 0, 0, 0, 0, 1, u.desconto
          from public.promo_usos u left join public.lancamentos l on l.id = u.lancamento_id
         where u.petshop_id = p and (u.lancamento_id is null or l.id is not null)
           and coalesce(l.data, (u.criado_em at time zone v_fuso)::date) between p_de and p_ate
      ) k
      group by k.id
    ) z), '[]'::jsonb);
end $$;
