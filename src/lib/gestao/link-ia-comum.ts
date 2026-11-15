/**
 * "Tirar dúvida" no link do cliente: o que as telas (navegador) usam. Sem as instruções do assistente, que ficam só no
 * servidor (`link-ia.ts`).
 */
export const OPCAO_LINK_IA = "link.ia";
/** Perguntas por conversa (o navegador também conta; o servidor confere de novo). */
export const MAX_PERGUNTAS_CONVERSA = 15;
export const MAX_LETRAS_PERGUNTA = 300;
export type Sugestao = { tipo: "servico"; servicoId: string; nome: string; dia: string | null } | { tipo: "creche" | "hotel"; dia: null };
export const limiteConversaTexto = (nome: string) => `Esta conversa chegou ao limite de perguntas. Para continuar, fale com ${nome} no WhatsApp.`;
