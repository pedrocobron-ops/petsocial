// Unidade: limpeza dos erros antes de irem para o banco (src/lib/gestao/erros.ts), sem banco nem servidor.
// Nada que identifique alguém pode sair daqui: nome, telefone, e-mail, valor, ficha (token), id, consulta e âncora do endereço.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-erros');
const E = lib('erros');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

const UUID = '3f2a1b4c-1111-2222-3333-444455556666';
const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

T.secao('texto');
t('e-mail vira [email]', () => assert.equal(E.limparTexto('falhou para ana.souza+x@gmail.com agora'), 'falhou para [email] agora'));
t('uuid vira :id', () => assert.equal(E.limparTexto(`pet ${UUID} sumiu`), 'pet :id sumiu'));
t('telefone com e sem máscara vira :n', () => {
  assert.equal(E.limparTexto('ligar (11) 98765-4321'), 'ligar :n');
  assert.equal(E.limparTexto('zap 5511987654321'), 'zap :n');
  assert.equal(E.limparTexto('tel 11 3456-7890'), 'tel :n');
});
t('valor em reais vira R$ :valor', () => assert.equal(E.limparTexto('cobrou R$ 1.234,56 e R$80'), 'cobrou R$ :valor e R$ :valor'));
t('JWT e ficha longa viram :token', () => {
  assert.equal(E.limparTexto(`Bearer ${JWT}`), 'Bearer :token');
  assert.equal(E.limparTexto('link a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8 aberto'), 'link :token aberto');
  assert.equal(E.limparTexto('senha=minhasenha123 ok'), 'senha=:token ok');
});
t('endereço perde consulta e âncora', () => assert.equal(E.limparTexto('em https://site.com/gestao/app?x=1&tel=11999998888#segredo fim'), 'em https://site.com/gestao/app fim'));
t('número comprido vira :n', () => assert.equal(E.limparTexto('pedido 123456789 falhou'), 'pedido :n falhou'));
t('código de erro e palavras comuns ficam', () => assert.equal(E.limparTexto('[42501] new row violates row-level security policy for table "clientes"'), '[42501] new row violates row-level security policy for table "clientes"'));
t('corta em 500 com reticências', () => { const r = E.limparTexto('a '.repeat(600)); assert.ok(r.length <= 500); assert.ok(r.endsWith('…')); });
t('caractere de controle sai', () => assert.equal(E.limparTexto('a\u0000b\u0007c'), 'a b c'));

T.secao('rota');
t('uuid na rota vira :id', () => assert.equal(E.limparRota(`/gestao/app/clientes/${UUID}`), '/gestao/app/clientes/:id'));
t('ficha do tutor e foto viram :id', () => assert.equal(E.limparRota(`/gestao/tutor/${'ab12'.repeat(12)}/foto/${UUID}`), '/gestao/tutor/:id/foto/:id'));
t('código do link vira :id (mesmo curto)', () => assert.equal(E.limparRota('/gestao/agendar/banho-cia/pedido/77'), '/gestao/agendar/:id/pedido/:id'));
t('consulta e âncora saem', () => assert.equal(E.limparRota('/gestao/app/agenda?dia=2026-11-16&tel=1199#x'), '/gestao/app/agenda'));
t('endereço inteiro vira só o caminho', () => assert.equal(E.limparRota('https://maestro.pet/gestao/app/caixa?x=1'), '/gestao/app/caixa'));
t('número, e-mail e trecho com espaço viram :id', () => assert.equal(E.limparRota('/x/123/ana@x.com/Ana%20Souza'), '/x/:id/:id/:id'));
t('rota normal fica igual', () => assert.equal(E.limparRota('/gestao/app/creche-hotel'), '/gestao/app/creche-hotel'));

T.secao('pilha');
const chrome = [
  `TypeError: Cannot read properties of undefined (reading 'nome') para ana@x.com`,
  '    at Hoje (https://maestro.pet/_next/static/chunks/app/page-0a1b2c3d.js?dpl=abc:12:345)',
  '    at renderWithHooks (https://maestro.pet/_next/static/chunks/framework.js:1:2)',
  '    at chrome-extension://abc/inject.js:1:1',
  '    at async Promise.all (index 0)',
  '    at x (https://maestro.pet/a.js:1:1)', '    at y (https://maestro.pet/b.js:2:2)', '    at z (https://maestro.pet/c.js:3:3)',
  '    at w (https://maestro.pet/d.js:4:4)', '    at v (https://maestro.pet/e.js:5:5)',
].join('\n');
t('Chrome: só quadros com arquivo:linha, sem site, sem consulta, sem a mensagem', () => {
  const p = E.limparPilha(chrome).split('\n');
  assert.equal(p[0], 'Hoje (/_next/static/chunks/app/page-0a1b2c3d.js:12:345)');
  assert.equal(p[1], 'renderWithHooks (/_next/static/chunks/framework.js:1:2)');
  assert.ok(!p.join('\n').includes('ana@x.com'));
  assert.ok(!p.join('\n').includes('extension'));
  assert.equal(p.length, 6);
});
t('nome de arquivo do site (pedaço com número) fica', () => assert.equal(E.limparPilha('    at a (https://x.com/_next/static/chunks/4bd1b696-c023c6e3521b4ea0.js:1:2)'), 'a (/_next/static/chunks/4bd1b696-c023c6e3521b4ea0.js:1:2)'));
t('Firefox/Safari: função@endereço:linha:coluna', () => assert.equal(E.limparPilha('Hoje@https://maestro.pet/_next/a.js?v=2:7:9\n@https://maestro.pet/b.js:1:1'), 'Hoje (/_next/a.js:7:9)\n/b.js:1:1'));
t('pilha vazia ou estranha não quebra', () => { assert.equal(E.limparPilha(undefined), ''); assert.equal(E.limparPilha('qualquer coisa'), ''); });

