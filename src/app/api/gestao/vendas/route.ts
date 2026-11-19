import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/gestao/banco";
import { SUPABASE_CHAVE, SUPABASE_URL, configurado } from "@/lib/gestao/supabase";
import { garantirTrava, segredoDoServidor, visitante } from "@/lib/gestao/servidor";
import { INSTRUCOES_VENDAS, MARCA_PESSOA, RESPOSTA_SEM_IA, mandaParaAEquipe } from "@/lib/gestao/vendas";
import { comRegistro, registrarErroServidor } from "@/lib/gestao/erros-servidor";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Modelo do chat de venda: conversa curta, então usa o modelo mais leve. */
const MODELO = process.env.GESTAO_VENDAS_MODELO ?? "claude-haiku-5-5";
/** Freios de gasto: o chat é público (sem login). Estes valem por instância do servidor; o teto que dura (por hora e por dia,
 *  somando tudo) fica no banco (vendas_contar, limites em config_interna). */
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
async function tratar(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { falas?: Fala[] } | null;
  const falas = (Array.isArray(corpo?.falas) ? corpo!.falas : [])
    .filter((f) => (f?.de === "eu" || f?.de === "nina") && typeof f.texto === "string" && f.texto.trim())
    .slice(-12).map((f) => ({ de: f.de, texto: f.texto.trim().slice(0, 600) }));
  while (falas.length && falas[0].de === "nina") falas.shift();
  const ultima = falas[falas.length - 1];
  if (!ultima || ultima.de !== "eu") return NextResponse.json({ erro: "pedido_invalido" }, { status: 400 });

  const semIa = () => NextResponse.json({ texto: RESPOSTA_SEM_IA, pessoa: true });
  const quem = visitante(req);
  if (!process.env.ANTHROPIC_API_KEY || !configurado || !liberado(quem)) return semIa();
  // teto no banco: sem conseguir contar, não chama o modelo
  try {
    const sb = createClient<Database>(SUPABASE_URL, SUPABASE_CHAVE, { auth: { persistSession: false, autoRefreshToken: false } });
    await garantirTrava();
    let conta = await sb.rpc("vendas_contar", { p_segredo: segredoDoServidor() as string, p_visitante: quem });
    // recusou: pode ser o teto do dia ou o banco não conhecer mais o segredo deste servidor. Se a trava precisou ser gravada
    // agora, conta de novo; senão é o teto mesmo.
    if (!conta.error && conta.data !== true && (await garantirTrava(true)) === "gravou") conta = await sb.rpc("vendas_contar", { p_segredo: segredoDoServidor() as string, p_visitante: quem });
    if (conta.error || conta.data !== true) return semIa();
  } catch { return semIa(); }

  try {
    // sem repetir sozinho em 429/5xx (o SDK repete duas vezes por padrão): no chat público, repetir só dobra o gasto
    const cliente = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY ?? "").replace(/[^\x21-\x7E]/g, ""), maxRetries: 0, timeout: 20_000 });
    const pedido = {
      model: MODELO,
      system: [{ type: "text" as const, text: INSTRUCOES_VENDAS, cache_control: { type: "ephemeral" as const } }],
      messages: falas.map((f) => ({ role: f.de === "eu" ? ("user" as const) : ("assistant" as const), content: f.texto })),
    };
    // Conversa de venda não precisa de raciocínio longo: sem "pensar" a resposta sai mais rápida e mais barata.
    // (Com o pensamento ligado ele conta no limite de tokens e a resposta saía cortada ou vazia.)
    // Se o modelo configurado não aceitar desligar (pedido recusado como inválido), tenta de novo com folga no limite.
    // Outros erros (muitos pedidos, fora do ar) não repetem: a pessoa recebe o contato da equipe.
    const r = await cliente.messages.create({ ...pedido, max_tokens: 500, thinking: { type: "disabled" } })
      .catch((e: unknown) => {
        if (e instanceof Anthropic.BadRequestError) return cliente.messages.create({ ...pedido, max_tokens: 3000, output_config: { effort: "low" as const } });
        throw e;
      });
    if (r.stop_reason === "max_tokens" || r.stop_reason === "refusal") return semIa();
    const bruto = r.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    const texto = bruto.replaceAll(MARCA_PESSOA, "").trim();
    if (!texto) return semIa();
    // o botão do WhatsApp aparece com a marca ou quando a resposta manda falar com a equipe (número escrito não é tocável)
    return NextResponse.json({ texto, pessoa: bruto.includes(MARCA_PESSOA) || mandaParaAEquipe(texto) });
  } catch (err) {
    if (!(err instanceof Anthropic.APIError)) await registrarErroServidor("/api/gestao/vendas", err);
    return semIa();
  }
}

export const POST = comRegistro("/api/gestao/vendas", tratar);
