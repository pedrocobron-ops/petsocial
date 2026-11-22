-- Reforços de segurança (auditoria de 20/11/2026).
--
-- 1. Painel do administrador com segundo fator (TOTP, Supabase Auth MFA). sou_admin() passa a exigir a sessão forte
--    (aal2 no token, depois do código do aplicativo autenticador); quem chama todas as admin_*, a regra da Escola e a rota
--    /api/gestao/admin/copia (que pergunta sou_admin com o token de quem pede) herdam a exigência. A tela pergunta
--    admin_situacao() (é admin? a sessão já é forte?) para mostrar o cadastro do código ou o pedido do código. O cadastro e a
--    conferência do código são do Supabase Auth (mfa.enroll/challenge/verify), não destas funções: funcionam com a sessão
--    comum (aal1) e o dono nunca fica trancado do lado de fora. Nenhuma função fora do painel usa sou_admin().
-- 2. IA no teste grátis: teto geral próprio para os pet shops em teste (padrão: 25% de cada teto geral, em config_interna
--    mozart_dia_geral_teste, ajuda_dia_geral_teste, boletim_dia_geral_teste, link_ia_dia_geral_teste, caderno_dia_geral_teste),
--    para quem paga continuar atendido; e o e-mail do dono provado antes de usar a IA no teste (motivo 'email').
--    Provado = emails_confirmados (código, link de senha) ou a confirmação do cadastro pelo link (email_confirmed_at depois da
--    criação: a confirmação automática, com "Confirm email" desligado, não conta).
-- 3. IP e navegador dos aceites públicos: x-maestro-ip / x-maestro-navegador (boletim_autorizar) e p_ip / p_navegador
--    (entrada_aceitar) só valem com o segredo do servidor; sem ele, o endereço que o banco vê (cf-connecting-ip primeiro: o
--    cliente não inventa) e o user-agent do pedido. aceitar_documentos usava o x-forwarded-for antes do cf-connecting-ip.
-- 4. Link do cliente: freio por rede (hash do IP; IPv6 por /64) guardado no banco, que vale em todas as instâncias do servidor:
--    Tirar dúvida (link_ia_rede_hora 20 e link_ia_rede_dia 40 perguntas por rede em cada pet shop; o servidor manda o IP de quem
--    pergunta, que só vale com o segredo) e as consultas anônimas link_horarios, link_hotel_estimativa e link_estadia_cheios
--    (link_freio_<tipo>_hora, padrão 600 por hora por rede em cada pet shop: um tutor de verdade fica muito longe disso).
-- 5. Fotos dos pets: o bucket `pets` fica privado (o mesmo nome; os arquivos não mudam de lugar). A equipe lê com endereço
--    assinado; a logo do pet shop é lida por qualquer um (pets_logo_ler) pela rota /gestao/marca/...; a página do tutor lê a
--    foto dos pets dele pelo código (x-tutor-token, como o diário). Mandar, trocar e apagar: só quem mexe no cadastro do pet
--    (clientes, agenda, creche_hotel, pacotes, caixa — as mesmas áreas de pets_editar).
-- 6. Chaves compostas: lancamentos.conta_id, devolucao_de, multa_de e diario_fotos.pet_id só aceitam linha do mesmo pet shop.
--
-- Funções substituídas (cópia da última versão, mudando só o necessário):
--   sou_admin()                              20261111000000_gestao_base.sql                exige a sessão forte
--   assistente_contar_v2(...)                20261228000000_gestao_seguranca_rodada9.sql   teto do teste e e-mail provado
--   boletim_ia_contar(uuid, text)            20261228000000_gestao_seguranca_rodada9.sql   teto do teste e e-mail provado
--   caderno_contar(uuid, int)                20261188000000_gestao_foto_caderno.sql        teto do teste e e-mail provado
--   link_ia_contar(text, text)               20261228000000_gestao_seguranca_rodada9.sql   novo p_rede (com padrão); teto do teste
--   boletim_autorizar(text, text, text)      20261210000000_gestao_lgpd_ajustes.sql        novo p_segredo (com padrão)
--   entrada_aceitar(...)                     20261228000000_gestao_seguranca_rodada9.sql   navegador só com o segredo
--   aceitar_documentos(text, text)           20261228000000_gestao_seguranca_rodada9.sql   IP pelo rede_ip()
--   link_horarios(...)                       20261239000000_gestao_link_varios_servicos.sql  freio por rede (fica volatile)
--   link_hotel_estimativa(...)               20261154000000_gestao_consertos_hotel.sql     freio por rede (fica volatile)
--   link_estadia_cheios(...)                 20261145000000_gestao_hotel_precos.sql        freio por rede (plpgsql, volatile)
--
-- Pode rodar de novo sem erro (create or replace / if not exists / drop if exists).

-- ============================================================
-- 1. Administrador com segundo fator
-- ============================================================
-- a sessão de quem chama passou pelo segundo fator (aal2 no token do Supabase Auth)
create or replace function public.sessao_forte() returns boolean
language sql stable set search_path = '' as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
$$;
revoke execute on function public.sessao_forte() from public, anon;
grant execute on function public.sessao_forte() to authenticated, service_role;

create or replace function public.sou_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid())) and public.sessao_forte()
$$;

