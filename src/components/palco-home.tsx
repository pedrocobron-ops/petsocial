"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type Cena = { foto: string; alt: string; rotulo: string; nome: string; href: string };

const TEMPO = 4500;

/** Fotos que vão passando no começo da página inicial: troca sozinho, por setas, barrinhas ou arrastando o dedo. Tem botão de pausa. */
export default function PalcoHome({ cenas }: { cenas: Cena[] }) {
  const [i, setI] = useState(0);
  const [pausado, setPausado] = useState(false);
  // só baixa a foto atual e a próxima; as que já apareceram continuam na página para a troca ser suave
  const [vistas, setVistas] = useState<number[]>([0, 1]);
  const toque = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    setVistas((v) => { const n = [i, (i + 1) % cenas.length].filter((x) => !v.includes(x)); return n.length ? [...v, ...n] : v; });
  }, [i, cenas.length]);

  useEffect(() => {
    if (pausado || cenas.length < 2) return;
    const t = setTimeout(() => setI((n) => (n + 1) % cenas.length), TEMPO);
    return () => clearTimeout(t);
  }, [i, pausado, cenas.length]);

  const ir = (d: number) => setI((n) => (n + d + cenas.length) % cenas.length);
  const atual = cenas[i];
  return (
    <section className="pc" aria-roledescription="carrossel" aria-label="Guias e manuais em destaque"
      onTouchStart={(e) => { toque.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => {
        const t = toque.current; toque.current = null;
        if (!t) return;
        const dx = e.changedTouches[0].clientX - t.x, dy = e.changedTouches[0].clientY - t.y;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) ir(dx < 0 ? 1 : -1);
      }}>
      <div className="pc-fotos">
        {cenas.map((c, n) => vistas.includes(n) && (
          <Image key={c.foto} className={n === i ? "on" : ""} src={c.foto} alt={n === i ? c.alt : ""} width={960} height={1200}
            sizes="(max-width: 899px) 100vw, 560px" priority={n === 0} />
        ))}
      </div>
      <div className="pc-controles">
        <button type="button" className="pc-seta" aria-label={pausado ? "Continuar a troca de fotos" : "Pausar a troca de fotos"} onClick={() => setPausado((p) => !p)}>
          {pausado
            ? <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
            : <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>}
        </button>
        <button type="button" className="pc-seta" aria-label="Foto anterior" onClick={() => ir(-1)}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 6l-6 6 6 6" /></svg>
        </button>
        <button type="button" className="pc-seta" aria-label="Próxima foto" onClick={() => ir(1)}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
        </button>
      </div>
      <Link className="pc-legenda" href={atual.href} key={atual.href}>
        <span><small>{atual.rotulo}</small><b>{atual.nome}</b></span>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </Link>
      <div className="pc-pontos">
        {cenas.map((c, n) => (
          <button key={c.foto} type="button" aria-current={n === i ? "true" : undefined} aria-label={`Mostrar ${c.nome}`} className={n === i ? "on" : ""} onClick={() => setI(n)}>
            <i style={n === i && !pausado ? { animationDuration: `${TEMPO}ms` } : undefined} />
          </button>
        ))}
      </div>
    </section>
  );
}
