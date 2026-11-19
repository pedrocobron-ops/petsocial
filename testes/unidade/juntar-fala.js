// Unidade: juntar os pedaços do ditado sem repetir (src/lib/gestao/fala.ts). O Chrome no Android manda cada pedaço já com
// o anterior dentro ("Mozart Tobias" e depois "Mozart Tobias a dona é a Valéria"): somar os dois repetia o começo.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-juntar-fala');
const F = lib('fala');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

T.secao('juntarFala');
t('pedaço novo que já traz o anterior: fica só o novo', () => assert.equal(F.juntarFala('Mozart Tobias', 'Mozart Tobias a dona é a Valéria'), 'Mozart Tobias a dona é a Valéria'));
t('pedaço repetido no fim: nada muda', () => assert.equal(F.juntarFala('a dona é a Valéria', 'a Valéria'), 'a dona é a Valéria'));
t('fim do anterior igual ao começo do novo (2 palavras): entra só o resto', () => assert.equal(F.juntarFala('a dona é a Valéria', 'a Valéria com w'), 'a dona é a Valéria com w'));
t('pedaços diferentes: um depois do outro', () => assert.equal(F.juntarFala('cadastrar um pet', 'para mim'), 'cadastrar um pet para mim'));
t('maiúsculas e acentos não atrapalham a comparação', () => assert.equal(F.juntarFala('marca banho', 'Marca banho amanhã'), 'Marca banho amanhã'));
t('vazio de um lado ou do outro', () => { assert.equal(F.juntarFala('', ' oi  tudo '), 'oi tudo'); assert.equal(F.juntarFala('oi', ''), 'oi'); });
t('uma palavra igual só não é tratada como repetição', () => assert.equal(F.juntarFala('banho do Rex', 'Rex e da Mel'), 'banho do Rex Rex e da Mel'));

T.secao('juntarPedacos');
t('o exemplo do print: sem "Mozart Tobias Mozart Tobias"', () => assert.equal(
  F.juntarPedacos(['cadastrar um pet novo para mim é o Mozart Tobias', 'Mozart Tobias a dona é a Valéria', 'a Valéria com w']),
  'cadastrar um pet novo para mim é o Mozart Tobias a dona é a Valéria com w'));
t('navegador que manda pedaços separados (computador) continua igual', () => assert.equal(F.juntarPedacos(['marca banho', ' do Rex', ' amanhã']), 'marca banho do Rex amanhã'));

(async () => T.rodar(async () => {}))();
