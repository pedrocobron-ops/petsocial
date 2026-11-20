import { areasDe, podeArea } from "@/lib/gestao/acessos";
import { lerEquipe, lerPetshop, lerServicos } from "@/lib/gestao/reservado";
import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { bancoDoUsuario, configurado } from "@/lib/gestao/supabase";
import { ferramentasPara, type Contexto } from "@/lib/gestao/assistente/ferramentas";
import { contaLiberada, limitesDaChamada, medidasZeradas, responderCartoes, voltas, type Msg, type Resultado } from "@/lib/gestao/assistente/conversa";
import { INSTRUCOES, contextoDoPetshop } from "@/lib/gestao/assistente/instrucoes";
import { modeloDeTeste } from "@/lib/gestao/assistente/modelo-de-teste";
import { comRegistro, erroDoBanco, registrarErroServidor } from "@/lib/gestao/erros-servidor";
import { garantirTrava, segredoDoServidor } from "@/lib/gestao/servidor";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Modelo do assistente (variável na Vercel). */
const MODELO = process.env.GESTAO_MODELO ?? "claude-haiku-5-5";
/** Só para testes automáticos: o Mozart responde por um roteiro fixo, sem chamar o modelo. Nunca vale na Vercel. */
const DE_TESTE = process.env.GESTAO_MOZART_FALSO === "1" && !process.env.VERCEL;
/** Pedidos por pet shop por dia: segura o custo de uma conta que dispare. */
const LIMITE_DIA = Number(process.env.GESTAO_ASSISTENTE_LIMITE_DIA ?? 150);
/** Chamadas ao modelo por pet shop por dia (cada pedido usa uma ou mais; os cartões confirmados também contam). */
const LIMITE_CHAMADAS = Number(process.env.GESTAO_ASSISTENTE_LIMITE_CHAMADAS ?? LIMITE_DIA * 4);
/** Teto do histórico que o navegador devolve: mensagens e tamanho total (em caracteres do JSON). */
const MAX_MENSAGENS = 40;
const MAX_HISTORICO = 120_000;

type Corpo = {
  petshopId?: string; mensagens?: Msg[]; texto?: string; agora?: string; fusoMin?: number;
  decisoes?: { id: string; ok: boolean }[]; parciais?: Resultado[];
};

/** O que a pessoa lê quando a inteligência artificial não está disponível (o motivo técnico vai só para o registro). */
const FORA_DO_AR = "O Mozart está fora do ar agora. Enquanto isso, tudo funciona pelos botões das telas, e o Manual, no menu, explica cada passo. Tente de novo mais tarde.";

const erro = (status: number, codigo: string, mensagem: string) => NextResponse.json({ erro: codigo, mensagem }, { status });
const LIMITE_TEXTO = "Por hoje o Mozart já atendeu todos os pedidos que cabem num dia. Amanhã cedo ele volta. Enquanto isso, tudo funciona pelos botões das telas, e o Manual, no menu, explica cada passo.";
/** O teto do dia somando todos os pet shops (config_interna mozart_dia_geral): não é culpa de quem está pedindo. */
const LIMITE_GERAL_TEXTO = "O Mozart recebeu pedidos demais hoje, de todos os pet shops juntos, e precisou parar para descansar. Amanhã cedo ele volta. Enquanto isso, tudo funciona pelos botões das telas, e o Manual, no menu, explica cada passo.";
/** Conta só para consulta (teste vencido, assinatura cancelada ou conta em exclusão): a IA custa a cada pergunta. */
const FECHADO_TEXTO = "O Mozart atende quem está no teste grátis ou com a assinatura em dia. A sua conta está só para consulta: os dados continuam aqui, nas telas. Para voltar a usar o Mozart, veja a tela Assinatura.";
/** Teste grátis com o e-mail do dono ainda não confirmado (assistente_contar_v2, motivo 'email', migração 20261245). */
const EMAIL_TEXTO = "No teste grátis, o Mozart começa a atender depois que o e-mail do dono da conta é confirmado. Para confirmar, saia, toque em \"Esqueci a senha\" na tela de entrar e abra o link que chega no e-mail. Enquanto isso, tudo funciona pelos botões das telas.";
const textoDoLimite = (motivo: string | null) => (motivo === "fechado" ? FECHADO_TEXTO : motivo === "email" ? EMAIL_TEXTO : motivo === "geral" ? LIMITE_GERAL_TEXTO : LIMITE_TEXTO);

