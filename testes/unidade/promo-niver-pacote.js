// Unidade: as contas da promoção (src/lib/gestao/promocoes.ts), o aniversário do tutor (aniversario.ts) e os textos do pacote
// acabando (pacote-acabando.ts). As mesmas contas do banco (promo_do_horario, promo_desconto, niver_no_dia), sem banco.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-promo-niver-pacote');
const PR = lib('promocoes');
const AN = lib('aniversario');
const PA = lib('pacote-acabando');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

const cat = (id) => ({ banho: 'banho', unhas: 'outro', creche: 'creche' })[id];
// 2026-11-17 é terça (2)
const terca = { id: 'p1', nome: 'Terça do banho', dias: [2, 3], hora_de: null, hora_ate: '11:00', servicos: ['banho'], tipo: 'pct', valor: 10, comeca_em: null, termina_em: '2026-12-20', ativa: true, criado_em: '2026-11-01T10:00:00Z' };
const manha = { id: 'p2', nome: 'Manhã', dias: [2], hora_de: '08:00', hora_ate: '10:00', servicos: [], tipo: 'reais', valor: 10, comeca_em: null, termina_em: null, ativa: true, criado_em: '2026-11-02T10:00:00Z' };

T.secao('qual promoção vale');
t('terça 09:00, banho: as duas valem; no banho de R$ 60, 10% (R$ 6) perde para R$ 10', () =>
  assert.equal(PR.promoDoHorario([terca, manha], { servicoId: 'banho', dia: '2026-11-17', hora: '09:00', preco: 60, categoriaDe: cat })?.id, 'p2'));
t('no banho de R$ 150, 10% (R$ 15) ganha', () =>
  assert.equal(PR.promoDoHorario([terca, manha], { servicoId: 'banho', dia: '2026-11-17', hora: '09:00', preco: 150, categoriaDe: cat })?.id, 'p1'));
t('11:00 já é fora do "antes das 11h"', () => assert.equal(PR.promoDoHorario([terca], { servicoId: 'banho', dia: '2026-11-17', hora: '11:00', preco: 60, categoriaDe: cat }), null));
t('"todos do banho e tosa" pega o corte de unhas (outro) e não a creche', () => {
  assert.equal(PR.promoDoHorario([manha], { servicoId: 'unhas', dia: '2026-11-17', hora: '09:00', categoriaDe: cat })?.id, 'p2');
  assert.equal(PR.promoDoHorario([manha], { servicoId: 'creche', dia: '2026-11-17', hora: '09:00', categoriaDe: cat }), null);
});
t('quinta: nenhuma; depois do fim (21/12, segunda... terça 22/12): nenhuma', () => {
  assert.equal(PR.promoDoHorario([terca], { servicoId: 'banho', dia: '2026-11-19', hora: '09:00', categoriaDe: cat }), null);
  assert.equal(PR.promoDoHorario([terca], { servicoId: 'banho', dia: '2026-12-22', hora: '09:00', categoriaDe: cat }), null);
});
t('desligada não vale; criada depois do horário não vale', () => {
  assert.equal(PR.promoDoHorario([{ ...terca, ativa: false }], { servicoId: 'banho', dia: '2026-11-17', hora: '09:00', categoriaDe: cat }), null);
  assert.equal(PR.promoDoHorario([terca], { servicoId: 'banho', dia: '2026-11-17', hora: '09:00', categoriaDe: cat, criadoAte: '2026-10-01T00:00:00Z' }), null);
});

T.secao('quanto tira da conta');
const linha = (valor, servicoId, qtd = 1) => ({ tipo: 'servico', valor, qtd, servicoId });
t('10% no banho (principal, sem servico_id) de R$ 65,50: R$ 6,55', () => assert.equal(PR.descontoDaPromo(terca, [linha(65.5)], 'banho', cat), 6.55));
t('só os serviços da promoção entram: banho 60 + unhas 15 → 10% de 60', () => assert.equal(PR.descontoDaPromo(terca, [linha(60), linha(15, 'unhas')], 'banho', cat), 6));
t('R$ 10 em todos: uma vez no horário, até a soma (unhas R$ 8 → R$ 8)', () => {
  assert.equal(PR.descontoDaPromo(manha, [linha(60), linha(15, 'unhas')], 'banho', cat), 10);
  assert.equal(PR.descontoDaPromo(manha, [linha(8, 'unhas')], null, cat), 8);
});
t('produto e extra não entram; promoção tirada não tira nada', () => {
  assert.equal(PR.descontoDaPromo(terca, [{ tipo: 'produto', valor: 30, qtd: 1 }, { tipo: 'extra', valor: 20, qtd: 1 }], 'banho', cat), 0);
  assert.equal(PR.descontoDaPromo({ ...terca, tirada: true }, [linha(60)], 'banho', cat), 0);
});
t('"de R$ 60 por R$ 54" e as etiquetas', () => {
  assert.equal(PR.precoComPromo(terca, 60), 54);
  assert.equal(PR.precoComPromo(manha, 8), 0);
  assert.equal(PR.etiquetaPromo(terca), '10% off');
  assert.equal(PR.etiquetaPromo(manha), 'R$ 10 off');
  assert.equal(PR.linhaDaPromo(terca), 'Promoção Terça do banho −10%');
});

