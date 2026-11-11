/** Contas da agenda que não dependem do navegador (a tela e o assistente usam as mesmas). */

export type Intervalo = { inicio: number; fim: number }; // minutos desde 00:00 do dia

export const paraMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };
export const deMin = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Horários de início possíveis num dia: dentro do funcionamento, sem bater com o que já está marcado.
 * `aPartirDe` (minutos) corta os horários que já passaram quando o dia é hoje.
 */
export function horariosLivres(p: { abre: string; fecha: string; duracaoMin: number; ocupados: Intervalo[]; passo?: number; aPartirDe?: number }): string[] {
  const passo = p.passo ?? 30;
  const abre = paraMin(p.abre), fecha = paraMin(p.fecha);
  const livres: string[] = [];
  for (let t = abre; t + p.duracaoMin <= fecha; t += passo) {
    if (p.aPartirDe != null && t < p.aPartirDe) continue;
    if (p.ocupados.some((o) => t < o.fim && t + p.duracaoMin > o.inicio)) continue;
    livres.push(deMin(t));
  }
  return livres;
}

/** Texto do lembrete que vai para o WhatsApp do tutor. */
export function textoLembrete(p: { tutor?: string | null; pet: string; servico?: string | null; quando: string; hora: string; petshop: string }) {
  const oi = p.tutor ? `Oi, ${p.tutor.split(" ")[0]}!` : "Oi!";
  return `${oi} Aqui é do ${p.petshop}. Passando para lembrar ${p.servico ? `do ${p.servico.toLowerCase()}` : "do horário"} de ${p.pet} ${p.quando} às ${p.hora}. Posso confirmar?`;
}

/* ---------- série (horário que se repete) e bloqueio ---------- */

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const somaDiasIso = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const diaDaSemanaIso = (dia: string) => new Date(`${dia}T00:00:00Z`).getUTCDay();

export const REPETICOES = [
  { semanas: 0, rotulo: "Não repete" },
  { semanas: 1, rotulo: "Toda semana" },
  { semanas: 2, rotulo: "A cada 2 semanas" },
  { semanas: 4, rotulo: "A cada 4 semanas" },
] as const;
export const MOTIVOS_BLOQUEIO = ["Almoço", "Folga", "Feriado", "Manutenção"];

/** Dias (AAAA-MM-DD) de uma série: o primeiro e os seguintes, de N em N semanas. */
export function datasDaSerie(dia: string, aCadaSemanas: number, vezes: number): string[] {
  if (!RE_DIA.test(dia) || !aCadaSemanas || vezes < 2) return [dia];
  return Array.from({ length: Math.min(12, Math.floor(vezes)) }, (_, i) => somaDiasIso(dia, i * 7 * aCadaSemanas));
}

/**
 * Dias úteis a partir de `dia`, por N semanas: os dias em que o pet shop abre
 * (sem horário de funcionamento preenchido, de segunda a sexta). O primeiro dia entra sempre.
 */
export function diasUteis(dia: string, semanas: number, horario: unknown): string[] {
  if (!RE_DIA.test(dia)) return [dia];
  const h = (horario ?? {}) as Record<string, { abre?: string; fecha?: string } | null>;
  const abre = (d: number) => Boolean(h[String(d)]?.abre && h[String(d)]?.fecha);
  const temHorario = [0, 1, 2, 3, 4, 5, 6].some(abre);
  const util = (d: number) => (temHorario ? abre(d) : d >= 1 && d <= 5);
  const out = [dia];
  for (let i = 1; i < Math.max(1, Math.min(8, Math.floor(semanas))) * 7; i++) {
    const d = somaDiasIso(dia, i);
    if (util(diaDaSemanaIso(d))) out.push(d);
  }
  return out;
}

export type BloqueioCurto = { inicio: string; fim: string; profissional_id: string | null };
/** O bloqueio vale para esse profissional (ou é do pet shop inteiro) e cruza o intervalo (em milissegundos)? */
export function bloqueioPega(b: BloqueioCurto, profissionalId: string | null | undefined, inicioMs: number, fimMs: number) {
  if (b.profissional_id && b.profissional_id !== profissionalId) return false;
  return new Date(b.inicio).getTime() < fimMs && new Date(b.fim).getTime() > inicioMs;
}
