"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Minus, Plus, X } from "lucide-react";
import { useGestao } from "../contexto";

type Pagina = { getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void> } };
type Documento = { numPages: number; getPage: (n: number) => Promise<Pagina>; destroy: () => Promise<void> };

const chaveDaPagina = (slug: string) => `maestro-gestao:escola:pagina:${slug}`;

/**
 * Leitor do material dentro do sistema: mostra o PDF página por página, no celular e no computador,
 * e lembra onde a pessoa parou. O arquivo só é entregue a quem comprou (a regra está no banco).
 */
export default function Leitor({ slug, titulo, aoFechar }: { slug: string; titulo: string; aoFechar: () => void }) {
  const { sb } = useGestao();
  const [doc, setDoc] = useState<Documento | null>(null);
  const [arquivo, setArquivo] = useState<Blob | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [atual, setAtual] = useState(1);
  const rolo = useRef<HTMLDivElement>(null);

  // busca o arquivo e abre
  useEffect(() => {
    let vale = true; let aberto: Documento | null = null;
    (async () => {
      try {
        const m = await sb.from("escola_materiais").select("arquivo").eq("slug", slug).maybeSingle();
        if (m.error) throw new Error(m.error.message);
        if (!m.data) throw new Error("Este material ainda não está disponível para leitura aqui. Ele chegou no seu e-mail, pela Cakto.");
        const baixado = await sb.storage.from("escola").download(m.data.arquivo);
        if (baixado.error || !baixado.data) throw new Error("Não consegui abrir o material. Confira a internet e tente de novo.");
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.min.mjs", import.meta.url).toString();
        const d = (await pdfjs.getDocument({ data: await baixado.data.arrayBuffer() }).promise) as unknown as Documento;
        aberto = d;
        if (!vale) { void d.destroy(); return; }
        setArquivo(baixado.data);
        setDoc(d);
      } catch (e) { if (vale) setErro(e instanceof Error ? e.message : "Não consegui abrir o material."); }
    })();
    return () => { vale = false; void aberto?.destroy(); };
  }, [sb, slug]);

  // trava a página de trás e fecha com Esc
  useEffect(() => {
    const antes = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    document.addEventListener("keydown", tecla);
    return () => { document.documentElement.style.overflow = antes; document.removeEventListener("keydown", tecla); };
  }, [aoFechar]);

  // volta para a página em que a pessoa parou
  useEffect(() => {
    if (!doc) return;
    let n = 1;
    try { n = Math.min(doc.numPages, Math.max(1, Number(localStorage.getItem(chaveDaPagina(slug)) ?? 1) || 1)); } catch { /* sem memória */ }
    if (n > 1) setTimeout(() => rolo.current?.querySelector(`[data-pagina="${n}"]`)?.scrollIntoView({ block: "start" }), 150);
  }, [doc, slug]);

  function viu(n: number) {
    setAtual(n);
    try { localStorage.setItem(chaveDaPagina(slug), String(n)); } catch { /* sem memória */ }
  }

  function baixar() {
    if (!arquivo) return;
    const url = URL.createObjectURL(arquivo);
    const a = document.createElement("a");
    a.href = url; a.download = `${slug}.pdf`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="g-leitor" role="dialog" aria-modal="true" aria-label={`Lendo: ${titulo}`}>
      <header className="g-leitor-topo">
        <button className="g-ico" onClick={aoFechar} aria-label="Fechar o material"><X /></button>
        <div className="g-leitor-t"><b>{titulo}</b>{doc && <span>Página {atual} de {doc.numPages}</span>}</div>
        <div className="g-leitor-acoes">
          <button className="g-ico" onClick={() => setZoom((z) => Math.max(0.6, Math.round((z - 0.2) * 10) / 10))} aria-label="Diminuir" disabled={!doc || zoom <= 0.6}><Minus /></button>
          <button className="g-ico" onClick={() => setZoom((z) => Math.min(2.4, Math.round((z + 0.2) * 10) / 10))} aria-label="Aumentar" disabled={!doc || zoom >= 2.4}><Plus /></button>
          <button className="g-ico" onClick={baixar} aria-label="Baixar o PDF" disabled={!arquivo}><Download /></button>
        </div>
      </header>
      <div className="g-leitor-rolo" ref={rolo}>
        {erro ? <p className="g-leitor-aviso" role="alert">{erro}</p>
          : !doc ? <p className="g-leitor-aviso">Abrindo o material…</p>
          : Array.from({ length: doc.numPages }, (_, i) => <Folha key={`${i}-${zoom}`} doc={doc} numero={i + 1} zoom={zoom} raiz={rolo} aoVer={viu} />)}
      </div>
    </div>
  );
}

/** Uma página: só é desenhada quando chega perto da tela, para um manual de 150 páginas não pesar. */
function Folha({ doc, numero, zoom, raiz, aoVer }: { doc: Documento; numero: number; zoom: number; raiz: React.RefObject<HTMLDivElement | null>; aoVer: (n: number) => void }) {
  const caixa = useRef<HTMLDivElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const [proporcao, setProporcao] = useState(1.414);
  const desenhada = useRef(false);
  const ver = useRef(aoVer);
  ver.current = aoVer;

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    let vale = true;
    const desenhar = async () => {
      if (desenhada.current || !tela.current) return;
      desenhada.current = true;
      try {
        const pagina = await doc.getPage(numero);
        const base = pagina.getViewport({ scale: 1 });
        if (!vale) return;
        setProporcao(base.height / base.width);
        const largura = el.clientWidth;
        const escala = (largura / base.width) * Math.min(2, window.devicePixelRatio || 1);
        const viewport = pagina.getViewport({ scale: escala });
        const c = tela.current;
        c.width = Math.floor(viewport.width); c.height = Math.floor(viewport.height);
        await pagina.render({ canvasContext: c.getContext("2d")!, viewport }).promise;
      } catch { desenhada.current = false; }
    };
    const perto = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) void desenhar(); }, { root: raiz.current, rootMargin: "800px 0px" });
    const naTela = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) ver.current(numero); }, { root: raiz.current, rootMargin: "-45% 0px -45% 0px" });
    perto.observe(el); naTela.observe(el);
    return () => { vale = false; perto.disconnect(); naTela.disconnect(); };
  }, [doc, numero, raiz]);

  return (
    <div ref={caixa} data-pagina={numero} className="g-leitor-pag" style={{ width: `min(${Math.round(zoom * 100)}%, ${Math.round(900 * zoom)}px)`, aspectRatio: `1 / ${proporcao}` }}>
      <canvas ref={tela} aria-label={`Página ${numero}`} />
    </div>
  );
}
