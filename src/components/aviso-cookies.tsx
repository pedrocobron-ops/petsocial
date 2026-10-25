"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const CHAVE = "mp-cookies-ok";

/** Aviso informativo de cookies (LGPD). Não bloqueia o Pixel: só informa e aponta a política. */
export default function AvisoCookies() {
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    try { if (!localStorage.getItem(CHAVE)) setAberto(true); } catch { /* navegação privada: não mostra */ }
  }, []);
  if (!aberto) return null;
  const fechar = () => {
    try { localStorage.setItem(CHAVE, "1"); } catch { /* ignora */ }
    setAberto(false);
  };
  return (
    <div className="aviso-cookies" role="region" aria-label="Aviso de cookies">
      <p>
        Usamos cookies para o site funcionar e para medir visitas e anúncios. Você pode bloqueá-los no navegador quando quiser.{" "}
        <Link href="/politica-de-privacidade">Saiba mais</Link>
      </p>
      <button type="button" className="btn btn-primary" onClick={fechar}>Entendi</button>
    </div>
  );
}
