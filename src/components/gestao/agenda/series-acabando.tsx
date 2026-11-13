"use client";

import { useState } from "react";
import { Repeat } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { avisarMudanca, useAvisos, useDados, useSomenteLeitura } from "@/components/gestao/ui";
import type { Banco } from "@/lib/gestao/supabase";
import { dataCompleta, dataCurta, hora, isoDia, nomeDia } from "@/lib/gestao/util";
import { Tile } from "../painel";
import "./series-acabando.css";

/**
 * Repetição "até eu cancelar". No banco a série continua tendo fim (um número fechado de horários, como sempre);
 * a tabela `series_agenda` só guarda que a pessoa quer continuar. Quando faltam poucos horários, este cartão aparece
 * na Agenda e um toque marca os próximos (função `serie_continuar`). Nada é marcado sozinho.
 * Quem nunca escolheu "Até eu cancelar" não vê nada aqui.
 */
export const VEZES_POR_VEZ = 12;
type Serie = { serie_id: string; cada_semanas: number; ultimo: string; restantes: number; pet_id: string; pet_nome: string; tutor_nome: string | null; servico_nome: string | null };
const CADA: Record<number, string> = { 1: "toda semana", 2: "a cada 2 semanas", 4: "a cada 4 semanas" };

export type Continuou = { marcados: number; fechados: string[] };
/**
 * Marca os próximos horários de uma série. Devolve quantos marcou (0 quando outra pessoa já tinha continuado) e,
 * dos que marcou, os dias (AAAA-MM-DD) que caem em dia fechado do negócio, para a tela avisar.
 */
export async function continuarSerie(sb: Banco, serieId: string, ultimo: string): Promise<Continuou> {
  const r = await sb.rpc("serie_continuar", { p_serie: serieId, p_depois_de: ultimo, p_vezes: VEZES_POR_VEZ });
  if (r.error) throw new Error(r.error.message);
  const marcados = Number(r.data ?? 0);
  if (!marcados) return { marcados, fechados: [] };
  // os horários novos que caíram em dia marcado como fechado (falha aqui não desfaz nada: só fica sem o aviso)
  const novos = await sb.from("agendamentos").select("petshop_id, inicio").eq("serie_id", serieId).gt("inicio", ultimo).in("status", ["marcado", "confirmado"]).order("inicio").limit(60);
  const dias = [...new Set((novos.data ?? []).map((a) => isoDia(new Date(a.inicio))))];
  const loja = novos.data?.[0]?.petshop_id;
  if (!dias.length || !loja) return { marcados, fechados: [] };
  const f = await sb.from("dias_especiais").select("dia").eq("petshop_id", loja).eq("fechado", true).in("dia", dias).order("dia");
  return { marcados, fechados: (f.data ?? []).map((d) => d.dia) };
}
/** A série deixa de pedir para continuar (os horários que já estão marcados ficam como estão). */
export async function encerrarSerie(sb: Banco, petshopId: string, serieId: string) {
  return sb.from("series_agenda").update({ encerrada_em: new Date().toISOString() }).eq("serie_id", serieId).eq("petshop_id", petshopId).is("encerrada_em", null).select("serie_id");
}
export function textoContinuou({ marcados: n, fechados }: Continuou) {
  if (n === 0) return "Essa repetição já tinha sido continuada.";
  const base = n === 1 ? "Mais 1 horário marcado." : `Mais ${n} horários marcados.`;
  if (fechados.length) {
    const datas = fechados.map((d) => dataCurta(d));
    const lista = datas.length === 1 ? datas[0] : `${datas.slice(0, -1).join(", ")} e ${datas[datas.length - 1]}`;
    return `${base} Atenção: ${fechados.length === 1 ? `o de ${lista} caiu em dia fechado` : `os de ${lista} caíram em dia fechado`}. Abra ${fechados.length === 1 ? "esse horário" : "esses horários"} na agenda para mudar o dia ou desmarcar.`;
  }
  return n === 1 ? base : `${base} Confira na agenda os dias de feriado ou de folga.`;
}

export default function SeriesAcabando({ aoMudar }: { aoMudar: () => void }) {
  const { sb, petshop, posso } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const podeMarcar = posso("agenda");
  const { dados, recarregar } = useDados(async () => {
    if (!podeMarcar) return [] as Serie[];
    const r = await sb.rpc("series_acabando", { p: petshop.id });
    return (r.error ? [] : r.data ?? []) as Serie[]; // banco antes da atualização: sem aviso
  }, [petshop.id, podeMarcar]);
  if (!dados?.length) return null;

  async function continuar(s: Serie) {
    if (somenteLeitura() || ocupado) return;
    setOcupado(s.serie_id);
    try {
      avisar(textoContinuou(await continuarSerie(sb, s.serie_id, s.ultimo)));
      avisarMudanca(); aoMudar(); void recarregar();
    } catch (e) { avisarErro(e); } finally { setOcupado(null); }
  }
  async function deixar(s: Serie) {
    if (somenteLeitura() || ocupado) return;
    const sim = await confirmar({ titulo: `Deixar a repetição de ${s.pet_nome} terminar?`, texto: `Os horários já marcados continuam na agenda, até ${dataCompleta(s.ultimo)}. O sistema só para de avisar. Para voltar a repetir, marque um horário novo com Repetir.`, confirmar: "Deixar terminar" });
    if (!sim) return;
    setOcupado(s.serie_id);
    try {
      const r = await encerrarSerie(sb, petshop.id, s.serie_id);
      if (r.error) throw new Error(r.error.message);
      void recarregar();
    } catch (e) { avisarErro(e); } finally { setOcupado(null); }
  }

  return (
    <section className="g-card g-pilha p" aria-label="Repetições que estão acabando">
      <div className="g-card-t"><h3><Tile icone={Repeat} tom="pessego" tamanho="p" />Repetições que estão acabando</h3><span className="g-muted g-pp">marcadas como Até eu cancelar</span></div>
      <div className="g-lista">
        {dados.map((s) => {
          const passou = new Date(s.ultimo).getTime() < Date.now();
          return (
            <div key={s.serie_id} className="g-linha g-sa-linha">
              <span className="t">
                <b>{s.pet_nome}{s.servico_nome ? ` · ${s.servico_nome}` : ""}</b>
                <span>{CADA[s.cada_semanas] ?? "repete"}, {nomeDia(new Date(s.ultimo))} às {hora(s.ultimo)}{s.tutor_nome ? ` · ${s.tutor_nome}` : ""}</span>
                <span>{passou ? `O último horário foi em ${dataCompleta(s.ultimo)}.` : `${s.restantes === 1 ? "Falta 1 horário" : `Faltam ${s.restantes} horários`}: o último é em ${dataCompleta(s.ultimo)}.`}</span>
              </span>
              <span className="d">
                <button type="button" className="g-btn verde p" disabled={ocupado !== null} onClick={() => void continuar(s)}>{ocupado === s.serie_id ? "Um instante…" : `Marcar mais ${VEZES_POR_VEZ}`}</button>
                <button type="button" className="g-btn fantasma p" disabled={ocupado !== null} onClick={() => void deixar(s)}>Deixar terminar</button>
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
