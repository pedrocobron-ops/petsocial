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

