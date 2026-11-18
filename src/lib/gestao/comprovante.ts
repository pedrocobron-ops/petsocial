import { contaDosItens, itensDoLancamento, partesPorForma, type FormaPagamento } from "./dinheiro";
import { FORMAS } from "./tipos";
import { brl, chamar, dataCompleta, hora, isoDia } from "./util";

type Recebido = { valor: number; forma?: string | null; pagamentos?: unknown; itens?: unknown; data?: string | null; credito_usado?: number | null };

/**
 * A data do comprovante é a do pagamento (o dia em que o dinheiro entrou, no fuso da loja), não a do horário: o horário de amanhã
 * recebido hoje sai com "Data do pagamento: hoje" e "Atendimento: amanhã". No mesmo dia, uma linha só, como sempre.
 * `pagoEm`: AAAA-MM-DD; sem ele, a data do horário.
 */
export function linhasDaData(quando: Date | string, pagoEm?: string | null): string[] {
  const doHorario = isoDia(new Date(quando));
  if (!pagoEm || !/^\d{4}-\d{2}-\d{2}$/.test(pagoEm) || pagoEm === doHorario) return [`Data: ${dataCompleta(new Date(quando))}`];
  return [`Data do pagamento: ${dataCompleta(pagoEm)}`, `Atendimento: ${dataCompleta(new Date(quando))}`];
}

/** O que entrou na mesma conta para o que o tutor devia de antes (fiado, resto de outra conta): quanto e como. */
export type AntigaNoComprovante = { recebido: number; falta: number; forma?: string | null; pagamentos?: unknown };

const centavos = (n: number) => Math.round(n * 100) / 100;
const nomeDaForma = (f: string) => (f === "credito_tutor" ? "Crédito do tutor" : FORMAS.find((x) => x.id === f)?.rotulo ?? "Outro");
/** As partes do pagamento, com a parte paga com o crédito do tutor pelo nome (no pagamento ela é "outro"). */
function partesComCredito(l: Recebido): { forma: string; valor: number }[] {
  const partes = partesPorForma(l);
  const credito = centavos(Math.max(0, Number(l.credito_usado ?? 0)));
  if (!(credito > 0)) return partes;
  return [{ forma: "credito_tutor", valor: credito }, ...partes.map((p) => (p.forma === "outro" ? { ...p, valor: centavos(p.valor - credito) } : p))];
}

/**
 * "Dinheiro R$ 100,00 + Pix R$ 20,00": as partes somadas por forma, sempre com o valor de cada uma.
 * `parcelas`: crédito em mais de uma vez sai como "Crédito 3x R$ 100,00".
 */
export function formasComValor(partes: { forma: string; valor: number }[], parcelas?: number | null) {
  const porForma = new Map<string, number>();
  for (const x of partes) if (x.valor > 0) porForma.set(x.forma, centavos((porForma.get(x.forma) ?? 0) + x.valor));
  return [...porForma].map(([f, v]) => `${nomeDaForma(f)}${f === "credito" && parcelas && parcelas > 1 ? ` ${parcelas}x` : ""} ${brl(v)}`).join(" + ");
}

/** O nome de quem está atendendo, como aparece no comprovante. */
export const nomeDeQuemAtende = (eu: { nome?: string | null } | null | undefined) => eu?.nome?.trim() || null;

/**
 * "Recebido às 15:32 por Carla": a hora e quem atendeu, no fim de todo comprovante. `verbo`: "Recebido" (padrão), "Anotado",
 * "Devolvido". Em branco quando não há nem hora nem nome (comprovante de um lançamento antigo).
 */
export function linhaDeQuem(quando?: string | Date | null, quem?: string | null, verbo = "Recebido"): string[] {
  const h = quando ? hora(quando) : null;
  const nome = quem?.trim() || null;
  if (!h && !nome) return [];
  return [`${verbo}${h ? ` às ${h}` : ""}${nome ? ` por ${nome}` : ""}`];
}

/** "Recebido em dinheiro: R$ 100,00 · Troco: R$ 5,00", quando o cliente entregou mais do que a parte em dinheiro. */
function linhaDoTroco(entregue: number | null | undefined, emDinheiro: number) {
  if (!entregue || !(emDinheiro > 0)) return [];
  const troco = centavos(entregue - emDinheiro);
  return troco > 0.005 ? [`Recebido em dinheiro: ${brl(entregue)} · Troco: ${brl(troco)}`] : [];
}

