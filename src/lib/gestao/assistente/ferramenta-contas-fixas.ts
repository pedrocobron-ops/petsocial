import type Anthropic from "@anthropic-ai/sdk";
import type { Contexto, Resumo } from "./ferramentas";
import { DIAS_DA_MARGEM, faturamentoComMargem, fraseDaSituacao, FREQUENCIAS, gerarContasFixas, lerResumoContasFixas, lerSituacaoContasFixas, quandoVence, valorPorMes, vencimentoNoMes, type ContaFixa } from "../contas-fixas";
import { montarLucro, type LucroDoBanco } from "../lucro";
import { brl, centavos, centavos as real } from "../util";

/**
 * Contas fixas no Mozart (migração 20261212):
 * - "ver_contas_fixas" (consulta): "quanto eu gasto por mês de conta fixa?". As contas cadastradas, o total por mês (as não
 *   mensais divididas pelos meses), quanto precisa faturar para pagá-las, quanto já entrou no mês e as contas fixas em A pagar.
 * - "valor_conta_fixa" (grava, com o cartão): "a luz deste mês veio R$ 380". Acerta o valor da conta do mês em A pagar (cria a
 *   do mês se ainda não entrou). Conta já paga não muda por aqui.
 * Só para quem cuida do financeiro (o banco confere de novo).
 */

type Def = Anthropic.Tool & { grava: boolean; financeiro?: boolean };
const RE_MES = /^\d{4}-\d{2}$/;
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const frequencia = (f: string) => FREQUENCIAS.find((x) => x.id === f)?.rotulo.toLowerCase() ?? f;
const mesBr = (mes: string) => `${mes.slice(5, 7)}/${mes.slice(0, 4)}`;

