// Manuais de negócio fora do site (chave MATERIAIS_PAGOS_A_VENDA = false, a mesma da Escola de Gestão): no navegador,
//   - /negocios leva à página inicial (sem prateleira vazia nem "em breve");
//   - as páginas de venda dos 6 manuais dão 404 e saem do sitemap;
//   - nenhum link para /negocios no topo, no menu do celular, no rodapé, na página inicial, em Quem faz, nos termos,
//     na vitrine /tutor e numa página de guia;
//   - os guias para tutores e a página do sistema (/gestao) continuam no ar.
// Capturas em testes/saida/loja-negocios-*.png (390 e 1366).
const path = require('path');
const B = require('../lib/base');
const N = require('../lib/navegador');
const T = require('../lib/teste')('loja-negocios-site');
const SAIDA = path.join(B.RAIZ, 'testes', 'saida');
const MANUAIS = ['confeitaria', 'passeador', 'petsitter', 'fotografia', 'moldes', 'moldes-natal'];

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  T.depois(() => N.fecharNavegador());

  T.secao('endereços');
  const r = await fetch(B.BASE_URL + '/negocios', { redirect: 'manual' });
  const destino = r.headers.get('location') || '';
  T.ok('/negocios redireciona para a página inicial', r.status >= 300 && r.status < 400 && new URL(destino, B.BASE_URL).pathname === '/', `${r.status} ${destino}`);
  for (const s of MANUAIS) {
    const p = await fetch(`${B.BASE_URL}/negocios/${s}`, { redirect: 'manual' });
    T.ok(`/negocios/${s}: 404`, p.status === 404, p.status);
  }
  for (const rota of ['/', '/tutor', '/xixi', '/sobre', '/termos-de-uso', '/gestao']) {
    const p = await fetch(B.BASE_URL + rota, { redirect: 'manual' });
    T.ok(`${rota}: no ar (200)`, p.status === 200, p.status);
  }
  const mapa = await (await fetch(B.BASE_URL + '/sitemap.xml')).text();
  T.ok('sitemap sem /negocios', !/\/negocios/.test(mapa), (mapa.match(/<loc>[^<]*negocios[^<]*<\/loc>/g) || []).join(' '));
  T.ok('sitemap com /tutor, /gestao e os guias', /\/tutor<\/loc>/.test(mapa) && /\/gestao<\/loc>/.test(mapa) && /\/xixi<\/loc>/.test(mapa));

  for (const [w, h] of [[390, 844], [1366, 768]]) {
    T.secao(`navegador (${w})`);
    const { ctx, page, erros } = await N.contexto(w, h);
    const linksNegocios = () => page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).filter((h) => /^\/negocios|maestropet\.com\/negocios/.test(h)));

    await page.goto(B.BASE_URL + '/negocios');
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    T.ok('/negocios no navegador termina na página inicial', new URL(page.url()).pathname === '/', page.url());

    T.ok('página inicial: nenhum link para /negocios', (await linksNegocios()).length === 0, await linksNegocios());
    T.ok('página inicial: sem a porta "Trabalho com pets" e sem "Ver os manuais"', !(await page.getByText('Trabalho com pets').count()) && !(await page.getByText('Ver os manuais').count()));
    T.ok('página inicial: sem "manuais" no texto e sem "em breve"', await page.evaluate(() => !/manua(l|is)|em breve/i.test(document.querySelector('main')?.innerText || document.body.innerText)));
    const portas = await page.locator('.h2-fim .h2-porta').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    T.ok('fecho da página: duas portas (/tutor e /gestao)', JSON.stringify(portas) === JSON.stringify(['/tutor', '/gestao']), portas);
    T.ok('rodapé: sem a coluna Manuais, com "Sistema para pet shop"', !(await page.locator('footer nav[aria-label="Manuais"]').count()) && (await page.locator('footer a[href="/gestao"]').count()) === 1);
    T.ok('sem rolagem para o lado', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: path.join(SAIDA, `loja-negocios-home-${w}.png`), fullPage: true });

    if (w < 900) {
      await page.locator('button.hamb[aria-label="Abrir menu"]').click();
      const menu = await page.locator('dialog.menu .menu-links a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      T.ok('menu do celular: sem /negocios', menu.length > 0 && !menu.some((h) => h.startsWith('/negocios')), menu);
      await page.locator('button.hamb[aria-label="Fechar menu"]').click();
    } else {
      const nav = await page.locator('header nav.nav a').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
      T.ok('topo: sem /negocios, com /tutor e /gestao', !nav.some((h) => h.startsWith('/negocios')) && nav.includes('/tutor') && nav.includes('/gestao'), nav);
    }

    for (const rota of ['/sobre', '/termos-de-uso', '/tutor', '/xixi']) {
      await page.goto(B.BASE_URL + rota);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      T.ok(`${rota}: nenhum link para /negocios`, (await linksNegocios()).length === 0, await linksNegocios());
    }
    await page.goto(B.BASE_URL + '/sobre');
    T.ok('/sobre: sem o número de manuais', !(await page.getByText(/manua(l|is) para quem trabalha/).count()));
    await page.screenshot({ path: path.join(SAIDA, `loja-negocios-sobre-${w}.png`), fullPage: true });
    await page.goto(B.BASE_URL + '/tutor');
    T.ok('/tutor: os guias continuam à venda', (await page.locator('a.card').count()) >= 10, await page.locator('a.card').count());

    T.ok('sem erro na página', erros.length === 0, erros);
    await ctx.close();
  }
}))();
