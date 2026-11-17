import type Anthropic from "@anthropic-ai/sdk";
import type { Contexto } from "./ferramentas";
import { lerSinaisDoPeriodo } from "../sinais";

/**
 * Mozart: "quanto recebi de sinal este mês?", "quanto falta receber dos sinais?", "devolvi quanto de sinal?".
 * A mesma conta de Relatórios (cartão do hotel: Sinais recebidos e devolvidos), por `lerSinaisDoPeriodo` (src/lib/gestao/sinais.ts).
 * Só para quem cuida do financeiro (Relatórios também é).
 */
export const FERRAMENTA_SINAIS: Anthropic.Tool & { grava: false; financeiro: true } = {
  grava: false, financeiro: true,
  name: "ver_sinais",
  description: "Sinais e valores pagos adiantado da creche e do hotel entre dois dias (inclusive): quanto entrou de sinal (cada parte no dia em que entrou) e de quantas reservas, quanto foi devolvido (cancelamento com devolução e sobra devolvida no check-out), quanto ficou de crédito para o tutor e quanto ainda falta receber dos sinais combinados (A receber, agora). É a mesma conta de Relatórios. Use para \"quanto recebi de sinal este mês?\" e \"quanto falta receber dos sinais?\". O resumo_financeiro não separa os sinais.",
  input_schema: { type: "object", additionalProperties: false, required: ["de", "ate"], properties: { de: { type: "string", description: "AAAA-MM-DD" }, ate: { type: "string", description: "AAAA-MM-DD" } } },
};

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

export async function consultarSinais(c: Contexto, nome: string, e: Record<string, unknown>, erro: (m: string) => Error): Promise<{ resultado: unknown } | null> {
  if (nome !== "ver_sinais") return null;
  if (!c.cuidoDoFinanceiro) throw erro("Esta pessoa não tem a área Financeiro nem Relatórios: não vê os sinais do período. O dono pode liberar em Equipe.");
  const de = String(e.de ?? ""), ate = String(e.ate ?? "");
  if (!RE_DIA.test(de) || !RE_DIA.test(ate) || ate < de) throw erro("Datas no formato AAAA-MM-DD, com ate depois de de.");
  const s = await lerSinaisDoPeriodo(c.sb, c.petshop.id, de, ate, c.fusoMin);
  return {
    resultado: {
      de, ate,
      sinais_recebidos: s.recebido, reservas_com_sinal_recebido: s.recebidos,
      devolvido: s.devolvido, devolucoes: s.devolucoes,
      ...(s.credito > 0 ? { deixado_de_credito_para_o_tutor: s.credito } : {}),
      sinais_a_receber_agora: s.aReceber, sinais_a_receber_quantos: s.aReceberN,
      conta: "Sinal recebido inclui o que foi pago adiantado na reserva ou no check-in. É a mesma conta de Relatórios (Sinais recebidos e devolvidos). A receber é de agora, não do período.",
      onde_ver: "Relatórios, cartão do hotel (Sinais recebidos e devolvidos); os que faltam receber ficam em Caixa, Contas de clientes, e em A receber.",
    },
  };
}
