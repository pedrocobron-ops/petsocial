const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://maestropet.com";

/**
 * Endereço da capa de uma matéria.
 *
 * Capa é obrigatória no Maestro Pet. Quando a matéria ainda não tem
 * fotografia, em vez de sair sem imagem ela recebe a capa tipográfica que o
 * próprio jornal gera em /api/capa/[slug], com o título e a cor da editoria.
 * No dia em que uma foto real for salva, ela assume sozinha o lugar.
 */
export function capaDe(artigo: { cover_url: string | null; slug: string }) {
  return artigo.cover_url || `/api/capa/${artigo.slug}`;
}

/** Mesma capa em endereço absoluto, para Open Graph, JSON-LD e RSS. */
export function capaAbsolutaDe(artigo: { cover_url: string | null; slug: string }) {
  const capa = capaDe(artigo);
  return capa.startsWith("http") ? capa : `${SITE_URL}${capa}`;
}

/** True quando a imagem é a capa gerada, e não uma fotografia real. */
export function ehCapaGerada(artigo: { cover_url: string | null }) {
  return !artigo.cover_url;
}
