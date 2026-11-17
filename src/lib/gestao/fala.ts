/**
 * Ler as respostas do Mozart em voz alta com a voz que já vem no aparelho (speechSynthesis, sem custo):
 * qual voz escolher e como deixar o texto bom de ouvir. Sem nada do navegador aqui, para dar para testar no Node.
 */

/** O que interessa de uma voz do aparelho (SpeechSynthesisVoice). */
export type VozDoAparelho = { name: string; lang: string; voiceURI?: string; localService?: boolean; default?: boolean };

const idioma = (v: VozDoAparelho) => (v.lang ?? "").replace(/_/g, "-").toLowerCase();
export const ehPortugues = (v: VozDoAparelho) => idioma(v) === "pt" || idioma(v).startsWith("pt-");
export const ehDoBrasil = (v: VozDoAparelho) => idioma(v) === "pt-br" || /brasil|brazil/i.test(v.name);

/**
 * Nota de uma voz (maior é melhor; -1: não é português). Ordem: vozes naturais do Edge ("Microsoft Francisca Online
 * (Natural)"), depois a do Google ("Google português do Brasil"), depois as aprimoradas da Apple, as outras do Brasil e,
 * por último, as de Portugal.
 */
export function notaDaVoz(v: VozDoAparelho): number {
  if (!ehPortugues(v)) return -1;
  // do Brasil sempre antes de Portugal; dentro de cada um, a qualidade da voz
  let n = ehDoBrasil(v) ? 10_000 : 0;
  const nome = v.name ?? "";
  if (/natural|online|neural/i.test(nome)) n += 1000;
  else if (/google/i.test(nome)) n += 500;
  else if (/premium|enhanced|aprimorad|melhorad|siri/i.test(nome)) n += 300;
  if (/francisca/i.test(nome)) n += 20;
  else if (/antonio|thalita/i.test(nome)) n += 10;
  // vozes antigas e robóticas do Windows e do eSpeak (Linux) por último dentro do idioma
  if (/espeak|desktop/i.test(nome)) n -= 50;
  return n;
}

/** Vozes em português, da melhor para a pior. */
export function vozesEmPortugues<T extends VozDoAparelho>(vozes: readonly T[]): T[] {
  return vozes.filter(ehPortugues).map((v, i) => ({ v, i, n: notaDaVoz(v) })).sort((a, b) => b.n - a.n || a.i - b.i).map((x) => x.v);
}

/** A voz a usar: a escolhida pela pessoa (pelo voiceURI ou nome), se ainda existe neste aparelho; senão, a melhor. */
export function melhorVoz<T extends VozDoAparelho>(vozes: readonly T[], escolhida?: string | null): T | null {
  const pt = vozesEmPortugues(vozes);
  if (escolhida) {
    const v = pt.find((x) => (x.voiceURI || x.name) === escolhida) ?? pt.find((x) => x.name === escolhida);
    if (v) return v;
  }
  return pt[0] ?? null;
}

