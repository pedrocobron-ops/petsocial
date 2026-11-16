-- Feriados e dias fechados do negócio, preço de feriado no hotel e taxa de busca fora do horário.
-- Tudo aqui é acréscimo: duas tabelas novas, duas funções novas e duas funções do link trocadas com a mesma assinatura.
-- Sem nenhuma data na lista e sem regra gravada, as funções trocadas respondem exatamente o que respondiam:
-- o aplicativo que está no ar hoje segue igual neste banco.

-- ---------- feriados e dias fechados ----------
-- Cada linha é uma data marcada pelo dono. `fechado`: o negócio não abre (o link não oferece banho nem creche,
-- a agenda avisa e a chamada da creche não espera ninguém). `feriado`: a noite conta como feriado no preço do hotel.
-- Não tem valor em dinheiro aqui: a equipe toda lê (precisa saber que o dia é fechado); só o dono escreve.
create table public.dias_especiais (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  dia date not null,
  nome text not null default '' check (char_length(nome) <= 60),
  fechado boolean not null default true,
  feriado boolean not null default false,
  criado_em timestamptz not null default now(),
  unique (petshop_id, dia),
  check (fechado or feriado)
);
alter table public.dias_especiais enable row level security;
revoke all on public.dias_especiais from anon, authenticated;
grant select, insert, update, delete on public.dias_especiais to authenticated;
create policy dias_especiais_ler on public.dias_especiais for select to authenticated
  using (petshop_id in (select public.meus_petshops()));
create policy dias_especiais_criar on public.dias_especiais for insert to authenticated
  with check ((select public.sou_dono(petshop_id)) and (select public.acesso_liberado(petshop_id)));
create policy dias_especiais_editar on public.dias_especiais for update to authenticated
  using ((select public.sou_dono(petshop_id)) and (select public.acesso_liberado(petshop_id)))
  with check ((select public.sou_dono(petshop_id)));
create policy dias_especiais_remover on public.dias_especiais for delete to authenticated
  using ((select public.sou_dono(petshop_id)) and (select public.acesso_liberado(petshop_id)));

-- O negócio marcou esse dia como fechado? Só para uso das outras funções do banco (não é chamada pelo aplicativo).
create function public.dia_fechado(p_petshop uuid, p_dia date) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.dias_especiais d where d.petshop_id = p_petshop and d.dia = p_dia and d.fechado)
$$;
revoke execute on function public.dia_fechado(uuid, date) from public, anon, authenticated;

-- ---------- regras de preço com valor (só para quem recebe) ----------
-- feriado: { ativo, modo: "valor" | "pct" | "mais", valor }  -> diária própria de feriado, ou acréscimo em % ou em reais.
-- atraso:  { ativo, tolerancia, creche: { hora: "18:30", valor }, hotel: { hora: "12:00", valor } } -> taxa de busca fora do horário.
-- Ficam fora de petshops.opcoes porque têm valor: quem não tem Caixa, Financeiro nem Relatórios não lê (nem pela tela, nem direto no banco).
create table public.hotel_precos (
  petshop_id uuid primary key references public.petshops (id) on delete cascade,
  feriado jsonb not null default '{}'::jsonb check (jsonb_typeof(feriado) = 'object'),
  atraso jsonb not null default '{}'::jsonb check (jsonb_typeof(atraso) = 'object'),
  atualizado_em timestamptz not null default now()
);
alter table public.hotel_precos enable row level security;
revoke all on public.hotel_precos from anon, authenticated;
grant select, insert, update on public.hotel_precos to authenticated;
create policy hotel_precos_ler on public.hotel_precos for select to authenticated
  using ((select public.tenho_area(petshop_id, array['caixa', 'financeiro', 'relatorios'])));
create policy hotel_precos_criar on public.hotel_precos for insert to authenticated
  with check ((select public.sou_dono(petshop_id)) and (select public.acesso_liberado(petshop_id)));
create policy hotel_precos_editar on public.hotel_precos for update to authenticated
  using ((select public.sou_dono(petshop_id)) and (select public.acesso_liberado(petshop_id)))
  with check ((select public.sou_dono(petshop_id)));

-- ---------- link do cliente ----------
-- As datas fechadas de hoje em diante, para a página do link pintar o dia como fechado. Só datas, sem nome.
create function public.link_fechados(p_codigo text) returns setof date
language sql stable security definer set search_path = '' as $$
  select d.dia
  from public.petshops p
  join public.dias_especiais d on d.petshop_id = p.id and d.fechado
  where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)
    and d.dia >= (now() at time zone p.fuso)::date and d.dia <= (now() at time zone p.fuso)::date + 400
  order by d.dia
$$;
revoke execute on function public.link_fechados(text) from public;
grant execute on function public.link_fechados(text) to anon, authenticated;

