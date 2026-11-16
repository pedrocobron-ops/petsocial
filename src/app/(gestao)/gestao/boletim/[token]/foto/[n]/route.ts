import { buscarFotoDoBoletim } from "@/lib/gestao/boletim-servidor";
import { comRegistro, registrarErroServidor } from "@/lib/gestao/erros-servidor";

/** Uma foto do boletim (0 a 3): o servidor confere o código a cada foto e entrega o arquivo (ver boletim-servidor.ts). */
export const dynamic = "force-dynamic";

async function tratar(_req: Request, { params }: { params: Promise<{ token: string; n: string }> }) {
  const { token, n } = await params;
  const f = await buscarFotoDoBoletim(token, /^\d$/.test(n) ? Number(n) : -1);
  const base = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex" };
  if (f.estado === "ok") return new Response(f.corpo, { headers: { ...base, "Content-Type": f.tipo, "Cache-Control": "private, max-age=3600" } });
  const status = f.estado === "nao" ? 404 : f.estado === "devagar" ? 429 : 502;
  if (status === 502) await registrarErroServidor("/gestao/boletim/[token]/foto/[n]", Object.assign(new Error("A foto do boletim não foi entregue"), { name: "FotoDoBoletim" }));
  return new Response(status === 429 ? "Muitos acessos. Espere um minuto." : "Foto indisponível.",
    { status, headers: { ...base, "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

export const GET = comRegistro("/gestao/boletim/[token]/foto/[n]", tratar);
