-- Maestro Pet Gestão — privacidade (LGPD), rodada 9. Trabalho técnico de conformidade; não é parecer jurídico.
--
-- Só acrescenta (tabelas, funções e gatilhos novos) ou troca funções mantendo os parâmetros. O código que está no ar segue
-- funcionando neste banco: admin_conversas continua existindo (devolve as mesmas chaves, com o texto vazio).
--
-- 1. Uma só limpeza do tutor (lgpd_limpar_tutor), usada por "Apagar dados deste tutor" (cliente_anonimizar) e por "Excluir
--    de vez" (gatilho clientes_lgpd_ao_excluir, que também cobre o cliente apagado direto no banco).
--    A mais do que antes: endereço do leva e traz, cuidados e avisos da estadia; pedido pelo link feito com outro telefone
--    (pelo horário, pela estadia ou pelo nome completo); lista de espera pelo nome; freio do link (link_envios); rascunhos.
-- 2. Fotos do bucket 'pets' que saem de uso vão para a fila arquivos_lixo pelo banco (gatilhos em pets, agendamentos e
--    petshops), não mais pelo navegador: foto trocada, foto tirada, ficha apagada. A faxina (gestao_faxina_lgpd) também põe
--    na fila a foto com mais de 1 dia que nenhuma ficha usa (formulário cancelado). gestao_lgpd_arquivos nunca devolve para
--    apagar um arquivo do bucket 'pets' que alguma ficha ainda usa.
-- 3. Painel da equipe Maestro Pet: admin_conversas passa a devolver só números e metadados (sem o texto). Ler uma conversa
--    exige admin_conversa_abrir(conversa, motivo), que grava quem, quando e por quê em equipe_maestro_acessos; o dono do pet
--    shop vê a lista por equipe_maestro_acessos_ver. admin_conversas_numeros: contagens, ferramentas, erros e tokens.
-- 4. Documentos: versão 2.4 dos Termos e da Política (documentos_versoes). Quem vende (nome e documento) é lido pelos
--    documentos da função gestao_vendedor() da migração 20261237 (config_interna, chaves vendedor_*): nada aqui.
-- 5. Dados do titular: cliente_dados com lista de espera, recado do pedido, checklist de entrada, orçamentos, prêmios, fotos
--    (lista) e o que faltava nas estadias e no cadastro. meus_dados(): o que guardamos de cada pessoa com login.
--    meu_login_apagar(): quem não está em nenhum pet shop apaga o próprio login (fila logins_lixo).
--    gestao_faxina_lgpd(): freio do link 2 dias, pedidos pelo link que não viraram horário 90 dias, fotos sem ficha.
-- 6. Login dividido com outro produto do mesmo projeto: login_fora_do_gestao(user) olha, pelo catálogo, se o login tem
--    linha em tabela que não é do Gestão (ou arquivo em bucket que não é do Gestão). Se tem, ou se não deu para saber, o
--    login NÃO é apagado e fica anotado em logins_mantidos para a equipe ver. Vale para gestao_loja_apagar (copiada da
--    20261229, com essa conferência a mais), para a fila gestao_logins_lixo (20261229) e para meu_login_apagar.
--
-- Funções trocadas (copiadas da última definição):
--   cliente_anonimizar (20261210) · cliente_dados (20261222) · gestao_lgpd_arquivos (20261199) · admin_conversas (20261120)
--   gestao_loja_apagar (20261229) · gestao_logins_lixo (20261229)

-- ---------------------------------------------------------------------------------------------------------------------
-- 0. Motivos novos nas filas e no registro
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.arquivos_lixo drop constraint if exists arquivos_lixo_motivo_check;
alter table public.arquivos_lixo add constraint arquivos_lixo_motivo_check
  check (motivo in ('tutor_apagado', 'conta_apagada', 'tutor_excluido', 'foto_trocada', 'ficha_apagada', 'sem_ficha'));
alter table public.lgpd_registros drop constraint if exists lgpd_registros_acao_check;
alter table public.lgpd_registros add constraint lgpd_registros_acao_check
  check (acao in ('baixou_dados', 'baixou_tutor', 'apagou_tutor', 'pediu_exclusao', 'cancelou_exclusao', 'saiu_da_equipe', 'conta_apagada',
                  'copia_completa', 'excluiu_tutor', 'exportou_clientes'));
create index if not exists agendamentos_foto_antes on public.agendamentos (foto_antes) where foto_antes is not null;
create index if not exists agendamentos_foto_depois on public.agendamentos (foto_depois) where foto_depois is not null;
create index if not exists pets_foto on public.pets (foto) where foto is not null;

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Uma só limpeza do tutor
-- ---------------------------------------------------------------------------------------------------------------------
-- p_modo: 'apagar' (a ficha fica, sem os dados pessoais) ou 'excluir' (a ficha vai ser apagada logo em seguida).
-- p_indiretos: também o que não aponta para a ficha e é achado pelo telefone ou pelo nome completo (pedidos pelo link,
-- lista de espera, orçamentos, conversas, freio do link, rascunhos).
-- Só é chamada por cliente_anonimizar e pelo gatilho de exclusão: ninguém chama direto.
create or replace function public.lgpd_limpar_tutor(c public.clientes, p_modo text, p_indiretos boolean default true) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  v_pets uuid[];
  v_nomes text[];
  v_fone text;
  v_fone_so_dele boolean;
  v_nome_so_dele boolean;
  v_lancs uuid[];
  v_ags uuid[];
  v_ests uuid[];
  v_n_lanc int := 0;
  v_arquivos int := 0;
  v_n int;
  v_orc uuid;
  v_n_orc int := 0;
  v_n_conv int := 0;
  v_n_ped int := 0;
  v_nome_busca text;
  v_fone_busca text;
  v_ids text[];
  v_motivo text := case when p_modo = 'excluir' then 'tutor_excluido' else 'tutor_apagado' end;
