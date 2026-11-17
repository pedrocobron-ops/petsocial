-- Extras do produto: autorização para postar a foto do pet e o "Bom dia" do Mozart.
--
-- Só entram objetos novos: duas tabelas (fotos_autorizacoes, fotos_autorizacao_freio) e funções novas. Nenhuma tabela existente
-- muda (pets, estadias, agendamentos, petshops, servicos e produtos, com permissão por coluna, ficam como estão). O código no ar
-- hoje não chama nada daqui. Nada aqui guarda dinheiro; o "Bom dia" só lê valor para quem tem área de dinheiro.
--
-- 1. Autorização para postar a foto do pet nas redes da loja. Na página pública do boletim (/gestao/boletim/<código>) o tutor toca
--    em "Pode postar a foto do <pet> nas redes da <loja>", escolhe QUAIS fotos (só as deste boletim, ou também as das próximas
--    visitas; nada vem marcado) e, se quiser, o @ para a loja marcar. O banco monta o texto exato (foto_autorizacao_texto) e guarda
--    cada autorização com o texto, a hora e o boletim. Tirar é a qualquer hora, pelo link "Não quero mais"
--    (/gestao/autorizacao/<código próprio>), que vale para sempre: tira todas as autorizações ativas do pet.
--    Freio: 5 autorizações por minuto por boletim, 60 por minuto por pet shop, 30 leituras e 10 retiradas por minuto por link.
--    A equipe (Clientes, Agenda ou Creche e hotel) lê pela regra, sem o código do link; ninguém grava direto na tabela.
-- 2. gestao_bom_dia(p): o que o cartão "Bom dia" da tela Hoje precisa, numa ida só ao banco, já filtrado pelas áreas de quem pede:
--    agenda de hoje (horários, para achar o buraco), casa (na casa, chegam, saem), quem deve e vem hoje (só com área de dinheiro),
--    vacinas vencendo dos pets que vêm hoje, pacote no último uso, aniversariantes do dia.

-- ---------- 1. autorização para postar a foto ----------
create table public.fotos_autorizacoes (
  id uuid primary key default gen_random_uuid(),
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  pet_id uuid not null,
  -- o boletim em que o tutor autorizou (a página some em 60 dias; a autorização fica)
  boletim_id uuid references public.boletins (id) on delete set null,
  -- 'boletim': só as fotos daquele boletim. 'todas': as daquele boletim e as das próximas visitas.
  escopo text not null check (escopo in ('boletim', 'todas')),
  marcar text check (marcar is null or marcar ~ '^@[A-Za-z0-9._]{1,30}$'),
  -- o texto exato que o tutor viu e aceitou
  texto text not null check (char_length(texto) between 20 and 1000),
  autorizado_em timestamptz not null default now(),
  retirado_em timestamptz,
  retirado_motivo text check (retirado_motivo in ('tutor', 'trocada')),
  -- o código do link "Não quero mais" (nunca sai para a equipe)
  codigo text not null unique check (codigo ~ '^[0-9a-f]{64}$'),
  check ((retirado_em is null) = (retirado_motivo is null)),
  foreign key (pet_id, petshop_id) references public.pets (id, petshop_id) on delete cascade
);
create index on public.fotos_autorizacoes (petshop_id, pet_id, autorizado_em desc);
create index on public.fotos_autorizacoes (boletim_id) where boletim_id is not null;

alter table public.fotos_autorizacoes enable row level security;
revoke all on public.fotos_autorizacoes from public, anon, authenticated;
grant select (id, petshop_id, pet_id, boletim_id, escopo, marcar, texto, autorizado_em, retirado_em, retirado_motivo)
  on public.fotos_autorizacoes to authenticated;
create policy fotos_autorizacoes_ler on public.fotos_autorizacoes for select to authenticated
  using (petshop_id in (select public.meus_petshops()) and public.tenho_area(petshop_id, array['clientes', 'agenda', 'creche_hotel']));

-- o freio das funções públicas (por boletim, por pet shop, por link)
create table public.fotos_autorizacao_freio (
  chave text not null,
  minuto timestamptz not null,
  n int not null default 0,
  primary key (chave, minuto)
);
alter table public.fotos_autorizacao_freio enable row level security;
revoke all on public.fotos_autorizacao_freio from public, anon, authenticated;

