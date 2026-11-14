import type { Database } from "./banco";
import type { Estadia, Petshop } from "./tipos";
import { FORMAS } from "./tipos";
import { saudacaoZap } from "./agenda";
import { estadiaOcupa, mensalistasNoDia, type Falta, type PlanoCompleto, type Presenca } from "./creche";
import type { PartePagamento } from "./dinheiro";
import { feriadoDoDia, regraDeFeriado, type RegraFeriado } from "./feriados";
import { opcoesDeCobranca } from "./dinheiro-opcoes";
import { acomodacoesDe, modelosDe, pixDe, porteDe, segundoPetDe, sinalDe, temporadaDoDia, temporadasDe, type Taxa, type Temporada, type TipoDeMensagem } from "./hotel-opcoes";
import { brl, dataAmigavel, dataCompleta, dataCurta, hora, inicioDoDia, isoDia, somaDias } from "./util";

/**
 * Hotel e creche: ocupação por dia, preço noite a noite, a conta do check-out e as mensagens para o tutor.
 * A ocupação usa as mesmas funções da conta de vagas (`estadiaOcupa` e `mensalistasNoDia`, de creche.ts):
 * o calendário, o formulário de reserva e o aviso de casa cheia dão sempre o mesmo número.
 */
export type ValoresDaEstadia = Database["public"]["Tables"]["estadias_valores"]["Row"];
export type CuidadoFeito = Database["public"]["Tables"]["estadias_cuidados"]["Row"];
/** O que a conta de vagas precisa saber dos mensalistas: os planos, as presenças e as faltas. */
export type Mens = { planos: PlanoCompleto[]; presencas: Presenca[]; faltas: Falta[] };
type Periodo = Pick<Estadia, "tipo" | "entrada" | "saida_prevista" | "status">;
type Passada = Pick<Estadia, "tipo" | "entrada" | "saida" | "saida_prevista" | "status">;

/**
 * Arredonda em centavos, meio centavo para cima, sem o resto que a conta em ponto flutuante deixa (96,6 × 1,25 = 120,74999…).
 * É o mesmo arredondamento que o banco faz em `hotel_noite`: as duas contas têm de dar o mesmo centavo.
 */
export const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;

/* ---------- ocupação ---------- */

export const ocupaNoDia = (e: Periodo, dia: string, hoje: string) =>
  estadiaOcupa(e.tipo, e.status, isoDia(new Date(e.entrada)), e.saida_prevista ? isoDia(new Date(e.saida_prevista)) : null, dia, hoje);

/** Quantas vagas do tipo estão tomadas no dia (de hoje em diante), sem contar a estadia `ignorar`. É a regra de casa cheia. */
export function ocupadasNoDia<E extends Periodo & { id: string; pet_id: string }>(tipo: string, abertas: E[], ignorar: string | null, dia: string, hoje: Date, mens: Mens | null, horario: unknown) {
  const hojeIso = isoDia(hoje);
  const outras = abertas.filter((e) => e.id !== ignorar);
  // na creche, o mensalista que ainda vai chegar nesse dia também ocupa vaga
  const doPlano = tipo === "creche" && mens ? mensalistasNoDia(mens.planos, dia, hojeIso, [...(outras as unknown as Presenca[]), ...mens.presencas], mens.faltas, horario) : 0;
  return outras.filter((e) => e.tipo === tipo && ocupaNoDia(e, dia, hojeIso)).length + doPlano;
}

/** Dia que já passou: o pet esteve na casa nesse dia? (Hotel conta a noite; creche conta o dia.) */
export function esteveNoDia(e: Passada, dia: string): boolean {
  const ini = isoDia(new Date(e.entrada));
  if (ini > dia || e.status === "reservada" || e.status === "cancelada") return false;
  if (e.status === "em_casa") return true;
  const fim = isoDia(new Date(e.saida ?? e.saida_prevista ?? e.entrada));
  return e.tipo === "hotel" ? dia < fim || dia === ini : dia <= fim;
}

