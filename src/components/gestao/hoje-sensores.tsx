"use client";

import { useEffect } from "react";
import { useVagaNaEsperaDoHotel } from "./casa/espera";
import { resumoDaValidade, useVencimentos } from "./loja/validade";

/*
 * Leituras de fundo da Hoje que moram em módulos grandes (a lista de espera do hotel puxa o formulário do pet; a validade
 * puxa as peças do estoque). A Hoje carrega estes "sensores" à parte (next/dynamic): a conta é a mesma de antes, só não
 * segura o primeiro pacote da tela. Cada um devolve o resultado por `aoMudar`.
 */

export type VagaNaEspera = { n: number; nomes: string[] };
export type ResumoDaValidade = ReturnType<typeof resumoDaValidade>;

export function SensorDaEspera({ ligado, aoMudar }: { ligado: boolean; aoMudar: (v: VagaNaEspera) => void }) {
  const v = useVagaNaEsperaDoHotel(ligado);
  const chave = `${v.n}|${v.nomes.join("|")}`;
  useEffect(() => { aoMudar(v); }, [chave]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export function SensorDaValidade({ ativo, aoMudar }: { ativo: boolean; aoMudar: (v: ResumoDaValidade) => void }) {
  const { dados } = useVencimentos(ativo);
  useEffect(() => { aoMudar(resumoDaValidade(dados)); }, [dados]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}
