import type { AvisosDaChamada, Msg, RespostaDoModelo } from "./conversa";

/**
 * Só para testes automáticos (GESTAO_MOZART_FALSO=1, nunca na Vercel): um "modelo" de roteiro fixo, sem chamar a API.
 * Serve para provar pela rota de verdade o que não depende do modelo: o texto chegando aos poucos (palavra por palavra),
 * o markdown na bolha, o cartão que volta depois de recarregar e que grava uma vez só.
 * - pedido com "bloqueia": cartão de bloquear o almoço de amanhã (12h às 13h); depois do "Pode fazer", "Prontinho…".
 * - pedido com "markdown": resposta com negrito e lista.
 * - qualquer outro: uma frase escrita devagar, palavra por palavra (cerca de 60 ms entre as palavras).
 */
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const somaDia = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

function ultimoTexto(msgs: Msg[]): { texto: string; resultado: boolean; hoje: string | null } {
  const m = msgs[msgs.length - 1];
  const blocos = Array.isArray(m?.content) ? m.content : [{ type: "text" as const, text: String(m?.content ?? "") }];
  const resultado = blocos.some((b) => b.type === "tool_result");
  const texto = blocos.map((b) => (b.type === "text" ? b.text : "")).join(" ");
  let hoje: string | null = null;
  for (const x of msgs) {
    const c = Array.isArray(x.content) ? x.content.map((b) => (b.type === "text" ? b.text : "")).join(" ") : String(x.content);
    const a = /Agora: [^,]+, (\d{4}-\d{2}-\d{2})/.exec(c);
    if (a) hoje = a[1];
  }
  return { texto: texto.toLowerCase(), resultado, hoje };
}

async function escrever(texto: string, ao: AvisosDaChamada, ms: number) {
  const partes = texto.match(/\S+\s*/g) ?? [texto];
  for (const p of partes) { ao.texto(p); await espera(ms); }
}

export async function modeloDeTeste(msgs: Msg[], ao: AvisosDaChamada): Promise<RespostaDoModelo> {
  const { texto, resultado, hoje } = ultimoTexto(msgs);
  if (resultado) {
    const t = "Prontinho, ficou feito.";
    await escrever(t, ao, 20);
    return { content: [{ type: "text", text: t, citations: null }], stop_reason: "end_turn" } as unknown as RespostaDoModelo;
  }
  if (/bloqueia/.test(texto)) {
    const t = "Vou bloquear o almoço de amanhã. Confere no cartão e clica em Pode fazer.";
    await escrever(t, ao, 10);
    ao.ferramenta("bloquear_horario");
    return {
      content: [{ type: "text", text: t, citations: null }, { type: "tool_use", id: `toolu_teste${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, name: "bloquear_horario", input: { dia: somaDia(hoje ?? new Date().toISOString().slice(0, 10), 1), de: "12:00", ate: "13:00", motivo: "Almoço" } }],
      stop_reason: "tool_use",
    } as unknown as RespostaDoModelo;
  }
  const t = /markdown/.test(texto)
    ? "Por mês, as contas fixas somam **R$ 2.969,90**, cerca de **R$ 114 por dia**.\n- Aluguel R$ 1.500\n- Luz R$ 380"
    : "Oi! Esta resposta de teste chega palavra por palavra, sem esperar o fim, para a pessoa ir lendo enquanto o Mozart escreve.";
  await escrever(t, ao, /markdown/.test(texto) ? 15 : 60);
  return { content: [{ type: "text", text: t, citations: null }], stop_reason: "end_turn" } as unknown as RespostaDoModelo;
}
