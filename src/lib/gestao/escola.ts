import { PRODUTOS, linhaDe, type Produto } from "@/lib/produtos";

/**
 * Escola de Gestão: aulas curtas e gratuitas sobre a rotina do pet shop e a estante de materiais da Maestro Pet
 * para quem quer oferecer um serviço novo. A compra é na Cakto (entrega por e-mail, como sempre); quem compra com
 * o e-mail da conta também lê o material aqui dentro.
 */

/** O que cada material ensina, dito para quem já tem pet shop. Sem promessa de resultado. */
const OLHAR: Record<string, { ideia: string; aprende: string[]; paraQuem: string }> = {
  confeitaria: {
    ideia: "Petiscos e bolos de aniversário feitos por você, para vender no balcão ou por encomenda.",
    aprende: ["30 receitas testadas para cães", "Ficha técnica: quanto custa cada receita", "Como chegar ao preço de venda", "O que a regra exige para vender alimento para pet", "Etiquetas e embalagem"],
    paraQuem: "Para quem tem cozinha disponível e clientes que já pedem bolo de aniversário para o pet.",
  },
  fotografia: {
    ideia: "Ensaio fotográfico do pet depois do banho, no próprio pet shop.",
    aprende: ["Como fotografar sem estressar o animal", "Equipamento em 3 níveis, começando pelo celular", "Contrato e autorização de uso de imagem", "Como montar o preço do ensaio", "Como oferecer para quem já é cliente"],
    paraQuem: "Para quem já faz foto de antes e depois e quer transformar isso num serviço à parte.",
  },
  passeador: {
    ideia: "Passeio com cães como serviço extra para os clientes do bairro.",
    aprende: ["Leitura de comportamento e segurança na rua", "Equipamento e quantos cães por passeio", "Preço por passeio e por pacote", "Contrato e ficha do cão", "Como conseguir os primeiros clientes"],
    paraQuem: "Para quem tem alguém na equipe com tempo livre entre os banhos e clientes que trabalham fora.",
  },
  petsitter: {
    ideia: "Visitas na casa do tutor para cuidar de cães e gatos quando ele viaja.",
    aprende: ["Rotina de uma visita, do começo ao fim", "Sinais de alerta de saúde", "Como lidar com chaves e acesso à casa", "Contrato e ficha de cuidados", "Como montar o preço"],
    paraQuem: "Para quem não tem espaço para hotel e recebe pedido de cliente que vai viajar.",
  },
  moldes: {
    ideia: "Roupas para cães feitas por você, para vender na loja.",
    aprende: ["60 moldes do PP ao XGG, com passo a passo e fotos", "Como tirar as medidas do cão", "Tecidos e aviamentos que funcionam", "Como montar a sua marca", "O caminho até a primeira venda"],
    paraQuem: "Para quem costura, ou tem alguém que costura, e quer um produto próprio na prateleira.",
  },
  "moldes-natal": {
    ideia: "Coleção de Natal para cães, para costurar e vender no fim do ano.",
    aprende: ["20 moldes de roupas e acessórios de Natal", "Do PP ao XGG, com passo a passo e fotos", "Calendário: quando produzir e quando anunciar", "Ideias de kit para presente"],
    paraQuem: "Para quem já costura e quer uma coleção de época pronta.",
  },
};

export type Material = Produto & { ideia: string; aprende: string[]; paraQuem: string; codigo: string };

/** Código do checkout da Cakto ("35oowwt" em https://pay.cakto.com.br/35oowwt). */
const codigoDe = (url: string) => (url.match(/pay\.cakto\.com\.br\/([a-z0-9_-]+)/i)?.[1] ?? "").toLowerCase();

/** A estante: os materiais da linha de negócios que já estão à venda. */
export const MATERIAIS: Material[] = PRODUTOS
  .filter((p) => linhaDe(p) === "negocios" && p.lancado && p.checkout && OLHAR[p.slug])
  .map((p) => ({ ...p, ...OLHAR[p.slug], codigo: codigoDe(p.checkout) }));

export const material = (slug: string) => MATERIAIS.find((m) => m.slug === slug) ?? null;

