// Unidade: rodada 9 (N6), a equipe do chão e os cuidados do hotel. Sem banco.
//   - dose na hora, atrasada (mais de meia hora) ou depois; dose de antes da chegada não conta (situacaoDaDose, dosesDeAgora);
//   - a ficha de cuidados e as ocorrências vêm ligadas em quem nunca mexeu (e em quem gravou "desligado" sem querer, pela chave antiga);
//   - o texto livre fala de remédio? (falaDeRemedio): a ficha impressa nunca diz "nenhum remédio" com Gardenal nas observações;
//   - os atalhos "Como o pet chegou" viram o começo do Conferir a entrada (entradaPelosAtalhos);
//   - Meus pets de hoje na ordem do trabalho (ordemDoMeuDia), o alerta curto da linha da agenda (alertaCurto), "Chegou: começar o
//     atendimento" sem banho e "pronta" para fêmea;
//   - "Cannot coerce the result to a single JSON object" vira português (textoAmigavel);
//   - Mozart: quem só cuida da creche e do hotel não recebe ver_agenda nem mover_no_quadro; o tosador não recebe as doses.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-equipe-chao');
const H = lib('hotel');
const HO = lib('hotel-opcoes');
const CO = lib('casa-opcoes');
const Q = lib('quadro');
const E = lib('entrada');
const ER = lib('erros');
const F = lib('assistente/ferramentas');
const A = lib('acessos');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const min = (h) => { const [a, b] = h.split(':').map(Number); return a * 60 + b; };

