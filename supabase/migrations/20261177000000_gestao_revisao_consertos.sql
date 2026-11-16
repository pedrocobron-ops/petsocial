-- ============================================================
-- Consertos da revisão (banco, rotas e agenda). Só aditiva: tabelas novas, funções novas e funções trocadas com a
-- MESMA assinatura (as de link_ia_contar/link_ia_registrar ganham um parâmetro com padrão).
-- Segura ANTES do deploy (produção com 34→48, 50→56, 58, 60–64, 66–76, sem 49/57): nada aqui depende da 49 nem da 57,
-- e o código que está no ar hoje não chama nada que mudou de forma incompatível.
--
-- 1. link_pedir_com_termos: volta o limite de envios por hora da 20261164 (a 68 e a 73 reescreveram a função a partir
--    da 62 e o perderam). Fica tudo da 73: dias fechados, horário do hotel, horários da lista de espera, dia de
--    experiência e aceite das regras.
-- 2. conflitos_agenda: quem não tem área de dinheiro recebe o preço E o valor da conclusão (valor_concluido,
--    concluido_servicos) em branco. A 57 recebeu a mesma troca (ela roda depois desta em produção).
-- 3. opcoes_sem_valores: o percentual de comissão sobre produtos (comissao.produtos_pct) sai para quem não recebe.
-- 4. serie_continuar ("Marcar mais 12"): o último horário cancelado ou com falta não trava mais a série.
--    Mesma função da 57 (definer, confere Agenda e conta liberada), com a conferência certa; a 57 recebeu a mesma troca.
-- 5. Cakto: o `callback` do link de pagamento passa a ser assinado (<id do pet shop>.<ficha secreta da loja>), e uma
--    compra que chega por callback ou por e-mail não mexe numa conta que já tem outra assinatura ativa ou atrasada
--    (fica para o administrador ligar). Aviso de cancelamento, atraso, reembolso ou contestação só vale para a
--    assinatura que já está gravada na conta, ou para o mesmo pedido que foi creditado nela.
-- 6. Mozart e Ajuda: a contagem do dia passa a ser do banco (assistente_contar, security definer), conta toda chamada
--    ao modelo e vale também para conta só para consulta. A equipe não apaga nem edita mais assistente_eventos.
-- 7. Trava do servidor: as funções que só a rota do servidor deve chamar com a chave pública (contagem do "Tirar dúvida"
--    do link e do chat de venda) pedem um segredo que só o servidor conhece. O banco guarda só o sha256
--    (config_interna 'servidor_segredo_sha256'), gravado pelo administrador (botão no painel, aba Cakto, que manda
--    o servidor gravar o seu). Enquanto não for gravado, as funções aceitam como antes (e o painel avisa).
-- 8. Chat de venda (Nina): teto de mensagens por hora e por dia guardado no banco (vendas_contar).
-- ============================================================

-- ---------- 1. link: limite de envios de volta ----------
-- (mesma função da 20261173, com o bloco do limite da 20261164 antes de executar e o registro do envio depois)
create or replace function public.link_pedir_com_termos(p_funcao text, p_args jsonb, p_termos text default null, p_vacinas boolean default false) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.petshops;
  o jsonb;
  v_lista text;
  r jsonb;
  v_id uuid;
  v_grupo uuid;
  v_args jsonb := p_args;
  v_he text;
  v_hs text;
  v_exp boolean := false;
  v_fone text;
  v_rede text;
