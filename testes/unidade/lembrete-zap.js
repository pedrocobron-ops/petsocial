// O lembrete de WhatsApp aprovado pelo dono (src/lib/gestao/lembrete-zap.ts), um modelo só para a Agenda, o Modo envio e o Mozart:
// com e sem endereço, hoje e amanhã, término previsto, dois pets no mesmo horário, serviços diferentes por pet, horários
// diferentes no mesmo dia, creche e hotel, e o link do WhatsApp com emoji e quebra de linha codificados.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-lembrete-zap');
const LZ = lib('lembrete-zap');
const MP = lib('mensagens-prontas');
const U = lib('util');

const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const loja = { nome: 'Maestro Pet', endereco: 'Rua das Flores, 10', bairro: 'Centro' };
const FECHO = '\n\nPode confirmar respondendo esta mensagem? Se precisar remarcar, é só avisar.\nAté lá!';

(async () => T.rodar(async () => {
  T.secao('Horário da agenda');
  t('o layout aprovado, com término e endereço', () => assert.equal(
    LZ.lembreteDoHorario({ tutor: 'Valeria Souza', petshop: loja, hoje: '2026-11-19', horarios: [{ inicio: '2026-11-25T15:00', fim: '2026-11-25T16:15', pets: [{ nome: 'Mozart Tobias', servicos: ['Banho', 'Corte de unhas'] }] }] }),
    `Olá, Valeria! 🐾\nAqui é do *Maestro Pet*. Passando para lembrar do horário do *Mozart Tobias*:\n\n📅 *Quarta-feira, 25/11*\n🕒 *15h* (término previsto às 16h15)\n✂️ Banho + corte de unhas\n📍 Rua das Flores, 10, Centro${FECHO}`));
  t('sem endereço: a linha 📍 some; sem fim: sem término', () => {
    const s = LZ.lembreteDoHorario({ tutor: 'Ana', petshop: { nome: 'Loja' }, horarios: [{ inicio: '2026-11-25T15:30', pets: [{ nome: 'Thor', servicos: ['Banho'] }] }] });
    assert.ok(!s.includes('📍') && !s.includes('término'));
    assert.match(s, /🕒 \*15h30\*\n✂️ Banho\n\nPode confirmar/);
  });
  t('hoje e amanhã no lugar do dia da semana', () => {
    const um = (dia) => LZ.lembreteDoHorario({ tutor: 'Ana', petshop: loja, hoje: '2026-11-25', horarios: [{ inicio: `${dia}T09:00`, pets: [{ nome: 'Thor', servicos: ['Banho'] }] }] });
    assert.match(um('2026-11-25'), /📅 \*Hoje, 25\/11\*/);
    assert.match(um('2026-11-26'), /📅 \*Amanhã, 26\/11\*/);
    assert.match(um('2026-11-29'), /📅 \*Domingo, 29\/11\*/);
  });
  t('dois pets do mesmo tutor no mesmo horário, mesmo serviço: "do *Mel* e do *Thor*" e um ✂️ só', () => {
    const s = LZ.lembreteDoHorario({ tutor: 'Ana', petshop: loja, horarios: [{ inicio: '2026-11-25T10:00', fim: '2026-11-25T11:00', pets: [{ nome: 'Mel', servicos: ['Banho'] }] }, { inicio: '2026-11-25T10:00', fim: '2026-11-25T11:30', pets: [{ nome: 'Thor', servicos: ['Banho'] }] }] });
    assert.match(s, /lembrar do horário do \*Mel\* e do \*Thor\*:/);
    assert.match(s, /🕒 \*10h\* \(término previsto às 11h30\)\n✂️ Banho\n📍/);
  });
  t('mesmo horário, serviços diferentes: um ✂️ por pet', () => {
    const s = LZ.lembreteDoHorario({ tutor: 'Ana', petshop: loja, horarios: [{ inicio: '2026-11-25T10:00', pets: [{ nome: 'Mel', servicos: ['Banho', 'Hidratação'] }, { nome: 'Thor', servicos: ['Tosa'] }] }] });
    assert.match(s, /✂️ Mel: Banho \+ hidratação\n✂️ Thor: Tosa/);
  });
  t('horários diferentes no mesmo dia: um 📅 e um 🕒 por horário', () => {
    const s = LZ.lembreteDoHorario({ tutor: 'Ana', petshop: loja, hoje: '2026-11-24', horarios: [{ inicio: '2026-11-25T10:00', pets: [{ nome: 'Mel', servicos: ['Banho'] }] }, { inicio: '2026-11-25T09:00', pets: [{ nome: 'Thor', servicos: ['Banho'] }] }] });
    assert.match(s, /dos horários do \*Thor\* e do \*Mel\*:\n\n📅 \*Amanhã, 25\/11\*\n🕒 \*9h\*\n✂️ Thor: Banho\n🕒 \*10h\*\n✂️ Mel: Banho\n/);
  });
  t('sem nome do tutor: "Olá! 🐾"; "Dona Zefa" fica "Dona Zefa"', () => {
    assert.match(LZ.lembreteDoHorario({ petshop: loja, horarios: [{ inicio: '2026-11-25T10:00', pets: [{ nome: 'Mel', servicos: [] }] }] }), /^Olá! 🐾\n/);
    assert.match(LZ.lembreteDoHorario({ tutor: 'Dona Zefa Lima', petshop: loja, horarios: [{ inicio: '2026-11-25T10:00', pets: [{ nome: 'Mel', servicos: [] }] }] }), /^Olá, Dona Zefa! 🐾\n/);
  });
  t('a Agenda e o Modo envio usam o mesmo modelo (mensagemDoLembrete)', () => {
    const ini = new Date(2026, 10, 25, 15, 0).toISOString(), fim = new Date(2026, 10, 25, 16, 15).toISOString();
    const s = MP.mensagemDoLembrete([{ inicio: ini, fim, pets: { nome: 'Tobias', clientes: { nome: 'Valeria' } }, servicos: { nome: 'Banho' }, agendamento_servicos: [{ ordem: 1, servicos: { nome: 'Corte de unhas' } }] }], loja, new Date(2026, 10, 19, 9, 0));
    assert.equal(s, LZ.lembreteDoHorario({ tutor: 'Valeria', petshop: loja, hoje: '2026-11-19', horarios: [{ inicio: '2026-11-25T15:00', fim: '2026-11-25T16:15', pets: [{ nome: 'Tobias', servicos: ['Banho', 'Corte de unhas'] }] }] }));
  });

  T.secao('Creche e hotel');
  t('hotel: 🏨, entrada e saída', () => assert.equal(
    LZ.lembreteDaEstadia({ tutor: 'Beto Lima', petshop: loja, tipo: 'hotel', pets: ['Bob'], entrada: '2026-11-20T08:00', saida: '2026-11-22T18:30', hoje: '2026-11-19' }),
    `Olá, Beto! 🐾\nAqui é do *Maestro Pet*. Passando para lembrar da reserva do *Bob*:\n\n🏨 Hotel\n📅 Entrada: *Amanhã, 20/11, 8h*\n📅 Saída: *Domingo, 22/11, 18h30*\n📍 Rua das Flores, 10, Centro${FECHO}`));
  t('creche sem saída: ☀️ e só a entrada', () => {
    const s = LZ.lembreteDaEstadia({ tutor: 'Ana', petshop: { nome: 'Loja' }, tipo: 'creche', pets: ['Pipoca'], entrada: '2026-11-20T07:30' });
    assert.match(s, /☀️ Creche\n📅 Entrada: \*Sexta-feira, 20\/11, 7h30\*\n\nPode confirmar/);
    assert.ok(!s.includes('Saída'));
  });

  T.secao('Link do WhatsApp');
  t('emoji, asterisco e quebra de linha vão codificados e voltam iguais', () => {
    const s = LZ.lembreteDoHorario({ tutor: 'Ana', petshop: loja, horarios: [{ inicio: '2026-11-25T10:00', pets: [{ nome: 'Mel', servicos: ['Banho'] }] }] });
    const url = U.linkWhatsApp('(11) 98888-7777', s);
    assert.ok(url.startsWith('https://wa.me/5511988887777?text='));
    const q = url.split('?text=')[1];
    assert.ok(!/[\s🐾📅]/u.test(q), 'nada cru no endereço');
    assert.match(q, /%0A/); assert.match(q, /%F0%9F%90%BE/);
    assert.equal(decodeURIComponent(q), s);
  });
}))();
