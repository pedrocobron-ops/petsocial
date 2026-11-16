// Dinheiro de um dia de banho e tosa, pelo mesmo código das telas (src/lib/gestao/dinheiro.ts, credito.ts, faturamento.ts):
// vários serviços + produto na mesma conta, pagamento em parte, conta a receber (dívida), crédito do tutor, devolução,
// "não cobrar", preço travado (o que a recepção não consegue) e a comissão conferida ao centavo com a conta feita à mão.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('dinheiro');
const D = lib('dinheiro'), C = lib('credito'), F = lib('faturamento');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Dinheiro' });
  const { dono, caixa: cx, tosador: tos } = L.sb;
  const P = L.P;
  const lanc = (where) => JSON.parse(B.sql(`select coalesce(json_agg(json_build_object('valor', valor, 'pago', pago, 'forma', forma, 'credito', credito_usado, 'original', valor_original) order by criado_em), '[]') from lancamentos where petshop_id='${P}' and ${where}`));

  // regras de comissão: 40% do tosador; Hidratação 50% e Corte de unhas 10% (por serviço); produtos 10%
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'comissao.por_servico': true, 'comissao.em_produtos': true, 'comissao.produtos_pct': 10, 'dinheiro.preco_travado': true, 'dinheiro.desconto_max_caixa': 0 } }), 'opções');
  B.must(await dono.from('comissao_servicos').insert([{ petshop_id: P, servico_id: L.S['Hidratação'], pct: 50 }, { petshop_id: P, servico_id: L.S['Corte de unhas'], pct: 10 }]).select('servico_id'), 'comissão por serviço');
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'abrir o caixa');

  // o dono marca os horários de hoje (preço da lista), o tosador conclui pelo celular (sem conta)
  const marca = async (pet, h, servico, outros = []) => {
    const ini = B.instante(L.hoje, h, L.fuso);
    const porte = B.sql(`select porte from pets where id='${L.pets[pet]}'`);
    const id = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets[pet], servico_id: L.S[servico], profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 45 * 6e4).toISOString(), preco: L.preco(servico, porte) }).select('id').single(), 'horário ' + pet).id;
    if (outros.length) B.must(await dono.rpc('agendamento_servicos_definir', { p_agendamento: id, p_servicos: outros.map((s) => ({ servico_id: L.S[s], preco: L.preco(s, porte) })) }), 'outros serviços');
    return id;
  };
  const A = {
    Thor: await marca('Thor', '08:00', 'Banho', ['Hidratação', 'Corte de unhas']), // M: 60 + 30 + 15
    Bob: await marca('Bob', '09:00', 'Banho'), // G: 70
    Luna: await marca('Luna', '10:00', 'Banho'), // M: 60
    Rex: await marca('Rex', '11:00', 'Banho'), // GG: 80
  };
  for (const id of Object.values(A)) B.must(await tos.from('agendamentos').update({ status: 'concluido' }).eq('id', id).select('id').single(), 'tosador conclui');

  T.secao('para cobrar');
  let pc = B.must(await cx.rpc('agendamentos_para_cobrar', { p: P }), 'para cobrar');
  T.ok('os 4 concluídos sem conta aparecem para o caixa', pc.length === 4 && Object.values(A).every((id) => pc.some((x) => x.id === id)), pc.length);
  const doTos = B.must(await tos.rpc('agendamentos_para_cobrar', { p: P }), 'para cobrar (tosador)');
  T.ok('o tosador recebe a mesma lista, sem valor (só id e hora)', doTos.length === 4 && Object.keys(doTos[0]).sort().join() === 'id,inicio', doTos[0]);

  T.secao('conta com 3 serviços + produto (preço travado, pela recepção)');
  const chThor = D.novaChaveDeOperacao();
  const itensThor = [
    { tipo: 'servico', nome: 'Banho', qtd: 1, valor: 60 },
    { tipo: 'servico', nome: 'Hidratação', qtd: 1, valor: 30, servico_id: L.S['Hidratação'] },
    { tipo: 'servico', nome: 'Corte de unhas', qtd: 1, valor: 15, servico_id: L.S['Corte de unhas'] },
    { tipo: 'produto', nome: 'Shampoo Neutro', qtd: 1, valor: 29.9, produto_id: L.prod },
  ];
  const lThor = await D.lancarPago(cx, P, { tipo: 'entrada', valor: 134.9, forma: 'pix', categoria: 'Banho e tosa', agendamentoId: A.Thor, clienteId: L.tutores.Ana, itens: itensThor, chave: chThor, descricao: 'Banho + Hidratação + Corte de unhas · Thor' });
  await D.gravarMovimentos(cx, P, [{ petshop_id: P, produto_id: L.prod, tipo: 'saida', quantidade: 1, motivo: 'Venda', lancamento_id: lThor.id, chave: D.parteDaChave(chThor, 'estoque', L.prod) }]);
  T.ok('uma entrada de R$ 134,90 no caixa aberto', lanc(`agendamento_id='${A.Thor}'`).length === 1 && B.num(`select valor from lancamentos where id='${lThor.id}'`) === 134.9 && B.sql(`select caixa_id is not null from lancamentos where id='${lThor.id}'`) === 't');
  T.ok('estoque baixou 1 (20 → 19)', B.num(`select estoque from produtos where id='${L.prod}'`) === 19, B.sql(`select estoque from produtos where id='${L.prod}'`));
  const de2 = await D.lancarPago(cx, P, { tipo: 'entrada', valor: 134.9, forma: 'pix', categoria: 'Banho e tosa', agendamentoId: A.Thor, clienteId: L.tutores.Ana, itens: itensThor, chave: chThor });
  T.ok('a mesma operação de novo (toque duplo) devolve a mesma entrada', de2.id === lThor.id && lanc(`agendamento_id='${A.Thor}'`).length === 1);
  let erro = null; try { await D.lancarPago(cx, P, { tipo: 'entrada', valor: 134.9, forma: 'pix', categoria: 'Banho e tosa', agendamentoId: A.Thor, itens: itensThor, chave: D.novaChaveDeOperacao() }); } catch (e) { erro = e.message; }
  T.ok('outra pessoa recebendo o mesmo atendimento é recusada', /já tem recebimento/.test(erro ?? ''), erro);

  T.secao('pagamento em parte e dívida');
  const chBob = D.novaChaveDeOperacao();
  const contaBob = await D.lancarAReceber(cx, P, { valor: 70, vencimento: L.dia(7), categoria: 'Banho e tosa', agendamentoId: A.Bob, clienteId: L.tutores.Beto, itens: [{ tipo: 'servico', nome: 'Banho', qtd: 1, valor: 70 }], chave: D.parteDaChave(chBob, 'conta') });
  const parte = await D.receberConta(cx, contaBob.id, { valor: 40, forma: 'dinheiro', chave: D.parteDaChave(chBob, 'parte') });
  T.ok('recebe R$ 40,00 agora; faltam R$ 30,00', !parte.quitada && parte.falta === 30 && parte.no_caixa, parte);
  T.ok('a conta fica com R$ 30,00 em aberto e lembra o valor original (70)', B.sql(`select valor || '|' || pago || '|' || valor_original from lancamentos where id='${contaBob.id}'`) === '30.00|false|70.00', B.sql(`select valor || '|' || pago || '|' || valor_original from lancamentos where id='${contaBob.id}'`));
  const deve = B.must(await dono.rpc('tutores_dinheiro', { p_petshop: P }), 'tutores_dinheiro');
  const beto = (Array.isArray(deve) ? deve : []).find((x) => x.cliente_id === L.tutores.Beto);
  T.ok('Beto aparece devendo R$ 30,00', beto && Object.values(beto).some((v) => Number(v) === 30), deve);
  const parte2 = await D.receberConta(cx, contaBob.id, { valor: 40, forma: 'dinheiro', chave: D.parteDaChave(chBob, 'parte') });
  T.ok('a mesma parte de novo (mesma chave) não recebe outra vez', B.num(`select valor from lancamentos where id='${contaBob.id}'`) === 30 && parte2.recebido === 40, parte2);
  const tentaMais = await cx.rpc('receber_conta', { p_conta: contaBob.id, p_valor: 31, p_forma: 'pix', p_chave: B.uuid() });
  T.recusa('receber mais do que falta é recusado', tentaMais);

  T.secao('crédito do tutor');
  // sinal de R$ 100,00 de uma estadia que saiu por R$ 80,00: sobram R$ 20,00 de crédito para a Clara
  await D.lancarPago(dono, P, { tipo: 'entrada', valor: 100, forma: 'pix', categoria: 'Creche e hotel', descricao: 'Sinal da estadia', clienteId: L.tutores.Clara, chave: D.novaChaveDeOperacao() });
  await C.moverCredito(dono, P, { clienteId: L.tutores.Clara, valor: 20, motivo: 'Pago a mais na estadia', chave: D.novaChaveDeOperacao() });
  T.ok('Clara tem R$ 20,00 de crédito', (await C.creditoDoTutor(cx, P, L.tutores.Clara)).saldo === 20);
  const chLuna = D.novaChaveDeOperacao();
  const contaLuna = await D.lancarAReceber(cx, P, { valor: 60, vencimento: L.hoje, categoria: 'Banho e tosa', agendamentoId: A.Luna, clienteId: L.tutores.Clara, itens: [{ tipo: 'servico', nome: 'Banho', qtd: 1, valor: 60 }], chave: chLuna });
  const comCred = await D.receberComCredito(cx, contaLuna.id, 20, D.parteDaChave(chLuna, 'credito'));
  T.ok('R$ 20,00 do crédito pagam parte da conta da Luna; faltam R$ 40,00', comCred.falta === 40, comCred);
  await D.receberComCredito(cx, contaLuna.id, 20, D.parteDaChave(chLuna, 'credito'));
  T.ok('crédito usado de novo com a mesma chave: não gasta outra vez', (await C.creditoDoTutor(cx, P, L.tutores.Clara)).saldo === 0 && B.num(`select valor from lancamentos where id='${contaLuna.id}'`) === 40);
  T.recusa('sem saldo, o crédito não paga mais nada', await cx.rpc('receber_conta_com_credito', { p_conta: contaLuna.id, p_valor: 5, p_chave: B.uuid() }));
  const resto = await D.receberConta(cx, contaLuna.id, { valor: 40, forma: 'pix', chave: D.parteDaChave(chLuna, 'resto') });
  T.ok('o resto (R$ 40,00 no pix) quita a conta', resto.quitada, resto);

  T.secao('não cobrar e preço travado');
  T.recusa('trava: a recepção não marca "não cobrar"', await cx.from('agendamentos').update({ sem_cobranca: true }).eq('id', A.Rex).select('id'), /travado/i);
  T.passa('o dono marca "não vou cobrar" o Rex', await dono.from('agendamentos').update({ sem_cobranca: true }).eq('id', A.Rex).select('id'));
  T.ok('… com nome e hora de quem marcou', B.sql(`select (sem_cobranca_nome is not null and sem_cobranca_em is not null)::text from agendamentos where id='${A.Rex}'`) === 'true');
  pc = B.must(await cx.rpc('agendamentos_para_cobrar', { p: P }), 'para cobrar');
  T.ok('para cobrar fica vazio (recebido, em parte, com crédito e não cobrado saem)', pc.length === 0, pc);
  const venda = (itens, valor) => cx.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor, forma: 'pix', categoria: 'Venda de produtos', data: L.hoje, pago: true, origem: 'tela', itens }).select('id');
  T.recusa('trava: a recepção não vende abaixo do preço', await venda([{ tipo: 'produto', nome: 'Shampoo Neutro', qtd: 1, valor: 20, produto_id: L.prod }], 20), /muda o preço/);
  T.recusa('trava: a recepção não dá desconto', await venda([{ tipo: 'produto', nome: 'Shampoo Neutro', qtd: 1, valor: 29.9, produto_id: L.prod }], 25), /desconto/);
  const ini5 = B.instante(L.dia(1), '14:00', L.fuso);
  const abaixo = await cx.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Mel, servico_id: L.S.Banho, inicio: ini5.toISOString(), fim: new Date(+ini5 + 36e5).toISOString(), preco: 10 }).select('id');
  T.ok('trava: horário marcado pela recepção sai pelo preço da lista (o valor mandado é ignorado ou recusado)', !!abaixo.error || B.num(`select preco from agendamentos where id='${abaixo.data[0].id}'`) === 50, abaixo.error?.message ?? B.sql(`select preco from agendamentos where id='${abaixo.data[0].id}'`));
  const ok1 = await venda([{ tipo: 'produto', nome: 'Shampoo Neutro', qtd: 2, valor: 29.9, produto_id: L.prod }], 59.8);
  T.passa('trava: venda pelo preço da lista passa', ok1);
  if (ok1.data?.[0]) B.sql(`delete from lancamentos where id='${ok1.data[0].id}'`);
  const anot = JSON.parse(B.sql(`select coalesce(json_agg(tipo order by quando), '[]') from precos_alterados where petshop_id='${P}'`));
  T.ok('nos fluxos normais só o "não cobrar" ficou anotado em Alterações em valores', JSON.stringify(anot) === '["sem_cobranca"]', anot);
  // sem a trava, a recepção dá desconto e o banco anota para o dono
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'dinheiro.preco_travado': false, 'dinheiro.desconto_max_caixa': null } }), 'trava desligada');
  const comDesc = await venda([{ tipo: 'produto', nome: 'Shampoo Neutro', qtd: 1, valor: 29.9, produto_id: L.prod }], 25);
  T.passa('sem a trava, a recepção vende com desconto', comDesc);
  const alt = B.must(await dono.rpc('alteracoes_de_valores', { p: P, p_todas: true }), 'alterações');
  T.ok('… e o desconto aparece para o dono em Alterações em valores', alt.some((x) => x.tipo === 'desconto') && B.num(`select count(*) from precos_alterados where petshop_id='${P}' and lancamento_id='${comDesc.data?.[0]?.id}'`) === 1, alt.map((x) => x.tipo));
  T.ok('a recepção não lê Alterações em valores', ((await cx.rpc('alteracoes_de_valores', { p: P, p_todas: true })).data ?? []).length === 0);
  if (comDesc.data?.[0]) B.sql(`set session_replication_role = replica; delete from precos_alterados where lancamento_id='${comDesc.data[0].id}'; delete from lancamentos where id='${comDesc.data[0].id}'`);

  T.secao('devolução e faturamento do dia');
  await D.lancarPago(dono, P, { tipo: 'saida', valor: 10, forma: 'pix', categoria: 'Devolução', descricao: 'Devolução: shampoo com defeito', clienteId: L.tutores.Ana, chave: D.novaChaveDeOperacao() });
  const entradas = B.num(`select coalesce(sum(valor), 0) from lancamentos where petshop_id='${P}' and tipo='entrada' and pago and movimento is null and data='${L.hoje}'`);
  const aj = await F.ajustesDoFaturamento(dono, P, L.hoje, L.hoje);
  const fat = F.faturamentoLiquido(entradas, aj);
  // à mão: Thor 134,90 + Bob 40 (parte) + estadia 80 (sinal 100 − crédito 20) + Luna 60 (20 de crédito + 40) − devolução 10 = 304,90
  T.ok('faturamento líquido de hoje: R$ 304,90', B.centavos(fat) === 30490, { entradas, aj: { devolvido: aj.devolvido, creditoDeixado: aj.creditoDeixado, creditoUsadoFora: aj.creditoUsadoFora }, fat });
  const gaveta = B.num(`select coalesce(sum(valor), 0) from lancamentos where petshop_id='${P}' and caixa_id is not null and forma='dinheiro' and tipo='entrada'`);
  T.ok('dinheiro na gaveta: só os R$ 40,00 do Bob (o resto foi pix e crédito)', gaveta === 40, gaveta);

  T.secao('comissão ao centavo');
  const linha = (x) => x && [x.atendimentos, x.com_pacote, B.centavos(x.base), B.centavos(x.base_produtos), B.centavos(x.comissao_servicos), B.centavos(x.comissao_produtos), B.centavos(x.comissao)].join('|');
  const doBanco = () => dono.rpc('comissao_do_periodo', { p_petshop: P, p_de: L.mes1, p_ate: L.hoje }).then((r) => B.must(r, 'comissão').find((x) => x.profissional_id === L.ids.tosador));
  // à mão: Thor 60×40% + 30×50% + 15×10% = 40,50; Bob 70×40% = 28 (vale o valor da conta, mesmo pago em parte);
  // Luna 60×40% = 24; Rex (não cobrado: vale o preço da agenda) 80×40% = 32; produto 29,90×10% = 2,99. Base 105+70+60+80 = 315.
  const esperado = '4|0|31500|2990|12450|299|12749';
  const c1 = await doBanco();
  T.ok('comissão do tosador = R$ 127,49 (serviços 124,50 + produto 2,99)', linha(c1) === esperado, linha(c1));
  const minha = B.must(await tos.rpc('minha_comissao', { p_petshop: P }), 'minha comissão');
  T.ok('"Minha comissão" do tosador mostra o mesmo', linha(minha.meses?.[0]) === esperado, linha(minha.meses?.[0]));
  T.passa('dono paga a comissão do período', await dono.rpc('comissao_pagar', { p_profissional: L.ids.tosador, p_de: L.mes1, p_ate: L.hoje, p_forma: 'pix', p_valor: 127.49, p_chave: B.uuid() }));
  T.ok('sem pendência depois de pagar', (B.must(await dono.rpc('comissao_pendencias', { p_petshop: P }), 'pendências') ?? []).length === 0);
  T.recusa('pagar de novo sem nada devido é recusado', await dono.rpc('comissao_pagar', { p_profissional: L.ids.tosador, p_de: L.mes1, p_ate: L.hoje, p_forma: 'pix', p_valor: 10, p_chave: B.uuid() }));
  T.recusa('o tosador não paga a própria comissão', await tos.rpc('comissao_pagar', { p_profissional: L.ids.tosador, p_de: L.mes1, p_ate: L.hoje, p_forma: 'pix', p_valor: 1, p_chave: B.uuid() }));
  // Bob paga o resto: a comissão não muda (já contava a conta inteira)
  await D.receberConta(cx, contaBob.id, { valor: 30, forma: 'pix', chave: B.uuid() });
  T.ok('Bob paga o resto: comissão continua R$ 127,49 e nada fica pendente', linha(await doBanco()) === esperado && (B.must(await dono.rpc('comissao_pendencias', { p_petshop: P }), 'pendências') ?? []).length === 0);
}))();
