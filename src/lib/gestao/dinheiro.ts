import type { Banco } from "./supabase";
import { FORMAS } from "./tipos";
import { brl, horarioDoDia, isoDia } from "./util";

/** Forma de pagamento aceita num lançamento. */
export type FormaPagamento = (typeof FORMAS)[number]["id"];
/** Uma parte de um pagamento dividido (ex.: R$ 30 no Pix). */
export type PartePagamento = { forma: FormaPagamento; valor: number };
/** Nome da categoria dos movimentos de gaveta (sangria e suprimento). */
export const CATEGORIA_GAVETA = "Movimento de gaveta";

/**
 * O que cada tela viu por último: havia caixa aberto? Serve para avisar quando o caixa fecha em outro aparelho
 * enquanto alguém está com uma venda aberta (o valor ficaria fora do caixa sem ninguém perceber).
 */
const caixaVisto = new Map<string, string | null>();

async function lerCaixaAberto(sb: Banco, petshopId: string) {
  const { data } = await sb.from("caixas").select("*").eq("petshop_id", petshopId).is("fechado_em", null).maybeSingle();
  return data;
}

/** Caixa aberto do pet shop (ou null). Só quem recebe consegue ler. Guarda o que viu, para `conferirCaixa`. */
export async function caixaAberto(sb: Banco, petshopId: string) {
  const data = await lerCaixaAberto(sb, petshopId);
  caixaVisto.set(petshopId, data?.id ?? null);
  return data;
}

/** A tela de Caixa avisa o que mostrou (caixa aberto ou fechado). */
export const lembrarCaixa = (petshopId: string, caixaId: string | null) => { caixaVisto.set(petshopId, caixaId); };

type Perguntar = (p: { titulo: string; texto?: string; confirmar?: string; perigo?: boolean }) => Promise<boolean>;

/**
 * Antes de gravar dinheiro de hoje: se a tela foi aberta com o caixa aberto e ele fechou nesse meio tempo, pergunta.
 * Devolve false quando a pessoa preferiu voltar (para abrir um caixa novo antes).
 * Chame antes de `lancarPago` em toda tela que recebe, e antes de gravar qualquer outra coisa da mesma operação.
 */
export async function conferirCaixa(sb: Banco, petshopId: string, perguntar: Perguntar) {
  const antes = caixaVisto.get(petshopId);
  const agora = await lerCaixaAberto(sb, petshopId);
  if (antes && !agora) {
    const sim = await perguntar({
      titulo: "O caixa foi fechado há pouco",
      texto: "Este valor fica fora do caixa: conta no dia, mas não entra na conferência da gaveta. Para ele entrar, volte, abra um caixa novo na tela Caixa e lance de novo.",
      confirmar: "Lançar fora do caixa",
    });
    if (!sim) return false;
  }
  caixaVisto.set(petshopId, agora?.id ?? null);
  return true;
}