/** Link de pagamento com o e-mail da conta já preenchido: é por ele que o sistema reconhece a compra. */
export function linkDeCompra(m: Material, email: string | null | undefined) {
  if (!email) return m.checkout;
  try { const u = new URL(m.checkout); u.searchParams.set("email", email); return u.toString(); } catch { return m.checkout; }
}

/**
 * Descobre de qual material é um aviso de compra da Cakto. Confere o código do checkout, os códigos do
 * produto e da oferta e, por último, o nome do produto.
 */
export function materialDoAviso(dados: Record<string, unknown>): Material | null {
  const produto = (dados.product ?? {}) as Record<string, unknown>;
  const oferta = (dados.offer ?? {}) as Record<string, unknown>;
  const pistas = [dados.checkoutUrl, dados.checkout_url, produto.short_id, produto.id, oferta.id, oferta.short_id]
    .filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase());
  const porCodigo = MATERIAIS.find((m) => m.codigo && pistas.some((p) => p === m.codigo || p.endsWith(`/${m.codigo}`)));
  if (porCodigo) return porCodigo;
  const nome = typeof produto.name === "string" ? produto.name.trim().toLowerCase() : "";
  return nome ? MATERIAIS.find((m) => m.nome.trim().toLowerCase() === nome) ?? null : null;
}

/* ---------- aulas gratuitas ---------- */

export type Aula = {
  id: string; titulo: string; resumo: string; minutos: number; tema: "Preço" | "Agenda" | "Clientes" | "Dinheiro" | "Equipe" | "Creche e hotel" | "Divulgação" | "Estoque";
  /** Parágrafos e listas, na ordem. */
  corpo: ({ p: string } | { lista: string[] } | { t: string })[];
  /** Onde fazer isso no sistema. */
  naPratica: { texto: string; rotulo: string; href: string };
};

