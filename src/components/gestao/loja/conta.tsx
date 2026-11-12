"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Package, Plus, Scissors, Search, Sparkles, Trash2, Truck } from "lucide-react";
import type { ItemLancamento } from "@/lib/gestao/dinheiro";
import type { Banco } from "@/lib/gestao/supabase";
import type { Produto } from "@/lib/gestao/tipos";
import { brl, semAcento } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Tile } from "../painel";
import { ok, useDados } from "../ui";
import { CampoDinheiro, erroDeValor, EscolhaPagamento, fmtQtd, lerQtd, type EstadoPagamento } from "./pecas";
import "./venda.css";

/**
 * Peças comuns da comanda do atendimento e da venda no balcão:
 * linhas da conta, busca de produto, desconto, forma de pagamento, total e a baixa no estoque.
 */

/** Uma linha da conta enquanto ela está sendo montada. `valor` é o preço de uma unidade. */
export type ItemConta = {
  chave: string; tipo: ItemLancamento["tipo"]; nome: string; qtd: number; valor: number | null; produtoId?: string; unidade?: string;
};

export const LEVA_E_TRAZ = "Leva e traz";
const centavos = (n: number) => Math.round(n * 100) / 100;
let contador = 0;
export const novaChave = () => `item-${++contador}`;

export const valorDaLinha = (i: ItemConta) => centavos(i.qtd * (i.valor ?? 0));

/** Subtotal, desconto que cabe na conta e total a receber. */
export function fecharContas(itens: ItemConta[], desconto: number | null) {
  const subtotal = centavos(itens.reduce((t, i) => t + valorDaLinha(i), 0));
  const tirado = Math.min(Math.max(desconto ?? 0, 0), subtotal);
  return { subtotal, desconto: tirado, total: centavos(subtotal - tirado) };
}

/** Maior quantidade aceita numa linha da conta. */
export const QTD_MAXIMA = 9999;

/** O que impede de fechar a conta (valor negativo, valor ou quantidade grande demais), em português; null quando está tudo certo. */
export function erroDaConta(itens: ItemConta[], desconto: number | null, total: number): string | null {
  for (const i of itens) {
    const nome = i.nome.trim() || (i.tipo === "extra" ? "extra" : "item");
    const e = erroDeValor(i.valor, `O valor de ${nome}`);
    if (e) return e;
    if (i.qtd < 0) return `A quantidade de ${nome} não pode ser negativa.`;
    if (i.qtd > QTD_MAXIMA) return `A quantidade de ${nome} passa do máximo de ${fmtQtd(QTD_MAXIMA)}. Confira os números.`;
  }
  return erroDeValor(desconto, "O desconto") ?? erroDeValor(total, "O total da conta");
}

/** Produtos da conta que passam do saldo do estoque, com o texto da confirmação. */
export function faltaNoEstoque(itens: ItemConta[], produtos: Produto[]) {
  const linhas: string[] = [];
  for (const i of produtosDaConta(itens)) {
    const p = produtos.find((x) => x.id === i.produtoId);
    if (!p) continue;
    const saldo = Number(p.estoque);
    if (i.qtd > saldo) linhas.push(`${i.nome}: ${saldo > 0 ? `só há ${fmtQtd(saldo)} ${p.unidade} em estoque` : "sem saldo em estoque"} e a conta tem ${fmtQtd(i.qtd)}.`);
  }
  return linhas;
}

/** Produtos da conta com quantidade maior que zero. */
export const produtosDaConta = (itens: ItemConta[]) => itens.filter((i) => i.tipo === "produto" && i.produtoId && i.qtd > 0);

/** Põe o produto na conta; se já está, soma mais um. */
export function comProduto(itens: ItemConta[], p: Produto): ItemConta[] {
  if (itens.some((i) => i.produtoId === p.id)) return itens.map((i) => (i.produtoId === p.id ? { ...i, qtd: i.qtd + 1 } : i));
  return [...itens, { chave: novaChave(), tipo: "produto", nome: p.nome, qtd: 1, valor: p.preco_venda == null ? null : Number(p.preco_venda), produtoId: p.id, unidade: p.unidade }];
}

/** O que vai para `lancamentos.itens`: sem produto zerado e sem extra em branco. */
export function itensParaGravar(itens: ItemConta[]): ItemLancamento[] {
  return itens
    .filter((i) => (i.tipo === "produto" ? i.qtd > 0 : i.tipo === "extra" ? Boolean(i.nome.trim() || i.valor) : true))
    .map((i) => ({
      tipo: i.tipo, nome: i.nome.trim() || (i.tipo === "extra" ? "Extra" : "Item"), qtd: i.qtd, valor: i.valor ?? 0,
      ...(i.produtoId ? { produto_id: i.produtoId } : {}),
    }));
}

/** "1 Shampoo + 2 Petisco + Leva e traz": produtos e extras em uma linha, para a descrição do lançamento. */
export function resumoDosItens(itens: ItemLancamento[]) {
  return itens.filter((i) => i.tipo !== "servico").map((i) => (i.tipo === "produto" ? `${fmtQtd(i.qtd)} ${i.nome}` : i.nome)).join(" + ");
}

