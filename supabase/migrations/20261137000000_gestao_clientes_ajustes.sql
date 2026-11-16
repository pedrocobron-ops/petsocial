-- Clientes e ajustes: telefone sempre como DDD + número, juntar tutores repetidos, desfazer uma importação,
-- pedido do link com "é a mesma pessoa?" e almoço dentro do horário de funcionamento.
-- Só acrescenta: o código que já está no ar continua funcionando (nenhuma assinatura de função muda).

-- ---------- 1. telefone: uma regra só ----------
-- Tira tudo que não é algarismo, o código do país (55) e o zero da frente. Devolve DDD + número (10 ou 11 algarismos)
-- ou null quando o que sobra não é um telefone. É a mesma regra de `telefoneLimpo`/`lerTelefone` em src/lib/gestao/util.ts.
create or replace function public.telefone_limpo(p text) returns text
  language sql immutable set search_path = '' as $$
  with a as (select regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^0+', '') as d),
       b as (select case when length(d) in (12, 13) and left(d, 2) = '55' then regexp_replace(substr(d, 3), '^0+', '') else d end as d from a)
  select case when d ~ '^[1-9][1-9](9\d{8}|\d{8})$' then d end from b
$$;
revoke execute on function public.telefone_limpo(text) from public, anon;
grant execute on function public.telefone_limpo(text) to authenticated;

-- O que já está guardado: só muda a linha em que a regra chega a um telefone válido e diferente do que está lá.
-- Número que já está certo (10 ou 11 algarismos) fica idêntico; o que não dá para consertar fica como está.
update public.clientes set telefone = public.telefone_limpo(telefone)
  where telefone is not null and public.telefone_limpo(telefone) is not null and telefone is distinct from public.telefone_limpo(telefone);
update public.petshops set telefone = public.telefone_limpo(telefone)
  where telefone is not null and public.telefone_limpo(telefone) is not null and telefone is distinct from public.telefone_limpo(telefone);
update public.pedidos_agendamento set telefone = public.telefone_limpo(telefone)
  where public.telefone_limpo(telefone) is not null and telefone is distinct from public.telefone_limpo(telefone);

-- Daqui para a frente, o tutor entra limpo venha de onde vier (tela, planilha, link, Mozart, versão antiga do site).
create or replace function public.clientes_limpar_telefone() returns trigger
  language plpgsql set search_path = '' as $$
begin
  if new.telefone is not null then
    new.telefone := coalesce(public.telefone_limpo(new.telefone), nullif(btrim(new.telefone), ''));
  end if;
  return new;
end $$;
drop trigger if exists clientes_limpar_telefone on public.clientes;
create trigger clientes_limpar_telefone before insert or update of telefone on public.clientes
  for each row execute function public.clientes_limpar_telefone();

-- ---------- 2. juntar dois tutores (cadastro repetido) ----------
-- Os lançamentos de caixa já fechado só aceitam troca de cliente quando ela vem em cascata (ver travar_caixa_fechado).
-- Por isso a troca acontece neste gatilho, no momento em que o tutor repetido é apagado por clientes_juntar.
create or replace function public.clientes_juntar_ao_apagar() returns trigger
  language plpgsql security definer set search_path = '' as $$
declare v_para uuid := nullif(current_setting('gestao.juntar_para', true), '')::uuid;
begin
  if v_para is not null and v_para <> old.id
     and exists (select 1 from public.clientes c where c.id = v_para and c.petshop_id = old.petshop_id) then
    update public.lancamentos set cliente_id = v_para where cliente_id = old.id and petshop_id = old.petshop_id;
  end if;
  return old;
end $$;
drop trigger if exists clientes_juntar_ao_apagar on public.clientes;
create trigger clientes_juntar_ao_apagar before delete on public.clientes
  for each row execute function public.clientes_juntar_ao_apagar();
revoke execute on function public.clientes_juntar_ao_apagar(), public.clientes_limpar_telefone() from public, anon, authenticated;

-- Passa tudo de `p_de` para `p_para` (pets com o histórico deles, contas e recebimentos, prêmios de fidelidade,
-- mensalidades da creche), completa os dados que faltam em `p_para` e apaga `p_de`. Tudo ou nada.
create or replace function public.clientes_juntar(p_de uuid, p_para uuid) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare
  a public.clientes; b public.clientes;
  n_pets int; n_lanc int; n_premios int; n_cobr int;
begin
  if p_de is null or p_para is null or p_de = p_para then raise exception 'Escolha dois tutores diferentes.'; end if;
  select * into a from public.clientes where id = p_de for update;
  if not found or a.petshop_id not in (select public.meus_petshops()) then raise exception 'Tutor não encontrado.'; end if;
  select * into b from public.clientes where id = p_para and petshop_id = a.petshop_id for update;
  if not found then raise exception 'Tutor não encontrado.'; end if;
  if not public.acesso_liberado(a.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if not public.tenho_area(a.petshop_id, array['clientes']) then raise exception 'Você não tem permissão para mexer nos clientes.'; end if;

  update public.pets set cliente_id = p_para where cliente_id = p_de and petshop_id = a.petshop_id;
  get diagnostics n_pets = row_count;
  update public.fidelidade_resgates set cliente_id = p_para where cliente_id = p_de and petshop_id = a.petshop_id;
  get diagnostics n_premios = row_count;
  update public.creche_cobrancas set cliente_id = p_para where cliente_id = p_de and petshop_id = a.petshop_id;
  get diagnostics n_cobr = row_count;
  select count(*) into n_lanc from public.lancamentos where cliente_id = p_de and petshop_id = a.petshop_id;

  update public.clientes set
    telefone = coalesce(nullif(btrim(telefone), ''), a.telefone),
    email = coalesce(nullif(btrim(email), ''), a.email),
    endereco = coalesce(nullif(btrim(endereco), ''), a.endereco),
    obs = nullif(concat_ws(E'\n', nullif(btrim(obs), ''), case when nullif(btrim(a.obs), '') is distinct from nullif(btrim(obs), '') then nullif(btrim(a.obs), '') end), ''),
    criado_em = least(criado_em, a.criado_em)
    where id = p_para;

  perform set_config('gestao.juntar_para', p_para::text, true);
  delete from public.clientes where id = p_de;
  perform set_config('gestao.juntar_para', '', true);
  return jsonb_build_object('pets', n_pets, 'lancamentos', n_lanc, 'premios', n_premios, 'cobrancas', n_cobr);
end $$;
revoke execute on function public.clientes_juntar(uuid, uuid) from public, anon;
grant execute on function public.clientes_juntar(uuid, uuid) to authenticated;

-- ---------- 3. desfazer uma importação de planilha ----------
-- Recebe os tutores e pets que a importação criou (a tela guarda a lista) e apaga só os que continuam vazios:
-- pet sem horário, estadia, pacote, plano ou cuidado de saúde; tutor sem pet, sem conta e sem prêmio.
-- Só vale para o que foi criado nos últimos 7 dias. Devolve quantos saíram e quantos ficaram.
create or replace function public.importacao_desfazer(p_petshop uuid, p_clientes uuid[], p_pets uuid[]) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare n_pets int; n_tutores int;
begin
  if p_petshop is null or p_petshop not in (select public.meus_petshops()) then raise exception 'Pet shop não encontrado.'; end if;
  if not public.acesso_liberado(p_petshop) then raise exception 'Sua conta está só para consulta.'; end if;
  if not public.tenho_area(p_petshop, array['clientes']) then raise exception 'Você não tem permissão para mexer nos clientes.'; end if;

  delete from public.pets p
    where p.petshop_id = p_petshop and p.id = any (coalesce(p_pets, '{}')) and p.criado_em > now() - interval '7 days'
      and not exists (select 1 from public.agendamentos x where x.pet_id = p.id)
      and not exists (select 1 from public.estadias x where x.pet_id = p.id)
      and not exists (select 1 from public.pacotes_clientes x where x.pet_id = p.id)
      and not exists (select 1 from public.creche_planos x where x.pet_id = p.id)
      and not exists (select 1 from public.creche_cobrancas x where x.pet_id = p.id)
      and not exists (select 1 from public.creche_faltas x where x.pet_id = p.id)
      and not exists (select 1 from public.pets_saude x where x.pet_id = p.id);
  get diagnostics n_pets = row_count;
  delete from public.clientes c
    where c.petshop_id = p_petshop and c.id = any (coalesce(p_clientes, '{}')) and c.criado_em > now() - interval '7 days'
      and not exists (select 1 from public.pets x where x.cliente_id = c.id)
      and not exists (select 1 from public.lancamentos x where x.cliente_id = c.id)
      and not exists (select 1 from public.fidelidade_resgates x where x.cliente_id = c.id)
      and not exists (select 1 from public.creche_cobrancas x where x.cliente_id = c.id);
  get diagnostics n_tutores = row_count;
  return jsonb_build_object('pets', n_pets, 'tutores', n_tutores,
    'pets_ficaram', coalesce(cardinality(p_pets), 0) - n_pets, 'tutores_ficaram', coalesce(cardinality(p_clientes), 0) - n_tutores);
end $$;
revoke execute on function public.importacao_desfazer(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.importacao_desfazer(uuid, uuid[], uuid[]) to authenticated;

-- ---------- 4. pedido do link: "este telefone já é de Fulano. É a mesma pessoa?" ----------
-- pedido_aceitar NÃO é redefinida aqui (outra migração cuida dela). Duas funções novas, que funcionam com o que ela fizer:
--   pedido_tutores_do_telefone(p_id): os tutores que já têm o telefone do pedido, do mais antigo para o mais novo
--     (o primeiro é o que pedido_aceitar escolhe). A tela usa para perguntar antes de aceitar.
--   pedido_aceitar_como(p_id, p_profissional, p_forcar, p_tutor_novo): chama pedido_aceitar com os mesmos três argumentos e,
--     se p_tutor_novo, passa o pet e o horário (ou a reserva) deste pedido para um tutor com o nome digitado no pedido.
--     Roda tudo na mesma transação: se a segunda parte falhar, o pedido continua pendente.
create or replace function public.pedido_tutores_do_telefone(p_id uuid) returns table (id uuid, nome text, telefone text)
  language sql stable security definer set search_path = '' as $$
  select c.id, c.nome, c.telefone
    from public.pedidos_agendamento v
    join public.clientes c on c.petshop_id = v.petshop_id
     and right(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), 8) = right(regexp_replace(v.telefone, '\D', '', 'g'), 8)
    where v.id = p_id and v.petshop_id in (select public.meus_petshops()) and length(regexp_replace(v.telefone, '\D', '', 'g')) >= 8
    order by c.criado_em, c.id
$$;

create or replace function public.pedido_aceitar_como(p_id uuid, p_profissional uuid default null, p_forcar boolean default false, p_tutor_novo boolean default false) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  v public.pedidos_agendamento;
  v_ag uuid; v_pet uuid; v_novo uuid; v_pet2 uuid;
  p public.pets; c public.clientes;
  igual boolean;
begin
  v_ag := public.pedido_aceitar(p_id, p_profissional, p_forcar); -- confere dono do pedido, conta liberada, vagas
  if not coalesce(p_tutor_novo, false) then return v_ag; end if;

  select * into v from public.pedidos_agendamento where id = p_id;
  if v.estadia_id is not null then select pet_id into v_pet from public.estadias where id = v.estadia_id;
  elsif v.agendamento_id is not null then select pet_id into v_pet from public.agendamentos where id = v.agendamento_id;
  end if;
  if v_pet is null then return v_ag; end if;
  select * into p from public.pets where id = v_pet;
  select * into c from public.clientes where id = p.cliente_id;
  igual := lower(btrim(c.nome)) = lower(btrim(v.tutor_nome));
  -- o tutor já é novo (criado agora) ou já tem o nome do pedido: nada a separar
  if c.criado_em >= now() or igual then return v_ag; end if;

  select x.id into v_novo from public.clientes x
    where x.petshop_id = v.petshop_id and x.id <> c.id and lower(btrim(x.nome)) = lower(btrim(v.tutor_nome))
      and right(regexp_replace(coalesce(x.telefone, ''), '\D', '', 'g'), 8) = right(regexp_replace(v.telefone, '\D', '', 'g'), 8)
    order by x.criado_em limit 1;
  if v_novo is null then
    insert into public.clientes (petshop_id, nome, telefone) values (v.petshop_id, v.tutor_nome, v.telefone) returning id into v_novo;
  end if;

  if p.criado_em >= now() then
    -- o pet nasceu neste pedido: vai inteiro para o tutor novo
    update public.pets set cliente_id = v_novo where id = v_pet;
  else
    -- o pet já era do outro tutor (mesmo nome de pet): fica com ele; o pedido ganha um pet do tutor novo
    select x.id into v_pet2 from public.pets x
      where x.petshop_id = v.petshop_id and x.cliente_id = v_novo and lower(btrim(x.nome)) = lower(btrim(v.pet_nome)) order by x.criado_em limit 1;
    if v_pet2 is null then
      insert into public.pets (petshop_id, cliente_id, nome, especie, porte) values (v.petshop_id, v_novo, v.pet_nome, v.especie, v.porte) returning id into v_pet2;
    end if;
    update public.agendamentos set pet_id = v_pet2 where id = v.agendamento_id;
    update public.estadias set pet_id = v_pet2 where id = v.estadia_id;
  end if;
  return v_ag;
end $$;
revoke execute on function public.pedido_tutores_do_telefone(uuid), public.pedido_aceitar_como(uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.pedido_tutores_do_telefone(uuid), public.pedido_aceitar_como(uuid, uuid, boolean, boolean) to authenticated;

-- ---------- 5. almoço dentro do horário de funcionamento ----------
-- Cada dia aberto de petshops.horario pode ganhar a chave opcional "almoco": {"de": "12:00", "ate": "13:00"}
-- (ex.: "1": {"abre": "08:00", "fecha": "18:00", "almoco": {"de": "12:00", "ate": "13:00"}}).
-- "abre" e "fecha" continuam iguais; dia sem "almoco" não muda em nada, e quem só lê "abre"/"fecha" nem percebe.
-- O almoço só vale no dia em que o pet shop abre antes e continua aberto depois dele.
-- O link deixa de oferecer horário que cruza o almoço.
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
