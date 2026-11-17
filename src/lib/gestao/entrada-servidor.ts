import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./banco";
import { SUPABASE_CHAVE, SUPABASE_URL } from "./supabase";
import { BUCKET_ENTRADA } from "./entrada";

/**
 * O lado do servidor da página do aceite da entrada (/gestao/entrada/<código>), só com a chave pública. Só importar em código de
 * servidor. O banco devolve só o que a página mostra (entrada_publica); cada foto passa pela rota .../foto/<n>, que pede ao banco
 * o caminho e a assinatura (entrada_foto) e entrega os bytes. O "Li e concordo" passa pela rota .../aceite, que manda ao banco
 * o IP e o navegador de quem tocou (entrada_aceitar).
 */
export const codigoDaEntradaValido = (t: string) => /^[0-9a-f]{64}$/.test(t);

const banco = () => createClient<Database>(SUPABASE_URL, SUPABASE_CHAVE, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (u, i) => fetch(u, { ...i, cache: "no-store" }) },
});

export type EntradaPublica = {
  petshop: { nome: string; logo: string | null; tema: string | null; telefone: string | null; fuso: string };
  pet: { nome: string; sexo: string | null; especie: string | null };
  tipo: "banho" | "creche" | "hotel"; criado_em: string;
  temperamento: string[]; cuidados: string | null; lesoes: string[]; lesoes_obs: string | null; idoso_doente: boolean;
  pertences: string[]; pertences_outros: string | null; obs: string | null; fotos: number; termo: string;
  aceito_em: string | null; aceite_nome: string | null; expira_em: string;
};

/** A entrada pelo código (uma leitura por pedido). */
export const lerEntrada = cache(async (token: string): Promise<EntradaPublica | "devagar" | null> => {
  if (!codigoDaEntradaValido(token)) return null;
  const r = await banco().rpc("entrada_publica", { p_token: token });
  if (r.error?.code === "PT429") return "devagar";
  if (r.error || !r.data) return null;
  return r.data as unknown as EntradaPublica;
});

export type FotoBuscada = { estado: "ok"; corpo: ReadableStream<Uint8Array> | null; tipo: string } | { estado: "nao" | "devagar" | "falhou" };
const caminhoNoBucket = (caminho: string) => caminho.split("/").map(encodeURIComponent).join("/");

/** Uma foto da entrada (0 a 3). */
export async function buscarFotoDaEntrada(token: string, n: number): Promise<FotoBuscada> {
  if (!codigoDaEntradaValido(token) || !Number.isInteger(n) || n < 0 || n > 3) return { estado: "nao" };
  const r = await banco().rpc("entrada_foto", { p_token: token, p_n: n });
  if (r.error) return { estado: r.error.code === "PT429" ? "devagar" : "falhou" };
  const d = r.data as { caminho?: string; assinatura?: string | null } | null;
  if (!d?.caminho || !d.assinatura) return { estado: "nao" };
  try {
    const x = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET_ENTRADA}/${caminhoNoBucket(d.caminho)}?token=${encodeURIComponent(d.assinatura)}`,
      { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (x.ok && (x.headers.get("content-type") ?? "").startsWith("image/")) return { estado: "ok", corpo: x.body, tipo: x.headers.get("content-type") ?? "image/jpeg" };
    void x.body?.cancel();
  } catch { /* cai no falhou */ }
  return { estado: "falhou" };
}

export type RespostaDoAceite = { ok: true; aceito_em: string; nome: string } | { ok: false; status: number; mensagem: string };

/** "Li e concordo": grava uma vez (o segundo toque devolve o que já estava). */
export async function aceitarEntrada(token: string, nome: string, ip: string, navegador: string): Promise<RespostaDoAceite> {
  const r = await banco().rpc("entrada_aceitar", { p_token: token, p_nome: nome, p_ip: ip, p_navegador: navegador });
  if (r.error) {
    if (r.error.code === "PT429") return { ok: false, status: 429, mensagem: "Muitos toques agora. Espere um minuto e tente de novo." };
    if (r.error.code === "P0001") return { ok: false, status: 400, mensagem: r.error.message };
    return { ok: false, status: 502, mensagem: "Não consegui guardar agora. Tente de novo em instantes." };
  }
  const d = r.data as { aceito_em: string; nome: string };
  return { ok: true, aceito_em: d.aceito_em, nome: d.nome };
}
