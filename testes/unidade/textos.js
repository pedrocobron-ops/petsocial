// Unidade: textos que as testadoras acharam confusos (src/lib/gestao/comprovante.ts e util.ts).
//   - comprovante com parte da dívida antiga: "Do que estava em aberto antes: R$ 40,00" (com R$ 75 em aberto) virou
//     "Pagou R$ 40,00 do que devia de antes (R$ 75,00); ainda deve R$ 35,00".
//   - iniciais da loja sem logo: "Banho e Tosa" saía "BE"; as palavras pequenas (e, de, da, do…) não viram inicial.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-textos');
const C = lib('comprovante');
const U = lib('util');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const nb = (s) => s.replace(/ /g, ' ');

T.secao('comprovante: parte da dívida antiga');
const base = { petshop: 'Banho da Neide', tutor: 'Ana Souza', pet: 'Luna', quando: '2026-11-16T15:00:00Z', itens: [{ nome: 'Banho', qtd: 1, valor: 50 }], total: 50, formas: [{ forma: 'pix', valor: 90 }] };
t('pagou 40 dos 75: diz quanto devia e quanto ainda deve, sem repetir o resto', () => {
  const s = nb(C.textoComprovanteDaParte({ ...base, pago: 90, falta: 35, antigo: 40, antigoDevia: 75 }));
  assert.match(s, /Pagou R\$ 40,00 do que devia de antes \(R\$ 75,00\); ainda deve R\$ 35,00/);
  assert.doesNotMatch(s, /em aberto antes/);
  assert.doesNotMatch(s, /Fica para pagar depois/);
  assert.match(s, /Pago agora: R\$ 90,00/);
});
t('pagou tudo o que devia: quitado', () => {
  const s = nb(C.textoComprovanteDaParte({ ...base, pago: 125, falta: 0, antigo: 75, antigoDevia: 75 }));
  assert.match(s, /Pagou também o que devia de antes: R\$ 75,00 \(quitado\)/);
});
t('sem o total devido (chamada antiga): ainda claro', () => {
  const s = nb(C.textoComprovanteDaParte({ ...base, pago: 90, falta: 35, antigo: 40 }));
  assert.match(s, /Pagou também R\$ 40,00 do que devia de antes/);
  assert.match(s, /Fica para pagar depois: R\$ 35,00/);
});
t('conta paga em parte, sem dívida antiga: igual a antes', () => {
  const s = nb(C.textoComprovanteDaParte({ ...base, pago: 30, falta: 20, pagaAte: '2026-11-20' }));
  assert.match(s, /Fica para pagar depois: R\$ 20,00, até 20\/11\/2026/);
  assert.doesNotMatch(s, /devia/);
});

T.secao('iniciais');
for (const [nome, ini] of [['Banho e Tosa', 'BT'], ['Hotelzinho da Bia', 'HB'], ['Pet Shop do Zé', 'PS'], ['Casa dos Pets', 'CP'], ['Banho & Cia', 'BC'],
  ['Maria da Silva', 'MS'], ['Ana', 'A'], ['de', 'D'], ['  luna  ', 'L'], ['Érica Souza', 'ÉS'], ['4 Patas', '4P']]) {
  t(`"${nome}" = ${ini}`, () => assert.equal(U.iniciais(nome), ini));
}

(async () => T.rodar(async () => {}))();
