-- Maestro Pet Gestão · base do banco
-- Cada pet shop só enxerga os próprios dados (RLS em todas as tabelas).
-- Conta com teste vencido ou assinatura cancelada fica somente para consulta: a regra está no banco, não só na tela.

-- ============================================================
-- Tipos
-- ============================================================
create type public.papel_equipe as enum ('dono', 'gerente', 'funcionario');
create type public.status_assinatura as enum ('teste', 'ativa', 'atrasada', 'cancelada', 'cortesia');
create type public.status_agendamento as enum ('marcado', 'confirmado', 'em_atendimento', 'concluido', 'faltou', 'cancelado');

-- ============================================================
-- Tabelas
-- ============================================================
create table public.petshops (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (char_length(nome) between 2 and 80),
  telefone text,
  cidade text,
  uf text,
  fuso text not null default 'America/Sao_Paulo',
  -- chave = dia da semana (0 domingo … 6 sábado); null = fechado
  horario jsonb not null default '{"0":null,"1":{"abre":"08:00","fecha":"18:00"},"2":{"abre":"08:00","fecha":"18:00"},"3":{"abre":"08:00","fecha":"18:00"},"4":{"abre":"08:00","fecha":"18:00"},"5":{"abre":"08:00","fecha":"18:00"},"6":{"abre":"08:00","fecha":"13:00"}}'::jsonb,
  status public.status_assinatura not null default 'teste',
  plano text not null default 'gestao' check (plano in ('gestao', 'gestao_whatsapp')),
  teste_ate timestamptz not null default (now() + interval '7 days'),
  cakto_email text,
  cakto_assinatura text,
  assinatura_desde timestamptz,
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now()
);

create table public.profissionais (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  nome text not null check (char_length(nome) between 1 and 80),
  papel public.papel_equipe not null default 'funcionario',
  ve_financeiro boolean not null default false,
  email_convite text,
  cor text not null default '#1e3a2f',
  comissao_pct numeric(5, 2) not null default 0 check (comissao_pct between 0 and 100),
  -- escala semanal: chave = dia da semana; null = folga
  escala jsonb,
  atende boolean not null default true,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (id, petshop_id),
  unique (petshop_id, user_id)
);
create index on public.profissionais (user_id);
create index on public.profissionais (lower(email_convite)) where user_id is null;

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 120),
  telefone text,
  email text,
  endereco text,
  obs text,
  criado_em timestamptz not null default now(),
  unique (id, petshop_id)
);
create index on public.clientes (petshop_id, nome);

create table public.pets (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null,
  cliente_id uuid not null,
  nome text not null check (char_length(nome) between 1 and 80),
  especie text not null default 'cao' check (especie in ('cao', 'gato', 'outro')),
  raca text,
  porte text check (porte in ('P', 'M', 'G', 'GG')),
  sexo text check (sexo in ('M', 'F')),
  nascimento date,
  alertas text,
  obs text,
  foto text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (id, petshop_id),
  foreign key (cliente_id, petshop_id) references public.clientes (id, petshop_id) on delete cascade
);
create index on public.pets (petshop_id, nome);
create index on public.pets (cliente_id);

create table public.servicos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 80),
  categoria text not null default 'banho' check (categoria in ('banho', 'tosa', 'banho_tosa', 'creche', 'hotel', 'outro')),
  duracao_min int not null default 60 check (duracao_min between 5 and 1440),
  preco_p numeric(10, 2),
  preco_m numeric(10, 2),
  preco_g numeric(10, 2),
  preco_gg numeric(10, 2),
  cor text not null default '#f97316',
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (id, petshop_id)
);
create index on public.servicos (petshop_id);

create table public.pacotes (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  nome text not null,
  servico_id uuid,
  quantidade int not null default 4 check (quantidade > 0),
  validade_dias int not null default 30 check (validade_dias > 0),
  preco numeric(10, 2) not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (id, petshop_id),
  foreign key (servico_id, petshop_id) references public.servicos (id, petshop_id)
);

