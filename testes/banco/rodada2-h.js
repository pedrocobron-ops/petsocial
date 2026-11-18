// Segunda rodada no site real (Rafael, Bia, Neide), migração 20261221, pela API com o login de cada papel.
// - a conta a receber da mensalidade dá o nome certo ao táxi: "Táxi pet do mês" (antes "Busca fora do horário (01/11)") e
//   "Táxi pet (datas)"; a busca fora do horário continua com o nome dela;
// - indicadores: a reserva cancelada hoje para uma data futura conta no período (estadias_canceladas_no_periodo);
// - lista de espera: a coluna cheio_ao_entrar é gravada pela equipe;
// - agenda: quem só usa a agenda (sem ver valores) não apaga um horário marcado; o dono e o caixa apagam.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const T = require('../lib/teste')('rodada2-h');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Rodada 2 H' });
  const { dono, tosador, caixa, monitor } = L.sb;
  const P = L.P;
  const TODOS = [0, 1, 2, 3, 4, 5, 6];
  const esteMes = L.hoje.slice(0, 8) + '01';

  T.secao('conta da mensalidade: o táxi com o nome do táxi');
  const plano = async (pet, extra) => {
    const id = B.must(await dono.from('creche_planos').insert({ petshop_id: P, pet_id: L.pets[pet], dias: TODOS, inicio: L.mesAnterior, vence_dia: 10, taxi: extra.taxi ?? null }).select('id').single(), 'plano ' + pet).id;
    B.must(await dono.from('creche_planos_valores').upsert({ plano_id: id, petshop_id: P, valor_mensal: 1190, valor_extra: 70, taxi_valor: extra.valor ?? null, taxi_modo: extra.modo ?? 'dia' }).select('plano_id'), 'valor ' + pet);
    return id;
  };
  const pBolt = await plano('Bob', { taxi: 'ida_volta', valor: 300, modo: 'mes' });
  const cBolt = B.must(await dono.rpc('creche_cobranca_criar', { p_plano: pBolt, p_mes: esteMes, p_valor: 1190 }), 'cobrança com táxi fixo');
  const itens = JSON.parse(B.sql(`select l.itens from creche_cobrancas c join lancamentos l on l.id = c.lancamento_id where c.id='${cBolt}'`));
  T.ok('a conta tem "Táxi pet do mês R$ 300" (e não "Busca fora do horário")', itens.some((i) => i.nome === 'Táxi pet do mês' && Number(i.valor) === 300) && !itens.some((i) => /Busca fora/.test(i.nome)), itens);
  T.ok('e a mensalidade de R$ 1.190; total R$ 1.490', itens.some((i) => /^Mensalidade de/.test(i.nome) && Number(i.valor) === 1190)
    && B.num(`select l.valor from creche_cobrancas c join lancamentos l on l.id = c.lancamento_id where c.id='${cBolt}'`) === 1490, itens);
  // táxi por dia (mês passado) e uma taxa de busca fora do horário, na mesma cobrança: cada um com o seu nome
  const pMel = await plano('Mel', { taxi: 'ida', valor: 20 });
  const passado = L.mesAnterior.slice(0, 8) + '15';
  B.sql(`insert into estadias (petshop_id, pet_id, tipo, status, entrada, saida, plano_id, mensalista, dia, diarias_cobradas)
         values ('${P}', '${L.pets.Mel}', 'creche', 'encerrada', '${passado} 11:00+00', '${passado} 20:00+00', '${pMel}', 'plano', '${passado}', 1)`);
  const eAtraso = B.sql(`select id from estadias where pet_id='${L.pets.Mel}' and dia='${passado}'`);
  B.sql(`insert into creche_atrasos (estadia_id, petshop_id, pet_id, dia, saiu_em, limite, valor, estado) values ('${eAtraso}', '${P}', '${L.pets.Mel}', '${passado}', '${passado} 21:30+00', '18:00', 30, 'mensalidade')`);
  const cMel = B.must(await dono.rpc('creche_cobranca_criar', { p_plano: pMel, p_mes: esteMes, p_valor: 1190 }), 'cobrança da Mel');
  const itensMel = JSON.parse(B.sql(`select l.itens from creche_cobrancas c join lancamentos l on l.id = c.lancamento_id where c.id='${cMel}'`));
  const ddmm = passado.slice(8, 10) + '/' + passado.slice(5, 7);
  T.ok(`dia de táxi: "Táxi pet (${ddmm})" R$ 20; busca fora do horário: "Busca fora do horário (${ddmm})" R$ 30`,
    itensMel.some((i) => i.nome === `Táxi pet (${ddmm})` && Number(i.valor) === 20) && itensMel.some((i) => i.nome === `Busca fora do horário (${ddmm})` && Number(i.valor) === 30), itensMel);
  T.ok('a soma dos itens fecha com o total da cobrança', Math.abs(itensMel.reduce((t, i) => t + Number(i.qtd) * Number(i.valor), 0) - B.num(`select total from creche_cobrancas where id='${cMel}'`)) < 0.005, itensMel);

  T.secao('indicadores: cancelada hoje, para o mês que vem');
  const ent = (dia, h) => `('${dia} ${h}:00-03')::timestamptz`;
  const longe = L.dia(40);
  const eLonge = B.sql(`insert into estadias (petshop_id, pet_id, tipo, status, entrada, saida_prevista) values ('${P}', '${L.pets.Luna}', 'hotel', 'reservada', ${ent(longe, '14')}, ${ent(B.somaDias(longe, 2), '12')}) returning id`).split('\n')[0];
  B.must(await dono.from('estadias').update({ status: 'cancelada' }).eq('id', eLonge).select('id'), 'cancelar a reserva');
  T.ok('o dia do cancelamento ficou anotado', B.num(`select count(*) from estadias_canceladas where estadia_id='${eLonge}'`) === 1);
  const ind = B.must(await dono.rpc('indicadores_do_periodo', { p: P, p_de: esteMes, p_ate: L.hoje }), 'indicadores');
  const m = ind.meses[ind.meses.length - 1];
  T.ok('a reserva cancelada hoje (entrada daqui a 40 dias) conta no período pelo dia do cancelamento', m.estadias_canceladas_no_periodo === 1, m);
  T.ok('pelo dia da entrada, continua fora (é a parte das reservas marcadas)', m.estadias_canceladas === 0, m);
  B.must(await dono.from('estadias').update({ status: 'reservada' }).eq('id', eLonge).select('id'), 'voltar a reserva');
  T.ok('voltou a ser reserva: a anotação sai', B.num(`select count(*) from estadias_canceladas where estadia_id='${eLonge}'`) === 0);
  T.recusa('a equipe não lê a anotação pela API', await monitor.from('estadias_canceladas').select('estadia_id').limit(1));

  T.secao('lista de espera: entrou com vaga');
  B.sql(`update petshops set opcoes = coalesce(opcoes, '{}'::jsonb) || '{"casa.espera": {"ativo": true}}'::jsonb where id='${P}'`);
  const esp = await monitor.from('lista_espera').insert({ petshop_id: P, tipo: 'hotel', entrada: L.dia(30), saida: L.dia(32), pet_id: L.pets.Bob, pet_nome: 'Bob', cheio_ao_entrar: false }).select('id, cheio_ao_entrar').single();
  T.ok('a equipe grava "entrou com os dias livres" (não vira "Abriu vaga")', !esp.error && esp.data.cheio_ao_entrar === false, esp.error && esp.error.message);

  T.secao('apagar horário marcado: só quem vê o financeiro');
  const marcar = async (h) => B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Thor, servico_id: L.S.Banho, inicio: B.instante(L.dia(2), h, L.fuso).toISOString(), fim: B.instante(L.dia(2), h.replace(/^(\d+)/, (x) => String(Number(x) + 1).padStart(2, '0')), L.fuso).toISOString(), status: 'marcado' }).select('id').single(), 'marcar ' + h).id;
  const a1 = await marcar('09:00');
  const apagouTosador = await tosador.from('agendamentos').delete().eq('id', a1).select('id');
  T.ok('o tosador (só agenda) não apaga: nada sai do banco', !apagouTosador.error && (apagouTosador.data ?? []).length === 0 && B.num(`select count(*) from agendamentos where id='${a1}'`) === 1, apagouTosador.error && apagouTosador.error.message);
  T.passa('mas desmarca (fica no histórico)', await tosador.from('agendamentos').update({ status: 'cancelado' }).eq('id', a1).select('id'));
  const a2 = await marcar('11:00');
  const apagouCaixa = await caixa.from('agendamentos').delete().eq('id', a2).select('id');
  T.ok('o caixa (vê o financeiro) apaga', !apagouCaixa.error && (apagouCaixa.data ?? []).length === 1, apagouCaixa.error && apagouCaixa.error.message);
  const a3 = await marcar('13:00');
  T.ok('o dono apaga', ((await dono.from('agendamentos').delete().eq('id', a3).select('id')).data ?? []).length === 1);
}))();
