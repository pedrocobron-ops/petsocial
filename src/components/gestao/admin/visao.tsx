"use client";

import { useEffect, useMemo, useState } from "react";
import { Esqueleto, mensagemDeErro, ok } from "@/components/gestao/ui";
import CartaoPagantes from "@/components/gestao/admin/pagantes";
import { banco } from "@/lib/gestao/supabase";
import { PLANOS, PERIODOS, precoDe, type PeriodoId, type PlanoId } from "@/lib/gestao/planos";
import { brl, dataCurta, deIsoDia, isoDia, somaDias } from "@/lib/gestao/util";

/** O que `admin_visao_geral` devolve: só contagens, nada de clientes, pets ou valores dos pet shops. */
type Visao = {
  status: { total: number; teste: number; teste_vencido: number; ativa: number; atrasada: number; cancelada: number; cortesia: number };
  cadastros: { dia: string; n: number }[];
  turmas: { semana: string; cadastros: number; cortesia: number; testando: number; assinaram: number }[];
  planos: { plano: string; meses: number; status: "ativa" | "atrasada" | "cortesia"; n: number }[];
  cancelamentos: { mes: string; n: number }[];
  canceladas_sem_data: number;
};

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const periodoDe = (meses: number): PeriodoId => (meses === 6 ? "semestral" : meses === 3 ? "trimestral" : "mensal");
const nomePlano = (id: string) => PLANOS.find((p) => p.id === id)?.nome ?? id;
const nomePeriodo = (meses: number) => PERIODOS.find((p) => p.id === periodoDe(meses))?.nome ?? `${meses} meses`;
/** Valor por mês de um plano num período: o preço da cobrança dividido pelos meses que ela cobre. */
const porMes = (plano: string, meses: number) => {
  const id = (PLANOS.some((p) => p.id === plano) ? plano : "petshop") as PlanoId;
  const per = periodoDe(meses);
  return precoDe(id, per) / (PERIODOS.find((p) => p.id === per)?.meses ?? 1);
};
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

