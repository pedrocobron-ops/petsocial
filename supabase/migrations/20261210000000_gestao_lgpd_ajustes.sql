-- Ajustes da revisão jurídica dos Termos de uso e da Política de privacidade (o que o código faz tem de bater com o texto).
--
-- 1. Registro de acesso (Marco Civil da Internet, art. 15): tabela nova `registros_acesso` (quem, quando, IP e navegador
--    cortado em 300 letras), gravada no login e na abertura do aplicativo (no máximo uma "abertura" por pessoa por dia).
--    Ninguém lê nem grava direto na tabela: grava só pela função registrar_acesso (o IP e o navegador vêm de request.headers,
--    como em aceitar_documentos, 20261197); o administrador lê por admin_registros_acesso (sou_admin()).
--    Sem chave estrangeira para auth.users: o registro fica os 6 meses mesmo se o login for apagado (obrigação legal).
--    A faxina diária (gestao_faxina_banco, pg_cron 'gestao-faxina-diaria' e a rota /api/gestao/faxina) apaga o que tem mais de 6 meses.
-- 2. Apagar os dados de um tutor (cliente_anonimizar, cópia da versão de 20261202500000 com acréscimos):
--    * orçamentos do tutor (cliente_id) ou com o telefone dele: nome e telefone apagados, cliente_id nulo, nomes tirados da observação;
--    * conversas com o Mozart e a Ajuda (`conversas`) do pet shop que citam o nome completo do tutor (4 letras ou mais, sem
--      diferença de maiúsculas) ou os 8 últimos números do telefone dele: apagadas (a conversa não guarda o id do tutor);
--    * histórico do Mozart (`assistente_eventos`) do pet shop com o nome ou o telefone no pedido, ou com o id do tutor ou de um pet
--      dele nos detalhes: apagado.
--    O aniversário do tutor continua saindo pelo gatilho clientes_lgpd_nascimento (20261205).
-- 3. Conversas com o Mozart e a Ajuda (`conversas`) e o histórico do Mozart (`assistente_eventos`): a faxina diária apaga o que
--    tem mais de 12 meses.
-- 4. Autorização de foto: texto novo do padrão (foto_autorizacao_texto, mesmos parâmetros e regras). As autorizações antigas ficam
--    com o texto que o tutor aceitou na época. boletim_autorizar guarda também o IP e o navegador de quem autorizou (colunas novas
--    ip e navegador em fotos_autorizacoes; o servidor da página manda x-maestro-ip e x-maestro-navegador).
-- 5. Checklist de entrada: no aceite (entrada_assinar e entrada_aceitar), um gatilho guarda `aceite_hash`, o SHA-256 (hex) de
--    termo || '\n' || fotos (os caminhos, um por linha, na ordem). Aparece no comprovante. Aceite desfeito: o hash sai junto.
--
-- Funções trocadas (cópia da versão mais nova + acréscimos): gestao_faxina_banco (20261195), cliente_anonimizar (20261202500000),
-- foto_autorizacao_texto (20261196), boletim_autorizar (20261196). entrada_assinar e entrada_aceitar NÃO mudam (o hash vem do gatilho).

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Registro de acesso
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.registros_acesso (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  em timestamptz not null default now(),
  origem text not null check (origem in ('login', 'abertura')),
  ip text check (char_length(ip) <= 64),
  navegador text check (char_length(navegador) <= 300)
);
create index if not exists registros_acesso_quem on public.registros_acesso (user_id, em desc);
create index if not exists registros_acesso_quando on public.registros_acesso (em);

alter table public.registros_acesso enable row level security;
revoke all on public.registros_acesso from public, anon, authenticated;
-- sem regra de acesso: ninguém lê nem grava direto (nem a própria pessoa)

