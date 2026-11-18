-- Rodada 8 (agente L): defeitos e robustez depois dos três testadores exigentes.
--   1. Nome sem marcação (HTML): o banco limpa o nome de pet shop, equipe, tutor, pet, serviço e produto com a mesma regra
--      da tela (`limparNome`, src/lib/gestao/validacao.ts). "Loja <b>V3</b>" vira "Loja V3" no cabeçalho, no comprovante e
--      no WhatsApp. Os nomes que já estão gravados com marcação são limpos uma vez.
--   2. Estadia com a saída prevista a mais de 366 dias da entrada é recusada (data velha no formulário, ano trocado). A tela
--      é mais exigente (creche 31 dias, hotel 180).
--   3. fechar_caixa: quando outra aba (ou aparelho) já fechou, a resposta diz quando e quanto foi contado, para a tela avisar.
-- Tudo aditivo: funções novas, gatilhos novos e fechar_caixa com a mesma assinatura (cópia da 20261136, a única que a define).

-- ---------- 1. nomes sem marcação ----------

create or replace function public.limpar_nome(p text) returns text
language sql immutable set search_path = '' as $$
  select btrim(regexp_replace(translate(regexp_replace(coalesce(p, ''), '</?[A-Za-z!?][^<>]*>', '', 'g'), '<>', ''), '\s+', ' ', 'g'))
$$;
grant execute on function public.limpar_nome(text) to authenticated, anon;

create or replace function public.nome_sem_marcacao() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.nome is not null and (tg_op = 'INSERT' or new.nome is distinct from old.nome) and new.nome ~ '[<>]' then
    new.nome := public.limpar_nome(new.nome);
    if new.nome = '' then raise exception 'Escreva o nome com letras (sem os sinais < e >).'; end if;
  end if;
  return new;
end $$;

drop trigger if exists a_nome_sem_marcacao on public.petshops;
create trigger a_nome_sem_marcacao before insert or update of nome on public.petshops for each row execute function public.nome_sem_marcacao();
drop trigger if exists a_nome_sem_marcacao on public.profissionais;
create trigger a_nome_sem_marcacao before insert or update of nome on public.profissionais for each row execute function public.nome_sem_marcacao();
drop trigger if exists a_nome_sem_marcacao on public.clientes;
create trigger a_nome_sem_marcacao before insert or update of nome on public.clientes for each row execute function public.nome_sem_marcacao();
drop trigger if exists a_nome_sem_marcacao on public.pets;
create trigger a_nome_sem_marcacao before insert or update of nome on public.pets for each row execute function public.nome_sem_marcacao();
drop trigger if exists a_nome_sem_marcacao on public.servicos;
create trigger a_nome_sem_marcacao before insert or update of nome on public.servicos for each row execute function public.nome_sem_marcacao();
drop trigger if exists a_nome_sem_marcacao on public.produtos;
create trigger a_nome_sem_marcacao before insert or update of nome on public.produtos for each row execute function public.nome_sem_marcacao();

-- os que já estão gravados com marcação (só os que sobram com nome de verdade depois da limpeza)
update public.petshops set nome = public.limpar_nome(nome) where nome ~ '</?[A-Za-z!?][^<>]*>' and public.limpar_nome(nome) <> '' and char_length(public.limpar_nome(nome)) >= 2;
update public.profissionais set nome = public.limpar_nome(nome) where nome ~ '</?[A-Za-z!?][^<>]*>' and public.limpar_nome(nome) <> '';
update public.clientes set nome = public.limpar_nome(nome) where nome ~ '</?[A-Za-z!?][^<>]*>' and public.limpar_nome(nome) <> '';
update public.pets set nome = public.limpar_nome(nome) where nome ~ '</?[A-Za-z!?][^<>]*>' and public.limpar_nome(nome) <> '';
update public.servicos set nome = public.limpar_nome(nome) where nome ~ '</?[A-Za-z!?][^<>]*>' and public.limpar_nome(nome) <> '';
update public.produtos set nome = public.limpar_nome(nome) where nome ~ '</?[A-Za-z!?][^<>]*>' and public.limpar_nome(nome) <> '';

-- ---------- 2. saída prevista longe demais ----------

create or replace function public.estadia_saida_razoavel() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.saida_prevista is null or new.entrada is null then return new; end if;
  -- só confere quando as datas mudam: uma estadia antiga com outra mudança (obs, status) passa como está
  if tg_op = 'UPDATE' and new.saida_prevista is not distinct from old.saida_prevista and new.entrada is not distinct from old.entrada then
    return new;
  end if;
  if new.saida_prevista > new.entrada + interval '366 days' then
    raise exception 'A saída prevista ficou a mais de um ano da entrada (%). Confira o dia e o ano.',
      to_char(new.saida_prevista at time zone 'America/Sao_Paulo', 'DD/MM/YYYY');
  end if;
  return new;
end $$;

drop trigger if exists a_saida_razoavel on public.estadias;
create trigger a_saida_razoavel before insert or update of entrada, saida_prevista on public.estadias
  for each row execute function public.estadia_saida_razoavel();

-- ---------- 3. fechar o caixa: outra aba já fechou ----------

create or replace function public.fechar_caixa(p_caixa uuid, p_contado numeric, p_obs text default null, p_esperado numeric default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.caixas;
  v_esperado numeric;
begin
  select * into c from public.caixas x where x.id = p_caixa for update;
  if not found or not public.tenho_area(c.petshop_id, array['caixa', 'financeiro', 'relatorios']) then
    raise exception 'Caixa não encontrado.';
  end if;
  if not public.acesso_liberado(c.petshop_id) then raise exception 'Sua conta está só para consulta.'; end if;
  if p_contado is null or p_contado < 0 or p_contado >= 100000000 then
    raise exception 'Conte o dinheiro da gaveta e escreva o valor.';
  end if;
  -- outra aba (ou outro aparelho) fechou primeiro: vale o primeiro fechamento; a tela avisa quando e quanto foi contado
  if c.fechado_em is not null then
    return jsonb_build_object('fechado', false, 'motivo', 'ja_fechado', 'fechado_em', c.fechado_em, 'contado', c.valor_contado);
  end if;
  v_esperado := public.caixa_esperado(p_caixa);
  if p_esperado is not null and round(p_esperado, 2) <> v_esperado then
    return jsonb_build_object('fechado', false, 'motivo', 'mudou', 'esperado', v_esperado);
  end if;
  update public.caixas set fechado_em = clock_timestamp(), valor_contado = round(p_contado, 2), obs = nullif(trim(left(coalesce(p_obs, ''), 500)), '')
    where id = p_caixa;
  return jsonb_build_object('fechado', true, 'esperado', v_esperado);
end $$;
revoke execute on function public.fechar_caixa(uuid, numeric, text, numeric) from public, anon;
grant execute on function public.fechar_caixa(uuid, numeric, text, numeric) to authenticated;
