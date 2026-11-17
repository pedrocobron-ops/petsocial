import { semAcento } from "../util";

/**
 * Nomes parecidos, para pedidos falados: o ditado do navegador erra nomes de pet ("tor" por "Thor", "mau" por "Mel",
 * "luna" por "Lunna"). Sem achar o nome exato, o Mozart recebe os parecidos e pergunta qual é quando há mais de um.
 */

/** Grafia "pelo som": sem acento, sem letra dobrada, sem h mudo, letras que soam igual viram uma só. */
export function pelaFala(s: string): string {
  return semAcento(s)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p
      .replace(/ph/g, "f").replace(/th/g, "t").replace(/sh|ch/g, "x").replace(/lh/g, "li").replace(/nh/g, "ni")
      .replace(/^h/, "").replace(/h/g, "")
      .replace(/y/g, "i").replace(/w/g, "v").replace(/k/g, "c").replace(/qu(?=[ei])/g, "c").replace(/q/g, "c")
      .replace(/c(?=[ei])/g, "s").replace(/g(?=[ei])/g, "j").replace(/z/g, "s")
      .replace(/(.)\1+/g, "$1")
      .replace(/l$/, "u"))
    .join(" ");
}

/** Distância de edição (Levenshtein) com teto: passou do teto, devolve teto + 1. */
export function distancia(a: string, b: string, teto = 3): number {
  if (Math.abs(a.length - b.length) > teto) return teto + 1;
  let antes = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const agora = [i];
    let menor = i;
    for (let j = 1; j <= b.length; j++) {
      agora[j] = Math.min(antes[j] + 1, agora[j - 1] + 1, antes[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      menor = Math.min(menor, agora[j]);
    }
    if (menor > teto) return teto + 1;
    antes = agora;
  }
  return antes[b.length];
}

/**
 * Quão perto o nome falado está de um nome do cadastro (0 = igual pelo som; quanto menor, mais perto).
 * Compara palavra por palavra ("bob" acha "Bob Marley"); devolve null se não parece.
 */
export function proximidade(falado: string, nome: string): number | null {
  const palavras = (s: string) => semAcento(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).map((cru) => ({ cru, som: pelaFala(cru) }));
  const f = palavras(falado).filter((p) => p.cru.length >= 2);
  const n = palavras(nome);
  if (!f.length || !n.length) return null;
  let soma = 0;
  for (const p of f) {
    // palavra curta aceita 1 letra trocada; mais longa, 2. O começo do nome ("roc" de Rocha) também vale.
    const teto = p.som.length <= 4 ? 1 : 2;
    const comeco = (m: { cru: string; som: string }) => p.cru.length >= 3 && (m.cru.startsWith(p.cru) || m.som.startsWith(p.som));
    const melhor = Math.min(...n.map((m) => (comeco(m) ? 0 : distancia(p.som, m.som, teto))));
    if (melhor > teto) return null;
    soma += melhor;
  }
  return soma;
}

/** Os itens cujo nome (ou um dos nomes) parece o falado, do mais perto para o mais longe. */
export function parecidos<T>(falado: string, itens: T[], nomes: (t: T) => (string | null | undefined)[], limite = 6): T[] {
  return itens
    .map((t) => {
      const ds = nomes(t).map((n) => (n ? proximidade(falado, n) : null)).filter((d): d is number => d !== null);
      return { t, d: ds.length ? Math.min(...ds) : null };
    })
    .filter((x): x is { t: T; d: number } => x.d !== null)
    .sort((a, b) => a.d - b.d)
    .slice(0, limite)
    .map((x) => x.t);
}

/* ---------- nomes do cadastro na resposta do Mozart ---------- */

const PALAVRA = /[\p{L}\p{N}]+/gu;
const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** As formas "trocadas de gênero" de uma palavra: Tutor/Tutora, Joao/Joana não (só o fim muda: o/a, r/ra, s/sa, l/la). */
function formas(p: string): string[] {
  const f = [p];
  if (/[oO]$/.test(p)) f.push(p.slice(0, -1) + (p.endsWith("O") ? "A" : "a"));
  else if (/[aA]$/.test(p)) {
    f.push(p.slice(0, -1) + (p.endsWith("A") ? "O" : "o"));
    if (/[rslzRSLZ][aA]$/.test(p)) f.push(p.slice(0, -1));
  } else if (/[rslzRSLZ]$/.test(p)) f.push(p + (p === p.toUpperCase() ? "A" : "a"));
  return f;
}

/**
 * Corrige na resposta do modelo o nome de pessoa ou pet que veio do cadastro e saiu com o fim trocado ("Tutora Teste 1"
 * para o cadastro "Tutor Teste 1"). Só nomes de duas palavras ou mais, e nunca quando a forma trocada também é um nome
 * do cadastro (Bruno Silva e Bruna Silva são duas pessoas).
 */
export function manterNomes(texto: string, nomes: (string | null | undefined)[]): string {
  const conhecidos = [...new Set(nomes.map((n) => (n ?? "").trim().replace(/\s+/g, " ")).filter((n) => (n.match(PALAVRA) ?? []).length >= 2))];
  const iguais = new Set(conhecidos.map((n) => n.toLowerCase()));
  let saida = texto;
  // os mais longos primeiro: "Ana Maria Souza" antes de "Ana Maria"
  for (const nome of conhecidos.sort((a, b) => b.length - a.length)) {
    const partes = nome.split(" ");
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${partes.map((p) => `(?:${formas(p).map(escapar).join("|")})`).join("\\s+")}(?![\\p{L}\\p{N}])`, "giu");
    saida = saida.replace(re, (achado) => {
      const normal = achado.replace(/\s+/g, " ");
      if (normal === nome) return achado;
      // a forma trocada é outra pessoa do cadastro, ou só mudou maiúscula e minúscula: deixa como está
      if (normal.toLowerCase() === nome.toLowerCase() || iguais.has(normal.toLowerCase())) return achado;
      return nome;
    });
  }
  return saida;
}

/** Os nomes de pets e tutores que as ferramentas devolveram na conversa (resultados em JSON). */
export function nomesDosResultados(conteudos: string[]): string[] {
  const nomes: string[] = [];
  const andar = (x: unknown, chave?: string) => {
    if (typeof x === "string") {
      if (chave && /^(tutor|nome|pet|cliente|tutor_nome|igualA)$/.test(chave)) nomes.push(x);
      // linha do cartão: "Pet: Mel (Tutor Teste 1)"
      const m = /^(?:Pet|Tutor): ([^()]+?)(?: \(([^()]+)\))?$/.exec(x);
      if (m) { nomes.push(m[1]); if (m[2] && !/^(novo|já é cliente)$/.test(m[2])) nomes.push(m[2]); }
      return;
    }
    if (Array.isArray(x)) { for (const y of x) andar(y, chave); return; }
    if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) andar(v, k);
  };
  for (const c of conteudos) { try { andar(JSON.parse(c)); } catch { /* texto solto: não tem nome de cadastro */ } }
  return nomes;
}