/** Quem ocupa vaga do tipo no dia: de hoje em diante pela regra de vagas; dia passado, quem esteve na casa. */
export function quemOcupa<E extends Passada & { id: string; pet_id: string }>(tipo: string, dia: string, hoje: Date, abertas: E[], encerradas: E[]): E[] {
  const hojeIso = isoDia(hoje);
  // hoje, na creche, quem já veio e foi embora continua contando no dia (a ocupação do dia é quem veio, não só quem ainda está)
  if (dia === hojeIso && tipo === "creche") {
    const ainda = abertas.filter((e) => e.tipo === tipo && ocupaNoDia(e, dia, hojeIso));
    return [...ainda, ...encerradas.filter((e) => e.tipo === tipo && esteveNoDia(e, dia) && !ainda.some((a) => a.id === e.id))];
  }
  if (dia >= hojeIso) return abertas.filter((e) => e.tipo === tipo && ocupaNoDia(e, dia, hojeIso));
  return [...abertas, ...encerradas].filter((e) => e.tipo === tipo && esteveNoDia(e, dia));
}

/** Vagas tomadas no dia, para o calendário. De hoje em diante é exatamente `ocupadasNoDia`. */
export function ocupacaoDoDia<E extends Passada & { id: string; pet_id: string }>(tipo: string, dia: string, hoje: Date, abertas: E[], encerradas: E[], mens: Mens | null, horario: unknown): number {
  const hojeIso = isoDia(hoje);
  // hoje, na creche: as vagas ainda tomadas (quem está e quem ainda vai chegar) mais quem já veio e saiu
  if (dia === hojeIso && tipo === "creche") {
    return ocupadasNoDia(tipo, abertas, null, dia, hoje, mens, horario) + encerradas.filter((e) => e.tipo === tipo && esteveNoDia(e, dia) && !abertas.some((a) => a.id === e.id)).length;
  }
  if (dia >= hojeIso) return ocupadasNoDia(tipo, abertas, null, dia, hoje, mens, horario);
  return quemOcupa(tipo, dia, hoje, abertas, encerradas).length;
}

export const vagasDoTipo = (p: Pick<Petshop, "vagas_hotel" | "vagas_creche">, tipo: string) => (tipo === "hotel" ? p.vagas_hotel : p.vagas_creche) ?? null;
export const diariaFixa = (p: Pick<Petshop, "diaria_hotel" | "diaria_creche">, tipo: string) => { const v = tipo === "hotel" ? p.diaria_hotel : p.diaria_creche; return v == null ? null : Number(v); };

/** Como o dia fica pintado no calendário: livre, enchendo, quase cheio ou cheio. Sem limite de vagas, só "tem gente" ou não. */
export function nivelDeOcupacao(tomadas: number, vagas: number | null): "vazio" | "livre" | "meio" | "quase" | "cheio" {
  if (tomadas <= 0) return "vazio";
  if (vagas == null || vagas <= 0) return "livre";
  const parte = tomadas / vagas;
  return parte >= 1 ? "cheio" : parte >= 0.8 ? "quase" : parte >= 0.5 ? "meio" : "livre";
}

/* ---------- preço ---------- */

/** Hotel cobra por noite; creche cobra por dia em que o pet esteve aqui. Sempre pelo menos 1. */
export function contarDiarias(e: Pick<Estadia, "tipo" | "entrada">, fim: Date) {
  const dias = Math.round((inicioDoDia(fim).getTime() - inicioDoDia(new Date(e.entrada)).getTime()) / 864e5);
  return Math.max(1, e.tipo === "hotel" ? dias : dias + 1);
}

/** A diária que o formulário sugere: no hotel com preço por porte ligado, a do porte do pet; senão, a diária fixa de Meu pet shop. */
export function diariaSugerida(petshop: Petshop, tipo: string, porte: string | null | undefined): number | null {
  if (tipo === "hotel") {
    const o = porteDe(petshop);
    const doPorte = o.ativo && (porte === "P" || porte === "M" || porte === "G" || porte === "GG") ? o[porte] : null;
    if (doPorte != null) return doPorte;
  }
  return diariaFixa(petshop, tipo);
}

/** Uma noite da conta: a diária combinada, a temporada (se houver), o desconto do segundo pet e o valor final. */
export type Noite = { dia: string; base: number; temporada: string | null; cheia: number; desconto: number; valor: number };

/**
 * As noites de uma estadia de hotel: `n` dias seguidos a partir do dia da entrada.
 * Com `ate` (o dia em que o pet saiu, ou hoje no check-out), as noites nunca passam da última noite de verdade:
 * se a pessoa cobra mais noites do que as datas mostram (o check-in foi anotado depois da chegada), as noites a mais
 * contam para trás, antes da entrada anotada, e não para a frente, em dias que ainda nem chegaram.
 */
