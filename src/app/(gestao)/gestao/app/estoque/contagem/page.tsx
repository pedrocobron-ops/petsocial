"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "@/components/gestao/link-depois";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, ClipboardCheck, CloudOff, Download, Minus, Pause, Play, Plus, Printer, Search, X } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { Kpi } from "@/components/gestao/painel";
import { Campo, Esqueleto, Folha, ok, useAvisos, useDados, useSomenteLeitura, Vazio } from "@/components/gestao/ui";
import { fmtQtd, lerQtd } from "@/components/gestao/loja/pecas";
import { LerComCamera } from "@/components/gestao/loja/leitor";
import { useFornecedores } from "@/components/gestao/loja/fornecedores";
import { baixarPlanilha, dinheiroCsv, numeroCsv, type Cel } from "@/components/gestao/financeiro/comum";
import { diferencaDoItem, lerContagem, linhasDaPlanilha, totaisDaContagem, valorDaDiferenca, type Contagem, type ContagemNaLista, type ItemDaContagem } from "@/lib/gestao/contagem";
import { novaChaveDeOperacao } from "@/lib/gestao/dinheiro";
import { limparCodigo, opcoesDaLoja } from "@/lib/gestao/loja-opcoes";
import { brl, dataCurta, hora, semAcento } from "@/lib/gestao/util";
import "./contagem.css";

/**
 * Contagem de estoque (inventário), migração 20261201. Começar (todos os produtos, uma categoria ou um fornecedor), contar no
 * celular (leitor de código de barras, + e −), pausar e continuar, revisar as diferenças e "Ajustar estoque" de uma vez
 * (contagem_ajustar: um movimento "Contagem" por produto com diferença). O que é contado fica primeiro no aparelho e vai ao
 * banco aos poucos: sem internet, continua contando e manda quando voltar. Histórico com quem e quando, folha e planilha.
 */
