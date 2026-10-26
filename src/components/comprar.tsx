"use client";

import { useEffect, useState } from "react";
import { rastrear } from "@/components/meta-pixel";
import { Seta } from "@/components/icones";
import type { Produto } from "@/lib/produtos";

/** Parâmetros da visita (anúncio, UTMs) que seguem para o checkout, para a compra ficar ligada à origem. */
const REPASSAR = /^(utm_\w+|fbclid|src|sck)$/;

function linkCheckout(base: string) {
  const destino = new URL(base);
  new URLSearchParams(window.location.search).forEach((valor, chave) => {
    if (REPASSAR.test(chave) && !destino.searchParams.has(chave)) destino.searchParams.set(chave, valor);
  });
  return destino.toString();
}

/**
 * Botão de compra: leva ao checkout da Cakto, ou mostra "Em breve" se ainda não houver link ou se o produto não foi lançado.
 * Ao tocar, vira "Abrindo o checkout seguro…" por 4 s (evita clique duplo) — brief 20, 6.4.
 * `origem` (dobra, oferta, barra, cta-final) vai no AddToCart para saber qual botão converte.
 */
export default function Comprar({ produto, texto = "Quero o guia agora", grande = false, className = "", origem, id }: { produto: Produto; texto?: string; grande?: boolean; className?: string; origem?: string; id?: string }) {
  const [indo, setIndo] = useState(false);
  useEffect(() => {
    if (!indo) return;
    const t = setTimeout(() => setIndo(false), 4000);
    // Volta pelo botão "voltar" do navegador (cache de página): o botão volta ao normal.
    const volta = () => setIndo(false);
    window.addEventListener("pageshow", volta);
    return () => { clearTimeout(t); window.removeEventListener("pageshow", volta); };
  }, [indo]);
  const cls = `btn${grande ? " btn-lg" : ""}${className ? ` ${className}` : ""}`;
  if (!produto.checkout || !produto.lancado) {
    return <span id={id} className={`${cls} btn-off`} aria-disabled="true">Em breve</span>;
  }
  return (
    <a
      id={id}
      className={`${cls}${indo ? " indo" : ""}`}
      href={produto.checkout}
      rel="nofollow"
      aria-busy={indo || undefined}
      aria-disabled={indo || undefined}
      onClick={(e) => {
        if (indo) { e.preventDefault(); return; }
        e.currentTarget.href = linkCheckout(produto.checkout);
        setIndo(true);
        // O InitiateCheckout sai do checkout da Cakto; aqui o clique conta como AddToCart, para não duplicar.
        rastrear("AddToCart", {
          content_name: origem ?? produto.nome,
          ...(origem ? { content_category: produto.nome } : {}),
          content_ids: [produto.checkout.split("/").pop()], content_type: "product", value: produto.preco, currency: "BRL",
        });
      }}
    >
      {indo ? <><span className="spinner" aria-hidden />Abrindo o checkout seguro…</> : <>{texto}<Seta /></>}
    </a>
  );
}
