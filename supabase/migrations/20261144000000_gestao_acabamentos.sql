-- Acabamentos: valores da estadia e listas de preço das opções servidos por função (para fechar depois a leitura direta),
-- textos do Chamar de volta por pet shop e repetição de horário "até eu cancelar".
-- Tudo aqui é acréscimo (funções, tabelas e um gatilho novos). O aplicativo que está no ar não usa nada disto e segue igual:
-- ele continua lendo `estadias.valor_diaria`, `estadias.valor_cobrado` e `petshops.opcoes` direto da tabela.
-- A leitura direta só é fechada na migração 20261149000000_gestao_acabamentos_fecha.sql, aplicada DEPOIS de publicar o código novo.

-- ---------- estadia: diária e valor cobrado, só para quem recebe (Caixa, Financeiro, Relatórios e o dono) ----------
create function public.estadias_reservado(p uuid, p_ids uuid[] default null)
returns table (id uuid, valor_diaria numeric, valor_cobrado numeric)
language sql stable security definer set search_path = '' as $$
  select e.id, e.valor_diaria, e.valor_cobrado
  from public.estadias e
  where e.petshop_id = p and (p_ids is null or e.id = any (p_ids))
    and (select public.tenho_area(p, array['caixa', 'financeiro', 'relatorios']))
$$;
revoke execute on function public.estadias_reservado(uuid, uuid[]) from public, anon;
grant execute on function public.estadias_reservado(uuid, uuid[]) to authenticated;

-- A diária que o formulário sugere, calculada no banco (é a mesma regra de `diariaSugerida`, em src/lib/gestao/hotel.ts):
-- no hotel com "Diária por porte" ligada, a do porte; senão, a diária de Meu pet shop.
create function public.diaria_sugerida(p_petshop uuid, p_tipo text, p_porte text) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(
    case when p_tipo = 'hotel' and p_porte in ('P', 'M', 'G', 'GG')
              and s.opcoes -> 'hotel.diaria_por_porte' -> 'ativo' = 'true'::jsonb
              and jsonb_typeof(s.opcoes -> 'hotel.diaria_por_porte' -> p_porte) = 'number'
              and (s.opcoes -> 'hotel.diaria_por_porte' ->> p_porte)::numeric between 0 and 99999999
         then round((s.opcoes -> 'hotel.diaria_por_porte' ->> p_porte)::numeric, 2) end,
    case when p_tipo = 'hotel' then s.diaria_hotel else s.diaria_creche end)
  from public.petshops s where s.id = p_petshop
$$;
revoke execute on function public.diaria_sugerida(uuid, text, text) from public, anon, authenticated;

-- Quem não recebe não manda (nem vê) a diária: o banco preenche.
--  - estadia nova sem diária: entra a diária sugerida;
--  - reserva que troca de creche para hotel (ou o contrário) sem diária nova: fica a do tipo novo;
--  - saída de estadia com diária zero (cortesia): fica cobrada em zero, e não "sem valor lançado".
-- Quem recebe, as funções da creche e o banco por dentro passam direto. (A migração seguinte troca esta função pela
-- versão que também ignora o valor que quem não recebe tentar gravar.)
create function public.estadias_guardar_valores() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or coalesce(current_setting('maestro.creche', true), '') = '1'
     or coalesce(current_setting('maestro.hotel', true), '') = '1' then return new; end if;
  if (select public.tenho_area(new.petshop_id, array['caixa', 'financeiro', 'relatorios'])) then return new; end if;
  if tg_op = 'INSERT' then
    if new.valor_diaria is null and new.mensalista is null then
      new.valor_diaria := public.diaria_sugerida(new.petshop_id, new.tipo, (select x.porte from public.pets x where x.id = new.pet_id));
    end if;
    return new;
  end if;
  if new.tipo is distinct from old.tipo and new.valor_diaria is not distinct from old.valor_diaria and new.mensalista is null then
    new.valor_diaria := public.diaria_sugerida(new.petshop_id, new.tipo, (select x.porte from public.pets x where x.id = new.pet_id));
  end if;
  if new.status = 'encerrada' and old.status <> 'encerrada' and new.valor_cobrado is null and new.mensalista is null and new.valor_diaria = 0 then
    new.valor_cobrado := 0;
  end if;
  return new;
end $$;
create trigger estadias_guardar_valores before insert or update on public.estadias
  for each row execute function public.estadias_guardar_valores();
revoke execute on function public.estadias_guardar_valores() from public, anon, authenticated;

