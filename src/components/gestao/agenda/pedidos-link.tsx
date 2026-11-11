"use client";

import { useEffect, useState } from "react";
import { Check, Clock, Link2, MessageCircle, X } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { AvatarPet, avisarMudanca, ok, useAvisos, useDados, useSomenteLeitura } from "@/components/gestao/ui";
import type { Database } from "@/lib/gestao/banco";
import { dataCurta, fmtTelefone, hora, inicioDoDia, linkWhatsApp, nomeDia } from "@/lib/gestao/util";
import "./pedidos-link.css";

type Pedido = Database["public"]["Tables"]["pedidos_agendamento"]["Row"];
type Respondido = { pedido: Pedido; servico: string | null; resposta: "aceito" | "recusado" };

const ESPECIE: Record<string, string> = { cao: "cão", gato: "gato", outro: "outro" };

/** "hoje", "amanhã" ou "sexta, 14/11" (para mostrar na tela). */
function quandoNaTela(inicio: string) {
  const d = new Date(inicio);
  const dif = Math.round((inicioDoDia(d).getTime() - inicioDoDia(new Date()).getTime()) / 864e5);
  return dif === 0 ? "hoje" : dif === 1 ? "amanhã" : `${nomeDia(d)}, ${dataCurta(d)}`;
}
/** "hoje", "amanhã" ou "na sexta, 14/11" (para caber numa frase). */
function quandoNaFrase(inicio: string) {
  const d = new Date(inicio);
  const dif = Math.round((inicioDoDia(d).getTime() - inicioDoDia(new Date()).getTime()) / 864e5);
  if (dif === 0) return "hoje";
  if (dif === 1) return "amanhã";
  const fimDeSemana = d.getDay() === 0 || d.getDay() === 6;
  return `${fimDeSemana ? "no" : "na"} ${nomeDia(d)}, ${dataCurta(d)}`;
}
const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0];

/**
 * Pedidos que chegaram pelo link de agendamento e esperam resposta.
 * Sem pedido, não aparece nada. Depois de aceitar ou recusar, fica um atalho para avisar o tutor no WhatsApp.
 */
