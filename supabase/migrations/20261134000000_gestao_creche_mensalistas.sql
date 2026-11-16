-- Creche com mensalistas: plano por pet (dias fixos da semana e mensalidade), chamada do dia, dias extras,
-- vagas contando os mensalistas e cobrança do mês ligada a uma conta a receber.
-- Tudo aqui só acrescenta: quem não tem plano cadastrado segue exatamente como antes.

-- ============================================================
-- Ajuste do pet shop: travar o check-in da creche com vacina vencida (desligado por padrão)
-- ============================================================
alter table public.petshops add column creche_bloqueia_vacina boolean not null default false;
-- A equipe lê; só o dono altera (a regra petshops_editar já confere o dono).
grant select (creche_bloqueia_vacina) on public.petshops to authenticated;
grant update (creche_bloqueia_vacina) on public.petshops to authenticated;

-- ============================================================
-- Plano do mensalista (sem dinheiro: a equipe da creche lê e cuida)
-- ============================================================
create table public.creche_planos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  pet_id uuid not null,
  -- dias da semana em que o pet vem: 0 = domingo ... 6 = sábado
  dias smallint[] not null check (cardinality(dias) between 1 and 7 and dias <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  vence_dia smallint not null default 5 check (vence_dia between 1 and 28),
  inicio date not null,
  fim date check (fim is null or fim >= inicio),
  obs text check (obs is null or char_length(obs) <= 600),
  -- pausa (viagem, doença): nesses dias o pet não é esperado, não leva falta e a mensalidade sugerida é proporcional
  pausa_de date,
  pausa_ate date,
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (id, petshop_id),
  foreign key (pet_id, petshop_id) references public.pets (id, petshop_id) on delete cascade,
  check ((pausa_de is null and pausa_ate is null) or (pausa_de is not null and pausa_ate is not null and pausa_ate >= pausa_de))
);
create index on public.creche_planos (petshop_id);
create index on public.creche_planos (pet_id);
-- um plano em aberto por pet
create unique index creche_planos_um_aberto on public.creche_planos (pet_id) where fim is null;

-- Dois planos do mesmo pet não podem valer no mesmo dia. Os dias ficam sem repetição e em ordem.
create function public.creche_plano_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.dias := (select array_agg(d order by d) from (select distinct unnest(new.dias) as d) x);
  -- quem grava dois planos do mesmo pet ao mesmo tempo espera a vez
  perform 1 from public.pets where id = new.pet_id for update;
  if exists (
    select 1 from public.creche_planos o
    where o.pet_id = new.pet_id and o.id <> new.id
      and o.inicio <= coalesce(new.fim, 'infinity'::date) and coalesce(o.fim, 'infinity'::date) >= new.inicio
  ) then
    raise exception 'Este pet já tem um plano de creche nesse período. Encerre o plano atual antes de criar outro.';
  end if;
  return new;
end $$;
create trigger creche_plano_conferir before insert or update on public.creche_planos
  for each row execute function public.creche_plano_conferir();

alter table public.creche_planos enable row level security;
revoke all on public.creche_planos from anon, authenticated;
grant select, insert, delete on public.creche_planos to authenticated;
grant update (dias, vence_dia, inicio, fim, obs, pausa_de, pausa_ate) on public.creche_planos to authenticated;
create policy creche_planos_ler on public.creche_planos for select to authenticated
  using (petshop_id in (select public.meus_petshops()));
create policy creche_planos_criar on public.creche_planos for insert to authenticated
  with check ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)));
create policy creche_planos_editar on public.creche_planos for update to authenticated
  using ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)))
  with check (petshop_id in (select public.meus_petshops()));
create policy creche_planos_remover on public.creche_planos for delete to authenticated
  using ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)));

-- ============================================================
-- Valores do plano: tabela à parte, só para quem vê o financeiro
-- ============================================================
create table public.creche_planos_valores (
  plano_id uuid primary key,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  valor_mensal numeric(10, 2) not null check (valor_mensal >= 0 and valor_mensal <= 99999.99),
  -- preço de um dia extra; vazio = a diária da creche definida em Meu pet shop
  valor_extra numeric(10, 2) check (valor_extra is null or (valor_extra >= 0 and valor_extra <= 99999.99)),
  atualizado_em timestamptz not null default now(),
  foreign key (plano_id, petshop_id) references public.creche_planos (id, petshop_id) on delete cascade
);
create index on public.creche_planos_valores (petshop_id);
alter table public.creche_planos_valores enable row level security;
revoke all on public.creche_planos_valores from anon, authenticated;
grant select, insert, update, delete on public.creche_planos_valores to authenticated;
create policy creche_planos_valores_ler on public.creche_planos_valores for select to authenticated
  using ((select public.vejo_financeiro(petshop_id)));
create policy creche_planos_valores_criar on public.creche_planos_valores for insert to authenticated
  with check ((select public.vejo_financeiro(petshop_id)) and (select public.acesso_liberado(petshop_id)));
create policy creche_planos_valores_editar on public.creche_planos_valores for update to authenticated
  using ((select public.vejo_financeiro(petshop_id)) and (select public.acesso_liberado(petshop_id)))
  with check ((select public.vejo_financeiro(petshop_id)));
create policy creche_planos_valores_remover on public.creche_planos_valores for delete to authenticated
  using ((select public.vejo_financeiro(petshop_id)) and (select public.acesso_liberado(petshop_id)));

