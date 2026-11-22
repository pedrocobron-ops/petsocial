// Unidade: o Resumo do dia (src/lib/gestao/resumo-do-dia.ts), sem banco: a regra das 05:00, os buracos da agenda (almoço,
// horário por serviço na janela, bloqueio, agora), a linha do tempo, os números, a semana e o dia fraco, o dinheiro, a frase e a
// dica sem IA, o botão da dica, o texto para ouvir, os fatos da IA e a conferência do que ela escreve (número inventado cai).
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { lib } = require('../lib/app');
const B = require('../lib/base');
const T = require('../lib/teste')('unidade-resumo-do-dia');
const R = lib('resumo-do-dia');
const sp = (x) => x.replace(/ /g, ' ');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

const item = (ini, fim, pet, o = {}) => ({ id: `${pet}-${ini}`, ini, fim, pet, sexo: o.sexo ?? null, status: o.status ?? 'confirmado', servico: o.servico ?? 'Banho' });
/** Uma terça, 24/11/2026, às 07:30, com a agenda do desenho aprovado. */
const base = (mais = {}) => ({
  dia: '2026-11-24', hoje: '2026-11-24', agora: '07:30', dow: 2, nome: 'Pedro', so_meus: false, visto: false,
  areas: { agenda: true, casa: true, clientes: true, dinheiro: true, financeiro: true, estoque: true },
  agenda: {
    total: 4, sem_confirmar: 1, janela: { abre: '08:00', fecha: '18:30', almoco: null }, bloqueios: [],
    itens: [item('08:00', '09:30', 'Thor', { sexo: 'M', servico: 'Banho e tosa' }), item('09:30', '10:30', 'Mel', { sexo: 'F' }), item('10:30', '11:30', 'Bob', { status: 'marcado' }), item('14:00', '15:00', 'Luna', { servico: 'Hidratação' })],
  },
  semana: [
    { dia: '2026-11-24', dow: 2, n: 9, aberto: true }, { dia: '2026-11-25', dow: 3, n: 11, aberto: true }, { dia: '2026-11-26', dow: 4, n: 3, aberto: true },
    { dia: '2026-11-27', dow: 5, n: 12, aberto: true }, { dia: '2026-11-28', dow: 6, n: 14, aberto: true }, { dia: '2026-11-29', dow: 0, n: 0, aberto: false },
    { dia: '2026-11-30', dow: 1, n: 8, aberto: true },
  ],
  casa: { creche: 3, hotel: 1 },
  dinheiro: { previsto: 740, devendo: { clientes: 3, valor: 185 }, contas_hoje: { quantas: 1, valor: 312.4, nome: 'Conta de luz' } },
  chamar: ['c1', 'c2'], conta_nova: false, falta: [], bom_dia: null, dica: null,
  ia: { estado: null, frase: null, dica: null },
  ...mais,
});

T.secao('o dia começa às 05:00 no fuso do pet shop');
t('04:59 em São Paulo ainda é o dia anterior', () => assert.equal(R.diaDoResumo(new Date('2026-11-24T07:59:00Z'), 'America/Sao_Paulo'), '2026-11-23'));
t('05:00 em São Paulo já é o dia', () => assert.equal(R.diaDoResumo(new Date('2026-11-24T08:00:00Z'), 'America/Sao_Paulo'), '2026-11-24'));
t('23:59 continua no mesmo dia', () => assert.equal(R.diaDoResumo(new Date('2026-11-25T02:59:00Z'), 'America/Sao_Paulo'), '2026-11-24'));
t('o fuso é o do pet shop: 05:00 em Manaus é 09:00 UTC', () => {
  assert.equal(R.diaDoResumo(new Date('2026-11-24T08:30:00Z'), 'America/Manaus'), '2026-11-23');
  assert.equal(R.diaDoResumo(new Date('2026-11-24T09:00:00Z'), 'America/Manaus'), '2026-11-24');
});
t('fuso estranho ou vazio cai em São Paulo', () => {
  assert.equal(R.diaDoResumo(new Date('2026-11-24T08:00:00Z'), 'Lua/Cheia'), '2026-11-24');
  assert.equal(R.diaDoResumo(new Date('2026-11-24T08:00:00Z'), null), '2026-11-24');
});

