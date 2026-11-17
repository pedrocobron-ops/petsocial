import type Anthropic from "@anthropic-ai/sdk";
import { lerModoEnvio, montarFila, resumoDaFila } from "../modo-envio";
import type { Contexto } from "./ferramentas";

/**
 * Ferramenta de consulta "mensagens_para_mandar" do Mozart ("quantas mensagens tenho para mandar hoje?"): a mesma fila da tela
 * Mandar mensagens (`src/lib/gestao/modo-envio.ts`, função `gestao_modo_envio`), contada por tipo, com quem ficou de fora.
 * Só lê e nunca manda nada: aponta para a tela, onde cada mensagem abre no WhatsApp do aparelho.
 * O banco já tira o que a pessoa não pode ver (cobrança só com área de dinheiro; cada tipo pela área).
 */

type Def = Anthropic.Tool & { grava: boolean; financeiro?: boolean };

export const FERRAMENTAS_ENVIO: Def[] = [
  { grava: false, name: "mensagens_para_mandar",
    description: "Quantas mensagens de WhatsApp estão prontas para mandar hoje (\"quantas mensagens tenho para mandar?\", \"tem lembrete para mandar?\"), por tipo: pet pronto para buscar, lembrete dos horários de amanhã, aviso de chegada da creche e do hotel, cobrança gentil, vacina vencendo, renovação de pacote, aniversário do pet, aniversário do tutor e chamar de volta. Diz também quantos ficaram de fora (sem telefone, telefone incompleto, não quer receber). Só conta: quem manda é a pessoa, na tela Mandar mensagens.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false } },
];

/** Roda a ferramenta; devolve null quando o nome não é desta lista. */
export async function consultarEnvio(c: Contexto, nome: string) {
  if (nome !== "mensagens_para_mandar") return null;
  const d = await lerModoEnvio(c.sb, c.petshop.id);
  if (!d) return { resultado: { total: 0, aviso: "A tela Mandar mensagens ainda não está disponível neste pet shop." } };
  const fila = montarFila(d, c.petshop);
  const motivos = new Map<string, number>();
  for (const p of fila.pulados) motivos.set(p.motivo, (motivos.get(p.motivo) ?? 0) + 1);
  return {
    resultado: {
      total: fila.mensagens.length,
      por_tipo: resumoDaFila(fila).map((t) => ({ tipo: t.rotulo, quantas: t.quantas })),
      ficaram_de_fora: [...motivos].map(([motivo, quantos]) => ({ motivo, quantos })),
      onde_mandar: "Menu, Mandar mensagens (ou o cartão \"Mandar N mensagens\" na tela Hoje): uma por vez, o WhatsApp abre com o texto pronto e a pessoa aperta enviar. Nada é enviado sozinho.",
    },
  };
}
