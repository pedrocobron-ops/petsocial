import { buscarLogo } from "@/lib/gestao/fotos-servidor";
import { comRegistro } from "@/lib/gestao/erros-servidor";

/** A logo do pet shop (bucket `pets`, privado): o servidor busca o arquivo e entrega os bytes (ver fotos-servidor.ts). */
export const dynamic = "force-dynamic";

async function tratar(_req: Request, { params }: { params: Promise<{ petshop: string; arquivo: string }> }) {
  const { petshop, arquivo } = await params;
  const f = await buscarLogo(`${petshop}/${arquivo}`);
  const base = { "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };
  // o nome do arquivo é aleatório e muda a cada troca de logo: pode guardar
  if (f.estado === "ok") return new Response(f.corpo, { headers: { ...base, "Content-Type": f.tipo, "Cache-Control": "public, max-age=86400" } });
  return new Response("Logo indisponível.", { status: f.estado === "nao" ? 404 : 502, headers: { ...base, "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

export const GET = comRegistro("/gestao/marca/[petshop]/[arquivo]", tratar);
