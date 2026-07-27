import { getLatest } from "@/lib/news";

/**
 * Sitemap de notícias no padrão do Google News: lista as matérias das
 * últimas 48 horas com as tags <news:news> que o Google exige.
 * Referência: developers.google.com/search/docs/crawling-indexing/sitemaps/news-sitemap
 */
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
  const artigos = await getLatest(100);
  const corte = Date.now() - 48 * 60 * 60 * 1000;
  const recentes = artigos.filter(
    (a) => a.published_at && new Date(a.published_at).getTime() >= corte
  );

  const urls = recentes
    .map(
      (a) => `  <url>
    <loc>${SITE_URL}/noticias/${a.slug}</loc>
    <news:news>
      <news:publication>
        <news:name>Maestro Pet</news:name>
        <news:language>pt</news:language>
      </news:publication>
      <news:publication_date>${new Date(a.published_at!).toISOString()}</news:publication_date>
      <news:title>${esc(a.title)}</news:title>
    </news:news>
  </url>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${urls}
</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
