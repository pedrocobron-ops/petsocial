-- =====================================================================================================================
-- Loja: orçamento, troca e devolução de produto, limite de fiado por cliente
-- =====================================================================================================================
-- Só acrescenta: tabelas novas, uma coluna em clientes (permissão por tabela: não precisa de grant), funções novas e gatilhos
-- novos. Funções que mudam (create or replace, mesma assinatura e mesmo resultado sem os dados novos):
--   · comissao_linhas_calc: a comissão sobre produto de uma conta de atendimento desconta o que foi devolvido dela;
--   · lucro_do_periodo: devolve também "devolucoes" (produto, quantidade, valor e o custo que voltou ao estoque);
--   · opcoes_sem_valores: o limite de fiado padrão (dinheiro.limite_fiado) não vai para a equipe sem dinheiro.
-- Sem devolução e sem limite, tudo continua igual: o aplicativo de antes funciona com esta migração aplicada.
--
-- 1. Orçamento (orcamentos): produtos e serviços com preço, desconto, validade, cliente opcional. Status gravado: aberto,
--    aceito, convertido ("vencido" é aberto ou aceito com a validade no passado, calculado na leitura). Nada mexe no estoque.
--    "Transformar em venda": a venda normal (venda_registrar) e o orçamento marcado, juntos (orcamento_vender); serviço vira
--    horário na agenda (orcamento_marcar com o horário). Página pública /gestao/orcamento/<código> (orcamento_publico, sem login).
-- 2. Troca e devolução (devolucoes, venda_devolver): de uma venda paga, escolhe o que volta. Devolver dinheiro (saída
--    "Devolução" pela forma escolhida), deixar de crédito (clientes_creditos) ou trocar por outro produto (a diferença é cobrada
--    ou volta). O que volta entra no estoque ("Devolução"); avariado entra e sai como "Perda". Tudo numa transação só, com chave.
--    Na conta do faturamento nada muda: a saída "Devolução" e o crédito deixado já saem do faturamento. A troca grava a
--    devolução inteira (saída "Devolução") e a venda nova inteira (entrada "Venda de produtos"); a parte trocada vai na forma
--    "outro", que entra e sai igual no mesmo caixa: só a diferença mexe na gaveta.
-- 3. Limite de fiado (clientes.limite_fiado e o padrão da loja em opcoes dinheiro.limite_fiado): conta a receber nova de um
--    cliente que passa do limite é recusada (maestro:limite_fiado), a não ser que o dono ou quem cuida do financeiro libere
--    antes (fiado_liberar, anotado com quem liberou). Pagamento na hora nunca é conferido.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Orçamentos
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.orcamentos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  numero integer not null,
  cliente_id uuid,
  nome text check (nome is null or char_length(nome) <= 80),
  telefone text check (telefone is null or char_length(telefone) <= 30),
  itens jsonb not null check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) between 1 and 60),
  subtotal numeric(10, 2) not null default 0 check (subtotal >= 0),
  desconto numeric(10, 2) not null default 0 check (desconto >= 0),
  total numeric(10, 2) not null default 0 check (total >= 0),
  validade date not null check (validade >= date '2000-01-01'),
  obs text check (obs is null or char_length(obs) <= 500),
  status text not null default 'aberto' check (status in ('aberto', 'aceito', 'convertido')),
  token text not null unique check (token ~ '^[0-9a-f]{48}$'),
  chave text check (chave is null or char_length(chave) between 8 and 120),
  lancamento_id uuid references public.lancamentos (id) on delete set null,
  agendamento_id uuid references public.agendamentos (id) on delete set null,
  aceito_em timestamptz,
  convertido_em timestamptz,
  convertido_por uuid references auth.users (id) on delete set null,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  alterado_em timestamptz,
  unique (petshop_id, numero),
  unique (petshop_id, chave),
  foreign key (cliente_id, petshop_id) references public.clientes (id, petshop_id) on delete set null (cliente_id)
);
create index if not exists orcamentos_petshop_idx on public.orcamentos (petshop_id, criado_em desc);
create index if not exists orcamentos_cliente_idx on public.orcamentos (cliente_id) where cliente_id is not null;

alter table public.orcamentos enable row level security;
revoke all on public.orcamentos from public, anon, authenticated;
grant select, delete on public.orcamentos to authenticated;
-- subtotal e total podem vir na gravação, mas o banco refaz a conta sempre (o que a tela manda é ignorado)
grant insert (petshop_id, cliente_id, nome, telefone, itens, subtotal, desconto, total, validade, obs, status, chave) on public.orcamentos to authenticated;
grant update (cliente_id, nome, telefone, itens, subtotal, desconto, total, validade, obs, status) on public.orcamentos to authenticated;

-- quem mexe com dinheiro (Caixa, Financeiro ou Relatórios): o orçamento tem preço
drop policy if exists orcamentos_ler on public.orcamentos;
create policy orcamentos_ler on public.orcamentos for select to authenticated
  using ((select public.tenho_area(orcamentos.petshop_id, array['caixa', 'financeiro', 'relatorios'])));
drop policy if exists orcamentos_criar on public.orcamentos;
create policy orcamentos_criar on public.orcamentos for insert to authenticated
  with check ((select public.tenho_area(orcamentos.petshop_id, array['caixa', 'financeiro', 'relatorios'])) and (select public.acesso_liberado(orcamentos.petshop_id)));
drop policy if exists orcamentos_editar on public.orcamentos;
create policy orcamentos_editar on public.orcamentos for update to authenticated
  using ((select public.tenho_area(orcamentos.petshop_id, array['caixa', 'financeiro', 'relatorios'])) and (select public.acesso_liberado(orcamentos.petshop_id)))
  with check (petshop_id in (select public.meus_petshops()));
drop policy if exists orcamentos_apagar on public.orcamentos;
create policy orcamentos_apagar on public.orcamentos for delete to authenticated
  using ((select public.tenho_area(orcamentos.petshop_id, array['caixa', 'financeiro', 'relatorios'])) and (select public.acesso_liberado(orcamentos.petshop_id))
    and status <> 'convertido');

-- Confere e completa o orçamento: itens limpos, subtotal e total feitos aqui (o que a tela manda de total é ignorado),
-- número em sequência por pet shop, código do link. Convertido não muda mais (só pela orcamento_marcar).
create or replace function public.orcamento_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  x jsonb; v_itens jsonb := '[]'::jsonb; v_sub numeric := 0; q numeric; v numeric; t text; n text; v_pid uuid; v_sid uuid;
  v_marcar boolean := coalesce(current_setting('maestro.orcamento_marcar', true), '') = new.id::text;
  v_mudou boolean;