/** O que devia de antes, numa linha só: quanto pagou agora disso e quanto ainda deve (ou que ficou quitado). */
function linhaDoQueDevia(pagou: number, devia: number) {
  if (!(pagou > 0)) return [];
  const aindaDeve = devia > 0 ? centavos(Math.max(devia, pagou) - pagou) : 0;
  if (!(devia > 0)) return [`Pagou também ${brl(pagou)} do que devia de antes`];
  return aindaDeve > 0.005
    ? [`Pagou ${brl(pagou)} do que devia de antes (${brl(Math.max(devia, pagou))}); ainda deve ${brl(aindaDeve)}`]
    : [`Pagou também o que devia de antes: ${brl(pagou)} (quitado)`];
}

/**
 * Comprovante do atendimento em texto simples, para mandar ao tutor pelo WhatsApp:
 * pet shop, data, pet, o que foi cobrado (serviço, produtos e extras), total e como foi pago (cada forma com o valor).
 * `antigas`: o que entrou junto, no mesmo pagamento, para o que o tutor devia de antes (fica dito quanto pagou disso e quanto
 * ainda deve). `entregue`: quanto o cliente entregou em dinheiro (para o troco). Não é documento fiscal, e o texto diz isso no fim.
 */
export function textoComprovante(p: {
  petshop: string; tutor?: string | null; pet?: string | null; servico?: string | null; quando: Date | string; recebidos: Recebido[];
  antigas?: AntigaNoComprovante[] | null; entregue?: number | null;
  /** o dia em que o dinheiro entrou (AAAA-MM-DD); sem ele, o dia do lançamento mais novo */
  pagoEm?: string | null;
  /** do que é o comprovante: "do atendimento" (padrão), "da compra" (venda no balcão), "do pacote" */
  assunto?: string;
  /** crédito em quantas vezes (2 ou mais aparece como "Crédito 3x") */
  parcelas?: number | null;
  /** a hora em que o dinheiro entrou e quem atendeu ("Recebido às 15:32 por Carla") */
  hora?: string | Date | null; quem?: string | null;
}) {
  const pagoEm = p.pagoEm ?? p.recebidos.map((l) => l.data ?? "").filter(Boolean).sort().pop() ?? null;
  const total = centavos(p.recebidos.reduce((t, l) => t + Number(l.valor), 0));
  const linhas: string[] = [];
  let desconto = 0;
  for (const l of p.recebidos) {
    const itens = itensDoLancamento(l);
    if (!itens.length) { linhas.push(`${p.servico ?? "Atendimento"}: ${brl(l.valor)}`); continue; }
    for (const i of itens) {
      const varios = i.qtd !== 1;
      linhas.push(`${varios ? `${i.qtd.toLocaleString("pt-BR")} x ` : ""}${i.nome}${varios ? ` (${brl(i.valor)} cada)` : ""}: ${brl(centavos(i.qtd * i.valor))}`);
    }
    desconto = centavos(desconto + contaDosItens(itens, Number(l.valor)).desconto);
  }
  // como foi pago: as partes de todos os recebimentos (a conta e o que devia de antes), somadas por forma
  const antigas = (p.antigas ?? []).filter((x) => Number(x.recebido) > 0);
  const partes: { forma: FormaPagamento | "credito_tutor"; valor: number }[] = [];
  for (const l of p.recebidos) partes.push(...(partesComCredito(l) as { forma: FormaPagamento | "credito_tutor"; valor: number }[]));
  for (const x of antigas) partes.push(...partesPorForma({ valor: Number(x.recebido), forma: x.forma, pagamentos: x.pagamentos }));
  const pagamento = formasComValor(partes, p.parcelas);
  const pagouAntigas = centavos(antigas.reduce((t, x) => t + Number(x.recebido), 0));
  const deviaAntes = centavos(antigas.reduce((t, x) => t + Number(x.recebido) + Math.max(0, Number(x.falta)), 0));
  const emDinheiro = centavos(partes.filter((x) => x.forma === "dinheiro").reduce((t, x) => t + x.valor, 0));

  return [
    `${p.tutor ? `Oi, ${chamar(p.tutor)}!` : "Oi!"} Segue o comprovante ${p.assunto ?? "do atendimento"}${p.pet ? ` de ${p.pet}` : ""}.`,
    "",
    p.petshop,
    ...linhasDaData(p.quando, pagoEm),
    ...(p.pet ? [`Pet: ${p.pet}`] : []),
    "",
    ...linhas,
    ...(desconto > 0 ? [`Desconto: - ${brl(desconto)}`] : []),
    `Total: ${brl(total)}`,
    ...linhaDoQueDevia(pagouAntigas, deviaAntes),
    ...(pagouAntigas > 0 ? [`Total pago agora: ${brl(centavos(total + pagouAntigas))}`] : []),
    ...(pagamento ? [`Pagamento: ${pagamento}`] : []),
    ...linhaDoTroco(p.entregue, emDinheiro),
    ...linhaDeQuem(p.hora, p.quem),
    "",
    "Este comprovante não é nota fiscal.",
  ].join("\n");
}

