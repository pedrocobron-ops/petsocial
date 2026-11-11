import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { bancoDoUsuario, configurado } from "@/lib/gestao/supabase";
import { INSTRUCOES_AJUDA, MARCA_EQUIPE, MARCA_NOVO, procurarTopico } from "@/lib/gestao/ajuda";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Modelo da Ajuda: dúvida de uso é tarefa simples, então usa o modelo mais leve. */
const MODELO = process.env.GESTAO_AJUDA_MODELO ?? "claude-haiku-5-5";
const LIMITE_DIA = Number(process.env.GESTAO_AJUDA_LIMITE_DIA ?? 80);

type Fala = { de: "eu" | "ajuda"; texto: string };
const erro = (status: number, codigo: string, mensagem: string) => NextResponse.json({ erro: codigo, mensagem }, { status });

/**
 * Primeira linha do suporte: responde dúvidas de uso com base no guia.
 * Devolve { texto, equipe, novo | assunto }: `equipe` = true quando o caso deve ir direto para uma pessoa;
 * `novo` (IA) ou `assunto` (busca no guia) dizem se a pessoa mudou de assunto, para a contagem de tentativas recomeçar.
 * Sem a chave da IA, responde pela busca de palavras no mesmo guia.
 */
export async function POST(req: Request) {
  if (!configurado) return erro(503, "sem_banco", "O sistema ainda não está ligado neste endereço.");
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return erro(401, "sem_login", "Entre de novo para usar a ajuda.");
  const corpo = (await req.json().catch(() => null)) as { petshopId?: string; falas?: Fala[] } | null;
  const falas = (Array.isArray(corpo?.falas) ? corpo!.falas : [])
    .filter((f) => (f?.de === "eu" || f?.de === "ajuda") && typeof f.texto === "string" && f.texto.trim())
    .slice(-12).map((f) => ({ de: f.de, texto: f.texto.trim().slice(0, 1200) }));
  while (falas.length && falas[0].de === "ajuda") falas.shift();
  const ultima = falas[falas.length - 1];
  if (!corpo?.petshopId || !ultima || ultima.de !== "eu") return erro(400, "pedido_invalido", "Pedido incompleto.");

  const sb = bancoDoUsuario(token);
  const { data: u } = await sb.auth.getUser(token);
  if (!u.user) return erro(401, "sem_login", "Entre de novo para usar a ajuda.");
  const { data: eu } = await sb.from("profissionais").select("id").eq("petshop_id", corpo.petshopId).eq("user_id", u.user.id).eq("ativo", true).maybeSingle();
  if (!eu) return erro(403, "sem_acesso", "Você não faz parte deste pet shop.");

  const local = () => {
    const t = procurarTopico(ultima.texto);
    return t ? { texto: t.resposta, equipe: false, assunto: t.id } : { texto: "Essa eu não sei responder com certeza. Pode me explicar de outro jeito, ou dizer em qual tela você está?", equipe: false, semResposta: true };
  };

  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json(local());

  const desde = new Date(Date.now() - 864e5).toISOString();
  const { count } = await sb.from("assistente_eventos").select("id", { count: "exact", head: true }).eq("petshop_id", corpo.petshopId).eq("acao", "ajuda").gte("criado_em", desde);
  if ((count ?? 0) >= LIMITE_DIA) return NextResponse.json(local());

  try {
    const cliente = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY ?? "").replace(/[^\x21-\x7E]/g, "") });
    const r = await cliente.messages.create({
      model: MODELO, max_tokens: 500,
      system: [{ type: "text", text: INSTRUCOES_AJUDA, cache_control: { type: "ephemeral" } }],
      messages: falas.map((f) => ({ role: f.de === "eu" ? ("user" as const) : ("assistant" as const), content: f.texto })),
    });
    const bruto = r.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    const equipe = bruto.includes(MARCA_EQUIPE);
    const novo = bruto.includes(MARCA_NOVO);
    const texto = bruto.replace(MARCA_EQUIPE, "").replace(MARCA_NOVO, "").trim();
    // registro para o limite diário; se a conta estiver só para consulta, o registro é recusado e a resposta segue
    await sb.from("assistente_eventos").insert({ petshop_id: corpo.petshopId, user_id: u.user.id, acao: "ajuda", pedido: ultima.texto.slice(0, 300) });
    if (!texto) return NextResponse.json(local());
    return NextResponse.json({ texto, equipe, novo });
  } catch {
    return NextResponse.json(local());
  }
}
