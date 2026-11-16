import type { Banco } from "./supabase";
import { lerTudo, contando } from "./paginas";
import { isoDia, deIsoDia, somaDias } from "./util";

/**
 * Faturamento: a regra única de quanto o negócio faturou num período (Relatórios, Hoje, Financeiro, meta do mês).
 *
 *   faturamento = entradas recebidas
 *               − devoluções (saídas pagas nas categorias de devolução: o dinheiro entrou e voltou para o tutor)
 *               − crédito deixado para o tutor (ainda é dele: só vira faturamento quando ele usar)
 *               + crédito usado fora de uma entrada (o check-out do hotel desconta o crédito da conta sem lançar essa parte)
 *
 * O crédito usado dentro de uma conta (Fechar a conta, creche, Recebi) já está na entrada, pelo valor cheio da conta
 * (`lancamentos.credito_usado`). Cada ajuste conta no dia em que aconteceu.
 * Só quem cuida do financeiro lê as saídas: para os outros, os ajustes ficam zerados.
 */
export const CATEGORIAS_DEVOLUCAO = ["Devolução", "Devolução de sinal"];

export type AjustesDoFaturamento = {
  devolvido: number; devolucoes: number;
  creditoDeixado: number; creditoUsadoFora: number;
  /** O ajuste de cada dia (AAAA-MM-DD), já com o sinal: somar ao que entrou no dia. */
  porDia: Map<string, number>;
  /** O ajuste de cada tutor, já com o sinal (quanto ele gastou no período). */
  porCliente: Map<string, number>;
};

const real = (n: number) => Math.round(n * 100) / 100;
export const SEM_AJUSTES: AjustesDoFaturamento = { devolvido: 0, devolucoes: 0, creditoDeixado: 0, creditoUsadoFora: 0, porDia: new Map(), porCliente: new Map() };

/** Os ajustes do faturamento de `de` a `ate` (AAAA-MM-DD, os dois entram). */
export async function ajustesDoFaturamento(sb: Banco, petshopId: string, de: string, ate: string): Promise<AjustesDoFaturamento> {
  const [devolucoes, creditos] = await Promise.all([
    lerTudo<{ id: string; valor: number; data: string; cliente_id: string | null }>((a, b, contar) => sb.from("lancamentos").select("id, valor, data, cliente_id", contando(contar)).eq("petshop_id", petshopId)
      .eq("tipo", "saida").eq("pago", true).is("movimento", null).in("categoria", CATEGORIAS_DEVOLUCAO).gte("data", de).lte("data", ate).order("data").order("id").range(a, b)).catch(() => []),
    lerTudo<{ id: string; valor: number; criado_em: string; lancamento_id: string | null; cliente_id: string }>((a, b, contar) => sb.from("clientes_creditos").select("id, valor, criado_em, lancamento_id, cliente_id", contando(contar)).eq("petshop_id", petshopId)
      .gte("criado_em", deIsoDia(de).toISOString()).lt("criado_em", somaDias(deIsoDia(ate), 1).toISOString()).order("criado_em").order("id").range(a, b)).catch(() => []),
  ]);
  const x: AjustesDoFaturamento = { devolvido: 0, devolucoes: devolucoes.length, creditoDeixado: 0, creditoUsadoFora: 0, porDia: new Map(), porCliente: new Map() };
  const somar = (dia: string, cliente: string | null, v: number) => {
    x.porDia.set(dia, real((x.porDia.get(dia) ?? 0) + v));
    if (cliente) x.porCliente.set(cliente, real((x.porCliente.get(cliente) ?? 0) + v));
  };
  for (const l of devolucoes) { x.devolvido = real(x.devolvido + Number(l.valor)); somar(l.data, l.cliente_id, -Number(l.valor)); }
  for (const c of creditos) {
    const v = Number(c.valor), dia = isoDia(new Date(c.criado_em));
    if (v > 0) { x.creditoDeixado = real(x.creditoDeixado + v); somar(dia, c.cliente_id, -v); }
    else if (!c.lancamento_id) { x.creditoUsadoFora = real(x.creditoUsadoFora - v); somar(dia, c.cliente_id, -v); }
  }
  return x;
}

/** O faturamento: o que entrou, com os ajustes. */
export const faturamentoLiquido = (entradas: number, a: AjustesDoFaturamento) => real(entradas - a.devolvido - a.creditoDeixado + a.creditoUsadoFora);

/** Tem algum ajuste para explicar na tela? */
export const temAjuste = (a: AjustesDoFaturamento) => a.devolvido > 0 || a.creditoDeixado > 0 || a.creditoUsadoFora > 0;

/** "já sem R$ 50,00 devolvidos e R$ 20,00 que ficaram de crédito" (frase curta para o apoio de um número). */
export function fraseDosAjustes(a: AjustesDoFaturamento, brl: (n: number) => string): string {
  const partes = [
    a.devolvido > 0 && `${brl(a.devolvido)} ${a.devolucoes === 1 ? "devolvido" : "devolvidos"}`,
    a.creditoDeixado > 0 && `${brl(a.creditoDeixado)} que ficaram de crédito`,
  ].filter(Boolean) as string[];
  const mais = a.creditoUsadoFora > 0 ? `com ${brl(a.creditoUsadoFora)} de crédito usado` : "";
  if (!partes.length) return mais;
  const sem = `já sem ${partes.join(" e ")}`;
  return mais ? `${sem}, ${mais}` : sem;
}