begin
  if p_funcao not in ('link_pedir', 'link_pedir_estadia', 'link_espera_pedir') or jsonb_typeof(p_args) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_args) k where k !~ '^p_[a-z_]{1,40}$') then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end if;
  select * into v from public.petshops where link_codigo = p_args ->> 'p_codigo' and link_ativo;
  if not found or not public.acesso_liberado(v.id) then return jsonb_build_object('ok', false, 'erro', 'fechado'); end if;
  o := public.link_opcoes_de(v.opcoes);
  -- dia de experiência (opção da creche): o tutor marca no pedido de creche de um dia só; o pedido guarda a marca
  if p_funcao = 'link_pedir_estadia' and p_args ? 'p_experiencia' then
    v_exp := p_args -> 'p_experiencia' = 'true'::jsonb;
    v_args := v_args - 'p_experiencia';
    if v_exp and (p_args ->> 'p_tipo' is distinct from 'creche' or p_args ->> 'p_entrada' is distinct from p_args ->> 'p_saida'
                  or not public.creche_experiencia_ligada(v.id)) then
      return jsonb_build_object('ok', false, 'erro', 'experiencia');
    end if;
  end if;
  -- hotel: chegada e busca só em dia que abre e dentro do horário de funcionamento daquele dia (ver link_hotel_dia_recusado)
  if p_funcao = 'link_pedir_estadia' and p_args ->> 'p_tipo' = 'hotel' then
    r := public.link_hotel_dia_recusado(v.id, public.dia_iso(p_args ->> 'p_entrada'), coalesce(p_args ->> 'p_hora_entrada', '08:00'), 'entrada');
    if r is null then r := public.link_hotel_dia_recusado(v.id, public.dia_iso(p_args ->> 'p_saida'), coalesce(p_args ->> 'p_hora_saida', '18:00'), 'saida'); end if;
    if r is not null then return r; end if;
  end if;
  if p_funcao = 'link_espera_pedir' then
    v_he := case when p_args ->> 'p_hora_entrada' ~ '^([01]\d|2[0-3]):[0-5]\d$' then p_args ->> 'p_hora_entrada' end;
    v_hs := case when p_args ->> 'p_hora_saida' ~ '^([01]\d|2[0-3]):[0-5]\d$' then p_args ->> 'p_hora_saida' end;
    v_args := v_args - 'p_hora_entrada' - 'p_hora_saida';
  end if;
  if (o ->> 'termos')::boolean then
    if regexp_replace(btrim(coalesce(p_termos, '')), '\r', '', 'g') <> regexp_replace(o ->> 'texto', '\r', '', 'g')
       or ((o ->> 'vacinas')::boolean and not coalesce(p_vacinas, false)) then
      return jsonb_build_object('ok', false, 'erro', 'termos');
    end if;
  end if;
  -- muitos pedidos de uma vez (da loja toda, do mesmo WhatsApp ou da mesma rede): pede para tentar mais tarde (da 20261164)
  v_fone := public.link_fone_chave(p_args ->> 'p_telefone');
  v_rede := public.link_rede();
  if public.link_muitos_envios(v.id, v_fone, v_rede) then
    return jsonb_build_object('ok', false, 'erro', 'limite', 'motivo', 'muitos',
      'mensagem', 'Recebemos muitos pedidos agora. Tente de novo mais tarde ou chame no WhatsApp.');
  end if;
  select string_agg(format('%I => %L', e.key,
      case jsonb_typeof(e.value) when 'null' then null when 'string' then e.value #>> '{}' else e.value::text end), ', ')
    into v_lista from jsonb_each(v_args) e;
  begin
    execute format('select public.%I(%s)', p_funcao, v_lista) into r;
  exception when undefined_function or invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end;
  if r ->> 'ok' = 'true' then
    insert into public.link_envios (petshop_id, tipo, fone, rede, pedido_id)
      values (v.id, case when p_funcao = 'link_espera_pedir' then 'espera' else 'pedido' end, v_fone, v_rede,
              case when (r ->> 'id') ~* '^[0-9a-f-]{36}$' then (r ->> 'id')::uuid end);
  end if;
  if p_funcao = 'link_espera_pedir' and r ->> 'ok' = 'true' and (r ->> 'id') is not null then
    v_id := (r ->> 'id')::uuid;
    perform set_config('maestro.link', '1', true);
    update public.lista_espera
      set hora_entrada = coalesce(v_he, hora_entrada), hora_saida = coalesce(v_hs, hora_saida),
          termos_aceitos_em = case when (o ->> 'termos')::boolean then now() else termos_aceitos_em end
      where id = v_id and petshop_id = v.id;
    perform set_config('maestro.link', '', true);
    return r;
  end if;
  if v_exp and r ->> 'ok' = 'true' and (r ->> 'id') is not null then
    v_id := (r ->> 'id')::uuid;
    select grupo_id into v_grupo from public.pedidos_agendamento where id = v_id;
    update public.pedidos_agendamento set experiencia = true
      where petshop_id = v.id and (id = v_id or (v_grupo is not null and grupo_id = v_grupo));
  end if;
  if (o ->> 'termos')::boolean and r ->> 'ok' = 'true' and (r ->> 'id') is not null then
    v_id := (r ->> 'id')::uuid;
    select grupo_id into v_grupo from public.pedidos_agendamento where id = v_id;
    update public.pedidos_agendamento
      set termos_aceitos_em = now(), termos_texto = nullif(o ->> 'texto', ''), termos_vacinas = (o ->> 'vacinas')::boolean
      where petshop_id = v.id and (id = v_id or (v_grupo is not null and grupo_id = v_grupo));
  end if;
  return r;
end $$;
revoke execute on function public.link_pedir_com_termos(text, jsonb, text, boolean) from public;
grant execute on function public.link_pedir_com_termos(text, jsonb, text, boolean) to anon, authenticated;

-- ---------- 2. conflitos de agenda sem valores para quem não recebe ----------
-- (mesma função da 20261157, com valor_concluido/concluido_servicos em branco também)
create or replace function public.conflitos_agenda(p_petshop uuid, p_profissional uuid, p_inicio timestamptz, p_fim timestamptz, p_ignorar uuid default null)
returns setof public.agendamentos
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.agendamentos;
  v_vejo boolean;
begin
  if not exists (select 1 from public.meus_petshops() m where m = p_petshop) then return; end if;
  v_vejo := public.tenho_area(p_petshop, array['caixa', 'financeiro', 'relatorios']);
  for r in select * from public.agendamentos
    where petshop_id = p_petshop and profissional_id = p_profissional
      and status not in ('cancelado', 'faltou')
      and inicio < p_fim and fim > p_inicio
      and (p_ignorar is null or id <> p_ignorar)
  loop
    -- sem área de dinheiro: o preço e o valor guardado na conclusão (20261169) saem em branco
    -- (jsonb_populate_record ignora a coluna que ainda não existe)
    if not v_vejo then r := jsonb_populate_record(r, '{"preco": null, "valor_concluido": null, "concluido_servicos": null}'::jsonb); end if;
    return next r;
  end loop;
end $$;
revoke execute on function public.conflitos_agenda(uuid, uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.conflitos_agenda(uuid, uuid, timestamptz, timestamptz, uuid) to authenticated;

-- ---------- 3. opções: comissão sobre produtos é reservada ----------
create or replace function public.opcoes_sem_valores(o jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(x.k, case
      when x.k in ('hotel.diaria_por_porte', 'hotel.temporadas', 'hotel.desconto_segundo_pet', 'hotel.taxas', 'creche.desconto_irmao')
        then jsonb_build_object('ativo', case when jsonb_typeof(x.v) = 'object' then coalesce(x.v -> 'ativo', 'false'::jsonb) else 'false'::jsonb end)
      else x.v end), '{}'::jsonb)
  from jsonb_each(coalesce(o, '{}'::jsonb)) as x(k, v)
  where x.k not in ('dinheiro.multa_fixa', 'dinheiro.multa_pct', 'dinheiro.juros_mes_pct', 'dinheiro.taxa_falta', 'creche.experiencia_preco',
                    'comissao.produtos_pct')
$$;

-- ---------- 4. "Marcar mais 12" ----------
-- (mesma função da 20261157: definer, confere Agenda e conta liberada; com a conferência do último horário de pé)
create or replace function public.serie_continuar(p_serie uuid, p_depois_de timestamptz, p_vezes integer default 12) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  s public.series_agenda;
  m public.agendamentos;
  v_fuso text;
  v_ultimo timestamptz;
  v_ativo timestamptz;
  v_local timestamp;
  v_quando timestamptz;
  v_feitos integer := 0;
  v_voltas integer := 0;
  v_novo uuid;
begin
  select * into s from public.series_agenda where serie_id = p_serie;
  if not found or s.encerrada_em is not null then return 0; end if;
  if not public.tenho_area(s.petshop_id, array['agenda']) or not public.acesso_liberado(s.petshop_id) then return 0; end if;
  perform 1 from public.series_agenda where serie_id = p_serie for update;
  select max(a.inicio) into v_ultimo from public.agendamentos a where a.serie_id = p_serie and a.petshop_id = s.petshop_id;
  select max(a.inicio) into v_ativo from public.agendamentos a
    where a.serie_id = p_serie and a.petshop_id = s.petshop_id and a.status not in ('cancelado', 'faltou');
  -- p_depois_de é o último horário que a tela viu (o cartão manda o último de pé; o horário aberto, o último de todos).
  -- Outra pessoa já ter continuado aparece como um horário de pé depois dele. (O último horário cancelado ou com falta
  -- não trava mais a série: 20261177.)
  if v_ultimo is null or v_ativo is null or v_ativo > p_depois_de then return 0; end if;
  select * into m from public.agendamentos a
    where a.serie_id = p_serie and a.petshop_id = s.petshop_id and a.status not in ('cancelado', 'faltou') order by a.inicio desc limit 1;
  if not found then return 0; end if;
  select coalesce(x.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops x where x.id = s.petshop_id;
  -- o dia vem do último horário da série; a hora, do último que está de pé
  v_local := (v_ultimo at time zone v_fuso)::date + (m.inicio at time zone v_fuso)::time;
  while v_feitos < least(greatest(coalesce(p_vezes, 12), 1), 26) and v_voltas < 80 loop
    v_voltas := v_voltas + 1;
    v_local := v_local + make_interval(days => 7 * s.cada_semanas);
    v_quando := v_local at time zone v_fuso;
    continue when v_quando < now();
    insert into public.agendamentos (petshop_id, pet_id, servico_id, profissional_id, inicio, fim, preco, obs, leva_traz, endereco_leva_traz, criado_por, serie_id)
    values (s.petshop_id, m.pet_id, m.servico_id, m.profissional_id, v_quando, v_quando + (m.fim - m.inicio), m.preco, m.obs, m.leva_traz, m.endereco_leva_traz,
      (select auth.uid()), p_serie)
    returning id into v_novo;
    insert into public.agendamento_servicos (petshop_id, agendamento_id, servico_id, preco, ordem)
      select x.petshop_id, v_novo, x.servico_id, x.preco, x.ordem from public.agendamento_servicos x where x.agendamento_id = m.id;
    v_feitos := v_feitos + 1;
  end loop;
  return v_feitos;
end $$;
revoke execute on function public.serie_continuar(uuid, timestamptz, integer) from public, anon;
grant execute on function public.serie_continuar(uuid, timestamptz, integer) to authenticated;

-- ---------- 5. Cakto: callback assinado e compra que não mexe em assinatura de outra pessoa ----------
-- Ficha secreta de cada pet shop para o link de pagamento. Ninguém lê direto: só o dono, pela função abaixo.
create table if not exists public.cakto_callbacks (
  petshop_id uuid primary key references public.petshops (id) on delete cascade,
  ficha text not null default encode(extensions.gen_random_bytes(16), 'hex') check (ficha ~ '^[0-9a-f]{32}$'),
  criado_em timestamptz not null default now()
);
alter table public.cakto_callbacks enable row level security;
revoke all on public.cakto_callbacks from public, anon, authenticated;

-- O valor do `callback` do link de pagamento: "<id do pet shop>.<ficha>". Só para o dono (é quem assina).
create or replace function public.assinatura_callback(p uuid) returns text
language plpgsql volatile security definer set search_path = '' as $$
declare v text;
begin
  if p is null or not public.sou_dono(p) then return null; end if;
  insert into public.cakto_callbacks (petshop_id) values (p) on conflict (petshop_id) do nothing;
  select c.ficha into v from public.cakto_callbacks c where c.petshop_id = p;
  return p::text || '.' || v;
end $$;
revoke execute on function public.assinatura_callback(uuid) from public, anon;
grant execute on function public.assinatura_callback(uuid) to authenticated;

-- Mesma assinatura e mesmo começo da 20261164 (segredo, outro produto, aviso repetido). Muda como acha a conta:
--   1) assinatura já gravada na conta: vale tudo, como antes;
--   2) callback ASSINADO ("<id>.<ficha>"; o id sozinho não vale mais: ele aparece no endereço da logo);
--   3) e-mail da compra / e-mail do dono, como antes.
-- Por 2 ou 3: pagamento que chega para uma conta com OUTRA assinatura ativa ou atrasada não é aplicado (fica sem conta,
-- com 'conflito_com' no registro, para o administrador ligar se for o caso); e aviso de cancelamento, atraso, reembolso
-- ou contestação só vale se for do mesmo pedido que foi creditado nessa conta.
create or replace function public.cakto_evento(p_segredo text, p_evento text, p_email text, p_assinatura text, p_payload jsonb,
  p_oferta text default null, p_callback text default null, p_produto text default null, p_produto_curto text default null)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_petshop uuid;
  v_produto text;
  v_pedido text := nullif(btrim(coalesce(p_payload ->> 'pedido', '')), '');
  v_por_assinatura boolean := false;
  v_conflito uuid;
  v_negativo boolean := p_evento in ('subscription_late', 'subscription_renewal_refused', 'subscription_canceled', 'subscription_paused', 'refund', 'chargeback');
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

  select id into v_petshop from public.petshops where p_assinatura is not null and cakto_assinatura = p_assinatura limit 1;
  v_por_assinatura := v_petshop is not null;
  if v_petshop is null and p_callback ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{32}$' then
    select c.petshop_id into v_petshop from public.cakto_callbacks c
      where c.petshop_id = split_part(p_callback, '.', 1)::uuid and c.ficha = lower(split_part(p_callback, '.', 2));
  end if;
  if v_petshop is null and p_email is not null then
    select id into v_petshop from public.petshops where lower(cakto_email) = lower(p_email) order by criado_em desc limit 1;
  end if;
  if v_petshop is null and p_email is not null then
    select p.petshop_id into v_petshop
      from public.profissionais p join auth.users u on u.id = p.user_id
      where p.papel = 'dono' and lower(u.email) = lower(p_email)
      order by p.criado_em desc limit 1;
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
      coalesce(p_payload, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('oferta', p_oferta, 'assinatura', p_assinatura, 'conflito_com', v_conflito)));

  if v_conflito is not null then return 'conflito'; end if;
  if v_petshop is null then return 'sem_conta'; end if;
  return public.cakto_aplicar(v_petshop, p_evento, p_email, p_assinatura, p_oferta, now());
