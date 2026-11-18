"use client";

import { useEffect, useRef, useState } from "react";
import { History } from "lucide-react";
import { useGestao } from "./contexto";

/**
 * Rascunho do que foi digitado e ainda não foi salvo, guardado no aparelho (por pet shop e por pessoa).
 * A aba que recarrega (ou fecha) no meio de um formulário volta com o que estava escrito e avisa "Rascunho recuperado · Descartar".
 * Salvou (ou descartou): o rascunho some. Sem armazenamento no aparelho, o formulário segue normal, só sem lembrar.
 * Rascunho com mais de 14 dias é deixado de lado.
 */
const PREFIXO = "maestro:rascunho:";
const VALIDADE = 14 * 864e5;

export const chaveDoRascunho = (petshopId: string, pessoaId: string, nome: string) => `${PREFIXO}${petshopId}:${pessoaId}:${nome}`;

export function lerRascunho<T>(chave: string): T | null {
  try {
    const bruto = localStorage.getItem(chave);
    if (!bruto) return null;
    const r = JSON.parse(bruto) as { v: T; em: number };
    if (!r || typeof r.em !== "number" || Date.now() - r.em > VALIDADE) { localStorage.removeItem(chave); return null; }
    return r.v;
  } catch { return null; }
}
export function guardarRascunho(chave: string, v: unknown) {
  try { localStorage.setItem(chave, JSON.stringify({ v, em: Date.now() })); } catch { /* aparelho sem armazenamento: só não lembra */ }
}
export function apagarRascunho(chave: string) {
  try { localStorage.removeItem(chave); } catch { /* tudo bem */ }
}
/** Os rascunhos guardados que começam com `nome` (ex.: "plano:"), com o resto do nome e o conteúdo. */
export function rascunhosQueComecam<T>(petshopId: string, pessoaId: string, nome: string): { nome: string; v: T }[] {
  const base = chaveDoRascunho(petshopId, pessoaId, nome);
  const achados: { nome: string; v: T }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(base)) continue;
      const v = lerRascunho<T>(k);
      if (v != null) achados.push({ nome: k.slice(chaveDoRascunho(petshopId, pessoaId, "").length), v });
    }
  } catch { /* sem armazenamento */ }
  return achados;
}

/**
 * Guarda `valor` enquanto `mexeu` e, ao abrir, devolve o rascunho por `aplicar`. Quando `mexeu` volta a falso (salvou), apaga.
 * `chave` nula: nada é lido nem guardado (ex.: ainda sem saber de que pet é o formulário).
 */
export function useRascunho<T>(nome: string | null, valor: T, mexeu: boolean, aplicar: (v: T) => void) {
  const { petshop, eu } = useGestao();
  const chave = nome ? chaveDoRascunho(petshop.id, eu.id, nome) : null;
  const [recuperado, setRecuperado] = useState(false);
  const lida = useRef<string | null>(null);
  const escrito = useRef(false);
  const aplicarRef = useRef(aplicar);
  aplicarRef.current = aplicar;
  useEffect(() => {
    if (!chave || lida.current === chave) return;
    lida.current = chave;
    escrito.current = false;
    const r = lerRascunho<T>(chave);
    // quem aplica marca o formulário como mexido: o próximo desenho guarda de novo (e o Descartar apaga)
    if (r != null) { aplicarRef.current(r); setRecuperado(true); }
  }, [chave]);
  const texto = JSON.stringify(valor);
  useEffect(() => {
    if (!chave || lida.current !== chave) return;
    if (mexeu) { guardarRascunho(chave, JSON.parse(texto)); escrito.current = true; }
    else if (escrito.current) { apagarRascunho(chave); escrito.current = false; setRecuperado(false); }
  }, [chave, mexeu, texto]);
  return {
    recuperado,
    /** Salvou: o rascunho some (para formulário que fecha ao salvar). */
    limpar: () => { if (chave) apagarRascunho(chave); escrito.current = false; setRecuperado(false); },
  };
}

/** "Rascunho recuperado · Descartar": aparece no alto do formulário que voltou com o que estava escrito. */
export function AvisoDeRascunho({ aoDescartar, texto = "Rascunho recuperado: o que você tinha escrito e não salvou voltou." }: { aoDescartar: () => void; texto?: string }) {
  return (
    <div className="g-rascunho" role="status">
      <History aria-hidden /><span className="g-cresce">{texto}</span>
      <button type="button" className="g-btn fantasma p" onClick={aoDescartar}>Descartar</button>
    </div>
  );
}

/** Chave do rascunho do formulário de pet novo (fica aqui, fora do formulário, para a lista de Clientes não precisar baixá-lo). */
export const RASCUNHO_PET_NOVO = "pet-novo";
