-- Integração da terceira rodada. Tudo aqui é acréscimo (funções novas): o aplicativo que está no ar não usa nada disto.
-- Aplicar ANTES de publicar o código novo, junto com as migrações 20261144 a 20261150 (menos a 20261149, que vem depois).

-- ---------- check-outs para cobrar, sem filtrar pela coluna reservada ----------
-- Depois da migração 20261149 ninguém filtra `estadias` por `valor_cobrado` pela API (a coluna deixa de ser lida direto).
-- Esta função entrega, só para quem recebe (Caixa, Financeiro, Relatórios ou o dono), as estadias encerradas que saíram
-- sem valor lançado: é a lista "Check-outs para cobrar" e o aviso da tela Hoje.
create function public.estadias_para_cobrar(p uuid) returns table (id uuid, saida timestamptz)
language sql stable security definer set search_path = '' as $$
  select e.id, e.saida
  from public.estadias e
  where e.petshop_id = p and e.status = 'encerrada' and e.valor_cobrado is null and e.diarias_cobradas is not null
    and e.mensalista is null and position('Saiu usando o pacote.' in coalesce(e.obs, '')) = 0
    and (select public.tenho_area(p, array['caixa', 'financeiro', 'relatorios']))
$$;
revoke execute on function public.estadias_para_cobrar(uuid) from public, anon;
grant execute on function public.estadias_para_cobrar(uuid) to authenticated;

-- Acerta um check-out que ficou para cobrar: grava as diárias e o valor cobrado só se a estadia ainda está sem valor
-- (duas pessoas recebendo a mesma estadia ao mesmo tempo: só a primeira grava). Mesma permissão de editar a estadia
-- pela tabela (área Creche e hotel, conta liberada), e só quem recebe.
create function public.estadia_acertar(p_id uuid, p_diarias integer, p_valor numeric, p_obs text default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_petshop uuid;
begin
  select e.petshop_id into v_petshop from public.estadias e where e.id = p_id;
  if v_petshop is null
     or not (select public.tenho_area(v_petshop, array['creche_hotel']))
     or not (select public.tenho_area(v_petshop, array['caixa', 'financeiro', 'relatorios']))
     or not (select public.acesso_liberado(v_petshop)) then
    raise exception 'Só quem cuida do caixa acerta esse check-out.';
  end if;
  if p_diarias is null or p_diarias < 1 or p_valor is null or p_valor < 0 then raise exception 'Confira as diárias e o valor.'; end if;
  update public.estadias e set diarias_cobradas = p_diarias, valor_cobrado = round(p_valor, 2), obs = coalesce(p_obs, e.obs)
    where e.id = p_id and e.status = 'encerrada' and e.valor_cobrado is null and e.mensalista is null;
  return found;
end $$;
revoke execute on function public.estadia_acertar(uuid, integer, numeric, text) from public, anon;
grant execute on function public.estadia_acertar(uuid, integer, numeric, text) to authenticated;

notify pgrst, 'reload schema';
