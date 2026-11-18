// Unidade: rodada 8, experiência de quem está começando (estreante).
//   - preço no cartão do pedido pelo link (precoDoPedido): porte M do banho = R$ 50,00; sem porte, "R$ 40,00 a R$ 70,00, conforme o porte";
//     um preço só; hotel com a diária (e a do porte); creche; dia de experiência sem preço (tem a etiqueta dele); sem preço, nada.
//   - Mozart anota na ficha do pet (anotacaoDoPet): entra no fim do que já estava, nada some; repetido é recusado; não cabe, recusa.
//   - modo simples (foraNoModoSimples): desligado não tira nada; ligado tira Relatórios, Escola e o Caixa (só sem venda de produtos).
//   - a mesma conta no guia e na tela Hoje (textoFaltam).
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-estreante-m');
const P = lib('preco-do-pedido');
const F = lib('assistente/ferramentas');
const M = lib('modo-simples');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const nb = (s) => (s == null ? s : s.replace(/ /g, ' '));

T.secao('preço no cartão do pedido pelo link');
const banho = { preco_p: 40, preco_m: 50, preco_g: 70, preco_gg: null };
t('banho porte M: R$ 50,00 (estreante L4: "Bolinha · porte M / Banho" sem o valor)', () => assert.equal(nb(P.precoDoPedido({ tipo: 'servico', porte: 'M' }, banho, {})), 'R$ 50,00'));
t('sem porte e o preço muda com o porte: a faixa', () => assert.equal(nb(P.precoDoPedido({ tipo: 'servico', porte: null }, banho, {})), 'R$ 40,00 a R$ 70,00, conforme o porte'));
t('porte sem preço (GG): a faixa e o aviso', () => assert.match(nb(P.precoDoPedido({ tipo: 'servico', porte: 'GG' }, banho, {})), /sem preço para o porte GG/));
t('um preço só: o preço', () => assert.equal(nb(P.precoDoPedido({ porte: null }, { preco_p: 90, preco_m: 90, preco_g: 90, preco_gg: 90 }, {})), 'R$ 90,00'));
t('milhar com ponto', () => assert.equal(nb(P.precoDoPedido({ porte: 'P' }, { preco_p: 1250.5, preco_m: null, preco_g: null, preco_gg: null }, {})), 'R$ 1.250,50'));
t('serviço sem preço: nada', () => assert.equal(P.precoDoPedido({ porte: 'M' }, { preco_p: null, preco_m: null, preco_g: null, preco_gg: null }, {}), null));
t('hotel: a diária; com diária por porte, a do porte', () => {
  assert.equal(nb(P.precoDoPedido({ tipo: 'hotel', porte: 'G' }, null, { diaria_hotel: 120 })), 'R$ 120,00 a diária');
  assert.equal(nb(P.precoDoPedido({ tipo: 'hotel', porte: 'G' }, null, { diaria_hotel: 120, diariaHotelDoPorte: 150 })), 'R$ 150,00 a diária');
});
t('creche: a diária; dia de experiência: nada (tem a etiqueta e o preço dele)', () => {
  assert.equal(nb(P.precoDoPedido({ tipo: 'creche' }, null, { diaria_creche: 70 })), 'R$ 70,00 a diária');
  assert.equal(P.precoDoPedido({ tipo: 'creche', experiencia: true }, null, { diaria_creche: 70 }), null);
});

T.secao('Mozart anota na ficha do pet');
t('alertas vazios: fica só o novo', () => assert.deepEqual(F.anotacaoDoPet({ alertas: null }, { onde: 'alertas', texto: 'Morde. Cuidado ao secar.' }), { onde: 'alertas', novo: 'Morde. Cuidado ao secar.', fica: 'Morde. Cuidado ao secar.' }));
t('já tinha texto: o novo vai no fim, com ponto, sem apagar', () => assert.equal(F.anotacaoDoPet({ alertas: 'Alergia a shampoo' }, { onde: 'alertas', texto: 'Morde' }).fica, 'Alergia a shampoo. Morde'));
t('observações vão para obs', () => assert.equal(F.anotacaoDoPet({ obs: 'Gosta de laço.' }, { onde: 'observacoes', texto: 'Tutor busca às 17h' }).fica, 'Gosta de laço. Tutor busca às 17h'));
t('já anotado (sem acento, maiúscula): recusa', () => assert.throws(() => F.anotacaoDoPet({ alertas: 'Morde. Cuidado AO SECAR.' }, { onde: 'alertas', texto: 'cuidado ao secar' }), /já está anotado/));
t('vazio: pergunta', () => assert.throws(() => F.anotacaoDoPet({}, { onde: 'alertas', texto: ' ' }), /Falta o que anotar/));
t('onde errado: recusa', () => assert.throws(() => F.anotacaoDoPet({}, { onde: 'nome', texto: 'Bob' }), /alertas ou observacoes/));
t('não cabe (alertas até 400): recusa, nada cortado', () => assert.throws(() => F.anotacaoDoPet({ alertas: 'x'.repeat(390) }, { onde: 'alertas', texto: 'Morde muito' }), /Não cabe/));
t('a ferramenta existe, grava (cartão) e não é de dinheiro', () => {
  const d = F.FERRAMENTAS.find((x) => x.name === 'anotar_no_pet');
  assert.ok(d && d.grava === true && !d.financeiro);
  assert.deepEqual(d.input_schema.required, ['pet_id', 'onde', 'texto']);
});

T.secao('modo simples');
const loja = { modulos: ['banho_tosa', 'loja'] }, so = { modulos: ['banho_tosa'] };
t('desligado (chave ausente, pet shop de antes): nada sai do menu', () => {
  for (const h of ['/gestao/app/relatorios', '/gestao/app/escola', '/gestao/app/caixa']) assert.equal(M.foraNoModoSimples(so, h), false);
});
t('ligado: Relatórios e Escola saem; Agenda, Financeiro e Hoje ficam', () => {
  const p = { ...so, opcoes: { 'geral.modo_simples': true } };
  assert.equal(M.modoSimples(p), true);
  assert.equal(M.foraNoModoSimples(p, '/gestao/app/relatorios'), true);
  assert.equal(M.foraNoModoSimples(p, '/gestao/app/escola'), true);
  for (const h of ['/gestao/app', '/gestao/app/agenda', '/gestao/app/financeiro', '/gestao/app/clientes']) assert.equal(M.foraNoModoSimples(p, h), false);
});
// rodada 9: o Caixa fica no menu para todos (quem recebe em dinheiro precisa dele no primeiro dia, para a gaveta bater)
t('ligado: o Caixa continua no menu, com ou sem venda de produtos', () => {
  assert.equal(M.foraNoModoSimples({ ...so, opcoes: { 'geral.modo_simples': true } }, '/gestao/app/caixa'), false);
  assert.equal(M.foraNoModoSimples({ ...loja, opcoes: { 'geral.modo_simples': true } }, '/gestao/app/caixa'), false);
});
t('valor estranho na chave: desligado', () => assert.equal(M.modoSimples({ opcoes: { 'geral.modo_simples': 'sim' } }), false));

T.secao('uma conta só para os primeiros passos');
const PP = lib('primeiros-passos');
t('Faltam 2 / Falta 1 / Tudo pronto', () => {
  assert.equal(PP.textoFaltam(2), 'Faltam 2 coisas para começar');
  assert.equal(PP.textoFaltam(1), 'Falta 1 coisa para começar');
  assert.equal(PP.textoFaltam(0), 'Tudo pronto para começar');
});

T.rodar(async () => {});
