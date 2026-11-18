// Rodada 9 (N4): uma definição para cada número do dinheiro, arredondamento igual ao do banco e planilhas para o contador
// (migração 20261234), pela API com o login de cada papel e pelo mesmo código das telas (util.ts, cadeia.ts, contador.ts,
// faturamento.ts, dinheiro.ts, devolucao.ts). Contas à mão do cenário (tudo hoje, taxas: débito 1,99%, crédito 3,49% + 0,10,
// Pix 0,99%):
//   V1 balcão sem tutor: 2 Shampoo (29,90) + 0,35 kg de ração a granel (18,90/kg = 6,615 → 6,62) = 66,42 no débito
//   V2 Ana: 3 Petisco (12,49) = 37,47 no Pix          V3 Ana: 1 Shampoo 29,90 no crédito
//   D1 devolve V3 inteira em dinheiro (29,90)          D2 troca em V2: voltam 2 Petisco (24,98), leva 1 Shampoo (29,90), paga 4,92 no Pix
//   V4 Beto: 1 Shampoo 29,90 em dinheiro; D3 devolve e vira crédito (29,90)   V5 Beto: 1 Petisco 12,49 pago com o crédito
//   Saídas: Aluguel 100,00 no Pix e Retirada do dono 50,00 em dinheiro. Fiado: Clara, 1 Petisco 12,49 para daqui a 5 dias.
//   Entradas lançadas 206,08 (66,42 + 37,47 + 29,90 + 29,90 da troca + 29,90 + 12,49)
//   Recebido 168,61 (206,08 − 12,49 pagos com crédito − 24,98 de produto trocado) − devolvido 29,90 − crédito deixado 29,90
//   + crédito usado 12,49 = Faturamento 121,30 − despesas 150,00 = Resultado −28,70 − taxas = depois das taxas.
//   Valor médio por conta: V1, V2 e V5 (V3 e V4 voltaram inteiras; a entrada da troca não é conta) = 116,38 ÷ 3 = 38,79.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('dinheiro-n4');
const U = lib('util'), D = lib('dinheiro'), DV = lib('devolucao'), TN = lib('tudo-ou-nada'), FA = lib('faturamento'), CA = lib('cadeia'), CO = lib('contador'), LU = lib('lucro');

const real = (n) => U.centavos(Number(n));

