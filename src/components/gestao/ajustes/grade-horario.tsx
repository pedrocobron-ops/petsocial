"use client";

import type { Horario } from "@/lib/gestao/tipos";
import "./ajustes.css";

/** Ordem em que a semana aparece: segunda primeiro, domingo por último. */
export const ORDEM_DIAS = ["1", "2", "3", "4", "5", "6", "0"] as const;
export const NOME_DIAS: Record<string, string> = { "0": "domingo", "1": "segunda", "2": "terça", "3": "quarta", "4": "quinta", "5": "sexta", "6": "sábado" };
const PADRAO = { abre: "08:00", fecha: "18:00" };

/** Lê o jsonb do banco e devolve sempre os 7 dias (o que faltar ou vier quebrado vira fechado). */
export function lerHorario(bruto: unknown): Horario {
  const h = (bruto && typeof bruto === "object" ? bruto : {}) as Horario;
  const limpo: Horario = {};
  for (const d of ORDEM_DIAS) {
    const v = h[d];
    limpo[d] = v && typeof v.abre === "string" && typeof v.fecha === "string" ? { abre: v.abre.slice(0, 5), fecha: v.fecha.slice(0, 5) } : null;
  }
  return limpo;
}

const diaRuim = (v: Horario[string]) => !!v && (!v.abre || !v.fecha || v.fecha <= v.abre);

/** Frase de erro se algum dia aberto está sem hora ou fecha antes de abrir; null se está tudo certo. */
export function erroDoHorario(h: Horario): string | null {
  const ruim = ORDEM_DIAS.find((d) => diaRuim(h[d]));
  if (!ruim) return null;
  const v = h[ruim]!;
  return !v.abre || !v.fecha ? `Faltou a hora de ${NOME_DIAS[ruim]}.` : `Em ${NOME_DIAS[ruim]}, a hora de fechar precisa ser depois da hora de abrir.`;
}

/** Uma linha por dia (seg → dom): chave aberto/fechado e as horas de abrir e fechar. */
export function GradeHorario({ valor, aoMudar, aberto = "Aberto", fechado = "Fechado", base }: {
  valor: Horario; aoMudar: (h: Horario) => void; aberto?: string; fechado?: string;
  /** Horário sugerido ao ligar um dia (ex.: o do pet shop, na escala da pessoa). */
  base?: Horario;
}) {
  const por = (d: string, v: Horario[string]) => aoMudar({ ...valor, [d]: v });
  const copiar = () => {
    const seg = valor["1"];
    aoMudar({ ...valor, "2": seg && { ...seg }, "3": seg && { ...seg }, "4": seg && { ...seg }, "5": seg && { ...seg } });
  };
  return (
    <div className="g-pilha p">
      <div className="gj-dias">
        {ORDEM_DIAS.map((d) => {
          const v = valor[d];
          const ruim = diaRuim(v);
          return (
            <div key={d} className="gj-dia">
              <b>{NOME_DIAS[d]}</b>
              <label className="g-check">
                <input type="checkbox" checked={!!v} onChange={(e) => por(d, e.target.checked ? { ...(base?.[d] ?? valor["1"] ?? PADRAO) } : null)} />
                {aberto}
              </label>
              {v ? (
                <span className="gj-horas">
                  <input type="time" className={`g-input${ruim ? " ruim" : ""}`} aria-label={`${NOME_DIAS[d]}: começa`} value={v.abre} onChange={(e) => por(d, { ...v, abre: e.target.value })} />
                  <span className="g-muted g-pp">às</span>
                  <input type="time" className={`g-input${ruim ? " ruim" : ""}`} aria-label={`${NOME_DIAS[d]}: termina`} value={v.fecha} onChange={(e) => por(d, { ...v, fecha: e.target.value })} />
                </span>
              ) : <span className="g-muted g-p">{fechado}</span>}
            </div>
          );
        })}
      </div>
      <div><button type="button" className="g-btn p sec" onClick={copiar}>Copiar segunda para os dias de semana</button></div>
    </div>
  );
}

export const CORES = ["#f97316", "#3b82a0", "#4d8f6b", "#7c6fb0", "#b0763f", "#b0563f", "#a05a82", "#1e3a2f"];
const NOME_COR: Record<string, string> = {
  "#f97316": "laranja", "#3b82a0": "azul", "#4d8f6b": "verde", "#7c6fb0": "roxo", "#b0763f": "caramelo", "#b0563f": "telha", "#a05a82": "rosa", "#1e3a2f": "verde-garrafa",
};

export function EscolherCor({ valor, aoMudar }: { valor: string; aoMudar: (c: string) => void }) {
  const cores = CORES.includes(valor) ? CORES : [valor, ...CORES];
  return (
    <div className="gj-cores" role="group" aria-label="Cor">
      {cores.map((c) => (
        <button key={c} type="button" className="gj-cor" style={{ background: c }} aria-pressed={c === valor} aria-label={NOME_COR[c] ?? "cor atual"} onClick={() => aoMudar(c)} />
      ))}
    </div>
  );
}
