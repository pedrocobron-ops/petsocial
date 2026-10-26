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
  /** Para qual bicho é. Padrão: os dois. Evita indicar guia de cachorro para quem tem gato. */
  para?: "cao" | "gato";
  nome: string;
  chamada: string;
  dor: string;
  /** Com `ofertas`, é o menor preço ("a partir de"). */
  preco: number;
  /**
   * Preço anterior, riscado (brief 20, 10.1). Só existe com a data desde quando o produto foi vendido
   * por esse valor e o caminho do print guardado em docs/precos/. Sem isso, nada é riscado.
   */
  riscado?: { precoDe: number; precoDeDesde: string; print: string };
  /** Uma linha curta para o card da vitrine (6.10), no lugar da chamada cortada com reticências. */
  resumo?: string;
  /** Imagem de compartilhamento própria (/og/<slug>.png). */
  og?: string;
  /** "Versão 1.1 · outubro de 2026": só com dado real. */
  versao?: string;
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
    slug: "xixi", para: "cao",
    grupo: "comportamento",
    nome: "Xixi no Lugar Certo",
    resumo: "Método de 7 dias, sem bronca.",
    chamada: "O método de 7 dias para ensinar seu cachorro a fazer as necessidades no lugar certo.",
    dor: "Ele faz xixi no tapete, no sofá, em qualquer lugar",
    preco: 19.9,
    capa: "/produtos/xixi-capa.webp",
    checkout: "https://pay.cakto.com.br/rmu4ida",
    lancado: true,
  },
  {
    slug: "petiscos", para: "cao",
    grupo: "cuidados",
    nome: "Petiscos do Maestro",
    resumo: "30 receitas seguras e baratas.",
    chamada: "30 receitas caseiras, baratas e seguras para agradar seu cachorro.",
    dor: "Quer dar petisco saudável e não sabe o que pode",
    preco: 14.9,
    capa: "/produtos/petiscos-capa.webp",
    checkout: "https://pay.cakto.com.br/k28xhi5",
    lancado: true,
  },
  {
    slug: "filhote", para: "cao",
    grupo: "comportamento",
    nome: "Filhote Sem Caos",
    resumo: "Os primeiros 30 dias, passo a passo.",
    chamada: "O guia dos primeiros 30 dias: rotina de sono, mordidas, xixi e socialização, passo a passo.",
    dor: "O filhote chora à noite e morde tudo",
    preco: 19.9,
    capa: "/produtos/filhote-capa.webp",
    checkout: "https://pay.cakto.com.br/362i685",
    lancado: true,
  },
  {
    slug: "tedio", para: "cao",
    grupo: "comportamento",
    nome: "Cão Sem Tédio",
    chamada: "100 atividades para gastar a energia do seu cão em casa, uma por página, quase todas com o que você já tem.",
    dor: "Chego em casa e o chinelo virou pedacinhos",
    preco: 27.9,
    capa: "/produtos/tedio-capa.webp",
    checkout: "https://pay.cakto.com.br/k7z3hpi",
    ofertas: [
      { id: "basico", nome: "Básico", preco: 27.9, checkout: "https://pay.cakto.com.br/k7z3hpi" },
      { id: "kit", nome: "Kit Completo", preco: 37.9, checkout: "https://pay.cakto.com.br/ct4kx8q", destaque: true },
    ],
    lancado: true,
  },
  {
    slug: "sozinho", para: "cao",
    grupo: "comportamento",
    nome: "Sozinho Sem Drama",
    chamada: "O plano de 14 dias para seu cachorro ficar sozinho com tranquilidade: teste do seu caso, uma página por dia e 10 atividades para a saída.",
    dor: "Fecho a porta e escuto o choro lá do corredor",
    preco: 27.9,
    capa: "/produtos/capa-sozinho.webp",
    checkout: "https://pay.cakto.com.br/39x2q2d",
    lancado: true,
  },
  {
    slug: "gato", para: "gato",
    grupo: "comportamento",
    nome: "Gato Feliz em Casa",
    chamada: "A linguagem do gato e 12 problemas resolvidos, um por página: sofá arranhado, xixi fora da caixa, miado de madrugada e mais.",
    dor: "O braço do sofá novo já está todo desfiado",
    preco: 27.9,
    capa: "/produtos/capa-gato.webp",
    checkout: "https://pay.cakto.com.br/vi3hpwx",
    lancado: true,
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
    lancado: true,
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
    lancado: true,
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
    lancado: true,
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
    lancado: true,
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
    lancado: true,
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
    lancado: true,
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
    lancado: true,
  },
  { slug: "aniversario", grupo: "imprimir", nome: "Kit Aniversário do Pet", chamada: "A festa do seu cão ou gato para imprimir: convite, topo de bolo, decoração, plaquinhas para foto e as receitas da festa.", dor: "Ele merece uma festa, com um bolo que ele pode comer.", preco: 9.9, capa: "/produtos/capa-aniversario.webp", checkout: "https://pay.cakto.com.br/w28ega7", lancado: true },
  { slug: "natal", grupo: "imprimir", nome: "Kit Natal do Pet", chamada: "Cartões com a foto dele, enfeites para a árvore, meia com o nome, plaquinhas e o guia de um Natal seguro.", dor: "Ele também é da família, e o Natal é com ele na foto.", preco: 7.9, capa: "/produtos/capa-natal.webp", checkout: "https://pay.cakto.com.br/nbrpjsf", lancado: true },
  { slug: "placas", grupo: "imprimir", nome: "Placas da Casa", chamada: "Placas simpáticas para a porta, o portão e a janela, para cães e gatos, em A4 e A5, coloridas ou em P&B.", dor: "O portão aberto, o gato que escapa, a visita que não sabe.", preco: 5.9, capa: "/produtos/capa-placas.webp", checkout: "https://pay.cakto.com.br/68xfv27", lancado: true },
  { slug: "diplomas", grupo: "imprimir", nome: "Diplomas e Medalhas do Pet", chamada: "Oito diplomas para preencher, medalhas e rosetas para montar e cartões de conquista para as fotos.", dor: "Toda conquista dele merece uma formatura.", preco: 5.9, capa: "/produtos/capa-diplomas.webp", checkout: "https://pay.cakto.com.br/oeavd2z", lancado: true },
  { slug: "painel", grupo: "imprimir", nome: "Painel da Geladeira do Pet", chamada: "A rotina do pet na porta da geladeira: quem deu comida, quem passeou, a ração, as tarefas da família e os contatos.", dor: "Alguém já deu comida para ele?", preco: 5.9, capa: "/produtos/capa-painel.webp", checkout: "https://pay.cakto.com.br/33q5w8n", lancado: true },
  { slug: "baralho", para: "cao", grupo: "comportamento", nome: "Baralho de Atividades", chamada: "52 cartas para imprimir com brincadeiras que gastam a energia do seu cão dentro de casa. Tire uma por dia.", dor: "Ele rói, late e não sossega, e você não sabe o que fazer com ele hoje.", preco: 7.9, capa: "/produtos/capa-baralho.webp", checkout: "https://pay.cakto.com.br/54s4xz9", lancado: true },
  { slug: "comandos", para: "cao", grupo: "comportamento", nome: "Cartões de Comandos", chamada: "20 cartões de treino com reforço positivo, com o gesto, a palavra e o passo a passo, para pendurar numa argola.", dor: "Cada pessoa da casa ensina de um jeito diferente.", preco: 7.9, capa: "/produtos/capa-comandos.webp", checkout: "https://pay.cakto.com.br/y7ebj3v", lancado: true },
  { slug: "chegou", para: "cao", grupo: "imprimir", nome: "Chegou o Filhote!", chamada: "O kit de boas-vindas para imprimir: plaquinhas para as primeiras fotos, anúncio para a família, o cantinho e a primeira semana.", dor: "O filhote chegou, e o primeiro dia merece ser lembrado.", preco: 7.9, capa: "/produtos/capa-chegou.webp", checkout: "https://pay.cakto.com.br/3k9qcsq", lancado: true },
  { slug: "colorir", grupo: "imprimir", nome: "Livro de Colorir do Mozart", chamada: "19 desenhos do Mozart para as crianças pintarem, com frases que ensinam a cuidar bem dos bichos.", dor: "Uma atividade para as crianças longe da tela.", preco: 7.9, capa: "/produtos/capa-colorir.webp", checkout: "https://pay.cakto.com.br/3998pcs", lancado: false },
  { slug: "planner", grupo: "imprimir", nome: "Planner do Tutor 2027", chamada: "O ano inteiro do seu pet num planner só: saúde, gastos, treino, metas e a foto de cada mês de 2027.", dor: "Vacina, vermífugo, gastos e fotos espalhados por todo lado.", preco: 14.9, capa: "/produtos/capa-planner.webp", checkout: "https://pay.cakto.com.br/399gtq4", lancado: true },
  { slug: "confeitaria", linha: "negocios", grupo: "comece", nome: "Confeitaria Pet: o manual do negócio", resumo: "30 receitas, ficha técnica e as regras.", chamada: "30 receitas para festa e o negócio completo: kits, ficha técnica e preço, regras para vender, etiquetas e plano de carreira em 4 níveis.", dor: "Faço bolo de cachorro, mas não sei cobrar nem o que a lei exige", preco: 67, capa: "/produtos/negocios/capa-confeitaria.webp", checkout: "https://pay.cakto.com.br/35oowwt", lancado: true },
  { slug: "passeador", linha: "negocios", grupo: "comece", nome: "Manual do Passeador de Cães", resumo: "Segurança, preço, contrato e clientes.", chamada: "Comportamento, segurança, preço, MEI, contrato e primeiros clientes, com ferramentas prontas e plano de carreira em 4 níveis.", dor: "Quero trabalhar com cães, mas não sei por onde começar", preco: 67, capa: "/produtos/negocios/capa-passeador.webp", checkout: "https://pay.cakto.com.br/rm2zaez", lancado: true },
  { slug: "petsitter", linha: "negocios", grupo: "comece", nome: "Manual do Pet Sitter", resumo: "Visitas, chaves, contrato e preço.", chamada: "Visitas a cães e gatos na casa do tutor: rotina, sinais de alerta, chaves, contrato, preço e plano de carreira em 4 níveis.", dor: "Cuido dos pets dos amigos, mas nunca cobrei direito", preco: 67, capa: "/produtos/negocios/capa-petsitter.webp", checkout: "https://pay.cakto.com.br/idn4jp6", lancado: true },
  { slug: "fotografia", linha: "negocios", grupo: "comece", nome: "Fotografia Pet: o manual do negócio", resumo: "Bem-estar, contrato, preço e clientes.", chamada: "Sessão com bem-estar, equipamento em 3 níveis, contrato e uso de imagem, preço, clientes e plano de carreira em 4 níveis.", dor: "Fotografo pets bem, mas não sei transformar em negócio", preco: 67, capa: "/produtos/negocios/capa-fotografia.webp", checkout: "https://pay.cakto.com.br/r48j45w", lancado: true },
];

