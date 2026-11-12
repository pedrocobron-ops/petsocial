"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

export type Cena = { foto: string; alt: string; rotulo: string; nome: string; href: string };

const TEMPO = 4500;

/** Fotos que vão passando no começo da página inicial, com setas e barrinhas para trocar. */
export default function PalcoHome({ cenas }: { cenas: Cena[] }) {
  const [i, setI] = useState(0);

  // Troca sozinho sempre: sem pausa no toque (no celular o "mouse em cima" ficava preso) e mesmo com "reduzir movimento"
  // (aí a troca é seca, sem zoom nem transição, pelo CSS).
  useEffect(() => {
    if (cenas.length < 2) return;
    const t = setTimeout(() => setI((n) => (n + 1) % cenas.length), TEMPO);
    return () => clearTimeout(t);
  }, [i, cenas.length]);
  const ir = (d: number) => setI((n) => (n + d + cenas.length) % cenas.length);

  const atual = cenas[i];
  return (
    <div className="pc">
      <div className="pc-fotos">
        {cenas.map((c, n) => (
          <Image key={c.foto} className={n === i ? "on" : ""} src={c.foto} alt={n === i ? c.alt : ""} width={960} height={1200}
            sizes="(max-width: 899px) 100vw, 520px" priority={n === 0} loading={n === 0 ? undefined : "lazy"} />
        ))}
      </div>
      <button type="button" className="pc-seta pc-seta-e" aria-label="Foto anterior" onClick={() => ir(-1)}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <button type="button" className="pc-seta pc-seta-d" aria-label="Próxima foto" onClick={() => ir(1)}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
      </button>
      <Link className="pc-legenda" href={atual.href} key={atual.href}>
        <span><small>{atual.rotulo}</small><b>{atual.nome}</b></span>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </Link>
      <div className="pc-pontos" role="tablist" aria-label="Fotos">
        {cenas.map((c, n) => (
          <button key={c.foto} type="button" role="tab" aria-selected={n === i} aria-label={c.nome} className={n === i ? "on" : ""} onClick={() => setI(n)}>
            <i style={n === i ? { animationDuration: `${TEMPO}ms` } : undefined} />
          </button>
        ))}
      </div>
    </div>
  );
}
