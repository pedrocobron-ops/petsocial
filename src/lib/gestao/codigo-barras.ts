/**
 * Códigos de barras das etiquetas, desenhados aqui mesmo (sem biblioteca): EAN-13 quando o código tem 13 números com o
 * dígito verificador certo, senão Code 128 (o código interno "MP000001" e qualquer outro código da loja).
 * O resultado é uma lista de barras em módulos (a barra mais fina = 1), pronta para virar SVG em qualquer tamanho.
 * Sem importações: dá para testar sozinho no Node.
 */

export type Barra = { x: number; w: number };
export type Desenho = {
  tipo: "ean13" | "code128";
  /** Barras pretas, em módulos, já contando a margem branca da esquerda. */
  barras: Barra[];
  /** Largura total em módulos, com as margens brancas dos dois lados. */
  largura: number;
  /** O que sai escrito embaixo (o que o leitor devolve). */
  texto: string;
};

/* ---------- EAN-13 ---------- */

/** Dígito verificador do EAN-13 a partir dos 12 primeiros números. */
export function digitoEan13(doze: string): number {
  let soma = 0;
  for (let i = 0; i < 12; i++) soma += Number(doze[i]) * (i % 2 ? 3 : 1);
  return (10 - (soma % 10)) % 10;
}

/** 13 números com o dígito verificador certo. */
export const ean13Valido = (s: string | null | undefined) => typeof s === "string" && /^\d{13}$/.test(s) && digitoEan13(s) === Number(s[12]);

// lado esquerdo, paridade ímpar (L); o lado direito (R) é o L trocado; o G é o R de trás para a frente
const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_R = EAN_L.map((p) => p.replace(/./g, (b) => (b === "1" ? "0" : "1")));
const EAN_G = EAN_R.map((p) => p.split("").reverse().join(""));
// qual tabela (L ou G) cada um dos 6 números da esquerda usa, pelo primeiro número do código
const EAN_PARIDADE = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLG", "LGLGLG", "LGLGGL", "LGGLGL"];
const EAN_MARGEM_ESQ = 11, EAN_MARGEM_DIR = 7;

/** Os 95 módulos do EAN-13, "1" = barra. */
export function modulosEan13(codigo: string): string {
  if (!ean13Valido(codigo)) throw new Error("EAN-13 inválido");
  const d = codigo.split("").map(Number);
  const par = EAN_PARIDADE[d[0]];
  let m = "101";
  for (let i = 1; i <= 6; i++) m += (par[i - 1] === "L" ? EAN_L : EAN_G)[d[i]];
  m += "01010";
  for (let i = 7; i <= 12; i++) m += EAN_R[d[i]];
  return m + "101";
}

/* ---------- Code 128 ---------- */

/** Larguras (barra, espaço, barra, espaço, barra, espaço) dos 106 símbolos; o 106 é o fim (com a barra final de 2). */
export const CODE128 = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];
const INICIO_B = 104, INICIO_C = 105, TROCA_C = 99, TROCA_B = 100, FIM = 106;
const C128_MARGEM = 10;

/** Só os caracteres que o Code 128 escreve direto (espaço até "~"). */
export const code128Aceita = (s: string) => s.length > 0 && /^[\x20-\x7e]+$/.test(s);

/**
 * Os símbolos do Code 128 para o texto, com o verificador e o fim. Números em sequência (4 ou mais, ou o texto inteiro com
 * quantidade par) vão no conjunto C, dois por símbolo: a etiqueta pequena fica com barras mais largas e lê melhor.
 */
export function simbolosCode128(texto: string): number[] {
  if (!code128Aceita(texto)) throw new Error("Code 128: só letras sem acento, números e símbolos comuns");
  const n = texto.length;
  const corrida = (i: number) => { let j = i; while (j < n && texto.charCodeAt(j) >= 48 && texto.charCodeAt(j) <= 57) j++; return j - i; };
  const s: number[] = [];
  let conj: "B" | "C" | null = null;
  let i = 0;
  while (i < n) {
    const r = corrida(i);
    const usaC = r >= 4 || (r >= 2 && r === n - i && (conj === "C" || (i === 0 && r % 2 === 0)));
    if (usaC) {
      // número ímpar de dígitos: o primeiro vai no B (fora do C), o resto em pares
      if (r % 2 === 1) {
        if (conj !== "B") { s.push(conj === null ? INICIO_B : TROCA_B); conj = "B"; }
        s.push(texto.charCodeAt(i) - 32);
        i++;
      }
      if (conj !== "C") { s.push(conj === null ? INICIO_C : TROCA_C); conj = "C"; }
      const pares = Math.floor((r - (r % 2)) / 2);
      for (let k = 0; k < pares; k++) { s.push(Number(texto.slice(i, i + 2))); i += 2; }
    } else {
      if (conj !== "B") { s.push(conj === null ? INICIO_B : TROCA_B); conj = "B"; }
      s.push(texto.charCodeAt(i) - 32);
      i++;
    }
  }
  let soma = s[0];
  for (let k = 1; k < s.length; k++) soma += s[k] * k;
  s.push(soma % 103, FIM);
  return s;
}

/* ---------- desenho ---------- */

function barrasDeModulos(m: string, inicio: number): Barra[] {
  const barras: Barra[] = [];
  for (let i = 0; i < m.length; i++) {
    if (m[i] !== "1") continue;
    let j = i;
    while (j < m.length && m[j] === "1") j++;
    barras.push({ x: inicio + i, w: j - i });
    i = j - 1;
  }
  return barras;
}

/** O desenho do código: EAN-13 quando vale, senão Code 128. null quando não dá para desenhar (acento, vazio). */
export function desenhoDoCodigo(codigo: string | null | undefined): Desenho | null {
  const c = (codigo ?? "").trim();
  if (!c) return null;
  if (ean13Valido(c)) {
    const m = modulosEan13(c);
    return { tipo: "ean13", barras: barrasDeModulos(m, EAN_MARGEM_ESQ), largura: EAN_MARGEM_ESQ + m.length + EAN_MARGEM_DIR, texto: c };
  }
  if (!code128Aceita(c)) return null;
  const m = simbolosCode128(c).map((sim) => CODE128[sim]).join("")
    .split("").map((w, k) => (k % 2 ? "0" : "1").repeat(Number(w))).join("");
  return { tipo: "code128", barras: barrasDeModulos(m, C128_MARGEM), largura: C128_MARGEM + m.length + C128_MARGEM, texto: c };
}
