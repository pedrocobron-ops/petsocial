-- Pedido pelo link: achar o pet certo na hora de aceitar.
--
-- Antes, o pet do pedido só era o pet da ficha quando o nome batia igual (maiúsculas e espaços à parte): "Tor" no pedido e
-- "Thor" na ficha viravam dois pets. Agora:
--   - nome igual, sem contar acento ("Pérola" = "Perola"), maiúsculas e espaços: o pedido entra no pet da ficha, como antes;
--   - nome parecido: a tela pergunta "É o Thor que já está cadastrado?" e manda o pet escolhido (p_pet / p_pets);
--   - nome bem diferente: nasce um pet novo e o pedido fica marcado (pet_novo), para a tela mostrar "pet novo" e deixar
--     corrigir com um toque (pedido_trocar_pet).
-- A conta do "parecido" é da tela (src/lib/gestao/pet-parecido.ts). O link do tutor não muda e nunca mostra os pets da ficha.
--
-- 1. pedidos_agendamento.pet_novo: o aceite criou um pet novo para um tutor que já tinha outros pets.
-- 2. nome_de_pet(text): o nome (de pet ou de tutor) do jeito de comparar: sem acento (tabela de troca fixa, a mesma de
--    nomeDePet em src/lib/gestao/pet-parecido.ts, para a tela e o banco darem sempre o mesmo resultado), minúsculas,
--    um espaço só. Não usa a extensão unaccent (não está instalada no projeto) e não depende do idioma do banco.
-- 3. pedido_aceitar: uma versão nova com p_pet (obrigatório, para não haver duas funções que servem à mesma chamada);
--    a de sempre (sem p_pet) passa a chamar a nova com p_pet nulo. O nome igual passa a ignorar acento.
--    p_pet só vale se for um pet do mesmo pet shop cujo tutor tem o telefone do pedido; senão, o aceite é recusado.
-- 4. pedido_aceitar_como: uma versão nova com p_pet (obrigatório); a de sempre chama a nova com p_pet nulo.
--    O nome do tutor também passa a ignorar acento (José = Jose), e com p_pet o
--    tutor é o dono do pet escolhido: nada de tutor novo.
-- 5. pedidos_aceitar_juntos: uma versão nova com p_pets ({ "<id do pedido>": "<id do pet>" }, obrigatório);
--    a de sempre chama a nova com p_pets nulo. O mesmo pet escolhido para dois pedidos é recusado.
-- 6. pedido_trocar_pet(p_id, p_pet): "Era outro pet?" — só no pedido marcado como pet novo, por quem cuida da área
--    (agenda para horário, creche_hotel para reserva). O horário (marcado ou confirmado, sem choque com outro horário do
--    pet escolhido) ou a reserva passa para outro pet do mesmo tutor; com porte diferente, o preço da lista é refeito
--    (só onde o valor ainda é o da lista do porte antigo). O pet que nasceu no aceite é apagado só se nasceu depois do
--    pedido, não tem nada ligado a ele e a ficha continua como o aceite deixou (sem foto, raça, sexo, nascimento, alertas, obs).
--
-- Trocas (cópia fiel da definição mais recente, mais o que está dito):
--   pedido_aceitar (20261239), pedido_aceitar_como (20261137), pedidos_aceitar_juntos (20261235).
-- O aplicativo que está no ar continua funcionando: todas as chamadas de antes servem do mesmo jeito.

-- ---------- 1. o aceite criou um pet novo ----------
alter table public.pedidos_agendamento add column if not exists pet_novo boolean not null default false;

-- ---------- 2. o nome do jeito de comparar ----------
create or replace function public.nome_de_pet(p text) returns text
  language sql immutable parallel safe set search_path = '' as $$
  select btrim(regexp_replace(lower(translate(coalesce(p, ''),
    'ÁÀÂÃÄÅĀĂĄÉÈÊËĒĖĘĚÍÌÎÏĪĮÓÒÔÕÖØŌŐÚÙÛÜŪŮŰÇĆČÑŃÝŸŽŹŻŠŚŁĐĎŤŘĞŞáàâãäåāăąéèêëēėęěíìîïīįóòôõöøōőúùûüūůűçćčñńýÿžźżšśłđďťřğş',
    'aaaaaaaaaeeeeeeeeiiiiiioooooooouuuuuuucccnnyyzzzsslddtrgsaaaaaaaaaeeeeeeeeiiiiiioooooooouuuuuuucccnnyyzzzsslddtrgs')), '\s+', ' ', 'g'))
