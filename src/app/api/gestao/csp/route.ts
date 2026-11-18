export const runtime = "nodejs";

/**
 * Recebe os avisos do navegador quando uma página tenta carregar algo fora da lista (Content-Security-Policy-Report-Only,
 * em next.config.ts). Só escreve no registro do servidor (Vercel → Logs, procure por "[csp]"): o que foi barrado, em qual
 * regra e em qual página, sem o endereço completo (as páginas públicas levam código no endereço).
 * Público e sem login (é o navegador que manda), então tem teto: 60 avisos por minuto por instância, corpo de até 8 KB.
 */
let janela = 0, vistos = 0;

const semCodigo = (u: unknown) => {
  const t = typeof u === "string" ? u : "";
  try { const x = new URL(t); return `${x.origin}${x.pathname.split("/").slice(0, 3).join("/")}`.slice(0, 120); } catch { return t.slice(0, 40); }
};

export async function POST(req: Request) {
  const agora = Math.floor(Date.now() / 60_000);
  if (agora !== janela) { janela = agora; vistos = 0; }
  if (++vistos > 60) return new Response(null, { status: 204 });
  const bruto = (await req.text().catch(() => "")).slice(0, 8000);
  try {
    const j = JSON.parse(bruto) as Record<string, unknown> | Record<string, unknown>[];
    const r = (Array.isArray(j) ? (j[0]?.body as Record<string, unknown>) : (j["csp-report"] as Record<string, unknown>)) ?? {};
    const regra = String(r["effective-directive"] ?? r["violated-directive"] ?? r.effectiveDirective ?? "").slice(0, 60);
    const barrado = semCodigo(r["blocked-uri"] ?? r.blockedURL);
    const pagina = semCodigo(r["document-uri"] ?? r.documentURL);
    if (regra) console.warn(`[csp] ${regra} barraria ${barrado || "(em linha)"} em ${pagina}`);
  } catch { /* aviso com formato estranho: ignora */ }
  return new Response(null, { status: 204 });
}
