"use client";

import type { Horario } from "@/lib/gestao/tipos";
import { lerHorario, semAlmoco } from "@/lib/gestao/horario-loja";
import { GradeHorario } from "./grade-horario";

/**
 * "Igual ao pet shop" ou "Horário próprio": o horário da creche, do hotel (Meu pet shop, Horário de funcionamento) e de um
 * serviço (a folha do serviço). `valor` null = igual ao pet shop. Ao ligar o horário próprio, começa do horário do pet shop
 * (sem o almoço: horário próprio não tem almoço). A conferência (`erroDoHorarioProprio`) fica com quem salva.
 */
export function HorarioProprio({ valor, aoMudar, loja, rotulo, aberto = "Aberto", ajuda, teste }: {
  valor: Horario | null; aoMudar: (h: Horario | null) => void; loja: unknown;
  /** "Horário da creche", "Horário deste serviço"… (vai no aria-label da escolha) */
  rotulo: string;
  aberto?: string;
  /** uma frase embaixo da escolha, quando o horário é próprio */
  ajuda?: string;
  /** data-teste da escolha (testes de tela) */
  teste?: string;
}) {
  const base = semAlmoco(lerHorario(loja));
  return (
    <div className="g-pilha p">
      <div className="g-seg g-mp-proprio" role="group" aria-label={rotulo} data-teste={teste}>
        <button type="button" aria-pressed={!valor} onClick={() => aoMudar(null)}>Igual ao pet shop</button>
        <button type="button" aria-pressed={!!valor} onClick={() => { if (!valor) aoMudar(base); }}>Horário próprio</button>
      </div>
      {valor ? (
        <>
          {ajuda && <p className="g-muted g-pp" style={{ margin: 0 }}>{ajuda}</p>}
          <GradeHorario valor={valor} aoMudar={(h) => aoMudar(semAlmoco(h))} base={base} semAlmoco aberto={aberto} />
        </>
      ) : null}
    </div>
  );
}
