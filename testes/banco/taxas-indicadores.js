// Taxas da maquininha e Indicadores (migração 20261204: taxas_maquininha, lancamentos_taxas, taxa_calcular, maquininha_parcelas,
// taxas_do_periodo, lucro_do_periodo com a taxa, indicadores_do_periodo), lançando pelo mesmo código das telas (dinheiro.ts) e
// conferindo à mão:
// - a taxa de cada pagamento é guardada NA HORA (débito, crédito, crédito parcelado, Pix, pagamento dividido, dinheiro sem taxa)
//   e não muda quando o dono muda as taxas depois; mudar o valor do lançamento refaz a conta com a regra daquele dia;
// - a conta do banco é a mesma de maquininha.ts (calcularTaxa), inclusive o meio centavo;
// - quem lê e grava: só o dono grava; quem cuida do financeiro lê; recepção, tosador, outra loja e anônimo não;
// - Quanto sobrou: a taxa é uma linha à parte (o resultado do Financeiro não muda);
// - Indicadores: por mês, os mesmos números de lucro_do_periodo e de faturamento.ts; contagens, retorno em 60 dias e papéis.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('taxas-indicadores');
const D = lib('dinheiro'), F = lib('faturamento'), MQ = lib('maquininha'), IN = lib('indicadores');

