import type { Banco } from "./supabase";
import { horarioDoDia, isoDia } from "./util";

/** Caixa aberto do pet shop (ou null). Só quem vê o financeiro consegue ler. */
export async function caixaAberto(sb: Banco, petshopId: string) {
  const { data } = await sb.from("caixas").select("*").eq("petshop_id", petshopId).is("fechado_em", null).maybeSingle();
  return data;
}

/** Uma linha de uma venda ou comanda, como fica guardada em `lancamentos.itens`. `valor` é o preço de uma unidade. */
export type ItemLancamento = { tipo: "servico" | "produto" | "extra"; nome: string; qtd: number; valor: number; produto_id?: string };

/**
 * Registra dinheiro que já entrou ou saiu hoje. Se houver caixa aberto, o lançamento entra nele.
 * Use para: receber um atendimento, vender um pacote, fechar uma estadia, pagar uma despesa na hora.
 */
export async function lancarPago(sb: Banco, petshopId: string, l: {
  tipo: "entrada" | "saida"; valor: number; forma: "dinheiro" | "pix" | "debito" | "credito" | "outro";
  categoria: string; descricao?: string | null; agendamentoId?: string | null; clienteId?: string | null;
  origem?: "tela" | "assistente" | "sistema"; data?: string; itens?: ItemLancamento[] | null;
}) {
  const caixa = await caixaAberto(sb, petshopId);
  const { data: u } = await sb.auth.getUser();
  const { data, error } = await sb.from("lancamentos").insert({
    petshop_id: petshopId, tipo: l.tipo, valor: l.valor, forma: l.forma, categoria: l.categoria, descricao: l.descricao ?? null,
    data: l.data ?? isoDia(new Date()), pago: true, caixa_id: caixa?.id ?? null,
    agendamento_id: l.agendamentoId ?? null, cliente_id: l.clienteId ?? null, origem: l.origem ?? "tela", criado_por: u.user?.id ?? null,
    ...(l.itens?.length ? { itens: l.itens } : {}),
  }).select().single();
  if (error) throw new Error(error.message);
  return data;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Lê `lancamentos.itens` (jsonb) com cuidado: o que não tem cara de item fica de fora. */
export function itensDoLancamento(l: { itens?: unknown } | null | undefined): ItemLancamento[] {
  const bruto = l?.itens;
  if (!Array.isArray(bruto)) return [];
  const itens: ItemLancamento[] = [];
  for (const x of bruto as unknown[]) {
    if (!x || typeof x !== "object") continue;
    const i = x as Record<string, unknown>;
    const qtd = Number(i.qtd ?? 1), valor = Number(i.valor ?? 0);
    if (!Number.isFinite(qtd) || !Number.isFinite(valor)) continue;
    const tipo = i.tipo === "produto" || i.tipo === "servico" ? i.tipo : "extra";
    itens.push({
      tipo, nome: typeof i.nome === "string" && i.nome.trim() ? i.nome.trim() : "Item", qtd, valor,
      ...(typeof i.produto_id === "string" && i.produto_id ? { produto_id: i.produto_id } : {}),
    });
  }
  return itens;
}

/** Soma dos itens e o desconto dado (quando a soma passa do valor do lançamento). */
export function contaDosItens(itens: ItemLancamento[], valorDoLancamento: number) {
  const soma = centavos(itens.reduce((t, i) => t + i.qtd * i.valor, 0));
  return { soma, desconto: Math.max(0, centavos(soma - Number(valorDoLancamento))) };
}

/** Produtos de uma venda que saíram do estoque: um por produto, com as quantidades somadas. */
export function produtosDaVenda(l: { itens?: unknown } | null | undefined) {
  const porProduto = new Map<string, { produtoId: string; nome: string; qtd: number }>();
  for (const i of itensDoLancamento(l)) {
    if (i.tipo !== "produto" || !i.produto_id || !(i.qtd > 0)) continue;
    const p = porProduto.get(i.produto_id) ?? { produtoId: i.produto_id, nome: i.nome, qtd: 0 };
    p.qtd = Math.round((p.qtd + i.qtd) * 1000) / 1000;
    porProduto.set(i.produto_id, p);
  }
  return [...porProduto.values()];
}

/**
 * Apaga um lançamento e, se ele era uma venda com produtos, devolve cada produto ao estoque
 * (uma `entrada` com motivo "Venda desfeita"). Produto que não existe mais fica de fora, sem travar.
 * Lança erro se o lançamento não foi apagado. Se apagou mas o estoque falhou, devolve `erroEstoque`.
 */
export async function desfazerVenda(sb: Banco, petshopId: string, lancamento: { id: string; itens?: unknown }) {
  const produtos = produtosDaVenda(lancamento);
  const apagados = await sb.from("lancamentos").delete().eq("id", lancamento.id).eq("petshop_id", petshopId).select("id");
  if (apagados.error) throw new Error(apagados.error.message);
  // nada apagado: já tinha sido excluído em outra tela (não devolve o estoque duas vezes) ou a conta não pode apagar
  if (!apagados.data?.length) throw new Error("Não deu para excluir. Este lançamento pode já ter sido apagado.");
  if (!produtos.length) return { produtos: 0, devolvidos: 0, erroEstoque: null as string | null };
  try {
    const existem = await sb.from("produtos").select("id").eq("petshop_id", petshopId).in("id", produtos.map((p) => p.produtoId));
    if (existem.error) throw new Error(existem.error.message);
    const ids = new Set((existem.data ?? []).map((p) => p.id));
    const { data: u } = await sb.auth.getUser();
    const linhas = produtos.filter((p) => ids.has(p.produtoId)).map((p) => ({
      petshop_id: petshopId, produto_id: p.produtoId, tipo: "entrada", quantidade: p.qtd, motivo: "Venda desfeita", criado_por: u.user?.id ?? null,
    }));
    if (linhas.length) {
      const r = await sb.from("movimentos_estoque").insert(linhas).select("id");
      if (r.error) throw new Error(r.error.message);
    }
    return { produtos: produtos.length, devolvidos: linhas.length, erroEstoque: null as string | null };
  } catch (e) {
    return { produtos: produtos.length, devolvidos: 0, erroEstoque: e instanceof Error ? e.message : "erro" };
  }
}

/** Dias em que o pet shop abre, de `de` (inclusive) até o último dia do mês. Sem horário preenchido, conta todos os dias. */
export function diasAbertosAteOFimDoMes(horario: unknown, de: Date) {
  const ultimo = new Date(de.getFullYear(), de.getMonth() + 1, 0).getDate();
  const temHorario = Array.from({ length: 7 }, (_, i) => horarioDoDia(horario, new Date(2024, 0, 7 + i))).some(Boolean);
  let dias = 0;
  for (let d = de.getDate(); d <= ultimo; d++) {
    if (!temHorario || horarioDoDia(horario, new Date(de.getFullYear(), de.getMonth(), d))) dias++;
  }
  return { dias, peloHorario: temHorario };
}

/** Contas da meta do mês: quanto já entrou, quanto falta e quanto precisa entrar por dia aberto até o fim do mês. */
export function contasDaMeta(meta: number, entrou: number, horario: unknown, hoje: Date) {
  const falta = Math.max(0, centavos(meta - entrou));
  const { dias, peloHorario } = diasAbertosAteOFimDoMes(horario, hoje);
  return {
    parte: meta > 0 ? entrou / meta : 0, pct: meta > 0 ? Math.floor((entrou / meta) * 100) : 0,
    falta, passou: Math.max(0, centavos(entrou - meta)), dias, peloHorario,
    porDia: falta > 0 && dias > 0 ? centavos(falta / dias) : null,
  };
}
