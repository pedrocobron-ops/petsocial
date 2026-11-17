"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarDays, CircleCheck, Package, PiggyBank, Receipt, Repeat, Scissors, TrendingUp, UserPlus, UserX } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { Esqueleto, useDados, Vazio } from "@/components/gestao/ui";
import { brlMini, Chips, ErroDeCarga, SemAcesso } from "@/components/gestao/financeiro/comum";
import { Barras, Kpi, Ranking, Tile } from "@/components/gestao/painel";
import AbasDeRelatorios from "@/components/gestao/relatorios/abas";
import {
  carregarIndicadores, comparacao, DIAS_SEMANA_CURTOS, intervaloAnterior, intervaloIndicadores, pct1, PERIODOS_INDICADORES, rotuloMes, temDados, totaisIndicadores,
  type IndicadoresDoBanco, type PeriodoIndicadores,
} from "@/lib/gestao/indicadores";
import { brl, dataCompleta } from "@/lib/gestao/util";
import "@/components/gestao/relatorios/indicadores.css";

export default function PaginaIndicadores() {
  const { cuidoDoFinanceiro } = useGestao();
  return cuidoDoFinanceiro ? <Indicadores /> : <SemAcesso />;
}

const n = (v: number, um: string, varios: string) => `${v.toLocaleString("pt-BR")} ${v === 1 ? um : varios}`;

/**
 * Indicadores (Relatórios): gráficos simples por mês, de `indicadores_do_periodo` (uma ida ao banco por período, mais uma para
 * o período anterior, que dá as comparações). Os números são os de Relatórios e de Quanto sobrou; nada é inventado.
 */
function Indicadores() {
  const { sb, petshop } = useGestao();
  const [periodo, setPeriodo] = useState<PeriodoIndicadores>("6");
  const hoje = useMemo(() => new Date(), []);
  const { de, ate } = intervaloIndicadores(periodo, hoje);
  const antes = intervaloAnterior(periodo, hoje);
  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const [atual, anterior] = await Promise.all([
      carregarIndicadores(sb, petshop.id, de, ate),
      carregarIndicadores(sb, petshop.id, antes.de, antes.ate).catch(() => null),
    ]);
    return { atual, anterior };
  }, [petshop.id, de, ate, antes.de, antes.ate]);

  return (
    <>
      <header className="g-topo">
        <div>
          <h1>Relatórios</h1>
          <p className="g-muted">Indicadores de {dataCompleta(de)} a {dataCompleta(ate)}</p>
        </div>
      </header>
      <div className="g-pilha">
        <AbasDeRelatorios atual="indicadores" />
        <div className="gf-rola">
          <Chips opcoes={PERIODOS_INDICADORES} valor={periodo} aoMudar={setPeriodo} rotulo="Período" />
        </div>
        {erro && <ErroDeCarga erro={erro} tentar={recarregar} />}
        {carregando || !dados ? (erro ? null : <Esqueleto linhas={5} />)
          : !temDados(dados.atual) ? <Vazio titulo="Ainda não tem dados neste período." texto="Quando houver atendimentos, estadias e pagamentos, os gráficos aparecem aqui." />
          : <Graficos d={dados.atual} antes={dados.anterior} periodoAnterior={`de ${dataCompleta(antes.de)} a ${dataCompleta(antes.ate)}`} />}
      </div>
    </>
  );
}

/** "+12% que o período anterior", com seta; nada quando não dá para comparar. */
function Comparar({ atual, anterior }: { atual: number | null; anterior: number | null }) {
  const c = comparacao(atual, anterior);
  if (!c) return <span className="g-ind-comp">sem movimento no período anterior</span>;
  const Seta = c.sobe ? ArrowUpRight : ArrowDownRight;
  return <span className={`g-ind-comp ${c.pct === 0 ? "" : c.sobe ? "sobe" : "desce"}`}>{c.pct !== 0 && <Seta aria-hidden />}{c.texto}</span>;
}