export function diasDasNoites(entrada: string | Date, n: number, ate?: string | Date | null): string[] {
  let ini = inicioDoDia(new Date(entrada));
  const qtd = Math.max(0, Math.min(n, 400));
  if (ate) {
    const pelasDatas = Math.max(1, Math.round((inicioDoDia(new Date(ate)).getTime() - ini.getTime()) / 864e5));
    if (qtd > pelasDatas) ini = somaDias(ini, pelasDatas - qtd);
  }
  return Array.from({ length: qtd }, (_, i) => isoDia(somaDias(ini, i)));
}
/** Das noites cobradas, as que caíram antes da entrada anotada (ver `diasDasNoites`). */
export const noitesAntesDaEntrada = (entrada: string | Date, dias: string[]) => { const ini = isoDia(new Date(entrada)); return dias.filter((d) => d < ini); };

/**
 * Preço noite a noite. Para cada noite: começa na diária combinada na reserva (`base`);
 * se a noite é de feriado (data marcada pelo dono, com o preço de feriado ligado), vale o preço de feriado;
 * senão, se cai numa temporada, vale a diária da temporada, ou a base com o acréscimo dela (em % ou em reais).
 * Quando duas temporadas pegam a mesma noite, vale a mais curta (`temporadaDoDia`);
 * se é noite de "segundo pet" (`diasDeSegundoPet`), tira o desconto do segundo pet.
 * Cada noite é arredondada em centavos; o total é a soma das noites. Em `temporada` vai o nome que aparece na conta.
 * O banco faz a mesma conta em `hotel_noite` (para o link do cliente e para o sinal do pedido aceito): mudou aqui, mude lá.
 */
export function precoDasNoites(p: { dias: string[]; base: number; temporadas: Temporada[]; segundoPct: number | null; diasDeSegundo: Set<string>; feriado?: { regra: RegraFeriado; nomeDe: (dia: string) => string | null } | null }): Noite[] {
  const comRegra = (r: { modo: "valor" | "pct" | "mais"; valor: number }) => (r.modo === "valor" ? r.valor : r.modo === "mais" ? p.base + r.valor : (p.base * (100 + r.valor)) / 100);
  return p.dias.map((dia) => {
    const f = p.feriado && p.feriado.regra.valor != null ? p.feriado.nomeDe(dia) : null;
    const t = f != null ? null : temporadaDoDia(p.temporadas, dia);
    const cheia = centavos(f != null ? comRegra({ modo: p.feriado!.regra.modo, valor: p.feriado!.regra.valor! }) : t ? comRegra(t) : p.base);
    const desconto = p.segundoPct && p.diasDeSegundo.has(dia) ? centavos((cheia * p.segundoPct) / 100) : 0;
    return { dia, base: p.base, temporada: f ?? t?.nome ?? null, cheia, desconto, valor: centavos(cheia - desconto) };
  });
}

/** Estadia de hotel de outro pet do mesmo tutor, para o desconto do segundo pet. */
export type EstadiaDoTutor = Pick<Estadia, "id" | "pet_id" | "tipo" | "status" | "entrada" | "saida_prevista" | "saida" | "diarias_cobradas"> & { valor_diaria?: number | string | null; criado_em?: string | null };
/** A estadia cuja conta está sendo feita: a diária combinada e quando a reserva foi criada decidem quem paga cheio. */
export type EstadiaDaConta = { id: string | null; pet_id: string; tipo: string; entrada: string | Date; criado_em?: string | null };

/**
 * Noites desta estadia em que ela é a do "segundo pet" (tem o desconto). A regra, uma só em todas as telas:
 * na noite em que mais de um pet do mesmo tutor está no hotel, paga a diária cheia o pet de DIÁRIA COMBINADA MAIS ALTA;
 * os outros têm o desconto. Se a diária é igual, paga cheio a reserva feita primeiro (a reserva que ainda está sendo
 * digitada é sempre a mais nova). Não depende de quem chegou antes nem da ordem em que a tela leu as reservas.
 * O banco usa a mesma regra em `hotel_previsto`.
 */
