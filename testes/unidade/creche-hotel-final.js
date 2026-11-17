// Unidade: creche e hotel, rodada final dos testadores (Rafael e Bia). Sem banco.
//   - regra de cancelamento do sinal (destinoPelaRegra, textoDaRegra, sinalDe) e hora do hotel (horasDoHotel);
//   - táxi pet na cobrança (taxiDaCobranca, partesDosExtras, textoDoTaxiDaCobranca, mensagemDeCobranca com o táxi e a chave Pix do hotel);
//   - checklist de entrada: "remédio e remédio da artrose" virou "remédio da artrose"; texto padrão sem banho num hotel só;
//   - fotos: "Saiu uma foto" no singular; exemplo das regras do link num hotel só; "veio hoje" no Bom dia quando a hora já passou;
//   - indicadores: valor médio pelas contas contadas (sem o sinal como conta) e cancelamentos com as reservas.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-creche-hotel-final');
const HO = lib('hotel-opcoes');
const CR = lib('creche');
const EN = lib('entrada');
const TU = lib('tutor');
const LO = lib('link-opcoes');
const BD = lib('bom-dia');
const IN = lib('indicadores');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const nb = (s) => s.replace(/[\u00a0\u202f]/g, ' ');

T.secao('sinal: regra de cancelamento');
const regra = { dias: 7, perto: 'credito', longe: 'devolver' };
t('3 dias antes: vira crédito; 10 dias antes: devolve; no dia: crédito', () => {
  assert.equal(HO.destinoPelaRegra(regra, 3), 'credito');
  assert.equal(HO.destinoPelaRegra(regra, 10), 'devolver');
  assert.equal(HO.destinoPelaRegra(regra, 7), 'devolver');
  assert.equal(HO.destinoPelaRegra(regra, 0), 'credito');
});
t('sem regra, nada vem marcado', () => {
  assert.equal(HO.destinoPelaRegra({ dias: null, perto: null, longe: null }, 3), null);
  assert.equal(HO.destinoPelaRegra({ dias: 7, perto: null, longe: 'devolver' }, 3), null);
});
t('texto da regra', () => assert.equal(HO.textoDaRegra(regra), 'Cancelou com menos de 7 dias da entrada: o sinal vira crédito do tutor. Com 7 dias ou mais: o sinal é devolvido.'));
t('sinalDe lê a regra guardada (e ignora lixo)', () => {
  const s = HO.sinalDe({ opcoes: { 'hotel.sinal': { ativo: true, modo: 'pct', valor: 30, cancela: { dias: 7.4, perto: 'credito', longe: 'xyz' } } } });
  assert.deepEqual(s.cancela, { dias: 7, perto: 'credito', longe: null });
  assert.deepEqual(HO.sinalDe({ opcoes: {} }).cancela, { dias: null, perto: null, longe: null });
});
t('hora de entrada e de saída do hotel', () => {
  assert.deepEqual(HO.horasDoHotel({ opcoes: { 'hotel.horas': { entrada: '14:00', saida: '12:00' } } }), { entrada: '14:00', saida: '12:00' });
  assert.deepEqual(HO.horasDoHotel({ opcoes: { 'hotel.horas': { entrada: '25:00', saida: 'x' } } }), { entrada: null, saida: null });
});

T.secao('táxi pet na cobrança');
const cobranca = {
  id: 'c1', mes: '2026-12-01', valor_mensal: 1190, valor_cheio: 1190, desconto: 0, desconto_irmao: 0, acerto_saida: false, total: 1325, vencimento: '2026-12-05',
  extras: [{ dia: '2026-11-20', valor: 95 }],
  taxas: [{ dia: '2026-11-16', valor: 30 }, { dia: '2026-11-17', valor: 35, tipo: 'taxi' }, { dia: '2026-11-18', valor: 35, tipo: 'taxi' }],
  valor_extras: 195, lancamentos: null, pets: { id: 'p', nome: 'Bolt', foto: null, especie: 'cao', clientes: { id: 't', nome: 'Rafael', telefone: '11999990000' } },
};
t('as taxas de busca ficam sem o táxi; o táxi tem os seus dias', () => {
  assert.deepEqual(CR.taxasDaCobranca(cobranca), [{ dia: '2026-11-16', valor: 30 }]);
  assert.equal(CR.taxiDaCobranca(cobranca).dias.length, 2);
  assert.deepEqual(CR.partesDosExtras(cobranca), { dias: 95, taxas: 30, taxi: 70 });
});
t('táxi fixo do mês', () => {
  const c = { ...cobranca, taxas: [{ dia: '2026-12-01', valor: 150, tipo: 'taxi_mes' }], valor_extras: 150 };
  assert.equal(CR.taxiDaCobranca(c).mes, 150);
  assert.equal(CR.textoDoTaxiDaCobranca(c), 'táxi pet do mês');
});
t('a mensagem de cobrança diz o táxi com os dias e usa a chave Pix do hotel quando a de cobrança está vazia', () => {
  const m = nb(CR.mensagemDeCobranca({ tutor: 'Rafael', petshop: 'Creche', cobrancas: [cobranca], hoje: '2026-12-01', opcoes: { opcoes: { 'hotel.pix': 'pix@creche.com' } } }));
  assert.match(m, /táxi pet 2 dias \(17\/11 e 18\/11\) R\$ 70,00/);
  assert.match(m, /1 taxa de busca fora do horário \(16\/11\) R\$ 30,00/);
  assert.match(m, /Chave Pix: pix@creche\.com/);
});
t('linhas do extrato com o táxi', () => {
  const l = CR.linhasDaCobrancaDoPet(cobranca);
  assert.ok(l.some((x) => /^Táxi pet 2 dias/.test(x.nome) && x.valor === 70));
});

