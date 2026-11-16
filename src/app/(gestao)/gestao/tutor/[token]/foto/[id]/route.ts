import { buscarFoto } from "@/lib/gestao/tutor-servidor";
import { comRegistro, registrarErroServidor } from "@/lib/gestao/erros-servidor";

/** Uma foto da página do tutor: o servidor confere o link a cada foto e entrega o arquivo (ver tutor-servidor.ts). */
export const dynamic = "force-dynamic";

async function tratar(_req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const f = await buscarFoto(token, id);
  const base = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };
  if (f.estado === "ok") {
    return new Response(f.corpo, { headers: { ...base, "Content-Type": f.tipo, "Cache-Control": "private, max-age=3600", "X-Foto-Caminho": f.caminho } });
  }
  const status = f.estado === "nao" ? 404 : f.estado === "devagar" ? 429 : 502;
  if (status === 502) await registrarErroServidor("/gestao/tutor/[token]/foto/[id]", Object.assign(new Error("A foto do tutor não foi entregue por nenhum dos dois caminhos"), { name: "FotoDoTutor" }));
  return new Response(status === 429 ? "Muitos acessos. Espere um minuto." : "Foto indisponível.",
    { status, headers: { ...base, "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

export const GET = comRegistro("/gestao/tutor/[token]/foto/[id]", tratar);
