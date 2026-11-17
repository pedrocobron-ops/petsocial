import type Anthropic from "@anthropic-ai/sdk";
import { definicao, descrever, ehErroDeUso, gravar, rodarConsulta, type Contexto, type LinkZap, type Resumo } from "./ferramentas";
import { manterNomes, nomesDosResultados } from "./parecido";
import { ferramentaLiberada } from "./permissao";
import { fraseDaFerramenta } from "./progresso";
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
  chamar: (mensagens: Msg[], avisos: AvisosDaChamada) => Promise<RespostaDoModelo>;
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
    if (!(await o.contar())) {
      if (!texto) return { tipo: "limite" };
      break;
    }
    let comecouVolta = false;
    const resposta = await o.chamar(mensagens, {
      texto: (pedaco) => {
        if (!pedaco || !o.avisos?.texto) return;
        if (!comecouVolta) { comecouVolta = true; if (mostrou) o.avisos.texto("\n\n"); }
        mostrou = true;
        o.avisos.texto(pedaco);
      },
      ferramenta: (nome) => o.avisos?.progresso?.(fraseDaFerramenta(nome, undefined, c.agora, definicao(nome)?.grava, nomeDaCasa(c.petshop))),
    });
    m.voltas++;
    m.entrada += resposta.usage?.input_tokens ?? 0;
    m.saida += resposta.usage?.output_tokens ?? 0;
    m.cacheLidos += resposta.usage?.cache_read_input_tokens ?? 0;
    m.cacheGravados += resposta.usage?.cache_creation_input_tokens ?? 0;
    mensagens.push({ role: "assistant", content: resposta.content as Extract<Msg, { role: "assistant" }>["content"] });
    // nomes de pets e tutores como estão no cadastro (o modelo às vezes troca o fim: "Tutora" por "Tutor")
    const fala = manterNomes(resposta.content.filter((b) => b.type === "text").map((b) => (b.type === "text" ? b.text : "")).join("\n").trim(), nomesDaConversa(mensagens));
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
      if (!def || !ferramentaLiberada(def, c)) { porPedido[i] = { type: "tool_result", tool_use_id: uso.id, is_error: true, content: "Ferramenta indisponível para esta pessoa." }; continue; }
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

/** Grava o que a pessoa confirmou nos cartões e devolve o resultado de cada ferramenta (na ordem dos pedidos do modelo). */
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
  for (const uso of o.pendentes) {
    if (uso.type !== "tool_use") continue;
    const parcial = o.parciais?.find((r) => r.tool_use_id === uso.id);
    if (parcial) { resultados.push({ type: "tool_result", tool_use_id: uso.id, content: typeof parcial.content === "string" ? parcial.content : "", is_error: Boolean(parcial.is_error) }); continue; }
    const def = definicao(uso.name);
    const decisao = o.decisoes?.find((d) => d.id === uso.id);
    if (!def?.grava || !decisao?.ok) { resultados.push({ type: "tool_result", tool_use_id: uso.id, content: "A pessoa descartou esta ação. Nada foi gravado." }); continue; }
    // a conversa vem do navegador: confere de novo se esta pessoa pode usar a ferramenta (igual à volta do modelo)
    if (!ferramentaLiberada(def, c)) { resultados.push({ type: "tool_result", tool_use_id: uso.id, is_error: true, content: "Ferramenta indisponível para esta pessoa. Nada foi gravado." }); continue; }
    if (!liberado) { resultados.push({ type: "tool_result", tool_use_id: uso.id, content: "A conta está só para consulta (teste vencido ou assinatura inativa). Nada foi gravado.", is_error: true }); continue; }
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
      const semPermissao = err instanceof Error && /row-level security|permission denied/i.test(err.message);
      resultados.push({ type: "tool_result", tool_use_id: uso.id, is_error: true, content: ehErroDeUso(err) ? err.message : semPermissao ? "Sem permissão para gravar isso." : "Não consegui gravar agora." });
    } finally {
      c.chave = undefined;
    }
  }
  return { resultados, mudou };
}
