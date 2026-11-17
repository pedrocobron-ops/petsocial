import type { Banco } from "./supabase";
import { opcao } from "./opcoes";
import { brl } from "./util";

/**
 * Limite de fiado (migração 20261200): limite do cliente (`clientes.limite_fiado`) ou o padrão da loja (opção
 * `dinheiro.limite_fiado`; zero = sem limite). Conta a receber nova que passa do limite é recusada pelo banco
 * (`maestro:limite_fiado`), a não ser que o dono ou quem cuida do financeiro libere antes (`fiado_liberar`, anotado com quem).
 * Pagamento na hora nunca é conferido. A tela avisa antes (`conferirLimite`), com a mesma frase do banco.
 */
export const OPCAO_LIMITE_FIADO = "dinheiro.limite_fiado";

const centavos = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;

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

/** "Ana já deve R$ 180,00; com esta conta passa do limite de R$ 200,00." */
export function fraseDoLimite(nome: string, deve: number, limite: number) {
  const primeiro = nome.trim().split(/\s+/)[0] || "O cliente";
  return `${primeiro} já deve ${brl(deve)}; com esta conta passa do limite de ${brl(limite)}.`;
}

/** "Limite R$ 200,00 · cabe mais R$ 20,00" (ou "passou R$ 15,00 do limite"). */
export function fraseDoDisponivel(deve: number, limite: number) {
  const sobra = centavos(limite - deve);
  return sobra >= 0 ? `Limite ${brl(limite)} · cabe mais ${brl(sobra)}` : `Limite ${brl(limite)} · passou ${brl(-sobra)} do limite`;
}

export type SituacaoFiado = { nome: string; limite: number | null; do_cliente: boolean; deve: number; disponivel: number | null };

export async function situacaoDoFiado(sb: Banco, petshopId: string, clienteId: string): Promise<SituacaoFiado | null> {
  const r = await sb.rpc("fiado_situacao", { p_petshop: petshopId, p_cliente: clienteId });
  if (r.error) throw new Error(r.error.message);
  const d = r.data as unknown as SituacaoFiado | null;
  return d ? { ...d, limite: d.limite == null ? null : Number(d.limite), deve: Number(d.deve), disponivel: d.disponivel == null ? null : Number(d.disponivel) } : null;
}

/** O erro do banco é o do limite? */
export const ehErroDoLimite = (e: unknown) => /passa do limite de R\$/.test(e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e));

type Perguntar = (p: { titulo: string; texto?: string; confirmar?: string; perigo?: boolean; voltar?: string }) => Promise<boolean>;

/**
 * Antes de anotar `valor` a receber de um cliente: cabe no limite? Se passa, quem pode liberar (dono ou quem cuida do
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
  const frase = fraseDoLimite(s.nome, s.deve, s.limite);
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
