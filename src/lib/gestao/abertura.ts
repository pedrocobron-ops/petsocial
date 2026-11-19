import { ehDemora, ehDeRede } from "./erros";

/**
 * Abertura do aplicativo (conta e pet shop). Quando o banco demora (consulta cortada em 8 s, gateway, pedido preso) ou a
 * internet pisca, a primeira leitura falha mas a segunda quase sempre passa. Então a abertura tenta mais uma vez, quieta,
 * antes de mostrar qualquer aviso. Erro que não é de demora nem de rede (sem permissão, conta sem pet shop) não se repete.
 */

type ErroLike = { code?: string | null; message?: string | null; name?: string | null } | null | undefined;

/** Pausa antes da tentativa quieta: o banco respira um pouco (e uma rede que piscou volta). */
export const ESPERA_ANTES_DE_TENTAR_DE_NOVO_MS = 1200;

/** O erro é passageiro (demora do banco ou do servidor, falta de conexão)? Só esses valem uma tentativa a mais. */
export function erroPassageiro(e: ErroLike | unknown): boolean {
  if (!e) return false;
  const x = e as { code?: unknown; message?: unknown; name?: unknown };
  const codigo = String(x.code ?? ""), m = String(x.message ?? (typeof e === "string" ? e : "")), nome = String(x.name ?? "");
  if (/^(57014|57P0[1-3]|55P03|PGRST00[0-3])$/.test(codigo) || /^(53|08)/.test(codigo)) return true;
  if (nome === "TempoEsgotado" || nome === "AbortError") return true;
  if (ehDemora(m) || ehDeRede(m)) return true;
  return /too many connections|remaining connection slots|Service Unavailable|Bad Gateway|upstream|\b50[234]\b/i.test(m);
}

const dormir = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/**
 * Roda `f`; se falhar com erro passageiro (lançado, ou devolvido em `{ error }`), espera um pouco e tenta mais uma vez.
 * O resultado da segunda vez é o que vale (inclusive o erro). `seguir()` falso (a tela saiu) cancela a segunda tentativa.
 */
export async function comUmaTentativaAMais<R>(
  f: () => PromiseLike<R>,
  opc: { espera?: number; esperar?: (ms: number) => Promise<void>; seguir?: () => boolean; aoRepetir?: (erro: unknown) => void } = {},
): Promise<R> {
  const erroDe = (r: R): unknown => (r && typeof r === "object" && "error" in (r as object) ? (r as unknown as { error: unknown }).error : null);
  let primeiro: { ok: true; r: R } | { ok: false; e: unknown };
  try { primeiro = { ok: true, r: await f() }; } catch (e) { primeiro = { ok: false, e }; }
  const erro = primeiro.ok ? erroDe(primeiro.r) : primeiro.e;
  if (!erro || !erroPassageiro(erro) || (opc.seguir && !opc.seguir())) {
    if (primeiro.ok) return primeiro.r;
    throw primeiro.e;
  }
  opc.aoRepetir?.(erro);
  await (opc.esperar ?? dormir)(opc.espera ?? ESPERA_ANTES_DE_TENTAR_DE_NOVO_MS);
  if (opc.seguir && !opc.seguir()) {
    if (primeiro.ok) return primeiro.r;
    throw primeiro.e;
  }
  return await f();
}