export const FERRAMENTAS_CONTAS_FIXAS: Def[] = [
  { grava: false, financeiro: true, name: "ver_contas_fixas",
    description: "Contas fixas do pet shop (aluguel, luz, água, internet, salários, contador, sistema…): cada uma com valor, se o valor muda todo mês, de quanto em quanto tempo vence, o dia e quanto pesa por mês; o total por mês (as não mensais divididas pelos meses), quanto precisa faturar por mês para pagá-las, quanto já entrou no mês e a %, e as contas fixas que estão em A pagar (com conta_fixa_id e mês). Use para \"quanto eu gasto por mês de conta fixa?\" e antes de valor_conta_fixa.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false } },
  { grava: true, financeiro: true, name: "valor_conta_fixa",
    description: "Escreve o valor de verdade da conta fixa de um mês (\"a luz deste mês veio R$ 380\"): muda a conta em A pagar (tira o \"valor estimado\") ou, se ela ainda não entrou, cria a do mês com esse valor. Passe conta_fixa_id (de ver_contas_fixas) e o valor; sem mes, é o mês atual. Conta já paga não muda.",
    input_schema: { type: "object", properties: {
      conta_fixa_id: { type: "string", description: "De ver_contas_fixas" },
      valor: { type: "number" },
      mes: { type: "string", description: "Mês da conta no formato AAAA-MM. Padrão: o mês atual" },
    }, required: ["conta_fixa_id", "valor"], additionalProperties: false } },
  { grava: true, financeiro: true, name: "criar_conta_fixa",
    description: "Cadastra uma conta fixa nova (\"a luz deste mês veio R$ 380\" e ainda não existe Luz em ver_contas_fixas; \"cadastra o aluguel de 1.500 todo dia 5\"). Precisa do nome, do valor e do dia do vencimento (pergunte o dia se a pessoa não disse). valor_varia: true para conta que muda todo mês (luz, água). Depois de cadastrar, se a pessoa disse o valor deste mês, use valor_conta_fixa.",
    input_schema: { type: "object", properties: {
      nome: { type: "string", description: "Ex.: Luz, Aluguel, Internet" },
      valor: { type: "number", description: "Valor da conta (para conta que varia, o valor de um mês comum)" },
      dia: { type: "integer", description: "Dia do vencimento, de 1 a 31" },
      valor_varia: { type: "boolean" },
      frequencia: { type: "string", enum: ["mensal", "trimestral", "semestral", "anual"] },
      categoria: { type: "string", description: "Aluguel, Água, luz e internet, Salários e comissões, Impostos e taxas, Manutenção, Marketing ou Outros" },
    }, required: ["nome", "valor", "dia"], additionalProperties: false } },
];

type Pendente = { id: string; conta_fixa_id: string | null; competencia: string; vencimento: string; valor: number; valor_estimado: boolean; descricao: string | null; pago?: boolean };

/** Consulta; devolve null quando o nome não é desta lista. */
export async function consultarContasFixas(c: Contexto, nome: string, erroDeUso: (msg: string) => Error) {
  if (nome !== "ver_contas_fixas") return null;
  if (!c.cuidoDoFinanceiro) throw erroDeUso("As contas fixas são com o dono e quem cuida do financeiro. O dono pode liberar em Equipe.");
  await gerarContasFixas(c.sb, c.petshop.id);
  const hoje = c.agora.slice(0, 10);
  const mes1 = `${hoje.slice(0, 8)}01`;
  const [a, m] = hoje.split("-").map(Number);
  const fimDoMes = `${hoje.slice(0, 8)}${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
  const desdeMargem = new Date(Date.parse(`${hoje}T12:00:00Z`) - (DIAS_DA_MARGEM - 1) * 864e5).toISOString().slice(0, 10);
  const [contas, pendentes, resumo, situacao, lucro] = await Promise.all([
    c.sb.from("contas_fixas").select("*").eq("petshop_id", c.petshop.id).order("nome").limit(100),
    c.sb.from("lancamentos").select("id, conta_fixa_id, competencia, vencimento, valor, valor_estimado, descricao").eq("petshop_id", c.petshop.id)
      .eq("tipo", "saida").eq("pago", false).not("competencia", "is", null).order("vencimento").limit(50),
    lerResumoContasFixas(c.sb, c.petshop.id),
    // o que aconteceu de verdade com cada conta neste mês (paga, em A pagar, ainda vai entrar, não existe porque começou depois)
    lerSituacaoContasFixas(c.sb, c.petshop.id, mes1, fimDoMes).catch(() => null),
    c.sb.rpc("lucro_do_periodo", { p_petshop: c.petshop.id, p_de: desdeMargem, p_ate: hoje }).then((r) => (r.error ? null : montarLucro(r.data as unknown as LucroDoBanco)), () => null),
  ]);
  if (contas.error) throw erroDeUso(contas.error.message);
  const lista = (contas.data ?? []) as unknown as ContaFixa[];
  const comMargem = lucro ? faturamentoComMargem(resumo.total_mensal, lucro) : null;
  return {
    resultado: {
      total_por_mes: resumo.total_mensal,
      // sem margem confiável, o mínimo é a soma das contas; com margem, contas ÷ margem média (de cada venda só sobra a margem)
      precisa_sobrar_por_mes_depois_do_custo: resumo.total_mensal,
      ...(comMargem
        ? { margem_media_pct: comMargem.pct, precisa_faturar_por_mes: comMargem.faturamento, falta_faturar_no_mes: Math.max(0, centavos((comMargem.faturamento - resumo.faturamento_mes))),
            como_foi_calculado: `contas fixas ÷ margem média dos últimos ${DIAS_DA_MARGEM} dias (estimativa)` }
        : { precisa_faturar_por_mes: resumo.total_mensal, falta_faturar_no_mes: resumo.falta,
            como_foi_calculado: lucro && lucro.produtos.length ? "soma das contas fixas: falta custo informado para descontar a margem; diga que o faturamento real precisa ser maior porque de cada venda só sobra a margem" : "soma das contas fixas" }),
      faturamento_do_mes_ate_hoje: resumo.faturamento_mes,
      pct_das_contas_fixas_ja_faturado: comMargem ? Math.floor((Math.max(0, resumo.faturamento_mes) / comMargem.faturamento) * 100) : resumo.pct,
      ...(situacao ? { este_mes: situacao.map((s) => ({ conta: s.nome, vencimento: s.vencimento, valor: s.valor, situacao: s.situacao, o_que_aconteceu: fraseDaSituacao(s, hoje) })) } : {}),
      contas: lista.map((x) => ({
        conta_fixa_id: x.id, nome: x.nome, valor: Number(x.valor), valor_muda_todo_mes: x.valor_varia, vence: quandoVence(x), frequencia: frequencia(x.frequencia),
        por_mes: real(valorPorMes(x)), categoria: x.categoria, ...(x.forma ? { como_paga: x.forma } : {}),
        situacao: !x.ativa ? "pausada" : x.termina_em && x.termina_em < hoje ? "terminou" : "ativa",
      })),
      em_a_pagar: ((pendentes.data ?? []) as unknown as Pendente[]).map((l) => ({
        conta_fixa_id: l.conta_fixa_id, nome: l.descricao, mes: l.competencia.slice(0, 7), vencimento: l.vencimento, valor: Number(l.valor),
        ...(l.valor_estimado ? { valor_estimado: true } : {}),
      })),
      conta: "Total por mês = soma das contas fixas ativas, com as trimestrais ÷ 3, semestrais ÷ 6 e anuais ÷ 12. Faturamento do mês: a mesma conta de Relatórios.",
      regra: "Para dizer se uma conta deste mês foi paga, use só este_mes.o_que_aconteceu: nunca deduza que está paga porque não aparece em A pagar. Conta com situacao antes_do_inicio não existe neste mês (a conta fixa começou depois do vencimento): diga isso, não que foi paga.",
      onde_ver: "Financeiro, aba Contas fixas (cadastrar, pausar, mudar) e A pagar (a conta de cada mês entra sozinha 10 dias antes do vencimento).",
    },
  };
}

async function planoDoValor(c: Contexto, e: Record<string, unknown>, erroDeUso: (msg: string) => Error) {
  if (!c.cuidoDoFinanceiro) throw erroDeUso("As contas fixas são com o dono e quem cuida do financeiro.");
  const id = typeof e.conta_fixa_id === "string" && RE_UUID.test(e.conta_fixa_id) ? e.conta_fixa_id : null;
  if (!id) throw erroDeUso("conta_fixa_id inválido: use ver_contas_fixas.");
  const valor = typeof e.valor === "number" && Number.isFinite(e.valor) ? real(e.valor) : null;
  if (!valor || valor <= 0) throw erroDeUso("Falta o valor da conta.");
  const mes = typeof e.mes === "string" && RE_MES.test(e.mes) ? e.mes : c.agora.slice(0, 7);
  const { data: conta } = await c.sb.from("contas_fixas").select("*").eq("petshop_id", c.petshop.id).eq("id", id).maybeSingle();
  if (!conta) throw erroDeUso("Conta fixa não encontrada: use ver_contas_fixas.");
  const competencia = `${mes}-01`;
  const { data: l } = await c.sb.from("lancamentos").select("id, valor, valor_estimado, pago, vencimento").eq("petshop_id", c.petshop.id)
    .eq("conta_fixa_id", id).eq("competencia", competencia).maybeSingle();
  if (l?.pago) throw erroDeUso(`A conta de ${conta.nome} de ${mesBr(mes)} já foi paga. Para corrigir o valor, é em Financeiro, Lançamentos.`);
  return { conta: conta as unknown as ContaFixa, valor, mes, competencia, lancamento: l, vencimento: l?.vencimento ?? vencimentoNoMes(competencia, conta.dia) };
}

/** Confere o pedido de conta fixa nova (o banco confere de novo ao salvar). */
function planoDaNova(c: Contexto, e: Record<string, unknown>, erroDeUso: (msg: string) => Error) {
  if (!c.cuidoDoFinanceiro) throw erroDeUso("As contas fixas são com o dono e quem cuida do financeiro.");
  const nome = typeof e.nome === "string" ? e.nome.trim().slice(0, 60) : "";
  if (!nome) throw erroDeUso("Falta o nome da conta (ex.: Luz).");
  const valor = typeof e.valor === "number" && Number.isFinite(e.valor) ? real(e.valor) : null;
  if (!valor || valor <= 0) throw erroDeUso("Falta o valor da conta.");
  const dia = typeof e.dia === "number" && Number.isInteger(e.dia) ? e.dia : null;
  if (!dia || dia < 1 || dia > 31) throw erroDeUso("Falta o dia do vencimento (de 1 a 31): pergunte.");
  const freq = typeof e.frequencia === "string" && FREQUENCIAS.some((f) => f.id === e.frequencia) ? e.frequencia : "mensal";
  const categoria = typeof e.categoria === "string" && e.categoria.trim() ? e.categoria.trim().slice(0, 60) : /luz|agua|água|internet|telefone/i.test(nome) ? "Água, luz e internet" : /aluguel/i.test(nome) ? "Aluguel" : "Outros";
  return { nome, valor, dia, freq, categoria, varia: e.valor_varia === true };
}

/** O cartão de confirmação; null quando o nome não é desta lista. */
export async function descreverContaFixa(c: Contexto, nome: string, e: Record<string, unknown>, erroDeUso: (msg: string) => Error): Promise<Resumo | null> {
  if (nome === "criar_conta_fixa") {
    const n = planoDaNova(c, e, erroDeUso);
    return { titulo: "Cadastrar conta fixa", linhas: [["Conta", n.nome], ["Valor", `${brl(n.valor)}${n.varia ? " (muda todo mês)" : ""}`], ["Vence", n.freq === "mensal" ? `todo dia ${n.dia}` : `dia ${n.dia}, ${frequencia(n.freq)}`], ["Categoria", n.categoria], ["Onde fica", "Financeiro, Contas fixas"]] };
  }
  if (nome !== "valor_conta_fixa") return null;
  const p = await planoDoValor(c, e, erroDeUso);
  const linhas: [string, string][] = [
    ["Conta", p.conta.nome],
    ["Mês", `${mesBr(p.mes)} (vence ${p.vencimento.slice(8, 10)}/${p.vencimento.slice(5, 7)})`],
    ["Valor", brl(p.valor)],
  ];
  if (p.lancamento) linhas.push(["Antes", `${brl(Number(p.lancamento.valor))}${p.lancamento.valor_estimado ? " (estimado)" : ""}`]);
  else linhas.push(["A pagar", "a conta deste mês entra agora em A pagar"]);
  return { titulo: "Valor da conta fixa", linhas };
}

/** Grava (depois do "Pode fazer"); null quando o nome não é desta lista. */
export async function gravarContaFixa(c: Contexto, nome: string, e: Record<string, unknown>, erroDeUso: (msg: string) => Error) {
  if (nome === "criar_conta_fixa") {
    const n = planoDaNova(c, e, erroDeUso);
    const r = await c.sb.rpc("contas_fixas_salvar", { p: c.petshop.id, p_conta: { id: crypto.randomUUID(), nome: n.nome, categoria: n.categoria, dia: n.dia, valor: n.valor, valor_varia: n.varia, frequencia: n.freq } as never });
    if (r.error) throw erroDeUso(r.error.message);
    const x = r.data as { id?: string } | null;
    return { feito: true, conta_fixa_id: x?.id ?? null, conta: n.nome, onde: "Financeiro, Contas fixas", proximo: "Se a pessoa disse o valor deste mês, use valor_conta_fixa com este conta_fixa_id." };
  }
  if (nome !== "valor_conta_fixa") return null;
  const p = await planoDoValor(c, e, erroDeUso);
  const r = await c.sb.rpc("contas_fixas_valor", { p: c.petshop.id, p_conta: p.conta.id, p_mes: p.competencia, p_valor: p.valor });
  if (r.error) throw erroDeUso(r.error.message);
  const x = r.data as { valor: number; vencimento: string; criada: boolean };
  return { feito: true, conta: p.conta.nome, mes: mesBr(p.mes), valor: Number(x.valor), vencimento: x.vencimento, criada_agora: x.criada, onde: "Financeiro, A pagar" };
}