-- Dias sem vaga para creche ou hotel: igual a antes, e o dia marcado como fechado também volta como indisponível para a creche
-- (do mesmo jeito que o dia da semana em que o negócio não abre). link_pedir_estadia confere por aqui, então também recusa.
-- O hotel não muda: quem está hospedado continua hospedado no dia fechado.
create or replace function public.link_estadia_cheios(p_codigo text, p_tipo text, p_de date, p_ate date) returns setof date
language sql stable security definer set search_path = '' as $$
  select d::date
  from public.petshops p, generate_series(p_de, least(p_ate, p_de + 62), interval '1 day') d
  where p.link_codigo = p_codigo and p.link_ativo and p_tipo in ('creche', 'hotel')
    and ((p_tipo = 'creche' and (not public.creche_abre(p.horario, d::date) or public.dia_fechado(p.id, d::date)))
     or ((case p_tipo when 'creche' then p.vagas_creche else p.vagas_hotel end) is not null
    and (
      (select count(*) from public.estadias e where e.petshop_id = p.id and e.tipo = p_tipo and e.status in ('reservada', 'em_casa')
         and public.estadia_ocupa(e.tipo, e.status, (e.entrada at time zone p.fuso)::date, (e.saida_prevista at time zone p.fuso)::date, d::date, (now() at time zone p.fuso)::date))
      + (select count(*) from public.pedidos_agendamento x where x.petshop_id = p.id and x.tipo = p_tipo and x.status = 'pendente'
         and public.estadia_ocupa(x.tipo, 'reservada', (x.inicio at time zone p.fuso)::date, (x.fim at time zone p.fuso)::date, d::date, (now() at time zone p.fuso)::date))
      + (case when p_tipo = 'creche' then public.creche_planos_ocupam(p.id, d::date, (now() at time zone p.fuso)::date) else 0 end)
    ) >= (case p_tipo when 'creche' then p.vagas_creche else p.vagas_hotel end)))
$$;

-- Horários livres de um serviço no dia: igual a antes, e dia marcado como fechado não tem horário nenhum.
-- (link_pedir confere o horário por esta função, então o pedido para dia fechado também é recusado.)
create or replace function public.link_horarios(p_codigo text, p_servico uuid, p_dia date, p_pets int default 1) returns setof text
  language plpgsql stable security definer set search_path = '' as $$
declare
  v public.petshops;
  v_dur int;
  v_h jsonb;
  v_al jsonb;
  v_abre int;
  v_fecha int;
  v_ai int;
  v_af int;
  m int;
  v_ini timestamptz;
  n int := least(4, greatest(1, coalesce(p_pets, 1)));
begin
  select * into v from public.petshops where link_codigo = p_codigo and link_ativo;
  if not found or not public.acesso_liberado(v.id) then return; end if;
  select duracao_min * n into v_dur from public.servicos where id = p_servico and petshop_id = v.id and ativo and categoria not in ('creche', 'hotel');
  if not found then return; end if;
  if p_dia < (now() at time zone v.fuso)::date or p_dia > (now() at time zone v.fuso)::date + 60 then return; end if;
  if public.dia_fechado(v.id, p_dia) then return; end if;
  v_h := v.horario -> (extract(dow from p_dia)::int)::text;
  if v_h is null or jsonb_typeof(v_h) <> 'object' then return; end if;
  v_abre := extract(hour from (v_h ->> 'abre')::time)::int * 60 + extract(minute from (v_h ->> 'abre')::time)::int;
  v_fecha := extract(hour from (v_h ->> 'fecha')::time)::int * 60 + extract(minute from (v_h ->> 'fecha')::time)::int;
  v_al := v_h -> 'almoco';
  if v_al is not null and jsonb_typeof(v_al) = 'object' and (v_al ->> 'de') ~ '^\d{2}:\d{2}' and (v_al ->> 'ate') ~ '^\d{2}:\d{2}' then
    v_ai := left(v_al ->> 'de', 2)::int * 60 + substr(v_al ->> 'de', 4, 2)::int;
    v_af := left(v_al ->> 'ate', 2)::int * 60 + substr(v_al ->> 'ate', 4, 2)::int;
    if not (v_af > v_ai and v_abre < v_ai and v_fecha > v_af) then v_ai := null; end if;
  end if;
  m := v_abre;
  while m + v_dur <= v_fecha loop
    v_ini := (p_dia::timestamp + make_interval(mins => m)) at time zone v.fuso;
    if (v_ai is null or m >= v_af or m + v_dur <= v_ai)
       and v_ini >= now() + interval '2 hours' and public.link_vaga(v.id, v_ini, v_ini + make_interval(mins => v_dur)) then
      return next to_char(m / 60, 'FM00') || ':' || to_char(m % 60, 'FM00');
    end if;
    m := m + 30;
  end loop;
end $$;

notify pgrst, 'reload schema';
