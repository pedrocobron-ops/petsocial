// Horário de cada serviço e da creche e do hotel (horario-loja.ts), sem banco:
//  - creche e hotel sem horário próprio seguem o do pet shop; com ele, valem o deles;
//  - serviço sem horário próprio segue o do pet shop; com vários serviços, vale a parte do dia em que todos funcionam;
//  - a agenda mostra o dia aberto quando algum serviço funciona (o pet shop fechado no domingo e o "Banho de domingo");
//  - conferência do horário próprio (ao menos um dia aberto, fecha depois de abrir);
//  - o link do cliente (link-ia.ts) e o Mozart (alterar_funcionamento com alvo, horarios_livres, instruções e o roteiro de teste).
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-horario-servico');

const H = lib('horario-loja');
const IA = lib('link-ia');
const F = lib('assistente/ferramentas');
const K = lib('assistente/ferramenta-cadastros');
const I = lib('assistente/instrucoes');
const M = lib('assistente/modelo-de-teste');

const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const ta = async (nome, f) => { try { await f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const erro = (m) => new Error(m);
const lanca = (f, re) => assert.throws(f, (e) => re.test(e.message));

const dia = (abre, fecha) => ({ abre, fecha });
// pet shop: segunda a sexta 8h às 18h, sábado 8h às 13h, domingo fechado; almoço 12h às 13h
const LOJA = { 0: null, 1: { ...dia('08:00', '18:00'), almoco: { de: '12:00', ate: '13:00' } }, 2: dia('08:00', '18:00'), 3: dia('08:00', '18:00'), 4: dia('08:00', '18:00'), 5: dia('08:00', '18:00'), 6: dia('08:00', '13:00') };
// creche e hotel: todos os dias, 7h às 19h; no domingo, 8h às 18h
const CASA = { 0: dia('08:00', '18:00'), 1: dia('07:00', '19:00'), 2: dia('07:00', '19:00'), 3: dia('07:00', '19:00'), 4: dia('07:00', '19:00'), 5: dia('07:00', '19:00'), 6: dia('07:00', '19:00') };
// "Banho de domingo": só no domingo, 9h às 15h
const DOMINGO = { 0: dia('09:00', '15:00'), 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
// "Tosa da tarde": todo dia útil, 14h às 18h
const TARDE = { 0: null, 1: dia('14:00', '18:00'), 2: dia('14:00', '18:00'), 3: dia('14:00', '18:00'), 4: dia('14:00', '18:00'), 5: dia('14:00', '18:00'), 6: null };

(async () => T.rodar(async () => {
  T.secao('Creche e hotel');
  t('sem horário próprio, a creche e o hotel seguem o pet shop', () => {
    const p = { horario: LOJA, horario_creche: null, horario_hotel: null };
    assert.equal(H.horarioDaCreche(p), LOJA);
    assert.equal(H.horarioDoHotel(p), LOJA);
    assert.equal(H.areaTemHorario(p, 'creche'), false);
  });
  t('com horário próprio, vale o deles (o pet shop fecha no domingo, a creche abre)', () => {
    const p = { horario: LOJA, horario_creche: CASA, horario_hotel: null };
    assert.equal(H.horarioDaCreche(p), CASA);
    assert.equal(H.horarioDoHotel(p), LOJA);
    assert.equal(H.areaTemHorario(p, 'creche'), true);
    assert.deepEqual(H.janelaDoDia([H.horarioDaCreche(p)], 0), { abre: '08:00', fecha: '18:00' });
    assert.equal(H.janelaDoDia([H.horarioDoHotel(p)], 0), null);
  });
  t('pet shop sem as colunas novas (banco antigo): segue o pet shop', () => assert.equal(H.horarioDaArea({ horario: LOJA }, 'hotel'), LOJA));

  T.secao('Serviços');
  t('serviço sem horário próprio segue o pet shop', () => {
    assert.equal(H.horarioDoServico({ horario: null }, LOJA), LOJA);
    assert.equal(H.horarioDoServico(null, LOJA), LOJA);
    assert.equal(H.servicoTemHorario({ horario: null }), false);
    assert.equal(H.servicoTemHorario({ horario: DOMINGO }), true);
  });
  t('com horário próprio, vale o dele', () => assert.equal(H.horarioDoServico({ horario: DOMINGO }, LOJA), DOMINGO));
  t('vários serviços: a parte do dia em que todos funcionam', () => {
    // segunda: pet shop 8h–18h e tosa da tarde 14h–18h → 14h–18h
    assert.deepEqual(H.janelaDoDia([LOJA, TARDE], 1), { abre: '14:00', fecha: '18:00' });
    // sábado: a tosa da tarde não funciona → fechado
    assert.equal(H.janelaDoDia([LOJA, TARDE], 6), null);
    // domingo: o banho de domingo funciona, o pet shop não → um serviço do pet shop junto fecha o dia
    assert.deepEqual(H.janelaDoDia([DOMINGO], 0), { abre: '09:00', fecha: '15:00' });
    assert.equal(H.janelaDoDia([DOMINGO, LOJA], 0), null);
  });
  t('janela vazia (um fecha antes do outro abrir) é fechado', () => {
    assert.equal(H.janelaDoDia([{ 1: dia('08:00', '10:00') }, { 1: dia('10:00', '12:00') }], 1), null);
  });
  t('a agenda abre o dia em que algum serviço funciona', () => {
    const ag = H.horarioDaAgenda(LOJA, [{ horario: DOMINGO, ativo: true, categoria: 'banho' }, { horario: null, ativo: true, categoria: 'banho' }]);
    assert.deepEqual(ag['0'], { abre: '09:00', fecha: '15:00' });
    assert.equal(ag['1'].abre, '08:00');
    assert.deepEqual(ag['1'].almoco, { de: '12:00', ate: '13:00' }, 'o almoço do pet shop continua');
  });
  t('serviço desativado, creche ou hotel não abrem a agenda', () => {
    assert.equal(H.horarioDaAgenda(LOJA, [{ horario: DOMINGO, ativo: false, categoria: 'banho' }]), LOJA);
    assert.equal(H.horarioDaAgenda(LOJA, [{ horario: DOMINGO, ativo: true, categoria: 'creche' }]), LOJA);
  });

  T.secao('Conferência do horário próprio');
  t('precisa de ao menos um dia aberto', () => assert.match(H.erroDoHorarioProprio({ 0: null, 1: null, 2: null, 3: null, 4: null, 5: null, 6: null }), /ao menos um dia aberto/));
  t('fecha antes de abrir é recusado', () => assert.match(H.erroDoHorarioProprio({ ...DOMINGO, 0: dia('15:00', '09:00') }), /depois da hora de abrir/));
  t('certo: null', () => assert.equal(H.erroDoHorarioProprio(CASA), null));
  t('horário próprio não leva almoço', () => assert.equal(H.semAlmoco(LOJA)['1'].almoco, undefined));
  t('mesmoHorario não olha o almoço', () => { assert.ok(H.mesmoHorario(LOJA, H.semAlmoco(LOJA))); assert.ok(!H.mesmoHorario(LOJA, CASA)); });
  t('horarioEmTexto', () => assert.equal(H.horarioEmTexto(DOMINGO), 'segunda fechado; terça fechado; quarta fechado; quinta fechado; sexta fechado; sábado fechado; domingo 9h às 15h'));

  T.secao('Link do cliente (assistente do link)');
  const dados = { info: { nome: 'Loja', hoje: '2026-11-19', horario: LOJA, horario_creche: CASA, horario_hotel: LOJA,
    servicos: [{ id: 'a', nome: 'Banho', duracao_min: 60, preco_p: 50, preco_m: null, preco_g: null, preco_gg: null },
      { id: 'b', nome: 'Banho de domingo', duracao_min: 60, preco_p: 50, preco_m: null, preco_g: null, preco_gg: null, horario: DOMINGO }],
    creche: { diaria: 80 }, hotel: { diaria: 100 } }, fechados: [] };
  // 2026-11-22 é domingo
  t('domingo: o pet shop fecha, o banho de domingo e a creche funcionam', () => {
    assert.equal(IA.abertoNoDia(dados, '2026-11-22'), false);
    assert.equal(IA.abertoNoDia(dados, '2026-11-22', dados.info.servicos[0]), false);
    assert.equal(IA.abertoNoDia(dados, '2026-11-22', dados.info.servicos[1]), true);
    assert.equal(IA.abertoNoDia(dados, '2026-11-22', 'creche'), true);
    assert.equal(IA.abertoNoDia(dados, '2026-11-22', 'hotel'), false);
  });
  t('horarios_livres do link: banho de domingo num sábado é recusado', () => {
    const r = IA.entradaHorarios({ servico: 'S2', dia: '2026-11-21' }, dados);
    assert.equal(r.ok, false); assert.match(r.erro, /serviço não funciona/);
    assert.equal(IA.entradaHorarios({ servico: 'S2', dia: '2026-11-22' }, dados).ok, true);
  });
  t('o contexto do link conta o horário do serviço e da creche', () => {
    const c = IA.contextoDoLink(dados);
    assert.match(c, /Banho de domingo[^\n]*horário deste serviço: [^\n]*domingo 09:00 às 15:00/);
    assert.match(c, /horário da creche \(chegada e busca\): [^\n]*domingo 08:00 às 18:00/);
    assert.doesNotMatch(c, /horário do hotel/);
  });

  T.secao('Mozart');
  t('alterar_funcionamento tem alvo (pet shop, creche, hotel, serviço)', () => {
    const p = F.definicao('alterar_funcionamento').input_schema.properties;
    assert.deepEqual(p.alvo.enum, ['pet_shop', 'creche', 'hotel', 'servico']);
    assert.ok(p.servico_id && p.igual_ao_pet_shop);
  });
  t('creche no domingo: parte do pet shop (sem almoço) e abre o domingo', () => {
    const r = K.horarioProprioDoPedido(LOJA, null, { dias: [{ dia: 'domingo', abre: '08:00', fecha: '18:00' }] }, erro, 'da creche');
    assert.deepEqual(r.novo['0'], { abre: '08:00', fecha: '18:00' });
    assert.deepEqual(r.novo['1'], { abre: '08:00', fecha: '18:00' }, 'sem o almoço do pet shop');
    assert.deepEqual(r.mudou[0], ['Antes', 'igual ao pet shop']);
  });
  t('com horário próprio, parte dele', () => {
    const r = K.horarioProprioDoPedido(LOJA, CASA, { dias: [{ dia: 'sabado', fechado: true }] }, erro, 'da creche');
    assert.equal(r.novo['6'], null); assert.deepEqual(r.novo['1'], dia('07:00', '19:00'));
  });
  t('almoço só no pet shop', () => lanca(() => K.horarioProprioDoPedido(LOJA, null, { almoco_de: '12:00', almoco_ate: '13:00' }, erro, 'do hotel'), /almoço é só do pet shop/));
  t('igual ao pet shop: volta a seguir (null)', () => assert.equal(K.horarioProprioDoPedido(LOJA, CASA, { igual_ao_pet_shop: true }, erro, 'do hotel').novo, null));
  t('igual ao pet shop quando já é: nada para mudar', () => lanca(() => K.horarioProprioDoPedido(LOJA, null, { igual_ao_pet_shop: true }, erro, 'do hotel'), /já é igual/));
  t('fechar todos os dias é recusado', () => lanca(() => K.horarioProprioDoPedido(LOJA, DOMINGO, { dias: [{ dia: 'domingo', fechado: true }] }, erro, 'de Banho de domingo'), /ao menos um dia aberto/));
  t('as instruções nunca dizem que não dá para ter horários diferentes', () => {
    assert.match(I.INSTRUCOES, /Nunca diga que não dá para ter horários diferentes/);
    assert.match(I.INSTRUCOES, /alvo creche e alvo hotel/);
  });
  t('o contexto mostra o horário da creche, do hotel e do serviço', () => {
    const c = { petshop: { nome: 'Loja', horario: LOJA, horario_creche: CASA, horario_hotel: null, modulos: ['banho_tosa', 'creche', 'hotel'], opcoes: {} },
      servicos: [{ id: 's1', nome: 'Banho de domingo', ativo: true, duracao_min: 60, categoria: 'banho', horario: DOMINGO }], equipe: [], eu: { nome: 'Dona', papel: 'dono' },
      vejoFinanceiro: false, cuidoDoFinanceiro: false, areas: [], dono: true, agora: '2026-11-19T09:00' };
    const x = I.contextoDoPetshop(c);
    assert.match(x, /Creche \(chegada e busca\): [^\n]*domingo 8h às 18h/);
    assert.match(x, /Hotel: igual ao pet shop/);
    assert.match(x, /Banho de domingo \| id s1 \| 60 min \| horário próprio: [^\n]*domingo 9h às 15h/);
  });
  t('horarios_livres aceita os outros serviços do horário', () => assert.ok(F.definicao('horarios_livres').input_schema.properties.outros_servicos_ids));
  await ta('roteiro de teste: "domingo a creche e o hotel abrem das 8h às 18h" vira dois cartões juntos', async () => {
    const usadas = [];
    const r = await M.modeloDeTeste([{ role: 'user', content: 'Domingo a creche e o hotel abrem das 8h às 18h' }], { texto() {}, ferramenta(n) { usadas.push(n); } });
    const usos = r.content.filter((b) => b.type === 'tool_use');
    assert.equal(usos.length, 2);
    assert.deepEqual(usos.map((u) => u.input.alvo), ['creche', 'hotel']);
    assert.ok(usos.every((u) => u.name === 'alterar_funcionamento' && u.input.dias[0].dia === 'domingo' && u.input.dias[0].abre === '08:00' && u.input.dias[0].fecha === '18:00'));
  });
}))();
