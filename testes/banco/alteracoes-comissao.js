// Alterações em valores com lugar fixo e comissão linha por linha (migração 20261184):
// - desconto dado na conta do atendimento recebida em partes (pela função `agendamento_fechar_conta`, como a tela faz) fica anotado
//   na conta, e a parte recebida aponta para ela; o aviso de Hoje não mostra o que a própria pessoa fez, a lista por período mostra
//   (com "Todas"); a equipe sem financeiro não lê;
// - `comissao_extrato` dá as mesmas somas de Relatórios (`comissao_do_periodo`) e de "Minha comissão", linha por linha, conferido à mão;
//   quem não cuida do financeiro só vê a própria; a ferramenta ver_comissao do Mozart devolve o mesmo.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('alteracoes-comissao');
const D = lib('dinheiro');
const M = lib('assistente/ferramenta-comissao');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Alteracoes' });
  const { dono, caixa: cx, tosador: tos } = L.sb;
  const P = L.P;
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'abrir o caixa');

  // Thor (M): Banho e tosa 90 + Hidratação 30 = 120, com o tosador (40%)
  const ini = B.instante(L.hoje, '09:00', L.fuso);
  const ag = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Thor, servico_id: L.S['Banho e tosa'], profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 90 * 6e4).toISOString(), preco: 90 }).select('id').single(), 'horário').id;
  B.must(await dono.rpc('agendamento_servicos_definir', { p_agendamento: ag, p_servicos: [{ servico_id: L.S['Hidratação'], preco: 30 }] }), 'hidratação');

  T.secao('desconto na conta recebida em partes (a dona fecha a conta, como a tela)');
  // a mesma lista de passos de comanda.tsx (receberParte): a conta inteira a receber, a parte paga agora e o atendimento concluído
  const chave = D.novaChaveDeOperacao();
  const itens = [
    { tipo: 'servico', nome: 'Banho e tosa', qtd: 1, valor: 90, servico_id: L.S['Banho e tosa'] },
    { tipo: 'servico', nome: 'Hidratação', qtd: 1, valor: 30, servico_id: L.S['Hidratação'] },
  ];
  const passos = [
    { t: 'sem_recebimento', agendamento: ag },
    { t: 'lancamento', nome: 'conta', chave: D.parteDaChave(chave, 'conta'), linha: { tipo: 'entrada', valor: 113.6, forma: null, categoria: 'Banho e tosa', descricao: 'Banho e tosa + Hidratação · Thor', data: L.dia(3), vencimento: L.dia(3), pago: false, agendamento_id: ag, cliente_id: L.tutores.Ana, itens } },
    { t: 'agendamento', id: ag, status: 'concluido' },
    { t: 'receber', conta: '$ref:conta', valor: 100, forma: 'debito', chave: D.parteDaChave(chave, 'parte') },
  ];
  const feito = B.must(await dono.rpc('agendamento_fechar_conta', { p_petshop: P, p_agendamento: ag, p_chave: chave, p_passos: passos }), 'fechar a conta');
  const conta = feito.ids.conta;
  const anot = JSON.parse(B.sql(`select coalesce(json_agg(json_build_object('tipo', tipo, 'de', de, 'para', para, 'lanc', lancamento_id)), '[]') from precos_alterados where petshop_id='${P}'`));
  T.ok('o desconto de R$ 6,40 fica anotado (tipo desconto, de 120,00 para 113,60) na conta', anot.length === 1 && anot[0].tipo === 'desconto' && Number(anot[0].de) === 120 && Number(anot[0].para) === 113.6 && anot[0].lanc === conta, anot);
  const parte = JSON.parse(B.sql(`select row_to_json(x) from (select id, valor, conta_id, pago from lancamentos where petshop_id='${P}' and conta_id='${conta}') x`));
  T.ok('a parte de R$ 100,00 entrou e aponta para a conta (é por ela que o lançamento mostra o desconto)', parte && Number(parte.valor) === 100 && parte.pago === true && parte.conta_id === conta, parte);
  T.ok('a conta fica com R$ 13,60 a receber e lembra o valor cheio (113,60)', B.sql(`select valor || '|' || valor_original || '|' || pago from lancamentos where id='${conta}'`) === '13.60|113.60|false');
  // o que a tela do lançamento pede (PrecosMudados): lancamento_id in (parte, conta)
  const naTela = B.must(await dono.from('precos_alterados').select('tipo, de, para').eq('petshop_id', P).in('lancamento_id', [parte.id, conta]), 'preço e desconto da parte');
  T.ok('… a parte mostra "Desconto de R$ 6,40" (pela conta dela)', naTela.length === 1 && naTela[0].tipo === 'desconto');

  T.secao('Alterações em valores: Hoje (só a equipe) e Financeiro (período, com as minhas)');
  // sem a trava, a recepção vende com desconto: é uma alteração "da equipe" para a dona
  const venda = B.must(await cx.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 25, forma: 'pix', categoria: 'Venda de produtos', data: L.hoje, pago: true, origem: 'tela', itens: [{ tipo: 'produto', nome: 'Shampoo Neutro', qtd: 1, valor: 29.9, produto_id: L.prod }] }).select('id'), 'venda da recepção')[0].id;
  const hoje = B.must(await dono.rpc('alteracoes_de_valores', { p: P, p_todas: true }), 'Hoje');
  T.ok('Hoje (aviso): só o desconto da recepção, não o da própria dona', hoje.length === 1 && hoje[0].tipo === 'desconto' && /Shampoo|Venda/.test(hoje[0].descricao), hoje.map((x) => x.descricao));
  const desde = new Date(Date.now() - 864e5).toISOString(), ate = new Date(Date.now() + 6e4).toISOString();
  const so = B.must(await dono.rpc('alteracoes_do_periodo', { p: P, p_desde: desde, p_ate: ate, p_minhas: false }), 'só da equipe');
  const todas = B.must(await dono.rpc('alteracoes_do_periodo', { p: P, p_desde: desde, p_ate: ate, p_minhas: true }), 'todas');
  T.ok('Financeiro › Alterações, "Só da equipe": 1 (o da recepção)', so.length === 1 && so[0].minha === false && so[0].lancamento_id === venda, so);
  T.ok('"Todas (inclui as minhas)": 2, com o desconto da dona marcado como dela e ligado à conta', todas.length === 2 && todas.some((x) => x.minha && x.tipo === 'desconto' && Number(x.de) === 120 && Number(x.para) === 113.6 && x.lancamento_id === conta), todas);
  const cxId = B.sql(`select id from caixas where petshop_id='${P}'`);
  T.ok('o número do caixa (caixa_alteracoes) é o mesmo de "Todas" no período do caixa', Number(B.must(await dono.rpc('caixa_alteracoes', { p_caixa: cxId }), 'caixa_alteracoes')) === 2);
  const antes = B.must(await dono.rpc('alteracoes_do_periodo', { p: P, p_desde: new Date(Date.now() - 3 * 864e5).toISOString(), p_ate: new Date(Date.now() - 2 * 864e5).toISOString(), p_minhas: true }), 'outro período');
  T.ok('fora do período não aparece', antes.length === 0);
  T.ok('a recepção (opera o caixa, sem Financeiro) não lê a lista', ((await cx.rpc('alteracoes_do_periodo', { p: P, p_desde: desde, p_ate: ate, p_minhas: true })).data ?? []).length === 0);
  T.ok('o tosador não lê a lista', ((await tos.rpc('alteracoes_do_periodo', { p: P, p_desde: desde, p_ate: ate, p_minhas: true })).data ?? []).length === 0);
  T.ok('o tosador não lê precos_alterados direto', ((await tos.from('precos_alterados').select('id').eq('petshop_id', P)).data ?? []).length === 0);

  T.secao('comissão linha por linha');
  // à mão: 113,60 repartido pelo peso de cada serviço (90 : 30) = 85,20 + 28,40; 40% de cada = 34,08 + 11,36 = 45,44
  const ext = B.must(await dono.rpc('comissao_extrato', { p_petshop: P, p_de: L.mes1, p_ate: L.hoje }), 'extrato');
  const t = ext.find((x) => x.profissional_id === L.ids.tosador);
  const linhas = (t?.linhas ?? []).map((l) => `${l.servico}|${l.base}|${l.pct}|${l.valor}`).sort();
  T.ok('Thor: Banho e tosa 85,20 × 40% = 34,08 e Hidratação 28,40 × 40% = 11,36', JSON.stringify(linhas) === JSON.stringify(['Banho e tosa|85.2|40|34.08', 'Hidratação|28.4|40|11.36']), linhas);
  T.ok('… com o pet e o dia em cada linha', t?.linhas.every((l) => l.pet === 'Thor' && l.agendamento_id === ag));
  const rel = B.must(await dono.rpc('comissao_do_periodo', { p_petshop: P, p_de: L.mes1, p_ate: L.hoje }), 'Relatórios').find((x) => x.profissional_id === L.ids.tosador);
  T.ok('total R$ 45,44 = Relatórios (comissao_do_periodo) = soma das linhas', Number(t.comissao) === 45.44 && Number(rel.comissao) === 45.44 && B.centavos(t.linhas.reduce((s, l) => s + Number(l.valor), 0)) === 4544, { extrato: t.comissao, rel: rel.comissao });
  const minha = B.must(await tos.rpc('minha_comissao', { p_petshop: P }), 'minha comissão');
  T.ok('"Minha comissão" do tosador: o mesmo R$ 45,44', Number(minha.meses[0].comissao) === 45.44);
  const doTos = B.must(await tos.rpc('comissao_extrato', { p_petshop: P, p_de: L.mes1, p_ate: L.hoje, p_profissional: L.ids.caixa }), 'extrato do tosador');
  T.ok('o tosador pede o extrato de outra pessoa e recebe só o dele', doTos.length === 1 && doTos[0].profissional_id === L.ids.tosador && Number(doTos[0].comissao) === 45.44, doTos.map((x) => x.nome));
  const doCx = B.must(await cx.rpc('comissao_extrato', { p_petshop: P, p_de: L.mes1, p_ate: L.hoje }), 'extrato da recepção');
  T.ok('a recepção (sem Financeiro) não vê a comissão do tosador', doCx.every((x) => x.profissional_id === L.ids.caixa), doCx.map((x) => x.nome));
  T.recusa('anônimo não lê o extrato', await B.cliente().rpc('comissao_extrato', { p_petshop: P, p_de: L.mes1, p_ate: L.hoje }));
  T.recusa('período de mais de um ano é recusado', await dono.rpc('comissao_extrato', { p_petshop: P, p_de: '2024-01-01', p_ate: L.hoje }));

  T.secao('Mozart: ver_comissao');
  const contexto = (sb, eu, fin) => ({ sb, petshop: { id: P }, eu: { id: eu }, equipe: Object.values(L.ids).map((id) => ({ id })), cuidoDoFinanceiro: fin, vejoFinanceiro: fin, fusoMin: -180, agora: `${L.hoje}T12:00` });
  const erro = (m) => new Error(m);
  const r1 = await M.consultarComissao(contexto(dono, L.ids.dono, true), 'ver_comissao', {}, erro);
  const pt = r1.resultado.pessoas.find((x) => x.profissional_id === L.ids.tosador);
  T.ok('dona: separa por pessoa; tosador R$ 45,44, nada pago, falta R$ 45,44, 2 linhas', pt && pt.comissao_total === 45.44 && pt.ja_pago === 0 && pt.falta_pagar === 45.44 && pt.linhas.length === 2, pt);
  T.passa('a dona paga a comissão', await dono.rpc('comissao_pagar', { p_profissional: L.ids.tosador, p_de: L.mes1, p_ate: L.hoje, p_forma: 'pix', p_valor: 45.44, p_chave: B.uuid() }));
  const r2 = await M.consultarComissao(contexto(dono, L.ids.dono, true), 'ver_comissao', { de: L.mes1, ate: L.hoje }, erro);
  const pt2 = r2.resultado.pessoas.find((x) => x.profissional_id === L.ids.tosador);
  T.ok('depois de pagar: já pago R$ 45,44, falta R$ 0,00', pt2.ja_pago === 45.44 && pt2.falta_pagar === 0, pt2);
  const r3 = await M.consultarComissao(contexto(tos, L.ids.tosador, false), 'ver_comissao', { profissional_id: L.ids.caixa }, erro);
  T.ok('tosador: só a própria comissão (pedir a de outra pessoa não traz)', r3.resultado.pessoas.length === 1 && r3.resultado.pessoas[0].profissional_id === L.ids.tosador && r3.resultado.recusado, r3.resultado.pessoas.map((x) => x.nome));
  T.ok('nome de outra ferramenta: não é desta lista', (await M.consultarComissao(contexto(dono, L.ids.dono, true), 'ver_caixa', {}, erro)) === null);
}))();
