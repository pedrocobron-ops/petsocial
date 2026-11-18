import type { Banco } from "./supabase";
import { isoDia } from "./util";

/**
 * Indicadores (Relatórios, Indicadores): os números dos gráficos, por mês, de `indicadores_do_periodo` (migração 20261204).
 * O banco faz as contas com as mesmas regras de Relatórios e de Quanto sobrou (faturamento, resultado, peças de serviço e
 * produto); aqui só se escolhe o período, se monta o que a tela mostra e se compara com o período anterior.
 * Nada é inventado: sem movimento, a tela diz "Ainda não tem dados neste período".
 */

export const PERIODOS_INDICADORES = [
  { id: "mes", rotulo: "Este mês" },
  { id: "mes_passado", rotulo: "Mês passado" },
  { id: "3", rotulo: "Últimos 3 meses" },
  { id: "6", rotulo: "Últimos 6 meses" },
  { id: "12", rotulo: "Últimos 12 meses" },
] as const;
export type PeriodoIndicadores = (typeof PERIODOS_INDICADORES)[number]["id"];

/** Primeiro e último dia (AAAA-MM-DD). "Últimos N meses" conta o mês atual (até hoje) e os N − 1 anteriores inteiros. */
/** O período que a tela abre: este mês (o primeiro botão). */
export const PERIODO_INICIAL: PeriodoIndicadores = "mes";

export function intervaloIndicadores(p: PeriodoIndicadores, hoje: Date): { de: string; ate: string } {
  const a = hoje.getFullYear(), m = hoje.getMonth();
  if (p === "mes") return { de: isoDia(new Date(a, m, 1)), ate: isoDia(hoje) };
  if (p === "mes_passado") return { de: isoDia(new Date(a, m - 1, 1)), ate: isoDia(new Date(a, m, 0)) };
  const n = Number(p);
  return { de: isoDia(new Date(a, m - (n - 1), 1)), ate: isoDia(hoje) };
}

/**
 * O período de antes, para comparar: este mês até hoje compara com o mês passado até o mesmo dia; mês passado com o
 * retrasado; últimos N meses com os N meses antes deles (inteiros).
 */
export function intervaloAnterior(p: PeriodoIndicadores, hoje: Date): { de: string; ate: string } {
  const a = hoje.getFullYear(), m = hoje.getMonth();
  if (p === "mes") {
    const fimDoMes = new Date(a, m, 0).getDate();
    return { de: isoDia(new Date(a, m - 1, 1)), ate: isoDia(new Date(a, m - 1, Math.min(hoje.getDate(), fimDoMes))) };
  }
  if (p === "mes_passado") return { de: isoDia(new Date(a, m - 2, 1)), ate: isoDia(new Date(a, m - 1, 0)) };
  const n = Number(p);
  return { de: isoDia(new Date(a, m - (2 * n - 1), 1)), ate: isoDia(new Date(a, m - (n - 1), 0)) };
}

export type MesIndicador = {
  mes: string; de: string; ate: string;
  /** null para quem não vê o dinheiro. */
  faturamento: number | null; entradas: number | null; saiu: number | null; resultado: number | null; taxas: number | null;
  resultado_depois_taxas: number | null; valor_medio: number | null;
  contas: number; atendimentos: number; faltas: number; cancelados: number; marcados: number;
  /** o que as contas contadas somaram, com o sinal descontado delas (null para quem não vê o dinheiro, ou banco antigo) */
  valor_contas?: number | null;
  /** reservas e estadias da creche e do hotel (sem as presenças de mensalista), pelo dia da entrada; noites de hotel ocupadas */
  estadias_marcadas?: number; estadias_canceladas?: number; noites_hotel?: number;
  /** reservas canceladas no mês pelo dia do cancelamento (cancelar hoje uma reserva do mês que vem conta hoje); banco antigo: não vem */
  estadias_canceladas_no_periodo?: number;
  estadias_creche: number; estadias_hotel: number; clientes: number; primeira_vez: number; voltaram: number;
};

