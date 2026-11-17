import type { Banco } from "./supabase";
import { brl } from "./util";

/**
 * Contas fixas (migração 20261212): aluguel, luz, água, internet, salários, contador, sistema… cadastrados uma vez em
 * Financeiro, Contas fixas. O banco põe a conta do mês em A pagar sozinho, ANTECEDENCIA_CONTAS_FIXAS dias antes do vencimento
 * (`contas_fixas_gerar`, chamado ao abrir Financeiro, Hoje e o Bom dia, e pela faxina diária). Uma conta por mês, sem repetir;
 * a que alguém excluiu não volta. Quem vê e mexe: o dono e quem cuida do financeiro.
 */

/** Quantos dias antes do vencimento a conta do mês entra em A pagar (o mesmo de `contas_fixas_antecedencia` no banco). */
export const ANTECEDENCIA_CONTAS_FIXAS = 10;

export type Frequencia = "mensal" | "trimestral" | "semestral" | "anual";
export const FREQUENCIAS: { id: Frequencia; rotulo: string; meses: number }[] = [
  { id: "mensal", rotulo: "Todo mês", meses: 1 },
  { id: "trimestral", rotulo: "A cada 3 meses", meses: 3 },
  { id: "semestral", rotulo: "A cada 6 meses", meses: 6 },
  { id: "anual", rotulo: "Uma vez por ano", meses: 12 },
];
export const mesesDe = (f: string) => FREQUENCIAS.find((x) => x.id === f)?.meses ?? 1;

export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export type ContaFixa = {
  id: string; petshop_id: string; nome: string; categoria: string; dia: number; valor: number; valor_varia: boolean;
  frequencia: Frequencia; mes_inicial: number; comeca_em: string; termina_em: string | null; ativa: boolean; forma: string | null;
  criado_em: string; atualizado_em: string;
};

/** Modelos para preencher rápido: o nome, a categoria de saída e se o valor costuma mudar todo mês. */
export const MODELOS_CONTA_FIXA: { nome: string; categoria: string; varia: boolean; frequencia?: Frequencia }[] = [
  { nome: "Aluguel", categoria: "Aluguel", varia: false },
  { nome: "Luz", categoria: "Água, luz e internet", varia: true },
  { nome: "Água", categoria: "Água, luz e internet", varia: true },
  { nome: "Internet", categoria: "Água, luz e internet", varia: false },
  { nome: "Telefone", categoria: "Água, luz e internet", varia: false },
  { nome: "Salários", categoria: "Salários e comissões", varia: false },
  { nome: "Contador", categoria: "Impostos e taxas", varia: false },
  { nome: "Sistema", categoria: "Outros", varia: false },
  { nome: "Imposto (DAS)", categoria: "Impostos e taxas", varia: true },
  { nome: "IPTU", categoria: "Impostos e taxas", varia: false, frequencia: "anual" },
];

/** Formas de pagar (só anotação). */
export const FORMAS_CONTA_FIXA = ["Pix", "Boleto", "Débito automático", "Cartão", "Dinheiro"];

/** Quanto a conta pesa por mês: a mensal inteira; as outras divididas pelos meses (trimestral ÷ 3…). */
export const valorPorMes = (c: Pick<ContaFixa, "valor" | "frequencia">) => Number(c.valor) / mesesDe(c.frequencia);

/** O total por mês das contas ativas (arredondado no centavo no fim, como o banco). */
export function totalPorMes(contas: Pick<ContaFixa, "valor" | "frequencia" | "ativa">[]) {
  return Math.round(contas.filter((c) => c.ativa).reduce((s, c) => s + valorPorMes(c), 0) * 100) / 100;
}

/** Os meses em que a conta vence (para a trimestral de janeiro: jan, abr, jul, out). */
export function mesesDaConta(c: Pick<ContaFixa, "frequencia" | "mes_inicial">): number[] {
  const passo = mesesDe(c.frequencia);
  if (passo === 1) return Array.from({ length: 12 }, (_, i) => i + 1);
  return Array.from({ length: 12 / passo }, (_, i) => ((c.mes_inicial - 1 + i * passo) % 12) + 1);
}

/** "todo dia 5", "dia 10 de jan, abr, jul e out", "dia 31 de março". */
export function quandoVence(c: Pick<ContaFixa, "frequencia" | "mes_inicial" | "dia">) {
  if (c.frequencia === "mensal") return `todo dia ${c.dia}`;
  const meses = mesesDaConta(c);
  if (meses.length === 1) return `dia ${c.dia} de ${MESES[meses[0] - 1]}`;
  const nomes = meses.sort((a, b) => a - b).map((m) => MESES_CURTOS[m - 1]);
  return `dia ${c.dia} de ${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

/** O vencimento num mês (AAAA-MM-01): dia 31 em fevereiro vence no último dia. */
export function vencimentoNoMes(mes: string, dia: number) {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${mes.slice(0, 8)}${String(Math.min(dia, ultimo)).padStart(2, "0")}`;
}

