"use client";

import { useMemo, useState } from "react";
import {
  ArrowDownLeft, ArrowUpRight, CalendarClock, CalendarDays, ChartColumn, Check, ChevronLeft, ChevronRight, CreditCard, Download, HandCoins, Plus, Receipt, Scale,
  Search, Target, TrendingUp, TriangleAlert,
} from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { avisarMudanca, Campo, CampoValor, Esqueleto, Folha, useAvisos, useDados, useSomenteLeitura, Vazio } from "@/components/gestao/ui";
import {
  brlMini, Chips, COR_FORMA, ErroDeCarga, FolhaBaixa, FolhaLancamento, hojeIso, PALETA, paginar, resumoDeItens, rotuloForma, SemAcesso, soma, type Tipo,
} from "@/components/gestao/financeiro/comum";
import { Kpi, Ranking, Rosca, Tendencia, Tile } from "@/components/gestao/painel";
import { contasDaMeta } from "@/lib/gestao/dinheiro";
import { FORMAS } from "@/lib/gestao/tipos";
import type { Lancamento } from "@/lib/gestao/tipos";
import { brl, dataAmigavel, dataCompleta, dataCurta, deIsoDia, isoDia, nomeMes, semAcento, somaDias } from "@/lib/gestao/util";
import "./financeiro.css";

export default function PaginaFinanceiro() {
  const { vejoFinanceiro } = useGestao();
  return vejoFinanceiro ? <Financeiro /> : <SemAcesso />;
}

type Aba = "resumo" | "pagar" | "receber" | "lancamentos";
const ABAS: { id: Aba; rotulo: string }[] = [
  { id: "resumo", rotulo: "Resumo" },
  { id: "pagar", rotulo: "A pagar" },
  { id: "receber", rotulo: "A receber" },
  { id: "lancamentos", rotulo: "Lançamentos" },
];
const FILTROS = [{ id: "tudo", rotulo: "Tudo" }, { id: "entrada", rotulo: "Entradas" }, { id: "saida", rotulo: "Saídas" }] as const;
type Filtro = (typeof FILTROS)[number]["id"];

type FolhaAberta =
  | { tipo: "novo" }
  | { tipo: "editar"; lancamento: Lancamento }
  | { tipo: "conta"; de: Tipo; conta?: Lancamento }
  | { tipo: "baixa"; conta: Lancamento }
  | { tipo: "meta" };

type Movimento = Pick<Lancamento, "tipo" | "valor">;

function porCategoria(lista: Lancamento[]) {
  const mapa = new Map<string, number>();
  for (const l of lista) mapa.set(l.categoria, (mapa.get(l.categoria) ?? 0) + Number(l.valor));
  return [...mapa].map(([nome, valor]) => ({ nome, valor: Math.round(valor * 100) / 100 })).sort((a, b) => b.valor - a.valor);
}

