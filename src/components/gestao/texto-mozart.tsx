"use client";

import { Fragment } from "react";
import { blocosDoTexto, type Trecho } from "@/lib/gestao/assistente/markdown";

/** A resposta do Mozart na bolha: negrito e lista de verdade, sem os asteriscos (nada vira HTML: o React escapa o texto). */
function Linha({ trechos }: { trechos: Trecho[] }) {
  return <>{trechos.map((x, i) => (x.b ? <b key={i}>{x.t}</b> : <Fragment key={i}>{x.t}</Fragment>))}</>;
}

export function TextoMozart({ texto }: { texto: string }) {
  const blocos = blocosDoTexto(texto);
  if (!blocos.length) return <>{texto}</>;
  return (
    <span className="g-ass-txt">
      {blocos.map((b, i) => (b.tipo === "p"
        ? <p key={i}><Linha trechos={b.trechos} /></p>
        : <ul key={i}>{b.itens.map((it, k) => <li key={k}><Linha trechos={it} /></li>)}</ul>))}
    </span>
  );
}
