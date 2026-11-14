"use client";

import { useCallback, useRef, useState } from "react";
import { novaChaveDeOperacao } from "./dinheiro";

/**
 * Toque duplo não pode lançar duas vezes. Toda gravação de dinheiro ou de estoque tem duas proteções:
 *
 * 1. Na tela: `fazer` trava NA HORA do primeiro toque (uma referência, não só o estado: dois toques sem intervalo
 *    chegam antes de a tela redesenhar o botão desligado).
 * 2. No banco: a operação leva uma chave, criada quando a folha abre. O banco aceita cada chave uma vez por pet shop;
 *    a mesma chave de novo devolve o que já foi gravado, sem erro e sem repetir.
 *
 * Uso:
 *   const op = useOperacao();
 *   const salvar = () => op.fazer(async (chave) => { ...; await lancarPago(sb, id, { ..., chave }); return true; });
 *   <button disabled={op.ocupado} onClick={() => void salvar()}>
 *
 * Quando a função termina, a próxima operação desta folha ganha chave nova. Se ela devolver `false` (não gravou, ou gravou
 * só uma parte e deu erro), a mesma chave vale para a nova tentativa: tentar de novo depois de um erro no meio não duplica.
 * Operação com mais de uma gravação usa `parteDaChave(chave, "estoque", id)` para cada uma.
 */
export function useOperacao() {
  const preso = useRef(false);
  const chave = useRef<string>("");
  if (!chave.current) chave.current = novaChaveDeOperacao();
  const [ocupado, setOcupado] = useState(false);
  const fazer = useCallback(async (trabalho: (chave: string) => Promise<boolean | void>): Promise<void> => {
    if (preso.current) return;
    preso.current = true;
    setOcupado(true);
    try {
      const feito = await trabalho(chave.current);
      if (feito !== false) chave.current = novaChaveDeOperacao();
    } finally {
      preso.current = false;
      setOcupado(false);
    }
  }, []);
  return { fazer, ocupado };
}

/**
 * Só a trava do primeiro toque, para gravações que não levam chave (o banco já aceita uma vez só, ou não é dinheiro):
 *   const umaVez = useTrava();
 *   const aceitar = (p: Pedido) => umaVez(async () => { … });
 * Enquanto a primeira chamada não termina, as outras voltam na hora, sem fazer nada (devolvem undefined).
 */
export function useTrava() {
  const preso = useRef(false);
  return useCallback(async <T,>(trabalho: () => Promise<T>): Promise<T | undefined> => {
    if (preso.current) return undefined;
    preso.current = true;
    try { return await trabalho(); } finally { preso.current = false; }
  }, []);
}
