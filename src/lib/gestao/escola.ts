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
  id: string; titulo: string; resumo: string; minutos: number; tema: "Preço" | "Agenda" | "Clientes" | "Dinheiro" | "Equipe";
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
    naPratica: { texto: "Na Agenda, o botão \"Lembretes de amanhã\" abre o WhatsApp de cada tutor com a mensagem pronta. As faltas de cada pet aparecem na ficha e em Relatórios.", rotulo: "Abrir a Agenda", href: "/gestao/app/agenda" },
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
];

export const aula = (id: string) => AULAS.find((a) => a.id === id) ?? null;
