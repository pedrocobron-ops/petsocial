-- Creche e hotel, o cuidado com o tutor: diário do dia, quem pode buscar o pet, lista de espera e ocorrências.
-- Tudo é opcional (petshops.opcoes, chaves "casa.*") e começa desligado. Só entram tabelas e funções novas:
-- nenhuma tabela, coluna ou função que já existia muda, então o código que está no ar segue igual neste banco.
-- Nenhuma destas tabelas guarda dinheiro: quem trabalha na creche e no hotel lê e escreve, com ou sem as áreas de dinheiro.

-- Quem escreveu é sempre quem está logado, com o nome que tem na equipe.
create function public.casa_quem_escreve(p_petshop uuid) returns text
language sql stable security definer set search_path = '' as $$
  select x.nome from public.profissionais x where x.petshop_id = p_petshop and x.user_id = (select auth.uid()) limit 1
$$;
revoke execute on function public.casa_quem_escreve(uuid) from public, anon, authenticated;

-- ---------- diário do dia: o que o pet fez, para contar ao tutor ----------
create table public.estadias_diario (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  estadia_id uuid not null references public.estadias (id) on delete cascade,
  dia date not null,
  -- os itens marcados, pelo nome que tinham na hora (a lista é do dono, em Meu pet shop)
  itens jsonb not null default '[]'::jsonb check (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) <= 30 and char_length(itens::text) <= 2000),
  nota text check (char_length(nota) <= 600),
  enviado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users (id) on delete set null,
  atualizado_nome text,
  unique (estadia_id, dia)
);
create index on public.estadias_diario (petshop_id, dia);
alter table public.estadias_diario enable row level security;
revoke all on public.estadias_diario from anon, authenticated;
grant select, insert, update on public.estadias_diario to authenticated;
create policy estadias_diario_ler on public.estadias_diario for select to authenticated
  using (petshop_id in (select public.meus_petshops()));
create policy estadias_diario_criar on public.estadias_diario for insert to authenticated
  with check ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)));
create policy estadias_diario_editar on public.estadias_diario for update to authenticated
  using ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)))
  with check ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)));

-- O pet shop é sempre o da estadia; a estadia e o dia de uma anotação não mudam depois.
create function public.estadias_diario_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_petshop uuid;
begin
  select e.petshop_id into v_petshop from public.estadias e where e.id = new.estadia_id;
  if v_petshop is null then raise exception 'Estadia não encontrada.'; end if;
  if tg_op = 'UPDATE' and (new.estadia_id <> old.estadia_id or new.dia <> old.dia) then raise exception 'O diário é de um pet e de um dia: faça outro.'; end if;
  new.petshop_id := v_petshop;
  new.atualizado_em := now();
  if (select auth.uid()) is not null then
    new.atualizado_por := (select auth.uid());
    new.atualizado_nome := public.casa_quem_escreve(v_petshop);
  end if;
  return new;
end $$;
create trigger estadias_diario_conferir before insert or update on public.estadias_diario
  for each row execute function public.estadias_diario_conferir();

-- ---------- contatos do pet: quem pode buscar e o veterinário de emergência ----------
-- Um contato é do tutor (vale para todos os pets dele) ou de um pet só.
create table public.pets_contatos (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  cliente_id uuid references public.clientes (id) on delete cascade,
  pet_id uuid references public.pets (id) on delete cascade,
  tipo text not null check (tipo in ('busca', 'veterinario')),
  nome text not null check (char_length(trim(nome)) between 1 and 80),
  relacao text check (char_length(relacao) <= 40),
  telefone text check (char_length(telefone) <= 20),
  obs text check (char_length(obs) <= 200),
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id) on delete set null,
  check (cliente_id is not null or pet_id is not null)
);
create index on public.pets_contatos (petshop_id, cliente_id);
create index on public.pets_contatos (pet_id);
alter table public.pets_contatos enable row level security;
revoke all on public.pets_contatos from anon, authenticated;
grant select, insert, update, delete on public.pets_contatos to authenticated;
create policy pets_contatos_ler on public.pets_contatos for select to authenticated
  using (petshop_id in (select public.meus_petshops()));
create policy pets_contatos_criar on public.pets_contatos for insert to authenticated
  with check ((select public.tenho_area(petshop_id, array['creche_hotel', 'clientes'])) and (select public.acesso_liberado(petshop_id)));
create policy pets_contatos_editar on public.pets_contatos for update to authenticated
  using ((select public.tenho_area(petshop_id, array['creche_hotel', 'clientes'])) and (select public.acesso_liberado(petshop_id)))
  with check ((select public.tenho_area(petshop_id, array['creche_hotel', 'clientes'])) and (select public.acesso_liberado(petshop_id)));
