import { saudacaoZap } from "./agenda";
import { textoRenovacao } from "./modo-envio";
import type { Banco } from "./supabase";
import { dataCurta } from "./util";

/**
 * Pacote acabando: o aviso para oferecer a renovação, na ficha do tutor, no horário, na conta e em Pacotes.
 * Quem decide o que entra é o banco (`pacotes_acabando`), com estes mesmos números. Nada é enviado sozinho: o botão
 * "Oferecer renovar" abre o WhatsApp do aparelho com o texto pronto.
 */

/** Sobrando este número de usos, o pacote entra no aviso. */
export const PACOTE_USOS_NO_FIM = 1;
/** Vence daqui a até este número de dias: entra no aviso. */
export const PACOTE_VENCENDO_DIAS = 7;
/** Acabou (ou venceu) há até este número de dias: ainda entra no aviso. */
export const PACOTE_ACABOU_DIAS = 30;

export type MotivoAcabando = "acabou" | "vencido" | "ultimo" | "vencendo";
export type PacoteAcabando = {
  id: string; pet_id: string; nome: string; total: number; usados: number; vence_em: string | null; servico_id: string | null; pacote_id: string | null;
  acabou_em: string | null; dias: number | null; motivo: MotivoAcabando;
  pet: { id: string; nome: string; sexo: string | null; foto: string | null; especie: string | null };
  tutor: { id: string; nome: string; telefone: string | null; nao_quer: boolean | null } | null;
};

/** Lê do banco (todo o pet shop, ou só um pet). Banco antes da atualização ou erro: lista vazia (o aviso só não aparece). */
export async function lerPacotesAcabando(sb: Banco, petshopId: string, petId?: string | null): Promise<PacoteAcabando[]> {
  const r = await (sb as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> })
    .rpc("pacotes_acabando", { p: petshopId, p_pet: petId ?? null });
  if (r.error || !Array.isArray(r.data)) return [];
  return r.data as PacoteAcabando[];
}

/** "falta 1 uso", "acabou em 10/11", "venceu em 10/11", "vence amanhã", "vence em 5 dias". */
export function fraseDoPacote(p: Pick<PacoteAcabando, "motivo" | "total" | "usados" | "vence_em" | "acabou_em" | "dias">) {
  const resta = Math.max(0, p.total - p.usados);
  const vence = p.dias == null ? null : p.dias === 0 ? "vence hoje" : p.dias === 1 ? "vence amanhã" : p.dias > 1 ? `vence em ${p.dias} dias` : null;
  if (p.motivo === "acabou") return `usou os ${p.total}${p.acabou_em ? ` (acabou em ${dataCurta(p.acabou_em)})` : ""}`;
  if (p.motivo === "vencido") return `venceu em ${dataCurta(p.vence_em!)} com ${resta === 1 ? "1 uso sobrando" : `${resta} usos sobrando`}`;
  if (p.motivo === "ultimo") return `falta 1 uso${vence ? ` e ${vence}` : ""}`;
  return `${vence ?? "vence logo"}, ${resta === 1 ? "falta 1 uso" : `faltam ${resta} usos`}`;
}

/** Rótulo curto para a etiqueta. */
export const ETIQUETA_MOTIVO: Record<MotivoAcabando, string> = { acabou: "acabou", vencido: "venceu", ultimo: "último uso", vencendo: "vencendo" };

/** O texto do WhatsApp para oferecer a renovação: diz só o que é verdade (o que falta ou quando venceu) e pergunta se quer renovar. */
export function textoOferecerRenovar(p: Pick<PacoteAcabando, "motivo" | "nome" | "vence_em" | "dias" | "pet" | "tutor">, loja: string) {
  if (p.motivo === "acabou") return textoRenovacao({ tutor: p.tutor?.nome ?? null, petshop: loja, pets: [p.pet.nome], pacote: p.nome, acabou: true });
  const nome = p.nome.replace(/^pacote\s+(de\s+)?/i, "").trim().toLowerCase() || "de banhos";
  const meio = p.motivo === "ultimo" ? `Falta só 1 uso do pacote ${nome} de ${p.pet.nome}.`
    : p.motivo === "vencido" ? `O pacote ${nome} de ${p.pet.nome} venceu em ${dataCurta(p.vence_em!)}.`
    : `O pacote ${nome} de ${p.pet.nome} ${p.dias === 0 ? "vence hoje" : p.dias === 1 ? "vence amanhã" : `vence em ${dataCurta(p.vence_em!)}`}.`;
  return `${saudacaoZap(p.tutor?.nome ?? null, loja)} ${meio} Quer renovar para continuar? É só responder aqui que a gente já deixa separado.`;
}

/** Endereço para vender o pacote de novo (a tela Pacotes abre a venda já preenchida). */
export const linkRenovar = (id: string) => `/gestao/app/pacotes?renovar=${encodeURIComponent(id)}`;
