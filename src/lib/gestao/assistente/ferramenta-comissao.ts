import type Anthropic from "@anthropic-ai/sdk";
import type { Contexto } from "./ferramentas";

/**
 * Ferramenta de consulta "ver_comissao" do Mozart: a comissão de cada pessoa num período, separada por pessoa, com os
 * serviços e os produtos, o que já foi pago e o que falta, e a lista linha por linha (atendimento, serviço, base, %, valor).
 * A conta é a do banco (`comissao_extrato`, a mesma soma de Relatórios e de "Minha comissão"). Quem não cuida do financeiro
 * recebe só a própria comissão (o banco garante, seja qual for a pessoa pedida). Só lê: não paga nada.
 * Quem não tem Caixa, Financeiro nem Relatórios recebe só o TOTAL do mês e a quantidade de atendimentos (o banco entrega a base,
 * o percentual e o valor de cada linha vazios, e conta sempre o mês inteiro): o valor de uma linha dividido pelo percentual daria
 * o preço do serviço. O dono libera os valores por linha em Meu pet shop (opção "comissao.mostrar_valores").
 */

type Def = Anthropic.Tool & { grava: boolean; financeiro?: boolean };
const DIA = { type: "string", description: "Dia no formato AAAA-MM-DD" };
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

export const FERRAMENTAS_COMISSAO: Def[] = [
  { grava: false, name: "ver_comissao",
    description: "Comissão da equipe entre dois dias (inclusive), separada por pessoa: atendimentos, base, comissão de serviços e de produtos, total, quanto já foi pago e quanto falta pagar, e a lista linha por linha (dia, pet, serviço, base, percentual, valor). É a mesma conta de Relatórios. Sem datas, o mês atual. Com profissional_id, só aquela pessoa. Quem não cuida do financeiro vê só a própria comissão; quem não mexe com dinheiro recebe só o total do mês inteiro e quantos atendimentos foram, sem base, percentual nem valor por atendimento.",
    input_schema: { type: "object", properties: { de: DIA, ate: DIA, profissional_id: { type: "string", description: "Opcional: id da pessoa (da lista da equipe)" } }, required: [], additionalProperties: false } },
];

type Linha = { inicio: string; pet: string | null; servico: string; tipo: string; base: number | null; pct: number | null; valor: number | null };
type Pessoa = {
  profissional_id: string; nome: string; atendimentos: number; com_pacote: number; base: number | null; base_produtos: number | null;
  comissao_servicos: number | null; comissao_produtos: number | null; comissao: number; pago: number;
  /** só o total (o banco esvaziou base, percentual e linhas) e o período que o banco de fato contou (mês inteiro) */
  so_total?: boolean; de?: string; ate?: string;
  pagamentos: { de: string; ate: string; valor: number; pago_em: string }[]; linhas: Linha[];
};

const real = (n: unknown) => Math.round(Number(n ?? 0) * 100) / 100;
const diaLocal = (iso: string, fusoMin: number) => new Date(new Date(iso).getTime() + fusoMin * 60000).toISOString().slice(0, 10);

/** Roda a ferramenta; devolve null quando o nome não é desta lista. Erro de uso: lança Error com a frase para o modelo. */
export async function consultarComissao(c: Contexto, nome: string, e: Record<string, unknown>, erroDeUso: (msg: string) => Error) {
  if (nome !== "ver_comissao") return null;
  const hoje = c.agora.slice(0, 10);
  const de = typeof e.de === "string" && RE_DIA.test(e.de) ? e.de : `${hoje.slice(0, 8)}01`;
  const ate = typeof e.ate === "string" && RE_DIA.test(e.ate) ? e.ate : hoje;
  if (ate < de) throw erroDeUso("A data final vem depois da inicial.");
  const pedido = typeof e.profissional_id === "string" && e.profissional_id ? e.profissional_id : null;
  if (pedido && !c.equipe.some((p) => p.id === pedido)) throw erroDeUso("profissional_id inválido: use os ids da lista da equipe.");
  const r = await c.sb.rpc("comissao_extrato", { p_petshop: c.petshop.id, p_de: de, p_ate: ate, ...(pedido ? { p_profissional: pedido } : {}) });
  if (r.error) throw erroDeUso(r.error.message);
  const pessoas = (Array.isArray(r.data) ? r.data : []) as unknown as Pessoa[];
  const soEu = !c.cuidoDoFinanceiro;
  // só o total: o banco já esvaziou os valores; aqui nenhum campo de base, percentual ou valor por linha chega ao modelo
  const soTotal = pessoas.some((p) => p.so_total);
  const deContado = soTotal ? pessoas[0]?.de ?? de : de, ateContado = soTotal ? pessoas[0]?.ate ?? ate : ate;
  return {
    resultado: {
      de: deContado, ate: ateContado,
      ...(soEu ? { aviso: "Quem fala não cuida do financeiro: aparece só a própria comissão." } : {}),
      ...(soTotal ? { so_total: "Esta pessoa não mexe com dinheiro: aparece só o total da comissão do mês inteiro e quantos atendimentos foram. A base, o percentual e o valor de cada atendimento ficam com quem cuida do financeiro. Não calcule nem estime o preço de um serviço nem o valor de um atendimento a partir do total; se perguntarem, diga que isso é com o dono." } : {}),
      ...(soEu && pedido && pedido !== c.eu.id ? { recusado: "A comissão de outra pessoa é só com quem cuida do financeiro." } : {}),
      total_da_equipe: soEu ? undefined : real(pessoas.reduce((t, p) => t + Number(p.comissao), 0)),
      pessoas: pessoas.map((p) => {
        const pago = real(p.pago);
        // pagamento que passa das datas pedidas não dá para descontar daqui: avisa em vez de inventar o que falta
        const passa = p.pagamentos.some((g) => g.de < deContado || g.ate > ateContado);
        const comum = {
          nome: p.nome, profissional_id: p.profissional_id, atendimentos: p.atendimentos, com_pacote: p.com_pacote, comissao_total: real(p.comissao),
          ja_pago: pago, falta_pagar: passa ? null : real(Number(p.comissao) - pago),
          ...(passa ? { obs_pagamento: "Há pagamento que passa destas datas: veja o que falta em Relatórios, com um período que inclua o pagamento inteiro." } : {}),
          pagamentos: p.pagamentos.map((g) => ({ de: g.de, ate: g.ate, valor: real(g.valor), pago_em: diaLocal(g.pago_em, c.fusoMin) })),
          ...(p.linhas.length > 60 ? { linhas_no_total: p.linhas.length } : {}),
        };
        if (p.so_total) return { ...comum, linhas: p.linhas.slice(0, 60).map((l) => ({ dia: diaLocal(l.inicio, c.fusoMin), pet: l.pet, item: l.servico })) };
        return {
          ...comum,
          base_servicos: real(p.base), comissao_servicos: real(p.comissao_servicos),
          base_produtos: real(p.base_produtos), comissao_produtos: real(p.comissao_produtos),
          linhas: p.linhas.slice(0, 60).map((l) => ({ dia: diaLocal(l.inicio, c.fusoMin), pet: l.pet, item: l.servico, base: real(l.base), pct: Number(l.pct), valor: real(l.valor) })),
        };
      }),
      onde_ver: soTotal ? "Minha comissão, na tela Hoje (o total do mês e quantos atendimentos)."
        : "Relatórios, bloco Comissão por profissional (toque na pessoa para ver linha por linha). Cada pessoa vê a sua em Minha comissão, na tela Hoje.",
    },
  };
}
