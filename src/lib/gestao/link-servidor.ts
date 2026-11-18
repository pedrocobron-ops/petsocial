import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./banco";
import { SUPABASE_CHAVE, SUPABASE_URL, configurado } from "./supabase";
import { TEMAS, corPropria } from "./identidade";
import { lerLinkJunto, type LeitorDoLink, type LinkInicial } from "./link-inicial";
export type { LinkInicial };

/**
 * O lado do servidor do link do cliente e da página do pedido: o servidor lê pelas mesmas funções públicas que o navegador
 * já usava (só a chave pública; nenhum dado a mais) e a página chega pronta, com o nome do pet shop,
 * os serviços e a situação do pedido no próprio HTML. No celular com internet fraca, o tutor lê a página sem esperar o
 * JavaScript baixar. Se o servidor não conseguir ler (banco fora, demora), devolve undefined e a página lê pelo navegador,
 * como antes. Só importar em código de servidor.
 */
const banco = () => createClient<Database>(SUPABASE_URL, SUPABASE_CHAVE, {
  auth: { persistSession: false, autoRefreshToken: false },
  // a página não pode ficar presa esperando o banco: depois de 6 s, o navegador lê sozinho
  global: { fetch: (u, i) => fetch(u, { ...i, cache: "no-store", signal: AbortSignal.timeout(6000) }) },
});
type Rpc = { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
const ler = (f: string, a: Record<string, unknown>) =>
  Promise.resolve((banco() as unknown as Rpc).rpc(f, a)).catch((e: unknown) => ({ data: null, error: e ?? "falhou" }));

// O que a página lê ao abrir e como as partes viram uma resposta só: `link-inicial.ts` (o navegador usa o mesmo, quando
// o servidor não conseguiu ler).
type Leitor = LeitorDoLink;

/**
 * Por quantos segundos o servidor reaproveita a abertura de um link (o mesmo link aberto por vários tutores em seguida não
 * vai ao banco de novo). Na Vercel, 30 s; fora dela (computador de quem programa, testes), desligado, para a mudança feita
 * no pet shop aparecer na hora. GESTAO_LINK_CACHE_S troca o tempo (0 desliga; no máximo 300).
 */
export function segundosDoLinkGuardado(): number {
  const v = (process.env.GESTAO_LINK_CACHE_S ?? "").trim();
  if (v) { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.min(n, 300) : 0; }
  return process.env.VERCEL ? 30 : 0;
}
const MAX_GUARDADOS = 300;
const guardados = new Map<string, { ate: number; valor: LinkInicial }>();
/** Só para os testes: esquece o que está guardado. */
export const esquecerLinksGuardados = () => guardados.clear();


/**
 * A abertura do link: uma ida só ao banco (`link_inicial`, migração 20261229, que junta as oito funções públicas de sempre),
 * guardada por alguns segundos quando o link existe e está ligado. Em banco de antes da migração, as oito leituras ao mesmo
 * tempo, como antes. Se o banco demorou ou falhou, devolve undefined (a página lê pelo navegador), sem repetir em oito.
 */
export async function lerLinkCom(ler: Leitor, codigo: string, agora: number = Date.now()): Promise<LinkInicial | undefined> {
  const segundos = segundosDoLinkGuardado();
  const g = segundos > 0 ? guardados.get(codigo) : undefined;
  if (g && g.ate > agora) return g.valor;
  const valor = await lerLinkJunto(ler, codigo);
  if (!valor) return undefined;
  // só guarda link que existe e está ligado (código inventado não enche a memória; link desligado volta a valer na hora)
  if (segundos > 0 && (valor.info as { nome?: unknown } | null)?.nome) {
    if (guardados.size >= MAX_GUARDADOS) { const primeiro = guardados.keys().next().value; if (primeiro !== undefined) guardados.delete(primeiro); }
    guardados.set(codigo, { ate: agora + segundos * 1000, valor });
  }
  return valor;
}

export const lerLinkInicial = cache(async (codigo: string): Promise<LinkInicial | undefined> => {
  if (!configurado || !codigo) return undefined;
  return lerLinkCom(ler, codigo);
});

/** O que a página do pedido lê ao abrir (link_pedido, link_pedido_cliente e, com vaga aceita, link_pedido_sinal). */
export type PedidoInicial = { pedido: unknown; acoes: unknown; sinal: unknown };

export const lerPedidoInicial = cache(async (id: string): Promise<PedidoInicial | undefined> => {
  if (!configurado) return undefined;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { pedido: null, acoes: null, sinal: null };
  const [pedido, acoes, sinal] = await Promise.all([ler("link_pedido", { p_id: id }), ler("link_pedido_cliente", { p_id: id }), ler("link_pedido_sinal", { p_id: id })]);
  if (pedido.error) return undefined;
  return { pedido: pedido.data ?? null, acoes: acoes.error ? null : (acoes.data ?? null), sinal: sinal.error ? null : (sinal.data ?? null) };
});

/**
 * As cores do pet shop já no HTML (o navegador pinta depois, com `aplicarTema`, do mesmo jeito): sem isto, a página
 * apareceria primeiro nas cores da Maestro Pet. Só cores conferidas (hex ou uma das combinações prontas) entram no CSS.
 */
export function cssDoTema(tema: unknown): string | null {
  const t = typeof tema === "string" ? tema : null;
  const propria = corPropria(t);
  const pronta = !propria && t && t !== "floresta" ? TEMAS.find((x) => x.id === t) : undefined;
  const cores = propria ?? (pronta ? { tema: pronta.tema, destaque: pronta.destaque } : null);
  return cores ? `.g-raiz{--tema:${cores.tema};--destaque:${cores.destaque}}` : null;
}
