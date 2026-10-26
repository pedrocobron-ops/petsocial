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

/** Dispara um evento do Pixel. Se o script ainda não carregou, tenta de novo por até 10 s. */
export function rastrear(evento: string, dados?: Record<string, unknown>, tentativa = 0) {
  if (window.fbq) window.fbq("track", evento, dados);
  else if (tentativa < 20) setTimeout(() => rastrear(evento, dados, tentativa + 1), 500);
}

/** Evento próprio do Pixel (trackCustom), que não entra na otimização de Lead dos anúncios. */
export function rastrearProprio(evento: string, dados?: Record<string, unknown>, tentativa = 0) {
  if (window.fbq) window.fbq("trackCustom", evento, dados);
  else if (tentativa < 20) setTimeout(() => rastrearProprio(evento, dados, tentativa + 1), 500);
}

/**
 * Meta Pixel: PageView na carga e a cada troca de página feita pelo Next.
 * A fila do fbq é criada logo; o fbevents.js (≈ 200 KB) só baixa em `lazyOnload`, sem disputar banda com a capa (LCP),
 * e processa a fila quando chega. Nenhum evento se perde.
 */
export default function MetaPixel() {
  const pathname = usePathname();
  const primeira = useRef(true);
  useEffect(() => {
    if (primeira.current) { primeira.current = false; return; }
    rastrear("PageView");
  }, [pathname]);
  if (!PIXEL_ID) return null;
  return (
    <>
      {/* A fila do fbq nasce já (poucos bytes): init, PageView e qualquer evento entram nela na hora. */}
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f){if(f.fbq)return;var n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[]}(window);fbq.disablePushState=true;fbq('init',${JSON.stringify(PIXEL_ID)});fbq('track','PageView');`}
      </Script>
      {/* O fbevents.js (≈ 200 KB) só baixa depois da carga e processa a fila; não disputa banda com a capa (LCP). */}
      <Script id="meta-pixel-js" src="https://connect.facebook.net/en_US/fbevents.js" strategy="lazyOnload" />
    </>
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
