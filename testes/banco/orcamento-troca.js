// Orçamento, troca e devolução de produto e limite de fiado (migração 20261200), pela API com o login de cada papel e pelo
// mesmo código das telas (orcamento.ts, devolucao.ts, fiado.ts, tudo-ou-nada.ts, dinheiro.ts, lucro.ts). Contas à mão:
// - orçamento: 2 × 29,90 + Banho 60,00 − 9,80 = 110,00 (o total que a tela manda é ignorado); estoque não mexe; quem não
//   mexe com dinheiro não lê; página pública só pelo código; vencido pela validade; "Transformar em venda" com dois toques
//   ao mesmo tempo vira UMA venda (estoque −2 uma vez) e o orçamento fica convertido (outra chave: recusada);
// - devolução: venda de 3 × 29,90 com 9,70 de desconto = 80,00. Volta 1: 80 × 1/3 = 26,67 em dinheiro (saída "Devolução"
//   no caixa); dois toques = uma vez; volta o resto (2, um avariado): 80,00 − 26,67 = 53,33 de crédito para a Ana; mais
//   que isso, recusado. Estoque: +1, +2 e −1 (perda). Troca: 29,90 por uma coleira de 45,00 = paga 15,10 no Pix (saída 29,90
//   "outro" + entrada 45,00 = 29,90 "outro" + 15,10 Pix); troca por um laço de 5,00 = volta 24,90 em dinheiro;
// - relatórios: faturamento = entradas − devolvido − crédito deixado (lucro_do_periodo = faturamento.ts), devoluções por
//   produto com o custo que voltou; comissão sobre produto (10%) da conta do atendimento: 2,99 → 0,00 depois da devolução;
// - fiado: limite da Ana 200; deve 180; mais 30 recusado com a frase; a recepção não libera nem muda o limite; o dono libera
//   (anotado), passa uma vez; pagamento na hora nunca é barrado; padrão da loja vale para quem não tem limite próprio.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('orcamento-troca');
const D = lib('dinheiro'), O = lib('orcamento'), DV = lib('devolucao'), FI = lib('fiado'), TN = lib('tudo-ou-nada'), LU = lib('lucro');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Orçamento' });
  const { dono, caixa: cx, tosador: tos, estoque: est } = L.sb;
  const P = L.P, prod = L.prod;
  const saldo = (id) => B.num(`select estoque from produtos where id='${id}'`);
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'abrir o caixa');
  const coleira = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Coleira', unidade: 'un', preco_venda: 45, custo: 20, estoque: 5 }).select('id').single(), 'coleira').id;
  const laco = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Laço', unidade: 'un', preco_venda: 5, custo: 1, estoque: 10 }).select('id').single(), 'laço').id;

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('orçamento: conta do banco, papéis, estoque');
  const e0 = saldo(prod);
  const itens = [
    { tipo: 'produto', nome: 'Shampoo Neutro', qtd: 2, valor: 29.9, produto_id: prod },
    { tipo: 'servico', nome: 'Banho', qtd: 1, valor: 60, servico_id: L.S.Banho },
  ];
  const conta = O.contaDoOrcamento(itens, 9.8);
  T.ok('a tela faz 59,80 + 60,00 − 9,80 = 110,00', conta.subtotal === 119.8 && conta.total === 110, conta);
  const orc = B.must(await cx.from('orcamentos').insert({ petshop_id: P, cliente_id: L.tutores.Ana, itens, desconto: 9.8, validade: L.dia(7), subtotal: 1, total: 1, chave: D.novaChaveDeOperacao() })
    .select('id, numero, subtotal, desconto, total, token, status').single(), 'recepção cria o orçamento');
  T.ok('o banco guarda 119,80 − 9,80 = 110,00 (o total mandado pela tela é ignorado)', Number(orc.subtotal) === 119.8 && Number(orc.total) === 110, orc);
  T.ok('número 1, aberto, com código de 48 letras', orc.numero === 1 && orc.status === 'aberto' && /^[0-9a-f]{48}$/.test(orc.token), orc);
  T.ok('o estoque não mexe com o orçamento', saldo(prod) === e0);
  T.recusa('desconto maior que a soma é recusado', await cx.from('orcamentos').insert({ petshop_id: P, itens, desconto: 200, validade: L.dia(7) }).select('id'), /desconto/);
  T.recusa('produto de outro pet shop é recusado', await cx.from('orcamentos').insert({ petshop_id: P, itens: [{ tipo: 'produto', nome: 'X', qtd: 1, valor: 1, produto_id: B.uuid() }], validade: L.dia(7) }).select('id'), /não está/);
  const tLe = await tos.from('orcamentos').select('id').eq('petshop_id', P);
  T.ok('o tosador não lê orçamentos', !tLe.error && tLe.data.length === 0, tLe.error?.message ?? tLe.data);
  T.recusa('o tosador não cria orçamento', await tos.from('orcamentos').insert({ petshop_id: P, itens, validade: L.dia(7) }).select('id'));
  T.recusa('o estoque não cria orçamento', await est.from('orcamentos').insert({ petshop_id: P, itens, validade: L.dia(7) }).select('id'));
  const orc2 = B.must(await dono.from('orcamentos').insert({ petshop_id: P, nome: 'Paula', itens: [itens[0]], validade: L.dia(3) }).select('id, numero').single(), 'dono cria outro');
  T.ok('o segundo orçamento é o nº 2', orc2.numero === 2);
  T.recusa('ninguém marca "convertido" direto', await cx.from('orcamentos').update({ status: 'convertido' }).eq('id', orc.id).select('id'), /Transformar em venda/);
  T.passa('a recepção marca como aceito', await cx.from('orcamentos').update({ status: 'aceito' }).eq('id', orc.id).select('id'));

  T.secao('orçamento: página pública');
  const anon = B.cliente(B.ipAleatorio());
  const pub = B.must(await anon.rpc('orcamento_publico', { p_token: orc.token }), 'público');
  T.ok('sem login: loja, itens, total 110,00, aceito, para Ana', pub && pub.petshop?.nome && pub.itens.length === 2 && Number(pub.total) === 110 && pub.status === 'aceito' && pub.para === 'Ana', pub);
  T.ok('… sem telefone nem id do cliente, sem ids de produto', !JSON.stringify(pub).includes(L.tutores.Ana) && !JSON.stringify(pub).includes(prod) && !JSON.stringify(pub).includes('988880001'));
  T.ok('código errado não devolve nada', (await anon.rpc('orcamento_publico', { p_token: 'a'.repeat(48) })).data == null);
  T.recusa('anônimo não lê a tabela', await anon.from('orcamentos').select('id').eq('id', orc.id).then((r) => (r.data?.length ? r : { error: { message: 'vazio' } })));
  B.sql(`update orcamentos set validade = current_date - 1 where id='${orc2.id}'`);
  const tok2 = B.sql(`select token from orcamentos where id='${orc2.id}'`);
  T.ok('com a validade no passado, aparece vencido', (await anon.rpc('orcamento_publico', { p_token: tok2 })).data?.status === 'vencido');
  T.ok('statusDoOrcamento da tela diz o mesmo', O.statusDoOrcamento({ status: 'aberto', validade: L.dia(-1) }, L.hoje) === 'vencido' && O.statusDoOrcamento({ status: 'aceito', validade: L.hoje }, L.hoje) === 'aceito');
  const texto = O.textoDoOrcamento({ loja: 'Pet Feliz', numero: 1, para: 'Ana Souza', itens, desconto: 9.8, validade: L.dia(7), link: 'https://x/gestao/orcamento/abc' }).replace(/\u00a0/g, ' ');
  T.ok('texto do WhatsApp: Oi, Ana!, linhas, desconto, total e link', /^Oi, Ana! Segue o orçamento nº 1 do Pet Feliz:/.test(texto) && texto.includes('• 2 × Shampoo Neutro — R$') && texto.includes('*Total: R$ 110,00*') && texto.includes('Ver e responder: https://x/gestao/orcamento/abc'), texto);

  T.secao('orçamento: transformar em venda (dois toques = uma venda)');
  const chV = D.novaChaveDeOperacao();
  const linhas = [{ tipo: 'produto', nome: 'Shampoo Neutro', qtd: 2, valor: 29.9, produto_id: prod }];
  const passos = [
    { t: 'lancamento', nome: 'venda', chave: chV, linha: { tipo: 'entrada', valor: 49.8, forma: 'pix', categoria: 'Venda de produtos', cliente_id: L.tutores.Ana, pago: true, data: L.hoje, descricao: 'Venda: 2 Shampoo Neutro', itens: linhas } },
    TN.passoDoEstoque([{ produtoId: prod, qtd: 2 }], chV, TN.ref('venda')),
  ];
  const e1 = saldo(prod);
  const [v1, v2] = await Promise.allSettled([
    TN.fazerTudoOuNada(cx, P, chV, { funcao: 'orcamento_vender', orcamento: orc.id }, passos),
    TN.fazerTudoOuNada(cx, P, chV, { funcao: 'orcamento_vender', orcamento: orc.id }, passos),
  ]);
  T.ok('os dois toques respondem sem erro', v1.status === 'fulfilled' && v2.status === 'fulfilled', [v1.reason?.message, v2.reason?.message]);
  T.ok('uma venda só (R$ 49,80)', B.num(`select count(*) from lancamentos where petshop_id='${P}' and chave='${chV}'`) === 1);
  T.ok('estoque −2 uma vez', saldo(prod) === e1 - 2, [e1, saldo(prod)]);
  const o1 = B.sql(`select status || '|' || (lancamento_id is not null) from orcamentos where id='${orc.id}'`);
  T.ok('o orçamento fica convertido e ligado à venda', o1 === 'convertido|true', o1);
  await TN.fazerTudoOuNada(cx, P, D.novaChaveDeOperacao(), { funcao: 'orcamento_vender', orcamento: orc.id }, passos).then(() => T.ok('outra chave no mesmo orçamento é recusada', false), (e) => T.ok('outra chave no mesmo orçamento é recusada', /já virou venda/.test(e.message), e.message));
  T.recusa('orçamento convertido não muda mais', await dono.from('orcamentos').update({ desconto: 0 }).eq('id', orc.id).select('id'), /não muda mais/);
  T.recusa('nem é apagado', await dono.from('orcamentos').delete().eq('id', orc.id).select('id').then((r) => (r.data?.length ? r : { error: { message: 'nada apagado' } })));
  // o serviço vira horário: o orçamento guarda o horário também
  const ini = B.instante(L.dia(1), '10:00', L.fuso);
  const ag = B.must(await cx.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Thor, servico_id: L.S.Banho, inicio: ini.toISOString(), fim: new Date(+ini + 3600e3).toISOString() }).select('id').single(), 'horário').id;
  T.passa('o horário marcado fica ligado ao orçamento', await cx.rpc('orcamento_marcar', { p_orcamento: orc.id, p_agendamento: ag }));
  T.ok('… venda e horário no orçamento', B.sql(`select (lancamento_id is not null) and agendamento_id='${ag}' from orcamentos where id='${orc.id}'`) === 't');
  T.recusa('o tosador não marca orçamento', await tos.rpc('orcamento_marcar', { p_orcamento: orc2.id, p_agendamento: ag }));

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('devolução: valores ao centavo, dinheiro, crédito, avariado');
  const chVenda = D.novaChaveDeOperacao();
  const venda = await D.lancarPago(cx, P, { tipo: 'entrada', valor: 80, forma: 'pix', categoria: 'Venda de produtos', clienteId: L.tutores.Ana, chave: chVenda, itens: [{ tipo: 'produto', nome: 'Shampoo Neutro', qtd: 3, valor: 29.9, produto_id: prod }] });
  await D.gravarMovimentos(cx, P, [{ petshop_id: P, produto_id: prod, tipo: 'saida', quantidade: 3, motivo: 'Venda', lancamento_id: venda.id, chave: D.parteDaChave(chVenda, 'estoque', prod) }]);
  const dv0 = await DV.lerDevolvivel(cx, P, venda.id);
  T.ok('venda_devolvivel: 3 vendidos, 80,00 pagos', dv0.length === 1 && dv0[0].vendido === 3 && dv0[0].pago === 80, dv0);
  T.ok('a tela calcula 26,67 por 1 e 80,00 pelos 3', DV.valorQueVolta(dv0[0], 1) === 26.67 && DV.valorQueVolta(dv0[0], 3) === 80);
  T.recusa('o tosador não devolve', await tos.rpc('venda_devolver', { p_petshop: P, p_chave: D.novaChaveDeOperacao(), p_venda: venda.id, p_itens: [{ produto_id: prod, qtd: 1 }], p_modo: 'dinheiro', p_forma: 'dinheiro' }));
  const e2 = saldo(prod);
  const chD = D.novaChaveDeOperacao();
  const pedido = { venda: venda.id, itens: [{ produto_id: prod, qtd: 1 }], modo: 'dinheiro', forma: 'dinheiro', chave: chD };
  const [d1, d2] = await Promise.allSettled([DV.devolver(cx, P, pedido), DV.devolver(cx, P, pedido)]);
  T.ok('dois toques ao mesmo tempo respondem sem erro', d1.status === 'fulfilled' && d2.status === 'fulfilled', [d1.reason?.message, d2.reason?.message]);
  T.ok('volta R$ 26,67 (80 × 1/3)', Number(d1.value?.valor) === 26.67, d1.value);
  T.ok('uma saída "Devolução" de 26,67 em dinheiro, no caixa aberto, no nome da Ana', B.sql(`select count(*) || '|' || sum(valor) || '|' || min(forma) || '|' || bool_and(caixa_id is not null) || '|' || bool_and(cliente_id='${L.tutores.Ana}') from lancamentos where petshop_id='${P}' and categoria='Devolução' and tipo='saida'`) === '1|26.67|dinheiro|true|true');
  T.ok('o shampoo volta ao estoque uma vez (+1)', saldo(prod) === e2 + 1, [e2, saldo(prod)]);
  T.recusa('devolver mais do que sobrou é recusado', await cx.rpc('venda_devolver', { p_petshop: P, p_chave: D.novaChaveDeOperacao(), p_venda: venda.id, p_itens: [{ produto_id: prod, qtd: 3 }], p_modo: 'dinheiro', p_forma: 'pix' }), /só dá para devolver 2/);
  const r2 = await DV.devolver(cx, P, { venda: venda.id, itens: [{ produto_id: prod, qtd: 2, avariados: 1 }], modo: 'credito', chave: D.novaChaveDeOperacao() });
  T.ok('o resto (2) fecha ao centavo: 80,00 − 26,67 = 53,33', Number(r2.valor) === 53.33, r2);
  T.ok('… fica de crédito para a Ana (53,33)', Number(B.sql(`select sum(valor) from clientes_creditos where petshop_id='${P}' and cliente_id='${L.tutores.Ana}'`)) === 53.33);
  T.ok('… estoque +2 e −1 de perda (um avariado)', saldo(prod) === e2 + 2 && B.num(`select count(*) from movimentos_estoque where petshop_id='${P}' and motivo='Perda' and quantidade=1`) === 1, saldo(prod));
  T.recusa('nada mais volta desta venda', await cx.rpc('venda_devolver', { p_petshop: P, p_chave: D.novaChaveDeOperacao(), p_venda: venda.id, p_itens: [{ produto_id: prod, qtd: 1 }], p_modo: 'dinheiro', p_forma: 'pix' }), /só dá para devolver 0/);
  const aberta = await D.lancarAReceber(cx, P, { valor: 29.9, vencimento: L.dia(5), categoria: 'Venda de produtos', clienteId: L.tutores.Beto, itens: [{ tipo: 'produto', nome: 'Shampoo Neutro', qtd: 1, valor: 29.9, produto_id: prod }], chave: D.novaChaveDeOperacao() });
  T.recusa('venda ainda não paga não tem devolução', await cx.rpc('venda_devolver', { p_petshop: P, p_chave: D.novaChaveDeOperacao(), p_venda: aberta.id, p_itens: [{ produto_id: prod, qtd: 1 }], p_modo: 'dinheiro', p_forma: 'pix' }), /ainda não foi paga/);
  const semTutor = await D.lancarPago(cx, P, { tipo: 'entrada', valor: 29.9, forma: 'dinheiro', categoria: 'Venda de produtos', chave: D.novaChaveDeOperacao(), itens: [{ tipo: 'produto', nome: 'Shampoo Neutro', qtd: 1, valor: 29.9, produto_id: prod }] });
  T.recusa('crédito sem tutor pede de quem é a compra', await cx.rpc('venda_devolver', { p_petshop: P, p_chave: D.novaChaveDeOperacao(), p_venda: semTutor.id, p_itens: [{ produto_id: prod, qtd: 1 }], p_modo: 'credito' }), /de quem é a compra/);

  T.secao('troca: diferença cobrada ou devolvida');
  const vT = await D.lancarPago(cx, P, { tipo: 'entrada', valor: 29.9, forma: 'pix', categoria: 'Venda de produtos', clienteId: L.tutores.Clara, chave: D.novaChaveDeOperacao(), itens: [{ tipo: 'produto', nome: 'Shampoo Neutro', qtd: 1, valor: 29.9, produto_id: prod }] });
  const [eP, eC] = [saldo(prod), saldo(coleira)];
  T.ok('a tela calcula a diferença: 45,00 − 29,90 = cobrar 15,10', DV.contaDaTroca(29.9, 45).cobrar === 15.1);
  const t1 = await DV.devolver(cx, P, { venda: vT.id, itens: [{ produto_id: prod, qtd: 1 }], modo: 'troca', forma: 'pix', novos: [{ produto_id: coleira, qtd: 1, valor: 1 }], chave: D.novaChaveDeOperacao() });
  T.ok('troca por coleira: diferença 15,10 (a recepção não muda o preço: vale o da lista)', Number(t1.diferenca) === 15.1 && Number(t1.novos) === 45, t1);
  const sT = B.sql(`select valor || '|' || forma from lancamentos where id='${t1.saida_id}'`), eT = B.sql(`select valor || '|' || forma || '|' || pagamentos::text from lancamentos where id='${t1.entrada_id}'`);
  T.ok('saída 29,90 "outro"', sT === '29.90|outro', sT);
  T.ok('entrada 45,00 = 29,90 "outro" + 15,10 Pix', eT.startsWith('45.00|outro|') && /"pix".*15\.1/.test(eT), eT);
  T.ok('estoque: shampoo +1, coleira −1', saldo(prod) === eP + 1 && saldo(coleira) === eC - 1);
  const D2 = lib('dinheiro');
  const formas = D2.partesPorForma({ valor: 45, forma: 'outro', pagamentos: JSON.parse(eT.split('|').slice(2).join('|')) });
  T.ok('somaPorForma: só os 15,10 do Pix são dinheiro novo', formas.find((f) => f.forma === 'pix')?.valor === 15.1 && formas.find((f) => f.forma === 'outro')?.valor === 29.9, formas);
  const vT2 = await D.lancarPago(cx, P, { tipo: 'entrada', valor: 29.9, forma: 'pix', categoria: 'Venda de produtos', chave: D.novaChaveDeOperacao(), itens: [{ tipo: 'produto', nome: 'Shampoo Neutro', qtd: 1, valor: 29.9, produto_id: prod }] });
  const t2 = await DV.devolver(cx, P, { venda: vT2.id, itens: [{ produto_id: prod, qtd: 1 }], modo: 'troca', forma: 'dinheiro', novos: [{ produto_id: laco, qtd: 1 }], chave: D.novaChaveDeOperacao() });
  const s2 = B.sql(`select valor || '|' || forma || '|' || pagamentos::text from lancamentos where id='${t2.saida_id}'`);
  T.ok('troca por laço: volta 24,90 em dinheiro (saída 29,90 = 5,00 "outro" + 24,90 dinheiro)', Number(t2.diferenca) === -24.9 && s2.startsWith('29.90|dinheiro|') && /"dinheiro".*24\.9/.test(s2), s2);

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('relatórios: faturamento, devoluções por produto e comissão');
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'comissao.em_produtos': true, 'comissao.produtos_pct': 10 } }), 'opções');
  const iniA = B.instante(L.hoje, '08:00', L.fuso);
  const agA = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Bob, servico_id: L.S.Banho, profissional_id: L.ids.tosador, inicio: iniA.toISOString(), fim: new Date(+iniA + 3600e3).toISOString(), preco: 70 }).select('id').single(), 'horário Bob').id;
  B.must(await tos.from('agendamentos').update({ status: 'concluido' }).eq('id', agA).select('id').single(), 'concluir');
  const chA = D.novaChaveDeOperacao();
  const contaA = await D.lancarPago(dono, P, { tipo: 'entrada', valor: 99.9, forma: 'pix', categoria: 'Banho e tosa', agendamentoId: agA, clienteId: L.tutores.Beto, chave: chA, itens: [{ tipo: 'servico', nome: 'Banho', qtd: 1, valor: 70 }, { tipo: 'produto', nome: 'Shampoo Neutro', qtd: 1, valor: 29.9, produto_id: prod }] });
  const com = () => B.sql(`select comissao_produtos from comissao_calcular('${P}', '${L.hoje}', '${L.hoje}') where profissional_id='${L.ids.tosador}'`);
  T.ok('comissão sobre o shampoo da conta: 10% de 29,90 = 2,99', Number(com()) === 2.99, com());
  await DV.devolver(dono, P, { venda: contaA.id, itens: [{ produto_id: prod, qtd: 1 }], modo: 'dinheiro', forma: 'pix', chave: D.novaChaveDeOperacao() });
  T.ok('… depois que o shampoo volta, 0,00', Number(com()) === 0, com());
  const lb = B.must(await dono.rpc('lucro_do_periodo', { p_petshop: P, p_de: L.hoje, p_ate: L.hoje }), 'lucro');
  const A = await lib('faturamento').ajustesDoFaturamento(dono, P, L.hoje, L.hoje);
  const entradas = Number(B.sql(`select sum(valor) from lancamentos where petshop_id='${P}' and tipo='entrada' and pago and movimento is null and data='${L.hoje}'`));
  // à mão: devoluções em dinheiro 26,67 + 29,90 (troca coleira) + 29,90 (troca laço) + 29,90 (conta do Bob) = 116,37; crédito 53,33
  T.ok('devolvido = 26,67 + 29,90 + 29,90 + 29,90 = 116,37', Number(lb.devolvido) === 116.37 && A.devolvido === 116.37, [lb.devolvido, A.devolvido]);
  T.ok('crédito deixado = 53,33', Number(lb.credito_deixado) === 53.33 && A.creditoDeixado === 53.33);
  T.ok('faturamento do banco = o das telas (entradas − 116,37 − 53,33)', Math.abs(Number(lb.faturamento) - lib('faturamento').faturamentoLiquido(entradas, A)) < 0.001 && Math.abs(Number(lb.faturamento) - (entradas - 116.37 - 53.33)) < 0.001, [lb.faturamento, entradas]);
  const dvS = (lb.devolucoes ?? []).find((x) => x.produto_id === prod);
  // shampoo: 1 + 2 (1 avariado) + 1 + 1 + 1 = 6 voltaram, 1 avariado; valor 26,67 + 53,33 + 29,90 × 3 = 169,70; custo de volta 5 × 12 = 60
  T.ok('devoluções do shampoo: 6 voltaram (1 avariado), 169,70, custo de volta 5 × 12,00 = 60,00', dvS && Number(dvS.quantidade) === 6 && Number(dvS.avariados) === 1 && Number(dvS.valor) === 169.7 && Number(dvS.custo_volta) === 60, dvS);
  const m = LU.montarLucro(lb);
  const lS = m.produtos.find((x) => x.id === prod);
  T.ok('na linha do shampoo: devolvido 169,70, a margem desconta a devolução e o custo que voltou', lS && lS.devolvido === 169.7 && lS.margem === Math.round((lS.receita - 169.7 - lS.custo) * 100) / 100, lS);
  T.ok('a ponte com o Financeiro continua fechando (diferença zero)', m.ponte.diferenca === 0, m.ponte);

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('limite de fiado');
  T.recusa('a recepção não muda o limite', await cx.from('clientes').update({ limite_fiado: 999 }).eq('id', L.tutores.Ana).select('id'), /limite de fiado/);
  T.passa('o dono põe 200 de limite na Ana', await dono.from('clientes').update({ limite_fiado: 200 }).eq('id', L.tutores.Ana).select('id'));
  T.passa('a recepção edita outra coisa da ficha sem mexer no limite', await cx.from('clientes').update({ obs: 'gosta de laço' }).eq('id', L.tutores.Ana).select('id'));
  await D.lancarAReceber(cx, P, { valor: 180, vencimento: L.dia(10), categoria: 'Outros', descricao: 'Fiado', clienteId: L.tutores.Ana, chave: D.novaChaveDeOperacao() });
  const sit = await FI.situacaoDoFiado(cx, P, L.tutores.Ana);
  T.ok('fiado_situacao: deve 180,00, limite 200,00, cabe 20,00', sit.deve === 180 && sit.limite === 200 && sit.disponivel === 20 && sit.do_cliente, sit);
  T.ok('frase da tela: "Ana já deve R$ 180,00; com esta conta passa do limite de R$ 200,00."', FI.fraseDoLimite('Ana Souza', 180, 200).replace(/ /g, ' ') === 'Ana já deve R$ 180,00; com esta conta passa do limite de R$ 200,00.');
  const ch30 = D.novaChaveDeOperacao();
  let erro30 = null;
  try { await D.lancarAReceber(cx, P, { valor: 30, vencimento: L.dia(10), categoria: 'Outros', descricao: 'Mais fiado', clienteId: L.tutores.Ana, chave: ch30 }); } catch (e) { erro30 = e.message; }
  T.ok('mais 30 a receber é recusado com a frase', erro30 === 'Ana já deve R$ 180,00; com esta conta passa do limite de R$ 200,00.', erro30);
  T.ok('… e FI.ehErroDoLimite reconhece', FI.ehErroDoLimite(new Error(erro30 ?? '')));
  T.recusa('fiado na venda de balcão também (venda_registrar)', await cx.rpc('venda_registrar', { p_petshop: P, p_chave: D.novaChaveDeOperacao(), p_passos: [{ t: 'lancamento', nome: 'venda', linha: { tipo: 'entrada', valor: 29.9, forma: null, categoria: 'Venda de produtos', cliente_id: L.tutores.Ana, pago: false, data: L.dia(3), vencimento: L.dia(3), itens: [{ tipo: 'produto', nome: 'Shampoo Neutro', qtd: 1, valor: 29.9, produto_id: prod }] } }] }), /passa do limite/);
  T.passa('pagamento na hora nunca é barrado', await cx.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 500, forma: 'dinheiro', categoria: 'Outros', cliente_id: L.tutores.Ana, data: L.hoje, pago: true }).select('id'));
  T.recusa('a recepção não libera', await cx.rpc('fiado_liberar', { p_petshop: P, p_cliente: L.tutores.Ana, p_valor: 30 }), /dono ou quem cuida do financeiro/);
  T.passa('o dono libera 30', await dono.rpc('fiado_liberar', { p_petshop: P, p_cliente: L.tutores.Ana, p_valor: 30 }));
  let ok30 = null;
  try { ok30 = await D.lancarAReceber(cx, P, { valor: 30, vencimento: L.dia(10), categoria: 'Outros', descricao: 'Mais fiado', clienteId: L.tutores.Ana, chave: ch30 }); } catch (e) { ok30 = e.message; }
  T.ok('com a liberação, a recepção anota os 30', ok30 && ok30.id, ok30);
  T.ok('… anotado quem liberou (o dono), ligado à conta', B.sql(`select liberado_por = (select user_id from profissionais where id='${L.ids.dono}') and lancamento_id='${ok30?.id}' and usado_em is not null from fiado_liberacoes where petshop_id='${P}'`) === 't');
  let erro10 = null;
  try { await D.lancarAReceber(cx, P, { valor: 10, vencimento: L.dia(10), categoria: 'Outros', clienteId: L.tutores.Ana, chave: D.novaChaveDeOperacao() }); } catch (e) { erro10 = e.message; }
  T.ok('a liberação vale uma vez: mais 10 é recusado ("já deve R$ 210,00")', /Ana já deve R\$ 210,00/.test(erro10 ?? ''), erro10);
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'dinheiro.limite_fiado': 50 } }), 'padrão 50');
  T.ok('o padrão da loja não vai para o tosador', !JSON.stringify((await tos.rpc('petshop_opcoes', { p: P })).data ?? {}).includes('limite_fiado'));
  let erroD = null;
  try { await D.lancarAReceber(cx, P, { valor: 25, vencimento: L.dia(10), categoria: 'Outros', clienteId: L.tutores.Davi, chave: D.novaChaveDeOperacao() }); } catch (e) { erroD = e.message; }
  T.ok('padrão da loja (50): Davi anota 25', !erroD, erroD);
  try { await D.lancarAReceber(cx, P, { valor: 30, vencimento: L.dia(10), categoria: 'Outros', clienteId: L.tutores.Davi, chave: D.novaChaveDeOperacao() }); erroD = null; } catch (e) { erroD = e.message; }
  T.ok('… mais 30 passa dos 50: recusado', /Davi já deve R\$ 25,00; com esta conta passa do limite de R\$ 50,00/.test(erroD ?? ''), erroD);
  T.ok('limiteDoCliente: o próprio vale mais que o padrão; sem os dois, sem limite', FI.limiteDoCliente({ limite_fiado: 0 }, { opcoes: { 'dinheiro.limite_fiado': 50 } }) === 0 && FI.limiteDoCliente({}, { opcoes: { 'dinheiro.limite_fiado': 50 } }) === 50 && FI.limiteDoCliente({}, { opcoes: {} }) === null);
}))();
