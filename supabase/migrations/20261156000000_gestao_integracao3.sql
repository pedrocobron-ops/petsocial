-- Integração da rodada de consertos (aplicar ANTES de publicar o código, depois da 20261155).
-- Só acrescenta. O código que está no ar não usa nada daqui e segue funcionando igual.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. Reserva e check-in novos também levam a chave da operação (toque duplo ou pedido repetido pela internet
--    não marca a mesma reserva duas vezes). Mesma regra de `lancamentos.chave`: única por pet shop; linha sem chave não esbarra em nada.
-- ---------------------------------------------------------------------------------------------------------------------
alter table public.estadias add column if not exists chave text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'estadias_chave_check') then
    alter table public.estadias add constraint estadias_chave_check check (chave is null or char_length(chave) between 8 and 120);
  end if;
end $$;
-- índice inteiro (não parcial), para o "insert ... on conflict do nothing" da API conseguir usá-lo
create unique index if not exists estadias_chave_uniq on public.estadias (petshop_id, chave);
-- a migração 20261149 (depois da publicação) fecha a leitura da tabela por coluna e já traz `chave` na lista dela;
-- este grant vale para o banco que já está com a 49 (o local) e não muda nada em quem ainda lê a tabela inteira
grant select (chave) on public.estadias to authenticated;

notify pgrst, 'reload schema';