function Financeiro() {
  const { sb, petshop } = useGestao();
  const { avisar } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const agora = new Date();
  const [mes, setMes] = useState(() => new Date(agora.getFullYear(), agora.getMonth(), 1));
  const [aba, setAba] = useState<Aba>("resumo");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("tudo");
  const [folha, setFolha] = useState<FolhaAberta | null>(null);

  const inicio = isoDia(mes);
  const fim = isoDia(new Date(mes.getFullYear(), mes.getMonth() + 1, 0));
  const mesAnterior = new Date(mes.getFullYear(), mes.getMonth() - 1, 1);
  const mesAtual = mes.getFullYear() === agora.getFullYear() && mes.getMonth() === agora.getMonth();
  const hoje = hojeIso();

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const [doMes, anterior, contas] = await Promise.all([
      paginar<Lancamento>((de, ate) => sb.from("lancamentos").select("*").eq("petshop_id", petshop.id).eq("pago", true)
        .gte("data", inicio).lte("data", fim).order("data", { ascending: false }).order("criado_em", { ascending: false }).order("id").range(de, ate)),
      paginar<Movimento>((de, ate) => sb.from("lancamentos").select("tipo, valor").eq("petshop_id", petshop.id).eq("pago", true)
        .gte("data", isoDia(mesAnterior)).lt("data", inicio).order("id").range(de, ate)),
      paginar<Lancamento>((de, ate) => sb.from("lancamentos").select("*").eq("petshop_id", petshop.id).eq("pago", false)
        .order("vencimento", { ascending: true, nullsFirst: false }).order("id").range(de, ate)),
    ]);
    return { doMes, anterior, contas };
  }, [petshop.id, inicio]);

  const contas = useMemo(() => {
    const doMes = dados?.doMes ?? [];
    const entradas = doMes.filter((l) => l.tipo === "entrada");
    const saidas = doMes.filter((l) => l.tipo === "saida");
    const anterior = dados?.anterior ?? [];
    return {
      entrou: soma(entradas), saiu: soma(saidas),
      entradasPorCategoria: porCategoria(entradas), saidasPorCategoria: porCategoria(saidas),
      entrouAntes: soma(anterior.filter((l) => l.tipo === "entrada")), saiuAntes: soma(anterior.filter((l) => l.tipo === "saida")),
      temAnterior: anterior.length > 0,
      aPagar: (dados?.contas ?? []).filter((l) => l.tipo === "saida"),
      aReceber: (dados?.contas ?? []).filter((l) => l.tipo === "entrada"),
    };
  }, [dados]);
  const resultado = Math.round((contas.entrou - contas.saiu) * 100) / 100;

  // desenhos do resumo: semanas do mês, entradas acumuladas e formas de pagamento
  const graficos = useMemo(() => {
    const doMes = dados?.doMes ?? [];
    const ultimoDia = deIsoDia(fim).getDate();
    const semanas = Array.from({ length: Math.ceil(ultimoDia / 7) }, (_, i) => ({
      rotulo: `${i * 7 + 1} a ${Math.min(ultimoDia, i * 7 + 7)}`, entrou: 0, saiu: 0,
    }));
    const porDia = Array.from({ length: ultimoDia }, () => 0);
    const formas = new Map<string, number>();
    let nEntradas = 0, nSaidas = 0;
    for (const l of doMes) {
      const dia = deIsoDia(l.data).getDate(), v = Number(l.valor), sem = semanas[Math.floor((dia - 1) / 7)];
      if (l.tipo === "entrada") {
        nEntradas++;
        if (sem) sem.entrou += v;
        porDia[dia - 1] += v;
        formas.set(l.forma ?? "outro", (formas.get(l.forma ?? "outro") ?? 0) + v);
      } else {
        nSaidas++;
        if (sem) sem.saiu += v;
      }
    }
    const ate = mesAtual ? deIsoDia(hoje).getDate() : ultimoDia;
    let corrido = 0;
    const acumulado = porDia.slice(0, ate).map((v) => (corrido += v));
    return {
      semanas, acumulado, ate, nEntradas, nSaidas,
      semanaAtual: mesAtual ? Math.floor((deIsoDia(hoje).getDate() - 1) / 7) : -1,
      formas: FORMAS.map((f) => ({ id: f.id as string, rotulo: f.rotulo as string, valor: Math.round((formas.get(f.id) ?? 0) * 100) / 100, cor: COR_FORMA[f.id] })).filter((f) => f.valor > 0),
    };
  }, [dados, fim, mesAtual, hoje]);
  const atrasadasPagar = contas.aPagar.filter((c) => c.vencimento && c.vencimento < hoje);
  const n = (q: number, um: string, varios: string) => (q === 1 ? `1 ${um}` : `${q} ${varios}`);

  const abrir = (f: FolhaAberta) => { if (somenteLeitura()) return; setFolha(f); };

  function exportar() {
    const linhas = dados?.doMes ?? [];
    if (!linhas.length) { avisar("Não há lançamentos neste mês para exportar."); return; }
    const campo = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const numero = (n: number) => Number(n).toFixed(2).replace(".", ",");
    const csv = [
      ["Data", "Tipo", "Categoria", "Descrição", "Forma", "Valor"].join(";"),
      ...[...linhas].reverse().map((l) => [
        dataCompleta(l.data), l.tipo === "entrada" ? "Entrada" : "Saída", campo(l.categoria), campo(l.descricao ?? ""),
        l.forma ? rotuloForma(l.forma) : "", numero(l.tipo === "entrada" ? l.valor : -l.valor),
      ].join(";")),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `financeiro-${inicio.slice(0, 7)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const alvo = semAcento(busca);
  const filtrados = (dados?.doMes ?? []).filter((l) =>
    (filtro === "tudo" || l.tipo === filtro) &&
    (!alvo || semAcento(`${l.descricao ?? ""} ${l.categoria} ${rotuloForma(l.forma)}`).includes(alvo)));

  const tituloMes = `${nomeMes(mes)} de ${mes.getFullYear()}`;
  const acao = aba === "pagar" ? { rotulo: "Nova conta", abre: (): FolhaAberta => ({ tipo: "conta", de: "saida" }) }
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
          <button className="g-btn sec" onClick={exportar} disabled={!dados} title={`Baixar os lançamentos de ${tituloMes} em planilha`}><Download />Exportar</button>
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
              <Kpi icone={ArrowDownLeft} tom="menta" rotulo="Entrou" valor={<span className="gf-kpi-v">{brl(contas.entrou)}</span>}
                apoio={graficos.nEntradas ? n(graficos.nEntradas, "entrada", "entradas") : "nada ainda"} />
              <Kpi icone={ArrowUpRight} tom="rosa" rotulo="Saiu" valor={<span className="gf-kpi-v">{brl(contas.saiu)}</span>}
                apoio={graficos.nSaidas ? n(graficos.nSaidas, "saída", "saídas") : "nada ainda"} />
              <Kpi icone={Scale} tom={resultado < 0 ? "rosa" : "ceu"} rotulo="Resultado do mês"
                valor={<span className={`gf-kpi-v${resultado < 0 ? " g-vermelho-t" : ""}`}>{brl(resultado)}</span>}
                apoio={resultado < 0 ? "saiu mais do que entrou" : resultado > 0 ? (mesAtual ? "sobrando até agora" : "sobrou no mês") : "empatado"} />
              <Kpi icone={Receipt} tom="manteiga" rotulo="Contas a pagar" valor={<span className="gf-kpi-v">{brl(soma(contas.aPagar))}</span>}
                apoio={!contas.aPagar.length ? "nenhuma em aberto" : atrasadasPagar.length ? `${n(atrasadasPagar.length, "atrasada", "atrasadas")} de ${contas.aPagar.length}` : n(contas.aPagar.length, "conta em aberto", "contas em aberto")} />
            </section>

            <div className="gf-rola">
              <div className="g-seg" role="group" aria-label="Parte do financeiro">
                {ABAS.map((a) => (
                  <button key={a.id} aria-pressed={aba === a.id} onClick={() => setAba(a.id)}>
                    {a.rotulo}
                    {a.id === "pagar" && contas.aPagar.length > 0 ? ` (${contas.aPagar.length})` : ""}
                    {a.id === "receber" && contas.aReceber.length > 0 ? ` (${contas.aReceber.length})` : ""}
                  </button>
                ))}
              </div>
            </div>

            {aba === "resumo" && mesAtual && <CartaoMeta entrou={contas.entrou} aoEditar={() => abrir({ tipo: "meta" })} />}

            {aba === "resumo" && (
              dados.doMes.length ? (
                <div className="g-duas">
                  <div className="g-pilha">
                    <section className="g-card">
                      <div className="g-card-t g-fin-cab">
                        <h3><Tile icone={ChartColumn} tom="menta" tamanho="p" />Entradas e saídas por semana</h3>
                        <div className="g-fin-leg"><span><i className="e" />Entrou</span><span><i className="s" />Saiu</span></div>
                      </div>
                      <Fluxo semanas={graficos.semanas} atual={graficos.semanaAtual} />
                      <div className="g-fin-nota"><Comparacao contas={contas} mesAtual={mesAtual} nomeAnterior={nomeMes(mesAnterior)} /></div>
                    </section>
                    <div className="g-fin-par">
                      <section className="g-card">
                        <div className="g-card-t"><h3><Tile icone={CreditCard} tom="ceu" tamanho="p" />Como entrou</h3><span className="g-muted g-pp">forma de pagamento</span></div>
                        {graficos.formas.length ? (
                          <div className="g-fin-rosca">
                            <Rosca fatias={graficos.formas} tamanho={116}>{graficos.formas.length}<small>{graficos.formas.length === 1 ? "forma" : "formas"}</small></Rosca>
                            <div className="g-legenda">
                              {graficos.formas.map((f) => (
                                <div key={f.id}><i style={{ background: f.cor }} /><span>{f.rotulo} <span className="g-muted g-pp">{Math.round((f.valor / contas.entrou) * 100)}%</span></span><b>{brl(f.valor)}</b></div>
                              ))}
                            </div>
                          </div>
                        ) : <p className="g-muted g-p">Nenhuma entrada neste mês.</p>}
                      </section>
                      <section className="g-card g-fin-acum">
                        <div className="g-card-t"><h3><Tile icone={TrendingUp} tom="menta" tamanho="p" />Entradas acumuladas</h3><span className="g-muted g-pp">{mesAtual ? `até o dia ${graficos.ate}` : "mês inteiro"}</span></div>
                        <p className="g-num m">{brl(contas.entrou)}</p>
                        {graficos.acumulado.length >= 2 && contas.entrou > 0
                          ? <Tendencia valores={graficos.acumulado} largura={300} altura={84} />
                          : <p className="g-muted g-p" style={{ marginTop: 8 }}>{contas.entrou > 0 ? "A linha aparece a partir do segundo dia do mês." : "Nenhuma entrada neste mês."}</p>}
                        {graficos.acumulado.length >= 2 && contas.entrou > 0 && <div className="g-fin-eixo"><span>dia 1</span><span>dia {graficos.ate}</span></div>}
                      </section>
                    </div>
                  </div>
                  <div className="g-pilha">
                    <Categorias titulo="De onde veio" icone={ArrowDownLeft} tom="menta" total={contas.entrou} linhas={contas.entradasPorCategoria} vazio="Nenhuma entrada neste mês." />
                    <Categorias titulo="Para onde foi" icone={ArrowUpRight} tom="rosa" total={contas.saiu} linhas={contas.saidasPorCategoria} vazio="Nenhuma saída neste mês." quente />
                  </div>
                </div>
              ) : (
                <Vazio titulo={`Nada lançado em ${nomeMes(mes)}.`} texto="Quando você receber ou pagar alguma coisa, o resumo do mês aparece aqui." />
              )
            )}

            {(aba === "pagar" || aba === "receber") && (
              <Contas lista={aba === "pagar" ? contas.aPagar : contas.aReceber} receber={aba === "receber"} hoje={hoje}
                aoEditar={(c) => abrir({ tipo: "conta", de: c.tipo as Tipo, conta: c })}
                aoBaixar={(c) => abrir({ tipo: "baixa", conta: c })}
                aoCriar={() => abrir({ tipo: "conta", de: aba === "pagar" ? "saida" : "entrada" })} />
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
                    {filtro !== "saida" && ` · entrou ${brl(soma(filtrados.filter((l) => l.tipo === "entrada")))}`}
                    {filtro !== "entrada" && ` · saiu ${brl(soma(filtrados.filter((l) => l.tipo === "saida")))}`}
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
                            <b>{l.descricao || l.categoria}</b>
                            <span>{dataCurta(l.data)}{l.descricao ? ` · ${l.categoria}` : ""}{resumoDeItens(l) && ` · ${resumoDeItens(l)}`}<i className="g-fin-so-cel"> · {rotuloForma(l.forma)}</i></span>
                          </span>
                          <span className="g-tag g-fin-so-largo">{rotuloForma(l.forma)}</span>
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
          <h3>Meta do mês</h3>
          <p className="g-muted g-p">Diga quanto você quer que entre no mês. O progresso aparece aqui e na tela inicial.</p>
        </div>
        <button className="g-btn sec" onClick={aoEditar}><Target />Definir meta</button>
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
    <Folha titulo="Meta do mês" aoFechar={aoFechar}
      rodape={<>
        {atual != null && atual > 0 && <button type="button" className="g-btn sec" onClick={() => void gravar(null)} disabled={salvando}>Tirar a meta</button>}
        <button type="button" className="g-btn pri" onClick={() => void gravar(valor)} disabled={salvando}>{salvando ? "Guardando…" : "Guardar"}</button>
      </>}>
      <form className="g-form" onSubmit={(e) => { e.preventDefault(); void gravar(valor); }}>
        <Campo rotulo="Quanto você quer que entre por mês" erro={erro} dica="Vale para todos os meses, até você mudar. Conta tudo o que entrou e já foi pago.">
          <CampoValor valor={valor} aoMudar={(v) => { setValor(v); setErro(null); }} autoFocus />
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
    const d = Math.round((agora - antes) * 100) / 100;
    if (d === 0) return `o mesmo que em ${nomeAnterior}`;
    return `${brl(Math.abs(d))} a ${d > 0 ? "mais" : "menos"} que em ${nomeAnterior}`;
  };
  return (
    <p className="g-p">
      {mesAtual ? "Até agora, entrou " : "Entrou "}<b>{frase(contas.entrou, contas.entrouAntes)}</b> e saiu <b>{frase(contas.saiu, contas.saiuAntes)}</b>.
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
      aria-label={semanas.map((s) => `Dias ${s.rotulo}: entrou ${brl(s.entrou)}, saiu ${brl(s.saiu)}`).join(". ")}>
      {semanas.map((s, i) => (
        <div key={s.rotulo} className={i === atual ? "agora" : undefined} title={`Dias ${s.rotulo}: entrou ${brl(s.entrou)}, saiu ${brl(s.saiu)}`}>
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

function Categorias({ titulo, total, linhas, vazio, quente, icone, tom }: {
  titulo: string; total: number; linhas: { nome: string; valor: number }[]; vazio: string; quente?: boolean;
  icone: React.ComponentType<{ size?: number }>; tom: "menta" | "rosa";
}) {
  const cores = quente ? QUENTES : PALETA;
  return (
    <section className="g-card">
      <div className="g-card-t"><h3><Tile icone={icone} tom={tom} tamanho="p" />{titulo}</h3><b className="g-tab">{brl(total)}</b></div>
      {linhas.length ? (
        <Ranking itens={linhas.map((c, i) => ({ rotulo: c.nome, valor: c.valor, cor: cores[i % cores.length] }))}
          formato={(v) => `${brl(v)} · ${Math.round((v / total) * 100)}%`} />
      ) : <p className="g-muted g-p">{vazio}</p>}
    </section>
  );
}

function Contas({ lista, receber, hoje, aoEditar, aoBaixar, aoCriar }: {
  lista: Lancamento[]; receber: boolean; hoje: string;
  aoEditar: (c: Lancamento) => void; aoBaixar: (c: Lancamento) => void; aoCriar: () => void;
}) {
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
          const etiqueta = !v ? { texto: "sem data", tom: "" }
            : v < hoje ? { texto: "atrasada", tom: " vermelho" }
            : v === hoje ? { texto: "vence hoje", tom: " amarelo" }
            : { texto: dataCurta(v), tom: "" };
          return (
            <div key={c.id} className="g-linha gf-conta">
              <button className="gf-toque" onClick={() => aoEditar(c)} aria-label={`Editar ${c.descricao || c.categoria}`}>
                <span className="g-fin-so-largo"><Tile icone={v && v < hoje ? TriangleAlert : receber ? HandCoins : Receipt} tom={v && v < hoje ? "rosa" : receber ? "menta" : "manteiga"} /></span>
                <span className="t">
                  <b>{c.descricao || c.categoria}</b>
                  <span>{c.categoria}{v && v !== hoje ? ` · ${v < hoje ? "venceu" : "vence"} ${dataAmigavel(v)}` : ""}</span>
                </span>
                <span className="d">
                  <b>{brl(c.valor)}</b>
                  <span className={`g-tag${etiqueta.tom}`}>{etiqueta.texto}</span>
                </span>
              </button>
              <button className="g-btn p verde" onClick={() => aoBaixar(c)} aria-label={`Dar baixa em ${c.descricao || c.categoria}`}>
                <Check /><span className="gf-so-largo">Dar baixa</span>
              </button>
            </div>
          );
        })}
      </div>
      </section>
    </div>
  );
}
