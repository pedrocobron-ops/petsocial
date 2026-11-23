// Segurança, rodada 9 (migração 20261228): o que a revisão de segurança pediu.
//   H2  teto geral do gasto com IA por dia (Mozart, Ajuda, boletim, Tirar dúvida), conta só para consulta sem IA, teto do teste grátis;
//   M1  trava do servidor: carência, depois fechada; com a trava gravada, segredo errado é recusado;
//   M2  cabeçalhos de segurança em todas as páginas (precisa do servidor);
//   M4  Cakto: pagamento só pelo e-mail não libera pet shop sem a prova do e-mail; ao provar, liga sozinho;
//   L1  clientes, pets e saúde por área (Estoque não lê; sem a área Clientes não edita o tutor);
//   L2  aceite só de versão conhecida; L3 IP do aceite da entrada; freio de lojas novas por rede; nome de foto.
// O que mexe em configuração de todos (config_interna) roda dentro de uma transação que é desfeita no fim (rollback):
// nada disso aparece para outros testes rodando ao mesmo tempo.
const B = require('../lib/base');
const { lib } = require('../lib/app');
const { criarLoja } = require('../lib/semente');
const T = require('../lib/teste')('seguranca-rodada9');

/** Roda um bloco de SQL numa transação desfeita no fim; devolve { R1: '...', R2: '...' } das linhas "R1=...". */
function ensaio(sqlTexto) {
  // parte sempre do mesmo estado: sem trava do servidor gravada e dentro da carência (cada ensaio muda o que precisa)
  const saida = B.sql(`begin;
    delete from public.config_interna where chave = 'servidor_segredo_sha256';
    insert into public.config_interna (chave, valor) values ('servidor_trava_carencia_ate', (now() + interval '1 day')::text) on conflict (chave) do update set valor = excluded.valor;
    ${sqlTexto}\nrollback;`);
  return Object.fromEntries(saida.split('\n').map((l) => l.match(/^(R\d+)=(.*)$/)).filter(Boolean).map((m) => [m[1], m[2]]));
}
/** Dentro do ensaio: passa a valer o login desta pessoa (como a API faz). */
const como = (uid) => `reset role; select set_config('request.jwt.claims', '{"sub":"${uid}","role":"authenticated"}', true); set local role authenticated;`;
const comoAnon = `reset role; select set_config('request.jwt.claims', '{"role":"anon"}', true); set local role anon;`;
const config = (chave, valorSql) => `insert into public.config_interna (chave, valor) values ('${chave}', ${valorSql}) on conflict (chave) do update set valor = excluded.valor;`;

