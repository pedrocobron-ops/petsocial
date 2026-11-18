import { centavos } from "./util";
/**
 * Contagem de estoque (inventário), migração 20261201: o que a tela e a folha impressa calculam a partir de `contagem_ler`.
 * A diferença de cada produto é contado − esperado (o saldo do sistema na hora em que a pessoa contou); o banco ajusta o saldo
 * de agora com essa diferença, então o que vendeu depois de contar não se perde. Na contagem concluída, a diferença é a que
 * foi gravada (saldo depois − saldo antes). Valores em R$ só quando o banco manda (quem vê o financeiro).
 */
export type ItemDaContagem = {
  produto_id: string; nome: string; unidade: string; categoria: string | null; codigo_barras: string | null;
  saldo: number; contado: number | null; esperado: number | null; contado_em: string | null; contado_por_nome: string | null;
  diferenca: number | null; custo: number | null; valor: number | null; ajustado_de: number | null; ajustado_para: number | null;
};
export type Contagem = {
  id: string; nome: string; status: "aberta" | "pausada" | "concluida" | "cancelada"; categoria: string | null; fornecedor_id: string | null;
  criado_em: string; criado_por_nome: string | null; atualizado_em: string; concluida_em: string | null; concluida_por_nome: string | null;
  ajustados: number | null; com_valor: boolean; diferenca_valor: number | null; itens: ItemDaContagem[];
};
export type ContagemNaLista = {
  id: string; nome: string; status: Contagem["status"]; criado_em: string; criado_por_nome: string | null; atualizado_em: string;
  concluida_em: string | null; concluida_por_nome: string | null; ajustados: number | null; diferenca_valor: number | null; itens: number; contados: number;
};

const n = (v: unknown) => (v == null ? null : Number(v));
const mil = (x: number) => Math.round(x * 1000) / 1000;

/** Números chegam do banco como texto ou número: deixa tudo número (ou null). */
export function lerContagem(d: unknown): Contagem {
  const c = d as Contagem;
  return {
    ...c, diferenca_valor: n(c.diferenca_valor), ajustados: n(c.ajustados),
    itens: (c.itens ?? []).map((i) => ({
      ...i, saldo: Number(i.saldo), contado: n(i.contado), esperado: n(i.esperado), diferenca: n(i.diferenca), custo: n(i.custo), valor: n(i.valor),
      ajustado_de: n(i.ajustado_de), ajustado_para: n(i.ajustado_para),
    })),
  };
}

/**
 * Diferença de um produto com o que está na tela: o contado na tela (ainda não mandado ao banco) é comparado com o saldo de agora;
 * o que o banco já tem, com o esperado guardado. null = não contado.
 */
export function diferencaDoItem(i: ItemDaContagem, naTela?: number | null): number | null {
  if (naTela !== undefined && naTela !== i.contado) return naTela == null ? null : mil(naTela - i.saldo);
  return i.diferenca == null ? null : mil(i.diferenca);
}

/** Valor da diferença (diferença × custo, em centavos). null sem custo ou sem permissão. */
export const valorDaDiferenca = (i: ItemDaContagem, dif: number | null) => (dif == null || i.custo == null ? null : centavos(dif * i.custo));

/** Totais da revisão: contados, com diferença, sobra e falta (quantidade), valor (soma dos centavos de cada produto). */
export function totaisDaContagem(itens: ItemDaContagem[], naTela: Map<string, number | null> = new Map()) {
  let contados = 0, comDiferenca = 0, sobra = 0, falta = 0, valor = 0, semCusto = 0;
  for (const i of itens) {
    const tela = naTela.has(i.produto_id) ? naTela.get(i.produto_id) : undefined;
    const contado = tela !== undefined ? tela : i.contado;
    if (contado == null) continue;
    contados++;
    const dif = diferencaDoItem(i, tela);
    if (!dif) continue;
    comDiferenca++;
    if (dif > 0) sobra = mil(sobra + dif); else falta = mil(falta - dif);
    const v = valorDaDiferenca(i, dif);
    if (v == null) semCusto++; else valor = centavos(valor + v);
  }
  return { total: itens.length, contados, faltamContar: itens.length - contados, comDiferenca, sobra, falta, valor, semCusto };
}

/** Linhas da planilha (CSV) da contagem: produto, unidade, sistema, contado, diferença e, com valor, custo e valor. */
export function linhasDaPlanilha(c: Contagem): (string | number | null)[][] {
  const cab = ["Produto", "Categoria", "Unidade", "Saldo no sistema", "Contado", "Diferença", ...(c.com_valor ? ["Custo", "Valor da diferença"] : []), "Contado por"];
  const linhas = c.itens.map((i) => {
    // o saldo do sistema na hora em que o produto foi contado (a diferença é sobre ele); não contado: o de agora (ou o da conclusão)
    const sistema = i.esperado ?? i.ajustado_de ?? i.saldo;
    return [i.nome, i.categoria ?? "", i.unidade, sistema, i.contado, i.diferenca, ...(c.com_valor ? [i.custo, i.valor] : []), i.contado_por_nome ?? ""];
  });
  return [cab, ...linhas];
}
