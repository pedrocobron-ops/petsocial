"use client";

import { useState } from "react";
import { Check, Pill, Plus, Trash2, Utensils } from "lucide-react";
import { horaFalada, lerCuidados, type Cuidado, type CuidadoFeito } from "@/lib/gestao/hotel";
import { novoCodigo } from "@/lib/gestao/hotel-opcoes";
import { hora, isoDia } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { ok, useAvisos, useSomenteLeitura } from "../ui";
import type { EstadiaCompleta } from "./tipos";
import "./hotel.css";

/**
 * Ficha de cuidados da estadia (opção "hotel.cuidados"): comida e remédio combinados (o quê, quanto, em que horários)
 * e a lista do dia, que a equipe marca. Cada marca guarda quem fez e a que horas.
 */

/** Editor dos cuidados, dentro do formulário da reserva ou da estadia. */
export function EditorDeCuidados({ valor, aoMudar }: { valor: Cuidado[]; aoMudar: (c: Cuidado[]) => void }) {
  const [novaHora, setNovaHora] = useState<Record<string, string>>({});
  const mudar = (id: string, m: Partial<Cuidado>) => aoMudar(valor.map((c) => (c.id === id ? { ...c, ...m } : c)));
  const novo = (tipo: Cuidado["tipo"]) => aoMudar([...valor, { id: novoCodigo(), tipo, oque: tipo === "comida" ? "Ração" : "", quanto: "", horas: [] }]);
  return (
    <div className="g-campo">
      <span>Comida e remédio</span>
      {valor.map((c) => (
        <div key={c.id} className="g-ht-cuid-linha">
          <div className="dupla">
            <label className="g-campo"><span>{c.tipo === "remedio" ? "Remédio" : "Comida"}</span>
              <input className="g-input" value={c.oque} maxLength={40} placeholder={c.tipo === "remedio" ? "Nome do remédio" : "Ração, sachê…"} onChange={(e) => mudar(c.id, { oque: e.target.value })} />
            </label>
            <label className="g-campo"><span>Quanto</span>
              <input className="g-input" value={c.quanto} maxLength={40} placeholder={c.tipo === "remedio" ? "1 comprimido" : "1 xícara"} onChange={(e) => mudar(c.id, { quanto: e.target.value })} />
            </label>
          </div>
          <div className="g-fila">
            {c.horas.map((h) => (
              <button key={h} type="button" className="g-chip" aria-pressed onClick={() => mudar(c.id, { horas: c.horas.filter((x) => x !== h) })} aria-label={`Tirar o horário das ${horaFalada(h)}`}>{horaFalada(h)} ×</button>
            ))}
            <input type="time" className="g-input" style={{ width: 120 }} value={novaHora[c.id] ?? ""} aria-label="Horário" onChange={(e) => setNovaHora((n) => ({ ...n, [c.id]: e.target.value }))} />
            <button type="button" className="g-btn fantasma p" disabled={!/^\d{2}:\d{2}$/.test(novaHora[c.id] ?? "")}
              onClick={() => { const h = novaHora[c.id]; if (!c.horas.includes(h)) mudar(c.id, { horas: [...c.horas, h].sort() }); setNovaHora((n) => ({ ...n, [c.id]: "" })); }}><Plus />Horário</button>
            <button type="button" className="g-ico" style={{ marginLeft: "auto" }} onClick={() => aoMudar(valor.filter((x) => x.id !== c.id))} aria-label="Tirar este cuidado"><Trash2 /></button>
          </div>
        </div>
      ))}
      <div className="g-chips">
        <button type="button" className="g-chip" onClick={() => novo("comida")}><Utensils />Comida</button>
        <button type="button" className="g-chip" onClick={() => novo("remedio")}><Pill />Remédio</button>
      </div>
      <small>Escreva o que foi combinado com o tutor. A equipe marca no cartão do hóspede o que já foi feito em cada dia.</small>
    </div>
  );
}

/** Tira o que está em branco antes de gravar. */
export const cuidadosParaGravar = (c: Cuidado[]) => { const l = c.filter((x) => x.oque.trim()).map((x) => ({ ...x, oque: x.oque.trim(), quanto: x.quanto.trim() })); return l.length ? l : null; };

/** A lista de hoje no cartão do hóspede: um botão por horário combinado. */
export function CuidadosDoDia({ estadia: e, feitos, aoMudar }: { estadia: EstadiaCompleta; feitos: CuidadoFeito[]; aoMudar: () => void }) {
  const { sb, petshop } = useGestao();
  const { avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const cuidados = lerCuidados(e);
  if (!cuidados.length) return null;
  const hoje = isoDia(new Date());
  const doDia = feitos.filter((f) => f.estadia_id === e.id && f.dia === hoje);

  async function alternar(c: Cuidado, h: string) {
    if (somenteLeitura() || ocupado) return;
    const chave = `${c.id}-${h}`;
    const feito = doDia.find((f) => f.item === c.id && f.hora === h);
    setOcupado(chave);
    try {
      if (feito) ok(await sb.from("estadias_cuidados").delete().eq("id", feito.id).eq("petshop_id", petshop.id).select("id"));
      else {
        const r = await sb.from("estadias_cuidados").insert({ petshop_id: petshop.id, estadia_id: e.id, item: c.id, dia: hoje, hora: h }).select("id");
        // outra pessoa marcou no mesmo instante: já está feito
        if (r.error && r.error.code !== "23505") throw new Error(r.error.message);
      }
      aoMudar();
    } catch (x) { avisarErro(x); } finally { setOcupado(null); }
  }

  return (
    <div className="g-ht-cuid">
      <h4><Utensils aria-hidden />Cuidados de hoje</h4>
      {cuidados.map((c) => (
        <div key={c.id} className="item">
          <span><b>{c.oque}</b>{c.quanto ? `, ${c.quanto}` : ""}{c.tipo === "remedio" ? " (remédio)" : ""}</span>
          <div className="horas">
            {(c.horas.length ? c.horas : [""]).map((h) => {
              const feito = doDia.find((f) => f.item === c.id && f.hora === h);
              return (
                <button key={h} type="button" className="g-ht-feito" aria-pressed={Boolean(feito)} disabled={ocupado === `${c.id}-${h}`} onClick={() => void alternar(c, h)}
                  aria-label={`${c.oque}${h ? ` das ${horaFalada(h)}` : ""}: ${feito ? "feito, toque para desfazer" : "marcar como feito"}`}>
                  {feito && <Check aria-hidden />}{h ? horaFalada(h) : feito ? "feito" : "Marcar feito"}
                  {feito && <small>feito{feito.feito_nome ? ` por ${feito.feito_nome.split(/\s+/)[0]}` : ""} {hora(feito.feito_em)}</small>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
