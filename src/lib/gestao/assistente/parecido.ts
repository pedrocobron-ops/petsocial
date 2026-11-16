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
