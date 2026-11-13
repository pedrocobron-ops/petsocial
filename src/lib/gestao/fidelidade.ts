import type { Banco } from "./supabase";
import type { Petshop } from "./tipos";
import { deIsoDia } from "./util";

/**
 * Fidelidade: a cada N atendimentos concluídos, o tutor ganha um prêmio (texto livre do dono).
 * A contagem é por tutor, soma todos os pets dele e vale do dia em que o programa foi ligado em diante.
 * Cada prêmio entregue guarda quantos atendimentos consumiu, então trocar o N depois não mexe no que já foi entregue.
 */
export type Programa = { cada: number; premio: string; desde: string };
export type Resgate = { id: string; premio: string; atendimentos: number; criado_em: string };
export type Fidelidade = {
  programa: Programa;
  /** Atendimentos que contam para o próximo prêmio (0 a cada - 1). */
  parte: number;
  /** Prêmios ganhos e ainda não entregues. */
  premios: number;
  /** Entregas desde que o programa foi ligado, da mais nova para a mais antiga. */
  resgates: Resgate[];
};

export const FIDELIDADE_MIN = 2, FIDELIDADE_MAX = 50, FIDELIDADE_PREMIO_MAX = 80;
/** Quem entrega (e desfaz) prêmio: as mesmas áreas que o banco confere. */
export const AREAS_FIDELIDADE = ["agenda", "caixa", "clientes"] as const;

/** O programa do pet shop, ou null se está desligado. */
export function programaDe(p: Pick<Petshop, "fidelidade_cada" | "fidelidade_premio" | "fidelidade_desde">): Programa | null {
  const premio = p.fidelidade_premio?.trim();
  if (!p.fidelidade_desde || !premio || !p.fidelidade_cada || p.fidelidade_cada < FIDELIDADE_MIN) return null;
  return { cada: p.fidelidade_cada, premio, desde: p.fidelidade_desde };
}

/** Faz a conta: concluídos menos o que os prêmios já entregues consumiram. */
export function calcularFidelidade(programa: Programa, concluidos: number, resgates: Resgate[]): Fidelidade {
  const saldo = Math.max(0, concluidos - resgates.reduce((t, r) => t + r.atendimentos, 0));
  return { programa, parte: saldo % programa.cada, premios: Math.floor(saldo / programa.cada), resgates };
}

/** Busca a contagem de um tutor. */
export async function lerFidelidade(sb: Banco, petshopId: string, programa: Programa, clienteId: string): Promise<Fidelidade> {
  const desde = deIsoDia(programa.desde).toISOString();
  const [concluidos, resgates] = await Promise.all([
    sb.from("agendamentos").select("id, pets!inner(cliente_id)", { count: "exact", head: true })
      .eq("petshop_id", petshopId).eq("status", "concluido").gte("inicio", desde).eq("pets.cliente_id", clienteId),
    sb.from("fidelidade_resgates").select("id, premio, atendimentos, criado_em")
      .eq("petshop_id", petshopId).eq("cliente_id", clienteId).gte("criado_em", desde).order("criado_em", { ascending: false }),
  ]);
  if (concluidos.error) throw new Error(concluidos.error.message);
  if (resgates.error) throw new Error(resgates.error.message);
  return calcularFidelidade(programa, concluidos.count ?? 0, (resgates.data ?? []) as Resgate[]);
}
