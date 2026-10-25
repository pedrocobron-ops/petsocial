/**
 * Catálogo de guias do Maestro Pet.
 *
 * `checkout` recebe o link de pagamento da Cakto (https://pay.cakto.com.br/...)
 * assim que o produto é criado lá. O botão de compra só funciona com `lancado: true`
 * (a entrega na Cakto precisa estar ligada antes); até lá aparece "Em breve".
 *
 * `linha`: "tutor" (página em /<slug>) ou "negocios" (página em /negocios/<slug>).
 * As duas linhas não se misturam nas páginas de venda: cada uma só indica produtos da mesma família.
 */
export type Linha = "tutor" | "negocios";

/** Seções das vitrines /tutor e /negocios, na ordem em que aparecem. */
export const GRUPOS: Record<Linha, [string, string, string][]> = {
  tutor: [
    ["comportamento", "Comportamento e rotina", "Os problemas do dia a dia, resolvidos com passo a passo e reforço positivo."],
    ["cuidados", "Saúde, cozinha e cuidados", "Para cuidar bem: dúvidas de saúde, receitas seguras e a carteira de vacinação."],
    ["imprimir", "Kits para imprimir", "Documentos, lembranças e festas para imprimir em casa ou na gráfica."],
    ["redes", "Seu pet nas redes", "Para quem quer transformar o carisma do pet num perfil profissional."],
  ],
  negocios: [
    ["comece", "Comece o seu negócio", "Manuais completos, com plano de carreira, ferramentas e o passo a passo para começar do zero."],
    ["redes", "Seu pet como negócio", "Para quem quer levar o perfil do pet até as marcas."],
  ],
};

