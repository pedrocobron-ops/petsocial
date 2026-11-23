-- Mozart com anexos (fotos, prints e PDF na conversa) e os limites de uso da IA decididos pelo dono.
--
-- 1. Saldo único de páginas: cada foto, print ou página de PDF mandada no Mozart gasta do mesmo contador da Foto do caderno
--    (caderno_uso), e o contrário também. Limite por pet shop por dia (do fuso dele):
--      config_interna 'caderno_dia'        quem paga, padrão 20 (era 30)
--      config_interna 'caderno_teste_dia'  teste grátis, padrão 10 (nunca acima do de quem paga)
--    O teto de todos juntos (caderno_dia_geral 3000; caderno_dia_geral_teste, um quarto) e o e-mail do dono no teste
--    continuam como na 20261245.
--    paginas_ia_limites(petshop): { limite, pago, teste } (o limite em vigor, o de quem paga e se a conta está em teste).
--    paginas_ia_contar(petshop, páginas, exige a área Clientes): o corpo de caderno_contar (20261245), com o limite novo; a
--      resposta leva também 'pago' e 'teste', para a tela e as rotas montarem o aviso com os números em vigor.
--    caderno_contar(petshop, páginas): como antes (área Clientes), agora por paginas_ia_contar.
--    mozart_anexo_reservar(petshop, páginas): para qualquer pessoa ativa da equipe (o Mozart é de todos); reserva as páginas
--      antes de chamar o modelo e devolve {reserva}. Com 0 páginas, só diz quanto resta (o saldo perto do botão de anexo).
--    caderno_devolver(reserva): devolve a reserva de quem é da equipe (antes: só a área Clientes), com o limite novo.
-- 2. Pedidos ao Mozart por dia: quem paga 150 (igual; mozart_loja_dia), teste grátis 50 (era 60; mozart_teste_dia).
--    assistente_contar_v2 (copiada da 20261245) passa a devolver, em toda resposta que passou das conferências de acesso,
--    'limite' (pedidos por dia em vigor), 'pago' (o de quem paga) e 'teste': o aviso do limite sai com os números do banco.
--
-- Re-executável. Nenhum dado é apagado. Tudo ajustável em config_interna.

-- ============================================================
-- 1. Páginas e imagens: saldo único do caderno e do Mozart
-- ============================================================
create or replace function public.paginas_ia_limites(p_petshop uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'pago', x.pago,
    'teste', x.teste,
    'limite', case when x.teste then least(x.pago, public.link_limite('caderno_teste_dia', 10)) else x.pago end)
  from (select public.link_limite('caderno_dia', 20) as pago,
               coalesce((select p.status = 'teste' from public.petshops p where p.id = p_petshop), false) as teste) x
$$;
revoke execute on function public.paginas_ia_limites(uuid) from public, anon, authenticated;

create or replace function public.paginas_ia_contar(p_petshop uuid, p_paginas int, p_area_clientes boolean) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_dia date;
  v_l jsonb;
  v_lim int;
  v_extra jsonb;
  v_geral int := public.link_limite('caderno_dia_geral', 3000);
  v_hoje_br date := (now() at time zone 'America/Sao_Paulo')::date;
  v_usadas int;
  v_todas int;
  v_recusa text;
