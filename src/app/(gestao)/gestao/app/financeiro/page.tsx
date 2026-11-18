"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "@/components/gestao/link-depois";
import { modoSimples } from "@/lib/gestao/modo-simples";
import {
  ArrowDownLeft, ArrowUpRight, CalendarClock, CalendarDays, ChartColumn, Check, ChevronLeft, ChevronRight, CreditCard, Download, HandCoins, Plus, Receipt, Scale,
  Search, Target, TrendingUp, TriangleAlert,
} from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { avisarMudanca, Campo, Esqueleto, Folha, useAvisos, useDados, useSomenteLeitura, Vazio } from "@/components/gestao/ui";
import { CampoDinheiro } from "@/components/gestao/loja/pecas";
import {
  Apagados, baixarPlanilha, brlMini, categoriaAtual, Chips, COR_FORMA, ehDeServico, ErroDeCarga, FolhaBaixa, FolhaLancamento, hojeIso, PALETA, paginar, resumoDeItens, SemAcesso, soma, somaPorForma,
  TagAlterado, textoJaRecebido, type Cel, type Tipo,
} from "@/components/gestao/financeiro/comum";
import CustoDasVendas from "@/components/gestao/financeiro/custo-vendas";
import PorServico from "@/components/gestao/financeiro/por-servico";
import CartaoMaquininha from "@/components/gestao/financeiro/maquininha";
import AlteracoesDoPeriodo from "@/components/gestao/financeiro/alteracoes-periodo";
import ContasFixas, { FolhaContaFixa } from "@/components/gestao/financeiro/contas-fixas";
import { gerarContasFixas, type ContaFixa } from "@/lib/gestao/contas-fixas";
import { Kpi, Ranking, Rosca, Tendencia, Tile } from "@/components/gestao/painel";
import { contasDaMeta, descricaoAtual, partesDoLancamento, percentuaisQueFecham, textoDoPagamento } from "@/lib/gestao/dinheiro";
import { FORMAS } from "@/lib/gestao/tipos";
import type { AlteracaoLancamento, Lancamento } from "@/lib/gestao/tipos";
import { brl, dataAmigavel, dataCompleta, dataCurta, deIsoDia, isoDia, nomeMes, semAcento, somaDias, centavos } from "@/lib/gestao/util";
import { ajustesDoFaturamento, CATEGORIAS_DEVOLUCAO, faturamentoLiquido, SEM_AJUSTES } from "@/lib/gestao/faturamento";
import { FORMA_CREDITO } from "@/components/gestao/financeiro/comum";
import { CadeiaDoDinheiro, ParaOContador } from "@/components/gestao/financeiro/cadeia";
import { lerCadeia } from "@/lib/gestao/cadeia";
import { lerParaContador, planilhaDeLancamentos, type LancamentoLido } from "@/lib/gestao/contador";
import "./financeiro.css";

export default function PaginaFinanceiro() {
  // quem só opera o caixa não entra aqui: despesas, contas e o histórico são de quem cuida do financeiro
  const { cuidoDoFinanceiro } = useGestao();
  return cuidoDoFinanceiro ? <Financeiro /> : <SemAcesso />;
}

type Aba = "resumo" | "pagar" | "fixas" | "receber" | "lancamentos" | "alteracoes";
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "resumo", rotulo: "Resumo" },
  { id: "pagar", rotulo: "A pagar" },
  { id: "fixas", rotulo: "Contas fixas" },
  { id: "receber", rotulo: "A receber" },
  { id: "lancamentos", rotulo: "Lançamentos" },
  { id: "alteracoes", rotulo: "Alterações" },
];
const FILTROS = [{ id: "tudo", rotulo: "Tudo" }, { id: "entrada", rotulo: "Entradas" }, { id: "saida", rotulo: "Saídas" }] as const;
type Filtro = (typeof FILTROS)[number]["id"];

type FolhaAberta =
  | { tipo: "novo" }
  | { tipo: "editar"; lancamento: Lancamento }
  | { tipo: "conta"; de: Tipo; conta?: Lancamento }
  | { tipo: "baixa"; conta: Lancamento }
  | { tipo: "meta" }
  | { tipo: "fixa"; conta?: ContaFixa };

type Movimento = Pick<Lancamento, "tipo" | "valor" | "categoria">;
/** Saída que devolveu dinheiro ao tutor: não é despesa, é dinheiro que entrou e voltou (sai do que entrou). */
const ehDevolucao = (l: Pick<Lancamento, "tipo" | "categoria">) => l.tipo === "saida" && CATEGORIAS_DEVOLUCAO.includes(l.categoria);

/**
 * Soma por categoria. Uma conta com serviço, produto e extra é repartida: o serviço fica na categoria do lançamento,
 * o produto em "Venda de produtos" e o extra (taxas, leva e traz, outros) em "Taxas e extras", com o desconto rateado na proporção
 * de cada parte. Sinal já pago e crédito usado (linhas negativas) abatem primeiro o serviço: a taxa de R$ 40 aparece como R$ 40.
 */
function porCategoria(lista: Lancamento[], petshop: { modulos?: string[] | null }) {
  const mapa = new Map<string, number>();
  const por = (nome: string, valor: number) => { if (valor) mapa.set(nome, (mapa.get(nome) ?? 0) + valor); };
  for (const l of lista) {
    const partes = l.tipo === "entrada" ? partesDoLancamento(l) : null;
    if (!partes) { por(categoriaAtual(l.categoria, petshop), Number(l.valor)); continue; }
    por(categoriaAtual(l.categoria, petshop), partes.servico);
    por("Venda de produtos", partes.produto);
    por("Taxas e extras", partes.extra);
  }
  return [...mapa].map(([nome, valor]) => ({ nome, valor: centavos(valor) })).sort((a, b) => b.valor - a.valor);
}

