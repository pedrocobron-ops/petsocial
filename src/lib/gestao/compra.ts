import type { Banco } from "./supabase";
import { contando, lerTudo } from "./paginas";
import { centavos } from "./util";

/**
 * Sugestão de compra e análise do estoque ("O que comprar", na tela Estoque, e o Mozart em "o que preciso comprar?").
 * Tudo sai dos movimentos de verdade: a média da semana é o que saiu (venda e uso) no período, dividido pelas semanas;
 * saldo corrigido (ajuste) não conta, perda ou vencido aparece à parte e não conta como venda, venda desfeita desconta.
 * Kits ficam de fora: a venda de um kit vira saída "Venda" de cada produto do kit, e é essa que conta.
 * Sem saída no período: "sem vendas recentes", sem sugestão. Nada de número inventado: cada linha diz de onde veio a conta.
 */

export type ProdutoDaCompra = {
  id: string; nome: string; unidade: string; estoque: number; estoque_minimo: number; criado_em: string;
  embalagem_qtd?: number | null; fornecedor_id?: string | null; custo?: number | null;
  /** Custo médio sem arredondar (só para o valor em estoque; `comCustos`). */
  custo_exato?: number | null;
  /** 'kit': fica de fora (não se compra kit; a venda do kit já conta nos produtos dele, e o valor não conta duas vezes). */
  tipo?: string | null;
};
export type MovimentoDaCompra = { produto_id: string; tipo: string; quantidade: number; motivo: string | null; criado_em: string };

export type EstadoDaCompra = "comprar" | "suficiente" | "sem_vendas";
export type LinhaDaCompra = {
  produto: ProdutoDaCompra;
  estado: EstadoDaCompra;
  /** Vendido no período (vendas menos vendas desfeitas). */
  vendido: number;
  /** Outras saídas que gastam o produto (uso no banho, uso interno). */
  usado: number;
  /** Perda ou vencido no período: fica de fora da média. */
  perdido: number;
  /** Dias olhados: o período inteiro, ou desde o cadastro do produto (no mínimo 7). */
  dias: number;
  /** Média por semana (venda + uso). null sem saída no período. */
  porSemana: number | null;
  /** Semanas que o saldo de hoje aguenta nessa média. */
  semanasRestam: number | null;
  /** Quanto comprar (já arredondado para cima e para caixas inteiras). 0 quando o saldo dá. null sem vendas. */
  sugestao: number | null;
  /** Caixas da sugestão, quando o produto tem "vem em caixa de". */
  caixas: number | null;
  /** A conta escrita, para a pessoa ver de onde veio o número. */
  explicacao: string;
};

export type AnaliseDaCompra = {
  semanasPeriodo: number;
  semanasCobrir: number;
  linhas: LinhaDaCompra[];
  /** Com saldo e nada saiu nos últimos 60 dias (e o produto existe há 60 dias ou mais). */
  parados: ProdutoDaCompra[];
  /** Zerados, no mínimo ou abaixo, ou que acabam em menos de uma semana. */
  acabando: LinhaDaCompra[];
  /** Custo × saldo dos produtos com custo (null quando nenhum tem custo ou a pessoa não vê o custo). */
  valorEmEstoque: number | null;
  valorParado: number | null;
  /** Produtos com saldo e sem custo: ficam fora do valor. */
  semCusto: number;
  /** Total perdido (perda ou vencido) no período, por produto com perda. */
  perdas: { produto: ProdutoDaCompra; quantidade: number }[];
};

export const PARADO_DIAS = 60;
export const PERIODOS = [4, 6, 8] as const;
const DIA = 864e5;

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Motivo de saída que é perda (não é venda nem uso). */
export const ehPerda = (motivo: string | null | undefined) => /perda|perdi|vencid|venceu|validade|quebr|estrag|rasg|furad|roubad|sumiu/.test(semAcento(motivo ?? ""));
const ehVenda = (motivo: string | null | undefined) => /^venda/.test(semAcento(motivo ?? "").trim());
const ehVendaDesfeita = (motivo: string | null | undefined) => /venda desfeita|devolu/.test(semAcento(motivo ?? ""));

/** "3,5" (até uma casa), "12". */
export const num1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const qtd = (n: number) => Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const medida = (n: number, unidade: string) => `${qtd(n)} ${unidade === "un" ? (n === 1 ? "unidade" : "unidades") : unidade}`;

