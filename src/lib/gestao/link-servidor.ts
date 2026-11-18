import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./banco";
import { SUPABASE_CHAVE, SUPABASE_URL, configurado } from "./supabase";
import { TEMAS, corPropria } from "./identidade";

/**
 * O lado do servidor do link do cliente e da página do pedido: o servidor lê pelas mesmas funções públicas que o navegador
 * já usava (só a chave pública; nenhuma função nova, nenhum dado a mais) e a página chega pronta, com o nome do pet shop,
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

/** O que a página do link lê ao abrir, cru como o banco devolve (a página faz as mesmas contas de antes). */
export type LinkInicial = {
  /** resposta de link_info (null = link desligado ou inexistente) */
  info: unknown;
  /** link_nome, para a página do link desligado dizer com quem falar */
  nome: string | null;
  google: string | null;
  promocoes: unknown[];
  fechados: string[];
  ia: boolean;
  /** link_hotel_opcoes.preco: undefined quando o link não oferece hotel */
  precoHotel?: unknown;
  /** link_opcoes.termos (regras que o tutor aceita) */
  termos: unknown;
};

/** Tudo de uma vez (as leituras não dependem uma da outra): uma ida e volta ao banco, não seis. */
export const lerLinkInicial = cache(async (codigo: string): Promise<LinkInicial | undefined> => {
  if (!configurado || !codigo) return undefined;
  const p = { p_codigo: codigo };
  const [info, nome, google, promocoes, fechados, ia, hotel, opcoes] = await Promise.all([
    ler("link_info", p), ler("link_nome", p), ler("link_google", p), ler("link_promocoes", p),
    ler("link_fechados", p), ler("link_ia_ligada", p), ler("link_hotel_opcoes", p), ler("link_opcoes", p),
  ]);
  if (info.error) return undefined;
  const lido = info.data as { nome?: unknown; hotel?: unknown } | null;
  const valido = !!lido && typeof lido === "object" && !!lido.nome;
  const preco = (hotel.data as { preco?: unknown } | null)?.preco;
  const termos = opcoes.error ? undefined : ((opcoes.data as { termos?: unknown } | null)?.termos ?? null);
  return {
    info: info.data ?? null,
    nome: typeof nome.data === "string" && nome.data.trim() ? nome.data.trim() : null,
    google: typeof google.data === "string" ? google.data : null,
    promocoes: Array.isArray(promocoes.data) ? promocoes.data : [],
    fechados: Array.isArray(fechados.data) ? (fechados.data as string[]) : [],
    ia: valido && ia.data === true,
    ...(valido && lido.hotel ? { precoHotel: preco && typeof preco === "object" ? preco : null } : {}),
    termos,
  };
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
