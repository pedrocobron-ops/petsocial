import type Anthropic from "@anthropic-ai/sdk";
import type { Contexto, Resumo } from "./ferramentas";
import { gerarContasFixas } from "../contas-fixas";
import { brl } from "../util";

/**
 * Pagar uma conta que já está em A pagar, pelo Mozart (rodada 9): "paguei a luz hoje no pix".
 * Antes o Mozart só sabia lançar uma saída solta: a conta fixa continuava aberta em A pagar e, quando a pessoa tocava em
 * Paguei, a despesa contava duas vezes.
 * - "ver_contas_a_pagar" (consulta): o que está em A pagar (com as contas fixas do mês), cada uma com conta_id.
 * - "pagar_conta" (grava, com o cartão): dá baixa numa conta de A pagar, uma vez só. Com `valor`, acerta o valor antes da baixa.
 * - `conferirSeEContaAPagar`: saída solta (lancar_dinheiro) que parece ser uma conta de A pagar é recusada, com o conta_id certo.
 * Só para quem cuida do financeiro (o banco confere de novo).
 */

type Def = Anthropic.Tool & { grava: boolean; financeiro?: boolean };
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const FORMAS: Record<string, string> = { pix: "Pix", dinheiro: "Dinheiro", debito: "Débito", credito: "Crédito", outro: "Outro" };
const real = (n: number) => Math.round(n * 100) / 100;
const dataBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const palavras = (s: string) => semAcento(s).replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter((w) => w.length >= 3 && !["conta", "contas", "paguei", "pagamento", "mes", "deste", "desse", "hoje", "pix", "dinheiro", "debito", "credito", "para", "com"].includes(w));

export const FERRAMENTAS_PAGAR_CONTA: Def[] = [
  { grava: false, financeiro: true, name: "ver_contas_a_pagar",
    description: "Contas a pagar em aberto (A pagar, no Financeiro), com as contas fixas do mês (luz, aluguel, internet, salários…): cada uma com conta_id, nome, categoria, vencimento e valor. Use sempre que a pessoa disser que pagou uma conta do pet shop (\"paguei a luz\", \"paguei o aluguel\", \"paguei o fornecedor\"), antes de pagar_conta.",
    input_schema: { type: "object", properties: {}, required: [], additionalProperties: false } },
  { grava: true, financeiro: true, name: "pagar_conta",
    description: "Dá baixa numa conta que já está em A pagar (\"paguei a luz hoje no pix\"): a conta sai de A pagar e vira saída paga, uma vez só. Passe conta_id (de ver_contas_a_pagar) e a forma. valor: só se a pessoa disse um valor diferente do que está na conta (o valor é acertado antes da baixa). dia: AAAA-MM-DD, só se pagou em outro dia (padrão: hoje). NUNCA use lancar_dinheiro para pagar uma conta que está em A pagar: a despesa contaria duas vezes. Conta fixa que ainda não entrou em A pagar (do mês que vem, ou que vence daqui a mais de 10 dias): use antes valor_conta_fixa com o mês, que cria a conta do mês em A pagar, e depois pagar_conta.",
    input_schema: { type: "object", properties: {
      conta_id: { type: "string", description: "De ver_contas_a_pagar" },
      forma: { type: "string", enum: ["pix", "dinheiro", "debito", "credito", "outro"] },
      valor: { type: "number", description: "Só se o valor pago é diferente do que está na conta" },
      dia: { type: "string", description: "Dia em que pagou, AAAA-MM-DD. Padrão: hoje" },
    }, required: ["conta_id", "forma"], additionalProperties: false } },
];

type Aberta = { id: string; valor: number; descricao: string | null; categoria: string; vencimento: string | null; data: string; conta_fixa_id: string | null; competencia: string | null; valor_estimado: boolean | null };

