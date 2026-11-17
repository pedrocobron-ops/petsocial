-- Caixa e fichas (testadora Bia, hotel só).
-- Página do tutor: cada pet ganha 'ultima_vez' (o último dia em que esteve aqui: estadia encerrada ou na casa, ou banho concluído),
-- para a página dizer "Thor veio hoje. Ainda não tem diário nem fotos." em vez de "Quando o pet vier, o dia aparece aqui".
-- Só acrescenta uma chave à resposta de tutor_pagina (mesma assinatura, mesmas permissões, o resto igual à 20261172):
-- o aplicativo de antes ignora a chave nova e continua funcionando com esta migração aplicada antes de publicar.

create or replace function public.tutor_pagina(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l public.tutor_links;
  s public.petshops;
  v_hoje date;
  v_dias int;
  v_pets jsonb;
begin
  l := public.tutor_do_codigo(p_token);
  if l.cliente_id is null then return null; end if;
  perform public.tutor_frear(l.cliente_id, 'pagina', 30);
  select * into s from public.petshops where id = l.petshop_id;
  v_hoje := (now() at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date;
  v_dias := public.tutor_dias_fotos(s.id);
  if l.visto_em is null or l.visto_em < now() - interval '10 minutes' then
    update public.tutor_links set visto_em = now() where cliente_id = l.cliente_id;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'nome', p.nome, 'especie', p.especie, 'sexo', p.sexo, 'foto', p.foto,
    -- o último dia em que o pet esteve aqui (estadia encerrada ou na casa, banho concluído): só a data, para a página não dizer
    -- "quando o pet vier" a quem veio hoje e ficou sem diário nem fotos
    'ultima_vez', greatest(
      (select max(case when e.status = 'em_casa' then v_hoje else (coalesce(e.saida, e.entrada) at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date end)
         from public.estadias e where e.pet_id = p.id and e.petshop_id = s.id and e.status in ('encerrada', 'em_casa')),
      (select max((a.inicio at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date)
         from public.agendamentos a where a.pet_id = p.id and a.petshop_id = s.id and a.status = 'concluido' and a.inicio < now() + interval '1 day')),
    -- está na casa agora?
    'na_casa', (select jsonb_build_object('tipo', e.tipo, 'entrada', e.entrada, 'saida_prevista', e.saida_prevista)
                from public.estadias e where e.pet_id = p.id and e.petshop_id = s.id and e.status = 'em_casa' order by e.entrada desc limit 1),
    -- os dias com diário (últimos 30 dias) ou foto (dentro do prazo das fotos), no máximo 14
    'dias', coalesce((
      select jsonb_agg(d.j order by d.dia desc) from (
        select x.dia, jsonb_build_object(
          'dia', x.dia,
          'tipo', (select e.tipo from public.estadias e where e.id = x.estadia_id),
          'itens', coalesce((select r.itens from public.estadias_diario r where r.estadia_id = x.estadia_id and r.dia = x.dia), '[]'::jsonb),
          'nota', (select r.nota from public.estadias_diario r where r.estadia_id = x.estadia_id and r.dia = x.dia),
          'ocorrencias', coalesce((select jsonb_agg(jsonb_build_object('tipo', o.tipo, 'texto', o.texto, 'quando', o.quando) order by o.quando)
                          from public.estadias_ocorrencias o where o.estadia_id = x.estadia_id and o.no_diario
                            and (o.quando at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date = x.dia), '[]'::jsonb),
          'fotos', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'caminho', f.caminho, 'legenda', f.legenda, 'em', f.criado_em) order by f.criado_em)
                    from public.diario_fotos f where f.estadia_id = x.estadia_id and f.dia = x.dia and f.dia > v_hoje - v_dias), '[]'::jsonb)
        ) as j
        from (
          select distinct on (u.dia) u.estadia_id, u.dia from (
            select r.estadia_id, r.dia from public.estadias_diario r join public.estadias e on e.id = r.estadia_id
              where e.pet_id = p.id and r.petshop_id = s.id and r.dia > v_hoje - 30
                and (jsonb_array_length(r.itens) > 0 or nullif(trim(coalesce(r.nota, '')), '') is not null)
            union all
            select f.estadia_id, f.dia from public.diario_fotos f where f.pet_id = p.id and f.petshop_id = s.id and f.dia > v_hoje - v_dias
          ) u order by u.dia desc
          limit 14
        ) x
      ) d), '[]'::jsonb),
    -- o que está marcado (sem preço)
    'agenda', coalesce((
      select jsonb_agg(jsonb_build_object('inicio', a.inicio, 'servico', sv.nome) order by a.inicio)
      from (select * from public.agendamentos a where a.pet_id = p.id and a.petshop_id = s.id and a.inicio >= now()
              and a.status in ('marcado', 'confirmado') order by a.inicio limit 8) a
      left join public.servicos sv on sv.id = a.servico_id), '[]'::jsonb),
    'reservas', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', e.tipo, 'entrada', e.entrada, 'saida_prevista', e.saida_prevista) order by e.entrada)
      from (select * from public.estadias e where e.pet_id = p.id and e.petshop_id = s.id and e.status = 'reservada'
              and e.entrada >= now() - interval '1 day' order by e.entrada limit 8) e), '[]'::jsonb),
    -- vacinas e cuidados vencidos ou vencendo nos próximos 45 dias (o registro mais novo de cada um)
    'saude', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', v.tipo, 'nome', v.nome, 'vence_em', v.vence_em) order by v.vence_em)
      from (select distinct on (lower(h.nome)) h.tipo, h.nome, h.vence_em from public.pets_saude h
              where h.pet_id = p.id and h.petshop_id = s.id
              order by lower(h.nome), h.aplicado_em desc nulls last, h.vence_em desc nulls last) v
      where v.vence_em is not null and v.vence_em <= v_hoje + 45), '[]'::jsonb)
  ) order by p.nome), '[]'::jsonb)
  into v_pets
  from public.pets p where p.cliente_id = l.cliente_id and p.petshop_id = s.id and p.ativo;

  return jsonb_build_object(
    'petshop', jsonb_build_object('nome', s.nome, 'logo', s.logo, 'tema', s.tema, 'telefone', s.telefone, 'cidade', s.cidade, 'uf', s.uf, 'fuso', coalesce(s.fuso, 'America/Sao_Paulo')),
    'tutor', (select split_part(trim(c.nome), ' ', 1) from public.clientes c where c.id = l.cliente_id),
    'hoje', v_hoje,
    'dias_fotos', v_dias,
    'pets', v_pets
  );
end $$;
