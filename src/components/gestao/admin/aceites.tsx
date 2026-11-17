"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Search } from "lucide-react";
import { Esqueleto, mensagemDeErro, ok } from "@/components/gestao/ui";
import { DOCUMENTOS, type Documento } from "@/lib/gestao/documentos";
import { banco } from "@/lib/gestao/supabase";
import { dataCompleta, hora } from "@/lib/gestao/util";

type Aceite = {
  id: number; user_id: string | null; email: string | null; documento: Documento; versao: string; aceito_em: string;
  origem: "cadastro" | "reaceite"; ip: string | null; navegador: string | null; petshops: string | null;
};
type Versao = { documento: Documento; versao: string; pessoas: number; ultimo: string };

const nomeDoc = (d: Documento) => DOCUMENTOS[d]?.nome ?? d;
const quando = (d: string) => `${dataCompleta(new Date(d))} às ${hora(d)}`;

/** Painel do administrador: quem aceitou qual versão dos Termos e da Política (tabela `aceites`, função `admin_aceites`). */
export default function AbaAceites() {
  const [versoes, setVersoes] = useState<Versao[] | null>(null);
  const [aceites, setAceites] = useState<Aceite[]>([]);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async (b: string) => {
    try {
      const r = ok(await banco().rpc("admin_aceites", { p_busca: b || undefined, p_limite: 500 })) as unknown as { versoes: Versao[]; aceites: Aceite[] };
      setVersoes(r.versoes ?? []); setAceites(r.aceites ?? []); setErro(null);
    } catch (e) { setErro(mensagemDeErro(e)); }
  }, []);
  useEffect(() => { void carregar(""); }, [carregar]);

  function exportar() {
    const linhas = [["e-mail", "pet shop", "documento", "versão", "aceito em", "origem", "ip", "navegador"],
      ...aceites.map((a) => [a.email ?? "", a.petshops ?? "", nomeDoc(a.documento), a.versao, a.aceito_em, a.origem, a.ip ?? "", a.navegador ?? ""])];
    const csv = linhas.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "aceites.csv"; a.click(); URL.revokeObjectURL(url);
  }

  if (erro) return <p className="g-aviso vermelho" role="alert">{erro}</p>;
  if (!versoes) return <Esqueleto linhas={4} />;

  return (
    <div className="g-pilha g">
      <section className="g-pilha">
        <div>
          <h2>Versões em vigor</h2>
          <p className="g-muted g-p">
            {(Object.keys(DOCUMENTOS) as Documento[]).map((d) => `${DOCUMENTOS[d].nome}: versão ${DOCUMENTOS[d].versao}`).join(" · ")}.
            Quem não aceitou a versão em vigor vê a tela de aceite ao abrir o aplicativo.
          </p>
        </div>
        <div className="g-card g-lista" style={{ paddingBlock: 6 }}>
          {!versoes.length ? <p className="g-muted g-p">Nenhum aceite ainda.</p> : versoes.map((v) => (
            <div key={`${v.documento}:${v.versao}`} className="g-linha">
              <span className="t"><b>{nomeDoc(v.documento)} · versão {v.versao}</b><span>{v.pessoas} {v.pessoas === 1 ? "aceite" : "aceites"} · último em {quando(v.ultimo)}</span></span>
              {DOCUMENTOS[v.documento]?.versao === v.versao && <span className="g-tag verde">em vigor</span>}
            </div>
          ))}
        </div>
      </section>

      <section className="g-pilha">
        <h2>Aceites</h2>
        <form className="g-fila" style={{ alignItems: "end", flexWrap: "wrap" }} onSubmit={(e) => { e.preventDefault(); void carregar(busca.trim()); }}>
          <label className="g-campo" style={{ flex: "1 1 220px" }}><span>Procurar pelo e-mail</span>
            <input className="g-input" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="cliente@exemplo.com" />
          </label>
          <button className="g-btn sec"><Search /> Procurar</button>
          <button type="button" className="g-btn sec" onClick={exportar} disabled={!aceites.length}><Download /> Exportar CSV</button>
        </form>
        {!aceites.length ? <p className="g-muted">Nada encontrado.</p> : (
          <div className="g-card g-lista" style={{ paddingBlock: 6 }}>
            {aceites.map((a) => (
              <div key={a.id} className="g-linha">
                <span className="t">
                  <b style={{ overflowWrap: "anywhere" }}>{a.email ?? "login apagado"}{a.petshops ? ` · ${a.petshops}` : ""}</b>
                  <span>{nomeDoc(a.documento)} {a.versao} · {quando(a.aceito_em)} · {a.origem === "cadastro" ? "no cadastro" : "versão nova"}{a.ip ? ` · IP ${a.ip}` : ""}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