export function diasDeSegundoPet(esta: EstadiaDaConta, base: number, dias: string[], outras: EstadiaDoTutor[], hoje: Date): Set<string> {
  const hojeIso = isoDia(hoje);
  // a outra paga cheio no meu lugar? (diária mais alta; no empate, a reserva mais antiga)
  const passaNaFrente = (o: EstadiaDoTutor) => {
    const dela = o.valor_diaria == null ? 0 : Number(o.valor_diaria);
    if (dela !== base) return dela > base;
    if (esta.id == null || !esta.criado_em) return true;
    if (!o.criado_em) return false;
    return o.criado_em !== esta.criado_em ? o.criado_em < esta.criado_em : o.id < esta.id;
  };
  const antes = outras.filter((o) => o.tipo === "hotel" && o.status !== "cancelada" && o.pet_id !== esta.pet_id && o.id !== esta.id && passaNaFrente(o));
  const cobre = (o: EstadiaDoTutor, dia: string) => {
    const ini = isoDia(new Date(o.entrada));
    if (o.status === "encerrada") return diasDasNoites(o.entrada, o.diarias_cobradas ?? contarDiarias(o, new Date(o.saida ?? o.entrada)), o.saida ?? o.entrada).includes(dia);
    if (dia < ini) return false;
    if (!o.saida_prevista) return o.status === "em_casa" ? true : dia === ini;
    const fim = isoDia(new Date(o.saida_prevista));
    return dia < fim || dia === ini || (o.status === "em_casa" && dia <= hojeIso);
  };
  return new Set(dias.filter((d) => antes.some((o) => cobre(o, d))));
}

/** As regras de preço ligadas mudam a conta deste tipo de estadia? (Só o hotel tem temporada, feriado e desconto do segundo pet.) */
export function precoPorNoite(petshop: Petshop, tipo: string) {
  if (tipo !== "hotel") return null;
  const temporadas = temporadasDe(petshop), segundo = segundoPetDe(petshop);
  const lista = temporadas.ativo ? temporadas.lista : [];
  const pct = segundo.ativo && segundo.pct ? segundo.pct : null;
  // o preço de feriado vem de src/lib/gestao/feriados.ts (só chega para quem recebe)
  const feriado = regraDeFeriado();
  return lista.length || pct || feriado ? { temporadas: lista, segundoPct: pct, feriado } : null;
}

/**
 * Diárias de uma estadia: noite a noite quando há regra ligada (hotel); senão, quantidade × diária, como sempre.
 * `ate`: o dia em que o pet saiu (ou hoje, no check-out). Com ele, as noites cobradas nunca caem em dia que ainda não chegou.
 */
export function contaDasDiarias(petshop: Petshop, e: EstadiaDaConta, n: number, diaria: number | null, outras: EstadiaDoTutor[], hoje: Date, ate?: string | Date | null):
  { total: number | null; noites: Noite[] | null } {
  if (diaria == null) return { total: null, noites: null };
  const regra = precoPorNoite(petshop, e.tipo);
  if (!regra) return { total: centavos(n * diaria), noites: null };
  const dias = diasDasNoites(e.entrada, n, ate);
  const noites = precoDasNoites({
    dias, base: diaria, temporadas: regra.temporadas, segundoPct: regra.segundoPct, diasDeSegundo: regra.segundoPct ? diasDeSegundoPet(e, diaria, dias, outras, hoje) : new Set(),
    feriado: regra.feriado ? { regra: regra.feriado, nomeDe: feriadoDoDia } : null,
  });
  return { total: centavos(noites.reduce((t, x) => t + x.valor, 0)), noites };
}

/** A conta noite a noite mudou alguma noite em relação à diária combinada? (Para a tela dizer "com temporada, feriado ou desconto".) */
export const temNoiteDiferente = (noites: Noite[] | null) => Boolean(noites?.some((x) => x.temporada != null || x.desconto > 0));

/** Taxa marcada numa estadia, com a quantidade (1, ou o número de noites) e o total. */
export type TaxaDaConta = { id: string; nome: string; por: "fixa" | "noite"; valor: number; qtd: number; total: number };
export const taxaNaConta = (t: Taxa, n: number): TaxaDaConta => { const qtd = t.por === "noite" ? Math.max(1, n) : 1; return { id: t.id, nome: t.nome, por: t.por, valor: t.valor, qtd, total: centavos(qtd * t.valor) }; };
/** Lê as taxas guardadas na reserva (`estadias_valores.taxas`). */
export function taxasGuardadas(v: Pick<ValoresDaEstadia, "taxas"> | null | undefined): Taxa[] {
  if (!Array.isArray(v?.taxas)) return [];
  return (v!.taxas as unknown[]).flatMap((x) => {
    const t = x as Partial<Taxa>;
    return typeof t?.nome === "string" && typeof t.valor === "number" ? [{ id: String(t.id ?? t.nome), nome: t.nome, valor: t.valor, por: t.por === "noite" ? "noite" as const : "fixa" as const }] : [];
  });
}

