import type { PaginaVendas } from "./tipos";

export const sozinho: PaginaVendas = {
  slug: "sozinho",
  seo: {
    titulo: "Sozinho Sem Drama — o plano de 14 dias para o cão ficar sozinho",
    descricao:
      "O plano gradual para o seu cachorro ficar sozinho em casa com tranquilidade: teste do seu caso, plano de 14 dias, 10 atividades para a saída e material para imprimir. Sem bronca e sem castigo.",
  },
  hero: {
    eyebrow: "Guia passo a passo · Plano de 14 dias",
    antes: "Sair de casa ",
    destaque: "sem ouvir o choro",
    depois: " lá do corredor.",
    lead: "O plano gradual para o seu cão ficar sozinho com tranquilidade: menos choro, menos latido e menos estrago na volta. Uma página por dia, com o tempo certo de cada treino.",
    selos: ["Acesso imediato", "45 páginas ilustradas", "Garantia de 7 dias"],
  },
  dores: {
    titulo: "Se alguma destas cenas acontece na sua casa, este guia é para você",
    frases: [
      "Fecho a porta e escuto o choro ainda no corredor do prédio.",
      "Chego em casa e a almofada virou pedacinhos.",
      "O síndico já mandou bilhete por causa do latido.",
      "Ele faz xixi bem na porta de entrada quando eu saio.",
      "Ele me segue até o banheiro e fica esperando na porta.",
      "Saio para trabalhar com o coração apertado, pensando nele o dia todo.",
    ],
  },
  virada: {
    imagem: "/produtos/sozinho-soneca.webp",
    alt: "Mozart dormindo tranquilo na caminha",
    eyebrow: "Um segredo de cachorro, contado pelo Mozart",
    titulo: "Ele não chora para te irritar. Ele só ainda não aprendeu que você sempre volta.",
    paragrafos: [
      "Nem todo cão que chora sozinho tem o mesmo problema. Alguns estão **entediados**, outros **nunca aprenderam** a ficar sós, outros sentem **ansiedade de verdade** e outros latem para **cada barulho do prédio**. Cada caso pede um caminho diferente.",
      "O guia começa com um **teste rápido** para descobrir o seu caso e depois mostra o passo a passo: ausências curtas e calmas, aumentando aos poucos, com uma casa mais interessante para ele. Sem bronca, sem castigo e sem pular etapas.",
    ],
  },
  recebe: {
    titulo: "Tudo o que você precisa, organizado em um plano simples",
    itens: [
      ["O teste dos 4 perfis", "Descubra se é tédio, falta de hábito, ansiedade ou barulho, e por onde começar."],
      ["Quando é caso de veterinário", "Os sinais de que ele precisa de ajuda profissional, além do treino."],
      ["O vídeo que muda o plano", "Uma ficha para gravar e entender o que ele faz quando você sai."],
      ["As 7 regras de ouro e os mitos", "O que muda já hoje, antes mesmo de começar o treino."],
      ["Rituais de saída e chegada", "Como sair e como voltar sem deixar ele mais agitado."],
      ["O plano de 14 dias", "Uma página por dia, com meta, tempo de treino, registro e o que fazer se der errado."],
      ["10 atividades para a saída", "Recheável congelado, tapete de farejar, caixa surpresa e mais, uma por página."],
      ["Casos especiais", "Filhote, adotado, idoso, dois cães, latido para o corredor e jornadas longas."],
    ],
    paginas: [
      ["/produtos/sozinho-pag14.webp", "Página do plano de 14 dias"],
      ["/produtos/sozinho-pag4.webp", "O teste dos 4 perfis"],
    ],
  },
  metodo: {
    eyebrow: "O plano",
    titulo: "Do primeiro minuto à rotina",
    imagem: "/produtos/sozinho-chegada.webp",
    alt: "Tutora chegando em casa e Mozart esperando calmo",
    rotulo: "Etapa",
    passos: [
      ["Descobrir o caso", "Teste dos 4 perfis e o vídeo da saída"],
      ["Mudar a rotina", "Regras de ouro, rituais e energia gasta"],
      ["Independência em casa", "Ficar no cantinho com você em outro cômodo"],
      ["Segundos e minutos", "Saídas curtas e calmas pela porta da rua"],
      ["Meia hora, uma hora", "Ausências maiores, sempre antes do choro"],
      ["Rotina nova", "A escada de tempo até o seu dia a dia"],
    ],
  },
  bonus: {
    titulo: "Material para imprimir e aplicar",
    itens: [
      { imagem: "/produtos/sozinho-pag29.webp", titulo: "10 fichas de atividades", texto: "O que deixar com ele na hora de sair, com tempo que ocupa, bagunça e cuidados." },
      { icone: "📋", titulo: "Diário dos 14 dias", texto: "Uma linha por dia para ver o progresso e saber quando subir o tempo." },
      { icone: "✉️", titulo: "Bilhete para os vizinhos", texto: "Um modelo pronto para avisar o prédio que você está treinando. O clima muda na hora." },
    ],
  },
  paraQuem: {
    sim: [
      "Seu cão chora, late ou destrói quando fica sozinho",
      "Você vai voltar a trabalhar fora e quer preparar ele",
      "Você quer resolver sem bronca e sem castigo",
      "Você topa treinar em passos pequenos, todos os dias",
    ],
    nao: [
      "Você procura uma solução mágica, sem treino",
      "Seu cão se machuca tentando sair e ainda não passou no veterinário",
    ],
  },
  oferta: {
    itens: [
      "Guia completo ilustrado (45 páginas)",
      "Teste dos 4 perfis",
      "Plano de 14 dias, uma página por dia",
      "10 atividades para a hora da saída",
      "Casos especiais e latido para o corredor",
      "Diário, cartaz da família e bilhete para os vizinhos",
    ],
  },
  garantia:
    "Leia o guia e comece o plano. Se em até 7 dias você achar que não valeu a pena, é só pedir o reembolso e você recebe 100% do valor de volta. Sem perguntas e sem burocracia.",
  faq: [
    ["Funciona para qualquer cão?", "O plano serve para filhotes, adultos, idosos e cães adotados. O teste do começo mostra o tipo do seu caso e por onde começar."],
    ["Em quanto tempo melhora?", "Depende do cão. Alguns melhoram em poucos dias; casos de ansiedade levam semanas. O guia mostra como avançar no ritmo dele, sem pular etapas."],
    ["Moro em apartamento e o vizinho reclama. Ajuda?", "Sim. Tem uma parte só sobre latido para barulhos do corredor e um bilhete pronto para avisar os vizinhos enquanto você treina."],
    ["Preciso comprar alguma coisa?", "Não é obrigatório. A maioria das atividades usa o que você já tem: caixa de papelão, garrafa, toalha e a ração do dia."],
    ["E se o caso dele for grave?", "O guia mostra os sinais de que é preciso ajuda do veterinário ou de um profissional de comportamento. Nesses casos, o plano pode ser usado junto com o tratamento."],
    ["Como recebo?", "Logo depois da confirmação do pagamento você recebe o acesso no seu e-mail. É um guia digital em PDF, para ler no celular, no computador ou imprimir."],
  ],
  ctaFinal: "Sair de casa pode ser tranquilo para os dois.",
  aviso:
    "Este guia tem caráter educativo e não substitui a avaliação de um(a) médico(a)-veterinário(a) ou de um profissional de comportamento animal. Os resultados variam de acordo com cada cão e com a constância do treino.",
};
