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
  preco?: number;
  checkout: string;
  lancado: boolean;
};

export const POSTS_POR_PACOTE = 60;

/** Edições de cor que vêm em todos os pacotes, além da azul e amarela (os mesmos 60 posts, recoloridos). */
export const EDICOES_COR = ["Rosa", "Verde"] as const;

/** Complementos oferecidos no checkout de cada área (Stories, Avisos, Kit Perfil e Roteiros de Reels). */
export const COMPLEMENTOS_POR_AREA = 4;
export const PRECO_COMPLEMENTO = 9.9;

export const FEED_AREAS: AreaFeed[] = [
  {
    slug: "pet-shop",
    nome: "Pet Shop",
    negocio: "o seu pet shop",
    chamada: "Banho e tosa, dicas de cuidado, loja, promoções e datas comemorativas, prontos para postar.",
    dores: ["Entre um banho e outro, não sobra tempo para criar post", "O Instagram da loja fica semanas parado", "Pago designer e ainda demora para ficar pronto"],
    temas: ["Serviços de banho e tosa", "Dicas e cuidados entre banhos", "Loja", "Promoções e pacotes", "Datas comemorativas", "Confiança e bastidores", "Engajamento"],
    carrosseis: 3,
    preco: 27,
    checkout: "https://pay.cakto.com.br/36cv2sf",
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
    preco: 27,
    checkout: "https://pay.cakto.com.br/zbyhhkj",
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
    preco: 27,
    checkout: "https://pay.cakto.com.br/36jhahs",
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
    preco: 27,
    checkout: "https://pay.cakto.com.br/3boabzp",
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
    preco: 27,
    checkout: "https://pay.cakto.com.br/fpa5w26",
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
    preco: 27,
    checkout: "https://pay.cakto.com.br/bh4jjtj",
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
    preco: 27,
    checkout: "https://pay.cakto.com.br/33efuq5",
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
    preco: 27,
    checkout: "https://pay.cakto.com.br/womojdv",
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
    preco: 27,
    checkout: "https://pay.cakto.com.br/87n2n8g",
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
    preco: 27,
    checkout: "https://pay.cakto.com.br/wetsm9f",
    lancado: false,
  },
];

export const areaFeed = (slug: string) => FEED_AREAS.find((a) => a.slug === slug);

/** "de" + o negócio, com a contração certa: "do seu pet shop", "da sua clínica". */
export const deNegocio = (a: AreaFeed) => a.negocio.replace(/^o /, "do ").replace(/^a /, "da ");

export const nomeFeed = (a: AreaFeed) => `Feed Pronto ${a.nome}`;

/**
 * Caminho das imagens de uma área em /public/feed-pronto/<slug>/: capa.webp, exemplo-1..12.webp (posts reais do pacote),
 * carrossel-1..N.webp (as páginas de um carrossel) e rosa-1/2.webp, verde-1/2.webp (os mesmos posts nas outras cores).
 * Todas tiradas dos arquivos .pptx entregues ao comprador (800 px, webp).
 */
export const imgFeed = (a: AreaFeed, arquivo: string) => `/feed-pronto/${a.slug}/${arquivo}`;

/** Amostras de cada área mostradas na página de vendas (textos tirados das legendas que vêm no pacote). */
export type AmostrasFeed = {
  /** Título de cada exemplo-N.webp, na ordem (usado no texto alternativo). */
  exemplos: string[];
  /** Um dos carrosséis do pacote: carrossel-1.webp a carrossel-<paginas>.webp. */
  carrossel: { titulo: string; paginas: number };
  /** A legenda que vem pronta com o exemplo-<exemplo>.webp, como está no pacote. */
  legenda: { exemplo: number; texto: string };
  /** Exemplos que aparecem também nas edições rosa e verde (rosa-1/2.webp e verde-1/2.webp). */
  cores: [number, number];
};