/** Sinal sugerido pela regra do pet shop: valor fixo, ou a porcentagem do total previsto (em branco quando não dá para calcular). */
export function sinalSugerido(petshop: Petshop, totalPrevisto: number | null): number | null {
  const o = sinalDe(petshop);
  if (!o.ativo || !o.valor) return null;
  if (o.modo === "valor") return centavos(o.valor);
  return totalPrevisto ? centavos((totalPrevisto * o.valor) / 100) : null;
}
/** A reserva deste tipo pode ter sinal? (Hotel sempre que a opção está ligada; creche, só se o dono marcou.) */
export function aceitaSinal(petshop: Petshop, tipo: string) {
  const o = sinalDe(petshop);
  return o.ativo && (tipo === "hotel" || o.creche);
}

/* ---------- a conta do check-out, como fica guardada ---------- */

export type ContaDaEstadia = {
  v: 1; tipo: string; quando: string; diarias: number; valor_diaria: number | null;
  /** hotel com temporada ou desconto do segundo pet: a composição noite a noite */
  noites: Noite[] | null;
  /** nome do pacote, quando as diárias saíram do pacote */
  pacote: string | null;
  total_diarias: number;
  taxas: TaxaDaConta[];
  extras: { nome: string; valor: number }[];
  produtos: { nome: string; qtd: number; valor: number; total: number; produto_id?: string }[];
  /** diárias + taxas + extras + produtos */
  soma: number;
  /** diferença quando a pessoa mudou o valor na mão (negativa = desconto) */
  ajuste: number;
  /** quanto a estadia custou */
  total: number;
  /** sinal descontado da conta (já pago, ou ainda a receber) */
  sinal: number;
  sinal_pago: boolean;
  /** total menos o sinal: o que foi cobrado na saída */
  a_pagar: number;
  /** contas antigas do tutor recebidas junto */
  pendencias: { descricao: string; valor: number }[];
  pagamento: { fiado: true; quando: string } | { fiado: false; forma: string; pagamentos: PartePagamento[] | null } | null;
  lancamento_id: string | null;
};

export function lerConta(v: Pick<ValoresDaEstadia, "conta"> | null | undefined): ContaDaEstadia | null {
  const c = v?.conta as Partial<ContaDaEstadia> | null | undefined;
  return c && typeof c === "object" && c.v === 1 && typeof c.total === "number" ? (c as ContaDaEstadia) : null;
}

/**
 * Reparte as partes de um pagamento (ex.: Pix 600 + dinheiro 400) entre várias contas pagas juntas, na ordem:
 * a primeira conta pega das primeiras partes, e assim por diante. A soma por forma e por conta fecha em centavos.
 */
export function repartirPagamento(partes: PartePagamento[], valores: number[]): PartePagamento[][] {
  const resto = partes.map((p) => ({ forma: p.forma, c: Math.round(p.valor * 100) }));
  return valores.map((valor) => {
    let falta = Math.round(valor * 100);
    const minhas: PartePagamento[] = [];
    for (const r of resto) {
      if (falta <= 0) break;
      const usa = Math.min(falta, r.c);
      if (usa <= 0) continue;
      minhas.push({ forma: r.forma, valor: usa / 100 });
      r.c -= usa; falta -= usa;
    }
    return minhas;
  });
}

const nomeDaForma = (f: string) => FORMAS.find((x) => x.id === f)?.rotulo ?? "Outro";
export function textoDoPagamentoDaConta(p: ContaDaEstadia["pagamento"]) {
  if (!p) return "";
  if (p.fiado) return `a receber até ${dataCompleta(p.quando)}`;
  return p.pagamentos && p.pagamentos.length > 1 ? p.pagamentos.map((x) => `${nomeDaForma(x.forma)} ${brl(x.valor)}`).join(" + ") : nomeDaForma(p.forma);
}

const palavraDiarias = (tipo: string, n: number) => (tipo === "hotel" ? (n === 1 ? "noite" : "noites") : n === 1 ? "diária" : "diárias");

