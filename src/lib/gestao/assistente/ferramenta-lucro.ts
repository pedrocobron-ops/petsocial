import type Anthropic from "@anthropic-ai/sdk";
import type { Contexto } from "./ferramentas";
import { montarLucro, porLucro, type LinhaLucro, type LucroDoBanco } from "../lucro";

/**
 * Ferramenta de consulta "ver_lucro" do Mozart: "qual serviço dá mais lucro?", "quanto sobrou dos produtos?". É a conta de
 * Relatórios, Quanto sobrou (`lucro_do_periodo`): por serviço e por produto, quantas vezes, o que entrou, o custo, o que
 * sobrou e a %, com "custo não informado" quando falta o custo (nunca margem inventada), e como fecha com o Resultado do
 * Financeiro. Só para quem cuida do financeiro (a lista de ferramentas já esconde de quem não recebe; o banco confere de novo).
 * Só lê.
 */

type Def = Anthropic.Tool & { grava: boolean; financeiro?: boolean };
const DIA = { type: "string", description: "Dia no formato AAAA-MM-DD" };
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

export const FERRAMENTAS_LUCRO: Def[] = [
  { grava: false, financeiro: true, name: "ver_lucro",
    description: "Quanto sobrou por serviço e por produto entre dois dias (inclusive): vezes, quanto entrou (com desconto), custo (material do serviço, custo do produto e, se o dono ligou, a comissão), quanto sobrou em reais e em %. Linha sem custo cadastrado vem com margem null e 'custo não informado': nunca diga que ela dá 100% de lucro. Traz também o resultado do período (entrou − saiu, o mesmo do Financeiro). Use para \"qual serviço dá mais lucro?\". Sem datas, o mês atual.",
    input_schema: { type: "object", properties: { de: DIA, ate: DIA }, required: [], additionalProperties: false } },
];

const linha = (l: LinhaLucro) => ({
  nome: l.nome, tipo: l.tipo, quantidade: l.quantidade, entrou: l.receita,
  custo: l.custo, comissao_da_linha: l.comissao, sobrou: l.margem, sobrou_pct: l.pct == null ? null : Math.round(l.pct * 10) / 10,
  ...(l.custo == null ? { custo_nao_informado: l.falta ?? "custo não informado" } : {}),
  ...(l.devolvido > 0 ? { devolvido_ao_cliente: l.devolvido, unidades_que_voltaram: l.devolvidos } : {}),
});

/** Roda a ferramenta; devolve null quando o nome não é desta lista. Erro de uso: lança Error com a frase para o modelo. */
export async function consultarLucro(c: Contexto, nome: string, e: Record<string, unknown>, erroDeUso: (msg: string) => Error) {
  if (nome !== "ver_lucro") return null;
  if (!c.cuidoDoFinanceiro) throw erroDeUso("Quanto sobrou por serviço é com quem cuida do financeiro (Financeiro ou Relatórios). O dono pode liberar em Equipe.");
  const hoje = c.agora.slice(0, 10);
  const de = typeof e.de === "string" && RE_DIA.test(e.de) ? e.de : `${hoje.slice(0, 8)}01`;
  const ate = typeof e.ate === "string" && RE_DIA.test(e.ate) ? e.ate : hoje;
  if (ate < de) throw erroDeUso("A data final vem depois da inicial.");
  const r = await c.sb.rpc("lucro_do_periodo", { p_petshop: c.petshop.id, p_de: de, p_ate: ate });
  if (r.error) throw erroDeUso(r.error.message);
  const x = montarLucro(r.data as unknown as LucroDoBanco);
  const servicos = porLucro([...x.servicos, ...(x.extras ? [x.extras] : [])]);
  const produtos = porLucro(x.produtos);
  return {
    resultado: {
      de, ate,
      comissao_conta_como_custo: x.comissaoComoCusto,
      servicos_por_lucro: servicos.slice(0, 15).map(linha),
      produtos_por_lucro: produtos.slice(0, 15).map(linha),
      ...(servicos.length > 15 || produtos.length > 15 ? { linhas_no_total: servicos.length + produtos.length } : {}),
      totais: {
        entrou_de_servicos_e_produtos: x.totais.receita, custo_informado: x.totais.custo, sobrou_das_linhas_com_custo: x.totais.margem,
        sobrou_pct: x.totais.pct == null ? null : Math.round(x.totais.pct * 10) / 10,
        linhas_sem_custo: x.totais.linhasSemCusto, entrou_nas_linhas_sem_custo: x.totais.receitaSemCusto,
      },
      financeiro: {
        outros_lancamentos: x.ponte.outros.map((o) => ({ categoria: o.categoria, valor: o.valor })), entrou: x.ponte.entradas,
        devolvido: x.ponte.devolvido, credito_deixado: x.ponte.creditoDeixado, faturamento: x.ponte.faturamento, saiu: x.ponte.saiu, resultado: x.ponte.resultado,
      },
      obs: "Linha com sobrou null não tem custo cadastrado: diga 'custo não informado' e sugira pôr o custo do material em Meu pet shop, Serviços e preços (ou o custo no produto, em Estoque). Compra de mercadoria e comissão paga estão nas saídas do resultado: não some com o custo das linhas.",
      onde_ver: "Relatórios, bloco Quanto sobrou (com Exportar).",
    },
  };
}