T.secao('cabeçalho');
t('"Bom dia, Pedro" de manhã, boa tarde às 12h, boa noite às 18h', () => {
  assert.equal(R.saudacaoDoResumo(base()), 'Bom dia, Pedro');
  assert.equal(R.saudacaoDoResumo(base({ agora: '12:00' })), 'Boa tarde, Pedro');
  assert.equal(R.saudacaoDoResumo(base({ agora: '18:00' })), 'Boa noite, Pedro');
  assert.equal(R.saudacaoDoResumo(base({ nome: '' })), 'Bom dia');
});
t('bloco da data: nov, 24, terça', () => assert.deepEqual(R.blocoDaData(base()), { mes: 'nov', dia: '24', semana: 'terça' }));
t('frase sem IA: "Seu dia começa às 8h com o Thor."', () => assert.equal(R.fraseSemIA(base()), 'Seu dia começa às 8h com o Thor.'));
t('no meio do dia: o próximo, com a/o pelo sexo do pet', () => {
  assert.equal(R.fraseSemIA(base({ agora: '09:00' })), 'O próximo é às 9h30, com a Mel.');
  assert.equal(R.fraseSemIA(base({ agora: '10:00' })), 'O próximo é às 10h30, com Bob.');
});
t('depois do último horário: quantos foram', () => assert.equal(R.fraseSemIA(base({ agora: '19:00' })), '4 atendimentos na agenda de hoje.'));
t('sem agenda, com a casa: quantos pets', () => assert.equal(R.fraseSemIA(base({ agenda: undefined })), 'Hoje são 4 pets na creche e no hotel.'));
t('agenda vazia: livre (a do tosador, "sua agenda")', () => {
  const vazia = { total: 0, sem_confirmar: 0, itens: [], janela: { abre: '08:00', fecha: '18:00' }, bloqueios: [] };
  assert.equal(R.fraseSemIA(base({ agenda: vazia, casa: undefined })), 'A agenda de hoje está livre.');
  assert.equal(R.fraseSemIA(base({ agenda: vazia, casa: undefined, so_meus: true })), 'Sua agenda de hoje está livre.');
});
t('conta nova: fala dos passos que faltam', () => {
  assert.equal(R.fraseSemIA(base({ conta_nova: true, falta: [{ chave: 'precos', rota: '/x', rotulo: 'Colocar os preços' }] })), 'Faltam poucos passos para o primeiro atendimento.');
  assert.equal(R.fraseSemIA(base({ conta_nova: true })), 'Tudo pronto para o primeiro atendimento.');
});

T.secao('números de hoje');
t('atendimentos, sem confirmar e a casa', () => assert.deepEqual(R.numerosDeHoje(base()).map((n) => [n.valor, n.rotulo]), [[4, 'atendimentos'], [1, 'sem confirmar'], [4, 'na creche e no hotel']]));
t('só os módulos que a pessoa vê: sem casa, dois números; só hotel, "no hotel"', () => {
  assert.equal(R.numerosDeHoje(base({ casa: undefined })).length, 2);
  assert.deepEqual(R.numerosDeHoje(base({ agenda: undefined, casa: { creche: null, hotel: 2 } })).map((n) => [n.valor, n.rotulo]), [[2, 'no hotel']]);
});
t('tosador: "atendimentos seus"', () => assert.equal(R.numerosDeHoje(base({ so_meus: true }))[0].rotulo, 'atendimentos seus'));

T.secao('buracos da agenda');
const ag = (itens, janela, bloqueios = []) => ({ itens, janela, bloqueios });
t('o buraco do desenho: livre das 11:30 às 14:00 e das 15:00 às 18:30', () =>
  assert.deepEqual(R.buracosDoDia(base().agenda, '07:30'), [{ de: '11:30', ate: '14:00' }, { de: '15:00', ate: '18:30' }]));
t('o almoço do pet shop não é buraco: 11:00 às 12:00 e 13:00 em diante', () =>
  assert.deepEqual(R.buracosDoDia(ag([item('08:00', '11:00', 'A'), item('15:00', '18:00', 'B')], { abre: '08:00', fecha: '18:00', almoco: { de: '12:00', ate: '13:00' } }), '07:00'),
    [{ de: '11:00', ate: '12:00' }, { de: '13:00', ate: '15:00' }]));
