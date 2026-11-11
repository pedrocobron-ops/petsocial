"use client";

import { useMemo, useState } from "react";
import { CalendarDays, CircleCheck, Clock, HandCoins, PawPrint, Printer, Receipt, Scissors, TrendingUp, UserPlus, Users, UserX } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { AvatarPessoa, AvatarPet, Esqueleto, useDados, Vazio } from "@/components/gestao/ui";
import { brlMini, Chips, ErroDeCarga, PALETA, paginar, SemAcesso } from "@/components/gestao/financeiro/comum";
import { Anel, Barras, Kpi, Rosca, Tile } from "@/components/gestao/painel";
import { brl, dataCompleta, dataCurta, deIsoDia, inicioDaSemana, inicioDoDia, isoDia, nomeDiaCurto, somaDias } from "@/lib/gestao/util";
import "./relatorios.css";

export default function PaginaRelatorios() {
  const { vejoFinanceiro } = useGestao();
  return vejoFinanceiro ? <Relatorios /> : <SemAcesso />;
}

const PERIODOS = [
  { id: "semana", rotulo: "Esta semana" },
  { id: "mes", rotulo: "Este mês" },
  { id: "mes_passado", rotulo: "Mês passado" },
  { id: "90", rotulo: "Últimos 90 dias" },
] as const;
type Periodo = (typeof PERIODOS)[number]["id"];

/** Primeiro e último dia do período (os dois entram na conta). */
function intervalo(p: Periodo, hoje: Date): { de: Date; ate: Date } {
  if (p === "semana") { const de = inicioDaSemana(hoje); return { de, ate: somaDias(de, 6) }; }
  if (p === "mes") return { de: new Date(hoje.getFullYear(), hoje.getMonth(), 1), ate: new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0) };
  if (p === "mes_passado") return { de: new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1), ate: new Date(hoje.getFullYear(), hoje.getMonth(), 0) };
  return { de: somaDias(inicioDoDia(hoje), -89), ate: inicioDoDia(hoje) };
}

type Ag = {
  id: string; inicio: string; status: string; preco: number | null; pet_id: string; servico_id: string | null; profissional_id: string | null;
  pets: { id: string; nome: string; foto: string | null; especie: string | null; clientes: { id: string; nome: string } | null } | null;
  servicos: { id: string; nome: string; cor: string | null } | null;
};
type Entrada = { data: string; valor: number };

const DIAS_DA_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const DIAS_CURTOS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const real = (n: number) => Math.round(n * 100) / 100;
const vezes = (n: number) => (n === 1 ? "1 vez" : `${n} vezes`);
const atendimentos = (n: number) => (n === 1 ? "1 atendimento" : `${n} atendimentos`);

