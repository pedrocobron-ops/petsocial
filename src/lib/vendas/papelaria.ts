import type { PaginaVendas } from "./tipos";

export const papelaria: PaginaVendas = {
  slug: "papelaria",
  seo: {
    titulo: "Kit Papelaria do Pet — 6 kits para imprimir num pacote só",
    descricao:
      "Carteira de vacinação + guia, RG e certidão, álbum do primeiro ano, calendário 2027, ficha de cuidados e checklists de viagem: os 6 kits para imprimir da Maestro Pet por R$ 24,90.",
  },
  hero: {
    eyebrow: "6 kits para imprimir · cães e gatos",
    antes: "Tudo do seu pet ",
    destaque: "organizado e impresso",
    depois: ".",
    lead: "A carteira de vacinação, o RG, o álbum do primeiro ano, o calendário de 2027, a ficha para quem cuida dele e os checklists de viagem. Seis kits para imprimir, num pacote só.",
    selos: ["Acesso imediato", "6 kits", "Garantia de 7 dias"],
  },
  dores: {
    titulo: "Para quem quer tudo do pet no lugar",
    frases: [
      "A carteirinha de vacina está rasgada e perdida.",
      "Nunca lembro a data do vermífugo e do antipulgas.",
      "Tenho mil fotos dele e nenhuma impressa.",
      "Toda viagem é a mesma correria para explicar a rotina dele.",
      "Sempre esqueço alguma coisa na mala do pet.",
      "Queria uma lembrança bonita do dia em que ele chegou.",
    ],
  },
  virada: {
    imagem: "/produtos/papelaria-kits.webp",
    alt: "As capas dos 6 kits para imprimir",
    eyebrow: "Seis kits, um preço",
    titulo: "Tudo o que dá para imprimir, num pacote só.",
    paragrafos: [
      "São os **6 kits para imprimir** da Maestro Pet: saúde, documentos, memórias, rotina do ano, cuidados e viagem. Separados, custam **R$ 54,40**. No pacote, saem por **R$ 24,90**.",
      "Imprima em casa ou na gráfica, **quantas vezes quiser**, para todos os pets da casa.",
    ],
  },
  recebe: {
    titulo: "Os 6 kits",
    itens: [
      ["Kit Saúde do Pet", "A carteira de vacinação para imprimir, com espaço para o veterinário, e o guia de vacinas, vermífugo e antipulgas."],
      ["RG e Certidão do Pet", "O RG para plastificar, a certidão de nascimento e a certidão de adoção."],
      ["Álbum do Primeiro Ano", "As fotos, as primeiras vezes e o mês a mês do primeiro ano juntos."],
      ["Calendário 2027 do Pet", "O calendário de parede com a foto dele em cada mês e a saúde do mês."],
      ["Quem Fica com o Pet", "A ficha completa para quem cuida dele quando você viaja."],
      ["Mala do Pet", "Os checklists para viajar com ele sem esquecer nada."],
    ],
    paginas: [
      ["/produtos/saude-carteira-vacina.webp", "A carteira de vacinação"],
      ["/produtos/album-pag9.webp", "O álbum mês a mês"],
    ],
  },
  metodo: {
    eyebrow: "Como usar",
    titulo: "Um kit para cada momento",
    imagem: "/produtos/rg-pag6.webp",
    alt: "O RG do Mozart preenchido",
    rotulo: "Kit",
    passos: [
      ["Saúde", "Carteira na próxima vacina"],
      ["Documentos", "RG e certidão para guardar"],
      ["Memórias", "Álbum e calendário com as fotos dele"],
      ["Viagens", "Ficha de cuidados e checklists"],
    ],
  },
  bonus: {
    titulo: "Por que vale o pacote",
    itens: [
      { icone: "💰", titulo: "Mais da metade de desconto", texto: "R$ 54,40 separados, R$ 24,90 no pacote." },
      { icone: "🖨️", titulo: "Imprima quantas vezes quiser", texto: "Para todos os pets da casa, sem pagar de novo." },
      { icone: "🎁", titulo: "Presente pronto", texto: "Para quem acabou de adotar ou de ganhar um filhote." },
    ],
  },
  paraQuem: {
    sim: [
      "Você tem cão, gato ou os dois",
      "Você gosta de ter tudo organizado e impresso",
      "Você acabou de adotar ou ganhou um filhote",
      "Você quer presentear quem ama pets",
    ],
    nao: [
      "Você quer os kits já impressos: eles são para imprimir",
      "Você procura um guia de adestramento: veja os nossos guias",
    ],
  },
  oferta: {
    itens: [
      "Kit Saúde do Pet (carteira de vacinação + guia)",
      "RG e Certidão do Pet",
      "Álbum do Primeiro Ano",
      "Calendário 2027 do Pet",
      "Quem Fica com o Pet",
      "Mala do Pet",
    ],
  },
  garantia:
    "Imprima os kits e use. Se em até 7 dias você achar que não valeu a pena, é só pedir o reembolso e você recebe 100% do valor de volta. Sem perguntas e sem burocracia.",
  faq: [
    ["A carteira de vacinação vale como documento?", "Sim. O que dá valor de documento é o registro do veterinário em cada vacina: etiqueta, data, carimbo com o CRMV e assinatura. A carteira tem todos esses campos."],
    ["O RG é oficial?", "Não. O RG e as certidões são documentos de lembrança. O cadastro oficial e gratuito é o SinPatinhas, e o kit ensina a fazer."],
    ["Serve para gato?", "Sim. Todos os kits servem para cães e gatos."],
    ["Como recebo?", "Logo depois da confirmação do pagamento você recebe o acesso no seu e-mail, com os 6 kits em PDF."],
  ],
  ctaFinal: "Tudo do seu pet, organizado e impresso.",
  aviso:
    "Os kits têm caráter educativo e de organização e não substituem o veterinário. O RG e as certidões são documentos de lembrança, sem valor legal.",
};
