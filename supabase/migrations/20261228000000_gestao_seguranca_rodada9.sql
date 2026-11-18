-- Segurança, rodada 9 (revisão do especialista em segurança).
--
-- 1. Teto geral do gasto com inteligência artificial por dia (somando todos os pet shops), como o caderno já tinha:
--    Mozart, Ajuda, texto do boletim e Tirar dúvida do link. Limites em config_interna (link_limite), com padrão seguro:
--      mozart_dia_geral 8000 (chamadas ao modelo)   ajuda_dia_geral 3000 (perguntas)
--      boletim_dia_geral 1500 (textos)              link_ia_dia_geral 3000 (perguntas)
--      mozart_teste_dia 60 e ajuda_teste_dia 40 (pedidos por dia de um pet shop em teste grátis)
--      mozart_loja_dia 150 e ajuda_loja_dia 80 (o máximo por pet shop por dia, seja qual for o limite que a rota mande)
--    Com a trava do servidor gravada, essas contagens só valem vindas do servidor (p_segredo): ninguém enche o teto geral
--    chamando a função direto.
--    A conta só para consulta (acesso_liberado = false) não usa mais o Mozart nem a Ajuda com IA.
-- 2. Trava do servidor fecha sozinha: sem a impressão do segredo gravada, o banco só aceita a contagem do Tirar dúvida e
--    do chat de venda até a data de carência (config_interna 'servidor_trava_carencia_ate', 7 dias depois desta migração).
--    O servidor grava a própria impressão sozinho quando tem a chave de serviço (servidor_segredo_registrar, só service_role);
--    o botão do painel continua valendo. Depois de gravada, segredo errado (ou nenhum) é sempre recusado.
-- 3. Cakto: pagamento ligado só pelo e-mail vale apenas quando o dono PROVOU o e-mail da conta (emails_confirmados).
--    Sem a prova, o aviso fica guardado como "sem conta" (com o pet shop provável em payload.sem_prova): liga sozinho
--    quando o dono provar o e-mail, ou pelo administrador no painel.
-- 4. Clientes, pets e saúde: quem não tem nenhuma área que atende o cliente não lê os tutores pela API; editar o tutor é
--    só de quem tem a área Clientes (Financeiro/Caixa só mexem no limite do fiado).
-- 5. Aceites: só versão conhecida (tabela documentos_versoes) ou a seguinte a ela. Entrada: o IP do aceite vem do
--    servidor só quando ele prova quem é; senão vale o endereço que o banco vê. Loja nova: freio por rede e por dia.
--
-- Funções substituídas (cópia da última versão, mudando só o necessário):
--   servidor_segredo_ok(text)          20261177000000_gestao_revisao_consertos.sql   fecha depois da carência
--   assistente_contar(...)             20261177000000_gestao_revisao_consertos.sql   passa a chamar assistente_contar_v2 (sem segredo: vale só sem a trava)
--   link_ia_contar(text, text)         20261177000000_gestao_revisao_consertos.sql   teto geral do dia
--   boletim_ia_contar(uuid)            20261189000000_gestao_boletim.sql             teto geral do dia; novo parâmetro p_segredo (com padrão)
--   admin_servidor_estado()            20261177000000_gestao_revisao_consertos.sql   carência, origem e uso da IA no dia
--   cakto_evento(...)                  20261209000000_gestao_seguranca_email.sql     e-mail só com prova
--   admin_cakto_sem_conta()            (última definição no banco)                   mostra o pet shop provável
--   aceitar_documentos(text, text)     20261197000000_gestao_aceites.sql             versão conhecida
--   entrada_aceitar(...)               20261202000000_gestao_checklist_entrada.sql   novo parâmetro p_segredo (com padrão)
--   criar_petshop(...)                 20261135000000_gestao_area_principal.sql      freio por rede e por dia

-- Pode rodar de novo sem erro (create or replace / if not exists): o banco local é dividido entre várias frentes de trabalho.

-- ============================================================
-- 1. Trava do servidor
-- ============================================================
-- carência só para quem ainda não ligou a trava (produção de hoje): o código no ar continua contando até o servidor
-- novo gravar a impressão sozinho ou o administrador tocar em "Ligar a trava"
insert into public.config_interna (chave, valor)
  select 'servidor_trava_carencia_ate', (now() + interval '7 days')::text
  where not exists (select 1 from public.config_interna where chave = 'servidor_segredo_sha256')
  on conflict (chave) do nothing;