-- Para a tela do painel: é da equipe Maestro Pet? A sessão já passou pelo código? Não dá acesso a nada.
create or replace function public.admin_situacao() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'admin', exists (select 1 from public.admins where user_id = (select auth.uid())),
    'forte', public.sessao_forte())
$$;
revoke execute on function public.admin_situacao() from public, anon;
grant execute on function public.admin_situacao() to authenticated;

-- ============================================================
-- 2. IA no teste grátis
-- ============================================================
-- quanto os pet shops em teste já usaram hoje (dia de Brasília), por canal
create or replace function public.ia_uso_teste(p_canal text) returns integer
language sql stable security definer set search_path = '' as $$
  select case p_canal
    when 'mozart' then (select coalesce(sum(u.chamadas), 0) from public.assistente_uso u join public.petshops p on p.id = u.petshop_id
                        where p.status = 'teste' and u.canal = 'mozart' and u.dia >= (now() at time zone 'America/Sao_Paulo')::date)
    when 'ajuda' then (select coalesce(sum(u.pedidos), 0) from public.assistente_uso u join public.petshops p on p.id = u.petshop_id
                       where p.status = 'teste' and u.canal = 'ajuda' and u.dia >= (now() at time zone 'America/Sao_Paulo')::date)
    when 'boletim' then (select coalesce(sum(u.textos), 0) from public.boletim_ia_uso u join public.petshops p on p.id = u.petshop_id
                         where p.status = 'teste' and u.dia >= (now() at time zone 'America/Sao_Paulo')::date)
    when 'link_ia' then (select coalesce(sum(u.perguntas), 0) from public.link_ia_uso u join public.petshops p on p.id = u.petshop_id
                         where p.status = 'teste' and u.dia >= (now() at time zone 'America/Sao_Paulo')::date)
    when 'caderno' then (select coalesce(sum(u.paginas), 0) from public.caderno_uso u join public.petshops p on p.id = u.petshop_id
                         where p.status = 'teste' and u.dia >= (now() at time zone 'America/Sao_Paulo')::date)
    else 0 end::integer
$$;
revoke execute on function public.ia_uso_teste(text) from public, anon, authenticated;

-- o teto dos pet shops em teste: config_interna <canal>_dia_geral_teste; sem ela, um quarto do teto geral do canal
create or replace function public.ia_teto_teste(p_canal text) returns integer
language sql stable security definer set search_path = '' as $$
  select public.link_limite(p_canal || '_dia_geral_teste',
    case when p_canal = 'caderno' then public.link_limite('caderno_dia_geral', 3000) else public.ia_teto_geral(p_canal) end / 4)
$$;
revoke execute on function public.ia_teto_teste(text) from public, anon, authenticated;

-- o e-mail de quem é dono do pet shop está provado: código ou link (emails_confirmados) ou a confirmação do cadastro pelo link
-- (email_confirmed_at depois da criação; a confirmação automática sai no mesmo instante da criação e não conta)
create or replace function public.ia_dono_confirmado(p_petshop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profissionais x join auth.users u on u.id = x.user_id
    where x.petshop_id = p_petshop and x.papel = 'dono' and x.ativo and coalesce(u.email, '') <> ''
      and (exists (select 1 from public.emails_confirmados c where c.user_id = u.id and c.email = lower(u.email))
           or u.email_confirmed_at > u.created_at + interval '5 seconds'))
$$;
revoke execute on function public.ia_dono_confirmado(uuid) from public, anon, authenticated;

-- motivo do teste grátis antes de gastar: 'email' (o dono ainda não provou o e-mail) ou 'geral' (teto dos pet shops em teste)
create or replace function public.ia_teste_recusa(p_petshop uuid, p_canal text, p_quanto integer default 1) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when (select p.status from public.petshops p where p.id = p_petshop) is distinct from 'teste' then null
    when not public.ia_dono_confirmado(p_petshop) then 'email'
    when public.ia_uso_teste(p_canal) + greatest(coalesce(p_quanto, 1), 1) > public.ia_teto_teste(p_canal) then 'geral'
    else null end
$$;
revoke execute on function public.ia_teste_recusa(uuid, text, integer) from public, anon, authenticated;

