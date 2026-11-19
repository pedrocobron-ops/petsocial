// No navegador (390 e 1366):
//  1. Abertura com o banco lento: a primeira resposta da conta (rpc/entrar) ou do pet shop (rpc/gestao_base) volta com
//     "canceling statement due to statement timeout" (ou a rede cai). A abertura tenta mais uma vez, quieta, e o aplicativo
//     abre sem "Opa, algo não carregou" e sem "Ainda buscando a sua conta". Falhando sempre: a tela de erro com
//     "Tentar de novo", que abre o aplicativo quando o banco volta.
//  2. Painel do administrador: tocar outra aba mostra já o "carregando" da aba nova, nunca o conteúdo da anterior.
//  3. Conta de teste: marcar na folha do pet shop (Contas) tira a conta da lista "Todos" e dos números; desmarcar volta.
//  4. Escola: o cliente não vê material pago (nem preço, nem "Comprar"); as aulas continuam. No painel, os materiais
//     aparecem com "Escondido da loja até ter PDF e o aviso de pagamento".
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('telas-abertura-admin-escola');

const TEMPO = JSON.stringify({ code: '57014', details: null, hint: null, message: 'canceling statement due to statement timeout' });

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Abertura lenta', equipe: false });
  T.depois(() => N.fecharNavegador());
  const uidDono = B.sql(`select user_id from profissionais where petshop_id='${L.P}' and papel='dono' limit 1`);

  /** Vigia a tela de abertura: se o erro ou o aviso de demora aparecerem em algum momento, fica anotado. */
  const vigiar = (page) => page.addInitScript(() => {
    window.__vistos = [];
    const olhar = () => {
      const t = document.body ? document.body.innerText : '';
      if (/Opa, algo não carregou/.test(t)) window.__vistos.push('erro');
      const d = document.getElementById('g-abrindo-demora');
      if (d && d.style.display !== 'none' && d.offsetParent !== null) window.__vistos.push('demora');
    };
    new MutationObserver(olhar).observe(document, { subtree: true, childList: true, characterData: true, attributes: true });
  });

  T.secao('1. abertura com o banco lento');
  for (const [largura, altura] of [[390, 844], [1366, 900]]) {
    for (const [nome, rota, como] of [
      ['conta (entrar) cortada por demora', '**/rest/v1/rpc/entrar', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: TEMPO })],
      ['pet shop (gestao_base) cortado por demora', '**/rest/v1/rpc/gestao_base', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: TEMPO })],
      ['conta (entrar) com a rede caindo', '**/rest/v1/rpc/entrar', (r) => r.abort('internetdisconnected')],
    ]) {
      const { ctx, page } = await N.contexto(largura, altura);
      await N.entrar(page, L.emails.dono, L.senha);
      await vigiar(page);
      let vezes = 0;
      await page.route(rota, async (r) => { vezes++; if (vezes === 1) return como(r); return r.continue(); });
      const t0 = Date.now();
      await page.goto(B.BASE_URL + '/gestao/app');
      await page.waitForSelector('.g-main', { timeout: 25000 }).catch(() => {});
      const ms = Date.now() - t0;
      const vistos = await page.evaluate(() => [...new Set(window.__vistos)]);
      T.ok(`${largura}: ${nome}: o aplicativo abre sozinho (${ms} ms)`, await page.locator('.g-main').isVisible().catch(() => false), await page.locator('body').innerText());
      T.ok(`${largura}: ${nome}: tentou duas vezes`, vezes === 2, vezes);
      T.ok(`${largura}: ${nome}: sem "Opa, algo não carregou" e sem "Ainda buscando…" no caminho`, !vistos.length, vistos);
      await ctx.close();
    }
  }
  {
    const { ctx, page } = await N.contexto(390, 844);
    await N.entrar(page, L.emails.dono, L.senha);
    let quebrado = true, vezes = 0;
    await page.route('**/rest/v1/rpc/entrar', async (r) => { vezes++; if (quebrado) return r.fulfill({ status: 500, contentType: 'application/json', body: TEMPO }); return r.continue(); });
    await page.goto(B.BASE_URL + '/gestao/app');
    const erro = page.locator('text=Opa, algo não carregou');
    await erro.waitFor({ timeout: 20000 });
    const texto = await page.locator('body').innerText();
    T.ok('falhando sempre: a tela de erro diz o que houve, em português, com "Tentar de novo"', /Não consegui carregar a sua conta/.test(texto) && await page.getByRole('button', { name: 'Tentar de novo' }).isVisible() && !/statement|timeout|PGRST/i.test(texto), texto);
    T.ok('falhando sempre: só duas tentativas antes do erro (sem martelar o banco)', vezes === 2, vezes);
    quebrado = false;
    await page.getByRole('button', { name: 'Tentar de novo' }).click();
    await page.waitForSelector('.g-main', { timeout: 20000 });
    T.ok('"Tentar de novo" com o banco de volta: o aplicativo abre', await page.locator('.g-main').isVisible());
    await ctx.close();
  }

  // o dono desta loja vira administrador só durante o teste
  B.sql(`insert into admins (user_id) values ('${uidDono}') on conflict do nothing`);
  T.depois(() => B.sql(`delete from admins where user_id='${uidDono}'`));

  T.secao('2. painel do administrador: troca de aba');
  for (const [largura, altura] of [[390, 844], [1366, 900]]) {
    const { ctx, page, erros } = await N.contexto(largura, altura);
    await N.entrar(page, L.emails.dono, L.senha);
    await page.goto(B.BASE_URL + '/gestao/admin');
    await page.locator('.g-adm-abas').waitFor({ timeout: 20000 });
    await page.locator('[data-aba="visao"]:not([data-aba-carregando])').waitFor({ timeout: 20000 });
    // vigia: em nenhum momento a aba marcada mostra o conteúdo de outra
    await page.evaluate(() => {
      window.__trocas = [];
      new MutationObserver(() => {
        const marcada = document.querySelector('.g-adm-abas button[aria-pressed="true"]')?.textContent;
        const area = document.querySelector('[data-aba]');
        if (area) window.__trocas.push([marcada, area.getAttribute('data-aba')]);
      }).observe(document.body, { subtree: true, childList: true, attributes: true });
    });
    const NOMES = { 'Visão geral': 'visao', Uso: 'uso', Contas: 'geral', Conversas: 'conversas', Escola: 'escola', Cakto: 'cakto', Vendas: 'vendas', Erros: 'erros', Aceites: 'aceites', Dados: 'dados' };
    const ordem = ['Uso', 'Contas', 'Escola', 'Vendas', 'Visão geral', 'Erros', 'Uso', 'Contas'];
    for (const rotulo of ordem) {
      const primeiro = await page.evaluate((r) => new Promise((ok) => {
        const b = [...document.querySelectorAll('.g-adm-abas button')].find((x) => x.textContent === r);
        b.click();
        // o primeiro quadro depois do toque: o que a pessoa vê
        requestAnimationFrame(() => {
          const area = document.querySelector('[data-aba]');
          ok({ aba: area?.getAttribute('data-aba'), carregando: area?.hasAttribute('data-aba-carregando'), texto: (area?.innerText ?? '').slice(0, 120) });
        });
      }), rotulo);
      T.ok(`${largura}: ${rotulo}: no primeiro quadro já é a aba nova, carregando`, primeiro.aba === NOMES[rotulo] && primeiro.carregando, primeiro);
      await page.locator(`[data-aba="${NOMES[rotulo]}"]:not([data-aba-carregando])`).waitFor({ timeout: 20000 });
    }
    const trocas = await page.evaluate(() => window.__trocas);
    const erradas = trocas.filter(([m, a]) => NOMES[m] !== a);
    T.ok(`${largura}: nenhuma vez a aba marcada mostrou o conteúdo de outra`, !erradas.length, erradas.slice(0, 5));
    T.ok(`${largura}: sem erro na tela`, !erros.length, erros.slice(0, 4));
    await ctx.close();
  }

  T.secao('3. conta de teste');
  {
    const { ctx, page, erros } = await N.contexto(1366, 900);
    await N.entrar(page, L.emails.dono, L.senha);
    await page.goto(B.BASE_URL + '/gestao/admin');
    await page.locator('.g-adm-abas').waitFor({ timeout: 20000 });
    await page.locator('.g-adm-abas button', { hasText: 'Contas' }).click();
    await page.locator('[data-aba="geral"]:not([data-aba-carregando])').waitFor({ timeout: 20000 });
    await page.getByLabel('Buscar pet shop').fill('Abertura lenta');
    const cartao = page.locator('.g-card', { hasText: 'Abertura lenta' }).first();
    await cartao.waitFor({ timeout: 10000 });
    await cartao.click();
    const folha = page.locator('.g-folha').last();
    await folha.waitFor({ timeout: 10000 });
    const caixa = folha.locator('[data-teste="conta-teste"] input[type=checkbox]');
    T.ok('a folha do pet shop tem "É uma conta de teste", desmarcado', (await caixa.count()) === 1 && !(await caixa.isChecked()));
    await caixa.check();
    await page.locator('text=Marcada como conta de teste').first().waitFor({ timeout: 10000 });
    T.ok('marcou no banco', B.sql(`select conta_teste from petshops where id='${L.P}'`) === 't');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    T.ok('saiu da lista "Todos"', (await page.locator('.g-card', { hasText: 'Abertura lenta' }).count()) === 0);
    T.ok('o aviso diz que contas de teste ficam fora', /contas? de teste fica/.test(await page.locator('[data-teste="contas-teste-fora"]').first().innerText().catch(() => '')));
    await page.locator('.g-chip', { hasText: 'Contas de teste' }).click();
    const marcada = page.locator('.g-card', { hasText: 'Abertura lenta' }).first();
    T.ok('aparece em "Contas de teste", com a etiqueta', await marcada.isVisible() && /conta de teste/.test(await marcada.innerText()));
    await page.locator('.g-adm-abas button', { hasText: 'Visão geral' }).click();
    await page.locator('[data-aba="visao"]:not([data-aba-carregando]) [data-teste="contas-teste-fora"]').waitFor({ timeout: 15000 });
    T.ok('Visão geral: diz quantas contas de teste ficaram fora dos números', true);
    await page.locator('.g-adm-abas button', { hasText: 'Contas' }).click();
    await page.locator('.g-chip', { hasText: 'Contas de teste' }).click();
    await page.locator('.g-card', { hasText: 'Abertura lenta' }).first().click();
    await page.locator('.g-folha [data-teste="conta-teste"] input[type=checkbox]').uncheck();
    await page.locator('text=Voltou para os números').first().waitFor({ timeout: 10000 });
    T.ok('desmarcou: volta para os números', B.sql(`select conta_teste from petshops where id='${L.P}'`) === 'f');
    T.ok('sem erro na tela', !erros.length, erros.slice(0, 4));
    await ctx.close();
  }

  T.secao('4. Escola sem material pago');
  for (const [largura, altura] of [[390, 844], [1366, 900]]) {
    const { ctx, page, erros } = await N.contexto(largura, altura);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/escola');
    await page.locator('text=Aulas gratuitas').first().waitFor({ timeout: 15000 });
    const texto = (await page.locator('.g-main').innerText()).replace(/ /g, ' ');
    T.ok(`${largura}: as aulas gratuitas continuam`, /Aulas gratuitas/.test(texto) && (await page.locator('.g-esc-aula').count()) > 5);
    T.ok(`${largura}: nenhum material pago (sem estante, preço, "Comprar" nem "pagamento único")`, !/Um serviço novo para o seu pet shop|pagamento único|Comprar|R\$|vendidos à parte|materiais completos/i.test(texto), texto.slice(0, 600));
    T.ok(`${largura}: sem "em breve"`, !/em breve/i.test(texto));
    T.ok(`${largura}: sem pedir código do e-mail de compra`, !/Já comprou um material/.test(texto));
    T.ok(`${largura}: sem rolagem lateral`, (await N.rolagemLateral(page)) <= 0);
    T.ok(`${largura}: sem erro na tela`, !erros.length, erros.slice(0, 4));
    await ctx.close();
  }
  {
    const { ctx, page } = await N.contexto(1366, 900);
    await N.entrar(page, L.emails.dono, L.senha);
    await page.goto(B.BASE_URL + '/gestao/admin');
    await page.locator('.g-adm-abas button', { hasText: 'Escola' }).click();
    await page.locator('[data-aba="escola"]:not([data-aba-carregando]) [data-teste="escola-escondida"]').waitFor({ timeout: 15000 });
    const texto = await page.locator('[data-aba="escola"]').innerText();
    const n = (texto.match(/Escondido da loja até ter PDF e o aviso de pagamento/g) || []).length;
    T.ok('painel: os 6 materiais continuam, cada um com "Escondido da loja até ter PDF e o aviso de pagamento"', n >= 6, n);
    await ctx.close();
  }
}))();
