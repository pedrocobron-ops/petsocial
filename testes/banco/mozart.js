// Mozart e o dinheiro dos clientes, com um modelo de mentira (roteiro fixo, sem chamar a API): as ferramentas e as voltas da
// conversa (src/lib/gestao/assistente/conversa.ts) rodam de verdade, com o login de cada papel e as regras do banco.
//  - "o dono do Bob me pagou os 35" com duas contas abertas (5 + 30): lancar_dinheiro recusa, receber_de_cliente mostra o cartão
//    e quita as duas; o mês ganha 35 uma vez só; o toque duplo não recebe de novo.
//  - pagamento em parte, pagou a mais (pergunta; com sobra "credito" fica de crédito), anotar_divida ligada ao tutor,
//    quem_me_deve por pessoa, papéis (quem não mexe com dinheiro não usa nem pela conversa forjada nem pela função do banco),
//    e o teto de voltas e de tempo.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('mozart');
const F = lib('assistente/ferramentas');
const C = lib('assistente/conversa');
const R = lib('reservado');
const A = lib('acessos');

let seq = 0;
// o real formatado usa espaço que não quebra ("R$\u00a035,00"): as conferências comparam com espaço comum
const n = (x) => JSON.parse(JSON.stringify(x).replace(/\u00a0/g, ' '));
const resp = (content, stop_reason = 'tool_use') => ({ content, stop_reason });
const usar = (name, input) => resp([{ type: 'tool_use', id: `toolu_t${Date.now().toString(36)}${++seq}`, name, input }]);
const falar = (text) => resp([{ type: 'text', text }], 'end_turn');
/** O último resultado de ferramenta que o "modelo" recebeu. */
const ultimoResultado = (msgs) => {
  const m = msgs[msgs.length - 1];
  const r = Array.isArray(m.content) ? m.content.filter((b) => b.type === 'tool_result') : [];
  return r[r.length - 1] || null;
};

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Mozart' });
  const { dono } = L.sb;
  const P = L.P;

  async function contexto(papel) {
    const sb = L.sb[papel];
    const u = (await sb.auth.getUser()).data.user;
    const [p, e, s] = await Promise.all([R.lerPetshop(sb, P), R.lerEquipe(sb, P), R.lerServicos(sb, P)]);
    const eu = (e.data || []).find((x) => x.user_id === u.id && x.ativo);
    return {
      sb, userId: u.id, petshop: p.data, eu, equipe: e.data || [], servicos: s.data || [],
      vejoFinanceiro: A.podeArea(eu, 'caixa') || A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'),
      cuidoDoFinanceiro: A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'),
      fusoMin: -180, agora: `${L.hoje}T10:00`,
    };
  }
  const conta = async (cliente, valor, descricao, venc) => B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor, categoria: 'Banho e tosa', descricao, data: venc, vencimento: venc, pago: false, cliente_id: cliente, origem: 'tela' }).select('id').single(), 'conta ' + descricao).id;
  const entrouNoMes = () => B.num(`select coalesce(sum(valor),0) from lancamentos where petshop_id='${P}' and tipo='entrada' and pago and movimento is null and data >= '${L.mes1}'`);
  const deve = (cliente) => B.num(`select coalesce(sum(valor),0) from lancamentos where petshop_id='${P}' and tipo='entrada' and not pago and cliente_id='${cliente}'`);
  const pergunta = (texto) => [{ role: 'user', content: [{ type: 'text', text: texto }] }];
  const semContar = async () => true;

  const cDono = await contexto('dono');
  const beto = L.tutores.Beto, ana = L.tutores.Ana, clara = L.tutores.Clara;
  const c5 = await conta(beto, 5, 'Diferença do banho', L.dia(-3));
  const c30 = await conta(beto, 30, 'Taxa de falta', L.dia(-1));
  const c60 = await conta(clara, 60, 'Banho da Luna', L.dia(-2));

  T.secao('Neide: "o dono do bob me pagou os 35 em dinheiro" (contas de 5 + 30 abertas)');
  const antes = entrouNoMes();
  const vistos = [];
  const roteiro = async (msgs) => {
    const r = ultimoResultado(msgs);
    vistos.push(r);
    if (vistos.length === 1) return usar('buscar_pets', { termo: 'bob' });
    // o modelo "erra" de propósito: tenta lançar uma entrada solta
    if (vistos.length === 2) return usar('lancar_dinheiro', { tipo: 'entrada', valor: 35, forma: 'dinheiro', categoria: 'Outros', descricao: 'Pagamento do dono do Bob' });
    if (vistos.length === 3) return usar('receber_de_cliente', { cliente_id: beto, valor: 35, forma: 'dinheiro' });
    return falar('Prontinho.');
  };
  const msgs = pergunta('o dono do bob me pagou os 35 em dinheiro');
  const s1 = await C.voltas({ c: cDono, mensagens: msgs, liberado: true, chamar: roteiro, contar: semContar });
  const busca = n(JSON.parse(vistos[1].content));
  vistos[2] = n(vistos[2]);
  T.ok('buscar_pets diz quanto o tutor deve', busca.pets[0].tutor_deve === 'R$ 35,00 em 2 contas' && busca.pets[0].cliente_id === beto, busca.pets[0]);
  T.ok('lancar_dinheiro recusa a entrada solta e manda usar receber_de_cliente', vistos[2].is_error && /receber_de_cliente/.test(vistos[2].content) && /R\$ 35,00 em 2 contas/.test(vistos[2].content), vistos[2]);
  T.ok('para no cartão de receber (nada gravado ainda)', s1.tipo === 'ok' && s1.propostas.length === 1 && s1.propostas[0].ferramenta === 'receber_de_cliente' && entrouNoMes() === antes, s1.propostas);
  const card = n(s1.propostas[0].resumo);
  T.ok('o cartão: "Beto deve R$ 35,00 (2 contas). Receber R$ 35,00 em dinheiro e quitar as duas?"', card.titulo === 'Receber de Beto' && card.linhas[0][1] === 'Beto deve R$ 35,00 (2 contas). Receber R$ 35,00 em dinheiro e quitar as duas?', card);
  T.ok('o cartão lista a mais antiga primeiro e diz que não fica devendo nada', card.linhas[2][0] === '· Diferença do banho' && card.linhas[3][0] === '· Taxa de falta' && card.linhas.some(([k, v]) => k === 'Fica devendo' && v === 'nada'), card.linhas);
  const pend = s1.mensagens[s1.mensagens.length - 1].content.filter((b) => b.type === 'tool_use');
  const g = await C.responderCartoes({ c: cDono, pendentes: pend, liberado: true, decisoes: [{ id: pend[0].id, ok: true }] });
  T.ok('confirmado: recebeu', g.mudou && /"feito":true/.test(g.resultados[0].content) && !g.resultados[0].is_error, g.resultados);
  T.ok('as duas contas ficaram pagas', B.num(`select count(*) from lancamentos where id in ('${c5}','${c30}') and pago`) === 2);
  T.ok('Beto não deve mais nada', deve(beto) === 0);
  T.ok('o mês ganhou R$ 35 uma vez só (nenhuma entrada solta)', Math.round((entrouNoMes() - antes) * 100) === 3500, { antes, depois: entrouNoMes() });
  T.ok('nenhum lançamento "Outros" de R$ 35', B.num(`select count(*) from lancamentos where petshop_id='${P}' and valor=35 and categoria='Outros'`) === 0);
  const g2 = await C.responderCartoes({ c: cDono, pendentes: pend, liberado: true, decisoes: [{ id: pend[0].id, ok: true }] });
  T.ok('o mesmo "Pode fazer" de novo não recebe outra vez', /repetido/.test(g2.resultados[0].content) && Math.round((entrouNoMes() - antes) * 100) === 3500, g2.resultados);

  T.secao('pagou só uma parte');
  const roteiroParte = async (msgs) => (ultimoResultado(msgs) ? falar('ok') : usar('receber_de_cliente', { cliente_id: clara, valor: 20, forma: 'pix' }));
  const s2 = await C.voltas({ c: cDono, mensagens: pergunta('a clara pagou 20 no pix'), liberado: true, chamar: roteiroParte, contar: semContar });
  const card2 = n(s2.propostas[0].resumo);
  T.ok('cartão: abate e fica faltando R$ 40', /Clara deve R\$ 60,00 \(1 conta\)\. Receber R\$ 20,00 no Pix e abater, ficando R\$ 40,00\?/.test(card2.linhas[0][1]), card2);
  const p2 = s2.mensagens[s2.mensagens.length - 1].content.filter((b) => b.type === 'tool_use');
  await C.responderCartoes({ c: cDono, pendentes: p2, liberado: true, decisoes: [{ id: p2[0].id, ok: true }] });
  T.ok('a conta ficou com R$ 40 e entrou uma parte de R$ 20', deve(clara) === 40 && B.num(`select count(*) from lancamentos where conta_id='${c60}' and pago and valor=20`) === 1);

  T.secao('pagou a mais');
  await conta(ana, 10, 'Laço', L.dia(-1));
  let erro = null;
  try { await F.descrever(cDono, 'receber_de_cliente', { cliente_id: ana, valor: 15, forma: 'dinheiro' }); } catch (e) { erro = n(e.message); }
  T.ok('sem dizer o que fazer com a sobra: não faz e pede para perguntar do crédito', erro && /deve só R\$ 10,00/.test(erro) && /crédito/.test(erro), erro);
  const cAna = await contexto('dono');
  cAna.chave = `mozart:teste-${L.suf}-sobra`;
  const r3 = await F.gravar(cAna, 'receber_de_cliente', { cliente_id: ana, valor: 15, forma: 'dinheiro', sobra: 'credito' });
  const saldo = B.must(await dono.rpc('credito_saldo', { p_petshop: P, p_cliente: ana }), 'saldo');
  T.ok('com sobra "credito": quita a conta e deixa R$ 5 de crédito', r3.feito && deve(ana) === 0 && Number(saldo) === 5, { r3, saldo });

  T.secao('anotar_divida: ligada ao tutor, como "Anotar o que X deve"');
  const roteiroAnota = async (msgs) => (ultimoResultado(msgs) ? falar('ok') : usar('anotar_divida', { cliente_id: ana, valor: 20, descricao: 'Perfume' }));
  const s4 = await C.voltas({ c: cDono, mensagens: pergunta('anota que a ana ficou me devendo 20 do perfume'), liberado: true, chamar: roteiroAnota, contar: semContar });
  T.ok('cartão "Anotar o que Ana deve"', s4.propostas[0]?.resumo.titulo === 'Anotar o que Ana deve', s4.propostas[0]);
  const p4 = s4.mensagens[s4.mensagens.length - 1].content.filter((b) => b.type === 'tool_use');
  await C.responderCartoes({ c: cDono, pendentes: p4, liberado: true, decisoes: [{ id: p4[0].id, ok: true }] });
  const linha = B.sql(`select cliente_id || '|' || categoria || '|' || vencimento || '|' || data || '|' || pago from lancamentos where petshop_id='${P}' and descricao='Perfume'`);
  T.ok('cliente_id da Ana, categoria Outros, vence em 7 dias, a receber', linha === `${ana}|Outros|${L.dia(7)}|${L.dia(7)}|false`, linha);
  // a mesma consulta da ficha do tutor e do Caixa, Contas de clientes (useContasDeClientes)
  const ficha = B.must(await L.sb.caixa.from('lancamentos').select('valor').eq('petshop_id', P).eq('pago', false).eq('tipo', 'entrada').eq('cliente_id', ana), 'ficha');
  T.ok('aparece na ficha da Ana para a recepção (Deve R$ 20)', ficha.length === 1 && Number(ficha[0].valor) === 20, ficha);

  T.secao('quem_me_deve: por pessoa');
  const q = JSON.parse((await F.rodarConsulta(cDono, 'quem_me_deve', {})).conteudo);
  T.ok('2 pessoas: Clara R$ 40 e Ana R$ 20, total R$ 60', q.pessoas === 2 && q.total_a_receber === 60 && q.devedores.find((d) => d.tutor === 'Clara Dias').deve === 40 && q.devedores.find((d) => d.tutor === 'Ana Souza').deve === 20, q);
  const ca = JSON.parse((await F.rodarConsulta(cDono, 'contas_em_aberto', {})).conteudo);
  T.ok('contas_em_aberto diz de quem é cada conta', ca.a_receber.every((x) => x.tutor), ca.a_receber);

  T.secao('lancar_dinheiro: só recusa quando parece dívida');
  const tenta = async (e) => { try { await F.descrever(cDono, 'lancar_dinheiro', { tipo: 'entrada', forma: 'pix', categoria: 'Outros', valor: 20, ...e }); return null; } catch (x) { return n(x.message); } };
  T.ok('com cliente_id de quem deve: recusa', /receber_de_cliente/.test(await tenta({ cliente_id: ana })));
  T.ok('a descrição cita o pet de quem deve: recusa', /receber_de_cliente/.test(await tenta({ descricao: 'pagamento da Luna' })));
  T.ok('com nao_e_divida: lança', (await tenta({ cliente_id: ana, nao_e_divida: true })) === null);
  T.ok('venda que não cita ninguém: lança', (await tenta({ descricao: 'Coleira vendida no balcão', categoria: 'Venda de produtos' })) === null);
  T.ok('cliente que não deve: lança', (await tenta({ cliente_id: L.tutores.Davi })) === null);

  T.secao('papéis');
  const cTosador = await contexto('tosador'), cMonitor = await contexto('monitor'), cCaixa = await contexto('caixa');
  const nomes = (c) => F.ferramentasPara(c).map((t) => t.name);
  T.ok('tosador e monitora não veem as ferramentas de dinheiro dos clientes', ['receber_de_cliente', 'anotar_divida', 'quem_me_deve'].every((n) => !nomes(cTosador).includes(n) && !nomes(cMonitor).includes(n)));
  T.ok('a recepção (caixa) vê', ['receber_de_cliente', 'anotar_divida', 'quem_me_deve'].every((n) => nomes(cCaixa).includes(n)));
  const forjado = [{ type: 'tool_use', id: `toolu_forjado${L.suf}`, name: 'receber_de_cliente', input: { cliente_id: clara, valor: 40, forma: 'dinheiro' } }];
  const gT = await C.responderCartoes({ c: cTosador, pendentes: forjado, liberado: true, decisoes: [{ id: forjado[0].id, ok: true }] });
  T.ok('conversa forjada pelo tosador: "Ferramenta indisponível", nada recebido', gT.resultados[0].is_error && /indisponível/.test(gT.resultados[0].content) && deve(clara) === 40, gT.resultados);
  const passos = [{ t: 'receber', conta: c60, valor: 40, forma: 'dinheiro' }];
  for (const papel of ['tosador', 'monitor', 'estoque']) {
    T.recusa(`${papel} chamando cliente_receber_contas direto: recusado`, await L.sb[papel].rpc('cliente_receber_contas', { p_petshop: P, p_cliente: clara, p_chave: `teste-${papel}-${L.suf}`, p_passos: passos }));
  }
  T.ok('a conta da Clara continua com R$ 40', deve(clara) === 40);
  T.recusa('conta de outro cliente: recusada', await L.sb.caixa.rpc('cliente_receber_contas', { p_petshop: P, p_cliente: ana, p_chave: `teste-outro-${L.suf}`, p_passos: passos }), /para este cliente/);
  T.recusa('crédito para outro cliente: recusado', await L.sb.caixa.rpc('cliente_receber_contas', { p_petshop: P, p_cliente: clara, p_chave: `teste-cred-${L.suf}`, p_passos: [...passos, { t: 'credito', cliente: ana, valor: 5 }] }), /próprio cliente/);
  T.recusa('outro passo (apagar conta): recusado', await L.sb.caixa.rpc('cliente_receber_contas', { p_petshop: P, p_cliente: clara, p_chave: `teste-apagar-${L.suf}`, p_passos: [...passos, { t: 'apagar_aberto', id: c60 }] }), /não vale/);
  cCaixa.chave = `mozart:teste-caixa-${L.suf}`;
  const rc = await F.gravar(cCaixa, 'receber_de_cliente', { cliente_id: clara, valor: 40, forma: 'dinheiro' });
  T.ok('a recepção recebe pelo Mozart', rc.feito && deve(clara) === 0, rc);

  T.secao('teto de voltas e de tempo');
  let chamadas = 0;
  const semFim = async () => { chamadas++; return usar('buscar_pets', { termo: 'thor' }); };
  const s8 = await C.voltas({ c: cDono, mensagens: pergunta('?'), liberado: true, chamar: semFim, contar: semContar });
  T.ok(`no máximo ${C.MAX_VOLTAS} chamadas e responde algo`, chamadas === C.MAX_VOLTAS && s8.cortou && s8.texto === C.DEMOROU, { chamadas, texto: s8.texto });
  chamadas = 0;
  let relogio = 0;
  const lento = async () => { chamadas++; relogio += 10_000; return usar('buscar_pets', { termo: 'thor' }); };
  const s9 = await C.voltas({ c: cDono, mensagens: pergunta('?'), liberado: true, chamar: lento, contar: semContar, relogio: () => relogio });
  T.ok('com chamadas de 10 s, para antes de 30 s', chamadas === 3 && s9.cortou, { chamadas });
  T.ok('o histórico termina num resultado de ferramenta (a próxima pergunta continua válida)', s9.mensagens[s9.mensagens.length - 1].role === 'user');
}))();
