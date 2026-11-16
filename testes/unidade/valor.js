// Unidade: leitura estrita do dinheiro digitado (src/lib/gestao/util.ts: lerValorEstrito / lerValor / lerNumeroEstrito).
// Achado em produção: "abc-5" virava R$ 5,00 e "52o,00" virava R$ 52,00 sem aviso. Letra nunca é tirada em silêncio.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-valor');
const U = lib('util');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const v = (s, o) => U.lerValorEstrito(s, o);

T.secao('aceita');
for (const [txt, n] of [['520', 520], ['520,00', 520], ['520,5', 520.5], ['1.234,56', 1234.56], ['1.234', 1234], ['12.345.678,90', 12345678.9],
  ['60.5', 60.5], ['60.50', 60.5], ['R$ 60', 60], ['R$60,00', 60], ['  85,00  ', 85], ['0,99', 0.99], ['52,', 52], ['0', 0]]) {
  t(`"${txt}" = ${n}`, () => { const r = v(txt); assert.equal(r.erro, null); assert.equal(r.valor, n); assert.equal(U.lerValor(txt), n); });
}
t('vazio é null sem erro', () => { assert.deepEqual(v(''), { valor: null, erro: null }); assert.deepEqual(v('   '), { valor: null, erro: null }); });

T.secao('recusa (nunca tira letra em silêncio)');
for (const txt of ['abc-5', '52o,00', 'abc5', '5o', 'R$ 5x', '1,234', '1,2,3', '1.23.4', '12,345', '1.2345', '5,000', '1e3', '0x10', '--5', '5-', '5 0', 'NaN', 'Infinity', ',5', '.', ',', '1.234.5', '1,234.56']) {
  t(`"${txt}" é recusado`, () => { const r = v(txt); assert.equal(r.valor, null); assert.equal(r.erro, U.AVISO_VALOR_RUIM); assert.equal(U.lerValor(txt), null); });
}
t('mensagem pede só números com exemplo', () => assert.equal(U.AVISO_VALOR_RUIM, 'Confira o valor: use só números, ex.: 520,00'));

T.secao('negativo');
t('"-5" recusado por padrão, com aviso próprio', () => { const r = v('-5'); assert.equal(r.valor, null); assert.equal(r.erro, U.AVISO_VALOR_NEGATIVO); });
t('"-1.234,50" recusado por padrão', () => assert.equal(v('-1.234,50').erro, U.AVISO_VALOR_NEGATIVO));
t('"-5,50" aceito onde pode', () => assert.deepEqual(v('-5,50', { negativo: true }), { valor: -5.5, erro: null }));
t('"-abc" recusado mesmo onde pode', () => assert.equal(v('-abc', { negativo: true }).erro, U.AVISO_VALOR_RUIM));

T.secao('número simples');
for (const [txt, n] of [['10', 10], ['10,5', 10.5], ['0.25', 0.25], ['5o', null], ['1e3', null], ['', null], ['-2', null], ['1.234,5', null]]) {
  t(`lerNumeroEstrito("${txt}") = ${n}`, () => assert.equal(U.lerNumeroEstrito(txt), n));
}

(async () => T.rodar(async () => {}))();
