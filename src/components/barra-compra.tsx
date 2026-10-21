"use client";

import { useEffect, useState } from "react";

/** Barra fixa de compra no celular: aparece depois que o visitante passa do topo da página. */
export default function BarraCompra({ nome, preco }: { nome: string; preco: string }) {
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisivel(window.scrollY > 700);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className={`barra-compra${visivel ? " on" : ""}`} role="region" aria-label="Comprar" aria-hidden={!visivel}>
      <div><small>{nome}</small><b>{preco}</b></div>
      <a className="btn" href="#oferta" tabIndex={visivel ? 0 : -1}>Quero o guia</a>
    </div>
  );
}
