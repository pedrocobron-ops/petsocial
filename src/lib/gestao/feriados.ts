import type { Database } from "./banco";
import type { Banco } from "./supabase";
import { isoDia } from "./util";

/**
 * Feriados e dias fechados do negócio (tabela `dias_especiais`) e as duas regras de preço que têm valor e por isso
 * ficam fora de `petshops.opcoes` (tabela `hotel_precos`, que só quem recebe lê): preço de feriado no hotel e taxa de
 * busca fora do horário. Tudo começa vazio: sem data na lista e sem regra ligada, nada muda em tela nenhuma.
 *
 * As telas leem por `useCalendario()` (src/components/gestao/calendario.ts), que guarda aqui o que leu. As regras
 * que não são componentes (`esperadoNoDia`, `contaDasDiarias`…) consultam o que está guardado por `diaFechado`,
 * `feriadoDoDia` e `atrasoSugerido`, sem precisar receber a lista em cada chamada.
 */
export type DiaEspecial = Database["public"]["Tables"]["dias_especiais"]["Row"];
/** Preço da noite de feriado no hotel: diária própria, ou a diária combinada com acréscimo em % ou em reais. */
export type RegraFeriado = { ativo: boolean; modo: "valor" | "pct" | "mais"; valor: number | null };
/** Taxa de busca fora do horário de um tipo: depois de que hora e quanto. Hora ou valor em branco = não sugere. */
export type AtrasoDoTipo = { hora: string; valor: number | null };
export type RegraAtraso = { ativo: boolean; tolerancia: number; creche: AtrasoDoTipo; hotel: AtrasoDoTipo };
export type Calendario = { petshop: string; dias: DiaEspecial[]; feriado: RegraFeriado; atraso: RegraAtraso; comPrecos: boolean };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const ehHora = (v: unknown): v is string => typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

export const FERIADO_VAZIO: RegraFeriado = { ativo: false, modo: "pct", valor: null };
export const ATRASO_VAZIO: RegraAtraso = { ativo: false, tolerancia: 0, creche: { hora: "", valor: null }, hotel: { hora: "", valor: null } };

export function lerRegraFeriado(v: unknown): RegraFeriado {
  const o = obj(v);
  return { ativo: o.ativo === true, modo: o.modo === "valor" || o.modo === "mais" ? o.modo : "pct", valor: num(o.valor) };
}
export function lerRegraAtraso(v: unknown): RegraAtraso {
  const o = obj(v);
  const tipo = (x: unknown): AtrasoDoTipo => { const t = obj(x); return { hora: ehHora(t.hora) ? t.hora : "", valor: num(t.valor) }; };
  return { ativo: o.ativo === true, tolerancia: Math.min(180, Math.round(num(o.tolerancia) ?? 0)), creche: tipo(o.creche), hotel: tipo(o.hotel) };
}

/* ---------- o que está guardado (do pet shop aberto agora) ---------- */

let guardado: Calendario | null = null;
let fechados = new Map<string, string>();
let feriados = new Map<string, string>();
const EVENTO = "maestro-calendario";

function guardar(c: Calendario) {
  guardado = c;
  fechados = new Map(c.dias.filter((d) => d.fechado).map((d) => [d.dia, d.nome]));
  feriados = new Map(c.dias.filter((d) => d.feriado).map((d) => [d.dia, d.nome]));
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO));
}
export const calendarioGuardado = (petshopId: string, comPrecos: boolean) => (guardado && guardado.petshop === petshopId && (guardado.comPrecos || !comPrecos) ? guardado : null);
/** Avisa as telas abertas de que a lista ou as regras mudaram (elas releem). */
export function ouvirCalendario(f: () => void) {
  window.addEventListener(EVENTO, f);
  return () => window.removeEventListener(EVENTO, f);
}

/**
 * Lê as datas e, para quem recebe, as regras com valor. Banco ainda sem as tabelas (antes da atualização) ou qualquer
 * outra falha vira lista vazia e regras desligadas: as telas seguem como sempre foram.
 */
