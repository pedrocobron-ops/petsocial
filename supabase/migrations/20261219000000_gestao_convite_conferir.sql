-- Convite da equipe: conferir o link ANTES de criar a conta (testes de 17/11, Juliana M3/M4, Neide e Camila).
-- Só acrescenta objetos; nenhuma função antiga é trocada. O app de hoje continua funcionando igual.
--
-- 1. convites_equipe_antigos: o hash dos códigos que deixaram de valer porque o dono gerou um link novo ("Reenviar") ou porque o
--    convite foi cancelado (e-mail trocado, pessoa desativada, acesso tirado) ou já tinha sido usado. Assim o link velho diz logo o que aconteceu,
--    em vez de parecer um cadastro normal. Sem FK para petshops: o gatilho roda também quando a loja inteira é apagada.
--    Ninguém lê direto; some sozinho depois de 90 dias.
-- 2. convite_conferir(código, e-mail opcional): para a tela de criar a conta e a de entrar, também sem login (anon).
--    Responde só a situação ('valido', 'vencido', 'usado', 'substituido', 'cancelado', 'invalido', 'outro_email', 'muitos')
--    e, quando o código é de verdade, o nome do pet shop. Nunca devolve o e-mail do convite, nem nada da loja além do nome.
--    Limite (convite_consultas): por rede (hash do IP) 30 por hora; com e-mail, 10 por hora por código (ninguém descobre
--    o e-mail do convite tentando vários).

-- ---------- 1. códigos que deixaram de valer ----------
create table if not exists public.convites_equipe_antigos (
  codigo_hash text primary key check (codigo_hash ~ '^[0-9a-f]{64}$'),
  petshop_id uuid not null,
  motivo text not null check (motivo in ('substituido', 'cancelado', 'usado')),
  em timestamptz not null default now()
);
alter table public.convites_equipe_antigos enable row level security;
revoke all on public.convites_equipe_antigos from public, anon, authenticated;

create or replace function public.convites_equipe_guardar_antigo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.codigo_hash is distinct from old.codigo_hash then
      insert into public.convites_equipe_antigos (codigo_hash, petshop_id, motivo)
        values (old.codigo_hash, old.petshop_id, 'substituido')
        on conflict (codigo_hash) do update set motivo = excluded.motivo, em = now();
    end if;
    return new;
  end if;
  -- apagado: convite já usado (a pessoa depois saiu) ou cancelado (e-mail trocado, pessoa desativada)
  insert into public.convites_equipe_antigos (codigo_hash, petshop_id, motivo)
    values (old.codigo_hash, old.petshop_id, case when old.usado_em is not null then 'usado' else 'cancelado' end)
    on conflict (codigo_hash) do update set motivo = excluded.motivo, em = now();
  delete from public.convites_equipe_antigos where em < now() - interval '90 days';
  return old;
end $$;
revoke execute on function public.convites_equipe_guardar_antigo() from public, anon, authenticated;

drop trigger if exists convites_equipe_antigo on public.convites_equipe;
create trigger convites_equipe_antigo after update of codigo_hash or delete on public.convites_equipe
  for each row execute function public.convites_equipe_guardar_antigo();

-- ---------- 2. conferir o link ----------
create table if not exists public.convite_consultas (
  id bigint generated always as identity primary key,
  rede text,                 -- hash do IP (link_rede), nunca o IP
  codigo_hash text not null,
  com_email boolean not null default false,
  em timestamptz not null default now()
);
create index if not exists convite_consultas_rede_em on public.convite_consultas (rede, em) where rede is not null;
create index if not exists convite_consultas_codigo_em on public.convite_consultas (codigo_hash, em);
alter table public.convite_consultas enable row level security;
revoke all on public.convite_consultas from public, anon, authenticated;

create or replace function public.convite_conferir(p_codigo text, p_email text default null) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_codigo text := lower(btrim(coalesce(p_codigo, '')));
  v_hash text;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_rede text := public.link_rede();
  c public.convites_equipe;
  v public.profissionais;
  a public.convites_equipe_antigos;
  v_nome text;
begin
  if v_codigo !~ '^[0-9a-f]{32}$' then return jsonb_build_object('situacao', 'invalido'); end if;
  v_hash := encode(extensions.digest(v_codigo, 'sha256'), 'hex');

  -- limites (antes de olhar qualquer coisa)
  if v_rede is not null and (select count(*) from public.convite_consultas where rede = v_rede and em > now() - interval '1 hour') >= 30 then
    return jsonb_build_object('situacao', 'muitos');
  end if;
  if v_email <> '' and (select count(*) from public.convite_consultas where codigo_hash = v_hash and com_email and em > now() - interval '1 hour') >= 10 then
    return jsonb_build_object('situacao', 'muitos');
  end if;
  insert into public.convite_consultas (rede, codigo_hash, com_email) values (v_rede, v_hash, v_email <> '');
  if random() < 0.02 then delete from public.convite_consultas where em < now() - interval '1 day'; end if;

  select * into c from public.convites_equipe where codigo_hash = v_hash;
  if not found then
    select * into a from public.convites_equipe_antigos where codigo_hash = v_hash;
    if not found then return jsonb_build_object('situacao', 'invalido'); end if;
    select nome into v_nome from public.petshops where id = a.petshop_id;
    if v_nome is null then return jsonb_build_object('situacao', 'invalido'); end if;
    return jsonb_build_object('situacao', a.motivo, 'petshop', v_nome);
  end if;

  select nome into v_nome from public.petshops where id = c.petshop_id;
  if c.usado_em is not null then return jsonb_build_object('situacao', 'usado', 'petshop', v_nome); end if;
  if c.expira_em < now() then return jsonb_build_object('situacao', 'vencido', 'petshop', v_nome); end if;
  select * into v from public.profissionais where id = c.profissional_id;
  if not found or not v.ativo or v.user_id is not null or lower(trim(coalesce(v.email_convite, ''))) <> c.email then
    return jsonb_build_object('situacao', 'cancelado', 'petshop', v_nome);
  end if;
  if v_email <> '' and v_email <> c.email then
    return jsonb_build_object('situacao', 'outro_email', 'petshop', v_nome);
  end if;
  return jsonb_build_object('situacao', 'valido', 'petshop', v_nome);
end $$;
revoke execute on function public.convite_conferir(text, text) from public;
grant execute on function public.convite_conferir(text, text) to anon, authenticated;
