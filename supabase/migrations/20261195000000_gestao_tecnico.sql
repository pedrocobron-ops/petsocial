-- ============================================================
-- Gestão: três melhorias técnicas (nada muda para quem usa; o aplicativo de antes segue funcionando com esta migração).
--
-- Aditiva: só acrescenta funções, uma tabela, um bucket privado com as regras dele e (se houver pg_cron) uma tarefa agendada.
-- Nenhuma tabela, regra ou função que já existe muda. Pode rodar de novo.
--
-- 1. gestao_hoje(p, a): o que a tela Hoje mostra no primeiro olhar numa ida só ao banco, no lugar de uns vinte pedidos.
--    Com o login de quem pede (security invoker): as regras de cada tabela (RLS e colunas liberadas) valem igual às da leitura
--    pela API, e os preços saem pela mesma agendamentos_precos (com a mesma conferência de área). Cada parte só roda quando a
--    pessoa tem a área (o aparelho manda o que já sabe; o banco confere de novo pelas regras das tabelas). As datas vêm do
--    aparelho (o começo do dia de hoje no relógio dele), como na leitura antiga. Sem a função, a tela lê do jeito antigo.
--
-- 2. Faxina agendada:
--    gestao_faxina_banco()       a faxina do banco (boletim_faxina_geral + reservas velhas do caderno). Se o pg_cron estiver
--                                disponível, roda todo dia às 06:17 UTC (tarefa 'gestao-faxina-diaria'); se não, nada muda.
--    gestao_faxina_arquivos(n)   para a rota /api/gestao/faxina (Vercel Cron, chave de serviço só no servidor): põe na fila as
--                                fotos do boletim que ficaram sem boletim (mais de um dia), em todos os pet shops, e devolve
--                                os caminhos a apagar pela API do Storage (o banco não apaga arquivo direto), mais os PDFs do
--                                caderno-tmp com mais de uma hora. Só a chave de serviço chama.
--
-- 3. Caderno:
--    bucket privado 'caderno-tmp': PDF grande (o limite de envio da Vercel é ~4,5 MB) sobe antes, em <petshop>/<aleatório>.pdf,
--    só por quem tem a área Clientes com a conta liberada; a rota lê com o login da pessoa e apaga logo depois de ler.
--    caderno_reservar(petshop, páginas): igual a caderno_contar, e devolve uma reserva. caderno_devolver(reserva): a leitura
--    falhou (erro do modelo, demora, recusa): as páginas voltam. Tudo com a mesma trava de caderno_contar (atômico).
--    A reserva só vai para o servidor (a rota chama com o login da pessoa, e o número não volta para o aparelho).
-- ============================================================

-- ---------- 1. tela Hoje ----------
create or replace function public.gestao_hoje(p uuid, a jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path to ''
as $$
declare
  v_ini timestamptz := (a->>'hoje_ini')::timestamptz;
  v_amanha timestamptz := (a->>'amanha')::timestamptz;
  v_depois timestamptz := (a->>'depois')::timestamptz;
  v_seg timestamptz := (a->>'seg')::timestamptz;
  v_seg7 timestamptz := (a->>'seg7')::timestamptz;
  v_ha30 timestamptz := (a->>'ha30')::timestamptz;
  v_dia date := (a->>'dia')::date;
  v_ha6 date := (a->>'ha6')::date;
  v_mais7 date := (a->>'mais7')::date;
  v_estoque boolean := coalesce((a->>'estoque')::boolean, false);
  v_fin boolean := coalesce((a->>'financeiro')::boolean, false);
  v_cuido boolean := coalesce((a->>'cuido')::boolean, false);
  v_pacotes boolean := coalesce((a->>'pacotes')::boolean, false);
  v_cobrar boolean := coalesce((a->>'cobrar')::boolean, false);
  v_cobrar_hoje boolean := coalesce((a->>'cobrar_hoje')::boolean, false);
  v_devol text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(coalesce(a->'devolucao', '[]'::jsonb)) x), array[]::text[]);
  v_r jsonb := '{}'::jsonb;
  v_lista jsonb;
  v_ids uuid[];
  v_x jsonb;
  v_n int;
