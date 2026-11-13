"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { esperadoNoDia, lerPlanos, lerPresencas } from "@/lib/gestao/creche";
import { lerCuidados, nomeDaAcomodacao, quemOcupa, textoDoCuidado } from "@/lib/gestao/hotel";
import { cuidadosLigados } from "@/lib/gestao/hotel-opcoes";
import { usaModulo } from "@/lib/gestao/modulos";
import { dataCurta, dataLonga, deIsoDia, fmtTelefone, hora, isoDia, somaDias } from "@/lib/gestao/util";
import { useCalendario } from "@/components/gestao/calendario";
import { useGestao } from "@/components/gestao/contexto";
import { Esqueleto, ok, useDados } from "@/components/gestao/ui";
import LogoLoja from "@/components/gestao/logo-loja";
import { horaCurta, nomeTipo, SELECT_ESTADIA, type EstadiaCompleta } from "@/components/gestao/hotel/tipos";
import "../../agenda/imprimir/imprimir.css";

/**
 * Folha do dia da creche e do hotel, para imprimir ou salvar em PDF: quem está na casa, quem chega e quem sai,
 * com as observações, a comida e o remédio, e o telefone do tutor. Não mostra valores.
 */
function FolhaDoDia() {
  const params = useSearchParams();
  const { sb, petshop } = useGestao();
  const { pronto: calendarioPronto } = useCalendario(); // dia fechado: nenhum mensalista esperado
  const [dia, setDia] = useState(() => params.get("dia") ?? isoDia(new Date()));
  const [hoje] = useState(() => new Date());
  const hojeIso = isoDia(hoje);
  const comCuidados = cuidadosLigados(petshop);
  const usaCreche = usaModulo(petshop, "creche");
  useEffect(() => {
    const antes = document.title;
    document.title = `Folha do dia ${dia.split("-").reverse().join("-")} · ${petshop.nome}`;
    return () => { document.title = antes; };
  }, [dia, petshop.nome]);
  const data = deIsoDia(dia);

  const { dados, carregando } = useDados(async () => {
    const [abertas, encerradas] = await Promise.all([
      sb.from("estadias").select(SELECT_ESTADIA).eq("petshop_id", petshop.id).in("status", ["reservada", "em_casa"]).order("entrada").limit(500),
      sb.from("estadias").select(SELECT_ESTADIA).eq("petshop_id", petshop.id).eq("status", "encerrada")
        .lte("entrada", somaDias(data, 1).toISOString()).gte("saida", data.toISOString()).order("entrada").limit(500),
    ]);
    // mensalistas esperados no dia (de hoje em diante), sem quem avisou que falta
    let esperados: { id: string; petId: string; nome: string; tutor: string; telefone: string | null; alertas: string | null }[] = [];
    if (usaCreche && dia >= hojeIso) {
      const planos = await lerPlanos(sb, petshop.id, false);
      const mov = planos.length ? await lerPresencas(sb, petshop.id, dia, dia) : { presencas: [], faltas: [] };
      esperados = planos.filter((p) => p.pets?.ativo && esperadoNoDia(p, dia, petshop.horario) && !mov.faltas.some((f) => f.pet_id === p.pet_id && f.dia === dia))
        .map((p) => ({ id: p.id, petId: p.pet_id, nome: p.pets!.nome, tutor: p.pets!.clientes?.nome ?? "", telefone: p.pets!.clientes?.telefone ?? null, alertas: p.pets!.alertas }));
    }
    return { abertas: ok(abertas) as unknown as EstadiaCompleta[], encerradas: ok(encerradas) as unknown as EstadiaCompleta[], esperados };
  }, [petshop.id, dia, usaCreche, calendarioPronto]);

  const abertas = dados?.abertas ?? [], encerradas = dados?.encerradas ?? [];
  const noDia = (d: string | null) => Boolean(d) && isoDia(new Date(d!)) === dia;
  const ocupam = (["hotel", "creche"] as const).flatMap((t) => quemOcupa(t, dia, hoje, abertas, encerradas));
  const chegam = [...abertas, ...encerradas].filter((e) => noDia(e.entrada) && (e.status !== "reservada" || dia >= hojeIso));
  const saem = [...abertas.filter((e) => noDia(e.saida_prevista)), ...encerradas.filter((e) => noDia(e.saida))];
  // na casa: quem ocupa vaga no dia e não está chegando nem saindo nele
  const naCasa = ocupam.filter((e) => !chegam.includes(e) && !saem.includes(e));
  const jaTem = new Set([...ocupam, ...chegam].map((e) => e.pet_id));
  const esperados = (dados?.esperados ?? []).filter((p) => !jaTem.has(p.petId));

  const tabela = (lista: EstadiaCompleta[], coluna: "chega" | "sai" | "fica") => (
    <table>
      <thead><tr><th>Pet</th><th>{coluna === "chega" ? "Chega" : coluna === "sai" ? "Sai" : "Até"}</th><th>Tutor</th>{comCuidados && <th>Comida e remédio</th>}<th>Atenção</th><th className="feito">Feito</th></tr></thead>
      <tbody>
        {lista.map((e) => {
          const fim = e.status === "encerrada" ? e.saida : e.saida_prevista;
          return (
            <tr key={e.id}>
              <td><b>{e.pets?.nome ?? "Pet"}</b><small>{[nomeTipo(e.tipo), e.pets?.porte ? `porte ${e.pets.porte}` : null, nomeDaAcomodacao(petshop, e.acomodacao)].filter(Boolean).join(" · ")}</small></td>
              <td className="hora">{coluna === "chega" ? horaCurta(e.entrada) : fim ? (coluna === "sai" ? horaCurta(fim) : dataCurta(fim)) : "—"}
                <small>{coluna === "chega" ? (fim ? `até ${dataCurta(fim)}` : "sem saída prevista") : coluna === "sai" ? `desde ${dataCurta(e.entrada)}` : fim ? `às ${horaCurta(fim)}` : "sem saída prevista"}</small></td>
              <td>{e.pets?.clientes?.nome ?? "—"}<small>{fmtTelefone(e.pets?.clientes?.telefone)}</small></td>
              {comCuidados && <td className="atencao">{lerCuidados(e).map((c) => <span key={c.id}>{c.tipo === "remedio" ? "Remédio: " : ""}{textoDoCuidado(c)}</span>)}</td>}
              <td className="atencao">{e.pets?.alertas && <span><b>{e.pets.alertas}</b></span>}{e.obs && <span>{e.obs}</span>}</td>
              <td className="feito"><i /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
  const secao = (titulo: string, lista: EstadiaCompleta[], coluna: "chega" | "sai" | "fica", vazio: string) => (
    <section className={`g-imp-dia${lista.length ? "" : " vazio"}`}>
      <h2>{titulo}<small>{!lista.length ? vazio : lista.length === 1 ? "1 pet" : `${lista.length} pets`}</small></h2>
      {lista.length > 0 && tabela(lista, coluna)}
    </section>
  );

  return (
    <div className="g-imp">
      <div className="g-imp-controles">
        <Link className="g-voltar" href="/gestao/app/creche-hotel"><ArrowLeft />Voltar para Creche e hotel</Link>
        <div className="g-imp-linha">
          <input className="g-input" type="date" value={dia} aria-label="Dia" onChange={(e) => e.target.value && setDia(e.target.value)} />
          <button className="g-btn pri" onClick={() => window.print()}><Printer />Imprimir ou salvar em PDF</button>
        </div>
        <p className="g-muted g-pp">Para salvar em PDF, toque em Imprimir e escolha "Salvar como PDF" no lugar da impressora. A folha não mostra valores.</p>
      </div>

      <article className="g-imp-folha semana">
        <header className="g-imp-cab">
          <div className="g-imp-marca"><LogoLoja nome={petshop.nome} logo={petshop.logo} tamanho={46} /><div><h1>{petshop.nome}</h1><p>Folha do dia · {dataLonga(data)}</p></div></div>
          <p className="g-imp-quando">Impresso em {dataCurta(new Date())}, {hora(new Date())}</p>
        </header>
        {carregando && !dados ? <Esqueleto linhas={5} /> : (
          <>
            {secao("Na casa", naCasa, "fica", "ninguém")}
            {secao(dia < hojeIso ? "Chegaram" : "Chegam", chegam, "chega", "ninguém")}
            {secao(dia < hojeIso ? "Saíram" : "Saem", saem, "sai", "ninguém")}
            {esperados.length > 0 && (
              <section className="g-imp-dia">
                <h2>Mensalistas esperados na creche<small>{esperados.length === 1 ? "1 pet" : `${esperados.length} pets`}</small></h2>
                <table>
                  <thead><tr><th>Pet</th><th>Tutor</th><th>Atenção</th><th className="feito">Veio</th></tr></thead>
                  <tbody>{esperados.map((p) => <tr key={p.id}><td><b>{p.nome}</b></td><td>{p.tutor || "—"}<small>{fmtTelefone(p.telefone)}</small></td><td className="atencao">{p.alertas && <span><b>{p.alertas}</b></span>}</td><td className="feito"><i /></td></tr>)}</tbody>
                </table>
              </section>
            )}
          </>
        )}
        <footer className="g-imp-pe">Maestro Pet Gestão</footer>
      </article>
    </div>
  );
}

export default function Pagina() {
  return <Suspense fallback={<Esqueleto linhas={5} />}><FolhaDoDia /></Suspense>;
}
