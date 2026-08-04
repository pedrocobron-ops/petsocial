import { getLatest } from "@/lib/news";
import { capaAbsolutaDe } from "@/lib/capa";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://maestropet.com";

export const revalidate = 900;

function esc(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function GET() {
  const artigos = await getLatest(30);

  const items = artigos
    .map((a) => {
      const link = `${SITE_URL}/noticias/${a.slug}`;
      return `    <item>
      <title>${esc(a.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      ${a.dek ? `<description>${esc(a.dek)}</description>` : ""}
      ${a.published_at ? `<pubDate>${new Date(a.published_at).toUTCString()}</pubDate>` : ""}
      ${a.category ? `<category>${esc(a.category.name)}</category>` : ""}
      <enclosure url="${esc(capaAbsolutaDe(a))}" type="image/jpeg"/>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Maestro Pet — Jornal do Universo Pet</title>
    <link>${SITE_URL}</link>
    <description>Notícias, guias e curiosidades sobre cães, gatos e o universo pet.</description>
    <language>pt-BR</language>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
