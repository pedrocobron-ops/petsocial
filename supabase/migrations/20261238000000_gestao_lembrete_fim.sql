-- O lembrete de WhatsApp aprovado pelo dono (src/lib/gestao/lembrete-zap.ts) diz o término previsto do horário
-- ("🕒 *15h* (término previsto às 16h15)"). A Agenda e o Mozart já leem o fim do horário; o Modo envio lê os lembretes de
-- amanhã por gestao_modo_envio, que agora devolve também `fim` em cada lembrete (o resto da função fica igual).

CREATE OR REPLACE FUNCTION public.gestao_modo_envio(p uuid, p_dias integer DEFAULT 15)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_fuso text; v_hoje date; v_ini timestamptz; v_fim timestamptz; v_amanha_fim timestamptz;
  a_agenda boolean := public.tenho_area(p, array['agenda']);
  a_casa boolean := public.tenho_area(p, array['creche_hotel']);
  a_cli boolean := public.tenho_area(p, array['clientes']);
  a_din boolean := public.tenho_area(p, array['caixa', 'financeiro', 'relatorios']);
  a_pac boolean := public.tenho_area(p, array['pacotes']);
  v_dias integer := least(greatest(coalesce(p_dias, 15), 0), 60);
  i jsonb := '{}'::jsonb;
