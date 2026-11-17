/**
 * Cores da agenda (serviços e equipe). Cada serviço ativo deve ter a sua: na agenda, dois serviços com a mesma cor
 * ficam iguais. As primeiras oito são as de sempre; as quatro do fim entraram para sobrar cor para quem tem muitos serviços.
 */
export const CORES = ["#f97316", "#3b82a0", "#4d8f6b", "#7c6fb0", "#b0763f", "#b0563f", "#a05a82", "#1e3a2f", "#c08a1e", "#2a8c82", "#4f63c4", "#5f7d2b"];
export const NOME_COR: Record<string, string> = {
  "#f97316": "laranja", "#3b82a0": "azul", "#4d8f6b": "verde", "#7c6fb0": "roxo", "#b0763f": "caramelo", "#b0563f": "telha", "#a05a82": "rosa", "#1e3a2f": "verde-garrafa",
  "#c08a1e": "mostarda", "#2a8c82": "turquesa", "#4f63c4": "anil", "#5f7d2b": "oliva",
};

const chave = (c: string | null | undefined) => (c ?? "").trim().toLowerCase();

/** Uma cor da agenda que nenhum serviço ativo usa ainda (a primeira da lista); com todas usadas, roda a lista. */
export function corLivre(usadas: (string | null | undefined)[]): string {
  const em = new Set(usadas.filter(Boolean).map(chave));
  return CORES.find((c) => !em.has(c)) ?? CORES[em.size % CORES.length];
}

type ComCor = { id: string; nome: string; cor: string | null; ativo?: boolean | null; ordem?: number | null };
export type TrocaDeCor = { id: string; nome: string; de: string; para: string; igualA: string };

/**
 * Serviços ativos com a cor repetida: o primeiro de cada cor (pela ordem da lista) fica como está; cada um dos outros
 * ganha uma cor que ninguém usa. Sem cor livre sobrando (mais serviços que cores), o serviço fica de fora da troca.
 */
export function trocasDeCor(servicos: ComCor[]): TrocaDeCor[] {
  const ativos = servicos.filter((s) => s.ativo !== false && s.cor)
    .map((s, i) => ({ s, i })).sort((a, b) => (a.s.ordem ?? 0) - (b.s.ordem ?? 0) || a.i - b.i).map((x) => x.s);
  const emUso = [...new Set(ativos.map((s) => chave(s.cor)))];
  const primeiroDe = new Map<string, string>();
  const trocas: TrocaDeCor[] = [];
  for (const s of ativos) {
    const k = chave(s.cor);
    const primeiro = primeiroDe.get(k);
    if (primeiro == null) { primeiroDe.set(k, s.nome); continue; }
    const para = corLivre(emUso);
    if (emUso.includes(para)) continue;
    emUso.push(para);
    trocas.push({ id: s.id, nome: s.nome, de: s.cor!, para, igualA: primeiro });
  }
  return trocas;
}

/** Quem já usa esta cor (outro serviço ativo), para o aviso embaixo da escolha. */
export function donoDaCor(cor: string, outros: { nome: string; cor: string | null }[]): string | null {
  return outros.find((o) => chave(o.cor) === chave(cor))?.nome ?? null;
}
