// Orçamento, troca/devolução e limite de fiado pela tela (migração 20261200), em 390 px (recepção) e 1366 px (dono):
// - 390: Caixa › Orçamentos › Orçamento novo: Ana, 2 shampoos (29,90) + Banho (60,00), desconto 9,80 = R$ 110,00; o botão
//   Mandar no WhatsApp leva o texto com o total e o link; a página pública (sem login) mostra "Para Ana", o total e "Quero
//   fechar" para o WhatsApp da loja. Transformar em venda: a venda abre com os 2 shampoos e o desconto repartido
//   (9,80 × 59,80 / 119,80 = 4,89; venda de 54,91); recebe no Pix; o horário abre com o Banho a 60,00 − 4,91 = 55,09.
//   Banco: uma venda de 54,91, estoque −2, orçamento convertido. Fiado acima do limite (Ana deve 180, limite 200,
//   mais 29,90): a recepção vê a frase e nada é anotado.
// - 1366: Caixa › a venda › Troca ou devolução: 1 shampoo volta em dinheiro = 54,91 / 2 = 27,46 (arredondado, a outra
//   metade fecha no fim); o banco tem uma saída "Devolução" de 27,46. Fiado acima do limite: o dono vê "Passa do limite de
//   fiado", toca em "Liberar mesmo assim" e a conta é anotada (fiado_liberacoes com o dono). A ficha mostra o limite.
// Sem rolagem lateral e sem erro na página. Capturas em testes/saida/orc-*.png.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const N = require('../lib/navegador');
const T = require('../lib/teste')('orcamento-troca-telas');
const D = lib('dinheiro');
const limpa = (s) => s.replace(/[  ]/g, ' ');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Orc telas' });
  const { dono, caixa: cx } = L.sb;
  const P = L.P;
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'caixa');
  const saldo = () => B.num(`select estoque from produtos where id='${L.prod}'`);
  const foto = (page, nome) => page.screenshot({ path: B.RAIZ + `/testes/saida/orc-${nome}.png`, fullPage: true }).catch(() => {});

  // ------------------------------------------------------------------------------------------------- 390, recepção
  T.secao('390 px: orçamento, página pública, transformar em venda');
  {
    const { ctx, page, erros } = await N.contexto(390, 844);
    await N.entrar(page, L.emails.caixa, L.senha);
    await N.ir(page, '/gestao/app/caixa');
    await N.doAlto(page, 'Orçamentos'); await page.waitForTimeout(1200);
    await page.locator('.g-folha').last().getByRole('button', { name: 'Orçamento novo' }).click(); await page.waitForTimeout(1000);
    let f = page.locator('.g-folha').last();
    await f.getByRole('button', { name: /Dizer quem comprou/ }).click(); await page.waitForTimeout(400);
    await f.getByLabel('Buscar tutor pelo nome').fill('Ana'); await page.waitForTimeout(1200);
    await f.locator('.g-vd-achados .g-linha', { hasText: 'Ana Souza' }).first().click(); await page.waitForTimeout(400);
    await f.getByLabel('Buscar produto').fill('Shampoo'); await page.waitForTimeout(800);
    await f.locator('.g-vd-achados .g-linha', { hasText: 'Shampoo Neutro' }).first().click(); await page.waitForTimeout(300);
    await f.getByRole('button', { name: 'Mais um: Shampoo Neutro' }).click(); await page.waitForTimeout(200);
    await f.getByLabel('Pôr um serviço no orçamento').selectOption({ label: 'Banho' }); await page.waitForTimeout(300);
    // sem pet escolhido, o Banho vem com o primeiro preço da lista (porte P, 50,00): o Thor é M, a recepção põe 60,00
    const vBanho = f.locator('.g-vd-item', { hasText: 'Banho' }).locator('input').first();
    T.ok('o Banho entra com o primeiro preço da lista (50,00), para conferir', /50,00/.test(await vBanho.inputValue()));
    await vBanho.fill('60,00'); await page.waitForTimeout(200);
    await f.getByLabel('Desconto do orçamento').fill('9,80'); await page.waitForTimeout(300);
    const tot = limpa(await f.locator('.g-vd-total').innerText());
    T.ok('a tela mostra o total de R$ 110,00 (Soma 119,80, desconto 9,80)', /R\$ 110,00/.test(tot) && /119,80/.test(tot), tot);
    await foto(page, 'novo-390');
    await f.getByRole('button', { name: /^Salvar orçamento/ }).click(); await page.waitForTimeout(2000);
    f = page.locator('.g-folha').last();
    const ver = limpa(await f.innerText());
    T.ok('a folha do orçamento nº 1 abre com Ana, Aberto e R$ 110,00', /Orçamento nº 1/.test(ver) && /Ana Souza/.test(ver) && /Aberto/.test(ver) && /R\$ 110,00/.test(ver), ver.slice(0, 300));
    const zap = await f.getByRole('link', { name: 'Mandar no WhatsApp' }).getAttribute('href');
    const texto = decodeURIComponent((zap ?? '').split('text=')[1] ?? '');
    T.ok('Mandar no WhatsApp: para o número da Ana, com "Oi, Ana!", o total e o link', (zap ?? '').startsWith('https://wa.me/5511988880001') && /Oi, Ana!/.test(texto) && /Total: R\$\s110,00/.test(texto) && /\/gestao\/orcamento\/[0-9a-f]{48}/.test(texto), texto);
    await foto(page, 'ver-390');
    T.ok('o banco guarda 110,00 e o estoque não mexe', B.num(`select total from orcamentos where petshop_id='${P}'`) === 110 && saldo() === 20);

    // página pública
    const token = B.sql(`select token from orcamentos where petshop_id='${P}'`);
    const pub = await ctx.newPage();
    await pub.goto(`${B.BASE_URL}/gestao/orcamento/${token}`); await pub.waitForTimeout(800);
    await pub.waitForSelector('.g-op-conta'); await pub.waitForTimeout(600);
    const tp = limpa(await pub.locator('body').innerText());
    T.ok('a página pública mostra Para Ana, os itens, o total e a validade', /Para Ana/.test(tp) && /Shampoo Neutro/.test(tp) && /Banho/.test(tp) && /R\$ 110,00/.test(tp) && /Vale até/.test(tp), tp.slice(0, 300));
    const qf = await pub.getByRole('link', { name: 'Quero fechar' }).getAttribute('href').catch(() => null);
    T.ok('"Quero fechar" abre o WhatsApp da loja com o número do orçamento', (qf ?? '').startsWith('https://wa.me/5511999990000') && /or%C3%A7amento%20n%C2%BA%201/.test(qf ?? ''), qf);
    T.ok('sem rolagem lateral na página pública', (await N.rolagemLateral(pub)) <= 0);
    await pub.screenshot({ path: B.RAIZ + '/testes/saida/orc-publico-390.png', fullPage: true }).catch(() => {});
    const nada = await pub.goto(`${B.BASE_URL}/gestao/orcamento/${'0'.repeat(48)}`);
    T.ok('código errado: página não encontrada', nada?.status() === 404);
    await pub.close();

    // transformar em venda
    await f.getByRole('button', { name: /Transformar em venda/ }).click(); await page.waitForTimeout(1500);
    f = page.locator('.g-folha').last();
    const vend = limpa(await f.innerText());
    T.ok('a venda abre com os 2 shampoos, a Ana e o desconto repartido (total R$ 54,91)', /Venda do orçamento nº 1/.test(vend) && /Ana Souza/.test(vend) && /R\$ 54,91/.test(vend), vend.slice(0, 400));
    await f.locator('button.g-chip', { hasText: 'Pix' }).first().click(); await page.waitForTimeout(300);
    await f.getByRole('button', { name: /^Receber R\$/ }).click(); await page.waitForTimeout(2500);
    f = page.locator('.g-folha').last();
    // a Ana tem dois pets: a tela pergunta qual
    await f.locator('.g-linha', { hasText: 'Thor' }).first().click().catch(() => {}); await page.waitForTimeout(1200);
    f = page.locator('.g-folha').last();
    const hor = limpa(await f.innerText().catch(() => ''));
    const obs = await f.locator('textarea').evaluateAll((l) => l.map((i) => i.value).join(' '));
    T.ok('depois da venda, o horário abre com o Banho e a observação do orçamento', /Banho/.test(hor) && /Orçamento nº 1/.test(obs), [hor.slice(0, 300), obs]);
    const valores = await f.locator('input').evaluateAll((l) => l.map((i) => i.value));
    T.ok('… com o Banho a 55,09 (60,00 menos a parte do desconto, 4,91)', valores.some((v) => /55,09/.test(v)) || /55,09/.test(hor), valores);
    await foto(page, 'horario-390');
    await page.keyboard.press('Escape'); await page.waitForTimeout(600);
    const sair = page.getByRole('button', { name: /Sair sem salvar|Sair/ });
    if (await sair.count()) await sair.first().click().catch(() => {});
    await page.waitForTimeout(800);
    T.ok('banco: uma venda de 54,91 no Pix, estoque −2, orçamento convertido', B.sql(`select count(*) || '|' || sum(valor) from lancamentos where petshop_id='${P}' and tipo='entrada' and categoria='Venda de produtos'`) === '1|54.91'
      && saldo() === 18 && B.sql(`select status from orcamentos where petshop_id='${P}'`) === 'convertido');

    // fiado acima do limite: a recepção não libera
    B.sql(`update clientes set limite_fiado = 200 where id='${L.tutores.Ana}'`);
    await D.lancarAReceber(cx, P, { valor: 180, vencimento: L.dia(10), categoria: 'Outros', descricao: 'Fiado antigo', clienteId: L.tutores.Ana, chave: D.novaChaveDeOperacao() });
    await N.ir(page, '/gestao/app/caixa');
    await page.getByRole('button', { name: 'Venda no balcão' }).first().click(); await page.waitForTimeout(1200);
    f = page.locator('.g-folha').last();
    await f.getByLabel('Buscar produto').fill('Shampoo'); await page.waitForTimeout(800);
    await f.locator('.g-vd-achados .g-linha', { hasText: 'Shampoo Neutro' }).first().click(); await page.waitForTimeout(300);
    await f.getByRole('button', { name: /Dizer quem comprou/ }).click(); await page.waitForTimeout(400);
    await f.getByLabel('Buscar tutor pelo nome').fill('Ana'); await page.waitForTimeout(1200);
    await f.locator('.g-vd-achados .g-linha', { hasText: 'Ana Souza' }).first().click(); await page.waitForTimeout(300);
    await f.getByText('Cliente paga depois').first().click(); await page.waitForTimeout(400);
    await f.getByRole('button', { name: /^Anotar R\$/ }).click(); await page.waitForTimeout(1500);
    const toast = limpa(await page.locator('.g-toast').last().innerText().catch(() => ''));
    T.ok('a recepção vê "Ana já deve R$ 180,00; com esta conta passa do limite de R$ 200,00." e quem libera', /Ana já deve R\$ 180,00; com esta conta passa do limite de R\$ 200,00\./.test(toast) && /dono ou quem cuida do financeiro/.test(toast), toast);
    T.ok('… e nada é anotado', B.num(`select count(*) from lancamentos where petshop_id='${P}' and cliente_id='${L.tutores.Ana}' and not pago`) === 1);
    await foto(page, 'limite-390');
    T.ok('sem rolagem lateral (390)', (await N.rolagemLateral(page)) <= 0);
    T.ok('nenhum erro na tela (390)', erros.filter((e) => !/HTTP 4\d\d POST .*rest\/v1\/rpc\/fiado/.test(e)).length === 0, erros.slice(0, 4));
    await ctx.close();
  }

  // ------------------------------------------------------------------------------------------------- 1366, dono
  T.secao('1366 px: devolução pelo Caixa, fiado liberado, ficha');
  {
    const { ctx, page, erros } = await N.contexto(1366, 900);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/caixa');
    await page.locator('.g-main .g-linha', { hasText: 'Shampoo' }).first().click(); await page.waitForTimeout(1500);
    await page.locator('.g-folha').last().getByRole('button', { name: 'Troca ou devolução' }).click(); await page.waitForTimeout(1800);
    let f = page.locator('.g-folha').last();
    await f.getByRole('button', { name: 'Mais um: Quantos Shampoo Neutro voltam' }).click(); await page.waitForTimeout(300);
    await f.locator('button.g-chip', { hasText: 'Dinheiro' }).first().click(); await page.waitForTimeout(300);
    const dv = limpa(await f.innerText());
    T.ok('a folha mostra que voltam R$ 27,46 (54,91 por 2)', /Devolver R\$ 27,46/.test(dv), dv.slice(0, 500));
    await foto(page, 'devolucao-1366');
    const e0 = saldo();
    await f.getByRole('button', { name: /^Devolver R\$ 27,46/ }).dblclick(); await page.waitForTimeout(2500);
    T.ok('dois toques: uma saída "Devolução" de 27,46 em dinheiro e o shampoo +1', B.sql(`select count(*) || '|' || sum(valor) || '|' || min(forma) from lancamentos where petshop_id='${P}' and categoria='Devolução'`) === '1|27.46|dinheiro' && saldo() === e0 + 1);

    // fiado: o dono libera
    await N.ir(page, '/gestao/app/estoque');
    await page.getByRole('button', { name: 'Vender' }).first().click(); await page.waitForTimeout(1200);
    f = page.locator('.g-folha').last();
    await f.getByLabel('Buscar produto').fill('Shampoo'); await page.waitForTimeout(800);
    await f.locator('.g-vd-achados .g-linha', { hasText: 'Shampoo Neutro' }).first().click(); await page.waitForTimeout(300);
    await f.getByRole('button', { name: /Dizer quem comprou/ }).click(); await page.waitForTimeout(400);
    await f.getByLabel('Buscar tutor pelo nome').fill('Ana'); await page.waitForTimeout(1200);
    await f.locator('.g-vd-achados .g-linha', { hasText: 'Ana Souza' }).first().click(); await page.waitForTimeout(300);
    await f.getByText('Cliente paga depois').first().click(); await page.waitForTimeout(400);
    await f.getByRole('button', { name: /^Anotar R\$/ }).click(); await page.waitForTimeout(1200);
    const p = page.locator('.g-folha').last();
    const tp = limpa(await p.innerText());
    T.ok('o dono vê "Passa do limite de fiado" com a frase', /Passa do limite de fiado/.test(tp) && /Ana já deve R\$ 180,00; com esta conta passa do limite de R\$ 200,00\./.test(tp), tp.slice(0, 300));
    await foto(page, 'liberar-1366');
    await p.getByRole('button', { name: 'Liberar mesmo assim' }).click(); await page.waitForTimeout(2500);
    T.ok('liberado: a conta de 29,90 é anotada e o banco guarda quem liberou (o dono)', B.num(`select count(*) from lancamentos where petshop_id='${P}' and cliente_id='${L.tutores.Ana}' and not pago`) === 2
      && B.sql(`select (liberado_por = (select user_id from profissionais where id='${L.ids.dono}'))::text || '|' || (lancamento_id is not null)::text from fiado_liberacoes where petshop_id='${P}'`) === 'true|true');

    // ficha: limite, quanto cabe, orçamentos
    await N.ir(page, `/gestao/app/clientes?cliente=${L.tutores.Ana}`);
    await page.waitForTimeout(1500);
    const ficha = limpa(await page.locator('.g-main').innerText());
    T.ok('a ficha mostra o limite (R$ 200,00, passou R$ 9,90) e os orçamentos', /Limite R\$ 200,00 · passou R\$ 9,90 do limite/.test(ficha) && /Fazer orçamento/.test(ficha), ficha.slice(0, 200));
    await foto(page, 'ficha-1366');
    T.ok('sem rolagem lateral (1366)', (await N.rolagemLateral(page)) <= 0);
    T.ok('nenhum erro na tela (1366)', erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
