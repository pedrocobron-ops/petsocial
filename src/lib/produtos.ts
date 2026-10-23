/**
 * Catálogo de guias do Maestro Pet.
 *
 * `checkout` recebe o link de pagamento da Cakto (https://pay.cakto.com.br/...)
 * assim que o produto é criado lá. Enquanto estiver vazio, o botão de compra
 * aparece como "Em breve".
 */
export type Produto = {
  slug: string;
  nome: string;
  chamada: string;
  dor: string;
  /** Com `ofertas`, é o menor preço ("a partir de"). */
  preco: number;
  /** Preço anterior, riscado. Só use se o produto já foi vendido por esse valor. */
  precoDe?: number;
  capa?: string;
  /** Com `ofertas`, fica vazio: cada oferta tem o seu link. */
  checkout: string;
  /**
   * Opcional: mais de um plano do mesmo guia, cada um com o seu checkout na Cakto.
   * O texto de cada plano (o que vem nele) fica na página de vendas, em `oferta.planos`, pelo mesmo `id`.
   */
  ofertas?: Oferta[];
  lancado: boolean;
};

export type Oferta = {
  id: string;
  nome: string;
  preco: number;
  checkout: string;
  /** O plano em destaque na página (aparece primeiro no celular e leva o selo). */
  destaque?: boolean;
};

export const PRODUTOS: Produto[] = [
  {
    slug: "xixi",
    nome: "Xixi no Lugar Certo",
    chamada: "O método de 7 dias para ensinar seu cachorro a fazer as necessidades no lugar certo.",
    dor: "Ele faz xixi no tapete, no sofá, em qualquer lugar",
    preco: 19.9,
    precoDe: 47,
    capa: "/produtos/xixi-capa.webp",
    checkout: "https://pay.cakto.com.br/rmu4ida",
    lancado: true,
  },
  {
    slug: "petiscos",
    nome: "Petiscos do Maestro",
    chamada: "30 receitas caseiras, baratas e seguras para agradar seu cachorro.",
    dor: "Quer dar petisco saudável e não sabe o que pode",
    preco: 14.9,
    precoDe: 37,
    capa: "/produtos/petiscos-capa.webp",
    checkout: "https://pay.cakto.com.br/k28xhi5",
    lancado: true,
  },
  {
    slug: "filhote",
    nome: "Filhote Sem Caos",
    chamada: "O guia dos primeiros 30 dias: rotina de sono, mordidas, xixi e socialização, passo a passo.",
    dor: "O filhote chora à noite e morde tudo",
    preco: 19.9,
    precoDe: 47,
    capa: "/produtos/filhote-capa.webp",
    checkout: "https://pay.cakto.com.br/362i685",
    lancado: true,
  },
  {
    slug: "tedio",
    nome: "Cão Sem Tédio",
    chamada: "100 atividades para gastar a energia do seu cão em casa, uma por página, quase todas com o que você já tem.",
    dor: "Chego em casa e o chinelo virou pedacinhos",
    preco: 27.9,
    capa: "/produtos/tedio-capa.webp",
    checkout: "",
    ofertas: [
      { id: "basico", nome: "Básico", preco: 27.9, checkout: "" },
      { id: "kit", nome: "Kit Completo", preco: 37.9, checkout: "", destaque: true },
    ],
    lancado: false,
  },
  {
    slug: "sozinho",
    nome: "Sozinho Sem Drama",
    chamada: "Um plano gradual para seu cachorro ficar sozinho com tranquilidade.",
    dor: "Ele chora, late e destrói tudo quando fica sozinho",
    preco: 37,
    precoDe: 97,
    capa: "/produtos/capa-sozinho.webp",
    checkout: "",
    lancado: false,
  },
  {
    slug: "gato",
    nome: "Gato Feliz em Casa",
    chamada: "Acabe com arranhões no sofá, xixi fora da caixa e miados de madrugada.",
    dor: "O gato arranha o sofá e faz xixi fora da caixa",
    preco: 27,
    precoDe: 67,
    capa: "/produtos/capa-gato.webp",
    checkout: "",
    lancado: false,
  },
];

export const produto = (slug: string) => PRODUTOS.find((p) => p.slug === slug)!;

/** O guia já pode ser comprado: tem link de checkout (no produto ou em alguma das ofertas). */
export const temCheckout = (p: Produto) => Boolean(p.checkout || p.ofertas?.some((o) => o.checkout));

/** Uma oferta vista como produto, para o botão de compra e o Pixel. */
export const comoProduto = (p: Produto, o: Oferta): Produto => ({ ...p, nome: `${p.nome} · ${o.nome}`, preco: o.preco, checkout: o.checkout, ofertas: undefined });

export const reais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
