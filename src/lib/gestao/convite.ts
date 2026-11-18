import type { Banco } from "./supabase";

/**
 * Convite da equipe pelo link: `?convite=<código>`. O código liga a conta à equipe (função `convite_aceitar` do banco):
 * precisa do código certo, dentro dos 7 dias, ainda não usado, e o e-mail da conta igual ao do convite.
 * O e-mail sozinho não liga mais nada: com "Confirm email" desligado, qualquer um cria conta com qualquer e-mail.
 */
export const lerCodigoDoConvite = (v: string | null | undefined) => (v ?? "").trim().slice(0, 80);

const ERRO_GERAL = "Não consegui aceitar o convite agora. Tente de novo em instantes.";

/** Aceita o convite com a conta logada. Deu certo: o pet shop já abre da próxima vez. */
export async function aceitarConvite(sb: Banco, codigo: string): Promise<{ petshop: string } | { erro: string }> {
  const r = await sb.rpc("convite_aceitar", { p_codigo: codigo });
  if (r.error || !r.data) {
    const m = r.error?.message ?? "";
    // as frases do banco são para a pessoa ("Este convite venceu..."); erro técnico vira a frase geral
    return { erro: /convite|conta|e-mail/i.test(m) && !/function|permission|schema|violates/i.test(m) ? m : ERRO_GERAL };
  }
  try { localStorage.setItem("maestro-gestao-petshop", r.data); } catch { /* sem armazenamento: abre o primeiro pet shop */ }
  return { petshop: r.data };
}

/** O que o banco diz de um link de convite (função `convite_conferir`, sem login). Nunca traz o e-mail do convite. */
export type SituacaoDoConvite = "valido" | "vencido" | "usado" | "substituido" | "cancelado" | "invalido" | "outro_email" | "muitos";
const SITUACOES: SituacaoDoConvite[] = ["valido", "vencido", "usado", "substituido", "cancelado", "invalido", "outro_email", "muitos"];

/**
 * Confere o código do link (e, se vier, o e-mail digitado) antes de criar a conta. Devolve null quando não deu para
 * conferir (banco antigo, sem internet): a tela segue como antes e o `convite_aceitar` continua conferindo tudo.
 */
export async function conferirConvite(sb: Banco, codigo: string, email?: string): Promise<{ situacao: SituacaoDoConvite; petshop: string | null } | null> {
  try {
    const r = await sb.rpc("convite_conferir", { p_codigo: codigo, ...(email ? { p_email: email.trim().toLowerCase() } : {}) });
    const d = r.data as { situacao?: string; petshop?: string | null } | null;
    if (r.error || !d || !SITUACOES.includes(d.situacao as SituacaoDoConvite)) return null;
    return { situacao: d.situacao as SituacaoDoConvite, petshop: d.petshop ?? null };
  } catch { return null; }
}

/**
 * O que a tela mostra para um link que não serve mais (ou para o e-mail errado); null quando o link vale. `emailDoConvite`
 * só vem do próprio link (`?email=`), nunca do banco. Pura: os testes de unidade leem daqui.
 */
export function avisoDoConvite(situacao: SituacaoDoConvite, petshop: string | null, emailDoConvite = ""): { titulo: string; texto: string } | null {
  const quem = petshop ? `de ${petshop}` : "do pet shop";
  switch (situacao) {
    case "valido": return null;
    case "vencido": return { titulo: "Este convite venceu", texto: `O link vale 7 dias e este passou do prazo. Peça a quem cuida da equipe ${quem} para mandar um link novo.` };
    case "usado": return { titulo: "Este convite já foi usado", texto: `Já criaram a conta com este link. Se foi você, é só entrar com o seu e-mail e a sua senha. Se não foi, fale com quem cuida da equipe ${quem}.` };
    case "substituido": return { titulo: "Este link foi trocado por um mais novo", texto: `Depois deste, foi gerado um link novo, e só o mais recente funciona. Procure a mensagem mais nova do convite ${quem} ou peça para mandarem de novo.` };
    case "cancelado": return { titulo: "Este convite foi cancelado", texto: `O convite ${quem} não vale mais (por exemplo, o e-mail da pessoa foi trocado). Se você ainda vai entrar na equipe, peça um link novo.` };
    case "invalido": return { titulo: "Este link de convite não funciona", texto: "Confira se o link chegou inteiro (às vezes o fim fica de fora ao copiar) ou peça para mandarem de novo." };
    case "outro_email": return { titulo: "Este convite é para outro e-mail", texto: emailDoConvite ? `Use ${emailDoConvite}, o e-mail que recebeu o convite. Com outro e-mail, a conta não entra na equipe.` : "Use o mesmo e-mail que recebeu o convite. Com outro e-mail, a conta não entra na equipe." };
    case "muitos": return { titulo: "Muitas tentativas agora", texto: "Espere alguns minutos e tente de novo." };
  }
}