create table public.pacotes_clientes (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null,
  pet_id uuid not null,
  pacote_id uuid,
  nome text not null,
  servico_id uuid,
  total int not null check (total > 0),
  usados int not null default 0 check (usados >= 0),
  comprado_em date not null default current_date,
  vence_em date,
  preco numeric(10, 2) not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (id, petshop_id),
  foreign key (pet_id, petshop_id) references public.pets (id, petshop_id) on delete cascade,
  foreign key (pacote_id, petshop_id) references public.pacotes (id, petshop_id),
  foreign key (servico_id, petshop_id) references public.servicos (id, petshop_id)
);
create index on public.pacotes_clientes (petshop_id, pet_id);

create table public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null,
  pet_id uuid not null,
  servico_id uuid,
  profissional_id uuid,
  inicio timestamptz not null,
  fim timestamptz not null,
  status public.status_agendamento not null default 'marcado',
  preco numeric(10, 2),
  obs text,
  leva_traz boolean not null default false,
  endereco_leva_traz text,
  checklist jsonb not null default '{}'::jsonb,
  pacote_cliente_id uuid,
  lembrete_em timestamptz,
  origem text not null default 'tela' check (origem in ('tela', 'assistente', 'link')),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  check (fim > inicio),
  unique (id, petshop_id),
  foreign key (pet_id, petshop_id) references public.pets (id, petshop_id) on delete cascade,
  foreign key (servico_id, petshop_id) references public.servicos (id, petshop_id),
  foreign key (profissional_id, petshop_id) references public.profissionais (id, petshop_id),
  foreign key (pacote_cliente_id, petshop_id) references public.pacotes_clientes (id, petshop_id)
);
create index on public.agendamentos (petshop_id, inicio);
create index on public.agendamentos (pet_id, inicio desc);

create table public.estadias (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null,
  pet_id uuid not null,
  tipo text not null check (tipo in ('creche', 'hotel')),
  entrada timestamptz not null,
  saida_prevista timestamptz,
  saida timestamptz,
  valor_diaria numeric(10, 2),
  status text not null default 'reservada' check (status in ('reservada', 'em_casa', 'encerrada', 'cancelada')),
  obs text,
  criado_em timestamptz not null default now(),
  foreign key (pet_id, petshop_id) references public.pets (id, petshop_id) on delete cascade
);
create index on public.estadias (petshop_id, entrada);

create table public.caixas (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  aberto_em timestamptz not null default now(),
  aberto_por uuid references auth.users (id) on delete set null,
  valor_inicial numeric(10, 2) not null default 0,
  fechado_em timestamptz,
  fechado_por uuid references auth.users (id) on delete set null,
  valor_contado numeric(10, 2),
  obs text,
  unique (id, petshop_id)
);
-- só um caixa aberto por vez
create unique index caixas_um_aberto on public.caixas (petshop_id) where fechado_em is null;

create table public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida')),
  valor numeric(10, 2) not null check (valor > 0),
  forma text check (forma in ('dinheiro', 'pix', 'debito', 'credito', 'outro')),
  categoria text not null default 'Outros',
  descricao text,
  -- pago = true: `data` é o dia em que o dinheiro entrou ou saiu. pago = false: conta a pagar ou a receber, com `vencimento`.
  data date not null default current_date,
  vencimento date,
  pago boolean not null default true,
  caixa_id uuid,
  agendamento_id uuid,
  cliente_id uuid,
  origem text not null default 'tela' check (origem in ('tela', 'assistente', 'sistema')),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  foreign key (caixa_id, petshop_id) references public.caixas (id, petshop_id),
  foreign key (agendamento_id, petshop_id) references public.agendamentos (id, petshop_id) on delete set null (agendamento_id),
  foreign key (cliente_id, petshop_id) references public.clientes (id, petshop_id) on delete set null (cliente_id)
);
create index on public.lancamentos (petshop_id, data);
create index on public.lancamentos (petshop_id, pago, vencimento);

create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  nome text not null check (char_length(nome) between 1 and 120),
  categoria text,
  unidade text not null default 'un',
  preco_venda numeric(10, 2),
  custo numeric(10, 2),
  estoque numeric(12, 3) not null default 0,
  estoque_minimo numeric(12, 3) not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (id, petshop_id)
);
create index on public.produtos (petshop_id, nome);

