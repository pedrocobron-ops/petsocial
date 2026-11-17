// Unidade: caixa, fiado, comprovante, descontos e pacotes (rodada final das testadoras; migração 20261216). Sem banco.
//   - comprovante (Neide M1): Luna R$ 95, devia R$ 55, pagou Dinheiro 100 + Pix 20 → diz o que foi para o fiado, o total pago,
//     cada forma com o valor e o que ainda deve (antes: "Total R$ 95,00 / Pagamento: Dinheiro"); troco quando entregou a mais.
//   - fiado do caderno (Neide M2): vence no dia anotado ("deve desde"), nunca importação + 7 dias.
//   - De onde veio (Bia M3): diárias 260 + taxa 40 − sinal 78 = 222 → taxa R$ 40,00 (antes 29,60).
//   - desconto em %, promoção de aniversário (janela de 7 dias), pacote com preço por porte, aviso de horário de outro dia.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-caixa-fiado');
const C = lib('comprovante');
const D = lib('dinheiro');
const DS = lib('desconto');
const PR = lib('promocoes');
const PP = lib('pacote-porte');
const DH = lib('dia-do-horario');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const nb = (s) => s.replace(/ /g, ' ');

T.secao('comprovante com o fiado pago junto (Neide M1)');
const luna = {
  petshop: 'Banho e Tosa da Neide', tutor: 'Tutor Teste 3', pet: 'Luna', quando: '2026-11-17T19:30:00Z',
  recebidos: [{ valor: 95, forma: 'dinheiro', pagamentos: null, itens: [{ tipo: 'servico', nome: 'Banho', qtd: 1, valor: 70 }, { tipo: 'servico', nome: 'Hidratação', qtd: 1, valor: 25 }] }],
};
t('pelo horário, depois: o que foi para o fiado, o total pago, cada forma com valor e o que ainda deve', () => {
  const s = nb(C.textoComprovante({ ...luna, antigas: [{ recebido: 25, falta: 30, forma: 'pix', pagamentos: [{ forma: 'dinheiro', valor: 5 }, { forma: 'pix', valor: 20 }] }] }));
  assert.match(s, /Total: R\$ 95,00/);
  assert.match(s, /Pagou R\$ 25,00 do que devia de antes \(R\$ 55,00\); ainda deve R\$ 30,00/);
  assert.match(s, /Total pago agora: R\$ 120,00/);
  assert.match(s, /Pagamento: Dinheiro R\$ 100,00 \+ Pix R\$ 20,00/);
  assert.doesNotMatch(s, /Pagamento: Dinheiro\n/);
});
t('quitou o fiado inteiro: diz quitado', () => {
  const s = nb(C.textoComprovante({ ...luna, antigas: [{ recebido: 55, falta: 0, forma: 'pix' }] }));
  assert.match(s, /Pagou também o que devia de antes: R\$ 55,00 \(quitado\)/);
  assert.match(s, /Pagamento: Dinheiro R\$ 95,00 \+ Pix R\$ 55,00/);
});
t('conta simples em dinheiro com troco: forma com o valor e o troco', () => {
  const s = nb(C.textoComprovante({ ...luna, entregue: 100 }));
  assert.match(s, /Pagamento: Dinheiro R\$ 95,00/);
  assert.match(s, /Recebido em dinheiro: R\$ 100,00 · Troco: R\$ 5,00/);
  assert.doesNotMatch(s, /devia/);
});
t('sem troco (entregou o valor certo): sem a linha', () => {
  assert.doesNotMatch(nb(C.textoComprovante({ ...luna, entregue: 95 })), /Troco/);
});
t('na hora (folha Conta fechada): troco também no comprovante da parte', () => {
  const s = nb(C.textoComprovanteDaParte({ petshop: 'X', tutor: 'Ana', pet: 'Luna', quando: luna.quando, itens: [{ nome: 'Banho', qtd: 1, valor: 95 }], total: 95,
    pago: 150, formas: [{ forma: 'dinheiro', valor: 150 }], falta: 0, antigo: 55, antigoDevia: 55, entregue: 200 }));
  assert.match(s, /Pago agora: R\$ 150,00 \(Dinheiro R\$ 150,00\)/);
  assert.match(s, /Troco: R\$ 50,00/);
});

T.secao('fiado do caderno vence no dia anotado (Neide M2)');
t('com "deve desde": vence nesse dia', () => assert.equal(D.vencimentoDaDivida('2026-11-24', '2026-11-02'), '2026-11-02'));
t('sem "deve desde": o combinado', () => assert.equal(D.vencimentoDaDivida('2026-11-24', null), '2026-11-24'));
t('"deve desde" depois do combinado (não acontece no caderno): fica o combinado', () => assert.equal(D.vencimentoDaDivida('2026-11-10', '2026-11-12'), '2026-11-10'));

T.secao('De onde veio: sinal abate as diárias, a taxa fica inteira (Bia M3)');
t('260 + 40 − 78 = 222: taxa R$ 40,00, diárias R$ 182,00', () => {
  const p = D.partesDoLancamento({ valor: 222, itens: [{ tipo: 'servico', nome: 'Hotel: 2 diárias', qtd: 1, valor: 260 }, { tipo: 'extra', nome: 'Taxa de busca fora do horário', qtd: 1, valor: 40 }, { tipo: 'extra', nome: 'Sinal já pago', qtd: 1, valor: -78 }] });
  assert.deepEqual(p, { servico: 182, produto: 0, extra: 40 });
});
t('conta sem linha negativa: o desconto continua rateado como antes', () => {
  const p = D.partesDoLancamento({ valor: 90, itens: [{ tipo: 'servico', nome: 'Banho', qtd: 1, valor: 80 }, { tipo: 'produto', nome: 'Shampoo', qtd: 1, valor: 20 }] });
  assert.deepEqual(p, { servico: 72, produto: 18, extra: 0 });
});

