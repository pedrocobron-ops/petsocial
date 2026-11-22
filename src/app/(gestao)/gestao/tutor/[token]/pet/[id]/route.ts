import { buscarFotoDoPet } from "@/lib/gestao/fotos-servidor";
import { comRegistro, registrarErroServidor } from "@/lib/gestao/erros-servidor";

/** A foto do cadastro de um pet na página do tutor: o banco confere o código e o pet a cada pedido (ver fotos-servidor.ts). */
export const dynamic = "force-dynamic";

async function tratar(_req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const f = await buscarFotoDoPet(token, id);
  const base = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };
  if (f.estado === "ok") return new Response(f.corpo, { headers: { ...base, "Content-Type": f.tipo, "Cache-Control": "private, max-age=3600" } });
  const status = f.estado === "nao" ? 404 : f.estado === "devagar" ? 429 : 502;
  if (status === 502) await registrarErroServidor("/gestao/tutor/[token]/pet/[id]", Object.assign(new Error("A foto do pet não foi entregue na página do tutor"), { name: "FotoDoPet" }));
  return new Response(status === 429 ? "Muitos acessos. Espere um minuto." : "Foto indisponível.",
    { status, headers: { ...base, "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

export const GET = comRegistro("/gestao/tutor/[token]/pet/[id]", tratar);
