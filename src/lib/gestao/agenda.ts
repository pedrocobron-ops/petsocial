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
