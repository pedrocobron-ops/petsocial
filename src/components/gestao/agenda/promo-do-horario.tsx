"use client";

import { useState } from "react";
import { RotateCcw, Tag, X } from "lucide-react";
import { descontoCurto, lerPromoDoHorario, linhaDaPromo, type PromoDoHorario } from "@/lib/gestao/promocoes";
import { brl } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { avisarMudanca, useAvisos, useSomenteLeitura } from "../ui";
import "./promo.css";

/**
 * A promoção do horário (a que o banco pôs ao marcar): "Promoção Terça do banho −10%". A equipe tira (ou põe de volta)
 * com um toque, até a conta ser lançada. O preço do horário não muda: a promoção é uma linha de desconto na conta.
 */
export function usePromoDoHorario(agendamentoId: string, inicial: unknown) {
  const { sb } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [promo, setPromo] = useState<PromoDoHorario | null>(() => lerPromoDoHorario(inicial));
  const [ocupado, setOcupado] = useState(false);
  async function usar(sim: boolean) {
    if (somenteLeitura() || ocupado || !promo) return;
    if (!sim && !(await confirmar({ titulo: "Tirar a promoção deste horário?", texto: `${linhaDaPromo(promo)} sai da conta. Dá para pôr de volta depois, enquanto a conta não for fechada.`, confirmar: "Tirar a promoção" }))) return;
    setOcupado(true);
    try {
      const r = await (sb as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> })
        .rpc("agendamento_promo_usar", { p_id: agendamentoId, p_usar: sim });
      if (r.error) throw new Error(r.error.message);
      setPromo(lerPromoDoHorario(r.data) ?? (sim ? null : { ...promo, tirada: true }));
      avisar(sim ? "A promoção voltou para este horário." : "Promoção tirada deste horário.");
      avisarMudanca();
    } catch (e) { avisarErro(e); } finally { setOcupado(false); }
  }
  return { promo, ocupado, tirar: () => usar(false), porDeVolta: () => usar(true) };
}

/** A linha no resumo do horário. `valor`: quanto sai em reais (só para quem vê o dinheiro). */
export function LinhaPromo({ promo, valor, ocupado, podeMudar, aoTirar, aoPorDeVolta }: {
  promo: PromoDoHorario; valor?: number | null; ocupado?: boolean; podeMudar: boolean; aoTirar: () => void; aoPorDeVolta: () => void;
}) {
  if (promo.tirada) {
    return (
      <div className="g-fila entre g-promo-linha tirada">
        <span className="g-muted">Promoção {promo.nome} (tirada)</span>
        {podeMudar && <button type="button" className="g-link" disabled={ocupado} onClick={aoPorDeVolta}><RotateCcw size={14} aria-hidden /> Pôr de volta</button>}
      </div>
    );
  }
  return (
    <div className="g-fila entre g-promo-linha">
      <span><Tag size={14} aria-hidden /> Promoção {promo.nome}</span>
      <span className="g-fila" style={{ gap: 8 }}>
        <b className="g-tab g-verde-t">{valor != null && valor > 0 ? `− ${brl(valor)}` : descontoCurto(promo)}</b>
        {podeMudar && <button type="button" className="g-btn fantasma p" disabled={ocupado} onClick={aoTirar} aria-label={`Tirar a promoção ${promo.nome}`}><X />Tirar</button>}
      </span>
    </div>
  );
}

/** A linha na conta (Fechar a conta), com o mesmo jeito das outras linhas. */
export function LinhaPromoNaConta({ promo, valor, ocupado, aoTirar }: { promo: PromoDoHorario; valor: number; ocupado?: boolean; aoTirar: () => void }) {
  return (
    <div className="g-vd-item g-promo-conta">
      <Tile icone={Tag} tom="menta" />
      <div className="t">
        <b>{linhaDaPromo(promo)}</b>
        <span>{valor > 0 ? "Desconto da promoção do pet shop" : "Nenhum serviço desta conta entra na promoção"}</span>
      </div>
      <b className="g-vd-soma g-tab">− {brl(valor)}</b>
      <div className="g-vd-ctrl">
        <button type="button" className="g-btn fantasma p" disabled={ocupado} onClick={aoTirar} aria-label={`Tirar a promoção ${promo.nome}`}><X />Tirar</button>
      </div>
    </div>
  );
}
