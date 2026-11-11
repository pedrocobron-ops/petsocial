import type { Banco } from "./supabase";
import { isoDia } from "./util";

/** Caixa aberto do pet shop (ou null). Só quem vê o financeiro consegue ler. */
export async function caixaAberto(sb: Banco, petshopId: string) {
  const { data } = await sb.from("caixas").select("*").eq("petshop_id", petshopId).is("fechado_em", null).maybeSingle();
  return data;
}

/** Uma linha de uma venda ou comanda, como fica guardada em `lancamentos.itens`. `valor` é o preço de uma unidade. */
export type ItemLancamento = { tipo: "servico" | "produto" | "extra"; nome: string; qtd: number; valor: number; produto_id?: string };

/**
 * Registra dinheiro que já entrou ou saiu hoje. Se houver caixa aberto, o lançamento entra nele.
 * Use para: receber um atendimento, vender um pacote, fechar uma estadia, pagar uma despesa na hora.
 */
export async function lancarPago(sb: Banco, petshopId: string, l: {
  tipo: "entrada" | "saida"; valor: number; forma: "dinheiro" | "pix" | "debito" | "credito" | "outro";
  categoria: string; descricao?: string | null; agendamentoId?: string | null; clienteId?: string | null;
  origem?: "tela" | "assistente" | "sistema"; data?: string; itens?: ItemLancamento[] | null;
}) {
  const caixa = await caixaAberto(sb, petshopId);
  const { data: u } = await sb.auth.getUser();
  const { data, error } = await sb.from("lancamentos").insert({
    petshop_id: petshopId, tipo: l.tipo, valor: l.valor, forma: l.forma, categoria: l.categoria, descricao: l.descricao ?? null,
    data: l.data ?? isoDia(new Date()), pago: true, caixa_id: caixa?.id ?? null,
    agendamento_id: l.agendamentoId ?? null, cliente_id: l.clienteId ?? null, origem: l.origem ?? "tela", criado_por: u.user?.id ?? null,
    ...(l.itens?.length ? { itens: l.itens } : {}),
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}
