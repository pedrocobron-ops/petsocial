import { NextResponse } from "next/server";

/** Formulário do Google que recebe os cadastros (as respostas caem numa planilha da conta da Maestro Pet). */
const FORM = "https://docs.google.com/forms/d/e/1FAIpQLScbh_y1nrAZbee81OOUGP_0tKXQ2l41ri0Tqu7Yb-6hs6cGAg/formResponse";
const CAMPOS = { nome: "entry.1743077274", email: "entry.514587458", cao: "entry.126728612" } as const;

/**
 * Recebe a ficha do guia grátis e repassa para o Formulário do Google pelo servidor.
 * Enviar direto do navegador para o Google falhava em alguns celulares (bloqueio de envio entre sites).
 */
/** Só aceita envios do próprio site (produção, prévias da Vercel e testes locais). */
function origemPermitida(req: Request) {
  const origem = req.headers.get("origin");
  if (!origem) return false;
  try {
    const host = new URL(origem).hostname;
    return host === "maestropet.com" || host === "www.maestropet.com" || host.endsWith(".vercel.app") || host === "localhost";
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  if (!origemPermitida(req) || !req.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const dados = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  // Campo-armadilha preenchido = robô: responde ok sem gravar.
  if (String(dados?.site ?? "").trim()) return NextResponse.json({ ok: true });
  const campo = (k: string) => String(dados?.[k] ?? "").trim().slice(0, 200);
  const nome = campo("nome");
  const email = campo("email");
  if (!nome || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, erro: "dados inválidos" }, { status: 400 });
  }
  const corpo = new URLSearchParams({ [CAMPOS.nome]: nome, [CAMPOS.email]: email, [CAMPOS.cao]: campo("cao") });
  try {
    const r = await fetch(FORM, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: corpo,
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    // O Google responde 200 (página de "resposta registrada") ou um redirecionamento; 4xx/5xx é falha.
    const ok = r.status < 400;
    if (!ok) console.error("cadastro: Google Forms respondeu", r.status);
    return NextResponse.json({ ok }, { status: ok ? 200 : 502 });
  } catch (e) {
    console.error("cadastro: falha ao enviar para o Google Forms", e);
    return NextResponse.json({ ok: false }, { status: 502 });
  }
}
