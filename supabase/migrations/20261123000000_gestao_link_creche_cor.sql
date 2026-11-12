-- Creche e hotel no link do cliente, e cor própria do pet shop.

-- Cor própria: além das combinações prontas, aceita "#rrggbb/#rrggbb" (cor principal / cor de destaque).
alter table public.petshops drop constraint petshops_tema_check;
alter table public.petshops add constraint petshops_tema_check
  check (tema in ('floresta', 'oceano', 'uva', 'vinho', 'grafite', 'turquesa') or tema ~ '^#[0-9a-f]{6}/#[0-9a-f]{6}$');

-- O dono escolhe se o link também recebe pedido de creche e de hotel.
alter table public.petshops add column link_creche boolean not null default false, add column link_hotel boolean not null default false;
grant update (link_creche, link_hotel) on public.petshops to authenticated;

alter table public.pedidos_agendamento
  add column tipo text not null default 'servico' check (tipo in ('servico', 'creche', 'hotel')),
  add column estadia_id uuid;

-- Dias cheios de creche ou de hotel num período: conta quem está na casa, quem tem reserva e os pedidos esperando resposta.
create function public.link_estadia_cheios(p_codigo text, p_tipo text, p_de date, p_ate date) returns setof date
language sql stable security definer set search_path = '' as $$
  select d::date
  from public.petshops p, generate_series(p_de, least(p_ate, p_de + 62), interval '1 day') d
  where p.link_codigo = p_codigo and p.link_ativo and p_tipo in ('creche', 'hotel')
    and (case p_tipo when 'creche' then p.vagas_creche else p.vagas_hotel end) is not null
    and (
      (select count(*) from public.estadias e where e.petshop_id = p.id and e.tipo = p_tipo and e.status in ('reservada', 'em_casa')
         and (e.entrada at time zone p.fuso)::date <= d::date
         and (coalesce(e.saida_prevista, e.entrada) at time zone p.fuso)::date >= d::date)
      + (select count(*) from public.pedidos_agendamento x where x.petshop_id = p.id and x.tipo = p_tipo and x.status = 'pendente'
         and (x.inicio at time zone p.fuso)::date <= d::date and (x.fim at time zone p.fuso)::date >= d::date)
    ) >= (case p_tipo when 'creche' then p.vagas_creche else p.vagas_hotel end)
$$;

-- Pedido de creche (um ou mais dias) ou de hotel (entrada e saída) pelo link.
create function public.link_pedir_estadia(
  p_codigo text, p_tipo text, p_entrada date, p_saida date, p_tutor text, p_telefone text, p_pet text,
  p_especie text default 'cao', p_porte text default null, p_obs text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.petshops;
  v_fone text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_hoje date;
  v_id uuid;
  v_cheio date;
begin
  select * into v from public.petshops where link_codigo = p_codigo and link_ativo;
  if not found or not public.acesso_liberado(v.id) then return jsonb_build_object('ok', false, 'erro', 'fechado'); end if;
  if p_tipo not in ('creche', 'hotel') or (p_tipo = 'creche' and not v.link_creche) or (p_tipo = 'hotel' and not v.link_hotel) then
    return jsonb_build_object('ok', false, 'erro', 'fechado');
  end if;
  v_hoje := (now() at time zone v.fuso)::date;
  if char_length(trim(coalesce(p_tutor, ''))) < 2 or char_length(v_fone) not between 10 and 13 or char_length(trim(coalesce(p_pet, ''))) < 1
     or p_entrada is null or p_saida is null or p_entrada < v_hoje or p_entrada > v_hoje + 365
     or p_saida < p_entrada or (p_tipo = 'hotel' and p_saida = p_entrada) or p_saida > p_entrada + 60 then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end if;
  if (select count(*) from public.pedidos_agendamento where petshop_id = v.id and telefone = v_fone and status = 'pendente') >= 6
     or (select count(*) from public.pedidos_agendamento where petshop_id = v.id and criado_em > now() - interval '1 day') >= 60 then
    return jsonb_build_object('ok', false, 'erro', 'limite');
  end if;
  -- no hotel o dia da saída não ocupa vaga de noite
  select min(d) into v_cheio from public.link_estadia_cheios(p_codigo, p_tipo, p_entrada, case when p_tipo = 'hotel' then p_saida - 1 else p_saida end) d;
  if v_cheio is not null then return jsonb_build_object('ok', false, 'erro', 'lotado', 'dia', v_cheio); end if;
  insert into public.pedidos_agendamento (petshop_id, tutor_nome, telefone, pet_nome, especie, porte, inicio, fim, obs, tipo)
  values (v.id, left(trim(p_tutor), 120), v_fone, left(trim(p_pet), 80),
    case when p_especie in ('cao', 'gato', 'outro') then p_especie else 'cao' end,
    case when p_porte in ('P', 'M', 'G', 'GG') then p_porte else null end,
    (p_entrada::timestamp + time '08:00') at time zone v.fuso, (p_saida::timestamp + time '18:00') at time zone v.fuso,
    nullif(left(trim(coalesce(p_obs, '')), 300), ''), p_tipo)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'pets', 1, 'id', v_id);