create table public.movimentos_estoque (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null,
  produto_id uuid not null,
  tipo text not null check (tipo in ('entrada', 'saida', 'ajuste')),
  -- entrada e saída: quantidade positiva. ajuste: novo saldo contado.
  quantidade numeric(12, 3) not null check (quantidade >= 0),
  custo_unitario numeric(10, 2),
  motivo text,
  origem text not null default 'tela' check (origem in ('tela', 'assistente', 'sistema')),
  criado_por uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  foreign key (produto_id, petshop_id) references public.produtos (id, petshop_id) on delete cascade
);
create index on public.movimentos_estoque (petshop_id, criado_em desc);

-- o que a assistente fez, para histórico e limite de uso
create table public.assistente_eventos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  pedido text,
  acao text,
  detalhes jsonb,
  criado_em timestamptz not null default now()
);
create index on public.assistente_eventos (petshop_id, criado_em desc);

-- uso interno da Maestro Pet
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);
create table public.notas_admin (
  petshop_id uuid primary key references public.petshops (id) on delete cascade,
  nota text,
  atualizado_em timestamptz not null default now()
);
create table public.cakto_eventos (
  id bigint generated always as identity primary key,
  recebido_em timestamptz not null default now(),
  evento text,
  email text,
  petshop_id uuid references public.petshops (id) on delete set null,
  payload jsonb
);
create table public.config_interna (
  chave text primary key,
  valor text not null
);

-- ============================================================
-- Funções de acesso (usadas pelas regras de RLS)
-- ============================================================
create function public.meus_petshops() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select petshop_id from public.profissionais where user_id = (select auth.uid()) and ativo
$$;

create function public.sou_dono(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profissionais where petshop_id = p and user_id = (select auth.uid()) and ativo and papel = 'dono')
$$;

create function public.vejo_financeiro(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profissionais
    where petshop_id = p and user_id = (select auth.uid()) and ativo and (papel in ('dono', 'gerente') or ve_financeiro)
  )
$$;

create function public.acesso_liberado(p uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.petshops
    where id = p and (status in ('ativa', 'atrasada', 'cortesia') or (status = 'teste' and teste_ate > now()))
  )
$$;

create function public.sou_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()))
$$;

-- ============================================================
-- Estoque: o saldo do produto acompanha os movimentos
-- ============================================================
create function public.aplicar_movimento_estoque() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo = 'entrada' then
    update public.produtos
      set estoque = estoque + new.quantidade,
          custo = coalesce(new.custo_unitario, custo)
      where id = new.produto_id;
  elsif new.tipo = 'saida' then
    update public.produtos set estoque = estoque - new.quantidade where id = new.produto_id;
  else
    update public.produtos set estoque = new.quantidade where id = new.produto_id;
  end if;
  return new;
end $$;
create trigger movimentos_estoque_aplica after insert on public.movimentos_estoque
  for each row execute function public.aplicar_movimento_estoque();

-- ============================================================
-- RLS
-- ============================================================
alter table public.petshops enable row level security;
alter table public.profissionais enable row level security;
alter table public.clientes enable row level security;
alter table public.pets enable row level security;
alter table public.servicos enable row level security;
alter table public.pacotes enable row level security;
alter table public.pacotes_clientes enable row level security;
alter table public.agendamentos enable row level security;
alter table public.estadias enable row level security;
alter table public.caixas enable row level security;
alter table public.lancamentos enable row level security;
alter table public.produtos enable row level security;
alter table public.movimentos_estoque enable row level security;
alter table public.assistente_eventos enable row level security;
alter table public.admins enable row level security;
alter table public.notas_admin enable row level security;
alter table public.cakto_eventos enable row level security;
alter table public.config_interna enable row level security;
-- admins, notas_admin, cakto_eventos e config_interna não têm regra: só as funções internas leem e gravam.

-- pet shop: a equipe lê; só o dono altera, e só os campos de cadastro (status e teste não são editáveis pela conta)
create policy petshops_ler on public.petshops for select to authenticated
  using (id in (select public.meus_petshops()));
create policy petshops_editar on public.petshops for update to authenticated
  using ((select public.sou_dono(id))) with check ((select public.sou_dono(id)));
revoke insert, update, delete on public.petshops from anon, authenticated;
grant update (nome, telefone, cidade, uf, fuso, horario) on public.petshops to authenticated;

-- equipe: todos leem; só o dono cria, altera e remove (o vínculo com o login é feito pela função entrar())
create policy profissionais_ler on public.profissionais for select to authenticated
  using (petshop_id in (select public.meus_petshops()));
