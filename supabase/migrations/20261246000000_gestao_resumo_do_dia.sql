-- Resumo do dia: a folha que abre na primeira entrada do dia de cada pessoa (a partir das 05:00 no fuso do pet shop).
--
-- Substitui o cartão "Bom dia" da tela Hoje. Tudo o que a folha mostra vem de UMA leitura (`gestao_resumo_do_dia`), que
-- confere quem está pedindo e só devolve o que a pessoa pode ver (as mesmas áreas do `gestao_bom_dia`, que continua existindo
-- e é chamado daqui para as linhas de "vale lembrar": vacina, pacote, aniversário, validade). Os números são contados aqui,
-- no banco; a inteligência artificial só escreve a frase do alto e a redação da dica, uma vez por dia por pessoa.
--
-- 1. resumo_dia_em: o dia do resumo (antes das 05:00 ainda é o dia anterior).
-- 2. Tabelas: resumo_do_dia (por pet shop, pessoa e dia: viu?, a dica escolhida, o texto da IA) e resumo_dica_votos
--    ("Útil" / "Não quero esse tipo", por tipo de dica). RLS: cada um lê só as próprias linhas; só as funções gravam.
-- 3. gestao_resumo_do_dia(p): os números, a linha do tempo, a semana, o dinheiro, os achados e a dica escolhida.
-- 4. gestao_resumo_visto(p): marca que a pessoa já viu hoje (vale no celular e no computador).
-- 5. gestao_resumo_votar(p, tipo, voto): o retorno da dica.
-- 6. gestao_resumo_ia_reservar / gestao_resumo_ia_guardar: o texto da IA é gerado no máximo uma vez por dia por pessoa e
--    pet shop (a rota /api/gestao/resumo-do-dia reserva, conta na cota do Mozart com assistente_contar_v2 e guarda).
--
-- Achados (fatos do próprio pet shop que viram a "dica do dia") e a evidência mínima de cada um:
--   cadastro        conta sem nenhum horário nem estadia, só para o dono: o que falta no cadastro (preços, diária, primeiro
--                   pet, link do cliente). Um achado por item que falta.
--   sem_confirmar   horários de hoje e de amanhã que ainda vão acontecer e estão só "marcados": 3 ou mais E 30% ou mais dos
--                   horários desse período.
--   retorno         clientes recorrentes que passaram do intervalo habitual: pet com 3 ou mais atendimentos concluídos em 12
--                   meses, mediana entre as visitas de 7 a 90 dias, última visita há mais de max(mediana × 1,3; mediana + 5)
--                   dias e há no máximo 180 dias, sem horário futuro nem estadia (reservada ou na casa), tutor com telefone e que aceita
--                   mensagens. Vira achado
--                   com 3 clientes ou mais (o botão "Chamar quem está no prazo" aparece com 1 ou mais).
--   periodo_vazio   um período (manhã, até 12:00; tarde, depois das 12:00) de um dia da semana, aberto no horário do pet
--                   shop, sem nenhum horário nas últimas 4 semanas (nenhuma delas com o dia fechado), num pet shop que já
--                   usa a agenda: 8 ou mais horários nessas 4 semanas e o primeiro horário há 28 dias ou mais.
--   devendo_antigo  clientes com conta em aberto vencida (ou lançada, sem vencimento) há mais de 30 dias: 1 ou mais. Só para
--                   quem tem área de dinheiro.
--   estoque_baixo   produtos ativos com estoque mínimo definido e saldo no mínimo ou abaixo: 1 ou mais. Só com a área Estoque.
-- "Atendimento que costuma passar do tempo marcado" NÃO entra: o banco não guarda a hora real de início e de fim do
-- atendimento (o quadro guarda só a etapa atual), então não há dado confiável para esse achado.
--
-- Escolha da dica (regra fixa, sem IA): prioridade do tipo + 10 por "Útil" dos últimos 90 dias (até 3) − 5 por dia em que
-- o tipo apareceu nos últimos 7 dias; "Não quero esse tipo" silencia o tipo por 90 dias (um "Útil" depois desfaz); o mesmo
-- achado (tipo e chave) não aparece em dois dias seguidos. A escolha do dia fica guardada e não muda ao rever.

-- ---------------------------------------------------------------------------------------------------------------------
-- 1. O dia do resumo
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.resumo_dia_em(p_quando timestamptz, p_fuso text) returns date
language sql stable set search_path = '' as $$
  select ((p_quando at time zone coalesce(nullif(p_fuso, ''), 'America/Sao_Paulo')) - interval '5 hours')::date
