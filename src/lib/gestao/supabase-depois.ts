import type { Banco } from "./supabase";

/**
 * O cliente do Supabase para as páginas públicas (link do cliente, pedido do tutor) e o registro de erros: a biblioteca
 * (uns 65 KB) baixa à parte, no primeiro uso ou quando a página fica parada (`adiantarBanco`), e não segura a página. No celular
 * com internet fraca, o tutor já toca nos serviços enquanto ela chega. É o mesmo cliente de `banco()` (a mesma sessão).
 * Só `rpc`: as páginas públicas leem e pedem só por funções do banco.
 */
const carregar = () => import("./supabase");

type SoRpc = Pick<Banco, "rpc">;
// os argumentos passam soltos (sem `Parameters<Banco["rpc"]>`): com tantas funções no banco, o TypeScript não consegue resolver
// esse tipo; quem chama continua com os tipos de `Banco["rpc"]`
type RpcSolto = (...args: unknown[]) => unknown;
const rpc = ((...args: unknown[]) => carregar().then((m) => (m.banco() as unknown as { rpc: RpcSolto }).rpc(...args))) as unknown as Banco["rpc"];
const cliente: SoRpc = { rpc };

export function bancoDepois(): SoRpc {
  return cliente;
}

/** Baixa a biblioteca em segundo plano (depois que a página abriu), para o primeiro toque não esperar por ela. */
export function adiantarBanco() {
  void carregar().catch(() => undefined);
}
