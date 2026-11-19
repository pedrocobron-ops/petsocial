// Unidade, sem banco e sem rede: os manuais pagos da linha de negócios saem do site com a mesma chave da Escola de Gestão
// (MATERIAIS_PAGOS_A_VENDA, em src/lib/gestao/escola-venda.ts). São os mesmos produtos da Cakto (mesmo checkout) que os
// materiais pagos da Escola, que ainda não têm PDF nem o aviso de pagamento "Escola e outros produtos" configurado.
//  - com a chave desligada: nenhum manual na vitrine, no sitemap, nas indicações do fim da página; /negocios fora do sitemap;
//  - os guias para tutores e a página /gestao continuam;
//  - ligar a chave (true) devolve tudo: os 6 manuais voltam;
//  - as telas (página de venda, vitrine, topo, rodapé, página inicial, Quem faz, termos) leem a mesma chave.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
require('../lib/app'); // registra o carregador de TypeScript e o apelido "@/"
const B = require('../lib/base');
const T = require('../lib/teste')('unidade-loja-negocios-site');
const P = require(path.join(B.RAIZ, 'src/lib/produtos.ts'));
const E = require(path.join(B.RAIZ, 'src/lib/gestao/escola.ts'));
const V = require(path.join(B.RAIZ, 'src/lib/gestao/escola-venda.ts'));
const sitemap = require(path.join(B.RAIZ, 'src/app/sitemap.ts')).default;
const t = async (nome, f) => { try { await f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.stack || e.message); } };
const fonte = (rel) => fs.readFileSync(path.join(B.RAIZ, rel), 'utf8');
const NEGOCIOS = ['confeitaria', 'passeador', 'petsitter', 'fotografia', 'moldes', 'moldes-natal'];

(async () => T.rodar(async () => {
  T.secao('a chave e os produtos');
  await t('a chave é uma só e está desligada', () => {
    assert.equal(V.MATERIAIS_PAGOS_A_VENDA, false);
    assert.equal(E.MATERIAIS_PAGOS_A_VENDA, V.MATERIAIS_PAGOS_A_VENDA);
    assert.match(fonte('src/lib/produtos.ts'), /import \{ MATERIAIS_PAGOS_A_VENDA \} from "@\/lib\/gestao\/escola-venda"/);
  });
  await t('os materiais pagos da Escola são os manuais da linha de negócios do site (mesmo checkout)', () => {
    const daEscola = E.MATERIAIS.filter((m) => m.preco > 0).map((m) => m.slug).sort();
    assert.deepEqual(daEscola, [...NEGOCIOS].sort());
    for (const m of E.MATERIAIS) assert.equal(m.checkout, P.produto(m.slug).checkout, m.slug);
  });
  await t('desligada: os 6 manuais ficam fora do site e a vitrine /negocios fica vazia', () => {
    for (const s of NEGOCIOS) { assert.equal(P.foraDoSite(P.produto(s)), true, s); assert.equal(P.noSite(P.produto(s)), false, s); }
    assert.deepEqual(P.manuaisNoSite(), []);
    assert.equal(P.lojaNegociosNoSite(), false);
  });
  await t('os guias para tutores continuam todos no site', () => {
    const tutor = P.PRODUTOS.filter((p) => P.linhaDe(p) === 'tutor');
    assert.ok(tutor.length >= 20, `${tutor.length} guias`);
    assert.ok(tutor.every((p) => P.noSite(p)));
  });
  await t('fim da página: nenhum manual é indicado; os guias continuam indicando guias', () => {
    assert.deepEqual(P.daFamilia(P.produto('confeitaria')), []);
    const xixi = P.daFamilia(P.produto('xixi'));
    assert.ok(xixi.length > 0 && xixi.every((p) => P.linhaDe(p) === 'tutor'));
  });
  await t('ligada (true): os 6 manuais voltam e a vitrine reaparece', () => {
    for (const s of NEGOCIOS) assert.equal(P.foraDoSite(P.produto(s), true), false, s);
    assert.deepEqual(P.manuaisNoSite(true).map((p) => p.slug).sort(), [...NEGOCIOS].sort());
    assert.equal(P.lojaNegociosNoSite(true), true);
  });

  T.secao('sitemap');
  await t('sem /negocios nem página de manual; com /, /tutor, /gestao e os guias lançados', () => {
    const urls = sitemap().map((e) => new URL(e.url).pathname);
    assert.ok(!urls.some((u) => u === '/negocios' || u.startsWith('/negocios/')), urls.filter((u) => u.startsWith('/negocios')).join(', '));
    for (const u of ['/', '/tutor', '/gestao', '/xixi', '/sozinho']) assert.ok(urls.includes(u), u);
  });

  T.secao('telas do site leem a mesma chave');
  await t('página de venda do manual: fora do site não é gerada e dá 404', () => {
    const f = fonte('src/app/(negocios)/negocios/[slug]/page.tsx');
    assert.match(f, /dynamicParams = false/);
    assert.match(f, /linhaDe\(p\) === "negocios" && noSite\(p\)/);
    assert.match(f, /if \(!c \|\| !p \|\| !noSite\(p\)\) notFound\(\);/);
  });
  await t('vitrine /negocios: sem manual, leva à página inicial (sem prateleira vazia nem "em breve")', () => {
    const f = fonte('src/app/(site)/negocios/page.tsx');
    assert.match(f, /manuaisNoSite\(\)/);
    assert.match(f, /if \(manuais\.length === 0\) redirect\("\/"\);/);
  });
  await t('topo: nenhum link para /negocios com a chave desligada', () => {
    const f = fonte('src/components/site-header.tsx');
    assert.match(f, /from "@\/lib\/gestao\/escola-venda"/);
    assert.match(f, /const LOJA_NEGOCIOS = MATERIAIS_PAGOS_A_VENDA;/);
    assert.match(f, /nav\.filter\(\(\[href\]\) => !href\.startsWith\("\/negocios"\)\)/);
  });
  await t('rodapé, página inicial, Quem faz e termos: a linha de negócios só com manual no site', () => {
    assert.match(fonte('src/components/rodape.tsx'), /manuais\.length > 0 && \(\s*<nav aria-label="Manuais">/);
    const home = fonte('src/app/(site)/page.tsx');
    assert.match(home, /const comNegocios = manuais\.length > 0;/);
    assert.match(home, /\{comNegocios && \(\s*<Link className="h2-porta" href="\/negocios">/);
    assert.match(home, /\{comNegocios && \(\s*<section className="secao h2-duo"/);
    assert.match(home, /return p && noSite\(p\) \?/);
    assert.match(fonte('src/app/(site)/sobre/page.tsx'), /\{comNegocios && <Link className="btn btn-secundario" href="\/negocios">/);
    assert.match(fonte('src/app/(site)/termos-de-uso/page.tsx'), /\{lojaNegociosNoSite\(\) && <> \(área <Link href="\/negocios">/);
  });
  await t('a página da assinatura (/gestao) não depende da chave', () => {
    assert.doesNotMatch(fonte('src/app/(gestao)/gestao/page.tsx'), /MATERIAIS_PAGOS_A_VENDA|noSite|lojaNegociosNoSite/);
  });
}))();
