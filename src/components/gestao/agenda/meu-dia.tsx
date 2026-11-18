"use client";

import { useState } from "react";
import { Camera, ChevronRight, MoveRight, SquareKanban } from "lucide-react";
import Link from "@/components/gestao/link-depois";
import type { AgendamentoCompleto } from "@/lib/gestao/tipos";
import { STATUS_AGENDAMENTO } from "@/lib/gestao/tipos";
import { nomeDosServicos, servicosAMais } from "@/lib/gestao/servicos-do-horario";
import { alertasDoPet, colunaDe, NOME_DESTINO, ordemDoMeuDia, proximaEtapa, rotuloDoProximo, temTosa, type Destino, type Etapa, type LinhaQuadro } from "@/lib/gestao/quadro";
import { hora } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { AvatarPet, DICA_SO_CONSULTA, avisarMudanca, useAvisos, useDados, useSomenteLeitura } from "../ui";
import "@/app/(gestao)/gestao/app/agenda/quadro/quadro.css";

type Entrada = { agendamento_id: string; temperamento: string[] | null; cuidados: string | null };

/**
 * "Meus pets de hoje": o começo da tela Hoje de quem atende e não mexe com dinheiro (tosador, banhista).
 * Só os horários marcados com a pessoa (e os que estão sem profissional), na ordem do trabalho: quem está na mesa primeiro,
 * depois quem vai chegar, por último os entregues. Em cada pet: o alerta em vermelho, um botão para o próximo passo
 * (o mesmo do Quadro do dia: Chegou, Secagem, Pronto, Entregue) e o botão das fotos. Não mostra valores.
 */
