import type { PaginaVendas } from "./tipos";

export const petiscos: PaginaVendas = {
  slug: "petiscos",
  seo: {
    titulo: "Petiscos do Maestro — 30 receitas caseiras para cães",
    descricao:
      "30 receitas caseiras e seguras para o seu cão: biscoitos, desidratados, gelados, petiscos de treino e bolo de festa. Sem sal, sem açúcar e sem tempero, com porção por porte e tabela de conservação. Acesso imediato.",
  },
  hero: {
    eyebrow: "Livro de receitas · 30 petiscos caseiros",
    antes: "Petiscos ",
    destaque: "feitos em casa",
    depois: ", com ingredientes que você conhece.",
    fatos: ["Livro de receitas", "30 receitas", "Passo a passo ilustrado"],
    lead: "30 receitas simples e seguras, sem sal, sem açúcar e sem tempero.",
    selos: ["Acesso imediato", "30 receitas ilustradas", "Garantia de 7 dias"],
  },
  dores: {
    titulo: "Se você já pensou alguma destas frases, este livro é para você",
    frases: [
      "Não entendo metade dos ingredientes do pacote de petisco.",
      "Petisco bom é caro e acaba em dois dias.",
      "Fico com medo de dar alguma coisa que faça mal.",
      "Ele enjoa sempre do mesmo biscoito.",
      "Não sei quanto petisco posso dar por dia.",
      "Queria fazer um bolo no aniversário dele.",
    ],
    foto: ["/fotos/tutor-petiscos-duvida-4x5.webp", "Tutora oferecendo um cubo de melancia a um shih tzu na varanda"],
  },
  virada: {
    imagem: "/produtos/petiscos-cozinhando.webp",
    alt: "Tutora cortando biscoitos em formato de osso enquanto o Mozart observa de chapéu de chef",
    eyebrow: "Um segredo da cozinha, contado pelo Mozart",
    titulo: "O melhor petisco tem três ingredientes, *e você já tem todos em casa.*",
    paragrafos: [
      "Abóbora, aveia e um ovo. Foi assim o primeiro biscoito que a minha tutora fez, e eu fiquei sentadinho ao lado do forno os 30 minutos inteiros. **Petisco caseiro não precisa de nada difícil**: só de ingredientes certos e de saber o que nunca pode entrar na receita.",
      "Neste livro estão as receitas que a gente mais faz, com ingredientes de supermercado, e as regras que deixam tudo **seguro**: o que pode, o que nunca pode e quanto dar por dia.",
    ],
  },
  recebe: {
    titulo: "30 receitas e tudo o que você precisa saber *antes de ligar o forno.*",
    itens: [
      ["As 5 regras de ouro", "O que vale para toda receita: sem sal, sem açúcar, sem tempero e na quantidade certa."],
      ["O que pode e o que nunca pode", "A lista de alimentos liberados e dos tóxicos para cães, como chocolate, uva e xilitol.", 5],
      ["10 biscoitos assados", "Abóbora, banana, cenoura, pasta de amendoim, frango, maçã e mais."],
      ["6 desidratados", "Chips de batata-doce, maçã, banana e cenoura, tirinhas de frango e de carne."],
      ["6 gelados para o verão", "Melancia, picolé, caldo de frango, sorvete, patinhas de mirtilo e manga."],
      ["5 petiscos de treino", "Pequenos, cheirosos e fáceis de levar no bolso."],
      ["3 receitas de festa", "Bolo, cupcake e cobertura para o aniversário dele."],
    ],
    paginas: [
      ["/produtos/petiscos-pag9.webp", "Página da receita de biscoito de abóbora e aveia"],
      ["/produtos/petiscos-pag5.webp", "Página com a lista do que o cão pode e nunca pode comer"],
      ["/produtos/petiscos-pag7.webp", "Quanto dar por dia, para cada porte, do mini ao gigante"],
      ["/produtos/petiscos-pag43.webp", "Tabela de conservação: pote, geladeira e freezer"],
    ],
  },
  numeros: [["30", "receitas ilustradas"], ["4", "passos da despensa ao pote"], ["3", "tabelas e etiquetas para usar"]],
  metodo: {
    eyebrow: "Como funciona",
    titulo: "Da despensa ao pote *em 4 passos.*",
    imagem: "/produtos/petiscos-desidratados.webp",
    alt: "Mozart de chapéu de chef ao lado de uma assadeira de chips de maçã e de batata-doce",
    passos: [
      ["Escolha", "Uma receita pelo que você tem em casa"],
      ["Prepare", "Passo a passo ilustrado, sem ingrediente difícil"],
      ["Sirva", "Na porção certa para o porte dele"],
      ["Guarde", "No pote certo, pelo tempo certo"],
    ],
  },
  bonus: {
    titulo: "Tabelas e etiquetas *para usar todo dia.*",
    itens: [
      { imagem: "/produtos/petiscos-pag7.webp", titulo: "Quanto dar por dia", texto: "A porção de biscoitos e de petiscos de treino para cada porte, do mini ao gigante, para não exagerar." },
      { imagem: "/produtos/petiscos-pag43.webp", titulo: "Tabela de conservação", texto: "Quanto tempo cada tipo de petisco dura no pote, na geladeira e no freezer, e como saber se estragou." },
      { imagem: "/produtos/petiscos-pag44.webp", titulo: "Etiquetas para os potes", texto: "Para imprimir e colar: nome da receita, data de preparo e validade. Ninguém em casa precisa adivinhar." },
    ],
  },
  paraQuem: {
    sim: [
      "Você quer saber exatamente o que o seu cão está comendo",
      "Você quer economizar no petisco sem abrir mão da qualidade",
      "Você gosta de cozinhar, ou quer começar com receitas simples",
      "Você quer comemorar o aniversário dele com um bolo de verdade",
    ],
    nao: [
      "Você procura uma dieta completa para substituir a ração",
      "O seu cão tem doença ou dieta especial e você não quer consultar o veterinário",
    ],
  },
  oferta: {
    complemento: "adicione a lista Pode e Não Pode Comer para imprimir, com os alimentos proibidos, os liberados e o plano de emergência, por só R$ 9,90.",
    itens: [
      "Livro completo ilustrado com 30 receitas (46 páginas)",
      "10 biscoitos, 6 desidratados e 6 gelados",
      "5 petiscos de treino e 3 receitas de festa",
      "As 5 regras de ouro e a lista do que pode e do que nunca pode",
      "Tabela de porção por porte e de conservação",
      "Etiquetas para os potes, para imprimir",
    ],
  },
  garantia:
    "Faça as receitas e veja a reação do seu cão. Se em até 7 dias você achar que não valeu a pena, é só pedir o reembolso e você recebe 100% do valor de volta. Sem perguntas e sem burocracia.",
  faq: [
    ["Preciso de algum equipamento especial?", "Não. Forno, assadeira e liquidificador já resolvem. Cortadores e forminhas de silicone deixam os petiscos mais bonitos, mas são opcionais."],
    ["Como recebo o livro?", "Logo depois da confirmação do pagamento você recebe o acesso no seu e-mail. O livro é um PDF ilustrado que você lê no celular, no computador ou imprime."],
    ["Os ingredientes são caros ou difíceis de achar?", "Não. São ingredientes de supermercado: aveia, ovo, abóbora, cenoura, banana, frango. A maioria das receitas tem de 1 a 4 ingredientes."],
    ["Dá para fazer sem forno?", "Sim. Os gelados não usam forno, e os biscoitos e chips também podem ser feitos na air fryer."],
    ["Serve para filhotes?", "Depois que o filhote já come alimento sólido, sim, em pedaços pequenos e na quantidade indicada para cães mini. Confirme com o veterinário."],
    ["Meu cão tem alergia ou alguma doença. Posso usar?", "Mostre as receitas ao veterinário antes. Muitas têm um único ingrediente, o que facilita escolher as que servem para ele."],
    ["E se eu não gostar?", "Você tem 7 dias de garantia. Se não gostar, pede o reembolso e recebe 100% do valor de volta, sem perguntas."],
  ],
  ctaFinal: "O próximo petisco favorito dele pode sair da sua cozinha hoje.",
  aviso:
    "Este livro tem caráter educativo e não substitui a avaliação de um(a) médico(a)-veterinário(a). Petiscos são complemento da alimentação. Cães com doenças, alergias ou dieta especial devem ter a alimentação orientada por um profissional.",
};
