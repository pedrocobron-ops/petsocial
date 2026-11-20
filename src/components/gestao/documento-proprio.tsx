"use client";

import { useLayoutEffect } from "react";
import { ROTAS_COM_CSP } from "@/lib/gestao/csp";

/**
 * O aplicativo e o painel só rodam numa página aberta neles mesmos. Quem chega navegando sem recarregar (da capa, do site,
 * da tela de entrar) traria junto a página de antes: a regra de conteúdo "só avisando" do site e, se a pessoa aceitou os
 * cookies na capa, o pixel da Meta (fbevents.js) já na memória. Aqui a página recarrega uma vez no endereço do aplicativo:
 * vale a regra do aplicativo e nada do site fica para trás.
 */
export function precisaRecarregar(inicioDaPagina: string | null | undefined): boolean {
  if (!inicioDaPagina) return false;
  let caminho = inicioDaPagina;
  try { caminho = new URL(inicioDaPagina, "http://x").pathname; } catch { /* já é caminho */ }
  return !ROTAS_COM_CSP.test(caminho);
}

export default function DocumentoProprio() {
  useLayoutEffect(() => {
    const nav = performance.getEntriesByType?.("navigation")?.[0] as PerformanceNavigationTiming | undefined;
    if (nav && precisaRecarregar(nav.name)) window.location.replace(window.location.href);
  }, []);
  return null;
}