$$;
grant execute on function public.nome_de_pet(text) to authenticated, service_role;

-- ---------- 3. aceitar, com o pet escolhido ----------
create or replace function public.pedido_aceitar(p_id uuid, p_profissional uuid, p_forcar boolean, p_pet uuid) returns uuid
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
  v_escolhido public.pets;
  v_pet_novo boolean := false;
begin
  select * into v from public.pedidos_agendamento where id = p_id for update;
  if not found or v.petshop_id not in (select public.meus_petshops()) then raise exception 'Pedido não encontrado.'; end if;
  if not public.acesso_liberado(v.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if v.status <> 'pendente' then raise exception 'Esse pedido já foi respondido.'; end if;
  if p_profissional is not null and not exists (select 1 from public.profissionais where id = p_profissional and petshop_id = v.petshop_id) then
    raise exception 'Profissional inválido.';
  end if;
  select * into s from public.petshops where id = v.petshop_id;

  if p_pet is not null then
    -- o pet escolhido na tela ("É o Thor que já está cadastrado?"): do mesmo pet shop e de um tutor com o telefone do pedido
    select x.* into v_escolhido from public.pets x join public.clientes c on c.id = x.cliente_id and c.petshop_id = x.petshop_id
      where x.id = p_pet and x.petshop_id = v.petshop_id
        and length(regexp_replace(coalesce(v.telefone, ''), '\D', '', 'g')) >= 8
        and right(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), 8) = right(regexp_replace(v.telefone, '\D', '', 'g'), 8);
    if not found then raise exception 'Esse pet não é deste tutor.'; end if;
    v_cliente := v_escolhido.cliente_id;
    v_pet := v_escolhido.id;
    v_porte := v_escolhido.porte;
  else
    select id into v_cliente from public.clientes
      where petshop_id = v.petshop_id and right(regexp_replace(coalesce(telefone, ''), '\D', '', 'g'), 8) = right(v.telefone, 8)
      order by criado_em limit 1;
    if v_cliente is null then
      insert into public.clientes (petshop_id, nome, telefone) values (v.petshop_id, v.tutor_nome, v.telefone) returning id into v_cliente;
    end if;
    -- o mesmo nome, sem contar acento, maiúsculas e espaços ("Pérola" = "Perola")
    select id, porte into v_pet, v_porte from public.pets
      where petshop_id = v.petshop_id and cliente_id = v_cliente and public.nome_de_pet(nome) = public.nome_de_pet(v.pet_nome) order by criado_em limit 1;
    if v_pet is null then
      -- o tutor já tinha outros pets: o pedido fica marcado, e a tela deixa corrigir ("Era outro pet?")
      v_pet_novo := exists (select 1 from public.pets where petshop_id = v.petshop_id and cliente_id = v_cliente and ativo);
      insert into public.pets (petshop_id, cliente_id, nome, especie, porte) values (v.petshop_id, v_cliente, v.pet_nome, v.especie, v.porte)
        returning id, porte into v_pet, v_porte;
    end if;
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
    update public.pedidos_agendamento set status = 'aceito', estadia_id = v_ag, pet_novo = v_pet_novo where id = p_id;
    return v_ag;
  end if;

  select case coalesce(v_porte, v.porte) when 'P' then preco_p when 'M' then preco_m when 'G' then preco_g when 'GG' then preco_gg else null end
    into v_preco from public.servicos where id = v.servico_id;
  insert into public.agendamentos (petshop_id, pet_id, servico_id, profissional_id, inicio, fim, preco, obs, origem, criado_por)
    values (v.petshop_id, v_pet, v.servico_id, p_profissional, v.inicio, v.fim, v_preco, v.obs, 'link', (select auth.uid()))
    returning id into v_ag;
  -- os outros serviços do pedido entram no mesmo horário, cada um com o preço da lista no porte (a mesma regra do principal)
  if cardinality(coalesce(v.outros_servicos, '{}'::uuid[])) > 0 then
    insert into public.agendamento_servicos (petshop_id, agendamento_id, servico_id, preco, ordem)
    select v.petshop_id, v_ag, x.id,
        case coalesce(v_porte, v.porte) when 'P' then x.preco_p when 'M' then x.preco_m when 'G' then x.preco_g when 'GG' then x.preco_gg else null end,
        t.ordem::smallint
      from unnest(v.outros_servicos) with ordinality t(id, ordem)
      join public.servicos x on x.id = t.id and x.petshop_id = v.petshop_id
      where x.id is distinct from v.servico_id
      order by t.ordem
    on conflict (agendamento_id, servico_id) do nothing;
  end if;
  update public.pedidos_agendamento set status = 'aceito', agendamento_id = v_ag, pet_novo = v_pet_novo where id = p_id;
  return v_ag;
