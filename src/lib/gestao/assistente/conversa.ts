import type Anthropic from "@anthropic-ai/sdk";
import { definicao, descrever, ehErroDeUso, gravar, rodarConsulta, type Contexto, type LinkZap, type Resumo } from "./ferramentas";
import { manterNomes, nomesDosResultados } from "./parecido";
import { ferramentaLiberada } from "./permissao";

/**
 * As voltas de uma conversa com o Mozart, separadas da rota para dar para testar com um modelo de mentira:
 * `voltas` chama o modelo, roda as consultas e para quando há cartão para a pessoa confirmar; `responderCartoes`
 * grava o que a pessoa confirmou. A rota cuida do login, do limite do dia e dos erros da API.
 */

export type Msg = Anthropic.Beta.BetaMessageParam;
export type Resultado = Anthropic.Beta.BetaToolResultBlockParam;
export type Proposta = { id: string; ferramenta: string; resumo: Resumo };
/** O que interessa da resposta do modelo. */
export type RespostaDoModelo = { content: Anthropic.Beta.BetaContentBlock[]; stop_reason: string | null };

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
  chamar: (mensagens: Msg[]) => Promise<RespostaDoModelo>;
  /** Conta uma chamada no dia do pet shop; false: passou do limite. */
  contar: () => Promise<boolean>;
  maxVoltas?: number; prazoMs?: number; relogio?: () => number;
}): Promise<Saida> {
  const { c, mensagens, liberado } = o;
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
    const resposta = await o.chamar(mensagens);
    mensagens.push({ role: "assistant", content: resposta.content as Extract<Msg, { role: "assistant" }>["content"] });
    // nomes de pets e tutores como estão no cadastro (o modelo às vezes troca o fim: "Tutora" por "Tutor")
    const fala = manterNomes(resposta.content.filter((b) => b.type === "text").map((b) => (b.type === "text" ? b.text : "")).join("\n").trim(), nomesDaConversa(mensagens));
    if (fala) texto = texto ? `${texto}\n\n${fala}` : fala;

    if (resposta.stop_reason === "refusal") return { tipo: "recusa", mensagens: mensagens.slice(0, -1) };
    if (resposta.stop_reason !== "tool_use") break;
    if (volta === max - 1) cortou = true;

    const parciais: Resultado[] = [];
    const propostas: Proposta[] = [];
    for (const uso of resposta.content) {
      if (uso.type !== "tool_use") continue;
      const def = definicao(uso.name);
      if (!def || !ferramentaLiberada(def, c)) { parciais.push({ type: "tool_result", tool_use_id: uso.id, is_error: true, content: "Ferramenta indisponível para esta pessoa." }); continue; }
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
    if (propostas.length) return { tipo: "ok", mensagens, texto, propostas, parciais, links, cortou: false };
    mensagens.push({ role: "user", content: parciais });
  }
  if (cortou && !texto) texto = DEMOROU;
  return { tipo: "ok", mensagens, texto, propostas: [], parciais: [], links, cortou };
}

/** Grava o que a pessoa confirmou nos cartões e devolve o resultado de cada ferramenta (na ordem dos pedidos do modelo). */
export async function responderCartoes(o: {
  c: Contexto; pendentes: Anthropic.Beta.BetaToolUseBlockParam[] | Anthropic.Beta.BetaContentBlockParam[]; liberado: boolean;
  decisoes?: { id: string; ok: boolean }[]; parciais?: Resultado[];
  /** Anota no histórico do pet shop o que foi feito (a rota grava em assistente_eventos). */
  anotar?: (acao: string, detalhes: unknown) => Promise<void>;
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
    try {
      // a chave desta ação: se o mesmo pedido chegar duas vezes (toque duplo, internet que repetiu), o banco grava uma vez só
      c.chave = `mozart:${uso.id}`;
      const r = await gravar(c, uso.name, uso.input as Record<string, unknown>);
      mudou = true;
      await o.anotar?.(uso.name, uso.input);
      resultados.push({ type: "tool_result", tool_use_id: uso.id, content: JSON.stringify(r) });
    } catch (err) {
      if (err instanceof Error && /_chave_uniq/.test(err.message)) { resultados.push({ type: "tool_result", tool_use_id: uso.id, content: "Esta ação já tinha sido gravada (o pedido chegou repetido). Nada foi gravado de novo." }); continue; }
      const semPermissao = err instanceof Error && /row-level security|permission denied/i.test(err.message);
      resultados.push({ type: "tool_result", tool_use_id: uso.id, is_error: true, content: ehErroDeUso(err) ? err.message : semPermissao ? "Sem permissão para gravar isso." : "Não consegui gravar agora." });
    } finally {
      c.chave = undefined;
    }
  }
  return { resultados, mudou };
}