begin
  select coalesce(array_agg(p.id), '{}'), coalesce(array_agg(p.nome), '{}') into v_pets, v_nomes
    from public.pets p where p.cliente_id = c.id and p.petshop_id = c.petshop_id;
  select coalesce(array_agg(a.id), '{}') into v_ags from public.agendamentos a where a.pet_id = any (v_pets);
  select coalesce(array_agg(e.id), '{}') into v_ests from public.estadias e where e.pet_id = any (v_pets);
  v_fone := nullif(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), '');
  -- duas fichas com o mesmo telefone (mãe e filha) ou o mesmo nome: o que é achado só por um deles pode ser da outra
  -- pessoa. Telefone dividido: só sai o que também tem o nome igual. Nome repetido: não serve para achar.
  v_fone_so_dele := v_fone is not null and not exists (select 1 from public.clientes o where o.petshop_id = c.petshop_id and o.id <> c.id
    and regexp_replace(coalesce(o.telefone, ''), '\D', '', 'g') = v_fone);
  v_nome_so_dele := char_length(btrim(coalesce(c.nome, ''))) >= 5 and position(' ' in btrim(c.nome)) > 0 and c.nome <> 'Cliente removido'
    and not exists (select 1 from public.clientes o where o.petshop_id = c.petshop_id and o.id <> c.id and public.lgpd_texto_igual(o.nome, c.nome));

  -- daqui para baixo é o banco quem mexe (quem pode já foi conferido por quem chamou): sem login na transação, os gatilhos
  -- não anotam "alterado depois de recebido" nem guardam o texto antigo com o nome.
  perform set_config('maestro.lgpd', '1', true);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  -- dinheiro: o valor fica; o nome sai do texto e o lançamento deixa de apontar para o tutor
  select coalesce(array_agg(l.id), '{}') into v_lancs from public.lancamentos l
   where l.petshop_id = c.petshop_id
     and (l.cliente_id = c.id
          or l.agendamento_id = any (v_ags)
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

  -- arquivos: foto do pet, antes e depois, fotos do diário, do boletim e do checklist vão para a fila da faxina
  insert into public.arquivos_lixo (bucket, caminho, petshop_id, motivo)
  select 'pets', x.caminho, c.petshop_id, v_motivo from (
    select p.foto as caminho from public.pets p where p.id = any (v_pets) and p.foto is not null
    union select a.foto_antes from public.agendamentos a where a.pet_id = any (v_pets) and a.foto_antes is not null
    union select a.foto_depois from public.agendamentos a where a.pet_id = any (v_pets) and a.foto_depois is not null) x
  where x.caminho like c.petshop_id::text || '/%'
  on conflict (bucket, caminho) do update set motivo = excluded.motivo;
  get diagnostics v_n = row_count; v_arquivos := v_arquivos + v_n;
  insert into public.arquivos_lixo (bucket, caminho, petshop_id, motivo)
  select 'diario', f.caminho, c.petshop_id, v_motivo from public.diario_fotos f where f.pet_id = any (v_pets)
  on conflict do nothing;
  get diagnostics v_n = row_count; v_arquivos := v_arquivos + v_n;
  insert into public.arquivos_lixo (bucket, caminho, petshop_id, motivo)
  select 'boletim', u.caminho, c.petshop_id, v_motivo from public.boletins b cross join lateral unnest(b.fotos) as u(caminho)
   where b.pet_id = any (v_pets)
  on conflict do nothing;
  get diagnostics v_n = row_count; v_arquivos := v_arquivos + v_n;
  insert into public.arquivos_lixo (bucket, caminho, petshop_id, motivo)
  select 'entrada', f, c.petshop_id, v_motivo
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
  delete from public.estadias_retiradas where estadia_id = any (v_ests);
  delete from public.estadias_cuidados where estadia_id = any (v_ests);
  update public.estadias_diario d set nota = null where d.estadia_id = any (v_ests) and d.nota is not null;
  update public.estadias_ocorrencias o set texto = '(texto apagado a pedido do tutor)' where o.pet_id = any (v_pets);
  update public.estadias_horas_hist h set motivo = '' where h.estadia_id = any (v_ests) and coalesce(h.motivo, '') <> '';
  -- (20261236) a estadia também guardava o endereço do leva e traz, os cuidados combinados e os avisos
  update public.estadias e set obs = null, endereco_leva_traz = null, cuidados = null, avisos = '{}'::jsonb
   where e.pet_id = any (v_pets)
     and (e.obs is not null or e.endereco_leva_traz is not null or e.cuidados is not null or e.avisos <> '{}'::jsonb);
  update public.agendamentos a set obs = null, endereco_leva_traz = null, foto_antes = null, foto_depois = null
   where a.pet_id = any (v_pets) and (a.obs is not null or a.endereco_leva_traz is not null or a.foto_antes is not null or a.foto_depois is not null);
  update public.creche_planos k set obs = null where k.pet_id = any (v_pets) and k.obs is not null;
  update public.creche_cobrancas k set obs = null where k.pet_id = any (v_pets) and k.obs is not null;
  delete from public.tutor_links where cliente_id = c.id;
  delete from public.tutor_acessos where cliente_id = c.id;

  -- lista de espera: pela ficha do pet, e (indiretos) pelo telefone ou pelo nome completo
  update public.lista_espera w set pet_nome = 'Pet removido', tutor_nome = 'Cliente removido', telefone = null, obs = null
   where w.petshop_id = c.petshop_id
     and (w.pet_id = any (v_pets)
          or (p_indiretos and v_fone is not null and regexp_replace(coalesce(w.telefone, ''), '\D', '', 'g') = v_fone
              and (v_fone_so_dele or public.lgpd_texto_igual(w.tutor_nome, c.nome)))
          or (p_indiretos and v_nome_so_dele and public.lgpd_texto_igual(w.tutor_nome, c.nome)));

  -- pedidos pelo link: os que viraram horário ou estadia de um pet dele e (indiretos) os do telefone ou do nome completo
  delete from public.pedidos_agendamento d
   where d.petshop_id = c.petshop_id
     and (d.agendamento_id = any (v_ags) or d.estadia_id = any (v_ests)
          or (p_indiretos and v_fone is not null and regexp_replace(coalesce(d.telefone, ''), '\D', '', 'g') = v_fone
              and (v_fone_so_dele or public.lgpd_texto_igual(d.tutor_nome, c.nome)))
          or (p_indiretos and v_nome_so_dele and public.lgpd_texto_igual(d.tutor_nome, c.nome)));
  get diagnostics v_n_ped = row_count;

  if p_indiretos then
    -- freio do link: a tabela guarda os 8 últimos números do telefone
    if v_fone is not null and v_fone_so_dele and char_length(v_fone) >= 8 then
      delete from public.link_envios e where e.petshop_id = c.petshop_id and e.fone = right(v_fone, 8);
    end if;

    -- orçamentos do tutor ou com o telefone dele: o valor e os itens ficam; nome, telefone e ligação com a ficha saem.
    -- O gatilho orcamento_conferir só deixa mexer em orçamento convertido com a marca maestro.orcamento_marcar dele.
    for v_orc in select o.id from public.orcamentos o
                  where o.petshop_id = c.petshop_id
                    and (o.cliente_id = c.id
                         or (v_fone is not null and regexp_replace(coalesce(o.telefone, ''), '\D', '', 'g') = v_fone
                             and (v_fone_so_dele or public.lgpd_texto_igual(o.nome, c.nome)))
                         or (v_fone is not null and char_length(v_fone) >= 10
                             and right(regexp_replace(coalesce(o.telefone, ''), '\D', '', 'g'), 10) = right(v_fone, 10)
                             and (v_fone_so_dele or public.lgpd_texto_igual(o.nome, c.nome)))
                         or (v_nome_so_dele and public.lgpd_texto_igual(o.nome, c.nome)))
                  for update loop
      perform set_config('maestro.orcamento_marcar', v_orc::text, true);
      update public.orcamentos o set nome = null, telefone = null, cliente_id = null,
             obs = public.lgpd_trocar_nomes(public.lgpd_trocar_nomes(o.obs, array[c.nome], 'Cliente removido'), v_nomes, 'Pet removido')
       where o.id = v_orc;
      v_n_orc := v_n_orc + 1;
    end loop;
    perform set_config('maestro.orcamento_marcar', '', true);

    -- conversas com o Mozart e a Ajuda deste pet shop que citam o tutor: apagadas. A conversa não guarda o id do tutor,
    -- então a busca é pelo nome completo (sem diferença de maiúsculas) ou pelo telefone (só os números, 8 dígitos ou mais).
    -- No histórico do Mozart (assistente_eventos) e nos rascunhos também pelo id do tutor ou de um pet dele.
    v_nome_busca := nullif(lower(btrim(regexp_replace(c.nome, '\s+', ' ', 'g'))), '');
    if char_length(coalesce(v_nome_busca, '')) < 4 or c.nome = 'Cliente removido' then v_nome_busca := null; end if;
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
    -- rascunho de formulário (guardado para continuar depois) que cita o tutor
    delete from public.rascunhos k
     where k.petshop_id = c.petshop_id
       and ((v_nome_busca is not null and strpos(lower(regexp_replace(k.dados::text, '\s+', ' ', 'g')), v_nome_busca) > 0)
         or (v_fone_busca is not null and strpos(regexp_replace(k.dados::text, '\D', '', 'g'), v_fone_busca) > 0)
         or exists (select 1 from unnest(v_ids) i where strpos(k.dados::text, i) > 0));
  end if;

  if p_modo <> 'excluir' then
    update public.pets p set nome = 'Pet removido', raca = null, nascimento = null, alertas = null, obs = null, foto = null, ativo = false
     where p.id = any (v_pets);
    update public.clientes set nome = 'Cliente removido', telefone = null, email = null, endereco = null, obs = null where id = c.id;
  end if;

  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  perform set_config('maestro.lgpd', '', true);

  return jsonb_build_object('pets', cardinality(v_pets), 'lancamentos', v_n_lanc, 'arquivos', v_arquivos,
                            'orcamentos', v_n_orc, 'conversas', v_n_conv, 'pedidos', v_n_ped);
end $$;
revoke execute on function public.lgpd_limpar_tutor(public.clientes, text, boolean) from public, anon, authenticated;

-- "Apagar dados deste tutor": mesmos parâmetros e a mesma resposta de antes (20261210); a limpeza agora é a comum.
create or replace function public.cliente_anonimizar(p_cliente uuid, p_confirmacao text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.clientes;
  v_uid uuid := (select auth.uid());
  v jsonb;
begin
  select * into c from public.clientes where id = p_cliente for update;
  if not found or not public.sou_dono(c.petshop_id) then raise exception 'Cliente não encontrado.'; end if;
  if exists (select 1 from public.lgpd_registros r where r.petshop_id = c.petshop_id and r.acao = 'apagou_tutor' and r.detalhe ->> 'cliente_id' = c.id::text) then
    return jsonb_build_object('ok', true, 'ja', true);
  end if;
  if not public.lgpd_texto_igual(p_confirmacao, c.nome) then
    raise exception 'Digite o nome do tutor igual ao da ficha para confirmar.';
  end if;
  v := public.lgpd_limpar_tutor(c, 'apagar', true);
  insert into public.lgpd_registros (petshop_id, quem, quem_nome, acao, detalhe)
  values (c.petshop_id, v_uid, (select x.nome from public.profissionais x where x.petshop_id = c.petshop_id and x.user_id = v_uid limit 1), 'apagou_tutor',
          jsonb_build_object('cliente_id', c.id) || v);
  return jsonb_build_object('ok', true) || v;
end $$;
revoke execute on function public.cliente_anonimizar(uuid, text) from public, anon, authenticated;
grant execute on function public.cliente_anonimizar(uuid, text) to authenticated;

-- Cliente apagado (pelo "Excluir de vez", que apaga a linha pelo navegador, ou direto no banco): a mesma limpeza antes de
-- a ficha sair. Não roda quando a ficha está sendo juntada a outra (os dados continuam, na outra ficha), nem quando o pet
-- shop inteiro está saindo. Ao desfazer uma importação (fichas vazias criadas por engano), só o que aponta para a ficha:
-- um pedido pelo link com o mesmo telefone não é apagado por causa disso, e nada entra no registro.
create or replace function public.clientes_lgpd_ao_excluir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v jsonb;
  v_indiretos boolean := coalesce(current_query(), '') !~* 'importacao_desfazer';
begin
  if nullif(current_setting('gestao.juntar_para', true), '') is not null then return old; end if;
  if not exists (select 1 from public.petshops s where s.id = old.petshop_id) then return old; end if;
  v := public.lgpd_limpar_tutor(old, 'excluir', v_indiretos);
  if v_indiretos then
    insert into public.lgpd_registros (petshop_id, quem, quem_nome, acao, detalhe)
    values (old.petshop_id, v_uid, (select x.nome from public.profissionais x where x.petshop_id = old.petshop_id and x.user_id = v_uid limit 1), 'excluiu_tutor',
            jsonb_build_object('cliente_id', old.id) || v);
  end if;
  return old;
end $$;
revoke execute on function public.clientes_lgpd_ao_excluir() from public, anon, authenticated;
drop trigger if exists clientes_lgpd_ao_excluir on public.clientes;
create trigger clientes_lgpd_ao_excluir before delete on public.clientes
  for each row execute function public.clientes_lgpd_ao_excluir();

-- Tutores que já tinham sido apagados antes desta migração: a estadia ficou com o endereço do leva e traz, os cuidados e os
-- avisos (a limpeza antiga só tirava a observação). Uma vez só, aqui. Se alguma trava do banco recusar, a migração segue e
-- avisa (não deixa de aplicar o resto por causa disso).
do $$
declare v_n integer := 0;
begin
  perform set_config('maestro.lgpd', '1', true);
  update public.estadias e set endereco_leva_traz = null, cuidados = null, avisos = '{}'::jsonb
   where e.pet_id in (select p.id from public.pets p join public.clientes c on c.id = p.cliente_id where c.nome = 'Cliente removido' and p.nome = 'Pet removido')
     and (e.endereco_leva_traz is not null or e.cuidados is not null or e.avisos <> '{}'::jsonb);
  get diagnostics v_n = row_count;
  perform set_config('maestro.lgpd', '', true);
  if v_n > 0 then raise notice 'tutores já apagados: % estadia(s) ficaram sem endereço, cuidados e avisos', v_n; end if;
exception when others then
  raise notice 'não consegui limpar as estadias dos tutores já apagados (%). Rode à mão depois.', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Fotos do bucket 'pets': o banco põe na fila o que saiu de uso
-- ---------------------------------------------------------------------------------------------------------------------
-- Os argumentos do gatilho são as colunas que guardam caminho de foto. Foto trocada ou tirada: o caminho antigo vai para a
-- fila. Linha apagada: todos os caminhos dela. A faxina só apaga o que nenhuma ficha usa mais (gestao_lgpd_arquivos).
create or replace function public.lgpd_foto_para_lixo() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_col text;
  v_velho text;
  v_novo text;
  v_loja uuid := coalesce(to_jsonb(old) ->> 'petshop_id', to_jsonb(old) ->> 'id')::uuid;
begin
  foreach v_col in array tg_argv loop
    v_velho := to_jsonb(old) ->> v_col;
    v_novo := case when tg_op = 'UPDATE' then to_jsonb(new) ->> v_col end;
    if v_velho is not null and v_velho is distinct from v_novo and v_velho like v_loja::text || '/%' and char_length(v_velho) between 3 and 400 then
      insert into public.arquivos_lixo (bucket, caminho, petshop_id, motivo)
      values ('pets', v_velho, v_loja, case when tg_op = 'UPDATE' then 'foto_trocada' else 'ficha_apagada' end)
      on conflict do nothing;
    end if;
  end loop;
  return null;
end $$;
revoke execute on function public.lgpd_foto_para_lixo() from public, anon, authenticated;
drop trigger if exists pets_foto_para_lixo on public.pets;
create trigger pets_foto_para_lixo after update of foto or delete on public.pets
  for each row execute function public.lgpd_foto_para_lixo('foto');
drop trigger if exists agendamentos_foto_para_lixo on public.agendamentos;
create trigger agendamentos_foto_para_lixo after update of foto_antes, foto_depois or delete on public.agendamentos
  for each row execute function public.lgpd_foto_para_lixo('foto_antes', 'foto_depois');
drop trigger if exists petshops_logo_para_lixo on public.petshops;
create trigger petshops_logo_para_lixo after update of logo on public.petshops
  for each row execute function public.lgpd_foto_para_lixo('logo');

-- Um arquivo do bucket 'pets' ainda está em uso? (foto do pet, antes e depois, logo, álbum ou rascunho de formulário)
create or replace function public.lgpd_foto_em_uso(p_caminho text, p_petshop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.pets p where p.foto = p_caminho)
      or exists (select 1 from public.agendamentos a where a.foto_antes = p_caminho)
      or exists (select 1 from public.agendamentos a where a.foto_depois = p_caminho)
      or exists (select 1 from public.petshops s where s.logo = p_caminho)
      or exists (select 1 from public.albuns b where b.petshop_id = p_petshop and strpos(b.itens::text, p_caminho) > 0)
      or exists (select 1 from public.rascunhos r where r.petshop_id = p_petshop and strpos(r.dados::text, p_caminho) > 0)
$$;
revoke execute on function public.lgpd_foto_em_uso(text, uuid) from public, anon, authenticated;

-- Só a chave de serviço (faxina): os arquivos da fila, por bucket. O que já não existe sai da fila.
-- Mesma função da 20261199 (mesma assinatura). A mais: um arquivo do bucket 'pets' que voltou a ser usado por alguma ficha
-- sai da fila sem ser apagado (menos os da conta que está sendo apagada inteira, que saem de qualquer jeito).
create or replace function public.gestao_lgpd_arquivos(p_limite int default 500, p_petshop uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_lim int := least(greatest(coalesce(p_limite, 500), 1), 1000); v jsonb;
begin
  delete from public.arquivos_lixo l
   where (p_petshop is null or l.petshop_id = p_petshop)
     and not exists (select 1 from storage.objects o where o.bucket_id = l.bucket and o.name = l.caminho);
  delete from public.arquivos_lixo l
   where (p_petshop is null or l.petshop_id = p_petshop)
     and l.bucket = 'pets' and l.motivo <> 'conta_apagada'
     and public.lgpd_foto_em_uso(l.caminho, l.petshop_id);
  with s as (
    update public.arquivos_lixo l set tentativas = l.tentativas + 1
     where (l.bucket, l.caminho) in (select y.bucket, y.caminho from public.arquivos_lixo y
                                      where y.tentativas < 20 and (p_petshop is null or y.petshop_id = p_petshop)
                                      order by y.criado_em limit v_lim)
    returning l.bucket, l.caminho)
  select coalesce(jsonb_object_agg(g.bucket, g.caminhos), '{}'::jsonb) into v
    from (select s.bucket, jsonb_agg(s.caminho) as caminhos from s group by s.bucket) g;
  return v;
end $$;
revoke execute on function public.gestao_lgpd_arquivos(int, uuid) from public, anon, authenticated;
grant execute on function public.gestao_lgpd_arquivos(int, uuid) to service_role;

-- Faxina da privacidade (a rota /api/gestao/faxina chama uma vez por dia, antes de apagar os arquivos da fila):
--   · freio das páginas públicas (parte do telefone e código feito do IP): 2 dias (o freio olha no máximo 1 dia para trás)
--   · pedido pelo link que não virou horário (recusado, ou sem resposta) e cuja data já passou há mais de 90 dias
--   · foto do bucket 'pets' com mais de 1 dia que nenhuma ficha usa (formulário cancelado, pet shop que já não existe)
--   · contagem do chat da página de vendas por visitante: 3 dias
create or replace function public.gestao_faxina_lgpd(p_petshop uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_freio int := 0; v_pedidos int := 0; v_fotos int := 0;
begin
  perform pg_advisory_xact_lock(hashtext('gestao_faxina_lgpd'));
  delete from public.link_envios e where e.em < now() - interval '2 days' and (p_petshop is null or e.petshop_id = p_petshop);
  get diagnostics v_freio = row_count;
  delete from public.pedidos_agendamento d
   where (p_petshop is null or d.petshop_id = p_petshop)
     and d.status in ('pendente', 'recusado') and d.agendamento_id is null and d.estadia_id is null
     and d.criado_em < now() - interval '90 days' and coalesce(d.fim, d.inicio, d.criado_em) < now() - interval '90 days';
  get diagnostics v_pedidos = row_count;
  insert into public.arquivos_lixo (bucket, caminho, petshop_id, motivo)
  select 'pets', x.name, x.loja, 'sem_ficha' from (
    select o.name, public.diario_pasta(o.name) as loja from storage.objects o
     where o.bucket_id = 'pets' and o.created_at < now() - interval '1 day' and char_length(o.name) between 3 and 400
       and public.diario_pasta(o.name) is not null and (p_petshop is null or public.diario_pasta(o.name) = p_petshop)) x
   where not public.lgpd_foto_em_uso(x.name, x.loja)
     and not exists (select 1 from public.arquivos_lixo l where l.bucket = 'pets' and l.caminho = x.name)
   limit 2000
  on conflict do nothing;
  get diagnostics v_fotos = row_count;
  -- contagem do chat da página de vendas (código feito do IP do visitante): 3 dias
  if p_petshop is null then delete from public.vendas_uso u where u.hora < now() - interval '3 days'; end if;
  return jsonb_build_object('freio', v_freio, 'pedidos', v_pedidos, 'fotos', v_fotos);
end $$;
revoke execute on function public.gestao_faxina_lgpd(uuid) from public, anon, authenticated;
grant execute on function public.gestao_faxina_lgpd(uuid) to service_role;


-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Painel da equipe Maestro Pet: números por padrão; ler uma conversa exige "abrir para suporte", com registro
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.equipe_maestro_acessos (
  id bigint generated always as identity primary key,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  conversa_id uuid,
  canal text,
  conversa_em timestamptz,
  quem uuid,
  quem_nome text check (char_length(quem_nome) <= 120),
  motivo text not null check (char_length(btrim(motivo)) between 10 and 300),
  em timestamptz not null default now()
);
create index if not exists equipe_maestro_acessos_loja on public.equipe_maestro_acessos (petshop_id, em desc);
create index if not exists equipe_maestro_acessos_conversa on public.equipe_maestro_acessos (conversa_id);
alter table public.equipe_maestro_acessos enable row level security;
revoke all on public.equipe_maestro_acessos from public, anon, authenticated;
comment on table public.equipe_maestro_acessos is
  'Cada vez que alguém da equipe Maestro Pet abriu uma conversa de um pet shop para dar suporte: quem, quando e por quê. O dono vê em Meu pet shop.';

-- Mesmos parâmetros e as mesmas chaves da 20261120, mas SEM o texto: "pergunta" vem vazia, "resposta" e "pessoa" nulas.
-- A mais: o tamanho de cada lado e quando a conversa foi aberta para suporte (se foi).
create or replace function public.admin_conversas(p_petshop uuid default null, p_canal text default null, p_limite integer default 300) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return (
    select coalesce(jsonb_agg(x order by x.criado_em desc), '[]'::jsonb) from (
      select c.id, c.petshop_id, p.nome as petshop, c.canal, ''::text as pergunta, null::text as resposta, c.resolveu, c.pediu_equipe, c.criado_em,
        null::text as pessoa,
        char_length(coalesce(c.pergunta, '')) as letras_pergunta, char_length(coalesce(c.resposta, '')) as letras_resposta,
        (select max(a.em) from public.equipe_maestro_acessos a where a.conversa_id = c.id) as aberta_em
      from public.conversas c join public.petshops p on p.id = c.petshop_id
      where (p_petshop is null or c.petshop_id = p_petshop) and (p_canal is null or c.canal = p_canal)
      order by c.criado_em desc limit least(greatest(coalesce(p_limite, 300), 1), 1000)
    ) x
  );
end $$;
revoke execute on function public.admin_conversas(uuid, text, integer) from public, anon;
grant execute on function public.admin_conversas(uuid, text, integer) to authenticated;

-- Números do Mozart e da Ajuda (sem texto nenhum): conversas, problemas, pedidos, erros, ferramentas usadas e tokens.
create or replace function public.admin_conversas_numeros(p_petshop uuid default null, p_dias integer default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_dias integer := least(greatest(coalesce(p_dias, 30), 1), 365); v_desde timestamptz;
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  v_desde := now() - make_interval(days => v_dias);
  return jsonb_build_object('dias', v_dias)
    || (select jsonb_build_object(
          'conversas', count(*), 'mozart', count(*) filter (where c.canal = 'mozart'), 'ajuda', count(*) filter (where c.canal = 'ajuda'),
          'nao_resolveu', count(*) filter (where c.resolveu is false), 'resolveu', count(*) filter (where c.resolveu is true),
          'pediu_equipe', count(*) filter (where c.pediu_equipe), 'lojas', count(distinct c.petshop_id))
        from public.conversas c where c.criado_em >= v_desde and (p_petshop is null or c.petshop_id = p_petshop))
    || (select jsonb_build_object(
          'pedidos', count(*), 'erros', count(*) filter (where t.fim in ('erro', 'demorou')), 'recusas', count(*) filter (where t.fim = 'recusa'),
          'limites', count(*) filter (where t.fim = 'limite'), 'ferramentas', coalesce(sum(t.ferramentas), 0),
          'tokens_entrada', coalesce(sum(t.tokens_entrada), 0), 'tokens_saida', coalesce(sum(t.tokens_saida), 0),
          'tokens_cache', coalesce(sum(coalesce(t.tokens_cache_lidos, 0)), 0))
        from public.mozart_tempos t where t.em >= v_desde and (p_petshop is null or t.petshop_id = p_petshop))
    || jsonb_build_object('aberturas', (select count(*) from public.equipe_maestro_acessos a where a.em >= v_desde and (p_petshop is null or a.petshop_id = p_petshop)));
end $$;
revoke execute on function public.admin_conversas_numeros(uuid, integer) from public, anon;
grant execute on function public.admin_conversas_numeros(uuid, integer) to authenticated;

-- "Abrir para suporte": devolve o texto de UMA conversa e grava quem abriu, quando e por quê. Sem motivo, não abre.
create or replace function public.admin_conversa_abrir(p_conversa uuid, p_motivo text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  c public.conversas;
  v_uid uuid := (select auth.uid());
  v_motivo text := btrim(regexp_replace(coalesce(p_motivo, ''), '\s+', ' ', 'g'));
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  if char_length(v_motivo) < 10 then raise exception 'Escreva o motivo (pelo menos 10 letras): ele fica registrado e o dono do pet shop vê.'; end if;
  select * into c from public.conversas where id = p_conversa;
  if not found then raise exception 'Conversa não encontrada.'; end if;
  insert into public.equipe_maestro_acessos (petshop_id, conversa_id, canal, conversa_em, quem, quem_nome, motivo)
  values (c.petshop_id, c.id, c.canal, c.criado_em, v_uid,
          left((select coalesce(nullif(btrim(u.raw_user_meta_data ->> 'nome'), ''), u.email) from auth.users u where u.id = v_uid), 120), left(v_motivo, 300));
  return jsonb_build_object('id', c.id, 'pergunta', c.pergunta, 'resposta', c.resposta,
    'pessoa', (select d.nome from public.profissionais d where d.user_id = c.user_id and d.petshop_id = c.petshop_id limit 1));
end $$;
revoke execute on function public.admin_conversa_abrir(uuid, text) from public, anon;
grant execute on function public.admin_conversa_abrir(uuid, text) to authenticated;

-- O dono do pet shop vê cada abertura: quando, quem da equipe Maestro Pet, o motivo e de quando era a conversa.
create or replace function public.equipe_maestro_acessos_ver(p_petshop uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_dono(p_petshop) then raise exception 'Só o dono do pet shop vê esta lista.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('em', a.em, 'quem', a.quem_nome, 'motivo', a.motivo, 'canal', a.canal, 'conversa_em', a.conversa_em) order by a.em desc)
    from (select * from public.equipe_maestro_acessos where petshop_id = p_petshop order by em desc limit 100) a), '[]'::jsonb);
end $$;
revoke execute on function public.equipe_maestro_acessos_ver(uuid) from public, anon;
grant execute on function public.equipe_maestro_acessos_ver(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Documentos: versão 2.4
-- ---------------------------------------------------------------------------------------------------------------------
insert into public.documentos_versoes (documento, versao) values ('termos', '2.4'), ('privacidade', '2.4') on conflict do nothing;

-- Quem vende (nome e CPF ou CNPJ) NÃO fica escrito nos documentos: eles leem a função pública gestao_vendedor() (migração
-- 20261237, chaves vendedor_* de config_interna, preenchidas no painel). Uma primeira versão desta migração criava
-- vendedor_publico() com o mesmo papel; ficou só a outra.
drop function if exists public.vendedor_publico();

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. Login dividido com outro produto do mesmo projeto: nunca apagar login que tem dados fora do Gestão
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.logins_mantidos (
  user_id uuid primary key,
  petshop_id uuid,
  motivo text check (char_length(motivo) <= 300),
  em timestamptz not null default now()
);
alter table public.logins_mantidos enable row level security;
revoke all on public.logins_mantidos from public, anon, authenticated;
comment on table public.logins_mantidos is
  'Logins que NÃO foram apagados junto com a conta porque têm (ou podem ter) dados em outro produto do mesmo projeto. A equipe decide caso a caso.';

-- As tabelas do Gestão: tudo o que sai em cascata com o pet shop, mais as gerais desta lista. Tabela nova do Gestão que
-- guarda login e não sai com o pet shop entra aqui (o teste banco/lgpd-rodada9.js acusa se faltar).
create or replace function public.gestao_tabelas() returns oid[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct x.o), '{}') from (
    select pg_catalog.to_regclass(t.tabela)::oid as o from public.gestao_loja_plano() t
    union all
    select pg_catalog.to_regclass('public.' || n)::oid from unnest(array[
      'petshops', 'aceites', 'admins', 'admin_empresa_passos', 'emails_confirmados', 'emails_desde', 'exclusoes_conta', 'lgpd_registros',
      'logins_lixo', 'logins_mantidos', 'registros_acesso', 'equipe_maestro_acessos', 'documentos_versoes', 'lojas_novas_rede',
      'rotinas_execucoes', 'cakto_eventos', 'cakto_callbacks', 'config_interna', 'escola_materiais', 'escola_compras', 'convites_equipe_antigos',
      'convite_consultas', 'diario_fotos_lixo', 'webhook_vistos', 'vendas_uso', 'erros_app', 'erros_app_resolvidos', 'erros_app_contagem',
      'erros_app_freio', 'boletim_lixo', 'arquivos_lixo', 'fotos_autorizacao_freio', 'entrada_lixo', 'notas_admin']) n
  ) x where x.o is not null
$$;
revoke execute on function public.gestao_tabelas() from public, anon, authenticated;
grant execute on function public.gestao_tabelas() to service_role;

-- Este login tem dados fora do Gestão? Devolve null quando é só do Gestão; senão, onde achou (ou "não deu para conferir").
-- Olha só SE existe linha (nunca o conteúdo): em toda tabela que não é do Gestão e aponta para auth.users (chave
-- estrangeira, pelo catálogo), em colunas com nome de login (user_id, owner_id…) de tabelas que não são do Gestão, e em
-- arquivos do Storage em bucket que não é do Gestão. Qualquer erro no caminho conta como "tem": na dúvida, o login fica.
create or replace function public.login_fora_do_gestao(p_user uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_gestao oid[] := public.gestao_tabelas();
  r record;
  v boolean;
begin
  if p_user is null then return 'sem login'; end if;
  if not exists (select 1 from auth.users u where u.id = p_user and coalesce(u.raw_user_meta_data ->> 'app', '') = 'maestro') then
    return 'o login não foi criado pelo Gestão';
  end if;
  for r in
    select distinct k.oid as rel, k.oid::regclass::text as tabela, a.attname::text as coluna
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_class k on k.oid = c.conrelid
      join pg_catalog.pg_namespace n on n.oid = k.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'auth.users'::regclass and cardinality(c.conkey) = 1
       and n.nspname <> 'auth' and not (k.oid = any (v_gestao))
    union
    select k.oid, k.oid::regclass::text, a.attname::text
      from pg_catalog.pg_class k
      join pg_catalog.pg_namespace n on n.oid = k.relnamespace
      join pg_catalog.pg_attribute a on a.attrelid = k.oid and a.attnum > 0 and not a.attisdropped
     where k.relkind in ('r', 'p') and a.atttypid = 'uuid'::regtype and not (k.oid = any (v_gestao))
       and n.nspname not in ('auth', 'storage', 'pg_catalog', 'information_schema', 'pg_toast', 'realtime', '_realtime', 'vault', 'extensions',
                             'graphql', 'graphql_public', 'net', 'cron', 'pgsodium', 'pgsodium_masks', 'supabase_functions', 'supabase_migrations',
                             'pgbouncer', '_analytics', 'pgmq')
       and (a.attname in ('user_id', 'owner_id', 'usuario_id', 'profile_id', 'auth_user_id', 'auth_id', 'account_id', 'member_id', 'created_by', 'owner')
            or (a.attname = 'id' and k.relname in ('profiles', 'users', 'usuarios', 'perfis', 'accounts', 'members', 'membros')))
  loop
    execute format('select exists (select 1 from %s where %I = $1)', r.tabela, r.coluna) into v using p_user;
    if v then return 'tem dados em ' || r.tabela; end if;
  end loop;
  -- arquivos enviados por este login em bucket que não é do Gestão
  if exists (select 1 from storage.objects o where o.owner_id = p_user::text
              and o.bucket_id not in ('pets', 'diario', 'boletim', 'caderno-tmp', 'entrada')) then
    return 'tem arquivos em outro bucket';
  end if;
  return null;
exception when others then
  return 'não deu para conferir (' || left(sqlerrm, 120) || ')';
end $$;
revoke execute on function public.login_fora_do_gestao(uuid) from public, anon, authenticated;
grant execute on function public.login_fora_do_gestao(uuid) to service_role;

-- Anota um login que ficou (não foi apagado) e por quê.
create or replace function public.login_manter(p_user uuid, p_petshop uuid, p_motivo text) returns void
language sql security definer set search_path = '' as $$
  insert into public.logins_mantidos (user_id, petshop_id, motivo) values (p_user, p_petshop, left(coalesce(p_motivo, ''), 300))
  on conflict (user_id) do update set motivo = excluded.motivo, em = now(), petshop_id = coalesce(excluded.petshop_id, public.logins_mantidos.petshop_id)
$$;
revoke execute on function public.login_manter(uuid, uuid, text) from public, anon, authenticated;

-- Mesma função da 20261229 (mesma assinatura). A mais: login com dados fora do Gestão sai da fila sem ser apagado e fica
-- anotado em logins_mantidos.
create or replace function public.gestao_logins_lixo(p_limite integer default 50, p_petshop uuid default null) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  delete from public.logins_lixo l
   where not exists (select 1 from auth.users u where u.id = l.user_id and coalesce(u.raw_user_meta_data ->> 'app', '') = 'maestro')
      or exists (select 1 from public.profissionais m where m.user_id = l.user_id)
      or exists (select 1 from public.admins a where a.user_id = l.user_id);
  for r in select l.user_id, l.petshop_id, public.login_fora_do_gestao(l.user_id) as onde from public.logins_lixo l
            where (p_petshop is null or l.petshop_id = p_petshop) and l.tentativas < 30
            order by l.tentativas, l.criado_em limit least(greatest(coalesce(p_limite, 50), 1), 500) loop
    if r.onde is not null then
      perform public.login_manter(r.user_id, r.petshop_id, r.onde);
      delete from public.logins_lixo where user_id = r.user_id;
    end if;
  end loop;
  return coalesce((select array_agg(x.user_id) from (
    select l.user_id from public.logins_lixo l where (p_petshop is null or l.petshop_id = p_petshop) and l.tentativas < 30
     order by l.tentativas, l.criado_em limit least(greatest(coalesce(p_limite, 50), 1), 500)) x), '{}');
end $$;
revoke execute on function public.gestao_logins_lixo(integer, uuid) from public, anon, authenticated;
grant execute on function public.gestao_logins_lixo(integer, uuid) to service_role;

-- Para o painel da equipe: os logins que ficaram e por quê.
create or replace function public.admin_logins_mantidos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', m.user_id, 'email', (select u.email from auth.users u where u.id = m.user_id),
      'motivo', m.motivo, 'em', m.em, 'petshop_id', m.petshop_id) order by m.em desc)
    from (select * from public.logins_mantidos order by em desc limit 200) m), '[]'::jsonb);
end $$;
revoke execute on function public.admin_logins_mantidos() from public, anon;
grant execute on function public.admin_logins_mantidos() to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. Dados de cada pessoa com login (aqui o Maestro Pet é o controlador) e apagar o próprio login
-- ---------------------------------------------------------------------------------------------------------------------
-- "Baixar os meus dados": o que guardamos sobre a pessoa que está logada. No mesmo formato de cliente_dados (planilhas).
-- O texto das conversas com o Mozart e a Ajuda só entra para os pet shops em que a pessoa ainda está (ele cita clientes
-- do pet shop); das outras entram a data e o canal.
create or replace function public.meus_dados() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  u record;
  v_arquivos jsonb := '[]'::jsonb;
  v_fuso text := 'America/Sao_Paulo';
begin
  if v_uid is null then raise exception 'Entre na sua conta.'; end if;
  select x.email, x.created_at, x.last_sign_in_at, x.raw_user_meta_data ->> 'nome' as nome into u from auth.users x where x.id = v_uid;

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'login.csv', 'explica', 'O seu login: e-mail, nome informado no cadastro, quando foi criado e a última entrada.',
    'colunas', jsonb_build_array('E-mail', 'Nome', 'Criado em', 'Última entrada'),
    'linhas', jsonb_build_array(jsonb_build_array(u.email, u.nome, to_char(u.created_at at time zone v_fuso, 'DD/MM/YYYY HH24:MI'),
                 to_char(u.last_sign_in_at at time zone v_fuso, 'DD/MM/YYYY HH24:MI')))));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'pet-shops.csv', 'explica', 'Os pet shops em que você está na equipe, com o seu nome, a função e o que pode ver.',
    'colunas', jsonb_build_array('Pet shop', 'Seu nome na equipe', 'Papel', 'Função', 'Vê o financeiro', 'Áreas liberadas', 'Na equipe desde'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(s.nome, m.nome, case when m.papel::text = 'dono' then 'Dono' else 'Equipe' end, m.funcao,
                 case when m.ve_financeiro then 'Sim' else 'Não' end, m.acessos::text, to_char(m.criado_em at time zone v_fuso, 'DD/MM/YYYY')) order by m.criado_em)
               from public.profissionais m join public.petshops s on s.id = m.petshop_id where m.user_id = v_uid), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'aceites.csv', 'explica', 'Os Termos de uso e a Política de privacidade que você aceitou: versão, quando, e o IP e o navegador quando foram guardados.',
    'colunas', jsonb_build_array('Documento', 'Versão', 'Aceito em', 'Onde', 'IP', 'Navegador'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(a.documento, a.versao, to_char(a.aceito_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), a.origem, a.ip, a.navegador) order by a.aceito_em)
               from public.aceites a where a.user_id = v_uid), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'acessos.csv', 'explica', 'O registro das suas entradas no aplicativo (guardado por 6 meses): data, IP e navegador.',
    'colunas', jsonb_build_array('Quando', 'Origem', 'IP', 'Navegador'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(r.em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), r.origem, r.ip, r.navegador) order by r.em)
               from public.registros_acesso r where r.user_id = v_uid), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'conversas.csv', 'explica', 'As suas conversas com o Mozart e com a Ajuda (guardadas por 12 meses). O texto aparece só para os pet shops em que você ainda está.',
    'colunas', jsonb_build_array('Quando', 'Pet shop', 'Canal', 'Você pediu', 'Resposta', 'Resolveu'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(c.criado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), s.nome,
                 case c.canal when 'mozart' then 'Mozart' else 'Ajuda' end,
                 case when c.petshop_id in (select public.meus_petshops()) then c.pergunta else '(você não está mais neste pet shop)' end,
                 case when c.petshop_id in (select public.meus_petshops()) then c.resposta end,
                 case when c.resolveu is true then 'Sim' when c.resolveu is false then 'Não' end) order by c.criado_em)
               from public.conversas c left join public.petshops s on s.id = c.petshop_id where c.user_id = v_uid), '[]'::jsonb)));

  return jsonb_build_object('email', u.email, 'gerado_em', now(), 'arquivos', v_arquivos);