t('almoço que não cabe no dia (sábado até as 13h) não vale', () =>
  assert.deepEqual(R.buracosDoDia(ag([], { abre: '08:00', fecha: '13:00', almoco: { de: '12:00', ate: '13:00' } }), '07:00'), [{ de: '08:00', ate: '13:00' }]));
t('horário por serviço: a janela que o banco manda já vai do primeiro que abre ao último que fecha (07:00 às 20:00)', () =>
  assert.deepEqual(R.buracosDoDia(ag([item('08:00', '18:00', 'A')], { abre: '07:00', fecha: '20:00', almoco: null }), '06:00'), [{ de: '07:00', ate: '08:00' }, { de: '18:00', ate: '20:00' }]));
t('dia fechado (sem janela): nenhum buraco', () => assert.deepEqual(R.buracosDoDia(ag([], null), '07:00'), []));
t('só o que ainda vem: às 12:10 o buraco começa às 12:15', () =>
  assert.deepEqual(R.buracosDoDia(ag([item('14:00', '15:00', 'A')], { abre: '08:00', fecha: '15:00' }), '12:10'), [{ de: '12:15', ate: '14:00' }]));
t('menos de 1 hora livre não é buraco', () => assert.deepEqual(R.buracosDoDia(ag([item('08:00', '09:00', 'A'), item('09:45', '18:00', 'B')], { abre: '08:00', fecha: '18:00' }), '07:00'), []));
t('bloqueio conta como ocupado', () =>
  assert.deepEqual(R.buracosDoDia(ag([], { abre: '08:00', fecha: '12:00' }, [['09:00', '11:30']]), '07:00'), [{ de: '08:00', ate: '09:00' }]));
t('horários que se cruzam (duas vagas) não criam buraco falso', () =>
  assert.deepEqual(R.buracosDoDia(ag([item('08:00', '12:00', 'A'), item('09:00', '10:00', 'B')], { abre: '08:00', fecha: '13:00' }), '07:00'), [{ de: '12:00', ate: '13:00' }]));
t('depois de fechar: nada', () => assert.deepEqual(R.buracosDoDia(ag([], { abre: '08:00', fecha: '18:00' }), '19:00'), []));

T.secao('linha do tempo');
t('os horários em ordem, o não confirmado destacado e o buraco no lugar', () => {
  const l = R.linhaDoTempo(base());
  assert.deepEqual(l.map((x) => [x.tipo, x.hora, x.texto]), [
    ['item', '08:00', 'Thor · banho e tosa'], ['item', '09:30', 'Mel · banho'], ['falta', '10:30', 'Bob · banho · ainda não confirmou'],
    ['buraco', '11:30', 'Livre até 14:00'], ['item', '14:00', 'Luna · hidratação'], ['buraco', '15:00', 'Livre até 18:30'],
  ]);
});
t('dia cheio: as primeiras linhas e "Mais N até as HH:MM"', () => {
  const itens = Array.from({ length: 10 }, (_, i) => item(`${String(8 + i).padStart(2, '0')}:00`, `${String(9 + i).padStart(2, '0')}:00`, `Pet${i}`));
  const l = R.linhaDoTempo(base({ agenda: { total: 10, sem_confirmar: 0, itens, janela: { abre: '08:00', fecha: '18:00' }, bloqueios: [] } }));
  assert.equal(l.length, R.MAX_LINHAS_DO_TEMPO);
  assert.deepEqual([l[l.length - 1].tipo, l[l.length - 1].texto], ['mais', 'Mais 4 até as 18:00']);
});
t('sem a área Agenda: nenhuma linha', () => assert.deepEqual(R.linhaDoTempo(base({ agenda: undefined })), []));

