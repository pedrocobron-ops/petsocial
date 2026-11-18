import { registrarErroServidor } from "@/lib/gestao/erros-servidor";
import { bancoDeServico, faxinaGeral, pareceAgendada, pedidoAutorizado, segredosDaFaxina, type ResultadoDaFaxina } from "@/lib/gestao/faxina";
import type { Banco } from "@/lib/gestao/supabase";

/**
 * Faxina diária (vercel.json, crons): contas com o prazo de exclusão vencido, fotos do boletim que ficaram sem boletim, PDFs
 * do caderno-tmp esquecidos (mais de uma hora) e a faxina do banco. Só com um dos segredos (CRON_SECRET, que a Vercel Cron
 * manda sozinha, ou GESTAO_FAXINA_SEGREDO) e com a chave de serviço (SUPABASE_SERVICE_ROLE_KEY), que só esta rota usa e nunca
 * sai do servidor. Devolve só quantidades.
 *
 * Nada falha calado: sem segredo, sem a chave de serviço, segredo errado vindo da própria Vercel Cron ou erro no meio viram
 * uma linha em erros_app (painel do administrador, aba Erros), e cada rodada fica anotada em rotinas_execucoes
 * (aba Dados, "Rotinas automáticas"), com aviso quando passa de um dia e meio sem rodar bem.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ROTA = "/api/gestao/faxina";
const json = (status: number, corpo: Record<string, unknown>) => Response.json(corpo, { status, headers: { "Cache-Control": "no-store" } });
const erroDeConfiguracao = (frase: string) => Object.assign(new Error(frase), { name: "FaxinaNaoConfigurada" });

type Anotar = { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ error: unknown }> };
/** Anota a rodada (nunca derruba a rota; banco de antes da 20261229 não tem a função e segue). */
async function anotar(sb: Banco, ok: boolean, resultado: ResultadoDaFaxina | null, erro?: string) {
  try {
    await (sb as unknown as Anotar).rpc("rotina_anotar", { p_nome: "faxina", p_ok: ok, p_resultado: resultado, p_erro: erro ?? null });
  } catch { /* segue */ }
}

async function tratar(req: Request) {
  const segredos = segredosDaFaxina();
  if (!segredos.length) {
    console.error(`[${ROTA}] sem segredo: configure CRON_SECRET (ou GESTAO_FAXINA_SEGREDO) no servidor`);
    if (pareceAgendada(req)) await registrarErroServidor(ROTA, erroDeConfiguracao("A faxina diária não rodou: falta o segredo da rota no servidor (CRON_SECRET ou GESTAO_FAXINA_SEGREDO)."));
    return json(503, { erro: "sem_segredo", mensagem: "A faxina não está configurada neste endereço." });
  }
  if (!pedidoAutorizado(req, segredos)) {
    // só a chamada da própria Vercel Cron com o segredo errado vale registro (visita de fora não enche a lista de erros)
    if (/vercel-cron/i.test(req.headers.get("user-agent") ?? "")) {
      console.error(`[${ROTA}] a Vercel Cron chamou com um segredo diferente do configurado`);
      await registrarErroServidor(ROTA, erroDeConfiguracao("A faxina diária não rodou: o segredo que a Vercel Cron mandou é diferente do configurado (confira CRON_SECRET)."));
    }
    return json(401, { erro: "sem_acesso", mensagem: "Sem acesso." });
  }
  const sb = bancoDeServico();
  if (!sb) {
    console.error(`[${ROTA}] sem SUPABASE_SERVICE_ROLE_KEY: a faxina e a exclusão de contas não rodam`);
    await registrarErroServidor(ROTA, erroDeConfiguracao("A faxina diária não rodou: falta a chave de serviço do Supabase no servidor (SUPABASE_SERVICE_ROLE_KEY). Contas com exclusão vencida não estão sendo apagadas."));
    return json(503, { erro: "sem_chave", mensagem: "A faxina não está configurada neste endereço." });
  }
  try {
    const r = await faxinaGeral(sb);
    await anotar(sb, true, r);
    if (r.falhas > 0) await registrarErroServidor(ROTA, Object.assign(new Error(`A faxina diária rodou com ${r.falhas} falha(s) (arquivo, login ou conta que não saiu).`), { name: "FaxinaComFalhas" }));
    return json(200, { ok: true, ...r });
  } catch (e) {
    const frase = e instanceof Error ? e.message : "falhou";
    console.error(`[${ROTA}] falha`, e instanceof Error ? e.name : typeof e);
    await anotar(sb, false, null, frase);
    await registrarErroServidor(ROTA, e);
    return json(500, { erro: "falha", mensagem: "Algo deu errado do nosso lado. Tente de novo em instantes." });
  }
}

export const GET = tratar;
export const POST = tratar;