end $$;
revoke execute on function public.meus_dados() from public, anon;
grant execute on function public.meus_dados() to authenticated;

-- "Exportar" a lista de clientes entra no Registro de pedidos de dados: quem exportou, quando e quantas linhas (sem o conteúdo).
create or replace function public.lgpd_registrar_exportacao(p_petshop uuid, p_linhas integer default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_petshop is null or p_petshop not in (select public.meus_petshops()) then raise exception 'Pet shop não encontrado.'; end if;
  perform public.lgpd_anotar(p_petshop, 'exportou_clientes', jsonb_build_object('linhas', greatest(coalesce(p_linhas, 0), 0)));
end $$;
revoke execute on function public.lgpd_registrar_exportacao(uuid, integer) from public, anon;
grant execute on function public.lgpd_registrar_exportacao(uuid, integer) to authenticated;

-- "Apagar o meu login": só para quem não está em nenhum pet shop (saiu da equipe, ou teve o acesso tirado). O login entra
-- na fila logins_lixo; o servidor apaga na hora quando tem a chave de serviço, e a faxina diária apaga o que sobrar.
-- Login com dados em outro produto do mesmo projeto não é apagado: fica anotado para a equipe e a pessoa é avisada.
create or replace function public.meu_login_apagar() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_onde text;
begin
  if v_uid is null then raise exception 'Entre na sua conta.'; end if;
  if exists (select 1 from public.profissionais m where m.user_id = v_uid) then
    raise exception 'Este login ainda abre um pet shop. Saia da equipe primeiro (ou, se o pet shop é seu, use Encerrar e apagar a conta, em Meu pet shop).';
  end if;
  if exists (select 1 from public.admins a where a.user_id = v_uid) then raise exception 'Este login é da equipe Maestro Pet.'; end if;
  v_onde := public.login_fora_do_gestao(v_uid);
  if v_onde is not null then
    perform public.login_manter(v_uid, null, 'pediu para apagar o login: ' || v_onde);
    return jsonb_build_object('ok', false, 'motivo', 'outro_produto');
  end if;
  insert into public.logins_lixo (user_id, petshop_id) values (v_uid, null) on conflict (user_id) do nothing;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function public.meu_login_apagar() from public, anon;
grant execute on function public.meu_login_apagar() to authenticated;

-- Mesma função da 20261229 (mesma assinatura). A mais: o login que tem dados fora do Gestão não entra na lista de apagar.
create or replace function public.gestao_loja_apagar(p_pedido bigint, p_ate timestamptz, p_lote integer default 5000)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  x public.exclusoes_conta;
  r record;
  v_sql text;
  v_n bigint;
  v_total bigint := 0;
  v_lote integer := least(greatest(coalesce(p_lote, 5000), 1), 50000);
  v_rapido boolean := true;
  v_parou boolean := false;
  v_soltos uuid[];
  r_login record;
begin
  select * into x from public.exclusoes_conta where id = p_pedido and cancelado_em is null and apagado_em is null for update;
  if not found then return jsonb_build_object('feito', false, 'linhas', 0, 'usuarios', '[]'::jsonb, 'sumiu', true); end if;

  if x.comecou_em is null then
    -- só na primeira vez: os logins da equipe, os arquivos para a fila e os convites antigos (o que os gatilhos fariam)
    select coalesce(array_agg(distinct m.user_id), '{}') into x.membros from public.profissionais m where m.petshop_id = x.petshop_id and m.user_id is not null;
    insert into public.arquivos_lixo (bucket, caminho, petshop_id, motivo)
    select o.bucket_id, o.name, x.petshop_id, 'conta_apagada' from storage.objects o
     where o.bucket_id in ('pets', 'diario', 'boletim', 'caderno-tmp', 'entrada') and o.name like x.petshop_id::text || '/%'
    on conflict do nothing;
    insert into public.convites_equipe_antigos (codigo_hash, petshop_id, motivo)
    select c.codigo_hash, c.petshop_id, case when c.usado_em is not null then 'usado' else 'cancelado' end
      from public.convites_equipe c where c.petshop_id = x.petshop_id and c.codigo_hash ~ '^[0-9a-f]{64}$'
    on conflict (codigo_hash) do update set motivo = excluded.motivo, em = now();
    update public.exclusoes_conta set comecou_em = now(), membros = x.membros where id = x.id;
  end if;

  if exists (select 1 from public.gestao_loja_plano() t where t.modo in ('sem', 'fora')) then v_rapido := false; end if;
  if v_rapido then
    begin
      -- como comando (não set_config): é assim que o Supabase deixa o dono das funções trocar este ajuste
      set local session_replication_role = replica;
      if current_setting('session_replication_role') <> 'replica' then v_rapido := false; end if;
    exception when others then v_rapido := false;
    end;
  end if;

  if v_rapido then
    for r in select * from public.gestao_loja_plano() t order by t.ordem loop
      if r.modo = 'loja' then
        v_sql := format('delete from %s where ctid = any (array(select t.ctid from %s t where t.petshop_id = $1 limit $2))', r.tabela, r.tabela);
      else
        v_sql := format('delete from %s where ctid = any (array(select t.ctid from %s t where t.%I in (select p.%I from %s p where p.petshop_id = $1) limit $2))',
          r.tabela, r.tabela, r.coluna, r.coluna_pai, r.pai);
      end if;
      loop
        execute v_sql using x.petshop_id, v_lote;
        get diagnostics v_n = row_count;
        v_total := v_total + v_n;
        exit when v_n < v_lote;
        if clock_timestamp() >= p_ate then v_parou := true; exit; end if;
      end loop;
      exit when v_parou;
      if clock_timestamp() >= p_ate then v_parou := true; exit; end if;
    end loop;
    set local session_replication_role = origin;
    if v_parou then
      update public.exclusoes_conta set linhas_apagadas = linhas_apagadas + v_total, tentou_em = now(), erro = null where id = x.id;
      return jsonb_build_object('feito', false, 'linhas', v_total, 'usuarios', '[]'::jsonb);
    end if;
  end if;

  -- o pet shop e o que tiver sobrado, pela cascata normal (as ligações entre tabelas da mesma loja conferidas no fim: 20261213)
  set constraints all deferred;
  delete from public.petshops where id = x.petshop_id;
  delete from public.entrada_lixo where petshop_id = x.petshop_id;
  -- logins do Maestro que não ficaram em nenhum outro pet shop e não são da equipe Maestro Pet
  -- (20261236) e que não têm dados em outro produto do mesmo projeto: esses ficam, anotados em logins_mantidos
  v_soltos := '{}';
  for r_login in select u.id, public.login_fora_do_gestao(u.id) as onde from auth.users u
                  where u.id = any (coalesce(x.membros, '{}')) and coalesce(u.raw_user_meta_data ->> 'app', '') = 'maestro'
                    and not exists (select 1 from public.profissionais m where m.user_id = u.id)
                    and not exists (select 1 from public.admins a where a.user_id = u.id) loop
    if r_login.onde is null then v_soltos := v_soltos || r_login.id;
    else perform public.login_manter(r_login.id, x.petshop_id, r_login.onde);
    end if;
  end loop;
  insert into public.logins_lixo (user_id, petshop_id) select u, x.petshop_id from unnest(v_soltos) u on conflict (user_id) do nothing;
  update public.exclusoes_conta set apagado_em = now(), usuarios = cardinality(v_soltos), membros = null, erro = null,
    linhas_apagadas = linhas_apagadas + v_total, tentou_em = now() where id = x.id;
  insert into public.lgpd_registros (petshop_id, quem, quem_nome, acao, detalhe)
  values (x.petshop_id, null, 'Maestro Pet (automático)', 'conta_apagada', jsonb_build_object('pedido_em', x.pedido_em, 'logins', cardinality(v_soltos)));
  return jsonb_build_object('feito', true, 'linhas', v_total, 'usuarios', to_jsonb(v_soltos));
end $$;

revoke execute on function public.gestao_loja_apagar(bigint, timestamptz, integer) from public, anon, authenticated;
grant execute on function public.gestao_loja_apagar(bigint, timestamptz, integer) to service_role;

-- "Baixar os dados deste tutor". Mesma função da 20261222 (mesma assinatura e as mesmas planilhas). A mais: lista de espera,
-- checklist de entrada, orçamentos, prêmios, lista das fotos; nas estadias o endereço do leva e traz, os cuidados e os avisos;
-- nos pedidos pelo link o recado e o texto das regras aceitas; no cadastro, se não quer receber mensagens.
create or replace function public.cliente_dados(p_cliente uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  c public.clientes;
  v_fuso text;
  v_pets uuid[];
  v_fone text;
  v_arquivos jsonb := '[]'::jsonb;
  v_protocolo text;
  v_ags uuid[];
  v_ests uuid[];
begin
  select * into c from public.clientes where id = p_cliente;
  if not found or not public.sou_dono(c.petshop_id) then raise exception 'Cliente não encontrado.'; end if;
  select s.fuso into v_fuso from public.petshops s where s.id = c.petshop_id;
  select coalesce(array_agg(p.id), '{}') into v_pets from public.pets p where p.cliente_id = c.id and p.petshop_id = c.petshop_id;
  v_fone := nullif(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g'), '');
  select coalesce(array_agg(a.id), '{}') into v_ags from public.agendamentos a where a.pet_id = any (v_pets);
  select coalesce(array_agg(e.id), '{}') into v_ests from public.estadias e where e.pet_id = any (v_pets);

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'cadastro.csv', 'explica', 'O cadastro do tutor: nome, telefone, e-mail, endereço, aniversário e observações.',
    'colunas', jsonb_build_array('Nome', 'Telefone', 'E-mail', 'Endereço', 'Aniversário', 'Observações', 'Cliente desde', 'Não quer receber mensagens'),
    'linhas', jsonb_build_array(jsonb_build_array(c.nome, c.telefone, c.email, c.endereco,
      case when c.nascimento is null then null when extract(year from c.nascimento) = 1904 then to_char(c.nascimento, 'DD/MM') else to_char(c.nascimento, 'DD/MM/YYYY') end,
      c.obs, to_char(c.criado_em at time zone v_fuso, 'DD/MM/YYYY'), case when c.nao_quer_mensagens then 'Sim' else 'Não' end))));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'pets.csv', 'explica', 'Os pets do tutor.',
    'colunas', jsonb_build_array('Pet', 'Espécie', 'Raça', 'Porte', 'Sexo', 'Nascimento', 'Alertas', 'Observações', 'Ativo', 'Adicionado em'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(p.nome, public.lgpd_rotulo('especie', p.especie::text), p.raca, public.lgpd_rotulo('porte', p.porte::text),
                 public.lgpd_rotulo('sexo', p.sexo::text), public.lgpd_data_niver(p.nascimento), p.alertas, p.obs,
                 case when p.ativo then 'Sim' else 'Não' end, to_char(p.criado_em at time zone v_fuso, 'DD/MM/YYYY')) order by p.nome)
               from public.pets p where p.id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'saude.csv', 'explica', 'Vacinas, vermífugos, antipulgas e outros cuidados anotados na ficha dos pets.',
    'colunas', jsonb_build_array('Pet', 'Tipo', 'Nome', 'Aplicado em', 'Vence em', 'Observações'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(p.nome, public.lgpd_rotulo('saude', s.tipo::text), s.nome, to_char(s.aplicado_em, 'DD/MM/YYYY'), to_char(s.vence_em, 'DD/MM/YYYY'), s.obs) order by s.criado_em)
               from public.pets_saude s join public.pets p on p.id = s.pet_id where s.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'contatos.csv', 'explica', 'Outras pessoas anotadas para buscar ou para chamar em uma emergência.',
    'colunas', jsonb_build_array('Pet', 'Nome', 'Telefone', 'Relação', 'Observações'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(p.nome, k.nome, k.telefone, k.relacao, k.obs) order by k.criado_em)
               from public.pets_contatos k left join public.pets p on p.id = k.pet_id
              where k.petshop_id = c.petshop_id and (k.cliente_id = c.id or k.pet_id = any (v_pets))), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'agendamentos.csv', 'explica', 'Os horários de banho, tosa e outros serviços, com a situação e o preço.',
    'colunas', jsonb_build_array('Dia', 'Hora', 'Pet', 'Serviço', 'Situação', 'Preço', 'Leva e traz', 'Endereço do leva e traz', 'Observações'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(a.inicio at time zone v_fuso, 'DD/MM/YYYY'), to_char(a.inicio at time zone v_fuso, 'HH24:MI'),
                 p.nome, v.nome, public.lgpd_rotulo('agendamento', a.status::text), public.lgpd_brl(a.preco), case when a.leva_traz then 'Sim' else 'Não' end, a.endereco_leva_traz, a.obs) order by a.inicio)
               from public.agendamentos a join public.pets p on p.id = a.pet_id left join public.servicos v on v.id = a.servico_id
              where a.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'estadias.csv', 'explica', 'As estadias de creche e hotel.',
    'colunas', jsonb_build_array('Tipo', 'Pet', 'Entrada', 'Saída prevista', 'Saída', 'Situação', 'Diária', 'Valor cobrado', 'Observações', 'Endereço do leva e traz', 'Cuidados combinados', 'Avisos'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(public.lgpd_rotulo('estadia_tipo', e.tipo::text), p.nome, to_char(e.entrada at time zone v_fuso, 'DD/MM/YYYY HH24:MI'),
                 to_char(e.saida_prevista at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), to_char(e.saida at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), public.lgpd_rotulo('estadia', e.status::text),
                 public.lgpd_brl(e.valor_diaria), public.lgpd_brl(e.valor_cobrado), e.obs, e.endereco_leva_traz, e.cuidados::text,
                 case when e.avisos <> '{}'::jsonb then e.avisos::text end) order by e.entrada)
               from public.estadias e join public.pets p on p.id = e.pet_id where e.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'pacotes.csv', 'explica', 'Os pacotes comprados, com quanto já foi usado.',
    'colunas', jsonb_build_array('Pacote', 'Pet', 'Total', 'Usados', 'Preço', 'Comprado em', 'Vence em'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(k.nome, p.nome, k.total, k.usados, public.lgpd_brl(k.preco), to_char(k.comprado_em, 'DD/MM/YYYY'),
                 to_char(k.vence_em, 'DD/MM/YYYY')) order by k.comprado_em)
               from public.pacotes_clientes k join public.pets p on p.id = k.pet_id where k.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'mensalidades.csv', 'explica', 'As mensalidades da creche.',
    'colunas', jsonb_build_array('Mês', 'Pet', 'Total', 'Vencimento', 'Situação'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(m.mes, 'MM/YYYY'), p.nome, public.lgpd_brl(m.total), to_char(m.vencimento, 'DD/MM/YYYY'), public.lgpd_rotulo('mensalidade', m.status::text)) order by m.mes)
               from public.creche_cobrancas m join public.pets p on p.id = m.pet_id where m.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'financeiro.csv', 'explica', 'O que o tutor pagou e o que ficou a receber. Saídas (devoluções) com valor negativo.',
    'colunas', jsonb_build_array('Data', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'Pago', 'Vencimento'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(l.data, 'DD/MM/YYYY'), public.lgpd_rotulo('lancamento', l.tipo::text), l.categoria, l.descricao,
                 public.lgpd_brl(case when l.tipo = 'saida' then -l.valor else l.valor end), case when l.pago then 'Sim' else 'Não' end,
                 to_char(l.vencimento, 'DD/MM/YYYY')) order by l.data, l.criado_em)
               from public.lancamentos l where l.petshop_id = c.petshop_id and l.cliente_id = c.id and l.movimento is null), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'credito.csv', 'explica', 'Os movimentos do crédito do tutor (o que ficou guardado e o que foi usado).',
    'colunas', jsonb_build_array('Quando', 'Valor', 'Motivo'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(k.criado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), public.lgpd_brl(k.valor), k.motivo) order by k.criado_em)
               from public.clientes_creditos k where k.petshop_id = c.petshop_id and k.cliente_id = c.id), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'boletins.csv', 'explica', 'Os boletins mandados ao tutor (só as informações; as fotos ficam no aplicativo).',
    'colunas', jsonb_build_array('Pet', 'Feito em', 'Mandado em', 'Fotos', 'Página no ar até', 'Recado'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(p.nome, to_char(b.criado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'),
                 to_char(b.enviado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), coalesce(cardinality(b.fotos), 0),
                 to_char(b.expira_em at time zone v_fuso, 'DD/MM/YYYY'), b.texto) order by b.criado_em)
               from public.boletins b join public.pets p on p.id = b.pet_id where b.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'autorizacoes-de-fotos.csv', 'explica', 'As autorizações para postar as fotos dos pets nas redes do pet shop, com o texto que o tutor aceitou e quando tirou.',
    'colunas', jsonb_build_array('Pet', 'Autorizado em', 'Quais fotos', 'Perfil para marcar', 'Texto aceito', 'Tirada em', 'IP', 'Navegador'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(p.nome, to_char(f.autorizado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'),
                 case f.escopo when 'boletim' then 'Só as daquele boletim' else 'Daquele boletim e das próximas visitas' end, f.marcar, f.texto,
                 to_char(f.retirado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), f.ip, f.navegador) order by f.autorizado_em)
               from public.fotos_autorizacoes f join public.pets p on p.id = f.pet_id where f.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'pedidos-pelo-link.csv', 'explica', 'Os pedidos feitos pelo link de agendamento com o mesmo telefone do tutor, ou que viraram horário ou estadia de um pet dele.',
    'colunas', jsonb_build_array('Pedido em', 'Nome', 'Telefone', 'Pet', 'Para', 'Para quando', 'Situação', 'Recado', 'Recado depois do pedido', 'Aceitou as regras em', 'Texto das regras aceitas'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(d.criado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), d.tutor_nome, d.telefone, d.pet_nome, public.lgpd_rotulo('pedido_tipo', d.tipo::text),
                 to_char(d.inicio at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), public.lgpd_rotulo('pedido', d.status::text), d.obs, d.cliente_recado,
                 to_char(d.termos_aceitos_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), d.termos_texto) order by d.criado_em)
               from public.pedidos_agendamento d
              where d.petshop_id = c.petshop_id
                and ((v_fone is not null and regexp_replace(d.telefone, '\D', '', 'g') = v_fone)
                     or d.agendamento_id = any (v_ags) or d.estadia_id = any (v_ests))), '[]'::jsonb)));

  -- (20261236) o que faltava
  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'lista-de-espera.csv', 'explica', 'As vezes em que o tutor entrou na lista de espera da creche ou do hotel (pela ficha do pet ou pelo telefone).',
    'colunas', jsonb_build_array('Entrou em', 'Para', 'De', 'Até', 'Pet', 'Nome', 'Telefone', 'Observações', 'Veio de', 'Situação', 'Aceitou as regras em'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(w.criado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), public.lgpd_rotulo('estadia_tipo', w.tipo::text),
                 to_char(w.entrada, 'DD/MM/YYYY'), to_char(w.saida, 'DD/MM/YYYY'), w.pet_nome, w.tutor_nome, w.telefone, w.obs,
                 case w.origem when 'link' then 'Link de agendamento' else 'Equipe' end,
                 case w.status when 'esperando' then 'Esperando' when 'chamado' then 'Chamado' when 'atendido' then 'Atendido' when 'desistiu' then 'Desistiu' else w.status end,
                 to_char(w.termos_aceitos_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI')) order by w.criado_em)
               from public.lista_espera w
              where w.petshop_id = c.petshop_id
                and (w.pet_id = any (v_pets) or (v_fone is not null and regexp_replace(coalesce(w.telefone, ''), '\D', '', 'g') = v_fone))), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'checklist-de-entrada.csv', 'explica', 'Os checklists de entrada dos pets: o que foi anotado na chegada e quem aceitou (nome, quando, IP e navegador).',
    'colunas', jsonb_build_array('Pet', 'Feito em', 'Temperamento', 'Cuidados', 'Marcas e lesões', 'Sobre as lesões', 'Idoso ou doente', 'Pertences', 'Outros pertences',
                                 'Observações', 'Fotos', 'Aceito por', 'Aceito em', 'IP', 'Navegador', 'Devolvido em'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(p.nome, to_char(e.criado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), array_to_string(e.temperamento, ', '), e.cuidados,
                 array_to_string(e.lesoes, ', '), e.lesoes_obs, case when e.idoso_doente then 'Sim' else 'Não' end, array_to_string(e.pertences, ', '), e.pertences_outros,
                 e.obs, coalesce(cardinality(e.fotos), 0), e.aceite_nome, to_char(e.aceito_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), e.aceite_ip, e.aceite_navegador,
                 to_char(e.devolvido_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI')) order by e.criado_em)
               from public.entradas e join public.pets p on p.id = e.pet_id where e.petshop_id = c.petshop_id and e.pet_id = any (v_pets)), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'orcamentos.csv', 'explica', 'Os orçamentos feitos para o tutor (pela ficha ou pelo telefone).',
    'colunas', jsonb_build_array('Número', 'Feito em', 'Nome', 'Telefone', 'Itens', 'Total', 'Vale até', 'Situação', 'Observações'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(o.numero, to_char(o.criado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), o.nome, o.telefone,
                 (select string_agg(coalesce(i ->> 'nome', i ->> 'descricao', ''), '; ') from jsonb_array_elements(case when jsonb_typeof(o.itens) = 'array' then o.itens else '[]'::jsonb end) i),
                 public.lgpd_brl(o.total), to_char(o.validade, 'DD/MM/YYYY'), o.status, o.obs) order by o.criado_em)
               from public.orcamentos o
              where o.petshop_id = c.petshop_id
                and (o.cliente_id = c.id or (v_fone is not null and regexp_replace(coalesce(o.telefone, ''), '\D', '', 'g') = v_fone))), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'premios.csv', 'explica', 'Os prêmios de fidelidade que o tutor já resgatou.',
    'colunas', jsonb_build_array('Resgatado em', 'Prêmio', 'Atendimentos usados'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(to_char(f.criado_em at time zone v_fuso, 'DD/MM/YYYY HH24:MI'), f.premio, f.atendimentos) order by f.criado_em)
               from public.fidelidade_resgates f where f.petshop_id = c.petshop_id and f.cliente_id = c.id), '[]'::jsonb)));

  v_arquivos := v_arquivos || jsonb_build_array(jsonb_build_object(
    'arquivo', 'fotos.csv', 'explica', 'A lista das fotos guardadas dos pets (as imagens em si não entram no arquivo; peça ao pet shop).',
    'colunas', jsonb_build_array('Pet', 'O que é', 'Data', 'Arquivo'),
    'linhas', coalesce((select jsonb_agg(jsonb_build_array(x.pet, x.tipo, to_char(x.quando at time zone v_fuso, 'DD/MM/YYYY'), x.caminho) order by x.quando, x.caminho) from (
                 select p.nome as pet, 'Foto do perfil'::text as tipo, p.criado_em as quando, p.foto as caminho from public.pets p where p.id = any (v_pets) and p.foto is not null
                 union all select p.nome, 'Antes do atendimento', a.inicio, a.foto_antes from public.agendamentos a join public.pets p on p.id = a.pet_id where a.pet_id = any (v_pets) and a.foto_antes is not null
                 union all select p.nome, 'Depois do atendimento', a.inicio, a.foto_depois from public.agendamentos a join public.pets p on p.id = a.pet_id where a.pet_id = any (v_pets) and a.foto_depois is not null
                 union all select p.nome, 'Diário da creche ou do hotel', f.criado_em, f.caminho from public.diario_fotos f join public.pets p on p.id = f.pet_id where f.pet_id = any (v_pets)
                 union all select p.nome, 'Boletim', b.criado_em, u.caminho from public.boletins b join public.pets p on p.id = b.pet_id cross join lateral unnest(b.fotos) as u(caminho) where b.pet_id = any (v_pets)
                 union all select p.nome, 'Checklist de entrada', e.criado_em, u.caminho from public.entradas e join public.pets p on p.id = e.pet_id cross join lateral unnest(e.fotos) as u(caminho) where e.pet_id = any (v_pets)
               ) x), '[]'::jsonb)));

  perform public.lgpd_anotar(c.petshop_id, 'baixou_tutor', jsonb_build_object('cliente_id', c.id));
  -- o protocolo deste pedido (o registro acabou de ser gravado, nesta mesma chamada)
  select r.protocolo into v_protocolo from public.lgpd_registros r
   where r.petshop_id = c.petshop_id and r.acao = 'baixou_tutor' and r.detalhe ->> 'cliente_id' = c.id::text and r.quem is not distinct from (select auth.uid())
   order by r.id desc limit 1;
  return jsonb_build_object('cliente', c.nome, 'petshop', (select s.nome from public.petshops s where s.id = c.petshop_id),
                            'gerado_em', now(), 'arquivos', v_arquivos, 'protocolo', v_protocolo);
end $$;

revoke execute on function public.cliente_dados(uuid) from public, anon;
grant execute on function public.cliente_dados(uuid) to authenticated;

notify pgrst, 'reload schema';