begin
  if p_petshop is null or p_paginas is null or p_paginas < 0 or p_paginas > 100 then
    return jsonb_build_object('ok', false, 'motivo', 'pedido');
  end if;
  if p_area_clientes then
    if not public.tenho_area(p_petshop, array['clientes']) then return jsonb_build_object('ok', false, 'motivo', 'sem_acesso'); end if;
  elsif not exists (select 1 from public.meus_petshops() m where m = p_petshop) then
    return jsonb_build_object('ok', false, 'motivo', 'sem_acesso');
  end if;
  if not public.acesso_liberado(p_petshop) then return jsonb_build_object('ok', false, 'motivo', 'fechado'); end if;
  select (now() at time zone coalesce(p.fuso, 'America/Sao_Paulo'))::date into v_dia from public.petshops p where p.id = p_petshop;
  v_l := public.paginas_ia_limites(p_petshop);
  v_lim := (v_l->>'limite')::int;
  v_extra := jsonb_build_object('limite', v_lim, 'pago', (v_l->>'pago')::int, 'teste', (v_l->>'teste')::boolean);

  -- um pedido de cada vez: duas leituras ao mesmo tempo não passam do limite juntas
  perform pg_advisory_xact_lock(hashtextextended('caderno_uso', 0));
  select coalesce(sum(u.paginas), 0) into v_usadas from public.caderno_uso u where u.petshop_id = p_petshop and u.dia = v_dia;
  -- (20261245) teste grátis: e-mail do dono provado (também na consulta de quanto resta, para a tela avisar antes)
  v_recusa := public.ia_teste_recusa(p_petshop, 'caderno', p_paginas);
  if v_recusa = 'email' or (v_recusa is not null and p_paginas > 0) then
    return jsonb_build_object('ok', false, 'motivo', v_recusa, 'restam', greatest(v_lim - v_usadas, 0)) || v_extra;
  end if;
  if p_paginas = 0 then
    return jsonb_build_object('ok', true, 'restam', greatest(v_lim - v_usadas, 0)) || v_extra;
  end if;
  if v_usadas + p_paginas > v_lim then
    return jsonb_build_object('ok', false, 'motivo', 'limite', 'restam', greatest(v_lim - v_usadas, 0)) || v_extra;
  end if;
  select coalesce(sum(u.paginas), 0) into v_todas from public.caderno_uso u where u.dia between v_hoje_br - 1 and v_hoje_br + 1
    and u.dia = (now() at time zone coalesce((select p.fuso from public.petshops p where p.id = u.petshop_id), 'America/Sao_Paulo'))::date;
  if v_todas + p_paginas > v_geral then
    return jsonb_build_object('ok', false, 'motivo', 'geral', 'restam', greatest(v_lim - v_usadas, 0)) || v_extra;
  end if;
  insert into public.caderno_uso as u (petshop_id, dia, paginas, leituras) values (p_petshop, v_dia, p_paginas, 1)
  on conflict (petshop_id, dia) do update set paginas = u.paginas + excluded.paginas, leituras = u.leituras + 1;
  return jsonb_build_object('ok', true, 'restam', v_lim - v_usadas - p_paginas) || v_extra;
end $$;
revoke execute on function public.paginas_ia_contar(uuid, int, boolean) from public, anon, authenticated;

create or replace function public.caderno_contar(p_petshop uuid, p_paginas int) returns jsonb
language sql volatile security definer set search_path = '' as $$
  select public.paginas_ia_contar(p_petshop, p_paginas, true)
$$;
revoke execute on function public.caderno_contar(uuid, int) from public, anon;
grant execute on function public.caderno_contar(uuid, int) to authenticated;