begin
  if tg_op = 'UPDATE' then
    if old.status = 'convertido' and not v_marcar then
      raise exception 'Este orçamento já virou venda e não muda mais.' using hint = 'maestro:orcamento_convertido';
    end if;
    new.id := old.id; new.petshop_id := old.petshop_id; new.numero := old.numero; new.token := old.token;
    new.criado_por := old.criado_por; new.criado_em := old.criado_em; new.chave := old.chave;
    if not v_marcar then
      new.lancamento_id := old.lancamento_id; new.agendamento_id := old.agendamento_id;
      new.convertido_em := old.convertido_em; new.convertido_por := old.convertido_por;
    end if;
    new.alterado_em := now();
  end if;
  if new.status = 'convertido' and (tg_op = 'INSERT' or old.status <> 'convertido') and not v_marcar then
    raise exception 'Para virar venda, use "Transformar em venda".';
  end if;
  v_mudou := tg_op = 'INSERT' or new.itens is distinct from old.itens;
  begin
    if jsonb_typeof(new.itens) is distinct from 'array' or jsonb_array_length(new.itens) not between 1 and 60 then
      raise exception 'Ponha pelo menos um produto ou serviço no orçamento.';
    end if;
    for x in select y from jsonb_array_elements(new.itens) y loop
      if jsonb_typeof(x) is distinct from 'object' then raise exception 'Item do orçamento inválido.'; end if;
      t := x ->> 'tipo';
      if t is null or t not in ('produto', 'servico') then raise exception 'Cada item é um produto ou um serviço.'; end if;
      n := left(btrim(coalesce(x ->> 'nome', '')), 80);
      if n = '' then raise exception 'Item sem nome no orçamento.'; end if;
      begin
        q := (x ->> 'qtd')::numeric; v := (x ->> 'valor')::numeric;
        v_pid := nullif(x ->> 'produto_id', '')::uuid; v_sid := nullif(x ->> 'servico_id', '')::uuid;
      exception when others then raise exception 'Confira a quantidade e o valor de %.', n;
      end;
      if q is null or q <= 0 or q > 9999 or round(q, 3) <> q then raise exception 'Confira a quantidade de %.', n; end if;
      if v is null or v < 0 or v > 99999.99 or round(v, 2) <> v then raise exception 'Confira o valor de %.', n; end if;
      if t = 'produto' then v_sid := null; else v_pid := null; end if;
      if v_mudou and v_pid is not null and not exists (select 1 from public.produtos p where p.id = v_pid and p.petshop_id = new.petshop_id) then
        raise exception 'O produto % não está no estoque deste pet shop.', n;
      end if;
      if v_mudou and v_sid is not null and not exists (select 1 from public.servicos s where s.id = v_sid and s.petshop_id = new.petshop_id) then
        raise exception 'O serviço % não está na lista deste pet shop.', n;
      end if;
      v_itens := v_itens || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('tipo', t, 'nome', n, 'qtd', q, 'valor', v,
        'produto_id', v_pid, 'servico_id', v_sid)));
      v_sub := v_sub + round(q * v, 2);
    end loop;
    if v_sub > 999999.99 then raise exception 'O orçamento passa do valor máximo.'; end if;
    new.itens := v_itens;
    new.subtotal := v_sub;
    new.desconto := coalesce(new.desconto, 0);
    if new.desconto < 0 or round(new.desconto, 2) <> new.desconto then raise exception 'Confira o desconto.'; end if;
    if new.desconto > v_sub then raise exception 'O desconto não passa do valor do orçamento.'; end if;
    new.total := v_sub - new.desconto;
  end;
  new.nome := nullif(btrim(coalesce(new.nome, '')), '');
  new.telefone := nullif(btrim(coalesce(new.telefone, '')), '');
  new.obs := nullif(btrim(coalesce(new.obs, '')), '');
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended('orcamento-numero:' || new.petshop_id::text, 0));
    select coalesce(max(o.numero), 0) + 1 into new.numero from public.orcamentos o where o.petshop_id = new.petshop_id;
    new.token := encode(extensions.gen_random_bytes(24), 'hex');
    new.criado_por := (select auth.uid());
    new.criado_em := now();
    new.lancamento_id := null; new.agendamento_id := null; new.convertido_em := null; new.convertido_por := null;
  end if;
  if new.status = 'aceito' and (tg_op = 'INSERT' or old.status <> 'aceito') then new.aceito_em := now(); end if;
  if new.status = 'aberto' then new.aceito_em := null; end if;
  return new;
end $$;
revoke execute on function public.orcamento_conferir() from public, anon, authenticated;
drop trigger if exists orcamento_conferir on public.orcamentos;
create trigger orcamento_conferir before insert or update on public.orcamentos for each row execute function public.orcamento_conferir();

