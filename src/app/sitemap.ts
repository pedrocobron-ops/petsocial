import type { MetadataRoute } from "next";
import { getAllPublishedSlugs, getCategories } from "@/lib/news";
import { ANIMAIS } from "@/lib/animais";
import { AUTORES } from "@/lib/autores";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://maestropet.com";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [artigos, categorias] = await Promise.all([
    getAllPublishedSlugs(),
    getCategories(),
  ]);

  return [
    {
      url: SITE_URL,
      changeFrequency: "hourly",
      priority: 1,
    },
    ...categorias.map((c) => ({
      url: `${SITE_URL}/categoria/${c.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...ANIMAIS.map((a) => ({
      url: `${SITE_URL}/animal/${a.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...artigos.map((a) => ({
      url: `${SITE_URL}/noticias/${a.slug}`,
      lastModified: new Date(a.updated_at),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...AUTORES.map((a) => ({
      url: `${SITE_URL}/autor/${a.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    })),
    { url: `${SITE_URL}/sobre`, priority: 0.4 },
    { url: `${SITE_URL}/principios-editoriais`, priority: 0.4 },
    { url: `${SITE_URL}/creditos-de-imagem`, priority: 0.2 },
    { url: `${SITE_URL}/contato`, priority: 0.3 },
    { url: `${SITE_URL}/politica-de-privacidade`, priority: 0.2 },
    { url: `${SITE_URL}/termos-de-uso`, priority: 0.2 },
  ];
}
