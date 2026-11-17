// Contas fixas (migração 20261212: contas_fixas, contas_fixas_puladas, lancamentos.conta_fixa_id/competencia/valor_estimado,
// contas_fixas_gerar, _salvar, _apagar, _valor, _resumo, _do_periodo, gestao_bom_dia e gestao_faxina_banco com as contas fixas):
// - a conta do mês entra em A pagar 10 dias antes do vencimento, uma vez só (chamar duas vezes não repete), dia 31 em fevereiro
//   vence no último dia, trimestral e anual nos meses certos, nada antes do começo nem depois do fim, pausada não gera,
//   a conta excluída de A pagar não volta;
// - "valor varia": entra com o valor estimado e a marca, que sai quando alguém escreve o valor (e a mudança depois de paga
//   fica em lancamentos_alteracoes, a regra de sempre); "a luz deste mês veio R$ 410" (contas_fixas_valor e o Mozart);
// - quem vê e mexe: dono e quem cuida do financeiro; recepção (caixa, sem financeiro), tosador, outra loja e anônimo não;
// - Bom dia: "Aluguel vence amanhã (R$ 2.500,00)" e a vencida, só para quem cuida do financeiro;
// - "Quanto custa manter": a conta à mão (2.500 + 380 + 1.200 ÷ 12 + 600 ÷ 3 = 3.180; faturou 795 = 25%);
// - relatórios: lucro_do_periodo e indicadores_do_periodo somam o mesmo de antes; contas_fixas_do_periodo só separa.
// As datas de 2030 em diante não dependem de hoje: o teste chama contas_fixas_gerar_interno(p, dia) direto no banco.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('contas-fixas');
const CF = lib('contas-fixas'), BD = lib('bom-dia');
const MZ = lib('assistente/ferramenta-contas-fixas');

