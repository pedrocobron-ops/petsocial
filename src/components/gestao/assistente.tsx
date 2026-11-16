"use client";

import { Selo } from "./marca";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, CheckCheck, ChevronDown, MessageCircle, RotateCcw, SlidersHorizontal, Volume2, VolumeX } from "lucide-react";
import { hora, isoDia } from "@/lib/gestao/util";
import Link from "next/link";
import { useGestao } from "./contexto";
import { avisarMudanca } from "./ui";
import { BotaoMic, FaixaVoz, falar, guardarEnviarSozinho, guardarLerRespostas, lerEnviarSozinho, lerLerRespostas, pararDeFalar, temLeitura, useDitado } from "./voz";

type Resumo = { titulo: string; linhas: [string, string][] };
type Proposta = { id: string; ferramenta: string; resumo: Resumo; estado: "pendente" | "sim" | "nao" };
type LinkZap = { nome: string; texto: string; url: string };
type Item =
  | { tipo: "eu" | "ele" | "erro"; texto: string; quando?: string; saidas?: boolean }
  | { tipo: "propostas"; lista: Proposta[]; enviado: boolean }
  | { tipo: "links"; lista: LinkZap[] };
type Resposta = { mensagens: unknown[]; texto: string; propostas: Omit<Proposta, "estado">[]; parciais: unknown[]; links: LinkZap[]; mudou: boolean; erro?: string; mensagem?: string };

/** A conversa continua enquanto o aplicativo está aberto, mesmo fechando e abrindo o painel. */
const memoria: { petshop: string | null; itens: Item[]; mensagens: unknown[]; parciais: unknown[] } = { petshop: null, itens: [], mensagens: [], parciais: [] };

const SUGESTOES = ["Marca banho da Mel sexta às 10h", "Que horários tenho livres amanhã?", "Quem não vem há mais de um mês?", "Entrou 10 sacos de ração a 140 cada"];
const SUGESTOES_DINHEIRO = ["Quanto entrou essa semana?", "Recebi 60 no Pix do banho do Thor"];