create policy profissionais_criar on public.profissionais for insert to authenticated
  with check ((select public.sou_dono(petshop_id)) and (select public.acesso_liberado(petshop_id)) and user_id is null);
create policy profissionais_editar on public.profissionais for update to authenticated
  using ((select public.sou_dono(petshop_id))) with check ((select public.sou_dono(petshop_id)));
create policy profissionais_remover on public.profissionais for delete to authenticated
  using ((select public.sou_dono(petshop_id)) and papel <> 'dono');
revoke update on public.profissionais from anon, authenticated;
grant update (nome, papel, ve_financeiro, email_convite, cor, comissao_pct, escala, atende, ativo) on public.profissionais to authenticated;

-- tabelas do dia a dia: toda a equipe lê; grava quem é da equipe e está com o acesso liberado
do $$
declare t text;
begin
  foreach t in array array['clientes', 'pets', 'servicos', 'pacotes', 'pacotes_clientes', 'agendamentos', 'estadias', 'produtos', 'movimentos_estoque', 'assistente_eventos']
  loop
    execute format('create policy %1$s_ler on public.%1$I for select to authenticated using (petshop_id in (select public.meus_petshops()))', t);
    execute format('create policy %1$s_criar on public.%1$I for insert to authenticated with check (petshop_id in (select public.meus_petshops()) and (select public.acesso_liberado(petshop_id)))', t);
    execute format('create policy %1$s_editar on public.%1$I for update to authenticated using (petshop_id in (select public.meus_petshops()) and (select public.acesso_liberado(petshop_id))) with check (petshop_id in (select public.meus_petshops()))', t);
    execute format('create policy %1$s_remover on public.%1$I for delete to authenticated using (petshop_id in (select public.meus_petshops()) and (select public.acesso_liberado(petshop_id)))', t);
  end loop;
end $$;

-- dinheiro: só quem vê o financeiro (dono, gerente ou quem o dono liberou)
do $$
declare t text;
begin
  foreach t in array array['caixas', 'lancamentos']
  loop
    execute format('create policy %1$s_ler on public.%1$I for select to authenticated using ((select public.vejo_financeiro(petshop_id)))', t);
    execute format('create policy %1$s_criar on public.%1$I for insert to authenticated with check ((select public.vejo_financeiro(petshop_id)) and (select public.acesso_liberado(petshop_id)))', t);
    execute format('create policy %1$s_editar on public.%1$I for update to authenticated using ((select public.vejo_financeiro(petshop_id)) and (select public.acesso_liberado(petshop_id))) with check ((select public.vejo_financeiro(petshop_id)))', t);
    execute format('create policy %1$s_remover on public.%1$I for delete to authenticated using ((select public.vejo_financeiro(petshop_id)) and (select public.acesso_liberado(petshop_id)))', t);
  end loop;
end $$;

-- ============================================================
-- Funções chamadas pelo aplicativo
-- ============================================================

