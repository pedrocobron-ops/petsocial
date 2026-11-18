import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Boxes, CalendarCheck, CalendarRange, Check, ChevronDown, FileText, KeyRound, Megaphone, MessageCircle, Monitor, Palette, Send, ShieldCheck, Smartphone, Sparkles, ToggleRight } from "lucide-react";
import Instalar from "@/components/gestao/instalar";
import Vitrine, { Areas } from "@/components/gestao/vitrine";
import ChatVendas from "@/components/gestao/chat-vendas";
import NovidadesVenda from "@/components/gestao/novidades-venda";
import { Marca } from "@/components/gestao/marca";
import { linkSuporte } from "@/lib/gestao/contato";
import PlanosVenda from "@/components/gestao/planos-venda";
import { DIAS_DE_ARREPENDIMENTO, DIAS_DE_ATRASO_PADRAO, PERIODOS, PLANOS, TEXTOS_ASSINAR, ofertaDe } from "@/lib/gestao/planos";
import { lerVendaPublica, linhaDoVendedor } from "@/lib/gestao/vendedor";
import GuardarOrigem from "@/components/gestao/guardar-origem";
import { brlCurto } from "@/lib/gestao/util";
import "./produto.css";

// espaço que não quebra: o preço fica sempre na mesma linha
const DESDE = brlCurto(PLANOS[0].preco).replace(" ", "\u00a0");
// Título e descrição curtos: o WhatsApp e o Google cortam o que passa de 60 e de 155 letras (testes/unidade/vendas.js confere).
const TITULO = "Maestro Pet Gestão: sistema para pet shop no celular";
const DESCRICAO = `Agenda, clientes, creche, hotel, loja e caixa num sistema só. Planos desde ${DESDE} por mês. 7 dias grátis, sem cartão.`;
const IMAGEM = { url: "/gestao/compartilhar.jpg", width: 1200, height: 630, alt: "Maestro Pet Gestão: o seu pet shop organizado, do banho ao caixa. Ao lado, um boletim do pet de exemplo, com a foto de antes e a de depois do banho." };

export const metadata: Metadata = {
  title: { absolute: TITULO },
  description: DESCRICAO,
  // A página de venda aparece no Google; o aplicativo e as telas de entrada continuam fora (layout do grupo).
  robots: { index: true, follow: true },
  alternates: { canonical: "/gestao" },
  openGraph: { title: TITULO, description: DESCRICAO, url: "/gestao", type: "website", siteName: "Maestro Pet Gestão", locale: "pt_BR", images: [IMAGEM] },
  twitter: { card: "summary_large_image", title: TITULO, description: DESCRICAO, images: [IMAGEM.url] },
};

const CRIAR = "/gestao/criar-conta";

/** O que a pessoa diz e o que o assistente faz com isso. */
const PEDIDOS: [string, string][] = [
  ["“Marca banho da Mel sexta às dez.”", "Ele acha a Mel, confere o horário e deixa o agendamento pronto para você confirmar."],
  ["“Faz o check-in do Thor no hotel.”", "Mostra a entrada que vai anotar e espera você confirmar."],
  ["“Entrou dez sacos de ração a cento e quarenta.”", "Dá entrada no estoque e lança a compra como despesa."],
  ["“Quanto entrou essa semana?”", "Responde com os números do seu caixa, por forma de pagamento."],
  ["“Quem não aparece há dois meses?”", "Lista os pets e prepara a mensagem de WhatsApp para cada tutor. Quem envia é você."],
  ["“A luz deste mês veio trezentos e oitenta.”", "Acha a conta de luz do mês em A pagar e mostra o valor novo para você confirmar."],
];

type TelaVenda = { arquivo: string; alt: string; celular?: boolean };

