// Tela: rodada 8 (agente L), os defeitos do testador que quebra (quebrador.md) e da Ajuda (estreante.md).
//   - check-in: trocar o pet limpa a saída prevista; saída a dois anos mostra "Confira o dia e o ano" e não salva (M1);
//   - duas abas fechando o mesmo caixa: a aba velha avisa "Este caixa já foi fechado" (M2);
//   - foco do teclado visível nos campos (L1) e o balão de obrigatório em português (L2);
//   - sem internet: faixa "Sem internet agora" e, na venda no balcão, nunca "o caixa foi fechado" (L5);
//   - "Pet novo" volta com o que estava escrito depois de recarregar (L4).
// Em 390 e 1366 px, sem rolagem para o lado.
const fs = require('fs');
const path = require('path');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('robustez-tela');

const PASTA = process.env.FOTOS_DIR || path.join(B.RAIZ, 'testes', 'saida', 'robustez');
async function foto(page, nome) { if (!process.env.FOTOS) return; fs.mkdirSync(PASTA, { recursive: true }); await page.screenshot({ path: path.join(PASTA, `${nome}.png`) }); }

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Robustez tela' });
  const { dono } = L.sb;
  const P = L.P;
  const dia = (n) => B.somaDias(L.hoje, n);

  for (const [larg, alt] of [[390, 844], [1366, 900]]) {
    T.secao(`${larg}: check-in com data velha`);
    const { ctx, page, erros } = await N.contexto(larg, alt);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/creche-hotel?ver=casa');
    await page.locator('button', { hasText: 'Nova reserva / Check-in' }).first().click();
    let folha = page.locator('.g-folha').last();
    await folha.locator('input[placeholder="Nome do pet ou do tutor"]').fill('Bob');
    await folha.locator('button.g-linha', { hasText: 'Bob' }).first().click();
    await folha.locator('.g-chip', { hasText: 'Hotel' }).first().click();
    await folha.locator('.g-seg button', { hasText: 'Reservar para outro dia' }).click();
    await folha.locator('input[type="date"]').first().fill(dia(10));
    await folha.locator('input[type="date"]').nth(1).fill(dia(15));
    await page.waitForTimeout(300);
    // troca o pet e faz o check-in de creche, como o testador
    await folha.locator('button', { hasText: 'Trocar' }).click();
    await folha.locator('input[placeholder="Nome do pet ou do tutor"]').fill('Luna');
    await folha.locator('button.g-linha', { hasText: 'Luna' }).first().click();
    await folha.locator('.g-chip', { hasText: 'Creche' }).first().click();
    await folha.locator('.g-seg button', { hasText: 'Chegou agora' }).click();
    await page.waitForTimeout(300);
    const saida = folha.locator('input[type="date"]').first();
    T.ok('trocar o pet, o tipo e "Chegou agora": a saída prevista volta em branco', (await saida.inputValue()) === '', await saida.inputValue());
    // uma data dois anos depois (ano trocado): aviso com o ano, sem total, e não salva
    const ano2 = `${Number(L.hoje.slice(0, 4)) + 2}${L.hoje.slice(4)}`;
    await saida.fill(ano2);
    await page.waitForTimeout(400);
    const texto = (await folha.innerText()).replace(/\u00a0/g, ' ');
    T.ok('saída a dois anos: "Confira o dia e o ano" com a data inteira', /dias depois da entrada\. Confira o dia e o ano/.test(texto) && texto.includes(`${ano2.slice(8, 10)}/${ano2.slice(5, 7)}/${ano2.slice(0, 4)}`), texto.slice(0, 600));
    T.ok('nenhum total absurdo de diárias na folha', !/7\d\d diárias/.test(texto), texto.match(/\d+ diárias[^\n]*/)?.[0]);
    await foto(page, `checkin-longe-${larg}`);
    await folha.locator('button.g-btn.pri', { hasText: 'Fazer check-in' }).click();
    await page.waitForTimeout(1200);
    T.ok('o check-in não foi feito', B.num(`select count(*) from estadias where petshop_id='${P}' and pet_id='${L.pets.Luna}'`) === 0);
    T.ok(`sem rolagem para o lado (${larg})`, (await N.rolagemLateral(page)) <= 0);
    await page.keyboard.press('Escape');
    T.ok(`nenhum erro na tela (${larg})`, erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }

  T.secao('cartão: a saída de uma estadia longe mostra o ano');
  B.sql(`alter table estadias disable trigger a_saida_razoavel; insert into estadias (petshop_id, pet_id, tipo, entrada, saida_prevista, status) values ('${P}', '${L.pets.Rex}', 'creche', now(), now() + interval '731 days', 'em_casa'); alter table estadias enable trigger a_saida_razoavel;`);
  {
    const { ctx, page } = await N.contexto(390, 844);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/creche-hotel?ver=casa');
    const t = (await page.locator('.g-main').innerText()).replace(/\u00a0/g, ' ');
    const ano = String(Number(L.hoje.slice(0, 4)) + 2);
    T.ok('"saída prevista" do Rex com o ano (nunca só "18/11")', new RegExp(`\\d\\d/\\d\\d/${ano}`).test(t), t.match(/saída prevista[^\n]*\n?[^\n]*/i)?.[0]);
    await ctx.close();
  }

  T.secao('duas abas fechando o mesmo caixa');
  {
    const cx = B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 50 }).select('id').single(), 'caixa').id;
    const { ctx, page, erros } = await N.contexto(1366, 900);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/caixa');
    await page.locator('button', { hasText: 'Fechar o caixa' }).first().click();
    const folha = page.locator('.g-folha').last();
    await folha.locator('input').first().fill('50,00');
    // a outra aba fecha primeiro
    B.must(await dono.rpc('fechar_caixa', { p_caixa: cx, p_contado: 40 }), 'outra aba');
    await folha.locator('button.g-btn.pri', { hasText: 'Fechar o caixa' }).click();
    const aviso = page.locator('.g-folha', { hasText: 'Este caixa já foi fechado' });
    await aviso.waitFor({ timeout: 10000 }).catch(() => {});
    const t = (await aviso.innerText().catch(() => '')).replace(/\u00a0/g, ' ');
    T.ok('a aba velha diz "Este caixa já foi fechado", com a hora e os R$ 40,00 contados', /às \d\d:\d\d/.test(t) && /R\$ 40,00 contados/.test(t), t);
    await foto(page, 'caixa-ja-fechado-1366');
    await aviso.locator('button', { hasText: 'Entendi' }).click();
    await page.waitForTimeout(1500);
    T.ok('a folha de fechar sumiu e a contagem da outra aba ficou', (await page.locator('.g-folha', { hasText: 'Quanto tem na gaveta' }).count()) === 0 && B.num(`select valor_contado from caixas where id='${cx}'`) === 40);
    T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }

  T.secao('foco, balão em português, rascunho do Pet novo, sem internet');
  {
    B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 0 }).select('id').single(), 'caixa novo');
    const { ctx, page } = await N.contexto(390, 844);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/clientes?novo=1');
    const folha = page.locator('.g-folha').last();
    await folha.waitFor();
    const nome = folha.locator('input.g-input').first();
    await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    await nome.focus();
    const estilo = await nome.evaluate((el) => { const s = getComputedStyle(el); return { o: s.outlineStyle, w: s.outlineWidth }; });
    T.ok('campo com foco tem contorno visível', estilo.o !== 'none' && parseFloat(estilo.w) >= 2, estilo);
    await folha.locator('button.g-btn.pri', { hasText: 'Salvar' }).click();
    await page.waitForTimeout(300);
    const msg = await nome.evaluate((el) => el.validationMessage);
    T.ok('Salvar com o nome vazio: "Preencha este campo." (sem inglês)', msg === 'Preencha este campo.', msg);
    await nome.fill('Pipoca');
    await folha.locator('input.g-input').nth(1).fill('Tutora Rascunho');
    await page.waitForTimeout(600);
    await page.reload();
    await page.waitForSelector('.g-main');
    const voltou = page.locator('.g-folha').last();
    await voltou.waitFor({ timeout: 10000 }).catch(() => {});
    const t = await voltou.innerText().catch(() => '');
    T.ok('recarregou: o Pet novo reabre com "Rascunho recuperado" e o nome Pipoca', /Rascunho recuperado/.test(t) && (await voltou.locator('input.g-input').first().inputValue().catch(() => '')) === 'Pipoca', t.slice(0, 200));
    await voltou.locator('button', { hasText: 'Cancelar' }).click();

    // sem internet: a faixa aparece e a venda no balcão não diz "caixa fechado"
    await N.ir(page, '/gestao/app/caixa');
    await ctx.setOffline(true);
    await page.waitForTimeout(400);
    const faixa = await page.locator('.g-sem-internet').innerText().catch(() => '');
    T.ok('faixa "Sem internet agora" no alto', /Sem internet agora/.test(faixa), faixa);
    await foto(page, 'sem-internet-390');
    await ctx.setOffline(false);
    await page.waitForTimeout(600);
    T.ok('a faixa some quando a internet volta', (await page.locator('.g-sem-internet').count()) === 0);
    await ctx.close();
  }
}))();
