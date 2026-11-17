"use client";

import { useEffect, useState } from "react";
import { RotateCcw, Tag, X } from "lucide-react";
import { descontoCurto, lerPromoDaEstadia, type PromoDaEstadia } from "@/lib/gestao/promocoes";
import { brl, dataCurta } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { avisarMudanca, useAvisos, useSomenteLeitura } from "../ui";
import "../agenda/promo.css";

/**
 * A promoção da estadia (a que o banco pôs ao marcar a reserva ou o check-in): "Promoção Segunda da creche −15%".
 * A equipe tira (ou põe de volta) com um toque, até a conta ser fechada (`estadia_promo_usar`). A diária não muda:
 * a promoção é uma linha de desconto no check-out, só nas noites (hotel) ou no dia (creche) que caem nos dias dela.
 */
export function usePromoDaEstadia(estadiaId: string, inicial: unknown) {
  const { sb } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [promo, setPromo] = useState<PromoDaEstadia | null>(() => lerPromoDaEstadia(inicial));
  const [ocupado, setOcupado] = useState(false);
  // a lista foi lida de novo (outra pessoa tirou a promoção): acompanha
  const chave = JSON.stringify(inicial ?? null);
  useEffect(() => { setPromo(lerPromoDaEstadia(inicial)); }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  async function usar(sim: boolean) {
    if (somenteLeitura() || ocupado || !promo) return;
    if (!sim && !(await confirmar({ titulo: "Tirar a promoção desta estadia?", texto: `A promoção ${promo.nome} (${descontoCurto(promo)}) sai da conta. Dá para pôr de volta depois, enquanto a conta não for fechada.`, confirmar: "Tirar a promoção" }))) return;
    setOcupado(true);
    try {
      const r = await sb.rpc("estadia_promo_usar", { p_id: estadiaId, p_usar: sim });
      if (r.error) throw new Error(r.error.message);
      setPromo(lerPromoDaEstadia(r.data) ?? (sim ? null : { ...promo, tirada: true }));
      avisar(sim ? "A promoção voltou para esta estadia." : "Promoção tirada desta estadia.");
      avisarMudanca();
    } catch (e) { avisarErro(e); } finally { setOcupado(false); }
  }
  return { promo, ocupado, tirar: () => usar(false), porDeVolta: () => usar(true) };
}

/**
 * A linha da promoção (reserva, check-out). `valor`: quanto sai em reais (só para quem vê o dinheiro); `dias`: as noites ou o dia
 * em que ela vale nesta conta.
 */
export function LinhaPromoDaEstadia({ promo, tipo, valor, dias, ocupado, podeMudar, aoTirar, aoPorDeVolta }: {
  promo: PromoDaEstadia; tipo: string; valor?: number | null; dias?: string[] | null; ocupado?: boolean; podeMudar: boolean; aoTirar: () => void; aoPorDeVolta: () => void;
}) {
  if (promo.tirada) {
    return (
      <div className="g-fila entre g-promo-linha tirada">
        <span className="g-muted">Promoção {promo.nome} (tirada)</span>
        {podeMudar && <button type="button" className="g-link" disabled={ocupado} onClick={aoPorDeVolta}><RotateCcw size={14} aria-hidden /> Pôr de volta</button>}
      </div>
    );
  }
  const onde = dias == null ? null
    : !dias.length ? (tipo === "hotel" ? "nenhuma noite cai nos dias da promoção" : "o dia não é dia da promoção")
    : tipo === "hotel" ? `${dias.length === 1 ? "1 noite" : `${dias.length} noites`}: ${dias.slice(0, 5).map((d) => dataCurta(d)).join(", ")}${dias.length > 5 ? "…" : ""}`
    : dataCurta(dias[0]);
  return (
    <div className="g-fila entre g-promo-linha" role="group" aria-label={`Promoção ${promo.nome}`}>
      <span><Tag size={14} aria-hidden /> Promoção {promo.nome} {descontoCurto(promo)}{onde ? <small className="g-muted"> · {onde}</small> : null}</span>
      <span className="g-fila" style={{ gap: 8 }}>
        {valor != null && <b className="g-tab g-verde-t">{valor > 0 ? `− ${brl(valor)}` : brl(0)}</b>}
        {podeMudar && <button type="button" className="g-btn fantasma p" disabled={ocupado} onClick={aoTirar} aria-label={`Tirar a promoção ${promo.nome}`}><X />Tirar</button>}
      </span>
    </div>
  );
}
