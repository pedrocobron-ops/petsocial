import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/gestao/banco";
import { SUPABASE_CHAVE, SUPABASE_URL, configurado } from "@/lib/gestao/supabase";
import { materialDoAviso } from "@/lib/gestao/escola";
import { comRegistro, erroDoBanco, registrarErroServidor } from "@/lib/gestao/erros-servidor";

export const runtime = "nodejs";

/**
 * Aviso de pagamento da Cakto (webhook): libera, marca como atrasada ou encerra a assinatura do pet shop.
 * Quem confere o segredo e muda o status é a função `cakto_evento` do banco (o segredo fica lá, só como hash).
 * Avisos de compra de um material da Escola de Gestão liberam a leitura do material para o e-mail da compra.
 * Eventos de outros produtos da conta são ignorados se o produto da Gestão estiver gravado no painel do administrador
 * (aba Cakto) ou na variável GESTAO_CAKTO_PRODUTO.
 * Formato conferido na doc da Cakto (docs.cakto.com.br/conceitos/webhooks): corpo { secret, event, data }; `data` é objeto
 * no webhook V1 e lista no V2.
 */
async function tratar(req: Request) {
  if (!configurado) return NextResponse.json({ ok: false }, { status: 503 });
  const corpo = (await req.json().catch(() => null)) as { secret?: unknown; event?: unknown; data?: unknown } | null;
  if (!corpo || typeof corpo.secret !== "string" || typeof corpo.event !== "string") return NextResponse.json({ ok: false }, { status: 400 });

  // a versão nova do webhook manda `data` como lista (pedido principal e extras): o principal vem primeiro
  const lista = (Array.isArray(corpo.data) ? corpo.data : [corpo.data]) as Record<string, unknown>[];
  const sb = createClient<Database>(SUPABASE_URL, SUPABASE_CHAVE, { auth: { persistSession: false } });

  // Escola de Gestão: compra de um material (como pedido principal ou como extra) libera a leitura dentro do sistema
  let daEscola = 0;
  for (const item of lista) {
    if (!item) continue;
    const m = materialDoAviso(item);
    if (!m) continue;
    daEscola++;
    const comprador = (item.customer ?? {}) as { email?: string };
    const emailItem = typeof comprador.email === "string" ? comprador.email : typeof item.customerEmail === "string" ? item.customerEmail : null;
    const r = await sb.rpc("escola_evento", { p_segredo: corpo.secret, p_evento: corpo.event, p_email: emailItem as string, p_slug: m.slug, p_pedido: (typeof item.id === "string" ? item.id : undefined) });
    if (r.error) { await registrarErroServidor("/api/gestao/cakto", erroDoBanco(r.error, "escola_evento")); return NextResponse.json({ ok: false }, { status: 500 }); }
    if (r.data === "recusado") return NextResponse.json({ ok: false }, { status: 401 });
  }
  if (daEscola === lista.filter(Boolean).length && daEscola > 0) return NextResponse.json({ ok: true, resultado: "escola" });

  const resto = lista.filter((d) => d && !materialDoAviso(d));
  const dados = resto.find((d) => d.offer_type === "main" || d.offer_type === undefined) ?? resto[0] ?? {};
  const produto = (dados.product ?? {}) as { id?: string; short_id?: string };
  const soProduto = process.env.GESTAO_CAKTO_PRODUTO;
  if (soProduto && produto.id !== soProduto && produto.short_id !== soProduto) return NextResponse.json({ ok: true, resultado: "outro_produto" });

  const cliente = (dados.customer ?? {}) as { email?: string };
  const assinatura = (dados.subscription ?? null) as { id?: string | number } | null;
  const oferta = (dados.offer ?? null) as { id?: string } | null;
  const email = typeof cliente.email === "string" ? cliente.email : typeof dados.customerEmail === "string" ? dados.customerEmail : null;
  const idAssinatura = assinatura?.id != null ? String(assinatura.id) : null;
  const texto = (v: unknown) => (typeof v === "string" && v ? v : null);

  const { data, error } = await sb.rpc("cakto_evento", {
    p_segredo: corpo.secret, p_evento: corpo.event, p_email: email as string,
    p_assinatura: idAssinatura as string,
    p_oferta: texto(oferta?.id) as string,
    // o link de pagamento leva ?callback=<id do pet shop>: casa a compra com a conta mesmo com outro e-mail
    p_callback: texto(dados.callback) as string,
    // com o produto da Gestão gravado no painel, avisos de outros produtos são ignorados no banco
    p_produto: texto(produto.id) as string,
    p_produto_curto: texto(produto.short_id) as string,
    // guarda só o necessário para conferir depois (sem documento nem telefone do comprador)
    p_payload: { oferta: oferta?.id ?? null, assinatura: idAssinatura, pedido: dados.id ?? null, status: dados.status ?? null, produto: produto.short_id ?? produto.id ?? null, valor: dados.amount ?? null, metodo: dados.paymentMethod ?? null } as never,
  });
  if (error) { await registrarErroServidor("/api/gestao/cakto", erroDoBanco(error, "cakto_evento")); return NextResponse.json({ ok: false }, { status: 500 }); }
  if (data === "recusado") return NextResponse.json({ ok: false }, { status: 401 });
  return NextResponse.json({ ok: true, resultado: data });
}

export const POST = comRegistro("/api/gestao/cakto", tratar);