export default function PedidosLink() {
  const { sb, petshop, equipe, servicos } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [quem, setQuem] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [respondidos, setRespondidos] = useState<Respondido[]>([]);

  const { dados, recarregar } = useDados(async () =>
    ok(await sb.from("pedidos_agendamento").select("*").eq("petshop_id", petshop.id).eq("status", "pendente").order("inicio").limit(100)) as Pedido[],
  [petshop.id]);

  // o pedido chega de fora: olha de novo a cada minuto e quando a pessoa volta para a aba
  useEffect(() => {
    const olhar = () => { if (document.visibilityState === "visible") void recarregar(); };
    const relogio = setInterval(olhar, 60_000);
    document.addEventListener("visibilitychange", olhar);
    return () => { clearInterval(relogio); document.removeEventListener("visibilitychange", olhar); };
  }, [recarregar]);

  const atendem = equipe.filter((p) => p.ativo && p.atende);
  const nomeServico = (id: string | null) => servicos.find((s) => s.id === id)?.nome ?? null;
  const corServico = (id: string | null) => servicos.find((s) => s.id === id)?.cor ?? "#f97316";
  const pendentes = (dados ?? []).filter((p) => !respondidos.some((r) => r.pedido.id === p.id));

  async function aceitar(p: Pedido) {
    if (somenteLeitura() || ocupado) return;
    const profissional = atendem.length > 1 ? quem[p.id] || undefined : atendem[0]?.id;
    setOcupado(p.id);
    try {
      ok(await sb.rpc("pedido_aceitar", { p_id: p.id, p_profissional: profissional }));
      setRespondidos((r) => [...r, { pedido: p, servico: nomeServico(p.servico_id), resposta: "aceito" }]);
      avisar(`Horário de ${p.pet_nome} marcado.`);
      avisarMudanca();
    } catch (e) {
      avisarErro(e);
      void recarregar();
    } finally { setOcupado(null); }
  }

  async function recusar(p: Pedido) {
    if (somenteLeitura() || ocupado) return;
    const sim = await confirmar({
      titulo: `Recusar o pedido de ${p.pet_nome}?`,
      texto: "O horário volta a ficar livre no link. Depois é só avisar o tutor pelo WhatsApp.",
      confirmar: "Recusar", perigo: true,
    });
    if (!sim) return;
    setOcupado(p.id);
    try {
      const linhas = ok(await sb.from("pedidos_agendamento").update({ status: "recusado" }).eq("id", p.id).eq("petshop_id", petshop.id).eq("status", "pendente").select("id"));
      if (!linhas.length) throw new Error("Esse pedido já foi respondido.");
      setRespondidos((r) => [...r, { pedido: p, servico: nomeServico(p.servico_id), resposta: "recusado" }]);
      avisar("Pedido recusado.");
      void recarregar();
    } catch (e) {
      avisarErro(e);
      void recarregar();
    } finally { setOcupado(null); }
  }

  function mensagem(r: Respondido) {
    const { pedido: p } = r;
    const oi = `Oi, ${primeiroNome(p.tutor_nome)}! Aqui é do ${petshop.nome}.`;
    const oQue = r.servico ? `${r.servico} de ${p.pet_nome}` : `horário de ${p.pet_nome}`;
    return r.resposta === "aceito"
      ? `${oi} Está confirmado: ${oQue} ${quandoNaFrase(p.inicio)}, às ${hora(p.inicio)}. Esperamos vocês!`
      : `${oi} Recebemos o seu pedido para ${p.pet_nome}, mas ${quandoNaFrase(p.inicio)}, às ${hora(p.inicio)}, não vamos conseguir atender. Podemos ver outro horário? Me diga os dias e períodos que ficam bons para você.`;
  }

  if (!pendentes.length && !respondidos.length) return null;

  return (
    <section className="g-pl" aria-label="Pedidos pelo link">
      <div className="g-pl-t">
        <span className="g-pl-ico" aria-hidden><Link2 /></span>
        <div>
          <h2>Pedidos pelo link</h2>
          <p className="g-p">{pendentes.length === 0 ? "Tudo respondido. Falta só avisar o tutor." : pendentes.length === 1 ? "1 tutor espera a sua resposta." : `${pendentes.length} tutores esperam a sua resposta.`}</p>
        </div>
        {pendentes.length > 0 && <span className="g-tag laranja">{pendentes.length}</span>}
      </div>

      <div className="g-pl-lista">
        {respondidos.map((r) => {
          const p = r.pedido;
          const zap = linkWhatsApp(p.telefone, mensagem(r));
          return (
            <article key={p.id} className={`g-pl-item respondido ${r.resposta}`}>
              <div className="g-pl-quem">
                <span className="g-pl-feito" aria-hidden>{r.resposta === "aceito" ? <Check /> : <X />}</span>
                <div className="g-pl-nome">
                  <b>{p.pet_nome}</b>
                  <span>{r.resposta === "aceito" ? `Marcado para ${quandoNaTela(p.inicio)}, às ${hora(p.inicio)}.` : "Pedido recusado."} Avise {primeiroNome(p.tutor_nome)}.</span>
                </div>
              </div>
              <div className="g-pl-acoes">
                {zap && (
                  <a className="g-btn zap p" href={zap} target="_blank" rel="noopener noreferrer">
                    <MessageCircle />{r.resposta === "aceito" ? "Confirmar no WhatsApp" : "Sugerir outro horário"}
                  </a>
                )}
                <button type="button" className="g-btn fantasma p" onClick={() => setRespondidos((l) => l.filter((x) => x.pedido.id !== p.id))}>Fechar</button>
              </div>
            </article>
          );
        })}

        {pendentes.map((p) => {
          const servico = nomeServico(p.servico_id);
          const passou = new Date(p.inicio).getTime() < Date.now();
          const detalhes = [ESPECIE[p.especie] ?? null, p.porte ? `porte ${p.porte}` : null].filter(Boolean).join(", ");
          return (
            <article key={p.id} className="g-pl-item" style={{ "--cor": corServico(p.servico_id) } as React.CSSProperties}>
              <div className="g-pl-quem">
                <AvatarPet pet={{ nome: p.pet_nome, especie: p.especie }} />
                <div className="g-pl-nome">
                  <b>{p.pet_nome}{detalhes && <small> · {detalhes}</small>}</b>
                  <span>{p.tutor_nome} · {fmtTelefone(p.telefone)}</span>
                </div>
              </div>
              <div className="g-pl-quando">
                <span className="g-pl-serv"><i aria-hidden />{servico ?? "Serviço"}</span>
                <span className="g-pl-hora"><Clock aria-hidden />{quandoNaTela(p.inicio)}, {hora(p.inicio)}</span>
                {passou && <span className="g-tag vermelho">horário já passou</span>}
              </div>
              {p.obs && <p className="g-pl-obs">{p.obs}</p>}
              <div className="g-pl-acoes">
                {atendem.length > 1 && (
                  <select className="g-select g-pl-com" aria-label={`Quem atende ${p.pet_nome}`} value={quem[p.id] ?? ""} onChange={(e) => setQuem((q) => ({ ...q, [p.id]: e.target.value }))}>
                    <option value="">Quem atende? Decidir depois</option>
                    {atendem.map((x) => <option key={x.id} value={x.id}>Com {x.nome}</option>)}
                  </select>
                )}
                <button type="button" className="g-btn verde p" disabled={ocupado !== null} onClick={() => void aceitar(p)}><Check />{ocupado === p.id ? "Um instante…" : "Aceitar"}</button>
                <button type="button" className="g-btn sec p" disabled={ocupado !== null} onClick={() => void recusar(p)}>Recusar</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
