import type { Banco } from "./supabase";

/**
 * Opções do negócio: o dono liga só o que usa (código de barras, fornecedores, margem, sinal na reserva, taxas…).
 * Ficam em `petshops.opcoes`, um objeto por chave. Use chaves com o assunto na frente: "loja.codigo_barras", "hotel.sinal".
 * Chave ausente vale o padrão passado em `opcao()`: negócio que nunca mexeu continua como sempre foi.
 * Cada assunto declara as próprias chaves e padrões no arquivo dele (não aqui).
 *
 * As opções chegam pela função `petshop_opcoes` (veja `lerOpcoes`, em reservado.ts), nunca por `select("opcoes")`.
 * Quem não recebe (sem Caixa, Financeiro nem Relatórios) recebe as listas de preço em branco. OPÇÃO NOVA COM PREÇO DENTRO:
 * acrescente a chave na função `opcoes_sem_valores` do banco, senão a equipe toda lê o preço pela API.
 */
type ComOpcoes = { opcoes?: unknown };

/** Lê uma opção do pet shop; devolve `padrao` quando ela nunca foi gravada ou veio com tipo diferente do padrão. */
export function opcao<T>(petshop: ComOpcoes, chave: string, padrao: T): T {
  const todas = petshop.opcoes;
  if (!todas || typeof todas !== "object" || Array.isArray(todas)) return padrao;
  const v = (todas as Record<string, unknown>)[chave];
  if (v === undefined || v === null) return padrao;
  if (padrao !== null && padrao !== undefined && typeof v !== typeof padrao) return padrao;
  return v as T;
}

/**
 * Grava uma ou mais opções sem apagar as outras (só o dono consegue: o banco confere).
 * Depois de gravar, chame `recarregarBase()` do contexto para as telas enxergarem o valor novo.
 */
export async function salvarOpcoes(sb: Banco, petshopId: string, mudancas: Record<string, unknown>): Promise<void> {
  // o banco junta as mudanças ao que está guardado, de uma vez (não desfaz o que outra tela acabou de salvar)
  const r = await sb.rpc("petshop_salvar_opcoes", { p: petshopId, p_mudancas: mudancas as never });
  if (!r.error) return;
  if (r.error.code !== "PGRST202" && r.error.code !== "42883") throw new Error(r.error.message);
  // banco antes da atualização: lê, junta e grava
  const atual = await sb.from("petshops").select("opcoes").eq("id", petshopId).single();
  if (atual.error) throw new Error(atual.error.message);
  const base = atual.data.opcoes && typeof atual.data.opcoes === "object" && !Array.isArray(atual.data.opcoes) ? (atual.data.opcoes as Record<string, unknown>) : {};
  const g = await sb.from("petshops").update({ opcoes: { ...base, ...mudancas } as never }).eq("id", petshopId).select("id");
  if (g.error) throw new Error(g.error.message);
  if (!g.data?.length) throw new Error("Só o dono muda as opções do negócio.");
}