$$;
revoke execute on function public.resumo_dia_em(timestamptz, text) from public, anon;
grant execute on function public.resumo_dia_em(timestamptz, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------------------------------------------------
-- 2. Tabelas
-- ---------------------------------------------------------------------------------------------------------------------
create table if not exists public.resumo_do_dia (
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  dia date not null,
  visto_em timestamptz,
  dica_tipo text check (char_length(dica_tipo) <= 40),
  dica_chave text check (char_length(dica_chave) <= 80),
  dica jsonb,
  ia_estado text check (ia_estado in ('reservado', 'feito', 'falhou')),
  ia_em timestamptz,
  ia_frase text check (char_length(ia_frase) <= 200),
  ia_dica text check (char_length(ia_dica) <= 400),
  criado_em timestamptz not null default now(),
  primary key (petshop_id, user_id, dia)
);
alter table public.resumo_do_dia enable row level security;
revoke all on public.resumo_do_dia from public, anon, authenticated;
grant select on public.resumo_do_dia to authenticated;
drop policy if exists resumo_do_dia_ler on public.resumo_do_dia;
create policy resumo_do_dia_ler on public.resumo_do_dia for select to authenticated
  using (user_id = (select auth.uid()) and petshop_id in (select public.meus_petshops()));
comment on table public.resumo_do_dia is
  'Resumo do dia por pet shop, pessoa e dia (o dia começa às 05:00): se já viu, a dica escolhida e o texto da IA. Só as funções gestao_resumo_* gravam.';

create table if not exists public.resumo_dica_votos (
  petshop_id uuid not null references public.petshops (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  tipo text not null check (char_length(tipo) <= 40),
  dia date not null,
  voto text not null check (voto in ('util', 'nao_quero')),
  criado_em timestamptz not null default now(),
  primary key (petshop_id, user_id, tipo, dia)
);
alter table public.resumo_dica_votos enable row level security;
revoke all on public.resumo_dica_votos from public, anon, authenticated;
grant select on public.resumo_dica_votos to authenticated;
drop policy if exists resumo_dica_votos_ler on public.resumo_dica_votos;
create policy resumo_dica_votos_ler on public.resumo_dica_votos for select to authenticated
  using (user_id = (select auth.uid()) and petshop_id in (select public.meus_petshops()));
comment on table public.resumo_dica_votos is
  'Retorno da dica do dia: "Útil" ou "Não quero esse tipo", por pet shop, pessoa e tipo de dica. Só gestao_resumo_votar grava.';

-- ---------------------------------------------------------------------------------------------------------------------
-- 3. A leitura
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.gestao_resumo_do_dia(p uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_eu public.profissionais;
  v_loja public.petshops;
  v_fuso text; v_hoje date; v_dia date; v_ini timestamptz; v_fim timestamptz; v_dow int; v_agora timestamptz := now();
  v_mod text[]; v_todos boolean; usa_banho boolean; usa_creche boolean; usa_hotel boolean; usa_loja boolean;
  a_agenda boolean; a_casa boolean; a_cli boolean; a_din boolean; a_fin boolean; a_est boolean;
  v_so_meus boolean; v_dono boolean;
  v_hor jsonb; v_abre text; v_fecha text; v_fechado boolean;
  v_itens jsonb; v_total int := 0; v_sem int := 0;
  v_chamar uuid[] := '{}';
  v_achados jsonb := '[]'::jsonb;
  v_conta_nova boolean; v_falta jsonb := '[]'::jsonb;
  v_n int; v_n2 int; v_valor numeric; v_casa numeric := 0; v_receber numeric := 0; v_sinais uuid[] := '{}'; v_txt text; v_j jsonb;
  v_linha public.resumo_do_dia;
  v_dica jsonb;
  r jsonb;
begin
  if v_uid is null then return null; end if;
  select x.* into v_eu from public.profissionais x where x.petshop_id = p and x.user_id = v_uid and x.ativo limit 1;
  if not found then return null; end if;
  select s.* into v_loja from public.petshops s where s.id = p;
  if not found then return null; end if;

  v_fuso := coalesce(nullif(v_loja.fuso, ''), 'America/Sao_Paulo');
  v_hoje := (v_agora at time zone v_fuso)::date;
  v_dia := public.resumo_dia_em(v_agora, v_fuso);
  v_ini := v_hoje::timestamp at time zone v_fuso;
  v_fim := (v_hoje + 1)::timestamp at time zone v_fuso;
  v_dow := extract(dow from v_hoje)::int;
  v_hor := v_loja.horario;
  v_dono := v_eu.papel = 'dono';

  -- o que o negócio faz (petshops.modulos vazio ou sem nenhum módulo conhecido = usa tudo, como no aplicativo)
  v_mod := v_loja.modulos;
  v_todos := v_mod is null or not (v_mod && array['banho_tosa', 'creche', 'hotel', 'loja', 'pacotes']);
  usa_banho := v_todos or 'banho_tosa' = any (v_mod);
  usa_creche := v_todos or 'creche' = any (v_mod);
  usa_hotel := v_todos or 'hotel' = any (v_mod);
  usa_loja := v_todos or 'loja' = any (v_mod);

  -- o que a pessoa pode ver (as mesmas áreas do gestao_bom_dia)
  a_agenda := usa_banho and public.tenho_area(p, array['agenda']);
  a_casa := (usa_creche or usa_hotel) and public.tenho_area(p, array['creche_hotel']);
  a_cli := public.tenho_area(p, array['clientes']);
  a_din := public.tenho_area(p, array['caixa', 'financeiro', 'relatorios']);
  a_fin := public.cuido_do_financeiro(p) and public.vejo_financeiro(p);
  a_est := usa_loja and public.tenho_area(p, array['estoque']);
  -- quem atende e não mexe com dinheiro (tosador, banhista) vê só a própria agenda: os horários dela e os sem profissional
  -- (a mesma regra do "Meu dia" da tela Hoje e do começo da Agenda)
  v_so_meus := a_agenda and v_eu.atende and not v_dono and not a_din;

  r := jsonb_build_object(
    'dia', v_dia, 'hoje', v_hoje, 'agora', to_char(v_agora at time zone v_fuso, 'HH24:MI'), 'dow', v_dow,
    'nome', split_part(btrim(v_eu.nome), ' ', 1), 'so_meus', v_so_meus,
    'areas', jsonb_build_object('agenda', a_agenda, 'casa', a_casa, 'clientes', a_cli, 'dinheiro', a_din, 'financeiro', a_fin, 'estoque', a_est));

  -- ---------- hoje: a agenda ----------
  if a_agenda then
    v_fechado := exists (select 1 from public.dias_especiais e where e.petshop_id = p and e.dia = v_hoje and e.fechado);
    -- a janela do dia: do primeiro que abre ao último que fecha (o pet shop e os serviços com horário próprio); o almoço é o do pet shop
    select min(h.v ->> 'abre'), max(h.v ->> 'fecha') into v_abre, v_fecha from (
      select v_hor -> v_dow::text as v
      union all
      select s.horario -> v_dow::text from public.servicos s
       where s.petshop_id = p and s.ativo and s.categoria not in ('creche', 'hotel') and s.horario is not null
    ) h where jsonb_typeof(h.v) = 'object';
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', a.id, 'ini', to_char(a.inicio at time zone v_fuso, 'HH24:MI'),
             'fim', case when a.fim >= v_fim then '23:59' else to_char(a.fim at time zone v_fuso, 'HH24:MI') end,
             'pet', pt.nome, 'sexo', pt.sexo, 'status', a.status,
             'servico', nullif(concat_ws(' + ', s.nome, (select string_agg(s2.nome, ' + ' order by x.ordem, s2.nome) from public.agendamento_servicos x
                                 join public.servicos s2 on s2.id = x.servico_id where x.agendamento_id = a.id and x.servico_id is distinct from a.servico_id)), '')
           ) order by a.inicio, pt.nome), '[]'::jsonb),
           count(*), count(*) filter (where a.status = 'marcado')
      into v_itens, v_total, v_sem
      from public.agendamentos a join public.pets pt on pt.id = a.pet_id left join public.servicos s on s.id = a.servico_id
     where a.petshop_id = p and a.inicio >= v_ini and a.inicio < v_fim and a.status not in ('cancelado', 'faltou')
       and (not v_so_meus or a.profissional_id = v_eu.id or a.profissional_id is null);
    r := r || jsonb_build_object('agenda', jsonb_build_object(
      'total', v_total, 'sem_confirmar', v_sem, 'itens', v_itens,
      'janela', case when v_fechado or v_abre is null then null else jsonb_build_object('abre', v_abre, 'fecha', v_fecha,
                  'almoco', case when jsonb_typeof(v_hor -> v_dow::text -> 'almoco') = 'object' then v_hor -> v_dow::text -> 'almoco' end) end,
      'bloqueios', coalesce((
        select jsonb_agg(jsonb_build_array(
                 to_char(greatest(b.inicio, v_ini) at time zone v_fuso, 'HH24:MI'),
                 case when b.fim >= v_fim then '23:59' else to_char(b.fim at time zone v_fuso, 'HH24:MI') end) order by b.inicio)
          from public.bloqueios b
         where b.petshop_id = p and b.inicio < v_fim and b.fim > v_ini
           and (b.profissional_id is null or (v_so_meus and b.profissional_id = v_eu.id))), '[]'::jsonb)));

    -- a semana: hoje e os 6 dias seguintes, com a contagem de horários e se o dia abre
    r := r || jsonb_build_object('semana', (
      select jsonb_agg(jsonb_build_object('dia', d.dia, 'dow', d.dow, 'n', d.n, 'aberto', d.aberto) order by d.dia) from (
        select g.dia, extract(dow from g.dia)::int as dow,
               (select count(*) from public.agendamentos a
                 where a.petshop_id = p and a.status not in ('cancelado', 'faltou')
                   and a.inicio >= g.dia::timestamp at time zone v_fuso and a.inicio < (g.dia + 1)::timestamp at time zone v_fuso
                   and (not v_so_meus or a.profissional_id = v_eu.id or a.profissional_id is null)) as n,
               (jsonb_typeof(v_hor -> (extract(dow from g.dia)::int)::text) = 'object'
                  or exists (select 1 from public.servicos s where s.petshop_id = p and s.ativo and s.categoria not in ('creche', 'hotel')
                              and jsonb_typeof(s.horario -> (extract(dow from g.dia)::int)::text) = 'object'))
                 and not exists (select 1 from public.dias_especiais e where e.petshop_id = p and e.dia = g.dia and e.fechado) as aberto
          from (select (v_hoje + n) as dia from generate_series(0, 6) n) g) d));
  end if;

  -- ---------- hoje: creche e hotel ----------
  if a_casa then
    r := r || jsonb_build_object('casa', jsonb_build_object(
      'creche', case when usa_creche then (select count(*) from public.estadias e where e.petshop_id = p and e.tipo = 'creche' and e.status in ('reservada', 'em_casa')
                   and coalesce(e.dia, (e.entrada at time zone v_fuso)::date) = v_hoje) end,
      'hotel', case when usa_hotel then (select count(*) from public.estadias e where e.petshop_id = p and e.tipo = 'hotel'
                   and (e.status = 'em_casa' or (e.status = 'reservada' and e.entrada >= v_ini and e.entrada < v_fim))) end));
  end if;

  -- ---------- dinheiro: só para quem tem área de dinheiro ----------
  if a_din then
    -- previsto para entrar hoje, em três origens que não se repetem:
    --   agenda   o valor dos horários de hoje (o que foi fechado, ou o preço marcado), sem os de pacote e os "não cobrar";
    --   casa     o que ainda falta receber de quem sai hoje do hotel (na casa, com saída prevista para hoje: hotel_previsto, a
    --            mesma conta da reserva, menos o sinal já recebido) e da creche avulsa de hoje (estadia_conta_minima de 1 diária,
    --            a mesma conta mínima do check-out, menos o sinal já recebido). Mensalista não entra (é cobrado na cobrança do mês);
    --   receber  contas a receber em aberto que vencem hoje, fora as que são de um horário de hoje (já está na agenda) e o
    --            sinal de uma estadia contada acima (já está na casa).
    -- De fora, por não haver regra clara: hotel sem diária ou sem saída prevista (hotel_previsto não calcula), reserva que só
    -- chega hoje (sinal a combinar), estadia já encerrada hoje (o que foi cobrado no check-out virou lançamento) e a baixa por pacote.
    select coalesce(sum(coalesce(a.valor_concluido, coalesce(a.preco, 0) + coalesce((select sum(x.preco) from public.agendamento_servicos x
              where x.agendamento_id = a.id and x.servico_id is distinct from a.servico_id), 0))), 0)
      into v_valor
      from public.agendamentos a
     where usa_banho and a.petshop_id = p and a.inicio >= v_ini and a.inicio < v_fim and a.status not in ('cancelado', 'faltou')
       and not a.sem_cobranca and a.pacote_cliente_id is null;
    select coalesce(sum(c.valor), 0), coalesce(array_agg(c.sinal_lancamento_id) filter (where c.sinal_lancamento_id is not null), '{}')
      into v_casa, v_sinais
      from (
        select greatest(coalesce(case when e.tipo = 'hotel' then public.hotel_previsto(e.id) else public.estadia_conta_minima(e, 1, null) end, 0)
                        - coalesce(ev.sinal_recebido, 0), 0) as valor, ev.sinal_lancamento_id
          from public.estadias e left join public.estadias_valores ev on ev.estadia_id = e.id
         where e.petshop_id = p and e.mensalista is null
           and ((usa_hotel and e.tipo = 'hotel' and e.status = 'em_casa' and e.saida_prevista >= v_ini and e.saida_prevista < v_fim)
             or (usa_creche and e.tipo = 'creche' and e.status in ('reservada', 'em_casa') and e.entrada >= v_ini and e.entrada < v_fim))
      ) c where c.valor > 0;
    select coalesce(sum(l.valor), 0) into v_receber
      from public.lancamentos l
     where l.petshop_id = p and l.tipo = 'entrada' and not l.pago and l.vencimento = v_hoje and l.valor > 0
       and not (l.id = any (v_sinais))
       and not exists (select 1 from public.agendamentos a
                        where a.id = l.agendamento_id and usa_banho and a.petshop_id = p and a.inicio >= v_ini and a.inicio < v_fim
                          and a.status not in ('cancelado', 'faltou') and not a.sem_cobranca and a.pacote_cliente_id is null);
    v_j := jsonb_build_object('previsto', v_valor + v_casa + v_receber,
      'previsto_de', jsonb_build_object('agenda', v_valor, 'casa', v_casa, 'receber', v_receber),
      'casa_nome', case when usa_creche and usa_hotel then 'Creche e hotel' when usa_hotel then 'Hotel' else 'Creche' end);
    -- clientes devendo: contas a receber em aberto, vencidas ou sem vencimento
    select count(*), coalesce(sum(d.valor), 0) into v_n, v_valor from (
      select l.cliente_id, sum(l.valor) as valor from public.lancamentos l
       where l.petshop_id = p and l.tipo = 'entrada' and not l.pago and l.cliente_id is not null and (l.vencimento is null or l.vencimento <= v_hoje)
       group by l.cliente_id having sum(l.valor) > 0) d;
    v_j := v_j || jsonb_build_object('devendo', jsonb_build_object('clientes', v_n, 'valor', v_valor));
    -- contas que vencem hoje: só para quem cuida do financeiro
    if a_fin then
      select count(*), coalesce(sum(l.valor), 0), (array_agg(coalesce(cf.nome, nullif(l.descricao, ''), l.categoria) order by l.valor desc, l.id))[1]
        into v_n, v_valor, v_txt
        from public.lancamentos l left join public.contas_fixas cf on cf.id = l.conta_fixa_id and cf.petshop_id = p
       where l.petshop_id = p and l.tipo = 'saida' and not l.pago and l.vencimento = v_hoje;
      v_j := v_j || jsonb_build_object('contas_hoje', jsonb_build_object('quantas', v_n, 'valor', v_valor, 'nome', v_txt));
    end if;
    r := r || jsonb_build_object('dinheiro', v_j);
  end if;

  -- ---------- quem está no prazo de voltar (clientes recorrentes que passaram do intervalo habitual) ----------
  if a_agenda and a_cli and not v_so_meus then
    select coalesce(array_agg(z.cliente_id order by z.atraso desc, z.cliente_id), '{}') into v_chamar from (
      select y.cliente_id, max(y.atraso) as atraso from (
        select pt.cliente_id, (v_hoje - w.ultima) - w.med as atraso
          from (
            select g.pet_id, count(*) as n, max(g.dia) as ultima, percentile_cont(0.5) within group (order by g.gap) as med
              from (
                select v.pet_id, v.dia, (v.dia - lag(v.dia) over (partition by v.pet_id order by v.dia)) as gap
                  from (select distinct a.pet_id, (a.inicio at time zone v_fuso)::date as dia from public.agendamentos a
                         where a.petshop_id = p and a.status = 'concluido' and a.inicio >= v_ini - interval '365 days' and a.inicio < v_fim) v
              ) g group by g.pet_id
          ) w
          join public.pets pt on pt.id = w.pet_id and pt.ativo
          join public.clientes c on c.id = pt.cliente_id
         where w.n >= 3 and w.med between 7 and 90
           and (v_hoje - w.ultima) > greatest(w.med * 1.3, w.med + 5) and (v_hoje - w.ultima) <= 180
           and not c.nao_quer_mensagens and char_length(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g')) >= 10
           and not exists (select 1 from public.agendamentos f where f.petshop_id = p and f.pet_id = w.pet_id
                            and f.inicio >= v_agora and f.status not in ('cancelado', 'faltou'))
           and not exists (select 1 from public.estadias e where e.petshop_id = p and e.pet_id = w.pet_id and e.status in ('reservada', 'em_casa'))
      ) y group by y.cliente_id order by 2 desc limit 30) z;
    r := r || jsonb_build_object('chamar', to_jsonb(v_chamar));
  end if;

  -- ---------- conta nova: o que falta no cadastro ----------
  v_conta_nova := not exists (select 1 from public.agendamentos a where a.petshop_id = p)
              and not exists (select 1 from public.estadias e where e.petshop_id = p);
  if v_conta_nova and v_dono then
    if usa_banho then
      select count(*) into v_n from public.servicos s
       where s.petshop_id = p and s.ativo and s.categoria not in ('creche', 'hotel')
         and s.preco_p is null and s.preco_m is null and s.preco_g is null and s.preco_gg is null;
      if v_n > 0 then v_falta := v_falta || jsonb_build_object('chave', 'precos', 'n', v_n, 'rota', '/gestao/app/meu-petshop', 'rotulo', 'Colocar os preços'); end if;
    end if;
    if (usa_creche and v_loja.diaria_creche is null) or (usa_hotel and v_loja.diaria_hotel is null) then
      v_falta := v_falta || jsonb_build_object('chave', 'diaria', 'rota', '/gestao/app/meu-petshop', 'rotulo', 'Colocar o preço da diária');
    end if;
    if not exists (select 1 from public.pets pt where pt.petshop_id = p) then
      v_falta := v_falta || jsonb_build_object('chave', 'pet', 'rota', '/gestao/app/clientes?novo=1', 'rotulo', 'Cadastrar o primeiro pet');
    end if;
    if usa_banho and not v_loja.link_ativo then
      v_falta := v_falta || jsonb_build_object('chave', 'link', 'rota', '/gestao/app/meu-petshop', 'rotulo', 'Ligar o link do cliente');
    end if;
  end if;
  r := r || jsonb_build_object('conta_nova', v_conta_nova, 'falta', v_falta);

  -- ---------- as linhas de "vale lembrar" (vacina, pacote, aniversário, validade): a leitura do Bom dia, com as mesmas permissões ----------
  r := r || jsonb_build_object('bom_dia', public.gestao_bom_dia(p));

  -- ---------- a dica do dia: escolhida uma vez e guardada ----------
  select x.* into v_linha from public.resumo_do_dia x where x.petshop_id = p and x.user_id = v_uid and x.dia = v_dia;
  if not found then
    -- cadastro (conta nova, dono): um achado por item que falta, na ordem
    select coalesce(jsonb_agg(jsonb_build_object('tipo', 'cadastro', 'chave', f.v ->> 'chave', 'base', 100 - f.n::int,
             'dados', jsonb_strip_nulls(jsonb_build_object('n', f.v -> 'n')),
             'acao', jsonb_build_object('tipo', 'ir', 'rota', f.v ->> 'rota', 'rotulo', f.v ->> 'rotulo')) order by f.n), '[]'::jsonb)
      into v_achados from jsonb_array_elements(v_falta) with ordinality f(v, n);

    -- sem_confirmar: 3 ou mais e 30% ou mais dos horários de hoje e de amanhã que ainda vão acontecer
    if a_agenda then
      select count(*) filter (where a.status = 'marcado'), count(*) into v_n, v_n2 from public.agendamentos a
       where a.petshop_id = p and a.inicio > v_agora and a.inicio < (v_hoje + 2)::timestamp at time zone v_fuso
         and a.status not in ('cancelado', 'faltou')
         and (not v_so_meus or a.profissional_id = v_eu.id or a.profissional_id is null);
      if v_n >= 3 and v_n * 100 >= v_n2 * 30 then
        v_achados := v_achados || jsonb_build_object('tipo', 'sem_confirmar', 'chave', 'sem_confirmar', 'base', 60,
          'dados', jsonb_build_object('n', v_n, 'total', v_n2),
          'acao', jsonb_build_object('tipo', 'ir', 'rota', '/gestao/app/mensagens', 'rotulo', 'Mandar os lembretes'));
      end if;
    end if;

    -- retorno: 3 clientes ou mais no prazo de voltar
    if cardinality(v_chamar) >= 3 then
      v_achados := v_achados || jsonb_build_object('tipo', 'retorno', 'chave', 'retorno', 'base', 55,
        'dados', jsonb_build_object('n', cardinality(v_chamar)),
        'acao', jsonb_build_object('tipo', 'chamar', 'clientes', to_jsonb(v_chamar), 'rotulo', 'Chamar os ' || cardinality(v_chamar)));
    end if;

    -- periodo_vazio: manhã ou tarde de um dia da semana sem nenhum horário nas últimas 4 semanas
    if a_agenda and not v_so_meus
       and (select count(*) from public.agendamentos a where a.petshop_id = p and a.status not in ('cancelado', 'faltou')
             and a.inicio >= (v_hoje - 28)::timestamp at time zone v_fuso and a.inicio < v_ini) >= 8
       and exists (select 1 from public.agendamentos a where a.petshop_id = p and a.inicio < (v_hoje - 28)::timestamp at time zone v_fuso) then
      select jsonb_build_object('dow', q.dow, 'periodo', q.periodo) into v_j from (
        select w.dow, pr.periodo
          from generate_series(0, 6) w(dow)
          cross join (values ('manha', time '00:00', time '12:00'), ('tarde', time '12:00', time '23:59:59')) pr(periodo, de, ate)
         where jsonb_typeof(v_hor -> w.dow::text) = 'object'
           and coalesce(v_hor -> w.dow::text ->> 'abre', '') ~ '^\d\d:\d\d' and coalesce(v_hor -> w.dow::text ->> 'fecha', '') ~ '^\d\d:\d\d'
           and case pr.periodo
                 when 'manha' then (v_hor -> w.dow::text ->> 'abre') <= '10:00' and (v_hor -> w.dow::text ->> 'fecha') >= '12:00'
                 else (v_hor -> w.dow::text ->> 'fecha') >= '14:00' and (v_hor -> w.dow::text ->> 'abre') <= '16:00' end
           and not exists (select 1 from public.dias_especiais e where e.petshop_id = p and e.fechado
                            and e.dia >= v_hoje - 28 and e.dia < v_hoje and extract(dow from e.dia)::int = w.dow)
           and not exists (select 1 from public.agendamentos a
                            where a.petshop_id = p and a.status not in ('cancelado', 'faltou')
                              and a.inicio >= (v_hoje - 28)::timestamp at time zone v_fuso and a.inicio < v_ini
                              and extract(dow from (a.inicio at time zone v_fuso))::int = w.dow
                              and (a.inicio at time zone v_fuso)::time >= pr.de and (a.inicio at time zone v_fuso)::time < pr.ate)
         -- o que vem primeiro a partir de amanhã; no mesmo dia, a manhã antes
         order by (w.dow - v_dow + 6) % 7, pr.periodo limit 1) q;
      if v_j is not null then
        v_achados := v_achados || jsonb_build_object('tipo', 'periodo_vazio', 'chave', (v_j ->> 'dow') || '-' || (v_j ->> 'periodo'), 'base', 50,
          'dados', v_j || jsonb_build_object('semanas', 4, 'chamar', cardinality(v_chamar)),
          'acao', case when cardinality(v_chamar) > 0 then jsonb_build_object('tipo', 'chamar', 'clientes', to_jsonb(v_chamar), 'rotulo', 'Chamar os ' || cardinality(v_chamar)) end);
      end if;
    end if;

    -- devendo_antigo: conta em aberto há mais de 30 dias (só com área de dinheiro)
    if a_din then
      select count(*), coalesce(sum(d.valor), 0) into v_n, v_valor from (
        select l.cliente_id, sum(l.valor) as valor from public.lancamentos l
         where l.petshop_id = p and l.tipo = 'entrada' and not l.pago and l.cliente_id is not null
           and coalesce(l.vencimento, l.devido_desde, l.data) < v_hoje - 30
         group by l.cliente_id having sum(l.valor) > 0) d;
      if v_n >= 1 then
        v_achados := v_achados || jsonb_build_object('tipo', 'devendo_antigo', 'chave', 'devendo_antigo', 'base', 45,
          'dados', jsonb_build_object('clientes', v_n, 'valor', v_valor, 'dias', 30),
          'acao', case when a_fin then jsonb_build_object('tipo', 'ir', 'rota', '/gestao/app/financeiro', 'rotulo', 'Ver no Financeiro') end);
      end if;
    end if;

    -- estoque_baixo: produto no estoque mínimo ou abaixo
    if a_est then
      select count(*), (array_agg(pr.nome order by pr.estoque - pr.estoque_minimo, pr.nome))[1] into v_n, v_txt from public.produtos pr
       where pr.petshop_id = p and pr.ativo and pr.estoque_minimo > 0 and pr.estoque <= pr.estoque_minimo;
      if v_n >= 1 then
        v_achados := v_achados || jsonb_build_object('tipo', 'estoque_baixo', 'chave', 'estoque_baixo', 'base', 40,
          'dados', jsonb_build_object('n', v_n, 'primeiro', v_txt),
          'acao', jsonb_build_object('tipo', 'ir', 'rota', '/gestao/app/estoque', 'rotulo', 'Ver no Estoque'));
      end if;
    end if;

    -- a escolha: prioridade, votos e não repetição
    select a.v into v_dica from jsonb_array_elements(v_achados) a(v)
     where coalesce((select vt.voto from public.resumo_dica_votos vt
                      where vt.petshop_id = p and vt.user_id = v_uid and vt.tipo = a.v ->> 'tipo' and vt.dia > v_dia - 90
                      order by vt.dia desc limit 1), '') <> 'nao_quero'
       and not exists (select 1 from public.resumo_do_dia o
                        where o.petshop_id = p and o.user_id = v_uid and o.dia = v_dia - 1
                          and o.dica_tipo = a.v ->> 'tipo' and o.dica_chave = a.v ->> 'chave')
     order by (a.v ->> 'base')::int
            + 10 * least(3, (select count(*) from public.resumo_dica_votos vt
                              where vt.petshop_id = p and vt.user_id = v_uid and vt.tipo = a.v ->> 'tipo' and vt.voto = 'util' and vt.dia > v_dia - 90))
            - 5 * (select count(*) from public.resumo_do_dia o
                    where o.petshop_id = p and o.user_id = v_uid and o.dia >= v_dia - 7 and o.dia < v_dia and o.dica_tipo = a.v ->> 'tipo') desc,
            a.v ->> 'tipo', a.v ->> 'chave'
     limit 1;
    if v_dica is not null then v_dica := jsonb_strip_nulls(v_dica - 'base'); end if;

    insert into public.resumo_do_dia as x (petshop_id, user_id, dia, dica_tipo, dica_chave, dica)
      values (p, v_uid, v_dia, v_dica ->> 'tipo', v_dica ->> 'chave', v_dica)
    on conflict (petshop_id, user_id, dia) do update set dia = excluded.dia
    returning x.* into v_linha;
    -- o que ficou velho desta pessoa sai junto (o histórico serve para 7 dias de não repetição e 90 de votos)
    delete from public.resumo_do_dia o where o.petshop_id = p and o.user_id = v_uid and o.dia < v_dia - 120;
    delete from public.resumo_dica_votos o where o.petshop_id = p and o.user_id = v_uid and o.dia < v_dia - 400;
  end if;

  r := r || jsonb_build_object(
    'visto', v_linha.visto_em is not null,
    'dica', case when v_linha.dica is not null then v_linha.dica || jsonb_build_object('voto',
              (select vt.voto from public.resumo_dica_votos vt where vt.petshop_id = p and vt.user_id = v_uid and vt.tipo = v_linha.dica_tipo and vt.dia = v_dia)) end,
    'ia', jsonb_build_object('estado', v_linha.ia_estado, 'frase', v_linha.ia_frase, 'dica', v_linha.ia_dica));
  return r;
end $$;
revoke execute on function public.gestao_resumo_do_dia(uuid) from public, anon;
grant execute on function public.gestao_resumo_do_dia(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 4. Já viu hoje
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.gestao_resumo_visto(p uuid) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_dia date;
begin
  if v_uid is null or not exists (select 1 from public.profissionais x where x.petshop_id = p and x.user_id = v_uid and x.ativo) then return false; end if;
  select public.resumo_dia_em(now(), s.fuso) into v_dia from public.petshops s where s.id = p;
  -- sem a linha do dia (a folha ainda não leu): a leitura cria, com a dica escolhida
  if not exists (select 1 from public.resumo_do_dia x where x.petshop_id = p and x.user_id = v_uid and x.dia = v_dia) then
    perform public.gestao_resumo_do_dia(p);
  end if;
  update public.resumo_do_dia x set visto_em = coalesce(x.visto_em, now()) where x.petshop_id = p and x.user_id = v_uid and x.dia = v_dia;
  return found;
end $$;
revoke execute on function public.gestao_resumo_visto(uuid) from public, anon;
grant execute on function public.gestao_resumo_visto(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 5. O retorno da dica
-- ---------------------------------------------------------------------------------------------------------------------
create or replace function public.gestao_resumo_votar(p uuid, p_tipo text, p_voto text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_dia date;
begin
  if v_uid is null or not exists (select 1 from public.profissionais x where x.petshop_id = p and x.user_id = v_uid and x.ativo) then
    return jsonb_build_object('ok', false, 'motivo', 'sem_acesso');
  end if;
  if p_voto is null or p_voto not in ('util', 'nao_quero')
     or p_tipo is null or p_tipo not in ('cadastro', 'sem_confirmar', 'retorno', 'periodo_vazio', 'devendo_antigo', 'estoque_baixo') then
    return jsonb_build_object('ok', false, 'motivo', 'pedido');
  end if;
  select public.resumo_dia_em(now(), s.fuso) into v_dia from public.petshops s where s.id = p;
  insert into public.resumo_dica_votos as v (petshop_id, user_id, tipo, dia, voto) values (p, v_uid, p_tipo, v_dia, p_voto)
  on conflict (petshop_id, user_id, tipo, dia) do update set voto = excluded.voto, criado_em = now();
  return jsonb_build_object('ok', true, 'voto', p_voto);
end $$;
revoke execute on function public.gestao_resumo_votar(uuid, text, text) from public, anon;
grant execute on function public.gestao_resumo_votar(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------------------------------------------------
-- 6. O texto da IA: uma vez por dia por pessoa e pet shop
-- ---------------------------------------------------------------------------------------------------------------------
-- Reserva a vez de hoje. Só quem ainda não tem texto nem tentativa consegue; quem já tem recebe o estado (e a rota usa o que
-- está guardado). A contagem na cota do Mozart é feita pela rota, logo depois (assistente_contar_v2, com o segredo do servidor).
create or replace function public.gestao_resumo_ia_reservar(p uuid) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_dia date; v_ok boolean; v_estado text;
begin
  if v_uid is null or not exists (select 1 from public.profissionais x where x.petshop_id = p and x.user_id = v_uid and x.ativo) then
    return jsonb_build_object('ok', false, 'motivo', 'sem_acesso');
  end if;
  select public.resumo_dia_em(now(), s.fuso) into v_dia from public.petshops s where s.id = p;
  if not exists (select 1 from public.resumo_do_dia x where x.petshop_id = p and x.user_id = v_uid and x.dia = v_dia) then
    perform public.gestao_resumo_do_dia(p);
  end if;
  update public.resumo_do_dia x set ia_estado = 'reservado', ia_em = now()
   where x.petshop_id = p and x.user_id = v_uid and x.dia = v_dia and x.ia_estado is null
  returning true into v_ok;
  if coalesce(v_ok, false) then return jsonb_build_object('ok', true); end if;
  select x.ia_estado into v_estado from public.resumo_do_dia x where x.petshop_id = p and x.user_id = v_uid and x.dia = v_dia;
  return jsonb_build_object('ok', false, 'motivo', 'ja', 'estado', v_estado);
end $$;
revoke execute on function public.gestao_resumo_ia_reservar(uuid) from public, anon;
grant execute on function public.gestao_resumo_ia_reservar(uuid) to authenticated;

-- Fecha a vez reservada: 'feito' (com os textos), 'falhou' (o modelo foi chamado e não serviu: hoje fica o texto sem IA) ou
-- 'liberar' (nenhuma chamada ao modelo foi feita, por exemplo sem cota: a vez volta e pode ser tentada depois).
create or replace function public.gestao_resumo_ia_guardar(p uuid, p_estado text, p_frase text default null, p_dica text default null) returns boolean
language plpgsql volatile security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_dia date;
begin
  if v_uid is null or not exists (select 1 from public.profissionais x where x.petshop_id = p and x.user_id = v_uid and x.ativo) then return false; end if;
  if p_estado is null or p_estado not in ('feito', 'falhou', 'liberar') then return false; end if;
  if p_estado = 'feito' and (nullif(btrim(coalesce(p_frase, '')), '') is null or char_length(p_frase) > 200 or char_length(coalesce(p_dica, '')) > 400) then return false; end if;
  select public.resumo_dia_em(now(), s.fuso) into v_dia from public.petshops s where s.id = p;
  update public.resumo_do_dia x
     set ia_estado = case when p_estado = 'liberar' then null else p_estado end,
         ia_em = now(),
         ia_frase = case when p_estado = 'feito' then btrim(p_frase) end,
         ia_dica = case when p_estado = 'feito' then nullif(btrim(coalesce(p_dica, '')), '') end
   where x.petshop_id = p and x.user_id = v_uid and x.dia = v_dia and x.ia_estado = 'reservado';
  return found;
end $$;
revoke execute on function public.gestao_resumo_ia_guardar(uuid, text, text, text) from public, anon;
grant execute on function public.gestao_resumo_ia_guardar(uuid, text, text, text) to authenticated;

notify pgrst, 'reload schema';
