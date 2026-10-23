"use client";

import { useEffect, useState } from "react";
import Comprar from "@/components/comprar";
import type { Produto } from "@/lib/produtos";
import { reais } from "@/lib/produtos";

/** Barra fixa de compra no celular: aparece depois que o visitante passa do topo e leva direto ao checkout (ou à escolha do plano, se houver mais de um). */
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
      <div><small>{produto.nome}{produto.ofertas && " · a partir de"}</small><b>{reais(produto.preco)}</b></div>
      {produto.ofertas ? (
        // Com mais de um plano, a barra leva à escolha do plano em vez de ir direto a um checkout.
        <a className="btn" href="#oferta" tabIndex={visivel ? 0 : -1}>Ver os planos</a>
      ) : (
        <Comprar produto={produto} texto="Comprar agora" />
      )}
    </div>
  );
}
