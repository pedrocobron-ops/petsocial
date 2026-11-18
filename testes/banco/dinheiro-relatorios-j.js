// Rodada 8 (J), dinheiro e relatórios que batem entre si (Sandra, "completa"), pela API com o login de cada papel e pelo mesmo
// código das telas (loja-vendas.ts, fiado.ts, devolucao.ts, lucro.ts, dinheiro.ts, assistente/ferramentas.ts). Contas à mão:
// - H1 devolução: venda de 2 Shampoo (29,90; custo 12) + 1 Coleira (45; custo 20) = 104,80 no Pix; volta 1 Shampoo (29,90).
//   Relatórios > Produtos (vendasPorProduto com as devoluções), Indicadores e o Mozart (ver_lucro): Shampoo 1 un, R$ 29,90,
//   margem 17,90; total 74,90 e margem 42,90, igual a "Quanto sobrou" (lucro_do_periodo). Antes: 2 un, 59,80.
// - H2 fiado: limite 300. Ana tem a mensalidade de dezembro (900, vence em 10 dias) e um sinal de reserva (222,90, vence em
//   2 dias): nada disso conta no limite; a venda fiado de 79,90 passa (antes: "já deve R$ 1.122,90"). Com uma conta vencida
//   de 250: 329,90 contam; mais 10 é recusado. fiado_situacao e dividaPorVencimento separam vencido / hoje / a vencer.
// - M1 promoção: Banho e tosa 80 com 10% de aniversário (−8) + Shampoo 29,90 = 101,90. Com a linha da promoção, o serviço fica
//   72,00 e o produto 29,90 (partes_do_lancamento); comissão do tosador (40%) 28,80; a promoção vai para promo_usos (8,00) e
//   não vira "desconto do caixa". Sem a linha (antes): 74,18 / 27,72.
// - M2 crédito no balcão: Ana com 50 de crédito; venda de 29,90 paga só com o crédito (venda_registrar com credito_usado):
//   saldo 20,10.
// - M3 Mozart: resumo_financeiro dá o mesmo resultado do Financeiro (lucro_do_periodo), com a devolução e o crédito deixado.
// - M4 cópia: cobradoPorItem reparte o desconto e a linha negativa ao centavo (a soma é o valor do lançamento).
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('dinheiro-relatorios-j');
const D = lib('dinheiro'), DV = lib('devolucao'), FI = lib('fiado'), TN = lib('tudo-ou-nada'), LU = lib('lucro'), LV = lib('loja-vendas');
const F = lib('assistente/ferramentas'), R = lib('reservado'), A = lib('acessos');

