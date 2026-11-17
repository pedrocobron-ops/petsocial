import { codigoDaAutorizacaoValido, retirarAutorizacao } from "@/lib/gestao/boletim-servidor";
import { comRegistro } from "@/lib/gestao/erros-servidor";

/** "Não quero mais": o tutor tira a autorização de postar as fotos do pet (todas as que estão valendo). Freio de 10 por minuto. */
export const dynamic = "force-dynamic";

const base = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

async function tratar(_req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  if (!codigoDaAutorizacaoValido(codigo)) return Response.json({ erro: "pedido_invalido", mensagem: "Link inválido." }, { status: 404, headers: base });
  const r = await retirarAutorizacao(codigo);
  if (!r.ok) return Response.json({ erro: "recusado", mensagem: r.mensagem }, { status: r.status === 400 ? 404 : r.status, headers: base });
  return Response.json(r.dados, { headers: base });
}

export const POST = comRegistro("/gestao/autorizacao/[codigo]/retirar", tratar);
