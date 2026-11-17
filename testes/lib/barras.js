// Decodificador de códigos de barras para os testes, escrito à parte do app: EAN-13 pela tabela de larguras (não a do app) e
// Code 128 pela tabela de símbolos (conferida em testes/unidade/compra-etiquetas.js), com o verificador dos dois.
// `lerModulos("0001011…")` devolve o texto lido ou null.
const { lib } = require('./app');
const C = lib('codigo-barras');

/** Módulos ("1" = barra) de um desenho do app, com as margens brancas. */
const modulos = (d) => { let s = '', x = 0; for (const b of d.barras) { s += '0'.repeat(b.x - x) + '1'.repeat(b.w); x = b.x + b.w; } return s + '0'.repeat(d.largura - x); };
const corridas = (m) => { const r = []; let i = 0; while (i < m.length) { let j = i; while (j < m.length && m[j] === m[i]) j++; r.push(j - i); i = j; } return r; };

// EAN-13 pelas larguras (espaço, barra, espaço, barra) do lado esquerdo ímpar: o G é o L de trás para a frente, o R tem as mesmas do L
const L_LARG = ['3211', '2221', '2122', '1411', '1132', '1231', '1114', '1312', '1213', '3112'];
const PARIDADE = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLG', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
function lerEan13(m) {
  const t = m.replace(/^0+|0+$/g, '');
  if (t.length !== 95 || !t.startsWith('101') || !t.endsWith('101') || t.slice(45, 50) !== '01010') return null;
  const larg = (p) => corridas(p).join('');
  let par = '', esq = '', dir = '';
  for (let i = 0; i < 6; i++) {
    const p = t.slice(3 + i * 7, 10 + i * 7), w = larg(p);
    const l = L_LARG.indexOf(w), g = L_LARG.indexOf(w.split('').reverse().join(''));
    if (p[0] !== '0') return null;
    if (l >= 0) { par += 'L'; esq += l; } else if (g >= 0) { par += 'G'; esq += g; } else return null;
  }
  for (let i = 0; i < 6; i++) {
    const p = t.slice(50 + i * 7, 57 + i * 7);
    if (p[0] !== '1') return null;
    const d = L_LARG.indexOf(larg(p));
    if (d < 0) return null;
    dir += d;
  }
  const primeiro = PARIDADE.indexOf(par);
  if (primeiro < 0) return null;
  const s = primeiro + esq + dir;
  let soma = 0; for (let i = 0; i < 12; i++) soma += Number(s[i]) * (i % 2 ? 3 : 1);
  return (10 - (soma % 10)) % 10 === Number(s[12]) ? s : null;
}
function lerCode128(m) {
  const w = corridas(m.replace(/^0+|0+$/g, ''));
  if ((w.length - 7) % 6 !== 0) return null;
  const sims = [];
  for (let i = 0; i + 6 <= w.length - 7; i += 6) { const k = C.CODE128.indexOf(w.slice(i, i + 6).join('')); if (k < 0) return null; sims.push(k); }
  if (w.slice(-7).join('') !== '2331112') return null;
  const ver = sims.pop();
  let soma = sims[0]; for (let i = 1; i < sims.length; i++) soma += sims[i] * i;
  if (soma % 103 !== ver) return null;
  let conj = sims[0] === 105 ? 'C' : sims[0] === 104 ? 'B' : null, txt = '';
  if (!conj) return null;
  for (const s of sims.slice(1)) {
    if (conj === 'C') { if (s === 100) conj = 'B'; else txt += String(s).padStart(2, '0'); } else if (s === 99) conj = 'C'; else txt += String.fromCharCode(s + 32);
  }
  return txt;
}
/** EAN-13 ou Code 128, o que der. */
const lerModulos = (m) => lerEan13(m) ?? lerCode128(m);
module.exports = { modulos, corridas, lerEan13, lerCode128, lerModulos };