type Bloco = Record<string, unknown>;
const ehTexto = (v: unknown, max = 8000) => typeof v === "string" && v.length <= max;
/** Confere um bloco que o navegador devolveu: só os tipos que o próprio servidor manda e devolve. */
function blocoValido(b: unknown, role: "user" | "assistant"): boolean {
  if (!b || typeof b !== "object") return false;
  const x = b as Bloco;
  if (x.type === "text") return ehTexto(x.text);
  if (role === "assistant") {
    if (x.type === "tool_use") return ehTexto(x.id, 200) && ehTexto(x.name, 80) && !!x.input && typeof x.input === "object" && JSON.stringify(x.input).length <= 8000;
    if (x.type === "thinking") return ehTexto(x.thinking, 100_000) && ehTexto(x.signature, 100_000);
    if (x.type === "redacted_thinking") return ehTexto(x.data, 100_000);
    return false;
  }
  if (x.type === "tool_result") {
    const c = x.content;
    return ehTexto(x.tool_use_id, 200) && (c === undefined || ehTexto(c, 20_000) || (Array.isArray(c) && c.every((t) => t && typeof t === "object" && (t as Bloco).type === "text" && ehTexto((t as Bloco).text, 20_000))));
  }
  return false;
}
const soTextoDaPessoa = (m: Msg) => m.role === "user" && (typeof m.content === "string" || (Array.isArray(m.content) && m.content.length > 0 && m.content.every((b) => b.type === "text")));
/**
 * O histórico que o navegador devolve, conferido: só mensagens e blocos que o servidor produz, com teto de tamanho.
 * Se passar do teto, corta do começo e recomeça numa mensagem de texto da pessoa (nunca num resultado de ferramenta
 * solto); e, como cortar muda o começo da conversa, tira o raciocínio guardado das respostas antigas (o modelo recusa
 * raciocínio de uma conversa que mudou). Histórico com formato estranho é descartado (a conversa recomeça).
 */
function historico(bruto: unknown): Msg[] {
  if (!Array.isArray(bruto)) return [];
  const ok = bruto.every((m) => m && typeof m === "object" && ((m as Msg).role === "user" || (m as Msg).role === "assistant")
    && (ehTexto((m as Msg).content) || (Array.isArray((m as Msg).content) && ((m as Msg).content as unknown[]).length <= 40 && ((m as Msg).content as unknown[]).every((b) => blocoValido(b, (m as Msg).role as "user" | "assistant")))));
  if (!ok) return [];
  let lista = bruto as Msg[];
  const grande = () => lista.length > MAX_MENSAGENS || JSON.stringify(lista).length > MAX_HISTORICO;
  if (!grande()) return lista;
  while (lista.length && grande()) lista = lista.slice(1);
  while (lista.length && !soTextoDaPessoa(lista[0])) lista = lista.slice(1);
  return lista.map((m) => (m.role === "assistant" && Array.isArray(m.content)
    ? { ...m, content: m.content.filter((b) => b.type !== "thinking" && b.type !== "redacted_thinking") }
    : m)).filter((m) => !(Array.isArray(m.content) && m.content.length === 0));
}
/** Agora no fuso do pet shop ("AAAA-MM-DDTHH:MM") e a diferença para o UTC em minutos, pelo relógio do servidor. */
function agoraNoFuso(fuso: string) {
  const d = new Date();
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d).map((x) => [x.type, x.value]));
    const local = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
    return { agora: local, fusoMin: Math.round((Date.parse(`${local}:00Z`) - Math.floor(d.getTime() / 60000) * 60000) / 60000) };
  } catch { return null; }
}

/**
 * A resposta vai aos poucos (uma linha JSON por evento) quando o aplicativo pede com `?stream=1` ou `Accept: application/x-ndjson`:
 *   {"t":"texto","d":"Achei"}          pedaço do que o Mozart está escrevendo
 *   {"t":"progresso","frase":"Procurando Thor…"}   o que ele está fazendo enquanto a pessoa espera
 *   {"t":"fim","status":200,...}       o mesmo corpo da resposta de uma vez (mensagens, texto, propostas, parciais, links, mudou)
 *                                     ou, se deu errado, {"t":"fim","status":429|502|503|500,"erro":…,"mensagem":…}
 * Sem isso (ou com GESTAO_MOZART_STREAM=0 no servidor), responde de uma vez em JSON, como sempre.
 * Erros antes de chamar o modelo (login, pedido vazio, limite do dia) vêm sempre em JSON com o status de antes.
 */
