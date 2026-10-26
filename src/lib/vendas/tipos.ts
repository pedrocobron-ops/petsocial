/** Ícones permitidos nos itens sem imagem (lucide-react). Emoji não entra (brief 20, 10.1). */
export type IconeLucide =
  | "ClipboardList" | "Calculator" | "Camera" | "FileText" | "PawPrint" | "ListChecks" | "Ban" | "Phone" | "Cat" | "Sparkles"
  | "Gift" | "Luggage" | "Compass" | "Car" | "Calendar" | "Printer" | "Wrench" | "NotebookPen" | "Wallet" | "Mail" | "Dog"
  | "Tag" | "House" | "Landmark" | "Medal" | "GraduationCap" | "Cake" | "Cookie" | "Layers" | "PenLine" | "Plane";

/**
 * Conteúdo de uma página de vendas. Cada guia tem um arquivo com este formato.
 * Títulos aceitam *itálico* (uma expressão por título) e parágrafos aceitam **negrito**.
 */
export type PaginaVendas = {
  slug: string;
  /** O que o botão de compra chama de produto (padrão: "o guia"), ex.: "o kit", "o álbum". */
  item?: string;
  seo: { titulo: string; descricao: string };
  /**
   * `fatos`: a linha curta acima do h1 (até 3, ex. "Guia ilustrado", "23 páginas"); sem ela, usa o `eyebrow`.
   * `foto`: linha Negócios, foto real da dobra [src 4:5, alt] no lugar do palco.
   * `selos` e `secundario` são legados e não aparecem mais.
   */
  hero: { eyebrow: string; fatos?: string[]; antes: string; destaque: string; depois: string; lead: string; foto?: [string, string]; selos: string[]; secundario?: [string, string] };
  /** `foto`: foto real 4:5 de apartamento para "Ainda em dúvida?" [src, alt]. */
  dores: { titulo: string; frases: string[]; foto?: [string, string] };
  virada: { imagem: string; alt: string; eyebrow: string; titulo: string; paragrafos: string[] };
  /**
   * `itens`: [título, texto, página do PDF]. `paginas`: [src, legenda]; o número da página sai do nome do arquivo (`-pag14`).
   */
  recebe: { titulo: string; itens: [string, string, number?][]; paginas: [string, string][] };
  /** Até 3 números lidos do PDF, para "O que vem no guia": ["23", "páginas ilustradas"]. Só números reais. */
  numeros?: [string, string][];
  /**
   * Linha Negócios: "Três fatos com fonte" no lugar de "Ainda em dúvida?" (brief 20, 7.5 #7).
   * [termo, frase, nome da fonte, link]. Só enunciados conferidos com o texto do manual e com a fonte pública.
   */
  fontes?: [string, string, string, string][];
  /** Comparação honesta da tabela 10.3 do brief, só depois de validada (ex.: "Custa menos que um saco de petisco."). */
  comparacao?: string;
  /** `rotulo`: a palavra acima de cada número (padrão: "Passo"). */
  metodo: { eyebrow: string; titulo: string; imagem?: string; alt?: string; rotulo?: string; passos: [string, string][] };
  /** Opcional: uma página do guia reproduzida inteira na página de vendas, com a legenda do que vem em cada página. */
  ficha?: FichaExemplo;
  bonus: { titulo: string; itens: { imagem?: string; icone?: IconeLucide; titulo: string; texto: string }[] };
  /** Opcional: o que vem a mais no plano em destaque (ex.: os guias práticos do Kit). */
  /** Lista completa do conteúdo (ex.: as 100 atividades), agrupada. `id="todas"` na página. */
  todas?: { eyebrow: string; titulo: string; lead: string; grupos: [string, string[]][] };
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
