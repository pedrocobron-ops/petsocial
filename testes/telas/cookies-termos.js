// Aviso de cookies e Termos/Política no navegador (Juliana, 17/11; versão 2.4 em 18/11):
//   - o aviso só aparece onde o Pixel carrega: na capa /gestao sim; no cadastro, na entrada, nos Termos e na Política do Gestão não;
//   - o aviso tem Aceitar e Recusar; recusando, a escolha fica guardada, o cookie _fbp some, o fbevents.js não baixa e o aviso não volta;
//   - consentimento primeiro (Juliana, 2ª rodada): antes de escolher, o fbevents.js não baixa; só depois do Aceitar;
//   - a política do site (parte 5) mostra a escolha e deixa mudar;
//   - Política do Gestão: e-mail de privacidade uma vez só na parte 13, "responsável pela marca", sem "página nova, sem o pixel";
//   - Termos: cópias de segurança como são (parte 16) e troca de plano (parte 7).
// Capturas em testes/saida/cookies-*.png e termos-*.png (390 e 1366).
const path = require('path');
const B = require('../lib/base');
const N = require('../lib/navegador');
const T = require('../lib/teste')('cookies-termos');
const SAIDA = path.join(B.RAIZ, 'testes', 'saida');
const { EMPRESA } = require('../lib/app').lib('../empresa');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  for (const [w, h] of [[390, 844], [1366, 768]]) {
    T.secao(`aviso de cookies (${w})`);
    const { ctx, page } = await N.contexto(w, h);
    // o Pixel não sai daqui (sem internet de verdade nos testes)
    const pedidosPixel = [];
    await ctx.route('https://connect.facebook.net/**', (r) => { pedidosPixel.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }); });
    for (const rota of ['/gestao/criar-conta', '/gestao/entrar', '/gestao/termos', '/gestao/privacidade']) {
      await page.goto(B.BASE_URL + rota);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(500);
      T.ok(`${rota}: sem aviso de cookies (não há medição)`, !(await page.locator('.cookies').count()));
    }
    T.ok('nas telas do Gestão o Pixel não carregou', pedidosPixel.length === 0, pedidosPixel);
    await page.goto(B.BASE_URL + '/gestao');
    const aviso = page.locator('.cookies');
    await aviso.waitFor({ timeout: 15000 });
    T.ok('capa /gestao (com Pixel): o aviso aparece com Recusar e Aceitar',
      (await aviso.locator('button', { hasText: 'Recusar' }).count()) === 1 && (await aviso.locator('button', { hasText: 'Aceitar' }).count()) === 1);
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    T.ok('antes de escolher: o fbevents.js não baixa (consentimento primeiro)', pedidosPixel.length === 0, pedidosPixel);
    T.ok('… e o fbq não tem o script de verdade (só a fila, sem rede e sem cookie)', await page.evaluate(() => !document.querySelector('script[src*="fbevents"]') && !document.cookie.includes('_fbp')));
    // a pílula sai do caminho enquanto cobre um link da página: rola um pouco (menos de 160 px) até ela ficar livre
    for (let y = 0; y <= 140 && (await page.locator('.cookies.desvia, .cookies.fora').count()); y += 35) {
      await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(350);
    }
    const caixa = await aviso.locator('button', { hasText: 'Aceitar' }).boundingBox();
    T.ok('o botão Aceitar cabe inteiro na tela', !!caixa && caixa.x + caixa.width <= w, caixa);
    T.ok('o aviso fica tocável sem cobrir nada', !(await page.locator('.cookies.desvia, .cookies.fora').count()));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(SAIDA, `cookies-aviso-${w}.png`) });
    await ctx.addCookies([{ name: '_fbp', value: 'fb.1.123.456', url: B.BASE_URL }]);
    await aviso.locator('button', { hasText: 'Recusar' }).click();
    await page.waitForTimeout(400);
    T.ok('Recusar: a escolha fica guardada no navegador', (await page.evaluate(() => localStorage.getItem('mp-cookies'))) === 'recusado');
    T.ok('… o cookie _fbp é apagado', !(await ctx.cookies()).some((c) => c.name === '_fbp'));
    pedidosPixel.length = 0;
    await page.reload();
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    T.ok('… ao voltar, o aviso não aparece de novo', !(await page.locator('.cookies').count()));
    T.ok('… e o fbevents.js nem baixa', pedidosPixel.length === 0, pedidosPixel);
    T.ok('… e a fila do Pixel começa com o consentimento retirado', await page.evaluate(() => Array.isArray(window.fbq?.queue) && window.fbq.queue.some((a) => a[0] === 'consent' && a[1] === 'revoke')));

    T.secao(`política do site (${w})`);
    await page.goto(B.BASE_URL + '/politica-de-privacidade#cookies');
    const escolha = page.locator('.escolha-cookies');
    await escolha.waitFor({ timeout: 15000 });
    T.ok('a parte 5 mostra que este navegador recusou', /recusou/.test(await escolha.textContent()));
    pedidosPixel.length = 0;
    await escolha.locator('button').click();
    T.ok('… e dá para aceitar de novo', (await page.evaluate(() => localStorage.getItem('mp-cookies'))) === 'aceito' && /aceitou/.test(await escolha.textContent()));
    await page.waitForFunction(() => !!document.querySelector('script[src*="fbevents"]'), null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(500);
    T.ok('… e só depois do Aceitar o fbevents.js baixa', pedidosPixel.some((u) => /fbevents/.test(u)), pedidosPixel);
    T.ok('a política diz que o Pixel só funciona depois do Aceitar (e a base legal é o consentimento)', /só começa a funcionar depois que você toca em Aceitar/.test(await page.locator('body').textContent())
      && /Consentimento \(I\), dado no aviso de cookies/.test(await page.locator('body').textContent()));
    T.ok('… sem rolagem para o lado', (await N.rolagemLateral(page)) <= 0);
    await page.screenshot({ path: path.join(SAIDA, `cookies-politica-${w}.png`) });
    await ctx.close();
  }

  T.secao('Política do Gestão 2.4');
  const { ctx, page, erros } = await N.contexto(390, 844);
  await page.goto(B.BASE_URL + '/gestao/privacidade');
  await page.waitForSelector('#direitos');
  const direitos = await page.locator('#direitos').textContent();
  const vezes = (txt, s) => txt.split(s).length - 1;
  T.ok('parte 13: o e-mail de privacidade aparece uma vez só (não "x ou x")', vezes(direitos, EMPRESA.emailJuridico || EMPRESA.email) === 1, direitos.slice(direitos.indexOf('Para o resto') - 10, direitos.indexOf('Para o resto') + 140));
  const contato = await page.locator('#contato').textContent();
  T.ok('parte 17: idem', vezes(contato, EMPRESA.emailJuridico || EMPRESA.email) === 1, contato);
  const quem = await page.locator('#quem-somos').textContent();
  T.ok('parte 1: "responsável pela marca" (não "dona da marca")', /responsável pela marca/.test(quem) && !/dona da marca/.test(quem));
  const aparelho = await page.locator('#aparelho').textContent();
  T.ok('parte 10: sem a promessa errada de "página nova, sem o pixel"', !/página nova/.test(aparelho) && /mesma aba/.test(aparelho));
  T.ok('parte 11: as cópias de segurança dizem o que existe', /cópia completa/.test(await page.locator('#guarda').textContent()));
  T.ok('versão 2.4 no topo', /Versão 2\.4/.test(await page.locator('body').textContent()));
  await page.screenshot({ path: path.join(SAIDA, 'termos-privacidade-390.png') });

  T.secao('Termos 2.4');
  await page.goto(B.BASE_URL + '/gestao/termos');
  await page.waitForSelector('#disponivel');
  const disp = await page.locator('#disponivel').textContent();
  T.ok('parte 16: as duas cópias, sem prometer prazo, e o que fazer se apagar por engano', /Supabase/.test(disp) && /cópia completa/.test(disp) && /não prometemos/.test(disp) && /Apagou algo por engano/.test(disp));
  const cancelar = await page.locator('#cancelar').textContent();
  T.ok('parte 7: troca de plano e os meses que sobraram', /Mudar de plano ou de período/.test(cancelar) && /não viram crédito nem desconto/.test(cancelar));
  T.ok('Termos 2.4: "vigente desde 18/11/2026" (a 2.3 entrou em 17/11; a 2.4, da revisão de privacidade, em 18/11)', /vigente desde 18\/11\/2026/.test(await page.locator('body').textContent()));
  T.ok('sem palavras grudadas: "desconto no plano" e "controlador (decide"', /desconto no plano novo/.test(cancelar) && /controlador \(decide/.test(await page.locator('body').textContent()));
  T.ok('parte 19: "Escola de Gestão" explicada', /Escola de Gestão \(a área do sistema/.test(await page.locator('#marca').textContent()));
  await page.locator('#disponivel').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(SAIDA, 'termos-copias-390.png') });

  T.secao('cadastro sem marcar os Termos (Rafael)');
  await page.goto(B.BASE_URL + '/gestao/criar-conta');
  await page.waitForSelector('form.g-form');
  await page.fill('input[autocomplete=name]', 'Sem Aceite');
  await page.fill('input[autocomplete=email]', 'sem-aceite@teste-auto.local');
  await page.fill('input[autocomplete=off]', 'sem-aceite@teste-auto.local');
  await page.fill('input[type=password]', 'SenhaBoa123!');
  await page.click('button[type=submit]');
  const msg = await page.locator('.g-erro').textContent({ timeout: 5000 }).catch(() => '');
  T.ok('sem marcar: aparece o aviso em português da tela (não só o balão do navegador)', /leia e aceite os Termos/.test(msg), msg);
  T.ok('… e nenhuma conta é criada', B.num(`select count(*) from auth.users where email='sem-aceite@teste-auto.local'`) === 0);
  T.ok('Termos e Política: nenhum erro de página', erros.length === 0, erros);
  T.ok('Termos: sem rolagem para o lado', (await N.rolagemLateral(page)) <= 0);
  await ctx.close();
  await N.fecharNavegador();
}))();