(async () => T.rodar(async () => {
  T.secao('doses: na hora, atrasada, depois');
  t('feita é feita, a qualquer hora', () => assert.equal(H.situacaoDaDose('08:00', min('15:00'), true), 'feito'));
  t('às 15h, a das 8h e a das 13h sem marcar estão atrasadas; a das 20h é depois', () => {
    assert.equal(H.situacaoDaDose('08:00', min('15:00'), false), 'atrasada');
    assert.equal(H.situacaoDaDose('13:00', min('15:00'), false), 'atrasada');
    assert.equal(H.situacaoDaDose('20:00', min('15:00'), false), 'depois');
  });
  t('meia hora antes até meia hora depois é "agora"; 31 minutos depois, atrasada', () => {
    assert.equal(H.situacaoDaDose('13:00', min('12:30'), false), 'agora');
    assert.equal(H.situacaoDaDose('13:00', min('13:30'), false), 'agora');
    assert.equal(H.situacaoDaDose('13:00', min('13:31'), false), 'atrasada');
    assert.equal(H.situacaoDaDose('13:00', min('12:29'), false), 'depois');
  });
  t('o pet chegou às 14h: a dose das 8h não é cobrada da equipe; a das 13h45 ainda é', () => {
    assert.equal(H.situacaoDaDose('08:00', min('15:00'), false, min('14:00')), 'depois');
    assert.equal(H.situacaoDaDose('13:45', min('15:00'), false, min('14:00')), 'atrasada');
  });
  const estadias = [
    { id: 'e1', entrada: '2026-11-16T09:00:00', pets: { nome: 'Belinha' }, cuidados: [{ id: 'r', tipo: 'comida', oque: 'Ração', quanto: '1 xícara', horas: ['08:00', '13:00', '18:00'] }, { id: 'g', tipo: 'remedio', oque: 'Gardenal', quanto: '1 comprimido', horas: ['08:00', '15:00', '20:00'] }] },
    { id: 'e2', entrada: '2026-11-18T14:00:00', pets: { nome: 'Amora' }, cuidados: [{ id: 'r', tipo: 'comida', oque: 'Ração', quanto: '', horas: ['08:00', '15:00'] }] },
    { id: 'e3', entrada: '2026-11-17T09:00:00', pets: { nome: 'Zeca' }, cuidados: null },
  ];
  const feitos = [{ estadia_id: 'e1', item: 'g', dia: '2026-11-18', hora: '15:00' }, { estadia_id: 'e1', item: 'r', dia: '2026-11-17', hora: '08:00' }];
  const dia = (iso) => iso.slice(0, 10), minuto = (iso) => min(iso.slice(11, 16));
  t('doses de agora às 15h: remédio atrasado primeiro, depois a comida atrasada (a mais atrasada antes), depois o que está na hora', () => {
    const d = H.dosesDeAgora(estadias, feitos, '2026-11-18', min('15:00'), dia, minuto);
    assert.deepEqual(d.map((x) => `${x.pet}:${x.cuidado.oque}:${x.hora}:${x.situacao}`), ['Belinha:Gardenal:08:00:atrasada', 'Belinha:Ração:08:00:atrasada', 'Belinha:Ração:13:00:atrasada', 'Amora:Ração:15:00:agora']);
    assert.equal(d[0].atrasoMin, 420);
  });
  t('a marca de ontem não vale para hoje; a Amora (chegou às 14h) não deve a ração das 8h; quem não tem lista não aparece', () => {
    const d = H.dosesDeAgora(estadias, feitos, '2026-11-18', min('15:00'), dia, minuto);
    assert.ok(d.some((x) => x.pet === 'Belinha' && x.cuidado.id === 'r' && x.hora === '08:00'));
    assert.ok(!d.some((x) => x.pet === 'Amora' && x.hora === '08:00'));
    assert.ok(!d.some((x) => x.pet === 'Zeca'));
  });
  t('tudo marcado: lista vazia', () => assert.equal(H.dosesDeAgora([estadias[1]], [{ estadia_id: 'e2', item: 'r', dia: '2026-11-18', hora: '15:00' }], '2026-11-18', min('15:00'), dia, minuto).length, 0));

  T.secao('ficha de cuidados e ocorrências ligadas por padrão');
  t('quem nunca mexeu: ligadas', () => { assert.equal(HO.cuidadosLigados({ opcoes: {} }), true); assert.equal(CO.ocorrenciasLigadas({ opcoes: null }), true); });
  t('quem salvou as outras opções e ficou com "desligado" na chave antiga: ligadas', () => {
    assert.equal(HO.cuidadosLigados({ opcoes: { 'hotel.cuidados': false } }), true);
    assert.equal(CO.ocorrenciasLigadas({ opcoes: { 'casa.ocorrencias': false } }), true);
  });
  t('só sai quando o dono desliga de propósito', () => {
    assert.equal(HO.cuidadosLigados({ opcoes: { 'hotel.cuidados': false, 'hotel.sem_cuidados': true } }), false);
    assert.equal(CO.ocorrenciasLigadas({ opcoes: { 'casa.sem_ocorrencias': true } }), false);
    assert.equal(HO.cuidadosLigados({ opcoes: { 'hotel.sem_cuidados': false } }), true);
  });

  T.secao('o texto livre fala de remédio?');
  t('o caso do relatório: "Epilepsia: toma Gardenal 8h e 20h. Não pode atrasar"', () => assert.equal(H.falaDeRemedio('Epilepsia: toma Gardenal 8h e 20h. Não pode atrasar'), true));
  t('remédio, medicação, comprimido, gotas, dose em mg, de 12 em 12h', () => {
    for (const x of ['Dar o remédio depois do almoço', 'Medicação na mochila', '1 comprimido à noite', '5 gotas no ouvido', 'Apoquel 16mg', 'Colírio de 12 em 12h', 'Insulina 2 ml']) assert.equal(H.falaDeRemedio(x), true, x);
  });
  t('junta vários campos (alerta do pet + observação da estadia)', () => assert.equal(H.falaDeRemedio(null, 'Come devagar', 'toma remedio para o coração'), true));
  t('sem remédio no texto: não', () => { for (const x of ['Passeio às 17h, trouxe a caminha', 'Bravo com estranhos. Dois para segurar', '', null]) assert.equal(H.falaDeRemedio(x), false, String(x)); });

  T.secao('uma lista de chegada só');
  t('os atalhos do horário viram o começo da conferência', () => {
    assert.deepEqual(E.entradaPelosAtalhos({ nos: true, pulgas: true, agitado: true }), { temperamento: ['agitado'], lesoes: ['pulgas', 'nos'], lesoesObs: '' });
    assert.deepEqual(E.entradaPelosAtalhos({ pele: true, ouvido: true, unhas: true }), { temperamento: [], lesoes: ['ferida'], lesoesObs: 'Ferida ou irritação na pele. Ouvido sujo ou com cheiro. Unhas compridas.' });
  });
  t('nada marcado (ou desmarcado): nada entra', () => assert.deepEqual(E.entradaPelosAtalhos({ nos: false }), { temperamento: [], lesoes: [], lesoesObs: '' }));
  t('todo atalho tem destino (nenhum se perde)', () => {
    const TP = lib('tipos');
    for (const c of TP.CHECKLIST_BANHO) { const r = E.entradaPelosAtalhos({ [c.id]: true }); assert.ok(r.temperamento.length + r.lesoes.length + r.lesoesObs.length > 0, c.id); }
    assert.ok(E.entradaPelosAtalhos({ pulgas: true, nos: true, pele: true }).lesoes.every((id) => E.LESOES.some((o) => o.id === id)));
  });

  T.secao('Meus pets de hoje e o alerta na linha');
  const ags = [
    { id: 'a', status: 'marcado', inicio: '2026-11-18T14:00:00Z' }, { id: 'b', status: 'em_atendimento', inicio: '2026-11-18T09:00:00Z' },
    { id: 'c', status: 'concluido', inicio: '2026-11-18T08:00:00Z' }, { id: 'd', status: 'em_atendimento', inicio: '2026-11-18T10:00:00Z' },
    { id: 'e', status: 'confirmado', inicio: '2026-11-18T11:00:00Z' }, { id: 'f', status: 'em_atendimento', inicio: '2026-11-18T10:30:00Z' },
  ];
  const quadro = new Map([['b', { etapa: 'banho', etapa_em: '2026-11-18T09:05:00Z', chegou_em: '2026-11-18T09:00:00Z', entregue_em: null }], ['d', { etapa: 'pronto', etapa_em: '2026-11-18T10:40:00Z', chegou_em: null, entregue_em: null }],
    ['f', { etapa: 'secagem', etapa_em: '2026-11-18T10:50:00Z', chegou_em: null, entregue_em: null }]]);
  t('ordem: pronto para buscar, secando, no banho, quem vai chegar (pela hora) e, por último, os entregues', () => assert.equal(Q.ordemDoMeuDia(ags, quadro).map((a) => a.id).join(''), 'dfbeac'));
  t('alerta curto: inteiro quando cabe; cortado numa palavra, com reticências, quando não', () => {
    assert.equal(Q.alertaCurto('Morde'), 'Morde');
    const longo = Q.alertaCurto('BRAVO: morde na hora de cortar unha. Usar focinheira e chamar mais uma pessoa para segurar', 40);
    assert.ok(longo.length <= 41 && longo.endsWith('…') && longo.startsWith('BRAVO: morde na hora'), longo);
    assert.equal(Q.alertaCurto('   '), null); assert.equal(Q.alertaCurto(null), null);
  });
  t('"Chegou: começar o banho" com banho; "Chegou: começar o atendimento" só com tosa higiênica', () => {
    assert.equal(Q.rotuloDoProximo('banho', !Q.temBanho(['Banho e tosa'])), 'Chegou: começar o banho');
    assert.equal(Q.rotuloDoProximo('banho', !Q.temBanho(['Tosa higiênica', 'Corte de unhas'])), 'Chegou: começar o atendimento');
    assert.equal(Q.rotuloDoProximo('banho'), 'Chegou: começar o banho');
    assert.equal(Q.temBanho([null, undefined]), true);
  });
  t('"Nina está pronta", "Thor está pronto"', () => { assert.equal(Q.prontoOuPronta('F'), 'pronta'); assert.equal(Q.prontoOuPronta('M'), 'pronto'); assert.equal(Q.prontoOuPronta(null), 'pronto'); });

  T.secao('erro em inglês vira português');
  t('"Cannot coerce the result to a single JSON object" (406 do banco)', () => {
    const m = ER.textoAmigavel('Cannot coerce the result to a single JSON object');
    assert.ok(m && /acesso/.test(m) && !/coerce|JSON/i.test(m), String(m));
  });
  t('recusa da regra do banco também', () => assert.match(ER.textoAmigavel('new row violates row-level security policy for table "agendamentos"'), /acesso não permite/));
  t('frase escrita para a pessoa continua como veio', () => assert.equal(ER.textoAmigavel('O pet ainda não chegou.'), null));

  T.secao('Mozart: áreas das ferramentas do chão');
  const nomes = (p) => F.ferramentasPara({ vejoFinanceiro: false, areas: A.areasDe(p) }).map((f) => f.name);
  const duda = { papel: 'funcionario', ve_financeiro: false, acessos: ['clientes', 'creche_hotel'] }, bia = { papel: 'funcionario', ve_financeiro: false, acessos: ['agenda', 'clientes'] };
  t('monitora (Clientes + Creche e hotel): doses e ocorrências, sem a agenda do banho', () => {
    const n = nomes(duda);
    for (const x of ['ver_cuidados', 'marcar_cuidado', 'registrar_ocorrencia', 'ver_hospedes']) assert.ok(n.includes(x), x);
    for (const x of ['ver_agenda', 'mover_no_quadro', 'marcar_horario', 'alterar_horario', 'resumo_financeiro']) assert.ok(!n.includes(x), x);
  });
  t('tosadora (Agenda + Clientes): move no quadro e lê a agenda, sem doses nem ocorrências', () => {
    const n = nomes(bia);
    for (const x of ['mover_no_quadro', 'ver_agenda', 'ver_comissao']) assert.ok(n.includes(x), x);
    for (const x of ['marcar_cuidado', 'registrar_ocorrencia', 'ver_cuidados', 'resumo_financeiro']) assert.ok(!n.includes(x), x);
  });
  t('a recepção (Caixa) continua lendo a agenda para cobrar', () => assert.ok(F.ferramentasPara({ vejoFinanceiro: true, areas: ['caixa'] }).some((f) => f.name === 'ver_agenda')));
  t('as quatro ferramentas novas: três gravam (pedem o cartão) e uma só lê', () => {
    for (const x of ['marcar_cuidado', 'mover_no_quadro', 'registrar_ocorrencia']) assert.equal(F.definicao(x).grava, true, x);
    assert.equal(F.definicao('ver_cuidados').grava, false);
    for (const x of ['marcar_cuidado', 'mover_no_quadro', 'registrar_ocorrencia', 'ver_cuidados']) assert.ok(!F.definicao(x).financeiro && F.definicao(x).areas.length > 0, x);
  });
}))();
