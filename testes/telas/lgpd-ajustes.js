// Ajustes da revisão jurídica nas telas (migração 20261210), em 390 e 1366:
//  - Meta Pixel: na capa /gestao o fbq nasce com autoConfig desligado ANTES do init; "Teste grátis" e "Entrar" carregam a página
//    inteira (fora do Next), então em /gestao/criar-conta e /gestao/entrar não há fbq e nenhum pedido sai para o Facebook,
//    nem digitando o e-mail. O Pixel não aparece no aplicativo (/gestao/app). Indo da capa para os Termos pelo menu (sem recarregar),
//    o fbq que ficou recebe "consent revoke". Os pedidos para o Facebook são barrados e anotados (o teste não depende da rede).
//  - Link de agendamento: o aviso "Seus dados vão só para <loja>..." junto de "Com quem a gente fala?" e o novo texto das
//    dúvidas (inteligência artificial, pode errar), sem rolagem para o lado.
//  - Opções de cobrança: multa acima de 2% mostra o aviso do contador e salva assim mesmo.
//  - Login pela tela grava o registro de acesso (com o navegador de verdade).
// Capturas em testes/saida/lgpd-ajustes-*.png.
const path = require('path');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('lgpd-ajustes-tela');
const FOTOS = path.join(B.RAIZ, 'testes', 'saida') + '/';
const foto = (page, nome) => page.screenshot({ path: `${FOTOS}lgpd-ajustes-${nome}.png` }).catch(() => {});
const FACEBOOK = /facebook\.(com|net)/;

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'LGPD tela', equipe: false });
  const loja = B.sql(`select nome from petshops where id = '${L.P}'`);
  B.must(await L.sb.dono.rpc('petshop_salvar_opcoes', { p: L.P, p_mudancas: { 'link.ia': true, 'dinheiro.multa': true } }), 'opções');
  const semRolagem = async (page, onde) => T.ok(`sem rolagem para o lado (${onde})`, (await N.rolagemLateral(page)) <= 0);

  for (const [largura, altura] of [[390, 844], [1366, 900]]) {
    const { ctx, page, erros } = await N.contexto(largura, altura);
    const face = [];
    await ctx.route(FACEBOOK, (r) => { face.push({ url: r.request().url(), pagina: page.url() }); return r.abort(); });

    T.secao(`${largura}: Meta Pixel na capa e no cadastro`);
    await N.ir(page, '/gestao', null);
    await page.waitForFunction(() => typeof window.fbq === 'function', null, { timeout: 15000 }).catch(() => {});
    const fila = await page.evaluate(() => (window.fbq && window.fbq.queue ? window.fbq.queue.map((a) => Array.from(a)) : null));
    const iAuto = fila ? fila.findIndex((a) => a[0] === 'set' && a[1] === 'autoConfig' && a[2] === false) : -1;
    const iInit = fila ? fila.findIndex((a) => a[0] === 'init') : -1;
    T.ok('na capa: autoConfig desligado antes do init', fila && iAuto >= 0 && iInit > iAuto, fila);
    const botao = page.locator('a[href="/gestao/criar-conta"]:visible').first();
    T.ok('"Teste grátis" é link comum (página inteira), não do Next', await botao.count() === 1);
    const antes = face.length;
    await botao.click();
    await page.waitForURL('**/gestao/criar-conta', { timeout: 30000 });
    await page.waitForSelector('form.g-form', { timeout: 30000 });
    const fbq = await page.evaluate(() => (typeof window.fbq === 'function' ? (window.fbq.queue || []).map((a) => Array.from(a)) : null));
    T.ok('em criar conta: sem fbq (ou com autoConfig desligado)', fbq === null || fbq.some((a) => a[0] === 'set' && a[1] === 'autoConfig' && a[2] === false), fbq);
    await page.fill('input[autocomplete=email]', `t-${L.suf}.pixel@teste-auto.local`);
    await page.waitForTimeout(1500);
    const depois = face.slice(antes).filter((f) => /criar-conta/.test(f.pagina));
    T.ok('em criar conta: nenhum pedido para o Facebook, nem digitando o e-mail', depois.length === 0, depois);
    T.ok('em criar conta: sem o script do Pixel', await page.locator('script#meta-pixel, script[src*="fbevents"]').count() === 0);

    await N.ir(page, '/gestao', null);
    const entrar = page.locator('a[href="/gestao/entrar"]:visible').first();
    T.ok('"Entrar" na capa também é link comum', await entrar.count() === 1);
    const antes2 = face.length;
    await entrar.click();
    await page.waitForURL('**/gestao/entrar', { timeout: 30000 });
    await page.waitForSelector('input[type=email]');
    await page.waitForTimeout(800);
    T.ok('em entrar: sem fbq e nenhum pedido para o Facebook', (await page.evaluate(() => typeof window.fbq)) === 'undefined'
      && face.slice(antes2).filter((f) => /\/gestao\/entrar/.test(f.pagina)).length === 0, face.slice(antes2));

    if (largura === 1366) {
      // os Termos abrem pelo menu do Next (sem recarregar): o fbq da capa fica na memória, mas com o consentimento retirado
      await N.ir(page, '/gestao', null);
      await page.waitForFunction(() => typeof window.fbq === 'function', null, { timeout: 15000 }).catch(() => {});
      await page.locator('a[href="/gestao/termos"]').first().click();
      await page.waitForURL('**/gestao/termos', { timeout: 30000 });
      await page.waitForTimeout(800);
      const q = await page.evaluate(() => (window.fbq && window.fbq.queue ? window.fbq.queue.map((a) => Array.from(a)) : []));
      T.ok('capa → Termos pelo menu: o fbq que ficou recebe "consent revoke"', q.some((a) => a[0] === 'consent' && a[1] === 'revoke'), q);
    }

    T.secao(`${largura}: login grava o registro de acesso; o aplicativo não tem Pixel`);
    const uid = B.sql(`select id from auth.users where email = ${B.q(L.emails.dono)}`);
    B.sql(`delete from registros_acesso where user_id = '${uid}'`);
    await N.entrar(page, L.emails.dono, L.senha);
    await page.waitForTimeout(1500);
    const reg = B.sql(`select string_agg(origem || ':' || (navegador is not null)::text, ',' order by em) from registros_acesso where user_id = '${uid}'`);
    T.ok('o login pela tela gravou um registro (com o navegador)', /^login:true/.test(reg), reg);
    T.ok('a abertura do aplicativo no mesmo dia não grava outro', reg === 'login:true', reg);
    T.ok('no aplicativo: sem fbq e sem script do Pixel', (await page.evaluate(() => typeof window.fbq)) === 'undefined'
      && await page.locator('script#meta-pixel, script[src*="fbevents"]').count() === 0);

    T.secao(`${largura}: aviso da multa nas opções de cobrança`);
    await N.ir(page, '/gestao/app/meu-petshop');
    await page.locator('.g-mp-atalhos button', { hasText: 'Cobrança e fidelidade' }).click();
    const sec = page.locator('#opcoes-cobranca');
    await sec.waitFor({ timeout: 15000 });
    await sec.scrollIntoViewIfNeeded();
    const pct = sec.locator('input[aria-label="Multa em por cento"]');
    await pct.fill('2');
    T.ok('multa de 2%: sem aviso', await sec.locator('[data-teste=aviso-multa]').count() === 0);
    await pct.fill('10');
    const aviso = sec.locator('[data-teste=aviso-multa]');
    T.ok('multa de 10%: aviso do limite de 2% para pessoa física', (await aviso.innerText().catch(() => '')) === 'Para clientes pessoa física, a multa por atraso costuma ser limitada a 2%. Confira com seu contador.');
    await foto(page, `${largura}-multa`);
    await semRolagem(page, 'opções de cobrança');
    await sec.locator('button', { hasText: 'Salvar opções de cobrança' }).click();
    await page.waitForTimeout(1500);
    T.ok('salva assim mesmo (o aviso não trava)', B.sql(`select opcoes ->> 'dinheiro.multa_pct' from petshops where id = '${L.P}'`) === '10');
    await pct.fill('0');
    await sec.locator('input[aria-label="Juros em por cento ao mês"]').fill('1');
    T.ok('só com juros: o aviso aparece também', await sec.locator('[data-teste=aviso-multa]').count() === 1);
    T.ok('aplicativo: sem erro na página', !erros.filter((e) => !FACEBOOK.test(e)).length, erros);
    await ctx.close();

    T.secao(`${largura}: avisos no link de agendamento`);
    const c2 = await N.contexto(largura, altura);
    await c2.ctx.route(FACEBOOK, (r) => r.abort());
    const p2 = c2.page;
    await N.ir(p2, `/gestao/agendar/${L.codigo}`, '.g-lk');
    await p2.locator('.g-lk-duv-abrir').click();
    const cab = p2.locator('.g-lk-duv-cab p');
    T.ok('dúvidas: "feitas por inteligência artificial ... Podem errar"', (await cab.innerText()) === `Respostas automáticas, feitas por inteligência artificial com o que ${loja} mostra nesta página. Podem errar: o que vale é o que ${loja} confirmar.`, await cab.innerText());
    await foto(p2, `${largura}-duvidas`);
    await semRolagem(p2, 'dúvidas');
    await p2.locator('.g-lk-duv-x').click();
    await p2.locator('.g-lk-serv', { hasText: 'Banho' }).first().click();
    await p2.locator('[data-teste=escolha-servicos] button').click();
    await p2.locator('.g-lk-hora').first().waitFor({ timeout: 30000 });
    await p2.locator('.g-lk-hora').first().click();
    await p2.locator('button', { hasText: 'Continuar' }).click();
    const nota = p2.locator('[data-teste=aviso-dados]');
    await nota.waitFor({ timeout: 15000 });
    T.ok('"Com quem a gente fala?" com o aviso dos dados', (await nota.innerText()) === `Seus dados vão só para ${loja}, para responder ao seu pedido.`);
    await nota.scrollIntoViewIfNeeded();
    await foto(p2, `${largura}-seus-dados`);
    await semRolagem(p2, 'link, seus dados');
    T.ok('link: sem erro na página', !c2.erros.filter((e) => !FACEBOOK.test(e)).length, c2.erros);
    await c2.ctx.close();
  }
  await N.fecharNavegador();
}))();
