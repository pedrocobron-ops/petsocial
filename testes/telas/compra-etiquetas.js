// Estoque: O que comprar e Etiquetas pela tela, em 390 e 1366.
// - O que comprar: "Vendeu em média 3,5 por semana nas últimas 6 semanas", comprar 6 (2 semanas) e 13 (4 semanas); a análise com
//   parados e Valor em estoque (só para quem vê o financeiro: a pessoa do estoque não vê nenhum R$); "Montar pedido" do fornecedor
//   abre a mensagem do WhatsApp com "- 6 unidades de Ração Golden 15 kg", e mudar a quantidade muda a mensagem;
// - Etiquetas na mesma aba, com Voltar: 3 da Ração (EAN-13) + 2 do Bifinho; "Gerar código interno" dá MP000001 ao Bifinho
//   (guardado no banco); os códigos desenhados na página são lidos de volta (testes/lib/barras.js); PDF (page.pdf, tamanho do
//   @page): A4 3 × 10 numa folha A4, 4 × 16 também, impressora 40 × 25 mm com uma etiqueta por página (5 páginas de 40 × 25 mm),
//   com o nome e o preço no texto do PDF; "Imprimir etiquetas do que entrou" numa Entrada abre a folha com uma por unidade.
// Capturas e PDFs em testes/saida/compra-*.png e etiquetas-*.pdf.
const fs = require('fs');
const { execFileSync } = require('child_process');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const { lerModulos } = require('../lib/barras');
const T = require('../lib/teste')('compra-etiquetas');
const SAIDA = B.RAIZ + '/testes/saida';
const tx = (s) => String(s).replace(/[  ]/g, ' ');

/** Os códigos desenhados nas etiquetas da página: módulos de cada SVG (pela posição das barras) lidos de volta. */
const codigosDaPagina = (page) => page.$$eval('.g-et-papel .g-et-barras svg', (svgs) => svgs.map((svg) => {
  const larg = Number(svg.getAttribute('viewBox').split(' ')[2]);
  const m = Array(larg).fill('0');
  for (const r of [...svg.querySelectorAll('rect')].slice(1)) for (let x = Number(r.getAttribute('x')); x < Number(r.getAttribute('x')) + Number(r.getAttribute('width')); x++) m[x] = '1';
  return { modulos: m.join(''), tipo: svg.parentElement.getAttribute('data-tipo') };
}));

