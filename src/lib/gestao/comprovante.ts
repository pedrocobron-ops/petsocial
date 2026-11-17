import { contaDosItens, itensDoLancamento, partesPorForma, type FormaPagamento } from "./dinheiro";
import { FORMAS } from "./tipos";
import { brl, chamar, dataCompleta } from "./util";

type Recebido = { valor: number; forma?: string | null; pagamentos?: unknown; itens?: unknown };

/** O que entrou na mesma conta para o que o tutor devia de antes (fiado, resto de outra conta): quanto e como. */
export type AntigaNoComprovante = { recebido: number; falta: number; forma?: string | null; pagamentos?: unknown };

const centavos = (n: number) => Math.round(n * 100) / 100;
const nomeDaForma = (f: string) => FORMAS.find((x) => x.id === f)?.rotulo ?? "Outro";

/** "Dinheiro R$ 100,00 + Pix R$ 20,00": as partes somadas por forma, sempre com o valor de cada uma. */
export function formasComValor(partes: { forma: string; valor: number }[]) {
  const porForma = new Map<string, number>();
  for (const x of partes) if (x.valor > 0) porForma.set(x.forma, centavos((porForma.get(x.forma) ?? 0) + x.valor));
  return [...porForma].map(([f, v]) => `${nomeDaForma(f)} ${brl(v)}`).join(" + ");
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
}) {
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
  const partes: { forma: FormaPagamento; valor: number }[] = [];
  for (const l of p.recebidos) partes.push(...partesPorForma(l));
  for (const x of antigas) partes.push(...partesPorForma({ valor: Number(x.recebido), forma: x.forma, pagamentos: x.pagamentos }));
  const pagamento = formasComValor(partes);
  const pagouAntigas = centavos(antigas.reduce((t, x) => t + Number(x.recebido), 0));
  const deviaAntes = centavos(antigas.reduce((t, x) => t + Number(x.recebido) + Math.max(0, Number(x.falta)), 0));
  const emDinheiro = centavos(partes.filter((x) => x.forma === "dinheiro").reduce((t, x) => t + x.valor, 0));

  return [
    `${p.tutor ? `Oi, ${chamar(p.tutor)}!` : "Oi!"} Segue o comprovante do atendimento${p.pet ? ` de ${p.pet}` : ""}.`,
    "",
    p.petshop,
    `Data: ${dataCompleta(new Date(p.quando))}`,
    ...(p.pet ? [`Pet: ${p.pet}`] : []),
    "",
    ...linhas,
    ...(desconto > 0 ? [`Desconto: - ${brl(desconto)}`] : []),
    `Total: ${brl(total)}`,
    ...linhaDoQueDevia(pagouAntigas, deviaAntes),
    ...(pagouAntigas > 0 ? [`Total pago agora: ${brl(centavos(total + pagouAntigas))}`] : []),
    ...(pagamento ? [`Pagamento: ${pagamento}`] : []),
    ...linhaDoTroco(p.entregue, emDinheiro),
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
  const corpo = resto.map((l) => (l ? `<p${/^(Total|Total da estadia|Valor na saída|Total pago agora):/.test(l) ? ' class="t"' : ""}>${esc(l)}</p>` : "<hr>")).join("");
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
  itens: { nome: string; qtd: number; valor: number }[]; total: number; desconto?: number;
  pago: number; formas: { forma: string; valor: number }[]; falta: number; pagaAte?: string | null; antigo?: number;
  /** quanto o cliente devia de antes, no total (para dizer "pagou 40 do que devia (75); ainda deve 35") */
  antigoDevia?: number;
  /** Quanto o cliente entregou em dinheiro (para o troco). */
  entregue?: number | null;
}) {
  const linhas = p.itens.map((i) => {
    const varios = i.qtd !== 1;
    return `${varios ? `${i.qtd.toLocaleString("pt-BR")} x ` : ""}${i.nome}${varios ? ` (${brl(i.valor)} cada)` : ""}: ${brl(centavos(i.qtd * i.valor))}`;
  });
  const pagamento = formasComValor(p.formas);
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
    `Data: ${dataCompleta(new Date(p.quando))}`,
    ...(p.pet ? [`Pet: ${p.pet}`] : []),
    "",
    ...linhas,
    ...(p.desconto && p.desconto > 0 ? [`Desconto: - ${brl(p.desconto)}`] : []),
    `Total da conta: ${brl(p.total)}`,
    ...linhaDoAntigo,
    `Pago agora: ${brl(p.pago)}${pagamento ? ` (${pagamento})` : ""}`,
    ...linhaDoTroco(p.entregue, emDinheiro),
    ...(p.falta > 0 && !faltaJaDita ? [`Fica para pagar depois: ${brl(p.falta)}${p.pagaAte ? `, até ${dataCompleta(p.pagaAte)}` : ""}`] : []),
    "",
    "Este comprovante não é nota fiscal.",
  ].join("\n");
}
