"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { PERIODOS, PLANOS, TEXTO_TAXA, ofertaDe, type PeriodoId } from "@/lib/gestao/planos";
import { brlCurto } from "@/lib/gestao/util";

/** "Para quem é" de cada plano, na página de venda: vale para banho e tosa, creche, hotel e loja (o nome do plano não muda). */
const PARA: Record<string, string> = {
  solo: "Para quem atende sozinho. Banho e tosa, creche, hotel e loja, com tudo liberado.",
  equipe: "Para quem tem ajudante ou recepção. As mesmas funções do Solo, para até 3 pessoas.",
  petshop: "Para a equipe completa. As mesmas funções, para até 6 pessoas.",
};

/** "1 pessoa com login" em vez de "1 acesso": quem lê a página não sabe se acesso é aparelho ou pessoa. */
const pessoas = (n: number) => (n === 1 ? "1 pessoa com login (você)" : `Até ${n} pessoas, cada uma com o seu login`);

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
              <p className="gp-para">{PARA[p.id] ?? p.para}</p>
              <p className="gp-valor">{brlCurto(o.preco)}<small> {o.periodo.cada}</small></p>
              <p className="gp-conta">{o.periodo.meses > 1 ? <>Equivale a <b>{brlCurto(Math.round(o.porMes * 100) / 100)} por mês</b>. Você paga {brlCurto(o.economia)} a menos do que no mensal.</> : "Cobrado todo mês."}</p>
              <p className="gp-acessos">{pessoas(p.acessos)}</p>
              <ul>
                <li><Check />Todas as funções: banho e tosa, creche, hotel e loja</li>
                <li><Check />Mozart, assistente por voz e texto, sem pagar à parte</li>
                <li><Check />Link do cliente com a sua marca</li>
                <li><Check />Celular e computador</li>
                <li><Check />Suporte por WhatsApp</li>
              </ul>
              <a href={criar} className={`gp-btn cheio ${p.id === "equipe" ? "pri" : "verde"}`}>Teste grátis</a>
            </li>
          );
        })}
      </ul>
      <p className="gp-taxa">{TEXTO_TAXA}</p>
    </>
  );
}
