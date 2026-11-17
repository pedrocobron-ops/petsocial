import { comRegistro } from "@/lib/gestao/erros-servidor";
import { bancoDeServico, faxinaGeral, pedidoAutorizado, segredoDaFaxina } from "@/lib/gestao/faxina";

/**
 * Faxina diária (vercel.json, crons): fotos do boletim que ficaram sem boletim, PDFs do caderno-tmp esquecidos (mais de uma
 * hora) e a faxina do banco. Só com o segredo (GESTAO_FAXINA_SEGREDO; na Vercel, o mesmo valor em CRON_SECRET) e com a chave
 * de serviço (SUPABASE_SERVICE_ROLE_KEY), que só esta rota usa e nunca sai do servidor. Devolve só quantidades.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const json = (status: number, corpo: Record<string, unknown>) => Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } });

async function tratar(req: Request) {
  const segredo = segredoDaFaxina();
  if (!segredo) return json(503, { erro: "sem_segredo", mensagem: "A faxina não está configurada neste endereço." });
  if (!pedidoAutorizado(req, segredo)) return json(401, { erro: "sem_acesso", mensagem: "Sem acesso." });
  const sb = bancoDeServico();
  if (!sb) return json(503, { erro: "sem_chave", mensagem: "A faxina não está configurada neste endereço." });
  const r = await faxinaGeral(sb);
  return json(200, { ok: true, ...r });
}

export const GET = comRegistro("/api/gestao/faxina", tratar);
export const POST = comRegistro("/api/gestao/faxina", tratar);
