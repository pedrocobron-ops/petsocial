// Rodada 9 (N5) pela tela, com a recepção (área Caixa, sem Financeiro) e o preço travado com desconto máximo de 10%.
// 390:
//  - Check-out da creche da Mel (diária R$ 70,00): "Valor a receber" 10 → a folha diz o menor valor (R$ 63,00 = 70 − 10%) e o
//    botão apaga ("Valor abaixo do permitido"); com 63, recebe em Dinheiro e o comprovante diz "Pagamento: Dinheiro R$ 63,00"
//    e "Recebido às … por Rita Recepção".
//  - Fechar a conta da Luna (Banho R$ 70,00): desconto de R$ 8,00 (máximo R$ 7,00) → botão "Desconto acima do permitido" e o
//    total mostra R$ 63,00 (o que dá para cobrar), nunca "Receber R$ 62,00".
//  - Faltou do Bob com a taxa de R$ 20,00: um aviso só ("ficou como falta. Taxa de R$ 20,00 anotada") e, recarregando a tela na
//    hora, a taxa está no banco (antes se perdia).
//  - Venda no balcão para a Ana, que deve R$ 119,80 com limite de R$ 150,00: "Ana deve R$ 119,80 · … cabe mais R$ 30,20" assim que
//    é escolhida; o fiado de R$ 34,90 (119,80 + 34,90 = 154,70) é recusado e a frase fica escrita na venda.
//  - Entrada recebida pela recepção: sem "Excluir" (preço travado) e com "Devolver ao cliente"; devolve R$ 20,00 de R$ 50,00.
// 1366 (dona): Caixa depois de uma troca (coleira de 29,99 pelo shampoo de 34,90, diferença de 4,91 em dinheiro): "Entrou hoje"
//  conta só o dinheiro; a linha da troca avisa que R$ 29,99 é o produto trocado. Alterações mostra a devolução e o desconto.
// Em cada tela: nenhum erro de página ou console e sem rolagem para o lado. Capturas em testes/saida/caixa-trava-*.png.
const fs = require('fs');
const path = require('path');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('caixa-trava-recibos-tela');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Trava tela' });
  const { dono, caixa: cx } = L.sb;
  const P = L.P;
  const ch = (s) => `t-${s}-${B.sufixo()}`;
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'dinheiro.preco_travado': true, 'dinheiro.desconto_max_caixa': 10, 'dinheiro.taxa_falta': 20, 'dinheiro.limite_fiado': 150 } }), 'opções');
  const caixaId = B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id').single(), 'caixa').id;
  // Mel na creche (diária da lista: R$ 70,00)
  B.must(await cx.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Mel, tipo: 'creche', status: 'em_casa', entrada: new Date().toISOString(), valor_diaria: 70 }).select('id').single(), 'mel na creche');
  const marca = async (pet, h, preco) => {
    const ini = B.instante(L.hoje, h, L.fuso);
    return B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets[pet], servico_id: L.S.Banho, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco }).select('id').single(), 'horário').id;
  };
  await marca('Luna', '07:30', 70);
  const bob = await marca('Bob', '08:30', 70);
  // Ana deve R$ 119,80 (fiado de venda)
  B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 119.8, forma: null, categoria: 'Venda de produtos', descricao: 'Venda: ração', data: L.dia(-2), vencimento: L.dia(-2), pago: false, cliente_id: L.tutores.Ana, origem: 'tela' }).select('id'), 'fiado da Ana');
  B.must(await dono.from('produtos').update({ preco_venda: 34.9 }).eq('id', L.prod).select('id'), 'preço do shampoo');
  // um recebimento de serviço lançado pela recepção, no caixa aberto: R$ 50,00 no débito
  B.must(await cx.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 50, forma: 'debito', categoria: 'Banho e tosa', descricao: 'Banho avulso Rex', data: L.hoje, pago: true, origem: 'tela', cliente_id: L.tutores.Davi, caixa_id: caixaId }).select('id'), 'recebimento');

  const saida = path.join(__dirname, '..', 'saida');
  fs.mkdirSync(saida, { recursive: true });
  const foto = (page, nome, cheia = false) => page.screenshot({ path: path.join(saida, `caixa-trava-${nome}.png`), fullPage: cheia }).catch(() => {});
  const semErros = (onde, erros, ignorar = null) => { const l = ignorar ? erros.filter((e) => !ignorar.test(e)) : erros; T.ok(`${onde}: nenhum erro de página, console ou pedido recusado`, l.length === 0, l.slice(0, 4)); erros.length = 0; };
  const semLado = async (onde, page) => { const x = await N.rolagemLateral(page); T.ok(`${onde}: sem rolagem para o lado`, x <= 0, `${x}px`); };
  const txt = async (l) => (await l.innerText()).replace(/ /g, ' ');
  const zap = async (l) => decodeURIComponent(((await l.getAttribute('href')) ?? '').split('text=')[1] ?? '').replace(/ /g, ' ');

  let { ctx, page, erros } = await N.contexto(390, 844);
  ctx.on('page', (p) => { if (p !== page) void p.close().catch(() => {}); });
  await N.entrar(page, L.emails.caixa, L.senha);

  T.secao('390: check-out da creche com o preço travado');
  await N.ir(page, '/gestao/app/creche-hotel?ver=casa');
  await page.locator('.g-ch-cartao', { hasText: 'Mel' }).first().locator('button', { hasText: 'Check-out' }).click();
  let folha = page.locator('.g-folha').last();
  await folha.locator('button.g-btn.pri', { hasText: 'Receber R$ 70,00' }).waitFor({ timeout: 20000 });
  T.ok('a folha avisa do preço travado e do desconto que o caixa pode dar (R$ 7,00)', /Preço travado: você pode dar até 10% de desconto \(R\$ 7,00 nesta conta\)/.test(await txt(folha)), (await txt(folha)).match(/Preço travado[^\n]*/)?.[0]);
  const campoValor = folha.locator('.g-campo', { hasText: 'Valor a receber' }).locator('input').first();
  await campoValor.fill('10');
  await page.waitForTimeout(400);
  let botao = folha.locator('button.g-btn.pri');
  T.ok('R$ 10,00 numa conta de R$ 70,00: botão apagado, "Valor abaixo do permitido"', (await botao.isDisabled()) && /Valor abaixo do permitido/.test(await txt(botao)), await txt(botao));
  T.ok('… e a folha diz o menor valor: R$ 63,00', /menor valor que o caixa recebe nesta conta é R\$ 63,00 \(desconto de até 10%\)/.test(await txt(folha)), (await txt(folha)).match(/menor valor[^\n]*/)?.[0]);
  await campoValor.scrollIntoViewIfNeeded();
  await foto(page, 'checkout-abaixo-390');
  await semLado('Check-out travado 390', page);
  await campoValor.fill('63');
  await folha.locator('button.g-btn.pri', { hasText: 'Receber R$ 63,00' }).waitFor({ timeout: 5000 });
  await folha.locator('.g-chips button, button.g-chip', { hasText: 'Dinheiro' }).first().click();
  await page.waitForTimeout(300);
  await folha.locator('button.g-btn.pri', { hasText: 'Receber R$ 63,00' }).click();
  let fechada = page.locator('.g-folha', { hasText: 'Conta fechada' }).last();
  await fechada.waitFor({ timeout: 20000 });
  let recibo = await zap(fechada.locator('a', { hasText: 'Mandar comprovante' }));
  T.ok('comprovante: "Pagamento: Dinheiro R$ 63,00" (com o valor) e "Recebido às … por Rita Recepção"', /Pagamento: Dinheiro R\$ 63,00/.test(recibo) && /Recebido às \d{2}:\d{2} por Rita Recepção/.test(recibo), recibo);
  T.ok('a estadia ficou com R$ 63,00 e o desconto foi para Alterações (de 70,00 para 63,00)', B.sql(`select valor_cobrado from estadias where petshop_id='${P}' and pet_id='${L.pets.Mel}'`) === '63.00'
    && B.sql(`select de || '>' || para from precos_alterados where petshop_id='${P}' and tipo='checkout'`) === '70.00>63.00');
  await foto(page, 'checkout-fechada-390');
  await fechada.getByRole('button', { name: 'Pronto' }).click();
  semErros('Check-out 390', erros);

  T.secao('390: desconto acima do que o caixa pode dar');
  await N.ir(page, `/gestao/app/agenda?dia=${L.hoje}`);
  await page.locator('.g-hora-grupo, .g-ag', { hasText: 'Luna' }).first().click();
  await page.locator('.g-folha').last().locator('button', { hasText: 'Fechar a conta' }).click({ timeout: 15000 });
  let conta = page.locator('.g-folha').last();
  await conta.locator('button.g-btn.pri', { hasText: 'Receber R$ 70,00' }).waitFor({ timeout: 15000 });
  await conta.locator('input[aria-label="Desconto em reais"]').fill('8');
  await page.waitForTimeout(400);
  botao = conta.locator('button.g-btn.pri');
  T.ok('desconto de R$ 8,00 (máximo R$ 7,00): botão apagado, "Desconto acima do permitido" (nunca "Receber R$ 62,00")', (await botao.isDisabled()) && /Desconto acima do permitido/.test(await txt(botao)) && !/62,00/.test(await txt(botao)), await txt(botao));
  const total = await txt(conta.locator('.g-vd-total'));
  T.ok('o total mostra o que dá para cobrar: R$ 63,00, "com o desconto que você pode dar"', /Total com o desconto que você pode dar/i.test(total) && /R\$ 63,00/.test(total) && !/62,00/.test(total), total);
  T.ok('o campo do desconto fica marcado', (await conta.locator('input[aria-label="Desconto em reais"]').getAttribute('aria-invalid')) === 'true');
  await conta.locator('.g-vd-total').scrollIntoViewIfNeeded();
  await foto(page, 'desconto-acima-390');
  await semLado('Desconto acima 390', page);
  await conta.locator('input[aria-label="Desconto em reais"]').fill('7');
  await conta.locator('button.g-btn.pri', { hasText: 'Receber R$ 63,00' }).waitFor({ timeout: 5000 });
  T.ok('com R$ 7,00 (o máximo) o botão volta: Receber R$ 63,00', true);
  await conta.getByRole('button', { name: 'Voltar' }).click();
  semErros('Desconto 390', erros);

  T.secao('390: falta com a taxa numa gravação só');
  await N.ir(page, `/gestao/app/agenda?dia=${L.hoje}`);
  await page.locator('.g-hora-grupo, .g-ag', { hasText: 'Bob' }).first().click();
  let det = page.locator('.g-folha').last();
  await det.locator('button', { hasText: 'Faltou' }).first().click({ timeout: 15000 });
  const dialogo = page.locator('[role="alertdialog"], [role="dialog"], .g-confirma').filter({ hasText: 'Anotar a taxa de falta de R$ 20,00?' }).last();
  await dialogo.waitFor({ timeout: 10000 });
  T.ok('a pergunta da taxa vem ANTES de gravar: o horário ainda não está como falta', B.sql(`select status from agendamentos where id='${bob}'`) !== 'faltou');
  await dialogo.getByRole('button', { name: 'Anotar a taxa' }).click();
  const aviso = page.locator('.g-toast', { hasText: 'ficou como falta' }).last();
  await aviso.waitFor({ timeout: 15000 });
  T.ok('um aviso só: "Bob ficou como falta. Taxa de R$ 20,00 anotada para Beto."', /Bob ficou como falta\. Taxa de R\$ 20,00 anotada para Beto\./.test(await txt(aviso)), await txt(aviso));
  // recarrega na hora (era aqui que a taxa se perdia)
  await page.reload();
  const taxa = B.sql(`select count(*) || '|' || coalesce(sum(valor), 0) from lancamentos where petshop_id='${P}' and cliente_id='${L.tutores.Beto}' and not pago and descricao like 'Taxa de falta%'`);
  T.ok('recarregando a tela em seguida, a falta e a taxa de R$ 20,00 estão gravadas', B.sql(`select status from agendamentos where id='${bob}'`) === 'faltou' && taxa === '1|20.00', taxa);
  erros.length = 0;

  T.secao('390: venda no balcão mostra o que o tutor deve; a recusa do limite fica escrita');
  await N.ir(page, '/gestao/app/caixa');
  await page.getByRole('button', { name: 'Venda no balcão' }).first().click();
  let vd = page.locator('.g-folha').last();
  await vd.getByLabel('Buscar produto').fill('Shampoo');
  await vd.locator('.g-vd-achados button', { hasText: 'Shampoo Neutro' }).click({ timeout: 15000 });
  await vd.getByRole('button', { name: /Dizer quem comprou/ }).click();
  await vd.getByLabel('Buscar tutor pelo nome').fill('Ana');
  await vd.locator('.g-vd-achados button', { hasText: 'Ana Souza' }).click({ timeout: 10000 });
  const deve = vd.locator('.g-vd-fiado');
  await deve.waitFor({ timeout: 15000 });
  T.ok('assim que a Ana é escolhida: "Ana deve R$ 119,80 · limite de fiado R$ 150,00, cabe mais R$ 30,20"', /Ana deve R\$ 119,80 · limite de fiado R\$ 150,00, cabe mais R\$ 30,20/.test(await txt(deve)), await txt(deve));
  await vd.getByText('Cliente paga depois').first().click();
  await page.waitForTimeout(400);
  await vd.getByRole('button', { name: /^Anotar R\$ 34,90/ }).click();
  const erroFiado = vd.locator('#g-vd-erro-fiado');
  await erroFiado.waitFor({ timeout: 15000 });
  T.ok('fiado de R$ 34,90 (119,80 + 34,90 = 154,70 > 150,00): a frase fica escrita na venda', /Ana já deve R\$ 119,80; com esta conta passa do limite de R\$ 150,00\./.test(await txt(erroFiado)) && /dono ou quem cuida do financeiro/.test(await txt(erroFiado)), await txt(erroFiado));
  await page.waitForTimeout(6500);
  T.ok('… e continua lá depois que o aviso some', await erroFiado.isVisible());
  T.ok('nada foi anotado (a Ana continua devendo R$ 119,80)', B.sql(`select coalesce(sum(valor),0) from lancamentos where petshop_id='${P}' and cliente_id='${L.tutores.Ana}' and not pago`) === '119.80');
  await erroFiado.scrollIntoViewIfNeeded();
  await foto(page, 'fiado-recusado-390');
  await semLado('Venda com fiado recusado 390', page);
  await vd.getByRole('button', { name: 'Voltar' }).click();
  semErros('Venda 390', erros, /HTTP 4\d\d POST .*rest\/v1\/rpc\/fiado/);

  T.secao('390: valor recebido com o preço travado: sem Excluir, com Devolver ao cliente');
  await N.ir(page, '/gestao/app/caixa');
  await page.locator('button.g-linha', { hasText: 'Banho avulso Rex' }).first().click();
  let ed = page.locator('.g-folha').last();
  await ed.getByRole('button', { name: 'Devolver ao cliente' }).waitFor({ timeout: 15000 });
  T.ok('a recepção não vê Excluir, e a folha explica', (await ed.getByRole('button', { name: 'Excluir' }).count()) === 0 && /Com o preço travado, só o dono ou quem vê o financeiro apaga ou baixa um valor já recebido/.test(await txt(ed)), (await txt(ed)).slice(0, 300));
  await foto(page, 'entrada-travada-390');
  await ed.getByRole('button', { name: 'Devolver ao cliente' }).click();
  let dv = page.locator('.g-folha', { hasText: 'Quanto volta para o cliente' }).last();
  await dv.getByRole('button', { name: 'Devolver R$ 50,00' }).waitFor({ timeout: 15000 });
  await dv.locator('input[aria-label="Quanto volta para o cliente"]').fill('20');
  await dv.locator('.g-chips button, button.g-chip', { hasText: 'Pix' }).first().click();
  await dv.getByRole('button', { name: 'Devolver R$ 20,00' }).click();
  const devolvido = page.locator('.g-folha', { hasText: 'Valor devolvido' }).last();
  await devolvido.waitFor({ timeout: 15000 });
  recibo = await zap(devolvido.locator('a', { hasText: 'Mandar comprovante' }));
  T.ok('comprovante da devolução: "Devolvido ao cliente: R$ 20,00 (Pix)" e quem devolveu', /comprovante da devolução/.test(recibo) && /Devolvido ao cliente: R\$ 20,00 \(Pix\)/.test(recibo) && /Devolvido às \d{2}:\d{2} por Rita Recepção/.test(recibo), recibo);
  T.ok('no banco: saída "Devolução" de R$ 20,00 ligada à entrada de R$ 50,00', B.sql(`select d.valor || '|' || d.categoria || '|' || e.valor from lancamentos d join lancamentos e on e.id = d.devolucao_de where d.petshop_id='${P}'`) === '20.00|Devolução|50.00');
  await foto(page, 'devolvido-390');
  await semLado('Valor devolvido 390', page);
  await devolvido.getByRole('button', { name: 'Pronto' }).click();
  semErros('Devolver ao cliente 390', erros);
  await ctx.close();

  // a troca, pela função (o que a folha de Troca ou devolução chama): coleira de 29,99 pelo shampoo de 34,90
  const coleira = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Coleira M', unidade: 'un', preco_venda: 29.99, custo: 10, estoque: 5 }).select('id').single(), 'coleira').id;
  const venda = B.must(await cx.rpc('venda_registrar', { p_petshop: P, p_chave: ch('venda'), p_passos: [
    { t: 'lancamento', nome: 'venda', linha: { tipo: 'entrada', valor: 29.99, forma: 'dinheiro', categoria: 'Venda de produtos', descricao: 'Venda: 1 Coleira M', pago: true, data: L.hoje, itens: [{ tipo: 'produto', nome: 'Coleira M', qtd: 1, valor: 29.99, produto_id: coleira }] } },
    { t: 'estoque', linhas: [{ produto_id: coleira, quantidade: 1, lancamento_id: '$ref:venda' }] },
  ] }), 'venda').ids.venda;
  B.must(await cx.rpc('venda_devolver', { p_petshop: P, p_chave: ch('troca'), p_venda: venda, p_itens: [{ produto_id: coleira, qtd: 1, avariados: 0 }], p_modo: 'troca', p_forma: 'dinheiro', p_novos: [{ produto_id: L.prod, qtd: 1 }] }), 'troca');

  T.secao('1366: o Caixa conta só o dinheiro da troca');
  ({ ctx, page, erros } = await N.contexto(1366, 768));
  ctx.on('page', (p) => { if (p !== page) void p.close().catch(() => {}); });
  await N.entrar(page, L.emails.dono, L.senha);
  await N.ir(page, '/gestao/app/caixa');
  await page.locator('.g-linha', { hasText: 'Troca:' }).first().waitFor({ timeout: 20000 });
  const tela = await txt(page.locator('.g-main'));
  // dinheiro de verdade que entrou hoje: creche 63,00 + banho avulso 50,00 + coleira 29,99 + diferença da troca 4,91 = 147,90
  // (com o produto trocado contado como dinheiro seriam 177,89)
  T.ok('"Recebido hoje" = R$ 147,90 (63,00 + 50,00 + 29,99 + 4,91), sem os R$ 29,99 do produto trocado', /R\$ 147,90/.test(tela) && !/177,89/.test(tela), tela.match(/Recebido hoje[^\n]*\n[^\n]*/g));
  // saiu: devolução de 20,00 (a devolução da troca, de 29,99, é só produto)
  T.ok('"Saiu hoje" = R$ 20,00 (a devolução em Pix), sem os R$ 29,99 da troca', /Saiu hoje[^\n]*\n?[^\n]*R\$ 20,00/.test(tela) && !/49,99/.test(tela), tela.match(/Saiu hoje[^\n]*\n[^\n]*/g));
  const linhaTroca = await txt(page.locator('.g-linha', { hasText: 'Troca: 1 Shampoo' }).first());
  T.ok('a linha da troca avisa: "R$ 29,99 é o produto trocado, não é dinheiro"', /R\$ 29,99 é o produto trocado, não é dinheiro/.test(linhaTroca), linhaTroca);
  await foto(page, 'caixa-troca-1366', true);
  await semLado('Caixa 1366', page);
  semErros('Caixa 1366', erros);

  T.secao('1366: Alterações em valores mostra o desconto do check-out, a devolução e a troca');
  const alt = B.must(await dono.rpc('alteracoes_de_valores', { p: P, p_todas: true }), 'alterações');
  const tipos = alt.map((x) => x.tipo).sort().join(',');
  T.ok('o dono lê: 1 check-out abaixo da conta e 2 devoluções (a de R$ 20,00 e a troca), com o nome da recepção', alt.filter((x) => x.tipo === 'checkout').length === 1 && alt.filter((x) => x.tipo === 'devolucao').length === 2 && alt.every((x) => x.quem_nome === 'Rita Recepção'), tipos);
  await N.ir(page, '/gestao/app');
  const avisoAlt = page.locator('button, a', { hasText: /alteraç(ão|ões) em valores/i }).first();
  if (await avisoAlt.count()) {
    await avisoAlt.click();
    const lista = page.locator('.g-folha').last();
    await lista.waitFor({ timeout: 10000 });
    const t2 = await txt(lista);
    T.ok('na tela Hoje, a lista diz "cobrou abaixo da conta" e "fez uma devolução"', /cobrou abaixo da conta: Creche de Mel/.test(t2) && /fez uma devolução/.test(t2), t2.slice(0, 500));
    await foto(page, 'alteracoes-1366');
  } else T.ok('o aviso de alterações em valores aparece na tela Hoje', false, 'aviso não encontrado');
  semErros('Hoje 1366', erros);
  await ctx.close();
}))();
