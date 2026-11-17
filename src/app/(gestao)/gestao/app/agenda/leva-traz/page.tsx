"use client";

import PaginaLevaTraz from "@/components/gestao/leva-traz/leva-traz";

/** Leva e traz do dia, aberto pela Agenda (o mesmo da Creche e hotel: horários e estadias, conforme as áreas de quem abre). */
export default function Pagina() {
  return <PaginaLevaTraz origem="agenda" />;
}
