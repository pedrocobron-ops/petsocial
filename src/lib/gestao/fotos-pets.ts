"use client";

import { useEffect, useState } from "react";
import { banco } from "./supabase";

/**
 * Fotos do bucket `pets` (foto do cadastro do pet e o antes e depois do banho), que é privado desde a migração 20261245:
 * a equipe vê por endereço assinado, pedido em lote (até 100 de uma vez) e guardado na memória da aba enquanto vale.
 * A logo do pet shop, que mora no mesmo bucket, vai pela rota /gestao/marca/... (ver logoDaLoja em supabase-config.ts).
 */
export const BUCKET_PETS = "pets";
/** Quanto vale o endereço assinado das telas (1 hora); é pedido de novo quando faltam 5 minutos. */
export const SEGUNDOS_NA_TELA = 3600;
/** O endereço da foto que vai no WhatsApp para o tutor (7 dias). */
export const SEGUNDOS_NO_WHATSAPP = 7 * 86400;

type Guardada = { url: string; ate: number };
const guardadas = new Map<string, Guardada>();
let fila = new Map<string, ((u: string | null) => void)[]>();
let agendado = false;

const valendo = (caminho: string) => {
  const g = guardadas.get(caminho);
  return g && g.ate - Date.now() > 5 * 60_000 ? g.url : null;
};

async function esvaziar() {
  agendado = false;
  const pedidos = fila;
  fila = new Map();
  const caminhos = [...pedidos.keys()];
  for (let i = 0; i < caminhos.length; i += 100) {
    const parte = caminhos.slice(i, i + 100);
    const urls = new Map<string, string>();
    try {
      const s = await banco().storage.from(BUCKET_PETS).createSignedUrls(parte, SEGUNDOS_NA_TELA);
      for (const x of s.data ?? []) if (x.path && x.signedUrl) urls.set(x.path, x.signedUrl);
    } catch { /* sem a foto: o desenho do pet no lugar */ }
    const ate = Date.now() + SEGUNDOS_NA_TELA * 1000;
    for (const c of parte) {
      const u = urls.get(c) ?? null;
      if (u) guardadas.set(c, { url: u, ate });
      for (const f of pedidos.get(c) ?? []) f(u);
    }
  }
}

/** O endereço assinado de uma foto do bucket `pets` (junta os pedidos da mesma volta num só). */
export function urlDaFotoPet(caminho: string | null | undefined): Promise<string | null> {
  if (!caminho) return Promise.resolve(null);
  const ja = valendo(caminho);
  if (ja) return Promise.resolve(ja);
  return new Promise((resolve) => {
    fila.set(caminho, [...(fila.get(caminho) ?? []), resolve]);
    if (!agendado) { agendado = true; setTimeout(() => void esvaziar(), 0); }
  });
}

/** Para as telas: o endereço da foto (null enquanto busca ou sem foto). */
export function useFotoPet(caminho: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => (caminho ? valendo(caminho) : null));
  useEffect(() => {
    let vivo = true;
    if (!caminho) { setUrl(null); return; }
    const ja = valendo(caminho);
    if (ja) { setUrl(ja); return; }
    setUrl(null);
    void urlDaFotoPet(caminho).then((u) => { if (vivo) setUrl(u); });
    return () => { vivo = false; };
  }, [caminho]);
  return url;
}

/** Um endereço que vale mais tempo, para mandar ao tutor (o WhatsApp abre depois, em outro aparelho). */
export async function linkDaFotoPet(caminho: string | null | undefined, segundos = SEGUNDOS_NO_WHATSAPP): Promise<string | null> {
  if (!caminho) return null;
  try {
    const s = await banco().storage.from(BUCKET_PETS).createSignedUrl(caminho, segundos);
    return s.data?.signedUrl ?? null;
  } catch { return null; }
}