/** As seis coisas que a página mostra primeiro (a sétima é o Mozart, na seção seguinte). Cada frase tem a tela real ao lado. */
const DIFERENCAS: { id: string; titulo: React.ReactNode; texto: string; itens: string[]; telas: TelaVenda[] }[] = [
  {
    id: "tudo", titulo: <>Tudo num plano só, <em>desde {DESDE}.</em></>,
    texto: `Banho e tosa, creche, hotel e loja no mesmo sistema. Todas as funções estão em todos os planos, inclusive no de ${DESDE}. Você escolhe o plano só pelo número de pessoas que entram.`,
    itens: [
      "Você marca o que o seu negócio faz, e o menu mostra só isso.",
      "O resto fica guardado. Quando precisar, você liga, sem trocar de plano.",
      "Sem fidelidade. 7 dias grátis, sem cartão.",
    ],
    telas: [{ arquivo: "pc-o-que-usa", alt: "Meu pet shop, cartão O que você usa: banho e tosa, creche, hotel, venda de produtos e pacotes marcados, e a área principal escolhida" }],
  },
  {
    id: "contas", titulo: <>Saiba quanto custa <em>manter o pet shop.</em></>,
    texto: "Cadastre uma vez o aluguel, a luz, os salários e as outras contas fixas. O Financeiro mostra quanto elas somam por mês, quanto você precisa faturar para pagá-las e quanto já entrou.",
    itens: [
      "A conta de cada mês entra sozinha em A pagar, 10 dias antes de vencer. Luz e água entram com um valor aproximado até você escrever o certo.",
      "Taxas da maquininha: ao receber no cartão, você vê quanto recebe de verdade. O crédito parcelado aparece mês a mês no que ainda vai cair.",
      "Quanto sobrou de cada serviço e produto, já com o custo do material, e quanto cada pessoa atendeu e vendeu.",
      "Indicadores: faturamento por mês, clientes que voltaram e os dias mais cheios. Sem movimento, a tela diz que ainda não tem dados.",
    ],
    telas: [{ arquivo: "pc-contas-fixas", alt: "Financeiro, aba Contas fixas: quanto custa manter o pet shop, quanto precisa faturar no mês para pagar as contas fixas e quanto já entrou, com a barra do quanto falta" }],
  },
  {
    id: "banho", titulo: <>O banho e tosa <em>do começo ao fim.</em></>,
    texto: "No quadro do dia, cada pet passa de Esperando para No banho, Secando, Pronto e Entregue. Quando ele fica pronto, a mensagem para o tutor abre no seu WhatsApp.",
    itens: [
      "Se você ligar, a Entrada abre na chegada: temperamento, ferida ou pulga com até 4 fotos, pertences e o aceite do tutor, assinado no aparelho ou pelo link.",
      "O quadro pode ficar aberto numa TV ou num computador da loja. No computador, dá para arrastar o cartão.",
      "Leva e traz: a lista de quem buscar e levar, a rota no Google Maps e o Estou chegando pelo WhatsApp.",
      "No fim, o boletim com as fotos do banho, que o tutor abre pelo link.",
    ],
    telas: [{ arquivo: "pc-quadro", alt: "Quadro do dia do banho e tosa: os pets nas colunas Esperando, No banho, Secando / tosa, Pronto para buscar e Entregue, com o botão da próxima etapa em cada cartão" }],
  },
  {
    id: "creche", titulo: <>Creche que <em>fecha a conta do mês.</em></>,
    texto: "Cada mensalista tem um plano pelos dias da semana. A chamada é um toque quando o pet chega e outro quando sai.",
    itens: [
      "Falta fica anotada. A reposição não é cobrada e segue a regra que você escolher: até quando vale e se só conta falta avisada.",
      "Dia extra entra na cobrança do mês seguinte.",
      "As cobranças do mês saem juntas por tutor: quem tem dois pets recebe uma mensagem só.",
      "A mensagem de cobrança sai pronta para o seu WhatsApp: você só aperta enviar.",
    ],
    telas: [
      { arquivo: "pc-mensalistas", alt: "Mensalistas da creche: quantos pets vêm em cada dia da semana e o plano de cada um, com os dias, o vencimento e o valor" },
      { arquivo: "cel-chamada", alt: "Chamada do dia da creche no celular, com os botões Chegou, Faltou e Saiu em cada pet", celular: true },
    ],
  },
  {
    id: "hotel", titulo: <>Hotel com o preço certo, <em>até no link do cliente.</em></>,
    texto: "Diária por porte, por temporada e em feriado, com desconto para o segundo pet do mesmo tutor. O tutor pede a vaga pelo seu link e já vê uma estimativa calculada pelas mesmas regras.",
    itens: [
      "Reserva com sinal, recebido na hora ou a receber. No check-out, o sinal sai da conta.",
      "Se preferir, você esconde o valor no link.",
      "O link não recebe pagamento: o sinal é pago direto a você, e a confirmação sai pronta com a sua chave Pix.",
    ],
    telas: [
      { arquivo: "cel-hotel-precos", alt: "Opções do hotel no celular: diária por porte (pequeno, médio, grande e gigante) e temporada de férias com preço próprio", celular: true },
      { arquivo: "cel-link-hotel", alt: "Pedido de vaga no hotel pelo link do cliente, com as datas e a estimativa do valor conforme o porte", celular: true },
    ],
  },
  {
    id: "dinheiro", titulo: <>Dinheiro protegido <em>quando tem equipe.</em></>,
    texto: "Quem não cuida do dinheiro trabalha normalmente, sem ver valores. Se alguém mudar um preço, der desconto ou alterar um valor recebido, fica anotado quem fez, quando e de quanto para quanto.",
    itens: [
      "Trava de preço: se você ligar, quem só opera o caixa vende pelo preço da lista, com o desconto máximo que você definir.",
      "Atendimento concluído que ficou sem cobrar aparece numa lista para você conferir.",
      "Cada pessoa vê só a própria comissão. Quem entra na equipe usa um link de convite, que vale 7 dias e só uma vez.",
      "Toque duplo no botão não lança o mesmo valor duas vezes.",
    ],
    telas: [
      { arquivo: "pc-alteracoes", alt: "Alterações em valores: a recepcionista deu desconto numa venda, marcou um banho e tosa abaixo da lista e vendeu um produto fora do preço, com o dia e a hora de cada uma" },
      { arquivo: "cel-trava", alt: "Opções de cobrança no celular: só o dono e quem vê o financeiro mudam preço ou dão desconto, e o desconto máximo do caixa", celular: true },
    ],
  },
];

/** Dito com franqueza, perto das perguntas: o que o sistema ainda não faz. */
const NAO_FAZ: string[] = [
  "Não emite nota fiscal nem cupom fiscal. Para o contador, Relatórios e Financeiro saem em planilha.",
  "Não envia WhatsApp sozinho, nem o boletim. As mensagens saem prontas, uma por vez: você só aperta enviar.",
  "Não recebe pagamento pela internet, nem sinal nem mensalidade. O tutor paga a você, e você anota.",
  "Não se conecta à maquininha. Você escreve as taxas uma vez e o sistema faz a conta do que você recebe.",
  "Não avisa a hora do remédio. Ele guarda a ficha de cuidados e mostra a lista do dia.",
  "Não mostra no mapa onde está o carro do leva e traz. A rota abre no Google Maps, com até 10 endereços por vez.",
  "A cópia de segurança não volta para o sistema. Ela serve para guardar e consultar, e as fotos não entram.",
  "Não é para clínica veterinária: não tem prontuário, receita nem internação.",
  "Não tem aplicativo de loja para o tutor. O cliente usa o seu link.",
];

