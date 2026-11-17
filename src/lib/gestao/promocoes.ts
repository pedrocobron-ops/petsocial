import { brl, brlCurto, dataCurta, deIsoDia, isoDia } from "./util";

/**
 * Promoção em dias fracos: "Terça e quarta, 10% no banho", "antes das 11h, R$ 10 off".
 *
 * O dono monta em Meu pet shop (tabela `promocoes`, gravada por `promocao_salvar`). O banco põe a promoção no horário na hora
 * de marcar (`agendamentos.promo`, uma cópia: mudar a promoção depois não mexe no que já foi marcado). O preço do horário
 * continua o da lista; a promoção é uma linha de desconto na conta, que a equipe pode tirar.
 * As contas daqui são as mesmas do banco (`promo_do_horario`, `promo_desconto`): a tela mostra antes de gravar.
 */

export type TipoPromo = "pct" | "reais";

/** Onde a promoção vale além do banho e tosa: a diária da creche e a do hotel. */
export type CasaPromo = "creche" | "hotel";

/**
 * A promoção como o dono monta. `servicos` vazio = todos os serviços do banho e tosa.
 * `banho_tosa` (padrão sim): vale nos horários da agenda. `casa`: vale também (ou só) na diária da creche e/ou do hotel
 * (a faixa de hora não vale para estadias). Sem os dois campos (dados antigos): só banho e tosa, como sempre.
 */
export type Promocao = {
  id: string; nome: string; dias: number[]; hora_de: string | null; hora_ate: string | null; servicos: string[];
  tipo: TipoPromo; valor: number; comeca_em: string | null; termina_em: string | null; ativa: boolean; criado_em?: string;
  banho_tosa?: boolean; casa?: CasaPromo[];
};

/** A cópia que fica no horário (e no pedido do link). `tirada`: a equipe tirou a promoção deste horário. */
export type PromoDoHorario = { id: string; nome: string; tipo: TipoPromo; valor: number; servicos: string[]; tirada?: boolean };

/** Colunas lidas da tabela. */
export const COLS_PROMOCAO = "id, nome, dias, hora_de, hora_ate, servicos, tipo, valor, comeca_em, termina_em, ativa, criado_em, banho_tosa, casa";

/** Vale no banho e tosa? (sem o campo: sim, como sempre) */
export const valeNoBanho = (p: Pick<Promocao, "banho_tosa">) => p.banho_tosa !== false;
/** Vale na diária da creche ou do hotel? */
export const valeNaCasa = (p: Pick<Promocao, "casa">, tipo: string) => Boolean(p.casa?.includes(tipo as CasaPromo));

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
/** Ordem de mostrar os dias: de segunda a domingo. */
export const ORDEM_SEMANA = [1, 2, 3, 4, 5, 6, 0];

/** Áreas de serviço que entram no "todos os serviços" (banho e tosa: nem creche, nem hotel, nem loja). */
const DO_BANHO = new Set(["banho", "tosa", "banho_tosa", "outro"]);

const centavos = (n: number) => Math.round(n * 100) / 100;
const hhmm = (h: string | null | undefined) => (h ? String(h).slice(0, 5) : null);

/** "10% off" ou "R$ 10 off": a etiqueta do horário no link. */
export const etiquetaPromo = (p: Pick<PromoDoHorario, "tipo" | "valor">) => (p.tipo === "pct" ? `${Number(p.valor).toLocaleString("pt-BR")}% off` : `${brlCurto(p.valor)} off`);
/** "−10%" ou "−R$ 10,00": a linha da conta para quem não vê o valor em reais. */
export const descontoCurto = (p: Pick<PromoDoHorario, "tipo" | "valor">) => (p.tipo === "pct" ? `−${Number(p.valor).toLocaleString("pt-BR")}%` : `−${brl(p.valor)}`);
/** "Promoção Terça do banho −10%". */
export const linhaDaPromo = (p: Pick<PromoDoHorario, "nome" | "tipo" | "valor">) => `Promoção ${p.nome} ${descontoCurto(p)}`;

