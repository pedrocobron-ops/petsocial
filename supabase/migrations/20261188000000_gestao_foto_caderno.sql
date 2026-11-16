-- ============================================================
-- Trazer do caderno ou do outro sistema (foto, print ou PDF lidos pela IA).
-- A rota /api/gestao/caderno lê as páginas e devolve o que achou; a pessoa confere tudo antes de salvar, e o que é salvo
-- vai pelos caminhos de sempre (clientes, pets, "Anotar o que X deve", agenda), com as regras de sempre.
-- As fotos e os arquivos NÃO são guardados: nem aqui nem no armazenamento. Esta migração guarda só a contagem do dia.
--
-- Freio de gasto: cada página lida (uma foto, um print ou uma página de PDF) conta uma.
--   config_interna 'caderno_dia'        páginas por pet shop por dia (do fuso dele), padrão 30
--   config_interna 'caderno_dia_geral'  páginas de todos os pet shops juntos por dia (horário de Brasília), padrão 3000
-- caderno_contar(p_petshop, p_paginas): soma as páginas se couberem nos dois limites; com p_paginas = 0, só diz quanto resta.
-- Só para quem é da equipe com a área Clientes, com a conta liberada (a conta só para consulta não lê: não teria como salvar).
--
-- Aditiva: tabela e função novas. O código de hoje não chama nada daqui. Pode rodar de novo.
-- ============================================================

create table if not exists public.caderno_uso (
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  dia date not null,
  paginas int not null default 0 check (paginas >= 0),
  leituras int not null default 0 check (leituras >= 0),
  primary key (petshop_id, dia)
);
create index if not exists caderno_uso_dia on public.caderno_uso (dia);
alter table public.caderno_uso enable row level security;
-- sem regra: ninguém lê nem grava direto; só a função abaixo
revoke all on public.caderno_uso from public, anon, authenticated;

create or replace function public.caderno_contar(p_petshop uuid, p_paginas int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_dia date;
  v_lim int := public.link_limite('caderno_dia', 30);
  v_geral int := public.link_limite('caderno_dia_geral', 3000);
  v_hoje_br date := (now() at time zone 'America/Sao_Paulo')::date;
  v_usadas int;
  v_todas int;
begin
  if p_petshop is null or p_paginas is null or p_paginas < 0 or p_paginas > 100 then
    return jsonb_build_object('ok', false, 'motivo', 'pedido');
  end if;
  if not public.tenho_area(p_petshop, array['clientes']) then return jsonb_build_object('ok', false, 'motivo', 'sem_acesso'); end if;
  if not public.acesso_liberado(p_petshop) then return jsonb_build_object('ok', false, 'motivo', 'fechado'); end if;
  select (now() at time zone coalesce(p.fuso, 'America/Sao_Paulo'))::date into v_dia from public.petshops p where p.id = p_petshop;

  -- um pedido de cada vez: duas leituras ao mesmo tempo não passam do limite juntas
  perform pg_advisory_xact_lock(hashtextextended('caderno_uso', 0));
  select coalesce(sum(u.paginas), 0) into v_usadas from public.caderno_uso u where u.petshop_id = p_petshop and u.dia = v_dia;
  if p_paginas = 0 then
    return jsonb_build_object('ok', true, 'restam', greatest(v_lim - v_usadas, 0), 'limite', v_lim);
  end if;
  if v_usadas + p_paginas > v_lim then
    return jsonb_build_object('ok', false, 'motivo', 'limite', 'restam', greatest(v_lim - v_usadas, 0), 'limite', v_lim);
  end if;
  select coalesce(sum(u.paginas), 0) into v_todas from public.caderno_uso u where u.dia between v_hoje_br - 1 and v_hoje_br + 1
    and u.dia = (now() at time zone coalesce((select p.fuso from public.petshops p where p.id = u.petshop_id), 'America/Sao_Paulo'))::date;
  if v_todas + p_paginas > v_geral then
    return jsonb_build_object('ok', false, 'motivo', 'geral', 'restam', greatest(v_lim - v_usadas, 0), 'limite', v_lim);
  end if;
  insert into public.caderno_uso as u (petshop_id, dia, paginas, leituras) values (p_petshop, v_dia, p_paginas, 1)
  on conflict (petshop_id, dia) do update set paginas = u.paginas + excluded.paginas, leituras = u.leituras + 1;
  return jsonb_build_object('ok', true, 'restam', v_lim - v_usadas - p_paginas, 'limite', v_lim);
end $$;
revoke execute on function public.caderno_contar(uuid, int) from public, anon;
grant execute on function public.caderno_contar(uuid, int) to authenticated;
