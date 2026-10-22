import type { MetadataRoute } from "next";
import { PRODUTOS } from "@/lib/produtos";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://maestropet.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const paginas = ["", ...PRODUTOS.filter((p) => p.lancado).map((p) => `/${p.slug}`), "/fogos", "/sobre", "/contato", "/termos-de-uso", "/politica-de-privacidade"];
  return paginas.map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: "weekly", priority: p === "" ? 1 : 0.8 }));
}
