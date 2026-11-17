// O que a testadora Camila (loja + banho e tosa) achou, conserto da migração 20261214:
// - "Ver custo e margem": quem tem Estoque sem dinheiro não recebe custo pela API (produtos, compras, movimentos, lotes,
//   Vencendo, contagem); com a chave "custo" passa a receber, sem ganhar dinheiro (ve_financeiro continua falso); dono e
//   financeiro recebem; a recepção (Caixa) não; devolucoes (com o custo de cada item) só para quem cuida do financeiro;
//   o Mozart (ver_estoque, o que comprar) só manda custo para quem vê o custo;
// - estoque_entrada: entrada e despesa juntas; sem forma, sem permissão de dinheiro ou a pagar pela recepção, nada entra
//   (nem a entrada no estoque); mesma chave de novo não repete; "Vou pagar depois" vira conta a pagar;
// - orçamento com produto e serviço: virou venda sem horário fica "falta marcar", valor_vendido = o que entrou (320,90 e não
//   364,70), e o horário marcado depois completa;
// - contas_fixas_situacao: a conta fixa que começou depois do vencimento do mês "não existe" (antes_do_inicio), a que entrou
//   está "a pagar"; o Mozart diz isso em vez de "deve estar pago"; faturamento com a margem média (contas ÷ margem).
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('loja-camila');
const D = lib('dinheiro'), TN = lib('tudo-ou-nada'), O = lib('orcamento'), CF = lib('contas-fixas');
const F = lib('assistente/ferramentas'), MZ = lib('assistente/ferramenta-contas-fixas'), AC = lib('acessos');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Camila' });
  const { dono, estoque: est, caixa: cx, tosador: tos } = L.sb;
  const P = L.P;
  const quantos = (rpc) => (rpc.data ?? []).length;
  const comCusto = (rpc) => (rpc.data ?? []).filter((x) => x.custo != null || x.custo_unitario != null).length;

  // produto com validade e lote, comprado de um fornecedor, com uma contagem concluída
  const forn = B.must(await dono.from('fornecedores').insert({ petshop_id: P, nome: 'Distribuidora' }).select('id').single(), 'fornecedor').id;
  const golden = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Ração Golden', unidade: 'un', preco_venda: 189.9, custo: 142, controla_validade: true }).select('id').single(), 'produto').id;
  await D.gravarMovimentos(dono, P, [{ petshop_id: P, produto_id: golden, tipo: 'entrada', quantidade: 6, custo_unitario: 142, motivo: 'Compra', lote: 'GLD1', validade: L.dia(20), fornecedor_id: forn, chave: D.novaChaveDeOperacao() }]);
  const cid = B.must(await dono.rpc('contagem_iniciar', { p_petshop: P, p_categoria: null, p_fornecedor: null, p_chave: D.novaChaveDeOperacao() }), 'contagem');
  B.must(await dono.rpc('contagem_marcar', { p_contagem: cid, p_itens: [{ produto_id: golden, contado: 5 }] }), 'contar');
  B.must(await dono.rpc('contagem_ajustar', { p_contagem: cid }), 'ajustar');
  const movId = B.sql(`select id from movimentos_estoque where produto_id='${golden}' and tipo='entrada' limit 1`);
  // uma devolução gravada (com o custo do item), como venda_devolver deixaria
  B.sql(`insert into devolucoes (petshop_id, modo, itens, valor, chave) values ('${P}', 'dinheiro', '[{"produto_id":"${golden}","nome":"Ração Golden","qtd":1,"valor":189.9,"custo":142}]', 189.9, 'teste-devolucao-camila')`);

  const leituras = async (sb) => ({
    produtos: await sb.rpc('produtos_reservado', { p: P }),
    custos: await sb.rpc('custos_dos_produtos', { p: P }),
    movimento: await sb.rpc('custos_dos_movimentos', { p_produto: golden }),
    movimentos: await sb.rpc('custos_dos_movimentos_do_petshop', { p: P }),
    compras: await sb.rpc('custos_das_compras', { p: P, p_fornecedor: forn }),
    lotes: await sb.rpc('produto_lotes', { p: P, p_produto: golden }),
    vencendo: await sb.rpc('estoque_vencendo', { p: P, p_dias: 60 }),
    contagem: await sb.rpc('contagem_ler', { p_contagem: cid }),
    lista: await sb.rpc('contagens_lista', { p: P }),
    direto: await sb.from('produtos').select('custo').eq('id', golden),
    devolucoes: await sb.from('devolucoes').select('id, itens').eq('petshop_id', P),
  });
  const nadaDeCusto = (r) => comCusto(r.produtos) === 0 && comCusto(r.custos) === 0 && comCusto(r.movimento) === 0 && comCusto(r.movimentos) === 0
    && comCusto(r.compras) === 0 && (r.lotes.data ?? []).every((l) => l.custo_unitario == null)
    && r.vencendo.data?.com_valor === false && (r.vencendo.data?.lotes ?? []).every((l) => l.valor == null)
    && r.contagem.data?.com_valor === false && r.contagem.data?.diferenca_valor == null && (r.contagem.data?.itens ?? []).every((i) => i.custo == null && i.valor == null)
    && (r.lista.data ?? []).every((c) => c.diferenca_valor == null) && !!r.direto.error && quantos(r.devolucoes) === 0;

  T.secao('Ver custo e margem: cada papel pela API');
  const rDono = await leituras(dono);
  T.ok('dono: custo do produto (142), da compra, do movimento, do lote, Vencendo e contagem com valor, devolução', comCusto(rDono.produtos) >= 1 && rDono.produtos.data.some((x) => x.id === golden && Number(x.custo) === 142)
    && comCusto(rDono.compras) === 1 && comCusto(rDono.movimento) >= 1 && rDono.lotes.data?.[0]?.custo_unitario != null && rDono.vencendo.data?.com_valor === true
    && rDono.contagem.data?.com_valor === true && Number(rDono.contagem.data?.diferenca_valor) === -142 && quantos(rDono.devolucoes) === 1, rDono.contagem.data?.diferenca_valor);
  const rEst = await leituras(est);
  T.ok('Estoque sem dinheiro (antes via o custo): nenhum custo, nenhuma margem, nenhum valor a preço de custo', nadaDeCusto(rEst), { produtos: rEst.produtos.data, vencendo: rEst.vencendo.data?.com_valor, contagem: rEst.contagem.data?.com_valor });
  T.ok('… mas continua vendo os lotes, o Vencendo e a contagem (quantidades)', (rEst.lotes.data ?? []).length === 1 && (rEst.vencendo.data?.lotes ?? []).length === 1 && (rEst.contagem.data?.itens ?? []).length >= 1, rEst.contagem.error);
  T.ok('… e o preço de venda (para cadastrar e vender)', (await est.rpc('produtos_precos', { p: P })).data?.some((x) => x.id === golden && Number(x.preco_venda) === 189.9));
  // a ficha de antes salvava o custo que leu (vazio para quem não vê): não pode apagar o custo do produto
  B.must(await est.from('produtos').update({ custo: null, estoque_minimo: 2 }).eq('id', golden).select('id'), 'estoque salva a ficha');
  T.ok('Estoque sem a chave salvando a ficha com o custo vazio: o custo (142) fica, o resto muda', B.sql(`select custo || '|' || estoque_minimo from produtos where id='${golden}'`) === '142.00|2.000');
  const rCx = await leituras(cx);
  T.ok('Recepção com Caixa (vê dinheiro): sem custo e sem devoluções', comCusto(rCx.produtos) === 0 && comCusto(rCx.compras) === 0 && comCusto(rCx.movimentos) === 0 && quantos(rCx.devolucoes) === 0 && !!rCx.direto.error);
  const rTos = await leituras(tos);
  T.ok('Tosador: sem custo', comCusto(rTos.produtos) === 0 && comCusto(rTos.movimentos) === 0);

  // o dono liga "Ver custo e margem" para o Edu (Estoque): a chave não liga o dinheiro
  B.sql(`update profissionais set acessos = array['estoque','custo'] where id='${L.ids.estoque}'`);
  const rEst2 = await leituras(est);
  T.ok('Estoque + "Ver custo e margem": custo, compras, lotes, Vencendo e contagem com valor', comCusto(rEst2.produtos) >= 1 && comCusto(rEst2.compras) === 1 && rEst2.lotes.data?.[0]?.custo_unitario != null
    && rEst2.vencendo.data?.com_valor === true && rEst2.contagem.data?.com_valor === true, rEst2.vencendo.data?.com_valor);
  T.ok('… sem ganhar o dinheiro: não lê lançamentos nem as devoluções', B.sql(`select ve_financeiro from profissionais where id='${L.ids.estoque}'`) === 'f'
    && quantos(rEst2.devolucoes) === 0 && (await est.from('lancamentos').select('id').eq('petshop_id', P)).data?.length === 0);
  T.ok('o aplicativo diz o mesmo (veCusto): dono, financeiro, gerente e a chave sim; estoque, caixa e tosador não',
    AC.veCusto({ papel: 'dono', ve_financeiro: true, acessos: null }) && AC.veCusto({ papel: 'funcionario', ve_financeiro: true, acessos: ['financeiro'] })
    && AC.veCusto({ papel: 'gerente', ve_financeiro: true, acessos: null }) && AC.veCusto({ papel: 'funcionario', ve_financeiro: false, acessos: ['estoque', 'custo'] })
    && !AC.veCusto({ papel: 'funcionario', ve_financeiro: false, acessos: ['estoque'] }) && !AC.veCusto({ papel: 'funcionario', ve_financeiro: true, acessos: ['caixa', 'estoque'] })
    && !AC.veCusto({ papel: 'funcionario', ve_financeiro: false, acessos: null }));
  T.ok('"Ver custo e margem" não é uma tela (a rota do Estoque continua sendo do Estoque)', AC.areaDaRota('/gestao/app/estoque') === 'estoque' && AC.areaDaRota('/gestao/app/estoque/contagem') === 'estoque');
  B.sql(`update profissionais set acessos = array['estoque'] where id='${L.ids.estoque}'`);

  T.secao('Mozart: o estoque e o que comprar só com custo para quem vê o custo');
  const eu = (id) => ({ ...JSON.parse(B.sql(`select row_to_json(x) from (select id, papel, ve_financeiro, acessos, nome from profissionais where id='${id}') x`)), ativo: true });
  const ctx = (sb, id, fin) => ({ sb, userId: 'u', petshop: { id: P, nome: 'Camila', horario: null, modulos: ['banho_tosa', 'loja'] }, eu: eu(id), equipe: [], servicos: [], vejoFinanceiro: fin, cuidoDoFinanceiro: fin, fusoMin: -180, agora: `${L.hoje}T10:00` });
  const verEst = JSON.parse((await F.rodarConsulta(ctx(est, L.ids.estoque, false), 'ver_estoque', { termo: 'golden' })).conteudo);
  const verDono = JSON.parse((await F.rodarConsulta(ctx(dono, L.ids.dono, true), 'ver_estoque', { termo: 'golden' })).conteudo);
  const verCx = JSON.parse((await F.rodarConsulta(ctx(cx, L.ids.caixa, true), 'ver_estoque', { termo: 'golden' })).conteudo);
  const temCusto = (r) => JSON.stringify(r).includes('"custo"') || JSON.stringify(r).includes('valor_a_preco_de_custo');
  T.ok('ver_estoque: o dono recebe o custo e o valor dos lotes vencendo', temCusto(verDono), verDono);
  T.ok('ver_estoque: Estoque sem a chave e a recepção não recebem custo nenhum', !temCusto(verEst) && !temCusto(verCx), [verEst, verCx]);
  const compraEst = JSON.parse((await F.rodarConsulta(ctx(est, L.ids.estoque, false), 'o_que_comprar', {})).conteudo);
  T.ok('o_que_comprar: Estoque sem a chave não recebe o valor em estoque', !('valor_em_estoque' in compraEst), compraEst);

  T.secao('Entrada com a despesa: as duas juntas, ou nenhuma');
  const sachet = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Sachê', unidade: 'un', preco_venda: 4.5, custo: 2 }).select('id').single(), 'sachê').id;
  const saldo = (id) => B.num(`select estoque from produtos where id='${id}'`);
  const despesas = () => B.num(`select count(*) from lancamentos where petshop_id='${P}' and tipo='saida' and categoria='Produtos e material'`);
  const entrada = (sb, chave, despesa, qtd = 4) => sb.rpc('estoque_entrada', { p_petshop: P, p_chave: chave, p_movimento: { produto_id: golden, quantidade: qtd, custo_unitario: 150, lote: 'GLD2611', validade: L.dia(118), fornecedor_id: forn }, ...(despesa ? { p_despesa: despesa } : {}) });
  const ch1 = D.novaChaveDeOperacao();
  const s0 = saldo(golden), d0 = despesas();
  const e1 = await entrada(dono, ch1, { valor: 600, pago: true, forma: 'pix', descricao: 'Compra: 4 un de Ração Golden' });
  T.passa('dono: 4 un a R$ 150,00 com a despesa de R$ 600,00 no Pix', e1, e1.data?.movimento_id && e1.data?.lancamento_id);
  T.ok('… o estoque subiu 4 e a despesa de R$ 600,00 está no Financeiro (paga, Pix, hoje)', saldo(golden) === s0 + 4 && despesas() === d0 + 1
    && B.sql(`select valor || '|' || forma || '|' || pago || '|' || data from lancamentos where id='${e1.data.lancamento_id}'`) === `600.00|pix|true|${L.hoje}`);
  const e1b = await entrada(dono, ch1, { valor: 600, pago: true, forma: 'pix' });
  T.ok('mesma chave de novo (toque duplo): devolve o que já fez, sem repetir', e1b.data?.repetido === true && saldo(golden) === s0 + 4 && despesas() === d0 + 1);
  const s1 = saldo(golden);
  T.recusa('despesa sem a forma de pagamento: recusada', await entrada(dono, D.novaChaveDeOperacao(), { valor: 600, pago: true }), /Escolha como você pagou/);
  T.ok('… e a entrada também não ficou (nada pela metade)', saldo(golden) === s1 && despesas() === d0 + 1);
  T.recusa('Estoque sem dinheiro com a despesa: recusada', await entrada(est, D.novaChaveDeOperacao(), { valor: 600, pago: true, forma: 'pix' }), /caixa ou do financeiro/);
  T.ok('… e a entrada também não ficou', saldo(golden) === s1);
  T.recusa('Recepção (Caixa) anotando a compra para pagar depois: recusada', await cx.rpc('estoque_entrada', { p_petshop: P, p_chave: D.novaChaveDeOperacao(), p_movimento: { produto_id: sachet, quantidade: 10, custo_unitario: 2 }, p_despesa: { valor: 20, pago: false, vencimento: L.dia(10) } }), /pagar depois/);
  T.ok('… e o sachê não entrou', saldo(sachet) === 0);
  const e2 = await entrada(est, D.novaChaveDeOperacao(), null, 2);
  T.passa('Estoque sem despesa: a entrada entra sozinha', e2, saldo(golden) === s1 + 2);
  const e3 = await entrada(dono, D.novaChaveDeOperacao(), { valor: 300, pago: false, vencimento: L.dia(15) }, 2);
  T.passa('dono: "Vou pagar depois" (dia 15 dias à frente)', e3, B.sql(`select pago || '|' || vencimento || '|' || coalesce(forma, '-') from lancamentos where id='${e3.data?.lancamento_id}'`) === `false|${L.dia(15)}|-`);
  T.ok('as entradas com lote GLD2611 (4 + 2 + 2) ficaram no lote, com a validade', B.sql(`select quantidade || '|' || validade from produtos_lotes where produto_id='${golden}' and lote='GLD2611'`) === `8.000|${L.dia(118)}`);

  T.secao('Estoque inicial com lote e validade (produto com Controlar validade)');
  const novo = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Vermífugo', unidade: 'un', controla_validade: true }).select('id').single(), 'vermífugo').id;
  await D.gravarMovimentos(dono, P, [{ petshop_id: P, produto_id: novo, tipo: 'entrada', quantidade: 6, motivo: 'Estoque inicial', lote: 'VRM1', validade: L.dia(40), chave: D.novaChaveDeOperacao() }]);
  T.ok('os 6 do estoque inicial ficam no lote VRM1 com a validade (e aparecem no Vencendo)', B.sql(`select quantidade || '|' || validade from produtos_lotes where produto_id='${novo}'`) === `6.000|${L.dia(40)}`
    && (await dono.rpc('estoque_vencendo', { p: P, p_dias: 60 })).data?.lotes?.some((l) => l.produto_id === novo));

  T.secao('Orçamento: virou venda sem marcar o serviço');
  const itens = [
    { tipo: 'produto', nome: 'Cama', qtd: 1, valor: 149.9, produto_id: golden },
    { tipo: 'produto', nome: 'Premier', qtd: 2, valor: 89.9, produto_id: golden },
    { tipo: 'servico', nome: 'Banho', qtd: 1, valor: 45, servico_id: L.S.Banho },
  ];
  const orc = B.must(await cx.from('orcamentos').insert({ petshop_id: P, cliente_id: L.tutores.Ana, itens, desconto: 10, validade: L.dia(7), chave: D.novaChaveDeOperacao() }).select('id, total').single(), 'orçamento');
  T.ok('orçamento: 149,90 + 179,80 + 45 − 10 = 364,70', Number(orc.total) === 364.7);
  const rep = O.repartirDesconto(itens, 10);
  T.ok('desconto repartido: produtos − 8,80 (venda de 320,90) e o banho por 43,80', rep.descontoProdutos === 8.8 && rep.servicos[0].preco === 43.8, rep);
  const chV = D.novaChaveDeOperacao();
  const linhas = itens.filter((i) => i.tipo === 'produto');
  await TN.fazerTudoOuNada(cx, P, chV, { funcao: 'orcamento_vender', orcamento: orc.id }, [
    { t: 'lancamento', nome: 'venda', chave: chV, linha: { tipo: 'entrada', valor: 320.9, forma: 'pix', categoria: 'Venda de produtos', cliente_id: L.tutores.Ana, pago: true, data: L.hoje, descricao: 'Venda do orçamento', itens: linhas } },
  ]);
  const lido = B.must(await cx.from('orcamentos').select('status, total, desconto, itens, lancamento_id, agendamento_id, valor_vendido').eq('id', orc.id).single(), 'ler orçamento');
  T.ok('virou venda de R$ 320,90 (o que entrou), não 364,70', Number(lido.valor_vendido) === 320.9 && O.valorDaVenda(lido) === 320.9, lido.valor_vendido);
  T.ok('… e o serviço continua para marcar: Falta marcar Banho R$ 43,80', O.faltaMarcar(lido) && O.servicosAMarcar(lido).length === 1 && O.servicosAMarcar(lido)[0].preco === 43.8);
  const ini = B.instante(L.dia(2), '10:00', L.fuso);
  const ag = B.must(await cx.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Thor, servico_id: L.S.Banho, inicio: ini.toISOString(), fim: new Date(+ini + 3600e3).toISOString() }).select('id').single(), 'horário').id;
  T.passa('dias depois, o horário marcado pelo orçamento completa a ligação', await cx.rpc('orcamento_marcar', { p_orcamento: orc.id, p_agendamento: ag }));
  const lido2 = B.must(await cx.from('orcamentos').select('status, itens, desconto, total, lancamento_id, agendamento_id, valor_vendido').eq('id', orc.id).single(), 'ler de novo');
  T.ok('… agora não falta marcar nada e o valor da venda continua R$ 320,90', !O.faltaMarcar(lido2) && lido2.agendamento_id === ag && Number(lido2.valor_vendido) === 320.9);
  const texto = O.textoDoOrcamento({ loja: 'Camila', numero: 1, para: 'Ana', itens, desconto: 10, validade: L.dia(7), obs: 'Preço à vista no Pix. Entrega no sábado.' });
  T.ok('o texto do WhatsApp leva a observação para o cliente', texto.includes('Preço à vista no Pix. Entrega no sábado.'), texto);

  T.secao('Contas fixas: o que aconteceu de verdade neste mês');
  const dia = Number(L.hoje.slice(8, 10));
  const fim = CF.vencimentoNoMes(L.mes1, 31);
  const salvar = (conta) => dono.rpc('contas_fixas_salvar', { p: P, p_conta: { id: B.uuid(), ...conta } });
  const aluguel = B.must(await salvar({ nome: 'Aluguel', categoria: 'Aluguel', dia: 1, valor: 3500, frequencia: 'mensal', comeca_em: L.hoje }), 'aluguel').id;
  const perto = Math.min(dia + 3, 28);
  const das = B.must(await salvar({ nome: 'Imposto (DAS)', categoria: 'Impostos e taxas', dia: perto, valor: 680, valor_varia: true, frequencia: 'mensal', comeca_em: L.mes1 }), 'das').id;
  await CF.gerarContasFixas(dono, P);
  const sit = await CF.lerSituacaoContasFixas(dono, P, L.mes1, fim);
  const doAluguel = sit?.find((s) => s.conta_fixa_id === aluguel), doDas = sit?.find((s) => s.conta_fixa_id === das);
  if (dia > 1) T.ok('aluguel do dia 1 cadastrado hoje: a conta deste mês não existe (antes_do_inicio), não "paga"', doAluguel?.situacao === 'antes_do_inicio' && CF.fraseDaSituacao(doAluguel, L.hoje).startsWith('não existe conta'), doAluguel);
  if (perto > dia) T.ok('DAS que vence em 3 dias: em A pagar, valor estimado', doDas?.situacao === 'a_pagar' && doDas.estimado === true, doDas);
  const falta = CF.aindaAPagar(sit ?? []);
  if (perto > dia) T.ok('Quanto sobrou: ainda a pagar no mês inclui o DAS (R$ 680,00) e não o aluguel', falta.itens.some((x) => x.conta_fixa_id === das) && !falta.itens.some((x) => x.conta_fixa_id === aluguel));
  T.recusa('a recepção não lê a situação das contas fixas', await cx.rpc('contas_fixas_situacao', { p: P, p_de: L.mes1, p_ate: fim }));
  const vc = await MZ.consultarContasFixas(ctx(dono, L.ids.dono, true), 'ver_contas_fixas', (m) => new Error(m));
  const doMes = vc.resultado.este_mes ?? [];
  if (dia > 1) T.ok('Mozart: o aluguel "não existe conta de MM/AAAA: a conta fixa começou em …", nada de "deve estar pago"', doMes.some((x) => x.conta === 'Aluguel' && /^não existe conta/.test(x.o_que_aconteceu) && /começou em/.test(x.o_que_aconteceu)), doMes);
  T.ok('Mozart: a regra manda usar este_mes e nunca deduzir que foi paga', /nunca deduza/.test(vc.resultado.regra));

  T.secao('Quanto precisa faturar, com a margem');
  const contas = { totais: { receitaComCusto: 1238.1, pct: 37 }, ponte: { entradas: 1238.1 } };
  const fm = CF.faturamentoComMargem(4759, contas);
  T.ok('4.759 de contas fixas e 37% de margem: cerca de R$ 12.862,16 de faturamento', fm?.faturamento === 12862.16 && fm.pct === 37, fm);
  T.ok('sem custo informado na maior parte do que entrou: sem estimativa (não inventa)', CF.faturamentoComMargem(4759, { totais: { receitaComCusto: 100, pct: 37 }, ponte: { entradas: 1238.1 } }) === null);
  T.ok('margem desconhecida ou de 100%: sem estimativa', CF.faturamentoComMargem(4759, { totais: { receitaComCusto: 1000, pct: null }, ponte: { entradas: 1000 } }) === null
    && CF.faturamentoComMargem(4759, { totais: { receitaComCusto: 1000, pct: 100 }, ponte: { entradas: 1000 } }) === null);
}))();
