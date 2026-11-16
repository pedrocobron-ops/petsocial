-- Creche: os valores dos planos e as cobranças passam a ser de quem cuida do financeiro (área Financeiro ou Relatórios, e o dono),
-- pela mesma regra do resto do dinheiro (cuido_do_financeiro, de 20261136). Quem só opera o caixa continua recebendo no check-out,
-- que não lê estas tabelas, mas não lê mais preço de plano nem cobrança.
-- Só troca regras e o corpo das funções: nenhuma assinatura muda.

drop policy creche_planos_valores_ler on public.creche_planos_valores;
drop policy creche_planos_valores_criar on public.creche_planos_valores;
drop policy creche_planos_valores_editar on public.creche_planos_valores;
drop policy creche_planos_valores_remover on public.creche_planos_valores;
create policy creche_planos_valores_ler on public.creche_planos_valores for select to authenticated
  using ((select public.cuido_do_financeiro(petshop_id)));
create policy creche_planos_valores_criar on public.creche_planos_valores for insert to authenticated
  with check ((select public.cuido_do_financeiro(petshop_id)) and (select public.acesso_liberado(petshop_id)));
create policy creche_planos_valores_editar on public.creche_planos_valores for update to authenticated
  using ((select public.cuido_do_financeiro(petshop_id)) and (select public.acesso_liberado(petshop_id)))
  with check ((select public.cuido_do_financeiro(petshop_id)));
create policy creche_planos_valores_remover on public.creche_planos_valores for delete to authenticated
  using ((select public.cuido_do_financeiro(petshop_id)) and (select public.acesso_liberado(petshop_id)));

drop policy creche_cobrancas_ler on public.creche_cobrancas;
create policy creche_cobrancas_ler on public.creche_cobrancas for select to authenticated
  using ((select public.cuido_do_financeiro(petshop_id)));

-- As funções de cobrança, iguais às de 20261134, conferindo cuido_do_financeiro.
create or replace function public.creche_cobranca_criar(p_plano uuid, p_mes date, p_valor numeric default null, p_desconto numeric default 0,
  p_vencimento date default null, p_obs text default null, p_reabrir boolean default false) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  pl public.creche_planos;
  s public.petshops;
  v public.creche_planos_valores;
  c public.creche_cobrancas;
  v_mes date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month - 1 day')::date;
  v_cliente uuid;
  v_mensal numeric(10, 2);
  v_unit numeric(10, 2);
  v_extras jsonb;
  v_extras_total numeric(10, 2);
  v_desconto numeric(10, 2) := greatest(coalesce(p_desconto, 0), 0);
  v_venc date;
  v_id uuid;