T.secao('checklist de entrada');
t('"Remédio" marcado e "remédio da artrose" escrito: não repete a palavra', () => {
  assert.equal(EN.textoDevolver({ pertences: ['coleira', 'guia', 'remedio'], pertences_outros: 'remédio da artrose' }), 'Devolver: coleira, guia e remédio da artrose');
  assert.equal(EN.textoDevolver({ pertences: ['coleira', 'remedio'], pertences_outros: 'casinha azul' }), 'Devolver: coleira, remédio e casinha azul');
});
t('texto padrão sem banho e tosa num hotel só', () => {
  assert.doesNotMatch(EN.termoPadraoPara({ modulos: ['hotel'] }), /banho|secagem|tosa/);
  assert.match(EN.termoPadraoPara({ modulos: ['banho_tosa', 'hotel'] }), /banho, a secagem, a tosa ou a estadia/);
  assert.match(EN.termoPadraoPara({ modulos: null }), /banho/);
});

T.secao('textos');
t('"Saiu uma foto" no singular', () => {
  assert.match(TU.mensagemDasFotos({ tutor: 'Bia', petshop: 'Hotelzinho', pet: 'Bob', fotos: 1, url: 'x' }), /Saiu uma foto de Bob hoje/);
  assert.match(TU.mensagemDasFotos({ tutor: 'Bia', petshop: 'Hotelzinho', pet: 'Bob', fotos: 3, url: 'x' }), /Saíram 3 fotos de Bob hoje/);
});
t('exemplo das regras do link num hotel só não fala em horário de banho', () => {
  assert.doesNotMatch(LO.exemploDeRegras({ modulos: ['hotel'] }), /novo horário/);
  assert.equal(LO.exemploDeRegras({ modulos: ['banho_tosa'] }), LO.EXEMPLO_DE_REGRAS);
});
t('Bom dia: quem deve e já chegou "veio hoje"', () => {
  const dados = { dia: '2026-11-17', devem: [{ tutor: 'Tutor Teste 2', valor: 590, pets: ['Bolt'], quando: '2026-11-17T19:01:00Z' }] };
  const antes = BD.linhasDoBomDia(dados, { horario: null, agora: new Date('2026-11-17T12:00:00Z') }).find((l) => l.id === 'devem');
  const depois = BD.linhasDoBomDia(dados, { horario: null, agora: new Date('2026-11-17T20:00:00Z') }).find((l) => l.id === 'devem');
  assert.match(antes.texto, /e vem hoje com Bolt/);
  assert.match(depois.texto, /e veio hoje com Bolt/);
});

T.secao('indicadores');
const mes = (x) => ({ mes: '2026-11', de: '2026-11-01', ate: '2026-11-17', faturamento: 1495, entradas: 1495, saiu: 0, resultado: 1495, taxas: 0, resultado_depois_taxas: 1495, valor_medio: null,
  contas: 2, atendimentos: 0, faltas: 0, cancelados: 0, marcados: 0, estadias_creche: 1, estadias_hotel: 0, clientes: 1, primeira_vez: 1, voltaram: 0, ...x });
const ind = (m) => ({ de: '2026-11-01', ate: '2026-11-17', dinheiro: true, meses: [mes(m)], clientes: 1, primeira_vez: 1, retorno_60: { clientes: 1, voltaram: 0 }, servicos: [], produtos: [], mapa: [] });
t('valor médio pelas contas contadas: 895 ÷ 2 = 447,50 (o recebido em parte não entra)', () => {
  assert.equal(IN.totaisIndicadores(ind({ valor_contas: 895 })).valorMedio, 447.5);
});
t('banco antigo (sem valor_contas): como antes, faturamento ÷ contas', () => assert.equal(IN.totaisIndicadores(ind({})).valorMedio, 747.5));
t('cancelamentos somam as reservas da creche e do hotel', () => {
  const x = IN.totaisIndicadores(ind({ cancelados: 1, marcados: 4, estadias_canceladas: 2, estadias_marcadas: 6 }));
  assert.equal(x.cancelados, 3); assert.equal(x.marcados, 10); assert.equal(x.reservasCanceladas, 2);
});

T.rodar(async () => {});
