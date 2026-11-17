// Validade e lote, kits e contagem de estoque (migração 20261201):
// - lote e validade na entrada (o mesmo lote soma), a venda tira do lote que vence antes (FEFO) ou do escolhido, o que passa dos
//   lotes sai do "sem lote", saldo corrigido para baixo acompanha nos lotes; produto sem lote igual a antes;
// - Vencendo (estoque_vencendo): quantidades e valor (só para quem vê o financeiro), papéis; baixa como perda num toque
//   (lotes_baixar_perda, motivo "Vencido", mesma chave não tira de novo); a linha do Bom dia só para quem cuida do estoque;
// - kits: saldo = quantos dá para montar, custo = soma (refeito quando um produto muda), venda do kit baixa cada produto
//   (e os lotes), venda desfeita devolve, Quanto sobrou com o custo do kit uma vez só, O que comprar conta os produtos do kit;
// - contagem: começar por categoria, contar, venda no meio, revisar (valor só para quem vê o financeiro), ajustar de uma vez
//   (dois toques ao mesmo tempo ajustam uma vez), histórico com quem e quando, papéis.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('lotes-kits');
const D = lib('dinheiro'), C = lib('compra'), LU = lib('lucro'), BD = lib('bom-dia');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Lotes' });
  const { dono, estoque, tosador, caixa } = L.sb;
  const P = L.P;
  const saldo = (id) => B.num(`select estoque from produtos where id='${id}'`);
  const lote = (id) => B.num(`select coalesce(quantidade, -1) from produtos_lotes where id='${id}'`);
  const novo = async (sb, campos) => B.must(await sb.from('produtos').insert({ petshop_id: P, unidade: 'un', ...campos }).select('id').single(), campos.nome).id;
  const entrada = async (sb, produto, quantidade, extra = {}) =>
    (await D.gravarMovimentos(sb, P, [{ petshop_id: P, produto_id: produto, tipo: 'entrada', quantidade, motivo: 'Compra', chave: D.novaChaveDeOperacao(), ...extra }]))[0];
  const venda = async (sb, produto, nome, qtd, valor, extra = {}) => {
    const chave = D.novaChaveDeOperacao();
    const l = await D.lancarPago(sb, P, { tipo: 'entrada', valor, forma: 'pix', categoria: 'Venda de produtos', chave, itens: [{ tipo: 'produto', nome, qtd, valor: valor / qtd, produto_id: produto }] });
    await D.gravarMovimentos(sb, P, [{ petshop_id: P, produto_id: produto, tipo: 'saida', quantidade: qtd, motivo: 'Venda', lancamento_id: l.id, chave: D.parteDaChave(chave, 'saida'), ...extra }]);
    return l;
  };

  T.secao('validade e lote');
  const sh = await novo(estoque, { nome: 'Shampoo Validade', controla_validade: true, preco_venda: 30 });
  const lido = await tosador.from('produtos').select('id, tipo, controla_validade').eq('id', sh).single();
  T.passa('o tosador lê tipo e "Controlar validade" (permissão por coluna)', lido, lido.data?.controla_validade === true && lido.data?.tipo === 'produto');
  await entrada(estoque, sh, 5, { lote: 'A1', validade: L.dia(10), custo_unitario: 10 });
  await entrada(estoque, sh, 3, { lote: 'B2', validade: L.dia(-2), custo_unitario: 12 });
  await entrada(estoque, sh, 2, { lote: 'b2 ', validade: L.dia(-2), custo_unitario: 12 });
  await entrada(estoque, sh, 4);
  const lA = B.sql(`select id from produtos_lotes where produto_id='${sh}' and lote='A1'`), lB = B.sql(`select id from produtos_lotes where produto_id='${sh}' and lote='B2'`);
  T.ok('saldo 14 (5 + 3 + 2 + 4 sem lote)', saldo(sh) === 14);
  T.ok('lote A1 com 5; o mesmo lote B2 (outra caixa, espaço no fim) somou 5 num lote só', lote(lA) === 5 && lote(lB) === 5 && B.num(`select count(*) from produtos_lotes where produto_id='${sh}'`) === 2);
  T.ok('o custo do lote fica guardado (12,00)', B.num(`select custo_unitario from produtos_lotes where id='${lB}'`) === 12);
  T.recusa('ninguém grava direto nos lotes', await dono.from('produtos_lotes').insert({ petshop_id: P, produto_id: sh, lote: 'X', quantidade: 99 }).select('id'));
  T.ok('… nem lê o custo do lote direto', (await dono.from('produtos_lotes').select('custo_unitario').eq('id', lB)).error);

  await venda(dono, sh, 'Shampoo Validade', 6, 180);
  T.ok('venda de 6: sai do lote que vence antes (B2, 5) e o resto do A1 (1)', lote(lB) === 0 && lote(lA) === 4 && saldo(sh) === 8);
  T.ok('… anotado o que saiu de cada lote', B.sql(`select string_agg(ml.quantidade::text, ',' order by ml.quantidade) from movimentos_lotes ml join movimentos_estoque m on m.id = ml.movimento_id where m.produto_id='${sh}' and m.tipo='saida'`) === '-5.000,-1.000');
  await entrada(estoque, sh, 3, { lote: 'C3', validade: L.dia(40), custo_unitario: 11 });
  const lC = B.sql(`select id from produtos_lotes where produto_id='${sh}' and lote='C3'`);
  await venda(dono, sh, 'Shampoo Validade', 2, 60, { lote_id: lC });
  T.ok('venda com o lote escolhido (C3): sai dele, o A1 fica', lote(lC) === 1 && lote(lA) === 4 && saldo(sh) === 9);
  const outro = await novo(dono, { nome: 'Outro produto', controla_validade: true });
  await entrada(dono, outro, 2, { lote: 'Z', validade: L.dia(5) });
  const lZ = B.sql(`select id from produtos_lotes where produto_id='${outro}'`);
  T.recusa('lote de outro produto é recusado', await dono.from('movimentos_estoque').insert({ petshop_id: P, produto_id: sh, tipo: 'saida', quantidade: 1, motivo: 'Uso no banho', lote_id: lZ }).select('id'), /lote não é deste produto/);
  // saldo 9 = A1 4 + C3 1 + 4 sem lote; corrigido para 3: os lotes acompanham (sobra 3 nos lotes, o A1 que vence antes perde 2)
  B.must(await estoque.from('movimentos_estoque').insert({ petshop_id: P, produto_id: sh, tipo: 'ajuste', quantidade: 3, motivo: 'Contagem' }).select('id'), 'ajuste');
  T.ok('saldo corrigido para 3 (menos que os 5 dos lotes): o A1 fica com 2, o C3 com 1', saldo(sh) === 3 && lote(lA) === 2 && lote(lC) === 1);
  const semLote = await novo(dono, { nome: 'Sem lote' });
  await entrada(dono, semLote, 5);
  await venda(dono, semLote, 'Sem lote', 2, 20);
  T.ok('produto sem lote: igual a antes (5 − 2 = 3, nenhum lote)', saldo(semLote) === 3 && B.num(`select count(*) from produtos_lotes where produto_id='${semLote}'`) === 0);

  T.secao('vencendo e perda');
  await entrada(estoque, sh, 2, { lote: 'D4', validade: L.dia(-1), custo_unitario: 9.5 });
  const lD = B.sql(`select id from produtos_lotes where produto_id='${sh}' and lote='D4'`);
  const v = B.must(await dono.rpc('estoque_vencendo', { p: P, p_dias: 60 }), 'vencendo dono');
  const daShampoo = (v.lotes ?? []).filter((x) => x.produto_id === sh);
  const vD = daShampoo.find((x) => x.lote === 'D4'), vA = daShampoo.find((x) => x.lote === 'A1');
  T.ok('dono: D4 vencido há 1 dia (2 un, R$ 19,00), A1 vence em 10 dias (2 un, R$ 20,00), C3 em 40', vD?.dias === -1 && Number(vD.quantidade) === 2 && Number(vD.valor) === 19
    && vA?.dias === 10 && Number(vA.valor) === 20 && daShampoo.some((x) => x.lote === 'C3' && x.dias === 40) && v.com_valor === true, daShampoo);
  T.ok('lote zerado (B2) não aparece', !daShampoo.some((x) => x.lote === 'B2'));
  const v30 = B.must(await dono.rpc('estoque_vencendo', { p: P, p_dias: 30 }), 'vencendo 30');
  T.ok('em 30 dias: sem o C3', !v30.lotes.some((x) => x.lote === 'C3'));
  const ve = B.must(await estoque.rpc('estoque_vencendo', { p: P }), 'vencendo estoque');
  T.ok('quem cuida do estoque (sem dinheiro) vê as quantidades sem R$', ve.com_valor === false && ve.lotes.length >= 3 && ve.lotes.every((x) => x.valor == null), ve);
  T.recusa('o tosador não vê', await tosador.rpc('estoque_vencendo', { p: P }));
  T.recusa('anônimo não vê', await B.cliente().rpc('estoque_vencendo', { p: P }));
  const bdE = B.must(await estoque.rpc('gestao_bom_dia', { p: P }), 'bom dia estoque');
  // por produto: o shampoo tem um lote vencido (D4) e um vencendo (A1); o outro produto vence em 5 dias (Z)
  T.ok('Bom dia de quem cuida do estoque: 1 produto vencido e 2 vencendo em 30 dias', bdE.validade?.vencidos === 1 && bdE.validade?.vencendo === 2, bdE);
  const linhas = BD.linhasDoBomDia(bdE, { horario: null, agora: new Date() });
  T.ok('… a linha do cartão', linhas.some((l) => l.id === 'validade' && /1 produto vencido/.test(l.texto) && /2 vencem em até 30 dias/.test(l.texto)), linhas);
  const bdT = B.must(await tosador.rpc('gestao_bom_dia', { p: P }), 'bom dia tosador');
  T.ok('o tosador (sem estoque) não recebe a validade', !('validade' in bdT));
  T.recusa('o tosador não dá baixa', await tosador.rpc('lotes_baixar_perda', { p_petshop: P, p_lotes: [lD], p_chave: D.novaChaveDeOperacao() }));
  const ch = D.novaChaveDeOperacao();
  const [b1, b2] = await Promise.all([estoque.rpc('lotes_baixar_perda', { p_petshop: P, p_lotes: [lD, lZ], p_chave: ch }), estoque.rpc('lotes_baixar_perda', { p_petshop: P, p_lotes: [lD, lZ], p_chave: ch })]);
  T.ok('baixa como perda (dois toques ao mesmo tempo): o lote zera uma vez', !b1.error && !b2.error && lote(lD) === 0 && lote(lZ) === 0 && saldo(sh) === 3 && saldo(outro) === 0, [b1.error?.message, b2.error?.message, saldo(sh)]);
  T.ok('… uma saída "Vencido" por lote, com o lote', B.num(`select count(*) from movimentos_estoque where petshop_id='${P}' and motivo='Vencido'`) === 2
    && B.num(`select count(*) from movimentos_estoque where petshop_id='${P}' and motivo='Vencido' and lote_id is not null`) === 2);
  // a do outro produto não tem custo nem preço (R$ 0,00): não vira anotação
  T.ok('… e a perda do shampoo (2 × 9,50) fica anotada para o dono (Alterações em valores)', B.num(`select count(*) from precos_alterados where petshop_id='${P}' and tipo='estoque_saida' and item like '%Shampoo Validade (Vencido)%' and de = 19`) === 1);
  B.must(await estoque.rpc('lotes_baixar_perda', { p_petshop: P, p_lotes: [lD], p_chave: ch }), 'de novo');
  T.ok('a mesma chave de novo não tira outra vez', B.num(`select count(*) from movimentos_estoque where petshop_id='${P}' and motivo='Vencido'`) === 2);
  const movsC = await C.lerMovimentosDaCompra(dono, P);
  const anC = C.analisarCompra([{ id: sh, nome: 'Shampoo Validade', unidade: 'un', estoque: 3, estoque_minimo: 0, criado_em: new Date(Date.now() - 90 * 864e5).toISOString() }], movsC);
  T.ok('O que comprar: a perda "Vencido" fica à parte (2), vendido 8', anC.linhas[0].perdido === 2 && anC.linhas[0].vendido === 8, anC.linhas[0]);

  T.secao('kits');
  const s = await novo(dono, { nome: 'Shampoo Kit', custo: 12.35, preco_venda: 25 });
  const c = await novo(dono, { nome: 'Condicionador Kit', custo: 9.99, preco_venda: 22, controla_validade: true });
  await entrada(dono, s, 10, { custo_unitario: 12.35 });
  await entrada(dono, c, 4, { lote: 'C-1', validade: L.dia(20), custo_unitario: 9.99 });
  await entrada(dono, c, 3, { lote: 'C-0', validade: L.dia(5), custo_unitario: 9.99 });
  const kit = await novo(estoque, { nome: 'Kit banho em casa', tipo: 'kit', preco_venda: 55, estoque: 50 });
  T.ok('kit nasce com saldo zero (o que foi mandado não vale)', saldo(kit) === 0);
  T.recusa('o tosador não monta o kit', await tosador.rpc('kit_definir_itens', { p_kit: kit, p_itens: [{ componente_id: s, quantidade: 1 }] }));
  const kit2 = await novo(dono, { nome: 'Kit de kit', tipo: 'kit' });
  T.recusa('kit não entra em outro kit', await dono.rpc('kit_definir_itens', { p_kit: kit2, p_itens: [{ componente_id: kit, quantidade: 1 }] }));
  T.passa('quem cuida do estoque monta: 1 shampoo + 2 condicionadores', await estoque.rpc('kit_definir_itens', { p_kit: kit, p_itens: [{ componente_id: s, quantidade: 1 }, { componente_id: c, quantidade: 2 }] }));
  const custoKit = () => B.num(`select coalesce(custo, -1) from produtos where id='${kit}'`);
  T.ok('saldo do kit = quantos dá para montar: min(10, 7 / 2) = 3', saldo(kit) === 3);
  T.ok('custo do kit = 12,35 + 2 × 9,99 = 32,33', custoKit() === 32.33);
  T.recusa('kit não muda para produto', await dono.from('produtos').update({ tipo: 'produto' }).eq('id', kit).select('id'));
  T.recusa('kit não tem saldo próprio para corrigir', await dono.from('movimentos_estoque').insert({ petshop_id: P, produto_id: kit, tipo: 'ajuste', quantidade: 5 }).select('id'), /kit não tem saldo próprio/i);
  T.recusa('kit não recebe entrada de compra', await dono.from('movimentos_estoque').insert({ petshop_id: P, produto_id: kit, tipo: 'entrada', quantidade: 5, motivo: 'Compra' }).select('id'), /Kit não recebe entrada/);

  const vk = await venda(caixa, kit, 'Kit banho em casa', 2, 110);
  T.ok('venda de 2 kits: shampoo 10 − 2 = 8, condicionador 7 − 4 = 3, kit = min(8, 1) = 1', saldo(s) === 8 && saldo(c) === 3 && saldo(kit) === 1);
  T.ok('… o condicionador sai do lote que vence antes (C-0: 3, depois C-1: 1)', B.num(`select quantidade from produtos_lotes where produto_id='${c}' and lote='C-0'`) === 0 && B.num(`select quantidade from produtos_lotes where produto_id='${c}' and lote='C-1'`) === 3);
  T.ok('… a saída do kit fica ligada à venda com o custo do kit (32,33); as dos produtos não se ligam', B.num(`select custo_unitario from movimentos_estoque where produto_id='${kit}' and lancamento_id='${vk.id}'`) === 32.33
    && B.num(`select count(*) from movimentos_estoque where kit_movimento_id is not null and lancamento_id is null and petshop_id='${P}'`) === 2);
  const fim = L.hoje;
  const lu = LU.montarLucro(B.must(await dono.rpc('lucro_do_periodo', { p_petshop: P, p_de: L.mes1, p_ate: fim }), 'lucro'));
  const lk = lu.produtos.find((p) => p.nome === 'Kit banho em casa');
  T.ok('Quanto sobrou: o kit com receita 110,00 e custo 64,66 (o custo dos produtos do kit uma vez só)', lk && B.centavos(lk.receita) === 11000 && B.centavos(lk.custo) === 6466, lk);
  T.ok('… o shampoo e o condicionador do kit não viram linha de venda', !lu.produtos.some((p) => p.nome === 'Shampoo Kit' || p.nome === 'Condicionador Kit'));
  const cv = B.must(await dono.rpc('custos_das_vendas', { p: P, p_de: L.mes1, p_ate: fim }), 'custos_das_vendas');
  T.ok('Vendas por produto: as saídas dos produtos do kit não aparecem como venda solta', !cv.some((x) => x.produto_id === s || x.produto_id === c));
  const movs = await C.lerMovimentosDaCompra(dono, P);
  const prods = [s, c, kit].map((id, i) => ({ id, nome: ['Shampoo Kit', 'Condicionador Kit', 'Kit banho em casa'][i], unidade: 'un', estoque: saldo(id), estoque_minimo: 0, criado_em: new Date(Date.now() - 90 * 864e5).toISOString(), tipo: i === 2 ? 'kit' : 'produto' }));
  const an = C.analisarCompra(prods, movs);
  T.ok('O que comprar: o kit fica de fora e os produtos do kit contam (shampoo 2, condicionador 4 vendidos)', !an.linhas.some((l) => l.produto.id === kit)
    && an.linhas.find((l) => l.produto.id === s)?.vendido === 2 && an.linhas.find((l) => l.produto.id === c)?.vendido === 4, an.linhas.map((l) => [l.produto.nome, l.vendido]));
  T.ok('… e o valor em estoque não conta o kit duas vezes', C.analisarCompra(prods.map((p) => ({ ...p, custo: p.id === kit ? 32.33 : p.id === s ? 12.35 : 9.99 })), movs).valorEmEstoque === 128.77); // 8 × 12,35 + 3 × 9,99
  B.must(await dono.from('produtos').update({ custo: 10 }).eq('id', c).select('id'), 'custo do condicionador');
  T.ok('custo de um produto muda: o kit acompanha (12,35 + 20,00 = 32,35)', custoKit() === 32.35);
  const desf = await D.desfazerVenda(dono, P, vk);
  T.ok('venda do kit desfeita: os produtos voltam (shampoo 10, condicionador 7, kit 3)', !desf.erroEstoque && saldo(s) === 10 && saldo(c) === 7 && saldo(kit) === 3, desf);

  T.secao('contagem');
  B.sql(`update produtos set categoria='Higiene' where id in ('${s}','${c}','${kit}')`);
  T.recusa('o tosador não começa contagem', await tosador.rpc('contagem_iniciar', { p_petshop: P, p_categoria: 'Higiene', p_fornecedor: null, p_chave: D.novaChaveDeOperacao() }));
  const chC = D.novaChaveDeOperacao();
  const cid = B.must(await estoque.rpc('contagem_iniciar', { p_petshop: P, p_categoria: 'higiene', p_fornecedor: null, p_chave: chC }), 'iniciar');
  T.ok('mesma chave devolve a mesma contagem', B.must(await estoque.rpc('contagem_iniciar', { p_petshop: P, p_categoria: 'Higiene', p_fornecedor: null, p_chave: chC }), 'de novo') === cid);
  T.ok('só os produtos da categoria, sem o kit (2)', B.num(`select count(*) from contagens_itens where contagem_id='${cid}'`) === 2);
  T.recusa('ninguém lê a tabela direto', await dono.from('contagens').select('id').eq('id', cid).then((r) => (r.data?.length ? r : { error: { message: 'sem acesso' } })));
  B.must(await estoque.rpc('contagem_marcar', { p_contagem: cid, p_itens: [{ produto_id: s, contado: 9 }, { produto_id: c, contado: 8 }] }), 'marcar');
  B.must(await estoque.rpc('contagem_status', { p_contagem: cid, p_status: 'pausada' }), 'pausar');
  T.ok('pausada', B.sql(`select status from contagens where id='${cid}'`) === 'pausada');
  B.must(await estoque.rpc('contagem_status', { p_contagem: cid, p_status: 'aberta' }), 'continuar');
  // uma venda de shampoo entre a contagem e o ajuste: o que saiu depois de contar não some
  await venda(dono, s, 'Shampoo Kit', 1, 25);
  const rv = B.must(await dono.rpc('contagem_ler', { p_contagem: cid }), 'revisão dono');
  const iS = rv.itens.find((x) => x.produto_id === s), iC = rv.itens.find((x) => x.produto_id === c);
  T.ok('revisão: shampoo −1 (−R$ 12,35), condicionador +1 (+R$ 10,00), saldo de agora 9', Number(iS.diferenca) === -1 && Number(iS.valor) === -12.35 && Number(iC.diferenca) === 1 && Number(iC.valor) === 10 && Number(iS.saldo) === 9, rv.itens);
  const rvE = B.must(await estoque.rpc('contagem_ler', { p_contagem: cid }), 'revisão estoque');
  T.ok('quem cuida do estoque (sem dinheiro) vê a revisão sem R$', rvE.com_valor === false && rvE.itens.every((x) => x.valor == null && x.custo == null));
  T.recusa('o tosador não ajusta', await tosador.rpc('contagem_ajustar', { p_contagem: cid }));
  const [a1, a2] = await Promise.all([estoque.rpc('contagem_ajustar', { p_contagem: cid }), estoque.rpc('contagem_ajustar', { p_contagem: cid })]);
  T.ok('Ajustar estoque (dois toques ao mesmo tempo): 2 ajustes, uma vez só', !a1.error && !a2.error && [a1.data.ajustados, a2.data.ajustados].join() === '2,2'
    && [a1.data.repetido, a2.data.repetido].sort().join() === 'false,true', [a1.error?.message, a2.error?.message, a1.data, a2.data]);
  T.ok('shampoo: 9 de agora − 1 = 8; condicionador 7 + 1 = 8; kit = min(8, 4) = 4', saldo(s) === 8 && saldo(c) === 8 && saldo(kit) === 4);
  T.ok('dois movimentos "Contagem" (saldo corrigido)', B.num(`select count(*) from movimentos_estoque where petshop_id='${P}' and tipo='ajuste' and motivo='Contagem' and produto_id in ('${s}','${c}')`) === 2);
  const lista = B.must(await dono.rpc('contagens_lista', { p: P }), 'histórico');
  const h = lista.find((x) => x.id === cid);
  T.ok('histórico: quem começou, quem ajustou, quando, 2 ajustados e −R$ 2,35 para o dono', h?.status === 'concluida' && h.criado_por_nome === 'Edu Estoque' && h.concluida_por_nome === 'Edu Estoque'
    && h.concluida_em && h.ajustados === 2 && Number(h.diferenca_valor) === -2.35 && h.contados === 2, h);
  T.ok('… sem R$ para quem cuida do estoque', B.must(await estoque.rpc('contagens_lista', { p: P }), 'lista estoque').every((x) => x.diferenca_valor == null));
  T.recusa('contagem concluída não muda', await estoque.rpc('contagem_marcar', { p_contagem: cid, p_itens: [{ produto_id: s, contado: 1 }] }), /concluída/);
  const L2 = await criarLoja(null, { nome: 'Lotes outra', equipe: false, dados: false });
  T.depois(() => L2.limpar());
  T.recusa('a dona de outra loja não lê a contagem', await L2.sb.dono.rpc('contagem_ler', { p_contagem: cid }));
  T.recusa('… nem a validade', await L2.sb.dono.rpc('estoque_vencendo', { p: P }));
}))();
