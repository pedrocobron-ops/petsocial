"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Hourglass, MessageCircle, PackageX, ShoppingCart, Truck, Wallet } from "lucide-react";
import { analisarCompra, lerMovimentosDaCompra, PERIODOS, textoDasSemanas, num1, type LinhaDaCompra } from "@/lib/gestao/compra";
import { guardarLembrado, lerLembrado } from "../lembrado";
import type { Produto } from "@/lib/gestao/tipos";
import { brl } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { Kpi } from "../painel";
import { Esqueleto, Folha, useDados } from "../ui";
import { PedidoDeReposicao, type Fornecedor } from "./fornecedores";
import { fmtQtd } from "./pecas";
import "./loja.css";

const COBRIR = [1, 2, 3, 4] as const;
const SEM_FORNECEDOR = "sem";

/** Quantas semanas cobrir e quantas olhar para trás: ficam lembradas no aparelho. */
function lembradoNum(chave: string, padrao: number, aceitos: readonly number[]) {
  const n = Number(lerLembrado(chave));
  return aceitos.includes(n) ? n : padrao;
}

type Grupo = { id: string; fornecedor: Fornecedor | null; nome: string; linhas: LinhaDaCompra[] };

/**
 * "O que comprar": a sugestão de compra de cada produto, pelo que saiu de verdade nas últimas semanas, separada pelo último
 * fornecedor, e a análise do estoque (parados, acabando, valor em estoque). Um toque num fornecedor vira o pedido de
 * reposição pelo WhatsApp com as quantidades sugeridas (que a pessoa muda antes de mandar).
 * Valores em R$ só para quem vê o financeiro.
 */
