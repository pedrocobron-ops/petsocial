/**
 * Manual do Maestro Pet Gestão, em dados. É a única fonte:
 * - da tela Manual (/gestao/app/manual),
 * - do botão "Como usar esta tela" (os tópicos da rota aberta),
 * - das respostas da Ajuda (`resposta` sai dos passos; veja ajuda.ts).
 * Mudou uma tela ou o nome de um botão? Atualize o tópico aqui.
 *
 * Regras de escrita: cada passo é uma ação só, com o nome do botão igual ao da tela. Quem lê não é bom de computador.
 */

export const SECOES = [
  { id: "primeiros", titulo: "Primeiros passos", apoio: "Entrar, se achar no sistema e pedir ajuda." },
  { id: "agenda", titulo: "Agenda", apoio: "Marcar, remarcar e acompanhar os horários de banho e tosa." },
  { id: "clientes", titulo: "Clientes e pets", apoio: "Fichas, tutores, saúde e planilhas." },
  { id: "creche", titulo: "Creche e hotel", apoio: "Reservas, check-in, check-out e vagas." },
  { id: "dinheiro", titulo: "Dinheiro", apoio: "Receber, caixa, contas e relatórios." },
  { id: "estoque", titulo: "Estoque e pacotes", apoio: "Produtos, venda no balcão e pacotes de banho." },
  { id: "equipe", titulo: "Equipe", apoio: "Quem trabalha com você e o que cada um abre." },
  { id: "divulgacao", titulo: "Divulgação e relacionamento", apoio: "Link do cliente, lembretes e clientes de volta." },
  { id: "ajustes", titulo: "Ajustes e conta", apoio: "Preços, horário, cópia de segurança e assinatura." },
] as const;

export type SecaoId = (typeof SECOES)[number]["id"];
/** Quem consegue fazer: qualquer pessoa da equipe, quem tem área de dinheiro liberada, ou só o dono e os sócios. */
export type Quem = "todos" | "financeiro" | "dono";
export const QUEM: Record<Quem, { rotulo: string; tom: "verde" | "azul" | "laranja" }> = {
  todos: { rotulo: "Todos", tom: "verde" },
  financeiro: { rotulo: "Quem vê o financeiro", tom: "azul" },
  dono: { rotulo: "Só o dono", tom: "laranja" },
};

type TopicoBase = {
  id: string;
  /** Escrito como tarefa: "Como marcar um horário". */
  titulo: string;
  secao: SecaoId;
  quem: Quem;
  /** Tela onde se faz (o botão "Abrir esta tela" leva para cá). null = fora do menu (tela de entrada, navegador). */
  rota: string | null;
  /** Outras telas em que o tópico também aparece no botão "Como usar esta tela". */
  tambem?: string[];
  /** Uma ação por passo, na ordem. */
  passos: string[];
  dicas?: string[];
  atencao?: string[];
  /** Palavras da busca, sem acento. */
  palavras: string[];
};
export type Topico = TopicoBase & { /** Texto corrido que a Ajuda responde: os passos numerados e os avisos. */ resposta: string };

const HOJE = "/gestao/app";
const AGENDA = "/gestao/app/agenda";
const CLIENTES = "/gestao/app/clientes";
const CRECHE = "/gestao/app/creche-hotel";
const PACOTES = "/gestao/app/pacotes";
const CAIXA = "/gestao/app/caixa";
const FINANCEIRO = "/gestao/app/financeiro";
const RELATORIOS = "/gestao/app/relatorios";
const ESTOQUE = "/gestao/app/estoque";
const EQUIPE = "/gestao/app/equipe";
const PETSHOP = "/gestao/app/meu-petshop";
const ASSINATURA = "/gestao/app/assinatura";
const ESCOLA = "/gestao/app/escola";
export const ROTA_MANUAL = "/gestao/app/manual";

