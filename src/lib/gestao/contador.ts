import type { Banco } from "./supabase";
import { cobradoPorItem } from "./loja-vendas";
import { itensDoLancamento, nomeDoMovimento, partesPorForma, textoDoPagamento } from "./dinheiro";
import { CATEGORIAS_DEVOLUCAO } from "./faturamento";
import { passoPorExtenso, passosDaCadeia, type Cadeia } from "./cadeia";
import { brl, centavos, dataCompleta, isoDia, somaDias, deIsoDia } from "./util";

/**
 * Planilhas para o contador (migração 20261234, função `lancamentos_para_contador`). Tudo o que as planilhas de dinheiro
 * mostram sai daqui, para a cópia de segurança, o Exportar do Financeiro e os testes darem as mesmas colunas:
 *
 *  - `planilhaDeLancamentos`: o financeiro linha a linha, com taxa, parcelas, valor líquido, quando cai, data do atendimento,
 *    "Lançado em", a marca de retroativo e duas colunas para somar: "Conta no faturamento" e "Conta no resultado"
 *    (a soma delas no mês é o Faturamento e o Resultado da tela; por isso o crédito deixado e o usado no check-out têm linha própria);
 *  - `planilhaParaOContador`: uma linha por recebimento (bruto, taxa, líquido, cai em, desconto, devolvido, crédito, custo);
 *  - `planilhaDeRepasses`: cada parcela que a maquininha paga (o que está "A receber" soma o "A receber da maquininha" da tela);
 *  - `planilhaDeVendas`: cada item vendido, com "Já recebido" e "Em aberto" (conta recebida em parte sai "Em parte");
 *  - `planilhaDeSaldos`: fiado, crédito de tutores, pacotes vendidos e não usados e sinais de reservas, na data.
 *
 * Sem importações de tela: usada pelas telas e pelos testes (que somam as colunas e comparam com `dinheiro_cadeia`).
 */

/** Célula de planilha: texto, ou número já escrito (`bruto`), como em `baixarPlanilha`. */
export type Cel = string | { bruto: string };
const din = (v: number): Cel => ({ bruto: Number(v).toFixed(2).replace(".", ",") });
const num = (v: number): Cel => ({ bruto: String(v).replace(".", ",") });
const simNao = (b: boolean) => (b ? "Sim" : "Não");
const dia = (iso: string | null | undefined) => (iso ? dataCompleta(iso.slice(0, 10)) : "");
const qtdTxt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });

/** O que a planilha precisa de um lançamento (uma linha de `lancamentos`). */
export type LancamentoLido = {
  id: string; tipo: string; valor: number; forma?: string | null; categoria: string; descricao?: string | null; data: string;
  vencimento?: string | null; pago: boolean; caixa_id?: string | null; cliente_id?: string | null; origem?: string | null;
  criado_por?: string | null; criado_em: string; itens?: unknown; pagamentos?: unknown; movimento?: string | null;
  alterado_em?: string | null; conta_id?: string | null; valor_original?: number | null; credito_usado?: number | null;
  devido_desde?: string | null; vendido_por?: string | null; diferenca_de?: string | null;
};

export type Repasse = { forma: string; parcela: number; de: number; cai_em: string; valor: number; taxa: number; bruto: number };
export type ExtraDoLancamento = {
  id: string; data_servico: string | null; lancado_em: string | null; retroativo: boolean;
  taxa: number | null; parcelas: number | null; cartao: number | null; repasses: Repasse[];
  devolvido: number; trocado: number; custo: number | null;
};
export type CreditoDoPeriodo = { id: string; dia: string; hora: string; cliente_id: string; cliente: string | null; valor: number; motivo: string | null; lancamento_id: string | null; estadia_id: string | null };
export type ParaContador = { linhas: Map<string, ExtraDoLancamento>; creditos: CreditoDoPeriodo[]; hoje: string };

