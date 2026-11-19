// Operação do dia a dia pela tela, em 390 e 1366 (sem erro na página e sem rolagem para o lado):
//  - Mozart vende produto (roteiro de teste, GESTAO_MOZART_FALSO=1): "vendi 2 mordedores" vira um cartão "Vender produto" e, com o
//    "Pode fazer", um lançamento só em Venda de produtos ligado à saída do estoque (motivo Venda): o Estoque mostra a venda.
//    "vendi 10 pacotes de ração": a ração não está no Estoque e o mesmo cartão cadastra e vende.
//  - Caixa, Entrada em Venda de produtos escrita à mão: o aviso diz que o estoque não muda ("Mordedor de plástico está no Estoque"
//    para "Venda de 2 mordedores"; "Este item não está no Estoque" para outro item), sem travar o Lançar, e "Escolher o produto do
//    Estoque" abre a Venda no balcão.
//  - Creche e hotel: a reserva de hoje que passou da hora sem check-in aparece "atrasada · não chegou", primeiro na lista, com o
//    Check-in; o número Reservas diz "1 atrasada · não chegou" (não mais "próxima: hoje, 9h38").
//  - Primeiros passos: com 1 de N serviços com preço, "Colocar os preços dos serviços" não fica feito e diz "1 de N com preço".
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('operacao-estoque');