-- ============================================================
-- Cobrança do mês (só para quem vê o financeiro; grava só pelas funções abaixo)
-- ============================================================
create table public.creche_cobrancas (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  plano_id uuid not null references public.creche_planos (id),
  pet_id uuid not null,
  cliente_id uuid,
  mes date not null check (extract(day from mes) = 1),
  -- valor do plano na hora e o que foi cobrado de mensalidade (menor quando o plano começou no meio do mês)
  valor_cheio numeric(10, 2) not null check (valor_cheio >= 0),
  valor_mensal numeric(10, 2) not null check (valor_mensal >= 0),
  -- dias extras do mês anterior que entraram nesta cobrança: [{"dia": "2026-10-03", "valor": 60}]
  extras jsonb not null default '[]'::jsonb check (jsonb_typeof(extras) = 'array'),
  valor_extras numeric(10, 2) not null default 0 check (valor_extras >= 0),
  desconto numeric(10, 2) not null default 0 check (desconto >= 0),
  total numeric(10, 2) not null check (total >= 0),
  vencimento date not null,
  status text not null default 'aberta' check (status in ('aberta', 'cancelada')),
  lancamento_id uuid references public.lancamentos (id) on delete set null,
  cobrado_em timestamptz,
  obs text check (obs is null or char_length(obs) <= 300),
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  -- uma cobrança por plano e por mês: gerar de novo nunca duplica
  unique (plano_id, mes),
  foreign key (pet_id, petshop_id) references public.pets (id, petshop_id) on delete cascade,
  foreign key (cliente_id, petshop_id) references public.clientes (id, petshop_id) on delete set null (cliente_id)
);
create index on public.creche_cobrancas (petshop_id, mes);
create index on public.creche_cobrancas (lancamento_id);
alter table public.creche_cobrancas enable row level security;
revoke all on public.creche_cobrancas from anon, authenticated;
grant select on public.creche_cobrancas to authenticated;
create policy creche_cobrancas_ler on public.creche_cobrancas for select to authenticated
  using ((select public.vejo_financeiro(petshop_id)));

-- ============================================================
-- Presença: a estadia de creche de sempre, agora ligada ao plano
-- ============================================================
-- mensalista: 'plano' = dia do plano; 'extra' = veio fora do dia (entra na cobrança); 'reposicao' = repôs uma falta (não cobra).
-- dia: o dia da chamada. Estadias avulsas (as de hoje em dia) ficam com tudo vazio.
alter table public.estadias
  add column plano_id uuid references public.creche_planos (id) on delete set null,
  add column mensalista text check (mensalista in ('plano', 'extra', 'reposicao')),
  add column dia date,
  add column cobranca_id uuid references public.creche_cobrancas (id) on delete set null,
  add constraint estadias_mensalista_completa check ((mensalista is null and dia is null) or (mensalista is not null and dia is not null and tipo = 'creche'));
-- duas pessoas com a chamada aberta: só uma presença por pet e por dia
create unique index estadias_uma_presenca_por_dia on public.estadias (pet_id, dia) where mensalista is not null and status <> 'cancelada';
create index on public.estadias (plano_id) where plano_id is not null;
create index on public.estadias (cobranca_id) where cobranca_id is not null;

-- As marcas de mensalista só mudam pelas funções da chamada e da cobrança (elas avisam com `maestro.creche`).
create function public.estadias_travar_mensalista() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- as funções da creche, o banco por dentro (limpeza quando um plano ou uma cobrança é apagada) e quem não é usuário passam
  if coalesce(current_setting('maestro.creche', true), '') = '1' or (select auth.uid()) is null or pg_trigger_depth() > 1 then return new; end if;
  if tg_op = 'INSERT' then
    if new.mensalista is not null or new.plano_id is not null or new.dia is not null or new.cobranca_id is not null then
      raise exception 'A presença de mensalista é marcada pela chamada da creche.';
    end if;
  elsif new.mensalista is distinct from old.mensalista or new.dia is distinct from old.dia or new.cobranca_id is distinct from old.cobranca_id
     or new.plano_id is distinct from old.plano_id
     or (old.mensalista is not null and (new.tipo <> 'creche' or new.pet_id <> old.pet_id)) then
    raise exception 'A presença de mensalista é marcada pela chamada da creche.';
  end if;
  return new;
end $$;
create trigger estadias_travar_mensalista before insert or update on public.estadias
  for each row execute function public.estadias_travar_mensalista();

-- Falta de um mensalista num dia do plano (com ou sem aviso).
create table public.creche_faltas (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  plano_id uuid not null,
  pet_id uuid not null,
  dia date not null,
  avisou boolean not null default false,
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (pet_id, dia),
  foreign key (plano_id, petshop_id) references public.creche_planos (id, petshop_id) on delete cascade,
  foreign key (pet_id, petshop_id) references public.pets (id, petshop_id) on delete cascade
);
create index on public.creche_faltas (petshop_id, dia);
alter table public.creche_faltas enable row level security;
revoke all on public.creche_faltas from anon, authenticated;
grant select on public.creche_faltas to authenticated;
create policy creche_faltas_ler on public.creche_faltas for select to authenticated
  using (petshop_id in (select public.meus_petshops()));

-- ============================================================
-- Vagas: os mensalistas contam
-- ============================================================
-- O pet shop abre nesse dia da semana? Sem horário preenchido, vale todo dia. (Mesma regra de `horarioDoDia` no aplicativo.)
create function public.creche_abre(p_horario jsonb, p_dia date) returns boolean
language sql immutable set search_path = '' as $$
  select case
    when p_horario is null or jsonb_typeof(p_horario) <> 'object' then true
    when not exists (select 1 from jsonb_each(p_horario) x
                     where jsonb_typeof(x.value) = 'object' and coalesce(x.value ->> 'abre', '') <> '' and coalesce(x.value ->> 'fecha', '') <> '') then true
    else coalesce(p_horario -> (extract(dow from p_dia)::int::text) ->> 'abre', '') <> ''
     and coalesce(p_horario -> (extract(dow from p_dia)::int::text) ->> 'fecha', '') <> ''
  end
$$;