/** Painel do Mozart: a pessoa fala ou escreve, ele mostra o que vai fazer e só grava depois do Confirmar. */
export default function Assistente({ pedidoInicial, aoFechar }: { pedidoInicial?: string; aoFechar: () => void }) {
  const { sb, petshop, eu, posso, cuidoDoFinanceiro: vejoFinanceiro } = useGestao();
  if (memoria.petshop !== petshop.id) { memoria.petshop = petshop.id; memoria.itens = []; memoria.mensagens = []; memoria.parciais = []; }
  const [itens, setItens] = useState<Item[]>(memoria.itens);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  // escrito enquanto o Mozart ainda respondia: espera na fila (visível) e vai sozinho quando ele terminar
  const [fila, setFila] = useState<string | null>(null);
  const [avisoFila, setAvisoFila] = useState<string | null>(null);
  const respondidos = useRef(new Set<string>());
  // voz: depois de falar, o texto fica 2 s na caixa ("Enviando… · Editar") para corrigir uma palavra mal ouvida
  const caixa = useRef<HTMLTextAreaElement>(null);
  const [contagem, setContagem] = useState<number | null>(null);
  const relogioEnvio = useRef<number | undefined>(undefined);
  const [enviarSozinho, setEnviarSozinho] = useState(lerEnviarSozinho);
  const [lerRespostas, setLerRespostas] = useState(lerLerRespostas);
  const lerAgora = useRef(lerRespostas);
  lerAgora.current = lerRespostas;
  const [ajustesVoz, setAjustesVoz] = useState(false);
  const [lendo, setLendo] = useState<number | null>(null);
  const [podeLer, setPodeLer] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const jaPediu = useRef(false);

  const guardar = (novos: Item[]) => { memoria.itens = novos; setItens(novos); };
  const acrescentar = (...novos: Item[]) => guardar([...memoria.itens, ...novos]);

  useEffect(() => {
    setPodeLer(temLeitura());
    return () => { window.clearInterval(relogioEnvio.current); pararDeFalar(); };
  }, []);
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
      // o Mozart não respondeu: a frase do servidor (sem detalhe técnico) e o caminho para seguir sem ele
      if (!r.ok || !j || j.erro) { acrescentar({ tipo: "erro", texto: j?.mensagem ?? "Não consegui falar com o Mozart agora. Tente de novo em instantes.", saidas: r.status >= 500 }); return; }
      memoria.mensagens = j.mensagens;
      memoria.parciais = j.parciais ?? [];
      const novos: Item[] = [];
      if (j.texto && !(j.propostas.length && j.texto === "Pronto.")) {
        novos.push({ tipo: "ele", texto: j.texto, quando: hora(new Date()) });
        if (lerAgora.current) { const n = memoria.itens.length; setLendo(n); falar(j.texto, () => setLendo((x) => (x === n ? null : x))); }
      }
      if (j.links?.length) novos.push({ tipo: "links", lista: j.links });
      if (j.propostas.length) novos.push({ tipo: "propostas", enviado: false, lista: j.propostas.map((p) => ({ ...p, estado: "pendente" as const })) });
      acrescentar(...novos);
      if (j.mudou) avisarMudanca();
    } catch {
      acrescentar({ tipo: "erro", texto: "Sem conexão. Confira a internet e tente de novo." });
    } finally { setPensando(false); }
  }, [sb, petshop.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const temPendente = itens.some((i) => i.tipo === "propostas" && !i.enviado);

  const cancelarEnvio = useCallback(() => { window.clearInterval(relogioEnvio.current); relogioEnvio.current = undefined; setContagem(null); }, []);

  const enviar = useCallback((t: string) => {
    const limpo = t.trim();
    cancelarEnvio();
    if (!limpo) return;
    setTexto("");
    setAvisoFila(null);
    // o Mozart ainda está respondendo (por exemplo, fazendo um "Pode fazer"): a mensagem não se perde, entra na fila
    if (pensando) { setFila((f) => (f ? `${f}\n${limpo}` : limpo)); return; }
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
  }, [pensando, chamar, cancelarEnvio]); // eslint-disable-line react-hooks/exhaustive-deps
  const enviarAgora = useRef(enviar);
  enviarAgora.current = enviar;
  const textoAgora = useRef(texto);
  textoAgora.current = texto;

  const ditado = useDitado(
    (t) => setTexto(t),
    (t, falou) => {
      if (!falou) return;
      setTexto(t);
      if (!enviarSozinho) { caixa.current?.focus(); return; }
      // conta 2 s na tela; tocar na caixa, escrever ou Editar cancela
      let falta = 2;
      setContagem(falta);
      window.clearInterval(relogioEnvio.current);
      relogioEnvio.current = window.setInterval(() => {
        falta -= 1;
        if (falta > 0) { setContagem(falta); return; }
        window.clearInterval(relogioEnvio.current);
        relogioEnvio.current = undefined;
        setContagem(null);
        enviarAgora.current(textoAgora.current);
      }, 1000);
    },
  );
  const editar = () => { cancelarEnvio(); const c = caixa.current; if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); } };

  function ouvirResposta(n: number, t: string) {
    if (lendo === n) { pararDeFalar(); setLendo(null); return; }
    setLendo(n);
    falar(t, () => setLendo((x) => (x === n ? null : x)));
  }

  // o Mozart terminou: manda o que ficou na fila. Se ele trouxe cartões novos para confirmar, não descarta os cartões
  // sem a pessoa ver: a mensagem volta para a caixa, com o aviso
  useEffect(() => {
    if (pensando || !fila) return;
    const t = fila;
    setFila(null);
    if (memoria.itens.some((i) => i.tipo === "propostas" && !i.enviado)) {
      setTexto((atual) => (atual.trim() ? `${t}\n${atual}` : t));
      setAvisoFila("O Mozart trouxe algo para confirmar. Sua mensagem voltou para a caixa: confirme acima ou toque em enviar.");
      return;
    }
    enviar(t);
  }, [pensando, fila, enviar]);

  useEffect(() => {
    if (pedidoInicial && !jaPediu.current) { jaPediu.current = true; enviar(pedidoInicial); }
  }, [pedidoInicial, enviar]);

  function decidir(grupo: Extract<Item, { tipo: "propostas" }>, id: string, sim: boolean) {
    // toque duplo em "Pode fazer": o segundo toque chega antes de a tela desligar o botão; a resposta só vai uma vez
    const grupoId = grupo.lista.map((p) => p.id).join(",");
    if (respondidos.current.has(grupoId)) return;
    const lista = grupo.lista.map((p) => (p.id === id ? { ...p, estado: sim ? ("sim" as const) : ("nao" as const) } : p));
    const completo = lista.every((p) => p.estado !== "pendente");
    if (completo) respondidos.current.add(grupoId);
    guardar(memoria.itens.map((i) => (i === grupo ? { ...grupo, lista, enviado: completo } : i)));
    if (completo) void chamar({ decisoes: lista.map((p) => ({ id: p.id, ok: p.estado === "sim" })), parciais: memoria.parciais });
  }

  function novaConversa() {
    cancelarEnvio(); pararDeFalar(); setLendo(null);
    memoria.itens = []; memoria.mensagens = []; memoria.parciais = [];
    setItens([]);
  }

  const sugestoes = [...SUGESTOES.slice(0, 2), ...(vejoFinanceiro ? SUGESTOES_DINHEIRO.slice(0, 1) : []), SUGESTOES[2]];

  const primeiro = eu.nome.split(" ")[0];
  // a última resposta foi o servidor dizendo que o Mozart está fora do ar: o topo não diz "online"
  const ultimo = itens[itens.length - 1];
  const foraDoAr = Boolean(ultimo && ultimo.tipo === "erro" && ultimo.saidas);

  return (
    <div className="g-ass" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <section className="g-ass-painel" role="dialog" aria-label="Conversa com o Mozart">
        <header className="g-ass-topo">
          <span className={`foto${foraDoAr ? " fora" : ""}`}><Selo tamanho={42} /><i aria-hidden /></span>
          <div><b>Mozart</b><span>{ditado.ouvindo ? "ouvindo você…" : pensando ? "digitando…" : foraDoAr ? `fora do ar agora · ${petshop.nome}` : `online · ${petshop.nome}`}</span></div>
          {(ditado.suportado || podeLer) && <button className="g-ico" onClick={() => setAjustesVoz((a) => !a)} aria-label="Ajustes da voz" aria-expanded={ajustesVoz} title="Ajustes da voz"><SlidersHorizontal /></button>}
          {itens.length > 0 && <button className="g-ico" style={ditado.suportado || podeLer ? { marginLeft: 0 } : undefined} onClick={novaConversa} aria-label="Começar conversa nova" title="Conversa nova"><RotateCcw /></button>}
          <button className="g-ico" style={itens.length || ditado.suportado || podeLer ? { marginLeft: 0 } : undefined} onClick={aoFechar} aria-label="Fechar a conversa" title="Fechar"><ChevronDown /></button>
        </header>
        {ajustesVoz && (
          <div className="g-ass-ajustes">
            {ditado.suportado && (
              <label className="g-check">
                <input type="checkbox" checked={enviarSozinho} onChange={(e) => { setEnviarSozinho(e.target.checked); guardarEnviarSozinho(e.target.checked); }} />
                <span>Enviar sozinho depois de falar<small>O texto fica 2 segundos na caixa para você corrigir.</small></span>
              </label>
            )}
            {podeLer && (
              <label className="g-check">
                <input type="checkbox" checked={lerRespostas} onChange={(e) => { setLerRespostas(e.target.checked); guardarLerRespostas(e.target.checked); if (!e.target.checked) { pararDeFalar(); setLendo(null); } }} />
                <span>Ler as respostas do Mozart em voz alta<small>Fica guardado neste aparelho.</small></span>
              </label>
            )}
          </div>
        )}

        <div className="g-ass-conversa" aria-live="polite">
          <span className="g-ass-dia">Hoje</span>
          <div className="g-bolha ela rabo">Oi, {primeiro}! Sou o Mozart, cuido da agenda, dos clientes e das contas com você. {ditado.suportado ? "Pode falar no microfone ou escrever" : "Pode escrever, ou ditar pelo microfone do teclado"}, do seu jeito.</div>
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
              {item.tipo === "erro" && item.saidas && (
                <span className="g-ass-saidas">
                  Enquanto isso:{" "}
                  {posso("agenda") && <><Link className="g-link alvo" href="/gestao/app/agenda?novo=1" onClick={aoFechar}>Marcar horário</Link>{" · "}</>}
                  <Link className="g-link alvo" href="/gestao/app/manual" onClick={aoFechar}>Ver o manual</Link>
                </span>
              )}
              {item.quando && <span className="h">
                {item.tipo === "ele" && podeLer && (
                  <button type="button" className="g-ass-ouvir" onClick={() => ouvirResposta(i, item.texto)} aria-label={lendo === i ? "Parar de ler" : "Ouvir esta resposta"} aria-pressed={lendo === i} title={lendo === i ? "Parar" : "Ouvir"}>
                    {lendo === i ? <VolumeX size={15} /> : <Volume2 size={15} />}
                  </button>
                )}
                {item.quando}{item.tipo === "eu" && <CheckCheck size={14} />}</span>}
            </div>
          ))}
          {pensando && <div className="g-bolha ela rabo pensa" aria-label="Mozart está digitando"><i /><i /><i /></div>}
          {fila && (
            <div className="g-bolha eu rabo g-ass-fila" role="status">
              {fila}
              <span className="g-ass-fila-nota">Na fila: vai assim que o Mozart terminar.{" "}
                <button type="button" className="g-link" onClick={() => { setTexto((atual) => (atual.trim() ? `${fila}\n${atual}` : fila)); setFila(null); }}>Editar</button>
              </span>
            </div>
          )}
          {avisoFila && <p className="g-ass-fila-aviso" role="status">{avisoFila}</p>}
          <div ref={fim} />
        </div>

        <FaixaVoz ditado={ditado}>
          {contagem !== null && (
            <>
              <i className="g-voz-barra" aria-hidden />
              <b>Enviando… {contagem}</b>
              <button type="button" className="g-link" onClick={editar}>Editar</button>
            </>
          )}
        </FaixaVoz>
        <form className="g-ass-entrada" onSubmit={(e) => { e.preventDefault(); enviar(texto); }}>
          <textarea ref={caixa} rows={1} value={texto} placeholder={ditado.ouvindo ? "Estou ouvindo…" : pensando ? "Escreva: vai na fila" : temPendente ? "Confirme acima ou peça um ajuste" : "Mensagem"} aria-label="Seu pedido"
            readOnly={ditado.ouvindo}
            onPointerDown={() => { if (contagem !== null) cancelarEnvio(); }}
            onFocus={() => { if (contagem !== null) cancelarEnvio(); }}
            onChange={(e) => { cancelarEnvio(); setTexto(e.target.value); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(texto); } }} />
          {ditado.suportado && (ditado.ouvindo || !texto.trim()) && (
            <BotaoMic ditado={ditado} jaEscrito={() => textoAgora.current} antesDeComecar={() => { cancelarEnvio(); setLendo(null); }} />
          )}
          {(!ditado.suportado || (texto.trim() && !ditado.ouvindo)) && (
            <button className="g-mic enviar" disabled={!texto.trim()} aria-label={pensando ? "Enviar quando o Mozart terminar" : "Enviar"}><ArrowUp /></button>
          )}
        </form>
      </section>
    </div>
  );
}
