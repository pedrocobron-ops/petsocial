/**
 * Planos do Maestro Pet Gestão. Todos têm as mesmas funções; muda quantas pessoas entram com login
 * e de quanto em quanto tempo a cobrança acontece (todo mês, a cada 3 ou a cada 6 meses).
 * Durante o teste de 7 dias a conta fica no plano maior, para a equipe inteira experimentar.
 * Os links de checkout da Cakto vêm das variáveis da Vercel; sem link, o botão aparece como "em breve".
 */
export type PlanoId = "solo" | "equipe" | "petshop";
export type PeriodoId = "mensal" | "trimestral" | "semestral";

export const PERIODOS: { id: PeriodoId; nome: string; meses: number; cada: string; cobranca: string }[] = [
  { id: "mensal", nome: "Mensal", meses: 1, cada: "por mês", cobranca: "cobrado todo mês" },
  { id: "trimestral", nome: "3 meses", meses: 3, cada: "a cada 3 meses", cobranca: "cobrado a cada 3 meses" },
  { id: "semestral", nome: "6 meses", meses: 6, cada: "a cada 6 meses", cobranca: "cobrado a cada 6 meses" },
];

/** Valor de cada cobrança. O de 3 meses sai cerca de 10% mais barato que pagar mês a mês; o de 6, cerca de 15%. */
const PRECOS: Record<PlanoId, Record<PeriodoId, number>> = {
  solo: { mensal: 59, trimestral: 159, semestral: 299 },
  equipe: { mensal: 89, trimestral: 239, semestral: 449 },
  petshop: { mensal: 129, trimestral: 349, semestral: 659 },
};

// cada variável precisa aparecer por extenso para entrar na página
const CHECKOUTS: Record<PlanoId, Record<PeriodoId, string | undefined>> = {
  solo: { mensal: process.env.NEXT_PUBLIC_GESTAO_CHECKOUT_SOLO, trimestral: process.env.NEXT_PUBLIC_GESTAO_CHECKOUT_SOLO_3, semestral: process.env.NEXT_PUBLIC_GESTAO_CHECKOUT_SOLO_6 },
  equipe: { mensal: process.env.NEXT_PUBLIC_GESTAO_CHECKOUT_EQUIPE, trimestral: process.env.NEXT_PUBLIC_GESTAO_CHECKOUT_EQUIPE_3, semestral: process.env.NEXT_PUBLIC_GESTAO_CHECKOUT_EQUIPE_6 },
  petshop: { mensal: process.env.NEXT_PUBLIC_GESTAO_CHECKOUT_PETSHOP, trimestral: process.env.NEXT_PUBLIC_GESTAO_CHECKOUT_PETSHOP_3, semestral: process.env.NEXT_PUBLIC_GESTAO_CHECKOUT_PETSHOP_6 },
};

/** `preco` e `checkout` são os do plano mensal; para os outros períodos use `ofertaDe`. */
export const PLANOS: { id: PlanoId; nome: string; acessos: number; preco: number; para: string; checkout: string }[] = [
  { id: "solo", nome: "Solo", acessos: 1, preco: PRECOS.solo.mensal, para: "Para quem atende sozinho", checkout: (CHECKOUTS.solo.mensal ?? "").trim() },
  { id: "equipe", nome: "Equipe", acessos: 3, preco: PRECOS.equipe.mensal, para: "Para o pet shop com ajudante e recepção", checkout: (CHECKOUTS.equipe.mensal ?? "").trim() },
  { id: "petshop", nome: "Pet shop", acessos: 6, preco: PRECOS.petshop.mensal, para: "Para a equipe completa", checkout: (CHECKOUTS.petshop.mensal ?? "").trim() },
];

/** Preço, link e as contas de um plano em um período. `porMes` e `economia` comparam com pagar mês a mês pelo mesmo tempo. */
export function ofertaDe(plano: PlanoId, periodo: PeriodoId) {
  const p = PERIODOS.find((x) => x.id === periodo) ?? PERIODOS[0];
  const preco = PRECOS[plano][p.id];
  const cheio = PRECOS[plano].mensal * p.meses;
  return { periodo: p, preco, porMes: preco / p.meses, economia: cheio - preco, checkout: (CHECKOUTS[plano][p.id] ?? "").trim() };
}
export const temCheckout = () => PLANOS.some((pl) => PERIODOS.some((pe) => ofertaDe(pl.id, pe.id).checkout));

export const planoPorId = (id: string | null | undefined) => PLANOS.find((p) => p.id === id) ?? PLANOS[2];
export const textoAcessos = (n: number) => (n === 1 ? "1 acesso" : `até ${n} acessos`);