const PASSO = 80;
const guardado = (id: string) => `gestao:contagem:${id}`;
function lerGuardado(id: string): Record<string, number | null> {
  try { const v = JSON.parse(localStorage.getItem(guardado(id)) ?? "{}"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
function guardar(id: string, v: Record<string, number | null>) {
  try { if (Object.keys(v).length) localStorage.setItem(guardado(id), JSON.stringify(v)); else localStorage.removeItem(guardado(id)); } catch { /* sem armazenamento: só não guarda */ }
}
const sinal = (n: number) => (n > 0 ? `+${fmtQtd(n)}` : n < 0 ? `−${fmtQtd(-n)}` : "0");
const sinalBrl = (n: number) => (n > 0 ? `+${brl(n)}` : n < 0 ? `−${brl(-n)}` : brl(0));
const STATUS: Record<Contagem["status"], string> = { aberta: "Contando", pausada: "Pausada", concluida: "Estoque ajustado", cancelada: "Cancelada" };

function Tela() {
  const params = useSearchParams();
  const id = params.get("id");
  const { posso } = useGestao();
  if (!posso("estoque")) return <Vazio titulo="A contagem de estoque é com quem cuida do estoque." texto="Se você precisa contar, peça para o dono liberar a área Estoque." />;
  return id ? <UmaContagem key={id} id={id} /> : <Lista />;
}

export default function Pagina() {
  return <Suspense fallback={<Esqueleto linhas={5} />}><Tela /></Suspense>;
}

/* ---------- lista e começar ---------- */

function Lista() {
  const { sb, petshop, vejoCusto } = useGestao();
  const router = useRouter();
  const [comecando, setComecando] = useState(false);
  const { dados, carregando, erro, recarregar } = useDados(async () =>
    ((ok(await sb.rpc("contagens_lista", { p: petshop.id })) as unknown as ContagemNaLista[]) ?? []), [petshop.id]);
  const abertas = (dados ?? []).filter((c) => c.status === "aberta" || c.status === "pausada");
  const feitas = (dados ?? []).filter((c) => c.status === "concluida" || c.status === "cancelada");
  return (
    <>
      <header className="g-topo">
        <div>
          <Link className="g-btn fantasma p g-cont-voltar" href="/gestao/app/estoque"><ArrowLeft /> Estoque</Link>
          <h1>Contagem de estoque</h1>
          <p className="g-muted">Conte o que tem na prateleira, confira as diferenças e ajuste o estoque de uma vez.</p>
        </div>
        <div className="g-acoes"><button className="g-btn pri" onClick={() => setComecando(true)}><ClipboardCheck /> Começar contagem</button></div>
      </header>
      {erro && <p className="g-erro" role="alert">{erro} <button className="g-btn sec p" onClick={() => void recarregar()}>Tentar de novo</button></p>}
      {carregando && !dados ? <Esqueleto linhas={4} /> : (
        <div className="g-pilha g">
          {abertas.length > 0 && (
            <section>
              <h2 className="g-cont-t">Em andamento</h2>
              <ul className="g-cont-lista">
                {abertas.map((c) => (
                  <li key={c.id} className="g-card">
                    <span className="t"><b>{c.nome}</b><span>{STATUS[c.status]} · {c.contados} de {c.itens} contados · começou {dataCurta(c.criado_em)} às {hora(c.criado_em)}{c.criado_por_nome ? ` por ${c.criado_por_nome}` : ""}</span></span>
                    <Link className="g-btn pri p" href={`/gestao/app/estoque/contagem?id=${c.id}`}><Play /> Continuar</Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section>
            <h2 className="g-cont-t">Histórico</h2>
            {!feitas.length ? <p className="g-muted g-p">Nenhuma contagem terminada ainda.</p> : (
              <ul className="g-cont-lista">
                {feitas.map((c) => (
                  <li key={c.id} className="g-card">
                    <span className="t">
                      <b>{c.nome}</b>
                      <span>{c.status === "cancelada" ? "Cancelada" : `${c.ajustados === 1 ? "1 produto ajustado" : `${c.ajustados ?? 0} produtos ajustados`}${vejoCusto && c.diferenca_valor != null ? ` · ${sinalBrl(Number(c.diferenca_valor))}` : ""}`}</span>
                      <span>Começou {dataCurta(c.criado_em)}{c.criado_por_nome ? ` por ${c.criado_por_nome}` : ""}{c.concluida_em ? ` · ajustou ${dataCurta(c.concluida_em)} às ${hora(c.concluida_em)}${c.concluida_por_nome ? ` por ${c.concluida_por_nome}` : ""}` : ""}</span>
                    </span>
                    <span className="g-fila">
                      <Link className="g-btn sec p" href={`/gestao/app/estoque/contagem?id=${c.id}`}>Ver</Link>
                      <Link className="g-btn sec p" href={`/gestao/app/estoque/contagem/imprimir?id=${c.id}`} aria-label={`Imprimir ${c.nome}`}><Printer /></Link>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
      {comecando && <Comecar aoFechar={() => setComecando(false)} aoComecar={(nova) => router.push(`/gestao/app/estoque/contagem?id=${nova}`)} />}
    </>
  );
}

function Comecar({ aoFechar, aoComecar }: { aoFechar: () => void; aoComecar: (id: string) => void }) {
  const { sb, petshop } = useGestao();
  const { avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const op = opcoesDaLoja(petshop);
  const { fornecedores } = useFornecedores(op.fornecedores);
  const [modo, setModo] = useState<"todos" | "categoria" | "fornecedor">("todos");
  const [categoria, setCategoria] = useState("");
  const [fornecedor, setFornecedor] = useState("");
  const [salvando, setSalvando] = useState(false);
  const chave = useRef(novaChaveDeOperacao());
  const { dados: categorias } = useDados(async () => {
    const r = ok(await sb.from("produtos").select("categoria").eq("petshop_id", petshop.id).eq("ativo", true).not("categoria", "is", null).limit(1000));
    return [...new Set(r.map((x) => (x.categoria ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [petshop.id]);

  async function comecar() {
    if (somenteLeitura()) return;
    if (modo === "categoria" && !categoria) { avisarErro("Escolha a categoria."); return; }
    if (modo === "fornecedor" && !fornecedor) { avisarErro("Escolha o fornecedor."); return; }
    setSalvando(true);
    try {
      const id = ok(await sb.rpc("contagem_iniciar", { p_petshop: petshop.id, p_categoria: (modo === "categoria" ? categoria : null) as string, p_fornecedor: (modo === "fornecedor" ? fornecedor : null) as string, p_chave: chave.current }));
      aoComecar(String(id));
    } catch (e) { avisarErro(e); setSalvando(false); }
  }

  return (
    <Folha titulo="Começar contagem" aoFechar={aoFechar}
      rodape={<>
        <button className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button className="g-btn pri" onClick={() => void comecar()} disabled={salvando}>{salvando ? "Começando…" : "Começar"}</button>
      </>}>
      <div className="g-form">
        <div className="g-campo">
          <span>O que contar?</span>
          <div className="g-chips" role="group" aria-label="O que contar">
            <button type="button" className="g-chip" aria-pressed={modo === "todos"} onClick={() => setModo("todos")}>Todos os produtos</button>
            <button type="button" className="g-chip" aria-pressed={modo === "categoria"} onClick={() => setModo("categoria")}>Uma categoria</button>
            {op.fornecedores && fornecedores.length > 0 && <button type="button" className="g-chip" aria-pressed={modo === "fornecedor"} onClick={() => setModo("fornecedor")}>Um fornecedor</button>}
          </div>
        </div>
        {modo === "categoria" && (
          <Campo rotulo="Categoria">
            <select className="g-select" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Categoria">
              <option value="">Escolha</option>
              {(categorias ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Campo>
        )}
        {modo === "fornecedor" && (
          <Campo rotulo="Fornecedor">
            <select className="g-select" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} aria-label="Fornecedor">
              <option value="">Escolha</option>
              {fornecedores.filter((f) => f.ativo).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          </Campo>
        )}
        <p className="g-muted g-pp">Kits não entram (o saldo deles vem dos produtos). Dá para pausar e continuar depois, até em outro aparelho.</p>
      </div>
    </Folha>
  );
}

/* ---------- uma contagem: contar, revisar, ajustar ---------- */

function UmaContagem({ id }: { id: string }) {
  const { sb, petshop } = useGestao();
  const router = useRouter();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const op = opcoesDaLoja(petshop);
  const { dados, carregando, erro, recarregar } = useDados(async () => lerContagem(ok(await sb.rpc("contagem_ler", { p_contagem: id }))), [id]);
  const c = dados;
  const aberta = c ? c.status === "aberta" || c.status === "pausada" : false;

  // o que foi contado neste aparelho e ainda não foi ao banco (fica guardado: sem internet, não se perde)
  const [pendente, setPendente] = useState<Record<string, number | null>>(() => lerGuardado(id));
  // o que já foi ao banco nesta tela (até a próxima leitura trazer de volta)
  const [gravados, setGravados] = useState<Record<string, number | null>>({});
  const [semInternet, setSemInternet] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const pendRef = useRef(pendente);
  pendRef.current = pendente;
  useEffect(() => { guardar(id, pendente); }, [id, pendente]);

  const enviar = useCallback(async (): Promise<boolean> => {
    const lote = { ...pendRef.current };
    const chaves = Object.keys(lote);
    if (!chaves.length) return true;
    setEnviando(true);
    try {
      const r = await sb.rpc("contagem_marcar", { p_contagem: id, p_itens: chaves.map((k) => ({ produto_id: k, contado: lote[k] })) });
      if (r.error) {
        if (/concluída|cancelada/.test(r.error.message)) { setPendente({}); void recarregar(); return false; }
        throw new Error(r.error.message);
      }
      // tira só o que foi mandado e não mudou enquanto ia; a leitura nova traz o esperado de cada um
      setGravados((g) => ({ ...g, ...lote }));
      setPendente((p) => { const x = { ...p }; for (const k of chaves) if (x[k] === lote[k]) delete x[k]; return x; });
      setSemInternet(false);
      void recarregar();
      return true;
    } catch { setSemInternet(true); return false; } finally { setEnviando(false); }
  }, [sb, id, recarregar]);

  // manda aos poucos: um segundo depois do último toque; sem internet, tenta de novo a cada 10 s e quando a internet volta
  const nPend = Object.keys(pendente).length;
  useEffect(() => {
    if (!nPend || !aberta) return;
    const t = window.setTimeout(() => void enviar(), semInternet ? 10000 : 1000);
    return () => window.clearTimeout(t);
  }, [pendente, nPend, aberta, semInternet, enviar]);
  useEffect(() => {
    const voltou = () => void enviar();
    window.addEventListener("online", voltou);
    return () => window.removeEventListener("online", voltou);
  }, [enviar]);

  const naTelaObj = useMemo(() => {
    // o que voltou do banco já vale; o gravado agora há pouco, até a leitura chegar; o que ainda vai, por cima
    const g = { ...gravados };
    for (const i of dados?.itens ?? []) if (i.produto_id in g && g[i.produto_id] === i.contado) delete g[i.produto_id];
    return { ...g, ...pendente };
  }, [gravados, pendente, dados]);
  const contadoNaTela = (i: ItemDaContagem) => (i.produto_id in naTelaObj ? naTelaObj[i.produto_id] : i.contado);
  const mudar = (i: ItemDaContagem, v: number | null) => {
    if (somenteLeitura()) return;
    setPendente((p) => ({ ...p, [i.produto_id]: v == null ? null : Math.max(0, Math.round(v * 1000) / 1000) }));
  };

  const [modo, setModo] = useState<"contar" | "revisar">("contar");
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<"faltam" | "contados" | "todos">("todos");
  const [mostrar, setMostrar] = useState(PASSO);
  const [destaque, setDestaque] = useState<string | null>(null);
  const [ajustando, setAjustando] = useState(false);
  useEffect(() => { setMostrar(PASSO); }, [q, filtro]);

  const naTela = useMemo(() => new Map(Object.entries(naTelaObj)), [naTelaObj]);
  const totais = useMemo(() => totaisDaContagem(c?.itens ?? [], naTela), [c, naTela]);

  if (erro) return <p className="g-erro" role="alert">{erro} <button className="g-btn sec p" onClick={() => void recarregar()}>Tentar de novo</button></p>;
  if (carregando && !c) return <Esqueleto linhas={6} />;
  if (!c) return null;

  const alvo = semAcento(q);
  const codigo = limparCodigo(q);
  const lista = c.itens.filter((i) => {
    const cont = contadoNaTela(i);
    if (filtro === "faltam" && cont != null) return false;
    if (filtro === "contados" && cont == null) return false;
    return !alvo || semAcento(i.nome).includes(alvo) || (codigo != null && (i.codigo_barras ?? "") === codigo);
  });

  /** Leitor (ou Enter na busca): código achado soma 1 nesse produto. */
  function lido(texto: string) {
    const cod = limparCodigo(texto);
    const achado = cod ? c!.itens.find((i) => i.codigo_barras === cod) : null;
    if (!achado) {
      const porNome = c!.itens.filter((i) => semAcento(i.nome).includes(semAcento(texto)));
      if (porNome.length === 1) { setDestaque(porNome[0].produto_id); return; }
      avisarErro(cod ? "Esse código não está nesta contagem." : "Nenhum produto com esse nome nesta contagem.");
      return;
    }
    mudar(achado, (contadoNaTela(achado) ?? 0) + 1);
    setDestaque(achado.produto_id);
    setQ("");
    avisar(`${achado.nome}: ${fmtQtd((contadoNaTela(achado) ?? 0) + 1)} ${achado.unidade}`);
  }

  async function pausar() {
    await enviar();
    try { ok(await sb.rpc("contagem_status", { p_contagem: id, p_status: "pausada" })); } catch (e) { avisarErro(e); return; }
    avisar(nPend && semInternet ? "Contagem pausada. O que foi contado sem internet fica guardado neste aparelho." : "Contagem pausada. Continue quando quiser.");
    router.push("/gestao/app/estoque/contagem");
  }
  async function cancelar() {
    if (!(await confirmar({ titulo: "Cancelar esta contagem?", texto: "Nada muda no estoque. A contagem fica no histórico como cancelada.", confirmar: "Cancelar contagem", perigo: true, voltar: "Continuar contando" }))) return;
    try { ok(await sb.rpc("contagem_status", { p_contagem: id, p_status: "cancelada" })); setPendente({}); router.push("/gestao/app/estoque/contagem"); } catch (e) { avisarErro(e); }
  }
  async function revisar() {
    const foi = await enviar();
    if (!foi && Object.keys(pendRef.current).length) { avisarErro("Sem internet: a revisão precisa mandar o que foi contado. Tente de novo quando a internet voltar."); return; }
    await recarregar();
    setModo("revisar");
    window.scrollTo({ top: 0 });
  }
  async function ajustar() {
    if (somenteLeitura()) return;
    if (!totais.contados) { avisarErro("Conte pelo menos um produto."); return; }
    const foi = await enviar();
    if (!foi && Object.keys(pendRef.current).length) { avisarErro("Sem internet agora. Tente de novo quando a internet voltar."); return; }
    if (!(await confirmar({
      titulo: "Ajustar o estoque?",
      texto: `${totais.comDiferenca === 0 ? "Nenhum produto contado tem diferença: a contagem só fica registrada." : `${totais.comDiferenca === 1 ? "1 produto muda" : `${totais.comDiferenca} produtos mudam`} de saldo (motivo "Contagem").`}${totais.faltamContar ? ` ${totais.faltamContar === 1 ? "1 produto não contado fica" : `${totais.faltamContar} produtos não contados ficam`} como está.` : ""}${c!.com_valor && totais.valor ? ` Diferença: ${sinalBrl(totais.valor)} a preço de custo.` : ""}`,
      confirmar: "Ajustar estoque",
    }))) return;
    setAjustando(true);
    try {
      const r = ok(await sb.rpc("contagem_ajustar", { p_contagem: id })) as unknown as { ajustados: number };
      avisar(r.ajustados ? `Estoque ajustado: ${r.ajustados === 1 ? "1 produto" : `${r.ajustados} produtos`}.` : "Contagem registrada. Nenhum saldo precisou mudar.");
      setPendente({});
      await recarregar();
    } catch (e) { avisarErro(e); } finally { setAjustando(false); }
  }
  function planilha() {
    // números como número; as colunas de custo e valor (6 e 7, só com valor) como dinheiro
    const linhas = linhasDaPlanilha(c!).map((l, n) => l.map((x, k): Cel =>
      n === 0 || typeof x !== "number" ? String(x ?? "") : c!.com_valor && (k === 6 || k === 7) ? dinheiroCsv(x) : numeroCsv(x)));
    baixarPlanilha(linhas, `${c!.nome.replace(/[^\p{L}\p{N} _-]+/gu, "-")}.csv`);
  }

  const fechada = !aberta;
  const revisao = fechada || modo === "revisar";

  return (
    <>
      <header className="g-topo">
        <div>
          <Link className="g-btn fantasma p g-cont-voltar" href="/gestao/app/estoque/contagem"><ArrowLeft /> Contagens</Link>
          <h1>{c.nome}</h1>
          <p className="g-muted">
            {STATUS[c.status]} · começou {dataCurta(c.criado_em)} às {hora(c.criado_em)}{c.criado_por_nome ? ` por ${c.criado_por_nome}` : ""}
            {c.concluida_em ? ` · ajustou ${dataCurta(c.concluida_em)} às ${hora(c.concluida_em)}${c.concluida_por_nome ? ` por ${c.concluida_por_nome}` : ""}` : ""}
          </p>
        </div>
        <div className="g-acoes">
          <Link className="g-btn sec" href={`/gestao/app/estoque/contagem/imprimir?id=${id}`}><Printer /> Imprimir</Link>
          <button className="g-btn sec" onClick={planilha}><Download /> Planilha</button>
          {aberta && <button className="g-btn sec" onClick={() => void pausar()}><Pause /> Pausar</button>}
        </div>
      </header>

      <div className="g-grade kpis g-cont-kpis">
        <Kpi icone={ClipboardCheck} tom="menta" rotulo="Contados" valor={`${totais.contados} de ${totais.total}`} apoio={totais.faltamContar ? `faltam ${totais.faltamContar}` : "todos contados"} />
        <Kpi icone={Minus} tom="rosa" rotulo="Com diferença" valor={totais.comDiferenca} apoio={totais.comDiferenca ? `${totais.sobra ? `sobra ${fmtQtd(totais.sobra)}` : ""}${totais.sobra && totais.falta ? " · " : ""}${totais.falta ? `falta ${fmtQtd(totais.falta)}` : ""}` : "nenhuma até agora"} />
        {c.com_valor && <Kpi icone={Check} tom="manteiga" rotulo="Diferença em R$" valor={sinalBrl(fechada && c.diferenca_valor != null ? c.diferenca_valor : totais.valor)} apoio={totais.semCusto ? `${totais.semCusto} sem custo` : "a preço de custo"} />}
      </div>

      {aberta && (nPend > 0 || semInternet) && (
        <p className={`g-aviso${semInternet ? " vermelho" : ""}`} role="status" data-teste="contagem-pendente">
          {semInternet ? <CloudOff /> : null}
          <span className="g-cresce">{semInternet
            ? `Sem internet: ${nPend === 1 ? "1 contagem guardada" : `${nPend} contagens guardadas`} neste aparelho. Continue contando: vai sozinho quando a internet voltar.`
            : enviando ? "Guardando…" : `${nPend === 1 ? "1 contagem" : `${nPend} contagens`} para guardar…`}</span>
        </p>
      )}

      {aberta && (
        <div className="g-chips g-cont-modo" role="tablist" aria-label="Contar ou revisar">
          <button type="button" role="tab" className="g-chip" aria-selected={modo === "contar"} aria-pressed={modo === "contar"} onClick={() => setModo("contar")}>Contar</button>
          <button type="button" role="tab" className="g-chip" aria-selected={modo === "revisar"} aria-pressed={modo === "revisar"} onClick={() => void revisar()}>Revisar diferenças</button>
        </div>
      )}

      {!revisao ? (
        <div className="g-pilha">
          <div className="g-busca">
            <Search />
            <input className="g-input" placeholder={op.codigoBarras ? "Buscar ou passar o leitor (soma 1)" : "Buscar produto"} value={q} aria-label="Buscar produto ou passar o leitor"
              onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && q.trim()) { e.preventDefault(); lido(q); } }} />
          </div>
          {op.codigoBarras && <div><LerComCamera aoLer={lido} continuo /></div>}
          <div className="g-chips">
            {([["todos", "Todos"], ["faltam", "Faltam contar"], ["contados", "Contados"]] as const).map(([f, r]) => (
              <button key={f} type="button" className="g-chip" aria-pressed={filtro === f} onClick={() => setFiltro(f)}>{r}{f === "faltam" ? ` (${totais.faltamContar})` : f === "contados" ? ` (${totais.contados})` : ""}</button>
            ))}
          </div>
          {!lista.length ? <p className="g-muted g-centro" style={{ padding: "24px 8px" }}>{filtro === "faltam" ? "Tudo contado." : "Nenhum produto aqui."}</p> : (
            <ul className="g-cont-itens">
              {lista.slice(0, mostrar).map((i) => {
                const cont = contadoNaTela(i);
                const dif = diferencaDoItem(i, i.produto_id in naTelaObj ? naTelaObj[i.produto_id] : undefined);
                return (
                  <li key={i.produto_id} className={`g-card${cont != null ? " contado" : ""}${destaque === i.produto_id ? " destaque" : ""}`} data-produto={i.nome}>
                    <span className="t">
                      <b>{i.nome}</b>
                      <span>{cont == null ? `no sistema: ${fmtQtd(i.saldo)} ${i.unidade}` : dif ? `diferença ${sinal(dif)} ${i.unidade}` : "bateu com o sistema"}</span>
                    </span>
                    <span className="g-cont-qtd">
                      <button type="button" className="g-ico" aria-label={`Menos 1 de ${i.nome}`} onClick={() => mudar(i, Math.max(0, (cont ?? 0) - 1))}><Minus /></button>
                      <CampoContado valor={cont} aoMudar={(v) => mudar(i, v)} rotulo={`Quanto contou de ${i.nome}`} />
                      <button type="button" className="g-ico" aria-label={`Mais 1 de ${i.nome}`} onClick={() => mudar(i, (cont ?? 0) + 1)}><Plus /></button>
                    </span>
                    {cont != null && <button type="button" className="g-ico g-cont-limpar" aria-label={`Limpar a contagem de ${i.nome}`} onClick={() => mudar(i, null)}><X /></button>}
                  </li>
                );
              })}
            </ul>
          )}
          {lista.length > mostrar && <button type="button" className="g-btn sec" style={{ justifySelf: "center" }} onClick={() => setMostrar(mostrar + PASSO)}>Mostrar mais ({lista.length - mostrar})</button>}
          <div className="g-fila g-cont-pe">
            <button type="button" className="g-btn pri" onClick={() => void revisar()}>Revisar diferenças</button>
            <button type="button" className="g-btn fantasma" onClick={() => void cancelar()}>Cancelar contagem</button>
          </div>
        </div>
      ) : (
        <Revisao c={c} naTela={naTela} fechada={fechada} ajustando={ajustando} aoAjustar={() => void ajustar()} aoVoltar={() => setModo("contar")} />
      )}
    </>
  );
}

/** Quantidade contada: digita (vírgula ou ponto) ou usa + e −. Vazio = não contado. */
function CampoContado({ valor, aoMudar, rotulo }: { valor: number | null; aoMudar: (v: number | null) => void; rotulo: string }) {
  const [texto, setTexto] = useState(valor == null ? "" : fmtQtd(valor));
  const editando = useRef(false);
  useEffect(() => { if (!editando.current) setTexto(valor == null ? "" : fmtQtd(valor)); }, [valor]);
  return (
    <input className="g-input g-tab" inputMode="decimal" value={texto} aria-label={rotulo} placeholder="–"
      onFocus={(e) => { editando.current = true; e.target.select(); }}
      onBlur={() => { editando.current = false; setTexto(valor == null ? "" : fmtQtd(valor)); }}
      onChange={(e) => {
        setTexto(e.target.value);
        if (!e.target.value.trim()) { aoMudar(null); return; }
        const n = lerQtd(e.target.value.replace(/\./g, ","));
        if (n != null) aoMudar(n);
      }} />
  );
}

function Revisao({ c, naTela, fechada, ajustando, aoAjustar, aoVoltar }: {
  c: Contagem; naTela: Map<string, number | null>; fechada: boolean; ajustando: boolean; aoAjustar: () => void; aoVoltar: () => void;
}) {
  const [todos, setTodos] = useState(false);
  const linhas = c.itens.map((i) => {
    const tela = naTela.has(i.produto_id) ? naTela.get(i.produto_id) : undefined;
    const contado = tela !== undefined ? tela : i.contado;
    const dif = contado == null ? null : diferencaDoItem(i, tela);
    return { i, contado, dif, valor: valorDaDiferenca(i, dif) };
  });
  const comDif = linhas.filter((l) => l.dif);
  const mostradas = todos ? linhas : comDif;
  const t = totaisDaContagem(c.itens, naTela);
  return (
    <div className="g-pilha g">
      {!fechada && <p className="g-muted g-p">Confira antes de ajustar. A diferença é sobre o saldo do sistema na hora em que cada produto foi contado: o que vendeu depois não se perde.</p>}
      <div className="g-chips">
        <button type="button" className="g-chip" aria-pressed={!todos} onClick={() => setTodos(false)}>Só com diferença ({comDif.length})</button>
        <button type="button" className="g-chip" aria-pressed={todos} onClick={() => setTodos(true)}>Todos ({linhas.length})</button>
      </div>
      {!mostradas.length ? <p className="g-muted g-centro" style={{ padding: "20px 8px" }}>{t.contados ? "Nenhuma diferença: o que foi contado bate com o sistema." : "Nada contado ainda."}</p> : (
        <div className="g-cont-tab-caixa">
          <table className="g-cont-tab">
            <colgroup><col /><col className="c-n" /><col className="c-n" /><col className="c-n" />{c.com_valor && <col className="c-v" />}</colgroup>
            <thead><tr><th>Produto</th><th className="n">Sistema</th><th className="n">Contou</th><th className="n">Diferença</th>{c.com_valor && <th className="n">Valor</th>}</tr></thead>
            <tbody>
              {mostradas.map(({ i, contado, dif, valor }) => (
                <tr key={i.produto_id} className={dif ? (dif < 0 ? "falta" : "sobra") : undefined}>
                  <td>{i.nome}<small>{i.unidade}</small></td>
                  <td className="n">{fmtQtd(i.esperado ?? i.ajustado_de ?? i.saldo)}</td>
                  <td className="n">{contado == null ? "–" : fmtQtd(contado)}</td>
                  <td className="n"><b>{dif == null ? "–" : sinal(dif)}</b></td>
                  {c.com_valor && <td className="n">{valor == null ? (dif ? "sem custo" : "–") : sinalBrl(valor)}</td>}
                </tr>
              ))}
            </tbody>
            {c.com_valor && (
              <tfoot>
                <tr><td colSpan={4}>Total da diferença</td><td className="n"><b>{sinalBrl(fechada && c.diferenca_valor != null ? c.diferenca_valor : t.valor)}</b></td></tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {!fechada ? (
        <>
          {t.faltamContar > 0 && <p className="g-muted g-pp">{t.faltamContar === 1 ? "1 produto não contado fica" : `${t.faltamContar} produtos não contados ficam`} com o saldo de hoje.</p>}
          <div className="g-fila g-cont-pe">
            <button type="button" className="g-btn verde" onClick={aoAjustar} disabled={ajustando}><Check /> {ajustando ? "Ajustando…" : "Ajustar estoque"}</button>
            <button type="button" className="g-btn sec" onClick={aoVoltar}>Voltar a contar</button>
          </div>
        </>
      ) : c.status === "concluida" ? (
        <p className="g-muted g-pp">Estoque ajustado: cada produto com diferença ganhou um movimento &quot;Contagem&quot; no histórico dele.</p>
      ) : <p className="g-muted g-pp">Contagem cancelada: nada mudou no estoque.</p>}
    </div>
  );
}