-- Cria o pet shop de quem acabou de se cadastrar, com 7 dias de teste e os serviços mais comuns.
create function public.criar_petshop(p_nome text, p_seu_nome text, p_telefone text default null, p_cidade text default null, p_uf text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user is null then raise exception 'Faça login para continuar.'; end if;
  if (select count(*) from public.profissionais where user_id = v_user and papel = 'dono') >= 3 then
    raise exception 'Esta conta já tem o número máximo de pet shops.';
  end if;
  insert into public.petshops (nome, telefone, cidade, uf, criado_por)
    values (trim(p_nome), nullif(trim(p_telefone), ''), nullif(trim(p_cidade), ''), nullif(upper(trim(p_uf)), ''), v_user)
    returning id into v_id;
  insert into public.profissionais (petshop_id, user_id, nome, papel, ve_financeiro, cor)
    values (v_id, v_user, coalesce(nullif(trim(p_seu_nome), ''), 'Você'), 'dono', true, '#1e3a2f');
  insert into public.servicos (petshop_id, nome, categoria, duracao_min, cor, ordem) values
    (v_id, 'Banho', 'banho', 60, '#3b82a0', 1),
    (v_id, 'Banho e tosa', 'banho_tosa', 120, '#f97316', 2),
    (v_id, 'Tosa higiênica', 'tosa', 45, '#7c6fb0', 3),
    (v_id, 'Hidratação', 'outro', 30, '#4d8f6b', 4),
    (v_id, 'Corte de unhas', 'outro', 15, '#b0763f', 5);
  return v_id;
end $$;

-- Liga o login a convites pendentes (mesmo e-mail, já confirmado) e devolve os pet shops da pessoa.
create function public.entrar() returns setof public.profissionais
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_email text;
begin
  if v_user is null then return; end if;
  select lower(email) into v_email from auth.users where id = v_user and email_confirmed_at is not null;
  if v_email is not null then
    update public.profissionais p set user_id = v_user
      where p.user_id is null and p.ativo and lower(p.email_convite) = v_email
        and not exists (select 1 from public.profissionais x where x.petshop_id = p.petshop_id and x.user_id = v_user);
  end if;
  return query select * from public.profissionais where user_id = v_user and ativo order by criado_em;
end $$;

-- Horários que batem com outro atendimento do mesmo profissional (aviso na tela; não bloqueia).
create function public.conflitos_agenda(p_petshop uuid, p_profissional uuid, p_inicio timestamptz, p_fim timestamptz, p_ignorar uuid default null)
returns setof public.agendamentos language sql stable security invoker set search_path = '' as $$
  select * from public.agendamentos
  where petshop_id = p_petshop and profissional_id = p_profissional
    and status not in ('cancelado', 'faltou')
    and inicio < p_fim and fim > p_inicio
    and (p_ignorar is null or id <> p_ignorar)
$$;

-- Aviso da Cakto: muda o status da assinatura do pet shop pelo e-mail do checkout.
-- O segredo do webhook fica guardado só como hash em config_interna ('cakto_segredo_sha256').
create function public.cakto_evento(p_segredo text, p_evento text, p_email text, p_assinatura text, p_payload jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_hash text;
  v_petshop uuid;
  v_status public.status_assinatura;
begin
  select valor into v_hash from public.config_interna where chave = 'cakto_segredo_sha256';
  if v_hash is null or p_segredo is null
     or encode(extensions.digest(p_segredo, 'sha256'), 'hex') <> v_hash then
    return 'recusado';
  end if;

  v_status := case p_evento
    when 'subscription_created' then 'ativa'
    when 'purchase_approved' then 'ativa'
    when 'subscription_renewed' then 'ativa'
    when 'subscription_late_recovered' then 'ativa'
    when 'subscription_resumed' then 'ativa'
    when 'subscription_late' then 'atrasada'
    when 'subscription_renewal_refused' then 'atrasada'
    when 'subscription_canceled' then 'cancelada'
    when 'subscription_paused' then 'cancelada'
    when 'refund' then 'cancelada'
    when 'chargeback' then 'cancelada'
    else null end;

  -- acha o pet shop: primeiro pela assinatura já vinculada, depois pelo e-mail do checkout, depois pelo e-mail do dono
  select id into v_petshop from public.petshops where p_assinatura is not null and cakto_assinatura = p_assinatura limit 1;
  if v_petshop is null and p_email is not null then
    select id into v_petshop from public.petshops where lower(cakto_email) = lower(p_email) order by criado_em desc limit 1;
  end if;
  if v_petshop is null and p_email is not null then
    select p.petshop_id into v_petshop
      from public.profissionais p join auth.users u on u.id = p.user_id
      where p.papel = 'dono' and lower(u.email) = lower(p_email)
      order by p.criado_em desc limit 1;
  end if;

  insert into public.cakto_eventos (evento, email, petshop_id, payload) values (p_evento, p_email, v_petshop, p_payload);

  if v_petshop is null then return 'sem_conta'; end if;
  if v_status is null then return 'ignorado'; end if;

  update public.petshops set
      status = case when status = 'cortesia' then status else v_status end,
      cakto_email = coalesce(cakto_email, lower(p_email)),
      cakto_assinatura = coalesce(p_assinatura, cakto_assinatura),
      assinatura_desde = case when v_status = 'ativa' then coalesce(assinatura_desde, now()) else assinatura_desde end
    where id = v_petshop;
  return 'ok';
end $$;

-- Painel interno da Maestro Pet
create function public.admin_painel() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return (
    select coalesce(jsonb_agg(x order by x.criado_em desc), '[]'::jsonb) from (
      select p.id, p.nome, p.cidade, p.uf, p.telefone, p.status, p.plano, p.teste_ate, p.criado_em, p.assinatura_desde,
        p.cakto_email,
        (select u.email from public.profissionais d join auth.users u on u.id = d.user_id
           where d.petshop_id = p.id and d.papel = 'dono' order by d.criado_em limit 1) as dono_email,
        (select d.nome from public.profissionais d where d.petshop_id = p.id and d.papel = 'dono' order by d.criado_em limit 1) as dono_nome,
        (select count(*) from public.profissionais d where d.petshop_id = p.id and d.ativo) as equipe,
        (select count(*) from public.clientes c where c.petshop_id = p.id) as clientes,
        (select count(*) from public.pets c where c.petshop_id = p.id) as pets,
        (select count(*) from public.agendamentos a where a.petshop_id = p.id) as agendamentos,
        (select count(*) from public.agendamentos a where a.petshop_id = p.id and a.criado_em > now() - interval '7 days') as agendamentos_7d,
        (select count(*) from public.assistente_eventos a where a.petshop_id = p.id) as pedidos_assistente,
        (select max(a.criado_em) from public.agendamentos a where a.petshop_id = p.id) as ultimo_agendamento,
        (select n.nota from public.notas_admin n where n.petshop_id = p.id) as nota
      from public.petshops p
    ) x
  );
end $$;

create function public.admin_atualizar(p_petshop uuid, p_status public.status_assinatura default null, p_teste_ate timestamptz default null, p_plano text default null, p_nota text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  update public.petshops set
      status = coalesce(p_status, status),
      teste_ate = coalesce(p_teste_ate, teste_ate),
      plano = coalesce(p_plano, plano)
    where id = p_petshop;
  if p_nota is not null then
    insert into public.notas_admin (petshop_id, nota) values (p_petshop, p_nota)
      on conflict (petshop_id) do update set nota = excluded.nota, atualizado_em = now();
  end if;
end $$;

create function public.admin_eventos_cakto() returns setof public.cakto_eventos
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return query select * from public.cakto_eventos order by id desc limit 100;
end $$;

-- quem pode chamar o quê
-- só as funções deste sistema: o banco pode ter outros sistemas no mesmo esquema
revoke execute on function
  public.meus_petshops(), public.sou_dono(uuid), public.vejo_financeiro(uuid), public.acesso_liberado(uuid), public.sou_admin(),
  public.criar_petshop(text, text, text, text, text), public.entrar(),
  public.conflitos_agenda(uuid, uuid, timestamptz, timestamptz, uuid),
  public.cakto_evento(text, text, text, text, jsonb),
  public.admin_painel(), public.admin_atualizar(uuid, public.status_assinatura, timestamptz, text, text), public.admin_eventos_cakto(),
  public.aplicar_movimento_estoque()
  from public, anon, authenticated;
grant execute on function public.meus_petshops(), public.sou_dono(uuid), public.vejo_financeiro(uuid), public.acesso_liberado(uuid), public.sou_admin() to authenticated;
grant execute on function public.criar_petshop(text, text, text, text, text), public.entrar() to authenticated;
grant execute on function public.conflitos_agenda(uuid, uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.admin_painel(), public.admin_atualizar(uuid, public.status_assinatura, timestamptz, text, text), public.admin_eventos_cakto() to authenticated;
grant execute on function public.cakto_evento(text, text, text, text, jsonb) to anon, authenticated;

-- ============================================================
-- Fotos dos pets (arquivo com nome aleatório dentro da pasta do pet shop)
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('pets', 'pets', true, 1048576, array['image/jpeg', 'image/webp', 'image/png'])
  on conflict (id) do nothing;

create policy pets_fotos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'pets' and ((storage.foldername(name))[1])::uuid in (select public.meus_petshops()));
create policy pets_fotos_trocar on storage.objects for update to authenticated
  using (bucket_id = 'pets' and ((storage.foldername(name))[1])::uuid in (select public.meus_petshops()));
create policy pets_fotos_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'pets' and ((storage.foldername(name))[1])::uuid in (select public.meus_petshops()));
