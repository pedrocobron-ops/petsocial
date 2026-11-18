import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import { bancoDoBuild } from "./src/lib/gestao/banco-do-build";

// De qual banco este build fala: as variáveis; sem elas, produção só no build de produção da Vercel (nunca em silêncio em outro lugar).
const BANCO = bancoDoBuild(process.env);
if (BANCO.aviso) console.warn(`\n\n********\n${BANCO.aviso}\n********\n`);

/** Versão do aplicativo para o registro de erros da Gestão: o commit da Vercel ou, no build local, o do git. */
function versao(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 12);
  try { return execSync("git rev-parse --short=12 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim() || "local"; } catch { return "local"; }
}

/**
 * Cabeçalhos de segurança de todas as páginas.
 * - Valendo já: o site não abre dentro de página de outro site (X-Frame-Options + frame-ancestors), o navegador não
 *   adivinha tipo de arquivo (nosniff), o endereço completo não vaza para outros sites (Referrer-Policy; as páginas
 *   públicas levam código no endereço) e só o próprio site usa câmera e microfone (fotos e o Mozart por voz).
 * - Só avisando (Content-Security-Policy-Report-Only): a lista do que cada página pode carregar. Nada é bloqueado ainda;
 *   o navegador manda um aviso para /api/gestao/csp quando algo sai da lista. Depois de alguns dias sem aviso legítimo,
 *   troque `Content-Security-Policy-Report-Only` por `Content-Security-Policy` (e junte o frame-ancestors na mesma linha).
 * De fora que o site usa: Supabase (dados, fotos e tempo real), o pixel da Meta (só depois do aceite dos cookies) e o
 * script de oferta da Cakto. Links para o WhatsApp (wa.me), Cakto e Google Maps são navegação, que a lista não segura.
 */
function cabecalhosDeSeguranca() {
  const supabase = (BANCO.url || "https://banco-nao-configurado.invalid").replace(/\/+$/, "");
  const supabaseWs = supabase.replace(/^http/, "ws");
  const dev = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""} https://connect.facebook.net https://caktoscripts.nyc3.cdn.digitaloceanspaces.com`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabase} https://www.facebook.com`,
    `media-src 'self' data: blob: ${supabase}`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabase} ${supabaseWs} https://www.facebook.com https://connect.facebook.net${dev ? " ws://localhost:* ws://127.0.0.1:*" : ""}`,
    "worker-src 'self' blob:",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "report-uri /api/gestao/csp",
  ].join("; ");
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), browsing-topics=()" },
    // frame-ancestors não funciona no modo "só avisando": vai numa regra que já vale
    { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
    { key: "Content-Security-Policy-Report-Only", value: csp },
  ];
}

const nextConfig: NextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
  },
  poweredByHeader: false,
  // o ESLint roda no CI (npm run lint), não no build
  eslint: { ignoreDuringBuilds: true },
  env: { NEXT_PUBLIC_GESTAO_VERSAO: versao(), NEXT_PUBLIC_SUPABASE_URL: BANCO.url, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: BANCO.chave },

  async headers() {
    // Páginas abertas por um código no endereço (tutor, entrada, álbum, boletim, orçamento, autorização de fotos) e as fotos
    // delas: nenhum endereço vai para fora (no-referrer). As outras mandam só o domínio. Duas regras que não se cruzam.
    const COM_CODIGO = "tutor|entrada|album|boletim|orcamento|autorizacao";
    const todos = cabecalhosDeSeguranca();
    return [
      { source: "/:path*", headers: todos.filter((h) => h.key !== "Referrer-Policy") },
      { source: `/((?!${COM_CODIGO.split("|").map((a) => `gestao/${a}/`).join("|")}).*)`, headers: todos.filter((h) => h.key === "Referrer-Policy") },
      { source: `/gestao/:area(${COM_CODIGO})/:resto*`, headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },

  /**
   * Redirecionamentos permanentes (301) das versões antigas do domínio
   * (rede social e jornal). As URLs antigas seguem indexadas no Google; em vez
   * de 404, mandamos quem chega por elas para a página inicial da loja.
   */
  async redirects() {
    return [
      // linha Feed Pronto mudou para a área de negócios
      { source: "/feed-pronto", destination: "/negocios/feed-pronto", permanent: true },
      { source: "/feed-pronto/:pagina([a-z-]+)", destination: "/negocios/feed-pronto/:pagina", permanent: true }, // só páginas: as imagens continuam em /feed-pronto/<área>/...
      // link citado no PDF do Xixi ("Continue com o Mozart"); a página não existe, leva para a vitrine
      { source: "/adestramento", destination: "/tutor", permanent: false },

            // jornal (versão anterior)
      { source: "/noticias/:path*", destination: "/", permanent: true },
      { source: "/categoria/:path*", destination: "/", permanent: true },
      { source: "/animal/:path*", destination: "/", permanent: true },
      { source: "/autor/:path*", destination: "/", permanent: true },
      { source: "/redacao/:path*", destination: "/", permanent: true },
      { source: "/redacao", destination: "/", permanent: true },
      { source: "/principios-editoriais", destination: "/sobre", permanent: true },
      { source: "/creditos-de-imagem", destination: "/sobre", permanent: true },
      { source: "/rss.xml", destination: "/", permanent: true },
      { source: "/news-sitemap.xml", destination: "/sitemap.xml", permanent: true },
      { source: "/ler/:slug", destination: "/", permanent: true },
      { source: "/jornal", destination: "/", permanent: true },
      { source: "/jornal/:path*", destination: "/", permanent: true },

      // telas do aplicativo de rede social (não existem mais)
      { source: "/feed", destination: "/", permanent: true },
      { source: "/descobrir", destination: "/", permanent: true },
      { source: "/perfil", destination: "/", permanent: true },
      { source: "/perfil/:path*", destination: "/", permanent: true },
      { source: "/pet/:path*", destination: "/", permanent: true },
      { source: "/post/:path*", destination: "/", permanent: true },
      { source: "/meetup/:path*", destination: "/", permanent: true },
      { source: "/meetups", destination: "/", permanent: true },
      { source: "/lugares", destination: "/", permanent: true },
      { source: "/lugares/:path*", destination: "/", permanent: true },
      { source: "/sign-in", destination: "/", permanent: true },
      { source: "/sign-up", destination: "/", permanent: true },
      { source: "/onboarding", destination: "/", permanent: true },
    ];
  },
};

export default nextConfig;
