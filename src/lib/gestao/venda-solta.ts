import { semAcento } from "./util";

/**
 * Venda de produto escrita à mão ("Venda de 10 pacotes de ração", categoria Venda de produtos) não mexe no Estoque: o saldo
 * não baixa e a venda não aparece nas vendas do produto. A venda que baixa o estoque é a Venda no balcão (Caixa) ou o
 * vender_produto do Mozart: um lançamento só, ligado às saídas com motivo Venda.
 * Aqui ficam as regras que a tela (o aviso na entrada) e o Mozart (a recusa do lancar_dinheiro) usam juntas.
 */
export const CATEGORIA_VENDA_DE_PRODUTOS = "Venda de produtos";

/** Entrada de dinheiro na categoria Venda de produtos sem produto escolhido do Estoque. */
export function ehVendaSolta(l: { tipo?: string | null; categoria?: string | null; itens?: unknown }): boolean {
  if (l.tipo !== "entrada" || l.categoria !== CATEGORIA_VENDA_DE_PRODUTOS) return false;
  const itens = Array.isArray(l.itens) ? (l.itens as { produto_id?: unknown }[]) : [];
  return !itens.some((i) => typeof i?.produto_id === "string" && i.produto_id);
}

const palavras = (s: string) => semAcento(s).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((p) => p && !/^\d+$/.test(p));
/** "mordedores" → "mordedor", "racoes" → "racao", "pacotes" → "pacote": o bastante para achar o produto pelo começo. */
const raiz = (p: string) => (p.endsWith("oes") ? `${p.slice(0, -3)}ao` : p.endsWith("es") && p.length > 5 ? p.slice(0, -2) : p.endsWith("s") && p.length > 4 ? p.slice(0, -1) : p);
const PALAVRAS_DA_VENDA = new Set(["venda", "vendi", "vendido", "vendida", "produto", "produtos", "pacote", "unidade", "saco", "caixa", "de", "do", "da", "dos", "das", "com", "para", "um", "uma"]);

/**
 * O produto do Estoque que a descrição cita (pela primeira palavra do nome: "Venda de 2 mordedores" acha "Mordedor de plástico").
 * Devolve o primeiro que bate, ou null. Palavras curtas (até 3 letras) e as da própria venda ("venda", "pacote") não contam.
 */
export function produtoCitado<P extends { nome: string }>(descricao: string | null | undefined, produtos: P[]): P | null {
  const ditas = palavras(descricao ?? "").map(raiz).filter((p) => p.length >= 4 && !PALAVRAS_DA_VENDA.has(p));
  if (!ditas.length) return null;
  for (const p of produtos) {
    const primeira = palavras(p.nome).map(raiz).find((w) => w.length >= 4 && !PALAVRAS_DA_VENDA.has(w));
    if (primeira && ditas.some((d) => d === primeira || (d.length >= 5 && primeira.startsWith(d)) || (primeira.length >= 5 && d.startsWith(primeira)))) return p;
  }
  return null;
}

/** O aviso da entrada escrita à mão na categoria Venda de produtos. */
export function avisoDaVendaSolta(citado: { nome: string } | null): { titulo: string; texto: string } {
  return citado
    ? { titulo: `${citado.nome} está no Estoque`, texto: "Lançado por aqui, o saldo não baixa e a venda não aparece no Estoque. Para baixar, venda pela Venda no balcão, escolhendo o produto." }
    : { titulo: "Este item não está no Estoque", texto: "Lançado por aqui, o dinheiro entra, mas o estoque não muda. Se é um produto que você controla, escolha na Venda no balcão ou cadastre no Estoque." };
}
