/**
 * O que o negócio faz. O dono escolhe ao criar o pet shop e pode mudar em Meu pet shop.
 * A escolha só mostra ou esconde telas, passos e dicas: nada é apagado, e a tela escondida continua abrindo pelo endereço.
 * `petshops.modulos` vazio (null) = usa tudo, como os pet shops criados antes desta pergunta.
 */
export const MODULOS = [
  { id: "banho_tosa", rotulo: "Banho e tosa", apoio: "Agenda de horários, serviços e preços por porte." },
  { id: "creche", rotulo: "Creche", apoio: "Pets que passam o dia: check-in, diária, vagas e plano mensal." },
  { id: "hotel", rotulo: "Hotel", apoio: "Hospedagem: reservas, noites e vagas." },
  { id: "loja", rotulo: "Venda de produtos", apoio: "Estoque, entradas e venda no caixa." },
  // o plano mensal da creche (mensalistas) já vem com a Creche: "Pacotes" é outra coisa (testador achou que fosse o plano mensal)
  { id: "pacotes", rotulo: "Pacotes e planos", apoio: "Vender um pacote de usos (ex.: 4 banhos, 10 diárias) e dar baixa a cada uso. O plano mensal da creche já vem com a Creche." },
] as const;

export type Modulo = (typeof MODULOS)[number]["id"];
type ComModulos = { modulos?: string[] | null; principal?: string | null };

const IDS = MODULOS.map((m) => m.id) as Modulo[];

/** Os módulos ligados (todos, quando nada foi escolhido). */
export function modulosDe(petshop: ComModulos): Modulo[] {
  const lista = Array.isArray(petshop.modulos) ? IDS.filter((m) => petshop.modulos!.includes(m)) : [];
  return lista.length ? lista : IDS;
}

export const usaModulo = (petshop: ComModulos, modulo: Modulo) => modulosDe(petshop).includes(modulo);
/** Creche ou hotel: as duas dividem a mesma tela. */
export const usaCasa = (petshop: ComModulos) => usaModulo(petshop, "creche") || usaModulo(petshop, "hotel");

/** Itens do menu que somem quando o pet shop não usa o módulo. A rota continua abrindo pelo endereço. */
export function rotaForaDoMenu(petshop: ComModulos, href: string): boolean {
  if (href.startsWith("/gestao/app/creche-hotel")) return !usaCasa(petshop);
  if (href.startsWith("/gestao/app/estoque")) return !usaModulo(petshop, "loja");
  if (href.startsWith("/gestao/app/pacotes")) return !usaModulo(petshop, "pacotes");
  return false;
}

/** Como a tela chama a casa: "Creche", "Hotel" ou "Creche e hotel". */
export function nomeDaCasa(petshop: ComModulos): string {
  const c = usaModulo(petshop, "creche"), h = usaModulo(petshop, "hotel");
  return c && !h ? "Creche" : h && !c ? "Hotel" : "Creche e hotel";
}

/**
 * O nome de uma categoria de lançamento na tela. "Creche e hotel" é o valor gravado (não muda); na tela vira o que a entrada é:
 * pela descrição ("Hotel: 2 diárias · Thor", "Sinal da reserva: hotel de Mel", "Creche: 1 diária · Bob") e, sem ela,
 * pelo que o pet shop faz ("Hotel" num hotel só, "Creche" numa creche só). Sem pet shop e sem descrição, o nome gravado.
 */
export function nomeDaCategoria(c: string, petshop?: ComModulos | null, descricao?: string | null): string {
  if (c === "Produtos e insumos") return "Produtos e material";
  if (c !== "Creche e hotel") return c;
  const d = (descricao ?? "").toLowerCase();
  const hotel = /(^|[^a-zà-ú])hotel([^a-zà-ú]|$)/.test(d), creche = /(^|[^a-zà-ú])creche([^a-zà-ú]|$)/.test(d);
  if (hotel !== creche) return hotel ? "Hotel" : "Creche";
  return petshop ? nomeDaCasa(petshop) : c;
}

/**
 * Área principal: a que aparece primeiro no menu e na tela inicial (`petshops.principal`).
 * Pacotes não entra: é um jeito de vender, não uma área. Vazio (null) = sem área principal, tudo na ordem de sempre.
 */
