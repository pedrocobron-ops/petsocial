"use client";

import { BedDouble, Check, Package, Scissors, Sun, Ticket } from "lucide-react";
import { MODULOS, type Modulo } from "@/lib/gestao/modulos";
import "./modulos.css";

const ICONE: Record<Modulo, React.ComponentType> = { banho_tosa: Scissors, creche: Sun, hotel: BedDouble, loja: Package, pacotes: Ticket };

/** "O que o seu negócio faz?": um toque por opção. Usado ao criar o pet shop (fora do aplicativo) e em Meu pet shop. */
export default function EscolherModulos({ valor, aoMudar, comApoio = false }: { valor: Modulo[]; aoMudar: (v: Modulo[]) => void; comApoio?: boolean }) {
  return (
    <div className={`g-mod${comApoio ? " apoio" : ""}`} role="group" aria-label="O que o seu negócio faz">
      {MODULOS.map((m) => {
        const Icone = ICONE[m.id];
        const on = valor.includes(m.id);
        return (
          <button key={m.id} type="button" className="g-mod-op" aria-pressed={on}
            onClick={() => aoMudar(on ? valor.filter((x) => x !== m.id) : MODULOS.map((x) => x.id).filter((x) => x === m.id || valor.includes(x)))}>
            <span className="ic" aria-hidden><Icone /></span>
            <span className="t"><b>{m.rotulo}</b>{comApoio && <small>{m.apoio}</small>}</span>
            <span className="ok" aria-hidden>{on && <Check />}</span>
          </button>
        );
      })}
    </div>
  );
}