-- Quantos mensalistas ocupam vaga na creche no dia (de hoje em diante), além das estadias que já contam.
-- Conta o plano que vale no dia, num dia da semana dele, com o pet shop aberto. Não conta quem já faltou,
-- quem já saiu nem quem já tem estadia de creche contando nesse dia (para não contar duas vezes).
-- É a mesma regra de `mensalistasNoDia` em src/lib/gestao/creche.ts. Se mudar lá, mude aqui.
create function public.creche_planos_ocupam(p_petshop uuid, p_dia date, p_hoje date) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int
  from public.creche_planos pl
  join public.petshops s on s.id = pl.petshop_id
  join public.pets pt on pt.id = pl.pet_id and pt.ativo
  where pl.petshop_id = p_petshop and p_dia >= p_hoje
    and pl.inicio <= p_dia and (pl.fim is null or pl.fim >= p_dia)
    and not (pl.pausa_de is not null and p_dia between pl.pausa_de and pl.pausa_ate)
    and extract(dow from p_dia)::smallint = any (pl.dias)
    and public.creche_abre(s.horario, p_dia)
    and not exists (select 1 from public.creche_faltas f where f.pet_id = pl.pet_id and f.dia = p_dia)
    and not exists (
      select 1 from public.estadias e
      where e.pet_id = pl.pet_id and e.tipo = 'creche' and (
        (e.status in ('reservada', 'em_casa')
          and public.estadia_ocupa(e.tipo, e.status, (e.entrada at time zone s.fuso)::date, (e.saida_prevista at time zone s.fuso)::date, p_dia, p_hoje))
        or (e.status = 'encerrada' and coalesce(e.dia, (e.entrada at time zone s.fuso)::date) = p_dia)))
$$;
revoke execute on function public.creche_planos_ocupam(uuid, date, date) from public, anon, authenticated;
revoke execute on function public.creche_abre(jsonb, date), public.creche_plano_conferir(), public.estadias_travar_mensalista() from public, anon;
grant execute on function public.creche_abre(jsonb, date) to authenticated;

-- Link público: os dias cheios passam a contar os mensalistas da creche. Mesma assinatura; sem plano, a conta de vagas é a de antes.
-- Dia em que o pet shop não abre (pelo horário de Meu pet shop) também volta como indisponível para a creche: o link não oferece nem aceita.
create or replace function public.link_estadia_cheios(p_codigo text, p_tipo text, p_de date, p_ate date) returns setof date
language sql stable security definer set search_path = '' as $$
  select d::date
  from public.petshops p, generate_series(p_de, least(p_ate, p_de + 62), interval '1 day') d
  where p.link_codigo = p_codigo and p.link_ativo and p_tipo in ('creche', 'hotel')
    and ((p_tipo = 'creche' and not public.creche_abre(p.horario, d::date))
     or ((case p_tipo when 'creche' then p.vagas_creche else p.vagas_hotel end) is not null
    and (
      (select count(*) from public.estadias e where e.petshop_id = p.id and e.tipo = p_tipo and e.status in ('reservada', 'em_casa')
         and public.estadia_ocupa(e.tipo, e.status, (e.entrada at time zone p.fuso)::date, (e.saida_prevista at time zone p.fuso)::date, d::date, (now() at time zone p.fuso)::date))
      + (select count(*) from public.pedidos_agendamento x where x.petshop_id = p.id and x.tipo = p_tipo and x.status = 'pendente'
         and public.estadia_ocupa(x.tipo, 'reservada', (x.inicio at time zone p.fuso)::date, (x.fim at time zone p.fuso)::date, d::date, (now() at time zone p.fuso)::date))
      + (case when p_tipo = 'creche' then public.creche_planos_ocupam(p.id, d::date, (now() at time zone p.fuso)::date) else 0 end)
    ) >= (case p_tipo when 'creche' then p.vagas_creche else p.vagas_hotel end)))
$$;