export async function lerCalendario(sb: Banco, petshopId: string, comPrecos: boolean): Promise<Calendario> {
  const [d, p] = await Promise.all([
    sb.from("dias_especiais").select("*").eq("petshop_id", petshopId).order("dia").limit(1000),
    comPrecos ? sb.from("hotel_precos").select("feriado, atraso").eq("petshop_id", petshopId).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  const c: Calendario = {
    petshop: petshopId, dias: d.error ? [] : (d.data ?? []), comPrecos,
    feriado: p.error || !p.data ? FERIADO_VAZIO : lerRegraFeriado(p.data.feriado),
    atraso: p.error || !p.data ? ATRASO_VAZIO : lerRegraAtraso(p.data.atraso),
  };
  guardar(c);
  return c;
}

/** O negócio marcou esse dia (AAAA-MM-DD) como fechado? */
export const diaFechado = (dia: string) => fechados.has(dia);
/** O nome que o dono deu ao dia fechado ("Natal"), ou "" se não deu; null quando o dia não é fechado. */
export const nomeDoDiaFechado = (dia: string) => fechados.get(dia) ?? null;
/** "Fechado: Natal" ou "Dia fechado", para os avisos. */
export function fraseDoDiaFechado(dia: string) {
  const n = fechados.get(dia);
  return n == null ? null : n.trim() ? `Dia fechado: ${n.trim()}` : "Dia marcado como fechado";
}

/** A regra de preço de feriado, quando está ligada, tem valor e há data marcada como feriado. */
export function regraDeFeriado(): RegraFeriado | null {
  const r = guardado?.feriado;
  return r && r.ativo && r.valor != null && (r.modo === "valor" || r.valor > 0) && feriados.size > 0 ? r : null;
}
/** A noite desse dia é de feriado? Devolve como aparece na conta ("Feriado: Natal"), ou null. */
export function feriadoDoDia(dia: string): string | null {
  const n = feriados.get(dia);
  return n == null ? null : n.trim() ? `Feriado: ${n.trim()}` : "Feriado";
}

/* ---------- taxa de busca fora do horário ---------- */

export const ID_TAXA_ATRASO = "atraso";
export const NOME_TAXA_ATRASO = "Busca fora do horário";
export type AtrasoSugerido = { valor: number; hora: string; saiu: string };
/**
 * A saída passou do horário combinado pelo dono para esse tipo? Devolve a taxa a sugerir (nunca entra sozinha na conta:
 * a tela mostra e a pessoa confirma ou tira). Compara só a hora do dia da saída, com a tolerância em minutos.
 */
export function atrasoSugerido(tipo: string, saida: Date | string, regra: RegraAtraso | null | undefined = guardado?.atraso): AtrasoSugerido | null {
  if (!regra?.ativo) return null;
  const t = tipo === "hotel" ? regra.hotel : regra.creche;
  if (!ehHora(t.hora) || !t.valor) return null;
  const d = new Date(saida);
  const limite = Number(t.hora.slice(0, 2)) * 60 + Number(t.hora.slice(3)) + regra.tolerancia;
  const minutos = d.getHours() * 60 + d.getMinutes();
  if (minutos <= limite) return null;
  return { valor: t.valor, hora: t.hora, saiu: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` };
}

/* ---------- feriados nacionais (para o dono não digitar um por um) ---------- */

/** Domingo de Páscoa do ano (cálculo de Meeus), para achar a Sexta-feira Santa. */
function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}
/** Os feriados nacionais do ano (os de data fixa e a Sexta-feira Santa). Feriado da cidade e do estado, o dono acrescenta. */
export function feriadosNacionais(ano: number): { dia: string; nome: string }[] {
  const p = pascoa(ano);
  const sexta = new Date(p.getFullYear(), p.getMonth(), p.getDate() - 2);
  const fixo = (mes: number, dia: number, nome: string) => ({ dia: isoDia(new Date(ano, mes - 1, dia)), nome });
  return [
    fixo(1, 1, "Ano Novo"), { dia: isoDia(sexta), nome: "Sexta-feira Santa" }, fixo(4, 21, "Tiradentes"), fixo(5, 1, "Dia do Trabalho"),
    fixo(9, 7, "Independência"), fixo(10, 12, "Nossa Senhora Aparecida"), fixo(11, 2, "Finados"), fixo(11, 15, "Proclamação da República"),
    fixo(11, 20, "Consciência Negra"), fixo(12, 25, "Natal"),
  ].sort((a, b) => a.dia.localeCompare(b.dia));
}
