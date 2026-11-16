import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/gestao/banco";
import { SUPABASE_CHAVE, SUPABASE_URL, configurado } from "@/lib/gestao/supabase";
import { segredoDoServidor } from "@/lib/gestao/servidor";
import { comRegistro, erroDoBanco, registrarErroServidor } from "@/lib/gestao/erros-servidor";
import {
  FERRAMENTA_HORARIOS, FERRAMENTA_HOTEL, INSTRUCOES_LINK_IA, MAX_PERGUNTAS_CONVERSA, contextoDoLink, entradaHorarios, entradaHotel,
  ferramentasDoLink, foraTexto, lerResposta, limiteConversaTexto, limiteTexto, limparFalas, perguntasNaConversa, respostaDeTeste, resumoDaEstimativa, type DadosDoLink,
} from "@/lib/gestao/link-ia";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Modelo das dúvidas do link: pergunta curta sobre dados prontos, então o modelo mais leve (variável na Vercel). */
const MODELO = process.env.GESTAO_LINK_IA_MODELO ?? "claude-haiku-5-5";
/** Perguntas por endereço de internet, por hora, em cada link (vale por instância do servidor). O limite por dia fica no banco. */
const POR_REDE_HORA = Number(process.env.GESTAO_LINK_IA_LIMITE_REDE ?? 30);
const MAX_VOLTAS = 3;
/** Só para testes automáticos: responde sem chamar o modelo. Nunca vale na Vercel. */
const DE_TESTE = process.env.GESTAO_LINK_IA_FALSO === "1" && !process.env.VERCEL;

const HORA = 36e5;
const uso = new Map<string, number[]>();
function liberado(chave: string) {
  const agora = Date.now();
  if (uso.size > 5000) uso.clear();
  const v = (uso.get(chave) ?? []).filter((t) => agora - t < HORA);
  if (v.length >= POR_REDE_HORA) { uso.set(chave, v); return false; }
  v.push(agora); uso.set(chave, v);
  return true;
}

type Saida = { texto: string; naoSei?: boolean; limite?: boolean; fora?: boolean; sugestao?: unknown };
const responder = (s: Saida, status = 200) => NextResponse.json(s, { status });

/**
 * Dúvidas do cliente no link público (sem login). Só funciona quando o dono ligou "Tirar dúvidas do cliente no link".
 * O servidor monta o que o assistente sabe pelas funções públicas do link (chave pública, sem chave de serviço):
 * nada de clientes, pets ou caixa. O texto da pergunta não é guardado: só a contagem do dia.
 * Recebe { codigo, falas: [{ de: "eu" | "ia", texto }] } e devolve { texto, naoSei?, limite?, fora?, sugestao? }.
 */
