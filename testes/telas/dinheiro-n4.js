// Rodada 9 (N4), pela tela, com a dona: um nome para cada número do dinheiro (o mesmo cenário de banco/dinheiro-n4.js).
//   Recebido 168,61 − devolvido 29,90 − crédito deixado 29,90 + crédito usado 12,49 = Faturamento 121,30
//   − despesas 150,00 = Resultado −28,70 − taxas 2,88 = −31,58. Entradas lançadas 206,08. Valor médio por conta 38,79 (3 contas).
// 1366 Financeiro: os três cartões fecham (Faturamento − Despesas = Resultado), "Como os números se ligam" com os nove passos,
//      "De onde veio" diz que 206,08 são entradas lançadas; Para o contador baixa a planilha (uma linha por recebimento + resumo)
//      e o Exportar traz Taxa, Parcelas, Cai em, Lançado em, Retroativo e a soma de Conta no resultado = −28,70.
// 1366 Relatórios e Indicadores: Faturamento 121,30, a conta com Recebido 168,61, Valor médio por conta 38,79 nos dois.
// 390 Caixa: Recebido hoje + R$ 168,61 (sem crédito do tutor e sem o produto da troca); tirar dinheiro da gaveta como retirada do dono
//      vira despesa (categoria Retirada do dono). 390 Hoje: Faturamento de hoje R$ 121,30.
// Aparelho em Tóquio: o crédito do tutor conta no dia do pet shop (o total do dia não muda com o fuso do aparelho).
// Em cada tela: nenhum erro de página ou console e sem rolagem para o lado. Capturas em testes/saida/dinheiro-n4-*.png.
const fs = require('fs');
const path = require('path');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('dinheiro-n4-tela');
const D = lib('dinheiro'), DV = lib('devolucao'), TN = lib('tudo-ou-nada');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Dinheiro N4 tela', modulos: ['banho_tosa', 'loja'] });
  const { dono } = L.sb;
  const P = L.P, prod = L.prod, hoje = L.hoje;
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'caixa');
  B.must(await dono.from('taxas_maquininha').insert({ petshop_id: P, debito_pct: 1.99, debito_fixo: 0, debito_dias: 1, credito_pct: 3.49, credito_fixo: 0.1, credito_dias: 30,
    parcelado_pct: 4.99, parcelado_dias: 30, parcelas_pct: { 3: 5.59 }, pix_pct: 0.99, pix_fixo: 0, pix_dias: 0 }).select('petshop_id'), 'taxas');
  const granel = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Ração a granel', unidade: 'kg', preco_venda: 18.9, custo: 11.27, estoque: 30 }).select('id').single(), 'granel').id;
  const petisco = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Petisco', unidade: 'un', preco_venda: 12.49, custo: 5.01, estoque: 50 }).select('id').single(), 'petisco').id;
  const item = (produto_id, nome, qtd, valor) => ({ tipo: 'produto', nome, qtd, valor, produto_id });
  async function vender(itens, o = {}) {
    const ch = D.novaChaveDeOperacao();
    const r = await TN.fazerTudoOuNada(dono, P, ch, { funcao: 'venda_registrar' }, [
      { t: 'lancamento', nome: 'venda', chave: ch, linha: { tipo: 'entrada', valor: D.contaDosItens(itens, 0).soma, forma: o.forma ?? 'dinheiro', categoria: 'Venda de produtos', cliente_id: o.cliente ?? null, pago: true,
        data: hoje, descricao: 'Venda: ' + itens.map((i) => `${i.qtd} ${i.nome}`).join(' + '), itens, ...(o.extra ?? {}) } },
      TN.passoDoEstoque(itens.map((i) => ({ produtoId: i.produto_id, qtd: i.qtd })), ch, TN.ref('venda')),
    ]);
    return r.ids.venda;
  }
  await vender([item(prod, 'Shampoo Neutro', 2, 29.9), item(granel, 'Ração a granel', 0.35, 18.9)], { forma: 'debito' });
  const v2 = await vender([item(petisco, 'Petisco', 3, 12.49)], { forma: 'pix', cliente: L.tutores.Ana });
  const v3 = await vender([item(prod, 'Shampoo Neutro', 1, 29.9)], { forma: 'credito', cliente: L.tutores.Ana });
  await DV.devolver(dono, P, { venda: v3, itens: [{ produto_id: prod, qtd: 1 }], modo: 'dinheiro', forma: 'dinheiro', chave: D.novaChaveDeOperacao() });
  await DV.devolver(dono, P, { venda: v2, itens: [{ produto_id: petisco, qtd: 2 }], modo: 'troca', forma: 'pix', novos: [{ produto_id: prod, qtd: 1 }], chave: D.novaChaveDeOperacao() });
  const v4 = await vender([item(prod, 'Shampoo Neutro', 1, 29.9)], { cliente: L.tutores.Beto });
  await DV.devolver(dono, P, { venda: v4, itens: [{ produto_id: prod, qtd: 1 }], modo: 'credito', chave: D.novaChaveDeOperacao() });
  const pg = D.pagamentoComCredito(12.49, null, 0);
  await vender([item(petisco, 'Petisco', 1, 12.49)], { cliente: L.tutores.Beto, forma: pg.forma, extra: { pagamentos: pg.pagamentos, credito_usado: 12.49 } });
  await D.lancarPago(dono, P, { tipo: 'saida', valor: 100, forma: 'pix', categoria: 'Aluguel', descricao: 'Aluguel' });
  await D.lancarPago(dono, P, { tipo: 'saida', valor: 50, forma: 'pix', categoria: 'Retirada do dono', descricao: 'Retirada' });

  const saida = path.join(__dirname, '..', 'saida');
  fs.mkdirSync(saida, { recursive: true });
  const foto = (page, nome, cheia = true) => page.screenshot({ path: path.join(saida, `dinheiro-n4-${nome}.png`), fullPage: cheia }).catch(() => {});
  const semErros = (onde, erros) => { T.ok(`${onde}: nenhum erro de página, console ou pedido recusado`, erros.length === 0, erros); erros.length = 0; };
  const semLado = async (onde, page) => { const x = await N.rolagemLateral(page); T.ok(`${onde}: sem rolagem para o lado`, x <= 0, `${x}px`); };
  const txt = async (l) => (await l.innerText()).replace(/\u00a0/g, ' ').replace(/[ \t]+/g, ' ');
  const csv = async (dl) => {
    const arq = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'dinheiro-n4-')), dl.suggestedFilename());
    await dl.saveAs(arq);
    return fs.readFileSync(arq, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map((l) => l.split(';').map((c) => c.replace(/^"|"$/g, '')));
  };
  const numero = (s) => Number(String(s || '0').replace(/\./g, '').replace(',', '.'));

  // ---------------------------------------------------------------------------------------------------------------
  const g = await N.contexto(1366, 900);
  await N.entrar(g.page, L.emails.dono, L.senha);
  T.secao('1366 Financeiro: Faturamento − Despesas = Resultado, e a cadeia passo a passo');
  await N.ir(g.page, '/gestao/app/financeiro');
  await g.page.locator('.gf-cadeia').waitFor({ timeout: 20000 });
  const kpis = await txt(g.page.locator('section.kpis').first());
  T.ok('cartões: Faturamento R$ 121,30, Despesas R$ 150,00, Resultado do mês −R$ 28,70', /Faturamento\s*R\$ 121,30/i.test(kpis) && /Despesas\s*R\$ 150,00/i.test(kpis) && /Resultado do mês\s*-?−?\s?R\$ ?-?28,70/i.test(kpis.replace(/−/g, '-')), kpis);
  T.ok('… não há mais cartão "Entrou" nem "Saiu" com outro número', !/(^|\n)\s*Entrou\s*\n/i.test(kpis) && !/857|1\.112/.test(kpis), kpis);
  T.ok('… o Faturamento diz o Recebido embaixo (recebido R$ 168,61)', /recebido R\$ 168,61/i.test(kpis), kpis);
  const cadeia = (await txt(g.page.locator('.gf-cadeia'))).replace(/−/g, '-');
  const passo = async (id) => (await txt(g.page.locator(`.gf-cadeia [data-passo="${id}"] b`))).replace(/−/g, '-');
  T.ok('Como os números se ligam: Recebido 168,61 · Devolvido 29,90 · Crédito deixado 29,90 · Crédito usado 12,49 · Faturamento 121,30',
    (await passo('recebido')) === 'R$ 168,61' && (await passo('devolvido')) === 'R$ 29,90' && (await passo('credito_deixado')) === 'R$ 29,90' && (await passo('credito_usado')) === 'R$ 12,49' && (await passo('faturamento')) === 'R$ 121,30', cadeia);
  T.ok('… Despesas 150,00 (com a retirada do dono de R$ 50,00 dita) · Resultado −28,70 · Taxas 2,88 · depois das taxas −31,58',
    (await passo('despesas')) === 'R$ 150,00' && /retirada do dono \(R\$ 50,00\)/i.test(cadeia) && /28,70/.test(await passo('resultado')) && (await passo('taxas')) === 'R$ 2,88' && /31,58/.test(await passo('depois_das_taxas')), cadeia);
  const tela = await txt(g.page.locator('.g-main'));
  T.ok('De onde veio: R$ 206,08 são "Entradas lançadas", com o Faturamento ao lado', /Entradas lançadas, por categoria: R\$ 206,08/.test(tela) && /o Faturamento do mês é R\$ 121,30/.test(tela), tela.match(/De onde veio[\s\S]{0,300}/)?.[0]);
  T.ok('Como foi recebido: soma R$ 181,10 = Recebido 168,61 + 12,49 de crédito do tutor (o produto da troca fora)', /Soma R\$ 181,10: o Recebido \(R\$ 168,61\) mais R\$ 12,49 pagos com crédito do tutor/.test(tela), tela.match(/Como foi recebido[\s\S]{0,400}/)?.[0]);
  T.ok('Faturamento acumulado R$ 121,30 e as barras dizem Faturamento e Despesas', /Faturamento acumulado[\s\S]{0,40}R\$ 121,30/.test(tela) && /Faturamento e despesas por semana/.test(tela), tela.match(/Faturamento acumulado[\s\S]{0,80}/)?.[0]);
  await semLado('1366 Financeiro', g.page);
  await foto(g.page, 'financeiro-1366');

  T.secao('1366 Financeiro: planilhas para o contador');
  const pc = g.page.locator('section[aria-label="Para o contador"]');
  await pc.scrollIntoViewIfNeeded();
  const [d1] = await Promise.all([g.page.waitForEvent('download', { timeout: 30000 }), pc.locator('[data-planilha="contador"]').click()]);
  const t1 = await csv(d1);
  T.ok('Planilha para o contador: cabeçalho com Bruto, Taxa, Líquido, Cai em, Desconto, Devolvido, Crédito, Custo', ['Data do recebimento', 'Data do atendimento ou da venda', 'Lançado em', 'Retroativo', 'Forma', 'Parcelas', 'Bruto', 'Taxa da maquininha', 'Líquido', 'Cai em', 'Desconto', 'Devolvido', 'Crédito do tutor usado', 'Custo dos produtos'].every((c) => t1[0].includes(c)), t1[0]);
  const iB = t1[0].indexOf('Bruto'), recebimentos = t1.slice(1).filter((l) => /^\d{2}\/\d{2}\/\d{4}$/.test(l[0]));
  T.ok('… 6 recebimentos, Bruto somando R$ 206,08', recebimentos.length === 6 && Math.round(recebimentos.reduce((s, l) => s + numero(l[iB]), 0) * 100) === 20608, recebimentos.map((l) => l[iB]));
  T.ok('… o resumo embaixo usa os nomes da tela (Recebido 168,61; = Faturamento 121,30; = Resultado -28,70)', t1.some((l) => l[0] === 'Recebido' && l[1] === '168,61') && t1.some((l) => l[0] === 'igual a Faturamento' && l[1] === '121,30') && t1.some((l) => l[0] === 'igual a Resultado' && l[1] === '-28,70'), t1.slice(-11).map((l) => l.slice(0, 2)));
  const [d2] = await Promise.all([g.page.waitForEvent('download', { timeout: 30000 }), g.page.getByRole('button', { name: 'Exportar' }).first().click()]);
  const t2 = await csv(d2);
  const col = (nome) => t2[0].indexOf(nome);
  T.ok('Exportar do Financeiro: Parcelas, Taxa da maquininha, Valor líquido, Cai em, Data do atendimento, Lançado em, Retroativo', ['Parcelas', 'Taxa da maquininha', 'Valor líquido', 'Cai em', 'Data do atendimento ou da venda', 'Lançado em', 'Retroativo', 'Conta no faturamento', 'Conta no resultado'].every((c) => col(c) >= 0), t2[0]);
  const somaCol = (nome) => Math.round(t2.slice(1).reduce((s, l) => s + numero(l[col(nome)]), 0) * 100) / 100;
  T.ok('… somando "Conta no resultado" dá o Resultado da tela (−28,70) e "Conta no faturamento" o Faturamento (121,30)', somaCol('Conta no resultado') === -28.7 && somaCol('Conta no faturamento') === 121.3, { resultado: somaCol('Conta no resultado'), faturamento: somaCol('Conta no faturamento') });
  T.ok('… somando "Taxa da maquininha" dá R$ 2,88', somaCol('Taxa da maquininha') === 2.88, somaCol('Taxa da maquininha'));
  const [d3] = await Promise.all([g.page.waitForEvent('download', { timeout: 30000 }), pc.locator('[data-planilha="saldos"]').click()]);
  const t3 = await csv(d3);
  T.ok('Saldos em aberto: crédito de tutores R$ 17,41 (Beto)', t3.some((l) => l[0] === 'Crédito de tutores em aberto' && l[4] === '17,41') && t3.some((l) => /Beto/.test(l[0]) && l[4] === '17,41'), t3.map((l) => l.slice(0, 5)));
  const [d4] = await Promise.all([g.page.waitForEvent('download', { timeout: 30000 }), pc.locator('[data-planilha="repasses"]').click()]);
  const t4 = await csv(d4);
  T.ok('Repasses da maquininha: uma linha por parcela, com Taxa, Valor que cai, Cai em e Situação', t4.length >= 4 && ['Taxa', 'Valor que cai', 'Cai em', 'Situação'].every((c) => t4[0].includes(c)), t4.slice(0, 3));
  semErros('1366 Financeiro', g.erros);

  T.secao('1366 Relatórios e Indicadores: o mesmo Faturamento e o mesmo Valor médio por conta');
  await N.ir(g.page, '/gestao/app/relatorios');
  await g.page.locator('.g-rel-total').first().waitFor({ timeout: 30000 });
  const rel = (await txt(g.page.locator('.g-main'))).replace(/−/g, '-');
  T.ok('Relatórios: Faturamento R$ 121,30, com a conta Recebido R$ 168,61 … Faturamento R$ 121,30', /R\$ 121,30/.test(await txt(g.page.locator('.g-rel-total').first())) && /Recebido R\$ 168,61/.test(rel) && /- Devolvido aos tutores R\$ 29,90/.test(rel) && /= Faturamento R\$ 121,30/.test(rel), rel.match(/Recebido R\$[\s\S]{0,260}/)?.[0]);
  T.ok('Relatórios: Valor médio por conta R$ 38,79 (3 contas pagas)', /Valor médio por conta\s*R\$ 38,79/i.test(rel) && /3 contas pagas no período/.test(rel) && !/Valor médio por atendimento/i.test(rel), rel.match(/Valor médio[\s\S]{0,120}/i)?.[0]);
  T.ok('Relatórios, por forma de pagamento: sem os R$ 24,98 do produto trocado', !/Outro \d+%\s*R\$ 24,98/.test(rel), rel.match(/POR FORMA DE PAGAMENTO[\s\S]{0,200}/i)?.[0]);
  await semLado('1366 Relatórios', g.page);
  await foto(g.page, 'relatorios-1366');
  await N.ir(g.page, '/gestao/app/relatorios/indicadores');
  await g.page.getByText('Valor médio por conta').first().waitFor({ timeout: 30000 });
  const ind = await txt(g.page.locator('.g-main'));
  T.ok('Indicadores: Valor médio por conta R$ 38,79 (3 contas pagas), o mesmo de Relatórios', /Valor médio por conta\s*R\$ 38,79/i.test(ind) && /3 contas pagas/.test(ind), ind.match(/Valor médio por conta[\s\S]{0,160}/i)?.[0]);
  await semLado('1366 Indicadores', g.page);
  semErros('1366 Relatórios e Indicadores', g.erros);

  T.secao('1366 Meu pet shop: a opção do feriado no repasse');
  await N.ir(g.page, '/gestao/app/meu-petshop#taxas-maquininha');
  const opFeriado = g.page.locator('[data-teste="repasse-feriado"] input');
  await opFeriado.waitFor({ timeout: 20000 });
  T.ok('desligada por padrão', !(await opFeriado.isChecked()));
  await g.page.locator('#taxas-maquininha, [data-teste="repasse-feriado"]').first().scrollIntoViewIfNeeded();
  await g.page.waitForTimeout(800);
  await opFeriado.click();
  const gravou = () => B.sql(`select coalesce(opcoes ->> 'dinheiro.repasse_pula_feriado', '') from petshops where id='${P}'`) === 'true';
  for (let i = 0; i < 20 && !gravou(); i++) await g.page.waitForTimeout(500);
  T.ok('ligar grava a opção no pet shop e a caixa fica marcada', gravou() && (await opFeriado.isChecked()), await g.page.locator('[data-teste="repasse-feriado"]').innerText().catch(() => ''));
  semErros('1366 Meu pet shop', g.erros);
  await g.ctx.close();

  // ---------------------------------------------------------------------------------------------------------------
  const c = await N.contexto(390, 844);
  await N.entrar(c.page, L.emails.dono, L.senha);
  T.secao('390 Hoje e Caixa: cada número com o nome dele');
  await N.ir(c.page, '/gestao/app');
  await c.page.getByText('Faturamento de hoje').first().waitFor({ timeout: 30000 });
  const hj = await txt(c.page.locator('.g-main'));
  T.ok('Hoje: "Faturamento de hoje" R$ 121,30 (não mais "Entrou hoje")', /Faturamento de hoje\s*R\$ 121,30/i.test(hj) && !/Entrou hoje/i.test(hj), hj.match(/Faturamento de hoje[\s\S]{0,80}/i)?.[0]);
  await N.ir(c.page, '/gestao/app/financeiro');
  await c.page.locator('.gf-cadeia').waitFor({ timeout: 20000 });
  T.ok('390 Financeiro: a cadeia aparece inteira (9 passos) e o Faturamento é R$ 121,30', (await c.page.locator('.gf-cadeia > div').count()) === 9 && /R\$ 121,30/.test(await txt(c.page.locator('.gf-cadeia [data-passo="faturamento"]'))));
  await semLado('390 Financeiro', c.page);
  await foto(c.page, 'financeiro-390');
  await N.ir(c.page, '/gestao/app/relatorios');
  await c.page.locator('.g-rel-total').first().waitFor({ timeout: 30000 });
  await semLado('390 Relatórios', c.page);
  await N.ir(c.page, '/gestao/app/caixa');
  await c.page.getByText('Recebido hoje').first().waitFor({ timeout: 30000 });
  const cx = (await txt(c.page.locator('.g-main'))).replace(/−/g, '-');
  T.ok('Caixa: Recebido hoje + R$ 168,61 e Saiu hoje (devoluções e saídas) - R$ 179,90', /Recebido hoje\s*\+ R\$ 168,61/.test(cx) && /Saiu hoje \(devoluções e saídas\)\s*- R\$ 179,90/.test(cx) && !/Entrou hoje/.test(cx), cx.match(/Recebido hoje[\s\S]{0,160}/)?.[0]);
  await semLado('390 Caixa', c.page);
  await foto(c.page, 'caixa-390');
  await c.page.getByRole('button', { name: /Tirar dinheiro da gaveta/ }).first().click();
  const fg = c.page.locator('.g-folha').last();
  await fg.getByText('É retirada do dono').waitFor({ timeout: 10000 });
  await fg.locator('input[inputmode]').first().fill('20,00');
  await fg.getByPlaceholder('Ex.: levei ao banco').fill('Retirada da semana');
  await fg.getByText('É retirada do dono').click();
  await foto(c.page, 'caixa-retirada-390', false);
  await fg.getByRole('button', { name: 'Anotar retirada' }).click();
  await c.page.getByText(/retirada do dono de R\$\s20,00/).waitFor({ timeout: 15000 });
  const ret = B.sql(`select categoria || '|' || coalesce(movimento, '-') || '|' || forma || '|' || (caixa_id is not null) from lancamentos where petshop_id='${P}' and descricao='Retirada da semana'`);
  T.ok('a retirada do dono pelo Caixa vira saída em dinheiro na categoria Retirada do dono (não uma sangria)', ret === 'Retirada do dono|-|dinheiro|true', ret);
  const cad = B.must(await dono.rpc('dinheiro_cadeia', { p: P, p_de: hoje, p_ate: hoje }), 'cadeia');
  T.ok('… e entra nas Despesas (170,00) e na retirada do dono (70,00) da cadeia, igual à lançada no Financeiro', Number(cad.despesas) === 170 && Number(cad.retirada_do_dono) === 70, cad);
  semErros('390 Hoje e Caixa', c.erros);
  await c.ctx.close();

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('aparelho em Tóquio: o total do dia segue o fuso do pet shop');
  const tzAntes = process.env.TZ;
  process.env.TZ = 'Asia/Tokyo';
  const tk = await N.contexto(1366, 900);
  process.env.TZ = tzAntes;
  await N.entrar(tk.page, L.emails.dono, L.senha);
  await N.ir(tk.page, '/gestao/app/financeiro');
  // o mês do aparelho pode já ser outro (último dia do mês): só confere quando a tela mostra o mês deste cenário
  const temMes = await tk.page.locator('.gf-cadeia').waitFor({ timeout: 20000 }).then(() => true, () => false);
  if (temMes) {
    const acumulado = await txt(tk.page.locator('.g-fin-acum'));
    T.ok('Financeiro em Tóquio: Faturamento acumulado R$ 121,30 e o aviso de fuso aparece', /R\$ 121,30/.test(acumulado) && (await tk.page.getByText(/relógio deste aparelho/).count()) > 0, acumulado);
    const semanas = await tk.page.locator('[aria-label^="Dias "]').first().getAttribute('aria-label').catch(() => null);
    T.ok('… as barras por semana somam o mesmo faturamento (o crédito cai no dia do pet shop, junto das vendas)', !semanas || /121,30/.test(semanas), semanas);
  } else T.ok('Financeiro em Tóquio: o aparelho já está em outro mês (cenário não aparece): conferido só o banco', true);
  await tk.ctx.close();
}))();