/** As linhas da conta em texto simples (comprovante do WhatsApp e detalhe do histórico usam as mesmas). */
export function linhasDaConta(c: ContaDaEstadia): { texto: string; valor: string; fraca?: boolean }[] {
  const linhas: { texto: string; valor: string; fraca?: boolean }[] = [];
  if (c.pacote) linhas.push({ texto: `${c.diarias} ${palavraDiarias(c.tipo, c.diarias)} pelo pacote (${c.pacote})`, valor: brl(0) });
  else if (c.noites) {
    // noites seguidas com o mesmo preço viram uma linha só
    let i = 0;
    while (i < c.noites.length) {
      let j = i;
      while (j + 1 < c.noites.length && c.noites[j + 1].valor === c.noites[i].valor && c.noites[j + 1].temporada === c.noites[i].temporada && c.noites[j + 1].desconto === c.noites[i].desconto) j++;
      const n = j - i + 1, x = c.noites[i];
      const marcas = [x.temporada, x.desconto > 0 ? "desconto do segundo pet" : null].filter(Boolean).join(", ");
      const dias = n === 1 ? dataCurta(x.dia) : `${dataCurta(x.dia)} a ${dataCurta(c.noites[j].dia)}`;
      linhas.push({ texto: `${n} ${palavraDiarias(c.tipo, n)} de ${brl(x.valor)} (${dias}${marcas ? `, ${marcas}` : ""})`, valor: brl(centavos(n * x.valor)) });
      i = j + 1;
    }
  } else linhas.push({ texto: `${c.diarias} ${palavraDiarias(c.tipo, c.diarias)}${c.valor_diaria != null ? ` de ${brl(c.valor_diaria)}` : ""}`, valor: brl(c.total_diarias) });
  for (const t of c.taxas) linhas.push({ texto: t.por === "noite" ? `${t.nome} (${t.qtd} x ${brl(t.valor)})` : t.nome, valor: brl(t.total) });
  for (const e of c.extras) linhas.push({ texto: e.nome, valor: brl(e.valor) });
  for (const p of c.produtos) linhas.push({ texto: p.qtd === 1 ? p.nome : `${p.qtd.toLocaleString("pt-BR")} x ${p.nome} (${brl(p.valor)} cada)`, valor: brl(p.total) });
  if (c.ajuste < 0) linhas.push({ texto: "Desconto", valor: `- ${brl(-c.ajuste)}` });
  if (c.ajuste > 0) linhas.push({ texto: "Acréscimo", valor: brl(c.ajuste) });
  return linhas;
}

/**
 * Comprovante da estadia em texto simples, para mandar ao tutor pelo WhatsApp: período, diárias (com a composição),
 * taxas, extras, sinal, total e como foi pago. Não é documento fiscal, e o texto diz isso no fim.
 */
export function textoComprovanteEstadia(p: { petshop: string; tutor?: string | null; pet?: string | null; entrada: string; saida: string; conta: ContaDaEstadia }) {
  const c = p.conta;
  const lugar = c.tipo === "hotel" ? "Hotel" : "Creche";
  const junto = centavos(c.pendencias.reduce((t, x) => t + x.valor, 0));
  return [
    `${saudacaoZap(p.tutor, p.petshop).replace(/ Aqui é .*$/, "")} Segue o comprovante da estadia${p.pet ? ` de ${p.pet}` : ""}.`,
    "",
    p.petshop,
    `${lugar}: ${dataCompleta(p.entrada)} a ${dataCompleta(p.saida)}`,
    ...(p.pet ? [`Pet: ${p.pet}`] : []),
    "",
    ...linhasDaConta(c).map((l) => `${l.texto}: ${l.valor}`),
    `Total da estadia: ${brl(c.total)}`,
    ...(c.sinal > 0 ? [`Sinal ${c.sinal_pago ? "já pago" : "combinado"}: - ${brl(c.sinal)}`, `Valor na saída: ${brl(c.a_pagar)}`] : []),
    ...(junto > 0 ? ["", ...c.pendencias.map((x) => `Conta anterior (${x.descricao}): ${brl(x.valor)}`), `Total pago agora: ${brl(centavos(c.a_pagar + junto))}`] : []),
    ...(c.pagamento ? [`Pagamento: ${textoDoPagamentoDaConta(c.pagamento)}`] : []),
    "",
    "Este comprovante não é nota fiscal.",
  ].join("\n");
}

/* ---------- ficha de cuidados ---------- */

