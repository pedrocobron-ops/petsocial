import { isoDia } from "./util";

/** O que a conta de cruzamento precisa de uma reserva ou estadia. */
export type Periodo = { tipo: string; entrada: string; saida_prevista: string | null; status: string };
type Aberta = Periodo & { id: string; pet_id: string };

/** Primeiro e último dia do período no calendário (os dois contam). Quem está na casa sem saída prevista não tem fim. */
export function pontas(e: Periodo, hoje: string): [string, string] {
  const ini = isoDia(new Date(e.entrada));
  // creche é de um dia: quem está na creche sem saída prevista sai hoje (um dia extra para depois não cruza com ela)
  let fim = e.saida_prevista ? isoDia(new Date(e.saida_prevista)) : e.status === "em_casa" ? (e.tipo === "creche" ? hoje : "9999-12-31") : ini;
  if (e.status === "em_casa" && hoje > fim) fim = hoje;
  return [ini, fim < ini ? ini : fim];
}
/**
 * Outra reserva ou estadia aberta do mesmo pet que cruza o período novo. É a mesma conta do aceite de pedido no banco:
 * as datas se cruzam no calendário, com o dia da saída contando. Quem já está na casa não entra de novo.
 */
export function conflitoDoPet<E extends Aberta>(petId: string, novo: Periodo, abertas: E[], ignorar: string | null, hoje: Date): E | null {
  const hojeIso = isoDia(hoje);
  const [de, ate] = pontas(novo, hojeIso);
  for (const e of abertas) {
    if (e.pet_id !== petId || e.id === ignorar) continue;
    if (novo.status === "em_casa" && e.status === "em_casa") return e;
    const [a, b] = pontas(e, hojeIso);
    // passa o dia na creche e dorme no hotel: a reserva do hotel pode começar no dia em que a creche termina, depois da saída
    const fimDaCreche = e.tipo === "creche" && e.status === "em_casa" && !e.saida_prevista ? hojeIso : b;
    if (novo.tipo === "hotel" && novo.status === "reservada" && e.tipo === "creche" && de === fimDaCreche
      && new Date(novo.entrada) >= new Date(e.saida_prevista ?? e.entrada) && (e.status !== "em_casa" || new Date(novo.entrada) > hoje)) continue;
    if (a <= ate && b >= de) return e;
  }
  return null;
}
