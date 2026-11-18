// Unidade: o que a página pública põe no HTML (src/lib/gestao/link-servidor.ts). As cores do pet shop entram no CSS só
// conferidas (hex da cor própria ou uma combinação pronta), nunca o texto cru do banco; pedido com código inválido nem vai ao banco.
// Sem rede: nada aqui chama o Supabase.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-rede-lenta');
const S = lib('link-servidor');
const t = async (nome, f) => { try { await f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

(async () => T.rodar(async () => {
  T.secao('cores do pet shop no HTML');
  await t('combinação pronta (Vinho) vira as duas cores dela', () =>
    assert.equal(S.cssDoTema('vinho'), '.g-raiz{--tema:#5a1e2c;--destaque:#f2a541}'));
  await t('cor própria "#rrggbb/#rrggbb"', () =>
    assert.equal(S.cssDoTema('#123abc/#fedcba'), '.g-raiz{--tema:#123abc;--destaque:#fedcba}'));
  await t('Floresta (a de sempre), vazio e desconhecido: nada a mudar', () => {
    for (const x of ['floresta', null, undefined, '', 'rosa-choque', 42]) assert.equal(S.cssDoTema(x), null);
  });
  await t('texto com CSS ou HTML no meio nunca entra', () => {
    for (const x of ['#123abc/#fedcba;}body{display:none', '</style><script>alert(1)</script>', 'vinho;color:red', '#12345/#fedcba'])
      assert.equal(S.cssDoTema(x), null, x);
  });

  T.secao('pedido com código inválido');
  await t('não vai ao banco e diz "não encontrado" (pedido null)', async () => {
    assert.deepEqual(await S.lerPedidoInicial('nao-e-um-codigo'), { pedido: null, acoes: null, sinal: null });
    assert.deepEqual(await S.lerPedidoInicial("x' or 1=1 --"), { pedido: null, acoes: null, sinal: null });
  });
  await t('link sem código: o servidor não lê (a página segue como antes)', async () =>
    assert.equal(await S.lerLinkInicial(''), undefined));
}))();
