// Rodada 9 (acessibilidade): teclado e leitor de tela nas folhas e na casca, e a contagem do axe-core nas telas principais.
// - "Pular para o conteúdo" é o primeiro Tab da página e leva o foco para o conteúdo;
// - o botão do Mozart no computador tem nome mesmo quando só a foto aparece;
// - folha (Pet novo): tem nome (o título), o foco entra nela ao abrir, Tab e Shift+Tab não saem, Esc fecha e o foco volta
//   para o botão que abriu;
// - confirmação de apagar: o foco começa em "Voltar" (Enter sem querer não apaga), Esc fecha só a pergunta e o foco volta;
// - avisos rápidos: erro num canto com role="alert", o resto em role="status";
// - sem internet: a tela que não baixou mostra "Sem internet" com Tentar de novo, não "Opa, esta tela travou";
// - axe-core (se instalado; AXE=/caminho/axe.min.js): nenhuma regra grave quebrada nas telas principais. Com
//   RELATORIO=/caminho.json grava a contagem por tela (antes e depois do conserto).
const fs = require('fs');
const B = require('../lib/base');
const N = require('../lib/navegador');
const D = require('../lib/desenho');
const T = require('../lib/teste')('acessibilidade');

const ROTAS = ['', '/agenda', '/clientes', '/creche-hotel', '/estoque', '/financeiro', '/caixa', '/relatorios', '/relatorios/indicadores', '/pacotes', '/equipe', '/mensagens', '/meu-petshop'];
const ativo = (page) => page.evaluate(() => {
  const a = document.activeElement;
  return { tag: a?.tagName ?? '', classe: typeof a?.className === 'string' ? a.className : '', texto: (a?.innerText || a?.getAttribute?.('aria-label') || '').trim().slice(0, 60), naFolha: Boolean(a?.closest?.('.g-folha')), id: a?.id ?? '' };
});

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await D.lojaDeNomesLongos(T);
  const contagem = {};

  // ---------- teclado (computador) ----------
  {
    T.secao('teclado no computador (1366 px)');
    const { ctx, page, erros } = await N.contexto(1366, 800);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/clientes');
    await page.waitForSelector('.g-topo .g-acoes');

    await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
    await page.keyboard.press('Tab');
    let a = await ativo(page);
    T.ok('o primeiro Tab para em "Pular para o conteúdo"', /Pular para o conteúdo/.test(a.texto), a);
    T.ok('… que aparece na tela quando tem o foco', await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return r.top >= 0 && r.left >= 0 && r.width > 40 && r.height > 20; }));
    await page.keyboard.press('Enter');
    a = await ativo(page);
    T.ok('Enter leva o foco para o conteúdo (main)', a.tag === 'MAIN' && a.id === 'conteudo', a);

    const nomeDoMozart = await page.locator('.g-fab').evaluate((el) => ({ rotulo: el.getAttribute('aria-label'), texto: el.innerText.trim(), aCaixaDoTexto: el.querySelector('.txt')?.getClientRects().length ?? 0 }));
    T.ok('o botão do Mozart tem nome para o leitor de tela (texto presente, mesmo recolhido)', Boolean(nomeDoMozart.rotulo) || nomeDoMozart.aCaixaDoTexto > 0, nomeDoMozart);

    const dois = await page.evaluate(() => [...document.querySelectorAll('nav')].filter((n) => n.getClientRects().length || true).map((n) => n.getAttribute('aria-label')));
    T.ok('os menus têm nomes diferentes', new Set(dois).size === dois.length, dois);

    // folha Pet novo pelo teclado
    const botao = page.locator('.g-topo .g-acoes').getByRole('button', { name: 'Pet novo' });
    await botao.focus();
    await page.keyboard.press('Enter');
    const folha = page.locator('.g-folha').last();
    await folha.waitFor({ timeout: 15000 });
    await page.waitForTimeout(600);
    a = await ativo(page);
    T.ok('ao abrir, o foco entra na folha', a.naFolha, a);
    const nome = await folha.evaluate((el) => { const id = el.getAttribute('aria-labelledby'); return { id, titulo: id ? document.getElementById(id)?.innerText : null, rotulo: el.getAttribute('aria-label'), modal: el.getAttribute('aria-modal') }; });
    T.ok('a folha tem nome: o título dela', Boolean(nome.titulo && nome.titulo.trim()) || Boolean(nome.rotulo), nome);
    let fora = 0, paradas = new Set();
    for (let k = 0; k < 45; k++) { await page.keyboard.press('Tab'); const x = await ativo(page); if (!x.naFolha) fora++; paradas.add(x.tag + x.texto); }
    T.ok('Tab 45 vezes: o foco nunca sai da folha', fora === 0, { fora });
    T.ok('… e passa por vários campos e botões (dá a volta)', paradas.size >= 4, [...paradas].slice(0, 8));
    fora = 0;
    for (let k = 0; k < 12; k++) { await page.keyboard.press('Shift+Tab'); if (!(await ativo(page)).naFolha) fora++; }
    T.ok('Shift+Tab 12 vezes: o foco nunca sai da folha', fora === 0, { fora });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.g-folha', { state: 'detached', timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    a = await ativo(page);
    T.ok('Esc fecha a folha', (await page.locator('.g-folha').count()) === 0);
    T.ok('… e o foco volta para o botão que abriu (Pet novo)', /Pet novo/.test(a.texto), a);

    // confirmação de apagar: foco em Voltar
    await N.ir(page, '/gestao/app/agenda');
    const cartao = page.locator('.g-ag', { hasText: 'Bob' }).first();
    await cartao.waitFor({ timeout: 15000 });
    await cartao.focus();
    await page.keyboard.press('Enter');
    await page.locator('.g-folha').first().waitFor({ timeout: 15000 });
    const apagar = page.locator('.g-folha').last().getByRole('button', { name: /Apagar \(marquei errado\)/ });
    await apagar.waitFor({ timeout: 15000 });
    await apagar.focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('.g-folha').length >= 2, null, { timeout: 8000 });
    await page.waitForTimeout(400);
    a = await ativo(page);
    T.ok('"Apagar este horário?": o foco começa em Voltar, não em Apagar', a.naFolha && /^Voltar/.test(a.texto), a);
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
    const naPergunta = await page.evaluate(() => { const f = [...document.querySelectorAll('.g-folha')]; return f[f.length - 1].contains(document.activeElement); });
    T.ok('Tab fica dentro da pergunta (não desce para a folha de baixo)', naPergunta);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelectorAll('.g-folha').length === 1, null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
    a = await ativo(page);
    T.ok('Esc fecha só a pergunta e o foco volta para "Apagar (marquei errado)"', (await page.locator('.g-folha').count()) === 1 && /Apagar \(marquei errado\)/.test(a.texto), a);
    T.ok('o horário continua na agenda (nada foi apagado)', B.num(`select count(*) from agendamentos where id='${L.ags[2]}'`) === 1);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    const cantos = await page.evaluate(() => [...document.querySelectorAll('.g-toasts [role]')].map((x) => x.getAttribute('role')).sort().join(','));
    T.ok('avisos rápidos: um canto para erro (alert) e outro para o resto (status)', cantos === 'alert,status', cantos);
    T.ok('nenhum erro na tela (teclado)', erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }

  // ---------- sem internet ----------
  {
    T.secao('sem internet: a tela que não baixou');
    const { ctx, page } = await N.contexto(390, 844);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app?__erro_teste=pedaco');
    await page.waitForSelector('[data-teste="sem-internet"]', { timeout: 15000 }).catch(() => {});
    const texto = await page.locator('.g-main').innerText();
    T.ok('a tela diz "Sem internet" (ou conexão fraca) com Tentar de novo', /Sem internet|conexão/i.test(texto) && /Tentar de novo/.test(texto), texto.slice(0, 300));
    T.ok('… e não diz "esta tela travou" nem que a equipe foi avisada', !/travou|já foi avisada/i.test(texto), texto.slice(0, 300));
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/sem-internet-390.png` }).catch(() => {});
    await ctx.close();
  }

  // ---------- axe-core ----------
  T.secao('axe-core nas telas principais');
  if (!D.caminhoDoAxe()) {
    console.log('  (axe-core não está instalado nesta máquina: defina AXE=/caminho/axe.min.js para contar)');
  } else {
    for (const [larg, alt] of [[390, 844], [1366, 800]]) {
      const { ctx, page } = await N.contexto(larg, alt);
      await N.entrar(page, L.emails.dono, L.senha);
      contagem[larg] = {};
      const medir = async (nome) => {
        const v = await D.axe(page);
        contagem[larg][nome] = v;
        const graves = v.filter((x) => x.impacto === 'critical' || x.impacto === 'serious');
        T.ok(`${larg} px ${nome}: nenhuma regra grave quebrada (axe)`, graves.length === 0, graves.map((x) => `${x.id} (${x.n}): ${x.onde[0]}`));
      };
      for (const rota of ROTAS) {
        await N.ir(page, '/gestao/app' + rota);
        await page.waitForTimeout(700);
        await medir(rota || '/hoje');
      }
      // uma folha aberta (Pet novo) e a confirmação
      await N.ir(page, '/gestao/app/clientes');
      await page.locator('.g-topo .g-acoes').getByRole('button', { name: 'Pet novo' }).click();
      await page.locator('.g-folha').first().waitFor({ timeout: 15000 });
      await page.waitForTimeout(700);
      await medir('folha Pet novo');
      await ctx.close();
    }
    const soma = (larg) => Object.values(contagem[larg]).reduce((t, v) => t + v.length, 0);
    const nos = (larg) => Object.values(contagem[larg]).reduce((t, v) => t + v.reduce((s, x) => s + x.n, 0), 0);
    console.log(`  axe: 390 px = ${soma(390)} regras quebradas (${nos(390)} elementos); 1366 px = ${soma(1366)} regras (${nos(1366)} elementos)`);
    if (process.env.RELATORIO) fs.writeFileSync(process.env.RELATORIO, JSON.stringify(contagem, null, 1));
  }
  await N.fecharNavegador();
}))();