export const AREAS_PRINCIPAIS = ["banho_tosa", "creche", "hotel", "loja"] as const;
export type Principal = (typeof AREAS_PRINCIPAIS)[number];
/** Como o Mozart chama cada área numa frase ("Deixei a creche em primeiro lugar"). */
export const NOME_DA_AREA: Record<Principal, string> = { banho_tosa: "o banho e tosa", creche: "a creche", hotel: "o hotel", loja: "a loja" };

/** A tela de cada área principal no menu e o nome do botão laranja da tela inicial. */
export const TELA_DA_AREA: Record<Principal, { rotulo: string; menu: string; acao: string }> = {
  banho_tosa: { rotulo: "Banho e tosa", menu: "Agenda", acao: "Marcar horário" },
  creche: { rotulo: "Creche", menu: "Creche", acao: "Fazer check-in" },
  hotel: { rotulo: "Hotel", menu: "Hotel", acao: "Nova reserva" },
  loja: { rotulo: "Venda de produtos", menu: "Estoque", acao: "Vender" },
};

/** As áreas que podem ser a principal, entre as marcadas. */
export const areasParaPrincipal = (modulos: readonly string[]): Principal[] => AREAS_PRINCIPAIS.filter((a) => modulos.includes(a));
/** A principal que vale para uma escolha: a que a pessoa apontou, ou a única área marcada. Sem isso, nenhuma. */
export function principalPara(modulos: readonly string[], escolhida: string | null | undefined): Principal | null {
  const areas = areasParaPrincipal(modulos);
  return areas.find((a) => a === escolhida) ?? (areas.length === 1 ? areas[0] : null);
}
/** A área principal gravada no pet shop (null quando não há, ou quando ela saiu do que o pet shop usa). */
export function principalDe(petshop: ComModulos): Principal | null {
  const p = AREAS_PRINCIPAIS.find((a) => a === petshop.principal);
  return p && usaModulo(petshop, p) ? p : null;
}
/** Qual assunto vai na frente da tela inicial: a agenda, a casa (creche e hotel) ou a loja. */
export type Frente = "banho" | "casa" | "loja";
export function frenteDe(petshop: ComModulos): Frente | null {
  const p = principalDe(petshop);
  return p === "banho_tosa" ? "banho" : p === "creche" || p === "hotel" ? "casa" : p === "loja" ? "loja" : null;
}

/**
 * Artigo do nome do negócio: "a Creche Au Au", "o Pet Shop Bidu". Vai pela primeira palavra; sem pista, fica "o".
 * `artigoDe("Creche Au Au")` = { o: "a", no: "na", do: "da" }.
 */
const FEMININOS = new Set(["creche", "casa", "casinha", "escola", "escolinha", "clinica", "loja", "lojinha", "estetica", "hospedagem", "toca", "vila", "fazenda",
  "chacara", "estacao", "boutique", "academia", "pousada", "cia", "companhia", "turma", "turminha", "patota", "matilha", "familia", "central", "oficina",
  "barbearia", "veterinaria", "agropecuaria", "mansao", "morada", "republica", "ilha", "cabana", "granja"]);
