// Ditado nos campos de texto livre (src/components/gestao/ditado.tsx, CampoComVoz): o microfone pequeno no canto das
// observações. Com o ditado de mentira (lib/voz-falsa.js): o falado entra depois do que já estava escrito, com um espaço,
// o pedaço provisório aparece ao vivo, nada é salvo sozinho, microfone bloqueado mostra a ajuda e navegador sem ditado não
// mostra botão. Ficha do pet nova (cuidados e alertas, observações) e Marcar horário (observação). 390 e 1366.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('ditado');
const { falsos } = require('../lib/voz-falsa');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Ditado', equipe: false });

  for (const [largura, altura] of [[390, 844], [1366, 900]]) {
    const { ctx, page, erros } = await N.contexto(largura, altura);
    await ctx.addInitScript(falsos);
    await N.entrar(page, L.emails.dono, L.senha);
    const gravacoes = [];
    page.on('request', (r) => { if (r.method() !== 'GET' && /\/rest\/v1\/(pets|clientes|agendamentos)/.test(r.url())) gravacoes.push(r.url()); });
    const ouvir = (partes) => page.evaluate((p) => window.__voz.ultimo._ouvir(p), partes);
    // parar de falar: a fala termina depois da pausa de 3 s (o navegador encerrar a escuta sozinho só faz ela recomeçar)
    const silencio = () => page.waitForTimeout(3300);

    T.secao(`${largura}: ficha do pet nova`);
    await N.ir(page, '/gestao/app/clientes?novo=1');
    const micAlertas = page.locator('button[aria-label="Ditar os cuidados e alertas"]');
    await micAlertas.waitFor({ timeout: 10000 });
    T.ok('microfone nos cuidados e alertas e nas observações', (await micAlertas.count()) === 1 && (await page.locator('button[aria-label="Ditar as observações"]').count()) === 1);
    const alertas = page.locator('.g-ditado', { has: micAlertas }).locator('textarea');
    await alertas.fill('medo de secador.');
    await micAlertas.click();
    await page.waitForTimeout(100);
    const cfg = await page.evaluate(() => ({ lang: window.__voz.ultimo.lang, provisorio: window.__voz.ultimo.interimResults }));
    T.ok('pt-BR com resultados provisórios', cfg.lang === 'pt-BR' && cfg.provisorio === true, cfg);
    T.ok('"Ouvindo…" com a bolinha embaixo do campo', /Ouvindo…/.test(await page.locator('.g-ditado-faixa').innerText()) && (await page.locator('.g-ditado .g-voz-ponto').count()) === 1);
    await ouvir([['alergia', false]]);
    await page.waitForTimeout(80);
    T.ok('o pedaço provisório aparece depois do escrito, com espaço', (await alertas.inputValue()) === 'medo de secador. alergia', await alertas.inputValue());
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/ditado-ouvindo-${largura}.png` }).catch(() => {});
    await ouvir([['alergia a shampoo de aveia', true]]);
    await silencio();
    await page.waitForTimeout(300);
    T.ok('o final fica no campo', (await alertas.inputValue()) === 'medo de secador. alergia a shampoo de aveia', await alertas.inputValue());
    T.ok('parou de ouvir', (await page.locator('.g-ditado-faixa').count()) === 0 && (await micAlertas.getAttribute('aria-label')) === 'Ditar os cuidados e alertas');
    await page.waitForTimeout(2200);
    T.ok('nada foi salvo sozinho', gravacoes.length === 0, gravacoes);

    T.secao(`${largura}: microfone bloqueado e campo cheio`);
    await page.evaluate(() => { window.__vozModo = 'negado'; });
    const micObs = page.locator('button[aria-label="Ditar as observações"]');
    await micObs.click();
    await page.waitForTimeout(300);
    const aviso = await page.locator('.g-ditado-faixa.erro').innerText().catch(() => '');
    T.ok('ajuda curta: "Libere o microfone nas configurações do navegador"', /Libere o microfone nas configurações do navegador/.test(aviso), aviso);
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/ditado-bloqueado-${largura}.png` }).catch(() => {});
    await page.evaluate(() => { window.__vozModo = ''; });
    const obs = page.locator('.g-ditado', { has: micObs }).locator('textarea');
    await obs.fill('x'.repeat(595));
    await micObs.click();
    await ouvir([['passa do limite do campo', true]]);
    await silencio();
    await page.waitForTimeout(200);
    T.ok('o falado respeita o tamanho do campo (600)', (await obs.inputValue()).length === 600);
    T.ok('o microfone não cobre o texto (espaço à direita)', (await obs.evaluate((t) => parseFloat(getComputedStyle(t).paddingRight))) >= 50);

    T.secao(`${largura}: Marcar horário`);
    await N.ir(page, '/gestao/app/agenda?novo=1');
    await page.locator('.g-folha, [role="dialog"]').getByText('Bob', { exact: true }).first().click().catch(() => {});
    const micAg = page.locator('button[aria-label="Ditar a observação"]');
    await micAg.waitFor({ timeout: 10000 }).catch(() => {});
    T.ok('microfone na observação do horário', (await micAg.count()) === 1);
    if (await micAg.count()) {
      await micAg.click();
      await ouvir([['tosa na máquina quatro laço rosa', true]]);
      await silencio();
      await page.waitForTimeout(200);
      T.ok('o falado entra no campo vazio, sem espaço na frente', (await page.locator('.g-ditado', { has: micAg }).locator('textarea').inputValue()) === 'tosa na máquina quatro laço rosa');
    }
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/ditado-agenda-${largura}.png` }).catch(() => {});

    T.secao(`${largura}: navegador sem ditado`);
    await page.evaluate(() => localStorage.setItem('teste:voz', 'sem'));
    await N.ir(page, '/gestao/app/clientes?novo=1');
    await page.locator('.g-textarea').first().waitFor({ timeout: 10000 });
    T.ok('nenhum microfone nos campos, e eles continuam lá', (await page.locator('.g-ditado-mic').count()) === 0 && (await page.locator('.g-textarea').count()) >= 2);
    await page.evaluate(() => localStorage.removeItem('teste:voz'));

    T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 4));
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 0);
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
