"use client";

import { useRef } from "react";

/**
 * Lista completa (brief 20, 6.13), ex. "Ver as 100 atividades". O conteúdo rola dentro de uma caixa de 70 % da tela,
 * para o summary não sumir para cima, e termina com "Fechar a lista", que fecha e volta ao summary.
 * Sem JavaScript o <details> continua abrindo e fechando pelo summary.
 */
export default function ListaCompleta({ resumo, children }: { resumo: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const fechar = () => {
    const d = ref.current;
    if (!d) return;
    d.open = false;
    const s = d.querySelector("summary");
    s?.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    s?.focus({ preventScroll: true });
  };
  return (
    <details className="todas-det" id="todas" ref={ref}>
      <summary>{resumo}</summary>
      <div className="todas-caixa" tabIndex={0} aria-label={resumo}>{children}</div>
      <button type="button" className="btn btn-secundario btn-pq todas-fechar" onClick={fechar}>Fechar a lista</button>
    </details>
  );
}
