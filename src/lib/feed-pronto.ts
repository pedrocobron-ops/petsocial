/**
 * Linha Feed Pronto: pacotes de posts editáveis no Canva para negócios pet (vendidos pela Maestro Pet, sem o Mozart).
 * Uma página de vendas por área em /feed-pronto/<slug>. Imagens em /public/feed-pronto/<slug>/.
 *
 * `checkout` recebe o link da Cakto quando o produto for criado; vazio = botão "Em breve".
 * `preco` fica vazio até o preço ser definido; sem preço, a página não mostra valor.
 * `lancado: false` deixa a página fora do Google (noindex) e fora da vitrine.
 */
export type AreaFeed = {
  slug: string;
  /** Nome da área no produto ("Pet Shop", "Veterinária"...). O produto se chama "Feed Pronto <nome>". */
  nome: string;
  /** Para quem é, no texto corrido: "o seu pet shop", "a sua clínica". */
  negocio: string;
  chamada: string;
  dores: string[];
  temas: string[];
  carrosseis: number;
  /** Edições de cor do mesmo pacote (além da azul e amarela). */
  cores?: string[];
  preco?: number;
  checkout: string;
  lancado: boolean;
};

export const POSTS_POR_PACOTE = 60;

export const FEED_AREAS: AreaFeed[] = [
  {
    slug: "pet-shop",
    nome: "Pet Shop",
    negocio: "o seu pet shop",
    chamada: "Banho e tosa, dicas de cuidado, loja, promoções e datas comemorativas, prontos para postar.",
    dores: ["Entre um banho e outro, não sobra tempo para criar post", "O Instagram da loja fica semanas parado", "Pago designer e ainda demora para ficar pronto"],
    temas: ["Serviços de banho e tosa", "Dicas e cuidados entre banhos", "Loja", "Promoções e pacotes", "Datas comemorativas", "Confiança e bastidores", "Engajamento"],
    carrosseis: 3,
    cores: ["Rosa", "Verde"],
    checkout: "",
    lancado: false,
  },
  {
    slug: "veterinaria",
    nome: "Veterinária",
    negocio: "a sua clínica",
    chamada: "Consultas, vacinas, cuidados preventivos e datas da clínica, com linguagem clara para o tutor.",
    dores: ["Atendo o dia todo e o Instagram fica para depois", "Quero orientar os tutores, mas não sei o que postar", "Os posts da clínica não têm a cara de uma clínica"],
    temas: ["Consultas e serviços", "Vacinas e prevenção", "Dicas de saúde", "Planos e promoções", "Datas comemorativas", "Confiança e bastidores", "Engajamento"],
    carrosseis: 3,
    checkout: "",
    lancado: false,
  },
  {
    slug: "adestramento",
    nome: "Adestramento",
    negocio: "o seu adestramento",
    chamada: "Aulas, pacotes, dicas de comportamento e reforço positivo para atrair novos alunos.",
    dores: ["Sei adestrar, mas não sei divulgar", "Passo o dia em aula e não sobra tempo para postar", "Não sei como mostrar o meu trabalho"],
    temas: ["Aulas e serviços", "Comandos e dicas de treino", "Comportamento", "Pacotes e promoções", "Datas comemorativas", "Confiança e bastidores", "Engajamento"],
    carrosseis: 3,
    checkout: "",
    lancado: false,
  },
  {
    slug: "dog-walker",
    nome: "Dog Walker",
    negocio: "o seu serviço de passeio",
    chamada: "Passeios, pacotes, segurança e dicas de rotina para quem trabalha com passeio de cães.",
    dores: ["Passo o dia na rua e não consigo postar", "Quero mais clientes no bairro", "Meu perfil não mostra o cuidado que eu tenho"],
    temas: ["Passeios e serviços", "Dicas de passeio", "Segurança no passeio", "Pacotes e promoções", "Datas comemorativas", "Confiança e bastidores", "Engajamento"],
    carrosseis: 3,
    checkout: "",
    lancado: false,
  },
  {
    slug: "hotel-e-creche",
    nome: "Hotel e Creche",
    negocio: "o seu hotel ou creche",
    chamada: "Hospedagem, day care, rotina, adaptação e feriados, com posts que passam confiança ao tutor.",
    dores: ["O tutor tem medo de deixar o pet com quem não conhece", "Nos feriados lota, no resto do ano sobra vaga", "Não tenho tempo de pensar no que postar"],
    temas: ["Hotel e hospedagem", "Creche e day care", "Dicas e adaptação", "Pacotes e promoções", "Datas comemorativas", "Confiança e bastidores", "Engajamento"],
    carrosseis: 3,
    checkout: "",
    lancado: false,
  },
  {
    slug: "pet-sitter",
    nome: "Pet Sitter",
    negocio: "o seu serviço de pet sitter",
    chamada: "Visitas em casa, cuidados com cães e gatos, viagens e feriados, com posts que passam confiança.",
    dores: ["É difícil mostrar confiança só pelo Instagram", "Os clientes só aparecem nas férias", "Não sei o que postar no dia a dia"],
    temas: ["Serviços de pet sitter", "Dicas para o tutor", "Viagens e feriados", "Pacotes e promoções", "Datas comemorativas", "Confiança e bastidores", "Engajamento"],
    carrosseis: 3,
    checkout: "",
    lancado: false,
  },
  {
    slug: "comida-natural",
    nome: "Comida Natural",
    negocio: "a sua marca de comida natural",
    chamada: "Cardápios, ingredientes, transição, entrega e dicas, com o cuidado de indicar o acompanhamento veterinário.",
    dores: ["Faço a comida, mas não consigo divulgar", "Os tutores têm muitas dúvidas antes de comprar", "Não sei montar posts bonitos dos produtos"],
    temas: ["Cardápio e serviços", "Dicas de alimentação", "Promoções e kits", "Datas comemorativas", "Confiança e bastidores", "Engajamento"],
    carrosseis: 3,
    checkout: "",
    lancado: false,
  },
  {
    slug: "confeitaria-pet",
    nome: "Confeitaria Pet",
    negocio: "a sua confeitaria pet",
    chamada: "Bolos, petiscos, kits de festa e encomendas, com ingredientes seguros para cães.",
    dores: ["As encomendas dependem de eu postar sempre", "Não tenho tempo de fazer arte para cada produto", "Quero vender mais nos aniversários e datas"],
    temas: ["Produtos e encomendas", "Dicas e ingredientes", "Promoções e kits", "Datas comemorativas", "Confiança e bastidores", "Engajamento"],
    carrosseis: 3,
    checkout: "",
    lancado: false,
  },
  {
    slug: "moda-pet",
    nome: "Moda Pet",
    negocio: "a sua loja de moda pet",
    chamada: "Roupinhas, acessórios, coleções, tabela de medidas e datas, prontos para postar.",
    dores: ["Cada coleção nova precisa de muitos posts", "Os clientes perguntam sempre o tamanho", "O feed não mostra o capricho das peças"],
    temas: ["Coleção e produtos", "Medidas e dicas de uso", "Promoções e kits", "Datas comemorativas", "Confiança e bastidores", "Engajamento"],
    carrosseis: 2,
    checkout: "",
    lancado: false,
  },
  {
    slug: "agropet",
    nome: "Agropet",
    negocio: "a sua agropet",
    chamada: "Rações, acessórios, entrega, promoções e datas, para a casa de ração do bairro.",
    dores: ["A loja não para e o Instagram fica parado", "Os clientes não sabem tudo o que eu vendo", "As promoções não chegam em ninguém"],
    temas: ["Rações e produtos", "Entrega e atendimento", "Dicas úteis", "Promoções e clube", "Datas comemorativas", "Confiança e bastidores", "Engajamento"],
    carrosseis: 3,
    checkout: "",
    lancado: false,
  },
];

