import { NextResponse } from "next/server";
import { visitante } from "@/lib/gestao/servidor";

/** Formulário do Google que recebe os cadastros (as respostas caem numa planilha da conta da Maestro Pet). */
const FORM = "https://docs.google.com/forms/d/e/1FAIpQLScbh_y1nrAZbee81OOUGP_0tKXQ2l41ri0Tqu7Yb-6hs6cGAg/formResponse";
const CAMPOS = { nome: "entry.1743077274", email: "entry.514587458", cao: "entry.126728612" } as const;

/**
 * Recebe a ficha do guia grátis e repassa para o Formulário do Google pelo servidor.
 * Enviar direto do navegador para o Google falhava em alguns celulares (bloqueio de envio entre sites).
 */
/**
 * Só aceita envios do próprio site: produção, a prévia deste mesmo projeto na Vercel (o endereço que a Vercel dá ao
 * deploy, e não qualquer *.vercel.app) e testes locais fora da Vercel.
 */
function origemPermitida(req: Request) {
  const origem = req.headers.get("origin");
  if (!origem) return false;
  try {
    const host = new URL(origem).hostname;
    if (host === "maestropet.com" || host === "www.maestropet.com") return true;
    const daVercel = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].filter(Boolean) as string[];
    if (daVercel.includes(host)) return true;
    return !process.env.VERCEL && (host === "localhost" || host === "127.0.0.1");
  } catch {
    return false;
  }
}

/** Freio por endereço de internet (por instância do servidor): o cabeçalho de origem um robô inventa, então conta também. */
const POR_REDE = 5, POR_HORA = 120, HORA = 36e5;
const envios = new Map<string, number[]>();
function dentroDoLimite(rede: string) {
  const agora = Date.now();
  const limpar = (k: string) => { const v = (envios.get(k) ?? []).filter((t) => agora - t < HORA); envios.set(k, v); return v; };
  if (envios.size > 5000) envios.clear();
  const meu = limpar(rede), todos = limpar("*");
  if (meu.length >= POR_REDE || todos.length >= POR_HORA) return false;
  meu.push(agora); todos.push(agora);
  return true;
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
  // muitos envios da mesma rede (ou no total) em uma hora: responde que é para tentar depois, sem repassar ao Google
  if (!dentroDoLimite(visitante(req))) return NextResponse.json({ ok: false, erro: "muitos envios" }, { status: 429 });
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
