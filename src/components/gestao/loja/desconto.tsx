"use client";

import { useEffect, useState } from "react";
import { descontoDoPct } from "@/lib/gestao/desconto";
import { brl, lerNumeroEstrito } from "@/lib/gestao/util";
import { CampoDinheiro } from "./pecas";

/**
 * "Desconto (se tiver)" em reais ou em %. Em %, o valor em reais acompanha a soma da conta (juntou um produto: a % continua
 * a mesma). Quem recebe o valor (`aoMudar`) recebe sempre reais: a conta, a trava de preço e o banco seguem em reais.
 * `maxPct`/`maximo`: com o preço travado, até quanto o caixa pode dar (a mensagem de passou fica com quem chama, em reais).
 */
export function CampoDesconto({ base, valor, aoMudar, maximo, maxPct }: {
  base: number; valor: number | null; aoMudar: (v: number | null) => void; maximo: number | null; maxPct: number | null;
}) {
  const [modo, setModo] = useState<"reais" | "pct">("reais");
  const [texto, setTexto] = useState("");
  const pct = lerNumeroEstrito(texto);
  const ruim = texto.trim() !== "" && (pct == null || pct > 100);
  // em %, os reais acompanham a soma da conta
  useEffect(() => {
    if (modo !== "pct") return;
    const r = ruim ? null : descontoDoPct(base, pct, maxPct != null && pct != null && pct <= maxPct ? maximo : null);
    if ((r ?? null) !== (valor ?? null)) aoMudar(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, pct, ruim, base, maximo, maxPct]);
  const trocar = (m: "reais" | "pct") => {
    if (m === modo) return;
    setModo(m);
    setTexto("");
    aoMudar(null);
  };
  return (
    <div className="g-campo g-vd-desconto">
      <span className="g-vd-desconto-t" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        Desconto (se tiver)
        <span className="g-seg" role="group" aria-label="Desconto em reais ou em porcentagem">
          <button type="button" aria-pressed={modo === "reais"} onClick={() => trocar("reais")}>R$</button>
          <button type="button" aria-pressed={modo === "pct"} onClick={() => trocar("pct")}>%</button>
        </span>
      </span>
      {modo === "reais" ? (
        // acima do que o caixa pode dar: o campo fica marcado (a frase e o total ficam com quem chama)
        <CampoDinheiro valor={valor} aoMudar={aoMudar} rotulo="Desconto em reais" maximo={maximo != null ? maximo + 0.005 : undefined} />
      ) : (
        <>
          <input className={`g-input g-tab${ruim ? " ruim" : ""}`} inputMode="decimal" placeholder="Ex.: 10" value={texto} aria-label="Desconto em porcentagem"
            aria-invalid={ruim || undefined} onChange={(e) => setTexto(e.target.value)} />
          {ruim ? <small className="erro" role="alert">Escreva só o número da porcentagem, de 0 a 100 (ex.: 10 ou 7,5).</small>
            : pct != null && valor != null && valor > 0 ? <small>{pct.toLocaleString("pt-BR")}% = <b className="g-tab">{brl(valor)}</b> de desconto</small> : null}
        </>
      )}
    </div>
  );
}