T.secao('a semana');
t('uma barra por dia aberto; quinta, com 3, é o dia fraco', () => {
  const s = R.semanaDoResumo(base());
  assert.deepEqual(s.dias.map((x) => [x.rotulo, x.n, x.fraco]), [['ter', 9, false], ['qua', 11, false], ['qui', 3, true], ['sex', 12, false], ['sáb', 14, false], ['seg', 8, false]]);
  assert.equal(s.dias.find((x) => x.rotulo === 'sáb').pct, 100);
  assert.equal(s.dias[0].hoje, true);
  assert.equal(s.nota, 'Quinta está fraca: só 3 horários marcados.');
});
t('semana equilibrada: nenhum dia fraco e a soma na frase', () => {
  const s = R.semanaDoResumo(base({ semana: base().semana.map((x) => ({ ...x, n: x.aberto ? 6 : 0 })) }));
  assert.equal(s.dias.some((x) => x.fraco), false);
  assert.equal(s.nota, '36 horários marcados nos próximos 7 dias.');
});
t('pouco movimento (média abaixo de 2) não marca dia fraco', () => {
  const s = R.semanaDoResumo(base({ semana: base().semana.map((x, i) => ({ ...x, n: i === 1 ? 0 : 1 })) }));
  assert.equal(s.dias.some((x) => x.fraco), false);
});
t('hoje não é comparado (já está pela metade)', () => {
  const s = R.semanaDoResumo(base({ semana: base().semana.map((x, i) => ({ ...x, n: i === 0 ? 0 : 6 })) }));
  assert.equal(s.dias.some((x) => x.fraco), false);
});
t('sábado sem nada: "Sábado está fraco: nenhum horário marcado."', () => {
  const s = R.semanaDoResumo(base({ semana: base().semana.map((x) => (x.dow === 6 ? { ...x, n: 0 } : x)) }));
  assert.equal(s.nota, 'Sábado está fraco: nenhum horário marcado.');
});
t('dia fechado com horário marcado aparece; sem a área, não há semana', () => {
  assert.equal(R.semanaDoResumo(base({ semana: base().semana.map((x) => (x.dow === 0 ? { ...x, n: 2 } : x)) })).dias.length, 7);
  assert.equal(R.semanaDoResumo(base({ semana: undefined })), null);
});

T.secao('dinheiro');
t('previsto, a conta que vence hoje e quem deve', () =>
  assert.deepEqual(R.linhasDoDinheiro(base()).map((l) => [l.id, l.texto, sp(l.valor), Boolean(l.alerta)]),
    [['previsto', 'Previsto para entrar hoje', 'R$ 740,00', false], ['contas', 'Conta de luz vence hoje', 'R$ 312,40', false], ['devendo', '3 clientes devendo', 'R$ 185,00', true]]));
t('várias contas: "2 contas vencem hoje"; ninguém devendo: sem a linha', () => {
  const l = R.linhasDoDinheiro(base({ dinheiro: { previsto: 0, devendo: { clientes: 0, valor: 0 }, contas_hoje: { quantas: 2, valor: 500, nome: 'Aluguel' } } }));
  assert.deepEqual(l.map((x) => x.texto), ['Previsto para entrar hoje', '2 contas vencem hoje']);
});
t('quem só recebe (caixa) não vê as contas a pagar', () =>
  assert.deepEqual(R.linhasDoDinheiro(base({ dinheiro: { previsto: 100, devendo: { clientes: 1, valor: 40 } } })).map((x) => x.id), ['previsto', 'devendo']));
t('sem área de dinheiro: nenhuma linha', () => assert.deepEqual(R.linhasDoDinheiro(base({ dinheiro: undefined })), []));
const comOrigens = (de, casa_nome = 'Creche e hotel') => ({ previsto: de.agenda + de.casa + de.receber, previsto_de: de, casa_nome, devendo: { clientes: 0, valor: 0 } });
t('o previsto soma agenda, creche e hotel e a receber; com mais de uma origem, diz de onde vem', () => {
  const l = R.linhasDoDinheiro(base({ dinheiro: comOrigens({ agenda: 190, casa: 310, receber: 45 }) }))[0];
  assert.deepEqual([l.texto, sp(l.valor), sp(l.detalhe)], ['Previsto para entrar hoje', 'R$ 545,00', 'Agenda R$ 190,00 · Creche e hotel R$ 310,00 · A receber R$ 45,00']);
});
t('uma origem só (ou nenhuma): sem o texto pequeno; origem zerada não aparece; só hotel diz "Hotel"', () => {
  assert.equal(R.linhasDoDinheiro(base({ dinheiro: comOrigens({ agenda: 190, casa: 0, receber: 0 }) }))[0].detalhe, undefined);
  assert.equal(R.linhasDoDinheiro(base({ dinheiro: comOrigens({ agenda: 0, casa: 0, receber: 0 }) }))[0].detalhe, undefined);
  assert.equal(sp(R.origensDoPrevisto(comOrigens({ agenda: 0, casa: 240, receber: 45 }, 'Hotel'))), 'Hotel R$ 240,00 · A receber R$ 45,00');
  assert.equal(R.origensDoPrevisto(base().dinheiro), null);
});

