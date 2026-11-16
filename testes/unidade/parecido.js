// Unidade: nomes parecidos para pedidos falados (src/lib/gestao/assistente/parecido.ts). O ditado do navegador erra nomes:
// sem o nome exato, buscar_pets devolve os parecidos e o Mozart pergunta qual é quando há mais de um.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-parecido');
const P = lib('assistente/parecido');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

const pets = [
  { nome: 'Thor', tutor: 'Ana Souza' }, { nome: 'Mel', tutor: 'Ana Souza' }, { nome: 'Bob', tutor: 'Beto Lima' },
  { nome: 'Lunna', tutor: 'Clara Dias' }, { nome: 'Rex', tutor: 'Davi Rocha' }, { nome: 'Bel', tutor: 'Gisele Ramos' },
  { nome: 'Scooby', tutor: 'Heloísa Prado' },
];
const achar = (falado) => P.parecidos(falado, pets, (p) => [p.nome, p.tutor]).map((p) => p.nome);

T.secao('grafia pelo som');
t('"Thor" e "tor" soam igual', () => assert.equal(P.pelaFala('Thor'), P.pelaFala('tor')));
t('acento, letra dobrada e h mudo não contam', () => { assert.equal(P.pelaFala('Lunna'), P.pelaFala('luna')); assert.equal(P.pelaFala('Heloísa'), P.pelaFala('eloiza')); });
t('distância com teto', () => { assert.equal(P.distancia('mel', 'mau', 3), 2); assert.equal(P.distancia('abcdef', 'x', 2), 3); });

T.secao('nomes mal ouvidos');
t('"tor" acha o Thor (um só)', () => assert.deepEqual(achar('tor'), ['Thor']));
t('"luna" acha a Lunna', () => assert.deepEqual(achar('luna'), ['Lunna']));
t('"xyzw" não inventa: nada parecido o bastante', () => assert.deepEqual(achar('xyzw'), []));
t('"mau" acha a Mel e a Bel: mais de um, o Mozart pergunta', () => { const r = achar('mau'); assert.ok(r.includes('Mel'), r); });
t('"mel" acha a Mel primeiro e a Bel depois', () => assert.deepEqual(achar('mel').slice(0, 2), ['Mel', 'Bel']));
t('pelo tutor: "eloisa" acha o Scooby da Heloísa', () => assert.deepEqual(achar('eloisa'), ['Scooby']));
t('pelo começo do nome: "davi roc" acha o Rex', () => assert.deepEqual(achar('davi roc'), ['Rex']));
t('nome comprido aceita 2 letras trocadas, curto só 1', () => { assert.equal(P.proximidade('gizeli', 'Gisele'), 1); assert.equal(P.proximidade('box', 'Rex'), null); });

(async () => T.rodar(async () => {}))();
