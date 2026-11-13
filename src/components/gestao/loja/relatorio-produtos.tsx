"use client";

import { useMemo, useState } from "react";
import { Coins, Download, Package, ShoppingBag, TrendingUp } from "lucide-react";
import { opcoesDaLoja, pct } from "@/lib/gestao/loja-opcoes";
import { margemDaLinha, vendasPorProduto, type LinhaProduto, type SaidaLida, type VendaLida } from "@/lib/gestao/loja-vendas";
import { itensDoLancamento } from "@/lib/gestao/dinheiro";
import { usaModulo } from "@/lib/gestao/modulos";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import { COLS_PRODUTO, comCustos } from "@/lib/gestao/reservado";
import type { Produto } from "@/lib/gestao/tipos";
import { brl, dataCompleta, deIsoDia } from "@/lib/gestao/util";
import { useGestao } from "../contexto";
import { baixarPlanilha, dinheiroCsv, numeroCsv, paginar, type Cel } from "../financeiro/comum";
import { Kpi, Ranking, Tile } from "../painel";
import { Esqueleto, useAvisos, useDados } from "../ui";
import { fmtQtd } from "./pecas";
import "./loja.css";

const ORDENS = [
  { id: "receita", rotulo: "Receita" },
  { id: "unidades", rotulo: "Vendidos" },
  { id: "margem", rotulo: "Margem" },
  { id: "pct", rotulo: "Margem %" },
  { id: "nome", rotulo: "Nome" },
] as const;
type Ordem = (typeof ORDENS)[number]["id"];

const temProduto = (l: { itens: unknown }) => itensDoLancamento(l).some((i) => i.tipo === "produto" && i.qtd > 0);

/**
 * Bloco "Produtos" dos Relatórios: vendas por produto no período, com custo e margem.
 * Só aparece para quem usa a loja e ligou "Margem e custo médio" nas opções da loja.
 */
export default function RelatorioProdutos({ de, ate }: { de: string; ate: string }) {
  const { petshop } = useGestao();
  if (!usaModulo(petshop, "loja") || !opcoesDaLoja(petshop).margem) return null;
  return <Bloco de={de} ate={ate} />;
}