/* ---------- o resumo: quanto custa manter o pet shop ---------- */

export type ResumoContasFixas = {
  de: string; ate: string; contas: number; nao_mensais: number;
  total_mensal: number; faturamento_mes: number; pct: number | null; falta: number;
};

export async function lerResumoContasFixas(sb: Banco, petshopId: string): Promise<ResumoContasFixas> {
  const r = await sb.rpc("contas_fixas_resumo", { p: petshopId });
  if (r.error) throw new Error(r.error.message);
  const x = r.data as unknown as ResumoContasFixas;
  return { ...x, total_mensal: Number(x.total_mensal), faturamento_mes: Number(x.faturamento_mes), falta: Number(x.falta), pct: x.pct == null ? null : Number(x.pct) };
}

/** Pede ao banco as contas do mês que já entram em A pagar. Sem acesso, ou num banco antes da migração: não faz nada. */
export async function gerarContasFixas(sb: Banco, petshopId: string): Promise<number> {
  try {
    const r = await sb.rpc("contas_fixas_gerar", { p: petshopId });
    return r.error ? 0 : Number(r.data ?? 0);
  } catch { return 0; }
}

/* ---------- os avisos: vence amanhã, vence hoje, venceu ---------- */

export type AvisoContaFixa = { id?: string; nome: string; valor: number; vencimento: string; estimado: boolean };

const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const diaDepois = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** "Aluguel vence amanhã (R$ 2.500,00)", "Luz venceu em 10/11 (R$ 380,00)". `hoje`: AAAA-MM-DD. */
export function fraseDaContaFixa(c: AvisoContaFixa, hoje: string) {
  const v = c.vencimento;
  const quando = v < hoje ? (v === diaDepois(hoje, -1) ? "venceu ontem" : `venceu em ${ddmm(v)}`)
    : v === hoje ? "vence hoje" : v === diaDepois(hoje, 1) ? "vence amanhã" : `vence em ${ddmm(v)}`;
  return `${c.nome} ${quando} (${brl(Number(c.valor))}${c.estimado ? ", valor estimado" : ""})`;
}

/** As contas fixas que pedem atenção: vencidas, de hoje e de amanhã, as vencidas primeiro. */
export function avisosDasContasFixas(lista: AvisoContaFixa[], hoje: string) {
  const amanha = diaDepois(hoje, 1);
  return lista.filter((c) => c.vencimento <= amanha).sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.nome.localeCompare(b.nome));
}

/** Uma linha para o Bom dia (até 3 contas). */
export function linhaDoBomDiaContas(lista: AvisoContaFixa[], hoje: string): string | null {
  const l = avisosDasContasFixas(lista, hoje);
  if (!l.length) return null;
  if (l.length === 1) return `${fraseDaContaFixa(l[0], hoje)}.${l[0].vencimento < hoje ? " Está em Financeiro, A pagar." : ""}`;
  const mais = l.length > 3 ? ` e mais ${l.length - 3}` : "";
  return `Contas fixas: ${l.slice(0, 3).map((c) => fraseDaContaFixa(c, hoje)).join("; ")}${mais}.`;
}

/** Os avisos da tela Hoje: gera as contas do mês e lê as vencidas, de hoje e de amanhã (só quem cuida do financeiro chama). */
export async function lerAvisosContasFixas(sb: Banco, petshopId: string, hoje: string): Promise<AvisoContaFixa[]> {
  await gerarContasFixas(sb, petshopId);
  const r = await sb.from("lancamentos").select("id, descricao, valor, vencimento, valor_estimado").eq("petshop_id", petshopId)
    .eq("tipo", "saida").eq("pago", false).not("competencia", "is", null).lte("vencimento", diaDepois(hoje, 1))
    .order("vencimento").limit(20);
  if (r.error) return [];
  return avisosDasContasFixas((r.data ?? []).map((l) => ({ id: l.id, nome: l.descricao ?? "Conta fixa", valor: Number(l.valor), vencimento: l.vencimento!, estimado: Boolean(l.valor_estimado) })), hoje);
}

/* ---------- relatórios: as saídas em "Contas fixas" e o resto ---------- */

export type SaidasDoPeriodo = {
  saiu: number; total: number;
  contas: { conta_fixa_id: string | null; nome: string; valor: number; vezes: number }[];
  outras: { categoria: string; valor: number }[];
  meses: { mes: string; saiu: number; contas_fixas: number }[];
};

/** `contas_fixas_do_periodo`: null se o banco ainda não tem a função (a tela mostra as saídas como antes). */
export async function lerSaidasDoPeriodo(sb: Banco, petshopId: string, de: string, ate: string): Promise<SaidasDoPeriodo | null> {
  const r = await sb.rpc("contas_fixas_do_periodo", { p: petshopId, p_de: de, p_ate: ate });
  if (r.error || !r.data) return null;
  const x = r.data as unknown as SaidasDoPeriodo;
  return {
    saiu: Number(x.saiu), total: Number(x.total),
    contas: (x.contas ?? []).map((c) => ({ ...c, valor: Number(c.valor), vezes: Number(c.vezes) })),
    outras: (x.outras ?? []).map((o) => ({ ...o, valor: Number(o.valor) })),
    meses: (x.meses ?? []).map((m) => ({ ...m, saiu: Number(m.saiu), contas_fixas: Number(m.contas_fixas) })),
  };
}

