"use client";

import ModoEnvio from "@/components/gestao/modo-envio";

/** Modo envio: as mensagens prontas do dia numa fila só, uma por vez, cada uma a um toque do WhatsApp. */
export default function Mensagens() {
  return (
    <>
      <header className="g-topo">
        <div>
          <h1>Mandar mensagens</h1>
          <p className="g-muted">Lembretes, pet pronto, vacinas, aniversários, pacotes e cobranças numa fila só. Uma por vez, no WhatsApp deste aparelho.</p>
        </div>
      </header>
      <ModoEnvio />
    </>
  );
}