begin
  -- agenda de hoje, com pet, tutor, serviços e profissional (o mesmo que SELECT_AGENDAMENTO)
  select coalesce(jsonb_agg(to_jsonb(x) order by x.inicio, x.id), '[]'::jsonb), coalesce(array_agg(x.id), array[]::uuid[]) into v_lista, v_ids from (
    select g.id, g.petshop_id, g.pet_id, g.servico_id, g.profissional_id, g.inicio, g.fim, g.status, g.obs, g.leva_traz, g.endereco_leva_traz,
      g.checklist, g.pacote_cliente_id, g.lembrete_em, g.origem, g.criado_por, g.criado_em, g.serie_id, g.foto_antes, g.foto_depois,
      g.pronto_avisado_em, g.sem_cobranca, g.sem_cobranca_em, g.sem_cobranca_nome,
      (select to_jsonb(y) from (
        select pe.id, pe.nome, pe.foto, pe.porte, pe.especie, pe.raca, pe.alertas,
          (select to_jsonb(z) from (select c.id, c.nome, c.telefone from public.clientes c where c.id = pe.cliente_id) z) as clientes
        from public.pets pe where pe.id = g.pet_id) y) as pets,
      (select to_jsonb(y) from (select s.id, s.nome, s.cor, s.categoria from public.servicos s where s.id = g.servico_id) y) as servicos,
      (select to_jsonb(y) from (select f.id, f.nome, f.cor from public.profissionais f where f.id = g.profissional_id) y) as profissionais,
      coalesce((select jsonb_agg(to_jsonb(y) order by y.ordem, y.id) from (
        select o.id, o.servico_id, o.ordem,
          (select to_jsonb(w) from (select s.id, s.nome, s.cor, s.categoria from public.servicos s where s.id = o.servico_id) w) as servicos
        from public.agendamento_servicos o where o.agendamento_id = g.id) y), '[]'::jsonb) as agendamento_servicos
    from public.agendamentos g
    where g.petshop_id = p and g.inicio >= v_ini and g.inicio < v_amanha
  ) x;
  v_r := v_r || jsonb_build_object('lista', v_lista);
  -- os preços: a mesma função de sempre (só quem recebe vê; os outros recebem a lista sem preço)
  begin
    v_r := v_r || jsonb_build_object('precos', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'preco', r.preco)) from public.agendamentos_precos(p, v_ids) r), '[]'::jsonb));
  exception when others then v_r := v_r || jsonb_build_object('precos', null);
  end;

  v_r := v_r || jsonb_build_object(
    'amanha', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select g.id, g.lembrete_em, g.status,
        (select to_jsonb(y) from (select (select to_jsonb(z) from (select c.id, c.telefone from public.clientes c where c.id = pe.cliente_id) z) as clientes
           from public.pets pe where pe.id = g.pet_id) y) as pets
      from public.agendamentos g where g.petshop_id = p and g.inicio >= v_amanha and g.inicio < v_depois) x), '[]'::jsonb),
    'em_casa', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select e.id, e.status, e.entrada, e.saida_prevista from public.estadias e
      where e.petshop_id = p and e.status in ('em_casa', 'reservada') limit 1000) x), '[]'::jsonb),
    'contagens', public.gestao_contagens(p),
    'semana', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select g.inicio, g.status from public.agendamentos g where g.petshop_id = p and g.inicio >= v_seg and g.inicio < v_seg7) x), '[]'::jsonb),
    -- serviços mais pedidos nos últimos 30 dias: na ordem em que cada um apareceu primeiro (a tela ordena pelo total)
    'servicos_mes', coalesce((select jsonb_agg(jsonb_build_object('rotulo', x.nome, 'valor', x.n, 'cor', x.cor) order by x.primeiro) from (
      select y.nome, count(*) as n, (array_agg(y.cor order by y.k))[1] as cor, min(y.k) as primeiro from (
        select s.nome, s.cor, row_number() over (order by g.inicio, g.id) as k
        from public.agendamentos g join public.servicos s on s.id = g.servico_id
        where g.petshop_id = p and g.inicio >= v_ha30 and g.inicio < v_amanha and g.status not in ('cancelado', 'faltou')) y
      group by y.nome) x), '[]'::jsonb),
    'proximos', coalesce((select jsonb_agg(to_jsonb(x) order by x.inicio, x.id) from (
      select g.id, g.inicio, (select to_jsonb(y) from (select pe.nome from public.pets pe where pe.id = g.pet_id) y) as pets
      from public.agendamentos g where g.petshop_id = p and g.inicio >= v_amanha and g.status in ('marcado', 'confirmado')
      order by g.inicio, g.id limit 2) x), '[]'::jsonb),
    'sem_fechar_total', (select count(*) from public.agendamentos g where g.petshop_id = p and g.inicio < v_ini and g.status in ('marcado', 'confirmado', 'em_atendimento')),
    'sem_fechar', coalesce((select jsonb_agg(to_jsonb(x) order by x.inicio, x.id) from (
      select g.id, g.inicio, (select to_jsonb(y) from (select pe.nome from public.pets pe where pe.id = g.pet_id) y) as pets
      from public.agendamentos g where g.petshop_id = p and g.inicio < v_ini and g.status in ('marcado', 'confirmado', 'em_atendimento')
      order by g.inicio, g.id limit 3) x), '[]'::jsonb)
  );

  -- estoque, dinheiro e pacotes: só para quem tem a área (como na leitura antiga)
  if v_estoque then
    v_r := v_r || jsonb_build_object('acabando', coalesce((select jsonb_agg(to_jsonb(x) order by x.nome, x.id) from (
      select d.id, d.nome, d.estoque, d.estoque_minimo from public.produtos d
      where d.petshop_id = p and d.ativo and d.estoque_minimo > 0) x), '[]'::jsonb));
  end if;
  if v_fin then
    v_r := v_r || jsonb_build_object('entradas', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select l.valor, l.tipo, l.categoria from public.lancamentos l
      where l.petshop_id = p and l.pago and l.movimento is null and l.data = v_dia) x), '[]'::jsonb));
  end if;
  if v_cuido then
    v_r := v_r || jsonb_build_object(
      'contas', coalesce((select jsonb_agg(to_jsonb(x)) from (
        select l.id, l.valor, l.vencimento, l.tipo, l.categoria from public.lancamentos l
        where l.petshop_id = p and not l.pago and l.vencimento <= v_dia) x), '[]'::jsonb),
      'ultimos7', coalesce((select jsonb_agg(jsonb_build_object('data', x.data, 'valor', x.valor) order by x.data) from (
        select l.data, sum(l.valor) as valor from public.lancamentos l
        where l.petshop_id = p and l.pago and l.tipo = 'entrada' and l.movimento is null and l.data >= v_ha6 and l.data <= v_dia
        group by l.data) x), '[]'::jsonb));
    -- devolução ao tutor e crédito deixado (ajustesDoFaturamento): cada parte que falhar vale vazia, como antes
    begin
      v_x := coalesce((select jsonb_agg(to_jsonb(x) order by x.data, x.id) from (
        select l.id, l.valor, l.data, l.cliente_id from public.lancamentos l
        where l.petshop_id = p and l.tipo = 'saida' and l.pago and l.movimento is null and l.categoria = any (v_devol)
          and l.data >= v_ha6 and l.data <= v_dia) x), '[]'::jsonb);
    exception when others then v_x := '[]'::jsonb;
    end;
    v_r := v_r || jsonb_build_object('devolucoes', v_x);
    begin
      v_x := coalesce((select jsonb_agg(to_jsonb(x) order by x.criado_em, x.id) from (
        select c.id, c.valor, c.criado_em, c.lancamento_id, c.cliente_id from public.clientes_creditos c
        where c.petshop_id = p and c.criado_em >= (a->>'cred_de')::timestamptz and c.criado_em < (a->>'cred_ate')::timestamptz) x), '[]'::jsonb);
    exception when others then v_x := '[]'::jsonb;
    end;
    v_r := v_r || jsonb_build_object('creditos', v_x);
  end if;
  if v_pacotes then
    v_r := v_r || jsonb_build_object('pacotes', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select k.id from public.pacotes_clientes k
      where k.petshop_id = p and k.ativo and k.vence_em >= v_dia and k.vence_em <= v_mais7) x), '[]'::jsonb));
  end if;

  -- saúde vencendo (buscarSaudeVencendo): os cuidados até o limite, depois os outros dos mesmos pets, e o nome dos pets ativos
  begin
    v_r := v_r || jsonb_build_object('saude', jsonb_build_object(
      'perto', coalesce((select jsonb_agg(to_jsonb(x) order by x.vence_em, x.id) from (
        select h.id, h.pet_id, h.tipo, h.nome, h.aplicado_em, h.vence_em, h.criado_em from public.pets_saude h
        where h.petshop_id = p and h.vence_em <= (a->>'saude_ate')::date) x), '[]'::jsonb),
      'depois', coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from (
        select h.id, h.pet_id, h.tipo, h.nome, h.aplicado_em, h.vence_em, h.criado_em from public.pets_saude h
        where h.petshop_id = p and (h.vence_em > (a->>'saude_ate')::date or h.vence_em is null)
          and h.pet_id in (select q.pet_id from public.pets_saude q where q.petshop_id = p and q.vence_em <= (a->>'saude_ate')::date)) x), '[]'::jsonb),
      'pets', coalesce((select jsonb_agg(jsonb_build_object('id', pe.id, 'nome', pe.nome)) from public.pets pe
        where pe.petshop_id = p and pe.ativo
          and pe.id in (select q.pet_id from public.pets_saude q where q.petshop_id = p and q.vence_em <= (a->>'saude_ate')::date)), '[]'::jsonb)));
  exception when others then v_r := v_r || jsonb_build_object('saude', null);
  end;

  -- creche e hotel para quem recebe: check-outs sem cobrança e saídas depois do horário esperando a decisão da taxa
  if v_cobrar then
    begin
      select count(*) into v_n from (select 1 from public.estadias_para_cobrar(p) limit 150) x;
    exception when others then v_n := 0;
    end;
    v_r := v_r || jsonb_build_object('para_cobrar', v_n);
    begin
      select count(*) into v_n from public.creche_atrasos t
       where t.petshop_id = p and (t.estado = 'pendente' or (t.estado = 'recebida' and t.lancamento_id is null));
    exception when others then v_n := 0;
    end;
    v_r := v_r || jsonb_build_object('atrasos', v_n);
  end if;

  -- horários de hoje concluídos que ninguém cobrou (a marca "Falta cobrar" da lista e da frase do Mozart)
  if v_cobrar_hoje then
    begin
      v_r := v_r || jsonb_build_object('cobrar_hoje', coalesce((select jsonb_agg(c.id) from public.agendamentos_para_cobrar(p, v_dia, v_dia) c), '[]'::jsonb));
    exception when others then v_r := v_r || jsonb_build_object('cobrar_hoje', null);
    end;
  end if;

  return v_r;