T.secao('navegador');
t('Chrome no Android', () => assert.equal(E.navegadorDe('Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.135 Mobile Safari/537.36'), 'Chrome 131 · Android'));
t('Safari no iPhone', () => assert.equal(E.navegadorDe('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'), 'Safari 17 · iOS'));
t('Edge no Windows', () => assert.equal(E.navegadorDe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 Edg/131.0'), 'Edge 131 · Windows'));
t('Samsung Internet', () => assert.equal(E.navegadorDe('Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36'), 'Samsung 25 · Android'));
t('Firefox no Linux', () => assert.equal(E.navegadorDe('Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0'), 'Firefox 132 · Linux'));

T.secao('o que entra e o que fica de fora');
const erroBanco = (msg, code) => Object.assign(new Error(msg), { code });
t('erro do código entra', () => assert.equal(E.classificar(new TypeError('x is undefined'), true), 'erro'));
t('recusa técnica do banco entra', () => { assert.equal(E.classificar(erroBanco('new row violates row-level security policy', '42501'), true), 'banco'); assert.equal(E.classificar(new Error('column agendamentos.preco does not exist'), true), 'banco'); });
t('frase para a pessoa não entra (validação e regra do banco)', () => {
  assert.equal(E.classificar(new Error('Escolha um horário.'), true), null);
  assert.equal(E.classificar(erroBanco('Esse pedido já foi respondido.', 'P0001'), true), null);
  assert.equal(E.classificar(erroBanco('duplicate key value violates unique constraint', '23505'), true), null);
});
t('sem internet só conta; com internet a falha de rede entra', () => {
  assert.equal(E.classificar(new TypeError('Failed to fetch'), false), 'sem_internet');
  assert.equal(E.classificar(new TypeError('Failed to fetch'), true), 'banco');
});
t('Mozart fora do ar (503), cancelamento e ruído do navegador ficam de fora', () => {
  assert.ok(E.ignorar('O Mozart está fora do ar agora.'));
  assert.ok(E.ignorar('Resposta 503'));
  assert.ok(E.ignorar('The operation was aborted.', 'AbortError'));
  assert.ok(E.ignorar('ResizeObserver loop completed with undelivered notifications.'));
  assert.ok(E.ignorar('Script error.'));
  assert.ok(E.ignorar('x', 'Error', 'at chrome-extension://abc/x.js:1:1'));
  assert.ok(!E.ignorar("Cannot read properties of undefined (reading 'nome')", 'TypeError'));
});

T.secao('pacote completo');
t('montarErro: tudo limpo e nos limites', () => {
  const e = new TypeError(`Falhou para ${UUID} ana@x.com (11) 98765-4321 R$ 50,00`);
  e.stack = chrome;
  const p = E.montarErro({ erro: e, tipo: 'erro', rota: `/gestao/app/clientes/${UUID}?q=Ana#x`, versao: 'abc123def456789', ua: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/131.0 Safari/537.36',
    largura: 390.4, altura: 844, petshop: UUID, aparelho: 'a1b2c3d4e5f6a7b8' });
  assert.equal(p.p_mensagem, 'Falhou para :id [email] :n R$ :valor');
  assert.equal(p.p_nome, 'TypeError');
  assert.equal(p.p_rota, '/gestao/app/clientes/:id');
  assert.equal(p.p_versao, 'abc123def456789');
  assert.equal(p.p_tela, '390x844');
  assert.equal(p.p_navegador, 'Chrome 131 · Linux');
  assert.equal(p.p_petshop, UUID);
  const tudo = JSON.stringify({ ...p, p_petshop: '' });
  for (const proibido of ['ana', '98765', '50,00', 'q=', '#x', UUID]) assert.ok(!tudo.includes(proibido), proibido);
});
t('montarErro: código do banco vai na frente', () => assert.equal(E.montarErro({ erro: erroBanco('permission denied for table x', '42501'), tipo: 'banco' }).p_mensagem, '[42501] permission denied for table x'));
t('montarErro: pet shop inválido não vai', () => assert.equal(E.montarErro({ erro: new Error('x'), tipo: 'erro', petshop: 'qualquer' }).p_petshop, undefined));

(async () => T.rodar(async () => {}))();
