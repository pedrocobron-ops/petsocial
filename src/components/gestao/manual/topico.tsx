"use client";

import Link from "next/link";
import { ArrowRight, ChevronDown, Lightbulb, Printer, TriangleAlert } from "lucide-react";
import { QUEM, nomeDaTela, type Topico } from "@/lib/gestao/manual";
import { nomeDaCasa } from "@/lib/gestao/modulos";
import { useGestao } from "../contexto";
import "./manual.css";

/** O pet shop tem um login só (ninguém mais entra no sistema)? Aí as etiquetas de "quem consegue fazer" não aparecem. */
export function useUmLoginSo() {
  const { equipe } = useGestao();
  return equipe.filter((p) => p.ativo && (p.user_id || p.email_convite?.trim())).length <= 1;
}

/** Etiqueta de quem consegue fazer o que o tópico ensina. */
export function QuemPode({ quem }: { quem: Topico["quem"] }) {
  return <span className={`g-tag ${QUEM[quem].tom} g-man-quem`}>{QUEM[quem].rotulo}</span>;
}

/**
 * O manual fala da tela "Creche e hotel"; quem usa só uma das duas vê no menu "Creche" ou "Hotel". Troca só quando o texto
 * fala da tela (Em, Abra, a tela, o cartão), não da categoria do Financeiro, que continua se chamando Creche e hotel.
 */
function comNomeDaCasa(texto: string, nome: string) {
  if (nome === "Creche e hotel") return texto;
  return texto.replace(/\b(Em|em|Abra|abra|tela|Tela|menu|aba|Toque em|toque em) Creche e hotel\b/g, `$1 ${nome}`);
}

/** O passo a passo de um tópico: passos numerados, avisos, dicas e o botão que leva para a tela. */
export function CorpoTopico({ topico: t, semTela, aoIr }: { topico: Topico; /** tela já aberta: não repete o botão para ela */ semTela?: string | null; aoIr?: () => void }) {
  const { petshop } = useGestao();
  const casa = nomeDaCasa(petshop), x = (texto: string) => comNomeDaCasa(texto, casa);
  return (
    <div className="g-man-corpo">
      <ol className="g-man-passos">
        {t.passos.map((p, i) => <li key={i}><span>{x(p)}</span></li>)}
      </ol>
      {t.atencao?.map((a, i) => (
        <p key={i} className="g-man-nota atencao"><TriangleAlert aria-hidden /><span><b>Atenção.</b> {x(a)}</span></p>
      ))}
      {t.dicas?.length ? (
        <div className="g-man-nota">
          <Lightbulb aria-hidden />
          <ul>{t.dicas.map((d, i) => <li key={i}>{x(d)}</li>)}</ul>
        </div>
      ) : null}
      {t.rota && t.rota !== semTela && (
        <div className="g-man-ir">
          <Link className="g-btn sec p" href={t.rota} onClick={aoIr}>Abrir esta tela<span className="g-man-tela">{nomeDaTela(t.rota, petshop)}</span><ArrowRight aria-hidden /></Link>
        </div>
      )}
    </div>
  );
}

/** Um tópico na lista: o título abre e fecha o passo a passo no lugar. No papel, todos saem abertos. */
export function ItemTopico({ topico: t, aberto, aoAlternar, semTela, aoIr, apoio, prefixo, semQuem, aoImprimir, imprime }: {
  topico: Topico; aberto: boolean; aoAlternar: () => void; semTela?: string | null; aoIr?: () => void; apoio?: string;
  /** "Imprimir este tópico": o manual imprime só ele */ aoImprimir?: () => void; /** é o tópico que está saindo no papel */ imprime?: boolean;
  /** pet shop de um login só: "quem consegue fazer" não diz nada, então a etiqueta some */ semQuem?: boolean;
  /** começo do id na página: a mesma lista pode aparecer em dois lugares (seções e resultado da busca) */ prefixo: string;
}) {
  return (
    <div className={`g-man-item${aberto ? " aberto" : ""}${imprime ? " imprime" : ""}`} id={`${prefixo}-${t.id}`}>
      <button type="button" className="g-man-cab" aria-expanded={aberto} aria-controls={`${prefixo}c-${t.id}`} onClick={aoAlternar}>
        <span className="t"><b>{t.titulo}</b>{apoio && <span className="g-man-apoio">{apoio}</span>}</span>
        {!semQuem && <QuemPode quem={t.quem} />}
        <ChevronDown aria-hidden className="seta" />
      </button>
      <div className="g-man-dobra" id={`${prefixo}c-${t.id}`}>
        <CorpoTopico topico={t} semTela={semTela} aoIr={aoIr} />
        {aoImprimir && <button type="button" className="g-btn fantasma p g-man-imprimir" onClick={aoImprimir}><Printer />Imprimir este tópico</button>}
      </div>
    </div>
  );
}