export type Produto = {
  slug: string;
  /** Padrão: "tutor". */
  linha?: Linha;
  /** A seção da vitrine (um dos ids de GRUPOS). */
  grupo?: string;
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
    grupo: "comportamento",
    nome: "Xixi no Lugar Certo",
    chamada: "O método de 7 dias para ensinar seu cachorro a fazer as necessidades no lugar certo.",
    dor: "Ele faz xixi no tapete, no sofá, em qualquer lugar",
    preco: 19.9,
    capa: "/produtos/xixi-capa.webp",
    checkout: "https://pay.cakto.com.br/rmu4ida",
    lancado: true,
  },
  {
    slug: "petiscos",
    grupo: "cuidados",
    nome: "Petiscos do Maestro",
    chamada: "30 receitas caseiras, baratas e seguras para agradar seu cachorro.",
    dor: "Quer dar petisco saudável e não sabe o que pode",
    preco: 14.9,
    capa: "/produtos/petiscos-capa.webp",
    checkout: "https://pay.cakto.com.br/k28xhi5",
    lancado: true,
  },
  {
    slug: "filhote",
    grupo: "comportamento",
    nome: "Filhote Sem Caos",
    chamada: "O guia dos primeiros 30 dias: rotina de sono, mordidas, xixi e socialização, passo a passo.",
    dor: "O filhote chora à noite e morde tudo",
    preco: 19.9,
    capa: "/produtos/filhote-capa.webp",
    checkout: "https://pay.cakto.com.br/362i685",
    lancado: true,
  },
  {
    slug: "tedio",
    grupo: "comportamento",
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
    grupo: "comportamento",
    nome: "Sozinho Sem Drama",
    chamada: "O plano de 14 dias para seu cachorro ficar sozinho com tranquilidade: teste do seu caso, uma página por dia e 10 atividades para a saída.",
    dor: "Fecho a porta e escuto o choro lá do corredor",
    preco: 27.9,
    capa: "/produtos/capa-sozinho.webp",
    checkout: "https://pay.cakto.com.br/39x2q2d",
    lancado: false,
  },
  {
    slug: "gato",
    grupo: "comportamento",
    nome: "Gato Feliz em Casa",
    chamada: "A linguagem do gato e 12 problemas resolvidos, um por página: sofá arranhado, xixi fora da caixa, miado de madrugada e mais.",
    dor: "O braço do sofá novo já está todo desfiado",
    preco: 27.9,
    capa: "/produtos/capa-gato.webp",
    checkout: "https://pay.cakto.com.br/vi3hpwx",
    lancado: false,
  },
  {
    slug: "normal",
    grupo: "cuidados",
    nome: "Isso É Normal?",
    chamada: "40 dúvidas do dia a dia com cães e gatos, com o semáforo do que observar em casa e de quando ir ao veterinário.",
    dor: "Ele vomitou espuma amarela. Isso é normal?",
    preco: 19.9,
    capa: "/produtos/capa-normal.webp",
    checkout: "https://pay.cakto.com.br/jfooex7",
    lancado: false,
  },
  {
    slug: "saude",
    grupo: "cuidados",
    nome: "Kit Saúde do Pet",
    chamada: "A carteira de vacinação e saúde para imprimir, com espaço para o veterinário, e o guia de vacinas, vermífugo e antipulgas.",
    dor: "A carteirinha do seu pet está rasgada ou perdida?",
    preco: 7.9,
    capa: "/produtos/capa-saude.webp",
    checkout: "https://pay.cakto.com.br/w6b4u9s",
    lancado: false,
  },
  {
    slug: "rg",
    grupo: "imprimir",
    nome: "RG e Certidão do Pet",
    chamada: "O RG do seu cão ou gato para imprimir e plastificar, a certidão de nascimento e a certidão de adoção.",
    dor: "Ele é da família. Merece documentos à altura.",
    preco: 7.9,
    capa: "/produtos/capa-rg.webp",
    checkout: "https://pay.cakto.com.br/32m8vuq",
    lancado: false,
  },
  {
    slug: "album",
    grupo: "imprimir",
    nome: "Álbum do Primeiro Ano",
    chamada: "O álbum para imprimir do primeiro ano com o seu filhote ou pet adotado, mês a mês.",
    dor: "Ele cresceu tão rápido que já nem lembro de como era pequeno.",
    preco: 14.9,
    capa: "/produtos/capa-album.webp",
    checkout: "https://pay.cakto.com.br/3ab6fqm",
    lancado: false,
  },
  {
    slug: "calendario",
    grupo: "imprimir",
    nome: "Calendário 2027 do Pet",
    chamada: "O calendário de parede para imprimir, com a foto dele em cada mês e as datas de vacina, vermífugo e antipulgas.",
    dor: "Quem deu o vermífugo? E quando foi?",
    preco: 9.9,
    capa: "/produtos/capa-calendario.webp",
    checkout: "https://pay.cakto.com.br/y8veb39",
    lancado: false,
  },
  {
    slug: "papelaria",
    grupo: "imprimir",
    nome: "Kit Papelaria do Pet",
    chamada: "Os 6 kits para imprimir num pacote só: saúde, RG, álbum, calendário, ficha de cuidados e viagem.",
    dor: "Tudo do seu pet organizado e impresso.",
    preco: 24.9,
    capa: "/produtos/papelaria-kits.webp",
    checkout: "https://pay.cakto.com.br/32wc3di",
    lancado: false,
  },
  {
    slug: "influenciador",
    grupo: "redes",
    nome: "Pet Influenciador",
    chamada: "O passo a passo completo para o perfil do seu pet ficar profissional, crescer e chegar até as marcas.",
    dor: "Todo mundo diz que ele deveria estar na internet.",
    preco: 47,
    capa: "/produtos/capa-influenciador.webp",
    checkout: "https://pay.cakto.com.br/h9iyg3a",
    lancado: false,
  },
];

export const produto = (slug: string) => PRODUTOS.find((p) => p.slug === slug)!;

export const linhaDe = (p: Produto): Linha => p.linha ?? "tutor";

/** Endereço da página de vendas. */
export const urlProduto = (p: Produto) => (linhaDe(p) === "negocios" ? `/negocios/${p.slug}` : `/${p.slug}`);

/** Produtos da mesma família (mesma linha e grupo), já lançados, para indicar no fim da página. */
export const daFamilia = (p: Produto, max = 3) =>
  PRODUTOS.filter((x) => x.slug !== p.slug && x.lancado && linhaDe(x) === linhaDe(p) && x.grupo === p.grupo).slice(0, max);

/** O guia já pode ser comprado: tem link de checkout (no produto ou em alguma das ofertas). */
export const temCheckout = (p: Produto) => Boolean(p.checkout || p.ofertas?.some((o) => o.checkout));

/** Uma oferta vista como produto, para o botão de compra e o Pixel. */
export const comoProduto = (p: Produto, o: Oferta): Produto => ({ ...p, nome: `${p.nome} · ${o.nome}`, preco: o.preco, checkout: o.checkout, ofertas: undefined });

export const reais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