/** PDF como "Salvar como PDF" (tamanho do papel pelo @page da tela): páginas, tamanho em mm da primeira e o texto. */
async function pdf(page, nome) {
  await page.emulateMedia({ media: 'print' });
  const arq = `${SAIDA}/${nome}.pdf`;
  await page.pdf({ path: arq, preferCSSPageSize: true, printBackground: true });
  await page.emulateMedia({ media: 'screen' });
  const info = execFileSync('pdfinfo', [arq], { encoding: 'utf8' });
  const paginas = Number(/Pages:\s+(\d+)/.exec(info)[1]);
  const [, w, h] = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info);
  const mm = (pt) => Math.round((Number(pt) / 72) * 25.4);
  return { paginas, w: mm(w), h: mm(h), texto: tx(execFileSync('pdftotext', ['-layout', arq, '-'], { encoding: 'utf8' })) };
}

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  fs.mkdirSync(SAIDA, { recursive: true });
  const L = await criarLoja(T, { nome: 'Compra telas' });
  const { dono } = L.sb;
  const P = L.P;
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'loja.codigo_barras': true, 'loja.fornecedores': true } }), 'opções da loja');
  const forn = B.must(await dono.from('fornecedores').insert({ petshop_id: P, nome: 'Distribuidora Bom Pet', telefone: '11977770000' }).select('id').single(), 'fornecedor').id;
  const racao = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Ração Golden 15 kg', unidade: 'un', estoque: 0, estoque_minimo: 3, preco_venda: 189.9, custo: 100, fornecedor_id: forn, codigo_barras: '7891234567895' }).select('id').single(), 'ração').id;
  const bifinho = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Bifinho de carne sabor churrasco pacote grande 500 g', unidade: 'un', estoque: 5, preco_venda: 9.9 }).select('id').single(), 'bifinho').id;
  for (const dias of [38, 31, 25, 19, 13, 7, 2]) {
    const id = B.must(await dono.from('movimentos_estoque').insert({ petshop_id: P, produto_id: racao, tipo: 'entrada', quantidade: 3, motivo: 'Compra' }).select('id').single(), 'entrada').id;
    const s = B.must(await dono.from('movimentos_estoque').insert({ petshop_id: P, produto_id: racao, tipo: 'saida', quantidade: 3, motivo: 'Venda' }).select('id').single(), 'venda').id;
    B.sql(`update movimentos_estoque set criado_em = now() - interval '${dias} days' where id in ('${id}', '${s}')`);
  }
  B.sql(`update produtos set estoque = 4, criado_em = now() - interval '100 days' where id='${racao}'`);
  B.sql(`update produtos set criado_em = now() - interval '100 days' where petshop_id='${P}' and id <> '${racao}'`);

  for (const [larg, alt] of [[390, 844], [1366, 900]]) {
    T.secao(`O que comprar · ${larg} px`);
    const { ctx, page, erros } = await N.contexto(larg, alt);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/estoque');
    await N.doAlto(page, 'O que comprar');
    const folha = page.locator('.g-folha').last();
    await folha.locator('.g-lj-sug').first().waitFor({ timeout: 15000 });
    let t = tx(await folha.innerText());
    T.ok('Ração: "Vendeu em média 3,5 por semana nas últimas 6 semanas", comprar 6, no grupo da Distribuidora Bom Pet',
      /Vendeu em média 3,5 por semana nas últimas 6 semanas \(21 no total\)\. Para 2 semanas: 7 \+ mínimo 3 = 10\. Tem 4: faltam 6\. Comprar 6 unidades\./.test(t) && /Distribuidora Bom Pet/.test(t)
      && (await folha.locator('.g-lj-sug[data-produto="Ração Golden 15 kg"] .q b').innerText()) === '6', t.slice(0, 900));
    T.ok('análise: Bifinho e Shampoo parados há 60+ dias e Valor em estoque R$ 640,00 (Ração 4 × 100 + Shampoo 20 × 12) para a dona', /Parados há 60\+ dias\s*2/i.test(t) && /Valor em estoque\s*R\$ 640,00/i.test(t), t.slice(t.indexOf('Análise'), t.indexOf('Análise') + 300));
    T.ok('Bifinho e Shampoo ficam em Sem vendas recentes, sem sugestão', /Sem vendas recentes \(2\)/.test(t) && (await folha.locator('.g-lj-sug .q').count()) === 1);
    await folha.getByRole('button', { name: '4 semanas' }).first().click();
    await page.waitForTimeout(300);
    T.ok('para 4 semanas: 14 + 3 − 4 = comprar 13', (await folha.locator('.g-lj-sug[data-produto="Ração Golden 15 kg"] .q b').innerText()) === '13');
    await folha.getByRole('button', { name: '2 semanas' }).first().click();
    await page.waitForTimeout(300);
    T.ok(`sem rolagem lateral (${larg})`, (await N.rolagemLateral(page)) <= 0);
    await page.screenshot({ path: `${SAIDA}/compra-${larg}.png`, fullPage: larg > 400 });
    await folha.getByRole('button', { name: /Montar pedido/ }).click();
    const ped = page.locator('.g-folha').last();
    await ped.getByLabel('Mensagem do pedido').waitFor({ timeout: 10000 });
    t = tx(await ped.getByLabel('Mensagem do pedido').inputValue());
    T.ok('Montar pedido: a mensagem do fornecedor já vem com "- 6 unidades de Ração Golden 15 kg"', /^Olá, Distribuidora Bom Pet!/.test(t) && /- 6 unidades de Ração Golden 15 kg/.test(t), t);
    await ped.getByLabel('Quantidade de Ração Golden 15 kg no pedido').fill('8');
    t = tx(await ped.getByLabel('Mensagem do pedido').inputValue());
    const zap = await ped.getByRole('link', { name: /Abrir no WhatsApp/ }).getAttribute('href');
    T.ok('mudar para 8 muda a mensagem e o link do WhatsApp do fornecedor', /- 8 unidades de Ração Golden 15 kg/.test(t) && /5511977770000/.test(zap) && /8%20unidades/.test(zap), zap);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SAIDA}/compra-pedido-${larg}.png` });
    await ped.getByRole('button', { name: 'Voltar' }).click();

    T.secao(`Etiquetas · ${larg} px`);
    await N.ir(page, `/gestao/app/estoque/etiquetas?p=${racao}:3,${bifinho}:2`);
    await page.locator('.g-et-papel .g-et').first().waitFor({ timeout: 15000 });
    T.ok('a folha abre na mesma aba com 5 etiquetas (3 da Ração, 2 do Bifinho) e o Voltar para o estoque',
      (await page.locator('.g-et-papel .g-et:not(.vazia)').count()) === 5 && (await page.getByRole('link', { name: 'Voltar para o estoque' }).getAttribute('href')) === '/gestao/app/estoque');
    const gerar = page.getByRole('button', { name: 'Gerar código interno' });
    if (larg === 390) {
      T.ok('Bifinho sem código: o aviso oferece "Gerar código interno"', await gerar.count() === 1);
      await gerar.click();
      await page.locator('text=MP000001').first().waitFor({ timeout: 10000 }).catch(() => {});
      T.ok('… e o banco guardou MP000001 no Bifinho', B.sql(`select codigo_barras from produtos where id='${bifinho}'`) === 'MP000001');
      await page.waitForTimeout(500);
    }
    const lidos = (await codigosDaPagina(page)).map((c) => ({ tipo: c.tipo, lido: lerModulos(c.modulos) }));
    T.ok('os 5 códigos desenhados são lidos de volta: 3 × EAN-13 7891234567895 e 2 × Code 128 MP000001',
      lidos.length === 5 && lidos.filter((c) => c.tipo === 'ean13' && c.lido === '7891234567895').length === 3 && lidos.filter((c) => c.tipo === 'code128' && c.lido === 'MP000001').length === 2, lidos);
    const nome = tx(await page.locator('.g-et-papel .g-et .nome').first().innerText());
    T.ok('nome comprido cortado na palavra com reticências', /^Bifinho de carne sabor churrasco.*…$/.test(nome) && nome.length <= 48, nome);
    T.ok(`sem rolagem lateral nas etiquetas (${larg})`, (await N.rolagemLateral(page)) <= 0);
    await page.screenshot({ path: `${SAIDA}/etiquetas-${larg}.png`, fullPage: true });
    if (larg === 1366) {
      let r = await pdf(page, 'etiquetas-a4-3x10');
      T.ok('PDF A4 3 × 10: uma folha de 210 × 297 mm com o nome, o preço e o código', r.paginas === 1 && r.w === 210 && r.h === 297 && /Ração Golden 15 kg/.test(r.texto) && /R\$ 189,90/.test(r.texto) && /7891234567895/.test(r.texto) && /MP000001/.test(r.texto), r);
      await page.getByRole('radio', { name: /4 × 16/ }).click();
      r = await pdf(page, 'etiquetas-a4-4x16');
      T.ok('PDF A4 4 × 16: uma folha A4', r.paginas === 1 && r.w === 210 && r.h === 297 && /R\$ 9,90/.test(r.texto), r);
      await page.getByRole('radio', { name: /40 × 25/ }).click();
      await page.waitForTimeout(300);
      r = await pdf(page, 'etiquetas-40x25');
      T.ok('PDF da impressora de etiqueta 40 × 25 mm: 5 páginas de 40 × 25 mm (uma etiqueta por página)', r.paginas === 5 && r.w === 40 && r.h === 25, r);
      const porPagina = r.texto.split('\f').filter((x) => x.trim());
      T.ok('… cada página com uma etiqueta só', porPagina.length === 5 && porPagina.every((x) => (x.match(/R\$/g) ?? []).length === 1), porPagina.map((x) => x.slice(0, 60)));
      await page.getByRole('radio', { name: /50 × 30/ }).click();
      r = await pdf(page, 'etiquetas-50x30');
      T.ok('PDF 50 × 30 mm: 5 páginas de 50 × 30 mm', r.paginas === 5 && r.w === 50 && r.h === 30, r);

      // Entrada com "Imprimir etiquetas do que entrou"
      await N.ir(page, '/gestao/app/estoque');
      await page.locator('.g-est-prod', { hasText: 'Bifinho' }).getByRole('button', { name: 'Entrada' }).click();
      const ent = page.locator('.g-folha').last();
      await ent.locator('input[inputmode=decimal]').first().fill('4');
      await ent.getByText('Imprimir etiquetas do que entrou').click();
      await ent.getByRole('button', { name: 'Anotar entrada' }).click();
      await page.waitForURL('**/estoque/etiquetas?p=**', { timeout: 15000 });
      await page.locator('.g-et-papel .g-et').first().waitFor({ timeout: 15000 });
      T.ok('Entrada de 4 com "Imprimir etiquetas do que entrou": a folha abre com 4 etiquetas do Bifinho',
        (await page.locator('.g-et-papel .g-et:not(.vazia)').count()) === 4 && (await page.locator('.g-et-papel .g-et .nome').first().innerText()).startsWith('Bifinho'));
    }
    T.ok(`nenhum erro na tela (${larg})`, erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }

  T.secao('quem cuida do estoque (sem dinheiro) · 390 px');
  const { ctx, page, erros } = await N.contexto(390, 844);
  await N.entrar(page, L.emails.estoque, L.senha);
  await N.ir(page, '/gestao/app/estoque');
  await N.doAlto(page, 'O que comprar');
  const folha = page.locator('.g-folha').last();
  await folha.locator('.g-lj-sug').first().waitFor({ timeout: 15000 });
  const t = tx(await folha.innerText());
  T.ok('vê a sugestão (comprar 6) e nenhum valor em R$ (nem Valor em estoque)', /Comprar 6 unidades/.test(t) && !/R\$/.test(t) && !/Valor em estoque/.test(t), t.slice(0, 400));
  T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 4));
  await ctx.close();
  await N.fecharNavegador();
}))();
