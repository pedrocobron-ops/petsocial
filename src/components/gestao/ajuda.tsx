"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, LifeBuoy, MessageCircle, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { rapidasPara } from "@/lib/gestao/manual";
import { linkSuporte } from "@/lib/gestao/contato";
import { hora } from "@/lib/gestao/util";
import { useGestao } from "./contexto";
import { abrirAssistente } from "./ui";

type Item = { de: "eu" | "ajuda"; texto: string; quando: string; avaliar?: boolean; avaliado?: "sim" | "nao"; registro?: string | null; /** a Ajuda não soube responder, ou o caso é da equipe */ semSaida?: boolean };
type Resposta = { texto?: string; equipe?: boolean; semResposta?: boolean; novo?: boolean; assunto?: string; erro?: string; mensagem?: string };

/**
 * Quantas tentativas seguidas sem resolver, NO MESMO ASSUNTO, até oferecer o WhatsApp da equipe.
 * Conta: tocar em "Ainda não" e a Ajuda dizer que não sabe. Zera: tocar em "Sim", mudar de assunto ou começar de novo.
 * Abandonar a conversa não conta nada. Erro de conexão também não.
 */
const TENTATIVAS = 2;

const memoria: { petshop: string | null; itens: Item[]; falhas: number; equipe: boolean; assunto: string | null } = { petshop: null, itens: [], falhas: 0, equipe: false, assunto: null };

/**
 * Ajuda: primeiro uma conversa que tira dúvidas de uso com base no guia. O WhatsApp da equipe só aparece
 * quando a conversa não resolveu (duas tentativas) ou quando o caso é de gente: cobrança, erro, conta.
 */