T.secao('a dica, escrita sem IA');
const dica = (tipo, dados, mais = {}) => ({ tipo, chave: mais.chave ?? tipo, dados, acao: mais.acao ?? null, voto: null });
t('período vazio: "Suas quintas à tarde…" e quem está no prazo', () => {
  assert.equal(R.textoDaDicaSemIA(dica('periodo_vazio', { dow: 4, periodo: 'tarde', semanas: 4, chamar: 8 })), 'Suas quintas à tarde ficaram sem nenhum horário nas últimas 4 semanas. 8 clientes já passaram do intervalo em que costumam voltar.');
  assert.equal(R.textoDaDicaSemIA(dica('periodo_vazio', { dow: 6, periodo: 'manha', semanas: 4, chamar: 0 })), 'Seus sábados de manhã ficaram sem nenhum horário nas últimas 4 semanas.');
});
t('retorno, sem confirmar, estoque e quem deve', () => {
  assert.equal(R.textoDaDicaSemIA(dica('retorno', { n: 3 })), '3 clientes que costumam voltar já passaram do intervalo habitual e não têm horário marcado.');
  assert.equal(R.textoDaDicaSemIA(dica('sem_confirmar', { n: 5, total: 12 })), '5 dos 12 horários de hoje e de amanhã ainda não foram confirmados. Um lembrete pelo WhatsApp costuma resolver.');
  assert.equal(R.textoDaDicaSemIA(dica('estoque_baixo', { n: 1, primeiro: 'Shampoo Neutro' })), 'Shampoo Neutro está no estoque mínimo ou abaixo dele.');
  assert.equal(R.textoDaDicaSemIA(dica('estoque_baixo', { n: 3, primeiro: 'Shampoo Neutro' })), '3 produtos estão no estoque mínimo ou abaixo dele, entre eles Shampoo Neutro.');
  assert.equal(sp(R.textoDaDicaSemIA(dica('devendo_antigo', { clientes: 2, valor: 185, dias: 30 }))), '2 clientes têm conta em aberto há mais de 30 dias, somando R$ 185,00.');
});
t('cadastro: preços, pet e link', () => {
  assert.match(R.textoDaDicaSemIA(dica('cadastro', { n: 4 }, { chave: 'precos' })), /^4 serviços ainda estão sem preço\./);
  assert.match(R.textoDaDicaSemIA(dica('cadastro', {}, { chave: 'pet' })), /nenhum pet cadastrado/);
  assert.match(R.textoDaDicaSemIA(dica('cadastro', {}, { chave: 'link' })), /link do cliente está desligado/);
});
t('nenhuma dica promete resultado nem usa urgência; no máximo 2 frases', () => {
  const todas = [dica('periodo_vazio', { dow: 4, periodo: 'tarde', semanas: 4, chamar: 8 }), dica('retorno', { n: 3 }), dica('sem_confirmar', { n: 5, total: 12 }), dica('estoque_baixo', { n: 3, primeiro: 'X' }),
    dica('devendo_antigo', { clientes: 2, valor: 185, dias: 30 }), ...['precos', 'diaria', 'pet', 'link'].map((c) => dica('cadastro', { n: 2 }, { chave: c }))];
  for (const d of todas) {
    const x = R.textoDaDicaSemIA(d);
    assert.ok(!/garant|lucr|fatur|renda|urgent|não perca|!/i.test(x), x);
    assert.ok(x.split(/(?<=[.!?])\s+/).length <= 2, x);
    assert.ok(R.origemDaDica(d).startsWith('Tirada d'), R.origemDaDica(d));
  }
});
t('o botão da dica: "Chamar os 8 para quinta", "Chamar os 3", "Chamar 1 cliente", o rótulo de ir, ou nenhum', () => {
  const oito = Array.from({ length: 8 }, (_, i) => `c${i}`);
  assert.equal(R.rotuloDaAcao(dica('periodo_vazio', { dow: 4, periodo: 'tarde' }, { acao: { tipo: 'chamar', clientes: oito } })), 'Chamar os 8 para quinta');
  assert.equal(R.rotuloDaAcao(dica('retorno', { n: 3 }, { acao: { tipo: 'chamar', clientes: ['a', 'b', 'c'] } })), 'Chamar os 3');
  assert.equal(R.rotuloDaAcao(dica('retorno', { n: 1 }, { acao: { tipo: 'chamar', clientes: ['a'] } })), 'Chamar 1 cliente');
  assert.equal(R.rotuloDaAcao(dica('estoque_baixo', { n: 1 }, { acao: { tipo: 'ir', rota: '/gestao/app/estoque', rotulo: 'Ver no Estoque' } })), 'Ver no Estoque');
  assert.equal(R.rotuloDaAcao(dica('devendo_antigo', { clientes: 1 })), null);
});