function Graficos({ d, antes, periodoAnterior }: { d: IndicadoresDoBanco; antes: IndicadoresDoBanco | null; periodoAnterior: string }) {
  const t = totaisIndicadores(d), ta = antes ? totaisIndicadores(antes) : null;
  const comAno = new Set(d.meses.map((m) => m.mes.slice(0, 4))).size > 1;
  const rot = (mes: string) => rotuloMes(mes, comAno);
  const visitas = t.atendimentos + t.estadias;
  const visitasAntes = ta ? ta.atendimentos + ta.estadias : null;
  const temEstadias = d.meses.some((m) => m.estadias_creche + m.estadias_hotel > 0);
  return (
    <>
      <div className="g-grade kpis">
        {d.dinheiro && t.faturamento != null && (
          <Kpi icone={TrendingUp} tom="menta" rotulo="Faturamento" valor={brl(t.faturamento)} apoio={<Comparar atual={t.faturamento} anterior={ta?.faturamento ?? null} />} />
        )}
        {d.dinheiro && (
          <Kpi icone={Receipt} tom="ceu" rotulo="Valor médio por conta" valor={t.valorMedio == null ? "–" : brl(t.valorMedio)}
            apoio={<span className="g-ind-apoio"><span>{n(t.contas, "conta paga", "contas pagas")}</span><Comparar atual={t.valorMedio} anterior={ta?.valorMedio ?? null} /></span>} />
        )}
        <Kpi icone={CircleCheck} tom="pessego" rotulo={temEstadias ? "Atendimentos e estadias" : "Atendimentos"} valor={visitas.toLocaleString("pt-BR")}
          apoio={<Comparar atual={visitas} anterior={visitasAntes} />} />
        <Kpi icone={Repeat} tom="lilas" rotulo="Voltaram em 60 dias" valor={pct1(t.retorno)}
          apoio={d.retorno_60.clientes ? `${d.retorno_60.voltaram} de ${n(d.retorno_60.clientes, "cliente atendido", "clientes atendidos")}` : "nenhum cliente atendido"} />
      </div>
      <p className="g-muted g-pp">Comparando com o período anterior, {periodoAnterior}.</p>

      <div className="g-duas meio">
        {d.dinheiro && (
          <section className="g-card" aria-label="Faturamento por mês">
            <div className="g-card-t"><h3><Tile icone={TrendingUp} tom="menta" tamanho="p" />Faturamento por mês</h3><span className="g-muted g-pp">já recebido</span></div>
            <Barras itens={d.meses.map((m) => ({ rotulo: rot(m.mes), valor: Math.max(0, m.faturamento ?? 0) }))} formato={brlMini} altura={170} destaque={d.meses.length - 1} />
            <TabelaMeses linhas={d.meses.map((m) => [rot(m.mes), brl(m.faturamento), m.valor_medio == null ? "–" : brl(m.valor_medio)])} cab={["Mês", "Faturamento", "Valor médio"]} />
          </section>
        )}
        <section className="g-card" aria-label="Atendimentos por mês">
          <div className="g-card-t"><h3><Tile icone={CalendarDays} tom="pessego" tamanho="p" />{temEstadias ? "Atendimentos e estadias por mês" : "Atendimentos por mês"}</h3></div>
          <Barras itens={d.meses.map((m) => ({ rotulo: rot(m.mes), valor: m.atendimentos + m.estadias_creche + m.estadias_hotel }))} altura={170} destaque={d.meses.length - 1} />
          <TabelaMeses cab={temEstadias ? ["Mês", "Atendimentos", "Creche", "Hotel"] : ["Mês", "Atendimentos"]}
            linhas={d.meses.map((m) => (temEstadias ? [rot(m.mes), String(m.atendimentos), String(m.estadias_creche), String(m.estadias_hotel)] : [rot(m.mes), String(m.atendimentos)]))} />
          <p className="g-muted g-pp">Atendimentos concluídos, pelo dia do horário. Estadias encerradas, pelo dia da saída.</p>
        </section>
      </div>

      <div className="g-duas meio">
        <section className="g-card" aria-label="Clientes de primeira vez e que voltaram">
          <div className="g-card-t"><h3><Tile icone={UserPlus} tom="lilas" tamanho="p" />Clientes: primeira vez e voltaram</h3></div>
          <div className="g-ind-leg"><span><i className="novo" />Primeira vez</span><span><i className="voltou" />Voltaram</span></div>
          <Empilhadas meses={d.meses.map((m) => ({ rotulo: rot(m.mes), a: m.primeira_vez, b: m.voltaram }))} />
          <p className="g-muted g-pp">
            No período: {n(d.clientes, "cliente atendido", "clientes atendidos")}, {d.primeira_vez} de primeira vez. Voltaram em 60 dias: {d.retorno_60.voltaram} de {d.retorno_60.clientes}
            {" "}(clientes que vieram de novo em até 60 dias depois de uma visita).
          </p>
        </section>
        <section className="g-card" aria-label="Faltas e cancelamentos">
          <div className="g-card-t"><h3><Tile icone={UserX} tom="rosa" tamanho="p" />Faltas e cancelamentos</h3></div>
          <div className="g-ind-dois">
            <div><small>Faltas</small><b>{pct1(t.pctFaltas)}</b><small>{n(t.faltas, "falta", "faltas")} de {t.atendimentos + t.faltas} que deviam vir</small><Comparar atual={t.pctFaltas} anterior={ta?.pctFaltas ?? null} /></div>
            <div><small>Cancelamentos</small><b>{pct1(t.pctCancelados)}</b><small>{n(t.cancelados, "cancelado", "cancelados")} de {n(t.marcados, "marcado", "marcados")}</small><Comparar atual={t.pctCancelados} anterior={ta?.pctCancelados ?? null} /></div>
          </div>
        </section>
      </div>

      <section className="g-card" aria-label="Dias e horários mais cheios">
        <div className="g-card-t"><h3><Tile icone={CalendarDays} tom="ceu" tamanho="p" />Dias e horários mais cheios</h3></div>
        <Mapa mapa={d.mapa} />
      </section>

      <div className="g-duas meio">
        <section className="g-card" aria-label="Serviços mais vendidos">
          <div className="g-card-t"><h3><Tile icone={Scissors} tom="pessego" tamanho="p" />Serviços mais vendidos</h3><span className="g-muted g-pp">vezes feitas</span></div>
          {d.servicos.length ? <>
            <Ranking itens={d.servicos.slice(0, 8).map((s) => ({ rotulo: s.nome, valor: s.vezes }))} />
            {d.dinheiro && d.servicos.some((s) => (s.receita ?? 0) > 0) && <p className="g-muted g-pp">Entrou: {d.servicos.slice(0, 8).filter((s) => (s.receita ?? 0) > 0).map((s) => `${s.nome} ${brl(s.receita)}`).join(" · ")}.</p>}
          </> : <p className="g-muted g-p">Nenhum atendimento concluído neste período.</p>}
        </section>
        <section className="g-card" aria-label="Produtos mais vendidos">
          <div className="g-card-t"><h3><Tile icone={Package} tom="manteiga" tamanho="p" />Produtos mais vendidos</h3><span className="g-muted g-pp">quantidade</span></div>
          {d.produtos.length ? <>
            <Ranking itens={d.produtos.slice(0, 8).map((p) => ({ rotulo: `${p.nome} (${p.unidade})`, valor: p.quantidade }))} formato={(v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 })} />
            {d.dinheiro && d.produtos.some((p) => (p.receita ?? 0) > 0) && <p className="g-muted g-pp">Entrou: {d.produtos.slice(0, 8).filter((p) => (p.receita ?? 0) > 0).map((p) => `${p.nome} ${brl(p.receita)}`).join(" · ")}.</p>}
          </> : <p className="g-muted g-p">Nenhum produto vendido neste período.</p>}
        </section>
      </div>

      {d.dinheiro && (
        <section className="g-card" aria-label="Quanto sobrou por mês">
          <div className="g-card-t"><h3><Tile icone={PiggyBank} tom="menta" tamanho="p" />Quanto sobrou por mês</h3></div>
          <p className="g-muted g-pp" style={{ marginTop: 0 }}>Entrou − saiu, como no Resultado do Financeiro.</p>
          <Sobras meses={d.meses.map((m) => ({ rotulo: rot(m.mes), valor: m.resultado ?? 0, taxas: m.taxas ?? 0, depois: m.resultado_depois_taxas ?? 0 }))} />
          {(t.taxas ?? 0) > 0 && <p className="g-muted g-pp">Taxas da maquininha no período: {brl(t.taxas)}. Depois delas, sobrou {brl(t.resultadoDepoisTaxas)}.</p>}
        </section>
      )}
    </>
  );
}

