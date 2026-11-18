// Mozart na tela depois da 2ª rodada (rota de verdade com GESTAO_MOZART_FALSO=1, nunca o modelo).
//  - Juliana N1: logo depois de mandar, a linha "Pensando…" aparece embaixo dos três pontinhos.
//  - Juliana N3: recarregar no meio da resposta: a parte que já tinha chegado volta marcada "Resposta interrompida",
//    o cabeçalho não fica em "digitando…" e "Perguntar de novo" traz a resposta inteira.
// Em 390 e 1366, sem erro na página e sem rolagem para o lado.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('mozart-v2-telas');
const { falsos } = require('../lib/voz-falsa');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Mozart v2', equipe: false, dados: false });

  for (const [largura, altura] of [[390, 844], [1366, 900]]) {
    const celular = largura < 500;
    const { ctx, page, erros } = await N.contexto(largura, altura);
    await ctx.addInitScript(falsos);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app');
    const painel = page.locator('.g-ass-painel[aria-label="Conversa com o Mozart"]');
    await page.locator(celular ? '.g-aba-mic' : '.g-fab').first().click();
    await painel.waitFor({ timeout: 10000 });

    T.secao(`${largura}: a linha de espera aparece na hora`);
    const c = painel.locator('textarea');
    await c.fill('oi mozart, tudo certo por aí?');
    const t0 = Date.now();
    await c.press('Enter');
    await painel.locator('.g-ass-progresso').waitFor({ timeout: 3000 }).catch(() => {});
    const ms = Date.now() - t0;
    const frase = await painel.locator('.g-ass-progresso').innerText().catch(() => '');
    T.ok(`"Pensando…" embaixo dos três pontinhos (${ms} ms)`, /Pensando…/.test(frase) && ms < 1500, frase);

    T.secao(`${largura}: recarregar no meio da resposta`);
    // a resposta de teste chega palavra por palavra (~60 ms cada): recarrega quando já chegou uma parte
    await page.waitForFunction(() => (document.querySelector('.g-ass-aovivo')?.textContent || '').split(/\s+/).length >= 5, null, { timeout: 10000 });
    await page.reload();
    await painel.waitFor({ timeout: 15000 });
    const cortada = painel.locator('.g-bolha.ela', { hasText: 'Resposta interrompida' });
    await cortada.waitFor({ timeout: 5000 }).catch(() => {});
    T.ok('a parte que já tinha chegado volta, marcada "Resposta interrompida"', (await cortada.count()) === 1 && /Esta resposta/.test(await cortada.innerText()), await painel.locator('.g-ass-conversa').innerText());
    T.ok('o aviso diz que ficou pela metade e o topo não está em "digitando…"', /ficou pela metade/.test(await painel.innerText()) && !/digitando…/.test(await painel.locator('.g-ass-topo').innerText()));
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/mozart-v2-interrompida-${largura}.png` }).catch(() => {});
    const de = painel.locator('button', { hasText: 'Perguntar de novo' });
    T.ok('tem o botão "Perguntar de novo"', (await de.count()) === 1);
    await de.click();
    await page.waitForFunction(() => !document.querySelector('.g-ass-painel .g-bolha.pensa'), null, { timeout: 15000 });
    const conversa = await painel.locator('.g-ass-conversa').innerText();
    T.ok('a resposta inteira chegou e o botão saiu', /enquanto o Mozart escreve\./.test(conversa) && (await de.count()) === 0, conversa.slice(-400));
    T.ok('o pedido foi mandado de novo (aparece duas vezes)', (conversa.match(/oi mozart, tudo certo por aí\?/g) || []).length === 2);
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/mozart-v2-de-novo-${largura}.png` }).catch(() => {});

    T.ok('nenhum erro na tela', erros.filter((e) => !/aborted|ERR_FAILED|Failed to fetch|network/i.test(String(e))).length === 0, erros.slice(0, 4));
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 0);
    await painel.locator('button[aria-label="Começar conversa nova"]').click();
    await ctx.close();
  }
}))();
