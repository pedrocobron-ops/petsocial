"use client";

import Link from "next/link";
import { ArrowRight, ChevronDown, Lightbulb, TriangleAlert } from "lucide-react";
import { NOME_TELA, QUEM, type Topico } from "@/lib/gestao/manual";
import "./manual.css";

/** Etiqueta de quem consegue fazer o que o tópico ensina. */
export function QuemPode({ quem }: { quem: Topico["quem"] }) {
  return <span className={`g-tag ${QUEM[quem].tom} g-man-quem`}>{QUEM[quem].rotulo}</span>;
}

/** O passo a passo de um tópico: passos numerados, avisos, dicas e o botão que leva para a tela. */
export function CorpoTopico({ topico: t, semTela, aoIr }: { topico: Topico; /** tela já aberta: não repete o botão para ela */ semTela?: string | null; aoIr?: () => void }) {
  return (
    <div className="g-man-corpo">
      <ol className="g-man-passos">
        {t.passos.map((p, i) => <li key={i}><span>{p}</span></li>)}
      </ol>
      {t.atencao?.map((a, i) => (
        <p key={i} className="g-man-nota atencao"><TriangleAlert aria-hidden /><span><b>Atenção.</b> {a}</span></p>
      ))}
      {t.dicas?.length ? (
        <div className="g-man-nota">
          <Lightbulb aria-hidden />
          <ul>{t.dicas.map((d, i) => <li key={i}>{d}</li>)}</ul>
        </div>
      ) : null}
      {t.rota && t.rota !== semTela && (
        <div className="g-man-ir">
          <Link className="g-btn sec p" href={t.rota} onClick={aoIr}>Abrir esta tela<span className="g-man-tela">{NOME_TELA[t.rota]}</span><ArrowRight aria-hidden /></Link>
        </div>
      )}
    </div>
  );
}

/** Um tópico na lista: o título abre e fecha o passo a passo no lugar. No papel, todos saem abertos. */
export function ItemTopico({ topico: t, aberto, aoAlternar, semTela, aoIr, apoio, prefixo }: {
  topico: Topico; aberto: boolean; aoAlternar: () => void; semTela?: string | null; aoIr?: () => void; apoio?: string;
  /** começo do id na página: a mesma lista pode aparecer em dois lugares (seções e resultado da busca) */ prefixo: string;
}) {
  return (
    <div className={`g-man-item${aberto ? " aberto" : ""}`} id={`${prefixo}-${t.id}`}>
      <button type="button" className="g-man-cab" aria-expanded={aberto} aria-controls={`${prefixo}c-${t.id}`} onClick={aoAlternar}>
        <span className="t"><b>{t.titulo}</b>{apoio && <span className="g-man-apoio">{apoio}</span>}</span>
        <QuemPode quem={t.quem} />
        <ChevronDown aria-hidden className="seta" />
      </button>
      <div className="g-man-dobra" id={`${prefixo}c-${t.id}`}>
        <CorpoTopico topico={t} semTela={semTela} aoIr={aoIr} />
      </div>
    </div>
  );
}
