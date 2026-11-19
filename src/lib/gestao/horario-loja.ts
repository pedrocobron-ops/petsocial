import type { Horario } from "./tipos";

/**
 * O horário de funcionamento do pet shop (`petshops.horario`), sem tela: ler o jsonb, conferir e pôr o almoço. Usado pela
 * grade de Meu pet shop (`ajustes/grade-horario.tsx`, que reexporta tudo) e pelo Mozart (`assistente/ferramenta-cadastros.ts`).
 */

/** Ordem em que a semana aparece: segunda primeiro, domingo por último. */
export const ORDEM_DIAS = ["1", "2", "3", "4", "5", "6", "0"] as const;
export const NOME_DIAS: Record<string, string> = { "0": "domingo", "1": "segunda", "2": "terça", "3": "quarta", "4": "quinta", "5": "sexta", "6": "sábado" };
export const PADRAO = { abre: "08:00", fecha: "18:00" };

export const ALMOCO_PADRAO = { de: "12:00", ate: "13:00" };
const hhmm = (v: unknown) => (typeof v === "string" && /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : null);
export type Almoco = { de: string; ate: string };

/**
 * Lê o jsonb do banco e devolve sempre os 7 dias (o que faltar ou vier quebrado vira fechado).
 * O almoço do pet shop, quando existe, vem dentro de cada dia aberto (`almoco: { de, ate }`): é um intervalo
 * fechado todos os dias, sem prazo. Quem lê só `abre` e `fecha` (versões antigas, escala da equipe) nem percebe.
 */
export function lerHorario(bruto: unknown): Horario {
  const h = (bruto && typeof bruto === "object" ? bruto : {}) as Horario;
  const limpo: Horario = {};
  for (const d of ORDEM_DIAS) {
    const v = h[d];
    if (!v || typeof v.abre !== "string" || typeof v.fecha !== "string") { limpo[d] = null; continue; }
    const de = hhmm(v.almoco?.de), ate = hhmm(v.almoco?.ate);
    limpo[d] = { abre: v.abre.slice(0, 5), fecha: v.fecha.slice(0, 5), ...(de && ate ? { almoco: { de, ate } } : {}) };
  }
  return limpo;
}

export const diaRuim = (v: Horario[string]) => !!v && (!v.abre || !v.fecha || v.fecha <= v.abre);
/** O almoço do pet shop: o do primeiro dia aberto que tiver (a tela mantém igual em todos). */
export const almocoDe = (h: Horario): Almoco | null => ORDEM_DIAS.map((d) => h[d]?.almoco).find((a): a is Almoco => !!a) ?? null;
/** Dias abertos em que o almoço vale: o pet shop abre antes e continua aberto depois. */
export const diasComAlmoco = (h: Horario, a: Almoco) => ORDEM_DIAS.filter((d) => { const v = h[d]; return !!v && v.abre < a.de && v.fecha > a.ate; });
/** Põe (ou tira) o mesmo almoço em todos os dias abertos. */
export function comAlmoco(h: Horario, a: Almoco | null): Horario {
  const novo: Horario = {};
  for (const d of ORDEM_DIAS) {
    const v = h[d];
    novo[d] = v ? { abre: v.abre, fecha: v.fecha, ...(a ? { almoco: { ...a } } : {}) } : null;
  }
  return novo;
}

/** Frase de erro se algum dia aberto está sem hora ou fecha antes de abrir, ou se o almoço não fecha; null se está tudo certo. */
export function erroDoHorario(h: Horario): string | null {
  const ruim = ORDEM_DIAS.find((d) => diaRuim(h[d]));
  if (ruim) {
    const v = h[ruim]!;
    return !v.abre || !v.fecha ? `Faltou a hora de ${NOME_DIAS[ruim]}.` : `Em ${NOME_DIAS[ruim]}, a hora de fechar precisa ser depois da hora de abrir.`;
  }
  const a = almocoDe(h);
  if (a) {
    if (!a.de || !a.ate) return "Faltou a hora do almoço.";
    if (a.ate <= a.de) return "No almoço, a hora de voltar precisa ser depois da hora de sair.";
    if (!diasComAlmoco(h, a).length) return "O almoço precisa ficar dentro do horário de algum dia aberto.";
  }
  return null;
}

/* ---------- horário da creche, do hotel e de cada serviço ---------- */
/*
 * `petshops.horario_creche` e `petshops.horario_hotel`: a janela de chegada e de busca em cada dia (null = igual ao pet shop).
 * `servicos.horario`: o horário próprio de um serviço da agenda (null = segue o pet shop). Mesmo formato, sem almoço:
 * o almoço do pet shop vale para os serviços que seguem o pet shop. O banco confere o formato (`horario_valido`).
 */
export type Area = "creche" | "hotel";
type ComHorarios = { horario?: unknown; horario_creche?: unknown; horario_hotel?: unknown };
const temAlgo = (h: unknown) => !!h && typeof h === "object" && !Array.isArray(h);

/** O horário que vale na creche ou no hotel: o próprio, ou o do pet shop. */
export function horarioDaArea(p: ComHorarios, area: Area): unknown {
  const proprio = area === "creche" ? p.horario_creche : p.horario_hotel;
  return temAlgo(proprio) ? proprio : p.horario;
}
export const horarioDaCreche = (p: ComHorarios) => horarioDaArea(p, "creche");
export const horarioDoHotel = (p: ComHorarios) => horarioDaArea(p, "hotel");
/** A creche ou o hotel tem horário próprio (diferente do pet shop)? */
export const areaTemHorario = (p: ComHorarios, area: Area) => temAlgo(area === "creche" ? p.horario_creche : p.horario_hotel);

