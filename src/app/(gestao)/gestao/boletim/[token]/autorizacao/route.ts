import { autorizarFoto, codigoDoBoletimValido, type EscopoDaFoto } from "@/lib/gestao/boletim-servidor";
import { comRegistro } from "@/lib/gestao/erros-servidor";

/**
 * O tutor autoriza postar a foto do pet, pela página do boletim (sem login: o código do boletim é a chave). O banco confere o
 * boletim, freia (5 por minuto por boletim, 60 por pet shop) e guarda o texto exato que ele montou (boletim_autorizar).
 */
export const dynamic = "force-dynamic";

const base = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };

async function tratar(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const c = (await req.json().catch(() => null)) as { escopo?: unknown; marcar?: unknown } | null;
  const escopo = c?.escopo as EscopoDaFoto;
  if (!codigoDoBoletimValido(token) || !c || (escopo !== "boletim" && escopo !== "todas") || (c.marcar != null && typeof c.marcar !== "string")) {
    return Response.json({ erro: "pedido_invalido", mensagem: "Escolha quais fotos podemos postar." }, { status: 400, headers: base });
  }
  const r = await autorizarFoto(token, escopo, typeof c.marcar === "string" ? c.marcar.slice(0, 80) : "");
  if (!r.ok) return Response.json({ erro: "recusado", mensagem: r.mensagem }, { status: r.status, headers: base });
  return Response.json(r.dados, { headers: base });
}

export const POST = comRegistro("/gestao/boletim/[token]/autorizacao", tratar);
