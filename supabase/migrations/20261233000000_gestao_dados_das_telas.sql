-- Rodada 9 (N3): camada de dados das telas.
--
-- 1. gestao_hoje_extras: os cartões de baixo da tela Hoje ("Chamar de volta", aniversariantes, "O Mozart reparou" e
--    "Mandar N mensagens") calculados no banco, numa resposta pequena. Antes a tela baixava todos os pets ativos com o tutor,
--    150 dias de atendimentos, as visitas de todos os pets e a fila inteira do Modo envio (3,5 MB por visita numa loja com
--    três anos de movimento) só para mostrar três frases e um número.
--    security invoker: valem as regras de sempre (RLS e colunas liberadas) de quem chama; nenhum valor em dinheiro sai daqui.
--    A parte do Modo envio chama `gestao_modo_envio` (que já filtra pelas áreas de quem pede) e devolve só a contagem.
--    As contas são as mesmas da tela: `quemSumiu` / `aniversariantes` (clientes/chamar-de-volta.tsx), as dicas de
--    dicas-mozart.tsx e `montarFila` (modo-envio.ts). Parte que falhar volta vazia (null) e entra em `falhas`.
--
-- Nada aqui muda tabela, regra ou função existente: o código que está no ar hoje segue igual neste banco.

create or replace function public.gestao_hoje_extras(p uuid, a jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_hoje timestamptz := coalesce((a ->> 'hoje_ini')::timestamptz, date_trunc('day', now()));
  v_agora timestamptz := coalesce((a ->> 'agora')::timestamptz, now());
  v_dia date := coalesce((a ->> 'dia')::date, (now() at time zone 'America/Sao_Paulo')::date);
  v_amanha timestamptz := v_hoje + interval '1 day';
  v_chamados_volta uuid[] := coalesce(array(select jsonb_array_elements_text(coalesce(a -> 'chamados_volta', '[]'::jsonb))::uuid), '{}');
  v_chamados_niver uuid[] := coalesce(array(select jsonb_array_elements_text(coalesce(a -> 'chamados_niver', '[]'::jsonb))::uuid), '{}');
  v_chamar jsonb; v_dicas jsonb; v_envio jsonb;
  v_falhas jsonb := '[]'::jsonb;
  v_fila jsonb;
begin
  if not exists (select 1 from profissionais x where x.petshop_id = p and x.user_id = (select auth.uid()) and x.ativo) then return null; end if;

  -- "Chamar de volta" e aniversariantes: só o que a tela Hoje mostra (quantos tutores, quantos pets e os dois primeiros nomes)
  if coalesce((a ->> 'chamar')::boolean, false) then
    begin
      with v as (
        select (x ->> 0)::uuid as pet_id, (x ->> 1)::timestamptz as ultima, coalesce((x ->> 3)::boolean, false) as marcado
          from jsonb_array_elements(public.visitas_dos_pets(p, v_hoje, v_agora)) x
      ),
      base as (
        -- só tutor com telefone (oito algarismos ou mais), como a tela
        select pt.id, pt.nome, pt.nascimento, pt.cliente_id, c.nome as tutor, v.ultima, coalesce(v.marcado, false) as marcado
          from pets pt join clientes c on c.id = pt.cliente_id left join v on v.pet_id = pt.id
         where pt.petshop_id = p and pt.ativo and length(regexp_replace(coalesce(c.telefone, ''), '\D', '', 'g')) >= 8
      ),
      sumidos as (
        -- já veio, não vem há mais de 30 dias (dias inteiros pelo relógio de quem pede) e não tem nada marcado
        select b.*, min(d.dias) over (partition by b.cliente_id) as ordem
          from base b, lateral (select case when b.ultima >= v_hoje then 0 else ceil(extract(epoch from (v_hoje - b.ultima)) / 86400.0)::int end as dias) d
         where b.ultima is not null and not b.marcado and d.dias > 30
      ),
      niver as (
        select b.*, n.em, min(n.em) over (partition by b.cliente_id) as ordem
          from base b,
               lateral (select (make_date(extract(year from v_dia)::int, extract(month from b.nascimento)::int, 1) + (extract(day from b.nascimento)::int - 1)) as este) e,
               lateral (select case when e.este >= v_dia then e.este - v_dia
                                    else (make_date(extract(year from v_dia)::int + 1, extract(month from b.nascimento)::int, 1) + (extract(day from b.nascimento)::int - 1)) - v_dia end as em) n
         where b.nascimento is not null and n.em <= 7
      )
      select jsonb_build_object(
        'sumidos', (select jsonb_build_object(
            'todos', count(distinct s.cliente_id),
            'tutores', count(distinct s.cliente_id) filter (where s.cliente_id <> all (v_chamados_volta)),
            'pets', count(*) filter (where s.cliente_id <> all (v_chamados_volta)),
            'nomes', coalesce((select jsonb_agg(z.nome order by z.n) from (
                select s2.nome, row_number() over (order by s2.ordem, s2.tutor, s2.cliente_id, s2.nome, s2.id) as n
                  from sumidos s2 where s2.cliente_id <> all (v_chamados_volta) order by 2 limit 2) z), '[]'::jsonb))
          from sumidos s),
        'niver', (select jsonb_build_object(
            'todos', count(distinct s.cliente_id),
            'tutores', count(distinct s.cliente_id) filter (where s.cliente_id <> all (v_chamados_niver)),
            'pets', count(*) filter (where s.cliente_id <> all (v_chamados_niver)),
            'hoje', coalesce(bool_and(s.em = 0) filter (where s.cliente_id <> all (v_chamados_niver)), false),
            'nomes', coalesce((select jsonb_agg(z.nome order by z.n) from (
                select s2.nome, row_number() over (order by s2.ordem, s2.tutor, s2.cliente_id, s2.nome, s2.id) as n
                  from niver s2 where s2.cliente_id <> all (v_chamados_niver) order by 2 limit 2) z), '[]'::jsonb))
          from niver s))
        into v_chamar;
    exception when others then
      v_chamar := null;
      v_falhas := v_falhas || jsonb_build_object('parte', 'chamar', 'erro', sqlerrm);
    end;
  end if;

  -- "O Mozart reparou": as mesmas cinco contas de dicas-mozart.tsx, só com os nomes que a frase usa
  if coalesce((a ->> 'dicas')::boolean, false) then
    begin
      with passados as (
        select g.pet_id, g.inicio, g.status, pt.nome, pt.ativo
          from agendamentos g join pets pt on pt.id = g.pet_id
         where g.petshop_id = p and g.status in ('concluido', 'faltou')
           and g.inicio >= v_hoje - interval '150 days' and g.inicio < v_amanha
      ),
      futuros as (
        select g.pet_id, g.inicio from agendamentos g
         where g.petshop_id = p and g.inicio >= v_hoje and g.inicio < v_hoje + interval '60 days'
           and g.status not in ('cancelado', 'faltou')
      ),
      ultima as (
        select distinct on (x.pet_id) x.pet_id, x.inicio, x.nome, x.ativo from passados x where x.status = 'concluido' order by x.pet_id, x.inicio desc
      ),
      sumidos as (
        select u.nome, u.inicio from ultima u
         where u.ativo and u.inicio < v_hoje - interval '30 days' and not exists (select 1 from futuros f where f.pet_id = u.pet_id)
      ),
      faltas as (
        select x.nome, max(x.inicio) as inicio from passados x
         where x.status = 'faltou' and x.inicio >= v_hoje - interval '7 days' and x.ativo and not exists (select 1 from futuros f where f.pet_id = x.pet_id)
         group by x.nome
      ),
      niver as (
        select pt.nome, n.em from pets pt,
               lateral (select (make_date(extract(year from v_dia)::int, extract(month from pt.nascimento)::int, 1) + (extract(day from pt.nascimento)::int - 1)) as este) e,
               lateral (select case when e.este >= v_dia then e.este - v_dia
                                    else (make_date(extract(year from v_dia)::int + 1, extract(month from pt.nascimento)::int, 1) + (extract(day from pt.nascimento)::int - 1)) - v_dia end as em) n
         where pt.petshop_id = p and pt.ativo and pt.nascimento is not null and n.em <= 7
      )
      select jsonb_build_object(
        'sumidos', jsonb_build_object('q', (select count(*) from sumidos),
                     'nomes', coalesce((select jsonb_agg(z.nome order by z.inicio desc) from (select s.nome, s.inicio from sumidos s order by s.inicio desc limit 2) z), '[]'::jsonb)),
        'faltas', coalesce((select jsonb_agg(z.nome order by z.inicio desc) from (select f.nome, f.inicio from faltas f order by f.inicio desc limit 30) z), '[]'::jsonb),
        'faltas_q', (select count(*) from faltas),
        'niver', coalesce((select jsonb_agg(jsonb_build_object('nome', z.nome, 'em', z.em) order by z.em, z.nome) from (select n.nome, n.em from niver n order by n.em, n.nome limit 30) z), '[]'::jsonb),
        'niver_q', (select count(*) from niver),
        'amanha', (select count(*) from futuros f where f.inicio >= v_amanha and f.inicio < v_amanha + interval '1 day'),
        'vieram', (select count(*) from ultima),
        -- pacote no último uso (assunto de quem cuida de pacotes: a tela diz se pede)
        'pacotes', case when coalesce((a ->> 'pacotes')::boolean, false) then (
            select jsonb_build_object('q', count(*), 'nomes', coalesce(jsonb_agg(z.nome order by z.n) filter (where z.n <= 2), '[]'::jsonb))
              from (select pt.nome, row_number() over (order by pc.id) as n
                      from pacotes_clientes pc join pets pt on pt.id = pc.pet_id
                     where pc.petshop_id = p and pc.ativo and pc.total - pc.usados = 1 order by pc.id limit 500) z)
          else null end)
        into v_dicas;
    exception when others then
      v_dicas := null;
      v_falhas := v_falhas || jsonb_build_object('parte', 'dicas', 'erro', sqlerrm);
    end;
  end if;

  -- "Mandar N mensagens": quantas mensagens dá para mandar em cada tipo (uma por tutor), sem a fila inteira.
  -- Telefone que o banco reconhece conta aqui; o que está escrito de outro jeito ("11 9… / 11 9…") vai em `ver` para a tela
  -- conferir com a regra dela (`lerTelefone`). Sem telefone e "não quer receber mensagens" ficam de fora, como na fila.
  if coalesce((a ->> 'envio')::boolean, false) then
    begin
      v_fila := public.gestao_modo_envio(p, coalesce((a ->> 'envio_dias')::int, 15));
      if v_fila is null then
        v_envio := null;
      else
        with linhas as (
          select t.key as tipo, e.item, e.n
            from jsonb_each(coalesce(v_fila -> 'itens', '{}'::jsonb)) t,
                 lateral jsonb_array_elements(case when jsonb_typeof(t.value) = 'array' then t.value else '[]'::jsonb end) with ordinality as e(item, n)
        ),
        grupos as (
          -- uma mensagem por tutor e por tipo (saúde: por pet; cobrança e aniversário do tutor: uma por linha)
          select distinct on (l.tipo, g.chave) l.tipo, g.chave, l.item -> 'tutor' as tutor, l.item
            from linhas l,
                 lateral (select case l.tipo
                            when 'saude' then coalesce(l.item ->> 'pet_id', l.n::text)
                            when 'cobranca' then 'l' || l.n::text
                            when 'niver_tutor' then 'l' || l.n::text
                            else coalesce(l.item -> 'tutor' ->> 'id', l.item -> 'pet' ->> 'id', 'l' || l.n::text) end as chave) g
           order by l.tipo, g.chave, l.n
        ),
        validos as (
          select g.tipo, g.tutor ->> 'telefone' as telefone
            from grupos g
           where not coalesce((g.tutor ->> 'nao_quer')::boolean, false)
             and regexp_replace(coalesce(g.tutor ->> 'telefone', ''), '\D', '', 'g') <> ''
             -- chamar de volta vale por tutor; cobrança precisa de conta
             and (g.tipo <> 'volta' or (g.tutor ->> 'id') is not null)
             and (g.tipo <> 'cobranca' or jsonb_array_length(coalesce(g.item -> 'contas', '[]'::jsonb)) > 0)
        )
        select coalesce(jsonb_object_agg(x.tipo, jsonb_build_object('n', x.n, 'ver', x.ver)), '{}'::jsonb) into v_envio
          from (select v.tipo,
                       count(*) filter (where public.telefone_limpo(v.telefone) is not null) as n,
                       coalesce(jsonb_agg(v.telefone) filter (where public.telefone_limpo(v.telefone) is null), '[]'::jsonb) as ver
                  from validos v group by v.tipo) x;
      end if;
    exception when others then
      v_envio := null;
      v_falhas := v_falhas || jsonb_build_object('parte', 'envio', 'erro', sqlerrm);
    end;
  end if;

  return jsonb_build_object('chamar', v_chamar, 'dicas', v_dicas, 'envio', v_envio, 'falhas', v_falhas);
end;
$$;

revoke all on function public.gestao_hoje_extras(uuid, jsonb) from public, anon;
grant execute on function public.gestao_hoje_extras(uuid, jsonb) to authenticated, service_role;

-- 2. gestao_sinal: "mudou alguma coisa na agenda deste período?" numa resposta de 32 letras.
--    As telas Hoje, Agenda e Quadro perguntam isto a cada minuto e só baixam os dados de novo quando a resposta muda: o tablet
--    do banho vê o que a recepção marcou sem ninguém recarregar a página, e sem baixar a agenda inteira a cada minuto.
--    É só um resumo embaralhado (md5) dos horários, serviços, etapas do quadro, bloqueios, estadias e pedidos do período, mais a contagem do
--    dinheiro do dia: não dá para tirar nenhum dado dele. security definer para poder resumir a linha inteira (inclusive as
--    colunas reservadas, que quem pede não lê); só responde a quem é da equipe do pet shop.
create or replace function public.gestao_sinal(p uuid, p_de timestamptz, p_ate timestamptz)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  with j as (select p_de as de, least(p_ate, p_de + interval '62 days') as ate
              where exists (select 1 from public.profissionais x where x.petshop_id = p and x.user_id = (select auth.uid()) and x.ativo))
  select md5(concat_ws('|',
    (select md5(coalesce(string_agg(md5(a::text), '' order by a.id), '')) from public.agendamentos a where a.petshop_id = p and a.inicio >= j.de and a.inicio < j.ate),
    (select md5(coalesce(string_agg(md5(s::text), '' order by s.id), ''))
       from public.agendamento_servicos s join public.agendamentos a on a.id = s.agendamento_id
      where a.petshop_id = p and a.inicio >= j.de and a.inicio < j.ate),
    (select md5(coalesce(string_agg(md5(q::text), '' order by q.agendamento_id), ''))
       from public.quadro_atendimento q join public.agendamentos a on a.id = q.agendamento_id
      where a.petshop_id = p and a.inicio >= j.de and a.inicio < j.ate),
    (select md5(coalesce(string_agg(md5(b::text), '' order by b.id), '')) from public.bloqueios b
      where b.petshop_id = p and b.inicio < j.ate and b.inicio >= j.de - interval '31 days' and b.fim >= j.de),
    (select md5(coalesce(string_agg(md5(e::text), '' order by e.id), '')) from public.estadias e
      where e.petshop_id = p and e.status in ('reservada', 'em_casa') and e.entrada < j.ate + interval '30 days'),
    (select md5(coalesce(string_agg(md5(e::text), '' order by e.id), '')) from public.estadias e
      where e.petshop_id = p and e.status not in ('reservada', 'em_casa') and e.entrada >= j.de - interval '45 days' and e.entrada < j.ate
        and coalesce(e.saida, e.saida_prevista, e.entrada) >= j.de),
    (select count(*)::text || coalesce(max(q.criado_em)::text, '') || coalesce(max(q.cliente_pediu_em)::text, '') || coalesce(max(q.cliente_cancelou_em)::text, '')
       from public.pedidos_agendamento q where q.petshop_id = p and q.status = 'pendente'),
    (select count(*)::text || '/' || coalesce(sum(l.valor), 0)::text || '/' || count(*) filter (where l.pago)::text
       from public.lancamentos l where l.petshop_id = p and l.data >= (j.de at time zone 'America/Sao_Paulo')::date - 1)))
    from j
$$;

revoke all on function public.gestao_sinal(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.gestao_sinal(uuid, timestamptz, timestamptz) to authenticated, service_role;
