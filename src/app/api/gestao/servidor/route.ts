import { NextResponse } from "next/server";
import { bancoDoUsuario, configurado } from "@/lib/gestao/supabase";
import { segredoDoServidor } from "@/lib/gestao/servidor";

export const runtime = "nodejs";

/**
 * Liga a trava do servidor (painel do administrador, aba Cakto): grava no banco a impressão do segredo do servidor.
 * Quem confere que a pessoa é administradora é o banco (`admin_servidor_segredo`). O segredo nunca volta ao navegador.
 */
export async function POST(req: Request) {
  if (!configurado) return NextResponse.json({ mensagem: "O sistema ainda não está ligado neste endereço." }, { status: 503 });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ mensagem: "Entre de novo." }, { status: 401 });
  const segredo = segredoDoServidor();
  if (!segredo) return NextResponse.json({ mensagem: "O servidor ainda não tem a chave da inteligência artificial (nem GESTAO_SEGREDO_SERVIDOR). Configure e tente de novo." }, { status: 503 });
  const r = await bancoDoUsuario(token).rpc("admin_servidor_segredo", { p_segredo: segredo });
  if (r.error) return NextResponse.json({ mensagem: /restrito/i.test(r.error.message) ? "Acesso restrito." : "Não deu para gravar agora." }, { status: 403 });
  return NextResponse.json({ ok: true });
}