async function lerAbertas(c: Contexto): Promise<Aberta[]> {
  const r = await c.sb.from("lancamentos").select("id, valor, descricao, categoria, vencimento, data, conta_fixa_id, competencia, valor_estimado")
    .eq("petshop_id", c.petshop.id).eq("tipo", "saida").eq("pago", false).order("vencimento").limit(200);
  if (r.error) throw new Error(r.error.message);
  return ((r.data ?? []) as unknown as Aberta[]).map((l) => ({ ...l, valor: Number(l.valor) }));
}
const nomeDa = (l: Pick<Aberta, "descricao" | "categoria">) => l.descricao?.trim() || l.categoria;

/** Consulta; devolve null quando o nome não é desta lista. */
export async function consultarContasAPagar(c: Contexto, nome: string, erroDeUso: (msg: string) => Error) {
  if (nome !== "ver_contas_a_pagar") return null;
  if (!c.cuidoDoFinanceiro) throw erroDeUso("As contas a pagar são com o dono e quem cuida do financeiro. O dono pode liberar em Equipe.");
  // as contas fixas do mês entram em A pagar aqui (como ao abrir o Financeiro)
  await gerarContasFixas(c.sb, c.petshop.id).catch(() => undefined);
  const abertas = await lerAbertas(c);
  const hoje = c.agora.slice(0, 10);
  return {
    resultado: {
      total: real(abertas.reduce((t, l) => t + l.valor, 0)),
      contas: abertas.map((l) => ({
        conta_id: l.id, nome: nomeDa(l), categoria: l.categoria, vencimento: l.vencimento ?? l.data, valor: l.valor,
        ...(l.vencimento && l.vencimento < hoje ? { atrasada: true } : {}),
        ...(l.conta_fixa_id ? { conta_fixa: true, mes: l.competencia?.slice(0, 7) } : {}),
        ...(l.valor_estimado ? { valor_estimado: true } : {}),
      })),
      regra: "Para dar baixa, use pagar_conta com o conta_id. Se a conta que a pessoa pagou não está aqui e é uma conta fixa (ver_contas_fixas), crie a do mês com valor_conta_fixa e depois pagar_conta. Só use lancar_dinheiro para despesa que não está nem em A pagar nem nas contas fixas.",
      onde_ver: "Financeiro, A pagar.",
    },
  };
}

