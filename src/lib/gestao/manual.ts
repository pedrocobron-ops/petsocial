import { nomeDaCasa, principalDe, usaCasa, usaModulo } from "./modulos";

/**
 * Manual do Maestro Pet Gestão, em dados. É a única fonte:
 * - da tela Manual (/gestao/app/manual),
 * - do botão "Como usar esta tela" (os tópicos da rota aberta),
 * - das respostas da Ajuda (`resposta` sai dos passos; veja ajuda.ts).
 * Mudou uma tela ou o nome de um botão? Atualize o tópico aqui.
 *
 * Regras de escrita: cada passo é uma ação só, com o nome do botão igual ao da tela. Quem lê não é bom de computador.
 * - Botão se chama pelo nome, nunca pela cor: cada pet shop escolhe as próprias cores.
 * - Passo que só existe com mais de uma pessoa na equipe ou mais de uma área leva "se aparecer".
 * - O que o sistema NÃO faz também tem tópico (seção "limites"), para a busca e a Ajuda responderem com franqueza.
 * - `usa` diz de que parte do negócio o tópico depende: quem não usa creche não vê os tópicos da creche.
 */

export const SECOES = [
  { id: "primeiros", titulo: "Primeiros passos", apoio: "Entrar, se achar no sistema e pedir ajuda." },
  { id: "agenda", titulo: "Agenda", apoio: "Marcar, remarcar e acompanhar os horários de banho e tosa." },
  { id: "clientes", titulo: "Clientes e pets", apoio: "Fichas, tutores, saúde e planilhas." },
  { id: "creche", titulo: "Creche e hotel", apoio: "Reservas, check-in, check-out e vagas." },
  { id: "dinheiro", titulo: "Dinheiro", apoio: "Receber, caixa, contas e relatórios." },
  { id: "estoque", titulo: "Estoque e pacotes", apoio: "Produtos, venda no balcão, pacotes e planos." },
  { id: "equipe", titulo: "Equipe", apoio: "Quem trabalha com você e o que cada um abre." },
  { id: "divulgacao", titulo: "Divulgação e relacionamento", apoio: "Link do cliente, lembretes e clientes de volta." },
  { id: "ajustes", titulo: "Ajustes e conta", apoio: "Preços, horário, cópia de segurança e assinatura." },
  { id: "limites", titulo: "O que o sistema não faz", apoio: "Para você não procurar o que não existe." },
] as const;

export type SecaoId = (typeof SECOES)[number]["id"];
/**
 * Quem consegue fazer: qualquer pessoa da equipe; quem recebe (área Caixa, Financeiro ou Relatórios);
 * quem vê todo o dinheiro (Financeiro ou Relatórios); ou só o dono e os sócios.
 */
export type Quem = "todos" | "caixa" | "financeiro" | "dono";
export const QUEM: Record<Quem, { rotulo: string; tom: "verde" | "azul" | "laranja" | "amarelo" }> = {
  todos: { rotulo: "Todos", tom: "verde" },
  caixa: { rotulo: "Quem cuida do caixa", tom: "amarelo" },
  financeiro: { rotulo: "Quem vê o financeiro", tom: "azul" },
  dono: { rotulo: "Só o dono", tom: "laranja" },
};