-- Marca o orçamento como convertido, ligado à venda e/ou ao horário marcado (de novo: só completa a ligação que faltava).
create or replace function public.orcamento_marcar(p_orcamento uuid, p_lancamento uuid default null, p_agendamento uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.orcamentos;
begin
  select * into o from public.orcamentos x where x.id = p_orcamento for update;
  if not found or (select auth.uid()) is null or not public.tenho_area(o.petshop_id, array['caixa', 'financeiro', 'relatorios'])
     or not public.acesso_liberado(o.petshop_id) then
    raise exception 'Orçamento não encontrado. Atualize a tela.' using errcode = '42501';
  end if;
  if p_lancamento is null and p_agendamento is null then raise exception 'Diga a venda ou o horário do orçamento.'; end if;
  if p_lancamento is not null and not exists (select 1 from public.lancamentos l where l.id = p_lancamento and l.petshop_id = o.petshop_id and l.tipo = 'entrada') then
    raise exception 'Venda não encontrada.';
  end if;
  if p_agendamento is not null and not exists (select 1 from public.agendamentos a where a.id = p_agendamento and a.petshop_id = o.petshop_id) then
    raise exception 'Horário não encontrado.';
  end if;
  perform set_config('maestro.orcamento_marcar', o.id::text, true);
  update public.orcamentos x set status = 'convertido', convertido_em = coalesce(x.convertido_em, now()), convertido_por = coalesce(x.convertido_por, (select auth.uid())),
      lancamento_id = coalesce(p_lancamento, x.lancamento_id), agendamento_id = coalesce(p_agendamento, x.agendamento_id)
    where x.id = o.id
    returning * into o;
  perform set_config('maestro.orcamento_marcar', '', true);
  return jsonb_build_object('id', o.id, 'status', o.status, 'lancamento_id', o.lancamento_id, 'agendamento_id', o.agendamento_id);
end $$;
revoke execute on function public.orcamento_marcar(uuid, uuid, uuid) from public, anon;
grant execute on function public.orcamento_marcar(uuid, uuid, uuid) to authenticated;

-- "Transformar em venda": a venda de balcão (os mesmos passos de venda_registrar) e o orçamento marcado, juntos.
-- A mesma chave de novo devolve a venda feita; outra chave num orçamento já convertido é recusada.
create or replace function public.orcamento_vender(p_petshop uuid, p_chave text, p_orcamento uuid, p_passos jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_feito jsonb; v_st text; v_res jsonb; v_venda uuid;
begin
  if (select auth.uid()) is null or p_petshop is null or not (p_petshop in (select public.meus_petshops())) then
    raise exception 'Sem acesso a este pet shop.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('orcamento:' || coalesce(p_orcamento::text, ''), 0));
  if p_chave is not null then
    v_feito := public.lote_ja_feito(p_petshop, p_chave);
    if v_feito is not null then return v_feito || jsonb_build_object('repetido', true); end if;
  end if;
  select o.status into v_st from public.orcamentos o where o.id = p_orcamento and o.petshop_id = p_petshop;
  if not found then raise exception 'Orçamento não encontrado. Atualize a tela.'; end if;
  if v_st = 'convertido' then raise exception 'Este orçamento já virou venda.' using hint = 'maestro:orcamento_convertido'; end if;
  v_res := public.operacao_tudo_ou_nada(p_petshop, p_chave, p_passos, array['lancamento', 'estoque']);
  v_venda := nullif(v_res -> 'ids' ->> 'venda', '')::uuid;
  if v_venda is null then raise exception 'A venda do orçamento não foi lançada.'; end if;
  perform public.orcamento_marcar(p_orcamento, v_venda, null);
  return v_res;
end $$;
revoke execute on function public.orcamento_vender(uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.orcamento_vender(uuid, text, uuid, jsonb) to authenticated;

-- A página pública do orçamento: só com o código certo, com a conta liberada, no máximo 60 aberturas por minuto.
-- Mostra o pet shop, os itens, o total, a validade e o status. Do cliente, só o primeiro nome.
create table if not exists public.orcamento_acessos (
  orcamento_id uuid not null references public.orcamentos (id) on delete cascade,
  minuto timestamptz not null,
  n int not null default 0,
  primary key (orcamento_id, minuto)
);
alter table public.orcamento_acessos enable row level security;
revoke all on public.orcamento_acessos from public, anon, authenticated;

create or replace function public.orcamento_publico(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare o public.orcamentos; s public.petshops; v_n int; v_hoje date; v_nome text;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then return null; end if;
  select * into o from public.orcamentos x where x.token = p_token;
  if not found or not public.acesso_liberado(o.petshop_id) then return null; end if;
  insert into public.orcamento_acessos as a (orcamento_id, minuto, n) values (o.id, date_trunc('minute', now()), 1)
    on conflict (orcamento_id, minuto) do update set n = a.n + 1 returning a.n into v_n;
  if v_n = 1 then delete from public.orcamento_acessos a where a.orcamento_id = o.id and a.minuto < now() - interval '10 minutes'; end if;
  if v_n > 60 then raise exception 'Muitos acessos a este orçamento agora. Espere um minuto e abra de novo.' using errcode = 'PT429'; end if;
  select * into s from public.petshops where id = o.petshop_id;
  v_hoje := (now() at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date;
  select split_part(btrim(c.nome), ' ', 1) into v_nome from public.clientes c where c.id = o.cliente_id;
  v_nome := coalesce(v_nome, split_part(btrim(coalesce(o.nome, '')), ' ', 1));
  return jsonb_build_object(
    'petshop', jsonb_build_object('nome', s.nome, 'logo', s.logo, 'tema', s.tema, 'telefone', s.telefone, 'cidade', s.cidade, 'uf', s.uf,
      'fuso', coalesce(s.fuso, 'America/Sao_Paulo')),
    'numero', o.numero, 'para', nullif(v_nome, ''),
    'itens', (select coalesce(jsonb_agg(jsonb_build_object('tipo', i ->> 'tipo', 'nome', i ->> 'nome', 'qtd', (i ->> 'qtd')::numeric, 'valor', (i ->> 'valor')::numeric)), '[]'::jsonb)
              from jsonb_array_elements(o.itens) i),
    'subtotal', o.subtotal, 'desconto', o.desconto, 'total', o.total, 'validade', o.validade, 'obs', o.obs,
    'status', case when o.status in ('aberto', 'aceito') and o.validade < v_hoje then 'vencido' else o.status end,
    'criado_em', o.criado_em);
end $$;
revoke execute on function public.orcamento_publico(text) from public;
grant execute on function public.orcamento_publico(text) to anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Troca e devolução de produto
-- ---------------------------------------------------------------------------------------------------------------------
-- itens: [{produto_id, nome, qtd, avariados, valor (o que volta para o cliente, ao centavo), custo (unitário, o da venda)}]
-- novos (troca): [{tipo:'produto', produto_id, nome, qtd, valor (unitário)}]
create table if not exists public.devolucoes (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  venda_id uuid references public.lancamentos (id) on delete set null,
  cliente_id uuid,
  modo text not null check (modo in ('dinheiro', 'credito', 'troca')),
  itens jsonb not null check (jsonb_typeof(itens) = 'array'),
  valor numeric(10, 2) not null check (valor >= 0),
  novos jsonb check (novos is null or jsonb_typeof(novos) = 'array'),
  valor_novos numeric(10, 2),
  diferenca numeric(10, 2),
  forma text,
  saida_id uuid references public.lancamentos (id) on delete set null,
  entrada_id uuid references public.lancamentos (id) on delete set null,
  credito_id uuid references public.clientes_creditos (id) on delete set null,
  chave text not null check (char_length(chave) between 8 and 120),
  resultado jsonb,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (petshop_id, chave),
  foreign key (cliente_id, petshop_id) references public.clientes (id, petshop_id) on delete set null (cliente_id)
);
create index if not exists devolucoes_venda_idx on public.devolucoes (venda_id) where venda_id is not null;
create index if not exists devolucoes_petshop_idx on public.devolucoes (petshop_id, criado_em);
alter table public.devolucoes enable row level security;
revoke all on public.devolucoes from public, anon, authenticated;
grant select on public.devolucoes to authenticated;
drop policy if exists devolucoes_ler on public.devolucoes;
create policy devolucoes_ler on public.devolucoes for select to authenticated
  using ((select public.tenho_area(devolucoes.petshop_id, array['caixa', 'financeiro', 'relatorios'])));

-- O que cada produto da venda rendeu (a parte de produto da venda, repartida como no "Quanto sobrou") e o que já voltou.
-- Uma devolução cuja saída ou crédito foi apagado não conta mais.
create or replace function public.venda_devolvivel(p_petshop uuid, p_venda uuid)
returns table (produto_id uuid, nome text, vendido numeric, pago numeric, devolvido numeric, devolvido_valor numeric)
language sql stable security definer set search_path = '' as $$
  with l as (
    select x.* from public.lancamentos x
    where x.id = p_venda and x.petshop_id = p_petshop and x.tipo = 'entrada' and x.movimento is null
      and public.tenho_area(p_petshop, array['caixa', 'financeiro', 'relatorios'])
  ), parte as (
    select l.itens, pt.produto from l cross join lateral public.partes_do_lancamento(coalesce(l.valor_original, l.valor), l.itens) pt
  ), r as (
    select x.* from parte cross join lateral public.lucro_repartir(coalesce(parte.produto, 0), parte.itens, 'produto') x where x.produto_id is not null
  ), ja as (
    select (i ->> 'produto_id')::uuid as produto_id, sum((i ->> 'qtd')::numeric) as q, sum((i ->> 'valor')::numeric) as v
    from public.devolucoes d cross join lateral jsonb_array_elements(d.itens) i
    where d.venda_id = p_venda and d.petshop_id = p_petshop and coalesce(d.saida_id, d.credito_id) is not null
    group by 1
  )
  select r.produto_id, r.nome, r.qtd, r.valor, coalesce(ja.q, 0), coalesce(ja.v, 0)
  from r left join ja on ja.produto_id = r.produto_id
$$;
revoke execute on function public.venda_devolvivel(uuid, uuid) from public, anon;
grant execute on function public.venda_devolvivel(uuid, uuid) to authenticated;

-- A devolução inteira, numa transação: confere o que volta, o dinheiro (ou o crédito, ou a troca), o estoque e o registro.
-- p_itens: [{produto_id, qtd, avariados}]. p_modo: dinheiro | credito | troca. p_forma: forma do dinheiro que volta (ou da
-- diferença da troca). p_novos (troca): [{produto_id, qtd, valor?}] (valor só vale para quem cuida do financeiro; sem ele, o
-- preço da lista). p_resto (troca com a compra nova menor): 'dinheiro' (padrão) ou 'credito'. p_cliente: de quem é a compra,
-- quando a venda não tem tutor (para deixar de crédito).
create or replace function public.venda_devolver(p_petshop uuid, p_chave text, p_venda uuid, p_itens jsonb, p_modo text,
  p_forma text default null, p_novos jsonb default null, p_resto text default null, p_cliente uuid default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  l public.lancamentos;
  d public.devolucoes;
  v_fuso text; v_hoje date; v_caixa uuid; v_fin boolean;
  x jsonb; v_r jsonb; v_vend record;
  v_itens jsonb := '[]'::jsonb; v_novos jsonb := '[]'::jsonb;
  v_v numeric := 0; v_n numeric := 0; v_t numeric := 0; v_dif numeric := 0;
  v_q numeric; v_av numeric; v_pid uuid; v_val numeric; v_custo numeric; v_preco numeric; v_nome text;
  v_saida uuid; v_entrada uuid; v_cred uuid; v_cli uuid; v_resto text := coalesce(p_resto, 'dinheiro');
  v_desc text; v_pg jsonb; v_forma text; v_res jsonb; v_id uuid;
begin
  if v_uid is null or p_petshop is null or not (p_petshop in (select public.meus_petshops())) then
    raise exception 'Sem acesso a este pet shop.' using errcode = '42501';
  end if;
  if not public.tenho_area(p_petshop, array['caixa', 'financeiro', 'relatorios']) or not public.acesso_liberado(p_petshop) then
    raise exception 'Troca e devolução é com quem mexe com dinheiro (Caixa ou Financeiro).' using errcode = '42501';
  end if;
  if p_chave is null or char_length(p_chave) not between 8 and 100 then raise exception 'Operação sem chave. Atualize a tela e tente de novo.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_petshop::text || ':devolucao:' || p_chave, 0));
  select * into d from public.devolucoes x where x.petshop_id = p_petshop and x.chave = p_chave;
  if found then return coalesce(d.resultado, '{}'::jsonb) || jsonb_build_object('repetido', true); end if;
  if p_modo is null or p_modo not in ('dinheiro', 'credito', 'troca') then raise exception 'Escolha o que fazer: devolver o dinheiro, deixar de crédito ou trocar.'; end if;
  if v_resto not in ('dinheiro', 'credito') then raise exception 'Escolha como volta a diferença.'; end if;

  -- a mesma venda devolvida em dois aparelhos ao mesmo tempo: a segunda espera a primeira e confere o que sobrou
  perform pg_advisory_xact_lock(hashtextextended('devolucao-venda:' || coalesce(p_venda::text, ''), 0));
  select * into l from public.lancamentos x where x.id = p_venda and x.petshop_id = p_petshop;
  if not found or l.tipo <> 'entrada' or l.movimento is not null then raise exception 'Venda não encontrada. Atualize a tela.'; end if;
  if l.conta_id is not null or l.diferenca_de is not null then raise exception 'Este valor é uma parte de outra conta: abra a conta inteira para trocar ou devolver.'; end if;
  if not l.pago then
    raise exception 'Esta venda ainda não foi paga: para tirar um produto, mude a conta a receber.' using hint = 'maestro:venda_aberta';
  end if;
  if jsonb_typeof(p_itens) is distinct from 'array' or jsonb_array_length(p_itens) not between 1 and 60 then raise exception 'Escolha o que volta.'; end if;

  for x in select y from jsonb_array_elements(p_itens) y loop
    begin
      v_pid := (x ->> 'produto_id')::uuid; v_q := (x ->> 'qtd')::numeric; v_av := coalesce((x ->> 'avariados')::numeric, 0);
    exception when others then raise exception 'Confira as quantidades da devolução.';
    end;
    if v_pid is null or v_q is null or v_q <= 0 or round(v_q, 3) <> v_q or v_av < 0 or v_av > v_q or round(v_av, 3) <> v_av then
      raise exception 'Confira as quantidades da devolução.';
    end if;
    if v_itens @> jsonb_build_array(jsonb_build_object('produto_id', v_pid::text)) then raise exception 'O mesmo produto apareceu duas vezes na devolução.'; end if;
    select * into v_vend from public.venda_devolvivel(p_petshop, p_venda) z where z.produto_id = v_pid;
    if not found then raise exception 'Esse produto não está nesta venda.'; end if;
    if v_q > v_vend.vendido - v_vend.devolvido + 0.0005 then
      raise exception '% : só dá para devolver % (a venda teve %, já voltaram %).', v_vend.nome,
        replace(trim(to_char(greatest(v_vend.vendido - v_vend.devolvido, 0), 'FM999999990.###'), '.'), '.', ','),
        replace(trim(to_char(v_vend.vendido, 'FM999999990.###'), '.'), '.', ','),
        replace(trim(to_char(v_vend.devolvido, 'FM999999990.###'), '.'), '.', ',')
        using hint = 'maestro:devolucao_passou';
    end if;
    -- o que volta: a parte paga por este produto, proporcional; a última unidade leva o que sobrou (fecha ao centavo)
    v_val := case when abs(v_q - (v_vend.vendido - v_vend.devolvido)) < 0.0005 then v_vend.pago - v_vend.devolvido_valor
                  else round(v_vend.pago * v_q / nullif(v_vend.vendido, 0), 2) end;
    v_val := greatest(coalesce(v_val, 0), 0);
    -- custo de cada unidade: o guardado na saída desta venda; sem ele, o custo de hoje do cadastro
    select case when count(*) > 0 and count(m.custo_unitario) = count(*) then round(sum(m.quantidade * m.custo_unitario) / nullif(sum(m.quantidade), 0), 2) end
      into v_custo
      from public.movimentos_estoque m where m.lancamento_id = p_venda and m.produto_id = v_pid and m.tipo = 'saida' and m.motivo = 'Venda';
    if v_custo is null then select p.custo into v_custo from public.produtos p where p.id = v_pid and p.petshop_id = p_petshop; end if;
    v_itens := v_itens || jsonb_build_array(jsonb_build_object('produto_id', v_pid::text, 'nome', v_vend.nome, 'qtd', v_q, 'avariados', v_av,
      'valor', v_val, 'custo', v_custo));
    v_v := v_v + v_val;
  end loop;
  if v_v <= 0 then raise exception 'Esses produtos saíram sem valor nesta venda: não há o que devolver.'; end if;

  v_cli := l.cliente_id;
  if v_cli is null and p_cliente is not null then
    select c.id into v_cli from public.clientes c where c.id = p_cliente and c.petshop_id = p_petshop;
  end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p_petshop;
  v_hoje := (now() at time zone v_fuso)::date;
  select c.id into v_caixa from public.caixas c where c.petshop_id = p_petshop and c.fechado_em is null limit 1;
  v_fin := public.cuido_do_financeiro(p_petshop);
  select left(string_agg(replace(trim(to_char((i ->> 'qtd')::numeric, 'FM999999990.###'), '.'), '.', ',') || ' ' || (i ->> 'nome'), ' + '), 140)
    into v_desc from jsonb_array_elements(v_itens) i;
  v_desc := 'Devolução: ' || v_desc || ' (venda de ' || to_char(l.data, 'DD/MM') || ')';

  if p_modo = 'troca' then
    if jsonb_typeof(p_novos) is distinct from 'array' or jsonb_array_length(p_novos) not between 1 and 60 then
      raise exception 'Escolha o produto que o cliente leva na troca.';
    end if;
    for x in select y from jsonb_array_elements(p_novos) y loop
      begin
        v_pid := (x ->> 'produto_id')::uuid; v_q := (x ->> 'qtd')::numeric; v_preco := (x ->> 'valor')::numeric;
      exception when others then raise exception 'Confira os produtos da troca.';
      end;
      if v_pid is null or v_q is null or v_q <= 0 or v_q > 9999 or round(v_q, 3) <> v_q then raise exception 'Confira as quantidades da troca.'; end if;
      select p.nome, case when v_fin and v_preco is not null then v_preco else p.preco_venda end into v_nome, v_val
        from public.produtos p where p.id = v_pid and p.petshop_id = p_petshop;
      if not found then raise exception 'Produto da troca não encontrado. Atualize a tela.'; end if;
      if v_val is null then raise exception '% está sem preço de venda. Ponha o preço na ficha do produto.', v_nome; end if;
      if v_val < 0 or v_val > 99999.99 or round(v_val, 2) <> v_val then raise exception 'Confira o preço de %.', v_nome; end if;
      v_novos := v_novos || jsonb_build_array(jsonb_build_object('tipo', 'produto', 'nome', v_nome, 'qtd', v_q, 'valor', v_val, 'produto_id', v_pid::text));
      v_n := v_n + round(v_q * v_val, 2);
    end loop;
    if v_n <= 0 then raise exception 'A troca está sem valor. Confira os preços.'; end if;
    v_t := least(v_v, v_n);
    v_dif := v_n - v_v;
  end if;

  -- dinheiro que entra ou sai de verdade: precisa da forma; quem só opera o caixa precisa do caixa aberto
  if p_modo = 'dinheiro' or (p_modo = 'troca' and (v_dif > 0 or (v_dif < 0 and v_resto = 'dinheiro'))) then
    if p_forma is null or p_forma not in ('dinheiro', 'pix', 'debito', 'credito', 'outro') then
      raise exception '%', case when p_modo = 'troca' and v_dif > 0 then 'Escolha como o cliente paga a diferença.' else 'Escolha como o dinheiro volta para o cliente.' end;
    end if;
    if v_caixa is null and not v_fin then
      raise exception 'O caixa está fechado. Abra o caixa para mexer no dinheiro.' using hint = 'maestro:caixa_fechado';
    end if;
  end if;
  if (p_modo = 'credito' or (p_modo = 'troca' and v_dif < 0 and v_resto = 'credito')) and v_cli is null then
    raise exception 'Para deixar de crédito, diga de quem é a compra.' using hint = 'maestro:sem_tutor';
  end if;

  if p_modo = 'dinheiro' then
    insert into public.lancamentos (petshop_id, tipo, valor, forma, categoria, descricao, data, pago, caixa_id, cliente_id, origem, criado_por, chave)
    values (p_petshop, 'saida', v_v, p_forma, 'Devolução', v_desc, v_hoje, true, v_caixa, v_cli, 'tela', v_uid, p_chave || ':saida')
    returning id into v_saida;
  elsif p_modo = 'credito' then
    v_r := public.credito_do_tutor_mover(p_petshop, v_cli, v_v, null, left(v_desc, 200), p_chave || ':credito');
    if not coalesce((v_r ->> 'ok')::boolean, false) then raise exception 'Não consegui deixar o crédito do tutor.'; end if;
    v_cred := (v_r ->> 'id')::uuid;
  else
    -- a devolução da troca: a parte trocada sai como "outro" (a mesma que entra na venda nova); o que sobra volta pela forma
    -- escolhida, ou fica de crédito
    if v_dif < 0 and v_resto = 'credito' then
      insert into public.lancamentos (petshop_id, tipo, valor, forma, categoria, descricao, data, pago, caixa_id, cliente_id, origem, criado_por, chave)
      values (p_petshop, 'saida', v_t, 'outro', 'Devolução', left('Troca: ' || substr(v_desc, 12), 200), v_hoje, true, v_caixa, v_cli, 'tela', v_uid, p_chave || ':saida')
      returning id into v_saida;
      v_r := public.credito_do_tutor_mover(p_petshop, v_cli, -v_dif, null, left('Troca: ' || substr(v_desc, 12), 200), p_chave || ':credito');
      if not coalesce((v_r ->> 'ok')::boolean, false) then raise exception 'Não consegui deixar o crédito do tutor.'; end if;
      v_cred := (v_r ->> 'id')::uuid;
    else
      if v_dif < 0 then
        v_pg := case when p_forma = 'outro' then null else jsonb_build_array(jsonb_build_object('forma', 'outro', 'valor', v_t), jsonb_build_object('forma', p_forma, 'valor', -v_dif)) end;
        v_forma := case when p_forma = 'outro' or v_t >= -v_dif then 'outro' else p_forma end;
      else
        v_pg := null; v_forma := 'outro';
      end if;
      insert into public.lancamentos (petshop_id, tipo, valor, forma, categoria, descricao, data, pago, caixa_id, cliente_id, origem, criado_por, pagamentos, chave)
      values (p_petshop, 'saida', v_v, v_forma, 'Devolução', left('Troca: ' || substr(v_desc, 12), 200), v_hoje, true, v_caixa, v_cli, 'tela', v_uid, v_pg, p_chave || ':saida')
      returning id into v_saida;
    end if;
    -- a venda nova, inteira: a parte trocada em "outro" e a diferença pela forma escolhida
    if v_dif > 0 then
      v_pg := case when p_forma = 'outro' then null else jsonb_build_array(jsonb_build_object('forma', 'outro', 'valor', v_t), jsonb_build_object('forma', p_forma, 'valor', v_dif)) end;
      v_forma := case when p_forma = 'outro' or v_t >= v_dif then 'outro' else p_forma end;
    else
      v_pg := null; v_forma := 'outro';
    end if;
    select left('Troca: ' || string_agg(replace(trim(to_char((i ->> 'qtd')::numeric, 'FM999999990.###'), '.'), '.', ',') || ' ' || (i ->> 'nome'), ' + '), 200)
      into v_nome from jsonb_array_elements(v_novos) i;
    insert into public.lancamentos (petshop_id, tipo, valor, forma, categoria, descricao, data, pago, caixa_id, cliente_id, origem, criado_por, itens, pagamentos, chave)
    values (p_petshop, 'entrada', v_n, v_forma, 'Venda de produtos', v_nome, v_hoje, true, v_caixa, v_cli, 'tela', v_uid, v_novos, v_pg, p_chave || ':entrada')
    returning id into v_entrada;
    insert into public.movimentos_estoque (petshop_id, produto_id, tipo, quantidade, motivo, criado_por, lancamento_id, chave)
    select p_petshop, (i ->> 'produto_id')::uuid, 'saida', (i ->> 'qtd')::numeric, 'Venda', v_uid, v_entrada, p_chave || ':troca:' || (i ->> 'produto_id')
    from jsonb_array_elements(v_novos) i;
  end if;

  -- o que voltou: entra no estoque; o avariado entra e sai como perda (fica anotado em Alterações em valores)
  insert into public.movimentos_estoque (petshop_id, produto_id, tipo, quantidade, motivo, criado_por, lancamento_id, chave)
  select p_petshop, (i ->> 'produto_id')::uuid, 'entrada', (i ->> 'qtd')::numeric, 'Devolução', v_uid, p_venda, p_chave || ':volta:' || (i ->> 'produto_id')
  from jsonb_array_elements(v_itens) i
  where exists (select 1 from public.produtos p where p.id = (i ->> 'produto_id')::uuid and p.petshop_id = p_petshop);
  insert into public.movimentos_estoque (petshop_id, produto_id, tipo, quantidade, motivo, criado_por, chave)
  select p_petshop, (i ->> 'produto_id')::uuid, 'saida', (i ->> 'avariados')::numeric, 'Perda', v_uid, p_chave || ':perda:' || (i ->> 'produto_id')
  from jsonb_array_elements(v_itens) i
  where (i ->> 'avariados')::numeric > 0 and exists (select 1 from public.produtos p where p.id = (i ->> 'produto_id')::uuid and p.petshop_id = p_petshop);

  v_res := jsonb_build_object('ok', true, 'valor', v_v, 'novos', case when p_modo = 'troca' then v_n end,
    'diferenca', case when p_modo = 'troca' then v_dif end, 'saida_id', v_saida, 'entrada_id', v_entrada, 'credito_id', v_cred, 'itens', v_itens);
  insert into public.devolucoes (petshop_id, venda_id, cliente_id, modo, itens, valor, novos, valor_novos, diferenca, forma, saida_id, entrada_id, credito_id,
    chave, resultado, criado_por)
  values (p_petshop, p_venda, v_cli, p_modo, v_itens, v_v, case when p_modo = 'troca' then v_novos end, case when p_modo = 'troca' then v_n end,
    case when p_modo = 'troca' then v_dif end, p_forma, v_saida, v_entrada, v_cred, p_chave, v_res, v_uid)
  returning id into v_id;
  v_res := v_res || jsonb_build_object('id', v_id);
  update public.devolucoes x set resultado = v_res where x.id = v_id;
  return v_res;
end $$;
revoke execute on function public.venda_devolver(uuid, text, uuid, jsonb, text, text, jsonb, text, uuid) from public, anon;
grant execute on function public.venda_devolver(uuid, text, uuid, jsonb, text, text, jsonb, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2b. Comissão: a comissão sobre produto da conta de um atendimento desconta o que foi devolvido dela
-- ---------------------------------------------------------------------------------------------------------------------
-- (o mesmo da migração 20261184, com `dv`: as devoluções desta conta que continuam valendo)
create or replace function public.comissao_linhas_calc(p_petshop uuid, p_de date, p_ate date, p_profissional uuid default null)
returns table (profissional_id uuid, agendamento_id uuid, inicio timestamptz, pacote boolean, tipo text, servico_id uuid, base numeric, pct numeric, valor numeric)
language sql stable security definer set search_path = '' as $$
  with s as (
    select coalesce(x.fuso, 'America/Sao_Paulo') as fuso,
      coalesce(x.opcoes -> 'comissao.em_extras' = 'true'::jsonb, false) as em_extras,
      coalesce(x.opcoes -> 'comissao.por_servico' = 'true'::jsonb, false) as por_servico,
      case when coalesce(x.opcoes -> 'comissao.em_produtos' = 'true'::jsonb, false) and jsonb_typeof(x.opcoes -> 'comissao.produtos_pct') = 'number'
        then least(100, greatest(0, (x.opcoes ->> 'comissao.produtos_pct')::numeric)) else 0 end as produtos_pct
    from public.petshops x where x.id = p_petshop
  ), ags as (
    select a.id, a.inicio, a.servico_id, a.profissional_id, a.preco, a.pacote_cliente_id, p.comissao_pct, s.por_servico,
      l.id as conta_id, l.itens, pt.servico as parte_servico, coalesce(l.valor_original, l.valor) as valor_conta,
      exists (select 1 from public.agendamento_servicos e where e.agendamento_id = a.id) as varios,
      (l.id is null and a.pacote_cliente_id is not null) as pacote,
      case when l.id is not null then coalesce(pt.servico, coalesce(l.valor_original, l.valor)) + coalesce(df.valor, 0) else coalesce(a.preco, 0) end as base_servico,
      case when l.id is not null and s.em_extras then coalesce(pt.extra, 0) else 0 end as base_extra,
      case when l.id is not null and s.produtos_pct > 0 then greatest(0, coalesce(pt.produto, 0) - coalesce(dv.valor, 0)) else 0 end as produtos,
      case when s.por_servico then coalesce(cs.pct, p.comissao_pct) else p.comissao_pct end as pct,
      s.produtos_pct
    from s
    join public.agendamentos a on a.petshop_id = p_petshop and a.status = 'concluido' and a.profissional_id is not null
      and a.inicio >= (p_de::timestamp at time zone s.fuso) and a.inicio < ((p_ate + 1)::timestamp at time zone s.fuso)
    join public.profissionais p on p.id = a.profissional_id
    left join public.lancamentos l on l.agendamento_id = a.id and l.tipo = 'entrada'
    left join public.comissao_servicos cs on cs.servico_id = a.servico_id
    left join lateral public.partes_do_lancamento(coalesce(l.valor_original, l.valor), l.itens) pt on l.id is not null
    -- "Cobrar a diferença": o que foi recebido à parte depois de a conta fechar
    left join lateral (
      select sum(coalesce(d.valor_original, d.valor)) as valor from public.lancamentos d
      where d.petshop_id = p_petshop and d.tipo = 'entrada' and d.agendamento_id is null
        and (d.diferenca_de = a.id or (d.diferenca_de is null and jsonb_typeof(d.itens) = 'array'
             and d.itens @> jsonb_build_array(jsonb_build_object('diferenca_de', a.id::text))))
    ) df on l.id is not null
    -- produtos desta conta que voltaram (troca ou devolução que continua valendo)
    left join lateral (
      select sum(v.valor) as valor from public.devolucoes v
      where v.venda_id = l.id and v.petshop_id = p_petshop and coalesce(v.saida_id, v.credito_id) is not null
    ) dv on l.id is not null
    where p_profissional is null or a.profissional_id = p_profissional
  ), partes as (
    -- um só serviço: o serviço (e os extras) no percentual do serviço
    select g.id, 1 as ordem, 'servico' as tipo, g.servico_id, g.base_servico as base, g.pct from ags g where not g.varios
    union all
    select g.id, 8, 'extra', null::uuid, g.base_extra, g.pct from ags g where g.base_extra <> 0
    -- vários serviços: cada um com o valor dele e o percentual que vale para ele
    union all
    select g.id, 2, 'servico', r.servico_id, r.valor, case when g.por_servico then coalesce(c2.pct, g.comissao_pct) else g.comissao_pct end
    from ags g
    cross join lateral (
      select t.servico_id, t.valor from public.partes_por_servico(g.id, g.base_servico, g.itens, g.parte_servico is not null) t where g.conta_id is not null
      union all
      select e.servico_id, coalesce(e.preco, 0) from public.agendamento_servicos e where g.conta_id is null and e.agendamento_id = g.id
    ) r
    left join public.comissao_servicos c2 on c2.servico_id = r.servico_id
    where g.varios
    union all
    select g.id, 1, case when g.pacote_cliente_id is not null then 'pacote' else 'servico' end, g.servico_id, coalesce(g.preco, 0), g.pct from ags g where g.varios and (g.conta_id is null or g.pacote_cliente_id is not null)
    union all
    select g.id, 9, 'produto', null::uuid, g.produtos, g.produtos_pct from ags g where g.produtos <> 0
  )
  select g.profissional_id, g.id, g.inicio, (g.pacote or (g.varios and g.pacote_cliente_id is not null)),
    coalesce(x.tipo, 'nada'), x.servico_id, coalesce(x.base, 0), coalesce(x.pct, 0), coalesce(x.base * x.pct / 100, 0)
  from ags g
  left join partes x on x.id = g.id
  order by g.inicio, g.id, x.ordem
$$;
revoke execute on function public.comissao_linhas_calc(uuid, date, date, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2c. "Quanto sobrou": as devoluções do período por produto (o mesmo da migração 20261193, com "devolucoes")
-- ---------------------------------------------------------------------------------------------------------------------
-- devolucoes: [{produto_id, nome, unidade, quantidade, avariados, valor, custo_volta, sem_custo}] pelo dia da devolução.
-- valor: o que voltou ao cliente (dinheiro, crédito ou troca), já dentro de "devolvido" ou "credito_deixado";
-- custo_volta: o custo das unidades que voltaram ao estoque (o avariado não volta: é perda).
create or replace function public.lucro_do_periodo(p_petshop uuid, p_de date, p_ate date)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fuso text;
  v_opcoes jsonb;
  v_res jsonb;
begin
  if (select auth.uid()) is null or p_petshop is null or not (p_petshop in (select public.meus_petshops())) then
    raise exception 'Sem acesso a este pet shop.' using errcode = '42501';
  end if;
  if not public.cuido_do_financeiro(p_petshop) then
    raise exception 'Quanto sobrou é com quem cuida do financeiro.' using errcode = '42501';
  end if;
  if p_de is null or p_ate is null or p_ate < p_de or p_ate - p_de > 366 then
    raise exception 'Escolha um período de até um ano.';
  end if;
  select coalesce(s.fuso, 'America/Sao_Paulo'), coalesce(s.opcoes, '{}'::jsonb) into v_fuso, v_opcoes from public.petshops s where s.id = p_petshop;

  with pc as materialized (select * from public.lucro_pecas(p_petshop, p_de, p_ate)),
  com as materialized (select * from public.lucro_comissoes(p_petshop, p_de, p_ate)),
  sv as (
    select coalesce(a.servico_id, b.servico_id) as servico_id, coalesce(a.quantidade, 0) as quantidade, coalesce(a.receita, 0) as receita, coalesce(b.comissao, 0) as comissao
    from (select x.servico_id, coalesce(x.servico_id::text, '-') as k, sum(x.qtd) as quantidade, sum(x.valor) as receita from pc x where x.tipo = 'servico' group by x.servico_id) a
    full join (select y.servico_id, coalesce(y.servico_id::text, '-') as k, sum(y.comissao) as comissao from com y where y.tipo = 'servico' group by y.servico_id) b on b.k = a.k
  ),
  -- produto: custo de cada venda (a peça principal de cada conta)
  pp as (
    select x.produto_id, x.nome, x.qtd, x.valor,
      case when x.qtd > 0 and mv.n > 0 and mv.n = mv.nc then mv.c end as custo_salvo,
      case when x.qtd > 0 and not (mv.n > 0 and mv.n = mv.nc) and pr.custo is not null then round(x.qtd * pr.custo, 2) end as custo_cadastro,
      case when x.qtd > 0 and not (mv.n > 0 and mv.n = mv.nc) and pr.custo is null then x.qtd else 0 end as sem_custo
    from pc x
    left join public.produtos pr on pr.id = x.produto_id and pr.petshop_id = p_petshop
    left join lateral (
      select count(*) as n, count(m.custo_unitario) as nc, sum(round(m.quantidade * m.custo_unitario, 2)) as c
      from public.movimentos_estoque m
      where x.produto_id is not null and m.lancamento_id = x.conta and m.produto_id = x.produto_id and m.tipo = 'saida' and m.motivo = 'Venda'
    ) mv on true
    where x.tipo = 'produto'
  ),
  pd as (
    select coalesce(a.produto_id, b.produto_id) as produto_id, coalesce(a.nome, b.nome) as nome,
      coalesce(a.quantidade, 0) as quantidade, coalesce(a.receita, 0) as receita, coalesce(a.custo_salvo, 0) as custo_salvo,
      coalesce(a.custo_cadastro, 0) as custo_cadastro, coalesce(a.sem_custo, 0) as sem_custo, coalesce(b.comissao, 0) as comissao
    from (
      select x.produto_id, coalesce(x.produto_id::text, 'nome:' || lower(x.nome)) as k, (array_agg(x.nome))[1] as nome, sum(x.qtd) as quantidade, sum(x.valor) as receita,
        sum(coalesce(x.custo_salvo, 0)) as custo_salvo, sum(coalesce(x.custo_cadastro, 0)) as custo_cadastro, sum(x.sem_custo) as sem_custo
      from pp x group by x.produto_id, coalesce(x.produto_id::text, 'nome:' || lower(x.nome))
    ) a
    full join (select y.produto_id, coalesce(y.produto_id::text, 'nome:' || lower(y.nome)) as k, (array_agg(y.nome))[1] as nome, sum(y.comissao) as comissao
      from com y where y.tipo = 'produto' group by y.produto_id, coalesce(y.produto_id::text, 'nome:' || lower(y.nome))) b on b.k = a.k
  ),
  dvp as (
    select (i ->> 'produto_id')::uuid as produto_id, (array_agg(i ->> 'nome'))[1] as nome, sum((i ->> 'qtd')::numeric) as quantidade,
      sum(coalesce((i ->> 'avariados')::numeric, 0)) as avariados, sum((i ->> 'valor')::numeric) as valor,
      sum(round(((i ->> 'qtd')::numeric - coalesce((i ->> 'avariados')::numeric, 0)) * coalesce((i ->> 'custo')::numeric, 0), 2)) as custo_volta,
      sum(case when i ->> 'custo' is null then (i ->> 'qtd')::numeric - coalesce((i ->> 'avariados')::numeric, 0) else 0 end) as sem_custo
    from public.devolucoes dv cross join lateral jsonb_array_elements(dv.itens) i
    where dv.petshop_id = p_petshop and coalesce(dv.saida_id, dv.credito_id) is not null
      and dv.criado_em >= (p_de::timestamp at time zone v_fuso) and dv.criado_em < ((p_ate + 1)::timestamp at time zone v_fuso)
    group by 1
  ),
  dev as (
    select coalesce(sum(l.valor), 0) as v from public.lancamentos l
    where l.petshop_id = p_petshop and l.tipo = 'saida' and l.pago and l.movimento is null and l.categoria in ('Devolução', 'Devolução de sinal')
      and l.data between p_de and p_ate
  ),
  cred as (
    select coalesce(sum(c.valor) filter (where c.valor > 0), 0) as deixado,
      coalesce(-sum(c.valor) filter (where c.valor < 0 and c.lancamento_id is null), 0) as usado_fora
    from public.clientes_creditos c
    where c.petshop_id = p_petshop and c.criado_em >= (p_de::timestamp at time zone v_fuso) and c.criado_em < ((p_ate + 1)::timestamp at time zone v_fuso)
  ),
  sai as (
    select l.categoria, sum(l.valor) as valor from public.lancamentos l
    where l.petshop_id = p_petshop and l.tipo = 'saida' and l.pago and l.movimento is null and l.categoria not in ('Devolução', 'Devolução de sinal')
      and l.data between p_de and p_ate
    group by l.categoria
  ),
  ent as (select coalesce(sum(x.valor), 0) as v from pc x)
  select jsonb_build_object(
    'de', p_de, 'ate', p_ate,
    'comissao_como_custo', coalesce(v_opcoes -> 'lucro.comissao_custo' = 'true'::jsonb, false),
    'servicos', coalesce((select jsonb_agg(jsonb_build_object(
        'servico_id', s.servico_id, 'nome', coalesce(sv2.nome, 'Sem serviço escolhido'), 'quantidade', s.quantidade, 'receita', s.receita,
        'custo_material_unitario', sv2.custo_material, 'comissao', s.comissao) order by s.receita desc, sv2.nome)
      from sv s left join public.servicos sv2 on sv2.id = s.servico_id and sv2.petshop_id = p_petshop), '[]'::jsonb),
    'produtos', coalesce((select jsonb_agg(jsonb_build_object(
        'produto_id', d.produto_id, 'nome', coalesce(pr.nome, d.nome, 'Produto'), 'unidade', coalesce(pr.unidade, 'un'), 'quantidade', d.quantidade,
        'receita', d.receita, 'custo_salvo', d.custo_salvo, 'custo_cadastro', d.custo_cadastro, 'sem_custo', d.sem_custo, 'comissao', d.comissao)
        order by d.receita desc, coalesce(pr.nome, d.nome))
      from pd d left join public.produtos pr on pr.id = d.produto_id and pr.petshop_id = p_petshop), '[]'::jsonb),
    'devolucoes', coalesce((select jsonb_agg(jsonb_build_object(
        'produto_id', v.produto_id, 'nome', coalesce(pr.nome, v.nome, 'Produto'), 'unidade', coalesce(pr.unidade, 'un'), 'quantidade', v.quantidade,
        'avariados', v.avariados, 'valor', v.valor, 'custo_volta', v.custo_volta, 'sem_custo', v.sem_custo) order by v.valor desc, coalesce(pr.nome, v.nome))
      from dvp v left join public.produtos pr on pr.id = v.produto_id and pr.petshop_id = p_petshop), '[]'::jsonb),
    'extras', jsonb_build_object(
      'receita', (select coalesce(sum(x.valor), 0) from pc x where x.tipo = 'extra'),
      'comissao', (select coalesce(sum(y.comissao), 0) from com y where y.tipo = 'extra')),
    'outros', coalesce((select jsonb_agg(jsonb_build_object('categoria', o.categoria, 'valor', o.valor, 'lancamentos', o.n) order by o.valor desc, o.categoria)
      from (select x.categoria, sum(x.valor) as valor, count(distinct x.lancamento_id) as n from pc x where x.tipo = 'outro' group by x.categoria) o), '[]'::jsonb),
    'entradas', (select v from ent),
    'devolvido', (select v from dev),
    'credito_deixado', (select deixado from cred),
    'credito_usado_fora', (select usado_fora from cred),
    'faturamento', (select v from ent) - (select v from dev) - (select deixado from cred) + (select usado_fora from cred),
    'saidas', coalesce((select jsonb_agg(jsonb_build_object('categoria', s.categoria, 'valor', s.valor) order by s.valor desc, s.categoria) from sai s), '[]'::jsonb),
    'saiu', (select coalesce(sum(s.valor), 0) from sai s),
    'resultado', (select v from ent) - (select v from dev) - (select deixado from cred) + (select usado_fora from cred) - (select coalesce(sum(s.valor), 0) from sai s),
    'comissao_total', (select coalesce(sum(y.comissao), 0) from com y)
  ) into v_res;
  return v_res;
end $$;
revoke execute on function public.lucro_do_periodo(uuid, date, date) from public, anon;
grant execute on function public.lucro_do_periodo(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. Limite de fiado
-- ---------------------------------------------------------------------------------------------------------------------
-- Limite do cliente (em branco: vale o padrão da loja, opção dinheiro.limite_fiado; zero ou sem padrão: sem limite).
alter table public.clientes add column if not exists limite_fiado numeric(10, 2)
  check (limite_fiado is null or (limite_fiado >= 0 and limite_fiado <= 99999.99));

-- Só o dono e quem cuida do financeiro põem ou mudam o limite (a recepção edita a ficha, mas não o limite).
create or replace function public.clientes_limite_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if (tg_op = 'INSERT' and new.limite_fiado is not null) or (tg_op = 'UPDATE' and new.limite_fiado is distinct from old.limite_fiado) then
    if not (public.sou_dono(new.petshop_id) or public.cuido_do_financeiro(new.petshop_id)) then
      raise exception 'Só o dono ou quem cuida do financeiro muda o limite de fiado.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.clientes_limite_conferir() from public, anon, authenticated;
drop trigger if exists clientes_limite_conferir on public.clientes;
create trigger clientes_limite_conferir before insert or update of limite_fiado on public.clientes
  for each row execute function public.clientes_limite_conferir();

-- O limite que vale para o cliente: o dele, ou o padrão da loja (null = sem limite).
create or replace function public.fiado_limite_de(p_petshop uuid, p_cliente uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select c.limite_fiado from public.clientes c where c.id = p_cliente and c.petshop_id = p_petshop),
    (select case when jsonb_typeof(s.opcoes -> 'dinheiro.limite_fiado') = 'number' and (s.opcoes ->> 'dinheiro.limite_fiado')::numeric > 0
                 then round((s.opcoes ->> 'dinheiro.limite_fiado')::numeric, 2) end
     from public.petshops s where s.id = p_petshop))
$$;
revoke execute on function public.fiado_limite_de(uuid, uuid) from public, anon, authenticated;

create or replace function public.fiado_deve(p_petshop uuid, p_cliente uuid) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(l.valor), 0) from public.lancamentos l
  where l.petshop_id = p_petshop and l.cliente_id = p_cliente and l.tipo = 'entrada' and not l.pago and l.movimento is null
$$;
revoke execute on function public.fiado_deve(uuid, uuid) from public, anon, authenticated;

-- Quanto o cliente deve, o limite e quanto ainda cabe (para a tela avisar antes). Só quem mexe com dinheiro.
create or replace function public.fiado_situacao(p_petshop uuid, p_cliente uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_lim numeric; v_deve numeric; v_proprio numeric; v_nome text;
begin
  if not public.tenho_area(p_petshop, array['caixa', 'financeiro', 'relatorios']) then
    raise exception 'Só quem mexe com dinheiro vê o fiado.' using errcode = '42501';
  end if;
  select c.limite_fiado, c.nome into v_proprio, v_nome from public.clientes c where c.id = p_cliente and c.petshop_id = p_petshop;
  if not found then return null; end if;
  v_lim := public.fiado_limite_de(p_petshop, p_cliente);
  v_deve := public.fiado_deve(p_petshop, p_cliente);
  return jsonb_build_object('nome', v_nome, 'limite', v_lim, 'do_cliente', v_proprio is not null, 'deve', v_deve,
    'disponivel', case when v_lim is null then null else greatest(v_lim - v_deve, 0) end);
end $$;
revoke execute on function public.fiado_situacao(uuid, uuid) from public, anon;
grant execute on function public.fiado_situacao(uuid, uuid) to authenticated;

-- "Liberar mesmo assim": quem libera fica anotado. Vale para a próxima conta a receber deste cliente de até p_valor,
-- nos próximos 30 minutos, uma vez.
create table if not exists public.fiado_liberacoes (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  cliente_id uuid not null,
  valor numeric(10, 2) not null check (valor > 0),
  devia numeric(10, 2) not null,
  limite numeric(10, 2) not null,
  liberado_por uuid references auth.users (id) on delete set null,
  liberado_nome text,
  criado_em timestamptz not null default now(),
  lancamento_id uuid,
  usado_em timestamptz,
  foreign key (cliente_id, petshop_id) references public.clientes (id, petshop_id) on delete cascade
);
create index if not exists fiado_liberacoes_cliente_idx on public.fiado_liberacoes (petshop_id, cliente_id, criado_em desc);
alter table public.fiado_liberacoes enable row level security;
revoke all on public.fiado_liberacoes from public, anon, authenticated;
grant select on public.fiado_liberacoes to authenticated;
drop policy if exists fiado_liberacoes_ler on public.fiado_liberacoes;
create policy fiado_liberacoes_ler on public.fiado_liberacoes for select to authenticated
  using ((select public.tenho_area(fiado_liberacoes.petshop_id, array['caixa', 'financeiro', 'relatorios'])));

create or replace function public.fiado_liberar(p_petshop uuid, p_cliente uuid, p_valor numeric) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_lim numeric; v_deve numeric; v_id uuid;
begin
  if (select auth.uid()) is null or p_petshop is null or not (p_petshop in (select public.meus_petshops())) or not public.acesso_liberado(p_petshop) then
    raise exception 'Sem acesso a este pet shop.' using errcode = '42501';
  end if;
  if not (public.sou_dono(p_petshop) or public.cuido_do_financeiro(p_petshop)) then
    raise exception 'Só o dono ou quem cuida do financeiro libera passar do limite de fiado.' using errcode = '42501', hint = 'maestro:limite_fiado';
  end if;
  if p_valor is null or p_valor <= 0 or p_valor > 99999.99 then raise exception 'Confira o valor.'; end if;
  if not exists (select 1 from public.clientes c where c.id = p_cliente and c.petshop_id = p_petshop) then raise exception 'Cliente não encontrado.'; end if;
  v_lim := public.fiado_limite_de(p_petshop, p_cliente);
  v_deve := public.fiado_deve(p_petshop, p_cliente);
  insert into public.fiado_liberacoes (petshop_id, cliente_id, valor, devia, limite, liberado_por, liberado_nome)
  values (p_petshop, p_cliente, round(p_valor, 2), v_deve, coalesce(v_lim, 0), (select auth.uid()), public.nome_na_equipe(p_petshop))
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'deve', v_deve, 'limite', v_lim);
end $$;
revoke execute on function public.fiado_liberar(uuid, uuid, numeric) from public, anon;
grant execute on function public.fiado_liberar(uuid, uuid, numeric) to authenticated;

-- Conta a receber nova de um cliente (fiado, conta para depois, resto): passa do limite? Recusa, a não ser que alguém
-- tenha liberado. Não confere: pagamento na hora, mensalidade da creche (gerada pela cobrança), dívida trazida do caderno
-- (devido_desde), parte de uma conta, a mesma chave de novo (toque duplo) e o que não vem de uma pessoa logada.
create or replace function public.fiado_limite_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_lim numeric; v_deve numeric; v_lib uuid; v_nome text;
begin
  if new.tipo <> 'entrada' or new.pago or new.cliente_id is null or new.movimento is not null or new.conta_id is not null
     or new.devido_desde is not null or new.categoria = 'Creche: mensalidade' or (select auth.uid()) is null then
    return new;
  end if;
  if new.chave is not null and exists (select 1 from public.lancamentos x where x.petshop_id = new.petshop_id and x.chave = new.chave) then return new; end if;
  v_lim := public.fiado_limite_de(new.petshop_id, new.cliente_id);
  if v_lim is null then return new; end if;
  v_deve := public.fiado_deve(new.petshop_id, new.cliente_id);
  if v_deve + new.valor <= v_lim + 0.005 then return new; end if;
  update public.fiado_liberacoes f set usado_em = now(), lancamento_id = new.id
    where f.id = (select g.id from public.fiado_liberacoes g
                  where g.petshop_id = new.petshop_id and g.cliente_id = new.cliente_id and g.usado_em is null
                    and g.criado_em > now() - interval '30 minutes' and g.valor >= new.valor - 0.005
                  order by g.criado_em desc limit 1 for update skip locked)
    returning f.id into v_lib;
  if v_lib is not null then return new; end if;
  select split_part(btrim(c.nome), ' ', 1) into v_nome from public.clientes c where c.id = new.cliente_id;
  raise exception '% já deve %; com esta conta passa do limite de %.', coalesce(nullif(v_nome, ''), 'O cliente'), public.em_reais(v_deve), public.em_reais(v_lim)
    using hint = 'maestro:limite_fiado';
end $$;
revoke execute on function public.fiado_limite_conferir() from public, anon, authenticated;
drop trigger if exists fiado_limite_conferir on public.lancamentos;
create trigger fiado_limite_conferir before insert on public.lancamentos for each row execute function public.fiado_limite_conferir();

-- O limite padrão da loja é dinheiro: não vai para a equipe sem acesso ao dinheiro (o mesmo da 20261177, com a opção nova).
create or replace function public.opcoes_sem_valores(o jsonb)
returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(x.k, case
      when x.k in ('hotel.diaria_por_porte', 'hotel.temporadas', 'hotel.desconto_segundo_pet', 'hotel.taxas', 'creche.desconto_irmao')
        then jsonb_build_object('ativo', case when jsonb_typeof(x.v) = 'object' then coalesce(x.v -> 'ativo', 'false'::jsonb) else 'false'::jsonb end)
      else x.v end), '{}'::jsonb)
  from jsonb_each(coalesce(o, '{}'::jsonb)) as x(k, v)
  where x.k not in ('dinheiro.multa_fixa', 'dinheiro.multa_pct', 'dinheiro.juros_mes_pct', 'dinheiro.taxa_falta', 'creche.experiencia_preco',
                    'comissao.produtos_pct', 'dinheiro.limite_fiado')
$$;
