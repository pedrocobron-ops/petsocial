"use client";

import { useCallback, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

interface Candidata {
  titulo: string;
  thumb: string;
  credito: string;
  largura: number;
}

interface Props {
  /** Termo já sugerido, em inglês (a busca do Commons responde muito melhor). */
  termoInicial?: string;
  /** Base do nome do arquivo no storage, normalmente o slug da matéria. */
  nomeBase: string;
  /** Sufixo do arquivo: "capa", "foto1"… Mantém nome estável e previsível. */
  sufixo: string;
  /** Recebe a imagem já salva no storage do jornal. */
  onEscolher: (url: string, credito: string) => void;
  onFechar: () => void;
}

async function chamar(corpo: Record<string, unknown>) {
  const { data } = await supabaseBrowser().auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, erro: "Sessão expirada. Entre de novo." };
  const r = await fetch("/api/imagem", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  return r.json();
}

/**
 * Busca imagem no Wikimedia Commons de dentro da Redação.
 *
 * O filtro de licença e de tipo de arquivo mora no servidor: aqui só chegam
 * candidatas de domínio público ou CC BY, em JPEG ou PNG, com pelo menos
 * 800px de largura, e sem gravura, pintura, mapa ou diagrama.
 *
 * O título de cada candidata aparece em destaque de propósito. É por ele que
 * se julga se a foto tem relação real com a matéria, e não pela miniatura,
 * que engana: foto bonita da espécie errada continua sendo foto errada.
 */
export default function BuscadorImagem({
  termoInicial = "",
  nomeBase,
  sufixo,
  onEscolher,
  onFechar,
}: Props) {
  const [termo, setTermo] = useState(termoInicial);
  const [candidatas, setCandidatas] = useState<Candidata[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  const buscar = useCallback(async () => {
    if (!termo.trim()) return;
    setBuscando(true);
    setMsg("");
    setCandidatas([]);
    const j = await chamar({ acao: "buscar", termo });
    setBuscando(false);
    if (!j.ok) {
      setMsg("❌ " + (j.erro ?? "A busca falhou."));
      return;
    }
    setCandidatas(j.candidatas ?? []);
    if ((j.candidatas ?? []).length === 0) {
      setMsg("Nada de aproveitável com esse termo. Tente outras palavras, em inglês.");
    }
  }, [termo]);

  async function escolher(c: Candidata) {
    setSalvando(c.thumb);
    setMsg("");
    const j = await chamar({
      acao: "salvar",
      origem: c.thumb,
      nome: `${nomeBase}-${sufixo}`,
    });
    setSalvando(null);
    if (!j.ok) {
      setMsg("❌ " + (j.erro ?? "Não consegui salvar a imagem."));
      return;
    }
    onEscolher(j.url, c.credito);
    onFechar();
  }

  return (
    <div className="buscaimg">
      <div className="buscaimg-topo">
        <strong>🔎 Buscar imagem no Wikimedia Commons</strong>
        <button type="button" className="btn-ghost" onClick={onFechar}>Fechar</button>
      </div>

      <p className="buscaimg-dica">
        Busque <b>em inglês</b>, que é onde o acervo responde. Escolha pelo título, não pela
        miniatura: só entram fotos livres para uso, e o crédito vai junto para a legenda.
      </p>

      <div className="buscaimg-campo">
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); buscar(); } }}
          placeholder="ex.: brushing dog teeth toothbrush"
        />
        <button type="button" className="btn-primary" disabled={buscando || !termo.trim()} onClick={buscar}>
          {buscando ? "Buscando…" : "Buscar"}
        </button>
      </div>

      {msg && <p className="buscaimg-msg">{msg}</p>}

      {candidatas.length > 0 && (
        <ul className="buscaimg-grade">
          {candidatas.map((c) => (
            <li key={c.thumb}>
              <button
                type="button"
                onClick={() => escolher(c)}
                disabled={salvando !== null}
                title="Usar esta imagem"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.thumb} alt="" loading="lazy" />
                <span className="buscaimg-titulo">{c.titulo}</span>
                <span className="buscaimg-credito">{c.credito}</span>
                {salvando === c.thumb && <span className="buscaimg-salvando">Salvando…</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
