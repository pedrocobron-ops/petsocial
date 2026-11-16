import { itensDoLancamento, partesDoLancamento } from "./dinheiro";

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

export type LinhaProduto = {
  chave: string; produtoId: string | null; nome: string;
  unidades: number; receita: number;
  /** Parte da receita e das unidades que tem custo registrado, e o custo dela. */
  receitaComCusto: number; unidadesComCusto: number; custo: number;
  /** Vendas deste produto sem custo registrado. */
  semCusto: number; vendas: number;
};

const centavos = (n: number) => Math.round(n * 100) / 100;
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

export function vendasPorProduto(vendas: VendaLida[], saidas: SaidaLida[], nomes: Map<string, string>) {
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
      const p = produtos.get(chave) ?? { chave, produtoId: l.produtoId, nome: (l.produtoId && nomes.get(l.produtoId)) || l.nome, unidades: 0, receita: 0, receitaComCusto: 0, unidadesComCusto: 0, custo: 0, semCusto: 0, vendas: 0 };
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
  const linhas = [...produtos.values()];
  const total = linhas.reduce((t, l) => ({
    unidades: milesimos(t.unidades + l.unidades), receita: centavos(t.receita + l.receita), receitaComCusto: centavos(t.receitaComCusto + l.receitaComCusto),
    unidadesComCusto: milesimos(t.unidadesComCusto + l.unidadesComCusto), custo: centavos(t.custo + l.custo), semCusto: t.semCusto + l.semCusto, vendas: t.vendas + l.vendas,
  }), { unidades: 0, receita: 0, receitaComCusto: 0, unidadesComCusto: 0, custo: 0, semCusto: 0, vendas: 0 });
  return { linhas, total, /** Saídas marcadas como venda que não estão ligadas a nenhum lançamento. */ soltas };
}
