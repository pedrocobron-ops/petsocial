import type { Banco } from "./supabase";
import { itensDoLancamento, partesDoLancamento } from "./dinheiro";

/**
 * Mais de um serviço no mesmo horário (Banho + Hidratação + Corte de unha).
 * O serviço principal continua em `agendamentos.servico_id` e `agendamentos.preco`; os outros ficam em
 * `agendamento_servicos`, cada um com o seu preço. Horário com um serviço só não tem nada lá e segue como sempre.
 */

/** Um serviço a mais de um horário, como vem junto do agendamento. */
export type ServicoAMais = {
  id: string; servico_id: string; preco: number | null; ordem: number;
  servicos: { id: string; nome: string; cor: string | null; categoria?: string | null } | null;
};
/** O mínimo para pôr os outros serviços em ordem (algumas leituras não trazem o id do serviço). */
type NaOrdem = { ordem: number; servico_id?: string };
type ComServicos = { servicos?: { nome: string } | null; agendamento_servicos?: (NaOrdem & { servicos: { nome: string } | null })[] | null };
const emOrdem = <T extends NaOrdem>(lista: T[] | null | undefined): T[] =>
  [...(lista ?? [])].sort((x, y) => x.ordem - y.ordem || ((x.servico_id ?? "") < (y.servico_id ?? "") ? -1 : 1));

/** O pedaço do `select` que traz os outros serviços do horário. */
export const SELECT_SERVICOS_A_MAIS = "agendamento_servicos(id, servico_id, preco, ordem, servicos(id, nome, cor, categoria))";

/** Os outros serviços do horário, na ordem em que foram juntados (a mesma ordem que o banco usa nas contas). */
export function servicosAMais<T extends NaOrdem = ServicoAMais>(a: { agendamento_servicos?: T[] | null } | null | undefined): T[] {
  return emOrdem(a?.agendamento_servicos);
}

/** "Banho + Hidratação + Corte de unha" (o principal na frente). Sem serviço nenhum, devolve null. */
export function nomeDosServicos(a: ComServicos | null | undefined, junta = " + "): string | null {
  const nomes = [a?.servicos?.nome, ...servicosAMais(a).map((s) => s.servicos?.nome)].filter((n): n is string => Boolean(n));
  return nomes.length ? nomes.join(junta) : null;
}

