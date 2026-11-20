import type { Metadata } from "next";
import { headers } from "next/headers";
import { logoDaLoja } from "./supabase-config";

/**
 * A prévia do link no WhatsApp (Open Graph) das páginas que o tutor recebe: o nome do pet shop, uma frase curta e a logo
 * do pet shop (ou uma imagem neutra com o nome dele). Nunca a imagem e o texto do site da Maestro Pet: quem recebe o link
 * precisa reconhecer de quem ele é. Só para código de servidor.
 */

/** O endereço deste servidor (a prévia precisa de endereço completo). */
export async function origemDoPedido() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost";
  const proto = h.get("x-forwarded-proto") ?? (/^(localhost|127\.)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

const curto = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).replace(/\s+\S*$/, "")}…` : s);

/**
 * `imagemNeutra`: caminho (deste servidor) da imagem gerada com o nome do pet shop, usada quando ele não subiu logo.
 * `particular`: página com código particular (pedido, página do tutor): fica fora dos buscadores e sem guardar em cache.
 */
export function previaDaLoja(o: { titulo: string; descricao: string; loja: string; logo?: string | null; url: string; origem: string; imagemNeutra: string; particular?: boolean }): Metadata {
  const logo = logoDaLoja(o.logo, o.origem);
  const imagem = logo ? { url: logo, width: 512, height: 512, alt: `Logo de ${o.loja}` } : { url: `${o.origem}${o.imagemNeutra}`, width: 1200, height: 630, alt: o.loja };
  const titulo = curto(o.titulo, 90), descricao = curto(o.descricao, 180);
  return {
    title: { absolute: titulo }, description: descricao,
    robots: o.particular ? { index: false, follow: false, nocache: true } : { index: false, follow: false },
    ...(o.particular ? { referrer: "no-referrer" as const } : {}),
    openGraph: { type: "website", title: titulo, description: descricao, url: o.url, siteName: o.loja, locale: "pt_BR", images: [imagem] },
    twitter: { card: logo ? "summary" : "summary_large_image", title: titulo, description: descricao, images: [imagem.url] },
  };
}