async function tratar(req: Request) {
  if (!configurado) return NextResponse.json({ erro: "sem_banco" }, { status: 503 });
  const corpo = (await req.json().catch(() => null)) as { codigo?: unknown; falas?: unknown } | null;
  const codigo = typeof corpo?.codigo === "string" ? corpo.codigo.trim() : "";
  const falas = limparFalas(corpo?.falas);
  if (!/^[A-Za-z0-9_-]{4,40}$/.test(codigo) || !falas) return NextResponse.json({ erro: "pedido_invalido" }, { status: 400 });

  const sb = createClient<Database>(SUPABASE_URL, SUPABASE_CHAVE, { auth: { persistSession: false, autoRefreshToken: false } });
  const ligada = await sb.rpc("link_ia_ligada", { p_codigo: codigo });
  if (ligada.error) { await registrarErroServidor("/api/gestao/link-ia", erroDoBanco(ligada.error, "link_ia_ligada")); return NextResponse.json({ erro: "indisponivel" }, { status: 503 }); }
  if (ligada.data !== true) return NextResponse.json({ erro: "desligado" }, { status: 403 });

  // o que a página do link mostra, pelas mesmas funções públicas
  const infoR = await sb.rpc("link_info", { p_codigo: codigo });
  const info = infoR.data as unknown as DadosDoLink["info"] | null;
  if (infoR.error || !info || typeof info !== "object" || !info.nome) return NextResponse.json({ erro: "desligado" }, { status: 403 });
  info.servicos = Array.isArray(info.servicos) ? info.servicos : [];
  const [fechados, hotel, opcoes, experiencia, espera] = await Promise.all([
    sb.rpc("link_fechados", { p_codigo: codigo }),
    info.hotel ? sb.rpc("link_hotel_opcoes", { p_codigo: codigo }) : Promise.resolve({ data: null }),
    sb.rpc("link_opcoes", { p_codigo: codigo }),
    info.creche ? sb.rpc("link_creche_experiencia", { p_codigo: codigo }) : Promise.resolve({ data: null }),
    info.creche || info.hotel ? sb.rpc("link_espera_ativa", { p_codigo: codigo }) : Promise.resolve({ data: false }),
  ]);
  const d: DadosDoLink = {
    info,
    fechados: Array.isArray(fechados.data) ? (fechados.data as unknown as string[]) : [],
    // sem a resposta do hotel, não arrisca mostrar um preço que o dono pode ter escondido
    hotel: "error" in hotel && hotel.error ? { preco: { mostrar: false } } : (hotel.data as DadosDoLink["hotel"]) ?? null,
    opcoes: (opcoes.data as DadosDoLink["opcoes"]) ?? null,
    experiencia: (experiencia.data as DadosDoLink["experiencia"]) ?? null,
    espera: espera.data === true,
  };
  const nome = info.nome;

  // freios: por conversa, por endereço de internet e por dia (no banco)
  const rede = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "sem-rede";
  if (perguntasNaConversa(corpo?.falas) > MAX_PERGUNTAS_CONVERSA || !liberado(`${codigo}:${rede}`)) return responder({ texto: limiteConversaTexto(nome), limite: true });
  if (!DE_TESTE && !process.env.ANTHROPIC_API_KEY) { console.error("[link-ia] sem ANTHROPIC_API_KEY"); return responder({ texto: foraTexto(nome), fora: true }); }
  // a contagem leva o segredo do servidor: quem chama a função direto com a chave pública não gasta a cota do pet shop
  const segredo = segredoDoServidor() ?? undefined;
  const conta = await sb.rpc("link_ia_contar", { p_codigo: codigo, p_segredo: segredo });
  const contou = conta.data as { ok?: boolean; motivo?: string } | null;
  if (conta.error) { await registrarErroServidor("/api/gestao/link-ia", erroDoBanco(conta.error, "link_ia_contar")); return responder({ texto: foraTexto(nome), fora: true }); }
  if (contou?.motivo === "recusado") { console.error("[link-ia] o banco recusou o segredo do servidor: grave de novo no painel (aba Cakto)"); return responder({ texto: foraTexto(nome), fora: true }); }
  if (!contou?.ok) return contou?.motivo === "desligado" ? NextResponse.json({ erro: "desligado" }, { status: 403 }) : responder({ texto: limiteTexto(nome), limite: true });

  const contexto = contextoDoLink(d);
  const registrar = async (respondida: boolean) => { try { await sb.rpc("link_ia_registrar", { p_codigo: codigo, p_respondida: respondida, p_segredo: segredo }); } catch { /* segue */ } };

  let bruto = "";
  if (DE_TESTE) {
    bruto = respostaDeTeste(falas[falas.length - 1].texto, contexto, d);
  } else {
    try {
      bruto = await perguntarAoModelo(sb, codigo, d, contexto, falas);
    } catch (err) {
      if (err instanceof Anthropic.AuthenticationError) console.error("[link-ia] chave recusada pela Anthropic");
      else if (!(err instanceof Anthropic.APIError)) { console.error("[link-ia] falha", err instanceof Error ? err.name : typeof err); await registrarErroServidor("/api/gestao/link-ia", err); }
      await registrar(false);
      return responder({ texto: foraTexto(nome), fora: true });
    }
  }
  const r = lerResposta(bruto, d);
  await registrar(!r.naoSei);
  return responder({ texto: r.texto, naoSei: r.naoSei, sugestao: r.sugestao });
}

