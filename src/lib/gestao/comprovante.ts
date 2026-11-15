import { contaDosItens, itensDoLancamento, partesPorForma, type FormaPagamento } from "./dinheiro";
import { FORMAS } from "./tipos";
import { brl, chamar, dataCompleta } from "./util";

type Recebido = { valor: number; forma?: string | null; pagamentos?: unknown; itens?: unknown };

/**
 * Comprovante do atendimento em texto simples, para mandar ao tutor pelo WhatsApp:
 * pet shop, data, pet, o que foi cobrado (serviço, produtos e extras), total e como foi pago.
 * Não é documento fiscal, e o texto diz isso no fim.
 */
export function textoComprovante(p: {
  petshop: string; tutor?: string | null; pet?: string | null; servico?: string | null; quando: Date | string; recebidos: Recebido[];
}) {
  const centavos = (n: number) => Math.round(n * 100) / 100;
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
  // como foi pago: as partes de todos os recebimentos, somadas por forma
  const porForma = new Map<FormaPagamento, number>();
  for (const l of p.recebidos) for (const parte of partesPorForma(l)) porForma.set(parte.forma, centavos((porForma.get(parte.forma) ?? 0) + parte.valor));
  const nome = (f: FormaPagamento) => FORMAS.find((x) => x.id === f)?.rotulo ?? "Outro";
  const formas = [...porForma];
  const pagamento = formas.length > 1 ? formas.map(([f, v]) => `${nome(f)} ${brl(v)}`).join(" + ") : formas.length ? nome(formas[0][0]) : "";

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
    ...(pagamento ? [`Pagamento: ${pagamento}`] : []),
    "",
    "Este comprovante não é nota fiscal.",
  ].join("\n");
}

/**
 * Imprime o mesmo comprovante numa folha simples (ou salva em PDF), sem a saudação do WhatsApp.
 * Usa uma moldura escondida na própria página: não abre janela nova nem esbarra no bloqueador de janelas.
 */
export function imprimirComprovante(texto: string) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const [, , loja = "", ...resto] = texto.split("\n");
  const corpo = resto.map((l) => (l ? `<p${/^Total:/.test(l) ? ' class="t"' : ""}>${esc(l)}</p>` : "<hr>")).join("");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Comprovante · ${esc(loja)}</title><style>
    @page { margin: 14mm; } body { font: 15px/1.5 system-ui, sans-serif; color: #1f1b17; max-width: 380px; margin: 0 auto; }
    h1 { font-size: 20px; margin: 0 0 4px; } h2 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #6a625a; margin: 0 0 14px; }
    p { margin: 2px 0; } p.t { font-weight: 700; font-size: 17px; margin-top: 8px; } hr { border: 0; border-top: 1px dashed #b9ae9f; margin: 10px 0; }
  </style></head><body><h1>${esc(loja)}</h1><h2>Comprovante de atendimento</h2>${corpo}</body></html>`;
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
}) {
  const centavos = (n: number) => Math.round(n * 100) / 100;
  const nome = (f: string) => FORMAS.find((x) => x.id === f)?.rotulo ?? "Outro";
  const linhas = p.itens.map((i) => {
    const varios = i.qtd !== 1;
    return `${varios ? `${i.qtd.toLocaleString("pt-BR")} x ` : ""}${i.nome}${varios ? ` (${brl(i.valor)} cada)` : ""}: ${brl(centavos(i.qtd * i.valor))}`;
  });
  const pagamento = p.formas.length > 1 ? p.formas.map((x) => `${nome(x.forma)} ${brl(x.valor)}`).join(" + ") : p.formas.length ? nome(p.formas[0].forma) : "";
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
    ...(p.antigo && p.antigo > 0 ? [`Do que estava em aberto antes: ${brl(p.antigo)}`] : []),
    `Pago agora: ${brl(p.pago)}${pagamento ? ` (${pagamento})` : ""}`,
    ...(p.falta > 0 ? [`Fica para pagar depois: ${brl(p.falta)}${p.pagaAte ? `, até ${dataCompleta(p.pagaAte)}` : ""}`] : []),
    "",
    "Este comprovante não é nota fiscal.",
  ].join("\n");
}