T.secao('textos da promoção (sem "só hoje")');
const nomeDe = (id) => ({ banho: 'Banho' })[id];
t('resumo e texto para copiar', () => {
  assert.equal(PR.resumoDaPromo(terca, nomeDe), 'Terça e quarta, antes das 11h: 10% de desconto em banho.');
  assert.equal(PR.textoDaPromocao(terca, 'Banho da Neide', nomeDe), 'Banho da Neide: terça e quarta, antes das 11h, tem 10% de desconto em banho. Vale até 20/12. Quer marcar um horário? É só responder esta mensagem.');
  assert.equal(PR.textoDaPromocao(manha, 'Banho da Neide', nomeDe), 'Banho da Neide: terça, das 8h às 10h, tem R$ 10 de desconto em banho e tosa. Quer marcar um horário? É só responder esta mensagem.');
  assert.doesNotMatch(PR.textoDaPromocao(terca, 'X', nomeDe), /só hoje|últim|corra/i);
});
t('dias por extenso', () => {
  assert.equal(PR.diasPorExtenso([1, 2, 3, 4, 5]), 'de segunda a sexta');
  assert.equal(PR.diasPorExtenso([0, 6]), 'sábado e domingo');
  assert.equal(PR.diasPorExtenso([0, 1, 2, 3, 4, 5, 6]), 'todos os dias');
});

T.secao('aniversário do tutor');
t('sem o ano guarda 1904; com o ano, o ano', () => {
  assert.deepEqual(AN.montarNascimento(14, 3, null), { valor: '1904-03-14' });
  assert.deepEqual(AN.montarNascimento(14, 3, 1980), { valor: '1980-03-14' });
  assert.deepEqual(AN.montarNascimento(null, null, null), { valor: null });
});
t('29/02 sem ano cabe; 31/04 e 29/02/1981 não existem; ano no futuro recusado', () => {
  assert.equal(AN.montarNascimento(29, 2, null).valor, '1904-02-29');
  assert.match(AN.montarNascimento(31, 4, null).erro, /não existe/);
  assert.match(AN.montarNascimento(29, 2, 1981).erro, /não existe/);
  assert.match(AN.montarNascimento(1, 1, 2999, new Date(2026, 10, 17)).erro, /ano/);
});
t('por extenso: só dia e mês quando não tem o ano', () => {
  assert.equal(AN.nascimentoPorExtenso('1904-03-14'), '14 de março');
  assert.equal(AN.nascimentoPorExtenso('1980-03-14'), '14 de março de 1980');
});
t('29/02: no dia 28 em ano que não é bissexto', () => {
  assert.equal(AN.fazAniversario('1904-02-29', new Date(2027, 1, 28)), true);
  assert.equal(AN.fazAniversario('1904-02-29', new Date(2028, 1, 28)), false);
  assert.equal(AN.fazAniversario('1904-02-29', new Date(2028, 1, 29)), true);
  assert.equal(AN.diaNoMes('1904-02-29', 2, 2027), 28);
});

T.secao('pacote acabando');
const base = { nome: 'Pacote 4 banhos', total: 4, usados: 3, vence_em: '2026-11-20', acabou_em: null, dias: 3, pet: { id: 'x', nome: 'Thor', sexo: 'M', foto: null, especie: 'cao' }, tutor: { id: 't', nome: 'Ana Souza', telefone: '11988880001', nao_quer: false } };
t('as frases e os números (1 uso, 7 dias, 30 dias)', () => {
  assert.equal(PA.PACOTE_USOS_NO_FIM, 1); assert.equal(PA.PACOTE_VENCENDO_DIAS, 7); assert.equal(PA.PACOTE_ACABOU_DIAS, 30);
  assert.equal(PA.fraseDoPacote({ ...base, motivo: 'ultimo' }), 'falta 1 uso e vence em 3 dias');
  assert.equal(PA.fraseDoPacote({ ...base, motivo: 'acabou', usados: 4, acabou_em: '2026-11-10' }), 'usou os 4 (acabou em 10/11)');
  assert.equal(PA.fraseDoPacote({ ...base, motivo: 'vencido', usados: 2, vence_em: '2026-11-12', dias: -5 }), 'venceu em 12/11 com 2 usos sobrando');
});
t('o texto de oferecer renovar diz só o que é verdade', () => {
  assert.equal(PA.textoOferecerRenovar({ ...base, motivo: 'vencendo', dias: 1 }, 'Banho da Neide'), 'Oi, Ana! Aqui é Banho da Neide. O pacote 4 banhos de Thor vence amanhã. Quer renovar para continuar? É só responder aqui que a gente já deixa separado.');
  assert.equal(PA.textoOferecerRenovar({ ...base, motivo: 'acabou' }, 'Banho da Neide'), 'Oi, Ana! Aqui é Banho da Neide. O pacote 4 banhos de Thor chegou ao fim. Quer renovar para continuar? É só responder aqui que a gente já deixa separado.');
  assert.equal(PA.linkRenovar('abc'), '/gestao/app/pacotes?renovar=abc');
});

T.rodar(async () => {});
