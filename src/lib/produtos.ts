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
  preco: number;
  precoDe: number;
  capa?: string;
  checkout: string;
  lancado: boolean;
};

export const PRODUTOS: Produto[] = [
  {
    slug: "xixi",
    nome: "Xixi no Lugar Certo",
    chamada: "O método de 7 dias para ensinar seu cachorro a fazer as necessidades no lugar certo.",
    dor: "Ele faz xixi no tapete, no sofá, em qualquer lugar",
    preco: 27,
    precoDe: 67,
    capa: "/produtos/xixi-capa.webp",
    checkout: "https://pay.cakto.com.br/rmu4ida",
    lancado: true,
  },
  {
    slug: "petiscos",
    nome: "Petiscos do Maestro",
    chamada: "Receitas caseiras, baratas e seguras para agradar seu cachorro.",
    dor: "Quer dar petisco saudável e não sabe o que pode",
    preco: 19.9,
    precoDe: 47,
    capa: "/produtos/capa-petiscos.webp",
    checkout: "",
    lancado: false,
  },
  {
    slug: "filhote",
    nome: "Filhote Sem Caos",
    chamada: "O guia dos primeiros 30 dias para o filhote dormir, parar de morder e aprender a rotina.",
    dor: "O filhote chora à noite e morde tudo",
    preco: 27,
    precoDe: 67,
    capa: "/produtos/filhote-capa.webp",
    checkout: "",
    lancado: true,
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

export const reais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
