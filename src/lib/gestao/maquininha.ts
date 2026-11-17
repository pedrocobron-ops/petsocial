import type { Banco } from "./supabase";
import { partesPorForma, type PartePagamento } from "./dinheiro";

/**
 * Taxas da maquininha (migração 20261204): o que a maquininha cobra em cada forma de pagamento e quanto a loja recebe de
 * verdade. O preço do cliente não muda: é só informação para o dono.
 *
 *  - As taxas ficam em `taxas_maquininha` (uma linha por pet shop). Só o dono grava; quem cuida do financeiro lê.
 *  - A taxa de cada entrada paga com cartão ou Pix é calculada pelo banco NA HORA DO PAGAMENTO e guardada em
 *    `lancamentos_taxas`, com a regra daquele momento. Mudar as taxas depois não muda o que já foi pago.
 *  - Pagamento dividido: cada parte paga a taxa da sua forma (as partes de `partesPorForma`).
 *  - Crédito em 2 ou mais vezes: a % daquele número de parcelas; sem ela, a % do parcelado; sem ela, a do crédito à vista.
 *  - taxa = valor × % + valor fixo por venda, arredondada ao centavo (nunca mais que a parte). A mesma conta do banco
 *    (`taxa_calcular`): `calcularTaxa` aqui serve para mostrar "Você recebe" antes de gravar.
 */

export type TaxasMaquininha = {
  debito_pct: number; debito_fixo: number; debito_dias: number;
  credito_pct: number; credito_fixo: number; credito_dias: number;
  /** Crédito parcelado; null = usa a do crédito à vista. */
  parcelado_pct: number | null; parcelado_dias: number | null;
  /** "2" a "12" → %, só as que a loja quiser. */
  parcelas_pct: Record<string, number>;
  pix_pct: number; pix_fixo: number; pix_dias: number;
};

export const TAXAS_ZERADAS: TaxasMaquininha = {
  debito_pct: 0, debito_fixo: 0, debito_dias: 1, credito_pct: 0, credito_fixo: 0, credito_dias: 30,
  parcelado_pct: null, parcelado_dias: null, parcelas_pct: {}, pix_pct: 0, pix_fixo: 0, pix_dias: 0,
};

/** Limites (os mesmos do banco). */
export const MAX_PCT = 30, MAX_FIXO = 50, MAX_DIAS = 120;

/** Ao centavo, meio centavo para cima (como o round do banco): 0,495 vira 0,50, sem o erro do ponto flutuante. */
const real = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;
const num = (v: unknown, padrao = 0) => (v == null || v === "" || !Number.isFinite(Number(v)) ? padrao : Number(v));

/** Lê a linha do banco (números que chegam como texto viram número). */
export function lerTaxas(x: Record<string, unknown> | null | undefined): TaxasMaquininha | null {
  if (!x) return null;
  const parcelas: Record<string, number> = {};
  const pp = x.parcelas_pct;
  if (pp && typeof pp === "object" && !Array.isArray(pp)) for (const [k, v] of Object.entries(pp as Record<string, unknown>)) if (/^([2-9]|1[0-2])$/.test(k) && Number.isFinite(Number(v))) parcelas[k] = Number(v);
  return {
    debito_pct: num(x.debito_pct), debito_fixo: num(x.debito_fixo), debito_dias: num(x.debito_dias, 1),
    credito_pct: num(x.credito_pct), credito_fixo: num(x.credito_fixo), credito_dias: num(x.credito_dias, 30),
    parcelado_pct: x.parcelado_pct == null ? null : num(x.parcelado_pct), parcelado_dias: x.parcelado_dias == null ? null : num(x.parcelado_dias),
    parcelas_pct: parcelas, pix_pct: num(x.pix_pct), pix_fixo: num(x.pix_fixo), pix_dias: num(x.pix_dias),
  };
}