type Banco = ReturnType<typeof createClient<Database>>;
type Msg = Anthropic.Beta.BetaMessageParam;

/** Uma pergunta, com no máximo 3 voltas de ferramenta. As ferramentas só leem as funções públicas DESTE link. */
async function perguntarAoModelo(sb: Banco, codigo: string, d: DadosDoLink, contexto: string, falas: { de: "eu" | "ia"; texto: string }[]) {
  const cliente = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY ?? "").replace(/[^\x21-\x7E]/g, ""), maxRetries: 1, timeout: 20_000 });
  const mensagens: Msg[] = falas.map((f) => ({ role: f.de === "eu" ? "user" : "assistant", content: f.texto }));
  const ferramentas = ferramentasDoLink(d);
  let texto = "";
  for (let volta = 0; volta < MAX_VOLTAS; volta++) {
    const r = await cliente.beta.messages.create({
      model: MODELO,
      max_tokens: 1500,
      output_config: { effort: "low" },
      system: [
        { type: "text", text: INSTRUCOES_LINK_IA, cache_control: { type: "ephemeral" } },
        { type: "text", text: `<dados_do_pet_shop>\n${contexto}\n</dados_do_pet_shop>` },
      ],
      // as mesmas ferramentas em todas as voltas (o histórico tem os usos delas); na última, o modelo só pode responder
      ...(ferramentas.length ? { tools: ferramentas, ...(volta === MAX_VOLTAS - 1 ? { tool_choice: { type: "none" as const } } : {}) } : {}),
      messages: mensagens,
    });
    if (r.stop_reason === "refusal" || r.stop_reason === "max_tokens") return "[[NAO_SEI]]";
    const fala = r.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    if (fala) texto = texto ? `${texto} ${fala}` : fala;
    if (r.stop_reason !== "tool_use") break;
    mensagens.push({ role: "assistant", content: r.content as Extract<Msg, { role: "assistant" }>["content"] });
    const resultados: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const b of r.content) {
      if (b.type !== "tool_use") continue;
      resultados.push({ type: "tool_result", tool_use_id: b.id, content: await rodarFerramenta(sb, codigo, d, b.name, b.input) });
    }
    mensagens.push({ role: "user", content: resultados });
  }
  return texto;
}

async function rodarFerramenta(sb: Banco, codigo: string, d: DadosDoLink, nome: string, input: unknown): Promise<string> {
  if (nome === FERRAMENTA_HORARIOS) {
    const e = entradaHorarios(input, d);
    if (!e.ok) return e.erro;
    const { data, error } = await sb.rpc("link_horarios", { p_codigo: codigo, p_servico: e.servicoId, p_dia: e.dia, p_pets: e.pets });
    if (error) return "Não deu para ver os horários agora.";
    const lista = ((data ?? []) as string[]).map((h) => String(h).slice(0, 5));
    return lista.length ? `Horários livres em ${e.dia}: ${lista.join(", ")}. O pedido ainda precisa ser confirmado pelo pet shop.` : `Sem horário livre em ${e.dia}.`;
  }
  if (nome === FERRAMENTA_HOTEL) {
    const e = entradaHotel(input, d);
    if (!e.ok) return e.erro;
    const { data, error } = await sb.rpc("link_hotel_estimativa", { p_codigo: codigo, p_entrada: e.entrada, p_saida: e.saida, p_pets: e.pets });
    if (error) return "Não deu para estimar agora.";
    return resumoDaEstimativa(data);
  }
  return "Ferramenta indisponível.";
}

export const POST = comRegistro("/api/gestao/link-ia", tratar);
