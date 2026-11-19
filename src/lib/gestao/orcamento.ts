import { brl, dataCompleta, deIsoDia, isoDia, linkWhatsApp, somaDias, centavos } from "./util";

/**
 * Orçamento (migração 20261200, tabela `orcamentos`): produtos e serviços com preço, desconto, validade e, se quiser, o cliente.
 * Nada sai do estoque até virar venda. O banco refaz o subtotal e o total (`orcamento_conferir`); aqui a mesma conta, para a tela.
 * Status gravado: aberto, aceito, convertido. "Vencido" = aberto ou aceito com a validade no passado (calculado na leitura).
 * Sem importações de tela: usado pelas folhas, pela página pública e pelos testes.
 */
export type ItemOrcamento = { tipo: "produto" | "servico"; nome: string; qtd: number; valor: number; produto_id?: string; servico_id?: string };
export type StatusOrcamento = "aberto" | "aceito" | "vencido" | "convertido";

export const STATUS_ORCAMENTO: Record<StatusOrcamento, { rotulo: string; tom: "azul" | "verde" | "vermelho" | "amarelo" }> = {
  aberto: { rotulo: "Aberto", tom: "azul" },
  aceito: { rotulo: "Aceito", tom: "verde" },
  vencido: { rotulo: "Vencido", tom: "vermelho" },
  convertido: { rotulo: "Virou venda", tom: "amarelo" },
};

/** Dias de validade quando ninguém escolhe. */
export const VALIDADE_PADRAO = 7;
export const validadePadrao = (hoje = new Date()) => isoDia(somaDias(hoje, VALIDADE_PADRAO));


/** Subtotal (cada linha arredondada ao centavo, como o banco), desconto que cabe e total. */
export function contaDoOrcamento(itens: Pick<ItemOrcamento, "qtd" | "valor">[], desconto: number | null | undefined) {
  const subtotal = centavos(itens.reduce((t, i) => t + centavos(Number(i.qtd) * Number(i.valor)), 0));
  const tirado = Math.min(Math.max(Number(desconto ?? 0), 0), subtotal);
  return { subtotal, desconto: centavos(tirado), total: centavos(subtotal - tirado) };
}

/** O status que a pessoa vê: aberto ou aceito com a validade no passado é "vencido". */
export function statusDoOrcamento(o: { status: string; validade: string }, hoje = isoDia(new Date())): StatusOrcamento {
  if (o.status === "convertido") return "convertido";
  if (o.validade < hoje) return "vencido";
  return o.status === "aceito" ? "aceito" : "aberto";
}

/** Tem produto? Tem serviço? (o que "Transformar em venda" abre) */
export const temProduto = (itens: ItemOrcamento[]) => itens.some((i) => i.tipo === "produto");
export const temServico = (itens: ItemOrcamento[]) => itens.some((i) => i.tipo === "servico");

const fmtQtd = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** Endereço público do orçamento (a página que o cliente abre). */
export const linkDoOrcamento = (origem: string, token: string) => `${origem.replace(/\/$/, "")}/gestao/orcamento/${token}`;

/**
 * O texto do WhatsApp, arrumado:
 *   Oi, Ana! Segue o orçamento nº 3 do Pet Feliz:
 *   • 2 × Ração 1 kg — R$ 59,80
 *   • Banho — R$ 60,00
 *   Desconto: − R$ 9,80
 *   Total: R$ 110,00
 *   Vale até 24/11/2026.
 *   Ver e responder: <link>
 */
export function textoDoOrcamento(o: {
  loja: string; numero: number; para?: string | null; itens: ItemOrcamento[]; desconto: number; validade: string; link?: string | null;
  /** A observação para o cliente (a mesma da página do orçamento). */
  obs?: string | null;
}) {
  const c = contaDoOrcamento(o.itens, o.desconto);
  const nome = (o.para ?? "").trim().split(/\s+/)[0];
  const linhas = [
    `${nome ? `Oi, ${nome}!` : "Oi!"} Segue o orçamento nº ${o.numero} do ${o.loja}:`,
    "",
    ...o.itens.map((i) => `• ${i.qtd !== 1 ? `${fmtQtd(i.qtd)} × ` : ""}${i.nome} — ${brl(centavos(i.qtd * i.valor))}`),
    "",
    ...(c.desconto > 0 ? [`Soma: ${brl(c.subtotal)}`, `Desconto: − ${brl(c.desconto)}`] : []),
    `*Total: ${brl(c.total)}*`,
    `Vale até ${dataCompleta(o.validade)}.`,
    ...(o.obs?.trim() ? ["", o.obs.trim()] : []),
    ...(o.link ? ["", `Ver e responder: ${o.link}`] : []),
  ];
  return linhas.join("\n");
}