/**
 * Imprime o mesmo comprovante numa folha simples (ou salva em PDF), sem a saudação do WhatsApp.
 * Usa uma moldura escondida na própria página: não abre janela nova nem esbarra no bloqueador de janelas.
 */
export function imprimirComprovante(texto: string, titulo = "Comprovante de atendimento") {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const [, , loja = "", ...resto] = texto.split("\n");
  const corpo = resto.map((l) => (l ? `<p${/^(Total|Total da estadia|Valor na saída|Total pago agora|Total da conta|Pago agora|Devolvido ao cliente|Diferença paga pelo cliente|Diferença devolvida ao cliente|Ficou de crédito na sua ficha):/.test(l) ? ' class="t"' : ""}>${esc(l)}</p>` : "<hr>")).join("");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Comprovante · ${esc(loja)}</title><style>
    @page { margin: 14mm; } body { font: 15px/1.5 system-ui, sans-serif; color: #1f1b17; max-width: 380px; margin: 0 auto; }
    h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #6a625a; margin: 0 0 14px; }
    p { margin: 2px 0; } p.t { font-weight: 700; font-size: 17px; margin-top: 8px; } hr { border: 0; border-top: 1px dashed #b9ae9f; margin: 10px 0; }
  </style></head><body><h1>${esc(loja)}</h1><h2>${esc(titulo)}</h2>${corpo}</body></html>`;
  const f = document.createElement("iframe");
  f.setAttribute("aria-hidden", "true");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(f);
  const d = f.contentDocument;
  if (!d) return;
  d.open(); d.write(html); d.close();
  setTimeout(() => { f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(() => f.remove(), 60000); }, 150);
}

/**
 * Comprovante de uma conta paga em parte (ou com o que o cliente devia de antes recebido junto): o que foi feito, o total da
 * conta, quanto entrou agora e como, e o que ficou para pagar depois. Mesmo formato do comprovante inteiro.
 */
export function textoComprovanteDaParte(p: {
  petshop: string; tutor?: string | null; pet?: string | null; quando: Date | string;
  /** o dia em que o dinheiro entrou (AAAA-MM-DD) */
  pagoEm?: string | null;
  itens: { nome: string; qtd: number; valor: number }[]; total: number; desconto?: number;
  pago: number; formas: { forma: string; valor: number }[]; falta: number; pagaAte?: string | null; antigo?: number;
  /** quanto o cliente devia de antes, no total (para dizer "pagou 40 do que devia (75); ainda deve 35") */
  antigoDevia?: number;
  /** Quanto o cliente entregou em dinheiro (para o troco). */
  entregue?: number | null;
  parcelas?: number | null; hora?: string | Date | null; quem?: string | null;
}) {
  const linhas = p.itens.map((i) => {
    const varios = i.qtd !== 1;
    return `${varios ? `${i.qtd.toLocaleString("pt-BR")} x ` : ""}${i.nome}${varios ? ` (${brl(i.valor)} cada)` : ""}: ${brl(centavos(i.qtd * i.valor))}`;
  });
  const pagamento = formasComValor(p.formas, p.parcelas);
  // o que devia de antes, dito por inteiro: quanto devia, quanto pagou disso e quanto ainda deve
  const antigo = p.antigo && p.antigo > 0 ? centavos(p.antigo) : 0;
  const devia = p.antigoDevia && p.antigoDevia > 0 ? centavos(Math.max(p.antigoDevia, antigo)) : 0;
  const aindaDeve = devia ? centavos(devia - antigo) : 0;
  const linhaDoAntigo = linhaDoQueDevia(antigo, devia);
  const emDinheiro = centavos(p.formas.filter((x) => x.forma === "dinheiro").reduce((t, x) => t + x.valor, 0));
  // o que fica para depois é só o resto da dívida antiga: já foi dito na linha de cima
  const faltaJaDita = devia > 0 && Math.abs(centavos(p.falta) - aindaDeve) < 0.005;
  return [
    `${p.tutor ? `Oi, ${chamar(p.tutor)}!` : "Oi!"} Segue o comprovante do atendimento${p.pet ? ` de ${p.pet}` : ""}.`,
    "",
    p.petshop,
    ...linhasDaData(p.quando, p.pagoEm),
    ...(p.pet ? [`Pet: ${p.pet}`] : []),
    "",
    ...linhas,
    ...(p.desconto && p.desconto > 0 ? [`Desconto: - ${brl(p.desconto)}`] : []),
    `Total da conta: ${brl(p.total)}`,
    ...linhaDoAntigo,
    `Pago agora: ${brl(p.pago)}${pagamento ? ` (${pagamento})` : ""}`,
    ...linhaDoTroco(p.entregue, emDinheiro),
    ...(p.falta > 0 && !faltaJaDita ? [`Fica para pagar depois: ${brl(p.falta)}${p.pagaAte ? `, até ${dataCompleta(p.pagaAte)}` : ""}`] : []),
    ...linhaDeQuem(p.hora, p.quem),
    "",
    "Este comprovante não é nota fiscal.",
  ].join("\n");
}

const linhaDoItem = (i: { nome: string; qtd: number; valor: number }) => {
  const varios = i.qtd !== 1;
  return `${varios ? `${i.qtd.toLocaleString("pt-BR")} x ` : ""}${i.nome}${varios ? ` (${brl(i.valor)} cada)` : ""}: ${brl(centavos(i.qtd * i.valor))}`;
};

/**
 * Comprovante de uma conta que ficou para pagar depois (venda ou atendimento "Cliente paga depois"): o que foi levado, o total
 * e até quando paga. Nada entrou ainda, e o texto diz isso. `assunto`: "da compra" (padrão), "do atendimento".
 */
export function textoComprovanteAReceber(p: {
  petshop: string; tutor?: string | null; pet?: string | null; quando?: Date | string | null;
  itens: { nome: string; qtd: number; valor: number }[]; total: number; desconto?: number; pagaAte: string; assunto?: string;
  hora?: string | Date | null; quem?: string | null;
}) {
  return [
    `${p.tutor ? `Oi, ${chamar(p.tutor)}!` : "Oi!"} Segue o comprovante ${p.assunto ?? "da compra"}${p.pet ? ` de ${p.pet}` : ""}.`,
    "",
    p.petshop,
    `Data: ${dataCompleta(new Date(p.quando ?? new Date()))}`,
    ...(p.pet ? [`Pet: ${p.pet}`] : []),
    "",
    ...p.itens.map(linhaDoItem),
    ...(p.desconto && p.desconto > 0 ? [`Desconto: - ${brl(p.desconto)}`] : []),
    `Total: ${brl(p.total)}`,
    `Pagamento: fica para pagar até ${dataCompleta(p.pagaAte)}`,
    "Nada foi pago ainda: o valor está anotado na sua ficha.",
    ...linhaDeQuem(p.hora, p.quem, "Anotado"),
    "",
    "Este comprovante não é nota fiscal.",
  ].join("\n");
}

/**
 * Recibo de um pagamento de conta que estava anotada ("Recebi", em A receber e na ficha): a conta, quanto entrou e como,
 * a multa e os juros (se houve) e o que ainda falta (ou que ficou quitada).
 */
export function textoReciboDeConta(p: {
  petshop: string; tutor?: string | null; conta: string; pagoEm?: string | null; valor: number; formas: { forma: string; valor: number }[];
  multa?: number | null; falta: number; pagaAte?: string | null; entregue?: number | null; parcelas?: number | null;
  hora?: string | Date | null; quem?: string | null;
}) {
  const multa = p.multa && p.multa > 0 ? centavos(p.multa) : 0;
  const pagamento = formasComValor(p.formas, p.parcelas);
  const emDinheiro = centavos(p.formas.filter((x) => x.forma === "dinheiro").reduce((t, x) => t + x.valor, 0));
  return [
    `${p.tutor ? `Oi, ${chamar(p.tutor)}!` : "Oi!"} Segue o recibo do seu pagamento.`,
    "",
    p.petshop,
    `Data do pagamento: ${dataCompleta(p.pagoEm ?? isoDia(new Date()))}`,
    "",
    `Conta: ${p.conta}`,
    `Valor pago da conta: ${brl(p.valor)}`,
    ...(multa > 0 ? [`Multa e juros: ${brl(multa)}`] : []),
    `Total pago agora: ${brl(centavos(p.valor + multa))}`,
    ...(pagamento ? [`Pagamento: ${pagamento}`] : []),
    ...linhaDoTroco(p.entregue, emDinheiro),
    p.falta > 0.005 ? `Ainda falta desta conta: ${brl(p.falta)}${p.pagaAte ? `, até ${dataCompleta(p.pagaAte)}` : ""}` : "Esta conta ficou quitada.",
    ...linhaDeQuem(p.hora, p.quem),
    "",
    "Este recibo não é nota fiscal.",
  ].join("\n");
}

/**
 * Comprovante de devolução ou de troca de produto: o que voltou, o que o cliente levou no lugar (troca), a diferença e para
 * onde foi o dinheiro (devolvido, crédito na ficha, ou a diferença paga). As linhas somam: levou − voltou = diferença.
 */
export function textoComprovanteDevolucao(p: {
  petshop: string; tutor?: string | null; modo: "dinheiro" | "credito" | "troca";
  /** o que voltou: `valor` é o total devolvido de cada linha */
  itens: { nome: string; qtd: number; valor: number }[]; valor: number;
  /** troca: o que o cliente levou (valor de cada unidade) e o total */
  novos?: { nome: string; qtd: number; valor: number }[] | null; valorNovos?: number | null;
  /** forma do dinheiro que voltou ou da diferença paga */
  forma?: string | null;
  /** troca com a compra nova menor: a diferença voltou em dinheiro ou ficou de crédito */
  resto?: "dinheiro" | "credito" | null;
  hora?: string | Date | null; quem?: string | null;
}) {
  const troca = p.modo === "troca";
  const levou = centavos(p.valorNovos ?? 0);
  const dif = centavos(levou - p.valor);
  const forma = p.forma ? nomeDaForma(p.forma) : null;
  const voltou = p.itens.map((i) => `${i.qtd !== 1 ? `${i.qtd.toLocaleString("pt-BR")} x ` : ""}${i.nome}: ${brl(i.valor)}`);
  const fim = !troca
    ? [p.modo === "credito" ? `Ficou de crédito na sua ficha: ${brl(p.valor)}` : `Devolvido ao cliente: ${brl(p.valor)}${forma ? ` (${forma})` : ""}`]
    : dif > 0.005 ? [`Diferença paga pelo cliente: ${brl(dif)}${forma ? ` (${forma})` : ""}`]
    : dif < -0.005 ? [p.resto === "credito" ? `Diferença que ficou de crédito na sua ficha: ${brl(-dif)}` : `Diferença devolvida ao cliente: ${brl(-dif)}${forma ? ` (${forma})` : ""}`]
    : ["Troca sem diferença: nada a pagar nem a devolver."];
  return [
    `${p.tutor ? `Oi, ${chamar(p.tutor)}!` : "Oi!"} Segue o comprovante da ${troca ? "troca" : "devolução"}.`,
    "",
    p.petshop,
    `Data: ${dataCompleta(new Date())}`,
    "",
    troca ? "Voltou:" : "Devolvido:",
    ...voltou,
    ...(p.itens.length > 1 || troca ? [`Total do que voltou: ${brl(p.valor)}`] : []),
    ...(troca ? ["", "Levou no lugar:", ...(p.novos ?? []).map(linhaDoItem), `Total do que levou: ${brl(levou)}`] : []),
    "",
    ...fim,
    ...linhaDeQuem(p.hora, p.quem, troca ? "Trocado" : "Devolvido"),
    "",
    "Este comprovante não é nota fiscal.",
  ].join("\n");
}
