"use client";

import Link from "next/link";
import { CalendarCheck2 } from "lucide-react";
import "./creche.css";

/**
 * A chamada de hoje no alto da tela Hoje: quantos mensalistas são esperados, quantos faltam chegar e o botão para a chamada.
 * Para quem trabalha na creche, é a primeira coisa do dia (antes dos cartões de reservas e dos primeiros passos).
 */
export default function ChamadaDeHoje({ esperados, aindaNao, naCasa, faltaram }: { esperados: number; aindaNao: number; naCasa: number; faltaram: number }) {
  return (
    <section className="g-card g-cm-hoje" aria-label="Chamada de hoje">
      <div className="g-card-t">
        <h2>Chamada de hoje</h2>
        <span className="g-muted g-pp">{esperados === 1 ? "1 mensalista esperado" : `${esperados} mensalistas esperados`}</span>
      </div>
      <div className="g-cm-placar" role="status">
        <span className="esperado"><b className="g-num">{aindaNao}</b>{aindaNao === 1 ? "ainda não chegou" : "ainda não chegaram"}</span>
        <span className="casa"><b className="g-num">{naCasa}</b>na casa</span>
        <span className="faltou"><b className="g-num">{faltaram}</b>{faltaram === 1 ? "faltou" : "faltaram"}</span>
      </div>
      <div><Link className="g-btn pri" href="/gestao/app/creche-hotel?ver=chamada"><CalendarCheck2 />{aindaNao > 0 ? "Fazer a chamada" : "Ver a chamada"}</Link></div>
    </section>
  );
}
