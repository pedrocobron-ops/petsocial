import { NextResponse } from "next/server";
import { garantirTrava, segredoDoServidor } from "@/lib/gestao/servidor";
import Anthropic from "@anthropic-ai/sdk";
import { bancoDoUsuario, configurado } from "@/lib/gestao/supabase";
import { INSTRUCOES_AJUDA, lerRespostaDaAjuda, procurarTopico } from "@/lib/gestao/ajuda";
import { topicosPara } from "@/lib/gestao/manual";
import { nomeDaCasa } from "@/lib/gestao/modulos";
import { comRegistro, registrarErroServidor } from "@/lib/gestao/erros-servidor";

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
async function tratar(req: Request) {
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

  // sem a IA, a resposta sai do manual: primeiro entre os tópicos do que este pet shop usa (com os passos dele);
  // se nenhum combina, entre todos (quem só tem creche também pode perguntar da agenda)
  const local = async () => {
    const { data: loja } = await sb.from("petshops").select("modulos, principal").eq("id", corpo.petshopId!).maybeSingle();
    const t = (loja ? procurarTopico(ultima.texto, topicosPara(loja)) : null) ?? procurarTopico(ultima.texto);
    return t ? { texto: t.resposta, equipe: false, assunto: t.id } : { texto: "Essa eu não sei responder com certeza. Pode me explicar de outro jeito, ou dizer em qual tela você está?", equipe: false, semResposta: true };
  };

  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json(await local());

  // a contagem do dia fica no banco (por pet shop e somando todos; a conta só para consulta não usa a IA); se o banco
  // recusar ou não der para contar, responde pelo manual
  await garantirTrava();
  const args = { p_petshop: corpo.petshopId, p_canal: "ajuda", p_tipo: "pedido", p_limite: LIMITE_DIA };
  const v2 = await sb.rpc("assistente_contar_v2", { ...args, p_segredo: segredoDoServidor() ?? undefined });
  // banco sem a função nova (antes da migração 20261228): a contagem de antes
  const contou = !v2.error ? (v2.data as { ok?: boolean } | null)?.ok === true
    : (v2.error.code === "PGRST202" || v2.error.code === "42883") && (await sb.rpc("assistente_contar", args)).data === true;
  if (!contou) return NextResponse.json(await local());

  try {
    const cliente = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY ?? "").replace(/[^\x21-\x7E]/g, "") });
    const r = await cliente.messages.create({
      // o raciocínio do modelo conta no limite de tokens: folga para ele e esforço baixo (dúvida de uso é simples)
      model: MODELO, max_tokens: 3000, output_config: { effort: "low" },
      system: [{ type: "text", text: INSTRUCOES_AJUDA, cache_control: { type: "ephemeral" } }],
      messages: falas.map((f) => ({ role: f.de === "eu" ? ("user" as const) : ("assistant" as const), content: f.texto })),
    });
    // resposta cortada (pode ter perdido a marca de chamar a equipe) ou recusada: responde pelo manual
    if (r.stop_reason === "max_tokens" || r.stop_reason === "refusal") return NextResponse.json(await local());
    const bruto = r.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    // marcas só sozinhas numa linha; comentário do modelo sobre elas ("[EQUIPE] não é necessário…") sai da resposta
    const lida = lerRespostaDaAjuda(bruto);
    const { equipe, novo } = lida;
    // o menu diz "Creche" (ou "Hotel") para quem usa só uma das duas: a resposta fala o nome que a pessoa vê
    const { data: modulos } = bruto.includes("Creche e hotel") ? await sb.from("petshops").select("modulos, principal").eq("id", corpo.petshopId!).maybeSingle() : { data: null };
    const texto = lida.texto.replaceAll("Creche e hotel", modulos ? nomeDaCasa(modulos) : "Creche e hotel").trim();
    // registro do que foi perguntado (o limite do dia já foi contado acima; se a conta estiver só para consulta, o registro é recusado e a resposta segue)
    await sb.from("assistente_eventos").insert({ petshop_id: corpo.petshopId, user_id: u.user.id, acao: "ajuda", pedido: ultima.texto.slice(0, 300) });
    if (!texto) return NextResponse.json(await local());
    return NextResponse.json({ texto, equipe, novo });
  } catch (err) {
    if (!(err instanceof Anthropic.APIError)) await registrarErroServidor("/api/gestao/ajuda", err, { petshop: corpo.petshopId });
    return NextResponse.json(await local());
  }
}

export const POST = comRegistro("/api/gestao/ajuda", tratar);
