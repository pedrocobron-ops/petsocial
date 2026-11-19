import type { Banco } from "./supabase";

/**
 * "Mudou alguma coisa na agenda deste período?" (função `gestao_sinal`, migração 20261233): uma resposta de 32 letras que
 * muda quando alguém marca, remarca, conclui, bloqueia, faz check-in ou recebe. As telas Hoje, Agenda e Quadro perguntam a
 * cada minuto (`useDados` com `aCada` e `sinal`) e só baixam os dados de novo quando a resposta muda.
 * `null`: o banco ainda não tem a função, ou a pergunta falhou (a tela relê de tempos em tempos, sem a pergunta).
 */
export async function lerSinal(sb: Banco, petshopId: string, de: Date, ate: Date): Promise<string | null> {
  try {
    const r = await (sb as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }> })
      .rpc("gestao_sinal", { p: petshopId, p_de: de.toISOString(), p_ate: ate.toISOString() });
    return !r.error && typeof r.data === "string" && r.data ? r.data : null;
  } catch { return null; }
}
