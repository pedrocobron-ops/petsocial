/**
 * Quem pode usar cada ferramenta do Mozart. Uma regra só, usada ao montar a lista de ferramentas do modelo, ao rodar o que
 * o modelo pediu e ao gravar o que a pessoa confirmou no cartão (a conversa vem do navegador e pode ter sido montada à mão).
 * Ferramenta de dinheiro só para quem vê o financeiro (caixa, financeiro ou relatórios). As regras do banco conferem de novo.
 * Sem importações: dá para testar sozinho com `node --experimental-strip-types`.
 */
export type RegraDaFerramenta = { financeiro?: boolean } | undefined | null;

export function ferramentaLiberada(def: RegraDaFerramenta, c: { vejoFinanceiro: boolean }): boolean {
  if (!def) return false;
  return !def.financeiro || c.vejoFinanceiro === true;
}
