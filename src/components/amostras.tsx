"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/** Páginas de amostra: toque para abrir em tela cheia; na tela cheia, toque de novo para ampliar. */
export default function Amostras({ paginas }: { paginas: [string, string][] }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [aberta, setAberta] = useState<number | null>(null);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (aberta !== null && !d.open) d.showModal();
    if (aberta === null && d.open) d.close();
  }, [aberta]);

  const ir = (passo: number) => { setZoom(false); setAberta((i) => (i === null ? i : (i + passo + paginas.length) % paginas.length)); };
  const atual = aberta !== null ? paginas[aberta] : null;

  return (
    <>
      <div className="paginas">
        {paginas.map(([src, alt], i) => (
          <button key={src} type="button" className="amostra" onClick={() => { setZoom(false); setAberta(i); }} aria-label={`Ampliar: ${alt}`}>
            <Image src={src} alt={alt} width={300} height={424} />
            <span className="amostra-lupa" aria-hidden>Ampliar</span>
          </button>
        ))}
      </div>
      <p className="amostra-dica">Toque numa página para ver em tamanho real.</p>
      <dialog
        ref={ref}
        className="lightbox"
        aria-label="Página de amostra"
        onClose={() => setAberta(null)}
        onClick={(e) => { if (e.target === ref.current) setAberta(null); }}
        onKeyDown={(e) => { if (e.key === "ArrowRight") ir(1); if (e.key === "ArrowLeft") ir(-1); }}
      >
        {atual && (
          <>
            <div className={`lightbox-img${zoom ? " zoom" : ""}`} onClick={() => setZoom((z) => !z)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={atual[0]} alt={atual[1]} />
            </div>
            <p className="lightbox-legenda">{atual[1]} · {aberta! + 1} de {paginas.length}{zoom ? "" : " · toque para ampliar"}</p>
            <button type="button" className="lightbox-fechar" onClick={() => setAberta(null)} aria-label="Fechar">×</button>
            {paginas.length > 1 && (
              <>
                <button type="button" className="lightbox-nav ant" onClick={() => ir(-1)} aria-label="Página anterior">‹</button>
                <button type="button" className="lightbox-nav prox" onClick={() => ir(1)} aria-label="Próxima página">›</button>
              </>
            )}
          </>
        )}
      </dialog>
    </>
  );
}