function Bloco({ de, ate }: { de: string; ate: string }) {
  const { sb, petshop } = useGestao();
  const { avisar } = useAvisos();
  const [ordem, setOrdem] = useState<Ordem>("receita");
  const [todos, setTodos] = useState(false);
  const [todosParados, setTodosParados] = useState(false);

  const { dados, carregando, erro } = useDados(async () => {
    const [vendas, fiado, saidas, produtos] = await Promise.all([
      paginar<VendaLida>((a, b) => sb.from("lancamentos").select("id, valor, itens").eq("petshop_id", petshop.id).eq("pago", true).eq("tipo", "entrada")
        .is("movimento", null).not("itens", "is", null).gte("data", de).lte("data", ate).order("data").order("id").range(a, b)),
      paginar<VendaLida>((a, b) => sb.from("lancamentos").select("id, valor, itens").eq("petshop_id", petshop.id).eq("pago", false).eq("tipo", "entrada")
        .not("itens", "is", null).gte("data", de).lte("data", ate).order("data").order("id").range(a, b)),
      paginar<SaidaLida & { id: string }>((a, b) => sb.rpc("custos_das_vendas", { p: petshop.id, p_de: de, p_ate: ate }).order("id").range(a, b)),
      lerTudo<{ id: string }>((a, b, contar) => sb.from("produtos").select(COLS_PRODUTO, contando(contar)).eq("petshop_id", petshop.id).order("nome").order("id").range(a, b))
        .then((l) => comCustos(sb, petshop.id, l)) as Promise<unknown> as Promise<Produto[]>,
    ]);
    return { vendas: vendas.filter(temProduto), aReceber: fiado.filter(temProduto).length, saidas, produtos };
  }, [petshop.id, de, ate]);

  const r = useMemo(() => {
    if (!dados) return null;
    const nomes = new Map(dados.produtos.map((p) => [p.id, p.nome]));
    const unidade = new Map(dados.produtos.map((p) => [p.id, p.unidade]));
    const x = vendasPorProduto(dados.vendas, dados.saidas, nomes);
    const vendidos = new Set(x.linhas.map((l) => l.produtoId).filter(Boolean));
    const parados = dados.produtos.filter((p) => p.ativo && Number(p.estoque) > 0 && !vendidos.has(p.id))
      .map((p) => ({ p, valor: p.custo != null ? Math.round(Number(p.estoque) * Number(p.custo) * 100) / 100 : null }))
      .sort((a, b) => (b.valor ?? -1) - (a.valor ?? -1) || a.p.nome.localeCompare(b.p.nome, "pt-BR"));
    return { ...x, unidade, parados, valorParado: Math.round(parados.reduce((t, i) => t + (i.valor ?? 0), 0) * 100) / 100 };
  }, [dados]);

  const linhas = useMemo(() => {
    if (!r) return [];
    const m = (l: LinhaProduto) => margemDaLinha(l);
    const por: Record<Ordem, (a: LinhaProduto, b: LinhaProduto) => number> = {
      receita: (a, b) => b.receita - a.receita,
      unidades: (a, b) => b.unidades - a.unidades,
      margem: (a, b) => (m(b)?.reais ?? -Infinity) - (m(a)?.reais ?? -Infinity),
      pct: (a, b) => (m(b)?.pct ?? -Infinity) - (m(a)?.pct ?? -Infinity),
      nome: () => 0,
    };
    return [...r.linhas].sort((a, b) => por[ordem](a, b) || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [r, ordem]);

  const total = r?.total;
  const margemTotal = total ? margemDaLinha(total) : null;
  const qtdDe = (l: LinhaProduto) => `${fmtQtd(l.unidades)} ${(l.produtoId && r?.unidade.get(l.produtoId)) || "un"}`;

  function exportar() {
    if (!r || !total) return;
    const t: Cel[][] = [
      ["Vendas por produto", petshop.nome],
      ["Período", `${dataCompleta(deIsoDia(de))} a ${dataCompleta(deIsoDia(ate))}`],
      ["Como é a conta", "Receita: vendas já recebidas, com o desconto rateado. Custo: o custo do produto guardado na hora de cada venda. Venda sem custo registrado não entra no custo nem na margem."],
      [],
      ["Produto", "Unidades vendidas", "Receita", "Receita com custo registrado", "Custo dos produtos vendidos", "Margem bruta", "Margem %", "Vendas sem custo registrado"],
      ...linhas.map((l): Cel[] => {
        const m = margemDaLinha(l);
        return [l.nome, numeroCsv(l.unidades), dinheiroCsv(l.receita), dinheiroCsv(l.receitaComCusto), m ? dinheiroCsv(l.custo) : "sem custo registrado", m ? dinheiroCsv(m.reais) : "", m?.pct != null ? numeroCsv(Math.round(m.pct * 10) / 10) : "", numeroCsv(l.semCusto)];
      }),
      ["Total", numeroCsv(total.unidades), dinheiroCsv(total.receita), dinheiroCsv(total.receitaComCusto), dinheiroCsv(total.custo), margemTotal ? dinheiroCsv(margemTotal.reais) : "", margemTotal?.pct != null ? numeroCsv(Math.round(margemTotal.pct * 10) / 10) : "", numeroCsv(total.semCusto)],
      [],
      ["Parados: com saldo e sem venda no período"],
      ["Produto", "Saldo", "Unidade", "Valor a preço de custo"],
      ...r.parados.map(({ p, valor }): Cel[] => [p.nome, numeroCsv(Number(p.estoque)), p.unidade, valor != null ? dinheiroCsv(valor) : "sem custo"]),
    ];
    baixarPlanilha(t, `vendas-por-produto-${de}-a-${ate}.csv`);
    avisar("Planilha baixada.");
  }

  const cel = (rotulo: string, valor: React.ReactNode, ruim?: boolean) => <span><i>{rotulo} </i><em className={ruim ? "g-lj-ruim" : undefined}>{valor}</em></span>;

  return (
    <section className="g-card g-pilha" id="produtos">
      <div className="g-card-t">
        <h3><Tile icone={Package} tom="rosa" tamanho="p" />Produtos</h3>
        <button type="button" className="g-btn sec p" onClick={exportar} disabled={!r || !r.linhas.length && !r.parados.length}><Download /> Exportar produtos</button>
      </div>
      {erro ? <p className="g-erro" role="alert">{erro}</p> : carregando && !dados || !r || !total ? <Esqueleto linhas={3} /> : (
        <>
          {r.linhas.length ? (
            <>
              <div className="g-grade kpis">
                <Kpi icone={ShoppingBag} tom="menta" rotulo="Receita de produtos" valor={brl(total.receita)} apoio="vendas já recebidas" />
                <Kpi icone={Coins} tom="rosa" rotulo="Custo dos produtos vendidos" valor={margemTotal ? brl(total.custo) : "–"} apoio={total.semCusto ? `${total.semCusto} sem custo registrado` : "custo de cada venda"} />
                <Kpi icone={TrendingUp} tom={margemTotal && margemTotal.reais < 0 ? "manteiga" : "menta"} rotulo="Margem bruta" valor={margemTotal ? brl(margemTotal.reais) : "–"}
                  apoio={margemTotal?.pct != null ? `${pct(margemTotal.pct)} da receita com custo` : "sem custo registrado"} />
                <Kpi icone={Package} tom="lilas" rotulo="Produtos vendidos" valor={r.linhas.length} apoio={r.linhas.length === 1 ? "produto diferente" : "produtos diferentes"} />
              </div>

              <div className="g-lj-ordem">
                <span className="g-rotulo">Ordenar por</span>
                <div className="g-chips">{ORDENS.map((o) => <button key={o.id} type="button" className="g-chip" aria-pressed={ordem === o.id} onClick={() => setOrdem(o.id)}>{o.rotulo}</button>)}</div>
              </div>
              <div className="g-lj-rel" role="table" aria-label="Vendas por produto">
                <div className="g-lj-rel-l cab">
                  <button type="button" aria-pressed={ordem === "nome"} onClick={() => setOrdem("nome")}>Produto</button>
                  <button type="button" aria-pressed={ordem === "unidades"} onClick={() => setOrdem("unidades")}>Vendidos</button>
                  <button type="button" aria-pressed={ordem === "receita"} onClick={() => setOrdem("receita")}>Receita</button>
                  <button type="button" disabled style={{ cursor: "default" }}>Custo</button>
                  <button type="button" aria-pressed={ordem === "margem"} onClick={() => setOrdem("margem")}>Margem</button>
                  <button type="button" aria-pressed={ordem === "pct"} onClick={() => setOrdem("pct")}>Margem %</button>
                </div>
                {(todos ? linhas : linhas.slice(0, 15)).map((l) => {
                  const m = margemDaLinha(l);
                  return (
                    <div key={l.chave} className="g-lj-rel-l" role="row">
                      <b>{l.nome}{l.semCusto > 0 && m ? <small className="g-muted" style={{ fontWeight: 400 }}> · {l.semCusto} sem custo registrado</small> : null}</b>
                      {cel("Vendidos", qtdDe(l))}
                      {cel("Receita", brl(l.receita))}
                      {cel("Custo", m ? brl(l.custo) : "sem custo registrado")}
                      {cel("Margem", m ? brl(m.reais) : "–", !!m && m.reais < 0)}
                      {cel("Margem %", m?.pct != null ? pct(m.pct) : "–", !!m && m.reais < 0)}
                    </div>
                  );
                })}
                <div className="g-lj-rel-l total" role="row">
                  <b>Total</b>
                  {cel("Vendidos", fmtQtd(total.unidades))}
                  {cel("Receita", brl(total.receita))}
                  {cel("Custo", margemTotal ? brl(total.custo) : "sem custo registrado")}
                  {cel("Margem", margemTotal ? brl(margemTotal.reais) : "–", !!margemTotal && margemTotal.reais < 0)}
                  {cel("Margem %", margemTotal?.pct != null ? pct(margemTotal.pct) : "–", !!margemTotal && margemTotal.reais < 0)}
                </div>
              </div>
              {linhas.length > 15 && <div><button type="button" className="g-btn sec p" onClick={() => setTodos(!todos)}>{todos ? "Mostrar só os 15 primeiros" : `Mostrar todos os ${linhas.length} produtos`}</button></div>}

              {r.linhas.length > 1 && (
                <div>
                  <p className="g-rotulo" style={{ marginBottom: 8 }}>Mais vendidos</p>
                  <Ranking itens={[...r.linhas].sort((a, b) => b.unidades - a.unidades || b.receita - a.receita).slice(0, 5).map((l) => ({ rotulo: l.nome, valor: l.unidades }))} formato={(n) => fmtQtd(n)} />
                </div>
              )}
            </>
          ) : <p className="g-muted g-p">Nenhuma venda de produto recebida neste período.</p>}

          <div>
            <p className="g-rotulo" style={{ marginBottom: 6 }}>Parados</p>
            {r.parados.length ? (
              <>
                <p className="g-p">{r.parados.length === 1 ? "1 produto tem saldo e não vendeu" : `${r.parados.length} produtos têm saldo e não venderam`} neste período{r.valorParado > 0 ? `: ${brl(r.valorParado)} a preço de custo` : ""}.</p>
                <div className="g-lj-rel">
                  {(todosParados ? r.parados : r.parados.slice(0, 6)).map(({ p, valor }) => (
                    <div key={p.id} className="g-lj-compra" style={{ gridTemplateColumns: "minmax(0, 1fr) auto auto" }}>
                      <span>{p.nome}</span>
                      <span className="g-muted g-tab">{fmtQtd(p.estoque)} {p.unidade}</span>
                      <b>{valor != null ? brl(valor) : "sem custo"}</b>
                    </div>
                  ))}
                </div>
                {r.parados.length > 6 && <div style={{ marginTop: 8 }}><button type="button" className="g-btn sec p" onClick={() => setTodosParados(!todosParados)}>{todosParados ? "Mostrar menos" : `Mostrar os ${r.parados.length} parados`}</button></div>}
              </>
            ) : <p className="g-muted g-p">Todo produto com saldo teve venda neste período.</p>}
          </div>

          <p className="g-muted g-pp">
            Receita: vendas de produto já recebidas no período, com o desconto da conta rateado. Custo: o custo do produto guardado na hora de cada venda, então mudar o custo depois não muda a margem de venda antiga.
            {total.semCusto > 0 ? ` ${total.semCusto === 1 ? "1 venda está" : `${total.semCusto} vendas estão`} sem custo registrado (venda de antes desta função, ou produto que ainda não tinha custo): ${total.semCusto === 1 ? "ela entra" : "elas entram"} na receita e ${total.semCusto === 1 ? "fica" : "ficam"} de fora do custo e da margem.` : ""}
            {dados!.aReceber > 0 ? ` ${dados!.aReceber === 1 ? "1 conta a receber com produtos fica" : `${dados!.aReceber} contas a receber com produtos ficam`} de fora até o cliente pagar.` : ""}
            {r.soltas > 0 ? ` ${r.soltas === 1 ? "1 saída marcada como venda não está ligada" : `${r.soltas} saídas marcadas como venda não estão ligadas`} a um recebimento (baixa sem dinheiro lançado, ou venda de antes desta função).` : ""}
          </p>
        </>
      )}
    </section>
  );
}
