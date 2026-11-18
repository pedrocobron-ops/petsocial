// Unidade, rodada 9 (desenho e acessibilidade), sem banco e sem navegador:
// - tempo do aviso rápido pelo tamanho do texto (src/lib/gestao/desenho.ts: tempoDoAviso);
// - falta de internet não é "a tela travou" (ehFaltaDeInternet);
// - a volta do Tab dentro de uma folha (proximoNoTab);
// - comprovante para bobina de 58 e 80 mm e para folha comum (comprovante.ts: htmlDoComprovante; comprovante-papel.ts);
// - contraste das cores do CSS (gestao.css): texto de dica, borda de campo, botão do WhatsApp e etiqueta pêssego em WCAG AA.
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { lib } = require('../lib/app');
const { RAIZ } = require('../lib/base');
const T = require('../lib/teste')('unidade-desenho');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const D = lib('desenho'), C = lib('comprovante'), P = lib('comprovante-papel'), U = lib('util');

T.secao('tempo do aviso rápido');
t('frase curta fica 4 s (antes sumia em 2,6 s)', () => assert.equal(D.tempoDoAviso('Salvo.'), 4000));
t('frase comprida fica o tempo de ler: 60 ms por letra', () => {
  const frase = 'Maximiliano Bartolomeu Von Schnauzer III marcado para hoje às 15:00, com o Tito, banho e tosa completa.';
  assert.equal(D.tempoDoAviso(frase), frase.length * 60);
  assert.ok(D.tempoDoAviso(frase) > 6000);
});
t('erro fica pelo menos 6 s; com botão (Desfazer), pelo menos 8 s', () => {
  assert.equal(D.tempoDoAviso('Não deu.', { erro: true }), 6000);
  assert.equal(D.tempoDoAviso('Horário apagado.', { acao: true }), 8000);
});
t('nunca passa de 12 s', () => assert.equal(D.tempoDoAviso('x'.repeat(900)), 12000));
t('texto vazio não quebra', () => assert.equal(D.tempoDoAviso(''), 4000));

T.secao('sem internet não é "a tela travou"');
t('aparelho sem conexão: qualquer erro de tela é falta de internet', () => assert.equal(D.ehFaltaDeInternet(new Error('qualquer'), false), true));
t('com conexão, pedaço da tela que não baixou (ChunkLoadError)', () => {
  assert.equal(D.ehFaltaDeInternet(Object.assign(new Error('Loading chunk 123 failed.'), { name: 'ChunkLoadError' }), true), true);
  assert.equal(D.ehFaltaDeInternet(new Error('Failed to fetch dynamically imported module: https://x/y.js'), true), true);
});
t('com conexão, erro comum da tela continua sendo erro', () => {
  assert.equal(D.ehFaltaDeInternet(new TypeError("Cannot read properties of undefined (reading 'nome')"), true), false);
  assert.equal(D.ehFaltaDeInternet(null, true), false);
});

T.secao('Tab dentro da folha');
t('no último, Tab volta ao primeiro; no primeiro, Shift+Tab vai ao último', () => {
  assert.equal(D.proximoNoTab(5, 4, false), 0);
  assert.equal(D.proximoNoTab(5, 0, true), 4);
});
t('no meio, o navegador segue sozinho', () => { assert.equal(D.proximoNoTab(5, 2, false), null); assert.equal(D.proximoNoTab(5, 2, true), null); });
t('com o foco fora da lista (folha recém-aberta), entra pelo primeiro ou pelo último', () => {
  assert.equal(D.proximoNoTab(5, -1, false), 0);
  assert.equal(D.proximoNoTab(5, -1, true), 4);
});
t('folha sem nada para focar', () => assert.equal(D.proximoNoTab(0, -1, false), null));

T.secao('comprovante: folha comum e bobina');
const texto = ['Oi, Ana! Segue o comprovante do atendimento de Thor.', '', 'Pet Shop <Estrela>', 'Data: 18/11/2026', 'Pet: Thor', '',
  'Banho e tosa: R$ 90,00', '2 x Ração Super Premium Cães Adultos Raças Grandes 15 kg (R$ 12.345,67 cada): R$ 24.691,34', 'Desconto: - R$ 5,00', 'Total: R$ 24.776,34', 'Pagamento: Pix', '', 'Este comprovante não é nota fiscal.'].join('\n');
