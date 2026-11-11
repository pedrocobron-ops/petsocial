-- Equipe: a função da pessoa em palavras do pet shop (banhista, tosador, recepção…), além do papel de acesso.
alter table public.profissionais add column funcao text check (char_length(funcao) <= 40);
grant update (funcao) on public.profissionais to authenticated;
