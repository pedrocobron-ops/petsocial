import { itensDoLancamento, partesDoLancamento } from "./dinheiro";
import type { Banco } from "./supabase";
import { centavos } from "./util";

/**
 * Vendas por produto num período, só com o que está gravado:
 *  - unidades e receita vêm das vendas recebidas (lançamentos com os itens da conta). O desconto da conta é rateado
 *    na proporção de cada linha, e a soma das linhas é sempre a parte de produtos do lançamento;
 *  - o custo vem da saída de estoque ligada àquela venda, que guarda o custo do produto na hora em que saiu.
 * Venda sem saída ligada, ou cuja saída ficou sem custo, conta nas unidades e na receita e fica marcada como
 * "sem custo registrado": o custo e a margem dela não são estimados.
 */
export type VendaLida = { id: string; valor: number; itens: unknown };
/** Saída de estoque marcada como venda (`custos_das_vendas`). */
export type SaidaLida = { lancamento_id: string | null; produto_id: string; quantidade: number; custo_unitario: number | null };
/**
 * Troca e devolução do período, por produto (`devolucoes_por_produto`, pelo dia da devolução, como em "Quanto sobrou"):
 * o que voltou sai das unidades e da receita; o custo das unidades que voltaram ao estoque sai do custo (o avariado é perda).
 */
export type DevolucaoLida = { produto_id: string | null; nome?: string | null; quantidade: number; avariados?: number; valor: number; custo_volta: number; sem_custo: number };

export type LinhaProduto = {
  chave: string; produtoId: string | null; nome: string;
  unidades: number; receita: number;
  /** Parte da receita e das unidades que tem custo registrado, e o custo dela. */
  receitaComCusto: number; unidadesComCusto: number; custo: number;
  /** Vendas deste produto sem custo registrado. */
  semCusto: number; vendas: number;
  /** O que voltou no período (troca e devolução): unidades e reais. Já descontado de `unidades` e `receita`. */
  devolvidos: number; devolvido: number;
};

const milesimos = (n: number) => Math.round(n * 1000) / 1000;

/** Margem em reais e em % (sobre a receita) da parte com custo registrado; null quando nada tem custo. */
export function margemDaLinha(l: Pick<LinhaProduto, "receitaComCusto" | "custo" | "unidadesComCusto">): { reais: number; pct: number | null } | null {
  if (!(l.unidadesComCusto > 0)) return null;
  const reais = centavos(l.receitaComCusto - l.custo);
  return { reais, pct: l.receitaComCusto > 0 ? (reais / l.receitaComCusto) * 100 : null };
}

/** Receita de cada linha de produto de um lançamento, já com o desconto rateado (o centavo que sobra vai para a maior linha). */
export function receitaDasLinhas(l: VendaLida): { produtoId: string | null; nome: string; qtd: number; receita: number }[] {
  const linhas = itensDoLancamento(l).filter((i) => i.tipo === "produto" && i.qtd > 0);
  if (!linhas.length) return [];
  const parte = partesDoLancamento(l)?.produto ?? 0;
  const brutos = linhas.map((i) => Math.max(0, i.qtd * i.valor));
  const soma = brutos.reduce((t, n) => t + n, 0);
  const receitas = brutos.map((b) => (soma > 0 ? centavos((b / soma) * parte) : 0));
  const sobra = centavos(parte - receitas.reduce((t, n) => t + n, 0));
  if (sobra && receitas.length) {
    const maior = receitas.reduce((m, n, i) => (n > receitas[m] ? i : m), 0);
    receitas[maior] = centavos(receitas[maior] + sobra);
  }
  return linhas.map((i, n) => ({ produtoId: i.produto_id ?? null, nome: i.nome, qtd: i.qtd, receita: receitas[n] }));
}

