"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Trilho com scroll-snap e o indicador "1 de 4 · deslize para ver mais" (brief 20, 6.12 e 7.4 bloco 9).
 * O indicador é atualizado no `scrollend` (com fallback no `scroll`) e anunciado com `aria-live`.
 * Sem JavaScript o trilho continua rolando; o indicador fica no "1 de N".
 */
export default function Trilho({
  total, className, children, rotulo = "deslize para ver mais", indicadorClasse = "", as: Tag = "div", ariaLabel,
}: {
  total: number; className: string; children: React.ReactNode; rotulo?: string; indicadorClasse?: string; as?: "div" | "ol" | "ul"; ariaLabel?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [atual, setAtual] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let quadro = 0;
    const mede = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        const filhos = Array.from(el.children) as HTMLElement[];
        if (!filhos.length) return;
        const base = el.getBoundingClientRect().left + parseFloat(getComputedStyle(el).paddingLeft || "0");
        let melhor = 0;
        let menor = Infinity;
        filhos.forEach((f, i) => {
          const d = Math.abs(f.getBoundingClientRect().left - base);
          if (d < menor) { menor = d; melhor = i; }
        });
        // No fim do trilho, o último item pode não encostar na borda: conta como o último.
        if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 4) melhor = filhos.length - 1;
        setAtual(melhor + 1);
      });
    };
    const evento = "onscrollend" in window ? "scrollend" : "scroll";
    el.addEventListener(evento, mede, { passive: true });
    return () => { el.removeEventListener(evento, mede); cancelAnimationFrame(quadro); };
  }, []);
  return (
    <>
      <Tag ref={ref as never} className={className} aria-label={ariaLabel}>{children}</Tag>
      {total > 1 && <p className={`indicador ${indicadorClasse}`.trim()} aria-live="polite">{atual} de {total} · {rotulo}</p>}
    </>
  );
}