/** O serviço entra na promoção? Lista vazia = todos os do banho e tosa (pela categoria do serviço). */
export function servicoEntra(servicos: string[] | null | undefined, servicoId: string | null | undefined, categoriaDe: (id: string) => string | null | undefined) {
  if (!servicoId) return false;
  if (servicos && servicos.length) return servicos.includes(servicoId);
  return DO_BANHO.has(categoriaDe(servicoId) ?? "outro");
}

/** A promoção vale neste dia ("AAAA-MM-DD") e hora ("HH:MM")? Confere dias da semana, faixa de hora e começo e fim. */
export function valeNoHorario(p: Pick<Promocao, "dias" | "hora_de" | "hora_ate" | "comeca_em" | "termina_em">, dia: string, hora: string) {
  const dow = deIsoDia(dia).getDay();
  if (!p.dias.map(Number).includes(dow)) return false;
  const de = hhmm(p.hora_de), ate = hhmm(p.hora_ate);
  if (de && hora < de) return false;
  if (ate && hora >= ate) return false;
  if (p.comeca_em && dia < p.comeca_em) return false;
  if (p.termina_em && dia > p.termina_em) return false;
  return true;
}

/** Quanto a promoção tira de um preço (% arredonda no centavo; R$ até o preço). */
export function descontoNoPreco(p: Pick<PromoDoHorario, "tipo" | "valor">, preco: number) {
  if (!(preco > 0)) return 0;
  return p.tipo === "pct" ? centavos((preco * Number(p.valor)) / 100) : Math.min(Number(p.valor), preco);
}
/** O preço com a promoção ("de R$ 60 por R$ 54": 60 é o preço da lista do serviço para o porte). */
export const precoComPromo = (p: Pick<PromoDoHorario, "tipo" | "valor">, preco: number) => centavos(preco - descontoNoPreco(p, preco));

/**
 * A promoção que vale para um serviço num dia e hora (a mesma escolha do banco): ligada, criada antes de `criadoAte`,
 * no dia, na hora e no serviço. Mais de uma: a que dá mais desconto no preço (empate: a mais antiga).
 */
export function promoDoHorario<P extends Promocao>(promos: P[], o: {
  servicoId: string | null; dia: string; hora: string; preco?: number | null; categoriaDe: (id: string) => string | null | undefined; criadoAte?: string;
}): P | null {
  const base = o.preco ?? 100;
  const lista = promos.filter((p) => p.ativa && valeNoBanho(p) && (!o.criadoAte || !p.criado_em || p.criado_em <= o.criadoAte) && valeNoHorario(p, o.dia, o.hora) && servicoEntra(p.servicos, o.servicoId, o.categoriaDe));
  lista.sort((a, b) => descontoNoPreco(b, base) - descontoNoPreco(a, base) || String(a.criado_em ?? "").localeCompare(String(b.criado_em ?? "")));
  return lista[0] ?? null;
}

/** Uma linha da conta: serviço (sem `servicoId` = o serviço principal do horário), produto ou extra. */
type LinhaConta = { tipo: string; valor: number | null; qtd: number; servicoId?: string };
/**
 * Quanto a promoção do horário tira da conta: soma as linhas de serviço que entram na promoção; % = soma × %, R$ = o valor
 * (até a soma). A mesma conta do banco (`promo_desconto`), que confere ao lançar.
 */
export function descontoDaPromo(p: PromoDoHorario | null | undefined, itens: LinhaConta[], principalId: string | null | undefined, categoriaDe: (id: string) => string | null | undefined) {
  if (!p || p.tirada) return 0;
  const base = centavos(itens.filter((i) => i.tipo === "servico" && servicoEntra(p.servicos, i.servicoId ?? principalId, categoriaDe))
    .reduce((t, i) => t + centavos(i.qtd * (i.valor ?? 0)), 0));
  return descontoNoPreco(p, base);
}

/** "terça e quarta", "segunda a sexta", "todos os dias". */
export function diasPorExtenso(dias: number[]) {
  const l = ORDEM_SEMANA.filter((d) => dias.map(Number).includes(d));
  if (l.length === 7) return "todos os dias";
  if (l.length === 5 && [1, 2, 3, 4, 5].every((d) => l.includes(d))) return "de segunda a sexta";
  if (l.length === 2 && l.includes(6) && l.includes(0)) return "sábado e domingo";
  const nomes = l.map((d) => DIAS[d]);
  return nomes.length <= 1 ? nomes[0] ?? "" : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}
