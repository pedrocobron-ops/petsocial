"use client";

import { useEffect, useState } from "react";
import Comprar from "@/components/comprar";
import type { Produto } from "@/lib/produtos";
import { reais } from "@/lib/produtos";

/** Alvos que, na tela, escondem a barra: nunca dois botões de compra na mesma tela. */
const ALVOS = ["#cta-dobra", "#oferta", "#cta-final"];

/**
 * Barra fixa de compra no celular (brief 20, 6.19). Aparece quando o botão da dobra sai da tela
 * e some enquanto a oferta ou o CTA final estão na tela.
 */
export default function BarraCompra({ produto, item = "o guia" }: { produto: Produto; item?: string }) {
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const naTela = new Set<Element>();
    const alvos = ALVOS.map((s) => document.querySelector(s)).filter((x): x is Element => Boolean(x));
    const atualiza = () => setVisivel(naTela.size === 0 && window.scrollY > 200);
    const io = new IntersectionObserver((es) => {
      for (const e of es) (e.isIntersecting ? naTela.add(e.target) : naTela.delete(e.target));
      atualiza();
    });
    alvos.forEach((a) => io.observe(a));
    window.addEventListener("scroll", atualiza, { passive: true });
    return () => { io.disconnect(); window.removeEventListener("scroll", atualiza); };
  }, []);
  const breve = !produto.lancado;
  return (
    <div className={`barra${visivel ? " on" : ""}`} role="region" aria-label="Comprar" aria-hidden={!visivel} inert={!visivel || undefined}>
      <div>
        <small>{breve ? "Em breve" : "Pagamento único"} · {produto.nome}</small>
        {!breve && <strong>{produto.ofertas && "a partir de "}{reais(produto.preco)}</strong>}
      </div>
      {breve ? (
        <a className="btn btn-secundario btn-claro btn-pq" href="#avise" tabIndex={visivel ? 0 : -1}>Avise-me</a>
      ) : produto.ofertas ? (
        <a className="btn btn-pq" href="#oferta" tabIndex={visivel ? 0 : -1}>Ver os planos</a>
      ) : (
        <Comprar produto={produto} texto={`Quero ${item}`} origem="barra" className="btn-pq" />
      )}
    </div>
  );
}
