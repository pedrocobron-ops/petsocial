import type { Banco } from "./supabase";
import type { Database } from "./banco";

/**
 * Crédito do tutor: o que ele pagou a mais (por exemplo, o pet saiu antes do fim de uma estadia paga adiantado) e
 * ficou para a próxima conta. Cada movimento é uma linha de `clientes_creditos` (positivo = deixou, negativo = usou);
 * o saldo é a soma. Só quem mexe com dinheiro lê, e só a função `credito_do_tutor_mover` grava (ela confere o saldo).
 */
export type MovimentoDeCredito = Pick<Database["public"]["Tables"]["clientes_creditos"]["Row"], "id" | "valor" | "motivo" | "criado_em" | "estadia_id">;

const real = (n: number) => Math.round(n * 100) / 100;

/** Saldo e movimentos de crédito de um tutor (os mais novos primeiro). Sem acesso, ou sem a tabela, volta zero. */
export async function creditoDoTutor(sb: Banco, petshopId: string, clienteId: string | null | undefined): Promise<{ saldo: number; movimentos: MovimentoDeCredito[] }> {
  if (!clienteId) return { saldo: 0, movimentos: [] };
  // o saldo é somado no banco (todos os movimentos); a lista traz só os 200 mais novos, para mostrar
  const [r, s] = await Promise.all([
    sb.from("clientes_creditos").select("id, valor, motivo, criado_em, estadia_id").eq("petshop_id", petshopId).eq("cliente_id", clienteId)
      .order("criado_em", { ascending: false }).order("id").limit(200),
    sb.rpc("credito_saldo", { p_petshop: petshopId, p_cliente: clienteId }),
  ]);
  if (r.error) return { saldo: 0, movimentos: [] };
  const movimentos = (r.data ?? []) as MovimentoDeCredito[];
  const somaDaLista = real(movimentos.reduce((t, m) => t + Number(m.valor), 0));
  return { saldo: s.error || s.data == null ? somaDaLista : real(Number(s.data)), movimentos };
}

/** Deixa (valor > 0) ou usa (valor < 0) crédito. A mesma chave de novo não grava outra vez. */
export async function moverCredito(sb: Banco, petshopId: string, m: { clienteId: string; valor: number; estadiaId?: string | null; motivo?: string | null; chave?: string | null }) {
  const { data, error } = await sb.rpc("credito_do_tutor_mover", {
    p_petshop: petshopId, p_cliente: m.clienteId, p_valor: real(m.valor), p_estadia: m.estadiaId ?? undefined, p_motivo: m.motivo ?? undefined, p_chave: m.chave ?? undefined,
  });
  if (error) throw new Error(error.message);
  const r = data as { ok: boolean; erro?: string; saldo?: number; id?: string } | null;
  if (!r?.ok) {
    throw new Error(r?.erro === "saldo" ? `O crédito do tutor mudou: agora é de ${(r.saldo ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`
      : r?.erro === "cliente" ? "Tutor não encontrado." : "Não consegui gravar o crédito.");
  }
  return r;
}
