import { NextResponse, type NextRequest } from "next/server";
import { novoNonce, politicaDoApp } from "@/lib/gestao/csp";

/**
 * Regra de conteúdo que VALE no aplicativo e no painel do administrador (ver src/lib/gestao/csp.ts): um nonce novo por
 * página, repassado ao Next pelo cabeçalho do pedido (o Next põe o nonce nos scripts dele) e por x-nonce (os layouts leem
 * para os scripts em linha da abertura). As outras páginas não passam por aqui.
 */
export function middleware(req: NextRequest) {
  const nonce = novoNonce();
  const csp = politicaDoApp({ nonce, supabase: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", dev: process.env.NODE_ENV !== "production" });
  const cab = new Headers(req.headers);
  cab.set("x-nonce", nonce);
  cab.set("Content-Security-Policy", csp);
  const res = NextResponse.next({ request: { headers: cab } });
  res.headers.set("Content-Security-Policy", csp);
  return res;
}

export const config = {
  matcher: [
    // as páginas (não os pedidos de pré-carregamento do Next, que não têm script para assinar)
    { source: "/gestao/app/:path*", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] },
    { source: "/gestao/admin/:path*", missing: [{ type: "header", key: "next-router-prefetch" }, { type: "header", key: "purpose", value: "prefetch" }] },
  ],
};
