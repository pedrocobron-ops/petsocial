import type { Banco } from "./supabase";
import type { FormaPagamento } from "./dinheiro";
import { centavos } from "./util";

/**
 * Troca e devolução de produto (migração 20261200: `venda_devolvivel`, `venda_devolver`, tabela `devolucoes`).
 * O banco faz tudo numa transação só: confere o que pode voltar, devolve o dinheiro (saída "Devolução"), deixa o crédito
 * do tutor ou faz a troca (devolução + venda nova, a parte trocada na forma "outro", só a diferença mexe na gaveta),
 * põe o produto de volta no estoque ("Devolução"; avariado entra e sai como "Perda") e guarda o registro.
 * O valor de cada produto é o que foi pago por ele na venda (a parte de produto repartida como no "Quanto sobrou");
 * a última unidade que volta leva o que sobrou, para fechar ao centavo. Aqui só a mesma conta, para a tela mostrar antes.
 */
export type LinhaDevolvivel = { produto_id: string; nome: string; vendido: number; pago: number; devolvido: number; devolvido_valor: number };
export type ModoDevolucao = "dinheiro" | "credito" | "troca";

const qtd3 = (n: number) => Math.round(n * 1000) / 1000;

/** O que ainda pode voltar de cada produto da venda. */
export async function lerDevolvivel(sb: Banco, petshopId: string, vendaId: string): Promise<LinhaDevolvivel[]> {
  const r = await sb.rpc("venda_devolvivel", { p_petshop: petshopId, p_venda: vendaId });
  if (r.error) throw new Error(r.error.message);
  return (r.data ?? []).map((x) => ({ ...x, vendido: Number(x.vendido), pago: Number(x.pago), devolvido: Number(x.devolvido), devolvido_valor: Number(x.devolvido_valor) }));
}

export const resta = (l: LinhaDevolvivel) => Math.max(0, qtd3(l.vendido - l.devolvido));

/** Quanto volta por `q` unidades deste produto (a mesma conta do banco). */
export function valorQueVolta(l: LinhaDevolvivel, q: number): number {
  if (!(q > 0)) return 0;
  if (Math.abs(q - resta(l)) < 0.0005) return Math.max(0, centavos(l.pago - l.devolvido_valor));
  return l.vendido > 0 ? Math.max(0, centavos((l.pago * q) / l.vendido)) : 0;
}

/** A diferença da troca: positiva, o cliente paga; negativa, o pet shop devolve (ou deixa de crédito). */
export function contaDaTroca(volta: number, leva: number) {
  const diferenca = centavos(leva - volta);
  return { diferenca, trocado: centavos(Math.min(volta, leva)), cobrar: Math.max(0, diferenca), devolver: Math.max(0, -diferenca) };
}

export type PedidoDevolucao = {
  venda: string; itens: { produto_id: string; qtd: number; avariados?: number }[]; modo: ModoDevolucao;
  forma?: FormaPagamento | null; novos?: { produto_id: string; qtd: number; valor?: number | null }[] | null;
  resto?: "dinheiro" | "credito" | null; cliente?: string | null; chave: string;
};
export type ResultadoDevolucao = {
  ok: boolean; repetido?: boolean; id: string; valor: number; novos: number | null; diferenca: number | null;
  saida_id: string | null; entrada_id: string | null; credito_id: string | null;
};

/** Grava a troca ou a devolução (uma chamada; a mesma chave de novo devolve o que já foi feito). */
export async function devolver(sb: Banco, petshopId: string, p: PedidoDevolucao): Promise<ResultadoDevolucao> {
  const r = await sb.rpc("venda_devolver", {
    p_petshop: petshopId, p_chave: p.chave, p_venda: p.venda, p_itens: p.itens as never, p_modo: p.modo,
    ...(p.forma ? { p_forma: p.forma } : {}), ...(p.novos?.length ? { p_novos: p.novos as never } : {}),
    ...(p.resto ? { p_resto: p.resto } : {}), ...(p.cliente ? { p_cliente: p.cliente } : {}),
  });
  if (r.error) throw new Error(r.error.message);
  return r.data as unknown as ResultadoDevolucao;
}

/** A venda tem produto com id (o que dá para trocar ou devolver)? Só venda paga, inteira (não uma parte). */
export function vendaComProduto(l: { tipo?: string; pago?: boolean; movimento?: string | null; conta_id?: string | null; diferenca_de?: string | null; itens?: unknown }) {
  if (l.tipo !== "entrada" || !l.pago || l.movimento || l.conta_id || l.diferenca_de) return false;
  return Array.isArray(l.itens) && (l.itens as { tipo?: string; produto_id?: string }[]).some((i) => i?.tipo === "produto" && i.produto_id);
}