T.secao('vale lembrar (as linhas do Bom dia que a folha não mostra de outro jeito)');
t('vacina, pacote e aniversário entram; o dia, quem deve e as contas não se repetem', () => {
  const bom_dia = { dia: '2026-11-24', agenda: [['2026-11-24T11:00:00Z', '2026-11-24T12:00:00Z']], devem: [{ tutor: 'Ana', valor: 40, quando: null, pets: null }],
    contas_fixas: [{ nome: 'Aluguel', valor: 2500, vencimento: '2026-11-24', estimado: false }],
    vacinas: [{ pet: 'Thor', sexo: 'M', nome: 'V10', tipo: 'vacina', vence_em: '2026-11-26' }], niver: [{ pet: 'Mel', sexo: 'F', vem: true }] };
  assert.deepEqual(R.valeLembrar(base({ bom_dia })).map((l) => l.id), ['vacinas', 'niver']);
  assert.deepEqual(R.valeLembrar(base()), []);
});

T.secao('ouvir');
t('o texto lido junta a saudação, a frase, os números, o buraco, a semana, o dinheiro e a dica', () => {
  const x = sp(R.textoParaOuvir(base({ dica: dica('retorno', { n: 3 }) })));
  for (const pedaco of ['Bom dia, Pedro.', 'Seu dia começa às 8h com o Thor.', 'Hoje são 4 atendimentos, 1 sem confirmar.', 'Horário livre das 11h30 às 14h.', '4 pets na creche e no hotel.',
    'Quinta está fraca: só 3 horários marcados.', 'Previsto para entrar hoje: R$ 740,00.', '3 clientes devendo: R$ 185,00.', 'Dica do dia: 3 clientes que costumam voltar']) assert.ok(x.includes(pedaco), `${pedaco} | ${x}`);
});
t('a frase e a dica da IA entram no lugar das sem IA; dica dispensada não é lida; sem dinheiro, nada de valor', () => {
  const x = R.textoParaOuvir(base({ dica: dica('retorno', { n: 3 }), dinheiro: undefined }), 'Frase do Mozart.', 'Dica do Mozart.');
  assert.ok(x.includes('Frase do Mozart.') && x.includes('Dica do dia: Dica do Mozart.') && !x.includes('R$'), x);
  assert.ok(!R.textoParaOuvir(base({ dica: { ...dica('retorno', { n: 3 }), voto: 'nao_quero' } })).includes('Dica do dia'));
});
t('ouvir: o previsto com as origens', () => {
  const x = sp(R.textoParaOuvir(base({ dinheiro: comOrigens({ agenda: 190, casa: 310, receber: 45 }) })));
  assert.ok(x.includes('Previsto para entrar hoje: R$ 545,00. Agenda R$ 190,00, Creche e hotel R$ 310,00, A receber R$ 45,00.'), x);
});

