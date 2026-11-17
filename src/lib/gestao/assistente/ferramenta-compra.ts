import type Anthropic from "@anthropic-ai/sdk";
import { podeArea } from "../acessos";
import { analisarCompra, lerMovimentosDaCompra, PERIODOS, textoDasSemanas } from "../compra";
import { contando, lerTudo } from "../paginas";
import { comCustos } from "../reservado";
import type { Contexto } from "./ferramentas";

/**
 * Ferramenta de consulta "o_que_comprar" do Mozart ("o que preciso comprar?"): a mesma conta da tela Estoque, O que comprar
 * (`src/lib/gestao/compra.ts`), com o motivo de cada número. Só para quem tem a área Estoque; valores em R$ só para quem vê
 * o financeiro. Só lê: o pedido ao fornecedor a pessoa manda pela tela.
 */

type Def = Anthropic.Tool & { grava: boolean; financeiro?: boolean };

export const FERRAMENTAS_COMPRA: Def[] = [
  { grava: false, name: "o_que_comprar",
    description: "Sugestão de compra do estoque (\"o que preciso comprar?\", \"o que está acabando?\", \"tem produto parado?\"): para cada produto, a média que saiu por semana nas últimas semanas (vendas e uso; perda e saldo corrigido não contam), o saldo, para quantas semanas dá e quanto comprar para cobrir as semanas pedidas mais o estoque mínimo (em caixas inteiras quando o produto vem em caixa), separado pelo último fornecedor; os sem vendas recentes (sem sugestão), os parados há 60 dias ou mais e os acabando. Cada produto traz a explicação da conta: repita a explicação, não invente números. Só para quem cuida do estoque.",
    input_schema: { type: "object", properties: {
      semanas: { type: "number", description: "Para quantas semanas comprar. Padrão: 2" },
      periodo_semanas: { type: "number", enum: [...PERIODOS], description: "Quantas semanas olhar para trás. Padrão: 6" },
    }, required: [], additionalProperties: false } },
];

const real = (n: number) => Math.round(n * 100) / 100;

/** Roda a ferramenta; devolve null quando o nome não é desta lista. Erro de uso: lança Error com a frase para o modelo. */
export async function consultarCompra(c: Contexto, nome: string, e: Record<string, unknown>, erroDeUso: (msg: string) => Error) {
  if (nome !== "o_que_comprar") return null;
  if (!podeArea(c.eu, "estoque")) throw erroDeUso("O que comprar é com quem cuida do estoque: esta pessoa não tem a área Estoque. O dono pode liberar em Equipe.");
  const semanas = typeof e.semanas === "number" && Number.isFinite(e.semanas) ? Math.max(1, Math.min(12, e.semanas)) : 2;
  const periodo = (PERIODOS as readonly number[]).includes(Number(e.periodo_semanas)) ? Number(e.periodo_semanas) : 6;
  const { sb, petshop } = c;
  const [base, movs] = await Promise.all([
    lerTudo<{ id: string; nome: string; unidade: string; estoque: number; estoque_minimo: number; criado_em: string; embalagem_qtd: number | null; fornecedor_id: string | null }>((de, ate, contar) =>
      sb.from("produtos").select("id, nome, unidade, estoque, estoque_minimo, criado_em, embalagem_qtd, fornecedor_id", contando(contar)).eq("petshop_id", petshop.id).eq("ativo", true).order("nome").order("id").range(de, ate)),
    lerMovimentosDaCompra(sb, petshop.id),
  ]);
  const produtos = c.vejoFinanceiro ? await comCustos(sb, petshop.id, base) : base.map((p) => ({ ...p, custo: null }));
  const fornecedores = new Map<string, string>();
  const ids = [...new Set(produtos.map((p) => p.fornecedor_id).filter((x): x is string => Boolean(x)))];
  if (ids.length) {
    const r = await sb.from("fornecedores").select("id, nome").eq("petshop_id", petshop.id).in("id", ids);
    for (const f of r.data ?? []) fornecedores.set(f.id, f.nome);
  }
  const a = analisarCompra(produtos, movs, { semanasPeriodo: periodo, semanasCobrir: semanas });
  const item = (l: (typeof a.linhas)[number]) => ({
    produto: l.produto.nome, unidade: l.produto.unidade, saldo: Number(l.produto.estoque),
    ...(l.porSemana != null ? { media_por_semana: Math.round(l.porSemana * 10) / 10, da_para: textoDasSemanas(l.semanasRestam) } : {}),
    ...(l.sugestao ? { comprar: l.sugestao, ...(l.caixas ? { caixas: l.caixas } : {}) } : {}),
    ...(l.perdido > 0 ? { perda_no_periodo: l.perdido } : {}),
    explicacao: l.explicacao,
  });
  const comprar = a.linhas.filter((l) => l.estado === "comprar");
  const grupos = new Map<string, ReturnType<typeof item>[]>();
  for (const l of comprar) {
    const nomeF = (l.produto.fornecedor_id && fornecedores.get(l.produto.fornecedor_id)) || "Sem fornecedor";
    if (!grupos.has(nomeF)) grupos.set(nomeF, []);
    grupos.get(nomeF)!.push(item(l));
  }
  const sem = a.linhas.filter((l) => l.estado === "sem_vendas");
  return {
    resultado: {
      semanas_para_cobrir: semanas, semanas_olhadas: periodo,
      conta: "Média por semana (vendas e uso) × semanas + estoque mínimo − saldo, arredondado para cima (caixas inteiras quando o produto vem em caixa). Perda ou vencido e saldo corrigido ficam fora.",
      para_comprar: [...grupos.entries()].map(([fornecedor, itens]) => ({ fornecedor, itens: itens.slice(0, 40) })),
      total_para_comprar: comprar.length,
      com_estoque_suficiente: a.linhas.filter((l) => l.estado === "suficiente").length,
      sem_vendas_recentes: sem.slice(0, 30).map((l) => ({ produto: l.produto.nome, saldo: Number(l.produto.estoque), unidade: l.produto.unidade })),
      acabando: a.acabando.slice(0, 30).map((l) => ({ produto: l.produto.nome, saldo: Number(l.produto.estoque), minimo: Number(l.produto.estoque_minimo), da_para: l.semanasRestam != null ? textoDasSemanas(l.semanasRestam) : "sem vendas recentes" })),
      parados_60_dias: a.parados.slice(0, 30).map((p) => ({ produto: p.nome, saldo: Number(p.estoque), unidade: p.unidade })),
      ...(c.vejoFinanceiro ? { valor_em_estoque: a.valorEmEstoque != null ? real(a.valorEmEstoque) : null, valor_parado: a.valorParado != null ? real(a.valorParado) : null, produtos_sem_custo: a.semCusto } : {}),
      onde_ver: "Estoque, O que comprar: um toque no fornecedor monta o pedido pelo WhatsApp com essas quantidades (dá para mudar antes de mandar).",
    },
  };
}