/** "ter, qua", "seg a sex", "todos os dias". */
export function diasCurtos(dias: number[]) {
  const l = ORDEM_SEMANA.filter((d) => dias.map(Number).includes(d));
  if (l.length === 7) return "todos os dias";
  if (l.length === 5 && [1, 2, 3, 4, 5].every((d) => l.includes(d))) return "seg a sex";
  return l.map((d) => DIAS_CURTOS[d]).join(", ");
}

/** "antes das 11h", "a partir das 14h", "das 8h às 11h", ou null (o dia todo). */
export function horasPorExtenso(p: Pick<Promocao, "hora_de" | "hora_ate">) {
  const h = (x: string) => { const [a, m] = x.split(":"); return m === "00" ? `${Number(a)}h` : `${Number(a)}h${m}`; };
  const de = hhmm(p.hora_de), ate = hhmm(p.hora_ate);
  if (de && ate) return `das ${h(de)} às ${h(ate)}`;
  if (ate) return `antes das ${h(ate)}`;
  if (de) return `a partir das ${h(de)}`;
  return null;
}

/** "10% de desconto" ou "R$ 10 de desconto". */
export const valorPorExtenso = (p: Pick<Promocao, "tipo" | "valor">) => (p.tipo === "pct" ? `${Number(p.valor).toLocaleString("pt-BR")}% de desconto` : `${brlCurto(p.valor)} de desconto`);

/** "banho" / "banho e tosa" / "banho e tosa" (todos). */
export function servicosPorExtenso(p: Pick<Promocao, "servicos">, nomeDe: (id: string) => string | null | undefined) {
  if (!p.servicos.length) return "banho e tosa";
  const n = p.servicos.map((id) => nomeDe(id)).filter((x): x is string => Boolean(x)).map((x) => x.toLowerCase());
  return n.length <= 1 ? n[0] ?? "serviços" : `${n.slice(0, -1).join(", ")} e ${n[n.length - 1]}`;
}