end $$;
revoke execute on function public.pedido_aceitar(uuid, uuid, boolean, uuid) from public, anon;
grant execute on function public.pedido_aceitar(uuid, uuid, boolean, uuid) to authenticated;

-- a de sempre: a mesma coisa, sem pet escolhido
create or replace function public.pedido_aceitar(p_id uuid, p_profissional uuid default null, p_forcar boolean default false) returns uuid
language sql security definer set search_path = '' as $$
  select public.pedido_aceitar(p_id, p_profissional, p_forcar, null::uuid)
$$;
revoke execute on function public.pedido_aceitar(uuid, uuid, boolean) from public, anon;
grant execute on function public.pedido_aceitar(uuid, uuid, boolean) to authenticated;

-- ---------- 4. aceitar como (tutor que já existe ou tutor novo), com o pet escolhido ----------
create or replace function public.pedido_aceitar_como(p_id uuid, p_profissional uuid, p_forcar boolean, p_tutor_novo boolean, p_pet uuid) returns uuid
  language plpgsql security definer set search_path = '' as $$
declare
  v public.pedidos_agendamento;
  v_ag uuid; v_pet uuid; v_novo uuid; v_pet2 uuid;
  p public.pets; c public.clientes;
  igual boolean;
begin
  v_ag := public.pedido_aceitar(p_id, p_profissional, p_forcar, p_pet); -- confere dono do pedido, conta liberada, vagas, o pet escolhido
  -- com o pet escolhido, o tutor é o dono dele: nada a separar
  if not coalesce(p_tutor_novo, false) or p_pet is not null then return v_ag; end if;

  select * into v from public.pedidos_agendamento where id = p_id;
  if v.estadia_id is not null then select pet_id into v_pet from public.estadias where id = v.estadia_id;
  elsif v.agendamento_id is not null then select pet_id into v_pet from public.agendamentos where id = v.agendamento_id;
  end if;
  if v_pet is null then return v_ag; end if;
  select * into p from public.pets where id = v_pet;
  select * into c from public.clientes where id = p.cliente_id;
  igual := public.nome_de_pet(c.nome) = public.nome_de_pet(v.tutor_nome);
  -- o tutor já é novo (criado agora) ou já tem o nome do pedido: nada a separar
  if c.criado_em >= now() or igual then return v_ag; end if;

  select x.id into v_novo from public.clientes x
    where x.petshop_id = v.petshop_id and x.id <> c.id and public.nome_de_pet(x.nome) = public.nome_de_pet(v.tutor_nome)
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
      where x.petshop_id = v.petshop_id and x.cliente_id = v_novo and public.nome_de_pet(x.nome) = public.nome_de_pet(v.pet_nome) order by x.criado_em limit 1;
    if v_pet2 is null then
      insert into public.pets (petshop_id, cliente_id, nome, especie, porte) values (v.petshop_id, v_novo, v.pet_nome, v.especie, v.porte) returning id into v_pet2;
    end if;
    update public.agendamentos set pet_id = v_pet2 where id = v.agendamento_id;
    update public.estadias set pet_id = v_pet2 where id = v.estadia_id;
  end if;
  -- o pedido foi para outro tutor: "pet novo" (nome diferente dos pets do primeiro tutor) não vale mais
  update public.pedidos_agendamento set pet_novo = false where id = p_id and pet_novo;
  return v_ag;
end $$;
revoke execute on function public.pedido_aceitar_como(uuid, uuid, boolean, boolean, uuid) from public, anon;
grant execute on function public.pedido_aceitar_como(uuid, uuid, boolean, boolean, uuid) to authenticated;