function Financeiro() {
  const { sb, petshop, equipe, souDono, posso } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const agora = new Date();
  const [mes, setMes] = useState(() => new Date(agora.getFullYear(), agora.getMonth(), 1));
  const [aba, setAba] = useState<Aba>("resumo");
  // atalhos: /gestao/app/financeiro?aba=receber (tela Hoje), ?aba=alteracoes (fechamento do caixa), ?aba=pagar e ?aba=fixas (contas fixas)
  useEffect(() => { const a = new URLSearchParams(window.location.search).get("aba"); if (a === "receber" || a === "alteracoes" || a === "pagar" || a === "fixas") setAba(a); }, []);
  // a lista de contas fixas relê depois de salvar
  const [versaoFixas, setVersaoFixas] = useState(0);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [folha, setFolha] = useState<FolhaAberta | null>(null);

  const inicio = isoDia(mes);
  const fim = isoDia(new Date(mes.getFullYear(), mes.getMonth() + 1, 0));
  const mesAnterior = new Date(mes.getFullYear(), mes.getMonth() - 1, 1);
  const mesAtual = mes.getFullYear() === agora.getFullYear() && mes.getMonth() === agora.getMonth();
  const hoje = hojeIso();

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    // contas fixas: a conta do mês entra em A pagar 10 dias antes do vencimento (o banco não repete nem refaz a excluída)
    await gerarContasFixas(sb, petshop.id);
    // sangria e suprimento (movimento de gaveta) não são receita nem despesa: ficam fora de tudo aqui
    // os apagados do mês e os ajustes do faturamento não dependem do resto: saem na mesma leva (no celular, cada espera soma)
    const apP = Promise.resolve(sb.from("lancamentos_alteracoes").select("*").eq("petshop_id", petshop.id).eq("acao", "apagou")
      .gte("antes->>data", inicio).lte("antes->>data", fim).order("quando", { ascending: false }).limit(200));
    const ajustesP = ajustesDoFaturamento(sb, petshop.id, inicio, fim).catch(() => SEM_AJUSTES);
    // a cadeia do dinheiro (Recebido → Faturamento → Resultado → taxas): a conta única, feita no banco; a do mês anterior, para comparar
    const cadeiaP = lerCadeia(sb, petshop.id, inicio, fim).catch(() => null);
    const cadeiaAntesP = lerCadeia(sb, petshop.id, isoDia(mesAnterior), isoDia(somaDias(deIsoDia(inicio), -1))).catch(() => null);
    const [doMes, anterior, contas] = await Promise.all([
      paginar<Lancamento>((de, ate) => sb.from("lancamentos").select("*").eq("petshop_id", petshop.id).eq("pago", true).is("movimento", null)
        .gte("data", inicio).lte("data", fim).order("data", { ascending: false }).order("criado_em", { ascending: false }).order("id").range(de, ate)),
      paginar<Movimento>((de, ate) => sb.from("lancamentos").select("tipo, valor, categoria").eq("petshop_id", petshop.id).eq("pago", true).is("movimento", null)
        .gte("data", isoDia(mesAnterior)).lt("data", inicio).order("id").range(de, ate)),
      paginar<Lancamento>((de, ate) => sb.from("lancamentos").select("*").eq("petshop_id", petshop.id).eq("pago", false)
        .order("vencimento", { ascending: true, nullsFirst: false }).order("id").range(de, ate)),
    ]);
    // quem deve: o nome do tutor de cada conta a receber
    const devedores = [...new Set(contas.filter((c) => c.tipo === "entrada" && c.cliente_id).map((c) => c.cliente_id!))];
    const tutores = new Map<string, string>();
    const lotes: string[][] = [];
    for (let i = 0; i < devedores.length; i += 150) lotes.push(devedores.slice(i, i + 150));
    const [nomes, ap, ajustes, cadeia, cadeiaAntes] = await Promise.all([
      Promise.all(lotes.map((ids) => sb.from("clientes").select("id, nome").eq("petshop_id", petshop.id).in("id", ids))),
      // valores recebidos neste mês que alguém apagou depois
      apP,
      // crédito do tutor deixado e usado no mês (o resultado não conta o crédito que ainda é do tutor)
      ajustesP, cadeiaP, cadeiaAntesP,
    ]);
    for (const r of nomes) for (const c of r.data ?? []) tutores.set(c.id, c.nome);
    const apagados: AlteracaoLancamento[] = ap.data ?? [];
    return { doMes, anterior, contas, tutores, apagados, ajustes, cadeia, cadeiaAntes };
  }, [petshop.id, inicio]);

  const contas = useMemo(() => {
    const doMes = dados?.doMes ?? [];
    const entradas = doMes.filter((l) => l.tipo === "entrada");
    // devolução ao tutor: sai do que entrou (não é despesa)
    const devolucoes = doMes.filter(ehDevolucao);
    const saidas = doMes.filter((l) => l.tipo === "saida" && !ehDevolucao(l));
    const anterior = dados?.anterior ?? [];
    const devolvido = soma(devolucoes);
    return {
      entrou: centavos((soma(entradas) - devolvido)), saiu: soma(saidas), bruto: soma(entradas), devolvido,
      entradasPorCategoria: porCategoria(entradas, petshop), saidasPorCategoria: porCategoria(saidas, petshop),
      entrouAntes: centavos((soma(anterior.filter((l) => l.tipo === "entrada")) - soma(anterior.filter(ehDevolucao)))),
      saiuAntes: soma(anterior.filter((l) => l.tipo === "saida" && !ehDevolucao(l))),
      temAnterior: anterior.length > 0,
      aPagar: (dados?.contas ?? []).filter((l) => l.tipo === "saida"),
      aReceber: (dados?.contas ?? []).filter((l) => l.tipo === "entrada"),
    };
  }, [dados]);
  // o resultado conta o faturamento: o crédito que ficou com o tutor ainda é dele (só conta quando ele usar)
  const ajustes = dados?.ajustes ?? SEM_AJUSTES;
  const faturamento = faturamentoLiquido(contas.bruto, ajustes);
  const resultado = centavos((faturamento - contas.saiu));
  const cadeia = dados?.cadeia ?? null;
  // comparação com o mês anterior pelos mesmos nomes: faturamento e despesas
  const comparar = { entrou: faturamento, saiu: contas.saiu, entrouAntes: dados?.cadeiaAntes?.faturamento ?? contas.entrouAntes, saiuAntes: dados?.cadeiaAntes?.despesas ?? contas.saiuAntes, temAnterior: contas.temAnterior };

  // desenhos do resumo: semanas do mês, entradas acumuladas e formas de pagamento
  const graficos = useMemo(() => {
    const doMes = dados?.doMes ?? [];
    const ultimoDia = deIsoDia(fim).getDate();
    const semanas = Array.from({ length: Math.ceil(ultimoDia / 7) }, (_, i) => ({
      rotulo: `${i * 7 + 1} a ${Math.min(ultimoDia, i * 7 + 7)}`, entrou: 0, saiu: 0,
    }));
    const porDia = Array.from({ length: ultimoDia }, () => 0);
    // pagamento dividido entra repartido: cada parte na forma dela
    const formas = somaPorForma(doMes.filter((l) => l.tipo === "entrada"));
    let nEntradas = 0, nSaidas = 0;
    for (const l of doMes) {
      const dia = deIsoDia(l.data).getDate(), v = Number(l.valor), sem = semanas[Math.floor((dia - 1) / 7)];
      if (ehDevolucao(l)) {
        // devolveu ao tutor: sai do faturamento daquele dia (não é uma despesa); entra abaixo, com o crédito do tutor
      } else if (l.tipo === "entrada") {
        nEntradas++;
        if (sem) sem.entrou += v;
        porDia[dia - 1] += v;
      } else {
        nSaidas++;
        if (sem) sem.saiu += v;
      }
    }
    // devoluções, crédito deixado e crédito usado no check-out, no dia de cada um (a mesma regra do faturamento)
    for (const [d, v] of ajustes.porDia) {
      const dia = deIsoDia(d).getDate(), sem = semanas[Math.floor((dia - 1) / 7)];
      if (sem) sem.entrou += v;
      if (porDia[dia - 1] != null) porDia[dia - 1] += v;
    }
    // a parte de uma troca que é só produto trocado não é forma de pagamento
    const troca = cadeia?.troca ?? 0;
    if (troca > 0) formas.set("outro", Math.max(0, (formas.get("outro") ?? 0) - troca));
    const ate = mesAtual ? deIsoDia(hoje).getDate() : ultimoDia;
    let corrido = 0;
    const acumulado = porDia.slice(0, ate).map((v) => (corrido += v));
    return {
      semanas, acumulado, ate, nEntradas, nSaidas,
      semanaAtual: mesAtual ? Math.floor((deIsoDia(hoje).getDate() - 1) / 7) : -1,
      formas: [...FORMAS.map((f) => ({ id: f.id as string, rotulo: f.rotulo as string, valor: centavos((formas.get(f.id) ?? 0)), cor: COR_FORMA[f.id] })),
        { id: FORMA_CREDITO, rotulo: "Crédito do tutor", valor: centavos((formas.get(FORMA_CREDITO) ?? 0)), cor: COR_FORMA[FORMA_CREDITO] }].filter((f) => f.valor > 0),
    };
  }, [dados, fim, mesAtual, hoje, ajustes, cadeia]);
  const atrasadasPagar = contas.aPagar.filter((c) => c.vencimento && c.vencimento < hoje);
  const n = (q: number, um: string, varios: string) => (q === 1 ? `1 ${um}` : `${q} ${varios}`);

  const abrir = (f: FolhaAberta) => { if (somenteLeitura()) return; setFolha(f); };

  const [exportando, setExportando] = useState(false);
  /** Planilha com todos os lançamentos do mês: cliente, itens, partes do pagamento, hora e quem lançou. */
  async function exportar() {
    const linhas = dados?.doMes ?? [];
    if (!linhas.length) { avisar("Não há lançamentos neste mês para exportar."); return; }
    if (exportando) return;
    setExportando(true);
    try {
      // nome dos clientes dos lançamentos, buscado só na hora de exportar
      const ids = [...new Set(linhas.map((l) => l.cliente_id).filter((x): x is string => Boolean(x)))];
      const nomes = new Map<string, string>();
      for (let i = 0; i < ids.length; i += 150) {
        const r = await sb.from("clientes").select("id, nome").eq("petshop_id", petshop.id).in("id", ids.slice(i, i + 150));
        if (r.error) throw new Error(r.error.message);
        for (const c of r.data ?? []) nomes.set(c.id, c.nome);
      }
      const quem = new Map(equipe.filter((p) => p.user_id).map((p) => [p.user_id!, p.nome]));
      // taxa, parcelas, quando cai, data do atendimento, "lançado em" e retroativo vêm do banco (as mesmas colunas da cópia completa)
      const extras = await lerParaContador(sb, petshop.id, inicio, fim);
      const tabela: Cel[][] = planilhaDeLancamentos([...linhas].reverse() as LancamentoLido[], extras, {
        cliente: (id) => nomes.get(id) ?? "",
        quem: (l) => (l.origem === "assistente" ? `${(l.criado_por && quem.get(l.criado_por)) || "Alguém"}, pelo Mozart` : (l.criado_por && quem.get(l.criado_por)) || ""),
        categoria: (c, d) => categoriaAtual(c, petshop, d),
      });
      baixarPlanilha(tabela, `financeiro-${inicio.slice(0, 7)}.csv`);
    } catch (e) { avisarErro(e); } finally { setExportando(false); }
  }

  const alvo = semAcento(busca);
  const filtrados = (dados?.doMes ?? []).filter((l) =>
    (filtro === "tudo" || l.tipo === filtro) &&
    (!alvo || semAcento(`${l.descricao ?? ""} ${l.categoria} ${textoDoPagamento(l)}`).includes(alvo)));

  const tituloMes = `${nomeMes(mes)} de ${mes.getFullYear()}`;
  const acao = aba === "pagar" ? { rotulo: "Nova conta", abre: (): FolhaAberta => ({ tipo: "conta", de: "saida" }) }
    : aba === "fixas" ? { rotulo: "Nova conta fixa", abre: (): FolhaAberta => ({ tipo: "fixa" }) }
    : aba === "receber" ? { rotulo: "Nova conta", abre: (): FolhaAberta => ({ tipo: "conta", de: "entrada" }) }
    : { rotulo: "Novo lançamento", abre: (): FolhaAberta => ({ tipo: "novo" }) };

  return (
    <>
      <header className="g-topo">
        <div>
          <h1>Financeiro</h1>
          <p className="g-muted">O que entrou, o que saiu e o que ainda vence.</p>
        </div>
        <div className="g-acoes">
          <button className="g-btn sec" onClick={() => void exportar()} disabled={!dados || exportando} title={`Baixar os lançamentos de ${tituloMes} em planilha`}><Download />Exportar</button>
          <button className="g-btn pri" onClick={() => abrir(acao.abre())}><Plus />{acao.rotulo}</button>
        </div>
      </header>

      <div className="g-pilha">
        <div className="gf-mes g-fin-mes">
          <button className="g-ico" aria-label="Mês anterior" onClick={() => setMes(mesAnterior)}><ChevronLeft /></button>
          <b aria-live="polite">{tituloMes}</b>
          <button className="g-ico" aria-label="Próximo mês" disabled={mesAtual}
            onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))}><ChevronRight /></button>
        </div>

        {erro && <ErroDeCarga erro={erro} tentar={recarregar} />}
        {!dados ? (carregando ? <Esqueleto linhas={4} /> : null) : (
          <>
            <section className="g-grade kpis" aria-label={`Números de ${tituloMes}`}>
              {/* os três primeiros fecham: Faturamento − Despesas = Resultado (os passos estão em "Como os números se ligam") */}
              <Kpi icone={ArrowDownLeft} tom="menta" rotulo="Faturamento" valor={<span className="gf-kpi-v">{brl(faturamento)}</span>}
                apoio={cadeia && cadeia.recebido !== faturamento ? `recebido ${brl(cadeia.recebido)}, com devoluções e crédito acertados` : graficos.nEntradas ? n(graficos.nEntradas, "entrada", "entradas") : "nada ainda"} />
              <Kpi icone={ArrowUpRight} tom="rosa" rotulo="Despesas" valor={<span className="gf-kpi-v">{brl(contas.saiu)}</span>}
                apoio={graficos.nSaidas ? n(graficos.nSaidas, "saída", "saídas") : "nada ainda"} />
              <Kpi icone={Scale} tom={resultado < 0 ? "rosa" : "ceu"} rotulo="Resultado do mês"
                valor={<span className={`gf-kpi-v${resultado < 0 ? " g-vermelho-t" : ""}`}>{brl(resultado)}</span>}
                apoio={resultado < 0 ? "as despesas passaram do faturamento" : resultado > 0 ? (mesAtual ? "faturamento menos despesas, até agora" : "faturamento menos despesas") : "empatado"} />
              <Kpi icone={Receipt} tom="manteiga" rotulo="Contas a pagar" valor={<span className="gf-kpi-v">{brl(soma(contas.aPagar))}</span>}
                apoio={!contas.aPagar.length ? "nenhuma em aberto" : atrasadasPagar.length ? `${n(atrasadasPagar.length, "atrasada", "atrasadas")} de ${contas.aPagar.length}` : n(contas.aPagar.length, "conta em aberto", "contas em aberto")} />
            </section>

            <div className="gf-rola">
              <div className="g-seg" role="group" aria-label="Parte do financeiro">
                {/* modo simples: Alterações (descontos e valores mudados) sai das abas; aberta pelo endereço, continua */}
                {ABAS.filter((a) => a.id !== "alteracoes" || aba === "alteracoes" || !modoSimples(petshop)).map((a) => (
                  <button key={a.id} aria-pressed={aba === a.id} onClick={() => setAba(a.id)}>
                    {a.rotulo}
                    {a.id === "pagar" && contas.aPagar.length > 0 ? ` (${contas.aPagar.length})` : ""}
                    {a.id === "receber" && contas.aReceber.length > 0 ? ` (${contas.aReceber.length})` : ""}
                  </button>
                ))}
              </div>
            </div>

            {aba === "resumo" && mesAtual && <CartaoMeta entrou={faturamento} aoEditar={() => abrir({ tipo: "meta" })} />}

            {aba === "resumo" && (
              dados.doMes.length ? (
                <div className="g-duas">
                  <div className="g-pilha">
                    <section className="g-card">
                      <div className="g-card-t g-fin-cab">
                        <h3><Tile icone={ChartColumn} tom="menta" tamanho="p" />Faturamento e despesas por semana</h3>
                        <div className="g-fin-leg"><span><i className="e" />Faturamento</span><span><i className="s" />Despesas</span></div>
                      </div>
                      <Fluxo semanas={graficos.semanas} atual={graficos.semanaAtual} />
                      <div className="g-fin-nota"><Comparacao contas={comparar} mesAtual={mesAtual} nomeAnterior={nomeMes(mesAnterior)} /></div>
                    </section>
                    <div className="g-fin-par">
                      <section className="g-card">
                        <div className="g-card-t"><h3><Tile icone={CreditCard} tom="ceu" tamanho="p" />Como foi recebido</h3><span className="g-muted g-pp">forma de pagamento</span></div>
                        {graficos.formas.length ? (
                          <div className="g-fin-rosca">
                            <Rosca fatias={graficos.formas} tamanho={116}>{graficos.formas.length}<small>{graficos.formas.length === 1 ? "forma" : "formas"}</small></Rosca>
                            <div className="g-legenda">
                              {graficos.formas.map((f, i, todas) => (
                                <div key={f.id}><i style={{ background: f.cor }} /><span>{f.rotulo} <span className="g-muted g-pp">{percentuaisQueFecham(todas.map((x) => x.valor))[i]}%</span></span><b>{brl(f.valor)}</b></div>
                              ))}
                            </div>
                          </div>
                        ) : <p className="g-muted g-p">Nenhuma entrada neste mês.</p>}
                        {cadeia && graficos.formas.length > 0 && (
                          <p className="g-muted g-pp" style={{ marginTop: 8 }}>
                            Soma {brl(centavos(cadeia.recebido + cadeia.creditoNasContas))}: o Recebido ({brl(cadeia.recebido)}){cadeia.creditoNasContas > 0 ? ` mais ${brl(cadeia.creditoNasContas)} pagos com crédito do tutor` : ""}, antes das devoluções.
                          </p>
                        )}
                      </section>
                      <section className="g-card g-fin-acum">
                        <div className="g-card-t"><h3><Tile icone={TrendingUp} tom="menta" tamanho="p" />Faturamento acumulado</h3><span className="g-muted g-pp">{mesAtual ? `até o dia ${graficos.ate}` : "mês inteiro"}</span></div>
                        <p className="g-num m">{brl(faturamento)}</p>
                        {graficos.acumulado.length >= 2 && contas.entrou > 0
                          ? <Tendencia valores={graficos.acumulado} largura={300} altura={84} />
                          : <p className="g-muted g-p" style={{ marginTop: 8 }}>{contas.entrou > 0 ? "A linha aparece a partir do segundo dia do mês." : "Nenhuma entrada neste mês."}</p>}
                        {graficos.acumulado.length >= 2 && contas.entrou > 0 && <div className="g-fin-eixo"><span>dia 1</span><span>dia {graficos.ate}</span></div>}
                      </section>
                    </div>
                  </div>
                  <div className="g-pilha">
                    <CadeiaDoDinheiro cadeia={cadeia} />
                    <Categorias titulo="De onde veio" icone={ArrowDownLeft} tom="menta" total={contas.bruto} linhas={contas.entradasPorCategoria} vazio="Nenhuma entrada neste mês."
                      nota={faturamento !== contas.bruto ? `Entradas lançadas, por categoria: ${brl(contas.bruto)}. Ainda sem tirar as devoluções e o crédito de tutores; o Faturamento do mês é ${brl(faturamento)}.` : undefined} />
                    <PorServico inicio={inicio} fim={fim} />
                    <Categorias titulo="Para onde foi" icone={ArrowUpRight} tom="rosa" total={contas.saiu} linhas={contas.saidasPorCategoria} vazio="Nenhuma saída neste mês." quente />
                    <CustoDasVendas inicio={inicio} fim={fim} doMes={dados.doMes} resultado={resultado} mesAtual={mesAtual}
                      entrouDeProdutos={contas.entradasPorCategoria.find((c) => c.nome === "Venda de produtos")?.valor ?? 0} />
                    <CartaoMaquininha de={inicio} ate={fim} faturamento={faturamento} rotuloPeriodo="no mês" />
                    <ParaOContador de={inicio} ate={fim} rotulo={tituloMes} />
                  </div>
                </div>
              ) : (
                <Vazio titulo={`Nada lançado em ${nomeMes(mes)}.`} texto="Quando você receber ou pagar alguma coisa, o resumo do mês aparece aqui." />
              )
            )}

            {(aba === "pagar" || aba === "receber") && (
              <Contas lista={aba === "pagar" ? contas.aPagar : contas.aReceber} receber={aba === "receber"} hoje={hoje} tutores={dados.tutores}
                aoEditar={(c) => abrir({ tipo: "conta", de: c.tipo as Tipo, conta: c })}
                aoBaixar={(c) => abrir({ tipo: "baixa", conta: c })}
                aoCriar={() => abrir({ tipo: "conta", de: aba === "pagar" ? "saida" : "entrada" })} />
            )}
            {aba === "pagar" && (
              <p className="g-muted g-pp">Aluguel, luz, salários e outras contas que se repetem: cadastre uma vez em <button type="button" className="g-link" onClick={() => setAba("fixas")}>Contas fixas</button> e a conta de cada mês entra aqui sozinha, 10 dias antes de vencer.</p>
            )}
            {aba === "fixas" && <ContasFixas versao={versaoFixas} aoEditar={(c) => abrir({ tipo: "fixa", conta: c })} aoCriar={() => abrir({ tipo: "fixa" })} />}
            {aba === "receber" && contas.aReceber.length > 0 && posso("clientes") && (
              <p className="g-muted g-pp">Por pessoa, como no caderno: <Link className="g-link" href="/gestao/app/clientes?filtro=deve">Quem me deve</Link>, em Clientes (também no Caixa, em Contas de clientes).</p>
            )}
            {aba === "receber" && souDono && (
              <p className="g-muted g-pp">Multa e juros por atraso, chave Pix e a mensagem de cobrança: <Link className="g-link" href="/gestao/app/meu-petshop#opcoes-cobranca">Opções de cobrança</Link>.</p>
            )}

            {aba === "lancamentos" && (
              <section className="g-card">
                <div className="g-pilha p">
                  <div className="g-busca">
                    <Search />
                    <input className="g-input" type="search" placeholder="Buscar por descrição ou categoria" value={busca} onChange={(e) => setBusca(e.target.value)} />
                  </div>
                  <Chips opcoes={FILTROS} valor={filtro} aoMudar={setFiltro} rotulo="Mostrar" />
                </div>
                {filtrados.length > 0 && (
                  <p className="g-muted g-pp g-tab" style={{ margin: "12px 4px 0" }}>
                    {n(filtrados.length, "lançamento", "lançamentos")}
                    {filtro !== "saida" && ` · entradas lançadas ${brl(soma(filtrados.filter((l) => l.tipo === "entrada")))}`}
                    {filtro !== "entrada" && ` · saídas lançadas ${brl(soma(filtrados.filter((l) => l.tipo === "saida")))}`}
                    {filtro !== "entrada" && filtrados.some(ehDevolucao) && " (com as devoluções, que não são despesa)"}
                  </p>
                )}
                {filtrados.length ? (
                  <div className="g-lista" style={{ marginTop: 4 }}>
                    {filtrados.map((l) => {
                      const entrada = l.tipo === "entrada";
                      return (
                        <button key={l.id} className="g-linha" onClick={() => abrir({ tipo: "editar", lancamento: l })}>
                          <Tile icone={entrada ? ArrowDownLeft : ArrowUpRight} tom={entrada ? "menta" : "rosa"} />
                          <span className="t">
                            <b>{descricaoAtual(l.descricao) || categoriaAtual(l.categoria, petshop)} <TagAlterado lancamento={l} /></b>
                            <span>{dataCurta(l.data)}{l.descricao && !ehDeServico(l) ? ` · ${categoriaAtual(l.categoria, petshop, l.descricao)}` : ""}{resumoDeItens(l) && ` · ${resumoDeItens(l)}`}<i className="g-fin-so-cel"> · {textoDoPagamento(l)}</i></span>
                          </span>
                          <span className="g-tag g-fin-so-largo">{textoDoPagamento(l)}</span>
                          <span className={`d ${entrada ? "g-verde-t" : "g-vermelho-t"}`}><b>{entrada ? "+" : "−"} {brl(l.valor)}</b></span>
                        </button>
                      );
                    })}
                  </div>
                ) : dados.doMes.length ? (
                  <p className="g-muted g-p" style={{ padding: "16px 4px 4px" }}>Nada encontrado com esse filtro.</p>
                ) : (
                  <Vazio titulo={`Nada lançado em ${nomeMes(mes)}.`} texto="Toque em Novo lançamento para anotar uma entrada ou uma saída." />
                )}
              </section>
            )}
            {aba === "lancamentos" && <Apagados linhas={dados.apagados} titulo={`Apagados de ${nomeMes(mes)}`} />}
            {aba === "alteracoes" && <AlteracoesDoPeriodo inicio={inicio} fim={fim} tituloMes={tituloMes} />}
          </>
        )}
      </div>

      {folha?.tipo === "novo" && <FolhaLancamento modo="pago" tipo="entrada" escolheTipo escolheData aoFechar={() => setFolha(null)} aoSalvo={recarregar} />}
      {folha?.tipo === "editar" && (
        <FolhaLancamento modo="pago" tipo={folha.lancamento.tipo as Tipo} inicial={folha.lancamento} escolheData aoFechar={() => setFolha(null)} aoSalvo={recarregar} />
      )}
      {folha?.tipo === "conta" && <FolhaLancamento modo="conta" tipo={folha.de} inicial={folha.conta} aoFechar={() => setFolha(null)} aoSalvo={recarregar} />}
      {folha?.tipo === "baixa" && <FolhaBaixa conta={folha.conta} aoFechar={() => setFolha(null)} aoSalvo={recarregar} />}
      {folha?.tipo === "meta" && <FolhaMeta aoFechar={() => setFolha(null)} />}
      {folha?.tipo === "fixa" && <FolhaContaFixa conta={folha.conta} aoFechar={() => setFolha(null)} aoSalvo={async () => { setVersaoFixas((v) => v + 1); await recarregar(); }} />}
    </>
  );
}

