// Falar com o Mozart (src/components/gestao/voz.tsx): o ditado do navegador é trocado por um de mentira (addInitScript),
// que o teste faz "ouvir" pedaços (provisórios e finais), terminar no silêncio, recusar o microfone ou nem existir.
// O servidor do Mozart vira um roteiro lento (page.route), como em mozart-fila.js: só a tela é testada. 390 e 1366.
// Confere: texto ao vivo na caixa, "Ouvindo…", 2 s de "Enviando… · Editar" e envio uma vez só; tocar na caixa e Editar cancelam;
// segurar para falar; tocar para parar; silêncio e 30 s; microfone bloqueado; navegador sem ditado; ler em voz alta; Ajuda.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('mozart-voz');
const { falsos } = require('../lib/voz-falsa');

const SAIDA = `${B.RAIZ}/testes/saida`;

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Mozart voz', equipe: false, dados: false });

  for (const [largura, altura] of [[390, 844], [1366, 900]]) {
    const celular = largura < 500;
    const { ctx, page, erros } = await N.contexto(largura, altura);
    await ctx.addInitScript(falsos);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app');

    const pedidos = [];
    await page.route('**/api/gestao/assistente', async (r) => {
      const corpo = r.request().postDataJSON();
      pedidos.push(corpo);
      await new Promise((ok) => setTimeout(ok, 900));
      const texto = corpo.texto ? `Entendi: ${corpo.texto}. Confere?` : 'Tudo bem.';
      await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ mensagens: [], parciais: [], links: [], mudou: false, texto, propostas: [] }) }).catch(() => {});
    });

    const abrirMozart = async () => {
      await page.locator(celular ? '.g-aba-mic' : '.g-fab').first().click();
      const p = page.locator('.g-ass-painel[aria-label="Conversa com o Mozart"]');
      await p.waitFor({ timeout: 10000 });
      return p;
    };
    let painel = await abrirMozart();
    const caixa = painel.locator('textarea');
    const mic = painel.locator('button.g-mic.voz');
    const faixa = painel.locator('.g-voz-faixa');
    const voz = (f) => page.evaluate(f);
    const ouvir = (partes) => page.evaluate((p) => window.__voz.ultimo._ouvir(p), partes);
    const silencio = () => voz(() => window.__voz.ultimo._fim());
    const tela = (nome) => page.screenshot({ path: `${SAIDA}/mozart-voz-${nome}-${largura}.png` }).catch(() => {});
    const esperarResposta = () => page.waitForFunction(() => !document.querySelector('.g-bolha.pensa'), null, { timeout: 10000 });

    T.secao(`${largura}: microfone e texto ao vivo`);
    T.ok('o microfone aparece, grande, com nome para o leitor de tela', (await mic.count()) === 1 && /Falar/.test(await mic.getAttribute('aria-label')));
    // espera a animação de abrir o painel terminar (no meio dela o botão ainda está menor)
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect && a.effect.getTiming().iterations !== Infinity).map((a) => a.finished.catch(() => {}))));
    const tam = await mic.boundingBox();
    T.ok('botão de pelo menos 56 px', tam && tam.width >= 55 && tam.height >= 55, tam);
    await mic.click();
    await page.waitForTimeout(150);
    const r1 = await voz(() => ({ lang: window.__voz.ultimo.lang, provisorios: window.__voz.ultimo.interimResults, comecou: window.__voz.comecou }));
    T.ok('ditado em pt-BR com resultados provisórios', r1.lang === 'pt-BR' && r1.provisorios === true && r1.comecou === 1, r1);
    T.ok('"Ouvindo…" com a bolinha vermelha', /Ouvindo…/.test(await faixa.innerText()) && (await faixa.locator('.g-voz-ponto').count()) === 1);
    T.ok('o topo diz "ouvindo você…" e o botão vira Parar', /ouvindo você/.test(await painel.locator('.g-ass-topo').innerText()) && (await mic.getAttribute('aria-label')) === 'Parar de ouvir');
    await ouvir([['marca banho', false]]);
    await page.waitForTimeout(100);
    T.ok('o pedaço provisório aparece na caixa enquanto fala', (await caixa.inputValue()) === 'marca banho', await caixa.inputValue());
    await tela('ouvindo');
    await ouvir([['marca banho do tor amanhã às dez e meia', true]]);
    await silencio();
    await page.waitForTimeout(150);

    T.secao(`${largura}: 2 segundos para corrigir e envia sozinho`);
    T.ok('o texto final fica na caixa', (await caixa.inputValue()) === 'marca banho do tor amanhã às dez e meia', await caixa.inputValue());
    const contagem = (await faixa.innerText().catch(() => '')).replace(/\s+/g, ' ');
    T.ok('"Enviando… · Editar" com a contagem', /Enviando… 2/.test(contagem) && /Editar/.test(contagem), contagem);
    await tela('enviando');
    T.ok('ainda não foi mandado', pedidos.length === 0);
    await page.waitForTimeout(2400);
    T.ok('depois de 2 s foi mandado, uma vez, com o texto falado', pedidos.length === 1 && pedidos[0].texto === 'marca banho do tor amanhã às dez e meia', pedidos.map((p) => p.texto));
    T.ok('a caixa fica livre e a faixa some', (await caixa.inputValue()) === '' && (await faixa.count()) === 0);
    await esperarResposta();
    await page.waitForTimeout(1500);
    T.ok('não manda de novo', pedidos.length === 1);

    T.secao(`${largura}: tocar na caixa cancela o envio`);
    await mic.click();
    await ouvir([['recebi trinta e cinco reais do bob', true]]);
    await silencio();
    await page.waitForTimeout(150);
    T.ok('contagem começou', /Enviando…/.test(await faixa.innerText().catch(() => '')));
    await caixa.click();
    await page.waitForTimeout(2600);
    T.ok('tocou na caixa: nada foi mandado', pedidos.length === 1, pedidos.map((p) => p.texto));
    T.ok('a contagem sumiu e o texto ficou para corrigir', (await faixa.count()) === 0 && (await caixa.inputValue()) === 'recebi trinta e cinco reais do bob');
    await caixa.fill('recebi trinta e cinco reais do Bob no pix');
    await caixa.press('Enter');
    await page.waitForTimeout(300);
    T.ok('corrigiu e mandou pelo Enter', pedidos.length === 2 && pedidos[1].texto === 'recebi trinta e cinco reais do Bob no pix');
    await esperarResposta();

    T.secao(`${largura}: Editar cancela; desligar "Enviar sozinho"`);
    await mic.click();
    await ouvir([['quem não vem a um mês', true]]);
    await silencio();
    await page.waitForTimeout(150);
    await faixa.locator('button', { hasText: 'Editar' }).click();
    await page.waitForTimeout(2600);
    T.ok('Editar: nada foi mandado e a caixa ficou com o foco', pedidos.length === 2 && (await caixa.evaluate((c) => document.activeElement === c)));
    await caixa.fill('');
    await painel.locator('button[aria-label="Ajustes da voz"]').click();
    const auto = painel.locator('label', { hasText: 'Enviar sozinho depois de falar' }).locator('input');
    T.ok('"Enviar sozinho depois de falar" vem ligado', await auto.isChecked());
    const ler = painel.locator('label', { hasText: 'Ler as respostas do Mozart em voz alta' }).locator('input');
    T.ok('"Ler as respostas em voz alta" vem desligado', !(await ler.isChecked()));
    await tela('ajustes');
    await auto.uncheck();
    T.ok('fica guardado no aparelho', (await page.evaluate(() => localStorage.getItem('gestao:voz:enviar-sozinho'))) === '0');
    await mic.click();
    await ouvir([['que horários tenho livres amanhã', true]]);
    await silencio();
    await page.waitForTimeout(2600);
    T.ok('desligado: o texto fica na caixa, sem contagem e sem mandar', pedidos.length === 2 && (await caixa.inputValue()) === 'que horários tenho livres amanhã' && (await faixa.count()) === 0);
    await caixa.fill('');
    await auto.check();

    T.secao(`${largura}: ler em voz alta`);
    await ler.check();
    await caixa.fill('quanto entrou hoje');
    await caixa.press('Enter');
    await esperarResposta();
    await page.waitForTimeout(200);
    const falas = await voz(() => window.__voz.falas);
    // lida frase por frase (cada frase é uma fala): "Entendi: quanto entrou hoje." e "Confere?"
    T.ok('ligado: a resposta nova é lida em pt-BR, frase por frase', falas.length === 2 && /Entendi: quanto entrou hoje\./.test(falas[0].texto) && falas[1].texto === 'Confere?' && falas.every((f) => f.lang === 'pt-BR'), falas);
    await ler.uncheck();
    T.ok('o ajuste fica guardado', (await page.evaluate(() => localStorage.getItem('gestao:voz:ler-respostas'))) === '0');
    await painel.locator('button[aria-label="Ajustes da voz"]').click();
    const alto = painel.locator('.g-bolha.ela button.g-ass-ouvir').first();
    T.ok('cada resposta tem o alto-falante', (await painel.locator('.g-bolha.ela button.g-ass-ouvir').count()) >= 2 && (await alto.getAttribute('aria-label')) === 'Ouvir esta resposta');
    await alto.click();
    await page.waitForTimeout(100);
    T.ok('tocar no alto-falante lê aquela resposta', (await voz(() => window.__voz.falas.length)) > falas.length && (await alto.getAttribute('aria-pressed')) === 'true');
    await tela('lendo');
    await page.waitForTimeout(500);

    T.secao(`${largura}: segurar para falar e tocar para parar`);
    const antesParou = await voz(() => window.__voz.parou);
    const caixaMic = await mic.boundingBox();
    if (celular) {
      // toque de dedo: pointerdown, segura, pointerup
      await mic.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 7, isPrimary: true, button: 0, buttons: 1, bubbles: true });
    } else {
      await page.mouse.move(caixaMic.x + caixaMic.width / 2, caixaMic.y + caixaMic.height / 2);
      await page.mouse.down();
    }
    await page.waitForTimeout(700);
    await ouvir([['bloqueia o almoço de amanhã', true]]);
    T.ok('segurando: ouvindo', /Ouvindo…/.test(await faixa.innerText().catch(() => '')));
    if (celular) await mic.dispatchEvent('pointerup', { pointerType: 'touch', pointerId: 7, isPrimary: true, button: 0, buttons: 0, bubbles: true });
    else await page.mouse.up();
    await page.waitForTimeout(250);
    T.ok('soltou: parou de ouvir e começou a contagem', (await voz(() => window.__voz.parou)) === antesParou + 1 && /Enviando…/.test(await faixa.innerText().catch(() => '')));
    await page.waitForTimeout(2400);
    T.ok('e mandou', pedidos.length === 4 && pedidos[3].texto === 'bloqueia o almoço de amanhã', pedidos.map((p) => p.texto));
    await esperarResposta();
    await mic.click();
    await page.waitForTimeout(100);
    T.ok('toque rápido: continua ouvindo depois de soltar', /Ouvindo…/.test(await faixa.innerText().catch(() => '')));
    await mic.click();
    await page.waitForTimeout(200);
    T.ok('outro toque: para; sem fala, "Não ouvi nada"', (await voz(() => window.__voz.parou)) === antesParou + 2 && /Não ouvi nada/.test(await faixa.innerText().catch(() => '')));
    T.ok('e nada é mandado', pedidos.length === 4);

    T.secao(`${largura}: microfone bloqueado`);
    await page.evaluate(() => { window.__vozModo = 'negado'; });
    await mic.click();
    await page.waitForTimeout(300);
    const bloqueado = await faixa.innerText().catch(() => '');
    T.ok('mostra a ajuda curta: "Libere o microfone nas configurações do navegador"', /Libere o microfone nas configurações do navegador/.test(bloqueado), bloqueado);
    T.ok('e não fica ouvindo', !(await page.locator('.g-voz-ponto').count()) && (await mic.getAttribute('aria-label')) !== 'Parar de ouvir');
    await tela('bloqueado');
    await page.evaluate(() => { window.__vozModo = ''; });
    await faixa.locator('button', { hasText: 'Fechar' }).click();
    T.ok('a ajuda fecha', (await faixa.count()) === 0);

    T.secao(`${largura}: Ajuda também tem microfone`);
    await painel.locator('button[aria-label="Fechar a conversa"]').click();
    await painel.waitFor({ state: 'detached', timeout: 5000 });
    await page.waitForTimeout(700); // a barra de baixo ignora o toque logo depois de fechar uma janela (toque duplo)
    if (celular) { await page.locator('.g-abas button', { hasText: 'Mais' }).click(); await page.locator('.g-btn.verde', { hasText: 'Ajuda' }).click(); }
    else await page.locator('.g-lado .g-nav button', { hasText: 'Ajuda' }).click();
    const ajuda = page.locator('.g-ass-painel[aria-label="Ajuda"]');
    await ajuda.waitFor({ timeout: 10000 });
    const micAjuda = ajuda.locator('button.g-mic.voz');
    T.ok('o microfone está na caixa da Ajuda', (await micAjuda.count()) === 1);
    await micAjuda.click();
    await ouvir([['como eu fecho o caixa', true]]);
    await silencio();
    await page.waitForTimeout(2600);
    T.ok('o texto falado fica na caixa (a Ajuda não manda sozinha)', (await ajuda.locator('textarea').inputValue()) === 'como eu fecho o caixa' && (await ajuda.locator('button.g-mic.enviar').isEnabled()));
    await tela('ajuda');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    T.secao(`${largura}: para no silêncio e depois de 30 s`);
    await page.clock.install();
    painel = await abrirMozart();
    await page.evaluate(() => { window.__voz.parou = 0; });
    await mic.click();
    await page.clock.runFor(8500);
    await page.waitForTimeout(150);
    T.ok('8 s sem ouvir nada: para sozinho', (await voz(() => window.__voz.parou)) === 1 && (await mic.getAttribute('aria-label')) !== 'Parar de ouvir');
    await mic.click();
    for (let s = 0; s < 6; s++) { await ouvir([[`fala comprida ${s}`, false]]); await page.clock.runFor(5500); }
    await page.waitForTimeout(150);
    T.ok('falando sem parar: para em 30 s', (await voz(() => window.__voz.parou)) === 2 && (await mic.getAttribute('aria-label')) !== 'Parar de ouvir');
    await caixa.fill('');
    await page.keyboard.press('Escape');

    T.secao(`${largura}: navegador sem ditado`);
    await page.waitForTimeout(2500); // a fala comprida, se chegou a ir, já foi
    const antesSem = pedidos.length;
    await page.evaluate(() => localStorage.setItem('teste:voz', 'sem'));
    await N.ir(page, '/gestao/app');
    painel = await abrirMozart();
    T.ok('sem microfone na caixa, sem ajustes de voz de ditado', (await painel.locator('button.g-mic.voz').count()) === 0 && !(await painel.locator('label', { hasText: 'Enviar sozinho' }).count()));
    T.ok('o enviar continua lá', (await painel.locator('button.g-mic.enviar').count()) === 1);
    T.ok('o Mozart sugere o microfone do teclado', /microfone do teclado/.test(await painel.innerText()));
    await painel.locator('textarea').fill('oi');
    await painel.locator('textarea').press('Enter');
    await page.waitForTimeout(300);
    T.ok('escrever continua funcionando', pedidos.length === antesSem + 1 && pedidos[antesSem].texto === 'oi', pedidos.map((p) => p.texto));
    await esperarResposta();
    await tela('sem-ditado');
    await page.evaluate(() => localStorage.removeItem('teste:voz'));

    T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 4));
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 0);
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
