"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import { Barcode, Minus, Plus, Search } from "lucide-react";
import { COLS_PRODUTO, comPrecosDeProduto } from "@/lib/gestao/reservado";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import { desenhoDoCodigo } from "@/lib/gestao/codigo-barras";
import { opcoesDaLoja } from "@/lib/gestao/loja-opcoes";
import type { Produto } from "@/lib/gestao/tipos";
import { brl, semAcento } from "@/lib/gestao/util";
import { useGestao } from "@/components/gestao/contexto";
import { Esqueleto, ok, useAvisos, useDados, useSomenteLeitura } from "@/components/gestao/ui";
import { ControlesDoPapel, useTituloDoPapel } from "@/components/gestao/papel";
import { CodigoDeBarras, nomeCurto } from "@/components/gestao/loja/etiqueta";
import { fmtQtd } from "@/components/gestao/loja/pecas";
import "./etiquetas.css";

/**
 * Etiquetas dos produtos para imprimir na mesma aba (com Voltar, como as outras folhas): nome, preço e código de barras.
 * Folha A4 de etiquetas adesivas (3 × 10 e 4 × 16) ou impressora de etiqueta (uma etiqueta por página, no tamanho dela).
 * `?p=<id>:<quantidade>,…` já vem com os produtos escolhidos (da ficha do produto ou de uma entrada no estoque).
 */
type Modelo = {
  id: string; nome: string; apoio: string; w: number; h: number; termica?: boolean; compacta?: boolean;
  cols?: number; rows?: number; gapX?: number; gapY?: number; nomeMax: number;
};
const MODELOS: Modelo[] = [
  { id: "a4-3x10", nome: "Folha A4, 3 × 10", apoio: "30 por folha · 63,5 × 25,4 mm", w: 63.5, h: 25.4, cols: 3, rows: 10, gapX: 2.5, gapY: 0, nomeMax: 48 },
  { id: "a4-4x16", nome: "Folha A4, 4 × 16", apoio: "64 por folha · 48,5 × 16,9 mm", w: 48.5, h: 16.9, cols: 4, rows: 16, gapX: 2, gapY: 0, compacta: true, nomeMax: 26 },
  { id: "t-40x25", nome: "Impressora de etiqueta 40 × 25 mm", apoio: "uma etiqueta por vez", w: 40, h: 25, termica: true, nomeMax: 34 },
  { id: "t-50x30", nome: "Impressora de etiqueta 50 × 30 mm", apoio: "uma etiqueta por vez", w: 50, h: 30, termica: true, nomeMax: 44 },
  { id: "t-60x40", nome: "Impressora de etiqueta 60 × 40 mm", apoio: "uma etiqueta por vez", w: 60, h: 40, termica: true, nomeMax: 60 },
];
const A4 = { w: 210, h: 297 };
const MAX_ETIQUETAS = 2000;
const PASSO = 60;

type Prod = Produto & { preco_venda: number | null };

/** "id:3,id:1" da URL. */
function lerEscolha(p: string | null): Record<string, number> {
  const r: Record<string, number> = {};
  for (const parte of (p ?? "").split(",")) {
    const [id, q] = parte.split(":");
    if (/^[0-9a-f-]{36}$/i.test(id ?? "")) r[id] = Math.max(1, Math.min(500, Math.round(Number(q) || 1)));
  }
  return r;
}

/** Quantas etiquetas para "uma por unidade": un, pacote e saco contam; kg, g, L e ml levam uma só. */
const etiquetasDoSaldo = (p: Pick<Produto, "estoque" | "unidade">) =>
  ["un", "pacote", "saco"].includes(p.unidade) ? Math.max(0, Math.min(500, Math.floor(Number(p.estoque)))) : Number(p.estoque) > 0 ? 1 : 0;