const ultimoDia = (iso) => B.sql(`select to_char((date '${iso.slice(0, 8)}01' + interval '1 month - 1 day')::date, 'YYYY-MM-DD')`);
const c = (n) => B.centavos(n);

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Taxas' });
  const { dono, caixa: cx, tosador: tos } = L.sb;
  const P = L.P;
  const fim = ultimoDia(L.hoje);
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'abrir o caixa');
  const lancar = (sb, valor, forma, extra = {}) => D.lancarPago(sb, P, { tipo: 'entrada', valor, forma, categoria: 'Venda de produtos', chave: D.novaChaveDeOperacao(), ...extra });
  const taxaDe = (id) => B.sql(`select coalesce((select taxa::text from lancamentos_taxas where lancamento_id='${id}'), 'sem')`);

  T.secao('antes de preencher as taxas');
  const antes = await lancar(cx, 100, 'debito');
  T.ok('venda no débito sem taxas cadastradas: nada guardado', taxaDe(antes.id) === 'sem');

  T.secao('as taxas da loja: só o dono grava');
  const regra = {
    debito_pct: 2, debito_fixo: 0, debito_dias: 1, credito_pct: 4, credito_fixo: 0.5, credito_dias: 30,
    parcelado_pct: 6, parcelado_dias: 30, parcelas_pct: { 3: 7.5 }, pix_pct: 0.99, pix_fixo: 0, pix_dias: 0,
  };
  T.recusa('a recepção não grava as taxas', await cx.from('taxas_maquininha').insert({ petshop_id: P, ...regra }).select('petshop_id'));
  T.recusa('o tosador não grava as taxas', await tos.from('taxas_maquininha').insert({ petshop_id: P, ...regra }).select('petshop_id'));
  T.recusa('% acima de 30 é recusada', await dono.from('taxas_maquininha').insert({ petshop_id: P, ...regra, credito_pct: 45 }).select('petshop_id'));
  T.recusa('parcela 13 é recusada', await dono.from('taxas_maquininha').insert({ petshop_id: P, ...regra, parcelas_pct: { 13: 9 } }).select('petshop_id'));
  await MQ.salvarTaxas(dono, P, { ...MQ.TAXAS_ZERADAS, ...regra, parcelas_pct: { 3: 7.5 } });
  T.ok('o dono grava (uma linha, com quem mudou)', B.sql(`select count(*) || '|' || (atualizado_por is not null) from taxas_maquininha where petshop_id='${P}' group by atualizado_por`) === '1|true');
  const lidas = await MQ.carregarTaxas(dono, P, true);
  T.ok('o dono lê de volta (crédito 4% + R$ 0,50; 3x 7,5%)', lidas && lidas.credito_pct === 4 && lidas.credito_fixo === 0.5 && lidas.parcelas_pct['3'] === 7.5, lidas);
  T.ok('a recepção não lê as taxas', (B.must(await cx.from('taxas_maquininha').select('petshop_id').eq('petshop_id', P), 'cx')).length === 0);
  T.ok('o tosador não lê as taxas', (B.must(await tos.from('taxas_maquininha').select('petshop_id').eq('petshop_id', P), 'tos')).length === 0);
  T.ok('a recepção sabe só que a loja pergunta as parcelas (sem valor)', (await MQ.lojaPerguntaParcelas(cx, P)) === true);

  T.secao('a taxa de cada pagamento, guardada na hora (conferida à mão)');
  const deb = await lancar(cx, 100, 'debito');
  T.ok('débito R$ 100,00 × 2% = R$ 2,00', taxaDe(deb.id) === '2.00');
  const cred = await lancar(dono, 150, 'credito');
  T.ok('crédito R$ 150,00 × 4% + R$ 0,50 = R$ 6,50', taxaDe(cred.id) === '6.50');
  // dividido: Pix 50 (0,99% = 0,495 → 0,50), crédito 100 (4,00 + 0,50), dinheiro 50 (sem taxa) = 5,00
  const div = await lancar(cx, 200, 'credito', { pagamentos: [{ forma: 'pix', valor: 50 }, { forma: 'credito', valor: 100 }, { forma: 'dinheiro', valor: 50 }] });
  T.ok('dividido R$ 200,00 (Pix 50, crédito 100, dinheiro 50) = 0,50 + 4,50 = R$ 5,00', taxaDe(div.id) === '5.00', B.sql(`select partes from lancamentos_taxas where lancamento_id='${div.id}'`));
  T.ok('… o que foi no cartão ou Pix: R$ 150,00', B.num(`select cartao from lancamentos_taxas where lancamento_id='${div.id}'`) === 150);
  const din = await lancar(cx, 80, 'dinheiro');
  T.ok('dinheiro: sem taxa (nada guardado)', taxaDe(din.id) === 'sem');
  const p3 = await lancar(cx, 300, 'credito');
  T.ok('crédito R$ 300,00 antes de dizer as parcelas: à vista (12,00 + 0,50 = 12,50)', taxaDe(p3.id) === '12.50');
  T.ok('a recepção anota 3x na venda dela', (await MQ.anotarParcelas(cx, P, [p3.id], 3)) === 1);
  T.ok('crédito 3x R$ 300,00: 7,5% da parcela 3 + 0,50 = R$ 23,00', taxaDe(p3.id) === '23.00');
  const p2 = await lancar(dono, 100, 'credito');
  await MQ.anotarParcelas(dono, P, [p2.id], 2);
  T.ok('crédito 2x R$ 100,00: a do parcelado (6%) + 0,50 = R$ 6,50', taxaDe(p2.id) === '6.50');
  T.ok('a recepção não anota parcelas na venda do dono', (await MQ.anotarParcelas(cx, P, [cred.id], 4)) === 0 && taxaDe(cred.id) === '6.50');
  T.recusa('o tosador não anota parcelas', await tos.rpc('maquininha_parcelas', { p: P, p_ids: [p3.id], p_parcelas: 2 }));
  T.ok('parcelas em venda no débito não mudam nada', (await MQ.anotarParcelas(cx, P, [deb.id], 3)) === 0 && taxaDe(deb.id) === '2.00');

  T.secao('a conta da tela é a mesma do banco (maquininha.ts)');
  const t = lidas;
  const casos = [
    [deb, { valor: 100, forma: 'debito' }], [cred, { valor: 150, forma: 'credito' }],
    [div, { valor: 200, forma: 'credito', pagamentos: [{ forma: 'pix', valor: 50 }, { forma: 'credito', valor: 100 }, { forma: 'dinheiro', valor: 50 }] }],
    [p3, { valor: 300, forma: 'credito', parcelas: 3 }], [p2, { valor: 100, forma: 'credito', parcelas: 2 }],
  ];
  T.ok('calcularTaxa = taxa guardada nos 5 pagamentos', casos.every(([l, p]) => c(MQ.calcularTaxa(t, p).taxa) === c(taxaDe(l.id))), casos.map(([l, p]) => [MQ.calcularTaxa(t, p).taxa, taxaDe(l.id)]));
  T.ok('"Você recebe": R$ 200,00 dividido → R$ 195,00', MQ.calcularTaxa(t, casos[2][1]).recebe === 195);

  T.secao('mudar as taxas não muda o que já foi pago');
  await MQ.salvarTaxas(dono, P, { ...t, debito_pct: 3, credito_pct: 5 });
  T.ok('o débito de antes continua R$ 2,00 e o crédito R$ 6,50', taxaDe(deb.id) === '2.00' && taxaDe(cred.id) === '6.50');
  const deb2 = await lancar(cx, 100, 'debito');
  T.ok('um débito novo de R$ 100,00 já paga 3% = R$ 3,00', taxaDe(deb2.id) === '3.00');
  // o dono corrige o valor do crédito de antes (150 → 200): a regra daquele dia (4% + 0,50), não a nova (5%)
  B.must(await dono.from('lancamentos').update({ valor: 200 }).eq('id', cred.id).select('id'), 'corrigir o valor');
  T.ok('valor corrigido para R$ 200,00: refeito com a regra do dia do pagamento (8,00 + 0,50 = R$ 8,50)', taxaDe(cred.id) === '8.50');
  B.must(await dono.from('lancamentos').update({ forma: 'dinheiro' }).eq('id', din.id).select('id'), 'continua dinheiro');
  T.ok('uma correção que não envolve cartão não cria taxa', taxaDe(din.id) === 'sem');

  T.secao('quem lê as taxas guardadas');
  T.ok('a recepção não lê nenhuma taxa guardada', (B.must(await cx.from('lancamentos_taxas').select('lancamento_id').eq('petshop_id', P), 'cx')).length === 0);
  T.ok('o tosador também não', (B.must(await tos.from('lancamentos_taxas').select('lancamento_id').eq('petshop_id', P), 'tos')).length === 0);
  T.ok('o dono lê as 6 (sem a de antes das taxas e sem o dinheiro)', (B.must(await dono.from('lancamentos_taxas').select('lancamento_id').eq('petshop_id', P), 'dono')).length === 6);
  const lcx = B.must(await cx.from('lancamentos').select('*').eq('id', deb.id).single(), 'recepção lê o lançamento');
  T.ok('a recepção lê o lançamento dela sem nenhum campo de taxa', !Object.keys(lcx).some((k) => /taxa/.test(k)), Object.keys(lcx));
  T.recusa('a recepção não lê taxas_do_periodo', await cx.rpc('taxas_do_periodo', { p: P, p_de: L.mes1, p_ate: fim }));
  T.recusa('ninguém grava direto na tabela das taxas guardadas', await dono.from('lancamentos_taxas').insert({ lancamento_id: din.id, petshop_id: P, regra: {}, taxa: 1 }).select('lancamento_id'));
  const upd = await dono.from('lancamentos_taxas').update({ taxa: 0 }).eq('lancamento_id', deb.id).select('lancamento_id');
  T.ok('nem muda uma taxa guardada', !!upd.error || !upd.data?.length, upd.error?.message ?? upd.data);

  T.secao('caixa fechado');
  const caixaId = B.sql(`select id from caixas where petshop_id='${P}' and fechado_em is null`);
  B.sql(`update caixas set fechado_em = now(), valor_contado = 0 where id='${caixaId}'`);
  T.ok('com o caixa fechado, as parcelas não mudam (nem pelo dono)', (await MQ.anotarParcelas(dono, P, [p2.id], 5)) === 0 && taxaDe(p2.id) === '6.50');
  T.ok('as taxas guardadas continuam lá', taxaDe(p3.id) === '23.00' && taxaDe(div.id) === '5.00');
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 0 }).select('id'), 'caixa novo');

  T.secao('no período e em Quanto sobrou');
  // taxas do mês: 2,00 + 8,50 + 5,00 + 23,00 + 6,50 + 3,00 = 48,00
  const tp = await MQ.taxasDoPeriodo(dono, P, L.mes1, fim);
  T.ok('taxas do mês = R$ 48,00 (6 pagamentos com taxa)', tp && c(tp.taxa) === 4800 && tp.lancamentos === 6, tp);
  const debF = tp.por_forma.find((x) => x.forma === 'debito'), pixF = tp.por_forma.find((x) => x.forma === 'pix');
  T.ok('por forma: débito R$ 200,00 com R$ 5,00 de taxa; Pix R$ 50,00 com R$ 0,50', debF && c(debF.valor) === 20000 && c(debF.taxa) === 500 && pixF && c(pixF.taxa) === 50, tp.por_forma);
  // a receber: crédito à vista 200 − 8,50 = 191,50; parte crédito do dividido 100 − 4,50 = 95,50; 3x 300 − 23 = 277; 2x 100 − 6,50 = 93,50 → dia +30 = 657,50;
  // débito 100 − 2 + 100 − 3 = 195,00 no dia +1; o Pix (0 dias) já caiu
  const ar30 = tp.a_receber.find((x) => x.dia === L.dia(30)), ar1 = tp.a_receber.find((x) => x.dia === L.dia(1));
  T.ok('a receber da maquininha: R$ 195,00 amanhã (débito) e R$ 657,50 em 30 dias (crédito, já sem a taxa)', ar1 && c(ar1.valor) === 19500 && ar30 && c(ar30.valor) === 65750 && tp.a_receber.length === 2, tp.a_receber);
  B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'saida', valor: 40, forma: 'pix', categoria: 'Aluguel', data: L.hoje, pago: true, origem: 'tela' }).select('id'), 'uma saída');
  const lu = B.must(await dono.rpc('lucro_do_periodo', { p_petshop: P, p_de: L.mes1, p_ate: fim }), 'lucro_do_periodo');
  const entrou = B.num(`select coalesce(sum(valor), 0) from lancamentos where petshop_id='${P}' and tipo='entrada' and pago and movimento is null and data between '${L.mes1}' and '${fim}'`);
  const fat = F.faturamentoLiquido(entrou, await F.ajustesDoFaturamento(dono, P, L.mes1, fim));
  // entrou: 100 + 100 + 200 + 200 + 80 + 300 + 100 + 100 = 1.180,00; resultado 1.180 − 40 = 1.140,00; depois das taxas 1.092,00
  T.ok('Quanto sobrou: faturamento R$ 1.180,00 = Financeiro; resultado R$ 1.140,00 (a taxa não muda o resultado)', c(lu.faturamento) === c(fat) && c(fat) === 118000 && c(lu.resultado) === 114000, lu);
  T.ok('Quanto sobrou: taxas da maquininha R$ 48,00 e "depois das taxas" R$ 1.092,00', c(lu.taxas_maquininha) === 4800 && c(lu.resultado_depois_taxas) === 109200, { t: lu.taxas_maquininha, d: lu.resultado_depois_taxas });
  const mont = lib('lucro').montarLucro(lu);
  T.ok('montarLucro: a ponte traz a taxa e o resultado depois dela', mont.ponte.taxas === 48 && mont.ponte.resultadoDepoisDasTaxas === 1092, mont.ponte);

  T.secao('outra loja e anônimo');
  const L2 = await criarLoja(T, { nome: 'Outra', equipe: false });
  const o = L2.sb.dono;
  T.ok('a outra loja não lê as taxas desta', (B.must(await o.from('taxas_maquininha').select('petshop_id').eq('petshop_id', P), 'o')).length === 0
    && (B.must(await o.from('lancamentos_taxas').select('lancamento_id').eq('petshop_id', P), 'o2')).length === 0);
  T.recusa('nem pelo taxas_do_periodo', await o.rpc('taxas_do_periodo', { p: P, p_de: L.mes1, p_ate: fim }));
  T.recusa('nem grava taxas para esta loja', await o.from('taxas_maquininha').upsert({ petshop_id: P, ...regra }).select('petshop_id'));
  T.ok('nem anota parcelas aqui (recusado)', !!(await o.rpc('maquininha_parcelas', { p: P, p_ids: [p3.id], p_parcelas: 2 })).error && taxaDe(p3.id) === '23.00');
  B.must(await o.from('caixas').insert({ petshop_id: L2.P, valor_inicial: 0 }).select('id'), 'caixa da outra');
  const daOutra = await D.lancarPago(o, L2.P, { tipo: 'entrada', valor: 100, forma: 'debito', categoria: 'Outros', chave: D.novaChaveDeOperacao() });
  T.ok('a venda da outra loja não usa as taxas desta (sem taxas: nada guardado)', taxaDe(daOutra.id) === 'sem');
  const anon = B.cliente();
  const an1 = await anon.from('taxas_maquininha').select('petshop_id');
  const an2 = await anon.from('lancamentos_taxas').select('lancamento_id');
  T.ok('anônimo não lê as taxas nem as guardadas', (!!an1.error || !an1.data.length) && (!!an2.error || !an2.data.length), [an1.error?.message, an2.error?.message]);
  T.recusa('anônimo não chama taxas_do_periodo', await anon.rpc('taxas_do_periodo', { p: P, p_de: L.mes1, p_ate: fim }));
  T.recusa('anônimo não chama indicadores_do_periodo', await anon.rpc('indicadores_do_periodo', { p: P, p_de: L.mes1, p_ate: fim }));
  T.recusa('anônimo não anota parcelas', await anon.rpc('maquininha_parcelas', { p: P, p_ids: [p3.id], p_parcelas: 2 }));
  T.ok('funções internas fechadas (taxa_calcular, taxa_do_lancamento)', !!(await dono.rpc('taxa_calcular', { p_regra: {}, p_valor: 1, p_forma: 'pix', p_pagamentos: null, p_parcelas: 1, p_data: L.hoje })).error
    && !!(await dono.rpc('taxa_do_lancamento', { p_id: deb.id })).error);

  T.secao('Indicadores: visitas e agenda');
  // histórico: Thor (Ana) concluído 20 dias atrás e hoje (voltou em 60 dias); Rex (Davi) hoje pela primeira vez;
  // Bob faltou hoje; Luna cancelada hoje; Mel marcada hoje (ainda não concluída). Uma conta paga no mês passado.
  const marca = (pet, dia, h, status) => {
    const ini = B.instante(dia, h, L.fuso);
    return B.sql(`insert into agendamentos (petshop_id, pet_id, servico_id, inicio, fim, status, preco) values ('${P}', '${L.pets[pet]}', '${L.S.Banho}', '${ini.toISOString()}', '${new Date(+ini + 45 * 6e4).toISOString()}', '${status}', 60) returning id`).split('\n')[0];
  };
  const diaAntes = L.dia(-20);
  marca('Thor', diaAntes, '09:00', 'concluido');
  marca('Thor', L.hoje, '09:00', 'concluido');
  marca('Rex', L.hoje, '10:00', 'concluido');
  marca('Bob', L.hoje, '11:00', 'faltou');
  marca('Luna', L.hoje, '11:00', 'cancelado');
  marca('Mel', L.hoje, '15:00', 'marcado');
  const mesPassado = L.mesAnterior;
  B.sql(`insert into lancamentos (petshop_id, tipo, valor, forma, categoria, data, pago, origem) values ('${P}', 'entrada', 250, 'pix', 'Banho e tosa', '${B.somaDias(mesPassado, 9)}', true, 'tela')`);
  const de3 = B.sql(`select to_char((date '${L.mes1}' - interval '2 months')::date, 'YYYY-MM-DD')`);
  const ind = await IN.carregarIndicadores(dono, P, de3, fim);
  T.ok('três meses, do mais antigo ao atual', ind.meses.length === 3 && ind.meses[2].mes === L.hoje.slice(0, 7) && ind.dinheiro === true, ind.meses.map((m) => m.mes));
  let iguais = true;
  const conf = [];
  for (const m of ind.meses) {
    const x = B.must(await dono.rpc('lucro_do_periodo', { p_petshop: P, p_de: m.de, p_ate: m.ate }), 'lucro ' + m.mes);
    conf.push([m.mes, m.faturamento, x.faturamento, m.resultado, x.resultado, m.taxas, x.taxas_maquininha]);
    if (c(m.faturamento) !== c(x.faturamento) || c(m.resultado) !== c(x.resultado) || c(m.taxas) !== c(x.taxas_maquininha) || c(m.resultado_depois_taxas) !== c(x.resultado_depois_taxas)) iguais = false;
  }
  T.ok('cada mês: faturamento, resultado e taxas = lucro_do_periodo do mesmo mês', iguais, conf);
  const atual = ind.meses[2];
  T.ok('mês atual: faturamento = faturamento.ts (R$ 1.180,00)', c(atual.faturamento) === c(fat), atual);
  const doDiaAntes = diaAntes.slice(0, 7) === L.hoje.slice(0, 7);
  T.ok('mês passado: R$ 250,00 da conta paga lá', c(ind.meses[1].faturamento) === 25000, ind.meses[1]);
  const tot = IN.totaisIndicadores(ind);
  T.ok('atendimentos concluídos no período: 3 (Thor 2 vezes, Rex 1)', tot.atendimentos === 3, tot);
  T.ok('faltas 1 de 4 (25%); cancelados 1 de 6 marcados', tot.faltas === 1 && tot.pctFaltas === 25 && tot.cancelados === 1 && tot.marcados === 6 && Math.abs(tot.pctCancelados - 100 / 6) < 1e-9, tot);
  T.ok('mês atual: atendimentos ' + (doDiaAntes ? '3' : '2'), atual.atendimentos === (doDiaAntes ? 3 : 2), atual);
  T.ok('clientes atendidos no período: Ana e Davi; primeira vez: os dois (a primeira visita da vida é deste período)', ind.clientes === 2 && ind.primeira_vez === 2, { c: ind.clientes, p: ind.primeira_vez });
  T.ok('retorno em 60 dias: 1 de 2 (Ana voltou em 20 dias; Davi veio uma vez)', ind.retorno_60.clientes === 2 && ind.retorno_60.voltaram === 1 && tot.retorno === 50, ind.retorno_60);
  T.ok('mês atual: Ana voltou (já tinha vindo); Davi é primeira vez', doDiaAntes ? (atual.clientes === 2 && atual.primeira_vez === 2) : (atual.clientes === 2 && atual.primeira_vez === 1 && atual.voltaram === 1), atual);
  T.ok('mapa de dia e hora soma o que foi marcado sem os cancelados (5)', ind.mapa.reduce((s, x) => s + x.n, 0) === 5, ind.mapa);
  const banho = ind.servicos.find((s) => s.nome === 'Banho');
  T.ok('serviço mais feito: Banho, 3 vezes', ind.servicos[0] === banho && banho.vezes === 3, ind.servicos);
  T.ok('valor médio do mês = faturamento ÷ contas pagas', atual.contas > 0 && c(atual.valor_medio) === c(Math.round((atual.faturamento / atual.contas) * 100) / 100), atual);
  const vendas = B.must(await dono.rpc('lucro_do_periodo', { p_petshop: P, p_de: de3, p_ate: fim }), 'lucro período');
  T.ok('resultado do período inteiro = lucro_do_periodo do período', c(tot.resultado) === c(vendas.resultado) && c(tot.taxas) === c(vendas.taxas_maquininha), { tot: tot.resultado, lu: vendas.resultado });

  T.secao('Indicadores: quem vê');
  T.recusa('a recepção não vê os indicadores (sem Relatórios)', await cx.rpc('indicadores_do_periodo', { p: P, p_de: L.mes1, p_ate: fim }));
  T.recusa('o tosador não vê', await tos.rpc('indicadores_do_periodo', { p: P, p_de: L.mes1, p_ate: fim }));
  T.recusa('a outra loja não vê', await o.rpc('indicadores_do_periodo', { p: P, p_de: L.mes1, p_ate: fim }));
  T.recusa('período de mais de um ano é recusado', await dono.rpc('indicadores_do_periodo', { p: P, p_de: B.somaDias(L.hoje, -400), p_ate: L.hoje }));
  // a outra loja no mês passado: nenhum movimento
  const vazio = await IN.carregarIndicadores(o, L2.P, L2.mesAnterior, B.somaDias(L2.mes1, -1));
  T.ok('loja sem movimento: "sem dados" (nada inventado)', !IN.temDados(vazio) && vazio.meses.length === 1 && vazio.meses[0].faturamento === 0, vazio.meses);
  T.ok('comparação só com número de verdade: antes zero → nada', IN.comparacao(100, 0) === null && IN.comparacao(112, 100).texto === '+12% que o período anterior', IN.comparacao(112, 100));
}))();
