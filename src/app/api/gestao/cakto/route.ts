import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/gestao/banco";
import { SUPABASE_CHAVE, SUPABASE_URL, configurado } from "@/lib/gestao/supabase";

export const runtime = "nodejs";

/**
 * Aviso de pagamento da Cakto (webhook): libera, marca como atrasada ou encerra a assinatura do pet shop.
 * Quem confere o segredo e muda o status é a função `cakto_evento` do banco (o segredo fica lá, só como hash).
 * Se GESTAO_CAKTO_PRODUTO estiver definido, eventos de outros produtos da conta são ignorados.
 */
export async function POST(req: Request) {
  if (!configurado) return NextResponse.json({ ok: false }, { status: 503 });
  const corpo = (await req.json().catch(() => null)) as { secret?: unknown; event?: unknown; data?: unknown } | null;
  if (!corpo || typeof corpo.secret !== "string" || typeof corpo.event !== "string") return NextResponse.json({ ok: false }, { status: 400 });

  // a versão nova do webhook manda `data` como lista (pedido principal e extras): o principal vem primeiro
  const lista = (Array.isArray(corpo.data) ? corpo.data : [corpo.data]) as Record<string, unknown>[];
  const dados = lista.find((d) => d && (d.offer_type === "main" || d.offer_type === undefined)) ?? lista[0] ?? {};
  const produto = (dados.product ?? {}) as { id?: string; short_id?: string };
  const soProduto = process.env.GESTAO_CAKTO_PRODUTO;
  if (soProduto && produto.id !== soProduto && produto.short_id !== soProduto) return NextResponse.json({ ok: true, resultado: "outro_produto" });

  const cliente = (dados.customer ?? {}) as { email?: string };
  const assinatura = (dados.subscription ?? null) as { id?: string | number } | null;
  const oferta = (dados.offer ?? null) as { id?: string } | null;
  const email = typeof cliente.email === "string" ? cliente.email : typeof dados.customerEmail === "string" ? dados.customerEmail : null;

  const sb = createClient<Database>(SUPABASE_URL, SUPABASE_CHAVE, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc("cakto_evento", {
    p_segredo: corpo.secret, p_evento: corpo.event, p_email: email as string,
    p_assinatura: (assinatura?.id != null ? String(assinatura.id) : null) as string,
    // guarda só o necessário para conferir depois (sem documento nem telefone do comprador)
    p_oferta: (typeof oferta?.id === "string" ? oferta.id : null) as string,
    p_payload: { oferta: oferta?.id ?? null, pedido: dados.id ?? null, status: dados.status ?? null, produto: produto.short_id ?? produto.id ?? null, valor: dados.amount ?? null, metodo: dados.paymentMethod ?? null } as never,
  });
  if (error) return NextResponse.json({ ok: false }, { status: 500 });
  if (data === "recusado") return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, resultado: data });
}