/** Link do WhatsApp com o texto: para o telefone do cliente, ou (sem telefone) para a pessoa escolher o contato. */
export function zapDoOrcamento(telefone: string | null | undefined, texto: string) {
  return linkWhatsApp(telefone, texto) ?? `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

/** "Quero fechar" da página pública: a mensagem pronta para o WhatsApp da loja. */
export const textoQueroFechar = (numero: number, total: number) => `Oi! Quero fechar o orçamento nº ${numero} (${brl(total)}).`;

/** Validade em palavras: "vale até 24/11/2026" ou "venceu em 10/11/2026". */
export function fraseDaValidade(validade: string, hoje = isoDia(new Date())) {
  if (validade < hoje) return `venceu em ${dataCompleta(validade)}`;
  if (validade === hoje) return "vale até hoje";
  return `vale até ${dataCompleta(validade)}`;
}

/**
 * "Transformar em venda" com produtos e serviços: o desconto do orçamento é repartido pela proporção de cada parte.
 * Os produtos vão para a venda com o desconto deles; cada serviço vai para o horário com o preço já com a parte do desconto
 * (o último leva o centavo que sobra). A soma da venda com os serviços é exatamente o total do orçamento.
 */
export function repartirDesconto(itens: ItemOrcamento[], desconto: number) {
  const c = contaDoOrcamento(itens, desconto);
  const prod = contaDoOrcamento(itens.filter((i) => i.tipo === "produto"), 0).subtotal;
  const descProdutos = c.subtotal > 0 ? centavos((c.desconto * prod) / c.subtotal) : 0;
  const descServicos = centavos(c.desconto - descProdutos);
  const servicos = itens.filter((i) => i.tipo === "servico");
  const servSub = contaDoOrcamento(servicos, 0).subtotal;
  let resto = descServicos;
  const out = servicos.map((s, n) => {
    const linha = centavos(s.qtd * s.valor);
    const parte = n === servicos.length - 1 ? resto : servSub > 0 ? centavos((descServicos * linha) / servSub) : 0;
    resto = centavos(resto - parte);
    return { servicoId: s.servico_id ?? null, nome: s.nome, preco: Math.max(0, centavos(linha - parte)) };
  });
  return { descontoProdutos: descProdutos, servicos: out };
}

type Convertido = { status: string; itens: ItemOrcamento[]; desconto: number; total: number; lancamento_id: string | null; agendamento_id: string | null; valor_vendido?: number | null };

/**
 * Virou venda dos produtos, mas o horário dos serviços não foi marcado (a pessoa fechou "Marcar horário" porque o tutor ainda
 * não escolheu o dia). O serviço não se perde: o orçamento continua oferecendo "Marcar o horário" com o preço repartido.
 */
export const faltaMarcar = (o: Convertido) => o.status === "convertido" && Boolean(o.lancamento_id) && !o.agendamento_id && temServico(o.itens);

/** Os serviços que ainda faltam marcar, com o preço já com a parte do desconto (o mesmo que o horário recebe). */
export const servicosAMarcar = (o: Convertido) => (faltaMarcar(o) ? repartirDesconto(o.itens, Number(o.desconto)).servicos : []);

/**
 * Quanto entrou na venda do orçamento: o valor do lançamento (guardado pelo banco em `valor_vendido`); sem ele, o total menos os
 * serviços que viraram horário (a mesma conta de "Transformar em venda"). null quando não virou venda.
 */
export function valorDaVenda(o: Convertido): number | null {
  if (o.status !== "convertido" || !o.lancamento_id) return null;
  if (o.valor_vendido != null) return Number(o.valor_vendido);
  const servicos = temServico(o.itens) ? repartirDesconto(o.itens, Number(o.desconto)).servicos.reduce((t, s) => t + s.preco, 0) : 0;
  return centavos(Number(o.total) - servicos);
}

/** Dias até a validade (negativo: já venceu). */
export const diasAteVencer = (validade: string, hoje = isoDia(new Date())) =>
  Math.round((deIsoDia(validade).getTime() - deIsoDia(hoje).getTime()) / 864e5);