export default function MeuDia({ ags, semConta, aoAbrir, aoMudar }: {
  /** os horários de hoje do pet shop (a tela Hoje já leu) */
  ags: AgendamentoCompleto[];
  /** concluídos sem conta fechada (a marca Falta cobrar) */
  semConta: Set<string>;
  aoAbrir: (id: string) => void;
  aoMudar: () => void;
}) {
  const { sb, petshop, eu, liberado } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [mexendo, setMexendo] = useState<string | null>(null);
  const [verTodos, setVerTodos] = useState(false);
  const meus = ags.filter((a) => !["cancelado", "faltou"].includes(a.status) && (a.profissional_id === eu.id || !a.profissional_id));
  const ids = meus.map((a) => a.id).join(",");
  const { dados, recarregar } = useDados(async () => {
    if (!ids) return { quadro: new Map<string, LinhaQuadro>(), entradas: new Map<string, Entrada>() };
    const lista = ids.split(",");
    const [q, e] = await Promise.all([
      sb.from("quadro_atendimento").select("agendamento_id, etapa, etapa_em, chegou_em, entregue_em").eq("petshop_id", petshop.id).in("agendamento_id", lista),
      sb.from("entradas").select("agendamento_id, temperamento, cuidados").eq("petshop_id", petshop.id).in("agendamento_id", lista),
    ]);
    return {
      quadro: new Map(((q.error ? [] : q.data ?? []) as (LinhaQuadro & { agendamento_id: string })[]).map((x) => [x.agendamento_id, { ...x, etapa: x.etapa as Etapa | null }])),
      entradas: new Map(((e.error ? [] : e.data ?? []) as Entrada[]).map((x) => [x.agendamento_id, x])),
    };
  }, [petshop.id, ids, meus.map((a) => a.status).join(",")]);

  async function mover(a: AgendamentoCompleto, para: Destino) {
    if (somenteLeitura() || mexendo) return;
    if (para === "entregue" && a.status === "em_atendimento") {
      const sim = await confirmar({
        titulo: `Entregar ${a.pets?.nome ?? "o pet"} ao tutor?`,
        texto: "O atendimento fica concluído. Se a conta ainda não foi fechada, ele aparece como Falta cobrar para quem cuida do caixa.",
        confirmar: "Entregar",
      });
      if (!sim) return;
    }
    setMexendo(a.id);
    try {
      const r = await sb.rpc("quadro_mover", { p_petshop: petshop.id, p_agendamento: a.id, p_para: para });
      if (r.error) throw new Error(r.error.message);
      avisar(`${a.pets?.nome ?? "Pet"}: ${NOME_DESTINO[para].toLowerCase()}.`);
      avisarMudanca();
      aoMudar();
      await recarregar();
    } catch (x) { avisarErro(x); void recarregar(); } finally { setMexendo(null); }
  }

  const quadro = dados?.quadro ?? new Map<string, LinhaQuadro>();
  const emOrdem = ordemDoMeuDia(meus, quadro);
  const abertos = emOrdem.filter((a) => colunaDe(a, quadro.get(a.id)) !== "entregue");
  const entregues = emOrdem.length - abertos.length;
  const mostrar = verTodos ? emOrdem : abertos;

  return (
    <section className="g-meu-dia" aria-label="Meus pets de hoje">
      <div className="g-card-t">
        <h2>Meus pets de hoje</h2>
        <Link className="g-btn fantasma p" href="/gestao/app/agenda/quadro"><SquareKanban />Quadro do dia</Link>
      </div>
      {!meus.length ? (
        <p className="g-card g-p" style={{ margin: 0 }}>Nenhum pet marcado com você hoje. Quando marcarem, ele aparece aqui.</p>
      ) : (
        <>
          <p className="g-muted g-p" style={{ margin: "0 0 8px" }}>
            {abertos.length === 0 ? "Todos os seus pets de hoje já foram entregues." : abertos.length === 1 ? "Falta 1 pet." : `Faltam ${abertos.length} pets.`}
            {entregues > 0 && abertos.length > 0 ? ` ${entregues === 1 ? "1 já foi entregue" : `${entregues} já foram entregues`}.` : ""}
          </p>
          <div className="g-meu-dia-lista">
            {mostrar.map((a) => {
              const q = quadro.get(a.id) ?? null;
              const col = colunaDe(a, q);
              const proximo = proximaEtapa(a, q, temTosa([a.servicos?.nome, ...servicosAMais(a).map((s) => s.servicos?.nome)]));
              const alertas = alertasDoPet(a.pets?.alertas, dados?.entradas.get(a.id));
              const onde = col === "esperando" ? null : col === "entregue" ? "Entregue" : q?.etapa ? NOME_DESTINO[q.etapa] : "Em atendimento";
              return (
                <article key={a.id} className={`g-qd-card${mexendo === a.id ? " ocupado" : ""}`} style={{ "--cor": a.servicos?.cor ?? "#f97316" } as React.CSSProperties}>
                  <button type="button" className="g-qd-quem" onClick={() => aoAbrir(a.id)} aria-label={`Abrir o horário de ${a.pets?.nome ?? "pet"}`}>
                    {a.pets && <AvatarPet pet={a.pets} tamanho="g" />}
                    <span className="t"><b className="nome">{a.pets?.nome ?? "Pet"}</b><span>{hora(a.inicio)} · {nomeDosServicos(a) ?? "Atendimento"}</span></span>
                    <ChevronRight aria-hidden className="seta" />
                  </button>
                  <div className="g-qd-tags">
                    {alertas.map((x) => <span key={x} className="g-tag vermelho">{x}</span>)}
                    {onde && <span className="g-tag azul">{onde}</span>}
                    {!a.profissional_id && <span className="g-tag">Sem profissional definido</span>}
                    {semConta.has(a.id) ? <span className="g-tag laranja">Falta cobrar</span>
                      : a.status === "concluido" && <span className={`g-tag ${STATUS_AGENDAMENTO.concluido.tom}`}>{STATUS_AGENDAMENTO.concluido.rotulo}</span>}
                  </div>
                  <div className="g-qd-bts g-meu-dia-bts">
                    {proximo && <button type="button" className="g-btn pri" disabled={mexendo === a.id || !liberado} title={liberado ? undefined : DICA_SO_CONSULTA} onClick={() => void mover(a, proximo)}><MoveRight />{rotuloDoProximo(proximo)}</button>}
                    {col !== "esperando" && <button type="button" className="g-btn sec" onClick={() => aoAbrir(a.id)} aria-label={`Fotos de ${a.pets?.nome ?? "pet"}`}><Camera />Fotos</button>}
                  </div>
                </article>
              );
            })}
          </div>
          {entregues > 0 && <button type="button" className="g-btn fantasma p" style={{ marginTop: 8 }} onClick={() => setVerTodos((v) => !v)}>{verTodos ? "Esconder os entregues" : `Ver os entregues (${entregues})`}</button>}
        </>
      )}
    </section>
  );
}