create or replace function public.servidor_segredo_ok(p_segredo text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_hash text; v_ate timestamptz;
begin
  select valor into v_hash from public.config_interna where chave = 'servidor_segredo_sha256';
  if v_hash is null then
    -- sem trava gravada: vale só durante a carência; depois, fechado
    begin
      select valor::timestamptz into v_ate from public.config_interna where chave = 'servidor_trava_carencia_ate';
    exception when others then v_ate := null;
    end;
    return v_ate is not null and now() < v_ate;
  end if;
  return p_segredo is not null and encode(extensions.digest(p_segredo, 'sha256'), 'hex') = v_hash;
end $$;
revoke execute on function public.servidor_segredo_ok(text) from public, anon, authenticated;

-- o segredo confere com a impressão gravada (sem carência): para o que só o servidor provado pode dizer
create or replace function public.servidor_segredo_confere(p_segredo text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_segredo is not null and exists (
    select 1 from public.config_interna
    where chave = 'servidor_segredo_sha256' and valor = encode(extensions.digest(p_segredo, 'sha256'), 'hex'))
$$;
revoke execute on function public.servidor_segredo_confere(text) from public, anon, authenticated;

-- Contagem de IA chamada por quem tem login (Mozart, Ajuda, boletim): sem trava gravada, passa (com o teto por pet shop);
-- com a trava gravada, só o servidor conta. Assim ninguém enche o teto geral do dia chamando a função direto, sem gastar nada.
create or replace function public.servidor_chamada_ok(p_segredo text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.config_interna where chave = 'servidor_segredo_sha256')
      or public.servidor_segredo_confere(p_segredo)
$$;
revoke execute on function public.servidor_chamada_ok(text) from public, anon, authenticated;

-- o servidor pergunta se o segredo dele é o gravado: 'ok', 'errado' ou 'sem_trava' (não diz mais nada a ninguém)
create or replace function public.servidor_segredo_estado(p_segredo text) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when not exists (select 1 from public.config_interna where chave = 'servidor_segredo_sha256') then 'sem_trava'
    when public.servidor_segredo_confere(p_segredo) then 'ok'
    else 'errado' end
$$;
revoke execute on function public.servidor_segredo_estado(text) from public;
grant execute on function public.servidor_segredo_estado(text) to anon, authenticated, service_role;

-- o servidor grava a própria impressão (só com a chave de serviço, que só ele tem)
create or replace function public.servidor_segredo_registrar(p_segredo text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_s text := coalesce(p_segredo, '');
begin
  if length(v_s) < 32 or length(v_s) > 200 or v_s ~ '\s' then raise exception 'Segredo inválido.'; end if;
  insert into public.config_interna (chave, valor) values ('servidor_segredo_sha256', encode(extensions.digest(v_s, 'sha256'), 'hex'))
    on conflict (chave) do update set valor = excluded.valor;
  insert into public.config_interna (chave, valor) values ('servidor_segredo_sha256_em', now()::text)
    on conflict (chave) do update set valor = excluded.valor;
  insert into public.config_interna (chave, valor) values ('servidor_segredo_origem', 'servidor')
    on conflict (chave) do update set valor = excluded.valor;
end $$;
revoke execute on function public.servidor_segredo_registrar(text) from public, anon, authenticated;
grant execute on function public.servidor_segredo_registrar(text) to service_role;

-- ============================================================
-- 2. Teto geral do gasto com IA
-- ============================================================
create index if not exists assistente_uso_dia_idx on public.assistente_uso (dia, canal);
create index if not exists link_ia_uso_dia_idx on public.link_ia_uso (dia);
create index if not exists boletim_ia_uso_dia_idx on public.boletim_ia_uso (dia);

-- quanto já foi usado hoje somando todos os pet shops (o dia de Brasília; quem está em outro fuso entra pelo dia dele)
create or replace function public.ia_uso_geral(p_canal text) returns integer
language sql stable security definer set search_path = '' as $$
  select case p_canal
    when 'mozart' then (select coalesce(sum(u.chamadas), 0) from public.assistente_uso u where u.canal = 'mozart' and u.dia >= (now() at time zone 'America/Sao_Paulo')::date)
    when 'ajuda' then (select coalesce(sum(u.pedidos), 0) from public.assistente_uso u where u.canal = 'ajuda' and u.dia >= (now() at time zone 'America/Sao_Paulo')::date)
    when 'boletim' then (select coalesce(sum(u.textos), 0) from public.boletim_ia_uso u where u.dia >= (now() at time zone 'America/Sao_Paulo')::date)
    when 'link_ia' then (select coalesce(sum(u.perguntas), 0) from public.link_ia_uso u where u.dia >= (now() at time zone 'America/Sao_Paulo')::date)
    else 0 end::integer
$$;
revoke execute on function public.ia_uso_geral(text) from public, anon, authenticated;

create or replace function public.ia_teto_geral(p_canal text) returns integer
language sql stable security definer set search_path = '' as $$
  select case p_canal
    when 'mozart' then public.link_limite('mozart_dia_geral', 8000)
    when 'ajuda' then public.link_limite('ajuda_dia_geral', 3000)
    when 'boletim' then public.link_limite('boletim_dia_geral', 1500)
    when 'link_ia' then public.link_limite('link_ia_dia_geral', 3000)
    else 0 end
$$;
revoke execute on function public.ia_teto_geral(text) from public, anon, authenticated;

-- Mozart e Ajuda: conta e diz por que recusou ('pedido', 'recusado' = não veio do servidor, 'sem_acesso', 'fechado',
-- 'limite' do pet shop, 'geral' de todos). O limite que quem chama manda nunca passa do teto por pet shop do banco
-- (mozart_loja_dia 150 pedidos e 4 chamadas por pedido; ajuda_loja_dia 80): um pet shop só pesa no teto geral o que
-- ele poderia gastar de verdade.
create or replace function public.assistente_contar_v2(p_petshop uuid, p_canal text, p_tipo text, p_limite integer, p_segredo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_dia date; v_ok boolean; v_lim integer; v_status public.status_assinatura; v_loja integer; v_teste integer;
begin
  if p_petshop is null or p_canal not in ('mozart', 'ajuda') or p_tipo not in ('pedido', 'chamada') or coalesce(p_limite, 0) <= 0 then
    return jsonb_build_object('ok', false, 'motivo', 'pedido');
  end if;
  if not public.servidor_chamada_ok(p_segredo) then return jsonb_build_object('ok', false, 'motivo', 'recusado'); end if;
  if not exists (select 1 from public.meus_petshops() m where m = p_petshop) then return jsonb_build_object('ok', false, 'motivo', 'sem_acesso'); end if;
  -- conta só para consulta: a IA custa a cada pergunta, então fica para quem está em teste ou com a assinatura em dia
  if not public.acesso_liberado(p_petshop) then return jsonb_build_object('ok', false, 'motivo', 'fechado'); end if;
  select (now() at time zone coalesce(p.fuso, 'America/Sao_Paulo'))::date, p.status into v_dia, v_status from public.petshops p where p.id = p_petshop;
  v_loja := public.link_limite(p_canal || '_loja_dia', case p_canal when 'mozart' then 150 else 80 end);
  v_lim := least(p_limite, v_loja * case when p_canal = 'mozart' and p_tipo = 'chamada' then 4 else 1 end);
  -- teste grátis: um teto menor por dia (cada pedido do Mozart usa até 4 chamadas ao modelo)
  if v_status = 'teste' then
    v_teste := public.link_limite(p_canal || '_teste_dia', case p_canal when 'mozart' then 60 else 40 end);
    v_lim := least(v_lim, v_teste * case when p_canal = 'mozart' and p_tipo = 'chamada' then 4 else 1 end);
  end if;
  if v_lim <= 0 then return jsonb_build_object('ok', false, 'motivo', 'limite'); end if;
  -- teto de todos os pet shops juntos
  if public.ia_uso_geral(p_canal) >= public.ia_teto_geral(p_canal) then return jsonb_build_object('ok', false, 'motivo', 'geral'); end if;
  insert into public.assistente_uso as u (petshop_id, canal, dia, pedidos, chamadas)
    values (p_petshop, p_canal, v_dia, case when p_tipo = 'pedido' then 1 else 0 end, case when p_tipo = 'chamada' then 1 else 0 end)
  on conflict (petshop_id, canal, dia) do update
    set pedidos = u.pedidos + case when p_tipo = 'pedido' then 1 else 0 end,
        chamadas = u.chamadas + case when p_tipo = 'chamada' then 1 else 0 end
    where (case when p_tipo = 'pedido' then u.pedidos else u.chamadas end) < v_lim
  returning true into v_ok;
  if not coalesce(v_ok, false) then return jsonb_build_object('ok', false, 'motivo', 'limite'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.assistente_contar_v2(uuid, text, text, integer, text) from public, anon;
grant execute on function public.assistente_contar_v2(uuid, text, text, integer, text) to authenticated, service_role;

-- a função de antes (o código no ar chama sem segredo): continua valendo enquanto a trava do servidor não foi gravada;
-- com a trava, só a nova (com o segredo) conta
create or replace function public.assistente_contar(p_petshop uuid, p_canal text, p_tipo text, p_limite integer) returns boolean
language sql security definer set search_path = '' as $$
  select coalesce((public.assistente_contar_v2(p_petshop, p_canal, p_tipo, p_limite, null) ->> 'ok')::boolean, false)
$$;
revoke execute on function public.assistente_contar(uuid, text, text, integer) from public, anon;
grant execute on function public.assistente_contar(uuid, text, text, integer) to authenticated, service_role;

-- novo parâmetro com padrão (o código no ar chama só com o pet shop)
drop function if exists public.boletim_ia_contar(uuid);
create or replace function public.boletim_ia_contar(p_petshop uuid, p_segredo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_dia date; v_lim int; v_n int;
begin
  if not public.servidor_chamada_ok(p_segredo) then return jsonb_build_object('ok', false, 'motivo', 'recusado'); end if;
  if not public.tenho_area(p_petshop, array['agenda', 'creche_hotel']) or not public.acesso_liberado(p_petshop) then
    return jsonb_build_object('ok', false, 'motivo', 'sem_acesso');
  end if;
  select (now() at time zone coalesce(p.fuso, 'America/Sao_Paulo'))::date into v_dia from public.petshops p where p.id = p_petshop;
  v_lim := public.link_limite('boletim_ia_dia', 100);
  if v_lim <= 0 then return jsonb_build_object('ok', false, 'motivo', 'limite'); end if;
  -- teto de todos os pet shops juntos
  if public.ia_uso_geral('boletim') >= public.ia_teto_geral('boletim') then return jsonb_build_object('ok', false, 'motivo', 'geral'); end if;
  insert into public.boletim_ia_uso as u (petshop_id, dia, textos) values (p_petshop, v_dia, 1)
  on conflict (petshop_id, dia) do update set textos = u.textos + 1 where u.textos < v_lim
  returning u.textos into v_n;
  if v_n is null then return jsonb_build_object('ok', false, 'motivo', 'limite'); end if;
  return jsonb_build_object('ok', true, 'restam', v_lim - v_n);
end $$;
revoke execute on function public.boletim_ia_contar(uuid, text) from public, anon;
grant execute on function public.boletim_ia_contar(uuid, text) to authenticated, service_role;

create or replace function public.link_ia_contar(p_codigo text, p_segredo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_dia date; v_lim int; v_n int;
begin
  if not public.servidor_segredo_ok(p_segredo) then return jsonb_build_object('ok', false, 'motivo', 'recusado'); end if;
  select p.id, (now() at time zone p.fuso)::date into v_id, v_dia
  from public.petshops p
  where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id) and p.opcoes -> 'link.ia' = 'true'::jsonb;
  if v_id is null then return jsonb_build_object('ok', false, 'motivo', 'desligado'); end if;
  v_lim := public.link_limite('link_ia_dia', 100);
  if v_lim <= 0 then return jsonb_build_object('ok', false, 'motivo', 'limite'); end if;
  -- teto de todos os pet shops juntos
  if public.ia_uso_geral('link_ia') >= public.ia_teto_geral('link_ia') then return jsonb_build_object('ok', false, 'motivo', 'geral'); end if;
  insert into public.link_ia_uso as u (petshop_id, dia, perguntas) values (v_id, v_dia, 1)
  on conflict (petshop_id, dia) do update set perguntas = u.perguntas + 1 where u.perguntas < v_lim
  returning u.perguntas into v_n;
  if v_n is null then return jsonb_build_object('ok', false, 'motivo', 'limite'); end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.admin_servidor_estado() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return jsonb_build_object(
    'ligada', exists (select 1 from public.config_interna where chave = 'servidor_segredo_sha256'),
    'em', (select valor from public.config_interna where chave = 'servidor_segredo_sha256_em'),
    'origem', (select valor from public.config_interna where chave = 'servidor_segredo_origem'),
    'carencia_ate', (select valor from public.config_interna where chave = 'servidor_trava_carencia_ate'),
    -- gasto com IA de hoje, somando todos os pet shops, e o teto de cada canal
    'ia', (select jsonb_agg(jsonb_build_object('canal', c, 'usado', public.ia_uso_geral(c), 'teto', public.ia_teto_geral(c)) order by o)
           from unnest(array['mozart', 'ajuda', 'boletim', 'link_ia']) with ordinality as x(c, o))
      || jsonb_build_array(jsonb_build_object('canal', 'vendas',
           'usado', (select coalesce(sum(u.mensagens), 0) from public.vendas_uso u where u.visitante = '*' and u.hora > now() - interval '1 day'),
           'teto', public.link_limite('vendas_limite_dia', 2000)))
      || jsonb_build_array(jsonb_build_object('canal', 'caderno',
           'usado', (select coalesce(sum(u.paginas), 0) from public.caderno_uso u where u.dia >= (now() at time zone 'America/Sao_Paulo')::date),
           'teto', public.link_limite('caderno_dia_geral', 3000))));
end $$;

-- o administrador grava pelo painel: anota a origem (a função continua a mesma; só um gatilho de anotação seria demais)
create or replace function public.admin_servidor_segredo(p_segredo text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_s text := coalesce(p_segredo, '');
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  if length(v_s) < 32 or length(v_s) > 200 or v_s ~ '\s' then raise exception 'Segredo inválido.'; end if;
  insert into public.config_interna (chave, valor) values ('servidor_segredo_sha256', encode(extensions.digest(v_s, 'sha256'), 'hex'))
    on conflict (chave) do update set valor = excluded.valor;
  insert into public.config_interna (chave, valor) values ('servidor_segredo_sha256_em', now()::text)
    on conflict (chave) do update set valor = excluded.valor;
  insert into public.config_interna (chave, valor) values ('servidor_segredo_origem', 'painel')
    on conflict (chave) do update set valor = excluded.valor;
end $$;

-- ============================================================
-- 3. Cakto: e-mail só com prova
-- ============================================================
create or replace function public.cakto_evento(p_segredo text, p_evento text, p_email text, p_assinatura text, p_payload jsonb,
  p_oferta text default null, p_callback text default null, p_produto text default null, p_produto_curto text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_petshop uuid;
  v_produto text;
  v_pedido text := nullif(btrim(coalesce(p_payload ->> 'pedido', '')), '');
  v_por_assinatura boolean := false;
  v_conflito uuid;
  v_negativo boolean := p_evento in ('subscription_late', 'subscription_renewal_refused', 'subscription_canceled', 'subscription_paused', 'refund', 'chargeback');
  v_compra timestamptz := now();
  v_provado boolean;
  v_sem_prova uuid;
begin
  if not public.cakto_segredo_ok(p_segredo) then return 'recusado'; end if;

  -- outro produto da mesma conta Cakto (ex.: um guia vendido pelo webhook da Escola): não mexe em assinatura nenhuma
  select valor into v_produto from public.config_interna where chave = 'cakto_produto_gestao';
  if v_produto is not null and (p_produto is not null or p_produto_curto is not null)
     and v_produto is distinct from p_produto and v_produto is distinct from p_produto_curto then
    return 'outro_produto';
  end if;

  -- o mesmo aviso de novo (reenvio da Cakto ou alguém repetindo): não estende o pago_ate outra vez
  if v_pedido is not null and not public.webhook_primeira_vez('cakto:'
       || case when p_evento in ('purchase_approved', 'subscription_renewed', 'subscription_late_recovered') then 'pago' else coalesce(p_evento, '') end
       || ':' || v_pedido) then
    return 'repetido';
  end if;

  -- quando a compra foi feita (nunca depois de agora)
  begin
    v_compra := least(now(), coalesce(nullif(btrim(coalesce(p_payload ->> 'pago_em', '')), '')::timestamptz, now()));
  exception when others then
    v_compra := now();
  end;

  select id into v_petshop from public.petshops where p_assinatura is not null and cakto_assinatura = p_assinatura limit 1;
  v_por_assinatura := v_petshop is not null;
  if v_petshop is null and p_callback ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{32}$' then
    select c.petshop_id into v_petshop from public.cakto_callbacks c
      where c.petshop_id = split_part(p_callback, '.', 1)::uuid and c.ficha = lower(split_part(p_callback, '.', 2));
  end if;
  if v_petshop is null and nullif(btrim(coalesce(p_email, '')), '') is not null then
    select p.petshop_id, exists (select 1 from public.emails_confirmados c where c.user_id = u.id and c.email = lower(u.email))
      into v_petshop, v_provado
      from public.profissionais p join auth.users u on u.id = p.user_id
      join public.emails_desde d on d.user_id = u.id and d.email = lower(u.email)
      where p.papel = 'dono' and lower(u.email) = lower(btrim(p_email)) and d.desde <= v_compra
      order by p.criado_em desc limit 1;
    -- o cadastro não confirma o e-mail: sem a prova de que a caixa de entrada é do dono, o e-mail sozinho não libera
    -- pet shop nenhum. Fica como "sem conta" (com o pet shop provável) até o dono provar o e-mail ou o administrador ligar.
    if v_petshop is not null and not coalesce(v_provado, false) then
      v_sem_prova := v_petshop; v_petshop := null;
    end if;
  end if;

  if v_petshop is not null and not v_por_assinatura then
    if v_negativo then
      if v_pedido is null or not exists (
          select 1 from public.cakto_eventos e
          where e.petshop_id = v_petshop and e.payload ->> 'pedido' = v_pedido
            and e.evento in ('purchase_approved', 'subscription_created', 'subscription_renewed', 'subscription_late_recovered', 'subscription_resumed')) then
        v_conflito := v_petshop; v_petshop := null;
      end if;
    elsif exists (select 1 from public.petshops x where x.id = v_petshop and x.status in ('ativa', 'atrasada')
                    and x.cakto_assinatura is not null and x.cakto_assinatura is distinct from p_assinatura) then
      v_conflito := v_petshop; v_petshop := null;
    end if;
  end if;

  insert into public.cakto_eventos (evento, email, petshop_id, payload)
    values (p_evento, p_email, v_petshop,
      coalesce(p_payload, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('oferta', p_oferta, 'assinatura', p_assinatura, 'conflito_com', v_conflito, 'sem_prova', v_sem_prova)));

  if v_conflito is not null then return 'conflito'; end if;
  if v_petshop is null then return 'sem_conta'; end if;
  return public.cakto_aplicar(v_petshop, p_evento, p_email, p_assinatura, p_oferta, now());
end $$;

-- o dono provou o e-mail (entrou por um código ou link mandado para a caixa de entrada): liga os pagamentos que esperavam
create or replace function public.cakto_ligar_ao_provar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare r record; v_loja uuid;
begin
  begin
    for r in
      select e.* from public.cakto_eventos e
      where e.petshop_id is null and e.payload ->> 'sem_prova' is not null and coalesce(e.payload ->> 'descartado', '') = ''
        and lower(e.email) = new.email and e.recebido_em > now() - interval '180 days'
        and e.evento in ('purchase_approved', 'subscription_created', 'subscription_renewed', 'subscription_late_recovered', 'subscription_resumed')
      order by e.id
    loop
      begin v_loja := (r.payload ->> 'sem_prova')::uuid; exception when others then v_loja := null; end;
      continue when v_loja is null;
      -- o pet shop ainda é desta pessoa, e não está pagando por outra assinatura
      continue when not exists (select 1 from public.profissionais p where p.petshop_id = v_loja and p.user_id = new.user_id and p.papel = 'dono');
      continue when exists (select 1 from public.petshops x where x.id = v_loja and x.status in ('ativa', 'atrasada')
                              and x.cakto_assinatura is not null and x.cakto_assinatura is distinct from nullif(r.payload ->> 'assinatura', ''));
      update public.cakto_eventos set petshop_id = v_loja,
          payload = coalesce(payload, '{}'::jsonb) || jsonb_build_object('ligado_em', now(), 'ligado_por_prova', new.user_id)
        where id = r.id;
      perform public.cakto_aplicar(v_loja, r.evento, r.email, nullif(r.payload ->> 'assinatura', ''), nullif(r.payload ->> 'oferta', ''), r.recebido_em);
    end loop;
  exception when others then
    -- a prova do e-mail não pode falhar por causa disto: o administrador ainda liga pelo painel
    raise warning 'cakto_ligar_ao_provar: %', sqlerrm;
  end;
  return new;
end $$;
revoke execute on function public.cakto_ligar_ao_provar() from public, anon, authenticated;

drop trigger if exists gestao_cakto_ligar_ao_provar on public.emails_confirmados;
create trigger gestao_cakto_ligar_ao_provar after insert or update of email on public.emails_confirmados
  for each row execute function public.cakto_ligar_ao_provar();

create or replace function public.admin_cakto_sem_conta() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', e.id, 'evento', e.evento, 'email', e.email, 'recebido_em', e.recebido_em,
      'oferta', e.payload->>'oferta', 'assinatura', e.payload->>'assinatura', 'valor', e.payload->'valor',
      'plano', (select c.valor from public.config_interna c where c.chave = 'cakto_oferta_' || (e.payload->>'oferta')),
      -- o e-mail é o do dono deste pet shop, mas ele ainda não provou que a caixa de entrada é dele
      'sem_prova', e.payload->>'sem_prova',
      'sem_prova_nome', (select s.nome from public.petshops s where s.id::text = e.payload->>'sem_prova')
    ) order by e.id desc)
    from public.cakto_eventos e
    where e.petshop_id is null and coalesce(e.payload->>'descartado', '') = ''
      and e.evento in ('purchase_approved', 'subscription_created', 'subscription_renewed', 'subscription_late_recovered', 'subscription_resumed',
                       'subscription_late', 'subscription_renewal_refused', 'subscription_canceled', 'subscription_paused', 'refund', 'chargeback')
      and e.recebido_em > now() - interval '180 days'
  ), '[]'::jsonb);
end $$;

-- ============================================================
-- 4. Clientes, pets e saúde: a chave "Clientes" e as áreas que atendem o cliente passam a valer no banco
-- ============================================================
-- Ler: quem atende (Agenda, Creche e hotel, Pacotes, Caixa), quem cuida do cadastro (Clientes) e quem cobra (Financeiro,
-- Relatórios). Quem só tem Estoque (ou nenhuma área) não lê tutor, pet nem saúde.
-- Criar: quem atende ou cuida do cadastro (marcar um horário cadastra tutor e pet novos).
-- Editar o tutor: só a área Clientes; Caixa, Financeiro e Relatórios mexem apenas no limite do fiado (gatilho abaixo).
alter policy clientes_ler on public.clientes
  using (petshop_id in (select public.meus_petshops())
    and (select public.tenho_area(clientes.petshop_id, array['clientes', 'agenda', 'creche_hotel', 'pacotes', 'caixa', 'financeiro', 'relatorios'])));
alter policy clientes_criar on public.clientes
  with check (petshop_id in (select public.meus_petshops()) and (select public.acesso_liberado(clientes.petshop_id))
    and (select public.tenho_area(clientes.petshop_id, array['clientes', 'agenda', 'creche_hotel', 'pacotes', 'caixa'])));
alter policy clientes_editar on public.clientes
  using (petshop_id in (select public.meus_petshops()) and (select public.acesso_liberado(clientes.petshop_id))
    and (select public.tenho_area(clientes.petshop_id, array['clientes', 'agenda', 'creche_hotel', 'pacotes', 'caixa', 'financeiro', 'relatorios'])))
  with check (petshop_id in (select public.meus_petshops()));
-- (quem lê chega até o gatilho abaixo, que explica em português por que não pode mudar; quem não lê nem chega)

-- sem "security definer" de propósito: current_user diz quem está gravando. Pela API com login é 'authenticated';
-- dentro de uma função do sistema (juntar tutores, aceitar pedido do link, importar, apagar dados) é o dono da função, e passa.
create or replace function public.clientes_so_da_area() returns trigger
language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if public.tenho_area(new.petshop_id, array['clientes']) then return new; end if;
  -- sem a área Clientes: só o limite do fiado pode mudar (tela Financeiro; quem pode mexer nele é outra regra, que continua valendo)
  if (to_jsonb(new) - 'limite_fiado') is distinct from (to_jsonb(old) - 'limite_fiado') then
    raise exception 'Para mudar o cadastro do tutor é preciso ter a área Clientes liberada. Peça ao dono do pet shop.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.clientes_so_da_area() from public, anon, authenticated;
drop trigger if exists clientes_so_da_area on public.clientes;
create trigger clientes_so_da_area before update on public.clientes
  for each row execute function public.clientes_so_da_area();

alter policy pets_ler on public.pets
  using (petshop_id in (select public.meus_petshops())
    and (select public.tenho_area(pets.petshop_id, array['clientes', 'agenda', 'creche_hotel', 'pacotes', 'caixa', 'financeiro', 'relatorios'])));
alter policy pets_criar on public.pets
  with check (petshop_id in (select public.meus_petshops()) and (select public.acesso_liberado(pets.petshop_id))
    and (select public.tenho_area(pets.petshop_id, array['clientes', 'agenda', 'creche_hotel', 'pacotes', 'caixa'])));
alter policy pets_editar on public.pets
  using (petshop_id in (select public.meus_petshops()) and (select public.acesso_liberado(pets.petshop_id))
    and (select public.tenho_area(pets.petshop_id, array['clientes', 'agenda', 'creche_hotel', 'pacotes', 'caixa'])))
  with check (petshop_id in (select public.meus_petshops()));

-- saúde do pet: só quem cuida do pet ou do cadastro (quem só vende ou cobra não precisa)
alter policy pets_saude_ler on public.pets_saude
  using (petshop_id in (select public.meus_petshops())
    and (select public.tenho_area(pets_saude.petshop_id, array['clientes', 'agenda', 'creche_hotel'])));
alter policy pets_saude_criar on public.pets_saude
  with check (petshop_id in (select public.meus_petshops()) and (select public.acesso_liberado(pets_saude.petshop_id))
    and (select public.tenho_area(pets_saude.petshop_id, array['clientes', 'agenda', 'creche_hotel'])));
alter policy pets_saude_editar on public.pets_saude
  using (petshop_id in (select public.meus_petshops()) and (select public.acesso_liberado(pets_saude.petshop_id))
    and (select public.tenho_area(pets_saude.petshop_id, array['clientes', 'agenda', 'creche_hotel'])))
  with check (petshop_id in (select public.meus_petshops()));
alter policy pets_saude_remover on public.pets_saude
  using (petshop_id in (select public.meus_petshops()) and (select public.acesso_liberado(pets_saude.petshop_id))
    and (select public.tenho_area(pets_saude.petshop_id, array['clientes', 'agenda', 'creche_hotel'])));

-- ============================================================
-- 5. Aceites: só versão conhecida
-- ============================================================
create table if not exists public.documentos_versoes (
  documento text not null check (documento in ('termos', 'privacidade')),
  versao text not null check (versao ~ '^[0-9]{1,3}\.[0-9]{1,3}$'),
  criado_em timestamptz not null default now(),
  primary key (documento, versao)
);
alter table public.documentos_versoes enable row level security;
revoke all on public.documentos_versoes from public, anon, authenticated;
comment on table public.documentos_versoes is
  'Versões dos Termos e da Política que existem (src/lib/gestao/documentos.ts). Subiu a versão no código? Ponha a linha aqui numa migração. aceitar_documentos aceita as daqui e, por folga, só a seguinte à maior.';

insert into public.documentos_versoes (documento, versao)
  select d, v from unnest(array['termos', 'privacidade']) d, unnest(array['1.0', '2.0', '2.1', '2.2', '2.3']) v
  on conflict do nothing;
-- o que já foi aceito de verdade até hoje (formato de versão normal)
insert into public.documentos_versoes (documento, versao)
  select distinct a.documento, a.versao from public.aceites a
  where a.documento in ('termos', 'privacidade') and a.versao ~ '^[0-9]{1,3}\.[0-9]{1,3}$'
    and split_part(a.versao, '.', 1)::int <= 2
  on conflict do nothing;

-- a versão existe, ou é a seguinte à maior que existe (2.3 → 2.4 ou 3.0): o código pode subir uma versão antes da migração
create or replace function public.documento_versao_ok(p_documento text, p_versao text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_maior int; v_menor int; a int; b int;
begin
  if coalesce(p_versao, '') !~ '^[0-9]{1,3}\.[0-9]{1,3}$' then return false; end if;
  if exists (select 1 from public.documentos_versoes d where d.documento = p_documento and d.versao = p_versao) then return true; end if;
  select split_part(d.versao, '.', 1)::int, split_part(d.versao, '.', 2)::int into v_maior, v_menor
    from public.documentos_versoes d where d.documento = p_documento
    order by 1 desc, 2 desc limit 1;
  if v_maior is null then return false; end if;
  a := split_part(p_versao, '.', 1)::int; b := split_part(p_versao, '.', 2)::int;
  return (a = v_maior and b = v_menor + 1) or (a = v_maior + 1 and b = 0);
end $$;
revoke execute on function public.documento_versao_ok(text, text) from public, anon, authenticated;

create or replace function public.aceitar_documentos(p_termos text, p_privacidade text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_cab jsonb;
  v_ip text;
  v_nav text;
begin
  if v_uid is null then raise exception 'Entre na sua conta para continuar.' using errcode = '28000'; end if;
  if coalesce(p_termos, '') !~ '^[0-9A-Za-z._-]{1,20}$' or coalesce(p_privacidade, '') !~ '^[0-9A-Za-z._-]{1,20}$' then
    raise exception 'Versão inválida.' using errcode = '22023';
  end if;
  -- só versão que existe: ninguém registra aceite de um documento inventado
  if not public.documento_versao_ok('termos', p_termos) or not public.documento_versao_ok('privacidade', p_privacidade) then
    raise exception 'Versão inválida.' using errcode = '22023';
  end if;
  begin v_cab := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then v_cab := null; end;
  v_ip := left(trim(split_part(coalesce(v_cab ->> 'x-forwarded-for', v_cab ->> 'x-real-ip', ''), ',', 1)), 64);
  v_nav := left(coalesce(v_cab ->> 'user-agent', ''), 300);
  insert into public.aceites (user_id, email, documento, versao, origem, ip, navegador)
  select v_uid, (select lower(u.email) from auth.users u where u.id = v_uid), x.d, x.v, 'reaceite', nullif(v_ip, ''), nullif(v_nav, '')
  from (values ('termos', p_termos), ('privacidade', p_privacidade)) as x(d, v)
  on conflict (user_id, documento, versao) where user_id is not null do nothing;
  return (select coalesce(jsonb_agg(jsonb_build_object('documento', a.documento, 'versao', a.versao, 'aceito_em', a.aceito_em) order by a.documento), '[]'::jsonb)
          from public.aceites a where a.user_id = v_uid and ((a.documento = 'termos' and a.versao = p_termos) or (a.documento = 'privacidade' and a.versao = p_privacidade)));
end $$;

-- ============================================================
-- 6. Entrada: o IP do aceite
-- ============================================================
-- o endereço de quem chamou, como o banco vê (o da Cloudflare primeiro: o cliente não consegue inventar)
create or replace function public.rede_ip() returns text
language plpgsql stable security definer set search_path = '' as $$
declare h jsonb;
begin
  begin h := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then h := null; end;
  return nullif(left(btrim(coalesce(h ->> 'cf-connecting-ip', nullif(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1), ''), h ->> 'x-real-ip', '')), 64), '');
end $$;
revoke execute on function public.rede_ip() from public, anon, authenticated;

-- novo parâmetro com padrão: quem chama com os quatro de antes continua funcionando
drop function if exists public.entrada_aceitar(text, text, text, text);
create or replace function public.entrada_aceitar(p_token text, p_nome text, p_ip text, p_navegador text, p_segredo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.entradas; v_nome text := trim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')); v_ip text;
begin
  e := public.entrada_do_codigo(p_token);
  if e.id is null then raise exception 'Este link não vale mais. Peça um novo ao pet shop.'; end if;
  perform public.entrada_frear(e.id, 'aceite', 10);
  select * into e from public.entradas o where o.id = e.id for update;
  if e.aceito_em is not null then return jsonb_build_object('aceito_em', e.aceito_em, 'nome', e.aceite_nome, 'ja_estava', true); end if;
  if char_length(v_nome) < 2 or char_length(v_nome) > 120 then raise exception 'Escreva o seu nome.'; end if;
  -- o IP informado só vale quando quem chama prova que é o servidor; senão fica o endereço que o banco vê
  v_ip := case when public.servidor_segredo_confere(p_segredo) then nullif(left(trim(coalesce(p_ip, '')), 64), '') else public.rede_ip() end;
  update public.entradas o set aceite = 'link', aceite_nome = v_nome, aceito_em = now(),
    aceite_ip = v_ip, aceite_navegador = nullif(left(coalesce(p_navegador, ''), 300), ''), atualizado_em = now()
  where o.id = e.id returning * into e;
  return jsonb_build_object('aceito_em', e.aceito_em, 'nome', e.aceite_nome, 'ja_estava', false);
end $$;
revoke execute on function public.entrada_aceitar(text, text, text, text, text) from public;
grant execute on function public.entrada_aceitar(text, text, text, text, text) to anon, authenticated, service_role;

-- ============================================================
-- 7. Loja nova: freio por rede e por dia
-- ============================================================
create table if not exists public.lojas_novas_rede (
  rede text not null,
  dia date not null,
  n integer not null default 0,
  primary key (rede, dia)
);
alter table public.lojas_novas_rede enable row level security;
revoke all on public.lojas_novas_rede from public, anon, authenticated;
comment on table public.lojas_novas_rede is 'Quantos pet shops foram criados por rede (hash do endereço) em cada dia. Linhas com mais de 3 dias são apagadas.';

-- conta uma loja nova para a rede de quem chama; false = passou do limite do dia (config_interna lojas_por_rede_dia, padrão 10).
-- Endereço interno (rede local, testes) não entra na conta.
create or replace function public.loja_nova_frear() returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_ip text := public.rede_ip(); v_rede text; v_lim int := public.link_limite('lojas_por_rede_dia', 10); v_n int;
  v_dia date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if v_ip is null or v_lim <= 0 then return true; end if;
  if v_ip ~ '^(127\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.)' or v_ip in ('::1', 'localhost') or v_ip ~* '^(fc|fd|fe80)' then return true; end if;
  v_rede := md5('maestro-loja-nova:' || v_ip);
  insert into public.lojas_novas_rede as l (rede, dia, n) values (v_rede, v_dia, 1)
  on conflict (rede, dia) do update set n = l.n + 1 where l.n < v_lim
  returning l.n into v_n;
  if v_n = 1 then delete from public.lojas_novas_rede where dia < v_dia - 3; end if;
  return v_n is not null;
end $$;
revoke execute on function public.loja_nova_frear() from public, anon, authenticated;

create or replace function public.criar_petshop(p_nome text, p_seu_nome text, p_telefone text default null, p_cidade text default null,
  p_uf text default null, p_modulos text[] default null, p_principal text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
  v_modulos text[];
  v_principal text;
begin
  if v_user is null then raise exception 'Faça login para continuar.'; end if;
  if (select count(*) from public.profissionais where user_id = v_user and papel = 'dono') >= 3 then
    raise exception 'Esta conta já tem o número máximo de pet shops.';
  end if;
  -- muitas lojas novas da mesma rede no mesmo dia: segura cadastro em série
  if not public.loja_nova_frear() then
    raise exception 'Muitos cadastros saíram desta rede de internet hoje. Tente de novo amanhã ou fale com a nossa equipe.';
  end if;
  -- sem repetição e na ordem de sempre; lista vazia vale como "usa tudo"
  select array_agg(m order by array_position(array['banho_tosa', 'creche', 'hotel', 'loja', 'pacotes']::text[], m))
    into v_modulos from (select distinct unnest(p_modulos) as m) x where m is not null;
  if p_principal in ('banho_tosa', 'creche', 'hotel', 'loja') and (v_modulos is null or p_principal = any (v_modulos)) then
    v_principal := p_principal;
  end if;
  insert into public.petshops (nome, telefone, cidade, uf, criado_por, modulos, principal)
    values (trim(p_nome), nullif(trim(p_telefone), ''), nullif(trim(p_cidade), ''), nullif(upper(trim(p_uf)), ''), v_user, v_modulos, v_principal)
    returning id into v_id;
  insert into public.profissionais (petshop_id, user_id, nome, papel, ve_financeiro, cor)
    values (v_id, v_user, coalesce(nullif(trim(p_seu_nome), ''), 'Você'), 'dono', true, '#1e3a2f');
  if v_modulos is null or 'banho_tosa' = any (v_modulos) then
    insert into public.servicos (petshop_id, nome, categoria, duracao_min, cor, ordem) values
      (v_id, 'Banho', 'banho', 60, '#3b82a0', 1),
      (v_id, 'Banho e tosa', 'banho_tosa', 120, '#f97316', 2),
      (v_id, 'Tosa higiênica', 'tosa', 45, '#7c6fb0', 3),
      (v_id, 'Hidratação', 'outro', 30, '#4d8f6b', 4),
      (v_id, 'Corte de unhas', 'outro', 15, '#b0763f', 5);
  end if;
  return v_id;
end $$;

-- ============================================================
-- 8. Fotos: nome de arquivo com formato fixo nos buckets que ainda aceitavam qualquer nome (pets e diario)
-- ============================================================
-- regra a mais (restritiva): as de antes continuam valendo; os caminhos que o aplicativo usa não mudam
drop policy if exists gestao_nome_de_foto on storage.objects;
create policy gestao_nome_de_foto on storage.objects as restrictive for insert to authenticated
  with check (
    (bucket_id <> 'pets' or name ~ '^[0-9a-f-]{36}/[A-Za-z0-9._-]{1,80}\.(jpg|jpeg|png|webp)$')
    and (bucket_id <> 'diario' or name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9]{4}-[0-9]{2}-[0-9]{2}/[A-Za-z0-9._-]{1,80}\.(jpg|jpeg|png|webp)$'));

notify pgrst, 'reload schema';
