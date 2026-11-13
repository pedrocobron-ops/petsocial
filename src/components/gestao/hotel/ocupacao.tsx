"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Moon, Plus, Printer, Sun } from "lucide-react";
import { esperadoNoDia, lerPresencas } from "@/lib/gestao/creche";
import { nivelDeOcupacao, nomeDaAcomodacao, ocupacaoDoDia, quemOcupa, vagasDoTipo, type Mens } from "@/lib/gestao/hotel";
import { acomodacoesDe } from "@/lib/gestao/hotel-opcoes";
import { usaModulo } from "@/lib/gestao/modulos";
import { contando, lerTudo } from "@/lib/gestao/paginas";
import { dataLonga, deIsoDia, isoDia, nomeDiaCurto, nomeMes, somaDias } from "@/lib/gestao/util";
import { diaFechado, feriadoDoDia, fraseDoDiaFechado, nomeDoDiaFechado } from "@/lib/gestao/feriados";
import { useCalendario } from "../calendario";
import { useGestao } from "../contexto";
import { AvatarPet, Esqueleto, Folha, useDados } from "../ui";
import { horaCurta, nomeTipo, SELECT_ESTADIA, type EstadiaCompleta, type Tipo } from "./tipos";
import "./hotel.css";

const SEMANA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

/**
 * Ocupação: o mês em grade (no celular, uma tira de 14 dias) com as vagas tomadas por dia no hotel e na creche.
 * De hoje em diante é a mesma conta do aviso de casa cheia (estadias, reservas e mensalistas esperados);
 * nos dias que já passaram, quem esteve na casa. Tocar num dia mostra quem está, quem chega e quem sai.
 */
