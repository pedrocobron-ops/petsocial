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

// ---------- autorização para postar a foto (migração 20261196) ----------

export type EscopoDaFoto = "boletim" | "todas";
export type AutorizacaoAtual = { escopo: EscopoDaFoto; marcar: string | null; texto: string; desde: string; codigo: string };
/** Os dois textos exatos (sem o @) e a autorização que já vale para as fotos deste boletim. */
export type AutorizacaoDoBoletim = { textos: Record<EscopoDaFoto, string>; atual: AutorizacaoAtual | null };

/** Para a página do boletim (uma leitura por pedido). Sem a função no banco, ou com o freio, a página segue sem o pedido. */
export const lerAutorizacaoDoBoletim = cache(async (token: string): Promise<AutorizacaoDoBoletim | null> => {
  if (!codigoDoBoletimValido(token)) return null;
  const r = await banco().rpc("boletim_autorizacao", { p_token: token });
  if (r.error || !r.data) return null;
  return r.data as unknown as AutorizacaoDoBoletim;
});

export type RespostaDoBanco<T> = { ok: true; dados: T } | { ok: false; status: number; mensagem: string };
function recusa(e: { code?: string; message: string }): { ok: false; status: number; mensagem: string } {
  if (e.code === "PT429") return { ok: false, status: 429, mensagem: "Muitos toques agora. Espere um minuto e tente de novo." };
  // as mensagens das funções são para a pessoa (P0001); o resto não sai
  if (e.code === "P0001") return { ok: false, status: 400, mensagem: e.message };
  return { ok: false, status: 502, mensagem: "Não consegui guardar agora. Tente de novo em instantes." };
}

/** O tutor autoriza pela página do boletim. O banco monta e guarda o texto exato. */
export async function autorizarFoto(token: string, escopo: EscopoDaFoto, marcar: string): Promise<RespostaDoBanco<AutorizacaoAtual>> {
  const r = await banco().rpc("boletim_autorizar", { p_token: token, p_escopo: escopo, p_marcar: marcar });
  if (r.error) return recusa(r.error);
  return { ok: true, dados: r.data as unknown as AutorizacaoAtual };
}

export const codigoDaAutorizacaoValido = codigoDoBoletimValido;
export type AutorizacaoPublica = {
  petshop: { nome: string; logo: string | null; tema: string | null }; pet: { nome: string; sexo: string | null };
  escopo: EscopoDaFoto; marcar: string | null; texto: string; desde: string; retirado_em: string | null; ativas: number;
};

/** A página "Não quero mais" pelo código do link. */
export const lerAutorizacao = cache(async (codigo: string): Promise<AutorizacaoPublica | "devagar" | null> => {
  if (!codigoDaAutorizacaoValido(codigo)) return null;
  const r = await banco().rpc("foto_autorizacao_publica", { p_codigo: codigo });
  if (r.error?.code === "PT429") return "devagar";
  if (r.error || !r.data) return null;
  return r.data as unknown as AutorizacaoPublica;
});

/** "Não quero mais": tira todas as autorizações ativas do pet. */
export async function retirarAutorizacao(codigo: string): Promise<RespostaDoBanco<{ retirado_em: string; retiradas: number }>> {
  const r = await banco().rpc("foto_autorizacao_retirar", { p_codigo: codigo });
  if (r.error) return recusa(r.error);
  return { ok: true, dados: r.data as unknown as { retirado_em: string; retiradas: number } };
}