-- O aplicativo chama sem esperar: no login ('login') e ao abrir ('abertura'). Grava no máximo uma abertura por pessoa por dia
-- (fuso de São Paulo) e no máximo um login por minuto. Devolve true se gravou.
create or replace function public.registrar_acesso(p_origem text) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_cab jsonb;
  v_ip text;
  v_nav text;
  v_hoje timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  if v_uid is null or p_origem is null or p_origem not in ('login', 'abertura') then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('registrar_acesso:' || v_uid::text, 0));
  if p_origem = 'abertura' and exists (select 1 from public.registros_acesso r where r.user_id = v_uid and r.em >= v_hoje) then return false; end if;
  if p_origem = 'login' and exists (select 1 from public.registros_acesso r where r.user_id = v_uid and r.origem = 'login' and r.em > now() - interval '1 minute') then
    return false;
  end if;
  begin v_cab := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then v_cab := null; end;
  v_ip := left(trim(split_part(coalesce(v_cab ->> 'cf-connecting-ip', v_cab ->> 'x-forwarded-for', v_cab ->> 'x-real-ip', ''), ',', 1)), 64);
  v_nav := left(coalesce(v_cab ->> 'user-agent', ''), 300);
  insert into public.registros_acesso (user_id, origem, ip, navegador) values (v_uid, p_origem, nullif(v_ip, ''), nullif(v_nav, ''));
  return true;
end $$;
revoke execute on function public.registrar_acesso(text) from public, anon;
grant execute on function public.registrar_acesso(text) to authenticated;

-- Painel do administrador (ou pedido de autoridade): os acessos de um e-mail (ou de um login), os mais novos primeiro.
create or replace function public.admin_registros_acesso(p_email text default null, p_user uuid default null, p_limite integer default 300) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(x) order by x.em desc), '[]'::jsonb) from (
    select r.id, r.user_id, u.email, r.em, r.origem, r.ip, r.navegador
      from public.registros_acesso r left join auth.users u on u.id = r.user_id
     where (p_user is null or r.user_id = p_user)
       and (v_email is null or lower(u.email) = v_email)
     order by r.em desc
     limit greatest(1, least(coalesce(p_limite, 300), 5000))) x);
