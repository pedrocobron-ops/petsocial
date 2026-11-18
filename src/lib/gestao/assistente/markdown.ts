/**
 * O texto do Mozart na bolha: o modelo às vezes escreve **negrito** e listas com "- ". A bolha mostra o negrito e a lista
 * de verdade, e tira o resto do markdown (títulos "#", crases, sublinhado, asterisco solto). Nada vira HTML: a tela monta
 * os elementos a partir destas partes (o texto continua escapado pelo React). A voz usa `textoParaFalar` (fala.ts), que
 * tira o mesmo markdown.
 */
export type Trecho = { t: string; b?: boolean };
export type Bloco = { tipo: "p"; trechos: Trecho[] } | { tipo: "lista"; itens: Trecho[][] };

/** Uma linha em trechos: **assim** fica em negrito; o resto do markdown sai. */
export function trechosDaLinha(linha: string): Trecho[] {
  const s = linha
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(^|\s)__([^_\n]+)__(?=\s|[.,!?;:]|$)/g, "$1**$2**")
    .replace(/(^|[\s(])_([^_\n]+)_(?=\s|[.,!?;:)]|$)/g, "$1$2")
    .replace(/~~([^~]+)~~/g, "$1");
  const partes: Trecho[] = [];
  const re = /\*\*(?=\S)([^*\n]*?\S)\*\*/g;
  let fim = 0;
  for (let m = re.exec(s); m; m = re.exec(s)) {
    if (m.index > fim) partes.push({ t: s.slice(fim, m.index) });
    partes.push({ t: m[1], b: true });
    fim = m.index + m[0].length;
  }
  if (fim < s.length) partes.push({ t: s.slice(fim) });
  // asterisco que sobrou (itálico de um asterisco, negrito sem fechar): sai
  return partes.map((p) => ({ ...p, t: p.t.replace(/\*+/g, "") })).filter((p) => p.t.length > 0);
}

const RE_ITEM = /^\s{0,3}(?:[-*•+]|\d{1,2}[.)])\s+(.*)$/;

/** O texto inteiro em parágrafos e listas. */
export function blocosDoTexto(texto: string): Bloco[] {
  const blocos: Bloco[] = [];
  for (const bruta of (texto ?? "").replace(/\r/g, "").split("\n")) {
    const linha = bruta.replace(/^\s{0,3}#{1,6}\s+/, "").replace(/^\s*>\s?/, "");
    const item = RE_ITEM.exec(linha);
    const ultimo = blocos[blocos.length - 1];
    if (item) {
      const tr = trechosDaLinha(item[1]);
      if (ultimo?.tipo === "lista") ultimo.itens.push(tr); else blocos.push({ tipo: "lista", itens: [tr] });
      continue;
    }
    if (!linha.trim()) { blocos.push({ tipo: "p", trechos: [] }); continue; }
    const tr = trechosDaLinha(linha);
    // linhas seguidas do mesmo parágrafo continuam nele, com a quebra de linha
    if (ultimo?.tipo === "p" && ultimo.trechos.length) ultimo.trechos.push({ t: "\n" }, ...tr);
    else blocos.push({ tipo: "p", trechos: tr });
  }
  return blocos.filter((b) => (b.tipo === "p" ? b.trechos.length > 0 : b.itens.length > 0));
}

/** O texto sem nenhum markdown (para copiar, para o resumo e para quem lê a bolha como texto). */
export function semMarkdown(texto: string): string {
  return blocosDoTexto(texto).map((b) => (b.tipo === "p" ? b.trechos.map((x) => x.t).join("") : b.itens.map((i) => `- ${i.map((x) => x.t).join("")}`).join("\n"))).join("\n\n");
}
