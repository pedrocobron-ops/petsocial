// Mozart vende produto pelo banco de verdade (assistente/ferramenta-venda.ts), com o login de cada papel e um modelo de mentira:
//  - o caso do dono: "Mordedor de plástico" entrou pelo Mozart sem preço (entrada 100, custo 80). "Vendi 2 mordedores a R$ 100
//    no Pix" vira UM lançamento em Venda de produtos (R$ 200, com os itens) e a saída de 2 com motivo Venda ligada a ele, como a
//    Venda no balcão do Caixa: o saldo baixa para 98, o Estoque conta 1 venda e o produto passa a ter o preço R$ 100.
//    O mesmo cartão confirmado de novo não vende duas vezes.
//  - "Vendi 10 pacotes de ração a R$ 100" sem a ração no Estoque: o mesmo cartão cadastra a ração (R$ 100 o pacote) e vende
//    (R$ 1.000, saldo -10 até dar entrada).
//  - lancar_dinheiro em Venda de produtos é recusado (manda usar vender_produto), a não ser com nao_e_do_estoque;
//    movimentar_estoque de saída com motivo de venda também é recusado.
//  - a Rita (Caixa, sem Estoque) vende o mordedor, mas não cadastra produto; o Edu (só Estoque) dá baixa como venda, sem dinheiro.
//  - pagar depois: a venda fica em A receber no nome do tutor e o estoque baixa junto.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('mozart-venda');
const C = lib('assistente/conversa');
const R = lib('reservado');
const A = lib('acessos');

