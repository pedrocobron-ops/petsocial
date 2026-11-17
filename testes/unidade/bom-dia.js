// Unidade: o "Bom dia" do Mozart (src/lib/gestao/bom-dia.ts) e a prévia da autorização das fotos (src/lib/gestao/fotos-redes.ts).
// Bom dia: no máximo 3 linhas, a ordem (dia, quem deve, vacina, pacote, aniversário), o buraco na agenda (funcionamento, almoço,
// agora), só "agenda livre" não vira cartão, frases com do/da. Fotos: o @ arrumado igual ao banco e a frase trocada.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-bom-dia');
const BD = lib('bom-dia');
const FR = lib('fotos-redes');
const sp = (x) => x.replace(/\u00a0/g, ' ');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

// uma terça-feira às 09:00 no fuso da máquina (o executor põe America/Sao_Paulo)
const agora = new Date(2026, 10, 17, 9, 0);
const em = (h, m = 0) => new Date(2026, 10, 17, h, m).toISOString();
const HORARIO = { 2: { abre: '08:00', fecha: '18:00' } };
const HORARIO_ALMOCO = { 2: { abre: '08:00', fecha: '18:00', almoco: { de: '12:00', ate: '13:00' } } };

T.secao('buraco na agenda');
t('primeiro tempo livre de 1 h depois de agora: 11:00 às 14:00', () =>
  assert.deepEqual(BD.buracoNaAgenda(HORARIO, [[em(9), em(10)], [em(10), em(11)], [em(14), em(15)], [em(15), em(18)]], agora), { de: '11:00', ate: '14:00' }));
t('o almoço conta como ocupado: 11:00 às 12:00', () =>
  assert.deepEqual(BD.buracoNaAgenda(HORARIO_ALMOCO, [[em(9), em(11)], [em(13), em(18)]], agora), { de: '11:00', ate: '12:00' }));
t('agenda cheia até fechar: nenhum buraco', () =>
  assert.equal(BD.buracoNaAgenda(HORARIO, [[em(8), em(18)]], agora), null));
t('dia em que não abre: nenhum buraco', () =>
  assert.equal(BD.buracoNaAgenda({ 2: null }, [], agora), null));
t('meio tempo livre menor que 1 h não conta', () =>
  assert.equal(BD.buracoNaAgenda(HORARIO, [[em(9), em(10)], [em(10, 30), em(18)]], agora), null));

T.secao('linhas');
const cheio = {
  dia: '2026-11-17',
  agenda: [[em(9), em(10)], [em(14), em(15)]],
  casa: { em_casa: 3, chegam: 1, saem: 2 },
  devem: [{ tutor: 'Ana Souza', valor: 75, quando: em(9), pets: ['Thor'] }],
  vacinas: [{ pet: 'Mel', sexo: 'F', nome: 'V10', tipo: 'vacina', vence_em: '2026-11-20' }],
  pacotes: [{ pet: 'Bob', sexo: 'M', nome: 'Pacote 4 banhos', quando: em(14) }],
  niver: [{ pet: 'Luna', sexo: 'F', vem: false }],
};
t('no máximo 3 linhas, nesta ordem: o dia, quem deve, vacina', () => {
  const l = BD.linhasDoBomDia(cheio, { horario: HORARIO, agora, nomeDaCasa: 'Creche e hotel' });
  assert.equal(l.length, 3);
  assert.deepEqual(l.map((x) => x.id), ['dia', 'devem', 'vacinas']);
});
t('a linha do dia: horários, primeiro, buraco e a casa', () => {
  const [d] = BD.linhasDoBomDia(cheio, { horario: HORARIO, agora, nomeDaCasa: 'Creche e hotel' });
  assert.equal(d.texto, 'Hoje: 2 horários na agenda, o primeiro às 09:00; livre das 10:00 às 14:00. Creche e hotel: 3 pets (1 chega e 2 saem hoje).');
});
t('quem deve: nome, valor, pet e hora', () =>
  assert.equal(sp(BD.linhasDoBomDia(cheio, { horario: HORARIO, agora })[1].texto), 'Ana Souza deve R$ 75,00 e vem hoje com Thor às 09:00. Bom momento para acertar.'));
t('vacina: "A vacina V10 da Mel vence em 20/11, e ela vem hoje."', () =>
  assert.equal(BD.linhasDoBomDia(cheio, { horario: HORARIO, agora })[2].texto, 'A vacina V10 da Mel vence em 20/11, e ela vem hoje.'));
