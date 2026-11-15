"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, MessageCircle, MessageCircleQuestion, Send, X } from "lucide-react";
import { MAX_LETRAS_PERGUNTA, MAX_PERGUNTAS_CONVERSA, limiteConversaTexto, type Sugestao } from "@/lib/gestao/link-ia";
import { linkWhatsApp } from "@/lib/gestao/util";

type Fala = { de: "eu" | "ia"; texto: string; zap?: boolean; sugestao?: Sugestao | null };

/**
 * "Tirar dúvida" do link do cliente (só aparece quando o dono ligou a opção em Meu pet shop).
 * Responde pelo que a página mostra; nunca marca nada sozinho: no máximo oferece abrir o pedido já preenchido.
 * A conversa fica só nesta aba (some ao fechar a página) e o servidor não guarda o texto.
 */
export default function DuvidaNoLink({ codigo, loja, telefone, aoPedir }: {
  codigo: string; loja: string; telefone: string | null; aoPedir: (s: Sugestao) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [falas, setFalas] = useState<Fala[]>([]);
  const [texto, setTexto] = useState("");
  const [esperando, setEsperando] = useState(false);
  const [desligado, setDesligado] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLTextAreaElement>(null);
  const perguntas = falas.filter((f) => f.de === "eu").length;
  const acabou = perguntas >= MAX_PERGUNTAS_CONVERSA;
  const ultimaPergunta = [...falas].reverse().find((f) => f.de === "eu")?.texto;
  const zap = linkWhatsApp(telefone, ultimaPergunta ? `Oi! Tenho uma dúvida: ${ultimaPergunta}` : "Oi! Tenho uma dúvida.");

  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [falas, esperando]);
  useEffect(() => {
    if (!aberto) return;
    campo.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto]);

  async function perguntar(e?: React.FormEvent) {
    e?.preventDefault();
    const t = texto.trim().slice(0, MAX_LETRAS_PERGUNTA);
    if (!t || esperando || acabou) return;
    const nova = [...falas, { de: "eu" as const, texto: t }];
    setFalas(nova);
    setTexto("");
    setEsperando(true);
    try {
      const r = await fetch("/api/gestao/link-ia", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ codigo, falas: nova.map((f) => ({ de: f.de, texto: f.texto })) }),
      });
      if (r.status === 403) { setDesligado(true); setFalas([...nova, { de: "ia", texto: `As dúvidas por aqui foram desligadas. Fale com ${loja} no WhatsApp.`, zap: true }]); return; }
      const j = (await r.json().catch(() => null)) as { texto?: string; naoSei?: boolean; limite?: boolean; fora?: boolean; sugestao?: Sugestao | null } | null;
      if (!r.ok || !j?.texto) throw new Error("falhou");
      setFalas([...nova, { de: "ia", texto: j.texto, zap: Boolean(j.naoSei || j.limite || j.fora), sugestao: j.sugestao ?? null }]);
    } catch {
      setFalas([...nova, { de: "ia", texto: `Não consegui responder agora. Confira a internet ou fale com ${loja} no WhatsApp.`, zap: true }]);
    } finally { setEsperando(false); }
  }

  if (!aberto) {
    return (
      <button type="button" className="g-lk-duv-abrir" onClick={() => setAberto(true)} aria-haspopup="dialog">
        <MessageCircleQuestion aria-hidden />Tirar dúvida
      </button>
    );
  }

  return (
    <div className="g-lk-duv" role="dialog" aria-modal="false" aria-labelledby="g-lk-duv-t">
      <div className="g-lk-duv-cab">
        <div>
          <h2 id="g-lk-duv-t">Tirar dúvida</h2>
          <p>Respostas automáticas, só com o que {loja} mostra nesta página.</p>
        </div>
        <button type="button" className="g-lk-duv-x" onClick={() => setAberto(false)} aria-label="Fechar as dúvidas"><X aria-hidden /></button>
      </div>
      <div className="g-lk-duv-falas" aria-live="polite">
        <p className="g-lk-duv-aviso">Não coloque dados pessoais aqui (nome completo, telefone, endereço, documentos). A conversa não fica guardada.</p>
        {!falas.length && <p className="g-lk-duv-ia g-lk-duv-ola">Oi! Pergunte sobre horário, serviços, preços que aparecem aqui, creche ou hotel. Para marcar, você mesmo envia o pedido nesta página.</p>}
        {falas.map((f, i) => (
          <div key={i} className={f.de === "eu" ? "g-lk-duv-eu" : "g-lk-duv-ia"}>
            <span>{f.texto}</span>
            {f.de === "ia" && f.sugestao && (
              <button type="button" className="g-btn pri p" onClick={() => { aoPedir(f.sugestao!); setAberto(false); }}>
                {f.sugestao.tipo === "servico" ? "Quer pedir um horário? Toque aqui" : `Quer pedir uma vaga ${f.sugestao.tipo === "hotel" ? "no hotel" : "na creche"}? Toque aqui`}<ArrowRight aria-hidden />
              </button>
            )}
            {f.de === "ia" && f.zap && zap && (
              <a className="g-btn zap p" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden />Falar com {loja} no WhatsApp</a>
            )}
          </div>
        ))}
        {esperando && <div className="g-lk-duv-ia g-lk-duv-pensa" aria-label="Escrevendo a resposta"><i /><i /><i /></div>}
        {acabou && !esperando && (
          <div className="g-lk-duv-ia">
            <span>{limiteConversaTexto(loja)}</span>
            {zap && <a className="g-btn zap p" href={zap} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden />Falar com {loja} no WhatsApp</a>}
          </div>
        )}
        <div ref={fim} />
      </div>
      <form className="g-lk-duv-form" onSubmit={perguntar}>
        <textarea ref={campo} className="g-textarea" rows={1} value={texto} maxLength={MAX_LETRAS_PERGUNTA} disabled={desligado || acabou}
          placeholder={acabou ? "Limite de perguntas desta conversa" : "Escreva a sua dúvida"} aria-label="Sua dúvida"
          onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void perguntar(); } }} />
        <button className="g-btn pri" disabled={!texto.trim() || esperando || desligado || acabou} aria-label="Enviar a dúvida"><Send aria-hidden /></button>
      </form>
    </div>
  );
}