/** Meta do mês: quanto já entrou contra a meta, quanto falta e quanto precisa entrar por dia aberto. Só o dono altera. */
function CartaoMeta({ entrou, aoEditar }: { entrou: number; aoEditar: () => void }) {
  const { petshop, souDono } = useGestao();
  const meta = Number(petshop.meta_mes ?? 0);
  if (!(meta > 0)) {
    if (!souDono) return null;
    return (
      <section className="g-card g-fin-meta vazia">
        <Tile icone={Target} tom="menta" tamanho="g" />
        <div className="g-fin-meta-txt">
          <h3>Quanto você quer que entre no mês?</h3>
          <p className="g-muted g-p">Escreva um valor e o sistema mostra quanto já entrou e quanto falta, aqui e na tela inicial.</p>
        </div>
        <button className="g-btn sec" onClick={aoEditar}><Target />Escrever o valor</button>
      </section>
    );
  }
  const hoje = new Date();
  const c = contasDaMeta(meta, entrou, petshop.horario, hoje);
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate();
  const diasNoMes = ultimoDia - hoje.getDate() + 1;
  const nomeDosDias = c.peloHorario ? (c.dias === 1 ? "dia aberto" : "dias abertos") : c.dias === 1 ? "dia" : "dias";
  return (
    <section className="g-card g-fin-meta" aria-label="Meta do mês">
      <div className="g-card-t">
        <h3><Tile icone={Target} tom="menta" tamanho="p" />Meta do mês</h3>
        {souDono
          ? <button className="g-btn fantasma p" onClick={aoEditar}>Alterar</button>
          : <span className="g-muted g-pp">{nomeMes(hoje)}</span>}
      </div>
      <div className="g-fin-meta-topo">
        <p className="g-fin-meta-num"><b className="g-num">{brl(entrou)}</b> <span className="g-muted">de {brl(meta)}</span></p>
        <span className={`g-tag g-tab${c.falta > 0 ? "" : " verde"}`}>{c.pct}%</span>
      </div>
      <div className="g-fin-meta-barra" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, c.pct)}
        aria-label={`${c.pct}% da meta do mês`}>
        <i style={{ width: `${Math.min(100, c.parte * 100)}%` }} />
      </div>
      <div className="g-fin-meta-fatos">
        {c.falta > 0 ? (
          <>
            <div><small>Falta</small><b className="g-tab">{brl(c.falta)}</b></div>
            <div>
              <small>Até o fim do mês</small>
              <b className="g-tab">{c.dias} {nomeDosDias}</b>
              {c.peloHorario && c.dias !== diasNoMes && <small>{diasNoMes === 1 ? "de 1 dia no calendário" : `de ${diasNoMes} dias no calendário`}</small>}
            </div>
            {c.porDia != null
              ? <div><small>Por {c.peloHorario ? "dia aberto" : "dia"}</small><b className="g-tab">{brl(c.porDia)}</b><small>para fechar a meta</small></div>
              : <div><small>Por dia aberto</small><b>—</b><small>não há mais dia aberto neste mês</small></div>}
          </>
        ) : (
          <>
            <div><small>Meta</small><b>Alcançada</b></div>
            <div><small>Acima da meta</small><b className="g-tab">{brl(c.passou)}</b></div>
            <div><small>Até o fim do mês</small><b className="g-tab">{c.dias} {nomeDosDias}</b></div>
          </>
        )}
      </div>
    </section>
  );
}

