"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";

/** "Li e concordo" na página do link: o nome de quem aceita e um toque. Guardamos a hora, o aparelho e a internet de onde veio. */
const quando = (iso: string, fuso: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: fuso }).format(new Date(iso));

export default function AceitarEntrada({ token, fuso, aceitoEm, nome: nomeAceito }: { token: string; fuso: string; aceitoEm: string | null; nome: string | null }) {
  const [feito, setFeito] = useState<{ em: string; nome: string } | null>(aceitoEm ? { em: aceitoEm, nome: nomeAceito ?? "" } : null);
  const [nome, setNome] = useState("");
  const [leu, setLeu] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function aceitar() {
    if (enviando) return;
    if (nome.trim().length < 2) { setErro("Escreva o seu nome."); return; }
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch(`/gestao/entrada/${token}/aceite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: nome.trim() }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.aceito_em) { setErro(d?.mensagem ?? "Não consegui guardar agora. Tente de novo em instantes."); return; }
      setFeito({ em: d.aceito_em, nome: d.nome ?? nome.trim() });
    } catch { setErro("Sem conexão. Tente de novo em instantes."); } finally { setEnviando(false); }
  }

  if (feito) {
    return (
      <section className="g-en-feito" role="status" data-teste="entrada-aceita">
        <Check aria-hidden />
        <div><b>Pronto, obrigado!</b><p>Aceito por {feito.nome} em {quando(feito.em, fuso)}.</p></div>
      </section>
    );
  }
  return (
    <section className="g-bo-bloco g-en-aceite" aria-label="Seu ok">
      <label className="g-campo"><span>Seu nome</span>
        <input className="g-input" value={nome} maxLength={120} autoComplete="name" onChange={(e) => { setNome(e.target.value); setErro(null); }} />
      </label>
      <label className="g-en-li"><input type="checkbox" checked={leu} onChange={(e) => setLeu(e.target.checked)} /><span>Li e concordo com o que está escrito acima</span></label>
      {erro && <p className="g-erro" role="alert">{erro}</p>}
      <button type="button" className="g-btn verde cheio" data-teste="li-e-concordo" disabled={!leu || enviando} onClick={() => void aceitar()}>
        {enviando ? <><Loader2 className="g-gira" />Guardando…</> : <><Check />Li e concordo</>}
      </button>
      <small className="g-muted">Guardamos a hora, o aparelho e a internet de onde você aceitou, junto com este texto.</small>
    </section>
  );
}
