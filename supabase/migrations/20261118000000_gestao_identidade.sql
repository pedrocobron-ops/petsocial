-- Identidade do pet shop: logo e combinação de cores, usadas no aplicativo, no link do cliente e na agenda impressa.
alter table public.petshops
  add column logo text check (char_length(logo) <= 200),
  add column tema text not null default 'floresta' check (tema in ('floresta', 'oceano', 'uva', 'vinho', 'grafite', 'turquesa'));
grant update (logo, tema) on public.petshops to authenticated;

create or replace function public.link_info(p_codigo text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'nome', p.nome, 'telefone', p.telefone, 'cidade', p.cidade, 'uf', p.uf, 'horario', p.horario, 'aviso', p.link_aviso,
    'logo', p.logo, 'tema', p.tema,
    'hoje', (now() at time zone p.fuso)::date,
    'servicos', coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome, 'duracao_min', s.duracao_min, 'cor', s.cor,
        'preco_p', s.preco_p, 'preco_m', s.preco_m, 'preco_g', s.preco_g, 'preco_gg', s.preco_gg) order by s.ordem, s.nome)
      from public.servicos s where s.petshop_id = p.id and s.ativo and s.categoria not in ('creche', 'hotel')
    ), '[]'::jsonb)
  )
  from public.petshops p
  where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)
$$;

create or replace function public.link_pedido(p_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'petshop', s.nome, 'telefone', s.telefone, 'codigo', s.link_codigo, 'tutor', split_part(p.tutor_nome, ' ', 1),
    'logo', s.logo, 'tema', s.tema,
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
