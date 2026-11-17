import { cache } from "react";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./banco";
import { SUPABASE_CHAVE, SUPABASE_URL } from "./supabase";
import type { StatusOrcamento } from "./orcamento";

/**
 * O lado do servidor da página pública do orçamento (/gestao/orcamento/<código>), só com a chave pública. O banco devolve só
 * o que a página mostra (`orcamento_publico`: loja, itens, total, validade, status e o primeiro nome do cliente), com o código
 * certo e a conta liberada, no máximo 60 aberturas por minuto. Só importar em código de servidor.
 */
export const codigoDoOrcamentoValido = (t: string) => /^[0-9a-f]{48}$/.test(t);

const banco = () => createClient<Database>(SUPABASE_URL, SUPABASE_CHAVE, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: (u, i) => fetch(u, { ...i, cache: "no-store" }) },
});

export type OrcamentoPublico = {
  petshop: { nome: string; logo: string | null; tema: string | null; telefone: string | null; cidade: string | null; uf: string | null; fuso: string };
  numero: number; para: string | null;
  itens: { tipo: "produto" | "servico"; nome: string; qtd: number; valor: number }[];
  subtotal: number; desconto: number; total: number; validade: string; obs: string | null;
  status: StatusOrcamento; criado_em: string;
};

/** O orçamento pelo código (uma leitura por pedido: o título e a página usam a mesma). */
export const lerOrcamento = cache(async (token: string): Promise<OrcamentoPublico | "devagar" | null> => {
  if (!codigoDoOrcamentoValido(token)) return null;
  const r = await banco().rpc("orcamento_publico", { p_token: token });
  if (r.error?.code === "PT429") return "devagar";
  if (r.error || !r.data) return null;
  return r.data as unknown as OrcamentoPublico;
});
