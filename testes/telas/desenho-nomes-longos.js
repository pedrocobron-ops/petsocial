// Rodada 9 (desenho): nada passa da largura da tela com nomes compridos (pet de 40 letras, tutor de 61, produto de 67,
// pet shop de nome longo), em 360, 390, 768 e 1366 px e com o celular deitado (740 x 360):
// - cada tela do aplicativo: nenhum elemento com a borda direita fora da tela (o conteúdo não rola de lado, então o que
//   passa fica cortado e sem alcance) e sem rolagem lateral;
// - cada folha aberta pelos botões do alto (Nova conta fixa, Novo lançamento, Marcar horário, Pet novo, Produto novo…):
//   a folha cabe na tela e nada passa da borda dela;
// - o cartão do horário mostra o nome do pet em até duas linhas e o tutor numa linha só;
// - com a letra do aparelho em 150% (390 px) e com zoom de 200% no computador: nada cortado, nenhum botão do alto por cima
//   de outro e as folhas cabem na tela.
// Com RELATORIO=/caminho.json grava as medidas (antes e depois do conserto).
const fs = require('fs');
const B = require('../lib/base');
const N = require('../lib/navegador');
const D = require('../lib/desenho');
const T = require('../lib/teste')('desenho-nomes-longos');

const TAMANHOS = [[360, 740], [390, 844], [768, 1024], [1366, 768], [740, 360]];
const ROTAS = ['', '/agenda', '/clientes', '/creche-hotel', '/estoque', '/financeiro', '/financeiro?aba=fixas', '/financeiro?aba=receber', '/caixa',
  '/relatorios', '/relatorios/indicadores', '/pacotes', '/equipe', '/mensagens', '/meu-petshop', '/assinatura', '/manual'];
// folhas abertas pelo cabeçalho: [rota, nome do botão]
const FOLHAS = [['/financeiro?aba=fixas', 'Nova conta fixa'], ['/financeiro', 'Novo lançamento'], ['/agenda', 'Marcar horário'], ['/agenda', 'Bloquear horário'],
  ['/clientes', 'Pet novo'], ['/clientes', 'Chamar de volta'], ['/estoque', 'Produto novo'], ['/estoque', 'Vender'], ['/creche-hotel', 'Check-in'], ['/pacotes', 'Vender pacote']];

