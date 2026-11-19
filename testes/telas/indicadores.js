// Taxas da maquininha e Indicadores pela tela (migração 20261204), em 390 e 1366 (dono):
// - Relatórios › Indicadores: os números do período (faturamento, atendimentos, voltaram em 60 dias), os gráficos por mês, o
//   mapa de dias e horários e "Quanto sobrou por mês"; um período sem movimento diz "Ainda não tem dados neste período";
// - Venda no balcão: Débito mostra "Taxa da maquininha R$ 0,60 · Você recebe R$ 29,30"; Crédito pergunta em quantas vezes e a
//   venda em 3x guarda a taxa do parcelado (conferida no banco);
// - Financeiro e Relatórios: o cartão "Taxas da maquininha" e, em Quanto sobrou, a linha das taxas depois do resultado;
// - Meu pet shop: o dono muda a taxa do débito e o débito de antes continua com a taxa do dia.
// Sem rolagem lateral e sem erro na página. Capturas em testes/saida/indicadores-*.png.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const N = require('../lib/navegador');
const T = require('../lib/teste')('indicadores-telas');
const D = lib('dinheiro'), MQ = lib('maquininha');
const reais = (n) => `R$ ${Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const limpo = (s) => String(s ?? '').replace(/[  ]/g, ' ');
const foto = (page, nome) => page.screenshot({ path: `${B.RAIZ}/testes/saida/indicadores-${nome}.png`, fullPage: true }).catch(() => {});

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Indicadores telas' });
  const { dono, caixa: cx } = L.sb;
  const P = L.P;
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'caixa');
  await MQ.salvarTaxas(dono, P, { ...MQ.TAXAS_ZERADAS, debito_pct: 2, debito_dias: 1, credito_pct: 4, credito_fixo: 0.5, credito_dias: 30, parcelado_pct: 6, parcelado_dias: 30, parcelas_pct: { 3: 7.5 } });
  // histórico: Thor concluído há 20 dias e hoje (voltou), Rex hoje (primeira vez), Bob faltou; um pagamento no mês passado
  const marca = (pet, dia, h, status) => {
    const ini = B.instante(dia, h, L.fuso);
    B.sql(`insert into agendamentos (petshop_id, pet_id, servico_id, inicio, fim, status, preco) values ('${P}', '${L.pets[pet]}', '${L.S.Banho}', '${ini.toISOString()}', '${new Date(+ini + 45 * 6e4).toISOString()}', '${status}', 60)`);
  };
  marca('Thor', L.dia(-20), '09:00', 'concluido');
  marca('Thor', L.hoje, '09:00', 'concluido');
  marca('Rex', L.hoje, '10:00', 'concluido');
  marca('Bob', L.hoje, '11:00', 'faltou');
  B.sql(`insert into lancamentos (petshop_id, tipo, valor, forma, categoria, data, pago, origem) values ('${P}', 'entrada', 250, 'pix', 'Banho e tosa', '${B.somaDias(L.mesAnterior, 9)}', true, 'tela')`);
  const deb = await D.lancarPago(cx, P, { tipo: 'entrada', valor: 100, forma: 'debito', categoria: 'Banho e tosa', chave: D.novaChaveDeOperacao() });
  await D.lancarPago(dono, P, { tipo: 'saida', valor: 30, forma: 'pix', categoria: 'Aluguel', chave: D.novaChaveDeOperacao() });
  const taxa = (id) => B.sql(`select coalesce((select taxa::text from lancamentos_taxas where lancamento_id='${id}'), 'sem')`);
  T.ok('o débito de R$ 100,00 guardou R$ 2,00 de taxa', taxa(deb.id) === '2.00');

  for (const [larg, alt] of [[390, 844], [1366, 900]]) {
    T.secao(`${larg} px`);
    const { ctx, page, erros } = await N.contexto(larg, alt);
    await N.entrar(page, L.emails.dono, L.senha);

    // Indicadores
    await N.ir(page, '/gestao/app/relatorios');
    await page.getByRole('link', { name: 'Indicadores' }).first().click();
    await page.waitForURL('**/relatorios/indicadores', { timeout: 20000 });
    const fat = page.locator('section[aria-label="Faturamento por mês"]');
    await fat.waitFor({ timeout: 20000 });
    // a tela abre em "Este mês" (o primeiro botão; Bia, rodada 2); os números abaixo são dos últimos 6 meses
    const chipMes = page.locator('button.g-chip', { hasText: 'Este mês' }).first();
    T.ok('a tela abre em Este mês (o primeiro botão)', (await chipMes.getAttribute('aria-pressed')) === 'true');
    await page.locator('button.g-chip', { hasText: 'Últimos 6 meses' }).first().click();
    await page.waitForTimeout(1500);
    await fat.waitFor({ timeout: 20000 });
    const t = limpo(await page.locator('.g-main').innerText());
    T.ok('a aba Indicadores vem primeiro e abre os gráficos (últimos 6 meses)', /Indicadores[\s\S]{0,40}Relatório do período/.test(t) && /Últimos 6 meses/.test(t), t.slice(0, 300));
    // 250 do mês passado + 100 de hoje (+ a venda de R$ 29,90 da volta de 390)
    const esperado = B.num(`select sum(valor) from lancamentos where petshop_id='${P}' and tipo='entrada' and pago`);
    T.ok(`Faturamento do período: ${reais(esperado)}`, new RegExp(`Faturamento\\s*R\\$\\s?${reais(esperado).replace('R$ ', '').replace('.', '\\.')}`, 'i').test(t), t.slice(0, 600));
    T.ok('Atendimentos: 3 e voltaram em 60 dias: 50% (1 de 2)', /Atendimentos\s*3/i.test(t) && /Voltaram em 60 dias\s*50%/i.test(t) && /1 de 2 clientes atendidos/.test(t), t.slice(0, 900));
    T.ok('faltas 25% (1 de 4 que deviam vir)', /Faltas\s*25%/i.test(t) && /1 falta de 4 que deviam vir/.test(t));
    T.ok('mapa de dias e horários e Quanto sobrou por mês aparecem', (await page.locator('.g-ind-mapa td.forte').count()) >= 1 && /Quanto sobrou por mês/.test(t) && /Serviços mais feitos[\s\S]{0,80}Banho/.test(t));
    // 390: 100 − 30 − 2 = 68,00; 1366: + 29,90 − 2,74 = 95,16
    const depois = larg === 390 ? '68,00' : '95,16';
    T.ok(`Quanto sobrou por mês: depois das taxas R$ ${depois} neste mês`, new RegExp(`depois das taxas: R\\$\\s?${depois}`).test(t), t.slice(t.indexOf('Quanto sobrou por mês'), t.indexOf('Quanto sobrou por mês') + 300));
    await fat.getByText('Ver os números').click(); await page.waitForTimeout(200);
    T.ok('Ver os números abre a tabela do faturamento por mês', /R\$\s?250,00/.test(limpo(await fat.innerText())));
    T.ok(`sem rolagem lateral em Indicadores (${larg})`, (await N.rolagemLateral(page)) <= 0);
    await foto(page, `${larg}`);
    await page.getByRole('button', { name: 'Mês passado' }).click(); await page.waitForTimeout(1500);
    const tm = limpo(await page.locator('.g-main').innerText());
    T.ok('Mês passado: R$ 250,00 e comparação só com número de verdade', /Faturamento\s*R\$\s?250,00/i.test(tm) && /sem movimento no período anterior/.test(tm), tm.slice(0, 500));

    // Venda no balcão: a taxa no pagamento
    await N.ir(page, '/gestao/app/caixa');
    await page.getByRole('button', { name: 'Venda no balcão' }).first().click(); await page.waitForTimeout(1000);
    const f = page.locator('.g-folha').last();
    await f.getByLabel('Buscar produto').fill('Shampoo'); await page.waitForTimeout(800);
    await f.locator('.g-vd-achados .g-linha', { hasText: 'Shampoo Neutro' }).first().click(); await page.waitForTimeout(300);
    await f.getByRole('button', { name: 'Débito', exact: true }).click(); await page.waitForTimeout(300);
    const rd = limpo(await f.locator('.g-tx-recebe').innerText().catch(() => ''));
    T.ok('Débito de R$ 29,90: "Taxa da maquininha R$ 0,60 · Você recebe R$ 29,30"', /Taxa da maquininha: R\$\s?0,60/.test(rd) && /Você recebe R\$\s?29,30/.test(rd), rd);
    await f.getByRole('button', { name: 'Crédito', exact: true }).click(); await page.waitForTimeout(300);
    await f.getByLabel('Crédito em quantas vezes').selectOption('3'); await page.waitForTimeout(300);
    const rc = limpo(await f.locator('.g-tx-recebe').innerText().catch(() => ''));
    // 29,90 × 7,5% = 2,2425 + 0,50 = 2,74; recebe 27,16
    T.ok('Crédito em 3 vezes: taxa R$ 2,74, você recebe R$ 27,16', /R\$\s?2,74/.test(rc) && /R\$\s?27,16/.test(rc), rc);
    T.ok(`sem rolagem lateral na venda (${larg})`, (await N.rolagemLateral(page)) <= 0);
    await f.screenshot({ path: `${B.RAIZ}/testes/saida/indicadores-venda-${larg}.png` }).catch(() => {});
    await page.locator('.g-folha').last().getByRole('button', { name: /^Receber/ }).click(); await page.waitForTimeout(2500);
    const venda = B.sql(`select l.id || '|' || coalesce(t.taxa::text, 'sem') || '|' || coalesce(t.parcelas::text, '-') from lancamentos l left join lancamentos_taxas t on t.lancamento_id = l.id
      where l.petshop_id='${P}' and l.categoria='Venda de produtos' and l.forma='credito' order by l.criado_em desc limit 1`).split('|');
    T.ok('a venda em 3 vezes ficou com R$ 2,74 de taxa e 3 parcelas no banco', venda[1] === '2.74' && venda[2] === '3', venda);

    // Financeiro e Relatórios: o cartão das taxas
    await N.ir(page, '/gestao/app/financeiro');
    const cf = page.locator('section[aria-label="Taxas da maquininha"]');
    await cf.waitFor({ timeout: 20000 });
    const tf = limpo(await cf.innerText());
    T.ok('Financeiro: taxas da maquininha no mês e faturamento líquido', /Taxas da maquininha no mês/.test(tf) && /Faturamento líquido \(depois das taxas\)/.test(tf) && /A receber da maquininha/i.test(tf), tf);
    T.ok(`sem rolagem lateral no Financeiro (${larg})`, (await N.rolagemLateral(page)) <= 0);
    await cf.screenshot({ path: `${B.RAIZ}/testes/saida/indicadores-financeiro-${larg}.png` }).catch(() => {});
    await N.ir(page, '/gestao/app/relatorios');
    const qs = page.locator('section[aria-label="Quanto sobrou"]');
    await qs.getByText('Como fecha com o Financeiro').waitFor({ timeout: 20000 });
    const tq = limpo(await qs.innerText());
    T.ok('Quanto sobrou: "Taxas da maquininha (cartão e Pix)" e "Depois das taxas da maquininha" depois do resultado', /Resultado do mês[\s\S]{0,60}Taxas da maquininha \(cartão e Pix\)[\s\S]{0,30}Depois das taxas da maquininha/.test(tq), tq.slice(tq.indexOf('Como fecha'), tq.indexOf('Como fecha') + 700));
    T.ok('Relatórios: o cartão das taxas também', (await page.locator('section[aria-label="Taxas da maquininha"]').count()) === 1);
    T.ok(`sem rolagem lateral em Relatórios (${larg})`, (await N.rolagemLateral(page)) <= 0);

    // Meu pet shop: a taxa nova vale daqui para frente
    await N.ir(page, '/gestao/app/meu-petshop#taxas-maquininha');
    const card = page.locator('section[aria-label="Taxas da maquininha"]');
    await card.waitFor({ timeout: 20000 });
    await card.scrollIntoViewIfNeeded();
    const campo = card.getByLabel('Débito: porcentagem da venda');
    await campo.waitFor({ timeout: 10000 });
    T.ok('o cartão mostra o débito com 2%', (await campo.inputValue()) === '2', await campo.inputValue());
    await campo.fill(larg === 390 ? '2,5' : '3');
    const ex = limpo(await card.locator('.g-tx-exemplo').innerText());
    T.ok('o exemplo de R$ 100,00 muda na hora', larg === 390 ? /débito você recebe R\$\s?97,50/.test(ex) : /débito você recebe R\$\s?97,00/.test(ex), ex);
    await card.getByRole('button', { name: 'Salvar taxas' }).click(); await page.waitForTimeout(1500);
    T.ok('o dono salvou a taxa nova do débito', B.num(`select debito_pct from taxas_maquininha where petshop_id='${P}'`) === (larg === 390 ? 2.5 : 3));
    T.ok('o débito de antes continua com R$ 2,00', taxa(deb.id) === '2.00');
    T.ok(`sem rolagem lateral em Meu pet shop (${larg})`, (await N.rolagemLateral(page)) <= 0);
    await card.screenshot({ path: `${B.RAIZ}/testes/saida/indicadores-taxas-${larg}.png` }).catch(() => {});
    // volta a 2% para a próxima largura conferir as mesmas contas
    await MQ.salvarTaxas(dono, P, { ...(await MQ.carregarTaxas(dono, P, true)), debito_pct: 2 });
    T.ok(`nenhum erro na tela (${larg})`, erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }

  T.secao('sem dados');
  const L2 = await criarLoja(T, { nome: 'Indicadores vazio', equipe: false, dados: false });
  const { ctx, page, erros } = await N.contexto(390, 844);
  await N.entrar(page, L2.emails.dono, L2.senha);
  await N.ir(page, '/gestao/app/relatorios/indicadores');
  await page.getByText('Ainda não tem dados neste período.').waitFor({ timeout: 20000 }).catch(() => {});
  const tv = limpo(await page.locator('.g-main').innerText());
  T.ok('loja nova: "Ainda não tem dados neste período." (nenhum número inventado)', /Ainda não tem dados neste período\./.test(tv) && !/R\$/.test(tv), tv.slice(0, 400));
  T.ok('sem rolagem lateral e sem erro', (await N.rolagemLateral(page)) <= 0 && erros.length === 0, erros);
  await foto(page, 'vazio-390');
  await ctx.close();
  await N.fecharNavegador();
}))();
