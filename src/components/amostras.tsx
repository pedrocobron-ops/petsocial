"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import Trilho from "@/components/trilho";

/** "p. 14" a partir do nome do arquivo (`xixi-pag14.webp`); sem número, não mostra. */
export const paginaDoArquivo = (src: string) => {
  const m = src.match(/pag0*(\d+)/);
  return m ? Number(m[1]) : undefined;
};

/**
 * Páginas de amostra (brief 20, 6.12). Toque ou clique abre a página em tela cheia (<dialog>), com "2 de 6", setas e zoom.
 * Cada página é [src 744 px, legenda, src 1500 px?]: o trilho usa a de 744 (next/image) e a tela cheia, a de 1500,
 * para o texto miúdo do PDF ficar nítido no zoom.
 * `trilho`: o "Por dentro" da página de venda — trilho com scroll-snap no celular e grade no desktop, legenda "p. N".
 * Sem `trilho`: a grade simples de 2 colunas (páginas ainda não migradas, ex. /fogos).
 */
export default function Amostras({ paginas, trilho = false }: { paginas: [string, string, string?][]; trilho?: boolean }) {
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
  const pag = atual ? paginaDoArquivo(atual[0]) : undefined;

  const dialogo = (
    <dialog
      ref={ref}
      className={`lightbox${zoom ? " lightbox-zoom" : ""}`}
      aria-label="Página de amostra"
      onClose={() => setAberta(null)}
      onClick={(e) => { if (e.target === ref.current) setAberta(null); }}
      onKeyDown={(e) => { if (e.key === "ArrowRight") ir(1); if (e.key === "ArrowLeft") ir(-1); }}
    >
      {atual && (
        <>
          <button type="button" className="lightbox-fechar" onClick={() => setAberta(null)} aria-label="Fechar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
          <div className={`lightbox-img${zoom ? " zoom" : ""}`} onClick={() => setZoom((z) => !z)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={atual[2] ?? atual[0]} alt={atual[1]} width={1500} height={2123} />
          </div>
          <div className="lightbox-barra">
            {paginas.length > 1 && (
              <button type="button" className="lightbox-nav" onClick={() => ir(-1)} aria-label="Página anterior">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 6l-6 6 6 6" /></svg>
              </button>
            )}
            <p className="lightbox-legenda" aria-live="polite">
              <b>{aberta! + 1} de {paginas.length}</b>
              <span>{pag ? `p. ${pag} · ` : ""}{atual[1]}</span>
              <small>{zoom ? "Toque de novo para voltar" : <><span className="dica-toque">Toque na página para ampliar</span><span className="dica-mouse">Clique na página para ampliar</span></>}</small>
            </p>
            {paginas.length > 1 && (
              <button type="button" className="lightbox-nav" onClick={() => ir(1)} aria-label="Próxima página">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 6l6 6-6 6" /></svg>
              </button>
            )}
          </div>
        </>
      )}
    </dialog>
  );

  if (trilho) {
    return (
      <>
        <Trilho total={paginas.length} className={`dentro dentro-${Math.min(paginas.length, 6)}`} indicadorClasse="so-celular">
          {paginas.map(([src, legenda], i) => {
            const n = paginaDoArquivo(src);
            const destaque = i === 0 && paginas.length >= 5;
            return (
              <figure key={src} className="dentro-pag">
                <button type="button" className="moldura dentro-moldura" onClick={() => { setZoom(false); setAberta(i); }} aria-label={`Ver em tela cheia: ${n ? `página ${n}, ` : ""}${legenda}`}>
                  <Image src={src} alt={legenda} width={744} height={1053} sizes={destaque ? "(max-width: 899px) 86vw, 760px" : "(max-width: 899px) 86vw, 380px"} />
                </button>
                <figcaption>{n && <b>p. {n}</b>}<span>{legenda}</span></figcaption>
              </figure>
            );
          })}
        </Trilho>
        {dialogo}
      </>
    );
  }

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
      <p className="amostra-dica">Abra uma página para ver em tamanho real.</p>
      {dialogo}
    </>
  );
}