const BASE: TopicoBase[] = [
  /* ---------- Primeiros passos ---------- */
  { id: "guia", titulo: "Como é o primeiro acesso", secao: "primeiros", quem: "dono", rota: HOJE,
    passos: [
      "Entre com o e-mail e a senha da conta que você criou.",
      "Na primeira vez, o sistema pergunta o que o seu negócio faz e monta o menu só com o que você usa.",
      "Responda uma pergunta de cada vez. Dá para deixar para depois.",
      "Quando terminar, você cai na tela Hoje, pronta para usar.",
    ],
    dicas: ["Tudo o que você respondeu pode ser mudado depois em Meu pet shop.", "Na tela Hoje, o cartão Primeiros passos mostra o que falta fazer. Um toque leva direto ao lugar."],
    palavras: ["guia", "configurar", "configuracao", "primeiro acesso", "primeira vez", "comecar", "primeiros passos", "por onde comeco"] },
  { id: "tela-hoje", titulo: "Como ler a tela Hoje", secao: "primeiros", quem: "todos", rota: HOJE,
    passos: [
      "Abra Hoje: é a primeira tela do sistema.",
      "No alto fica o resumo do dia, com o próximo atendimento.",
      "Em Agenda de hoje, toque em um horário para abrir, concluir ou remarcar.",
      "Em Pede a sua atenção, toque em cada linha para resolver: lembretes de amanhã, clientes sumidos, aniversários, produto acabando e contas vencendo.",
      "Para marcar, toque em Marcar horário, o botão laranja.",
    ],
    dicas: ["Valores em dinheiro só aparecem para quem vê o financeiro.", "Pedidos que chegaram pelo link de agendamento aparecem em destaque, com Aceitar e Recusar."],
    palavras: ["hoje", "tela inicial", "inicio", "resumo do dia", "pede a sua atencao", "painel"] },
  { id: "menu", titulo: "Como achar as telas no menu", secao: "primeiros", quem: "todos", rota: HOJE,
    passos: [
      "No celular, use a barra de baixo: Hoje, Agenda, o microfone do Mozart, Clientes e Mais.",
      "Toque em Mais para ver as outras telas: Creche e hotel, Pacotes, Caixa, Financeiro, Estoque e as demais.",
      "No computador, o menu fica na lateral esquerda, sempre aberto.",
      "Para achar um pet ou tutor de qualquer tela, toque na lupa no alto e escreva o nome ou o telefone.",
    ],
    dicas: ["O menu mostra só as telas que o dono liberou para você.", "Em cada tela, o botão Como usar esta tela, no alto, mostra o passo a passo daquela tela."],
    palavras: ["menu", "onde fica", "nao acho", "mais", "telas", "navegar", "lupa", "buscar", "busca"] },
  { id: "mozart", titulo: "Como usar o Mozart, o assistente", secao: "primeiros", quem: "todos", rota: HOJE,
    passos: [
      "Toque no botão do Mozart: no celular é o microfone no meio da barra de baixo; no computador fica no canto de baixo.",
      "Fale no microfone ou escreva o que você quer, do seu jeito.",
      "Para consultar, pergunte: \"que horários tenho livres amanhã?\", \"quem não vem há mais de um mês?\", \"quanto entrou essa semana?\".",
      "Para ele fazer, peça: \"marca banho da Mel sexta às 10h\", \"recebi 60 no Pix do banho do Thor\", \"entrou 10 sacos de ração a 140 cada\".",
      "Antes de gravar, ele mostra um cartão com o que vai fazer. Confira e toque em Pode fazer. Se não for isso, toque em Agora não.",
    ],
    dicas: [
      "Ele também cadastra pet, bloqueia horário, faz check-in e check-out, vende e usa pacote, anota vacina, abre e fecha o caixa e prepara mensagens de WhatsApp.",
      "Perguntas sobre dinheiro só funcionam para quem vê o financeiro.",
      "Se o microfone não funcionar, libere a permissão no navegador ou use o microfone do teclado.",
    ],
    palavras: ["mozart", "assistente", "voz", "audio", "microfone", "falar", "ditado", "ia", "inteligencia artificial", "o que posso pedir"] },
  { id: "ajuda", titulo: "Como achar ajuda e este manual", secao: "primeiros", quem: "todos", rota: ROTA_MANUAL,
    passos: [
      "Em qualquer tela, toque em Como usar esta tela, no alto: abre o passo a passo daquela tela.",
      "Para ver tudo, abra o menu e toque em Manual, na parte Aprender.",
      "No Manual, escreva na busca o que você quer fazer, como \"receber\" ou \"vacina\".",
      "Não achou? Toque em Ajuda, no menu, e escreva a sua dúvida.",
      "Se a Ajuda não resolver, ela mostra o botão Abrir o WhatsApp para falar com a nossa equipe.",
    ],
    dicas: ["No Manual, o botão Imprimir coloca todos os tópicos no papel ou em PDF."],
    palavras: ["ajuda", "manual", "duvida", "suporte", "tutorial", "passo a passo", "falar com alguem", "atendimento"] },
  { id: "instalar", titulo: "Como instalar no celular ou no computador", secao: "primeiros", quem: "todos", rota: null,
    passos: [
      "No Android, abra o sistema no Chrome, toque nos três pontinhos e em Instalar aplicativo.",
      "No iPhone, abra no Safari, toque em Compartilhar e em Adicionar à Tela de Início.",
      "No computador, abra no Chrome ou no Edge e clique no ícone de instalar, no canto direito da barra de endereço.",
    ],
    dicas: ["Não precisa de loja de aplicativos. Depois de instalado, o sistema abre pelo ícone, como qualquer aplicativo."],
    palavras: ["instalar", "aplicativo", "app", "baixar", "tela inicial", "atalho", "celular", "desktop", "icone"] },
  { id: "senha", titulo: "Como trocar ou recuperar a senha", secao: "primeiros", quem: "todos", rota: null,
    passos: [
      "Na tela de entrada, toque em Esqueci a senha.",
      "Escreva o e-mail da sua conta e toque em Enviar link.",
      "Abra o e-mail que chegou e toque no link.",
      "Escreva a senha nova, com pelo menos 8 letras ou números, e toque em Salvar e entrar.",
    ],
    dicas: ["O e-mail pode cair na caixa de spam. Se não chegar em alguns minutos, fale com a nossa equipe pela Ajuda."],
    palavras: ["senha", "esqueci", "recuperar", "nao consigo entrar", "trocar senha", "email de confirmacao", "entrar", "login"] },
  { id: "consulta", titulo: "Por que a conta ficou só para consulta", secao: "primeiros", quem: "todos", rota: ASSINATURA,
    passos: [
      "Quando o teste grátis termina ou a assinatura fica inativa, aparece um aviso vermelho no alto.",
      "Nesse estado você continua vendo tudo o que lançou, mas não consegue marcar, lançar nem alterar.",
      "O dono toca em Ver assinatura, no aviso, e escolhe um plano.",
      "Depois de assinar, o sistema volta a funcionar com os mesmos dados.",
    ],
    dicas: ["Os dados continuam guardados. Quem não é dono precisa pedir ao dono para resolver."],
    palavras: ["so para consulta", "nao consigo marcar", "nao deixa salvar", "bloqueado", "teste terminou", "teste acabou", "inativa", "travou"] },

  /* ---------- Agenda ---------- */
  { id: "marcar", titulo: "Como marcar um horário", secao: "agenda", quem: "todos", rota: AGENDA, tambem: [HOJE],
    passos: [
      "Toque em Marcar horário, o botão laranja na tela Hoje ou na Agenda.",
      "Escolha o pet. Se ele ainda não tem ficha, toque em Cadastrar pet novo.",
      "Escolha o serviço e quem atende.",
      "Escolha o dia e toque em um dos horários livres.",
      "Confira o valor. Se quiser, marque Leva e traz e escreva uma observação.",
      "Toque em Marcar.",
    ],
    dicas: ["Se o horário estiver ocupado, bloqueado ou fora do funcionamento, o sistema avisa e pergunta se é para marcar mesmo assim.", "Pelo Mozart: \"marca banho da Mel sexta às 10h\"."],
    palavras: ["marcar", "agendar", "agendamento", "marcar horario", "marcar um horario", "banho", "tosa", "novo horario", "encaixe"] },
  { id: "repetir", titulo: "Como marcar um horário que se repete", secao: "agenda", quem: "todos", rota: AGENDA,
    passos: [
      "Comece a marcar o horário normalmente: pet, serviço, dia e hora.",
      "No campo Repetir, escolha de quanto em quanto tempo o pet volta.",
      "Em Por quantas vezes, escolha o número de horários.",
      "Confira a lista de datas. Nas Datas com aviso, decida entre pular ou marcar mesmo assim.",
      "Toque em Marcar.",
    ],
    dicas: ["Todos os horários da série ficam com o mesmo serviço, valor e observação.", "Para desmarcar depois, o sistema pergunta se é só aquele dia ou aquele e os próximos."],
    palavras: ["repetir", "repete", "se repete", "horario que se repete", "toda semana", "quinzenal", "recorrente", "fixo", "serie", "mensalista", "cliente fixo"] },
  { id: "ver-agenda", titulo: "Como ver a agenda do dia, da semana e de cada pessoa", secao: "agenda", quem: "todos", rota: AGENDA,
    passos: [
      "Abra Agenda.",
      "Toque em um dia da semana, no alto, para ver os horários daquele dia.",
      "Use as setas para ir para a semana anterior ou a próxima. Voltar para hoje traz o dia de hoje de volta.",
      "Se mais de uma pessoa atende, toque no nome dela para ver só os horários dela. Todos mostra a agenda inteira.",
      "No computador, escolha entre Dia e Semana no alto da tela.",
    ],
    dicas: ["O Resumo do dia mostra quantos foram concluídos, quantos faltam atender e os cancelados ou faltas."],
    palavras: ["ver agenda", "ver a agenda", "agenda da semana", "agenda do dia", "agenda de alguem", "agenda de cada", "outro dia", "proxima semana"] },
  { id: "atender", titulo: "Como acompanhar o atendimento do pet", secao: "agenda", quem: "todos", rota: AGENDA, tambem: [HOJE],
    passos: [
      "Toque no horário do pet, na Agenda ou na tela Hoje.",
      "Quando o tutor confirmar que vem, toque em Cliente confirmou.",
      "Quando o pet chegar, toque em Chegou: iniciar atendimento.",
      "Em Como o pet chegou, marque o que você reparou no pet.",
      "Quando terminar, toque em Fechar a conta para receber. Quem não vê o financeiro toca em Concluir atendimento.",
    ],
    dicas: ["Ver ficha abre a ficha do pet, com alertas e histórico."],
    palavras: ["atendimento", "chegou", "iniciar", "confirmou", "confirmar", "concluir", "em atendimento", "como o pet chegou", "checklist"] },
  { id: "remarcar", titulo: "Como remarcar, desmarcar ou marcar falta", secao: "agenda", quem: "todos", rota: AGENDA, tambem: [HOJE],
    passos: [
      "Toque no horário, na Agenda ou na tela Hoje.",
      "Para mudar dia, hora, serviço ou valor, toque em Remarcar ou alterar, mude o que precisa e toque em Salvar.",
      "Se o cliente avisou que não vem, toque em Desmarcar horário.",
      "Se o cliente não apareceu, toque em Faltou.",
    ],
    dicas: ["O horário desmarcado ou com falta continua aparecendo no dia e no histórico do pet.", "Se o horário faz parte de uma série, o sistema pergunta: Desmarcar só este ou Desmarcar este e os próximos."],
    atencao: ["Atendimento já concluído só pode ser mudado ou apagado por quem cuida do financeiro."],
    palavras: ["remarcar", "remarco", "cancelar", "cancelo", "cancelou", "desmarco", "desmarcou", "cancelar horario", "cancelar um horario", "cancelar o horario", "desmarcar", "falta", "faltou", "mudar horario", "trocar horario", "editar horario", "alterar horario", "nao veio"] },
  { id: "desfazer", titulo: "Como desfazer um horário desmarcado ou uma falta", secao: "agenda", quem: "todos", rota: AGENDA,
    passos: [
      "Na Agenda, vá até o dia do horário.",
      "Toque no horário que ficou como desmarcado ou com falta. Ele continua aparecendo no dia.",
      "Toque em Voltar para marcado.",
    ],
    dicas: ["O horário volta ao normal, com o mesmo pet, serviço e hora."],
    atencao: ["Horário apagado pelo botão Apagar da agenda não volta: precisa ser marcado de novo."],
    palavras: ["desfazer", "apertei errado", "cliquei errado", "toquei errado", "sem querer", "cancelei errado", "cancelei sem querer", "como volta", "voltar para marcado", "voltar o horario", "recuperar horario", "descancelar", "reabrir", "desfazer cancelamento", "desfazer falta"] },
  { id: "apagar-horario", titulo: "Como apagar um horário da agenda", secao: "agenda", quem: "todos", rota: AGENDA,
    passos: [
      "Toque no horário.",
      "Toque em Apagar da agenda, no fim da janela.",
      "Confirme em Apagar.",
    ],
    dicas: ["Se o cliente só desmarcou, prefira Desmarcar horário: assim fica no histórico."],
    atencao: ["Se o horário já foi pago ou tem conta a receber, o sistema pergunta o que fazer com o dinheiro antes de apagar. Leia com calma."],
    palavras: ["apagar horario", "apagar um horario", "apagar o horario", "apagar da agenda", "excluir horario", "lixeira", "remover horario", "marquei errado", "horario duplicado"] },
  { id: "bloquear", titulo: "Como bloquear um horário (almoço, folga, feriado)", secao: "agenda", quem: "todos", rota: AGENDA,
    passos: [
      "Na Agenda, toque em Bloquear horário.",
      "Escolha o dia e as horas, ou marque Dia inteiro.",
      "Em Para quem, escolha Pet shop inteiro ou uma pessoa.",
      "Escolha o motivo ou escreva o seu.",
      "Se o bloqueio se repete, marque a opção de repetir e escolha por quantas semanas.",
      "Toque em Bloquear.",
    ],
    dicas: ["Para mudar ou tirar um bloqueio, toque nele na agenda. Se ele se repete, o sistema pergunta: Só este ou Este e os próximos."],
    palavras: ["bloquear", "bloqueio", "almoco", "folga", "feriado", "fechar agenda", "nao atender", "ferias", "manutencao"] },
  { id: "pronto", titulo: "Como avisar o tutor que o pet está pronto", secao: "agenda", quem: "todos", rota: AGENDA, tambem: [HOJE],
    passos: [
      "Toque no horário do pet, depois que o atendimento de hoje começou ou terminou.",
      "Toque em Avisar que está pronto.",
      "O WhatsApp abre com a mensagem escrita. Toque em enviar.",
    ],
    dicas: ["A agenda mostra a hora em que o tutor foi avisado.", "O botão só aparece se o tutor tem telefone na ficha."],
    palavras: ["pronto", "esta pronto", "buscar", "avisar tutor", "terminou", "pode buscar"] },
  { id: "fotos", titulo: "Como mandar fotos de antes e depois", secao: "agenda", quem: "todos", rota: AGENDA, tambem: [HOJE],
    passos: [
      "Toque no horário do pet.",
      "No bloco Antes e depois, toque no quadro Antes e tire ou escolha a foto.",
      "Faça o mesmo no quadro Depois.",
      "Toque em Mandar para o tutor.",
    ],
    dicas: ["No celular abre o compartilhamento com as fotos. No computador abre o WhatsApp do tutor com a mensagem.", "Para trocar uma foto, toque nela."],
    palavras: ["foto", "fotos", "antes e depois", "antes", "depois", "enviar foto", "mandar foto"] },
  { id: "imprimir", titulo: "Como imprimir a agenda ou salvar em PDF", secao: "agenda", quem: "todos", rota: AGENDA,
    passos: [
      "Na Agenda, toque em Imprimir.",
      "Escolha Dia ou Semana.",
      "Escolha Todos ou o nome de uma pessoa.",
      "Toque em Imprimir ou salvar em PDF.",
    ],
    dicas: ["Para PDF, escolha Salvar como PDF no lugar da impressora.", "Mandar no WhatsApp envia a mesma agenda em texto.", "A folha não mostra valores: serve para banhista e tosador que não têm login."],
    palavras: ["imprimir", "pdf", "impressao", "folha", "papel", "exportar agenda", "mandar agenda", "agenda impressa"] },

  /* ---------- Clientes e pets ---------- */
  { id: "pet", titulo: "Como cadastrar um pet e o tutor", secao: "clientes", quem: "todos", rota: CLIENTES,
    passos: [
      "Abra Clientes e pets e toque em Pet novo.",
      "Escreva o nome do pet.",
      "Escreva o nome do tutor. Se ele já for cliente, escolha na lista que aparece.",
      "Escreva o WhatsApp do tutor, com DDD.",
      "Escolha o porte: é ele que define o preço do banho.",
      "Se quiser, coloque foto, raça, nascimento e os Cuidados e alertas.",
      "Toque em Salvar.",
    ],
    dicas: ["Também dá para cadastrar na hora de marcar um horário, em Cadastrar pet novo.", "Com a data de nascimento anotada, o sistema lembra do aniversário do pet."],
    palavras: ["cadastrar", "cadastro", "pet novo", "cliente novo", "tutor", "adicionar pet", "foto", "novo cliente", "porte"] },
  { id: "ficha", titulo: "Como ver a ficha e o histórico do pet", secao: "clientes", quem: "todos", rota: CLIENTES,
    passos: [
      "Abra Clientes e pets.",
      "Escreva o nome do pet, do tutor ou o telefone na busca.",
      "Toque no pet.",
      "A ficha mostra os alertas, a última visita, o próximo horário, os pacotes, a saúde e o histórico de atendimentos.",
      "Para mudar os dados do pet, toque em Editar pet.",
    ],
    dicas: ["Agendar já abre a janela de marcar horário com o pet escolhido.", "WhatsApp abre a conversa com o tutor."],
    palavras: ["ficha", "historico", "ultima visita", "alerta", "alergia", "observacao", "editar pet", "dados do pet", "prontuario"] },
  { id: "telefone-tutor", titulo: "Como corrigir o telefone ou os dados do tutor", secao: "clientes", quem: "todos", rota: CLIENTES,
    passos: [
      "Abra a ficha do pet, em Clientes e pets.",
      "Toque em Editar tutor.",
      "No campo WhatsApp, escreva o DDD e o número.",
      "Toque em Salvar.",
    ],
    dicas: ["Com o número completo, os botões de WhatsApp voltam a abrir a conversa certa.", "Na mesma janela ficam o e-mail, o endereço e as observações do tutor."],
    palavras: ["telefone do tutor", "telefone do cliente", "telefone errado", "numero errado", "corrigir telefone", "mudar telefone", "trocar telefone", "editar tutor", "whatsapp do tutor", "whatsapp nao abre", "celular do cliente", "endereco do cliente"] },
  { id: "ficha-tutor", titulo: "Como ver a ficha do tutor e o que ele deve", secao: "clientes", quem: "todos", rota: CLIENTES,
    passos: [
      "Abra Clientes e pets.",
      "Em O que mostrar, toque em Tutores.",
      "Toque no tutor.",
      "A ficha mostra os pets dele e o contato. Com a fidelidade ligada, mostra também quanto falta para o prêmio.",
      "Para colocar mais um pet na mesma ficha, toque em Adicionar pet.",
    ],
    dicas: ["Quem vê o financeiro também vê quanto o tutor já gastou e o que ficou A receber.", "Tutor novo cadastra um tutor sem pet."],
    palavras: ["ficha do tutor", "tutores", "cliente deve", "quanto gastou", "pets do tutor", "tutor novo", "segundo pet", "mais um pet"] },
  { id: "saude", titulo: "Como anotar vacinas e a saúde do pet", secao: "clientes", quem: "todos", rota: CLIENTES,
    passos: [
      "Abra a ficha do pet, em Clientes e pets.",
      "No cartão Saúde, toque em Adicionar.",
      "Escolha o tipo: Vacina, Vermífugo, Antipulgas ou Outro.",
      "Escreva o nome ou toque em uma das sugestões.",
      "Coloque a data em que foi aplicada e a data da próxima dose ou do vencimento. Os atalhos, como +1 ano, preenchem a data.",
      "Toque em Salvar.",
    ],
    dicas: [
      "O cartão mostra em cores o que está em dia, vencendo e vencido.",
      "Quando o pet tomar a dose seguinte, toque em Nova dose no cuidado.",
      "Avisar o tutor abre o WhatsApp com o lembrete pronto.",
      "Na lista de clientes, o filtro Saúde vencendo mostra quem precisa de atenção.",
    ],
    atencao: ["A data da próxima dose é a que o veterinário passou. O sistema só guarda e lembra."],
    palavras: ["vacina", "vacinas", "vermifugo", "antipulgas", "saude", "carteirinha", "carteira de saude", "dose", "vencida", "antirrabica", "v10"] },
  { id: "filtros-clientes", titulo: "Como achar clientes sumidos, com alerta ou sem visita", secao: "clientes", quem: "todos", rota: CLIENTES,
    passos: [
      "Abra Clientes e pets.",
      "Toque em um dos filtros: Sumidos há 30 dias, Sumidos há 60 dias, Ainda sem visita, Com alerta ou Saúde vencendo.",
      "Toque no pet para abrir a ficha.",
      "Para voltar à lista inteira, toque em Todos.",
    ],
    dicas: ["Sumido é quem já veio (banho, tosa, creche ou hotel) e parou de vir.", "Para mandar mensagem a quem sumiu, use o botão Chamar de volta."],
    palavras: ["filtro", "sumido", "sumidos", "sem visita", "com alerta", "nunca veio", "inativo", "lista de clientes"] },
  { id: "importar", titulo: "Como trazer clientes de uma planilha", secao: "clientes", quem: "todos", rota: CLIENTES,
    passos: [
      "Abra Clientes e pets e toque em Trazer de planilha.",
      "Toque em Baixar planilha modelo para ver como os títulos das colunas devem ficar.",
      "Toque em Escolher arquivo CSV, ou copie as células no Excel ou no Google Planilhas e cole no campo.",
      "Confira as primeiras linhas que o sistema mostra.",
      "Toque em Trazer.",
    ],
    dicas: ["A planilha precisa ter uma linha de títulos, como Tutor, Telefone e Pet. Só a coluna Tutor é obrigatória.", "Nada do que já está no sistema é apagado: tutor ou pet que já existe é pulado.", "Se parar no meio, pode trazer a mesma planilha de novo: os repetidos são pulados."],
    atencao: ["Arquivo fechado do Excel não é lido direto: copie e cole as células, ou salve como CSV.", "Não feche a janela enquanto estiver trazendo."],
    palavras: ["importar", "planilha", "excel", "csv", "trazer clientes", "trazer de planilha", "migrar", "outro sistema", "lista de clientes antiga", "google planilhas"] },
  { id: "exportar-clientes", titulo: "Como baixar a lista de clientes", secao: "clientes", quem: "todos", rota: CLIENTES,
    passos: [
      "Abra Clientes e pets.",
      "Toque em Exportar.",
      "A planilha é baixada no seu aparelho.",
    ],
    dicas: ["A planilha abre no Excel e no Google Planilhas."],
    palavras: ["exportar clientes", "baixar clientes", "lista de clientes", "planilha de clientes"] },
  { id: "desativar-pet", titulo: "Como tirar um pet da lista ou excluir um cliente", secao: "clientes", quem: "todos", rota: CLIENTES,
    passos: [
      "Para tirar um pet da lista sem perder o histórico, abra a ficha dele e toque em Desativar pet.",
      "Confirme em Desativar.",
      "Se precisar dele de volta, abra a ficha e toque em Reativar.",
      "Para apagar um cliente de vez, o dono abre a ficha do tutor e toca em Excluir cliente de vez.",
    ],
    atencao: ["Excluir de vez apaga os pets, os horários, os pacotes e o histórico do cliente, e não dá para desfazer. Só o dono faz isso."],
    palavras: ["desativar", "desativar pet", "excluir cliente", "apagar cliente", "remover pet", "pet morreu", "faleceu", "reativar", "tirar da lista"] },

  /* ---------- Creche e hotel ---------- */
  { id: "creche", titulo: "Como funciona a tela Creche e hotel", secao: "creche", quem: "todos", rota: CRECHE,
    passos: [
      "Abra Creche e hotel.",
      "Os quadros do alto mostram quem está Na casa agora, quem chega hoje, quem sai hoje e as Reservas.",
      "Em Na casa agora, cada pet tem os botões Editar e Check-out.",
      "Em Reservas, cada pet tem Check-in, Editar e Cancelar.",
      "Em Histórico ficam as estadias encerradas.",
    ],
    dicas: ["Creche é para passar o dia. Hotel é para dormir.", "O botão WhatsApp no cartão do pet abre a conversa com o tutor, com uma mensagem pronta."],
    palavras: ["creche", "hotel", "hospedagem", "hospedes", "daycare", "na casa agora"] },
  { id: "creche-reserva", titulo: "Como marcar uma reserva de creche ou hotel", secao: "creche", quem: "todos", rota: CRECHE,
    passos: [
      "Em Creche e hotel, toque em Nova reserva / Check-in.",
      "Escolha o pet.",
      "Em Tipo, escolha Creche ou Hotel.",
      "Desmarque a opção Já está aqui (check-in agora): ela vem marcada.",
      "Escolha o dia e a hora da Entrada e, se souber, a Saída prevista.",
      "Confira o Valor da diária.",
      "Toque em Marcar reserva.",
    ],
    dicas: ["A diária já vem com o preço definido em Meu pet shop.", "O sistema avisa se o pet tem vacina vencida e se a casa está cheia no período."],
    palavras: ["reserva", "reservar", "marcar uma reserva", "reserva de creche", "reserva de hotel", "marcar hotel", "marcar creche", "hospedar", "diaria", "nova reserva"] },
  { id: "creche-checkin", titulo: "Como fazer o check-in", secao: "creche", quem: "todos", rota: CRECHE,
    passos: [
      "Se o pet tem reserva, abra Reservas e toque em Check-in no cartão dele.",
      "Se não tem reserva, toque em Nova reserva / Check-in e escolha o pet.",
      "Escolha Creche ou Hotel e deixe marcado Já está aqui (check-in agora).",
      "Em Observações, anote ração, remédio e o que veio na mochila.",
      "Toque em Fazer check-in.",
    ],
    dicas: ["O pet passa a aparecer em Na casa agora.", "Diária em R$ 0,00 vira cortesia: o sistema pede confirmação."],
    palavras: ["check-in", "checkin", "check in", "fazer check-in", "fazer o check-in", "check-in do hotel", "check-in da creche", "chegou na creche", "chegou no hotel", "pet chegou"] },
  { id: "creche-checkout", titulo: "Como fazer o check-out e receber a estadia", secao: "creche", quem: "todos", rota: CRECHE,
    passos: [
      "Em Creche e hotel, abra Na casa agora.",
      "Toque em Check-out no cartão do pet.",
      "Confira o número de Diárias.",
      "Se o pet tem pacote com saldo, aparece Como fica a conta: escolha Cobrar a diária ou usar o pacote.",
      "Confira o Valor a receber.",
      "Escolha Paga agora e a forma de pagamento, ou Cliente paga depois.",
      "Toque em Receber, o botão laranja.",
    ],
    dicas: ["Usando o pacote, o botão laranja vira Usar o pacote e encerrar, e nenhum dinheiro é lançado.", "Quem não vê o financeiro toca em Fazer check-out: a estadia encerra e o pagamento fica para quem cuida do financeiro."],
    palavras: ["check-out", "checkout", "check out", "fazer check-out", "fazer o check-out", "check-out do hotel", "check-out da creche", "foi embora", "encerrar estadia", "receber hotel", "receber creche", "diarias"] },
  { id: "creche-encerrar", titulo: "Como encerrar o dia da creche de uma vez", secao: "creche", quem: "todos", rota: CRECHE,
    passos: [
      "No fim do dia, em Creche e hotel, toque em Encerrar o dia da creche.",
      "Marque os pets que estão indo embora.",
      "Escolha a forma de pagamento, que vale para todos.",
      "Toque no botão laranja Encerrar, que mostra quantos pets saem e quanto você recebe.",
    ],
    dicas: ["O botão só aparece quando tem pet da creche na casa."],
    atencao: ["Se alguém vai dividir o pagamento, pagar depois ou usar pacote, desmarque esse pet e faça o check-out pelo cartão dele."],
    palavras: ["encerrar o dia", "fim do dia", "todos de uma vez", "check-out de todos", "fechar a creche"] },
  { id: "creche-editar", titulo: "Como mudar ou cancelar uma reserva ou estadia", secao: "creche", quem: "todos", rota: CRECHE,
    passos: [
      "Em Creche e hotel, ache o pet em Reservas ou em Na casa agora.",
      "Toque em Editar para mudar as datas, a diária ou as observações.",
      "Toque em Salvar.",
      "Para cancelar uma reserva, toque em Cancelar no cartão dela e confirme em Cancelar reserva.",
    ],
    palavras: ["editar reserva", "cancelar reserva", "mudar data", "mudar diaria", "estender", "mais um dia", "editar estadia"] },
  { id: "creche-preco", titulo: "Como definir a diária e as vagas da creche e do hotel", secao: "creche", quem: "dono", rota: PETSHOP, tambem: [CRECHE],
    passos: [
      "Abra Meu pet shop.",
      "Vá até o cartão Creche e hotel.",
      "Escreva a Diária da creche (por dia) e a Diária do hotel (por noite).",
      "Escreva as Vagas da creche e as Vagas do hotel. Em branco fica sem limite.",
      "Toque em Salvar creche e hotel.",
    ],
    dicas: ["A tela Creche e hotel mostra quantas vagas estão tomadas hoje.", "Quando a casa enche em algum dia do período, o sistema avisa e só passa do limite se você confirmar."],
    palavras: ["preco da diaria", "valor da diaria", "diaria da creche", "diaria do hotel", "preco da creche", "preco do hotel", "vagas da creche", "vagas do hotel", "casa cheia", "lotacao", "lotou", "quantas vagas"] },
  { id: "creche-link", titulo: "Como receber pedidos de creche e hotel pelo link", secao: "creche", quem: "todos", rota: AGENDA, tambem: [CRECHE],
    passos: [
      "Na tela Hoje, toque em Mandar link de agendamento. Na Agenda, o botão se chama Link do cliente.",
      "Em O que o cliente pode pedir pelo link, ligue Creche (passar o dia) e Hotel (dormir).",
      "Mande o link para o cliente.",
      "Quando o pedido chegar, ele aparece em Pedidos pelo link, na tela Hoje e na Agenda.",
      "Toque em Aceitar ou em Recusar.",
    ],
    dicas: ["Ao aceitar, a reserva é criada e aparece em Creche e hotel.", "Se a casa estiver cheia naquele dia, o sistema avisa antes de aceitar."],
    palavras: ["pedido de creche", "pedido de hotel", "pedidos de creche", "creche e hotel pelo link", "reserva pelo link", "cliente reservar", "reserva online", "hospedagem pelo link"] },

  /* ---------- Dinheiro ---------- */
  { id: "conta", titulo: "Como receber e fechar a conta do atendimento", secao: "dinheiro", quem: "financeiro", rota: AGENDA, tambem: [HOJE, CAIXA],
    passos: [
      "Toque no horário do pet, na Agenda ou na tela Hoje.",
      "Toque em Fechar a conta.",
      "Confira o serviço e o valor.",
      "Em Levou mais alguma coisa?, busque produtos do estoque ou toque em Outro extra.",
      "Se tiver desconto, escreva em Desconto em reais.",
      "Escolha a Forma de pagamento: Pix, Dinheiro, Débito, Crédito ou Outro.",
      "Toque em Receber, o botão laranja.",
    ],
    dicas: ["O valor entra no caixa aberto e os produtos saem do estoque. Com o caixa fechado, o valor entra só no financeiro do dia.", "Depois de receber, aparece o botão Mandar comprovante."],
    atencao: ["Só quem vê o financeiro recebe. Os outros tocam em Concluir atendimento, e o pagamento fica para depois."],
    palavras: ["receber", "pagamento", "pagar", "fechar conta", "fechar a conta", "comanda", "cobrar", "pix", "desconto", "concluir", "forma de pagamento"] },
  { id: "dividir", titulo: "Como dividir o pagamento em duas formas", secao: "dinheiro", quem: "financeiro", rota: AGENDA, tambem: [CAIXA, FINANCEIRO],
    passos: [
      "Na hora de receber, abaixo da forma de pagamento, toque em Dividir o pagamento.",
      "Na primeira parte, escolha a forma e escreva o valor.",
      "Na segunda parte, escolha a outra forma. O valor se completa sozinho com o que falta.",
      "Se forem três formas, toque em Mais uma forma.",
      "Confira o aviso Fecha certinho com o total e toque em Receber.",
    ],
    dicas: ["Exemplo: parte no Pix e parte em dinheiro.", "Para voltar atrás, toque em Pagar com uma forma só."],
    palavras: ["dividir", "dividir pagamento", "pagamento dividido", "duas formas", "metade", "parte no pix", "parte em dinheiro", "parte no cartao", "split"] },
  { id: "paga-depois", titulo: "Como anotar quando o cliente paga depois", secao: "dinheiro", quem: "financeiro", rota: AGENDA, tambem: [FINANCEIRO, PACOTES, CRECHE],
    passos: [
      "Na hora de receber (conta do atendimento, pacote ou check-out), toque em Cliente paga depois.",
      "Em Quando vai pagar, escolha o dia combinado.",
      "Toque no botão laranja, que agora diz Anotar e o valor a receber.",
    ],
    dicas: ["Nada entra no caixa agora. A conta fica em Financeiro, na aba A receber, e na ficha do tutor.", "A tela Hoje avisa quando o dia combinado chega."],
    palavras: ["paga depois", "pagar depois", "vai pagar", "paga semana que vem", "paga amanha", "fica devendo", "fiado", "pendurar", "deve", "devendo", "anotar a receber", "nao pagou", "ainda nao pagou", "cliente paga depois"] },
  { id: "dar-baixa", titulo: "Como dar baixa quando o cliente paga o que devia", secao: "dinheiro", quem: "financeiro", rota: FINANCEIRO,
    passos: [
      "Abra Financeiro e toque na aba A receber.",
      "Ache a conta do cliente.",
      "Toque em Dar baixa.",
      "Escolha como recebeu e o dia em que recebeu.",
      "Toque em Dar baixa de novo para confirmar.",
    ],
    dicas: ["O valor entra no financeiro no dia que você escolheu.", "Na aba A pagar funciona igual, para as contas que o pet shop pagou."],
    palavras: ["cliente pagou", "pagou o que devia", "recebi o fiado", "quitar", "quitou", "a receber", "pagou a conta"] },
  { id: "comprovante", titulo: "Como mandar o comprovante pelo WhatsApp", secao: "dinheiro", quem: "financeiro", rota: AGENDA,
    passos: [
      "Receba a conta do atendimento.",
      "Na janela Conta fechada, toque em Mandar comprovante.",
      "O WhatsApp abre com o comprovante escrito. Toque em enviar.",
    ],
    dicas: ["Para mandar mais tarde, abra o horário concluído na Agenda e toque em Mandar comprovante.", "O botão aparece quando o tutor tem telefone na ficha."],
    atencao: ["O comprovante não é nota fiscal."],
    palavras: ["comprovante", "recibo", "nota", "mandar comprovante", "comprovante de pagamento"] },
  { id: "caixa", titulo: "Como abrir o caixa", secao: "dinheiro", quem: "financeiro", rota: CAIXA,
    passos: [
      "Abra Caixa.",
      "Toque em Abrir o caixa.",
      "Em Troco inicial em dinheiro, escreva quanto tem na gaveta agora. Se não tem nada, deixe em branco.",
      "Toque em Abrir o caixa de novo para confirmar.",
    ],
    dicas: ["Com o caixa aberto, o que você recebe durante o dia entra nele sozinho.", "Pelo Mozart: \"abre o caixa com 100 de troco\"."],
    palavras: ["caixa", "abrir caixa", "abrir o caixa", "troco", "gaveta", "troco inicial", "comecar o dia"] },
  { id: "caixa-movimento", titulo: "Como anotar uma entrada ou uma saída no caixa", secao: "dinheiro", quem: "financeiro", rota: CAIXA,
    passos: [
      "Com o caixa aberto, toque em Entrada (dinheiro que entrou) ou em Saída (despesa paga).",
      "Escreva o valor.",
      "Escolha como recebeu ou como pagou.",
      "Escolha a categoria e, se quiser, escreva uma descrição.",
      "Toque em Lançar.",
    ],
    dicas: ["Use Saída para despesa do pet shop, como fornecedor ou motoboy.", "Venda no balcão, na mesma tela, vende produtos do estoque."],
    palavras: ["lancar no caixa", "entrada no caixa", "saida no caixa", "saida do caixa", "paguei", "avulso", "motoboy"] },
  { id: "caixa-gaveta", titulo: "Como tirar ou colocar dinheiro na gaveta (sangria e suprimento)", secao: "dinheiro", quem: "financeiro", rota: CAIXA,
    passos: [
      "Com o caixa aberto, toque em Tirar dinheiro da gaveta ou em Colocar dinheiro na gaveta.",
      "Escreva o Valor em dinheiro.",
      "Escreva para onde foi ou de onde veio.",
      "Toque em Anotar retirada ou em Anotar.",
    ],
    dicas: [
      "Tirar dinheiro da gaveta é a sangria: levou ao banco, guardou no cofre, o dono retirou.",
      "Colocar dinheiro na gaveta é o suprimento: mais troco, por exemplo.",
      "Esses movimentos não contam como venda nem como despesa. Só mudam o dinheiro esperado na gaveta.",
    ],
    atencao: ["Se o dinheiro saiu para pagar uma conta do pet shop, use o botão Saída: aí conta como despesa."],
    palavras: ["sangria", "suprimento", "tirar dinheiro", "colocar dinheiro", "retirada", "gaveta", "cofre", "levar ao banco", "mais troco", "reforco"] },
  { id: "caixa-fechar", titulo: "Como fechar o caixa", secao: "dinheiro", quem: "financeiro", rota: CAIXA,
    passos: [
      "No fim do dia, abra Caixa e toque em Fechar o caixa.",
      "Conte o dinheiro da gaveta.",
      "Escreva o valor em Quanto tem na gaveta. Pix e cartão não entram nesta conta.",
      "Toque em Fechar o caixa e confirme.",
    ],
    dicas: ["O sistema mostra se bateu certinho, se sobrou ou se faltou.", "Se quiser, escreva uma observação, como \"faltou troco\"."],
    atencao: ["Depois de fechado, os lançamentos daquele caixa não mudam mais de valor nem podem ser excluídos."],
    palavras: ["fechar caixa", "fechar o caixa", "conferir", "bateu", "sobrou", "faltou dinheiro", "quebra de caixa", "fim do dia", "fechamento"] },
  { id: "caixa-exportar", titulo: "Como ver os caixas antigos e exportar", secao: "dinheiro", quem: "financeiro", rota: CAIXA,
    passos: [
      "Abra Caixa.",
      "Para baixar a planilha do caixa aberto, toque em Exportar, no alto.",
      "Para ver um caixa antigo, desça até Caixas fechados e toque nele.",
      "Na janela do caixa, toque em Exportar para baixar a planilha.",
    ],
    dicas: ["A planilha traz o resumo do caixa e cada lançamento, com a forma de pagamento."],
    palavras: ["exportar caixa", "exportar o caixa", "caixas fechados", "caixas antigos", "caixa antigo", "caixa de ontem", "planilha do caixa", "historico do caixa"] },
  { id: "financeiro", titulo: "Como anotar contas a pagar e a receber", secao: "dinheiro", quem: "financeiro", rota: FINANCEIRO,
    passos: [
      "Abra Financeiro.",
      "Toque na aba A pagar (contas do pet shop) ou A receber (quem ficou de pagar).",
      "Toque em Nova conta.",
      "Escreva do que é, o valor e o vencimento.",
      "Se a conta vem todo mês, marque Repetir todo mês e diga por quantos meses.",
      "Toque em Anotar conta.",
    ],
    dicas: ["A tela mostra o que está em atraso, o que vence hoje e nos próximos 7 dias.", "Quando pagar ou receber, toque em Dar baixa.", "A tela Hoje avisa das contas que vencem até hoje."],
    palavras: ["financeiro", "conta a pagar", "contas", "boleto", "vencimento", "a receber", "a pagar", "aluguel", "luz", "fornecedor", "conta fixa"] },
  { id: "lancamento", titulo: "Como lançar uma entrada ou saída no Financeiro", secao: "dinheiro", quem: "financeiro", rota: FINANCEIRO,
    passos: [
      "Abra Financeiro.",
      "Toque em Novo lançamento.",
      "Escolha Entrada ou Saída.",
      "Escreva o valor e escolha o dia.",
      "Escolha como recebeu ou como pagou, e a categoria.",
      "Toque em Lançar.",
    ],
    dicas: ["Para corrigir ou excluir, abra a aba Lançamentos e toque no lançamento.", "Lançamento de um caixa já fechado não muda mais de valor."],
    palavras: ["lancamento", "lancar", "novo lancamento", "despesa", "gasto", "corrigir lancamento", "excluir lancamento", "lancei errado"] },
  { id: "resultado", titulo: "Como ver o resultado do mês e exportar", secao: "dinheiro", quem: "financeiro", rota: FINANCEIRO,
    passos: [
      "Abra Financeiro. A aba Resumo já vem aberta.",
      "Veja quanto entrou, quanto saiu e o Resultado do mês.",
      "Use as setas ao lado do mês para ver o mês anterior ou o próximo.",
      "Desça para ver como entrou (forma de pagamento), de onde veio e para onde foi.",
      "Para baixar a planilha do mês, toque em Exportar.",
    ],
    palavras: ["resultado", "resumo", "lucro", "quanto entrou", "quanto saiu", "exportar financeiro", "planilha do financeiro", "mes passado"] },
  { id: "meta", titulo: "Como definir a meta do mês", secao: "dinheiro", quem: "dono", rota: FINANCEIRO, tambem: [HOJE],
    passos: [
      "Abra Financeiro, na aba Resumo.",
      "No cartão Meta do mês, toque em Definir meta.",
      "Escreva quanto você quer que entre por mês.",
      "Toque em Salvar.",
    ],
    dicas: ["O cartão mostra quanto já entrou, quanto falta e quanto precisa entrar por dia aberto.", "O andamento também aparece na tela Hoje, para quem vê o financeiro.", "Para mudar, toque em Alterar. A meta vale para todos os meses, até você mudar."],
    palavras: ["meta", "objetivo", "meta do mes", "faturar", "definir meta", "quanto falta"] },
  { id: "relatorios", titulo: "Como ver os relatórios", secao: "dinheiro", quem: "financeiro", rota: RELATORIOS,
    passos: [
      "Abra Relatórios.",
      "Em Período, escolha Esta semana, Este mês, Mês passado ou Últimos 90 dias.",
      "Para outras datas, toque em Personalizado e escolha o dia inicial e o final.",
      "Veja os atendimentos concluídos, as faltas, o valor médio por atendimento, os clientes novos e o faturamento.",
      "Desça para ver as formas de pagamento, os dias e horários mais cheios, os serviços mais feitos e os pets e tutores que mais vieram.",
    ],
    dicas: ["Faturamento conta só o que já foi recebido.", "Embaixo de cada número aparece a comparação com o período anterior, do mesmo tamanho."],
    palavras: ["relatorio", "relatorios", "faturamento", "ticket", "ticket medio", "desempenho", "numeros", "comparar", "periodo anterior", "mes passado"] },
  { id: "relatorio-exportar", titulo: "Como exportar ou imprimir um relatório", secao: "dinheiro", quem: "financeiro", rota: RELATORIOS,
    passos: [
      "Abra Relatórios e escolha o período.",
      "Toque em Exportar para baixar os números em planilha.",
      "Ou toque em Imprimir para pôr no papel ou salvar em PDF.",
    ],
    dicas: ["A planilha traz o resumo, o período anterior, creche e hotel, serviços, comissão, formas de pagamento e tutores."],
    palavras: ["exportar relatorio", "imprimir relatorio", "planilha do relatorio", "pdf do relatorio", "mandar para o contador", "contador"] },
  { id: "relatorio-creche", titulo: "Como ver os números da creche e do hotel", secao: "dinheiro", quem: "financeiro", rota: RELATORIOS,
    passos: [
      "Abra Relatórios e escolha o período.",
      "Desça até o cartão Creche e hotel.",
      "Veja, para a creche e para o hotel, o número de estadias, de diárias e o valor cobrado.",
    ],
    dicas: ["Entram as estadias encerradas no período.", "O valor recebido das estadias já está somado no faturamento."],
    palavras: ["relatorio da creche", "relatorio do hotel", "numeros da creche e do hotel", "numeros do hotel", "numeros da creche", "diarias no mes", "estadias", "faturamento do hotel"] },
  { id: "comissao", titulo: "Como calcular a comissão da equipe", secao: "dinheiro", quem: "dono", rota: RELATORIOS, tambem: [EQUIPE],
    passos: [
      "Abra Equipe e toque no cartão da pessoa.",
      "Em Comissão, escreva a porcentagem de cada atendimento e toque em Salvar.",
      "Abra Relatórios e escolha o período.",
      "Desça até Comissão por profissional: a conta de cada um já vem pronta.",
    ],
    dicas: ["A comissão é uma parte do valor de cada atendimento que a pessoa concluiu.", "Sem porcentagem definida, a pessoa não aparece com comissão."],
    palavras: ["comissao", "porcentagem", "pagar a equipe", "comissao do banhista", "comissao do tosador", "percentual"] },

  /* ---------- Estoque e pacotes ---------- */
  { id: "estoque", titulo: "Como cadastrar um produto no estoque", secao: "estoque", quem: "todos", rota: ESTOQUE,
    passos: [
      "Abra Estoque e toque em Produto novo.",
      "Escreva o nome e, se quiser, a categoria.",
      "Escolha a unidade: un, kg, pacote, saco e outras.",
      "Escreva o Preço de venda e o Custo.",
      "Em Estoque mínimo, escreva a partir de quanto o sistema deve avisar que está acabando.",
      "Em Quanto tem hoje, escreva o que já está na prateleira.",
      "Toque em Salvar produto.",
    ],
    dicas: ["Quando o saldo chega ao mínimo, o produto aparece como acabando e a tela Hoje avisa.", "Para muitos produtos de uma vez, use Trazer de planilha."],
    palavras: ["estoque", "produto novo", "cadastrar produto", "minimo", "acabando", "inventario", "racao", "shampoo", "trazer produtos", "planilha de produtos"] },
  { id: "estoque-entrada", titulo: "Como dar entrada e saída de produto", secao: "estoque", quem: "todos", rota: ESTOQUE,
    passos: [
      "Abra Estoque e ache o produto.",
      "Quando chegar mercadoria, toque em Entrada, escreva a quantidade e toque em Anotar entrada.",
      "Quando o produto sair, toque em Saída e escreva a quantidade.",
      "Em Motivo, escolha Venda, Uso no banho ou Perda ou vencido.",
      "Toque em Anotar saída ou em Anotar venda.",
    ],
    dicas: ["Na entrada, quem vê o financeiro pode escrever o custo e marcar Lançar a compra como despesa.", "Pelo Mozart: \"entrou 10 sacos de ração a 140 cada\"."],
    palavras: ["entrada de estoque", "saida de estoque", "entrada de produto", "saida de produto", "entrada e saida de produto", "chegou mercadoria", "compra", "uso interno", "perda", "vencido", "dar entrada", "dar saida"] },
  { id: "estoque-saldo", titulo: "Como corrigir o saldo de um produto", secao: "estoque", quem: "todos", rota: ESTOQUE,
    passos: [
      "Abra Estoque e toque no nome do produto.",
      "Toque em Corrigir saldo.",
      "Escreva quanto você contou na prateleira.",
      "Toque em Corrigir.",
    ],
    dicas: ["Na mesma janela você muda o nome, o preço e o estoque mínimo, e vê os Últimos movimentos.", "Tirar este produto da lista esconde o produto e guarda o histórico."],
    palavras: ["corrigir saldo", "saldo errado", "contagem", "inventario", "editar produto", "mudar preco do produto", "tirar produto"] },
  { id: "venda", titulo: "Como vender um produto no balcão", secao: "estoque", quem: "todos", rota: ESTOQUE, tambem: [CAIXA],
    passos: [
      "Na tela Estoque, toque em Vender. Na tela Caixa, o botão se chama Venda no balcão.",
      "Busque o produto pelo nome e toque nele.",
      "Ajuste a quantidade com os botões de mais e de menos.",
      "Se quiser, toque em Dizer quem comprou e escolha o tutor.",
      "Escolha a Forma de pagamento.",
      "Toque em Receber, o botão laranja.",
    ],
    dicas: ["O dinheiro entra no caixa e o estoque baixa sozinho.", "Quem não vê o financeiro toca em Dar baixa no estoque: o dinheiro fica para quem cuida do financeiro lançar."],
    palavras: ["vender", "venda", "balcao", "produto", "racao", "shampoo", "venda no balcao", "vender produto", "petisco"] },
  { id: "pacotes-modelo", titulo: "Como criar um modelo de pacote", secao: "estoque", quem: "todos", rota: PACOTES,
    passos: [
      "Abra Pacotes e toque em Modelos de pacote.",
      "Toque em Modelo novo.",
      "Dê um nome, como \"4 banhos no mês\".",
      "Escolha o serviço, a quantidade, a validade em dias e o preço.",
      "Toque em Salvar.",
    ],
    dicas: ["O modelo é o pacote que você costuma vender. Na hora da venda é só escolher.", "Desativar tira o modelo da venda. Quem já comprou continua com o pacote."],
    palavras: ["modelo de pacote", "criar pacote", "pacote novo", "plano de banho", "mensalidade", "4 banhos"] },
  { id: "pacotes", titulo: "Como vender um pacote", secao: "estoque", quem: "todos", rota: PACOTES,
    passos: [
      "Abra Pacotes e toque em Vender pacote.",
      "Escolha o pet.",
      "Escolha o pacote. Sem modelo pronto, toque em Montar um avulso.",
      "Confira a quantidade, a validade, o preço e a data da compra.",
      "Escolha Paga agora e a forma de pagamento, ou Cliente paga depois.",
      "Toque em Receber, o botão laranja.",
    ],
    dicas: ["Pago na hora, o valor entra no caixa. Se o cliente paga depois, a conta fica em Financeiro, A receber."],
    palavras: ["pacote", "pacotes", "vender pacote", "vender um pacote", "mensalidade", "plano de banho", "pacote de banho", "mensalista"] },
  { id: "pacotes-usar", titulo: "Como usar, renovar ou encerrar um pacote", secao: "estoque", quem: "todos", rota: PACOTES,
    passos: [
      "Abra Pacotes e ache o pacote do pet em Clientes com pacote.",
      "A cada banho, toque em Usar 1.",
      "Tocou sem querer? Toque em Desfazer uso.",
      "Quando acabar, toque em Renovar para vender outro igual.",
      "Pacote que venceu ganha o botão Encerrar: toque nele para tirar o pacote da lista de ativos.",
    ],
    dicas: ["Os filtros Ativos, Vencendo em 7 dias e Encerrados ajudam a achar.", "Pacote vencido ainda pode ser usado: o sistema pede confirmação."],
    palavras: ["usar pacote", "dar baixa no pacote", "baixa no pacote", "renovar pacote", "usar 1", "renovar", "encerrar pacote", "pacote vencido", "pacote acabou", "saldo do pacote"] },

  /* ---------- Equipe ---------- */
  { id: "equipe", titulo: "Como adicionar uma pessoa na equipe", secao: "equipe", quem: "dono", rota: EQUIPE,
    passos: [
      "Abra Equipe e toque em Adicionar pessoa.",
      "Escreva o nome, escolha o que a pessoa faz e toque em Continuar.",
      "Diga se ela vai entrar no sistema. Para banhista e tosador, o comum é Não, só aparece na agenda.",
      "Toque em Continuar.",
      "Se quiser, escolha a cor, a comissão e os dias de trabalho. Esse passo pode ser pulado.",
      "Toque no botão laranja Adicionar, que vem com o nome da pessoa.",
    ],
    dicas: ["Banhista e tosador quase nunca precisam de login: você marca os horários e eles aparecem na agenda.", "Quem não tem login não ocupa acesso do plano."],
    palavras: ["equipe", "funcionario", "funcionaria", "adicionar pessoa", "banhista", "tosador", "contratar", "nova pessoa", "ajudante"] },
  { id: "equipe-login", titulo: "Como dar login e mandar o convite", secao: "equipe", quem: "dono", rota: EQUIPE,
    passos: [
      "Abra Equipe.",
      "Para pessoa nova, toque em Adicionar pessoa e, na pergunta se ela vai entrar no sistema, escolha Sim, com o próprio login.",
      "Para quem já está na equipe, toque em Dar login no cartão dela.",
      "Escreva o e-mail da pessoa.",
      "Ligue as áreas que ela pode abrir.",
      "No fim, toque em Mandar pelo WhatsApp ou em Copiar convite.",
    ],
    dicas: ["A pessoa cria a conta com esse mesmo e-mail e escolhe a própria senha.", "Convite não chegou? Toque em Reenviar no cartão da pessoa."],
    atencao: ["O e-mail precisa ser exatamente o mesmo: é assim que o sistema sabe que a pessoa é da sua equipe.", "Cada pessoa com login ocupa um acesso do plano."],
    palavras: ["login", "convite", "convidar", "acesso", "dar acesso", "senha da funcionaria", "reenviar convite", "email da pessoa", "recepcao", "socio", "gerente"] },
  { id: "permissoes", titulo: "Como escolher o que cada pessoa pode abrir", secao: "equipe", quem: "dono", rota: EQUIPE,
    passos: [
      "Abra Equipe e toque no cartão da pessoa.",
      "Desça até a parte que diz o que a pessoa abre.",
      "Ligue ou desligue cada área: Agenda, Clientes e pets, Creche e hotel, Pacotes, Estoque, Caixa, Financeiro e Relatórios.",
      "Se preferir, troque a Função, lá em cima: ela preenche as chaves com o que é comum para aquela função.",
      "Toque em Salvar.",
    ],
    dicas: ["As chaves só aparecem para quem tem login.", "Caixa, Financeiro e Relatórios são as áreas que mostram valores. Com elas desligadas, a pessoa não vê quanto entrou nem quanto saiu.", "O cartão Quem pode o quê, na tela Equipe, mostra o que cada perfil abre."],
    atencao: ["Equipe, Meu pet shop e Assinatura ficam só com os donos. Sócio abre tudo, igual a você."],
    palavras: ["permissao", "permissoes", "o que pode ver", "liberar area", "bloquear area", "esconder valores", "nao ver dinheiro", "perfil", "acessos", "area nao liberada"] },
  { id: "escala", titulo: "Como definir os dias de trabalho e a cor de cada pessoa", secao: "equipe", quem: "dono", rota: EQUIPE,
    passos: [
      "Abra Equipe e toque no cartão da pessoa.",
      "Em Agenda e comissão, escolha a Cor dela na agenda.",
      "Em Dias de trabalho, escolha Segue o horário do pet shop ou Tem dias próprios.",
      "Com dias próprios, marque Trabalha ou Folga em cada dia e as horas.",
      "Toque em Salvar.",
    ],
    dicas: ["A Escala da semana, na tela Equipe, mostra quem trabalha em cada dia."],
    palavras: ["escala", "dias de trabalho", "folga", "horario da funcionaria", "cor na agenda", "dia de folga"] },
  { id: "equipe-tirar", titulo: "Como tirar o acesso ou desativar uma pessoa", secao: "equipe", quem: "dono", rota: EQUIPE,
    passos: [
      "Abra Equipe e toque no cartão da pessoa.",
      "Para ela parar de entrar no sistema mas continuar na agenda, toque em Tirar o acesso.",
      "Para ela sair da equipe, toque em Desativar pessoa e confirme.",
    ],
    dicas: ["Tirar o acesso libera uma vaga de login no plano.", "Pessoa desativada pode voltar: toque em Reativar."],
    palavras: ["tirar acesso", "desativar pessoa", "demitir", "saiu da equipe", "remover funcionario", "bloquear funcionario", "mandou embora"] },

  /* ---------- Divulgação e relacionamento ---------- */
  { id: "link", titulo: "Como mandar o link para o cliente agendar sozinho", secao: "divulgacao", quem: "todos", rota: AGENDA, tambem: [HOJE, PETSHOP],
    passos: [
      "Na tela Hoje, toque em Mandar link de agendamento. Na Agenda, o botão se chama Link do cliente.",
      "Se o link estiver desligado, o dono toca em Ligar o link.",
      "Toque em Copiar link para colar onde quiser.",
      "Ou toque em Mandar para um cliente e escolha o pet: o WhatsApp do tutor abre com o convite.",
    ],
    dicas: ["O cliente vê só os horários livres. Nada é marcado sem você aceitar.", "Ver como o cliente vê abre a página do link.", "O recado que aparece no topo da página fica em Meu pet shop, no cartão Link de agendamento."],
    palavras: ["link", "agendamento online", "cliente agendar", "tutor agendar", "link de agendamento", "link do cliente", "agendar sozinho", "bio do instagram"] },
  { id: "pedidos-link", titulo: "Como aceitar ou recusar um pedido que veio pelo link", secao: "divulgacao", quem: "todos", rota: AGENDA, tambem: [HOJE],
    passos: [
      "Quando chega um pedido, aparece o bloco Pedidos pelo link, na tela Hoje e na Agenda.",
      "Confira o pet, o serviço, o dia e a hora.",
      "Se quiser, escolha quem atende.",
      "Toque em Aceitar ou em Recusar.",
      "Toque em Confirmar no WhatsApp para avisar o tutor. Se recusou, o botão é Sugerir outro horário.",
    ],
    dicas: ["Ao aceitar, o horário entra na agenda.", "O número ao lado de Agenda, no menu, mostra quantos pedidos esperam resposta."],
    palavras: ["pedido", "pedidos", "aceitar", "recusar", "pedido pelo link", "cliente pediu horario", "confirmar pedido"] },
  { id: "lembrete", titulo: "Como mandar lembretes pelo WhatsApp", secao: "divulgacao", quem: "todos", rota: AGENDA, tambem: [HOJE],
    passos: [
      "Na Agenda, toque na faixa Mandar os lembretes, que aparece no dia que tem lembrete faltando. Na tela Hoje, toque no aviso de lembretes de amanhã, em Pede a sua atenção.",
      "Abre a lista dos tutores que ainda não receberam.",
      "Toque em Mandar ao lado do primeiro tutor: o WhatsApp abre com a mensagem pronta.",
      "Envie a mensagem e volte para o sistema.",
      "Repita com o próximo da lista.",
    ],
    dicas: ["Para lembrar de um horário só, abra o horário e toque em Lembrete no WhatsApp.", "Tutor com mais de um horário recebe tudo em uma mensagem só."],
    atencao: ["O sistema não envia mensagem sozinho: quem aperta enviar é você.", "Tutor sem telefone na ficha não entra na lista."],
    palavras: ["lembrete", "lembretes", "confirmar", "confirmacao", "whatsapp do cliente", "mensagem", "avisar cliente", "lembrar o cliente", "zap"] },
  { id: "sumidos", titulo: "Como chamar de volta quem não vem há um tempo", secao: "divulgacao", quem: "todos", rota: CLIENTES, tambem: [HOJE],
    passos: [
      "Abra Clientes e pets e toque em Chamar de volta.",
      "Fique na aba Faz tempo que não vêm.",
      "Em Sem vir há mais de, escolha o número de dias.",
      "Toque em Chamar ao lado do tutor: o WhatsApp abre com a mensagem pronta.",
      "Envie a mensagem e volte para chamar o próximo.",
    ],
    dicas: ["Para escrever do seu jeito, toque em Mudar o texto. Onde estiver [pet] entra o nome do pet.", "Quem já foi chamado fica marcado, com a opção Chamar de novo.", "Só entra na lista quem não tem horário marcado."],
    palavras: ["sumido", "sumidos", "nao vem", "nao voltou", "nao voltaram", "chamar de volta", "recuperar cliente", "cliente parou de vir"] },
  { id: "aniversarios", titulo: "Como dar parabéns no aniversário do pet", secao: "divulgacao", quem: "todos", rota: CLIENTES, tambem: [HOJE],
    passos: [
      "Abra Clientes e pets e toque em Chamar de volta.",
      "Toque na aba Aniversário.",
      "Toque em Chamar ao lado do tutor: o WhatsApp abre com os parabéns prontos.",
      "Envie a mensagem.",
    ],
    dicas: ["Aparecem os pets que fazem aniversário nos próximos 7 dias.", "A tela Hoje avisa quando tem aniversário chegando."],
    atencao: ["Só aparece o pet que tem a data de nascimento anotada na ficha."],
    palavras: ["aniversario", "aniversarios", "parabens", "nascimento", "aniversariante"] },
  { id: "fidelidade", titulo: "Como usar o programa de fidelidade", secao: "divulgacao", quem: "dono", rota: PETSHOP, tambem: [CLIENTES],
    passos: [
      "Abra Meu pet shop e vá até o cartão Fidelidade.",
      "Escolha a cada quantos atendimentos o tutor ganha.",
      "Em Prêmio, escreva o que ele ganha, como \"um banho\".",
      "Toque em Ligar a fidelidade.",
      "Quando o tutor completar, abra a ficha dele e toque em Entregar prêmio.",
    ],
    dicas: [
      "A contagem é por tutor, soma os atendimentos concluídos de todos os pets dele e começa no dia em que você liga.",
      "O andamento aparece na ficha do tutor e na janela do horário, na Agenda.",
      "Entregou por engano? Toque em Desfazer na última entrega.",
    ],
    atencao: ["O sistema só conta e avisa. O prêmio é você quem entrega, e o valor da conta não muda sozinho."],
    palavras: ["fidelidade", "programa de fidelidade", "cartao fidelidade", "premio", "brinde", "ganha um banho", "banho gratis", "entregar premio", "pontos"] },
  { id: "dicas", titulo: "Como usar as dicas do Mozart na tela Hoje", secao: "divulgacao", quem: "todos", rota: HOJE,
    passos: [
      "Na tela Hoje, procure o bloco O Mozart reparou.",
      "Leia a dica: cliente sumido, falta sem remarcar, pacote no último uso, aniversário ou agenda fraca amanhã.",
      "Toque no botão da dica para o Mozart preparar as mensagens.",
      "Se não quiser a dica hoje, toque no X.",
    ],
    dicas: ["As dicas saem dos dados do seu pet shop. Se não há nada para avisar, o bloco não aparece."],
    palavras: ["dica", "dicas", "reparou", "sugestao", "mozart reparou"] },
  { id: "resumo-semana", titulo: "Como ver o resumo da semana", secao: "divulgacao", quem: "financeiro", rota: HOJE,
    passos: [
      "Abra a tela Hoje.",
      "Na segunda-feira, o cartão Sua semana aparece em destaque.",
      "Nos outros dias, toque em Ver o resumo da semana passada.",
      "Veja quanto entrou, os atendimentos concluídos, as faltas, os pets novos, o que há a receber e os sumidos.",
      "Toque em Copiar resumo para colar no WhatsApp ou guardar.",
    ],
    dicas: ["Cada número vem comparado com a semana anterior.", "O resumo sugere um próximo passo, com um botão que leva direto ao lugar."],
    palavras: ["resumo da semana", "sua semana", "semana passada", "como foi a semana", "resumo semanal"] },

  /* ---------- Ajustes e conta ---------- */
  { id: "petshop", titulo: "Como mudar os dados e o horário de funcionamento", secao: "ajustes", quem: "dono", rota: PETSHOP,
    passos: [
      "Abra Meu pet shop.",
      "No cartão Dados, mude o nome, o WhatsApp e a cidade e toque em Salvar dados.",
      "No cartão Horário de funcionamento, marque cada dia como Aberto ou Fechado.",
      "Escreva a hora de abrir e a de fechar de cada dia.",
      "Toque em Salvar horário.",
    ],
    dicas: ["A agenda, o link do cliente e o Mozart só oferecem horário dentro do funcionamento.", "Copiar segunda para os dias de semana preenche de terça a sexta de uma vez."],
    palavras: ["horario de funcionamento", "abre", "fecha", "meu pet shop", "nome do pet shop", "dados do pet shop", "endereco", "whatsapp do pet shop", "sabado", "domingo"] },
  { id: "preco-servico", titulo: "Como mudar o preço de um serviço", secao: "ajustes", quem: "dono", rota: PETSHOP,
    passos: [
      "Abra Meu pet shop e vá até o cartão Serviços e preços.",
      "Toque no serviço, por exemplo Banho.",
      "Em Preço por porte, mude o valor de cada porte: P (pequeno), M (médio), G (grande) e GG (gigante).",
      "Toque em Salvar.",
    ],
    dicas: ["O preço novo vale para os próximos horários que você marcar."],
    atencao: ["Os horários que já estão marcados ficam com o valor antigo. Para mudar um deles, abra o horário e toque em Remarcar ou alterar."],
    palavras: ["mudar o preco", "mudo o preco", "mudar preco", "alterar o preco", "alterar preco", "trocar o preco", "aumentar o preco", "preco do banho", "preco da tosa", "preco do servico", "valor do banho", "valor da tosa", "reajuste", "reajustar", "tabela de precos", "precos"] },
  { id: "servico-novo", titulo: "Como criar ou desativar um serviço", secao: "ajustes", quem: "dono", rota: PETSHOP,
    passos: [
      "Abra Meu pet shop e vá até o cartão Serviços e preços.",
      "Toque em Serviço novo.",
      "Escreva o nome e escolha o tipo.",
      "Diga quanto tempo leva e o preço de cada porte.",
      "Toque em Salvar.",
    ],
    dicas: ["Para tirar um serviço da agenda sem apagar o histórico, abra o serviço e desmarque Ativo.", "A duração define quanto tempo o horário ocupa na agenda."],
    palavras: ["servico novo", "criar servico", "novo servico", "hidratacao", "tosa higienica", "duracao", "desativar servico", "servicos"] },
  { id: "vagas-banho", titulo: "Como definir quantos pets são atendidos ao mesmo tempo", secao: "ajustes", quem: "dono", rota: PETSHOP,
    passos: [
      "Abra Meu pet shop.",
      "Vá até o cartão Banho e tosa: pets ao mesmo tempo.",
      "Use os botões de menos e de mais para escolher o número.",
      "Toque em Salvar.",
    ],
    dicas: ["Com 2, o mesmo horário aceita até dois pets.", "Esse número regula os horários livres da agenda, do link do cliente e do Mozart."],
    palavras: ["vagas", "ao mesmo tempo", "quantos pets", "capacidade", "dois pets no mesmo horario", "pets por horario"] },
  { id: "identidade", titulo: "Como colocar a logo e as cores do pet shop", secao: "ajustes", quem: "dono", rota: PETSHOP,
    passos: [
      "Abra Meu pet shop e vá até o cartão Identidade do pet shop.",
      "Toque em Subir a logo e escolha a imagem.",
      "Em Cores, toque em uma das combinações.",
      "Se quiser as cores da sua marca, toque em Usar as cores da minha marca e escolha a cor principal e a de destaque.",
    ],
    dicas: ["A logo e as cores aparecem no sistema, no link que o cliente recebe e na agenda impressa.", "Imagem quadrada fica melhor."],
    palavras: ["logo", "logotipo", "cor", "cores", "identidade", "marca", "personalizar", "tema"] },
  { id: "copia", titulo: "Como baixar a cópia de segurança", secao: "ajustes", quem: "dono", rota: PETSHOP,
    passos: [
      "Abra Meu pet shop e desça até o fim da tela.",
      "No cartão Cópia de segurança, toque em Baixar cópia.",
      "Espere o sistema juntar os dados. Não feche a tela.",
      "Guarde o arquivo baixado em um lugar seguro.",
    ],
    dicas: ["O arquivo traz planilhas de clientes, pets, agenda, financeiro, caixas, estoque, pacotes, creche e hotel, equipe e serviços.", "As planilhas abrem no Excel e no Google Planilhas."],
    atencao: ["É uma cópia para guardar e consultar: ainda não dá para trazer esses dados de volta para o sistema automaticamente. As fotos não entram."],
    palavras: ["copia de seguranca", "backup", "copia", "baixar dados", "guardar dados", "seguranca", "baixar tudo"] },
  { id: "dados", titulo: "Como baixar ou apagar os meus dados", secao: "ajustes", quem: "dono", rota: PETSHOP,
    passos: [
      "Para baixar tudo de uma vez, abra Meu pet shop e toque em Baixar cópia, no cartão Cópia de segurança.",
      "Para só a lista de clientes, abra Clientes e pets e toque em Exportar.",
      "Para os lançamentos de um mês, abra Financeiro e toque em Exportar.",
      "Para apagar a conta inteira, fale com a nossa equipe pela Ajuda.",
    ],
    dicas: ["Os dados que você lança são do seu pet shop."],
    palavras: ["dados", "exportar", "planilha", "lgpd", "apagar", "excluir conta", "privacidade", "meus dados"] },
  { id: "assinatura", titulo: "Como funciona o teste grátis, os planos e a assinatura", secao: "ajustes", quem: "dono", rota: ASSINATURA,
    passos: [
      "Abra Assinatura.",
      "No alto, veja a situação da conta: teste grátis, assinatura ativa ou pagamento pendente.",
      "Em Escolha o plano, veja os três: Solo, Equipe e Pet shop.",
      "Escolha de quanto em quanto tempo pagar.",
      "Toque em Assinar no plano escolhido.",
    ],
    dicas: [
      "Todos os planos têm as mesmas funções e o Mozart. Muda quantas pessoas têm login.",
      "Quando o teste termina, a conta fica só para consulta e os dados continuam guardados.",
      "Quem já assina usa Trocar cartão ou cancelar.",
      "Se a assinatura ainda não abriu, o botão aparece como Disponível em breve.",
    ],
    atencao: ["Problema com cobrança ou cancelamento? Fale com a nossa equipe pela Ajuda."],
    palavras: ["assinatura", "assinar", "plano", "planos", "teste", "gratis", "preco do sistema", "cancelar assinatura", "mudar de plano", "cobranca", "trocar cartao", "mensalidade do sistema"] },
  { id: "escola", titulo: "Como usar a Escola de Gestão", secao: "ajustes", quem: "dono", rota: ESCOLA,
    passos: [
      "Abra o menu e toque em Escola de Gestão, na parte Aprender.",
      "Em Aulas gratuitas, escolha um assunto e toque na aula.",
      "Mais abaixo ficam os materiais completos da Maestro Pet, vendidos à parte.",
      "Se você comprou um material, ele aparece em Meus materiais, com o botão Ler aqui.",
    ],
    dicas: ["Os materiais não fazem parte da assinatura. Ninguém precisa comprar nada para usar o sistema.", "Comprou com um e-mail diferente do da conta? Fale com a nossa equipe para liberar."],
    palavras: ["escola", "aula", "aulas", "curso", "material", "comprei", "ler o material", "meus materiais", "aprender"] },
];

