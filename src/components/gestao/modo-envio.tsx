"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "@/components/gestao/link-depois";
import { ArrowLeft, Cake, Check, Gift, ChevronRight, HandCoins, HeartPulse, MessageCircle, PhoneOff, RotateCcw, Send, SkipForward, Sparkles, Ticket, BedDouble, CalendarClock, UserSearch, X } from "lucide-react";
import { lerModoEnvio, linkDaMensagem, marcarEnviada, montarFila, TIPOS_ENVIO, type Fila, type MensagemDaFila, type TipoEnvio } from "@/lib/gestao/modo-envio";
import { fmtTelefone, hora } from "@/lib/gestao/util";
import { lerLembrado, guardarLembrado } from "./lembrado";
import { useGestao } from "./contexto";
import { Tile, type Tom } from "./painel";
import { avisarMudanca, Esqueleto, useAvisos, useDados, useSomenteLeitura, Vazio } from "./ui";
import "./modo-envio.css";

/**
 * Modo envio (`/gestao/app/mensagens`): todas as mensagens prontas do dia numa fila só, uma por vez.
 * Primeiro a pessoa escolhe os tipos (com quantas de cada); depois vê uma mensagem por vez: para quem, por quê, o texto
 * (dá para mudar) e "Abrir no WhatsApp". Quando ela volta para esta aba, a tela pergunta "Enviou?":
 * "Sim, próxima" grava a marca (a mesma das outras telas), "Pular" e "Não enviou" não gravam nada.
 * Nada é enviado sozinho: sem API de WhatsApp, quem aperta enviar é a pessoa, no WhatsApp do aparelho.
 */

const ICONE: Record<TipoEnvio, { icone: React.ComponentType<{ size?: number }>; tom: Tom }> = {
  pronto: { icone: Sparkles, tom: "pessego" },
  lembrete: { icone: CalendarClock, tom: "pessego" },
  chegada: { icone: BedDouble, tom: "ceu" },
  cobranca: { icone: HandCoins, tom: "menta" },
  saude: { icone: HeartPulse, tom: "ceu" },
  pacote: { icone: Ticket, tom: "lilas" },
  niver: { icone: Cake, tom: "manteiga" },
  niver_tutor: { icone: Gift, tom: "rosa" },
  volta: { icone: UserSearch, tom: "menta" },
};

/** Os tipos que a pessoa desligou ficam lembrados neste aparelho. */
const chaveDesligados = (petshopId: string) => `maestro-gestao-envio-desligados:${petshopId}`;
function lerDesligados(petshopId: string): TipoEnvio[] {
  try { const v: unknown = JSON.parse(lerLembrado(chaveDesligados(petshopId)) ?? "[]"); return Array.isArray(v) ? (v.filter((x) => typeof x === "string") as TipoEnvio[]) : []; } catch { return []; }
}

type Resultado = { estado: "enviada" | "pulada"; em?: string };
type Fase = "escolher" | "enviando" | "fim";

