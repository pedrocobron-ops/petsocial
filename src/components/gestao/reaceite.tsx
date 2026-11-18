"use client";

import { useState } from "react";
import Link from "@/components/gestao/link-depois";
import { Selo } from "./marca";
import { DOCUMENTOS, MUDANCAS, aceiteDoCadastro, textoVigencia, type Documento } from "@/lib/gestao/documentos";
import { EMPRESA } from "@/lib/empresa";
import { linkSuporte } from "@/lib/gestao/contato";
import type { Banco } from "@/lib/gestao/supabase";
import "./legal.css";

/**
 * Tela que aparece ao abrir o aplicativo quando há versão nova dos Termos ou da Política (src/lib/gestao/documentos.ts).
 * Trava o aplicativo até a pessoa aceitar; o aceite vai para a tabela `aceites` pela função `aceitar_documentos`.
 */
export default function Reaceite({ sb, faltam, nome, aoAceitar, aoSair }: {
  sb: Banco; faltam: Documento[]; nome?: string | null; aoAceitar: () => void; aoSair: () => void;
}) {
  const [marcado, setMarcado] = useState(false);
  const [indo, setIndo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const primeiro = (nome ?? "").trim().split(/\s+/)[0];

  async function aceitar() {
    if (!marcado) { setErro("Marque a caixa para dizer que leu e aceita."); return; }
    setIndo(true); setErro(null);
    const v = aceiteDoCadastro();
    const r = await sb.rpc("aceitar_documentos", { p_termos: v.termos, p_privacidade: v.privacidade });
    setIndo(false);
    if (r.error) { setErro("Não consegui guardar o seu aceite agora. Confira a internet e tente de novo."); return; }
    aoAceitar();
  }

  return (
    <div className="g g-raiz">
      <div className="g-leg g-reac">
        <header className="g-leg-topo">
          <span className="g-leg-marca"><Selo tamanho={36} tom="verde" /><span>Maestro Pet Gestão</span></span>
        </header>
        <main className="g-leg-folha" aria-labelledby="reac-t">
          <div className="g-leg-abre">
            <h1 id="reac-t">{primeiro ? `${primeiro}, atualizamos as nossas regras` : "Atualizamos as nossas regras"}</h1>
            <p className="g-leg-resumo">
              {faltam.length > 1 ? "Os Termos de uso e a Política de privacidade mudaram." : faltam[0] === "termos" ? "Os Termos de uso mudaram." : "A Política de privacidade mudou."}
              {" "}Leva um minuto: veja o que mudou e aceite para continuar usando o sistema. Os seus dados e a sua assinatura continuam iguais.
            </p>
          </div>
          <div className="g-leg-texto">
            <h2>O que mudou</h2>
            <ul>{MUDANCAS.map((m) => <li key={m}>{m}</li>)}</ul>
            <div className="g-reac-docs">
              {(Object.keys(DOCUMENTOS) as Documento[]).map((d) => (
                <Link key={d} href={DOCUMENTOS[d].caminho} target="_blank" className="g-reac-doc">
                  <b>{DOCUMENTOS[d].nome}</b>
                  <span>{textoVigencia(d)}</span>
                  <span className="abrir">Ler o texto completo</span>
                </Link>
              ))}
            </div>
            <label className="g-check grande">
              <input type="checkbox" name="aceite" checked={marcado} onChange={(e) => { setMarcado(e.target.checked); setErro(null); }} />
              <span>Li e aceito os Termos de uso e a Política de privacidade nas versões acima.</span>
            </label>
            {erro && <p className="g-erro" role="alert">{erro}</p>}
            <div className="g-reac-acoes">
              <button className="g-btn pri cheio" onClick={() => void aceitar()} disabled={indo}>{indo ? "Guardando…" : "Aceitar e continuar"}</button>
              <button className="g-btn fantasma" onClick={aoSair} disabled={indo}>Sair</button>
            </div>
            <p className="g-muted g-reac-nao">
              Não concorda? Sem aceitar, não dá para usar o sistema. Você pode cancelar a assinatura e pedir uma cópia dos seus dados pelo{" "}
              <a href={linkSuporte()} target="_blank" rel="noopener noreferrer">WhatsApp</a> ou por <a href={`mailto:${EMPRESA.email}`}>{EMPRESA.email}</a>.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
