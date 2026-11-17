// Crédito em quantas vezes nas telas que antes gravavam tudo à vista (migração 20261208), em 390 e 1366:
// - Caixa › Entrada (a recepção lança R$ 200,00 no crédito em 3x: taxa do 3x guardada);
// - Caixa › Contas de clientes › Recebi (a recepção recebe inteira, em 2x, a conta que o dono anotou);
// - Pacotes › Vender pacote (o dono vende em 4x), e o Financeiro com o parcelado em parcelas por mês no a receber.
// Em cada uma: a pergunta "Crédito em quantas vezes?" aparece só com o crédito marcado, a taxa guardada no banco é a do
// número de vezes, sem rolagem lateral e sem erro na página. Capturas em testes/saida/parcelas-*.png.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const N = require('../lib/navegador');
const T = require('../lib/teste')('parcelas-todas-telas');
const MQ = lib('maquininha');
const limpo = (s) => String(s ?? '').replace(/[  ]/g, ' ');
const foto = (alvo, nome) => alvo.screenshot({ path: `${B.RAIZ}/testes/saida/parcelas-${nome}.png` }).catch(() => {});

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Parcelas telas' });
  const { dono } = L.sb;
  const P = L.P;
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 0 }).select('id'), 'caixa');
  await MQ.salvarTaxas(dono, P, { ...MQ.TAXAS_ZERADAS, debito_pct: 2, debito_dias: 1, credito_pct: 4, credito_fixo: 0.5, credito_dias: 30, parcelado_pct: 6, parcelado_dias: 30, parcelas_pct: { 3: 7.5 } });
  B.sql(`insert into pacotes (petshop_id, nome, servico_id, quantidade, validade_dias, preco) values ('${P}', '4 banhos no mês', '${L.S.Banho}', 4, 30, 240)`);
  const taxa = (id) => B.sql(`select coalesce((select taxa::text || '|' || coalesce(parcelas::text, '-') from lancamentos_taxas where lancamento_id='${id}'), 'sem')`);

  for (const [larg, alt, quem, pet] of [[390, 844, 'Ana', 'Mel'], [1366, 900, 'Beto', 'Bob']]) {
    T.secao(`${larg} px`);
    const conta = B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 100, categoria: 'Banho e tosa', descricao: `Fiado ${quem}`, data: L.dia(-3), vencimento: L.dia(-3), pago: false, cliente_id: L.tutores[quem], origem: 'tela' }).select('id').single(), 'conta').id;

    // a recepção: Entrada e Recebi pelo Caixa
    const r = await N.contexto(larg, alt);
    await N.entrar(r.page, L.emails.caixa, L.senha);
    await N.ir(r.page, '/gestao/app/caixa');
    await r.page.getByRole('button', { name: 'Entrada', exact: true }).first().click(); await r.page.waitForTimeout(800);
    let f = r.page.locator('.g-folha').last();
    await f.locator('input[inputmode=decimal]').first().fill('200,00');
    await f.getByRole('button', { name: 'Pix', exact: true }).click(); await r.page.waitForTimeout(300);
    T.ok('Entrada: no Pix, nada de pergunta', (await f.getByLabel('Crédito em quantas vezes').count()) === 0);
    await f.getByRole('button', { name: 'Crédito', exact: true }).click(); await r.page.waitForTimeout(300);
    const sel = f.getByLabel('Crédito em quantas vezes');
    T.ok('Entrada: no crédito, "Crédito em quantas vezes?"', (await sel.count()) === 1 && /Crédito em quantas vezes\?/.test(limpo(await f.innerText())));
    await sel.selectOption('3'); await r.page.waitForTimeout(200);
    T.ok(`Entrada: sem rolagem lateral (${larg})`, (await N.rolagemLateral(r.page)) <= 0);
    await foto(f, `entrada-${larg}`);
    await f.getByRole('button', { name: 'Lançar', exact: true }).click(); await r.page.waitForTimeout(2500);
    const ent = B.sql(`select id from lancamentos where petshop_id='${P}' and tipo='entrada' and valor=200 and forma='credito' order by criado_em desc limit 1`);
    T.ok('Entrada em 3x: 200 × 7,5% + 0,50 = R$ 15,50 guardado com 3 vezes', taxa(ent) === '15.50|3', taxa(ent));

    await N.ir(r.page, '/gestao/app/caixa');
    await r.page.getByRole('button', { name: `Recebi: Fiado ${quem}` }).first().click(); await r.page.waitForTimeout(1200);
    f = r.page.locator('.g-folha').last();
    await f.getByRole('button', { name: 'Crédito', exact: true }).click(); await r.page.waitForTimeout(300);
    const sel2 = f.getByLabel('Crédito em quantas vezes');
    T.ok('Recebi: no crédito, a mesma pergunta', (await sel2.count()) === 1);
    await sel2.selectOption('2'); await r.page.waitForTimeout(200);
    T.ok(`Recebi: sem rolagem lateral (${larg})`, (await N.rolagemLateral(r.page)) <= 0);
    await foto(f, `recebi-${larg}`);
    await f.getByRole('button', { name: 'Dar baixa' }).click(); await r.page.waitForTimeout(2500);
    T.ok('Recebi a conta do dono em 2x: 100 × 6% + 0,50 = R$ 6,50 com 2 vezes (a recepção recebeu, a recepção anotou)', taxa(conta) === '6.50|2', taxa(conta));
    T.ok(`nenhum erro na tela da recepção (${larg})`, r.erros.length === 0, r.erros.slice(0, 4));
    await r.ctx.close();

    // o dono: Vender pacote
    const d = await N.contexto(larg, alt);
    await N.entrar(d.page, L.emails.dono, L.senha);
    await N.ir(d.page, '/gestao/app/pacotes');
    await d.page.getByRole('button', { name: 'Vender pacote' }).first().click(); await d.page.waitForTimeout(700);
    await d.page.locator('.g-folha').last().getByRole('button', { name: new RegExp(`^${pet}`) }).first().click(); await d.page.waitForTimeout(700);
    await d.page.locator('.g-folha').last().getByRole('button', { name: /^4 banhos no mês/ }).first().click(); await d.page.waitForTimeout(700);
    f = d.page.locator('.g-folha').last();
    await f.getByRole('button', { name: 'Crédito', exact: true }).click(); await d.page.waitForTimeout(300);
    const sel3 = f.getByLabel('Crédito em quantas vezes');
    T.ok('Vender pacote: no crédito, a pergunta', (await sel3.count()) === 1);
    await sel3.selectOption('4'); await d.page.waitForTimeout(300);
    const tx = limpo(await f.locator('.g-tx-recebe').innerText().catch(() => ''));
    // 240 × 6% (4x, a do parcelado) + 0,50 = 14,90; recebe 225,10
    T.ok('o dono vê a taxa do 4x: R$ 14,90 · Você recebe R$ 225,10', /R\$\s?14,90/.test(tx) && /R\$\s?225,10/.test(tx), tx);
    T.ok(`Vender pacote: sem rolagem lateral (${larg})`, (await N.rolagemLateral(d.page)) <= 0);
    await sel3.scrollIntoViewIfNeeded();
    await foto(f, `pacote-${larg}`);
    await f.getByRole('button', { name: /^Receber R\$/ }).click(); await d.page.waitForTimeout(2500);
    const pac = B.sql(`select l.id from lancamentos l where l.petshop_id='${P}' and l.categoria='Pacotes' and l.descricao like '%${pet}%' order by l.criado_em desc limit 1`);
    T.ok('o pacote em 4x ficou com R$ 14,90 e 4 vezes no banco', taxa(pac) === '14.90|4', taxa(pac));
    // Financeiro: o a receber da maquininha separa o parcelado e diz a regra numa linha
    await N.ir(d.page, '/gestao/app/financeiro');
    const cf = d.page.locator('section[aria-label="Taxas da maquininha"]');
    await cf.waitFor({ timeout: 20000 });
    const tf = limpo(await cf.innerText());
    T.ok('Financeiro: "Crédito parcelado: uma parcela por mês…" no a receber da maquininha', /A receber da maquininha/i.test(tf) && /Crédito parcelado: uma parcela por mês, a 1ª no prazo do parcelado e as outras a cada 30 dias\./.test(tf), tf);
    T.ok(`Financeiro: sem rolagem lateral (${larg})`, (await N.rolagemLateral(d.page)) <= 0);
    await foto(cf, `financeiro-${larg}`);
    T.ok(`nenhum erro na tela do dono (${larg})`, d.erros.length === 0, d.erros.slice(0, 4));
    await d.ctx.close();
  }
  await N.fecharNavegador();
}))();