async function fecharFolhas(page) {
  for (let k = 0; k < 4 && (await page.locator('.g-folha').count()); k++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
    const sair = page.locator('.g-folha-sair .g-btn.perigo');
    if (await sair.count()) await sair.click().catch(() => {});
    await page.waitForTimeout(250);
  }
}
/** Acha o botão do cabeçalho pelo nome; no celular ele pode estar dentro do "Mais". */
async function abrirPeloCabecalho(page, nome) {
  const direto = page.locator('.g-topo .g-acoes').getByRole('button', { name: nome }).first();
  if (await direto.isVisible().catch(() => false)) { await direto.click(); return true; }
  const mais = page.locator('.g-topo .g-acoes').getByRole('button', { name: /^Mais/ }).first();
  if (await mais.isVisible().catch(() => false)) {
    await mais.click();
    const item = page.locator('.g-mais-lista').getByRole('button', { name: nome }).first();
    if (await item.isVisible().catch(() => false)) { await item.click(); return true; }
    await page.keyboard.press('Escape');
  }
  return false;
}

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await D.lojaDeNomesLongos(T);
  const medidas = {};
  for (const [larg, alt] of TAMANHOS) {
    const nome = `${larg}x${alt}`;
    T.secao(nome);
    const { ctx, page, erros } = await N.contexto(larg, alt);
    await N.entrar(page, L.emails.dono, L.senha);
    medidas[nome] = { telas: {}, folhas: {} };
    for (const rota of ROTAS) {
      await N.ir(page, '/gestao/app' + rota);
      await page.waitForTimeout(500);
      const m = await D.medirCortes(page);
      const rolagem = await N.rolagemLateral(page);
      medidas[nome].telas[rota || '/'] = m.n;
      T.ok(`${rota || '/hoje'}: nada cortado na direita`, m.n === 0 && rolagem <= 0, { cortados: m.n, rolagem, amostra: m.amostra });
      if (process.env.FOTOS && m.n) await page.screenshot({ path: `${B.RAIZ}/testes/saida/desenho-${nome}-${(rota || 'hoje').replace(/\W+/g, '-')}.png`, fullPage: true }).catch(() => {});
    }
    // folhas: no computador elas são janelas de largura fixa; o risco é no celular (em pé e deitado) e no tablet
    if (larg !== 1366) {
      for (const [rota, botao] of FOLHAS) {
        await N.ir(page, '/gestao/app' + rota);
        if (!(await abrirPeloCabecalho(page, botao))) { T.ok(`folha "${botao}": o botão existe em ${rota}`, false); continue; }
        const abriu = await page.locator('.g-folha').first().waitFor({ timeout: 10000 }).then(() => true, () => false);
        if (!abriu) { T.ok(`folha "${botao}": abre`, false); continue; }
        await page.waitForTimeout(700);
        const m = await D.medirCortes(page);
        medidas[nome].folhas[botao] = m.n;
        T.ok(`folha "${botao}": cabe na tela`, m.n === 0, { cortados: m.n, amostra: m.amostra });
        if (process.env.FOTOS) await page.screenshot({ path: `${B.RAIZ}/testes/saida/desenho-${nome}-folha-${botao.replace(/\W+/g, '-')}.png` }).catch(() => {});
        await fecharFolhas(page);
      }
    }
    // o cartão do horário na agenda: pet em destaque (até duas linhas, sem cortar em 10 letras), tutor em uma linha
    if (larg <= 390) {
      await N.ir(page, '/gestao/app/agenda');
      const cartao = page.locator('.g-ag', { hasText: 'Maximiliano' }).first();
      await cartao.waitFor({ timeout: 10000 });
      const medida = await cartao.evaluate((el) => {
        const b = el.querySelector('.t b'), tutor = el.querySelector('.g-agd-tutor');
        const linhas = (x) => x ? Math.round(x.getBoundingClientRect().height / parseFloat(getComputedStyle(x).lineHeight)) : 0;
        return { larguraDoNome: b ? Math.round(b.getBoundingClientRect().width) : 0, linhasDoNome: linhas(b), linhasDoTutor: linhas(tutor), altura: Math.round(el.getBoundingClientRect().height) };
      });
      T.ok('cartão do horário: o nome do pet tem espaço (largura de pelo menos 180 px ou duas linhas)', medida.larguraDoNome >= 180 || medida.linhasDoNome === 2, medida);
      T.ok('cartão do horário: o tutor fica em uma linha só', medida.linhasDoTutor <= 1, medida);
      await page.screenshot({ path: `${B.RAIZ}/testes/saida/desenho-agenda-cartao-${larg}.png` }).catch(() => {});
    }
    T.ok(`nenhum erro na tela (${nome})`, erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }
  // letra grande do aparelho (150%) no celular e zoom de 200% no computador (uma tela de 1366 x 768 vira 683 x 384)
  for (const [larg, alt, fonte, nome] of [[390, 844, '150%', 'letra 150% em 390 px'], [683, 384, '100%', 'zoom 200% (683 x 384)']]) {
    T.secao(nome);
    const { ctx, page } = await N.contexto(larg, alt);
    await N.entrar(page, L.emails.dono, L.senha);
    const letra = () => page.addStyleTag({ content: `html{font-size:${fonte} !important}` });
    for (const rota of ['', '/agenda', '/clientes', '/estoque', '/financeiro', '/relatorios', '/creche-hotel']) {
      await N.ir(page, '/gestao/app' + rota); await letra(); await page.waitForTimeout(600);
      const m = await D.medirCortes(page);
      const sobrepostos = await page.evaluate(() => {
        const b = [...document.querySelectorAll('.g-topo .g-acoes .g-btn')].filter((x) => x.getClientRects().length).map((x) => x.getBoundingClientRect());
        let n = 0;
        for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) if (b[i].left < b[j].right - 1 && b[j].left < b[i].right - 1 && b[i].top < b[j].bottom - 1 && b[j].top < b[i].bottom - 1) n++;
        return n;
      });
      T.ok(`${rota || '/hoje'}: nada cortado e nenhum botão do alto por cima de outro`, m.n === 0 && sobrepostos === 0, { cortados: m.n, sobrepostos, amostra: m.amostra });
    }
    for (const [rota, botao] of [['/agenda', 'Marcar horário'], ['/financeiro?aba=fixas', 'Nova conta fixa'], ['/clientes', 'Pet novo']]) {
      await N.ir(page, '/gestao/app' + rota); await letra();
      if (!(await abrirPeloCabecalho(page, botao))) { T.ok(`folha "${botao}": o botão existe`, false); continue; }
      await page.locator('.g-folha').first().waitFor({ timeout: 10000 }); await page.waitForTimeout(700);
      const m = await D.medirCortes(page);
      const corpo = await page.evaluate(() => Math.round(document.querySelector('.g-folha-corpo')?.getBoundingClientRect().height ?? 0));
      T.ok(`folha "${botao}": cabe na tela e sobra espaço para o conteúdo (${corpo} px)`, m.n === 0 && corpo >= 200, { cortados: m.n, corpo, amostra: m.amostra });
      if (process.env.FOTOS) await page.screenshot({ path: `${B.RAIZ}/testes/saida/desenho-${larg}-${fonte.replace('%', '')}-folha-${botao.replace(/\W+/g, '-')}.png` }).catch(() => {});
      await fecharFolhas(page);
    }
    await ctx.close();
  }
  if (process.env.RELATORIO) fs.writeFileSync(process.env.RELATORIO, JSON.stringify(medidas, null, 1));
  await N.fecharNavegador();
}))();
