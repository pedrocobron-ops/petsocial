-- Apagar um pet shop inteiro (exclusão de conta pedida pelo dono, LGPD) falhava quando a loja tinha agendamentos,
-- pacotes, caixas etc.: as ligações entre tabelas da mesma loja eram conferidas no meio da cascata, antes de a
-- outra ponta ser apagada. As ligações abaixo passam a poder ser conferidas no fim (DEFERRABLE INITIALLY IMMEDIATE:
-- nada muda no uso normal). gestao_exclusoes_processar adia a conferência só enquanto apaga a loja.
-- gestao_exclusoes_processar: cópia de 20261202500000 + "set constraints all deferred".
alter table public.pacotes alter constraint pacotes_servico_id_petshop_id_fkey deferrable initially immediate;
alter table public.pacotes_clientes alter constraint pacotes_clientes_pacote_id_petshop_id_fkey deferrable initially immediate;
alter table public.pacotes_clientes alter constraint pacotes_clientes_servico_id_petshop_id_fkey deferrable initially immediate;
alter table public.agendamentos alter constraint agendamentos_pacote_cliente_id_petshop_id_fkey deferrable initially immediate;
alter table public.agendamentos alter constraint agendamentos_servico_id_petshop_id_fkey deferrable initially immediate;
alter table public.agendamentos alter constraint agendamentos_profissional_id_petshop_id_fkey deferrable initially immediate;
alter table public.lancamentos alter constraint lancamentos_caixa_id_petshop_id_fkey deferrable initially immediate;
alter table public.produtos alter constraint produtos_fornecedor_fkey deferrable initially immediate;
alter table public.movimentos_estoque alter constraint movimentos_estoque_fornecedor_fkey deferrable initially immediate;
alter table public.creche_cobrancas alter constraint creche_cobrancas_plano_id_fkey deferrable initially immediate;
alter table public.agendamento_servicos alter constraint agendamento_servicos_servico_id_petshop_id_fkey deferrable initially immediate;

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
  set constraints all deferred;
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

grant execute on function public.gestao_exclusoes_processar(uuid, int) to service_role;
revoke execute on function public.gestao_exclusoes_processar(uuid, int) from public, anon, authenticated;
