import { buscarFotoDaEntrada } from "@/lib/gestao/entrada-servidor";
import { comRegistro, registrarErroServidor } from "@/lib/gestao/erros-servidor";

/** Uma foto da entrada (0 a 3): o servidor confere o código a cada foto e entrega o arquivo (ver entrada-servidor.ts). */
export const dynamic = "force-dynamic";

async function tratar(_req: Request, { params }: { params: Promise<{ token: string; n: string }> }) {
  const { token, n } = await params;
  const f = await buscarFotoDaEntrada(token, /^\d$/.test(n) ? Number(n) : -1);
  const base = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };
  if (f.estado === "ok") return new Response(f.corpo, { headers: { ...base, "Content-Type": f.tipo, "Cache-Control": "private, max-age=3600" } });
  const status = f.estado === "nao" ? 404 : f.estado === "devagar" ? 429 : 502;
  if (status === 502) await registrarErroServidor("/gestao/entrada/[token]/foto/[n]", Object.assign(new Error("A foto da entrada não foi entregue"), { name: "FotoDaEntrada" }));
  return new Response(status === 429 ? "Muitos acessos. Espere um minuto." : "Foto indisponível.",
    { status, headers: { ...base, "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

export const GET = comRegistro("/gestao/entrada/[token]/foto/[n]", tratar);
