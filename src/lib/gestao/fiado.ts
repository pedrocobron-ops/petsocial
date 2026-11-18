import type { Banco } from "./supabase";
import { opcao } from "./opcoes";
import { brl, centavos } from "./util";

/**
 * Limite de fiado (migração 20261200): limite do cliente (`clientes.limite_fiado`) ou o padrão da loja (opção
 * `dinheiro.limite_fiado`; zero = sem limite). Conta a receber nova que passa do limite é recusada pelo banco
 * (`maestro:limite_fiado`), a não ser que o dono ou quem cuida do financeiro libere antes (`fiado_liberar`, anotado com quem).
 * Pagamento na hora nunca é conferido. A tela avisa antes (`conferirLimite`), com a mesma frase do banco.
 */
export const OPCAO_LIMITE_FIADO = "dinheiro.limite_fiado";


/** O limite padrão da loja (0 = sem limite). Quem não vê o dinheiro recebe 0 (o banco não entrega a opção). */
export function limitePadrao(petshop: { opcoes?: unknown }): number {
  const v = Number(opcao(petshop, OPCAO_LIMITE_FIADO, 0));
  return Number.isFinite(v) && v > 0 ? centavos(Math.min(v, 99999.99)) : 0;
}

/** O limite que vale para o cliente (null = sem limite). */
export function limiteDoCliente(cliente: { limite_fiado?: number | null } | null | undefined, petshop: { opcoes?: unknown }): number | null {
  if (cliente?.limite_fiado != null) return centavos(Number(cliente.limite_fiado));
  const p = limitePadrao(petshop);
  return p > 0 ? p : null;
}

/**
 * "Ana já deve R$ 180,00; com esta conta passa do limite de R$ 200,00." Quem não deve nada (com `valor`, o que ficaria
 * devendo): "Ana ficaria devendo R$ 175,50: passa do limite de R$ 150,00." As mesmas frases do banco (`fiado_limite_no_fim`).
 */
export function fraseDoLimite(nome: string, deve: number, limite: number, valor?: number) {
  const primeiro = nome.trim().split(/\s+/)[0] || "O cliente";
  if (!(deve > 0.005) && valor != null) return `${primeiro} ficaria devendo ${brl(valor)}: passa do limite de ${brl(limite)}.`;
  return `${primeiro} já deve ${brl(deve)}; com esta conta passa do limite de ${brl(limite)}.`;
}

/** "Ana deve R$ 119,80 · limite R$ 150,00, cabe mais R$ 30,20" (para a venda mostrar assim que o tutor é escolhido). */
export function fraseDoQueDeve(nome: string, s: Pick<SituacaoFiado, "deve" | "limite" | "total">): string | null {
  const primeiro = nome.trim().split(/\s+/)[0] || "O cliente";
  const deve = centavos(Math.max(Number(s.total ?? s.deve), s.deve));
  const limite = s.limite == null ? null : (() => { const sobra = centavos(s.limite! - s.deve); return sobra >= 0 ? `limite de fiado ${brl(s.limite!)}, cabe mais ${brl(sobra)}` : `passou ${brl(-sobra)} do limite de fiado de ${brl(s.limite!)}`; })();
  if (!(deve > 0.005)) return limite ? `${primeiro} não deve nada · ${limite}` : null;
  return `${primeiro} deve ${brl(deve)}${limite ? ` · ${limite}` : ""}`;
}

/** "Limite R$ 200,00 · cabe mais R$ 20,00" (ou "passou R$ 15,00 do limite"). */
export function fraseDoDisponivel(deve: number, limite: number) {
  const sobra = centavos(limite - deve);
  return sobra >= 0 ? `Limite ${brl(limite)} · cabe mais ${brl(sobra)}` : `Limite ${brl(limite)} · passou ${brl(-sobra)} do limite`;
}

/**
 * Conta a receber que ainda não conta no limite (a mesma regra do banco, `conta_fora_do_limite`, migração 20261224): vence
 * depois de hoje e é de um serviço que ainda vai acontecer (mensalidade da creche gerada para o mês, sinal de reserva).
 * Fiado de venda ou de atendimento já feito sempre conta, mesmo com prazo.
 */
export function foraDoLimite(l: { categoria?: string | null; descricao?: string | null; vencimento?: string | null }, hoje: string): boolean {
  return Boolean(l.vencimento && l.vencimento > hoje && (l.categoria === "Creche: mensalidade" || /^\s*(sinal da reserva|pago adiantado):/i.test(l.descricao ?? "")));
}

