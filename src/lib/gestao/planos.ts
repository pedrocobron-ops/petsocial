/**
 * Planos do Maestro Pet Gestão. Todos têm as mesmas funções; muda quantas pessoas entram com login.
 * Durante o teste de 7 dias a conta fica no plano maior, para a equipe inteira experimentar.
 * Os links de checkout da Cakto vêm das variáveis da Vercel; sem link, o botão aparece como "em breve".
 */
export type PlanoId = "solo" | "equipe" | "petshop";

export const PLANOS: { id: PlanoId; nome: string; acessos: number; preco: number; para: string; checkout: string }[] = [
  { id: "solo", nome: "Solo", acessos: 1, preco: 59, para: "Para quem atende sozinho", checkout: (process.env.NEXT_PUBLIC_GESTAO_CHECKOUT_SOLO ?? "").trim() },
  { id: "equipe", nome: "Equipe", acessos: 3, preco: 89, para: "Para o pet shop com ajudante e recepção", checkout: (process.env.NEXT_PUBLIC_GESTAO_CHECKOUT_EQUIPE ?? "").trim() },
  { id: "petshop", nome: "Pet shop", acessos: 6, preco: 129, para: "Para a equipe completa", checkout: (process.env.NEXT_PUBLIC_GESTAO_CHECKOUT_PETSHOP ?? "").trim() },
];

export const planoPorId = (id: string | null | undefined) => PLANOS.find((p) => p.id === id) ?? PLANOS[2];
export const textoAcessos = (n: number) => (n === 1 ? "1 acesso" : `até ${n} acessos`);