create or replace function public.pedido_aceitar_como(p_id uuid, p_profissional uuid default null, p_forcar boolean default false, p_tutor_novo boolean default false) returns uuid
  language sql security definer set search_path = '' as $$
  select public.pedido_aceitar_como(p_id, p_profissional, p_forcar, p_tutor_novo, null::uuid)
$$;
revoke execute on function public.pedido_aceitar_como(uuid, uuid, boolean, boolean) from public, anon;
grant execute on function public.pedido_aceitar_como(uuid, uuid, boolean, boolean) to authenticated;

-- ---------- 5. aceitar todos de uma vez, com o pet escolhido de cada pedido ----------
-- p_pets: { "<id do pedido>": "<id do pet>" } (só os pedidos em que a pessoa disse "Sim, é ele"). Nulo ou {}: nenhum.
create or replace function public.pedidos_aceitar_juntos(p_ids uuid[], p_profissional uuid, p_forcar boolean,
  p_tutor_novo boolean, p_portes jsonb, p_pets jsonb) returns jsonb
language plpgsql set search_path = '' as $$
declare
  q record; v_ag uuid; v_resp text; v_feitos jsonb := '[]'::jsonb; v_sinais int := 0; r jsonb; v_n int := 0;
  v_pet_txt text; v_pet uuid;
begin
  if p_ids is null or cardinality(p_ids) < 1 or cardinality(p_ids) > 8 then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  if p_pets is not null and jsonb_typeof(p_pets) not in ('object', 'null') then raise exception 'Esse pet não é deste tutor.'; end if;
  if jsonb_typeof(p_pets) = 'object' and (select count(*) <> count(distinct lower(x.value)) from jsonb_each_text(p_pets) x) then
    raise exception 'O mesmo pet foi escolhido para dois pedidos.';
  end if;
  for q in select x.id, x.tipo from public.pedidos_agendamento x where x.id = any (p_ids) order by x.inicio, x.id loop
    v_n := v_n + 1;
    v_pet_txt := case when jsonb_typeof(p_pets) = 'object' then p_pets ->> q.id::text end;
    v_pet := null;
    if v_pet_txt is not null then
      if v_pet_txt !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Esse pet não é deste tutor.'; end if;
      v_pet := v_pet_txt::uuid;
    end if;
    v_ag := public.pedido_aceitar_como(q.id, case when q.tipo = 'servico' then p_profissional end, coalesce(p_forcar, false), coalesce(p_tutor_novo, false), v_pet);
    v_resp := case when jsonb_typeof(p_portes) = 'object' then p_portes ->> q.id::text end;
    if q.tipo = 'servico' and v_ag is not null and v_resp is not null then
      begin
        if v_resp = 'depois' then
          update public.agendamentos a set obs = left(concat_ws(' ', nullif(a.obs, ''), 'Conferir o porte e o valor na hora.'), 400)
           where a.id = v_ag and position('Conferir o porte e o valor na hora.' in coalesce(a.obs, '')) = 0;
        elsif v_resp in ('P', 'M', 'G', 'GG') then
          update public.pets t set porte = v_resp where t.id = (select a.pet_id from public.agendamentos a where a.id = v_ag) and t.porte is null;
          perform public.agendamento_preco_da_tabela(v_ag);
        end if;
      exception when others then
        -- o horário já foi marcado: o porte e o valor ficam para acertar na ficha e no horário
        raise warning 'pedidos_aceitar_juntos (porte): %', sqlerrm;
      end;
    end if;
    v_feitos := v_feitos || jsonb_build_object('id', q.id, 'criado', v_ag);
  end loop;
  if v_n <> cardinality(p_ids) then raise exception 'Pedido não encontrado.' using errcode = 'P0002'; end if;
  -- com todas as reservas criadas: a diária de cada pet (pelo porte) e, por último, o sinal da regra do dono
  for q in select x.id from public.pedidos_agendamento x where x.id = any (p_ids) and x.tipo in ('creche', 'hotel') order by x.inicio, x.id loop
    begin perform public.pedido_acertar_diaria(q.id); exception when others then raise warning 'pedidos_aceitar_juntos (diária): %', sqlerrm; end;
  end loop;
  for q in select x.id from public.pedidos_agendamento x where x.id = any (p_ids) and x.tipo in ('creche', 'hotel') order by x.inicio, x.id loop
    begin
      r := public.pedido_criar_sinal(q.id);
      if r -> 'criado' = 'true'::jsonb then v_sinais := v_sinais + 1; end if;
    exception when others then raise warning 'pedidos_aceitar_juntos (sinal): %', sqlerrm; end;
  end loop;
  return jsonb_build_object('ok', true, 'feitos', v_feitos, 'sinais', v_sinais);
