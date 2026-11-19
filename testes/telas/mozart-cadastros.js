// Mozart cadastra na tela, com a rota de verdade e o roteiro de teste (GESTAO_MOZART_FALSO=1, nunca o modelo):
//  - o dono pede a tabela de preços (banho P e M R$ 100, G e GG R$ 130; corte de unhas R$ 30; escovação R$ 20; hidratação P/M
//    R$ 60, G/GG R$ 80): os quatro cartões aparecem juntos com "Confirmar tudo (4)", um toque grava os quatro e os preços ficam
//    no banco (a escovação é criada).
// Em 390 e 1366, sem erro na página e sem rolagem para o lado.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('mozart-cadastros-telas');

const PEDIDO = 'atualiza a tabela de preços: banho P e M R$100, G e GG R$130; corte de unha R$30 qualquer porte; escovação R$20; hidratação P/M R$60, G/GG R$80';

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Mozart cadastros telas', equipe: false, dados: false });
  const precos = (nome) => B.sql(`select coalesce(string_agg(preco_p||'/'||preco_m||'/'||preco_g||'/'||preco_gg, ','), '') from servicos where petshop_id='${L.P}' and nome='${nome}'`);

  for (const [largura, altura] of [[390, 844], [1366, 900]]) {
    const celular = largura < 500;
    // volta aos preços da semente e sem escovação: cada largura faz a leva inteira
    B.sql(`delete from servicos where petshop_id='${L.P}' and nome='Escovação'`);
    B.sql(`update servicos set preco_p=50, preco_m=60, preco_g=70, preco_gg=80 where petshop_id='${L.P}' and nome='Banho'`);
    B.sql(`update servicos set preco_p=15, preco_m=15, preco_g=15, preco_gg=15 where petshop_id='${L.P}' and nome='Corte de unhas'`);
    B.sql(`update servicos set preco_p=25, preco_m=30, preco_g=35, preco_gg=40 where petshop_id='${L.P}' and nome='Hidratação'`);
    const { ctx, page, erros } = await N.contexto(largura, altura);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app');
    await page.locator(celular ? '.g-aba-mic' : '.g-fab').first().click();
    const painel = page.locator('.g-ass-painel[aria-label="Conversa com o Mozart"]');
    await painel.waitFor({ timeout: 10000 });
    const caixa = painel.locator('textarea');
    await caixa.fill(PEDIDO);
    await caixa.press('Enter');

    T.secao(`${largura}: quatro cartões e um Confirmar tudo`);
    const tudo = painel.locator('button', { hasText: 'Confirmar tudo (4)' });
    await tudo.waitFor({ timeout: 20000 });
    await page.waitForFunction(() => !document.querySelector('.g-ass-painel .g-bolha.pensa'), null, { timeout: 15000 });
    const cartoes = painel.locator('.g-proposta:not(.g-ass-tudo)');
    T.ok('quatro cartões pendentes', (await cartoes.count()) === 4, await cartoes.count());
    const texto = (await painel.locator('.g-ass-conversa').innerText()).replace(/ /g, ' ');
    T.ok('o cartão do banho mostra o preço de antes e o novo', /P R\$ 50,00 · M R\$ 60,00 · G R\$ 70,00 · GG R\$ 80,00/.test(texto) && /P R\$ 100,00 · M R\$ 100,00 · G R\$ 130,00 · GG R\$ 130,00/.test(texto), texto.slice(0, 800));
    T.ok('a escovação aparece como serviço novo', /Escovação \(novo\)/.test(texto));
    T.ok('nada gravado antes de confirmar', precos('Banho') === '50.00/60.00/70.00/80.00' && precos('Escovação') === '');
    const sobra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    T.ok('sem rolagem para o lado', sobra <= 1, sobra);
    const [bt, pn] = [await tudo.boundingBox(), await painel.boundingBox()];
    T.ok('o Confirmar tudo cabe inteiro no painel', bt && pn && bt.x >= pn.x - 1 && bt.x + bt.width <= pn.x + pn.width + 1, { bt, pn });
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/mozart-cadastros-${largura}.png` }).catch(() => {});

    T.secao(`${largura}: um toque grava os quatro`);
    await tudo.click();
    await page.waitForFunction(() => document.querySelectorAll('.g-ass-painel .g-proposta.feita').length === 4, null, { timeout: 20000 });
    await page.waitForFunction(() => !document.querySelector('.g-ass-painel .g-bolha.pensa'), null, { timeout: 15000 });
    T.ok('os quatro cartões ficaram confirmados e o Confirmar tudo sumiu', (await painel.locator('.g-proposta.feita').count()) === 4 && (await painel.locator('button', { hasText: 'Confirmar tudo' }).count()) === 0);
    T.ok('banho 100/100/130/130', precos('Banho') === '100.00/100.00/130.00/130.00', precos('Banho'));
    T.ok('corte de unhas 30 em todos os portes', precos('Corte de unhas') === '30.00/30.00/30.00/30.00', precos('Corte de unhas'));
    T.ok('escovação criada com 20', precos('Escovação') === '20.00/20.00/20.00/20.00', precos('Escovação'));
    T.ok('hidratação 60/60/80/80', precos('Hidratação') === '60.00/60.00/80.00/80.00', precos('Hidratação'));
    T.ok('o Mozart respondeu depois de gravar', /Prontinho/.test(await painel.locator('.g-bolha.ela').last().innerText()));
    T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 3));
    await ctx.close();
  }
}))();