t('sem dinheiro (o banco não manda "devem"): entra o pacote no lugar', () => {
  const { devem, ...semDinheiro } = cheio;
  const l = BD.linhasDoBomDia(semDinheiro, { horario: HORARIO, agora });
  assert.deepEqual(l.map((x) => x.id), ['dia', 'vacinas', 'pacotes']);
  assert.equal(l[2].texto, 'Bob usa hoje a última vez do pacote 4 banhos: boa hora para oferecer a renovação.');
  assert.ok(!l.some((x) => /R\$/.test(x.texto)));
});
t('aniversário: "Hoje é aniversário da Luna."', () => {
  const l = BD.linhasDoBomDia({ dia: '2026-11-17', niver: [{ pet: 'Luna', sexo: 'F', vem: true }] }, { horario: HORARIO, agora });
  assert.deepEqual(l.map((x) => x.texto), ['Hoje é aniversário da Luna, e ela vem hoje.']);
});
t('vacina vencida: "venceu em"', () =>
  assert.match(BD.linhasDoBomDia({ dia: '2026-11-17', vacinas: [{ pet: 'Rex', sexo: 'M', nome: 'Antirrábica', tipo: 'vacina', vence_em: '2026-11-10' }] }, { horario: HORARIO, agora })[0].texto, /^A vacina Antirrábica do Rex venceu em 10\/11, e ele vem hoje\.$/));
t('só a agenda vazia: nenhum cartão', () =>
  assert.deepEqual(BD.linhasDoBomDia({ dia: '2026-11-17', agenda: [], casa: { em_casa: 0, chegam: 0, saem: 0 }, devem: [], vacinas: [], niver: [] }, { horario: HORARIO, agora }), []));
t('agenda vazia com aniversário: "Hoje: agenda livre." vem primeiro', () =>
  assert.deepEqual(BD.linhasDoBomDia({ dia: '2026-11-17', agenda: [], niver: [{ pet: 'Bob', sexo: 'M', vem: false }] }, { horario: HORARIO, agora }).map((x) => x.texto), ['Hoje: agenda livre.', 'Hoje é aniversário do Bob.']));
t('vários que devem: primeiro nome e valor, até 3 e "e mais 1"', () =>
  assert.equal(sp(BD.linhasDoBomDia({ dia: '2026-11-17', devem: [
    { tutor: 'Ana Souza', valor: 75, quando: null, pets: null }, { tutor: 'Beto Lima', valor: 30, quando: null, pets: null },
    { tutor: 'Clara Dias', valor: 20, quando: null, pets: null }, { tutor: 'Davi Reis', valor: 10, quando: null, pets: null }] }, { horario: HORARIO, agora })[0].texto),
  'Vêm hoje e devem: Ana (R$ 75,00), Beto (R$ 30,00), Clara (R$ 20,00) e mais 1.'));

T.secao('validade dos produtos (quem cuida do estoque)');
t('vencidos e vencendo numa linha, depois de quem deve e antes da vacina', () => {
  const l = BD.linhasDoBomDia({ dia: '2026-11-17', devem: [{ tutor: 'Ana Souza', valor: 75, quando: null, pets: null }],
    vacinas: [{ pet: 'Thor', sexo: 'M', nome: 'V10', tipo: 'vacina', vence_em: '2026-11-20' }], validade: { vencidos: 2, vencendo: 3, primeiro: 'Shampoo' } }, { horario: HORARIO, agora });
  assert.deepEqual(l.map((x) => x.id), ['devem', 'validade', 'vacinas']);
  assert.equal(l[1].texto, 'Validade: 2 produtos vencidos na prateleira e 3 vencem em até 30 dias. Veja em Estoque, Vencendo.');
});
t('um só: diz qual produto', () => assert.equal(
  BD.linhasDoBomDia({ dia: '2026-11-17', validade: { vencidos: 0, vencendo: 1, primeiro: 'Ração Golden' } }, { horario: HORARIO, agora })[0].texto,
  'Validade: 1 vence em até 30 dias (Ração Golden). Veja em Estoque, Vencendo.'));
t('sem nada vencendo: nenhuma linha', () => assert.equal(BD.linhasDoBomDia({ dia: '2026-11-17', validade: { vencidos: 0, vencendo: 0, primeiro: null } }, { horario: HORARIO, agora }).length, 0));

T.secao('autorização das fotos: a prévia igual ao banco');
t('o @ arrumado: "ana.pets", "@ana.pets", "instagram.com/ana.pets/" viram "@ana.pets"', () => {
  for (const v of ['ana.pets', '@ana.pets', ' @@ana.pets ', 'https://www.instagram.com/ana.pets/', 'instagram.com/ana.pets?igsh=1']) assert.equal(FR.arrumarArroba(v), '@ana.pets', v);
  assert.equal(FR.arrumarArroba('   '), '');
});
t('a frase "Sem marcar o meu perfil." vira "Pode marcar o meu perfil @x."', () => {
  const base = 'Autorizo Loja a postar nas redes sociais da loja as fotos do Thor deste boletim (17/11/2026). Sem marcar o meu perfil. Posso tirar esta autorização quando quiser, pelo link "Não quero mais".';
  assert.equal(FR.textoComArroba(base, '@ana'), base.replace('Sem marcar o meu perfil.', 'Pode marcar o meu perfil @ana.'));
  assert.equal(FR.textoComArroba(base, ''), base);
});

T.rodar(async () => {});