const real = (n) => Math.round(Number(n) * 100) / 100;

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Dinheiro J' });
  const { dono, caixa: cx } = L.sb;
  const P = L.P, prod = L.prod;
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'abrir o caixa');
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'loja.margem': true } }), 'margem ligada');
  const coleira = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Coleira', unidade: 'un', preco_venda: 45, custo: 20, estoque: 5 }).select('id').single(), 'coleira').id;

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('H1: a devolução sai dos relatórios de produto (Relatórios, Indicadores, Financeiro, Mozart)');
  const chV = D.novaChaveDeOperacao();
  const itensV = [{ tipo: 'produto', nome: 'Shampoo Neutro', qtd: 2, valor: 29.9, produto_id: prod }, { tipo: 'produto', nome: 'Coleira', qtd: 1, valor: 45, produto_id: coleira }];
  const v = await TN.fazerTudoOuNada(cx, P, chV, { funcao: 'venda_registrar' }, [
    { t: 'lancamento', nome: 'venda', chave: chV, linha: { tipo: 'entrada', valor: 104.8, forma: 'pix', categoria: 'Venda de produtos', cliente_id: L.tutores.Ana, pago: true, data: L.hoje, descricao: 'Venda', itens: itensV } },
    TN.passoDoEstoque([{ produtoId: prod, qtd: 2 }, { produtoId: coleira, qtd: 1 }], chV, TN.ref('venda')),
  ]);
  const vendaId = v.ids.venda;
  await DV.devolver(cx, P, { venda: vendaId, itens: [{ produto_id: prod, qtd: 1 }], modo: 'dinheiro', forma: 'pix', chave: D.novaChaveDeOperacao() });
  const devs = await LV.lerDevolucoesPorProduto(dono, P, L.hoje, L.hoje);
  T.ok('devolucoes_por_produto: 1 Shampoo, R$ 29,90, custo que voltou R$ 12,00', devs.length === 1 && devs[0].produto_id === prod && devs[0].quantidade === 1 && devs[0].valor === 29.9 && devs[0].custo_volta === 12, devs);
  const tosLe = await LV.lerDevolucoesPorProduto(L.sb.tosador, P, L.hoje, L.hoje);
  T.ok('o tosador (sem dinheiro) não lê as devoluções', tosLe.length === 0, tosLe);
  const vendas = B.must(await dono.from('lancamentos').select('id, valor, valor_original, itens').eq('petshop_id', P).eq('pago', true).eq('tipo', 'entrada').is('movimento', null).not('itens', 'is', null), 'vendas')
    .map((l) => ({ id: l.id, itens: l.itens, valor: Number(l.valor_original ?? l.valor) }));
  const saidas = B.must(await dono.rpc('custos_das_vendas', { p: P, p_de: L.hoje, p_ate: L.hoje }), 'custos');
  const rel = LV.vendasPorProduto(vendas, saidas, new Map(), devs);
  const sh = rel.linhas.find((l) => l.produtoId === prod);
  T.ok('Relatórios > Produtos: Shampoo 1 un, R$ 29,90, margem 17,90 (1 voltou, R$ 29,90)', sh && sh.unidades === 1 && sh.receita === 29.9 && LV.margemDaLinha(sh)?.reais === 17.9 && sh.devolvidos === 1 && sh.devolvido === 29.9, sh);
  const mt = LV.margemDaLinha(rel.total);
  T.ok('total: receita 74,90 e margem 42,90', rel.total.receita === 74.9 && mt?.reais === 42.9, { total: rel.total, mt });
  const lucro = LU.montarLucro(B.must(await dono.rpc('lucro_do_periodo', { p_petshop: P, p_de: L.hoje, p_ate: L.hoje }), 'lucro'));
  const lp = lucro.produtos.reduce((t, l) => t + (l.margem ?? 0), 0);
  T.ok('… o mesmo número de "Quanto sobrou" (uma resposta por pergunta)', real(lp) === mt?.reais, { quantoSobrou: real(lp), relatorio: mt?.reais });
  const ind = B.must(await dono.rpc('indicadores_do_periodo', { p: P, p_de: L.hoje, p_ate: L.hoje }), 'indicadores');
  const ip = (ind.produtos || []).find((x) => x.produto_id === prod);
  T.ok('Indicadores > Produtos mais vendidos: Shampoo 1 (não 2), receita 29,90', ip && Number(ip.quantidade) === 1 && Number(ip.receita) === 29.9, ind.produtos);

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('H2: mensalidade e sinal que ainda não venceram não contam no limite de fiado');
  const ana = L.tutores.Ana;
  B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 900, categoria: 'Creche: mensalidade', descricao: 'Mensalidade · Thor', data: L.dia(10), vencimento: L.dia(10), pago: false, cliente_id: ana, origem: 'tela' }).select('id'), 'mensalidade');
  B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 222.9, categoria: 'Creche e hotel', descricao: 'Sinal da reserva: hotel de Thor, 29/12', data: L.dia(2), vencimento: L.dia(2), pago: false, cliente_id: ana, origem: 'tela' }).select('id'), 'sinal');
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'dinheiro.limite_fiado': 300 } }), 'limite 300');
  const s1 = await FI.situacaoDoFiado(cx, P, ana);
  T.ok('fiado_situacao: deve 0 no limite; a vencer 1.122,90 (fora do limite 1.122,90)', s1.deve === 0 && s1.a_vencer === 1122.9 && s1.fora_do_limite === 1122.9 && s1.total === 1122.9 && s1.vencido === 0, s1);
  const fiado = (valor) => { const ch = D.novaChaveDeOperacao(); return TN.fazerTudoOuNada(cx, P, ch, { funcao: 'venda_registrar' }, [
    { t: 'lancamento', nome: 'venda', chave: ch, linha: { tipo: 'entrada', valor, forma: null, categoria: 'Venda de produtos', cliente_id: ana, pago: false, data: L.dia(7), vencimento: L.dia(7), descricao: 'Venda: fiado', itens: [{ tipo: 'produto', nome: 'Coleira', qtd: 1, valor, produto_id: coleira }] } },
    TN.passoDoEstoque([{ produtoId: coleira, qtd: 1 }], ch, TN.ref('venda')),
  ]).then(() => null, (e) => e.message); };
  T.ok('a recepção vende 79,90 fiado para a Ana (antes: "já deve R$ 1.122,90")', (await fiado(79.9)) === null);
  B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 200, categoria: 'Banho e tosa', descricao: 'Banho de antes', data: L.dia(-2), vencimento: L.dia(-2), pago: false, cliente_id: ana, origem: 'tela' }).select('id'), 'conta vencida');
  const s2 = await FI.situacaoDoFiado(cx, P, ana);
  T.ok('com 200 vencidos: deve 279,90 (vencido 200, a vencer 1.202,80)', s2.deve === 279.9 && s2.vencido === 200 && s2.a_vencer === 1202.8, s2);
  const recusa = await fiado(30);
  T.ok('mais 30 passa do limite: recusado com a frase do banco (279,90)', /279,90/.test(recusa ?? '') && /300,00/.test(recusa ?? ''), recusa);
  const abertas = B.must(await cx.from('lancamentos').select('valor, vencimento, categoria, descricao').eq('petshop_id', P).eq('cliente_id', ana).eq('pago', false), 'abertas');
  const pv = FI.dividaPorVencimento(abertas, L.hoje);
  T.ok('dividaPorVencimento (a tela) dá os mesmos números do banco', pv.vencido === s2.vencido && pv.aVencer === s2.a_vencer && pv.noLimite === s2.deve && pv.foraDoLimite === s2.fora_do_limite, pv);
  T.ok('fraseDoVencimento: "R$ 200,00 vencido · R$ 1.202,80 a vencer"', FI.fraseDoVencimento(pv).replace(/ /g, ' ') === 'R$ 200,00 vencido · R$ 1.202,80 a vencer', FI.fraseDoVencimento(pv));
  T.ok('foraDoLimite: mensalidade e sinal futuros sim; fiado com prazo não; mensalidade vencida não',
    FI.foraDoLimite({ categoria: 'Creche: mensalidade', vencimento: L.dia(3) }, L.hoje) && FI.foraDoLimite({ categoria: 'Creche e hotel', descricao: 'Sinal da reserva: hotel de Thor, 29/12', vencimento: L.dia(1) }, L.hoje)
    && !FI.foraDoLimite({ categoria: 'Venda de produtos', descricao: 'Venda', vencimento: L.dia(7) }, L.hoje) && !FI.foraDoLimite({ categoria: 'Creche: mensalidade', vencimento: L.hoje }, L.hoje));

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('M1: a promoção do horário sai só do serviço (comissão e relatórios)');
  const ini = B.instante(L.hoje, '08:00', L.fuso);
  const ag = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Mel, servico_id: L.S['Banho e tosa'], profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 90 * 6e4).toISOString(), preco: 80 }).select('id').single(), 'horário').id;
  // a promoção de aniversário que o banco põe ao marcar (aqui direto, sem os gatilhos)
  B.sql(`set session_replication_role = replica; update agendamentos set promo = '{"nome": "Aniversário do pet", "tipo": "pct", "valor": 10, "servicos": []}'::jsonb where id = '${ag}'; set session_replication_role = origin;`);
  const preco = B.num(`select preco from agendamentos where id='${ag}'`);
  const promo = real(preco * 0.1);
  const chA = D.novaChaveDeOperacao();
  const itensA = [{ tipo: 'servico', nome: 'Banho e tosa', qtd: 1, valor: preco }, { tipo: 'produto', nome: 'Shampoo Neutro', qtd: 1, valor: 29.9, produto_id: prod },
    { tipo: 'extra', nome: 'Promoção Aniversário do pet', qtd: 1, valor: -promo, promo: true }];
  const total = real(preco - promo + 29.9);
  B.must(await dono.rpc('agendamento_fechar_conta', { p_petshop: P, p_agendamento: ag, p_chave: chA, p_passos: [
    { t: 'lancamento', nome: 'principal', chave: chA, linha: { tipo: 'entrada', valor: total, forma: 'pix', pago: true, data: L.hoje, categoria: 'Banho e tosa', agendamento_id: ag, cliente_id: ana, descricao: 'Banho e tosa · Mel', itens: itensA } },
    { t: 'agendamento', id: ag, status: 'concluido' },
  ] }), 'fechar a conta com a promoção');
  const lanc = B.sql(`select id from lancamentos where agendamento_id='${ag}'`);
  const partes = B.sql(`select servico || '|' || produto from partes_do_lancamento(${total}, (select itens from lancamentos where id='${lanc}'))`);
  T.ok(`serviço ${real(preco - promo)} e produto 29,90 (a promoção não se espalha pelo produto)`, partes === `${(preco - promo).toFixed(2)}|29.90`, partes);
  T.ok('partesDoLancamento (a tela) dá o mesmo', JSON.stringify(D.partesDoLancamento({ valor: total, itens: itensA })) === JSON.stringify({ servico: real(preco - promo), produto: 29.9, extra: 0 }));
  const usos = B.sql(`select coalesce(sum(desconto), 0) from promo_usos where lancamento_id='${lanc}'`);
  T.ok(`a promoção vai para promo_usos (${promo.toFixed(2)})`, Number(usos) === promo, usos);
  const descCaixa = B.num(`select count(*) from precos_alterados where lancamento_id='${lanc}' and tipo = 'desconto'`);
  T.ok('… e não vira "desconto do caixa" em Alterações em valores', descCaixa === 0, descCaixa);
  const com = B.sql(`select base || '|' || round(comissao, 2) from comissao_calcular('${P}', '${L.hoje}', '${L.hoje}', '${L.ids.tosador}')`);
  T.ok(`comissão do tosador (40%) sobre ${real(preco - promo)} = ${real((preco - promo) * 0.4)}`, com === `${(preco - promo).toFixed(2)}|${real((preco - promo) * 0.4).toFixed(2)}`, com);

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('M2: crédito do tutor na venda no balcão');
  B.must(await dono.rpc('credito_do_tutor_mover', { p_petshop: P, p_cliente: L.tutores.Beto, p_valor: 50, p_motivo: 'Pagou a mais', p_chave: D.novaChaveDeOperacao() }), 'crédito do Beto');
  const chC = D.novaChaveDeOperacao();
  const pg = D.pagamentoComCredito(29.9, null, 0);
  await TN.fazerTudoOuNada(cx, P, chC, { funcao: 'venda_registrar' }, [
    { t: 'lancamento', nome: 'venda', chave: chC, linha: { tipo: 'entrada', valor: 29.9, forma: pg.forma, pagamentos: pg.pagamentos, categoria: 'Venda de produtos', cliente_id: L.tutores.Beto, pago: true, data: L.hoje, descricao: 'Venda: 1 Shampoo Neutro', itens: [{ tipo: 'produto', nome: 'Shampoo Neutro', qtd: 1, valor: 29.9, produto_id: prod }], credito_usado: 29.9 } },
    TN.passoDoEstoque([{ produtoId: prod, qtd: 1 }], chC, TN.ref('venda')),
  ]);
  const saldoBeto = Number(B.must(await cx.rpc('credito_saldo', { p_petshop: P, p_cliente: L.tutores.Beto }), 'saldo'));
  T.ok('a recepção paga a venda com o crédito: saldo 50 − 29,90 = 20,10', saldoBeto === 20.1, saldoBeto);
  // o crédito que sobrou de uma devolução também entra no resultado como no Financeiro (para o M3 abaixo)
  B.must(await dono.rpc('credito_do_tutor_mover', { p_petshop: P, p_cliente: L.tutores.Clara, p_valor: 72, p_motivo: 'Sinal da reserva cancelada', p_chave: D.novaChaveDeOperacao() }), 'crédito da Clara');

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('M3: o Mozart dá o mesmo resultado do Financeiro');
  const u = (await dono.auth.getUser()).data.user;
  const [ps, eq, sv] = await Promise.all([R.lerPetshop(dono, P), R.lerEquipe(dono, P), R.lerServicos(dono, P)]);
  const eu = (eq.data || []).find((x) => x.user_id === u.id && x.ativo);
  const ctx = { sb: dono, userId: u.id, petshop: ps.data, eu, equipe: eq.data || [], servicos: sv.data || [], vejoFinanceiro: true, cuidoDoFinanceiro: true,
    fusoMin: -180, agora: `${L.hoje}T10:00`, ...(A.podeArea ? {} : {}) };
  const rf = JSON.parse((await F.rodarConsulta(ctx, 'resumo_financeiro', { de: L.mes1, ate: L.hoje })).conteudo);
  const lm = LU.montarLucro(B.must(await dono.rpc('lucro_do_periodo', { p_petshop: P, p_de: L.mes1, p_ate: L.hoje }), 'lucro do mês'));
  T.ok('resumo_financeiro: resultado igual a lucro_do_periodo (Financeiro), com a devolução e os 50 + 72 de crédito deixado', rf.resultado === lm.ponte.resultado && rf.faturamento === lm.ponte.faturamento && rf.devolvido_ao_cliente === 29.9 && rf.credito_deixado_para_tutores === 50 + 72,
    { mozart: { r: rf.resultado, f: rf.faturamento, d: rf.devolvido_ao_cliente, c: rf.credito_deixado_para_tutores, saiu: rf.saiu }, financeiro: { r: lm.ponte.resultado, f: lm.ponte.faturamento } });
  T.ok('… e a devolução não está em "saiu"', !Object.keys(rf.saidas_por_categoria).includes('Devolução'), rf.saidas_por_categoria);
  const q = JSON.parse((await F.rodarConsulta(ctx, 'quem_me_deve', {})).conteudo);
  const qa = q.devedores.find((d) => d.cliente_id === ana);
  T.ok('quem_me_deve separa vencido / vence hoje / a vencer (Ana: 200 vencido, 1.202,80 a vencer)', qa && qa.atrasado === 200 && qa.a_vencer === 1202.8 && q.vencido >= 200 && typeof q.vence_hoje === 'number' && q.a_vencer >= 1202.8 && q.devendo_agora === real(q.vencido + q.vence_hoje), { qa, vencido: q.vencido, hoje: q.vence_hoje, aVencer: q.a_vencer });
  const vl = JSON.parse((await F.rodarConsulta(ctx, 'ver_lucro', { de: L.hoje, ate: L.hoje })).conteudo);
  const vs = vl.produtos_por_lucro.find((x) => x.nome === 'Shampoo Neutro');
  T.ok('ver_lucro: Shampoo 3 un (4 vendidos hoje − 1 que voltou)', vs && vs.quantidade === 3 && vs.unidades_que_voltaram === 1, vs);

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('M4: cópia completa, o que foi cobrado de cada item');
  const ci = LV.cobradoPorItem({ valor: total, itens: itensA });
  T.ok(`Banho e tosa cobrado ${real(preco - promo)} (desconto ${promo}), Shampoo 29,90, promoção 0; soma = ${total}`,
    ci[0].cobrado === real(preco - promo) && ci[0].desconto === promo && ci[1].cobrado === 29.9 && ci[1].desconto === 0 && ci[2].cobrado === 0 && real(ci.reduce((t, x) => t + x.cobrado, 0)) === total, ci);
  const cd = LV.cobradoPorItem({ valor: 31.41, itens: [{ tipo: 'produto', nome: 'Sachê', qtd: 1, valor: 34.9 }] });
  T.ok('venda com 10% de desconto: Sachê 34,90 cobrado 31,41 (desconto 3,49)', cd[0].cobrado === 31.41 && cd[0].desconto === 3.49, cd);
  const cm = LV.cobradoPorItem({ valor: 100, valor_original: 209.7, itens: [{ tipo: 'produto', nome: 'Ração', qtd: 1, valor: 189.7 }, { tipo: 'produto', nome: 'Petisco', qtd: 2, valor: 10 }] });
  T.ok('conta recebida em partes: reparte o valor cheio (209,70), não a última parte', real(cm[0].cobrado + cm[1].cobrado) === 209.7, cm);

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('M6: planilha de clientes com nascimento e sexo do pet');
  const PL = lib('planilha');
  const { linhas, extra } = PL.linhasParaOBanco([
    { tutor: 'Paula Nova', telefone: '11977770001', pet: 'Jade', nascimento: '05/12/2020', sexo: 'Fêmea' },
    { tutor: 'Ana Souza', telefone: '11988880001', pet: 'Thor', nascimento: '20/11', sexo: 'M' },
    { tutor: 'Paula Nova', telefone: '11977770001', pet: 'Kiko', nascimento: 'não sei', sexo: '' },
  ], true, L.hoje);
  const imp = B.must(await dono.rpc('importar_clientes', { p_petshop: P, p_chave: D.novaChaveDeOperacao(), p_linhas: linhas, p_extra: extra }), 'importar');
  const pet = (nome) => B.sql(`select coalesce(nascimento::text, '') || '|' || coalesce(sexo, '') from pets where petshop_id='${P}' and nome='${nome}'`);
  T.ok('pet novo entra com o nascimento e o sexo (Jade 2020-12-05, F)', pet('Jade') === '2020-12-05|F', pet('Jade'));
  T.ok('pet que já existia ganha o que estava em branco (Thor: 20/11 sem ano, M)', pet('Thor') === '1904-11-20|M', pet('Thor'));
  T.ok('data que não deu para ler: o pet entra sem ela', pet('Kiko') === '|', pet('Kiko'));
  T.ok('o resumo conta 1 com nascimento e lista "Kiko: não sei"', imp.resumo.com_nascimento === 1 && JSON.stringify(imp.resumo.nascimento_ruim) === '["Kiko: não sei"]', imp.resumo);
}))();
