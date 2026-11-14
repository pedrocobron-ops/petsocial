"use client";

import { useState } from "react";
import { ArrowDownLeft, ArrowDownToLine, ArrowUpFromLine, ArrowUpRight, Banknote, ChartColumn, Check, Coins, CreditCard, Download, History, Lock, Minus, Plus, Scale, ShoppingBag, Wallet } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { CampoDinheiro } from "@/components/gestao/loja/pecas";
import { caixaAberto, CATEGORIA_GAVETA, conferirValorAlto, desfazerVenda, lancarPago, lembrarCaixa, nomeDoMovimento, partesPorForma, percentuaisQueFecham, textoDoPagamento, ultimoContado } from "@/lib/gestao/dinheiro";
import { avisarMudanca, Campo, Esqueleto, Folha, useAvisos, useDados, useSomenteLeitura, Vazio } from "@/components/gestao/ui";
import "@/components/gestao/financeiro/recebimentos.css";
import {
  Apagados, baixarPlanilha, brlMini, categoriaAtual, COR_FORMA, dinheiroCsv, ehDeServico, ErroDeCarga, FolhaLancamento, hojeIso, LinhaResumo, paginar, resumoDeItens, resumoDoCaixa, rotuloForma, SemAcesso, semMovimentos, soma,
  somaPorForma, TagAlterado, type Cel, type Tipo,
} from "@/components/gestao/financeiro/comum";
import { ContasDeClientes } from "@/components/gestao/financeiro/contas-clientes";
import VendaBalcao from "@/components/gestao/loja/venda";
import { Barras, Kpi, Rosca, Tile, type Tom } from "@/components/gestao/painel";
import type { AlteracaoLancamento, Caixa, Lancamento } from "@/lib/gestao/tipos";
import { brl, dataAmigavel, dataCompleta, dataCurta, dataLonga, hora, isoDia } from "@/lib/gestao/util";
import { useOperacao } from "@/lib/gestao/uma-vez";
import { AtendimentosParaCobrar } from "@/components/gestao/agenda/para-cobrar";
import "./caixa.css";

export default function PaginaCaixa() {
  const { vejoFinanceiro } = useGestao();
  return vejoFinanceiro ? <CaixaDoDia /> : <SemAcesso />;
}

/** Dinheiro esperado na gaveta: num caixa fechado vale o que o banco anotou na hora de fechar. */
function esperadoDo(caixa: Caixa, lancamentos: Lancamento[]) {
  return caixa.fechado_em && caixa.valor_esperado != null ? Number(caixa.valor_esperado) : resumoDoCaixa(caixa.valor_inicial, lancamentos).esperado;
}

type FolhaAberta =
  | { tipo: "abrir" }
  | { tipo: "novo"; de: Tipo }
  | { tipo: "editar"; lancamento: Lancamento }
  | { tipo: "fechar" }
  | { tipo: "venda" }
  | { tipo: "gaveta"; de: Gaveta; lancamento?: Lancamento }
  | { tipo: "resumo"; caixaId: string };

type Gaveta = "sangria" | "suprimento";

function diferenca(contado: number | null, esperado: number) {
  if (contado == null) return null;
  const d = Math.round((contado - esperado) * 100) / 100;
  if (d === 0) return { tom: "certo", etiqueta: "verde", texto: "Bateu certinho.", curto: "bateu" } as const;
  if (d > 0) return { tom: "sobra", etiqueta: "azul", texto: `Sobra de ${brl(d)}.`, curto: `sobra ${brl(d)}` } as const;
  return { tom: "falta", etiqueta: "vermelho", texto: `Falta de ${brl(-d)}.`, curto: `falta ${brl(-d)}` } as const;
}

/**
 * Planilha de um caixa: os movimentos (pagamento dividido vira uma linha por forma) e, embaixo, as mesmas contas
 * que a tela mostra (`resumoDoCaixa` e `diferenca`).
 */
function exportarCaixa(caixa: Caixa, lancamentos: Lancamento[]) {
  const r = resumoDoCaixa(caixa.valor_inicial, lancamentos);
  const esperado = esperadoDo(caixa, lancamentos);
  const dif = diferenca(caixa.valor_contado, esperado);
  const emOrdem = [...lancamentos].sort((a, b) => a.criado_em.localeCompare(b.criado_em) || a.id.localeCompare(b.id));
  const movimentos = emOrdem.flatMap((l): Cel[][] => {
    const gaveta = Boolean(l.movimento), entrada = l.tipo === "entrada";
    const tipo = l.movimento === "sangria" ? "Sangria" : l.movimento === "suprimento" ? "Suprimento" : entrada ? "Entrada" : "Saída";
    const descricao = gaveta ? [nomeDoMovimento(l.movimento), l.descricao].filter(Boolean).join(": ") : [l.descricao, resumoDeItens(l)].filter(Boolean).join(" · ");
    return partesPorForma(l).map((p): Cel[] => [
      dataCompleta(l.criado_em), hora(l.criado_em), descricao, categoriaAtual(l.categoria), tipo, rotuloForma(p.forma), dinheiroCsv(entrada ? p.valor : -p.valor),
    ]);
  });
  const linha = (nome: string, valor: number): Cel[] => [nome, dinheiroCsv(valor)];
  const tabela: Cel[][] = [
    ["Data", "Hora", "Descrição", "Categoria", "Tipo", "Forma de pagamento", "Valor"],
    ...movimentos,
    [],
    ["Resumo do caixa", "Valor"],
    ["Aberto em", `${dataCompleta(caixa.aberto_em)} ${hora(caixa.aberto_em)}`],
    ["Fechado em", caixa.fechado_em ? `${dataCompleta(caixa.fechado_em)} ${hora(caixa.fechado_em)}` : "Ainda aberto"],
    linha("Troco inicial", Number(caixa.valor_inicial)),
    linha("Entradas", r.entrou),
    ...r.porForma.filter((f) => f.entrou > 0).map((f) => linha(`Entradas em ${f.rotulo.toLowerCase()}`, f.entrou)),
    linha("Saídas", r.saiu),
    ...r.porForma.filter((f) => f.saiu > 0).map((f) => linha(`Saídas em ${f.rotulo.toLowerCase()}`, f.saiu)),
    linha("Colocado na gaveta (suprimento)", r.suprimentos),
    linha("Tirado da gaveta (sangria)", r.sangrias),
    linha("Dinheiro esperado na gaveta", esperado),
    ...(caixa.valor_contado == null ? [] : [
      linha("Dinheiro contado", Number(caixa.valor_contado)),
      linha("Diferença (contado menos esperado)", Math.round((Number(caixa.valor_contado) - esperado) * 100) / 100),
      ["Resultado", dif?.texto ?? ""] as Cel[],
    ]),
    ...(caixa.obs ? [["Observação", caixa.obs] as Cel[]] : []),
  ];
  const abertura = new Date(caixa.aberto_em);
  baixarPlanilha(tabela, `caixa-${isoDia(abertura)}-${hora(abertura).replace(":", "h")}.csv`);
}

