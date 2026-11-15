import type { Banco } from "./supabase";
import { parteDaChave, type ItemLancamento, type PartePagamento } from "./dinheiro";

/**
 * Operação de dinheiro com mais de uma gravação (check-out, sinal, "Fechar a conta", baixa com crédito): a tela monta a lista
 * de passos e manda tudo numa chamada só. O banco grava tudo na mesma transação (migração 20261178): se uma parte falha, nada
 * fica gravado. Com a chave da operação (`useOperacao`), a nova tentativa devolve o que a primeira fez, sem repetir.
 *
 * Os passos rodam com o login de quem chamou: valem as mesmas regras de sempre (quem lança em outro dia, travas de preço,
 * crédito, estoque). Um lançamento pode ter `nome`; os passos seguintes usam o id dele com `ref("nome")`.
 *
 * Na folha: `catch` sempre devolve `false` (a mesma chave vale para a nova tentativa).
 */
export const ref = (nome: string) => `$ref:${nome}`;

/** Um lançamento (pago ou a receber), como fica em `lancamentos`. O caixa aberto o banco põe (só quando a data é hoje). */
export type LinhaDoPasso = {
  tipo: "entrada" | "saida"; valor: number; forma: string | null; categoria: string; descricao?: string | null; data?: string | null;
  vencimento?: string | null; pago: boolean; agendamento_id?: string | null; cliente_id?: string | null; origem?: "tela" | "assistente" | "sistema";
  itens?: ItemLancamento[] | null; pagamentos?: PartePagamento[] | null; credito_usado?: number | null;
};

export type Passo =
  | { t: "sem_recebimento"; agendamento: string }
  | { t: "servicos"; agendamento: string; servicos: { servico_id: string; preco: number | null }[] }
  | { t: "pacote"; id: string; n: number }
  | { t: "agendamento"; id: string; status?: string; pacote_cliente_id?: string | null; sem_cobranca?: boolean }
  | { t: "lancamento"; nome?: string; chave?: string | null; linha: LinhaDoPasso }
  | { t: "receber"; conta: string; valor: number; forma: string; pagamentos?: PartePagamento[] | null; data?: string | null; novo_vencimento?: string | null;
      multa?: number | null; multa_forma?: string | null; multa_pagamentos?: PartePagamento[] | null; chave?: string | null; esperado?: number }
  | { t: "receber_credito"; conta: string; valor: number; chave?: string | null }
  | { t: "credito"; cliente: string; valor: number; estadia?: string | null; motivo?: string | null; chave?: string | null }
  | { t: "estoque"; linhas: { produto_id: string; quantidade: number; lancamento_id?: string | null; estadia_id?: string | null; chave?: string | null }[] }
  | { t: "apagar_aberto"; id: string; exige?: boolean }
  | { t: "estadia_fechar"; id: string; saida: string; diarias: number; valor_cobrado: number | null; obs?: string | null }
  | { t: "estadia_acertar"; id: string; diarias: number; valor: number; obs?: string | null }
  | { t: "estadia_cancelar"; id: string }
  | { t: "estadia_valores"; estadia: string; modo: "upsert" | "update"; campos: Record<string, unknown> };

/** O que o banco devolve: os ids dos lançamentos com nome e o resultado de cada passo (na ordem). */
export type ResultadoDaOperacao = {
  ok: boolean; repetido?: boolean; ids: Record<string, string>;
  passos: ({ t: string; id?: string; linha?: Record<string, unknown> | null; usados?: number; total?: number; quitada?: boolean; falta?: number; recebido?: number } & Record<string, unknown>)[];
};

/** Erro do banco numa operação: `dica` diz o caso conhecido (ex.: "maestro:estadia_ja", "maestro:ja_recebido"). */
export class ErroDaOperacao extends Error {
  dica: string | null;
  constructor(mensagem: string, dica: string | null) { super(mensagem); this.dica = dica; }
}
export const casoDoErro = (e: unknown) => (e instanceof ErroDaOperacao ? e.dica : null);

type Alvo =
  | { funcao: "estadia_checkout" | "estadia_sinal"; estadia: string }
  | { funcao: "agendamento_fechar_conta"; agendamento: string }
  | { funcao: "conta_receber_junto"; conta: string };

/** Manda os passos numa chamada só. Lança `ErroDaOperacao` (nada foi gravado, ou a resposta não chegou: tente com a mesma chave). */
export async function fazerTudoOuNada(sb: Banco, petshopId: string, chave: string, alvo: Alvo, passos: Passo[]): Promise<ResultadoDaOperacao> {
  const args = { p_petshop: petshopId, p_chave: chave, p_passos: passos as unknown as never };
  const r = alvo.funcao === "agendamento_fechar_conta" ? await sb.rpc(alvo.funcao, { ...args, p_agendamento: alvo.agendamento })
    : alvo.funcao === "conta_receber_junto" ? await sb.rpc(alvo.funcao, { ...args, p_conta: alvo.conta })
    : await sb.rpc(alvo.funcao, { ...args, p_estadia: alvo.estadia });
  if (r.error) throw new ErroDaOperacao(r.error.message, (r.error as { hint?: string | null }).hint ?? null);
  return r.data as unknown as ResultadoDaOperacao;
}

/** O resultado do primeiro lançamento com este nome (a linha gravada), ou null. */
export const lancamentoDe = (r: ResultadoDaOperacao, nome: string) => {
  const id = r.ids?.[nome];
  return id ? (r.passos.find((p) => p.t === "lancamento" && p.id === id)?.linha ?? { id }) : null;
};

/** Saída dos produtos da conta, ligada à venda (ou à estadia, quando nada foi lançado agora). Mesmas chaves de `baixarEstoque`. */
export function passoDoEstoque(produtos: { produtoId?: string; qtd: number }[], chave: string, lancamento: string | null, estadiaId?: string | null): Passo | null {
  const linhas = produtos.filter((p) => p.produtoId && p.qtd > 0).map((p) => ({
    produto_id: p.produtoId!, quantidade: p.qtd, chave: parteDaChave(chave, "estoque", p.produtoId!) ?? null,
    ...(lancamento ? { lancamento_id: lancamento } : estadiaId ? { estadia_id: estadiaId } : {}),
  }));
  return linhas.length ? { t: "estoque", linhas } : null;
}

const real = (n: number) => Math.round(n * 100) / 100;
/** Pagamento dividido só vai com mais de uma parte (como em `lancarPago`). */
export const partesOuNada = (p: PartePagamento[] | null | undefined) => (p && p.length > 1 ? p.map((x) => ({ ...x, valor: real(x.valor) })) : null);