/** "em banho", "na diária da creche", "em banho e tosa e na diária do hotel". */
export function ondePorExtenso(p: Pick<Promocao, "servicos" | "banho_tosa" | "casa">, nomeDe: (id: string) => string | null | undefined) {
  const partes = [
    ...(valeNoBanho(p) ? [`em ${servicosPorExtenso(p, nomeDe)}`] : []),
    ...(valeNaCasa(p, "creche") ? ["na diária da creche"] : []),
    ...(valeNaCasa(p, "hotel") ? ["na diária do hotel"] : []),
  ];
  return partes.length <= 1 ? partes[0] ?? "" : `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
}

/** As horas só valem no banho e tosa: com creche ou hotel junto, o texto diz isso. */
function horasDoTexto(p: Promocao) {
  const horas = valeNoBanho(p) ? horasPorExtenso(p) : null;
  if (!horas) return null;
  return p.casa?.length ? `${horas} no banho e tosa` : horas;
}

/** "Terça e quarta, antes das 11h: 10% de desconto no banho." O resumo da promoção na lista do dono. */
export function resumoDaPromo(p: Promocao, nomeDe: (id: string) => string | null | undefined) {
  const dias = diasPorExtenso(p.dias);
  const horas = horasDoTexto(p);
  return `${dias.charAt(0).toUpperCase()}${dias.slice(1)}${horas ? `, ${horas}` : ""}: ${valorPorExtenso(p)} ${ondePorExtenso(p, nomeDe)}.`;
}

/** "de 01/12 a 20/12", "até 20/12", "a partir de 01/12" ou null. */
export function validadePorExtenso(p: Pick<Promocao, "comeca_em" | "termina_em">) {
  if (p.comeca_em && p.termina_em) return `de ${dataCurta(p.comeca_em)} a ${dataCurta(p.termina_em)}`;
  if (p.termina_em) return `até ${dataCurta(p.termina_em)}`;
  if (p.comeca_em) return `a partir de ${dataCurta(p.comeca_em)}`;
  return null;
}

/** Já acabou (passou do fim)? Ainda não começou? */
export function situacaoDaPromo(p: Promocao, hoje = isoDia(new Date())): "desligada" | "acabou" | "ainda-nao" | "valendo" {
  if (!p.ativa) return "desligada";
  if (p.termina_em && p.termina_em < hoje) return "acabou";
  if (p.comeca_em && p.comeca_em > hoje) return "ainda-nao";
  return "valendo";
}

/**
 * Texto para o dono copiar e mandar ou postar (nada é enviado sozinho). Só diz o que é verdade pela promoção montada:
 * dias, horas, serviço, desconto e, se tiver, até quando vale. Nada de "só hoje" nem "últimas vagas".
 */
export function textoDaPromocao(p: Promocao, loja: string, nomeDe: (id: string) => string | null | undefined) {
  const dias = diasPorExtenso(p.dias);
  const horas = horasDoTexto(p);
  const validade = validadePorExtenso(p);
  const pede = valeNoBanho(p) ? (p.casa?.length ? "Quer marcar um horário ou reservar uma vaga?" : "Quer marcar um horário?") : "Quer reservar uma vaga?";
  return `${loja}: ${dias}${horas ? `, ${horas},` : ""} tem ${valorPorExtenso(p)} ${ondePorExtenso(p, nomeDe)}.${validade ? ` Vale ${validade}.` : ""} ${pede} É só responder esta mensagem.`;
}

/** O que vem do banco (numeric chega como texto em alguns caminhos): números de verdade. */
export function lerPromocao(x: Record<string, unknown>): Promocao {
  return {
    id: String(x.id), nome: String(x.nome ?? ""), dias: Array.isArray(x.dias) ? (x.dias as unknown[]).map(Number) : [],
    hora_de: hhmm(x.hora_de as string | null), hora_ate: hhmm(x.hora_ate as string | null),
    servicos: Array.isArray(x.servicos) ? (x.servicos as unknown[]).map(String) : [], tipo: x.tipo === "reais" ? "reais" : "pct", valor: Number(x.valor ?? 0),
    comeca_em: (x.comeca_em as string | null) ?? null, termina_em: (x.termina_em as string | null) ?? null, ativa: x.ativa !== false,
    criado_em: (x.criado_em as string | undefined) ?? undefined,
    banho_tosa: x.banho_tosa !== false,
    casa: Array.isArray(x.casa) ? (x.casa as unknown[]).map(String).filter((c): c is CasaPromo => c === "creche" || c === "hotel") : [],
  };
}

/** A promoção do horário, como veio do banco (ou null). */
export function lerPromoDoHorario(x: unknown): PromoDoHorario | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!o.id || !o.nome) return null;
  return { id: String(o.id), nome: String(o.nome), tipo: o.tipo === "reais" ? "reais" : "pct", valor: Number(o.valor ?? 0),
    servicos: Array.isArray(o.servicos) ? (o.servicos as unknown[]).map(String) : [], tirada: o.tirada === true };
}

/* ---------- creche e hotel ---------- */

/**
 * A cópia que fica na estadia (`estadias.promo`, posta pelo banco ao marcar: `promo_da_estadia`). Guarda os dias da semana,
 * o começo e o fim: no check-out a promoção vale nas noites (hotel) ou no dia (creche) que caem neles.
 */
export type PromoDaEstadia = {
  id: string; nome: string; tipo: TipoPromo; valor: number; dias: number[]; comeca_em: string | null; termina_em: string | null;
  casa: CasaPromo; tirada?: boolean;
};

/** A promoção da estadia, como veio do banco (ou null). */
export function lerPromoDaEstadia(x: unknown): PromoDaEstadia | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!o.id || !o.nome) return null;
  return {
    id: String(o.id), nome: String(o.nome), tipo: o.tipo === "reais" ? "reais" : "pct", valor: Number(o.valor ?? 0),
    dias: Array.isArray(o.dias) ? (o.dias as unknown[]).map(Number) : [], comeca_em: (o.comeca_em as string | null) ?? null,
    termina_em: (o.termina_em as string | null) ?? null, casa: o.casa === "hotel" ? "hotel" : "creche", tirada: o.tirada === true,
  };
}

/** O dia ("AAAA-MM-DD") é um dia da promoção (dia da semana, começo e fim)? */
export function diaDaPromo(p: Pick<Promocao, "dias" | "comeca_em" | "termina_em">, dia: string) {
  if (!p.dias.map(Number).includes(deIsoDia(dia).getDay())) return false;
  if (p.comeca_em && dia < p.comeca_em) return false;
  if (p.termina_em && dia > p.termina_em) return false;
  return true;
}

const somaUmDia = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
/**
 * Os dias que contam para achar a promoção de uma estadia (a mesma regra do banco, `promo_da_estadia`): as noites da entrada
 * até a véspera da saída; sem saída, a noite da entrada e as 6 seguintes (hotel) ou só o dia da entrada (creche). Até 60.
 */
export function diasDaEstadiaParaPromo(tipo: string, entrada: string, saida: string | null) {
  const fim = saida && saida > entrada ? isoDia(somaUmDia(deIsoDia(saida), -1)) : tipo === "hotel" && !saida ? isoDia(somaUmDia(deIsoDia(entrada), 6)) : entrada;
  const out: string[] = [];
  for (let d = deIsoDia(entrada); out.length < 60 && isoDia(d) <= fim; d = somaUmDia(d, 1)) out.push(isoDia(d));
  return out;
}

/**
 * A promoção que vale para uma estadia (a mesma escolha do banco): ligada, criada antes de `criadoAte`, para o tipo, com pelo
 * menos um dia da estadia num dia dela. Mais de uma: a que dá mais desconto pela diária (empate: a mais antiga).
 * `entrada` e `saida`: dias "AAAA-MM-DD" (saída opcional).
 */
export function promoDaEstadia<P extends Promocao>(promos: P[], o: { tipo: string; entrada: string; saida?: string | null; diaria?: number | null; criadoAte?: string }): P | null {
  const dias = diasDaEstadiaParaPromo(o.tipo, o.entrada, o.saida ?? null);
  const base = o.diaria ?? 100;
  const conta = (p: P) => dias.filter((d) => diaDaPromo(p, d)).length * descontoNoPreco(p, base);
  const lista = promos.filter((p) => p.ativa && valeNaCasa(p, o.tipo) && (!o.criadoAte || !p.criado_em || p.criado_em <= o.criadoAte) && dias.some((d) => diaDaPromo(p, d)));
  lista.sort((a, b) => conta(b) - conta(a) || String(a.criado_em ?? "").localeCompare(String(b.criado_em ?? "")));
  return lista[0] ?? null;
}

/**
 * Quanto a promoção tira das diárias de uma estadia: só as noites (hotel) ou os dias (creche) que caem nos dias dela.
 * % = soma dessas diárias × %, arredondado no centavo; R$ = o valor em cada uma delas (até a diária).
 */
export function descontoDaPromoNaEstadia(p: PromoDaEstadia | null | undefined, noites: { dia: string; valor: number }[]) {
  if (!p || p.tirada) return { valor: 0, dias: [] as string[] };
  const vale = noites.filter((n) => n.valor > 0 && diaDaPromo(p, n.dia));
  const valor = p.tipo === "pct"
    ? centavos((vale.reduce((t, n) => t + n.valor, 0) * Number(p.valor)) / 100)
    : centavos(vale.reduce((t, n) => t + Math.min(Number(p.valor), n.valor), 0));
  return { valor, dias: vale.map((n) => n.dia) };
}

/** "15% na diária da creche", "15% nas noites do hotel", "R$ 10 por noite no hotel". */
export const etiquetaDaCasa = (p: Pick<PromoDaEstadia, "tipo" | "valor">, tipo: string) =>
  p.tipo === "pct" ? `${Number(p.valor).toLocaleString("pt-BR")}% ${tipo === "hotel" ? "nas noites do hotel" : "na diária da creche"}`
    : `${brlCurto(p.valor)} ${tipo === "hotel" ? "por noite no hotel" : "na diária da creche"}`;
