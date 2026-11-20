// Unidade: o modo automático do Mozart (assistente/automatico.ts e automatico-servidor.ts), sem banco.
//   - o texto exato do aviso (título, corpo, Entendi, botões) e a versão do aceite;
//   - quem pode usar: o dono sempre; a equipe só com a permissão; o estado estranho vale como desligado;
//   - o Desfazer: 24 horas, só quem pediu ou o dono, uma vez só; a frase curta para cada erro (caixa fechado, acesso, rede);
//   - as instruções do modelo mudam com o automático (passado, Desfazer, ainda pergunta o que falta);
//   - voltas no automático: grava na hora (sem cartão) e a conversa segue; sem o automático, para nos cartões;
//   - gravarNoAutomatico: cada ação abre o registro do Desfazer antes, grava pelo cliente com o cabeçalho da ação e fecha
//     como feita; a que falha fecha como falhou, a seguinte não é feita (PAROU_ANTES) e só a feita tem Desfazer;
//     o banco recusando abrir a ação (automático desligado de verdade) não grava nada.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-mozart-automatico');
const AU = lib('assistente/automatico');
const AS = lib('assistente/automatico-servidor');
const C = lib('assistente/conversa');
const I = lib('assistente/instrucoes');
const t = async (nome, f) => { try { await f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

/** Um banco de mentira: anota cada gravação (com o cliente que gravou) e responde às funções do automático. */
function bancoFalso(o = {}) {
  const log = [];
  const consulta = (quem, tabela) => {
    let linhas = null;
    const q = new Proxy({}, {
      get(_, k) {
        if (k === 'then') {
          const r = linhas ? (o.falharInsert && o.falharInsert(linhas) ? { data: null, error: { message: 'duplicate key value violates unique constraint' } } : { data: linhas.map((_, i) => ({ id: `${tabela}-${log.length}-${i}` })), error: null }) : { data: [], error: null };
          return (ok, nok) => Promise.resolve(r).then(ok, nok);
        }
        return (...a) => { if (k === 'insert') { linhas = Array.isArray(a[0]) ? a[0] : [a[0]]; log.push({ quem, tabela, linhas }); } return q; };
      },
    });
    return q;
  };
  const sb = (quem) => ({
    from: (tabela) => consulta(quem, tabela),
    rpc: async (nome, args) => {
      log.push({ quem, rpc: nome, args });
      if (nome === 'mozart_acao_comecar') return o.recusar ? { data: null, error: { message: 'O modo automático não está ligado para você neste pet shop.' } } : { data: `acao-${args.p_uso}`, error: null };
      if (nome === 'mozart_acao_terminar') return { data: true, error: null };
      return { data: null, error: null };
    },
  });
  return { log, sb };
}

const contexto = (sb, extra = {}) => ({
  sb, userId: 'u1', petshop: { id: 'p1', nome: 'Loja', horario: null, modulos: ['banho_tosa'], opcoes: {} },
  eu: { id: 'e1', nome: 'Bia', papel: 'dono', ativo: true, atende: true }, equipe: [], servicos: [],
  vejoFinanceiro: true, cuidoDoFinanceiro: true, dono: true, fusoMin: -180, agora: '2026-11-20T10:00', ...extra,
});
const bloquear = (id, de, ate, motivo) => ({ type: 'tool_use', id, name: 'bloquear_horario', input: { dia: '2026-11-21', de, ate, motivo } });

(async () => T.rodar(async () => {
  T.secao('o aviso para ligar');
  await t('título, texto, Entendi e os botões, como o dono pediu', () => {
    assert.equal(AU.AVISO_AUTOMATICO.titulo, 'Ligar o modo automático?');
    assert.equal(AU.AVISO_AUTOMATICO.texto, 'O Mozart vai fazer na hora tudo o que você pedir, sem mostrar o cartão de confirmação: agenda, pagamentos, cancelamentos, preços e cadastros. Ele pode entender diferente um nome, um horário ou um valor, principalmente por áudio. Confira o que aparece na conversa. Se algo sair diferente, toque em Desfazer.');
    assert.equal(AU.AVISO_AUTOMATICO.depois, 'Você pode desligar quando quiser.');
    assert.equal(AU.AVISO_AUTOMATICO.entendi, 'Entendi');
    assert.equal(AU.AVISO_AUTOMATICO.ligar, 'Ligar o automático');
    assert.equal(AU.AVISO_AUTOMATICO.agoraNao, 'Agora não');
    assert.match(AU.VERSAO_AVISO_AUTOMATICO, /^[0-9A-Za-z._-]{1,20}$/);
    assert.equal(AU.CHAVE_AUTOMATICO_EQUIPE, 'mozart.automatico_equipe');
  });

  T.secao('quem pode usar');
  await t('o dono sempre; a equipe só com a permissão do dono', () => {
    assert.equal(AU.podeUsarAutomatico({ dono: true, equipePermitida: false }), true);
    assert.equal(AU.podeUsarAutomatico({ dono: false, equipePermitida: false }), false);
    assert.equal(AU.podeUsarAutomatico({ dono: false, equipePermitida: true }), true);
  });
  await t('desligado por padrão; ligado sem permissão não vale', () => {
    assert.equal(AU.automaticoVale({ ligado: false, dono: true, equipePermitida: true }), false);
    assert.equal(AU.automaticoVale({ ligado: true, dono: false, equipePermitida: false }), false);
    assert.equal(AU.automaticoVale({ ligado: true, dono: false, equipePermitida: true }), true);
  });
  await t('o estado do banco: estranho ou incoerente vale como desligado', () => {
    assert.deepEqual(AU.lerEstado(null), AU.ESTADO_DESLIGADO);
    assert.equal(AU.lerEstado('sim').efetivo, false);
    assert.equal(AU.lerEstado({ ligado: true, pode: false, efetivo: true }).efetivo, false);
    assert.equal(AU.lerEstado({ ligado: 'true', pode: true, efetivo: true }).efetivo, false);
    assert.equal(AU.lerEstado({ ligado: true, pode: true, efetivo: true, dono: true }).efetivo, true);
  });

  T.secao('o Desfazer');
  const agora = new Date('2026-11-20T12:00:00Z');
  await t('quem pediu desfaz em até 24 horas', () => {
    assert.deepEqual(AU.podeDesfazer({ autor: 'a', eu: 'a', souDono: false, criadoEm: '2026-11-19T12:30:00Z', estado: 'feita', agora }), { ok: true });
  });
  await t('outra pessoa da equipe não; o dono sim', () => {
    assert.equal(AU.podeDesfazer({ autor: 'a', eu: 'b', souDono: false, criadoEm: '2026-11-20T11:00:00Z', estado: 'feita', agora }).ok, false);
    assert.equal(AU.podeDesfazer({ autor: 'a', eu: 'b', souDono: true, criadoEm: '2026-11-20T11:00:00Z', estado: 'feita', agora }).ok, true);
  });
  await t('passou de 24 horas, já desfeita ou não gravada: explica', () => {
    assert.match(AU.podeDesfazer({ autor: 'a', eu: 'a', souDono: false, criadoEm: '2026-11-19T11:59:00Z', estado: 'feita', agora }).motivo, /24 horas/);
    assert.equal(AU.podeDesfazer({ autor: 'a', eu: 'a', souDono: false, criadoEm: '2026-11-20T11:00:00Z', estado: 'desfeita', agora }).motivo, 'Isso já foi desfeito.');
    assert.equal(AU.podeDesfazer({ autor: 'a', eu: 'a', souDono: false, criadoEm: '2026-11-20T11:00:00Z', estado: 'falhou', agora }).ok, false);
  });
  await t('a frase curta de cada erro', () => {
    assert.equal(AU.fraseDoDesfazer('Este lançamento é de um caixa já fechado e não pode ser apagado. Se precisar corrigir, lance um ajuste.'), 'O caixa desse dia já foi fechado: para acertar, lance um ajuste no Caixa.');
    assert.equal(AU.fraseDoDesfazer('Este caixa já foi fechado e não pode ser alterado.'), 'O caixa desse dia já foi fechado: para acertar, lance um ajuste no Caixa.');
    assert.equal(AU.fraseDoDesfazer('new row violates row-level security policy for table "lancamentos"'), 'Com o seu acesso não dá para desfazer isso.');
    assert.equal(AU.fraseDoDesfazer('Só quem pediu ou o dono pode desfazer.'), 'Só quem pediu ou o dono pode desfazer.');
    assert.equal(AU.fraseDoDesfazer('Isso foi mudado depois por alguém. Nada foi desfeito.'), 'Isso foi mudado depois por alguém. Nada foi desfeito.');
    assert.equal(AU.fraseDoDesfazer('TypeError: Failed to fetch'), 'Sem conexão agora. Tente de novo.');
    assert.equal(AU.fraseDoDesfazer('column "x" of relation "y" does not exist'), 'Não deu para desfazer agora. Tente de novo.');
    assert.equal(AU.fraseDoDesfazer(''), 'Não deu para desfazer agora. Tente de novo.');
  });

  T.secao('as instruções do Mozart');
  await t('com o automático: fala no passado, lembra o Desfazer e ainda pergunta o que falta', () => {
    const com = I.contextoDoPetshop(contexto({}, { automatico: true })), sem = I.contextoDoPetshop(contexto({}));
    assert.ok(com.includes(AU.INSTRUCOES_AUTOMATICO) && !sem.includes('Modo automático LIGADO'));
    assert.match(AU.INSTRUCOES_AUTOMATICO, /Marquei/);
    assert.match(AU.INSTRUCOES_AUTOMATICO, /Desfazer/);
    assert.match(AU.INSTRUCOES_AUTOMATICO, /forma de pagamento/);
    assert.match(AU.INSTRUCOES_AUTOMATICO, /qual pet/);
    assert.match(AU.INSTRUCOES_AUTOMATICO, /WhatsApp/);
  });

  T.secao('voltas: no automático grava na hora e a conversa segue');
  await t('sem o automático: para no cartão', async () => {
    const { sb } = bancoFalso();
    let n = 0;
    const s = await C.voltas({ c: contexto(sb('base')), mensagens: [{ role: 'user', content: 'bloqueia' }], liberado: true, contar: async () => true,
      chamar: async () => { n++; return { content: [bloquear('toolu_u1', '12:00', '13:00', 'Almoço')], stop_reason: 'tool_use' }; } });
    assert.equal(s.propostas.length, 1); assert.equal(s.feitos.length, 0); assert.equal(n, 1);
  });
  await t('com o automático: nenhum cartão, o resultado volta ao modelo e ele fala no passado', async () => {
    let n = 0, recebido = null, viu = null;
    const s = await C.voltas({ c: contexto({ from: () => bancoFalso().sb('x').from('agendamentos') }), mensagens: [{ role: 'user', content: 'bloqueia' }], liberado: true, contar: async () => true,
      automatico: async (o) => { recebido = o; return { resultados: [{ type: 'tool_result', tool_use_id: 'toolu_u2', content: '{"feito":true}' }], mudou: true, feitos: [{ id: 'toolu_u2', ferramenta: 'bloquear_horario', resumo: o.propostas[0].resumo, ok: true, acao: 'a1' }] }; },
      chamar: async (msgs) => { if (n++ === 0) return { content: [{ type: 'text', text: 'Vou bloquear. Confere no cartão.' }, bloquear('toolu_u2', '12:00', '13:00', 'Almoço')], stop_reason: 'tool_use' }; viu = msgs[msgs.length - 1]; return { content: [{ type: 'text', text: 'Bloqueei o almoço de amanhã. Se precisar, toque em Desfazer.' }], stop_reason: 'end_turn' }; } });
    assert.equal(s.propostas.length, 0);
    assert.equal(recebido.propostas.length, 1);
    assert.equal(recebido.pendentes.filter((b) => b.type === 'tool_use').length, 1);
    assert.equal(viu.content[0].type, 'tool_result');
    assert.equal(s.feitos.length, 1); assert.equal(s.mudou, true);
    assert.ok(!/cart[ãa]o/i.test(s.texto) && /Bloqueei/.test(s.texto), s.texto);
  });

  T.secao('gravarNoAutomatico: o caminho do "Pode fazer", com o registro do Desfazer');
  await t('cada ação abre o registro, grava pelo cliente da ação e fecha como feita', async () => {
    const { log, sb } = bancoFalso();
    const c = contexto(sb('base'));
    const g = AS.gravarNoAutomatico({ c, liberado: true, sbDaAcao: (id) => sb(`acao:${id}`) });
    const pend = [bloquear('toolu_b1', '07:00', '08:00', 'Um'), bloquear('toolu_b2', '19:00', '20:00', 'Dois')];
    const propostas = pend.map((u) => ({ id: u.id, ferramenta: u.name, resumo: { titulo: 'Bloquear horário', linhas: [['Motivo', u.input.motivo]] } }));
    const r = await g({ pendentes: pend, propostas, parciais: [] });
    assert.deepEqual(r.feitos.map((f) => [f.id, f.ok, f.acao]), [['toolu_b1', true, 'acao-toolu_b1'], ['toolu_b2', true, 'acao-toolu_b2']]);
    assert.equal(r.feitos[0].resumo.linhas[0][1], 'Um');
    const gravou = log.filter((x) => x.tabela === 'bloqueios');
    assert.deepEqual(gravou.map((x) => x.quem), ['acao:acao-toolu_b1', 'acao:acao-toolu_b2']);
    const rpcs = log.filter((x) => x.rpc).map((x) => `${x.quem}:${x.rpc}:${x.args.p_ok ?? x.args.p_uso}`);
    assert.deepEqual(rpcs, ['base:mozart_acao_comecar:toolu_b1', 'base:mozart_acao_terminar:true', 'base:mozart_acao_comecar:toolu_b2', 'base:mozart_acao_terminar:true']);
    assert.equal(c.sb.from !== undefined && log.length > 0, true);
    assert.equal(r.mudou, true);
  });
  await t('leva com falha: a que falha fecha como falhou, a seguinte não é feita e só a feita tem Desfazer', async () => {
    const { log, sb } = bancoFalso({ falharInsert: (linhas) => linhas[0].motivo === 'Dois' });
    const c = contexto(sb('base'));
    const g = AS.gravarNoAutomatico({ c, liberado: true, sbDaAcao: (id) => sb(`acao:${id}`) });
    const pend = [bloquear('toolu_c1', '07:00', '08:00', 'Um'), bloquear('toolu_c2', '19:00', '20:00', 'Dois'), bloquear('toolu_c3', '12:00', '13:00', 'Três')];
    const propostas = pend.map((u) => ({ id: u.id, ferramenta: u.name, resumo: { titulo: 'Bloquear horário', linhas: [] } }));
    const r = await g({ pendentes: pend, propostas, parciais: [] });
    assert.deepEqual(r.feitos.map((f) => [f.ok, Boolean(f.acao)]), [[true, true], [false, false], [false, false]]);
    assert.equal(r.resultados[2].content, C.PAROU_ANTES);
    assert.ok(log.some((x) => x.rpc === 'mozart_acao_terminar' && x.args.p_ok === false));
    assert.ok(!log.some((x) => x.rpc === 'mozart_acao_comecar' && x.args.p_uso === 'toolu_c3'));
  });
  await t('o banco recusa abrir a ação (automático não vale): nada é gravado', async () => {
    const { log, sb } = bancoFalso({ recusar: true });
    const c = contexto(sb('base'));
    const g = AS.gravarNoAutomatico({ c, liberado: true, sbDaAcao: (id) => sb(`acao:${id}`) });
    const pend = [bloquear('toolu_d1', '07:00', '08:00', 'Um')];
    const r = await g({ pendentes: pend, propostas: [{ id: 'toolu_d1', ferramenta: 'bloquear_horario', resumo: { titulo: 'x', linhas: [] } }], parciais: [] });
    assert.equal(r.feitos[0].ok, false);
    assert.match(r.resultados[0].content, /não está ligado/);
    assert.equal(log.filter((x) => x.tabela === 'bloqueios').length, 0);
  });
  await t('o que a pessoa desfez vai para o Mozart pelas ações da conversa', () => {
    assert.deepEqual(AS.usosDaConversa([{ role: 'user', content: 'oi' }, { role: 'assistant', content: [{ type: 'text', text: 'x' }, { type: 'tool_use', id: 'toolu_x', name: 'a', input: {} }] }]), ['toolu_x']);
  });
}))();