function CaixaDoDia() {
  // `fin`: dono ou quem cuida do financeiro. Quem só opera o caixa vê a gaveta e o que entrou, não as despesas nem o histórico.
  const { sb, petshop, user, cuidoDoFinanceiro: fin } = useGestao();
  const { avisarErro } = useAvisos();
  const somenteLeitura = useSomenteLeitura();
  const [folha, setFolha] = useState<FolhaAberta | null>(null);
  const hoje = hojeIso();

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const a = await sb.from("caixas").select("*").eq("petshop_id", petshop.id).is("fechado_em", null).maybeSingle();
    if (a.error) throw new Error(a.error.message);
    const aberto: Caixa | null = a.data;
    const f = await sb.from("caixas").select("*").eq("petshop_id", petshop.id).not("fechado_em", "is", null)
      .order("fechado_em", { ascending: false }).limit(14);
    if (f.error) throw new Error(f.error.message);
    const fechados: Caixa[] = f.data ?? [];
    lembrarCaixa(petshop.id, aberto?.id ?? null);
    // quem só opera o caixa não lê os lançamentos de caixas fechados: o resumo deles vem do que o banco anotou ao fechar
    const ids = [...(aberto ? [aberto.id] : []), ...(fin ? fechados.map((c) => c.id) : [])];
    const dosCaixas = ids.length
      ? await paginar<Lancamento>((de, ate) => sb.from("lancamentos").select("*").eq("petshop_id", petshop.id).eq("pago", true)
        .in("caixa_id", ids).order("criado_em", { ascending: false }).order("id").range(de, ate))
      : [];
    // tudo o que foi pago hoje, com ou sem caixa: é a mesma conta da tela Hoje ("Entrou hoje")
    const doDia = await paginar<Lancamento>((de, ate) => sb.from("lancamentos").select("*").eq("petshop_id", petshop.id)
      .eq("pago", true).eq("data", hoje).order("criado_em", { ascending: false }).order("id").range(de, ate));
    // o que foi lançado hoje com o caixa fechado fica solto (sem caixa) e não entra na conferência da gaveta
    const soltos = doDia.filter((l) => !l.caixa_id);
    // valores recebidos que alguém apagou: deste caixa (ou de hoje, com o caixa fechado). Só chega para quem cuida do financeiro.
    let apagados: AlteracaoLancamento[] = [];
    if (fin) {
      const desde = aberto ? aberto.aberto_em : new Date(`${hoje}T00:00:00`).toISOString();
      const ap = await sb.from("lancamentos_alteracoes").select("*").eq("petshop_id", petshop.id).eq("acao", "apagou").gte("quando", desde).order("quando", { ascending: false }).limit(200);
      apagados = (ap.data ?? []).filter((a) => {
        const l = (a.antes ?? {}) as { caixa_id?: string | null; data?: string };
        return aberto ? l.caixa_id === aberto.id || (!l.caixa_id && l.data === hoje) : l.data === hoje;
      });
    }
    return { aberto, fechados, dosCaixas, soltos, doDia, apagados };
  }, [petshop.id, hoje, fin]);

  async function abrir(f: FolhaAberta) {
    if (f.tipo !== "resumo" && somenteLeitura()) return;
    // a tela pode estar parada há um tempo: antes de lançar ou fechar, confere se o caixa mostrado ainda é o aberto
    if (dados?.aberto && (f.tipo === "novo" || f.tipo === "venda" || f.tipo === "fechar" || (f.tipo === "gaveta" && !f.lancamento))) {
      const agora = await caixaAberto(sb, petshop.id);
      if (agora?.id !== dados.aberto.id) {
        avisarErro("Este caixa foi fechado há pouco, em outro aparelho. Abra um caixa novo para o valor entrar na conferência da gaveta.");
        await recarregar();
        return;
      }
    }
    setFolha(f);
  }
  const doCaixa = (id: string) => (dados?.dosCaixas ?? []).filter((l) => l.caixa_id === id);

  const topo = (
    <header className="g-topo">
      <div>
        <h1>Caixa</h1>
        <p className="g-muted">{dataLonga(new Date())}</p>
      </div>
      {dados?.aberto && (
        <div className="g-acoes">
          {fin && <button className="g-btn fantasma" onClick={() => exportarCaixa(dados.aberto!, doCaixa(dados.aberto!.id))}><Download />Exportar</button>}
          <button className="g-btn sec" onClick={() => void abrir({ tipo: "fechar" })}><Lock />Fechar o caixa</button>
        </div>
      )}
    </header>
  );

  if (!dados) {
    return <>{topo}{erro ? <ErroDeCarga erro={erro} tentar={recarregar} /> : carregando ? <Esqueleto linhas={4} /> : null}</>;
  }

  const { aberto, fechados, soltos, doDia, apagados } = dados;
  const lancamentos = aberto ? doCaixa(aberto.id) : soltos;
  // o dia inteiro (bate com a tela Hoje) e o que ficou fora do caixa
  // sangria e suprimento só mexem na gaveta: não são entrada nem saída do dia
  const vendasDoDia = semMovimentos(doDia), vendasSoltas = semMovimentos(soltos);
  const entrouNoDia = soma(vendasDoDia.filter((l) => l.tipo === "entrada")), saiuNoDia = soma(vendasDoDia.filter((l) => l.tipo === "saida"));
  const entrouFora = soma(vendasSoltas.filter((l) => l.tipo === "entrada")), saiuFora = soma(vendasSoltas.filter((l) => l.tipo === "saida"));
  // dinheiro em espécie fora do caixa: no pagamento dividido, só a parte em dinheiro
  const dinheiroFora = Math.round(((somaPorForma(vendasSoltas.filter((l) => l.tipo === "entrada")).get("dinheiro") ?? 0) - (somaPorForma(vendasSoltas.filter((l) => l.tipo === "saida")).get("dinheiro") ?? 0)) * 100) / 100;
  const emOutrosCaixas = Math.round((entrouNoDia - entrouFora - (aberto ? soma(semMovimentos(doCaixa(aberto.id)).filter((l) => l.tipo === "entrada" && l.data === hoje)) : 0)) * 100) / 100;
  const resumo = aberto ? resumoDoCaixa(aberto.valor_inicial, lancamentos) : null;
  const abertoEmOutroDia = aberto && isoDia(new Date(aberto.aberto_em)) !== hoje;
  const ultimo = fechados[0];
  const caixaDoResumo = folha?.tipo === "resumo" ? fechados.find((c) => c.id === folha.caixaId) : null;
  const entradasDoCaixa = resumo?.nEntradas ?? 0;
  const saidasDoCaixa = resumo?.nSaidas ?? 0;
  // quem só opera o caixa corrige o que ela mesma lançou no caixa aberto; o resto abre só para ver
  const podeMexer = (l: Lancamento) => fin || (l.criado_por === user.id && Boolean(aberto) && l.caixa_id === aberto?.id);
  const editar = (l: Lancamento) => void abrir((l.movimento === "sangria" || l.movimento === "suprimento") && podeMexer(l) ? { tipo: "gaveta", de: l.movimento, lancamento: l } : { tipo: "editar", lancamento: l });
  const saiuEmDinheiro = resumo?.porForma.find((f) => f.id === "dinheiro")?.saiu ?? 0;
  const saldo = resumo ? Math.round((resumo.entrou - resumo.saiu) * 100) / 100 : 0;
  const resumoUltimo = ultimo ? resumoDoCaixa(ultimo.valor_inicial, doCaixa(ultimo.id)) : null;
  // do mais antigo para o mais novo, para ler da esquerda para a direita
  const ultimosCaixas = fin ? fechados.slice(0, 7).reverse().map((c) => ({ rotulo: dataCurta(c.fechado_em!), valor: resumoDoCaixa(c.valor_inicial, doCaixa(c.id)).entrou })) : [];
  // dois caixas no mesmo dia: a hora de abrir e de fechar separa um do outro
  const horas = (c: Caixa) => `Aberto ${isoDia(new Date(c.aberto_em)) === isoDia(new Date(c.fechado_em!)) ? "" : `${dataCurta(c.aberto_em)} `}às ${hora(c.aberto_em)}, fechado às ${hora(c.fechado_em!)}`;

  return (
    <>
      {topo}
      {erro && <ErroDeCarga erro={erro} tentar={recarregar} />}
      <div className="g-pilha g">
        {abertoEmOutroDia && aberto && (
          <div className="g-aviso" style={{ marginBottom: 0 }}>
            <span>Este caixa está aberto desde {dataAmigavel(aberto.aberto_em)}. Feche e abra outro para o dia de hoje ficar separado.</span>
          </div>
        )}

        <div className={`g-cx-topo${aberto || ultimo ? "" : " so"}`}>
          {aberto && resumo ? (
            <section className="g-cx-heroi" aria-label="Caixa aberto">
              <Banknote className="fundo" aria-hidden />
              <div className="g-fila entre" style={{ flexWrap: "nowrap" }}>
                <span className="g-rotulo"><i className="g-cx-pulso" aria-hidden />Caixa aberto</span>
                <span className="g-cx-desde">desde {abertoEmOutroDia ? dataCurta(aberto.aberto_em) : hora(aberto.aberto_em)}</span>
              </div>
              <div className="g-cx-dois">
                <div>
                  <p className="g-cx-leg">Dinheiro na gaveta</p>
                  <p className="g-cx-gaveta">{brl(resumo.esperado)}</p>
                </div>
                <div>
                  <p className="g-cx-leg">Recebido hoje</p>
                  <p className="g-cx-gaveta">{brl(entrouNoDia)}</p>
                </div>
              </div>
              <p className="g-cx-leg">
                Na gaveta: o troco de {brl(aberto.valor_inicial)} mais o que entrou e saiu em dinheiro. Recebido hoje: tudo o que entrou hoje, em dinheiro, Pix ou cartão.
              </p>
              <details className="g-cx-detalhes">
                <summary>Ver detalhes</summary>
                <div>
                  <p className="g-cx-leg">Aberto às {hora(aberto.aberto_em)} com {brl(aberto.valor_inicial)} de troco.</p>
                  <div className="gf-formas">
                    {resumo.porForma.filter((f) => f.id !== "outro" || f.entrou > 0).map((f) => (
                      <div key={f.id}>
                        <span className="g-cx-leg">{f.rotulo}</span>
                        <b>{brl(f.entrou)}</b>
                      </div>
                    ))}
                  </div>
                  <p className="g-cx-leg">
                    Entrou {brl(resumo.entrou)} neste caixa{fin ? (resumo.saiu > 0 ? ` e saiu ${brl(resumo.saiu)}` : "") : saiuEmDinheiro > 0 ? ` e ${brl(saiuEmDinheiro)} saíram em dinheiro` : ""}.
                    {resumo.suprimentos > 0 && ` Colocado na gaveta: ${brl(resumo.suprimentos)}.`}
                    {resumo.sangrias > 0 && ` Tirado da gaveta: ${brl(resumo.sangrias)}.`}
                  </p>
                </div>
              </details>
              <div className="gf-dupla">
                <button className="g-btn pri" onClick={() => void abrir({ tipo: "novo", de: "entrada" })}><ArrowDownLeft />Entrada</button>
                <button className="g-btn g-cx-claro" onClick={() => void abrir({ tipo: "novo", de: "saida" })}><ArrowUpRight />Saída</button>
                <button className="g-btn g-cx-claro g-vd-inteiro" onClick={() => void abrir({ tipo: "venda" })}><ShoppingBag />Venda no balcão</button>
              </div>
              <div className="g-cx-gaveta-bts" role="group" aria-label="Dinheiro da gaveta">
                <button className="g-btn g-cx-claro" onClick={() => void abrir({ tipo: "gaveta", de: "sangria" })}><ArrowUpFromLine />Tirar dinheiro da gaveta</button>
                <button className="g-btn g-cx-claro" onClick={() => void abrir({ tipo: "gaveta", de: "suprimento" })}><ArrowDownToLine />Colocar dinheiro na gaveta</button>
              </div>
            </section>
          ) : (
            <section className="g-cx-heroi fechado" aria-label="Caixa fechado">
              <span className="g-rotulo">Caixa fechado</span>
              <div className="quem">
                <Tile icone={Lock} tom="menta" tamanho="g" />
                <div style={{ minWidth: 0 }}>
                  <h2>O caixa está fechado</h2>
                  <p>Abra o caixa para começar o dia. Você conta o troco da gaveta e o resto a gente soma.</p>
                </div>
              </div>
              <div><button className="g-btn pri" onClick={() => void abrir({ tipo: "abrir" })}><Wallet />Abrir o caixa</button></div>
            </section>
          )}

          {aberto && resumo ? null : ultimo ? (
            <section className="g-card">
              <div className="g-card-t">
                <h3><Tile icone={History} tom="manteiga" tamanho="p" />Último fechamento</h3>
                <span className="g-muted g-pp">{dataAmigavel(ultimo.fechado_em!)}, {hora(ultimo.fechado_em!)}</span>
              </div>
              <ResumoCaixa caixa={ultimo} lancamentos={doCaixa(ultimo.id)} soGaveta={!fin} />
            </section>
          ) : null}
          {/* sempre no mesmo lugar da tela: abrir o caixa no meio de um recebimento não fecha a folha que está aberta */}
          <AtendimentosParaCobrar aoMudar={() => void recarregar()} />
          <ContasDeClientes aoMudar={recarregar} largo={!aberto && Boolean(ultimo)} />
        </div>

        {aberto && resumo ? (
          <details className="g-cx-mais">
            <summary>Ver detalhes do caixa</summary>
            <div>
              <div className="g-grade kpis">
                <>
              <Kpi icone={ArrowDownLeft} tom="menta" rotulo="Entrou neste caixa" valor={<span className="gf-kpi-v">{brl(resumo.entrou)}</span>}
                apoio={entradasDoCaixa ? (entradasDoCaixa === 1 ? "1 entrada" : `${entradasDoCaixa} entradas`) : "nada ainda"} />
              {fin ? (
                <>
                  <Kpi icone={ArrowUpRight} tom="rosa" rotulo="Saiu deste caixa" valor={<span className="gf-kpi-v">{brl(resumo.saiu)}</span>}
                    apoio={saidasDoCaixa ? (saidasDoCaixa === 1 ? "1 saída" : `${saidasDoCaixa} saídas`) : "nada ainda"} />
                  <Kpi icone={Scale} tom="ceu" rotulo="Saldo deste caixa" valor={<span className={`gf-kpi-v${saldo < 0 ? " g-vermelho-t" : ""}`}>{brl(saldo)}</span>} apoio="entradas menos saídas" />
                </>
              ) : (
                <>
                  <Kpi icone={ArrowUpRight} tom="rosa" rotulo="Saiu em dinheiro" valor={<span className="gf-kpi-v">{brl(saiuEmDinheiro)}</span>} apoio="pago com o dinheiro da gaveta" />
                  <Kpi icone={Scale} tom="ceu" rotulo="Dinheiro na gaveta" valor={<span className="gf-kpi-v">{brl(resumo.esperado)}</span>} apoio="pelas contas, agora" />
                </>
              )}
              <Kpi icone={Coins} tom="manteiga" rotulo="Entrou hoje, no dia" valor={<span className="gf-kpi-v">{brl(entrouNoDia)}</span>}
                apoio={entrouFora > 0 ? `${brl(entrouFora)} fora do caixa` : emOutrosCaixas > 0 ? `${brl(emOutrosCaixas)} em caixa já fechado` : abertoEmOutroDia ? "só o que é de hoje" : "tudo neste caixa"} />
            </>
              </div>
              <section className="g-card">
              <div className="g-card-t"><h3><Tile icone={CreditCard} tom="ceu" tamanho="p" />Como entrou</h3><span className="g-muted g-pp">neste caixa</span></div>
              {resumo.entrou > 0 ? (
                <div className="g-cx-rosca">
                  <Rosca fatias={resumo.porForma.map((f) => ({ valor: f.entrou, cor: COR_FORMA[f.id] }))} tamanho={124}>
                    {entradasDoCaixa}<small>{entradasDoCaixa === 1 ? "entrada" : "entradas"}</small>
                  </Rosca>
                  <div className="g-legenda">
                    {resumo.porForma.filter((f) => f.entrou > 0).map((f, i, usadas) => (
                      <div key={f.id}><i style={{ background: COR_FORMA[f.id] }} /><span>{f.rotulo} <span className="g-muted g-pp">{percentuaisQueFecham(usadas.map((x) => x.entrou))[i]}%</span></span><b>{brl(f.entrou)}</b></div>
                    ))}
                  </div>
                </div>
              ) : <p className="g-muted g-p">Nada entrou neste caixa ainda. Quando alguém pagar, a divisão por forma de pagamento aparece aqui.</p>}
            </section>
            </div>
          </details>
        ) : (
          <>
            <div className="g-grade kpis">
              <>
              <Kpi icone={ArrowDownLeft} tom="menta" rotulo="Entrou hoje, no dia" valor={<span className="gf-kpi-v">{brl(entrouNoDia)}</span>}
                apoio={emOutrosCaixas > 0 ? `${brl(entrouFora)} fora do caixa` : entrouNoDia > 0 ? "tudo fora do caixa" : "sem caixa aberto"} />
              {fin && <Kpi icone={ArrowUpRight} tom="rosa" rotulo="Saiu hoje, no dia" valor={<span className="gf-kpi-v">{brl(saiuNoDia)}</span>} apoio={saiuNoDia > 0 && saiuFora < saiuNoDia ? `${brl(saiuFora)} fora do caixa` : "sem caixa aberto"} />}
              {ultimo && resumoUltimo && (
                <>
                  {fin && <Kpi icone={Wallet} tom="ceu" rotulo="Último caixa" valor={<span className="gf-kpi-v">{brl(resumoUltimo.entrou)}</span>} apoio={`entrou · ${dataCurta(ultimo.fechado_em!)}`} />}
                  <Kpi icone={Coins} tom="manteiga" rotulo="Gaveta contada" valor={<span className="gf-kpi-v">{ultimo.valor_contado == null ? "—" : brl(ultimo.valor_contado)}</span>}
                    apoio={diferenca(ultimo.valor_contado, esperadoDo(ultimo, doCaixa(ultimo.id)))?.curto ?? "no último fechamento"} />
                </>
              )}
            </>
            </div>
          </>
        )}

        <div className="g-duas">
          <div className="g-pilha g-cx-col">
            <section className="g-card">
              <div className="g-card-t">
                <h3>{aberto ? "Lançamentos deste caixa" : "Lançado hoje fora do caixa"}</h3>
                {lancamentos.length > 0 && <span className="g-tag g-tab">{lancamentos.length}</span>}
              </div>
              {!aberto && lancamentos.length > 0 && (
                <p className="g-muted g-pp" style={{ marginBottom: 6 }}>
                  Recebido com o caixa fechado: {brl(entrouFora)}{fin && saiuFora > 0 ? `, pago ${brl(saiuFora)}` : ""}. Conta no financeiro e na tela Hoje, mas não entra na conferência da gaveta.
                </p>
              )}
              {lancamentos.length ? (
                <div className="g-lista">
                  {lancamentos.map((l) => <LinhaLancamento key={l.id} l={l} aoTocar={() => editar(l)} />)}
                </div>
              ) : (
                <Vazio titulo="Nada lançado hoje ainda." texto={aberto ? "Quando alguém pagar, toque em Entrada." : "O que entrar e sair hoje aparece aqui."} />
              )}
            </section>

            {aberto && soltos.length > 0 && (
              <section className="g-card g-cx-fora-card">
                <div className="g-card-t">
                  <h3>Recebido hoje fora do caixa</h3>
                  <b className="g-tab">{brl(entrouFora)}</b>
                </div>
                <p className="g-muted g-pp" style={{ marginBottom: 6 }}>
                  Lançado hoje antes de abrir este caixa (ou com o caixa fechado){fin && saiuFora > 0 ? `; também saiu ${brl(saiuFora)}` : ""}. Conta no dia e na tela Hoje, mas não entra na conferência da gaveta.
                  {dinheiroFora !== 0 && ` Em dinheiro: ${brl(dinheiroFora)}.`}
                </p>
                <div className="g-lista">
                  {soltos.map((l) => <LinhaLancamento key={l.id} l={l} aoTocar={() => editar(l)} />)}
                </div>
              </section>
            )}

            <Apagados linhas={apagados} titulo={aberto ? "Apagados deste caixa" : "Apagados hoje"} />
          </div>

          <div className="g-pilha">
            {ultimosCaixas.length >= 2 && (
              <section className="g-card">
                <div className="g-card-t"><h3><Tile icone={ChartColumn} tom="menta" tamanho="p" />Entradas por caixa</h3><span className="g-muted g-pp">{ultimosCaixas.length} últimos fechados</span></div>
                <Barras itens={ultimosCaixas} formato={brlMini} altura={148} />
              </section>
            )}
            <section className="g-card">
              <div className="g-card-t"><h3><Tile icone={Lock} tom="manteiga" tamanho="p" />Caixas fechados</h3></div>
              {fechados.length ? (
                <div className="g-lista">
                  {fechados.map((c) => {
                    const r = resumoDoCaixa(c.valor_inicial, doCaixa(c.id));
                    const dif = diferenca(c.valor_contado, esperadoDo(c, doCaixa(c.id)));
                    const selo: { icone: typeof Check; tom: Tom } = !dif ? { icone: Lock, tom: "manteiga" }
                      : dif.tom === "certo" ? { icone: Check, tom: "menta" } : dif.tom === "sobra" ? { icone: Plus, tom: "ceu" } : { icone: Minus, tom: "rosa" };
                    return (
                      <button key={c.id} className="g-linha" onClick={() => setFolha({ tipo: "resumo", caixaId: c.id })}>
                        <Tile icone={selo.icone} tom={selo.tom} />
                        <span className="t">
                          <b>{dataLonga(c.fechado_em!)}</b>
                          <span>{horas(c)}{fin ? ` · entrou ${brl(r.entrou)}` : ""}</span>
                        </span>
                        {dif && <span className={`g-tag ${dif.etiqueta}`}>{dif.curto}</span>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="g-muted g-p">Os caixas que você fechar ficam guardados aqui.</p>
              )}
            </section>
          </div>
        </div>
      </div>

      {folha?.tipo === "abrir" && <FolhaAbrir aoFechar={() => setFolha(null)} aoSalvo={recarregar} />}
      {folha?.tipo === "novo" && <FolhaLancamento modo="pago" tipo={folha.de} aoFechar={() => setFolha(null)} aoSalvo={recarregar} />}
      {folha?.tipo === "editar" && (
        <FolhaLancamento modo="pago" tipo={folha.lancamento.tipo as Tipo} inicial={folha.lancamento} aoFechar={() => setFolha(null)} aoSalvo={recarregar} />
      )}
      {folha?.tipo === "gaveta" && aberto && resumo && (
        <FolhaGaveta tipo={folha.de} inicial={folha.lancamento} naGaveta={resumo.esperado} aoFechar={() => setFolha(null)} aoSalvo={recarregar} />
      )}
      {folha?.tipo === "venda" && <VendaBalcao aoFechar={() => setFolha(null)} aoPronto={() => void recarregar()} />}
      {folha?.tipo === "fechar" && aberto && (
        <FolhaFechar caixa={aberto} lancamentos={lancamentos} dinheiroFora={dinheiroFora} aoFechar={() => setFolha(null)} aoMudou={recarregar}
          aoSalvo={async () => { await recarregar(); setFolha({ tipo: "resumo", caixaId: aberto.id }); }} />
      )}
      {caixaDoResumo && (
        <Folha titulo={`Caixa de ${dataCurta(caixaDoResumo.aberto_em)}`} aoFechar={() => setFolha(null)}
          rodape={<>
            {fin && <button className="g-btn sec" onClick={() => exportarCaixa(caixaDoResumo, doCaixa(caixaDoResumo.id))}><Download />Exportar</button>}
            <button className="g-btn sec" onClick={() => setFolha(null)}>Fechar</button>
          </>}>
          <div className="g-pilha">
            <p className="g-muted g-p">
              Aberto {dataAmigavel(caixaDoResumo.aberto_em)} às {hora(caixaDoResumo.aberto_em)}, fechado {dataAmigavel(caixaDoResumo.fechado_em!)} às {hora(caixaDoResumo.fechado_em!)}.
            </p>
            <ResumoCaixa caixa={caixaDoResumo} lancamentos={doCaixa(caixaDoResumo.id)} soGaveta={!fin} />
            {!fin && <p className="g-muted g-pp">Os lançamentos de um caixa fechado aparecem para o dono e para quem cuida do financeiro.</p>}
            {fin && doCaixa(caixaDoResumo.id).length > 0 && (
              <section>
                <p className="g-rotulo" style={{ marginBottom: 4 }}>Lançamentos deste caixa</p>
                <div className="g-lista">
                  {doCaixa(caixaDoResumo.id).map((l) => <LinhaLancamento key={l.id} l={l} />)}
                </div>
                <p className="g-muted g-pp" style={{ marginTop: 8 }}>
                  <Lock size={13} aria-hidden style={{ verticalAlign: "-2px", marginRight: 4 }} />
                  Caixa fechado: os lançamentos dele não podem mais ser excluídos nem ter valor, forma ou dia alterados. Se precisar corrigir, lance um ajuste (uma entrada ou uma saída) no caixa de hoje.
                </p>
              </section>
            )}
          </div>
        </Folha>
      )}
    </>
  );
}

/** Uma linha de lançamento. Sem `aoTocar` (caixa já fechado), é só leitura. Sangria e suprimento têm rótulo e cor próprios. */
function LinhaLancamento({ l, aoTocar }: { l: Lancamento; aoTocar?: () => void }) {
  const entrada = l.tipo === "entrada";
  const gaveta = Boolean(l.movimento);
  const forma = textoDoPagamento(l);
  const apoio = gaveta
    ? `${hora(l.criado_em)} · ${l.descricao || "não é venda nem despesa"}`
    : `${hora(l.criado_em)}${l.descricao && !ehDeServico(l) ? ` · ${categoriaAtual(l.categoria)}` : ""}${resumoDeItens(l) ? ` · ${resumoDeItens(l)}` : ""}`;
  const dentro = (
    <>
      <Tile icone={gaveta ? (entrada ? ArrowDownToLine : ArrowUpFromLine) : entrada ? ArrowDownLeft : ArrowUpRight} tom={gaveta ? "manteiga" : entrada ? "menta" : "rosa"} />
      <span className="t">
        <b>{gaveta ? nomeDoMovimento(l.movimento) : l.descricao || categoriaAtual(l.categoria)} <TagAlterado lancamento={l} /></b>
        <span>{apoio}{!gaveta && <i className="g-cx-so-cel"> · {forma}</i>}</span>
      </span>
      {gaveta ? <span className="g-tag amarelo g-cx-so-largo">Gaveta</span> : <span className="g-tag g-cx-so-largo">{forma}</span>}
      <span className={`d ${gaveta ? "" : entrada ? "g-verde-t" : "g-vermelho-t"}`}><b>{entrada ? "+" : "−"} {brl(l.valor)}</b></span>
    </>
  );
  return aoTocar ? <button className="g-linha" onClick={aoTocar}>{dentro}</button> : <div className="g-linha">{dentro}</div>;
}

/** Tirar dinheiro da gaveta (sangria) ou colocar (suprimento). Só mexe na conferência da gaveta: não é venda nem despesa. */
function FolhaGaveta({ tipo, inicial, naGaveta, aoFechar, aoSalvo }: {
  tipo: Gaveta; inicial?: Lancamento; naGaveta: number; aoFechar: () => void; aoSalvo: () => Promise<void>;
}) {
  const { sb, petshop } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const tirar = tipo === "sangria";
  const [valor, setValor] = useState<number | null>(inicial ? Number(inicial.valor) : null);
  const [motivo, setMotivo] = useState(inicial?.descricao ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [erroMotivo, setErroMotivo] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // o que tem na gaveta sem este movimento (na edição, desfaz o valor antigo) e o que fica depois dele
  const base = Math.round((inicial ? naGaveta + (tirar ? Number(inicial.valor) : -Number(inicial.valor)) : naGaveta) * 100) / 100;
  const depois = Math.round((base + (tirar ? -(valor ?? 0) : valor ?? 0)) * 100) / 100;

  const op = useOperacao();
  const salvar = () => op.fazer(gravar);
  async function gravar(chave: string): Promise<boolean | void> {
    if (salvando) return;
    if (!valor || valor <= 0) { setErro("Escreva o valor."); return; }
    if (valor >= 1e8) { setErro("Esse valor é grande demais. Confira os números."); return; }
    const texto = motivo.trim();
    if (tirar && !texto) { setErroMotivo("Escreva para onde foi o dinheiro."); return; }
    if ((!inicial || Number(inicial.valor) !== valor) && !(await conferirValorAlto(valor, confirmar))) return;
    if (tirar && depois < 0 && !(await confirmar({
      titulo: "Passa do que tem na gaveta", texto: `Pelas contas, a gaveta tem ${brl(base)} e você está tirando ${brl(valor)}. Anotar mesmo assim?`, confirmar: "Anotar mesmo assim",
    }))) return;
    setSalvando(true);
    try {
      if (inicial) {
        const r = await sb.from("lancamentos").update({ valor, descricao: texto || null }).eq("id", inicial.id).eq("petshop_id", petshop.id).select("id");
        if (r.error) throw new Error(r.error.message);
        if (!r.data?.length) throw new Error("Não deu para salvar. Este movimento pode ter sido apagado, ou só o dono e quem cuida do financeiro podem alterar.");
        avisar("Alteração salva.");
      } else {
        await lancarPago(sb, petshop.id, {
          tipo: tirar ? "saida" : "entrada", valor, forma: "dinheiro", categoria: CATEGORIA_GAVETA, descricao: texto || (tirar ? null : "Troco"),
          movimento: tipo, exigeCaixa: true, chave,
        });
        avisar(tirar ? `Anotado: ${brl(valor)} saiu da gaveta.` : `Anotado: ${brl(valor)} entrou na gaveta.`);
      }
      await aoSalvo();
      avisarMudanca();
      aoFechar();
    } catch (e) {
      avisarErro(e);
      await aoSalvo();
      setSalvando(false);
      return false;
    }
  }

  async function excluir() {
    if (!inicial || salvando) return;
    if (!(await confirmar({ titulo: "Excluir este movimento da gaveta?", texto: `${nomeDoMovimento(inicial.movimento)} · ${brl(inicial.valor)}. A conta da gaveta volta a ser como era antes. Não dá para desfazer.`, confirmar: "Excluir", perigo: true }))) return;
    setSalvando(true);
    try {
      await desfazerVenda(sb, petshop.id, inicial);
      avisar("Movimento excluído.");
      await aoSalvo();
      avisarMudanca();
      aoFechar();
    } catch (e) {
      avisarErro(e);
      await aoSalvo();
      setSalvando(false);
    }
  }

  return (
    <Folha titulo={tirar ? "Tirar dinheiro da gaveta" : "Colocar dinheiro na gaveta"} aoFechar={aoFechar}
      rodape={<>
        {inicial ? <button type="button" className="g-btn perigo" onClick={() => void excluir()} disabled={salvando}>Excluir</button>
          : <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>}
        <button type="button" className="g-btn pri" onClick={() => void salvar()} disabled={salvando}>{salvando ? "Anotando…" : inicial ? "Salvar" : tirar ? "Anotar retirada" : "Anotar"}</button>
      </>}>
      <form className="g-form" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
        <p className="g-muted g-p">
          {tirar
            ? "Use quando você tira dinheiro da gaveta sem ser uma despesa do pet shop: levou ao banco, guardou no cofre, o dono retirou. O nome disso é sangria."
            : "Use quando você coloca dinheiro na gaveta sem ser uma venda: mais troco, por exemplo. O nome disso é suprimento."}
          {" "}Não conta como {tirar ? "despesa" : "venda"}: só entra na conferência da gaveta.
        </p>
        <Campo rotulo="Valor em dinheiro" erro={erro}>
          <CampoDinheiro valor={valor} aoMudar={(v) => { setValor(v); setErro(null); }} autoFocus={!inicial} maximo={99999999} />
        </Campo>
        <Campo rotulo={tirar ? "Para onde foi" : "De onde veio (se quiser)"} erro={erroMotivo}>
          <input className="g-input" value={motivo} maxLength={120} onChange={(e) => { setMotivo(e.target.value); setErroMotivo(null); }}
            placeholder={tirar ? "Ex.: levei ao banco" : "Ex.: troco para o fim de semana"} />
        </Campo>
        <div className="g-card areia">
          <LinhaResumo nome={inicial ? "Na gaveta, sem contar este movimento" : "Na gaveta agora, pelas contas"} valor={brl(base)} />
          <LinhaResumo nome={tirar ? "Depois de tirar" : "Depois de colocar"} valor={brl(depois)} forte tom={depois < 0 ? "vermelho" : undefined} />
        </div>
        {tirar && <p className="g-muted g-pp">Se o dinheiro saiu para pagar uma conta do pet shop (um fornecedor, o motoboy), use o botão Saída: aí conta como despesa.</p>}
        <button type="submit" hidden />
      </form>
    </Folha>
  );
}

/** Contas de um caixa: troco, o que entrou e saiu por forma, o esperado e (se fechado) o contado. */
/**
 * `soGaveta`: para quem só opera o caixa. Num caixa aberto mostra as entradas e só as saídas em dinheiro (as que mexem na gaveta);
 * num caixa fechado, só a conferência da gaveta (o esperado é o que o banco anotou ao fechar).
 * `esperado`: o dinheiro esperado que o banco acabou de informar (vale mais que a conta da tela).
 */
function ResumoCaixa({ caixa, lancamentos, soGaveta, esperado: informado }: { caixa: Caixa; lancamentos: Lancamento[]; soGaveta?: boolean; esperado?: number | null }) {
  const r = resumoDoCaixa(caixa.valor_inicial, lancamentos);
  const esperado = informado ?? esperadoDo(caixa, lancamentos);
  const dif = diferenca(caixa.valor_contado, esperado);
  const entradas = r.porForma.filter((f) => f.entrou > 0);
  const saidas = r.porForma.filter((f) => f.saiu > 0);
  const saiuEmDinheiro = r.porForma.find((f) => f.id === "dinheiro")?.saiu ?? 0;
  const comMovimentos = !(soGaveta && caixa.fechado_em);
  return (
    <div className="g-pilha p">
      <div className="gf-pares">
        <LinhaResumo nome="Troco inicial" valor={brl(caixa.valor_inicial)} />
        {comMovimentos && <LinhaResumo nome="Entradas" valor={brl(r.entrou)} forte tom="verde" />}
        {comMovimentos && entradas.map((f) => <LinhaResumo key={f.id} nome={`· ${f.rotulo}`} valor={brl(f.entrou)} />)}
        {comMovimentos && !soGaveta && <LinhaResumo nome="Saídas" valor={brl(r.saiu)} forte tom="vermelho" />}
        {comMovimentos && !soGaveta && saidas.map((f) => <LinhaResumo key={f.id} nome={`· ${f.rotulo}`} valor={brl(f.saiu)} />)}
        {comMovimentos && soGaveta && <LinhaResumo nome="Saídas em dinheiro" valor={brl(saiuEmDinheiro)} forte tom="vermelho" />}
        {comMovimentos && r.suprimentos > 0 && <LinhaResumo nome="Colocado na gaveta (suprimento)" valor={`+ ${brl(r.suprimentos)}`} />}
        {comMovimentos && r.sangrias > 0 && <LinhaResumo nome="Tirado da gaveta (sangria)" valor={`− ${brl(r.sangrias)}`} />}
        <LinhaResumo nome="Dinheiro esperado na gaveta" valor={brl(esperado)} forte />
        {caixa.valor_contado != null && <LinhaResumo nome="Dinheiro contado" valor={brl(caixa.valor_contado)} forte />}
      </div>
      {dif && <p className={`gf-dif ${dif.tom}`}>{dif.texto}</p>}
      {caixa.obs && <p className="g-muted g-p">Observação: {caixa.obs}</p>}
    </div>
  );
}

function FolhaAbrir({ aoFechar, aoSalvo }: { aoFechar: () => void; aoSalvo: () => Promise<void> }) {
  const { sb, petshop, user } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const [valor, setValor] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // o troco já vem com o que foi contado no último fechamento; a pessoa confere e muda se precisar
  const [mexeu, setMexeu] = useState(false);
  const { dados: ultimo } = useDados(async () => ultimoContado(sb, petshop.id), [petshop.id]);
  const sugerido = !mexeu && ultimo != null && ultimo > 0 ? ultimo : null;
  const troco = mexeu ? valor : sugerido ?? valor;

  async function salvar() {
    if (salvando) return;
    const valor = troco;
    // nada de trocar em silêncio: troco negativo ou absurdo volta para a pessoa conferir
    if (valor != null && valor < 0) { setErro("O troco não pode ser negativo. Se a gaveta está vazia, deixe em branco."); return; }
    if (valor != null && valor >= 1e8) { setErro("Esse valor é grande demais. Confira os números."); return; }
    if (!(await conferirValorAlto(valor, confirmar))) return;
    setSalvando(true);
    try {
      const r = await sb.from("caixas").insert({ petshop_id: petshop.id, valor_inicial: valor ?? 0, aberto_por: user.id });
      if (r.error) throw new Error(r.error.message);
      avisar("Caixa aberto. Bom trabalho!");
      await aoSalvo();
      avisarMudanca();
      aoFechar();
    } catch (e) {
      avisarErro(e);
      await aoSalvo();
      setSalvando(false);
    }
  }

  return (
    <Folha titulo="Abrir o caixa" aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Abrindo…" : "Abrir o caixa"}</button>
      </>}>
      <form className="g-form" onSubmit={(e) => { e.preventDefault(); void salvar(); }}>
        <Campo rotulo="Troco inicial em dinheiro" erro={erro}
          dica={sugerido != null ? `Já veio com ${brl(sugerido)}, o que foi contado no último fechamento. Confira a gaveta e mude se for diferente.` : "Quanto tem de dinheiro na gaveta agora. Se não tem nada, deixe em branco."}>
          <CampoDinheiro valor={troco} aoMudar={(v) => { setMexeu(true); setValor(v); setErro(null); }} autoFocus maximo={99999999} />
        </Campo>
        <button type="submit" hidden />
      </form>
    </Folha>
  );
}

function FolhaFechar({ caixa, lancamentos, dinheiroFora, aoFechar, aoSalvo, aoMudou }: {
  caixa: Caixa; lancamentos: Lancamento[]; dinheiroFora: number; aoFechar: () => void; aoSalvo: () => Promise<void>;
  /** Alguém lançou neste caixa enquanto a pessoa contava: a tela de trás busca de novo. */
  aoMudou: () => Promise<void>;
}) {
  const { sb, cuidoDoFinanceiro } = useGestao();
  const { avisar, avisarErro, confirmar } = useAvisos();
  const [contado, setContado] = useState<number | null>(null);
  const [obs, setObs] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // o que o banco respondeu quando a conta mudou durante a contagem
  const [mudou, setMudou] = useState<{ texto: string; esperado: number } | null>(null);
  const r = resumoDoCaixa(caixa.valor_inicial, lancamentos);
  const esperado = mudou?.esperado ?? r.esperado;
  const dif = diferenca(contado, esperado);

  async function salvar() {
    if (salvando) return;
    if (contado == null || contado < 0) { setErro("Conte o dinheiro da gaveta e escreva aqui. Se está vazia, escreva 0."); return; }
    if (contado >= 1e8) { setErro("Esse valor é grande demais. Confira os números."); return; }
    // fechar não tem volta: confirma mostrando se bateu, sobrou ou faltou
    const sim = await confirmar({
      titulo: "Fechar o caixa de hoje?",
      texto: `Você contou ${brl(contado)} e o sistema esperava ${brl(esperado)}. ${dif?.curto ? `Resultado: ${dif.curto}. ` : ""}Depois de fechado, os lançamentos deste caixa não podem mais ser alterados.`,
      confirmar: "Fechar o caixa",
    });
    if (!sim) return;
    setSalvando(true);
    try {
      // o banco refaz a conta na hora de fechar: se o esperado não é mais o que a pessoa viu, não fecha e devolve o de agora
      const u = await sb.rpc("fechar_caixa", { p_caixa: caixa.id, p_contado: contado, p_obs: obs.trim(), p_esperado: esperado });
      if (u.error) throw new Error(u.error.message);
      const resposta = (u.data ?? {}) as { fechado?: boolean; motivo?: string; esperado?: number };
      if (!resposta.fechado) {
        if (resposta.motivo !== "mudou") throw new Error("Este caixa já tinha sido fechado.");
        const agora = Number(resposta.esperado), d = Math.round((agora - esperado) * 100) / 100;
        setMudou({
          esperado: agora,
          texto: `${d > 0 ? `Entrou mais ${brl(d)}` : `Saiu ${brl(-d)}`} enquanto você contava. O esperado agora é ${brl(agora)}.`,
        });
        await aoMudou();
        setSalvando(false);
        return;
      }
      avisar("Caixa fechado.");
      avisarMudanca();
      await aoSalvo();
    } catch (e) {
      avisarErro(e);
      setSalvando(false);
    }
  }

  return (
    <Folha titulo="Fechar o caixa" aoFechar={aoFechar}
      rodape={<>
        <button type="button" className="g-btn sec" onClick={aoFechar}>Voltar</button>
        <button type="button" className="g-btn pri" onClick={salvar} disabled={salvando}>{salvando ? "Fechando…" : "Fechar o caixa"}</button>
      </>}>
      <div className="g-form">
        {mudou && (
          <p className="g-aviso vermelho" style={{ margin: 0 }} role="alert">
            <span><b>{mudou.texto}</b> Confira a contagem e toque em Fechar o caixa de novo.</span>
          </p>
        )}
        <div className="g-card areia">
          <ResumoCaixa caixa={caixa} lancamentos={lancamentos} soGaveta={!cuidoDoFinanceiro} esperado={mudou?.esperado} />
        </div>
        {dinheiroFora > 0 && (
          <p className="g-aviso" style={{ margin: 0 }} role="status">
            <span>Hoje também {dinheiroFora === 1 ? "entrou" : "entraram"} <b>{brl(dinheiroFora)} em dinheiro fora do caixa</b> (recebido com o caixa fechado). Esse valor não está na conta acima: se ele foi para a gaveta, vai aparecer como sobra.</span>
          </p>
        )}
        <Campo rotulo="Quanto tem na gaveta" erro={erro} dica="Conte só o dinheiro. Pix e cartão não entram nesta conta.">
          <CampoDinheiro valor={contado} aoMudar={(v) => { setContado(v); setErro(null); }} autoFocus maximo={99999999} />
        </Campo>
        {dif && <p className={`gf-dif ${dif.tom}`} role="status">{dif.texto}</p>}
        <Campo rotulo="Observação (se quiser)">
          <textarea className="g-textarea" value={obs} maxLength={500} onChange={(e) => setObs(e.target.value)}
            placeholder="Ex.: faltou troco" />
        </Campo>
      </div>
    </Folha>
  );
}
