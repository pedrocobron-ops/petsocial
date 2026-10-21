"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/** Id do conjunto de dados "Maestro Pet – Site" (é público, aparece no HTML de qualquer forma). */
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "1608283994381479";

type Fbq = (...args: unknown[]) => void;
declare global {
  interface Window { fbq?: Fbq }
}

/** Dispara um evento do Pixel, se ele já tiver carregado. */
export function rastrear(evento: string, dados?: Record<string, unknown>) {
  window.fbq?.("track", evento, dados);
}

/** Meta Pixel: PageView na carga e a cada troca de página feita pelo Next. */
export default function MetaPixel() {
  const pathname = usePathname();
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    rastrear("PageView");
  }, [pathname]);
  if (!PIXEL_ID) return null;
  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init',${JSON.stringify(PIXEL_ID)});fbq('track','PageView');`}
    </Script>
  );
}

/** ViewContent da página de vendas de um guia. */
export function VerProduto({ nome, preco }: { nome: string; preco: number }) {
  useEffect(() => {
    const t = setTimeout(() => rastrear("ViewContent", { content_name: nome, value: preco, currency: "BRL" }), 500);
    return () => clearTimeout(t);
  }, [nome, preco]);
  return null;
}
