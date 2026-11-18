"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore, type ComponentProps } from "react";

/*
 * Link do aplicativo que só adianta a tela de destino DEPOIS que a tela aberta apareceu.
 *
 * O Link do Next baixa a tela de cada link visível assim que ele aparece. Na Hoje eram meia dúzia de telas (Meu pet shop,
 * Creche e hotel, Caixa, Agenda…), uns 500 KB, baixando junto com a própria Hoje: no celular com internet fraca, os dados
 * do dia esperavam na fila. Aqui o link fica sem adiantar até a tela abrir (nada mais carregando por 1 s, mesma regra de
 * `quandoATelaAbrir`, em ui.tsx) e depois volta a ser o Link de sempre. O toque funciona igual o tempo todo; a única
 * diferença é quando a tela de destino baixa. `prefetch={false}` continua sem adiantar nunca.
 */

/** A rota cuja tela já abriu (os links dela já podem adiantar). */
let aberta: string | null = null;
let vigiada: string | null = null;
let pararDeVigiar: (() => void) | null = null;
const ouvintes = new Set<() => void>();

function vigiar(rota: string) {
  if (vigiada === rota) return;
  pararDeVigiar?.();
  vigiada = rota;
  let quietas = 0, feito = false;
  const comeco = Date.now();
  const abriu = () => { if (feito) return; feito = true; aberta = rota; for (const f of ouvintes) f(); };
  const t = setInterval(() => {
    quietas = document.querySelector('[aria-busy="true"]') ? 0 : quietas + 1;
    if (quietas >= 2 || Date.now() - comeco > 15000) {
      clearInterval(t);
      const w = window as Window & { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
      if (w.requestIdleCallback) w.requestIdleCallback(abriu, { timeout: 3000 }); else abriu();
    }
  }, 500);
  pararDeVigiar = () => { feito = true; clearInterval(t); };
}

const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f); }; };

/** A tela desta rota já abriu? (false enquanto carrega, e no servidor) */
export function useTelaAberta() {
  const rota = usePathname() ?? "";
  useEffect(() => { vigiar(rota); }, [rota]);
  return useSyncExternalStore(assinar, () => aberta === rota, () => false);
}

export default function Link({ prefetch, ...resto }: ComponentProps<typeof NextLink>) {
  const pode = useTelaAberta();
  return <NextLink {...resto} prefetch={pode ? prefetch : false} />;
}
