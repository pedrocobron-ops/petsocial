"use client";

import { rastrear } from "@/components/meta-pixel";
import type { Produto } from "@/lib/produtos";

/** Botão de compra: leva ao checkout da Cakto, ou mostra "Em breve" se ainda não houver link. */
export default function Comprar({ produto, texto = "Quero o guia agora", grande = false }: { produto: Produto; texto?: string; grande?: boolean }) {
  const cls = `btn${grande ? " btn-lg" : ""}`;
  if (!produto.checkout) {
    return <span className={`${cls} btn-off`} aria-disabled="true">Em breve</span>;
  }
  return (
    <a
      className={cls}
      href={produto.checkout}
      rel="nofollow"
      // O InitiateCheckout sai do checkout da Cakto; aqui o clique conta como AddToCart, para não duplicar.
      onClick={() => rastrear("AddToCart", { content_name: produto.nome, value: produto.preco, currency: "BRL" })}
    >
      {texto}
    </a>
  );
}
