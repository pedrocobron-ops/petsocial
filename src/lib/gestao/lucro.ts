/**
 * "Quanto sobrou" (lucro por serviço e por produto) e "Por pessoa" (produtividade da equipe), a partir do que o banco
 * devolve em `lucro_do_periodo` e `equipe_do_periodo` (migração 20261193). O banco faz a conta do dinheiro; aqui só se
 * monta o que a tela, a planilha e o Mozart mostram, com as mesmas regras:
 *  - receita: o que entrou de verdade no período (desconto incluído), repartido como na comissão;
 *  - custo: produto pelo custo guardado na venda (sem ele, o custo de hoje do cadastro); serviço pelo "custo do material"
 *    do serviço × vezes; com "Contar comissão como custo", a comissão da linha também. Sem custo informado, a linha não
 *    ganha margem inventada: fica "custo não informado";
 *  - a ponte com o Financeiro: linhas + outros lançamentos = Entrou; − devoluções e crédito = faturamento; − saídas = resultado.
 * Sem importações de tela: usada pela tela de Relatórios, pela planilha, pelo Mozart e pelos testes.
 */

export const OPCAO_COMISSAO_CUSTO = "lucro.comissao_custo";

const real = (n: unknown) => Math.round(Number(n ?? 0) * 100) / 100;
const qtd = (n: unknown) => Math.round(Number(n ?? 0) * 1000) / 1000;

/** O que `lucro_do_periodo` devolve. */
export type LucroDoBanco = {
  de: string; ate: string; comissao_como_custo: boolean;
  servicos: { servico_id: string | null; nome: string; quantidade: number; receita: number; custo_material_unitario: number | null; comissao: number }[];
  produtos: { produto_id: string | null; nome: string; unidade: string; quantidade: number; receita: number; custo_salvo: number; custo_cadastro: number; sem_custo: number; comissao: number }[];
  extras: { receita: number; comissao: number };
  outros: { categoria: string; valor: number; lancamentos: number }[];
  entradas: number; devolvido: number; credito_deixado: number; credito_usado_fora: number; faturamento: number;
  saidas: { categoria: string; valor: number }[]; saiu: number; resultado: number; comissao_total: number;
};

export type LinhaLucro = {
  chave: string; tipo: "servico" | "produto" | "extra"; id: string | null; nome: string;
  quantidade: number; unidade: string; receita: number;
  /** Partes do custo: material (serviço) ou produtos vendidos (produto); null = não informado. */
  material: number | null;
  /** Comissão da linha no período (sempre mostrada; entra no custo só com a opção ligada). */
  comissao: number;
  /** Custo total; null quando falta informar algum custo da linha. */
  custo: number | null;
  margem: number | null;
  /** Margem em % da receita (null sem custo ou sem receita). */
  pct: number | null;
  /** Por que o custo não está completo (para a tela e a planilha). */
  falta: string | null;
  /** Parte do custo do produto que veio do cadastro de hoje (venda sem custo guardado). */
  custoDeHoje: number;
};

export type Lucro = {
  servicos: LinhaLucro[]; produtos: LinhaLucro[]; extras: LinhaLucro | null;
  comissaoComoCusto: boolean;
  totais: {
    receita: number; receitaComCusto: number; receitaSemCusto: number; linhasSemCusto: number;
    custo: number; margem: number; pct: number | null; comissao: number;
  };
  ponte: {
    linhas: number; outros: { categoria: string; valor: number; lancamentos: number }[]; somaOutros: number; entradas: number;
    devolvido: number; creditoDeixado: number; creditoUsadoFora: number; faturamento: number;
    saidas: { categoria: string; valor: number }[]; saiu: number; resultado: number;
    /** Linhas + outros − Entrou: sempre zero (o banco reparte cada entrada ao centavo). Fica aqui para os testes e a tela. */
    diferenca: number;
  };
};

function fechar(l: Omit<LinhaLucro, "margem" | "pct">): LinhaLucro {
  const margem = l.custo == null ? null : real(l.receita - l.custo);
  return { ...l, margem, pct: margem == null || !(l.receita > 0) ? null : (margem / l.receita) * 100 };
}

