// 2ª rodada das testadoras (Camila, Neide e Juliana) pela tela, em 390 (e capturas em 1366):
// - Estoque sem produto: "Trazer de planilha" com validade, lote e unidade "unidade" → a lista aparece sem recarregar (antes:
//   "Nenhum produto ainda" até recarregar); o produto entra com Controlar validade, unidade "un" e o lote;
// - Entrada de produto com validade: sem a validade não anota (antes: "Entraram 10 un" fora do Vencendo); com ela, anota;
//   com a despesa e o caixa fechado o aviso diz "Pode pagar assim mesmo" (antes: "receber");
// - Vencendo: "Ver produto" e "Dar baixa" (abre a Saída com o lote escolhido);
// - Agenda: horário marcado para um dia que já passou: "Mel marcada" e sem "Mandar confirmação"; no detalhe, sem lembrete;
//   Banhista Ana e Banhista Beto aparecem com o nome inteiro nos chips;
// - ficha do pet: aniversário só com dia e mês (grava 1904); Aniversariantes do mês lista o pet;
// - Meu pet shop: cartão próprio "Promoção de aniversário do pet"; Registro de pedidos de dados com o nome e o protocolo.
// Capturas em testes/saida/2r-*.png.
const fs = require('fs');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('loja-textos-lgpd-telas');
const SAIDA = B.RAIZ + '/testes/saida';
const tx = (s) => String(s).replace(/[  ]/g, ' ');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  fs.mkdirSync(SAIDA, { recursive: true });
  const L = await criarLoja(T, { nome: '2a rodada' });
  const { dono } = L.sb;
  const P = L.P;
  B.sql(`delete from produtos where petshop_id='${P}'`);
  B.sql(`update pets set sexo='F' where id='${L.pets.Mel}'`);
  B.must(await dono.from('profissionais').insert([{ petshop_id: P, nome: 'Banhista Ana', papel: 'funcionario', atende: true }, { petshop_id: P, nome: 'Banhista Beto', papel: 'funcionario', atende: true }]).select('id'), 'banhistas');
  const { ctx, page, erros } = await N.contexto(390, 844);
  await N.entrar(page, L.emails.dono, L.senha);

  T.secao('Estoque: planilha de produtos (Camila)');
  await N.ir(page, '/gestao/app/estoque');
  await page.getByText('Nenhum produto ainda').waitFor({ timeout: 20000 });
  await N.doAlto(page, 'Trazer de planilha');
  const imp = page.locator('.g-folha', { hasText: 'Trazer produtos de uma planilha' }).last();
  await imp.locator('textarea').fill(`Produto;Unidade;Preço de venda;Custo;Quantidade em estoque;Validade;Lote\nBifinho de carne 65 g;unidade;9,90;4,80;30;${B.somaDias(L.hoje, 20).split('-').reverse().join('/')};BIF0930\nCama Pet;un;149,90;80;2;;`);
  await imp.getByRole('button', { name: /^Trazer 2 linhas$/ }).click();
  await imp.getByText(/2 produtos novos no estoque/).waitFor({ timeout: 20000 });
  T.ok('o resumo diz que um entrou com a validade e o lote', /1 produto entrou com a validade ou o lote/.test(tx(await imp.innerText())));
  await imp.getByRole('button', { name: 'Pronto' }).click();
  await page.getByText('Bifinho de carne 65 g').first().waitFor({ timeout: 8000 }).catch(() => {});
  T.ok('a lista aparece sem recarregar a página (antes: "Nenhum produto ainda")', (await page.getByText('Bifinho de carne 65 g').count()) > 0 && !(await page.getByText('Nenhum produto ainda').count()));
  const bif = B.sql(`select id from produtos where petshop_id='${P}' and nome='Bifinho de carne 65 g'`);
  T.ok('no banco: unidade "un" (não "unidade"), Controlar validade e o lote BIF0930 com 30', B.sql(`select unidade || '|' || controla_validade::text from produtos where id='${bif}'`) === 'un|true'
    && B.num(`select quantidade from produtos_lotes where produto_id='${bif}' and lote='BIF0930'`) === 30);

  T.secao('Entrada com validade e o aviso do caixa (Camila)');
  const cartao = page.locator('.g-est-prod', { hasText: 'Bifinho de carne 65 g' }).first();
  await cartao.getByRole('button', { name: /Entrada/ }).click();
  const ent = page.locator('.g-folha', { hasText: 'Entrada de Bifinho' }).last();
  await ent.getByLabel('Quantidade (un)').fill('10');
  T.ok('o campo Validade não diz mais "Opcional"', !/Opcional\. A venda tira/.test(tx(await ent.innerText())));
  await ent.getByRole('button', { name: 'Anotar entrada' }).click();
  await ent.getByText(/Diga a validade do que está entrando/).first().waitFor({ timeout: 8000 }).catch(() => {});
  T.ok('sem a validade: "Diga a validade do que está entrando (o lote é opcional)…" e nada entra', (await ent.getByText(/Diga a validade do que está entrando/).count()) > 0
    && B.num(`select count(*) from movimentos_estoque where produto_id='${bif}' and motivo='Compra'`) === 0);
  await ent.getByLabel('Lançar a compra como despesa', { exact: false }).check().catch(async () => { await ent.getByText(/Lançar a compra como despesa/).click(); });
  await ent.getByRole('button', { name: 'Pix' }).click();
  await ent.getByText(/Pode pagar assim mesmo/).waitFor({ timeout: 8000 }).catch(() => {});
  T.ok('caixa não aberto e despesa: "Pode pagar assim mesmo" (antes: "receber")', (await ent.getByText(/Pode pagar assim mesmo/).count()) > 0 && !(await ent.getByText(/Pode receber assim mesmo/).count()));
  await ent.getByText(/Lançar a compra como despesa/).click();
  await ent.getByLabel('Validade').fill(B.somaDias(L.hoje, 25));
  await page.screenshot({ path: `${SAIDA}/2r-entrada-390.png` });
  await ent.getByRole('button', { name: 'Anotar entrada' }).click();
  await page.waitForFunction(() => !document.querySelector('.g-folha'), null, { timeout: 15000 }).catch(() => {});
  T.ok('com a validade: anota (lote sem código, com a validade)', B.num(`select count(*) from produtos_lotes where produto_id='${bif}' and lote is null and validade='${B.somaDias(L.hoje, 25)}' and quantidade=10`) === 1);

  T.secao('Vencendo com ações (Camila)');
  await N.doAlto(page, 'Vencendo');
  const venc = page.locator('.g-folha', { hasText: 'Vencendo' }).last();
  await venc.locator('.g-val-lista li').first().waitFor({ timeout: 15000 });
  T.ok('cada lote tem "Ver produto" e, sem vencer, "Dar baixa"', (await venc.getByRole('button', { name: /Ver produto: Bifinho/ }).count()) >= 1 && (await venc.getByRole('button', { name: /Dar baixa: Bifinho de carne 65 g, Lote BIF0930/ }).count()) === 1);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SAIDA}/2r-vencendo-390.png` });
  await venc.getByRole('button', { name: /Dar baixa: Bifinho de carne 65 g, Lote BIF0930/ }).click();
  const saida = page.locator('.g-folha', { hasText: 'Saída de Bifinho' }).last();
  await saida.waitFor({ timeout: 10000 });
  const loteBif = B.sql(`select id from produtos_lotes where produto_id='${bif}' and lote='BIF0930'`);
  T.ok('"Dar baixa" abre a Saída do produto com o lote BIF0930 escolhido', (await saida.getByLabel('De qual lote').inputValue().catch(() => '')) === loteBif);
  await saida.getByRole('button', { name: 'Voltar' }).click();

  T.secao('Agenda: horário que já passou e nomes da equipe (Neide e Camila)');
  await N.ir(page, '/gestao/app/agenda');
  await page.getByRole('button', { name: 'Marcar horário' }).first().click();
  const form = page.locator('.g-folha').last();
  await form.locator('input[placeholder="Nome do pet ou do tutor"]').fill('Mel');
  await form.locator('button.g-linha', { hasText: 'Mel' }).first().click();
  await form.locator('button.g-chip', { hasText: /^Banho$/ }).first().click();
  T.ok('Quem atende: "Banhista Ana" e "Banhista Beto" (antes: os dois "Banhista")', (await form.locator('button.g-chip', { hasText: /^Banhista Ana$/ }).count()) === 1 && (await form.locator('button.g-chip', { hasText: /^Banhista Beto$/ }).count()) === 1);
  await form.locator('input[type=date]').first().fill(B.somaDias(L.hoje, -1));
  await form.locator('input[type=time]').first().fill('10:00');
  await form.locator('.g-btn.pri', { hasText: 'Marcar' }).click();
  const recem = page.locator('.g-agd-recem');
  await recem.waitFor({ timeout: 20000 });
  const tr = tx(await recem.innerText());
  T.ok('aviso: "Mel marcada" (Fêmea na ficha)', /Mel marcada/.test(tr), tr);
  T.ok('dia que já passou: sem "Mandar confirmação", com o motivo', !(await recem.getByText('Mandar confirmação no WhatsApp').count()) && /Este horário já passou/.test(tr), tr);
  await page.screenshot({ path: `${SAIDA}/2r-marcado-passado-390.png` });
  await recem.getByRole('button', { name: 'Abrir o horário' }).click();
  const det = page.locator('.g-folha').last();
  await det.locator('[data-teste="ja-passou"]').waitFor({ timeout: 10000 }).catch(() => {});
  T.ok('no horário: sem "Lembrete no WhatsApp" nem "Mandar confirmação"', (await det.locator('[data-teste="ja-passou"]').count()) === 1
    && !(await det.getByText('Lembrete no WhatsApp').count()) && !(await det.getByText('Mandar confirmação').count()));
  await page.keyboard.press('Escape').catch(() => {});

  T.secao('aniversário do pet sem o ano (Neide)');
  const hoje = new Date();
  await N.ir(page, `/gestao/app/clientes?pet=${L.pets.Mel}`);
  await page.getByRole('button', { name: 'Editar pet' }).click();
  const fp = page.locator('.g-folha').last();
  await fp.getByLabel('Dia do aniversário do pet').selectOption(String(hoje.getDate()));
  await fp.getByLabel('Mês do aniversário do pet').selectOption(String(hoje.getMonth() + 1));
  await page.screenshot({ path: `${SAIDA}/2r-niver-pet-390.png` });
  await fp.locator('.g-btn.pri', { hasText: 'Salvar' }).click();
  await page.waitForFunction(() => !document.querySelector('#form-pet'), null, { timeout: 15000 }).catch(() => {});
  const dd = String(hoje.getDate()).padStart(2, '0'), mm = String(hoje.getMonth() + 1).padStart(2, '0');
  T.ok('salva sem o ano (1904)', B.sql(`select nascimento::text from pets where id='${L.pets.Mel}'`) === `1904-${mm}-${dd}`);
  await N.ir(page, '/gestao/app/clientes');
  await N.doAlto(page, 'Aniversariantes do mês');
  const niv = page.locator('.g-folha', { hasText: 'Aniversariantes do mês' }).last();
  await niv.locator('.g-niver-linha').first().waitFor({ timeout: 15000 }).catch(() => {});
  const tn = tx(await niv.innerText());
  T.ok('Aniversariantes do mês lista a Mel (pet de Ana Souza), sem idade inventada', /Mel/.test(tn) && /pet de Ana Souza/.test(tn) && !/faz 1\d\d anos/.test(tn), tn.slice(0, 500));
  await page.screenshot({ path: `${SAIDA}/2r-aniversariantes-390.png` });
  await page.keyboard.press('Escape').catch(() => {});

  T.secao('Meu pet shop: promoção de aniversário e registro de dados (Neide e Juliana)');
  B.must(await dono.rpc('cliente_dados', { p_cliente: L.tutores.Ana }), 'baixar dados da Ana');
  await N.ir(page, '/gestao/app/meu-petshop#promocao-aniversario');
  const promo = page.locator('#promocao-aniversario');
  await promo.waitFor({ timeout: 20000 }).catch(() => {});
  T.ok('cartão próprio "Promoção de aniversário do pet", com "Criar a promoção de aniversário"', (await promo.count()) === 1
    && /Promoção de aniversário do pet/.test(tx(await promo.innerText())) && (await promo.getByRole('button', { name: 'Criar a promoção de aniversário' }).count()) === 1);
  await promo.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${SAIDA}/2r-promo-niver-390.png` });
  const grupoDados = page.locator('button.g-mp-grupo-b[aria-controls="grupo-copia-corpo"]');
  if ((await grupoDados.getAttribute('aria-expanded')) !== 'true') await grupoDados.click();
  const reg = page.locator('.gl-registro');
  await reg.waitFor({ timeout: 15000 });
  const treg = tx(await reg.innerText());
  T.ok('Registro: "Baixou os dados de um tutor: Ana Souza" com o protocolo LGPD-XXXX-XXXX', /Baixou os dados de um tutor: Ana Souza/.test(treg) && /Protocolo LGPD-[2-9A-Z]{4}-[2-9A-Z]{4}/.test(treg), treg);
  await reg.scrollIntoViewIfNeeded().catch(() => {});
  await page.screenshot({ path: `${SAIDA}/2r-registro-390.png` });
  T.ok('390: sem rolagem para o lado', (await N.rolagemLateral(page)) <= 0);
  T.ok('nenhum erro de página', erros.length === 0, erros);
  await ctx.close();

  // capturas no computador
  {
    const { ctx: c2, page: p2 } = await N.contexto(1366, 768);
    await N.entrar(p2, L.emails.dono, L.senha);
    await N.ir(p2, '/gestao/app/estoque');
    await N.doAlto(p2, 'Vencendo');
    await p2.locator('.g-folha .g-val-lista li').first().waitFor({ timeout: 15000 }).catch(() => {});
    await p2.waitForTimeout(800);
    await p2.screenshot({ path: `${SAIDA}/2r-vencendo-1366.png` });
    T.ok('1366: sem rolagem para o lado', (await N.rolagemLateral(p2)) <= 0);
    await c2.close();
  }
  await N.fecharNavegador();
}))();