T.secao('o que a IA recebe e a conferência do que ela escreve');
const comDica = base({ dica: dica('retorno', { n: 3 }) });
const fatos = R.fatosParaIA(comDica);
t('os fatos: agenda, casa, semana, o previsto de hoje e o fato da dica; nada de quem deve, de conta a pagar, de tutor nem de telefone', () => {
  assert.equal(fatos.agenda.atendimentos, 4);
  assert.deepEqual(fatos.agenda.proximo, { hora: '8h', pet: 'Thor', servico: 'Banho e tosa' });
  assert.deepEqual(fatos.agenda.livres, [{ de: '11h30', ate: '14h' }, { de: '15h', ate: '18h30' }]);
  assert.equal(fatos.dica.fato, R.textoDaDicaSemIA(comDica.dica));
  const tudo = JSON.stringify(fatos);
  assert.equal(sp(fatos.previsto_para_entrar_hoje.total), 'R$ 740,00');
  assert.ok(!/185|312|devendo|telefone|c1/.test(tudo), tudo);
});
t('quem não tem área de dinheiro: nenhum valor nos fatos', () => {
  const f = R.fatosParaIA(base({ dinheiro: undefined }));
  assert.ok(!('previsto_para_entrar_hoje' in f) && !/R\$|740/.test(JSON.stringify(f)), JSON.stringify(f));
});
t('com origens, os fatos trazem o total e de onde vem, e a IA pode citar só esses valores', () => {
  const f = R.fatosParaIA(base({ dinheiro: comOrigens({ agenda: 190, casa: 310, receber: 1250 }) }));
  assert.equal(sp(f.previsto_para_entrar_hoje.total), 'R$ 1.750,00');
  assert.equal(sp(f.previsto_para_entrar_hoje.origens), 'Agenda R$ 190,00 · Creche e hotel R$ 310,00 · A receber R$ 1.250,00');
  const n = R.numerosDosFatos(f);
  assert.ok(n.has(1750) && n.has(190) && n.has(310) && n.has(1250));
  assert.deepEqual(R.validarTextoDaIA({ frase: 'Previsto para hoje: R$ 1.750,00, sendo R$ 310,00 da creche e do hotel.', dica: '' }, f), { frase: 'Previsto para hoje: R$ 1.750,00, sendo R$ 310,00 da creche e do hotel.', dica: '' });
  assert.equal(R.validarTextoDaIA({ frase: 'Previsto para hoje: R$ 1.800,00.', dica: '' }, f), null);
});
t('os números dos fatos: 4, 1, 8, 11 e 30 (de 11h30), 14, 3…', () => {
  const n = R.numerosDosFatos(fatos);
  for (const x of [4, 1, 8, 11, 30, 14, 15, 18, 3]) assert.ok(n.has(x), String(x));
  assert.ok(!n.has(97));
});
t('"1.250,00" é 1250, "9h30" é 9 e 30, "três" é 3', () => assert.deepEqual(R.numerosDoTexto('R$ 1.250,00 às 9h30 para três pets'), [1250, 9, 30, 3]));
t('texto bom passa (e vem aparado)', () =>
  assert.deepEqual(R.validarTextoDaIA({ frase: '  Seu dia começa às 8h, com o Thor.  ', dica: '3 clientes passaram do intervalo em que costumam voltar. Vale chamar.' }, fatos),
    { frase: 'Seu dia começa às 8h, com o Thor.', dica: '3 clientes passaram do intervalo em que costumam voltar. Vale chamar.' }));
