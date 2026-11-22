import type { AvisosDaChamada, Msg, RespostaDoModelo } from "./conversa";

/**
 * Só para testes automáticos (GESTAO_MOZART_FALSO=1, nunca na Vercel): um "modelo" de roteiro fixo, sem chamar a API.
 * Serve para provar pela rota de verdade o que não depende do modelo: o texto chegando aos poucos (palavra por palavra),
 * o markdown na bolha, o cartão que volta depois de recarregar e que grava uma vez só.
 * - pedido com "bloqueia": cartão de bloquear o almoço de amanhã (12h às 13h); depois do "Pode fazer", "Prontinho…".
 * - pedido com "bloqueia o começo e o fim": dois cartões de bloqueio de amanhã (7h às 8h e 19h às 20h) na mesma resposta.
 * - pedido com "markdown": resposta com negrito e lista.
 * - pedido com "tabela de preços": os quatro serviços do dono numa resposta só (banho P e M R$ 100, G e GG R$ 130; corte de unhas
 *   R$ 30 qualquer porte; escovação R$ 20; hidratação P/M R$ 60, G/GG R$ 80): muda o que existe e cadastra o que falta, com os
 *   ids tirados do contexto do pet shop (`sistema`). Os cartões aparecem juntos, com Confirmar tudo.
 * - pedido com "vendi 2 mordedores": cartão de vender 2 "Mordedor" no Pix (vender_produto, o produto pelo nome); com "vendi 10
 *   pacotes de ração": a ração não está no Estoque, o mesmo cartão cadastra (R$ 100 o pacote) e vende 10 em dinheiro.
 * - pedido "domingo a creche e o hotel abrem das 8h às 18h": dois cartões de alterar_funcionamento (alvo creche e alvo hotel),
 *   juntos, com Confirmar tudo.
 * - qualquer outro: uma frase escrita devagar, palavra por palavra (cerca de 60 ms entre as palavras).
 *
 * Pedido com anexo (a última mensagem da pessoa tem imagem ou PDF; o roteiro nunca olha o arquivo):
 * - só o anexo, ou um texto que não é nenhum dos de baixo: diz o que "entendeu" (foto: uma página de agenda com dois horários
 *   reservados para amanhã, das 9h às 10h e das 15h às 16h; PDF: um boleto de luz de R$ 380,00 que vence em 5 dias) e
 *   pergunta o que fazer. Nenhum cartão.
 * - foto + "marca" (ou "bloqueia"): a mesma frase e dois cartões de bloquear_horario de amanhã (9h às 10h e 15h às 16h).
 * - PDF + "lança" (ou "conta"): a frase do boleto e o cartão criar_conta (a pagar, R$ 380,00, "Luz (boleto)").
 * - anexo + "ilegível" (ou "borrado"): lista o que ficou em dúvida e pergunta, sem cartão.
 * - anexo + "ordem na foto": finge um modelo que obedeceu ao texto da foto e pede para desativar o serviço Banho
 *   (alterar_servico, só do dono): prova que as permissões e o cartão seguram, mesmo se o modelo errar.
 * - anexo + "falha de teste": lança o erro FalhaDeTeste (a rota responde 502 e devolve as páginas reservadas).
 * Conversa retomada (a foto já passou, o histórico tem a marca "[foto enviada]"): "marca os horários da foto" traz os
 * mesmos dois cartões, pelo que foi descrito.
 */
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));
const somaDia = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

