import { saudacaoZap } from "./agenda";
import { opcao } from "./opcoes";
import { brl, dataCompleta, deIsoDia } from "./util";

/**
 * Opções de cobrança e de comissão (ficam em `petshops.opcoes`). Tudo desligado por padrão:
 * quem nunca mexeu continua como sempre foi. O dono liga em Meu pet shop, Opções de cobrança.
 */
export const OPCOES_DINHEIRO = {
  /** Multa e juros por atraso: quando ligado, a conta atrasada mostra o valor atualizado sugerido. Nunca entra sozinho. */
  multa: "dinheiro.multa",
  /** Multa fixa em reais, cobrada uma vez. */
  multaFixa: "dinheiro.multa_fixa",
  /** Multa em % do que falta, cobrada uma vez. */
  multaPct: "dinheiro.multa_pct",
  /** Juros em % ao mês de atraso (conta por dia). */
  jurosMesPct: "dinheiro.juros_mes_pct",
  /** A mensagem de cobrança mostra a multa e os juros? */
  multaNaMensagem: "dinheiro.multa_na_mensagem",
  /** Chave Pix que aparece nas mensagens de cobrança (texto livre). */
  pix: "dinheiro.pix",
  /** Modelo da mensagem de cobrança. Vazio = o modelo padrão. */
  modelo: "dinheiro.cobranca_modelo",
  /** Só o dono e quem vê o financeiro mudam preço ou dão desconto na venda (quem só opera o caixa vende pelo preço da lista). */
  precoTravado: "dinheiro.preco_travado",
  /** Com o preço travado: desconto máximo, em %, que o caixa pode dar. Zero = nenhum desconto. */
  descontoMaxCaixa: "dinheiro.desconto_max_caixa",
  /** Extras da conta contam para a comissão. */
  comissaoExtras: "comissao.em_extras",
  /** O percentual do serviço vale mais que o da pessoa. */
  comissaoPorServico: "comissao.por_servico",
  /** Produtos vendidos na conta do atendimento rendem comissão. */
  comissaoProdutos: "comissao.em_produtos",
  /** Percentual da comissão sobre produtos. */
  comissaoProdutosPct: "comissao.produtos_pct",
} as const;

type ComOpcoes = { opcoes?: unknown };
const centavos = (n: number) => Math.round(n * 100) / 100;

export type OpcoesDeCobranca = {
  multa: boolean; multaFixa: number; multaPct: number; jurosMesPct: number; multaNaMensagem: boolean; pix: string; modelo: string;
};
export function opcoesDeCobranca(petshop: ComOpcoes): OpcoesDeCobranca {
  const K = OPCOES_DINHEIRO;
  const n = (chave: string) => Math.max(0, opcao(petshop, chave, 0));
  return {
    multa: opcao(petshop, K.multa, false), multaFixa: n(K.multaFixa), multaPct: n(K.multaPct), jurosMesPct: n(K.jurosMesPct),
    multaNaMensagem: opcao(petshop, K.multaNaMensagem, false), pix: opcao(petshop, K.pix, "").trim(), modelo: opcao(petshop, K.modelo, ""),
  };
}

/** Trava de preço na venda: ligada ou não, e o desconto máximo (em %) de quem só opera o caixa. */
export function travaDePreco(petshop: ComOpcoes): { ligada: boolean; descontoMax: number } {
  return { ligada: opcao(petshop, OPCOES_DINHEIRO.precoTravado, false), descontoMax: Math.min(100, Math.max(0, opcao(petshop, OPCOES_DINHEIRO.descontoMaxCaixa, 0))) };
}

export type OpcoesDeComissao = { extras: boolean; porServico: boolean; produtos: boolean; produtosPct: number };
export function opcoesDeComissao(petshop: ComOpcoes): OpcoesDeComissao {
  const K = OPCOES_DINHEIRO;
  return {
    extras: opcao(petshop, K.comissaoExtras, false), porServico: opcao(petshop, K.comissaoPorServico, false),
    produtos: opcao(petshop, K.comissaoProdutos, false), produtosPct: Math.min(100, Math.max(0, opcao(petshop, K.comissaoProdutosPct, 0))),
  };
}

/* ---------- multa e juros ---------- */

export type Multa = { dias: number; multa: number; juros: number; total: number };

/**
 * Multa e juros sugeridos para uma conta atrasada, pelas regras que o dono definiu:
 * multa fixa + multa em % do que falta (uma vez) + juros em % ao mês, contados por dia de atraso (mês de 30 dias).
 * Devolve null quando a opção está desligada, a conta não venceu ou a regra dá zero. É só sugestão: quem recebe decide.
 */
