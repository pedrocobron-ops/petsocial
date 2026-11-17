import { aceitarEntrada, codigoDaEntradaValido } from "@/lib/gestao/entrada-servidor";
import { comRegistro } from "@/lib/gestao/erros-servidor";

/**
 * "Li e concordo" pela página do link (sem login: o código é a chave). Manda ao banco o nome, o IP e o navegador de quem tocou
 * (entrada_aceitar grava uma vez; o freio é de 10 por minuto por entrada).
 */
export const dynamic = "force-dynamic";

const base = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

async function tratar(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = (await req.json().catch(() => null)) as { nome?: unknown } | null;
  if (!codigoDaEntradaValido(token) || !c || typeof c.nome !== "string" || c.nome.trim().length < 2) {
    return Response.json({ erro: "pedido_invalido", mensagem: "Escreva o seu nome." }, { status: 400, headers: base });
  }
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  const r = await aceitarEntrada(token, c.nome.slice(0, 120), ip.slice(0, 64), (req.headers.get("user-agent") ?? "").slice(0, 300));
  if (!r.ok) return Response.json({ erro: "recusado", mensagem: r.mensagem }, { status: r.status, headers: base });
  return Response.json({ aceito_em: r.aceito_em, nome: r.nome }, { headers: base });
}

export const POST = comRegistro("/gestao/entrada/[token]/aceite", tratar);