end $$;
revoke execute on function public.cakto_evento(text, text, text, text, jsonb, text, text, text, text) from public;
grant execute on function public.cakto_evento(text, text, text, text, jsonb, text, text, text, text) to anon, authenticated;

-- ---------- 6. Mozart e Ajuda: contagem do dia no banco ----------
create table if not exists public.assistente_uso (
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  canal text not null check (canal in ('mozart', 'ajuda')),
  dia date not null,
  pedidos int not null default 0 check (pedidos >= 0),
  chamadas int not null default 0 check (chamadas >= 0),
  primary key (petshop_id, canal, dia)
);
alter table public.assistente_uso enable row level security;
revoke all on public.assistente_uso from public, anon, authenticated;

-- Conta um pedido (p_tipo 'pedido') ou uma chamada ao modelo ('chamada') do dia de hoje no fuso do pet shop.
-- Devolve true se coube no limite (e contou), false se já chegou ao limite (não conta). Só para quem é da equipe;
-- vale também com a conta só para consulta. Ninguém diminui a contagem.
create or replace function public.assistente_contar(p_petshop uuid, p_canal text, p_tipo text, p_limite integer) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_dia date; v_ok boolean;
begin
  if p_petshop is null or p_canal not in ('mozart', 'ajuda') or p_tipo not in ('pedido', 'chamada') or coalesce(p_limite, 0) <= 0 then return false; end if;
  if not exists (select 1 from public.meus_petshops() m where m = p_petshop) then return false; end if;
  select (now() at time zone coalesce(p.fuso, 'America/Sao_Paulo'))::date into v_dia from public.petshops p where p.id = p_petshop;
  insert into public.assistente_uso as u (petshop_id, canal, dia, pedidos, chamadas)
    values (p_petshop, p_canal, v_dia, case when p_tipo = 'pedido' then 1 else 0 end, case when p_tipo = 'chamada' then 1 else 0 end)
  on conflict (petshop_id, canal, dia) do update
    set pedidos = u.pedidos + case when p_tipo = 'pedido' then 1 else 0 end,
        chamadas = u.chamadas + case when p_tipo = 'chamada' then 1 else 0 end
    where (case when p_tipo = 'pedido' then u.pedidos else u.chamadas end) < p_limite
  returning true into v_ok;
  return coalesce(v_ok, false);
