// Contas fixas pela tela (Financeiro, aba Contas fixas), em 390 px e 1366 px:
// - a dona cadastra pelo modelo (Aluguel no celular, Luz com "muda todo mês" no computador), com o vencimento daqui a 3 dias;
// - "Quanto custa manter o pet shop" mostra quanto precisa faturar (2.500; depois 2.500 + 380 = 2.880);
// - a conta do mês já aparece em A pagar ("conta fixa"; a luz com "valor estimado: confira a conta");
// - Paguei: a conta sai de A pagar e fica paga no banco; Relatórios, Quanto sobrou mostra "Contas fixas" nas saídas;
// - sem rolagem lateral e sem erro na página. As capturas ficam em testes/saida/contas-fixas-*.png.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('contas-fixas-telas');

const limpo = (s) => s.replace(/[  ]/g, ' ');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Fixas tela' });
  const P = L.P;
  const dia = Number(L.dia(3).slice(8, 10));
  const casos = [
    { larg: 390, alt: 844, modelo: 'Aluguel', valor: '2500', total: 'R$ 2.500,00', estimado: false },
    { larg: 1366, alt: 900, modelo: 'Luz', valor: '380', total: 'R$ 2.880,00', estimado: true },
  ];
  for (const c of casos) {
    T.secao(`${c.larg} px: ${c.modelo}`);
    const { ctx, page, erros } = await N.contexto(c.larg, c.alt);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/financeiro?aba=fixas');
    await page.waitForSelector('[data-teste="contas-fixas"]', { timeout: 20000 });

    await page.getByRole('button', { name: 'Nova conta fixa' }).first().click();
    const f = page.locator('.g-folha').last();
    await f.waitFor({ timeout: 10000 });
    await f.getByRole('group', { name: 'Modelos de conta fixa' }).getByRole('button', { name: c.modelo, exact: true }).click();
    T.ok('o modelo preenche o nome', (await f.locator('input[placeholder^="Ex.: Aluguel"]').inputValue()) === c.modelo);
    T.ok(`o modelo escolhe se o valor muda (${c.estimado ? 'muda todo mês' : 'sempre o mesmo'})`,
      (await f.getByRole('button', { name: c.estimado ? 'Muda todo mês' : 'É sempre o mesmo' }).getAttribute('aria-pressed')) === 'true');
    await f.locator(`input[aria-label="${c.estimado ? 'Valor aproximado' : 'Valor'}"]`).fill(c.valor);
    await f.locator('input[aria-label="Dia do vencimento"]').fill(String(dia));
    if (c.larg === 1366) await page.screenshot({ path: `${B.RAIZ}/testes/saida/contas-fixas-folha-${c.larg}.png` }).catch(() => {});
    T.ok(`sem rolagem lateral na folha (${c.larg})`, (await N.rolagemLateral(page)) <= 0);
    await f.getByRole('button', { name: 'Cadastrar' }).click();
    await page.waitForSelector('.g-folha', { state: 'detached', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    T.ok('a conta fixa foi cadastrada no banco', B.num(`select count(*) from contas_fixas where petshop_id='${P}' and nome='${c.modelo}' and dia=${dia}`) === 1);
    T.ok('… e a conta do mês já entrou em A pagar', B.num(`select count(*) from lancamentos where petshop_id='${P}' and descricao='${c.modelo}' and not pago and competencia is not null`) === 1);

    const quadro = limpo(await page.locator('[data-teste="quanto-custa"]').innerText().catch(() => ''));
    T.ok(`"Quanto custa manter o pet shop": as contas somam ${c.total} por mês (sem custo do que vende: o mínimo a faturar)`, quadro.includes(`As contas fixas somam ${c.total} por mês`) && quadro.includes('o mínimo a faturar por mês'), quadro.slice(0, 300));
    const lista = limpo(await page.locator('[data-teste="contas-fixas"]').innerText());
    T.ok(`a lista mostra ${c.modelo}, todo dia ${dia}`, lista.includes(c.modelo) && lista.includes(`todo dia ${dia}`), lista.slice(0, 400));
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/contas-fixas-${c.larg}.png`, fullPage: true }).catch(() => {});
    T.ok(`sem rolagem lateral em Contas fixas (${c.larg})`, (await N.rolagemLateral(page)) <= 0);

    // A pagar
    await page.locator('.g-seg button', { hasText: /^A pagar/ }).click();
    await page.waitForTimeout(800);
    const linha = page.locator('.gf-conta', { hasText: c.modelo }).first();
    const tl = limpo(await linha.innerText().catch(() => ''));
    T.ok(`A pagar: ${c.modelo} como conta fixa`, tl.includes(c.modelo) && tl.includes('conta fixa'), tl);
    T.ok(c.estimado ? 'a luz mostra "valor estimado: confira a conta"' : 'o aluguel não tem a marca de estimado', tl.includes('valor estimado: confira a conta') === c.estimado, tl);
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/contas-fixas-pagar-${c.larg}.png`, fullPage: true }).catch(() => {});
    T.ok(`sem rolagem lateral em A pagar (${c.larg})`, (await N.rolagemLateral(page)) <= 0);

    await linha.getByRole('button', { name: /^Paguei/ }).click();
    const fb = page.locator('.g-folha').last();
    await fb.waitFor({ timeout: 10000 });
    await fb.getByRole('group', { name: 'Forma de pagamento' }).getByRole('button', { name: 'Pix' }).click();
    await fb.getByRole('button', { name: 'Dar baixa' }).click();
    // caixa fechado: a tela pergunta se lança assim mesmo
    await page.waitForTimeout(1200);
    if ((await page.locator('.g-folha').count()) >= 2) await page.locator('.g-folha').last().locator('.g-btn.pri').click();
    await page.waitForSelector('.g-folha', { state: 'detached', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1200);
    T.ok('Paguei: a conta fica paga no banco (Pix, hoje)', B.sql(`select pago || '|' || forma || '|' || (data = '${L.hoje}') from lancamentos where petshop_id='${P}' and descricao='${c.modelo}' and competencia is not null`) === 'true|pix|true');
    const depois = limpo(await page.locator('.g-main').innerText());
    T.ok('… e sai de A pagar', !(await page.locator('.gf-conta', { hasText: c.modelo }).count()), depois.slice(0, 300));
    T.ok(`nenhum erro na tela (${c.larg})`, erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }

  T.secao('Relatórios: Quanto sobrou com "Contas fixas" nas saídas');
  const { ctx, page, erros } = await N.contexto(390, 844);
  await N.entrar(page, L.emails.dono, L.senha);
  await N.ir(page, '/gestao/app/relatorios');
  await page.waitForSelector('#quanto-sobrou', { timeout: 20000 });
  await page.waitForTimeout(1500);
  const ponte = limpo(await page.locator('[aria-label="Como fecha com o Financeiro"]').innerText().catch(() => ''));
  T.ok('Quanto sobrou: "Contas fixas R$ 2.880,00", com Aluguel e Luz embaixo', /Contas fixas\s*R\$ 2\.880,00/.test(ponte) && /Aluguel\s*R\$ 2\.500,00/.test(ponte) && /Luz\s*R\$ 380,00/.test(ponte), ponte);
  await page.locator('#quanto-sobrou').screenshot({ path: `${B.RAIZ}/testes/saida/contas-fixas-relatorio-390.png` }).catch(() => {});
  T.ok('sem rolagem lateral em Relatórios (390)', (await N.rolagemLateral(page)) <= 0);
  await N.ir(page, '/gestao/app');
  await page.waitForTimeout(1500);
  T.ok('a tela Hoje abre sem erro', erros.length === 0, erros.slice(0, 4));
  await ctx.close();
  await N.fecharNavegador();
}))();