export function artigoDe(nome: string | null | undefined): { o: "o" | "a"; no: "no" | "na"; do: "do" | "da" } {
  const primeira = ((nome ?? "").trim().split(/\s+/)[0] ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return FEMININOS.has(primeira) ? { o: "a", no: "na", do: "da" } : { o: "o", no: "no", do: "do" };
}

/** Serviços que entram junto com o banho e tosa (os mesmos de quem cria o pet shop já com banho e tosa). Sem preço. */
export const SERVICOS_BANHO_TOSA = [
  { nome: "Banho", categoria: "banho", duracao_min: 60, cor: "#3b82a0", ordem: 1 },
  { nome: "Banho e tosa", categoria: "banho_tosa", duracao_min: 120, cor: "#f97316", ordem: 2 },
  { nome: "Tosa higiênica", categoria: "tosa", duracao_min: 45, cor: "#7c6fb0", ordem: 3 },
  { nome: "Hidratação", categoria: "outro", duracao_min: 30, cor: "#4d8f6b", ordem: 4 },
  { nome: "Corte de unhas", categoria: "outro", duracao_min: 15, cor: "#b0763f", ordem: 5 },
] as const;

/**
 * A área de cada serviço vem de `servicos.categoria`: banho, tosa, banho_tosa e outro são do banho e tosa; creche, hotel e loja,
 * de cada uma. A diária da creche e do hotel não vem daqui (fica no pet shop): um serviço da creche ou do hotel é um a mais
 * (um pacote, um transporte). A categoria 'loja' entrou com a migração 20261179; antes dela, o serviço da loja vira 'outro'.
 */
export const AREAS_DE_SERVICO = [
  { id: "banho_tosa", rotulo: "Banho e tosa" },
  { id: "creche", rotulo: "Creche" },
  { id: "hotel", rotulo: "Hotel" },
  { id: "loja", rotulo: "Loja" },
] as const;
export type AreaDoServico = (typeof AREAS_DE_SERVICO)[number]["id"];
export const areaDoServico = (categoria: string | null | undefined): AreaDoServico =>
  categoria === "creche" || categoria === "hotel" || categoria === "loja" ? categoria : "banho_tosa";
/** A categoria que vai para o banco: a de antes, se a área não mudou; serviço novo do banho e tosa entra como "outro". */
export const categoriaDaArea = (area: AreaDoServico, antes?: string | null): string =>
  antes && areaDoServico(antes) === area ? antes : area === "banho_tosa" ? "outro" : area;
/** As áreas que o pet shop usa (mais a do serviço aberto, se ela saiu do que o pet shop usa). Sem nenhuma, banho e tosa. */
export function areasDeServicoPara(petshop: ComModulos, atual?: AreaDoServico | null): AreaDoServico[] {
  const l = AREAS_DE_SERVICO.map((a) => a.id).filter((a) => usaModulo(petshop, a) || a === atual);
  return l.length ? l : ["banho_tosa"];
}

/**
 * Onde cada opção de "O que o seu negócio faz?" aparece no menu, pela escolha da folha (`valor`): banho e tosa fica na
 * Agenda; creche e hotel dividem um item só ("Creche e hotel" com as duas; "Creche" ou "Hotel" com uma);
 * a venda de produtos fica em Estoque (e a venda, no Caixa).
 */
export function noMenu(m: Modulo, valor: readonly string[]): string {
  if (m === "banho_tosa") return "Agenda";
  if (m === "loja") return "Estoque e Caixa";
  if (m === "pacotes") return "Pacotes";
  const outra = m === "creche" ? "hotel" : "creche";
  return valor.includes(outra) ? `Creche e hotel (um item só, junto com ${outra === "hotel" ? "o hotel" : "a creche"})` : m === "creche" ? "Creche" : "Hotel";
}

/** O que cada área põe no menu, para a frase "Pronto: o menu agora mostra …". */
export function telasDoMenu(petshop: ComModulos): string[] {
  return [
    usaModulo(petshop, "banho_tosa") ? "Agenda" : null,
    usaCasa(petshop) ? nomeDaCasa(petshop) : null,
    usaModulo(petshop, "pacotes") ? "Pacotes" : null,
    usaModulo(petshop, "loja") ? "Estoque" : null,
  ].filter((x): x is string => x != null);
}

/** Creche e hotel: as duas áreas que o link do cliente pode receber pedido. */
export type AreaDoLink = "creche" | "hotel";
export const CAMPO_DO_LINK = { creche: "link_creche", hotel: "link_hotel" } as const;
/** "Quer que os tutores também peçam reserva de hotel pelo link?" */
export const PERGUNTA_DO_LINK: Record<AreaDoLink, string> = {
  creche: "Quer que os tutores também peçam vaga na creche pelo link?",
  hotel: "Quer que os tutores também peçam reserva de hotel pelo link?",
};

/**
 * Creche ou hotel que a escolha liga agora e que o link do cliente (ligado) ainda não recebe: a folha pergunta antes de
 * mudar o link. Nada muda no link sem a pessoa tocar em "Ligar no link".
 */
export function linkPergunta(petshop: { modulos?: string[] | null; link_ativo?: boolean | null; link_creche?: boolean | null; link_hotel?: boolean | null }, valor: readonly string[]): AreaDoLink[] {
  if (!petshop.link_ativo) return [];
  const salvo = modulosDe(petshop);
  return (["creche", "hotel"] as const).filter((m) => valor.includes(m) && !salvo.includes(m) && !petshop[CAMPO_DO_LINK[m]]);
}