/** O que chegou por último, em cartões curtos (o resto está nas seções com tela). Os textos seguem o manual. */
const RECENTES: { icone: React.ComponentType; titulo: string; texto: string }[] = [
  { icone: Send, titulo: "Mandar mensagens em fila", texto: "Lembretes de amanhã, pet pronto, cobrança, vacina vencendo, pacote acabando e aniversários do pet e do tutor: uma por vez, você aperta enviar e passa para a próxima." },
  { icone: Megaphone, titulo: "Promoção nos dias fracos", texto: "Desconto no dia e no horário que você escolher. O link do cliente mostra o preço de antes e o preço com desconto." },
  { icone: FileText, titulo: "Orçamento pelo link", texto: "Monte o orçamento e mande no WhatsApp. O cliente abre sem senha, vê a sua logo e toca em Quero fechar. Aceitou? Vira venda com um toque." },
  { icone: Boxes, titulo: "Estoque mais completo", texto: "Lote e validade (sai primeiro o que vence antes), kits e combos, contagem pelo celular e etiquetas de preço com código de barras." },
  { icone: CalendarRange, titulo: "Resumo da semana", texto: "Na segunda-feira, a tela Hoje mostra quanto entrou, os atendimentos, as faltas e os pets novos, ao lado da semana anterior." },
  { icone: KeyRound, titulo: "Convite da equipe por link", texto: "Cada pessoa recebe um link só dela, que vale 7 dias e funciona uma vez. Venceu? Mande de novo e o anterior para de valer." },
  { icone: ShieldCheck, titulo: "Dados do tutor (LGPD)", texto: "O cliente pediu os dados dele ou para apagar? Baixe a planilha dele ou apague os dados na ficha. Cada pedido fica registrado." },
];

const INCLUI: [string, string][] = [
  ["Mozart, assistente por voz e texto", "Diga o que precisa, por áudio ou texto. Ele prepara e você confirma. Nos campos de observação também tem microfone. Vem em todos os planos."],
  ["Boletim do pet", "Fotos, recado, o que foi feito e o quadro de atenção à saúde numa página que o tutor abre pelo link, sem instalar nada."],
  ["Álbum do pet", "As fotos dos boletins e do antes e depois ficam na ficha do pet. Dá para mandar o álbum ao tutor."],
  ["Botão Avaliar no Google", "Se você quiser, ele aparece no fim do boletim, do álbum e do link de agendamento, para todos os clientes."],
  ["Trazer do caderno", "Foto do caderno, print ou PDF do sistema antigo: clientes, dívidas, agenda, preços e vacinas. Você confere tudo antes de salvar."],
  ["Começo guiado", "Você marca o que o seu negócio faz e qual é a área principal. O menu mostra só o que você usa."],
  ["Você liga só o que usa", "Sinal, multa, comissão por serviço, código de barras, diário: cada opção começa desligada. Quem não liga nada não vê nada a mais."],
  ["Agenda de banho e tosa", "Por dia e por semana, por profissional, com os horários livres à vista e vários serviços no mesmo horário. Dá para imprimir a do dia."],
  ["Horários que se repetem", "Marque o banho de toda semana ou quinzena de uma vez, até você cancelar. Almoço, folgas e feriados ficam bloqueados."],
  ["Link de agendamento", "O cliente pede horário de banho, dia de creche ou reserva de hotel. Você aceita ou recusa com um toque."],
  ["Sua marca no sistema", "Sua logo e as suas cores no link do cliente, nas telas e na agenda impressa."],
  ["Clientes e pets", "Porte, cuidados, alertas e o histórico de cada atendimento. Cadastro repetido? Dá para juntar as duas fichas."],
  ["Saúde do pet", "Vacinas, vermífugo e antipulgas com a data de vencer e aviso quando está chegando."],
  ["Quadro do dia e Entrada", "As etapas de cada pet, do Esperando ao Entregue, e o checklist de chegada com fotos e o aceite do tutor."],
  ["Fotos de antes e depois", "Guarde o resultado do banho e mande para o tutor."],
  ["Lembrete e aviso de pet pronto", "O sistema monta a mensagem e abre o seu WhatsApp. Você só envia."],
  ["Chamar de volta", "Quem não vem há 30, 45, 60 ou 90 dias e os aniversariantes do pet e do tutor, com a mensagem pronta. Você só envia."],
  ["Fidelidade do seu jeito", "Você define: a cada tantos atendimentos, um prêmio à sua escolha. O sistema faz a conta de cada tutor."],
  ["Pacotes", "Quantos banhos o cliente comprou, quantos usou e quando vence. O pacote acabando aparece com a mensagem para renovar."],
  ["Creche com mensalistas", "Plano pelos dias da semana, chamada do dia, dia extra, reposição e as cobranças do mês juntas por tutor."],
  ["Hotel", "Reserva com sinal, diária por porte, temporada e feriado, calendário de ocupação e check-out com taxas."],
  ["Cuidado com o tutor", "Diário do dia, quem pode buscar o pet, lista de espera e ocorrências. O diário sai pronto para você enviar."],
  ["Comanda e venda no balcão", "Serviço, produto e extra numa conta só, com baixa no estoque."],
  ["Comprovante no WhatsApp", "Recebeu a conta? O sistema monta o comprovante e abre o seu WhatsApp. Não é nota fiscal."],
  ["Caixa do dia", "Abertura, entradas, saídas e fechamento conferido com a gaveta, com planilha para baixar."],
  ["Paga depois e em partes", "Anote quem ficou devendo, receba só uma parte e, se quiser, cobre multa e juros da conta atrasada."],
  ["Financeiro e contas fixas", "Contas a pagar e a receber, contas fixas que entram sozinhas, quanto custa manter o pet shop, o resultado do mês e a meta."],
  ["Quanto sobrou e Indicadores", "O que sobrou de cada serviço, produto e pessoa, e os gráficos do negócio mês a mês, ao lado do período anterior."],
  ["Estoque e loja", "Entradas, saídas, lote e validade, kits, contagem, etiquetas, código de barras, fornecedores, margem e custo médio."],
  ["Equipe com acesso por área", "Você escolhe o que cada pessoa abre e manda o convite por link. Quem não cuida do dinheiro não vê valores."],
  ["Comissão", "Por pessoa, por serviço e sobre produtos. Cada um vê a própria no cartão Minha comissão."],
  ["Quem mudou o quê", "Alguém alterou ou apagou um valor recebido, ou vendeu fora do preço da lista? Fica anotado quem foi, quando e de quanto para quanto."],
  ["Preço travado no caixa", "Se quiser, só você e quem vê o financeiro mudam preço ou dão desconto. O caixa dá, no máximo, o desconto que você definir."],
  ["Relatórios", "Atendimentos, faltas, serviços mais feitos, faturamento, comissão, creche, hotel e vendas por produto, ao lado do período anterior."],
  ["Leva e traz", "A lista do dia de quem buscar e levar, com o endereço, a rota no Google Maps e o aviso Estou chegando."],
  ["Clientes da sua planilha", "Traga clientes, pets e produtos de uma planilha. Na de clientes, você confere o que é cada coluna e, se trouxe a planilha errada, desfaz."],
  ["Manual dentro do sistema", "Mais de 200 tópicos de passo a passo, com busca e para imprimir. E o botão “Como usar esta tela” no alto das telas."],
  ["Seus dados e os do tutor", "Baixe tudo em planilhas quando quiser, e baixe ou apague os dados de um tutor que pedir (LGPD). A cópia é para guardar: não volta para o sistema."],
];

