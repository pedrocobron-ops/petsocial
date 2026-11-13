/**
 * O que o negócio faz. O dono escolhe ao criar o pet shop e pode mudar em Meu pet shop.
 * A escolha só mostra ou esconde telas, passos e dicas: nada é apagado, e a tela escondida continua abrindo pelo endereço.
 * `petshops.modulos` vazio (null) = usa tudo, como os pet shops criados antes desta pergunta.
 */
export const MODULOS = [
  { id: "banho_tosa", rotulo: "Banho e tosa", apoio: "Agenda de horários, serviços e preços por porte." },
  { id: "creche", rotulo: "Creche", apoio: "Pets que passam o dia: check-in, diária e vagas." },
  { id: "hotel", rotulo: "Hotel", apoio: "Hospedagem: reservas, noites e vagas." },
  { id: "loja", rotulo: "Venda de produtos", apoio: "Estoque, entradas e venda no caixa." },
  { id: "pacotes", rotulo: "Pacotes e planos", apoio: "Vender pacote e dar baixa a cada uso." },
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

/** Serviços que entram junto com o banho e tosa (os mesmos de quem cria o pet shop já com banho e tosa). Sem preço. */
export const SERVICOS_BANHO_TOSA = [
  { nome: "Banho", categoria: "banho", duracao_min: 60, cor: "#3b82a0", ordem: 1 },
  { nome: "Banho e tosa", categoria: "banho_tosa", duracao_min: 120, cor: "#f97316", ordem: 2 },
  { nome: "Tosa higiênica", categoria: "tosa", duracao_min: 45, cor: "#7c6fb0", ordem: 3 },
  { nome: "Hidratação", categoria: "outro", duracao_min: 30, cor: "#4d8f6b", ordem: 4 },
  { nome: "Corte de unhas", categoria: "outro", duracao_min: 15, cor: "#b0763f", ordem: 5 },
] as const;