end
$$;

revoke execute on function public.gestao_hoje(uuid, jsonb) from public, anon;
grant execute on function public.gestao_hoje(uuid, jsonb) to authenticated;

-- ---------- 3. caderno: reserva das páginas e devolução quando a leitura falha ----------
create table if not exists public.caderno_reservas (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  dia date not null,
  paginas int not null check (paginas > 0),
  criado_em timestamptz not null default now()
);
create index if not exists caderno_reservas_criado on public.caderno_reservas (criado_em);
alter table public.caderno_reservas enable row level security;
-- sem regra: ninguém lê nem grava direto; só as funções abaixo
revoke all on public.caderno_reservas from public, anon, authenticated;

-- Igual a caderno_contar (mesmos limites, mesma trava), e devolve {reserva} quando as páginas entraram na conta.
create or replace function public.caderno_reservar(p_petshop uuid, p_paginas int) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v jsonb; v_dia date; v_id uuid;
begin
  v := public.caderno_contar(p_petshop, p_paginas);
  if coalesce((v->>'ok')::boolean, false) and p_paginas > 0 then
    select (now() at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date into v_dia from public.petshops s where s.id = p_petshop;
    insert into public.caderno_reservas (petshop_id, dia, paginas) values (p_petshop, v_dia, p_paginas) returning id into v_id;
    v := v || jsonb_build_object('reserva', v_id);
  end if;
  return v;
end $$;

-- A leitura falhou: as páginas da reserva voltam (uma vez só, até uma hora depois, por quem tem a área Clientes).
create or replace function public.caderno_devolver(p_reserva uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare r public.caderno_reservas; v_lim int := public.link_limite('caderno_dia', 30); v_usadas int;
begin
  perform pg_advisory_xact_lock(hashtextextended('caderno_uso', 0));
  select * into r from public.caderno_reservas x where x.id = p_reserva;
  if r.id is null or r.criado_em < now() - interval '1 hour' or not public.tenho_area(r.petshop_id, array['clientes']) then
    return jsonb_build_object('ok', false);
  end if;
  delete from public.caderno_reservas x where x.id = r.id;
  update public.caderno_uso u set paginas = greatest(u.paginas - r.paginas, 0), leituras = greatest(u.leituras - 1, 0)
   where u.petshop_id = r.petshop_id and u.dia = r.dia;
  select coalesce(sum(u.paginas), 0) into v_usadas from public.caderno_uso u where u.petshop_id = r.petshop_id and u.dia = r.dia;
  return jsonb_build_object('ok', true, 'restam', greatest(v_lim - v_usadas, 0), 'limite', v_lim);
end $$;

revoke execute on function public.caderno_reservar(uuid, int), public.caderno_devolver(uuid) from public, anon;
grant execute on function public.caderno_reservar(uuid, int), public.caderno_devolver(uuid) to authenticated;

-- o bucket privado dos PDFs grandes: sobe, a rota lê e apaga na hora; o que sobrar sai na faxina (mais de uma hora)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('caderno-tmp', 'caderno-tmp', false, 10485760, array['application/pdf'])
  on conflict (id) do nothing;

drop policy if exists caderno_tmp_enviar on storage.objects;
create policy caderno_tmp_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'caderno-tmp' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.pdf$'
    and public.diario_pasta(name) in (select public.meus_petshops())
    and public.tenho_area(public.diario_pasta(name), array['clientes'])
    and public.acesso_liberado(public.diario_pasta(name)));
drop policy if exists caderno_tmp_ler on storage.objects;
create policy caderno_tmp_ler on storage.objects for select to authenticated
  using (bucket_id = 'caderno-tmp' and public.diario_pasta(name) in (select public.meus_petshops())
    and public.tenho_area(public.diario_pasta(name), array['clientes']));
drop policy if exists caderno_tmp_apagar on storage.objects;
create policy caderno_tmp_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'caderno-tmp' and public.diario_pasta(name) in (select public.meus_petshops())
    and public.tenho_area(public.diario_pasta(name), array['clientes']));