const numerar = (passos: string[]) => passos.map((p, i) => `${i + 1}. ${p}`).join("\n");
const respostaDe = (t: TopicoBase) => {
  const avisos = [...(t.atencao ?? []).map((a) => `Atenção: ${a}`), ...(t.dicas ?? [])];
  return avisos.length ? `${numerar(t.passos)}\n\n${avisos.join("\n")}` : numerar(t.passos);
};

export const TOPICOS: Topico[] = BASE.map((t) => ({ ...t, resposta: respostaDe(t) }));

/** Os tópicos que um dono novo precisa, na ordem. */
export const COMECANDO = ["guia", "preco-servico", "pet", "marcar", "conta", "caixa", "link", "equipe"];

export const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const topicoPorId = (id: string | null | undefined) => TOPICOS.find((t) => t.id === id) ?? null;

/** Nome de cada tela, como está no menu. */
export const NOME_TELA: Record<string, string> = {
  [HOJE]: "Hoje", [AGENDA]: "Agenda", [CLIENTES]: "Clientes e pets", [CRECHE]: "Creche e hotel", [PACOTES]: "Pacotes",
  [CAIXA]: "Caixa", [FINANCEIRO]: "Financeiro", [RELATORIOS]: "Relatórios", [ESTOQUE]: "Estoque", [EQUIPE]: "Equipe",
  [PETSHOP]: "Meu pet shop", [ASSINATURA]: "Assinatura", [ESCOLA]: "Escola de Gestão", [ROTA_MANUAL]: "Manual",
};

