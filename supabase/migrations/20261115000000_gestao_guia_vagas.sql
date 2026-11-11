-- Guia de configuração inicial e número de atendimentos ao mesmo tempo.
-- `vagas`: quantos pets o pet shop atende ao mesmo tempo. Vazio = uma vaga por pessoa que atende.
alter table public.petshops
  add column vagas int check (vagas between 1 and 20),
  add column guia_feito_em timestamptz;
grant update (vagas, guia_feito_em) on public.petshops to authenticated;

create or replace function public.link_vaga(p_petshop uuid, p_inicio timestamptz, p_fim timestamptz) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_cap int;
  v_ocupados int;
begin
  if exists (select 1 from public.bloqueios where petshop_id = p_petshop and profissional_id is null and inicio < p_fim and fim > p_inicio) then
    return false;
  end if;
  select coalesce(
    (select vagas from public.petshops where id = p_petshop),
    (select greatest(1, count(*))::int from public.profissionais where petshop_id = p_petshop and ativo and atende)
  ) into v_cap;
  select
    (select count(*) from public.agendamentos where petshop_id = p_petshop and status not in ('cancelado', 'faltou') and inicio < p_fim and fim > p_inicio)
    + (select count(*) from public.pedidos_agendamento where petshop_id = p_petshop and status = 'pendente' and inicio < p_fim and fim > p_inicio)
    + (select count(distinct profissional_id) from public.bloqueios where petshop_id = p_petshop and profissional_id is not null and inicio < p_fim and fim > p_inicio)
  into v_ocupados;
  return v_ocupados < v_cap;
end $$;