/** Os números do gráfico em tabela (abre e fecha), para ler sem depender das cores. */
function TabelaMeses({ cab, linhas }: { cab: string[]; linhas: string[][] }) {
  return (
    <details className="g-ind-tab">
      <summary>Ver os números</summary>
      <table>
        <thead><tr>{cab.map((c) => <th key={c} scope="col">{c}</th>)}</tr></thead>
        <tbody>{linhas.map((l) => <tr key={l[0]}>{l.map((x, i) => (i ? <td key={i}>{x}</td> : <th key={i} scope="row">{x}</th>))}</tr>)}</tbody>
      </table>
    </details>
  );
}

/** Barras empilhadas por mês: primeira vez (embaixo) e voltaram (em cima). */
function Empilhadas({ meses }: { meses: { rotulo: string; a: number; b: number }[] }) {
  const max = Math.max(1, ...meses.map((m) => m.a + m.b));
  return (
    <div className="g-ind-emp" role="img" aria-label={meses.map((m) => `${m.rotulo}: ${m.a} de primeira vez, ${m.b} voltaram`).join("; ")}>
      {meses.map((m) => (
        <div key={m.rotulo} title={`${m.rotulo}: ${m.a} de primeira vez, ${m.b} voltaram`}>
          <span className="v">{m.a + m.b || ""}</span>
          <span className="pilha" style={{ height: `${Math.max(m.a + m.b ? 6 : 2, ((m.a + m.b) / max) * 100)}%` }}>
            {m.b > 0 && <i className="voltou" style={{ flexGrow: m.b }} />}
            {m.a > 0 && <i className="novo" style={{ flexGrow: m.a }} />}
          </span>
          <span className="r">{m.rotulo}</span>
        </div>
      ))}
    </div>
  );
}

