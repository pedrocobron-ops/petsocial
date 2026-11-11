-- Tirar o login de alguém que já criou a conta: a pessoa continua na equipe (e na agenda), mas não entra mais.
-- Só dono, e nunca do titular nem de si mesmo. Quem perde o login deixa de ser sócio.
create function public.tirar_acesso(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v public.profissionais;
  v_titular uuid;
begin
  select * into v from public.profissionais where id = p_id;
  if not found or not public.sou_dono(v.petshop_id) then raise exception 'Pessoa não encontrada.'; end if;
  if not public.acesso_liberado(v.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  select id into v_titular from public.profissionais where petshop_id = v.petshop_id and papel = 'dono' order by criado_em, id limit 1;
  if v.id = v_titular then raise exception 'O titular da conta não pode ficar sem acesso.'; end if;
  if v.user_id = (select auth.uid()) then raise exception 'Você não pode tirar o seu próprio acesso.'; end if;
  update public.profissionais
    set user_id = null, email_convite = null, acessos = null, ve_financeiro = false,
        papel = case when papel = 'dono' then 'funcionario'::public.papel_equipe else papel end
    where id = p_id;
end $$;
revoke execute on function public.tirar_acesso(uuid) from public, anon, authenticated;
grant execute on function public.tirar_acesso(uuid) to authenticated;