function FolhaMeta({ aoFechar }: { aoFechar: () => void }) {
  const { sb, petshop, recarregarBase } = useGestao();
  const { avisar, avisarErro } = useAvisos();
  const atual = petshop.meta_mes == null ? null : Number(petshop.meta_mes);
  const [valor, setValor] = useState<number | null>(atual && atual > 0 ? atual : null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function gravar(meta: number | null) {
    if (salvando) return;
    if (meta != null && !(meta > 0)) { setErro("Escreva o valor da meta."); return; }
    if (meta != null && meta >= 1e8) { setErro("Esse valor é grande demais."); return; }
    setSalvando(true);
    try {
      const r = await sb.from("petshops").update({ meta_mes: meta }).eq("id", petshop.id).select("id");
      if (r.error) throw new Error(r.error.message);
      if (!r.data?.length) throw new Error("Só o dono do pet shop pode mudar a meta.");
      await recarregarBase();
      avisar(meta == null ? "Meta retirada." : `Meta do mês: ${brl(meta)}.`);
      avisarMudanca();
      aoFechar();
    } catch (e) {
      avisarErro(e);
      setSalvando(false);
    }
  }

  return (
    <Folha titulo="Quanto você quer que entre no mês" aoFechar={aoFechar}
      rodape={<>
        {atual != null && atual > 0 && <button type="button" className="g-btn sec" onClick={() => void gravar(null)} disabled={salvando}>Tirar a meta</button>}
        <button type="button" className="g-btn pri" onClick={() => void gravar(valor)} disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
      </>}>
      <form className="g-form" onSubmit={(e) => { e.preventDefault(); void gravar(valor); }}>
        <Campo rotulo="Quanto você quer que entre por mês" erro={erro} dica="Vale para todos os meses, até você mudar. Conta tudo o que entrou e já foi pago.">
          <CampoDinheiro valor={valor} aoMudar={(v) => { setValor(v); setErro(null); }} autoFocus maximo={99999999} />
        </Campo>
        <button type="submit" hidden />
      </form>
    </Folha>
  );
}

function Comparacao({ contas, mesAtual, nomeAnterior }: {
  contas: { entrou: number; saiu: number; entrouAntes: number; saiuAntes: number; temAnterior: boolean }; mesAtual: boolean; nomeAnterior: string;
}) {
  if (!contas.temAnterior) return <p className="g-muted g-p">Não há lançamentos em {nomeAnterior} para comparar.</p>;
  const frase = (agora: number, antes: number) => {
    const d = centavos((agora - antes));
    if (d === 0) return `o mesmo que em ${nomeAnterior}`;
    return `${brl(Math.abs(d))} a ${d > 0 ? "mais" : "menos"} que em ${nomeAnterior}`;
  };
  return (
    <p className="g-p">
      {mesAtual ? "Até agora, o faturamento é " : "O faturamento foi "}<b>{frase(contas.entrou, contas.entrouAntes)}</b> e as despesas, <b>{frase(contas.saiu, contas.saiuAntes)}</b>.
      {mesAtual && <span className="g-muted"> O mês ainda não acabou.</span>}
    </p>
  );
}

/** Barras lado a lado (entrou e saiu) para cada semana do mês. */
function Fluxo({ semanas, atual }: { semanas: { rotulo: string; entrou: number; saiu: number }[]; atual: number }) {
  const maior = Math.max(...semanas.flatMap((s) => [s.entrou, s.saiu]), 1);
  const altura = (v: number) => (v ? Math.max(3, (v / maior) * 100) : 0);
  return (
    <div className="g-fin-fluxo" role="img"
      aria-label={semanas.map((s) => `Dias ${s.rotulo}: faturamento ${brl(s.entrou)}, despesas ${brl(s.saiu)}`).join(". ")}>
      {semanas.map((s, i) => (
        <div key={s.rotulo} className={i === atual ? "agora" : undefined} title={`Dias ${s.rotulo}: faturamento ${brl(s.entrou)}, despesas ${brl(s.saiu)}`}>
          <div className="cols">
            <span className="e"><b style={{ bottom: `${altura(s.entrou)}%` }}>{s.entrou ? brlMini(s.entrou) : ""}</b><i style={{ height: `${altura(s.entrou)}%` }} /></span>
            <span className="s"><b style={{ bottom: `${altura(s.saiu)}%` }}>{s.saiu ? brlMini(s.saiu) : ""}</b><i style={{ height: `${altura(s.saiu)}%` }} /></span>
          </div>
          <small>{s.rotulo}</small>
        </div>
      ))}
    </div>
  );
}

const QUENTES = ["#b3402e", "#ea670c", "#c99a2e", "#8b3440", "#5b4590", "#2f6f8a", "#6a625a", "#a39a90"];

function Categorias({ titulo, total, linhas, vazio, quente, icone, tom, nota }: {
  titulo: string; total: number; linhas: { nome: string; valor: number }[]; vazio: string; quente?: boolean;
  icone: React.ComponentType<{ size?: number }>; tom: "menta" | "rosa"; nota?: string;
}) {
  const cores = quente ? QUENTES : PALETA;
  const pct = percentuaisQueFecham(linhas.map((c) => c.valor));
  const pctDe = new Map(linhas.map((c, i) => [c.valor, pct[i]]));
  return (
    <section className="g-card">
      <div className="g-card-t"><h3><Tile icone={icone} tom={tom} tamanho="p" />{titulo}</h3><b className="g-tab">{brl(total)}</b></div>
      {linhas.length ? (
        <Ranking itens={linhas.map((c, i) => ({ rotulo: c.nome, valor: c.valor, cor: cores[i % cores.length] }))}
          formato={(v) => `${brl(v)} · ${pctDe.get(v) ?? Math.round((v / total) * 100)}%`} />
      ) : <p className="g-muted g-p">{vazio}</p>}
      {nota && <p className="g-muted g-pp" style={{ marginTop: 8 }}>{nota}</p>}
    </section>
  );
}

function Contas({ lista, receber, hoje, tutores, aoEditar, aoBaixar, aoCriar }: {
  lista: Lancamento[]; receber: boolean; hoje: string; tutores: Map<string, string>;
  aoEditar: (c: Lancamento) => void; aoBaixar: (c: Lancamento) => void; aoCriar: () => void;
}) {
  const { petshop } = useGestao();
  if (!lista.length) {
    return (
      <Vazio titulo={receber ? "Ninguém está devendo." : "Nenhuma conta para pagar."}
        texto={receber ? "Quando alguém ficar de pagar depois, anote aqui para não esquecer." : "Anote aluguel, luz e fornecedores para ver o que vence."}>
        <button className="g-btn sec" onClick={aoCriar}><Plus />Anotar uma conta</button>
      </Vazio>
    );
  }
  const atrasadas = lista.filter((c) => c.vencimento && c.vencimento < hoje);
  const deHoje = lista.filter((c) => c.vencimento === hoje);
  const em7 = isoDia(somaDias(deIsoDia(hoje), 7));
  const proximas = lista.filter((c) => c.vencimento && c.vencimento > hoje && c.vencimento <= em7);
  const quantas = (q: number) => (q === 1 ? "1 conta" : `${q} contas`);
  // vencimento de outro ano aparece com o ano, para não confundir 10/01 deste ano com 10/01 do ano que vem
  const outroAno = (v: string) => v.slice(0, 4) !== hoje.slice(0, 4);
  return (
    <div className="g-pilha">
      <section className={`g-fin-total${receber ? " receber" : ""}`}>
        <div className="g-fila" style={{ flexWrap: "nowrap", gap: 14 }}>
          <Tile icone={receber ? HandCoins : Receipt} tom={receber ? "menta" : "manteiga"} tamanho="g" />
          <div style={{ minWidth: 0 }}>
            <p className="g-rotulo">{receber ? "Total a receber" : "Total a pagar"}</p>
            <p className="g-num m" style={{ marginTop: 6 }}>{brl(soma(lista))}</p>
          </div>
          {atrasadas.length > 0 && <span className="g-tag vermelho g-fin-so-largo" style={{ marginLeft: "auto" }}>{brl(soma(atrasadas))} em atraso</span>}
        </div>
        <div className="g-fin-prazos">
          <div className={atrasadas.length ? "rosa" : undefined}>
            <Tile icone={TriangleAlert} tom="rosa" tamanho="p" />
            <span><small>Em atraso</small><b>{brl(soma(atrasadas))}</b><small>{atrasadas.length ? quantas(atrasadas.length) : "nenhuma"}</small></span>
          </div>
          <div>
            <Tile icone={CalendarClock} tom="manteiga" tamanho="p" />
            <span><small>Vence hoje</small><b>{brl(soma(deHoje))}</b><small>{deHoje.length ? quantas(deHoje.length) : "nenhuma"}</small></span>
          </div>
          <div>
            <Tile icone={CalendarDays} tom="ceu" tamanho="p" />
            <span><small>Próximos 7 dias</small><b>{brl(soma(proximas))}</b><small>{proximas.length ? quantas(proximas.length) : "nenhuma"}</small></span>
          </div>
        </div>
      </section>
      <section className="g-card">
      <div className="g-lista">
        {lista.map((c) => {
          const v = c.vencimento;
          const tutor = receber && c.cliente_id ? tutores.get(c.cliente_id) : null;
          const etiqueta = !v ? { texto: "sem data", tom: "" }
            : v < hoje ? { texto: "atrasada", tom: " vermelho" }
            : v === hoje ? { texto: "vence hoje", tom: " amarelo" }
            : { texto: outroAno(v) ? dataCompleta(v) : dataCurta(v), tom: "" };
          return (
            <div key={c.id} className="g-linha gf-conta">
              <button className="gf-toque" onClick={() => aoEditar(c)} aria-label={`Editar ${c.descricao || c.categoria}`}>
                <span className="g-fin-so-largo"><Tile icone={v && v < hoje ? TriangleAlert : receber ? HandCoins : Receipt} tom={v && v < hoje ? "rosa" : receber ? "menta" : "manteiga"} /></span>
                <span className="t">
                  <b>{descricaoAtual(c.descricao) || categoriaAtual(c.categoria, petshop)}</b>
                  <span>{tutor ? `${tutor} · ` : ""}{c.competencia ? "conta fixa · " : ""}{categoriaAtual(c.categoria, petshop)}{textoJaRecebido(c) ? ` · ${textoJaRecebido(c)}` : ""}{v && v !== hoje ? ` · ${v < hoje ? "venceu" : "vence"} ${outroAno(v) ? `em ${dataCompleta(v)}` : dataAmigavel(v)}` : ""}</span>
                  {c.valor_estimado && <span className="g-fin-estimado">valor estimado: confira a conta</span>}
                </span>
                <span className="d">
                  <b>{brl(c.valor)}</b>
                  <span className={`g-tag${etiqueta.tom}`}>{etiqueta.texto}</span>
                </span>
              </button>
              <button className="g-btn p verde" onClick={() => aoBaixar(c)} aria-label={`${receber ? "Recebi" : "Paguei"}: dar baixa em ${c.descricao || c.categoria}`}>
                <Check />{receber ? "Recebi" : "Paguei"}
              </button>
            </div>
          );
        })}
      </div>
      </section>
    </div>
  );
}
