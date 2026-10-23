/** Conteúdo de uma página de vendas. Cada guia tem um arquivo com este formato. */
export type PaginaVendas = {
  slug: string;
  seo: { titulo: string; descricao: string };
  /** `secundario`: um segundo botão no topo, [texto, link], por exemplo para uma âncora da página. */
  hero: { eyebrow: string; antes: string; destaque: string; depois: string; lead: string; selos: string[]; secundario?: [string, string] };
  dores: { titulo: string; frases: string[] };
  virada: { imagem: string; alt: string; eyebrow: string; titulo: string; paragrafos: string[] };
  recebe: { titulo: string; itens: [string, string][]; paginas: [string, string][] };
  /** `rotulo`: a palavra acima de cada número (padrão: "Passo"). */
  metodo: { eyebrow: string; titulo: string; imagem?: string; alt?: string; rotulo?: string; passos: [string, string][] };
  /** Opcional: uma página do guia reproduzida inteira na página de vendas, com a legenda do que vem em cada página. */
  ficha?: FichaExemplo;
  bonus: { titulo: string; itens: { imagem?: string; icone?: string; titulo: string; texto: string }[] };
  /** Opcional: o que vem a mais no plano em destaque (ex.: os guias práticos do Kit). */
  kit?: { eyebrow: string; titulo: string; texto: string; itens: { imagem: string; titulo: string; texto: string }[]; nota?: string };
  paraQuem: { sim: string[]; nao: string[] };
  /**
   * `complemento`: o order bump oferecido no checkout da Cakto, em uma frase.
   * `planos`: o texto de cada plano quando o produto tem `ofertas` no catálogo, pelo `id` da oferta.
   */
  oferta: { itens: string[]; complemento?: string; planos?: Record<string, Plano> };
  garantia: string;
  faq: [string, string][];
  ctaFinal: string;
  aviso: string;
};

/** O texto de um plano. Preço e checkout ficam em `ofertas`, no catálogo. */
export type Plano = { descricao: string; itens: string[]; selo?: string; capas?: string[] };

/** Uma página do guia (a "ficha" de uma atividade), escrita como está no guia. */
export type FichaExemplo = {
  eyebrow: string;
  titulo: string;
  lead: string;
  capitulo: string;
  numero: number;
  nome: string;
  frase: string;
  tempo: string;
  /** De 1 a 3 estrelas. */
  nivel: number;
  nivelNome: string;
  porte: string;
  idade: string;
  /** [nome, nota de 0 a 5] */
  indicadores: [string, number][];
  porque: string;
  materiais: string[];
  passos: string[];
  facil: string;
  dificil: string;
  cuidado: string;
  dica: string;
  combina: string[];
  /** O que vem em cada página: [título, explicação]. */
  legenda: [string, string][];
  nota?: string;
};
