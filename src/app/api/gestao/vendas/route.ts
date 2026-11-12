import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { INSTRUCOES_VENDAS, MARCA_PESSOA, RESPOSTA_SEM_IA } from "@/lib/gestao/vendas";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Modelo do chat de venda: conversa curta, então usa o modelo mais leve. */
const MODELO = process.env.GESTAO_VENDAS_MODELO ?? "claude-haiku-5-5";
/** Freios de gasto: o chat é público (sem login). Valem por instância do servidor. */
const POR_VISITANTE = Number(process.env.GESTAO_VENDAS_LIMITE_VISITANTE ?? 30); // mensagens por hora, por endereço
const POR_HORA = Number(process.env.GESTAO_VENDAS_LIMITE_HORA ?? 400); // mensagens por hora, somando todo mundo

type Fala = { de: "eu" | "nina"; texto: string };
const uso = new Map<string, number[]>();
const HORA = 36e5;

function liberado(ip: string) {
  const agora = Date.now();
  const limpar = (k: string) => { const v = (uso.get(k) ?? []).filter((t) => agora - t < HORA); uso.set(k, v); return v; };
  if (uso.size > 5000) uso.clear();
  const meu = limpar(ip), todos = limpar("*");
  if (meu.length >= POR_VISITANTE || todos.length >= POR_HORA) return false;
  meu.push(agora); todos.push(agora);
  return true;
}

/** Chat de venda da página /gestao: público, sem login e sem acesso a dado de cliente. Devolve { texto, pessoa }. */
export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { falas?: Fala[] } | null;
  const falas = (Array.isArray(corpo?.falas) ? corpo!.falas : [])
    .filter((f) => (f?.de === "eu" || f?.de === "nina") && typeof f.texto === "string" && f.texto.trim())
    .slice(-12).map((f) => ({ de: f.de, texto: f.texto.trim().slice(0, 600) }));
  while (falas.length && falas[0].de === "nina") falas.shift();
  const ultima = falas[falas.length - 1];
  if (!ultima || ultima.de !== "eu") return NextResponse.json({ erro: "pedido_invalido" }, { status: 400 });

  const semIa = () => NextResponse.json({ texto: RESPOSTA_SEM_IA, pessoa: true });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "sem-ip";
  if (!process.env.ANTHROPIC_API_KEY || !liberado(ip)) return semIa();

  try {
    const cliente = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY ?? "").replace(/[^\x21-\x7E]/g, "") });
    const r = await cliente.messages.create({
      model: MODELO, max_tokens: 400,
      system: [{ type: "text", text: INSTRUCOES_VENDAS, cache_control: { type: "ephemeral" } }],
      messages: falas.map((f) => ({ role: f.de === "eu" ? ("user" as const) : ("assistant" as const), content: f.texto })),
    });
    const bruto = r.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    const texto = bruto.replace(MARCA_PESSOA, "").trim();
    if (!texto) return semIa();
    return NextResponse.json({ texto, pessoa: bruto.includes(MARCA_PESSOA) });
  } catch {
    return semIa();
  }
}
