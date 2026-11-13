"use client";

import type { Horario } from "@/lib/gestao/tipos";
import "./ajustes.css";

/** Ordem em que a semana aparece: segunda primeiro, domingo por último. */
export const ORDEM_DIAS = ["1", "2", "3", "4", "5", "6", "0"] as const;
export const NOME_DIAS: Record<string, string> = { "0": "domingo", "1": "segunda", "2": "terça", "3": "quarta", "4": "quinta", "5": "sexta", "6": "sábado" };
const PADRAO = { abre: "08:00", fecha: "18:00" };

const ALMOCO_PADRAO = { de: "12:00", ate: "13:00" };
const hhmm = (v: unknown) => (typeof v === "string" && /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : null);
type Almoco = { de: string; ate: string };

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

const diaRuim = (v: Horario[string]) => !!v && (!v.abre || !v.fecha || v.fecha <= v.abre);
/** O almoço do pet shop: o do primeiro dia aberto que tiver (a tela mantém igual em todos). */
export const almocoDe = (h: Horario): Almoco | null => ORDEM_DIAS.map((d) => h[d]?.almoco).find((a): a is Almoco => !!a) ?? null;
/** Dias abertos em que o almoço vale: o pet shop abre antes e continua aberto depois. */
const diasComAlmoco = (h: Horario, a: Almoco) => ORDEM_DIAS.filter((d) => { const v = h[d]; return !!v && v.abre < a.de && v.fecha > a.ate; });
/** Põe (ou tira) o mesmo almoço em todos os dias abertos. */
function comAlmoco(h: Horario, a: Almoco | null): Horario {
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

const DIA_UTIL = { abre: "08:00", fecha: "18:00" }, SABADO = { abre: "08:00", fecha: "13:00" };
/** Semanas prontas, para começar com um toque. */
export const MODELOS_HORARIO: { rotulo: string; dias: Record<string, { abre: string; fecha: string } | null> }[] = [
  { rotulo: "Segunda a sexta", dias: { "1": DIA_UTIL, "2": DIA_UTIL, "3": DIA_UTIL, "4": DIA_UTIL, "5": DIA_UTIL, "6": null, "0": null } },
  { rotulo: "Segunda a sábado", dias: { "1": DIA_UTIL, "2": DIA_UTIL, "3": DIA_UTIL, "4": DIA_UTIL, "5": DIA_UTIL, "6": SABADO, "0": null } },
  { rotulo: "Terça a sábado", dias: { "1": null, "2": DIA_UTIL, "3": DIA_UTIL, "4": DIA_UTIL, "5": DIA_UTIL, "6": DIA_UTIL, "0": null } },
  { rotulo: "Todos os dias", dias: { "1": DIA_UTIL, "2": DIA_UTIL, "3": DIA_UTIL, "4": DIA_UTIL, "5": DIA_UTIL, "6": DIA_UTIL, "0": DIA_UTIL } },
];
const mesmosDias = (a: Horario, b: Horario) => ORDEM_DIAS.every((d) => (a[d]?.abre ?? "") === (b[d]?.abre ?? "") && (a[d]?.fecha ?? "") === (b[d]?.fecha ?? ""));

/**
 * Uma linha por dia (seg → dom): chave aberto/fechado e as horas de abrir e fechar.
 * No horário do pet shop vem também a pergunta do almoço; na escala de uma pessoa (`semAlmoco`), não.
 */
export function GradeHorario({ valor, aoMudar, aberto = "Aberto", fechado = "Fechado", base, semAlmoco, modelos }: {
  valor: Horario; aoMudar: (h: Horario) => void; aberto?: string; fechado?: string;
  /** Horário sugerido ao ligar um dia (ex.: o do pet shop, na escala da pessoa). */
  base?: Horario;
  /** Escala de uma pessoa: sem a pergunta do almoço. */
  semAlmoco?: boolean;
  /** Mostra as semanas prontas (segunda a sexta, terça a sábado…) acima da grade. */
  modelos?: boolean;
}) {
  const almoco = semAlmoco ? null : almocoDe(valor);
  /** Toda mudança de dia sai com o almoço igual em todos os dias abertos (ou sem a chave, na escala de uma pessoa). */
  const mudar = (h: Horario) => aoMudar(comAlmoco(h, almoco));
  const por = (d: string, v: Horario[string]) => mudar({ ...valor, [d]: v });
  const abertos = ORDEM_DIAS.filter((d) => valor[d]);
  const primeiro = abertos.length ? valor[abertos[0]]! : null;
  const jaIguais = !!primeiro && abertos.every((d) => valor[d]!.abre === primeiro.abre && valor[d]!.fecha === primeiro.fecha);
  // copia o horário do primeiro dia aberto para os outros dias abertos; dia fechado continua fechado
  const igualar = () => {
    if (!primeiro) return;
    const novo = { ...valor };
    for (const d of abertos) novo[d] = { abre: primeiro.abre, fecha: primeiro.fecha };
    mudar(novo);
  };
  const porAlmoco = (a: Almoco | null) => aoMudar(comAlmoco(valor, a));
  const valem = almoco ? diasComAlmoco(valor, almoco) : [];
  const almocoRuim = !!almoco && (!almoco.de || !almoco.ate || almoco.ate <= almoco.de || !valem.length);
  const semAlmocoNoDia = almoco && !almocoRuim ? abertos.filter((d) => !valem.includes(d)) : [];
  return (
    <div className="g-pilha p">
      {modelos && (
        <div className="g-chips" role="group" aria-label="Semanas prontas">
          {MODELOS_HORARIO.map((m) => (
            <button key={m.rotulo} type="button" className="g-chip" aria-pressed={mesmosDias(m.dias, valor)}
              onClick={() => mudar(Object.fromEntries(ORDEM_DIAS.map((d) => [d, m.dias[d] ? { ...m.dias[d]! } : null])))}>{m.rotulo}</button>
          ))}
        </div>
      )}
      <div className="gj-dias">
        {ORDEM_DIAS.map((d) => {
          const v = valor[d];
          const ruim = diaRuim(v);
          return (
            <div key={d} className="gj-dia">
              <b>{NOME_DIAS[d]}</b>
              <label className="g-check">
                <input type="checkbox" checked={!!v} onChange={(e) => { const b = base?.[d] ?? primeiro ?? PADRAO; por(d, e.target.checked ? { abre: b.abre, fecha: b.fecha } : null); }} />
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
      {abertos.length > 1 && (
        <div className="g-fila" style={{ flexWrap: "wrap" }}>
          <button type="button" className="g-btn p sec" onClick={igualar} disabled={jaIguais}>Usar o mesmo horário em todos os dias abertos</button>
          <span className="g-muted g-pp">{jaIguais ? "Os dias abertos já têm o mesmo horário." : `Copia o horário de ${NOME_DIAS[abertos[0]]}. Dia fechado continua fechado.`}</span>
        </div>
      )}
      {!semAlmoco && (
        <div className="gj-almoco">
          <label className="g-check">
            <input type="checkbox" checked={!!almoco} disabled={!abertos.length} onChange={(e) => porAlmoco(e.target.checked ? { ...ALMOCO_PADRAO } : null)} />
            Fecha para o almoço?
          </label>
          {almoco ? (
            <>
              <span className="gj-horas">
                <span className="g-muted g-pp">das</span>
                <input type="time" className={`g-input${almocoRuim ? " ruim" : ""}`} aria-label="Almoço: começa" value={almoco.de} onChange={(e) => porAlmoco({ ...almoco, de: e.target.value })} />
                <span className="g-muted g-pp">às</span>
                <input type="time" className={`g-input${almocoRuim ? " ruim" : ""}`} aria-label="Almoço: termina" value={almoco.ate} onChange={(e) => porAlmoco({ ...almoco, ate: e.target.value })} />
              </span>
              <small className="g-muted">
                Nesse intervalo a agenda e o link do cliente não oferecem horário. Vale toda semana, sem prazo para acabar.
                {semAlmocoNoDia.length > 0 && ` Em ${semAlmocoNoDia.map((d) => NOME_DIAS[d]).join(" e ")} não muda nada, porque o dia termina antes ou começa depois do almoço.`}
              </small>
            </>
          ) : <small className="g-muted">Se fecha, marque aqui: não precisa bloquear a agenda toda semana.</small>}
        </div>
      )}
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
