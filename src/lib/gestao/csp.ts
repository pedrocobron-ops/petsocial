/**
 * A regra de conteúdo (Content-Security-Policy) que VALE no aplicativo (/gestao/app) e no painel do administrador
 * (/gestao/admin), mandada pelo middleware com um nonce novo a cada página. Script só deste site e só com o nonce da página
 * ('strict-dynamic': os pedaços que o Next carrega depois herdam a confiança), nada de script em linha sem nonce, nada de
 * pixel de anúncio nem script da Cakto. As páginas públicas (site, venda, links do tutor) continuam com a regra "só
 * avisando" do next.config.ts, que deixa o pixel da Meta e a Cakto.
 *
 * O que o aplicativo usa de fora: o Supabase (dados, fotos assinadas, tempo real por wss). Fotos da câmera e prévias são
 * blob:/data:; o QR code do segundo fator é data:; o leitor de PDF usa um worker deste site.
 */
export const ROTAS_COM_CSP = /^\/gestao\/(app|admin)(\/|$)/;

export function politicaDoApp(o: { nonce: string; supabase: string; dev?: boolean }): string {
  const supabase = (o.supabase || "https://banco-nao-configurado.invalid").replace(/\/+$/, "");
  const supabaseWs = supabase.replace(/^http/, "ws");
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${o.nonce}' 'strict-dynamic'${o.dev ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabase}`,
    `media-src 'self' data: blob: ${supabase}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabase} ${supabaseWs}${o.dev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "report-uri /api/gestao/csp",
  ].join("; ");
}

/** Um nonce novo (16 bytes aleatórios em base64), no Edge e no Node. */
export function novoNonce(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}