/** Uma saída já paga no mesmo mês, da mesma categoria e de valor perto: pode ser a mesma conta lançada antes como saída solta. */
async function parecidaPaga(c: Contexto, l: Aberta, valor: number, dia: string) {
  const [a, m] = dia.split("-").map(Number);
  const de = `${dia.slice(0, 7)}-01`, ate = `${dia.slice(0, 8)}${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
  const folga = Math.max(1, valor * 0.1);
  const r = await c.sb.from("lancamentos").select("id, valor, descricao, categoria, data").eq("petshop_id", c.petshop.id).eq("tipo", "saida").eq("pago", true).is("movimento", null)
    .eq("categoria", l.categoria).neq("id", l.id).gte("data", de).lte("data", ate).gte("valor", valor - folga).lte("valor", valor + folga).order("data", { ascending: false }).limit(1);
  return r.data?.[0] ?? null;
}

async function plano(c: Contexto, e: Record<string, unknown>, erroDeUso: (msg: string) => Error) {
  if (!c.cuidoDoFinanceiro) throw erroDeUso("Dar baixa em conta a pagar é com o dono e quem cuida do financeiro.");
  const id = typeof e.conta_id === "string" && RE_UUID.test(e.conta_id) ? e.conta_id : null;
  if (!id) throw erroDeUso("conta_id inválido: use ver_contas_a_pagar.");
  const forma = typeof e.forma === "string" && FORMAS[e.forma] ? e.forma : null;
  if (!forma) throw erroDeUso("Falta a forma de pagamento: pergunte (Pix, dinheiro, débito ou crédito).");
  const hoje = c.agora.slice(0, 10);
  const dia = typeof e.dia === "string" && RE_DIA.test(e.dia) ? e.dia : hoje;
  if (dia > hoje) throw erroDeUso("O dia do pagamento não pode ser no futuro. Para uma conta que ainda vai ser paga, não dê baixa.");
  const r = await c.sb.from("lancamentos").select("id, valor, descricao, categoria, vencimento, data, conta_fixa_id, competencia, valor_estimado, tipo, pago")
    .eq("petshop_id", c.petshop.id).eq("id", id).maybeSingle();
  const l = r.data as unknown as (Aberta & { tipo: string; pago: boolean }) | null;
  if (!l || l.tipo !== "saida") throw erroDeUso("Conta a pagar não encontrada: use ver_contas_a_pagar.");
  if (l.pago) throw erroDeUso(`${nomeDa(l)} já estava paga. Nada foi feito.`);
  const antes = Number(l.valor);
  const valor = typeof e.valor === "number" && Number.isFinite(e.valor) && e.valor > 0 ? real(e.valor) : antes;
  if (valor > 99999999) throw erroDeUso("Confira o valor.");
  const parecida = await parecidaPaga(c, { ...l, valor: antes }, valor, dia);
  return { conta: { ...l, valor: antes }, forma, dia, hoje, valor, mudou: Math.abs(valor - antes) > 0.005, parecida };
}

/** O cartão de confirmação; null quando o nome não é desta lista. */
export async function descreverPagarConta(c: Contexto, nome: string, e: Record<string, unknown>, erroDeUso: (msg: string) => Error): Promise<Resumo | null> {
  if (nome !== "pagar_conta") return null;
  const p = await plano(c, e, erroDeUso);
  const linhas: [string, string][] = [
    ["Conta", `${nomeDa(p.conta)}${p.conta.competencia ? ` (${p.conta.competencia.slice(5, 7)}/${p.conta.competencia.slice(0, 4)})` : ""}`],
    ["Vencimento", dataBr(p.conta.vencimento ?? p.conta.data)],
    ["Valor", p.mudou ? `${brl(p.valor)} (estava ${brl(p.conta.valor)}${p.conta.valor_estimado ? ", estimado" : ""})` : brl(p.valor)],
    ["Forma", FORMAS[p.forma]],
    ["Pago em", p.dia === p.hoje ? "hoje" : dataBr(p.dia)],
    ["O que acontece", "a conta sai de A pagar e vira saída paga (uma vez só)"],
  ];
  if (p.parecida) linhas.push(["Atenção", `já existe uma saída parecida paga neste mês: ${p.parecida.descricao?.trim() || p.parecida.categoria}, ${brl(Number(p.parecida.valor))}, em ${dataBr(p.parecida.data)}. Se for esta mesma conta, apague aquela saída em Financeiro, Lançamentos, para não contar duas vezes`]);
  return { titulo: "Dar baixa em conta a pagar", linhas };
}

/** Grava (depois do "Pode fazer"); null quando o nome não é desta lista. */
export async function gravarPagarConta(c: Contexto, nome: string, e: Record<string, unknown>, erroDeUso: (msg: string) => Error) {
  if (nome !== "pagar_conta") return null;
  const p = await plano(c, e, erroDeUso);
  // o valor pago é diferente do anotado: acerta a conta antes (conta fixa pelo caminho dela, que tira o "valor estimado")
  if (p.mudou) {
    if (p.conta.conta_fixa_id && p.conta.competencia) {
      const v = await c.sb.rpc("contas_fixas_valor", { p: c.petshop.id, p_conta: p.conta.conta_fixa_id, p_mes: p.conta.competencia, p_valor: p.valor });
      if (v.error) throw erroDeUso(v.error.message);
    } else {
      const v = await c.sb.from("lancamentos").update({ valor: p.valor }).eq("petshop_id", c.petshop.id).eq("id", p.conta.id).eq("pago", false).select("id");
      if (v.error) throw erroDeUso(v.error.message);
    }
  }
  // só entra no caixa aberto quando o dinheiro saiu hoje (igual ao "Paguei" de A pagar)
  const caixa = p.dia === p.hoje ? (await c.sb.from("caixas").select("id").eq("petshop_id", c.petshop.id).is("fechado_em", null).maybeSingle()).data?.id ?? null : null;
  const r = await c.sb.from("lancamentos").update({ pago: true, data: p.dia, forma: p.forma, pagamentos: null, caixa_id: caixa })
    .eq("petshop_id", c.petshop.id).eq("id", p.conta.id).eq("pago", false).select("id");
  if (r.error) throw erroDeUso(r.error.message);
  if (!r.data?.length) throw erroDeUso(`${nomeDa(p.conta)} já tinha sido baixada. Nada foi feito de novo.`);
  return {
    feito: true, conta: nomeDa(p.conta), valor: p.valor, forma: FORMAS[p.forma], pago_em: p.dia, saiu_de: "A pagar",
    ...(p.parecida ? { atencao: `Existe outra saída parecida paga neste mês (${p.parecida.descricao?.trim() || p.parecida.categoria}, ${brl(Number(p.parecida.valor))}, em ${dataBr(p.parecida.data)}). Se for a mesma conta, diga para apagar aquela em Financeiro, Lançamentos.` } : {}),
    onde: "Financeiro, Lançamentos",
  };
}

/**
 * Saída solta (lancar_dinheiro) que parece ser uma conta de A pagar ou uma conta fixa: recusa e manda usar pagar_conta
 * (senão a despesa conta agora e de novo quando derem baixa na conta). Vale quando a descrição cita o nome da conta, ou
 * quando a categoria é a mesma e o valor é perto (até 10%). `nao_e_conta_a_pagar: true` passa direto.
 */
export async function conferirSeEContaAPagar(c: Contexto, e: Record<string, unknown>, erroDeUso: (msg: string) => Error) {
  if (e.tipo !== "saida" || e.nao_e_conta_a_pagar === true || !c.cuidoDoFinanceiro) return;
  const valor = typeof e.valor === "number" && Number.isFinite(e.valor) ? e.valor : 0;
  const categoria = typeof e.categoria === "string" ? e.categoria.trim() : "";
  const frase = ` ${palavras(typeof e.descricao === "string" ? e.descricao : "").join(" ")} `;
  const cita = (nome: string) => palavras(nome).some((w) => frase.includes(` ${w} `));
  await gerarContasFixas(c.sb, c.petshop.id).catch(() => undefined);
  const abertas = await lerAbertas(c);
  const folga = Math.max(1, valor * 0.1);
  const suspeitas = abertas.filter((l) => (frase.trim() && cita(nomeDa(l))) || (categoria && l.categoria === categoria && Math.abs(l.valor - valor) <= folga));
  if (suspeitas.length) {
    const lista = suspeitas.slice(0, 5).map((l) => `${nomeDa(l)} (conta_id ${l.id}), ${brl(l.valor)}, vence ${dataBr(l.vencimento ?? l.data)}`).join("; ");
    throw erroDeUso(`Nada foi lançado: em A pagar ${suspeitas.length === 1 ? "existe a conta" : "existem as contas"} ${lista}. Se foi ${suspeitas.length === 1 ? "esta conta" : "uma destas"} que a pessoa pagou, use pagar_conta com o conta_id (e valor, se o valor pago for outro): a conta sai de A pagar e a despesa conta uma vez só. Lançar como saída solta deixaria a conta aberta e contaria a despesa duas vezes. Só use lancar_dinheiro de novo, com nao_e_conta_a_pagar: true, se a pessoa disser que é outra despesa.`);
  }
  // conta fixa citada que ainda não está em A pagar (do mês que vem, ou vence daqui a mais de 10 dias)
  if (!frase.trim()) return;
  const fixas = await c.sb.from("contas_fixas").select("id, nome, ativa").eq("petshop_id", c.petshop.id).limit(100);
  const citadas = ((fixas.data ?? []) as { id: string; nome: string; ativa: boolean }[]).filter((x) => x.ativa && cita(x.nome));
  if (!citadas.length) return;
  throw erroDeUso(`Nada foi lançado: ${citadas.map((x) => `${x.nome} (conta_fixa_id ${x.id})`).join(", ")} é conta fixa. Se a pessoa pagou a conta de um mês, use valor_conta_fixa com o conta_fixa_id, o valor e o mês (cria a conta do mês em A pagar) e depois pagar_conta: assim a conta do mês não fica aberta nem conta duas vezes. Só use lancar_dinheiro de novo, com nao_e_conta_a_pagar: true, se a pessoa disser que é outra despesa.`);
}
