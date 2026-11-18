// Navegador (Playwright) para os testes de tela: acha o Playwright instalado, entra com um login e junta os erros da página.
// O Playwright não é dependência do projeto: use o instalado na máquina (PLAYWRIGHT=/caminho/node_modules/playwright),
// ou `npx playwright install chromium` + `npm i --no-save playwright` para ter um local.
const path = require('path');
const B = require('./base');

function playwright() {
  const tentativas = [process.env.PLAYWRIGHT, 'playwright', path.join(B.RAIZ, 'node_modules', 'playwright'), '/opt/node-tools/node_modules/playwright'].filter(Boolean);
  for (const p of tentativas) { try { return require(p); } catch { /* tenta o próximo */ } }
  throw new Error('Playwright não encontrado. Defina PLAYWRIGHT=/caminho/para/node_modules/playwright ou rode `npm i --no-save playwright`.');
}

/** Pedidos que podem falhar sem ser defeito: o assistente (Mozart) e a ajuda chamam a IA, e o servidor de teste tem chave falsa. */
const IGNORAR = /\/api\/gestao\/(assistente|ajuda|vendas)|favicon|_next\/static\/.*\.map$/;

let nav = null;
async function abrirNavegador() { nav = nav || await playwright().chromium.launch(); return nav; }
async function fecharNavegador() { if (nav) await nav.close(); nav = null; }

/** Um contexto novo (largura × altura), com fuso e idioma do Brasil, e a lista de erros da página. */
async function contexto(largura, altura) {
  const b = await abrirNavegador();
  const ctx = await b.newContext({ viewport: { width: largura, height: altura }, locale: 'pt-BR', timezoneId: process.env.TZ || 'America/Sao_Paulo', isMobile: largura < 500, hasTouch: largura < 500 });
  // WhatsApp e janelas novas não abrem de verdade
  await ctx.addInitScript(() => { window.open = () => null; });
  const page = await ctx.newPage();
  const erros = [];
  page.on('pageerror', (e) => erros.push(`erro na página: ${e.message.slice(0, 300)}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erros.push(`console: ${m.text().slice(0, 300)}`); });
  page.on('response', (r) => { if (r.status() >= 400 && !IGNORAR.test(r.url())) erros.push(`HTTP ${r.status()} ${r.request().method()} ${r.url().slice(0, 160)}`); });
  return { ctx, page, erros };
}

/** Entra pela tela de login de verdade e fecha os avisos de boas-vindas, se aparecerem. */
async function entrar(page, email, senha) {
  await page.goto(B.BASE_URL + '/gestao/entrar');
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', senha);
  await page.click('button.g-btn.pri');
  await page.waitForURL('**/gestao/app**', { timeout: 30000 });
  await page.waitForSelector('.g-main', { timeout: 30000 });
  await fecharAvisos(page);
}
async function fecharAvisos(page) {
  for (let k = 0; k < 4; k++) {
    const x = page.locator('.g-bv-pressa, .g-guia-depois').first();
    if (!(await x.count()) || !(await x.isVisible().catch(() => false))) break;
    await x.click().catch(() => {}); await page.waitForTimeout(600);
  }
}
/** Abre uma rota e espera a tela assentar (rede quieta, com teto). */
async function ir(page, rota, seletor = '.g-main') {
  await page.goto(B.BASE_URL + rota);
  if (seletor) await page.waitForSelector(seletor, { timeout: 30000 });
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(400);
}
/**
 * Toca num botão ou link do cabeçalho da tela pelo nome. No celular, as ações a mais (Exportar, Trazer de planilha, Foto do
 * caderno, Etiquetas…) ficam dentro do "Mais" (mais-acoes.tsx): se o botão não está à vista, abre o "Mais" antes.
 */
async function doAlto(page, nome, papel = 'button') {
  const alvo = () => page.locator('.g-topo .g-acoes').getByRole(papel, { name: nome }).first();
  await page.locator('.g-topo .g-acoes').first().waitFor({ timeout: 20000 });
  if (!(await alvo().isVisible().catch(() => false))) {
    const mais = page.locator('.g-topo .g-mais-botao').first();
    if (await mais.isVisible().catch(() => false)) await mais.click();
  }
  await alvo().click();
}
const rolagemLateral = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

module.exports = { playwright, abrirNavegador, fecharNavegador, contexto, entrar, fecharAvisos, ir, doAlto, rolagemLateral, IGNORAR };
