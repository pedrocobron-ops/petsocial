// Planilha e caderno que não se perdem (achados da Juliana e da Neide), pela tela.
// 390: Clientes → Trazer de planilha → escolhe um .xlsx de 10 linhas ("Luna, Bob" numa célula, alergia nas observações) →
//   a conferência das colunas → Trazer e sai da tela logo depois → volta: a última importação diz exatamente o que está no banco
//   ("8 tutores novos e 9 pets novos"), de outro aparelho também. Desfazer pela linha da última importação.
// 390: Foto do caderno → lê → corrige um nome → a página recarrega → "Você tem uma leitura que ainda não foi salva" →
//   Continuar a revisão (com a correção, sem ler de novo: a página do dia não conta outra vez) → Salvar → o rascunho sai.
//   A dívida do tutor que nasce na mesma leitura não diz "Já existe". Outra leitura → Descartar.
// 1366: o mesmo aviso de leitura guardada, e a folha da planilha sem rolagem para o lado.
const B = require('../lib/base');
const N = require('../lib/navegador');
const { criarLoja } = require('../lib/semente');
const { xlsx } = require('../lib/xlsx');
const T = require('../lib/teste')('telas-importar-rascunho');
const nb = (s) => (s ?? '').replace(/ /g, ' ');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Importar telas' });
  const P = L.P;
  const pasta = `${B.RAIZ}/testes/saida`;
  const n = (q) => B.num(q);

  // ---------- planilha .xlsx ----------
  {
    const { ctx, page, erros } = await N.contexto(390, 844);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/clientes');
    T.secao('390: planilha .xlsx');
    await page.locator('button', { hasText: /planilha/i }).first().click();
    const folha = page.locator('.g-folha');
    await folha.waitFor();
    T.ok('o botão aceita Excel', /Escolher planilha \(Excel ou CSV\)/.test(await folha.innerText()));
    const linhas = [['Nome', 'Celular', 'Pet', 'Raça', 'Porte', 'Observações']];
    for (let i = 1; i <= 7; i++) linhas.push([`Tutor Planilha ${i}`, 11970001000 + i, `Pet ${i}`, 'SRD', 'M', i === 3 ? 'Alergia a shampoo comum' : '']);
    linhas.push(['Tutor Planilha 8', '11970001008', 'Luna, Bob', '', 'P', 'Bravo com outros machos']);
    linhas.push(['Tutor Planilha 1', '11970001001', 'Pet 1', '', '', '']);
    linhas.push(['', '', '', '', '', '']);
    await folha.locator('input[type=file]').setInputFiles({ name: 'clientes.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: xlsx(linhas) });
    await folha.locator('.g-imp-tabela').waitFor({ timeout: 10000 });
    const texto = nb(await folha.innerText());
    T.ok('o .xlsx abriu: a conferência das colunas mostra os títulos', /Nome/.test(texto) && /Celular/.test(texto) && /3\. Confira o que é cada coluna/.test(texto));
    T.ok('9 linhas para trazer (a vazia fica de fora)', /9 linhas para trazer/.test(texto), texto.match(/\d+ linhas? para trazer/)?.[0]);
    await page.screenshot({ path: `${pasta}/importar-xlsx-390.png` }).catch(() => {});
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 0);
    const antes = { c: n(`select count(*) from clientes where petshop_id='${P}'`), p: n(`select count(*) from pets where petshop_id='${P}'`) };
    // Trazer e sai da tela logo em seguida (como a Juliana): a importação é uma operação só, no banco
    const pedido = page.waitForRequest((r) => /\/rpc\/importar_clientes/.test(r.url()), { timeout: 10000 });
    await folha.locator('button.g-btn.pri', { hasText: /^Trazer/ }).click();
    await pedido;
    await page.goto(B.BASE_URL + '/gestao/app');
    await page.waitForTimeout(2500);
    const depois = { c: n(`select count(*) from clientes where petshop_id='${P}'`), p: n(`select count(*) from pets where petshop_id='${P}'`) };
    T.ok('saiu da tela: entrou tudo (8 tutores e 9 pets, Luna e Bob separados)', depois.c - antes.c === 8 && depois.p - antes.p === 9, { antes, depois });
    T.ok('a alergia e o "bravo" viraram alertas', n(`select count(*) from pets where petshop_id='${P}' and alertas is not null`) === 3);
    await ctx.close();

    // outro aparelho (computador) vê a última importação com o resumo do banco e desfaz
    const c2 = await N.contexto(1366, 900);
    await N.entrar(c2.page, L.emails.dono, L.senha);
    await N.ir(c2.page, '/gestao/app/clientes');
    const linha = c2.page.locator('.g-imp-linha');
    await linha.waitFor({ timeout: 15000 });
    T.ok('1366: a linha da última importação diz o que está no banco: "8 tutores novos e 9 pets novos"', /8 tutores novos e 9 pets novos no cadastro/.test(nb(await linha.innerText())), await linha.innerText());
    await linha.click();
    const f2 = c2.page.locator('.g-folha');
    await f2.waitFor();
    T.ok('1366: a folha mostra o resumo completo (separados e alertas)', /mais de um pet na mesma célula/.test(nb(await f2.innerText())) && /3 pets ficaram com alerta/.test(nb(await f2.innerText())), await f2.innerText());
    await c2.page.screenshot({ path: `${pasta}/importar-ultima-1366.png` }).catch(() => {});
    T.ok('1366: sem rolagem para o lado', (await N.rolagemLateral(c2.page)) <= 0);
    await f2.locator('button', { hasText: 'Desfazer esta importação' }).first().click();
    await c2.page.locator('button.g-btn.perigo', { hasText: 'Desfazer a importação' }).click();
    await c2.page.waitForTimeout(1500);
    T.ok('1366: desfeita: os 8 tutores saíram', n(`select count(*) from clientes where petshop_id='${P}'`) === antes.c && /Importação desfeita: 8 tutores saíram e 9 pets saíram/.test(nb(await f2.innerText())), await f2.innerText());
    T.ok('nenhum erro na tela', erros.length === 0 && c2.erros.length === 0, [...erros, ...c2.erros].slice(0, 4));
    await c2.ctx.close();
  }

  // ---------- caderno: a leitura volta depois de recarregar ----------
  async function escolherFotoELer(page) {
    const folha = page.locator('.g-folha');
    const img = await page.screenshot({ type: 'png' });
    await folha.locator('input[type=file][multiple]').setInputFiles({ name: 'caderno.png', mimeType: 'image/png', buffer: img });
    await folha.locator('.g-cad-arqs li').first().waitFor({ timeout: 10000 });
    await folha.locator('button', { hasText: /^Ler / }).click();
    await folha.locator('.g-cad-secao').first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(300);
  }
  {
    const { ctx, page, erros } = await N.contexto(390, 844);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/clientes');
    T.secao('390: caderno, recarregando no meio da conferência');
    await page.locator('button', { hasText: 'Foto do caderno' }).click();
    let folha = page.locator('.g-folha');
    await folha.locator('.g-cad-tipo', { hasText: 'Não sei, descubra' }).click();
    await escolherFotoELer(page);
    const usadas = n(`select coalesce(sum(paginas), 0) from caderno_uso where petshop_id='${P}'`);
    T.ok('a leitura ficou guardada no banco assim que chegou', n(`select count(*) from rascunhos where petshop_id='${P}' and tipo='caderno'`) === 1);
    const joana = folha.locator('[data-linha=divida]').filter({ has: page.locator('input[value="Joana Prado"]') });
    const marta = folha.locator('[data-linha=cliente]').filter({ has: page.locator('input[value="Marta Gomes"]') });
    await marta.locator('input[aria-label="Nome do tutor"]').fill('Marta Gomes Silva');
    // a dívida de alguém que nasce nesta mesma leitura não diz "Já existe"
    await folha.locator('[data-linha=divida]').filter({ has: page.locator('input[value="Beto Lima"]') }).first().waitFor();
    void joana;
    await page.waitForTimeout(1200); // a correção fica guardada um instante depois
    await page.reload();
    await page.waitForSelector('.g-main', { timeout: 30000 });
    await page.waitForTimeout(800);
    await page.locator('button', { hasText: 'Foto do caderno' }).click();
    folha = page.locator('.g-folha');
    const aviso = folha.locator('[data-teste=leitura-pendente]');
    await aviso.waitFor({ timeout: 15000 });
    T.ok('recarregou: "Você tem uma leitura que ainda não foi salva"', /Você tem uma leitura que ainda não foi salva/.test(nb(await aviso.innerText())), await aviso.innerText());
    await page.screenshot({ path: `${pasta}/caderno-pendente-390.png` }).catch(() => {});
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 0);
    await aviso.locator('button', { hasText: 'Continuar a revisão' }).click();
    await folha.locator('.g-cad-secao').first().waitFor({ timeout: 15000 });
    T.ok('voltou a conferência com a correção (Marta Gomes Silva)', (await folha.locator('input[value="Marta Gomes Silva"]').count()) === 1);
    T.ok('sem ler de novo: o limite do dia não contou outra página', n(`select coalesce(sum(paginas), 0) from caderno_uso where petshop_id='${P}'`) === usadas);
    T.ok('Ana Souza continua "Já existe"', /Já existe/.test(await folha.locator('[data-linha=cliente]').filter({ has: page.locator('input[value="Ana Souza"]') }).innerText()));
    await page.locator('.g-cad-rodape button', { hasText: /^Salvar/ }).click();
    await folha.locator('.g-imp-resumo').waitFor({ timeout: 30000 });
    await page.waitForTimeout(800);
    T.ok('salvou a Marta com o nome corrigido', n(`select count(*) from clientes where petshop_id='${P}' and nome='Marta Gomes Silva'`) === 1);
    T.ok('salvo: o rascunho saiu', n(`select count(*) from rascunhos where petshop_id='${P}'`) === 0);
    await folha.locator('button', { hasText: 'Trazer mais páginas' }).click();
    T.ok('depois de salvar, nada de leitura pendente', (await folha.locator('[data-teste=leitura-pendente]').count()) === 0);

    T.secao('390: dívida de um tutor novo da mesma leitura');
    B.sql(`delete from rascunhos where petshop_id='${P}'`);
    // um tutor que ainda não existe, com dívida, na mesma leitura (a leitura de teste de PDF traz Paulo Nunes nas duas listas)
    await folha.locator('.g-cad-tipo', { hasText: 'Não sei, descubra' }).click();
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n', 'latin1');
    await folha.locator('input[type=file][multiple]').setInputFiles({ name: 'lista.pdf', mimeType: 'application/pdf', buffer: pdf });
    await folha.locator('.g-cad-arqs li').first().waitFor({ timeout: 15000 });
    await folha.locator('button', { hasText: /^Ler / }).click();
    await folha.locator('.g-cad-secao').first().waitFor({ timeout: 30000 });
    const paulo = folha.locator('[data-linha=divida]').filter({ has: page.locator('input[value="Paulo Nunes"]') });
    const tags = nb(await paulo.locator('.g-cad-tags').innerText());
    T.ok('Paulo Nunes (novo nesta leitura): "Cliente novo, desta leitura", não "Já existe"', /Cliente novo, desta leitura/.test(tags) && !/Já existe/.test(tags), tags);

    T.secao('390: descartar');
    await page.reload();
    await page.waitForSelector('.g-main', { timeout: 30000 });
    await page.waitForTimeout(800);
    await page.locator('button', { hasText: 'Foto do caderno' }).click();
    folha = page.locator('.g-folha');
    await folha.locator('[data-teste=leitura-pendente]').waitFor({ timeout: 15000 });
    await folha.locator('[data-teste=leitura-pendente] button', { hasText: 'Descartar' }).click();
    await page.locator('button.g-btn.perigo', { hasText: 'Descartar' }).click();
    await page.waitForTimeout(800);
    T.ok('descartou: o aviso some e o rascunho sai do banco', (await folha.locator('[data-teste=leitura-pendente]').count()) === 0 && n(`select count(*) from rascunhos where petshop_id='${P}'`) === 0);
    T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }

  // ---------- 1366: o aviso da leitura guardada ----------
  {
    const { ctx, page, erros } = await N.contexto(1366, 900);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/clientes');
    T.secao('1366: leitura guardada');
    await page.locator('button', { hasText: 'Foto do caderno' }).click();
    const folha = page.locator('.g-folha');
    await folha.locator('.g-cad-tipo', { hasText: 'Clientes e pets' }).click();
    await escolherFotoELer(page);
    await page.reload();
    await page.waitForSelector('.g-main', { timeout: 30000 });
    await page.waitForTimeout(800);
    await page.locator('button', { hasText: 'Foto do caderno' }).click();
    await page.locator('.g-folha [data-teste=leitura-pendente]').waitFor({ timeout: 15000 });
    await page.screenshot({ path: `${pasta}/caderno-pendente-1366.png` }).catch(() => {});
    T.ok('o aviso com Continuar e Descartar', (await page.locator('.g-folha [data-teste=leitura-pendente] button').count()) === 2);
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 0);
    T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