export const AMOSTRAS: Record<string, AmostrasFeed> = {
  "pet-shop": {
    exemplos: ["Tá na hora do banho!", "Feliz Dia dos Namorados!", "Time cachorro ou time gato?", "Ainda não conhece a gente?", "Tosa na tesoura é trabalho de paciência.", "De quanto em quanto tempo dar banho?", "Roupinhas pós-banho.", "Combo da semana: banho + hidratação.", "Feliz Ano Novo!", "Onde estamos.", "Dia de banho: ama ou foge?", "Gato também toma banho, e merece um ambiente calmo."],
    carrossel: { titulo: "O que acontece no banho?", paginas: 5 },
    legenda: { exemplo: 8, texto: "Combo da semana: banho + hidratação. ✨\nPelo macio, cheiroso e brilhante, com preço especial. Consulte as condições.\nAgende pelo WhatsApp: o link está na bio. 📲\n#promocaopet #banhoetosa #petshop #descontopet" },
    cores: [1, 8],
  },
  "veterinaria": {
    exemplos: ["Cuidado completo para o seu pet.", "Pulgas e carrapatos: prevenir é o caminho.", "Alimentos proibidos para pet.", "Plano filhote!", "Feliz Ano Novo!", "Muito prazer!", "Check-up de rotina.", "Vermifugação em dia.", "Remédio de gente não é para pet.", "Combo consulta + vacina V10.", "Feliz Dia do Gato!", "Horário de atendimento."],
    carrossel: { titulo: "Vacinas do filhote: o básico.", paginas: 5 },
    legenda: { exemplo: 4, texto: "Plano filhote! 🐶\n1ª consulta + vacina V10 + antirrábica, com preço especial.\nAgende pelo WhatsApp: o link está na bio. 📲\n#clinicaveterinaria #saudepet #promocaopet #veterinario" },
    cores: [1, 4],
  },
  "adestramento": {
    exemplos: ["É hora de aprender!", "O chamado “vem!”.", "Late demais?", "Pacote 4 aulas em casa.", "Feliz Ano Novo!", "Muito prazer!", "Passeio sem puxão.", "Como ensinar o “senta”.", "Medo de barulho?", "Primeira aula com 20% off.", "Feliz Dia das Mães de pet!", "Horário das aulas."],
    carrossel: { titulo: "Como funciona uma aula em casa?", paginas: 4 },
    legenda: { exemplo: 4, texto: "Pacote 4 aulas em casa. 📅\nUma aula por semana, com tarefas entre elas.\nGaranta o seu pelo WhatsApp (link na bio).\n#adestramento #adestramentoemcasa #filhote #cachorro" },
    cores: [1, 4],
  },
  "dog-walker": {
    exemplos: ["Tá na hora do passeio!", "Quanto tempo de passeio?", "Segurança no passeio.", "Pacote 8 passeios no mês.", "Feliz Ano Novo!", "Muito prazer!", "Passeio com brincadeira.", "Passeio no calor.", "Guia sempre na mão.", "Pacote 20 passeios no mês.", "Feliz Dia das Mães de pet!", "Horário dos passeios."],
    carrossel: { titulo: "Como funciona o passeio?", paginas: 5 },
    legenda: { exemplo: 4, texto: "Pacote 8 passeios no mês. 📅\nIndividuais de 30 min, duas vezes por semana.\nGaranta o seu pelo WhatsApp (link na bio).\n#dogwalker #passeadordecaes #passeiocomcachorro #cachorro" },
    cores: [1, 4],
  },
  "hotel-e-creche": {
    exemplos: ["Vai viajar? Ele fica com a gente!", "Na creche, é dia de brincar!", "Conta tudo pra gente!", "Pacote feriadão: 3 diárias no hotel.", "Vai curtir o Carnaval?", "Muito prazer!", "Sono tranquilo para cada hóspede.", "Novos amigos todo dia.", "Primeiro dia na creche.", "Diária teste com 50% off!", "Feliz Dia dos Namorados!", "Nossos horários."],
    carrossel: { titulo: "Como é um dia no hotel?", paginas: 5 },
    legenda: { exemplo: 4, texto: "Pacote feriadão: 3 diárias no hotel. 📅\nPequeno porte, de R$ 299,70 por R$ 269,90. Consulte datas e vagas.\nReserve pelo WhatsApp: o link está na bio. 📲\n#hotelpet #crecheparacaes #promocaopet #feriado #ferias" },
    cores: [1, 4],
  },
  "pet-sitter": {
    exemplos: ["Vai viajar? Ele fica em casa!", "Gato gosta de rotina.", "Feriadão chegando?", "Pacote feriado: 4 visitas de 1 hora.", "Vai curtir o Carnaval?", "Muito prazer!", "Gato prefere ficar no território dele.", "Vai viajar? Deixe tudo pronto antes de sair.", "Férias à vista?", "A visita de apresentação é grátis.", "Feliz Dia dos Namorados!", "Horários de visita."],
    carrossel: { titulo: "Como é uma visita de pet sitter?", paginas: 5 },
    legenda: { exemplo: 4, texto: "Pacote feriado: 4 visitas de 1 hora. 📅\nUma visita por dia no feriado prolongado, com preço especial. Consulte as datas.\nReserve pelo WhatsApp: o link está na bio. 📲\n#petsitter #promocaopet #cuidadordepets #feriado #ferias" },
    cores: [1, 4],
  },
  "comida-natural": {
    exemplos: ["Comida natural de verdade para o seu pet.", "Na hora de servir: fria da geladeira ou levemente morna.", "Primeiro pedido? Comece pelo kit degustação.", "Feliz Natal!", "Muito prazer!", "Frango ou carne?", "Gato também tem cardápio aqui.", "Troca de ração para comida natural? Sem pressa.", "O décimo kit é por nossa conta.", "Seu pet faz aniversário este mês?", "Pedidos e entregas.", "Qual o nome do seu pet?"],
    carrossel: { titulo: "Alimentos proibidos para pets.", paginas: 4 },
    legenda: { exemplo: 3, texto: "Primeiro pedido? Comece pelo kit degustação. 🎁\n7 marmitas de 200 g para ele provar, de R$ 69,90 por R$ 59,90.\nPeça pelo WhatsApp: o link está na bio. 📲\n#comidanatural #alimentacaonatural #promocaopet #marmitapet" },
    cores: [1, 3],
  },
  "confeitaria-pet": {
    exemplos: ["Tem doce para o seu cão!", "Como guardar os doces.", "Kit cãoversário!", "Feliz Natal!", "Muito prazer!", "Bolo ou cupcake?", "Cupcakes pet, fofinhos e coloridos.", "O que vai no bolo do cão?", "Ainda não provou?", "Aniversariante do mês!", "Horário de encomendas.", "Marque quem sempre divide o lanche com o pet."],
    carrossel: { titulo: "Bolo pet: perguntas frequentes.", paginas: 5 },
    legenda: { exemplo: 3, texto: "Kit cãoversário! 🎉\nBolo P + 6 cupcakes + pote de biscoitos, com preço de kit.\nEncomende pelo WhatsApp: o link está na bio. 📲\n#confeitariapet #promocaopet #kitfestapet #bolopet #caoversario" },
    cores: [1, 3],
  },
  "moda-pet": {
    exemplos: ["Novidades na vitrine!", "Tabela de medidas.", "Kit passeio: peitoral + guia combinando.", "É Carnaval!", "Muito prazer!", "Laço ou bandana?", "Peitoral confortável para o passeio.", "Ficou entre dois tamanhos?", "Cartão fidelidade!", "Feliz Dia das Mães de pet!", "Bastidores do ateliê.", "Qual o tamanho do seu pet?"],
    carrossel: { titulo: "Coleção de inverno chegou!", paginas: 4 },
    legenda: { exemplo: 3, texto: "Kit passeio: peitoral + guia combinando. 🐾\nNo mesmo tecido, com preço especial.\nPeça pelo WhatsApp: o link está na bio. 📲\n#modapet #promocaopet #acessoriospet #lojapet" },
    cores: [1, 3],
  },
  "agropet": {
    exemplos: ["Ração, areia e muito mais.", "Pediu, a gente entrega!", "Caixa de areia limpa.", "Combo gato: ração 10 kg + 2 areias de 4 kg.", "Feliz Dia dos Namorados!", "Muito prazer!", "Ração para gatos.", "Saco de 15 kg? Deixa com a gente.", "Como guardar a ração.", "Primeiro pedido com entrega grátis.", "Feliz Dia das Mães de pet!", "Atendimento de bairro."],
    carrossel: { titulo: "Como trocar a ração sem susto.", paginas: 5 },
    legenda: { exemplo: 4, texto: "Combo gato: ração 10 kg + 2 areias de 4 kg. 🐱\nDe R$ 209,70 por R$ 189,90. O mês do seu gato resolvido numa compra só.\nPeça pelo WhatsApp: o link está na bio. 📲\n#promocaopet #agropet #racao #descontopet #casaderacao" },
    cores: [1, 4],
  },
};