/** A tela do aplicativo a que um endereço pertence (a agenda impressa é da Agenda; /gestao/app casa só com ela mesma). */
export function telaDoCaminho(caminho: string): string | null {
  return Object.keys(NOME_TELA).filter((r) => (r === HOJE ? caminho === r : caminho === r || caminho.startsWith(`${r}/`))).sort((a, b) => b.length - a.length)[0] ?? null;
}

/** Tópicos de uma tela do aplicativo: os que moram nela e os que também se fazem por ela. */
export function topicosDaRota(caminho: string): Topico[] {
  const tela = telaDoCaminho(caminho);
  if (!tela) return [];
  return [...TOPICOS.filter((t) => t.rota === tela), ...TOPICOS.filter((t) => t.rota !== tela && t.tambem?.includes(tela))];
}

const VAZIAS = new Set(["como", "faco", "fazer", "faz", "que", "para", "pra", "um", "uma", "uns", "de", "do", "da", "dos", "das", "no", "na", "nos", "nas", "eu", "meu", "minha", "os", "as", "em", "por", "com", "se", "quero", "posso", "onde", "qual", "quando", "ao", "aos"]);
/** Começo da palavra, para "importo" achar "importar" e "vacinas" achar "vacina". */
const raiz = (w: string) => (w.length >= 7 ? w.slice(0, w.length - 2) : w.length >= 5 ? w.slice(0, w.length - 1) : w);