end $$;
revoke execute on function public.pedidos_aceitar_juntos(uuid[], uuid, boolean, boolean, jsonb, jsonb) from public, anon;
grant execute on function public.pedidos_aceitar_juntos(uuid[], uuid, boolean, boolean, jsonb, jsonb) to authenticated, service_role;

create or replace function public.pedidos_aceitar_juntos(p_ids uuid[], p_profissional uuid default null, p_forcar boolean default false,
  p_tutor_novo boolean default false, p_portes jsonb default null) returns jsonb
language sql set search_path = '' as $$
  select public.pedidos_aceitar_juntos(p_ids, p_profissional, p_forcar, p_tutor_novo, p_portes, null::jsonb)
$$;
revoke execute on function public.pedidos_aceitar_juntos(uuid[], uuid, boolean, boolean, jsonb) from public, anon;
grant execute on function public.pedidos_aceitar_juntos(uuid[], uuid, boolean, boolean, jsonb) to authenticated, service_role;

-- ---------- 6. "Era outro pet?": o pedido aceito passa para outro pet do mesmo tutor ----------
-- Quem pode: quem cuida da área do pedido (agenda para horário, creche_hotel para reserva), com a conta liberada.
-- Só no pedido marcado como pet novo (o aceite criou o pet). O pet de antes só é apagado se nasceu depois do pedido chegar,
-- a ficha está como o aceite deixou e nada aponta para ele (nenhuma tabela que aponta para pets, nem creche_taxi).
create or replace function public.pedido_trocar_pet(p_id uuid, p_pet uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.pedidos_agendamento;
  s public.petshops;
  a public.pets; b public.pets;
  v_de uuid; e public.estadias; ag public.agendamentos; v_outra public.estadias;
  v_porte_antes text; v_porte_agora text;
  k record; v_tem boolean := false; v_apagado boolean := false; v_preco_mudou boolean := false;
begin
  select * into v from public.pedidos_agendamento where id = p_id for update;
  if not found or v.petshop_id not in (select public.meus_petshops()) then raise exception 'Pedido não encontrado.'; end if;
  if not public.tenho_area(v.petshop_id, case when v.tipo in ('creche', 'hotel') then array['creche_hotel'] else array['agenda'] end) then
    raise exception 'Você não tem acesso a %.', case when v.tipo in ('creche', 'hotel') then 'Creche e hotel' else 'Agenda' end;
  end if;
  if not public.acesso_liberado(v.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if v.status <> 'aceito' then raise exception 'Esse pedido ainda não foi aceito.'; end if;
  if not v.pet_novo then raise exception 'Esse pedido não criou pet novo.'; end if;
  if v.estadia_id is not null then select * into e from public.estadias where id = v.estadia_id for update; v_de := e.pet_id;
  elsif v.agendamento_id is not null then select * into ag from public.agendamentos where id = v.agendamento_id for update; v_de := ag.pet_id;
  end if;
  if v_de is null then raise exception 'Esse pedido não tem horário nem reserva.'; end if;
  select * into a from public.pets where id = v_de;
  select * into b from public.pets where id = p_pet and petshop_id = v.petshop_id and cliente_id = a.cliente_id;
  if not found then raise exception 'Escolha um pet deste tutor.'; end if;
  if b.id = a.id then return jsonb_build_object('ok', true, 'apagado', false, 'pet', b.nome); end if;

  if v.estadia_id is not null then
    if e.status not in ('reservada', 'em_casa') then raise exception 'Essa reserva não está mais ativa.'; end if;
    select * into s from public.petshops where id = v.petshop_id;
    select * into v_outra from public.estadias x
      where x.pet_id = b.id and x.id <> e.id and x.status in ('reservada', 'em_casa')
        and (x.entrada at time zone s.fuso)::date <= coalesce((e.saida_prevista at time zone s.fuso)::date, (e.entrada at time zone s.fuso)::date)
        and coalesce((x.saida_prevista at time zone s.fuso)::date, (x.entrada at time zone s.fuso)::date) >= (e.entrada at time zone s.fuso)::date
      limit 1;
    if found then raise exception '% já tem reserva nessas datas.', b.nome; end if;
    update public.estadias set pet_id = b.id where id = e.id;
  else
    -- só horário que ainda vai acontecer (marcado ou confirmado), e sem choque com outro horário do pet escolhido
    if ag.status not in ('marcado', 'confirmado') then raise exception 'Esse horário já foi atendido ou desmarcado.'; end if;
    if exists (select 1 from public.agendamentos x where x.pet_id = b.id and x.id <> ag.id and x.status in ('marcado', 'confirmado', 'em_atendimento')
                 and x.inicio < ag.fim and x.fim > ag.inicio) then
      raise exception '% já tem horário nesse momento.', b.nome;
    end if;
    update public.agendamentos set pet_id = b.id where id = ag.id;
  end if;
  -- o porte que veio no pedido vai para a ficha, se ela estava sem
  if b.porte is null and a.porte is not null then update public.pets set porte = a.porte where id = b.id; b.porte := a.porte; end if;
  -- porte diferente: o preço da lista é refeito (a mesma regra do aceite), só onde o valor ainda é o da lista do porte
  -- antigo; valor mudado à mão fica como está
  v_porte_antes := coalesce(a.porte, v.porte);
  v_porte_agora := b.porte;
  if v.agendamento_id is not null and v_porte_agora is not null and v_porte_antes is distinct from v_porte_agora then
    update public.agendamentos x
       set preco = case v_porte_agora when 'P' then sv.preco_p when 'M' then sv.preco_m when 'G' then sv.preco_g when 'GG' then sv.preco_gg end
      from public.servicos sv
     where x.id = ag.id and sv.id = x.servico_id and sv.petshop_id = x.petshop_id
       and x.preco is not distinct from (case v_porte_antes when 'P' then sv.preco_p when 'M' then sv.preco_m when 'G' then sv.preco_g when 'GG' then sv.preco_gg end)
       and (case v_porte_agora when 'P' then sv.preco_p when 'M' then sv.preco_m when 'G' then sv.preco_g when 'GG' then sv.preco_gg end) is not null;
    v_preco_mudou := found;
    update public.agendamento_servicos o
       set preco = case v_porte_agora when 'P' then sv.preco_p when 'M' then sv.preco_m when 'G' then sv.preco_g when 'GG' then sv.preco_gg end
      from public.servicos sv
     where o.agendamento_id = ag.id and sv.id = o.servico_id and sv.petshop_id = o.petshop_id
       and o.preco is not distinct from (case v_porte_antes when 'P' then sv.preco_p when 'M' then sv.preco_m when 'G' then sv.preco_g when 'GG' then sv.preco_gg end)
       and (case v_porte_agora when 'P' then sv.preco_p when 'M' then sv.preco_m when 'G' then sv.preco_g when 'GG' then sv.preco_gg end) is not null;
    v_preco_mudou := v_preco_mudou or found;
  end if;
  update public.pedidos_agendamento set pet_novo = false where id = p_id;

  -- o pet de antes: só sai se foi o aceite que criou, a ficha está como o aceite deixou e nada aponta para ele
  if a.criado_em >= v.criado_em and a.ativo and coalesce(btrim(a.foto), '') = '' and coalesce(btrim(a.obs), '') = ''
     and coalesce(btrim(a.raca), '') = '' and coalesce(btrim(a.alertas), '') = '' and a.nascimento is null and a.sexo is null then
    for k in select c.conrelid::regclass as tabela, t.attname as coluna
               from pg_constraint c join pg_attribute t on t.attrelid = c.conrelid and t.attnum = c.conkey[1]
              where c.contype = 'f' and c.confrelid = 'public.pets'::regclass
             union all select 'public.creche_taxi'::regclass, 'pet_id'::name where to_regclass('public.creche_taxi') is not null loop
      execute format('select exists (select 1 from %s where %I = $1)', k.tabela, k.coluna) using a.id into v_tem;
      exit when v_tem;
    end loop;
    if not v_tem then
      delete from public.pets where id = a.id;
      v_apagado := true;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'apagado', v_apagado, 'pet', b.nome, 'preco', v_preco_mudou);
end $$;
revoke execute on function public.pedido_trocar_pet(uuid, uuid) from public, anon;
grant execute on function public.pedido_trocar_pet(uuid, uuid) to authenticated;
