import type Anthropic from "@anthropic-ai/sdk";
import type { Contexto } from "./ferramentas";

/**
 * Mozart: "quanto eu dei de desconto este mês?". A mesma lista de Financeiro, Alterações (função `alteracoes_do_periodo`,
 * com o que a própria pessoa fez): o desconto dado na venda e a venda ou o horário com preço abaixo da lista, somados por tipo
 * e por pessoa. Só para quem cuida do financeiro (o banco confere de novo). Só lê.
 */
export const FERRAMENTA_DESCONTOS: Anthropic.Tool & { grava: false; financeiro: true } = {
  grava: false, financeiro: true,
  name: "ver_descontos",
  description: "Descontos dados entre dois dias (inclusive): o desconto na hora de receber e o que foi vendido ou marcado abaixo do preço da lista, com o total de cada um, quantas vezes, quem deu e as últimas linhas. É a mesma lista de Financeiro, Alterações. Use para \"quanto eu dei de desconto este mês?\". Sem datas, o mês atual.",
  input_schema: { type: "object", additionalProperties: false, required: [], properties: { de: { type: "string", description: "AAAA-MM-DD" }, ate: { type: "string", description: "AAAA-MM-DD" } } },
};

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const real = (n: number) => Math.round(n * 100) / 100;
type Linha = { tipo: string; quando: string; quem_nome: string | null; descricao: string; de: number | null; para: number | null };

export async function consultarDescontos(c: Contexto, nome: string, e: Record<string, unknown>, erro: (m: string) => Error): Promise<{ resultado: unknown } | null> {
  if (nome !== "ver_descontos") return null;
  if (!c.cuidoDoFinanceiro) throw erro("Os descontos dados são com quem cuida do financeiro (Financeiro ou Relatórios). O dono pode liberar em Equipe.");
  const hoje = c.agora.slice(0, 10);
  const de = typeof e.de === "string" && RE_DIA.test(e.de) ? e.de : `${hoje.slice(0, 8)}01`;
  const ate = typeof e.ate === "string" && RE_DIA.test(e.ate) ? e.ate : hoje;
  if (ate < de) throw erro("A data final vem depois da inicial.");
  // o período em horário local do pet shop, como a tela
  const desde = new Date(Date.parse(`${de}T00:00:00Z`) - c.fusoMin * 60000).toISOString();
  const fim = new Date(Date.parse(`${ate}T00:00:00Z`) + 864e5 - 1 - c.fusoMin * 60000).toISOString();
  const r = await c.sb.rpc("alteracoes_do_periodo", { p: c.petshop.id, p_desde: desde, p_ate: fim, p_minhas: true });
  if (r.error) throw erro("Não consegui ler as alterações agora.");
  const linhas = ((r.data ?? []) as Linha[]).map((x) => ({ ...x, de: x.de == null ? null : Number(x.de), para: x.para == null ? null : Number(x.para) }));
  const quanto = (x: Linha) => (x.de != null && x.para != null ? real(Math.max(0, x.de - x.para)) : 0);
  const descontos = linhas.filter((x) => x.tipo === "desconto" && quanto(x) > 0);
  const abaixo = linhas.filter((x) => (x.tipo === "preco" || x.tipo === "preco_agenda") && quanto(x) > 0);
  const soma = (l: Linha[]) => real(l.reduce((t, x) => t + quanto(x), 0));
  const porPessoa = new Map<string, number>();
  for (const x of [...descontos, ...abaixo]) { const q = x.quem_nome?.trim() || "alguém da equipe"; porPessoa.set(q, real((porPessoa.get(q) ?? 0) + quanto(x))); }
  const dia = (iso: string) => new Date(new Date(iso).getTime() + c.fusoMin * 60000).toISOString().slice(0, 10);
  return {
    resultado: {
      de, ate,
      desconto_na_hora_de_receber: { total: soma(descontos), vezes: descontos.length },
      vendido_abaixo_da_lista: { total: soma(abaixo), vezes: abaixo.length },
      total_dos_dois: real(soma(descontos) + soma(abaixo)),
      por_pessoa: [...porPessoa].map(([pessoa, total]) => ({ pessoa, total })).sort((a, b) => b.total - a.total),
      ultimas: [...descontos, ...abaixo].sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 12)
        .map((x) => ({ dia: dia(x.quando), o_que: x.descricao, de: x.de, para: x.para, desconto: quanto(x), tipo: x.tipo === "desconto" ? "desconto" : "abaixo da lista", quem: x.quem_nome ?? "alguém da equipe" })),
      conta: "Soma só o que a tela Financeiro, Alterações mostra: desconto dado ao receber e preço abaixo da lista na venda ou no horário. Diga os dois totais separados e o total, sem \"eu dei\" (diga \"foram dados\").",
      onde_ver: "Financeiro, Alterações (escolha o mês e Todas).",
    },
  };
}