/** Monta as linhas e os totais do relatório a partir da resposta do banco. */
export function montarLucro(b: LucroDoBanco): Lucro {
  const comComissao = Boolean(b.comissao_como_custo);
  const servicos = (b.servicos ?? []).map((s): LinhaLucro => {
    const n = qtd(s.quantidade), comissao = real(s.comissao);
    const material = s.custo_material_unitario == null ? null : real(Number(s.custo_material_unitario) * n);
    const custo = material == null ? null : real(material + (comComissao ? comissao : 0));
    return fechar({
      chave: `s:${s.servico_id ?? "-"}`, tipo: "servico", id: s.servico_id, nome: s.nome, quantidade: n, unidade: n === 1 ? "vez" : "vezes",
      receita: real(s.receita), material, comissao, custo, falta: material == null ? "custo do material não informado" : null, custoDeHoje: 0,
    });
  });
  const produtos = (b.produtos ?? []).map((p): LinhaLucro => {
    const comissao = real(p.comissao), semCusto = qtd(p.sem_custo);
    const material = semCusto > 0 ? null : real(Number(p.custo_salvo) + Number(p.custo_cadastro));
    const custo = material == null ? null : real(material + (comComissao ? comissao : 0));
    return fechar({
      chave: `p:${p.produto_id ?? p.nome}`, tipo: "produto", id: p.produto_id, nome: p.nome, quantidade: qtd(p.quantidade), unidade: p.unidade || "un",
      receita: real(p.receita), material, comissao, custo, custoDeHoje: real(p.custo_cadastro),
      falta: semCusto > 0 ? `${semCusto.toLocaleString("pt-BR")} ${p.unidade || "un"} sem custo no cadastro` : null,
    });
  });
  const ex = b.extras ?? { receita: 0, comissao: 0 };
  const extras = real(ex.receita) !== 0 || real(ex.comissao) !== 0
    ? fechar({ chave: "extras", tipo: "extra", id: null, nome: "Extras da conta", quantidade: 0, unidade: "", receita: real(ex.receita), material: null, comissao: real(ex.comissao), custo: null, falta: "extras não têm custo cadastrado", custoDeHoje: 0 })
    : null;

  const todas = [...servicos, ...produtos, ...(extras ? [extras] : [])];
  const comCusto = todas.filter((l) => l.custo != null);
  const receita = real(todas.reduce((t, l) => t + l.receita, 0));
  const receitaComCusto = real(comCusto.reduce((t, l) => t + l.receita, 0));
  const custo = real(comCusto.reduce((t, l) => t + (l.custo ?? 0), 0));
  const margem = real(receitaComCusto - custo);
  const outros = (b.outros ?? []).map((o) => ({ categoria: o.categoria, valor: real(o.valor), lancamentos: Number(o.lancamentos) }));
  const somaOutros = real(outros.reduce((t, o) => t + o.valor, 0));
  const entradas = real(b.entradas);
  return {
    servicos, produtos, extras, comissaoComoCusto: comComissao,
    totais: {
      receita, receitaComCusto, receitaSemCusto: real(receita - receitaComCusto), linhasSemCusto: todas.length - comCusto.length,
      custo, margem, pct: receitaComCusto > 0 ? (margem / receitaComCusto) * 100 : null, comissao: real(b.comissao_total),
    },
    ponte: {
      linhas: receita, outros, somaOutros, entradas,
      devolvido: real(b.devolvido), creditoDeixado: real(b.credito_deixado), creditoUsadoFora: real(b.credito_usado_fora), faturamento: real(b.faturamento),
      saidas: (b.saidas ?? []).map((s) => ({ categoria: s.categoria, valor: real(s.valor) })), saiu: real(b.saiu), resultado: real(b.resultado),
      diferenca: real(receita + somaOutros - entradas),
    },
  };
}

/** As linhas que dão mais lucro primeiro (margem em reais); sem custo informado, vão para o fim, pela receita. */
export function porLucro(linhas: LinhaLucro[]): LinhaLucro[] {
  return [...linhas].sort((a, b) => (a.margem == null) !== (b.margem == null) ? (a.margem == null ? 1 : -1)
    : (b.margem ?? b.receita) - (a.margem ?? a.receita) || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** O que `equipe_do_periodo` devolve. */
export type EquipeDoBanco = {
  de: string; ate: string; so_eu: boolean; vendido_por_desde?: string | null;
  pessoas: { profissional_id: string; nome: string; cor: string | null; ativo: boolean; atendimentos: number; contas: number; vendas: number; vendas_valor: number; servicos_valor: number; receita: number; comissao: number }[];
  sem_pessoa?: { servicos_valor: number; vendas: number; vendas_valor: number; receita: number } | null;
};

export type LinhaPessoa = {
  id: string | null; nome: string; cor: string | null; atendimentos: number; contas: number; vendas: number; vendasValor: number;
  servicosValor: number; receita: number; medio: number | null; comissao: number;
};

/** Linhas de "Por pessoa": valor médio = receita atribuída ÷ contas recebidas (quitadas ou vendas) da pessoa no período. */
export function montarEquipe(b: EquipeDoBanco): { pessoas: LinhaPessoa[]; semPessoa: LinhaPessoa | null; total: { receita: number; comissao: number; atendimentos: number }; soEu: boolean; desde: string | null } {
  const pessoas = (b.pessoas ?? []).map((p): LinhaPessoa => ({
    id: p.profissional_id, nome: p.nome, cor: p.cor, atendimentos: Number(p.atendimentos), contas: Number(p.contas), vendas: Number(p.vendas),
    vendasValor: real(p.vendas_valor), servicosValor: real(p.servicos_valor), receita: real(p.receita),
    medio: Number(p.contas) > 0 ? real(Number(p.receita) / Number(p.contas)) : null, comissao: real(p.comissao),
  }));
  const s = b.sem_pessoa;
  const semPessoa = s && real(s.receita) !== 0
    ? { id: null, nome: "Sem pessoa registrada", cor: null, atendimentos: 0, contas: 0, vendas: Number(s.vendas), vendasValor: real(s.vendas_valor), servicosValor: real(s.servicos_valor), receita: real(s.receita), medio: null, comissao: 0 }
    : null;
  const todas = [...pessoas, ...(semPessoa ? [semPessoa] : [])];
  return {
    pessoas, semPessoa, soEu: Boolean(b.so_eu), desde: b.vendido_por_desde ?? null,
    total: { receita: real(todas.reduce((t, p) => t + p.receita, 0)), comissao: real(pessoas.reduce((t, p) => t + p.comissao, 0)), atendimentos: pessoas.reduce((t, p) => t + p.atendimentos, 0) },
  };
}