let seq = 0;
const nb = (s) => String(s).replace(/[  ]/g, ' ');
const uso = (name, input) => ({ type: 'tool_use', id: `toolu_vnd${Date.now().toString(36)}${++seq}`, name, input });

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Mozart venda' });
  const P = L.P;
  B.must(await L.sb.dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'abrir o caixa');

  async function contexto(papel) {
    const sb = L.sb[papel];
    const u = (await sb.auth.getUser()).data.user;
    const [p, e, s] = await Promise.all([R.lerPetshop(sb, P), R.lerEquipe(sb, P), R.lerServicos(sb, P)]);
    const eu = (e.data || []).find((x) => x.user_id === u.id && x.ativo);
    return {
      sb, userId: u.id, petshop: p.data, eu, equipe: e.data || [], servicos: s.data || [],
      vejoFinanceiro: A.podeArea(eu, 'caixa') || A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'),
      cuidoDoFinanceiro: A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'),
      areas: A.areasDe(eu), dono: eu.papel === 'dono', fusoMin: -180, agora: `${L.hoje}T10:00`,
    };
  }
  const pedir = async (c, texto, usos) => {
    let n = 0, vistos = [];
    const r = await C.voltas({ c, mensagens: [{ role: 'user', content: texto }], liberado: true, contar: async () => true,
      chamar: async (msgs) => { if (n++ === 0) return { content: usos, stop_reason: 'tool_use' }; vistos = msgs[msgs.length - 1].content; return { content: [{ type: 'text', text: 'Pronto.' }], stop_reason: 'end_turn' }; } });
    return { ...r, vistos };
  };
  const confirmar = (c, s) => C.responderCartoes({ c, pendentes: s.mensagens[s.mensagens.length - 1].content, liberado: true, parciais: s.parciais,
    decisoes: s.propostas.map((p) => ({ id: p.id, ok: true })) });
  const linhas = (s) => (s.propostas[0]?.resumo.linhas || []).map(([k, v]) => `${k}: ${nb(v)}`);
  // a conta da tela de Estoque (contarVendas): vendas = lançamentos ligados às saídas com motivo Venda; saída solta conta 1
  const vendasNoEstoque = () => B.num(`select count(distinct lancamento_id) + count(*) filter (where lancamento_id is null) from movimentos_estoque where petshop_id='${P}' and tipo='saida' and motivo='Venda' and kit_movimento_id is null`);

  T.secao('O caso do dono: mordedor sem preço, vendido pelo Mozart');
  const cDono = await contexto('dono');
  await confirmar(cDono, await pedir(cDono, 'chegaram 100 mordedores de plástico, paguei 80', [uso('movimentar_estoque', { produto_nome: 'Mordedor de plástico', tipo: 'entrada', quantidade: 100, custo_unitario: 80 })]));
  const mordedor = B.sql(`select id from produtos where petshop_id='${P}' and nome='Mordedor de plástico'`);
  T.ok('o mordedor entrou com 100 e sem preço de venda', B.sql(`select estoque::int||'/'||coalesce(preco_venda::text,'-') from produtos where id='${mordedor}'`) === '100/-');
  const s1 = await pedir(cDono, 'vendi 2 mordedores a 100 no pix', [uso('vender_produto', { itens: [{ produto_nome: 'mordedor de plástico', quantidade: 2, preco_unitario: 100 }], forma: 'pix' })]);
  const l1 = linhas(s1);
  T.ok('um cartão "Vender produto" com o valor, o total, a forma, o estoque e o preço que fica', s1.propostas.length === 1 && s1.propostas[0].resumo.titulo === 'Vender produto'
    && l1.includes('2 un de Mordedor de plástico: R$ 200,00 (R$ 100,00 cada)') && l1.includes('Total: R$ 200,00') && l1.includes('Forma: Pix')
    && l1.includes('Estoque de Mordedor de plástico: 100 → 98 un') && l1.some((x) => x.startsWith('Preço no Estoque:')), l1);
  T.ok('nada gravado antes de confirmar', B.num(`select count(*) from lancamentos where petshop_id='${P}' and categoria='Venda de produtos'`) === 0);
  const r1 = await confirmar(cDono, s1);
  T.ok('confirmado sem erro', r1.resultados.every((x) => !x.is_error), r1.resultados);
  const venda = B.sql(`select id from lancamentos where petshop_id='${P}' and categoria='Venda de produtos'`);
  T.ok('um lançamento só: R$ 200 no Pix, pago, no caixa aberto, do Mozart, com o item do mordedor',
    B.sql(`select valor||'/'||forma||'/'||pago||'/'||(caixa_id is not null)||'/'||origem||'/'||(itens->0->>'produto_id')||'/'||(itens->0->>'qtd') from lancamentos where id='${venda}'`) === `200.00/pix/true/true/assistente/${mordedor}/2`,
    B.sql(`select valor||'/'||forma||'/'||pago||'/'||(caixa_id is not null)||'/'||origem||'/'||(itens->0->>'produto_id')||'/'||(itens->0->>'qtd') from lancamentos where id='${venda}'`));
  T.ok('a saída de 2 tem motivo Venda e está ligada ao lançamento', B.sql(`select quantidade::int||'/'||motivo||'/'||lancamento_id from movimentos_estoque where petshop_id='${P}' and produto_id='${mordedor}' and tipo='saida'`) === `2/Venda/${venda}`);
  T.ok('o saldo baixou para 98, o produto ficou com o preço R$ 100 e o Estoque conta 1 venda',
    B.sql(`select estoque::int||'/'||preco_venda from produtos where id='${mordedor}'`) === '98/100.00' && vendasNoEstoque() === 1, { produto: B.sql(`select estoque||'/'||preco_venda from produtos where id='${mordedor}'`), vendas: vendasNoEstoque() });
  const r1b = await confirmar(cDono, s1);
  T.ok('o mesmo cartão confirmado de novo não vende outra vez', B.num(`select count(*) from lancamentos where petshop_id='${P}' and categoria='Venda de produtos'`) === 1
    && B.num(`select estoque from produtos where id='${mordedor}'`) === 98, r1b.resultados);

  T.secao('Ração que não está no Estoque: cadastra e vende no mesmo cartão');
  const s2 = await pedir(cDono, 'vendi 10 pacotes de ração a 100 cada em dinheiro', [uso('vender_produto', { itens: [{ produto_nome: 'Ração', unidade: 'pacote', quantidade: 10, preco_unitario: 100 }], forma: 'dinheiro' })]);
  const l2 = linhas(s2);
  T.ok('o cartão diz que a ração é nova e que fica cadastrada', l2.includes('10 pacote de Ração (novo no Estoque): R$ 1.000,00 (R$ 100,00 cada)') && l2.some((x) => /^Cadastra no Estoque: Ração, R\$ 100,00 por pacote\. O saldo fica em -10 pacote/.test(x)), l2);
  T.ok('nada cadastrado antes de confirmar', B.num(`select count(*) from produtos where petshop_id='${P}' and nome='Ração'`) === 0);
  await confirmar(cDono, s2);
  const racao = B.sql(`select id from produtos where petshop_id='${P}' and nome='Ração'`);
  T.ok('a ração foi cadastrada com R$ 100 o pacote e saldo -10', B.sql(`select unidade||'/'||preco_venda||'/'||estoque::int from produtos where id='${racao}'`) === 'pacote/100.00/-10');
  T.ok('venda de R$ 1.000 em dinheiro ligada à saída da ração; o Estoque conta 2 vendas',
    B.sql(`select l.valor||'/'||l.forma from movimentos_estoque m join lancamentos l on l.id=m.lancamento_id where m.produto_id='${racao}' and m.motivo='Venda'`) === '1000.00/dinheiro' && vendasNoEstoque() === 2);

  T.secao('Venda pelos caminhos soltos: recusada');
  const s3 = await pedir(cDono, 'lança venda de ração 100 no pix', [uso('lancar_dinheiro', { tipo: 'entrada', valor: 100, forma: 'pix', categoria: 'Venda de produtos', descricao: 'Venda de ração' })]);
  T.ok('lancar_dinheiro em Venda de produtos: sem cartão, e o Mozart ouve que é vender_produto', !s3.propostas.length && s3.vistos[0]?.is_error && /vender_produto/.test(s3.vistos[0].content), s3.vistos);
  const s4 = await pedir(cDono, 'lança 30 de um brinde que vendi, não controlo no estoque', [uso('lancar_dinheiro', { tipo: 'entrada', valor: 30, forma: 'pix', categoria: 'Venda de produtos', descricao: 'Brinde', nao_e_do_estoque: true })]);
  T.ok('com nao_e_do_estoque (a pessoa disse que não controla): o cartão de entrada aparece', s4.propostas.length === 1 && s4.propostas[0].ferramenta === 'lancar_dinheiro', s4.vistos);
  const s5 = await pedir(cDono, 'tira 2 mordedores que vendi', [uso('movimentar_estoque', { produto_id: mordedor, tipo: 'saida', quantidade: 2, motivo: 'Venda de 2 mordedores' })]);
  T.ok('saída de estoque com motivo de venda: recusada, manda usar vender_produto', !s5.propostas.length && /vender_produto/.test(s5.vistos[0]?.content || ''), s5.vistos);
  const s5b = await pedir(cDono, 'tira 1 mordedor que estragou', [uso('movimentar_estoque', { produto_id: mordedor, tipo: 'saida', quantidade: 1, motivo: 'Estragou' })]);
  T.ok('saída por outro motivo continua com o cartão de sempre', s5b.propostas.length === 1, s5b.vistos);

  const s5c = await pedir(cDono, 'vendi 1 mordedor', [uso('vender_produto', { itens: [{ produto_nome: 'mordedor', quantidade: 1 }], forma: 'pix' })]);
  T.ok('pelo pedaço do nome ("mordedor") acha o único produto que bate', linhas(s5c)[0] === '1 un de Mordedor de plástico: R$ 100,00', linhas(s5c));

  T.secao('Rita (Caixa) e Edu (só Estoque)');
  const cRita = await contexto('caixa');
  const s6 = await pedir(cRita, 'vendi 1 mordedor no débito', [uso('vender_produto', { itens: [{ produto_id: mordedor, quantidade: 1 }], forma: 'debito' })]);
  T.ok('a Rita vende pelo preço do Estoque (R$ 100)', linhas(s6).includes('1 un de Mordedor de plástico: R$ 100,00'), linhas(s6));
  await confirmar(cRita, s6);
  T.ok('venda da Rita gravada e ligada: saldo 97, 3 vendas', B.num(`select estoque from produtos where id='${mordedor}'`) === 97 && vendasNoEstoque() === 3);
  const s7 = await pedir(cRita, 'vendi um petisco novo a 12', [uso('vender_produto', { itens: [{ produto_nome: 'Petisco de frango', quantidade: 1, preco_unitario: 12 }], forma: 'pix' })]);
  T.ok('produto novo pela Rita (sem Estoque): recusado, é com quem tem o Estoque', !s7.propostas.length && /área Estoque/.test(s7.vistos[0]?.content || ''), s7.vistos);
  const cEdu = await contexto('estoque');
  const s8 = await pedir(cEdu, 'vendi 1 mordedor', [uso('vender_produto', { itens: [{ produto_id: mordedor, quantidade: 1 }] })]);
  T.ok('o Edu vê o cartão sem valores: o dinheiro fica para quem cuida do caixa', linhas(s8).includes('1 un de Mordedor de plástico: sai do estoque') && linhas(s8).includes('Dinheiro: fica para quem cuida do caixa lançar'), linhas(s8));
  await confirmar(cEdu, s8);
  T.ok('baixa como venda, sem lançamento: saldo 96, 4 vendas, nenhum lançamento novo', B.num(`select estoque from produtos where id='${mordedor}'`) === 96 && vendasNoEstoque() === 4
    && B.num(`select count(*) from lancamentos where petshop_id='${P}' and categoria='Venda de produtos'`) === 3);

  T.secao('Pagar depois: fica em A receber, no nome do tutor');
  const ana = L.tutores.Ana;
  const s9 = await pedir(cDono, 'a ana levou 1 mordedor e paga semana que vem', [uso('vender_produto', { itens: [{ produto_id: mordedor, quantidade: 1 }], paga_depois: true, cliente_id: ana })]);
  T.ok('cartão com "Paga depois"', linhas(s9).some((x) => x.startsWith('Paga depois: até ')), linhas(s9));
  await confirmar(cDono, s9);
  T.ok('conta a receber de R$ 100 da Ana, ligada à saída; saldo 95', B.sql(`select l.valor||'/'||l.pago||'/'||l.cliente_id from movimentos_estoque m join lancamentos l on l.id=m.lancamento_id where m.produto_id='${mordedor}' and l.pago=false`) === `100.00/false/${ana}`
    && B.num(`select estoque from produtos where id='${mordedor}'`) === 95);
}))();
