"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

const CHAVE = "mp-cookies-ok";
const ALVOS = "a[href], button, input, select, textarea, summary";

/** Algum link, botão ou campo da página está embaixo da pílula? */
function cobreAlgo(pilula: HTMLElement) {
  const r = pilula.getBoundingClientRect();
  if (!r.height) return false;
  return Array.from(document.querySelectorAll<HTMLElement>(ALVOS)).some((el) => {
    if (pilula.contains(el) || el.closest(".barra, dialog")) return false;
    const e = el.getBoundingClientRect();
    if (!e.width || !e.height) return false;
    return e.bottom > r.top - 4 && e.top < r.bottom + 4 && e.right > r.left && e.left < r.right;
  });
}

/**
 * Aviso informativo de cookies (LGPD), em uma linha (brief 20, 6.20). Não bloqueia o Pixel.
 * Fica abaixo da barra de compra, some sozinho depois de 160 px de rolagem e some de vez no "Entendi".
 * Nunca cobre o que a pessoa quer tocar: sai do caminho enquanto houver link, botão ou campo embaixo dela
 * (ex.: a linha "Política de privacidade" do formulário da dobra) e some de vez quando um formulário recebe foco.
 */
export default function AvisoCookies() {
  const [aberto, setAberto] = useState(false);
  const [fora, setFora] = useState(false);
  const [desvia, setDesvia] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try { if (!localStorage.getItem(CHAVE)) setAberto(true); } catch { /* navegação privada: não mostra */ }
  }, []);
  useEffect(() => {
    if (!aberto || fora) return;
    let quadro = 0;
    let visivelDesde: number | null = null;
    const confere = () => {
      cancelAnimationFrame(quadro);
      quadro = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const cobre = cobreAlgo(el);
        setDesvia(cobre);
        // Some de vez depois de 160 px rolados com a pílula à vista.
        if (!cobre && visivelDesde === null) visivelDesde = window.scrollY;
        if (visivelDesde !== null && Math.abs(window.scrollY - visivelDesde) > 160) setFora(true);
      });
    };
    const aoFocar = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.matches("input, select, textarea") && !ref.current?.contains(t)) setFora(true);
    };
    confere();
    window.addEventListener("scroll", confere, { passive: true });
    window.addEventListener("resize", confere);
    document.addEventListener("focusin", aoFocar);
    return () => {
      cancelAnimationFrame(quadro);
      window.removeEventListener("scroll", confere);
      window.removeEventListener("resize", confere);
      document.removeEventListener("focusin", aoFocar);
    };
  }, [aberto, fora]);
  if (!aberto) return null;
  const fechar = () => {
    try { localStorage.setItem(CHAVE, "1"); } catch { /* ignora */ }
    setFora(true);
  };
  const escondida = fora || desvia;
  return (
    <div ref={ref} className={`cookies${fora ? " fora" : ""}${desvia && !fora ? " desvia" : ""}`} role="region" aria-label="Aviso de cookies" aria-hidden={escondida || undefined}>
      <Link href="/politica-de-privacidade" tabIndex={escondida ? -1 : undefined}>Usamos cookies de medição</Link>
      <button type="button" onClick={fechar} tabIndex={escondida ? -1 : undefined}>Entendi</button>
    </div>
  );
}
