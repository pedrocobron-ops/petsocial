// Termos de uso, Política de privacidade e aceite (migração 20261197), em 390 e 1366:
//  - Criar conta: a caixa do aceite começa desmarcada, com os links dos dois documentos; sem marcar, a conta não é criada;
//    marcada (390), a conta nasce com o aceite das duas versões em vigor gravado no banco ("cadastro");
//  - as páginas dos Termos e da Política mostram "Versão X — vigente desde dd/mm/aaaa", o resumo de cada parte e o índice,
//    sem rolagem para o lado;
//  - quem ainda não aceitou a versão em vigor entra e vê a tela "atualizamos as nossas regras" (trava o aplicativo): sem marcar
//    não segue; marcando, "Aceitar e continuar" abre o aplicativo e grava os dois aceites ("reaceite") uma vez só.
// Capturas em testes/saida/aceite-*.png.
const path = require('path');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const N = require('../lib/navegador');
const T = require('../lib/teste')('aceite-tela');
const FOTOS = path.join(B.RAIZ, 'testes', 'saida') + '/';
const foto = (page, nome, inteira = false) => page.screenshot({ path: `${FOTOS}aceite-${nome}.png`, fullPage: inteira });

(async () => T.rodar(async () => {
  const Doc = lib('documentos');
  const L = await criarLoja(T, { nome: 'Aceite', equipe: false, dados: false });
  const uid = B.sql(`select id from auth.users where email='${L.emails.dono}'`);
  const aceites = (q) => B.sql(`select coalesce(string_agg(documento || ':' || versao || ':' || origem, ',' order by documento), '') from aceites where ${q}`);

  for (const [largura, altura] of [[390, 844], [1366, 900]]) {
    const { ctx, page, erros } = await N.contexto(largura, altura);

    T.secao(`${largura}: Criar conta`);
    await N.ir(page, '/gestao/criar-conta', 'form.g-form');
    const caixa = page.locator('input[name=aceite]');
    T.ok('a caixa do aceite começa desmarcada', !(await caixa.isChecked()));
    T.ok('com os links dos Termos e da Política', await page.locator('form a[href="/gestao/termos"]').count() === 1 && await page.locator('form a[href="/gestao/privacidade"]').count() === 1);
    T.ok('e as versões', (await page.locator('form .g-check').innerText()).includes(`Versão ${Doc.DOCUMENTOS.termos.versao} dos Termos`));
    const email = `t-${L.suf}.tela${largura}@teste-auto.local`;
    await page.fill('input[autocomplete=name]', 'Pessoa da Tela');
    await page.fill('input[type=email]', email);
    await page.fill('input[type=password]', L.senha);
    await foto(page, `criar-conta-${largura}`);
    await page.click('button.g-btn.pri');
    await page.waitForTimeout(1500);
    T.ok('sem marcar, a conta não é criada', B.num(`select count(*) from auth.users where email='${email}'`) === 0);
    T.ok('sem rolagem para o lado', await N.rolagemLateral(page) <= 0);
    if (largura === 390) {
      await caixa.check();
      await page.click('button.g-btn.pri');
      await page.waitForFunction(() => /\/gestao\/comecar/.test(location.pathname) || document.body.innerText.includes('Confira o seu e-mail'), null, { timeout: 30000 });
      const v = Doc.aceiteDoCadastro();
      T.ok('marcada, a conta nasce com os dois aceites da versão em vigor', aceites(`email='${email}'`) === `privacidade:${v.privacidade}:cadastro,termos:${v.termos}:cadastro`, aceites(`email='${email}'`));
      await ctx.clearCookies();
      await page.evaluate(() => { try { localStorage.clear(); } catch { /* sem armazenamento */ } });
    }

    for (const [d, rota] of [['termos', '/gestao/termos'], ['privacidade', '/gestao/privacidade']]) {
      T.secao(`${largura}: ${Doc.DOCUMENTOS[d].nome}`);
      await N.ir(page, rota, '.g-leg-folha');
      const data = (await page.locator('.g-leg-data').innerText()).trim();
      T.ok(`mostra "${Doc.textoVigencia(d)}"`, data === Doc.textoVigencia(d), data);
      T.ok('cada parte tem o resumo', await page.locator('.g-leg-parte').count() > 10 && await page.locator('.g-leg-parte').count() === await page.locator('.g-leg-sintese').count());
      T.ok('com o índice', await page.locator('.g-leg-indice li').count() === await page.locator('.g-leg-parte').count());
      T.ok('sem rolagem para o lado', await N.rolagemLateral(page) <= 0);
      await foto(page, `${d}-${largura}`);
    }

    T.secao(`${largura}: versão nova, tela de aceite`);
    B.sql(`delete from aceites where user_id='${uid}'`);
    await page.goto(B.BASE_URL + '/gestao/entrar');
    await page.fill('input[type=email]', L.emails.dono);
    await page.fill('input[type=password]', L.senha);
    await page.click('button.g-btn.pri');
    await page.waitForSelector('.g-reac', { timeout: 30000 });
    T.ok('quem não aceitou a versão em vigor vê a tela de aceite, sem o aplicativo', await page.locator('.g-main').count() === 0 && (await page.locator('.g-reac h1').innerText()).includes('atualizamos as nossas regras'));
    T.ok('com o resumo do que mudou', await page.locator('.g-reac .g-leg-texto ul li').count() === Doc.MUDANCAS.length);
    T.ok('e os dois documentos com a versão', (await page.locator('.g-reac-doc').allInnerTexts()).every((t, i) => t.includes(Doc.textoVigencia(['termos', 'privacidade'][i]))));
    T.ok('a caixa começa desmarcada', !(await page.locator('.g-reac input[name=aceite]').isChecked()));
    T.ok('sem rolagem para o lado', await N.rolagemLateral(page) <= 0);
    await foto(page, `reaceite-${largura}`, true);
    await page.getByRole('button', { name: 'Aceitar e continuar' }).click();
    await page.waitForTimeout(500);
    T.ok('sem marcar, não segue', await page.locator('.g-reac .g-erro').count() === 1 && aceites(`user_id='${uid}'`) === '');
    await page.locator('.g-reac input[name=aceite]').check();
    await page.getByRole('button', { name: 'Aceitar e continuar' }).dblclick();
    await page.waitForSelector('.g-main', { timeout: 30000 });
    const v = Doc.aceiteDoCadastro();
    T.ok('aceitando, o aplicativo abre e os dois aceites ficam gravados uma vez', aceites(`user_id='${uid}'`) === `privacidade:${v.privacidade}:reaceite,termos:${v.termos}:reaceite`, aceites(`user_id='${uid}'`));
    await N.ir(page, '/gestao/app');
    T.ok('abrindo de novo, não pede outra vez', await page.locator('.g-reac').count() === 0);
    T.ok('nenhum erro de página', erros.length === 0, erros);
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