end $$;
revoke execute on function public.assistente_contar(uuid, text, text, integer) from public, anon;
grant execute on function public.assistente_contar(uuid, text, text, integer) to authenticated;

-- o registro do que o Mozart fez fica: a equipe lê e acrescenta, mas não edita nem apaga
drop policy if exists assistente_eventos_editar on public.assistente_eventos;
drop policy if exists assistente_eventos_remover on public.assistente_eventos;
revoke update, delete, truncate on public.assistente_eventos from anon, authenticated;

-- ---------- 7. trava do servidor ----------
-- true quando o segredo confere, ou enquanto o administrador ainda não gravou o do servidor (comportamento de antes)
create or replace function public.servidor_segredo_ok(p_segredo text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_hash text;
begin
  select valor into v_hash from public.config_interna where chave = 'servidor_segredo_sha256';
  if v_hash is null then return true; end if;
  return p_segredo is not null and encode(extensions.digest(p_segredo, 'sha256'), 'hex') = v_hash;
end $$;
revoke execute on function public.servidor_segredo_ok(text) from public, anon, authenticated;

-- grava o segredo do servidor (chamada pela rota /api/gestao/servidor com o login do administrador)
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
end $$;

create or replace function public.admin_servidor_estado() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return jsonb_build_object(
    'ligada', exists (select 1 from public.config_interna where chave = 'servidor_segredo_sha256'),
    'em', (select valor from public.config_interna where chave = 'servidor_segredo_sha256_em'));
end $$;
revoke execute on function public.admin_servidor_segredo(text), public.admin_servidor_estado() from public, anon;
grant execute on function public.admin_servidor_segredo(text), public.admin_servidor_estado() to authenticated;

-- "Tirar dúvida" do link: as mesmas funções da 20261176, agora com o segredo do servidor (quem chama direto pela chave
-- pública não gasta a cota do dia do pet shop nem mexe no resumo do mês)
drop function if exists public.link_ia_contar(text);
create or replace function public.link_ia_contar(p_codigo text, p_segredo text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_id uuid; v_dia date; v_lim int; v_n int;
begin
  if not public.servidor_segredo_ok(p_segredo) then return jsonb_build_object('ok', false, 'motivo', 'recusado'); end if;
  select p.id, (now() at time zone p.fuso)::date into v_id, v_dia
  from public.petshops p
  where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id) and p.opcoes -> 'link.ia' = 'true'::jsonb;
  if v_id is null then return jsonb_build_object('ok', false, 'motivo', 'desligado'); end if;
  v_lim := public.link_limite('link_ia_dia', 100);
  if v_lim <= 0 then return jsonb_build_object('ok', false, 'motivo', 'limite'); end if;
  insert into public.link_ia_uso as u (petshop_id, dia, perguntas) values (v_id, v_dia, 1)
  on conflict (petshop_id, dia) do update set perguntas = u.perguntas + 1 where u.perguntas < v_lim
  returning u.perguntas into v_n;
  if v_n is null then return jsonb_build_object('ok', false, 'motivo', 'limite'); end if;
  return jsonb_build_object('ok', true);
end $$;

drop function if exists public.link_ia_registrar(text, boolean);
create or replace function public.link_ia_registrar(p_codigo text, p_respondida boolean, p_segredo text default null) returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  if not public.servidor_segredo_ok(p_segredo) then return; end if;
  update public.link_ia_uso u
  set respondidas = u.respondidas + case when p_respondida then 1 else 0 end,
      sem_resposta = u.sem_resposta + case when p_respondida then 0 else 1 end
  from public.petshops p
  where p.link_codigo = p_codigo and u.petshop_id = p.id and u.dia = (now() at time zone p.fuso)::date
    and u.respondidas + u.sem_resposta < u.perguntas;
end $$;
revoke execute on function public.link_ia_contar(text, text), public.link_ia_registrar(text, boolean, text) from public;
grant execute on function public.link_ia_contar(text, text), public.link_ia_registrar(text, boolean, text) to anon, authenticated;

-- ---------- 8. chat de venda: teto por hora e por dia ----------
-- Uma linha por hora para o total ('*') e uma por visitante (hash do endereço, feito no servidor).
create table if not exists public.vendas_uso (
  hora timestamptz not null,
  visitante text not null check (length(visitante) between 1 and 80),
  mensagens int not null default 0 check (mensagens >= 0),
  primary key (hora, visitante)
);
alter table public.vendas_uso enable row level security;
revoke all on public.vendas_uso from public, anon, authenticated;

-- Conta uma mensagem do chat de venda. Limites em config_interna: vendas_limite_hora (400), vendas_limite_dia (2000),
-- vendas_limite_visitante (30 por hora). Devolve true se coube (e contou).
create or replace function public.vendas_contar(p_segredo text, p_visitante text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_hora timestamptz := date_trunc('hour', now());
  v_vis text := left(coalesce(nullif(btrim(p_visitante), ''), 'sem-ip'), 80);
  v_ok boolean;
begin
  if not public.servidor_segredo_ok(p_segredo) then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('vendas_uso', 0));
  if (select coalesce(sum(u.mensagens), 0) from public.vendas_uso u where u.visitante = '*' and u.hora > now() - interval '1 day')
       >= public.link_limite('vendas_limite_dia', 2000)
     or (select coalesce(sum(u.mensagens), 0) from public.vendas_uso u where u.visitante = '*' and u.hora = v_hora)
       >= public.link_limite('vendas_limite_hora', 400)
     or (select coalesce(sum(u.mensagens), 0) from public.vendas_uso u where u.visitante = v_vis and u.hora = v_hora)
       >= public.link_limite('vendas_limite_visitante', 30) then
    return false;
  end if;
  insert into public.vendas_uso as u (hora, visitante, mensagens) values (v_hora, '*', 1), (v_hora, v_vis, 1)
    on conflict (hora, visitante) do update set mensagens = u.mensagens + 1;
  -- limpeza de vez em quando (só as horas antigas)
  if random() < 0.02 then delete from public.vendas_uso where hora < now() - interval '3 days'; end if;
  return true;
end $$;
revoke execute on function public.vendas_contar(text, text) from public;
grant execute on function public.vendas_contar(text, text) to anon, authenticated;

notify pgrst, 'reload schema';