const txt = async (loc) => (await loc.innerText()).replace(/[  ]/g, ' ');
const LARGURAS = [[390, 844], [1366, 900]];

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Operação estoque', equipe: false });
  const P = L.P;
  const { dono } = L.sb;
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'abrir o caixa');
  const mordedor = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Mordedor de plástico', unidade: 'un', preco_venda: 100 }).select('id').single(), 'mordedor').id;
  B.must(await dono.from('movimentos_estoque').insert({ petshop_id: P, produto_id: mordedor, tipo: 'entrada', quantidade: 50, motivo: 'Compra' }).select('id'), 'entrada do mordedor');
  const vendas = () => B.num(`select count(distinct lancamento_id) from movimentos_estoque where petshop_id='${P}' and motivo='Venda' and lancamento_id is not null`);

  for (const [largura, altura] of LARGURAS) {
    const celular = largura < 500;
    const { ctx, page, erros } = await N.contexto(largura, altura);
    await N.entrar(page, L.emails.dono, L.senha);

    T.secao(`${largura}: Mozart vende o mordedor pelo caminho do Caixa`);
    const antes = { vendas: vendas(), saldo: B.num(`select estoque from produtos where id='${mordedor}'`) };
    await N.ir(page, '/gestao/app');
    await page.locator(celular ? '.g-aba-mic' : '.g-fab').first().click();
    const painel = page.locator('.g-ass-painel[aria-label="Conversa com o Mozart"]');
    await painel.waitFor({ timeout: 10000 });
    await painel.locator('textarea').fill('vendi 2 mordedores no pix');
    await painel.locator('textarea').press('Enter');
    const pode = painel.locator('.g-proposta button', { hasText: 'Pode fazer' }).last();
    await pode.waitFor({ timeout: 20000 });
    const cartao = await txt(painel.locator('.g-proposta').last());
    T.ok('cartão "Vender produto" com o valor, o total e o estoque', /Vender produto/.test(cartao) && /R\$ 200,00/.test(cartao) && new RegExp(`${antes.saldo} → ${antes.saldo - 2} un`).test(cartao), cartao);
    T.ok('sem rolagem para o lado com o cartão', (await N.rolagemLateral(page)) <= 1);
    await pode.click();
    await page.waitForFunction(() => document.querySelectorAll('.g-ass-painel .g-proposta.feita').length >= 1, null, { timeout: 20000 });
    await page.waitForFunction(() => !document.querySelector('.g-ass-painel .g-bolha.pensa'), null, { timeout: 15000 });
    T.ok('um lançamento a mais em Venda de produtos, ligado à saída de 2: o saldo baixou', vendas() === antes.vendas + 1 && B.num(`select estoque from produtos where id='${mordedor}'`) === antes.saldo - 2,
      { vendas: vendas(), saldo: B.num(`select estoque from produtos where id='${mordedor}'`) });
    await page.keyboard.press('Escape').catch(() => {});

    T.secao(`${largura}: o Estoque conta a venda`);
    await N.ir(page, '/gestao/app/estoque');
    await page.waitForFunction(() => /Saídas em 30 dias/.test(document.body.textContent), null, { timeout: 15000 });
    const corpo = (await page.locator('.g-main').innerText()).replace(/[  ]/g, ' ');
    const n = vendas();
    T.ok(`"Saídas em 30 dias" diz ${n} ${n === 1 ? 'venda' : 'vendas'}`, new RegExp(`${n} ${n === 1 ? 'venda' : 'vendas'}`).test(corpo) && !/nenhuma venda/.test(corpo), corpo.slice(0, 600));

    T.secao(`${largura}: Caixa, Entrada escrita à mão em Venda de produtos`);
    await N.ir(page, '/gestao/app/caixa');
    await page.locator('button', { hasText: /^Entrada$/ }).first().click();
    const folha = page.locator('.g-folha').last();
    await folha.waitFor({ timeout: 10000 });
    await folha.getByRole('group', { name: 'Categoria' }).locator('button', { hasText: 'Venda de produtos' }).click();
    const aviso = folha.locator('[data-teste="venda-solta"]');
    await aviso.waitFor({ timeout: 5000 });
    T.ok('sem descrição: "Este item não está no Estoque"', /Este item não está no Estoque\./.test(await txt(aviso)), await txt(aviso));
    await folha.locator('input[placeholder="Ex.: banho da Mel"]').fill('Venda de 2 mordedores');
    await page.waitForFunction(() => /Mordedor de plástico está no Estoque/.test(document.querySelector('[data-teste="venda-solta"]')?.textContent || ''), null, { timeout: 5000 });
    T.ok('"Venda de 2 mordedores": "Mordedor de plástico está no Estoque" e o saldo não baixa', /saldo não baixa/.test(await txt(aviso)), await txt(aviso));
    T.ok('o Lançar continua livre (não trava a venda)', await folha.locator('button', { hasText: /^Lançar$/ }).isEnabled());
    T.ok('aviso sem rolagem para o lado', (await N.rolagemLateral(page)) <= 1);
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/operacao-estoque-caixa-${largura}.png` }).catch(() => {});
    await aviso.locator('button', { hasText: 'Escolher o produto do Estoque' }).click();
    await page.locator('.g-folha', { hasText: 'Venda no balcão' }).last().waitFor({ timeout: 10000 });
    T.ok('"Escolher o produto do Estoque" abre a Venda no balcão', true);
    await page.keyboard.press('Escape').catch(() => {});

    T.ok('sem erro na página', !erros.length, erros);
    await ctx.close();
  }

  T.secao('Mozart: ração fora do Estoque, cadastro e venda num cartão');
  {
    const { ctx, page, erros } = await N.contexto(1366, 900);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app');
    await page.locator('.g-fab').first().click();
    const painel = page.locator('.g-ass-painel[aria-label="Conversa com o Mozart"]');
    await painel.waitFor({ timeout: 10000 });
    await painel.locator('textarea').fill('vendi 10 pacotes de ração a 100 em dinheiro');
    await painel.locator('textarea').press('Enter');
    const pode = painel.locator('.g-proposta button', { hasText: 'Pode fazer' }).last();
    await pode.waitFor({ timeout: 20000 });
    const cartao = await txt(painel.locator('.g-proposta').last());
    T.ok('o cartão diz que a ração é nova e fica cadastrada', /novo no Estoque/.test(cartao) && /Cadastra no Estoque/.test(cartao) && /R\$ 1\.000,00/.test(cartao), cartao);
    await pode.click();
    await page.waitForFunction(() => document.querySelectorAll('.g-ass-painel .g-proposta.feita').length >= 1, null, { timeout: 20000 });
    await page.waitForFunction(() => !document.querySelector('.g-ass-painel .g-bolha.pensa'), null, { timeout: 15000 });
    const racao = B.sql(`select p.unidade||'/'||p.estoque::int||'/'||l.valor from produtos p join movimentos_estoque m on m.produto_id=p.id and m.motivo='Venda' join lancamentos l on l.id=m.lancamento_id where p.petshop_id='${P}' and p.nome='Ração'`);
    T.ok('ração cadastrada (pacote, saldo -10) e venda de R$ 1.000 ligada à saída', racao === 'pacote/-10/1000.00', { racao, conversa: await txt(painel.locator('.g-ass-conversa')) });
    T.ok('sem erro na página', !erros.length, erros);
    await ctx.close();
  }

  T.secao('Creche e hotel: reserva que passou da hora');
  const agora = Date.now();
  const atrasada = new Date(agora - 40 * 60000);
  const mesmoDia = (d) => B.hojeNo(L.fuso) === new Intl.DateTimeFormat('en-CA', { timeZone: L.fuso }).format(d);
  B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Bob, tipo: 'creche', status: 'reservada', entrada: atrasada.toISOString(), valor_diaria: 70 }).select('id'), 'reserva atrasada');
  const depois = new Date(agora + 26 * 3600000);
  B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Mel, tipo: 'hotel', status: 'reservada', entrada: depois.toISOString(), valor_diaria: 120 }).select('id'), 'reserva de amanhã');
  for (const [largura, altura] of LARGURAS) {
    const { ctx, page, erros } = await N.contexto(largura, altura);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/creche-hotel?ver=casa');
    const kpi = page.locator('.g-kpi', { hasText: 'Reservas' }).first();
    await kpi.waitFor({ timeout: 15000 });
    if (mesmoDia(atrasada)) {
      T.ok(`${largura}: o número Reservas diz "1 atrasada · não chegou" (não "próxima: hoje")`, /1 atrasada · não chegou/.test(await txt(kpi)) && !/próxima: hoje/.test(await txt(kpi)), await txt(kpi));
      await page.locator('.g-seg button', { hasText: /^Reservas/ }).first().click();
      const primeiro = page.locator('.g-ch-cartao.reserva').first();
      await primeiro.waitFor({ timeout: 10000 });
      const t1 = await txt(primeiro);
      T.ok(`${largura}: a reserva atrasada vem primeiro, "atrasada · não chegou", com o Check-in`, /Bob/.test(t1) && /atrasada · não chegou/.test(t1) && (await primeiro.locator('button', { hasText: 'Check-in' }).count()) === 1, t1);
      T.ok(`${largura}: a de amanhã continua "chega amanhã"`, /chega amanhã/.test(await txt(page.locator('.g-ch-cartao.reserva', { hasText: 'Mel' }).first())));
    } else T.ok(`${largura}: (meia-noite: a reserva de 40 minutos atrás é de ontem; só confere que a tela abriu)`, true);
    T.ok(`${largura}: sem rolagem para o lado`, (await N.rolagemLateral(page)) <= 1);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/operacao-estoque-creche-${largura}.png`, fullPage: true }).catch(() => {});
    T.ok(`${largura}: sem erro na página`, !erros.length, erros);
    await ctx.close();
  }

  T.secao('Primeiros passos: preço só pronto com todos os serviços');
  const L2 = await criarLoja(T, { nome: 'Passos precos', modulos: ['banho_tosa'], equipe: false, dados: false });
  B.sql(`update servicos set preco_p = null, preco_m = null, preco_g = null, preco_gg = null where petshop_id='${L2.P}' and nome <> 'Banho'`);
  const total = B.num(`select count(*) from servicos where petshop_id='${L2.P}' and ativo and categoria not in ('creche','hotel')`);
  for (const [largura, altura] of LARGURAS) {
    const { ctx, page, erros } = await N.contexto(largura, altura);
    await N.entrar(page, L2.emails.dono, L2.senha);
    await N.ir(page, '/gestao/app');
    await page.waitForSelector('.g-pps', { timeout: 20000 });
    const passo = page.locator('.g-pps-passo', { hasText: 'Colocar os preços dos serviços' }).first();
    const t = await txt(passo);
    T.ok(`${largura}: com 1 de ${total} com preço, o passo não está feito e diz "1 de ${total} com preço"`, !(await passo.getAttribute('class')).includes('feito') && t.includes(`1 de ${total} com preço`), t);
    T.ok(`${largura}: sem rolagem para o lado`, (await N.rolagemLateral(page)) <= 1);
    T.ok(`${largura}: sem erro na página`, !erros.length, erros);
    await ctx.close();
  }
  B.sql(`update servicos set preco_m = 40 where petshop_id='${L2.P}'`);
  {
    const { ctx, page } = await N.contexto(1366, 900);
    await N.entrar(page, L2.emails.dono, L2.senha);
    await N.ir(page, '/gestao/app');
    await page.waitForSelector('.g-pps', { timeout: 20000 });
    const passo = page.locator('.g-pps-passo', { hasText: 'Colocar os preços dos serviços' }).first();
    T.ok('todos com preço: o passo fica feito', (await passo.getAttribute('class')).includes('feito'), await passo.getAttribute('class'));
    await ctx.close();
  }
}))();
