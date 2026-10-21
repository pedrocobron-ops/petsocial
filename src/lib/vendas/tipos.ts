/** Conteúdo de uma página de vendas. Cada guia tem um arquivo com este formato. */
export type PaginaVendas = {
  slug: string;
  seo: { titulo: string; descricao: string };
  hero: { eyebrow: string; antes: string; destaque: string; depois: string; lead: string; selos: string[] };
  dores: { titulo: string; frases: string[] };
  virada: { imagem: string; alt: string; eyebrow: string; titulo: string; paragrafos: string[] };
  recebe: { titulo: string; itens: [string, string][]; paginas: [string, string][] };
  metodo: { eyebrow: string; titulo: string; imagem?: string; alt?: string; passos: [string, string][] };
  bonus: { titulo: string; itens: { imagem?: string; icone?: string; titulo: string; texto: string }[] };
  paraQuem: { sim: string[]; nao: string[] };
  oferta: { itens: string[] };
  garantia: string;
  faq: [string, string][];
  ctaFinal: string;
  aviso: string;
};