-- ---------- 2. faxina agendada ----------
-- A faxina do banco (sem arquivos): álbuns vencidos e freios antigos do boletim, reservas velhas do caderno.
create or replace function public.gestao_faxina_banco() returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_albuns int; v_reservas int;
begin
  v_albuns := public.boletim_faxina_geral();
  delete from public.caderno_reservas r where r.criado_em < now() - interval '1 day';
  get diagnostics v_reservas = row_count;
  return jsonb_build_object('albuns', v_albuns, 'reservas', v_reservas);
end $$;

-- Para a rota /api/gestao/faxina (chave de serviço): a faxina do banco, a fila do boletim de todos os pet shops
-- (o mesmo que boletim_faxina faz por pet shop) e os PDFs do caderno-tmp com mais de uma hora. Devolve o que apagar no Storage.
-- p_petshop: só os arquivos desse pet shop, sem a faxina do banco (para os testes não mexerem no que é de outros).
create or replace function public.gestao_faxina_arquivos(p_limite int default 500, p_petshop uuid default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_banco jsonb; v_boletim jsonb; v_caderno jsonb; v_lim int := least(greatest(coalesce(p_limite, 500), 1), 1000);
begin
  perform pg_advisory_xact_lock(hashtext('gestao_faxina_arquivos'));
  v_banco := case when p_petshop is null then public.gestao_faxina_banco() else jsonb_build_object('albuns', 0, 'reservas', 0) end;

  insert into public.boletim_lixo (caminho, petshop_id, motivo)
  select o.name, public.diario_pasta(o.name), 'sem_boletim' from storage.objects o
   where o.bucket_id = 'boletim' and o.created_at < now() - interval '1 day'
     and public.diario_pasta(o.name) is not null and (p_petshop is null or public.diario_pasta(o.name) = p_petshop)
     and exists (select 1 from public.petshops s where s.id = public.diario_pasta(o.name))
     and not exists (select 1 from public.boletins b where o.name = any (b.fotos))
   limit 2000
  on conflict (caminho) do nothing;

  delete from public.boletim_lixo l
   where (p_petshop is null or l.petshop_id = p_petshop)
     and not exists (select 1 from storage.objects o where o.bucket_id = 'boletim' and o.name = l.caminho);

  with v as (
    update public.boletim_lixo l set tentativas = l.tentativas + 1
     where l.caminho in (select x.caminho from public.boletim_lixo x where x.tentativas < 20 and (p_petshop is null or x.petshop_id = p_petshop)
                          and not exists (select 1 from public.boletins b where x.caminho = any (b.fotos))
                          order by x.criado_em limit v_lim)
    returning l.caminho)
  select coalesce(jsonb_agg(v.caminho), '[]'::jsonb) into v_boletim from v;
  -- fotos de pet shop que já foi apagado (não entram na fila: ela é por pet shop)
  v_boletim := v_boletim || coalesce((select jsonb_agg(x.name) from (
    select o.name from storage.objects o
     where o.bucket_id = 'boletim' and o.created_at < now() - interval '1 day' and p_petshop is null
       and not exists (select 1 from public.petshops s where s.id = public.diario_pasta(o.name))
     order by o.created_at limit v_lim) x), '[]'::jsonb);

  select coalesce(jsonb_agg(x.name), '[]'::jsonb) into v_caderno from (
    select o.name from storage.objects o where o.bucket_id = 'caderno-tmp' and o.created_at < now() - interval '1 hour'
      and (p_petshop is null or public.diario_pasta(o.name) = p_petshop)
    order by o.created_at limit v_lim) x;

  return jsonb_build_object('banco', v_banco, 'boletim', v_boletim, 'caderno_tmp', v_caderno);
end $$;

revoke execute on function public.gestao_faxina_banco(), public.gestao_faxina_arquivos(int, uuid) from public, anon, authenticated;
grant execute on function public.gestao_faxina_banco(), public.gestao_faxina_arquivos(int, uuid) to service_role;

-- pg_cron, se o banco tiver: a faxina do banco todo dia. Sem pg_cron (ou sem permissão), segue sem a tarefa: a rota
-- /api/gestao/faxina (Vercel Cron) também chama a faxina do banco.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      execute $c$select cron.schedule('gestao-faxina-diaria', '17 6 * * *', 'select public.gestao_faxina_banco()')$c$;
    exception when others then
      raise notice 'pg_cron indisponível aqui (%): a faxina do banco fica só com a rota /api/gestao/faxina.', sqlerrm;
    end;
  else
    raise notice 'sem pg_cron: a faxina do banco fica só com a rota /api/gestao/faxina.';
  end if;
end $$;

notify pgrst, 'reload schema';
