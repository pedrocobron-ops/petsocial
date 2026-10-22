"use client";

import { useEffect, useState } from "react";
import Comprar from "@/components/comprar";
import type { Produto } from "@/lib/produtos";
import { reais } from "@/lib/produtos";

/** Barra fixa de compra no celular: aparece depois que o visitante passa do topo e leva direto ao checkout. */
export default function BarraCompra({ produto }: { produto: Produto }) {
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisivel(window.scrollY > 700);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div className={`barra-compra${visivel ? " on" : ""}`} role="region" aria-label="Comprar" aria-hidden={!visivel}>
      <div><small>{produto.nome}</small><b>{reais(produto.preco)}</b></div>
      <Comprar produto={produto} texto="Comprar agora" />
    </div>
  );
}
