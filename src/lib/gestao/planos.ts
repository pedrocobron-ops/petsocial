/**
 * Planos do Maestro Pet Gestão. Todos têm as mesmas funções; muda quantas pessoas entram com login
 * e de quanto em quanto tempo a cobrança acontece (todo mês, a cada 3 ou a cada 6 meses).
 * Durante o teste de 7 dias a conta fica no plano maior, para a equipe inteira experimentar.
 * Os links de checkout da Cakto vêm do banco (painel do administrador, aba Cakto, lidos pela função `gestao_assinatura`)
 * e, na falta deles, das variáveis da Vercel; sem link, o botão leva ao WhatsApp da equipe, com a mensagem pronta.
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
  solo: { mensal: 79, trimestral: 215, semestral: 399 },
  equipe: { mensal: 129, trimestral: 349, semestral: 659 },
  petshop: { mensal: 179, trimestral: 479, semestral: 909 },
};

// cada variável precisa aparecer por extenso para entrar na página
const CHECKOUTS: Record<PlanoId, Record<PeriodoId, string | undefined>> = {
  solo: { mensal: process.env.NEXT_PUBLIC_GESTAO_CHECKOUT_SOLO, trimestral: process.env.NEXT_PUBLIC_GESTAO_CHECKOUT_SOLO_3, semestral: process.env.NEXT_PUBLIC_GESTAO_CHECKOUT_SOLO_6 },
  equipe: { mensal: process.env.NEXT_PUBLIC_GESTAO_CHECKOUT_EQUIPE, trimestral: process.env.NEXT_PUBLIC_GESTAO_CHECKOUT_EQUIPE_3, semestral: process.env.NEXT_PUBLIC_GESTAO_CHECKOUT_EQUIPE_6 },
  petshop: { mensal: process.env.NEXT_PUBLIC_GESTAO_CHECKOUT_PETSHOP, trimestral: process.env.NEXT_PUBLIC_GESTAO_CHECKOUT_PETSHOP_3, semestral: process.env.NEXT_PUBLIC_GESTAO_CHECKOUT_PETSHOP_6 },
};

const MESES: Record<PeriodoId, number> = { mensal: 1, trimestral: 3, semestral: 6 };

/** Links gravados no banco, por "plano:meses" ("solo:1", "equipe:3"…). Quem carrega é o GestaoProvider, ao abrir o app. */
let doBanco: Record<string, string> = {};
export function usarLinksDoBanco(links: Record<string, string> | null | undefined) { doBanco = links ?? {}; }

/**
 * A plataforma de pagamento soma uma pequena taxa de serviço ao valor (o comprador vê antes de pagar; o valor varia de
 * compra para compra). Linha discreta embaixo dos preços, na página de vendas e na tela Assinatura. Tirar quando a taxa
 * deixar de ser cobrada do comprador.
 */
export const TEXTO_TAXA = "Taxa de serviço do pagamento mostrada antes de concluir.";

/** Link de pagamento de um plano e período: primeiro o do banco, depois o da variável da Vercel. */
export function linkDe(plano: PlanoId, periodo: PeriodoId) {
  return (doBanco[`${plano}:${MESES[periodo]}`] || CHECKOUTS[plano][periodo] || "").trim();
}

/** `preco` e `checkout` são os do plano mensal; para os outros períodos use `ofertaDe`. */
export const PLANOS: { id: PlanoId; nome: string; acessos: number; preco: number; para: string; readonly checkout: string }[] = [
  { id: "solo", nome: "Solo", acessos: 1, preco: PRECOS.solo.mensal, para: "Para quem atende sozinho", get checkout() { return linkDe("solo", "mensal"); } },
  { id: "equipe", nome: "Equipe", acessos: 3, preco: PRECOS.equipe.mensal, para: "Para quem tem ajudante ou recepção", get checkout() { return linkDe("equipe", "mensal"); } },
  { id: "petshop", nome: "Pet shop", acessos: 6, preco: PRECOS.petshop.mensal, para: "Para a equipe completa", get checkout() { return linkDe("petshop", "mensal"); } },
];

/** Preço, link e as contas de um plano em um período. `porMes` e `economia` comparam com pagar mês a mês pelo mesmo tempo. */
export function ofertaDe(plano: PlanoId, periodo: PeriodoId) {
  const p = PERIODOS.find((x) => x.id === periodo) ?? PERIODOS[0];
  const preco = PRECOS[plano][p.id];
  const cheio = PRECOS[plano].mensal * p.meses;
  return { periodo: p, preco, porMes: preco / p.meses, economia: cheio - preco, checkout: linkDe(plano, p.id) };
}
/** Preço de tabela, para o painel do administrador conferir com a oferta da Cakto. */
export const precoDe = (plano: PlanoId, periodo: PeriodoId) => PRECOS[plano][periodo];
export const temCheckout = () => PLANOS.some((pl) => PERIODOS.some((pe) => ofertaDe(pl.id, pe.id).checkout));

export const planoPorId = (id: string | null | undefined) => PLANOS.find((p) => p.id === id) ?? PLANOS[2];
export const textoAcessos = (n: number) => (n === 1 ? "1 acesso" : `até ${n} acessos`);
/** O mesmo, em palavras de gente: "1 pessoa entra (você)", "até 3 pessoas entram". */
export const textoPessoas = (n: number) => (n === 1 ? "1 pessoa entra (você)" : `até ${n} pessoas entram`);