/** Nome curto para a lista: "Francisca (natural)", "Google português do Brasil", "Joana (Portugal)". */
export function nomeDaVoz(v: VozDoAparelho): string {
  let n = (v.name ?? "").replace(/^Microsoft\s+/i, "").replace(/\s*-\s*Portuguese.*$/i, "").replace(/\s*\((Natural)\)/i, " (natural)").replace(/\s+Online/i, "").trim();
  if (!ehDoBrasil(v)) n += " (Portugal)";
  return n || v.lang;
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** "R$ 1.250,50" → "1250 reais e 50 centavos"; "R$ 60,00" → "60 reais"; "R$ 1" → "1 real". */
function dinheiro(inteiro: string, centavos?: string) {
  const r = Number(inteiro.replace(/\./g, ""));
  const c = centavos ? Number(centavos.padEnd(2, "0").slice(0, 2)) : 0;
  const reais = r ? `${r} ${r === 1 ? "real" : "reais"}` : "";
  const cent = c ? `${c} ${c === 1 ? "centavo" : "centavos"}` : "";
  return reais && cent ? `${reais} e ${cent}` : reais || cent || "zero reais";
}

/**
 * O texto como deve ser falado: sem markdown, links, emoji e símbolos; dinheiro, horas e datas por extenso do jeito que
 * se fala ("R$ 60,00" → "60 reais", "10h30" → "10 e 30", "20/11" → "20 de novembro"); cada linha vira uma frase.
 */
export function textoParaFalar(t: string): string {
  let s = t ?? "";
  s = s.replace(/```[\s\S]*?```/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+|www\.\S+/gi, " ")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*(?:[-*•+]|\d+[.)])\s+/gm, "")
    .replace(/(\*\*|__|\*|_|`|~~)(?=\S)([^\n]*?\S)\1/g, "$2");
  s = s.replace(/R\$\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?/g, (_, i: string, c?: string) => dinheiro(i, c));
  s = s.replace(/\b(\d{1,2})h(\d{2})\b/g, (_, h: string, m: string) => `${Number(h)} e ${m}`)
    .replace(/\b(\d{1,2})h\b/g, (_, h: string) => `${Number(h)} ${Number(h) === 1 ? "hora" : "horas"}`)
    .replace(/\b(\d{1,2}):(\d{2})\b/g, (_, h: string, m: string) => (m === "00" ? `${Number(h)} ${Number(h) === 1 ? "hora" : "horas"}` : `${Number(h)} e ${m}`));
  s = s.replace(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g, (x, d: string, m: string) => {
    const mes = Number(m), dia = Number(d);
    return mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31 ? `${dia} de ${MESES[mes - 1]}` : x;
  });
  s = s.replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu, " ")
    .replace(/\s*&\s*/g, " e ")
    .replace(/[·|*_#~^<>=\\{}[\]"“”`]/g, " ")
    .replace(/\s*\/\s*/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1");
  // cada linha (item de lista) termina numa pausa
  s = s.split(/\n+/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean).map((l) => (/[.!?…:;,]$/.test(l) ? l : `${l}.`)).join(" ");
  return s.replace(/\s+/g, " ").trim();
}

/** Uma frase longa demais é cortada nas vírgulas (o Chrome para de falar no meio de uma fala muito longa). */
const MAX_FRASE = 220;
function cortarLonga(f: string): string[] {
  if (f.length <= MAX_FRASE) return [f];
  const partes: string[] = [];
  let atual = "";
  for (const p of f.split(/(?<=[,;:])\s+/)) {
    if (atual && (atual + " " + p).length > MAX_FRASE) { partes.push(atual); atual = p; } else atual = atual ? `${atual} ${p}` : p;
  }
  if (atual) partes.push(atual);
  return partes;
}

/** O texto (já limpo) em frases, para falar uma de cada vez. */
export function dividirEmFrases(t: string): string[] {
  return t.split(/(?<=[.!?…])\s+/).map((f) => f.trim()).filter((f) => /[\p{L}\p{N}]/u.test(f)).flatMap(cortarLonga);
}

/**
 * Para o texto que chega aos poucos: guarda os pedaços e devolve as frases que já fecharam (terminam em . ! ? ou numa
 * quebra de linha seguida de mais texto). `terminar` devolve o que sobrou.
 */
export function criarJuntaFrases() {
  let resto = "";
  return {
    acrescentar(pedaco: string): string[] {
      resto += pedaco;
      // o fim da última frase completa: pontuação seguida de espaço, ou quebra de linha
      let corte = -1;
      const re = /[.!?…](?=\s)|\n/g;
      for (let m = re.exec(resto); m; m = re.exec(resto)) corte = m.index + 1;
      if (corte <= 0) return [];
      const pronto = resto.slice(0, corte);
      resto = resto.slice(corte);
      return dividirEmFrases(textoParaFalar(pronto));
    },
    terminar(): string[] {
      const r = resto;
      resto = "";
      return dividirEmFrases(textoParaFalar(r));
    },
  };
}
