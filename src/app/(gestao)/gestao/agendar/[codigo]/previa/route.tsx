import { ImageResponse } from "next/og";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/gestao/banco";
import { SUPABASE_CHAVE, SUPABASE_URL, configurado } from "@/lib/gestao/supabase";
import { corPropria, TEMAS } from "@/lib/gestao/identidade";
import { iniciais } from "@/lib/gestao/util";

/**
 * A imagem da prévia do link (WhatsApp, Instagram) quando o pet shop não subiu logo: um cartão neutro com as iniciais e o
 * nome do pet shop, nas cores dele. Sem marca da Maestro Pet. Lê só o nome e as cores, pelas funções públicas do link.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limpo = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

export async function GET(req: Request, { params }: { params: Promise<{ codigo: string }> }) {
  let codigo = "";
  try { codigo = decodeURIComponent((await params).codigo ?? "").trim().toLowerCase(); } catch { codigo = ""; }
  let nome = "", tema: string | null = null;
  // "neutra": o cartão sem nome (página do tutor de quem não subiu logo: o código do link não aparece nela)
  const doTutor = new URL(req.url).searchParams.get("t") === "tutor";
  if (configurado && codigo !== "neutra" && /^[a-z0-9_-]{4,40}$/.test(codigo)) {
    try {
      const sb = createClient<Database>(SUPABASE_URL, SUPABASE_CHAVE, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (u, i) => fetch(u, { ...i, cache: "no-store", signal: AbortSignal.timeout(5000) }) } });
      const [n, info] = await Promise.all([sb.rpc("link_nome", { p_codigo: codigo }), sb.rpc("link_info", { p_codigo: codigo })]);
      nome = limpo(n.data, 60);
      tema = (info.data as { tema?: string | null } | null)?.tema ?? null;
    } catch { /* sem o banco: sai o cartão sem nome */ }
  }
  const propria = corPropria(tema);
  const pronta = !propria && tema ? TEMAS.find((x) => x.id === tema) : undefined;
  const cor = propria?.tema ?? pronta?.tema ?? "#1e3a2f";
  const destaque = propria?.destaque ?? pronta?.destaque ?? "#f97316";
  const titulo = nome || "Pet shop";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", gap: 56, padding: "0 90px", background: "#f6f1e8", color: "#1f1b17", fontFamily: "sans-serif" }}>
        <div style={{ width: 260, height: 260, borderRadius: 68, background: cor, color: "#f6f1e8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 112, fontWeight: 700, flexShrink: 0 }}>
          {iniciais(titulo)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
          <div style={{ fontSize: titulo.length > 28 ? 60 : 78, fontWeight: 700, lineHeight: 1.08, display: "flex" }}>{titulo}</div>
          <div style={{ fontSize: 38, color: "#5b554d", display: "flex" }}>{doTutor ? "Página do tutor" : "Peça seu horário pelo link"}</div>
          <div style={{ width: 150, height: 10, borderRadius: 5, background: destaque, display: "flex" }} />
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "cache-control": "public, max-age=3600", "x-robots-tag": "noindex" } },
  );
}
