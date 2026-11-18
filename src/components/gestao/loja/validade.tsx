"use client";

import { useMemo, useState } from "react";
import { CalendarX, PackageX, Trash2 } from "lucide-react";
import { novaChaveDeOperacao } from "@/lib/gestao/dinheiro";
import type { Produto } from "@/lib/gestao/tipos";
import { brl, dataCurta, semAcento, centavos } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Esqueleto, Folha, ok, useAvisos, useDados, useSomenteLeitura } from "../ui";
import { fmtQtd, lerQtd } from "./pecas";
import "./loja.css";

/**
 * Validade e lote, e kits, na tela Estoque (migração 20261201).
 * - Vencendo: lotes com saldo vencidos e que vencem em 30 e 60 dias (estoque_vencendo), com a quantidade e, para quem vê o
 *   financeiro, o valor a preço de custo; "Perda" dá baixa no lote num toque (lotes_baixar_perda, motivo "Vencido").
 * - Lotes de um produto (produto_lotes), para a ficha e para escolher o lote na saída.
 * - Produtos de um kit: a lista que a pessoa monta (kit_definir_itens grava).
 */

export type LoteVencendo = {
  lote_id: string; produto_id: string; nome: string; unidade: string; categoria: string | null; lote: string | null;
  validade: string; quantidade: number; dias: number; valor: number | null;
};
export type Vencimentos = { hoje: string; com_valor: boolean; lotes: LoteVencendo[] };
export type LoteDoProduto = { id: string; lote: string | null; validade: string | null; quantidade: number };

/** "vencido há 3 dias", "vence hoje", "vence em 12 dias". */
export function quandoVence(dias: number) {
  if (dias < 0) return dias === -1 ? "venceu ontem" : `vencido há ${-dias} dias`;
  if (dias === 0) return "vence hoje";
  return dias === 1 ? "vence amanhã" : `vence em ${dias} dias`;
}
/** "Lote A12 · 20/12/2026" */
export const nomeDoLote = (l: { lote: string | null; validade: string | null }) =>
  [l.lote ? `Lote ${l.lote}` : null, l.validade ? `validade ${dataCurta(l.validade)}/${l.validade.slice(0, 4)}` : null].filter(Boolean).join(" · ") || "Lote";

/** Lotes vencidos e vencendo em até 60 dias. Só para quem cuida do estoque ou do financeiro (`ativo`); erro vira nada. */
export function useVencimentos(ativo: boolean) {
  const { sb, petshop } = useGestao();
  return useDados(async () => {
    if (!ativo) return null;
    const r = await sb.rpc("estoque_vencendo", { p: petshop.id, p_dias: 60 });
    if (r.error || !r.data) return null;
    const d = r.data as unknown as Vencimentos;
    return { ...d, lotes: (d.lotes ?? []).map((l) => ({ ...l, quantidade: Number(l.quantidade), dias: Number(l.dias), valor: l.valor == null ? null : Number(l.valor) })) };
  }, [petshop.id, ativo]);
}

/** Resumo para os avisos: vencidos e vencendo em 30 dias (lotes) e o produto de cada um com a validade mais perto. */
export function resumoDaValidade(v: Vencimentos | null | undefined) {
  const lotes = v?.lotes ?? [];
  const vencidos = lotes.filter((l) => l.dias < 0), em30 = lotes.filter((l) => l.dias >= 0 && l.dias <= 30);
  const perto = new Map<string, LoteVencendo>();
  for (const l of lotes) if (!perto.has(l.produto_id)) perto.set(l.produto_id, l);
  return { vencidos, em30, perto };
}

const FAIXAS = [
  { id: "vencidos", titulo: "Vencidos", filtro: (l: LoteVencendo) => l.dias < 0 },
  { id: "30", titulo: "Vencem em até 30 dias", filtro: (l: LoteVencendo) => l.dias >= 0 && l.dias <= 30 },
  { id: "60", titulo: "Vencem em 31 a 60 dias", filtro: (l: LoteVencendo) => l.dias > 30 },
] as const;