function Relatorios() {
  const { sb, petshop, equipe } = useGestao();
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const hojeIso = isoDia(new Date());
  const { de, ate } = useMemo(() => intervalo(periodo, deIsoDia(hojeIso)), [periodo, hojeIso]);
  const deIso = isoDia(de), ateIso = isoDia(ate);

  const { dados, carregando, erro, recarregar } = useDados(async () => {
    const comeco = de.toISOString();
    const final = somaDias(ate, 1).toISOString();
    const [ags, entradas, novos] = await Promise.all([
      paginar<Ag>(async (a, b) => {
        const r = await sb.from("agendamentos")
          .select("id, inicio, status, preco, pet_id, servico_id, profissional_id, pets(id, nome, foto, especie, clientes(id, nome)), servicos(id, nome, cor)")
          .eq("petshop_id", petshop.id).gte("inicio", comeco).lt("inicio", final).order("inicio").order("id").range(a, b);
        return { data: r.data as unknown as Ag[] | null, error: r.error };
      }),
      paginar<Entrada>((a, b) => sb.from("lancamentos").select("data, valor").eq("petshop_id", petshop.id).eq("pago", true).eq("tipo", "entrada")
        .gte("data", deIso).lte("data", ateIso).order("data").order("id").range(a, b)),
      sb.from("clientes").select("id", { count: "exact", head: true }).eq("petshop_id", petshop.id).gte("criado_em", comeco).lt("criado_em", final),
    ]);
    if (novos.error) throw new Error(novos.error.message);
    return { ags, entradas, clientesNovos: novos.count ?? 0 };
  }, [petshop.id, deIso, ateIso]);

  const r = useMemo(() => {
    if (!dados) return null;
    const concluidos = dados.ags.filter((a) => a.status === "concluido");
    const faltas = dados.ags.filter((a) => a.status === "faltou").length;
    const baseTicket = real(concluidos.reduce((s, a) => s + Number(a.preco ?? 0), 0));
    const faturamento = real(dados.entradas.reduce((s, l) => s + Number(l.valor), 0));

    // faturamento por dia, ou por semana nos 90 dias
    const porSemana = periodo === "90";
    const dias = Math.round((ate.getTime() - de.getTime()) / 864e5) + 1;
    const barras = Array.from({ length: porSemana ? Math.ceil(dias / 7) : dias }, (_, i) => {
      const dia = somaDias(de, porSemana ? i * 7 : i);
      return { dia, valor: 0 };
    });
    for (const l of dados.entradas) {
      const n = Math.round((deIsoDia(l.data).getTime() - de.getTime()) / 864e5);
      const b = barras[porSemana ? Math.floor(n / 7) : n];
      if (b) b.valor = real(b.valor + Number(l.valor));
    }

    const contar = <T,>(lista: Ag[], chave: (a: Ag) => string | null | undefined, extra: (a: Ag) => T) => {
      const mapa = new Map<string, { n: number; valor: number; extra: T }>();
      for (const a of lista) {
        const k = chave(a);
        if (!k) continue;
        const x = mapa.get(k) ?? { n: 0, valor: 0, extra: extra(a) };
        x.n++;
        x.valor = real(x.valor + Number(a.preco ?? 0));
        mapa.set(k, x);
      }
      return [...mapa.values()].sort((a, b) => b.n - a.n || b.valor - a.valor);
    };
    const usadas = new Set<string>();
    const servicos = contar(concluidos, (a) => a.servico_id ?? "sem", (a) => ({ nome: a.servicos?.nome ?? "Sem serviço escolhido", cor: a.servicos?.cor ?? null })).slice(0, 8)
      .map((s) => {
        // cada fatia com uma cor só dela: a do serviço, ou a próxima livre da paleta
        const cor = s.extra.cor && !usadas.has(s.extra.cor) ? s.extra.cor : PALETA.find((c) => !usadas.has(c)) ?? "#a39a90";
        usadas.add(cor);
        return { n: s.n, valor: s.valor, extra: s.extra.nome, cor };
      });
    const pets = contar(concluidos, (a) => a.pet_id, (a) => a.pets).slice(0, 5);
    const tutores = contar(concluidos, (a) => a.pets?.clientes?.id, (a) => a.pets?.clientes?.nome ?? "").slice(0, 5);

    const comissoes = equipe.filter((p) => Number(p.comissao_pct) > 0).map((p) => {
      const dele = concluidos.filter((a) => a.profissional_id === p.id);
      const base = real(dele.reduce((s, a) => s + Number(a.preco ?? 0), 0));
      return { p, n: dele.length, base, comissao: real((base * Number(p.comissao_pct)) / 100) };
    }).filter((c) => c.p.ativo || c.n > 0).sort((a, b) => b.comissao - a.comissao);

    // movimento: tudo que foi marcado e não foi cancelado
    const marcados = dados.ags.filter((a) => a.status !== "cancelado");
    const porDia = DIAS_DA_SEMANA.map((nome) => ({ nome, n: 0 }));
    const porHora = new Map<number, number>();
    for (const a of marcados) {
      const d = new Date(a.inicio);
      porDia[(d.getDay() + 6) % 7].n++;
      porHora.set(d.getHours(), (porHora.get(d.getHours()) ?? 0) + 1);
    }
    const horas = [...porHora].map(([h, n]) => ({ h, n })).sort((a, b) => b.n - a.n || a.h - b.h).slice(0, 3);

    const comEntrada = barras.filter((b) => b.valor > 0);
    const melhor = comEntrada.reduce<{ dia: Date; valor: number } | null>((m, b) => (!m || b.valor > m.valor ? b : m), null);
    const diaCheio = porDia.reduce((m, d, i) => (d.n > porDia[m].n ? i : m), 0);

    return {
      comEntrada: comEntrada.length, melhor, diaCheio,
      totalComissao: real(comissoes.reduce((s, c) => s + c.comissao, 0)),
      concluidos: concluidos.length, faltas, taxaFalta: concluidos.length + faltas ? (faltas / (concluidos.length + faltas)) * 100 : null,
      faturamento, ticket: concluidos.length ? real(baseTicket / concluidos.length) : null,
      barras, porSemana, servicos, pets, tutores, comissoes, porDia, horas, marcados: marcados.length,
    };
  }, [dados, periodo, de, ate, equipe]);

  const semNada = r && !r.marcados && !r.faturamento && !dados?.clientesNovos && !r.faltas;

  return (
    <>
      <header className="g-topo">
        <div>
          <h1>Relatórios</h1>
          <p className="g-muted">De {dataCompleta(de)} a {dataCompleta(ate)}</p>
        </div>
        <div className="g-acoes">
          <button className="g-btn sec" onClick={() => window.print()}><Printer />Imprimir</button>
        </div>
      </header>

      <div className="g-pilha">
        <div className="gf-rola gf-nao-imprime">
          <Chips opcoes={PERIODOS} valor={periodo} aoMudar={setPeriodo} rotulo="Período" />
        </div>
        <p className="gf-so-papel g-p">{petshop.nome} · {PERIODOS.find((p) => p.id === periodo)?.rotulo}</p>

        {erro && <ErroDeCarga erro={erro} tentar={recarregar} />}
        {carregando || !r || !dados ? (erro ? null : <Esqueleto linhas={5} />) : semNada ? (
          <Vazio titulo="Nada por aqui neste período." texto="Quando houver atendimentos e pagamentos, os números aparecem aqui." />
        ) : (
          <>
            <div className="g-grade kpis">
              <Kpi icone={CircleCheck} tom="pessego" rotulo="Atendimentos concluídos" valor={r.concluidos}
                apoio={r.taxaFalta == null ? "nenhum no período" : `${(100 - r.taxaFalta).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% compareceram`}
                lado={r.taxaFalta == null ? undefined : <Anel parte={1 - r.taxaFalta / 100} cor="var(--g-laranja)">{Math.round(100 - r.taxaFalta)}%</Anel>} />
              <Kpi icone={UserX} tom="rosa" rotulo="Faltas" valor={r.faltas}
                apoio={r.taxaFalta == null ? "nenhuma falta" : `${r.taxaFalta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% de falta`} />
              <Kpi icone={Receipt} tom="ceu" rotulo="Ticket médio" valor={<span className="gf-kpi-v">{r.ticket == null ? "—" : brl(r.ticket)}</span>} apoio="por atendimento concluído" />
              <Kpi icone={UserPlus} tom="lilas" rotulo="Clientes novos" valor={dados.clientesNovos} apoio={dados.clientesNovos === 1 ? "cadastrado no período" : "cadastrados no período"} />
            </div>

            <div className="g-duas">
              <section className="g-card g-rel-fat">
                <div className="g-card-t">
                  <h3><Tile icone={TrendingUp} tom="menta" tamanho="p" />Faturamento por {r.porSemana ? "semana" : "dia"}</h3>
                  <span className="g-muted g-pp">entradas já recebidas</span>
                </div>
                <p className="g-rotulo">Faturamento</p>
                <p className="g-rel-total">{brl(r.faturamento)}</p>
                {r.faturamento > 0 ? (
                  <>
                    {r.barras.length <= 7
                      ? <Barras itens={r.barras.map((b) => ({ rotulo: nomeDiaCurto(b.dia), valor: b.valor }))} formato={brlMini} altura={176}
                          destaque={r.barras.findIndex((b) => isoDia(b.dia) === hojeIso)} />
                      : <Area pontos={r.barras} porSemana={r.porSemana} />}
                    <div className="g-rel-fatos">
                      {r.melhor && (
                        <div><small>{r.porSemana ? "Melhor semana" : "Melhor dia"}</small><b>{brl(r.melhor.valor)}</b><small>{r.porSemana ? `semana de ${dataCurta(r.melhor.dia)}` : dataCurta(r.melhor.dia)}</small></div>
                      )}
                      <div><small>{r.porSemana ? "Semanas com entrada" : "Dias com entrada"}</small><b>{r.comEntrada} de {r.barras.length}</b><small>no período</small></div>
                    </div>
                  </>
                ) : <p className="g-muted g-p" style={{ marginTop: 10 }}>Nenhuma entrada recebida neste período.</p>}
              </section>

              <section className="g-card">
                <div className="g-card-t"><h3><Tile icone={CalendarDays} tom="pessego" tamanho="p" />Dias mais cheios</h3><span className="g-muted g-pp">por dia da semana</span></div>
                {r.marcados ? (
                  <>
                    <div title={r.porDia.map((d) => `${d.nome}: ${d.n}`).join(" · ")}>
                      <Barras itens={r.porDia.map((d, i) => ({ rotulo: DIAS_CURTOS[i], valor: d.n }))} destaque={r.diaCheio} altura={148} />
                    </div>
                    <p className="g-rotulo" style={{ margin: "18px 0 8px" }}>Horários mais cheios</p>
                    <div className="g-rel-horas">
                      {r.horas.map((h) => (
                        <div key={h.h}><Tile icone={Clock} tom="pessego" tamanho="p" /><span><b>{h.h}h</b><small>{h.n === 1 ? "1 horário" : `${h.n} horários`}</small></span></div>
                      ))}
                    </div>
                    <p className="g-muted g-pp" style={{ marginTop: 12 }}>Conta tudo o que foi marcado, menos os cancelados.</p>
                  </>
                ) : <p className="g-muted g-p">Nenhum horário marcado neste período.</p>}
              </section>
            </div>

            <div className="g-duas">
              <section className="g-card">
                <div className="g-card-t"><h3><Tile icone={Scissors} tom="pessego" tamanho="p" />Serviços mais feitos</h3><span className="g-muted g-pp">concluídos</span></div>
                {r.servicos.length ? (
                  <div className="g-rel-rosca">
                    <Rosca fatias={r.servicos.map((s) => ({ valor: s.n, cor: s.cor }))} tamanho={148}>{r.concluidos}<small>{r.concluidos === 1 ? "feito" : "feitos"}</small></Rosca>
                    <div className="g-legenda">
                      {r.servicos.map((s, i) => (
                        <div key={i}>
                          <i style={{ background: s.cor }} />
                          <span className="nome">{s.extra}<small>{vezes(s.n)} · {Math.round((s.n / r.concluidos) * 100)}%</small></span>
                          <b>{brl(s.valor)}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : <p className="g-muted g-p">Nenhum atendimento concluído neste período.</p>}
              </section>

              <section className="g-card">
                <div className="g-card-t"><h3><Tile icone={PawPrint} tom="lilas" tamanho="p" />Pets que mais vieram</h3></div>
                {r.pets.length ? (
                  <div className="g-lista">
                    {r.pets.map((p, i) => (
                      <div key={i} className="g-linha">
                        <span className={`g-rel-pos${i === 0 ? " um" : ""}`}>{i + 1}</span>
                        <AvatarPet pet={p.extra ?? { nome: "Pet" }} />
                        <span className="t"><b>{p.extra?.nome ?? "Pet"}</b><span>{p.extra?.clientes?.nome ?? "Sem tutor"}</span></span>
                        <span className="g-tag">{vezes(p.n)}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="g-muted g-p">Nenhum atendimento concluído neste período.</p>}
              </section>
            </div>

            <div className="g-duas">
              <section className="g-card">
                <div className="g-card-t">
                  <h3><Tile icone={HandCoins} tom="menta" tamanho="p" />Comissão por profissional</h3>
                  {r.comissoes.length > 0 && <b className="g-tab">{brl(r.totalComissao)}</b>}
                </div>
                {r.comissoes.length ? (
                  <div className="g-lista">
                    {r.comissoes.map((c) => (
                      <div key={c.p.id} className="g-linha g-rel-com">
                        <AvatarPessoa nome={c.p.nome} cor={c.p.cor} />
                        <span className="t">
                          <b>{c.p.nome}</b>
                          <span>{atendimentos(c.n)} · base {brl(c.base)} · {Number(c.p.comissao_pct).toLocaleString("pt-BR")}%</span>
                          {r.totalComissao > 0 && <span className="g-prog"><i style={{ width: `${(c.comissao / r.comissoes[0].comissao) * 100}%`, background: c.p.cor ?? undefined }} /></span>}
                        </span>
                        <span className="d"><b>{brl(c.comissao)}</b></span>
                      </div>
                    ))}
                  </div>
                ) : <p className="g-muted g-p">Ninguém da equipe tem comissão definida. A porcentagem de cada pessoa fica no cadastro da equipe.</p>}
                <p className="g-muted g-pp" style={{ marginTop: 10 }}>
                  A base é o preço dos atendimentos concluídos de cada profissional no período, mesmo que o pagamento ainda não tenha entrado.
                </p>
              </section>

              <section className="g-card">
                <div className="g-card-t"><h3><Tile icone={Users} tom="ceu" tamanho="p" />Tutores que mais vieram</h3></div>
                {r.tutores.length ? (
                  <div className="g-lista">
                    {r.tutores.map((t, i) => (
                      <div key={i} className="g-linha">
                        <span className={`g-rel-pos${i === 0 ? " um" : ""}`}>{i + 1}</span>
                        <AvatarPessoa nome={t.extra || "?"} />
                        <span className="t"><b>{t.extra}</b><span>{vezes(t.n)}</span></span>
                        <span className="d">{brl(t.valor)}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="g-muted g-p">Nenhum atendimento concluído neste período.</p>}
              </section>
            </div>
          </>
        )}
      </div>
    </>
  );
}

/** Linha com área para muitos pontos (dias do mês ou semanas dos 90 dias). */
function Area({ pontos, porSemana }: { pontos: { dia: Date; valor: number }[]; porSemana: boolean }) {
  const L = 100, A = 40;
  const maior = Math.max(...pontos.map((p) => p.valor), 1);
  const passo = L / Math.max(1, pontos.length - 1);
  const xy = pontos.map((p, i) => [i * passo, A - 1 - (p.valor / maior) * (A - 5)] as const);
  const linha = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" ");
  const pico = pontos.findIndex((p) => p.valor === maior);
  const nome = (p: { dia: Date }) => (porSemana ? `Semana de ${dataCurta(p.dia)}` : dataCurta(p.dia));
  const meio = pontos[Math.floor((pontos.length - 1) / 2)];
  return (
    <div className="g-rel-area" role="img" aria-label={`Faturamento por ${porSemana ? "semana" : "dia"}. Maior valor: ${brl(maior)}.`}>
      <div className="palco">
        <svg viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="g-rel-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2f6b4c" stopOpacity=".34" />
              <stop offset="1" stopColor="#2f6b4c" stopOpacity=".02" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={L} y1={A * f} y2={A * f} className="grade" vectorEffect="non-scaling-stroke" />)}
          <path d={`${linha} L${L} ${A} L0 ${A} Z`} fill="url(#g-rel-grad)" />
          <path d={linha} className="traco" vectorEffect="non-scaling-stroke" />
        </svg>
        {pico >= 0 && pontos[pico].valor > 0 && (
          <span className={`pico${xy[pico][0] > 55 ? " esq" : ""}`} style={{ left: `${xy[pico][0]}%`, top: `${(xy[pico][1] / A) * 100}%` }}><b>{brl(maior)}</b></span>
        )}
        <div className="alvos">{pontos.map((p, i) => <span key={i} title={`${nome(p)}: ${brl(p.valor)}`} />)}</div>
      </div>
      <div className="eixo"><span>{dataCurta(pontos[0].dia)}</span><span>{dataCurta(meio.dia)}</span><span>{dataCurta(pontos[pontos.length - 1].dia)}</span></div>
    </div>
  );
}