export default function Ocupacao({ abertas, mens, aoNovaReserva }: {
  abertas: EstadiaCompleta[]; mens: Mens | null; aoNovaReserva: (dia: string, tipo: Tipo) => void;
}) {
  const { sb, petshop } = useGestao();
  useCalendario(); // feriados e dias fechados
  const [hoje] = useState(() => new Date());
  const hojeIso = isoDia(hoje);
  const [mes, setMes] = useState(() => new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const [aberto, setAberto] = useState<string | null>(null);
  const tipos = (["hotel", "creche"] as const).filter((t) => usaModulo(petshop, t));
  const primeiro = isoDia(mes), ultimo = isoDia(new Date(mes.getFullYear(), mes.getMonth() + 1, 0));

  // dias que já passaram: as estadias encerradas que tocam o mês. De hoje em diante: as faltas avisadas dos mensalistas.
  const { dados, carregando } = useDados(async () => {
    const temPassado = primeiro < hojeIso;
    const encerradas = temPassado ? await lerTudo<EstadiaCompleta>((de, ate, contar) =>
      sb.from("estadias").select(SELECT_ESTADIA, contando(contar)).eq("petshop_id", petshop.id).eq("status", "encerrada")
        .lte("entrada", somaDias(deIsoDia(ultimo), 1).toISOString()).gte("saida", deIsoDia(primeiro).toISOString()).order("entrada").order("id").range(de, ate) as never) : [];
    const ate = ultimo > isoDia(somaDias(hoje, 14)) ? ultimo : isoDia(somaDias(hoje, 14));
    const mov = mens?.planos.length && ate >= hojeIso ? await lerPresencas(sb, petshop.id, hojeIso, ate) : null;
    return { encerradas, mov };
  }, [petshop.id, primeiro, ultimo, hojeIso, mens?.planos.length]);

  const mensDoMes: Mens | null = useMemo(() => (mens ? { planos: mens.planos, presencas: dados?.mov?.presencas ?? mens.presencas, faltas: dados?.mov?.faltas ?? mens.faltas } : null), [mens, dados]);
  const encerradas = dados?.encerradas ?? [];
  const conta = (tipo: string, dia: string) => ocupacaoDoDia(tipo, dia, hoje, abertas, encerradas, mensDoMes, petshop.horario);

  function Celula({ dia, comSemana }: { dia: string; comSemana?: boolean }) {
    const d = deIsoDia(dia);
    return (
      <button type="button" className={`g-ht-dia${dia === hojeIso ? " hoje" : ""}${dia < hojeIso ? " passado" : ""}`} onClick={() => setAberto(dia)}
        aria-label={`${dataLonga(d)}: ${tipos.map((t) => { const v = vagasDoTipo(petshop, t); return `${nomeTipo(t)} ${conta(t, dia)}${v != null ? ` de ${v}` : ""}`; }).join(", ")}`}>
        <span className="n"><span>{d.getDate()}</span>{comSemana && <small>{nomeDiaCurto(d)}</small>}</span>
        {(diaFechado(dia) || feriadoDoDia(dia)) && <span className="fer" title={fraseDoDiaFechado(dia) ?? feriadoDoDia(dia) ?? undefined}>{diaFechado(dia) ? (nomeDoDiaFechado(dia) || "fechado") : feriadoDoDia(dia)}</span>}
        {tipos.map((t) => {
          const n = conta(t, dia), v = vagasDoTipo(petshop, t);
          return <span key={t} className={`g-ht-oc ${nivelDeOcupacao(n, v)}`}>{t === "hotel" ? <Moon aria-hidden /> : <Sun aria-hidden />}{n}{v != null ? `/${v}` : ""}</span>;
        })}
      </button>
    );
  }

  // grade do mês começando na segunda
  const vazias = (mes.getDay() + 6) % 7;
  const diasDoMes = Array.from({ length: deIsoDia(ultimo).getDate() }, (_, i) => isoDia(new Date(mes.getFullYear(), mes.getMonth(), i + 1)));
  // tira de 14 dias: de hoje em diante no mês de hoje; nos outros meses, do dia 1
  const inicioDaTira = primeiro <= hojeIso && hojeIso <= ultimo ? hoje : mes;
  const tira = Array.from({ length: 14 }, (_, i) => isoDia(somaDias(inicioDaTira, i)));
  const semLimite = tipos.filter((t) => vagasDoTipo(petshop, t) == null);

  return (
    <div className="g-pilha">
      <div className="g-card g-pilha">
        <div className="g-ht-cal-topo">
          <h2>{nomeMes(mes)} de {mes.getFullYear()}</h2>
          <div className="g-ht-cal-nav">
            <button type="button" className="g-btn sec p" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() - 1, 1))} aria-label="Mês anterior"><ChevronLeft /></button>
            <button type="button" className="g-btn sec p" onClick={() => setMes(new Date(hoje.getFullYear(), hoje.getMonth(), 1))}>Hoje</button>
            <button type="button" className="g-btn sec p" onClick={() => setMes(new Date(mes.getFullYear(), mes.getMonth() + 1, 1))} aria-label="Próximo mês"><ChevronRight /></button>
          </div>
        </div>
        {carregando && !dados ? <Esqueleto linhas={4} /> : (
          <>
            <div className="g-ht-mes" role="group" aria-label={`Ocupação de ${nomeMes(mes)}`}>
              {SEMANA.map((s) => <span key={s} className="g-ht-sem">{s}</span>)}
              {Array.from({ length: vazias }, (_, i) => <span key={`v${i}`} className="g-ht-dia fora" aria-hidden />)}
              {diasDoMes.map((dia) => <Celula key={dia} dia={dia} />)}
            </div>
            <div className="g-ht-tira" role="group" aria-label="Ocupação dos próximos 14 dias">
              {tira.map((dia) => <Celula key={dia} dia={dia} comSemana />)}
            </div>
          </>
        )}
        <div className="g-ht-legenda">
          <span><Moon size={14} aria-hidden />hotel (noites)</span>
          {tipos.includes("creche") && <span><Sun size={14} aria-hidden />creche (dias)</span>}
          <span><i className="livre" />tem vaga</span><span><i className="meio" />metade</span><span><i className="quase" />quase cheio</span><span><i className="cheio" />cheio</span>
        </div>
        <p className="g-muted g-pp">
          Toque num dia para ver quem está, quem chega e quem sai. Os números contam estadias, reservas{tipos.includes("creche") ? " e mensalistas esperados" : ""}, igual ao aviso de casa cheia.
          {semLimite.length > 0 && ` Para ver "cheio", preencha as vagas ${semLimite.map((t) => (t === "hotel" ? "do hotel" : "da creche")).join(" e ")} em Meu pet shop.`}
        </p>
      </div>
      {aberto && <DiaDaOcupacao dia={aberto} hoje={hoje} abertas={abertas} encerradas={encerradas} mens={mensDoMes} tipos={[...tipos]} aoFechar={() => setAberto(null)}
        aoNovaReserva={(t) => { const dia = aberto; setAberto(null); aoNovaReserva(dia, t); }} />}
    </div>
  );
}

