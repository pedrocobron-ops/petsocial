-- Velocidade no celular com internet fraca (só acrescenta; pode entrar antes de publicar o site).
--
-- 1. visitas_dos_pets: a última visita de cada pet (e se tem algo marcado) calculada no banco, numa resposta só.
--    Antes a tela Hoje e a lista de Clientes baixavam todos os atendimentos concluídos e todas as estadias do pet shop
--    (milhares de linhas, em várias páginas) só para achar a última de cada pet. A conta é a mesma de
--    `buscarVisitas` (src/lib/gestao/visitas.ts), que segue como reserva quando a função não existe.
--    security invoker: valem as regras de sempre (RLS e colunas liberadas) de quem chama; nenhum valor em dinheiro.
-- Índices: conferidos com EXPLAIN (agenda do dia, lançamentos do mês, estadias abertas, cobranças do mês, pets do pet shop);
-- todos já usam os índices por pet shop que existem, então nenhum índice novo entra aqui.

create or replace function public.visitas_dos_pets(p uuid, p_hoje timestamptz, p_agora timestamptz default now())
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with veio as (
    -- atendimento concluído: vale o início, com o nome do serviço
    select a.pet_id, a.inicio as quando, s.nome as servico, 1 as fonte, a.inicio as ordem, a.id
      from agendamentos a left join servicos s on s.id = a.servico_id
     where a.petshop_id = p and a.status = 'concluido' and a.pet_id is not null
    union all
    -- creche e hotel: a estadia encerrada vale pela saída; quem está na casa veio agora
    select e.pet_id, case when e.status = 'encerrada' then coalesce(e.saida, e.entrada) else p_agora end,
           case when e.tipo = 'hotel' then 'Hotel' else 'Creche' end, 2, e.entrada, e.id
      from estadias e
     where e.petshop_id = p and e.status in ('encerrada', 'em_casa') and e.pet_id is not null
  ),
  ultima as (
    -- a mais recente; no empate, a mesma que a conta da tela escolhia (atendimento antes de estadia, depois pela ordem da lista)
    select distinct on (pet_id) pet_id, quando, servico
      from veio
     order by pet_id, quando desc, fonte, ordem desc, id
  ),
  marcado as (
    select e.pet_id from estadias e where e.petshop_id = p and e.status in ('em_casa', 'reservada') and e.pet_id is not null
    union
    select a.pet_id from agendamentos a
     where a.petshop_id = p and a.inicio >= p_hoje and a.status in ('marcado', 'confirmado', 'em_atendimento') and a.pet_id is not null
  )
  select coalesce(jsonb_agg(jsonb_build_array(coalesce(u.pet_id, m.pet_id), u.quando, u.servico, m.pet_id is not null)), '[]'::jsonb)
    from ultima u full join marcado m on m.pet_id = u.pet_id
$$;

revoke all on function public.visitas_dos_pets(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.visitas_dos_pets(uuid, timestamptz, timestamptz) to authenticated, service_role;

