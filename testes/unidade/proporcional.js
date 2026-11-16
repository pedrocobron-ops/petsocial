// Unidade: a primeira cobrança proporcional de um mensalista conta desde o COMEÇO DO PLANO (achado do Rafael: o plano
// "Começa em 01/11" sugeria "a partir de hoje: R$ 387,69 (7 de 13 dias)"). A conta é a de `sugestaoDoMes`, a mesma da
// cobrança do mês e do acerto da saída: dias do plano no mês a partir do começo ÷ todos os dias do plano no mês × mensalidade.
// Contas feitas à mão, em novembro de 2026 (1º de novembro é domingo; 30 dias).
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-proporcional');
const CR = lib('creche');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

const TODOS = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), { abre: '07:00', fecha: '20:00' }]));
const SEM_QUARTA = Object.fromEntries([0, 1, 2, 4, 5, 6].map((d) => [String(d), { abre: '07:00', fecha: '20:00' }]));
const NOV = new Date(2026, 10, 1);
const SQS = [1, 3, 5]; // seg, qua e sex
const plano = (inicio, dias = SQS, extra = {}) => ({ inicio, fim: null, dias, pausa_de: null, pausa_ate: null, ...extra });

T.secao('seg, qua e sex, R$ 720,00 (13 dias do plano em novembro: 5 seg + 4 qua + 4 sex)');
t('começa em 12/11: 8 de 13 dias → 720 × 8 ÷ 13 = 443,0769… = R$ 443,08', () => {
  const r = CR.sugestaoDoMes(plano('2026-11-12'), NOV, 720, TODOS);
  assert.deepEqual(r, { valor: 443.08, proporcional: true, restam: 8, todos: 13 });
});
t('começa em 16/11: 7 de 13 → R$ 387,69 (o número que a tela mostrava "a partir de hoje" para um plano de 01/11)', () => {
  const r = CR.sugestaoDoMes(plano('2026-11-16'), NOV, 720, TODOS);
  assert.deepEqual(r, { valor: 387.69, proporcional: true, restam: 7, todos: 13 });
});
t('começa em 01/11: o mês todo (13 de 13), sem proporcional → R$ 720,00', () => {
  const r = CR.sugestaoDoMes(plano('2026-11-01'), NOV, 720, TODOS);
  assert.deepEqual(r, { valor: 720, proporcional: false, restam: 13, todos: 13 });
});
t('começou no mês anterior: o mês todo → R$ 720,00', () => assert.equal(CR.sugestaoDoMes(plano('2026-10-20'), NOV, 720, TODOS).valor, 720));
t('"a partir de hoje" (16/11) com plano de 01/11 dava 387,69; desde o começo do plano dá 720,00', () => {
  assert.equal(CR.proporcionalDesde(plano('2026-11-01'), NOV, 720, TODOS, '2026-11-16').valor, 387.69);
  assert.equal(CR.sugestaoDoMes(plano('2026-11-01'), NOV, 720, TODOS).valor, 720);
});
t('desde o começo = proporcionalDesde com o próprio começo', () => {
  for (const ini of ['2026-11-02', '2026-11-12', '2026-11-19', '2026-11-30']) assert.deepEqual(CR.proporcionalDesde(plano(ini), NOV, 720, TODOS, ini), CR.sugestaoDoMes(plano(ini), NOV, 720, TODOS));
});

T.secao('centavos');
t('seg a sex, R$ 1.100,00, começa em 18/11: 9 de 21 dias úteis → 471,428… = R$ 471,43', () => {
  const r = CR.sugestaoDoMes(plano('2026-11-18', [1, 2, 3, 4, 5]), NOV, 1100, TODOS);
  assert.deepEqual(r, { valor: 471.43, proporcional: true, restam: 9, todos: 21 });
});
t('seg, qua e sex com a casa fechada na quarta: 9 dias do plano; de 12/11, 6 → 720 × 6 ÷ 9 = R$ 480,00', () => {
  const r = CR.sugestaoDoMes(plano('2026-11-12'), NOV, 720, SEM_QUARTA);
  assert.deepEqual(r, { valor: 480, proporcional: true, restam: 6, todos: 9 });
});
t('só segundas, R$ 500,00, começa em 24/11: 1 de 5 (30/11) → R$ 100,00', () => {
  const r = CR.sugestaoDoMes(plano('2026-11-24', [1]), NOV, 500, TODOS);
  assert.deepEqual(r, { valor: 100, proporcional: true, restam: 1, todos: 5 });
});
t('com pausa no mês: de 12/11, pausa 16/11 a 20/11 (seg, qua e sex) → 5 de 13 → R$ 276,92', () => {
  const r = CR.sugestaoDoMes(plano('2026-11-12', SQS, { pausa_de: '2026-11-16', pausa_ate: '2026-11-20' }), NOV, 720, TODOS);
  assert.deepEqual(r, { valor: 276.92, proporcional: true, restam: 5, todos: 13 });
});

(async () => T.rodar(async () => {}))();