(async () => T.rodar(async () => {
  const A = await criarLoja(T, { nome: 'Seg9 A' });
  const Bl = await criarLoja(T, { nome: 'Seg9 B', equipe: false });
  const a = A.sb.dono, b = Bl.sb.dono, anon = B.cliente();
  const uidA = (await a.auth.getUser()).data.user.id, uidB = (await b.auth.getUser()).data.user.id;
  const n = async (p) => { const r = await p; return r.error ? 'erro' : (r.data?.length ?? 0); };

  // ───────────────────────── H2
  T.secao('H2: teto geral da IA (todos os pet shops juntos)');
  let r = ensaio(`
    ${config('mozart_dia_geral', "(public.ia_uso_geral('mozart') + 3)::text")}
    ${config('mozart_dia_geral_teste', "'999999'")} -- o teto próprio do teste grátis (20261245) fora desta conta
    ${config('ajuda_dia_geral_teste', "'999999'")}
    ${como(uidA)}
    select 'R1=' || (public.assistente_contar_v2('${A.P}', 'mozart', 'chamada', 600) ->> 'ok');
    select 'R2=' || (public.assistente_contar_v2('${A.P}', 'mozart', 'chamada', 600) ->> 'ok');
    ${como(uidB)}
    select 'R3=' || (public.assistente_contar_v2('${Bl.P}', 'mozart', 'chamada', 600) ->> 'ok');
    select 'R4=' || (public.assistente_contar_v2('${Bl.P}', 'mozart', 'chamada', 600) ->> 'motivo');
    select 'R5=' || (public.assistente_contar_v2('${Bl.P}', 'mozart', 'pedido', 150) ->> 'motivo');
    select 'R6=' || public.assistente_contar('${Bl.P}', 'mozart', 'chamada', 600);
    select 'R7=' || (public.assistente_contar_v2('${Bl.P}', 'ajuda', 'pedido', 80) ->> 'ok');`);
  T.ok('Mozart: teto de 3 chamadas, dois pet shops: as 3 primeiras passam', r.R1 === 'true' && r.R2 === 'true' && r.R3 === 'true', r);
  T.ok('Mozart: a 4ª chamada é recusada com o motivo "geral"', r.R4 === 'geral', r);
  T.ok('Mozart: no teto, pedido novo também é recusado antes de gastar', r.R5 === 'geral', r);
  T.ok('a função antiga (assistente_contar) respeita o mesmo teto', r.R6 === 'false', r);
  T.ok('o teto do Mozart não trava a Ajuda (cada canal tem o seu)', r.R7 === 'true', r);
  r = ensaio(`
    ${config('ajuda_dia_geral', "(public.ia_uso_geral('ajuda') + 1)::text")}
    ${config('boletim_dia_geral', "(public.ia_uso_geral('boletim') + 1)::text")}
    ${config('link_ia_dia_geral', "(public.ia_uso_geral('link_ia') + 1)::text")}
    ${config('ajuda_dia_geral_teste', "'999999'")} -- o teto próprio do teste grátis (20261245) fora desta conta
    ${config('boletim_dia_geral_teste', "'999999'")}
    ${config('link_ia_dia_geral_teste', "'999999'")}
    delete from public.config_interna where chave = 'servidor_segredo_sha256';
    ${config('servidor_trava_carencia_ate', "(now() + interval '1 day')::text")}
    update public.petshops set link_ativo = true, opcoes = coalesce(opcoes, '{}'::jsonb) || '{"link.ia": true}'::jsonb where id = '${A.P}';
    ${como(uidA)}
    select 'R1=' || (public.assistente_contar_v2('${A.P}', 'ajuda', 'pedido', 80) ->> 'ok') || ',' || (public.assistente_contar_v2('${A.P}', 'ajuda', 'pedido', 80) ->> 'motivo');
    select 'R2=' || (public.boletim_ia_contar('${A.P}') ->> 'ok') || ',' || (public.boletim_ia_contar('${A.P}') ->> 'motivo');
    ${comoAnon}
    select 'R3=' || (public.link_ia_contar('${A.codigo}') ->> 'ok') || ',' || (public.link_ia_contar('${A.codigo}') ->> 'motivo');`);
  T.ok('Ajuda: teto geral (1 passa, a seguinte "geral")', r.R1 === 'true,geral', r);
  T.ok('Boletim: teto geral (1 passa, o seguinte "geral")', r.R2 === 'true,geral', r);
  T.ok('Tirar dúvida do link: teto geral (1 passa, a seguinte "geral")', r.R3 === 'true,geral', r);

  T.secao('H2: conta só para consulta e teste grátis');
  r = ensaio(`
    insert into public.config_interna (chave, valor) values ('assinatura_aberta', '1') on conflict (chave) do nothing;
    update public.petshops set status = 'teste', teste_ate = now() - interval '1 day' where id = '${A.P}';
    ${como(uidA)}
    select 'R1=' || (public.assistente_contar_v2('${A.P}', 'mozart', 'pedido', 150) ->> 'motivo');
    select 'R2=' || (public.assistente_contar_v2('${A.P}', 'ajuda', 'pedido', 80) ->> 'motivo');
    select 'R3=' || public.assistente_contar('${A.P}', 'mozart', 'chamada', 600);
    select 'R4=' || (public.boletim_ia_contar('${A.P}') ->> 'ok');
    select 'R5=' || (public.caderno_contar('${A.P}', 1) ->> 'motivo');`);
  T.ok('teste vencido (com a assinatura aberta): Mozart recusa com "fechado"', r.R1 === 'fechado', r);
  T.ok('teste vencido: Ajuda com IA recusa com "fechado"', r.R2 === 'fechado', r);
  T.ok('teste vencido: a função antiga devolve false', r.R3 === 'false', r);
  T.ok('teste vencido: boletim e caderno também não usam a IA', r.R4 === 'false' && r.R5 === 'fechado', r);
  r = ensaio(`
    ${config('mozart_teste_dia', "'2'")}
    ${como(uidA)}
    select 'R1=' || (public.assistente_contar_v2('${A.P}', 'mozart', 'pedido', 150) ->> 'ok');
    select 'R2=' || (public.assistente_contar_v2('${A.P}', 'mozart', 'pedido', 150) ->> 'ok');
    select 'R3=' || (public.assistente_contar_v2('${A.P}', 'mozart', 'pedido', 150) ->> 'motivo');
    reset role; update public.petshops set status = 'ativa' where id = '${A.P}';
    ${como(uidA)}
    select 'R4=' || (public.assistente_contar_v2('${A.P}', 'mozart', 'pedido', 150) ->> 'ok');`);
  T.ok('teste grátis: teto menor por dia (2 pedidos passam, o 3º "limite")', r.R1 === 'true' && r.R2 === 'true' && r.R3 === 'limite', r);
  T.ok('assinante: vale o limite normal do pet shop', r.R4 === 'true', r);
  r = ensaio(`
    ${config('mozart_loja_dia', "'2'")}
    update public.petshops set status = 'ativa' where id = '${A.P}';
    ${como(uidA)}
    select 'R1=' || (public.assistente_contar_v2('${A.P}', 'mozart', 'pedido', 1000000) ->> 'ok') || ',' || (public.assistente_contar_v2('${A.P}', 'mozart', 'pedido', 1000000) ->> 'ok') || ',' || (public.assistente_contar_v2('${A.P}', 'mozart', 'pedido', 1000000) ->> 'motivo');`);
  T.ok('o limite mandado por quem chama não passa do teto por pet shop do banco (ninguém infla a conta)', r.R1 === 'true,true,limite', r);
  r = ensaio(`
    select public.servidor_segredo_registrar('${'s'.repeat(40)}');
    ${como(uidA)}
    select 'R1=' || (public.assistente_contar_v2('${A.P}', 'mozart', 'pedido', 150) ->> 'motivo') || ',' || (public.assistente_contar_v2('${A.P}', 'mozart', 'pedido', 150, 'errado') ->> 'motivo') || ',' || public.assistente_contar('${A.P}', 'mozart', 'pedido', 150);
    select 'R2=' || (public.boletim_ia_contar('${A.P}') ->> 'motivo') || ',' || (public.boletim_ia_contar('${A.P}', 'errado') ->> 'motivo');
    select 'R3=' || (public.assistente_contar_v2('${A.P}', 'mozart', 'pedido', 150, '${'s'.repeat(40)}') ->> 'ok') || ',' || (public.assistente_contar_v2('${A.P}', 'ajuda', 'pedido', 80, '${'s'.repeat(40)}') ->> 'ok') || ',' || (public.boletim_ia_contar('${A.P}', '${'s'.repeat(40)}') ->> 'ok');
    reset role;
    select 'R4=' || (select coalesce(sum(pedidos + chamadas), 0) from public.assistente_uso where petshop_id = '${A.P}') || ',' || (select coalesce(sum(textos), 0) from public.boletim_ia_uso where petshop_id = '${A.P}');`);
  T.ok('com a trava gravada: chamar a contagem direto (sem o segredo do servidor) é recusado no Mozart e na função antiga', r.R1 === 'recusado,recusado,false', r);
  T.ok('com a trava gravada: o boletim também só conta pelo servidor', r.R2 === 'recusado,recusado', r);
  T.ok('com a trava gravada: o servidor (segredo certo) conta Mozart, Ajuda e boletim', r.R3 === 'true,true,true', r);
  T.ok('as chamadas diretas não somaram nada no dia (não dá para encher o teto de todos de graça)', r.R4 === '2,1', r);
  T.ok('quem não é da equipe não conta no pet shop dos outros', (await b.rpc('assistente_contar_v2', { p_petshop: A.P, p_canal: 'mozart', p_tipo: 'pedido', p_limite: 150 })).data?.motivo === 'sem_acesso');
  T.ok('anônimo não chama a contagem do Mozart', !!(await anon.rpc('assistente_contar_v2', { p_petshop: A.P, p_canal: 'mozart', p_tipo: 'pedido', p_limite: 150 })).error);
  T.ok('os tetos e a soma do dia não são chamáveis de fora', !!(await a.rpc('ia_uso_geral', { p_canal: 'mozart' })).error && !!(await a.rpc('ia_teto_geral', { p_canal: 'mozart' })).error);

  // ───────────────────────── M1
  T.secao('M1: trava do servidor');
  const SEG = 's'.repeat(40);
  r = ensaio(`
    delete from public.config_interna where chave = 'servidor_segredo_sha256';
    ${config('servidor_trava_carencia_ate', "(now() + interval '1 day')::text")}
    update public.petshops set link_ativo = true, opcoes = coalesce(opcoes, '{}'::jsonb) || '{"link.ia": true}'::jsonb where id = '${A.P}';
    select 'R1=' || public.servidor_segredo_ok('qualquer') || ',' || public.servidor_segredo_estado('qualquer') || ',' || public.servidor_segredo_confere('qualquer');
    update public.config_interna set valor = (now() - interval '1 minute')::text where chave = 'servidor_trava_carencia_ate';
    select 'R2=' || public.servidor_segredo_ok('qualquer') || ',' || public.servidor_segredo_ok(null);
    ${comoAnon}
    select 'R3=' || (public.link_ia_contar('${A.codigo}', 'errado') ->> 'motivo') || ',' || (public.link_ia_contar('${A.codigo}') ->> 'motivo') || ',' || public.vendas_contar('errado', 'visitante-teste');
    reset role;
    delete from public.config_interna where chave = 'servidor_trava_carencia_ate';
    select 'R4=' || public.servidor_segredo_ok('qualquer');
    select public.servidor_segredo_registrar('${SEG}');
    ${config('servidor_trava_carencia_ate', "(now() + interval '1 day')::text")}
    select 'R5=' || public.servidor_segredo_ok('${SEG}') || ',' || public.servidor_segredo_ok('errado') || ',' || public.servidor_segredo_ok(null) || ',' || public.servidor_segredo_estado('${SEG}') || ',' || public.servidor_segredo_estado('errado');
    ${comoAnon}
    select 'R6=' || (public.link_ia_contar('${A.codigo}', 'errado') ->> 'motivo') || ',' || (public.link_ia_contar('${A.codigo}') ->> 'motivo') || ',' || public.vendas_contar('errado', 'visitante-teste');
    select 'R7=' || (public.link_ia_contar('${A.codigo}', '${SEG}') ->> 'ok') || ',' || public.vendas_contar('${SEG}', 'visitante-teste');
    reset role;
    select 'R8=' || (select perguntas from public.link_ia_uso where petshop_id = '${A.P}');`);
  T.ok('sem trava e dentro da carência: a contagem ainda é aceita (o que está no ar segue funcionando)', r.R1 === 'true,sem_trava,false', r);
  T.ok('sem trava e carência vencida: fechado (com ou sem segredo)', r.R2 === 'false,false', r);
  T.ok('carência vencida: anônimo não gasta a cota do Tirar dúvida nem do chat de venda', r.R3 === 'recusado,recusado,false', r);
  T.ok('sem trava e sem data de carência: fechado', r.R4 === 'false', r);
  T.ok('trava gravada: só o segredo certo passa, mesmo com a carência valendo', r.R5 === 'true,false,false,ok,errado', r);
  T.ok('trava gravada: segredo errado ou nenhum é recusado no Tirar dúvida e no chat de venda', r.R6 === 'recusado,recusado,false', r);
  T.ok('trava gravada: o servidor (segredo certo) conta', r.R7 === 'true,true', r);
  T.ok('as tentativas de fora não gastaram a cota do pet shop (só a pergunta do servidor contou)', r.R8 === '1', r);
  T.ok('ninguém de fora grava a trava (só a chave de serviço)', !!(await anon.rpc('servidor_segredo_registrar', { p_segredo: SEG })).error && !!(await a.rpc('servidor_segredo_registrar', { p_segredo: SEG })).error);
  T.ok('ninguém de fora chama servidor_segredo_ok / confere', !!(await anon.rpc('servidor_segredo_ok', { p_segredo: SEG })).error && !!(await a.rpc('servidor_segredo_confere', { p_segredo: SEG })).error);
  const est = await anon.rpc('servidor_segredo_estado', { p_segredo: 'x'.repeat(40) });
  T.ok('servidor_segredo_estado só diz sem_trava / errado a quem não tem o segredo', ['sem_trava', 'errado'].includes(est.data), est.error?.message ?? est.data);
  T.recusa('dono de pet shop não liga a trava pelo painel', await a.rpc('admin_servidor_segredo', { p_segredo: SEG }), /restrito/i);

  // ───────────────────────── M4
  T.secao('M4: Cakto, pagamento só pelo e-mail');
  const CK = `segredo-cakto-${A.suf}`;
  const ev = (email, pedido, extra = '') => `public.cakto_evento('${CK}', 'purchase_approved', '${email}', null, '{"pedido":"${pedido}"}'::jsonb${extra})`;
  r = ensaio(`
    ${config('cakto_segredo_gestao_sha256', `encode(extensions.digest('${CK}', 'sha256'), 'hex')`)}
    delete from public.config_interna where chave = 'cakto_produto_gestao';
    delete from public.emails_confirmados where user_id = '${uidA}';
    select 'R1=' || ${ev(A.emails.dono, `p1-${A.suf}`)};
    select 'R2=' || (select status from public.petshops where id = '${A.P}') || ',' || (select count(*) from public.cakto_eventos where payload ->> 'sem_prova' = '${A.P}' and petshop_id is null);
    insert into public.emails_confirmados (user_id, email) values ('${uidA}', '${A.emails.dono}');
    select 'R3=' || (select status from public.petshops where id = '${A.P}') || ',' || (select count(*) from public.cakto_eventos where petshop_id = '${A.P}' and payload ->> 'ligado_por_prova' = '${uidA}');
    select 'R4=' || ${ev(Bl.emails.dono, `p2-${A.suf}`)} || ',' || (select status from public.petshops where id = '${Bl.P}');
    select 'R5=' || ${ev(A.emails.dono, `p3-${A.suf}`)};
    select 'R6=' || public.cakto_evento('errado', 'purchase_approved', '${A.emails.dono}', null, '{"pedido":"p4-${A.suf}"}'::jsonb);`);
  T.ok('e-mail do dono sem prova: o pagamento fica como "sem conta"', r.R1 === 'sem_conta', r);
  T.ok('sem prova: o pet shop continua em teste e o aviso guarda o pet shop provável', r.R2 === 'teste,1', r);
  T.ok('o dono provou o e-mail: o pagamento que esperava liga sozinho (pet shop ativo)', r.R3 === 'ativa,1', r);
  T.ok('outro pet shop (dono sem prova) não é liberado pelo e-mail', r.R4 === 'sem_conta,teste', r);
  T.ok('e-mail provado: o pagamento pelo e-mail liga direto', r.R5 === 'ok', r);
  T.ok('segredo errado continua recusado', r.R6 === 'recusado', r);
  r = ensaio(`
    ${config('cakto_segredo_gestao_sha256', `encode(extensions.digest('${CK}', 'sha256'), 'hex')`)}
    delete from public.config_interna where chave = 'cakto_produto_gestao';
    delete from public.emails_confirmados where user_id = '${uidA}';
    insert into public.cakto_callbacks (petshop_id, ficha) values ('${A.P}', '${'ab'.repeat(16)}') on conflict do nothing;
    update public.cakto_callbacks set ficha = '${'ab'.repeat(16)}' where petshop_id = '${A.P}';
    select 'R1=' || ${ev(A.emails.dono, `p5-${A.suf}`, `, null, '${A.P}.${'ab'.repeat(16)}'`)};
    select 'R2=' || (select status from public.petshops where id = '${A.P}');`);
  T.ok('compra pelo link do aplicativo (callback assinado) não precisa da prova do e-mail', r.R1 === 'ok' && r.R2 === 'ativa', r);

  // ───────────────────────── L1
  T.secao('L1: clientes, pets e saúde por área');
  const tos = A.sb.tosador, mon = A.sb.monitor, cx = A.sb.caixa, estq = A.sb.estoque;
  const tutor = A.tutores.Ana, pet = A.pets.Thor;
  B.must(await a.from('pets_saude').insert({ petshop_id: A.P, pet_id: pet, tipo: 'vacina', nome: 'V10', aplicado_em: A.hoje }).select('id'), 'vacina');
  T.ok('só Estoque: não lê tutores', (await n(estq.from('clientes').select('id, nome, telefone').eq('petshop_id', A.P))) === 0);
  T.ok('só Estoque: não lê pets nem saúde', (await n(estq.from('pets').select('id').eq('petshop_id', A.P))) === 0 && (await n(estq.from('pets_saude').select('id').eq('petshop_id', A.P))) === 0);
  T.recusa('só Estoque: não cadastra tutor', await estq.from('clientes').insert({ petshop_id: A.P, nome: 'Invasor' }).select('id'));
  T.ok('só Estoque: não muda tutor', (await n(estq.from('clientes').update({ nome: 'x' }).eq('id', tutor).select('id'))) !== 1);
  T.ok('monitor(a) (Clientes + Creche): lê e edita o tutor', (await n(mon.from('clientes').select('id').eq('petshop_id', A.P))) >= 1 && (await n(mon.from('clientes').update({ obs: 'prefere WhatsApp' }).eq('id', tutor).select('id'))) === 1);
  // tosador só com a Agenda (sem a chave Clientes)
  B.sql(`update profissionais set acessos = '{agenda}' where id = '${A.ids.tosador}'`);
  T.ok('só Agenda: lê o nome e o telefone dos tutores (precisa para atender e marcar)', (await n(tos.from('clientes').select('id, nome, telefone').eq('petshop_id', A.P))) >= 1);
  T.ok('só Agenda: lê os pets com o tutor junto', ((await tos.from('pets').select('id, nome, clientes(nome, telefone)').eq('id', pet).single()).data?.clientes?.nome ?? '') !== '');
  T.recusa('só Agenda: não edita o cadastro do tutor, e lê o motivo em português', await tos.from('clientes').update({ telefone: '11999990000' }).eq('id', tutor).select('id'), /área Clientes/);
  T.ok('… o telefone do tutor não mudou', B.sql(`select coalesce(telefone, '') from clientes where id = '${tutor}'`) !== '11999990000');
  T.ok('só Agenda: cadastra tutor e pet novos ao marcar', (await n(tos.from('clientes').insert({ petshop_id: A.P, nome: 'Tutor Novo', telefone: '11988887777' }).select('id'))) === 1);
  T.ok('só Agenda: ajusta o porte do pet (formulário do horário)', (await n(tos.from('pets').update({ porte: 'M' }).eq('id', pet).select('id'))) === 1);
  T.ok('só Agenda: lê a saúde do pet que atende', (await n(tos.from('pets_saude').select('id').eq('pet_id', pet))) === 1);
  // só o Caixa: lê (vende e cobra), mas do tutor só mexe no limite do fiado
  B.sql(`update profissionais set acessos = '{caixa,financeiro}', ve_financeiro = true where id = '${A.ids.monitor}'`);
  T.ok('Caixa e Financeiro: lê os tutores', (await n(mon.from('clientes').select('id').eq('petshop_id', A.P))) >= 1);
  T.recusa('Caixa e Financeiro: não muda o nome do tutor', await mon.from('clientes').update({ nome: 'Outro Nome' }).eq('id', tutor).select('id'), /área Clientes/);
  T.passa('Caixa e Financeiro: muda o limite do fiado', await mon.from('clientes').update({ limite_fiado: 150 }).eq('id', tutor).select('id'), B.sql(`select limite_fiado from clientes where id = '${tutor}'`) === '150.00');
  T.ok('Caixa e Financeiro: não mexe na saúde do pet', (await n(mon.from('pets_saude').update({ nome: 'x' }).eq('pet_id', pet).select('id'))) !== 1 && (await n(mon.from('pets_saude').select('id').eq('pet_id', pet))) === 0);
  T.ok('recepção (Clientes): edita o tutor', (await n(cx.from('clientes').update({ obs: 'ok' }).eq('id', tutor).select('id'))) === 1);
  T.ok('dono: edita o tutor', (await n(a.from('clientes').update({ obs: 'dono' }).eq('id', tutor).select('id'))) === 1);
  T.ok('outro pet shop continua sem ler', (await n(b.from('clientes').select('id').eq('petshop_id', A.P))) === 0);

  // ───────────────────────── L2
  T.secao('L2: aceite só de versão conhecida');
  const Doc = lib('documentos');
  const v = Doc.aceiteDoCadastro();
  T.recusa('versão inventada (99.9) é recusada', await a.rpc('aceitar_documentos', { p_termos: '99.9', p_privacidade: '99.9' }), /Versão inválida/);
  T.recusa('uma versão certa e outra inventada: recusa as duas', await a.rpc('aceitar_documentos', { p_termos: v.termos, p_privacidade: '7.0' }), /Versão inválida/);
  T.passa('a versão em vigor é aceita', await a.rpc('aceitar_documentos', { p_termos: v.termos, p_privacidade: v.privacidade }));
  T.ok('nenhum aceite de versão inventada ficou gravado', B.num(`select count(*) from aceites where user_id = '${uidA}' and versao in ('99.9', '7.0')`) === 0);
  const naTabela = (d) => B.num(`select count(*) from documentos_versoes where documento = '${d}' and versao = '${Doc.DOCUMENTOS[d].versao}'`) === 1;
  T.ok('as versões do código (documentos.ts) estão na tabela documentos_versoes (subiu a versão? ponha a linha numa migração)', naTabela('termos') && naTabela('privacidade'), v);
  const [maior, menor] = B.sql(`select split_part(versao, '.', 1) || '|' || split_part(versao, '.', 2) from documentos_versoes where documento = 'termos' order by split_part(versao, '.', 1)::int desc, split_part(versao, '.', 2)::int desc limit 1`).split('|').map(Number);
  r = ensaio(`select 'R1=' || public.documento_versao_ok('termos', '${maior}.${menor + 1}') || ',' || public.documento_versao_ok('termos', '${maior + 1}.0') || ',' || public.documento_versao_ok('termos', '${maior}.${menor + 2}') || ',' || public.documento_versao_ok('termos', '${maior + 2}.0') || ',' || public.documento_versao_ok('termos', 'x y');`);
  T.ok('folga de uma versão: a seguinte passa (o código pode subir antes da migração), duas à frente não', r.R1 === 'true,true,false,false,false', r);
  T.ok('a tabela de versões não é lida nem gravada pela API', ((await a.from('documentos_versoes').select('*')).data ?? []).length === 0 && !!(await a.from('documentos_versoes').insert({ documento: 'termos', versao: '9.9' })).error);

  // ───────────────────────── L3
  T.secao('L3: IP do aceite da entrada');
  const TOKEN = 'e'.repeat(64);
  // a tabela entradas tem um formato próprio de link: usa o caminho de verdade (entrada_salvar + entrada_link)
  const iniE = B.instante(A.dia(1), '11:00', A.fuso);
  const agE = B.must(await a.from('agendamentos').insert({ petshop_id: A.P, pet_id: pet, servico_id: A.S.Banho, inicio: iniE.toISOString(), fim: new Date(+iniE + 36e5).toISOString() }).select('id').single(), 'horário da entrada').id;
  const ent = await tos.rpc('entrada_salvar', { p_petshop: A.P, p_id: null, p_pet: pet, p_agendamento: agE, p_estadia: null, p_dados: { temperamento: ['calmo'], termo: 'Conferi.' }, p_fotos: [] });
  if (ent.error) T.ok('entrada de teste criada', false, ent.error.message);
  else {
    const lk = B.must(await tos.rpc('entrada_link', { p_id: ent.data.id, p_fotos: [] }), 'link da entrada');
    r = ensaio(`
      delete from public.config_interna where chave = 'servidor_segredo_sha256';
      select public.servidor_segredo_registrar('${SEG}');
      select set_config('request.headers', '{"x-forwarded-for":"198.51.100.7, 10.0.0.1","user-agent":"teste"}', true);
      ${comoAnon}
      select 'R1=' || (public.entrada_aceitar('${lk.token}', 'Ana Souza', '203.0.113.9', 'Celular', 'segredo-errado') ->> 'ja_estava');
      reset role;
      select 'R2=' || coalesce((select aceite_ip from public.entradas where id = '${ent.data.id}'), '-');`);
    T.ok('sem o segredo do servidor: o IP inventado por quem chama não é gravado (fica o que o banco vê)', r.R1 === 'false' && r.R2 === '198.51.100.7', r);
    r = ensaio(`
      delete from public.config_interna where chave = 'servidor_segredo_sha256';
      select public.servidor_segredo_registrar('${SEG}');
      select set_config('request.headers', '{"x-forwarded-for":"198.51.100.7"}', true);
      ${comoAnon}
      select 'R1=' || (public.entrada_aceitar('${lk.token}', 'Ana Souza', '203.0.113.9', 'Celular', '${SEG}') ->> 'ja_estava');
      reset role;
      select 'R2=' || coalesce((select aceite_ip from public.entradas where id = '${ent.data.id}'), '-');`);
    T.ok('com o segredo do servidor: vale o IP que o servidor viu', r.R1 === 'false' && r.R2 === '203.0.113.9', r);
    T.passa('quem chama com os quatro parâmetros de antes continua funcionando', await anon.rpc('entrada_aceitar', { p_token: lk.token, p_nome: 'Ana Souza', p_ip: '203.0.113.9', p_navegador: 'Celular' }));
    T.ok('…e o IP gravado não é o que foi mandado de fora', B.sql(`select coalesce(aceite_ip, '-') from entradas where id = '${ent.data.id}'`) !== '203.0.113.9');
  }

  // ───────────────────────── freio de lojas novas
  T.secao('loja nova: freio por rede e por dia');
  const cab = (ip) => `select set_config('request.headers', '{"cf-connecting-ip":"${ip}"}', true);`;
  r = ensaio(`
    ${config('lojas_por_rede_dia', "'2'")}
    ${cab('198.51.100.77')}
    select 'R1=' || public.loja_nova_frear() || ',' || public.loja_nova_frear() || ',' || public.loja_nova_frear();
    ${cab('198.51.100.78')}
    select 'R2=' || public.loja_nova_frear();
    ${cab('192.168.1.20')}
    select 'R3=' || public.loja_nova_frear() || ',' || public.loja_nova_frear() || ',' || public.loja_nova_frear();
    ${cab('198.51.100.77')}
    ${como(uidB)}
    do $$ begin perform public.criar_petshop('Loja Demais', 'Fulano'); raise exception 'passou'; exception when others then raise notice 'R4=%', sqlerrm; end $$;`);
  T.ok('a mesma rede: duas lojas no dia passam, a terceira não', r.R1 === 'true,true,false', r);
  T.ok('outra rede não é afetada', r.R2 === 'true', r);
  T.ok('rede interna (testes, rede local) não entra na conta', r.R3 === 'true,true,true', r);
  const msg = (() => { try { B.sql(`begin; ${config('lojas_por_rede_dia', "'1'")} ${cab('198.51.100.79')} select public.loja_nova_frear(); ${como(uidB)} select public.criar_petshop('Loja Demais', 'Fulano'); rollback;`); return 'passou'; } catch (e) { return String(e.stderr ?? e.message); } })();
  T.ok('criar_petshop recusa com uma frase simples quando a rede passou do limite', /Muitos cadastros saíram desta rede/.test(msg), msg.slice(0, 200));
  T.ok('a tabela do freio não é lida pela API', ((await a.from('lojas_novas_rede').select('*')).data ?? []).length === 0);

  // ───────────────────────── fotos
  T.secao('fotos: nome de arquivo com formato fixo (pets e diário)');
  const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
  const sobe = (nome) => a.storage.from('pets').upload(nome, JPG, { contentType: 'image/jpeg' });
  const bom = `${A.P}/${B.uuid()}.jpg`;
  T.passa('foto do pet com o nome que o aplicativo usa', await sobe(bom));
  T.recusa('arquivo .html no bucket de fotos é recusado', await sobe(`${A.P}/pagina.html`));
  T.recusa('arquivo em subpasta inventada é recusado', await sobe(`${A.P}/a/b/c.jpg`));
  T.recusa('pasta de outro pet shop continua recusada', await sobe(`${Bl.P}/${B.uuid()}.jpg`));
  await a.storage.from('pets').remove([bom]);

  // ───────────────────────── M2 (servidor)
  T.secao('M2: cabeçalhos de segurança (servidor)');
  if (!(await B.servidorNoAr())) T.conhecido('servidor no ar para conferir os cabeçalhos', false, `sem servidor em ${B.BASE_URL}: rode com BASE_URL`);
  else {
    for (const caminho of ['/gestao/entrar', '/gestao', '/', '/api/gestao/vendas']) {
      const h = (await fetch(`${B.BASE_URL}${caminho}`, { redirect: 'manual' })).headers;
      const tem = h.get('x-content-type-options') === 'nosniff' && h.get('x-frame-options') === 'SAMEORIGIN' && h.get('referrer-policy') === 'strict-origin-when-cross-origin'
        && /frame-ancestors 'self'/.test(h.get('content-security-policy') ?? '');
      T.ok(`${caminho}: nosniff, não abre em página de outro site, endereço não vaza`, tem, Object.fromEntries(['x-content-type-options', 'x-frame-options', 'referrer-policy', 'content-security-policy'].map((k) => [k, h.get(k)])));
    }
    for (const caminho of ['/gestao/tutor/codigo-de-teste', '/gestao/entrada/codigo-de-teste/foto/0', '/gestao/orcamento/codigo-de-teste']) {
      const rp = (await fetch(`${B.BASE_URL}${caminho}`, { redirect: 'manual' })).headers.get('referrer-policy');
      T.ok(`${caminho}: página com código no endereço não manda o endereço para fora (no-referrer)`, rp === 'no-referrer', rp);
    }
    const h = (await fetch(`${B.BASE_URL}/gestao/entrar`)).headers;
    const pp = h.get('permissions-policy') ?? '', ro = h.get('content-security-policy-report-only') ?? '';
    T.ok('câmera e microfone liberados só para o próprio site; localização desligada', /camera=\(self\)/.test(pp) && /microphone=\(self\)/.test(pp) && /geolocation=\(\)/.test(pp), pp);
    T.ok('lista do que a página carrega em modo "só avisando" (não bloqueia nada ainda)', /default-src 'self'/.test(ro) && /report-uri \/api\/gestao\/csp/.test(ro) && !/default-src/.test(h.get('content-security-policy') ?? ''), ro);
    const sup = new URL(B.SUPABASE_URL).origin;
    T.ok('a lista libera o Supabase (dados, fotos e tempo real), o pixel da Meta e imagens em blob/data', ro.includes(`connect-src 'self' ${sup} ${sup.replace(/^http/, 'ws')}`) && new RegExp(`img-src [^;]*blob:[^;]*${sup.replace(/[.:/]/g, '\\$&')}`).test(ro) && /script-src [^;]*connect\.facebook\.net/.test(ro) && /worker-src 'self' blob:/.test(ro), ro);
    const aviso = await fetch(`${B.BASE_URL}/api/gestao/csp`, { method: 'POST', headers: { 'content-type': 'application/csp-report' }, body: JSON.stringify({ 'csp-report': { 'effective-directive': 'script-src', 'blocked-uri': 'https://exemplo.invalid/x.js', 'document-uri': `${B.BASE_URL}/gestao/c/segredo-do-link/pagina` } }) });
    T.ok('a rota dos avisos recebe e responde 204 (também com corpo estranho)', aviso.status === 204 && (await fetch(`${B.BASE_URL}/api/gestao/csp`, { method: 'POST', body: 'não é json' })).status === 204, aviso.status);

    T.secao('H2 pela rota: conta só para consulta não usa o Mozart');
    const { data: s } = await a.auth.getSession();
    const pedir = () => fetch(`${B.BASE_URL}/api/gestao/assistente`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${s.session.access_token}` },
      body: JSON.stringify({ petshopId: A.P, texto: 'quantos clientes eu tenho?', agora: `${A.hoje}T10:00`, fusoMin: -180, mensagens: [] }) });
    B.sql(`update petshops set status = 'cancelada', pago_ate = null where id = '${A.P}'`);
    const fechado = await pedir(); const jf = await fechado.json().catch(() => null);
    T.ok('assinatura cancelada: a rota responde 403 "so_consulta" com uma frase simples, sem chamar a IA', fechado.status === 403 && jf?.erro === 'so_consulta' && /só para consulta/.test(jf?.mensagem ?? '') && /Assinatura/.test(jf?.mensagem ?? ''), jf);
    T.ok('…e nada foi contado no dia', B.num(`select coalesce(sum(pedidos + chamadas), 0) from assistente_uso where petshop_id = '${A.P}'`) === 0);
    B.sql(`update petshops set status = 'teste' where id = '${A.P}'; insert into assistente_uso (petshop_id, canal, dia, pedidos, chamadas) values ('${A.P}', 'mozart', (now() at time zone 'America/Sao_Paulo')::date, 100000, 0) on conflict (petshop_id, canal, dia) do update set pedidos = 100000;`);
    const cheio = await pedir(); const jc = await cheio.json().catch(() => null);
    T.ok('limite do dia do pet shop em teste: 429 com o aviso do período de teste (renova amanhã, as telas seguem; migração 20261248)', cheio.status === 429 && jc?.erro === 'limite' && /limite do período de teste: \d+ pedidos ao Mozart por dia\. Amanhã renova/.test(jc?.mensagem ?? '') && /telas continuam funcionando pelos botões/.test(jc?.mensagem ?? ''), jc);
    const grande = await fetch(`${B.BASE_URL}/api/gestao/assistente`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${s.session.access_token}` },
      body: JSON.stringify({ petshopId: A.P, texto: 'oi', agora: `${A.hoje}T10:00`, fusoMin: -180, mensagens: Array.from({ length: 300 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(7000) })) }) });
    T.ok('histórico enorme mandado pelo navegador não derruba a rota (é cortado antes de ir à IA; aqui o limite do dia responde)', grande.status === 429, grande.status);
  }
}))();
