import type { Banco } from "./supabase";
import type { Database } from "./banco";

/**
 * Colunas reservadas: custo de produto, preço de pacote, comissão e e-mail de convite.
 * O banco não entrega essas colunas direto da tabela; elas saem por funções que conferem a área de quem pede
 * (estoque, pacotes, relatórios, dono). Aqui ficam as listas de colunas livres e a junção com as reservadas.
 * Quem não tem a área recebe a linha com o valor reservado vazio (null), e as telas seguem funcionando.
 */
type T = Database["public"]["Tables"];
export type ProdutoLinha = T["produtos"]["Row"];
export type MovimentoLinha = T["movimentos_estoque"]["Row"];
export type PacoteLinha = T["pacotes"]["Row"];
export type PacoteClienteLinha = T["pacotes_clientes"]["Row"];
export type ProfissionalLinha = T["profissionais"]["Row"];

export const COLS_PRODUTO = "id, petshop_id, nome, categoria, unidade, preco_venda, estoque, estoque_minimo, ativo, criado_em";
export const COLS_MOVIMENTO = "id, petshop_id, produto_id, tipo, quantidade, motivo, origem, criado_por, criado_em";
export const COLS_PACOTE = "id, petshop_id, nome, servico_id, quantidade, validade_dias, ativo, criado_em";
export const COLS_PACOTE_CLIENTE = "id, petshop_id, pet_id, pacote_id, nome, servico_id, total, usados, comprado_em, vence_em, ativo, criado_em";
export const COLS_PROFISSIONAL = "id, petshop_id, user_id, nome, papel, ve_financeiro, cor, escala, atende, ativo, criado_em, funcao, acessos";

type Linhas = Record<string, unknown>[];
/**
 * Chama a função do banco; se ela ainda não existe (banco antes da atualização), lê as colunas direto da tabela.
 * Qualquer outro erro vira lista vazia: o valor reservado fica em branco, sem derrubar a tela.
 */
async function reservado(sb: Banco, funcao: string, args: Record<string, unknown>, direto: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<Linhas> {
  const r = await (sb as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string } | null }> }).rpc(funcao, args);
  if (!r.error) return (r.data as Linhas | null) ?? [];
  if (r.error.code !== "PGRST202" && r.error.code !== "42883") return [];
  const d = await direto();
  return d.error ? [] : ((d.data as Linhas | null) ?? []);
}
const porId = (linhas: Linhas) => new Map(linhas.map((l) => [String(l.id), l]));
const num = (v: unknown) => (v == null ? null : Number(v));

/** A equipe do pet shop, com comissão e e-mail de convite para quem pode ver (dono, relatórios, a própria pessoa). */
export async function lerEquipe(sb: Banco, petshopId: string): Promise<{ data: ProfissionalLinha[] | null; error: { message: string } | null }> {
  const base = await sb.from("profissionais").select(COLS_PROFISSIONAL).eq("petshop_id", petshopId).order("criado_em");
  if (base.error) return { data: null, error: base.error };
  const extra = porId(await reservado(sb, "equipe_reservado", { p: petshopId },
    () => sb.from("profissionais").select("id, comissao_pct, email_convite").eq("petshop_id", petshopId)));
  return {
    data: (base.data as unknown as ProfissionalLinha[]).map((p) => {
      const x = extra.get(p.id);
      return { ...p, comissao_pct: num(x?.comissao_pct) ?? 0, email_convite: (x?.email_convite as string | null | undefined) ?? null };
    }),
    error: null,
  };
}

/** Junta o custo aos produtos (null para quem não cuida do estoque nem vê o financeiro). */
export async function comCustos<P extends { id: string }>(sb: Banco, petshopId: string, produtos: P[]): Promise<(P & { custo: number | null })[]> {
  const extra = produtos.length ? porId(await reservado(sb, "custos_dos_produtos", { p: petshopId },
    () => sb.from("produtos").select("id, custo").eq("petshop_id", petshopId))) : new Map<string, Record<string, unknown>>();
  return produtos.map((p) => ({ ...p, custo: num(extra.get(p.id)?.custo) }));
}

/** Junta o custo unitário aos movimentos de um produto. */
export async function comCustosDeMovimento<M extends { id: string }>(sb: Banco, produtoId: string, movimentos: M[]): Promise<(M & { custo_unitario: number | null })[]> {
  const extra = movimentos.length ? porId(await reservado(sb, "custos_dos_movimentos", { p_produto: produtoId },
    () => sb.from("movimentos_estoque").select("id, custo_unitario").eq("produto_id", produtoId))) : new Map<string, Record<string, unknown>>();
  return movimentos.map((m) => ({ ...m, custo_unitario: num(extra.get(m.id)?.custo_unitario) }));
}

/** Junta o preço aos pacotes (modelos e vendidos). Sem a área de pacotes, o preço vem 0. */
export async function comPrecosDePacote<P extends { id: string }>(sb: Banco, petshopId: string, pacotes: P[]): Promise<(P & { preco: number })[]> {
  const extra = pacotes.length ? porId(await reservado(sb, "precos_dos_pacotes", { p: petshopId }, async () => {
    const [a, b] = await Promise.all([
      sb.from("pacotes").select("id, preco").eq("petshop_id", petshopId),
      sb.from("pacotes_clientes").select("id, preco").eq("petshop_id", petshopId),
    ]);
    return { data: [...(a.data ?? []), ...(b.data ?? [])], error: a.error ?? b.error };
  })) : new Map<string, Record<string, unknown>>();
  return pacotes.map((p) => ({ ...p, preco: num(extra.get(p.id)?.preco) ?? 0 }));
}
