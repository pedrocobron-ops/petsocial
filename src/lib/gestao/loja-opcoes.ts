import { opcao } from "./opcoes";

/**
 * Opções da loja: cada negócio liga só o que usa. Todas começam desligadas, e desligado o estoque funciona como sempre.
 * Ficam em `petshops.opcoes` (veja `opcoes.ts`). O banco lê "loja.margem" para decidir entre último custo e custo médio.
 */
export const OPCOES_DA_LOJA = [
  {
    chave: "loja.margem", rotulo: "Margem e custo médio",
    texto: "Mostra a margem em reais e em % em cada produto e libera o relatório de vendas por produto. A cada entrada, o custo passa a ser a média do que está na prateleira.",
  },
  {
    chave: "loja.codigo_barras", rotulo: "Código de barras",
    texto: "Cada produto ganha um campo de código de barras. Na venda e no estoque, é só passar o leitor ou digitar o código para achar o produto.",
  },
  {
    chave: "loja.fornecedores", rotulo: "Fornecedores",
    texto: "Guarda seus fornecedores, deixa escolher de quem veio cada entrada e monta o pedido de reposição para você mandar pelo WhatsApp.",
  },
] as const;

export type ChaveDaLoja = (typeof OPCOES_DA_LOJA)[number]["chave"];
type ComOpcoes = { opcoes?: unknown };

/** As três opções da loja de uma vez (false quando nunca foram ligadas). */
export function opcoesDaLoja(petshop: ComOpcoes) {
  return {
    margem: opcao(petshop, "loja.margem", false),
    codigoBarras: opcao(petshop, "loja.codigo_barras", false),
    fornecedores: opcao(petshop, "loja.fornecedores", false),
  };
}

/** Código de barras como fica guardado: sem espaços nas pontas nem no meio. Vazio vira null. */
export function limparCodigo(s: string | null | undefined): string | null {
  const t = (s ?? "").replace(/\s+/g, "");
  return t ? t.slice(0, 64) : null;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/**
 * Margem de um produto pelo preço e pelo custo de hoje: quanto sobra em reais e quanto isso é do preço de venda.
 * Devolve null quando falta preço ou custo (não inventa).
 */
export function margemDe(preco: number | null | undefined, custo: number | null | undefined): { reais: number; pct: number | null; prejuizo: boolean } | null {
  if (preco == null || custo == null) return null;
  const p = Number(preco), c = Number(custo);
  const reais = centavos(p - c);
  return { reais, pct: p > 0 ? (reais / p) * 100 : null, prejuizo: p < c };
}

/** "32,5%" (uma casa, vírgula). */
export const pct = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