/** Um cuidado combinado para a estadia: comida ou remédio, quanto e em que horários. */
export type Cuidado = { id: string; tipo: "comida" | "remedio"; oque: string; quanto: string; horas: string[]; /** só no formulário: a hora que está no campo e ainda não entrou na lista */ nova?: string };
export function lerCuidados(e: { cuidados?: unknown } | null | undefined): Cuidado[] {
  if (!Array.isArray(e?.cuidados)) return [];
  return (e!.cuidados as unknown[]).flatMap((x) => {
    const c = x as Partial<Cuidado>;
    if (!c || typeof c.id !== "string" || typeof c.oque !== "string" || !c.oque.trim()) return [];
    const horas = Array.isArray(c.horas) ? c.horas.filter((h): h is string => typeof h === "string" && /^\d{2}:\d{2}$/.test(h)).sort() : [];
    return [{ id: c.id, tipo: c.tipo === "remedio" ? "remedio" as const : "comida" as const, oque: c.oque.trim(), quanto: typeof c.quanto === "string" ? c.quanto.trim() : "", horas }];
  });
}
/** "8h" ou "8h30" a partir de "08:00". */
export const horaFalada = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return m ? `${h}h${String(m).padStart(2, "0")}` : `${h}h`; };
/** "Ração, 1 xícara: 8h e 18h" */
export const textoDoCuidado = (c: Cuidado) => `${[c.oque, c.quanto].filter(Boolean).join(", ")}${c.horas.length ? `: ${juntarE(c.horas.map(horaFalada))}` : ""}`;
const juntarE = (n: string[]) => (n.length <= 1 ? n[0] ?? "" : `${n.slice(0, -1).join(", ")} e ${n[n.length - 1]}`);

/** O que foi feito no dia, em frase, só com o que a equipe marcou: "comeu às 8h e às 18h; tomou Apoquel às 9h". */
export function fatosDoDia(cuidados: Cuidado[], feitos: Pick<CuidadoFeito, "item" | "dia" | "hora" | "feito_em">[], dia: string): string {
  const partes: string[] = [];
  for (const c of cuidados) {
    const doItem = feitos.filter((f) => f.item === c.id && f.dia === dia);
    if (!doItem.length) continue;
    const horas = doItem.map((f) => (f.hora ? horaFalada(f.hora) : horaFalada(hora(f.feito_em)))).sort((a, b) => parseInt(a) - parseInt(b));
    partes.push(`${c.tipo === "remedio" ? `tomou ${c.oque}` : c.oque.toLowerCase() === "ração" || c.oque.toLowerCase() === "comida" ? "comeu" : `comeu ${c.oque.toLowerCase()}`} ${juntarE(horas.map((h) => `às ${h}`))}`);
  }
  return partes.join("; ");
}

/* ---------- mensagens para o tutor ---------- */

export const MENSAGENS: { id: TipoDeMensagem; rotulo: string; apoio: string }[] = [
  { id: "confirmar", rotulo: "Confirmar reserva", apoio: "Diz o dia e a hora combinados." },
  { id: "chegada", rotulo: "Avisar a chegada", apoio: "Lembra o tutor do dia e da hora de trazer o pet." },
  { id: "sinal", rotulo: "Pedir o sinal", apoio: "Diz o valor do sinal e o que você combinou sobre ele." },
  { id: "como_esta", rotulo: "Como está o hóspede", apoio: "Conta que o pet está bem e o que já foi feito hoje." },
  { id: "saida", rotulo: "Lembrar a saída", apoio: "Lembra o dia e a hora de buscar o pet." },
];

/** Texto padrão de cada mensagem, sem a saudação. As palavras entre colchetes são trocadas na hora. */
export const MODELOS_PADRAO: Record<TipoDeMensagem, string> = {
  confirmar: "Confirmando a reserva [do pet] [lugar]: [entrada]. Até lá!",
  chegada: "Passando para lembrar: a chegada [do pet] [lugar] está marcada para [entrada]. Se mudar alguma coisa, é só avisar.",
  saida: "Passando para lembrar: a saída [do pet] está marcada para [saida].",
  como_esta: "[O pet está bem] aqui [lugar].[cuidados]",
  sinal: "Para garantir a reserva [do pet] [lugar], de [entrada-dia] a [saida-dia], pedimos um sinal de [valor].[politica][pix]",
};
export const MARCAS_DAS_MENSAGENS = [
  { marca: "[pet]", vira: "o nome do pet" }, { marca: "[do pet]", vira: "do Thor, da Mel" }, { marca: "[O pet está bem]", vira: "O Thor está ótimo, A Mel está ótima" },
  { marca: "[lugar]", vira: "no hotel ou na creche" }, { marca: "[entrada]", vira: "dia e hora da chegada" }, { marca: "[saida]", vira: "dia e hora da saída" },
  { marca: "[valor]", vira: "o valor do sinal" }, { marca: "[politica]", vira: "o seu texto sobre o sinal" }, { marca: "[pix]", vira: "a sua chave Pix" },
  { marca: "[cuidados]", vira: "o que já foi marcado na ficha hoje" },
];