/** A regra de uma forma: % , fixo e dias para cair. Crédito com `parcelas` ≥ 2 usa o parcelado. */
export function regraDaForma(t: TaxasMaquininha, forma: string, parcelas = 1): { pct: number; fixo: number; dias: number } | null {
  if (forma === "debito") return { pct: t.debito_pct, fixo: t.debito_fixo, dias: t.debito_dias };
  if (forma === "pix") return { pct: t.pix_pct, fixo: t.pix_fixo, dias: t.pix_dias };
  if (forma !== "credito") return null;
  if (parcelas >= 2) return { pct: t.parcelas_pct[String(parcelas)] ?? t.parcelado_pct ?? t.credito_pct, fixo: t.credito_fixo, dias: t.parcelado_dias ?? t.credito_dias };
  return { pct: t.credito_pct, fixo: t.credito_fixo, dias: t.credito_dias };
}

export type ParteComTaxa = { forma: string; valor: number; parcelas: number | null; pct: number; fixo: number; taxa: number; dias: number };

/**
 * A taxa de um pagamento (a mesma conta do banco, `taxa_calcular`). `pagamentos`: as partes do dividido (ou null).
 * Devolve a taxa total, quanto foi no cartão ou Pix, quanto a loja recebe (valor − taxa) e a conta de cada parte.
 */
export function calcularTaxa(t: TaxasMaquininha, p: { valor: number; forma: string | null; pagamentos?: PartePagamento[] | null; parcelas?: number | null }) {
  const partes = partesPorForma({ valor: p.valor, forma: p.forma, pagamentos: p.pagamentos ?? null });
  const n = Math.max(1, Number(p.parcelas ?? 1));
  const comTaxa: ParteComTaxa[] = [];
  for (const forma of ["debito", "credito", "pix"]) {
    const parte = partes.find((x) => x.forma === forma);
    const r = parte && regraDaForma(t, forma, n);
    if (!parte || !r) continue;
    const taxa = Math.min(parte.valor, real((parte.valor * r.pct) / 100 + r.fixo));
    comTaxa.push({ forma, valor: parte.valor, parcelas: forma === "credito" ? n : null, pct: r.pct, fixo: r.fixo, taxa, dias: r.dias });
  }
  const taxa = real(comTaxa.reduce((s, x) => s + x.taxa, 0));
  return { taxa, cartao: real(comTaxa.reduce((s, x) => s + x.valor, 0)), recebe: real(Number(p.valor) - taxa), partes: comTaxa };
}

/** A loja preencheu alguma taxa? (tudo zero = nada a mostrar no pagamento) */
export const temTaxa = (t: TaxasMaquininha | null) => Boolean(t && (t.debito_pct || t.debito_fixo || t.credito_pct || t.credito_fixo || t.parcelado_pct
  || Object.values(t.parcelas_pct).some((v) => v > 0) || t.pix_pct || t.pix_fixo));

/** A loja quer saber em quantas vezes foi o crédito (tem taxa ou prazo de parcelado). */
export const perguntaParcelas = (t: TaxasMaquininha | null) => Boolean(t && (t.parcelado_pct != null || t.parcelado_dias != null || Object.keys(t.parcelas_pct).length));

/* ---------- ler e gravar ---------- */

const cache = new Map<string, { quando: number; taxas: TaxasMaquininha | null }>();
const EVENTO = "gestao:taxas-maquininha";

/** As taxas da loja (só quem cuida do financeiro lê; para os outros, null). Guarda por 1 minuto. */
export async function carregarTaxas(sb: Banco, petshopId: string, novo = false): Promise<TaxasMaquininha | null> {
  const c = cache.get(petshopId);
  if (!novo && c && Date.now() - c.quando < 60_000) return c.taxas;
  const r = await sb.from("taxas_maquininha").select("*").eq("petshop_id", petshopId).maybeSingle();
  // banco antes da migração, ou sem permissão: sem taxas
  const taxas = r.error ? null : lerTaxas(r.data as Record<string, unknown> | null);
  cache.set(petshopId, { quando: Date.now(), taxas });
  return taxas;
}

/** Grava as taxas (só o dono: o banco confere). */
export async function salvarTaxas(sb: Banco, petshopId: string, t: TaxasMaquininha): Promise<void> {
  const r = await sb.from("taxas_maquininha").upsert({ petshop_id: petshopId, ...t, parcelas_pct: t.parcelas_pct }, { onConflict: "petshop_id" }).select("petshop_id");
  if (r.error) throw new Error(/row-level security|permission/i.test(r.error.message) ? "Só o dono muda as taxas da maquininha." : r.error.message);
  if (!r.data?.length) throw new Error("Só o dono muda as taxas da maquininha.");
  cache.delete(petshopId);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO));
}

