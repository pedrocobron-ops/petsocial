-- Serviço da loja: o dono escolhe a área de cada serviço (Banho e tosa, Creche, Hotel ou Loja) no guia e em Meu pet shop.
-- Banho e tosa continua gravando banho, tosa, banho_tosa ou outro; creche e hotel, creche e hotel. A loja ganha a sua categoria.
-- Só alarga a regra: tudo o que já estava gravado continua valendo e o aplicativo de antes nunca manda 'loja'.
-- O aplicativo novo também funciona antes desta migração: sem ela, o serviço da loja é gravado como 'outro'.
alter table public.servicos drop constraint if exists servicos_categoria_check;
alter table public.servicos add constraint servicos_categoria_check
  check (categoria in ('banho', 'tosa', 'banho_tosa', 'creche', 'hotel', 'outro', 'loja'));