type PetDaMensagem = { nome: string; sexo?: string | null; clientes?: { nome: string | null } | null };
type DadosDaMensagem = { petshop: Petshop; pet: PetDaMensagem; estadia: Pick<Estadia, "tipo" | "entrada" | "saida_prevista">; sinal?: number | null; /** quanto do sinal já entrou (sinal pago em partes) */ sinalRecebido?: number | null; fatos?: string };
/** A chave Pix que vai nas mensagens do sinal: a das opções do hotel; em branco, a das opções de cobrança. */
export const pixDoSinal = (petshop: Petshop) => pixDe(petshop) || opcoesDeCobranca(petshop).pix;
/** A mensagem inteira: "Oi, Ana! Aqui é …" e o corpo. */
export const textoDaMensagem = (tipo: TipoDeMensagem, p: DadosDaMensagem) => `${saudacaoZap(p.pet.clientes?.nome, p.petshop.nome)} ${corpoDaMensagem(tipo, p)}`;
/** Só o corpo, sem a saudação (para juntar vários pets do mesmo tutor numa mensagem). */
export function corpoDaMensagem(tipo: TipoDeMensagem, p: DadosDaMensagem) {
  const { pet, estadia: e } = p;
  const modelo = modelosDe(p.petshop)[tipo] ?? MODELOS_PADRAO[tipo];
  const lugar = e.tipo === "hotel" ? "no hotel" : "na creche";
  const doPet = `${pet.sexo === "M" ? "do " : pet.sexo === "F" ? "da " : "de "}${pet.nome}`;
  const bem = pet.sexo === "M" ? `O ${pet.nome} está ótimo` : pet.sexo === "F" ? `A ${pet.nome} está ótima` : `${pet.nome} está muito bem`;
  const quando = (d: string | null) => (d ? `${dataAmigavel(new Date(d))}, às ${hora(d)}` : "o dia combinado");
  const sinal = sinalDe(p.petshop), pix = pixDoSinal(p.petshop);
  const jaEntrou = p.sinal && p.sinalRecebido && p.sinalRecebido > 0 && p.sinalRecebido < p.sinal ? p.sinalRecebido : 0;
  const trocas: [string, string][] = [
    ["[O pet está bem]", bem], ["[do pet]", doPet], ["[pet]", pet.nome], ["[lugar]", lugar],
    ["[entrada-dia]", dataCurta(e.entrada)], ["[saida-dia]", e.saida_prevista ? dataCurta(e.saida_prevista) : "a saída"],
    ["[entrada]", quando(e.entrada)], ["[saida]", quando(e.saida_prevista)],
    ["[valor]", !p.sinal ? "valor a combinar" : jaEntrou ? `${brl(p.sinal)} (já recebemos ${brl(jaEntrou)}; falta ${brl(centavos(p.sinal - jaEntrou))})` : brl(p.sinal)],
    ["[politica]", sinal.politica.trim() ? ` ${sinal.politica.trim()}` : ""], ["[pix]", pix ? ` Pix: ${pix}` : ""],
    ["[cuidados]", p.fatos ? ` Hoje ${p.fatos}.` : ""],
  ];
  let corpo = modelo;
  for (const [de, para] of trocas) corpo = corpo.split(de).join(para);
  return corpo.replace(/[ \t]+/g, " ").trim();
}

/** Nome da acomodação pelo código guardado na estadia. */
export function nomeDaAcomodacao(petshop: Petshop, codigo: string | null | undefined) {
  if (!codigo) return null;
  return acomodacoesDe(petshop).lista.find((a) => a.id === codigo)?.nome ?? null;
}

/* ---------- check-outs para cobrar ---------- */

/** Marca na observação da estadia que a saída foi com pacote (o banco guarda só as diárias e o valor cobrados). */
export const NOTA_PACOTE = "Saiu usando o pacote.";
/** Check-out que fechou sem nada cobrado: não é de mensalista, não usou pacote e não é cortesia. Quem recebe precisa acertar. */
export function estadiaSemCobranca(e: Pick<Estadia, "status" | "mensalista" | "diarias_cobradas" | "valor_cobrado" | "obs">) {
  return e.status === "encerrada" && !e.mensalista && e.diarias_cobradas != null && e.valor_cobrado == null && !e.obs?.includes(NOTA_PACOTE);
}
