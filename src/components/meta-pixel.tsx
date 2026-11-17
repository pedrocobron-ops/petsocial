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
 * Onde o Pixel pode estar: só nas páginas públicas de venda. Tudo em /gestao/... fica de fora (aplicativo, criar conta,
 * entrar, senha, links de tutor, termos): são dados de trabalho do pet shop ou formulários com e-mail.
 * A capa /gestao (sem barra no fim) é pública e tem o Pixel.
 */
export function pixelNaRota(pathname: string | null | undefined): boolean {
  const p = pathname ?? "";
  return !(p.startsWith("/gestao/") || p.startsWith("/api/"));
}

/**
 * Meta Pixel: PageView na carga e a cada troca de página feita pelo Next.
 * `autoConfig` desligado antes do `init`: o fbevents.js não lê botões nem campos da página sozinho (nada de "advanced matching"
 * automático com o e-mail de um formulário). Se a pessoa sair da capa para uma rota privada sem recarregar a página, o
 * consentimento é retirado (`consent revoke`): o fbevents que ficou na memória não manda mais nada.
 * A fila do fbq é criada logo; o fbevents.js (≈ 200 KB) só baixa em `lazyOnload`, sem disputar banda com a capa (LCP),
 * e processa a fila quando chega. Nenhum evento se perde.
 */
export default function MetaPixel() {
  const pathname = usePathname();
  const primeira = useRef(true);
  const aqui = pixelNaRota(pathname);
  useEffect(() => {
    // rota privada: o fbq (se a página veio da capa) para de mandar qualquer coisa; de volta numa página pública, volta
    if (window.fbq) window.fbq("consent", aqui ? "grant" : "revoke");
    if (primeira.current) { primeira.current = false; return; }
    if (!aqui) return;
    rastrear("PageView");
  }, [pathname, aqui]);
  // dentro do aplicativo de gestão não há rastreamento de anúncio: são dados de trabalho do pet shop
  if (!PIXEL_ID || !aqui) return null;
  return (
    <>
      {/* A fila do fbq nasce já (poucos bytes): init, PageView e qualquer evento entram nela na hora. */}
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f){if(f.fbq)return;var n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[]}(window);fbq.disablePushState=true;fbq('set','autoConfig',false,${JSON.stringify(PIXEL_ID)});fbq('init',${JSON.stringify(PIXEL_ID)});fbq('track','PageView');`}
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
