import type { PaginaVendas } from "./tipos";

export const petsitter: PaginaVendas = {
  slug: "petsitter",
  item: "o manual",
  seo: {
    titulo: "Manual do Pet Sitter — o negócio de cuidar de cães e gatos na casa do tutor",
    descricao:
      "O manual completo para trabalhar como pet sitter: a visita do começo ao fim, cães e gatos na prática, sinais de alerta, remédio prescrito, chaves e segurança, MEI, contrato, preço, alta temporada, primeiros clientes e plano de carreira em 4 níveis.",
  },
  hero: {
    eyebrow: "Maestro Pet Negócios · Manual completo",
    antes: "Trabalhe no mercado pet ",
    destaque: "cuidando de quem fica em casa",
    depois: ".",
    lead: "O manual completo para trabalhar como pet sitter de cães e gatos com confiança e organização: a visita do começo ao fim, os sinais de alerta, o que você pode e não pode fazer, contrato, preço, alta temporada e um plano de carreira em 4 níveis.",
    selos: ["Acesso imediato", "Plano de carreira em 4 níveis", "Garantia de 7 dias"],
  },
  dores: {
    titulo: "Se você já cuida de pets, ou quer cuidar, e trava em alguma destas",
    frases: [
      "Cuido dos gatos das amigas quando elas viajam, mas nunca cobrei direito.",
      "Como mostrar ao tutor que eu fiquei o tempo combinado?",
      "E se o gato não comer nada enquanto o tutor está fora?",
      "Me pediram para dar remédio e eu não sei se posso.",
      "Em dezembro todo mundo me chama; em março, ninguém.",
      "Não sei o que combinar sobre as chaves da casa.",
    ],
  },
  virada: {
    imagem: "/produtos/negocios/virada-petsitter.webp",
    alt: "Página do plano de carreira em 4 níveis do Manual do Pet Sitter",
    eyebrow: "O que é real e o que é ilusão",
    titulo: "O tutor não está comprando uma visita. Está entregando a chave de casa.",
    paragrafos: [
      "**Ilusão:** é só passar lá, pôr comida e ir embora. **Real:** gatos escondem dor e doença, e alguns sinais, como esforço na caixa de areia, podem ser emergência. O manual ensina a visita completa, o que anotar a cada dia e quando avisar o tutor na hora.",
      "**Ilusão:** o movimento é igual o ano todo. **Real:** a procura sobe nas férias e nos feriados (o Sebrae-SP falou, em julho de 2026, em alta média de 60% na procura por hospedagem e cuidados domiciliares na alta temporada) e cai no resto do ano. O manual mostra como cobrar a alta temporada e montar pacotes para os meses calmos.",
      "**Ilusão:** contrato é coisa de empresa grande. **Real:** tarefas, duração, frequência e forma de confirmação combinadas por escrito, mais foto ou vídeo a cada visita, protegem você e o tutor. **Todos os modelos estão no manual.**",
    ],
  },
  recebe: {
    titulo: "Tudo o que o trabalho exige, da primeira visita ao plano de carreira",
    itens: [
      ["O mercado de verdade", "Quem contrata pet sitter e por quê, a força dos gatos (que lidam melhor com rotina e território conhecidos), a sazonalidade e o que é ilusão. Com fonte e data."],
      ["Casos reais", "Pet sitters e cat sitters do Brasil, e negócios de fora (plataforma e franquia): de quem começou por aplicativo e migrou para a carteira própria a uma pequena equipe especializada em gatos. Com fonte e QR code."],
      ["Cães e gatos na prática", "Rotina, caixa de areia, ambiente e estresse, como dar remédio prescrito, plantas perigosas e os sinais de alerta que não podem esperar."],
      ["O que você pode e não pode fazer", "Remédio só com prescrição por escrito, nunca remédio humano, o que é exclusivo do médico-veterinário e o que diz a lei de maus-tratos."],
      ["Chaves, casa e segurança", "Entrega e guarda de chaves, câmeras, condomínio, hospedagem na sua própria casa (e quando o condomínio pode proibir) e o registro de cada visita."],
      ["Regras e formalização", "MEI de cuidador de animais (CNAE 9609-2/08), a nova lei do MEI sancionada em outubro de 2026, nota fiscal, contrato, seguro e dados dos clientes."],
      ["Preço e pacotes", "Visita, pernoite, medicação, segundo pet, feriados e deslocamento, com a planilha que calcula o seu valor."],
      ["Primeiros clientes", "Amigos, vizinhos, veterinários, Google, Instagram e plataformas, com um plano de 30 dias e mensagens prontas para copiar e colar."],
      ["A visita na prática", "A visita de reconhecimento, a visita padrão, o relatório para o tutor e o que fazer quando algo dá errado."],
    ],
    paginas: [
      ["/produtos/negocios/petsitter-pag4.webp", "O sumário do manual."],
      ["/produtos/negocios/petsitter-pag98.webp", "O relatório da visita, para imprimir."],
    ],
  },
  conta: {
    periodo: "mes",
    lead: "Escolha um degrau e veja a conta. Os números vêm do plano de carreira do manual, e você pode trocar pelos seus.",
    rotulos: { quantidade: "Visitas no mês", preco: "Preço médio da visita", custoMes: "Custos do mês (MEI, celular, transporte e reposição)" },
    unidade: ["visita", "visitas"],
    degraus: [
      { nome: "Começando", quantidade: 24, preco: 60, custoMes: 466, origem: "O “mês calmo” do manual: 24 visitas de 1 hora a R$ 60 (p. 10)." },
      { nome: "Profissional", quantidade: 40, preco: 67, custoMes: 466, origem: "O “mês com feriado”: 24 visitas a R$ 60 e 16 a R$ 78, com o acréscimo de feriado (p. 10). Dá R$ 67 em média." },
      { nome: "Negócio", quantidade: 88, preco: 36, custoMes: 466, origem: "4 clientes no pacote “remédio do almoço”, R$ 792 por mês cada (nível 3, p. 84, e p. 64): 22 visitas de 30 min, R$ 36 cada." },
    ],
    nota: "Custos do mês: R$ 466 (p. 61).",
  },
  metodo: {
    eyebrow: "O plano de carreira",
    titulo: "Das primeiras visitas à sua própria equipe, em 4 níveis",
    rotulo: "Nível",
    passos: [
      ["Começando", "Primeiros clientes, visita padrão e registro de cada atendimento"],
      ["Profissional", "Agenda organizada, preço por serviço, MEI, contrato e marca"],
      ["Negócio", "Pacotes, alta temporada, especialização (como só gatos) e ajudante"],
      ["Empresa", "Equipe, novos bairros, serviços extras e produto próprio"],
    ],
  },
  bonus: {
    titulo: "As ferramentas que vêm com o manual",
    itens: [
      { icone: "FileText", titulo: "Contrato-modelo para adaptar", texto: "Tarefas, duração, frequência, confirmação da visita, chaves, emergência veterinária e cancelamento. Para revisar com um advogado." },
      { icone: "ClipboardList", titulo: "Ficha do pet e da casa", texto: "O que o tutor deixa para você: rotina, comida, remédios, temperamento, esconderijos, caixa de transporte e contatos." },
      { icone: "ListChecks", titulo: "Relatório da visita e checklist", texto: "O que foi feito, quanto comeu, caixa de areia, remédio e observações, para enviar ao tutor com foto ou vídeo." },
      { icone: "Calculator", titulo: "Planilha de preço e agenda", texto: "Em Google Planilhas e Excel: preço por serviço, alta temporada, agenda e recebimentos." },
    ],
  },
  paraQuem: {
    sim: [
      "Você já cuida dos pets de amigos e família e quer profissionalizar",
      "Você gosta especialmente de gatos ou quer se especializar",
      "Você quer uma renda que caiba na sua rotina, com visitas no seu bairro",
      "Você topa seguir protocolo, registrar cada visita e responder rápido ao tutor",
    ],
    nao: [
      "Você procura dinheiro rápido ou garantido",
      "Você quer fazer o que é do veterinário, como medicar sem prescrição",
    ],
  },
  oferta: {
    itens: [
      "Manual completo do pet sitter, para cães e gatos",
      "A visita do começo ao fim e os sinais de alerta",
      "O que você pode e não pode fazer, com as fontes",
      "Chaves, casa, condomínio e segurança",
      "MEI, nota fiscal, contrato e seguro",
      "Preço, pacotes, alta temporada e planilha (Google Planilhas e Excel)",
      "Plano de 30 dias e mensagens prontas para os primeiros clientes",
      "Contrato, ficha do pet e da casa, relatório e checklist",
      "Plano de carreira em 4 níveis e casos reais com QR code",
    ],
    complemento:
      "o Manual do Passeador de Cães, que completa este com o passeio, e o Feed Pronto Pet Sitter, com 60 posts editáveis no Canva para divulgar o seu serviço (opcionais, vendidos à parte).",
  },
  garantia:
    "Leia o manual, use as ferramentas e comece o plano. Se em até 7 dias você achar que não valeu a pena, é só pedir o reembolso e você recebe 100% do valor de volta. Sem perguntas e sem burocracia.",
  faq: [
    ["Funciona para iniciante?", "Sim. Muitos dos casos pesquisados começaram cuidando dos pets de amigos, e o nível 1 do plano parte daí. Se você já atende, vá direto para preço, contrato e carreira."],
    ["Preciso de CNPJ?", "Para começar, não necessariamente. Há ocupação no MEI, “Cuidador(a) de animais (pet sitter) independente”, CNAE 9609-2/08. O manual explica a lei do MEI de outubro de 2026."],
    ["O manual garante renda?", "Não. Nenhum manual pode garantir clientes ou renda. O manual entrega o caminho, as ferramentas e contas de exemplo, sempre marcadas como exemplo."],
    ["Posso dar remédio para o pet do cliente?", "Só o que o veterinário prescreveu, por escrito, com dose e horário, e com autorização do tutor. Nunca remédio humano: o paracetamol é muito tóxico para gatos."],
    ["Quanto cobra um pet sitter?", "Varia por cidade e serviço. O Serasa publicou em dezembro de 2025 de R$ 40 a R$ 150 por visita de 45 a 60 min. O manual reúne outras fontes, com data, e a planilha."],
    ["Serve só para gatos?", "Não, serve para cães e gatos. Os gatos têm atenção especial porque lidam melhor com a rotina em casa, o que faz deles um público forte do pet sitter."],
    ["Ele complementa o Manual do Passeador de Cães?", "Sim. Cada manual é completo sozinho; juntos, cobrem o cuidado em casa e o passeio, com contratos e fichas para cada serviço."],
    ["Quem escreveu o manual?", "A equipe Maestro Pet, com fontes oficiais (Planalto, gov.br, Conselho Federal de Medicina Veterinária, Manual Veterinário MSD) e de mercado, listadas com link e data."],
    ["Por que os casos reais não têm foto?", "Porque as imagens pertencem a cada profissional. Em vez de usar foto sem autorização, cada caso traz um QR code que abre o perfil de verdade."],
    ["Como recebo?", "Logo depois da confirmação do pagamento você recebe o acesso no seu e-mail: o manual em PDF, a planilha (Google Planilhas e Excel) e os materiais para imprimir e editar."],
    ["E se não for para mim?", "Você tem 7 dias de garantia. Se achar que não valeu a pena, pede o reembolso e recebe 100% do valor de volta."],
  ],
  ctaFinal: "Quem viaja quer deixar a chave com alguém organizado. Seja essa pessoa.",
  aviso:
    "Este manual tem caráter educativo e não garante clientes ou renda. As contas apresentadas são exemplos. Preços e dados de mercado têm fonte e data e podem ter mudado. O conteúdo sobre saúde não substitui a orientação do médico-veterinário. Contratos e termos são modelos para adaptar com um advogado. Regras de condomínio e da prefeitura variam: confira as da sua cidade.",
};
