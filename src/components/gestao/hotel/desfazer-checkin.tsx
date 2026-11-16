"use client";

import { Undo2 } from "lucide-react";
import { useState } from "react";
import { dataCurta, isoDia } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { avisarMudanca, mensagemDeErro, useAvisos, useDados, useSomenteLeitura } from "../ui";
import { horaCurta, type EstadiaCompleta } from "./tipos";

/** O check-in de hoje que ainda dá para desfazer (o banco guardou a data reservada: tabela `estadias_checkin_feito`). */
export type CheckinFeito = { estadia_id: string; entrada_reservada: string; feito_em: string };

/** Os check-ins feitos hoje nas estadias que estão na casa. Uma leitura só para a tela inteira. */
export function useCheckinsDeHoje(ids: string[]) {
  const { sb, petshop } = useGestao();
  const chave = ids.slice().sort().join(",");
  const { dados, recarregar } = useDados(async () => {
    const m = new Map<string, CheckinFeito>();
    if (!ids.length) return m;
    const r = await sb.from("estadias_checkin_feito").select("estadia_id, entrada_reservada, feito_em").eq("petshop_id", petshop.id).in("estadia_id", ids);
    // sem a tabela (banco antigo) ou sem acesso: só não oferece desfazer
    if (r.error) return m;
    const hoje = isoDia(new Date());
    for (const x of (r.data ?? []) as CheckinFeito[]) if (isoDia(new Date(x.feito_em)) === hoje) m.set(x.estadia_id, x);
    return m;
  }, [petshop.id, chave]);
  return { checkins: dados ?? new Map<string, CheckinFeito>(), recarregar };
}

/**
 * Aviso no cartão de quem entrou hoje pela reserva: quando foi e para quando era. "Desfazer check-in" volta para a reserva,
 * na data de antes (só no mesmo dia; na casa ainda não houve check-out, então não há cobrança para desfazer).
 */
export function DesfazerCheckin({ estadia, feito, aoDesfazer }: { estadia: EstadiaCompleta; feito: CheckinFeito; aoDesfazer: () => void }) {
  const { sb } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [ocupado, setOcupado] = useState(false);
  const nome = estadia.pets?.nome ?? "O pet";
  const outroDia = isoDia(new Date(feito.entrada_reservada)) !== isoDia(new Date(estadia.entrada));
  async function desfazer() {
    if (somenteLeitura() || ocupado) return;
    if (!(await confirmar({
      titulo: "Desfazer o check-in?",
      texto: `${nome} volta para as reservas, com a entrada em ${dataCurta(feito.entrada_reservada)}, ${horaCurta(feito.entrada_reservada)}, como estava antes.`,
      confirmar: "Desfazer check-in",
    }))) return;
    setOcupado(true);
    try {
      const r = await sb.rpc("estadia_desfazer_checkin", { p_estadia: estadia.id });
      if (r.error) throw new Error(r.error.message);
      avisar(`Check-in desfeito. ${nome} voltou para as reservas, em ${dataCurta(feito.entrada_reservada)}.`);
      avisarMudanca();
      aoDesfazer();
    } catch (e) { avisarErro(mensagemDeErro(e)); } finally { setOcupado(false); }
  }
  return (
    <div className="g-ht-desfazer">
      <span className="g-pp">Check-in feito hoje, {horaCurta(feito.feito_em)}{outroDia ? `. A reserva era para ${dataCurta(feito.entrada_reservada)}.` : "."}</span>
      <button type="button" className="g-btn fantasma p" onClick={() => void desfazer()} disabled={ocupado}><Undo2 />{ocupado ? "Desfazendo…" : "Desfazer check-in"}</button>
    </div>
  );
}
