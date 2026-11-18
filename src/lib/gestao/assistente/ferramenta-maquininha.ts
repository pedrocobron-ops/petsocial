import type Anthropic from "@anthropic-ai/sdk";
import type { Contexto } from "./ferramentas";
import { taxasDoPeriodo } from "../maquininha";

/**
 * Mozart: "quanto a maquininha ainda vai me pagar e em que datas?", "quanto a maquininha ficou este mês?". A mesma conta do
 * cartão Taxas da maquininha de Relatórios e do Financeiro (função `taxas_do_periodo`, por `taxasDoPeriodo`): as taxas do
 * período e o que a maquininha ainda vai pagar, por dia, já sem a taxa (crédito parcelado: uma parcela por mês).
 * Só para quem cuida do financeiro (o banco confere de novo). Só lê.
 */
export const FERRAMENTA_MAQUININHA: Anthropic.Tool & { grava: false; financeiro: true } = {
  grava: false, financeiro: true,
  name: "ver_maquininha",
  description: "Maquininha de cartão e Pix: quanto ela ainda vai pagar (a_receber_da_maquininha: o total e cada dia, já sem a taxa; crédito parcelado em uma parcela por mês) e, entre dois dias, quanto ficou de taxa por forma de pagamento. É a mesma conta do cartão Taxas da maquininha em Relatórios. Use para \"quanto a maquininha ainda vai me pagar?\" e \"quanto paguei de taxa este mês?\". Sem datas, o mês atual.",
  input_schema: { type: "object", additionalProperties: false, required: [], properties: { de: { type: "string", description: "AAAA-MM-DD" }, ate: { type: "string", description: "AAAA-MM-DD" } } },
};

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const real = (n: number) => Math.round(n * 100) / 100;
const FORMA: Record<string, string> = { debito: "débito", credito: "crédito", pix: "Pix" };

export async function consultarMaquininha(c: Contexto, nome: string, e: Record<string, unknown>, erro: (m: string) => Error): Promise<{ resultado: unknown } | null> {
  if (nome !== "ver_maquininha") return null;
  if (!c.cuidoDoFinanceiro) throw erro("A maquininha é com quem cuida do financeiro (Financeiro ou Relatórios). O dono pode liberar em Equipe.");
  const hoje = c.agora.slice(0, 10);
  const de = typeof e.de === "string" && RE_DIA.test(e.de) ? e.de : `${hoje.slice(0, 8)}01`;
  const ate = typeof e.ate === "string" && RE_DIA.test(e.ate) ? e.ate : hoje;
  if (ate < de) throw erro("A data final vem depois da inicial.");
  const t = await taxasDoPeriodo(c.sb, c.petshop.id, de, ate);
  if (!t) throw erro("Não consegui ler a maquininha agora.");
  const aReceber = real(t.a_receber.reduce((s, x) => s + x.valor, 0));
  return {
    resultado: {
      de, ate,
      taxas_cadastradas: t.configurada,
      ...(t.configurada ? {} : { aviso: "A loja não colocou as taxas da maquininha: sem elas não dá para saber quanto ela vai pagar nem quando. É em Meu pet shop, Taxas da maquininha." }),
      taxa_no_periodo: t.taxa, pagamentos_com_taxa: t.lancamentos,
      por_forma: t.por_forma.filter((f) => f.valor > 0).map((f) => ({ forma: FORMA[f.forma] ?? f.forma, recebido: f.valor, taxa: f.taxa })),
      a_receber_da_maquininha: { total: aReceber, dias: t.a_receber.slice(0, 40).map((x) => ({ dia: x.dia, valor: x.valor })), ...(t.a_receber.length > 40 ? { dias_no_total: t.a_receber.length } : {}) },
      ...(t.parcelado ? { parcelado: "Crédito parcelado: uma parcela por mês, a 1ª no prazo do parcelado e as outras a cada 30 dias." } : {}),
      conta: "O que a maquininha ainda vai pagar é de agora (depois de hoje), já sem a taxa, pelos dias para cair que o dono colocou em Meu pet shop. Não é o que os clientes devem.",
      onde_ver: "Relatórios, cartão Taxas da maquininha (A receber da maquininha, com as datas). O mesmo cartão aparece no Financeiro, no resumo do mês. Financeiro, A receber, mostra os clientes que devem, não a maquininha.",
    },
  };
}
