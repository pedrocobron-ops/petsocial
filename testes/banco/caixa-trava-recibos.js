// Rodada 9 (N5), migração 20261231: caixa, trava de preço e recibos. Todos os totais conferidos à mão.
// - C1 trava em creche e hotel: com `dinheiro.preco_travado` e desconto máximo de 10%, a recepção (área Caixa, sem Financeiro)
//   não faz check-in abaixo da diária da lista (creche R$ 70), não cobra menos diárias do que as datas (hotel: 4 noites),
//   nem recebe abaixo da conta (creche 70: 10% = 7,00, então 63,00 passa e 62,99 não); pela API direta também não.
//   Pacote do próprio pet zera as diárias; pacote de outro pet não. O dono muda, e fica em Alterações (diaria, diarias, checkout).
// - H1 apagar um valor recebido com a trava: recusado para a recepção (venda de 12,50), como baixar o valor; o dono apaga.
// - H2 fiado pelo que fica: limite 150, conta de 175,50 com 100,00 pagos na hora fica 75,50 e passa; depois, mais 80,00
//   (75,50 + 80,00 = 155,50) é recusado e mais 74,50 (150,00 justos) passa; 175,50 inteiros é recusado.
// - M3 falta com a taxa numa gravação só (`agendamento_faltou`): status e conta de R$ 20,00 juntos; a mesma chave não repete.
// - H2 (dono) Mozart "paguei a luz hoje no pix": conta fixa Luz de 250,00 (estimado) em A pagar; a saída solta de 268,40 é
//   recusada com o conta_id; `pagar_conta` acerta o valor para 268,40 e dá baixa; no mês saiu 268,40 uma vez só (não 536,80).
// - M2/M8 devolução ligada à entrada (`entrada_devolver`): 50,00 recebidos, devolve 20,00 e depois 30,00; mais 0,01 é recusado;
//   as duas aparecem em Alterações. Troca (29,99 por 34,90): `trocas_do_caixa` diz que 29,99 de cada lançamento não é dinheiro.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const T = require('../lib/teste')('caixa-trava-recibos');
const { lib } = require('../lib/app');
const PC = require('../../src/lib/gestao/assistente/ferramenta-pagar-conta.ts');
void lib;

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Trava e recibos' });
  const { dono, caixa: cx, monitor } = L.sb;
  const P = L.P;
  const ch = (s) => `t-${s}-${B.sufixo()}`;
  const agora = () => new Date().toISOString();
  const haDias = (n) => new Date(Date.now() - n * 864e5).toISOString();
  const alteracoes = (tipo) => B.num(`select count(*) from precos_alterados where petshop_id='${P}' and tipo='${tipo}'`);
  const ultima = (tipo) => B.sql(`select de || '>' || para || '|' || coalesce(quem_nome, '') from precos_alterados where petshop_id='${P}' and tipo='${tipo}' order by quando desc limit 1`);
  const status = (id) => B.sql(`select status from estadias where id='${id}'`);
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'dinheiro.preco_travado': true, 'dinheiro.desconto_max_caixa': 10, 'dinheiro.taxa_falta': 20, 'dinheiro.limite_fiado': 150 } }), 'opções');
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'abrir o caixa');

  const checkin = (sb, pet, tipo, diaria, entrada = agora()) => sb.from('estadias').insert({ petshop_id: P, pet_id: pet, tipo, status: 'em_casa', entrada, ...(diaria === undefined ? {} : { valor_diaria: diaria }) }).select('id').single();
  // o que a folha de check-out manda: encerrar, o dinheiro e a conta guardada (com `soma`)
  const checkout = (sb, id, { diarias = 1, total, soma, extra = [], acertar = false }) => sb.rpc('estadia_checkout', { p_petshop: P, p_estadia: id, p_chave: ch('co'), p_passos: [
    acertar ? { t: 'estadia_acertar', id, diarias, valor: total } : { t: 'estadia_fechar', id, saida: agora(), diarias, valor_cobrado: total },
    ...(total > 0 ? [{ t: 'lancamento', nome: 'principal', linha: { tipo: 'entrada', valor: total, forma: 'pix', categoria: 'Creche e hotel', descricao: 'Estadia', pago: true, data: L.hoje } }] : []),
    ...extra,
    ...(soma == null ? [] : [{ t: 'estadia_valores', estadia: id, modo: 'upsert', campos: { conta: { v: 1, soma, total, diarias } } }]),
  ] });

  T.secao('C1 creche: a diária e o valor da saída dentro da trava');
  let r = await checkin(cx, L.pets.Mel, 'creche', 5);
  T.recusa('recepção: check-in da creche a R$ 5,00 (lista R$ 70,00) recusado', r, /diária da creche é R\$ 70,00/);
  r = await checkin(cx, L.pets.Mel, 'creche', 70);
  T.passa('recepção: check-in pela diária da lista passa', r);
  const mel = r.data.id;
  r = await cx.from('estadias').update({ valor_diaria: 10 }).eq('id', mel).select('id');
  T.recusa('recepção: baixar a diária de 70,00 para 10,00 depois do check-in é recusado', r, /só o dono ou quem vê o financeiro/);
  r = await checkout(cx, mel, { total: 10, soma: 70 });
  T.recusa('recepção: "Valor a receber" de 60 para 10 (conta de R$ 70,00) recusado', r, /Pela conta, a estadia dá R\$ 70,00.*máximo de 10 por cento.*R\$ 7,00/);
  T.ok('nada gravado: Mel continua na casa', status(mel) === 'em_casa');
  r = await checkout(cx, mel, { total: 62.99, soma: 70 });
  T.recusa('R$ 62,99 (desconto de 7,01, um centavo acima dos 10%) recusado', r, /desconto passa do máximo/);
  r = await cx.from('estadias').update({ status: 'encerrada', saida: agora(), diarias_cobradas: 1, valor_cobrado: 5 }).eq('id', mel).select('id');
  T.recusa('pela API direta (sem a função do check-out): R$ 5,00 recusado', r, /Pela conta, a estadia dá R\$ 70,00/);
  let n0 = alteracoes('checkout');
  r = await checkout(cx, mel, { total: 63, soma: 70 });
  T.passa('R$ 63,00 (70,00 − 10% = 63,00) passa', r);
  T.ok('… e o desconto fica em Alterações: de 70,00 para 63,00, com o nome da recepção', alteracoes('checkout') === n0 + 1 && ultima('checkout') === '70.00>63.00|Rita Recepção', ultima('checkout'));
  // a conta montada na tela tem um extra (70 + 15 = 85): o desconto conta sobre os 85,00 (10% = 8,50)
  const luna = B.must(await checkin(cx, L.pets.Luna, 'creche', 70), 'luna').id;
  r = await checkout(cx, luna, { total: 70, soma: 85 });
  T.recusa('conta de R$ 85,00 (diária 70 + extra 15) recebida por R$ 70,00: recusado', r, /R\$ 85,00/);
  T.passa('… por R$ 76,50 (85,00 − 8,50) passa', await checkout(cx, luna, { total: 76.5, soma: 85 }));

  T.secao('C1 creche: o dono muda, e fica anotado');
  n0 = alteracoes('diaria');
  r = await checkin(dono, L.pets.Bob, 'creche', 5);
  T.passa('o dono faz check-in a R$ 5,00', r);
  T.ok('… anotado em Alterações (diária de 70,00 para 5,00)', alteracoes('diaria') === n0 + 1 && ultima('diaria').startsWith('70.00>5.00'), ultima('diaria'));
  n0 = alteracoes('checkout');
  T.passa('a recepção recebe os R$ 5,00 combinados pelo dono (1 dia × R$ 5,00)', await checkout(cx, r.data.id, { total: 5, soma: 5 }));
  T.ok('… sem alteração nova (é a conta)', alteracoes('checkout') === n0);

  T.secao('C1 hotel: as noites pelas datas e o valor');
  // Thor (porte M) chegou há 4 dias: 4 noites × R$ 120,00 = R$ 480,00
  const thor = B.must(await checkin(cx, L.pets.Thor, 'hotel', 120, haDias(4)), 'thor').id;
  r = await checkout(cx, thor, { diarias: 1, total: 120, soma: 120 });
  T.recusa('recepção: 1 noite no lugar de 4 recusado', r, /Pelas datas são 4 noites/);
  r = await checkout(cx, thor, { diarias: 4, total: 120, soma: 120 });
  T.recusa('recepção: 4 noites com a conta "montada" em R$ 120,00 (o banco refaz: R$ 480,00) recusado', r, /Pela conta, a estadia dá R\$ 480,00/);
  T.passa('4 noites por R$ 480,00 passa', await checkout(cx, thor, { diarias: 4, total: 480, soma: 480 }));
  T.ok('gravado: 4 diárias, R$ 480,00', B.sql(`select diarias_cobradas || '|' || valor_cobrado from estadias where id='${thor}'`) === '4|480.00');
  // o dono cobra 1 noite de 2 (R$ 120,00 no lugar de R$ 240,00): passa e fica nas duas listas
  const rex = B.must(await checkin(dono, L.pets.Rex, 'hotel', 120, haDias(2)), 'rex').id;
  n0 = alteracoes('diarias');
  T.passa('o dono cobra 1 noite de 2', await checkout(dono, rex, { diarias: 1, total: 120, soma: 120 }));
  T.ok('… anotado: 1 noite em vez de 2, de 240,00 para 120,00', alteracoes('diarias') === n0 + 1 && ultima('diarias').startsWith('240.00>120.00')
    && /1 noite em vez de 2 noites/.test(B.sql(`select item from precos_alterados where petshop_id='${P}' and tipo='diarias' order by quando desc limit 1`)), ultima('diarias'));

  T.secao('C1 pacote e check-out que ficou para cobrar');
  const pacoteDe = async (pet) => B.must(await dono.from('pacotes_clientes').insert({ petshop_id: P, pet_id: pet, nome: '5 diárias', total: 5, vence_em: L.dia(30), preco: 300 }).select('id').single(), 'pacote').id;
  const pacMel = await pacoteDe(L.pets.Mel), pacBob = await pacoteDe(L.pets.Bob);
  const mel2 = B.must(await checkin(cx, L.pets.Mel, 'creche', 70), 'mel2').id;
  r = await checkout(cx, mel2, { total: 0, extra: [{ t: 'pacote', id: pacBob, n: 1 }] });
  T.recusa('recepção: sair sem cobrar usando o pacote de OUTRO pet recusado', r, /Pela conta, a estadia dá R\$ 70,00/);
  T.ok('… e o pacote do outro pet não foi gasto', B.num(`select usados from pacotes_clientes where id='${pacBob}'`) === 0);
  T.passa('com o pacote do próprio pet: sai sem cobrar', await checkout(cx, mel2, { total: 0, extra: [{ t: 'pacote', id: pacMel, n: 1 }] }));
  T.ok('… 1 uso do pacote', B.num(`select usados from pacotes_clientes where id='${pacMel}'`) === 1);
  // quem não mexe com dinheiro encerra (valor em branco); a recepção acerta depois
  const luna2 = B.must(await checkin(monitor, L.pets.Luna, 'creche'), 'luna2').id;
  B.must(await monitor.from('estadias').update({ status: 'encerrada', saida: agora(), diarias_cobradas: 1 }).eq('id', luna2).select('id'), 'monitor encerra');
  T.ok('o monitor encerra sem valor (fica para cobrar)', B.sql(`select coalesce(valor_cobrado::text, 'vazio') from estadias where id='${luna2}'`) === 'vazio');
  r = await checkout(cx, luna2, { total: 0, acertar: true });
  T.recusa('recepção: "Fechar sem cobrar" o check-out pendente (R$ 70,00) recusado', r, /Pela conta, a estadia dá R\$ 70,00/);
  T.passa('… acertar pelos R$ 70,00 passa', await checkout(cx, luna2, { total: 70, soma: 70, acertar: true }));

  T.secao('H1 apagar ou baixar um valor recebido, com a trava');
  const venda = B.must(await cx.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 12.5, forma: 'dinheiro', categoria: 'Outros', descricao: 'Petisco', data: L.hoje, pago: true, origem: 'tela',
    caixa_id: B.sql(`select id from caixas where petshop_id='${P}' and fechado_em is null`) }).select('id').single(), 'venda').id;
  r = await cx.from('lancamentos').update({ valor: 2.5 }).eq('id', venda).select('id');
  T.recusa('recepção: baixar de 12,50 para 2,50 recusado (entrada sem itens também)', r, /baixa o valor de uma venda já recebida/);
  r = await cx.from('lancamentos').delete().eq('id', venda).select('id');
  T.recusa('recepção: apagar a venda de R$ 12,50 recusado', r, /apaga um valor já recebido/);
  T.ok('a venda continua lá', B.num(`select count(*) from lancamentos where id='${venda}'`) === 1);
  const estadiaPaga = B.sql(`select l.id from lancamentos l where l.petshop_id='${P}' and l.categoria='Creche e hotel' and l.valor=480 limit 1`);
  r = await cx.from('lancamentos').update({ valor: 100 }).eq('id', estadiaPaga).select('id');
  T.recusa('recepção: baixar o recebimento do hotel de 480,00 para 100,00 recusado', r, /baixa o valor/);
  r = await dono.from('lancamentos').delete().eq('id', venda).select('id');
  T.passa('o dono apaga', r, r.data?.length === 1);
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'dinheiro.preco_travado': false } }), 'trava desligada');
  const venda2 = B.must(await cx.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 12.5, forma: 'dinheiro', categoria: 'Outros', descricao: 'Petisco', data: L.hoje, pago: true, origem: 'tela',
    caixa_id: B.sql(`select id from caixas where petshop_id='${P}' and fechado_em is null`) }).select('id').single(), 'venda 2').id;
  r = await cx.from('lancamentos').delete().eq('id', venda2).select('id');
  T.passa('sem a trava: a recepção apaga o que lançou no caixa aberto (regra de sempre)', r, r.data?.length === 1);
  // sem a trava, cobrar abaixo da conta passa e fica anotado
  const bob2 = B.must(await checkin(cx, L.pets.Bob, 'creche', 70), 'bob2').id;
  n0 = alteracoes('checkout');
  T.passa('sem a trava: a recepção recebe R$ 10,00 por uma conta de R$ 70,00', await checkout(cx, bob2, { total: 10, soma: 70 }));
  T.ok('… anotado em Alterações (de 70,00 para 10,00)', alteracoes('checkout') === n0 + 1 && ultima('checkout').startsWith('70.00>10.00'), ultima('checkout'));

  T.secao('H2 limite de fiado pelo que fica devendo');
  const ini = B.instante(L.hoje, '09:00', L.fuso);
  const ag = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Rex, servico_id: L.S['Banho e tosa'], inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 175.5 }).select('id').single(), 'horário').id;
  const davi = L.tutores.Davi;
  const deve = () => B.centavos(B.sql(`select public.fiado_deve('${P}', '${davi}')`));
  // conta inteira a receber: 175,50 > 150
  r = await cx.rpc('agendamento_fechar_conta', { p_petshop: P, p_agendamento: ag, p_chave: ch('fiado'), p_passos: [
    { t: 'lancamento', nome: 'conta', linha: { tipo: 'entrada', valor: 175.5, forma: null, categoria: 'Banho e tosa', descricao: 'Banho e tosa · Rex', data: L.dia(7), vencimento: L.dia(7), pago: false, agendamento_id: ag, cliente_id: davi } },
    { t: 'agendamento', id: ag, status: 'concluido' },
  ] });
  T.recusa('R$ 175,50 inteiros a receber (limite R$ 150,00): recusado, com a frase nova', r, /Davi ficaria devendo R\$ 175,50: passa do limite de R\$ 150,00/);
  T.ok('… com a marca maestro:limite_fiado e nada gravado', r.error?.hint === 'maestro:limite_fiado' && deve() === 0 && B.sql(`select status from agendamentos where id='${ag}'`) !== 'concluido', r.error);
  // a mesma conta com R$ 100,00 pagos na hora: ficam R$ 75,50
  r = await cx.rpc('agendamento_fechar_conta', { p_petshop: P, p_agendamento: ag, p_chave: ch('parte'), p_passos: [
    { t: 'lancamento', nome: 'conta', linha: { tipo: 'entrada', valor: 175.5, forma: null, categoria: 'Banho e tosa', descricao: 'Banho e tosa · Rex', data: L.dia(7), vencimento: L.dia(7), pago: false, agendamento_id: ag, cliente_id: davi } },
    { t: 'agendamento', id: ag, status: 'concluido' },
    { t: 'receber', conta: '$ref:conta', valor: 100, forma: 'pix' },
  ] });
  T.passa('R$ 175,50 com R$ 100,00 pagos na hora (ficam R$ 75,50): passa', r);
  T.ok('Davi deve R$ 75,50 e R$ 100,00 entraram', deve() === 7550 && B.centavos(B.sql(`select coalesce(sum(valor),0) from lancamentos where petshop_id='${P}' and cliente_id='${davi}' and pago and tipo='entrada'`)) === 10000);
  const fiado = (valor) => cx.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor, forma: null, categoria: 'Venda de produtos', descricao: 'Venda', data: L.dia(7), vencimento: L.dia(7), pago: false, cliente_id: davi, origem: 'tela' }).select('id');
  r = await fiado(80);
  T.recusa('mais R$ 80,00 (75,50 + 80,00 = 155,50): recusado pela gravação direta', r, /Davi já deve R\$ 75,50; com esta conta passa do limite de R\$ 150,00/);
  T.ok('… nada ficou', deve() === 7550);
  T.passa('mais R$ 74,50 (150,00 justos): passa', await fiado(74.5));
  T.ok('Davi deve R$ 150,00', deve() === 15000);
  // quem cuida do financeiro libera
  B.must(await dono.rpc('fiado_liberar', { p_petshop: P, p_cliente: davi, p_valor: 10 }), 'liberar');
  T.passa('com a liberação do dono, mais R$ 10,00 passa', await fiado(10));

  T.secao('M3 falta com a taxa numa gravação só');
  const ini2 = B.instante(L.hoje, '11:00', L.fuso);
  const ag2 = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Bob, servico_id: L.S.Banho, inicio: ini2.toISOString(), fim: new Date(+ini2 + 36e5).toISOString() }).select('id').single(), 'horário 2').id;
  const chaveFalta = ch('falta');
  r = await cx.rpc('agendamento_faltou', { p_agendamento: ag2, p_taxa: true, p_chave: chaveFalta });
  T.passa('falta + taxa: uma chamada', r, r.data?.ok === true && Number(r.data?.taxa) === 20 && Boolean(r.data?.lancamento_id));
  const taxas = () => B.sql(`select count(*) || '|' || coalesce(sum(valor), 0) || '|' || bool_and(not pago) from lancamentos where petshop_id='${P}' and cliente_id='${L.tutores.Beto}' and descricao like 'Taxa de falta%'`);
  T.ok('o horário ficou como falta e a taxa de R$ 20,00 está em A receber do tutor', B.sql(`select status from agendamentos where id='${ag2}'`) === 'faltou' && taxas() === '1|20.00|true', taxas());
  r = await cx.rpc('agendamento_faltou', { p_agendamento: ag2, p_taxa: true, p_chave: chaveFalta });
  T.passa('a mesma chave de novo não anota a taxa duas vezes', r, taxas() === '1|20.00|true');
  const ag3 = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Luna, servico_id: L.S.Banho, inicio: new Date(+ini2 + 2 * 36e5).toISOString(), fim: new Date(+ini2 + 3 * 36e5).toISOString() }).select('id').single(), 'horário 3').id;
  r = await cx.rpc('agendamento_faltou', { p_agendamento: ag3, p_taxa: false });
  T.passa('falta sem taxa: só o status', r, Number(r.data?.taxa) === 0 && B.sql(`select status from agendamentos where id='${ag3}'`) === 'faltou'
    && B.num(`select count(*) from lancamentos where petshop_id='${P}' and cliente_id='${L.tutores.Clara}' and descricao like 'Taxa de falta%'`) === 0);
  T.ok('quem não mexe com dinheiro não lê a taxa de falta', Number((await monitor.rpc('taxa_de_falta', { p: P })).data) === 0 && Number((await cx.rpc('taxa_de_falta', { p: P })).data) === 20);

  T.secao('M2/M8 devolução ligada à entrada');
  const recebido = B.must(await cx.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 50, forma: 'debito', categoria: 'Banho e tosa', descricao: 'Banho · Thor', data: L.hoje, pago: true, origem: 'tela', cliente_id: L.tutores.Ana,
    caixa_id: B.sql(`select id from caixas where petshop_id='${P}' and fechado_em is null`) }).select('id').single(), 'recebido').id;
  n0 = alteracoes('devolucao');
  const chDev = ch('devolver');
  r = await cx.rpc('entrada_devolver', { p_petshop: P, p_entrada: recebido, p_valor: 20, p_forma: 'pix', p_chave: chDev });
  T.passa('devolver R$ 20,00 de R$ 50,00', r, r.data?.ok === true);
  r = await cx.rpc('entrada_devolver', { p_petshop: P, p_entrada: recebido, p_valor: 20, p_forma: 'pix', p_chave: chDev });
  T.passa('a mesma chave de novo não devolve duas vezes', r, r.data?.repetido === true);
  r = await cx.rpc('entrada_devolver', { p_petshop: P, p_entrada: recebido, p_valor: 30.01, p_forma: 'pix', p_chave: ch('devolver') });
  T.recusa('mais R$ 30,01 (sobram 30,00): recusado', r, /já voltaram R\$ 20,00\. Dá para devolver até R\$ 30,00/);
  T.passa('os R$ 30,00 que sobram passam', await cx.rpc('entrada_devolver', { p_petshop: P, p_entrada: recebido, p_valor: 30, p_forma: 'dinheiro', p_chave: ch('devolver') }));
  const saidas = B.sql(`select count(*) || '|' || sum(valor) || '|' || bool_and(categoria = 'Devolução' and tipo = 'saida' and pago) from lancamentos where devolucao_de='${recebido}'`);
  T.ok('duas saídas "Devolução" ligadas à entrada, somando R$ 50,00', saidas === '2|50.00|true', saidas);
  T.ok('… e duas linhas em Alterações em valores', alteracoes('devolucao') === n0 + 2);
  const dev = B.must(await cx.rpc('entradas_devolvidas', { p_petshop: P, p_ids: [recebido] }), 'devolvidas');
  T.ok('a tela sabe que os R$ 50,00 voltaram', dev.length === 1 && Number(dev[0].devolvido) === 50, dev);
  T.recusa('o monitor (sem dinheiro) não devolve', await monitor.rpc('entrada_devolver', { p_petshop: P, p_entrada: recebido, p_valor: 1, p_forma: 'pix', p_chave: ch('devolver') }), /quem mexe com dinheiro/);

  T.secao('M1 troca: o produto trocado não é dinheiro');
  const coleira = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Coleira M', unidade: 'un', preco_venda: 29.99, custo: 10, estoque: 5 }).select('id').single(), 'coleira').id;
  const shampoo = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Shampoo 500', unidade: 'un', preco_venda: 34.9, custo: 12, estoque: 5 }).select('id').single(), 'shampoo').id;
  const vendaColeira = B.must(await cx.rpc('venda_registrar', { p_petshop: P, p_chave: ch('venda'), p_passos: [
    { t: 'lancamento', nome: 'venda', linha: { tipo: 'entrada', valor: 29.99, forma: 'dinheiro', categoria: 'Venda de produtos', descricao: 'Venda: 1 Coleira M', pago: true, data: L.hoje, itens: [{ tipo: 'produto', nome: 'Coleira M', qtd: 1, valor: 29.99, produto_id: coleira }] } },
    { t: 'estoque', linhas: [{ produto_id: coleira, quantidade: 1, lancamento_id: '$ref:venda' }] },
  ] }), 'venda da coleira').ids.venda;
  n0 = alteracoes('devolucao');
  r = await cx.rpc('venda_devolver', { p_petshop: P, p_chave: ch('troca'), p_venda: vendaColeira, p_itens: [{ produto_id: coleira, qtd: 1, avariados: 0 }], p_modo: 'troca', p_forma: 'dinheiro', p_novos: [{ produto_id: shampoo, qtd: 1 }] });
  T.passa('troca da coleira (29,99) pelo shampoo (34,90): diferença de R$ 4,91', r);
  const troca = B.sql(`select entrada_id || '|' || saida_id || '|' || diferenca from devolucoes where petshop_id='${P}' and modo='troca'`).split('|');
  T.ok('a diferença gravada é R$ 4,91', troca[2] === '4.91', troca);
  const tc = B.must(await cx.rpc('trocas_do_caixa', { p_petshop: P, p_ids: [troca[0], troca[1], vendaColeira] }), 'trocas');
  const de = (id) => Number(tc.find((x) => x.lancamento_id === id)?.trocado ?? 0);
  T.ok('R$ 29,99 da entrada e R$ 29,99 da saída da troca não são dinheiro; a venda original fica como está', de(troca[0]) === 29.99 && de(troca[1]) === 29.99 && de(vendaColeira) === 0, tc);
  T.ok('a troca aparece em Alterações', alteracoes('devolucao') === n0 + 1);
  T.ok('o monitor não lê as trocas', ((await monitor.rpc('trocas_do_caixa', { p_petshop: P, p_ids: [troca[0]] })).data ?? []).length === 0);

  T.secao('Mozart: "paguei a luz hoje no pix" dá baixa na conta de A pagar');
  const erro = (m) => new Error(m);
  const ctx = (sb, fin) => ({ sb, petshop: { id: P }, eu: {}, equipe: [], cuidoDoFinanceiro: fin, vejoFinanceiro: true, fusoMin: -180, agora: `${L.hoje}T10:00` });
  // conta fixa Luz, R$ 250,00 (varia), vence hoje: entra em A pagar com o valor estimado
  B.must(await dono.rpc('contas_fixas_salvar', { p: P, p_conta: { id: B.uuid(), nome: 'Luz', categoria: 'Água, luz e internet', dia: Number(L.hoje.slice(8, 10)), valor: 250, valor_varia: true, frequencia: 'mensal' } }), 'conta fixa');
  const ver = await PC.consultarContasAPagar(ctx(dono, true), 'ver_contas_a_pagar', erro);
  const luz = ver.resultado.contas.find((x) => x.nome === 'Luz');
  T.ok('ver_contas_a_pagar traz a Luz do mês (R$ 250,00, estimado), com o conta_id', Boolean(luz?.conta_id) && luz.valor === 250 && luz.valor_estimado === true && luz.conta_fixa === true, ver.resultado.contas);
  const saidasDoMes = () => B.centavos(B.sql(`select coalesce(sum(valor),0) from lancamentos where petshop_id='${P}' and tipo='saida' and pago and categoria='Água, luz e internet'`));
  let recusa = null;
  try { await PC.conferirSeEContaAPagar(ctx(dono, true), { tipo: 'saida', valor: 268.4, forma: 'pix', categoria: 'Água, luz e internet', descricao: 'Luz de novembro' }, erro); } catch (e) { recusa = e.message; }
  T.ok('a saída solta "Luz de novembro" é recusada e aponta pagar_conta com o conta_id', /Nada foi lançado/.test(recusa ?? '') && /pagar_conta/.test(recusa ?? '') && (recusa ?? '').includes(luz.conta_id), recusa);
  let passa = true;
  try { await PC.conferirSeEContaAPagar(ctx(dono, true), { tipo: 'saida', valor: 40, forma: 'dinheiro', categoria: 'Outros', descricao: 'Motoboy' }, erro); } catch { passa = false; }
  T.ok('despesa que não é conta de A pagar (motoboy, R$ 40,00) passa', passa);
  try { await PC.conferirSeEContaAPagar(ctx(dono, true), { tipo: 'saida', valor: 268.4, forma: 'pix', categoria: 'Água, luz e internet', descricao: 'Luz de novembro', nao_e_conta_a_pagar: true }, erro); passa = true; } catch { passa = false; }
  T.ok('com nao_e_conta_a_pagar (a pessoa disse que é outra despesa) passa', passa);
  const card = await PC.descreverPagarConta(ctx(dono, true), 'pagar_conta', { conta_id: luz.conta_id, forma: 'pix', valor: 268.4 }, erro);
  const linha = (k) => card.linhas.find((x) => x[0] === k)?.[1].replace(/\u00a0/g, ' ');
  T.ok('o cartão: Dar baixa em conta a pagar · Luz · R$ 268,40 (estava R$ 250,00, estimado) · Pix · hoje', card.titulo === 'Dar baixa em conta a pagar' && /^Luz/.test(linha('Conta')) && linha('Valor') === 'R$ 268,40 (estava R$ 250,00, estimado)' && linha('Forma') === 'Pix' && linha('Pago em') === 'hoje', card);
  T.ok('nada foi gravado só de mostrar o cartão', saidasDoMes() === 0 && B.sql(`select pago from lancamentos where id='${luz.conta_id}'`) === 'f');
  let semFin = null; try { await PC.descreverPagarConta(ctx(cx, false), 'pagar_conta', { conta_id: luz.conta_id, forma: 'pix' }, erro); } catch (e) { semFin = e.message; }
  T.ok('quem não cuida do financeiro não dá baixa pelo Mozart', /dono/.test(semFin ?? ''), semFin);
  const feito = await PC.gravarPagarConta(ctx(dono, true), 'pagar_conta', { conta_id: luz.conta_id, forma: 'pix', valor: 268.4 }, erro);
  T.ok('pagar_conta: feito, R$ 268,40', feito.feito === true && feito.valor === 268.4, feito);
  T.ok('a conta saiu de A pagar, paga hoje no Pix, sem o "estimado"', B.sql(`select pago || '|' || forma || '|' || valor || '|' || data || '|' || coalesce(valor_estimado, false) from lancamentos where id='${luz.conta_id}'`) === `true|pix|268.40|${L.hoje}|false`);
  T.ok('no mês saiu R$ 268,40 de luz, uma vez só (antes: 268,40 solta + 268,40 da baixa = 536,80)', saidasDoMes() === 26840, saidasDoMes());
  let denovo = null; try { await PC.gravarPagarConta(ctx(dono, true), 'pagar_conta', { conta_id: luz.conta_id, forma: 'pix' }, erro); } catch (e) { denovo = e.message; }
  T.ok('a mesma conta de novo: "já estava paga", nada em dobro', /já estava paga/.test(denovo ?? '') && saidasDoMes() === 26840, denovo);
  // a rede de segurança: já existe uma saída parecida paga no mês (a luz lançada solta) e alguém dá baixa em outra conta parecida
  const outra = B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'saida', valor: 270, forma: null, categoria: 'Água, luz e internet', descricao: 'Luz (segunda via)', data: L.hoje, vencimento: L.hoje, pago: false, origem: 'tela' }).select('id').single(), 'outra').id;
  const card2 = await PC.descreverPagarConta(ctx(dono, true), 'pagar_conta', { conta_id: outra, forma: 'dinheiro' }, erro);
  T.ok('conta parecida com uma saída já paga no mês (268,40 x 270,00): o cartão avisa', /já existe uma saída parecida paga neste mês/.test(card2.linhas.find((x) => x[0] === 'Atenção')?.[1] ?? ''), card2);
  const F = lib('assistente/ferramentas');
  T.ok('pagar_conta grava (com cartão) e ver_contas_a_pagar só consulta; as duas só para quem recebe', F.definicao('pagar_conta').grava === true && F.definicao('ver_contas_a_pagar').grava === false
    && F.ferramentasPara({ vejoFinanceiro: true }).some((x) => x.name === 'pagar_conta') && !F.ferramentasPara({ vejoFinanceiro: false }).some((x) => x.name === 'pagar_conta'));
}))();