/** Semanas que o saldo aguenta, em palavras. */
export function textoDasSemanas(s: number | null): string {
  if (s == null) return "–";
  if (s <= 0) return "acabou";
  if (s < 1) return "menos de 1 semana";
  if (s > 52) return "mais de 1 ano";
  return `${num1(s)} ${Math.round(s * 10) === 10 ? "semana" : "semanas"}`;
}

/** Arredonda a falta para cima: inteiro, ou caixas inteiras quando o produto vem em caixa. */
export function arredondarCompra(falta: number, embalagem: number | null | undefined): { quantidade: number; caixas: number | null } {
  if (!(falta > 0)) return { quantidade: 0, caixas: null };
  const cx = Number(embalagem);
  if (cx > 0) {
    const caixas = Math.ceil(falta / cx - 1e-9);
    return { quantidade: Math.round(caixas * cx * 1000) / 1000, caixas };
  }
  return { quantidade: Math.ceil(falta - 1e-9), caixas: null };
}

export function analisarCompra(todos: ProdutoDaCompra[], movimentos: MovimentoDaCompra[], o: { agora?: Date; semanasPeriodo?: number; semanasCobrir?: number } = {}): AnaliseDaCompra {
  // kit não se compra: a venda do kit baixa (e conta) os produtos dele
  const produtos = todos.filter((p) => p.tipo !== "kit");
  const agora = (o.agora ?? new Date()).getTime();
  const semanasPeriodo = Math.max(1, Math.min(12, Math.round(o.semanasPeriodo ?? 6)));
  const semanasCobrir = Math.max(0.5, Math.min(26, o.semanasCobrir ?? 2));
  const inicio = agora - semanasPeriodo * 7 * DIA;
  const corteParado = agora - PARADO_DIAS * DIA;

  type Soma = { vendido: number; usado: number; perdido: number; saiuEm60: boolean };
  const somas = new Map<string, Soma>();
  const soma = (id: string) => { let s = somas.get(id); if (!s) somas.set(id, (s = { vendido: 0, usado: 0, perdido: 0, saiuEm60: false })); return s; };
  for (const m of movimentos) {
    const quando = new Date(m.criado_em).getTime();
    const q = Number(m.quantidade) || 0;
    if (m.tipo === "saida") {
      const perda = ehPerda(m.motivo);
      if (!perda && quando >= corteParado) soma(m.produto_id).saiuEm60 = true;
      if (quando < inicio || quando > agora) continue;
      const s = soma(m.produto_id);
      if (perda) s.perdido += q;
      else if (ehVenda(m.motivo)) s.vendido += q;
      else s.usado += q;
    } else if (m.tipo === "entrada" && ehVendaDesfeita(m.motivo) && quando >= inicio && quando <= agora) {
      soma(m.produto_id).vendido -= q;
    }
  }

  const linhas: LinhaDaCompra[] = produtos.map((p) => {
    const s = somas.get(p.id) ?? { vendido: 0, usado: 0, perdido: 0, saiuEm60: false };
    const vendido = Math.max(0, s.vendido), usado = s.usado, perdido = s.perdido;
    const desdeCadastro = Math.floor((agora - new Date(p.criado_em).getTime()) / DIA);
    const dias = Math.max(7, Math.min(semanasPeriodo * 7, Number.isFinite(desdeCadastro) ? desdeCadastro : semanasPeriodo * 7));
    const quando = dias >= semanasPeriodo * 7 ? `nas últimas ${semanasPeriodo} semanas` : `nos ${dias} dias desde que o produto foi cadastrado`;
    const saldo = Number(p.estoque), minimo = Math.max(0, Number(p.estoque_minimo) || 0);
    const consumo = vendido + usado;
    const perdaTxt = perdido > 0 ? ` Perda ou vencido no período: ${medida(perdido, p.unidade)} (fora da média).` : "";
    if (!(consumo > 0)) {
      return { produto: p, estado: "sem_vendas", vendido, usado, perdido, dias, porSemana: null, semanasRestam: null, sugestao: null, caixas: null,
        explicacao: `Sem vendas recentes: nada vendido ${quando}.${perdaTxt}` };
    }
    const porSemana = (consumo / dias) * 7;
    const semanasRestam = saldo > 0 ? saldo / porSemana : 0;
    const verbo = usado > 0 && vendido > 0 ? `Saiu em média ${num1(porSemana)} por semana ${quando} (${qtd(vendido)} vendidos e ${qtd(usado)} usados)`
      : usado > 0 ? `Usou em média ${num1(porSemana)} por semana ${quando} (${qtd(usado)} no total)`
      : `Vendeu em média ${num1(porSemana)} por semana ${quando} (${qtd(vendido)} no total)`;
    const precisa = porSemana * semanasCobrir;
    const alvo = precisa + minimo;
    const falta = alvo - Math.max(0, saldo);
    const { quantidade, caixas } = arredondarCompra(falta, p.embalagem_qtd);
    const cobrir = `${num1(semanasCobrir)} ${semanasCobrir === 1 ? "semana" : "semanas"}`;
    const conta = minimo > 0 ? `Para ${cobrir}: ${num1(precisa)} + mínimo ${qtd(minimo)} = ${num1(alvo)}.` : `Para ${cobrir}: ${num1(precisa)}.`;
    if (quantidade <= 0) {
      return { produto: p, estado: "suficiente", vendido, usado, perdido, dias, porSemana, semanasRestam, sugestao: 0, caixas: null,
        explicacao: `${verbo}. Tem ${medida(saldo, p.unidade)}: dá para ${textoDasSemanas(semanasRestam)}. ${conta} Não precisa comprar agora.${perdaTxt}` };
    }
    const cx = Number(p.embalagem_qtd) > 0 ? ` Vem em caixa de ${qtd(Number(p.embalagem_qtd))}: ${caixas} ${caixas === 1 ? "caixa" : "caixas"} = ${qtd(quantidade)}.` : "";
    return { produto: p, estado: "comprar", vendido, usado, perdido, dias, porSemana, semanasRestam, sugestao: quantidade, caixas,
      explicacao: `${verbo}. ${conta} Tem ${qtd(Math.max(0, saldo))}: faltam ${num1(falta)}.${cx} Comprar ${medida(quantidade, p.unidade)}.${perdaTxt}` };
  });
  const ordem: Record<EstadoDaCompra, number> = { comprar: 0, suficiente: 1, sem_vendas: 2 };
  linhas.sort((a, b) => ordem[a.estado] - ordem[b.estado] || (a.semanasRestam ?? 1e9) - (b.semanasRestam ?? 1e9) || a.produto.nome.localeCompare(b.produto.nome, "pt-BR"));

  const parados = produtos.filter((p) => Number(p.estoque) > 0 && new Date(p.criado_em).getTime() <= corteParado && !somas.get(p.id)?.saiuEm60)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  const acabando = linhas.filter((l) => {
    const saldo = Number(l.produto.estoque), min = Number(l.produto.estoque_minimo);
    return saldo <= 0 || (min > 0 && saldo <= min) || (l.semanasRestam != null && l.semanasRestam < 1);
  });
  const comCusto = produtos.filter((p) => Number(p.estoque) > 0 && p.custo != null);
  const valor = (lista: ProdutoDaCompra[]) => valorEmEstoque(lista);
  return {
    semanasPeriodo, semanasCobrir, linhas, parados, acabando,
    valorEmEstoque: comCusto.length ? valor(comCusto) : null,
    valorParado: parados.some((p) => p.custo != null) ? valor(parados) : null,
    semCusto: produtos.filter((p) => Number(p.estoque) > 0 && p.custo == null).length,
    perdas: linhas.filter((l) => l.perdido > 0).map((l) => ({ produto: l.produto, quantidade: l.perdido })),
  };
}

