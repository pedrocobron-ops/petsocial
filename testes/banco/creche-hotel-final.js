// Creche e hotel, rodada final dos testadores (Rafael, creche; Bia, hotel), migração 20261218, pela API com o login de cada papel.
// - táxi pet do mensalista: o dia de táxi nasce com a presença da chamada (só com táxi por dia e preço), some quando a presença é
//   desfeita, entra na cobrança do mês seguinte (linha "taxi" em `taxas`, somada em valor_extras), volta a ficar sem cobrança quando
//   a cobrança é cancelada; o táxi fixo por mês entra na cobrança do próprio mês ("taxi_mes"); a equipe sem dinheiro não lê preço;
//   as viagens do Leva e traz (creche_taxi_viagem_marcar): levar só depois do Chegou, plano sem táxi recusado;
// - indicadores: reservas canceladas da creche e do hotel nos cancelamentos; o sinal não conta como outra conta; o valor das contas
//   leva o sinal descontado; noites de hotel;
// - link: hora de entrada e de saída do hotel e a chave Pix (link_hotel_opcoes), planos mensais (link_creche_planos, só com a opção),
//   nomes dos dias fechados (link_fechados_nomes).
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const T = require('../lib/teste')('creche-hotel-final');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Creche Hotel Final' });
  const { dono, monitor } = L.sb;
  const P = L.P;
  const TODOS = [0, 1, 2, 3, 4, 5, 6];
  const proximoMes = B.somaDias(L.hoje.slice(0, 8) + '28', 7).slice(0, 8) + '01';
  const plano = async (pet, extra) => {
    const id = B.must(await dono.from('creche_planos').insert({ petshop_id: P, pet_id: L.pets[pet], dias: TODOS, inicio: L.mesAnterior, vence_dia: 10, taxi: extra.taxi ?? null }).select('id').single(), 'plano ' + pet).id;
    B.must(await dono.from('creche_planos_valores').upsert({ plano_id: id, petshop_id: P, valor_mensal: 600, valor_extra: 70, taxi_valor: extra.valor ?? null, taxi_modo: extra.modo ?? 'dia' }).select('plano_id'), 'valor ' + pet);
    return id;
  };

  T.secao('táxi pet por dia que veio');
  const pBob = await plano('Bob', { taxi: 'ida_volta', valor: 35 });
  const pMel = await plano('Mel', { taxi: 'ida', valor: 20 });
  const pLuna = await plano('Luna', {});
  const pThor = await plano('Thor', { taxi: 'volta', valor: 150, modo: 'mes' });
  T.passa('o monitor marca o Chegou do Bob na chamada', await monitor.rpc('creche_chamada', { p_plano: pBob, p_dia: L.hoje, p_acao: 'chegou' }));
  T.ok('o dia de táxi do Bob ficou anotado com o preço do plano (R$ 35)', B.sql(`select valor || '|' || taxi from creche_taxi where pet_id='${L.pets.Bob}' and dia='${L.hoje}'`) === '35.00|ida_volta');
  B.must(await monitor.rpc('creche_chamada', { p_plano: pLuna, p_dia: L.hoje, p_acao: 'chegou' }), 'Luna chegou');
  T.ok('plano sem táxi não anota dia de táxi', B.num(`select count(*) from creche_taxi where pet_id='${L.pets.Luna}'`) === 0);
  B.must(await monitor.rpc('creche_chamada', { p_plano: pThor, p_dia: L.hoje, p_acao: 'chegou' }), 'Thor chegou');
  T.ok('táxi fixo por mês não anota dia', B.num(`select count(*) from creche_taxi where pet_id='${L.pets.Thor}'`) === 0);
  B.must(await monitor.rpc('creche_chamada', { p_plano: pMel, p_dia: L.hoje, p_acao: 'chegou' }), 'Mel chegou');
  T.ok('a Mel chegou: dia de táxi anotado', B.num(`select count(*) from creche_taxi where pet_id='${L.pets.Mel}'`) === 1);
  T.passa('a chegada da Mel é desfeita', await monitor.rpc('creche_chamada', { p_plano: pMel, p_dia: L.hoje, p_acao: 'desfazer' }));
  T.ok('… e o dia de táxi dela some', B.num(`select count(*) from creche_taxi where pet_id='${L.pets.Mel}'`) === 0);
  // um dia do mês passado também (presença de mensalista feita direto no banco, como a chamada faz)
  const passado = L.mesAnterior.slice(0, 8) + '15';
  B.sql(`insert into estadias (petshop_id, pet_id, tipo, status, entrada, saida, plano_id, mensalista, dia, diarias_cobradas)
         values ('${P}', '${L.pets.Bob}', 'creche', 'encerrada', '${passado} 11:00+00', '${passado} 20:00+00', '${pBob}', 'plano', '${passado}', 1)`);
  T.ok('a presença do mês passado também anotou o táxi', B.num(`select count(*) from creche_taxi where pet_id='${L.pets.Bob}'`) === 2);

  T.secao('quem lê o preço do táxi');
  const lidoMon = await monitor.from('creche_taxi').select('valor').eq('petshop_id', P);
  T.ok('o monitor (sem dinheiro) não lê os dias de táxi com preço', !lidoMon.error && (lidoMon.data ?? []).length === 0, lidoMon.data);
  const valMon = await monitor.from('creche_planos_valores').select('taxi_valor').eq('petshop_id', P);
  T.ok('nem o preço do táxi no plano', !valMon.error && (valMon.data ?? []).length === 0, valMon.data);
  const plMon = await monitor.from('creche_planos').select('taxi').eq('id', pBob).single();
  T.ok('mas lê ida e volta (para a rota)', !plMon.error && plMon.data.taxi === 'ida_volta', plMon.error && plMon.error.message);
  T.ok('o dono lê os dias de táxi', ((await dono.from('creche_taxi').select('valor').eq('petshop_id', P)).data ?? []).length === 2);

  T.secao('a cobrança leva o táxi');
  const cBob = B.must(await dono.rpc('creche_cobranca_criar', { p_plano: pBob, p_mes: L.hoje.slice(0, 8) + '01', p_valor: 600 }), 'cobrança deste mês do Bob');
  let c = JSON.parse(B.sql(`select row_to_json(x) from (select taxas, valor_extras, total from creche_cobrancas where id='${cBob}') x`));
  T.ok('a cobrança deste mês leva o táxi do mês passado (1 dia, R$ 35, tipo táxi)', c.taxas.length === 1 && c.taxas[0].tipo === 'taxi' && Number(c.taxas[0].valor) === 35 && Number(c.valor_extras) === 35 && Number(c.total) === 635, c);
  T.ok('o dia de hoje fica para a do mês que vem', B.num(`select count(*) from creche_taxi where pet_id='${L.pets.Bob}' and cobranca_id is null`) === 1);
  T.passa('cancelar a cobrança', await dono.rpc('creche_cobranca_cancelar', { p_id: cBob }));
  T.ok('… o dia de táxi volta a ficar sem cobrança', B.num(`select count(*) from creche_taxi where pet_id='${L.pets.Bob}' and cobranca_id is null`) === 2);
  const cProx = B.must(await dono.rpc('creche_cobranca_criar', { p_plano: pBob, p_mes: proximoMes, p_valor: 600 }), 'cobrança do mês que vem do Bob');
  c = JSON.parse(B.sql(`select row_to_json(x) from (select taxas, valor_extras, total from creche_cobrancas where id='${cProx}') x`));
  T.ok('a do mês que vem leva os 2 dias de táxi (R$ 70)', c.taxas.filter((t) => t.tipo === 'taxi').length === 2 && Number(c.valor_extras) === 70 && Number(c.total) === 670, c);
  const cThor = B.must(await dono.rpc('creche_cobranca_criar', { p_plano: pThor, p_mes: proximoMes, p_valor: 600 }), 'cobrança do Thor');
  c = JSON.parse(B.sql(`select row_to_json(x) from (select taxas, valor_extras, total from creche_cobrancas where id='${cThor}') x`));
  T.ok('táxi fixo por mês: R$ 150 na cobrança do próprio mês (tipo taxi_mes)', c.taxas.length === 1 && c.taxas[0].tipo === 'taxi_mes' && Number(c.total) === 750, c);
  T.ok('a conta a receber da cobrança tem o total com o táxi', B.num(`select l.valor from creche_cobrancas c join lancamentos l on l.id = c.lancamento_id where c.id='${cThor}'`) === 750);

  T.secao('Leva e traz do mensalista');
  T.passa('o monitor marca Buscado do Bob', await monitor.rpc('creche_taxi_viagem_marcar', { p_petshop: P, p_plano: pBob, p_dia: L.hoje, p_perna: 'buscar', p_feito: true }));
  T.passa('e Entregue em casa (o Bob já chegou)', await monitor.rpc('creche_taxi_viagem_marcar', { p_petshop: P, p_plano: pBob, p_dia: L.hoje, p_perna: 'levar', p_feito: true }));
  T.ok('as duas viagens ficaram anotadas', B.num(`select count(*) from creche_taxi_viagens where plano_id='${pBob}' and dia='${L.hoje}'`) === 2);
  T.recusa('Mel (só ida) não tem volta', await monitor.rpc('creche_taxi_viagem_marcar', { p_petshop: P, p_plano: pMel, p_dia: L.hoje, p_perna: 'levar', p_feito: true }), /não tem táxi/);
  T.recusa('plano sem táxi é recusado', await monitor.rpc('creche_taxi_viagem_marcar', { p_petshop: P, p_plano: pLuna, p_dia: L.hoje, p_perna: 'buscar', p_feito: true }), /não tem táxi/);
  const amanha = L.dia(1);
  T.recusa('levar de volta antes do Chegou é recusado', await monitor.rpc('creche_taxi_viagem_marcar', { p_petshop: P, p_plano: pBob, p_dia: amanha, p_perna: 'levar', p_feito: true }), /ainda não chegou/);
  T.passa('desfazer', await monitor.rpc('creche_taxi_viagem_marcar', { p_petshop: P, p_plano: pBob, p_dia: L.hoje, p_perna: 'levar', p_feito: false }));
  T.ok('… a viagem sai', B.num(`select count(*) from creche_taxi_viagens where plano_id='${pBob}' and dia='${L.hoje}'`) === 1);
  T.recusa('quem é de fora não marca', await B.cliente().rpc('creche_taxi_viagem_marcar', { p_petshop: P, p_plano: pBob, p_dia: L.hoje, p_perna: 'buscar', p_feito: true }));

  T.secao('indicadores: cancelamentos e sinal');
  const ent = (dia, h) => `('${dia} ${h}:00-03')::timestamptz`;
  // hotel do Rex: sinal de R$ 78 e check-out de R$ 222 (conta de R$ 300); duas reservas canceladas
  const eRex = B.sql(`insert into estadias (petshop_id, pet_id, tipo, status, entrada, saida, saida_prevista, valor_diaria, valor_cobrado, diarias_cobradas)
    values ('${P}', '${L.pets.Rex}', 'hotel', 'encerrada', ${ent(L.dia(-3), '14')}, ${ent(L.hoje, '11')}, ${ent(L.hoje, '12')}, 150, 300, 2) returning id`).split('\n')[0];
  const lSinal = B.sql(`insert into lancamentos (petshop_id, tipo, valor, categoria, descricao, pago, data, forma) values ('${P}', 'entrada', 78, 'Creche e hotel', 'Sinal da reserva', true, '${L.hoje}', 'pix') returning id`).split('\n')[0];
  const lConta = B.sql(`insert into lancamentos (petshop_id, tipo, valor, categoria, descricao, pago, data, forma) values ('${P}', 'entrada', 222, 'Creche e hotel', 'Hotel de Rex', true, '${L.hoje}', 'pix') returning id`).split('\n')[0];
  B.sql(`insert into estadias_valores (estadia_id, petshop_id, sinal, sinal_estado, sinal_lancamento_id, sinal_pago_em, conta) values ('${eRex}', '${P}', 78, 'pago', '${lSinal}', '${L.hoje}', '{"lancamento_id": "${lConta}"}')`);
  for (const pet of ['Luna', 'Mel']) {
    B.sql(`insert into estadias (petshop_id, pet_id, tipo, status, entrada, saida_prevista) values ('${P}', '${L.pets[pet]}', 'hotel', 'cancelada', ${ent(L.hoje, '14')}, ${ent(L.dia(2), '12')})`);
  }
  const ind = B.must(await dono.rpc('indicadores_do_periodo', { p: P, p_de: L.hoje.slice(0, 8) + '01', p_ate: L.hoje }), 'indicadores');
  const m = ind.meses[ind.meses.length - 1];
  T.ok('as 2 reservas canceladas aparecem (de 3 reservas do hotel no mês)', m.estadias_canceladas === 2 && m.estadias_marcadas === 3, m);
  T.ok('o sinal não conta como outra conta: 1 conta paga', m.contas === 1, m);
  T.ok('a conta vale R$ 300 (R$ 222 + o sinal de R$ 78 descontado nela)', Number(m.valor_contas) === 300 && Number(m.valor_medio) === 300, m);
  T.ok('noites de hotel do Rex no mês (até 3)', m.noites_hotel >= 1 && m.noites_hotel <= 3, m.noites_hotel);
  const indMon = await monitor.rpc('indicadores_do_periodo', { p: P, p_de: L.hoje.slice(0, 8) + '01', p_ate: L.hoje });
  T.ok('quem não vê relatórios continua sem indicadores', Boolean(indMon.error));

  T.secao('link: horas do hotel, Pix, planos e dias fechados');
  B.sql(`update petshops set opcoes = coalesce(opcoes, '{}'::jsonb) || '{"hotel.horas": {"entrada": "14:00", "saida": "12:00"}, "hotel.sinal": {"ativo": true, "modo": "pct", "valor": 30}, "hotel.pix": "pix@loja.com"}'::jsonb where id='${P}'`);
  const anon = B.cliente();
  let o = B.must(await anon.rpc('link_hotel_opcoes', { p_codigo: L.codigo }), 'opções do hotel no link');
  T.ok('o link recebe a hora de entrada e de saída do hotel', o.horas && o.horas.entrada === '14:00' && o.horas.saida === '12:00', o.horas);
  T.ok('e a chave Pix (com o sinal ligado)', o.pix === 'pix@loja.com', o.pix);
  B.sql(`update petshops set opcoes = opcoes || '{"hotel.sinal": {"ativo": false}}'::jsonb where id='${P}'`);
  o = B.must(await anon.rpc('link_hotel_opcoes', { p_codigo: L.codigo }), 'opções do hotel sem sinal');
  T.ok('sem o sinal, o Pix não vai para o link', o.pix == null, o.pix);
  B.must(await dono.from('creche_modelos').insert([{ petshop_id: P, nome: '2x por semana', vezes: 2, valor_mensal: 560 }, { petshop_id: P, nome: '3x por semana', vezes: 3, valor_mensal: 780 }]).select('id'), 'modelos de plano');
  T.ok('planos no link: desligado, nada aparece', (await anon.rpc('link_creche_planos', { p_codigo: L.codigo })).data == null);
  B.sql(`update petshops set opcoes = opcoes || '{"creche.planos_no_link": true}'::jsonb where id='${P}'`);
  const pl = B.must(await anon.rpc('link_creche_planos', { p_codigo: L.codigo }), 'planos no link');
  T.ok('ligado, os 2 planos com o preço por mês e a chave Pix', pl.planos.length === 2 && Number(pl.planos[0].valor) === 560 && pl.planos[0].vezes === 2 && pl.pix === 'pix@loja.com', pl);
  B.sql(`update petshops set opcoes = opcoes || '{"hotel.link_sem_preco": true}'::jsonb where id='${P}'`);
  const sem = B.must(await anon.rpc('link_creche_planos', { p_codigo: L.codigo }), 'planos sem preço');
  T.ok('com o preço escondido no link, os planos vêm sem valor', sem.planos.every((x) => x.valor == null), sem);
  B.must(await dono.from('dias_especiais').insert({ petshop_id: P, dia: L.dia(10), nome: 'Consciência Negra', fechado: true, feriado: true }).select('id'), 'feriado fechado');
  const nomes = B.must(await anon.rpc('link_fechados_nomes', { p_codigo: L.codigo }), 'nomes dos dias fechados');
  T.ok('o link sabe o nome do dia fechado', nomes[L.dia(10)] === 'Consciência Negra', nomes);
  B.sql(`update petshops set link_ativo = false where id='${P}'`);
  T.ok('link desligado: nada', (await anon.rpc('link_creche_planos', { p_codigo: L.codigo })).data == null && Object.keys((await anon.rpc('link_fechados_nomes', { p_codigo: L.codigo })).data ?? {}).length === 0);
}))();