type Pergunta = [string, React.ReactNode];

/** Perguntas em quatro blocos. Todas ficam no HTML (o `<details>` fechado também é lido pelo Google). */
const perguntas = (atrasoDias: number): { titulo: string; itens: Pergunta[] }[] => [
  { titulo: "Preço e pagamento", itens: [
    ["Quanto custa?", `O plano Solo custa ${DESDE} por mês, para 1 pessoa com login. O Equipe, para até 3 pessoas, custa ${brlCurto(PLANOS[1].preco)}, e o Pet shop, para até 6, ${brlCurto(PLANOS[2].preco)}. Todos têm as mesmas funções. Pagando 3 ou 6 meses de uma vez, sai mais barato. Antes, são 7 dias grátis, sem cartão.`],
    ["Qual plano eu escolho?", `Conte só quem vai entrar no sistema com login. Atende sozinho, ou tem uma ajudante que só dá banho e não mexe no sistema? O Solo, de ${DESDE} por mês, basta: quem só aparece na agenda não conta. Se a recepção, o sócio ou um banhista vão lançar no sistema, é o Equipe (até 3 pessoas) ou o Pet shop (até 6). Na dúvida, comece pelo menor: os dados continuam os mesmos se você mudar depois.`],
    ["Como eu pago?", "Pela Cakto, a empresa que cuida da cobrança para nós. As formas de pagamento aparecem na tela da Cakto, na hora de pagar. A assinatura se renova sozinha ao fim de cada período até você cancelar. Use na página de pagamento o mesmo e-mail da sua conta."],
    ["Se eu assinar e não gostar, devolvem o dinheiro?", <>Sim, no começo. Se você pedir o cancelamento em até {DIAS_DE_ARREPENDIMENTO} dias depois do primeiro pagamento, devolvemos o valor inteiro desse pagamento, mesmo no plano de 3 ou 6 meses. A devolução é feita pela Cakto, pelo mesmo meio de pagamento. Depois desse prazo, você pode cancelar quando quiser e usa até o fim do período já pago. Está nos <Link href="/gestao/termos#cancelar">Termos de uso, parte 7</Link>.</>],
    ["Tem desconto ou cupom?", "O preço é o da tabela, e pagar 3 ou 6 meses de uma vez já sai mais barato. Às vezes a nossa equipe de atendimento oferece um cupom na conversa pelo WhatsApp. Todo cupom tem data de validade e vale o que estiver escrito nele. Ele é digitado na tela Assinatura, em Tenho um cupom, ou na página de pagamento. O site e a Nina não dão cupom."],
    ["Tem contrato de fidelidade?", "Não. A cobrança da assinatura é feita pela Cakto, a empresa que cuida dos pagamentos para nós. No plano mensal a cobrança é todo mês. Nos planos de 3 e 6 meses você paga o período de uma vez, por um valor menor. Em qualquer um, você cancela quando quiser e usa até o fim do período já pago."],
    ["O que acontece quando os 7 dias acabam?", "A conta fica só para consulta e os dados continuam guardados: dá para ver e baixar tudo. Para voltar a usar, é só assinar, na tela Assinatura. Nada é cobrado sozinho, porque o teste não pede cartão. Se a conta ficar mais de 180 dias só para consulta, ela pode ser apagada, sempre com aviso por e-mail e na tela pelo menos 30 dias antes."],
    ["Se eu assinar antes de o teste acabar, perco os dias grátis?", "A assinatura começa a contar no dia em que você paga. Se preferir, use os 7 dias até o fim e assine no último dia: os seus dados continuam lá."],
    ["E se o pagamento da assinatura atrasar?", `A conta continua funcionando por ${atrasoDias} dias depois da cobrança que não passou, com um aviso na tela dizendo até que dia. Se o pagamento não entrar nesse prazo, a conta fica só para consulta: os dados continuam guardados e tudo volta a funcionar quando o pagamento entrar.`],
    ["Posso trocar de plano depois?", "Pode. Hoje a troca é feita cancelando o plano atual e assinando o novo; os dados continuam os mesmos. O plano novo conta a partir do pagamento dele, e os meses que sobraram de um plano de 3 ou 6 meses não viram crédito: se puder, troque perto do fim do período pago."],
    ["O Mozart custa à parte?", "Não. Ele vem em todos os planos, inclusive no Solo. Existe um limite de pedidos por dia, igual em todos os planos. Se ele for atingido, o Mozart volta no dia seguinte e as telas continuam funcionando normalmente."],
  ] },
  { titulo: "Começar", itens: [
    ["Precisa instalar alguma coisa?", "Não. O sistema abre no navegador. Se quiser, você coloca na tela inicial do celular e ele fica como um aplicativo."],
    ["Funciona no celular?", "Sim. Ele foi feito primeiro para o celular. No computador funciona igual, com a tela maior."],
    ["Preciso configurar muita coisa para começar?", "Não. Ao criar a conta, você marca o que o seu negócio faz (banho e tosa, creche, hotel, venda de produtos, pacotes) e qual é a área principal. O menu e a tela inicial se arrumam para ela. Em seguida, um guia curto acerta o horário, a equipe, os preços e o link do cliente. Cada passo pode ficar para depois, e tudo pode ser mudado mais tarde."],
    ["Tenho tudo num caderno. Preciso digitar de novo?", "Não precisa digitar um por um. Em Clientes e pets, toque em Foto do caderno, fotografe a página e o sistema lê: clientes e pets, quem te deve, agenda e tabela de preços. Tudo aparece numa tela para você conferir e corrigir. Nada entra antes de você tocar em Salvar, e o que não deu para ler fica em branco. Há um limite de 30 páginas por dia."],
    ["Estou em outro sistema. Consigo trazer meus clientes?", "Sim. Se o sistema antigo gera PDF ou você tira print da lista, mande em Foto do caderno: o sistema lê e você confere antes de salvar. Também dá para trazer clientes, pets e produtos de uma planilha, colando as células ou enviando o arquivo. Na planilha de clientes, o sistema mostra o que entendeu de cada coluna e você corrige antes de trazer. O que já está no sistema não é apagado. Trouxe a planilha errada? Dá para desfazer a importação."],
    ["Atendo sozinho, só banho e tosa. Não é coisa demais para mim?", "Não. Ao criar a conta você marca só banho e tosa, e o menu não mostra creche, hotel nem estoque. Se um dia você precisar, é só ligar em Meu pet shop."],
    ["Posso colocar a minha equipe?", "Sim. Cada pessoa entra com o próprio acesso, e você escolhe o que ela abre: agenda, clientes, creche e hotel, pacotes, estoque, caixa, financeiro, relatórios. Quem não cuida do dinheiro não vê valores. Dá para ter mais de um dono. O número de pessoas com login depende do plano: 1, 3 ou 6. Banhista ou tosador que só aparece na agenda, sem entrar no sistema, não conta. Para entrar, a pessoa recebe um link de convite, que vale 7 dias e funciona uma vez."],
    ["Tem manual?", "Sim, dentro do sistema. São mais de 200 tópicos com o passo a passo de cada tarefa, com busca e opção de imprimir. No alto das telas, o botão “Como usar esta tela” abre a explicação daquela tela. Se ainda ficar dúvida, o suporte atende pelo WhatsApp."],
  ] },
  { titulo: "O que o sistema faz", itens: [
    ["O que vocês têm de diferente?", `Dizemos o que fazemos, sem comparar com ninguém. Todas as funções estão em todos os planos, desde ${DESDE}: banho e tosa, creche, hotel e loja no mesmo sistema. O boletim do pet leva as fotos ao tutor pelo link, sem ele instalar nada. A foto do caderno ou o PDF do sistema antigo viram cadastro, e você confere antes de salvar. No Financeiro, você vê quanto custa manter o pet shop e quanto já entrou no mês. A creche tem plano por dia da semana e as cobranças do mês juntas por tutor. O hotel calcula a diária por porte, temporada e feriado. Quem tem equipe conta com trava de preço, valores escondidos de quem não cuida do dinheiro e o histórico de quem mudou um valor. E o Mozart, assistente por voz e texto, vem em todos os planos, sem pagar à parte. O que o sistema não faz está nesta página, logo depois dos preços.`],
    ["Consigo saber quanto preciso faturar no mês?", "Para as contas fixas, sim. Em Financeiro, na aba Contas fixas, você cadastra aluguel, luz, salários e o que mais se repete. O quadro Quanto custa manter o pet shop mostra quanto elas somam por mês, quanto você precisa faturar para pagá-las e quanto já entrou neste mês. Produtos, comissões e outras despesas vêm por cima: o quadro não conta essas."],
    ["O que é o boletim do pet?", "É uma página com as fotos do atendimento, o recado da equipe, o que foi feito e, se você viu algo na saúde, um quadro “Para você ficar de olho”. Você monta em poucos toques (o Mozart pode escrever o recado), e a mensagem com o link sai pronta para o seu WhatsApp. O tutor abre no celular, sem instalar nada. O valor só aparece se você ligar. O link vale 60 dias e as fotos ficam no álbum do pet."],
    ["Dá para falar em vez de digitar?", "Dá. No Mozart, toque no microfone e fale o pedido; o texto aparece na caixa e você corrige se precisar. Nos campos de observação também tem um microfone pequeno. Usa o ditado do próprio navegador (Chrome, Edge, Safari)."],
    ["Serve para creche ou escolinha?", "Sim. Cada mensalista tem um plano pelos dias da semana. Todo dia você faz a chamada com um toque. Dia extra entra na cobrança do mês seguinte, e as cobranças saem juntas por tutor. Se quiser, você liga a taxa de busca fora do horário, o diário do dia para o tutor, a lista de quem pode buscar o pet e a lista de espera."],
    ["Serve para hotel de pets?", "Sim. Tem reserva com sinal, diária por porte, por temporada e em feriado, desconto para o segundo pet, calendário de ocupação com aviso de casa cheia, folha do dia para imprimir, ficha de cuidados com comida e remédio e check-out com taxas. O sistema guarda a ficha de cuidados e mostra a lista do dia, mas não avisa a hora do remédio."],
    ["Tenho só loja. Serve?", "Serve para controlar o estoque com lote e validade, montar kits, fazer a contagem pelo celular, imprimir etiquetas de preço, vender no balcão com leitor de código de barras, mandar orçamento pelo link, guardar fornecedores, ver a margem de cada produto e anotar o fiado. O sistema não emite nota fiscal nem cupom fiscal."],
    ["Dá para ver quanto a maquininha fica?", "Dá. Em Meu pet shop, você escreve as taxas do débito, do crédito à vista, do parcelado e do Pix. Na hora de receber no cartão, aparece quanto você recebe. Em Financeiro e Relatórios, você vê quanto ficou com a maquininha e o que ainda vai cair na conta, dia a dia. O preço do cliente não muda, e o sistema não se conecta à maquininha."],
    ["O assistente faz as coisas sozinho?", "Não. O Mozart entende o pedido, mostra o que vai fazer e espera o seu “confirmar”. Nada entra na agenda, no caixa ou no estoque sem você ver."],
    ["Quem é a Nina e quem é o Mozart?", "A Nina responde dúvidas aqui no site, antes de você criar a conta. O Mozart trabalha dentro do sistema: marca horário, faz check-in, dá entrada no estoque e responde sobre o seu caixa. Os dois são assistentes de inteligência artificial."],
    ["O sistema manda mensagem no WhatsApp sozinho?", "Não. As mensagens do WhatsApp saem prontas: lembrete, aviso de pet pronto, confirmação, cobrança, diário. Você toca no botão, o seu WhatsApp abre com o texto escrito e você só aperta enviar. A mensagem sai do seu número. Em Mandar mensagens, elas vêm uma depois da outra, para você passar por todas de uma vez."],
    ["Como o meu cliente agenda pelo link?", "Você manda o link pelo WhatsApp ou deixa no Instagram. O cliente escolhe banho, creche ou hotel, o dia e a hora, e você recebe o pedido para aceitar ou recusar. No hotel, ele já vê uma estimativa do valor. Ele não vê a sua agenda nem os dados de outros clientes, só os horários que estão livres."],
    ["O cliente paga pelo link?", "Não. Pelo link o cliente só pede. O sistema não recebe pagamento pela internet: o tutor paga direto para você, e você anota no sistema. Se você usa sinal na reserva, o link avisa que o sinal vai ser pedido e a mensagem de confirmação leva o valor e a sua chave Pix."],
    ["O cliente pode cancelar pelo link?", "Só se você deixar. É uma opção: você liga e escolhe até quantas horas antes ele pode cancelar ou pedir outra data. Você fica sabendo na tela inicial e na agenda."],
    ["O que o cliente vê tem a minha marca?", "Sim. Você coloca a sua logo e escolhe as suas cores. Elas aparecem no link de agendamento, nas telas do sistema e na agenda impressa."],
    ["Emite nota fiscal?", "Não. Hoje o sistema não emite nota fiscal. O comprovante que ele monta para você mandar pelo WhatsApp não é documento fiscal."],
    ["Serve para clínica veterinária?", "O sistema é feito para banho e tosa, creche, hotel e loja de pet shop. Ele não tem prontuário, receituário nem internação. Uma clínica que também faz banho e tosa pode usá-lo para essa parte."],
  ] },
  { titulo: "Seus dados", itens: [
    ["E os dados dos meus clientes?", <>Os dados são do seu negócio. Se um tutor pedir, você baixa os dados dele numa planilha ou apaga os dados dele, como pede a LGPD, e o pedido fica registrado. Você também baixa tudo quando quiser. Para encerrar a conta, a exclusão acontece em 30 dias e, até lá, dá para voltar atrás. Os detalhes estão na <Link href="/gestao/privacidade">política de privacidade</Link>.</>],
    ["Meus dados ficam presos no sistema?", "Não. Clientes, caixa, financeiro e relatórios saem em planilha. Em Meu pet shop, você também baixa uma cópia de segurança com tudo em planilhas, que abrem no Excel e no Google Planilhas. Essa cópia é para guardar e consultar: ainda não dá para trazê-la de volta para o sistema automaticamente, e as fotos não entram."],
    ["Vocês têm depoimentos ou número de clientes para mostrar?", "Não publicamos número de clientes nem depoimentos. Preferimos que você confira com os seus dados: são 7 dias grátis, sem cartão, a lista do que o sistema não faz está nesta página, e os seus dados saem em planilha quando você quiser."],
  ] },
];

