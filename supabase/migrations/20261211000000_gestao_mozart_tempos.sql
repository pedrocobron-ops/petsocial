-- Tempo do Mozart: quanto cada pedido levou (total, até a primeira palavra aparecer), quantas voltas ao modelo e os tokens.
-- Só números: nada do que a pessoa pediu nem do que o Mozart respondeu. Serve para o painel do administrador mostrar a
-- mediana e o p90 dos últimos 7 dias. Guarda 90 dias (o próprio registro apaga o que passou disso).
-- Aditiva: tabela nova e duas funções novas. O código de hoje não muda.

create table if not exists public.mozart_tempos (
  id bigint generated always as identity primary key,
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  em timestamptz not null default now(),
  -- 'stream' (a resposta chega aos poucos) ou 'json' (de uma vez)
  modo text not null check (modo in ('stream', 'json')),
  -- como terminou: ok, cartao (parou para a pessoa confirmar), recusa, limite, erro, demorou
  fim text not null check (fim in ('ok', 'cartao', 'recusa', 'limite', 'erro', 'demorou')),
  total_ms integer not null check (total_ms >= 0),
  -- até a primeira palavra do Mozart (null: a resposta não teve texto, só cartão)
  primeiro_ms integer check (primeiro_ms >= 0),
  -- até o primeiro sinal na tela (palavra ou "Procurando o Thor…")
  sinal_ms integer check (sinal_ms >= 0),
  voltas smallint not null default 0 check (voltas >= 0),
  ferramentas smallint not null default 0 check (ferramentas >= 0),
  tokens_entrada integer not null default 0 check (tokens_entrada >= 0),
  tokens_saida integer not null default 0 check (tokens_saida >= 0),
  tokens_cache_lidos integer not null default 0 check (tokens_cache_lidos >= 0),
  tokens_cache_gravados integer not null default 0 check (tokens_cache_gravados >= 0)
);
create index if not exists mozart_tempos_em_idx on public.mozart_tempos (em);
-- sem regra de acesso: só as funções abaixo gravam e leem
alter table public.mozart_tempos enable row level security;
revoke all on public.mozart_tempos from public, anon, authenticated;

-- Grava um pedido (a rota do Mozart chama com o login de quem pediu; só para um pet shop da pessoa).
create or replace function public.mozart_tempo_registrar(
  p_petshop uuid, p_modo text, p_fim text, p_total_ms integer, p_primeiro_ms integer, p_sinal_ms integer,
  p_voltas integer, p_ferramentas integer, p_entrada integer, p_saida integer, p_cache_lidos integer, p_cache_gravados integer
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or p_petshop is null or p_petshop not in (select public.meus_petshops()) then return; end if;
  if p_modo not in ('stream', 'json') or p_fim not in ('ok', 'cartao', 'recusa', 'limite', 'erro', 'demorou') then return; end if;
  insert into public.mozart_tempos (petshop_id, modo, fim, total_ms, primeiro_ms, sinal_ms, voltas, ferramentas,
      tokens_entrada, tokens_saida, tokens_cache_lidos, tokens_cache_gravados)
    values (p_petshop, p_modo, p_fim, least(greatest(coalesce(p_total_ms, 0), 0), 600000),
      least(greatest(p_primeiro_ms, 0), 600000), least(greatest(p_sinal_ms, 0), 600000),
      least(greatest(coalesce(p_voltas, 0), 0), 100), least(greatest(coalesce(p_ferramentas, 0), 0), 1000),
      greatest(coalesce(p_entrada, 0), 0), greatest(coalesce(p_saida, 0), 0),
      greatest(coalesce(p_cache_lidos, 0), 0), greatest(coalesce(p_cache_gravados, 0), 0));
  delete from public.mozart_tempos where em < now() - interval '90 days';
end $$;
revoke execute on function public.mozart_tempo_registrar(uuid, text, text, integer, integer, integer, integer, integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.mozart_tempo_registrar(uuid, text, text, integer, integer, integer, integer, integer, integer, integer, integer, integer) to authenticated;

-- Painel do administrador: mediana e p90 dos últimos 7 dias (pedidos que terminaram em resposta ou cartão).
create or replace function public.admin_mozart_tempos() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito.'; end if;
  return (
    select jsonb_build_object(
      'pedidos', count(*),
      'mediana_ms', percentile_cont(0.5) within group (order by total_ms),
      'p90_ms', percentile_cont(0.9) within group (order by total_ms),
      'primeiro_mediana_ms', percentile_cont(0.5) within group (order by coalesce(primeiro_ms, sinal_ms)),
      'primeiro_p90_ms', percentile_cont(0.9) within group (order by coalesce(primeiro_ms, sinal_ms)),
      'voltas_media', round(avg(voltas)::numeric, 2),
      'tokens_entrada_media', round(avg(tokens_entrada)),
      'tokens_saida_media', round(avg(tokens_saida)),
      'tokens_cache_lidos_media', round(avg(tokens_cache_lidos)))
    from public.mozart_tempos
    where em > now() - interval '7 days' and fim in ('ok', 'cartao', 'demorou'));
end $$;
revoke execute on function public.admin_mozart_tempos() from public, anon;
grant execute on function public.admin_mozart_tempos() to authenticated;
