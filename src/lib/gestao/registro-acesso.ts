import type { Banco } from "./supabase";

/**
 * Registro de acesso (Marco Civil da Internet, art. 15; migração 20261210): quem entrou, quando, de qual IP e navegador.
 * O banco lê o IP e o navegador do próprio pedido (registrar_acesso) e guarda por 6 meses; ninguém do pet shop lê.
 * Nunca segura a tela: a chamada sai sem esperar resposta e qualquer falha é ignorada.
 *   - "login": logo depois de entrar com e-mail e senha;
 *   - "abertura": ao abrir o aplicativo, no máximo uma vez por dia por pessoa neste aparelho (o banco também confere o dia).
 */
export type OrigemDoAcesso = "login" | "abertura";

const CHAVE = "maestro-gestao-acesso";

function hojeAqui() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/** A abertura de hoje já foi anotada para esta pessoa neste aparelho? */
function jaAnotada(userId: string): boolean {
  try { return localStorage.getItem(CHAVE) === `${userId}:${hojeAqui()}`; } catch { return false; }
}
function anotar(userId: string) {
  try { localStorage.setItem(CHAVE, `${userId}:${hojeAqui()}`); } catch { /* sem armazenamento: o banco confere o dia */ }
}

/** Manda o registro sem esperar. `userId`: para a conta de "uma vez por dia" neste aparelho. */
export function registrarAcesso(sb: Banco, origem: OrigemDoAcesso, userId?: string | null): void {
  if (origem === "abertura" && userId && jaAnotada(userId)) return;
  if (userId) anotar(userId);
  try {
    void Promise.resolve(sb.rpc("registrar_acesso", { p_origem: origem })).catch(() => undefined);
  } catch { /* nunca atrapalha a entrada */ }
}
