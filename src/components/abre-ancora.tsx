"use client";

import { useEffect } from "react";

/** Abre o <details> cujo id está no endereço (ex. /contato#reembolso), na carga e quando a âncora muda. */
export default function AbreAncora() {
  useEffect(() => {
    const abre = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement) { el.open = true; el.scrollIntoView({ block: "start" }); }
    };
    abre();
    window.addEventListener("hashchange", abre);
    return () => window.removeEventListener("hashchange", abre);
  }, []);
  return null;
}
