-- ============================================================================
-- AUDIT FIXES v28 — aplicado via Chrome MCP em 2026-06-06
-- ============================================================================
-- 1) CRÍTICO LGPD: delete_my_account() referenciava memorial_messages.user_id,
--    coluna que NÃO existe (a real é author_user_id) → a função inteira dava
--    undefined_column e fazia rollback → exclusão de conta 100% quebrada.
-- 2) Anti-abuso: trava o range de game_scores.score (0..100000) pra impedir
--    injeção de score absurdo no ranking público (max legítimo < 10k).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) delete_my_account corrigido
-- ----------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns json
language plpgsql
security definer
set search_path = public
as $func$
declare
  uid uuid;
  pets_count int;
  posts_count int;
  reports_count int;
  reviews_count int;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'Não autenticado';
  end if;

  select count(*) into pets_count from public.pets where owner_id = uid;
  select count(*) into posts_count from public.posts p
    join public.pets pe on pe.id = p.pet_id
    where pe.owner_id = uid;
  select count(*) into reports_count from public.lost_reports where reporter_user_id = uid;
  select count(*) into reviews_count from public.place_reviews where user_id = uid;

  delete from public.posts
    where pet_id in (select id from public.pets where owner_id = uid);

  delete from public.lost_reports where reporter_user_id = uid;
  delete from public.place_reviews where user_id = uid;
  -- FIX: era user_id (inexistente) → author_user_id
  delete from public.memorial_messages where author_user_id = uid;

  delete from public.messages where sender_id = uid;
  delete from public.conversation_participants where user_id = uid;

  delete from public.reports where reporter_user_id = uid;
  delete from public.blocked_users where blocker_id = uid or blocked_id = uid;

  delete from public.ai_conversations where user_id = uid;
  delete from public.subscriptions where user_id = uid;
  delete from public.notifications where user_id = uid;
  delete from public.saved_posts where user_id = uid;

  begin
    delete from public.pet_caretakers where invited_by = uid or user_id = uid;
  exception when undefined_table then
    null;
  end;

  delete from public.pets where owner_id = uid;
  delete from public.profiles where id = uid;

  return json_build_object(
    'success', true,
    'pets_deleted', pets_count,
    'posts_deleted', posts_count,
    'lost_reports_deleted', reports_count,
    'place_reviews_deleted', reviews_count,
    'note', 'Conta de auth permanece até processamento admin (geralmente 30 dias)'
  );
end;
$func$;

revoke all on function public.delete_my_account from public, anon;
grant execute on function public.delete_my_account to authenticated;

-- ----------------------------------------------------------------------------
-- 2) game_scores: range anti-abuso (idempotente)
-- ----------------------------------------------------------------------------
alter table public.game_scores drop constraint if exists game_scores_score_range;
alter table public.game_scores add constraint game_scores_score_range
  check (score >= 0 and score <= 100000);

notify pgrst, 'reload schema';
