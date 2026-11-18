import { creditoDaEntrada, partesPorForma } from "./dinheiro";
import { FORMAS } from "./tipos";
import { centavos } from "./util";
import type { Banco } from "./supabase";

/**
 * As contas do caixa: UMA função para a tela do Caixa, a folha de fechamento, as planilhas e o Mozart.
 *  - "Recebido" de um caixa (`entrou`): dinheiro, Pix e cartão que entraram de verdade. A parte de uma conta paga com o crédito
 *    do tutor e o produto de uma troca não são dinheiro novo e ficam fora (como no passo Recebido da cadeia do dinheiro);
 *  - por forma: o pagamento dividido entra repartido; o crédito do tutor aparece à parte (`FORMA_CREDITO`);
 *  - gaveta: troco + dinheiro recebido + suprimento − saídas em dinheiro − sangria. Sangria e suprimento não são entrada nem saída.
 * Sem importações de tela.
 */
const soma = (lista: { valor: number }[]) => centavos(lista.reduce((s, l) => s + Number(l.valor), 0));

export type MovimentoDoCaixa = { tipo: string; valor: number; forma?: string | null; pagamentos?: unknown; movimento?: string | null; credito_usado?: number | null; trocado?: number | null };
type Movimento = MovimentoDoCaixa;

/**
 * Troca de produto: a entrada nova leva, na forma "outro", o valor do produto que voltou, e a devolução sai pelo mesmo valor.
 * Essa parte não é dinheiro: o Caixa tira dos totais (`trocado`, que a tela junta pela função `trocas_do_caixa`), e só a
 * diferença paga (ou devolvida) conta como dinheiro que andou.
 */
export const trocadoDe = (l: object) => Math.max(0, Number((l as { trocado?: number | null }).trocado ?? 0));
/** O que saiu de verdade: as saídas sem a parte que é só produto trocado. */
export const saiuDe = (saidas: { valor: number }[]) => centavos(soma(saidas) - saidas.reduce((t, l) => t + trocadoDe(l), 0));

/** Tira sangrias e suprimentos: dinheiro que só entrou ou saiu da gaveta não é receita nem despesa. */
export const semMovimentos = <T extends { movimento?: string | null }>(lista: T[]) => lista.filter((l) => !l.movimento);

/** Soma por forma de pagamento, repartindo o pagamento dividido entre as formas dele. */
export function somaPorForma(lista: { valor: number; forma?: string | null; pagamentos?: unknown; credito_usado?: number | null; trocado?: number | null }[]) {
  const mapa = new Map<string, number>();
  const somar = (k: string, v: number) => mapa.set(k, centavos((mapa.get(k) ?? 0) + v));
  for (const l of lista) {
    // a parte paga com o crédito do tutor fica à parte (FORMA_CREDITO): não é dinheiro que entrou no dia
    const credito = creditoDaEntrada(l);
    // o produto trocado (na forma "outro") também não é dinheiro: sai da soma
    const fora = credito + trocadoDe(l);
    for (const p of partesPorForma(l)) somar(p.forma, p.forma === "outro" && fora > 0 ? p.valor - fora : p.valor);
    if (credito > 0) somar(FORMA_CREDITO, credito);
  }
  for (const [k, v] of mapa) if (Math.abs(v) < 0.005) mapa.delete(k);
  return mapa;
}
/** A chave, nas somas por forma, da parte paga com o crédito do tutor. */
export const FORMA_CREDITO = "credito_tutor";

/**
 * Quanto entrou e saiu por forma de pagamento, e quanto deve ter de dinheiro na gaveta:
 * troco inicial + dinheiro recebido + colocado na gaveta (suprimento) − saídas em dinheiro − tirado da gaveta (sangria).
 * `entrou` e `saiu` não contam sangria nem suprimento.
 */
export function resumoDoCaixa(valorInicial: number, lancamentos: Movimento[]) {
  const vendas = semMovimentos(lancamentos);
  const entradas = vendas.filter((l) => l.tipo === "entrada");
  const saidas = vendas.filter((l) => l.tipo === "saida");
  const entrouPor = somaPorForma(entradas), saiuPor = somaPorForma(saidas);
  const porForma = FORMAS.map((f) => ({ id: f.id, rotulo: f.rotulo, entrou: entrouPor.get(f.id) ?? 0, saiu: saiuPor.get(f.id) ?? 0 }));
  const dinheiro = porForma.find((f) => f.id === "dinheiro")!;
  const suprimentos = soma(lancamentos.filter((l) => l.movimento === "suprimento"));
  const sangrias = soma(lancamentos.filter((l) => l.movimento === "sangria"));
  // o que foi pago com o crédito do tutor não entrou no caixa (é dinheiro de antes)
  const credito = centavos(entradas.reduce((t, l) => t + creditoDaEntrada(l), 0));
  return {
    entrou: centavos(soma(entradas) - credito - entradas.reduce((t, l) => t + trocadoDe(l), 0)), saiu: saiuDe(saidas), porForma, suprimentos, sangrias, credito,
    nEntradas: entradas.length, nSaidas: saidas.length,
    esperado: centavos(Number(valorInicial) + dinheiro.entrou + suprimentos - dinheiro.saiu - sangrias),
  };
}


/**
 * Junta em cada lançamento de troca quanto dele é só o produto trocado (função `trocas_do_caixa`): o Caixa e o Mozart tiram
 * essa parte dos totais. Muda a lista recebida e a devolve.
 */
export async function comTrocas<T extends { id: string; valor: number; descricao?: string | null; trocado?: number | null }>(sb: Banco, petshopId: string, lista: T[]): Promise<T[]> {
  const ids = [...new Set(lista.filter((l) => /^Troca:/.test(l.descricao ?? "")).map((l) => l.id))];
  if (!ids.length) return lista;
  const t = await sb.rpc("trocas_do_caixa", { p_petshop: petshopId, p_ids: ids.slice(0, 2000) });
  const quanto = new Map(((t.data ?? []) as { lancamento_id: string; trocado: number }[]).map((x) => [x.lancamento_id, Number(x.trocado)]));
  for (const l of lista) { const v = quanto.get(l.id); if (v) l.trocado = Math.min(v, Number(l.valor)); }
  return lista;
}
