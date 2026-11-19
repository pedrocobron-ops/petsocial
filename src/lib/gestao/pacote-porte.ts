import type { Banco } from "./supabase";
import { centavos } from "./util";

/**
 * Pacote com preço por porte ("4 banhos": P R$ 160, M R$ 180, G R$ 200). O modelo guarda os preços em `pacotes.precos_porte`
 * (só os portes preenchidos); na venda vale o do porte do pet. Pet sem porte, ou porte sem preço: o preço único do modelo.
 * O banco confere o mesmo na venda (anotar_preco_do_pacote): com a trava de preço, só esse preço passa.
 */

export const PORTES_DO_PACOTE = ["P", "M", "G", "GG"] as const;
export type PortePacote = (typeof PORTES_DO_PACOTE)[number];
export type PrecosPorte = Partial<Record<PortePacote, number>>;

const ehPorte = (p: unknown): p is PortePacote => PORTES_DO_PACOTE.includes(p as PortePacote);

/** Os preços por porte como vieram do banco (número de verdade, só os portes que existem). Vazio: null. */
export function lerPrecosPorte(x: unknown): PrecosPorte | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const out: PrecosPorte = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) {
    const n = Number(v);
    if (ehPorte(k) && v != null && Number.isFinite(n) && n >= 0) out[k] = centavos(n);
  }
  return Object.keys(out).length ? out : null;
}

/** O preço do pacote para o porte do pet: o do porte, se o modelo tiver; senão o preço único. */
export function precoDoPacote(m: { preco: number | string; precos_porte?: PrecosPorte | null }, porte: string | null | undefined) {
  const doPorte = ehPorte(porte) ? m.precos_porte?.[porte] : undefined;
  return doPorte != null ? doPorte : Number(m.preco);
}

/** "P R$ 160 · M R$ 180 · G R$ 200": o resumo dos preços por porte, na ordem. */
export function resumoPorPorte(precos: PrecosPorte | null | undefined, brl: (n: number) => string) {
  if (!precos) return "";
  return PORTES_DO_PACOTE.filter((p) => precos[p] != null).map((p) => `${p} ${brl(precos[p]!)}`).join(" · ");
}

/**
 * Sugestão a partir da tabela de preços: quantidade × o preço do serviço para cada porte (sem desconto; o dono ajusta).
 * Só os portes que o serviço tem preço.
 */
export function sugestaoPorPorte(servico: { preco_p?: number | null; preco_m?: number | null; preco_g?: number | null; preco_gg?: number | null } | null | undefined, quantidade: number): PrecosPorte {
  if (!servico || !(quantidade > 0)) return {};
  const de: Record<PortePacote, number | null | undefined> = { P: servico.preco_p, M: servico.preco_m, G: servico.preco_g, GG: servico.preco_gg };
  const out: PrecosPorte = {};
  for (const p of PORTES_DO_PACOTE) {
    const v = de[p];
    if (v != null && Number(v) > 0) out[p] = centavos(Number(v) * quantidade);
  }
  return out;
}

/** Junta os preços por porte aos modelos (quem não tem Pacotes, Financeiro ou Relatórios recebe nada). */
export async function comPrecosPorte<P extends { id: string }>(sb: Banco, petshopId: string, modelos: P[]): Promise<(P & { precos_porte: PrecosPorte | null })[]> {
  if (!modelos.length) return [];
  const r = await (sb as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> })
    .rpc("precos_porte_dos_pacotes", { p: petshopId });
  const mapa = new Map<string, PrecosPorte | null>();
  if (!r.error && Array.isArray(r.data)) for (const x of r.data as { id: string; precos_porte: unknown }[]) mapa.set(x.id, lerPrecosPorte(x.precos_porte));
  return modelos.map((m) => ({ ...m, precos_porte: mapa.get(m.id) ?? null }));
}