/** Os movimentos que a análise usa: entradas e saídas dos últimos 60 dias (o período mais longo é de 8 semanas). */
export async function lerMovimentosDaCompra(sb: Banco, petshopId: string, agora = new Date()): Promise<MovimentoDaCompra[]> {
  const desde = new Date(agora.getTime() - PARADO_DIAS * DIA).toISOString();
  return lerTudo<MovimentoDaCompra>((de, ate, contar) => sb.from("movimentos_estoque").select("produto_id, tipo, quantidade, motivo, criado_em", contando(contar))
    .eq("petshop_id", petshopId).in("tipo", ["saida", "entrada"]).gte("criado_em", desde).order("criado_em").order("id").range(de, ate));
}

/**
 * Valor em estoque a preço de custo: saldo × custo médio de cada produto com custo, somado e arredondado só no fim.
 * Usa o custo médio sem arredondar quando o banco entrega (`custo_exato`): 5 × 142 + 4 × 150 = R$ 1.310,00, não 1.310,04.
 */
export function valorEmEstoque(lista: Pick<ProdutoDaCompra, "estoque" | "custo" | "custo_exato" | "tipo">[]) {
  return centavos(lista.filter((p) => p.custo != null && p.tipo !== "kit").reduce((t, p) => t + Number(p.estoque) * Number(p.custo_exato ?? p.custo), 0));
}
