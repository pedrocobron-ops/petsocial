import type { Banco } from "./supabase";
import { centavos } from "./util";

/**
 * A cadeia do dinheiro: UMA conta, com cada passo com nome, usada por todas as telas, pelas planilhas e pelo Mozart
 * (função `dinheiro_cadeia`, migração 20261234). Cada palavra quer dizer uma coisa só:
 *
 *   Recebido                  dinheiro, Pix e cartão que entraram de verdade (sem o que foi pago com crédito do tutor
 *                             e sem o produto de uma troca, que não são dinheiro novo)
 *   − Devolvido               o que voltou para os tutores em dinheiro, Pix ou cartão
 *   − Crédito deixado         ficou guardado para o tutor: o dinheiro está na loja, mas ainda é dele
 *   + Crédito usado           o tutor gastou o crédito numa conta ou no check-out
 *   = Faturamento             o que o negócio vendeu de verdade no período
 *   − Despesas                tudo o que foi pago (a retirada do dono é uma despesa, lançada no Financeiro ou no Caixa)
 *   = Resultado               faturamento − despesas
 *   − Taxas da maquininha     as guardadas em cada pagamento com cartão ou Pix
 *   = Resultado depois das taxas
 *
 * "Entradas lançadas" (o total de "De onde veio") NÃO é um passo: é a soma das linhas de entrada do Financeiro, que
 * inclui o que foi pago com crédito e o produto de trocas. Aparece só como conferência.
 * Tudo pelo dia do lançamento; o crédito, pelo dia em que aconteceu no fuso do pet shop.
 * Sem importações de tela: usada pelas telas, pelas planilhas, pelo Mozart e pelos testes.
 */
export type Cadeia = {
  de: string; ate: string;
  /** Soma das entradas lançadas (com crédito do tutor e troca dentro). Só conferência. */
  lancado: number; entradas: number;
  creditoNasContas: number; troca: number;
  recebido: number;
  devolvido: number; devolucoes: number;
  creditoDeixado: number;
  creditoUsado: number; creditoUsadoFora: number;
  faturamento: number;
  despesas: number; saidas: number; retiradaDoDono: number;
  resultado: number;
  taxas: number;
  resultadoDepoisDasTaxas: number;
  /** recebido − devolvido − crédito deixado + crédito usado = faturamento (sempre; fica aqui para os testes). */
  fecha: boolean;
  valorMedio: { contas: number; valor: number; medio: number | null; pacotes: number; valorPacotes: number };
  /** Cada serviço pelo dinheiro: quantas vezes foi pago e quanto entrou (o mesmo par de Quanto sobrou). */
  servicos: { servico_id: string | null; nome: string; pagos: number; valor: number }[];
};

const n = (v: unknown) => centavos(Number(v ?? 0));

/** Lê o que o banco devolve em `dinheiro_cadeia`. */
export function montarCadeia(b: Record<string, unknown>): Cadeia {
  const vm = (b.valor_medio ?? {}) as Record<string, unknown>;
  const c: Cadeia = {
    de: String(b.de ?? ""), ate: String(b.ate ?? ""),
    lancado: n(b.lancado), entradas: Number(b.entradas ?? 0),
    creditoNasContas: n(b.credito_nas_contas), troca: n(b.troca),
    recebido: n(b.recebido),
    devolvido: n(b.devolvido), devolucoes: Number(b.devolucoes ?? 0),
    creditoDeixado: n(b.credito_deixado),
    creditoUsado: n(b.credito_usado), creditoUsadoFora: n(b.credito_usado_fora),
    faturamento: n(b.faturamento),
    despesas: n(b.despesas), saidas: Number(b.saidas ?? 0), retiradaDoDono: n(b.retirada_do_dono),
    resultado: n(b.resultado),
    taxas: n(b.taxas),
    resultadoDepoisDasTaxas: n(b.resultado_depois_taxas),
    fecha: true,
    valorMedio: {
      contas: Number(vm.contas ?? 0), valor: n(vm.valor), medio: vm.medio == null ? null : n(vm.medio),
      pacotes: Number(vm.pacotes ?? 0), valorPacotes: n(vm.valor_pacotes),
    },
    servicos: (Array.isArray(b.servicos) ? b.servicos : []).map((s) => {
      const x = s as Record<string, unknown>;
      return { servico_id: (x.servico_id as string | null) ?? null, nome: String(x.nome ?? ""), pagos: Number(x.pagos ?? 0), valor: n(x.valor) };
    }),
  };
  c.fecha = centavos(c.recebido - c.devolvido - c.creditoDeixado + c.creditoUsado) === c.faturamento
    && centavos(c.faturamento - c.despesas) === c.resultado && centavos(c.resultado - c.taxas) === c.resultadoDepoisDasTaxas;
  return c;
}

