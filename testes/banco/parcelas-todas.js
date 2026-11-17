// Crédito em quantas vezes em todas as telas que recebem (migração 20261208: maquininha_parcelas e taxas_do_periodo trocadas),
// pelo mesmo código das telas (dinheiro.ts, tudo-ou-nada.ts, devolucao.ts, maquininha.ts, o Mozart) e conferido à mão:
// - cada caminho novo grava o pagamento e anota as vezes com os ids que a tela junta: Recebi (receber_conta, conta inteira e
//   parte + multa), conta_receber_junto, venda_registrar, orcamento_vender, estadia_sinal, estadia_checkout, troca com
//   diferença (venda_devolver) e o Mozart (lancar_dinheiro, receber_de_cliente; sem as vezes, o cartão pede);
// - a recepção anota na conta que ela recebeu inteira agora (anotada por outra pessoa), não numa paga há mais de 30 minutos;
// - anotarParcelasComRetry: tenta de novo quando a internet falha, não insiste na recusa do banco;
// - "A receber da maquininha": o parcelado em parcelas por mês (a 1ª com o centavo que sobra), um parcelado antigo de 12x
//   com as parcelas que ainda faltam, e débito, Pix e crédito à vista como antes.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('parcelas-todas');
const D = lib('dinheiro'), MQ = lib('maquininha'), TN = lib('tudo-ou-nada'), DV = lib('devolucao');
const F = lib('assistente/ferramentas'), R = lib('reservado'), A = lib('acessos');