-- Aceitar pedido: igual a antes, e a conferência de casa cheia da creche conta os mensalistas (p_forcar segue passando do limite).
create or replace function public.pedido_aceitar(p_id uuid, p_profissional uuid default null, p_forcar boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v public.pedidos_agendamento;
  s public.petshops;
  v_cliente uuid;
  v_pet uuid;
  v_porte text;
  v_preco numeric(10, 2);
  v_ag uuid;
  v_de date; v_ate date; v_hoje date; v_vagas int; v_cheio date; v_outra public.estadias;
begin
  select * into v from public.pedidos_agendamento where id = p_id for update;
  if not found or v.petshop_id not in (select public.meus_petshops()) then raise exception 'Pedido não encontrado.'; end if;
  if not public.acesso_liberado(v.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if v.status <> 'pendente' then raise exception 'Esse pedido já foi respondido.'; end if;
  if p_profissional is not null and not exists (select 1 from public.profissionais where id = p_profissional and petshop_id = v.petshop_id) then
    raise exception 'Profissional inválido.';
  end if;
  select * into s from public.petshops where id = v.petshop_id;

  select id into v_cliente from public.clientes
    where petshop_id = v.petshop_id and right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8) = right(v.telefone, 8)
    order by criado_em limit 1;
  if v_cliente is null then
    insert into public.clientes (petshop_id, nome, telefone) values (v.petshop_id, v.tutor_nome, v.telefone) returning id into v_cliente;
  end if;
  select id, porte into v_pet, v_porte from public.pets
    where petshop_id = v.petshop_id and cliente_id = v_cliente and lower(trim(nome)) = lower(trim(v.pet_nome)) order by criado_em limit 1;
  if v_pet is null then
    insert into public.pets (petshop_id, cliente_id, nome, especie, porte) values (v.petshop_id, v_cliente, v.pet_nome, v.especie, v.porte)
      returning id, porte into v_pet, v_porte;
  end if;

  if v.tipo in ('creche', 'hotel') then
    v_hoje := (now() at time zone s.fuso)::date;
    v_de := (v.inicio at time zone s.fuso)::date;
    v_ate := (v.fim at time zone s.fuso)::date;
    select * into v_outra from public.estadias e
      where e.pet_id = v_pet and e.status in ('reservada', 'em_casa')
        and (e.entrada at time zone s.fuso)::date <= v_ate
        and coalesce((e.saida_prevista at time zone s.fuso)::date, case when e.status = 'em_casa' then v_ate else (e.entrada at time zone s.fuso)::date end) >= v_de
      limit 1;
    if found then
      raise exception '% já tem % de % a % nessas datas. Recuse este pedido ou mude a outra reserva antes.', v.pet_nome,
        case when v_outra.status = 'em_casa' then 'estadia' else 'reserva' end,
        to_char(v_outra.entrada at time zone s.fuso, 'DD/MM'), coalesce(to_char(v_outra.saida_prevista at time zone s.fuso, 'DD/MM'), 'sem saída marcada');
    end if;
    v_vagas := case v.tipo when 'creche' then s.vagas_creche else s.vagas_hotel end;
    if v_vagas is not null and not coalesce(p_forcar, false) then
      select min(d::date) into v_cheio from generate_series(v_de, case when v.tipo = 'hotel' then v_ate - 1 else v_ate end, interval '1 day') d
        where (select count(*) from public.estadias e where e.petshop_id = s.id and e.tipo = v.tipo and e.status in ('reservada', 'em_casa')
                 and public.estadia_ocupa(e.tipo, e.status, (e.entrada at time zone s.fuso)::date, (e.saida_prevista at time zone s.fuso)::date, d::date, v_hoje))
              + (case when v.tipo = 'creche' then public.creche_planos_ocupam(s.id, d::date, v_hoje) else 0 end) >= v_vagas;
      if v_cheio is not null then
        raise exception 'CASA_CHEIA: em % a % já está com as % vagas ocupadas.', to_char(v_cheio, 'DD/MM'), case v.tipo when 'creche' then 'creche' else 'casa do hotel' end, v_vagas;
      end if;
    end if;
    insert into public.estadias (petshop_id, pet_id, tipo, entrada, saida_prevista, valor_diaria, status, obs)
      values (v.petshop_id, v_pet, v.tipo, v.inicio, v.fim, case v.tipo when 'creche' then s.diaria_creche else s.diaria_hotel end, 'reservada', v.obs)
      returning id into v_ag;
    update public.pedidos_agendamento set status = 'aceito', estadia_id = v_ag where id = p_id;
    return v_ag;
  end if;

  select case coalesce(v_porte, v.porte) when 'P' then preco_p when 'M' then preco_m when 'G' then preco_g when 'GG' then preco_gg else null end
    into v_preco from public.servicos where id = v.servico_id;
  insert into public.agendamentos (petshop_id, pet_id, servico_id, profissional_id, inicio, fim, preco, obs, origem, criado_por)
    values (v.petshop_id, v_pet, v.servico_id, p_profissional, v.inicio, v.fim, v_preco, v.obs, 'link', (select auth.uid()))
    returning id into v_ag;
  update public.pedidos_agendamento set status = 'aceito', agendamento_id = v_ag where id = p_id;
  return v_ag;
end $$;

-- ============================================================
-- Chamada do dia
-- ============================================================
-- Vacinas vencidas do pet (só a dose que vale de cada vacina, como na carteirinha).
create function public.creche_vacinas_vencidas(p_pet uuid, p_hoje date) returns text
language sql stable security definer set search_path = '' as $$
  select string_agg(nome, ', ' order by nome) from (
    select distinct on (translate(lower(btrim(nome)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')) nome, vence_em
    from public.pets_saude where pet_id = p_pet and tipo = 'vacina'
    order by translate(lower(btrim(nome)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc'),
      coalesce(aplicado_em::text, '') desc, coalesce(vence_em::text, '') desc, criado_em desc
  ) x where vence_em < p_hoje
$$;
revoke execute on function public.creche_vacinas_vencidas(uuid, date) from public, anon, authenticated;

-- Um toque da chamada. p_acao: 'chegou' (dia do plano), 'extra' ou 'reposicao' (veio fora do dia), 'saiu', 'faltou', 'desfazer'.
-- Tudo passa pelo plano travado: duas pessoas tocando ao mesmo tempo não criam duas presenças.
-- Com o bloqueio de vacina ligado, a entrada é recusada com 'VACINA_VENCIDA: ...'; só o dono passa, com p_forcar.
create function public.creche_chamada(p_plano uuid, p_dia date, p_acao text, p_avisou boolean default false, p_forcar boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pl public.creche_planos;
  s public.petshops;
  v_pet public.pets;
  v_e public.estadias;
  v_outra public.estadias;
  v_hoje date;
  v_do_plano boolean;
  v_vacinas text;
  v_falta boolean;
begin
  select * into pl from public.creche_planos where id = p_plano for update;
  if not found or not public.tenho_area(pl.petshop_id, array['creche_hotel']) then raise exception 'Plano não encontrado.'; end if;
  if not public.acesso_liberado(pl.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if p_acao not in ('chegou', 'extra', 'reposicao', 'saiu', 'faltou', 'desfazer') then raise exception 'Ação inválida.'; end if;
  select * into s from public.petshops where id = pl.petshop_id;
  select * into v_pet from public.pets where id = pl.pet_id;
  v_hoje := (now() at time zone s.fuso)::date;
  if p_dia is null or p_dia > v_hoje then raise exception 'Não dá para fazer a chamada de um dia que ainda não chegou.'; end if;
  -- dias passados: os deste mês (e a última semana, para o esquecimento da virada do mês)
  if p_dia < least(date_trunc('month', v_hoje)::date, v_hoje - 7) then raise exception 'A chamada só pode ser corrigida nos dias deste mês.'; end if;
  if p_dia < pl.inicio or (pl.fim is not null and p_dia > pl.fim) then raise exception 'O plano de % não vale nesse dia.', v_pet.nome; end if;
  -- dia do plano: dia da semana dele, fora da pausa e com o pet shop aberto
  v_do_plano := extract(dow from p_dia)::smallint = any (pl.dias) and public.creche_abre(s.horario, p_dia)
    and not (pl.pausa_de is not null and p_dia between pl.pausa_de and pl.pausa_ate);
  perform set_config('maestro.creche', '1', true);

  select * into v_e from public.estadias where pet_id = pl.pet_id and dia = p_dia and mensalista is not null and status <> 'cancelada';
  v_falta := exists (select 1 from public.creche_faltas where pet_id = pl.pet_id and dia = p_dia);

  if p_acao in ('chegou', 'extra', 'reposicao') then
    if v_e.id is not null then return jsonb_build_object('ok', true, 'repetido', true, 'estadia', v_e.id); end if;
    if p_acao = 'chegou' and not v_do_plano then raise exception 'Esse dia não é do plano de %. Use "Veio fora do dia".', v_pet.nome; end if;
    if p_acao <> 'chegou' and v_do_plano then raise exception 'Esse dia já é do plano de %. Marque "Chegou" na chamada.', v_pet.nome; end if;
    -- check-in avulso no mesmo dia (feito pelo formulário de sempre): não entra de novo
    select * into v_outra from public.estadias e where e.pet_id = pl.pet_id and e.status in ('reservada', 'em_casa', 'encerrada') and e.mensalista is null
      and e.tipo = 'creche' and (e.entrada at time zone s.fuso)::date = p_dia limit 1;
    if found then raise exception '% já tem uma estadia avulsa nesse dia. Veja em Casa agora ou no Histórico.', v_pet.nome; end if;
    if s.creche_bloqueia_vacina and p_dia = v_hoje then
      v_vacinas := public.creche_vacinas_vencidas(pl.pet_id, v_hoje);
      if v_vacinas is not null and not (coalesce(p_forcar, false) and public.sou_dono(pl.petshop_id)) then
        raise exception 'VACINA_VENCIDA: %', v_vacinas;
      end if;
    end if;
    delete from public.creche_faltas where pet_id = pl.pet_id and dia = p_dia;
    if p_dia = v_hoje then
      select * into v_outra from public.estadias e where e.pet_id = pl.pet_id and e.status = 'em_casa' limit 1;
      if found then
        raise exception '% já está na casa desde %. Faça a saída antes de marcar a chegada de hoje.', v_pet.nome, to_char(v_outra.entrada at time zone s.fuso, 'DD/MM');
      end if;
      insert into public.estadias (petshop_id, pet_id, tipo, entrada, status, plano_id, mensalista, dia)
        values (pl.petshop_id, pl.pet_id, 'creche', now(), 'em_casa', pl.id, case p_acao when 'chegou' then 'plano' else p_acao end, p_dia)
        returning * into v_e;
    else
      -- dia que já passou: a presença entra encerrada, das 8h às 18h daquele dia
      insert into public.estadias (petshop_id, pet_id, tipo, entrada, saida, status, plano_id, mensalista, dia, diarias_cobradas)
        values (pl.petshop_id, pl.pet_id, 'creche', (p_dia::timestamp + time '08:00') at time zone s.fuso, (p_dia::timestamp + time '18:00') at time zone s.fuso,
          'encerrada', pl.id, case p_acao when 'chegou' then 'plano' else p_acao end, p_dia, 1)
        returning * into v_e;
    end if;
    return jsonb_build_object('ok', true, 'estadia', v_e.id);
  end if;

  if p_acao = 'saiu' then
    if v_e.id is null or v_e.status <> 'em_casa' then return jsonb_build_object('ok', true, 'repetido', true); end if;
    update public.estadias set status = 'encerrada', saida = now(), diarias_cobradas = 1 where id = v_e.id;
    return jsonb_build_object('ok', true, 'estadia', v_e.id);
  end if;

  if p_acao = 'faltou' then
    if v_e.id is not null then raise exception '% já está com presença nesse dia. Desfaça a presença antes de marcar a falta.', v_pet.nome; end if;
    if not v_do_plano then raise exception 'Esse dia não é do plano de %.', v_pet.nome; end if;
    insert into public.creche_faltas (petshop_id, plano_id, pet_id, dia, avisou) values (pl.petshop_id, pl.id, pl.pet_id, p_dia, coalesce(p_avisou, false))
      on conflict (pet_id, dia) do update set avisou = excluded.avisou;
    return jsonb_build_object('ok', true);
  end if;

  -- desfazer: a falta some; a saída de hoje volta para "na casa"; a chegada (ou a presença de um dia passado) é apagada
  if v_falta then
    delete from public.creche_faltas where pet_id = pl.pet_id and dia = p_dia;
    return jsonb_build_object('ok', true, 'desfeito', 'falta');
  end if;
  if v_e.id is null then return jsonb_build_object('ok', true, 'repetido', true); end if;
  if v_e.cobranca_id is not null then raise exception 'Esse dia extra já entrou numa cobrança. Cancele a cobrança antes de desfazer.'; end if;
  if v_e.status = 'encerrada' and p_dia = v_hoje then
    if exists (select 1 from public.estadias e where e.pet_id = pl.pet_id and e.status = 'em_casa') then
      raise exception '% já está na casa em outra estadia.', v_pet.nome;
    end if;
    update public.estadias set status = 'em_casa', saida = null, diarias_cobradas = null, valor_cobrado = null where id = v_e.id;
    return jsonb_build_object('ok', true, 'desfeito', 'saida');
  end if;
  delete from public.estadias where id = v_e.id;
  return jsonb_build_object('ok', true, 'desfeito', 'presenca');
exception when unique_violation then
  -- outra pessoa marcou no mesmo instante
  return jsonb_build_object('ok', true, 'repetido', true);
end $$;
revoke execute on function public.creche_chamada(uuid, date, text, boolean, boolean) from public, anon;
grant execute on function public.creche_chamada(uuid, date, text, boolean, boolean) to authenticated;

-- ============================================================
-- Cobrança do mês
-- ============================================================
create function public.creche_nome_mes(p date) returns text
language sql immutable set search_path = '' as $$
  select (array['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'])[extract(month from p)::int]
$$;

-- Mensalidade sugerida do mês: cheia, ou proporcional aos dias do plano quando ele começa no meio do mês ou tem pausa no mês.
-- (Mesma conta de `sugestaoDoMes` em src/lib/gestao/creche.ts.)
create function public.creche_sugestao_mensal(p_plano uuid, p_mes date, p_valor numeric) returns numeric
language sql stable security definer set search_path = '' as $$
  select case when t.todos = 0 or t.restam = t.todos then p_valor
              else round(p_valor * t.restam / t.todos, 2) end
  from public.creche_planos pl
  join public.petshops s on s.id = pl.petshop_id,
  lateral (
    select count(*) filter (where d::date >= pl.inicio and not (pl.pausa_de is not null and d::date between pl.pausa_de and pl.pausa_ate)) as restam, count(*) as todos
    from generate_series(date_trunc('month', p_mes)::date, (date_trunc('month', p_mes) + interval '1 month - 1 day')::date, interval '1 day') d
    where extract(dow from d)::smallint = any (pl.dias) and public.creche_abre(s.horario, d::date)
  ) t
  where pl.id = p_plano
$$;

-- Deixa a conta a receber igual à cobrança (cria, altera ou apaga). Só para as funções abaixo.
create function public.creche_cobranca_lancar(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.creche_cobrancas;
  v_pet text;
  v_itens jsonb;
  v_desc text;
  v_dias text;
  v_unit numeric;
  v_n int;
begin
  select * into c from public.creche_cobrancas where id = p_id;
  select nome into v_pet from public.pets where id = c.pet_id;
  perform set_config('maestro.creche', '1', true);
  if c.status <> 'aberta' or c.total <= 0 then
    if c.lancamento_id is not null then
      update public.creche_cobrancas set lancamento_id = null where id = c.id;
      delete from public.lancamentos where id = c.lancamento_id and not pago;
    end if;
    return;
  end if;
  v_n := jsonb_array_length(c.extras);
  v_desc := 'Mensalidade de ' || public.creche_nome_mes(c.mes) || ' · ' || coalesce(v_pet, 'pet');
  v_itens := jsonb_build_array(jsonb_build_object('tipo', 'servico', 'nome', 'Mensalidade de ' || public.creche_nome_mes(c.mes), 'qtd', 1, 'valor', c.valor_mensal));
  if v_n > 0 and c.valor_extras > 0 then
    select string_agg(to_char((x ->> 'dia')::date, 'DD/MM'), ', ' order by x ->> 'dia') into v_dias from jsonb_array_elements(c.extras) x;
    v_unit := round(c.valor_extras / v_n, 2);
    if v_unit * v_n = c.valor_extras then
      v_itens := v_itens || jsonb_build_object('tipo', 'servico', 'nome', case when v_n = 1 then 'Dia extra (' else 'Dias extras (' end || v_dias || ')', 'qtd', v_n, 'valor', v_unit);
    else
      v_itens := v_itens || jsonb_build_object('tipo', 'servico', 'nome', 'Dias extras (' || v_dias || ')', 'qtd', 1, 'valor', c.valor_extras);
    end if;
  end if;
  if c.lancamento_id is not null then
    update public.lancamentos set valor = c.total, data = c.vencimento, vencimento = c.vencimento, descricao = v_desc, itens = v_itens, cliente_id = c.cliente_id
      where id = c.lancamento_id and not pago;
  else
    insert into public.lancamentos (petshop_id, tipo, valor, forma, categoria, descricao, data, vencimento, pago, cliente_id, origem, criado_por, itens)
      values (c.petshop_id, 'entrada', c.total, null, 'Creche: mensalidade', v_desc, c.vencimento, c.vencimento, false, c.cliente_id, 'tela', (select auth.uid()), v_itens)
      returning id into c.lancamento_id;
    update public.creche_cobrancas set lancamento_id = c.lancamento_id where id = c.id;
  end if;
end $$;
revoke execute on function public.creche_cobranca_lancar(uuid), public.creche_sugestao_mensal(uuid, date, numeric), public.creche_nome_mes(date) from public, anon, authenticated;

-- Cria a cobrança de um plano num mês: mensalidade (cheia ou a que vier em p_valor) + dias extras de meses anteriores
-- ainda não cobrados - desconto, e anota a conta a receber. Já existe? Devolve a mesma, sem mexer (nunca duplica).
-- Cobrança cancelada só volta com p_reabrir.
create function public.creche_cobranca_criar(p_plano uuid, p_mes date, p_valor numeric default null, p_desconto numeric default 0,
  p_vencimento date default null, p_obs text default null, p_reabrir boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  pl public.creche_planos;
  s public.petshops;
  v public.creche_planos_valores;
  c public.creche_cobrancas;
  v_mes date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_cliente uuid;
  v_mensal numeric(10, 2);
  v_unit numeric(10, 2);
  v_extras jsonb;
  v_extras_total numeric(10, 2);
  v_desconto numeric(10, 2) := greatest(coalesce(p_desconto, 0), 0);
  v_venc date;
  v_id uuid;
begin
  select * into pl from public.creche_planos where id = p_plano for update;
  if not found or not public.vejo_financeiro(pl.petshop_id) then raise exception 'Plano não encontrado.'; end if;
  if not public.acesso_liberado(pl.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if p_mes is null then raise exception 'Escolha o mês.'; end if;
  select * into c from public.creche_cobrancas where plano_id = pl.id and mes = v_mes;
  if found and (c.status = 'aberta' or not coalesce(p_reabrir, false)) then return c.id; end if;
  if pl.inicio > v_fim or (pl.fim is not null and pl.fim < v_mes) then raise exception 'O plano não vale nesse mês.'; end if;
  select * into s from public.petshops where id = pl.petshop_id;
  select * into v from public.creche_planos_valores where plano_id = pl.id;
  if v.plano_id is null then raise exception 'Defina o valor da mensalidade deste plano antes de gerar a cobrança.'; end if;
  v_mensal := coalesce(p_valor, public.creche_sugestao_mensal(pl.id, v_mes, v.valor_mensal));
  if v_mensal < 0 or v_mensal > 99999.99 then raise exception 'Confira o valor da mensalidade.'; end if;
  v_unit := coalesce(v.valor_extra, s.diaria_creche, 0);
  select coalesce(jsonb_agg(jsonb_build_object('dia', e.dia, 'valor', v_unit) order by e.dia), '[]'::jsonb), coalesce(count(*) * v_unit, 0)
    into v_extras, v_extras_total
    from public.estadias e
    where e.pet_id = pl.pet_id and e.mensalista = 'extra' and e.status <> 'cancelada' and e.cobranca_id is null and e.dia < v_mes;
  if v_desconto > v_mensal + v_extras_total then raise exception 'O desconto é maior que a cobrança.'; end if;
  v_venc := coalesce(p_vencimento, greatest(make_date(extract(year from v_mes)::int, extract(month from v_mes)::int, pl.vence_dia), least(pl.inicio, v_fim)));
  select cliente_id into v_cliente from public.pets where id = pl.pet_id;

  if c.id is not null then
    update public.creche_cobrancas set status = 'aberta', cliente_id = v_cliente, valor_cheio = v.valor_mensal, valor_mensal = v_mensal, extras = v_extras,
      valor_extras = v_extras_total, desconto = v_desconto, total = v_mensal + v_extras_total - v_desconto, vencimento = v_venc,
      obs = nullif(left(btrim(coalesce(p_obs, '')), 300), ''), cobrado_em = null, lancamento_id = null
      where id = c.id returning id into v_id;
  else
    insert into public.creche_cobrancas (petshop_id, plano_id, pet_id, cliente_id, mes, valor_cheio, valor_mensal, extras, valor_extras, desconto, total, vencimento, obs)
      values (pl.petshop_id, pl.id, pl.pet_id, v_cliente, v_mes, v.valor_mensal, v_mensal, v_extras, v_extras_total, v_desconto,
        v_mensal + v_extras_total - v_desconto, v_venc, nullif(left(btrim(coalesce(p_obs, '')), 300), ''))
      returning id into v_id;
  end if;
  perform set_config('maestro.creche', '1', true);
  update public.estadias e set cobranca_id = v_id
    where e.pet_id = pl.pet_id and e.mensalista = 'extra' and e.status <> 'cancelada' and e.cobranca_id is null and e.dia < v_mes;
  perform public.creche_cobranca_lancar(v_id);
  return v_id;
end $$;

-- Gera as cobranças que faltam do mês corrente, sem duplicar: chamada quando quem vê o financeiro abre Cobranças ou a tela Hoje.
-- Só entram as de mensalidade cheia; a proporcional (plano que começou no meio do mês ou com pausa) espera o dono conferir no botão Gerar cobranças.
create function public.creche_gerar_cobrancas(p_petshop uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  s public.petshops;
  v_mes date;
  v_fim date;
  v_n int := 0;
  r record;
begin
  if not public.vejo_financeiro(p_petshop) or not public.acesso_liberado(p_petshop) then return 0; end if;
  select * into s from public.petshops where id = p_petshop;
  v_mes := date_trunc('month', (now() at time zone s.fuso)::date)::date;
  v_fim := (v_mes + interval '1 month - 1 day')::date;
  for r in
    select pl.id, v.valor_mensal from public.creche_planos pl
    join public.creche_planos_valores v on v.plano_id = pl.id
    where pl.petshop_id = p_petshop and pl.inicio <= v_fim and (pl.fim is null or pl.fim >= v_mes)
      and not exists (select 1 from public.creche_cobrancas c where c.plano_id = pl.id and c.mes = v_mes)
  loop
    if public.creche_sugestao_mensal(r.id, v_mes, r.valor_mensal) = r.valor_mensal then
      perform public.creche_cobranca_criar(r.id, v_mes);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke execute on function public.creche_gerar_cobrancas(uuid) from public, anon;
grant execute on function public.creche_gerar_cobrancas(uuid) to authenticated;

-- A cobrança já foi paga? (a conta a receber dela foi baixada)
create function public.creche_cobranca_paga(p_lancamento uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select pago from public.lancamentos where id = p_lancamento), false)
$$;

-- Altera mensalidade, desconto, vencimento ou observação de uma cobrança ainda não paga. A conta a receber acompanha.
create function public.creche_cobranca_editar(p_id uuid, p_valor numeric, p_desconto numeric, p_vencimento date, p_obs text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.creche_cobrancas;
  v_desconto numeric(10, 2) := greatest(coalesce(p_desconto, 0), 0);
begin
  select * into c from public.creche_cobrancas where id = p_id for update;
  if not found or not public.vejo_financeiro(c.petshop_id) then raise exception 'Cobrança não encontrada.'; end if;
  if not public.acesso_liberado(c.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if c.status <> 'aberta' then raise exception 'Esta cobrança foi cancelada.'; end if;
  if public.creche_cobranca_paga(c.lancamento_id) then raise exception 'Esta mensalidade já foi paga. Desfaça o recebimento antes de alterar.'; end if;
  if p_valor is null or p_valor < 0 or p_valor > 99999.99 then raise exception 'Confira o valor da mensalidade.'; end if;
  if p_vencimento is null then raise exception 'Escolha o vencimento.'; end if;
  if v_desconto > p_valor + c.valor_extras then raise exception 'O desconto é maior que a cobrança.'; end if;
  update public.creche_cobrancas set valor_mensal = p_valor, desconto = v_desconto, total = p_valor + valor_extras - v_desconto,
    vencimento = p_vencimento, obs = nullif(left(btrim(coalesce(p_obs, '')), 300), '') where id = c.id;
  perform public.creche_cobranca_lancar(c.id);
end $$;

-- Cancela uma cobrança ainda não paga: a conta a receber some e os dias extras voltam a ficar sem cobrança.
create function public.creche_cobranca_cancelar(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.creche_cobrancas;
begin
  select * into c from public.creche_cobrancas where id = p_id for update;
  if not found or not public.vejo_financeiro(c.petshop_id) then raise exception 'Cobrança não encontrada.'; end if;
  if not public.acesso_liberado(c.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if c.status <> 'aberta' then return; end if;
  if public.creche_cobranca_paga(c.lancamento_id) then raise exception 'Esta mensalidade já foi paga. Desfaça o recebimento antes de cancelar.'; end if;
  update public.creche_cobrancas set status = 'cancelada' where id = c.id;
  perform public.creche_cobranca_lancar(c.id);
  update public.estadias set cobranca_id = null where cobranca_id = c.id;
end $$;

-- Desfaz o recebimento de uma mensalidade: a conta volta para A receber. (Lançamento de caixa já fechado não volta.)
create function public.creche_cobranca_desfazer_baixa(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.creche_cobrancas;
begin
  select * into c from public.creche_cobrancas where id = p_id for update;
  if not found or not public.vejo_financeiro(c.petshop_id) then raise exception 'Cobrança não encontrada.'; end if;
  if not public.acesso_liberado(c.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if not public.creche_cobranca_paga(c.lancamento_id) then return; end if;
  perform set_config('maestro.creche', '1', true);
  update public.lancamentos set pago = false, forma = null, pagamentos = null, caixa_id = null, data = c.vencimento, vencimento = c.vencimento
    where id = c.lancamento_id;
end $$;

-- Marca (ou desmarca) "cobrado em": a lembrança de que a mensagem de cobrança foi mandada.
create function public.creche_cobranca_cobrada(p_ids uuid[], p_desfazer boolean default false) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_agora timestamptz := case when coalesce(p_desfazer, false) then null else now() end;
begin
  update public.creche_cobrancas c set cobrado_em = v_agora
    where c.id = any (p_ids) and c.status = 'aberta' and public.vejo_financeiro(c.petshop_id) and public.acesso_liberado(c.petshop_id);
  return v_agora;
end $$;

revoke execute on function public.creche_cobranca_criar(uuid, date, numeric, numeric, date, text, boolean), public.creche_cobranca_editar(uuid, numeric, numeric, date, text),
  public.creche_cobranca_cancelar(uuid), public.creche_cobranca_desfazer_baixa(uuid), public.creche_cobranca_cobrada(uuid[], boolean),
  public.creche_cobranca_paga(uuid) from public, anon, authenticated;
grant execute on function public.creche_cobranca_criar(uuid, date, numeric, numeric, date, text, boolean), public.creche_cobranca_editar(uuid, numeric, numeric, date, text),
  public.creche_cobranca_cancelar(uuid), public.creche_cobranca_desfazer_baixa(uuid), public.creche_cobranca_cobrada(uuid[], boolean) to authenticated;

-- A conta a receber de uma mensalidade acompanha a cobrança:
-- não é apagada por fora (cancela-se a cobrança) e, se o valor ou o vencimento mudar no Financeiro, a cobrança acompanha.
create function public.creche_lancamento_da_cobranca() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_bruto numeric;
begin
  if coalesce(current_setting('maestro.creche', true), '') = '1' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if exists (select 1 from public.creche_cobrancas c where c.lancamento_id = old.id and c.status = 'aberta')
       and exists (select 1 from public.petshops p where p.id = old.petshop_id) then
      raise exception 'Esta conta é de uma mensalidade da creche. Para cancelar ou desfazer, abra Creche, Cobranças.';
    end if;
    return old;
  end if;
  if new.valor is distinct from old.valor or new.vencimento is distinct from old.vencimento then
    update public.creche_cobrancas c set
      total = new.valor,
      desconto = greatest(0, c.valor_mensal + c.valor_extras - new.valor),
      valor_mensal = c.valor_mensal + greatest(0, new.valor - (c.valor_mensal + c.valor_extras)),
      vencimento = coalesce(new.vencimento, c.vencimento)
      where c.lancamento_id = new.id and c.status = 'aberta';
  end if;
  return new;
end $$;
revoke execute on function public.creche_lancamento_da_cobranca() from public, anon, authenticated;
create trigger creche_lancamento_apagar before delete on public.lancamentos
  for each row execute function public.creche_lancamento_da_cobranca();
create trigger creche_lancamento_mudar after update of valor, vencimento on public.lancamentos
  for each row execute function public.creche_lancamento_da_cobranca();

notify pgrst, 'reload schema';