(async () => T.rodar(async () => {
  // ---------------------------------------------------------------------------------------------------------------
  T.secao('arredondamento: a função única dá o mesmo centavo do round() do banco');
  T.ok('0,35 kg × 18,90 = 6,62 (era 6,61 na tela)', U.centavos(0.35 * 18.9) === 6.62, U.centavos(0.35 * 18.9));
  T.ok('5% de 48,90 = 2,45 (como promo_desconto)', U.centavos(48.9 * 5 / 100) === 2.45, U.centavos(48.9 * 5 / 100));
  T.ok('15% de 33,30 = 5,00', U.centavos(33.3 * 15 / 100) === 5, U.centavos(33.3 * 15 / 100));
  T.ok('1,005 × 1,00 = 1,01', U.centavos(1.005 * 1) === 1.01, U.centavos(1.005));
  T.ok('negativo: −6,615 = −6,62 (meio centavo para longe do zero, como o banco)', U.centavos(-6.615) === -6.62, U.centavos(-6.615));
  // muitas combinações de preço × quantidade × porcentagem, com gerador fixo (o teste é sempre o mesmo)
  let s = 20261234;
  const prox = () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return s; };
  const casos = [[18.9, 0.35, 5], [48.9, 1, 5], [33.3, 1, 15], [1, 1.005, 10], [96.6, 1.25, 12.5], [0.01, 0.5, 50], [19.99, 0.125, 2.5], [1234.56, 3.333, 33.33]];
  for (let i = 0; i < 6000; i++) {
    const preco = (prox() % 50000) / 100 + 0.01, pct = [5, 10, 15, 12.5, 7.5, 2, 3, 33.33, 1.99, 3.49, 4.99, 0.99, 25, 50][prox() % 14];
    const qtd = prox() % 3 === 0 ? (prox() % 4000) / 1000 + 0.001 : prox() % 3 === 1 ? (prox() % 12) + 1 : (prox() % 200) / 40 + 0.025;
    casos.push([Number(preco.toFixed(2)), Number(qtd.toFixed(3)), pct]);
  }
  const doBanco = B.sql(`select string_agg(round(p * q, 2)::text || ';' || round(p * c / 100, 2)::text || ';' || round(p * q * c / 100, 2)::text || ';' || round(-p * q, 2)::text, ',' order by i)
    from (values ${casos.map(([p, q, c], i) => `(${i}, ${p}::numeric, ${q}::numeric, ${c}::numeric)`).join(',')}) v(i, p, q, c)`).split(',');
  const diferentes = [];
  casos.forEach(([p, q, c], i) => {
    const [a, b, d, e] = doBanco[i].split(';').map(Number);
    const meu = [U.centavos(p * q), U.centavos(p * c / 100), U.centavos(p * q * c / 100), U.centavos(-p * q)];
    if (meu[0] !== a || meu[1] !== b || meu[2] !== d || meu[3] !== e) diferentes.push({ p, q, c, tela: meu, banco: [a, b, d, e] });
  });
  T.ok(`${casos.length} combinações × 4 contas: tela e banco no mesmo centavo`, diferentes.length === 0, diferentes.slice(0, 5));
  const ingenuo = casos.filter(([p, q, c]) => Math.round(p * q * 100) / 100 !== U.centavos(p * q) || Math.round(p * c) / 100 !== U.centavos(p * c / 100)).length;
  T.ok('a conta antiga (Math.round(n * 100) / 100) errava em algumas destas', ingenuo > 0, ingenuo);

  // ---------------------------------------------------------------------------------------------------------------
  const L = await criarLoja(T, { nome: 'Dinheiro N4' });
  const { dono, caixa: cx, tosador: tos } = L.sb;
  const P = L.P, prod = L.prod, hoje = L.hoje;
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'abrir o caixa');
  B.must(await dono.from('taxas_maquininha').insert({ petshop_id: P, debito_pct: 1.99, debito_fixo: 0, debito_dias: 1, credito_pct: 3.49, credito_fixo: 0.1, credito_dias: 30,
    parcelado_pct: 4.99, parcelado_dias: 30, parcelas_pct: { 3: 5.59 }, pix_pct: 0.99, pix_fixo: 0, pix_dias: 0 }).select('petshop_id'), 'taxas');
  const granel = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Ração a granel', unidade: 'kg', preco_venda: 18.9, custo: 11.27, estoque: 30 }).select('id').single(), 'granel').id;
  const petisco = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Petisco', unidade: 'un', preco_venda: 12.49, custo: 5.01, estoque: 50 }).select('id').single(), 'petisco').id;
  const item = (produto_id, nome, qtd, valor) => ({ tipo: 'produto', nome, qtd, valor, produto_id });
  async function vender(quem, itens, o = {}) {
    const ch = D.novaChaveDeOperacao();
    const valor = o.valor ?? D.contaDosItens(itens, 0).soma;
    const r = await TN.fazerTudoOuNada(quem, P, ch, { funcao: 'venda_registrar' }, [
      { t: 'lancamento', nome: 'venda', chave: ch, linha: { tipo: 'entrada', valor, forma: o.forma ?? 'dinheiro', categoria: 'Venda de produtos', cliente_id: o.cliente ?? null, pago: o.pago !== false,
        data: o.pago === false ? L.dia(5) : hoje, ...(o.pago === false ? { vencimento: L.dia(5) } : {}), descricao: 'Venda: ' + itens.map((i) => `${i.qtd} ${i.nome}`).join(' + '), itens, ...(o.extra ?? {}) } },
      TN.passoDoEstoque(itens.map((i) => ({ produtoId: i.produto_id, qtd: i.qtd })), ch, TN.ref('venda')),
    ]);
    return r.ids.venda;
  }
  const anotados = (id) => B.sql(`select coalesce(string_agg(tipo || ':' || de || '>' || para, ','), '') from precos_alterados where lancamento_id='${id}'`);

  T.secao('venda por peso: tela, banco e nenhum "desconto dado"');
  const itensV1 = [item(prod, 'Shampoo Neutro', 2, 29.9), item(granel, 'Ração a granel', 0.35, 18.9)];
  T.ok('a conta da tela dá 66,42 (59,80 + 6,62)', D.contaDosItens(itensV1, 0).soma === 66.42, D.contaDosItens(itensV1, 0));
  T.ok('duas linhas por peso somam linha a linha, como o banco (6,62 + 6,62 = 13,24)', D.contaDosItens([item(granel, 'a', 0.35, 18.9), item(granel, 'b', 0.35, 18.9)], 0).soma === 13.24);
  const v1 = await vender(cx, itensV1, { forma: 'debito' });
  T.ok('V1 gravada por 66,42 sem anotação de desconto', B.sql(`select valor from lancamentos where id='${v1}'`) === '66.42' && anotados(v1) === '', anotados(v1));
  const vCent = await vender(cx, [item(granel, 'Ração a granel', 0.35, 18.9)], { valor: 6.61 });
  T.ok('um centavo a menos (6,61, a conta antiga da tela) não vira "Deu desconto na venda"', anotados(vCent) === '', anotados(vCent));
  const vDesc = await vender(cx, [item(granel, 'Ração a granel', 0.35, 18.9)], { valor: 6.6 });
  T.ok('dois centavos a menos continuam anotados como desconto', /^desconto:6\.62>6\.60$/.test(anotados(vDesc)), anotados(vDesc));
  // estas duas vendas de conferência saem do cenário (as contas à mão não contam com elas)
  B.sql(`set session_replication_role = replica; delete from movimentos_estoque where lancamento_id in ('${vCent}','${vDesc}'); delete from precos_alterados where lancamento_id in ('${vCent}','${vDesc}'); delete from lancamentos_taxas where lancamento_id in ('${vCent}','${vDesc}'); delete from lancamentos where id in ('${vCent}','${vDesc}'); set session_replication_role = origin;`);

  T.secao('o cenário');
  const v2 = await vender(cx, [item(petisco, 'Petisco', 3, 12.49)], { forma: 'pix', cliente: L.tutores.Ana });
  const v3 = await vender(cx, [item(prod, 'Shampoo Neutro', 1, 29.9)], { forma: 'credito', cliente: L.tutores.Ana });
  await DV.devolver(cx, P, { venda: v3, itens: [{ produto_id: prod, qtd: 1 }], modo: 'dinheiro', forma: 'dinheiro', chave: D.novaChaveDeOperacao() });
  const troca = await DV.devolver(cx, P, { venda: v2, itens: [{ produto_id: petisco, qtd: 2 }], modo: 'troca', forma: 'pix', novos: [{ produto_id: prod, qtd: 1 }], chave: D.novaChaveDeOperacao() });
  T.ok('troca: voltam 24,98, leva 29,90, paga 4,92', real(troca.valor) === 24.98 && real(troca.novos) === 29.9 && real(troca.diferenca) === 4.92, troca);
  const v4 = await vender(cx, [item(prod, 'Shampoo Neutro', 1, 29.9)], { cliente: L.tutores.Beto });
  await DV.devolver(cx, P, { venda: v4, itens: [{ produto_id: prod, qtd: 1 }], modo: 'credito', chave: D.novaChaveDeOperacao() });
  const pg = D.pagamentoComCredito(12.49, null, 0);
  const v5 = await vender(cx, [item(petisco, 'Petisco', 1, 12.49)], { cliente: L.tutores.Beto, forma: pg.forma, extra: { pagamentos: pg.pagamentos, credito_usado: 12.49 } });
  await D.lancarPago(dono, P, { tipo: 'saida', valor: 100, forma: 'pix', categoria: 'Aluguel', descricao: 'Aluguel' });
  await D.lancarPago(dono, P, { tipo: 'saida', valor: 50, forma: 'dinheiro', categoria: 'Retirada do dono', descricao: 'Retirada' });
  const fiado = await vender(dono, [item(petisco, 'Petisco', 1, 12.49)], { cliente: L.tutores.Clara, pago: false, forma: null });

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('a cadeia do dinheiro: uma conta, cada passo com nome');
  const c = await CA.lerCadeia(dono, P, hoje, hoje);
  T.ok('entradas lançadas 206,08 (com crédito e troca dentro: só conferência)', c && c.lancado === 206.08, c && c.lancado);
  T.ok('Recebido 168,61 (sem os 12,49 pagos com crédito e sem os 24,98 de produto trocado)', c.recebido === 168.61 && c.creditoNasContas === 12.49 && c.troca === 24.98, c);
  T.ok('− Devolvido 29,90 (a troca não é dinheiro devolvido)', c.devolvido === 29.9, c.devolvido);
  T.ok('− Crédito deixado 29,90 e + Crédito usado 12,49', c.creditoDeixado === 29.9 && c.creditoUsado === 12.49, c);
  T.ok('= Faturamento 121,30', c.faturamento === 121.3, c.faturamento);
  T.ok('− Despesas 150,00 (retirada do dono 50,00 dentro) = Resultado −28,70', c.despesas === 150 && c.retiradaDoDono === 50 && c.resultado === -28.7, c);
  T.ok('a cadeia fecha: recebido − devolvido − crédito deixado + crédito usado = faturamento', c.fecha === true && real(c.recebido - c.devolvido - c.creditoDeixado + c.creditoUsado) === c.faturamento);
  const passos = CA.passosDaCadeia(c);
  T.ok('os passos na ordem e com os nomes únicos', passos.map((x) => x.nome).join(' > ') === 'Recebido > Devolvido aos tutores > Crédito deixado para tutores > Crédito usado por tutores > Faturamento > Despesas > Resultado > Taxas da maquininha > Resultado depois das taxas', passos.map((x) => x.nome));
  let corrido = 0; const fechaPasso = [];
  for (const x of passos) { if (x.sinal === '=') fechaPasso.push(real(corrido) === x.valor); else corrido += x.sinal === '−' ? -x.valor : x.valor; }
  T.ok('somando os passos, cada total bate (cartões: Faturamento − Despesas = Resultado)', fechaPasso.every(Boolean) && fechaPasso.length === 3, fechaPasso);

  T.secao('os números que já batiam continuam iguais ao centavo');
  const entradas = B.must(await dono.from('lancamentos').select('valor').eq('petshop_id', P).eq('tipo', 'entrada').eq('pago', true).is('movimento', null).eq('data', hoje), 'entradas');
  const aj = await FA.ajustesDoFaturamento(dono, P, hoje, hoje, L.fuso);
  const fatTela = FA.faturamentoLiquido(real(entradas.reduce((t, l) => t + Number(l.valor), 0)), aj);
  T.ok('faturamento da regra das telas (faturamento.ts) = o da cadeia', fatTela === c.faturamento, { fatTela, cadeia: c.faturamento });
  const lucroB = B.must(await dono.rpc('lucro_do_periodo', { p_petshop: P, p_de: hoje, p_ate: hoje }), 'lucro');
  const lucro = LU.montarLucro(lucroB);
  T.ok('Quanto sobrou (lucro_do_periodo): faturamento, resultado e taxas iguais', lucro.ponte.faturamento === c.faturamento && lucro.ponte.resultado === c.resultado && lucro.ponte.taxas === c.taxas && lucro.ponte.resultadoDepoisDasTaxas === c.resultadoDepoisDasTaxas, { ponte: lucro.ponte, c });
  const tx = B.must(await dono.rpc('taxas_do_periodo', { p: P, p_de: hoje, p_ate: hoje }), 'taxas');
  T.ok('taxas da maquininha: débito 1,32 + Pix 0,37 + crédito 1,14 + Pix da diferença 0,05 = 2,88', c.taxas === 2.88 && real(tx.taxa) === 2.88, { c: c.taxas, tx: tx.taxa });
  T.ok('Resultado depois das taxas −31,58', c.resultadoDepoisDasTaxas === -31.58, c.resultadoDepoisDasTaxas);

  T.secao('valor médio por conta: uma definição (Relatórios, Indicadores, Mozart)');
  T.ok('3 contas (V1, V2, V5), 116,38, média 38,79; venda devolvida inteira e entrada da troca fora', c.valorMedio.contas === 3 && c.valorMedio.valor === 116.38 && c.valorMedio.medio === 38.79, c.valorMedio);
  const ind = B.must(await dono.rpc('indicadores_do_periodo', { p: P, p_de: hoje, p_ate: hoje }), 'indicadores');
  const mes = ind.meses[0];
  T.ok('Indicadores: o mesmo valor médio e as mesmas contas', Number(mes.valor_medio) === 38.79 && Number(mes.contas) === 3 && Number(mes.faturamento) === c.faturamento && Number(mes.resultado) === c.resultado, mes);

  T.secao('quem não cuida do financeiro não lê');
  T.recusa('o tosador não lê a cadeia', await tos.rpc('dinheiro_cadeia', { p: P, p_de: hoje, p_ate: hoje }));
  T.recusa('o tosador não lê as linhas do contador', await tos.rpc('lancamentos_para_contador', { p: P, p_de: hoje, p_ate: hoje }));
  T.recusa('o tosador não lê os saldos', await tos.rpc('saldos_em_aberto', { p: P }));
  const outra = await criarLoja(T, { nome: 'Outra N4', equipe: false, dados: false });
  T.recusa('dono de outra loja não lê a cadeia desta', await outra.sb.dono.rpc('dinheiro_cadeia', { p: P, p_de: hoje, p_ate: hoje }));
  T.recusa('… nem os saldos', await outra.sb.dono.rpc('saldos_em_aberto', { p: P }));

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('planilhas: somar as colunas documentadas dá os números da tela');
  const lancs = B.must(await dono.from('lancamentos').select('*').eq('petshop_id', P).order('criado_em').order('id'), 'lançamentos');
  const extras = await CO.lerParaContador(dono, P, hoje, hoje);
  const nomes = new Map(Object.entries(L.tutores).map(([n, id]) => [id, n]));
  const numero = (cel) => (cel && typeof cel === 'object' ? Number(String(cel.bruto).replace(',', '.')) : cel === '' ? 0 : Number(String(cel).replace(',', '.')));
  const col = (tab, nome) => { const i = tab[0].indexOf(nome); if (i < 0) throw new Error('coluna ' + nome); return tab.slice(1).map((l) => l[i]); };
  const soma = (tab, nome) => real(col(tab, nome).reduce((t, x) => t + numero(x), 0));

  const tl = CO.planilhaDeLancamentos(lancs.filter((l) => l.pago && l.data === hoje), extras, { cliente: (id) => nomes.get(id) ?? '' });
  T.ok('lancamentos: soma de "Conta no resultado" = Resultado da tela (−28,70)', soma(tl, 'Conta no resultado') === c.resultado, soma(tl, 'Conta no resultado'));
  T.ok('… soma de "Conta no faturamento" = Faturamento (121,30)', soma(tl, 'Conta no faturamento') === c.faturamento, soma(tl, 'Conta no faturamento'));
  T.ok('… soma de "Taxa da maquininha" = taxas da tela (2,88)', soma(tl, 'Taxa da maquininha') === c.taxas, soma(tl, 'Taxa da maquininha'));
  T.ok('… tem as colunas que o contador pediu', ['Parcelas', 'Valor líquido', 'Cai em', 'Data do atendimento ou da venda', 'Lançado em', 'Retroativo'].every((n) => tl[0].includes(n)), tl[0]);
  T.ok('… linhas próprias do crédito deixado e usado (para a soma fechar)', col(tl, 'Tipo').filter((x) => x === 'Crédito do tutor').length >= 1, col(tl, 'Tipo'));

  const pc = CO.planilhaParaOContador(lancs.filter((l) => l.pago && l.data === hoje), extras, { cliente: (id) => nomes.get(id) ?? '' });
  T.ok('Para o contador: uma linha por recebimento (6 entradas)', pc.length - 1 === 6, pc.length - 1);
  T.ok('… Bruto soma as entradas lançadas (206,08)', soma(pc, 'Bruto') === 206.08, soma(pc, 'Bruto'));
  T.ok('… Bruto − crédito usado − troca = Recebido (168,61)', real(soma(pc, 'Bruto') - soma(pc, 'Crédito do tutor usado') - soma(pc, 'Produto trocado (não é dinheiro)')) === c.recebido);
  T.ok('… Taxa 2,88 e Líquido = Bruto − Taxa', soma(pc, 'Taxa da maquininha') === 2.88 && soma(pc, 'Líquido') === real(206.08 - 2.88), { taxa: soma(pc, 'Taxa da maquininha'), liq: soma(pc, 'Líquido') });
  T.ok('… Devolvido: V3 29,90, V4 29,90 (virou crédito) e os 24,98 da troca em V2', soma(pc, 'Devolvido') === real(29.9 + 29.9 + 24.98), soma(pc, 'Devolvido'));
  T.ok('… Custo dos produtos: 2×12 + 0,35×11,27 (3,94) + 3×5,01 + 12 + 12 + 12 + 5,01', soma(pc, 'Custo dos produtos') === real(24 + 3.94 + 15.03 + 12 + 12 + 12 + 5.01), soma(pc, 'Custo dos produtos'));

  const rp = CO.planilhaDeRepasses(lancs, extras, hoje);
  const aReceberTela = real((tx.a_receber ?? []).reduce((t, x) => t + Number(x.valor), 0));
  const aCair = real(rp.slice(1).filter((l) => l[rp[0].indexOf('Situação')] === 'A receber').reduce((t, l) => t + numero(l[rp[0].indexOf('Valor que cai')]), 0));
  T.ok('repasses: o que está "A receber" soma o "A receber da maquininha" da tela', aCair === aReceberTela && aCair > 0, { aCair, aReceberTela });
  T.ok('… a taxa de todas as parcelas soma as taxas da tela', soma(rp, 'Taxa') === c.taxas, soma(rp, 'Taxa'));

  const vd = CO.planilhaDeVendas(lancs, { cliente: (id) => nomes.get(id) ?? '', quem: () => '' }, { voltou: new Map(), pacotes: [], estadias: [] });
  const iPago = vd[0].indexOf('Pago'), iRec = vd[0].indexOf('Já recebido'), iAb = vd[0].indexOf('Em aberto');
  T.ok('vendas: tem "Já recebido" e "Em aberto"', iRec > 0 && iAb > 0, vd[0]);
  T.ok('… "Já recebido" soma as entradas lançadas com itens (206,08) e "Em aberto" o fiado (12,49)', soma(vd, 'Já recebido') === 206.08 && soma(vd, 'Em aberto') === 12.49, { rec: soma(vd, 'Já recebido'), ab: soma(vd, 'Em aberto') });
  T.ok('… a venda fiado sai "Não" com o dia da venda (hoje), não o vencimento', vd.slice(1).some((l) => l[iPago] === 'Não' && l[0] === U.dataCompleta(hoje)), vd.slice(1).filter((l) => l[iPago] === 'Não'));

  T.secao('pagamento em parte: "Em parte", com o que já entrou e o que falta');
  const conta = B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 49.9, categoria: 'Banho e tosa', descricao: 'Banho · Bob', pago: false, data: L.dia(7), vencimento: L.dia(7), cliente_id: L.tutores.Ana,
    itens: [{ tipo: 'servico', nome: 'Banho', qtd: 1, valor: 49.9 }] }).select('id').single(), 'conta').id;
  B.must(await dono.rpc('receber_conta', { p_conta: conta, p_valor: 30, p_forma: 'debito', p_pagamentos: null, p_data: hoje }), 'receber parte');
  const lancs2 = B.must(await dono.from('lancamentos').select('*').eq('petshop_id', P).order('criado_em').order('id'), 'lançamentos');
  const vd2 = CO.planilhaDeVendas(lancs2, { cliente: (id) => nomes.get(id) ?? '', quem: () => '' }, { voltou: new Map(), pacotes: [], estadias: [] });
  const bob = vd2.slice(1).find((l) => l[vd2[0].indexOf('Descrição do lançamento')] === 'Banho · Bob');
  T.ok('a conta do Bob sai "Em parte": 30,00 já recebidos e 19,90 em aberto (antes: "Não" com 49,90)', bob && bob[iPago] === 'Em parte' && numero(bob[iRec]) === 30 && numero(bob[iAb]) === 19.9, bob);
  const extras2 = await CO.lerParaContador(dono, P, hoje, L.dia(7));
  const tl2 = CO.planilhaDeLancamentos(lancs2, extras2, { cliente: (id) => nomes.get(id) ?? '' });
  const linhaBob = tl2.slice(1).find((l) => l[tl2[0].indexOf('Descrição')] === 'Banho · Bob' && l[tl2[0].indexOf('Pago')] === 'Não');
  T.ok('conta em aberto: "Data" é o dia em que foi anotada (hoje) e o vencimento fica na coluna dele', linhaBob && linhaBob[0] === U.dataCompleta(hoje) && linhaBob[tl2[0].indexOf('Vencimento')] === U.dataCompleta(L.dia(7)), linhaBob);

  T.secao('lançamento retroativo: "Lançado em" e a marca');
  const retro = await D.lancarPago(dono, P, { tipo: 'saida', valor: 10, forma: 'pix', categoria: 'Aluguel', descricao: 'Aluguel antigo', data: L.dia(-20) });
  const ex3 = await CO.lerParaContador(dono, P, L.dia(-20), L.dia(-20));
  const lr = B.must(await dono.from('lancamentos').select('*').eq('id', retro.id), 'retro');
  const tl3 = CO.planilhaDeLancamentos(lr, ex3, { cliente: () => '' });
  T.ok('data de 20 dias atrás, lançado hoje: "Retroativo" Sim e "Lançado em" com o dia de hoje', tl3[1][tl3[0].indexOf('Retroativo')] === 'Sim' && String(tl3[1][tl3[0].indexOf('Lançado em')]).startsWith(U.dataCompleta(hoje)), tl3[1]);

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('saldos em aberto');
  B.must(await dono.from('pacotes_clientes').insert({ petshop_id: P, pet_id: L.pets[Object.keys(L.pets)[0]], nome: '4 banhos', total: 4, usados: 1, preco: 179.6, comprado_em: hoje }).select('id'), 'pacote');
  const sd = CO.montarSaldos(B.must(await dono.rpc('saldos_em_aberto', { p: P }), 'saldos'));
  T.ok('fiado em aberto: 12,49 + 19,90 = 32,39', sd.fiado.total === 32.39, sd.fiado);
  T.ok('crédito de tutores em aberto: 29,90 − 12,49 = 17,41 (Beto)', sd.credito.total === 17.41 && sd.credito.linhas.length === 1, sd.credito);
  T.ok('pacotes vendidos e não usados: 3 banhos de 4, R$ 134,70 de serviço devido', sd.pacotes.total === 134.7 && sd.pacotes.usos === 3, sd.pacotes);
  const ts = CO.planilhaDeSaldos(sd);
  T.ok('a planilha de saldos traz os quatro blocos e os totais', ['Fiado em aberto', 'Crédito de tutores em aberto', 'Pacotes vendidos e ainda não usados', 'Sinais de reservas que ainda vão acontecer'].every((t) => ts.some((l) => l[0] === t)), ts.map((l) => l[0]));

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('fuso: o total de cada dia segue o fuso do pet shop, não o do aparelho');
  const cred = B.must(await dono.from('clientes_creditos').select('valor, criado_em, lancamento_id, cliente_id').eq('petshop_id', P), 'créditos');
  const noFuso = FA.montarAjustes([], cred, L.fuso);
  T.ok('com o fuso da loja, o crédito cai em hoje', [...noFuso.porDia.keys()].every((d) => d === hoje), [...noFuso.porDia.keys()]);
  T.ok('diaNoFuso: 23:30 de São Paulo é o mesmo dia em qualquer aparelho', U.diaNoFuso('2026-11-19T02:30:00Z', 'America/Sao_Paulo') === '2026-11-18' && U.diaNoFuso('2026-11-19T02:30:00Z', 'Asia/Tokyo') === '2026-11-19');
  T.ok('inicioDoDiaNoFuso: o dia 18 começa às 03:00 UTC em São Paulo e às 04:00 UTC em Manaus', U.inicioDoDiaNoFuso('2026-11-18', 'America/Sao_Paulo').toISOString() === '2026-11-18T03:00:00.000Z' && U.inicioDoDiaNoFuso('2026-11-18', 'America/Manaus').toISOString() === '2026-11-18T04:00:00.000Z');

  T.secao('trava do hotel: um centavo de folga');
  T.ok('a trava compara com um centavo de folga (função no banco)', /v_conta - 0\.015/.test(B.sql(`select pg_get_functiondef('public.estadias_zzz_trava_de_preco()'::regprocedure)`)));
  void fiado; void v5;
}))();
