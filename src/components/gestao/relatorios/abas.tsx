"use client";

import Link from "@/components/gestao/link-depois";
import { ChartColumn, FileText } from "lucide-react";
import "./indicadores.css";

/** As duas partes de Relatórios: Indicadores (os gráficos) primeiro e o relatório do período. */
export default function AbasDeRelatorios({ atual }: { atual: "indicadores" | "periodo" }) {
  return (
    <nav className="g-rel-abas gf-nao-imprime" aria-label="Partes de Relatórios">
      <Link href="/gestao/app/relatorios/indicadores" aria-current={atual === "indicadores" ? "page" : undefined}><ChartColumn aria-hidden />Indicadores</Link>
      <Link href="/gestao/app/relatorios" aria-current={atual === "periodo" ? "page" : undefined}><FileText aria-hidden />Relatório do período</Link>
    </nav>
  );
}