const LONGE = '2030-01-01';
const gerarEm = (P, dia) => B.num(`select public.contas_fixas_gerar_interno('${P}', '${dia}')`);
const meses = (id) => B.sql(`select coalesce(string_agg(to_char(competencia, 'YYYY-MM') || '=' || to_char(vencimento, 'YYYY-MM-DD'), ',' order by competencia), '') from lancamentos where conta_fixa_id='${id}'`);
const quantas = (id) => B.num(`select count(*) from lancamentos where conta_fixa_id='${id}'`);

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Contas fixas' });
  const O = await criarLoja(T, { nome: 'Contas fixas outra', equipe: false, dados: false });
  const { dono, caixa: cx, tosador: tos, estoque: fin } = L.sb;
  const P = L.P;
  // Edu passa a cuidar também do financeiro (área Financeiro, vê o dinheiro)
  B.sql(`update profissionais set acessos = array['estoque','financeiro'], ve_financeiro = true where id='${L.ids.estoque}'`);
  const salvar = (sb, conta, p = P) => sb.rpc('contas_fixas_salvar', { p, p_conta: conta });
  // cada parte liga só as contas fixas dela (as de 2030 em diante): a geração de um dia não mexe nas contas das outras partes
  const so = (ids) => B.sql(`update contas_fixas set ativa = (id = any ('{${ids.join(',')}}'::uuid[])) where petshop_id='${P}' and comeca_em >= '${LONGE}'`);
  const nova = async (sb, conta) => B.must(await salvar(sb, { id: B.uuid(), comeca_em: LONGE, ...conta }), 'salvar ' + conta.nome).id;

  T.secao('cadastrar: dono e quem cuida do financeiro');
  const aluguelId = B.uuid();
  const r1 = await salvar(dono, { id: aluguelId, nome: 'Aluguel', categoria: 'Aluguel', dia: 5, valor: 2500, frequencia: 'mensal', comeca_em: LONGE, forma: 'Boleto' });
  T.passa('o dono cadastra o aluguel', r1, r1.data?.id === aluguelId);
  const r2 = await salvar(dono, { id: aluguelId, nome: 'Aluguel', categoria: 'Aluguel', dia: 5, valor: 2500, frequencia: 'mensal', comeca_em: LONGE, forma: 'Boleto' });
  T.ok('o mesmo pedido de novo (toque duplo): continua uma conta só', !r2.error && B.num(`select count(*) from contas_fixas where petshop_id='${P}' and nome='Aluguel'`) === 1);
  const luzId = await nova(fin, { nome: 'Luz', categoria: 'Água, luz e internet', dia: 10, valor: 350, valor_varia: true });
  T.ok('quem cuida do financeiro cadastra a luz (valor varia)', B.sql(`select valor_varia || '|' || valor from contas_fixas where id='${luzId}'`) === 'true|350.00');
  T.ok('quem cuida do financeiro lê as contas fixas', (B.must(await fin.from('contas_fixas').select('id').eq('petshop_id', P), 'fin lê')).length === 2);
  T.recusa('sem nome: recusa com a frase', await salvar(dono, { nome: ' ', dia: 5, valor: 10 }), /nome da conta/);
  T.recusa('dia 32: recusa', await salvar(dono, { nome: 'X', dia: 32, valor: 10 }), /de 1 a 31/);
  T.recusa('valor zero: recusa', await salvar(dono, { nome: 'X', dia: 3, valor: 0 }), /valor/);
  T.recusa('fim antes do começo: recusa', await salvar(dono, { nome: 'X', dia: 3, valor: 10, comeca_em: '2030-05-01', termina_em: '2030-04-01' }), /fim/);

  T.secao('quem não pode: recepção sem financeiro, tosador, outra loja, anônimo');
  T.recusa('a recepção (caixa, sem financeiro) não cadastra', await salvar(cx, { nome: 'Água', dia: 8, valor: 90 }), /financeiro/);
  T.ok('a recepção não lê nenhuma conta fixa', (B.must(await cx.from('contas_fixas').select('id').eq('petshop_id', P), 'cx')).length === 0);
  T.recusa('a recepção não vê o resumo', await cx.rpc('contas_fixas_resumo', { p: P }));
  T.recusa('a recepção não vê as contas fixas do período', await cx.rpc('contas_fixas_do_periodo', { p: P, p_de: L.mes1, p_ate: L.hoje }));
  T.recusa('a recepção não muda o valor do mês', await cx.rpc('contas_fixas_valor', { p: P, p_conta: luzId, p_mes: '2030-01-01', p_valor: 1 }));
  T.recusa('a recepção não apaga', await cx.rpc('contas_fixas_apagar', { p: P, p_id: luzId }));
  T.ok('para a recepção, gerar não faz nada (0)', B.must(await cx.rpc('contas_fixas_gerar', { p: P }), 'cx gerar') === 0);
  T.recusa('o tosador não cadastra', await salvar(tos, { nome: 'Água', dia: 8, valor: 90 }));
  T.ok('o tosador não lê', (B.must(await tos.from('contas_fixas').select('id').eq('petshop_id', P), 'tos')).length === 0);
  T.recusa('o tosador não grava direto na tabela', await tos.from('contas_fixas').insert({ petshop_id: P, nome: 'Água', dia: 8, valor: 90 }).select('id'));
  T.recusa('nem o dono grava direto na tabela (só pelas funções)', await dono.from('contas_fixas').insert({ petshop_id: P, nome: 'Água', dia: 8, valor: 90 }).select('id'));
  const upd = await dono.from('contas_fixas').update({ valor: 1 }).eq('id', luzId).select('id');
  T.ok('nem muda direto', !!upd.error || !upd.data?.length);
  T.ok('a outra loja não lê', (B.must(await O.sb.dono.from('contas_fixas').select('id').eq('petshop_id', P), 'outra')).length === 0);
  T.recusa('a outra loja não cadastra aqui', await salvar(O.sb.dono, { nome: 'Água', dia: 8, valor: 90 }));
  T.recusa('a outra loja não apaga a conta daqui', await O.sb.dono.rpc('contas_fixas_apagar', { p: P, p_id: luzId }));
  T.recusa('a outra loja não toma a conta daqui pelo id', await salvar(O.sb.dono, { id: luzId, nome: 'Luz', dia: 10, valor: 1 }, O.P), /não encontrada/);
  T.ok('… e a luz continua igual', B.sql(`select petshop_id || '|' || valor from contas_fixas where id='${luzId}'`) === `${P}|350.00`);
  const anon = B.cliente();
  const la = await anon.from('contas_fixas').select('id').eq('petshop_id', P);
  T.ok('anônimo não lê', !!la.error || !la.data?.length);
  T.recusa('anônimo não cadastra', await anon.rpc('contas_fixas_salvar', { p: P, p_conta: { nome: 'X', dia: 1, valor: 1 } }));
  T.recusa('anônimo não gera', await anon.rpc('contas_fixas_gerar', { p: P }));
  T.recusa('ninguém chama a geração de todas as lojas (só a faxina)', await dono.rpc('contas_fixas_gerar_todas'));
  T.recusa('nem a geração interna', await dono.rpc('contas_fixas_gerar_interno', { p: P, p_hoje: '2030-01-01' }));

  T.secao('a conta do mês: 10 dias antes, uma vez só');
  T.ok('a constante é a mesma no banco e no app (10 dias)', B.num('select public.contas_fixas_antecedencia()') === 10 && CF.ANTECEDENCIA_CONTAS_FIXAS === 10);
  so([aluguelId]);
  T.ok('em 20/12/2029 (16 dias antes do dia 5): nada ainda', gerarEm(P, '2029-12-20') === 0 && quantas(aluguelId) === 0);
  T.ok('em 26/12/2029 (10 dias antes): o aluguel de janeiro entra', gerarEm(P, '2029-12-26') === 1 && meses(aluguelId) === '2030-01=2030-01-05');
  T.ok('chamar de novo: não repete', gerarEm(P, '2029-12-26') === 0 && gerarEm(P, '2029-12-31') === 0 && quantas(aluguelId) === 1);
  const [g1, g2] = await Promise.all([dono.rpc('contas_fixas_gerar', { p: P }), fin.rpc('contas_fixas_gerar', { p: P })]);
  T.ok('duas telas abrindo ao mesmo tempo: nada repetido', !g1.error && !g2.error && quantas(aluguelId) === 1, [g1.error?.message, g2.error?.message]);
  const lanc = B.sql(`select tipo || '|' || valor || '|' || categoria || '|' || descricao || '|' || pago || '|' || origem || '|' || valor_estimado || '|' || data from lancamentos where conta_fixa_id='${aluguelId}'`);
  T.ok('a conta: saída de R$ 2.500,00, Aluguel, a pagar, do sistema, data = vencimento', lanc === 'saida|2500.00|Aluguel|Aluguel|false|sistema|false|2030-01-05', lanc);
  T.ok('quem cuida do financeiro vê a conta em A pagar', (B.must(await fin.from('lancamentos').select('id, conta_fixa_id, competencia').eq('petshop_id', P).eq('conta_fixa_id', aluguelId), 'fin')).length === 1);
  T.ok('a recepção não vê a conta a pagar', (B.must(await cx.from('lancamentos').select('id').eq('petshop_id', P).eq('conta_fixa_id', aluguelId), 'cx')).length === 0);
  T.recusa('ninguém liga um lançamento a uma conta fixa pela API', await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'saida', valor: 10, categoria: 'Outros', pago: false, vencimento: L.hoje, data: L.hoje, conta_fixa_id: aluguelId, competencia: '2030-02-01' }).select('id'), /contas fixas/i);
  T.recusa('nem desliga', await dono.from('lancamentos').update({ conta_fixa_id: null }).eq('conta_fixa_id', aluguelId).select('id'), /conta fixa/i);

  T.secao('dia 31 em mês mais curto');
  const netId = await nova(dono, { nome: 'Internet', categoria: 'Água, luz e internet', dia: 31, valor: 120 });
  so([netId]);
  gerarEm(P, '2030-02-20');
  T.ok('dia 31: janeiro em 31/01 e fevereiro em 28/02', meses(netId) === '2030-01=2030-01-31,2030-02=2030-02-28', meses(netId));
  T.ok('fevereiro de ano bissexto: 29/02; abril: 30/04 (banco e app)', B.sql(`select public.contas_fixas_vencimento('2032-02-01', 31) || '|' || public.contas_fixas_vencimento('2030-04-01', 31)`) === '2032-02-29|2030-04-30'
    && CF.vencimentoNoMes('2032-02-01', 31) === '2032-02-29' && CF.vencimentoNoMes('2030-04-01', 31) === '2030-04-30' && CF.vencimentoNoMes('2030-02-01', 31) === '2030-02-28');

  T.secao('trimestral, semestral e anual');
  const contId = await nova(dono, { nome: 'Contador', categoria: 'Impostos e taxas', dia: 10, valor: 600, frequencia: 'trimestral', mes_inicial: 2 });
  const iptuId = await nova(dono, { nome: 'IPTU', categoria: 'Impostos e taxas', dia: 15, valor: 1200, frequencia: 'anual', mes_inicial: 3 });
  const semId = await nova(dono, { nome: 'Dedetização', categoria: 'Manutenção', dia: 20, valor: 300, frequencia: 'semestral', mes_inicial: 4 });
  so([contId, iptuId, semId]);
  gerarEm(P, '2030-12-31');
  T.ok('trimestral desde fevereiro: fev, mai, ago e nov', meses(contId) === '2030-02=2030-02-10,2030-05=2030-05-10,2030-08=2030-08-10,2030-11=2030-11-10', meses(contId));
  T.ok('semestral desde abril: abr e out', meses(semId) === '2030-04=2030-04-20,2030-10=2030-10-20', meses(semId));
  T.ok('anual em março: só 15/03/2030 até o fim do ano', meses(iptuId) === '2030-03=2030-03-15', meses(iptuId));
  gerarEm(P, '2031-03-05');
  T.ok('… e em 05/03/2031 (10 dias antes) entra o de 2031', meses(iptuId) === '2030-03=2030-03-15,2031-03=2031-03-15', meses(iptuId));
  T.ok('o app escreve quando vence (jan, abr, jul e out; dia 15 de março)', CF.quandoVence({ frequencia: 'trimestral', mes_inicial: 1, dia: 10 }) === 'dia 10 de jan, abr, jul e out'
    && CF.quandoVence({ frequencia: 'anual', mes_inicial: 3, dia: 15 }) === 'dia 15 de março' && CF.quandoVence({ frequencia: 'mensal', mes_inicial: 1, dia: 5 }) === 'todo dia 5');

  T.secao('começo, fim e o mês do cadastro');
  const sisId = await nova(dono, { nome: 'Sistema', categoria: 'Outros', dia: 1, valor: 89.9, comeca_em: '2030-03-15', termina_em: '2030-06-30' });
  so([sisId]);
  gerarEm(P, '2030-08-20');
  T.ok('começa 15/03 e termina 30/06 (dia 1): só abril, maio e junho', meses(sisId) === '2030-04=2030-04-01,2030-05=2030-05-01,2030-06=2030-06-01', meses(sisId));
  const aguaId = await nova(dono, { nome: 'Água', categoria: 'Água, luz e internet', dia: 20, valor: 90 });
  B.sql(`update contas_fixas set criado_em = '2030-05-10 12:00-03' where id='${aguaId}'`);
  so([aguaId]);
  gerarEm(P, '2030-07-01');
  T.ok('cadastrada em maio, começando em janeiro: nada de antes de maio (maio e junho)', meses(aguaId) === '2030-05=2030-05-20,2030-06=2030-06-20', meses(aguaId));

  T.secao('pausar, apagar e a conta excluída de A pagar');
  so([]);
  B.must(await salvar(dono, { id: netId, nome: 'Internet', categoria: 'Água, luz e internet', dia: 31, valor: 120, ativa: false }), 'pausar');
  T.ok('pausada: o que já estava fica, nada novo entra', gerarEm(P, '2030-05-25') >= 0 && meses(netId) === '2030-01=2030-01-31,2030-02=2030-02-28', meses(netId));
  B.must(await salvar(dono, { id: netId, nome: 'Internet', categoria: 'Água, luz e internet', dia: 31, valor: 130, ativa: true }), 'voltar');
  gerarEm(P, '2030-03-25');
  T.ok('ligada de novo (R$ 130): março entra com o valor novo; janeiro e fevereiro ficam como estavam', meses(netId).endsWith('2030-03=2030-03-31')
    && B.num(`select valor from lancamentos where conta_fixa_id='${netId}' and competencia='2030-03-01'`) === 130 && B.num(`select valor from lancamentos where conta_fixa_id='${netId}' and competencia='2030-01-01'`) === 120);
  const del = await dono.from('lancamentos').delete().eq('conta_fixa_id', aluguelId).eq('competencia', '2030-01-01').select('id');
  T.passa('o dono exclui o aluguel de janeiro de A pagar', del, del.data?.length === 1);
  so([aluguelId]);
  T.ok('… o mês fica guardado como excluído', B.num(`select count(*) from contas_fixas_puladas where conta_fixa_id='${aluguelId}' and competencia='2030-01-01'`) === 1);
  gerarEm(P, '2030-01-04');
  T.ok('… e não volta a ser criado (fevereiro ainda não é hora)', quantas(aluguelId) === 0);
  gerarEm(P, '2030-01-26');
  T.ok('… fevereiro entra normalmente', meses(aluguelId) === '2030-02=2030-02-05', meses(aluguelId));
  T.recusa('"o aluguel de janeiro veio R$ 2.600": recusa, foi excluído', await dono.rpc('contas_fixas_valor', { p: P, p_conta: aluguelId, p_mes: '2030-01-01', p_valor: 2600 }), /excluída/);
  const apaga = B.must(await dono.rpc('contas_fixas_apagar', { p: P, p_id: semId }), 'apagar');
  T.ok('apagar a conta fixa: as contas que ela já criou continuam em A pagar, como contas comuns', apaga === true && B.num(`select count(*) from lancamentos where petshop_id='${P}' and descricao='Dedetização' and conta_fixa_id is null and competencia is not null`) === 2
    && B.num(`select count(*) from contas_fixas where id='${semId}'`) === 0);

  T.secao('valor que varia: estimado, depois o certo');
  so([luzId]);
  gerarEm(P, '2030-01-01');
  const luzJan = B.sql(`select id from lancamentos where conta_fixa_id='${luzId}' and competencia='2030-01-01'`);
  T.ok('a luz de janeiro entra com R$ 350,00 e a marca de valor estimado', B.sql(`select valor || '|' || valor_estimado from lancamentos where id='${luzJan}'`) === '350.00|true');
  T.ok('a recepção não acha a conta', (B.must(await cx.from('lancamentos').select('id').eq('id', luzJan), 'cx')).length === 0);
  const tentaMarca = await dono.from('lancamentos').update({ valor_estimado: true }).eq('id', B.sql(`select id from lancamentos where conta_fixa_id='${aluguelId}' limit 1`)).select('valor_estimado').single();
  T.ok('ninguém põe a marca de estimado à mão', !tentaMarca.error && tentaMarca.data.valor_estimado === false, tentaMarca.error?.message);
  B.must(await fin.from('lancamentos').update({ valor: 380 }).eq('id', luzJan).select('id'), 'escrever o valor');
  T.ok('quem cuida do financeiro escreve R$ 380,00: a marca sai', B.sql(`select valor || '|' || valor_estimado from lancamentos where id='${luzJan}'`) === '380.00|false');
  B.must(await fin.from('lancamentos').update({ pago: true, data: '2030-01-10', forma: 'pix' }).eq('id', luzJan).select('id'), 'paguei');
  B.must(await dono.from('lancamentos').update({ valor: 385 }).eq('id', luzJan).select('id'), 'corrigir depois de paga');
  const alt = B.sql(`select acao || '|' || (antes->>'valor') || '|' || (depois->>'valor') from lancamentos_alteracoes where lancamento_id='${luzJan}' order by quando desc limit 1`);
  T.ok('mudar o valor depois de paga fica anotado (quem, antes e depois), a regra de sempre', alt === 'alterou|380.00|385.00', alt);
  const v = B.must(await fin.rpc('contas_fixas_valor', { p: P, p_conta: luzId, p_mes: '2030-02-14', p_valor: 410 }), 'luz de fevereiro');
  T.ok('"a luz de fevereiro veio R$ 410": a conta de fevereiro entra já com o valor certo', v.criada === true && v.vencimento === '2030-02-10'
    && B.sql(`select valor || '|' || valor_estimado from lancamentos where conta_fixa_id='${luzId}' and competencia='2030-02-01'`) === '410.00|false', v);
  gerarEm(P, '2030-02-05');
  T.ok('… e a geração não cria outra', B.num(`select count(*) from lancamentos where conta_fixa_id='${luzId}' and competencia='2030-02-01'`) === 1);
  const v2 = B.must(await dono.rpc('contas_fixas_valor', { p: P, p_conta: luzId, p_mes: '2030-02-01', p_valor: 412.5 }), 'de novo');
  T.ok('escrever de novo muda a mesma conta', v2.criada === false && Number(v2.antes) === 410 && B.num(`select valor from lancamentos where conta_fixa_id='${luzId}' and competencia='2030-02-01'`) === 412.5);
  T.recusa('conta já paga não muda por aqui', await dono.rpc('contas_fixas_valor', { p: P, p_conta: luzId, p_mes: '2030-01-01', p_valor: 999 }), /já foi paga/);
  T.secao('muito tempo sem abrir');
  const velhaId = await nova(dono, { nome: 'Seguro', categoria: 'Outros', dia: 7, valor: 50 });
  so([velhaId]);
  gerarEm(P, '2032-06-01');
  T.ok('sem abrir o sistema por muito tempo: volta no máximo 12 meses', meses(velhaId).split(',').length === 13 && meses(velhaId).startsWith('2031-06='), meses(velhaId));
  T.recusa('mês fora do trimestre: recusa', await dono.rpc('contas_fixas_valor', { p: P, p_conta: contId, p_mes: '2030-03-01', p_valor: 600 }), /não tem conta/);

  T.secao('Bom dia e tela Hoje: vence amanhã, venceu');
  const amanha = L.dia(1), anteontem = L.dia(-2);
  const aluguelReal = await nova(dono, { nome: 'Aluguel da loja', categoria: 'Aluguel', dia: Number(amanha.slice(8, 10)), valor: 2500, comeca_em: '2040-01-01' });
  const luzReal = await nova(dono, { nome: 'Luz da loja', categoria: 'Água, luz e internet', dia: Number(anteontem.slice(8, 10)), valor: 380, valor_varia: true, comeca_em: '2040-01-01' });
  // como se tivessem sido cadastradas há uma semana, valendo desde então
  B.sql(`update contas_fixas set comeca_em = '${L.dia(-7)}', criado_em = now() - interval '7 days' where id in ('${aluguelReal}', '${luzReal}')`);
  B.must(await dono.rpc('contas_fixas_gerar', { p: P }), 'gerar hoje');
  const bdDono = B.must(await dono.rpc('gestao_bom_dia', { p: P }), 'bom dia dono');
  const cfs = bdDono.contas_fixas ?? [];
  T.ok('o dono recebe as duas: a vencida e a de amanhã', cfs.length === 2 && cfs[0].nome === 'Luz da loja' && cfs[0].vencimento === anteontem && cfs[0].estimado === true
    && cfs[1].nome === 'Aluguel da loja' && cfs[1].vencimento === amanha && Number(cfs[1].valor) === 2500, cfs);
  const linhas = BD.linhasDoBomDia(bdDono, { horario: null, agora: new Date() });
  const lc = linhas.find((x) => x.id === 'contas')?.texto ?? '';
  const brl = (s) => s.replace(/[  ]/g, ' ');
  T.ok('a linha: "Contas fixas: Luz da loja venceu em dd/mm (R$ 380,00, valor estimado); Aluguel da loja vence amanhã (R$ 2.500,00)."',
    brl(lc) === `Contas fixas: Luz da loja venceu em ${anteontem.slice(8, 10)}/${anteontem.slice(5, 7)} (R$ 380,00, valor estimado); Aluguel da loja vence amanhã (R$ 2.500,00).`, lc);
  T.ok('uma conta só: "Aluguel vence amanhã (R$ 2.500,00)."', brl(CF.linhaDoBomDiaContas([{ nome: 'Aluguel', valor: 2500, vencimento: amanha, estimado: false }], L.hoje)) === 'Aluguel vence amanhã (R$ 2.500,00).');
  const bdFin = B.must(await fin.rpc('gestao_bom_dia', { p: P }), 'bom dia fin');
  T.ok('quem cuida do financeiro também recebe', (bdFin.contas_fixas ?? []).length === 2);
  const bdCx = B.must(await cx.rpc('gestao_bom_dia', { p: P }), 'bom dia cx');
  const bdTos = B.must(await tos.rpc('gestao_bom_dia', { p: P }), 'bom dia tos');
  T.ok('a recepção (caixa, sem financeiro) e o tosador não recebem as contas fixas', !('contas_fixas' in bdCx) && !('contas_fixas' in bdTos));
  T.ok('… nem a linha do cartão', !BD.linhasDoBomDia(bdCx, { horario: null }).some((x) => x.id === 'contas'));
  const avisos = await CF.lerAvisosContasFixas(dono, P, L.hoje);
  T.ok('Hoje: os mesmos dois avisos, a vencida primeiro', avisos.length === 2 && avisos[0].nome === 'Luz da loja' && avisos[1].nome === 'Aluguel da loja', avisos);
  T.ok('Hoje: a recepção não recebe aviso', (await CF.lerAvisosContasFixas(cx, P, L.hoje)).length === 0);

  T.secao('Quanto custa manter o pet shop (conta à mão)');
  // ativas valendo neste mês: Aluguel da loja 2.500 + Luz da loja 380 + IPTU 1.200 por ano (100 por mês) + Contador 600 a cada 3 meses (200)
  const iptuReal = await nova(dono, { nome: 'IPTU da loja', categoria: 'Impostos e taxas', dia: 28, valor: 1200, frequencia: 'anual', mes_inicial: 12, comeca_em: L.hoje });
  const contReal = await nova(dono, { nome: 'Contador da loja', categoria: 'Impostos e taxas', dia: 28, valor: 600, frequencia: 'trimestral', mes_inicial: 12, comeca_em: L.hoje });
  const pausada = await nova(dono, { nome: 'Academia', categoria: 'Outros', dia: 3, valor: 999, comeca_em: L.hoje, ativa: false });
  const acabou = await nova(dono, { nome: 'Antigo', categoria: 'Outros', dia: 3, valor: 777, comeca_em: L.dia(-60), termina_em: L.dia(-1) });
  B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 795, forma: 'pix', categoria: 'Banho e tosa', pago: true, data: L.hoje }).select('id'), 'entrada');
  const rs = B.must(await dono.rpc('contas_fixas_resumo', { p: P }), 'resumo');
  T.ok('total por mês: 2.500 + 380 + 1.200 ÷ 12 + 600 ÷ 3 = R$ 3.180,00 (sem a pausada, a que terminou e as que só começam em 2030)', Number(rs.total_mensal) === 3180, rs);
  T.ok('… 2 não mensais', rs.nao_mensais === 2 && rs.contas === 4, rs);
  const fat = Number(B.must(await dono.rpc('lucro_do_periodo', { p_petshop: P, p_de: L.mes1, p_ate: L.hoje }), 'lucro').faturamento);
  T.ok('faturamento do mês = o de lucro_do_periodo (R$ 795,00)', Number(rs.faturamento_mes) === fat && fat === 795, [rs.faturamento_mes, fat]);
  T.ok('795 de 3.180 = 25%; faltam R$ 2.385,00', rs.pct === 25 && Number(rs.falta) === 2385, rs);
  const lista = B.must(await dono.from('contas_fixas').select('valor, frequencia, ativa, comeca_em, termina_em').eq('petshop_id', P), 'lista');
  const fimMes = B.sql(`select to_char((date '${L.mes1}' + interval '1 month - 1 day')::date, 'YYYY-MM-DD')`);
  T.ok('a conta do app (totalPorMes) dá o mesmo', CF.totalPorMes(lista.filter((c) => c.comeca_em <= fimMes && (!c.termina_em || c.termina_em >= L.hoje))) === 3180);
  T.recusa('o tosador não vê o resumo', await tos.rpc('contas_fixas_resumo', { p: P }));
  void pausada; void acabou; void iptuReal; void contReal;

  T.secao('relatórios: os totais não mudam, só a separação');
  const luzAtrasada = B.sql(`select id from lancamentos where conta_fixa_id='${luzReal}' and vencimento='${anteontem}'`);
  B.must(await dono.from('lancamentos').update({ pago: true, data: L.hoje, forma: 'pix' }).eq('id', luzAtrasada).select('id'), 'paguei a luz');
  T.ok('Paguei na conta com valor estimado (R$ 380,00): a marca de estimado sai', B.sql(`select pago || '|' || valor_estimado from lancamentos where id='${luzAtrasada}'`) === 'true|false');
  B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'saida', valor: 100, forma: 'pix', categoria: 'Produtos e material', pago: true, data: L.hoje }).select('id'), 'saída comum');
  B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'saida', valor: 40, forma: 'pix', categoria: 'Devolução', pago: true, data: L.hoje }).select('id'), 'devolução');
  const fimDoMes = fimMes;
  const ler = async () => {
    const lu = B.must(await dono.rpc('lucro_do_periodo', { p_petshop: P, p_de: L.mes1, p_ate: fimDoMes }), 'lucro');
    const ind = B.must(await dono.rpc('indicadores_do_periodo', { p: P, p_de: L.mes1, p_ate: fimDoMes }), 'indicadores');
    return { saiu: Number(lu.saiu), resultado: Number(lu.resultado), faturamento: Number(lu.faturamento), saidas: lu.saidas, indSaiu: Number(ind.meses[0].saiu), indRes: Number(ind.meses[0].resultado) };
  };
  const com = await ler();
  // à mão: luz 380 + produtos 100 (a devolução fica fora das saídas)
  T.ok('Quanto sobrou: saiu R$ 480,00 (luz 380 + produtos 100); resultado 795 − 40 − 480 = R$ 275,00', com.saiu === 480 && com.resultado === 275, com);
  T.ok('Indicadores: o mesmo saiu e o mesmo resultado', com.indSaiu === 480 && com.indRes === 275, com);
  const sp = B.must(await dono.rpc('contas_fixas_do_periodo', { p: P, p_de: L.mes1, p_ate: fimDoMes }), 'do período');
  const somaOutras = sp.outras.reduce((s, o) => s + Number(o.valor), 0);
  T.ok('a separação: Contas fixas R$ 380,00 (Luz da loja) + outras R$ 100,00 = o mesmo saiu', Number(sp.total) === 380 && Number(sp.saiu) === com.saiu && Number(sp.total) + somaOutras === com.saiu
    && sp.contas.length === 1 && sp.contas[0].nome === 'Luz da loja' && sp.outras.length === 1 && sp.outras[0].categoria === 'Produtos e material', sp);
  T.ok('… por mês também (saiu 480, contas fixas 380)', sp.meses.length === 1 && Number(sp.meses[0].saiu) === com.indSaiu && Number(sp.meses[0].contas_fixas) === 380, sp.meses);
  // sem a ligação com a conta fixa (como se fosse uma conta comum), os totais são os mesmos
  B.sql(`update lancamentos set conta_fixa_id = null, competencia = null where id='${luzAtrasada}'`);
  const sem = await ler();
  B.sql(`update lancamentos set conta_fixa_id = '${luzReal}', competencia = date_trunc('month', vencimento)::date where id='${luzAtrasada}'`);
  T.ok('sem a ligação, Quanto sobrou e Indicadores dão exatamente o mesmo (saiu, resultado, faturamento, por categoria)',
    sem.saiu === com.saiu && sem.resultado === com.resultado && sem.faturamento === com.faturamento && sem.indSaiu === com.indSaiu && sem.indRes === com.indRes
    && JSON.stringify(sem.saidas) === JSON.stringify(com.saidas), [sem, com]);
  T.ok('lucro_do_periodo e indicadores_do_periodo não foram trocados (sem conta fixa dentro)', B.num(`select count(*) from pg_proc where proname in ('lucro_do_periodo', 'indicadores_do_periodo') and prosrc like '%conta_fixa%'`) === 0);
  T.recusa('o tosador não vê a separação', await tos.rpc('contas_fixas_do_periodo', { p: P, p_de: L.mes1, p_ate: fimDoMes }));
  T.ok('a outra loja não vê a separação daqui', !!(await O.sb.dono.rpc('contas_fixas_do_periodo', { p: P, p_de: L.mes1, p_ate: fimDoMes })).error);

  T.secao('Mozart: "quanto eu gasto por mês de conta fixa?" e "o aluguel deste mês veio R$ 2.610"');
  const erro = (m) => new Error(m);
  const ctx = (sb, fin2) => ({ sb, petshop: { id: P }, eu: {}, equipe: [], cuidoDoFinanceiro: fin2, vejoFinanceiro: true, fusoMin: -180, agora: `${L.hoje}T10:00` });
  const vc = await MZ.consultarContasFixas(ctx(dono, true), 'ver_contas_fixas', erro);
  // depois da devolução de R$ 40,00: faturou 755 de 3.180 = 23,7%, para baixo 23%
  T.ok('ver_contas_fixas: total por mês R$ 3.180,00, precisa faturar o mesmo; faturou R$ 755,00 (depois da devolução) = 23%', vc.resultado.total_por_mes === 3180 && vc.resultado.precisa_faturar_por_mes === 3180 && vc.resultado.faturamento_do_mes_ate_hoje === 755 && vc.resultado.pct_das_contas_fixas_ja_faturado === 23, vc.resultado);
  T.ok('… cada conta com quanto pesa por mês (IPTU da loja: R$ 100,00)', vc.resultado.contas.find((c) => c.nome === 'IPTU da loja')?.por_mes === 100);
  T.ok('… e as contas fixas em A pagar (o aluguel de amanhã)', vc.resultado.em_a_pagar.some((c) => c.nome === 'Aluguel da loja' && c.vencimento === amanha));
  let recusa = null; try { await MZ.consultarContasFixas(ctx(cx, false), 'ver_contas_fixas', erro); } catch (e) { recusa = e.message; }
  T.ok('quem não cuida do financeiro: o Mozart diz que é com o dono', /dono/.test(recusa ?? ''), recusa);
  T.ok('nome de outra ferramenta: não é desta lista', (await MZ.consultarContasFixas(ctx(dono, true), 'ver_caixa', erro)) === null);
  const mesAluguel = amanha.slice(0, 7);
  const card = await MZ.descreverContaFixa(ctx(dono, true), 'valor_conta_fixa', { conta_fixa_id: aluguelReal, valor: 2610, mes: mesAluguel }, erro);
  T.ok('o cartão mostra a conta, o mês, o valor novo e o de antes', card.titulo === 'Valor da conta fixa' && card.linhas.some(([k, v]) => k === 'Antes' && /2\.500,00/.test(v)) && card.linhas.some(([k, v]) => k === 'Valor' && /2\.610,00/.test(v)), card);
  const feito = await MZ.gravarContaFixa(ctx(dono, true), 'valor_conta_fixa', { conta_fixa_id: aluguelReal, valor: 2610, mes: mesAluguel }, erro);
  T.ok('depois do "Pode fazer": o aluguel do mês fica R$ 2.610,00', feito.feito && B.num(`select valor from lancamentos where conta_fixa_id='${aluguelReal}' and competencia='${mesAluguel}-01'`) === 2610, feito);
  let pago = null; try { await MZ.descreverContaFixa(ctx(dono, true), 'valor_conta_fixa', { conta_fixa_id: luzReal, valor: 1, mes: anteontem.slice(0, 7) }, erro); } catch (e) { pago = e.message; }
  T.ok('conta já paga: o Mozart não muda', /já foi paga/.test(pago ?? ''), pago);
  const F = lib('assistente/ferramentas');
  T.ok('as duas ferramentas estão na lista de quem recebe; valor_conta_fixa grava (com cartão), ver_contas_fixas não', F.ferramentasPara({ vejoFinanceiro: true }).some((t) => t.name === 'ver_contas_fixas')
    && F.definicao('valor_conta_fixa').grava === true && F.definicao('ver_contas_fixas').grava === false && !F.ferramentasPara({ vejoFinanceiro: false }).some((t) => t.name === 'ver_contas_fixas'));

  T.secao('faxina diária');
  T.ok('gestao_faxina_banco chama a geração das contas fixas', B.num(`select count(*) from pg_proc where proname = 'gestao_faxina_banco' and prosrc like '%contas_fixas_gerar_todas%'`) === 1);
  T.recusa('o dono não chama a faxina', await dono.rpc('gestao_faxina_banco'));
}))();