/** Lê `lancamentos_para_contador` de `de` a `ate` (em pedaços de um ano: a cópia de segurança pede tudo). */
export async function lerParaContador(sb: Banco, petshopId: string, de: string, ate: string): Promise<ParaContador> {
  const x: ParaContador = { linhas: new Map(), creditos: [], hoje: "" };
  let a = de;
  while (a <= ate) {
    const fim = isoDia(somaDias(deIsoDia(a), 364));
    const b = fim < ate ? fim : ate;
    const r = await sb.rpc("lancamentos_para_contador", { p: petshopId, p_de: a, p_ate: b });
    if (r.error) throw new Error(r.error.message);
    const d = (r.data ?? {}) as { hoje?: string; linhas?: Record<string, unknown>[]; creditos?: Record<string, unknown>[] };
    x.hoje = String(d.hoje ?? x.hoje);
    for (const l of d.linhas ?? []) {
      x.linhas.set(String(l.id), {
        id: String(l.id), data_servico: (l.data_servico as string | null) ?? null, lancado_em: (l.lancado_em as string | null) ?? null, retroativo: l.retroativo === true,
        taxa: l.taxa == null ? null : centavos(Number(l.taxa)), parcelas: l.parcelas == null ? null : Number(l.parcelas), cartao: l.cartao == null ? null : centavos(Number(l.cartao)),
        repasses: (Array.isArray(l.repasses) ? l.repasses : []).map((p) => {
          const y = p as Record<string, unknown>;
          return { forma: String(y.forma), parcela: Number(y.parcela), de: Number(y.de), cai_em: String(y.cai_em), valor: centavos(Number(y.valor)), taxa: centavos(Number(y.taxa)), bruto: centavos(Number(y.bruto)) };
        }),
        devolvido: centavos(Number(l.devolvido ?? 0)), trocado: centavos(Number(l.trocado ?? 0)), custo: l.custo == null ? null : centavos(Number(l.custo)),
      });
    }
    for (const c of d.creditos ?? []) {
      x.creditos.push({ id: String(c.id), dia: String(c.dia), hora: String(c.hora ?? ""), cliente_id: String(c.cliente_id), cliente: (c.cliente as string | null) ?? null,
        valor: centavos(Number(c.valor)), motivo: (c.motivo as string | null) ?? null, lancamento_id: (c.lancamento_id as string | null) ?? null, estadia_id: (c.estadia_id as string | null) ?? null });
    }
    a = isoDia(somaDias(deIsoDia(b), 1));
  }
  return x;
}

