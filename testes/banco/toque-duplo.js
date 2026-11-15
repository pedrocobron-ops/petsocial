// Toque duplo pela API: cada gravação de dinheiro ou de vaga chamada DUAS VEZES ao mesmo tempo (Promise.all), como acontece
// com o dedo que toca duas vezes ou a internet que repete o pedido. Conta o que ficou no banco.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('toque-duplo');
const D = lib('dinheiro');

const dois = (f) => Promise.all([f(), f()]);
const erros = (rs) => rs.filter((r) => r.error).map((r) => r.error.message);

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Toque duplo' });
  const { dono } = L.sb;
  const P = L.P;
  const lc = (w = 'true') => B.num(`select count(*) from lancamentos where petshop_id='${P}' and ${w}`);
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 50 }).select('id'), 'caixa');

  // planos de mensalista desde o mês passado (com a cobrança do mês passado feita: assim a deste mês não é "a primeira",
  // que o banco segura quando já nasceria vencida), nos dias da semana de hoje e de depois de amanhã (a chamada de hoje é "chegou")
  const dHoje = B.diaDaSemana(L.hoje), dPlano = [dHoje, B.diaDaSemana(L.dia(2))];
  const plano = {};
  for (const pet of ['Thor', 'Mel', 'Bob', 'Luna']) {
    plano[pet] = B.must(await dono.from('creche_planos').insert({ petshop_id: P, pet_id: L.pets[pet], dias: dPlano, inicio: L.mesAnterior, vence_dia: 10 }).select('id').single(), 'plano').id;
    B.must(await dono.from('creche_planos_valores').upsert({ plano_id: plano[pet], petshop_id: P, valor_mensal: 400, valor_extra: 45 }).select('plano_id'), 'valor do plano');
    B.must(await dono.rpc('creche_cobranca_criar', { p_plano: plano[pet], p_mes: L.mesAnterior }), 'cobrança do mês passado');
  }

  T.secao('cobranças da creche');
  let tot = lc();
  let rs = await dois(() => dono.rpc('creche_cobranca_criar', { p_plano: plano.Thor, p_mes: L.mes1, p_valor: 400, p_vencimento: L.hoje }));
  T.ok('criar a cobrança 2x ao mesmo tempo: 1 cobrança e 1 conta, sem erro', B.num(`select count(*) from creche_cobrancas where plano_id='${plano.Thor}' and mes='${L.mes1}'`) === 1 && lc() - tot === 1 && !erros(rs).length, erros(rs));
  tot = lc();
  rs = await dois(() => dono.rpc('creche_gerar_cobrancas', { p_petshop: P }));
  const doMes = () => B.num(`select count(*) from creche_cobrancas where petshop_id='${P}' and mes='${L.mes1}'`);
  T.ok('gerar cobranças do mês 2x: uma por plano (+3), sem erro', doMes() === 4 && lc() - tot === 3 && !erros(rs).length, { n: doMes(), e: erros(rs) });
  rs = await dois(() => dono.rpc('creche_cobranca_criar', { p_plano: plano.Mel, p_mes: L.mes1, p_valor: 400 }));
  T.ok('criar de novo a que já existe, 2x: continua 1', B.num(`select count(*) from creche_cobrancas where plano_id='${plano.Mel}' and mes='${L.mes1}'`) === 1, erros(rs));

  const conta = (pet) => B.sql(`select lancamento_id from creche_cobrancas where plano_id='${plano[pet]}' and mes='${L.mes1}'`);
  tot = lc('pago');
  rs = await dois(() => dono.rpc('receber_conta', { p_conta: conta('Thor'), p_valor: 400, p_forma: 'pix' }));
  T.ok('receber SEM chave 2x: recebe uma vez (a outra é recusada)', lc('pago') - tot === 1 && erros(rs).length === 1, erros(rs));
  tot = lc('pago');
  const ch = B.uuid();
  rs = await dois(() => dono.rpc('receber_conta', { p_conta: conta('Mel'), p_valor: 400, p_forma: 'pix', p_multa: 5, p_chave: ch }));
  T.ok('receber COM chave 2x (com multa): 1 baixa + 1 multa, sem erro', lc('pago') - tot === 2 && !erros(rs).length, { d: lc('pago') - tot, e: erros(rs) });
  tot = lc();
  const chParte = B.uuid();
  rs = await dois(() => dono.rpc('receber_conta', { p_conta: conta('Bob'), p_valor: 150, p_forma: 'dinheiro', p_chave: chParte }));
  T.ok('receber uma PARTE com chave 2x: 1 parte (faltam 250)', lc() - tot === 1 && B.num(`select valor from lancamentos where id='${conta('Bob')}'`) === 250 && !erros(rs).length, erros(rs));

  const idLuna = B.sql(`select id from creche_cobrancas where plano_id='${plano.Luna}' and mes='${L.mes1}'`);
  rs = await dois(() => dono.rpc('creche_cobrancas_por_fora', { p_ids: [idLuna] }));
  T.ok('"pagas por fora" 2x: sem erro e a cobrança fica por fora', !erros(rs).length && B.sql(`select por_fora from creche_cobrancas where id='${idLuna}'`) === 't', erros(rs));
  rs = await dois(() => dono.rpc('creche_cobranca_criar', { p_plano: plano.Luna, p_mes: L.mes1, p_reabrir: true }));
  T.ok('voltar atrás no "por fora" 2x: 1 cobrança aberta e 1 conta', B.num(`select count(*) from creche_cobrancas where plano_id='${plano.Luna}' and mes='${L.mes1}' and status='aberta'`) === 1 && B.num(`select count(*) from lancamentos l join creche_cobrancas c on c.lancamento_id = l.id where c.plano_id='${plano.Luna}' and c.mes='${L.mes1}' and not l.pago`) === 1, erros(rs));
  const idThor = B.sql(`select id from creche_cobrancas where plano_id='${plano.Thor}' and mes='${L.mes1}'`);
  rs = await dois(() => dono.rpc('creche_cobranca_desfazer_baixa', { p_id: idThor }));
  T.ok('desfazer o recebimento 2x: volta a aberta uma vez', B.sql(`select status from creche_cobrancas where id='${idThor}'`) === 'aberta' && B.num(`select count(*) from lancamentos l join creche_cobrancas c on c.lancamento_id = l.id where c.id='${idThor}' and not l.pago`) === 1, erros(rs));

  T.secao('creche: dia extra e chamada');
  const extra = B.proximoDia(L.hoje, [0, 1, 2, 3, 4, 5, 6].filter((d) => !dPlano.includes(d)));
  rs = await dois(() => dono.rpc('creche_reservar_extra', { p_plano: plano.Thor, p_dia: extra }));
  // de propósito: a segunda chamada espera a primeira (trava do plano) e ouve "já está marcado nesse dia" (não marca duas vezes)
  T.ok('reservar dia extra 2x: 1 reserva; a segunda ouve "já está marcado"', B.num(`select count(*) from estadias where pet_id='${L.pets.Thor}' and dia='${extra}' and status<>'cancelada'`) === 1 && erros(rs).length <= 1 && erros(rs).every((e) => /já está marcado/.test(e)), erros(rs));
  rs = await dois(() => dono.rpc('creche_chamada', { p_plano: plano.Mel, p_dia: L.hoje, p_acao: 'chegou' }));
  T.ok('chamada "chegou" 2x: 1 presença, sem erro', B.num(`select count(*) from estadias where pet_id='${L.pets.Mel}' and dia='${L.hoje}' and status<>'cancelada'`) === 1 && !erros(rs).length, erros(rs));
  rs = await dois(() => dono.rpc('creche_chamada', { p_plano: plano.Mel, p_dia: L.hoje, p_acao: 'saiu' }));
  T.ok('chamada "saiu" 2x: sem erro, a presença encerra uma vez', !erros(rs).length && B.num(`select count(*) from estadias where pet_id='${L.pets.Mel}' and dia='${L.hoje}' and status='encerrada'`) === 1, erros(rs));

  T.secao('hotel: pedido do link, sinal, check-out e reserva');
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'hotel.sinal': { ativo: true, modo: 'pct', valor: 50, politica: 'Não devolvido em caso de desistência.', creche: false } } }), 'sinal ligado');
  const anon = B.cliente(B.ipAleatorio());
  const ped = B.must(await anon.rpc('link_pedir_com_termos', { p_funcao: 'link_pedir_estadia', p_args: { p_codigo: L.codigo, p_tipo: 'hotel', p_entrada: L.dia(20), p_saida: L.dia(22), p_tutor: 'Gil Duplo', p_telefone: '11977770001', p_pet: 'Pipoca', p_especie: 'cao', p_porte: 'M', p_hora_entrada: '09:00', p_hora_saida: '17:00' } }), 'pedido pelo link');
  const pid = ped.id ?? ped.pedido ?? ped;
  T.ok('pedido do link aceito pelo banco', ped.ok !== false && typeof pid === 'string', ped);
  const eAntes = B.num(`select count(*) from estadias where petshop_id='${P}'`); tot = lc();
  rs = await dois(() => dono.rpc('pedido_aceitar_como', { p_id: pid, p_tutor_novo: true }));
  // de propósito: o banco aceita só o primeiro e o segundo ouve "já foi respondido" (a tela trava o segundo toque antes)
  T.ok('aceitar o pedido 2x: 1 reserva; o segundo ouve "já foi respondido"', B.num(`select count(*) from estadias where petshop_id='${P}'`) - eAntes === 1 && erros(rs).length <= 1 && erros(rs).every((e) => /já foi respondido/.test(e)), erros(rs));
  rs = await dois(() => dono.rpc('pedido_criar_sinal', { p_id: pid }));
  T.ok('sinal do pedido aceito 2x: 1 conta de sinal, sem erro', lc() - tot === 1 && !erros(rs).length, { d: lc() - tot, e: erros(rs) });
  await dono.rpc('pedido_aceitar_como', { p_id: pid, p_tutor_novo: true });
  await dono.rpc('pedido_criar_sinal', { p_id: pid });
  T.ok('aceitar e criar o sinal de novo, mais tarde: nada novo', B.num(`select count(*) from estadias where petshop_id='${P}'`) - eAntes === 1 && lc() - tot === 1);

  const e1 = B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Rex, tipo: 'hotel', status: 'em_casa', entrada: new Date(Date.now() - 2 * 864e5).toISOString(), saida_prevista: new Date(Date.now() + 36e5).toISOString(), valor_diaria: 80 }).select('id').single(), 'estadia').id;
  rs = await dois(() => dono.from('estadias').update({ status: 'encerrada', saida: new Date().toISOString(), diarias_cobradas: 2 }).eq('id', e1).eq('status', 'em_casa').select('id'));
  T.ok('check-out 2x: só um passa (o outro vê que já foi feito)', rs.filter((x) => x.data?.length === 1).length === 1, rs.map((x) => x.data?.length ?? x.error?.message));
  rs = await dois(() => dono.rpc('estadia_acertar', { p_id: e1, p_diarias: 2, p_valor: 160 }));
  T.ok('acertar o check-out para cobrar 2x: só um acerta', rs.filter((x) => !x.error && x.data && x.data !== false && !(Array.isArray(x.data) && !x.data.length)).length === 1, rs.map((x) => JSON.stringify(x.data ?? x.error?.message)));

  const chRes = B.uuid();
  const reservar = async () => {
    const e = await dono.from('estadias').upsert({ petshop_id: P, pet_id: L.pets.Bob, tipo: 'hotel', status: 'reservada', entrada: `${L.dia(30)}T12:00:00Z`, saida_prevista: `${L.dia(32)}T12:00:00Z`, valor_diaria: 80, chave: chRes + ':estadia' }, { onConflict: 'petshop_id,chave', ignoreDuplicates: true }).select('id');
    if (e.error) return e;
    return dono.from('lancamentos').upsert({ petshop_id: P, tipo: 'entrada', valor: 80, forma: null, categoria: 'Creche e hotel', descricao: 'Sinal', data: L.dia(2), vencimento: L.dia(2), pago: false, cliente_id: L.tutores.Beto, origem: 'tela', chave: chRes + ':sinal' }, { onConflict: 'petshop_id,chave', ignoreDuplicates: true }).select('id');
  };
  tot = lc();
  rs = await dois(reservar);
  T.ok('reserva nova com sinal, a mesma operação 2x: 1 reserva e 1 conta de sinal', B.num(`select count(*) from estadias where petshop_id='${P}' and chave='${chRes}:estadia'`) === 1 && lc() - tot === 1, { e: erros(rs) });

  T.secao('loja: venda e estoque');
  const prod0 = B.num(`select estoque from produtos where id='${L.prod}'`);
  const chV = D.novaChaveDeOperacao();
  const vender = async () => {
    const l = await D.lancarPago(L.sb.caixa, P, { tipo: 'entrada', valor: 29.9, forma: 'dinheiro', categoria: 'Venda de produtos', itens: [{ tipo: 'produto', nome: 'Shampoo Neutro', qtd: 1, valor: 29.9, produto_id: L.prod }], chave: chV });
    await D.gravarMovimentos(L.sb.caixa, P, [{ petshop_id: P, produto_id: L.prod, tipo: 'saida', quantidade: 1, motivo: 'Venda', lancamento_id: l.id, chave: D.parteDaChave(chV, 'estoque', L.prod) }]);
    return l;
  };
  const vs = await Promise.allSettled([vender(), vender()]);
  T.ok('venda de balcão 2x ao mesmo tempo: 1 entrada, 1 saída de estoque, sem erro', vs.every((x) => x.status === 'fulfilled') && B.num(`select count(*) from lancamentos where petshop_id='${P}' and chave='${chV}'`) === 1 && B.num(`select estoque from produtos where id='${L.prod}'`) === prod0 - 1, vs.map((x) => x.reason?.message));
  const chE = B.uuid();
  rs = await dois(() => L.sb.estoque.from('movimentos_estoque').upsert({ petshop_id: P, produto_id: L.prod, tipo: 'entrada', quantidade: 6, chave: chE }, { onConflict: 'petshop_id,chave', ignoreDuplicates: true }).select('id'));
  T.ok('entrada de mercadoria 2x: soma uma vez (+6)', B.num(`select estoque from produtos where id='${L.prod}'`) === prod0 + 5 && !erros(rs).length, erros(rs));
  const chC = B.uuid();
  rs = await dois(() => dono.rpc('comissao_pagar', { p_profissional: L.ids.tosador, p_de: L.mes1, p_ate: L.hoje, p_forma: 'pix', p_valor: 0.01, p_chave: chC }));
  T.ok('pagar comissão 2x com a mesma chave: no máximo 1 pagamento', B.num(`select count(*) from comissoes_pagas where petshop_id='${P}'`) <= 1, erros(rs));
}))();
