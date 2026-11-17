-- Mozart: cada cartão confirmado ("Pode fazer") grava uma vez só.
--
-- A conversa do Mozart agora volta depois de recarregar a página (o aparelho guarda a conversa e o cartão que espera o
-- "Pode fazer"). Se a página recarrega no meio da gravação, o aplicativo manda a mesma confirmação de novo para terminar a
-- conversa. Dinheiro, estoque, pacotes e estadias já tinham a chave da operação; marcar horário, bloquear a agenda, cadastrar
-- pet e as outras ações não. Esta tabela guarda o id de cada ação do Mozart (o id do pedido da ferramenta, único na conversa)
-- antes de gravar: a mesma ação de novo é recusada e o Mozart diz que já estava feita.
--
-- Sem regra de acesso direto: só as duas funções abaixo mexem nela, e só para quem é da equipe do pet shop.
-- Aditiva: nada do que já existe muda.

create table if not exists public.assistente_acoes (
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  uso_id text not null check (char_length(uso_id) between 4 and 200),
  user_id uuid references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  primary key (petshop_id, uso_id)
);
alter table public.assistente_acoes enable row level security;
revoke all on public.assistente_acoes from public, anon, authenticated;

-- Marca a ação como "gravando". true: é a primeira vez (pode gravar); false: essa ação já foi gravada (ou está gravando agora).
create or replace function public.assistente_acao_reservar(p_petshop uuid, p_uso text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  if p_petshop is null or p_petshop not in (select public.meus_petshops()) then raise exception 'Sem acesso a este pet shop.'; end if;
  if p_uso is null or char_length(p_uso) not between 4 and 200 then raise exception 'Ação inválida.'; end if;
  -- depois de 30 dias a conversa já não volta: o registro antigo deste pet shop sai aqui mesmo
  delete from public.assistente_acoes where petshop_id = p_petshop and criado_em < now() - interval '30 days';
  insert into public.assistente_acoes (petshop_id, uso_id, user_id) values (p_petshop, p_uso, (select auth.uid()))
    on conflict (petshop_id, uso_id) do nothing;
  get diagnostics v_n = row_count;
  return v_n = 1;
end $$;
revoke execute on function public.assistente_acao_reservar(uuid, text) from public, anon;
grant execute on function public.assistente_acao_reservar(uuid, text) to authenticated;

-- A gravação falhou: solta a ação para a pessoa poder tentar de novo.
create or replace function public.assistente_acao_liberar(p_petshop uuid, p_uso text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_petshop is null or p_petshop not in (select public.meus_petshops()) then raise exception 'Sem acesso a este pet shop.'; end if;
  delete from public.assistente_acoes where petshop_id = p_petshop and uso_id = p_uso;
end $$;
revoke execute on function public.assistente_acao_liberar(uuid, text) from public, anon;
grant execute on function public.assistente_acao_liberar(uuid, text) to authenticated;