t('número que não está nos fatos derruba o texto inteiro (em algarismo ou por extenso)', () => {
  assert.equal(R.validarTextoDaIA({ frase: 'Hoje são 97 atendimentos.', dica: '3 clientes para chamar.' }, fatos), null);
  assert.equal(R.validarTextoDaIA({ frase: 'Seu dia começa às 8h.', dica: 'São 5 clientes para chamar.' }, fatos), null);
  assert.equal(R.validarTextoDaIA({ frase: 'Hoje são vinte atendimentos.', dica: '3 clientes para chamar.' }, fatos), null);
  assert.equal(R.validarTextoDaIA({ frase: 'Seu dia começa às 8h.', dica: 'Chamar os 3 pode trazer R$ 500,00.' }, fatos), null);
});
t('promessa, urgência, porcentagem, link e marcação derrubam', () => {
  for (const frase of ['Hoje você vai faturar bem.', 'Garantia de agenda cheia.', 'Não perca os 3 clientes.', 'Agenda com 4 atendimentos: 100% de ocupação.', 'Veja em https://exemplo.com', '**Seu dia** começa às 8h.'])
    assert.equal(R.validarTextoDaIA({ frase, dica: '3 clientes para chamar.' }, fatos), null, frase);
});
t('dica com mais de 2 frases, texto longo, vazio ou fora do formato derrubam', () => {
  assert.equal(R.validarTextoDaIA({ frase: 'Seu dia começa às 8h.', dica: 'Uma. Duas. Três frases aqui.' }, fatos), null);
  assert.equal(R.validarTextoDaIA({ frase: 'a'.repeat(R.MAX_FRASE_IA + 1), dica: '3 clientes.' }, fatos), null);
  assert.equal(R.validarTextoDaIA({ frase: '', dica: '3 clientes.' }, fatos), null);
  assert.equal(R.validarTextoDaIA({ frase: 'Seu dia começa às 8h.', dica: '' }, fatos), null);
  assert.equal(R.validarTextoDaIA({ frase: 'Seu dia começa às 8h.' }, fatos), null);
  assert.equal(R.validarTextoDaIA('Seu dia começa às 8h.', fatos), null);
  assert.equal(R.validarTextoDaIA(null, fatos), null);
});
t('sem dica nos fatos, a dica da IA é ignorada', () =>
  assert.deepEqual(R.validarTextoDaIA({ frase: 'Seu dia começa às 8h.', dica: 'Qualquer coisa com 999.' }, R.fatosParaIA(base())), { frase: 'Seu dia começa às 8h.', dica: '' }));
t('a IA de teste escreve um texto que passa; com a marca no nome do pet shop, inventa e é descartada', () => {
  const boa = R.respostaDeTeste(comDica, 'Pet Shop Teste');
  assert.deepEqual(R.validarTextoDaIA(boa, fatos), boa);
  assert.match(boa.frase, /pelo Mozart de teste\.$/);
  assert.equal(R.validarTextoDaIA(R.respostaDeTeste(comDica, `Loja ${R.MARCA_IA_INVENTA}`), fatos), null);
});
t('as instruções pedem só fatos, sem número inventado, e o esquema é frase + dica', () => {
  assert.match(R.INSTRUCOES_RESUMO, /Nunca calcule, some, estime ou invente número/);
  assert.match(R.INSTRUCOES_RESUMO, /Sem promessa de resultado/);
  assert.deepEqual(R.ESQUEMA_RESUMO.required, ['frase', 'dica']);
});

T.secao('o código em volta');
const ler = (...p) => fs.readFileSync(path.join(B.RAIZ, ...p), 'utf8');
t('a tela Hoje tem o botão de rever e não tem mais o cartão do Bom dia', () => {
  const hoje = ler('src', 'app', '(gestao)', 'gestao', 'app', 'page.tsx');
  assert.ok(hoje.includes('data-teste="resumo-rever"') && hoje.includes('abrirResumoDoDia') && !hoje.includes('<BomDia'));
  assert.ok(!fs.existsSync(path.join(B.RAIZ, 'src', 'components', 'gestao', 'bom-dia.tsx')));
});
t('a folha mora na casca, usa a Folha do aplicativo e a mesma leitura em voz alta do Mozart', () => {
  assert.ok(ler('src', 'components', 'gestao', 'casca.tsx').includes('<ResumoDoDia />'));
  const c = ler('src', 'components', 'gestao', 'resumo-do-dia.tsx');
  assert.ok(c.includes('<Folha titulo="Resumo do dia"') && c.includes('from "./voz"') && c.includes('gestao_resumo_visto') && c.includes('temDialogoNaFrente'));
  assert.ok(!/dangerouslySetInnerHTML|<script|<style/.test(c));
});
t('a rota conta na cota do Mozart, tem prazo de 8 s, modo falso só fora da Vercel e confere o texto', () => {
  const r = ler('src', 'app', 'api', 'gestao', 'resumo-do-dia', 'route.ts');
  assert.ok(r.includes('assistente_contar_v2') && r.includes('p_canal: "mozart"') && r.includes('PRAZO_MS = 8_000') && r.includes('validarTextoDaIA'));
  assert.ok(r.includes('process.env.GESTAO_RESUMO_FALSO === "1" && !process.env.VERCEL'));
  assert.ok(r.includes('gestao_resumo_ia_reservar') && r.includes('gestao_resumo_ia_guardar'));
});

T.rodar(async () => {});