export default function ModoEnvio() {
  const { sb, petshop, eu } = useGestao();
  const { avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const d = await lerModoEnvio(sb, petshop.id);
    return d ? montarFila(d, petshop) : ({ mensagens: [], pulados: [] } satisfies Fila);
  }, [petshop.id]);

  const [desligados, setDesligados] = useState<TipoEnvio[]>(() => lerDesligados(petshop.id));
  const ligar = (t: TipoEnvio, ligado: boolean) => setDesligados((l) => {
    const n = ligado ? l.filter((x) => x !== t) : [...new Set([...l, t])];
    guardarLembrado(chaveDesligados(petshop.id), JSON.stringify(n));
    return n;
  });

  const [fase, setFase] = useState<Fase>("escolher");
  const [fila, setFila] = useState<MensagemDaFila[]>([]);
  const [pos, setPos] = useState(0);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [resultados, setResultados] = useState<Record<string, Resultado>>({});

  const contagem = useMemo(() => {
    const n = new Map<TipoEnvio, number>();
    for (const m of dados?.mensagens ?? []) n.set(m.tipo, (n.get(m.tipo) ?? 0) + 1);
    return n;
  }, [dados]);
  const tipos = TIPOS_ENVIO.filter((t) => contagem.get(t.id));
  const escolhidas = (dados?.mensagens ?? []).filter((m) => !desligados.includes(m.tipo));

  function comecar(lista: MensagemDaFila[]) {
    if (!lista.length) return;
    setFila(lista); setPos(0); setFase("enviando");
    window.scrollTo({ top: 0 });
  }

  const atual = fase === "enviando" ? fila[pos] ?? null : null;
  const proxima = useCallback(() => {
    setPos((p) => {
      if (p + 1 >= fila.length) { setFase("fim"); return p; }
      return p + 1;
    });
  }, [fila.length]);

  const [gravando, setGravando] = useState(false);
  const responder = useCallback(async (r: "sim" | "pular" | "nao") => {
    if (!atual || gravando) return;
    if (r === "nao") return; // continua na mesma: pode abrir de novo ou pular
    if (r === "pular") { setResultados((x) => ({ ...x, [atual.chave]: { estado: "pulada" } })); proxima(); return; }
    if (somenteLeitura()) return;
    setGravando(true);
    try {
      const em = await marcarEnviada(sb, petshop.id, atual);
      setResultados((x) => ({ ...x, [atual.chave]: { estado: "enviada", em } }));
      avisarMudanca();
      proxima();
    } catch (e) { avisarErro(e); } finally { setGravando(false); }
  }, [atual, gravando, proxima, sb, petshop.id, somenteLeitura, avisarErro]);

  if (erro && !dados) {
    return <Vazio titulo="Não consegui buscar as mensagens" texto={erro}><button className="g-btn verde" onClick={() => void recarregar()}>Tentar de novo</button></Vazio>;
  }
  if (carregando && !dados) return <Esqueleto linhas={4} />;
  const f = dados!;

  if (fase === "fim") {
    const enviadas = fila.filter((m) => resultados[m.chave]?.estado === "enviada");
    const puladas = fila.filter((m) => resultados[m.chave]?.estado !== "enviada");
    return (
      <section className="g-card g-me-fim" aria-live="polite">
        <Tile icone={Check} tom="menta" tamanho="g" />
        <h2>{enviadas.length === 1 ? "1 mensagem enviada" : `${enviadas.length} mensagens enviadas`}</h2>
        <p className="g-muted">{puladas.length ? `${puladas.length === 1 ? "1 ficou" : `${puladas.length} ficaram`} para depois. Dá para passar por elas de novo agora.` : "Nenhuma ficou para trás."}</p>
        {enviadas.length > 0 && (
          <ul className="g-me-feitas">
            {enviadas.map((m) => <li key={m.chave}><Check size={14} aria-hidden /><b>{m.quem}</b><span>{TIPOS_ENVIO.find((t) => t.id === m.tipo)?.curto} · às {hora(resultados[m.chave]!.em!)}{eu.nome ? ` · por ${eu.nome.split(" ")[0]}` : ""}</span></li>)}
          </ul>
        )}
        <div className="g-fila">
          {puladas.length > 0 && <button type="button" className="g-btn pri" onClick={() => comecar(puladas)}><RotateCcw />{puladas.length === 1 ? "Passar pela que ficou" : `Passar pelas ${puladas.length} que ficaram`}</button>}
          <button type="button" className="g-btn sec" onClick={() => { setFase("escolher"); setResultados({}); void recarregar(); }}>Ver a lista de novo</button>
          <Link className="g-btn fantasma" href="/gestao/app">Voltar para Hoje</Link>
        </div>
      </section>
    );
  }

  if (fase === "enviando" && atual) {
    return (
      <UmaPorVez key={atual.chave} m={atual} n={pos + 1} de={fila.length} gravando={gravando}
        texto={textos[atual.chave] ?? atual.texto} aoMudarTexto={(t) => setTextos((x) => ({ ...x, [atual.chave]: t }))}
        aoResponder={(r) => void responder(r)} aoParar={() => setFase("fim")} />
    );
  }

  // escolher os tipos
  const total = escolhidas.length;
  return (
    <div className="g-pilha">
      {!f.mensagens.length ? (
        <Vazio titulo="Nenhuma mensagem esperando agora" texto="Quando houver lembrete de amanhã, pet pronto, vacina vencendo, aniversário ou conta para cobrar, aparece aqui." />
      ) : (
        <section className="g-card g-me-tipos" aria-label="O que mandar">
          <div className="g-card-t"><h3>O que mandar</h3><span className="g-muted g-pp">{f.mensagens.length === 1 ? "1 mensagem pronta" : `${f.mensagens.length} mensagens prontas`}</span></div>
          <ul>
            {tipos.map((t) => {
              const ligado = !desligados.includes(t.id), n = contagem.get(t.id) ?? 0, ic = ICONE[t.id];
              return (
                <li key={t.id} className={ligado ? "" : "desligado"}>
                  <Tile icone={ic.icone} tom={ic.tom} tamanho="p" />
                  <span className="t"><b>{t.rotulo}</b><span>{n === 1 ? "1 mensagem" : `${n} mensagens`}</span></span>
                  <button type="button" role="switch" aria-checked={ligado} aria-label={`${t.rotulo}: ${n}`} className="g-me-chave" onClick={() => ligar(t.id, !ligado)}><i /></button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="g-btn pri cheio g-me-comecar" disabled={!total} onClick={() => comecar(escolhidas)}>
            <Send />{total ? `Começar: ${total === 1 ? "1 mensagem" : `${total} mensagens`}` : "Ligue pelo menos um tipo"}
          </button>
          <p className="g-muted g-pp">Uma por vez: o WhatsApp deste aparelho abre com o texto pronto e você só aperta enviar. Nada é mandado sozinho.</p>
        </section>
      )}
      {f.pulados.length > 0 && (
        <details className="g-card g-me-pulados">
          <summary><PhoneOff aria-hidden /><span><b>{f.pulados.length === 1 ? "1 ficou de fora" : `${f.pulados.length} ficaram de fora`}</b> (sem telefone ou não quer receber)</span><ChevronRight aria-hidden className="seta" /></summary>
          <ul>
            {f.pulados.map((p) => (
              <li key={p.chave}>
                <span className="t"><b>{p.quem}</b><span>{p.porque}</span></span>
                <span className={`g-tag ${p.motivo === "não quer receber mensagens" ? "" : "amarelo"}`}>{p.motivo}</span>
                {(p.tutorId || p.petId) && <Link className="g-btn fantasma p" href={p.tutorId ? `/gestao/app/clientes?cliente=${p.tutorId}` : `/gestao/app/clientes?pet=${p.petId}`}>Ver ficha</Link>}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/** Uma mensagem: para quem, por quê, o texto e o botão do WhatsApp. Ao voltar para a aba, pergunta "Enviou?". */
function UmaPorVez({ m, n, de, texto, gravando, aoMudarTexto, aoResponder, aoParar }: {
  m: MensagemDaFila; n: number; de: number; texto: string; gravando: boolean;
  aoMudarTexto: (t: string) => void; aoResponder: (r: "sim" | "pular" | "nao") => void; aoParar: () => void;
}) {
  const [aberta, setAberta] = useState(false);
  const [perguntar, setPerguntar] = useState(false);
  const saiu = useRef(false);
  const link = linkDaMensagem(m, texto);
  const tipo = TIPOS_ENVIO.find((t) => t.id === m.tipo)!;
  const ic = ICONE[m.tipo];
  const simRef = useRef<HTMLButtonElement>(null);
  const abrirRef = useRef<HTMLAnchorElement>(null);

  // a pessoa foi para o WhatsApp e voltou: pergunta se enviou
  useEffect(() => {
    if (!aberta) return;
    const sair = () => { if (document.visibilityState === "hidden") saiu.current = true; };
    const voltar = () => { if (document.visibilityState === "visible" && saiu.current) setPerguntar(true); };
    const perdeuFoco = () => { saiu.current = true; };
    document.addEventListener("visibilitychange", sair);
    document.addEventListener("visibilitychange", voltar);
    window.addEventListener("blur", perdeuFoco);
    window.addEventListener("focus", voltar);
    // no computador o WhatsApp pode abrir numa aba atrás desta: a pergunta aparece sozinha depois de um tempo
    const t = window.setTimeout(() => setPerguntar(true), 6000);
    return () => {
      document.removeEventListener("visibilitychange", sair);
      document.removeEventListener("visibilitychange", voltar);
      window.removeEventListener("blur", perdeuFoco);
      window.removeEventListener("focus", voltar);
      window.clearTimeout(t);
    };
  }, [aberta]);
  useEffect(() => { if (perguntar) simRef.current?.focus(); }, [perguntar]);
  useEffect(() => { abrirRef.current?.focus({ preventScroll: true }); }, []);

  // teclado: Enter abre o WhatsApp; com a pergunta na tela, S (ou Enter) = sim, P = pular, N = não enviou
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === "TEXTAREA" || alvo.tagName === "INPUT")) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (perguntar) {
        if (k === "s") { e.preventDefault(); aoResponder("sim"); }
        else if (k === "n") { e.preventDefault(); setPerguntar(false); setAberta(false); saiu.current = false; aoResponder("nao"); }
        else if (k === "p") { e.preventDefault(); aoResponder("pular"); }
      } else if (k === "p") { e.preventDefault(); aoResponder("pular"); }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [perguntar, aoResponder]);

  return (
    <div className="g-pilha g-me-vez">
      <div className="g-me-progresso" role="status" aria-label={`Mensagem ${n} de ${de}`}>
        <span><b>{n} de {de}</b></span>
        <span className="trilha" aria-hidden><i style={{ width: `${Math.round(((n - 1) / de) * 100)}%` }} /></span>
        <button type="button" className="g-btn fantasma p" onClick={aoParar}><X />Parar</button>
      </div>

      <section className="g-card g-me-msg" aria-label={`Mensagem para ${m.quem}`}>
        <div className="quem">
          <Tile icone={ic.icone} tom={ic.tom} />
          <div className="g-cresce">
            <span className="g-rotulo">{tipo.rotulo}</span>
            <h2>{m.quem}</h2>
            <span className="g-muted g-pp g-tab">{fmtTelefone(m.telefone)}</span>
          </div>
        </div>
        <p className="porque"><b>Por quê:</b> {m.porque}</p>
        <label className="g-campo">
          <span>Mensagem (dá para mudar antes de abrir)</span>
          <textarea className="g-textarea" rows={6} maxLength={1500} value={texto} onChange={(e) => aoMudarTexto(e.target.value)} />
        </label>

        {!perguntar ? (
          <div className="g-me-acoes">
            {link && (
              <a ref={abrirRef} className="g-btn zap cheio g-me-abrir" href={link} target="_blank" rel="noopener noreferrer"
                onClick={() => { saiu.current = false; setAberta(true); }}>
                <MessageCircle />{aberta ? "Abrir no WhatsApp de novo" : "Abrir no WhatsApp"}
              </a>
            )}
            <div className="g-fila entre">
              <button type="button" className="g-btn fantasma p" onClick={() => aoResponder("pular")}><SkipForward />Pular</button>
              {aberta && <button type="button" className="g-btn sec p" onClick={() => setPerguntar(true)}>Já voltei</button>}
            </div>
            <p className="g-muted g-pp g-me-teclas">Teclado: Enter abre o WhatsApp · P pula.</p>
          </div>
        ) : (
          <div className="g-me-pergunta" role="group" aria-label="Enviou?">
            <p><b>Enviou a mensagem para {m.quem.split(" ")[0]}?</b></p>
            <button ref={simRef} type="button" className="g-btn pri cheio" disabled={gravando} onClick={() => aoResponder("sim")}><Check />{gravando ? "Anotando…" : n < de ? "Sim, próxima" : "Sim, terminar"}</button>
            <div className="g-fila">
              <button type="button" className="g-btn sec g-cresce" onClick={() => aoResponder("pular")}><SkipForward />Pular</button>
              <button type="button" className="g-btn sec g-cresce" onClick={() => { setPerguntar(false); setAberta(false); saiu.current = false; aoResponder("nao"); }}><ArrowLeft />Não enviou</button>
            </div>
            <p className="g-muted g-pp g-me-teclas">Teclado: S = sim · P = pular · N = não enviou.</p>
          </div>
        )}
      </section>
    </div>
  );
}
