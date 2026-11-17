"use client";

import { useEffect, useState } from "react";
import { useGestao } from "./contexto";

/**
 * "Pronto em X min": quanto tempo a pessoa levou do cadastro da conta até o primeiro resultado útil (o guia acabou, o primeiro
 * horário marcado). Conta pela hora em que a conta nasceu (login), não pelo pet shop. Passou de 3 horas, não mostra: a frase é
 * para quem acabou de chegar.
 */
export const PRONTO_EM_ATE_MIN = 180;

/** A hora em que a conta de quem está usando nasceu (do login guardado no aparelho; sem rede). */
export function useComecoDaConta() {
  const { sb } = useGestao();
  const [comeco, setComeco] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    void sb.auth.getSession().then(({ data }) => { if (vivo) setComeco(data.session?.user.created_at ?? null); }, () => {});
    return () => { vivo = false; };
  }, [sb]);
  return comeco;
}

/** Minutos desde `desde` (pelo menos 1), ou nada se passou do limite ou a data não vale. */
export function minutosDesde(desde: string | null | undefined, agora = new Date()) {
  const t = desde ? new Date(desde).getTime() : NaN;
  if (!Number.isFinite(t)) return null;
  const m = Math.max(1, Math.round((agora.getTime() - t) / 60000));
  return m > PRONTO_EM_ATE_MIN ? null : m;
}

export const textoProntoEm = (m: number) => `Pronto em ${m === 1 ? "1 minuto" : `${m} minutos`}.`;
