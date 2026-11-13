import type { Banco } from "./supabase";
import { contando, lerTudo } from "./paginas";
import { inicioDoDia } from "./util";

/**
 * Última visita de cada pet e a regra de "sumido", num lugar só.
 * Usam esta conta: a lista de Clientes (número do topo e filtros), a folha "Chamar de volta",
 * a linha da tela Hoje e o resumo da semana. Assim o número é o mesmo em todo lugar.
 */

/** O que se sabe das visitas de um pet. */
export type Visita = {
  /** Última vez que veio: atendimento concluído, saída de creche ou hotel, ou agora se está na casa. Vazio = nunca veio. */
  ultima: string | null;
  /** O que foi essa última visita (nome do serviço, "Creche" ou "Hotel"). */
  servico: string | null;
  /** Já tem algo por vir: horário de hoje em diante, reserva de creche ou hotel, ou está na casa agora. */
  marcado: boolean;
};

/** As visitas de todos os pets do pet shop que já vieram ou têm algo marcado. Só leitura. */
export async function buscarVisitas(sb: Banco, petshopId: string, agora = new Date()): Promise<Map<string, Visita>> {
  const [concluidos, estadias, futuros] = await Promise.all([
    lerTudo<{ pet_id: string; inicio: string; servicos: { nome: string } | null }>((de, ate, contar) =>
      sb.from("agendamentos").select("pet_id, inicio, servicos(nome)", contando(contar)).eq("petshop_id", petshopId).eq("status", "concluido")
        .order("inicio", { ascending: false }).order("id").range(de, ate)),
    lerTudo<{ pet_id: string; entrada: string; saida: string | null; status: string; tipo: string }>((de, ate, contar) =>
      sb.from("estadias").select("pet_id, entrada, saida, status, tipo", contando(contar)).eq("petshop_id", petshopId).in("status", ["encerrada", "em_casa", "reservada"])
        .order("entrada", { ascending: false }).order("id").range(de, ate)),
    lerTudo<{ pet_id: string }>((de, ate, contar) =>
      sb.from("agendamentos").select("pet_id", contando(contar)).eq("petshop_id", petshopId).gte("inicio", inicioDoDia(agora).toISOString())
        .in("status", ["marcado", "confirmado", "em_atendimento"]).order("inicio").order("id").range(de, ate)),
  ]);
  const mapa = new Map<string, Visita>();
  const de = (petId: string) => {
    let v = mapa.get(petId);
    if (!v) { v = { ultima: null, servico: null, marcado: false }; mapa.set(petId, v); }
    return v;
  };
  const veio = (v: Visita, quando: string, servico: string | null) => {
    if (!v.ultima || new Date(quando) > new Date(v.ultima)) { v.ultima = quando; v.servico = servico; }
  };
  for (const l of concluidos) veio(de(l.pet_id), l.inicio, l.servicos?.nome ?? null);
  // creche e hotel também é visita: estadia encerrada conta pelo dia da saída; quem está na casa veio hoje
  for (const l of estadias) {
    const v = de(l.pet_id), nome = l.tipo === "hotel" ? "Hotel" : "Creche";
    if (l.status === "encerrada") veio(v, l.saida ?? l.entrada, nome);
    else {
      v.marcado = true;
      if (l.status === "em_casa") veio(v, agora.toISOString(), nome);
    }
  }
  for (const l of futuros) de(l.pet_id).marcado = true;
  return mapa;
}

/** Dias inteiros desde a última visita (0 = veio hoje). */
export const diasSemVir = (ultima: string, hoje = new Date()) =>
  Math.round((inicioDoDia(hoje).getTime() - inicioDoDia(new Date(ultima)).getTime()) / 864e5);

/**
 * Sumido: já veio, está há mais de `dias` dias sem vir e não tem nada marcado
 * (nem horário de hoje em diante, nem reserva de creche ou hotel). Quem nunca veio não é sumido.
 */
export function sumiu(v: Visita | null | undefined, dias: number, hoje = new Date()): boolean {
  return !!v?.ultima && !v.marcado && diasSemVir(v.ultima, hoje) > dias;
}