-- Reserva de hotel aceita pelo link com "Diária por porte" ligada: a diária passa a ser a do porte do pedido.
-- (Antes a tela fazia essa conta e gravava; agora quem aceita não precisa ler a lista de preços.)
-- Só mexe em reserva que ainda está com a diária comum do hotel.
create function public.pedido_acertar_diaria(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.pedidos_agendamento;
  v_base numeric;
  v_porte numeric;
begin
  select * into v from public.pedidos_agendamento where id = p_id;
  if not found or v.estadia_id is null or v.tipo <> 'hotel'
     or not (select public.tenho_area(v.petshop_id, array['agenda', 'creche_hotel'])) or not public.acesso_liberado(v.petshop_id) then return; end if;
  select s.diaria_hotel into v_base from public.petshops s where s.id = v.petshop_id;
  v_porte := public.diaria_sugerida(v.petshop_id, 'hotel', v.porte);
  if v_porte is null or v_porte is not distinct from v_base then return; end if;
  perform set_config('maestro.hotel', '1', true);
  update public.estadias e set valor_diaria = v_porte
    where e.id = v.estadia_id and e.status = 'reservada' and e.valor_diaria is not distinct from v_base;
  perform set_config('maestro.hotel', '', true);
end $$;
revoke execute on function public.pedido_acertar_diaria(uuid) from public, anon;
grant execute on function public.pedido_acertar_diaria(uuid) to authenticated;

-- ---------- opções do pet shop: as listas de preço só para quem recebe ----------
-- Chaves de `petshops.opcoes` que guardam preço. Quem não recebe fica só com a chave ligada/desligada (as telas precisam dela);
-- os números da multa e dos juros saem inteiros. OPÇÃO NOVA COM PREÇO DENTRO: acrescente a chave aqui.
-- ("hotel.sinal" fica: a regra do sinal aparece no link do cliente e na mensagem de confirmação.)
create function public.opcoes_sem_valores(o jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(x.k, case
      when x.k in ('hotel.diaria_por_porte', 'hotel.temporadas', 'hotel.desconto_segundo_pet', 'hotel.taxas')
        then jsonb_build_object('ativo', case when jsonb_typeof(x.v) = 'object' then coalesce(x.v -> 'ativo', 'false'::jsonb) else 'false'::jsonb end)
      else x.v end), '{}'::jsonb)
  from jsonb_each(coalesce(o, '{}'::jsonb)) as x(k, v)
  where x.k not in ('dinheiro.multa_fixa', 'dinheiro.multa_pct', 'dinheiro.juros_mes_pct')
$$;
revoke execute on function public.opcoes_sem_valores(jsonb) from public, anon, authenticated;

create function public.petshop_opcoes(p uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when (select public.tenho_area(p, array['caixa', 'financeiro', 'relatorios'])) then s.opcoes else public.opcoes_sem_valores(s.opcoes) end
  from public.petshops s
  where s.id = p and s.id in (select public.meus_petshops())
$$;
revoke execute on function public.petshop_opcoes(uuid) from public, anon;
grant execute on function public.petshop_opcoes(uuid) to authenticated;

-- Gravar opções sem ler antes: junta as mudanças ao que está guardado, de uma vez só (só o dono).
create function public.petshop_salvar_opcoes(p uuid, p_mudancas jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (select public.sou_dono(p)) then raise exception 'Só o dono muda as opções do negócio.'; end if;
  if p_mudancas is null or jsonb_typeof(p_mudancas) <> 'object' then raise exception 'Opções inválidas.'; end if;
  update public.petshops s set opcoes = s.opcoes || p_mudancas where s.id = p;
end $$;
revoke execute on function public.petshop_salvar_opcoes(uuid, jsonb) from public, anon;
grant execute on function public.petshop_salvar_opcoes(uuid, jsonb) to authenticated;

-- ---------- textos de mensagem do pet shop (Chamar de volta) ----------
-- Antes ficavam guardados em cada aparelho. Agora são do pet shop: o mesmo texto em qualquer aparelho.
create table public.modelos_mensagem (
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  chave text not null check (char_length(chave) between 1 and 60),
  texto text not null check (char_length(texto) <= 1000),
  atualizado_em timestamptz not null default now(),
  primary key (petshop_id, chave)
);
alter table public.modelos_mensagem enable row level security;
revoke all on public.modelos_mensagem from anon, authenticated;
grant select, insert, update on public.modelos_mensagem to authenticated;
create policy modelos_mensagem_ler on public.modelos_mensagem for select to authenticated
  using (petshop_id in (select public.meus_petshops()));
create policy modelos_mensagem_criar on public.modelos_mensagem for insert to authenticated
  with check ((select public.tenho_area(petshop_id, array['clientes', 'agenda'])) and (select public.acesso_liberado(petshop_id)));
create policy modelos_mensagem_editar on public.modelos_mensagem for update to authenticated
  using ((select public.tenho_area(petshop_id, array['clientes', 'agenda'])) and (select public.acesso_liberado(petshop_id)))
  with check ((select public.tenho_area(petshop_id, array['clientes', 'agenda'])));

-- ---------- horário que se repete "até eu cancelar" ----------
-- A série continua existindo como sempre (agendamentos com o mesmo `serie_id`, um número fechado de horários).
-- Esta tabela só marca que a pessoa quer continuar: quando a série está acabando, a Agenda avisa e um toque marca os próximos.
-- Nada é criado sozinho, e nenhuma série fica sem fim no banco.
create table public.series_agenda (
  serie_id uuid primary key,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  cada_semanas integer not null check (cada_semanas in (1, 2, 4)),
  encerrada_em timestamptz,
  criado_em timestamptz not null default now()
);
create index on public.series_agenda (petshop_id) where encerrada_em is null;
alter table public.series_agenda enable row level security;
revoke all on public.series_agenda from anon, authenticated;
grant select, insert, update on public.series_agenda to authenticated;
create policy series_agenda_ler on public.series_agenda for select to authenticated
  using (petshop_id in (select public.meus_petshops()));
create policy series_agenda_criar on public.series_agenda for insert to authenticated
  with check ((select public.tenho_area(petshop_id, array['agenda'])) and (select public.acesso_liberado(petshop_id)));
create policy series_agenda_editar on public.series_agenda for update to authenticated
  using ((select public.tenho_area(petshop_id, array['agenda'])) and (select public.acesso_liberado(petshop_id)))
  with check ((select public.tenho_area(petshop_id, array['agenda'])));

-- As séries "até eu cancelar" que estão acabando: o último horário de pé está a menos de três semanas (ou de duas voltas
-- da repetição, o que for maior), ou passou há pouco. Lê com as regras de quem pede (sem privilégio a mais).
create function public.series_acabando(p uuid)
returns table (serie_id uuid, cada_semanas integer, ultimo timestamptz, restantes integer, pet_id uuid, pet_nome text, tutor_nome text, servico_nome text)
language sql stable security invoker set search_path = '' as $$
  select s.serie_id, s.cada_semanas, u.inicio,
    (select count(*)::integer from public.agendamentos a
      where a.serie_id = s.serie_id and a.petshop_id = p and a.status in ('marcado', 'confirmado') and a.inicio > now()),
    u.pet_id, pt.nome, c.nome, sv.nome
  from public.series_agenda s
  join lateral (
    select a.inicio, a.pet_id, a.servico_id from public.agendamentos a
    where a.serie_id = s.serie_id and a.petshop_id = p and a.status not in ('cancelado', 'faltou')
    order by a.inicio desc limit 1) u on true
  join public.pets pt on pt.id = u.pet_id
  left join public.clientes c on c.id = pt.cliente_id
  left join public.servicos sv on sv.id = u.servico_id
  where s.petshop_id = p and s.encerrada_em is null
    and u.inicio < now() + make_interval(days => greatest(21, 14 * s.cada_semanas))
    and u.inicio > now() - make_interval(days => 7 * s.cada_semanas + 7)
  order by u.inicio
$$;
revoke execute on function public.series_acabando(uuid) from public, anon;
grant execute on function public.series_acabando(uuid) to authenticated;

-- Continua a série: marca os próximos horários no mesmo dia da semana e na mesma hora, copiando o último que está de pé
-- (pet, serviço, profissional, valor, duração). `p_depois_de` é o último horário que a tela viu: se alguém já continuou
-- a série nesse meio-tempo, não marca de novo. Grava com as regras de quem pede (precisa da área Agenda).
create function public.serie_continuar(p_serie uuid, p_depois_de timestamptz, p_vezes integer default 12) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  s public.series_agenda;
  m public.agendamentos;
  v_fuso text;
  v_ultimo timestamptz;
  v_local timestamp;
  v_quando timestamptz;
  v_feitos integer := 0;
  v_voltas integer := 0;
begin
  select * into s from public.series_agenda where serie_id = p_serie for update;
  if not found or s.encerrada_em is not null then return 0; end if;
  select max(a.inicio) into v_ultimo from public.agendamentos a where a.serie_id = p_serie and a.petshop_id = s.petshop_id;
  if v_ultimo is null or v_ultimo > p_depois_de then return 0; end if;
  select * into m from public.agendamentos a
    where a.serie_id = p_serie and a.petshop_id = s.petshop_id and a.status not in ('cancelado', 'faltou') order by a.inicio desc limit 1;
  if not found then return 0; end if;
  select coalesce(x.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops x where x.id = s.petshop_id;
  -- o dia vem do último horário da série; a hora, do último que está de pé
  v_local := (v_ultimo at time zone v_fuso)::date + (m.inicio at time zone v_fuso)::time;
  while v_feitos < least(greatest(coalesce(p_vezes, 12), 1), 26) and v_voltas < 80 loop
    v_voltas := v_voltas + 1;
    v_local := v_local + make_interval(days => 7 * s.cada_semanas);
    v_quando := v_local at time zone v_fuso;
    continue when v_quando < now();
    insert into public.agendamentos (petshop_id, pet_id, servico_id, profissional_id, inicio, fim, preco, obs, leva_traz, endereco_leva_traz, criado_por, serie_id)
    values (s.petshop_id, m.pet_id, m.servico_id, m.profissional_id, v_quando, v_quando + (m.fim - m.inicio), m.preco, m.obs, m.leva_traz, m.endereco_leva_traz,
      (select auth.uid()), p_serie);
    v_feitos := v_feitos + 1;
  end loop;
  return v_feitos;
end $$;
revoke execute on function public.serie_continuar(uuid, timestamptz, integer) from public, anon;
grant execute on function public.serie_continuar(uuid, timestamptz, integer) to authenticated;

notify pgrst, 'reload schema';
