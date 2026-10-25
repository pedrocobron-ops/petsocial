import type { PaginaVendas } from "./tipos";

export const normal: PaginaVendas = {
  slug: "normal",
  seo: {
    titulo: "Isso É Normal? — 40 dúvidas do dia a dia com o seu pet",
    descricao:
      "Ele comeu grama, vomitou espuma, lambe a pata sem parar: isso é normal? 40 situações do dia a dia com cães e gatos, com o semáforo do que observar em casa e de quando ir ao veterinário.",
  },
  hero: {
    eyebrow: "Guia de consulta rápida · 40 dúvidas",
    antes: "Para aquela dúvida das ",
    destaque: "11 da noite",
    depois: ": isso é normal ou é veterinário?",
    lead: "As dúvidas do dia a dia com o seu cão ou gato, uma por página: o que costuma ser, o que observar em casa e quando é hora de ligar ou correr para o veterinário.",
    selos: ["Acesso imediato", "46 páginas", "Garantia de 7 dias"],
  },
  dores: {
    titulo: "Quem tem pet já passou por isso",
    frases: [
      "Ele vomitou uma espuma amarela. É grave?",
      "Comeu grama de novo. Isso faz mal?",
      "Está lambendo a pata sem parar há dias.",
      "O nariz está quente e seco. Será febre?",
      "Fez um barulho estranho, como se estivesse engasgado.",
      "Fico pesquisando na internet e cada site diz uma coisa.",
    ],
  },
  virada: {
    imagem: "/produtos/normal-confuso.webp",
    alt: "Mozart com cara de dúvida",
    eyebrow: "Como o guia funciona",
    titulo: "Um semáforo para cada dúvida.",
    paragrafos: [
      "Cada situação tem **três faixas**: o que **costuma ser normal** (observe em casa), o que pede **conversa com o veterinário** nos próximos dias e o que é para **ir agora**. Junto, o que fazer em casa enquanto observa e o que nunca fazer.",
      "O guia não faz diagnóstico e não indica remédio: ele ajuda você a **observar melhor e decidir com mais segurança**, sem pânico e sem deixar passar o que é sério.",
    ],
  },
  recebe: {
    titulo: "40 dúvidas, organizadas para achar rápido",
    itens: [
      ["Comida e barriga", "Grama, vômito, falta de apetite, diarreia, gases, objeto engolido, alimentos proibidos."],
      ["Pele e pelo", "Coceira, lambedura, queda de pelo, carrapato, picada, bumbum no chão, caroços."],
      ["Olhos, ouvidos, boca e nariz", "Remela, orelha, mau hálito, espirro reverso e espirros."],
      ["Comportamento e sono", "Dorme muito, treme, corre em círculos, sonha, se esconde, ofegante."],
      ["Xixi e cocô", "Xixi frequente, cor diferente, muco no cocô, gato indo toda hora à caixa."],
      ["Movimento, filhotes e mitos", "Mancando, escada, unha quebrada, tosse, filhote chorando e mordendo, cio, nariz quente."],
    ],
    paginas: [
      ["/produtos/normal-pag6.webp", "Página de uma das 40 dúvidas"],
      ["/produtos/normal-pag4.webp", "Sinais de emergência"],
    ],
  },
  metodo: {
    eyebrow: "O semáforo",
    titulo: "Três cores, uma decisão",
    imagem: "/produtos/normal-veterinario.webp",
    alt: "Mozart na consulta com o veterinário",
    rotulo: "Cor",
    passos: [
      ["Verde", "Costuma ser normal: observe em casa"],
      ["Amarelo", "Converse com o veterinário nos próximos dias"],
      ["Vermelho", "Vá agora, ligue para a clínica"],
    ],
  },
  bonus: {
    titulo: "Para ter à mão",
    itens: [
      { imagem: "/produtos/normal-pag4.webp", titulo: "Sinais de emergência", texto: "Uma página para guardar, com o espaço para o telefone da clínica 24 horas." },
      { icone: "📋", titulo: "Diário de sintomas", texto: "Para anotar desde quando, quantas vezes e o que você fez, e levar à consulta." },
      { icone: "📞", titulo: "O que contar ao veterinário", texto: "Em cada página, o que dizer quando ligar para a clínica." },
    ],
  },
  paraQuem: {
    sim: [
      "Você vive na dúvida se é normal ou se leva ao veterinário",
      "Você tem cão, gato ou os dois",
      "Você quer parar de pesquisar sintoma na internet de madrugada",
      "Você quer saber o que fazer em casa enquanto observa",
    ],
    nao: [
      "Você procura diagnóstico ou receita de remédio",
      "Seu pet está com um sinal de emergência agora: ligue para o veterinário",
    ],
  },
  oferta: {
    itens: [
      "Guia digital de consulta rápida (46 páginas)",
      "40 dúvidas do dia a dia, uma por página",
      "Semáforo verde, amarelo e vermelho em cada caso",
      "O que fazer em casa e o que nunca fazer",
      "Página de sinais de emergência",
      "Diário de sintomas para imprimir",
    ],
  },
  garantia:
    "Leia o guia e deixe salvo no celular. Se em até 7 dias você achar que não valeu a pena, é só pedir o reembolso e você recebe 100% do valor de volta. Sem perguntas e sem burocracia.",
  faq: [
    ["O guia substitui o veterinário?", "Não. Ele ajuda a observar e a decidir quando procurar o veterinário, mas não faz diagnóstico nem indica remédio. Na dúvida, sempre fale com o profissional."],
    ["Serve para cães e gatos?", "Sim. Cada página diz se a situação é de cães, de gatos ou dos dois."],
    ["Dá para usar no celular?", "Sim. É um guia digital em PDF, com índice por assunto, para abrir no celular na hora da dúvida."],
    ["Como recebo?", "Logo depois da confirmação do pagamento você recebe o acesso no seu e-mail."],
    ["E se eu não gostar?", "Você tem 7 dias de garantia. Se não gostar, pede o reembolso e recebe 100% do valor de volta, sem perguntas."],
  ],
  ctaFinal: "Menos susto, mais segurança para decidir.",
  aviso:
    "Este guia tem caráter educativo e não substitui a consulta com um(a) médico(a)-veterinário(a). Ele não faz diagnóstico nem indica tratamento ou remédio.",
};