end $$;
revoke execute on function public.admin_registros_acesso(text, uuid, integer) from public, anon;
grant execute on function public.admin_registros_acesso(text, uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2 e 3. Faxina diária: + registro de acesso (6 meses) e conversas com o assistente (12 meses)
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.gestao_faxina_banco() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_albuns int; v_reservas int; v_acessos int; v_conversas int; v_eventos int;
begin
  v_albuns := public.boletim_faxina_geral();
  delete from public.caderno_reservas r where r.criado_em < now() - interval '1 day';
  get diagnostics v_reservas = row_count;
  -- Marco Civil, art. 15: registro de acesso guardado por 6 meses, depois apagado
  delete from public.registros_acesso r where r.em < now() - interval '6 months';
  get diagnostics v_acessos = row_count;
  -- conversas com o Mozart e a Ajuda, e o histórico do Mozart: 12 meses
  delete from public.conversas c where c.criado_em < now() - interval '12 months';
  get diagnostics v_conversas = row_count;
  delete from public.assistente_eventos e where e.criado_em < now() - interval '12 months';
  get diagnostics v_eventos = row_count;
  return jsonb_build_object('albuns', v_albuns, 'reservas', v_reservas, 'acessos', v_acessos, 'conversas', v_conversas, 'eventos', v_eventos);
end $$;
revoke execute on function public.gestao_faxina_banco() from public, anon, authenticated;
grant execute on function public.gestao_faxina_banco() to service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Apagar os dados de um tutor: + orçamentos e conversas com o assistente
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.cliente_anonimizar(p_cliente uuid, p_confirmacao text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.clientes;
  v_uid uuid := (select auth.uid());
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_pets uuid[];
  v_nomes text[];
  v_fone text;
  v_lancs uuid[];
  v_n_lanc int;
  v_arquivos int := 0;
  v_n int;
  v_orc uuid;
  v_n_orc int := 0;
  v_n_conv int := 0;
  v_nome_busca text;
  v_fone_busca text;
  v_ids text[];
begin
  select * into c from public.clientes where id = p_cliente for update;
  if not found or not public.sou_dono(c.petshop_id) then raise exception 'Cliente não encontrado.'; end if;
  if exists (select 1 from public.lgpd_registros r where r.petshop_id = c.petshop_id and r.acao = 'apagou_tutor' and r.detalhe ->> 'cliente_id' = c.id::text) then
    return jsonb_build_object('ok', true, 'ja', true);
  end if;
  if not public.lgpd_texto_igual(p_confirmacao, c.nome) then
    raise exception 'Digite o nome do tutor igual ao da ficha para confirmar.';
  end if;

  select coalesce(array_agg(p.id), '{}'), coalesce(array_agg(p.nome), '{}') into v_pets, v_nomes
    from public.pets p where p.cliente_id = c.id and p.petshop_id = c.petshop_id;
  v_fone := nullif(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), '');

  -- daqui para baixo é o banco quem mexe (as conferências de "quem pode" dos gatilhos já foram feitas acima):
  -- sem login na transação, os gatilhos não anotam "alterado depois de recebido" nem guardam o texto antigo com o nome.
  perform set_config('maestro.lgpd', '1', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  -- dinheiro: o valor fica; o nome sai do texto e o lançamento deixa de apontar para o tutor
  select coalesce(array_agg(l.id), '{}') into v_lancs from public.lancamentos l
   where l.petshop_id = c.petshop_id
     and (l.cliente_id = c.id
          or l.agendamento_id in (select a.id from public.agendamentos a where a.pet_id = any (v_pets))
          or l.id in (select m.lancamento_id from public.creche_cobrancas m where m.pet_id = any (v_pets) and m.lancamento_id is not null));
  update public.lancamentos l
     set cliente_id = case when l.cliente_id = c.id then null else l.cliente_id end,
         descricao = public.lgpd_trocar_nomes(public.lgpd_trocar_nomes(l.descricao, array[c.nome], 'Cliente removido'), v_nomes, 'Pet removido')
   where l.id = any (v_lancs);
  get diagnostics v_n_lanc = row_count;
  update public.lancamentos_alteracoes a
     set antes = case when a.antes ? 'descricao' and jsonb_typeof(a.antes -> 'descricao') = 'string'
                   then jsonb_set(a.antes, '{descricao}', to_jsonb(public.lgpd_trocar_nomes(public.lgpd_trocar_nomes(a.antes ->> 'descricao', array[c.nome], 'Cliente removido'), v_nomes, 'Pet removido')))
                   else a.antes end,
         depois = case when a.depois ? 'descricao' and jsonb_typeof(a.depois -> 'descricao') = 'string'
                   then jsonb_set(a.depois, '{descricao}', to_jsonb(public.lgpd_trocar_nomes(public.lgpd_trocar_nomes(a.depois ->> 'descricao', array[c.nome], 'Cliente removido'), v_nomes, 'Pet removido')))
                   else a.depois end
   where a.petshop_id = c.petshop_id and a.lancamento_id = any (v_lancs);
  update public.clientes_creditos k set motivo = public.lgpd_trocar_nomes(public.lgpd_trocar_nomes(k.motivo, array[c.nome], 'Cliente removido'), v_nomes, 'Pet removido')
   where k.petshop_id = c.petshop_id and k.cliente_id = c.id;
  update public.precos_alterados x set item = public.lgpd_trocar_nomes(x.item, v_nomes, 'Pet removido')
   where x.petshop_id = c.petshop_id and x.lancamento_id = any (v_lancs);

  -- arquivos: foto do pet, antes e depois, fotos do diário e do boletim vão para a fila da faxina
  insert into public.arquivos_lixo (bucket, caminho, petshop_id, motivo)
  select 'pets', x.caminho, c.petshop_id, 'tutor_apagado' from (
    select p.foto as caminho from public.pets p where p.id = any (v_pets) and p.foto is not null
    union select a.foto_antes from public.agendamentos a where a.pet_id = any (v_pets) and a.foto_antes is not null
    union select a.foto_depois from public.agendamentos a where a.pet_id = any (v_pets) and a.foto_depois is not null) x
  where x.caminho like c.petshop_id::text || '/%'
  on conflict do nothing;
  get diagnostics v_n = row_count; v_arquivos := v_arquivos + v_n;
  insert into public.arquivos_lixo (bucket, caminho, petshop_id, motivo)
  select 'diario', f.caminho, c.petshop_id, 'tutor_apagado' from public.diario_fotos f where f.pet_id = any (v_pets)
  on conflict do nothing;
  get diagnostics v_n = row_count; v_arquivos := v_arquivos + v_n;
  insert into public.arquivos_lixo (bucket, caminho, petshop_id, motivo)
  select 'boletim', u.caminho, c.petshop_id, 'tutor_apagado' from public.boletins b cross join lateral unnest(b.fotos) as u(caminho)
   where b.pet_id = any (v_pets)
  on conflict do nothing;
  get diagnostics v_n = row_count; v_arquivos := v_arquivos + v_n;

  insert into public.arquivos_lixo (bucket, caminho, petshop_id, motivo)
  select 'entrada', f, c.petshop_id, 'tutor_apagado'
    from public.entradas e cross join lateral unnest(e.fotos || case when e.aceite_assinatura is not null then array[e.aceite_assinatura] else '{}'::text[] end) f
   where e.petshop_id = c.petshop_id and e.pet_id = any (v_pets)
  on conflict do nothing;
  get diagnostics v_n = row_count; v_arquivos := v_arquivos + v_n;
  delete from public.entradas where petshop_id = c.petshop_id and pet_id = any (v_pets);
  delete from public.entrada_lixo where petshop_id = c.petshop_id
    and caminho in (select l.caminho from public.arquivos_lixo l where l.bucket = 'entrada' and l.petshop_id = c.petshop_id);
  delete from public.fotos_autorizacoes where pet_id = any (v_pets);
  delete from public.albuns where pet_id = any (v_pets);
  delete from public.boletins where pet_id = any (v_pets);
  delete from public.diario_fotos where pet_id = any (v_pets);
  delete from public.pets_saude where pet_id = any (v_pets);
  delete from public.pets_contatos where petshop_id = c.petshop_id and (cliente_id = c.id or pet_id = any (v_pets));
  delete from public.estadias_retiradas where estadia_id in (select e.id from public.estadias e where e.pet_id = any (v_pets));
  delete from public.estadias_cuidados where estadia_id in (select e.id from public.estadias e where e.pet_id = any (v_pets));
  update public.estadias_diario d set nota = null where d.estadia_id in (select e.id from public.estadias e where e.pet_id = any (v_pets));
  update public.estadias_ocorrencias o set texto = '(texto apagado a pedido do tutor)' where o.pet_id = any (v_pets);
  update public.estadias e set obs = null where e.pet_id = any (v_pets) and e.obs is not null;
  update public.agendamentos a set obs = null, endereco_leva_traz = null, foto_antes = null, foto_depois = null
   where a.pet_id = any (v_pets) and (a.obs is not null or a.endereco_leva_traz is not null or a.foto_antes is not null or a.foto_depois is not null);
  update public.creche_planos k set obs = null where k.pet_id = any (v_pets) and k.obs is not null;
  update public.creche_cobrancas k set obs = null where k.pet_id = any (v_pets) and k.obs is not null;
  delete from public.tutor_links where cliente_id = c.id;
  delete from public.tutor_acessos where cliente_id = c.id;
  update public.lista_espera w set pet_nome = 'Pet removido', tutor_nome = 'Cliente removido', telefone = null, obs = null
   where w.petshop_id = c.petshop_id and (w.pet_id = any (v_pets) or (v_fone is not null and regexp_replace(coalesce(w.telefone, ''), '\D', '', 'g') = v_fone));
  delete from public.pedidos_agendamento d
   where d.petshop_id = c.petshop_id and v_fone is not null and regexp_replace(d.telefone, '\D', '', 'g') = v_fone;

  -- (20261210) orçamentos do tutor ou com o telefone dele: o valor e os itens ficam; nome, telefone e ligação com a ficha saem.
  -- O gatilho orcamento_conferir só deixa mexer em orçamento convertido com a marca maestro.orcamento_marcar dele.
  for v_orc in select o.id from public.orcamentos o
                where o.petshop_id = c.petshop_id
                  and (o.cliente_id = c.id
                       or (v_fone is not null and regexp_replace(coalesce(o.telefone, ''), '\D', '', 'g') = v_fone)
                       or (v_fone is not null and char_length(v_fone) >= 10
                           and right(regexp_replace(coalesce(o.telefone, ''), '\D', '', 'g'), 10) = right(v_fone, 10)))
                for update loop
    perform set_config('maestro.orcamento_marcar', v_orc::text, true);
    update public.orcamentos o set nome = null, telefone = null, cliente_id = null,
           obs = public.lgpd_trocar_nomes(public.lgpd_trocar_nomes(o.obs, array[c.nome], 'Cliente removido'), v_nomes, 'Pet removido')
     where o.id = v_orc;
    v_n_orc := v_n_orc + 1;
  end loop;
  perform set_config('maestro.orcamento_marcar', '', true);

  -- (20261210) conversas com o Mozart e a Ajuda deste pet shop que citam o tutor: apagadas. A conversa não guarda o id do tutor,
  -- então a busca é pelo nome completo (sem diferença de maiúsculas) ou pelo telefone (só os números, 8 dígitos ou mais).
  -- No histórico do Mozart (assistente_eventos) também pelo id do tutor ou de um pet dele nos detalhes.
  v_nome_busca := nullif(lower(btrim(regexp_replace(c.nome, '\s+', ' ', 'g'))), '');
  if char_length(coalesce(v_nome_busca, '')) < 4 then v_nome_busca := null; end if;
  -- os 8 últimos números do telefone: estão lá com ou sem DDD, com ou sem +55, com traço, ponto ou espaço
  v_fone_busca := case when char_length(coalesce(v_fone, '')) >= 8 then right(v_fone, 8) end;
  v_ids := array[c.id::text] || coalesce((select array_agg(x::text) from unnest(v_pets) x), '{}');
  if v_nome_busca is not null or v_fone_busca is not null then
    delete from public.conversas k
     where k.petshop_id = c.petshop_id
       and ((v_nome_busca is not null and strpos(lower(regexp_replace(coalesce(k.pergunta, '') || ' ' || coalesce(k.resposta, ''), '\s+', ' ', 'g')), v_nome_busca) > 0)
         or (v_fone_busca is not null and strpos(regexp_replace(coalesce(k.pergunta, '') || ' ' || coalesce(k.resposta, ''), '\D', '', 'g'), v_fone_busca) > 0));
    get diagnostics v_n_conv = row_count;
  end if;
  delete from public.assistente_eventos k
   where k.petshop_id = c.petshop_id
     and ((v_nome_busca is not null and strpos(lower(regexp_replace(coalesce(k.pedido, '') || ' ' || coalesce(k.detalhes::text, ''), '\s+', ' ', 'g')), v_nome_busca) > 0)
       or (v_fone_busca is not null and strpos(regexp_replace(coalesce(k.pedido, '') || ' ' || coalesce(k.detalhes::text, ''), '\D', '', 'g'), v_fone_busca) > 0)
       or (k.detalhes is not null and exists (select 1 from unnest(v_ids) i where strpos(k.detalhes::text, i) > 0)));
  get diagnostics v_n = row_count; v_n_conv := v_n_conv + v_n;

  update public.pets p set nome = 'Pet removido', raca = null, nascimento = null, alertas = null, obs = null, foto = null, ativo = false
   where p.id = any (v_pets);
  update public.clientes set nome = 'Cliente removido', telefone = null, email = null, endereco = null, obs = null where id = c.id;

  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  perform set_config('maestro.lgpd', '', true);

  insert into public.lgpd_registros (petshop_id, quem, quem_nome, acao, detalhe)
  values (c.petshop_id, v_uid, (select x.nome from public.profissionais x where x.petshop_id = c.petshop_id and x.user_id = v_uid limit 1), 'apagou_tutor',
          jsonb_build_object('cliente_id', c.id, 'pets', cardinality(v_pets), 'lancamentos', v_n_lanc, 'arquivos', v_arquivos,
                             'orcamentos', v_n_orc, 'conversas', v_n_conv));
  return jsonb_build_object('ok', true, 'pets', cardinality(v_pets), 'lancamentos', v_n_lanc, 'arquivos', v_arquivos,
                            'orcamentos', v_n_orc, 'conversas', v_n_conv);
end $$;
revoke execute on function public.cliente_anonimizar(uuid, text) from public, anon, authenticated;
grant execute on function public.cliente_anonimizar(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Autorização para postar a foto: texto novo, IP e navegador
-- ---------------------------------------------------------------------------------------------------------------------
-- Mesmos parâmetros e regras de antes (do/da/de pelo sexo, data do boletim, @ ou "Sem marcar"). Só o texto muda.
create or replace function public.foto_autorizacao_texto(p_loja text, p_pet text, p_sexo text, p_escopo text, p_marcar text, p_dia date)
returns text language sql immutable set search_path = '' as $$
  select 'Autorizo ' || p_loja || ' a postar nas redes sociais da loja, sem cobrar nada, '
    || case when p_escopo = 'boletim'
         then 'as fotos ' || case p_sexo when 'M' then 'do' when 'F' then 'da' else 'de' end || ' ' || p_pet || ' deste boletim (' || to_char(p_dia, 'DD/MM/YYYY') || ')'
         else 'as fotos ' || case p_sexo when 'M' then 'do' when 'F' then 'da' else 'de' end || ' ' || p_pet || ' deste boletim e das próximas visitas' end
    || ', para mostrar o trabalho da loja. As fotos não serão vendidas nem usadas por outras empresas.'
    || ' Se aparecer alguém na foto, a loja só posta com a autorização dessa pessoa. '
    || case when p_marcar is null then 'Sem marcar o meu perfil.' else 'Pode marcar o meu perfil ' || p_marcar || '.' end
    || ' Posso tirar esta autorização quando quiser, pelo link "Não quero mais".'
$$;
revoke execute on function public.foto_autorizacao_texto(text, text, text, text, text, date) from public, anon, authenticated;

alter table public.fotos_autorizacoes add column if not exists ip text check (char_length(ip) <= 64);
alter table public.fotos_autorizacoes add column if not exists navegador text check (char_length(navegador) <= 300);
-- a equipe lê a autorização como antes; o IP e o navegador ficam para prova (painel do administrador / pedido do dono)

create or replace function public.boletim_autorizar(p_token text, p_escopo text, p_marcar text) returns jsonb
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
  -- (20261210) quem autorizou: o servidor da página repassa o IP e o navegador do tutor; sem eles, os do pedido
  begin v_cab := nullif(current_setting('request.headers', true), '')::jsonb; exception when others then v_cab := null; end;
  v_ip := nullif(left(trim(split_part(coalesce(v_cab ->> 'x-maestro-ip', v_cab ->> 'cf-connecting-ip', v_cab ->> 'x-forwarded-for', v_cab ->> 'x-real-ip', ''), ',', 1)), 64), '');
  v_nav := nullif(left(coalesce(v_cab ->> 'x-maestro-navegador', v_cab ->> 'user-agent', ''), 300), '');

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
revoke execute on function public.boletim_autorizar(text, text, text) from public, anon, authenticated;
grant execute on function public.boletim_autorizar(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Checklist de entrada: hash do que foi aceito
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.entradas add column if not exists aceite_hash text check (aceite_hash ~ '^[0-9a-f]{64}$');

-- termo || '\n' || caminhos das fotos (um por linha, na ordem), em UTF-8, SHA-256 em hexadecimal
create or replace function public.entrada_hash(p_termo text, p_fotos text[]) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(coalesce(p_termo, '') || E'\n' || array_to_string(coalesce(p_fotos, '{}'::text[]), E'\n'), 'UTF8')), 'hex')
$$;
revoke execute on function public.entrada_hash(text, text[]) from public, anon, authenticated;

create or replace function public.entrada_aceite_hash() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.aceito_em is null then
    new.aceite_hash := null;
  elsif tg_op = 'INSERT' or old.aceito_em is null or old.aceito_em is distinct from new.aceito_em then
    new.aceite_hash := public.entrada_hash(new.termo, new.fotos);
  else
    -- ninguém grava a coluna direto (sem permissão de update); um aceite antigo sem hash ganha o dele na primeira gravação
    new.aceite_hash := coalesce(old.aceite_hash, public.entrada_hash(new.termo, new.fotos));
  end if;
  return new;
end $$;
revoke execute on function public.entrada_aceite_hash() from public, anon, authenticated;
drop trigger if exists entrada_aceite_hash on public.entradas;
create trigger entrada_aceite_hash before insert or update on public.entradas
  for each row execute function public.entrada_aceite_hash();

-- aceites já feitos: o hash do que está guardado (o termo e as fotos não mudam depois do aceite)
update public.entradas set aceite_hash = null where aceito_em is not null and aceite_hash is null;

notify pgrst, 'reload schema';