export type IndicadoresDoBanco = {
  de: string; ate: string; dinheiro: boolean;
  meses: MesIndicador[];
  clientes: number; primeira_vez: number;
  retorno_60: { clientes: number; voltaram: number };
  servicos: { servico_id: string | null; nome: string; vezes: number; receita: number | null }[];
  produtos: { produto_id: string | null; nome: string; unidade: string; quantidade: number; receita: number | null }[];
  /** d: 0 = segunda … 6 = domingo; h: hora (0–23); n: horários marcados (sem os cancelados). */
  mapa: { d: number; h: number; n: number }[];
};

const real = (n: unknown) => Math.round(Number(n ?? 0) * 100) / 100;
const ouNulo = (n: unknown) => (n == null ? null : real(n));

/** Lê a resposta do banco (números que chegam como texto viram número). */
export function lerIndicadores(d: IndicadoresDoBanco): IndicadoresDoBanco {
  return {
    ...d,
    dinheiro: Boolean(d.dinheiro),
    meses: (d.meses ?? []).map((m) => ({
      ...m, faturamento: ouNulo(m.faturamento), entradas: ouNulo(m.entradas), saiu: ouNulo(m.saiu), resultado: ouNulo(m.resultado),
      taxas: ouNulo(m.taxas), resultado_depois_taxas: ouNulo(m.resultado_depois_taxas), valor_medio: ouNulo(m.valor_medio),
      contas: Number(m.contas), atendimentos: Number(m.atendimentos), faltas: Number(m.faltas), cancelados: Number(m.cancelados), marcados: Number(m.marcados),
      valor_contas: ouNulo(m.valor_contas), estadias_marcadas: Number(m.estadias_marcadas ?? 0), estadias_canceladas: Number(m.estadias_canceladas ?? 0),
      estadias_canceladas_no_periodo: m.estadias_canceladas_no_periodo == null ? undefined : Number(m.estadias_canceladas_no_periodo), noites_hotel: Number(m.noites_hotel ?? 0),
      estadias_creche: Number(m.estadias_creche), estadias_hotel: Number(m.estadias_hotel), clientes: Number(m.clientes),
      primeira_vez: Number(m.primeira_vez), voltaram: Number(m.voltaram),
    })),
    clientes: Number(d.clientes), primeira_vez: Number(d.primeira_vez),
    retorno_60: { clientes: Number(d.retorno_60?.clientes ?? 0), voltaram: Number(d.retorno_60?.voltaram ?? 0) },
    servicos: (d.servicos ?? []).map((s) => ({ ...s, vezes: Number(s.vezes), receita: ouNulo(s.receita) })),
    produtos: (d.produtos ?? []).map((p) => ({ ...p, quantidade: Number(p.quantidade), receita: ouNulo(p.receita) })),
    mapa: (d.mapa ?? []).map((x) => ({ d: Number(x.d), h: Number(x.h), n: Number(x.n) })),
  };
}

export async function carregarIndicadores(sb: Banco, petshopId: string, de: string, ate: string): Promise<IndicadoresDoBanco> {
  const r = await sb.rpc("indicadores_do_periodo", { p: petshopId, p_de: de, p_ate: ate });
  if (r.error) throw new Error(r.error.message);
  return lerIndicadores(r.data as unknown as IndicadoresDoBanco);
}

