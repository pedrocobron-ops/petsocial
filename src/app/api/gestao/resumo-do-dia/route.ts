import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { bancoDoUsuario, configurado } from "@/lib/gestao/supabase";
import { comRegistro, erroDoBanco, registrarErroServidor } from "@/lib/gestao/erros-servidor";
import { garantirTrava, segredoDoServidor } from "@/lib/gestao/servidor";
import { ESQUEMA_RESUMO, INSTRUCOES_RESUMO, fatosParaIA, respostaDeTeste, validarTextoDaIA, type DadosDoResumo } from "@/lib/gestao/resumo-do-dia";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Modelo do texto do Resumo do dia: o mesmo do Mozart (variável na Vercel). */
const MODELO = process.env.GESTAO_RESUMO_MODELO ?? process.env.GESTAO_MODELO ?? "claude-haiku-5-5";
/** Só para testes automáticos: escreve o texto sem chamar o modelo. Nunca vale na Vercel. */
const DE_TESTE = process.env.GESTAO_RESUMO_FALSO === "1" && !process.env.VERCEL;
/** Os mesmos tetos do Mozart: o texto do resumo conta como um pedido e uma chamada do pet shop no dia. */
const LIMITE_DIA = Number(process.env.GESTAO_ASSISTENTE_LIMITE_DIA ?? 150);
const LIMITE_CHAMADAS = Number(process.env.GESTAO_ASSISTENTE_LIMITE_CHAMADAS ?? LIMITE_DIA * 4);
/** Quanto a rota espera o modelo: passou disso, a folha fica com o texto sem IA. */
const PRAZO_MS = 8_000;

type Saida = { ia: boolean; frase?: string; dica?: string; motivo?: "limite" | "email" | "fechado" | "fora" | "ja" | "invalido" };
const uuid = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);

/**
 * O texto do Mozart no Resumo do dia: a frase curta do cabeçalho e a redação da dica. Quem chama é alguém da equipe, com o
 * login. Os fatos vêm do banco (`gestao_resumo_do_dia`, com as permissões da pessoa), nunca do navegador; o modelo só escreve,
 * e o que ele escreve é conferido (`validarTextoDaIA`: número que não está nos fatos derruba o texto).
 * No máximo uma chamada ao modelo por dia por pessoa e pet shop (`gestao_resumo_ia_reservar`), contada na cota do Mozart
 * (`assistente_contar_v2`: teto do pet shop, teto do teste grátis, e-mail confirmado e teto geral). O resultado fica guardado.
 * Sem IA (sem cota, fora do ar, tempo esgotado, texto recusado), devolve `ia: false`: a folha já abriu com o texto sem IA.
 */
