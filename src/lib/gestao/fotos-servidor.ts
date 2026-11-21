import { createClient } from "@supabase/supabase-js";
import type { Database } from "./banco";
import { SUPABASE_CHAVE, SUPABASE_URL } from "./supabase";
import { bancoDoTutor, codigoValido } from "./tutor-servidor";
import { bancoDeServico } from "./faxina";

/**
 * Logo do pet shop e foto do pet nas páginas públicas, com o bucket `pets` privado (migração 20261245). Só código de servidor.
 *  - Logo: qualquer um lê (regra pets_logo_ler: o arquivo é a logo de um pet shop). O servidor pede um endereço assinado com
 *    a chave pública e entrega os bytes; o endereço do bucket não chega ao navegador.
 *  - Foto do pet na página do tutor: o banco confere o código e o pet (tutor_pet_foto); o servidor assina com o código no
 *    cabeçalho x-tutor-token (regra pets_tutor_ler, como o diário). Se o Storage não repassar o cabeçalho, e o servidor tiver
 *    a chave de serviço, assina com ela (o banco já conferiu o código).
 */
export type ArquivoBuscado = { estado: "ok"; corpo: ReadableStream<Uint8Array> | null; tipo: string } | { estado: "nao" | "devagar" | "falhou" };

const BUCKET = "pets";
export const caminhoDeLogoValido = (c: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9._-]{1,120}$/.test(c) && !c.includes("..");
const uuidValido = (t: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(t);

const anonimo = () => createClient<Database>(SUPABASE_URL, SUPABASE_CHAVE, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (u, i) => fetch(u, { ...i, cache: "no-store" }) },
});

async function baixar(url: string | undefined | null): Promise<ArquivoBuscado | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (r.ok && (r.headers.get("content-type") ?? "").startsWith("image/")) return { estado: "ok", corpo: r.body, tipo: r.headers.get("content-type") ?? "image/jpeg" };
    void r.body?.cancel();
  } catch { /* falhou */ }
  return null;
}

/** A logo de um pet shop pelo caminho no bucket (o nome do arquivo é aleatório). */
export async function buscarLogo(caminho: string): Promise<ArquivoBuscado> {
  if (!caminhoDeLogoValido(caminho)) return { estado: "nao" };
  const s = await anonimo().storage.from(BUCKET).createSignedUrl(caminho, 120);
  if (!s.data?.signedUrl) return { estado: "nao" };
  return (await baixar(s.data.signedUrl)) ?? { estado: "falhou" };
}

/** A foto do cadastro de um pet, para a página do tutor dono dele. */
export async function buscarFotoDoPet(token: string, petId: string): Promise<ArquivoBuscado> {
  if (!codigoValido(token) || !uuidValido(petId)) return { estado: "nao" };
  const sb = bancoDoTutor(token);
  const r = await sb.rpc("tutor_pet_foto", { p_token: token, p_pet: petId });
  if (r.error) return { estado: r.error.code === "PT429" ? "devagar" : "falhou" };
  const caminho = (r.data as unknown as { caminho?: string } | null)?.caminho;
  if (!caminho) return { estado: "nao" };
  const s = await sb.storage.from(BUCKET).createSignedUrl(caminho, 60);
  const pelo = await baixar(s.data?.signedUrl);
  if (pelo) return pelo;
  const servico = bancoDeServico();
  if (servico) {
    const t = await servico.storage.from(BUCKET).createSignedUrl(caminho, 60);
    const x = await baixar(t.data?.signedUrl);
    if (x) return x;
  }
  return { estado: "falhou" };
}