/* ---------- o que aconteceu com cada conta fixa no período (migração 20261214) ---------- */

export type SituacaoContaFixa = {
  conta_fixa_id: string | null; nome: string; mes: string; vencimento: string; valor: number; estimado: boolean;
  /** paga · a_pagar (em A pagar) · vai_entrar (ainda não entrou em A pagar) · excluida · pausada · antes_do_inicio (a conta daquele mês não existe) */
  situacao: "paga" | "a_pagar" | "vai_entrar" | "excluida" | "pausada" | "antes_do_inicio";
  pago_em: string | null; entra_em: string | null; comeca_em: string | null;
};

/** `contas_fixas_situacao`: null se o banco ainda não tem a função (as telas ficam como antes). */
export async function lerSituacaoContasFixas(sb: Banco, petshopId: string, de: string, ate: string): Promise<SituacaoContaFixa[] | null> {
  const r = await sb.rpc("contas_fixas_situacao", { p: petshopId, p_de: de, p_ate: ate });
  if (r.error || !Array.isArray(r.data)) return null;
  return (r.data as unknown as SituacaoContaFixa[]).map((x) => ({ ...x, valor: Number(x.valor) }));
}

/** O que ainda falta pagar no período: as contas em A pagar e as que ainda vão entrar (pelo valor da conta fixa). */
export function aindaAPagar(lista: SituacaoContaFixa[]) {
  const itens = lista.filter((x) => x.situacao === "a_pagar" || x.situacao === "vai_entrar");
  return { itens, total: Math.round(itens.reduce((t, x) => t + x.valor, 0) * 100) / 100 };
}

/**
 * A frase do que aconteceu, sem deduzir nada (para a tela e para o Mozart):
 * "paga em 10/11", "em A pagar, vence 20/11", "ainda não entrou em A pagar: entra em 15/11 e vence 25/11",
 * "não existe conta de 11/2026: a conta fixa começou em 17/11/2026, depois do vencimento (05/11)".
 */
export function fraseDaSituacao(s: SituacaoContaFixa, hoje: string): string {
  const v = s.vencimento;
  switch (s.situacao) {
    case "paga": return `paga${s.pago_em ? ` em ${ddmm(s.pago_em)}` : ""}`;
    case "a_pagar": return `em A pagar, ${v < hoje ? `venceu em ${ddmm(v)} e ainda não foi paga` : v === hoje ? "vence hoje" : `vence ${ddmm(v)}`}${s.estimado ? " (valor estimado)" : ""}`;
    case "vai_entrar": return s.entra_em && s.entra_em > hoje ? `ainda não entrou em A pagar: entra em ${ddmm(s.entra_em)} e vence ${ddmm(v)}` : `entra em A pagar ao abrir o Financeiro (vence ${ddmm(v)})`;
    case "excluida": return "foi tirada de A pagar neste mês (não volta)";
    case "pausada": return "conta fixa pausada: a conta deste mês não foi criada";
    case "antes_do_inicio": return `não existe conta de ${s.mes.slice(5, 7)}/${s.mes.slice(0, 4)}: a conta fixa começou em ${s.comeca_em ? `${ddmm(s.comeca_em)}/${s.comeca_em.slice(0, 4)}` : "outro dia"}, depois do vencimento (${ddmm(v)}). Nada foi pago nem ficou para pagar`;
  }
}

/* ---------- quanto precisa faturar, com a margem do que vende ---------- */

/** Dias olhados para a margem média. */
export const DIAS_DA_MARGEM = 90;

/**
 * Faturamento que paga as contas fixas, levando em conta que de cada venda só sobra a margem (preço − custo).
 * Conta: contas fixas ÷ margem média (das linhas de serviço e produto com custo informado, nos últimos 90 dias).
 * Só sai quando dá para confiar: margem entre 1% e 99% e pelo menos metade do que entrou com custo informado.
 * Sem isso, null (a tela diz que a conta é só das contas fixas).
 */
export function faturamentoComMargem(totalMensal: number, l: { totais: { receitaComCusto: number; pct: number | null }; ponte: { entradas: number } }): { pct: number; faturamento: number } | null {
  const pct = l.totais.pct;
  if (!(totalMensal > 0) || pct == null || !(pct >= 1 && pct <= 99)) return null;
  if (!(l.ponte.entradas > 0) || l.totais.receitaComCusto < l.ponte.entradas * 0.5) return null;
  return { pct: Math.round(pct * 10) / 10, faturamento: Math.round((totalMensal / (pct / 100)) * 100) / 100 };
}
