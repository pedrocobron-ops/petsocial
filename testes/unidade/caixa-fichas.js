// Unidade: textos e contas do caixa e das fichas (achados da Bia, hotel só).
//   - descricaoAtual (dinheiro.ts): o sinal sai sem a data da reserva, que fica velha quando o pet chega antes.
//   - nomeDaCategoria (modulos.ts): "Creche e hotel" vira "Hotel" ou "Creche" pela entrada e pelo que o pet shop faz.
//   - lancamentoDoPet (faturamento.ts): o que é de cada pet na ficha (diária, sinal, devolução), sem pegar o pet de nome parecido.
//   - contextoDoPetshop (assistente/instrucoes.ts): num hotel só, o Mozart chama a casa de "Hotel".
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-caixa-fichas');
const D = lib('dinheiro');
const M = lib('modulos');
const F = lib('faturamento');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

T.secao('descrição do sinal sem a data velha');
t('"Sinal da reserva: hotel de Thor, 19/11" → sem a data', () => assert.equal(D.descricaoAtual('Sinal da reserva: hotel de Thor, 19/11'), 'Sinal da reserva: hotel de Thor'));
t('parte recebida: "(parte)" fica', () => assert.equal(D.descricaoAtual('Sinal da reserva: hotel de Thor, 19/11 (parte)'), 'Sinal da reserva: hotel de Thor (parte)'));
t('devolução do sinal também', () => assert.equal(D.descricaoAtual('Devolução do sinal: creche de Ana Maria, 01/02'), 'Devolução do sinal: creche de Ana Maria'));
t('sinal já sem data e outras entradas: iguais', () => {
  assert.equal(D.descricaoAtual('Sinal da reserva: hotel de Thor'), 'Sinal da reserva: hotel de Thor');
  assert.equal(D.descricaoAtual('Devolução: hotel de Bob, 16/11 a 18/11 (pago antes R$ 220,00, estadia R$ 110,00)'), 'Devolução: hotel de Bob, 16/11 a 18/11 (pago antes R$ 220,00, estadia R$ 110,00)');
  assert.equal(D.descricaoAtual('Hotel: 1 diária · Mel'), 'Hotel: 1 diária · Mel');
  assert.equal(D.descricaoAtual(null), '');
});

T.secao('categoria Creche e hotel com o nome certo');
const hotel = { modulos: ['hotel'] }, creche = { modulos: ['creche', 'banho_tosa'] }, os2 = { modulos: ['creche', 'hotel'] };
t('hotel só: Hotel, com ou sem descrição', () => {
  assert.equal(M.nomeDaCategoria('Creche e hotel', hotel), 'Hotel');
  assert.equal(M.nomeDaCategoria('Creche e hotel', hotel, 'Pago a mais'), 'Hotel');
});
t('creche só: Creche', () => assert.equal(M.nomeDaCategoria('Creche e hotel', creche), 'Creche'));
t('os dois: pela entrada (Hotel: 2 diárias, Sinal da reserva: creche de Mel); sem pista, Creche e hotel', () => {
  assert.equal(M.nomeDaCategoria('Creche e hotel', os2, 'Hotel: 2 diárias · Thor'), 'Hotel');
  assert.equal(M.nomeDaCategoria('Creche e hotel', os2, 'Sinal da reserva: creche de Mel, 19/11'), 'Creche');
  assert.equal(M.nomeDaCategoria('Creche e hotel', os2, 'Hotelzinho'), 'Creche e hotel');
  assert.equal(M.nomeDaCategoria('Creche e hotel', os2), 'Creche e hotel');
});
t('outras categorias não mudam; nome antigo de produtos vira o de hoje', () => {
  assert.equal(M.nomeDaCategoria('Banho e tosa', hotel, 'Hotel'), 'Banho e tosa');
  assert.equal(M.nomeDaCategoria('Produtos e insumos', hotel), 'Produtos e material');
});

T.secao('o que é de cada pet');
t('diária e mensalidade: "· Mel", "· Mel (parte)", "· Mel + taxa"', () => {
  assert.ok(F.lancamentoDoPet('Hotel: 1 diária · Mel', 'Mel'));
  assert.ok(F.lancamentoDoPet('Hotel: 1 diária · Mel (parte)', 'mel'));
  assert.ok(F.lancamentoDoPet('Creche: 3 diárias · Mel + taxa', 'Mel'));
});
t('sinal e devoluções: "hotel de Mel, 19/11", "hotel de Mel" (sem data), "Devolução: hotel de Bob, 16/11 a 18/11 (…)"', () => {
  assert.ok(F.lancamentoDoPet('Sinal da reserva: hotel de Mel, 19/11', 'Mel'));
  assert.ok(F.lancamentoDoPet('Sinal da reserva: hotel de Mel', 'Mel'));
  assert.ok(F.lancamentoDoPet('Sinal da reserva: hotel de Mel (parte)', 'Mel'));
  assert.ok(F.lancamentoDoPet('Devolução: hotel de Bob, 16/11 a 18/11 (pago antes R$ 220,00, estadia R$ 110,00)', 'Bob'));
  assert.ok(F.lancamentoDoPet('Devolução do sinal: creche de Thor, 19/11', 'Thor'));
});
t('pet de nome parecido ou outro pet: não', () => {
  assert.ok(!F.lancamentoDoPet('Hotel: 1 diária · Melissa', 'Mel'));
  assert.ok(!F.lancamentoDoPet('Sinal da reserva: hotel de Melissa, 19/11', 'Mel'));
  assert.ok(!F.lancamentoDoPet('Sinal da reserva: hotel de Thor, 19/11', 'Mel'));
  assert.ok(!F.lancamentoDoPet('Banho de Mel', 'Mel'));
  assert.ok(!F.lancamentoDoPet(null, 'Mel'));
});

T.secao('Mozart num hotel só');
const I = lib('assistente/instrucoes');
const ctx = (modulos) => ({ petshop: { nome: 'Hotelzinho', horario: null, modulos }, servicos: [], equipe: [{ nome: 'Bia', papel: 'dono', ativo: true, atende: true }], eu: { nome: 'Bia', papel: 'dono' }, cuidoDoFinanceiro: true, vejoFinanceiro: true });
t('hotel só: o contexto manda dizer "Hotel" no lugar de Creche e hotel', () => assert.match(I.contextoDoPetshop(ctx(['hotel'])), /faz hotel e não faz creche: onde .* "Creche e hotel" .* diga "Hotel"/));
t('creche e hotel: nada a trocar', () => assert.doesNotMatch(I.contextoDoPetshop(ctx(['creche', 'hotel'])), /diga "(Hotel|Creche)"/));

(async () => T.rodar(async () => {}))();