end $$;

-- O link informa se recebe creche e hotel, com o preço da diária.
create or replace function public.link_info(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'nome', p.nome, 'telefone', p.telefone, 'cidade', p.cidade, 'uf', p.uf, 'horario', p.horario, 'aviso', p.link_aviso,
    'logo', p.logo, 'tema', p.tema,
    'hoje', (now() at time zone p.fuso)::date,
    'creche', case when p.link_creche then jsonb_build_object('diaria', p.diaria_creche) else null end,
    'hotel', case when p.link_hotel then jsonb_build_object('diaria', p.diaria_hotel) else null end,
    'servicos', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'duracao_min', s.duracao_min, 'cor', s.cor,
        'preco_p', s.preco_p, 'preco_m', s.preco_m, 'preco_g', s.preco_g, 'preco_gg', s.preco_gg) order by s.ordem, s.nome)
      from public.servicos s where s.petshop_id = p.id and s.ativo and s.categoria not in ('creche', 'hotel')
    ), '[]'::jsonb)
  )
  from public.petshops p
  where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)
$$;

-- Acompanhamento: pedido de creche ou hotel mostra o período.
create or replace function public.link_pedido(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'petshop', s.nome, 'telefone', s.telefone, 'codigo', s.link_codigo, 'tutor', split_part(p.tutor_nome, ' ', 1),
    'logo', s.logo, 'tema', s.tema,
    'itens', (
      select jsonb_agg(jsonb_build_object(
        'pet', x.pet_nome,
        'servico', case x.tipo when 'creche' then 'Creche' when 'hotel' then 'Hotel' else sv.nome end,
        'tipo', x.tipo,
        'dia', to_char(coalesce(a.inicio, e.entrada, x.inicio) at time zone s.fuso, 'YYYY-MM-DD'),
        'hora', to_char(coalesce(a.inicio, x.inicio) at time zone s.fuso, 'HH24:MI'),
        'ate', case when x.tipo <> 'servico' then to_char(coalesce(e.saida_prevista, x.fim) at time zone s.fuso, 'YYYY-MM-DD') else null end,
        'status', case
          when x.status = 'aceito' and (a.status in ('cancelado', 'faltou') or e.status = 'cancelada') then 'cancelado'
          when x.status = 'aceito' and (a.status = 'concluido' or e.status = 'encerrada') then 'concluido'
          else x.status end
      ) order by x.inicio)
      from public.pedidos_agendamento x
      left join public.servicos sv on sv.id = x.servico_id
      left join public.agendamentos a on a.id = x.agendamento_id
      left join public.estadias e on e.id = x.estadia_id
      where x.id = p.id or (p.grupo_id is not null and x.grupo_id = p.grupo_id)
    )
  )
  from public.pedidos_agendamento p join public.petshops s on s.id = p.petshop_id
  where p.id = p_id
$$;

-- Aceitar: pedido de creche ou hotel vira reserva; o resto segue como antes.
create or replace function public.pedido_aceitar(p_id uuid, p_profissional uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v public.pedidos_agendamento;
  v_cliente uuid;
  v_pet uuid;
  v_porte text;
  v_preco numeric(10, 2);
  v_ag uuid;
begin
  select * into v from public.pedidos_agendamento where id = p_id for update;
  if not found or v.petshop_id not in (select public.meus_petshops()) then raise exception 'Pedido não encontrado.'; end if;
  if not public.acesso_liberado(v.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if v.status <> 'pendente' then raise exception 'Esse pedido já foi respondido.'; end if;
  if p_profissional is not null and not exists (select 1 from public.profissionais where id = p_profissional and petshop_id = v.petshop_id) then
    raise exception 'Profissional inválido.';
  end if;

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
    insert into public.estadias (petshop_id, pet_id, tipo, entrada, saida_prevista, valor_diaria, status, obs)
      select v.petshop_id, v_pet, v.tipo, v.inicio, v.fim, case v.tipo when 'creche' then s.diaria_creche else s.diaria_hotel end, 'reservada', v.obs
      from public.petshops s where s.id = v.petshop_id
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

revoke execute on function public.link_estadia_cheios(text, text, date, date),
  public.link_pedir_estadia(text, text, date, date, text, text, text, text, text, text) from public;
grant execute on function public.link_estadia_cheios(text, text, date, date),
  public.link_pedir_estadia(text, text, date, date, text, text, text, text, text, text) to anon, authenticated;
