"use client";

import { Selo } from "./marca";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, CheckCheck, ChevronDown, MessageCircle, Mic, RotateCcw, Square } from "lucide-react";
import { hora, isoDia } from "@/lib/gestao/util";
import { useGestao } from "./contexto";
import { avisarMudanca } from "./ui";

type Resumo = { titulo: string; linhas: [string, string][] };
type Proposta = { id: string; ferramenta: string; resumo: Resumo; estado: "pendente" | "sim" | "nao" };
type Link = { nome: string; texto: string; url: string };
type Item =
  | { tipo: "eu" | "ele" | "erro"; texto: string; quando?: string }
  | { tipo: "propostas"; lista: Proposta[]; enviado: boolean }
  | { tipo: "links"; lista: Link[] };
type Resposta = { mensagens: unknown[]; texto: string; propostas: Omit<Proposta, "estado">[]; parciais: unknown[]; links: Link[]; mudou: boolean; erro?: string; mensagem?: string };

/** A conversa continua enquanto o aplicativo está aberto, mesmo fechando e abrindo o painel. */
const memoria: { petshop: string | null; itens: Item[]; mensagens: unknown[]; parciais: unknown[] } = { petshop: null, itens: [], mensagens: [], parciais: [] };

// Ditado por voz do navegador (Chrome, Edge, Safari). Sem ele, a pessoa usa o microfone do teclado.
type Reconhecedor = {
  lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((e: { error: string }) => void) | null;
};
function criarReconhecedor(): Reconhecedor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => Reconhecedor; webkitSpeechRecognition?: new () => Reconhecedor };
  const Classe = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  return Classe ? new Classe() : null;
}

const SUGESTOES = ["Marca banho da Mel sexta às 10h", "Que horários tenho livres amanhã?", "Quem não vem há mais de um mês?", "Entrou 10 sacos de ração a 140 cada"];
const SUGESTOES_DINHEIRO = ["Quanto entrou essa semana?", "Recebi 60 no Pix do banho do Thor"];

