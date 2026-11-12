-- Creche e hotel pelo link: mesma conta de vagas do sistema, aceite com conferência e o que foi cobrado guardado na estadia.

-- O que foi cobrado na saída (o histórico mostra isto, e não uma conta refeita pelas datas).
alter table public.estadias
  add column diarias_cobradas integer check (diarias_cobradas is null or diarias_cobradas >= 0),
  add column valor_cobrado numeric(10, 2) check (valor_cobrado is null or valor_cobrado >= 0);

-- Uma estadia ocupa vaga no dia `d`?
-- Creche: da entrada até a saída prevista, inclusive. Hotel: conta a noite, então o dia da saída fica livre.
-- Na casa sem saída prevista: o hotel segue ocupado até sair; a creche esvazia no fim do dia (ocupa só até hoje).
-- Hóspede do hotel que passou da saída e ainda está na casa ocupa só hoje.
-- Reserva sem saída prevista vale um dia (creche) ou uma noite (hotel).
create function public.estadia_ocupa(p_tipo text, p_status text, p_entrada date, p_saida date, p_dia date, p_hoje date) returns boolean
language sql immutable set search_path = '' as $$
  select p_entrada <= p_dia and case
    when p_status = 'em_casa' and p_saida is null then (p_tipo = 'hotel' or p_dia <= p_hoje)
    when p_tipo = 'hotel' then p_dia < coalesce(p_saida, p_entrada + 1) or (p_status = 'em_casa' and p_saida < p_hoje and p_dia = p_hoje)
    else p_dia <= case when p_status = 'em_casa' then greatest(coalesce(p_saida, p_entrada), p_hoje) else coalesce(p_saida, p_entrada) end
  end
$$;

create or replace function public.link_estadia_cheios(p_codigo text, p_tipo text, p_de date, p_ate date) returns setof date
language sql stable security definer set search_path = '' as $$
  select d::date
  from public.petshops p, generate_series(p_de, least(p_ate, p_de + 62), interval '1 day') d
  where p.link_codigo = p_codigo and p.link_ativo and p_tipo in ('creche', 'hotel')
    and (case p_tipo when 'creche' then p.vagas_creche else p.vagas_hotel end) is not null
    and (
      (select count(*) from public.estadias e where e.petshop_id = p.id and e.tipo = p_tipo and e.status in ('reservada', 'em_casa')
         and public.estadia_ocupa(e.tipo, e.status, (e.entrada at time zone p.fuso)::date, (e.saida_prevista at time zone p.fuso)::date, d::date, (now() at time zone p.fuso)::date))
      + (select count(*) from public.pedidos_agendamento x where x.petshop_id = p.id and x.tipo = p_tipo and x.status = 'pendente'
         and public.estadia_ocupa(x.tipo, 'reservada', (x.inicio at time zone p.fuso)::date, (x.fim at time zone p.fuso)::date, d::date, (now() at time zone p.fuso)::date))
    ) >= (case p_tipo when 'creche' then p.vagas_creche else p.vagas_hotel end)
$$;

-- Telefone com todos os algarismos iguais não é telefone.
create function public.fone_plausivel(p text) returns boolean
language sql immutable set search_path = '' as $$
  select char_length(p) between 10 and 13 and p !~ '^(\d)\1+$'
$$;

create or replace function public.link_pedir_estadia(
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
  if char_length(trim(coalesce(p_tutor, ''))) < 2 or not public.fone_plausivel(v_fone) or char_length(trim(coalesce(p_pet, ''))) < 1 then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end if;
  if p_entrada is null or p_saida is null or p_entrada < v_hoje or p_entrada > v_hoje + 365
     or p_saida < p_entrada or (p_tipo = 'hotel' and p_saida = p_entrada) or p_saida > p_entrada + 60 then
    return jsonb_build_object('ok', false, 'erro', 'datas');
  end if;
  -- o mesmo tutor pedindo de novo o mesmo pet para datas que se cruzam: avisa em vez de duplicar
  if exists (
    select 1 from public.pedidos_agendamento x
    where x.petshop_id = v.id and x.tipo in ('creche', 'hotel') and x.status in ('pendente', 'aceito')
      and right(x.telefone, 8) = right(v_fone, 8) and lower(trim(x.pet_nome)) = lower(trim(p_pet))
      and (x.inicio at time zone v.fuso)::date <= p_saida and (x.fim at time zone v.fuso)::date >= p_entrada
      and (x.fim at time zone v.fuso)::date >= v_hoje
  ) then
    return jsonb_build_object('ok', false, 'erro', 'repetido');
  end if;
  if (select count(*) from public.pedidos_agendamento where petshop_id = v.id and telefone = v_fone and status = 'pendente') >= 6
     or (select count(*) from public.pedidos_agendamento where petshop_id = v.id and criado_em > now() - interval '1 day') >= 60 then
    return jsonb_build_object('ok', false, 'erro', 'limite');
  end if;
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

-- Aceitar: pedido de creche ou hotel passa pelas mesmas conferências do formulário.
-- Mesmo pet com reserva ou estadia que cruza as datas: recusa. Casa cheia: recusa, a não ser com p_forcar.
drop function public.pedido_aceitar(uuid, uuid);
create function public.pedido_aceitar(p_id uuid, p_profissional uuid default null, p_forcar boolean default false) returns uuid
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
                 and public.estadia_ocupa(e.tipo, e.status, (e.entrada at time zone s.fuso)::date, (e.saida_prevista at time zone s.fuso)::date, d::date, v_hoje)) >= v_vagas;
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
revoke execute on function public.pedido_aceitar(uuid, uuid, boolean), public.estadia_ocupa(text, text, date, date, date, date), public.fone_plausivel(text) from public, anon;
grant execute on function public.pedido_aceitar(uuid, uuid, boolean), public.estadia_ocupa(text, text, date, date, date, date) to authenticated;
