-- APLICAR SÓ DEPOIS de publicar o código que acompanha a migração 20261144000000_gestao_acabamentos.sql.
-- O código antigo lê `estadias.valor_diaria`, `estadias.valor_cobrado` e `petshops.opcoes` direto da tabela e para de
-- funcionar com esta migração; o código novo lê pelas funções `estadias_reservado` e `petshop_opcoes`.
--
-- Fecha a leitura direta: quem não tem Caixa, Financeiro nem Relatórios deixa de enxergar pela API
-- a diária e o valor cobrado de cada estadia e as listas de preço guardadas nas opções do pet shop.

-- ---------- estadias: a diária e o valor cobrado saem da leitura direta ----------
-- Coluna nova em `estadias` daqui para a frente precisa de `grant select (coluna)`.
revoke select on public.estadias from anon, authenticated;
grant select (id, petshop_id, pet_id, tipo, entrada, saida_prevista, saida, status, obs, criado_em, diarias_cobradas,
  plano_id, mensalista, dia, cobranca_id, acomodacao, cuidados, avisos, sinal_estado, chave) on public.estadias to authenticated;

-- ---------- opções: só pela função petshop_opcoes (que tira as listas de preço de quem não recebe) ----------
revoke select (opcoes) on public.petshops from authenticated;

-- ---------- quem não recebe não grava valor ----------
-- Mesma função da migração anterior, agora firme: para quem não tem Caixa, Financeiro nem Relatórios,
-- a diária é sempre a sugerida pelo banco (na entrada e na troca de tipo) e não muda em outra edição;
-- na saída, o valor cobrado só pode ficar em zero (pacote ou cortesia) ou em branco ("sem valor lançado", que quem recebe acerta depois).
create or replace function public.estadias_guardar_valores() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or coalesce(current_setting('maestro.creche', true), '') = '1'
     or coalesce(current_setting('maestro.hotel', true), '') = '1' then return new; end if;
  if (select public.tenho_area(new.petshop_id, array['caixa', 'financeiro', 'relatorios'])) then return new; end if;
  if tg_op = 'INSERT' then
    if new.mensalista is null then
      new.valor_diaria := public.diaria_sugerida(new.petshop_id, new.tipo, (select x.porte from public.pets x where x.id = new.pet_id));
    end if;
    new.valor_cobrado := case when new.status = 'encerrada' and new.valor_diaria = 0 then 0 else null end;
    return new;
  end if;
  if new.tipo is distinct from old.tipo and new.mensalista is null then
    new.valor_diaria := public.diaria_sugerida(new.petshop_id, new.tipo, (select x.porte from public.pets x where x.id = new.pet_id));
  else
    new.valor_diaria := old.valor_diaria;
  end if;
  if new.status = 'encerrada' and old.status <> 'encerrada' then
    new.valor_cobrado := case
      when new.mensalista is not null then null
      when new.valor_cobrado = 0 and position('Saiu usando o pacote.' in coalesce(new.obs, '')) > 0 then 0
      when new.valor_diaria = 0 then 0
      else null end;
  else
    new.valor_cobrado := old.valor_cobrado;
  end if;
  return new;
end $$;
revoke execute on function public.estadias_guardar_valores() from public, anon, authenticated;

notify pgrst, 'reload schema';