/**
 * Busca do manual: sem acento, em título, palavras, passos e avisos. Primeiro procura os tópicos que têm todas
 * as palavras escritas; se nenhum tem todas, mostra os que têm alguma, do mais parecido para o menos.
 */
export function buscarNoManual(texto: string): Topico[] {
  const todos = semAcento(texto).replace(/[^a-z0-9 -]/g, " ").split(/\s+/).filter((w) => w.length > 1);
  const uteis = todos.filter((w) => !VAZIAS.has(w));
  const termos = (uteis.length ? uteis : todos).map(raiz);
  if (!termos.length) return TOPICOS;
  const notas = TOPICOS.map((t) => {
    const titulo = semAcento(t.titulo), palavras = semAcento(t.palavras.join(" | ")), corpo = semAcento(t.resposta);
    let n = 0, achou = 0;
    for (const w of termos) {
      const p = titulo.includes(w) ? 5 : palavras.includes(w) ? 3 : corpo.includes(w) ? 1 : 0;
      if (p) { n += p; achou += 1; }
    }
    return { t, n, achou };
  });
  const completos = notas.filter((x) => x.achou === termos.length);
  return (completos.length ? completos : notas.filter((x) => x.achou > 0)).sort((a, b) => b.achou - a.achou || b.n - a.n).map((x) => x.t);
}
