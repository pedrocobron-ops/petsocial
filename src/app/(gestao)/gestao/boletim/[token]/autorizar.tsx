"use client";

import { useState } from "react";
import { Check, Loader2, Share2 } from "lucide-react";
import type { AutorizacaoAtual, EscopoDaFoto } from "@/lib/gestao/boletim-servidor";
import { arrumarArroba, textoComArroba } from "@/lib/gestao/fotos-redes";

/**
 * "Pode postar a foto do Thor nas redes da Loja": o tutor autoriza na página do boletim. Nada vem marcado: ele escolhe QUAIS
 * fotos e, se quiser, o @ para a loja marcar. O texto mostrado é o mesmo que o banco guarda (o banco monta; aqui só troca a frase
 * "Sem marcar o meu perfil." pelo @, do mesmo jeito que o banco). Tirar é a qualquer hora, pelo link "Não quero mais".
 */
const dataCurta = (iso: string, fuso: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: fuso }).format(new Date(iso));

export default function AutorizarFoto({ token, rotulo, textos, atual, fuso, opcoes }: {
  token: string; rotulo: string; textos: Record<EscopoDaFoto, string>; atual: AutorizacaoAtual | null; fuso: string;
  /** os nomes das duas opções, já com o pet ("Só as fotos deste boletim", "Também as das próximas visitas") */
  opcoes: Record<EscopoDaFoto, { titulo: string; apoio: string }>;
}) {
  const [aberto, setAberto] = useState(false);
  const [escopo, setEscopo] = useState<EscopoDaFoto | null>(null);
  const [marcar, setMarcar] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<AutorizacaoAtual | null>(atual);

  async function autorizar() {
    if (!escopo || enviando) return;
    setErro(null);
    setEnviando(true);
    try {
      const r = await fetch(`/gestao/boletim/${token}/autorizacao`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ escopo, marcar }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.codigo) { setErro(d?.mensagem ?? "Não consegui guardar agora. Tente de novo em instantes."); return; }
      setFeito(d as AutorizacaoAtual);
      setAberto(false);
    } catch { setErro("Sem conexão. Tente de novo em instantes."); } finally { setEnviando(false); }
  }

  if (feito) {
    return (
      <section className="g-bo-redes ok" aria-label="Fotos nas redes" data-teste="autorizacao-feita">
        <p className="g-bo-redes-t"><Check aria-hidden /><b>Pode postar</b><span>desde {dataCurta(feito.desde, fuso)}</span></p>
        <p className="g-bo-redes-texto">{feito.texto}</p>
        <a className="g-bo-redes-sair" href={`/gestao/autorizacao/${feito.codigo}`} rel="nofollow">Não quero mais</a>
      </section>
    );
  }

  if (!aberto) {
    return (
      <section className="g-bo-redes" aria-label="Fotos nas redes">
        <button type="button" className="g-btn sec cheio" data-teste="pode-postar" onClick={() => setAberto(true)}><Share2 />{rotulo}</button>
      </section>
    );
  }

  const arroba = arrumarArroba(marcar);
  return (
    <section className="g-bo-redes aberto" aria-label="Fotos nas redes">
      <p className="g-bo-redes-t"><Share2 aria-hidden /><b>{rotulo}?</b></p>
      <div role="radiogroup" aria-label="Quais fotos podem ser postadas" className="g-bo-redes-ops">
        {(["boletim", "todas"] as const).map((e) => (
          <button key={e} type="button" role="radio" aria-checked={escopo === e} className={`g-bo-redes-op${escopo === e ? " on" : ""}`} onClick={() => { setEscopo(e); setErro(null); }}>
            <span className="bolinha" aria-hidden>{escopo === e && <Check />}</span>
            <span><b>{opcoes[e].titulo}</b><small>{opcoes[e].apoio}</small></span>
          </button>
        ))}
      </div>
      <label className="g-campo"><span>Quer que a gente marque você? (se quiser)</span>
        <input className="g-input" value={marcar} maxLength={80} placeholder="@seu.perfil" autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => { setMarcar(e.target.value); setErro(null); }} />
      </label>
      {escopo && (
        <div className="g-bo-redes-texto previa" data-teste="texto-da-autorizacao">
          <small>O que você autoriza:</small>
          <p>{textoComArroba(textos[escopo], arroba)}</p>
        </div>
      )}
      {erro && <p className="g-erro" role="alert">{erro}</p>}
      <div className="g-bo-redes-acoes">
        <button type="button" className="g-btn verde" disabled={!escopo || enviando} onClick={() => void autorizar()}>{enviando ? <><Loader2 className="g-gira" />Guardando…</> : "Autorizar"}</button>
        <button type="button" className="g-btn fantasma" onClick={() => { setAberto(false); setEscopo(null); setErro(null); }}>Agora não</button>
      </div>
      <small className="g-bo-redes-nota">Você pode tirar a autorização quando quiser, pelo link &quot;Não quero mais&quot; que aparece aqui.</small>
    </section>
  );
}
