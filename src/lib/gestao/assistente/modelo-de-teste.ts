import type { AvisosDaChamada, Msg, RespostaDoModelo } from "./conversa";

/**
 * Só para testes automáticos (GESTAO_MOZART_FALSO=1, nunca na Vercel): um "modelo" de roteiro fixo, sem chamar a API.
 * Serve para provar pela rota de verdade o que não depende do modelo: o texto chegando aos poucos (palavra por palavra),
 * o markdown na bolha, o cartão que volta depois de recarregar e que grava uma vez só.
 * - pedido com "bloqueia": cartão de bloquear o almoço de amanhã (12h às 13h); depois do "Pode fazer", "Prontinho…".
 * - pedido com "markdown": resposta com negrito e lista.
 * - pedido com "tabela de preços": os quatro serviços do dono numa resposta só (banho P e M R$ 100, G e GG R$ 130; corte de unhas
 *   R$ 30 qualquer porte; escovação R$ 20; hidratação P/M R$ 60, G/GG R$ 80): muda o que existe e cadastra o que falta, com os
 *   ids tirados do contexto do pet shop (`sistema`). Os cartões aparecem juntos, com Confirmar tudo.
 * - pedido com "vendi 2 mordedores": cartão de vender 2 "Mordedor" no Pix (vender_produto, o produto pelo nome); com "vendi 10
 *   pacotes de ração": a ração não está no Estoque, o mesmo cartão cadastra (R$ 100 o pacote) e vende 10 em dinheiro.
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

/** O id de um serviço na lista "Serviços:" do contexto ("- Banho | id … | 60 min…"); null se não está lá. */
function idDoServico(sistema: string, nome: string): string | null {
  const m = new RegExp(`^- ${nome} \\| id ([0-9a-f-]{36})`, "m").exec(sistema);
  return m ? m[1] : null;
}
const PRECOS_TESTE: { nome: string; precos: Record<string, number>; duracao: number }[] = [
  { nome: "Banho", precos: { preco_p: 100, preco_m: 100, preco_g: 130, preco_gg: 130 }, duracao: 60 },
  { nome: "Corte de unhas", precos: { preco: 30 }, duracao: 15 },
  { nome: "Escovação", precos: { preco: 20 }, duracao: 15 },
  { nome: "Hidratação", precos: { preco_p: 60, preco_m: 60, preco_g: 80, preco_gg: 80 }, duracao: 30 },
];

export async function modeloDeTeste(msgs: Msg[], ao: AvisosDaChamada, sistema = ""): Promise<RespostaDoModelo> {
  const { texto, resultado, hoje } = ultimoTexto(msgs);
  if (resultado) {
    const t = "Prontinho, ficou feito.";
    await escrever(t, ao, 20);
    return { content: [{ type: "text", text: t, citations: null }], stop_reason: "end_turn" } as unknown as RespostaDoModelo;
  }
  if (/tabela de pre[cç]os/.test(texto)) {
    const t = "Deixa comigo: são quatro serviços.";
    await escrever(t, ao, 10);
    const usos = PRECOS_TESTE.map((x, i) => {
      const id = idDoServico(sistema, x.nome);
      ao.ferramenta(id ? "alterar_servico" : "criar_servico");
      return { type: "tool_use", id: `toolu_teste${Date.now().toString(36)}p${i}${Math.random().toString(36).slice(2, 6)}`,
        name: id ? "alterar_servico" : "criar_servico", input: id ? { servico_id: id, ...x.precos } : { nome: x.nome, duracao_min: x.duracao, ...x.precos } };
    });
    return { content: [{ type: "text", text: t, citations: null }, ...usos], stop_reason: "tool_use" } as unknown as RespostaDoModelo;
  }
  const venda = /vendi 2 mordedores/.test(texto) ? { itens: [{ produto_nome: "Mordedor", quantidade: 2 }], forma: "pix" }
    : /vendi 10 pacotes de ra[cç][aã]o/.test(texto) ? { itens: [{ produto_nome: "Ração", unidade: "pacote", quantidade: 10, preco_unitario: 100 }], forma: "dinheiro" } : null;
  if (venda) {
    const t = "Anoto a venda e o estoque baixa junto. Confere no cartão.";
    await escrever(t, ao, 10);
    ao.ferramenta("vender_produto");
    return {
      content: [{ type: "text", text: t, citations: null }, { type: "tool_use", id: `toolu_teste${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`, name: "vender_produto", input: venda }],
      stop_reason: "tool_use",
    } as unknown as RespostaDoModelo;
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
