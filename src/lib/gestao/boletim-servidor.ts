import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./banco";
import { SUPABASE_CHAVE, SUPABASE_URL } from "./supabase";
import { BUCKET_BOLETIM, type TipoDoBoletim } from "./boletim";

/**
 * O lado do servidor da página pública do boletim (só a chave pública: não há chave de serviço no aplicativo). Só importar em
 * código de servidor. O banco devolve só o que a página mostra (boletim_publico); cada foto passa pela rota
 * /gestao/boletim/<código>/foto/<n>, que pede ao banco o caminho e a assinatura (boletim_foto) e entrega os bytes.
 * O endereço do bucket e a assinatura nunca chegam ao navegador.
 */
export const codigoDoBoletimValido = (t: string) => /^[0-9a-f]{64}$/.test(t);

const banco = () => createClient<Database>(SUPABASE_URL, SUPABASE_CHAVE, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (u, i) => fetch(u, { ...i, cache: "no-store" }) },
});

export type BoletimPublico = {
  petshop: { nome: string; logo: string | null; tema: string | null; telefone: string | null; cidade: string | null; uf: string | null; fuso: string; agendar: string | null; google: string | null };
  pet: { nome: string; sexo: string | null; especie: string | null };
  tipo: TipoDoBoletim; quando: string; dia_hotel: number | null; servicos: string[];
  /** só com a opção "Mostrar valor e pagamento no boletim", só no banho e tosa, só desta visita */
  valores: { total: number; pago: number; falta: number } | null;
  texto: string; chips: string[]; atencao: string | null; fotos: number; criado_em: string; expira_em: string;
};

/** O boletim pelo código (uma leitura por pedido: o título da página e a página usam a mesma). */
export const lerBoletim = cache(async (token: string): Promise<BoletimPublico | "devagar" | null> => {
  if (!codigoDoBoletimValido(token)) return null;
  const r = await banco().rpc("boletim_publico", { p_token: token });
  if (r.error?.code === "PT429") return "devagar";
  if (r.error || !r.data) return null;
  return r.data as unknown as BoletimPublico;
});

export type FotoDoBoletimBuscada = { estado: "ok"; corpo: ReadableStream<Uint8Array> | null; tipo: string } | { estado: "nao" | "devagar" | "falhou" };

const caminhoNoBucket = (caminho: string) => caminho.split("/").map(encodeURIComponent).join("/");

/** Uma foto do boletim (0 a 3) ou do álbum (0 a 199): o banco confere o código e devolve o caminho e a assinatura. */
export async function buscarFotoDoBoletim(token: string, n: number, de: "boletim" | "album" = "boletim"): Promise<FotoDoBoletimBuscada> {
  if (!codigoDoBoletimValido(token) || !Number.isInteger(n) || n < 0 || n > (de === "album" ? 199 : 3)) return { estado: "nao" };
  const r = de === "album" ? await banco().rpc("album_foto", { p_token: token, p_n: n }) : await banco().rpc("boletim_foto", { p_token: token, p_n: n });
  if (r.error) return { estado: r.error.code === "PT429" ? "devagar" : "falhou" };
  const d = r.data as { caminho?: string; assinatura?: string | null } | null;
  if (!d?.caminho || !d.assinatura) return { estado: "nao" };
  try {
    const x = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET_BOLETIM}/${caminhoNoBucket(d.caminho)}?token=${encodeURIComponent(d.assinatura)}`,
      { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (x.ok && (x.headers.get("content-type") ?? "").startsWith("image/")) return { estado: "ok", corpo: x.body, tipo: x.headers.get("content-type") ?? "image/jpeg" };
    void x.body?.cancel();
  } catch { /* cai no falhou */ }
  return { estado: "falhou" };
}

export type AlbumPublico = {
  petshop: BoletimPublico["petshop"]; pet: BoletimPublico["pet"];
  fotos: { dia: string; tipo: TipoDoBoletim | null }[]; criado_em: string; expira_em: string;
};

/** O álbum pelo código (uma leitura por pedido). */
export const lerAlbum = cache(async (token: string): Promise<AlbumPublico | "devagar" | null> => {
  if (!codigoDoBoletimValido(token)) return null;
  const r = await banco().rpc("album_publico", { p_token: token });
  if (r.error?.code === "PT429") return "devagar";
  if (r.error || !r.data) return null;
  return r.data as unknown as AlbumPublico;
});
