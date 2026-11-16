import { buscarFoto } from "@/lib/gestao/tutor-servidor";

/**
 * Conferência para o dono (botão em Meu pet shop › Cuidado com o tutor › Página do tutor): com o link de um tutor e uma foto
 * dele, tenta os dois caminhos de entrega da foto e diz qual funciona neste servidor. Não marca a página como aberta.
 * Responde só "ok" ou o motivo por caminho (quem tem o link já pode ver a foto).
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const foto = new URL(req.url).searchParams.get("foto") ?? "";
  const ler = async (so: "principal" | "reserva") => {
    const f = await buscarFoto(token, foto, so);
    if (f.estado === "ok") { void f.corpo?.cancel(); return "ok"; }
    return f.estado;
  };
  const principal = await ler("principal");
  const reserva = principal === "nao" ? "nao" : await ler("reserva");
  return Response.json({ principal, reserva }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}
