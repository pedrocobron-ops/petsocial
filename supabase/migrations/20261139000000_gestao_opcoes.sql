-- Opções do negócio: cada pet shop liga só o que usa (código de barras, fornecedores, margem, sinal na reserva, taxas…).
-- Fica tudo num campo só, por chave ("loja.codigo_barras", "hotel.sinal"…). Vazio = tudo no padrão.
alter table public.petshops
  add column opcoes jsonb not null default '{}'::jsonb check (jsonb_typeof(opcoes) = 'object');
-- A equipe lê (as telas precisam saber o que está ligado); só o dono altera (a regra petshops_editar já confere o dono).
grant select (opcoes) on public.petshops to authenticated;
grant update (opcoes) on public.petshops to authenticated;