export function multaSugerida(petshop: ComOpcoes, conta: { valor: number; vencimento?: string | null; multa_recebida?: number | null; multa_recebida_em?: string | null }, hoje: string): Multa | null {
  const o = opcoesDeCobranca(petshop);
  if (!o.multa || !conta.vencimento || conta.vencimento >= hoje) return null;
  const dias = Math.round((deIsoDia(hoje).getTime() - deIsoDia(conta.vencimento).getTime()) / 864e5);
  const valor = Number(conta.valor);
  // a multa é cobrada uma vez: se o cliente já pagou multa e juros desta conta (junto com uma parte), o resto só conta
  // os juros dos dias que passaram desde esse pagamento
  const jaCobrou = Number(conta.multa_recebida ?? 0) > 0;
  const desde = jaCobrou && conta.multa_recebida_em && conta.multa_recebida_em > conta.vencimento ? conta.multa_recebida_em : conta.vencimento;
  const diasDeJuros = jaCobrou ? Math.max(0, Math.round((deIsoDia(hoje).getTime() - deIsoDia(desde).getTime()) / 864e5)) : dias;
  const multa = jaCobrou ? 0 : centavos(o.multaFixa + (valor * o.multaPct) / 100);
  const juros = centavos((valor * o.jurosMesPct * diasDeJuros) / 100 / 30);
  const total = centavos(multa + juros);
  return total > 0 ? { dias, multa, juros, total } : null;
}

/** "multa de R$ 5,00 + 2% e juros de 1% ao mês": a regra do dono em palavras. */
export function regraDaMulta(petshop: ComOpcoes): string {
  const o = opcoesDeCobranca(petshop);
  const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  const multa = [o.multaFixa > 0 ? brl(o.multaFixa) : "", o.multaPct > 0 ? pct(o.multaPct) : ""].filter(Boolean).join(" + ");
  return [multa ? `multa de ${multa}` : "", o.jurosMesPct > 0 ? `juros de ${pct(o.jurosMesPct)} ao mês` : ""].filter(Boolean).join(" e ");
}

/* ---------- mensagem de cobrança ---------- */

/** O modelo padrão. `{saudacao}`, `{contas}`, `{total}` e `{pix}` são trocados na hora; linha que fica vazia some. */
export const MODELO_COBRANCA = "{saudacao} Passando para lembrar do que ficou em aberto:\n\n{contas}\n\n{total}\n{pix}\n\nQualquer dúvida, é só chamar. Obrigado!";
export const MARCAS_DO_MODELO = [
  { marca: "{saudacao}", oQue: "Oi, com o nome do tutor e o do pet shop" },
  { marca: "{contas}", oQue: "a lista do que está em aberto, com as datas" },
  { marca: "{total}", oQue: "o total" },
  { marca: "{pix}", oQue: "a chave Pix (se você preencheu)" },
] as const;

export type ContaDaMensagem = { valor: number; valor_original?: number | null; descricao?: string | null; categoria: string; vencimento?: string | null };

/**
 * Mensagem de cobrança de um tutor: o que está em aberto, com as datas, e o total.
 * Tom educado, sem ameaça. Multa e juros só aparecem se o dono ligou a opção e marcou "mostrar na mensagem".
 * A pessoa pode mudar o texto antes de mandar.
 */
export function mensagemDeDivida(petshop: ComOpcoes & { nome: string }, tutor: string | null | undefined, contas: ContaDaMensagem[], hoje: string): string {
  const o = opcoesDeCobranca(petshop);
  const emOrdem = [...contas].sort((a, b) => (a.vencimento ?? "9").localeCompare(b.vencimento ?? "9"));
  let multas = 0;
  const linhas = emOrdem.map((c) => {
    const v = c.vencimento;
    const quando = !v ? "" : v < hoje ? `venceu em ${dataCompleta(v)}` : v === hoje ? "vence hoje" : `vence em ${dataCompleta(v)}`;
    const cheio = c.valor_original != null && Number(c.valor_original) > Number(c.valor) ? Number(c.valor_original) : null;
    const m = o.multaNaMensagem ? multaSugerida(petshop, c, hoje) : null;
    if (m) multas = centavos(multas + m.total);
    const nome = (c.descricao?.trim() || c.categoria).replace(/ \(parte\)$/, "");
    return `- ${nome}: ${cheio ? `falta ${brl(c.valor)} de ${brl(cheio)}` : brl(c.valor)}${quando ? ` (${quando})` : ""}${m ? ` + multa e juros ${brl(m.total)}` : ""}`;
  });
  const soma = centavos(contas.reduce((s, c) => s + Number(c.valor), 0));
  const total = multas > 0 ? `Total: ${brl(soma)} + multa e juros ${brl(multas)} = ${brl(centavos(soma + multas))}` : `Total: ${brl(soma)}`;
  const modelo = o.modelo.trim() || MODELO_COBRANCA;
  const por = (texto: string, marca: string, valor: string) => texto.split(marca).join(valor);
  return por(por(por(por(modelo, "{saudacao}", saudacaoZap(tutor, petshop.nome)), "{contas}", linhas.join("\n")), "{total}", total), "{pix}", o.pix ? `Chave Pix: ${o.pix}` : "")
    .split("\n").map((l) => l.trimEnd()).join("\n")
    .replace(/\n{3,}/g, "\n\n").trim();
}
