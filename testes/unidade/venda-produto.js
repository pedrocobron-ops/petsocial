// Venda de produto que bate com o Estoque, sem banco:
//  - venda-solta.ts: a entrada escrita à mão em Venda de produtos (sem produto escolhido) é "venda solta"; o aviso diz se o item
//    está no Estoque pela descrição ("Venda de 2 mordedores" acha "Mordedor de plástico"; "10 pacotes de ração" acha "Ração Golden").
//  - Mozart: vender_produto existe, grava com cartão e vai para quem tem Caixa, Financeiro ou Estoque (não para o tosador);
//    lancar_dinheiro em Venda de produtos é recusado (a não ser com nao_e_do_estoque); o cartão da venda (resumoDaVendaDeProduto);
//    as instruções mandam usar vender_produto e nunca a saída de estoque mais o lançamento soltos.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-venda-produto');
const VS = lib('venda-solta');
const F = lib('assistente/ferramentas');
const V = lib('assistente/ferramenta-venda');
const I = lib('assistente/instrucoes');
const SN = lib('assistente/sem-nomes');
const A = lib('acessos');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const nb = (s) => String(s).replace(/[  ]/g, ' ');

T.secao('Venda escrita à mão no Caixa');
const produtos = [{ id: '1', nome: 'Mordedor de plástico resistente' }, { id: '2', nome: 'Ração Golden Adulto 15 kg' }, { id: '3', nome: 'Shampoo neutro' }];
t('entrada em Venda de produtos sem produto é venda solta; com produto escolhido, não', () => {
  assert.equal(VS.ehVendaSolta({ tipo: 'entrada', categoria: 'Venda de produtos' }), true);
  assert.equal(VS.ehVendaSolta({ tipo: 'entrada', categoria: 'Venda de produtos', itens: [{ tipo: 'produto', nome: 'Mordedor', produto_id: '1' }] }), false);
  assert.equal(VS.ehVendaSolta({ tipo: 'entrada', categoria: 'Banho e tosa' }), false);
  assert.equal(VS.ehVendaSolta({ tipo: 'saida', categoria: 'Venda de produtos' }), false);
});
t('a descrição acha o produto pelo começo do nome (plural, acento e números não atrapalham)', () => {
  assert.equal(VS.produtoCitado('Venda de 2 mordedores', produtos)?.id, '1');
  assert.equal(VS.produtoCitado('Venda de 10 pacotes de ração a R$ 100', produtos)?.id, '2');
  assert.equal(VS.produtoCitado('shampoo', produtos)?.id, '3');
  assert.equal(VS.produtoCitado('Venda de produtos', produtos), null);
  assert.equal(VS.produtoCitado('Coleira azul', produtos), null);
  assert.equal(VS.produtoCitado('', produtos), null);
});
t('o aviso: produto do Estoque (o saldo não baixa) ou item fora do Estoque', () => {
  const a = VS.avisoDaVendaSolta({ nome: 'Mordedor de plástico' });
  assert.equal(a.titulo, 'Mordedor de plástico está no Estoque');
  assert.match(a.texto, /saldo não baixa.*Venda no balcão/);
  const b = VS.avisoDaVendaSolta(null);
  assert.equal(b.titulo, 'Este item não está no Estoque');
  assert.match(b.texto, /estoque não muda/);
});