export default function Ajuda({ aoFechar }: { aoFechar: () => void }) {
  const { sb, petshop, eu } = useGestao();
  if (memoria.petshop !== petshop.id) { memoria.petshop = petshop.id; memoria.itens = []; memoria.falhas = 0; memoria.equipe = false; memoria.assunto = null; }
  const [itens, setItens] = useState<Item[]>(memoria.itens);
  const [falhas, setFalhas] = useState(memoria.falhas);
  const [equipe, setEquipe] = useState(memoria.equipe);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);

  const guardar = (novos: Item[]) => { memoria.itens = novos; setItens(novos); };
  const falhou = () => { memoria.falhas += 1; setFalhas(memoria.falhas); };
  const chamarEquipe = () => { memoria.equipe = true; setEquipe(true); };
  const zerar = () => { memoria.falhas = 0; memoria.equipe = false; setFalhas(0); setEquipe(false); };

  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [itens, pensando, equipe, falhas]);
  useEffect(() => {
    const antes = document.documentElement.style.overflow;
    if (window.matchMedia("(max-width: 719px)").matches) document.documentElement.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    document.addEventListener("keydown", tecla);
    return () => { document.documentElement.style.overflow = antes; document.removeEventListener("keydown", tecla); };
  }, [aoFechar]);

  const enviar = useCallback(async (t: string) => {
    const limpo = t.trim();
    if (!limpo || pensando) return;
    setTexto("");
    const comPergunta: Item[] = [...memoria.itens.map((i) => ({ ...i, avaliar: false })), { de: "eu", texto: limpo, quando: hora(new Date()) }];
    guardar(comPergunta);
    setPensando(true);
    try {
      const { data } = await sb.auth.getSession();
      const r = await fetch("/api/gestao/ajuda", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ petshopId: petshop.id, falas: comPergunta.map((i) => ({ de: i.de, texto: i.texto })) }),
      });
      const j = (await r.json().catch(() => null)) as Resposta | null;
      if (!r.ok || !j?.texto) { guardar([...comPergunta, { de: "ajuda", texto: j?.mensagem ?? "Não consegui responder agora. Tente de novo em instantes.", quando: hora(new Date()) }]); return; }
      // mudou de assunto: as tentativas do assunto anterior não contam para este
      const mudou = j.novo === true || (j.assunto != null && memoria.assunto != null && j.assunto !== memoria.assunto);
      if (mudou) zerar();
      if (j.assunto != null) memoria.assunto = j.assunto;
      // guarda a dúvida para a equipe Maestro Pet melhorar o sistema
      const reg = await sb.rpc("registrar_conversa", { p_petshop: petshop.id, p_canal: "ajuda", p_pergunta: limpo, p_resposta: j.texto, p_pediu_equipe: j.equipe === true });
      const registro = typeof reg.data === "string" ? reg.data : null;
      if (j.semResposta && registro) void sb.rpc("avaliar_conversa", { p_id: registro, p_resolveu: false }).then(() => {}, () => {});
      guardar([...comPergunta, { de: "ajuda", texto: j.texto, quando: hora(new Date()), avaliar: !j.semResposta && !j.equipe, registro, semSaida: j.semResposta === true || j.equipe === true }]);
      if (j.semResposta) falhou();
      if (j.equipe) chamarEquipe();
    } catch {
      guardar([...comPergunta, { de: "ajuda", texto: "Sem conexão. Confira a internet e tente de novo.", quando: hora(new Date()) }]);
    } finally { setPensando(false); }
  }, [pensando, sb, petshop.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function avaliar(indice: number, resolveu: boolean) {
    const registro = memoria.itens[indice]?.registro;
    if (registro) void sb.rpc("avaliar_conversa", { p_id: registro, p_resolveu: resolveu, p_pediu_equipe: !resolveu && memoria.falhas + 1 >= TENTATIVAS ? true : undefined }).then(() => {}, () => {});
    const novos = memoria.itens.map((i, n) => (n === indice ? { ...i, avaliar: false, avaliado: resolveu ? ("sim" as const) : ("nao" as const) } : i));
    if (resolveu) { zerar(); guardar([...novos, { de: "ajuda", texto: "Que bom! Se aparecer outra dúvida, é só escrever.", quando: hora(new Date()) }]); }
    else {
      falhou();
      guardar([...novos, { de: "ajuda", texto: memoria.falhas >= TENTATIVAS ? "Entendi, não resolveu. Vou te passar para a nossa equipe." : "Poxa. Me conta com mais detalhe o que você está tentando fazer e o que aparece na tela, que eu tento de novo.", quando: hora(new Date()) }]);
    }
  }

  function recomecar() {
    memoria.itens = []; memoria.falhas = 0; memoria.equipe = false; memoria.assunto = null;
    setItens([]); setFalhas(0); setEquipe(false);
  }

  const comEquipe = equipe || falhas >= TENTATIVAS;
  // vai para a equipe só o que ficou sem saída: a pessoa tocou em "Ainda não" ou a Ajuda não soube responder.
  // Pergunta respondida e deixada sem avaliar não entra: não dá para dizer que não resolveu.
  const perguntas = itens.filter((i, n) => i.de === "eu" && (itens[n + 1]?.avaliado === "nao" || itens[n + 1]?.semSaida === true)).map((i) => i.texto);
  const resumo = `Oi! Sou ${eu.nome.split(" ")[0]} (${petshop.nome.trim()}). Preciso de ajuda com o Maestro Pet Gestão.${perguntas.length ? `\n\nJá tentei a ajuda do sistema e não resolveu. Minha dúvida:\n- ${perguntas.slice(-3).join("\n- ")}` : ""}`;
  const primeiro = eu.nome.split(" ")[0];

  return (
    <div className="g-ass g-ajuda" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <section className="g-ass-painel" role="dialog" aria-label="Ajuda">
        <header className="g-ass-topo">
          <span className="foto"><span className="g-tile ceu" style={{ borderRadius: "50%", width: 42, height: 42 }} aria-hidden><LifeBuoy /></span></span>
          <div><b>Ajuda</b><span>{pensando ? "digitando…" : "dúvidas sobre o sistema"}</span></div>
          {itens.length > 0 && <button className="g-ico" onClick={recomecar} aria-label="Começar de novo" title="Começar de novo"><RotateCcw /></button>}
          <button className="g-ico" style={itens.length ? { marginLeft: 0 } : undefined} onClick={aoFechar} aria-label="Fechar a ajuda" title="Fechar"><ChevronDown /></button>
        </header>

        <div className="g-ass-conversa" aria-live="polite">
          <span className="g-ass-dia">Hoje</span>
          <div className="g-bolha ela rabo">Oi, {primeiro}! Aqui você tira dúvidas de como usar o sistema. Escreve o que você está tentando fazer.</div>
          {!itens.length && (
            <div className="g-ass-rapidas">
              {rapidasPara(petshop).map((t) => <button key={t.id} onClick={() => void enviar(t.titulo)}>{t.titulo}</button>)}
            </div>
          )}
          {itens.map((item, i) => (
            <div key={i} style={{ display: "contents" }}>
              <div className={`g-bolha ${item.de === "eu" ? "eu" : "ela"}${itens[i - 1]?.de !== item.de ? " rabo" : ""}`}>
                {item.texto}
                <span className="h">{item.quando}</span>
              </div>
              {item.avaliar && !pensando && (
                <div className="g-ajuda-avaliar">
                  <span>Resolveu?</span>
                  <button onClick={() => avaliar(i, true)}><ThumbsUp />Sim</button>
                  <button onClick={() => avaliar(i, false)}><ThumbsDown />Ainda não</button>
                </div>
              )}
            </div>
          ))}
          {pensando && <div className="g-bolha ela rabo pensa" aria-label="Digitando"><i /><i /><i /></div>}
          {comEquipe && !pensando && (
            <div className="g-proposta g-ajuda-equipe">
              <div className="cab"><b>Falar com a equipe</b></div>
              <p className="g-p g-muted">Uma pessoa da Maestro Pet continua com você pelo WhatsApp. A sua dúvida já vai escrita na mensagem.</p>
              <a className="g-btn zap" href={linkSuporte(resumo)} target="_blank" rel="noopener noreferrer"><MessageCircle />Abrir o WhatsApp</a>
            </div>
          )}
          <div ref={fim} />
        </div>

        <div className="g-ajuda-mozart">Quer que algo seja feito por você? <button onClick={() => { aoFechar(); abrirAssistente(); }}>Fale com o Mozart</button></div>
        <form className="g-ass-entrada" onSubmit={(e) => { e.preventDefault(); void enviar(texto); }}>
          <textarea rows={1} value={texto} placeholder="Sua dúvida" aria-label="Sua dúvida"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void enviar(texto); } }} />
          <button className="g-mic enviar" disabled={pensando || !texto.trim()} aria-label="Enviar"><ArrowUp /></button>
        </form>
      </section>
    </div>
  );
}