function DiaDaOcupacao({ dia, hoje, abertas, encerradas, mens, tipos, aoFechar, aoNovaReserva }: {
  dia: string; hoje: Date; abertas: EstadiaCompleta[]; encerradas: EstadiaCompleta[]; mens: Mens | null; tipos: Tipo[]; aoFechar: () => void; aoNovaReserva: (t: Tipo) => void;
}) {
  const { petshop } = useGestao();
  const hojeIso = isoDia(hoje);
  const passado = dia < hojeIso;
  const todas = [...abertas, ...encerradas];
  const acomodacoes = acomodacoesDe(petshop);
  const noDia = (d: string | null) => Boolean(d) && isoDia(new Date(d!)) === dia;
  const chegam = todas.filter((e) => noDia(e.entrada) && (e.status === "reservada" ? !passado : true));
  const saem = todas.filter((e) => (e.status === "encerrada" ? noDia(e.saida) : noDia(e.saida_prevista)));
  const linha = (e: EstadiaCompleta, apoio: string) => (
    <div key={e.id} className="g-ht-quem">
      <AvatarPet pet={e.pets ?? { nome: "?" }} tamanho="p" />
      <span className="t">
        <b>{e.pets?.nome ?? "Pet removido"}</b>
        <span>{[e.pets?.clientes?.nome, apoio, nomeDaAcomodacao(petshop, e.acomodacao)].filter(Boolean).join(" · ")}</span>
        {e.pets?.alertas && <span className="alerta"><b>Atenção:</b> {e.pets.alertas}</span>}
        {e.obs && <span>{e.obs}</span>}
      </span>
    </div>
  );
  return (
    <Folha titulo={dataLonga(deIsoDia(dia))} aoFechar={aoFechar}
      rodape={<>
        <Link className="g-btn sec" href={`/gestao/app/creche-hotel/folha?dia=${dia}`} target="_blank"><Printer />Folha do dia</Link>
        {!passado && <button type="button" className="g-btn pri" onClick={() => aoNovaReserva(tipos[0] ?? "hotel")}><Plus />Nova reserva</button>}
      </>}>
      <div className="g-pilha">
        {tipos.map((t) => {
          const ocupam = quemOcupa(t, dia, hoje, abertas, encerradas);
          const total = ocupacaoDoDia(t, dia, hoje, abertas, encerradas, mens, petshop.horario);
          const vagas = vagasDoTipo(petshop, t);
          // mensalistas esperados que ainda não têm estadia contando no dia
          const esperados = t === "creche" && mens && !passado ? mens.planos.filter((p) => (!p.pets || p.pets.ativo) && esperadoNoDia(p, dia, petshop.horario)
            && !mens.faltas.some((f) => f.pet_id === p.pet_id && f.dia === dia) && !ocupam.some((e) => e.pet_id === p.pet_id)).slice(0, Math.max(0, total - ocupam.length)) : [];
          return (
            <section key={t} className="g-ht-bloco">
              <h3>
                <span>{nomeTipo(t)}{t === "hotel" ? " nesta noite" : " neste dia"}</span>
                <span className={`g-ht-oc ${nivelDeOcupacao(total, vagas)}`}>{total}{vagas != null ? ` de ${vagas} vagas` : total === 1 ? " pet" : " pets"}</span>
              </h3>
              {!total ? <p className="g-muted g-p">Ninguém.</p> : (
                <div>
                  {ocupam.map((e) => linha(e, noDia(e.entrada) ? `chega às ${horaCurta(e.entrada)}` : e.saida_prevista ? `até ${new Date(e.saida_prevista).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}` : "sem saída prevista"))}
                  {esperados.map((p) => (
                    <div key={p.id} className="g-ht-quem">
                      <AvatarPet pet={p.pets ?? { nome: "?" }} tamanho="p" />
                      <span className="t"><b>{p.pets?.nome ?? "Pet"}</b><span>{[p.pets?.clientes?.nome, "mensalista esperado"].filter(Boolean).join(" · ")}</span></span>
                    </div>
                  ))}
                </div>
              )}
              {acomodacoes.ativo && t === "hotel" && ocupam.length > 0 && (
                <p className="g-muted g-pp">
                  {acomodacoes.lista.map((a) => { const la = ocupam.filter((e) => e.acomodacao === a.id); return `${a.nome}: ${la.length} de ${a.vagas}${la.length ? ` (${la.map((e) => e.pets?.nome ?? "pet").join(", ")})` : ""}`; }).join(" · ")}
                  {ocupam.some((e) => !e.acomodacao) ? ` · Sem acomodação: ${ocupam.filter((e) => !e.acomodacao).map((e) => e.pets?.nome ?? "pet").join(", ")}` : ""}
                </p>
              )}
            </section>
          );
        })}
        {chegam.length > 0 && <section className="g-ht-bloco"><h3><span>Chegam</span><span className="g-tag verde">{chegam.length}</span></h3><div>{chegam.map((e) => linha(e, `${nomeTipo(e.tipo)}, às ${horaCurta(e.entrada)}`))}</div></section>}
        {saem.length > 0 && <section className="g-ht-bloco"><h3><span>Saem</span><span className="g-tag laranja">{saem.length}</span></h3><div>{saem.map((e) => linha(e, `${nomeTipo(e.tipo)}, às ${horaCurta(e.status === "encerrada" ? e.saida! : e.saida_prevista!)}`))}</div></section>}
      </div>
    </Folha>
  );
}