begin
  if not exists (select 1 from public.profissionais x where x.petshop_id = p and x.user_id = (select auth.uid()) and x.ativo) then return null; end if;
  select coalesce(s.fuso, 'America/Sao_Paulo') into v_fuso from public.petshops s where s.id = p;
  v_hoje := (now() at time zone v_fuso)::date;
  v_ini := v_hoje::timestamp at time zone v_fuso;
  v_fim := (v_hoje + 1)::timestamp at time zone v_fuso;
  v_amanha_fim := (v_hoje + 2)::timestamp at time zone v_fuso;

  -- lembrete dos horários de amanhã que ainda não tiveram lembrete
  if a_agenda then
    i := i || jsonb_build_object('lembrete', coalesce((
      select jsonb_agg(x order by x.inicio) from (
        select a.id, a.inicio, a.fim,
               jsonb_build_object('id', pp.id, 'nome', pp.nome, 'sexo', pp.sexo) as pet,
               jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'nao_quer', c.nao_quer_mensagens) as tutor,
               (select jsonb_build_object('nome', s.nome) from public.servicos s where s.id = a.servico_id) as servicos,
               coalesce((select jsonb_agg(jsonb_build_object('ordem', x2.ordem, 'servicos', jsonb_build_object('nome', s2.nome)) order by x2.ordem)
                  from public.agendamento_servicos x2 join public.servicos s2 on s2.id = x2.servico_id where x2.agendamento_id = a.id), '[]'::jsonb) as agendamento_servicos
          from public.agendamentos a join public.pets pp on pp.id = a.pet_id left join public.clientes c on c.id = pp.cliente_id
         where a.petshop_id = p and a.inicio >= v_fim and a.inicio < v_amanha_fim
           and a.status in ('marcado', 'confirmado') and a.lembrete_em is null
         order by a.inicio limit 300) x), '[]'::jsonb));

    -- pet pronto: atendimento de hoje concluído e o tutor ainda não foi avisado
    i := i || jsonb_build_object('pronto', coalesce((
      select jsonb_agg(x order by x.inicio desc) from (
        select a.id, a.inicio,
               jsonb_build_object('id', pp.id, 'nome', pp.nome, 'sexo', pp.sexo) as pet,
               jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'nao_quer', c.nao_quer_mensagens) as tutor,
               (select jsonb_build_object('nome', s.nome) from public.servicos s where s.id = a.servico_id) as servicos,
               coalesce((select jsonb_agg(jsonb_build_object('ordem', x2.ordem, 'servicos', jsonb_build_object('nome', s2.nome)) order by x2.ordem)
                  from public.agendamento_servicos x2 join public.servicos s2 on s2.id = x2.servico_id where x2.agendamento_id = a.id), '[]'::jsonb) as agendamento_servicos
          from public.agendamentos a join public.pets pp on pp.id = a.pet_id left join public.clientes c on c.id = pp.cliente_id
         where a.petshop_id = p and a.inicio >= v_ini and a.inicio < v_fim
           and a.status = 'concluido' and a.pronto_avisado_em is null
         order by a.inicio desc limit 200) x), '[]'::jsonb));
  end if;

  -- aviso de chegada das reservas de amanhã (creche avulsa e hotel; o mensalista vem todo dia e não entra)
  if a_casa then
    i := i || jsonb_build_object('chegada', coalesce((
      select jsonb_agg(x order by x.entrada) from (
        select e.id, e.tipo, e.entrada, e.saida_prevista,
               jsonb_build_object('id', pp.id, 'nome', pp.nome, 'sexo', pp.sexo) as pet,
               jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'nao_quer', c.nao_quer_mensagens) as tutor
          from public.estadias e join public.pets pp on pp.id = e.pet_id left join public.clientes c on c.id = pp.cliente_id
         where e.petshop_id = p and e.status = 'reservada' and e.plano_id is null
           and e.entrada >= v_fim and e.entrada < v_amanha_fim
           and (e.avisos ->> 'chegada') is null
         order by e.entrada limit 200) x), '[]'::jsonb));
  end if;

  if a_agenda or a_casa or a_cli then
    -- vacina e cuidado vencendo nos próximos dias (ou vencido há até 30 dias): a dose mais nova de cada um,
    -- sem mensagem de saúde para ela nos últimos 30 dias
    i := i || jsonb_build_object('saude', coalesce((
      select jsonb_agg(x order by x.vence_em, x.pet_id) from (
        select d.id, d.pet_id, d.tipo, d.nome, d.vence_em,
               jsonb_build_object('id', pp.id, 'nome', pp.nome, 'sexo', pp.sexo) as pet,
               jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'nao_quer', c.nao_quer_mensagens) as tutor
          from (select distinct on (s.pet_id, s.tipo, lower(s.nome)) s.id, s.pet_id, s.tipo, s.nome, s.vence_em
                  from public.pets_saude s where s.petshop_id = p
                 order by s.pet_id, s.tipo, lower(s.nome), s.vence_em desc nulls first) d
          join public.pets pp on pp.id = d.pet_id left join public.clientes c on c.id = pp.cliente_id
         where pp.ativo and d.vence_em is not null and d.vence_em between v_hoje - 30 and v_hoje + v_dias
           and not exists (select 1 from public.mensagens_enviadas m where m.petshop_id = p and m.tipo = 'saude' and m.ref = d.id and m.dia > v_hoje - 30)
         order by d.vence_em limit 300) x), '[]'::jsonb));

    -- aniversário hoje (uma mensagem por ano)
    i := i || jsonb_build_object('niver', coalesce((
      select jsonb_agg(x order by x.nome) from (
        select pp.id, pp.nome, pp.nascimento,
               jsonb_build_object('id', pp.id, 'nome', pp.nome, 'sexo', pp.sexo) as pet,
               jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'nao_quer', c.nao_quer_mensagens) as tutor
          from public.pets pp left join public.clientes c on c.id = pp.cliente_id
         where pp.petshop_id = p and pp.ativo and pp.nascimento is not null
           and extract(month from pp.nascimento) = extract(month from v_hoje) and extract(day from pp.nascimento) = extract(day from v_hoje)
           and not exists (select 1 from public.mensagens_enviadas m where m.petshop_id = p and m.tipo = 'niver' and m.ref = pp.id and m.dia > v_hoje - 300)
         order by pp.nome limit 200) x), '[]'::jsonb));

    -- aniversário do tutor hoje (uma mensagem por ano), de quem tem pet ativo; nascido em 29/02, no dia 28/02 em ano não bissexto
    i := i || jsonb_build_object('niver_tutor', coalesce((
      select jsonb_agg(x order by x.nome) from (
        select c.id, c.nome, c.nascimento,
               coalesce((select jsonb_agg(jsonb_build_object('id', pp.id, 'nome', pp.nome, 'sexo', pp.sexo) order by pp.nome)
                  from public.pets pp where pp.cliente_id = c.id and pp.petshop_id = p and pp.ativo), '[]'::jsonb) as pets,
               jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'nao_quer', c.nao_quer_mensagens) as tutor
          from public.clientes c
         where c.petshop_id = p and c.nascimento is not null and public.niver_no_dia(c.nascimento, v_hoje)
           and exists (select 1 from public.pets pp where pp.cliente_id = c.id and pp.petshop_id = p and pp.ativo)
           and not exists (select 1 from public.mensagens_enviadas m where m.petshop_id = p and m.tipo = 'niver_tutor' and m.ref = c.id and m.dia > v_hoje - 300)
         order by c.nome limit 200) x), '[]'::jsonb));
  end if;

  -- pacote no último uso: o horário de hoje usa a última sessão, ou a última sessão foi usada nos últimos 14 dias
  if a_pac then
    i := i || jsonb_build_object('pacote', coalesce((
      select jsonb_agg(x order by x.nome) from (
        select pc.id, pc.nome, pc.total, pc.usados,
               jsonb_build_object('id', pp.id, 'nome', pp.nome, 'sexo', pp.sexo) as pet,
               jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'nao_quer', c.nao_quer_mensagens) as tutor
          from public.pacotes_clientes pc join public.pets pp on pp.id = pc.pet_id left join public.clientes c on c.id = pp.cliente_id
         where pc.petshop_id = p and pc.ativo and pp.ativo and pc.total > 0
           and ((pc.total - pc.usados = 1 and exists (select 1 from public.agendamentos a where a.pacote_cliente_id = pc.id
                   and a.inicio >= v_ini and a.inicio < v_fim and a.status not in ('cancelado', 'faltou')))
             or (pc.usados >= pc.total and exists (select 1 from public.agendamentos a where a.pacote_cliente_id = pc.id
                   and a.inicio >= v_ini - interval '14 days' and a.inicio < v_fim and a.status = 'concluido')))
           and not exists (select 1 from public.mensagens_enviadas m where m.petshop_id = p and m.tipo = 'pacote' and m.ref = pc.id)
         order by pc.nome limit 200) x), '[]'::jsonb));
  end if;

  -- cobrança gentil: contas de clientes vencidas (ou sem vencimento) em aberto; quem foi cobrado nos últimos 7 dias fica de fora
  if a_din then
    i := i || jsonb_build_object('cobranca', coalesce((
      select jsonb_agg(x order by x.total desc) from (
        select c.id as cliente_id, sum(l.valor) as total,
               jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'nao_quer', c.nao_quer_mensagens) as tutor,
               jsonb_agg(jsonb_build_object('id', l.id, 'valor', l.valor, 'valor_original', l.valor_original, 'descricao', l.descricao,
                 'categoria', l.categoria, 'vencimento', l.vencimento, 'multa_recebida', l.multa_recebida, 'multa_recebida_em', l.multa_recebida_em)
                 order by l.vencimento nulls last, l.criado_em) as contas
          from public.lancamentos l join public.clientes c on c.id = l.cliente_id
         where l.petshop_id = p and l.tipo = 'entrada' and not l.pago and (l.vencimento is null or l.vencimento <= v_hoje)
           and not exists (select 1 from public.lancamentos l2 where l2.petshop_id = p and l2.cliente_id = c.id and not l2.pago
                             and l2.cobrado_em > now() - interval '7 days')
           and not exists (select 1 from public.mensagens_enviadas m where m.petshop_id = p and m.tipo = 'cobranca' and m.ref = l.id and m.dia > v_hoje - 7)
         group by c.id
        having sum(l.valor) > 0
         order by sum(l.valor) desc limit 200) x), '[]'::jsonb));
  end if;

  -- chamar de volta: pets que não vêm há 60 dias ou mais e não têm nada marcado (a regra de visitas_dos_pets);
  -- tutor chamado nos últimos 30 dias fica de fora
  if a_cli then
    i := i || jsonb_build_object('volta', coalesce((
      select jsonb_agg(x order by x.ultima desc) from (
        select pp.id, v.ultima, v.servico,
               jsonb_build_object('id', pp.id, 'nome', pp.nome, 'sexo', pp.sexo) as pet,
               jsonb_build_object('id', c.id, 'nome', c.nome, 'telefone', c.telefone, 'nao_quer', c.nao_quer_mensagens) as tutor
          from (select (e ->> 0)::uuid as pet_id, (e ->> 1)::timestamptz as ultima, e ->> 2 as servico, (e ->> 3)::boolean as marcado
                  from jsonb_array_elements(public.visitas_dos_pets(p, v_ini, now())) e) v
          join public.pets pp on pp.id = v.pet_id join public.clientes c on c.id = pp.cliente_id
         where pp.petshop_id = p and pp.ativo and not v.marcado and v.ultima is not null
           and (v.ultima at time zone v_fuso)::date <= v_hoje - 60
           and not exists (select 1 from public.mensagens_enviadas m where m.petshop_id = p and m.tipo = 'volta' and m.ref = c.id and m.dia > v_hoje - 30)
         order by v.ultima desc limit 300) x), '[]'::jsonb));
  end if;

  return jsonb_build_object('dia', v_hoje, 'itens', i, 'modelos', (
    select coalesce(jsonb_object_agg(mm.chave, mm.texto), '{}'::jsonb) from public.modelos_mensagem mm
     where mm.petshop_id = p and mm.chave in ('chamar.volta', 'chamar.niver', 'chamar.niver_tutor')));
end $function$;
