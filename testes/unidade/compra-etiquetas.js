// Sugestão de compra e códigos de barras das etiquetas, sem banco:
// - `codigo-barras.ts`: EAN-13 só com 13 números e dígito certo (senão Code 128); vetores conhecidos (conferidos com um leitor de
//   verdade, zxing-cpp, ao escrever) e um decodificador escrito aqui, com a tabela do EAN em larguras (independente da do app),
//   que lê de volta o que o app desenha; tabela do Code 128 conferida (11 módulos, barras pares, 107 símbolos diferentes).
// - `compra.ts`: a conta feita à mão (média por semana, mínimo, caixa, venda desfeita, perda à parte, sem vendas, parados, valor).
const { lib } = require('../lib/app');
const T = require('../lib/teste')('compra-etiquetas');
const C = lib('codigo-barras');
const K = lib('compra');

const { modulos, lerEan13, lerCode128 } = require('../lib/barras');
const ler = (d) => (d.tipo === 'ean13' ? lerEan13(modulos(d)) : lerCode128(modulos(d)));

(async () => T.rodar(async () => {
  T.secao('código de barras');
  T.ok('EAN-13: 4006381333931 e 7891234567895 valem; 7891234567890 (dígito errado) e 12 números não', C.ean13Valido('4006381333931') && C.ean13Valido('7891234567895') && !C.ean13Valido('7891234567890') && !C.ean13Valido('789123456789'));
  T.ok('dígito verificador: 400638133393 → 1; 789123456789 → 5', C.digitoEan13('400638133393') === 1 && C.digitoEan13('789123456789') === 5);
  const tab = C.CODE128.slice(0, 106);
  T.ok('tabela do Code 128: 106 símbolos de 11 módulos com barras pares, mais o fim de 13; todos diferentes',
    tab.length === 106 && tab.every((p) => p.length === 6 && [...p].reduce((a, b) => a + Number(b), 0) === 11 && (Number(p[0]) + Number(p[2]) + Number(p[4])) % 2 === 0)
    && C.CODE128[106] === '2331112' && new Set(C.CODE128).size === 107);
  T.ok('Code 128 de MP000001 (conta à mão): início B, M, P, troca para C, 00 00 01, verificador 33 (548 % 103), fim',
    JSON.stringify(C.simbolosCode128('MP000001')) === JSON.stringify([104, 45, 48, 99, 0, 0, 1, 33, 106]));
  T.ok('Code 128 de 7891234567890: o 7 no B e o resto em pares no C, verificador 43 (2412 % 103)',
    JSON.stringify(C.simbolosCode128('7891234567890')) === JSON.stringify([104, 23, 99, 89, 12, 34, 56, 78, 90, 43, 106]));
  const e = C.desenhoDoCodigo('4006381333931');
  T.ok('desenho do EAN-13 4006381333931 = o vetor conferido com leitor de verdade (113 módulos com as margens)', e.tipo === 'ean13' && e.largura === 113
    && modulos(e) === '00000000000101000110101001110101111011110100010010110011010101000010100001010000101110100100001011001101010000000');
  const mp = C.desenhoDoCodigo('MP000001');
  T.ok('desenho do Code 128 MP000001 = o vetor conferido com leitor de verdade', mp.tipo === 'code128'
    && modulos(mp) === '0000000000110100100001011101100011101110110101110111101101100110011011001100110011011001010001100011000111010110000000000');
  const casos = ['4006381333931', '7891234567895', '7896183901234', '7891234567890', 'MP000001', 'MP000123', 'MP999999', '12345', 'ABC-123 xyz', '1234567890123456', 'a1', '9', '00', 'X1234Y', '123456789', 'SKU 77/B'];
  const lidos = casos.map((c) => { const d = C.desenhoDoCodigo(c); return { c, tipo: d && d.tipo, lido: d && ler(d) }; });
  T.ok('o decodificador daqui lê de volta todos os códigos desenhados (EAN-13 os válidos, Code 128 os outros)',
    lidos.every((x) => x.lido === x.c && x.tipo === (C.ean13Valido(x.c) ? 'ean13' : 'code128')), lidos.filter((x) => x.lido !== x.c));
  T.ok('código com acento não é desenhado (o app avisa para corrigir)', C.desenhoDoCodigo('Ração1') === null && C.desenhoDoCodigo('') === null);

  T.secao('sugestão de compra (conta à mão)');
  const agora = new Date('2026-11-17T15:00:00Z');
  const atras = (dias) => new Date(agora.getTime() - dias * 864e5).toISOString();
  const prod = (id, nome, o) => ({ id, nome, unidade: 'un', estoque: 0, estoque_minimo: 0, criado_em: atras(100), embalagem_qtd: null, fornecedor_id: null, custo: null, ...o });
  const P = [
    prod('a', 'Ração Golden 15 kg', { estoque: 4, estoque_minimo: 3, custo: 100 }),
    prod('b', 'Petisco', { estoque: 5, embalagem_qtd: 12, custo: 3 }),
    prod('c', 'Shampoo', { estoque: 2, estoque_minimo: 2, embalagem_qtd: 6 }),
    prod('d', 'Coleira', { estoque: 3, custo: 10 }),
    prod('e', 'Brinquedo novo', { criado_em: atras(10) }),
    prod('f', 'Areia', { unidade: 'kg', estoque: 10, custo: 2 }),
  ];
  const mov = (produto_id, tipo, quantidade, motivo, dias) => ({ produto_id, tipo, quantidade, motivo, criado_em: atras(dias) });
  const M = [
    // A: 21 vendidos em 6 semanas (7 vendas de 3), 10 há 50 dias (só entra em 8 semanas), uma perda de 2 e um saldo corrigido
    ...[2, 7, 13, 19, 25, 31, 38].map((d) => mov('a', 'saida', 3, 'Venda', d)), mov('a', 'saida', 10, 'Venda', 50),
    mov('a', 'saida', 2, 'Perda ou vencido', 5), mov('a', 'ajuste', 40, 'Contagem', 3), mov('a', 'entrada', 12, 'Compra', 20),
    // B: 9 em 6 semanas
    mov('b', 'saida', 4, 'Venda', 3), mov('b', 'saida', 5, 'Venda', 30),
    // C: 4 vendidos, 1 devolvido (venda desfeita), 2 usados no banho
    mov('c', 'saida', 4, 'Venda', 4), mov('c', 'entrada', 1, 'Venda desfeita', 3), mov('c', 'saida', 2, 'Uso no banho', 10),
    // E: 2 vendidos nos 10 dias desde o cadastro
    mov('e', 'saida', 2, 'Venda', 1),
    // F: só perda (não é venda nem uso)
    mov('f', 'saida', 3, 'Perda ou vencido', 20),
  ];
  const a = K.analisarCompra(P, M, { agora, semanasPeriodo: 6, semanasCobrir: 2 });
  const de = (id) => a.linhas.find((l) => l.produto.id === id);
  const A = de('a');
  T.ok('Ração: 21 em 6 semanas = 3,5 por semana; para 2 semanas 7 + mínimo 3 = 10; tem 4: comprar 6', A.estado === 'comprar' && A.porSemana === 3.5 && A.sugestao === 6 && A.caixas === null && A.perdido === 2, A);
  T.ok('… explicado: "Vendeu em média 3,5 por semana nas últimas 6 semanas (21 no total). Para 2 semanas: 7 + mínimo 3 = 10. Tem 4: faltam 6. Comprar 6 unidades."',
    A.explicacao.startsWith('Vendeu em média 3,5 por semana nas últimas 6 semanas (21 no total). Para 2 semanas: 7 + mínimo 3 = 10. Tem 4: faltam 6. Comprar 6 unidades.') && /Perda ou vencido no período: 2 unidades \(fora da média\)/.test(A.explicacao), A.explicacao);
  T.ok('… dá para 1,1 semanas (4 ÷ 3,5); a perda e o saldo corrigido ficam fora da média', K.textoDasSemanas(A.semanasRestam) === '1,1 semanas' && A.vendido === 21);
  const B8 = K.analisarCompra(P, M, { agora, semanasPeriodo: 8, semanasCobrir: 2 }).linhas.find((l) => l.produto.id === 'a');
  T.ok('olhando 8 semanas, a venda de 50 dias entra: 31 ÷ 8 = 3,875 por semana', Math.abs(B8.porSemana - 3.875) < 1e-9 && /nas últimas 8 semanas/.test(B8.explicacao), B8.explicacao);
  const Bp = de('b');
  T.ok('Petisco: 1,5 por semana, tem 5 para 2 semanas (3): não precisa comprar, dá para 3,3 semanas', Bp.estado === 'suficiente' && Bp.sugestao === 0 && K.textoDasSemanas(Bp.semanasRestam) === '3,3 semanas' && /Não precisa comprar agora/.test(Bp.explicacao), Bp.explicacao);
  const B4 = K.analisarCompra(P, M, { agora, semanasPeriodo: 6, semanasCobrir: 4 }).linhas.find((l) => l.produto.id === 'b');
  T.ok('Petisco para 4 semanas: 6 − 5 = falta 1, vem em caixa de 12: 1 caixa = 12', B4.estado === 'comprar' && B4.sugestao === 12 && B4.caixas === 1 && /Vem em caixa de 12: 1 caixa = 12/.test(B4.explicacao), B4.explicacao);
  const Cs = de('c');
  T.ok('Shampoo: 4 vendidos − 1 desfeita + 2 usados = 5 em 6 semanas; 2 semanas 1,7 + mínimo 2 = 3,7; tem 2: 1 caixa de 6',
    Cs.vendido === 3 && Cs.usado === 2 && Cs.sugestao === 6 && Cs.caixas === 1 && /^Saiu em média 0,8 por semana nas últimas 6 semanas \(3 vendidos e 2 usados\)\. Para 2 semanas: 1,7 \+ mínimo 2 = 3,7\./.test(Cs.explicacao), Cs.explicacao);
  const D = de('d');
  T.ok('Coleira sem saída: "sem vendas recentes", sem sugestão', D.estado === 'sem_vendas' && D.sugestao === null && D.porSemana === null && /^Sem vendas recentes/.test(D.explicacao));
  const E = de('e');
  T.ok('Brinquedo cadastrado há 10 dias: 2 em 10 dias = 1,4 por semana; 2,8 para 2 semanas: comprar 3', E.dias === 10 && Math.abs(E.porSemana - 1.4) < 1e-9 && E.sugestao === 3 && /nos 10 dias desde que o produto foi cadastrado/.test(E.explicacao), E.explicacao);
  const F = de('f');
  T.ok('Areia só com perda: sem vendas recentes, a perda à parte', F.estado === 'sem_vendas' && F.perdido === 3 && a.perdas.some((x) => x.produto.id === 'f' && x.quantidade === 3) && a.perdas.some((x) => x.produto.id === 'a' && x.quantidade === 2));
  T.ok('ordem: para comprar primeiro (quem acaba antes em cima), depois os que dão, depois sem vendas',
    a.linhas.map((l) => l.produto.id).join('') === 'eacbfd', a.linhas.map((l) => l.produto.id));
  T.ok('parados há 60+ dias: Coleira e Areia (com saldo, nada saiu; perda não conta como saída)', a.parados.map((p) => p.id).join(',') === 'f,d', a.parados.map((p) => p.nome));
  T.ok('acabando: Shampoo (no mínimo) e Brinquedo (zerado); a Ração dá para mais de 1 semana', a.acabando.map((l) => l.produto.id).sort().join(',') === 'c,e', a.acabando.map((l) => l.produto.nome));
  T.ok('valor em estoque = custo × quantidade: 4×100 + 5×3 + 3×10 + 10×2 = 465; parado 30 + 20 = 50; 1 com saldo sem custo',
    a.valorEmEstoque === 465 && a.valorParado === 50 && a.semCusto === 1, { v: a.valorEmEstoque, p: a.valorParado, s: a.semCusto });
  T.ok('arredondar: 0,2 → 1; 13 com caixa de 12 → 24 (2 caixas); nada faltando → 0', K.arredondarCompra(0.2).quantidade === 1 && K.arredondarCompra(13, 12).quantidade === 24 && K.arredondarCompra(13, 12).caixas === 2 && K.arredondarCompra(-1, 6).quantidade === 0);
  T.ok('perda pelo motivo: "Perda ou vencido", "venceu", "embalagem rasgada"; "Venda" e "Uso no banho" não', K.ehPerda('Perda ou vencido') && K.ehPerda('venceu') && K.ehPerda('embalagem rasgada') && !K.ehPerda('Venda') && !K.ehPerda('Uso no banho'));

  T.secao('kits e contagem (migração 20261201)');
  {
    const agora = new Date(2026, 10, 17, 12, 0);
    const antes = new Date(2026, 6, 1).toISOString();
    const P = [{ id: 's', nome: 'Shampoo', unidade: 'un', estoque: 8, estoque_minimo: 0, criado_em: antes, custo: 12.35 },
      { id: 'k', nome: 'Kit banho', unidade: 'un', estoque: 4, estoque_minimo: 0, criado_em: antes, custo: 32.33, tipo: 'kit' }];
    const M = [{ produto_id: 's', tipo: 'saida', quantidade: 2, motivo: 'Venda', criado_em: new Date(2026, 10, 10).toISOString() },
      { produto_id: 'k', tipo: 'saida', quantidade: 2, motivo: 'Venda', criado_em: new Date(2026, 10, 10).toISOString() }];
    const a = K.analisarCompra(P, M, { agora });
    T.ok('O que comprar deixa o kit de fora (a venda dele já conta nos produtos do kit) e não soma o valor do kit (8 × 12,35 = 98,80)',
      a.linhas.map((l) => l.produto.id).join() === 's' && a.linhas[0].vendido === 2 && a.valorEmEstoque === 98.8, a);
  }
  {
    const CT = lib('contagem');
    const item = (x) => ({ produto_id: x.id, nome: x.id, unidade: 'un', categoria: null, codigo_barras: null, saldo: x.saldo, contado: x.contado ?? null, esperado: x.esperado ?? null,
      contado_em: null, contado_por_nome: null, diferenca: x.contado == null ? null : x.contado - x.esperado, custo: x.custo ?? null, valor: null, ajustado_de: null, ajustado_para: null });
    const itens = [item({ id: 'a', saldo: 9, contado: 9, esperado: 10, custo: 12.35 }), item({ id: 'b', saldo: 7, contado: 8, esperado: 7, custo: 9.99 }), item({ id: 'c', saldo: 5, custo: 1.1 }), item({ id: 'd', saldo: 2 })];
    const t1 = CT.totaisDaContagem(itens);
    T.ok('contagem: diferença sobre o esperado (−1 e +1), valor ao centavo (−12,35 + 9,99 = −2,36)',
      CT.diferencaDoItem(itens[0]) === -1 && [t1.contados, t1.comDiferenca, t1.sobra, t1.falta, t1.valor].join() === '2,2,1,1,-2.36', t1);
    // na tela, ainda não mandado: c contado 2 (saldo de agora 5: −3 × 1,10 = −3,30), d contado 3 sem custo
    const t2 = CT.totaisDaContagem(itens, new Map([['c', 2], ['d', 3]]));
    T.ok('contagem: o que está só na tela compara com o saldo de agora (−2,36 − 3,30 = −5,66; 1 sem custo)',
      [t2.contados, t2.comDiferenca, t2.valor, t2.semCusto, t2.faltamContar].join() === '4,4,-5.66,1,0', t2);
    const csv = CT.linhasDaPlanilha({ status: 'aberta', com_valor: false, itens });
    T.ok('contagem: planilha sem colunas de R$ para quem não vê o financeiro', csv[0].join('|') === 'Produto|Categoria|Unidade|Saldo no sistema|Contado|Diferença|Contado por'
      && csv[1].join('|') === 'a||un|10|9|-1|', csv.slice(0, 2));
  }
}))();
