// "Quanto sobrou" e "Por pessoa" (migração 20261193: lucro_do_periodo, equipe_do_periodo, servicos.custo_material,
// lancamentos.vendido_por), pelo mesmo código das telas (dinheiro.ts para lançar, lucro.ts para montar):
// - cada entrada repartida ao centavo: a soma das linhas + outros lançamentos = o "Entrou" do Financeiro; com as devoluções,
//   o crédito e as saídas, o resultado = o "Resultado do mês" do Financeiro (a mesma conta da tela);
// - a divisão de cada conta entre os serviços é a da comissão (conferida à mão), conta paga em partes conta cada parte,
//   a quantidade conta uma vez; a comissão das linhas soma exatamente a de comissao_do_periodo;
// - custo: material do serviço × vezes, produto pelo custo guardado na venda; sem custo, "custo não informado" (sem margem);
//   "contar a comissão como custo"; quem lê e grava o custo do material;
// - Por pessoa: atendimentos = os da comissão, quem vendeu no balcão (vendido_por), soma das pessoas = linhas de Quanto sobrou;
//   quem não cuida do financeiro só vê a própria linha; o Mozart (ver_lucro) devolve a mesma conta e respeita os papéis.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('lucro');
const D = lib('dinheiro'), F = lib('faturamento'), LU = lib('lucro');
const M = lib('assistente/ferramenta-lucro');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Lucro' });
  const { dono, caixa: cx, tosador: tos, estoque: est } = L.sb;
  const P = L.P;
  const fim = B.sql(`select to_char((date '${L.mes1}' + interval '1 month - 1 day')::date, 'YYYY-MM-DD')`);
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'comissao.em_produtos': true, 'comissao.produtos_pct': 10 } }), 'opções');
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'abrir o caixa');

  T.secao('custo do material: só o dono');
  T.passa('o dono põe R$ 8,50 de material no Banho', await dono.from('servicos').update({ custo_material: 8.5 }).eq('id', L.S.Banho).select('id'));
  const tCx = await cx.from('servicos').update({ custo_material: 1 }).eq('id', L.S.Banho).select('id');
  T.ok('a recepção não muda o custo do material', !!tCx.error || !tCx.data?.length, tCx.error?.message ?? tCx.data);
  const tTos = await tos.from('servicos').update({ custo_material: 1 }).eq('id', L.S.Banho).select('id');
  T.ok('o tosador não muda o custo do material', !!tTos.error || !tTos.data?.length);
  T.ok('… e o valor continua 8,50', B.num(`select custo_material from servicos where id='${L.S.Banho}'`) === 8.5);
  T.recusa('ninguém lê a coluna direto (nem o dono)', await dono.from('servicos').select('id, custo_material').eq('id', L.S.Banho));
  T.recusa('o tosador também não lê', await tos.from('servicos').select('custo_material').eq('id', L.S.Banho));
  const cd = B.must(await dono.rpc('servicos_custos', { p: P }), 'servicos_custos');
  T.ok('o dono lê por servicos_custos (Banho 8,50; Hidratação em branco)', Number(cd.find((x) => x.id === L.S.Banho)?.custo_material) === 8.5 && cd.find((x) => x.id === L.S['Hidratação'])?.custo_material == null, cd);
  T.ok('a recepção e o tosador não recebem nada de servicos_custos', (B.must(await cx.rpc('servicos_custos', { p: P }), 'cx')).length === 0 && (B.must(await tos.rpc('servicos_custos', { p: P }), 'tos')).length === 0);

  // horários de hoje com o tosador (40%): Thor (M) Banho 60 + Hidratação 30 + Corte de unhas 15; Bob (G) Banho 70; Luna (M) Banho 60
  const marca = async (pet, h, servico, outros = []) => {
    const ini = B.instante(L.hoje, h, L.fuso);
    const porte = B.sql(`select porte from pets where id='${L.pets[pet]}'`);
    const id = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets[pet], servico_id: L.S[servico], profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 45 * 6e4).toISOString(), preco: L.preco(servico, porte) }).select('id').single(), 'horário ' + pet).id;
    if (outros.length) B.must(await dono.rpc('agendamento_servicos_definir', { p_agendamento: id, p_servicos: outros.map((s) => ({ servico_id: L.S[s], preco: L.preco(s, porte) })) }), 'outros serviços');
    B.must(await tos.from('agendamentos').update({ status: 'concluido' }).eq('id', id).select('id').single(), 'tosador conclui');
    return id;
  };
  const A = { Thor: await marca('Thor', '08:00', 'Banho', ['Hidratação', 'Corte de unhas']), Bob: await marca('Bob', '09:00', 'Banho'), Luna: await marca('Luna', '10:00', 'Banho') };

  // Thor: 3 serviços + 1 shampoo (134,90 na lista) por R$ 120,00 (o dono dá o desconto); o estoque guarda o custo (12)
  const chThor = D.novaChaveDeOperacao();
  const lThor = await D.lancarPago(dono, P, { tipo: 'entrada', valor: 120, forma: 'pix', categoria: 'Banho e tosa', agendamentoId: A.Thor, clienteId: L.tutores.Ana, chave: chThor, descricao: 'Banho + Hidratação + Corte de unhas · Thor', itens: [
    { tipo: 'servico', nome: 'Banho', qtd: 1, valor: 60 },
    { tipo: 'servico', nome: 'Hidratação', qtd: 1, valor: 30, servico_id: L.S['Hidratação'] },
    { tipo: 'servico', nome: 'Corte de unhas', qtd: 1, valor: 15, servico_id: L.S['Corte de unhas'] },
    { tipo: 'produto', nome: 'Shampoo Neutro', qtd: 1, valor: 29.9, produto_id: L.prod },
  ] });
  await D.gravarMovimentos(dono, P, [{ petshop_id: P, produto_id: L.prod, tipo: 'saida', quantidade: 1, motivo: 'Venda', lancamento_id: lThor.id, custo_unitario: 12, chave: D.parteDaChave(chThor, 'estoque', L.prod) }]);
  // Bob: conta de 70 para depois; paga 40 hoje (uma parte: entra no mês, a conta não fecha)
  const contaBob = await D.lancarAReceber(cx, P, { valor: 70, vencimento: L.dia(7), categoria: 'Banho e tosa', agendamentoId: A.Bob, clienteId: L.tutores.Beto, itens: [{ tipo: 'servico', nome: 'Banho', qtd: 1, valor: 70 }], chave: D.novaChaveDeOperacao() });
  await D.receberConta(cx, contaBob.id, { valor: 40, forma: 'dinheiro', chave: D.novaChaveDeOperacao() });
  // Luna: concluída, sem conta (comissão pelo preço da agenda; nada entrou)
  // balcão: a recepção vende 2 shampoos (sem custo guardado na saída: vale o custo de hoje do cadastro, 12)
  const chBal = D.novaChaveDeOperacao();
  const lBal = await D.lancarPago(cx, P, { tipo: 'entrada', valor: 59.8, forma: 'pix', categoria: 'Venda de produtos', chave: chBal, itens: [{ tipo: 'produto', nome: 'Shampoo Neutro', qtd: 2, valor: 29.9, produto_id: L.prod }] });
  // um produto novo sem custo, vendido pelo dono: "custo não informado"
  const semCusto = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Laço de fita', unidade: 'un', preco_venda: 5, estoque: 10 }).select('id').single(), 'produto sem custo').id;
  await D.lancarPago(dono, P, { tipo: 'entrada', valor: 10, forma: 'dinheiro', categoria: 'Venda de produtos', chave: D.novaChaveDeOperacao(), itens: [{ tipo: 'produto', nome: 'Laço de fita', qtd: 2, valor: 5, produto_id: semCusto }] });
  // fora de serviço e produto: um pacote vendido, uma entrada solta; saídas: aluguel, comissão de outro mês e uma devolução
  await D.lancarPago(dono, P, { tipo: 'entrada', valor: 200, forma: 'pix', categoria: 'Pacotes', descricao: 'Pacote 4 banhos', clienteId: L.tutores.Clara, chave: D.novaChaveDeOperacao() });
  await D.lancarPago(dono, P, { tipo: 'entrada', valor: 15.5, forma: 'dinheiro', categoria: 'Outros', descricao: 'Venda de jornal velho', chave: D.novaChaveDeOperacao() });
  await D.lancarPago(dono, P, { tipo: 'saida', valor: 500, forma: 'pix', categoria: 'Aluguel', descricao: 'Aluguel', chave: D.novaChaveDeOperacao() });
  await D.lancarPago(dono, P, { tipo: 'saida', valor: 33.33, forma: 'pix', categoria: 'Comissão', descricao: 'Comissão de outubro', chave: D.novaChaveDeOperacao() });
  await D.lancarPago(dono, P, { tipo: 'saida', valor: 10, forma: 'pix', categoria: 'Devolução', descricao: 'Devolução: laço', clienteId: L.tutores.Ana, chave: D.novaChaveDeOperacao() });

  T.secao('quem vendeu (vendido_por)');
  T.ok('a venda de balcão da recepção guarda a recepção', B.sql(`select vendido_por from lancamentos where id='${lBal.id}'`) === L.ids.caixa);
  T.ok('a conta do Thor, lançada pelo dono, guarda o dono', B.sql(`select vendido_por from lancamentos where id='${lThor.id}'`) === L.ids.dono);
  T.ok('saída não guarda vendedor', B.num(`select count(*) from lancamentos where petshop_id='${P}' and tipo='saida' and vendido_por is not null`) === 0);
  const forj = await cx.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 29.9, forma: 'pix', categoria: 'Venda de produtos', data: L.hoje, pago: true, origem: 'tela', vendido_por: B.sql(`select id from profissionais where petshop_id <> '${P}' limit 1`), itens: [{ tipo: 'produto', nome: 'Shampoo Neutro', qtd: 1, valor: 29.9, produto_id: L.prod }] }).select('id, vendido_por').single();
  T.ok('vendedor de outra loja vira quem lançou', !forj.error && forj.data.vendido_por === L.ids.caixa, forj.error?.message ?? forj.data);
  if (forj.data) B.sql(`delete from lancamentos where id='${forj.data.id}'`);

  T.secao('Quanto sobrou: a conta ao centavo');
  const bruto = B.must(await dono.rpc('lucro_do_periodo', { p_petshop: P, p_de: L.mes1, p_ate: fim }), 'lucro_do_periodo');
  const x = LU.montarLucro(bruto);
  // o Financeiro do mês, pela mesma conta da tela (entradas pagas sem gaveta; devoluções e crédito; saídas sem devolução)
  const entrou = B.num(`select coalesce(sum(valor), 0) from lancamentos where petshop_id='${P}' and tipo='entrada' and pago and movimento is null and data between '${L.mes1}' and '${fim}'`);
  const saiu = B.num(`select coalesce(sum(valor), 0) from lancamentos where petshop_id='${P}' and tipo='saida' and pago and movimento is null and categoria not in ('Devolução', 'Devolução de sinal') and data between '${L.mes1}' and '${fim}'`);
  const aj = await F.ajustesDoFaturamento(dono, P, L.mes1, fim);
  const fat = F.faturamentoLiquido(entrou, aj);
  const res = Math.round((fat - saiu) * 100) / 100;
  // à mão: 120 + 40 + 59,80 + 10 + 200 + 15,50 = 445,30; faturamento 445,30 − 10 = 435,30; resultado 435,30 − 533,33 = −98,03
  T.ok('Entrou = R$ 445,30 = Financeiro', B.centavos(x.ponte.entradas) === 44530 && B.centavos(entrou) === 44530, { banco: x.ponte.entradas, financeiro: entrou });
  T.ok('linhas + outros lançamentos = Entrou (diferença zero)', x.ponte.diferenca === 0 && B.centavos(x.ponte.linhas + x.ponte.somaOutros) === B.centavos(entrou), x.ponte);
  T.ok('outros lançamentos: Pacotes 200 e Outros 15,50', JSON.stringify(x.ponte.outros.map((o) => [o.categoria, o.valor])) === '[["Pacotes",200],["Outros",15.5]]', x.ponte.outros);
  T.ok('faturamento = Financeiro (R$ 435,30)', B.centavos(x.ponte.faturamento) === B.centavos(fat) && B.centavos(fat) === 43530, { banco: x.ponte.faturamento, financeiro: fat });
  T.ok('resultado = "Resultado do mês" do Financeiro (− R$ 98,03)', B.centavos(x.ponte.resultado) === B.centavos(res) && B.centavos(res) === -9803, { banco: x.ponte.resultado, financeiro: res });
  T.ok('saídas por categoria somam o "Saiu" (533,33)', B.centavos(x.ponte.saidas.reduce((t, s) => t + s.valor, 0)) === B.centavos(saiu) && B.centavos(saiu) === 53333);

  const sv = (nome) => x.servicos.find((s) => s.nome === nome);
  // Thor: serviço = 105/134,90 × 120 = 93,40; produto 26,60. Serviços por partes_por_servico: 53,37 + 26,69 + 13,34. Bob: 40 (parte)
  T.ok('Banho: 1 vez (a conta do Bob ainda não fechou: só a parte entra), entrou 53,37 + 40 = 93,37', sv('Banho')?.quantidade === 1 && B.centavos(sv('Banho').receita) === 9337, sv('Banho'));
  T.ok('Hidratação 26,69 e Corte de unhas 13,34 (desconto repartido como na comissão)', B.centavos(sv('Hidratação')?.receita) === 2669 && B.centavos(sv('Corte de unhas')?.receita) === 1334, x.servicos);
  T.ok('Banho com material 8,50: custo 8,50, sobrou 84,87', sv('Banho').material === 8.5 && sv('Banho').custo === 8.5 && B.centavos(sv('Banho').margem) === 8487, sv('Banho'));
  T.ok('Hidratação sem material: "custo não informado", sem margem (nada de 100%)', sv('Hidratação').custo == null && sv('Hidratação').margem == null && sv('Hidratação').pct == null && /não informado/.test(sv('Hidratação').falta));
  const sh = x.produtos.find((p) => p.nome === 'Shampoo Neutro'), laco = x.produtos.find((p) => p.nome === 'Laço de fita');
  T.ok('Shampoo: 3 un, entrou 26,60 + 59,80 = 86,40, custo 36 (12 guardado + 24 do cadastro), sobrou 50,40', sh && sh.quantidade === 3 && B.centavos(sh.receita) === 8640 && sh.custo === 36 && sh.custoDeHoje === 24 && B.centavos(sh.margem) === 5040, sh);
  T.ok('Laço sem custo no cadastro: custo não informado', laco && laco.quantidade === 2 && laco.receita === 10 && laco.custo == null && laco.margem == null, laco);
  T.ok('total das linhas: R$ 229,80 (serviços 133,40 + produtos 96,40)', B.centavos(x.totais.receita) === 22980, x.totais);
  T.ok('custo informado 44,50 e sobrou 135,27 sobre 179,77 com custo (3 linhas sem custo ficam fora)', B.centavos(x.totais.custo) === 4450 && B.centavos(x.totais.receitaComCusto) === 17977 && B.centavos(x.totais.margem) === 13527 && x.totais.linhasSemCusto === 3, x.totais);

  T.secao('comissão nas linhas = comissão de Relatórios');
  const doPeriodo = B.must(await dono.rpc('comissao_do_periodo', { p_petshop: P, p_de: L.mes1, p_ate: fim }), 'comissao_do_periodo');
  const totalCom = Math.round(doPeriodo.reduce((t, c) => t + Number(c.comissao), 0) * 100) / 100;
  const nasLinhas = [...x.servicos, ...x.produtos, ...(x.extras ? [x.extras] : [])].reduce((t, l) => t + l.comissao, 0);
  // à mão (conta fechada pelo que entrou): Thor 93,40 × 40% = 37,36; Bob conta inteira 70 × 40% = 28; Luna agenda 60 × 40% = 24; produto 26,60 × 10% = 2,66
  T.ok('comissão total = comissao_do_periodo = R$ 92,02', B.centavos(x.totais.comissao) === B.centavos(totalCom) && B.centavos(totalCom) === 9202, { relatorio: totalCom, lucro: x.totais.comissao });
  T.ok('a soma das linhas fecha com o total', B.centavos(nasLinhas) === B.centavos(totalCom), nasLinhas);
  // exatas: Banho 21,348 + 28 + 24 = 73,348; Hidratação 10,676; Corte 5,336; shampoo 2,66 (soma 92,02). Arredondadas uma a uma dariam
  // 92,03: o centavo a menos fica na maior linha (Banho 73,34), para a soma ser a comissão que é paga
  T.ok('comissão do Banho 73,34 (o centavo do arredondamento fica na maior linha) e do shampoo 2,66', B.centavos(sv('Banho').comissao) === 7334 && B.centavos(sh.comissao) === 266, { banho: sv('Banho').comissao, shampoo: sh.comissao });
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'lucro.comissao_custo': true } }), 'comissão como custo');
  const x2 = LU.montarLucro(B.must(await dono.rpc('lucro_do_periodo', { p_petshop: P, p_de: L.mes1, p_ate: fim }), 'lucro 2'));
  const b2 = x2.servicos.find((s) => s.nome === 'Banho'), sh2 = x2.produtos.find((p) => p.nome === 'Shampoo Neutro');
  T.ok('"contar a comissão como custo": Banho custa 8,50 + 73,34 = 81,84 (sobra 11,53); shampoo 36 + 2,66', x2.comissaoComoCusto && B.centavos(b2.custo) === 8184 && B.centavos(sh2.custo) === 3866 && B.centavos(b2.margem) === 1153, { b2, sh2 });
  T.ok('… e o resultado do Financeiro não muda (a comissão paga já é saída)', B.centavos(x2.ponte.resultado) === B.centavos(res));

  T.secao('Por pessoa');
  const eq = LU.montarEquipe(B.must(await dono.rpc('equipe_do_periodo', { p_petshop: P, p_de: L.mes1, p_ate: fim }), 'equipe_do_periodo'));
  const pT = eq.pessoas.find((p) => p.id === L.ids.tosador), pC = eq.pessoas.find((p) => p.id === L.ids.caixa), pD = eq.pessoas.find((p) => p.id === L.ids.dono);
  const comTos = doPeriodo.find((c) => c.profissional_id === L.ids.tosador);
  T.ok('tosador: 3 atendimentos (= comissão), entrou 120 + 40 = 160, 1 conta, 1 venda na conta (26,60)', pT && pT.atendimentos === 3 && pT.atendimentos === comTos.atendimentos && B.centavos(pT.receita) === 16000 && pT.contas === 1 && pT.vendas === 1 && B.centavos(pT.vendasValor) === 2660, pT);
  T.ok('tosador: comissão = Comissão por profissional', B.centavos(pT.comissao) === B.centavos(comTos.comissao), { pT: pT.comissao, rel: comTos.comissao });
  T.ok('recepção: a venda de balcão (1 venda, 59,80; valor médio 59,80)', pC && pC.vendas === 1 && B.centavos(pC.vendasValor) === 5980 && B.centavos(pC.medio) === 5980, pC);
  T.ok('dono: o laço (10,00)', pD && B.centavos(pD.receita) === 1000, pD);
  T.ok('soma das pessoas = linhas de Quanto sobrou (229,80)', B.centavos(eq.total.receita) === B.centavos(x.totais.receita), { pessoas: eq.total.receita, linhas: x.totais.receita });
  const eqTos = B.must(await tos.rpc('equipe_do_periodo', { p_petshop: P, p_de: L.mes1, p_ate: fim }), 'equipe tosador');
  T.ok('o tosador recebe só a própria linha (e nada sem pessoa)', eqTos.so_eu && eqTos.pessoas.length === 1 && eqTos.pessoas[0].profissional_id === L.ids.tosador && eqTos.sem_pessoa == null, eqTos);
  const eqCx = B.must(await cx.rpc('equipe_do_periodo', { p_petshop: P, p_de: L.mes1, p_ate: fim }), 'equipe recepção');
  T.ok('a recepção (só Caixa) também só a própria', eqCx.pessoas.length === 1 && eqCx.pessoas[0].profissional_id === L.ids.caixa);
  T.recusa('anônimo não lê Por pessoa', await B.cliente().rpc('equipe_do_periodo', { p_petshop: P, p_de: L.mes1, p_ate: fim }));

  T.secao('papéis de Quanto sobrou');
  T.recusa('a recepção (Caixa, sem Financeiro) não lê', await cx.rpc('lucro_do_periodo', { p_petshop: P, p_de: L.mes1, p_ate: fim }));
  T.recusa('o tosador não lê', await tos.rpc('lucro_do_periodo', { p_petshop: P, p_de: L.mes1, p_ate: fim }));
  T.recusa('o estoque não lê', await est.rpc('lucro_do_periodo', { p_petshop: P, p_de: L.mes1, p_ate: fim }));
  T.recusa('anônimo não lê', await B.cliente().rpc('lucro_do_periodo', { p_petshop: P, p_de: L.mes1, p_ate: fim }));
  T.recusa('período de mais de um ano é recusado', await dono.rpc('lucro_do_periodo', { p_petshop: P, p_de: '2024-01-01', p_ate: L.hoje }));
  for (const f of ['lucro_pecas', 'lucro_comissoes']) T.recusa(`${f} (interna) não abre para a equipe`, await dono.rpc(f, { p: P, p_de: L.mes1, p_ate: fim }));

  T.secao('Mozart: ver_lucro');
  const contexto = (sb, eu, fin) => ({ sb, petshop: { id: P }, eu: { id: eu }, equipe: Object.values(L.ids).map((id) => ({ id })), cuidoDoFinanceiro: fin, vejoFinanceiro: fin, fusoMin: -180, agora: `${L.hoje}T12:00` });
  const erro = (m) => new Error(m);
  const r = await M.consultarLucro(contexto(dono, L.ids.dono, true), 'ver_lucro', { de: L.mes1, ate: fim }, erro);
  const prim = r.resultado.servicos_por_lucro[0];
  T.ok('"qual serviço dá mais lucro?": o de mais sobra com custo vem primeiro; sem custo, margem null', prim.sobrou != null && r.resultado.servicos_por_lucro.filter((s) => s.sobrou == null).every((s) => s.custo_nao_informado) && r.resultado.servicos_por_lucro.findIndex((s) => s.sobrou == null) > 0, r.resultado.servicos_por_lucro);
  T.ok('o resultado do Mozart é o do Financeiro', B.centavos(r.resultado.financeiro.resultado) === B.centavos(res));
  let recusa = null; try { await M.consultarLucro(contexto(cx, L.ids.caixa, false), 'ver_lucro', {}, erro); } catch (e) { recusa = e.message; }
  T.ok('quem não cuida do financeiro: recusado com a frase', /cuida do financeiro/.test(recusa ?? ''), recusa);
  T.ok('nome de outra ferramenta: não é desta lista', (await M.consultarLucro(contexto(dono, L.ids.dono, true), 'ver_caixa', {}, erro)) === null);
}))();
