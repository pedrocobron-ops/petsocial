// Rodada 9, desempenho do banco e operação (migração 20261229):
//  - índices novos existem; toda tabela que a exclusão apaga por pet shop tem índice começando por petshop_id;
//  - as funções trocadas devolvem EXATAMENTE o mesmo que antes sobre uma loja com história (as definições antigas ficam em
//    testes/lib/antes-20261229.sql, num esquema só desta rodada): link_vaga, conflitos_agenda, pacotes_acabando,
//    indicadores_do_periodo (30 dias, 3 meses, 12 meses), partes_do_lancamento, partes_por_servico, lucro_repartir,
//    comissao_linhas_calc (e, por elas, lucro_do_periodo, equipe_do_periodo e comissao_do_periodo);
//  - gestao_hoje diz quais partes falharam (chave "falhas") e, sem falha, não muda nada;
//  - erro_do_banco grava em erros_app e só o servidor chama; link_inicial junta as oito leituras públicas do link;
//  - rotinas: rotina_anotar só com a chave de serviço, admin_rotinas só para admin, atraso depois de 36 horas;
//  - apagar a conta de uma loja com caixas fechados: em lotes, retomando de onde parou, sem deixar linha solta; depois de
//    começar não dá para cancelar; conta atrasada aparece para o admin; uma loja com erro não trava as outras.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { createClient } = require('@supabase/supabase-js');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { semearVolume } = require('../lib/semente-volume');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('desempenho-operacao');
const F = lib('faxina');

function chaveDeServico() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const env = execSync('npx supabase status -o env', { cwd: B.RAIZ, stdio: ['ignore', 'pipe', 'ignore'], timeout: 60000 }).toString();
    const m = env.match(/^SERVICE_ROLE_KEY="?([^"\n]+)"?$/m);
    return m ? m[1] : null;
  } catch { return null; }
}
/** SQL como uma pessoa logada (as funções conferem auth.uid()): devolve a última linha. */
const como = (uid, q) => B.sql(`begin; set local role authenticated; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); ${q}; rollback;`).split('\n').pop();
/** Linhas da loja em todas as tabelas que a exclusão apaga (pelo plano do banco). */
const linhasDaLoja = (P) => B.num(`select coalesce(sum((xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %s where petshop_id = %L', t.tabela, '${P}'), false, true, '')))[1]::text::bigint), 0) from gestao_loja_plano() t where t.modo = 'loja'`);
/** Linhas desta loja que apontam para um pai que não existe, em todas as chaves estrangeiras de tabelas com petshop_id. */
const soltas = (P) => B.num(`do $$ declare r record; n bigint; total bigint := 0; begin
  for r in select c.conrelid::regclass::text as filho, c.confrelid::regclass::text as pai,
      (select string_agg(format('f.%I = p.%I', a.attname, b.attname), ' and ') from unnest(c.conkey, c.confkey) x(k, fk)
         join pg_attribute a on a.attrelid = c.conrelid and a.attnum = x.k join pg_attribute b on b.attrelid = c.confrelid and b.attnum = x.fk) as cond,
      (select string_agg(format('f.%I is not null', a.attname), ' and ') from unnest(c.conkey) k join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k) as cheio
    from pg_constraint c where c.contype = 'f' and c.connamespace = 'public'::regnamespace and c.confrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
      and exists (select 1 from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'petshop_id' and not a.attisdropped) loop
    execute format('select count(*) from %s f where f.petshop_id = %L and %s and not exists (select 1 from %s p where %s)', r.filho, '${P}', r.cheio, r.pai, r.cond) into n;
    total := total + n;
  end loop;
  perform set_config('teste.soltas', total::text, false);
end $$; select current_setting('teste.soltas');`);