/** "Banho, Hidratação e Corte de unha": os serviços por extenso, para as mensagens. */
export function servicosPorExtenso(a: ComServicos | null | undefined): string | null {
  const nomes = [a?.servicos?.nome, ...servicosAMais(a).map((s) => s.servicos?.nome)].filter((n): n is string => Boolean(n));
  if (nomes.length < 2) return nomes[0] ?? null;
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

const emCentavos = (n: number | null | undefined) => Math.round(Number(n ?? 0) * 100);

/** O valor combinado do horário inteiro: o serviço principal mais os outros. Sem valor nenhum, null. */
export function valorDoHorario(a: { preco: number | null; agendamento_servicos?: (NaOrdem & { preco: number | null })[] | null }): number | null {
  const outros = servicosAMais(a);
  if (a.preco == null && !outros.some((s) => s.preco != null)) return null;
  return (emCentavos(a.preco) + outros.reduce((t, s) => t + emCentavos(s.preco), 0)) / 100;
}

/** O que a conta de um horário precisa saber dele. */
export type HorarioDaConta = {
  servico_id: string | null; preco: number | null; pacote_cliente_id: string | null;
  agendamento_servicos?: { servico_id: string; preco: number | null; ordem: number }[] | null;
};
/** A conta do atendimento (a que já foi recebida ou a que o cliente paga depois), pelo valor cheio. */
export type ContaDoHorario = { valor: number; itens?: unknown };
/** Quanto foi cobrado por um serviço de um horário. `servicoId` null: horário sem serviço escolhido. */
export type ParteDoServico = { servicoId: string | null; valor: number; principal: boolean };

/**
 * Divide a parte de serviço de uma conta entre os serviços do horário. É a mesma conta do banco (partes_por_servico):
 * - peso de cada serviço: o valor da linha dele na conta (linha sem `servico_id`, ou de um serviço que não está mais
 *   no horário, é do principal);
 * - conta sem itens: pesa pelo preço combinado na agenda (com pacote, o principal fica de fora);
 * - cada parte em centavos; o centavo que sobra vai para a maior (empate: a primeira, com o principal na frente).
 * A soma das partes é sempre a parte de serviço da conta.
 */
export function partesPorServico(a: HorarioDaConta, conta: ContaDoHorario): ParteDoServico[] {
  const outros = emOrdem(a.agendamento_servicos);
  const partes = partesDoLancamento(conta);
  const total = emCentavos(partes ? partes.servico : conta.valor);
  const ids: (string | null)[] = [a.servico_id, ...outros.map((s) => s.servico_id)];
  const pesos = ids.map(() => 0);
  if (partes) {
    for (const i of itensDoLancamento(conta)) {
      if (i.tipo !== "servico") continue;
      const pos = i.servico_id ? ids.indexOf(i.servico_id, 1) : -1;
      pesos[pos > 0 ? pos : 0] += Math.max(0, Math.round(i.qtd * i.valor * 100));
    }
  } else {
    if (!a.pacote_cliente_id) pesos[0] = emCentavos(a.preco);
    outros.forEach((s, i) => { pesos[i + 1] = emCentavos(s.preco); });
  }
  const soma = pesos.reduce((t, p) => t + p, 0);
  if (soma <= 0) return [{ servicoId: ids[0], valor: total / 100, principal: true }];
  let maior = 0;
  pesos.forEach((p, i) => { if (p > pesos[maior]) maior = i; });
  // divisão em centavos inteiros, arredondando a metade para cima (como o banco)
  const dividir = (peso: number) => {
    const n = total * peso, q = Math.floor(n / soma), resto = n - q * soma;
    return resto * 2 >= soma ? q + 1 : q;
  };
  const valores = pesos.map(dividir);
  valores[maior] += total - valores.reduce((t, v) => t + v, 0);
  return valores.map((v, i) => ({ servicoId: ids[i], valor: v / 100, principal: i === 0 })).filter((p, i) => p.valor !== 0 || i === maior);
}

/**
 * Quanto foi realmente cobrado por cada serviço de um atendimento concluído (a soma é o que os relatórios chamam de
 * "valor cobrado" do atendimento):
 * - com conta fechada (recebida ou a receber): a parte de serviço da conta, dividida entre os serviços;
 * - pago com pacote: o principal não soma (o dinheiro entrou na venda do pacote);
 * - sem conta ainda: o preço combinado na agenda.
 */
export function cobradoPorServico(a: HorarioDaConta, conta: ContaDoHorario | undefined): ParteDoServico[] {
  const outros = emOrdem(a.agendamento_servicos);
  if (!outros.length) {
    const valor = conta ? partesDoLancamento(conta)?.servico ?? Number(conta.valor) : a.pacote_cliente_id ? 0 : Number(a.preco ?? 0);
    return [{ servicoId: a.servico_id, valor, principal: true }];
  }
  if (conta) {
    const partes = partesPorServico(a, conta);
    // o principal aparece sempre (mesmo com zero, quando foi pelo pacote), para contar a vez dele
    return partes.some((p) => p.principal) ? partes : [{ servicoId: a.servico_id, valor: 0, principal: true }, ...partes];
  }
  return [
    { servicoId: a.servico_id, valor: a.pacote_cliente_id ? 0 : Number(a.preco ?? 0), principal: true },
    ...outros.map((s) => ({ servicoId: s.servico_id, valor: Number(s.preco ?? 0), principal: false })),
  ];
}

/** Um serviço a mais para gravar: qual é e quanto custa neste horário. */
export type ServicoParaGravar = { servico_id: string; preco: number | null };

/**
 * Deixa os outros serviços de um horário iguais à lista (tira os que saíram, junta os novos, acerta o preço).
 * O banco faz tudo de uma vez e confere quem pode (atendimento concluído ou pago tem as mesmas travas do horário).
 */
export async function definirServicosAMais(sb: Banco, agendamentoId: string, lista: ServicoParaGravar[]) {
  const { error } = await sb.rpc("agendamento_servicos_definir", { p_agendamento: agendamentoId, p_servicos: lista });
  if (error) throw new Error(error.message);
}

/** Junta os mesmos serviços a mais em vários horários recém-marcados (uma repetição). */
export async function juntarServicosAMais(sb: Banco, petshopId: string, agendamentoIds: string[], lista: ServicoParaGravar[]) {
  if (!lista.length || !agendamentoIds.length) return;
  const linhas = agendamentoIds.flatMap((agendamento_id) => lista.map((s, i) => ({ petshop_id: petshopId, agendamento_id, servico_id: s.servico_id, preco: s.preco, ordem: i + 1 })));
  const { error } = await sb.from("agendamento_servicos").insert(linhas).select("id");
  if (error) throw new Error(error.message);
}