/* ---------- assinar: cupom, plano que serve e os textos que a página de venda, a Assinatura, a Nina e o kit repetem ---------- */

/** Dias para se arrepender depois do primeiro pagamento (Termos de uso, parte 7). */
export const DIAS_DE_ARREPENDIMENTO = 7;
/** Dias de tolerância da assinatura atrasada antes de a conta ficar só para consulta (o banco manda: `assinatura_atraso_dias`). */
export const DIAS_DE_ATRASO_PADRAO = 10;

/** Frases de venda que precisam ser iguais em todo lugar. Mudou uma regra? Mude aqui (e nos Termos). */
export const TEXTOS_ASSINAR = {
  nadaCobrado: "7 dias grátis, sem cartão. Nada é cobrado sozinho no fim do teste.",
  fimDoTeste: "Quando os 7 dias acabam, a conta fica só para consulta: os dados continuam guardados e dá para ver e baixar tudo. Para voltar a usar, é só assinar.",
  semFidelidade: "Sem fidelidade: você cancela quando quiser e usa até o fim do período já pago.",
  arrependimento: `Assinou e se arrependeu? Pedindo o cancelamento em até ${DIAS_DE_ARREPENDIMENTO} dias depois do primeiro pagamento, devolvemos o valor inteiro, inclusive nos planos de 3 e 6 meses.`,
  pagamento: "O pagamento é feito numa plataforma segura de cobrança. As formas de pagamento aparecem na tela de pagamento.",
  cupom: "Tem um cupom? Ele é dado pela nossa equipe de atendimento, vale até a data combinada e é digitado na hora de pagar.",
  semLogin: "Banhista ou tosador que só aparece na agenda, sem entrar no sistema, não conta como pessoa com login.",
} as const;

/** Código de cupom como a Cakto recebe: sem espaços, em maiúsculas, só letras, números, traço e sublinhado. */
export function limparCupom(texto: string | null | undefined) {
  const c = (texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 40);
  return c.length >= 2 ? c : "";
}

/**
 * Link de pagamento com o e-mail da conta já preenchido (parâmetros `email` e `confirmEmail` do checkout da Cakto),
 * a marca do pet shop em `callback`, que a Cakto devolve no aviso de pagamento (assim a compra cai na conta certa
 * mesmo se a pessoa trocar o e-mail na hora de pagar), e o cupom em `coupon`, quando a pessoa escreveu um.
 * A marca é assinada pelo banco (`assinatura_callback`: id do pet shop e uma ficha secreta dele).
 * O cupom nunca tira o e-mail nem a marca: é só mais um parâmetro. Quem confere se o código vale é a Cakto.
 */
export function linkDoCheckout(checkout: string, email: string | null | undefined, callback?: string | null, cupom?: string | null) {
  const extras: [string, string][] = [];
  if (email) extras.push(["email", email], ["confirmEmail", email]);
  if (callback) extras.push(["callback", callback]);
  const codigo = limparCupom(cupom);
  if (codigo) extras.push(["coupon", codigo]);
  try {
    const u = new URL(checkout);
    // um cupom que já veio no link cadastrado não fica no lugar do que a pessoa escreveu
    for (const [k, v] of extras) u.searchParams.set(k, v);
    return u.toString();
  } catch {
    const q = extras.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    return q ? `${checkout}${checkout.includes("?") ? "&" : "?"}${q}` : checkout;
  }
}

/** O menor plano em que cabem `pessoas` com login (acima do maior, o maior). */
export function planoQueServe(pessoas: number) {
  return PLANOS.find((p) => p.acessos >= Math.max(1, pessoas)) ?? PLANOS[PLANOS.length - 1];
}

/** "Hoje 2 pessoas entram no sistema: o plano Equipe (até 3) serve." Para a tela Assinatura. */
export function conselhoDoPlano(pessoas: number) {
  const n = Math.max(1, pessoas);
  const serve = planoQueServe(n);
  const maior = PLANOS[PLANOS.length - 1];
  const quantas = n === 1 ? "só você entra no sistema" : `${n} pessoas entram no sistema (com login ou convite)`;
  if (n > maior.acessos) {
    return { plano: maior, cabe: false, texto: `Hoje ${quantas}. O maior plano, o ${maior.nome}, tem ${maior.acessos} logins: para assinar, deixe com login só quem precisa, em Equipe.` };
  }
  const limite = serve.acessos === 1 ? "1 login" : `até ${serve.acessos} logins`;
  return { plano: serve, cabe: true, texto: `Hoje ${quantas}: o plano ${serve.nome} (${limite}) serve. ${TEXTOS_ASSINAR.semLogin}` };
}

/** Mensagem pronta para assinar falando com a equipe (sem link de pagamento cadastrado). */
export function textoParaAssinar(plano: PlanoId, periodo: PeriodoId, petshop: string, email?: string | null, cupom?: string | null) {
  const p = PLANOS.find((x) => x.id === plano) ?? PLANOS[0];
  const pe = PERIODOS.find((x) => x.id === periodo) ?? PERIODOS[0];
  const codigo = limparCupom(cupom);
  return `Oi! Quero assinar o Maestro Pet Gestão. Plano ${p.nome}, ${pe.nome === "Mensal" ? "mensal" : `de ${pe.nome}`}. Pet shop: ${petshop}.${email ? ` E-mail da conta: ${email}.` : ""}${codigo ? ` Tenho o cupom ${codigo}.` : ""}`;
}