export const areaFeed = (slug: string) => FEED_AREAS.find((a) => a.slug === slug);

/** "de" + o negócio, com a contração certa: "do seu pet shop", "da sua clínica". */
export const deNegocio = (a: AreaFeed) => a.negocio.replace(/^o /, "do ").replace(/^a /, "da ");

export const nomeFeed = (a: AreaFeed) => `Feed Pronto ${a.nome}`;

/** Caminho das imagens de uma área (capa.webp e exemplo-1.webp a exemplo-6.webp). */
export const imgFeed = (a: AreaFeed, arquivo: string) => `/feed-pronto/${a.slug}/${arquivo}`;

/**
 * Combo Pet Completo: as 10 áreas com todos os complementos num produto só.
 * `preco` e `precoSeparado` (a soma real das áreas e complementos avulsos) ficam vazios até o Pedro decidir os preços.
 */
export const COMBO = {
  slug: "combo-pet-completo",
  nome: "Combo Pet Completo",
  chamada: "As 10 áreas do Feed Pronto, com todos os complementos, num pacote só.",
  preco: undefined as number | undefined,
  precoSeparado: undefined as number | undefined,
  checkout: "",
  lancado: false,
  /** O que vem, com as quantidades reais (10 áreas). */
  itens: [
    ["600 posts de feed", "60 por área, editáveis no Canva, com legenda pronta, nas edições azul, rosa e verde."],
    ["600 stories", "A versão vertical de cada post, feita para a tela do celular."],
    ["300 avisos em 3 formatos", "Feriado, horário, regras, pagamento e mais: post, story e A4 para imprimir, com QR code."],
    ["400 capas de destaques e 100 bios", "O Kit Perfil Profissional de cada área."],
    ["300 roteiros de Reels", "Com manual de gravação para quem nunca gravou."],
    ["10 calendários de postagem", "Os posts de cada área organizados em 3 por semana e as datas do ano."],
  ] as [string, string][],
};
