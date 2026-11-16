// Unidade: cruzamento de reservas do mesmo pet (src/lib/gestao/conflito-estadia.ts).
// Achado em produção: com a Mel na creche hoje, um dia extra para depois de amanhã era recusado
// ("Mel já está na casa desde hoje"). Só pode recusar o que cruza com a estadia de agora.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-conflito-estadia');
const C = lib('conflito-estadia');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

const hoje = new Date(2026, 10, 16, 12, 44);            // segunda 16/11, 12h44 no fuso da máquina
const dia = (d, h = 8) => new Date(2026, 10, d, h, 0).toISOString();
const creche = (id, d, status = 'reservada', extra = {}) => ({ id, pet_id: 'mel', tipo: 'creche', entrada: dia(d), saida_prevista: null, status, ...extra });
const naCreche = creche('agora', 16, 'em_casa', { entrada: new Date(2026, 10, 16, 12, 44).toISOString() });

t('dia extra de creche em 18/11 com a Mel na creche hoje: não cruza', () =>
  assert.equal(C.conflitoDoPet('mel', creche(null, 18), [naCreche], null, hoje), null));
t('reserva de creche para hoje com a Mel na creche: cruza', () =>
  assert.equal(C.conflitoDoPet('mel', creche(null, 16), [naCreche], null, hoje)?.id, 'agora'));
t('outro check-in com a Mel na casa: recusado', () =>
  assert.equal(C.conflitoDoPet('mel', creche(null, 16, 'em_casa'), [naCreche], null, hoje)?.id, 'agora'));
t('creche esquecida aberta desde ontem vale até hoje, não para sempre', () => {
  const ontem = creche('ontem', 15, 'em_casa');
  assert.equal(C.conflitoDoPet('mel', creche(null, 16), [ontem], null, hoje)?.id, 'ontem');
  assert.equal(C.conflitoDoPet('mel', creche(null, 17), [ontem], null, hoje), null);
});
t('hotel na casa sem saída prevista continua cruzando com dias depois', () => {
  const hotel = { id: 'h', pet_id: 'mel', tipo: 'hotel', entrada: dia(14), saida_prevista: null, status: 'em_casa' };
  assert.equal(C.conflitoDoPet('mel', creche(null, 20), [hotel], null, hoje)?.id, 'h');
});
t('hotel na casa até 19/11: dia extra em 18/11 cruza, em 20/11 não', () => {
  const hotel = { id: 'h', pet_id: 'mel', tipo: 'hotel', entrada: dia(14), saida_prevista: dia(19, 10), status: 'em_casa' };
  assert.equal(C.conflitoDoPet('mel', creche(null, 18), [hotel], null, hoje)?.id, 'h');
  assert.equal(C.conflitoDoPet('mel', creche(null, 20), [hotel], null, hoje), null);
});
t('duas reservas de creche no mesmo dia futuro: cruza', () =>
  assert.equal(C.conflitoDoPet('mel', creche(null, 18), [creche('r', 18)], null, hoje)?.id, 'r'));
t('outro pet não conta', () =>
  assert.equal(C.conflitoDoPet('thor', creche(null, 16), [naCreche], null, hoje), null));

(async () => T.rodar(async () => {}))();
