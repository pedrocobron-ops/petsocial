/**
 * De onde veio o pet shop: o código do vendedor (`?v=ana`) e os `utm_*` do link que a pessoa abriu.
 * A página de venda e o cadastro leem do endereço e guardam no aparelho por 30 dias; ao criar o pet shop, o começo guiado
 * manda para o banco (função `origem_registrar`, uma vez só). Só o administrador lê (painel, aba Vendas).
 * Não leva dado de pessoa nenhuma: é o código que o vendedor pôs no próprio link.
 */
export type Origem = { vendedor: string; utm: Record<string, string> };

const CHAVE = "maestro-gestao-origem";
const VALE_DIAS = 30;
const UTMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

/** Código do vendedor como o banco aceita: minúsculas, números, traço e sublinhado, até 40. Fora disso, vazio. */
export function limparVendedor(texto: string | null | undefined) {
  const v = (texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(v) ? v : "";
}

/** Lê `v` (ou `vendedor`) e os `utm_*` de uma busca de endereço ("?v=ana&utm_source=instagram"). `null` se não há nada. */
export function origemDaBusca(busca: string | URLSearchParams | null | undefined): Origem | null {
  const q = typeof busca === "string" ? new URLSearchParams(busca) : busca;
  if (!q) return null;
  const vendedor = limparVendedor(q.get("v") ?? q.get("vendedor"));
  const utm: Record<string, string> = {};
  for (const k of UTMS) {
    const valor = (q.get(k) ?? "").trim().slice(0, 80);
    if (valor) utm[k] = valor;
  }
  return vendedor || Object.keys(utm).length ? { vendedor, utm } : null;
}

/**
 * Junta o que já estava guardado com o que veio agora. O primeiro vendedor fica (quem trouxe a pessoa primeiro leva o
 * crédito); os utm novos só entram se ainda não havia nenhum.
 */
export function juntarOrigem(antes: Origem | null, agora: Origem | null): Origem | null {
  if (!antes) return agora;
  if (!agora) return antes;
  return { vendedor: antes.vendedor || agora.vendedor, utm: Object.keys(antes.utm).length ? antes.utm : agora.utm };
}

/** A origem guardada neste aparelho (ou `null`: nunca veio por link marcado, venceu ou o navegador não guarda). */
export function origemGuardada(agora = Date.now()): Origem | null {
  try {
    const b = JSON.parse(localStorage.getItem(CHAVE) ?? "null") as { em?: number; vendedor?: string; utm?: Record<string, string> } | null;
    if (!b || typeof b.em !== "number" || agora - b.em > VALE_DIAS * 864e5) return null;
    const utm: Record<string, string> = {};
    for (const k of UTMS) if (typeof b.utm?.[k] === "string" && b.utm[k]) utm[k] = b.utm[k].slice(0, 80);
    const vendedor = limparVendedor(b.vendedor);
    return vendedor || Object.keys(utm).length ? { vendedor, utm } : null;
  } catch {
    return null;
  }
}

/** Ao abrir a página de venda ou o cadastro: guarda o que veio no endereço. Devolve a origem que ficou valendo. */
export function guardarOrigemDoEndereco(busca: string): Origem | null {
  const junta = juntarOrigem(origemGuardada(), origemDaBusca(busca));
  if (!junta) return null;
  try {
    const antes = JSON.parse(localStorage.getItem(CHAVE) ?? "null") as { em?: number } | null;
    localStorage.setItem(CHAVE, JSON.stringify({ em: origemGuardada() && typeof antes?.em === "number" ? antes.em : Date.now(), ...junta }));
  } catch { /* navegador sem armazenamento: a origem vale só nesta página */ }
  return junta;
}

export function esquecerOrigem() {
  try { localStorage.removeItem(CHAVE); } catch { /* tudo bem */ }
}

/* ---------- painel do administrador ---------- */

export type LojaVenda = {
  id: string; nome: string; criado_em: string; status: string; plano: string; meses: number; teste_ate: string;
  vendedor: string | null; utm: Record<string, string> | null; quer_ajuda: boolean; telefone: string | null; cupom: string | null;
};
export type PagamentoVenda = {
  id: number; recebido_em: string; evento: string; petshop_id: string | null; nome: string | null; vendedor: string | null;
  cupom: string | null; valor: number | null; desconto: number | string | null; plano: string | null;
};
export type ResumoDoVendedor = { vendedor: string; cadastros: number; testando: number; pagantes: number; pagamentos: number; valor: number; cupons: string[] };

/** Uma linha por vendedor: cadastros que vieram pelo link dele, quantos testam, quantos pagam, e o que entrou. */
export function resumoPorVendedor(lojas: LojaVenda[], pagamentos: PagamentoVenda[]): ResumoDoVendedor[] {
  const por = new Map<string, ResumoDoVendedor>();
  const de = (v: string) => {
    let r = por.get(v);
    if (!r) { r = { vendedor: v, cadastros: 0, testando: 0, pagantes: 0, pagamentos: 0, valor: 0, cupons: [] }; por.set(v, r); }
    return r;
  };
  for (const l of lojas) {
    if (!l.vendedor) continue;
    const r = de(l.vendedor);
    r.cadastros++;
    if (l.status === "teste") r.testando++;
    if (l.status === "ativa" || l.status === "atrasada") r.pagantes++;
  }
  for (const p of pagamentos) {
    if (!p.vendedor) continue;
    const r = de(p.vendedor);
    r.pagamentos++;
    r.valor = Math.round((r.valor + (typeof p.valor === "number" ? p.valor : 0)) * 100) / 100;
    if (p.cupom && !r.cupons.includes(p.cupom)) r.cupons.push(p.cupom);
  }
  return [...por.values()].sort((a, b) => b.pagantes - a.pagantes || b.cadastros - a.cadastros || a.vendedor.localeCompare(b.vendedor));
}
