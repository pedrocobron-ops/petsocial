"use client";

import { useEffect } from "react";
import { guardarOrigemDoEndereco } from "@/lib/gestao/origem";

/**
 * Página de venda e cadastro: guarda no aparelho o código do vendedor (`?v=ana`) e os `utm_*` do link que a pessoa abriu,
 * para o pet shop que ela criar ficar marcado com quem a trouxe. Não desenha nada.
 */
export default function GuardarOrigem() {
  useEffect(() => { guardarOrigemDoEndereco(window.location.search); }, []);
  return null;
}