create policy pets_contatos_remover on public.pets_contatos for delete to authenticated
  using ((select public.tenho_area(petshop_id, array['creche_hotel', 'clientes'])) and (select public.acesso_liberado(petshop_id)));

-- O tutor e o pet do contato têm de ser do mesmo pet shop.
create function public.pets_contatos_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then new.petshop_id := old.petshop_id; new.criado_em := old.criado_em; new.criado_por := old.criado_por; end if;
  if new.cliente_id is not null and not exists (select 1 from public.clientes c where c.id = new.cliente_id and c.petshop_id = new.petshop_id) then
    raise exception 'Tutor não encontrado neste pet shop.';
  end if;
  if new.pet_id is not null and not exists (select 1 from public.pets p where p.id = new.pet_id and p.petshop_id = new.petshop_id) then
    raise exception 'Pet não encontrado neste pet shop.';
  end if;
  if tg_op = 'INSERT' then new.criado_em := now(); new.criado_por := (select auth.uid()); end if;
  return new;
end $$;
create trigger pets_contatos_conferir before insert or update on public.pets_contatos
  for each row execute function public.pets_contatos_conferir();

-- ---------- quem levou o pet embora (fica na estadia) ----------
create table public.estadias_retiradas (
  estadia_id uuid primary key references public.estadias (id) on delete cascade,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  quem text not null check (quem in ('tutor', 'autorizado', 'outro')),
  nome text not null check (char_length(trim(nome)) between 1 and 80),
  relacao text check (char_length(relacao) <= 40),
  contato_id uuid references public.pets_contatos (id) on delete set null,
  anotado_em timestamptz not null default now(),
  anotado_por uuid references auth.users (id) on delete set null,
  anotado_nome text
);
create index on public.estadias_retiradas (petshop_id);
alter table public.estadias_retiradas enable row level security;
revoke all on public.estadias_retiradas from anon, authenticated;
grant select, insert, update on public.estadias_retiradas to authenticated;
create policy estadias_retiradas_ler on public.estadias_retiradas for select to authenticated
  using (petshop_id in (select public.meus_petshops()));
create policy estadias_retiradas_criar on public.estadias_retiradas for insert to authenticated
  with check ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)));
create policy estadias_retiradas_editar on public.estadias_retiradas for update to authenticated
  using ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)))
  with check ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)));

create function public.estadias_retiradas_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_petshop uuid;
begin
  select e.petshop_id into v_petshop from public.estadias e where e.id = new.estadia_id;
  if v_petshop is null then raise exception 'Estadia não encontrada.'; end if;
  new.petshop_id := v_petshop;
  if new.contato_id is not null and not exists (select 1 from public.pets_contatos c where c.id = new.contato_id and c.petshop_id = v_petshop) then
    new.contato_id := null;
  end if;
  new.anotado_em := now();
  if (select auth.uid()) is not null then
    new.anotado_por := (select auth.uid());
    new.anotado_nome := public.casa_quem_escreve(v_petshop);
  end if;
  return new;
end $$;
create trigger estadias_retiradas_conferir before insert or update on public.estadias_retiradas
  for each row execute function public.estadias_retiradas_conferir();

-- ---------- ocorrências da estadia (briga, machucado, fuga, vômito) ----------
create table public.estadias_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  estadia_id uuid not null references public.estadias (id) on delete cascade,
  pet_id uuid not null references public.pets (id) on delete cascade,
  tipo text not null check (tipo in ('briga', 'machucado', 'fugiu', 'vomitou', 'outro')),
  texto text not null default '' check (char_length(texto) <= 500),
  quando timestamptz not null default now(),
  -- entra na mensagem do diário do dia? (quem decide é a equipe, ocorrência por ocorrência)
  no_diario boolean not null default false,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id) on delete set null,
  criado_nome text
);
create index on public.estadias_ocorrencias (petshop_id, quando desc);
create index on public.estadias_ocorrencias (pet_id, quando desc);
create index on public.estadias_ocorrencias (estadia_id);
alter table public.estadias_ocorrencias enable row level security;
revoke all on public.estadias_ocorrencias from anon, authenticated;
grant select, insert, delete on public.estadias_ocorrencias to authenticated;
-- depois de escrita, a ocorrência não muda: só dá para dizer se ela vai ou não no diário
grant update (no_diario) on public.estadias_ocorrencias to authenticated;
create policy estadias_ocorrencias_ler on public.estadias_ocorrencias for select to authenticated
  using (petshop_id in (select public.meus_petshops()));