-- Anexo do Mozart: as mesmas páginas, o mesmo contador e a mesma trava; vale para qualquer pessoa ativa da equipe.
create or replace function public.mozart_anexo_reservar(p_petshop uuid, p_paginas int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v jsonb; v_dia date; v_id uuid;
begin
  v := public.paginas_ia_contar(p_petshop, p_paginas, false);
  if coalesce((v->>'ok')::boolean, false) and p_paginas > 0 then
    select (now() at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date into v_dia from public.petshops s where s.id = p_petshop;
    insert into public.caderno_reservas (petshop_id, dia, paginas) values (p_petshop, v_dia, p_paginas) returning id into v_id;
    v := v || jsonb_build_object('reserva', v_id);
  end if;
  return v;
end $$;
revoke execute on function public.mozart_anexo_reservar(uuid, int) from public, anon;
grant execute on function public.mozart_anexo_reservar(uuid, int) to authenticated;

-- A leitura falhou: as páginas da reserva voltam (uma vez só, até uma hora depois, por quem é da equipe do pet shop).
create or replace function public.caderno_devolver(p_reserva uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.caderno_reservas; v_l jsonb; v_lim int; v_usadas int;
begin
  perform pg_advisory_xact_lock(hashtextextended('caderno_uso', 0));
  select * into r from public.caderno_reservas x where x.id = p_reserva;
  if r.id is null or r.criado_em < now() - interval '1 hour' or not exists (select 1 from public.meus_petshops() m where m = r.petshop_id) then
    return jsonb_build_object('ok', false);
  end if;
  delete from public.caderno_reservas x where x.id = r.id;
  update public.caderno_uso u set paginas = greatest(u.paginas - r.paginas, 0), leituras = greatest(u.leituras - 1, 0)
   where u.petshop_id = r.petshop_id and u.dia = r.dia;
  select coalesce(sum(u.paginas), 0) into v_usadas from public.caderno_uso u where u.petshop_id = r.petshop_id and u.dia = r.dia;
  v_l := public.paginas_ia_limites(r.petshop_id);
  v_lim := (v_l->>'limite')::int;
  return jsonb_build_object('ok', true, 'restam', greatest(v_lim - v_usadas, 0), 'limite', v_lim, 'pago', (v_l->>'pago')::int, 'teste', (v_l->>'teste')::boolean);
end $$;
revoke execute on function public.caderno_devolver(uuid) from public, anon;
grant execute on function public.caderno_devolver(uuid) to authenticated;

-- ============================================================
-- 2. Pedidos ao Mozart: teste grátis 50 por dia; a resposta leva os limites em vigor
-- ============================================================
create or replace function public.assistente_contar_v2(p_petshop uuid, p_canal text, p_tipo text, p_limite integer, p_segredo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_dia date; v_ok boolean; v_lim integer; v_status public.status_assinatura; v_loja integer; v_teste integer; v_recusa text;
  v_vezes integer; v_extra jsonb;
begin
  if p_petshop is null or p_canal not in ('mozart', 'ajuda') or p_tipo not in ('pedido', 'chamada') or coalesce(p_limite, 0) <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'pedido');
  end if;
  if not public.servidor_chamada_ok(p_segredo) then return jsonb_build_object('ok', false, 'motivo', 'recusado'); end if;
  if not exists (select 1 from public.meus_petshops() m where m = p_petshop) then return jsonb_build_object('ok', false, 'motivo', 'sem_acesso'); end if;
  -- conta só para consulta: a IA custa a cada pergunta, então fica para quem está em teste ou com a assinatura em dia
  if not public.acesso_liberado(p_petshop) then return jsonb_build_object('ok', false, 'motivo', 'fechado'); end if;
  select (now() at time zone coalesce(p.fuso, 'America/Sao_Paulo'))::date, p.status into v_dia, v_status from public.petshops p where p.id = p_petshop;
  -- cada pedido do Mozart usa até 4 chamadas ao modelo
  v_vezes := case when p_canal = 'mozart' and p_tipo = 'chamada' then 4 else 1 end;
  v_loja := public.link_limite(p_canal || '_loja_dia', case p_canal when 'mozart' then 150 else 80 end);
  v_lim := least(p_limite, v_loja * v_vezes);
  -- teste grátis: um teto menor por dia
  if v_status = 'teste' then
    v_teste := public.link_limite(p_canal || '_teste_dia', case p_canal when 'mozart' then 50 else 40 end);
    v_lim := least(v_lim, v_teste * v_vezes);
  end if;
  -- (20261248) os números do aviso: pedidos por dia em vigor, o de quem paga e se a conta está em teste
  v_extra := jsonb_build_object('limite', greatest(v_lim, 0) / v_vezes, 'pago', v_loja, 'teste', v_status = 'teste');
  if v_lim <= 0 then return jsonb_build_object('ok', false, 'motivo', 'limite') || v_extra; end if;
  -- (20261245) teste grátis: e-mail do dono provado e o teto de todos os pet shops em teste juntos
  if v_status = 'teste' then
    v_recusa := public.ia_teste_recusa(p_petshop, p_canal);
    if v_recusa is not null then return jsonb_build_object('ok', false, 'motivo', v_recusa) || v_extra; end if;
  end if;
  -- teto de todos os pet shops juntos
  if public.ia_uso_geral(p_canal) >= public.ia_teto_geral(p_canal) then return jsonb_build_object('ok', false, 'motivo', 'geral') || v_extra; end if;
  insert into public.assistente_uso as u (petshop_id, canal, dia, pedidos, chamadas)
    values (p_petshop, p_canal, v_dia, case when p_tipo = 'pedido' then 1 else 0 end, case when p_tipo = 'chamada' then 1 else 0 end)
  on conflict (petshop_id, canal, dia) do update
    set pedidos = u.pedidos + case when p_tipo = 'pedido' then 1 else 0 end,
        chamadas = u.chamadas + case when p_tipo = 'chamada' then 1 else 0 end
    where (case when p_tipo = 'pedido' then u.pedidos else u.chamadas end) < v_lim
  returning true into v_ok;
  if not coalesce(v_ok, false) then return jsonb_build_object('ok', false, 'motivo', 'limite') || v_extra; end if;
  return jsonb_build_object('ok', true) || v_extra;
end $$;
revoke execute on function public.assistente_contar_v2(uuid, text, text, integer, text) from public, anon;
grant execute on function public.assistente_contar_v2(uuid, text, text, integer, text) to authenticated, service_role;
