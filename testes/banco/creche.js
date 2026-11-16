// Cobrança da creche (mensalistas), conferida com a conta feita aqui e com a cópia da regra no aplicativo (src/lib/gestao/creche.ts):
// mês cheio, proporcional na entrada e na saída do plano, dia extra cobrado no mês seguinte, desconto de irmão (e a troca de quem
// paga cheio quando um plano muda de valor) e o recebimento. O mês de referência é sempre o mês que vem (nada depende de hoje).
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('creche');
const CR = lib('creche');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Creche' });
  const { dono } = L.sb;
  const P = L.P;
  const M = B.somaDias(L.hoje.slice(0, 8) + '28', 7).slice(0, 8) + '01'; // primeiro dia do mês que vem
  const fimM = B.somaDias(B.somaDias(M, 31).slice(0, 8) + '01', -1);
  const mesDate = new Date(Number(M.slice(0, 4)), Number(M.slice(5, 7)) - 1, 1);
  const SEG_QUA_SEX = [1, 3, 5];
  // conta à mão: quantos dias do plano no mês, e quantos a partir de / até um dia
  const diasDoPlano = (dias, de = M, ate = fimM) => { let n = 0; for (let d = M; d <= fimM; d = B.somaDias(d, 1)) if (dias.includes(B.diaDaSemana(d)) && d >= de && d <= ate) n++; return n; };
  const prop = (v, dias, de, ate) => Math.round(v * diasDoPlano(dias, de, ate) / diasDoPlano(dias) * 100) / 100;
  const novoPlano = async (pet, dias, inicio, mensal, extra = 45, fim = null) => {
    const id = B.must(await dono.from('creche_planos').insert({ petshop_id: P, pet_id: L.pets[pet], dias, inicio, fim, vence_dia: 10 }).select('id').single(), 'plano ' + pet).id;
    B.must(await dono.from('creche_planos_valores').upsert({ plano_id: id, petshop_id: P, valor_mensal: mensal, valor_extra: extra }).select('plano_id'), 'valor ' + pet);
    return id;
  };
  const cob = (id) => JSON.parse(B.sql(`select row_to_json(x) from (select c.valor_cheio::float, c.valor_mensal::float, c.valor_extras::float, c.desconto::float, c.desconto_irmao::float, c.total::float, c.vencimento, c.status, c.extras, l.valor::float as conta, l.pago, l.categoria from creche_cobrancas c left join lancamentos l on l.id = c.lancamento_id where c.id='${id}') x`) || 'null');
  const sugestao = (id, valor) => Number(B.sql(`select public.creche_sugestao_mensal('${id}', '${M}', ${valor})`));
  const planoTs = (inicio, fim, dias) => ({ inicio, fim, dias, pausa_de: null, pausa_ate: null });
  const horario = JSON.parse(B.sql(`select horario from petshops where id='${P}'`));

  T.secao('mês cheio');
  const pThor = await novoPlano('Thor', SEG_QUA_SEX, L.mesAnterior, 500);
  const cThor = B.must(await dono.rpc('creche_cobranca_criar', { p_plano: pThor, p_mes: M }), 'cobrança Thor');
  let c = cob(cThor);
  T.ok('mensalidade cheia: R$ 500,00, conta a receber de R$ 500,00 em "Creche: mensalidade"', c.valor_mensal === 500 && c.total === 500 && c.conta === 500 && !c.pago && c.categoria === CR.CATEGORIA_MENSALIDADE, c);
  T.ok('vence no dia combinado (10)', c.vencimento === M.slice(0, 8) + '10', c.vencimento);
  T.ok('criar de novo devolve a mesma cobrança', B.must(await dono.rpc('creche_cobranca_criar', { p_plano: pThor, p_mes: M }), 'de novo') === cThor);

  T.secao('proporcional');
  const inicioBob = B.somaDias(M, 14);
  const pBob = await novoPlano('Bob', SEG_QUA_SEX, inicioBob, 600);
  const esperadoBob = prop(600, SEG_QUA_SEX, inicioBob, fimM);
  T.ok(`plano que começa dia 15: ${diasDoPlano(SEG_QUA_SEX, inicioBob)} de ${diasDoPlano(SEG_QUA_SEX)} dias = R$ ${esperadoBob.toFixed(2)} (banco)`, sugestao(pBob, 600) === esperadoBob, sugestao(pBob, 600));
  const tsBob = CR.sugestaoDoMes(planoTs(inicioBob, null, SEG_QUA_SEX), mesDate, 600, horario);
  T.ok('… e a mesma conta no aplicativo (sugestaoDoMes)', tsBob.valor === esperadoBob && tsBob.proporcional, tsBob);
  c = cob(B.must(await dono.rpc('creche_cobranca_criar', { p_plano: pBob, p_mes: M }), 'cobrança Bob'));
  T.ok('a cobrança sai proporcional e vence no dia em que o plano começa', c.valor_cheio === 600 && c.valor_mensal === esperadoBob && c.total === esperadoBob && c.vencimento === inicioBob, c);
  const fimLuna = B.somaDias(M, 9);
  const pLuna = await novoPlano('Luna', SEG_QUA_SEX, L.mesAnterior, 450, 45, fimLuna);
  const esperadoLuna = prop(450, SEG_QUA_SEX, M, fimLuna);
  T.ok(`plano que termina dia 10: R$ ${esperadoLuna.toFixed(2)} (banco = aplicativo)`, sugestao(pLuna, 450) === esperadoLuna && CR.sugestaoDoMes(planoTs(L.mesAnterior, fimLuna, SEG_QUA_SEX), mesDate, 450, horario).valor === esperadoLuna, sugestao(pLuna, 450));
  T.recusa('plano que já terminou não gera cobrança no mês seguinte', await dono.rpc('creche_cobranca_criar', { p_plano: pLuna, p_mes: B.somaDias(fimM, 1) }), /não vale/);

  T.secao('dia extra');
  // hoje não é dia do plano do Rex: vem como dia extra, e o extra entra na cobrança do mês seguinte
  const diasRex = [B.diaDaSemana(L.dia(1))];
  const pRex = await novoPlano('Rex', diasRex, L.mesAnterior, 300, 45);
  const ch = B.must(await dono.rpc('creche_chamada', { p_plano: pRex, p_dia: L.hoje, p_acao: 'extra' }), 'chamada extra');
  T.ok('chamada "veio no dia extra" cria a presença', B.num(`select count(*) from estadias where pet_id='${L.pets.Rex}' and dia='${L.hoje}' and mensalista='extra' and status='em_casa'`) === 1, ch);
  B.must(await dono.rpc('creche_chamada', { p_plano: pRex, p_dia: L.hoje, p_acao: 'saiu' }), 'saiu');
  c = cob(B.must(await dono.rpc('creche_cobranca_criar', { p_plano: pRex, p_mes: M }), 'cobrança Rex'));
  const mensalRex = sugestao(pRex, 300);
  T.ok('a cobrança do mês seguinte traz 1 dia extra de R$ 45,00', c.valor_extras === 45 && c.total === mensalRex + 45 && c.extras.length === 1 && c.extras[0].dia === L.hoje, c);
  T.ok('o dia extra fica ligado à cobrança (não é cobrado duas vezes)', B.num(`select count(*) from estadias where pet_id='${L.pets.Rex}' and dia='${L.hoje}' and cobranca_id is not null`) === 1);

  T.secao('desconto de irmão');
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'creche.desconto_irmao': { ativo: true, tipo: 'pct', valor: 10, qual: 'mais_barato' } } }), 'liga o desconto');
  const pMel = await novoPlano('Mel', SEG_QUA_SEX, L.mesAnterior, 300);
  const cMel = B.must(await dono.rpc('creche_cobranca_criar', { p_plano: pMel, p_mes: M }), 'cobrança Mel');
  c = cob(cMel);
  T.ok('Mel (irmã mais barata do Thor): 10% de R$ 300,00 = R$ 30,00, total R$ 270,00', c.desconto_irmao === 30 && c.desconto === 30 && c.total === 270 && c.conta === 270, c);
  T.ok('Thor (o mais caro) continua cheio', cob(cThor).desconto_irmao === 0 && cob(cThor).total === 500);
  const opcoes = B.must(await dono.rpc('petshop_opcoes', { p: P }), 'opções');
  const planos = B.must(await dono.from('creche_planos').select(CR.SELECT_PLANO).eq('petshop_id', P), 'planos').map((p) => ({ ...p, valor_mensal: Number(B.sql(`select valor_mensal from creche_planos_valores where plano_id='${p.id}'`)), valor_extra: 45, temValor: true }));
  const tsMel = CR.descontoIrmao({ opcoes }, planos, planos.find((p) => p.id === pMel), mesDate, 300, horario);
  T.ok('o aplicativo calcula o mesmo desconto (descontoIrmao)', tsMel === 30, tsMel);
  B.must(await dono.from('creche_planos_valores').update({ valor_mensal: 700 }).eq('plano_id', pMel).select('plano_id'), 'Mel fica mais cara');
  let t2 = cob(cThor), m2 = cob(cMel);
  // a cobrança já criada não muda de valor sozinha (de propósito), mas quem paga cheio na família é refeito na hora
  T.ok('Mel passa a R$ 700,00: o desconto passa para o Thor (10% de 500 = 50) e sai da Mel', m2.desconto_irmao === 0 && t2.desconto_irmao === 50 && t2.total === 450 && t2.conta === 450, { thor: t2, mel: m2 });
  B.must(await dono.rpc('creche_cobranca_editar', { p_id: cMel, p_valor: 700, p_desconto: 0, p_vencimento: m2.vencimento }), 'acerta o valor da Mel');
  m2 = cob(cMel); t2 = cob(cThor);
  T.ok('acertado o valor da cobrança da Mel: R$ 700,00 cheio; Thor segue com R$ 50,00 de desconto', m2.total === 700 && m2.conta === 700 && m2.desconto_irmao === 0 && t2.total === 450, { thor: t2, mel: m2 });
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'creche.desconto_irmao': { ativo: false, tipo: 'pct', valor: 10, qual: 'mais_barato' } } }), 'desliga o desconto');

  T.secao('recebimento');
  const conta = B.sql(`select lancamento_id from creche_cobrancas where id='${cThor}'`);
  const r = B.must(await dono.rpc('receber_conta', { p_conta: conta, p_valor: t2.conta, p_forma: 'pix', p_chave: B.uuid() }), 'receber');
  T.ok('receber a mensalidade quita a conta da cobrança', r.quitada === true && cob(cThor).pago === true, { r, c: cob(cThor) });
  const desfaz = await dono.rpc('creche_cobranca_desfazer_baixa', { p_id: cThor });
  T.ok('desfazer o recebimento deixa a conta da cobrança em aberto de novo', !desfaz.error && cob(cThor).status === 'aberta' && cob(cThor).pago === false, desfaz.error?.message ?? cob(cThor));
  T.recusa('a recepção (sem financeiro) não cria cobrança', await L.sb.caixa.rpc('creche_cobranca_criar', { p_plano: pMel, p_mes: B.somaDias(fimM, 1) }));
  T.recusa('a monitora não cria cobrança', await L.sb.monitor.rpc('creche_cobranca_criar', { p_plano: pMel, p_mes: B.somaDias(fimM, 1) }));
}))();