/** Mapa de calor: dia da semana × hora (uma cor, mais escura = mais cheio). */
function Mapa({ mapa }: { mapa: { d: number; h: number; n: number }[] }) {
  if (!mapa.length) return <p className="g-muted g-p">Nenhum horário marcado neste período.</p>;
  const horas = mapa.map((x) => x.h);
  const de = Math.min(...horas), ate = Math.max(...horas);
  const lista = Array.from({ length: ate - de + 1 }, (_, i) => de + i);
  const max = Math.max(...mapa.map((x) => x.n));
  const valor = (d: number, h: number) => mapa.find((x) => x.d === d && x.h === h)?.n ?? 0;
  const cheio = mapa.reduce((m, x) => (x.n > m.n ? x : m), mapa[0]);
  return (
    <>
      <div className="g-ind-mapa-rola">
        <table className="g-ind-mapa">
          <thead><tr><th aria-hidden />{lista.map((h) => <th key={h} scope="col">{h}h</th>)}</tr></thead>
          <tbody>
            {DIAS_SEMANA_CURTOS.map((nome, d) => (
              <tr key={nome}>
                <th scope="row">{nome}</th>
                {lista.map((h) => {
                  const v = valor(d, h);
                  const f = v ? 0.15 + 0.85 * (v / max) : 0;
                  return <td key={h} title={`${nome}, ${h}h: ${v === 1 ? "1 horário" : `${v} horários`}`} className={!v ? "zero" : f > 0.55 ? "forte" : undefined}
                    style={v ? { background: `rgba(47, 107, 76, ${f.toFixed(2)})` } : undefined}><span>{v || ""}</span></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="g-muted g-pp">Conta tudo o que foi marcado, menos os cancelados. Mais cheio: {DIAS_SEMANA_CURTOS[cheio.d]}, {cheio.h}h ({cheio.n === 1 ? "1 horário" : `${cheio.n} horários`} no período). Quanto mais escuro, mais cheio.</p>
    </>
  );
}

/** Quanto sobrou por mês: barra para a direita (sobrou) ou em vermelho (faltou), com o número escrito. */
function Sobras({ meses }: { meses: { rotulo: string; valor: number; taxas: number; depois: number }[] }) {
  const max = Math.max(1, ...meses.map((m) => Math.abs(m.valor)));
  return (
    <div className="g-ind-sobras">
      {meses.map((m) => (
        <div key={m.rotulo}>
          <span className="r">{m.rotulo}</span>
          <span className="g-ind-trilho"><i className={m.valor < 0 ? "neg" : undefined} style={{ width: `${(Math.abs(m.valor) / max) * 100}%` }} /></span>
          <b className={m.valor < 0 ? "g-vermelho-t" : undefined}>{brl(m.valor)}</b>
          {m.taxas > 0 && <small>depois das taxas: {brl(m.depois)}</small>}
        </div>
      ))}
    </div>
  );
}
