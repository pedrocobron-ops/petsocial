// Validade e lote, kits e contagem de estoque pela tela (migração 20261201), em 390 e 1366.
// - 390, quem cuida do estoque (sem dinheiro): o aviso na tela Hoje ("1 lote vencido…") leva a Estoque, Vencendo, sem nenhum R$;
//   "Perda" dá baixa no lote vencido (no banco: saída "Vencido", lote zerado); a contagem pelo celular: começar (todos), + e − e
//   digitar, sem internet ("Sem internet: … guardadas neste aparelho") e de volta (vai sozinho), revisar e "Ajustar estoque"
//   (no banco: os saldos e os movimentos "Contagem").
// - 1366, o dono: Entrada com lote e validade; kit novo (Tipo: Kit ou combo, 1 shampoo + 1 condicionador, "Dá para montar");
//   Vencendo com o valor; o histórico da contagem com quem e quando; a folha impressa.
// Capturas em testes/saida/lotes-*.png e contagem-*.png.
const fs = require('fs');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('estoque-lotes');
const D = lib('dinheiro');
const SAIDA = B.RAIZ + '/testes/saida';
const tx = (s) => String(s).replace(/[\u00a0\u202f]/g, " ");

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  fs.mkdirSync(SAIDA, { recursive: true });
  const L = await criarLoja(T, { nome: 'Lotes telas' });
  const { dono } = L.sb;
  const P = L.P;
  const novo = async (campos) => B.must(await dono.from('produtos').insert({ petshop_id: P, unidade: 'un', ...campos }).select('id').single(), campos.nome).id;
  const entrada = (produto, quantidade, extra = {}) => D.gravarMovimentos(dono, P, [{ petshop_id: P, produto_id: produto, tipo: 'entrada', quantidade, motivo: 'Compra', chave: D.novaChaveDeOperacao(), ...extra }]);
  const sh = await novo({ nome: 'Shampoo Pelos Claros', categoria: 'Higiene', controla_validade: true, preco_venda: 34.9 });
  const co = await novo({ nome: 'Condicionador Suave', categoria: 'Higiene', preco_venda: 29.9 });
  await entrada(sh, 3, { lote: 'L-VELHO', validade: L.dia(-3), custo_unitario: 12.5 });
  await entrada(sh, 6, { lote: 'L-NOVO', validade: L.dia(20), custo_unitario: 12.5 });
  await entrada(co, 5, { custo_unitario: 10 });
  const saldo = (id) => B.num(`select estoque from produtos where id='${id}'`);

  T.secao('quem cuida do estoque · 390 px');
  {
    const { ctx, page, erros } = await N.contexto(390, 844);
    await N.entrar(page, L.emails.estoque, L.senha);
    const aviso = page.locator('.g-atencao a', { hasText: 'lote vencido' });
    await aviso.waitFor({ timeout: 20000 });
    T.ok('Hoje: "1 lote vencido e 1 lote vence em até 30 dias no estoque: Shampoo Pelos Claros"', /1 lote vencido e 1 lote vence em até 30 dias no estoque: Shampoo Pelos Claros/.test(tx(await aviso.innerText())), await aviso.innerText());
    await aviso.click();
    const folha = page.locator('.g-folha', { hasText: 'Vencendo' }).last();
    await folha.locator('.g-val-lista li').first().waitFor({ timeout: 15000 });
    const t = tx(await folha.innerText());
    T.ok('Vencendo: vencidos (Lote L-VELHO, vencido há 3 dias, 3 un) e em 30 dias (L-NOVO, vence em 20 dias, 6 un), sem R$',
      /Vencidos/.test(t) && /Lote L-VELHO/.test(t) && /vencido há 3 dias/.test(t) && /Vencem em até 30 dias/.test(t) && /vence em 20 dias/.test(t) && !/R\$/.test(t), t.slice(0, 600));
    await page.screenshot({ path: `${SAIDA}/lotes-vencendo-390.png` });
    await folha.getByRole('button', { name: /Dar baixa como perda: Shampoo Pelos Claros, Lote L-VELHO/ }).click();
    await page.waitForFunction(() => document.querySelectorAll('.g-folha .g-val-lista li.vencido').length === 0, null, { timeout: 15000 });
    T.ok('"Perda": o lote vencido sai (no banco: saída "Vencido" de 3, lote zerado, saldo 6)', B.num(`select count(*) from movimentos_estoque where produto_id='${sh}' and motivo='Vencido' and quantidade=3`) === 1
      && B.num(`select quantidade from produtos_lotes where produto_id='${sh}' and lote='L-VELHO'`) === 0 && saldo(sh) === 6);
    await folha.getByRole('button', { name: 'Voltar' }).click();

    T.secao('contagem no celular · 390 px');
    await N.ir(page, '/gestao/app/estoque');
    await N.doAlto(page, 'Contagem', 'link');
    await page.getByRole('button', { name: 'Começar contagem' }).click();
    const comecar = page.locator('.g-folha', { hasText: 'O que contar?' }).last();
    await comecar.getByRole('button', { name: 'Começar', exact: true }).click();
    await page.waitForURL('**/estoque/contagem?id=**', { timeout: 15000 });
    const linhaSh = page.locator('.g-cont-itens li[data-produto="Shampoo Pelos Claros"]');
    await linhaSh.waitFor({ timeout: 15000 });
    const id = new URL(page.url()).searchParams.get('id');
    // shampoo: 6 no sistema, contou 5 (+ seis vezes, − uma)
    for (let k = 0; k < 6; k++) await linhaSh.getByRole('button', { name: /Mais 1 de/ }).click();
    await linhaSh.getByRole('button', { name: /Menos 1 de/ }).click();
    T.ok('+ e − na linha: 5', await linhaSh.locator('input').evaluate((el) => new Promise((ok) => { let n = 0; const v = () => (el.value === '5' || ++n > 30 ? ok(el.value === '5') : setTimeout(v, 100)); v(); })));
    await page.waitForFunction((x) => !document.querySelector('[data-teste="contagem-pendente"]'), null, { timeout: 15000 }).catch(() => {});
    T.ok('vai ao banco sozinho (contado 5, esperado 6)', B.num(`select contado from contagens_itens where contagem_id='${id}' and produto_id='${sh}'`) === 5
      && B.num(`select esperado from contagens_itens where contagem_id='${id}' and produto_id='${sh}'`) === 6);
    // sem internet: digita o condicionador; fica no aparelho e vai quando a internet volta
    await ctx.setOffline(true);
    const linhaCo = page.locator('.g-cont-itens li[data-produto="Condicionador Suave"]');
    await linhaCo.locator('input').fill('7');
    await page.locator('[data-teste="contagem-pendente"]', { hasText: 'Sem internet' }).waitFor({ timeout: 15000 });
    T.ok('sem internet: "Sem internet: 1 contagem guardada neste aparelho"', /Sem internet: 1 contagem guardada neste aparelho/.test(tx(await page.locator('[data-teste="contagem-pendente"]').innerText())));
    await page.screenshot({ path: `${SAIDA}/contagem-sem-internet-390.png` });
    T.ok('… e nada foi ao banco ainda', B.num(`select count(contado) from contagens_itens where contagem_id='${id}' and produto_id='${co}'`) === 0);
    await ctx.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.locator('[data-teste="contagem-pendente"]').waitFor({ state: 'detached', timeout: 20000 });
    T.ok('a internet volta: vai sozinho (condicionador 7)', B.num(`select contado from contagens_itens where contagem_id='${id}' and produto_id='${co}'`) === 7);
    // uma venda de shampoo no meio (pelo banco, como outra pessoa no caixa): a diferença continua sobre o que foi contado
    await D.gravarMovimentos(dono, P, [{ petshop_id: P, produto_id: sh, tipo: 'saida', quantidade: 1, motivo: 'Uso no banho', chave: D.novaChaveDeOperacao() }]);
    await page.screenshot({ path: `${SAIDA}/contagem-contar-390.png` });
    await page.getByRole('button', { name: 'Revisar diferenças' }).last().click();
    const tab = page.locator('.g-cont-tab');
    await tab.waitFor({ timeout: 15000 });
    const tt = tx(await tab.innerText());
    T.ok('revisão: shampoo −1, condicionador +2, sem R$', /Shampoo Pelos Claros[\s\S]*−1/.test(tt) && /Condicionador Suave[\s\S]*\+2/.test(tt) && !/R\$/.test(tt), tt);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SAIDA}/contagem-revisar-390.png`, fullPage: true });
    T.ok(`sem rolagem para o lado (390)`, (await N.rolagemLateral(page)) <= 0);
    await page.getByRole('button', { name: 'Ajustar estoque' }).click();
    await page.locator('.g-folha', { hasText: 'Ajustar o estoque?' }).last().getByRole('button', { name: 'Ajustar estoque' }).click();
    await page.getByText('Estoque ajustado', { exact: false }).first().waitFor({ timeout: 15000 });
    T.ok('Ajustar estoque: shampoo 6 − 1 (vendeu no meio) − 1 = 4, condicionador 5 + 2 = 7, dois movimentos "Contagem"', saldo(sh) === 4 && saldo(co) === 7
      && B.num(`select count(*) from movimentos_estoque where petshop_id='${P}' and tipo='ajuste' and motivo='Contagem'`) === 2);
    T.ok('nenhum erro na tela (390)', erros.filter((e) => !/net::ERR_INTERNET_DISCONNECTED|Failed to fetch|fetch failed|TypeError: Failed/.test(e)).length === 0, erros.slice(0, 4));
    await ctx.close();
  }

  T.secao('o dono · 1366 px');
  {
    const { ctx, page, erros } = await N.contexto(1366, 900);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/estoque');
    // entrada com lote e validade
    await page.locator('.g-est-prod', { hasText: 'Shampoo Pelos Claros' }).getByRole('button', { name: 'Entrada' }).click();
    const ent = page.locator('.g-folha').last();
    await ent.locator('input[inputmode=decimal]').first().fill('4');
    await ent.getByPlaceholder('Ex.: L2311A').fill('L-DEZ');
    await ent.getByLabel('Validade').fill(L.dia(45));
    // "Lançar a compra como despesa" começa desmarcado (antes vinha marcado e quem tocava desmarcava sem ver)
    T.ok('Lançar a compra como despesa começa desmarcado', !(await ent.getByRole('checkbox', { name: /Lançar a compra como despesa/ }).isChecked()));
    await ent.getByRole('button', { name: 'Anotar entrada' }).click();
    await page.locator('.g-folha').waitFor({ state: 'detached', timeout: 15000 });
    T.ok('Entrada com lote e validade: o lote L-DEZ com 4 e a validade certa', B.num(`select quantidade from produtos_lotes where produto_id='${sh}' and lote='L-DEZ'`) === 4
      && B.sql(`select validade::text from produtos_lotes where produto_id='${sh}' and lote='L-DEZ'`) === L.dia(45));
    // kit novo
    await page.getByRole('button', { name: 'Produto novo' }).click();
    const nv = page.locator('.g-folha').last();
    await nv.getByRole('button', { name: /Kit ou combo/ }).click();
    await nv.getByPlaceholder('Ex.: Ração Golden 15 kg').fill('Kit banho em casa');
    await nv.getByLabel('Buscar produto para pôr no kit').fill('sham');
    await nv.getByRole('button', { name: '+ Shampoo Pelos Claros' }).click();
    await nv.getByLabel('Buscar produto para pôr no kit').fill('cond');
    await nv.getByRole('button', { name: '+ Condicionador Suave' }).click();
    await nv.getByText(/Dá para montar 7 kits/).waitFor({ timeout: 5000 });
    const tk = tx(await nv.innerText());
    T.ok('o kit mostra "Dá para montar 7 kits" (8 shampoos, 7 condicionadores) e o custo da soma (R$ 22,50)', /Dá para montar 7 kits/.test(tk) && /Custo do kit: R\$ 22,50/.test(tk), tk.slice(-400));
    await page.screenshot({ path: `${SAIDA}/lotes-kit-novo-1366.png` });
    await nv.getByRole('button', { name: 'Salvar produto' }).click();
    await page.locator('.g-est-prod', { hasText: 'Kit banho em casa' }).waitFor({ timeout: 15000 });
    const kit = B.sql(`select id from produtos where petshop_id='${P}' and nome='Kit banho em casa'`);
    T.ok('no banco: tipo kit, 2 produtos, saldo 7, custo 22,50', B.sql(`select tipo from produtos where id='${kit}'`) === 'kit' && B.num(`select count(*) from produtos_kit_itens where kit_id='${kit}'`) === 2
      && saldo(kit) === 7 && B.num(`select custo from produtos where id='${kit}'`) === 22.5);
    T.ok('o cartão do kit: "Kit", 7 e "Produtos do kit"', /Kit/.test(await page.locator('.g-est-prod', { hasText: 'Kit banho em casa' }).innerText())
      && (await page.locator('.g-est-prod', { hasText: 'Kit banho em casa' }).getByRole('button', { name: 'Produtos do kit' }).count()) === 1);
    await N.doAlto(page, 'Vencendo');
    const vf = page.locator('.g-folha', { hasText: 'Vencem em' }).last();
    await vf.locator('.g-val-lista li').first().waitFor({ timeout: 15000 });
    const tv = tx(await vf.innerText());
    T.ok('Vencendo do dono: L-NOVO (6 un, R$ 75,00) e L-DEZ (4 un) com o valor a preço de custo', /Lote L-NOVO/.test(tv) && /Lote L-DEZ/.test(tv) && /R\$/.test(tv), tv.slice(0, 600));
    await page.screenshot({ path: `${SAIDA}/lotes-vencendo-1366.png` });
    await vf.getByRole('button', { name: 'Voltar' }).click();
    await page.screenshot({ path: `${SAIDA}/lotes-estoque-1366.png` });
    // histórico da contagem e a folha
    await N.ir(page, '/gestao/app/estoque/contagem');
    const h = page.locator('.g-cont-lista li', { hasText: 'todos os produtos' }).first();
    await h.waitFor({ timeout: 15000 });
    const th = tx(await h.innerText());
    T.ok('Histórico: "2 produtos ajustados", o valor (−12,50 + 20,00 = +R$ 7,50) e quem fez (Edu Estoque)', /2 produtos ajustados/.test(th) && /\+R\$ 7,50/.test(th) && /Edu Estoque/.test(th), th);
    await page.screenshot({ path: `${SAIDA}/contagem-historico-1366.png` });
    await h.getByRole('link', { name: /Imprimir/ }).click();
    await page.locator('.g-pa table').waitFor({ timeout: 15000 });
    const tp = tx(await page.locator('.g-pa').innerText());
    T.ok('a folha impressa: os produtos, sistema, contado e diferença', /Shampoo Pelos Claros/.test(tp) && /Condicionador Suave/.test(tp) && /\+2/.test(tp), tp.slice(0, 500));
    await page.screenshot({ path: `${SAIDA}/contagem-folha-1366.png` });
    T.ok('nenhum erro na tela (1366)', erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
