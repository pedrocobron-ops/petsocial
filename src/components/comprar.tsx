"use client";

import { rastrear } from "@/components/meta-pixel";
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

/** Botão de compra: leva ao checkout da Cakto, ou mostra "Em breve" se ainda não houver link. */
export default function Comprar({ produto, texto = "Quero o guia agora", grande = false, className = "" }: { produto: Produto; texto?: string; grande?: boolean; className?: string }) {
  const cls = `btn${grande ? " btn-lg" : ""}${className ? ` ${className}` : ""}`;
  if (!produto.checkout) {
    return <span className={`${cls} btn-off`} aria-disabled="true">Em breve</span>;
  }
  return (
    <a
      className={cls}
      href={produto.checkout}
      rel="nofollow"
      onClick={(e) => {
        e.currentTarget.href = linkCheckout(produto.checkout);
        // O InitiateCheckout sai do checkout da Cakto; aqui o clique conta como AddToCart, para não duplicar.
        rastrear("AddToCart", { content_name: produto.nome, content_ids: [produto.checkout.split("/").pop()], content_type: "product", value: produto.preco, currency: "BRL" });
      }}
    >
      {texto}
    </a>
  );
}