create function public.fotos_autorizacao_frear(p_chave text, p_limite int) returns void
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  insert into public.fotos_autorizacao_freio as f (chave, minuto, n) values (p_chave, date_trunc('minute', now()), 1)
  on conflict (chave, minuto) do update set n = f.n + 1
  returning f.n into v_n;
  if v_n = 1 then delete from public.fotos_autorizacao_freio f where f.minuto < now() - interval '10 minutes'; end if;
  if v_n > p_limite then
    raise exception 'Muitos toques agora. Espere um minuto e tente de novo.' using errcode = 'PT429';
  end if;
end $$;

-- O texto exato da autorização. Sem marcar: "Sem marcar o meu perfil." (a página troca essa frase pelo @ na prévia, igual a aqui).
create function public.foto_autorizacao_texto(p_loja text, p_pet text, p_sexo text, p_escopo text, p_marcar text, p_dia date)
returns text language sql immutable set search_path = '' as $$
  select 'Autorizo ' || p_loja || ' a postar nas redes sociais da loja '
    || case when p_escopo = 'boletim'
         then 'as fotos ' || case p_sexo when 'M' then 'do' when 'F' then 'da' else 'de' end || ' ' || p_pet || ' deste boletim (' || to_char(p_dia, 'DD/MM/YYYY') || ')'
         else 'as fotos ' || case p_sexo when 'M' then 'do' when 'F' then 'da' else 'de' end || ' ' || p_pet || ' deste boletim e das próximas visitas' end
    || '. '
    || case when p_marcar is null then 'Sem marcar o meu perfil.' else 'Pode marcar o meu perfil ' || p_marcar || '.' end
    || ' Posso tirar esta autorização quando quiser, pelo link "Não quero mais".'
$$;

