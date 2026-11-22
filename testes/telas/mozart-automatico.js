// Mozart no modo automático, na tela, com a rota de verdade e o roteiro de teste (GESTAO_MOZART_FALSO=1, nunca o modelo):
//  - o dono abre os ajustes do Mozart e marca Modo automático: aparece o aviso "Ligar o modo automático?" com o texto do dono;
//    "Ligar o automático" só funciona depois de marcar Entendi; ligado, o topo mostra o selo Automático (o aceite fica no banco);
//  - "bloqueia o almoço de amanhã" grava na hora, sem o cartão de confirmação: aparece o cartão Feito com o Desfazer, e o
//    Desfazer tira o bloqueio do banco;
//  - "bloqueia o começo e o fim de amanhã" (dois de uma vez) grava os dois em ordem, sem Confirmar tudo;
//  - tocar no selo abre os ajustes; desmarcar desliga e o selo some.
// Em 390 e 1366, sem erro na página e sem rolagem para o lado.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('mozart-automatico-telas');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Mozart automático telas', equipe: false, dados: false });
  const q = (s) => B.sql(s);
  const bloqueios = () => Number(q(`select count(*) from bloqueios where petshop_id='${L.P}'`));
  const ligadoNoBanco = () => q(`select mozart_automatico from profissionais where id='${L.ids.dono}'`) === 't';

  for (const [largura, altura] of [[390, 844], [1366, 900]]) {
    const celular = largura < 500;
    q(`delete from bloqueios where petshop_id='${L.P}'; update profissionais set mozart_automatico = false where id='${L.ids.dono}'`);
    const aceitesAntes = Number(q(`select count(*) from mozart_automatico_aceites where petshop_id='${L.P}' and ligou`));
    const { ctx, page, erros } = await N.contexto(largura, altura);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app');
    await page.locator(celular ? '.g-aba-mic' : '.g-fab').first().click();
    const painel = page.locator('.g-ass-painel[aria-label="Conversa com o Mozart"]');
    await painel.waitFor({ timeout: 10000 });
    const chip = painel.locator('.g-ass-auto');

    T.secao(`${largura}: ligar pelo aviso, com Entendi`);
    T.ok('desligado no começo: sem o selo Automático', (await chip.count()) === 0);
    await painel.locator('button[title="Ajustes"]').click();
    const opcao = painel.locator('#mozart-automatico input[type="checkbox"]');
    await opcao.waitFor({ timeout: 10000 });
    T.ok('Modo automático desmarcado', !(await opcao.isChecked()));
    await opcao.click();
    const aviso = painel.locator('.g-ass-modal-caixa[role="dialog"]');
    await aviso.waitFor({ timeout: 5000 });
    const textoAviso = (await aviso.innerText()).replace(/\s+/g, ' ');
    T.ok('o aviso tem o título e o texto do dono', textoAviso.includes('Ligar o modo automático?')
      && textoAviso.includes('O Mozart vai fazer na hora tudo o que você pedir, sem mostrar o cartão de confirmação: agenda, pagamentos, cancelamentos, preços e cadastros. Ele pode entender diferente um nome, um horário ou um valor, principalmente por áudio. Confira o que aparece na conversa. Se algo sair diferente, toque em Desfazer.')
      && textoAviso.includes('Você pode desligar quando quiser.'), textoAviso);
    const ligar = aviso.locator('button', { hasText: 'Ligar o automático' });
    T.ok('"Ligar o automático" travado até marcar Entendi', await ligar.isDisabled());
    T.ok('tem o "Agora não"', (await aviso.locator('button', { hasText: 'Agora não' }).count()) === 1);
    const [cx, pn] = [await aviso.boundingBox(), await painel.boundingBox()];
    T.ok('o aviso cabe no painel', cx && pn && cx.x >= pn.x - 1 && cx.x + cx.width <= pn.x + pn.width + 1 && cx.y >= pn.y - 1, { cx, pn });
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/mozart-automatico-aviso-${largura}.png` }).catch(() => {});
    await aviso.locator('label', { hasText: 'Entendi' }).click();
    T.ok('com Entendi, "Ligar o automático" destrava', !(await ligar.isDisabled()));
    await ligar.click();
    await chip.waitFor({ timeout: 10000 });
    T.ok('ligado: o aviso fecha e o topo mostra Automático', (await aviso.count()) === 0 && /Automático/.test(await chip.innerText()));
    T.ok('no banco: ligado, com o aceite guardado', ligadoNoBanco() && Number(q(`select count(*) from mozart_automatico_aceites where petshop_id='${L.P}' and ligou`)) === aceitesAntes + 1);
    // fecha os ajustes para a conversa
    await painel.locator('button[title="Ajustes"]').click();

    T.secao(`${largura}: grava sem cartão, com Feito e Desfazer`);
    const caixa = painel.locator('textarea');
    await caixa.fill('bloqueia o almoço de amanhã');
    await caixa.press('Enter');
    const feito = painel.locator('.g-ass-feito');
    await feito.first().waitFor({ timeout: 20000 });
    await page.waitForFunction(() => !document.querySelector('.g-ass-painel .g-bolha.pensa'), null, { timeout: 15000 });
    T.ok('nenhum cartão de confirmação (sem Pode fazer)', (await painel.locator('button', { hasText: 'Pode fazer' }).count()) === 0);
    const tf = (await feito.first().innerText()).replace(/\s+/g, ' ');
    T.ok('o cartão Feito mostra o que foi feito, com Desfazer', /Feito/.test(tf) && /12:00 às 13:00/.test(tf) && /Desfazer/.test(tf), tf);
    T.ok('o bloqueio já está no banco', bloqueios() === 1, bloqueios());
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    T.ok('sem rolagem para o lado', sobra <= 1, sobra);
    const [ch, pn2] = [await chip.boundingBox(), await painel.boundingBox()];
    T.ok('o selo cabe no topo do painel', ch && pn2 && ch.x >= pn2.x && ch.x + ch.width <= pn2.x + pn2.width, { ch, pn2 });
    const nome = await painel.locator('.g-ass-topo b').evaluate((b) => ({ cabe: b.scrollWidth <= b.clientWidth + 1 && b.getBoundingClientRect().width >= 50, w: b.getBoundingClientRect().width }));
    T.ok('com o selo, o nome Mozart continua inteiro no topo', nome.cabe, nome);
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/mozart-automatico-feito-${largura}.png` }).catch(() => {});
    await feito.first().locator('button', { hasText: 'Desfazer' }).click();
    await page.waitForFunction(() => /Desfeito/.test(document.querySelector('.g-ass-painel .g-ass-feito')?.textContent ?? ''), null, { timeout: 15000 });
    T.ok('Desfazer: o cartão diz Desfeito e o bloqueio saiu do banco', bloqueios() === 0 && (await feito.first().locator('button', { hasText: 'Desfazer' }).count()) === 0, bloqueios());

    T.secao(`${largura}: dois de uma vez, em ordem`);
    await caixa.fill('bloqueia o começo e o fim de amanhã');
    await caixa.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('.g-ass-painel .g-ass-feito').length === 3, null, { timeout: 20000 });
    await page.waitForFunction(() => !document.querySelector('.g-ass-painel .g-bolha.pensa'), null, { timeout: 15000 });
    T.ok('os dois gravaram sem Confirmar tudo', bloqueios() === 2 && (await painel.locator('button', { hasText: 'Confirmar tudo' }).count()) === 0, bloqueios());
    T.ok('cada um com o seu Desfazer', (await painel.locator('.g-ass-feito button', { hasText: 'Desfazer' }).count()) === 2);
    T.ok('em ordem: o começo antes do fim', q(`select string_agg(motivo, ',' order by criado_em) from bloqueios where petshop_id='${L.P}'`) === 'Começo,Fim');
    T.ok('o Mozart falou depois de gravar', /Prontinho/.test(await painel.locator('.g-bolha.ela').last().innerText()));

    T.secao(`${largura}: o selo abre os ajustes para desligar`);
    await chip.click();
    await opcao.waitFor({ timeout: 5000 });
    T.ok('Modo automático marcado', await opcao.isChecked());
    await opcao.click();
    await page.waitForFunction(() => !document.querySelector('.g-ass-painel .g-ass-auto'), null, { timeout: 10000 });
    T.ok('desligado: o selo some e o banco desliga', (await chip.count()) === 0 && !ligadoNoBanco());
    T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 3));
    await ctx.close();
  }
}))();
