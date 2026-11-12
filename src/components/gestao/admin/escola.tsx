"use client";

import { useCallback, useEffect, useState } from "react";
import { FileUp, Trash2 } from "lucide-react";
import { Esqueleto, mensagemDeErro, ok, useAvisos } from "@/components/gestao/ui";
import { MATERIAIS } from "@/lib/gestao/escola";
import { banco } from "@/lib/gestao/supabase";
import { dataCompleta } from "@/lib/gestao/util";

type Arquivo = { slug: string; arquivo: string; tamanho: number | null; atualizado_em: string };
type Compra = { id: string; email: string; slug: string; origem: "cakto" | "manual"; criado_em: string };

const mega = (b: number | null) => (b ? `${(b / 1048576).toFixed(1)} MB` : "");

/**
 * Escola de Gestão no painel do administrador: o PDF de cada material (para leitura dentro do sistema),
 * quem comprou e a liberação manual para um e-mail.
 */
export default function AbaEscola() {
  const { avisar, avisarErro, confirmar } = useAvisos();
  const [arquivos, setArquivos] = useState<Arquivo[] | null>(null);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [slug, setSlug] = useState(MATERIAIS[0]?.slug ?? "");

  const carregar = useCallback(async () => {
    try {
      const r = ok(await banco().rpc("admin_escola")) as unknown as { materiais: Arquivo[]; compras: Compra[] };
      setArquivos(r.materiais ?? []); setCompras(r.compras ?? []); setErro(null);
    } catch (e) { setErro(mensagemDeErro(e)); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  async function enviar(s: string, arquivo: File | undefined) {
    if (!arquivo) return;
    if (arquivo.type !== "application/pdf") { avisar("Escolha um arquivo PDF."); return; }
    if (arquivo.size > 50 * 1048576) { avisar("O PDF passa de 50 MB. Reduza o arquivo e tente de novo."); return; }
    setEnviando(s);
    try {
      const sb = banco();
      const caminho = `${s}/${crypto.randomUUID()}.pdf`;
      const up = await sb.storage.from("escola").upload(caminho, arquivo, { contentType: "application/pdf" });
      if (up.error) throw new Error(up.error.message);
      const antigo = arquivos?.find((a) => a.slug === s)?.arquivo;
      ok(await sb.from("escola_materiais").upsert({ slug: s, arquivo: caminho, tamanho: arquivo.size, atualizado_em: new Date().toISOString() }).select("slug"));
      if (antigo) await sb.storage.from("escola").remove([antigo]);
      avisar("PDF enviado. Quem comprou já consegue ler no sistema.");
      await carregar();
    } catch (e) { avisarErro(e); } finally { setEnviando(null); }
  }

  async function tirarArquivo(a: Arquivo) {
    if (!(await confirmar({ titulo: "Tirar este PDF?", texto: "Quem comprou continua com o material no e-mail, mas não consegue mais ler dentro do sistema até você enviar outro.", confirmar: "Tirar", perigo: true }))) return;
    try {
      const sb = banco();
      ok(await sb.from("escola_materiais").delete().eq("slug", a.slug).select("slug"));
      await sb.storage.from("escola").remove([a.arquivo]);
      await carregar();
    } catch (e) { avisarErro(e); }
  }

  async function liberar(tirar: boolean, e: string, s: string) {
    const limpo = e.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(limpo)) { avisar("Confira o e-mail."); return; }
    try {
      const r = await banco().rpc("admin_escola_liberar", { p_email: limpo, p_slug: s, p_tirar: tirar });
      if (r.error) throw new Error(r.error.message);
      avisar(tirar ? "Acesso tirado." : "Material liberado para esse e-mail.");
      if (!tirar) setEmail("");
      await carregar();
    } catch (x) { avisarErro(x); }
  }

  if (erro) return <p className="g-aviso vermelho" role="alert">{erro}</p>;
  if (!arquivos) return <Esqueleto linhas={4} />;
  const nome = (s: string) => MATERIAIS.find((m) => m.slug === s)?.nome ?? s;

  return (
    <div className="g-pilha g">
      <section className="g-pilha">
        <div>
          <h2>PDF de cada material</h2>
          <p className="g-muted g-p">Envie aqui o mesmo PDF que a Cakto entrega por e-mail. Com ele, quem comprou com o e-mail da conta lê o material dentro do sistema. Só quem comprou consegue abrir o arquivo.</p>
        </div>
        <div className="g-pilha p">
          {MATERIAIS.map((m) => {
            const a = arquivos.find((x) => x.slug === m.slug);
            const quantos = compras.filter((c) => c.slug === m.slug).length;
            return (
              <div key={m.slug} className="g-card" style={{ display: "grid", gap: 8 }}>
                <div className="g-fila entre">
                  <b style={{ minWidth: 0, overflowWrap: "anywhere" }}>{m.nome}</b>
                  <span className={`g-tag ${a ? "verde" : "amarelo"}`}>{a ? "com PDF" : "sem PDF"}</span>
                </div>
                <p className="g-pp g-muted">
                  {a ? `Enviado em ${dataCompleta(new Date(a.atualizado_em))}${a.tamanho ? ` · ${mega(a.tamanho)}` : ""}. ` : "Sem o PDF, quem compra vê o material em Meus materiais, mas lê só pelo e-mail. "}
                  {quantos} {quantos === 1 ? "pessoa tem" : "pessoas têm"} este material · código na Cakto: {m.codigo || "sem código"}
                </p>
                <div className="g-fila">
                  <label className="g-btn sec p" style={{ cursor: "pointer" }}>
                    <FileUp />{enviando === m.slug ? "Enviando…" : a ? "Trocar o PDF" : "Enviar o PDF"}
                    <input type="file" accept="application/pdf" hidden disabled={enviando !== null} onChange={(e) => { void enviar(m.slug, e.target.files?.[0]); e.target.value = ""; }} />
                  </label>
                  {a && <button className="g-btn fantasma p" onClick={() => void tirarArquivo(a)}><Trash2 />Tirar</button>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="g-card g-pilha">
        <div>
          <h2>Liberar um material na mão</h2>
          <p className="g-muted g-p">Para quem comprou com outro e-mail, ganhou de presente ou comprou antes de a escola existir. Use o e-mail com que a pessoa entra no sistema.</p>
        </div>
        <div className="g-fila" style={{ alignItems: "end", flexWrap: "wrap" }}>
          <label className="g-campo" style={{ flex: "1 1 220px" }}><span>E-mail da conta</span>
            <input className="g-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="cliente@exemplo.com" />
          </label>
          <label className="g-campo" style={{ flex: "1 1 220px" }}><span>Material</span>
            <select className="g-select" value={slug} onChange={(e) => setSlug(e.target.value)}>{MATERIAIS.map((m) => <option key={m.slug} value={m.slug}>{m.nome}</option>)}</select>
          </label>
          <button className="g-btn verde" onClick={() => void liberar(false, email, slug)}>Liberar</button>
        </div>
      </section>

      <section className="g-pilha">
        <h2>Quem tem material</h2>
        {!compras.length ? <p className="g-muted">Ninguém ainda. As compras feitas na Cakto aparecem aqui sozinhas.</p> : (
          <div className="g-card g-lista" style={{ paddingBlock: 6 }}>
            {compras.map((c) => (
              <div key={c.id} className="g-linha">
                <span className="t"><b style={{ overflowWrap: "anywhere" }}>{c.email}</b><span>{nome(c.slug)} · {c.origem === "manual" ? "liberado na mão" : "comprou na Cakto"} · {dataCompleta(new Date(c.criado_em))}</span></span>
                <button className="g-btn p fantasma" onClick={() => void liberar(true, c.email, c.slug)}>Tirar</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
