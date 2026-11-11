import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { bancoDoUsuario, configurado } from "@/lib/gestao/supabase";
import { definicao, descrever, ehErroDeUso, ferramentasPara, gravar, rodarConsulta, type Contexto, type LinkZap, type Resumo } from "@/lib/gestao/assistente/ferramentas";
import { INSTRUCOES, contextoDoPetshop } from "@/lib/gestao/assistente/instrucoes";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Modelo do assistente (variável na Vercel). */
const MODELO = process.env.GESTAO_MODELO ?? "claude-opus-5-5";
/** Pedidos por pet shop por dia: segura o custo de uma conta que dispare. */
const LIMITE_DIA = Number(process.env.GESTAO_ASSISTENTE_LIMITE_DIA ?? 150);
const MAX_VOLTAS = 8;

type Msg = Anthropic.Beta.BetaMessageParam;
type Resultado = Anthropic.Beta.BetaToolResultBlockParam;
type Proposta = { id: string; ferramenta: string; resumo: Resumo };
type Corpo = {
  petshopId?: string; mensagens?: Msg[]; texto?: string; agora?: string; fusoMin?: number;
  decisoes?: { id: string; ok: boolean }[]; parciais?: Resultado[];
};

const erro = (status: number, codigo: string, mensagem: string) => NextResponse.json({ erro: codigo, mensagem }, { status });