T.secao('desconto em %');
t('10% de R$ 95,00 = R$ 9,50', () => assert.equal(DS.descontoDoPct(95, 10), 9.5));
t('7,5% de R$ 127,50 arredonda no centavo', () => assert.equal(DS.descontoDoPct(127.5, 7.5), 9.56));
t('o arredondamento nunca passa do teto da trava', () => assert.equal(DS.descontoDoPct(127.5, 5, 6.37), 6.37));
t('vazio ou zero: sem desconto', () => { assert.equal(DS.descontoDoPct(95, null), null); assert.equal(DS.descontoDoPct(95, 0), null); });
t('a % de um desconto em reais', () => assert.equal(DS.pctDoDesconto(95, 9.5), 10));

T.secao('promoção de aniversário do pet');
t('7 dias antes e 7 depois valem; 8 não', () => {
  assert.ok(PR.niverPerto('2021-11-20', '2026-11-13'));
  assert.ok(PR.niverPerto('2021-11-20', '2026-11-27'));
  assert.ok(!PR.niverPerto('2021-11-20', '2026-11-12'));
  assert.ok(!PR.niverPerto('2021-11-20', '2026-11-28'));
});
t('perto da virada do ano e 29/02 em ano comum', () => {
  assert.ok(PR.niverPerto('2020-01-02', '2026-12-29'));
  assert.ok(PR.niverPerto('2020-02-29', '2027-03-06'));
  assert.ok(!PR.niverPerto(null, '2026-11-20'));
});
const promos = [
  { id: 'n', nome: 'Aniversário do pet', dias: [0, 1, 2, 3, 4, 5, 6], hora_de: null, hora_ate: null, servicos: [], tipo: 'pct', valor: 10, comeca_em: null, termina_em: null, ativa: true, banho_tosa: true, casa: [], aniversario: true },
];
const cat = () => 'banho';
t('o horário perto do aniversário ganha; longe, ou sem nascimento, não', () => {
  assert.equal(PR.promoDoHorario(promos, { servicoId: 's', dia: '2026-11-18', hora: '10:00', categoriaDe: cat, nascimento: '2021-11-20' })?.id, 'n');
  assert.equal(PR.promoDoHorario(promos, { servicoId: 's', dia: '2026-12-18', hora: '10:00', categoriaDe: cat, nascimento: '2021-11-20' }), null);
  assert.equal(PR.promoDoHorario(promos, { servicoId: 's', dia: '2026-11-18', hora: '10:00', categoriaDe: cat }), null);
});
t('o texto e o resumo dizem a janela do aniversário', () => {
  const p = PR.lerPromocao({ ...promos[0], aniversario: true });
  assert.match(PR.resumoDaPromo(p, () => null), /Perto do aniversário do pet, de 7 dias antes a 7 dias depois: 10% de desconto/);
  assert.match(PR.textoDaPromocao(p, 'Banho da Neide', () => null), /7 dias antes a 7 dias depois do aniversário/);
});

T.secao('pacote com preço por porte');
const modelo = { preco: 170, precos_porte: { P: 160, M: 180, G: 200 } };
t('vale o preço do porte do pet', () => { assert.equal(PP.precoDoPacote(modelo, 'P'), 160); assert.equal(PP.precoDoPacote(modelo, 'G'), 200); });
t('porte sem preço no modelo, ou pet sem porte: o preço único', () => { assert.equal(PP.precoDoPacote(modelo, 'GG'), 170); assert.equal(PP.precoDoPacote(modelo, null), 170); });
t('sugestão pela tabela: quantidade × o preço do serviço em cada porte', () => assert.deepEqual(PP.sugestaoPorPorte({ preco_p: 45, preco_m: 55, preco_g: null, preco_gg: 80 }, 4), { P: 180, M: 220, GG: 320 }));
t('leitura do banco: só portes válidos, números', () => assert.deepEqual(PP.lerPrecosPorte({ P: '160', X: 5, M: 180.5 }), { P: 160, M: 180.5 }));
t('resumo', () => assert.equal(PP.resumoPorPorte({ G: 200, P: 160 }, (n) => `R$ ${n}`), 'P R$ 160 · G R$ 200'));

T.secao('horário de outro dia (Neide L2)');
t('amanhã: avisa, com o dia', () => {
  const agora = new Date(2026, 10, 17, 16, 0);
  assert.equal(DH.diaQueAindaNaoChegou(new Date(2026, 10, 18, 14, 0), agora), 'amanhã (quarta, 18/11)');
  assert.equal(DH.diaQueAindaNaoChegou(new Date(2026, 10, 20, 9, 0), agora), 'sexta, 20/11');
});
t('hoje (mesmo mais tarde) ou dia que passou: não avisa', () => {
  const agora = new Date(2026, 10, 17, 16, 0);
  assert.equal(DH.diaQueAindaNaoChegou(new Date(2026, 10, 17, 19, 0), agora), null);
  assert.equal(DH.diaQueAindaNaoChegou(new Date(2026, 10, 16, 9, 0), agora), null);
});

T.rodar(async () => {});
