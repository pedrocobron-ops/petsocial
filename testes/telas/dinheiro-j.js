// Rodada 8 (J), pela tela, com a dona (Sandra, "completa"):
// 390: Caixa › Venda no balcão para a Ana, que tem R$ 50,00 de crédito: aparece Crédito do tutor (Sandra M2: antes não aparecia),
//      o Shampoo de R$ 29,90 sai do crédito ("Pagar com o crédito"), e a folha Venda anotada mostra Mandar comprovante (o texto
//      diz "comprovante da compra" e "Crédito do tutor") e Imprimir comprovante (M5). O saldo fica R$ 20,10.
//      Contas de clientes: a Ana deve R$ 100,00 vencido e R$ 900,00 de mensalidade a vencer; o limite de R$ 300,00 conta só os
//      R$ 100,00 (antes: "passou R$ 700,00 do limite") e a linha diz o vencido e o a vencer (H2).
// 1366: Relatórios › Produtos depois de uma devolução: o Shampoo aparece com 2 un (3 vendidos − 1) e "1 voltou" (H1); Contas de clientes.
// 1366: Baixar todos os dados: vendas.csv com desconto, total cobrado, devolução e "Crédito do tutor" na forma; crédito dos tutores;
//       lotes e validade em produtos.csv e movimentos-de-estoque.csv; "Entra no resultado" em lancamentos.csv (M4).
// Em cada tela: nenhum erro de página ou console e sem rolagem para o lado. Capturas em testes/saida/dinheiro-j-*.png.
const fs = require('fs');
const path = require('path');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('dinheiro-j-tela');
const D = lib('dinheiro'), DV = lib('devolucao'), TN = lib('tudo-ou-nada');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Dinheiro J tela', modulos: ['banho_tosa', 'creche', 'loja'] });
  const { dono } = L.sb;
  const P = L.P, ana = L.tutores.Ana;
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 50 }).select('id'), 'caixa');
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'loja.margem': true } }), 'margem');
  B.must(await dono.rpc('credito_do_tutor_mover', { p_petshop: P, p_cliente: ana, p_valor: 50, p_motivo: 'Sinal da reserva cancelada', p_chave: D.novaChaveDeOperacao() }), 'crédito');
  B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 900, categoria: 'Creche: mensalidade', descricao: 'Mensalidade · Thor', data: L.dia(10), vencimento: L.dia(10), pago: false, cliente_id: ana, origem: 'tela' }).select('id'), 'mensalidade');
  B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 100, categoria: 'Banho e tosa', descricao: 'Banho de antes', data: L.dia(-3), vencimento: L.dia(-3), pago: false, cliente_id: ana, origem: 'tela' }).select('id'), 'vencida');
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'dinheiro.limite_fiado': 300 } }), 'limite 300');
  // uma venda de 2 Shampoo com 1 devolvido (para o relatório de produtos)
  const ch = D.novaChaveDeOperacao();
  const v = await TN.fazerTudoOuNada(dono, P, ch, { funcao: 'venda_registrar' }, [
    { t: 'lancamento', nome: 'venda', chave: ch, linha: { tipo: 'entrada', valor: 59.8, forma: 'pix', categoria: 'Venda de produtos', cliente_id: L.tutores.Beto, pago: true, data: L.hoje, descricao: 'Venda', itens: [{ tipo: 'produto', nome: 'Shampoo Neutro', qtd: 2, valor: 29.9, produto_id: L.prod }] } },
    TN.passoDoEstoque([{ produtoId: L.prod, qtd: 2 }], ch, TN.ref('venda')),
  ]);
  await DV.devolver(dono, P, { venda: v.ids.venda, itens: [{ produto_id: L.prod, qtd: 1 }], modo: 'dinheiro', forma: 'pix', chave: D.novaChaveDeOperacao() });
  // dois lotes da mesma ração (como a planilha do distribuidor): para a cópia trazer lote e validade
  const racao = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Ração Golden', unidade: 'saco', preco_venda: 189.9, custo: 132.5, controla_validade: true }).select('id').single(), 'ração').id;
  for (const [lote, validade, q] of [['L2401', '2027-05-31', 10], ['L2410', '2027-08-31', 4]]) {
    await D.gravarMovimentos(dono, P, [{ petshop_id: P, produto_id: racao, tipo: 'entrada', quantidade: q, motivo: 'Saldo trazido da planilha', custo_unitario: 132.5, lote, validade, chave: D.novaChaveDeOperacao() }]);
  }

  const saida = path.join(__dirname, '..', 'saida');
  fs.mkdirSync(saida, { recursive: true });
  const foto = (page, nome, cheia = false) => page.screenshot({ path: path.join(saida, `dinheiro-j-${nome}.png`), fullPage: cheia }).catch(() => {});
  const semErros = (onde, erros) => { T.ok(`${onde}: nenhum erro de página, console ou pedido recusado`, erros.length === 0, erros); erros.length = 0; };
  const semLado = async (onde, page) => { const x = await N.rolagemLateral(page); T.ok(`${onde}: sem rolagem para o lado`, x <= 0, `${x}px`); };
  const txt = async (l) => (await l.innerText()).replace(/ /g, ' ');

  const { ctx, page, erros } = await N.contexto(390, 844);
  ctx.on('page', (p) => { if (p !== page) void p.close().catch(() => {}); });
  await N.entrar(page, L.emails.dono, L.senha);

  T.secao('390: venda no balcão paga com o crédito do tutor, com comprovante');
  await N.ir(page, '/gestao/app/caixa');
  await page.getByRole('button', { name: 'Venda no balcão' }).first().click();
  const vd = page.locator('.g-folha').last();
  await vd.getByLabel('Buscar produto').fill('Shampoo');
  await vd.locator('.g-vd-achados button', { hasText: 'Shampoo Neutro' }).click({ timeout: 15000 });
  await vd.getByRole('button', { name: /Dizer quem comprou/ }).click();
  await vd.getByLabel('Buscar tutor pelo nome').fill('Ana');
  await vd.locator('.g-vd-achados button', { hasText: 'Ana Souza' }).click({ timeout: 10000 });
  await vd.getByText('Crédito do tutor: R$ 50,00').waitFor({ timeout: 15000 });
  T.ok('aparece Crédito do tutor: R$ 50,00 com Usar o crédito marcado', await vd.locator('.g-agd-junto input[type=checkbox]').isChecked());
  await foto(page, 'balcao-credito-390');
  await semLado('Venda com crédito 390', page);
  await vd.getByRole('button', { name: 'Pagar com o crédito' }).click({ timeout: 5000 });
  const feita = page.locator('.g-folha', { hasText: 'Venda anotada' }).last();
  await feita.waitFor({ timeout: 15000 });
  const href = decodeURIComponent(((await feita.locator('a', { hasText: 'Mandar comprovante' }).getAttribute('href')) ?? '').split('text=')[1] ?? '').replace(/ /g, ' ');
  T.ok('Mandar comprovante: "comprovante da compra", Shampoo, total e Crédito do tutor', /comprovante da compra/.test(href) && /Shampoo Neutro: R\$ 29,90/.test(href) && /Total: R\$ 29,90/.test(href) && /Crédito do tutor/.test(href), href);
  T.ok('… e Imprimir comprovante', await feita.getByRole('button', { name: 'Imprimir comprovante' }).isVisible());
  await foto(page, 'balcao-comprovante-390');
  await feita.getByRole('button', { name: 'Pronto' }).click();
  const saldo = Number(B.must(await dono.rpc('credito_saldo', { p_petshop: P, p_cliente: ana }), 'saldo'));
  T.ok('o crédito da Ana fica R$ 20,10', saldo === 20.1, saldo);
  semErros('Venda no balcão 390', erros);

  T.secao('390: Contas de clientes separa o vencido do a vencer; o limite conta só o que é devido agora');
  await N.ir(page, '/gestao/app/caixa');
  const cc = page.locator('#contas-clientes');
  await cc.getByText('Ana Souza').first().waitFor({ timeout: 15000 });
  const t1 = await txt(cc);
  T.ok('"R$ 100,00 vencido · R$ 900,00 a vencer"', /R\$ 100,00 vencido · R\$ 900,00 a vencer/.test(t1), t1.slice(0, 700));
  T.ok('limite: "cabe mais R$ 200,00", sem a mensalidade que ainda não venceu (antes: passou R$ 700,00)', /Limite R\$ 300,00 · cabe mais R\$ 200,00 \(sem R\$ 900,00 de mensalidade ou sinal que ainda não venceram\)/.test(t1) && !/passou/.test(t1), t1.slice(0, 700));
  const venceu = B.sql(`select to_char('${L.dia(-3)}'::date, 'DD/MM')`);
  T.ok(`o cabeçalho diz "venceu em ${venceu}" (o vencimento, não o dia em que a conta foi anotada)`, t1.includes(`2 contas · venceu em ${venceu}`), t1.slice(0, 400));
  await cc.scrollIntoViewIfNeeded();
  await foto(page, 'contas-clientes-390');
  await semLado('Contas de clientes 390', page);
  semErros('Caixa 390', erros);
  await ctx.close();

  T.secao('1366: Relatórios › Produtos sem o que voltou');
  const g = await N.contexto(1366, 768);
  await N.entrar(g.page, L.emails.dono, L.senha);
  await N.ir(g.page, '/gestao/app/relatorios');
  const pr = g.page.locator('#produtos');
  await pr.getByText('Shampoo Neutro').first().waitFor({ timeout: 20000 });
  const t2 = await txt(pr);
  // vendidos hoje: 2 (venda do Beto) + 1 (balcão com o crédito da Ana) = 3; voltou 1 → 2 un, R$ 59,80 (antes: 3 un, R$ 89,70)
  T.ok('Shampoo Neutro: 2 un e R$ 59,80, com "1 voltou (R$ 29,90)" e "já sem R$ 29,90 devolvidos"', /Shampoo Neutro · 1 voltou \(R\$ 29,90\)\s*2 un\s*R\$ 59,80/.test(t2) && /já sem R\$ 29,90 devolvidos/.test(t2), t2.slice(0, 900));
  await pr.scrollIntoViewIfNeeded();
  await foto(g.page, 'relatorio-produtos-1366');
  await semLado('Relatórios 1366', g.page);
  await N.ir(g.page, '/gestao/app/caixa');
  await g.page.locator('#contas-clientes').getByText('Ana Souza').first().waitFor({ timeout: 15000 });
  await g.page.locator('#contas-clientes').scrollIntoViewIfNeeded();
  await foto(g.page, 'contas-clientes-1366');
  await semLado('Caixa 1366', g.page);
  T.secao('1366: a cópia completa serve para o contador (M4)');
  await N.ir(g.page, '/gestao/app/meu-petshop#encerrar-conta');
  const grupo = g.page.locator('#grupo-copia');
  await grupo.waitFor({ timeout: 15000 });
  const [dl] = await Promise.all([g.page.waitForEvent('download', { timeout: 60000 }), grupo.getByRole('button', { name: 'Baixar todos os dados' }).click()]);
  const zipArq = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'dinheiro-j-')), dl.suggestedFilename());
  await dl.saveAs(zipArq);
  const z = JSON.parse(require('child_process').execFileSync('python3', ['-I', '-c', 'import sys, zipfile, json\nz = zipfile.ZipFile(sys.argv[1])\nprint(json.dumps({n: z.read(n).decode("utf-8") for n in z.namelist()}, ensure_ascii=False))', zipArq]).toString());
  const vendas = (z['vendas.csv'] ?? '').replace(/^﻿/, '').split(/\r?\n/);
  const cab = vendas[0].split(';');
  const linhaCredito = vendas.find((l) => l.includes('Shampoo Neutro') && l.includes('Crédito do tutor')) ?? '';
  const linhaDev = vendas.find((l) => /dinheiro devolvido/.test(l)) ?? '';
  T.ok('vendas.csv: colunas Desconto no item, Total cobrado, Vencimento e Devolvido', ['Desconto no item', 'Total cobrado', 'Vencimento', 'Devolvido (quantidade)', 'Devolvido (valor)', 'Devolução'].every((c) => cab.some((x) => x.replace(/"/g, '') === c)), cab);
  T.ok('… a venda paga com crédito diz "Crédito do tutor R$ 29,90" na forma', Boolean(linhaCredito), vendas.slice(0, 6));
  T.ok('… a venda com devolução diz o que voltou ("1 em … (dinheiro devolvido)", R$ 29,90)', /29,90/.test(linhaDev) && /1 em \d{2}\/\d{2}\/\d{4} \(dinheiro devolvido\)/.test(linhaDev), linhaDev);
  const cred = (z['creditos-dos-tutores.csv'] ?? '').replace(/^﻿/, '');
  T.ok('creditos-dos-tutores.csv: a Ana ficou com 50,00 e usou 29,90 (saldo 20,10)', /Ana Souza;Ficou de crédito;50,00;50,00/.test(cred.replace(/"/g, '')) && /Ana Souza;Usou o crédito;-29,90;20,10/.test(cred.replace(/"/g, '')), cred.slice(0, 400));
  const prods = (z['produtos.csv'] ?? '').replace(/"/g, '');
  T.ok('produtos.csv: a ração com os dois lotes ("lote L2401, validade 31/05/2027: 10 | lote L2410, validade 31/08/2027: 4")', prods.includes('lote L2401, validade 31/05/2027: 10 | lote L2410, validade 31/08/2027: 4'), prods.split(/\r?\n/).find((l) => l.includes('Ração')));
  const movs = (z['movimentos-de-estoque.csv'] ?? '').replace(/"/g, '');
  T.ok('movimentos-de-estoque.csv: cada entrada com o lote e a validade', movs.includes('lote L2410, validade 31/08/2027: 4'), movs.split(/\r?\n/).filter((l) => l.includes('Ração')));
  const lanc = (z['lancamentos.csv'] ?? '').replace(/^﻿/, '').split(/\r?\n/)[0];
  T.ok('lancamentos.csv: coluna Entra no resultado', /Entra no resultado/.test(lanc), lanc);
  semErros('1366', g.erros);
  await g.ctx.close();
}))();
