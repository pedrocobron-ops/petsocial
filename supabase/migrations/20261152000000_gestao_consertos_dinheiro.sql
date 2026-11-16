-- Consertos de dinheiro (rodada de correções):
--  1. Toque duplo não lança duas vezes: toda gravação de dinheiro ou estoque leva uma chave da operação, única por pet shop.
--  2. Atendimento concluído sem conta fechada: lista "para cobrar" e marca de "não vou cobrar".
--  3. Comissão: dá para pagar a diferença de um período que já teve pagamento.
--  4. Preço mudado ou desconto na venda fica anotado (quem, de quanto para quanto); opção de travar para quem só opera o caixa.
--  5. Aviso ao dono do que mudou em valores recebidos desde a última vez que olhou.
--  6. Multa e juros já cobrados de uma conta ficam anotados nela (não sugere a multa de novo no resto).
-- Só acrescenta. O código antigo continua funcionando: as funções trocadas aceitam as mesmas chamadas (parâmetro novo tem padrão).

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Chave da operação
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.lancamentos add column if not exists chave text;
alter table public.movimentos_estoque add column if not exists chave text;
alter table public.pacotes_clientes add column if not exists chave text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'lancamentos_chave_check') then
    alter table public.lancamentos add constraint lancamentos_chave_check check (chave is null or char_length(chave) between 8 and 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'movimentos_estoque_chave_check') then
    alter table public.movimentos_estoque add constraint movimentos_estoque_chave_check check (chave is null or char_length(chave) between 8 and 120);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pacotes_clientes_chave_check') then
    alter table public.pacotes_clientes add constraint pacotes_clientes_chave_check check (chave is null or char_length(chave) between 8 and 120);
  end if;
end $$;

-- índice inteiro (não parcial): linha sem chave não esbarra em nada, e o "insert ... on conflict do nothing" da API consegue usá-lo
create unique index if not exists lancamentos_chave_uniq on public.lancamentos (petshop_id, chave);
create unique index if not exists movimentos_estoque_chave_uniq on public.movimentos_estoque (petshop_id, chave);
create unique index if not exists pacotes_clientes_chave_uniq on public.pacotes_clientes (petshop_id, chave);
-- estas duas tabelas têm leitura por coluna (o custo e o preço são reservados): a chave precisa poder ser lida para o "on conflict"
grant select (chave) on public.movimentos_estoque to authenticated;
grant select (chave) on public.pacotes_clientes to authenticated;

-- Operações feitas por função do banco (receber conta, pagar comissão): a chave e o que a função respondeu da primeira vez.
create table if not exists public.operacoes_feitas (
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  chave text not null check (char_length(chave) between 8 and 120),
  resultado jsonb not null,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  primary key (petshop_id, chave)
);
alter table public.operacoes_feitas enable row level security;
revoke all on public.operacoes_feitas from anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. Multa e juros já cobrados de uma conta
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.lancamentos add column if not exists multa_de uuid references public.lancamentos (id) on delete set null;
alter table public.lancamentos add column if not exists multa_recebida numeric(10, 2);
alter table public.lancamentos add column if not exists multa_recebida_em date;
create index if not exists lancamentos_multa_de_idx on public.lancamentos (multa_de) where multa_de is not null;

-- apagou a entrada da multa: a conta deixa de dizer que a multa foi cobrada
create or replace function public.multa_apagada() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.multa_de is not null then
    perform set_config('maestro.creche', '1', true);
    perform set_config('maestro.recebimento', '1', true);
    update public.lancamentos c
      set multa_recebida = nullif(greatest(0, coalesce(c.multa_recebida, 0) - old.valor), 0),
          multa_recebida_em = case when coalesce(c.multa_recebida, 0) - old.valor > 0 then c.multa_recebida_em else null end
      where c.id = old.multa_de;
    perform set_config('maestro.creche', '', true);
    perform set_config('maestro.recebimento', '', true);
  end if;
  return null;
end $$;
revoke execute on function public.multa_apagada() from public, anon, authenticated;
drop trigger if exists multa_apagada on public.lancamentos;
create trigger multa_apagada after delete on public.lancamentos for each row when (old.multa_de is not null) execute function public.multa_apagada();

-- ---------------------------------------------------------------------------------------------------------------------
-- Receber uma conta: com a chave, repetir a chamada devolve o que foi feito da primeira vez (não recebe de novo)
-- ---------------------------------------------------------------------------------------------------------------------

