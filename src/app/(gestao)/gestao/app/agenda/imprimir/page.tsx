"use client";

import { Suspense, useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Lock, MessageCircle, Printer, Truck } from "lucide-react";
import type { AgendamentoCompleto, Bloqueio } from "@/lib/gestao/tipos";
import { SELECT_AGENDAMENTO, STATUS_AGENDAMENTO } from "@/lib/gestao/tipos";
import { nomeDosServicos } from "@/lib/gestao/servicos-do-horario";

import { dataCurta, dataLonga, deIsoDia, fmtTelefone, hora, horarioDoDia, inicioDaSemana, isoDia, mesmoDia, somaDias } from "@/lib/gestao/util";
import { useGestao } from "@/components/gestao/contexto";
import { Esqueleto, ok, useDados } from "@/components/gestao/ui";
import LogoLoja from "@/components/gestao/logo-loja";
import "./imprimir.css";

/**
 * Agenda para imprimir ou salvar em PDF (pelo próprio navegador) e para mandar em texto no WhatsApp.
 * Pensada para quem trabalha sem login: banhista e tosador recebem a folha do dia ou da semana. Não mostra valores.
 */
function Folha() {
  const params = useSearchParams();
  const { sb, petshop, equipe } = useGestao();
  const [dia, setDia] = useState(() => params.get("dia") ?? isoDia(new Date()));
  const [visao, setVisao] = useState<"dia" | "semana">(params.get("visao") === "semana" ? "semana" : "dia");
  const [prof, setProf] = useState<string>(params.get("prof") ?? "");
  // o nome do arquivo do PDF vem do título da página
  useEffect(() => {
    const antes = document.title;
    document.title = `Agenda ${visao === "semana" ? "da semana de" : "de"} ${dia.split("-").reverse().join("-")} · ${petshop.nome}`;
    return () => { document.title = antes; };
  }, [dia, visao, petshop.nome]);
  const data = deIsoDia(dia);
  const dias = useMemo(() => (visao === "dia" ? [data] : Array.from({ length: 7 }, (_, i) => somaDias(inicioDaSemana(data), i))), [visao, dia]); // eslint-disable-line react-hooks/exhaustive-deps
  const de = dias[0], ate = somaDias(dias[dias.length - 1], 1);
  const atendem = equipe.filter((p) => p.ativo && p.atende);

  const { dados, carregando } = useDados(async () => {
    const [ags, bloqs] = await Promise.all([
      sb.from("agendamentos").select(SELECT_AGENDAMENTO).eq("petshop_id", petshop.id).gte("inicio", de.toISOString()).lt("inicio", ate.toISOString()).order("inicio"),
      sb.from("bloqueios").select("*").eq("petshop_id", petshop.id).lt("inicio", ate.toISOString()).gt("fim", de.toISOString()).order("inicio"),
    ]);
    return { ags: ok(ags) as unknown as AgendamentoCompleto[], bloqueios: ok(bloqs) as Bloqueio[] };
  }, [petshop.id, de.getTime(), ate.getTime()]);

  const doDia = (d: Date) => (dados?.ags ?? []).filter((a) => mesmoDia(new Date(a.inicio), d) && !["cancelado", "faltou"].includes(a.status) && (!prof || a.profissional_id === prof));
  const bloqueiosDoDia = (d: Date) => (dados?.bloqueios ?? []).filter((b) => new Date(b.inicio) < somaDias(d, 1) && new Date(b.fim) > d && (!prof || !b.profissional_id || b.profissional_id === prof));
  const quem = prof ? equipe.find((p) => p.id === prof)?.nome ?? "" : "";
  const periodo = visao === "dia" ? dataLonga(data) : `${dataCurta(dias[0])} a ${dataCurta(dias[6])}`;
  const mostrados = dias.filter((d) => visao === "dia" || doDia(d).length > 0 || horarioDoDia(petshop.horario, d));

  // a mesma agenda em texto, para colar ou mandar no WhatsApp
  const texto = [`Agenda ${petshop.nome} · ${periodo}${quem ? ` · ${quem}` : ""}`,
    ...mostrados.flatMap((d) => {
      const lista = doDia(d);
      const cab = visao === "semana" ? [``, `*${dataLonga(d)}*`] : [``];
      if (!lista.length) return [...cab, "Sem horários marcados."];
      return [...cab, ...lista.map((a) => `${hora(a.inicio)} ${a.pets?.nome ?? ""} · ${nomeDosServicos(a) ?? "atendimento"}${a.pets?.porte ? ` · porte ${a.pets.porte}` : ""}${!prof && a.profissionais ? ` · com ${a.profissionais.nome.split(" ")[0]}` : ""}${a.leva_traz ? " · leva e traz" : ""}${a.pets?.alertas ? ` · atenção: ${a.pets.alertas}` : ""}`)];
    })].join("\n");

  return (
    <div className="g-imp">
      <div className="g-imp-controles">
        <Link className="g-voltar" href={`/gestao/app/agenda?dia=${dia}`}><ArrowLeft />Voltar para a agenda</Link>
        <div className="g-imp-linha">
          <div className="g-seg" role="group" aria-label="Período">
            <button aria-pressed={visao === "dia"} onClick={() => setVisao("dia")}>Dia</button>
            <button aria-pressed={visao === "semana"} onClick={() => setVisao("semana")}>Semana</button>
          </div>
          <input className="g-input" type="date" value={dia} aria-label="Dia" onChange={(e) => e.target.value && setDia(e.target.value)} />
          {atendem.length > 1 && (
            <select className="g-select" value={prof} aria-label="De quem" onChange={(e) => setProf(e.target.value)}>
              <option value="">Todos</option>
              {atendem.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          )}
        </div>
        <div className="g-imp-linha">
          <button className="g-btn pri" onClick={() => window.print()}><Printer />Imprimir ou salvar em PDF</button>
          <a className="g-btn zap" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer"><MessageCircle />Mandar no WhatsApp</a>
        </div>
        <p className="g-muted g-pp">Para salvar em PDF, toque em Imprimir e escolha "Salvar como PDF" no lugar da impressora. A folha não mostra valores.</p>
      </div>

      <article className={`g-imp-folha${visao === "semana" ? " semana" : ""}`}>
        <header className="g-imp-cab">
          <div className="g-imp-marca"><LogoLoja nome={petshop.nome} logo={petshop.logo} tamanho={46} /><div><h1>{petshop.nome}</h1><p>Agenda · {periodo}{quem ? ` · ${quem}` : ""}</p></div></div>
          <p className="g-imp-quando">Impresso em {dataCurta(new Date())}, {hora(new Date())}</p>
        </header>
        {carregando && !dados ? <Esqueleto linhas={5} /> : mostrados.map((d) => {
          const lista = doDia(d), bloqs = bloqueiosDoDia(d);
          return (
            <section key={d.getTime()} className={`g-imp-dia${lista.length ? "" : " vazio"}`}>
              {visao === "semana" && <h2>{dataLonga(d).replace(/^./, (c) => c.toUpperCase())}<small>{!lista.length ? "sem horários" : lista.length === 1 ? "1 horário" : `${lista.length} horários`}</small></h2>}
              {bloqs.map((b) => <p key={b.id} className="g-imp-bloq"><Lock />{hora(b.inicio)} às {hora(b.fim)} · {b.motivo || "Bloqueado"}{b.profissional_id ? ` · ${equipe.find((p) => p.id === b.profissional_id)?.nome.split(" ")[0] ?? ""}` : ""}</p>)}
              {!lista.length ? (visao === "semana" ? null : <p className="g-imp-vazio">Sem horários marcados.</p>) : (
                <table>
                  <thead><tr><th>Hora</th><th>Pet</th><th>Serviço</th>{!prof && atendem.length > 1 && <th>Com</th>}<th>Tutor</th><th>Atenção</th><th className="feito">Feito</th></tr></thead>
                  <tbody>
                    {lista.map((a) => (
                      <tr key={a.id}>
                        <td className="hora">{hora(a.inicio)}<small>até {hora(a.fim)}</small></td>
                        <td><b>{a.pets?.nome}</b><small>{[a.pets?.raca, a.pets?.porte ? `porte ${a.pets.porte}` : null].filter(Boolean).join(" · ")}</small></td>
                        <td>{nomeDosServicos(a) ?? "Atendimento"}{a.status !== "marcado" && <small>{STATUS_AGENDAMENTO[a.status].rotulo}</small>}</td>
                        {!prof && atendem.length > 1 && <td>{a.profissionais?.nome.split(" ")[0] ?? "—"}</td>}
                        <td>{a.pets?.clientes?.nome ?? "—"}<small>{fmtTelefone(a.pets?.clientes?.telefone)}</small></td>
                        <td className="atencao">{a.leva_traz && <span><Truck />Leva e traz{a.endereco_leva_traz ? `: ${a.endereco_leva_traz}` : ""}</span>}{a.pets?.alertas && <span>{a.pets.alertas}</span>}{a.obs && <span>{a.obs}</span>}</td>
                        <td className="feito"><i /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          );
        })}
        <footer className="g-imp-pe">Maestro Pet Gestão</footer>
      </article>
    </div>
  );
}

export default function Imprimir() {
  return <Suspense fallback={<Esqueleto linhas={5} />}><Folha /></Suspense>;
}