/** O que o tutor deve, separado pelo vencimento: vencido, vence hoje (ou sem data) e a vencer; e o que conta no limite. */
export type DividaPorVencimento = { total: number; vencido: number; venceHoje: number; aVencer: number; noLimite: number; foraDoLimite: number };
export function dividaPorVencimento(contas: { valor: number | string; vencimento?: string | null; categoria?: string | null; descricao?: string | null }[], hoje: string): DividaPorVencimento {
  const d: DividaPorVencimento = { total: 0, vencido: 0, venceHoje: 0, aVencer: 0, noLimite: 0, foraDoLimite: 0 };
  for (const c of contas) {
    const v = Number(c.valor);
    d.total = centavos(d.total + v);
    if (c.vencimento && c.vencimento < hoje) d.vencido = centavos(d.vencido + v);
    else if (!c.vencimento || c.vencimento === hoje) d.venceHoje = centavos(d.venceHoje + v);
    else d.aVencer = centavos(d.aVencer + v);
    if (foraDoLimite(c, hoje)) d.foraDoLimite = centavos(d.foraDoLimite + v);
    else d.noLimite = centavos(d.noLimite + v);
  }
  return d;
}

/** "R$ 120,00 vencido · R$ 30,00 vence hoje · R$ 900,00 a vencer" (só as partes com valor). */
export function fraseDoVencimento(d: Pick<DividaPorVencimento, "vencido" | "venceHoje" | "aVencer">) {
  return [d.vencido > 0 && `${brl(d.vencido)} vencido`, d.venceHoje > 0 && `${brl(d.venceHoje)} vence hoje`, d.aVencer > 0 && `${brl(d.aVencer)} a vencer`].filter(Boolean).join(" · ");
}

/** `deve`: o que conta no limite (sem a mensalidade e o sinal que ainda não venceram). As partes vêm do banco novo (20261224). */
export type SituacaoFiado = {
  nome: string; limite: number | null; do_cliente: boolean; deve: number; disponivel: number | null;
  vencido?: number; vence_hoje?: number; a_vencer?: number; total?: number; fora_do_limite?: number;
};

export async function situacaoDoFiado(sb: Banco, petshopId: string, clienteId: string): Promise<SituacaoFiado | null> {
  const r = await sb.rpc("fiado_situacao", { p_petshop: petshopId, p_cliente: clienteId });
  if (r.error) throw new Error(r.error.message);
  const d = r.data as unknown as SituacaoFiado | null;
  const n = (x: unknown) => (x == null ? undefined : Number(x));
  return d ? {
    ...d, limite: d.limite == null ? null : Number(d.limite), deve: Number(d.deve), disponivel: d.disponivel == null ? null : Number(d.disponivel),
    vencido: n(d.vencido), vence_hoje: n(d.vence_hoje), a_vencer: n(d.a_vencer), total: n(d.total), fora_do_limite: n(d.fora_do_limite),
  } : null;
}

/** O erro do banco é o do limite? */
export const ehErroDoLimite = (e: unknown) => /passa do limite de R\$/.test(e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e));

type Perguntar = (p: { titulo: string; texto?: string; confirmar?: string; perigo?: boolean; voltar?: string }) => Promise<boolean>;

/**
 * Antes de anotar `valor` a receber de um cliente (o que FICA devendo: numa conta paga em parte, só o resto): cabe no limite? Se passa, quem pode liberar (dono ou quem cuida do
 * financeiro) confirma "Liberar mesmo assim" e o banco anota quem liberou; quem não pode recebe a frase e não grava.
 * Devolve true para seguir. Lança erro só quando a liberação falha.
 */
export async function conferirLimite(sb: Banco, petshopId: string, clienteId: string | null | undefined, valor: number, o: {
  perguntar: Perguntar; podeLiberar: boolean; avisarErro: (e: unknown) => void;
}): Promise<boolean> {
  if (!clienteId || !(valor > 0)) return true;
  let s: SituacaoFiado | null = null;
  try { s = await situacaoDoFiado(sb, petshopId, clienteId); } catch { return true; } // sem ler, o banco confere na gravação
  if (!s || s.limite == null || centavos(s.deve + valor) <= s.limite + 0.005) return true;
  const frase = fraseDoLimite(s.nome, s.deve, s.limite, centavos(valor));
  if (!o.podeLiberar) {
    o.avisarErro(`${frase} Só o dono ou quem cuida do financeiro pode liberar. Receba agora, ou peça para eles.`);
    return false;
  }
  const sim = await o.perguntar({
    titulo: "Passa do limite de fiado", confirmar: "Liberar mesmo assim", voltar: "Voltar",
    texto: `${frase} Se liberar, a conta de ${brl(valor)} fica anotada e o seu nome fica registrado como quem liberou.`,
  });
  if (!sim) return false;
  const r = await sb.rpc("fiado_liberar", { p_petshop: petshopId, p_cliente: clienteId, p_valor: centavos(valor) });
  if (r.error) throw new Error(r.error.message);
  return true;
}
