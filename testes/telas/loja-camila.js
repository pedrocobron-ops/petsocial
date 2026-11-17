// O que a testadora Camila achou, pela tela (migração 20261214), em 390 e 1366:
// - quem cuida do estoque sem "Ver custo e margem" não vê margem, custo médio, último custo nem o valor em estoque a preço de
//   custo (cartões, ficha do produto); o dono vê;
// - Entrada: "Lançar a compra como despesa" começa desmarcado; marcado, pede a forma antes de anotar (nada grava sem ela);
//   com a forma, a entrada e a despesa entram juntas; a próxima entrada abre desmarcada de novo;
// - Venda no balcão: códigos lidos antes de a lista de produtos chegar entram na conta quando ela chega; código que não é de
//   nenhum produto mostra "Código não encontrado";
// - Produto novo com "Controlar validade" e "Quanto tem hoje": pede o lote ou a validade e guarda no lote;
// - Orçamento com produtos e banho: virou venda e o horário fechado sem marcar fica "Falta marcar", com o valor da venda;
// - Editar uma entrada no crédito: dá para trocar para 3 vezes (taxa do 3x guardada);
// - Quanto sobrou: as contas fixas do período ainda não pagas, à parte.
// Capturas em testes/saida/camila-*.png.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('loja-camila-telas');
const D = lib('dinheiro'), MQ = lib('maquininha');
const limpo = (s) => String(s ?? '').replace(/[  ]/g, ' ');
const foto = (alvo, nome) => alvo.screenshot({ path: `${B.RAIZ}/testes/saida/camila-${nome}.png` }).catch(() => {});

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Camila telas' });
  const { dono } = L.sb;
  const P = L.P;
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'loja.margem': true, 'loja.codigo_barras': true } }), 'opções da loja');
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 200 }).select('id'), 'caixa');
  await MQ.salvarTaxas(dono, P, { ...MQ.TAXAS_ZERADAS, credito_pct: 3.49, credito_dias: 30, parcelado_pct: 4.99, parcelado_dias: 30, parcelas_pct: { 3: 5.29 } });
  const novo = async (campos) => B.must(await dono.from('produtos').insert({ petshop_id: P, unidade: 'un', ...campos }).select('id').single(), campos.nome).id;
  const golden = await novo({ nome: 'Ração Golden', preco_venda: 189.9, custo: 142, codigo_barras: '7890000000011' });
  const sache = await novo({ nome: 'Sachê Premier', preco_venda: 4.5, custo: 2.1, codigo_barras: '7890000000028' });
  await D.gravarMovimentos(dono, P, [
    { petshop_id: P, produto_id: golden, tipo: 'entrada', quantidade: 6, custo_unitario: 142, motivo: 'Compra', chave: D.novaChaveDeOperacao() },
    { petshop_id: P, produto_id: sache, tipo: 'entrada', quantidade: 24, custo_unitario: 2.1, motivo: 'Compra', chave: D.novaChaveDeOperacao() },
  ]);
  const saldo = (id) => B.num(`select estoque from produtos where id='${id}'`);
  const despesas = () => B.num(`select count(*) from lancamentos where petshop_id='${P}' and tipo='saida' and categoria='Produtos e material'`);

  for (const larg of [390, 1366]) {
    T.secao(`quem cuida do estoque, sem "Ver custo e margem" · ${larg}`);
    {
      const { ctx, page, erros } = await N.contexto(larg, larg < 500 ? 844 : 900);
      await N.entrar(page, L.emails.estoque, L.senha);
      await N.ir(page, '/gestao/app/estoque');
      await page.locator('.g-est-prod', { hasText: 'Ração Golden' }).waitFor({ timeout: 20000 });
      const tela = limpo(await page.locator('.g-main').innerText());
      T.ok('a lista não mostra margem nem valor em estoque a preço de custo', !/margem/i.test(tela) && !/Valor em estoque/i.test(tela) && !/preço de custo/i.test(tela), tela.slice(0, 500));
      await page.locator('.g-est-prod', { hasText: 'Ração Golden' }).getByRole('button', { name: 'Abrir Ração Golden' }).click();
      const ficha = page.locator('.g-folha').last();
      await ficha.getByText('Últimos movimentos').waitFor({ timeout: 15000 });
      await page.waitForTimeout(600);
      const tf = limpo(await ficha.innerText());
      T.ok('a ficha do produto não mostra custo médio, último custo, margem nem o custo das compras', !/Custo médio|Último custo|Margem|142,00/i.test(tf), tf.slice(0, 600));
      await foto(page, `estoque-sem-custo-${larg}`);
      T.ok(`sem rolagem lateral (${larg})`, (await N.rolagemLateral(page)) <= 0);
      await ficha.getByRole('button', { name: 'Voltar' }).click();
      await page.locator('.g-folha').waitFor({ state: 'detached', timeout: 10000 });

      if (larg === 390) {
        T.secao('Produto novo com validade: o estoque de hoje pede o lote e a validade');
        await page.getByRole('button', { name: 'Produto novo' }).click();
        const nv = page.locator('.g-folha').last();
        await nv.getByPlaceholder('Ex.: Ração Golden 15 kg').fill('Vermífugo Camila');
        T.ok('quem não vê o custo não tem o campo Custo nem a margem', !/Custo|Margem/.test(limpo(await nv.innerText())));
        await nv.getByText('Controlar validade').click();
        await nv.getByLabel('Quanto tem hoje (un)').fill('6');
        await nv.locator('[data-teste="lote-inicial"]').waitFor({ timeout: 5000 });
        T.ok('aparecem Lote do que já tem e Validade do que já tem', (await nv.getByLabel('Lote do que já tem').count()) === 1 && (await nv.getByLabel('Validade do que já tem').count()) === 1);
        await foto(nv, 'produto-novo-lote-390');
        await nv.getByRole('button', { name: 'Salvar produto' }).click();
        await page.getByText(/Diga o lote ou a validade do que já está na prateleira/).first().waitFor({ timeout: 8000 });
        T.ok('sem lote e sem validade: pede antes de salvar (nada gravado)', B.num(`select count(*) from produtos where petshop_id='${P}' and nome='Vermífugo Camila'`) === 0);
        await nv.getByLabel('Lote do que já tem').fill('VRM-2611');
        await nv.getByLabel('Validade do que já tem').fill(L.dia(90));
        await nv.getByRole('button', { name: 'Salvar produto' }).click();
        await page.locator('.g-est-prod', { hasText: 'Vermífugo Camila' }).waitFor({ timeout: 15000 });
        const vid = B.sql(`select id from produtos where petshop_id='${P}' and nome='Vermífugo Camila'`);
        T.ok('o estoque de hoje (6) entrou no lote VRM-2611 com a validade', B.sql(`select quantidade || '|' || validade from produtos_lotes where produto_id='${vid}'`) === `6.000|${L.dia(90)}`);
      }
      T.ok(`nenhum erro na tela (${larg})`, erros.length === 0, erros.slice(0, 4));
      await ctx.close();
    }

    T.secao(`o dono · ${larg}`);
    {
      const { ctx, page, erros } = await N.contexto(larg, larg < 500 ? 844 : 900);
      await N.entrar(page, L.emails.dono, L.senha);
      await N.ir(page, '/gestao/app/estoque');
      await page.locator('.g-est-prod', { hasText: 'Ração Golden' }).waitFor({ timeout: 20000 });
      const tela = limpo(await page.locator('.g-main').innerText());
      T.ok('o dono vê a margem e o valor em estoque a preço de custo', /margem/i.test(tela) && /Valor em estoque/i.test(tela), tela.slice(0, 400));

      if (larg === 390) {
        T.secao('Entrada com a despesa');
        const s0 = saldo(golden), d0 = despesas();
        await page.locator('.g-est-prod', { hasText: 'Ração Golden' }).getByRole('button', { name: 'Entrada' }).click();
        const ent = page.locator('.g-folha').last();
        const caixinha = ent.getByRole('checkbox', { name: /Lançar a compra como despesa/ });
        T.ok('"Lançar a compra como despesa" começa desmarcado', !(await caixinha.isChecked()));
        await ent.getByLabel('Quantidade (un)').fill('4');
        await ent.locator('input[inputmode=decimal]').nth(1).fill('150,00');
        await caixinha.check();
        T.ok('marcado, mostra o total (R$ 600,00) e pergunta como pagou', /Lançar a compra como despesa \(R\$ 600,00\)/.test(limpo(await ent.innerText())) && (await ent.getByRole('group', { name: 'Como você pagou a compra' }).count()) === 1);
        await ent.getByRole('button', { name: 'Anotar entrada' }).click();
        await ent.getByRole('alert').filter({ hasText: 'Escolha como você pagou a compra.' }).waitFor({ timeout: 5000 });
        T.ok('sem a forma: não anota nada (nem a entrada nem a despesa)', saldo(golden) === s0 && despesas() === d0);
        await foto(ent, 'entrada-despesa-390');
        await ent.getByRole('group', { name: 'Como você pagou a compra' }).getByRole('button', { name: 'Pix' }).click();
        await ent.getByRole('button', { name: 'Anotar entrada' }).click();
        await page.locator('.g-folha').waitFor({ state: 'detached', timeout: 15000 });
        T.ok('com o Pix: o estoque subiu 4 e a despesa de R$ 600,00 está no Financeiro', saldo(golden) === s0 + 4 && despesas() === d0 + 1
          && B.num(`select valor from lancamentos where petshop_id='${P}' and tipo='saida' and categoria='Produtos e material' order by criado_em desc limit 1`) === 600);
        await page.locator('.g-est-prod', { hasText: 'Sachê Premier' }).getByRole('button', { name: 'Entrada' }).click();
        const ent2 = page.locator('.g-folha').last();
        T.ok('a próxima entrada abre com a caixinha desmarcada de novo', !(await ent2.getByRole('checkbox', { name: /Lançar a compra como despesa/ }).isChecked()));
        await ent2.getByRole('button', { name: 'Voltar' }).click();
        await page.locator('.g-folha').waitFor({ state: 'detached', timeout: 10000 });

        T.secao('Venda no balcão: leitor rápido logo ao abrir');
        // a lista de produtos da venda demora 2,5 s para chegar (internet do balcão): o leitor passa antes
        await page.route('**/rest/v1/produtos?*', async (r) => { await new Promise((ok) => setTimeout(ok, 2500)); await r.continue().catch(() => {}); });
        await page.getByRole('button', { name: 'Vender' }).click();
        const vd = page.locator('.g-folha').last();
        const busca = vd.getByLabel('Buscar produto');
        await busca.waitFor({ timeout: 10000 });
        for (const codigo of ['7890000000011', '7890000000028', '7890000000028']) { await busca.fill(codigo); await busca.press('Enter'); }
        T.ok('enquanto a lista não chega: "3 códigos lidos" (nada se perde)', /3 códigos lidos/.test(limpo(await vd.locator('[data-teste="aviso-leitor"]').innerText().catch(() => ''))));
        await vd.getByText(/produtos entraram na conta/).waitFor({ timeout: 15000 });
        const tv = limpo(await vd.innerText());
        T.ok('a lista chegou: Golden e 2 Sachês na conta, R$ 198,90', /Ração Golden/.test(tv) && /Sachê Premier/.test(tv) && /R\$ 198,90/.test(tv), tv.slice(0, 600));
        await page.unroute('**/rest/v1/produtos?*');
        await busca.fill('1234567890123'); await busca.press('Enter');
        T.ok('código que não é de nenhum produto: "Código não encontrado: 1234567890123"', /Código não encontrado: 1234567890123/.test(limpo(await vd.locator('[data-teste="aviso-leitor"]').innerText().catch(() => ''))));
        await foto(vd, 'venda-leitor-390');
        await vd.getByRole('button', { name: 'Voltar' }).click();
        await page.waitForTimeout(500);
        const sair = page.locator('.g-folha', { hasText: /sair|perder/i }).last();
        if (await sair.count()) await sair.getByRole('button').last().click().catch(() => {});
        await page.waitForTimeout(500);
      }

      if (larg === 1366) {
        T.secao('Orçamento: o banho fica para marcar depois');
        const itens = [
          { tipo: 'produto', nome: 'Ração Golden', qtd: 1, valor: 149.9, produto_id: golden },
          { tipo: 'produto', nome: 'Sachê Premier', qtd: 2, valor: 89.9, produto_id: sache },
          { tipo: 'servico', nome: 'Banho', qtd: 1, valor: 45, servico_id: L.S.Banho },
        ];
        const orc = B.must(await dono.from('orcamentos').insert({ petshop_id: P, cliente_id: L.tutores.Ana, itens, desconto: 10, validade: L.dia(7), chave: D.novaChaveDeOperacao() }).select('id, numero').single(), 'orçamento');
        await page.getByRole('button', { name: 'Orçamentos' }).click();
        const lo = page.locator('.g-folha').last();
        await lo.locator('.g-linha', { hasText: `Nº ${orc.numero}` }).click();
        const vo = page.locator('.g-folha').last();
        await vo.getByRole('button', { name: /Transformar em venda/ }).click();
        const venda = page.locator('.g-folha', { hasText: `Venda do orçamento nº ${orc.numero}` }).last();
        await venda.waitFor({ timeout: 15000 });
        await venda.getByRole('button', { name: 'Pix', exact: true }).first().click();
        await venda.getByRole('button', { name: /Receber R\$\s320,90/ }).click();
        const horario = page.locator('.g-folha').last();
        await page.getByText('Agora marque o horário dos serviços do orçamento', { exact: false }).first().waitFor({ timeout: 15000 });
        await page.waitForTimeout(800);
        await horario.getByRole('button', { name: 'Fechar' }).first().click();
        await page.getByText(/ficou para marcar depois/).first().waitFor({ timeout: 10000 });
        const lista = page.locator('.g-folha').last();
        const linha = lista.locator('.g-linha', { hasText: `Nº ${orc.numero}` });
        await linha.waitFor({ timeout: 10000 });
        const tl = limpo(await linha.innerText());
        T.ok('na lista: "Falta marcar", virou venda de R$ 320,90 (não 364,70), falta marcar: Banho', /Falta marcar/.test(tl) && /R\$ 320,90/.test(tl) && !/364,70/.test(tl) && /falta marcar: Banho/.test(tl), tl);
        await linha.click();
        const ver = page.locator('.g-folha').last();
        await ver.locator('[data-teste="falta-marcar"]').waitFor({ timeout: 10000 });
        T.ok('o orçamento mostra "Falta marcar: Banho R$ 43,80" e o botão Marcar o horário', /Falta marcar: Banho R\$ 43,80/.test(limpo(await ver.innerText())) && (await ver.getByRole('button', { name: /Marcar o horário/ }).count()) === 1);
        await foto(ver, 'orcamento-falta-marcar-1366');
        await ver.getByRole('button', { name: 'Voltar' }).click();
        await page.waitForTimeout(300);
        await page.locator('.g-folha').last().getByRole('button', { name: 'Voltar' }).click().catch(() => {});
        await page.locator('.g-folha').waitFor({ state: 'detached', timeout: 10000 }).catch(() => {});

        T.secao('Crédito à vista anotado por engano: vira 3 vezes na edição');
        const cred = await D.lancarPago(dono, P, { tipo: 'entrada', valor: 279.7, forma: 'credito', categoria: 'Venda de produtos', descricao: 'Venda crédito Camila', chave: D.novaChaveDeOperacao() });
        T.ok('antes: crédito à vista, taxa R$ 9,76', B.sql(`select taxa || '|' || coalesce(parcelas::text, '1') from lancamentos_taxas where lancamento_id='${cred.id}'`) === '9.76|1');
        await N.ir(page, '/gestao/app/financeiro');
        await page.getByRole('button', { name: 'Lançamentos', exact: true }).first().click();
        await page.locator('.g-main .g-linha', { hasText: 'Venda crédito Camila' }).first().click();
        const ed = page.locator('.g-folha').last();
        const vezes = ed.getByLabel('Crédito em quantas vezes');
        await vezes.waitFor({ timeout: 10000 });
        await vezes.selectOption('3');
        await foto(ed, 'editar-credito-1366');
        await ed.getByRole('button', { name: 'Salvar' }).click();
        await page.locator('.g-folha').waitFor({ state: 'detached', timeout: 15000 });
        // 279,70 × 5,29% = 14,80
        T.ok('depois: 3 vezes, taxa do 3x (R$ 14,80)', B.sql(`select taxa || '|' || parcelas from lancamentos_taxas where lancamento_id='${cred.id}'`) === '14.80|3', B.sql(`select taxa || '|' || parcelas from lancamentos_taxas where lancamento_id='${cred.id}'`));

        T.secao('Quanto sobrou: as contas fixas que faltam pagar');
        const perto = Math.min(Number(L.hoje.slice(8, 10)) + 3, 28);
        B.must(await dono.rpc('contas_fixas_salvar', { p: P, p_conta: { id: B.uuid(), nome: 'Imposto (DAS)', categoria: 'Impostos e taxas', dia: perto, valor: 680, valor_varia: true, frequencia: 'mensal', comeca_em: L.mes1 } }), 'DAS');
        await dono.rpc('contas_fixas_gerar', { p: P });
        await N.ir(page, '/gestao/app/relatorios');
        const qs = page.locator('#quanto-sobrou');
        await qs.waitFor({ timeout: 20000 });
        if (perto > Number(L.hoje.slice(8, 10))) {
          await qs.locator('[data-teste="contas-fixas-a-pagar"]').waitFor({ timeout: 15000 });
          const tq = limpo(await qs.innerText());
          T.ok('Quanto sobrou: "Contas fixas do período ainda não pagas", o DAS de R$ 680,00 e o resultado se pagar', /ainda não pagas/i.test(tq) && /Imposto \(DAS\)/.test(tq) && /680,00/.test(tq) && /Se pagar essas contas, o resultado fica/.test(tq), tq.slice(-700));
          await foto(qs, 'quanto-sobrou-1366');
        }
      }
      T.ok(`sem rolagem lateral (${larg})`, (await N.rolagemLateral(page)) <= 0);
      T.ok(`nenhum erro na tela do dono (${larg})`, erros.filter((e) => !/Failed to fetch|fetch failed/.test(e)).length === 0, erros.slice(0, 4));
      await ctx.close();
    }
  }
  await N.fecharNavegador();
}))();
