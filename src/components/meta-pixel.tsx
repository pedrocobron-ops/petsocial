"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Id do conjunto de dados "Maestro Pet – Site" (é público, aparece no HTML de qualquer forma). */
const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "1608283994381479";

type Fbq = (...args: unknown[]) => void;
declare global {
  interface Window { fbq?: Fbq }
}

/** Escolha do aviso de cookies, guardada só neste navegador. "recusado": o Pixel não manda nada daqui. */
export const CHAVE_COOKIES = "mp-cookies";
/** Aviso antigo, só com "Entendi" (antes de 18/11/2026): conta como aceito, e a escolha pode ser mudada na política do site. */
const CHAVE_ANTIGA = "mp-cookies-ok";
export const EVENTO_COOKIES = "mp-cookies-escolha";
export type EscolhaCookies = "aceito" | "recusado" | null;

export function lerEscolhaCookies(): EscolhaCookies {
  try {
    const v = localStorage.getItem(CHAVE_COOKIES);
    if (v === "aceito" || v === "recusado") return v;
    return localStorage.getItem(CHAVE_ANTIGA) ? "aceito" : null;
  } catch { return null; }
}

/** Aceitar ou recusar os cookies de medição. Recusar: o Pixel para de mandar (consent revoke) e o cookie _fbp é apagado. */
export function escolherCookies(v: "aceito" | "recusado") {
  try { localStorage.setItem(CHAVE_COOKIES, v); } catch { /* navegação privada: vale só nesta página */ }
  if (window.fbq) window.fbq("consent", v === "aceito" && pixelNaRota(window.location.pathname) ? "grant" : "revoke");
  if (v === "recusado") {
    const host = window.location.hostname;
    for (const d of ["", host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`]) {
      for (const nome of ["_fbp", "_fbc"]) document.cookie = `${nome}=; Max-Age=0; path=/${d ? `; domain=${d}` : ""}`;
    }
  }
  window.dispatchEvent(new CustomEvent(EVENTO_COOKIES, { detail: v }));
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
 * consentimento é retirado (`consent revoke`): o fbevents que ficou na memória não manda mais nada. O mesmo quando a pessoa
 * toca em "Recusar" no aviso de cookies (ou na política do site): a escolha fica no navegador e vale nas próximas visitas.
 * A fila do fbq é criada logo; o fbevents.js (≈ 200 KB) só baixa em `lazyOnload`, sem disputar banda com a capa (LCP),
 * e processa a fila quando chega. Nenhum evento se perde.
 */
export default function MetaPixel() {
  const pathname = usePathname();
  const primeira = useRef(true);
  // null = ainda não leu a escolha (o fbevents.js só entra depois de saber que não foi recusado)
  const [recusou, setRecusou] = useState<boolean | null>(null);
  const aqui = pixelNaRota(pathname);
  useEffect(() => {
    setRecusou(lerEscolhaCookies() === "recusado");
    const mudou = (e: Event) => setRecusou((e as CustomEvent<string>).detail === "recusado");
    window.addEventListener(EVENTO_COOKIES, mudou);
    return () => window.removeEventListener(EVENTO_COOKIES, mudou);
  }, []);
  useEffect(() => {
    // rota privada ou cookies recusados: o fbq (se a página veio da capa) para de mandar qualquer coisa; de volta numa página pública, volta
    const pode = aqui && lerEscolhaCookies() !== "recusado";
    if (window.fbq) window.fbq("consent", pode ? "grant" : "revoke");
    if (primeira.current) { primeira.current = false; return; }
    if (!pode) return;
    rastrear("PageView");
  }, [pathname, aqui]);
  // dentro do aplicativo de gestão não há rastreamento de anúncio: são dados de trabalho do pet shop
  if (!PIXEL_ID || !aqui) return null;
  return (
    <>
      {/* A fila do fbq nasce já (poucos bytes): init, PageView e qualquer evento entram nela na hora. */}
      <Script id="meta-pixel" strategy="afterInteractive">
        {`!function(f){if(f.fbq)return;var n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[]}(window);try{if(localStorage.getItem(${JSON.stringify(CHAVE_COOKIES)})==='recusado')fbq('consent','revoke')}catch(e){}fbq.disablePushState=true;fbq('set','autoConfig',false,${JSON.stringify(PIXEL_ID)});fbq('init',${JSON.stringify(PIXEL_ID)});fbq('track','PageView');`}
      </Script>
      {/* O fbevents.js (≈ 200 KB) só baixa depois da carga e processa a fila; não disputa banda com a capa (LCP). Recusado: nem baixa. */}
      {recusou === false && <Script id="meta-pixel-js" src="https://connect.facebook.net/en_US/fbevents.js" strategy="lazyOnload" />}
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