export const AULAS: Aula[] = [
  {
    id: "preco-do-banho", titulo: "Quanto custa, de verdade, um banho", tema: "Preço", minutos: 4,
    resumo: "A conta que mostra se o seu preço cobre o que você gasta.",
    corpo: [
      { p: "Muito pet shop escolhe o preço olhando o vizinho. O problema é que o vizinho tem outro aluguel, outra equipe e outro shampoo. O preço certo começa pela sua conta." },
      { t: "A conta em três partes" },
      { lista: [
        "Produto: quanto de shampoo, condicionador, perfume e lâmina vai em um banho. Divida o preço do galão pelo número de banhos que ele rende.",
        "Tempo: quanto custa a hora de quem dá o banho (salário e encargos do mês, divididos pelas horas trabalhadas), vezes o tempo que aquele porte leva.",
        "Casa: aluguel, água, luz, internet e sistema do mês, divididos pelo número de banhos que você faz no mês.",
      ] },
      { p: "Some as três partes: esse é o custo do banho. O preço precisa ficar acima dele com folga para imposto, imprevisto e o seu ganho. Faça a conta separada para P, M, G e GG: um cão grande gasta mais produto e mais tempo, e é comum cobrar pouco justamente nele." },
      { p: "Refaça a conta quando o aluguel, o salário ou o preço do produto mudar. Preço que ninguém revisa vai ficando para trás sem aviso." },
    ],
    naPratica: { texto: "Os preços por porte de cada serviço ficam em Meu pet shop. O custo de cada produto fica no Estoque.", rotulo: "Abrir Meu pet shop", href: "/gestao/app/meu-petshop" },
  },
  {
    id: "menos-faltas", titulo: "Como diminuir as faltas na agenda", tema: "Agenda", minutos: 3,
    resumo: "Lembrete na véspera, confirmação e o que fazer com quem falta sempre.",
    corpo: [
      { p: "Horário vazio é o prejuízo mais difícil de ver: não aparece em nenhuma conta, mas a equipe ficou parada e o custo do dia foi o mesmo." },
      { t: "O que costuma funcionar" },
      { lista: [
        "Lembrete na véspera, sempre no mesmo horário. A maior parte das faltas é esquecimento, não má vontade.",
        "Peça uma resposta: \"confirma?\" funciona melhor do que só avisar. Quem responde se compromete.",
        "Sem resposta até o fim do dia, ligue ou ofereça o horário para outro cliente.",
        "Anote cada falta. Com o histórico na mão, você conversa com quem falta sempre com fatos, sem acusar.",
        "Para quem já faltou mais de uma vez, combine pagamento adiantado ou marque só no dia.",
      ] },
      { p: "Vale também olhar em que dia e horário as faltas se concentram. Às vezes o problema é um horário ruim para o bairro, e não o cliente." },
    ],
    naPratica: { texto: "Na tela inicial, em Pede a sua atenção, os lembretes de amanhã abrem o WhatsApp de cada tutor com a mensagem pronta. As faltas de cada pet aparecem na ficha e em Relatórios.", rotulo: "Abrir a tela inicial", href: "/gestao/app" },
  },
  {
    id: "pacote-mensal", titulo: "Pacote de banhos: quando vale e como montar", tema: "Clientes", minutos: 4,
    resumo: "O pacote dá previsão para a agenda, se o desconto e a validade forem pensados.",
    corpo: [
      { p: "Pacote é o cliente combinando com você, adiantado, que volta. Para o pet shop, isso significa agenda mais previsível e dinheiro que entra antes do serviço. Para o cliente, um preço um pouco melhor e o pet sempre limpo." },
      { t: "Três decisões" },
      { lista: [
        "Quantos banhos: quatro por mês serve para quem vem toda semana; dois, para quem vem de quinze em quinze dias. Olhe a frequência real dos seus clientes antes de inventar.",
        "Desconto: ele sai do seu ganho, então confira com a conta do custo do banho. Um desconto pequeno com a vantagem do horário fixo costuma bastar.",
        "Validade: defina e avise. Pacote sem validade vira dívida sua por tempo indeterminado.",
      ] },
      { p: "Combine também o que acontece com banho não usado e com falta. Escreva a regra numa mensagem curta e mande junto com a venda: evita discussão depois." },
      { p: "Ofereça primeiro para quem já vem com frequência. É mais fácil transformar um cliente fiel em mensalista do que convencer quem aparece duas vezes por ano." },
    ],
    naPratica: { texto: "Em Pacotes você cria o modelo (quantos usos, validade e preço), vende para um pet e dá baixa a cada banho.", rotulo: "Abrir Pacotes", href: "/gestao/app/pacotes" },
  },
  {
    id: "caixa-do-dia", titulo: "Caixa do dia: por que abrir e fechar", tema: "Dinheiro", minutos: 3,
    resumo: "Cinco minutos que mostram onde o dinheiro some.",
    corpo: [
      { p: "Abrir o caixa é dizer com quanto dinheiro a gaveta começa. Fechar é contar o que tem no fim do dia e comparar com o que deveria ter. A diferença entre os dois números é a informação mais útil que o caixa dá." },
      { t: "O hábito" },
      { lista: [
        "Abra com o troco contado, todo dia, antes do primeiro cliente.",
        "Registre na hora: recebeu, anotou. Deixar para o fim do dia é a maior causa de diferença.",
        "Tirou dinheiro da gaveta para pagar algo ou levar ao banco? Registre a retirada. Não é despesa nem venda, é só dinheiro que saiu da gaveta.",
        "No fim do dia, conte a gaveta e feche. Sobrou ou faltou, anote o motivo se souber.",
      ] },
      { p: "Diferença pequena e ocasional é troco errado. Diferença que se repete, sempre para o mesmo lado, pede atenção: pode ser um serviço que não está sendo anotado ou um desconto dado de boca." },
      { p: "E não misture a gaveta com o seu bolso. Se precisar tirar para uso pessoal, registre como retirada. No fim do mês você vai querer saber quanto o negócio rendeu, e não quanto sobrou depois das suas contas de casa." },
    ],
    naPratica: { texto: "No Caixa você abre com o troco, recebe, tira e coloca dinheiro na gaveta e fecha conferindo o que foi contado.", rotulo: "Abrir o Caixa", href: "/gestao/app/caixa" },
  },
  {
    id: "cliente-sumido", titulo: "Como chamar de volta o cliente que sumiu", tema: "Clientes", minutos: 3,
    resumo: "Uma mensagem simples, na hora certa, para quem já gostou do seu serviço.",
    corpo: [
      { p: "Quem já veio conhece o caminho, o preço e a equipe. Trazer essa pessoa de volta dá bem menos trabalho do que conquistar alguém que nunca entrou na loja." },
      { t: "Como fazer sem ser chato" },
      { lista: [
        "Escolha um prazo: quem vinha todo mês e passou de 45 dias sem aparecer merece um contato.",
        "Fale do pet pelo nome. \"Faz tempo que não vemos a Mel\" é melhor do que uma propaganda igual para todo mundo.",
        "Ofereça um horário concreto: \"tenho quinta às 10h, quer que eu separe?\". Facilita a resposta.",
        "Uma mensagem basta. Sem resposta, deixe passar um tempo antes de tentar de novo.",
        "Se a pessoa disser por que parou, anote. É a pesquisa de satisfação mais sincera que você vai ter.",
      ] },
      { p: "Separe uma hora fixa na semana para isso, num horário de movimento baixo. Feito aos poucos, vira rotina, e não um mutirão que nunca acontece." },
    ],
    naPratica: { texto: "Em Clientes e pets, o filtro de sumidos mostra quem já veio e parou. Da ficha, o botão de WhatsApp abre a conversa com o tutor.", rotulo: "Abrir Clientes e pets", href: "/gestao/app/clientes" },
  },
  {
    id: "comissao", titulo: "Comissão da equipe: como combinar sem dor de cabeça", tema: "Equipe", minutos: 3,
    resumo: "Sobre o quê, quando paga e o que fazer com desconto e pacote.",
    corpo: [
      { p: "Comissão mal combinada vira briga no fim do mês. A regra não precisa ser complicada, mas precisa estar clara para os dois lados antes do primeiro pagamento." },
      { t: "O que definir" },
      { lista: [
        "Sobre o quê: o valor do serviço que a pessoa fez. Produto vendido no balcão é outra conversa.",
        "Quando o cliente ganha desconto: a comissão é sobre o valor cobrado ou sobre o preço cheio? Escolha e mantenha.",
        "Banho pago com pacote: o serviço foi feito, então a pessoa precisa receber por ele. Combine sobre qual valor.",
        "Cliente que ficou de pagar depois: a comissão sai quando o serviço é feito ou quando o dinheiro entra?",
        "Data: um dia fixo para fechar o período e pagar.",
      ] },
      { p: "Deixe as regras por escrito, mesmo que seja numa mensagem. E mostre a conta: quem vê de onde veio cada valor confia no número e para de fazer a própria planilha paralela." },
    ],
    naPratica: { texto: "O percentual de cada pessoa fica em Equipe. A conta do período sai pronta em Relatórios, usando o valor cobrado de cada atendimento.", rotulo: "Abrir Relatórios", href: "/gestao/app/relatorios" },
  },
  {
    id: "lotacao-creche", titulo: "Creche e hotel: quantos cães cabem de verdade", tema: "Creche e hotel", minutos: 4,
    resumo: "Como chegar ao número de vagas e por que respeitar esse número.",
    corpo: [
      { p: "Na creche e no hotel, o que você vende é atenção e espaço. Os dois acabam. Definir o número de vagas antes do feriado é o que evita aceitar por impulso um cão a mais do que a equipe dá conta." },
      { t: "Como chegar ao número" },
      { lista: [
        "Espaço: conte quantos cães ficam soltos com conforto na área, sem disputa por canto, água ou sombra.",
        "Gente: quantos cães cada monitor acompanha com segurança ao mesmo tempo. Com filhotes, idosos ou cães reativos, esse número cai.",
        "Hotel: conte os lugares de dormir de verdade, não os improvisados.",
        "Use o menor dos números. A vaga que falta em qualquer um deles é a que dá problema.",
      ] },
      { p: "Creche e hotel têm contas separadas: a creche esvazia no fim do dia, o hotel não. No hotel, quem sai de manhã libera a vaga para quem chega à tarde." },
      { p: "Defina também o que fazer quando lota: lista de espera, prioridade para mensalista, e a resposta pronta para o cliente que pede em cima da hora. Dizer que não há vaga, com educação, costuma passar mais confiança do que aceitar todo mundo." },
    ],
    naPratica: { texto: "Em Meu pet shop você define as vagas da creche e do hotel. A tela Creche e hotel mostra quantas estão ocupadas e avisa quando a reserva passa do limite.", rotulo: "Abrir Creche e hotel", href: "/gestao/app/creche-hotel" },
  },
  {
    id: "regras-de-entrada", titulo: "Vacina em dia e outras regras de entrada", tema: "Creche e hotel", minutos: 3,
    resumo: "O que pedir ao tutor antes de aceitar um cão e como cobrar isso sem atrito.",
    corpo: [
      { p: "Quem junta cães no mesmo espaço responde pela saúde de todos. Uma regra de entrada clara protege os animais, a equipe e o próprio negócio, e é mais fácil de cumprir quando o tutor a conhece antes de chegar." },
      { t: "O que costuma entrar na regra" },
      { lista: [
        "Vacinas em dia, com a carteira conferida. Pergunte ao veterinário de confiança quais exigir para convivência em grupo.",
        "Controle de pulgas e carrapatos e vermífugo dentro do prazo.",
        "Uma conversa ou um período de adaptação antes da primeira diária, para conhecer o temperamento do cão.",
        "O que o tutor precisa trazer: ração, remédio com horário e dose por escrito, contato de emergência.",
        "O que fazer se o cão passar mal: quem é avisado e para qual veterinário ele vai.",
      ] },
      { p: "Anote a data de vencimento de cada vacina. Avisar o tutor uns dias antes de vencer é um cuidado que ele agradece, e evita a cena de recusar o cão na porta." },
      { p: "Regra só funciona se vale para todos. Abrir exceção para um cliente antigo é o jeito mais rápido de a regra deixar de existir." },
    ],
    naPratica: { texto: "Na ficha do pet, em Saúde, você anota vacina, vermífugo e antipulgas com a data de vencer. O sistema avisa na tela inicial e na hora da entrada na creche ou no hotel.", rotulo: "Abrir Clientes e pets", href: "/gestao/app/clientes" },
  },
  {
    id: "link-de-agendamento", titulo: "Como fazer o cliente usar o link de agendamento", tema: "Divulgação", minutos: 3,
    resumo: "O link só economiza o seu tempo se o cliente souber que ele existe.",
    corpo: [
      { p: "Cada \"tem horário sábado?\" respondido no WhatsApp custa alguns minutos, várias vezes por dia. O link de agendamento tira essa conversa da sua mão: o cliente vê os horários livres e manda o pedido, e você só aceita." },
      { t: "Onde colocar" },
      { lista: [
        "Na descrição do perfil do Instagram e do WhatsApp do pet shop.",
        "Na resposta automática ou na mensagem de saudação do WhatsApp.",
        "No lembrete e na mensagem de \"pet pronto\": o cliente satisfeito já deixa o próximo marcado.",
        "Num aviso no balcão, com um código para apontar a câmera do celular.",
      ] },
      { p: "Nas primeiras semanas, quando alguém perguntar por horário, responda com o link e uma frase curta: \"por aqui você já vê o que está livre\". Depois de duas ou três vezes, o cliente vai direto." },
      { p: "Responda os pedidos rápido. Se o cliente pede pelo link e fica horas sem resposta, ele volta a chamar no WhatsApp e o hábito não se forma. Vale olhar os pedidos em horários fixos do dia." },
    ],
    naPratica: { texto: "O botão \"Link do cliente\", na tela inicial e na Agenda, copia o link e manda no WhatsApp. Lá você também escolhe se o link recebe pedido de creche e de hotel.", rotulo: "Abrir a Agenda", href: "/gestao/app/agenda" },
  },
  {
    id: "fiado", titulo: "Cliente que paga depois: como controlar", tema: "Dinheiro", minutos: 3,
    resumo: "Vender fiado sem perder o dinheiro nem o cliente.",
    corpo: [
      { p: "Em bairro, deixar para pagar depois faz parte. O risco não está em confiar no cliente, e sim em confiar na memória: o que não é anotado na hora vira dúvida depois, para os dois lados." },
      { t: "Regras simples" },
      { lista: [
        "Anote na hora, com valor e data combinada para pagar. Sem data, a conta não vence nunca.",
        "Combine um limite: quantas contas abertas um cliente pode ter antes de quitar as anteriores.",
        "No dia combinado, uma mensagem curta e sem cobrança no tom: \"passando para lembrar do banho do dia 10, R$ 70\".",
        "Olhe a lista de contas a receber uma vez por semana, no mesmo dia.",
        "Conta antiga demais merece uma conversa franca, de preferência pessoalmente.",
      ] },
      { p: "Separe na cabeça o que foi vendido do que foi recebido. Um mês cheio de atendimentos e com muito fiado em aberto pode terminar com pouco dinheiro na conta. Acompanhar os dois números evita susto." },
    ],
    naPratica: { texto: "Ao fechar a conta, escolha \"Cliente paga depois\" e a data. A conta aparece em Financeiro, na aba A receber, e na ficha do tutor. Quando ele pagar, é só dar baixa.", rotulo: "Abrir o Financeiro", href: "/gestao/app/financeiro" },
  },
  {
    id: "estoque-minimo", titulo: "Estoque: o que não pode faltar e o que não pode sobrar", tema: "Estoque", minutos: 3,
    resumo: "Um número mínimo por produto resolve a maior parte do problema.",
    corpo: [
      { p: "Estoque dá dois tipos de prejuízo. Faltar shampoo no meio do sábado para a operação. Sobrar produto parado na prateleira é dinheiro que você já gastou e ainda não voltou." },
      { t: "O mínimo de cada produto" },
      { lista: [
        "Veja quanto você gasta ou vende do produto por semana.",
        "Veja quantos dias o fornecedor leva para entregar.",
        "O mínimo é o que você consome nesse prazo, com uma folga. Chegou nele, é hora de pedir.",
        "Produto que vence (ração, petisco, remédio) pede compra menor e mais frequente.",
      ] },
      { p: "Separe o que é de uso (shampoo, perfume, lâmina) do que é de venda (ração, acessório). O de uso entra no custo do banho. O de venda precisa de preço que cubra o custo, e é o que vale conferir quando o fornecedor reajusta." },
      { p: "Uma vez por mês, conte o que tem na prateleira e compare com o sistema. A diferença mostra perda, erro de lançamento ou produto que saiu sem ser anotado." },
    ],
    naPratica: { texto: "No Estoque, cada produto tem custo, preço de venda e estoque mínimo. O sistema avisa na tela inicial quando um produto está acabando.", rotulo: "Abrir o Estoque", href: "/gestao/app/estoque" },
  },
  {
    id: "meta-do-mes", titulo: "Meta do mês: como escolher um número que ajuda", tema: "Dinheiro", minutos: 3,
    resumo: "A meta serve para orientar o dia a dia, e não para enfeitar a parede.",
    corpo: [
      { p: "Meta boa é a que você consegue traduzir em quantos atendimentos precisa fazer por dia. Um número solto, escolhido porque parece bonito, não muda nenhuma decisão." },
      { t: "De onde tirar o número" },
      { lista: [
        "Comece pelo que o negócio precisa pagar no mês: aluguel, salários, fornecedores, impostos e a sua retirada.",
        "Compare com o que entrou nos últimos meses. A meta fica entre o que já acontece e um pouco acima.",
        "Divida pelos dias em que o pet shop abre. Esse é o valor por dia.",
        "Divida pelo valor médio de um atendimento. Esse é o número de pets por dia.",
      ] },
      { p: "Olhe a meta toda semana, não só no dia 30. No meio do mês ainda dá para reagir: chamar clientes que sumiram, oferecer pacote, abrir um horário extra. No último dia, só resta anotar o resultado." },
      { p: "Se a meta nunca é batida, o número está errado ou falta agenda para tanto. As duas respostas são úteis." },
    ],
    naPratica: { texto: "Na tela inicial, o cartão da meta do mês mostra quanto já entrou, quanto falta e quanto precisa entrar por dia aberto até o fim do mês.", rotulo: "Abrir a tela inicial", href: "/gestao/app" },
  },
  {
    id: "retirada-do-dono", titulo: "O dinheiro do pet shop e o seu dinheiro", tema: "Dinheiro", minutos: 3,
    resumo: "Separar as duas contas é o que mostra se o negócio se paga.",
    corpo: [
      { p: "Quando a conta do pet shop paga o mercado de casa e o cartão pessoal paga o fornecedor, fica impossível saber se o negócio dá resultado. O problema é a mistura, mais do que a falta de dinheiro." },
      { t: "Como separar" },
      { lista: [
        "Uma conta bancária só para o pet shop, mesmo que simples.",
        "Um valor fixo de retirada por mês, em data certa, como se fosse o seu salário.",
        "Gasto pessoal sai da sua conta. Gasto do pet shop sai da conta do pet shop.",
        "Precisou tirar a mais? Anote como retirada, para a conta do mês continuar fazendo sentido.",
      ] },
      { p: "Com a retirada definida, o que sobra depois dela e das despesas é o resultado do negócio. É com esse número que você decide contratar, reformar ou guardar para um mês fraco." },
      { p: "Se você ainda não sabe quanto dá para retirar, comece com um valor baixo que o caixa aguente todo mês. Um valor pequeno e constante ensina mais sobre o negócio do que retiradas grandes e irregulares." },
    ],
    naPratica: { texto: "No Financeiro, lance a sua retirada como uma saída na categoria Retirada do dono. O resultado do mês passa a mostrar o que o negócio rendeu depois dela.", rotulo: "Abrir o Financeiro", href: "/gestao/app/financeiro" },
  },
  {
    id: "antes-e-depois", titulo: "A foto de antes e depois como divulgação", tema: "Divulgação", minutos: 3,
    resumo: "O melhor anúncio de um banho e tosa é o resultado, mostrado com cuidado.",
    corpo: [
      { p: "O tutor escolhe banho e tosa pelo que vê. Uma foto do pet limpo e bem tosado, mandada na hora em que ele fica pronto, costuma ser mostrada para a família e para os amigos sem você pedir." },
      { t: "Como fazer bem" },
      { lista: [
        "Mesmo lugar, mesma luz, fundo limpo. A foto fica parecida com as outras e o seu trabalho aparece.",
        "Antes do banho e depois de pronto, no mesmo ângulo.",
        "Mande ao tutor junto com o aviso de que o pet está pronto.",
        "Para publicar nas redes, peça autorização. Um \"posso postar a foto do Thor?\" basta, e a maioria gosta.",
        "Nunca exponha o animal em mau estado de um jeito que constranja o tutor.",
      ] },
      { p: "Guarde as fotos na ficha do pet. Além da divulgação, elas servem de referência para a próxima tosa e de registro de como o animal chegou." },
    ],
    naPratica: { texto: "No detalhe do horário, em Antes e depois, você tira as duas fotos e manda ao tutor pelo WhatsApp quando o pet fica pronto.", rotulo: "Abrir a Agenda", href: "/gestao/app/agenda" },
  },
  {
    id: "delegar", titulo: "Quando chega a primeira pessoa para ajudar", tema: "Equipe", minutos: 3,
    resumo: "O que combinar e o que liberar no sistema para cada função.",
    corpo: [
      { p: "Contratar a primeira pessoa muda o trabalho do dono: além de atender, você passa a organizar o trabalho de outra pessoa. O que ajuda é ter poucas regras claras desde o primeiro dia." },
      { t: "O que combinar" },
      { lista: [
        "O que a pessoa faz e o que não faz. Quem atende o telefone, quem recebe, quem fecha o caixa.",
        "Como cada serviço é feito do seu jeito. Mostre uma vez, acompanhe outra, e só então deixe sozinha.",
        "Horário, folga e como avisar quando não puder vir.",
        "Como o trabalho é conferido: uma olhada rápida no fim do dia vale mais do que uma bronca no fim do mês.",
      ] },
      { t: "O que liberar" },
      { p: "Cada pessoa vê só o que precisa para a função. Quem dá banho precisa da agenda e da ficha do pet. Quem fica na recepção marca horário e recebe. O financeiro e os relatórios ficam com você, e com quem dividir essa responsabilidade." },
      { p: "Acesso a mais não é sinal de confiança, é só risco sem necessidade. Dá para aumentar depois, conforme a pessoa assume mais tarefas." },
    ],
    naPratica: { texto: "Em Equipe, você adiciona a pessoa, escolhe um perfil pronto (recepção, financeiro, gerente, sócio) e ajusta área por área o que ela abre.", rotulo: "Abrir Equipe", href: "/gestao/app/equipe" },
  },
];

export const aula = (id: string) => AULAS.find((a) => a.id === id) ?? null;