/** O horário que vale num serviço: o próprio, ou o do pet shop. */
export function horarioDoServico(s: { horario?: unknown } | null | undefined, loja: unknown): unknown {
  return s && temAlgo(s.horario) ? s.horario : loja;
}
export const servicoTemHorario = (s: { horario?: unknown } | null | undefined) => !!s && temAlgo(s.horario);

const minutos = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const deMinutos = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const diaDe = (bruto: unknown, diaDaSemana: number) => {
  const v = bruto && typeof bruto === "object" ? (bruto as Horario)[String(diaDaSemana)] : null;
  return v && typeof v.abre === "string" && typeof v.fecha === "string" && /^\d{2}:\d{2}/.test(v.abre) && /^\d{2}:\d{2}/.test(v.fecha) ? v : null;
};

/**
 * A janela de um dia da semana (0 = domingo) em que todos os horários dados funcionam: abre na maior hora de abrir e
 * fecha na menor hora de fechar. Algum fechado no dia, ou janela vazia: null. Serve para um horário com vários serviços.
 */
export function janelaDoDia(horarios: unknown[], diaDaSemana: number): { abre: string; fecha: string } | null {
  let abre = 0, fecha = 24 * 60;
  for (const bruto of horarios) {
    const v = diaDe(bruto, diaDaSemana);
    if (!v) return null;
    abre = Math.max(abre, minutos(v.abre));
    fecha = Math.min(fecha, minutos(v.fecha));
  }
  return horarios.length && fecha > abre ? { abre: deMinutos(abre), fecha: deMinutos(fecha) } : null;
}

/**
 * A janela mais larga do dia: do primeiro que abre ao último que fecha (o pet shop e os serviços com horário próprio).
 * É o que a agenda mostra no dia: domingo com o pet shop fechado e o "Banho de domingo" aberto continua aparecendo.
 */
export function janelaLarga(horarios: unknown[], diaDaSemana: number): { abre: string; fecha: string } | null {
  let abre = Infinity, fecha = -Infinity;
  for (const bruto of horarios) {
    const v = diaDe(bruto, diaDaSemana);
    if (!v) continue;
    abre = Math.min(abre, minutos(v.abre));
    fecha = Math.max(fecha, minutos(v.fecha));
  }
  return fecha > abre ? { abre: deMinutos(abre), fecha: deMinutos(fecha) } : null;
}

/** O horário que a agenda mostra: o do pet shop, aberto também nos dias e horas dos serviços com horário próprio. */
export function horarioDaAgenda(loja: unknown, servicos: { horario?: unknown; ativo?: boolean; categoria?: string }[]): unknown {
  const proprios = servicos.filter((s) => s.ativo !== false && s.categoria !== "creche" && s.categoria !== "hotel" && servicoTemHorario(s)).map((s) => s.horario);
  if (!proprios.length) return loja;
  const base = lerHorario(loja);
  const novo: Horario = {};
  for (const d of ORDEM_DIAS) {
    const j = janelaLarga([loja, ...proprios], Number(d));
    // o almoço do pet shop continua no dia em que só o pet shop define as horas
    novo[d] = j ? { ...j, ...(base[d]?.almoco && base[d]!.abre === j.abre && base[d]!.fecha === j.fecha ? { almoco: base[d]!.almoco } : {}) } : null;
  }
  return novo;
}

/** Tira o almoço (horário de serviço, creche e hotel não têm). */
export const semAlmoco = (h: Horario): Horario => comAlmoco(h, null);

/** Frase de erro de um horário próprio (serviço, creche, hotel); null se está certo. Precisa de ao menos um dia aberto. */
export function erroDoHorarioProprio(h: Horario): string | null {
  const e = erroDoHorario(semAlmoco(h));
  if (e) return e;
  return ORDEM_DIAS.some((d) => h[d]) ? null : "Deixe ao menos um dia aberto, ou volte para \"igual ao pet shop\".";
}

/**
 * Uma chave canônica do horário (dia a dia, abre e fecha, sem almoço): o jsonb do banco volta com as chaves em outra ordem,
 * então não dá para comparar com JSON.stringify. null (ou sem horário) = "igual" (segue o pet shop).
 */
export function chaveDoHorario(bruto: unknown): string {
  if (!temAlgo(bruto)) return "igual";
  const h = lerHorario(bruto);
  return ORDEM_DIAS.map((d) => `${d}:${h[d] ? `${h[d]!.abre}-${h[d]!.fecha}` : "-"}`).join(",");
}

/** O mesmo horário (dias e horas, sem olhar o almoço)? */
export function mesmoHorario(a: unknown, b: unknown): boolean {
  const x = lerHorario(a), y = lerHorario(b);
  return ORDEM_DIAS.every((d) => (!x[d] && !y[d]) || (!!x[d] && !!y[d] && x[d]!.abre === y[d]!.abre && x[d]!.fecha === y[d]!.fecha));
}

/** "segunda 8h às 18h; …; domingo fechado", para o Mozart e as telas. */
export function horarioEmTexto(bruto: unknown): string {
  const h = lerHorario(bruto);
  const hb = (x: string) => (x.endsWith(":00") ? `${Number(x.slice(0, 2))}h` : `${Number(x.slice(0, 2))}h${x.slice(3, 5)}`);
  return ORDEM_DIAS.map((d) => `${NOME_DIAS[d]} ${h[d] ? `${hb(h[d]!.abre)} às ${hb(h[d]!.fecha)}` : "fechado"}`).join("; ");
}

