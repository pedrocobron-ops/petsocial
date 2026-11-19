/** Primeiros passos (tela Hoje e fim do guia): a mesma contagem no guia e na tela Hoje: "Faltam 2 coisas para começar". */
export const textoFaltam = (n: number) => (n <= 0 ? "Tudo pronto para começar" : n === 1 ? "Falta 1 coisa para começar" : `Faltam ${n} coisas para começar`);

type ServicoComPreco = {
  ativo: boolean; categoria: string | null;
  preco_p: number | null; preco_m: number | null; preco_g: number | null; preco_gg: number | null;
};

/**
 * "Colocar os preços dos serviços": só fica feito quando todo serviço ativo tem preço em pelo menos um porte.
 * Creche e hotel ficam de fora (cobram pela diária, em Meu pet shop). `total` 0: não há serviço para dar preço.
 */
export function precosDosServicos(servicos: ServicoComPreco[]) {
  const contam = servicos.filter((s) => s.ativo && s.categoria !== "creche" && s.categoria !== "hotel");
  const comPreco = contam.filter((s) => [s.preco_p, s.preco_m, s.preco_g, s.preco_gg].some((v) => v != null)).length;
  return { comPreco, total: contam.length, feito: contam.length > 0 && comPreco === contam.length };
}

/** A dica do passo dos preços: quanto já tem preço ("1 de 5 com preço") e onde se coloca. */
export const dicaDosPrecos = ({ comPreco, total }: { comPreco: number; total: number }) =>
  `${comPreco > 0 && comPreco < total ? `${comPreco} de ${total} com preço. ` : ""}Em Meu pet shop, na parte Serviços e preços.`;