/** O dia útil em que o repasse cai: sábado e domingo passam para a segunda; com a lista de feriados, pula também o feriado. */
export function diaUtilDoRepasse(iso: string, feriados?: Set<string> | null): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  for (let i = 0; i < 15; i++) {
    const s = d.getUTCDay();
    if (s !== 6 && s !== 0 && !feriados?.has(d.toISOString().slice(0, 10))) break;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

export type NomesDaPlanilha = {
  cliente: (id: string) => string;
  /** Quem lançou (nome da pessoa, "pelo Mozart"…). */
  quem?: (l: LancamentoLido) => string;
  /** O nome que a tela mostra para a categoria (Hotel, Creche…). */
  categoria?: (c: string, descricao?: string | null) => string;
  /** Quando o caixa do lançamento foi aberto (texto pronto). */
  caixa?: (caixaId: string) => string;
  feriados?: Set<string> | null;
};

const ehDevolucao = (l: Pick<LancamentoLido, "tipo" | "categoria">) => l.tipo === "saida" && CATEGORIAS_DEVOLUCAO.includes(l.categoria);
const noResultado = (l: LancamentoLido) => (l.movimento ? "Não (só mexe na gaveta)" : !l.pago ? "Não (ainda não foi pago)" : ehDevolucao(l) ? "Sim (devolução: tira do faturamento)" : "Sim");
const dataHora = (iso: string | null | undefined) => (iso ? `${dia(iso)} ${iso.slice(11, 16)}` : "");
/** Quando o primeiro repasse cai (e quantos são): "19/11/2026" ou "18/12/2026 (1ª de 3)". */
function caiEm(x: ExtraDoLancamento | undefined, feriados?: Set<string> | null): string {
  if (!x?.repasses.length) return "";
  const datas = [...new Set(x.repasses.map((r) => diaUtilDoRepasse(r.cai_em, feriados)))].sort();
  return datas.length > 1 ? `${dia(datas[0])} (1ª de ${datas.length} datas, a última em ${dia(datas[datas.length - 1])})` : dia(datas[0]);
}

export const COLUNAS_DE_LANCAMENTOS = [
  "Data", "Hora do lançamento", "Tipo", "Categoria", "Descrição", "Cliente", "Itens", "Forma", "Partes do pagamento", "Valor", "Pago", "Vencimento",
  "Movimento de gaveta", "Caixa aberto em", "Quem lançou", "Valor cheio da conta (recebida em partes)", "Alterado depois de recebido em", "Entra no resultado",
  "Crédito do tutor usado", "Parcelas", "Taxa da maquininha", "Valor líquido", "Cai em", "Data do atendimento ou da venda", "Lançado em", "Retroativo",
  "Conta no faturamento", "Conta no resultado",
] as const;

/**
 * O financeiro linha a linha. "Data": o dia do pagamento; conta em aberto, o dia em que foi anotada (o vencimento tem coluna própria).
 * No fim vêm as linhas de crédito de tutor do período (`extras.creditos`): deixado (negativa) e usado no check-out (positiva).
 * Somar "Conta no faturamento" dá o Faturamento da tela; somar "Conta no resultado" dá o Resultado.
 */
export function planilhaDeLancamentos(lancamentos: LancamentoLido[], extras: ParaContador, nomes: NomesDaPlanilha): Cel[][] {
  const cat = nomes.categoria ?? ((c: string) => c);
  const linhas = lancamentos.map((l): Cel[] => {
    const x = extras.linhas.get(l.id);
    const valor = Number(l.valor), entrada = l.tipo === "entrada";
    const conta = !l.pago || l.movimento ? 0 : entrada ? valor : -valor;
    const anotada = l.devido_desde ?? x?.lancado_em?.slice(0, 10) ?? isoDia(new Date(l.criado_em));
    return [
      dia(l.pago ? l.data : anotada), x?.lancado_em ? x.lancado_em.slice(11, 16) : "", l.movimento ? "Gaveta" : entrada ? "Entrada" : "Saída", cat(l.categoria, l.descricao), l.descricao ?? "",
      l.cliente_id ? nomes.cliente(l.cliente_id) : "",
      itensDoLancamento(l).map((i) => `${qtdTxt(i.qtd)} x ${i.nome} (${brl(i.valor)} cada)`).join(" | "),
      l.forma ? textoDoPagamento({ ...l, pagamentos: null }) : "",
      partesPorForma(l).length > 1 ? textoDoPagamento(l) : "",
      din(entrada ? valor : -valor), simNao(l.pago), dia(l.vencimento), nomeDoMovimento(l.movimento),
      l.caixa_id && nomes.caixa ? nomes.caixa(l.caixa_id) : "", nomes.quem ? nomes.quem(l) : "",
      l.valor_original != null ? din(Number(l.valor_original)) : "", l.alterado_em ? dataCompleta(l.alterado_em) : "",
      noResultado(l), l.credito_usado ? din(Number(l.credito_usado)) : "",
      x?.parcelas && x.parcelas > 1 ? num(x.parcelas) : x?.cartao ? num(1) : "",
      x?.taxa != null ? din(x.taxa) : "", x?.taxa != null ? din(centavos(valor - x.taxa)) : "", caiEm(x, nomes.feriados),
      dia(x?.data_servico ?? null), dataHora(x?.lancado_em), x ? simNao(x.retroativo) : "",
      din(entrada || ehDevolucao(l) ? conta : 0), din(conta),
    ];
  });
  const creditos = extras.creditos.filter((c) => c.valor > 0 || !c.lancamento_id).map((c): Cel[] => {
    const deixado = c.valor > 0, v = -c.valor;
    const linha: Cel[] = COLUNAS_DE_LANCAMENTOS.map(() => "");
    const por = (coluna: (typeof COLUNAS_DE_LANCAMENTOS)[number], cel: Cel) => { linha[COLUNAS_DE_LANCAMENTOS.indexOf(coluna)] = cel; };
    por("Data", dia(c.dia)); por("Hora do lançamento", c.hora); por("Tipo", "Crédito do tutor");
    por("Categoria", deixado ? "Crédito deixado para o tutor" : "Crédito usado no check-out");
    por("Descrição", c.motivo ?? (deixado ? "Ficou de crédito" : "Usou o crédito")); por("Cliente", c.cliente ?? nomes.cliente(c.cliente_id));
    por("Valor", din(v)); por("Pago", "Sim");
    por("Entra no resultado", deixado ? "Sim (o dinheiro ficou, mas é do tutor: sai do faturamento)" : "Sim (crédito gasto sem lançamento: soma no faturamento)");
    por("Data do atendimento ou da venda", dia(c.dia)); por("Lançado em", `${dia(c.dia)} ${c.hora}`.trim()); por("Retroativo", "Não");
    por("Conta no faturamento", din(v)); por("Conta no resultado", din(v));
    return linha;
  });
  return [[...COLUNAS_DE_LANCAMENTOS], ...linhas, ...creditos];
}

export const COLUNAS_DO_CONTADOR = [
  "Data do recebimento", "Data do atendimento ou da venda", "Lançado em", "Retroativo", "Cliente", "Categoria", "Descrição", "Forma", "Parcelas",
  "Bruto", "Taxa da maquininha", "Líquido", "Cai em", "Desconto", "Devolvido", "Crédito do tutor usado", "Produto trocado (não é dinheiro)", "Custo dos produtos",
] as const;

/**
 * "Para o contador": uma linha por recebimento (entrada paga) do período. Com `cadeia`, o resumo do mês vem embaixo, com os
 * mesmos nomes da tela (Recebido, Faturamento, Resultado…), e as despesas por categoria ficam na planilha de lançamentos.
 */
export function planilhaParaOContador(lancamentos: LancamentoLido[], extras: ParaContador, nomes: NomesDaPlanilha, cadeia?: Cadeia | null): Cel[][] {
  const cat = nomes.categoria ?? ((c: string) => c);
  const t: Cel[][] = [[...COLUNAS_DO_CONTADOR]];
  for (const l of lancamentos) {
    if (l.tipo !== "entrada" || !l.pago || l.movimento) continue;
    const x = extras.linhas.get(l.id), valor = Number(l.valor), taxa = x?.taxa ?? 0;
    const desconto = centavos(cobradoPorItem(l).reduce((s, i) => s + i.desconto, 0));
    t.push([
      dia(l.data), dia(x?.data_servico ?? l.data), dataHora(x?.lancado_em), x ? simNao(x.retroativo) : "", l.cliente_id ? nomes.cliente(l.cliente_id) : "",
      cat(l.categoria, l.descricao), l.descricao ?? "", textoDoPagamento(l), x?.parcelas && x.parcelas > 1 ? num(x.parcelas) : x?.cartao ? num(1) : "",
      din(valor), din(taxa), din(centavos(valor - taxa)), caiEm(x, nomes.feriados), din(desconto), din(x?.devolvido ?? 0),
      din(Number(l.credito_usado ?? 0)), din(x?.trocado ?? 0), x?.custo != null ? din(x.custo) : "",
    ]);
  }
  if (cadeia) {
    t.push([], ["Resumo do período (os mesmos nomes e números da tela Financeiro)"]);
    for (const p of passosDaCadeia(cadeia, brl)) t.push([passoPorExtenso(p), din(p.valor), p.explica]);
    t.push(["Entradas lançadas (soma da coluna Bruto: inclui o que foi pago com crédito do tutor e o produto de trocas)", din(cadeia.lancado)]);
  }
  return t;
}

export const COLUNAS_DE_REPASSES = ["Data do pagamento", "Descrição", "Cliente", "Forma", "Parcela", "Valor da parcela", "Taxa", "Valor que cai", "Cai em", "Situação"] as const;
const NOME_FORMA: Record<string, string> = { debito: "Débito", credito: "Crédito", pix: "Pix" };

/**
 * Repasses da maquininha: cada parcela de cada pagamento com cartão ou Pix, com a taxa e o valor que cai. "A receber": cai
 * depois de hoje (a soma é o "A receber da maquininha" da tela). "Cai em" já pula sábado e domingo (e os feriados da lista,
 * quando a loja liga a opção). O Maestro não sabe se a maquininha pagou: "Já caiu" é pela data.
 */
export function planilhaDeRepasses(lancamentos: LancamentoLido[], extras: ParaContador, hoje: string, nomes?: Partial<NomesDaPlanilha>): Cel[][] {
  const t: Cel[][] = [[...COLUNAS_DE_REPASSES]];
  const linhas: { ordem: string; cel: Cel[] }[] = [];
  for (const l of lancamentos) {
    if (l.tipo !== "entrada" || !l.pago || l.movimento) continue;
    for (const r of extras.linhas.get(l.id)?.repasses ?? []) {
      linhas.push({ ordem: `${r.cai_em}|${l.data}|${l.id}|${r.parcela}`, cel: [
        dia(l.data), l.descricao ?? "", l.cliente_id && nomes?.cliente ? nomes.cliente(l.cliente_id) : "", NOME_FORMA[r.forma] ?? r.forma,
        r.de > 1 ? `${r.parcela} de ${r.de}` : "à vista", din(r.bruto), din(r.taxa), din(r.valor), dia(diaUtilDoRepasse(r.cai_em, nomes?.feriados)),
        r.cai_em > hoje ? "A receber" : "Já caiu (pela data)",
      ] });
    }
  }
  linhas.sort((a, b) => a.ordem.localeCompare(b.ordem));
  return [...t, ...linhas.map((x) => x.cel)];
}

export const COLUNAS_DE_VENDAS = [
  "Data", "Item", "Quantidade", "Valor unitário", "Total do item", "Cliente", "Forma", "Pago", "Quem vendeu", "Descrição do lançamento",
  "Desconto no item", "Total cobrado", "Vencimento", "Devolvido (quantidade)", "Devolvido (valor)", "Devolução", "Já recebido", "Em aberto",
] as const;
/** Entradas sem itens que também são venda: o pacote e a creche e o hotel (sinal, diárias, mensalidade). */
const VENDA_SEM_ITENS = ["Pacotes", "Creche e hotel", "Creche: mensalidade"];

/**
 * Cada item vendido ou cobrado. A venda de pacote e as contas de creche e hotel (que não têm itens) entram com uma linha.
 * "Pago": Sim, Não ou Em parte (conta recebida em partes). "Já recebido" + "Em aberto" = "Total cobrado" de cada linha;
 * a soma de "Já recebido" das linhas é o que entrou dessas contas (as partes já recebidas contam aqui, na linha da conta).
 */
export function planilhaDeVendas(lancamentos: LancamentoLido[], nomes: { cliente: (id: string) => string; quem: (l: LancamentoLido) => string },
  o: { voltou: Map<string, { qtd: number; valor: number; textos: string[] }> }): Cel[][] {
  const partes = new Map<string, number>();
  for (const l of lancamentos) if (l.conta_id && l.pago && l.tipo === "entrada" && !l.movimento) partes.set(l.conta_id, centavos((partes.get(l.conta_id) ?? 0) + Number(l.valor)));
  const t: Cel[][] = [[...COLUNAS_DE_VENDAS]];
  for (const l of lancamentos) {
    if (l.tipo !== "entrada" || l.movimento || l.conta_id) continue;
    const emPartes = partes.get(l.id) ?? 0;
    // o que já entrou desta conta (as partes e, quando quitada, a própria linha) e o que falta
    const recebido = centavos((l.pago ? Number(l.valor) : 0) + emPartes), aberto = l.pago ? 0 : centavos(Number(l.valor));
    const cheio = centavos(recebido + aberto);
    let itens = cobradoPorItem({ ...l, valor_original: cheio });
    if (!itens.length) {
      if (!VENDA_SEM_ITENS.includes(l.categoria)) continue;
      itens = [{ nome: l.descricao || l.categoria, tipo: l.categoria === "Pacotes" ? "pacote" : "estadia", qtd: 1, valor: cheio, bruto: cheio, cobrado: cheio, desconto: 0 }];
    }
    // reparte o recebido pelas linhas na proporção do cobrado (o centavo que sobra vai para a última linha com valor)
    const total = itens.reduce((s, i) => s + i.cobrado, 0);
    let falta = recebido;
    const ultima = itens.reduce((m, i, n) => (i.cobrado > 0 ? n : m), -1);
    const pago = l.pago ? "Sim" : emPartes > 0 ? "Em parte" : "Não";
    const anotada = l.devido_desde ?? isoDia(new Date(l.criado_em));
    itens.forEach((i, n) => {
      const ja = n === ultima ? centavos(falta) : total > 0 ? centavos((i.cobrado / total) * recebido) : 0;
      falta = centavos(falta - ja);
      const d = i.produto_id ? o.voltou.get(`${l.id}|${i.produto_id}`) : undefined;
      t.push([
        // o dia da venda: conta em aberto guarda o vencimento em "data"; vale o dia em que foi anotada
        dia(l.pago ? l.data : anotada), i.nome, num(i.qtd), din(i.valor), din(i.bruto),
        l.cliente_id ? nomes.cliente(l.cliente_id) : "", l.forma ? textoDoPagamento(l) : "", pago, nomes.quem(l), l.descricao ?? "",
        din(i.desconto), din(i.cobrado), l.pago ? "" : dia(l.vencimento),
        d ? num(d.qtd) : "", d ? din(d.valor) : "", d ? d.textos.join(" | ") : "",
        din(ja), din(centavos(i.cobrado - ja)),
      ]);
    });
  }
  return t;
}

/* ---------- saldos em aberto ---------- */

export type Saldos = {
  hoje: string;
  fiado: { total: number; contas: number; linhas: { nome: string | null; contas: number; valor: number; desde: string | null; vence: string | null; atrasadas: number }[] };
  credito: { total: number; linhas: { nome: string | null; valor: number; ultimo: string | null }[] };
  pacotes: { total: number; usos: number; linhas: { nome: string; pet: string | null; tutor: string | null; total: number; usados: number; faltam: number; preco: number; devido: number; comprado_em: string | null; vence_em: string | null }[] };
  sinais: { total: number; linhas: { pet: string | null; tutor: string | null; tipo: string; entrada: string | null; status: string; recebido: number; pago_em: string | null }[] };
};

/** Lê o que `saldos_em_aberto` devolve. */
export function montarSaldos(b: unknown): Saldos {
  const o = (b ?? {}) as Record<string, Record<string, unknown>>;
  const linhas = (x: Record<string, unknown> | undefined) => (Array.isArray(x?.linhas) ? (x!.linhas as Record<string, unknown>[]) : []);
  const txt = (v: unknown) => (v == null ? null : String(v));
  const r = (v: unknown) => centavos(Number(v ?? 0));
  return {
    hoje: String((b as { hoje?: string } | null)?.hoje ?? ""),
    fiado: { total: r(o.fiado?.total), contas: Number(o.fiado?.contas ?? 0), linhas: linhas(o.fiado).map((l) => ({ nome: txt(l.nome), contas: Number(l.contas), valor: r(l.valor), desde: txt(l.desde), vence: txt(l.vence), atrasadas: Number(l.atrasadas ?? 0) })) },
    credito: { total: r(o.credito?.total), linhas: linhas(o.credito).map((l) => ({ nome: txt(l.nome), valor: r(l.valor), ultimo: txt(l.ultimo) })) },
    pacotes: { total: r(o.pacotes?.total), usos: Number(o.pacotes?.usos ?? 0), linhas: linhas(o.pacotes).map((l) => ({ nome: String(l.nome ?? ""), pet: txt(l.pet), tutor: txt(l.tutor), total: Number(l.total), usados: Number(l.usados), faltam: Number(l.faltam), preco: r(l.preco), devido: r(l.devido), comprado_em: txt(l.comprado_em), vence_em: txt(l.vence_em) })) },
    sinais: { total: r(o.sinais?.total), linhas: linhas(o.sinais).map((l) => ({ pet: txt(l.pet), tutor: txt(l.tutor), tipo: String(l.tipo ?? ""), entrada: txt(l.entrada), status: String(l.status ?? ""), recebido: r(l.recebido), pago_em: txt(l.pago_em) })) },
  };
}

export async function lerSaldos(sb: Banco, petshopId: string): Promise<Saldos> {
  const r = await sb.rpc("saldos_em_aberto", { p: petshopId });
  if (r.error) throw new Error(r.error.message);
  return montarSaldos(r.data);
}

/** A planilha de saldos: quatro blocos, cada um com as linhas e o total. */
export function planilhaDeSaldos(s: Saldos): Cel[][] {
  const t: Cel[][] = [[`Saldos em aberto em ${dia(s.hoje)}`], []];
  t.push(["Fiado em aberto", "", "", "", din(s.fiado.total)], ["Cliente", "Contas", "Deve desde", "Vence em", "Valor", "Contas atrasadas"]);
  for (const l of s.fiado.linhas) t.push([l.nome ?? "Sem cliente", num(l.contas), dia(l.desde), dia(l.vence), din(l.valor), num(l.atrasadas)]);
  t.push([], ["Crédito de tutores em aberto", "", "", "", din(s.credito.total)], ["Tutor", "", "Último movimento", "", "Valor"]);
  for (const l of s.credito.linhas) t.push([l.nome ?? "", "", dia(l.ultimo), "", din(l.valor)]);
  t.push([], ["Pacotes vendidos e ainda não usados", "", "", "", din(s.pacotes.total)], ["Pacote", "Pet", "Tutor", "Comprado em", "Serviço devido (usos que faltam × preço pago por uso)", "Usos que faltam", "Usos do pacote", "Preço pago", "Vale até"]);
  for (const l of s.pacotes.linhas) t.push([l.nome, l.pet ?? "", l.tutor ?? "", dia(l.comprado_em), din(l.devido), num(l.faltam), num(l.total), din(l.preco), dia(l.vence_em)]);
  t.push([], ["Sinais de reservas que ainda vão acontecer", "", "", "", din(s.sinais.total)], ["Pet", "Tutor", "Creche ou hotel", "Entrada", "Sinal recebido", "Situação", "Recebido em"]);
  for (const l of s.sinais.linhas) t.push([l.pet ?? "", l.tutor ?? "", l.tipo === "hotel" ? "Hotel" : "Creche", dia(l.entrada), din(l.recebido), l.status === "em_casa" ? "Pet na casa" : "Reservada", dia(l.pago_em)]);
  return t;
}