async function tratar(req: Request) {
  if (!configurado) return NextResponse.json({ erro: "sem_banco" }, { status: 503 });
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ erro: "sem_login", mensagem: "Entre de novo para usar o Mozart." }, { status: 401 });
  const c = (await req.json().catch(() => null)) as { petshopId?: unknown } | null;
  if (!c || !uuid(c.petshopId)) return NextResponse.json({ erro: "pedido_invalido" }, { status: 400 });
  const P = c.petshopId;
  const sb = bancoDoUsuario(token);
  const sem = (motivo: Saida["motivo"]) => NextResponse.json({ ia: false, motivo } satisfies Saida);

  // os fatos, com as permissões de quem pede (quem não é da equipe recebe null)
  const [leitura, loja] = await Promise.all([sb.rpc("gestao_resumo_do_dia", { p: P }), sb.from("petshops").select("nome").eq("id", P).maybeSingle()]);
  if (leitura.error) { await registrarErroServidor("/api/gestao/resumo-do-dia", erroDoBanco(leitura.error, "gestao_resumo_do_dia"), { petshop: P }); return sem("fora"); }
  const d = leitura.data as unknown as DadosDoResumo | null;
  if (!d || !loja.data) return NextResponse.json({ erro: "sem_acesso", mensagem: "Sem acesso." }, { status: 403 });
  // já tem o texto de hoje (ou já tentou): usa o que está guardado
  if (d.ia.estado === "feito" && d.ia.frase) return NextResponse.json({ ia: true, frase: d.ia.frase, dica: d.ia.dica ?? "" } satisfies Saida);
  if (d.ia.estado) return sem("ja");

  if (!DE_TESTE && !process.env.ANTHROPIC_API_KEY) { console.error("[resumo-do-dia] sem ANTHROPIC_API_KEY"); return sem("fora"); }

  // a vez de hoje: só uma por pessoa e pet shop
  const vez = await sb.rpc("gestao_resumo_ia_reservar", { p: P });
  if (vez.error) { await registrarErroServidor("/api/gestao/resumo-do-dia", erroDoBanco(vez.error, "gestao_resumo_ia_reservar"), { petshop: P }); return sem("fora"); }
  if (!(vez.data as { ok?: boolean } | null)?.ok) return sem("ja");
  const fechar = async (estado: "feito" | "falhou" | "liberar", frase?: string, dica?: string) => {
    const r = await sb.rpc("gestao_resumo_ia_guardar", { p: P, p_estado: estado, p_frase: frase, p_dica: dica });
    if (r.error) await registrarErroServidor("/api/gestao/resumo-do-dia", erroDoBanco(r.error, "gestao_resumo_ia_guardar"), { petshop: P });
  };

  // a cota do Mozart: um pedido e uma chamada. Recusou (limite, e-mail, conta só para consulta): nada é chamado e a vez volta
  await garantirTrava();
  const contar = async (tipo: "pedido" | "chamada"): Promise<string | null> => {
    const args = { p_petshop: P, p_canal: "mozart", p_tipo: tipo, p_limite: tipo === "pedido" ? LIMITE_DIA : LIMITE_CHAMADAS, p_segredo: segredoDoServidor() ?? undefined };
    let r = await sb.rpc("assistente_contar_v2", args);
    if (!r.error && (r.data as { motivo?: string } | null)?.motivo === "recusado" && ["ok", "gravou"].includes(await garantirTrava(true))) r = await sb.rpc("assistente_contar_v2", args);
    if (r.error) { await registrarErroServidor("/api/gestao/resumo-do-dia", erroDoBanco(r.error, "assistente_contar_v2"), { petshop: P }); return "fora"; }
    const x = r.data as { ok?: boolean; motivo?: string } | null;
    return x?.ok ? null : x?.motivo ?? "limite";
  };
  const recusa = (await contar("pedido")) ?? (await contar("chamada"));
  if (recusa) {
    await fechar("liberar");
    return sem(recusa === "email" ? "email" : recusa === "fechado" ? "fechado" : recusa === "fora" || recusa === "recusado" ? "fora" : "limite");
  }

  const fatos = fatosParaIA(d);
  let bruto: unknown = null;
  if (DE_TESTE) bruto = respostaDeTeste(d, loja.data.nome);
  else {
    try {
      const cliente = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY ?? "").replace(/[^\x21-\x7E]/g, ""), maxRetries: 0, timeout: PRAZO_MS });
      const m = await cliente.beta.messages.create({
        model: MODELO,
        max_tokens: 1500,
        output_config: { effort: "low", format: { type: "json_schema", schema: ESQUEMA_RESUMO as unknown as Record<string, unknown> } },
        // modelos com recusa por classificador: o servidor tenta de novo no modelo de reserva (como nas outras rotas)
        ...(/^claude-(opus-5-5|fable-5-2)/.test(MODELO) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        system: [{ type: "text", text: INSTRUCOES_RESUMO, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: `<fatos>\n${JSON.stringify(fatos)}\n</fatos>\nEscreva a frase e a dica.` }],
      });
      if (m.stop_reason !== "refusal" && m.stop_reason !== "max_tokens") {
        try { bruto = JSON.parse(m.content.map((b) => (b.type === "text" ? b.text : "")).join("")); } catch { bruto = null; }
      }
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) console.error("[resumo-do-dia] chave recusada pela Anthropic");
      else if (!(err instanceof Anthropic.APIError)) await registrarErroServidor("/api/gestao/resumo-do-dia", err, { petshop: P });
      await fechar("falhou");
      return sem("fora");
    }
  }
  const texto = validarTextoDaIA(bruto, fatos);
  if (!texto) { await fechar("falhou"); return sem("invalido"); }
  await fechar("feito", texto.frase, texto.dica);
  return NextResponse.json({ ia: true, frase: texto.frase, dica: texto.dica } satisfies Saida);
}

export const POST = comRegistro("/api/gestao/resumo-do-dia", tratar);