(async () => T.rodar(async () => {
  T.secao('índices');
  const indices = ['estadias_pet_id_idx', 'agendamentos_pacote_cliente_idx', 'agendamentos_profissional_idx', 'lancamentos_cliente_idx', 'lancamentos_caixa_idx', 'lancamentos_agendamento_idx', 'caixas_petshop_aberto_idx'];
  const tem = B.sql(`select string_agg(indexname, ',' order by indexname) from pg_indexes where schemaname = 'public' and indexname = any ('{${indices.join(',')}}')`).split(',');
  T.ok('os índices das chaves estrangeiras usadas pelas telas e pela exclusão existem', indices.every((i) => tem.includes(i)), indices.filter((i) => !tem.includes(i)));
  const semIndice = B.sql(`select coalesce(string_agg(t.tabela, ', '), '') from gestao_loja_plano() t where t.modo = 'loja' and not exists (
    select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
     where i.indrelid = t.tabela::regclass and i.indpred is null and a.attname = 'petshop_id')`);
  T.ok('toda tabela apagada por pet shop tem índice começando por petshop_id (tabela nova sem ele aparece aqui)', semIndice === '', semIndice);
  const plano = B.sql(`select coalesce(string_agg(tabela || ':' || modo, ', '), '') from gestao_loja_plano() where modo in ('sem', 'fora')`);
  T.ok('o plano de exclusão sabe apagar todas as tabelas da cascata do pet shop (nenhuma "sem" nem "fora")', plano === '', plano);
  T.ok('… e cobre mais de 90 tabelas, com as sem petshop_id apagadas pelo pai', B.num(`select count(*) from gestao_loja_plano()`) > 90 && B.num(`select count(*) from gestao_loja_plano() where modo = 'pai'`) >= 5);

  T.secao('mesmo resultado de antes (loja com história)');
  const L = await criarLoja(T, { nome: 'Desempenho' });
  const P = L.P;
  semearVolume(L, 420);
  const uid = B.sql(`select user_id from profissionais where id = '${L.ids.dono}'`);
  const antes = `teste_antes_${L.suf}`;
  T.depois(() => B.sql(`drop schema if exists ${antes} cascade`));
  B.sql(`create schema ${antes}; grant usage on schema ${antes} to authenticated;\n` + fs.readFileSync(path.join(B.RAIZ, 'testes', 'lib', 'antes-20261229.sql'), 'utf8').replaceAll('__ANTES__', antes)
    + `\ngrant execute on all functions in schema ${antes} to authenticated;`);
  T.ok('a loja tem história para comparar', B.num(`select count(*) from lancamentos where petshop_id='${P}'`) > 700 && B.num(`select count(*) from agendamentos where petshop_id='${P}'`) >= 420);

  for (const [nome, de, ate] of [['30 dias', 'current_date - 30', 'current_date'], ['3 meses (meio de mês a meio de mês)', 'current_date - 97', 'current_date - 5'], ['12 meses', 'current_date - 365', 'current_date'], ['um dia', 'current_date - 40', 'current_date - 40']]) {
    // rodada 9 (N4, migração 20261234): o valor médio por conta ganhou uma definição única (contas, valor_contas, valor_medio, pacotes)
    // e cada serviço ganhou "pagos": esses campos mudaram de propósito e ficam fora da comparação; todo o resto continua igual ao centavo
    const sem = (j) => `(select jsonb_set(jsonb_set(j, '{meses}', (select coalesce(jsonb_agg(m - 'contas' - 'valor_contas' - 'valor_medio' - 'pacotes' - 'valor_pacotes' order by o), '[]'::jsonb) from jsonb_array_elements(j -> 'meses') with ordinality x(m, o))),
      '{servicos}', (select coalesce(jsonb_agg(s - 'pagos' order by o), '[]'::jsonb) from jsonb_array_elements(j -> 'servicos') with ordinality y(s, o))) from (select ${j} as j) z)`;
    const r = como(uid, `select (${sem(`${antes}.indicadores_do_periodo('${P}', ${de}, ${ate})`)}::text = ${sem(`public.indicadores_do_periodo('${P}', ${de}, ${ate})`)}::text)::text || '|' || jsonb_array_length(public.indicadores_do_periodo('${P}', ${de}, ${ate}) -> 'meses') || '|' || (public.indicadores_do_periodo('${P}', ${de}, ${ate}) -> 'meses' -> 0 ->> 'entradas')`);
    T.ok(`indicadores_do_periodo, ${nome}: igual ao centavo`, r.startsWith('true|') && Number(r.split('|')[1]) >= 1, r);
  }
  const comDinheiro = como(uid, `select sum((m ->> 'entradas')::numeric)::text || '|' || sum((m ->> 'contas')::int) || '|' || sum((m ->> 'taxas')::numeric) || '|' || sum((m ->> 'primeira_vez')::int) from jsonb_array_elements(public.indicadores_do_periodo('${P}', current_date - 365, current_date) -> 'meses') m`).split('|').map(Number);
  T.ok('… e a comparação não é de zeros (entradas, contas, taxas e primeira vez no ano)', comDinheiro.every((x) => x > 0), comDinheiro);
  T.ok('indicadores: a recepção sem Relatórios continua recusada', /quem vê os relatórios|Sem acesso/.test((await L.sb.caixa.rpc('indicadores_do_periodo', { p: P, p_de: L.dia(-30), p_ate: L.hoje })).error?.message ?? ''));

  T.ok('pacotes_acabando: igual (loja toda)', como(uid, `select (${antes}.pacotes_acabando('${P}')::text = public.pacotes_acabando('${P}')::text)::text || '|' || jsonb_array_length(public.pacotes_acabando('${P}'))`).match(/^true\|[1-9]/));
  T.ok('pacotes_acabando: igual para cada pet com pacote', como(uid, `select bool_and(${antes}.pacotes_acabando('${P}', k.pet_id)::text = public.pacotes_acabando('${P}', k.pet_id)::text)::text from (select distinct pet_id from pacotes_clientes where petshop_id = '${P}') k`) === 'true');

  const vagas = B.sql(`select count(*) || '|' || count(*) filter (where a = b) || '|' || count(*) filter (where b) from (
    select ${antes}.link_vaga('${P}', g, g + d) as a, public.link_vaga('${P}', g, g + d) as b
    from generate_series(date_trunc('hour', now()) - interval '30 days', date_trunc('hour', now()) + interval '35 days', interval '30 minutes') g, (values (interval '30 minutes'), (interval '4 hours')) v(d)) x`).split('|').map(Number);
  T.ok('link_vaga: igual em 65 dias de horários de 30 min e de 4 h (com bloqueio de 10 dias, pedidos pendentes e horário de 3 h)', vagas[0] > 6000 && vagas[1] === vagas[0] && vagas[2] > 0 && vagas[2] < vagas[0], vagas);
  T.ok('link_horarios: igual ao que sai com a vaga antiga, nos próximos 30 dias', B.sql(`select bool_and(a) from (
    select (select count(*) from public.link_horarios('${L.codigo}', '${L.S.Banho}', d::date) h) =
           (select count(*) from generate_series(7 * 60, 19 * 60 + 30, 30) m where ((d::date)::timestamp + make_interval(mins => m)) at time zone '${L.fuso}' >= now() + interval '2 hours'
              and m + (select duracao_min from servicos where id = '${L.S.Banho}') <= 20 * 60
              and ${antes}.link_vaga('${P}', ((d::date)::timestamp + make_interval(mins => m)) at time zone '${L.fuso}', ((d::date)::timestamp + make_interval(mins => m + (select duracao_min from servicos where id = '${L.S.Banho}'))) at time zone '${L.fuso}')) as a
    from generate_series(current_date, current_date + 30, interval '1 day') d where not public.dia_fechado('${P}', d::date)) x`) === 't');
  const conf = como(uid, `select count(*) || '|' || count(*) filter (where a = b) || '|' || sum(n) from (
    select (select coalesce(string_agg(c.id::text, ',' order by c.id), '') from ${antes}.conflitos_agenda('${P}', f.id, g, g + interval '90 minutes') c) as a,
           (select coalesce(string_agg(c.id::text, ',' order by c.id), '') from public.conflitos_agenda('${P}', f.id, g, g + interval '90 minutes') c) as b,
           (select count(*) from public.conflitos_agenda('${P}', f.id, g, g + interval '90 minutes') c) as n
    from generate_series(date_trunc('hour', now()) - interval '20 days', date_trunc('hour', now()) + interval '10 days', interval '1 hour') g, public.profissionais f where f.petshop_id = '${P}') x`).split('|').map(Number);
  T.ok('conflitos_agenda: igual para cada pessoa da equipe, hora a hora em 30 dias', conf[0] > 3000 && conf[1] === conf[0] && conf[2] > 0, conf);
  T.ok('conflitos_agenda: quem não é da loja continua sem ler', como(B.uuid(), `select count(*) from public.conflitos_agenda('${P}', '${L.ids.tosador}', now() - interval '400 days', now())`) === '0');

  const pdl = B.sql(`select count(*) || '|' || count(*) filter (where a is not distinct from b) || '|' || count(*) filter (where b = '(,,)') from (
    select (select x::text from ${antes}.partes_do_lancamento(l.valor, l.itens) x) as a, (select x::text from public.partes_do_lancamento(l.valor, l.itens) x) as b from lancamentos l where l.petshop_id = '${P}') y`).split('|').map(Number);
  T.ok('partes_do_lancamento: igual para todo lançamento (com itens tortos, sem itens, com desconto)', pdl[0] > 700 && pdl[1] === pdl[0] && pdl[2] > 0, pdl);
  for (const tipo of ['servico', 'produto']) {
    const lr = B.sql(`select count(*) || '|' || count(*) filter (where a = b) || '|' || count(*) filter (where b <> '') from (
      select (select coalesce(string_agg(x::text, ';'), '') from ${antes}.lucro_repartir(l.valor, l.itens, '${tipo}') x) as a,
             (select coalesce(string_agg(x::text, ';'), '') from public.lucro_repartir(l.valor, l.itens, '${tipo}') x) as b from lancamentos l where l.petshop_id = '${P}') y`).split('|').map(Number);
    T.ok(`lucro_repartir (${tipo}): igual, na mesma ordem`, lr[0] > 700 && lr[1] === lr[0] && lr[2] > 50, lr);
  }
  const pps = B.sql(`select count(*) || '|' || count(*) filter (where a = b) || '|' || count(*) filter (where b like '%;%') from (
    select (select coalesce(string_agg(x::text, ';'), '') from ${antes}.partes_por_servico(l.agendamento_id, l.valor, l.itens, v.c) x) as a,
           (select coalesce(string_agg(x::text, ';'), '') from public.partes_por_servico(l.agendamento_id, l.valor, l.itens, v.c) x) as b
    from lancamentos l, (values (true), (false)) v(c) where l.petshop_id = '${P}' and l.agendamento_id is not null) y`).split('|').map(Number);
  T.ok('partes_por_servico: igual (com e sem itens, um e vários serviços)', pps[0] > 500 && pps[1] === pps[0] && pps[2] > 20, pps);
  for (const [nome, de] of [['12 meses', 'current_date - 365'], ['30 dias', 'current_date - 30']]) {
    // a versão antiga não desempatava duas partes do mesmo atendimento com a mesma ordem: a comparação ordena as linhas (a nova desempata, migração 20261234)
    const cl = B.sql(`select (select md5(coalesce(string_agg(x::text, ';' order by x::text), '')) from ${antes}.comissao_linhas_calc('${P}', ${de}, current_date) x) = (select md5(coalesce(string_agg(x::text, ';' order by x::text), '')) from public.comissao_linhas_calc('${P}', ${de}, current_date) x),
      (select count(*) from public.comissao_linhas_calc('${P}', ${de}, current_date) x where x.valor <> 0)`).split('|');
    T.ok(`comissao_linhas_calc, ${nome}: mesmas linhas (com "cobrar a diferença" pela coluna e pela marca antiga)`, cl[0] === 't' && Number(cl[1]) > 5, cl);
  }
  T.ok('comissao_linhas_calc: igual para uma pessoa só', B.sql(`select (select md5(coalesce(string_agg(x::text, ';' order by x::text), '')) from ${antes}.comissao_linhas_calc('${P}', current_date - 365, current_date, '${L.ids.tosador}') x) = (select md5(coalesce(string_agg(x::text, ';' order by x::text), '')) from public.comissao_linhas_calc('${P}', current_date - 365, current_date, '${L.ids.tosador}') x)`) === 't');
  T.ok('a diferença entra na comissão (a marca antiga com dois itens conta uma vez só)', B.num(`select count(*) from lancamentos d where d.petshop_id='${P}' and d.descricao = 'Diferença (marca antiga)'`) > 5);
  const lucro = B.must(await L.sb.dono.rpc('lucro_do_periodo', { p_petshop: P, p_de: L.dia(-365), p_ate: L.hoje }), 'lucro_do_periodo');
  const equipe = B.must(await L.sb.dono.rpc('equipe_do_periodo', { p_petshop: P, p_de: L.dia(-365), p_ate: L.hoje }), 'equipe_do_periodo');
  T.ok('lucro_do_periodo e equipe_do_periodo continuam respondendo com a loja cheia', lucro && typeof lucro === 'object' && Array.isArray(equipe.pessoas) && equipe.pessoas.length >= 2);

  T.secao('gestao_hoje: partes que falham ficam registradas');
  const a = (mais = {}) => ({ hoje_ini: new Date().toISOString(), amanha: new Date(Date.now() + 864e5).toISOString(), depois: new Date(Date.now() + 2 * 864e5).toISOString(), seg: new Date(Date.now() - 3 * 864e5).toISOString(), seg7: new Date(Date.now() + 4 * 864e5).toISOString(),
    ha30: new Date(Date.now() - 30 * 864e5).toISOString(), dia: L.hoje, ha6: L.dia(-6), mais7: L.dia(7), saude_ate: L.dia(30), cred_de: new Date(Date.now() - 6 * 864e5).toISOString(), cred_ate: new Date(Date.now() + 864e5).toISOString(),
    devolucao: ['Devolução', 'Devolução de sinal'], estoque: true, financeiro: true, cuido: true, pacotes: true, cobrar: true, cobrar_hoje: true, ...mais });
  const h1 = B.must(await L.sb.dono.rpc('gestao_hoje', { p: P, a: a() }), 'gestao_hoje');
  T.ok('tudo certo: nenhuma chave "falhas" (a resposta é a de antes)', !('falhas' in h1) && Array.isArray(h1.lista) && Array.isArray(h1.creditos) && Array.isArray(h1.devolucoes));
  const h2 = B.must(await L.sb.dono.rpc('gestao_hoje', { p: P, a: a({ cred_de: 'isto não é data' }) }), 'gestao_hoje com parte quebrada');
  T.ok('uma parte quebrada: vale vazia como antes, e a função diz qual foi e por quê', Array.isArray(h2.creditos) && h2.creditos.length === 0 && Array.isArray(h2.falhas) && h2.falhas.length === 1 && h2.falhas[0].parte === 'creditos' && /timestamp|data/i.test(h2.falhas[0].erro), h2.falhas);
  T.ok('… e o resto da tela vem inteiro', Array.isArray(h2.lista) && Array.isArray(h2.devolucoes) && h2.contagens && JSON.stringify(h2.lista) === JSON.stringify(h1.lista));

  T.secao('erros do banco em erros_app');
  const marca = `teste ${L.suf}`;
  T.recusa('anônimo não chama erro_do_banco', await B.cliente().rpc('erro_do_banco', { p_onde: 'x', p_mensagem: marca }));
  T.recusa('o dono não chama erro_do_banco', await L.sb.dono.rpc('erro_do_banco', { p_onde: 'x', p_mensagem: marca }));
  B.sql(`select public.erro_do_banco('funcao_de_teste', ${B.q(marca)}, '${P}')`);
  T.depois(() => B.sql(`delete from erros_app where mensagem like '%${marca}%'`));
  T.ok('erro_do_banco grava em erros_app (servidor, banco, com a função na rota e o pet shop)', B.sql(`select origem || '|' || tipo || '|' || rota || '|' || (petshop_id = '${P}')::text from erros_app where mensagem like '%${marca}%'`) === 'servidor|banco|banco:funcao_de_teste|true');
  for (const f of ['creche_taxi_anotar', 'contas_fixas_gerar_todas']) {
    T.ok(`${f}: o erro engolido vai para erros_app (além do aviso no log)`, B.num(`select count(*) from pg_proc where proname = '${f}' and prosrc like '%erro_do_banco%' and prosrc like '%raise warning%'`) === 1);
  }

  T.secao('link_inicial: as oito leituras numa ida');
  const anon = B.cliente();
  const c = { p_codigo: L.codigo };
  const junto = B.must(await anon.rpc('link_inicial', c), 'link_inicial');
  const [info, nome, google, promos, fechados, ia, hotel, opcoes] = await Promise.all(['link_info', 'link_nome', 'link_google', 'link_promocoes', 'link_fechados', 'link_ia_ligada', 'link_hotel_opcoes', 'link_opcoes'].map(async (f) => B.must(await anon.rpc(f, c), f)));
  const igual = (x, y) => JSON.stringify(x ?? null) === JSON.stringify(y ?? null);
  T.ok('cada parte igual à função pública de sempre', igual(junto.info, info) && igual(junto.nome, nome) && igual(junto.google, google) && igual(junto.promocoes, promos) && igual(junto.fechados, fechados ?? []) && igual(junto.ia, ia) && igual(junto.hotel, hotel) && igual(junto.opcoes, opcoes),
    { nome: [junto.nome, nome], fechados: [junto.fechados, fechados] });
  T.ok('… e traz o pet shop', typeof junto.info?.nome === 'string' && junto.info.nome.length > 0, junto.info);
  const nada = B.must(await anon.rpc('link_inicial', { p_codigo: 'codigo-que-nao-existe' }), 'link_inicial de código inventado');
  T.ok('código inventado: nada de pet shop nenhum', nada.info === null && nada.nome === null && nada.ia === false && igual(nada.fechados, []), nada);

  T.secao('rotinas agendadas');
  const chave = chaveDeServico();
  T.recusa('o dono não anota rotina', await L.sb.dono.rpc('rotina_anotar', { p_nome: 'faxina', p_ok: true }));
  T.recusa('anônimo não anota rotina', await anon.rpc('rotina_anotar', { p_nome: 'faxina', p_ok: true }));
  T.recusa('quem não é admin não lê as rotinas', await L.sb.dono.rpc('admin_rotinas'));
  const O = await criarLoja(T, { nome: 'Desempenho outra', equipe: false, dados: false });
  const adm = O.sb.dono, uidAdm = B.sql(`select user_id from profissionais where id = '${O.ids.dono}'`);
  T.ok('a tabela das rotinas não é lida pela API', ((await L.sb.dono.from('rotinas_execucoes').select('nome')).data ?? []).length === 0);
  const rot = `teste-${L.suf}`;
  T.depois(() => B.sql(`delete from rotinas_execucoes where nome = '${rot}'; delete from admins where user_id = '${uidAdm}'`));
  B.sql(`insert into admins (user_id) values ('${uidAdm}') on conflict do nothing`);
  B.sql(`select public.rotina_anotar('${rot}', true, '{"contas": 2}'::jsonb)`);
  const ler = async () => (B.must(await adm.rpc('admin_rotinas'), 'admin_rotinas').rotinas ?? []).find((r) => r.nome === rot);
  let r1 = await ler();
  T.ok('rodou bem: em dia, com o resultado', r1 && r1.atrasada === false && r1.ultima_ok_em && r1.resultado?.contas === 2 && r1.falhas_seguidas === 0, r1);
  B.sql(`select public.rotina_anotar('${rot}', false, null, 'falta a chave de serviço')`);
  r1 = await ler();
  T.ok('falhou depois: guarda o erro e a última vez boa', r1.ultimo_erro === 'falta a chave de serviço' && r1.falhas_seguidas === 1 && r1.ultima_ok_em && r1.resultado?.contas === 2 && !r1.atrasada, r1);
  B.sql(`update rotinas_execucoes set ultima_ok_em = now() - interval '37 hours' where nome = '${rot}'`);
  T.ok('37 horas sem rodar bem: atrasada', (await ler()).atrasada === true);
  B.sql(`update rotinas_execucoes set ultima_ok_em = null, criada_em = now() - interval '2 days' where nome = '${rot}'`);
  T.ok('nunca rodou bem e existe há 2 dias: atrasada', (await ler()).atrasada === true);
  const todas = B.must(await adm.rpc('admin_rotinas'), 'admin_rotinas');
  T.ok('a faxina diária aparece na lista (mesmo sem nunca ter rodado), com as tarefas do banco quando há pg_cron', todas.rotinas.some((r) => r.nome === 'faxina' && r.onde === 'servidor')
    && (B.num(`select count(*) from pg_extension where extname = 'pg_cron'`) === 0 || todas.rotinas.some((r) => r.onde === 'banco' && r.nome === 'gestao-faxina-diaria')), todas.rotinas.map((r) => r.nome));

  T.secao('apagar a conta de uma loja com história');
  if (!chave) { T.ok('sem a chave de serviço local (npx supabase status): exclusão não conferida', true); return; }
  const svc = createClient(B.SUPABASE_URL, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  T.recusa('o dono não chama gestao_loja_apagar', await L.sb.dono.rpc('gestao_loja_apagar', { p_pedido: 1, p_ate: new Date().toISOString() }));
  T.recusa('o dono não chama gestao_exclusoes_processar', await L.sb.dono.rpc('gestao_exclusoes_processar', { p_petshop: P }));
  T.recusa('o dono não lê o plano', await L.sb.dono.rpc('gestao_loja_plano'));
  // tabelas sem petshop_id (apagadas pelo pai) e arquivos
  B.sql(`set session_replication_role = replica;
    insert into tutor_acessos (cliente_id, tipo, minuto, n) select id, 'abrir', date_trunc('minute', now()), 1 from clientes where petshop_id = '${P}' limit 5;
    insert into albuns (petshop_id, pet_id, token) select '${P}', id, md5(id::text || '${L.suf}') || md5('${L.suf}' || id::text) from pets where petshop_id = '${P}' limit 3;
    insert into album_acessos (album_id, tipo, minuto, n) select id, 'abrir', date_trunc('minute', now()), 1 from albuns where petshop_id = '${P}';
    set session_replication_role = origin;`);
  const contarAcessos = ((q) => () => B.num(q))(`select (select count(*) from tutor_acessos t where t.cliente_id = any ('{${B.sql(`select coalesce(string_agg(id::text, ','), '') from clientes where petshop_id='${P}'`)}}')) + (select count(*) from album_acessos t where t.album_id = any ('{${B.sql(`select coalesce(string_agg(id::text, ','), '') from albuns where petshop_id='${P}'`)}}'))`);
  const acessosAntes = contarAcessos();
  const soltasAntes = soltas(P);
  T.ok('a loja de teste começa sem linha solta e com 8 linhas em tabelas sem petshop_id', soltasAntes === 0 && acessosAntes === 8, { soltasAntes, acessosAntes });
  const nomeLoja = B.sql(`select nome from petshops where id='${P}'`);
  B.must(await L.sb.dono.rpc('conta_exclusao_pedir', { p_petshop: P, p_nome: nomeLoja }), 'pedir exclusão');
  const antesDoPrazo = B.must(await svc.rpc('gestao_exclusoes_processar', { p_petshop: P }), 'processar antes do prazo');
  T.ok('antes do prazo: nada é apagado', antesDoPrazo.lojas === 0 && antesDoPrazo.pendentes === 0 && antesDoPrazo.linhas === 0 && B.num(`select count(*) from petshops where id='${P}'`) === 1, antesDoPrazo);
  B.sql(`update exclusoes_conta set apagar_em = now() - interval '3 days' where petshop_id='${P}' and apagado_em is null`);
  const pedido = B.num(`select id from exclusoes_conta where petshop_id='${P}' and apagado_em is null and cancelado_em is null`);
  const exclusoes = B.must(await adm.rpc('admin_exclusoes'), 'admin_exclusoes');
  T.ok('prazo vencido há 3 dias e nada apagado: aparece como atrasada para o admin', exclusoes.find((x) => x.petshop_id === P)?.atrasada === true && B.must(await adm.rpc('admin_rotinas'), 'rotinas').exclusoes_atrasadas >= 1);
  const total = linhasDaLoja(P);
  const emFechado = B.num(`select count(*) from lancamentos l join caixas c on c.id = l.caixa_id where l.petshop_id='${P}' and c.fechado_em is not null`);
  T.ok('a loja tem mais de 2.500 linhas, com lançamentos em caixa fechado (que a trava do caixa não deixa apagar um a um)', total > 2500 && emFechado > 300, { total, emFechado });
  T.recusa('a trava do caixa fechado continua valendo para todo mundo', (() => { try { B.sql(`delete from lancamentos where id = (select l.id from lancamentos l join caixas c on c.id = l.caixa_id where l.petshop_id='${P}' and c.fechado_em is not null limit 1)`); return { data: 'apagou' }; } catch (e) { return { error: { message: String(e.stderr || e.message) } }; } })(), /caixa já fechado/);

  // um lote só e para: retoma depois
  const passo = B.must(await svc.rpc('gestao_loja_apagar', { p_pedido: pedido, p_ate: new Date(Date.now() - 1000).toISOString(), p_lote: 50 }), 'um lote');
  const meio = linhasDaLoja(P);
  T.ok('um lote de 50 e o tempo acabou: parou no meio, com o andamento gravado', passo.feito === false && passo.linhas === 50 && meio === total - 50
    && B.sql(`select (comecou_em is not null)::text || '|' || linhas_apagadas || '|' || (apagado_em is null)::text || '|' || cardinality(membros) from exclusoes_conta where id=${pedido}`) === 'true|50|true|5', { passo, meio, total });
  T.ok('… o pet shop continua existindo e nenhuma linha ficou solta (a ordem é das folhas para a raiz)', B.num(`select count(*) from petshops where id='${P}'`) === 1 && soltas(P) === 0);
  T.recusa('depois de começar a apagar, o dono não cancela mais', await L.sb.dono.rpc('conta_exclusao_cancelar', { p_petshop: P }), /já começaram a ser apagados/);
  const ex2 = B.must(await adm.rpc('admin_exclusoes'), 'admin_exclusoes').find((x) => x.petshop_id === P);
  T.ok('o admin vê que está apagando (quando começou, quantas linhas saíram)', ex2.comecou_em && Number(ex2.linhas_apagadas) === 50 && ex2.atrasada === true, ex2);

  // a faxina de verdade (a mesma da rota), com pouco tempo por chamada no banco: várias voltas até acabar
  const f1 = await F.faxinaGeral(svc, P, { segundosDasContas: 40 });
  T.ok('a faxina retoma e termina: conta apagada, logins apagados, nada pendente', f1.contas === 1 && f1.logins === 5 && f1.contasPendentes === 0 && f1.linhas === total - 50 + 8, { f1, total });
  T.ok('o pet shop sumiu, com todas as linhas de todas as tabelas', B.num(`select count(*) from petshops where id='${P}'`) === 0 && linhasDaLoja(P) === 0);
  T.ok('as tabelas sem petshop_id foram junto (acessos do tutor e do álbum) e nada desta loja ficou solto', contarAcessos() === 0 && soltas(P) === 0, contarAcessos());
  T.ok('o pedido fica como apagado, com as linhas contadas, sem os logins guardados e sem erro', B.sql(`select (apagado_em is not null)::text || '|' || usuarios || '|' || linhas_apagadas || '|' || (membros is null)::text || '|' || (erro is null)::text from exclusoes_conta where id=${pedido}`) === `true|5|${total + 8}|true|true`);
  T.ok('… e no registro da LGPD', B.num(`select count(*) from lgpd_registros where petshop_id='${P}' and acao='conta_apagada'`) === 1);
  T.ok('os logins da equipe saíram do Auth e a fila de logins ficou vazia', B.num(`select count(*) from auth.users where email like 't-${L.suf}.%'`) === 0 && B.num(`select count(*) from logins_lixo where petshop_id='${P}'`) === 0);
  // a fila de logins: só devolve quem continua solto; quem está em outro pet shop (ou já saiu do Auth) sai da fila sem ser apagado
  T.recusa('o dono não lê a fila de logins', await O.sb.dono.rpc('gestao_logins_lixo', {}));
  const fantasma = B.uuid();
  B.sql(`insert into logins_lixo (user_id, petshop_id) values ('${uidAdm}', '${P}'), ('${fantasma}', '${P}')`);
  const fila = B.must(await svc.rpc('gestao_logins_lixo', { p_petshop: P }), 'gestao_logins_lixo');
  T.ok('login que está em outro pet shop e login que já saiu do Auth: não são devolvidos e saem da fila', Array.isArray(fila) && fila.length === 0 && B.num(`select count(*) from logins_lixo where petshop_id='${P}'`) === 0
    && B.num(`select count(*) from auth.users where id='${uidAdm}'`) === 1, fila);
  // login solto que o Auth não conseguiu apagar: fica na fila com o motivo e volta na próxima faxina
  const solto = B.cliente();
  const emailSolto = `t-${L.suf}.solto@teste-auto.local`;
  B.must(await solto.auth.signUp({ email: emailSolto, password: L.senha, options: B.dadosDoCadastro() }), 'login solto');
  const uidSolto = B.sql(`select id from auth.users where email='${emailSolto}'`);
  T.depois(() => B.sql(`delete from logins_lixo where user_id='${uidSolto}'; delete from auth.users where id='${uidSolto}'; delete from aceites where email='${emailSolto}'`));
  B.sql(`insert into logins_lixo (user_id, petshop_id) values ('${uidSolto}', '${P}')`);
  B.must(await svc.rpc('gestao_login_lixo_feito', { p_user: uidSolto, p_ok: false, p_erro: 'o Auth não respondeu' }), 'anotar falha');
  T.ok('falhou ao apagar: continua na fila, com a tentativa e o motivo', B.sql(`select tentativas || '|' || erro from logins_lixo where user_id='${uidSolto}'`) === '1|o Auth não respondeu');
  const f3 = await F.faxinaGeral(svc, P, { segundosDasContas: 5 });
  T.ok('a próxima faxina tenta de novo e apaga o login que sobrou', f3.logins === 1 && B.num(`select count(*) from auth.users where id='${uidSolto}'`) === 0 && B.num(`select count(*) from logins_lixo where user_id='${uidSolto}'`) === 0, f3);
  T.ok('a outra loja não foi tocada', B.num(`select count(*) from petshops where id='${O.P}'`) === 1 && B.num(`select count(*) from profissionais where petshop_id='${O.P}'`) === 1);
  const denovo = await F.faxinaGeral(svc, P, { segundosDasContas: 5 });
  T.ok('rodar de novo não apaga mais nada', denovo.contas === 0 && denovo.linhas === 0 && denovo.contasPendentes === 0, denovo);

  // erro numa loja: fica anotado (tentativas, erro, erros_app) e a chamada não quebra
  B.must(await O.sb.dono.rpc('conta_exclusao_pedir', { p_petshop: O.P, p_nome: B.sql(`select nome from petshops where id='${O.P}'`) }), 'pedir (outra)');
  B.sql(`update exclusoes_conta set apagar_em = now() - interval '1 hour' where petshop_id='${O.P}' and apagado_em is null`);
  B.sql(`create or replace function public.teste_trava_${L.suf}() returns trigger language plpgsql as $f$ begin if old.id = '${O.P}' then raise exception 'trava de teste ${L.suf}'; end if; return old; end $f$;
         create trigger teste_trava_${L.suf} before delete on public.petshops for each row execute function public.teste_trava_${L.suf}();`);
  const tirarTrava = () => B.sql(`drop trigger if exists teste_trava_${L.suf} on public.petshops; drop function if exists public.teste_trava_${L.suf}();`);
  T.depois(tirarTrava);
  T.depois(() => B.sql(`delete from erros_app where mensagem like '%trava de teste ${L.suf}%'`));
  const comErro = B.must(await svc.rpc('gestao_exclusoes_processar', { p_petshop: O.P }), 'processar com erro');
  T.ok('uma loja que dá erro: a chamada responde, conta a falha e deixa pendente', comErro.lojas === 0 && comErro.falhas === 1 && comErro.pendentes === 1, comErro);
  T.ok('… o erro fica no pedido (tentativas e a frase) e em erros_app', B.sql(`select tentativas || '|' || (erro like '%trava de teste%')::text || '|' || (comecou_em is null)::text from exclusoes_conta where petshop_id='${O.P}' and apagado_em is null`) === '1|true|true'
    && B.num(`select count(*) from erros_app where rota = 'banco:gestao_exclusoes_processar' and mensagem like '%trava de teste ${L.suf}%'`) === 1);
  T.ok('… e nada da loja foi apagado (o que a tentativa fez voltou atrás)', B.num(`select count(*) from profissionais where petshop_id='${O.P}'`) === 1 && B.num(`select count(*) from servicos where petshop_id='${O.P}'`) > 0);
  tirarTrava();
  const f2 = await F.faxinaGeral(svc, O.P);
  T.ok('sem a trava, a próxima faxina apaga', f2.contas === 1 && f2.contasPendentes === 0 && B.num(`select count(*) from petshops where id='${O.P}'`) === 0, f2);
}))();
