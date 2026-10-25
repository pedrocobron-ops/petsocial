import type { MetadataRoute } from "next";
import { FEED_AREAS } from "@/lib/feed-pronto";
import { PRODUTOS, urlProduto } from "@/lib/produtos";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://maestropet.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const feed = FEED_AREAS.filter((a) => a.lancado).map((a) => `/negocios/feed-pronto/${a.slug}`);
  const paginas = [
    "", "/tutor", "/negocios",
    ...PRODUTOS.filter((p) => p.lancado).map(urlProduto),
    ...(feed.length ? ["/negocios/feed-pronto", ...feed] : []),
    "/fogos", "/sobre", "/contato", "/termos-de-uso", "/politica-de-privacidade",
  ];
  return paginas.map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: "weekly", priority: p === "" ? 1 : 0.8 }));
}