export function vendasPorProduto(vendas: VendaLida[], saidas: SaidaLida[], nomes: Map<string, string>, devolucoes: DevolucaoLida[] = []) {
  // saídas de cada venda, por produto
  const porVenda = new Map<string, SaidaLida[]>();
  let soltas = 0;
  for (const s of saidas) {
    if (!s.lancamento_id) { soltas++; continue; }
    const k = `${s.lancamento_id}|${s.produto_id}`;
    porVenda.set(k, [...(porVenda.get(k) ?? []), s]);
  }
  const produtos = new Map<string, LinhaProduto>();
  for (const v of vendas) {
    // um produto pode aparecer em mais de uma linha da mesma conta: junta antes de procurar a saída
    const daConta = new Map<string, { produtoId: string | null; nome: string; qtd: number; receita: number }>();
    for (const l of receitaDasLinhas(v)) {
      const chave = l.produtoId ?? `nome:${l.nome}`;
      const x = daConta.get(chave) ?? { produtoId: l.produtoId, nome: l.nome, qtd: 0, receita: 0 };
      x.qtd = milesimos(x.qtd + l.qtd); x.receita = centavos(x.receita + l.receita);
      daConta.set(chave, x);
    }
    for (const [chave, l] of daConta) {
      const p = produtos.get(chave) ?? { chave, produtoId: l.produtoId, nome: (l.produtoId && nomes.get(l.produtoId)) || l.nome, unidades: 0, receita: 0, receitaComCusto: 0, unidadesComCusto: 0, custo: 0, semCusto: 0, vendas: 0, devolvidos: 0, devolvido: 0 };
      p.unidades = milesimos(p.unidades + l.qtd);
      p.receita = centavos(p.receita + l.receita);
      p.vendas++;
      const ligadas = l.produtoId ? porVenda.get(`${v.id}|${l.produtoId}`) ?? [] : [];
      if (ligadas.length && ligadas.every((s) => s.custo_unitario != null)) {
        p.custo = centavos(p.custo + ligadas.reduce((t, s) => t + centavos(Number(s.quantidade) * Number(s.custo_unitario)), 0));
        p.receitaComCusto = centavos(p.receitaComCusto + l.receita);
        p.unidadesComCusto = milesimos(p.unidadesComCusto + l.qtd);
      } else p.semCusto++;
      produtos.set(chave, p);
    }
  }
  // troca e devolução: o que voltou sai da linha do produto (produto que só voltou no período, vendido antes, entra com o negativo)
  for (const d of devolucoes) {
    const q = milesimos(Number(d.quantidade)), v = centavos(Number(d.valor));
    if (!(q > 0) && !(v > 0)) continue;
    const chave = d.produto_id ?? `nome:${d.nome ?? ""}`;
    const p = produtos.get(chave) ?? { chave, produtoId: d.produto_id, nome: (d.produto_id && nomes.get(d.produto_id)) || d.nome || "Produto", unidades: 0, receita: 0, receitaComCusto: 0, unidadesComCusto: 0, custo: 0, semCusto: 0, vendas: 0, devolvidos: 0, devolvido: 0 };
    p.unidades = milesimos(p.unidades - q); p.receita = centavos(p.receita - v);
    p.devolvidos = milesimos(p.devolvidos + q); p.devolvido = centavos(p.devolvido + v);
    // devolução de venda com custo registrado: a parte com custo também diminui (o avariado continua no custo: é perda)
    if (!(Number(d.sem_custo) > 0)) {
      p.receitaComCusto = centavos(p.receitaComCusto - v);
      p.unidadesComCusto = milesimos(p.unidadesComCusto - q);
      p.custo = centavos(p.custo - Number(d.custo_volta));
    }
    produtos.set(chave, p);
  }
  const linhas = [...produtos.values()];
  const total = linhas.reduce((t, l) => ({
    unidades: milesimos(t.unidades + l.unidades), receita: centavos(t.receita + l.receita), receitaComCusto: centavos(t.receitaComCusto + l.receitaComCusto),
    unidadesComCusto: milesimos(t.unidadesComCusto + l.unidadesComCusto), custo: centavos(t.custo + l.custo), semCusto: t.semCusto + l.semCusto, vendas: t.vendas + l.vendas,
    devolvidos: milesimos(t.devolvidos + l.devolvidos), devolvido: centavos(t.devolvido + l.devolvido),
  }), { unidades: 0, receita: 0, receitaComCusto: 0, unidadesComCusto: 0, custo: 0, semCusto: 0, vendas: 0, devolvidos: 0, devolvido: 0 });
  return { linhas, total, /** Saídas marcadas como venda que não estão ligadas a nenhum lançamento. */ soltas };
}

/** As devoluções do período por produto (banco antigo, sem a função: nenhuma). */
export async function lerDevolucoesPorProduto(sb: Banco, petshopId: string, de: string, ate: string): Promise<DevolucaoLida[]> {
  const r = await sb.rpc("devolucoes_por_produto", { p: petshopId, p_de: de, p_ate: ate });
  if (r.error || !Array.isArray(r.data)) return [];
  return r.data.map((d) => ({ ...d, quantidade: Number(d.quantidade), valor: Number(d.valor), custo_volta: Number(d.custo_volta), sem_custo: Number(d.sem_custo), avariados: Number(d.avariados ?? 0) }));
}

/**
 * O que foi cobrado de cada linha de um lançamento (a planilha de vendas da cópia de segurança): o desconto e as linhas
 * negativas (promoção do horário, sinal, crédito) repartidos como em `partesDoLancamento` (a linha negativa sai primeiro do
 * serviço) e, dentro de cada tipo, na proporção de cada linha (o centavo que sobra vai para a maior). A soma de `cobrado` é
 * sempre o valor cheio do lançamento; a linha negativa fica com cobrado 0 (o efeito dela já está nas outras).
 */
export function cobradoPorItem(l: { valor: number; valor_original?: number | null; itens?: unknown }): { nome: string; tipo: string; qtd: number; valor: number; bruto: number; cobrado: number; desconto: number; produto_id?: string }[] {
  const itens = itensDoLancamento(l);
  const total = Number(l.valor_original ?? l.valor);
  const partes = partesDoLancamento({ valor: total, itens: l.itens });
  const brutoDe = (i: { qtd: number; valor: number }) => centavos(i.qtd * i.valor);
  const cobrado = itens.map(() => 0);
  if (partes) {
    for (const tipo of ["servico", "produto", "extra"] as const) {
      const idx = itens.map((i, n) => (i.tipo === tipo && brutoDe(i) > 0 ? n : -1)).filter((n) => n >= 0);
      if (!idx.length) continue;
      const soma = idx.reduce((t, n) => t + brutoDe(itens[n]), 0);
      for (const n of idx) cobrado[n] = soma > 0 ? centavos((brutoDe(itens[n]) / soma) * partes[tipo]) : 0;
      const sobra = centavos(partes[tipo] - idx.reduce((t, n) => t + cobrado[n], 0));
      if (sobra) { const maior = idx.reduce((m, n) => (cobrado[n] > cobrado[m] ? n : m), idx[0]); cobrado[maior] = centavos(cobrado[maior] + sobra); }
    }
  }
  return itens.map((i, n) => {
    const bruto = brutoDe(i);
    return { nome: i.nome, tipo: i.tipo, qtd: i.qtd, valor: i.valor, bruto, cobrado: cobrado[n], desconto: bruto > 0 ? centavos(bruto - cobrado[n]) : 0, ...(i.produto_id ? { produto_id: i.produto_id } : {}) };
  });
}
