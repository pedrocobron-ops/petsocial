// Banco: rodada 8, estreante. Com o banco de verdade e um modelo de mentira (roteiro fixo, sem chamar a API).
//  - "a Bolinha é brava, morde. anota isso na ficha dela" (estreante, melhoria 8): o Mozart monta o cartão "Anotar na ficha do pet"
//    (nada gravado antes do Pode fazer); confirmado, o texto entra no fim de Cuidados e alertas, sem apagar o que já estava; a mesma
//    confirmação de novo não grava duas vezes; a ficha que mudou entre o cartão e o Pode fazer não perde o que a outra pessoa escreveu.
//  - quem é da equipe sem dinheiro (tosador) também anota (como na ficha); quem é de outro pet shop não acha o pet.
//  - modo simples: a chave geral.modo_simples grava pelas opções do dono e chega para a equipe (petshop_opcoes).
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('estreante-m');
const C = lib('assistente/conversa');
const R = lib('reservado');
const A = lib('acessos');
const O = lib('opcoes');
const M = lib('modo-simples');

let seq = 0;
const resp = (content, stop_reason = 'tool_use') => ({ content, stop_reason });
const uso = (name, input) => ({ type: 'tool_use', id: `toolu_em${Date.now().toString(36)}${++seq}`, name, input });
const falar = (text) => resp([{ type: 'text', text }], 'end_turn');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Estreante' });
  const P = L.P;
  async function contexto(papel) {
    const sb = L.sb[papel];
    const u = (await sb.auth.getUser()).data.user;
    const [p, e, s] = await Promise.all([R.lerPetshop(sb, P), R.lerEquipe(sb, P), R.lerServicos(sb, P)]);
    const eu = (e.data || []).find((x) => x.user_id === u.id && x.ativo);
    return { sb, userId: u.id, petshop: p.data, eu, equipe: e.data || [], servicos: s.data || [],
      vejoFinanceiro: A.podeArea(eu, 'caixa') || A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'),
      cuidoDoFinanceiro: A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'), fusoMin: -180, agora: `${L.hoje}T10:00` };
  }
  const semContar = async () => true;
  const reservar = (sb) => async (id) => B.must(await sb.rpc('assistente_acao_reservar', { p_petshop: P, p_uso: id }), 'reservar ação') === true;
  const liberar = (sb) => async (id) => { await sb.rpc('assistente_acao_liberar', { p_petshop: P, p_uso: id }); };
  async function pedir(c, texto, passos) {
    let i = 0;
    const msgs = [{ role: 'user', content: [{ type: 'text', text: texto }] }];
    const s = await C.voltas({ c, mensagens: msgs, liberado: true, contar: semContar, chamar: async () => passos[i++] ?? falar('Pronto.') });
    return s;
  }
  const opcoesDe = (c, s, sb) => ({ c, pendentes: s.mensagens[s.mensagens.length - 1].content.filter((b) => b.type === 'tool_use'), liberado: true,
    decisoes: [{ id: s.propostas[0].id, ok: true }], parciais: s.parciais, reservar: reservar(sb), liberar: liberar(sb) });
  const alertas = (pet) => B.sql(`select coalesce(alertas, '') from pets where id='${L.pets[pet]}'`);

  T.secao('"anota isso na ficha dela": cartão, Pode fazer, uma vez só');
  B.sql(`update pets set alertas = 'Alergia a shampoo' where id='${L.pets.Mel}'`);
  const cDono = await contexto('dono');
  const s = await pedir(cDono, 'a mel é brava, morde. anota isso na ficha dela', [resp([uso('anotar_no_pet', { pet_id: L.pets.Mel, onde: 'alertas', texto: 'Morde. Cuidado ao secar.' })])]);
  const card = s.propostas[0]?.resumo;
  T.ok('para no cartão "Anotar na ficha do pet" (nada gravado ainda)', card?.titulo === 'Anotar na ficha do pet' && alertas('Mel') === 'Alergia a shampoo', s.propostas);
  T.ok('o cartão diz onde e como fica', card && card.linhas.some(([k, v]) => k === 'Onde' && v === 'Cuidados e alertas') && card.linhas.some(([k, v]) => k === 'Fica assim' && v === 'Alergia a shampoo. Morde. Cuidado ao secar.'), card);
  const op = opcoesDe(cDono, s, L.sb.dono);
  const r1 = await C.responderCartoes(op);
  T.ok('Pode fazer: entra no fim, sem apagar a alergia', r1.mudou && alertas('Mel') === 'Alergia a shampoo. Morde. Cuidado ao secar.', { r: r1.resultados, alertas: alertas('Mel') });
  const r2 = await C.responderCartoes(op);
  T.ok('a mesma confirmação de novo: não grava duas vezes', !r2.mudou && alertas('Mel') === 'Alergia a shampoo. Morde. Cuidado ao secar.', r2.resultados);

  T.secao('a ficha mudou entre o cartão e o Pode fazer');
  const s2 = await pedir(cDono, 'anota nas observações do thor que o tutor busca às 17h', [resp([uso('anotar_no_pet', { pet_id: L.pets.Thor, onde: 'observacoes', texto: 'Tutor busca às 17h' })])]);
  B.sql(`update pets set obs = 'Escrito por outra pessoa' where id='${L.pets.Thor}'`);
  const r3 = await C.responderCartoes(opcoesDe(cDono, s2, L.sb.dono));
  T.ok('o que a outra pessoa escreveu fica, e a anotação entra depois dele (nada é sobrescrito)', B.sql(`select obs from pets where id='${L.pets.Thor}'`) === 'Escrito por outra pessoa. Tutor busca às 17h', r3.resultados);

  T.secao('equipe e outro pet shop');
  const cTosa = await contexto('tosador');
  const s3 = await pedir(cTosa, 'anota que o bob tem medo de secador', [resp([uso('anotar_no_pet', { pet_id: L.pets.Bob, onde: 'alertas', texto: 'Medo de secador' })])]);
  const r4 = s3.propostas.length ? await C.responderCartoes(opcoesDe(cTosa, s3, L.sb.tosador)) : null;
  T.ok('o tosador (sem dinheiro) anota, como faria na ficha', r4?.mudou && alertas('Bob') === 'Medo de secador', r4?.resultados ?? s3.mensagens);
  const L2 = await criarLoja(T, { nome: 'Outra', equipe: false });
  const u2 = (await L2.sb.dono.auth.getUser()).data.user;
  const [p2, e2] = await Promise.all([R.lerPetshop(L2.sb.dono, L2.P), R.lerEquipe(L2.sb.dono, L2.P)]);
  const cOutra = { sb: L2.sb.dono, userId: u2.id, petshop: p2.data, eu: e2.data[0], equipe: e2.data, servicos: [], vejoFinanceiro: true, cuidoDoFinanceiro: true, fusoMin: -180, agora: `${L.hoje}T10:00` };
  const s4 = await pedir(cOutra, 'anota na mel', [resp([uso('anotar_no_pet', { pet_id: L.pets.Mel, onde: 'alertas', texto: 'Teste' })])]);
  T.ok('de outro pet shop: "Pet não encontrado", sem cartão', !s4.propostas.length && /Pet não encontrado/.test(JSON.stringify(s4.mensagens)), s4.mensagens[s4.mensagens.length - 1]);

  T.secao('modo simples nas opções');
  const antes = await R.lerPetshop(L.sb.tosador, P);
  T.ok('pet shop que nunca mexeu: desligado', M.modoSimples(antes.data) === false);
  await O.salvarOpcoes(L.sb.dono, P, { [M.CHAVE_MODO_SIMPLES]: true });
  const depois = await R.lerPetshop(L.sb.tosador, P);
  T.ok('o dono liga e a equipe recebe ligado', M.modoSimples(depois.data) === true, depois.data?.opcoes);
  T.recusa('a equipe não muda as opções', await L.sb.tosador.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { [M.CHAVE_MODO_SIMPLES]: false } }));
}))();