/** A folha "Vencendo": vencidos e vencendo em 30 e 60 dias, com a baixa como perda. */
export function Vencendo({ dados, carregando, aoFechar, aoMudar, aoVerProduto, aoDarSaida }: {
  dados: Vencimentos | null | undefined; carregando: boolean; aoFechar: () => void; aoMudar: () => void;
  /** "Ver produto": abre a ficha do produto (a tela troca a folha). */
  aoVerProduto?: (produtoId: string) => void;
  /** "Dar baixa" num lote que ainda não venceu: abre a Saída do produto com o lote escolhido (venda, uso ou perda). */
  aoDarSaida?: (produtoId: string, loteId: string) => void;
}) {
  const { sb, petshop, posso } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [baixando, setBaixando] = useState<string | null>(null);
  const [feitos, setFeitos] = useState<Set<string>>(new Set());
  const lotes = (dados?.lotes ?? []).filter((l) => !feitos.has(l.lote_id));
  const comValor = Boolean(dados?.com_valor);
  const podeBaixar = posso("estoque");

  async function baixar(lista: LoteVencendo[], qual: string) {
    if (!lista.length || somenteLeitura()) return;
    setBaixando(qual);
    try {
      ok(await sb.rpc("lotes_baixar_perda", { p_petshop: petshop.id, p_lotes: lista.map((l) => l.lote_id), p_chave: novaChaveDeOperacao() }));
      setFeitos((f) => new Set([...f, ...lista.map((l) => l.lote_id)]));
      avisar(lista.length === 1 ? `${fmtQtd(lista[0].quantidade)} ${lista[0].unidade} de ${lista[0].nome} saíram como perda (vencido).` : `${lista.length} lotes saíram como perda (vencido).`);
      aoMudar();
    } catch (e) { avisarErro(e); } finally { setBaixando(null); }
  }
  async function baixarTodosVencidos() {
    const vencidos = lotes.filter((l) => l.dias < 0);
    if (!vencidos.length) return;
    const total = vencidos.reduce((t, l) => t + (l.valor ?? 0), 0);
    if (!(await confirmar({
      titulo: `Dar baixa em ${vencidos.length === 1 ? "1 lote vencido" : `${vencidos.length} lotes vencidos`}?`,
      texto: `Sai do estoque como perda (motivo "Vencido")${comValor && total > 0 ? `: ${brl(total)} a preço de custo` : ""}. Fica anotado no histórico de cada produto.`,
      confirmar: "Dar baixa", perigo: true,
    }))) return;
    await baixar(vencidos, "todos");
  }

  return (
    <Folha larga titulo="Vencendo" aoFechar={aoFechar} rodape={<button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>}>
      <div className="g-pilha g">
        <p className="g-muted g-p">Produtos com &quot;Controlar validade&quot;: cada entrada guarda a validade (e o lote, se tiver), e a venda tira primeiro do que vence antes.</p>
        {carregando && !dados ? <Esqueleto linhas={4} /> : !lotes.length ? (
          <p className="g-muted g-centro" style={{ padding: "24px 8px" }}>Nada vencido nem vencendo nos próximos 60 dias.</p>
        ) : FAIXAS.map((f) => {
          const lista = lotes.filter(f.filtro);
          if (!lista.length) return null;
          const qtd = lista.length, valor = lista.reduce((t, l) => t + (l.valor ?? 0), 0);
          return (
            <section key={f.id} className="g-val-faixa" data-faixa={f.id}>
              <div className="g-fila entre">
                <h3>{f.titulo} <small className="g-muted">({qtd === 1 ? "1 lote" : `${qtd} lotes`}{comValor && valor > 0 ? ` · ${brl(valor)} a preço de custo` : ""})</small></h3>
                {f.id === "vencidos" && podeBaixar && qtd > 1 && (
                  <button type="button" className="g-btn perigo p" disabled={baixando != null} onClick={() => void baixarTodosVencidos()}><Trash2 /> Dar baixa em todos</button>
                )}
              </div>
              <ul className="g-val-lista">
                {lista.map((l) => (
                  <li key={l.lote_id} className={l.dias < 0 ? "vencido" : l.dias <= 30 ? "perto" : ""}>
                    <span className="g-val-ico">{l.dias < 0 ? <PackageX /> : <CalendarX />}</span>
                    <span className="t">
                      <b>{l.nome}</b>
                      <span>{nomeDoLote(l)} · {quandoVence(l.dias)}</span>
                    </span>
                    <span className="g-val-num">
                      <b className="g-tab">{fmtQtd(l.quantidade)} {l.unidade}</b>
                      {comValor && l.valor != null && <small>{brl(l.valor)}</small>}
                    </span>
                    <span className="g-val-acoes">
                      {aoVerProduto && (
                        <button type="button" className="g-btn fantasma p" onClick={() => aoVerProduto(l.produto_id)} aria-label={`Ver produto: ${l.nome}`}>Ver produto</button>
                      )}
                      {podeBaixar && l.dias < 0 && (
                        <button type="button" className="g-btn sec p" disabled={baixando != null} onClick={() => void baixar([l], l.lote_id)}
                          aria-label={`Dar baixa como perda: ${l.nome}, ${nomeDoLote(l)}`}>{baixando === l.lote_id ? "…" : "Perda"}</button>
                      )}
                      {podeBaixar && l.dias >= 0 && aoDarSaida && (
                        <button type="button" className="g-btn sec p" onClick={() => aoDarSaida(l.produto_id, l.lote_id)}
                          aria-label={`Dar baixa: ${l.nome}, ${nomeDoLote(l)}`}>Dar baixa</button>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
        {podeBaixar && lotes.some((l) => l.dias < 0) && <p className="g-muted g-pp">&quot;Perda&quot; tira o lote inteiro do estoque, com o motivo &quot;Vencido&quot;. O dono vê em Alterações em valores.</p>}
        {podeBaixar && aoDarSaida && lotes.some((l) => l.dias >= 0) && <p className="g-muted g-pp">&quot;Dar baixa&quot; abre a saída do produto já com o lote escolhido: venda (numa promoção, por exemplo), uso no banho ou perda.</p>}
      </div>
    </Folha>
  );
}

/** Lotes com saldo de um produto, na ordem em que saem (o que vence antes primeiro). */
export function useLotesDoProduto(produtoId: string, ativo: boolean) {
  const { sb, petshop } = useGestao();
  return useDados(async () => {
    if (!ativo) return [] as LoteDoProduto[];
    const r = await sb.rpc("produto_lotes", { p: petshop.id, p_produto: produtoId });
    if (r.error) return [] as LoteDoProduto[];
    return ((r.data as unknown as LoteDoProduto[] | null) ?? []).map((l) => ({ ...l, quantidade: Number(l.quantidade) }));
  }, [petshop.id, produtoId, ativo]);
}

/** Na ficha: o saldo de cada lote e o que está sem lote. */
export function LotesDoProduto({ produto, lotes }: { produto: Produto; lotes: LoteDoProduto[] }) {
  const naLista = lotes.reduce((t, l) => t + l.quantidade, 0);
  const semLote = Math.max(0, Math.round((Number(produto.estoque) - naLista) * 1000) / 1000);
  const hoje = new Date().toISOString().slice(0, 10);
  if (!lotes.length) return <p className="g-muted g-pp">Nenhum lote com saldo. Na próxima entrada, preencha o lote e a validade.</p>;
  return (
    <ul className="g-val-lista">
      {lotes.map((l) => (
        <li key={l.id} className={l.validade && l.validade < hoje ? "vencido" : ""}>
          <span className="t"><b>{nomeDoLote(l)}</b>{l.validade && l.validade < hoje && <span>vencido</span>}</span>
          <span className="g-val-num"><b className="g-tab">{fmtQtd(l.quantidade)} {produto.unidade}</b></span>
        </li>
      ))}
      {semLote > 0 && (
        <li><span className="t"><b>Sem lote</b><span>entrou sem lote e validade</span></span><span className="g-val-num"><b className="g-tab">{fmtQtd(semLote)} {produto.unidade}</b></span></li>
      )}
    </ul>
  );
}

/* ---------- kits ---------- */

export type ItemDoKit = { componente_id: string; qtd: string };

/** Lê a composição gravada de um kit. */
export function useItensDoKit(kitId: string | null) {
  const { sb, petshop } = useGestao();
  return useDados(async () => {
    if (!kitId) return [] as { componente_id: string; quantidade: number }[];
    const r = ok(await sb.from("produtos_kit_itens").select("componente_id, quantidade").eq("petshop_id", petshop.id).eq("kit_id", kitId));
    return r.map((x) => ({ componente_id: x.componente_id, quantidade: Number(x.quantidade) }));
  }, [petshop.id, kitId]);
}

/** Confere a lista digitada; devolve o que vai para o banco ou a frase do erro. */
export function lerItensDoKit(itens: ItemDoKit[]): { componente_id: string; quantidade: number }[] | string {
  if (!itens.length) return "Escolha pelo menos um produto para o kit.";
  const r: { componente_id: string; quantidade: number }[] = [];
  for (const i of itens) {
    const q = lerQtd(i.qtd);
    if (!q || q <= 0) return "Confira as quantidades do kit: use só números, maior que zero.";
    r.push({ componente_id: i.componente_id, quantidade: q });
  }
  return r;
}

/**
 * Quantos kits dá para montar com o saldo de agora, e o custo do kit (a mesma conta do banco). Custo null quando falta o custo
 * de algum produto (ou a pessoa não vê o custo).
 */
export function contaDoKit(itens: { componente_id: string; quantidade: number }[], produtos: Produto[]) {
  let monta = Infinity, custo: number | null = 0;
  for (const i of itens) {
    const p = produtos.find((x) => x.id === i.componente_id);
    if (!p || !(i.quantidade > 0)) { monta = 0; custo = null; continue; }
    monta = Math.min(monta, Math.floor(Number(p.estoque) / i.quantidade));
    custo = custo == null || p.custo == null ? null : custo + Number(p.custo) * i.quantidade;
  }
  return { monta: itens.length && Number.isFinite(monta) ? Math.max(0, monta) : 0, custo: custo == null || !itens.length ? null : centavos(custo) };
}

/** A lista de produtos do kit: busca, quantidade de cada um e o que dá para montar. */
export function ProdutosDoKit({ itens, mudar, produtos, vejoCusto, kitId }: {
  itens: ItemDoKit[]; mudar: (i: ItemDoKit[]) => void; produtos: Produto[]; vejoCusto: boolean; kitId?: string;
}) {
  const [q, setQ] = useState("");
  const candidatos = useMemo(() => produtos.filter((p) => p.tipo !== "kit" && p.id !== kitId && p.ativo), [produtos, kitId]);
  const alvo = semAcento(q);
  const achados = alvo ? candidatos.filter((p) => !itens.some((i) => i.componente_id === p.id) && (semAcento(p.nome).includes(alvo) || (p.codigo_barras ?? "").includes(q.trim()))).slice(0, 6) : [];
  const lidos = lerItensDoKit(itens);
  const conta = typeof lidos === "string" ? null : contaDoKit(lidos, produtos);
  return (
    <div className="g-campo g-kit">
      <span>Produtos do kit</span>
      {itens.length > 0 && (
        <ul className="g-kit-lista">
          {itens.map((i, n) => {
            const p = produtos.find((x) => x.id === i.componente_id);
            return (
              <li key={i.componente_id}>
                <span className="t"><b>{p?.nome ?? "Produto"}</b><small>tem {fmtQtd(p?.estoque)} {p?.unidade}</small></span>
                <input className="g-input g-tab" inputMode="decimal" value={i.qtd} aria-label={`Quantidade de ${p?.nome ?? "produto"} no kit`}
                  onChange={(e) => mudar(itens.map((x, k) => (k === n ? { ...x, qtd: e.target.value } : x)))} />
                <small className="g-muted">{p?.unidade}</small>
                <button type="button" className="g-btn fantasma p" aria-label={`Tirar ${p?.nome ?? "produto"} do kit`} onClick={() => mudar(itens.filter((_, k) => k !== n))}>Tirar</button>
              </li>
            );
          })}
        </ul>
      )}
      <input className="g-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto para pôr no kit" aria-label="Buscar produto para pôr no kit" />
      {achados.length > 0 && (
        <div className="g-chips">
          {achados.map((p) => <button key={p.id} type="button" className="g-chip" onClick={() => { mudar([...itens, { componente_id: p.id, qtd: "1" }]); setQ(""); }}>+ {p.nome}</button>)}
        </div>
      )}
      {alvo && !achados.length && <small className="g-muted">Nenhum produto com esse nome (kit não entra em outro kit).</small>}
      {conta && (
        <small className="g-muted" role="status">
          Dá para montar {conta.monta === 1 ? "1 kit" : `${conta.monta} kits`} com o que tem hoje.{vejoCusto ? (conta.custo != null ? ` Custo do kit: ${brl(conta.custo)} (soma dos produtos).` : " Custo do kit: falta o custo de algum produto.") : ""}
        </small>
      )}
    </div>
  );
}