/** A partir deste valor, as telas pedem para conferir antes de gravar (um zero a mais é fácil de digitar). */
export const VALOR_PARA_CONFERIR = 10000;
/** "Confere? R$ 12.000,00": devolve false quando a pessoa quer corrigir. Abaixo de R$ 10.000,00 não pergunta. */
export async function conferirValorAlto(valor: number | null | undefined, perguntar: Perguntar) {
  if (valor == null || valor < VALOR_PARA_CONFERIR) return true;
  return perguntar({ titulo: `Confere? ${brl(valor)}`, texto: "É um valor alto. Se digitou um número a mais, volte e corrija.", confirmar: "Está certo" });
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
  /** Pagamento dividido: as partes (a soma é o valor). Sem isso, o valor inteiro é da `forma`. */
  pagamentos?: PartePagamento[] | null;
  /** Dinheiro que só entrou ou saiu da gaveta: não é receita nem despesa. */
  movimento?: "sangria" | "suprimento" | null;
  /** Exige caixa aberto (movimentos de gaveta). */
  exigeCaixa?: boolean;
}) {
  const hoje = isoDia(new Date());
  const caixa = await caixaAberto(sb, petshopId);
  if (l.exigeCaixa && !caixa) throw new Error("O caixa não está aberto. Abra o caixa e tente de novo.");
  const { data: u } = await sb.auth.getUser();
  const dividido = l.pagamentos && l.pagamentos.length > 1 ? l.pagamentos : null;
  const { data, error } = await sb.from("lancamentos").insert({
    petshop_id: petshopId, tipo: l.tipo, valor: l.valor, forma: l.forma, categoria: l.categoria, descricao: l.descricao ?? null,
    data: l.data ?? hoje, pago: true, caixa_id: caixa?.id ?? null,
    agendamento_id: l.agendamentoId ?? null, cliente_id: l.clienteId ?? null, origem: l.origem ?? "tela", criado_por: u.user?.id ?? null,
    ...(l.itens?.length ? { itens: l.itens } : {}),
    ...(dividido ? { pagamentos: dividido } : {}),
    ...(l.movimento ? { movimento: l.movimento } : {}),
  }).select().single();
  // outra pessoa recebeu este atendimento no mesmo instante: o banco aceita só um recebimento por atendimento
  if (error?.code === "23505") throw new Error("Este atendimento já tem recebimento lançado. Atualize a tela para ver.");
  // quem só opera o caixa lança o dinheiro de hoje; outro dia é com quem cuida do financeiro
  if (error && /row-level security/i.test(error.message) && l.data && l.data !== hoje) throw new Error("Só quem cuida do financeiro lança um valor em outro dia. Lance com a data de hoje ou peça para o dono.");
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Anota uma conta que o cliente vai pagar depois (fiado): uma entrada ainda não paga, com vencimento.
 * Não entra no caixa nem nas somas do que entrou; aparece em Financeiro, A receber, até alguém dar baixa.
 */
export async function lancarAReceber(sb: Banco, petshopId: string, l: {
  valor: number; vencimento: string; categoria: string; descricao?: string | null; agendamentoId?: string | null; clienteId?: string | null;
  itens?: ItemLancamento[] | null;
}) {
  const { data: u } = await sb.auth.getUser();
  const { data, error } = await sb.from("lancamentos").insert({
    petshop_id: petshopId, tipo: "entrada", valor: l.valor, forma: null, categoria: l.categoria, descricao: l.descricao ?? null,
    data: l.vencimento, vencimento: l.vencimento, pago: false,
    agendamento_id: l.agendamentoId ?? null, cliente_id: l.clienteId ?? null, origem: "tela", criado_por: u.user?.id ?? null,
    ...(l.itens?.length ? { itens: l.itens } : {}),
  }).select().single();
  if (error?.code === "23505") throw new Error("Este atendimento já tem recebimento lançado. Atualize a tela para ver.");
  if (error) throw new Error(error.message);
  return data;
}

const centavos = (n: number) => Math.round(n * 100) / 100;

/* ---------- pagamento dividido e movimentos de gaveta ---------- */

const ehForma = (s: unknown): s is FormaPagamento => FORMAS.some((f) => f.id === s);
const nomeDaForma = (f: string) => FORMAS.find((x) => x.id === f)?.rotulo ?? "Outro";

/**
 * As partes de um lançamento por forma de pagamento. Pagamento dividido devolve uma parte por forma (somadas se repetirem);
 * pagamento inteiro devolve uma parte só, com a `forma` do lançamento (sem forma, "outro").
 * A soma das partes é sempre o valor do lançamento: se `pagamentos` não fechar com o valor, vale a `forma`.
 * Use em toda soma por forma de pagamento (gaveta do caixa, financeiro, relatórios).
 */
export function partesPorForma(l: { valor: number; forma?: string | null; pagamentos?: unknown }): PartePagamento[] {
  const total = centavos(Number(l.valor));
  const inteiro: PartePagamento[] = [{ forma: ehForma(l.forma) ? l.forma : "outro", valor: total }];
  if (!Array.isArray(l.pagamentos)) return inteiro;
  const porForma = new Map<FormaPagamento, number>();
  for (const x of l.pagamentos as unknown[]) {
    if (!x || typeof x !== "object") continue;
    const p = x as Record<string, unknown>;
    const valor = Number(p.valor);
    if (!Number.isFinite(valor) || valor <= 0) continue;
    const forma = ehForma(p.forma) ? p.forma : "outro";
    porForma.set(forma, centavos((porForma.get(forma) ?? 0) + valor));
  }
  const partes = [...porForma].map(([forma, valor]) => ({ forma, valor }));
  if (!partes.length || centavos(partes.reduce((s, p) => s + p.valor, 0)) !== total) return inteiro;
  return partes;
}

/** O lançamento foi pago com mais de uma forma? */
export const ehDividido = (l: { valor: number; forma?: string | null; pagamentos?: unknown }) => partesPorForma(l).length > 1;

/** "Pix" para pagamento inteiro; "Pix R$ 30,00 + Dinheiro R$ 20,00" para o dividido. Sem forma (conta ainda não paga), "Sem forma". */
export function textoDoPagamento(l: { valor: number; forma?: string | null; pagamentos?: unknown }) {
  const partes = partesPorForma(l);
  if (partes.length > 1) return partes.map((p) => `${nomeDaForma(p.forma)} ${brl(p.valor)}`).join(" + ");
  return l.forma ? nomeDaForma(partes[0].forma) : "Sem forma";
}

/** Forma que fica no campo `forma` de um pagamento dividido: a de maior valor (empate: a primeira). */
export function formaPrincipal(partes: PartePagamento[]): FormaPagamento {
  return partes.reduce((m, p) => (p.valor > m.valor ? p : m), partes[0]).forma;
}

/** Sangria ou suprimento: dinheiro que só entrou ou saiu da gaveta. Não conta como receita nem despesa. */
export const ehMovimentoDeGaveta = (l: { movimento?: string | null }) => Boolean(l.movimento);

/** Nome simples de um movimento de gaveta, para as listas. */
export const nomeDoMovimento = (m: string | null | undefined) =>
  m === "sangria" ? "Tirou da gaveta (sangria)" : m === "suprimento" ? "Colocou na gaveta (suprimento)" : "";

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

/* ---------- valor realmente cobrado, por tipo de item ---------- */

/** Maior valor aceito num campo de dinheiro das telas de venda e agenda. */
export const VALOR_MAXIMO = 99999.99;

/**
 * Divide o valor recebido de um lançamento entre serviço, produto e extra, conforme os itens.
 * O desconto é rateado na proporção de cada linha e a soma das partes é sempre o valor do lançamento.
 * Sem itens, devolve null (o lançamento inteiro é da categoria dele).
 */
export function partesDoLancamento(l: { valor: number; itens?: unknown }): { servico: number; produto: number; extra: number } | null {
  const itens = itensDoLancamento(l);
  if (!itens.length) return null;
  const bruto = { servico: 0, produto: 0, extra: 0 };
  for (const i of itens) bruto[i.tipo] += Math.max(0, i.qtd * i.valor);
  const soma = bruto.servico + bruto.produto + bruto.extra;
  const total = Number(l.valor);
  if (!(soma > 0)) return null;
  const partes = { servico: centavos((bruto.servico / soma) * total), produto: centavos((bruto.produto / soma) * total), extra: centavos((bruto.extra / soma) * total) };
  // o centavo que sobra do arredondamento vai para a maior parte
  const sobra = centavos(total - partes.servico - partes.produto - partes.extra);
  if (sobra) {
    const maior = (["servico", "produto", "extra"] as const).reduce<"servico" | "produto" | "extra">((m, k) => (partes[k] > partes[m] ? k : m), "servico");
    partes[maior] = centavos(partes[maior] + sobra);
  }
  return partes;
}

/** Percentuais inteiros que somam exatamente 100 (o resto do arredondamento vai para quem ficou mais longe do inteiro). */
export function percentuaisQueFecham(valores: number[]): number[] {
  const total = valores.reduce((s, v) => s + Math.max(0, v), 0);
  if (!(total > 0)) return valores.map(() => 0);
  const exatos = valores.map((v) => (Math.max(0, v) / total) * 100);
  const pct = exatos.map(Math.floor);
  let falta = 100 - pct.reduce((s, v) => s + v, 0);
  const ordem = exatos.map((v, i) => ({ i, resto: v - Math.floor(v) })).sort((a, b) => b.resto - a.resto);
  for (const o of ordem) { if (falta <= 0) break; pct[o.i]++; falta--; }
  return pct;
}