export default function OQueComprar({ produtos, fornecedores, comFornecedores, aoFechar }: {
  produtos: Produto[]; fornecedores: Fornecedor[]; comFornecedores: boolean; aoFechar: () => void;
}) {
  const { sb, petshop, vejoFinanceiro } = useGestao();
  const [cobrir, setCobrir] = useState(() => lembradoNum("gestao:compra:cobrir", 2, COBRIR));
  const [periodo, setPeriodo] = useState(() => lembradoNum("gestao:compra:periodo", 6, PERIODOS));
  const [pedido, setPedido] = useState<Grupo | null>(null);

  const { dados: movs, carregando, erro, recarregar } = useDados(() => lerMovimentosDaCompra(sb, petshop.id), [petshop.id]);
  const analise = useMemo(() => (movs ? analisarCompra(produtos, movs, { semanasPeriodo: periodo, semanasCobrir: cobrir }) : null), [produtos, movs, periodo, cobrir]);

  const grupos = useMemo(() => {
    if (!analise) return [] as Grupo[];
    const m = new Map<string, Grupo>();
    for (const l of analise.linhas) {
      if (l.estado !== "comprar") continue;
      const f = comFornecedores && l.produto.fornecedor_id ? fornecedores.find((x) => x.id === l.produto.fornecedor_id) ?? null : null;
      const id = f?.id ?? SEM_FORNECEDOR;
      if (!m.has(id)) m.set(id, { id, fornecedor: f, nome: f ? f.nome : comFornecedores ? "Sem fornecedor" : "Lista de compras", linhas: [] });
      m.get(id)!.linhas.push(l);
    }
    // fornecedores por nome; "sem fornecedor" no fim
    return [...m.values()].sort((a, b) => Number(a.id === SEM_FORNECEDOR) - Number(b.id === SEM_FORNECEDOR) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [analise, fornecedores, comFornecedores]);

  if (pedido) {
    return (
      <PedidoDeReposicao fornecedor={pedido.fornecedor} produtos={pedido.linhas.map((l) => produtos.find((p) => p.id === l.produto.id)!).filter(Boolean)}
        iniciais={Object.fromEntries(pedido.linhas.map((l) => [l.produto.id, l.sugestao ?? 0]))}
        explicacao={`Quantidades sugeridas para ${cobrir === 1 ? "1 semana" : `${cobrir} semanas`}, pelo que saiu nas últimas ${periodo} semanas. Mude o que quiser (0 tira o produto do pedido), confira a mensagem e mande: nada é enviado sozinho.`}
        aoFechar={() => setPedido(null)} />
    );
  }

  const suficientes = analise?.linhas.filter((l) => l.estado === "suficiente") ?? [];
  const semVendas = analise?.linhas.filter((l) => l.estado === "sem_vendas") ?? [];
  const nComprar = grupos.reduce((t, g) => t + g.linhas.length, 0);

  return (
    <Folha larga titulo="O que comprar" aoFechar={aoFechar} rodape={<button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>}>
      <div className="g-pilha g">
        <div className="g-pilha p">
          <div className="g-campo">
            <span>Comprar para quantas semanas?</span>
            <div className="g-chips" role="group" aria-label="Semanas para cobrir">
              {COBRIR.map((n) => <button key={n} type="button" className="g-chip" aria-pressed={cobrir === n} onClick={() => { setCobrir(n); guardarLembrado("gestao:compra:cobrir", String(n)); }}>{n === 1 ? "1 semana" : `${n} semanas`}</button>)}
            </div>
          </div>
          <div className="g-campo">
            <span>Olhar o que saiu nas últimas</span>
            <div className="g-chips" role="group" aria-label="Semanas olhadas">
              {PERIODOS.map((n) => <button key={n} type="button" className="g-chip" aria-pressed={periodo === n} onClick={() => { setPeriodo(n); guardarLembrado("gestao:compra:periodo", String(n)); }}>{n} semanas</button>)}
            </div>
          </div>
          <p className="g-muted g-pp">A conta: o que saiu por semana (vendas e uso no banho) × as semanas escolhidas + o estoque mínimo, menos o que tem hoje. Arredonda para cima e, se o produto vem em caixa, para caixas inteiras. Saldo corrigido não conta; perda ou vencido aparece à parte.</p>
        </div>

        {erro ? (
          <div className="g-pilha p"><p className="g-erro">{erro}</p><div><button type="button" className="g-btn sec p" onClick={() => void recarregar()}>Tentar de novo</button></div></div>
        ) : carregando && !analise ? <Esqueleto linhas={4} /> : analise && (
          <>
            <section className="g-pilha p" aria-label="Análise de estoque">
              <h3>Análise de estoque</h3>
              <div className="g-grade kpis g-lj-compra-kpis">
                <Kpi icone={AlertTriangle} tom="manteiga" rotulo="Acabando" valor={analise.acabando.length}
                  apoio={analise.acabando.length ? "zerados, no mínimo ou para menos de 1 semana" : "nada acabando"} />
                <Kpi icone={Hourglass} tom="lilas" rotulo="Parados há 60+ dias" valor={analise.parados.length}
                  apoio={!analise.parados.length ? "tudo saiu nos últimos 60 dias" : vejoFinanceiro && analise.valorParado != null ? `${brl(analise.valorParado)} a preço de custo` : "com saldo e nada saiu"} />
                {vejoFinanceiro && (
                  <Kpi icone={Wallet} tom="menta" rotulo="Valor em estoque" valor={analise.valorEmEstoque != null ? brl(analise.valorEmEstoque) : "–"}
                    apoio={analise.semCusto ? `custo × quantidade · ${analise.semCusto} sem custo` : "custo × quantidade"} />
                )}
              </div>
              {analise.acabando.length > 0 && (
                <details className="g-lj-det">
                  <summary>Ver os {analise.acabando.length === 1 ? "1 que está acabando" : `${analise.acabando.length} que estão acabando`}</summary>
                  <ul>{analise.acabando.map((l) => <li key={l.produto.id}><b>{l.produto.nome}</b> · tem {fmtQtd(l.produto.estoque)} {l.produto.unidade}{Number(l.produto.estoque_minimo) > 0 ? ` (mínimo ${fmtQtd(l.produto.estoque_minimo)})` : ""}{l.semanasRestam != null ? ` · dá para ${textoDasSemanas(l.semanasRestam)}` : " · sem vendas recentes"}</li>)}</ul>
                </details>
              )}
              {analise.parados.length > 0 && (
                <details className="g-lj-det">
                  <summary>Ver os parados há 60 dias ou mais</summary>
                  <ul>{analise.parados.map((p) => <li key={p.id}><b>{p.nome}</b> · tem {fmtQtd(p.estoque)} {p.unidade}{vejoFinanceiro && p.custo != null ? ` · ${brl(Number(p.custo) * Number(p.estoque))} a preço de custo` : ""} · nada saiu nos últimos 60 dias</li>)}</ul>
                </details>
              )}
              {analise.perdas.length > 0 && (
                <p className="g-muted g-pp">Perda ou vencido nas últimas {periodo} semanas (fora da média): {analise.perdas.map((x) => `${x.produto.nome} ${fmtQtd(x.quantidade)} ${x.produto.unidade}`).join(", ")}.</p>
              )}
            </section>

            <section className="g-pilha" aria-label="Para comprar">
              <h3>{nComprar ? (nComprar === 1 ? "1 produto para comprar" : `${nComprar} produtos para comprar`) : "Nada para comprar agora"}</h3>
              {!nComprar && <p className="g-muted g-p">Com o que saiu nas últimas {periodo} semanas, o estoque de hoje dá para {cobrir === 1 ? "1 semana" : `${cobrir} semanas`} (contando o mínimo).</p>}
              {grupos.map((g) => (
                <div key={g.id} className="g-card liso g-lj-grupo">
                  <div className="g-lj-grupo-cab">
                    <span className="t"><b><Truck aria-hidden /> {g.nome}</b><span>{g.linhas.length === 1 ? "1 produto" : `${g.linhas.length} produtos`}</span></span>
                    <button type="button" className="g-btn pri p" onClick={() => setPedido(g)}>
                      {g.fornecedor ? <><MessageCircle /> Montar pedido</> : <><ShoppingCart /> Montar lista</>}
                    </button>
                  </div>
                  {g.linhas.map((l) => <LinhaCompra key={l.produto.id} l={l} />)}
                </div>
              ))}
            </section>

            {suficientes.length > 0 && (
              <details className="g-lj-det">
                <summary>Com estoque para {cobrir === 1 ? "1 semana" : `${cobrir} semanas`} ({suficientes.length})</summary>
                {suficientes.map((l) => <LinhaCompra key={l.produto.id} l={l} />)}
              </details>
            )}
            {semVendas.length > 0 && (
              <details className="g-lj-det">
                <summary><PackageX aria-hidden /> Sem vendas recentes ({semVendas.length})</summary>
                <p className="g-muted g-pp">Nada saiu nas últimas {periodo} semanas: sem sugestão. Se precisar, compre pelo Pedido de reposição do fornecedor.</p>
                {semVendas.map((l) => <LinhaCompra key={l.produto.id} l={l} />)}
              </details>
            )}
          </>
        )}
      </div>
    </Folha>
  );
}

function LinhaCompra({ l }: { l: LinhaDaCompra }) {
  const p = l.produto;
  return (
    <div className="g-lj-sug" data-produto={p.nome}>
      <div className="t">
        <b>{p.nome}</b>
        <span>
          tem {fmtQtd(p.estoque)} {p.unidade}
          {l.porSemana != null ? ` · ${num1(l.porSemana)} por semana · dá para ${textoDasSemanas(l.semanasRestam)}` : " · sem vendas recentes"}
          {l.perdido > 0 ? ` · perdeu ${fmtQtd(l.perdido)}` : ""}
        </span>
        <small>{l.explicacao}</small>
      </div>
      {l.estado === "comprar" && (
        <div className="q" aria-label={`Comprar ${fmtQtd(l.sugestao)} ${p.unidade} de ${p.nome}`}>
          <small>Comprar</small>
          <b>{fmtQtd(l.sugestao)}</b>
          <small>{l.caixas ? `${l.caixas} ${l.caixas === 1 ? "caixa" : "caixas"}` : p.unidade}</small>
        </div>
      )}
    </div>
  );
}
