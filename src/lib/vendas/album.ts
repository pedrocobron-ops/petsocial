import type { PaginaVendas } from "./tipos";

export const album: PaginaVendas = {
  slug: "album",
  item: "o álbum",
  seo: {
    titulo: "Álbum do Primeiro Ano do Pet — para imprimir",
    descricao:
      "O álbum para imprimir do primeiro ano com o seu filhote ou pet adotado: primeiras vezes, uma página por mês com foto e peso, carimbo da patinha, primeiro aniversário e cartões de marco para as fotos.",
  },
  hero: {
    eyebrow: "Álbum para imprimir · 26 páginas",
    antes: "O primeiro ano ",
    destaque: "passa rápido demais",
    depois: ".",
    lead: "No começo ele cabe no colo. Doze meses depois, ocupa metade do sofá. Guarde cada fase: as fotos, as primeiras vezes e as travessuras, mês a mês.",
    selos: ["Acesso imediato", "12 meses de fotos", "Garantia de 7 dias"],
  },
  dores: {
    titulo: "Se você já pensou alguma destas coisas",
    frases: [
      "Tenho mil fotos no celular e nenhuma impressa.",
      "Ele cresceu tão rápido que já nem lembro de como era pequeno.",
      "Queria ter anotado o dia do primeiro passeio.",
      "Adotei e quero guardar o nosso primeiro ano juntos.",
      "Quero uma lembrança que dure mais que o celular.",
      "Quero fazer aquelas fotos de mês a mês que todo mundo posta.",
    ],
  },
  virada: {
    imagem: "/produtos/album-chegada.webp",
    alt: "Tutora chegando em casa com o Mozart filhote no colo",
    eyebrow: "Uma lembrança de verdade",
    titulo: "As fotos do celular se perdem. O álbum fica.",
    paragrafos: [
      "O álbum tem espaço para **as fotos e para as histórias**: o dia da chegada, a primeira noite, o primeiro banho, a primeira travessura. Coisas que a gente acha que nunca vai esquecer, e esquece.",
      "E vem com **cartões de marco**: todo mês, você coloca o cartão ao lado dele e tira a foto. No fim do ano, a sequência mostra o quanto ele cresceu.",
    ],
  },
  recebe: {
    titulo: "Um ano inteiro, página por página",
    itens: [
      ["A chegada e a família", "O dia em que ele chegou, a primeira noite e quem é quem na família."],
      ["Carimbo da patinha", "Quando chegou e com 1 ano, lado a lado, para comparar."],
      ["12 primeiras vezes", "Banho, vacina, passeio, primeiro amigo, primeira travessura e mais."],
      ["12 páginas mês a mês", "Foto grande, peso, altura, o que aprendeu e a travessura do mês."],
      ["Crescimento e aniversário", "Tabela e gráfico de peso, e a página do primeiro aniversário."],
      ["Cartões de marco", "1 mês, 2 meses... \"Cheguei!\", \"Primeira vacina\": para recortar e fotografar."],
    ],
    paginas: [
      ["/produtos/album-pag9.webp", "Uma página do mês a mês"],
      ["/produtos/album-pag25.webp", "Os cartões de marco"],
    ],
  },
  metodo: {
    eyebrow: "Como usar",
    titulo: "Um pouco por mês",
    imagem: "/produtos/capa-album.webp",
    alt: "Capa do Álbum do Primeiro Ano",
    rotulo: "Passo",
    passos: [
      ["Imprima", "Tudo de uma vez ou uma página por mês"],
      ["Fotografe", "Com o cartão do mês, sempre no mesmo lugar"],
      ["Cole e escreva", "A foto, o peso e a história do mês"],
      ["Encaderne", "No fim do ano, na papelaria"],
    ],
  },
  bonus: {
    titulo: "Também no álbum",
    itens: [
      { imagem: "/produtos/album-pag7.webp", titulo: "As primeiras vezes", texto: "Doze momentos com data, lugar e como foi." },
      { icone: "💌", titulo: "Uma carta para ele", texto: "A página para escrever o que esse primeiro ano significou." },
      { icone: "🎂", titulo: "O primeiro aniversário", texto: "Foto da festa, quem veio, o bolo e o presente." },
    ],
  },
  paraQuem: {
    sim: [
      "Você tem um filhote chegando ou que acabou de chegar",
      "Você adotou um pet adulto: o \"mês 1\" é o primeiro mês juntos",
      "Você quer uma lembrança impressa, que dure",
      "Você quer presentear quem acabou de ganhar um pet",
    ],
    nao: [
      "Você quer um álbum já impresso e encadernado: este é para imprimir",
      "Você não pretende imprimir as fotos",
    ],
  },
  oferta: {
    itens: [
      "Álbum de 26 páginas para imprimir",
      "Chegada, família e carimbo da patinha",
      "12 primeiras vezes",
      "12 páginas mês a mês",
      "Gráfico de crescimento e primeiro aniversário",
      "Cartões de marco para as fotos mês a mês",
    ],
  },
  garantia:
    "Imprima e comece o álbum. Se em até 7 dias você achar que não valeu a pena, é só pedir o reembolso e você recebe 100% do valor de volta. Sem perguntas e sem burocracia.",
  faq: [
    ["Serve para pet adotado adulto?", "Sim. O \"mês 1\" é o primeiro mês dele com vocês. O primeiro ano juntos merece ser lembrado do mesmo jeito."],
    ["Serve para gato?", "Sim. O álbum é para cães e gatos."],
    ["Como coloco as fotos?", "Revele em 10x15 ou imprima em casa e cole com fita dupla face ou cola bastão. No fim, a papelaria encaderna em espiral."],
    ["Preciso imprimir tudo de uma vez?", "Não. Dá para imprimir uma página por mês, conforme as fotos forem chegando."],
    ["Como recebo?", "Logo depois da confirmação do pagamento você recebe o acesso no seu e-mail, com o álbum em PDF."],
  ],
  ctaFinal: "O primeiro de muitos anos juntos.",
  aviso: "Use tinta atóxica e lavável no carimbo da patinha e limpe a pata logo depois.",
};
