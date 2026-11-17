-- Checklist de entrada (20261202) e LGPD (20261199): as fotos e a assinatura do checklist também saem quando o dono apaga
-- os dados de um tutor (cliente_anonimizar) e quando a conta é apagada (gestao_exclusoes_processar). Os arquivos vão para a
-- fila arquivos_lixo, que a faxina diária apaga do bucket 'entrada'.

alter table public.arquivos_lixo drop constraint if exists arquivos_lixo_bucket_check;
alter table public.arquivos_lixo add constraint arquivos_lixo_bucket_check check (bucket in ('pets', 'diario', 'boletim', 'caderno-tmp', 'entrada'));

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

  update public.pets p set nome = 'Pet removido', raca = null, nascimento = null, alertas = null, obs = null, foto = null, ativo = false
   where p.id = any (v_pets);
  update public.clientes set nome = 'Cliente removido', telefone = null, email = null, endereco = null, obs = null where id = c.id;

  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  perform set_config('maestro.lgpd', '', true);

  insert into public.lgpd_registros (petshop_id, quem, quem_nome, acao, detalhe)
  values (c.petshop_id, v_uid, (select x.nome from public.profissionais x where x.petshop_id = c.petshop_id and x.user_id = v_uid limit 1), 'apagou_tutor',
          jsonb_build_object('cliente_id', c.id, 'pets', cardinality(v_pets), 'lancamentos', v_n_lanc, 'arquivos', v_arquivos));
  return jsonb_build_object('ok', true, 'pets', cardinality(v_pets), 'lancamentos', v_n_lanc, 'arquivos', v_arquivos);
end $$;

create or replace function public.gestao_exclusoes_processar(p_petshop uuid default null, p_limite int default 5) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  x public.exclusoes_conta;
  v_membros uuid[];
  v_soltos uuid[];
  v_lojas int := 0;
  v_usuarios uuid[] := '{}';
begin
  perform pg_advisory_xact_lock(hashtext('gestao_exclusoes_processar'));
  for x in select * from public.exclusoes_conta
            where cancelado_em is null and apagado_em is null and apagar_em <= now() and (p_petshop is null or petshop_id = p_petshop)
            order by apagar_em limit least(greatest(coalesce(p_limite, 5), 1), 50) loop
    select coalesce(array_agg(distinct m.user_id), '{}') into v_membros from public.profissionais m where m.petshop_id = x.petshop_id and m.user_id is not null;
    insert into public.arquivos_lixo (bucket, caminho, petshop_id, motivo)
    select o.bucket_id, o.name, x.petshop_id, 'conta_apagada' from storage.objects o
     where o.bucket_id in ('pets', 'diario', 'boletim', 'caderno-tmp', 'entrada') and o.name like x.petshop_id::text || '/%'
    on conflict do nothing;
    delete from public.petshops where id = x.petshop_id;
    delete from public.entrada_lixo where petshop_id = x.petshop_id;
    -- logins do Maestro que não ficaram em nenhum outro pet shop e não são da equipe Maestro Pet
    select coalesce(array_agg(u.id), '{}') into v_soltos from auth.users u
     where u.id = any (v_membros) and coalesce(u.raw_user_meta_data ->> 'app', '') = 'maestro'
       and not exists (select 1 from public.profissionais m where m.user_id = u.id)
       and not exists (select 1 from public.admins a where a.user_id = u.id);
    update public.exclusoes_conta set apagado_em = now(), usuarios = cardinality(v_soltos) where id = x.id;
    insert into public.lgpd_registros (petshop_id, quem, quem_nome, acao, detalhe)
    values (x.petshop_id, null, 'Maestro Pet (automático)', 'conta_apagada', jsonb_build_object('pedido_em', x.pedido_em, 'logins', cardinality(v_soltos)));
    v_lojas := v_lojas + 1;
    v_usuarios := v_usuarios || v_soltos;
  end loop;
  return jsonb_build_object('lojas', v_lojas, 'usuarios', to_jsonb(v_usuarios));
end $$;

revoke execute on function public.cliente_anonimizar(uuid, text), public.gestao_exclusoes_processar(uuid, int) from public, anon, authenticated;
grant execute on function public.cliente_anonimizar(uuid, text) to authenticated;
grant execute on function public.gestao_exclusoes_processar(uuid, int) to service_role;
