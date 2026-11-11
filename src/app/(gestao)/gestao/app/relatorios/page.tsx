"use client";

import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import { useGestao } from "@/components/gestao/contexto";
import { AvatarPessoa, AvatarPet, Esqueleto, useDados, Vazio } from "@/components/gestao/ui";
import { Chips, ErroDeCarga, paginar, SemAcesso } from "@/components/gestao/financeiro/comum";
import { brl, dataCompleta, dataCurta, deIsoDia, inicioDaSemana, inicioDoDia, isoDia, nomeDiaCurto, somaDias } from "@/lib/gestao/util";

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
  servicos: { id: string; nome: string } | null;
};
type Entrada = { data: string; valor: number };

const DIAS_DA_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
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
          .select("id, inicio, status, preco, pet_id, servico_id, profissional_id, pets(id, nome, foto, especie, clientes(id, nome)), servicos(id, nome)")
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
    const servicos = contar(concluidos, (a) => a.servico_id ?? "sem", (a) => a.servicos?.nome ?? "Sem serviço escolhido").slice(0, 8);
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

    return {
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
            <div className="g-grade c4">
              <Numero rotulo="Atendimentos concluídos" valor={String(r.concluidos)} />
              <Numero rotulo="Faltas" valor={String(r.faltas)}
                nota={r.taxaFalta == null ? undefined : `${r.taxaFalta.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% de falta`} />
              <Numero rotulo="Faturamento" valor={brl(r.faturamento)} nota="entradas já recebidas" />
              <Numero rotulo="Ticket médio" valor={r.ticket == null ? "—" : brl(r.ticket)} nota="por atendimento concluído" />
              <Numero rotulo="Clientes novos" valor={String(dados.clientesNovos)} />
            </div>

            <section className="g-card">
              <div className="g-card-t">
                <h3>Faturamento por {r.porSemana ? "semana" : "dia"}</h3>
                <b className="g-tab">{brl(r.faturamento)}</b>
              </div>
              {r.faturamento > 0 ? <Barras barras={r.barras} porSemana={r.porSemana} /> : <p className="g-muted g-p">Nenhuma entrada recebida neste período.</p>}
            </section>

            <div className="g-grade c2">
              <section className="g-card">
                <div className="g-card-t"><h3>Serviços mais feitos</h3></div>
                {r.servicos.length ? (
                  <div className="g-lista">
                    {r.servicos.map((s, i) => (
                      <div key={i} className="g-linha">
                        <span className="gf-posicao">{i + 1}</span>
                        <span className="t"><b>{s.extra}</b><span>{vezes(s.n)}</span></span>
                        <span className="d">{brl(s.valor)}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="g-muted g-p">Nenhum atendimento concluído neste período.</p>}
              </section>

              <section className="g-card">
                <div className="g-card-t"><h3>Dias mais cheios</h3></div>
                {r.marcados ? (
                  <>
                    {r.porDia.map((d) => {
                      const maior = Math.max(...r.porDia.map((x) => x.n));
                      return (
                        <div key={d.nome} className="gf-cat">
                          <div className="g-fila entre g-p"><span>{d.nome}</span><span className="g-tab">{d.n}</span></div>
                          <div className="g-prog"><i style={{ width: `${maior ? (d.n / maior) * 100 : 0}%` }} /></div>
                        </div>
                      );
                    })}
                    <p className="g-muted g-p" style={{ marginTop: 10 }}>
                      Horários mais cheios: {r.horas.map((h) => `${h.h}h (${h.n})`).join(", ")}.
                    </p>
                    <p className="g-muted g-pp" style={{ marginTop: 4 }}>Conta tudo o que foi marcado, menos os cancelados.</p>
                  </>
                ) : <p className="g-muted g-p">Nenhum horário marcado neste período.</p>}
              </section>

              <section className="g-card">
                <div className="g-card-t"><h3>Pets que mais vieram</h3></div>
                {r.pets.length ? (
                  <div className="g-lista">
                    {r.pets.map((p, i) => (
                      <div key={i} className="g-linha">
                        <AvatarPet pet={p.extra ?? { nome: "Pet" }} />
                        <span className="t"><b>{p.extra?.nome ?? "Pet"}</b><span>{p.extra?.clientes?.nome ?? "Sem tutor"}</span></span>
                        <span className="d">{vezes(p.n)}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="g-muted g-p">Nenhum atendimento concluído neste período.</p>}
              </section>

              <section className="g-card">
                <div className="g-card-t"><h3>Tutores que mais vieram</h3></div>
                {r.tutores.length ? (
                  <div className="g-lista">
                    {r.tutores.map((t, i) => (
                      <div key={i} className="g-linha">
                        <AvatarPessoa nome={t.extra || "?"} />
                        <span className="t"><b>{t.extra}</b><span>{vezes(t.n)}</span></span>
                        <span className="d">{brl(t.valor)}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className="g-muted g-p">Nenhum atendimento concluído neste período.</p>}
              </section>
            </div>

            <section className="g-card">
              <div className="g-card-t"><h3>Comissão por profissional</h3></div>
              {r.comissoes.length ? (
                <div className="g-lista">
                  {r.comissoes.map((c) => (
                    <div key={c.p.id} className="g-linha">
                      <AvatarPessoa nome={c.p.nome} cor={c.p.cor} />
                      <span className="t">
                        <b>{c.p.nome}</b>
                        <span>{atendimentos(c.n)} · base {brl(c.base)} · {Number(c.p.comissao_pct).toLocaleString("pt-BR")}%</span>
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
          </>
        )}
      </div>
    </>
  );
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div className="g-card">
      <p className="g-rotulo">{rotulo}</p>
      <p className="gf-num" style={{ marginTop: 8 }}>{valor}</p>
      {nota && <p className="g-muted g-pp" style={{ marginTop: 4 }}>{nota}</p>}
    </div>
  );
}

function Barras({ barras, porSemana }: { barras: { dia: Date; valor: number }[]; porSemana: boolean }) {
  const maior = Math.max(...barras.map((b) => b.valor), 0);
  const poucas = barras.length <= 14;
  const rotulo = (b: { dia: Date }, i: number) => {
    if (porSemana) return i % 3 === 0 ? dataCurta(b.dia) : "";
    if (barras.length <= 7) return nomeDiaCurto(b.dia);
    const d = b.dia.getDate();
    return d === 1 || d % 5 === 0 ? String(d) : "";
  };
  return (
    <div className={`g-barras gf-barras${poucas ? " poucas" : ""}`} role="img"
      aria-label={`Faturamento por ${porSemana ? "semana" : "dia"}. Maior valor: ${brl(maior)}.`}>
      {barras.map((b, i) => (
        <div key={i} title={`${porSemana ? `Semana de ${dataCurta(b.dia)}` : dataCurta(b.dia)}: ${brl(b.valor)}`}>
          <span className="gf-col"><i className={b.valor ? undefined : "fraco"} style={{ height: `${maior ? (b.valor / maior) * 100 : 0}%` }} /></span>
          <small>{rotulo(b, i)}</small>
        </div>
      ))}
    </div>
  );
}