function Tela({ arquivo, alt, celular, prioridade }: TelaVenda & { prioridade?: boolean }) {
  return (
    <span className={celular ? "gp-fone" : "gp-tela"}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/gestao/telas/${arquivo}.webp`} alt={alt} width={celular ? 780 : 1760} height={celular ? 1328 : 1093}        loading={prioridade ? "eager" : "lazy"} fetchPriority={prioridade ? "high" : undefined} decoding="async" />
    </span>
  );
}

/** Texto puro de uma resposta (as que têm link dentro ficam de fora dos dados estruturados). */
const soTexto = (r: React.ReactNode) => (typeof r === "string" ? r : null);

/** Dados estruturados para o Google: o produto com os preços de tabela (vindos de planos.ts) e as perguntas. Nada de nota ou avaliação. */
function DadosParaOGoogle({ grupos }: { grupos: { itens: Pergunta[] }[] }) {
  const ofertas = PLANOS.flatMap((p) => PERIODOS.map((pe) => {
    const o = ofertaDe(p.id, pe.id);
    return { "@type": "Offer", name: `${p.nome} · ${pe.nome}`, price: o.preco.toFixed(2), priceCurrency: "BRL", description: `${p.acessos === 1 ? "1 pessoa com login" : `Até ${p.acessos} pessoas com login`}, ${pe.cobranca}` };
  }));
  const dados = [
    { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Maestro Pet Gestão", applicationCategory: "BusinessApplication", operatingSystem: "Web", inLanguage: "pt-BR", description: DESCRICAO, offers: ofertas },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: grupos.flatMap((g) => g.itens).flatMap(([p, r]) => { const texto = soTexto(r); return texto ? [{ "@type": "Question", name: p, acceptedAnswer: { "@type": "Answer", text: texto } }] : []; }) },
  ];
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(dados).replace(/</g, "\\u003c") }} />;
}

export default async function Pagina() {
  // quem vende e o prazo da assinatura atrasada vêm do banco (painel do administrador); sem resposta, a página segue igual
  const venda = await lerVendaPublica();
  const atrasoDias = venda.atrasoDias ?? DIAS_DE_ATRASO_PADRAO;
  const grupos = perguntas(atrasoDias);
  return (
    <div className="gp">
      <GuardarOrigem />
      <DadosParaOGoogle grupos={grupos} />
      <section className="gp-capa">
        <header className="gp-topo gp-c">
          <Link href="/gestao" className="gp-logo" aria-label="Maestro Pet Gestão">
            <Marca tamanho={36} />
            <span>Maestro Pet <em>Gestão</em></span>
          </Link>
          <nav aria-label="Página">
            <a href="#diferencas" className="gp-link so-pc">O que muda</a>
            <a href="#nao-faz" className="gp-link so-pc">O que não faz</a>
            <a href="#para-quem" className="gp-link so-pc">Para quem é</a>
            <a href="#funcoes" className="gp-link so-pc">Funções</a>
            <a href="#plano" className="gp-link gp-link-precos">Preços</a>
            <a href="#perguntas" className="gp-link so-pc">Perguntas</a>
            <a href="/gestao/entrar" className="gp-btn contorno">Entrar</a>
            <a href={CRIAR} className="gp-btn verde">Teste grátis</a>
          </nav>
        </header>

        <div className="gp-c gp-capa-grade">
          <div className="gp-capa-texto">
            <h1>O seu pet shop organizado, <em>do banho ao caixa.</em></h1>
            <p>Agenda, clientes, creche, hotel, loja e dinheiro num sistema só, no celular e no computador. Fale “banho da Mel sexta às 10” e o Mozart deixa pronto para você confirmar.</p>
            <ul className="gp-selos">
              <li><Check />Todas as funções em todos os planos, desde {DESDE}, com o Mozart incluído</li>
              <li><Check />Boletim do pet com fotos e link de agendamento, sem o tutor instalar nada</li>
              <li><Check />Quanto custa manter o pet shop e quanto já entrou no mês</li>
            </ul>
            <a href="#plano" className="gp-preco-curto">Planos desde <b>{DESDE} por mês</b>, com tudo incluído. Ver os preços</a>
            <div className="gp-acao">
              <a href={CRIAR} className="gp-btn pri grande">Teste grátis por 7 dias <ArrowRight /></a>
              <span>Sem cartão. Nada é cobrado no fim do teste.</span>
            </div>
            <a href="#instalar" className="gp-baixar"><Smartphone /><Monitor />Instale direto pelo site, no celular e no computador</a>
          </div>
          <div className="gp-capa-telas">
            <Tela arquivo="pc-hoje" alt="Tela inicial do Maestro Pet Gestão no computador: a chamada da creche, as mensagens para mandar, o Mozart e o Tico, um dachshund, na mesa agora" prioridade />
            <Tela arquivo="cel-agenda" alt="Agenda do dia no celular, com os horários de cada pet" celular prioridade />
          </div>
        </div>
      </section>

      <NovidadesVenda parte="boletim" />

      <section className="gp-planos" id="plano">
        <div className="gp-c">
          <h2>Planos <em>e preços</em></h2>
          <p className="gp-lead">Todos os planos têm todas as funções e o Mozart. Você escolhe só duas coisas: quantas pessoas entram no sistema, cada uma com o próprio login, e de quanto em quanto tempo quer pagar. Creche, hotel e loja usam qualquer plano.</p>
          <PlanosVenda criar={CRIAR} />
          <ul className="gp-planos-regras" data-teste="regras-dos-planos">
            <li><Check />{TEXTOS_ASSINAR.nadaCobrado} Durante o teste, até 6 pessoas podem entrar.</li>
            <li><Check />{TEXTOS_ASSINAR.semFidelidade}</li>
            <li><Check />{TEXTOS_ASSINAR.arrependimento}</li>
            <li><Check />{TEXTOS_ASSINAR.pagamento}</li>
            <li><Check />{TEXTOS_ASSINAR.cupom}</li>
            <li><Check />{TEXTOS_ASSINAR.semLogin} Atende com uma ajudante que só dá banho e não mexe no sistema? O Solo basta.</li>
          </ul>
        </div>
      </section>

      <section className="gp-nao-faz gp-c" id="nao-faz" aria-labelledby="nao-faz-titulo">
        <h2 id="nao-faz-titulo">O que o sistema <em>não faz.</em></h2>
        <div>
          <p className="gp-lead">Melhor saber antes de começar.</p>
          <ul>{NAO_FAZ.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
      </section>

      <section className="gp-dif-sec" id="diferencas">
        <div className="gp-c">
          <h2>O que muda <em>no seu dia a dia.</em></h2>
          <p className="gp-lead">Seis coisas que o sistema faz por você, cada uma com a tela de verdade. A sétima é o Mozart. As telas mostram dados de demonstração.</p>
          <ol className="gp-dif">
            {DIFERENCAS.map((d, i) => (
              <li key={d.id} id={`dif-${d.id}`} className={`gp-dif-item${i % 2 ? " inverte" : ""}`}>
                <div className="gp-dif-texto">
                  <span className="gp-dif-num" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
                  <h3>{d.titulo}</h3>
                  <p>{d.texto}</p>
                  <ul>{d.itens.map((t) => <li key={t}><Check />{t}</li>)}</ul>
                </div>
                <div className={`gp-dif-telas${d.telas.every((t) => t.celular) ? " dois-fones" : d.telas.length > 1 ? " com-fone" : ""}`}>
                  {d.telas.map((t) => <Tela key={t.arquivo} {...t} />)}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="gp-pedir" id="mozart">
        <div className="gp-c gp-pedir-grade">
          <div>
            <p className="gp-ia"><Sparkles />07 · Mozart, assistente de inteligência artificial</p>
            <h2>Mozart em todas as áreas, <em>em todos os planos.</em></h2>
            <p className="gp-lead">Toque no microfone ou escreva, do seu jeito. O Mozart ajuda na agenda, no check-in da creche e do hotel, no estoque, nas contas e nas perguntas sobre o caixa. A resposta aparece aos poucos, enquanto ele escreve. Vem em todos os planos, sem pagar à parte.</p>
            <ul className="gp-falas">
              {PEDIDOS.map(([fala, faz]) => (
                <li key={fala}><q>{fala.slice(1, -1)}</q><span>{faz}</span></li>
              ))}
            </ul>
            <p className="gp-nota"><Check />Antes de gravar, ele mostra o que vai fazer. Você confirma com um toque.</p>
            <p className="gp-nota"><Check />Nos campos de observação também tem microfone: você fala, confere e salva.</p>
          </div>
          <Tela arquivo="cel-assistente" alt="O assistente Mozart aberto no celular, com o microfone e exemplos de pedidos" celular />
        </div>
      </section>

      <NovidadesVenda parte="resto" />

      <section className="gp-areas-sec" id="para-quem">
        <div className="gp-c">
          <p className="gp-ia claro"><ToggleRight />Você liga só o que usa</p>
          <h2>Feito para o <em>seu tipo</em> de negócio.</h2>
          <p className="gp-lead">Na primeira vez, você marca o que faz e qual é a área principal. O menu e a tela inicial se arrumam para ela. O resto fica guardado, e dá para ligar depois.</p>
          <Areas />
        </div>
      </section>

      <section className="gp-mostra" id="funcoes">
        <div className="gp-c">
          <h2>Conheça o sistema <em>por dentro</em></h2>
          <Vitrine />
        </div>
      </section>

      <section className="gp-link-sec" id="link">
        <div className="gp-c gp-link-grade">
          <Tela arquivo="cel-link" alt="Página que o cliente abre pelo link, com o nome do negócio e as opções: creche, hotel, banho e banho e tosa" celular />
          <div>
            <p className="gp-ia claro"><CalendarCheck />Link de agendamento</p>
            <h2>O cliente pede sozinho. <em>Você só aceita.</em></h2>
            <p className="gp-lead">Mande o seu link pelo WhatsApp ou deixe no Instagram. Serve para horário de banho, dia de creche e reserva de hotel.</p>
            <ol className="gp-passos">
              <li><b>O cliente abre o link</b><span>Escolhe banho, creche ou hotel, o dia e a hora. No hotel, já vê uma estimativa do valor. Pode pedir para mais de um pet de uma vez.</span></li>
              <li><b>O pedido chega para você</b><span>Aparece na tela inicial e na agenda. Um toque para aceitar, outro para recusar. A confirmação sai pronta para você enviar pelo WhatsApp.</span></li>
              <li><b>Ele acompanha a resposta</b><span>Na página do pedido, o cliente vê se foi aceito. Se você deixar, ele cancela ou pede outra data por lá.</span></li>
            </ol>
            <p className="gp-nota"><Check />Ele só vê os horários livres. A sua agenda e os outros clientes não aparecem.</p>
            <p className="gp-nota"><Check />Se quiser, o cliente aceita as suas regras e declara as vacinas em dia antes de pedir.</p>
            <p className="gp-nota"><Check />Pelo link o cliente só pede. Nada é pago por lá.</p>
            <p className="gp-nota"><Palette />A página leva a sua logo e as suas cores.</p>
          </div>
        </div>
      </section>

      <section className="gp-recentes" id="novidades" aria-labelledby="novidades-titulo">
        <div className="gp-c">
          <p className="gp-ia claro"><Sparkles />Novidades</p>
          <h2 id="novidades-titulo">O que chegou <em>por último.</em></h2>
          <p className="gp-lead">Tudo isto já está em todos os planos, sem pagar a mais. O que é opção começa desligado: você liga se quiser.</p>
          <ul className="gp-recentes-lista">
            {RECENTES.map(({ icone: Icone, titulo, texto }) => <li key={titulo}><span className="gp-recentes-ico" aria-hidden><Icone /></span><b>{titulo}</b><span>{texto}</span></li>)}
          </ul>
        </div>
      </section>

      <section className="gp-inclui" id="todas-as-funcoes">
        <div className="gp-c">
          <div className="gp-inclui-cab">
            <h2>É simples. <em>E é completo.</em></h2>
            <a href={CRIAR} className="gp-btn pri">Teste grátis por 7 dias</a>
          </div>
          {/* a lista inteira fica no HTML (o Google lê); na tela, abre com um toque para a página não ficar comprida no celular */}
          <details className="gp-inclui-mais">
            <summary><span>Ver todas as funções ({INCLUI.length})</span><ChevronDown /></summary>
            <ul className="gp-grade">
              {INCLUI.map(([t, d]) => <li key={t}><Marca tamanho={26} /><b>{t}</b><span>{d}</span></li>)}
            </ul>
          </details>
        </div>
      </section>

      <section className="gp-faq gp-c" id="perguntas">
        <h2>Perguntas <em>frequentes</em></h2>
        <div>
          {grupos.map((g) => (
            <div key={g.titulo} className="gp-faq-grupo">
              <h3>{g.titulo}</h3>
              {g.itens.map(([p, r]) => <details key={p}><summary>{p}</summary><p>{r}</p></details>)}
            </div>
          ))}
          <a className="gp-btn zap" href={linkSuporte()} target="_blank" rel="noopener noreferrer"><MessageCircle />Tirar dúvida no WhatsApp</a>
        </div>
      </section>

      <section className="gp-baixe" id="instalar">
        <div className="gp-c gp-baixe-grade">
          <div className="gp-baixe-telas">
            <Tela arquivo="pc-agenda" alt="A agenda da semana aberta no computador" />
            <Tela arquivo="cel-hoje" alt="A tela inicial aberta no celular" celular />
          </div>
          <div>
            <h2>Instale direto <em>pelo site.</em></h2>
            <p className="gp-lead">Não precisa de loja de aplicativos. O sistema fica com ícone próprio na tela do celular e do computador.</p>
            <Instalar />
          </div>
        </div>
      </section>

      <ChatVendas />

      <footer className="gp-pe">
        <div className="gp-c gp-pe-grade">
          <div>
            <Marca tamanho={56} />
            <p className="gp-pe-frase">Comece a organizar o seu negócio <em>hoje.</em></p>
            <a href={CRIAR} className="gp-btn pri">Teste grátis por 7 dias <ArrowRight /></a>
          </div>
          <nav aria-label="Rodapé">
            <a href="/gestao/entrar">Entrar</a>
            <Link href="/gestao/termos">Termos de uso</Link>
            <Link href="/gestao/privacidade">Política de privacidade</Link>
            <a href={linkSuporte()} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            <Link href="/contato">Contato</Link>
            <Link href="/">Maestro Pet</Link>
          </nav>
        </div>
        {venda.vendedor && <p className="gp-c gp-pe-vendedor" data-teste="vendedor">{linhaDoVendedor(venda.vendedor)}</p>}
      </footer>
    </div>
  );
}