/** Os totais do período (soma dos meses; valor médio = faturamento ÷ contas; % de falta e de cancelamento). */
export function totaisIndicadores(d: IndicadoresDoBanco) {
  const soma = (f: (m: MesIndicador) => number | null) => d.meses.reduce((t, m) => t + (f(m) ?? 0), 0);
  const faturamento = d.dinheiro ? real(soma((m) => m.faturamento)) : null;
  const contas = soma((m) => m.contas);
  const atendimentos = soma((m) => m.atendimentos), faltas = soma((m) => m.faltas);
  // cancelamentos: horários da agenda e reservas da creche e do hotel (as reservas canceladas não apareciam: "0 de 0")
  const reservasCanceladas = soma((m) => m.estadias_canceladas ?? 0), reservasMarcadas = soma((m) => m.estadias_marcadas ?? 0);
  // reservas canceladas no período pelo dia do cancelamento (o que a pessoa fez no período); banco antigo: as de antes
  const canceladasNoPeriodo = d.meses.some((m) => m.estadias_canceladas_no_periodo != null) ? soma((m) => m.estadias_canceladas_no_periodo ?? 0) : reservasCanceladas;
  const cancelados = soma((m) => m.cancelados) + reservasCanceladas, marcados = soma((m) => m.marcados) + reservasMarcadas;
  const estadias = soma((m) => m.estadias_creche + m.estadias_hotel);
  // o valor médio soma só as contas contadas (o sinal entra junto da conta do check-out, não como outra conta; o que foi recebido
  // em parte de uma conta antiga não entra). Banco antigo, sem `valor_contas`: como antes, faturamento ÷ contas.
  const comValorDasContas = d.dinheiro && d.meses.some((m) => m.valor_contas != null);
  const valorDasContas = comValorDasContas ? real(soma((m) => m.valor_contas ?? 0)) : faturamento;
  return {
    faturamento, contas, reservasCanceladas, reservasMarcadas, canceladasNoPeriodo, noitesHotel: soma((m) => m.noites_hotel ?? 0),
    valorMedio: valorDasContas != null && contas > 0 ? real(valorDasContas / contas) : null,
    taxas: d.dinheiro ? real(soma((m) => m.taxas)) : null,
    resultado: d.dinheiro ? real(soma((m) => m.resultado)) : null,
    resultadoDepoisTaxas: d.dinheiro ? real(soma((m) => m.resultado_depois_taxas)) : null,
    atendimentos, estadias, faltas, cancelados, marcados,
    /** Faltas sobre os que deviam vir (concluídos + faltas), como em Relatórios. */
    pctFaltas: atendimentos + faltas > 0 ? (faltas / (atendimentos + faltas)) * 100 : null,
    /** Cancelados sobre tudo o que foi marcado. */
    pctCancelados: marcados > 0 ? (cancelados / marcados) * 100 : null,
    retorno: d.retorno_60.clientes > 0 ? (d.retorno_60.voltaram / d.retorno_60.clientes) * 100 : null,
  };
}

/** Tem algum movimento no período? */
export function temDados(d: IndicadoresDoBanco) {
  const t = totaisIndicadores(d);
  return Boolean(t.marcados || t.estadias || t.contas || t.canceladasNoPeriodo || (t.faturamento ?? 0) !== 0 || d.produtos.length || (t.resultado ?? 0) !== 0);
}

/**
 * "+12% que o período anterior". null quando não dá para comparar (antes era zero ou não tem o número).
 * Arredonda para inteiro (uma casa abaixo de 10%).
 */
export function comparacao(atual: number | null, anterior: number | null): { pct: number; texto: string; sobe: boolean } | null {
  if (atual == null || anterior == null || !(anterior > 0)) return null;
  const v = ((atual - anterior) / anterior) * 100;
  const casas = Math.abs(v) < 10 ? 1 : 0;
  const n = Number(Math.abs(v).toFixed(casas));
  if (n === 0) return { pct: 0, texto: "igual ao período anterior", sobe: true };
  return { pct: v, texto: `${v > 0 ? "+" : "−"}${n.toLocaleString("pt-BR", { maximumFractionDigits: casas })}% que o período anterior`, sobe: v > 0 };
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
/** "nov" ou "nov/25" (quando o período passa de um ano para outro). */
export function rotuloMes(mes: string, comAno: boolean) {
  const [a, m] = mes.split("-");
  return `${MESES_CURTOS[Number(m) - 1]}${comAno ? `/${a.slice(2)}` : ""}`;
}

export const DIAS_SEMANA_CURTOS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
export const pct1 = (n: number | null) => (n == null ? "–" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
