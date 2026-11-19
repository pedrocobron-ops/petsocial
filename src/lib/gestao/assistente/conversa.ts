import type Anthropic from "@anthropic-ai/sdk";
import { definicao, descrever, ehErroDeUso, gravar, rodarConsulta, type Contexto, type LinkZap, type Resumo } from "./ferramentas";
import { manterNomes, nomesDosResultados } from "./parecido";
import { ferramentaLiberada, motivoDaRecusa } from "./permissao";
import { FRASE_JUNTANDO, fraseDaFerramenta, fraseInicial } from "./progresso";
import { semNomesDeFerramenta } from "./sem-nomes";
import { nomeDaCasa } from "../modulos";

/**
 * As voltas de uma conversa com o Mozart, separadas da rota para dar para testar com um modelo de mentira:
 * `voltas` chama o modelo, roda as consultas e para quando há cartão para a pessoa confirmar; `responderCartoes`
 * grava o que a pessoa confirmou. A rota cuida do login, do limite do dia e dos erros da API.
 */

export type Msg = Anthropic.Beta.BetaMessageParam;
export type Resultado = Anthropic.Beta.BetaToolResultBlockParam;
export type Proposta = { id: string; ferramenta: string; resumo: Resumo };
/** Tokens de uma chamada (o que a API devolve em `usage`). */
export type Gasto = { input_tokens?: number | null; output_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
/** O que interessa da resposta do modelo. */
export type RespostaDoModelo = { content: Anthropic.Beta.BetaContentBlock[]; stop_reason: string | null; usage?: Gasto | null };
/**
 * Avisos que a chamada ao modelo dá enquanto ele escreve (só quando a resposta vai aos poucos para a tela):
 * `texto` recebe cada pedaço do que ele fala; `ferramenta` diz que ele começou a pedir uma consulta.
 */
export type AvisosDaChamada = { texto: (pedaco: string) => void; ferramenta: (nome: string) => void };
/** O que a rota mostra enquanto a pessoa espera: o texto aos poucos e a frase do que o Mozart está fazendo. */
export type Avisos = { texto?: (pedaco: string) => void; progresso?: (frase: string) => void };
/** Números do pedido, para o "Tempo do Mozart" (a rota guarda). */
export type Medidas = { voltas: number; ferramentas: number; entrada: number; saida: number; cacheLidos: number; cacheGravados: number };
export const medidasZeradas = (): Medidas => ({ voltas: 0, ferramentas: 0, entrada: 0, saida: 0, cacheLidos: 0, cacheGravados: 0 });

/** Voltas no máximo por pedido (cada volta é uma chamada ao modelo). */
export const MAX_VOLTAS = 6;
/**
 * Tempo máximo de um pedido antes de começar mais uma volta. Uma resposta que ficava dando voltas (procura o pet, procura de
 * novo, consulta as contas…) chegou a levar 50 s; passou disso, o Mozart responde com o que tem.
 */
export const PRAZO_MS = 28_000;
/**
 * Prazo do pedido inteiro, contado desde que a rota começou (a rota tem 60 s; sobra folga para gravar o registro e responder).
 * Cada chamada ao modelo recebe só o tempo que falta, e depois da primeira volta não há nova tentativa.
 */
export const PRAZO_TOTAL_MS = 50_000;
/** Menos que isto de sobra: não começa outra chamada; o Mozart responde com o que tem. */
export const SOBRA_MINIMA_MS = 4_000;
export type TempoDaChamada = { volta: number; restaMs: number };

/**
 * Prazo e tentativas de uma chamada ao modelo: no máximo 25 s e nunca mais do que falta para o prazo total. Na primeira
 * volta, uma nova tentativa cabe (cada uma com metade do que falta, até 25 s); nas seguintes, nenhuma.
 */
export function limitesDaChamada(t: TempoDaChamada | undefined): { timeout: number; maxRetries: number } {
  if (!t) return { timeout: 25_000, maxRetries: 1 };
  const resta = Math.max(1_000, t.restaMs);
  if (t.volta === 0) return { timeout: Math.min(25_000, Math.max(1_000, Math.floor(resta / 2))), maxRetries: 1 };
  return { timeout: Math.min(25_000, resta), maxRetries: 0 };
}

/** O erro é o modelo que não respondeu a tempo (ou a conexão que caiu no meio)? */
export const ehDemoraDoModelo = (e: unknown) => {
  const nome = e instanceof Error ? e.name : "", m = e instanceof Error ? e.message : String(e ?? "");
  return /Timeout|ConnectionError/i.test(nome) || /timed? ?out|timeout|connection error/i.test(m);
};

/**
 * A conta pode gravar? Vale o que o banco diz (`acesso_liberado`: teste que ainda vale ou que venceu com a assinatura
 * fechada, assinatura em dia, cancelada com período pago, e nunca a conta marcada para apagar). Sem a resposta do banco
 * (falha na leitura), a regra antiga pelo status, para o Mozart não travar.
 */
export function contaLiberada(doBanco: unknown, petshop: { status: string; teste_ate: string }, agora = new Date()): boolean {
  if (typeof doBanco === "boolean") return doBanco;
  return ["ativa", "atrasada", "cortesia"].includes(petshop.status) || (petshop.status === "teste" && new Date(petshop.teste_ate) > agora);
}
export const DEMOROU = "Esse pedido está demorando mais que o normal e eu parei por aqui. Pode repetir de um jeito mais direto (por exemplo: o nome do pet, o valor e a forma de pagamento)?";

type Saida =
  | { tipo: "limite" }
  | { tipo: "recusa"; mensagens: Msg[] }
  | { tipo: "ok"; mensagens: Msg[]; texto: string; propostas: Proposta[]; parciais: Resultado[]; links: LinkZap[]; cortou: boolean };

/** Os nomes de pets e tutores que as ferramentas já devolveram nesta conversa. */
function nomesDaConversa(mensagens: Msg[]): string[] {
  const conteudos: string[] = [];
  for (const m of mensagens) {
    if (m.role !== "user" || !Array.isArray(m.content)) continue;
    for (const b of m.content) if (b.type === "tool_result" && typeof b.content === "string") conteudos.push(b.content);
  }
  return nomesDosResultados(conteudos);
}

export async function voltas(o: {
  c: Contexto; mensagens: Msg[]; liberado: boolean;
  chamar: (mensagens: Msg[], avisos: AvisosDaChamada, tempo: TempoDaChamada) => Promise<RespostaDoModelo>;
  /** Quando o pedido começou na rota (padrão: agora) e o prazo total dele (padrão: PRAZO_TOTAL_MS). */
  inicioDoPedido?: number; prazoTotalMs?: number;
  /** Conta uma chamada no dia do pet shop; false: passou do limite. */
  contar: () => Promise<boolean>;
  maxVoltas?: number; prazoMs?: number; relogio?: () => number;
  avisos?: Avisos;
  /** Preenchido durante as voltas (voltas, consultas e tokens). */
  medidas?: Medidas;
}): Promise<Saida> {
  const { c, mensagens, liberado } = o;
  const m = o.medidas ?? medidasZeradas();
  // o texto que já foi para a tela: a fala de uma volta nova começa num parágrafo novo (igual ao texto final)
  let mostrou = false;
  const relogio = o.relogio ?? Date.now;
  const inicio = relogio();
  const links: LinkZap[] = [];
  let texto = "";
  let cortou = false;
  const max = o.maxVoltas ?? MAX_VOLTAS;
  for (let volta = 0; volta < max; volta++) {
    if (volta > 0 && relogio() - inicio > (o.prazoMs ?? PRAZO_MS)) { cortou = true; break; }
    // prazo do pedido inteiro: sem tempo para mais uma chamada, responde com o que tem (a rota não pode passar de 60 s)
    const restaMs = (o.prazoTotalMs ?? PRAZO_TOTAL_MS) - (relogio() - (o.inicioDoPedido ?? inicio));
    if (volta > 0 && restaMs < SOBRA_MINIMA_MS) { cortou = true; break; }
    if (!(await o.contar())) {
      if (!texto) return { tipo: "limite" };
      break;
    }
    let comecouVolta = false;
    // a pessoa sempre lê o que está acontecendo, mesmo quando o modelo demora para escrever ou pedir uma consulta
    o.avisos?.progresso?.(volta === 0 ? fraseInicial(mensagens) : FRASE_JUNTANDO);
    let resposta: RespostaDoModelo;
    try {
      resposta = await o.chamar(mensagens, {
        texto: (pedaco) => {
          if (!pedaco || !o.avisos?.texto) return;
          if (!comecouVolta) { comecouVolta = true; if (mostrou) o.avisos.texto("\n\n"); }
          mostrou = true;
          o.avisos.texto(pedaco);
        },
        ferramenta: (nome) => o.avisos?.progresso?.(fraseDaFerramenta(nome, undefined, c.agora, definicao(nome)?.grava, nomeDaCasa(c.petshop))),
      }, { volta, restaMs });
    } catch (err) {
      // depois da primeira volta, o modelo que não respondeu a tempo não derruba o pedido: o Mozart responde com o que já tem
      if (volta > 0 && ehDemoraDoModelo(err)) { cortou = true; break; }
      throw err;
    }
    m.voltas++;
    m.entrada += resposta.usage?.input_tokens ?? 0;
    m.saida += resposta.usage?.output_tokens ?? 0;
    m.cacheLidos += resposta.usage?.cache_read_input_tokens ?? 0;
    m.cacheGravados += resposta.usage?.cache_creation_input_tokens ?? 0;
    mensagens.push({ role: "assistant", content: resposta.content as Extract<Msg, { role: "assistant" }>["content"] });
    // nomes de pets e tutores como estão no cadastro (o modelo às vezes troca o fim: "Tutora" por "Tutor")
    // e nunca o nome interno de uma consulta ("resumo_financeiro")
    const fala = semNomesDeFerramenta(manterNomes(resposta.content.filter((b) => b.type === "text").map((b) => (b.type === "text" ? b.text : "")).join("\n").trim(), nomesDaConversa(mensagens)));
    if (fala) texto = texto ? `${texto}\n\n${fala}` : fala;

    if (resposta.stop_reason === "refusal") return { tipo: "recusa", mensagens: mensagens.slice(0, -1) };
    if (resposta.stop_reason !== "tool_use") break;
    if (volta === max - 1) cortou = true;

    const usos = resposta.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    m.ferramentas += usos.length;
    // um resultado por pedido do modelo, na ordem em que ele pediu (os cartões ficam de fora)
    const porPedido: (Resultado | null)[] = usos.map(() => null);
    const linksPorPedido: LinkZap[][] = usos.map(() => []);
    // as consultas (só leem) rodam todas ao mesmo tempo
    const consultas = usos.map((uso, i) => ({ uso, i, def: definicao(uso.name) })).filter((x) => x.def && ferramentaLiberada(x.def, c) && !x.def.grava);
    for (const { uso } of consultas) o.avisos?.progresso?.(fraseDaFerramenta(uso.name, uso.input, c.agora, false, nomeDaCasa(c.petshop)));
    await Promise.all(consultas.map(async ({ uso, i }) => {
      const r = await rodarConsulta(c, uso.name, uso.input);
      if (r.links) linksPorPedido[i] = r.links;
      porPedido[i] = { type: "tool_result", tool_use_id: uso.id, content: r.conteudo, is_error: r.erro };
    }));
    for (const l of linksPorPedido) links.push(...l);
    // o resto, em ordem: ferramenta fora do alcance, conta só para consulta e os cartões (que só descrevem, nada é gravado)
    const propostas: Proposta[] = [];
    for (let i = 0; i < usos.length; i++) {
      const uso = usos[i];
      if (porPedido[i]) continue;
      const def = definicao(uso.name);
      if (!def || !ferramentaLiberada(def, c)) { porPedido[i] = { type: "tool_result", tool_use_id: uso.id, is_error: true, content: motivoDaRecusa(def, c) }; continue; }
      if (!liberado) { porPedido[i] = { type: "tool_result", tool_use_id: uso.id, is_error: true, content: "A conta está só para consulta (teste vencido ou assinatura inativa). Diga isso à pessoa e indique a tela Assinatura." }; continue; }
      try {
        propostas.push({ id: uso.id, ferramenta: uso.name, resumo: await descrever(c, uso.name, uso.input as Record<string, unknown>) });
      } catch (err) {
        porPedido[i] = { type: "tool_result", tool_use_id: uso.id, is_error: true, content: ehErroDeUso(err) ? err.message : "Não consegui preparar essa ação." };
      }
    }
    const parciais = porPedido.filter((r): r is Resultado => r !== null);
    // há algo para a pessoa confirmar: para aqui e espera os botões
    if (propostas.length) return { tipo: "ok", mensagens, texto: semPedidoDeConfirmar(texto, true), propostas, parciais, links, cortou: false };
    mensagens.push({ role: "user", content: parciais });
  }
  if (cortou && !texto) texto = DEMOROU;
  return { tipo: "ok", mensagens, texto: semPedidoDeConfirmar(texto, false), propostas: [], parciais: [], links, cortou };
}

const JA_GRAVADA = "Esta ação já tinha sido gravada (o pedido chegou repetido). Nada foi gravado de novo.";
/** Cartões confirmados juntos (Confirmar tudo) gravam em ordem; o primeiro que falha para os que vêm depois dele. */
export const PAROU_ANTES = "Não foi feito: uma ação anterior desta leva não deu certo, então parei ali para nada ficar pela metade. Nada foi gravado desta. Diga o que deu errado e pergunte se quer tentar de novo.";

/**
 * O texto que acompanha os cartões não pede confirmação: o cartão já tem os botões, e depois do "Pode fazer" a frase
 * "Confere no cartão e clica em Pode fazer" fica errada embaixo de um cartão confirmado. Tira as frases que mandam conferir
 * ou confirmar no cartão. Se não sobrar nada: com cartão, vazio (o cartão fala por si); sem cartão, o texto como veio.
 */
export function semPedidoDeConfirmar(texto: string, temCartao: boolean): string {
  if (!texto) return texto;
  const pede = /pode fazer|(confere|confira|conferir|confirma|confirme|confirmar|confirmação)[^.!?\n]*(cart[ãa]o|bot[ãa]o|abaixo|acima)|(no|o) cart[ãa]o[^.!?\n]*(confirm|confer)|está aí para (você )?confirmar/i;
  const linhas = texto.split("\n").map((linha) => {
    const frases = linha.match(/[^.!?]+[.!?]*\s*/g) ?? [linha];
    return frases.filter((f) => !pede.test(f)).join("").trim();
  });
  const limpo = linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (limpo) return limpo;
  return temCartao ? "" : texto;
}

/**
 * Grava o que a pessoa confirmou nos cartões e devolve o resultado de cada ferramenta (na ordem dos pedidos do modelo).
 * Vários cartões da mesma resposta (confirmados um a um ou com "Confirmar tudo") gravam em ordem; se um confirmado falha,
 * os confirmados depois dele não gravam (PAROU_ANTES) e o modelo conta à pessoa o que ficou feito e o que não.
 */
export async function responderCartoes(o: {
  c: Contexto; pendentes: Anthropic.Beta.BetaToolUseBlockParam[] | Anthropic.Beta.BetaContentBlockParam[]; liberado: boolean;
  decisoes?: { id: string; ok: boolean }[]; parciais?: Resultado[];
  /** Anota no histórico do pet shop o que foi feito (a rota grava em assistente_eventos). */
  anotar?: (acao: string, detalhes: unknown) => Promise<void>;
  /**
   * Cada cartão grava uma vez só (a conversa volta depois de recarregar a página e a confirmação pode chegar de novo):
   * `reservar` marca a ação antes de gravar (false: já foi gravada); `liberar` solta a marca quando a gravação falha.
   * A rota usa as funções do banco `assistente_acao_reservar` e `assistente_acao_liberar`.
   */
  reservar?: (usoId: string) => Promise<boolean>;
  liberar?: (usoId: string) => Promise<void>;
}): Promise<{ resultados: Resultado[]; mudou: boolean }> {
  const { c, liberado } = o;
  const resultados: Resultado[] = [];
  let mudou = false;
  let falhou = false;
  for (const uso of o.pendentes) {
    if (uso.type !== "tool_use") continue;
    const parcial = o.parciais?.find((r) => r.tool_use_id === uso.id);
    if (parcial) { resultados.push({ type: "tool_result", tool_use_id: uso.id, content: typeof parcial.content === "string" ? parcial.content : "", is_error: Boolean(parcial.is_error) }); continue; }
    const def = definicao(uso.name);
    const decisao = o.decisoes?.find((d) => d.id === uso.id);
    if (!def?.grava || !decisao?.ok) { resultados.push({ type: "tool_result", tool_use_id: uso.id, content: "A pessoa descartou esta ação. Nada foi gravado." }); continue; }
    if (falhou) { resultados.push({ type: "tool_result", tool_use_id: uso.id, is_error: true, content: PAROU_ANTES }); continue; }
    // a conversa vem do navegador: confere de novo se esta pessoa pode usar a ferramenta (igual à volta do modelo)
    if (!ferramentaLiberada(def, c)) { falhou = true; resultados.push({ type: "tool_result", tool_use_id: uso.id, is_error: true, content: motivoDaRecusa(def, c) }); continue; }
    if (!liberado) { falhou = true; resultados.push({ type: "tool_result", tool_use_id: uso.id, content: "A conta está só para consulta (teste vencido ou assinatura inativa). Nada foi gravado.", is_error: true }); continue; }
    if (o.reservar && !(await o.reservar(uso.id))) { resultados.push({ type: "tool_result", tool_use_id: uso.id, content: JA_GRAVADA }); continue; }
    let gravou = false;
    try {
      // a chave desta ação: se o mesmo pedido chegar duas vezes (toque duplo, internet que repetiu), o banco grava uma vez só
      c.chave = `mozart:${uso.id}`;
      const r = await gravar(c, uso.name, uso.input as Record<string, unknown>);
      gravou = true;
      mudou = true;
      await o.anotar?.(uso.name, uso.input);
      resultados.push({ type: "tool_result", tool_use_id: uso.id, content: JSON.stringify(r) });
    } catch (err) {
      if (err instanceof Error && /_chave_uniq/.test(err.message)) { resultados.push({ type: "tool_result", tool_use_id: uso.id, content: JA_GRAVADA }); continue; }
      // não gravou: a pessoa pode tentar de novo
      if (!gravou && o.liberar) await o.liberar(uso.id).catch(() => undefined);
      falhou = true;
      const semPermissao = err instanceof Error && /row-level security|permission denied/i.test(err.message);
      resultados.push({ type: "tool_result", tool_use_id: uso.id, is_error: true, content: ehErroDeUso(err) ? err.message : semPermissao ? "Sem permissão para gravar isso." : "Não consegui gravar agora." });
    } finally {
      c.chave = undefined;
    }
  }
  return { resultados, mudou };
}