export const produto = (slug: string) => PRODUTOS.find((p) => p.slug === slug)!;

export const linhaDe = (p: Produto): Linha => p.linha ?? "tutor";

/** Endereço da página de vendas. */
export const urlProduto = (p: Produto) => (linhaDe(p) === "negocios" ? `/negocios/${p.slug}` : `/${p.slug}`);

/**
 * Produtos para indicar no fim da página: já lançados, da mesma linha e para o mesmo bicho
 * (nada de guia de cachorro para quem tem gato). Os do mesmo grupo vêm primeiro.
 */
export const daFamilia = (p: Produto, max = 3) =>
  PRODUTOS.filter((x) => x.slug !== p.slug && x.lancado && linhaDe(x) === linhaDe(p) && (!x.para || !p.para || x.para === p.para))
    .sort((a, b) => Number(b.grupo === p.grupo) - Number(a.grupo === p.grupo))
    .slice(0, max);

/** O guia já pode ser comprado: tem link de checkout (no produto ou em alguma das ofertas). */
export const temCheckout = (p: Produto) => Boolean(p.checkout || p.ofertas?.some((o) => o.checkout));

/** Uma oferta vista como produto, para o botão de compra e o Pixel. */
export const comoProduto = (p: Produto, o: Oferta): Produto => ({ ...p, nome: `${p.nome} · ${o.nome}`, preco: o.preco, checkout: o.checkout, ofertas: undefined });

export const reais = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