create policy estadias_ocorrencias_criar on public.estadias_ocorrencias for insert to authenticated
  with check ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)));
create policy estadias_ocorrencias_editar on public.estadias_ocorrencias for update to authenticated
  using ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)))
  with check ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)));
-- apagar é só do dono: o que a equipe anotou fica para ele ver
create policy estadias_ocorrencias_remover on public.estadias_ocorrencias for delete to authenticated
  using ((select public.sou_dono(petshop_id)) and (select public.acesso_liberado(petshop_id)));

create function public.estadias_ocorrencias_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
declare e public.estadias;
begin
  select * into e from public.estadias x where x.id = new.estadia_id;
  if not found then raise exception 'Estadia não encontrada.'; end if;
  new.petshop_id := e.petshop_id;
  new.pet_id := e.pet_id;
  new.criado_em := now();
  -- a hora é a que a pessoa disse, sem passar de agora nem voltar mais de uma semana
  if new.quando is null or new.quando > now() + interval '5 minutes' then new.quando := now(); end if;
  if new.quando < now() - interval '7 days' then raise exception 'A ocorrência é de mais de uma semana atrás. Confira o dia.'; end if;
  if (select auth.uid()) is not null then
    new.criado_por := (select auth.uid());
    new.criado_nome := public.casa_quem_escreve(e.petshop_id);
  end if;
  return new;
end $$;
create trigger estadias_ocorrencias_conferir before insert on public.estadias_ocorrencias
  for each row execute function public.estadias_ocorrencias_conferir();

-- ---------- lista de espera por dia ----------
-- entrada e saída como o tutor fala: na creche os dois dias contam; no hotel a saída é o dia em que busca (não ocupa a noite).
create table public.lista_espera (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  tipo text not null check (tipo in ('creche', 'hotel')),
  entrada date not null,
  saida date not null,
  pet_id uuid references public.pets (id) on delete set null,
  pet_nome text not null check (char_length(trim(pet_nome)) between 1 and 80),
  tutor_nome text check (char_length(tutor_nome) <= 120),
  telefone text check (char_length(telefone) <= 20),
  especie text check (especie in ('cao', 'gato', 'outro')),
  porte text check (porte in ('P', 'M', 'G', 'GG')),
  obs text check (char_length(obs) <= 300),
  origem text not null default 'equipe' check (origem in ('equipe', 'link')),
  status text not null default 'esperando' check (status in ('esperando', 'chamado', 'atendido', 'desistiu')),
  chamado_em timestamptz,
  criado_em timestamptz not null default now(),
  criado_por uuid references auth.users (id) on delete set null,
  criado_nome text,
  check (saida >= entrada and saida <= entrada + 60)
);
create index on public.lista_espera (petshop_id, status, entrada);
alter table public.lista_espera enable row level security;
revoke all on public.lista_espera from anon, authenticated;
grant select, insert, update, delete on public.lista_espera to authenticated;
-- tem telefone de tutor que ainda nem é cliente: só quem trabalha na creche e no hotel lê
create policy lista_espera_ler on public.lista_espera for select to authenticated
  using ((select public.tenho_area(petshop_id, array['creche_hotel'])));
create policy lista_espera_criar on public.lista_espera for insert to authenticated
  with check ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)));
create policy lista_espera_editar on public.lista_espera for update to authenticated
  using ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)))
  with check ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)));
create policy lista_espera_remover on public.lista_espera for delete to authenticated
  using ((select public.tenho_area(petshop_id, array['creche_hotel'])) and (select public.acesso_liberado(petshop_id)));

create function public.lista_espera_conferir() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    new.petshop_id := old.petshop_id; new.origem := old.origem; new.criado_em := old.criado_em; new.criado_por := old.criado_por; new.criado_nome := old.criado_nome;
  else
    new.criado_em := now();
    -- pelo link ninguém está logado: a função do link grava a origem; pela tela, é sempre "equipe"
    if (select auth.uid()) is not null then
      new.origem := 'equipe';
      new.criado_por := (select auth.uid());
      new.criado_nome := public.casa_quem_escreve(new.petshop_id);
    end if;
  end if;
  if new.pet_id is not null and not exists (select 1 from public.pets p where p.id = new.pet_id and p.petshop_id = new.petshop_id) then
    raise exception 'Pet não encontrado neste pet shop.';
  end if;
  return new;
end $$;
create trigger lista_espera_conferir before insert or update on public.lista_espera
  for each row execute function public.lista_espera_conferir();

revoke execute on function public.estadias_diario_conferir(), public.pets_contatos_conferir(), public.estadias_retiradas_conferir(),
  public.estadias_ocorrencias_conferir(), public.lista_espera_conferir() from public, anon, authenticated;

