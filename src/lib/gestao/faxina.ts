import { createHash, timingSafeEqual } from "crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./banco";
import { SUPABASE_URL, type Banco } from "./supabase";

/**
 * Só do servidor: a faxina agendada (rota /api/gestao/faxina, chamada pela Vercel Cron uma vez por dia).
 *
 * O banco (gestao_faxina_arquivos, migração 20261195) faz a faxina dele (álbuns vencidos, freios antigos, reservas velhas do
 * caderno), põe na fila as fotos do boletim que ficaram sem boletim em todos os pet shops e devolve o que apagar: as fotos da
 * fila e os PDFs do caderno-tmp com mais de uma hora. Aqui os arquivos saem pela API do Storage (o banco não apaga arquivo).
 *
 * Variáveis (só no servidor, nunca no navegador):
 *   SUPABASE_SERVICE_ROLE_KEY  chave de serviço do Supabase (passa por cima das regras: só esta rota usa)
 *   GESTAO_FAXINA_SEGREDO      segredo da rota (32 caracteres ou mais). Na Vercel, ponha o mesmo valor em CRON_SECRET:
 *                              a Vercel Cron manda "Authorization: Bearer <CRON_SECRET>".
 */
export const BUCKETS_DA_FAXINA = { boletim: "boletim", caderno: "caderno-tmp" } as const;
const LOTE = 100;
const LIMITE = 500;
const VOLTAS = 4;

/** O segredo configurado, ou null (sem ele, a rota não roda). */
export function segredoDaFaxina(): string | null {
  const s = (process.env.GESTAO_FAXINA_SEGREDO ?? "").trim();
  return s.length >= 32 ? s : null;
}

/** O pedido traz o segredo? (Authorization: Bearer … ou x-gestao-faxina: …), comparado sem vazar tempo. */
export function pedidoAutorizado(req: Request, segredo: string): boolean {
  const veio = (req.headers.get("x-gestao-faxina") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "").trim();
  if (!veio) return false;
  const a = createHash("sha256").update(veio).digest(), b = createHash("sha256").update(segredo).digest();
  return timingSafeEqual(a, b);
}

/** Cliente com a chave de serviço, ou null sem a variável. Nunca use fora das rotas do servidor. */
export function bancoDeServico(): Banco | null {
  const chave = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!chave || !SUPABASE_URL) return null;
  return createClient<Database>(SUPABASE_URL, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type ResultadoDaFaxina = { albuns: number; reservas: number; fotos: number; pdfs: number; falhas: number };

async function apagar(sb: Banco, bucket: string, caminhos: string[]): Promise<{ ok: number; falhas: number }> {
  let ok = 0, falhas = 0;
  for (let i = 0; i < caminhos.length; i += LOTE) {
    const parte = caminhos.slice(i, i + LOTE);
    const r = await sb.storage.from(bucket).remove(parte);
    if (r.error) falhas += parte.length; else ok += r.data?.length ?? 0;
  }
  return { ok, falhas };
}

/** Uma faxina completa: algumas voltas de até 500 arquivos por bucket, até a fila esvaziar. `petshop`: só os arquivos dele (testes). */
export async function faxinaGeral(sb: Banco, petshop?: string): Promise<ResultadoDaFaxina> {
  const x: ResultadoDaFaxina = { albuns: 0, reservas: 0, fotos: 0, pdfs: 0, falhas: 0 };
  for (let volta = 0; volta < VOLTAS; volta++) {
    const r = await sb.rpc("gestao_faxina_arquivos", { p_limite: LIMITE, ...(petshop ? { p_petshop: petshop } : {}) });
    if (r.error) throw Object.assign(new Error(r.error.message), { name: "ErroDaFaxina" });
    const d = (r.data ?? {}) as { banco?: { albuns?: number; reservas?: number }; boletim?: string[]; caderno_tmp?: string[] };
    x.albuns += Number(d.banco?.albuns ?? 0); x.reservas += Number(d.banco?.reservas ?? 0);
    const fotos = await apagar(sb, BUCKETS_DA_FAXINA.boletim, d.boletim ?? []);
    const pdfs = await apagar(sb, BUCKETS_DA_FAXINA.caderno, d.caderno_tmp ?? []);
    x.fotos += fotos.ok; x.pdfs += pdfs.ok; x.falhas += fotos.falhas + pdfs.falhas;
    if ((d.boletim?.length ?? 0) < LIMITE && (d.caderno_tmp?.length ?? 0) < LIMITE) break;
  }
  return x;
}
