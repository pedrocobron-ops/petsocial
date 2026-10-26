"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const CHAVE = "mp-cookies-ok";

/**
 * Aviso informativo de cookies (LGPD), em uma linha (brief 20, 6.20). Não bloqueia o Pixel.
 * Fica abaixo da barra de compra, some sozinho depois de 160 px de rolagem e some de vez no "Entendi".
 */
export default function AvisoCookies() {
  const [aberto, setAberto] = useState(false);
  const [fora, setFora] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem(CHAVE)) setAberto(true); } catch { /* navegação privada: não mostra */ }
  }, []);
  useEffect(() => {
    if (!aberto) return;
    const aoRolar = () => { if (window.scrollY > 160) { setFora(true); window.removeEventListener("scroll", aoRolar); } };
    aoRolar();
    window.addEventListener("scroll", aoRolar, { passive: true });
    return () => window.removeEventListener("scroll", aoRolar);
  }, [aberto]);
  if (!aberto) return null;
  const fechar = () => {
    try { localStorage.setItem(CHAVE, "1"); } catch { /* ignora */ }
    setFora(true);
  };
  return (
    <div className={`cookies${fora ? " fora" : ""}`} role="region" aria-label="Aviso de cookies" aria-hidden={fora || undefined}>
      <Link href="/politica-de-privacidade" tabIndex={fora ? -1 : undefined}>Usamos cookies de medição</Link>
      <button type="button" onClick={fechar} tabIndex={fora ? -1 : undefined}>Entendi</button>
    </div>
  );
}