-- ---------- link do cliente: pedir para entrar na lista de espera ----------
-- Funções novas (as do link que já existiam ficam como estão). O link só oferece a espera quando o dono ligou as duas chaves.
create function public.link_espera_ativa(p_codigo text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select coalesce((p.opcoes -> 'casa.espera' ->> 'ativo')::boolean, false) and coalesce((p.opcoes -> 'casa.espera' ->> 'link')::boolean, false)
    from public.petshops p
    where p.link_codigo = p_codigo and p.link_ativo and public.acesso_liberado(p.id)), false)
$$;

-- Entra na lista de espera. Só aceita quando algum dia do período está mesmo cheio (dia em que a creche não abre não tem espera).
-- Não reserva nada e não ocupa vaga: é um nome numa lista, que o pet shop chama se abrir lugar.
create function public.link_espera_pedir(
  p_codigo text, p_tipo text, p_entrada date, p_saida date, p_tutor text, p_telefone text, p_pet text,
  p_especie text default 'cao', p_porte text default null, p_obs text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v public.petshops;
  v_fone text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_hoje date;
  v_ate date;
  v_cheios int;
  v_id uuid;
begin
  select * into v from public.petshops where link_codigo = p_codigo and link_ativo;
  if not found or not public.acesso_liberado(v.id) or not public.link_espera_ativa(p_codigo) then return jsonb_build_object('ok', false, 'erro', 'fechado'); end if;
  if p_tipo is null or p_tipo not in ('creche', 'hotel') or (p_tipo = 'creche' and not v.link_creche) or (p_tipo = 'hotel' and not v.link_hotel) then
    return jsonb_build_object('ok', false, 'erro', 'fechado');
  end if;
  v_hoje := (now() at time zone v.fuso)::date;
  if char_length(trim(coalesce(p_tutor, ''))) < 2 or not public.fone_plausivel(v_fone) or char_length(trim(coalesce(p_pet, ''))) < 1 then
    return jsonb_build_object('ok', false, 'erro', 'dados');
  end if;
  if p_entrada is null or p_saida is null or p_entrada < v_hoje or p_entrada > v_hoje + 365
     or p_saida < p_entrada or (p_tipo = 'hotel' and p_saida = p_entrada) or p_saida > p_entrada + 60 then
    return jsonb_build_object('ok', false, 'erro', 'datas');
  end if;
  v_ate := case when p_tipo = 'hotel' then p_saida - 1 else p_saida end;
  if p_tipo = 'creche' and exists (select 1 from generate_series(p_entrada, v_ate, interval '1 day') d where not public.creche_abre(v.horario, d::date)) then
    return jsonb_build_object('ok', false, 'erro', 'nao_abre');
  end if;
  select count(*) into v_cheios from public.link_estadia_cheios(p_codigo, p_tipo, p_entrada, v_ate);
  if v_cheios = 0 then return jsonb_build_object('ok', false, 'erro', 'tem_vaga'); end if;
  if exists (
    select 1 from public.lista_espera q
    where q.petshop_id = v.id and q.tipo = p_tipo and q.status in ('esperando', 'chamado')
      and right(q.telefone, 8) = right(v_fone, 8) and lower(trim(q.pet_nome)) = lower(trim(p_pet))
      and q.entrada <= p_saida and q.saida >= p_entrada
  ) then
    return jsonb_build_object('ok', false, 'erro', 'repetido');
  end if;
  if (select count(*) from public.lista_espera where petshop_id = v.id and telefone = v_fone and status in ('esperando', 'chamado') and saida >= v_hoje) >= 6
     or (select count(*) from public.lista_espera where petshop_id = v.id and origem = 'link' and criado_em > now() - interval '1 day') >= 60 then
    return jsonb_build_object('ok', false, 'erro', 'limite');
  end if;
  insert into public.lista_espera (petshop_id, tipo, entrada, saida, pet_nome, tutor_nome, telefone, especie, porte, obs, origem)
  values (v.id, p_tipo, p_entrada, p_saida, left(trim(p_pet), 80), left(trim(p_tutor), 120), v_fone,
    case when p_especie in ('cao', 'gato', 'outro') then p_especie else 'cao' end,
    case when p_porte in ('P', 'M', 'G', 'GG') then p_porte else null end,
    nullif(left(trim(coalesce(p_obs, '')), 300), ''), 'link')
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke execute on function public.link_espera_ativa(text), public.link_espera_pedir(text, text, date, date, text, text, text, text, text, text) from public;
grant execute on function public.link_espera_ativa(text), public.link_espera_pedir(text, text, date, date, text, text, text, text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