/** Tira as taxas (o que já foi pago continua com a taxa daquele dia). */
export async function apagarTaxas(sb: Banco, petshopId: string): Promise<void> {
  const r = await sb.from("taxas_maquininha").delete().eq("petshop_id", petshopId);
  if (r.error) throw new Error(r.error.message);
  cache.delete(petshopId);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO));
}

/** Para as telas recarregarem quando o dono muda as taxas. */
export function aoMudarTaxas(f: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENTO, f);
  return () => window.removeEventListener(EVENTO, f);
}

/** A loja pergunta em quantas vezes foi o crédito? (qualquer pessoa da loja; não diz valor). */
export async function lojaPerguntaParcelas(sb: Banco, petshopId: string): Promise<boolean> {
  const r = await sb.rpc("maquininha_pergunta_parcelas", { p: petshopId });
  return !r.error && r.data === true;
}

/**
 * Crédito parcelado: anota em quantas vezes, logo depois de gravar o pagamento (a taxa do parcelado entra no lugar da do
 * crédito à vista). Só faz algo com 2 ou mais vezes; uma falha aqui não desfaz o pagamento (a taxa fica a do à vista).
 */
export async function anotarParcelas(sb: Banco, petshopId: string, ids: (string | null | undefined)[], parcelas: number | null | undefined): Promise<number> {
  const lista = [...new Set(ids.filter((x): x is string => Boolean(x)))].slice(0, 20);
  if (!parcelas || parcelas < 2 || !lista.length) return 0;
  const r = await sb.rpc("maquininha_parcelas", { p: petshopId, p_ids: lista, p_parcelas: Math.min(12, Math.round(parcelas)) });
  return r.error ? 0 : Number(r.data ?? 0);
}

/** Os ids de lançamento que uma operação tudo-ou-nada gravou (para anotar as parcelas). */
export function idsDaOperacao(r: { ids?: Record<string, string>; passos?: { t: string; id?: string; linha?: Record<string, unknown> | null }[] } | null | undefined): string[] {
  if (!r) return [];
  const ids = new Set<string>(Object.values(r.ids ?? {}));
  for (const p of r.passos ?? []) {
    if (p.t === "lancamento" && p.id) ids.add(p.id);
    if (p.t === "receber" || p.t === "receber_credito") {
      if (p.id) ids.add(p.id);
      const l = p.linha as { id?: unknown } | null | undefined;
      if (l && typeof l.id === "string") ids.add(l.id);
    }
  }
  return [...ids];
}

/* ---------- relatório ---------- */

/** O que `taxas_do_periodo` devolve. */
export type TaxasDoPeriodo = {
  de: string; ate: string; hoje: string; configurada: boolean; taxa: number; cartao: number; lancamentos: number;
  por_forma: { forma: string; valor: number; taxa: number }[];
  /** O que a maquininha ainda vai pagar, por dia (já sem a taxa). */
  a_receber: { dia: string; valor: number }[];
};

export async function taxasDoPeriodo(sb: Banco, petshopId: string, de: string, ate: string): Promise<TaxasDoPeriodo | null> {
  const r = await sb.rpc("taxas_do_periodo", { p: petshopId, p_de: de, p_ate: ate });
  if (r.error || !r.data) return null;
  const d = r.data as unknown as TaxasDoPeriodo;
  return {
    ...d, taxa: real(Number(d.taxa)), cartao: real(Number(d.cartao)), lancamentos: Number(d.lancamentos),
    por_forma: (d.por_forma ?? []).map((x) => ({ forma: x.forma, valor: real(Number(x.valor)), taxa: real(Number(x.taxa)) })),
    a_receber: (d.a_receber ?? []).map((x) => ({ dia: x.dia, valor: real(Number(x.valor)) })),
  };
}

/** "2,5%" (sem zeros à toa). */
export const pctTexto = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
export const NOME_FORMA_TAXA: Record<string, string> = { debito: "Débito", credito: "Crédito", pix: "Pix" };
