// Unidade (rodada 9, N5), sem banco. Todos os totais conferidos à mão.
// - H4 comprovante do hotel com o sinal recebido na saída: estadia de 393,00 com sinal de 110,40 pago junto, em Crédito 2x
//   200,00 + Pix 193,00: as linhas somam (110,40 + 282,60 = 393,00 = 200,00 + 193,00) e nada diz "sinal já pago".
// - M6 comprovantes: parcelas ("Crédito 3x"), troco, hora e quem atendeu; comprovante da conta que ficou para depois; recibo da
//   conta paga (15,00 + 0,34 de multa e juros = 15,34); troca (29,99 por 34,90: diferença de 4,91) e devolução.
// - H2/M4 frases do fiado: "Davi ficaria devendo R$ 175,50…" e "Tutor deve R$ 119,80 · … cabe mais R$ 30,20".
// - Modo simples: o Caixa continua no menu. Cobrança: "Trazido do caderno" vira "Conta anterior" para o tutor.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-caixa-trava-recibos');
const H = lib('hotel'), C = lib('comprovante'), FI = lib('fiado'), M = lib('modo-simples'), DO = lib('dinheiro-opcoes');
const t = async (nome, f) => { try { await f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const sem = (s) => s.replace(/\u00a0/g, ' ');
const linhas = (s) => sem(s).split('\n');

(async () => T.rodar(async () => {
  T.secao('H4 comprovante do hotel: sinal recebido junto na saída');
  const base = { v: 1, tipo: 'hotel', quando: '2026-11-18T15:00:00-03:00', diarias: 4, valor_diaria: 80, noites: null, pacote: null, total_diarias: 368, taxas: [{ id: 'atraso', nome: 'Busca fora do horário', por: 'fixa', valor: 25, qtd: 1, total: 25 }],
    extras: [], produtos: [], soma: 393, ajuste: 0, total: 393, pendencias: [], lancamento_id: null };
  const fred = { ...base, sinal: 110.4, sinal_pago: true, sinal_junto: 110.4, a_pagar: 282.6, quem: 'Carla Recepção', hora: '2026-11-18T15:32:00-03:00',
    pagamento: { fiado: false, forma: 'credito', pagamentos: [{ forma: 'credito', valor: 200 }, { forma: 'pix', valor: 193 }], valor: 393, parcelas: 2 } };
  const texto = H.textoComprovanteEstadia({ petshop: 'Pet Shop Teste', tutor: 'Ana Souza', pet: 'Fred', entrada: '2026-11-14T10:00:00-03:00', saida: '2026-11-18T15:00:00-03:00', conta: fred });
  await t('total pago agora = R$ 393,00 (282,60 da estadia + 110,40 do sinal)', () => assert.equal(H.totalPagoAgora(fred), 393));
  await t('as linhas: Total da estadia 393,00; Sinal recebido agora 110,40; Resto da estadia 282,60; Total pago agora 393,00', () => {
    const l = linhas(texto);
    for (const x of ['Total da estadia: R$ 393,00', 'Sinal recebido agora: R$ 110,40', 'Resto da estadia, na saída: R$ 282,60', 'Total pago agora: R$ 393,00']) assert.ok(l.includes(x), `falta "${x}" em:\n${texto}`);
  });
  await t('o pagamento soma os mesmos R$ 393,00, com as parcelas: Crédito 2x R$ 200,00 + Pix R$ 193,00', () => assert.ok(linhas(texto).includes('Pagamento: Crédito 2x R$ 200,00 + Pix R$ 193,00'), texto));
  await t('nada de "Sinal já pago" nem de "Valor na saída: R$ 282,60" sozinho', () => { assert.ok(!/Sinal já pago/.test(texto)); assert.ok(!/Valor na saída/.test(texto)); });
  await t('a hora e quem atendeu: "Recebido às 15:32 por Carla Recepção"', () => assert.ok(linhas(texto).includes('Recebido às 15:32 por Carla Recepção'), texto));
  // o sinal pago ANTES continua como sempre: desconto na conta
  const antes = { ...base, sinal: 110.4, sinal_pago: true, a_pagar: 282.6, pagamento: { fiado: false, forma: 'pix', pagamentos: null } };
  const textoAntes = H.textoComprovanteEstadia({ petshop: 'Pet Shop Teste', tutor: 'Ana', pet: 'Fred', entrada: '2026-11-14T10:00:00-03:00', saida: '2026-11-18T15:00:00-03:00', conta: antes });
  await t('sinal pago antes (conta guardada de antes): "Sinal já pago: - R$ 110,40", "Valor na saída: R$ 282,60" e "Pagamento: Pix R$ 282,60"', () => {
    const l = linhas(textoAntes);
    for (const x of ['Sinal já pago: - R$ 110,40', 'Valor na saída: R$ 282,60', 'Pagamento: Pix R$ 282,60']) assert.ok(l.includes(x), `falta "${x}" em:\n${textoAntes}`);
    assert.equal(H.totalPagoAgora(antes), 282.6);
  });
  // parte do sinal já tinha entrado (100,00 de 110,40): agora entram os 10,40 que faltavam e os 282,60 da estadia = 293,00
  const parte = { ...base, sinal: 110.4, sinal_pago: true, sinal_junto: 10.4, a_pagar: 282.6, pagamento: { fiado: false, forma: 'dinheiro', pagamentos: null, valor: 293 } };
  await t('sinal recebido em parte antes: "Sinal já pago antes: - R$ 100,00", "Sinal recebido agora: R$ 10,40", total pago agora R$ 293,00', () => {
    const l = linhas(H.textoComprovanteEstadia({ petshop: 'P', tutor: 'Ana', pet: 'Fred', entrada: '2026-11-14T10:00:00-03:00', saida: '2026-11-18T15:00:00-03:00', conta: parte }));
    for (const x of ['Sinal já pago antes: - R$ 100,00', 'Sinal recebido agora: R$ 10,40', 'Total pago agora: R$ 293,00', 'Pagamento: Dinheiro R$ 293,00']) assert.ok(l.includes(x), x);
  });
  await t('creche numa forma só: o pagamento leva o valor ("Dinheiro R$ 70,00")', () => {
    const c = { ...base, tipo: 'creche', diarias: 1, valor_diaria: 70, total_diarias: 70, taxas: [], soma: 70, total: 70, sinal: 0, sinal_pago: false, a_pagar: 70, pagamento: { fiado: false, forma: 'dinheiro', pagamentos: null, valor: 70 } };
    assert.ok(linhas(H.textoComprovanteEstadia({ petshop: 'P', tutor: 'Ana', pet: 'Pipoca', entrada: '2026-11-18T08:00:00-03:00', saida: '2026-11-18T17:00:00-03:00', conta: c })).includes('Pagamento: Dinheiro R$ 70,00'));
  });

  T.secao('M6 comprovantes: parcelas, troco, hora e quem atendeu');
  const venda = { valor: 254.79, forma: 'dinheiro', pagamentos: [{ forma: 'dinheiro', valor: 54.79 }, { forma: 'pix', valor: 100 }, { forma: 'credito', valor: 100 }], data: '2026-11-18',
    itens: [{ tipo: 'produto', nome: 'Ração 15 kg', qtd: 1, valor: 254.79 }] };
  const tv = C.textoComprovante({ petshop: 'Pet Shop Teste', tutor: 'Ana', quando: '2026-11-18T15:00:00-03:00', recebidos: [venda], assunto: 'da compra', entregue: 60, parcelas: 3, hora: '2026-11-18T15:32:00-03:00', quem: 'Carla' });
  await t('54,79 + 100,00 + 100,00 = 254,79, com "Crédito 3x R$ 100,00"', () => assert.ok(linhas(tv).includes('Pagamento: Dinheiro R$ 54,79 + Pix R$ 100,00 + Crédito 3x R$ 100,00'), tv));
  await t('troco de R$ 5,21 (60,00 entregues − 54,79 em dinheiro)', () => assert.ok(linhas(tv).includes('Recebido em dinheiro: R$ 60,00 · Troco: R$ 5,21'), tv));
  await t('"Recebido às 15:32 por Carla" antes de "não é nota fiscal"', () => { const l = linhas(tv); assert.ok(l.includes('Recebido às 15:32 por Carla')); assert.equal(l[l.length - 1], 'Este comprovante não é nota fiscal.'); });
  await t('sem hora nem nome (lançamento antigo), a linha não aparece', () => assert.ok(!/Recebido às|Recebido por/.test(C.textoComprovante({ petshop: 'P', quando: '2026-11-18T15:00:00-03:00', recebidos: [venda] }))));

  const ar = C.textoComprovanteAReceber({ petshop: 'Pet Shop Teste', tutor: 'Beto Lima', itens: [{ nome: 'Shampoo', qtd: 2, valor: 34.95 }, { nome: 'Coleira', qtd: 1, valor: 20 }], total: 89.9, pagaAte: '2026-11-25', hora: '2026-11-18T15:40:00-03:00', quem: 'Carla' });
  await t('conta para depois: 2 × 34,95 + 20,00 = 89,90, "fica para pagar até 25/11/2026" e "Nada foi pago ainda"', () => {
    const l = linhas(ar);
    for (const x of ['2 x Shampoo (R$ 34,95 cada): R$ 69,90', 'Coleira: R$ 20,00', 'Total: R$ 89,90', 'Nada foi pago ainda: o valor está anotado na sua ficha.', 'Anotado às 15:40 por Carla']) assert.ok(l.includes(x), `falta "${x}" em:\n${ar}`);
    assert.ok(/Pagamento: fica para pagar até .*25\/11\/2026/.test(sem(ar)), ar);
  });

  const rc = C.textoReciboDeConta({ petshop: 'Pet Shop Teste', tutor: 'Clara', conta: 'Taxa de falta 10/11 (Luna)', pagoEm: '2026-11-18', valor: 15, multa: 0.34, formas: [{ forma: 'pix', valor: 15.34 }], falta: 0, quem: 'Carla' });
  await t('recibo da conta paga: 15,00 + 0,34 de multa e juros = 15,34, quitada', () => {
    const l = linhas(rc);
    for (const x of ['Conta: Taxa de falta 10/11 (Luna)', 'Valor pago da conta: R$ 15,00', 'Multa e juros: R$ 0,34', 'Total pago agora: R$ 15,34', 'Pagamento: Pix R$ 15,34', 'Esta conta ficou quitada.', 'Recebido por Carla']) assert.ok(l.includes(x), `falta "${x}" em:\n${rc}`);
  });
  await t('recibo de uma parte: pagou 30,00 de 59,90, "Ainda falta desta conta: R$ 29,90"', () => {
    const r = C.textoReciboDeConta({ petshop: 'P', tutor: 'Zeca', conta: 'Banho', pagoEm: '2026-11-18', valor: 30, formas: [{ forma: 'dinheiro', valor: 30 }], falta: 29.9, pagaAte: '2026-11-25' });
    assert.ok(/Ainda falta desta conta: R\$ 29,90, até .*25\/11\/2026/.test(sem(r)), r);
    assert.ok(linhas(r).includes('Total pago agora: R$ 30,00'));
  });

  const tr = C.textoComprovanteDevolucao({ petshop: 'Pet Shop Teste', tutor: 'Ana', modo: 'troca', itens: [{ nome: 'Coleira M', qtd: 1, valor: 29.99 }], valor: 29.99,
    novos: [{ nome: 'Shampoo 500', qtd: 1, valor: 34.9 }], valorNovos: 34.9, forma: 'dinheiro', resto: 'dinheiro', quem: 'Carla', hora: '2026-11-18T16:00:00-03:00' });
  await t('troca: voltou 29,99, levou 34,90, diferença paga de R$ 4,91 em dinheiro', () => {
    const l = linhas(tr);
    for (const x of ['Voltou:', 'Coleira M: R$ 29,99', 'Total do que voltou: R$ 29,99', 'Levou no lugar:', 'Shampoo 500: R$ 34,90', 'Total do que levou: R$ 34,90', 'Diferença paga pelo cliente: R$ 4,91 (Dinheiro)', 'Trocado às 16:00 por Carla']) assert.ok(l.includes(x), `falta "${x}" em:\n${tr}`);
  });
  await t('troca por um mais barato com o resto de crédito: 34,90 por 29,99, R$ 4,91 de crédito', () => {
    const r = C.textoComprovanteDevolucao({ petshop: 'P', tutor: 'Ana', modo: 'troca', itens: [{ nome: 'Shampoo', qtd: 1, valor: 34.9 }], valor: 34.9, novos: [{ nome: 'Coleira', qtd: 1, valor: 29.99 }], valorNovos: 29.99, resto: 'credito' });
    assert.ok(linhas(r).includes('Diferença que ficou de crédito na sua ficha: R$ 4,91'), r);
  });
  await t('devolução para crédito: R$ 16,90 na ficha; em dinheiro: "Devolvido ao cliente: R$ 16,90 (Pix)"', () => {
    const cr = C.textoComprovanteDevolucao({ petshop: 'P', tutor: 'Ana', modo: 'credito', itens: [{ nome: 'Bola', qtd: 1, valor: 16.9 }], valor: 16.9 });
    assert.ok(linhas(cr).includes('Ficou de crédito na sua ficha: R$ 16,90'), cr);
    const di = C.textoComprovanteDevolucao({ petshop: 'P', tutor: 'Ana', modo: 'dinheiro', itens: [{ nome: 'Bola', qtd: 1, valor: 16.9 }], valor: 16.9, forma: 'pix' });
    assert.ok(linhas(di).includes('Devolvido ao cliente: R$ 16,90 (Pix)'), di);
  });

  T.secao('H2/M4 frases do fiado');
  await t('quem não deve nada: "Davi ficaria devendo R$ 175,50: passa do limite de R$ 150,00."', () =>
    assert.equal(sem(FI.fraseDoLimite('Davi Reis', 0, 150, 175.5)), 'Davi ficaria devendo R$ 175,50: passa do limite de R$ 150,00.'));
  await t('quem já deve continua com a frase de sempre', () =>
    assert.equal(sem(FI.fraseDoLimite('Ana Souza', 180, 200, 30)), 'Ana já deve R$ 180,00; com esta conta passa do limite de R$ 200,00.'));
  await t('as duas frases são reconhecidas como erro do limite', () => { assert.ok(FI.ehErroDoLimite(new Error(FI.fraseDoLimite('Davi', 0, 150, 175.5)))); assert.ok(FI.ehErroDoLimite(new Error(FI.fraseDoLimite('Ana', 180, 200)))); });
  await t('na venda: "Tutor deve R$ 119,80 · limite de fiado R$ 150,00, cabe mais R$ 30,20" (150,00 − 119,80)', () =>
    assert.equal(sem(FI.fraseDoQueDeve('Tutor Teste 6', { deve: 119.8, limite: 150, total: 119.8 })), 'Tutor deve R$ 119,80 · limite de fiado R$ 150,00, cabe mais R$ 30,20'));
  await t('sem dívida e sem limite, nada aparece; sem dívida com limite, diz o limite', () => {
    assert.equal(FI.fraseDoQueDeve('Ana', { deve: 0, limite: null, total: 0 }), null);
    assert.equal(sem(FI.fraseDoQueDeve('Ana', { deve: 0, limite: 150, total: 0 })), 'Ana não deve nada · limite de fiado R$ 150,00, cabe mais R$ 150,00');
  });
  await t('passou do limite: "passou R$ 30,00 do limite de fiado de R$ 150,00"', () =>
    assert.equal(sem(FI.fraseDoQueDeve('Ana', { deve: 180, limite: 150, total: 180 })), 'Ana deve R$ 180,00 · passou R$ 30,00 do limite de fiado de R$ 150,00'));

  T.secao('modo simples e cobrança');
  await t('modo simples: o Caixa fica no menu, com ou sem venda de produtos; Relatórios e Escola continuam saindo', () => {
    const p = { modulos: ['banho_tosa'], opcoes: { 'geral.modo_simples': true } };
    assert.equal(M.foraNoModoSimples(p, '/gestao/app/caixa'), false);
    assert.equal(M.foraNoModoSimples({ ...p, modulos: ['banho_tosa', 'loja'] }, '/gestao/app/caixa'), false);
    assert.equal(M.foraNoModoSimples(p, '/gestao/app/relatorios'), true);
    assert.ok(!/Caixa/.test(M.TEXTO_MODO_SIMPLES));
  });
  await t('cobrança para o tutor: "Trazido do caderno" vira "Conta anterior" (falta R$ 50,00 de R$ 120,00)', () => {
    const m = sem(DO.mensagemDeDivida({ nome: 'Pet Shop Teste', opcoes: {} }, 'Ana Souza', [{ valor: 50, valor_original: 120, descricao: 'Trazido do caderno', categoria: 'Outros', vencimento: '2026-11-03' }], '2026-11-18'));
    assert.ok(/- Conta anterior: falta R\$ 50,00 de R\$ 120,00/.test(m), m);
    assert.ok(!/caderno/i.test(m), m);
  });
  await t('outra descrição continua como está', () => assert.equal(DO.nomeParaOTutor('Banho e tosa · Thor'), 'Banho e tosa · Thor'));
}))();
