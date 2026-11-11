"use client";

import { FORMAS } from "@/lib/gestao/tipos";
import "./loja.css";

export type Forma = (typeof FORMAS)[number]["id"];

/** Forma de pagamento em chips. */
export function ChipsForma({ valor, aoMudar }: { valor: Forma; aoMudar: (f: Forma) => void }) {
  return (
    <div className="g-campo">
      <span>Forma de pagamento</span>
      <div className="g-chips">
        {FORMAS.map((f) => (
          <button key={f.id} type="button" className="g-chip" aria-pressed={valor === f.id} onClick={() => aoMudar(f.id)}>{f.rotulo}</button>
        ))}
      </div>
    </div>
  );
}

/** Chips de escolha única. */
export function Chips<T extends string>({ opcoes, valor, aoMudar }: {
  opcoes: readonly { id: T; rotulo: string }[]; valor: T; aoMudar: (v: T) => void;
}) {
  return (
    <div className="g-chips">
      {opcoes.map((o) => (
        <button key={o.id} type="button" className="g-chip" aria-pressed={valor === o.id} onClick={() => aoMudar(o.id)}>{o.rotulo}</button>
      ))}
    </div>
  );
}

/** Lê uma quantidade digitada ("10", "2,5"). Devolve null se não for número positivo ou zero. */
export function lerQtd(s: string): number | null {
  const t = s.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : null;
}

/** "10", "2,5", "0,125" */
export const fmtQtd = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** Erro de carregamento com botão de tentar de novo. */
export function ErroTela({ erro, aoTentar }: { erro: string; aoTentar: () => void }) {
  return (
    <div className="g-aviso vermelho" role="alert">
      <span>{erro}</span>
      <button type="button" className="g-btn sec p" onClick={aoTentar}>Tentar de novo</button>
    </div>
  );
}