t('papel padrão é a folha comum (quem nunca mexeu continua igual)', () => {
  assert.equal(P.papelDoComprovante({}), 'a4');
  assert.equal(P.papelDoComprovante({ opcoes: { 'comprovante.papel': 'qualquer' } }), 'a4');
  assert.equal(P.papelDoComprovante({ opcoes: { 'comprovante.papel': '80' } }), '80');
  assert.equal(P.papelDoComprovante({ opcoes: { 'comprovante.papel': '58' } }), '58');
});
t('folha comum: margem de 14 mm como sempre', () => {
  const h = C.htmlDoComprovante(texto, 'Comprovante de atendimento', { papel: 'a4', contato: '' });
  assert.match(h, /@page \{ margin: 14mm; \}/);
  assert.ok(!/size: 80mm/.test(h));
});
for (const [papel, larg] of [['80', '80mm'], ['58', '58mm']]) {
  t(`bobina de ${papel} mm: página de ${larg}, margem mínima e tudo em preto`, () => {
    const h = C.htmlDoComprovante(texto, 'Comprovante de atendimento', { papel, contato: '(11) 99999-0000 · São Paulo/SP' });
    assert.match(h, new RegExp(`@page \\{ size: ${larg} 297mm; margin: [23]mm [34]mm; \\}`));
    assert.match(h, /color: #000/);
    assert.ok(!/#6a625a|#b9ae9f/.test(h), 'sem cinza na bobina');
    assert.match(h, /<p class="c">\(11\) 99999-0000 · São Paulo\/SP<\/p>/);
  });
}
t('cada linha com valor vira nome à esquerda e valor à direita', () => {
  const h = C.htmlDoComprovante(texto, 'Comprovante', { papel: '80', contato: '' });
  assert.match(h, /<p class="f"><span>Banho e tosa<\/span><b>R\$ 90,00<\/b><\/p>/);
  assert.match(h, /<span>2 x Ração Super Premium Cães Adultos Raças Grandes 15 kg \(R\$ 12\.345,67 cada\)<\/span><b>R\$ 24\.691,34<\/b>/);
  assert.match(h, /<p class="f"><span>Desconto<\/span><b>- R\$ 5,00<\/b><\/p>/);
  assert.match(h, /<p class="t f"><span>Total<\/span><b>R\$ 24\.776,34<\/b><\/p>/);
  assert.match(h, /<p>Pagamento: Pix<\/p>/);
});
t('o nome do pet shop não vira HTML e a saudação do WhatsApp não é impressa', () => {
  const h = C.htmlDoComprovante(texto, 'Comprovante', { papel: 'a4', contato: '' });
  assert.match(h, /<h1>Pet Shop &lt;Estrela&gt;<\/h1>/);
  assert.ok(!h.includes('Oi, Ana'));
});

T.secao('contraste das cores (WCAG AA)');
const css = fs.readFileSync(path.join(RAIZ, 'src', 'app', 'gestao.css'), 'utf8');
const hex = (h) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16));
const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const mix = (fg, bg, a) => fg.map((v, i) => Math.round(v * a + bg[i] * (1 - a)));
const token = (nome) => { const m = new RegExp(`${nome}: ([^;]+);`).exec(css); if (!m) throw new Error(`sem ${nome} no CSS`); return m[1].trim(); };
t('texto de dica dentro do campo: pelo menos 4,5:1', () => assert.ok(cr(hex(token('--g-apagado')), hex('#fffdf9')) >= 4.5));
t('borda de campo, chip e botão de contorno: pelo menos 3:1 sobre o creme e sobre o campo', () => {
  const a = Number(/rgba\(31, 27, 23, (\.\d+)\)/.exec(token('--g-linha-forte'))[1]);
  for (const fundo of ['#fffdf9', '#f6f1e8', '#fffbf5']) assert.ok(cr(mix(hex('#1f1b17'), hex(fundo), a), hex(fundo)) >= 3, fundo);
});
t('botão do WhatsApp: texto branco com pelo menos 4,5:1', () => assert.ok(cr(hex('#ffffff'), hex(token('--g-zap'))) >= 4.5));
t('etiqueta pêssego: pelo menos 4,5:1', () => assert.ok(cr(hex(token('--i-pessego')), hex(token('--t-pessego'))) >= 4.5));
t('contorno do foco sobre o verde: claro (pelo menos 3:1)', () => {
  assert.match(css, /\.g-lado[^{]*:focus-visible[^{]*\{ outline-color: var\(--g-creme\); \}/);
  assert.ok(cr(hex(token('--g-creme')), hex('#1e3a2f')) >= 3);
});
t('iniciais do avatar: toda cor de fundo dá pelo menos 4,5:1 com a letra clara', () => {
  const cores = new Set();
  for (let i = 0; i < 400; i++) cores.add(U.corDoNome('nome ' + i));
  for (const c of cores) assert.ok(cr(hex('#fffbf5'), hex(c)) >= 4.5, c);
});

T.rodar(async () => {});