/** A cadeia de `de` a `ate` (AAAA-MM-DD). Só para quem cuida do financeiro; para os outros (ou banco antigo), null. */
export async function lerCadeia(sb: Banco, petshopId: string, de: string, ate: string): Promise<Cadeia | null> {
  const r = await sb.rpc("dinheiro_cadeia", { p: petshopId, p_de: de, p_ate: ate });
  if (r.error || !r.data) return null;
  return montarCadeia(r.data as Record<string, unknown>);
}

export type PassoDaCadeia = {
  id: "recebido" | "devolvido" | "credito_deixado" | "credito_usado" | "faturamento" | "despesas" | "resultado" | "taxas" | "depois_das_taxas";
  /** "" no primeiro, "−" ou "+" nos ajustes, "=" nos totais. */
  sinal: "" | "−" | "+" | "=";
  nome: string;
  valor: number;
  /** O que este passo quer dizer, em uma frase. */
  explica: string;
  total: boolean;
};

/** Os nomes dos passos: os únicos que as telas, as planilhas e o Mozart usam para estes números. */
export const NOME_DO_PASSO: Record<PassoDaCadeia["id"], string> = {
  recebido: "Recebido",
  devolvido: "Devolvido aos tutores",
  credito_deixado: "Crédito deixado para tutores",
  credito_usado: "Crédito usado por tutores",
  faturamento: "Faturamento",
  despesas: "Despesas",
  resultado: "Resultado",
  taxas: "Taxas da maquininha",
  depois_das_taxas: "Resultado depois das taxas",
};

/** Os passos na ordem, para a tela, a planilha e o Mozart. `brl` só entra nas frases de apoio. */
export function passosDaCadeia(c: Cadeia, brl: (v: number) => string = (v) => v.toFixed(2).replace(".", ",")): PassoDaCadeia[] {
  const p = (id: PassoDaCadeia["id"], sinal: PassoDaCadeia["sinal"], valor: number, explica: string): PassoDaCadeia =>
    ({ id, sinal, nome: NOME_DO_PASSO[id], valor, explica, total: sinal === "=" });
  return [
    p("recebido", "", c.recebido, "Dinheiro, Pix e cartão que entraram de verdade."),
    p("devolvido", "−", c.devolvido, "O que voltou para os tutores. Não é despesa."),
    p("credito_deixado", "−", c.creditoDeixado, "O dinheiro ficou na loja, mas é do tutor até ele usar."),
    p("credito_usado", "+", c.creditoUsado, "Contas pagas com o crédito que o tutor tinha."),
    p("faturamento", "=", c.faturamento, "O que o negócio vendeu de verdade no período."),
    p("despesas", "−", c.despesas, c.retiradaDoDono > 0 ? `Tudo o que foi pago. A retirada do dono (${brl(c.retiradaDoDono)}) está aqui dentro.` : "Tudo o que foi pago, menos as devoluções."),
    p("resultado", "=", c.resultado, "Faturamento menos despesas."),
    p("taxas", "−", c.taxas, "O que a maquininha ficou de cada pagamento com cartão ou Pix."),
    p("depois_das_taxas", "=", c.resultadoDepoisDasTaxas, "O resultado já sem as taxas da maquininha."),
  ];
}

/** A conta numa linha só, para o Mozart e para a nota de uma planilha: "Recebido 1.047,46 − devolvido 229,90 … = Faturamento 787,46". */
export function cadeiaEmFrase(c: Cadeia, brl: (v: number) => string): string {
  return passosDaCadeia(c, brl).filter((x) => x.total || x.id === "recebido" || x.valor !== 0)
    .map((x) => `${x.sinal ? `${x.sinal} ` : ""}${x.nome} ${brl(x.valor)}`).join(" ");
}

/** O passo com o sinal por extenso ("menos Devolvido aos tutores", "igual a Faturamento"): para planilha, onde célula que começa com = ou + vira fórmula. */
export const passoPorExtenso = (p: PassoDaCadeia) => `${p.sinal === "−" ? "menos " : p.sinal === "+" ? "mais " : p.sinal === "=" ? "igual a " : ""}${p.nome}`;