export default function AbaVisao() {
  const [v, setV] = useState<Visao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [escala, setEscala] = useState<"dia" | "semana">("dia");

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = ok(await banco().rpc("admin_visao_geral")) as unknown as Visao;
        if (vivo) setV(r);
      } catch (e) {
        if (vivo) setErro(mensagemDeErro(e));
      }
    })();
    return () => { vivo = false; };
  }, []);

  const barras = useMemo(() => {
    if (!v) return [];
    if (escala === "dia") return v.cadastros.slice(-30).map((c) => ({ chave: c.dia, rotulo: String(deIsoDia(c.dia).getDate()), titulo: dataCurta(c.dia), n: c.n }));
    // 90 dias em 13 semanas, a mais recente por último (a primeira pode ter menos dias)
    const dias = v.cadastros;
    const grupos: { chave: string; rotulo: string; titulo: string; n: number }[] = [];
    for (let fim = dias.length; fim > 0; fim -= 7) {
      const pedaco = dias.slice(Math.max(0, fim - 7), fim);
      grupos.unshift({ chave: pedaco[0].dia, rotulo: dataCurta(pedaco[0].dia), titulo: `${dataCurta(pedaco[0].dia)} a ${dataCurta(pedaco[pedaco.length - 1].dia)}`, n: pedaco.reduce((s, d) => s + d.n, 0) });
    }
    return grupos;
  }, [v, escala]);

  const turmas = useMemo(() => {
    if (!v) return [];
    // as 12 semanas, inclusive as sem cadastro; a semana começa na segunda
    const porSemana = new Map(v.turmas.map((t) => [t.semana, t]));
    const hoje = deIsoDia(v.cadastros[v.cadastros.length - 1]?.dia ?? isoDia(new Date()));
    const segunda = somaDias(hoje, -((hoje.getDay() + 6) % 7));
    return Array.from({ length: 12 }, (_, i) => {
      const s = isoDia(somaDias(segunda, -7 * i));
      return porSemana.get(s) ?? { semana: s, cadastros: 0, cortesia: 0, testando: 0, assinaram: 0 };
    });
  }, [v]);

  if (erro) return <p className="g-aviso vermelho" role="alert">{erro}</p>;
  if (!v) return <Esqueleto linhas={6} />;

  const s = v.status;
  const pagando = v.planos.filter((p) => p.status === "ativa");
  const atrasados = v.planos.filter((p) => p.status === "atrasada");
  const mrr = pagando.reduce((t, p) => t + p.n * porMes(p.plano, p.meses), 0);
  const mrrAtraso = atrasados.reduce((t, p) => t + p.n * porMes(p.plano, p.meses), 0);
  const nPagando = pagando.reduce((t, p) => t + p.n, 0);
  const maior = Math.max(1, ...barras.map((b) => b.n));
  const totalBarras = barras.reduce((t, b) => t + b.n, 0);
  const maiorCanc = Math.max(1, ...v.cancelamentos.map((c) => c.n));
  const totalCanc = v.cancelamentos.reduce((t, c) => t + c.n, 0);

  // mistura de planos: quem paga ou está atrasado (cortesia fica de fora)
  const mistura = PLANOS.map((pl) => ({
    ...pl,
    periodos: PERIODOS.map((pe) => ({ ...pe, n: v.planos.filter((x) => x.status !== "cortesia" && x.plano === pl.id && periodoDe(x.meses) === pe.id).reduce((t, x) => t + x.n, 0) })),
  }));
  const totalMistura = Math.max(1, mistura.reduce((t, m) => t + m.periodos.reduce((a, b) => a + b.n, 0), 0));

  // conversão geral das turmas: só quem já terminou o teste (sem cortesia e sem quem ainda testa)
  const fechadas = turmas.reduce((t, x) => t + Math.max(0, x.cadastros - x.cortesia - x.testando), 0);
  const viraram = turmas.reduce((t, x) => t + x.assinaram, 0);

  return (
    <div className="g-pilha g">
      <CartaoPagantes />
      <section className="g-grade c4" aria-label="Pet shops por situação">
        <Num rotulo="Pet shops cadastrados" valor={s.total} />
        <Num rotulo="Em teste" valor={s.teste} dica={s.teste_vencido ? `e ${s.teste_vencido} com o teste vencido, sem assinar` : "nenhum teste vencido sem assinar"} />
        <Num rotulo="Ativas (pagando)" valor={s.ativa} />
        <Num rotulo="Atrasadas" valor={s.atrasada} dica="a Cakto avisou que a cobrança não passou" />
        <Num rotulo="Canceladas" valor={s.cancelada} />
        <Num rotulo="Cortesia" valor={s.cortesia} dica="usam sem pagar" />
        <div className="g-card verde" style={{ gridColumn: "1 / -1" }}>
          <p className="g-rotulo">Receita por mês (estimativa)</p>
          <p className="g-num m" style={{ marginTop: 10 }}>{brl(mrr)}</p>
          <p className="g-pp g-muted" style={{ marginTop: 6 }}>
            {nPagando} {nPagando === 1 ? "conta ativa" : "contas ativas"}, pelo preço de tabela de cada plano. Quem paga a cada 3 ou 6 meses entra dividido por mês. Sem descontar taxas da Cakto.
            {mrrAtraso > 0 && ` Mais ${brl(mrrAtraso)} por mês das atrasadas, se pagarem.`}
          </p>
        </div>
      </section>

      <section className="g-grade c2" style={{ minWidth: 0 }}>
        <div className="g-card" style={{ minWidth: 0 }}>
          <div className="g-card-t">
            <p className="g-rotulo">Cadastros novos</p>
            <span className="g-pp g-muted">{totalBarras} {escala === "dia" ? "em 30 dias" : "em 90 dias"}</span>
          </div>
          <div className="g-chips" style={{ margin: "10px 0 12px" }}>
            <button className="g-chip" aria-pressed={escala === "dia"} onClick={() => setEscala("dia")}>Por dia · 30 dias</button>
            <button className="g-chip" aria-pressed={escala === "semana"} onClick={() => setEscala("semana")}>Por semana · 90 dias</button>
          </div>
          <div className="g-barras" style={{ gap: escala === "dia" ? 2 : 6, gridAutoColumns: "minmax(0, 1fr)" }} role="img" aria-label={`Cadastros ${escala === "dia" ? "por dia nos últimos 30 dias" : "por semana nos últimos 90 dias"}: ${totalBarras} no total.`}>
            {barras.map((b, i) => (
              <div key={b.chave} title={`${b.titulo}: ${b.n} ${b.n === 1 ? "cadastro" : "cadastros"}`}>
                <span className="g-tab">{b.n && (escala === "semana" || b.n === maior) ? b.n : ""}</span>
                <i className={b.n ? undefined : "fraco"} style={{ height: `${Math.round((b.n / maior) * 96)}px` }} />
                <span style={{ whiteSpace: "nowrap", visibility: (barras.length - 1 - i) % (escala === "semana" ? 3 : 5) === 0 ? "visible" : "hidden" }}>{b.rotulo}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="g-card" style={{ minWidth: 0 }}>
          <div className="g-card-t">
            <p className="g-rotulo">Cancelamentos por mês</p>
            <span className="g-pp g-muted">{totalCanc} em 12 meses</span>
          </div>
          <div className="g-barras" style={{ marginTop: 14, gap: 3, gridAutoColumns: "minmax(0, 1fr)" }} role="img" aria-label={`Cancelamentos por mês nos últimos 12 meses: ${totalCanc} no total.`}>
            {v.cancelamentos.map((c) => {
              const [a, m] = c.mes.split("-").map(Number);
              return (
                <div key={c.mes} title={`${MESES_CURTOS[m - 1]}/${a}: ${c.n}`}>
                  <span className="g-tab">{c.n || ""}</span>
                  <i className={c.n ? undefined : "fraco"} style={{ height: `${Math.round((c.n / maiorCanc) * 96)}px`, background: c.n ? "var(--g-vermelho, #b4412f)" : undefined }} />
                  <span>{MESES_CURTOS[m - 1]}</span>
                </div>
              );
            })}
          </div>
          <p className="g-pp g-muted" style={{ marginTop: 10 }}>
            Conta cada pet shop uma vez por mês, quando a Cakto avisou cancelamento, devolução ou contestação, ou quando o status mudou para cancelada.
            {v.canceladas_sem_data > 0 && ` ${v.canceladas_sem_data} ${v.canceladas_sem_data === 1 ? "conta cancelada é" : "contas canceladas são"} de antes deste registro e não ${v.canceladas_sem_data === 1 ? "aparece" : "aparecem"} no gráfico.`}
          </p>
        </div>
      </section>

      <section className="g-card" style={{ minWidth: 0 }}>
        <p className="g-rotulo">Do teste à assinatura, por semana de cadastro</p>
        <p className="g-pp g-muted" style={{ marginTop: 4 }}>
          A porcentagem conta só quem já terminou o teste. Cortesias ficam de fora.
          {fechadas > 0 ? ` Nas 12 semanas: ${viraram} de ${fechadas} assinaram (${pct(viraram, fechadas)}%).` : " Nenhum teste dessas semanas terminou ainda."}
        </p>
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table className="g-tabela" style={{ width: "100%", borderCollapse: "collapse", fontSize: ".875rem" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={th}>Semana</th><th style={thN}>Cadastros</th><th style={thN}>Testando</th><th style={thN}>Assinaram</th><th style={{ ...th, minWidth: 110 }}>Viraram</th>
              </tr>
            </thead>
            <tbody>
              {turmas.map((t) => {
                const base = Math.max(0, t.cadastros - t.cortesia - t.testando);
                return (
                  <tr key={t.semana} style={{ opacity: t.cadastros ? 1 : .5 }}>
                    <td style={td}>{dataCurta(t.semana)}</td>
                    <td style={tdN}>{t.cadastros}{t.cortesia ? <span className="g-muted"> ({t.cortesia} cortesia)</span> : null}</td>
                    <td style={tdN}>{t.testando}</td>
                    <td style={tdN}>{t.assinaram}</td>
                    <td style={td}>
                      {base ? (
                        <span style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "center" }}>
                          <span className="g-prog"><i style={{ width: `${Math.min(100, pct(t.assinaram, base))}%` }} /></span>
                          <span className="g-tab">{pct(t.assinaram, base)}%</span>
                        </span>
                      ) : <span className="g-muted">{t.cadastros ? "teste em andamento" : "—"}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="g-card">
        <p className="g-rotulo">Planos de quem paga</p>
        <p className="g-pp g-muted" style={{ marginTop: 4 }}>Contas ativas e atrasadas, por plano e por período de cobrança. Cortesias ficam de fora.</p>
        <div className="g-pilha p" style={{ marginTop: 14 }}>
          {mistura.map((pl) => {
            const n = pl.periodos.reduce((a, b) => a + b.n, 0);
            return (
              <div key={pl.id} style={{ display: "grid", gap: 6 }}>
                <div className="g-fila entre"><b>{pl.nome}</b><span className="g-pp g-muted g-tab">{n} {n === 1 ? "conta" : "contas"}</span></div>
                <div className="g-prog"><i style={{ width: `${(n / totalMistura) * 100}%` }} /></div>
                <span className="g-pp g-muted g-tab">{pl.periodos.map((pe) => `${pe.nome}: ${pe.n}`).join(" · ")}</span>
              </div>
            );
          })}
        </div>
        {v.planos.some((p) => p.status === "cortesia") && (
          <p className="g-pp g-muted" style={{ marginTop: 12 }}>
            Cortesias: {v.planos.filter((p) => p.status === "cortesia").map((p) => `${p.n} no ${nomePlano(p.plano)} (${nomePeriodo(p.meses)})`).join(" · ")}.
          </p>
        )}
      </section>
      <p className="g-pp g-muted">Este painel mostra só números do negócio de cada conta. Não mostra clientes, pets nem quanto cada pet shop fatura.</p>
    </div>
  );
}

const th: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid var(--g-linha)", fontWeight: 600, whiteSpace: "nowrap" };
const thN: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: "6px 8px", borderBottom: "1px solid var(--g-linha)" };
const tdN: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" };

function Num({ rotulo, valor, dica }: { rotulo: string; valor: number; dica?: string }) {
  return (
    <div className="g-card">
      <p className="g-rotulo">{rotulo}</p>
      <p className="g-num" style={{ marginTop: 10 }}>{valor}</p>
      {dica && <p className="g-pp g-muted" style={{ marginTop: 6 }}>{dica}</p>}
    </div>
  );
}
