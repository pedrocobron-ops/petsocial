"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, MessageCircle, X } from "lucide-react";
import { linkSuporte } from "@/lib/gestao/contato";

type Fala = { de: "eu" | "nina"; texto: string; pessoa?: boolean };

const OLA: Fala = { de: "nina", texto: "Oi! Eu sou a Nina, assistente virtual do Maestro Pet. Me conta: o que o seu negócio faz? Banho e tosa, creche, hotel, loja?" };
const RAPIDAS = ["Quanto custa?", "Como funciona o teste grátis?", "O que é o boletim do pet?", "Consigo trazer meu caderno?", "O cliente consegue agendar sozinho?"];

/** Botão flutuante da página de venda: abre uma conversa com a Nina, a consultora virtual. O WhatsApp fica como segundo caminho. */
export default function ChatVendas() {
  const [aberto, setAberto] = useState(false);
  const [falas, setFalas] = useState<Fala[]>([OLA]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const fim = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);

  // o botão só aparece depois da primeira tela, para não cobrir o "Sem cartão. Sem fidelidade" da capa no celular
  const [depoisDaCapa, setDepoisDaCapa] = useState(false);
  useEffect(() => {
    const ver = () => setDepoisDaCapa(window.scrollY > window.innerHeight * 0.6);
    ver();
    window.addEventListener("scroll", ver, { passive: true });
    return () => window.removeEventListener("scroll", ver);
  }, []);

  useEffect(() => { fim.current?.scrollIntoView({ block: "end" }); }, [falas, pensando, aberto]);
  useEffect(() => {
    if (!aberto) return;
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") setAberto(false); };
    document.addEventListener("keydown", tecla);
    if (window.matchMedia("(min-width: 720px)").matches) campo.current?.focus();
    return () => document.removeEventListener("keydown", tecla);
  }, [aberto]);

  async function enviar(t: string) {
    const limpo = t.trim();
    if (!limpo || pensando) return;
    setTexto("");
    const novas: Fala[] = [...falas, { de: "eu", texto: limpo }];
    setFalas(novas);
    setPensando(true);
    try {
      const r = await fetch("/api/gestao/vendas", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ falas: novas.map(({ de, texto }) => ({ de, texto })) }) });
      const d = (await r.json()) as { texto?: string; pessoa?: boolean };
      setFalas([...novas, { de: "nina", texto: d.texto || "Não consegui responder agora. Pode tentar de novo ou falar com a nossa equipe no WhatsApp.", pessoa: d.pessoa ?? !d.texto }]);
    } catch {
      setFalas([...novas, { de: "nina", texto: "Fiquei sem conexão agora. Pode tentar de novo ou falar com a nossa equipe no WhatsApp.", pessoa: true }]);
    } finally {
      setPensando(false);
    }
  }

  if (!aberto) {
    return (
      <button type="button" className={`gp-chat-botao${depoisDaCapa ? "" : " escondido"}`} onClick={() => setAberto(true)} aria-label="Tirar dúvidas com a Nina, assistente do site"
        tabIndex={depoisDaCapa ? undefined : -1} aria-hidden={depoisDaCapa ? undefined : true}>
        <MessageCircle /><span>Fale com a Nina</span>
      </button>
    );
  }
  const soOla = falas.length === 1;
  return (
    <section className="gp-chat" role="dialog" aria-label="Conversa com a Nina, assistente virtual">
      <header>
        <span className="gp-chat-rosto">N<i /></span>
        <span><b>Nina</b><small>Tira dúvidas aqui no site. No sistema, quem ajuda é o Mozart.</small></span>
        <button type="button" onClick={() => setAberto(false)} aria-label="Fechar conversa"><X /></button>
      </header>
      <div className="gp-chat-falas" aria-live="polite">
        {falas.map((f, n) => (
          <div key={n} className={`gp-chat-fala ${f.de}`}>
            <p>{f.texto}</p>
            {f.pessoa && <a className="gp-chat-zap" href={linkSuporte()} target="_blank" rel="noopener noreferrer"><MessageCircle />Falar com a equipe no WhatsApp</a>}
          </div>
        ))}
        {pensando && <div className="gp-chat-fala nina"><p className="gp-chat-pontos"><i /><i /><i /></p></div>}
        {soOla && <div className="gp-chat-rapidas">{RAPIDAS.map((r) => <button key={r} type="button" onClick={() => enviar(r)}>{r}</button>)}</div>}
        <div ref={fim} />
      </div>
      <a className="gp-chat-teste" href="/gestao/criar-conta">Testar grátis por 7 dias, sem cartão<ArrowRight /></a>
      <form onSubmit={(e) => { e.preventDefault(); enviar(texto); }}>
        <input ref={campo} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva a sua dúvida" maxLength={600} aria-label="Sua mensagem" enterKeyHint="send" />
        <button type="submit" disabled={!texto.trim() || pensando} aria-label="Enviar"><ArrowUp /></button>
      </form>
      <p className="gp-chat-aviso">
        A Nina é uma inteligência artificial. O que você escrever vai para o nosso fornecedor de IA (Anthropic, fora do Brasil) só para responder, e não fica guardado.
        Não escreva dados pessoais. <a href="/politica-de-privacidade#nina">Saiba mais</a>
      </p>
    </section>
  );
}