function Etiquetas() {
  const { sb, petshop, posso } = useGestao();
  const params = useSearchParams();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const op = opcoesDaLoja(petshop);
  useTituloDoPapel(`Etiquetas · ${petshop.nome}`);

  const { dados, carregando, erro, recarregar } = useDados(async () =>
    (await comPrecosDeProduto(sb, petshop.id, await lerTudo<{ id: string }>((de, ate, contar) => sb.from("produtos").select(COLS_PRODUTO, contando(contar)).eq("petshop_id", petshop.id).eq("ativo", true).order("nome").order("id").range(de, ate)))) as unknown as Prod[],
  [petshop.id]);
  const produtos = useMemo(() => dados ?? [], [dados]);

  const [modeloId, setModeloId] = useState(MODELOS[0].id);
  const modelo = MODELOS.find((m) => m.id === modeloId)!;
  const [escolha, setEscolha] = useState<Record<string, number>>(() => lerEscolha(params.get("p")));
  const [comPreco, setComPreco] = useState(true);
  const [pular, setPular] = useState("");
  const [q, setQ] = useState("");
  const [mostrar, setMostrar] = useState(PASSO);
  const [gerando, setGerando] = useState(false);
  useEffect(() => { setMostrar(PASSO); }, [q]);

  const mudar = (id: string, n: number) => setEscolha((e) => {
    const x = { ...e };
    const v = Math.max(0, Math.min(500, Math.round(n) || 0));
    if (v) x[id] = v; else delete x[id];
    return x;
  });
  const alvo = semAcento(q);
  const lista = produtos.filter((p) => !alvo || semAcento(p.nome).includes(alvo) || (p.codigo_barras ?? "").includes(q.trim()));
  const escolhidos = produtos.filter((p) => escolha[p.id]);
  const semCodigo = escolhidos.filter((p) => !p.codigo_barras);
  const naoDesenha = escolhidos.filter((p) => p.codigo_barras && !desenhoDoCodigo(p.codigo_barras));

  // as etiquetas na ordem da lista; as primeiras posições da folha podem ficar em branco (folha já usada)
  const etiquetas = useMemo(() => {
    const r: Prod[] = [];
    for (const p of escolhidos) for (let i = 0; i < escolha[p.id] && r.length < MAX_ETIQUETAS; i++) r.push(p);
    return r;
  }, [escolhidos, escolha]);
  const porFolha = modelo.termica ? 1 : modelo.cols! * modelo.rows!;
  const pulo = modelo.termica ? 0 : Math.max(0, Math.min(porFolha - 1, (Number(pular) || 1) - 1));
  const posicoes: (Prod | null)[] = [...Array(pulo).fill(null), ...etiquetas];
  const folhas: (Prod | null)[][] = [];
  for (let i = 0; i < posicoes.length; i += porFolha) folhas.push(posicoes.slice(i, i + porFolha));

  async function gerarCodigos() {
    if (somenteLeitura() || !semCodigo.length) return;
    setGerando(true);
    try {
      const r = ok(await sb.rpc("produtos_gerar_codigos", { p_petshop: petshop.id, p_produtos: semCodigo.map((p) => p.id) }));
      avisar(r.length === 1 ? `Código interno ${r[0].codigo_barras} guardado.` : `${r.length} códigos internos guardados.`);
      await recarregar();
    } catch (e) { avisarErro(e); } finally { setGerando(false); }
  }

  // prévia na tela: a folha A4 inteira diminui para caber na largura (no papel sai no tamanho de verdade)
  const caixa = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const el = caixa.current;
    if (!el || modelo.termica) { setZoom(1); return; }
    const medir = () => setZoom(Math.min(1, el.clientWidth / ((A4.w / 25.4) * 96)));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [modelo.termica, carregando]);

  const total = etiquetas.length;
  const margemX = modelo.termica ? 0 : (A4.w - (modelo.cols! * modelo.w + (modelo.cols! - 1) * modelo.gapX!)) / 2;
  const margemY = modelo.termica ? 0 : (A4.h - (modelo.rows! * modelo.h + (modelo.rows! - 1) * modelo.gapY!)) / 2;

  const etiqueta = (p: Prod | null, i: number, estilo?: CSSProperties) => (
    <div key={i} className={`g-et${modelo.compacta ? " compacta" : ""}${p ? "" : " vazia"}`} style={{ width: `${modelo.w}mm`, height: `${modelo.h}mm`, ...estilo }} data-produto={p?.id}>
      {p && (
        <>
          <div className="g-et-topo">
            <b className="nome" title={p.nome}>{nomeCurto(p.nome, modelo.nomeMax)}</b>
            {comPreco && p.preco_venda != null && <span className="preco">{brl(p.preco_venda)}</span>}
          </div>
          {p.codigo_barras ? <CodigoDeBarras codigo={p.codigo_barras} /> : <span className="sem">sem código</span>}
        </>
      )}
    </div>
  );

  return (
    <div className="g-imp g-et-tela">
      {/* tamanho e margem do papel desta impressão: A4 inteiro (a folha posiciona cada etiqueta) ou a etiqueta da impressora */}
      <style>{`@media print { @page { size: ${modelo.termica ? `${modelo.w}mm ${modelo.h}mm` : "A4"}; margin: 0; } }`}</style>
      <ControlesDoPapel voltar="/gestao/app/estoque" rotuloVoltar="Voltar para o estoque" botao={total ? `Imprimir ${total === 1 ? "1 etiqueta" : `${total} etiquetas`}` : "Imprimir"}
        dica="Na janela de impressão, deixe a escala em 100% (tamanho real) e as margens em Nenhuma.">
        <div className="g-campo">
          <span>Modelo da etiqueta</span>
          <div className="g-et-modelos" role="radiogroup" aria-label="Modelo da etiqueta">
            {MODELOS.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={modeloId === m.id} className="g-et-modelo" onClick={() => setModeloId(m.id)}>
                <b>{m.nome}</b><span>{m.apoio}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="g-imp-linha">
          <label className="g-check"><input type="checkbox" checked={comPreco} onChange={(e) => setComPreco(e.target.checked)} /><span>Mostrar o preço</span></label>
          {!modelo.termica && (
            <label className="g-et-pular">
              <span>Começar na etiqueta nº</span>
              <input className="g-input g-tab" inputMode="numeric" value={pular} onChange={(e) => setPular(e.target.value.replace(/\D/g, "").slice(0, 3))} placeholder="1" aria-label="Começar na etiqueta número" />
            </label>
          )}
        </div>

        <section className="g-card liso g-et-escolha" aria-label="Produtos das etiquetas">
          <div className="g-fila entre">
            <b>{total ? `${total === 1 ? "1 etiqueta" : `${total} etiquetas`}${!modelo.termica ? ` · ${folhas.length === 1 ? "1 folha" : `${folhas.length} folhas`}` : ""}` : "Escolha os produtos"}</b>
            {escolhidos.length > 0 && <button type="button" className="g-btn fantasma p" onClick={() => setEscolha({})}>Limpar</button>}
          </div>
          <div className="g-chips">
            <button type="button" className="g-chip" onClick={() => setEscolha(Object.fromEntries(produtos.filter((p) => Number(p.estoque) > 0).map((p) => [p.id, 1])))}>Todos com estoque: 1 de cada</button>
            <button type="button" className="g-chip" onClick={() => setEscolha(Object.fromEntries(produtos.map((p) => [p.id, etiquetasDoSaldo(p)]).filter(([, n]) => Number(n) > 0)))}>Todos com estoque: 1 por unidade</button>
          </div>
          {total >= MAX_ETIQUETAS && <p className="g-aviso" role="status"><span>No máximo {MAX_ETIQUETAS} etiquetas por vez. Imprima em partes.</span></p>}
          {semCodigo.length > 0 && (
            <div className="g-aviso" role="status">
              <Barcode />
              <span className="g-cresce">{semCodigo.length === 1 ? "1 produto escolhido está sem código de barras" : `${semCodigo.length} produtos escolhidos estão sem código de barras`}: a etiqueta sai só com o nome e o preço.{op.codigoBarras ? " Gere um código interno para o leitor achar o produto na venda." : " Para usar código interno, ligue Código de barras nas Opções da loja."}</span>
              {op.codigoBarras && posso("estoque") && (
                <button type="button" className="g-btn sec p" onClick={() => void gerarCodigos()} disabled={gerando}>{gerando ? "Gerando…" : "Gerar código interno"}</button>
              )}
            </div>
          )}
          {naoDesenha.length > 0 && <p className="g-muted g-pp">{naoDesenha.map((p) => p.nome).join(", ")}: o código tem letra com acento ou símbolo que a etiqueta não desenha. Corrija o código na ficha do produto.</p>}
          <div className="g-busca">
            <Search />
            <input className="g-input" placeholder="Buscar produto" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar produto para etiqueta" />
          </div>
          {erro ? <p className="g-erro">{erro}</p> : carregando && !dados ? <Esqueleto linhas={3} /> : !lista.length ? (
            <p className="g-muted g-p">{produtos.length ? "Nenhum produto com esse nome." : "Nenhum produto no estoque ainda."}</p>
          ) : (
            <div className="g-et-lista">
              {lista.slice(0, mostrar).map((p) => {
                const n = escolha[p.id] ?? 0;
                return (
                  <div key={p.id} className={`g-et-item${n ? " on" : ""}`}>
                    <span className="t">
                      <b>{p.nome}</b>
                      <span>tem {fmtQtd(p.estoque)} {p.unidade}{p.preco_venda != null ? ` · ${brl(p.preco_venda)}` : ""} · {p.codigo_barras ? p.codigo_barras : "sem código"}</span>
                    </span>
                    <span className="g-et-qtd">
                      <button type="button" className="g-btn sec p" aria-label={`Menos uma etiqueta de ${p.nome}`} onClick={() => mudar(p.id, n - 1)} disabled={!n}><Minus /></button>
                      <input className="g-input g-tab" inputMode="numeric" value={n ? String(n) : ""} placeholder="0" aria-label={`Etiquetas de ${p.nome}`}
                        onChange={(e) => mudar(p.id, Number(e.target.value.replace(/\D/g, "")))} />
                      <button type="button" className="g-btn sec p" aria-label={`Mais uma etiqueta de ${p.nome}`} onClick={() => mudar(p.id, n + 1)}><Plus /></button>
                    </span>
                  </div>
                );
              })}
              {lista.length > mostrar && <button type="button" className="g-btn sec" onClick={() => setMostrar(mostrar + PASSO)}>Mostrar mais ({lista.length - mostrar})</button>}
            </div>
          )}
        </section>
      </ControlesDoPapel>

      <div ref={caixa} className={`g-et-papel${modelo.termica ? " termica" : ""}`} aria-label="Etiquetas para imprimir">
        {!total ? (
          <p className="g-muted g-p g-et-nada">Escolha os produtos e a quantidade de etiquetas de cada um. A prévia aparece aqui.</p>
        ) : modelo.termica ? (
          posicoes.map((p, i) => etiqueta(p, i))
        ) : (
          folhas.map((f, k) => (
            <div key={k} className="g-et-folha" style={{ width: `${A4.w}mm`, height: `${A4.h}mm`, zoom }}>
              {f.map((p, i) => {
                const col = i % modelo.cols!, lin = Math.floor(i / modelo.cols!);
                return etiqueta(p, k * porFolha + i, { position: "absolute", left: `${margemX + col * (modelo.w + modelo.gapX!)}mm`, top: `${margemY + lin * (modelo.h + modelo.gapY!)}mm` });
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function Pagina() {
  return <Suspense fallback={<Esqueleto linhas={5} />}><Etiquetas /></Suspense>;
}