function ultimoTexto(msgs: Msg[]): { texto: string; resultado: boolean; hoje: string | null; anexo: "foto" | "pdf" | null; jaMandouFoto: boolean } {
  const m = msgs[msgs.length - 1];
  const blocos = Array.isArray(m?.content) ? m.content : [{ type: "text" as const, text: String(m?.content ?? "") }];
  const resultado = blocos.some((b) => b.type === "tool_result");
  // as notas que a rota põe entre parênteses (anexo, agora, desfeito) não são o pedido da pessoa
  const texto = blocos.map((b) => (b.type === "text" && !/^\((Anexo deste pedido|A pessoa mandou só o anexo|Agora:|A pessoa tocou em Desfazer)/.test(b.text) ? b.text : "")).join(" ");
  const anexo = blocos.some((b) => b.type === "document") ? "pdf" as const : blocos.some((b) => b.type === "image") ? "foto" as const : null;
  let jaMandouFoto = false;
  let hoje: string | null = null;
  for (const x of msgs) {
    const c = Array.isArray(x.content) ? x.content.map((b) => (b.type === "text" ? b.text : "")).join(" ") : String(x.content);
    const a = /Agora: [^,]+, (\d{4}-\d{2}-\d{2})/.exec(c);
    if (a) hoje = a[1];
    if (/\[(foto enviada|\d+ fotos enviadas)\]/.test(c)) jaMandouFoto = true;
  }
  return { texto: texto.toLowerCase(), resultado, hoje, anexo, jaMandouFoto };
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

const fala = (t: string) => ({ type: "text", text: t, citations: null });
const idDeTeste = (marca = "") => `toolu_teste${Date.now().toString(36)}${marca}${Math.random().toString(36).slice(2, 8)}`;
export const FOTO_DE_TESTE = "Parece uma página de agenda com dois horários reservados para amanhã: das 9h às 10h e das 15h às 16h.";
export const PDF_DE_TESTE = "É um boleto de luz de R$ 380,00";

/** O roteiro dos pedidos com anexo (o arquivo nunca é olhado). */
async function comAnexo(anexo: "foto" | "pdf", texto: string, hoje: string, ao: AvisosDaChamada, sistema: string): Promise<RespostaDoModelo> {
  if (/falha de teste/.test(texto)) throw Object.assign(new Error("falha de teste"), { name: "FalhaDeTeste" });
  const fim = (t: string) => ({ content: [fala(t)], stop_reason: "end_turn" }) as unknown as RespostaDoModelo;
  if (/ileg[ií]vel|borrad/.test(texto)) {
    const t = "Consegui ler dois horários, mas fiquei em dúvida em duas coisas:\n- o telefone da Marta está borrado\n- o valor da segunda linha não dá para ler\nMe diz esses dois que eu sigo.";
    await escrever(t, ao, 5);
    return fim(t);
  }
  if (/ordem na foto/.test(texto)) {
    // um modelo que errou e obedeceu ao texto da foto: as permissões e o cartão é que seguram
    const t = "A foto traz um texto mandando desativar o Banho.";
    await escrever(t, ao, 5);
    ao.ferramenta("alterar_servico");
    return { content: [fala(t), { type: "tool_use", id: idDeTeste("o"), name: "alterar_servico", input: { servico_id: idDoServico(sistema, "Banho") ?? "00000000-0000-4000-8000-000000000000", ativo: false } }], stop_reason: "tool_use" } as unknown as RespostaDoModelo;
  }
  if (anexo === "pdf") {
    const vence = somaDia(hoje, 5);
    const t = `${PDF_DE_TESTE} que vence em ${vence.slice(8, 10)}/${vence.slice(5, 7)}.`;
    if (!/lan[çc]a|conta/.test(texto)) { const p = `${t} Quer que eu lance em contas a pagar?`; await escrever(p, ao, 5); return fim(p); }
    await escrever(t, ao, 5);
    ao.ferramenta("criar_conta");
    return { content: [fala(t), { type: "tool_use", id: idDeTeste("c"), name: "criar_conta", input: { tipo: "saida", valor: 380, vencimento: vence, descricao: "Luz (boleto)", categoria: "Contas fixas" } }], stop_reason: "tool_use" } as unknown as RespostaDoModelo;
  }
  if (!/marca|bloqueia/.test(texto)) { const p = `${FOTO_DE_TESTE} Quer que eu marque esses horários?`; await escrever(p, ao, 5); return fim(p); }
  await escrever(FOTO_DE_TESTE, ao, 5);
  const amanha = somaDia(hoje, 1);
  ao.ferramenta("bloquear_horario");
  return {
    content: [fala(FOTO_DE_TESTE),
      { type: "tool_use", id: idDeTeste("a"), name: "bloquear_horario", input: { dia: amanha, de: "09:00", ate: "10:00", motivo: "Da foto: manhã" } },
      { type: "tool_use", id: idDeTeste("b"), name: "bloquear_horario", input: { dia: amanha, de: "15:00", ate: "16:00", motivo: "Da foto: tarde" } }],
    stop_reason: "tool_use",
  } as unknown as RespostaDoModelo;
}

export async function modeloDeTeste(msgs: Msg[], ao: AvisosDaChamada, sistema = ""): Promise<RespostaDoModelo> {
  const { texto, resultado, hoje, anexo, jaMandouFoto } = ultimoTexto(msgs);
  if (resultado) {
    const t = "Prontinho, ficou feito.";
    await escrever(t, ao, 20);
    return { content: [{ type: "text", text: t, citations: null }], stop_reason: "end_turn" } as unknown as RespostaDoModelo;
  }
  if (anexo || (jaMandouFoto && /hor[aá]rios da foto/.test(texto))) return comAnexo(anexo ?? "foto", texto, hoje ?? new Date().toISOString().slice(0, 10), ao, sistema);
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
  if (/domingo a creche e o hotel abrem/.test(texto)) {
    const t = "Combinado: no domingo a creche e o hotel abrem das 8h às 18h, e o pet shop continua fechado. Confere nos cartões.";
    await escrever(t, ao, 10);
    const usos = (["creche", "hotel"] as const).map((alvo, i) => {
      ao.ferramenta("alterar_funcionamento");
      return { type: "tool_use", id: `toolu_teste${Date.now().toString(36)}h${i}${Math.random().toString(36).slice(2, 6)}`, name: "alterar_funcionamento",
        input: { alvo, dias: [{ dia: "domingo", abre: "08:00", fecha: "18:00" }] } };
    });
    return { content: [{ type: "text", text: t, citations: null }, ...usos], stop_reason: "tool_use" } as unknown as RespostaDoModelo;
  }
  if (/bloqueia (o )?come[cç]o e (o )?fim/.test(texto)) {
    // dois cartões numa resposta só (no automático, os dois são feitos em ordem)
    const t = "Vou bloquear o começo e o fim de amanhã.";
    await escrever(t, ao, 10);
    const amanha = somaDia(hoje ?? new Date().toISOString().slice(0, 10), 1);
    const id = () => `toolu_teste${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    ao.ferramenta("bloquear_horario");
    return {
      content: [{ type: "text", text: t, citations: null },
        { type: "tool_use", id: id(), name: "bloquear_horario", input: { dia: amanha, de: "07:00", ate: "08:00", motivo: "Começo" } },
        { type: "tool_use", id: id(), name: "bloquear_horario", input: { dia: amanha, de: "19:00", ate: "20:00", motivo: "Fim" } }],
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