drop function if exists public.receber_conta(uuid, numeric, text, jsonb, date, date, numeric, text, jsonb);
create or replace function public.receber_conta(p_conta uuid, p_valor numeric, p_forma text, p_pagamentos jsonb default null, p_data date default null,
  p_novo_vencimento date default null, p_multa numeric default null, p_multa_forma text default null, p_multa_pagamentos jsonb default null,
  p_chave text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  l public.lancamentos;
  v_fin boolean;
  v_fuso text;
  v_hoje date;
  v_data date;
  v_eh_hoje boolean;
  v_caixa uuid;
  v_valor numeric(10, 2) := round(p_valor, 2);
  v_multa numeric(10, 2) := round(coalesce(p_multa, 0), 2);
  v_pg jsonb;
  v_parte uuid;
  v_multa_id uuid;
  v_nome text;
  v_chave text := nullif(btrim(coalesce(p_chave, '')), '');
  v_feito jsonb;
  v_resp jsonb;
begin
  select * into l from public.lancamentos x where x.id = p_conta for update;
  if not found then raise exception 'Conta não encontrada.'; end if;
  v_fin := public.cuido_do_financeiro(l.petshop_id);
  if not v_fin and not (public.tenho_area(l.petshop_id, array['caixa']) and l.tipo = 'entrada' and (l.cliente_id is not null or l.agendamento_id is not null)) then
    raise exception 'Conta não encontrada.';
  end if;
  -- a mesma operação chegou de novo (toque duplo, internet que repetiu): devolve o que já foi feito
  if v_chave is not null then
    if char_length(v_chave) < 8 or char_length(v_chave) > 120 then raise exception 'Chave da operação inválida.'; end if;
    select o.resultado into v_feito from public.operacoes_feitas o where o.petshop_id = l.petshop_id and o.chave = v_chave;
    if found then return v_feito || jsonb_build_object('repetido', true); end if;
  end if;
  if not public.acesso_liberado(l.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if l.pago then raise exception 'Esta conta já tinha sido baixada. Atualize a tela.'; end if;
  if l.tipo <> 'entrada' or l.movimento is not null then raise exception 'Só uma conta a receber pode ser recebida por aqui.'; end if;
  if v_valor is null or v_valor <= 0 then raise exception 'Escreva quanto o cliente pagou.'; end if;
  if v_valor > l.valor then
    raise exception 'O cliente deve % nesta conta. Para receber a mais, lance a diferença como outra entrada.', replace(to_char(l.valor, 'FM999999990D00'), '.', ',');
  end if;
  if coalesce(p_forma, '') not in ('dinheiro', 'pix', 'debito', 'credito', 'outro') then raise exception 'Escolha como o cliente pagou.'; end if;
  if v_multa < 0 or v_multa > 99999.99 then raise exception 'Confira o valor da multa e dos juros.'; end if;
  if v_multa > 0 and coalesce(p_multa_forma, p_forma) not in ('dinheiro', 'pix', 'debito', 'credito', 'outro') then raise exception 'Escolha como o cliente pagou.'; end if;

  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = l.petshop_id;
  v_hoje := (now() at time zone v_fuso)::date;
  v_data := coalesce(p_data, v_hoje);
  -- perto da meia-noite o aparelho pode estar num fuso do Brasil diferente do fuso do pet shop (mesma folga de meus_caixas)
  v_eh_hoje := v_data = v_hoje or v_data between (now() at time zone 'America/Rio_Branco')::date and (now() at time zone 'America/Noronha')::date;
  if not v_eh_hoje then
    if not v_fin then raise exception 'Só quem cuida do financeiro recebe com a data de outro dia.'; end if;
    if v_data > v_hoje then raise exception 'Escolha um dia até hoje.'; end if;
  end if;
  -- só entra no caixa aberto quando o dinheiro andou hoje
  if v_eh_hoje then
    select c.id into v_caixa from public.caixas c where c.petshop_id = l.petshop_id and c.fechado_em is null;
  end if;
  v_pg := public.pagamentos_conferidos(p_pagamentos, v_valor);
  v_nome := coalesce(nullif(btrim(l.descricao), ''), l.categoria);

  if v_valor = l.valor then
    update public.lancamentos set pago = true, data = v_data, forma = p_forma, pagamentos = v_pg, caixa_id = v_caixa where id = l.id;
  else
    perform set_config('maestro.recebimento', '1', true);
    insert into public.lancamentos (petshop_id, tipo, valor, forma, pagamentos, categoria, descricao, data, pago, caixa_id, cliente_id, origem, criado_por, conta_id)
      values (l.petshop_id, 'entrada', v_valor, p_forma, v_pg, l.categoria, left(v_nome, 110) || ' (parte)', v_data, true, v_caixa, l.cliente_id, 'tela', (select auth.uid()), l.id)
      returning id into v_parte;
    -- a conta fica com o que falta. Quem só opera o caixa não altera conta a receber por fora: aqui a conferência já foi feita.
    perform set_config('maestro.creche', '1', true);
    update public.lancamentos set valor = l.valor - v_valor, valor_original = coalesce(l.valor_original, l.valor),
        vencimento = coalesce(p_novo_vencimento, l.vencimento), data = coalesce(p_novo_vencimento, l.vencimento, l.data)
      where id = l.id;
    perform set_config('maestro.creche', '', true);
    perform set_config('maestro.recebimento', '', true);
    -- mensalidade da creche: a cobrança continua com o total cheio; só o vencimento acompanha quando muda
    if p_novo_vencimento is not null then
      update public.creche_cobrancas c set vencimento = p_novo_vencimento where c.lancamento_id = l.id and c.status = 'aberta';
    end if;
  end if;

  if v_multa > 0 then
    insert into public.lancamentos (petshop_id, tipo, valor, forma, pagamentos, categoria, descricao, data, pago, caixa_id, cliente_id, origem, criado_por, multa_de)
      values (l.petshop_id, 'entrada', v_multa, coalesce(p_multa_forma, p_forma), public.pagamentos_conferidos(p_multa_pagamentos, v_multa), 'Multa e juros',
        left('Multa e juros · ' || v_nome, 120), v_data, true, v_caixa, l.cliente_id, 'tela', (select auth.uid()), l.id)
      returning id into v_multa_id;
    -- a conta guarda que a multa já foi cobrada: o resto não sugere a multa de novo, e os juros contam daqui para a frente
    perform set_config('maestro.recebimento', '1', true);
    perform set_config('maestro.creche', '1', true);
    update public.lancamentos set multa_recebida = coalesce(multa_recebida, 0) + v_multa, multa_recebida_em = v_data where id = l.id;
    perform set_config('maestro.creche', '', true);
    perform set_config('maestro.recebimento', '', true);
  end if;
  v_resp := jsonb_build_object('quitada', v_valor = l.valor, 'recebido', v_valor, 'falta', l.valor - v_valor, 'parte_id', v_parte, 'multa_id', v_multa_id, 'no_caixa', v_caixa is not null);
  if v_chave is not null then
    insert into public.operacoes_feitas (petshop_id, chave, resultado, criado_por) values (l.petshop_id, v_chave, v_resp, (select auth.uid()));
  end if;
  return v_resp;
end $$;
revoke execute on function public.receber_conta(uuid, numeric, text, jsonb, date, date, numeric, text, jsonb, text) from public, anon;
grant execute on function public.receber_conta(uuid, numeric, text, jsonb, date, date, numeric, text, jsonb, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Comissão: pagar a diferença de um período que já teve pagamento
-- ---------------------------------------------------------------------------------------------------------------------
-- Antes: um período com qualquer pagamento não aceitava outro. Agora: os pagamentos que estão DENTRO do período pedido
-- são descontados e paga-se só a diferença. Pagamento que passa da borda do período pedido continua recusado
-- (não dá para saber quanto dele é de dentro).

drop function if exists public.comissao_pagar(uuid, date, date, text, numeric);
create or replace function public.comissao_pagar(p_profissional uuid, p_de date, p_ate date, p_forma text, p_valor numeric, p_chave text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.profissionais;
  g public.comissoes_pagas;
  v_total numeric;
  v_pago numeric;
  v_valor numeric;
  v_fuso text;
  v_hoje date;
  v_caixa uuid;
  v_id uuid;
  v_chave text := nullif(btrim(coalesce(p_chave, '')), '');
  v_feito jsonb;
begin
  select * into p from public.profissionais x where x.id = p_profissional for update;
  if not found or not public.cuido_do_financeiro(p.petshop_id) then raise exception 'Pessoa não encontrada.'; end if;
  if v_chave is not null then
    if char_length(v_chave) < 8 or char_length(v_chave) > 120 then raise exception 'Chave da operação inválida.'; end if;
    select o.resultado into v_feito from public.operacoes_feitas o where o.petshop_id = p.petshop_id and o.chave = v_chave;
    if found then return (v_feito ->> 'id')::uuid; end if;
  end if;
  if not public.acesso_liberado(p.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 366 then raise exception 'Confira o período.'; end if;
  if coalesce(p_forma, '') not in ('dinheiro', 'pix', 'debito', 'credito', 'outro') then raise exception 'Escolha como pagou.'; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p.petshop_id;
  v_hoje := (now() at time zone v_fuso)::date;
  if p_ate > v_hoje then raise exception 'O período ainda não acabou. Escolha um período que termine até hoje.'; end if;
  select * into g from public.comissoes_pagas x
    where x.profissional_id = p.id and x.de <= p_ate and x.ate >= p_de and not (x.de >= p_de and x.ate <= p_ate) order by x.de limit 1;
  if found then
    raise exception 'A comissão de % de % a % já foi marcada como paga e esse pagamento passa das datas escolhidas. Escolha um período que inclua essas datas inteiras, ou desfaça antes esse pagamento.',
      p.nome, to_char(g.de, 'DD/MM/YYYY'), to_char(g.ate, 'DD/MM/YYYY');
  end if;
  select c.comissao into v_total from public.comissao_calcular(p.petshop_id, p_de, p_ate, p.id) c;
  v_total := coalesce(v_total, 0);
  select coalesce(sum(x.valor), 0) into v_pago from public.comissoes_pagas x where x.profissional_id = p.id and x.de >= p_de and x.ate <= p_ate;
  v_valor := v_total - v_pago;
  if v_valor <= 0 then
    if v_pago > 0 then raise exception 'A comissão deste período já está paga.'; end if;
    raise exception 'Não há comissão para pagar neste período.';
  end if;
  if p_valor is null or round(p_valor, 2) <> v_valor then
    raise exception '% Atualize a tela e confira antes de pagar.',
      case when v_pago > 0 then 'O que falta pagar deste período mudou para ' else 'A comissão deste período mudou para ' end || replace(to_char(v_valor, 'FM999999990D00'), '.', ',') || '.';
  end if;
  select c.id into v_caixa from public.caixas c where c.petshop_id = p.petshop_id and c.fechado_em is null;
  insert into public.lancamentos (petshop_id, tipo, valor, forma, categoria, descricao, data, pago, caixa_id, origem, criado_por)
    values (p.petshop_id, 'saida', v_valor, p_forma, 'Comissão',
      left('Comissão de ' || p.nome || ' · ' || to_char(p_de, 'DD/MM') || ' a ' || to_char(p_ate, 'DD/MM/YYYY') || case when v_pago > 0 then ' (diferença)' else '' end, 120),
      v_hoje, true, v_caixa, 'tela', (select auth.uid()))
    returning id into v_id;
  insert into public.comissoes_pagas (petshop_id, profissional_id, de, ate, valor, lancamento_id, pago_por)
    values (p.petshop_id, p.id, p_de, p_ate, v_valor, v_id, (select auth.uid()));
  if v_chave is not null then
    insert into public.operacoes_feitas (petshop_id, chave, resultado, criado_por) values (p.petshop_id, v_chave, jsonb_build_object('id', v_id), (select auth.uid()));
  end if;
  return v_id;
end $$;
revoke execute on function public.comissao_pagar(uuid, date, date, text, numeric, text) from public, anon;
grant execute on function public.comissao_pagar(uuid, date, date, text, numeric, text) to authenticated;

-- O que ficou sem pagar em períodos que já tiveram pagamento: junta os períodos pagos que se encostam ou se cruzam
-- e compara a comissão do bloco inteiro com a soma do que foi pago nele. Só olha pagamentos dos últimos 120 dias.
create or replace function public.comissao_pendencias(p_petshop uuid)
returns table (profissional_id uuid, nome text, de date, ate date, comissao numeric, pago numeric, falta numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
  v_de date;
  v_ate date;
  v_pago numeric;
  v_prof uuid;
  v_total numeric;
  v_hoje date;
begin
  if not public.cuido_do_financeiro(p_petshop) then return; end if;
  select (now() at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date into v_hoje from public.petshops s where s.id = p_petshop;
  for r in
    select g.profissional_id as prof, g.de as g_de, g.ate as g_ate, g.valor as g_valor
    from public.comissoes_pagas g
    where g.petshop_id = p_petshop
      and g.profissional_id in (select x.profissional_id from public.comissoes_pagas x where x.petshop_id = p_petshop and x.ate >= v_hoje - 120)
    order by g.profissional_id, g.de, g.ate
  loop
    if v_prof is not null and (r.prof <> v_prof or r.g_de > v_ate + 1) then
      select c.comissao into v_total from public.comissao_calcular(p_petshop, v_de, v_ate, v_prof) c;
      if coalesce(v_total, 0) - v_pago > 0 and v_ate >= v_hoje - 120 then
        profissional_id := v_prof; de := v_de; ate := v_ate; comissao := coalesce(v_total, 0); pago := v_pago; falta := coalesce(v_total, 0) - v_pago;
        select x.nome into nome from public.profissionais x where x.id = v_prof;
        return next;
      end if;
      v_prof := null;
    end if;
    if v_prof is null then
      v_prof := r.prof; v_de := r.g_de; v_ate := r.g_ate; v_pago := r.g_valor;
    else
      v_ate := greatest(v_ate, r.g_ate); v_pago := v_pago + r.g_valor;
    end if;
  end loop;
  if v_prof is not null then
    select c.comissao into v_total from public.comissao_calcular(p_petshop, v_de, v_ate, v_prof) c;
    if coalesce(v_total, 0) - v_pago > 0 and v_ate >= v_hoje - 120 then
      profissional_id := v_prof; de := v_de; ate := v_ate; comissao := coalesce(v_total, 0); pago := v_pago; falta := coalesce(v_total, 0) - v_pago;
      select x.nome into nome from public.profissionais x where x.id = v_prof;
      return next;
    end if;
  end if;
end $$;
revoke execute on function public.comissao_pendencias(uuid) from public, anon;
grant execute on function public.comissao_pendencias(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Atendimento concluído que ninguém cobrou
-- ---------------------------------------------------------------------------------------------------------------------

alter table public.agendamentos add column if not exists sem_cobranca boolean not null default false;

-- "não vou cobrar" é decisão de quem recebe
create or replace function public.proteger_sem_cobranca() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or pg_trigger_depth() > 1 then return new; end if;
  if tg_op = 'INSERT' then
    if new.sem_cobranca and not public.tenho_area(new.petshop_id, array['caixa', 'financeiro', 'relatorios']) then new.sem_cobranca := false; end if;
    return new;
  end if;
  if new.sem_cobranca is distinct from old.sem_cobranca and not public.tenho_area(old.petshop_id, array['caixa', 'financeiro', 'relatorios']) then
    raise exception 'Só quem recebe (Caixa ou Financeiro) decide que um atendimento não vai ser cobrado.';
  end if;
  return new;
end $$;
revoke execute on function public.proteger_sem_cobranca() from public, anon, authenticated;
drop trigger if exists proteger_sem_cobranca on public.agendamentos;
create trigger proteger_sem_cobranca before insert or update of sem_cobranca on public.agendamentos for each row execute function public.proteger_sem_cobranca();

-- Concluídos com valor e sem conta (nem recebida, nem "paga depois"), dos últimos 45 dias ou do período pedido.
-- Só diz QUAIS são (sem valor nenhum): a agenda de quem não mexe com dinheiro também marca "falta cobrar".
-- Pet shop que nunca fechou a conta de um atendimento pelo sistema não recebe nada (não usa essa parte).
create or replace function public.agendamentos_para_cobrar(p uuid, p_de date default null, p_ate date default null)
returns table (id uuid, inicio timestamptz)
language sql stable security definer set search_path = '' as $$
  select a.id, a.inicio
  from public.petshops s
  join public.agendamentos a on a.petshop_id = s.id
  where s.id = p
    and (select public.tenho_area(p, array['agenda', 'caixa', 'financeiro', 'relatorios']))
    and exists (select 1 from public.lancamentos u where u.petshop_id = p and u.agendamento_id is not null and u.tipo = 'entrada')
    and a.status = 'concluido' and not a.sem_cobranca
    and a.inicio >= (coalesce(p_de, (now() at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date - 45)::timestamp at time zone coalesce(s.fuso, 'America/Sao_Paulo'))
    and a.inicio < ((coalesce(p_ate, (now() at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date) + 1)::timestamp at time zone coalesce(s.fuso, 'America/Sao_Paulo'))
    and not exists (select 1 from public.lancamentos l where l.agendamento_id = a.id and l.tipo = 'entrada')
    and (case when a.pacote_cliente_id is null then coalesce(a.preco, 0) else 0 end
       + coalesce((select sum(coalesce(e.preco, 0)) from public.agendamento_servicos e where e.agendamento_id = a.id), 0)) > 0
  order by a.inicio
$$;
revoke execute on function public.agendamentos_para_cobrar(uuid, date, date) from public, anon;
grant execute on function public.agendamentos_para_cobrar(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Preço mudado e desconto na venda: fica anotado; com a opção ligada, quem só opera o caixa não muda
-- ---------------------------------------------------------------------------------------------------------------------

create table if not exists public.precos_alterados (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  lancamento_id uuid references public.lancamentos (id) on delete set null,
  pacote_cliente_id uuid references public.pacotes_clientes (id) on delete set null,
  tipo text not null check (tipo in ('preco', 'desconto')),
  item text not null,
  de numeric(10, 2),
  para numeric(10, 2) not null,
  qtd numeric(12, 3),
  abaixo_do_custo boolean not null default false,
  quem uuid references auth.users (id) on delete set null,
  quem_nome text,
  quando timestamptz not null default now()
);
create index if not exists precos_alterados_petshop_quando_idx on public.precos_alterados (petshop_id, quando desc);
create index if not exists precos_alterados_lancamento_idx on public.precos_alterados (lancamento_id) where lancamento_id is not null;
alter table public.precos_alterados enable row level security;
revoke all on public.precos_alterados from anon, authenticated;
grant select on public.precos_alterados to authenticated;
drop policy if exists precos_alterados_ler on public.precos_alterados;
create policy precos_alterados_ler on public.precos_alterados for select to authenticated
  using ((select public.cuido_do_financeiro(petshop_id)));

-- Opções: "dinheiro.preco_travado" (só o dono e quem vê o financeiro mudam preço ou dão desconto) e
-- "dinheiro.desconto_max_caixa" (desconto máximo, em %, para quem só opera o caixa; sem número, nenhum desconto).
create or replace function public.anotar_preco_da_venda() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_nome text;
  v_op jsonb;
  v_travado boolean;
  v_max numeric;
  v_fin boolean;
  i jsonb;
  v_valor numeric;
  v_qtd numeric;
  v_tabela numeric;
  v_custo numeric;
  v_soma numeric := 0;
  v_item text;
  v_desc numeric;
begin
  if v_user is null or new.tipo <> 'entrada' or new.conta_id is not null or new.movimento is not null then return null; end if;
  if new.itens is null or jsonb_typeof(new.itens) <> 'array' then return null; end if;
  -- só a conta do atendimento e a venda de produtos têm preço de tabela para comparar
  if new.agendamento_id is null and new.categoria <> 'Venda de produtos' then return null; end if;
  select s.opcoes into v_op from public.petshops s where s.id = new.petshop_id;
  v_travado := coalesce(v_op -> 'dinheiro.preco_travado' = 'true'::jsonb, false);
  v_max := case when jsonb_typeof(v_op -> 'dinheiro.desconto_max_caixa') = 'number' then least(100, greatest(0, (v_op ->> 'dinheiro.desconto_max_caixa')::numeric)) else 0 end;
  v_fin := public.cuido_do_financeiro(new.petshop_id);
  select x.nome into v_nome from public.profissionais x where x.petshop_id = new.petshop_id and x.user_id = v_user limit 1;

  for i in select * from jsonb_array_elements(new.itens) loop
    if jsonb_typeof(i) <> 'object' or jsonb_typeof(i -> 'valor') <> 'number' then continue; end if;
    v_valor := (i ->> 'valor')::numeric;
    v_qtd := case when jsonb_typeof(i -> 'qtd') = 'number' then (i ->> 'qtd')::numeric else 1 end;
    v_soma := v_soma + round(v_qtd * v_valor, 2);
    v_item := left(coalesce(nullif(btrim(i ->> 'nome'), ''), 'Item'), 120);
    v_tabela := null; v_custo := null;
    if i ->> 'tipo' = 'produto' and (i ->> 'produto_id') ~ '^[0-9a-fA-F-]{36}$' then
      select x.preco_venda, x.custo into v_tabela, v_custo from public.produtos x where x.id = (i ->> 'produto_id')::uuid and x.petshop_id = new.petshop_id;
    elsif i ->> 'tipo' = 'servico' and new.agendamento_id is not null then
      if (i ->> 'servico_id') ~ '^[0-9a-fA-F-]{36}$' then
        select e.preco into v_tabela from public.agendamento_servicos e where e.agendamento_id = new.agendamento_id and e.servico_id = (i ->> 'servico_id')::uuid limit 1;
      else
        select a.preco into v_tabela from public.agendamentos a where a.id = new.agendamento_id;
      end if;
    end if;
    -- um centavo de folga: venda por peso arredonda o preço de uma unidade
    if v_tabela is not null and abs(v_valor - v_tabela) > 0.011 then
      if v_travado and not v_fin then
        raise exception 'O preço de % é %. Só o dono ou quem vê o financeiro muda o preço na venda.', v_item, 'R$ ' || replace(to_char(v_tabela, 'FM999999990D00'), '.', ',');
      end if;
      insert into public.precos_alterados (petshop_id, lancamento_id, tipo, item, de, para, qtd, abaixo_do_custo, quem, quem_nome)
        values (new.petshop_id, new.id, 'preco', v_item, v_tabela, v_valor, v_qtd, coalesce(v_custo > 0 and v_valor < v_custo, false), v_user, v_nome);
    end if;
  end loop;

  v_desc := v_soma - coalesce(new.valor_original, new.valor);
  if v_desc > 0.005 then
    if v_travado and not v_fin and v_desc > round(v_soma * v_max / 100, 2) + 0.005 then
      if v_max > 0 then
        raise exception 'O desconto passa do máximo de % por cento que o caixa pode dar. Peça para o dono ou para quem vê o financeiro.', replace(trim(to_char(v_max, 'FM990D99'), ',.'), '.', ',');
      end if;
      raise exception 'Só o dono ou quem vê o financeiro dá desconto na venda.';
    end if;
    insert into public.precos_alterados (petshop_id, lancamento_id, tipo, item, de, para, quem, quem_nome)
      values (new.petshop_id, new.id, 'desconto', left(coalesce(nullif(btrim(new.descricao), ''), new.categoria), 120), v_soma, coalesce(new.valor_original, new.valor), v_user, v_nome);
  end if;
  return null;
end $$;
revoke execute on function public.anotar_preco_da_venda() from public, anon, authenticated;
drop trigger if exists anotar_preco_da_venda on public.lancamentos;
create trigger anotar_preco_da_venda after insert on public.lancamentos for each row execute function public.anotar_preco_da_venda();

-- Pacote vendido por preço diferente do modelo
create or replace function public.anotar_preco_do_pacote() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_nome text;
  v_tabela numeric;
  v_travado boolean;
  v_fin boolean;
begin
  if v_user is null then return null; end if;
  -- quem não recebe não vê nem digita preço: nada a comparar
  if not public.tenho_area(new.petshop_id, array['caixa', 'financeiro', 'relatorios']) then return null; end if;
  select coalesce(s.opcoes -> 'dinheiro.preco_travado' = 'true'::jsonb, false) into v_travado from public.petshops s where s.id = new.petshop_id;
  v_fin := public.cuido_do_financeiro(new.petshop_id);
  if new.pacote_id is null then
    if v_travado and not v_fin then raise exception 'Com o preço travado, venda um pacote da lista. Pacote com preço livre é com o dono ou com quem vê o financeiro.'; end if;
    return null;
  end if;
  select m.preco into v_tabela from public.pacotes m where m.id = new.pacote_id and m.petshop_id = new.petshop_id;
  if v_tabela is null or abs(new.preco - v_tabela) <= 0.005 then return null; end if;
  if v_travado and not v_fin then
    raise exception 'O preço deste pacote é %. Só o dono ou quem vê o financeiro muda o preço na venda.', 'R$ ' || replace(to_char(v_tabela, 'FM999999990D00'), '.', ',');
  end if;
  select x.nome into v_nome from public.profissionais x where x.petshop_id = new.petshop_id and x.user_id = v_user limit 1;
  insert into public.precos_alterados (petshop_id, pacote_cliente_id, tipo, item, de, para, quem, quem_nome)
    values (new.petshop_id, new.id, 'preco', left('Pacote ' || new.nome, 120), v_tabela, new.preco, v_user, v_nome);
  return null;
end $$;
revoke execute on function public.anotar_preco_do_pacote() from public, anon, authenticated;
drop trigger if exists anotar_preco_do_pacote on public.pacotes_clientes;
create trigger anotar_preco_do_pacote after insert on public.pacotes_clientes for each row execute function public.anotar_preco_do_pacote();

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. O que mudou em valores recebidos desde a última vez que o dono olhou
-- ---------------------------------------------------------------------------------------------------------------------

create table if not exists public.alteracoes_vistas (
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  visto_em timestamptz not null default now(),
  primary key (petshop_id, user_id)
);
alter table public.alteracoes_vistas enable row level security;
revoke all on public.alteracoes_vistas from anon, authenticated;

-- Valor recebido alterado ou apagado e preço mudado na venda, feitos por OUTRA pessoa. `p_todas`: os últimos 60 dias, já vistos ou não.
create or replace function public.alteracoes_de_valores(p uuid, p_todas boolean default false)
returns table (id uuid, tipo text, quando timestamptz, quem_nome text, descricao text, de numeric, para numeric, abaixo_do_custo boolean, nova boolean)
language sql stable security definer set search_path = '' as $$
  with eu as (
    select (select auth.uid()) as uid,
      coalesce((select v.visto_em from public.alteracoes_vistas v where v.petshop_id = p and v.user_id = (select auth.uid())),
        (select s.criado_em from public.petshops s where s.id = p)) as visto
  ), tudo as (
    select a.id, case when a.acao = 'apagou' then 'apagou' else 'alterou' end as tipo, a.quando, a.quem, a.quem_nome,
      coalesce(nullif(btrim(coalesce(l.descricao, a.antes ->> 'descricao')), ''), l.categoria, a.antes ->> 'categoria', 'Lançamento') as descricao,
      case when a.acao = 'apagou' then (a.antes ->> 'valor')::numeric when a.antes ? 'valor' then (a.antes ->> 'valor')::numeric else l.valor end as de,
      case when a.acao = 'apagou' then null when a.depois ? 'valor' then (a.depois ->> 'valor')::numeric else l.valor end as para,
      false as abaixo_do_custo
    from public.lancamentos_alteracoes a
    left join public.lancamentos l on l.id = a.lancamento_id
    where a.petshop_id = p and a.quando >= now() - interval '60 days'
      and (a.acao = 'apagou' or a.antes ?| array['valor', 'forma', 'pagamentos', 'data', 'tipo'])
      -- baixa de uma conta a pagar ou desfazer de recebimento não é "valor recebido alterado"
      and coalesce((a.antes ->> 'pago')::boolean, true)
    union all
    select x.id, x.tipo, x.quando, x.quem, x.quem_nome, x.item, x.de, x.para, x.abaixo_do_custo
    from public.precos_alterados x
    where x.petshop_id = p and x.quando >= now() - interval '60 days'
  )
  select t.id, t.tipo, t.quando, t.quem_nome, t.descricao, t.de, t.para, t.abaixo_do_custo, t.quando > eu.visto
  from tudo t, eu
  where (select public.cuido_do_financeiro(p)) and t.quem is distinct from eu.uid and (p_todas or t.quando > eu.visto)
  order by t.quando desc
  limit 200
$$;
revoke execute on function public.alteracoes_de_valores(uuid, boolean) from public, anon;
grant execute on function public.alteracoes_de_valores(uuid, boolean) to authenticated;

create or replace function public.alteracoes_marcar_vistas(p uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.cuido_do_financeiro(p) then return; end if;
  insert into public.alteracoes_vistas (petshop_id, user_id, visto_em) values (p, (select auth.uid()), now())
    on conflict (petshop_id, user_id) do update set visto_em = excluded.visto_em;
end $$;
revoke execute on function public.alteracoes_marcar_vistas(uuid) from public, anon;
grant execute on function public.alteracoes_marcar_vistas(uuid) to authenticated;