create or replace function public.assistente_contar_v2(p_petshop uuid, p_canal text, p_tipo text, p_limite integer, p_segredo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_dia date; v_ok boolean; v_lim integer; v_status public.status_assinatura; v_loja integer; v_teste integer; v_recusa text;
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
  -- (20261245) teste grátis: e-mail do dono provado e o teto de todos os pet shops em teste juntos
  if v_status = 'teste' then
    v_recusa := public.ia_teste_recusa(p_petshop, p_canal);
    if v_recusa is not null then return jsonb_build_object('ok', false, 'motivo', v_recusa); end if;
  end if;
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

create or replace function public.boletim_ia_contar(p_petshop uuid, p_segredo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_dia date; v_lim int; v_n int; v_recusa text;
begin
  if not public.servidor_chamada_ok(p_segredo) then return jsonb_build_object('ok', false, 'motivo', 'recusado'); end if;
  if not public.tenho_area(p_petshop, array['agenda', 'creche_hotel']) or not public.acesso_liberado(p_petshop) then
    return jsonb_build_object('ok', false, 'motivo', 'sem_acesso');
  end if;
  select (now() at time zone coalesce(p.fuso, 'America/Sao_Paulo'))::date into v_dia from public.petshops p where p.id = p_petshop;
  v_lim := public.link_limite('boletim_ia_dia', 100);
  if v_lim <= 0 then return jsonb_build_object('ok', false, 'motivo', 'limite'); end if;
  -- (20261245) teste grátis: e-mail do dono provado e o teto dos pet shops em teste
  v_recusa := public.ia_teste_recusa(p_petshop, 'boletim');
  if v_recusa is not null then return jsonb_build_object('ok', false, 'motivo', v_recusa); end if;
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

create or replace function public.caderno_contar(p_petshop uuid, p_paginas int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_dia date;
  v_lim int := public.link_limite('caderno_dia', 30);
  v_geral int := public.link_limite('caderno_dia_geral', 3000);
  v_hoje_br date := (now() at time zone 'America/Sao_Paulo')::date;
  v_usadas int;
  v_todas int;
  v_recusa text;
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
  -- (20261245) teste grátis: e-mail do dono provado (também na consulta de quanto resta, para a tela avisar antes)
  v_recusa := public.ia_teste_recusa(p_petshop, 'caderno', p_paginas);
  if v_recusa = 'email' or (v_recusa is not null and p_paginas > 0) then
    return jsonb_build_object('ok', false, 'motivo', v_recusa, 'restam', greatest(v_lim - v_usadas, 0), 'limite', v_lim);
  end if;
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

-- ============================================================
-- 4a. Freio por rede, guardado no banco (vale em todas as instâncias do servidor)
-- ============================================================
create table if not exists public.freios_rede (
  chave text not null,
  janela timestamptz not null,
  n integer not null default 0,
  primary key (chave, janela)
);
alter table public.freios_rede enable row level security;
revoke all on public.freios_rede from public, anon, authenticated;
comment on table public.freios_rede is 'Contagem por janela (hora ou dia) de consultas e perguntas por rede (hash do IP) em cada pet shop. Nunca o IP em si. Linhas com mais de 2 dias são apagadas.';

-- a rede de um IP, em hash: IPv4 inteiro, IPv6 pelo /64 (a mesma casa troca o fim do endereço sozinha). Texto que não é IP: o texto.
create or replace function public.rede_chave(p_ip text) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := nullif(left(btrim(coalesce(p_ip, '')), 64), ''); i inet;
begin
  if v is null then return null; end if;
  begin i := v::inet; exception when others then return md5('maestro-rede:' || v); end;
  return md5('maestro-rede:' || case when family(i) = 6 then network(set_masklen(i, 64))::text else host(i) end);
end $$;
revoke execute on function public.rede_chave(text) from public, anon, authenticated;

-- conta um uso na janela atual; false = passou do limite (e não conta)
create or replace function public.freio_rede_passa(p_chave text, p_janela interval, p_limite integer) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_ini timestamptz := date_bin(p_janela, now(), timestamptz '2000-01-01 00:00:00+00'); v_n integer;
begin
  if p_chave is null or coalesce(p_limite, 0) <= 0 then return p_chave is null; end if;
  insert into public.freios_rede as f (chave, janela, n) values (p_chave, v_ini, 1)
  on conflict (chave, janela) do update set n = f.n + 1 where f.n < p_limite
  returning f.n into v_n;
  if v_n = 1 and random() < 0.05 then delete from public.freios_rede where janela < now() - interval '2 days'; end if;
  return v_n is not null;
end $$;
revoke execute on function public.freio_rede_passa(text, interval, integer) from public, anon, authenticated;

-- Consulta anônima do link (quem chama com a chave pública): até config_interna link_freio_<tipo>_hora por hora, por rede,
-- em cada pet shop. A equipe (com login) e o servidor com a chave de serviço não passam por aqui. Sem cabeçalho de IP: passa.
create or replace function public.link_freio_anonimo(p_tipo text, p_loja uuid, p_padrao integer) returns void
language plpgsql volatile security definer set search_path = '' as $$
declare v_ip text;
begin
  if coalesce((select auth.role()), '') <> 'anon' or p_loja is null then return; end if;
  v_ip := public.rede_ip();
  if v_ip is null then return; end if;
  if not public.freio_rede_passa(p_tipo || ':' || p_loja::text || ':' || public.rede_chave(v_ip), interval '1 hour',
                                 public.link_limite('link_freio_' || p_tipo || '_hora', p_padrao)) then
    raise exception 'Muitas consultas agora. Espere alguns minutos e tente de novo.' using errcode = 'PT429';
  end if;
end $$;
revoke execute on function public.link_freio_anonimo(text, uuid, integer) from public, anon, authenticated;

-- ============================================================
-- 4b. Tirar dúvida do link: freio por rede e teto do teste
-- ============================================================
-- novo parâmetro com padrão: o servidor de antes chama com os dois de antes
drop function if exists public.link_ia_contar(text, text);
create or replace function public.link_ia_contar(p_codigo text, p_segredo text default null, p_rede text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_dia date; v_lim int; v_n int; v_rede text; v_recusa text;
begin
  if not public.servidor_segredo_ok(p_segredo) then return jsonb_build_object('ok', false, 'motivo', 'recusado'); end if;
  select p.id, (now() at time zone p.fuso)::date into v_id, v_dia
  from public.petshops p
  where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id) and p.opcoes -> 'link.ia' = 'true'::jsonb;
  if v_id is null then return jsonb_build_object('ok', false, 'motivo', 'desligado'); end if;
  v_lim := public.link_limite('link_ia_dia', 100);
  if v_lim <= 0 then return jsonb_build_object('ok', false, 'motivo', 'limite'); end if;
  -- (20261245) teste grátis: e-mail do dono provado e o teto dos pet shops em teste
  v_recusa := public.ia_teste_recusa(v_id, 'link_ia');
  if v_recusa is not null then return jsonb_build_object('ok', false, 'motivo', case v_recusa when 'email' then 'limite' else v_recusa end); end if;
  -- teto de todos os pet shops juntos
  if public.ia_uso_geral('link_ia') >= public.ia_teto_geral('link_ia') then return jsonb_build_object('ok', false, 'motivo', 'geral'); end if;
  -- (20261245) a mesma rede (o IP que o servidor viu, que só vale com o segredo) não gasta a cota do pet shop sozinha
  v_rede := public.rede_chave(p_rede);
  if v_rede is not null and p_segredo is not null and public.servidor_segredo_confere(p_segredo) then
    if not public.freio_rede_passa('link_ia_dia:' || v_id::text || ':' || v_rede, interval '1 day', public.link_limite('link_ia_rede_dia', 40))
       or not public.freio_rede_passa('link_ia_hora:' || v_id::text || ':' || v_rede, interval '1 hour', public.link_limite('link_ia_rede_hora', 20)) then
      return jsonb_build_object('ok', false, 'motivo', 'rede');
    end if;
  end if;
  insert into public.link_ia_uso as u (petshop_id, dia, perguntas) values (v_id, v_dia, 1)
  on conflict (petshop_id, dia) do update set perguntas = u.perguntas + 1 where u.perguntas < v_lim
  returning u.perguntas into v_n;
  if v_n is null then return jsonb_build_object('ok', false, 'motivo', 'limite'); end if;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.link_ia_contar(text, text, text) from public;
grant execute on function public.link_ia_contar(text, text, text) to anon, authenticated, service_role;

-- ============================================================
-- 4c. Consultas anônimas do link com freio por rede
-- ============================================================
CREATE OR REPLACE FUNCTION public.link_horarios(p_codigo text, p_servico uuid, p_dia date, p_pets integer DEFAULT 1, p_extras jsonb DEFAULT NULL::jsonb)
 RETURNS SETOF text
 LANGUAGE plpgsql
 VOLATILE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v public.petshops;
  v_dur int;
  v_h jsonb;
  v_al jsonb;
  v_abre int;
  v_fecha int;
  v_ai int;
  v_af int;
  m int;
  v_ini timestamptz;
  n int := least(4, greatest(1, coalesce(p_pets, 1)));
  v_extras uuid[];
  v_loja boolean := false;
  x record;
begin
  select * into v from public.petshops where link_codigo = p_codigo and link_ativo;
  if not found or not public.acesso_liberado(v.id) then return; end if;
  -- (20261245) freio por rede de quem consulta sem login
  perform public.link_freio_anonimo('horarios', v.id, 600);
  v_extras := public.link_extras(v.id, p_servico, p_extras);
  if v_extras is null then return; end if;
  select duracao_min into v_dur from public.servicos where id = p_servico and petshop_id = v.id and ativo and categoria not in ('creche', 'hotel');
  if not found then return; end if;
  -- cada pet faz todos os serviços, um depois do outro; os pets também vêm um depois do outro
  v_dur := least(1440, v_dur + coalesce((select sum(s.duracao_min) from public.servicos s where s.id = any (v_extras) and s.petshop_id = v.id), 0)::int) * n;
  if p_dia < (now() at time zone v.fuso)::date or p_dia > (now() at time zone v.fuso)::date + 60 then return; end if;
  if public.dia_fechado(v.id, p_dia) then return; end if;
  -- a janela do dia: a parte em que todos os serviços escolhidos funcionam
  v_abre := 0;
  v_fecha := 1440;
  for x in select s.horario is null as da_loja, coalesce(s.horario, v.horario) -> (extract(dow from p_dia)::int)::text as dia
           from public.servicos s where s.petshop_id = v.id and (s.id = p_servico or s.id = any (v_extras)) loop
    v_h := x.dia;
    if v_h is null or jsonb_typeof(v_h) <> 'object' or coalesce(v_h ->> 'abre', '') !~ '^\d{2}:\d{2}' or coalesce(v_h ->> 'fecha', '') !~ '^\d{2}:\d{2}' then
      return;
    end if;
    v_abre := greatest(v_abre, extract(hour from (v_h ->> 'abre')::time)::int * 60 + extract(minute from (v_h ->> 'abre')::time)::int);
    v_fecha := least(v_fecha, extract(hour from (v_h ->> 'fecha')::time)::int * 60 + extract(minute from (v_h ->> 'fecha')::time)::int);
    v_loja := v_loja or x.da_loja;
  end loop;
  -- o almoço do pet shop (só vale no dia em que o pet shop abre antes e continua aberto depois, como na tela)
  v_h := v.horario -> (extract(dow from p_dia)::int)::text;
  if v_loja and v_h is not null and jsonb_typeof(v_h) = 'object' then
    v_al := v_h -> 'almoco';
    if v_al is not null and jsonb_typeof(v_al) = 'object' and (v_al ->> 'de') ~ '^\d{2}:\d{2}' and (v_al ->> 'ate') ~ '^\d{2}:\d{2}' then
      v_ai := left(v_al ->> 'de', 2)::int * 60 + substr(v_al ->> 'de', 4, 2)::int;
      v_af := left(v_al ->> 'ate', 2)::int * 60 + substr(v_al ->> 'ate', 4, 2)::int;
      if not (v_af > v_ai
              and extract(hour from (v_h ->> 'abre')::time)::int * 60 + extract(minute from (v_h ->> 'abre')::time)::int < v_ai
              and extract(hour from (v_h ->> 'fecha')::time)::int * 60 + extract(minute from (v_h ->> 'fecha')::time)::int > v_af) then
        v_ai := null;
      end if;
    end if;
  end if;
  m := v_abre;
  while m + v_dur <= v_fecha loop
    v_ini := (p_dia::timestamp + make_interval(mins => m)) at time zone v.fuso;
    if (v_ai is null or m >= v_af or m + v_dur <= v_ai)
       and v_ini >= now() + interval '2 hours' and public.link_vaga(v.id, v_ini, v_ini + make_interval(mins => v_dur)) then
      return next to_char(m / 60, 'FM00') || ':' || to_char(m % 60, 'FM00');
    end if;
    m := m + 30;
  end loop;
end $function$;

create or replace function public.link_hotel_estimativa(p_codigo text, p_entrada date, p_saida date, p_pets jsonb, p_juntos boolean default true)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  s public.petshops;
  v_sinal jsonb; v_pct numeric; v_fixo numeric;
  v_pets jsonb := '[]'::jsonb; v_noites jsonb; v_total numeric := 0; v_sinal_total numeric := 0; v_tem_sinal boolean := false;
  v_tot numeric; v_base numeric; v_sin numeric; v_varia boolean := false; v_desc boolean := false;
  r record; n record;
begin
  select * into s from public.petshops where link_codigo = p_codigo and link_ativo;
  if not found or not public.acesso_liberado(s.id) or not s.link_hotel then return null; end if;
  -- (20261245) freio por rede de quem consulta sem login
  perform public.link_freio_anonimo('hotel_estimativa', s.id, 600);
  if s.opcoes -> 'hotel.link_sem_preco' = 'true'::jsonb then return null; end if;
  if p_entrada is null or p_saida is null or p_saida <= p_entrada or p_saida > p_entrada + 60 then return null; end if;
  if p_pets is null or jsonb_typeof(p_pets) <> 'array' or jsonb_array_length(p_pets) < 1 or jsonb_array_length(p_pets) > 5 then return null; end if;

  v_sinal := s.opcoes -> 'hotel.sinal';
  if v_sinal -> 'ativo' = 'true'::jsonb and jsonb_typeof(v_sinal -> 'valor') = 'number' and (v_sinal ->> 'valor')::numeric > 0 then
    if v_sinal ->> 'modo' = 'valor' then v_fixo := round((v_sinal ->> 'valor')::numeric, 2); else v_pct := (v_sinal ->> 'valor')::numeric; end if;
    v_tem_sinal := true;
  end if;

  for r in
    select t.ord, t.porte, t.base,
      -- lugar na fila de quem paga cheio: diária mais alta primeiro; no empate, a ordem do pedido
      row_number() over (order by t.base desc nulls last, t.ord) as lugar
    from (
      select x.ord, case when x.p ->> 'porte' in ('P', 'M', 'G', 'GG') then x.p ->> 'porte' else null end as porte,
        public.diaria_sugerida(s.id, 'hotel', case when x.p ->> 'porte' in ('P', 'M', 'G', 'GG') then x.p ->> 'porte' else null end) as base
      from jsonb_array_elements(p_pets) with ordinality as x(p, ord)
    ) t
    order by t.ord
  loop
    if r.base is null then return null; end if;
    v_noites := '[]'::jsonb; v_tot := 0;
    for i in 0 .. (p_saida - p_entrada) - 1 loop
      select * into n from public.hotel_noite(s.id, p_entrada + i, r.base, coalesce(p_juntos, true) and r.lugar > 1);
      v_tot := v_tot + n.valor;
      v_varia := v_varia or n.marca is not null;
      v_desc := v_desc or n.desconto > 0;
      v_noites := v_noites || jsonb_build_object('dia', p_entrada + i, 'valor', n.valor, 'cheia', n.cheia, 'desconto', n.desconto, 'marca', n.marca);
    end loop;
    v_sin := case when v_fixo is not null then v_fixo when v_pct is not null and v_tot > 0 then round(v_tot * v_pct / 100, 2) else null end;
    v_sinal_total := v_sinal_total + coalesce(v_sin, 0);
    v_total := v_total + v_tot;
    v_pets := v_pets || jsonb_build_object('porte', r.porte, 'diaria', r.base, 'total', v_tot, 'sinal', v_sin, 'noites', v_noites);
  end loop;

  return jsonb_build_object(
    'noites', p_saida - p_entrada, 'pets', v_pets, 'total', v_total,
    -- alguma noite saiu diferente da diária comum (temporada ou feriado) / teve desconto do segundo pet
    'varia', v_varia, 'desconto', v_desc,
    'sinal', case when v_tem_sinal and v_sinal_total > 0 then v_sinal_total else null end);
end $$;

-- era uma função sql (stable): vira plpgsql para contar a consulta antes de responder; a resposta é a mesma
create or replace function public.link_estadia_cheios(p_codigo text, p_tipo text, p_de date, p_ate date)
returns setof date
language plpgsql volatile security definer set search_path = '' as $$
declare v_loja uuid;
begin
  select p.id into v_loja from public.petshops p where p.link_codigo = p_codigo and p.link_ativo;
  if v_loja is null then return; end if;
  -- (20261245) freio por rede de quem consulta sem login
  perform public.link_freio_anonimo('estadia_cheios', v_loja, 600);
  return query
  select d::date
  from public.petshops p, generate_series(p_de, least(p_ate, p_de + 62), interval '1 day') d
  where p.link_codigo = p_codigo and p.link_ativo and p_tipo in ('creche', 'hotel')
    and ((p_tipo = 'creche' and (not public.creche_abre(coalesce(p.horario_creche, p.horario), d::date) or public.dia_fechado(p.id, d::date)))
     or ((case p_tipo when 'creche' then p.vagas_creche else p.vagas_hotel end) is not null
    and (
      (select count(*) from public.estadias e where e.petshop_id = p.id and e.tipo = p_tipo and e.status in ('reservada', 'em_casa')
         and public.estadia_ocupa(e.tipo, e.status, (e.entrada at time zone p.fuso)::date, (e.saida_prevista at time zone p.fuso)::date, d::date, (now() at time zone p.fuso)::date))
      + (select count(*) from public.pedidos_agendamento x where x.petshop_id = p.id and x.tipo = p_tipo and x.status = 'pendente'
         and public.estadia_ocupa(x.tipo, 'reservada', (x.inicio at time zone p.fuso)::date, (x.fim at time zone p.fuso)::date, d::date, (now() at time zone p.fuso)::date))
      + (case when p_tipo = 'creche' then public.creche_planos_ocupam(p.id, d::date, (now() at time zone p.fuso)::date) else 0 end)
    ) >= (case p_tipo when 'creche' then p.vagas_creche else p.vagas_hotel end)));
end $$;

-- ============================================================
-- 3. IP e navegador dos aceites públicos
-- ============================================================
-- novo parâmetro com padrão: o servidor de antes chama com os três de antes
drop function if exists public.boletim_autorizar(text, text, text);
create or replace function public.boletim_autorizar(p_token text, p_escopo text, p_marcar text, p_segredo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.boletins; s public.petshops; p public.pets; f public.fotos_autorizacoes; v_marcar text; v_dia date; v_cab jsonb; v_ip text; v_nav text;
begin
  b := public.boletim_do_codigo(p_token);
  if b.id is null then raise exception 'Este boletim não está mais no ar.'; end if;
  if p_escopo is null or p_escopo not in ('boletim', 'todas') then raise exception 'Escolha quais fotos podemos postar.'; end if;
  perform public.boletim_frear(b.id, 'autorizar', 5);
  perform public.fotos_autorizacao_frear('loja:' || b.petshop_id::text, 60);
  v_marcar := public.foto_autorizacao_marcar(p_marcar);
  perform pg_advisory_xact_lock(hashtext('foto_autorizacao' || b.pet_id::text));
  select * into s from public.petshops where id = b.petshop_id;
  select * into p from public.pets where id = b.pet_id;
  v_dia := (b.criado_em at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date;
  -- (20261245) quem autorizou: o IP e o navegador que o servidor da página repassa (x-maestro-ip, x-maestro-navegador) só
  -- valem com o segredo do servidor; sem ele, o endereço que o banco vê (o da Cloudflare primeiro) e o navegador do pedido
  begin v_cab := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then v_cab := null; end;
  if public.servidor_segredo_confere(p_segredo) then
    v_ip := nullif(left(trim(split_part(coalesce(v_cab ->> 'x-maestro-ip', ''), ',', 1)), 64), '');
    v_nav := nullif(left(coalesce(v_cab ->> 'x-maestro-navegador', ''), 300), '');
  end if;
  v_ip := coalesce(v_ip, public.rede_ip());
  v_nav := coalesce(v_nav, nullif(left(coalesce(v_cab ->> 'user-agent', ''), 300), ''));

  select * into f from public.fotos_autorizacoes x
   where x.petshop_id = b.petshop_id and x.pet_id = b.pet_id and x.retirado_em is null and x.escopo = p_escopo
     and (p_escopo = 'todas' or x.boletim_id = b.id) and x.marcar is not distinct from v_marcar
   order by x.autorizado_em desc limit 1;
  if f.id is null then
    update public.fotos_autorizacoes x set retirado_em = now(), retirado_motivo = 'trocada'
     where x.petshop_id = b.petshop_id and x.pet_id = b.pet_id and x.retirado_em is null
       and (x.escopo = 'todas' and p_escopo = 'todas' or x.escopo = 'boletim' and x.boletim_id = b.id);
    insert into public.fotos_autorizacoes (petshop_id, pet_id, boletim_id, escopo, marcar, texto, codigo, ip, navegador)
    values (b.petshop_id, b.pet_id, b.id, p_escopo, v_marcar, public.foto_autorizacao_texto(s.nome, p.nome, p.sexo, p_escopo, v_marcar, v_dia),
      encode(extensions.gen_random_bytes(32), 'hex'), v_ip, v_nav)
    returning * into f;
  end if;
  return jsonb_build_object('escopo', f.escopo, 'marcar', f.marcar, 'texto', f.texto, 'desde', f.autorizado_em, 'codigo', f.codigo);
end $$;
revoke execute on function public.boletim_autorizar(text, text, text, text) from public;
grant execute on function public.boletim_autorizar(text, text, text, text) to anon, authenticated, service_role;

create or replace function public.entrada_aceitar(p_token text, p_nome text, p_ip text, p_navegador text, p_segredo text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.entradas; v_nome text := trim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')); v_ip text; v_nav text; v_cab jsonb;
begin
  e := public.entrada_do_codigo(p_token);
  if e.id is null then raise exception 'Este link não vale mais. Peça um novo ao pet shop.'; end if;
  perform public.entrada_frear(e.id, 'aceite', 10);
  select * into e from public.entradas o where o.id = e.id for update;
  if e.aceito_em is not null then return jsonb_build_object('aceito_em', e.aceito_em, 'nome', e.aceite_nome, 'ja_estava', true); end if;
  if char_length(v_nome) < 2 or char_length(v_nome) > 120 then raise exception 'Escreva o seu nome.'; end if;
  -- o IP e o navegador informados só valem quando quem chama prova que é o servidor; senão ficam o endereço que o banco vê
  -- e o navegador do pedido (20261245: o navegador também)
  if public.servidor_segredo_confere(p_segredo) then
    v_ip := nullif(left(trim(coalesce(p_ip, '')), 64), '');
    v_nav := nullif(left(coalesce(p_navegador, ''), 300), '');
  else
    begin v_cab := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then v_cab := null; end;
    v_ip := public.rede_ip();
    v_nav := nullif(left(coalesce(v_cab ->> 'user-agent', ''), 300), '');
  end if;
  update public.entradas o set aceite = 'link', aceite_nome = v_nome, aceito_em = now(),
    aceite_ip = v_ip, aceite_navegador = v_nav, atualizado_em = now()
  where o.id = e.id returning * into e;
  return jsonb_build_object('aceito_em', e.aceito_em, 'nome', e.aceite_nome, 'ja_estava', false);
end $$;
revoke execute on function public.entrada_aceitar(text, text, text, text, text) from public;
grant execute on function public.entrada_aceitar(text, text, text, text, text) to anon, authenticated, service_role;

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
  -- (20261245) o endereço como o banco vê, o da Cloudflare primeiro (o x-forwarded-for o cliente consegue mandar)
  v_ip := coalesce(public.rede_ip(), '');
  v_nav := left(coalesce(v_cab ->> 'user-agent', ''), 300);
  insert into public.aceites (user_id, email, documento, versao, origem, ip, navegador)
  select v_uid, (select lower(u.email) from auth.users u where u.id = v_uid), x.d, x.v, 'reaceite', nullif(v_ip, ''), nullif(v_nav, '')
  from (values ('termos', p_termos), ('privacidade', p_privacidade)) as x(d, v)
  on conflict (user_id, documento, versao) where user_id is not null do nothing;
  return (select coalesce(jsonb_agg(jsonb_build_object('documento', a.documento, 'versao', a.versao, 'aceito_em', a.aceito_em) order by a.documento), '[]'::jsonb)
          from public.aceites a where a.user_id = v_uid and ((a.documento = 'termos' and a.versao = p_termos) or (a.documento = 'privacidade' and a.versao = p_privacidade)));
end $$;

-- ============================================================
-- 5. Fotos dos pets: bucket privado
-- ============================================================
update storage.buckets set public = false where id = 'pets';

-- o arquivo é a logo de algum pet shop (a logo aparece nas páginas públicas: link, boletim, página do tutor)
create or replace function public.pets_eh_logo(p_nome text) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_nome is not null and exists (select 1 from public.petshops s where s.logo = p_nome and s.id = public.diario_pasta(p_nome))
$$;
revoke execute on function public.pets_eh_logo(text) from public;
-- a regra do bucket chama com o papel de quem pede (só diz sim ou não)
grant execute on function public.pets_eh_logo(text) to anon, authenticated;

-- a foto do cadastro é de um pet deste tutor? (o bucket pergunta, com o código que veio no cabeçalho x-tutor-token)
create or replace function public.tutor_ve_foto_pet(p_nome text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v_token text; l public.tutor_links;
begin
  begin
    v_token := nullif(current_setting('request.headers', true), '')::json ->> 'x-tutor-token';
  exception when others then return false;
  end;
  if v_token is null then return false; end if;
  l := public.tutor_do_codigo(v_token);
  if l.cliente_id is null then return false; end if;
  return exists (select 1 from public.pets p where p.foto = p_nome and p.petshop_id = l.petshop_id and p.cliente_id = l.cliente_id);
end $$;
revoke execute on function public.tutor_ve_foto_pet(text) from public;
grant execute on function public.tutor_ve_foto_pet(text) to anon, authenticated;

-- A foto do cadastro de um pet deste tutor, pelo código da página (o servidor da página busca o arquivo). Nada quando não vale.
create or replace function public.tutor_pet_foto(p_token text, p_pet uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare l public.tutor_links; v_foto text;
begin
  l := public.tutor_do_codigo(p_token);
  if l.cliente_id is null or p_pet is null then return null; end if;
  perform public.tutor_frear(l.cliente_id, 'foto', 400);
  select p.foto into v_foto from public.pets p where p.id = p_pet and p.petshop_id = l.petshop_id and p.cliente_id = l.cliente_id and p.ativo;
  if v_foto is null then return null; end if;
  return jsonb_build_object('caminho', v_foto);
end $$;
revoke execute on function public.tutor_pet_foto(text, uuid) from public;
grant execute on function public.tutor_pet_foto(text, uuid) to anon, authenticated;

-- quem lê: a equipe do pet shop; a logo, qualquer um; a foto do pet, o tutor dele pelo código da página
drop policy if exists pets_fotos_ler on storage.objects;
create policy pets_fotos_ler on storage.objects for select to authenticated
  using (bucket_id = 'pets' and public.diario_pasta(name) in (select public.meus_petshops()));
drop policy if exists pets_logo_ler on storage.objects;
create policy pets_logo_ler on storage.objects for select to anon, authenticated
  using (bucket_id = 'pets' and public.pets_eh_logo(name));
drop policy if exists pets_tutor_ler on storage.objects;
create policy pets_tutor_ler on storage.objects for select to anon, authenticated
  using (bucket_id = 'pets' and public.tutor_ve_foto_pet(name));

-- quem manda, troca e apaga: quem mexe no cadastro do pet (as áreas de pets_editar); a logo é do dono (que tem todas)
drop policy if exists pets_fotos_enviar on storage.objects;
create policy pets_fotos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'pets' and public.diario_pasta(name) in (select public.meus_petshops())
    and public.tenho_area(public.diario_pasta(name), array['clientes', 'agenda', 'creche_hotel', 'pacotes', 'caixa']));
drop policy if exists pets_fotos_trocar on storage.objects;
create policy pets_fotos_trocar on storage.objects for update to authenticated
  using (bucket_id = 'pets' and public.diario_pasta(name) in (select public.meus_petshops())
    and public.tenho_area(public.diario_pasta(name), array['clientes', 'agenda', 'creche_hotel', 'pacotes', 'caixa']));
drop policy if exists pets_fotos_apagar on storage.objects;
create policy pets_fotos_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'pets' and public.diario_pasta(name) in (select public.meus_petshops())
    and public.tenho_area(public.diario_pasta(name), array['clientes', 'agenda', 'creche_hotel', 'pacotes', 'caixa']));

-- ============================================================
-- 6. Chaves compostas (o id de outro pet shop não entra)
-- ============================================================
do $$
declare v_n bigint;
begin
  select count(*) into v_n from public.lancamentos l join public.lancamentos o on o.id = l.conta_id where o.petshop_id <> l.petshop_id;
  if v_n > 0 then raise exception 'lancamentos.conta_id: % linha(s) apontam para lançamento de outro pet shop. Corrija antes (ver 20261245).', v_n; end if;
  select count(*) into v_n from public.lancamentos l join public.lancamentos o on o.id = l.devolucao_de where o.petshop_id <> l.petshop_id;
  if v_n > 0 then raise exception 'lancamentos.devolucao_de: % linha(s) apontam para lançamento de outro pet shop. Corrija antes (ver 20261245).', v_n; end if;
  select count(*) into v_n from public.lancamentos l join public.lancamentos o on o.id = l.multa_de where o.petshop_id <> l.petshop_id;
  if v_n > 0 then raise exception 'lancamentos.multa_de: % linha(s) apontam para lançamento de outro pet shop. Corrija antes (ver 20261245).', v_n; end if;
  select count(*) into v_n from public.diario_fotos f join public.pets p on p.id = f.pet_id where p.petshop_id <> f.petshop_id;
  if v_n > 0 then raise exception 'diario_fotos.pet_id: % foto(s) de pet de outro pet shop. Corrija antes (ver 20261245).', v_n; end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.lancamentos'::regclass and conname = 'lancamentos_id_petshop_id_key') then
    alter table public.lancamentos add constraint lancamentos_id_petshop_id_key unique (id, petshop_id);
  end if;
end $$;

alter table public.lancamentos drop constraint if exists lancamentos_conta_id_fkey;
alter table public.lancamentos add constraint lancamentos_conta_id_fkey
  foreign key (conta_id, petshop_id) references public.lancamentos (id, petshop_id) on delete set null (conta_id) not valid;
alter table public.lancamentos validate constraint lancamentos_conta_id_fkey;

alter table public.lancamentos drop constraint if exists lancamentos_devolucao_de_fkey;
alter table public.lancamentos add constraint lancamentos_devolucao_de_fkey
  foreign key (devolucao_de, petshop_id) references public.lancamentos (id, petshop_id) on delete set null (devolucao_de) not valid;
alter table public.lancamentos validate constraint lancamentos_devolucao_de_fkey;

alter table public.lancamentos drop constraint if exists lancamentos_multa_de_fkey;
alter table public.lancamentos add constraint lancamentos_multa_de_fkey
  foreign key (multa_de, petshop_id) references public.lancamentos (id, petshop_id) on delete set null (multa_de) not valid;
alter table public.lancamentos validate constraint lancamentos_multa_de_fkey;

alter table public.diario_fotos drop constraint if exists diario_fotos_pet_id_fkey;
alter table public.diario_fotos add constraint diario_fotos_pet_id_fkey
  foreign key (pet_id, petshop_id) references public.pets (id, petshop_id) on delete cascade not valid;
alter table public.diario_fotos validate constraint diario_fotos_pet_id_fkey;

notify pgrst, 'reload schema';
