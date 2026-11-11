-- Link de agendamento: o tutor acompanha o pedido (aguardando, confirmado, recusado) por um endereço só dele.

-- Mesmo pedido de antes, agora devolvendo o id para a página de acompanhamento.
create or replace function public.link_pedir(
  p_codigo text, p_servico uuid, p_dia date, p_hora text, p_tutor text, p_telefone text, p_pet text,
  p_especie text default 'cao', p_porte text default null, p_obs text default null, p_outros jsonb default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.petshops;
  v_fone text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_dur int;
  v_ini timestamptz;
  v_pets jsonb;
  v_grupo uuid;
  v_id uuid;
  v_primeiro uuid;
  n int;
  i int;
  v_p jsonb;
begin
  select * into v from public.petshops where link_codigo = p_codigo and link_ativo;
  if not found or not public.acesso_liberado(v.id) then return jsonb_build_object('ok', false, 'erro', 'fechado'); end if;
  v_pets := jsonb_build_array(jsonb_build_object('nome', p_pet, 'especie', p_especie, 'porte', p_porte))
    || case when jsonb_typeof(p_outros) = 'array' then p_outros else '[]'::jsonb end;
  n := jsonb_array_length(v_pets);
  if n > 4 or char_length(trim(coalesce(p_tutor, ''))) < 2 or char_length(v_fone) not between 10 and 13
     or exists (select 1 from jsonb_array_elements(v_pets) e where jsonb_typeof(e) <> 'object' or char_length(trim(coalesce(e ->> 'nome', ''))) < 1) then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end if;
  if p_hora is null or p_hora !~ '^\d{2}:\d{2}$' or not exists (select 1 from public.link_horarios(p_codigo, p_servico, p_dia, n) h where h = p_hora) then
    return jsonb_build_object('ok', false, 'erro', 'ocupado');
  end if;
  if (select count(*) from public.pedidos_agendamento where petshop_id = v.id and telefone = v_fone and status = 'pendente') + n > 6
     or (select count(*) from public.pedidos_agendamento where petshop_id = v.id and criado_em > now() - interval '1 day') >= 60 then
    return jsonb_build_object('ok', false, 'erro', 'limite');
  end if;
  select duracao_min into v_dur from public.servicos where id = p_servico and petshop_id = v.id;
  v_ini := (p_dia::timestamp + p_hora::time) at time zone v.fuso;
  if n > 1 then v_grupo := gen_random_uuid(); end if;
  for i in 0 .. n - 1 loop
    v_p := v_pets -> i;
    insert into public.pedidos_agendamento (petshop_id, tutor_nome, telefone, pet_nome, especie, porte, servico_id, inicio, fim, obs, grupo_id)
    values (v.id, left(trim(p_tutor), 120), v_fone, left(trim(v_p ->> 'nome'), 80),
      case when v_p ->> 'especie' in ('cao', 'gato', 'outro') then v_p ->> 'especie' else 'cao' end,
      case when v_p ->> 'porte' in ('P', 'M', 'G', 'GG') then v_p ->> 'porte' else null end,
      p_servico, v_ini + make_interval(mins => v_dur * i), v_ini + make_interval(mins => v_dur * (i + 1)),
      nullif(left(trim(coalesce(p_obs, '')), 300), ''), v_grupo)
    returning id into v_id;
    if i = 0 then v_primeiro := v_id; end if;
  end loop;
  return jsonb_build_object('ok', true, 'pets', n, 'id', v_primeiro);
end $$;

-- Situação de um pedido (e dos outros pets do mesmo pedido). Quem tem o id do pedido vê; o id não é adivinhável.
-- Se o horário aceito foi remarcado ou cancelado depois, mostra o que vale agora.
create function public.link_pedido(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'petshop', s.nome, 'telefone', s.telefone, 'codigo', s.link_codigo, 'tutor', split_part(p.tutor_nome, ' ', 1),
    'itens', (
      select jsonb_agg(jsonb_build_object(
        'pet', x.pet_nome, 'servico', sv.nome,
        'dia', to_char(coalesce(a.inicio, x.inicio) at time zone s.fuso, 'YYYY-MM-DD'),
        'hora', to_char(coalesce(a.inicio, x.inicio) at time zone s.fuso, 'HH24:MI'),
        'status', case
          when x.status = 'aceito' and a.status in ('cancelado', 'faltou') then 'cancelado'
          when x.status = 'aceito' and a.status = 'concluido' then 'concluido'
          else x.status end
      ) order by x.inicio)
      from public.pedidos_agendamento x
      left join public.servicos sv on sv.id = x.servico_id
      left join public.agendamentos a on a.id = x.agendamento_id
      where x.id = p.id or (p.grupo_id is not null and x.grupo_id = p.grupo_id)
    )
  )
  from public.pedidos_agendamento p join public.petshops s on s.id = p.petshop_id
  where p.id = p_id
$$;

revoke execute on function public.link_pedido(uuid) from public, anon, authenticated;
grant execute on function public.link_pedido(uuid) to anon, authenticated;