const REGRA = {
  debito_pct: 2, debito_fixo: 0, debito_dias: 1, credito_pct: 4, credito_fixo: 0.5, credito_dias: 30,
  parcelado_pct: 6, parcelado_dias: 30, parcelas_pct: { 3: 7.5 }, pix_pct: 0.99, pix_fixo: 0, pix_dias: 0,
};
const c = (n) => B.centavos(n);

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Parcelas' });
  const { dono, caixa: cx } = L.sb;
  const P = L.P;
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 0 }).select('id'), 'abrir o caixa');
  await MQ.salvarTaxas(dono, P, { ...MQ.TAXAS_ZERADAS, ...REGRA });
  const taxaDe = (id) => B.sql(`select coalesce((select taxa::text || '|' || coalesce(parcelas::text, '-') from lancamentos_taxas where lancamento_id='${id}'), 'sem')`);
  const chave = () => D.novaChaveDeOperacao();
  const conta = async (valor, cliente, desc) => B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor, categoria: 'Banho e tosa', descricao: desc,
    data: L.dia(-5), vencimento: L.dia(-5), pago: false, cliente_id: cliente, origem: 'tela' }).select('id').single(), 'conta ' + desc).id;

  T.secao('Recebi: a conta inteira e a parte com multa (receber_conta)');
  const fiado = await conta(200, L.tutores.Ana, 'Fiado da Ana');
  const r1 = await D.receberConta(cx, fiado, { valor: 200, forma: 'credito', chave: chave() });
  T.ok('recebida inteira: os ids são a própria conta', r1.quitada && r1.ids.length === 1 && r1.ids[0] === fiado, r1);
  T.ok('antes das vezes: crédito à vista 200 × 4% + 0,50 = 8,50', taxaDe(fiado) === '8.50|-', taxaDe(fiado));
  const a1 = await MQ.anotarParcelasComRetry(cx, P, r1.ids, 3);
  T.ok('a recepção anota 3x na conta que ela recebeu (anotada pelo dono): 200 × 7,5% + 0,50 = 15,50', a1.ok && a1.anotados === 1 && taxaDe(fiado) === '15.50|3', [a1, taxaDe(fiado)]);
  T.ok('fica anotado quem recebeu (a recepção, agora)', B.sql(`select (recebido_por = (select user_id from profissionais where id='${L.ids.caixa}'))::text from lancamentos_recebidos where lancamento_id='${fiado}'`) === 'true');
  const doDono = await conta(80, L.tutores.Beto, 'Conta do Beto');
  await D.receberConta(dono, doDono, { valor: 80, forma: 'credito', chave: chave() });
  T.ok('a recepção não anota numa conta que o dono recebeu agora', (await MQ.anotarParcelas(cx, P, [doDono], 2)) === 0 && taxaDe(doDono) === '3.70|-', taxaDe(doDono));
  const outra = await conta(40, L.tutores.Beto, 'Outra do Beto');
  await D.receberConta(cx, outra, { valor: 40, forma: 'credito', chave: chave() });
  B.sql(`update lancamentos_recebidos set recebido_em = now() - interval '2 hours' where lancamento_id='${outra}'`);
  T.ok('… nem numa que ela mesma recebeu há mais de 30 minutos', (await MQ.anotarParcelas(cx, P, [outra], 2)) === 0 && taxaDe(outra) === '2.10|-', taxaDe(outra));
  T.ok('ninguém lê quem recebeu sem cuidar do financeiro; ninguém grava direto',
    (B.must(await cx.from('lancamentos_recebidos').select('lancamento_id').eq('petshop_id', P), 'cx')).length === 0
    && (B.must(await dono.from('lancamentos_recebidos').select('lancamento_id').eq('petshop_id', P), 'dono')).length >= 3
    && !!(await dono.from('lancamentos_recebidos').insert({ lancamento_id: outra, petshop_id: P }).select('lancamento_id')).error);
  const comMulta = await conta(150, L.tutores.Clara, 'Banho da Luna');
  const r2 = await D.receberConta(cx, comMulta, { valor: 100, forma: 'credito', multa: { valor: 10, forma: 'credito' }, chave: chave() });
  T.ok('parte com multa: dois ids (a parte e a multa), nenhum é a conta', r2.ids.length === 2 && !r2.ids.includes(comMulta), r2);
  await MQ.anotarParcelasComRetry(cx, P, r2.ids, 2);
  const [parte, multa] = r2.ids;
  T.ok('2x: parte 100 × 6% + 0,50 = 6,50; multa 10 × 6% + 0,50 = 1,10', taxaDe(parte) === '6.50|2' && taxaDe(multa) === '1.10|2', [taxaDe(parte), taxaDe(multa)]);
  T.ok('a conta que ficou aberta (50) não tem taxa', taxaDe(comMulta) === 'sem');

  T.secao('Recebi com o crédito do tutor (conta_receber_junto)');
  const junto = await conta(50, L.tutores.Davi, 'Taxa de falta');
  const passosJ = [{ t: 'receber', conta: junto, valor: 50, forma: 'credito', chave: chave() }];
  const fJ = await TN.fazerTudoOuNada(cx, P, chave(), { funcao: 'conta_receber_junto', conta: junto }, passosJ);
  const idsJ = MQ.idsDaOperacao(fJ, passosJ);
  T.ok('idsDaOperacao acha a conta recebida inteira pelo passo da tela', idsJ.includes(junto), { idsJ, fJ });
  await MQ.anotarParcelasComRetry(cx, P, idsJ, 4);
  T.ok('4x (sem % própria: a do parcelado): 50 × 6% + 0,50 = 3,50', taxaDe(junto) === '3.50|4', taxaDe(junto));

  T.secao('venda no balcão e orçamento → venda');
  const linha = (valor) => ({ tipo: 'entrada', valor, forma: 'credito', categoria: 'Venda de produtos', pago: true, data: L.hoje, descricao: 'Venda' });
  const pV = [{ t: 'lancamento', nome: 'venda', chave: chave(), linha: linha(120) }];
  const fV = await TN.fazerTudoOuNada(cx, P, chave(), { funcao: 'venda_registrar' }, pV);
  await MQ.anotarParcelasComRetry(cx, P, MQ.idsDaOperacao(fV, pV), 3);
  T.ok('venda_registrar 3x R$ 120,00: 9,00 + 0,50 = 9,50', taxaDe(fV.ids.venda) === '9.50|3', taxaDe(fV.ids.venda));
  const orc = B.must(await cx.from('orcamentos').insert({ petshop_id: P, cliente_id: L.tutores.Ana, itens: [{ tipo: 'servico', nome: 'Banho', qtd: 1, valor: 60, servico_id: L.S.Banho }], validade: L.dia(7), chave: chave() }).select('id').single(), 'orçamento');
  const pO = [{ t: 'lancamento', nome: 'venda', chave: chave(), linha: { ...linha(60), cliente_id: L.tutores.Ana } }];
  const fO = await TN.fazerTudoOuNada(cx, P, chave(), { funcao: 'orcamento_vender', orcamento: orc.id }, pO);
  await MQ.anotarParcelasComRetry(cx, P, MQ.idsDaOperacao(fO, pO), 2);
  T.ok('orcamento_vender 2x R$ 60,00: 3,60 + 0,50 = 4,10', taxaDe(fO.ids.venda) === '4.10|2', taxaDe(fO.ids.venda));

  T.secao('sinal da reserva e check-out (estadia_sinal, estadia_checkout)');
  const reserva = B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Thor, tipo: 'hotel', status: 'reservada', entrada: B.instante(L.dia(3), '09:00', L.fuso).toISOString() }).select('id').single(), 'reserva').id;
  const pS = [
    { t: 'lancamento', nome: 'sinal', chave: chave(), linha: { ...linha(100), categoria: 'Creche e hotel', descricao: 'Sinal da reserva', cliente_id: L.tutores.Ana } },
    { t: 'estadia_valores', estadia: reserva, modo: 'upsert', campos: { sinal: 100, sinal_estado: 'pago', sinal_lancamento_id: TN.ref('sinal'), sinal_pago_em: L.hoje } },
  ];
  const fS = await TN.fazerTudoOuNada(cx, P, chave(), { funcao: 'estadia_sinal', estadia: reserva }, pS);
  await MQ.anotarParcelasComRetry(cx, P, MQ.idsDaOperacao(fS, pS), 2);
  T.ok('sinal 2x R$ 100,00: 6,00 + 0,50 = 6,50', taxaDe(fS.ids.sinal) === '6.50|2', taxaDe(fS.ids.sinal));
  const naCasa = B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Rex, tipo: 'creche', status: 'em_casa', entrada: new Date(Date.now() - 4 * 36e5).toISOString() }).select('id').single(), 'creche').id;
  const pC = [
    { t: 'estadia_fechar', id: naCasa, saida: new Date().toISOString(), diarias: 1, valor_cobrado: 70 },
    { t: 'lancamento', nome: 'principal', chave: chave(), linha: { ...linha(70), categoria: 'Creche e hotel', descricao: 'Creche: 1 diária', cliente_id: L.tutores.Davi } },
  ];
  const fC = await TN.fazerTudoOuNada(cx, P, chave(), { funcao: 'estadia_checkout', estadia: naCasa }, pC);
  await MQ.anotarParcelasComRetry(cx, P, MQ.idsDaOperacao(fC, pC), 3);
  T.ok('check-out da creche 3x R$ 70,00: 5,25 + 0,50 = 5,75', taxaDe(fC.ids.principal) === '5.75|3', taxaDe(fC.ids.principal));

  T.secao('troca com diferença no crédito (venda_devolver)');
  const coleira = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Coleira', unidade: 'un', preco_venda: 129.9, custo: 40, estoque: 5 }).select('id').single(), 'coleira').id;
  const vT = await D.lancarPago(cx, P, { tipo: 'entrada', valor: 29.9, forma: 'pix', categoria: 'Venda de produtos', clienteId: L.tutores.Clara, chave: chave(), itens: [{ tipo: 'produto', nome: 'Shampoo Neutro', qtd: 1, valor: 29.9, produto_id: L.prod }] });
  const tr = await DV.devolver(cx, P, { venda: vT.id, itens: [{ produto_id: L.prod, qtd: 1 }], modo: 'troca', forma: 'credito', novos: [{ produto_id: coleira, qtd: 1 }], chave: chave() });
  T.ok('a troca cobra 100,00 de diferença', Number(tr.diferenca) === 100 && tr.entrada_id, tr);
  T.ok('antes das vezes: só a diferença no crédito paga taxa (100 × 4% + 0,50 = 4,50; os 29,90 trocados não)', taxaDe(tr.entrada_id) === '4.50|-', taxaDe(tr.entrada_id));
  await MQ.anotarParcelasComRetry(cx, P, [tr.entrada_id], 3);
  T.ok('3x: 100 × 7,5% + 0,50 = 8,00', taxaDe(tr.entrada_id) === '8.00|3', taxaDe(tr.entrada_id));

  T.secao('débito e Pix: as vezes não mudam nada');
  const deb = await D.lancarPago(cx, P, { tipo: 'entrada', valor: 100, forma: 'debito', categoria: 'Outros', chave: chave() });
  const pix = await D.lancarPago(cx, P, { tipo: 'entrada', valor: 50, forma: 'pix', categoria: 'Outros', chave: chave() });
  const aDP = await MQ.anotarParcelasComRetry(cx, P, [deb.id, pix.id], 3);
  T.ok('nenhum anotado, e o débito (2,00) e o Pix (0,50) continuam iguais', aDP.ok && aDP.anotados === 0 && taxaDe(deb.id) === '2.00|-' && taxaDe(pix.id) === '0.50|-', [aDP, taxaDe(deb.id), taxaDe(pix.id)]);

  T.secao('tentar de novo (anotarParcelasComRetry)');
  let vezes = 0;
  const falhaDuas = { rpc: async () => (++vezes < 3 ? { error: { message: 'Failed to fetch', code: '' } } : { data: 1, error: null }) };
  const rr = await MQ.anotarParcelasComRetry(falhaDuas, P, ['x'], 2, [0, 0]);
  T.ok('a internet falhou duas vezes: a terceira anota', rr.ok && rr.anotados === 1 && vezes === 3, { rr, vezes });
  vezes = 0;
  const recusa = { rpc: async () => { vezes++; return { error: { message: 'Só quem recebe anota as parcelas.', code: '42501' } }; } };
  const rc = await MQ.anotarParcelasComRetry(recusa, P, ['x'], 2, [0, 0]);
  T.ok('recusa do banco: não insiste e diz que não deu', !rc.ok && vezes === 1 && /Só quem recebe/.test(rc.erro), { rc, vezes });
  const semFazer = await MQ.anotarParcelasComRetry(recusa, P, ['x'], 1);
  T.ok('à vista (1x): nada a anotar, nem chama o banco', semFazer.ok && vezes === 1);
  T.ok('o aviso da tela diz que a taxa ficou a do crédito à vista', /3 vezes.*crédito à vista.*Tentar de novo/.test(MQ.avisoParcelasNaoAnotadas(3)));

  T.secao('Mozart: no crédito, pergunta em quantas vezes');
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
  const cDono = await contexto('dono');
  const pedido = { tipo: 'entrada', valor: 200, forma: 'credito', categoria: 'Outros', descricao: 'Venda pelo Mozart' };
  let semVezes = null;
  try { await F.gravar(cDono, 'lancar_dinheiro', pedido); } catch (e) { semVezes = e.message; }
  T.ok('sem as vezes, o cartão não sai: pede para perguntar', /quantas vezes/.test(semVezes || ''), semVezes);
  const mz = await F.gravar({ ...cDono, chave: chave() }, 'lancar_dinheiro', { ...pedido, parcelas: 3 });
  const idMz = B.sql(`select id from lancamentos where petshop_id='${P}' and descricao='Venda pelo Mozart'`);
  T.ok('lancar_dinheiro 3x R$ 200,00: 15,00 + 0,50 = 15,50', mz.feito && mz.credito_em_vezes === 3 && taxaDe(idMz) === '15.50|3', [mz, taxaDe(idMz)]);
  const dvMz = await conta(90, L.tutores.Beto, 'Banho do Bob');
  const rMz = await F.gravar({ ...cDono, chave: chave() }, 'receber_de_cliente', { cliente_id: L.tutores.Beto, valor: 90, forma: 'credito', parcelas: 2 });
  T.ok('receber_de_cliente 2x R$ 90,00 (conta inteira): 5,40 + 0,50 = 5,90', rMz.feito && taxaDe(dvMz) === '5.90|2', [rMz, taxaDe(dvMz)]);
  const avMz = await F.gravar({ ...cDono, chave: chave() }, 'lancar_dinheiro', { ...pedido, descricao: 'À vista pelo Mozart', parcelas: 1 });
  T.ok('parcelas 1: à vista (4% + 0,50 = 8,50)', avMz.feito && taxaDe(B.sql(`select id from lancamentos where petshop_id='${P}' and descricao='À vista pelo Mozart'`)) === '8.50|-');
  await MQ.apagarTaxas(dono, P);
  const semTaxa = await F.gravar({ ...cDono, chave: chave() }, 'lancar_dinheiro', { ...pedido, descricao: 'Sem taxa de parcelado' });
  T.ok('loja sem taxa de parcelado: o Mozart não pergunta', semTaxa.feito);

  T.secao('A receber da maquininha: uma parcela por mês');
  const L2 = await criarLoja(T, { nome: 'Parcelas 2', equipe: false });
  const d2 = L2.sb.dono, P2 = L2.P;
  B.must(await d2.from('caixas').insert({ petshop_id: P2, valor_inicial: 0 }).select('id'), 'caixa');
  await MQ.salvarTaxas(d2, P2, { ...MQ.TAXAS_ZERADAS, ...REGRA });
  const lanca = (valor, forma, extra = {}) => D.lancarPago(d2, P2, { tipo: 'entrada', valor, forma, categoria: 'Outros', chave: chave(), ...extra });
  const x3 = await lanca(300, 'credito'); await MQ.anotarParcelas(d2, P2, [x3.id], 3);
  const x2 = await lanca(100, 'credito'); await MQ.anotarParcelas(d2, P2, [x2.id], 2);
  await lanca(150, 'credito');
  await lanca(100, 'debito');
  await lanca(50, 'pix');
  // 12x de R$ 1.200,00 pago há 200 dias (a primeira caiu há 170): ainda faltam as parcelas 7 a 12
  const antigo = await lanca(1200, 'credito', { data: L2.dia(-200) });
  await MQ.anotarParcelas(d2, P2, [antigo.id], 12);
  const sobra = B.sql(`select taxa::text from lancamentos_taxas where lancamento_id='${antigo.id}'`);
  T.ok('o 12x antigo: 1.200 × 6% + 0,50 = 72,50 de taxa', sobra === '72.50', sobra);
  const fim = B.somaDias(L2.hoje, 30);
  const tp = await MQ.taxasDoPeriodo(d2, P2, L2.mes1 < L2.dia(-200) ? L2.mes1 : L2.dia(-200), L2.hoje);
  const dia = (n) => tp.a_receber.find((x) => x.dia === L2.dia(n));
  const esperado = [
    // débito 100 − 2,00
    [1, 9800],
    // 12x: líquido 1.127,50 ÷ 12 = 93,95 por parcela (a 1ª, 94,05, já caiu); parcelas 7 a 12 em −170 + 30 × 6 = +10, +40, …, +160
    [10, 9395],
    // 3x: 277,00 = 92,34 + 92,33 + 92,33; 2x: 93,50 = 46,75 + 46,75; à vista 150 − 6,50 = 143,50
    [30, 9234 + 4675 + 14350],
    [40, 9395], [60, 9233 + 4675], [70, 9395], [90, 9233], [100, 9395], [130, 9395], [160, 9395],
  ];
  const confere = esperado.map(([n, v]) => [n, v, dia(n) ? c(dia(n).valor) : null]);
  T.ok('cada dia, conferido à mão (débito amanhã, parcelas de 30 em 30 dias, a 1ª com o centavo que sobra)',
    confere.every(([, v, achou]) => v === achou) && tp.a_receber.length === esperado.length, { confere, a_receber: tp.a_receber });
  T.ok('o Pix (0 dias) já caiu: não aparece', !dia(0));
  const totalAR = c(tp.a_receber.reduce((t, x) => t + x.valor, 0));
  // 98 + 277 + 93,50 + 143,50 + 6 × 93,95 = 1.175,70
  T.ok('soma do a receber: 98 + 277 + 93,50 + 143,50 + 6 × 93,95 = R$ 1.175,70', totalAR === 117570, totalAR);
  T.ok('a resposta diz que tem parcelado (a tela explica a regra)', tp.parcelado === true);
  T.ok('o resto da resposta não muda: taxa do período = 23 + 6,50 + 6,50 + 2 + 0,50 + 72,50 = R$ 111,00', c(tp.taxa) === 11100, tp.taxa);

  T.secao('sem parcelado: como antes');
  const L3 = await criarLoja(T, { nome: 'Parcelas 3', equipe: false, dados: false });
  const d3 = L3.sb.dono, P3 = L3.P;
  B.must(await d3.from('caixas').insert({ petshop_id: P3, valor_inicial: 0 }).select('id'), 'caixa');
  await MQ.salvarTaxas(d3, P3, { ...MQ.TAXAS_ZERADAS, ...REGRA });
  for (const [v, f] of [[100, 'debito'], [50, 'pix'], [150, 'credito'], [80, 'debito']]) await D.lancarPago(d3, P3, { tipo: 'entrada', valor: v, forma: f, categoria: 'Outros', chave: chave() });
  const t3 = await MQ.taxasDoPeriodo(d3, P3, L3.mes1, fim);
  const um = t3.a_receber.find((x) => x.dia === L3.dia(1)), trinta = t3.a_receber.find((x) => x.dia === L3.dia(30));
  // débito 98 + 78,40 = 176,40 amanhã; crédito à vista 143,50 em 30 dias; Pix já caiu
  T.ok('débito R$ 176,40 amanhã e crédito à vista R$ 143,50 em 30 dias, nada mais', t3.a_receber.length === 2 && um && c(um.valor) === 17640 && trinta && c(trinta.valor) === 14350, t3.a_receber);
  T.ok('sem parcelado: a tela não mostra a linha da regra', t3.parcelado === false);
  T.recusa('quem não cuida do financeiro continua sem ler', await cx.rpc('taxas_do_periodo', { p: P, p_de: L.mes1, p_ate: fim }));
}))();
