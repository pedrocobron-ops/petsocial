import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { bancoDoUsuario, configurado } from "@/lib/gestao/supabase";
import { comRegistro, erroDoBanco, registrarErroServidor } from "@/lib/gestao/erros-servidor";
import { chipsDo, dadosParaOModelo, INSTRUCOES_BOLETIM, limparTextoDoModelo, textoModelo, type DadosDoTexto, type TipoDoBoletim } from "@/lib/gestao/boletim";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Modelo do texto do boletim (variável na Vercel). */
const MODELO = process.env.GESTAO_BOLETIM_MODELO ?? "claude-opus-5-5";
/** Só para testes automáticos: escreve o texto sem chamar o modelo. Nunca vale na Vercel. */
const DE_TESTE = process.env.GESTAO_BOLETIM_FALSO === "1" && !process.env.VERCEL;

type Corpo = { petshopId?: unknown; petId?: unknown; tipo?: unknown; servicos?: unknown; chips?: unknown; amigo?: unknown; nota?: unknown };
type Saida = { texto: string; ia: boolean; motivo?: "limite" | "fora" };
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");

/**
 * "Escrever com o Mozart" no boletim do pet. Quem chama é alguém da equipe, com o login (a contagem do dia confere a área).
 * O modelo recebe só o nome do pet shop e do pet, o tipo da visita, os recados marcados e a nota: nada do tutor.
 * Sem IA (limite do dia, fora do ar, recusa), devolve o texto do modelo pronto com `ia: false`: o boletim nunca trava.
 */
async function tratar(req: Request) {
  if (!configurado) return NextResponse.json({ erro: "sem_banco" }, { status: 503 });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ erro: "sem_login", mensagem: "Entre de novo para usar o Mozart." }, { status: 401 });
  const c = (await req.json().catch(() => null)) as Corpo | null;
  const tipo = c?.tipo as TipoDoBoletim;
  if (!c || !uuid(c.petshopId) || !uuid(c.petId) || !["banho", "creche", "hotel"].includes(tipo)) return NextResponse.json({ erro: "pedido_invalido" }, { status: 400 });
  const validos = new Set(chipsDo(tipo).map((x) => x.id));
  const chips = Array.isArray(c.chips) ? [...new Set(c.chips.filter((x): x is string => typeof x === "string" && validos.has(x)))] : [];

  // o pet e o pet shop vêm do banco, com o login da pessoa (as regras do banco conferem que ela é da equipe)
  const sb = bancoDoUsuario(token);
  const [pet, loja] = await Promise.all([
    sb.from("pets").select("nome, sexo").eq("id", c.petId).eq("petshop_id", c.petshopId).maybeSingle(),
    sb.from("petshops").select("nome").eq("id", c.petshopId).maybeSingle(),
  ]);
  if (!pet.data || !loja.data) return NextResponse.json({ erro: "sem_acesso", mensagem: "Pet não encontrado." }, { status: 403 });
  const d: DadosDoTexto = {
    tipo, pet: pet.data.nome, sexo: pet.data.sexo, petshop: loja.data.nome,
    servicos: tipo === "banho" ? texto(c.servicos, 120) || null : null,
    chips, amigo: texto(c.amigo, 40), nota: texto(c.nota, 400),
  };
  const modelo = (motivo?: Saida["motivo"]) => NextResponse.json({ texto: textoModelo(d), ia: false, motivo } satisfies Saida);

  if (!DE_TESTE && !process.env.ANTHROPIC_API_KEY) { console.error("[boletim] sem ANTHROPIC_API_KEY"); return modelo("fora"); }
  const conta = await sb.rpc("boletim_ia_contar", { p_petshop: c.petshopId });
  if (conta.error) { await registrarErroServidor("/api/gestao/boletim", erroDoBanco(conta.error, "boletim_ia_contar"), { petshop: c.petshopId }); return modelo("fora"); }
  const r = conta.data as { ok?: boolean; motivo?: string } | null;
  if (!r?.ok) return r?.motivo === "sem_acesso" ? NextResponse.json({ erro: "sem_acesso", mensagem: "Sem acesso." }, { status: 403 }) : modelo("limite");

  if (DE_TESTE) return NextResponse.json({ texto: `${textoModelo(d)} (texto de teste)`, ia: true } satisfies Saida);
  try {
    const cliente = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY ?? "").replace(/[^\x21-\x7E]/g, ""), maxRetries: 1, timeout: 25_000 });
    const comFallback = /^claude-(opus-5-5|fable-5-2)/.test(MODELO);
    const m = await cliente.beta.messages.create({
      model: MODELO,
      max_tokens: 2000,
      output_config: { effort: "low" },
      ...(comFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      system: [{ type: "text", text: INSTRUCOES_BOLETIM, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: `<dados>\n${dadosParaOModelo(d)}\n</dados>\nEscreva o boletim.` }],
    });
    if (m.stop_reason === "refusal" || m.stop_reason === "max_tokens") return modelo("fora");
    const t = limparTextoDoModelo(m.content.map((b) => (b.type === "text" ? b.text : "")).join(" "));
    return t ? NextResponse.json({ texto: t, ia: true } satisfies Saida) : modelo("fora");
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) console.error("[boletim] chave recusada pela Anthropic");
    else if (!(err instanceof Anthropic.APIError)) await registrarErroServidor("/api/gestao/boletim", err, { petshop: c.petshopId });
    return modelo("fora");
  }
}

export const POST = comRegistro("/api/gestao/boletim", tratar);