/** Painel do Mozart: a pessoa fala ou escreve, ele mostra o que vai fazer e só grava depois do Confirmar. */
export default function Assistente({ pedidoInicial, aoFechar }: { pedidoInicial?: string; aoFechar: () => void }) {
  const { sb, petshop, eu, cuidoDoFinanceiro: vejoFinanceiro } = useGestao();
  if (memoria.petshop !== petshop.id) { memoria.petshop = petshop.id; memoria.itens = []; memoria.mensagens = []; memoria.parciais = []; }
  const [itens, setItens] = useState<Item[]>(memoria.itens);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [temVoz, setTemVoz] = useState(false);
  const rec = useRef<Reconhecedor | null>(null);
  const falado = useRef("");
  const fim = useRef<HTMLDivElement>(null);
  const jaPediu = useRef(false);

  const guardar = (novos: Item[]) => { memoria.itens = novos; setItens(novos); };
  const acrescentar = (...novos: Item[]) => guardar([...memoria.itens, ...novos]);

  useEffect(() => { setTemVoz(Boolean(criarReconhecedor())); return () => rec.current?.abort(); }, []);
  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [itens, pensando]);
  useEffect(() => {
    // no celular a conversa cobre a tela e trava a rolagem de trás; no computador é uma janelinha e a tela segue livre
    const antes = document.documentElement.style.overflow;
    if (window.matchMedia("(max-width: 719px)").matches) document.documentElement.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    document.addEventListener("keydown", tecla);
    return () => { document.documentElement.style.overflow = antes; document.removeEventListener("keydown", tecla); };
  }, [aoFechar]);

  const chamar = useCallback(async (corpo: Record<string, unknown>) => {
    setPensando(true);
    try {
      const { data } = await sb.auth.getSession();
      const agora = new Date();
      const r = await fetch("/api/gestao/assistente", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({
          petshopId: petshop.id, mensagens: memoria.mensagens,
          agora: `${isoDia(agora)}T${String(agora.getHours()).padStart(2, "0")}:${String(agora.getMinutes()).padStart(2, "0")}`,
          fusoMin: -agora.getTimezoneOffset(), ...corpo,
        }),
      });
      const j = (await r.json().catch(() => null)) as Resposta | null;
      if (!r.ok || !j || j.erro) { acrescentar({ tipo: "erro", texto: j?.mensagem ?? "Não consegui falar com o Mozart agora. Tente de novo em instantes." }); return; }
      memoria.mensagens = j.mensagens;
      memoria.parciais = j.parciais ?? [];
      const novos: Item[] = [];
      if (j.texto && !(j.propostas.length && j.texto === "Pronto.")) novos.push({ tipo: "ele", texto: j.texto, quando: hora(new Date()) });
      if (j.links?.length) novos.push({ tipo: "links", lista: j.links });
      if (j.propostas.length) novos.push({ tipo: "propostas", enviado: false, lista: j.propostas.map((p) => ({ ...p, estado: "pendente" as const })) });
      acrescentar(...novos);
      if (j.mudou) avisarMudanca();
    } catch {
      acrescentar({ tipo: "erro", texto: "Sem conexão. Confira a internet e tente de novo." });
    } finally { setPensando(false); }
  }, [sb, petshop.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const temPendente = itens.some((i) => i.tipo === "propostas" && !i.enviado);

  const enviar = useCallback((t: string) => {
    const limpo = t.trim();
    if (!limpo || pensando) return;
    setTexto("");
    // um pedido novo com cartões em aberto descarta os cartões
    const abertos = memoria.itens.find((i) => i.tipo === "propostas" && !i.enviado);
    if (abertos && abertos.tipo === "propostas") {
      guardar(memoria.itens.map((i) => (i === abertos ? { ...abertos, enviado: true, lista: abertos.lista.map((p) => ({ ...p, estado: p.estado === "pendente" ? ("nao" as const) : p.estado })) } : i)));
      acrescentar({ tipo: "eu", texto: limpo, quando: hora(new Date()) });
      void (async () => {
        await chamar({ decisoes: abertos.lista.map((p) => ({ id: p.id, ok: false })), parciais: memoria.parciais });
        await chamar({ texto: limpo });
      })();
      return;
    }
    acrescentar({ tipo: "eu", texto: limpo, quando: hora(new Date()) });
    void chamar({ texto: limpo });
  }, [pensando, chamar]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pedidoInicial && !jaPediu.current) { jaPediu.current = true; enviar(pedidoInicial); }
  }, [pedidoInicial, enviar]);

  function decidir(grupo: Extract<Item, { tipo: "propostas" }>, id: string, sim: boolean) {
    const lista = grupo.lista.map((p) => (p.id === id ? { ...p, estado: sim ? ("sim" as const) : ("nao" as const) } : p));
    const completo = lista.every((p) => p.estado !== "pendente");
    guardar(memoria.itens.map((i) => (i === grupo ? { ...grupo, lista, enviado: completo } : i)));
    if (completo) void chamar({ decisoes: lista.map((p) => ({ id: p.id, ok: p.estado === "sim" })), parciais: memoria.parciais });
  }

  function alternarVoz() {
    if (ouvindo) { rec.current?.stop(); return; }
    const r = criarReconhecedor();
    if (!r) return;
    rec.current = r;
    falado.current = "";
    r.lang = "pt-BR"; r.continuous = false; r.interimResults = true;
    r.onresult = (e) => {
      let t = "";
      for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript;
      falado.current = t;
      setTexto(t);
    };
    r.onerror = (e) => {
      setOuvindo(false);
      if (e.error === "not-allowed" || e.error === "service-not-allowed") acrescentar({ tipo: "erro", texto: "O microfone está bloqueado neste aparelho. Libere nas permissões do navegador ou use o microfone do teclado." });
    };
    r.onend = () => { setOuvindo(false); if (falado.current.trim()) enviar(falado.current); };
    try { r.start(); setOuvindo(true); } catch { setOuvindo(false); }
  }

  function novaConversa() {
    memoria.itens = []; memoria.mensagens = []; memoria.parciais = [];
    setItens([]);
  }

  const sugestoes = [...SUGESTOES.slice(0, 2), ...(vejoFinanceiro ? SUGESTOES_DINHEIRO.slice(0, 1) : []), SUGESTOES[2]];

  const primeiro = eu.nome.split(" ")[0];

  return (
    <div className="g-ass" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <section className="g-ass-painel" role="dialog" aria-label="Conversa com o Mozart">
        <header className="g-ass-topo">
          <span className="foto"><Selo tamanho={42} /><i aria-hidden /></span>
          <div><b>Mozart</b><span>{pensando ? "digitando…" : ouvindo ? "ouvindo você…" : `online · ${petshop.nome}`}</span></div>
          {itens.length > 0 && <button className="g-ico" onClick={novaConversa} aria-label="Começar conversa nova" title="Conversa nova"><RotateCcw /></button>}
          <button className="g-ico" style={itens.length ? { marginLeft: 0 } : undefined} onClick={aoFechar} aria-label="Fechar a conversa" title="Fechar"><ChevronDown /></button>
        </header>

        <div className="g-ass-conversa" aria-live="polite">
          <span className="g-ass-dia">Hoje</span>
          <div className="g-bolha ela rabo">Oi, {primeiro}! Sou o Mozart, cuido da agenda, dos clientes e das contas com você. {temVoz ? "Pode falar no microfone ou escrever" : "Pode escrever, ou ditar pelo microfone do teclado"}, do seu jeito.</div>
          <div className="g-bolha ela">Antes de gravar qualquer coisa eu te mostro e você confirma. O que vai ser?</div>
          {!itens.length && (
            <div className="g-ass-rapidas">
              {sugestoes.map((s) => <button key={s} onClick={() => enviar(s)}>{s}</button>)}
            </div>
          )}
          {itens.map((item, i) => item.tipo === "propostas" ? (
            item.lista.map((p) => (
              <div key={p.id} className={`g-proposta${p.estado === "sim" ? " feita" : p.estado === "nao" ? " descartada" : ""}`}>
                <div className="cab"><b>{p.resumo.titulo}</b>{p.estado === "sim" && <span className="g-tag verde"><Check size={13} />confirmado</span>}{p.estado === "nao" && <span className="g-tag">descartado</span>}</div>
                <dl>{p.resumo.linhas.map(([k, v], n) => <div key={n} style={{ display: "contents" }}><dt>{k}</dt><dd style={k === "Atenção" ? { color: "var(--g-vermelho)" } : undefined}>{v}</dd></div>)}</dl>
                {p.estado === "pendente" && (
                  <div className="bts">
                    <button className="g-btn sec" disabled={pensando} onClick={() => decidir(item, p.id, false)}>Agora não</button>
                    <button className="g-btn pri" disabled={pensando} onClick={() => decidir(item, p.id, true)}><Check />Pode fazer</button>
                  </div>
                )}
              </div>
            ))
          ) : item.tipo === "links" ? (
            <div key={i} className="g-proposta">
              <div className="cab"><b>Mensagens prontas</b><span className="g-tag">toque para abrir o WhatsApp</span></div>
              <div className="g-pilha p">
                {item.lista.map((l, n) => (
                  <a key={n} className="g-btn zap" href={l.url} target="_blank" rel="noopener noreferrer" title={l.texto} style={{ justifyContent: "flex-start" }}><MessageCircle />{l.nome}</a>
                ))}
              </div>
            </div>
          ) : (
            <div key={i} className={`g-bolha ${item.tipo === "eu" ? "eu" : "ela"}${item.tipo === "erro" ? " erro" : ""}${itens[i - 1]?.tipo !== item.tipo ? " rabo" : ""}`}>
              {item.texto}
              {item.quando && <span className="h">{item.quando}{item.tipo === "eu" && <CheckCheck size={14} />}</span>}
            </div>
          ))}
          {pensando && <div className="g-bolha ela rabo pensa" aria-label="Mozart está digitando"><i /><i /><i /></div>}
          <div ref={fim} />
        </div>

        <form className="g-ass-entrada" onSubmit={(e) => { e.preventDefault(); enviar(texto); }}>
          <textarea rows={1} value={texto} placeholder={ouvindo ? "Estou ouvindo…" : temPendente ? "Confirme acima ou peça um ajuste" : "Mensagem"} aria-label="Seu pedido"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(texto); } }} />
          {texto.trim() && !ouvindo ? (
            <button className="g-mic enviar" disabled={pensando} aria-label="Enviar"><ArrowUp /></button>
          ) : temVoz ? (
            <button type="button" className={`g-mic${ouvindo ? " ouvindo" : ""}`} disabled={pensando} onClick={alternarVoz} aria-label={ouvindo ? "Parar de ouvir" : "Falar"}>{ouvindo ? <Square /> : <Mic />}</button>
          ) : (
            <button className="g-mic enviar" disabled aria-label="Enviar"><ArrowUp /></button>
          )}
        </form>
      </section>
    </div>
  );
}