-- O @ como o tutor digitou ("@ana.pets", "ana.pets", "instagram.com/ana.pets"): devolve "@ana.pets", nulo se vazio, erro se inválido.
create function public.foto_autorizacao_marcar(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := btrim(coalesce(p, ''));
begin
  v := regexp_replace(v, '^(https?://)?(www\.)?instagram\.com/', '', 'i');
  v := regexp_replace(v, '[/?#].*$', '');
  v := ltrim(v, '@');
  if v = '' then return null; end if;
  if v !~ '^[A-Za-z0-9._]{1,30}$' then raise exception 'Confira o @: só letras, números, ponto e _ (até 30).'; end if;
  return '@' || v;
end $$;

-- A autorização ativa que vale para as fotos deste boletim (a mais nova), ou nada: a dada neste boletim, ou uma "todas" dada antes
-- dele ("deste boletim e das próximas visitas": boletim mais velho que a autorização não entra).
create function public.foto_autorizacao_do_boletim(p_petshop uuid, p_pet uuid, p_boletim uuid) returns public.fotos_autorizacoes
language sql stable security definer set search_path = '' as $$
  select f.* from public.fotos_autorizacoes f
   where f.petshop_id = p_petshop and f.pet_id = p_pet and f.retirado_em is null
     and (f.boletim_id = p_boletim
       or (f.escopo = 'todas' and exists (select 1 from public.boletins x where x.id = p_boletim and x.criado_em >= f.autorizado_em)))
   order by f.autorizado_em desc limit 1
$$;

-- Para a página do boletim: os dois textos (sem o @) e a autorização que já vale para este boletim (com o código do "Não quero mais").
create function public.boletim_autorizacao(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.boletins; s public.petshops; p public.pets; f public.fotos_autorizacoes; v_dia date;
begin
  b := public.boletim_do_codigo(p_token);
  if b.id is null then return null; end if;
  perform public.boletim_frear(b.id, 'autorizacao', 60);
  select * into s from public.petshops where id = b.petshop_id;
  select * into p from public.pets where id = b.pet_id;
  v_dia := (b.criado_em at time zone coalesce(s.fuso, 'America/Sao_Paulo'))::date;
  f := public.foto_autorizacao_do_boletim(b.petshop_id, b.pet_id, b.id);
  return jsonb_build_object(
    'textos', jsonb_build_object(
      'boletim', public.foto_autorizacao_texto(s.nome, p.nome, p.sexo, 'boletim', null, v_dia),
      'todas', public.foto_autorizacao_texto(s.nome, p.nome, p.sexo, 'todas', null, v_dia)),
    'atual', case when f.id is null then null else jsonb_build_object('escopo', f.escopo, 'marcar', f.marcar, 'texto', f.texto,
      'desde', f.autorizado_em, 'codigo', f.codigo) end);
end $$;

-- O tutor autoriza, pela página do boletim. Mesma escolha de novo: devolve a que já existe. "Todas" no lugar de outra "todas":
-- a antiga sai como trocada. Devolve { escopo, marcar, texto, desde, codigo }.
create function public.boletim_autorizar(p_token text, p_escopo text, p_marcar text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare b public.boletins; s public.petshops; p public.pets; f public.fotos_autorizacoes; v_marcar text; v_dia date;
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

  select * into f from public.fotos_autorizacoes x
   where x.petshop_id = b.petshop_id and x.pet_id = b.pet_id and x.retirado_em is null and x.escopo = p_escopo
     and (p_escopo = 'todas' or x.boletim_id = b.id) and x.marcar is not distinct from v_marcar
   order by x.autorizado_em desc limit 1;
  if f.id is null then
    update public.fotos_autorizacoes x set retirado_em = now(), retirado_motivo = 'trocada'
     where x.petshop_id = b.petshop_id and x.pet_id = b.pet_id and x.retirado_em is null
       and (x.escopo = 'todas' and p_escopo = 'todas' or x.escopo = 'boletim' and x.boletim_id = b.id);
    insert into public.fotos_autorizacoes (petshop_id, pet_id, boletim_id, escopo, marcar, texto, codigo)
    values (b.petshop_id, b.pet_id, b.id, p_escopo, v_marcar, public.foto_autorizacao_texto(s.nome, p.nome, p.sexo, p_escopo, v_marcar, v_dia),
      encode(extensions.gen_random_bytes(32), 'hex'))
    returning * into f;
  end if;
  return jsonb_build_object('escopo', f.escopo, 'marcar', f.marcar, 'texto', f.texto, 'desde', f.autorizado_em, 'codigo', f.codigo);
end $$;

-- A página "Não quero mais": a autorização pelo código (mesmo com o boletim vencido). Nada do tutor além do @ que ele escreveu.
create function public.foto_autorizacao_publica(p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f public.fotos_autorizacoes; s public.petshops; p public.pets; v_ativas int;
begin
  if p_codigo is null or p_codigo !~ '^[0-9a-f]{64}$' then return null; end if;
  select * into f from public.fotos_autorizacoes x where x.codigo = p_codigo;
  if f.id is null then return null; end if;
  perform public.fotos_autorizacao_frear('ler:' || p_codigo, 30);
  select * into s from public.petshops where id = f.petshop_id;
  select * into p from public.pets where id = f.pet_id;
  select count(*) into v_ativas from public.fotos_autorizacoes x where x.petshop_id = f.petshop_id and x.pet_id = f.pet_id and x.retirado_em is null;
  return jsonb_build_object(
    'petshop', jsonb_build_object('nome', s.nome, 'logo', s.logo, 'tema', s.tema),
    'pet', jsonb_build_object('nome', p.nome, 'sexo', p.sexo),
    'escopo', f.escopo, 'marcar', f.marcar, 'texto', f.texto, 'desde', f.autorizado_em, 'retirado_em', f.retirado_em,
    'ativas', v_ativas);
end $$;

-- "Não quero mais": tira TODAS as autorizações ativas do pet (a do link e as outras). Devolve { retirado_em, retiradas }.
create function public.foto_autorizacao_retirar(p_codigo text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare f public.fotos_autorizacoes; v_n int;
begin
  if p_codigo is null or p_codigo !~ '^[0-9a-f]{64}$' then raise exception 'Link inválido.'; end if;
  select * into f from public.fotos_autorizacoes x where x.codigo = p_codigo;
  if f.id is null then raise exception 'Link inválido.'; end if;
  perform public.fotos_autorizacao_frear('retirar:' || p_codigo, 10);
  update public.fotos_autorizacoes x set retirado_em = now(), retirado_motivo = 'tutor'
   where x.petshop_id = f.petshop_id and x.pet_id = f.pet_id and x.retirado_em is null;
  get diagnostics v_n = row_count;
  return jsonb_build_object('retirado_em', coalesce((select x.retirado_em from public.fotos_autorizacoes x where x.id = f.id), now()), 'retiradas', v_n);
end $$;

revoke execute on function public.fotos_autorizacao_frear(text, int), public.foto_autorizacao_texto(text, text, text, text, text, date),
  public.foto_autorizacao_marcar(text), public.foto_autorizacao_do_boletim(uuid, uuid, uuid), public.boletim_autorizacao(text),
  public.boletim_autorizar(text, text, text), public.foto_autorizacao_publica(text), public.foto_autorizacao_retirar(text)
  from public, anon, authenticated;
-- os servidores das páginas públicas só têm a chave pública (anon)
grant execute on function public.boletim_autorizacao(text), public.boletim_autorizar(text, text, text),
  public.foto_autorizacao_publica(text), public.foto_autorizacao_retirar(text) to anon, authenticated;

-- ---------- 2. o "Bom dia" do Mozart ----------
-- Com o login de quem pede; cada parte só sai para quem tem a área. Sem área nenhuma do pet shop: nada.
create function public.gestao_bom_dia(p uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_fuso text; v_hoje date; v_ini timestamptz; v_fim timestamptz;
  a_agenda boolean := public.tenho_area(p, array['agenda']);
  a_casa boolean := public.tenho_area(p, array['creche_hotel']);
  a_cli boolean := public.tenho_area(p, array['clientes']);
  a_din boolean := public.tenho_area(p, array['caixa', 'financeiro', 'relatorios']);
  a_pac boolean := public.tenho_area(p, array['pacotes']);
  v_pets boolean;
  v_vem jsonb;
  r jsonb := '{}'::jsonb;
begin
  if not exists (select 1 from public.profissionais x where x.petshop_id = p and x.user_id = (select auth.uid()) and x.ativo) then return null; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p;
  v_hoje := (now() at time zone v_fuso)::date;
  v_ini := v_hoje::timestamp at time zone v_fuso;
  v_fim := (v_hoje + 1)::timestamp at time zone v_fuso;
  v_pets := a_agenda or a_casa or a_cli;
  r := jsonb_build_object('dia', v_hoje);

  -- os pets que vêm hoje: horário na agenda (área Agenda) e creche ou chegada no hotel (área Creche e hotel)
  select coalesce(jsonb_agg(jsonb_build_object('pet_id', w.pet_id, 'quando', w.quando)), '[]'::jsonb) into v_vem from (
  select v.pet_id, min(v.quando) as quando from (
    select a.pet_id, a.inicio as quando from public.agendamentos a
     where a_agenda and a.petshop_id = p and a.inicio >= v_ini and a.inicio < v_fim and a.status not in ('cancelado', 'faltou')
    union all
    select e.pet_id, e.entrada from public.estadias e
     where a_casa and e.petshop_id = p and e.status in ('reservada', 'em_casa')
       and ((e.tipo = 'creche' and coalesce(e.dia, (e.entrada at time zone v_fuso)::date) = v_hoje)
         or (e.tipo = 'hotel' and (e.entrada at time zone v_fuso)::date = v_hoje))
  ) v group by v.pet_id) w;

  if a_agenda then
    r := r || jsonb_build_object('agenda', coalesce((
      select jsonb_agg(jsonb_build_array(a.inicio, a.fim) order by a.inicio) from public.agendamentos a
       where a.petshop_id = p and a.inicio >= v_ini and a.inicio < v_fim and a.status not in ('cancelado', 'faltou')), '[]'::jsonb));
  end if;

  if a_casa then
    r := r || jsonb_build_object('casa', jsonb_build_object(
      'em_casa', (select count(*) from public.estadias e where e.petshop_id = p and e.status = 'em_casa'),
      'chegam', (select count(*) from public.estadias e where e.petshop_id = p and e.status = 'reservada' and e.entrada >= v_ini and e.entrada < v_fim),
      'saem', (select count(*) from public.estadias e where e.petshop_id = p and e.status = 'em_casa' and e.saida_prevista >= v_ini and e.saida_prevista < v_fim)));
  end if;

  -- quem deve (conta a receber já vencida ou sem vencimento) e vem hoje: só para quem mexe com dinheiro
  if a_din then
    r := r || jsonb_build_object('devem', coalesce((
      select jsonb_agg(x order by x.valor desc, x.tutor) from (
        select c.nome as tutor, sum(l.valor) as valor,
               (select min(v.quando) from jsonb_to_recordset(v_vem) as v(pet_id uuid, quando timestamptz) join public.pets pp on pp.id = v.pet_id where pp.cliente_id = c.id) as quando,
               (select jsonb_agg(pp.nome order by pp.nome) from jsonb_to_recordset(v_vem) as v(pet_id uuid, quando timestamptz) join public.pets pp on pp.id = v.pet_id where pp.cliente_id = c.id) as pets
          from public.lancamentos l join public.clientes c on c.id = l.cliente_id
         where l.petshop_id = p and l.tipo = 'entrada' and not l.pago and (l.vencimento is null or l.vencimento <= v_hoje)
           and exists (select 1 from jsonb_to_recordset(v_vem) as v(pet_id uuid, quando timestamptz) join public.pets pp on pp.id = v.pet_id where pp.cliente_id = c.id)
         group by c.id, c.nome
        having sum(l.valor) > 0
         limit 5) x), '[]'::jsonb));
  end if;

  -- vacinas e cuidados vencidos ou vencendo em 15 dias dos pets que vêm hoje (a dose mais nova de cada um)
  if v_pets then
    r := r || jsonb_build_object('vacinas', coalesce((
      select jsonb_agg(x order by x.vence_em, x.pet) from (
        select pp.nome as pet, pp.sexo, d.nome, d.tipo, d.vence_em from (
          select distinct on (s.pet_id, s.tipo, lower(s.nome)) s.pet_id, s.tipo, s.nome, s.vence_em
            from public.pets_saude s join jsonb_to_recordset(v_vem) as v(pet_id uuid, quando timestamptz) on v.pet_id = s.pet_id
           where s.petshop_id = p
           order by s.pet_id, s.tipo, lower(s.nome), s.vence_em desc nulls first) d
          join public.pets pp on pp.id = d.pet_id
         where d.vence_em is not null and d.vence_em <= v_hoje + 15
         limit 5) x), '[]'::jsonb));
    r := r || jsonb_build_object('niver', coalesce((
      select jsonb_agg(x order by x.pet) from (
        select pp.nome as pet, pp.sexo, exists (select 1 from jsonb_to_recordset(v_vem) as v(pet_id uuid, quando timestamptz) where v.pet_id = pp.id) as vem
          from public.pets pp
         where pp.petshop_id = p and pp.ativo and pp.nascimento is not null
           and extract(month from pp.nascimento) = extract(month from v_hoje) and extract(day from pp.nascimento) = extract(day from v_hoje)
         order by pp.nome limit 5) x), '[]'::jsonb));
  end if;

  -- pacote no último uso: o horário de hoje (ainda não concluído) usa a última sessão do pacote
  if a_pac and a_agenda then
    r := r || jsonb_build_object('pacotes', coalesce((
      select jsonb_agg(x order by x.quando) from (
        select pp.nome as pet, pp.sexo, pc.nome, a.inicio as quando
          from public.agendamentos a join public.pacotes_clientes pc on pc.id = a.pacote_cliente_id join public.pets pp on pp.id = a.pet_id
         where a.petshop_id = p and a.inicio >= v_ini and a.inicio < v_fim and a.status not in ('cancelado', 'faltou', 'concluido')
           and pc.ativo and pc.total - pc.usados <= 1
         order by a.inicio limit 5) x), '[]'::jsonb));
  end if;

  return r;
end $$;

revoke execute on function public.gestao_bom_dia(uuid) from public, anon;
grant execute on function public.gestao_bom_dia(uuid) to authenticated;

notify pgrst, 'reload schema';
