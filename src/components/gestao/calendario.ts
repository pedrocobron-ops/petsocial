"use client";

import { useCallback, useEffect, useState } from "react";
import { calendarioGuardado, lerCalendario, ouvirCalendario, type Calendario } from "@/lib/gestao/feriados";
import { useGestao } from "./contexto";

/**
 * Feriados, dias fechados e (para quem recebe) o preço de feriado e a taxa de busca fora do horário.
 * Lê uma vez por pet shop e guarda em src/lib/gestao/feriados.ts; a tela que usa este gancho é redesenhada quando a
 * lista chega ou muda, e as regras (`diaFechado`, `feriadoDoDia`, `atrasoSugerido`) passam a responder com ela.
 * `pronto` fica falso só enquanto a primeira leitura não voltou (até lá, vale "nenhum dia fechado").
 */
let emCurso: Promise<unknown> | null = null;

export function useCalendario(): { calendario: Calendario | null; pronto: boolean; recarregar: () => Promise<void> } {
  const { sb, petshop, vejoFinanceiro } = useGestao();
  const [calendario, setCalendario] = useState<Calendario | null>(() => calendarioGuardado(petshop.id, vejoFinanceiro));
  const recarregar = useCallback(async () => { await lerCalendario(sb, petshop.id, vejoFinanceiro); }, [sb, petshop.id, vejoFinanceiro]);
  // várias partes da mesma tela pedem ao mesmo tempo: a primeira leitura é uma só
  const primeira = useCallback(() => { emCurso ??= recarregar().finally(() => { emCurso = null; }); }, [recarregar]);
  useEffect(() => {
    const ler = () => setCalendario(calendarioGuardado(petshop.id, vejoFinanceiro));
    const parar = ouvirCalendario(ler);
    if (!calendarioGuardado(petshop.id, vejoFinanceiro)) primeira(); else ler();
    return parar;
  }, [petshop.id, vejoFinanceiro, primeira]);
  return { calendario, pronto: calendario != null, recarregar };
}