begin
  select * into pl from public.creche_planos where id = p_plano for update;
  if not found or not public.cuido_do_financeiro(pl.petshop_id) then raise exception 'Plano não encontrado.'; end if;
  if not public.acesso_liberado(pl.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if p_mes is null then raise exception 'Escolha o mês.'; end if;
  select * into c from public.creche_cobrancas where plano_id = pl.id and mes = v_mes;
  if found and (c.status = 'aberta' or not coalesce(p_reabrir, false)) then return c.id; end if;
  if pl.inicio > v_fim or (pl.fim is not null and pl.fim < v_mes) then raise exception 'O plano não vale nesse mês.'; end if;
  select * into s from public.petshops where id = pl.petshop_id;
  select * into v from public.creche_planos_valores where plano_id = pl.id;
  if v.plano_id is null then raise exception 'Defina o valor da mensalidade deste plano antes de gerar a cobrança.'; end if;
  v_mensal := coalesce(p_valor, public.creche_sugestao_mensal(pl.id, v_mes, v.valor_mensal));
  if v_mensal < 0 or v_mensal > 99999.99 then raise exception 'Confira o valor da mensalidade.'; end if;
  v_unit := coalesce(v.valor_extra, s.diaria_creche, 0);
  select coalesce(jsonb_agg(jsonb_build_object('dia', e.dia, 'valor', v_unit) order by e.dia), '[]'::jsonb), coalesce(count(*) * v_unit, 0)
    into v_extras, v_extras_total
    from public.estadias e
    where e.pet_id = pl.pet_id and e.mensalista = 'extra' and e.status <> 'cancelada' and e.cobranca_id is null and e.dia < v_mes;
  if v_desconto > v_mensal + v_extras_total then raise exception 'O desconto é maior que a cobrança.'; end if;
  v_venc := coalesce(p_vencimento, greatest(make_date(extract(year from v_mes)::int, extract(month from v_mes)::int, pl.vence_dia), least(pl.inicio, v_fim)));
  select cliente_id into v_cliente from public.pets where id = pl.pet_id;

  if c.id is not null then
    update public.creche_cobrancas set status = 'aberta', cliente_id = v_cliente, valor_cheio = v.valor_mensal, valor_mensal = v_mensal, extras = v_extras,
      valor_extras = v_extras_total, desconto = v_desconto, total = v_mensal + v_extras_total - v_desconto, vencimento = v_venc,
      obs = nullif(left(btrim(coalesce(p_obs, '')), 300), ''), cobrado_em = null, lancamento_id = null
      where id = c.id returning id into v_id;
  else
    insert into public.creche_cobrancas (petshop_id, plano_id, pet_id, cliente_id, mes, valor_cheio, valor_mensal, extras, valor_extras, desconto, total, vencimento, obs)
      values (pl.petshop_id, pl.id, pl.pet_id, v_cliente, v_mes, v.valor_mensal, v_mensal, v_extras, v_extras_total, v_desconto,
        v_mensal + v_extras_total - v_desconto, v_venc, nullif(left(btrim(coalesce(p_obs, '')), 300), ''))
      returning id into v_id;
  end if;
  perform set_config('maestro.creche', '1', true);
  update public.estadias e set cobranca_id = v_id
    where e.pet_id = pl.pet_id and e.mensalista = 'extra' and e.status <> 'cancelada' and e.cobranca_id is null and e.dia < v_mes;
  perform public.creche_cobranca_lancar(v_id);
  return v_id;
end $$;
create or replace function public.creche_gerar_cobrancas(p_petshop uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  s public.petshops;
  v_mes date;
  v_fim date;
  v_n int := 0;
  r record;
begin
  if not public.cuido_do_financeiro(p_petshop) or not public.acesso_liberado(p_petshop) then return 0; end if;
  select * into s from public.petshops where id = p_petshop;
  v_mes := date_trunc('month', (now() at time zone s.fuso)::date)::date;
  v_fim := (v_mes + interval '1 month - 1 day')::date;
  for r in
    select pl.id, v.valor_mensal from public.creche_planos pl
    join public.creche_planos_valores v on v.plano_id = pl.id
    where pl.petshop_id = p_petshop and pl.inicio <= v_fim and (pl.fim is null or pl.fim >= v_mes)
      and not exists (select 1 from public.creche_cobrancas c where c.plano_id = pl.id and c.mes = v_mes)
  loop
    if public.creche_sugestao_mensal(r.id, v_mes, r.valor_mensal) = r.valor_mensal then
      perform public.creche_cobranca_criar(r.id, v_mes);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
create or replace function public.creche_cobranca_editar(p_id uuid, p_valor numeric, p_desconto numeric, p_vencimento date, p_obs text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  c public.creche_cobrancas;
  v_desconto numeric(10, 2) := greatest(coalesce(p_desconto, 0), 0);
begin
  select * into c from public.creche_cobrancas where id = p_id for update;
  if not found or not public.cuido_do_financeiro(c.petshop_id) then raise exception 'Cobrança não encontrada.'; end if;
  if not public.acesso_liberado(c.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if c.status <> 'aberta' then raise exception 'Esta cobrança foi cancelada.'; end if;
  if public.creche_cobranca_paga(c.lancamento_id) then raise exception 'Esta mensalidade já foi paga. Desfaça o recebimento antes de alterar.'; end if;
  if p_valor is null or p_valor < 0 or p_valor > 99999.99 then raise exception 'Confira o valor da mensalidade.'; end if;
  if p_vencimento is null then raise exception 'Escolha o vencimento.'; end if;
  if v_desconto > p_valor + c.valor_extras then raise exception 'O desconto é maior que a cobrança.'; end if;
  update public.creche_cobrancas set valor_mensal = p_valor, desconto = v_desconto, total = p_valor + valor_extras - v_desconto,
    vencimento = p_vencimento, obs = nullif(left(btrim(coalesce(p_obs, '')), 300), '') where id = c.id;
  perform public.creche_cobranca_lancar(c.id);
end $$;
create or replace function public.creche_cobranca_cancelar(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.creche_cobrancas;
begin
  select * into c from public.creche_cobrancas where id = p_id for update;
  if not found or not public.cuido_do_financeiro(c.petshop_id) then raise exception 'Cobrança não encontrada.'; end if;
  if not public.acesso_liberado(c.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if c.status <> 'aberta' then return; end if;
  if public.creche_cobranca_paga(c.lancamento_id) then raise exception 'Esta mensalidade já foi paga. Desfaça o recebimento antes de cancelar.'; end if;
  update public.creche_cobrancas set status = 'cancelada' where id = c.id;
  perform public.creche_cobranca_lancar(c.id);
  update public.estadias set cobranca_id = null where cobranca_id = c.id;
end $$;
create or replace function public.creche_cobranca_desfazer_baixa(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare c public.creche_cobrancas;
begin
  select * into c from public.creche_cobrancas where id = p_id for update;
  if not found or not public.cuido_do_financeiro(c.petshop_id) then raise exception 'Cobrança não encontrada.'; end if;
  if not public.acesso_liberado(c.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if not public.creche_cobranca_paga(c.lancamento_id) then return; end if;
  perform set_config('maestro.creche', '1', true);
  update public.lancamentos set pago = false, forma = null, pagamentos = null, caixa_id = null, data = c.vencimento, vencimento = c.vencimento
    where id = c.lancamento_id;
end $$;
create or replace function public.creche_cobranca_cobrada(p_ids uuid[], p_desfazer boolean default false) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare v_agora timestamptz := case when coalesce(p_desfazer, false) then null else now() end;
begin
  update public.creche_cobrancas c set cobrado_em = v_agora
    where c.id = any (p_ids) and c.status = 'aberta' and public.cuido_do_financeiro(c.petshop_id) and public.acesso_liberado(c.petshop_id);
  return v_agora;
end $$;

notify pgrst, 'reload schema';
