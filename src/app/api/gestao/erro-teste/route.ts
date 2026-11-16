import { comRegistro } from "@/lib/gestao/erros-servidor";

/**
 * Só para os testes automáticos: existe apenas com GESTAO_ERRO_TESTE=1 no servidor (nunca em produção).
 * GET: diz se o gatilho de erro de teste está ligado (a tela Hoje com ?__erro_teste=… pergunta aqui antes de quebrar).
 * POST: quebra de propósito dentro de `comRegistro`, para provar o registro de erros do servidor.
 */
export const dynamic = "force-dynamic";

const ligado = () => process.env.GESTAO_ERRO_TESTE === "1";
const nao = () => new Response("Não encontrado.", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET() {
  if (!ligado()) return nao();
  return Response.json({ ligado: true }, { headers: { "Cache-Control": "no-store" } });
}

async function quebrar() {
  if (!ligado()) return nao();
  throw new Error("Erro de teste do servidor (pode ignorar)");
}

export const POST = comRegistro("/api/gestao/erro-teste", quebrar);
