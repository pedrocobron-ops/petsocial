import { createClient } from "@supabase/supabase-js";
import type { Database } from "./banco";
import { SUPABASE_CHAVE, SUPABASE_URL } from "./supabase";
import { BUCKET_DIARIO } from "./tutor";

/**
 * O lado do servidor da página do tutor (só a chave pública: não há chave de serviço no aplicativo). Só importar em código de servidor.
 * Cada foto passa por aqui: o banco confere o link do tutor (tutor_foto) e o servidor busca o arquivo no bucket privado
 * por um de dois caminhos e entrega os bytes. O endereço do bucket nunca chega ao navegador.
 *  1. principal: a assinatura que a equipe guardou ao mandar a foto (vale 30 dias, a faxina renova). Depende só do Storage.
 *  2. reserva: um endereço assinado na hora com o código no cabeçalho x-tutor-token (política diario_tutor_ler). Funciona se o
 *     Storage repassar o cabeçalho ao banco, o que no Supabase local acontece; na nuvem, conferir com o botão em Meu pet shop.
 */
export const codigoValido = (t: string) => /^[0-9a-f]{40,100}$/.test(t);
const uuidValido = (t: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(t);

export function bancoDoTutor(token: string) {
  return createClient<Database>(SUPABASE_URL, SUPABASE_CHAVE, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { "x-tutor-token": token }, fetch: (u, i) => fetch(u, { ...i, cache: "no-store" }) },
  });
}

export type FotoBuscada =
  | { estado: "ok"; corpo: ReadableStream<Uint8Array> | null; tipo: string; caminho: "principal" | "reserva" }
  | { estado: "nao" | "devagar" | "falhou" };

const caminhoNoBucket = (caminho: string) => caminho.split("/").map(encodeURIComponent).join("/");

async function buscar(url: string) {
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (r.ok && (r.headers.get("content-type") ?? "").startsWith("image/")) return r;
    void r.body?.cancel();
  } catch { /* tenta o outro caminho */ }
  return null;
}

/** Busca uma foto do tutor. `so` força um dos caminhos (para a conferência em Meu pet shop). */
export async function buscarFoto(token: string, fotoId: string, so?: "principal" | "reserva"): Promise<FotoBuscada> {
  if (!codigoValido(token) || !uuidValido(fotoId)) return { estado: "nao" };
  const sb = bancoDoTutor(token);
  const r = await sb.rpc("tutor_foto", { p_token: token, p_foto: fotoId });
  if (r.error) return { estado: r.error.code === "PT429" ? "devagar" : "falhou" };
  const d = r.data as { caminho?: string; assinatura?: string | null } | null;
  if (!d?.caminho) return { estado: "nao" };
  if (so !== "reserva" && d.assinatura) {
    const x = await buscar(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET_DIARIO}/${caminhoNoBucket(d.caminho)}?token=${encodeURIComponent(d.assinatura)}`);
    if (x) return { estado: "ok", corpo: x.body, tipo: x.headers.get("content-type") ?? "image/jpeg", caminho: "principal" };
  }
  if (so !== "principal") {
    const s = await sb.storage.from(BUCKET_DIARIO).createSignedUrl(d.caminho, 60);
    if (s.data?.signedUrl) {
      const x = await buscar(s.data.signedUrl);
      if (x) return { estado: "ok", corpo: x.body, tipo: x.headers.get("content-type") ?? "image/jpeg", caminho: "reserva" };
    }
  }
  return { estado: "falhou" };
}
