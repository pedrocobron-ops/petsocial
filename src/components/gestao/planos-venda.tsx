"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { PERIODOS, PLANOS, ofertaDe, textoAcessos, type PeriodoId } from "@/lib/gestao/planos";
import { brlCurto } from "@/lib/gestao/util";

/** Planos da página de venda: a pessoa escolhe de quanto em quanto tempo paga e os três preços mudam juntos. */
export default function PlanosVenda({ criar }: { criar: string }) {
  const [periodo, setPeriodo] = useState<PeriodoId>("mensal");
  return (
    <>
      <div className="gp-periodo" role="group" aria-label="De quanto em quanto tempo pagar">
        {PERIODOS.map((p) => (
          <button key={p.id} aria-pressed={periodo === p.id} onClick={() => setPeriodo(p.id)}>{p.nome}</button>
        ))}
      </div>
      <ul className="gp-planos-grade">
        {PLANOS.map((p) => {
          const o = ofertaDe(p.id, periodo);
          return (
            <li key={p.id} className={p.id === "equipe" ? "destaque" : undefined}>
              <h3>{p.nome}</h3>
              <p className="gp-para">{p.para}</p>
              <p className="gp-valor">{brlCurto(o.preco)}<small> {o.periodo.cada}</small></p>
              <p className="gp-conta">{o.periodo.meses > 1 ? <>Equivale a <b>{brlCurto(Math.round(o.porMes))} por mês</b>. Você paga {brlCurto(o.economia)} a menos do que no mensal.</> : "Cobrado todo mês."}</p>
              <p className="gp-acessos">{textoAcessos(p.acessos)}<span> ao sistema</span></p>
              <ul>
                <li><Check />Todas as funções</li>
                <li><Check />Assistente de inteligência artificial, por áudio e texto</li>
                <li><Check />Link de agendamento com a sua marca</li>
                <li><Check />Celular e computador</li>
                <li><Check />Suporte por WhatsApp</li>
              </ul>
              <Link href={criar} className={`gp-btn cheio ${p.id === "equipe" ? "pri" : "verde"}`}>Teste grátis</Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