const AREAS_AVULSAS = FEED_AREAS.length;
const COMPLEMENTOS = AREAS_AVULSAS * COMPLEMENTOS_POR_AREA;
const PRECO_AREA = FEED_AREAS[0].preco ?? 0;

/** A conta do valor separado do combo, para mostrar na página: áreas + complementos comprados um a um. */
export const CONTA_SEPARADO = {
  areas: AREAS_AVULSAS,
  precoArea: PRECO_AREA,
  totalAreas: AREAS_AVULSAS * PRECO_AREA,
  complementos: COMPLEMENTOS,
  precoComplemento: PRECO_COMPLEMENTO,
  totalComplementos: Math.round(COMPLEMENTOS * PRECO_COMPLEMENTO * 100) / 100,
};

/**
 * Combo Pet Completo: as 10 áreas com todos os complementos num produto só.
 * `precoSeparado` é a soma real das 10 áreas e dos 40 complementos avulsos (10 × R$ 27 + 40 × R$ 9,90 = R$ 666).
 */
export const COMBO = {
  slug: "combo-pet-completo",
  nome: "Combo Pet Completo",
  chamada: "As 10 áreas do Feed Pronto, com todos os complementos, num pacote só.",
  preco: 67 as number | undefined,
  precoSeparado: (CONTA_SEPARADO.totalAreas + CONTA_SEPARADO.totalComplementos) as number | undefined,
  checkout: "https://pay.cakto.com.br/ez6jart",
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
