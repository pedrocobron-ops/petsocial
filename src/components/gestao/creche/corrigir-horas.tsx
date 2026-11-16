"use client";

import { useState } from "react";
import { Clock } from "lucide-react";
import { dataCompleta, isoDia } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { AvatarPet, avisarMudanca, Campo, Folha, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";

/** Quem corrige a hora de chegada e de saída: o dono e quem cuida do financeiro (a hora mexe na taxa de busca fora do horário). */
export const usePodeCorrigirHoras = () => { const { souDono, cuidoDoFinanceiro } = useGestao(); return souDono || cuidoDoFinanceiro; };

type EstadiaDaHora = { id: string; tipo: string; status: string; entrada: string; saida: string | null; mensalista?: string | null; pets?: { nome: string; foto?: string | null; especie?: string | null } | null };

const hhmm = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; };
const comHora = (iso: string, h: string) => { const d = new Date(iso); const [a, b] = h.split(":").map(Number); d.setHours(a, b, 0, 0); return d; };
const isoLocal = (iso: string) => { const d = new Date(iso); return `${isoDia(d)}T${hhmm(iso)}`; };

/** Botão pequeno "Hora" para os cartões e linhas. */
export function BotaoCorrigirHoras({ aoTocar, nome }: { aoTocar: () => void; nome: string }) {
  const somenteLeitura = useSomenteLeitura();
  return <button type="button" className="g-btn fantasma p" onClick={(e) => { e.stopPropagation(); if (!somenteLeitura()) aoTocar(); }} aria-label={`Corrigir a hora de chegada ou de saída de ${nome}`}><Clock />Hora</button>;
}

/**
 * Corrigir a hora de chegada ou de saída (a monitora tocou Saiu atrasada, ou esqueceu de marcar a chegada na hora).
 * Fica anotado quem corrigiu, quando e por quê. Dia de creche: as duas horas ficam no mesmo dia. A taxa de busca fora do
 * horário de um mensalista é refeita pela hora nova enquanto não foi cobrada (o banco decide; nada é cobrado aqui).
 */
export function FolhaCorrigirHoras({ estadia: e, aoFechar, aoSalvo }: { estadia: EstadiaDaHora; aoFechar: () => void; aoSalvo?: () => void }) {
  const { sb } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const nome = e.pets?.nome ?? "o pet";
  const creche = e.tipo === "creche";
  const [entrada, setEntrada] = useState(creche ? hhmm(e.entrada) : isoLocal(e.entrada));
  const [saida, setSaida] = useState(e.saida ? (creche ? hhmm(e.saida) : isoLocal(e.saida)) : "");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const { dados: hist } = useDados(async () => ok(await sb.from("estadias_horas_hist").select("feito_em, entrada_antes, entrada_depois, saida_antes, saida_depois, motivo").eq("estadia_id", e.id).order("feito_em", { ascending: false }).limit(5)), [e.id]);

  const paraData = (v: string, base: string) => (creche ? comHora(base, v) : new Date(v));

  async function salvar() {
    if (salvando) return;
    if (!entrada || (e.status === "encerrada" && !saida)) return setErro("Preencha a hora.");
    if (motivo.trim().length < 3) return setErro("Escreva o motivo (ex.: a monitora marcou a saída mais tarde).");
    const novaEntrada = paraData(entrada, e.entrada), novaSaida = e.status === "encerrada" && saida ? paraData(saida, e.saida ?? e.entrada) : null;
    if (novaSaida && novaSaida <= novaEntrada) return setErro("A saída precisa ser depois da chegada.");
    setErro(null); setSalvando(true);
    try {
      const r = ok(await sb.rpc("estadia_corrigir_horas", {
        p_estadia: e.id, p_entrada: novaEntrada.toISOString(), p_saida: novaSaida ? novaSaida.toISOString() : undefined, p_motivo: motivo.trim(),
      })) as { igual?: boolean; taxa?: string };
      const taxa = r.taxa === "tirada" ? " A taxa de busca fora do horário saiu (a saída ficou dentro do horário)."
        : r.taxa === "refeita" ? " A saída continua fora do horário: a taxa voltou para decidir (cobrar ou não) em Check-outs para cobrar."
        : r.taxa === "anotada" ? " Com a hora nova, a saída ficou fora do horário: a taxa ficou para decidir em Check-outs para cobrar."
        : r.taxa === "mantida" ? " A taxa de busca fora do horário já tinha sido cobrada e continua." : "";
      avisar(r.igual ? "Nada mudou: as horas são as mesmas." : `Hora de ${nome} corrigida.${taxa}`);
      avisarMudanca(); aoSalvo?.(); aoFechar();
    } catch (x) { avisarErro(x); setSalvando(false); }
  }

  return (
    <Folha titulo={`Corrigir a hora de ${nome}`} aoFechar={aoFechar}
      rodape={<><button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button><button type="button" className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Salvando…" : "Salvar a hora"}</button></>}>
      <div className="g-form">
        <div className="g-fila" style={{ flexWrap: "nowrap" }}>
          <AvatarPet pet={e.pets ?? { nome: "?" }} />
          <p className="g-p g-cresce">{creche ? `Dia de creche de ${dataCompleta(e.entrada)}. ` : ""}Use quando a chegada ou a saída foi marcada fora da hora certa. Fica anotado quem corrigiu e por quê.</p>
        </div>
        <div className="dupla">
          <Campo rotulo="Chegou às"><input className="g-input" type={creche ? "time" : "datetime-local"} value={entrada} onChange={(x) => { setEntrada(x.target.value); setErro(null); }} /></Campo>
          {e.status === "encerrada"
            ? <Campo rotulo="Saiu às"><input className="g-input" type={creche ? "time" : "datetime-local"} value={saida} onChange={(x) => { setSaida(x.target.value); setErro(null); }} /></Campo>
            : <p className="g-muted g-pp" style={{ alignSelf: "end" }}>Ainda na casa: a saída é marcada no Saiu.</p>}
        </div>
        <Campo rotulo="Motivo" dica="Fica anotado com o seu nome.">
          <input className="g-input" value={motivo} maxLength={200} onChange={(x) => { setMotivo(x.target.value); setErro(null); }} placeholder="Ex.: saiu às 18h50, a monitora marcou depois" />
        </Campo>
        {creche && e.mensalista && e.status === "encerrada" && <p className="g-muted g-pp">Se a taxa de busca fora do horário ainda não foi cobrada, ela é refeita pela hora nova.</p>}
        {erro && <p className="g-erro" role="alert">{erro}</p>}
        {hist && hist.length > 0 && (
          <div>
            <p className="g-rotulo">Correções anteriores</p>
            <ul className="g-cm-detalhes">
              {hist.map((h, i) => (
                <li key={i}>{dataCompleta(h.feito_em)}: {h.entrada_antes !== h.entrada_depois && h.entrada_antes && h.entrada_depois ? `chegada ${hhmm(h.entrada_antes)} → ${hhmm(h.entrada_depois)}` : ""}
                  {h.saida_antes !== h.saida_depois && h.saida_antes && h.saida_depois ? ` saída ${hhmm(h.saida_antes)} → ${hhmm(h.saida_depois)}` : ""} · {h.motivo}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Folha>
  );
}
