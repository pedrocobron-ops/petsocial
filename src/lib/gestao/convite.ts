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
