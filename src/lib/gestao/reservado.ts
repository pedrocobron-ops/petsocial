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
export type PetshopLinha = T["petshops"]["Row"];

export const COLS_PRODUTO = "id, petshop_id, nome, categoria, unidade, preco_venda, estoque, estoque_minimo, ativo, criado_em";
export const COLS_MOVIMENTO = "id, petshop_id, produto_id, tipo, quantidade, motivo, origem, criado_por, criado_em";
export const COLS_PACOTE = "id, petshop_id, nome, servico_id, quantidade, validade_dias, ativo, criado_em";
export const COLS_PACOTE_CLIENTE = "id, petshop_id, pet_id, pacote_id, nome, servico_id, total, usados, comprado_em, vence_em, ativo, criado_em";
export const COLS_PROFISSIONAL = "id, petshop_id, user_id, nome, papel, ve_financeiro, cor, escala, atende, ativo, criado_em, funcao, acessos";

/** Tudo do pet shop menos a meta do mês e os dados da assinatura na Cakto. */
export const COLS_PETSHOP = "id, nome, telefone, cidade, uf, fuso, horario, status, plano, teste_ate, assinatura_desde, criado_por, criado_em, whatsapp, link_codigo, link_ativo, link_aviso, vagas, guia_feito_em, logo, tema, pago_ate, periodo_meses, diaria_creche, diaria_hotel, vagas_creche, vagas_hotel, link_creche, link_hotel";

type Linhas = Record<string, unknown>[];
/**
 * Chama a função do banco; se ela ainda não existe (banco antes da atualização), lê as colunas direto da tabela.
 * Qualquer outro erro vira lista vazia: o valor reservado fica em branco, sem derrubar a tela.
 */
async function reservado(sb: Banco, funcao: string, args: Record<string, unknown>, direto: () => PromiseLike<{ data: unknown; error: unknown }>): Promise<Linhas> {
  type Pagina = PromiseLike<{ data: unknown; error: { code?: string } | null }>;
  const banco = sb as unknown as { rpc: (f: string, a: Record<string, unknown>) => { order: (coluna: string) => { range: (de: number, ate: number) => Pagina } } };
  // o banco entrega no máximo 1000 linhas por vez, também nas funções: busca de mil em mil, sempre na mesma ordem
  const tudo: Linhas = [];
  for (let de = 0; de < 200000; de += 1000) {
    const r = await banco.rpc(funcao, args).order("id").range(de, de + 999);
    if (r.error) {
      if (de > 0) return tudo;
      if (r.error.code !== "PGRST202" && r.error.code !== "42883") return [];
      const d = await direto();
      return d.error ? [] : ((d.data as Linhas | null) ?? []);
    }
    const linhas = (r.data as Linhas | null) ?? [];
    tudo.push(...linhas);
    if (linhas.length < 1000) break;
  }
  return tudo;
}
const porId = (linhas: Linhas) => new Map(linhas.map((l) => [String(l.id), l]));
const num = (v: unknown) => (v == null ? null : Number(v));

/**
 * O pet shop. A meta do mês só vem para quem vê o financeiro; os dados da assinatura na Cakto não vêm para ninguém
 * (o painel do administrador lê por outra função).
 */
export async function lerPetshop(sb: Banco, petshopId: string): Promise<{ data: PetshopLinha | null; error: { message: string } | null }> {
  const base = await sb.from("petshops").select(COLS_PETSHOP).eq("id", petshopId).maybeSingle();
  if (base.error || !base.data) return { data: null, error: base.error };
  const extra = await reservado(sb, "petshop_reservado", { p: petshopId }, () => sb.from("petshops").select("id, meta_mes").eq("id", petshopId));
  return { data: { ...(base.data as unknown as PetshopLinha), meta_mes: num(extra[0]?.meta_mes), cakto_email: null, cakto_assinatura: null }, error: null };
}

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