type Evento = { t: "texto"; d: string } | { t: "progresso"; frase: string };
const querAosPoucos = (req: Request) => process.env.GESTAO_MOZART_STREAM !== "0"
  && (new URL(req.url).searchParams.get("stream") === "1" || (req.headers.get("accept") ?? "").includes("application/x-ndjson"));

async function tratar(req: Request) {
  const inicio = Date.now();
  const aosPoucos = querAosPoucos(req);
  if (!configurado) return erro(503, "sem_banco", "O sistema ainda não está ligado neste endereço.");
  if (!process.env.ANTHROPIC_API_KEY) { console.error("[assistente] sem ANTHROPIC_API_KEY"); return erro(503, "sem_chave", FORA_DO_AR); }
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
  // dias fechados e feriados (Meu pet shop) dos próximos 14 dias, com um dia de folga dos dois lados (o relógio é conferido abaixo)
  const diaDoAparelho = corpo.agora!.slice(0, 10);
  const somaDia = (n: number) => new Date(Date.parse(`${diaDoAparelho}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  const [p, e, s, especiais, acesso] = await Promise.all([
    lerPetshop(sb, corpo.petshopId),
    lerEquipe(sb, corpo.petshopId),
    lerServicos(sb, corpo.petshopId),
    sb.from("dias_especiais").select("dia, nome, fechado, feriado").eq("petshop_id", corpo.petshopId).gte("dia", somaDia(-1)).lte("dia", somaDia(15)).order("dia").limit(40),
    // a conta pode gravar? Quem diz é o banco (acesso_liberado), a mesma regra das telas e das tabelas
    sb.rpc("acesso_liberado", { p: corpo.petshopId }).then((r) => r, () => ({ data: null, error: { message: "sem resposta" } })),
  ]);
  const eu = (e.data ?? []).find((x) => x.user_id === u.user!.id && x.ativo);
  if (!p.data || !eu) return erro(403, "sem_acesso", "Você não faz parte deste pet shop.");
  const liberado = contaLiberada(acesso.error ? null : acesso.data, p.data);
  const c: Contexto = {
    sb, userId: u.user.id, petshop: p.data, eu, equipe: e.data ?? [], servicos: s.data ?? [],
    vejoFinanceiro: podeArea(eu, "caixa") || podeArea(eu, "financeiro") || podeArea(eu, "relatorios"),
    cuidoDoFinanceiro: podeArea(eu, "financeiro") || podeArea(eu, "relatorios"),
    areas: areasDe(eu),
    dono: eu.papel === "dono",
    fusoMin: corpo.fusoMin, agora: corpo.agora!.slice(0, 16),
    diasEspeciais: especiais.error ? undefined : (especiais.data ?? []),
  };
  // o relógio que vale é o do servidor: o do aparelho só é usado se bate com ele (aparelho em outro fuso de propósito)
  const doServidor = agoraNoFuso(p.data.fuso || "America/Sao_Paulo");
  const noAparelho = new Date(Date.now() + c.fusoMin * 60000).toISOString().slice(0, 16);
  if (doServidor && Math.abs(Date.parse(`${c.agora}:00Z`) - Date.parse(`${noAparelho}:00Z`)) > 15 * 60000) { c.agora = doServidor.agora; c.fusoMin = doServidor.fusoMin; }

  // toda chamada ao modelo conta no dia do pet shop e no teto geral do dia (no banco). A conta só para consulta não usa o
  // Mozart: o banco recusa a contagem ("fechado") e nenhuma chamada ao modelo é feita.
  // por que a última contagem foi recusada: "limite" (do pet shop), "geral" (todos juntos) ou "fechado" (conta só para consulta)
  let motivoDaRecusa: string | null = null;
  const contar = async (tipo: "pedido" | "chamada") => {
    const args = { p_petshop: c.petshop.id, p_canal: "mozart", p_tipo: tipo, p_limite: tipo === "pedido" ? LIMITE_DIA : LIMITE_CHAMADAS };
    // a contagem leva o segredo do servidor: com a trava ligada, quem chama a função direto não enche o teto de todos
    const comSegredo = { ...args, p_segredo: segredoDoServidor() ?? undefined };
    let v2 = await sb.rpc("assistente_contar_v2", comSegredo);
    // o banco não conhece o segredo deste servidor (chave trocada): grava a trava e tenta mais uma vez
    if (!v2.error && (v2.data as { motivo?: string } | null)?.motivo === "recusado" && ["ok", "gravou"].includes(await garantirTrava(true))) v2 = await sb.rpc("assistente_contar_v2", comSegredo);
    if (!v2.error) {
      const d = v2.data as { ok?: boolean; motivo?: string } | null;
      if (d?.motivo === "recusado") { console.error("[assistente] o banco recusou o segredo do servidor: ligue a trava no painel (aba Cakto)"); await registrarErroServidor("/api/gestao/assistente", Object.assign(new Error("O banco recusou o segredo do servidor (trava do servidor): grave de novo no painel, aba Cakto"), { name: "TravaDoServidor" }), { petshop: c.petshop.id }); }
      if (!d?.ok) motivoDaRecusa = d?.motivo ?? "limite";
      return d?.ok === true;
    }
    // banco sem a função nova (antes da migração 20261228): a contagem de antes
    const r = v2.error.code === "PGRST202" || v2.error.code === "42883" ? await sb.rpc("assistente_contar", args) : v2;
    if (r.error) { console.error("[assistente] contagem falhou", r.error.code); await registrarErroServidor("/api/gestao/assistente", erroDoBanco(r.error, "assistente_contar"), { petshop: c.petshop.id }); return false; }
    if (r.data !== true) motivoDaRecusa = "limite";
    return r.data === true;
  };

  await garantirTrava();
  const mensagens: Msg[] = historico(corpo.mensagens);
  let mudou = false;

  const ultima = mensagens[mensagens.length - 1];
  const pendentes = ultima?.role === "assistant" && Array.isArray(ultima.content) ? ultima.content.filter((b) => b.type === "tool_use") : [];

  if (pendentes.length) {
    // a pessoa respondeu aos cartões: grava o que foi confirmado e devolve o resultado de cada ferramenta ao modelo
    const r = await responderCartoes({
      c, pendentes, liberado, decisoes: corpo.decisoes, parciais: corpo.parciais,
      anotar: async (acao, detalhes) => { await sb.from("assistente_eventos").insert({ petshop_id: c.petshop.id, user_id: c.userId, acao, detalhes: detalhes as never }); },
      // cada cartão grava uma vez só: a conversa volta depois de recarregar e a mesma confirmação pode chegar de novo
      reservar: async (uso) => {
        const r = await sb.rpc("assistente_acao_reservar", { p_petshop: c.petshop.id, p_uso: uso });
        // banco sem a função (antes da migração 20261215): segue como antes (dinheiro e estoque já têm a chave)
        if (r.error) { if (r.error.code !== "PGRST202" && r.error.code !== "42883") console.error("[assistente] reservar ação falhou", r.error.code); return true; }
        return r.data === true;
      },
      liberar: async (uso) => { await sb.rpc("assistente_acao_liberar", { p_petshop: c.petshop.id, p_uso: uso }); },
    });
    mudou = r.mudou;
    mensagens.push({ role: "user", content: r.resultados });
  } else {
    const texto = (corpo.texto ?? "").trim().slice(0, 2000);
    if (!texto) return erro(400, "pedido_vazio", "Diga ou escreva o que você precisa.");
    if (!(await contar("pedido"))) return motivoDaRecusa === "fechado" ? erro(403, "so_consulta", FECHADO_TEXTO) : motivoDaRecusa === "recusado" ? erro(503, "fora", FORA_DO_AR) : erro(429, "limite", textoDoLimite(motivoDaRecusa));
    await sb.from("assistente_eventos").insert({ petshop_id: c.petshop.id, user_id: c.userId, acao: "pedido", pedido: texto });
    const dia = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"][new Date(`${c.agora.slice(0, 10)}T00:00:00Z`).getUTCDay()];
    mensagens.push({ role: "user", content: [{ type: "text", text: texto }, { type: "text", text: `(Agora: ${dia}, ${c.agora.replace("T", " ")}, horário local do pet shop.)` }] });
  }

  // tira espaço, quebra de linha ou caractere invisível colado junto com a chave
  // guarda a conversa para a equipe Maestro Pet entender o que as pessoas pedem (não trava a resposta se falhar)
  const pedidoDaVez = pendentes.length ? "" : (corpo.texto ?? "").trim().slice(0, 2000);
  const guardarConversa = async (resposta: string) => {
    if (!pedidoDaVez) return;
    try { await sb.rpc("registrar_conversa", { p_petshop: c.petshop.id, p_canal: "mozart", p_pergunta: pedidoDaVez, p_resposta: resposta }); } catch { /* segue */ }
  };

  // cada chamada tem prazo: o pedido inteiro precisa caber no tempo da rota (e a pessoa não fica 50 s olhando "digitando…")
  // O pedido inteiro tem prazo (PRAZO_TOTAL_MS, contado desde que a rota começou): cada chamada recebe só o tempo que sobra e,
  // depois da primeira volta, não repete. Assim a soma das voltas nunca passa do limite de 60 s da rota.
  const cliente = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY ?? "").replace(/[^\x21-\x7E]/g, ""), timeout: 25_000, maxRetries: 1 });
  const comFallback = /^claude-(opus-5-5|fable-5-2)/.test(MODELO);
  // a pessoa fechou a conversa no meio: para de gastar com o modelo (nada é gravado sem o "Pode fazer")
  const parar = new AbortController();

  /** Chama o modelo, roda as voltas e devolve o status e o corpo da resposta (o mesmo nos dois jeitos de responder). */
  const rodar = async (emitir?: (e: Evento) => void): Promise<{ status: number; corpo: Record<string, unknown> }> => {
    const medidas = medidasZeradas();
    let primeiro: number | null = null, sinal: number | null = null;
    const avisos = emitir && {
      texto: (d: string) => { primeiro ??= Date.now() - inicio; sinal ??= primeiro; emitir({ t: "texto", d }); },
      progresso: (frase: string) => { sinal ??= Date.now() - inicio; emitir({ t: "progresso", frase }); },
    };
    const medir = (fim: "ok" | "cartao" | "recusa" | "limite" | "erro" | "demorou") => {
      const total = Date.now() - inicio;
      console.info(`[assistente] ${aosPoucos ? "stream" : "json"} ${fim} ${total} ms, 1ª palavra ${primeiro ?? "-"} ms, ${medidas.voltas} voltas, ${medidas.ferramentas} consultas, tokens ${medidas.entrada}+${medidas.cacheLidos} lidos do cache+${medidas.cacheGravados} gravados / ${medidas.saida} de saída`);
      // não trava a resposta se falhar
      return Promise.resolve(sb.rpc("mozart_tempo_registrar", {
        p_petshop: c.petshop.id, p_modo: aosPoucos ? "stream" : "json", p_fim: fim, p_total_ms: total, p_primeiro_ms: primeiro as number, p_sinal_ms: sinal as number, // null vai como null no banco
        p_voltas: medidas.voltas, p_ferramentas: medidas.ferramentas, p_entrada: medidas.entrada, p_saida: medidas.saida,
        p_cache_lidos: medidas.cacheLidos, p_cache_gravados: medidas.cacheGravados,
      })).then(() => undefined, () => undefined);
    };
    const falha = async (status: number, codigo: string, mensagem: string, extra?: Record<string, unknown>) => { await medir(status === 429 && codigo === "limite" ? "limite" : "erro"); return { status, corpo: { erro: codigo, mensagem, ...extra } }; };
    try {
      const r = await voltas({
        c, mensagens, liberado, contar: () => contar("chamada"), avisos, medidas, inicioDoPedido: inicio,
        chamar: async (msgs, ao, tempo) => {
          const limites = limitesDaChamada(tempo);
          const pedido = {
            model: MODELO,
            max_tokens: 4000,
            output_config: { effort: "low" as const },
            ...(comFallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
            // marcas de cache (3 de 4): ferramentas + instruções fixas; o contexto do pet shop; e a conversa até a última
            // mensagem (automática, anda junto com as voltas: a volta seguinte e o pedido seguinte leem do cache)
            cache_control: { type: "ephemeral" as const },
            system: [
              { type: "text" as const, text: INSTRUCOES, cache_control: { type: "ephemeral" as const } },
              { type: "text" as const, text: contextoDoPetshop(c), cache_control: { type: "ephemeral" as const } },
            ],
            tools: ferramentasPara(c),
            messages: msgs,
          };
          if (DE_TESTE) return modeloDeTeste(msgs, ao, contextoDoPetshop(c));
          if (!emitir) return cliente.beta.messages.create(pedido, { signal: parar.signal, ...limites });
          const fluxo = cliente.beta.messages.stream(pedido, { signal: parar.signal, ...limites });
          fluxo.on("text", (d) => ao.texto(d));
          fluxo.on("streamEvent", (e) => { if (e.type === "content_block_start" && e.content_block.type === "tool_use") ao.ferramenta(e.content_block.name); });
          return fluxo.finalMessage();
        },
      });
      if (r.tipo === "limite") return motivoDaRecusa === "fechado" ? falha(403, "so_consulta", FECHADO_TEXTO) : motivoDaRecusa === "recusado" ? falha(503, "fora", FORA_DO_AR) : falha(429, "limite", textoDoLimite(motivoDaRecusa));
      if (r.tipo === "recusa") { await medir("recusa"); return { status: 200, corpo: { mensagens: r.mensagens, texto: "Com isso eu não consigo ajudar. Posso cuidar da agenda, dos clientes, do caixa e do estoque.", propostas: [], parciais: [], links: [], mudou } }; }
      if (r.propostas.length) {
        await Promise.all([guardarConversa([r.texto, ...r.propostas.map((p) => `[cartão] ${p.resumo.titulo}`)].filter(Boolean).join("\n")), medir("cartao")]);
        return { status: 200, corpo: { mensagens, texto: r.texto, propostas: r.propostas, parciais: r.parciais, links: r.links, mudou } };
      }
      await Promise.all([guardarConversa(r.texto || "Pronto."), medir(r.cortou ? "demorou" : "ok")]);
      return { status: 200, corpo: { mensagens, texto: r.texto || "Pronto.", propostas: [], parciais: [], links: r.links, mudou } };
    } catch (err) {
      if (parar.signal.aborted) return { status: 499, corpo: { erro: "cancelado", mensagem: "" } };
      if (err instanceof Anthropic.RateLimitError) return falha(429, "ocupado", "O Mozart está com muitos pedidos agora. Tente de novo em um minuto.");
      if (err instanceof Anthropic.AuthenticationError) { console.error("[assistente] chave recusada pela Anthropic"); return falha(503, "sem_chave", FORA_DO_AR); }
      if (err instanceof Anthropic.APIError) { await registrarErroServidor("/api/gestao/assistente", Object.assign(new Error(`Anthropic respondeu ${err.status ?? "sem status"}`), { name: "ErroDaIA" }), { petshop: c.petshop.id }); return falha(502, "ia_fora", "O Mozart não respondeu agora. Tente de novo em instantes."); }
      // o motivo vai para o registro do servidor; a pessoa vê só a frase
      console.error("[assistente] falha", err);
      await registrarErroServidor("/api/gestao/assistente", err, { petshop: c.petshop.id });
      return falha(500, "falha", "Algo deu errado do nosso lado. Tente de novo em instantes.", { tipo: err instanceof Error ? err.name : typeof err });
    }
  };

  if (!aosPoucos) {
    const r = await rodar();
    return NextResponse.json(r.corpo, { status: r.status });
  }

  // aos poucos: uma linha JSON por evento; o último ("fim") traz o corpo completo e o status
  const cod = new TextEncoder();
  let aberto = true;
  const corrente = new ReadableStream<Uint8Array>({
    async start(ctl) {
      const enviar = (e: Record<string, unknown>) => { if (!aberto) return; try { ctl.enqueue(cod.encode(`${JSON.stringify(e)}\n`)); } catch { aberto = false; } };
      const r = await rodar(enviar);
      enviar({ t: "fim", status: r.status, ...r.corpo });
      if (aberto) { aberto = false; try { ctl.close(); } catch { /* já fechou */ } }
    },
    cancel() { aberto = false; parar.abort(); },
  });
  // nada de guardar a resposta no meio do caminho: sem cache, sem compressão (no-transform) e sem buffer de proxy
  return new Response(corrente, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache, no-store, no-transform", "x-accel-buffering": "no", "content-encoding": "identity" } });
}

export const POST = comRegistro("/api/gestao/assistente", tratar);