export async function POST(req: Request) {
  if (!configurado) return erro(503, "sem_banco", "O sistema ainda não está ligado neste endereço.");
  if (!process.env.ANTHROPIC_API_KEY) return erro(503, "sem_chave", "O Mozart ainda não foi ligado neste endereço. Falta configurar a chave da inteligência artificial.");
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return erro(401, "sem_login", "Entre de novo para falar com o Mozart.");
  const corpo = (await req.json().catch(() => null)) as Corpo | null;
  if (!corpo?.petshopId || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(corpo.agora ?? "") || typeof corpo.fusoMin !== "number" || Math.abs(corpo.fusoMin) > 840) {
    return erro(400, "pedido_invalido", "Pedido incompleto.");
  }

  // quem está pedindo, e em qual pet shop (as regras do banco confirmam que a pessoa é da equipe)
  const sb = bancoDoUsuario(token);
  const { data: u } = await sb.auth.getUser(token);
  if (!u.user) return erro(401, "sem_login", "Entre de novo para falar com o Mozart.");
  const [p, e, s] = await Promise.all([
    sb.from("petshops").select("*").eq("id", corpo.petshopId).maybeSingle(),
    sb.from("profissionais").select("*").eq("petshop_id", corpo.petshopId).order("criado_em"),
    sb.from("servicos").select("*").eq("petshop_id", corpo.petshopId).order("ordem"),
  ]);
  const eu = (e.data ?? []).find((x) => x.user_id === u.user!.id && x.ativo);
  if (!p.data || !eu) return erro(403, "sem_acesso", "Você não faz parte deste pet shop.");
  const liberado = ["ativa", "atrasada", "cortesia"].includes(p.data.status) || (p.data.status === "teste" && new Date(p.data.teste_ate) > new Date());
  const c: Contexto = {
    sb, userId: u.user.id, petshop: p.data, eu, equipe: e.data ?? [], servicos: s.data ?? [],
    vejoFinanceiro: eu.papel === "dono" || eu.papel === "gerente" || eu.ve_financeiro,
    fusoMin: corpo.fusoMin, agora: corpo.agora!.slice(0, 16),
  };

  const mensagens: Msg[] = Array.isArray(corpo.mensagens) ? corpo.mensagens.slice(-60) : [];
  const links: LinkZap[] = [];
  let mudou = false;

  const ultima = mensagens[mensagens.length - 1];
  const pendentes = ultima?.role === "assistant" && Array.isArray(ultima.content) ? ultima.content.filter((b) => b.type === "tool_use") : [];

  if (pendentes.length) {
    // a pessoa respondeu aos cartões: grava o que foi confirmado e devolve o resultado de cada ferramenta ao modelo
    const resultados: Resultado[] = [];
    for (const uso of pendentes) {
      if (uso.type !== "tool_use") continue;
      const parcial = corpo.parciais?.find((r) => r.tool_use_id === uso.id);
      if (parcial) { resultados.push({ type: "tool_result", tool_use_id: uso.id, content: typeof parcial.content === "string" ? parcial.content : "", is_error: Boolean(parcial.is_error) }); continue; }
      const def = definicao(uso.name);
      const decisao = corpo.decisoes?.find((d) => d.id === uso.id);
      if (!def?.grava || !decisao?.ok) { resultados.push({ type: "tool_result", tool_use_id: uso.id, content: "A pessoa descartou esta ação. Nada foi gravado." }); continue; }
      if (!liberado) { resultados.push({ type: "tool_result", tool_use_id: uso.id, content: "A conta está só para consulta (teste vencido ou assinatura inativa). Nada foi gravado.", is_error: true }); continue; }
      try {
        const r = await gravar(c, uso.name, uso.input as Record<string, unknown>);
        mudou = true;
        await sb.from("assistente_eventos").insert({ petshop_id: c.petshop.id, user_id: c.userId, acao: uso.name, detalhes: uso.input as never });
        resultados.push({ type: "tool_result", tool_use_id: uso.id, content: JSON.stringify(r) });
      } catch (err) {
        const semPermissao = err instanceof Error && /row-level security|permission denied/i.test(err.message);
        resultados.push({ type: "tool_result", tool_use_id: uso.id, is_error: true, content: ehErroDeUso(err) ? err.message : semPermissao ? "Sem permissão para gravar isso." : "Não consegui gravar agora." });
      }
    }
    mensagens.push({ role: "user", content: resultados });
  } else {
    const texto = (corpo.texto ?? "").trim().slice(0, 2000);
    if (!texto) return erro(400, "pedido_vazio", "Diga ou escreva o que você precisa.");
    const inicioDoDia = new Date(Date.parse(`${c.agora.slice(0, 10)}T00:00:00Z`) - c.fusoMin * 60000).toISOString();
    const { count } = await sb.from("assistente_eventos").select("id", { count: "exact", head: true }).eq("petshop_id", c.petshop.id).eq("acao", "pedido").gte("criado_em", inicioDoDia);
    if ((count ?? 0) >= LIMITE_DIA) return erro(429, "limite", "O Mozart atingiu o limite de pedidos de hoje. Amanhã ele volta; enquanto isso, as telas funcionam normalmente.");
    await sb.from("assistente_eventos").insert({ petshop_id: c.petshop.id, user_id: c.userId, acao: "pedido", pedido: texto });
    const dia = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][new Date(`${c.agora.slice(0, 10)}T00:00:00Z`).getUTCDay()];
    mensagens.push({ role: "user", content: [{ type: "text", text: texto }, { type: "text", text: `(Agora: ${dia}, ${c.agora.replace("T", " ")}, horário local do pet shop.)` }] });
  }

  // tira espaço, quebra de linha ou caractere invisível colado junto com a chave
  const cliente = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY ?? "").replace(/[^\x21-\x7E]/g, "") });
  const comFallback = /^claude-(opus-5-5|fable-5-2)/.test(MODELO);
  let texto = "";

  try {
    for (let volta = 0; volta < MAX_VOLTAS; volta++) {
      const resposta = await cliente.beta.messages.create({
        model: MODELO,
        max_tokens: 4000,
        output_config: { effort: "low" },
        ...(comFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        system: [
          { type: "text", text: INSTRUCOES, cache_control: { type: "ephemeral" } },
          { type: "text", text: contextoDoPetshop(c) },
        ],
        tools: ferramentasPara(c),
        messages: mensagens,
      });
      mensagens.push({ role: "assistant", content: resposta.content as Extract<Msg, { role: "assistant" }>["content"] });
      const fala = resposta.content.filter((b) => b.type === "text").map((b) => (b.type === "text" ? b.text : "")).join("\n").trim();
      if (fala) texto = texto ? `${texto}\n\n${fala}` : fala;

      if (resposta.stop_reason === "refusal") return NextResponse.json({ mensagens: mensagens.slice(0, -1), texto: "Com isso eu não consigo ajudar. Posso cuidar da agenda, dos clientes, do caixa e do estoque.", propostas: [], parciais: [], links, mudou });
      if (resposta.stop_reason !== "tool_use") break;

      const usos = resposta.content.filter((b) => b.type === "tool_use");
      const parciais: Resultado[] = [];
      const propostas: Proposta[] = [];
      for (const uso of usos) {
        if (uso.type !== "tool_use") continue;
        const def = definicao(uso.name);
        if (!def || (def.financeiro && !c.vejoFinanceiro)) { parciais.push({ type: "tool_result", tool_use_id: uso.id, is_error: true, content: "Ferramenta indisponível para esta pessoa." }); continue; }
        if (!def.grava) {
          const r = await rodarConsulta(c, uso.name, uso.input);
          if (r.links) links.push(...r.links);
          parciais.push({ type: "tool_result", tool_use_id: uso.id, content: r.conteudo, is_error: r.erro });
          continue;
        }
        if (!liberado) { parciais.push({ type: "tool_result", tool_use_id: uso.id, is_error: true, content: "A conta está só para consulta (teste vencido ou assinatura inativa). Diga isso à pessoa e indique a tela Assinatura." }); continue; }
        try {
          propostas.push({ id: uso.id, ferramenta: uso.name, resumo: await descrever(c, uso.name, uso.input as Record<string, unknown>) });
        } catch (err) {
          parciais.push({ type: "tool_result", tool_use_id: uso.id, is_error: true, content: ehErroDeUso(err) ? err.message : "Não consegui preparar essa ação." });
        }
      }
      // há algo para a pessoa confirmar: para aqui e espera os botões
      if (propostas.length) return NextResponse.json({ mensagens, texto, propostas, parciais, links, mudou });
      mensagens.push({ role: "user", content: parciais });
    }
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return erro(429, "ocupado", "O Mozart está com muitos pedidos agora. Tente de novo em um minuto.");
    if (err instanceof Anthropic.AuthenticationError) return erro(503, "sem_chave", "A chave da inteligência artificial não está válida. Avise o suporte da Maestro Pet.");
    if (err instanceof Anthropic.APIError) return erro(502, "ia_fora", "O Mozart não respondeu agora. Tente de novo em instantes.");
    // o motivo vai para o registro do servidor; a pessoa vê só a frase
    console.error("[assistente] falha", err);
    return NextResponse.json({ erro: "falha", mensagem: "Algo deu errado do nosso lado. Tente de novo em instantes.", tipo: err instanceof Error ? err.name : typeof err }, { status: 500 });
  }

  return NextResponse.json({ mensagens, texto: texto || "Pronto.", propostas: [], parciais: [], links, mudou });
}
