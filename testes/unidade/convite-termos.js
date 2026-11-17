// Unidade: convite, Termos e Ajuda depois do teste de 17/11 (Juliana, Neide, Camila).
//  - textos do link do convite que não vale (convite.ts, avisoDoConvite): cada situação diz o motivo, com o nome do pet shop,
//    e o e-mail certo só aparece quando veio do próprio link;
//  - Termos e Política 2.3 (documentos.ts): versão nova pede o aceite de novo, com o resumo do que mudou;
//  - a Ajuda acha a resposta para "vocês fazem cópia dos meus dados?" e para "como mudar de plano" (manual.ts).
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-convite-termos');
const C = lib('convite');
const D = lib('documentos');
const A = lib('ajuda');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

T.secao('textos do convite');
t('link que vale: nada a avisar', () => assert.equal(C.avisoDoConvite('valido', 'Banho da Neide'), null));
t('cada situação tem título e texto próprios', () => {
  const vistos = new Set();
  for (const s of ['vencido', 'usado', 'substituido', 'cancelado', 'invalido', 'outro_email', 'muitos']) {
    const a = C.avisoDoConvite(s, 'Banho da Neide');
    assert.ok(a && a.titulo && a.texto, s);
    assert.ok(!vistos.has(a.titulo), 'título repetido: ' + a.titulo);
    vistos.add(a.titulo);
  }
});
t('vencido, trocado e cancelado dizem de qual pet shop é', () => {
  for (const s of ['vencido', 'substituido', 'cancelado']) assert.match(C.avisoDoConvite(s, 'Banho da Neide').texto, /Banho da Neide/, s);
});
t('trocado por um mais novo: diz que só o mais recente funciona', () => assert.match(C.avisoDoConvite('substituido', null).texto, /só o mais recente funciona/));
t('outro e-mail: mostra o e-mail do link, quando ele veio no link', () => assert.match(C.avisoDoConvite('outro_email', 'X', 'ana@ex.com').texto, /Use ana@ex\.com/));
t('outro e-mail sem e-mail no link: não inventa nenhum', () => assert.ok(!/@/.test(C.avisoDoConvite('outro_email', 'X').texto)));
t('nenhum texto repete "Peça ao dono do pet shop para mandar o convite de novo" (L3)', () => {
  for (const s of ['vencido', 'usado', 'substituido', 'cancelado', 'invalido']) assert.ok(!/Peça ao dono do pet shop para mandar o convite de novo/.test(C.avisoDoConvite(s, 'X').texto));
});
t('sem nome do pet shop: "do pet shop", sem "de null"', () => assert.ok(!/null|undefined/.test(JSON.stringify(['vencido', 'cancelado', 'usado'].map((s) => C.avisoDoConvite(s, null))))));

T.secao('Termos e Política 2.3');
t('as duas na versão 2.3', () => { assert.equal(D.DOCUMENTOS.termos.versao, '2.3'); assert.equal(D.DOCUMENTOS.privacidade.versao, '2.3'); });
t('quem aceitou a 2.2 vê a tela de aceite de novo', () => assert.deepEqual(D.pendentes([{ documento: 'termos', versao: '2.2' }, { documento: 'privacidade', versao: '2.2' }]), ['termos', 'privacidade']));
t('quem aceitou a 2.3 segue direto', () => assert.deepEqual(D.pendentes([{ documento: 'termos', versao: '2.3' }, { documento: 'privacidade', versao: '2.3' }]), []));
t('o resumo do que mudou fala de cópias, troca de plano e cookies', () => {
  const m = D.MUDANCAS.join(' ');
  assert.match(m, /Cópias de segurança/); assert.match(m, /Mudar de plano/); assert.match(m, /Cookies/);
});
t('o cadastro manda a versão 2.3', () => assert.deepEqual(D.aceiteDoCadastro(), { termos: '2.3', privacidade: '2.3' }));

T.secao('Ajuda');
const tema = (q) => A.procurarTopico(q)?.id;
t('"vocês fazem cópia dos meus dados?" acha o tópico das cópias', () => assert.equal(tema('vocês fazem cópia dos meus dados?'), 'copias'));
t('"vocês fazem backup?" também', () => assert.equal(tema('vocês fazem backup?'), 'copias'));
t('o tópico diz o que existe e não promete prazo', () => {
  const r = A.TOPICOS.find((x) => x.id === 'copias').resposta;
  assert.match(r, /Supabase/); assert.match(r, /cópia completa/); assert.match(r, /Não prometemos/); assert.match(r, /Baixar todos os dados/);
  assert.ok(!/todo dia|diariamente|30 dias/.test(r), r);
});
t('o guia da Ajuda (modelo) leva o tópico das cópias', () => assert.match(A.INSTRUCOES_AJUDA, /Vocês fazem cópia dos meus dados\?/));
t('"como baixar a cópia de segurança" continua no tópico de baixar', () => assert.equal(tema('como baixar a cópia de segurança'), 'copia'));
t('"como mudar de plano" explica os meses que sobraram', () => {
  assert.equal(tema('como mudar de plano'), 'assinatura');
  assert.match(A.TOPICOS.find((x) => x.id === 'assinatura').resposta, /não viram crédito/);
});
t('convite: o manual fala da pergunta antes do link novo', () => assert.match(A.TOPICOS.find((x) => x.id === 'equipe-login').resposta, /pergunta antes/));

(async () => T.rodar(async () => {}))();