/** Corta uma descrição comprida sem quebrar a linha do extrato. */
export const encurtar = (s: string, max = 200) => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);

/** Saída de estoque de cada produto vendido, do mesmo jeito que a tela de Estoque anota uma venda. */
export async function baixarEstoque(sb: Banco, petshopId: string, userId: string, itens: ItemConta[]) {
  const linhas = produtosDaConta(itens).map((i) => ({
    petshop_id: petshopId, produto_id: i.produtoId!, tipo: "saida", quantidade: i.qtd, motivo: "Venda", criado_por: userId,
  }));
  if (linhas.length) ok(await sb.from("movimentos_estoque").insert(linhas).select("id"));
}

/** Produtos à venda, com o saldo de agora. */
export function useProdutosDaLoja() {
  const { sb, petshop } = useGestao();
  const { dados, carregando, erro } = useDados(async () =>
    ok(await sb.from("produtos").select("*").eq("petshop_id", petshop.id).eq("ativo", true).order("nome").limit(2000)) as Produto[],
  [petshop.id]);
  return { produtos: dados ?? [], carregando: carregando && !dados, erro };
}

/* ---------- busca de produto ---------- */

export function BuscaProduto({ produtos, carregando, erro, itens, aoEscolher, autoFocus }: {
  produtos: Produto[]; carregando: boolean; erro?: string | null; itens: ItemConta[]; aoEscolher: (p: Produto) => void; autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const alvo = semAcento(q);
  const achados = alvo ? produtos.filter((p) => semAcento(p.nome).includes(alvo) || semAcento(p.categoria ?? "").includes(alvo)).slice(0, 6) : [];
  return (
    <div className="g-pilha p">
      <div className="g-busca">
        <Search />
        <input className="g-input" placeholder="Buscar produto pelo nome" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar produto" autoFocus={autoFocus} />
      </div>
      {erro ? <p className="g-pp g-vermelho-t">{erro}</p>
        : alvo && carregando ? <p className="g-pp g-muted">Buscando os produtos…</p>
        : alvo && !achados.length ? <p className="g-pp g-muted">{produtos.length ? "Nenhum produto com esse nome." : "Ainda não tem produto no estoque."}</p>
        : achados.length > 0 && (
          <div className="g-lista g-vd-achados">
            {achados.map((p) => {
              const naConta = itens.find((i) => i.produtoId === p.id);
              const saldo = Number(p.estoque);
              return (
                <button key={p.id} type="button" className="g-linha" onClick={() => aoEscolher(p)}>
                  <Tile icone={Package} tom="rosa" tamanho="p" />
                  <span className="t">
                    <b>{p.nome}</b>
                    <span>{saldo > 0 ? `${fmtQtd(saldo)} ${p.unidade} no estoque` : "sem saldo no estoque"}{naConta ? ` · ${fmtQtd(naConta.qtd)} na conta` : ""}</span>
                  </span>
                  <span className="d"><b>{p.preco_venda != null ? brl(p.preco_venda) : "sem preço"}</b></span>
                  <span className="g-vd-mais" aria-hidden><Plus /></span>
                </button>
              );
            })}
          </div>
        )}
    </div>
  );
}

/* ---------- linha da conta ---------- */

/** Quantidade com − e +. Aceita fração ("0,5") para o que vende por peso. */
function CampoQtd({ valor, aoMudar, nome }: { valor: number; aoMudar: (n: number) => void; nome: string }) {
  const [texto, setTexto] = useState(fmtQtd(valor));
  const ultimo = useRef(valor);
  useEffect(() => {
    if (valor !== ultimo.current) { ultimo.current = valor; setTexto(fmtQtd(valor)); }
  }, [valor]);
  const por = (n: number) => { const v = Math.min(QTD_MAXIMA, Math.max(0, Math.round(n * 1000) / 1000)); ultimo.current = v; setTexto(fmtQtd(v)); aoMudar(v); };
  return (
    <span className="g-vd-qtd">
      <button type="button" onClick={() => por(valor - 1)} disabled={valor <= 0} aria-label={`Menos um: ${nome}`}><Minus /></button>
      <input className="g-tab" inputMode="decimal" value={texto} aria-label={`Quantidade de ${nome}`}
        onChange={(e) => { setTexto(e.target.value); const n = lerQtd(e.target.value); if (n != null) { ultimo.current = n; aoMudar(n); } }}
        onBlur={() => setTexto(fmtQtd(ultimo.current))} />
      <button type="button" onClick={() => por(valor + 1)} aria-label={`Mais um: ${nome}`}><Plus /></button>
    </span>
  );
}

/** Uma linha da conta: serviço (só o preço muda), produto (quantidade e preço) ou extra (descrição e valor). */
export function LinhaDaConta({ item, produto, aoMudar, aoTirar, apoio }: {
  item: ItemConta; produto?: Produto; aoMudar: (m: Partial<ItemConta>) => void; aoTirar?: () => void; apoio?: string;
}) {
  const ehProduto = item.tipo === "produto", ehExtra = item.tipo === "extra";
  const saldo = produto ? Number(produto.estoque) : null;
  const falta = ehProduto && saldo != null && item.qtd > saldo;
  const nome = item.nome.trim() || (ehExtra ? "extra" : "item");
  return (
    <div className="g-vd-item">
      {ehProduto ? <Tile icone={Package} tom="rosa" /> : ehExtra ? <Tile icone={item.nome === LEVA_E_TRAZ ? Truck : Sparkles} tom="ceu" /> : <Tile icone={Scissors} tom="pessego" />}
      {ehExtra ? (
        <input className="g-input g-vd-nome" value={item.nome} maxLength={60} placeholder="O que é? Ex.: hidratação" aria-label="Descrição do extra"
          onChange={(e) => aoMudar({ nome: e.target.value })} />
      ) : (
        <div className="t">
          <b>{item.nome}</b>
          <span>{ehProduto ? (saldo == null ? "Produto" : saldo > 0 ? `${fmtQtd(saldo)} ${item.unidade ?? "un"} no estoque` : "sem saldo no estoque") : apoio ?? "Serviço"}</span>
        </div>
      )}
      <b className="g-vd-soma g-tab">{brl(valorDaLinha(item))}</b>
      <div className="g-vd-ctrl">
        {ehProduto && <CampoQtd valor={item.qtd} aoMudar={(qtd) => aoMudar({ qtd })} nome={item.nome} />}
        <label className="g-vd-preco">
          <span>{ehProduto ? "cada" : "Valor"}</span>
          <CampoDinheiro valor={item.valor} aoMudar={(valor) => aoMudar({ valor })} />
        </label>
        {aoTirar && <button type="button" className="g-ico" onClick={aoTirar} aria-label={`Tirar ${nome} da conta`}><Trash2 /></button>}
      </div>
      {falta && (
        <p className="g-vd-falta">
          {saldo! > 0 ? `No estoque só tem ${fmtQtd(saldo)} ${item.unidade ?? "un"}.` : "Este produto está sem saldo no estoque."} Dá para vender assim mesmo: o sistema pede uma confirmação.
        </p>
      )}
      {(erroDeValor(item.valor) || item.qtd > QTD_MAXIMA) && (
        <p className="g-vd-falta erro" role="alert">{erroDeValor(item.valor) ?? `A quantidade passa do máximo de ${fmtQtd(QTD_MAXIMA)}.`}</p>
      )}
    </div>
  );
}

/* ---------- desconto, pagamento e total ---------- */

/** "Cliente paga depois": a conta fica em A receber, com o dia combinado. */
export type PagaDepois = { ativo: boolean; quando: string };

export function FechamentoDaConta({ subtotal, desconto, total, descontoDigitado, aoDesconto, pagamento, aoPagamento, comPagamento = true, erroForma, depois, aoDepois }: {
  subtotal: number; desconto: number; total: number; descontoDigitado: number | null; aoDesconto: (v: number | null) => void;
  pagamento: EstadoPagamento; aoPagamento: (e: EstadoPagamento) => void; comPagamento?: boolean; erroForma?: string | null;
  /** Só na conta do atendimento: deixa escolher "Cliente paga depois". */
  depois?: PagaDepois; aoDepois?: (d: PagaDepois) => void;
}) {
  const passou = (descontoDigitado ?? 0) > subtotal && subtotal > 0;
  return (
    <>
      {comPagamento && (
        <>
          <label className="g-campo g-vd-desconto">
            <span>Desconto em reais (se tiver)</span>
            <CampoDinheiro valor={descontoDigitado} aoMudar={aoDesconto} />
            {passou && <small>O desconto não passa do valor da conta.</small>}
          </label>
          {depois && aoDepois && total > 0 && (
            <div className="g-seg g-pg-quando" role="group" aria-label="Quando o cliente paga">
              <button type="button" aria-pressed={!depois.ativo} onClick={() => aoDepois({ ...depois, ativo: false })}>Paga agora</button>
              <button type="button" aria-pressed={depois.ativo} onClick={() => aoDepois({ ...depois, ativo: true })}>Cliente paga depois</button>
            </div>
          )}
          {depois?.ativo && aoDepois && total > 0 ? (
            <label className="g-campo">
              <span>Quando vai pagar</span>
              <input type="date" className="g-input" value={depois.quando} onChange={(e) => aoDepois({ ...depois, quando: e.target.value })} />
              <small>A conta fica anotada em Financeiro, A receber, e na ficha do tutor. Quando o cliente pagar, é só dar baixa.</small>
              {erroForma && <small className="erro" role="alert">{erroForma}</small>}
            </label>
          ) : <EscolhaPagamento valor={pagamento} aoMudar={aoPagamento} total={total} erro={erroForma} />}
        </>
      )}
      <div className="g-vd-total" role="status">
        <div>
          <span className="g-rotulo">Total</span>
          <p className="g-num">{brl(total)}</p>
        </div>
        {desconto > 0 && (
          <div className="g-vd-contas g-tab">
            <span>Soma {brl(subtotal)}</span>
            <span>Desconto − {brl(desconto)}</span>
          </div>
        )}
      </div>
    </>
  );
}
