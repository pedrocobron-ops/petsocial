"use client";

import PaginaLevaTraz from "@/components/gestao/leva-traz/leva-traz";

/** Leva e traz do dia, aberto pela Creche e hotel: fica nesta rota para quem tem só a área Creche e hotel (sem a Agenda). */
export default function Pagina() {
  return <PaginaLevaTraz origem="casa" />;
}
