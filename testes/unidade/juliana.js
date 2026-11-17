// Unidade: o que a testadora Juliana achou (16/11/2026).
//  - o Mozart escreveu "Tutora Teste 1" para o cadastro "Tutor Teste 1" (assistente/parecido.ts, manterNomes e nomesDosResultados);
//  - cores repetidas na agenda (cores.ts: corLivre e trocasDeCor);
//  - onde cada opção de "O que o seu negócio faz?" fica no menu e quando a folha pergunta do link (modulos.ts).
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-juliana');
const P = lib('assistente/parecido');
const C = lib('cores');
const M = lib('modulos');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

T.secao('nomes do cadastro na resposta do Mozart');
const nomes = ['Tutor Teste 1', 'Mel', 'Ana Souza'];
t('"Tutora Teste 1" volta a ser "Tutor Teste 1"', () => assert.equal(P.manterNomes('Prontinho! A Mel é da Tutora Teste 1.', nomes), 'Prontinho! A Mel é da Tutor Teste 1.'));
t('o nome certo fica igual', () => assert.equal(P.manterNomes('Marquei a Mel (Tutor Teste 1).', nomes), 'Marquei a Mel (Tutor Teste 1).'));
t('"Ano Souza" vira "Ana Souza"; "ana souza" (só a caixa) fica como está', () => { assert.equal(P.manterNomes('Falei com o Ano Souza', nomes), 'Falei com o Ana Souza'); assert.equal(P.manterNomes('é da ana souza', nomes), 'é da ana souza'); });
t('Bruno Silva e Bruna Silva no cadastro: nada é trocado', () => assert.equal(P.manterNomes('A Bruna Silva pagou.', ['Bruno Silva', 'Bruna Silva']), 'A Bruna Silva pagou.'));
t('nome de uma palavra só não é mexido (Bruno e Bruna podem ser duas pessoas)', () => assert.equal(P.manterNomes('A Bruna ligou.', ['Bruno']), 'A Bruna ligou.'));
t('palavra dentro de outra não conta', () => assert.equal(P.manterNomes('Tutoras Teste 12', ['Tutor Teste 1']), 'Tutoras Teste 12'));
t('nomes tirados dos resultados (buscar_pets e o cartão confirmado)', () => {
  const achados = P.nomesDosResultados([
    JSON.stringify({ pets: [{ pet_id: 'x', nome: 'Mel', tutor: 'Tutor Teste 1', cliente_id: 'y' }] }),
    JSON.stringify({ feito: true, cartao_confirmado: { titulo: 'Marcar horário', linhas: ['Pet: Thor (Ana Souza)', 'Tutor: Beto Lima (novo)'] } }),
    'texto solto',
  ]);
  for (const n of ['Mel', 'Tutor Teste 1', 'Thor', 'Ana Souza', 'Beto Lima']) assert.ok(achados.includes(n), n);
  assert.ok(!achados.includes('novo'));
});

T.secao('cores da agenda');
t('corLivre pula as usadas (sem ligar para maiúsculas)', () => assert.equal(C.corLivre(['#F97316', '#3b82a0']), '#4d8f6b'));
t('as cores dos serviços que entram com o banho e tosa são todas diferentes', () => assert.equal(new Set(M.SERVICOS_BANHO_TOSA.map((s) => s.cor)).size, M.SERVICOS_BANHO_TOSA.length));
t('cada cor tem nome (leitor de tela) e nenhuma se repete', () => { assert.equal(new Set(C.CORES).size, C.CORES.length); for (const c of C.CORES) assert.ok(C.NOME_COR[c], c); });
const lista = [
  { id: 'a', nome: 'Banho', cor: '#3b82a0', ativo: true, ordem: 1 },
  { id: 'b', nome: 'Tosa higiênica', cor: '#7c6fb0', ativo: true, ordem: 3 },
  { id: 'c', nome: 'Banho de ofurô', cor: '#7C6FB0', ativo: true, ordem: 6 },
  { id: 'd', nome: 'Antigo', cor: '#3b82a0', ativo: false, ordem: 7 },
];
t('Tosa higiênica e Banho de ofurô (roxo): o de ofurô ganha uma cor livre; o desativado não conta', () => {
  const tr = C.trocasDeCor(lista);
  assert.equal(tr.length, 1);
  assert.equal(tr[0].id, 'c'); assert.equal(tr[0].igualA, 'Tosa higiênica');
  assert.ok(!['#3b82a0', '#7c6fb0'].includes(tr[0].para));
});
t('sem repetidas, nada a trocar', () => assert.deepEqual(C.trocasDeCor(lista.slice(0, 2)), []));
t('mais serviços que cores: troca só enquanto sobra cor livre', () => {
  const muitos = Array.from({ length: 16 }, (_, i) => ({ id: `s${i}`, nome: `S${i}`, cor: C.CORES[i % 4], ativo: true, ordem: i }));
  const tr = C.trocasDeCor(muitos);
  assert.equal(tr.length, C.CORES.length - 4);
  assert.equal(new Set(tr.map((x) => x.para)).size, tr.length);
});
t('donoDaCor diz quem já usa a cor', () => assert.equal(C.donoDaCor('#7C6FB0', lista), 'Tosa higiênica'));

T.secao('Personalizar: onde cada opção fica no menu e a pergunta do link');
t('banho e tosa na Agenda, venda de produtos em Estoque e Caixa, pacotes em Pacotes', () => {
  assert.equal(M.noMenu('banho_tosa', []), 'Agenda'); assert.equal(M.noMenu('loja', []), 'Estoque e Caixa'); assert.equal(M.noMenu('pacotes', []), 'Pacotes');
});
t('creche e hotel ligados: um item só, "Creche e hotel"', () => { assert.match(M.noMenu('creche', ['creche', 'hotel']), /^Creche e hotel/); assert.match(M.noMenu('hotel', ['creche', 'hotel']), /^Creche e hotel/); });
t('só um dos dois: "Creche" ou "Hotel" (o mesmo nome que o menu usa)', () => {
  assert.equal(M.noMenu('hotel', ['banho_tosa', 'hotel']), 'Hotel'); assert.equal(M.nomeDaCasa({ modulos: ['banho_tosa', 'hotel'] }), 'Hotel');
  assert.equal(M.noMenu('creche', ['creche']), 'Creche'); assert.equal(M.nomeDaCasa({ modulos: ['creche'] }), 'Creche');
  assert.equal(M.nomeDaCasa({ modulos: ['creche', 'hotel'] }), 'Creche e hotel');
});
const loja = { modulos: ['banho_tosa'], link_ativo: true, link_creche: false, link_hotel: false };
t('ligar o hotel com o link ligado: pergunta do link (nada muda sozinho)', () => assert.deepEqual(M.linkPergunta(loja, ['banho_tosa', 'hotel']), ['hotel']));
t('link desligado, hotel já no link ou hotel já ligado antes: não pergunta', () => {
  assert.deepEqual(M.linkPergunta({ ...loja, link_ativo: false }, ['banho_tosa', 'hotel']), []);
  assert.deepEqual(M.linkPergunta({ ...loja, link_hotel: true }, ['banho_tosa', 'hotel']), []);
  assert.deepEqual(M.linkPergunta({ ...loja, modulos: ['banho_tosa', 'hotel'] }, ['banho_tosa', 'hotel']), []);
});
t('creche e hotel juntos: pergunta das duas', () => assert.deepEqual(M.linkPergunta(loja, ['banho_tosa', 'creche', 'hotel']), ['creche', 'hotel']));

(async () => T.rodar(async () => {}))();
