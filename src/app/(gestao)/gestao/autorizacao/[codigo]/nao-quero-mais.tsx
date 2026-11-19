"use client";

import { useState } from "react";
import { Check, Loader2, Share2 } from "lucide-react";

/**
 * A autorização e o botão "Não quero mais": um toque para escolher, outro para confirmar. Depois, a loja não posta mais nenhuma
 * foto nova do pet. O título ("A autorização está valendo" / "Autorização retirada") segue o estado de agora, não o de quando a página abriu.
 */
export default function NaoQueroMais({ codigo, valendo, dePet, loja, children }: { codigo: string; valendo: boolean; /** "do Thor" */ dePet: string; loja: string; children?: React.ReactNode }) {
  const [confirmando, setConfirmando] = useState(false);
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [retirada, setRetirada] = useState(!valendo);

  async function retirar() {
    setErro(null);
    setIndo(true);
    try {
      const r = await fetch(`/gestao/autorizacao/${codigo}/retirar`, { method: "POST" });
      const d = await r.json().catch(() => null);
      if (!r.ok) { setErro(d?.mensagem ?? "Não consegui agora. Tente de novo em instantes."); return; }
      setRetirada(true);
    } catch { setErro("Sem conexão. Tente de novo em instantes."); } finally { setIndo(false); }
  }

  const titulo = <p className="g-bo-redes-t" data-teste="titulo-da-autorizacao">{retirada ? <Check aria-hidden /> : <Share2 aria-hidden />}<b>{retirada ? "Autorização retirada" : "A autorização está valendo"}</b></p>;
  if (retirada) {
    return (
      <section className="g-bo-redes ok" aria-label="Autorização">
        {titulo}
        {children}
        <p className="g-bo-redes-texto" role="status" data-teste="retirada">Pronto: {loja} não tem mais a sua autorização para postar fotos {dePet}. O que já foi postado antes, peça para a loja tirar pelo WhatsApp.</p>
      </section>
    );
  }
  return (
    <section className="g-bo-redes aberto" aria-label="Autorização">
      {titulo}
      {children}
      {erro && <p className="g-erro" role="alert">{erro}</p>}
      {!confirmando ? (
        <button type="button" className="g-btn sec cheio" data-teste="nao-quero-mais" onClick={() => setConfirmando(true)}>Não quero mais</button>
      ) : (
        <div className="g-pilha p">
          <p className="g-bo-redes-texto">Tirar a autorização? {loja} deixa de poder postar fotos {dePet}, deste boletim e das próximas visitas.</p>
          <div className="g-bo-redes-acoes">
            <button type="button" className="g-btn pri" data-teste="confirmar-retirar" disabled={indo} onClick={() => void retirar()}>{indo ? <><Loader2 className="g-gira" />Tirando…</> : "Sim, tirar a autorização"}</button>
            <button type="button" className="g-btn fantasma" onClick={() => setConfirmando(false)}>Deixar como está</button>
          </div>
        </div>
      )}
    </section>
  );
}