/** Parte do negócio de que um tópico (ou um passo) depende. "casa" = creche ou hotel. */
export type Uso = "banho" | "creche" | "hotel" | "casa" | "loja" | "pacotes";
type ComModulos = { modulos?: string[] | null; principal?: string | null };
/** Um passo comum, ou um passo que só vale para quem usa certa parte do negócio. */
type Passo = string | { so: Uso[]; texto: string };

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
  /** Só aparece para o pet shop que usa alguma destas partes. Sem isso, aparece para todos. */
  usa?: Uso[];
  /** Uma ação por passo, na ordem. */
  passos: Passo[];
  dicas?: Passo[];
  atencao?: Passo[];
  /** Palavras da busca, sem acento. */
  palavras: string[];
};
export type Topico = Omit<TopicoBase, "passos" | "dicas" | "atencao"> & {
  passos: string[]; dicas?: string[]; atencao?: string[];
  /** Texto corrido que a Ajuda responde: os passos numerados e os avisos. */
  resposta: string;
};

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
      "O Mozart faz quatro perguntas, uma por tela. Na primeira, escreva o nome do seu negócio e como você quer ser chamado, e toque em Continuar. WhatsApp e cidade ficam em WhatsApp e cidade (se quiser).",
      "Na segunda, marque o que o seu negócio faz: banho e tosa, creche, hotel, venda de produtos, pacotes. Se marcar mais de uma área, toque em qual é a atividade principal. Depois toque em Criar meu pet shop.",
      "Na terceira, toque em uma cor para ver o painel mudar e em Continuar para ficar com ela.",
      "Na quarta, toque em Escolher a imagem para colocar a sua logo e em Continuar.",
      "Cor e logo podem ficar para depois: toque em Faço depois em cada uma, ou em Com pressa? Pular a cor e a logo.",
      "Em seguida abre um guia curto, com um assunto por passo: horário, equipe e vagas, serviços e preços, diária e vagas da creche e do hotel, link do cliente. Só aparecem os passos do que você marcou.",
      "No horário, toque em uma semana pronta, como Segunda a sexta ou Terça a sábado, e acerte as horas. Se vocês fecham para almoçar, marque Fecha para o almoço?.",
      "Em cada passo, toque em Continuar para gravar ou em Faço depois para pular.",
      "Nos preços, escolha Um preço só para usar o mesmo valor em todos os portes, ou Por porte para separar.",
      "No fim, escolha Cadastrar o primeiro pet (já abre a ficha para preencher) ou Trazer meus clientes de uma planilha.",
    ],
    dicas: ["A área principal aparece primeiro no menu e na tela inicial. O que você não marcou fica em Outras áreas, no fim do menu.", "Tudo o que você respondeu pode ser mudado depois em Meu pet shop: o cartão O que você usa troca as áreas e a área principal, e o cartão Identidade do pet shop troca a logo e as cores.", "Para passar pelo guia de novo, abra Meu pet shop e toque em Refazer o guia de configuração.", "Na tela Hoje, o cartão Primeiros passos mostra o que falta fazer. Um toque leva direto ao lugar."],
    palavras: ["guia", "configurar", "configuracao", "primeiro acesso", "primeira vez", "comecar", "primeiros passos", "por onde comeco", "boas-vindas", "boas vindas", "atividade principal"] },
  { id: "tela-hoje", titulo: "Como ler a tela Hoje", secao: "primeiros", quem: "todos", rota: HOJE,
    passos: [
      "Abra Hoje: é a primeira tela do sistema.",
      "No alto, ao lado do seu nome, fica o botão do que o pet shop mais faz: Marcar horário, Fazer check-in, Nova reserva ou Vender. Ele muda conforme a área principal.",
      "Logo abaixo, o Mozart resume o dia em uma frase.",
      { so: ["banho"], texto: "O cartão ao lado mostra o Próximo atendimento. Toque nele para abrir o horário." },
      { so: ["casa"], texto: "Quem tem creche ou hotel vê quantos pets estão na casa agora, quem chega e quem sai hoje." },
      { so: ["loja"], texto: "Quem tem a loja como área principal vê os produtos acabando." },
      { so: ["banho"], texto: "Em Agenda de hoje, toque em um horário para abrir, concluir ou remarcar." },
      "Em Pede a sua atenção, toque em cada linha para resolver: lembretes de amanhã, clientes sumidos, aniversários, produto acabando, contas vencendo e, na creche, a chamada e as mensalidades.",
    ],
    dicas: ["Só aparece o que o pet shop usa e o que o dono liberou para você.", "Valores em dinheiro só aparecem para quem cuida do caixa ou do financeiro.", "Pedidos que chegaram pelo link de agendamento aparecem em destaque, com Aceitar e Recusar."],
    palavras: ["hoje", "tela inicial", "inicio", "resumo do dia", "pede a sua atencao", "painel"] },
  { id: "menu", titulo: "Como achar as telas no menu", secao: "primeiros", quem: "todos", rota: HOJE,
    passos: [
      "No celular, use a barra de baixo: Hoje, a tela da área principal do pet shop (Agenda, Creche, Hotel ou Estoque), o microfone do Mozart, Clientes e Mais.",
      "Toque em Mais para ver as outras telas: Creche e hotel, Pacotes, Caixa, Financeiro, Estoque e as demais.",
      "As telas das áreas que o pet shop não marcou ficam em Outras áreas, no fim do menu. Toque em Outras áreas para abrir a lista.",
      "No computador, o menu fica na lateral esquerda, sempre aberto.",
      "Para achar um pet ou tutor de qualquer tela, toque na lupa no alto e escreva o nome ou o telefone.",
    ],
    dicas: ["A área principal do pet shop vem logo depois de Hoje. O dono troca em Meu pet shop, no cartão O que você usa.", "O menu mostra só as telas que o dono liberou para você.", "Em cada tela, o botão Como usar esta tela, no alto, mostra o passo a passo daquela tela."],
    palavras: ["menu", "onde fica", "nao acho", "mais", "telas", "navegar", "lupa", "buscar", "busca", "outras areas", "sumiu do menu"] },
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
      "Perguntas sobre dinheiro só funcionam para quem vê o financeiro (dono, ou quem tem Financeiro ou Relatórios).",
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
  { id: "marcar", titulo: "Como marcar um horário", secao: "agenda", usa: ["banho"], quem: "todos", rota: AGENDA, tambem: [HOJE],
    passos: [
      "Toque em Marcar horário, na tela Hoje ou na Agenda.",
      "Escolha o pet. Se ele ainda não tem ficha, toque em Cadastrar pet novo.",
      "Escolha o Serviço. Se aparecer Quem atende, escolha a pessoa (com uma pessoa só na equipe, o campo não aparece).",
      "Escolha o Dia e toque em um dos horários livres.",
      "Confira o Valor. Se quiser, marque Leva e traz e escreva uma Observação.",
      "Toque em Marcar.",
    ],
    dicas: [
      "Se o horário estiver ocupado, bloqueado, no almoço ou fora do funcionamento, o sistema avisa e pergunta se é para marcar mesmo assim.",
      "Em dia que o pet shop não abre, a tela só avisa que está fora do horário de funcionamento. Se for atender mesmo assim, é só marcar.",
      "Pet sem porte na ficha: o sistema usa o primeiro preço do serviço e avisa para conferir o valor.",
      "Pelo Mozart: \"marca banho da Mel sexta às 10h\".",
    ],
    palavras: ["marcar", "agendar", "agendamento", "marcar horario", "marcar um horario", "banho", "tosa", "novo horario", "encaixe"] },
  { id: "varios-servicos", titulo: "Como marcar mais de um serviço no mesmo horário", secao: "agenda", usa: ["banho"], quem: "todos", rota: AGENDA, tambem: [HOJE],
    passos: [
      "Toque em Marcar horário e escolha o pet.",
      "Em Serviço, escolha o serviço principal (por exemplo, Banho).",
      "Toque em Juntar outro serviço no mesmo horário, logo abaixo.",
      "Toque em cada serviço que o pet vai fazer junto (por exemplo, Hidratação e Corte de unha).",
      "Confira o valor de cada um na lista que aparece. O valor vem pelo porte do pet e você pode mudar.",
      "Confira a Duração (o tempo dos serviços já vem somado) e o Total do horário.",
      "Toque em Marcar.",
    ],
    dicas: [
      "Para tirar um serviço, toque de novo nele ou no X da linha dele.",
      "Em um horário já marcado, toque nele, depois em Remarcar ou alterar, e junte ou tire serviços do mesmo jeito.",
      "Na hora de Fechar a conta, cada serviço aparece em uma linha, com o seu valor. Esqueceu de marcar um? Toque em Outro serviço, na própria conta.",
      "Cada serviço conta nos Relatórios e na comissão de quem atendeu. Com a comissão por serviço ligada, cada um rende o seu percentual.",
      "Se o pet tem pacote, o pacote cobre só o serviço principal: toque em Usar o pacote e cobrar o resto.",
      "Quem marca um serviço só não precisa fazer nada disso: a tela continua igual.",
      "Pelo Mozart: \"marca banho com hidratação da Mel sexta às 10h\".",
    ],
    atencao: ["O horário inteiro fica com uma pessoa só (a de Quem atende). Se cada serviço é feito por uma pessoa diferente, marque dois horários."],
    palavras: ["dois servicos", "mais de um servico", "varios servicos", "juntar servico", "outro servico", "banho e hidratacao", "hidratacao", "corte de unha", "servico extra", "combo", "segundo servico"] },
  { id: "repetir", titulo: "Como marcar um horário que se repete", secao: "agenda", usa: ["banho"], quem: "todos", rota: AGENDA,
    passos: [
      "Comece a marcar o horário normalmente: pet, serviço, dia e hora.",
      "No campo Repetir, escolha de quanto em quanto tempo o pet volta.",
      "Em Por quantas vezes, escolha o número de horários: de 2 até 26.",
      "Confira até que dia a repetição vai: a data aparece logo abaixo.",
      "Nas Datas com aviso, decida entre pular ou marcar mesmo assim.",
      "Toque em Marcar.",
    ],
    dicas: ["Todos os horários da série ficam com o mesmo serviço, valor e observação.", "Não existe repetição sem fim. Perto da última data, marque de novo.", "Para desmarcar depois, o sistema pergunta se é só aquele dia ou aquele e os próximos."],
    palavras: ["repetir", "repete", "se repete", "horario que se repete", "toda semana", "quinzenal", "recorrente", "fixo", "serie", "cliente fixo", "banho toda semana"] },
  { id: "ver-agenda", titulo: "Como ver a agenda do dia, da semana e de cada pessoa", secao: "agenda", usa: ["banho"], quem: "todos", rota: AGENDA,
    passos: [
      "Abra Agenda.",
      "Toque em um dia da semana, no alto, para ver os horários daquele dia.",
      "Use as setas para ir para a semana anterior ou a próxima. Voltar para hoje traz o dia de hoje de volta.",
      "Se aparecerem os nomes da equipe no alto, toque em um nome para ver só os horários daquela pessoa. Todos mostra a agenda inteira.",
      "No computador, escolha entre Dia e Semana no alto da tela. No celular, a agenda mostra um dia por vez.",
    ],
    dicas: ["No computador, o Resumo do dia fica ao lado da agenda: quantos foram concluídos, quantos faltam atender e os cancelados ou faltas."],
    palavras: ["ver agenda", "ver a agenda", "agenda da semana", "agenda do dia", "agenda de alguem", "agenda de cada", "outro dia", "proxima semana"] },
  { id: "atender", titulo: "Como acompanhar o atendimento do pet", secao: "agenda", usa: ["banho"], quem: "todos", rota: AGENDA, tambem: [HOJE],
    passos: [
      "Toque no horário do pet, na Agenda ou na tela Hoje.",
      "Quando o tutor confirmar que vem, toque em Cliente confirmou.",
      "Quando o pet chegar, toque em Chegou: iniciar atendimento.",
      "Em Como o pet chegou, marque o que você reparou no pet.",
      "Quando terminar, toque em Fechar a conta para receber. Quem não cuida do caixa toca em Concluir atendimento.",
      "Se o pet tem pacote para o serviço, o primeiro botão é Concluir usando o pacote (sem cobrar).",
    ],
    dicas: ["Ver ficha abre a ficha do pet, com alertas e histórico."],
    palavras: ["atendimento", "chegou", "iniciar", "confirmou", "confirmar", "concluir", "em atendimento", "como o pet chegou", "checklist"] },
  { id: "remarcar", titulo: "Como remarcar, desmarcar ou marcar falta", secao: "agenda", usa: ["banho"], quem: "todos", rota: AGENDA, tambem: [HOJE],
    passos: [
      "Toque no horário, na Agenda ou na tela Hoje.",
      "Para mudar dia, hora, serviço ou valor, toque em Remarcar ou alterar, mude o que precisa e toque em Salvar.",
      "Se o cliente avisou que não vem, toque em Desmarcar horário.",
      "Se o cliente não apareceu, toque em Faltou.",
    ],
    dicas: [
      "Tocou em Faltou sem querer? O aviso que aparece embaixo tem o botão Desfazer. Depois que ele some, abra o horário e toque em Voltar para marcado.",
      "O horário desmarcado ou com falta continua aparecendo no dia e no histórico do pet.",
      "Se o horário faz parte de uma série, o sistema pergunta: Desmarcar só este ou Desmarcar este e os próximos.",
      "Para avisar o tutor, o horário tem a mensagem pronta: Avisar remarcação e Avisar cancelamento.",
    ],
    atencao: ["Atendimento já concluído tem regra própria. Sem dinheiro lançado, quem cuida do caixa pode reabrir, alterar ou apagar. Com pagamento, conta a receber ou pacote usado, só o dono ou quem vê o financeiro. Com o pagamento em um caixa já fechado, só o dono."],
    palavras: ["avisar remarcacao", "avisar cancelamento", "avisar que remarcou", "avisar que cancelou", "remarcar", "remarco", "cancelar", "cancelo", "cancelou", "desmarco", "desmarcou", "cancelar horario", "cancelar um horario", "cancelar o horario", "desmarcar", "falta", "faltou", "mudar horario", "trocar horario", "editar horario", "alterar horario", "nao veio"] },
  { id: "desfazer", titulo: "Como desfazer um horário desmarcado, uma falta ou um atendimento concluído", secao: "agenda", usa: ["banho"], quem: "todos", rota: AGENDA,
    passos: [
      "Na Agenda, vá até o dia do horário.",
      "Toque no horário que ficou como desmarcado, com falta ou concluído. Ele continua aparecendo no dia.",
      "Toque em Voltar para marcado.",
      "Se o atendimento já tinha pagamento, o sistema explica o que acontece com o dinheiro e pede para confirmar.",
    ],
    dicas: ["O horário volta ao normal, com o mesmo pet, serviço e hora.", "Ao reabrir um atendimento pago, o pagamento continua registrado no caixa e no financeiro."],
    atencao: [
      "Reabrir atendimento com pagamento é só para o dono ou quem vê o financeiro. Se o pagamento está em um caixa já fechado, só o dono. Para os outros, o botão não aparece e a tela diz por quê.",
      "Horário apagado pelo botão Apagar da agenda não volta: precisa ser marcado de novo.",
    ],
    palavras: ["desfazer", "apertei errado", "cliquei errado", "toquei errado", "sem querer", "cancelei errado", "cancelei sem querer", "como volta", "voltar para marcado", "voltar o horario", "recuperar horario", "descancelar", "reabrir", "desfazer cancelamento", "desfazer falta", "conclui errado"] },
  { id: "apagar-horario", titulo: "Como apagar um horário da agenda", secao: "agenda", usa: ["banho"], quem: "todos", rota: AGENDA,
    passos: [
      "Toque no horário.",
      "Toque em Apagar da agenda, no fim da janela.",
      "Confirme em Apagar.",
    ],
    dicas: ["Se o cliente só desmarcou, prefira Desmarcar horário: assim fica no histórico."],
    atencao: ["Se o horário já foi pago ou tem conta a receber, o sistema pergunta o que fazer com o dinheiro antes de apagar. Leia com calma."],
    palavras: ["apagar horario", "apagar um horario", "apagar o horario", "apagar da agenda", "excluir horario", "lixeira", "remover horario", "marquei errado", "horario duplicado"] },
  { id: "bloquear", titulo: "Como bloquear um horário (folga, feriado, compromisso)", secao: "agenda", usa: ["banho"], quem: "todos", rota: AGENDA,
    passos: [
      "Na Agenda, toque em Bloquear horário.",
      "Escolha o Dia e as horas, ou marque Dia inteiro.",
      "Se aparecer Para quem, escolha Pet shop inteiro ou uma pessoa (com uma pessoa só na equipe, o campo não aparece).",
      "Escolha o Motivo ou escreva o seu.",
      "Se o bloqueio se repete, marque a opção de repetir e escolha Por quantas semanas: de 1 a 8.",
      "Toque em Bloquear.",
    ],
    dicas: [
      "Fecha para o almoço todo dia? Não bloqueie a agenda: o dono abre Meu pet shop e, no cartão Horário de funcionamento, marca Fecha para o almoço?. Vale toda semana, sem prazo para acabar.",
      "Para mudar ou tirar um bloqueio, toque nele na agenda. Se ele se repete, o sistema pergunta: Só este ou Este e os próximos.",
    ],
    atencao: ["O bloqueio que se repete vale por até 8 semanas. Depois disso, é preciso bloquear de novo."],
    palavras: ["bloquear", "bloqueio", "almoco", "folga", "feriado", "fechar agenda", "nao atender", "ferias", "manutencao"] },
  { id: "pronto", titulo: "Como avisar o tutor que o atendimento terminou", secao: "agenda", usa: ["banho"], quem: "todos", rota: AGENDA, tambem: [HOJE],
    passos: [
      "Toque no horário do pet, depois que o atendimento de hoje começou ou terminou.",
      "Toque em Avisar que terminou.",
      "O WhatsApp abre com a mensagem escrita. Toque em enviar.",
    ],
    dicas: ["Depois de avisar, o botão passa a mostrar a hora: Avisado às, com o horário.", "O botão só aparece se o tutor tem telefone na ficha."],
    palavras: ["pronto", "esta pronto", "buscar", "avisar tutor", "terminou", "pode buscar", "avisar que terminou", "pet pronto"] },
  { id: "fotos", titulo: "Como mandar fotos de antes e depois", secao: "agenda", usa: ["banho"], quem: "todos", rota: AGENDA, tambem: [HOJE],
    passos: [
      "Toque no horário do pet.",
      "No bloco Antes e depois, toque no quadro Antes e tire ou escolha a foto.",
      "Faça o mesmo no quadro Depois.",
      "Toque em Mandar para o tutor.",
    ],
    dicas: ["No celular abre o compartilhamento com as fotos. No computador abre o WhatsApp do tutor com a mensagem.", "Para trocar uma foto, toque nela."],
    palavras: ["foto", "fotos", "antes e depois", "antes", "depois", "enviar foto", "mandar foto"] },
  { id: "imprimir", titulo: "Como imprimir a agenda ou salvar em PDF", secao: "agenda", usa: ["banho"], quem: "todos", rota: AGENDA,
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
      "Em Tutor (dono do pet), escreva o nome. Se ele já for cliente, escolha na lista que aparece.",
      "Se quiser, escreva o WhatsApp do tutor, com DDD. Pode ficar em branco.",
      "Para cão, escolha o Porte. Se ainda não sabe, toque em Não sei ainda.",
      "Se quiser, coloque foto, raça, nascimento e os Cuidados e alertas.",
      "Toque em Salvar.",
    ],
    dicas: [
      "Se o nome ou o telefone já for de um tutor, o sistema pergunta É a mesma pessoa?. Toque em Usar, com o nome dele, para ficar uma ficha só, ou em Criar outro se for outra pessoa.",
      { so: ["banho"], texto: "O porte define o preço do banho. Com Não sei ainda, o sistema pergunta de novo na hora de marcar um horário." },
      { so: ["banho"], texto: "Também dá para cadastrar na hora de marcar um horário, em Cadastrar pet novo." },
      "Com a data de nascimento anotada, o sistema lembra do aniversário do pet.",
    ],
    palavras: ["cadastrar", "cadastro", "pet novo", "cliente novo", "tutor", "adicionar pet", "foto", "novo cliente", "porte", "cadastrar cliente", "cadastrar pet"] },
  { id: "ficha", titulo: "Como ver a ficha e o histórico do pet", secao: "clientes", quem: "todos", rota: CLIENTES,
    passos: [
      "Abra Clientes e pets.",
      "Escreva o nome do pet, do tutor ou o telefone na busca.",
      "Toque no pet.",
      "A ficha mostra os alertas, a última visita, o próximo horário, os pacotes, a saúde e o histórico de atendimentos.",
      "Para mudar os dados do pet, toque em Editar pet.",
    ],
    dicas: [{ so: ["banho"], texto: "Agendar já abre a janela de marcar horário com o pet escolhido." }, "WhatsApp abre a conversa com o tutor.", "Trocar tutor passa o pet para a ficha de outra pessoa."],
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
      "Logo acima da busca, toque em Tutores (ao lado de Pets).",
      "Toque no tutor.",
      "A ficha mostra os pets dele e o contato. Com a fidelidade ligada, mostra também quanto falta para o prêmio.",
      "Para colocar mais um pet na mesma ficha, toque em Adicionar pet.",
    ],
    dicas: [
      "Quem cuida do caixa vê o cartão Ficou de pagar quando o tutor deve alguma coisa: quanto deve, cada conta, o botão Recebi e o Cobrar no WhatsApp.",
      "Quem vê o financeiro vê também quanto o tutor já gastou.",
      "Tutor novo cadastra um tutor sem pet.",
    ],
    palavras: ["ficha do tutor", "tutores", "cliente deve", "quanto gastou", "pets do tutor", "tutor novo", "segundo pet", "mais um pet", "quanto o cliente deve"] },
  { id: "juntar", titulo: "Como juntar um cliente cadastrado duas vezes", secao: "clientes", quem: "todos", rota: CLIENTES,
    passos: [
      "Abra Clientes e pets e toque em Tutores (ao lado de Pets).",
      "Toque na ficha que vai ficar: a do cadastro mais completo.",
      "Desça até o fim da ficha e toque em Juntar com outro tutor.",
      "Procure a ficha repetida pelo nome ou pelo telefone e toque nela.",
      "Confira o que vem para esta ficha e toque em Juntar as duas fichas.",
    ],
    dicas: [
      "Os pets e o histórico da ficha repetida passam para a ficha que ficou. A repetida deixa de existir.",
      "Para não repetir de novo: ao cadastrar, escolha o tutor na lista que aparece. Se o sistema perguntar É a mesma pessoa?, toque em Usar, com o nome dele.",
      "Pet repetido não se junta: abra a ficha do pet que sobrou e toque em Desativar pet.",
    ],
    atencao: ["Juntar não dá para desfazer. Confira os nomes antes de confirmar."],
    palavras: ["juntar", "juntar tutores", "juntar com outro tutor", "duplicado", "duplicada", "cliente duplicado", "cliente repetido", "repetido", "cadastro repetido", "duas vezes", "mesmo cliente", "em dobro", "unir", "mesclar", "dois cadastros"] },
  { id: "trocar-tutor", titulo: "Como passar um pet para outro tutor", secao: "clientes", quem: "todos", rota: CLIENTES,
    passos: [
      "Abra a ficha do pet, em Clientes e pets.",
      "Toque em Trocar tutor.",
      "Procure o novo tutor pelo nome ou pelo telefone e toque nele.",
      "Confira e toque em Passar para, com o nome do novo tutor.",
    ],
    dicas: ["O que já foi pago ou ficou a receber continua na ficha de quem pagou.", "Se as duas fichas são da mesma pessoa, prefira Juntar com outro tutor, na ficha do tutor."],
    palavras: ["trocar tutor", "mudar tutor", "mudar o dono do pet", "pet mudou de dono", "tutor errado", "pet no tutor errado", "passar o pet"] },
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
    dicas: ["Sumido é quem já veio (atendimento, creche ou hotel) e parou de vir.", "Para mandar mensagem a quem sumiu, use o botão Chamar de volta."],
    palavras: ["filtro", "sumido", "sumidos", "sem visita", "com alerta", "nunca veio", "inativo", "lista de clientes"] },
  { id: "importar", titulo: "Como trazer clientes de uma planilha", secao: "clientes", quem: "todos", rota: CLIENTES,
    passos: [
      "Abra Clientes e pets e toque em Trazer de planilha.",
      "Toque em Baixar planilha modelo para ver como os títulos das colunas costumam ficar.",
      "Toque em Escolher arquivo CSV, ou copie as células no Excel ou no Google Planilhas (com a linha de títulos) e cole no campo.",
      "Em Confira o que é cada coluna, veja o palpite do sistema. Se ele errou, escolha na lista embaixo de cada título: Tutor, Telefone, Pet e as outras. Não usar deixa a coluna de fora.",
      "Se aparecer o aviso de que nenhuma coluna está marcada como Telefone ou como Pet, escolha a coluna certa. Só toque em Trazer mesmo assim se a planilha não tem essa informação.",
      "Toque em Trazer, o botão que mostra quantas linhas vão entrar.",
    ],
    dicas: [
      "Só a coluna Tutor é obrigatória. Um tutor com dois pets ocupa duas linhas, repetindo o nome e o telefone.",
      "Nada do que já está no sistema é apagado. Tutor ou pet que já existe só ganha o que estava em branco: telefone, raça, porte, observações.",
      "A coluna Observações vai para as observações do pet, não para os alertas.",
      "O resumo fica guardado neste aparelho: abra Trazer de planilha de novo e veja Última importação.",
      "Trouxe a planilha errada? Em Última importação, toque em Desfazer esta importação: saem os tutores e os pets que ela criou.",
    ],
    atencao: ["Arquivo fechado do Excel não é lido direto: copie e cole as células, ou salve como CSV.", "Não feche a janela enquanto estiver trazendo."],
    palavras: ["importar", "planilha", "excel", "csv", "trazer clientes", "trazer de planilha", "migrar", "outro sistema", "lista de clientes antiga", "google planilhas", "desfazer importacao", "colunas"] },
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
  { id: "creche", titulo: "Como funciona a tela Creche e hotel", secao: "creche", usa: ["casa"], quem: "todos", rota: CRECHE,
    passos: [
      "Abra Creche e hotel, no menu. Para quem usa só uma das duas, o menu mostra Creche ou Hotel.",
      "No alto ficam as partes da tela: Casa agora e Ocupação.",
      { so: ["creche"], texto: "Quem tem creche vê também Chamada (os mensalistas do dia), Mensalistas e Cobranças. Cobranças só aparece para quem vê o financeiro." },
      "Em Casa agora ficam três abas: Na casa agora, Reservas e Histórico.",
      "Em Na casa agora, cada pet tem os botões Mensagens, Editar e Check-out.",
      "Em Reservas, cada pet tem Check-in, Editar, Cancelar e Mensagens. Em cima da lista dá para filtrar por período: Todas, Próximos 7 dias, Este mês ou Outro período.",
      "Em Histórico ficam as estadias encerradas. Toque numa linha para ver o detalhe.",
      "Em Ocupação fica o calendário com as vagas tomadas em cada dia.",
    ],
    dicas: [
      "A faixa no alto mostra as vagas de hoje e avisa quando a casa está cheia, quando tem saída atrasada e quando ficou check-out sem cobrança.",
      "Creche é para passar o dia. Hotel é para dormir.",
      "O botão Mensagens no cartão do pet mostra as mensagens prontas para o tutor. Um toque em Abrir o WhatsApp e você só aperta enviar.",
      "Na faixa do alto também ficam Folha do dia, para imprimir, e Avisar quem chega amanhã, quando tem reserva para amanhã.",
    ],
    palavras: ["creche", "hotel", "hospedagem", "hospedes", "daycare", "day care", "escolinha", "na casa agora", "casa agora", "filtrar reservas", "reservas do mes"] },
  { id: "creche-reserva", titulo: "Como marcar uma reserva de creche ou hotel", secao: "creche", usa: ["casa"], quem: "todos", rota: CRECHE,
    passos: [
      "Em Creche e hotel, toque em Nova reserva / Check-in.",
      "Escolha o pet.",
      "Em Tipo, escolha Creche ou Hotel. Quem usa só um dos dois não vê essa pergunta.",
      "Deixe marcado Reservar para outro dia.",
      "Escolha o dia e a hora da Entrada e, se souber, a Saída prevista.",
      "Logo abaixo aparece quantas vagas já estão tomadas nessas datas (por exemplo, Nessas datas: 12 de 14 vagas na noite mais cheia).",
      "Se aparecer o Valor da diária, confira. Ele só aparece para quem cuida do caixa.",
      "Toque em Marcar reserva.",
    ],
    dicas: [
      "A diária já vem com o preço definido em Meu pet shop.",
      "O sistema avisa se o pet tem vacina vencida.",
      "Se a casa estiver cheia em algum dia do período, aparece o aviso Casa cheia. A reserva só passa do limite se você tocar em Passar do limite.",
      "Pela tela Ocupação também dá: toque no dia e em Nova reserva, e a data já vem preenchida.",
      "Sinal, taxas, acomodação e ficha de cuidados só aparecem na reserva de quem ligou cada opção em Meu pet shop, em Opções do hotel e da creche.",
    ],
    palavras: ["reserva", "reservar", "marcar uma reserva", "reserva de creche", "reserva de hotel", "marcar hotel", "marcar creche", "hospedar", "diaria", "nova reserva"] },
  { id: "creche-checkin", titulo: "Como fazer o check-in", secao: "creche", usa: ["casa"], quem: "todos", rota: CRECHE,
    passos: [
      "Se o pet tem reserva, abra Reservas e toque em Check-in no cartão dele.",
      "Se não tem reserva, toque em Nova reserva / Check-in e escolha o pet.",
      "Escolha Creche ou Hotel e toque em Chegou agora.",
      "Em Observações, anote ração, remédio e o que veio na mochila.",
      "Toque em Fazer check-in.",
    ],
    dicas: [
      "O pet passa a aparecer em Na casa agora.",
      "Diária em R$ 0,00 vira cortesia: o sistema pede confirmação.",
      { so: ["creche"], texto: "Mensalista da creche não entra por aqui: a chegada dele é um toque em Chegou, na Chamada." },
    ],
    palavras: ["check-in", "checkin", "check in", "fazer check-in", "fazer o check-in", "check-in do hotel", "check-in da creche", "chegou na creche", "chegou no hotel", "pet chegou"] },
  { id: "creche-checkout", titulo: "Como fazer o check-out e receber a estadia", secao: "creche", usa: ["casa"], quem: "todos", rota: CRECHE,
    passos: [
      "Em Creche e hotel, abra Na casa agora.",
      "Toque em Check-out no cartão do pet.",
      "Confira o número de Diárias.",
      "Se o pet tem pacote com saldo, aparece Como fica a conta: escolha Cobrar a diária ou Usar 1 do pacote.",
      "Em Tem mais alguma coisa na conta?, quem cuida do caixa toca em Outro extra para somar um valor a mais. Quem vende produtos também busca o produto: ele sai do estoque.",
      "Confira o Valor a receber. Dá para mudar o valor na mão.",
      "Se o tutor ainda deve alguma conta, ela aparece em ainda deve, com a pergunta receber junto? Marque para dar baixa nela neste mesmo pagamento.",
      "Escolha Paga agora e a forma de pagamento, ou Cliente paga depois.",
      "Toque em Receber, o botão que mostra o valor.",
      "Na janela Conta fechada, toque em Mandar comprovante para abrir o WhatsApp do tutor com o comprovante pronto.",
    ],
    dicas: [
      "Usando o pacote, o botão vira Usar o pacote e encerrar, e nenhum dinheiro é lançado.",
      "Quem não cuida do caixa toca em Fazer check-out: a estadia encerra e a cobrança fica na lista Check-outs para cobrar, para quem cuida do caixa.",
      "Se a taxa de busca fora do horário está ligada e o pet saiu depois da hora, a folha pergunta se a taxa entra na conta: toque em Cobrar ou em Não cobrar a taxa. Sem escolher, a conta não fecha.",
      "Reserva com sinal: o sinal aparece numa linha própria e sai da conta sozinho.",
      "Com temporada, preço de feriado ou desconto do segundo pet ligados, toque em ver noite por noite para conferir a diária de cada noite.",
      "Depois, em Histórico, toque na estadia para ver a conta como foi cobrada e mandar o comprovante de novo.",
      "O comprovante não é nota fiscal, e o texto diz isso.",
    ],
    palavras: ["check-out", "checkout", "check out", "fazer check-out", "fazer o check-out", "check-out do hotel", "check-out da creche", "foi embora", "encerrar estadia", "receber hotel", "receber creche", "diarias", "check-out sem cobranca", "acertar estadia", "check-outs para cobrar", "extra no hotel", "conta do hotel", "comprovante do hotel", "comprovante da estadia", "recibo do hotel", "receber junto", "ainda deve"] },
  { id: "creche-encerrar", titulo: "Como encerrar o dia da creche de uma vez", secao: "creche", usa: ["creche"], quem: "todos", rota: CRECHE,
    passos: [
      "No fim do dia, em Creche e hotel, abra Casa agora e toque em Encerrar o dia da creche, na faixa do alto.",
      "Marque os pets que estão indo embora.",
      "Mensalista sai sem cobrança. Quem tem pacote já vem com a opção de usar o pacote marcada.",
      "Para os outros, quem cuida do caixa escolhe a forma de pagamento, que vale para todos.",
      "Toque em Encerrar, o botão que mostra quantos pets saem e quanto você recebe.",
    ],
    dicas: [
      "O botão só aparece quando tem pet da creche na casa.",
      "Para os mensalistas, o mais simples é a Chamada: toque em Saiu em cada um, ou em Encerrar a chamada.",
      "Estadia com sinal na reserva ou com taxas combinadas não entra no lote: a linha dela mostra o botão Abrir o check-out, que fecha a conta inteira (com o sinal descontado e as taxas).",
      "Com a taxa de busca fora do horário ligada e depois da hora, cada linha traz a taxa marcada e o total diz quanto é de taxa. Desmarque de quem não vai pagar. Antes de gravar, o sistema pergunta se é para cobrar as taxas.",
      "Quem não cuida do caixa encerra sem valor: as saídas ficam em Check-outs para cobrar.",
    ],
    atencao: ["Se alguém vai dividir o pagamento ou pagar depois, desmarque esse pet e faça o check-out pelo cartão dele."],
    palavras: ["encerrar o dia", "fim do dia", "todos de uma vez", "check-out de todos", "fechar a creche"] },
  { id: "creche-editar", titulo: "Como mudar ou cancelar uma reserva ou estadia", secao: "creche", usa: ["casa"], quem: "todos", rota: CRECHE,
    passos: [
      "Em Creche e hotel, ache o pet em Reservas ou em Na casa agora.",
      "Toque em Editar para mudar as datas, a diária ou as observações.",
      "Toque em Salvar.",
      "Para cancelar uma reserva, toque em Cancelar no cartão dela e confirme em Cancelar reserva.",
      "Se a reserva tem sinal, quem cuida do caixa escolhe antes: Ficar com o sinal ou Devolver o sinal (se ainda não foi pago: Deixar em A receber ou Tirar a conta a receber).",
    ],
    dicas: [
      "Devolver o sinal lança uma saída de hoje com o valor devolvido. O recebimento do sinal não é apagado.",
      "Se o tutor pagou só uma parte do sinal, a escolha é sobre o que entrou: Ficar com o que foi recebido, Devolver o que foi recebido ou Continuar cobrando o que falta. Nas duas primeiras, a conta do que faltava sai de A receber.",
    ],
    atencao: ["Reserva com sinal só é cancelada por quem cuida do caixa."],
    palavras: ["editar reserva", "cancelar reserva", "mudar data", "mudar diaria", "estender", "mais um dia", "editar estadia"] },
  { id: "creche-passado", titulo: "Como corrigir a entrada e a saída de uma estadia que já passou", secao: "creche", usa: ["casa"], quem: "caixa", rota: CRECHE,
    passos: [
      "Em Creche e hotel, abra Casa agora e toque na aba Histórico.",
      "Ache a estadia e toque no lápis, ao lado dela. Se ela ficou sem cobrança, toque na linha dela e em Corrigir.",
      "Acerte Entrou em e Saiu em, com o dia e a hora em que o pet entrou e saiu de verdade.",
      "Confira o número de Diárias e toque em Salvar.",
    ],
    dicas: [
      "Esqueceu de anotar um dia? Faça o check-in e o check-out agora e depois corrija as datas por aqui.",
      { so: ["creche"], texto: "Para mensalista, o caminho é outro: na Chamada, toque em Ontem ou em Outro dia deste mês e marque quem veio." },
    ],
    atencao: ["A correção é para quem cuida do caixa. Estadia de mensalista não tem o lápis."],
    palavras: ["dia passado", "dia que passou", "data errada", "corrigir estadia", "corrigir saida", "corrigir entrada", "hora da saida", "esqueci o check-out", "esqueci de anotar", "retroativo", "lancar dia anterior"] },
  { id: "hospede-cuidados", titulo: "Como anotar remédio, ração e cuidados do hóspede", secao: "creche", usa: ["casa"], quem: "todos", rota: CRECHE,
    passos: [
      "No check-in ou na reserva, escreva em Observações: ração, remédio com dose e horário, passeio e o que veio na mochila.",
      "Já fez o check-in? Em Na casa agora, toque em Editar no cartão do pet.",
      "Complete as Observações e toque em Salvar.",
      "A anotação fica à vista no cartão do pet, em Na casa agora.",
    ],
    dicas: ["O que vale sempre (alergia, briga com outros cães, foge no portão) fica melhor na ficha do pet, em Cuidados e alertas: aparece em vermelho no cartão, no check-in e na chamada."],
    atencao: ["As Observações só guardam a anotação. Para ter a lista do dia, com o que já foi feito, o dono liga a Ficha de cuidados em Meu pet shop, em Opções do hotel e da creche. O sistema não avisa a hora do remédio."],
    palavras: ["medicacao", "medicamento", "remedio", "racao do hospede", "alimentacao", "cuidados do hospede", "mochila", "o que trouxe", "dose"] },
  { id: "hotel-ficha-cuidados", titulo: "Como usar a ficha de cuidados (comida e remédio com horário)", secao: "creche", usa: ["casa"], quem: "todos", rota: CRECHE, tambem: [PETSHOP],
    passos: [
      "O dono liga a opção uma vez: em Meu pet shop, no cartão Opções do hotel e da creche, liga Ficha de cuidados e toca em Salvar opções.",
      "Na reserva, no check-in ou em Editar, vá até Comida e remédio e toque em Comida ou em Remédio.",
      "Escreva o que é e Quanto. Escolha a hora e toque em Horário para cada horário do dia.",
      "Salve. No cartão do hóspede, em Na casa agora, aparece Cuidados de hoje, com um botão por horário.",
      "Deu a comida ou o remédio? Toque no horário. Ele fica verde, com quem fez e a hora.",
    ],
    dicas: [
      "Tocar de novo desfaz a marca.",
      "A mensagem Como está o hóspede conta só o que foi marcado no dia (por exemplo, comeu às 8h e às 18h).",
      "A Folha do dia traz a comida e o remédio de cada hóspede.",
    ],
    atencao: ["O sistema não avisa a hora. Ele só mostra a lista e guarda o que foi marcado."],
    palavras: ["ficha de cuidados", "comida", "medicacao", "remedio com horario", "checklist", "lista do dia", "comeu", "tomou o remedio", "alimentacao", "racao"] },
  { id: "ocupacao", titulo: "Como ver a ocupação dos próximos dias", secao: "creche", usa: ["casa"], quem: "todos", rota: CRECHE,
    passos: [
      "Em Creche e hotel, toque em Ocupação, no alto.",
      "No computador aparece o mês inteiro; no celular, uma tira com 14 dias. Use as setas para trocar de mês e Hoje para voltar.",
      "Cada dia mostra as vagas tomadas e o total: a lua é o hotel (noites) e o sol é a creche (dias).",
      "A cor diz como está: verde tem vaga, amarelo metade, laranja quase cheio, vermelho cheio.",
      "Toque num dia para ver quem está na casa, quem chega e quem sai, com as observações.",
      "Para reservar naquele dia, toque em Nova reserva: a data já vem preenchida.",
    ],
    dicas: [
      "Os números contam estadias, reservas e, na creche, os mensalistas esperados. É a mesma conta do aviso de casa cheia.",
      "Para aparecer cheio, o dono preenche as vagas em Meu pet shop, no cartão Creche e hotel.",
      "Quem usa Acomodações vê, no dia, quantos hóspedes cada uma tem.",
    ],
    palavras: ["ocupacao", "lotado", "lotada", "lotacao", "calendario", "calendario do hotel", "vagas por dia", "feriado", "proximos dias", "tem vaga", "mapa de ocupacao", "quem chega", "quem sai"] },
  { id: "folha-do-dia", titulo: "Como imprimir a folha do dia da creche e do hotel", secao: "creche", usa: ["casa"], quem: "todos", rota: CRECHE,
    passos: [
      "Em Creche e hotel, em Casa agora, toque em Folha do dia, na faixa do alto.",
      "Para outro dia, troque a data no alto da folha. Pela Ocupação também dá: toque no dia e em Folha do dia.",
      "Toque em Imprimir ou salvar em PDF.",
    ],
    dicas: [
      "A folha mostra quem está na casa, quem chega e quem sai, com o telefone do tutor, as observações e os alertas do pet.",
      "Com a Ficha de cuidados ligada, traz também a comida e o remédio de cada hóspede.",
      { so: ["creche"], texto: "Os mensalistas esperados na creche vêm numa lista à parte." },
    ],
    atencao: ["A folha não mostra valores."],
    palavras: ["folha do dia", "imprimir hotel", "imprimir creche", "lista do dia", "quem esta na casa", "pdf do hotel", "folha de hospedes"] },
  { id: "hotel-mensagens", titulo: "Como mandar as mensagens do hotel e avisar quem chega amanhã", secao: "creche", usa: ["casa"], quem: "todos", rota: CRECHE,
    passos: [
      "No cartão do pet, toque em Mensagens.",
      "Na reserva aparecem Confirmar reserva e Avisar a chegada (e Pedir o sinal, quando há sinal a receber). Na casa, Como está o hóspede e Lembrar a saída.",
      "Quer mudar o texto? Toque em Mudar o texto e escreva.",
      "Toque em Abrir o WhatsApp e aperte enviar.",
      "Para avisar todo mundo que chega amanhã, toque em Avisar quem chega amanhã, na faixa do alto, e mande um por um.",
    ],
    dicas: [
      "Cada mensagem mandada fica marcada como Enviada, com a hora, para toda a equipe.",
      "Um tutor com dois pets chegando amanhã recebe uma mensagem só.",
      "O dono muda o texto padrão de cada mensagem em Meu pet shop, em Opções do hotel e da creche, em Textos das mensagens. Vale para todos os aparelhos.",
    ],
    atencao: ["O sistema nunca manda mensagem sozinho: ele prepara o texto e você envia."],
    palavras: ["mensagem do hotel", "avisar chegada", "quem chega amanha", "lembrar a saida", "como esta o hospede", "confirmar reserva", "whatsapp do hotel", "lembrete do hotel", "texto da mensagem"] },
  { id: "hotel-opcoes", titulo: "Como ligar as opções do hotel e da creche", secao: "creche", usa: ["casa"], quem: "dono", rota: PETSHOP, tambem: [CRECHE],
    passos: [
      "Abra Meu pet shop e vá até o cartão Opções do hotel e da creche. Em Creche e hotel, o botão Opções do hotel e da creche leva até lá.",
      "Ligue a chave do que você usa: Sinal na reserva, Diária do hotel por porte, Temporadas, Desconto para o segundo pet, Preço de feriado, Taxa de busca fora do horário, Taxas opcionais, Ficha de cuidados ou Acomodações.",
      "Preencha os campos que aparecem embaixo da chave.",
      "Toque em Salvar opções.",
    ],
    dicas: ["Tudo começa desligado. Desligado, a tela e a conta ficam como sempre foram.", "Desligar uma opção não apaga o que já foi cobrado nem o que está no histórico."],
    palavras: ["opcoes do hotel", "opcoes da creche", "ligar sinal", "ligar taxa", "configurar hotel", "ajustes do hotel"] },
  { id: "casa-opcoes", titulo: "Como ligar o diário, quem pode buscar, a lista de espera e as ocorrências", secao: "creche", usa: ["casa"], quem: "dono", rota: PETSHOP, tambem: [CRECHE],
    passos: [
      "Abra Meu pet shop e vá até o cartão Cuidado com o tutor.",
      "Ligue a chave do que você usa: Diário do dia, Quem pode buscar o pet, Lista de espera ou Ocorrências.",
      "No Diário do dia, confira a lista O que a equipe marca. Mude os nomes, tire um item ou toque em Novo item.",
      "Na Lista de espera, marque a caixa do link do cliente se quiser que o tutor peça para entrar na lista quando o dia estiver cheio.",
      "Toque em Salvar opções.",
    ],
    dicas: ["Tudo começa desligado. Desligado, nada disso aparece nas telas.", "Desligar uma opção não apaga o que já foi anotado."],
    palavras: ["cuidado com o tutor", "ligar diario", "ligar lista de espera", "ligar ocorrencias", "itens do diario", "quem pode buscar", "autorizados"] },
  { id: "casa-diario", titulo: "Como mandar o diário do dia para o tutor", secao: "creche", usa: ["casa"], quem: "todos", rota: CRECHE, tambem: [PETSHOP],
    passos: [
      "O dono liga a opção uma vez: em Meu pet shop, no cartão Cuidado com o tutor, liga Diário do dia e toca em Salvar opções.",
      "Em Creche e hotel, toque em Diário, no alto. Aparecem os pets que estão na casa e os que já saíram hoje.",
      "No cartão do pet, toque no que ele fez: cada item marcado já fica guardado.",
      "Se quiser, escreva um Recado para o tutor.",
      "Toque em Mandar o diário. O WhatsApp abre com a mensagem pronta e você aperta enviar.",
    ],
    dicas: [
      "Para conferir ou mudar o texto antes de mandar, toque em Ver a mensagem.",
      "Depois de mandar, o cartão mostra enviado, com a hora, para toda a equipe.",
      "Só entra na mensagem o que foi marcado. O dono escolhe os itens em Meu pet shop.",
      "A tela não mostra valores: serve para quem cuida dos pets, no tablet ou no celular.",
    ],
    atencao: ["O sistema não manda nada sozinho, e o diário não leva foto: a foto você manda pelo próprio WhatsApp, depois da mensagem."],
    palavras: ["diario", "diario do dia", "boletim", "relatorio do dia", "como foi o dia", "comeu", "brincou", "fez xixi", "necessidades", "mandar para o tutor", "agenda do pet", "foto do dia"] },
  { id: "casa-quem-busca", titulo: "Como guardar quem pode buscar o pet e conferir na saída", secao: "creche", usa: ["casa"], quem: "todos", rota: CRECHE, tambem: [CLIENTES, PETSHOP],
    passos: [
      "O dono liga a opção uma vez: em Meu pet shop, no cartão Cuidado com o tutor, liga Quem pode buscar o pet e toca em Salvar opções.",
      "Abra a ficha do pet, em Clientes, e vá até o cartão Quem pode buscar. Pelo cartão do hóspede, em Creche e hotel, o botão Quem busca abre a mesma lista.",
      "Toque em Autorizar uma pessoa, escreva o nome, o que ela é do tutor e, se tiver, o telefone. Toque em Guardar.",
      "Para o contato de emergência, toque em Veterinário e preencha.",
      "Na saída, toque em Check-out (ou em Saiu, na chamada). Antes da saída, a tela pergunta Quem veio buscar.",
      "Toque em quem está levando o pet e em Confirmar e seguir.",
    ],
    dicas: [
      "O tutor sempre pode buscar: não precisa colocar o nome dele na lista.",
      "A pessoa autorizada pode valer para todos os pets do tutor ou só para um.",
      "Quem levou fica guardado na estadia e aparece no Histórico e na chamada.",
      "Veio alguém que não está na lista? Toque em Outra pessoa, escreva o nome e confirme com o tutor antes de entregar.",
      "Encerrar o dia da creche e Encerrar a chamada fecham vários de uma vez e não perguntam quem buscou.",
    ],
    atencao: ["O sistema não confere documento nem impede a saída: ele mostra a lista e guarda o que a equipe marcou."],
    palavras: ["quem pode buscar", "autorizado", "autorizados a retirar", "retirada", "quem levou", "quem buscou", "portaria", "veterinario de emergencia", "contato de emergencia", "avo busca", "passeador"] },
  { id: "casa-espera", titulo: "Como usar a lista de espera em dia cheio", secao: "creche", usa: ["casa"], quem: "todos", rota: CRECHE, tambem: [PETSHOP],
    passos: [
      "O dono liga a opção uma vez: em Meu pet shop, no cartão Cuidado com o tutor, liga Lista de espera e toca em Salvar opções.",
      "Ao marcar uma reserva num dia cheio, toque em Colocar na lista de espera, embaixo do aviso de vagas. Ou, em Ocupação, no cartão Lista de espera, toque em Colocar na lista.",
      "Confira o pet e as datas e toque em Colocar na lista.",
      "Quando abrir vaga em todos os dias pedidos, aparece o aviso Abriu vaga, em Casa agora e na Chamada. Toque nele.",
      "No cartão Lista de espera, toque em Avisar que abriu vaga: o WhatsApp abre com a mensagem pronta.",
      "O tutor quis? Toque em Marcar reserva e salve. O pet sai da lista sozinho.",
    ],
    dicas: [
      "A vaga abre quando uma reserva é cancelada, quando um hóspede sai antes ou quando um mensalista leva falta no dia.",
      "A ordem da lista é a de chegada.",
      "Com a caixa do link do cliente marcada, o tutor que escolhe um dia cheio pode pedir para entrar na lista. Ele aparece com a etiqueta pediu pelo link.",
      "Tirar remove o pet da lista. Pedido de dia que já passou some sozinho.",
    ],
    atencao: ["Estar na lista não reserva nem ocupa vaga, e o sistema não avisa o tutor sozinho.", "Para o sistema saber que o dia está cheio, o dono preenche as vagas em Meu pet shop, no cartão Creche e hotel."],
    palavras: ["lista de espera", "fila de espera", "sem vaga", "dia cheio", "lotado", "abriu vaga", "desistencia", "cancelou a reserva", "encaixe do hotel"] },
  { id: "casa-ocorrencia", titulo: "Como anotar uma ocorrência (briga, machucado, fuga, vômito)", secao: "creche", usa: ["casa"], quem: "todos", rota: CRECHE, tambem: [HOJE, CLIENTES, PETSHOP],
    passos: [
      "O dono liga a opção uma vez: em Meu pet shop, no cartão Cuidado com o tutor, liga Ocorrências e toca em Salvar opções.",
      "Em Creche e hotel, no cartão do pet que está na casa, toque em Ocorrência. No Diário, o cartão do pet tem o mesmo botão.",
      "Toque no que aconteceu, conte em poucas palavras e confira a hora.",
      "Se o tutor deve saber pelo diário, marque Contar ao tutor na mensagem do diário de hoje.",
      "Toque em Anotar.",
    ],
    dicas: [
      "A ocorrência fica com a hora e o nome de quem anotou.",
      "O dono vê as ocorrências do dia no Hoje, e o histórico de cada pet na ficha dele.",
      "Com Quem pode buscar ligado, o telefone do veterinário do pet aparece na hora de anotar.",
      "No Diário dá para marcar ou desmarcar, em cada ocorrência, se ela vai na mensagem.",
    ],
    atencao: ["Depois de anotada, a ocorrência não pode ser mudada. Só o dono apaga, pela ficha do pet."],
    palavras: ["ocorrencia", "incidente", "briga", "brigou", "machucado", "machucou", "mordida", "fugiu", "fuga", "vomitou", "vomito", "acidente", "passou mal"] },
  { id: "hotel-sinal", titulo: "Como cobrar sinal na reserva", secao: "creche", usa: ["casa"], quem: "caixa", rota: CRECHE, tambem: [PETSHOP],
    passos: [
      "O dono liga a opção uma vez: em Meu pet shop, em Opções do hotel e da creche, liga Sinal na reserva, escolhe Porcentagem do total ou Valor fixo, escreve o que combina sobre o sinal e toca em Salvar opções.",
      "Na reserva nova, em Sinal da reserva, escolha Vai pagar depois, Recebi agora ou Sem sinal. O valor já vem pela regra e dá para mudar.",
      "Em Recebi agora, escolha a forma de pagamento. Em Vai pagar depois, escolha até quando: a conta fica em Financeiro, A receber.",
      "Para pedir o sinal ao tutor, toque em Mensagens no cartão da reserva e em Pedir o sinal.",
      "Quando o tutor pagar, toque em Receber o sinal no cartão da reserva.",
      "No check-out, o sinal aparece numa linha própria e é descontado da conta.",
    ],
    dicas: [
      "O cartão da reserva mostra Sinal pago ou Sinal a receber.",
      "Se o tutor pagar só uma parte do sinal (pelo Recebi, em Financeiro ou em Caixa), o cartão mostra quanto falta e o botão Receber o sinal recebe só o resto. No check-out, o sinal inteiro é descontado e o que falta dele vem marcado para receber junto.",
      "A mensagem Pedir o sinal leva o valor, o texto que o dono escreveu e a chave Pix, se ela estiver preenchida nas opções.",
      "Reserva que já existe e ainda não tem sinal: toque em Sinal no cartão dela.",
      "No link do cliente, o pedido e a confirmação avisam que o sinal vai ser pedido.",
    ],
    atencao: ["O sistema não recebe pagamento: o tutor paga direto para você e alguém marca que recebeu.", "Quem não cuida do caixa vê só Sinal pago ou Sinal a receber, sem o valor."],
    palavras: ["sinal", "adiantamento", "adiantado", "antecipado", "pagamento antecipado", "cobrar um sinal", "sinal na reserva", "sinal da reserva", "entrada na reserva", "caucao", "garantir a reserva", "pedir o sinal", "receber o sinal", "devolver o sinal", "pix"] },
  { id: "hotel-precos", titulo: "Como cobrar por porte, por temporada e dar desconto no segundo pet", secao: "creche", usa: ["hotel"], quem: "dono", rota: PETSHOP, tambem: [CRECHE],
    passos: [
      "Abra Meu pet shop e vá até Opções do hotel e da creche.",
      "Para preço por porte, ligue Diária do hotel por porte e escreva a diária de cada porte.",
      "Para feriado ou férias, ligue Temporadas, toque em Nova temporada, dê um nome, escolha De e Até e diga como muda o preço: Acréscimo em %, Acréscimo em R$ por noite ou Diária própria.",
      "Para o desconto, ligue Desconto para o segundo pet e escreva a porcentagem.",
      "Para o feriado de um dia só, ligue Preço de feriado e diga como muda o preço. As datas você marca no cartão Feriados e dias fechados, com Conta como feriado no preço do hotel.",
      "Toque em Salvar opções.",
    ],
    dicas: [
      "A reserva nova já vem com a diária do porte do pet. Pet sem porte na ficha usa a diária do hotel de sempre.",
      "Na reserva, embaixo do Total previsto, toque em ver noite por noite para ver como o total foi montado.",
      "Noite de feriado que também cai numa temporada usa o preço de feriado.",
      "Quem não cuida do caixa não vê nenhum desses valores.",
      "A estadia que cruza uma temporada é cobrada noite por noite. A noite conta pelo dia em que começa.",
      "O desconto do segundo pet vale nas noites em que dois pets do mesmo tutor estão hospedados juntos. O que entrou primeiro paga a diária cheia.",
      "No check-out, toque em ver noite por noite para conferir. O Valor a receber continua podendo ser mudado na mão.",
      "O que foi cobrado fica guardado na estadia: mudar um preço depois não mexe no histórico.",
    ],
    palavras: ["temporada", "alta temporada", "feriado", "reveillon", "natal", "carnaval", "preco por porte", "diaria por porte", "segundo pet", "desconto segundo pet", "dois pets", "irmaos", "preco diferente", "tarifa", "preco de feriado", "diaria de feriado", "como o total foi montado"] },
  { id: "feriados", titulo: "Como marcar feriados e dias fechados", secao: "ajustes", quem: "dono", rota: PETSHOP, tambem: [CRECHE, AGENDA],
    passos: [
      "Abra Meu pet shop e vá até o cartão Feriados e dias fechados.",
      "Escolha a Data e, se quiser, escreva um Nome (Natal, folga da equipe).",
      "Deixe marcado Fechado: não atendemos nesse dia. Quem tem hotel também pode marcar Conta como feriado no preço do hotel.",
      "Toque em Colocar na lista.",
      "Para não digitar um por um, toque em Colocar os feriados nacionais e confirme: entram os que ainda vão acontecer neste ano e no próximo.",
      "Para tirar uma data, toque na lixeira ao lado dela.",
    ],
    dicas: [
      "Dia fechado: o link do cliente não oferece horário de banho nem vaga de creche nesse dia.",
      "Na agenda e na reserva de creche ou hotel, aparece um aviso quando o dia escolhido é fechado. Dá para marcar mesmo assim.",
      { so: ["creche"], texto: "Na chamada da creche, dia fechado não espera ninguém: nenhum mensalista leva falta nem ocupa vaga." },
      { so: ["creche"], texto: "Mensalista que vier num dia fechado entra por Veio fora do dia, e a tela pergunta se cobra como dia extra ou se não cobra. Nada vem marcado." },
      { so: ["creche"], texto: "Dia fechado não muda a mensalidade: ele fica fora da conta do valor proporcional, como o dia da semana em que a casa não abre." },
      { so: ["hotel"], texto: "Quem está hospedado no hotel continua hospedado no dia fechado, e o link continua aceitando pedido de hotel." },
      { so: ["hotel"], texto: "Feriado no preço só muda a conta se o Preço de feriado estiver ligado em Opções do hotel e da creche." },
      "Feriado da cidade e do estado não entram sozinhos: acrescente pela data.",
      "Lista vazia, nada muda.",
    ],
    atencao: ["Marcar um dia como fechado não cancela o que já estava marcado nele. Confira a agenda desse dia e avise os tutores."],
    palavras: ["feriado", "feriados", "dia fechado", "dias fechados", "fechado no feriado", "nao abre", "folga", "recesso", "natal", "ano novo", "calendario de feriados", "feriado nacional", "fechar um dia"] },
  { id: "taxa-atraso", titulo: "Como cobrar taxa de busca fora do horário", secao: "creche", usa: ["casa"], quem: "caixa", rota: CRECHE, tambem: [PETSHOP],
    passos: [
      "O dono liga a regra uma vez: em Meu pet shop, em Opções do hotel e da creche, liga Taxa de busca fora do horário, escreve a hora (saída depois das) e o Valor da taxa, e toca em Salvar opções.",
      "No check-out de um pet que sai depois dessa hora, aparece a pergunta: a taxa entra na conta?",
      "Toque em Cobrar, o botão que mostra o valor, ou em Não cobrar a taxa.",
      "Confira o Valor a receber e termine o check-out como sempre.",
    ],
    dicas: [
      "A taxa nunca entra sozinha: sem uma das duas respostas, a conta não fecha.",
      "Em Tolerância, o dono diz quantos minutos depois da hora ainda não sugerem a taxa.",
      { so: ["creche"], texto: "Em Encerrar o dia da creche, a taxa vem marcada em cada linha depois da hora. Desmarque de quem não vai pagar e confirme a pergunta antes de gravar." },
      "Check-out feito por quem não cuida do caixa: a pergunta da taxa aparece para quem recebe, na lista Check-outs para cobrar.",
      { so: ["creche"], texto: "Mensalista também entra: no botão Saiu, do cartão ou da Chamada, a pergunta aparece para quem recebe. Veja Como cobrar a taxa de busca fora do horário de um mensalista." },
    ],
    atencao: ["Quem não cuida do caixa não vê a taxa nem o valor dela."],
    palavras: ["taxa de atraso", "atraso", "atrasou", "buscou tarde", "busca fora do horario", "fora do horario", "hora extra", "saida depois do horario", "multa por atraso", "pegou depois", "passou do horario"] },
  { id: "taxa-atraso-mensalista", titulo: "Como cobrar a taxa de busca fora do horário de um mensalista", secao: "creche", usa: ["creche"], quem: "caixa", rota: CRECHE, tambem: [HOJE, PETSHOP],
    passos: [
      "A regra é a mesma do check-out: o dono liga a Taxa de busca fora do horário em Meu pet shop, em Opções do hotel e da creche, com a hora e o valor da creche.",
      "Quando o mensalista for embora, toque em Saiu, no cartão dele em Casa agora ou na Chamada.",
      "Se a saída foi depois da hora, abre a pergunta com a hora da saída e o valor. Toque em Cobrar, o botão que mostra o valor, ou em Não cobrar.",
      "Cobrando, escolha Na próxima mensalidade (a taxa entra na cobrança do mês que vem, com a data) ou Receber agora (escolha a forma de pagamento).",
      "Toque no botão de baixo para confirmar.",
    ],
    dicas: [
      "Nada é cobrado sem resposta. Se tocar em Decidir depois, a saída fica na lista Check-outs para cobrar, em Casa agora, e a tela Hoje avisa.",
      "Quem não cuida do caixa toca em Saiu normalmente e não vê valor: a saída fora do horário fica na lista Check-outs para cobrar, para quem recebe decidir.",
      "Encerrar a chamada também anota as saídas fora do horário, sem cobrar. Em Encerrar o dia da creche, quem recebe decide a taxa na linha do pet.",
      "A taxa mandada para a mensalidade aparece em Gerar cobranças, na cobrança do pet e na mensagem de cobrança, separada dos dias extras.",
      "Desfazer a saída na Chamada apaga a anotação. Se a taxa já foi cobrada, cancele a cobrança do mês ou apague o recebimento no Financeiro antes.",
      "Vale a hora da saída com a tolerância que o dono escreveu. Com a regra desligada, nada disso aparece.",
    ],
    atencao: ["Quem não cuida do caixa não vê a taxa nem o valor dela."],
    palavras: ["taxa de atraso do mensalista", "mensalista atrasou", "mensalista saiu tarde", "buscou tarde", "busca fora do horario", "fora do horario", "taxa na mensalidade", "atraso na mensalidade", "hora extra da creche", "passou do horario", "decidir a taxa", "mensalista", "day care", "escolinha"] },
  { id: "checkouts-para-cobrar", titulo: "Como receber um check-out que ficou sem cobrança", secao: "creche", usa: ["casa"], quem: "caixa", rota: CRECHE, tambem: [HOJE],
    passos: [
      "Em Creche e hotel, abra Casa agora. No alto fica a lista Check-outs para cobrar.",
      "Toque em Receber, na linha do pet. O botão mostra o valor da conta quando ele já dá para calcular.",
      "A conta abre pronta: diárias, taxas combinadas e o sinal descontado. Confira o Valor a receber.",
      "Escolha Paga agora e a forma de pagamento, ou Cliente paga depois.",
      "Toque em Receber, o botão que mostra o valor.",
    ],
    dicas: [
      "A lista aparece quando alguém que não cuida do caixa fez o check-out. A tela Hoje também avisa: toque no aviso para ir direto.",
      "A hora da saída continua sendo a do check-out. Se ela passou da hora da taxa de busca fora do horário, a pergunta da taxa aparece aqui.",
      "Para não cobrar, apague o Valor a receber e toque em Fechar sem cobrar: a estadia fica como cortesia e sai da lista.",
      "Se o pet tem pacote com saldo, dá para escolher Usar do pacote.",
      "Em Histórico, a estadia sem cobrança mostra o botão Receber, que abre a mesma conta.",
      { so: ["creche"], texto: "Mensalista que saiu depois do horário, com a taxa de busca fora do horário ligada, também aparece nesta lista: toque no botão da taxa e escolha Cobrar ou Não cobrar." },
    ],
    atencao: ["Quem não cuida do caixa não vê esta lista."],
    palavras: ["check-outs para cobrar", "check-out para cobrar", "check-out sem cobranca", "saiu sem cobrar", "saiu sem pagar", "monitor fez check-out", "cobranca pendente", "pendencia do hotel", "receber depois do check-out", "acertar estadia"] },
  { id: "hotel-taxas", titulo: "Como cobrar taxas na conta do hotel (táxi dog, banho de saída)", secao: "creche", usa: ["casa"], quem: "caixa", rota: CRECHE, tambem: [PETSHOP],
    passos: [
      "O dono cria a lista uma vez: em Meu pet shop, em Opções do hotel e da creche, liga Taxas opcionais, toca em Nova taxa, escreve o nome e o valor e escolhe Uma vez na conta ou Por noite (ou por dia). Depois, Salvar opções.",
      "Na reserva, em Taxas combinadas, marque as que valem para aquela estadia.",
      "No check-out, em Taxas desta estadia, confira: dá para marcar ou desmarcar.",
      "O valor de cada taxa marcada entra na conta, numa linha própria.",
    ],
    dicas: ["Nenhuma taxa entra sozinha: só a que alguém marcar.", "Para um valor que não está na lista, use Outro extra, no check-out."],
    palavras: ["taxa", "taxas", "taxi dog", "leva e traz do hotel", "banho de saida", "medicacao", "saida depois do horario", "taxa extra", "adicional"] },
  { id: "hotel-acomodacoes", titulo: "Como escolher o canil ou o quarto do hóspede", secao: "creche", usa: ["hotel"], quem: "todos", rota: CRECHE, tambem: [PETSHOP],
    passos: [
      "O dono cria a lista uma vez: em Meu pet shop, em Opções do hotel e da creche, liga Acomodações, toca em Nova acomodação, escreve o nome e quantos pets cabem. Depois, Salvar opções.",
      "Na reserva, no check-in ou em Editar, escolha em Acomodação. Cada uma mostra quantos hóspedes já tem nessas datas.",
      "Salve. O nome da acomodação aparece no cartão do pet, na Ocupação e na Folha do dia.",
    ],
    dicas: ["Se a acomodação já estiver cheia nas datas, o sistema avisa e pergunta se é para colocar mesmo assim."],
    palavras: ["canil", "baia", "box", "quarto", "suite", "acomodacao", "gaiola", "onde o pet fica", "gatil"] },
  { id: "creche-preco", titulo: "Como definir a diária e as vagas da creche e do hotel", secao: "creche", usa: ["casa"], quem: "dono", rota: PETSHOP, tambem: [CRECHE],
    passos: [
      "Abra Meu pet shop.",
      "Vá até o cartão Creche e hotel.",
      "Escreva a Diária da creche (por dia) e a Diária do hotel (por noite).",
      "Escreva as Vagas da creche e as Vagas do hotel. Em branco fica sem limite.",
      "Toque em Salvar creche e hotel.",
    ],
    dicas: [
      "A tela Creche e hotel mostra quantas vagas estão tomadas hoje. Quando lota, a faixa do alto diz casa cheia.",
      "Quando a casa enche em algum dia do período, o sistema avisa na reserva, no check-in e no pedido pelo link, e só passa do limite se você confirmar.",
      "Para ver a lotação dos próximos dias, abra Creche e hotel e toque em Ocupação.",
      "Preço por porte, temporada, desconto do segundo pet e taxas ficam no cartão Opções do hotel e da creche.",
      { so: ["creche"], texto: "No mesmo cartão fica a chave Bloquear check-in na creche com vacina vencida." },
    ],
    palavras: ["preco da diaria", "valor da diaria", "diaria da creche", "diaria do hotel", "preco da creche", "preco do hotel", "vagas da creche", "vagas do hotel", "casa cheia", "lotado", "lotada", "lotacao", "lotou", "cheio", "cheia", "quantas vagas", "ocupacao"] },
  { id: "creche-link", titulo: "Como receber pedidos de creche e hotel pelo link", secao: "creche", usa: ["casa"], quem: "todos", rota: CRECHE, tambem: [AGENDA, PETSHOP],
    passos: [
      "O dono abre Meu pet shop e, no cartão Link de agendamento, liga a chave do link.",
      "Logo abaixo, em Pelo link, o cliente também pode pedir, o dono marca Vaga na creche e Vaga no hotel. As mesmas opções ficam no fim da tela Creche e hotel, em Casa agora.",
      "Mande o link para o cliente: em Meu pet shop, toque em Copiar link ou em Mandar no WhatsApp.",
      "Quando o pedido chegar, ele aparece em Pedidos pelo link, na tela Hoje e na Agenda.",
      "Toque em Aceitar ou em Recusar.",
      "Depois, toque em Confirmar no WhatsApp para avisar o tutor. Se já avisou por outro caminho, toque em Já avisei.",
    ],
    dicas: [
      "Ao aceitar, a reserva é criada e aparece em Creche e hotel, em Reservas.",
      "Se a casa estiver cheia naquele dia, o sistema avisa antes de aceitar.",
      "No link, o cliente escolhe a hora de chegada e a hora de buscar, e pode pedir vaga para até 4 pets no mesmo pedido.",
      "O pedido respondido continua na lista até alguém avisar o tutor, mesmo depois de fechar e abrir a tela.",
      "Com o Sinal na reserva ligado, o link e a mensagem de confirmação já avisam o valor do sinal.",
      "Se o telefone do pedido já for de um tutor, o sistema pergunta É a mesma pessoa? antes de criar a ficha.",
      { so: ["banho"], texto: "Quem tem banho e tosa também acha o link na tela Hoje, em Mandar link de agendamento, e na Agenda, em Link do cliente." },
    ],
    palavras: ["pedido de creche", "pedido de hotel", "pedidos de creche", "creche e hotel pelo link", "reserva pelo link", "cliente reservar", "reserva online", "hospedagem pelo link", "pedir vaga", "vaga pelo link"] },
  { id: "mensalista", titulo: "Como cadastrar um mensalista da creche", secao: "creche", usa: ["creche"], quem: "todos", rota: CRECHE, tambem: [CLIENTES],
    passos: [
      "Abra Creche e hotel e toque em Mensalistas, no alto.",
      "Toque em Novo mensalista e escolha o pet.",
      "Toque nos dias da semana em que ele vem. A tela mostra quantos mensalistas já vêm em cada dia, contra as vagas da creche.",
      "Escolha o dia em que o plano começa e o dia do vencimento.",
      "Quem vê o financeiro preenche a Mensalidade e, se quiser, o Preço do dia extra. Em branco, o dia extra entra na cobrança sem valor.",
      "Toque em Cadastrar mensalista.",
    ],
    dicas: [
      "Também dá para criar o plano pela ficha do pet, no cartão Creche: mensalista, em Tornar mensalista.",
      "Para mudar os dias ou o valor, toque no mensalista e em Alterar plano. Lá também ficam Pausar o plano por uns dias e Encerrar o plano hoje.",
      "Na pausa (viagem, doença) o pet não entra na chamada, não leva falta e não ocupa vaga.",
      "Dia em que o pet shop não abre, pelo horário de Meu pet shop, não conta como dia do plano nem como falta.",
    ],
    atencao: ["Cada pet tem um plano só. Quem não vê o financeiro cadastra os dias, mas não vê nem preenche os valores."],
    palavras: ["dia fixo", "plano da creche", "mensalista", "mensalistas", "mensalidade", "plano mensal", "dias fixos", "escolinha", "day care", "daycare", "creche canina", "matricula", "matricular", "pausar plano", "pausa"] },
  { id: "chamada", titulo: "Como fazer a chamada do dia na creche", secao: "creche", usa: ["creche"], quem: "todos", rota: CRECHE, tambem: [HOJE],
    passos: [
      "Abra Creche e hotel. Com mensalistas cadastrados, a tela já abre em Chamada, com quem deve vir hoje.",
      "Quando o pet chegar, toque em Chegou. Nada é cobrado: o dia já está no plano.",
      "Quando ele for embora, toque em Saiu. A hora fica anotada.",
      "Se não veio, toque em Faltou. Se o tutor avisou, marque Avisou. O botão Perguntar abre o WhatsApp do tutor com uma mensagem pronta.",
      "Tocou errado? Toque em Desfazer na linha do pet.",
      "No fim do dia, toque em Encerrar a chamada: quem está na casa sai e quem não veio fica com falta.",
    ],
    dicas: [
      "Esqueceu de fazer a chamada ontem? No alto da chamada, toque em Ontem ou escolha outro dia deste mês. Dia que ainda não chegou não abre.",
      "A etiqueta vermelha de vacina vencida aparece na linha do pet. Em Meu pet shop, o dono pode ligar Bloquear check-in na creche com vacina vencida: aí só o dono libera a entrada.",
      "Pet sem plano entra pelo botão Nova reserva / Check-in, como sempre.",
      "As vagas de hoje contam os mensalistas que ainda vão chegar.",
      "Dia marcado como fechado em Meu pet shop (feriado, folga) não espera ninguém e não dá falta. Se algum mensalista vier, toque em Veio fora do dia.",
      "Com a taxa de busca fora do horário ligada, a saída depois da hora fica anotada. Quem recebe vê a pergunta Cobrar ou Não cobrar; os outros não veem valor.",
    ],
    palavras: ["falta na creche", "nao veio na creche", "roll call", "chamada", "chamada do dia", "chegou", "saiu", "faltou", "falta", "presenca", "quem vem hoje", "lista de presenca", "escolinha", "day care", "mensalista"] },
  { id: "dia-extra", titulo: "Como lançar um dia extra ou uma reposição", secao: "creche", usa: ["creche"], quem: "todos", rota: CRECHE,
    passos: [
      "Em Creche e hotel, na Chamada, toque em Veio fora do dia.",
      "Toque no mensalista que veio num dia que não é do plano dele.",
      "Se for reposição de uma falta, marque É reposição de falta (não cobrar).",
      "Toque em Marcar dia extra (ou Marcar reposição).",
    ],
    dicas: [
      "O dia extra não é cobrado na porta: ele entra, com a data, na cobrança do mês seguinte.",
      "A saída é igual à dos outros: toque em Saiu.",
      "Em dia marcado como fechado (feriado, folga) ninguém tem o dia no plano. A tela pergunta Cobrar como dia extra ou Não cobrar, e nada vem marcado: o dia só vira dia extra se você escolher.",
    ],
    palavras: ["dia extra", "extra", "veio fora do dia", "reposicao", "repor falta", "dia avulso do mensalista", "mensalista", "escolinha", "day care"] },
  { id: "cobrancas-creche", titulo: "Como gerar e mandar as cobranças do mês", secao: "creche", usa: ["creche"], quem: "financeiro", rota: CRECHE, tambem: [HOJE],
    passos: [
      "Abra Creche e hotel e toque em Cobranças, no alto.",
      "As mensalidades cheias do mês já aparecem sozinhas quando você abre a tela. Para as que pedem conferência (plano que começou no meio do mês ou teve pausa), toque em Gerar cobranças.",
      "Confira a lista: mensalidade, dias extras do mês anterior com as datas e o total. No plano que começou no meio do mês, a tela sugere o valor proporcional e você pode mudar.",
      "Toque no botão Gerar. Cada cobrança vira uma conta em Financeiro, A receber.",
      "Em Vencem hoje ou Atrasadas, toque em Cobrar: o WhatsApp abre com a mensagem pronta e você aperta enviar. Irmãos do mesmo tutor vão numa mensagem só.",
    ],
    dicas: [
      "Gerar de novo nunca duplica: só entra quem ainda não tem cobrança no mês.",
      "Ver a mensagem deixa mudar o texto antes de mandar. Depois de mandar, fica a marca cobrado em, com a data.",
      "Para dar desconto, mudar o vencimento ou cancelar, toque em Alterar na cobrança. A conta em A receber acompanha.",
      "A tela Hoje avisa quando vencem mensalidades e quando há atrasadas.",
      "Taxa de busca fora do horário que quem recebe mandou para a mensalidade entra aqui como os dias extras: na cobrança do mês seguinte, com a data.",
      "No valor proporcional, o dia em que a casa não abre fica fora da conta: tanto o dia da semana fechado quanto a data marcada em Feriados e dias fechados. Feriado no mês não dá desconto sozinho.",
    ],
    atencao: ["O sistema não manda mensagem nem cobra sozinho. A mensagem não fala de multa nem de juros: se quiser, escreva antes de enviar."],
    palavras: ["cobranca", "cobrancas", "mensalidade", "mensalidades", "gerar cobrancas", "cobrar mensalidade", "vencimento", "atrasada", "inadimplente", "pro-rata", "proporcional", "escolinha", "day care", "mensalista", "dia extra"] },
  { id: "baixa-mensalidade", titulo: "Como dar baixa numa mensalidade", secao: "creche", usa: ["creche"], quem: "financeiro", rota: CRECHE, tambem: [FINANCEIRO],
    passos: [
      "Em Creche e hotel, toque em Cobranças.",
      "Na cobrança do pet, toque em Receber.",
      "Escolha como recebeu. Para duas formas, toque em Dividir o pagamento.",
      "Confira o dia em que recebeu e toque em Dar baixa.",
    ],
    dicas: [
      "A mesma conta está em Financeiro, A receber: dar baixa por lá tem o mesmo efeito.",
      "O tutor pagou só uma parte? Em Quanto o cliente está pagando, escreva o valor. A cobrança passa a mostrar pago e falta, e a mensagem de cobrança pede só o que falta.",
      "Recebendo hoje com o caixa aberto, o valor entra no caixa.",
      "Deu baixa errado? Em Pagas, toque em Desfazer.",
    ],
    palavras: ["dar baixa mensalidade", "receber mensalidade", "mensalidade paga", "pagou a mensalidade", "mensalidade", "escolinha", "day care", "mensalista"] },
  { id: "faltas-extras", titulo: "Como ver as faltas e os extras do mês", secao: "creche", usa: ["creche"], quem: "todos", rota: CRECHE, tambem: [CLIENTES],
    passos: [
      "Abra Creche e hotel e toque em Mensalistas.",
      "Cada mensalista mostra o resumo do mês: presenças, faltas e dias extras.",
      "Toque no mensalista para ver este mês e o mês passado, com as datas dos extras, das faltas e das reposições.",
    ],
    dicas: [
      "O mesmo resumo fica na ficha do pet, no cartão Creche: mensalista.",
      "Sem chamada são os dias do plano que passaram sem ninguém marcar presença nem falta. Abra a chamada daquele dia para acertar.",
      "No alto de Mensalistas, o quadro por dia da semana mostra quantos mensalistas vêm em cada dia, contra as vagas.",
    ],
    palavras: ["falta na creche", "faltas", "falta", "extras", "dias extras", "resumo do mes", "presencas", "frequencia", "ocupacao por dia", "mensalista", "escolinha", "day care", "chamada"] },
  /* ---------- Dinheiro ---------- */
  { id: "conta", titulo: "Como receber e fechar a conta do atendimento", secao: "dinheiro", usa: ["banho"], quem: "caixa", rota: AGENDA, tambem: [HOJE, CAIXA],
    passos: [
      "Toque no horário do pet, na Agenda ou na tela Hoje.",
      "Toque em Fechar a conta. Se o pet tem pacote para o serviço, o primeiro botão é Concluir usando o pacote (sem cobrar), e o de cobrar se chama Cobrar à parte, sem usar o pacote.",
      "Confira o serviço e o valor.",
      { so: ["loja"], texto: "Em Levou mais alguma coisa?, busque produtos do estoque pelo nome." },
      "Para somar outra coisa na conta, toque em Outro extra, escreva o que é e o valor.",
      "Se tiver desconto, escreva em Desconto em reais.",
      "Escolha a Forma de pagamento: Pix, Dinheiro, Débito, Crédito ou Outro. Nenhuma vem escolhida.",
      "Toque em Receber, o botão que mostra o valor.",
    ],
    dicas: [
      "O valor entra no caixa aberto. Com o caixa fechado, o valor entra só no financeiro do dia, fora da contagem da gaveta.",
      { so: ["loja"], texto: "Os produtos da conta saem do estoque sozinhos." },
      "Depois de receber, aparece o botão Mandar comprovante.",
      "O pet fez mais um serviço da sua lista (uma hidratação, um corte de unha)? Toque em Outro serviço e escolha: ele entra na conta com o valor dele e conta para a comissão. Outro extra é para o que não está na lista de serviços.",
      "Pagando em Dinheiro, aparece Recebeu quanto?: escreva quanto o cliente entregou para ver o troco.",
    ],
    atencao: ["Só quem tem a área Caixa ou Financeiro recebe. Os outros tocam em Concluir atendimento, e o pagamento fica para depois."],
    palavras: ["receber", "pagamento", "pagar", "fechar conta", "fechar a conta", "comanda", "cobrar o atendimento", "pix", "desconto", "concluir", "forma de pagamento"] },
  { id: "dividir", titulo: "Como dividir o pagamento em duas formas", secao: "dinheiro", quem: "caixa", rota: CAIXA, tambem: [AGENDA, FINANCEIRO],
    passos: [
      "Na hora de receber, abaixo da forma de pagamento, toque em Dividir o pagamento.",
      "Na primeira parte, escolha a forma e escreva o valor.",
      "Na segunda parte, escolha a outra forma. O valor se completa sozinho com o que falta.",
      "Se forem três formas, toque em Mais uma forma.",
      "Com as formas e os valores preenchidos, aparece o aviso Fecha certinho com o total: toque em Receber. Se aparecer Falta ou Passou, acerte os valores.",
    ],
    dicas: ["Exemplo: parte no Pix e parte em dinheiro.", "Para voltar atrás, toque em Pagar com uma forma só."],
    palavras: ["dividir", "dividir pagamento", "pagamento dividido", "duas formas", "metade no pix", "parte no pix", "parte em dinheiro", "parte no cartao", "split"] },
  { id: "paga-depois", titulo: "Como anotar quando o cliente paga depois", secao: "dinheiro", quem: "caixa", rota: FINANCEIRO, tambem: [AGENDA, PACOTES, CRECHE],
    passos: [
      "Na hora de receber (conta do atendimento, pacote ou check-out), toque em Cliente paga depois.",
      "Em Quando vai pagar, escolha o dia combinado, de hoje em diante.",
      "Toque no botão de baixo, que agora diz Anotar e o valor a receber.",
    ],
    dicas: ["Nada entra no caixa agora. A conta fica em Financeiro, na aba A receber, e na ficha do tutor.", "A tela Hoje avisa quando o dia combinado chega.", "Na venda no balcão também tem Cliente paga depois: antes, toque em Dizer quem comprou, para a conta ficar no nome do tutor.", "Quando o cliente pagar, toque em Recebi: na tela Caixa, em Contas de clientes, ou na ficha do tutor."],
    palavras: ["paga depois", "pagar depois", "vai pagar", "paga semana que vem", "paga amanha", "fica devendo", "fiado", "pendurar", "deve", "devendo", "anotar a receber", "nao pagou", "ainda nao pagou", "cliente paga depois"] },
  { id: "dar-baixa", titulo: "Como dar baixa quando o cliente paga o que devia", secao: "dinheiro", quem: "caixa", rota: CAIXA, tambem: [FINANCEIRO, CLIENTES, AGENDA],
    passos: [
      "Abra Caixa e desça até Contas de clientes. Quem vê o financeiro também acha a conta em Financeiro, na aba A receber.",
      "Ache o cliente e a conta.",
      "Toque em Recebi, ao lado da conta.",
      "Em Quanto o cliente está pagando, confira o valor. Ele já vem com o que o cliente deve.",
      "Em Como recebeu, escolha a forma. Nenhuma vem escolhida.",
      "Se aparecer Dia em que recebeu, confira a data. Esse campo é só de quem vê o financeiro: para os outros, entra com a data de hoje.",
      "Toque em Dar baixa.",
    ],
    dicas: [
      "Recebendo hoje com o caixa aberto, o valor entra no caixa. Em dinheiro, conta na gaveta.",
      "O mesmo botão Recebi aparece na ficha do tutor, no cartão Ficou de pagar.",
      "Se a conta veio de um horário, também dá para abrir o horário na Agenda e tocar em O cliente pagou.",
      "Na aba A pagar do Financeiro funciona igual, com o botão Paguei.",
    ],
    atencao: ["A tela Financeiro só abre para quem tem a área Financeiro. Quem tem só o Caixa recebe pela tela Caixa, pela ficha do tutor ou pelo horário, na Agenda."],
    palavras: ["cliente pagou", "pagou o que devia", "recebi o fiado", "quitar", "quitou", "a receber", "pagou a conta", "dar baixa", "recebi", "paguei"] },
  { id: "receber-parte", titulo: "Como receber só uma parte do que o cliente deve", secao: "dinheiro", quem: "caixa", rota: CAIXA, tambem: [FINANCEIRO, CLIENTES, CRECHE],
    passos: [
      "Ache a conta do cliente: em Caixa, no cartão Contas de clientes, ou na ficha do tutor.",
      "Toque em Recebi.",
      "Em Quanto o cliente está pagando, apague o valor e escreva só o que ele pagou agora.",
      "Aparece Fica faltando, com o resto. Se ele combinou outro dia para pagar o resto, escolha em Quando ele paga o resto.",
      "Em Como recebeu, escolha a forma.",
      "Toque em Receber, o botão que mostra o valor.",
    ],
    dicas: [
      "O que foi pago entra como dinheiro de hoje (no caixa aberto). O resto continua na mesma conta, em Contas de clientes e na ficha do tutor.",
      "A conta passa a mostrar quanto já foi pago, como pago R$ 50,00 de R$ 120,00. Dentro dela, Já recebido desta conta mostra cada parte: dia, valor, forma e quem recebeu.",
      "Vale para fiado, pacote vendido a prazo, mensalidade da creche e hotel.",
      "Se uma parte foi lançada errada e for excluída, o valor dela volta a ficar em aberto na conta.",
    ],
    palavras: ["parcial", "pagamento parcial", "metade", "pagou metade", "pagou uma parte", "uma parte", "so uma parte", "abater", "abateu", "resto", "ficou faltando", "falta pagar", "pagar aos poucos"] },
  { id: "contas-clientes", titulo: "Como ver quem está devendo", secao: "dinheiro", quem: "caixa", rota: CAIXA, tambem: [CLIENTES, FINANCEIRO],
    passos: [
      "Abra Caixa.",
      "Desça até o cartão Contas de clientes.",
      "Cada cliente aparece com quanto deve, quantas contas tem e desde quando. O que já venceu aparece como em atraso.",
      "Embaixo do nome ficam as contas dele, cada uma com o botão Recebi.",
    ],
    dicas: [
      "O cartão aparece com o caixa aberto ou fechado.",
      "Na ficha do tutor, o cartão Ficou de pagar mostra só as contas dele.",
      "Quem vê o financeiro tem a lista completa em Financeiro, na aba A receber, com as contas que não são de clientes.",
    ],
    palavras: ["fiado", "deve", "devendo", "quem deve", "quem esta devendo", "devedores", "contas de clientes", "em aberto", "pendurado", "caderneta", "ficou de pagar"] },
  { id: "cobrar", titulo: "Como cobrar pelo WhatsApp quem está devendo", secao: "dinheiro", quem: "caixa", rota: CAIXA, tambem: [CLIENTES],
    passos: [
      "Abra Caixa e desça até Contas de clientes. Ou abra a ficha do tutor.",
      "Embaixo das contas do cliente, toque em Cobrar no WhatsApp.",
      "A mensagem já vem pronta, com o que está em aberto, as datas e o total. Mude o que quiser.",
      "Toque em Abrir o WhatsApp e aperte enviar.",
    ],
    dicas: [
      "Quem manda a mensagem é você: o sistema só deixa o texto pronto. Nada sai sozinho.",
      "Depois de cobrar, a conta mostra cobrado em, com o dia e a hora, e o botão vira Cobrar de novo no WhatsApp.",
      "O dono muda o modelo da mensagem e coloca a chave Pix em Meu pet shop, Opções de cobrança.",
      "A mensagem só fala em multa e juros se o dono ligou essa opção e marcou Mostrar a multa e os juros na mensagem de cobrança.",
      "As mensalidades da creche têm a cobrança própria, em Creche, Cobranças.",
    ],
    atencao: ["Sem WhatsApp na ficha do tutor, o botão não aparece. Coloque o telefone na ficha."],
    palavras: ["cobrar", "cobranca", "cobrar no whatsapp", "cobrar cliente", "cobrar fiado", "lembrar de pagar", "mensagem de cobranca", "cobrado em", "cobrar de novo"] },
  { id: "troco", titulo: "Como calcular o troco do cliente", secao: "dinheiro", quem: "caixa", rota: CAIXA, tambem: [AGENDA, FINANCEIRO],
    passos: [
      "Na hora de receber, em Forma de pagamento, toque em Dinheiro.",
      "Aparece o campo Recebeu quanto?. Escreva quanto o cliente entregou.",
      "Ao lado aparece Troco, com o valor para devolver.",
      "Termine o recebimento como sempre.",
    ],
    dicas: [
      "É só uma ajuda: o que fica anotado é o valor da conta, não o que você digitou em Recebeu quanto?.",
      "No pagamento dividido, o troco é calculado sobre a parte em dinheiro.",
      "Aparece em todo lugar que recebe: conta do atendimento, venda no balcão, pacote, check-out e Recebi.",
    ],
    palavras: ["troco", "troco do cliente", "calcular troco", "calculadora de troco", "recebeu quanto", "quanto de troco", "devolver troco"] },
  { id: "multa", titulo: "Como cobrar multa e juros de conta atrasada", secao: "dinheiro", quem: "dono", rota: PETSHOP, tambem: [CAIXA, FINANCEIRO],
    passos: [
      "Abra Meu pet shop e desça até Opções de cobrança.",
      "Ligue a chave Multa e juros por atraso.",
      "Preencha o que você cobra: Multa em reais (uma vez), Multa em % (uma vez) e Juros em % ao mês. Pode ser um só.",
      "Confira o exemplo que aparece embaixo e toque em Salvar opções de cobrança.",
      "Daí em diante, a conta atrasada mostra o valor com multa e juros, e o Recebi mostra o botão Somar multa e juros.",
      "Ao receber, toque em Somar multa e juros se for cobrar. O valor aparece num campo: dá para mudar ou tocar em Tirar.",
    ],
    dicas: [
      "A multa nunca entra sozinha: sem tocar em Somar multa e juros, a conta é recebida pelo valor normal.",
      "O que for cobrado de multa entra separado, na categoria Multa e juros.",
      "Os juros contam por dia de atraso, sobre o que ainda falta pagar.",
      "Quem recebe (área Caixa) vê a sugestão e decide na hora. Só o dono muda a regra.",
      "Para a mensagem de cobrança mostrar a multa, marque Mostrar a multa e os juros na mensagem de cobrança.",
      "Desligado, nada disso aparece.",
    ],
    palavras: ["multa", "juros", "multa e juros", "atraso", "conta atrasada", "mora", "valor atualizado", "cobrar atraso", "taxa de atraso"] },
  { id: "opcoes-cobranca", titulo: "Como mudar a mensagem de cobrança e colocar a chave Pix", secao: "dinheiro", quem: "dono", rota: PETSHOP, tambem: [FINANCEIRO],
    passos: [
      "Abra Meu pet shop e desça até Opções de cobrança. Em Financeiro, na aba A receber, o atalho Opções de cobrança leva para lá.",
      "Em Chave Pix, escreva a sua chave. Em branco, ela não aparece na mensagem.",
      "Em Mensagem de cobrança, mude o texto do seu jeito. Deixe {contas} onde entra a lista do que o cliente deve.",
      "Toque em Ver como fica para conferir com um exemplo.",
      "Toque em Salvar opções de cobrança.",
    ],
    dicas: ["Para desfazer as mudanças do texto, toque em Voltar ao modelo padrão.", "Na hora de cobrar, quem manda ainda pode mudar a mensagem daquele cliente."],
    palavras: ["chave pix", "pix na mensagem", "mensagem de cobranca", "modelo de cobranca", "opcoes de cobranca", "texto da cobranca"] },
  { id: "comprovante", titulo: "Como mandar o comprovante pelo WhatsApp", secao: "dinheiro", usa: ["banho"], quem: "caixa", rota: AGENDA,
    passos: [
      "Receba a conta do atendimento.",
      "Na janela Conta fechada, toque em Mandar comprovante.",
      "O WhatsApp abre com o comprovante escrito. Toque em enviar.",
    ],
    dicas: ["Para mandar mais tarde, abra o horário concluído na Agenda e toque em Mandar comprovante.", "O botão aparece quando o tutor tem telefone na ficha."],
    atencao: ["O comprovante não é nota fiscal. O sistema não emite nota fiscal."],
    palavras: ["comprovante", "recibo", "mandar comprovante", "comprovante de pagamento"] },
  { id: "caixa", titulo: "Como abrir o caixa", secao: "dinheiro", quem: "caixa", rota: CAIXA,
    passos: [
      "Abra Caixa.",
      "Toque em Abrir o caixa.",
      "Em Troco inicial em dinheiro, confira quanto tem na gaveta agora. O campo já vem com o que foi contado no último fechamento: mude se for diferente. Se não tem nada, deixe em branco.",
      "Toque em Abrir o caixa de novo para confirmar.",
    ],
    dicas: [
      "Com o caixa aberto, o que você recebe durante o dia entra nele sozinho.",
      "O caixa aberto mostra dois números no alto: Dinheiro na gaveta e Recebido hoje (tudo o que entrou hoje, em qualquer forma). Os outros totais ficam em Ver detalhes e em Ver detalhes do caixa.",
      "Foi receber e o caixa estava fechado? O aviso O caixa de hoje não está aberto tem o botão Abrir o caixa agora: o caixa abre ali mesmo e o valor já entra nele.",
      "O troco daqui é o dinheiro que começa o dia na gaveta. O troco de cada cliente tem ajuda própria: veja Como calcular o troco do cliente.",
      "Pelo Mozart: \"abre o caixa com 100 de troco\".",
    ],
    palavras: ["troco da gaveta", "caixa", "abrir caixa", "abrir o caixa", "gaveta", "troco inicial", "comecar o dia", "dinheiro na gaveta", "recebido hoje", "ver detalhes"] },
  { id: "caixa-movimento", titulo: "Como anotar uma entrada ou uma saída no caixa", secao: "dinheiro", quem: "caixa", rota: CAIXA,
    passos: [
      "Com o caixa aberto, toque em Entrada (dinheiro que entrou) ou em Saída (despesa paga).",
      "Escreva o valor.",
      "Escolha como recebeu ou como pagou.",
      "Escolha a categoria e, se quiser, escreva uma descrição.",
      "Toque em Lançar.",
    ],
    dicas: [
      "Use Saída para despesa do pet shop, como fornecedor ou motoboy.",
      { so: ["loja"], texto: "Venda no balcão, na mesma tela, vende produtos do estoque." },
      "Para corrigir um lançamento, toque nele na lista do caixa.",
    ],
    atencao: [
      "Valor já recebido não some sem deixar marca. Se alguém altera, fica anotado quem mudou, quando e o valor de antes. Se alguém exclui, o lançamento vai para a lista Apagados deste caixa.",
      "Quem tem só a área Caixa corrige apenas o que ela mesma lançou, e só enquanto o caixa está aberto. O resto é com o dono ou com quem vê o financeiro.",
    ],
    palavras: ["lancar no caixa", "entrada no caixa", "saida no caixa", "saida do caixa", "paguei", "avulso", "motoboy", "corrigir entrada", "apagados", "alterado"] },
  { id: "caixa-gaveta", titulo: "Como tirar ou colocar dinheiro na gaveta (sangria e suprimento)", secao: "dinheiro", quem: "caixa", rota: CAIXA,
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
  { id: "caixa-fechar", titulo: "Como fechar o caixa", secao: "dinheiro", quem: "caixa", rota: CAIXA,
    passos: [
      "No fim do dia, abra Caixa e toque em Fechar o caixa.",
      "Conte o dinheiro da gaveta.",
      "Escreva o valor em Quanto tem na gaveta. Pix e cartão não entram nesta conta.",
      "Toque em Fechar o caixa e confirme.",
    ],
    dicas: [
      "O sistema mostra se bateu certinho, se sobrou ou se faltou.",
      "Se alguém receber enquanto você conta, o sistema avisa quanto entrou, mostra o novo valor esperado e pede para você conferir e tocar em Fechar o caixa de novo.",
      "Se quiser, escreva uma observação, como \"faltou troco\".",
    ],
    atencao: ["Depois de fechado, os lançamentos daquele caixa não mudam mais de valor nem podem ser excluídos. Para corrigir, lance um ajuste no caixa de hoje."],
    palavras: ["fechar caixa", "fechar o caixa", "conferir", "bateu", "sobrou", "faltou dinheiro", "quebra de caixa", "fim do dia", "fechamento"] },
  { id: "caixa-exportar", titulo: "Como ver os caixas antigos e exportar", secao: "dinheiro", quem: "financeiro", rota: CAIXA,
    passos: [
      "Abra Caixa.",
      "Para baixar a planilha do caixa aberto, toque em Exportar, no alto.",
      "Para ver um caixa antigo, desça até Caixas fechados e toque nele.",
      "Na janela do caixa, toque em Exportar para baixar a planilha.",
    ],
    dicas: ["A planilha traz o resumo do caixa e cada lançamento, com a forma de pagamento."],
    atencao: ["Exportar e os lançamentos dos caixas fechados são do dono e de quem vê o financeiro. Quem tem só a área Caixa abre o caixa antigo e vê a conferência da gaveta."],
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
    dicas: ["A tela mostra o que está em atraso, o que vence hoje e nos próximos 7 dias.", "Quando pagar ou receber, toque em Paguei ou em Recebi, ao lado da conta.", "A tela Hoje avisa das contas que vencem até hoje."],
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
    dicas: ["Para corrigir ou excluir, abra a aba Lançamentos e toque no lançamento.", "Lançamento de um caixa já fechado não muda mais de valor.", "Escreva o valor sem sinal de menos: quem diz se é Entrada ou Saída é o botão de cima."],
    palavras: ["lancamento", "lancar", "novo lancamento", "despesa", "gasto", "corrigir lancamento", "excluir lancamento", "lancei errado"] },
  { id: "quanto-entrou", titulo: "Como ver quanto entrou: hoje, na semana e no mês", secao: "dinheiro", quem: "caixa", rota: RELATORIOS, tambem: [HOJE, FINANCEIRO],
    passos: [
      "Hoje: abra a tela Hoje e veja o quadro Entrou hoje.",
      "Na semana: a tela Hoje mostra Recebido esta semana, de segunda até hoje (para quem vê o financeiro). Em Relatórios, toque em Esta semana e veja o Faturamento.",
      "No mês: abra Financeiro. A aba Resumo mostra quanto entrou, quanto saiu e o Resultado do mês.",
      "Outro período: em Relatórios, toque em Personalizado e escolha o dia inicial e o final.",
    ],
    dicas: [
      "Pelo Mozart é mais rápido: pergunte \"quanto entrou essa semana?\".",
      "Faturamento conta só o que já foi recebido. O que ficou para o cliente pagar depois está em Financeiro, A receber.",
      "O que entrou não é o lucro: o Resultado do mês, em Financeiro, desconta o que saiu.",
    ],
    atencao: ["Entrou hoje aparece para quem cuida do caixa. Relatórios e Financeiro, só para quem tem essas áreas."],
    palavras: ["recebido esta semana", "ganhei", "ganhou", "faturei", "faturou", "quanto ganhei", "quanto eu ganhei", "quanto faturei", "quanto entrou", "quanto fiz", "quanto vendi", "entrou hoje", "ganho da semana", "quanto deu"] },
  { id: "resultado", titulo: "Como ver o resultado do mês e exportar", secao: "dinheiro", quem: "financeiro", rota: FINANCEIRO,
    passos: [
      "Abra Financeiro. A aba Resumo já vem aberta.",
      "Veja quanto entrou, quanto saiu e o Resultado do mês.",
      "Use as setas ao lado do mês para ver o mês anterior ou o próximo.",
      "Desça para ver como entrou (forma de pagamento), de onde veio e para onde foi.",
      "Para baixar a planilha do mês, toque em Exportar.",
    ],
    dicas: ["O Resultado do mês é tudo o que entrou menos tudo o que saiu. Ele não separa o lucro por produto nem por serviço."],
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
      "No alto, toque em um dos períodos: Esta semana, Este mês, Mês passado ou Últimos 90 dias.",
      "Para outras datas, toque em Personalizado e escolha o dia inicial e o final.",
      "Veja os atendimentos concluídos, as faltas, o valor médio por atendimento, os clientes novos e o faturamento.",
      "Desça para ver as formas de pagamento, os dias e horários mais cheios, os serviços mais feitos e os pets e tutores que mais vieram.",
    ],
    dicas: [
      "Faturamento conta só o que já foi recebido.",
      "Embaixo de cada número aparece a comparação com o período anterior, do mesmo tamanho.",
      "Atendimentos, faltas e dias mais cheios contam os horários da Agenda. Creche e hotel têm um cartão próprio, com as estadias encerradas.",
      { so: ["loja"], texto: "Vendas e margem por produto aparecem no cartão Produtos, quando o dono liga Margem e custo médio nas Opções da loja." },
    ],
    palavras: ["relatorio", "relatorios", "faturamento", "ticket", "ticket medio", "desempenho", "numeros", "comparar", "periodo anterior", "mes passado"] },
  { id: "relatorio-exportar", titulo: "Como exportar ou imprimir um relatório", secao: "dinheiro", quem: "financeiro", rota: RELATORIOS,
    passos: [
      "Abra Relatórios e escolha o período.",
      "Toque em Exportar para baixar os números em planilha.",
      "Ou toque em Imprimir para pôr no papel ou salvar em PDF.",
    ],
    dicas: ["A planilha traz o resumo, o período anterior, creche e hotel, serviços, comissão, formas de pagamento e tutores."],
    palavras: ["exportar relatorio", "imprimir relatorio", "planilha do relatorio", "pdf do relatorio", "mandar para o contador", "contador"] },
  { id: "relatorio-creche", titulo: "Como ver os números da creche e do hotel", secao: "dinheiro", usa: ["casa"], quem: "financeiro", rota: RELATORIOS,
    passos: [
      "Abra Relatórios e escolha o período.",
      "Desça até o cartão Creche e hotel.",
      "Veja, para a creche e para o hotel, o número de estadias, de diárias e o valor cobrado.",
      { so: ["hotel"], texto: "Logo abaixo, no cartão Hotel: ocupação e contas, veja a taxa de ocupação do período, as noites já reservadas de hoje em diante, de onde veio o valor das contas (diárias, taxas, extras e produtos) e os sinais recebidos e devolvidos." },
    ],
    dicas: ["Entram as estadias encerradas no período.", "O valor recebido das estadias já está somado no faturamento.",
      { so: ["hotel"], texto: "A taxa de ocupação é noites vendidas dividido por noites disponíveis (as vagas do hotel vezes os dias do período), com a comparação com o período anterior." }],
    palavras: ["relatorio da creche", "relatorio do hotel", "numeros da creche e do hotel", "numeros do hotel", "numeros da creche", "diarias no mes", "estadias", "faturamento do hotel", "taxa de ocupacao", "noites vendidas", "reservas futuras", "sinais recebidos"] },
  { id: "comissao", titulo: "Como calcular a comissão da equipe", secao: "dinheiro", usa: ["banho"], quem: "dono", rota: RELATORIOS, tambem: [EQUIPE],
    passos: [
      "Abra Equipe e toque no cartão da pessoa.",
      "Em Comissão, escreva a porcentagem de cada atendimento e toque em Salvar.",
      "Abra Relatórios e escolha o período.",
      "Desça até Comissão por profissional: a conta de cada um já vem pronta.",
    ],
    dicas: [
      "A base da conta é o valor cobrado pelo serviço nos atendimentos que a pessoa concluiu, já com o desconto. Produto e extra ficam de fora, a não ser que você ligue as opções de comissão.",
      "Atendimento concluído com pacote aparece na contagem, com a marca com pacote, e conta pelo preço do serviço na agenda.",
      "Conta que o cliente ficou de pagar depois entra pelo valor cobrado, mesmo recebida em partes.",
      "Sem porcentagem definida, a pessoa não aparece com comissão.",
      "A explicação da base fica escrita embaixo do bloco, em Relatórios, e muda conforme as opções ligadas.",
      "Comissão por serviço, sobre produtos e sobre extras: veja Como mudar as regras da comissão.",
    ],
    palavras: ["comissao", "porcentagem", "pagar a equipe", "comissao do banhista", "comissao do tosador", "percentual", "base da comissao"] },
  { id: "comissao-regras", titulo: "Como mudar as regras da comissão: por serviço, produtos e extras", secao: "dinheiro", usa: ["banho"], quem: "dono", rota: PETSHOP, tambem: [RELATORIOS],
    passos: [
      "Abra Meu pet shop e desça até Opções de cobrança, na parte Comissão da equipe.",
      "Percentual por serviço: ligue a chave, toque em Definir o percentual de cada serviço, escreva o percentual nos serviços que têm regra própria e toque em Salvar.",
      "Extras contam para a comissão: ligue a chave para os extras da conta entrarem na base.",
      { so: ["loja"], texto: "Comissão sobre produtos: ligue a chave, escreva o Percentual sobre produtos e toque em Salvar opções de cobrança." },
      "Abra Relatórios e confira a Comissão por profissional com as regras novas.",
    ],
    dicas: [
      "Tudo vem desligado: sem ligar nada, vale só a porcentagem de cada pessoa sobre o serviço.",
      "Serviço sem percentual próprio usa a porcentagem de quem atendeu.",
      { so: ["loja"], texto: "Comissão sobre produtos vale para o produto vendido na conta de um atendimento, para quem atendeu. Venda no balcão, sem atendimento, não entra." },
      "As regras valem para a conta inteira, inclusive de dias que já passaram. Comissão já marcada como paga não muda.",
    ],
    palavras: ["comissao por servico", "comissao sobre produtos", "comissao de produto", "comissao em extras", "regras da comissao", "percentual por servico", "comissao diferente"] },
  { id: "comissao-paga", titulo: "Como marcar a comissão como paga", secao: "dinheiro", usa: ["banho"], quem: "financeiro", rota: RELATORIOS,
    passos: [
      "Abra Relatórios e escolha o período que você está pagando. Ele precisa já ter terminado: use Mês passado, ou Personalizado com datas até hoje.",
      "Desça até Comissão por profissional.",
      "Na linha da pessoa, toque em Marcar como paga.",
      "Em Como pagou, escolha a forma.",
      "Toque em Marcar como pago, o botão que mostra o valor.",
    ],
    dicas: [
      "Entra uma saída com a data de hoje, na categoria Comissão. Com o caixa aberto, entra nele; em dinheiro, sai da conta da gaveta.",
      "A linha passa a mostrar paga, com o valor e o dia. O mesmo período não é pago duas vezes: nem um período que cruze com ele.",
      "Marcou errado? Toque em Desfazer, na mesma linha: a saída é apagada e o período volta a ficar sem pagamento.",
      "A pessoa vê na tela Hoje dela, em Minha comissão, o que já foi pago.",
    ],
    atencao: ["Em Este mês, o botão só aparece quando o mês terminar. Para pagar antes, use Personalizado com as datas certas."],
    palavras: ["comissao paga", "pagar comissao", "paguei a comissao", "marcar como paga", "comissao ja paga", "pagar a comissao", "quitar comissao"] },
  { id: "minha-comissao", titulo: "Como ver a minha comissão", secao: "dinheiro", usa: ["banho"], quem: "todos", rota: HOJE,
    passos: [
      "Abra a tela Hoje.",
      "Desça até o cartão Minha comissão.",
      "Ele mostra a comissão do mês atual, até agora, e a do mês anterior, com os atendimentos e a base de cada um.",
      "Quando o dono marca o pagamento, aparece pago, com o valor e o período.",
    ],
    dicas: [
      "Só você vê a sua comissão. O cartão não mostra a dos colegas nem o dinheiro do pet shop.",
      "O cartão só aparece para quem tem comissão definida.",
      "O valor do mês atual muda a cada atendimento concluído. Quem fecha o valor e paga é o dono.",
    ],
    palavras: ["minha comissao", "quanto vou receber", "minha parte", "meu ganho", "comissao do mes", "quanto ganhei de comissao", "ver comissao"] },

  /* ---------- Estoque e pacotes ---------- */
  { id: "estoque", titulo: "Como cadastrar um produto no estoque", secao: "estoque", usa: ["loja"], quem: "todos", rota: ESTOQUE,
    passos: [
      "Abra Estoque e toque em Produto novo.",
      "Escreva o nome e, se quiser, a categoria.",
      "Escolha a unidade: un, kg, pacote, saco e outras.",
      "Escreva o Preço de venda e o Custo.",
      "Em Estoque mínimo, escreva a partir de quanto o sistema deve avisar que está acabando.",
      "Em Quanto tem hoje, escreva o que já está na prateleira.",
      "Toque em Salvar produto.",
    ],
    dicas: ["Quando o saldo chega ao mínimo, o produto aparece como acabando e a tela Hoje avisa.", "Para muitos produtos de uma vez, use Trazer de planilha.", "Código de barras, Último fornecedor e Margem aparecem no produto quando o dono liga cada um em Opções da loja. Desligados, o cadastro fica só com estes campos."],
    palavras: ["estoque", "produto novo", "cadastrar produto", "minimo", "acabando", "inventario", "racao", "shampoo", "trazer produtos", "planilha de produtos"] },
  { id: "estoque-entrada", titulo: "Como dar entrada e saída de produto", secao: "estoque", usa: ["loja"], quem: "todos", rota: ESTOQUE,
    passos: [
      "Abra Estoque e ache o produto.",
      "Quando chegar mercadoria, toque em Entrada, escreva a quantidade e toque em Anotar entrada.",
      "Quando o produto sair, toque em Saída e escreva a quantidade.",
      "Em Motivo, escolha Venda, Uso no banho ou Perda ou vencido.",
      "Toque em Anotar saída ou em Anotar venda.",
    ],
    dicas: ["Na entrada, dá para escrever o custo. Quem cuida do caixa também pode marcar Lançar a compra como despesa.", "Na saída, nenhum motivo vem marcado: é você quem diz por que o produto saiu.", "Com Fornecedores ligado nas Opções da loja, a entrada pergunta de quem veio a mercadoria.", "Com Margem e custo médio ligado, a entrada mostra para quanto vai o custo médio do produto.", "Pelo Mozart: \"entrou 10 sacos de ração a 140 cada\"."],
    palavras: ["entrada de estoque", "saida de estoque", "entrada de produto", "saida de produto", "entrada e saida de produto", "chegou mercadoria", "compra", "uso interno", "perda", "vencido", "dar entrada", "dar saida"] },
  { id: "estoque-saldo", titulo: "Como corrigir o saldo de um produto", secao: "estoque", usa: ["loja"], quem: "todos", rota: ESTOQUE,
    passos: [
      "Abra Estoque e toque no nome do produto.",
      "Toque em Corrigir saldo.",
      "Escreva quanto você contou na prateleira.",
      "Se quiser, escreva o Motivo: ele fica nos Últimos movimentos do produto.",
      "Toque em Corrigir.",
    ],
    dicas: ["Na mesma janela você muda o nome, o preço e o estoque mínimo, e vê os Últimos movimentos.", "Tirar este produto da lista esconde o produto e guarda o histórico."],
    palavras: ["corrigir saldo", "saldo errado", "contagem", "inventario", "editar produto", "mudar preco do produto", "tirar produto"] },
  { id: "venda", titulo: "Como vender um produto no balcão", secao: "estoque", usa: ["loja"], quem: "todos", rota: ESTOQUE, tambem: [CAIXA],
    passos: [
      "Na tela Estoque, toque em Vender. Na tela Caixa, o botão se chama Venda no balcão.",
      "Busque o produto pelo nome e toque nele.",
      "Ajuste a quantidade com os botões de mais e de menos.",
      "Se quiser, toque em Dizer quem comprou e escolha o tutor.",
      "Escolha a Forma de pagamento.",
      "Toque em Receber, o botão que mostra o valor.",
    ],
    dicas: [
      "O dinheiro entra no caixa e o estoque baixa sozinho.",
      "Quem não cuida do caixa toca em Dar baixa no estoque: o dinheiro fica para quem cuida do financeiro lançar.",
      "Cliente vai pagar depois? Toque em Dizer quem comprou e escolha o tutor, toque em Cliente paga depois, escolha o dia em Quando vai pagar e toque em Anotar. O estoque baixa na hora e a conta fica no nome dele, em Contas de clientes.",
      "Com Código de barras ligado nas Opções da loja, o campo da busca aceita o leitor: passou o produto, ele entra na conta.",
      "Com produto na conta, o navegador pede confirmação antes de recarregar ou fechar a página.",
    ],
    palavras: ["vender", "venda", "balcao", "produto", "racao", "shampoo", "venda no balcao", "vender produto", "petisco"] },
  { id: "loja-opcoes", titulo: "Como ligar as opções da loja: margem, código de barras e fornecedores", secao: "estoque", usa: ["loja"], quem: "dono", rota: PETSHOP, tambem: [ESTOQUE],
    passos: [
      "Abra Meu pet shop e desça até Opções da loja. Na tela Estoque, o botão Opções abre a mesma lista.",
      "Ligue a chave do que a sua loja usa: Margem e custo médio, Código de barras ou Fornecedores.",
      "Pronto: a mudança vale na hora, para toda a equipe.",
    ],
    dicas: ["As três opções começam desligadas. Desligadas, o estoque funciona como sempre funcionou.", "Dá para ligar só uma, ou desligar depois: nada do que já foi anotado é apagado."],
    palavras: ["opcoes da loja", "opcoes", "ligar margem", "ligar codigo de barras", "ligar fornecedores", "configurar loja", "configurar estoque", "chave"] },
  { id: "margem", titulo: "Como ver a margem de lucro e as vendas por produto", secao: "estoque", usa: ["loja"], quem: "financeiro", rota: RELATORIOS, tambem: [ESTOQUE],
    passos: [
      "Isso é uma opção da loja, que começa desligada. O dono liga em Meu pet shop, Opções da loja, na chave Margem e custo médio.",
      "Para ver a margem de um produto, abra Estoque e toque no nome dele: Margem e Margem em % aparecem embaixo do Preço de venda e do Custo médio.",
      "Para ver as vendas, abra Relatórios, escolha o período e desça até o cartão Produtos.",
      "Veja, de cada produto: Vendidos, Receita, Custo, Margem e Margem %. No fim da lista vem o Total.",
      "Para mudar a ordem, toque em Receita, Vendidos, Margem, Margem % ou Nome.",
      "Toque em Exportar produtos para baixar a planilha.",
    ],
    dicas: [
      "Custo médio: a cada entrada com custo, o sistema faz a média do que já estava na prateleira com o que chegou. O Último custo também fica guardado no produto.",
      "Cada venda guarda o custo do produto naquele momento. Mudar o custo depois não muda a margem de uma venda antiga.",
      "Quando o preço de venda está abaixo do custo, o produto mostra o aviso vende abaixo do custo.",
      "Parados, no mesmo cartão, lista os produtos que têm saldo e não venderam no período.",
      "Mais vendidos mostra os cinco produtos que mais saíram no período.",
    ],
    atencao: [
      "Venda feita antes de a função existir, ou de produto que ainda não tinha custo, aparece como sem custo registrado: entra na receita e fica de fora do custo e da margem. O sistema não chuta.",
      "A Receita conta as vendas já recebidas. Conta que o cliente ficou de pagar depois entra quando for paga.",
      "O Resultado do mês, em Financeiro, continua sendo o que entrou menos o que saiu: ele não desconta o custo dos produtos vendidos.",
    ],
    palavras: ["margem", "margem de lucro", "lucro por produto", "lucro do produto", "markup", "custo do produto", "custo medio", "ultimo custo", "relatorio de produtos", "vendas por produto", "produto mais vendido", "mais vendidos", "parados", "produto parado", "cmv", "custo dos produtos vendidos", "abaixo do custo", "prejuizo"] },
  { id: "codigo-barras", titulo: "Como usar leitor de código de barras", secao: "estoque", usa: ["loja"], quem: "todos", rota: ESTOQUE, tambem: [CAIXA],
    passos: [
      "Isso é uma opção da loja, que começa desligada. O dono liga em Meu pet shop, Opções da loja, na chave Código de barras.",
      "Para guardar o código de um produto, abra Estoque, toque no nome do produto, clique no campo Código de barras e passe o leitor. Também dá para digitar os números. Toque em Salvar.",
      "Para vender, toque em Vender. O campo Passe o leitor ou digite o nome já vem pronto para o leitor.",
      "Passe o leitor no produto: ele entra na conta na hora. Passou de novo, soma mais um.",
      "No celular, toque em Ler com a câmera, se o botão aparecer, e aponte para o código.",
    ],
    dicas: [
      "Funciona com leitor USB ou Bluetooth, que digita os números e aperta Enter. Digitar o código e apertar Enter dá no mesmo.",
      "O leitor também vale na conta do atendimento, em Levou mais alguma coisa?, e na busca da tela Estoque.",
      "Em Trazer de planilha, a coluna Código de barras entra junto com os produtos.",
      "O botão Ler com a câmera só aparece no navegador que sabe ler código de barras. Sem ele, digite o código.",
    ],
    atencao: ["Cada código vale para um produto só: o sistema avisa quando o código já está em outro.", "O sistema não imprime etiqueta."],
    palavras: ["codigo de barras", "barras", "leitor", "leitor de codigo", "scanner", "bipar", "sku", "ean", "codigo do produto", "camera", "ler com a camera", "etiqueta"] },
  { id: "fornecedores", titulo: "Como cadastrar fornecedores e ver as compras", secao: "estoque", usa: ["loja"], quem: "todos", rota: ESTOQUE,
    passos: [
      "Isso é uma opção da loja, que começa desligada. O dono liga em Meu pet shop, Opções da loja, na chave Fornecedores.",
      "Abra Estoque e toque em Fornecedores.",
      "Toque em Fornecedor novo, escreva o Nome, o WhatsApp e as Observações e toque em Salvar fornecedor.",
      "Quando chegar mercadoria, toque em Entrada no produto e escolha o Fornecedor antes de tocar em Anotar entrada.",
      "Para ver o que você comprou de cada um, toque em Fornecedores e no nome do fornecedor: Compras mostra a data, a quantidade e o custo de cada entrada.",
    ],
    dicas: [
      "Na própria entrada, o botão Fornecedor novo guarda um fornecedor sem sair da tela.",
      "O produto mostra o Último fornecedor, que muda sozinho a cada entrada com fornecedor.",
      "Na ficha do produto, os Últimos movimentos mostram o custo e o fornecedor de cada entrada.",
      "Tirar este fornecedor da lista esconde o fornecedor e guarda as compras dele.",
    ],
    palavras: ["fornecedor", "fornecedores", "distribuidora", "cadastrar fornecedor", "historico de compras", "compras", "de quem comprei", "ultimo fornecedor", "representante"] },
  { id: "pedido-reposicao", titulo: "Como mandar um pedido de reposição ao fornecedor", secao: "estoque", usa: ["loja"], quem: "todos", rota: ESTOQUE,
    passos: [
      "Abra Estoque e toque em Fornecedores.",
      "Toque no fornecedor e depois em Pedido de reposição.",
      "Escreva quanto você quer de cada produto.",
      "Confira a Mensagem e mude o que quiser.",
      "Toque em Abrir no WhatsApp e envie a mensagem por lá.",
    ],
    dicas: [
      "Entram no pedido os produtos zerados, ou no estoque mínimo ou abaixo dele, que têm esse fornecedor como Último fornecedor.",
      "Fornecedor sem WhatsApp: o botão vira Copiar mensagem, para você colar onde quiser.",
      "O botão Pedido de reposição só fica disponível quando há produto desse fornecedor para repor.",
    ],
    atencao: ["O sistema só prepara a mensagem. Quem envia é você, pelo seu WhatsApp: nada sai sozinho."],
    palavras: ["pedido de reposicao", "reposicao", "repor", "pedido ao fornecedor", "pedido de compra", "comprar mais", "acabando", "whatsapp do fornecedor", "encomendar"] },
  { id: "pacotes-modelo", titulo: "Como criar um modelo de pacote", secao: "estoque", usa: ["pacotes"], quem: "todos", rota: PACOTES,
    passos: [
      "Abra Pacotes e toque em Modelos de pacote.",
      "Toque em Modelo novo. Se ainda não existe nenhum modelo, o botão se chama Criar um modelo.",
      "Dê um nome, como \"4 banhos no mês\" ou \"10 diárias de creche\".",
      "Escolha o serviço, a quantidade, a validade em dias e o preço.",
      "Toque em Salvar.",
    ],
    dicas: ["O modelo é o pacote que você costuma vender. Na hora da venda é só escolher.", "Desativar tira o modelo da venda. Quem já comprou continua com o pacote."],
    palavras: ["modelo de pacote", "criar pacote", "pacote novo", "plano de banho", "mensalidade", "4 banhos", "pacote de diarias"] },
  { id: "pacotes", titulo: "Como vender um pacote", secao: "estoque", usa: ["pacotes"], quem: "todos", rota: PACOTES,
    passos: [
      "Abra Pacotes e toque em Vender pacote.",
      "Escolha o pet.",
      "Escolha o pacote. Sem modelo pronto, toque em Montar um avulso.",
      "Confira a quantidade, a validade, o preço e a data da compra.",
      "Escolha Paga agora e a forma de pagamento, ou Cliente paga depois.",
      "Toque em Receber, o botão que mostra o valor.",
    ],
    dicas: ["Pago na hora, o valor entra no caixa. Se o cliente paga depois, a conta fica em Financeiro, A receber."],
    palavras: ["pacote", "pacotes", "vender pacote", "vender um pacote", "mensalidade", "plano de banho", "pacote de banho", "mensalista"] },
  { id: "pacotes-usar", titulo: "Como usar, renovar ou encerrar um pacote", secao: "estoque", usa: ["pacotes"], quem: "todos", rota: PACOTES,
    passos: [
      "Abra Pacotes e ache o pacote do pet em Clientes com pacote.",
      "A cada uso, toque em Usar 1.",
      "Tocou sem querer? Toque em Desfazer uso.",
      "Quando acabar, toque em Renovar para vender outro igual.",
      "Pacote que venceu ganha o botão Encerrar: toque nele para tirar o pacote da lista de ativos.",
    ],
    dicas: [
      { so: ["banho"], texto: "Na Agenda, o pet com pacote para o serviço ganha o botão Concluir usando o pacote (sem cobrar): ele conclui o atendimento e já dá baixa em um uso." },
      { so: ["casa"], texto: "No check-out da creche e do hotel, em Como fica a conta, escolha Usar 1 do pacote: a diária sai do pacote e nenhum dinheiro é lançado." },
      "Os filtros Ativos, Vencendo em 7 dias e Encerrados ajudam a achar.",
      "Pacote vencido ainda pode ser usado: o sistema pede confirmação.",
    ],
    palavras: ["usar pacote", "dar baixa no pacote", "baixa no pacote", "renovar pacote", "usar 1", "renovar", "encerrar pacote", "pacote vencido", "pacote acabou", "saldo do pacote", "concluir usando o pacote"] },

  /* ---------- Equipe ---------- */
  { id: "equipe", titulo: "Como adicionar uma pessoa na equipe", secao: "equipe", quem: "dono", rota: EQUIPE,
    passos: [
      "Abra Equipe e toque em Adicionar pessoa. Se você ainda trabalha sozinho, o botão se chama Tenho ajuda: adicionar pessoa.",
      "Escreva o nome, escolha o que a pessoa faz e toque em Continuar.",
      "Diga se ela vai entrar no sistema. Para banhista e tosador, o comum é Não, só aparece na agenda.",
      "Toque em Continuar.",
      "Se quiser, escolha a cor, a comissão e os dias de trabalho. Esse passo pode ser pulado.",
      "Toque em Adicionar, o botão que vem com o nome da pessoa.",
    ],
    dicas: [
      "Banhista e tosador quase nunca precisam de login: você marca os horários e eles aparecem na agenda.",
      { so: ["casa"], texto: "Para quem cuida dos pets da creche ou do hotel, escolha Monitor(a) de creche: abre Creche e hotel e Clientes e pets, sem ver dinheiro." },
      "Quem não tem login não ocupa acesso do plano.",
    ],
    palavras: ["equipe", "funcionario", "funcionaria", "adicionar pessoa", "banhista", "tosador", "contratar", "nova pessoa", "ajudante", "monitor", "monitora"] },
  { id: "equipe-login", titulo: "Como dar login e mandar o convite", secao: "equipe", quem: "dono", rota: EQUIPE,
    passos: [
      "Abra Equipe.",
      "Para pessoa nova, toque em Adicionar pessoa e, na pergunta se ela vai entrar no sistema, escolha Sim, com o próprio login.",
      "Para quem já está na equipe, toque em Dar login no cartão dela.",
      "Escreva o e-mail da pessoa.",
      "Ligue as áreas que ela pode abrir.",
      "No fim, toque em Mandar pelo WhatsApp ou em Copiar convite.",
    ],
    dicas: ["A pessoa cria a conta com esse mesmo e-mail e escolhe a própria senha.", "O convite não é enviado sozinho: é você quem manda o link. Enquanto a pessoa não cria a conta, o cartão dela mostra Convite criado: falta a pessoa criar a conta.", "Para mandar de novo, toque em Reenviar no cartão da pessoa."],
    atencao: ["O e-mail precisa ser exatamente o mesmo: é assim que o sistema sabe que a pessoa é da sua equipe.", "Cada pessoa com login ocupa um acesso do plano."],
    palavras: ["login", "convite", "convidar", "acesso", "dar acesso", "senha da funcionaria", "reenviar convite", "email da pessoa", "recepcao", "socio", "gerente"] },
  { id: "permissoes", titulo: "Como escolher o que cada pessoa pode abrir", secao: "equipe", quem: "dono", rota: EQUIPE,
    passos: [
      "Abra Equipe e toque no cartão da pessoa.",
      "Desça até a parte que diz o que a pessoa abre.",
      "Ligue ou desligue cada área: Agenda, Clientes e pets, Creche e hotel, Pacotes, Estoque, Caixa, Financeiro e Relatórios. Só aparecem as áreas do que o pet shop usa.",
      "Se preferir, toque em um dos perfis prontos: ele preenche as chaves com o que é comum para aquela função.",
      "Toque em Salvar.",
    ],
    dicas: [
      "As chaves só aparecem para quem tem login.",
      "Caixa é para receber, vender e conferir a gaveta: a pessoa vê o que entrou hoje, mas não as contas, as despesas nem o histórico.",
      "Financeiro e Relatórios mostram todo o dinheiro. Só quem tem uma delas (ou o dono) altera um valor já recebido que outra pessoa lançou.",
      "Com Caixa, Financeiro e Relatórios desligados, a pessoa não vê valor nenhum.",
      "O cartão Quem pode o quê, na tela Equipe, mostra o que cada perfil abre.",
    ],
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
  { id: "link", titulo: "Como mandar o link para o cliente agendar sozinho", secao: "divulgacao", quem: "todos", rota: PETSHOP, tambem: [HOJE, AGENDA],
    passos: [
      { so: ["banho"], texto: "Na tela Hoje, toque em Mandar link de agendamento. Na Agenda, o botão se chama Link do cliente." },
      "O dono também acha o link em Meu pet shop, no cartão Link de agendamento.",
      "Se o link estiver desligado, o dono liga: na janela do link, em Ligar o link; em Meu pet shop, na chave do cartão.",
      "Toque em Copiar link para colar onde quiser.",
      { so: ["banho"], texto: "Ou, na janela do link, toque em Mandar para um cliente e escolha o pet: o WhatsApp do tutor abre com o convite." },
      "Em Meu pet shop, Mandar no WhatsApp abre o WhatsApp para você escolher para quem mandar.",
    ],
    dicas: [
      "O cliente vê só os horários livres. Nada é marcado sem você aceitar.",
      "Ver como o cliente vê abre a página do link.",
      "O recado que aparece no topo da página fica em Meu pet shop, no cartão Link de agendamento, em Recado na página.",
      "Pelo link o cliente só pede: não paga nada, nem sinal.",
    ],
    palavras: ["link", "agendamento online", "cliente agendar", "tutor agendar", "link de agendamento", "link do cliente", "agendar sozinho", "bio do instagram"] },
  { id: "pedidos-link", titulo: "Como aceitar ou recusar um pedido que veio pelo link", secao: "divulgacao", quem: "todos", rota: AGENDA, tambem: [HOJE],
    passos: [
      "Quando chega um pedido, aparece o bloco Pedidos pelo link, na tela Hoje e na Agenda.",
      "Confira o pet, o serviço, o dia e a hora.",
      "Se aparecer Quem atende?, escolha a pessoa ou deixe para decidir depois.",
      "Toque em Aceitar ou em Recusar.",
      "Toque em Confirmar no WhatsApp para avisar o tutor. Se recusou, o botão é Sugerir outro horário.",
    ],
    dicas: ["Ao aceitar, o horário entra na agenda.", "O tutor não é avisado sozinho: toque em Confirmar no WhatsApp logo depois de responder.", "Se o telefone do pedido já for de outro tutor, o sistema pergunta É a mesma pessoa?.", "O número ao lado de Agenda, no menu, mostra quantos pedidos esperam resposta."],
    palavras: ["pedido", "pedidos", "aceitar", "recusar", "pedido pelo link", "cliente pediu horario", "confirmar pedido"] },
  { id: "link-regras", titulo: "Como pedir que o cliente aceite as suas regras no link", secao: "divulgacao", quem: "dono", rota: PETSHOP,
    passos: [
      "Abra Meu pet shop e ache o cartão Regras e cancelamento pelo link.",
      "Ligue a chave Pedir que o cliente aceite as suas regras.",
      "Em Suas regras, escreva o texto com as suas palavras e toque em Salvar regras.",
      "Se quiser, marque Pedir que o cliente marque “As vacinas do meu pet estão em dia”.",
      "Pronto: no link, o cliente lê as regras e marca que aceita antes de enviar o pedido.",
    ],
    dicas: [
      "O pedido guarda o dia, a hora e o texto exato que o cliente aceitou. Aparece no pedido, no horário da agenda e na reserva, em Ver o texto que ele aceitou.",
      "Mudou o texto? Os pedidos que já chegaram continuam com o texto antigo, que foi o que cada cliente aceitou.",
      "Sem texto e sem a declaração de vacinas marcada, o link segue sem pedir aceite.",
    ],
    atencao: ["O sistema não escreve nem confere as suas regras. O texto é seu: se precisar de um contrato, fale com quem entende do assunto."],
    palavras: ["regras", "termos", "termo", "contrato", "aceite", "aceitar termos", "vacinas em dia", "declaracao de vacina", "termo de responsabilidade", "regras do hotel", "regras da creche"] },
  { id: "link-cancelar", titulo: "Como deixar o cliente cancelar ou pedir outra data pelo link", secao: "divulgacao", quem: "dono", rota: PETSHOP, tambem: [HOJE, AGENDA],
    passos: [
      "Abra Meu pet shop e ache o cartão Regras e cancelamento pelo link.",
      "Ligue a chave O cliente pode cancelar ou pedir outra data pelo link.",
      "Em Até quantas horas antes, escreva o prazo e toque em Salvar prazo.",
      "O cliente abre a página de acompanhar o pedido e toca em Cancelar o pedido ou em Pedir outra data.",
      "Você fica sabendo no bloco Pedidos pelo link, na tela Hoje e na Agenda, com a etiqueta cancelado pelo cliente, pediu outra data ou pediu para cancelar.",
      "Toque em Responder no WhatsApp para mandar a resposta pronta, ou em Já vi.",
    ],
    dicas: [
      "Cancelar tira o horário da agenda ou a reserva de Creche e hotel, e a vaga volta a aparecer no link.",
      "Pedir outra data só manda um recado: nada é desmarcado. Quem muda o horário ou a reserva é você.",
      "Pedido que ainda espera a sua resposta pode ser cancelado pelo cliente a qualquer hora. O prazo vale para o que você já aceitou.",
      "A mensagem de confirmação já leva o endereço da página do pedido e avisa que é por lá que o cliente cancela.",
      "O cliente acha o pedido de novo no mesmo celular: a página do link mostra Seu pedido por aqui.",
    ],
    atencao: ["Dinheiro já recebido nunca é devolvido sozinho. Reserva com sinal ou horário com pagamento não é cancelado pelo cliente: chega um pedido de cancelamento, e é você quem cancela e decide o que fazer com o valor."],
    palavras: ["cancelar pelo link", "cliente cancelar", "cliente cancelou", "cancelado pelo cliente", "remarcar pelo link", "pedir outra data", "mudar a data", "prazo para cancelar", "desmarcar", "cancelamento"] },
  { id: "lembrete", titulo: "Como mandar lembretes pelo WhatsApp", secao: "divulgacao", usa: ["banho"], quem: "todos", rota: AGENDA, tambem: [HOJE],
    passos: [
      "Na Agenda, toque na faixa Mandar os lembretes, que aparece no dia que tem lembrete faltando. Na tela Hoje, toque no aviso de lembretes de amanhã, em Pede a sua atenção.",
      "Abre a lista dos tutores que ainda não receberam.",
      "Toque em Mandar ao lado do primeiro tutor: o WhatsApp abre com a mensagem pronta.",
      "Envie a mensagem e volte para o sistema.",
      "Repita com o próximo da lista.",
    ],
    dicas: [
      "Para lembrar de um horário só, abra o horário e toque em Lembrete no WhatsApp.",
      "Tutor com mais de um horário recebe tudo em uma mensagem só.",
      "Horário que já começou fica de fora da lista.",
      { so: ["casa"], texto: "A lista traz só os horários da Agenda. Para quem chega amanhã na creche ou no hotel, abra Creche e hotel e toque em Avisar quem chega amanhã, na faixa do alto." },
    ],
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
    dicas: ["Para escrever do seu jeito, toque em Mudar o texto. Onde estiver [pet] entra o nome do pet. O texto fica guardado neste aparelho.", "Quem já foi chamado fica marcado, com a opção Chamar de novo.", "Só entra na lista quem não tem horário marcado."],
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
  { id: "fidelidade", titulo: "Como usar o programa de fidelidade", secao: "divulgacao", usa: ["banho"], quem: "dono", rota: PETSHOP, tambem: [CLIENTES],
    passos: [
      "Abra Meu pet shop e vá até o cartão Fidelidade.",
      "Escolha a cada quantos atendimentos o tutor ganha.",
      "Em Prêmio, escreva o que ele ganha, como \"um banho\".",
      "Toque em Ligar a fidelidade.",
      "Quando o tutor completar, abra a ficha dele e toque em Entregar prêmio.",
    ],
    dicas: [
      "A contagem é por tutor, soma os atendimentos concluídos de todos os pets dele e começa no dia em que você liga.",
      "Só contam os atendimentos da Agenda. Estadias de creche e de hotel não entram na contagem.",
      "Quando o tutor completa, o aviso Tem prêmio para entregar aparece na janela do horário dele, na Agenda, e na ficha do tutor. O sistema não manda mensagem.",
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
      "Nos outros dias, toque em Ver o resumo da semana passada, no meio da tela.",
      "Veja quanto entrou, os atendimentos concluídos, as faltas, os pets novos, o que há a receber e os sumidos.",
      "Toque em Copiar resumo para colar no WhatsApp ou guardar.",
    ],
    dicas: ["O resumo só aparece depois que o pet shop completa a primeira semana no sistema, e para quem vê o financeiro.", "Cada número vem comparado com a semana anterior.", "O resumo sugere um próximo passo, com um botão que leva direto ao lugar."],
    palavras: ["resumo da semana", "sua semana", "semana passada", "como foi a semana", "resumo semanal"] },

  /* ---------- Ajustes e conta ---------- */
  { id: "petshop", titulo: "Como mudar os dados e o horário de funcionamento", secao: "ajustes", quem: "dono", rota: PETSHOP,
    passos: [
      "Abra Meu pet shop.",
      "No cartão Dados, mude o nome, o WhatsApp e a cidade e toque em Salvar dados.",
      "No cartão Horário de funcionamento, toque em uma semana pronta: Segunda a sexta, Segunda a sábado, Terça a sábado ou Todos os dias.",
      "Acerte cada dia: marque Aberto e escreva a hora de abrir e a de fechar. Dia desmarcado fica Fechado.",
      "Se os dias abertos têm o mesmo horário, toque em Usar o mesmo horário em todos os dias abertos: ele copia o horário do primeiro dia aberto.",
      "Se vocês fecham para almoçar, marque Fecha para o almoço? e escreva de que horas a que horas.",
      "Toque em Salvar horário.",
    ],
    dicas: [
      "A agenda, o link do cliente e o Mozart só oferecem horário dentro do funcionamento e fora do almoço.",
      "O almoço vale toda semana, sem prazo para acabar. Não precisa bloquear a agenda.",
      "Usar o mesmo horário não abre dia fechado: dia fechado continua fechado.",
    ],
    palavras: ["horario de funcionamento", "abre", "fecha", "meu pet shop", "nome do pet shop", "dados do pet shop", "endereco", "whatsapp do pet shop", "sabado", "domingo", "almoco", "hora do almoco", "terca a sabado"] },
  { id: "preco-servico", titulo: "Como mudar o preço de um serviço", secao: "ajustes", usa: ["banho"], quem: "dono", rota: PETSHOP,
    passos: [
      "Abra Meu pet shop e vá até o cartão Serviços e preços.",
      "Toque no serviço, por exemplo Banho.",
      "Em Preço por porte, mude o valor de cada porte: P (pequeno), M (médio), G (grande) e GG (gigante).",
      "Toque em Salvar.",
    ],
    dicas: ["O preço novo vale para os próximos horários que você marcar."],
    atencao: ["Os horários que já estão marcados ficam com o valor antigo. Para mudar um deles, abra o horário e toque em Remarcar ou alterar."],
    palavras: ["mudar o preco", "mudo o preco", "mudar preco", "alterar o preco", "alterar preco", "trocar o preco", "aumentar o preco", "preco do banho", "preco da tosa", "preco do servico", "valor do banho", "valor da tosa", "reajuste", "reajustar", "tabela de precos", "precos"] },
  { id: "servico-novo", titulo: "Como criar ou desativar um serviço", secao: "ajustes", usa: ["banho"], quem: "dono", rota: PETSHOP,
    passos: [
      "Abra Meu pet shop e vá até o cartão Serviços e preços.",
      "Toque em Serviço novo.",
      "Escreva o nome e escolha o tipo.",
      "Diga quanto tempo leva e o preço de cada porte.",
      "Toque em Salvar.",
    ],
    dicas: ["Para tirar um serviço da agenda sem apagar o histórico, abra o serviço e desmarque Ativo.", "A duração define quanto tempo o horário ocupa na agenda."],
    palavras: ["servico novo", "criar servico", "novo servico", "hidratacao", "tosa higienica", "duracao", "desativar servico", "servicos"] },
  { id: "vagas-banho", titulo: "Como definir quantos pets são atendidos ao mesmo tempo", secao: "ajustes", usa: ["banho"], quem: "dono", rota: PETSHOP,
    passos: [
      "Abra Meu pet shop.",
      "Vá até o cartão Banho e tosa: pets ao mesmo tempo.",
      "Use os botões de menos e de mais para escolher o número.",
      "Toque em Salvar.",
    ],
    dicas: ["Com 2, o mesmo horário aceita até dois pets.", "Esse número regula os horários livres da agenda, do link do cliente e do Mozart."],
    palavras: ["vagas", "ao mesmo tempo", "quantos pets", "capacidade", "dois pets no mesmo horario", "pets por horario"] },
  { id: "area-principal", titulo: "Como escolher o que você usa e a área principal", secao: "ajustes", quem: "dono", rota: PETSHOP,
    passos: [
      "Abra Meu pet shop e vá até o cartão O que você usa.",
      "Marque o que o seu negócio faz: Banho e tosa, Creche, Hotel, Venda de produtos, Pacotes e planos.",
      "Com mais de uma área marcada, toque em uma delas em Área principal.",
      "Toque em Salvar.",
    ],
    dicas: ["A área principal aparece primeiro no menu e na tela inicial.", "O que você não marcar sai da frente e fica em Outras áreas, no fim do menu. Nada é apagado, e dá para marcar de novo quando quiser.", "Pacotes e planos não pode ser a área principal: é um jeito de vender, não uma área."],
    palavras: ["o que voce usa", "area principal", "atividade principal", "outras areas", "esconder menu", "tirar do menu", "mostrar menu", "creche primeiro", "ordem do menu", "modulos"] },
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
    dicas: ["O arquivo traz planilhas de clientes, pets, agenda, financeiro, caixas, estoque, pacotes, creche e hotel (com os mensalistas e as mensalidades), equipe, comissões pagas e serviços.", "As planilhas abrem no Excel e no Google Planilhas."],
    atencao: ["É uma cópia para guardar e consultar: não dá para restaurar, isto é, trazer esses arquivos de volta para o sistema. As fotos não entram."],
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
  /* ---------- O que o sistema não faz ---------- */
  { id: "nota-fiscal", titulo: "Dá para emitir nota fiscal?", secao: "limites", quem: "todos", rota: null,
    passos: [
      "Não. O Maestro Pet Gestão não emite nota fiscal: nem NF-e, nem NFC-e, nem NFS-e.",
      "Para o cliente, mande o comprovante: depois de receber, toque em Mandar comprovante. Ele não vale como nota fiscal.",
      "Para o contador, abra Relatórios ou Financeiro e toque em Exportar: a planilha traz o que entrou no período.",
      "A nota fiscal continua sendo emitida onde você já emite hoje: na prefeitura, com o contador ou em um programa emissor.",
    ],
    palavras: ["nota fiscal", "nf", "nfe", "nf-e", "nfce", "nfc-e", "nfse", "nfs-e", "emitir nota", "cupom fiscal", "danfe", "fiscal"] },
  { id: "sinal", titulo: "Dá para cobrar sinal ou adiantamento na reserva?", secao: "limites", quem: "todos", rota: null,
    passos: [
      "Dá, mas é uma opção que começa desligada. O dono liga em Meu pet shop, no cartão Opções do hotel e da creche, na chave Sinal na reserva, e toca em Salvar opções.",
      "Ligada, a reserva nova mostra Sinal da reserva: Recebi agora, Vai pagar depois ou Sem sinal.",
      "No check-out, o sinal é descontado da conta sozinho, numa linha própria.",
      "O passo a passo está em Como cobrar sinal na reserva.",
    ],
    atencao: ["O sistema não recebe pagamento pela internet: o tutor paga direto para você. O link do cliente só avisa que o sinal vai ser pedido."],
    palavras: ["sinal", "adiantamento", "adiantado", "antecipado", "pagamento antecipado", "cobrar um sinal", "sinal na reserva", "sinal da reserva", "entrada na reserva", "caucao", "garantir a reserva"] },
  { id: "restaurar", titulo: "Dá para restaurar a cópia de segurança?", secao: "limites", quem: "todos", rota: null,
    passos: [
      "Não. A cópia de segurança serve para guardar e consultar: o sistema não traz esses arquivos de volta.",
      "Os dados continuam guardados no sistema. A cópia é uma garantia a mais, que fica com você.",
      "Por planilha só entram clientes e pets (Trazer de planilha, em Clientes e pets) e produtos (Trazer de planilha, em Estoque). Agenda, financeiro e o resto não voltam por arquivo.",
      "Apagou alguma coisa por engano? Fale com a nossa equipe pela Ajuda.",
    ],
    palavras: ["restaurar", "restaurar a copia", "restaurar a copia de seguranca", "restaurar copia", "restaurar backup", "restauracao", "recuperar backup", "recuperar copia", "voltar backup", "subir backup", "importar backup", "trazer a copia de volta"] },
  { id: "envio-automatico", titulo: "O sistema manda mensagens sozinho?", secao: "limites", quem: "todos", rota: null,
    passos: [
      "Não. O sistema não envia WhatsApp, SMS nem e-mail para o cliente sozinho.",
      "Ele deixa a mensagem pronta: lembrete, aviso de que terminou, confirmação de pedido, cobrança, parabéns.",
      "Você toca no botão, o WhatsApp abre com o texto escrito e você aperta enviar.",
      "A mensagem sai do seu WhatsApp, com o seu número.",
    ],
    dicas: ["Para mandar os lembretes do dia em sequência, veja Como mandar lembretes pelo WhatsApp."],
    palavras: ["envio automatico", "automatico", "automatica", "sozinho", "manda sozinho", "envia sozinho", "disparo", "disparar", "robo", "mensagem automatica", "lembrete automatico", "whatsapp automatico", "em massa"] },
  { id: "canil", titulo: "Dá para escolher o canil ou o quarto de cada hóspede?", secao: "limites", quem: "todos", rota: null,
    passos: [
      "Dá, mas é uma opção que começa desligada. O dono liga em Meu pet shop, no cartão Opções do hotel e da creche, na chave Acomodações, cria a lista (nome e quantos pets cabem) e toca em Salvar opções.",
      "Ligada, a reserva, o check-in e o Editar mostram o campo Acomodação.",
      "O nome da acomodação aparece no cartão do pet, na Ocupação e na Folha do dia.",
    ],
    dicas: ["Sem a opção ligada, dá para escrever onde o pet está em Observações."],
    palavras: ["canil", "baia", "box", "quarto", "suite", "acomodacao", "gaiola", "onde o pet fica"] },
];

const usaParte = (petshop: ComModulos, u: Uso) => (u === "banho" ? usaModulo(petshop, "banho_tosa") : u === "casa" ? usaCasa(petshop) : usaModulo(petshop, u));
/** Vale para este pet shop? Sem pet shop (a Ajuda com IA, a impressão geral), vale tudo. */
const vale = (petshop: ComModulos | null, so?: Uso[]) => !petshop || !so || so.some((u) => usaParte(petshop, u));

const numerar = (passos: string[]) => passos.map((p, i) => `${i + 1}. ${p}`).join("\n");
/** Na seção do que o sistema não faz, a resposta é uma conversa ("Não. …"), não um passo a passo numerado. */
const respostaDe = (t: { secao: SecaoId; passos: string[]; dicas?: string[]; atencao?: string[] }) => {
  const avisos = [...(t.atencao ?? []).map((a) => `Atenção: ${a}`), ...(t.dicas ?? [])];
  const corpo = t.secao === "limites" ? t.passos.join("\n") : numerar(t.passos);
  return avisos.length ? `${corpo}\n\n${avisos.join("\n")}` : corpo;
};

/** Quem tem só creche (ou só hotel) lê o título do tópico com o nome da casa dele. */
function tituloPara(titulo: string, petshop: ComModulos | null): string {
  if (!petshop) return titulo;
  const creche = usaModulo(petshop, "creche"), hotel = usaModulo(petshop, "hotel");
  if (creche === hotel) return titulo;
  return titulo
    .replace("a tela Creche e hotel", creche ? "a tela Creche" : "a tela Hotel")
    .replace("de creche ou hotel", creche ? "de creche" : "de hotel")
    .replace("da creche e do hotel", creche ? "da creche" : "do hotel")
    .replace("de creche e hotel", creche ? "de creche" : "de hotel");
}

/** O tópico em texto puro. Com pet shop, saem os passos e as dicas das partes que ele não usa. */
function pronto(t: TopicoBase, petshop: ComModulos | null): Topico {
  const linhas = (l?: Passo[]) => (l ?? []).filter((x) => typeof x === "string" || vale(petshop, x.so)).map((x) => (typeof x === "string" ? x : x.texto));
  const passos = linhas(t.passos), dicas = linhas(t.dicas), atencao = linhas(t.atencao);
  const limpo = { ...t, titulo: tituloPara(t.titulo, petshop), passos, dicas: dicas.length ? dicas : undefined, atencao: atencao.length ? atencao : undefined };
  return { ...limpo, resposta: respostaDe(limpo) };
}

/** Todos os tópicos, com todos os passos (o guia da Ajuda com IA e o padrão de quem não informa o pet shop). */
export const TOPICOS: Topico[] = BASE.map((t) => pronto(t, null));

const PARTES: Uso[] = ["banho", "creche", "hotel", "loja", "pacotes"];
const porPetshop = new Map<string, Topico[]>();
/** Os tópicos que valem para um pet shop: só os das partes que ele usa, e cada um só com os passos dele. */
export function topicosPara(petshop: ComModulos): Topico[] {
  const chave = PARTES.filter((u) => usaParte(petshop, u)).join(",");
  let lista = porPetshop.get(chave);
  if (!lista) { lista = BASE.filter((t) => vale(petshop, t.usa)).map((t) => pronto(t, petshop)); porPetshop.set(chave, lista); }
  return lista;
}

/** As seções que têm tópico para este pet shop, com o nome do jeito dele ("Creche", "Hotel", "Estoque"…). */
export function secoesPara(petshop: ComModulos): { id: SecaoId; titulo: string; apoio: string }[] {
  const lista = topicosPara(petshop);
  const loja = usaModulo(petshop, "loja"), pacotes = usaModulo(petshop, "pacotes");
  return SECOES.filter((s) => lista.some((t) => t.secao === s.id)).map((s) =>
    s.id === "creche" ? { ...s, titulo: nomeDaCasa(petshop) }
    : s.id === "estoque" && !(loja && pacotes) ? { ...s, titulo: loja ? "Estoque" : "Pacotes", apoio: loja ? "Produtos e venda no balcão." : "Vender pacote e dar baixa a cada uso." }
    : s);
}

/** Os tópicos que um dono novo precisa, na ordem, conforme a área principal do pet shop. */
const COMECO = {
  banho_tosa: ["guia", "preco-servico", "pet", "marcar", "conta", "caixa", "link", "equipe"],
  creche: ["guia", "creche-preco", "pet", "mensalista", "chamada", "cobrancas-creche", "creche-link", "equipe"],
  hotel: ["guia", "creche-preco", "pet", "creche-reserva", "creche-checkin", "creche-checkout", "creche-link", "equipe"],
  loja: ["guia", "estoque", "estoque-entrada", "venda", "caixa", "caixa-fechar", "equipe"],
} as const;
/** As dúvidas mais comuns de cada área, para os atalhos da Ajuda. */
const RAPIDAS = {
  banho_tosa: ["marcar", "conta", "link", "equipe", "caixa"],
  creche: ["mensalista", "chamada", "cobrancas-creche", "creche-link", "equipe"],
  hotel: ["creche-reserva", "creche-checkin", "creche-checkout", "creche-link", "equipe"],
  loja: ["estoque", "venda", "caixa", "caixa-fechar", "equipe"],
} as const;
/** A área que puxa a ordem: a principal do pet shop; sem ela, a primeira que ele usa. */
function areaDaFrente(petshop: ComModulos): keyof typeof COMECO {
  return principalDe(petshop) ?? (usaModulo(petshop, "banho_tosa") ? "banho_tosa" : usaModulo(petshop, "creche") ? "creche" : usaModulo(petshop, "hotel") ? "hotel" : usaModulo(petshop, "loja") ? "loja" : "banho_tosa");
}
const escolhidos = (ids: readonly string[], lista: Topico[]) => ids.map((id) => lista.find((t) => t.id === id)).filter((t): t is Topico => t != null);
export const comecandoPara = (petshop: ComModulos) => escolhidos(COMECO[areaDaFrente(petshop)], topicosPara(petshop));
export const rapidasPara = (petshop: ComModulos) => escolhidos(RAPIDAS[areaDaFrente(petshop)], topicosPara(petshop));

export const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const topicoPorId = (id: string | null | undefined, lista: Topico[] = TOPICOS) => lista.find((t) => t.id === id) ?? null;

/** Nome de cada tela, como está no menu. */
export const NOME_TELA: Record<string, string> = {
  [HOJE]: "Hoje", [AGENDA]: "Agenda", [CLIENTES]: "Clientes e pets", [CRECHE]: "Creche e hotel", [PACOTES]: "Pacotes",
  [CAIXA]: "Caixa", [FINANCEIRO]: "Financeiro", [RELATORIOS]: "Relatórios", [ESTOQUE]: "Estoque", [EQUIPE]: "Equipe",
  [PETSHOP]: "Meu pet shop", [ASSINATURA]: "Assinatura", [ESCOLA]: "Escola de Gestão", [ROTA_MANUAL]: "Manual",
};
/** O nome da tela para este pet shop: quem só tem creche lê "Creche", como no menu. */
export const nomeDaTela = (rota: string, petshop?: ComModulos | null) => (rota === CRECHE && petshop ? nomeDaCasa(petshop) : NOME_TELA[rota]);

/** A tela do aplicativo a que um endereço pertence (a agenda impressa é da Agenda; /gestao/app casa só com ela mesma). */
export function telaDoCaminho(caminho: string): string | null {
  return Object.keys(NOME_TELA).filter((r) => (r === HOJE ? caminho === r : caminho === r || caminho.startsWith(`${r}/`))).sort((a, b) => b.length - a.length)[0] ?? null;
}

/** Tópicos de uma tela do aplicativo: os que moram nela e os que também se fazem por ela. Com o pet shop, só os dele. */
export function topicosDaRota(caminho: string, petshop?: ComModulos | null): Topico[] {
  const tela = telaDoCaminho(caminho);
  if (!tela) return [];
  const lista = petshop ? topicosPara(petshop) : TOPICOS;
  return [...lista.filter((t) => t.rota === tela), ...lista.filter((t) => t.rota !== tela && t.tambem?.includes(tela))];
}

const VAZIAS = new Set(["como", "faco", "fazer", "faz", "que", "para", "pra", "um", "uma", "uns", "de", "do", "da", "dos", "das", "no", "na", "nos", "nas", "eu", "meu", "minha", "os", "as", "em", "por", "com", "se", "quero", "posso", "onde", "qual", "quando", "ao", "aos"]);
/** Começo da palavra, para "importo" achar "importar" e "vacinas" achar "vacina". */
const raiz = (w: string) => (w.length >= 7 ? w.slice(0, w.length - 2) : w.length >= 5 ? w.slice(0, w.length - 1) : w);
const limpa = (s: string) => semAcento(s).replace(/[^a-z0-9 -]/g, " ").replace(/\s+/g, " ").trim();

/**
 * Busca do manual: sem acento, em título, palavras, passos e avisos.
 * Vem primeiro o tópico que tem a busca inteira como palavra-chave ("troco" acha o caixa, não "trocar a senha");
 * depois os que têm todas as palavras escritas; se nenhum tem todas, os que têm alguma, do mais parecido para o menos.
 * Palavra inteira vale mais que pedaço de palavra.
 */
export function buscarNoManual(texto: string, lista: Topico[] = TOPICOS): Topico[] {
  const frase = limpa(texto);
  const todos = frase.split(" ").filter((w) => w.length > 1);
  const uteis = todos.filter((w) => !VAZIAS.has(w));
  const inteiras = uteis.length ? uteis : todos;
  if (!inteiras.length) return lista;
  const termos = inteiras.map(raiz);
  const fraseUtil = inteiras.join(" ");
  const notas = lista.map((t) => {
    const titulo = ` ${limpa(t.titulo)} `, chaves = t.palavras.map(limpa), palavras = chaves.join(" | "), corpo = semAcento(t.resposta);
    // 2 = a busca é uma palavra-chave do tópico; 1 = a busca está inteira dentro de uma palavra-chave
    const exata = chaves.includes(fraseUtil) || chaves.includes(frase) ? 2 : chaves.some((c) => ` ${c} `.includes(` ${fraseUtil} `)) ? 1 : 0;
    let n = 0, achou = 0;
    inteiras.forEach((w, i) => {
      const r = termos[i];
      const p = titulo.includes(` ${w} `) ? 6 : chaves.includes(w) ? 5 : titulo.includes(r) ? 4 : palavras.includes(r) ? 3 : corpo.includes(r) ? 1 : 0;
      if (p) { n += p; achou += 1; }
    });
    return { t, n, achou, exata };
  });
  const completos = notas.filter((x) => x.exata > 0 || x.achou === termos.length);
  return (completos.length ? completos : notas.filter((x) => x.achou > 0)).sort((a, b) => b.exata - a.exata || b.achou - a.achou || b.n - a.n).map((x) => x.t);
}
