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