T.secao('Mozart: vender_produto');
const nomes = (c) => F.ferramentasPara(c).map((f) => f.name);
t('vender_produto grava com cartão', () => assert.equal(F.definicao('vender_produto')?.grava, true));
t('vai para o dono, para quem só tem o Caixa e para quem só tem o Estoque; não para o tosador', () => {
  assert.ok(nomes({ vejoFinanceiro: true, areas: A.areasDe({ papel: 'dono' }), dono: true }).includes('vender_produto'));
  assert.ok(nomes({ vejoFinanceiro: true, areas: ['caixa'] }).includes('vender_produto'));
  assert.ok(nomes({ vejoFinanceiro: false, areas: ['estoque'] }).includes('vender_produto'));
  assert.ok(!nomes({ vejoFinanceiro: false, areas: ['agenda', 'clientes'] }).includes('vender_produto'));
});
t('lancar_dinheiro em Venda de produtos é recusado e manda usar vender_produto', () => {
  assert.throws(() => F.conferirSeEVendaDeProduto({ tipo: 'entrada', categoria: 'Venda de produtos', valor: 1000 }), /vender_produto/);
  assert.throws(() => F.conferirSeEVendaDeProduto({ tipo: 'entrada', categoria: 'venda de produtos' }), /vender_produto/);
});
t('com nao_e_do_estoque, em outra categoria ou numa saída, passa', () => {
  F.conferirSeEVendaDeProduto({ tipo: 'entrada', categoria: 'Venda de produtos', nao_e_do_estoque: true });
  F.conferirSeEVendaDeProduto({ tipo: 'entrada', categoria: 'Outros' });
  F.conferirSeEVendaDeProduto({ tipo: 'saida', categoria: 'Venda de produtos' });
});
t('o cartão: valor de cada item, total, forma, saldo e o preço que o produto ganha', () => {
  const r = V.resumoDaVendaDeProduto({ recebe: true, total: 200, forma: 'pix', parcelas: null, cliente: null, pagaDepois: false, vencimento: null,
    itens: [{ produto: { id: 'x', nome: 'Mordedor', unidade: 'un', tipo: 'produto', saldo: 100, precoAntes: null }, qtd: 2, preco: 100, novo: false, poePreco: true }] });
  const l = r.linhas.map(([k, v]) => `${k}: ${nb(v)}`);
  assert.equal(r.titulo, 'Vender produto');
  assert.deepEqual(l, ['2 un de Mordedor: R$ 200,00 (R$ 100,00 cada)', 'Total: R$ 200,00', 'Forma: Pix', 'Estoque de Mordedor: 100 → 98 un', 'Preço no Estoque: Mordedor estava sem preço: fica R$ 100,00 por un']);
});
t('produto novo: diz que cadastra e que o saldo fica negativo; crédito em 3x; quem não recebe não vê valor', () => {
  const novo = { produto: { id: null, nome: 'Ração', unidade: 'pacote', tipo: 'produto', saldo: 0, precoAntes: null }, qtd: 10, preco: 100, novo: true, poePreco: false };
  const r = V.resumoDaVendaDeProduto({ recebe: true, total: 1000, forma: 'credito', parcelas: 3, cliente: { id: 'c', nome: 'Ana' }, pagaDepois: false, vencimento: null, itens: [novo] });
  const l = r.linhas.map(([k, v]) => `${k}: ${nb(v)}`);
  assert.ok(l.includes('10 pacote de Ração (novo no Estoque): R$ 1.000,00 (R$ 100,00 cada)'), l);
  assert.ok(l.includes('Forma: Crédito em 3x') && l.includes('Cliente: Ana'), l);
  assert.ok(l.some((x) => x.startsWith('Cadastra no Estoque: Ração, R$ 100,00 por pacote. O saldo fica em -10 pacote')), l);
  const sem = V.resumoDaVendaDeProduto({ recebe: false, total: 0, forma: null, parcelas: null, cliente: null, pagaDepois: false, vencimento: null,
    itens: [{ ...novo, novo: false, produto: { ...novo.produto, id: 'r', saldo: 4 }, qtd: 1 }] }).linhas.map(([k, v]) => `${k}: ${nb(v)}`);
  assert.deepEqual(sem, ['1 pacote de Ração: sai do estoque', 'Estoque de Ração: 4 → 3 pacote', 'Dinheiro: fica para quem cuida do caixa lançar']);
});
t('as instruções mandam usar vender_produto e nunca a saída e o lançamento soltos', () => {
  assert.match(I.INSTRUCOES, /vender_produto, num cartão só/);
  assert.match(I.INSTRUCOES, /Nunca venda um produto com movimentar_estoque \(saída\) e lancar_dinheiro separados/);
  assert.match(I.INSTRUCOES, /ofereça cadastrar/);
});
t('o nome vender_produto nunca aparece para a pessoa', () => assert.equal(SN.semNomesDeFerramenta('Confira vender_produto no cartão.'), 'Confira a venda do produto no cartão.'));

T.rodar(async () => {});
