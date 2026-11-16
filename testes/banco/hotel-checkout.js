// Check-out do hotel conferido com o que já foi pago (migração 20261181): o banco recusa receber, na saída, mais do que
// falta (o sinal já pago entra na conta), sem gravar nada; a conta certa passa. E o check-in feito por engano: a data
// reservada fica guardada e "Desfazer check-in" volta para a reserva, no mesmo dia, só para quem mexe em creche e hotel.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const T = require('../lib/teste')('hotel-checkout');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Hotel check-out' });
  const { dono, caixa, monitor, tosador } = L.sb;
  const P = L.P;
  const ontem = new Date(Date.now() - 864e5).toISOString();
  const agora = () => new Date().toISOString();
  const ch = (s) => `t-${s}-${B.sufixo()}`;
  const lanc = () => B.num(`select count(*) from lancamentos where petshop_id='${P}'`);
  const somaEntradas = () => Number(B.sql(`select coalesce(sum(valor),0) from lancamentos where petshop_id='${P}' and tipo='entrada' and pago`));

  // uma estadia na casa (1 noite, diária 110) com o sinal de R$ 107,25 já pago
  async function estadiaComSinal(pet, sinal, modo = 'pago') {
    const id = B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: pet, tipo: 'hotel', status: 'em_casa', entrada: ontem, valor_diaria: 110 }).select('id').single(), 'estadia').id;
    const linha = modo === 'pago'
      ? { tipo: 'entrada', valor: sinal, forma: 'pix', categoria: 'Creche e hotel', descricao: 'Sinal da reserva', cliente_id: L.tutores.Ana, pago: true, data: L.hoje }
      : { tipo: 'entrada', valor: sinal, forma: null, categoria: 'Creche e hotel', descricao: 'Sinal da reserva', cliente_id: L.tutores.Ana, pago: false, data: L.hoje, vencimento: L.hoje };
    B.must(await caixa.rpc('estadia_sinal', { p_petshop: P, p_estadia: id, p_chave: ch('sinal'), p_passos: [
      { t: 'lancamento', nome: 'sinal', linha },
      { t: 'estadia_valores', estadia: id, modo: 'upsert', campos: { sinal, sinal_estado: modo, sinal_lancamento_id: '$ref:sinal', sinal_pago_em: modo === 'pago' ? L.hoje : null } },
    ] }), 'sinal');
    return id;
  }
  // o que a folha de check-out manda (mesmos passos de src/components/gestao/hotel/checkout.tsx)
  const checkout = (sb, id, { total, receber, extra = [] }) => sb.rpc('estadia_checkout', { p_petshop: P, p_estadia: id, p_chave: ch('co'), p_passos: [
    { t: 'estadia_fechar', id, saida: agora(), diarias: 1, valor_cobrado: total },
    ...(receber > 0 ? [{ t: 'lancamento', nome: 'principal', linha: { tipo: 'entrada', valor: receber, forma: 'dinheiro', categoria: 'Creche e hotel', descricao: 'Hotel: 1 diária', cliente_id: L.tutores.Ana, pago: true, data: L.hoje } }] : []),
    ...extra,
  ] });

  T.secao('sinal pago: a folha que cobra antes do sinal chegar é recusada');
  const thor = await estadiaComSinal(L.pets.Thor, 107.25);
  let n0 = lanc(), s0 = somaEntradas();
  // a folha sem o sinal: total 110, recebe 110 (o sinal seria cobrado de novo)
  let r = await checkout(caixa, thor, { total: 110, receber: 110 });
  T.recusa('receber R$ 110,00 com R$ 107,25 de sinal pago: recusado', r, /falta receber R\$ 2,75/);
  T.ok('a recusa tem a marca maestro:passa_do_devido', r.error?.hint === 'maestro:passa_do_devido', r.error);
  T.ok('nada gravado: a estadia continua na casa e nenhum lançamento novo', B.sql(`select status from estadias where id='${thor}'`) === 'em_casa' && lanc() === n0 && somaEntradas() === s0);
  // a mesma coisa com o dono (quem cuida do financeiro também é conferido) e com o valor "fiado"
  r = await dono.rpc('estadia_checkout', { p_petshop: P, p_estadia: thor, p_chave: ch('co'), p_passos: [
    { t: 'estadia_fechar', id: thor, saida: agora(), diarias: 1, valor_cobrado: 110 },
    { t: 'lancamento', nome: 'principal', linha: { tipo: 'entrada', valor: 110, forma: null, categoria: 'Creche e hotel', cliente_id: L.tutores.Ana, pago: false, data: L.hoje, vencimento: L.hoje } },
  ] });
  T.recusa('o dono anotando R$ 110,00 a receber com o sinal pago: recusado', r, /sinal/);
  // a conta certa: 110 − 107,25 = 2,75
  r = await checkout(caixa, thor, { total: 110, receber: 2.75 });
  T.passa('receber R$ 2,75 (110,00 − 107,25): passa', r);
  T.ok('entrou R$ 2,75 na saída; total recebido pela estadia = R$ 110,00', B.centavos(somaEntradas() - s0) === 275 && B.centavos(Number(B.sql(`select valor_cobrado from estadias where id='${thor}'`))) === 11000);

  T.secao('sinal a receber em parte: a conta do resto recebida junto');
  const mel = await estadiaComSinal(L.pets.Mel, 107.25, 'a_receber');
  const contaSinal = B.sql(`select sinal_lancamento_id from estadias_valores where estadia_id='${mel}'`);
  B.must(await caixa.rpc('receber_conta', { p_conta: contaSinal, p_valor: 100, p_forma: 'pix', p_chave: ch('parte') }), 'parte do sinal');
  T.ok('o banco anota R$ 100,00 recebidos do sinal de R$ 107,25', B.sql(`select sinal||'/'||sinal_recebido from estadias_valores where estadia_id='${mel}'`) === '107.25/100.00');
  r = await checkout(caixa, mel, { total: 110, receber: 110 });
  T.recusa('receber R$ 110,00 sem descontar o sinal: recusado', r, /falta receber R\$ 2,75/);
  s0 = somaEntradas();
  r = await checkout(caixa, mel, { total: 110, receber: 2.75, extra: [{ t: 'receber', conta: contaSinal, valor: 7.25, forma: 'dinheiro', esperado: 7.25 }] });
  T.passa('receber R$ 2,75 da estadia + R$ 7,25 que faltavam do sinal: passa', r);
  T.ok('entrou R$ 10,00 agora; sinal pago inteiro', B.centavos(somaEntradas() - s0) === 1000 && B.sql(`select sinal_estado from estadias_valores where estadia_id='${mel}'`) === 'pago');

  T.secao('pagar a mais de propósito continua possível');
  const bob = await estadiaComSinal(L.pets.Bob, 107.25);
  // acréscimo digitado: o total gravado sobe junto (110 + 10 = 120; recebe 120 − 107,25 = 12,75)
  r = await checkout(caixa, bob, { total: 120, receber: 12.75 });
  T.passa('acréscimo de R$ 10,00 (total 120,00, recebe 12,75): passa', r);
  const luna = await estadiaComSinal(L.pets.Luna, 285);
  // saiu antes: estadia de 95, pago 285 antes, 190 de crédito, nada entra agora
  r = await checkout(caixa, luna, { total: 95, receber: 0, extra: [{ t: 'credito', cliente: L.tutores.Ana, valor: 190, estadia: luna, motivo: 'Pago a mais' }] });
  T.passa('pago a mais (R$ 190,00 de crédito, nada recebido agora): passa', r);
  // crédito usado conta como recebido: Rex sem sinal, total 110, usa 110 do crédito e ainda tenta receber 110
  const rex = B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Rex, tipo: 'hotel', status: 'em_casa', entrada: ontem, valor_diaria: 110 }).select('id').single(), 'rex').id;
  r = await checkout(caixa, rex, { total: 110, receber: 110, extra: [{ t: 'credito', cliente: L.tutores.Ana, valor: -110, estadia: rex, motivo: 'Usado' }] });
  T.recusa('R$ 110,00 do crédito + R$ 110,00 em dinheiro numa estadia de R$ 110,00: recusado', r, /passa do total/);
  T.ok('o crédito não foi usado (nada gravado)', B.centavos(Number(B.sql(`select coalesce(sum(valor),0) from clientes_creditos where petshop_id='${P}'`))) === 19000);
  r = await checkout(caixa, rex, { total: 110, receber: 0, extra: [{ t: 'credito', cliente: L.tutores.Ana, valor: -110, estadia: rex, motivo: 'Usado' }] });
  T.passa('a mesma conta paga só com o crédito: passa', r);

  T.secao('check-in por engano: desfazer no mesmo dia');
  const reservaEm = `${L.dia(3)}T12:00:00.000Z`;
  const res = B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Thor, tipo: 'hotel', status: 'reservada', entrada: reservaEm, saida_prevista: `${L.dia(6)}T12:00:00.000Z` }).select('id').single(), 'reserva').id;
  // o check-in da tela: status na casa e entrada agora
  B.must(await monitor.from('estadias').update({ status: 'em_casa', entrada: agora() }).eq('id', res).eq('status', 'reservada').select('id'), 'check-in');
  let lido = await monitor.from('estadias_checkin_feito').select('estadia_id, entrada_reservada').eq('estadia_id', res);
  T.ok('a monitora lê o check-in de hoje com a data reservada', lido.data?.length === 1 && new Date(lido.data[0].entrada_reservada).toISOString() === reservaEm, lido);
  lido = await tosador.from('estadias_checkin_feito').select('estadia_id').eq('estadia_id', res);
  T.ok('o tosador (sem creche e hotel) lê, mas não desfaz', !lido.error);
  r = await tosador.rpc('estadia_desfazer_checkin', { p_estadia: res });
  T.recusa('o tosador não desfaz o check-in', r);
  r = await L.sb.estoque.rpc('estadia_desfazer_checkin', { p_estadia: res });
  T.recusa('o estoque não desfaz o check-in', r);
  r = await B.cliente().rpc('estadia_desfazer_checkin', { p_estadia: res });
  T.recusa('anônimo não desfaz', r);
  T.recusa('ninguém grava direto na tabela', await dono.from('estadias_checkin_feito').insert({ estadia_id: rex, petshop_id: P, entrada_reservada: agora() }));
  r = await monitor.rpc('estadia_desfazer_checkin', { p_estadia: res });
  T.passa('a monitora desfaz o check-in', r);
  T.ok('a estadia voltou para reservada, na data de antes, e o registro saiu', B.sql(`select status||' '||to_char(entrada at time zone 'UTC','YYYY-MM-DD"T"HH24:MI') from estadias where id='${res}'`) === `reservada ${reservaEm.slice(0, 16)}` && B.num(`select count(*) from estadias_checkin_feito where estadia_id='${res}'`) === 0);
  r = await monitor.rpc('estadia_desfazer_checkin', { p_estadia: res });
  T.recusa('desfazer de novo: recusado', r, /não pode mais ser desfeito/);
  // check-in de novo, mas feito "ontem": não desfaz mais
  B.must(await monitor.from('estadias').update({ status: 'em_casa', entrada: agora() }).eq('id', res).select('id'), 'check-in 2');
  B.sql(`update estadias_checkin_feito set feito_em = now() - interval '2 days' where estadia_id='${res}'`);
  T.recusa('check-in de outro dia: não desfaz', await monitor.rpc('estadia_desfazer_checkin', { p_estadia: res }), /mesmo dia/);
  // o check-out apaga o registro
  B.must(await monitor.from('estadias').update({ status: 'encerrada', saida: agora(), diarias_cobradas: 1 }).eq('id', res).select('id'), 'check-out');
  T.ok('depois do check-out, o registro some', B.num(`select count(*) from estadias_checkin_feito where estadia_id='${res}'`) === 0);
  lido = await B.cliente().from('estadias_checkin_feito').select('estadia_id').limit(5);
  T.ok('anônimo não lê nada', !lido.data?.length);
}))();
