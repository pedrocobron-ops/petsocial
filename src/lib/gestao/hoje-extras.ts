import type { Banco } from "./supabase";
import { TIPOS_ENVIO, type TipoEnvio } from "./modo-envio";
import { isoDia, lerTelefone } from "./util";

/**
 * Os cartões de baixo da tela Hoje ("Chamar de volta", aniversariantes, "O Mozart reparou" e "Mandar N mensagens"),
 * calculados no banco numa resposta pequena (`gestao_hoje_extras`, migração 20261233). Antes a tela baixava todos os pets,
 * 150 dias de atendimentos e a fila inteira de mensagens para mostrar três frases e um número.
 * Banco antes da atualização (a função não existe): `null`, e a tela lê do jeito de antes.
 */

/** Quem chamar: quantos tutores (sem os já chamados neste aparelho), quantos pets e os dois primeiros nomes. */
export type ResumoChamar = { todos: number; tutores: number; pets: number; nomes: string[]; hoje?: boolean };
export type DicasDoBanco = {
  sumidos: { q: number; nomes: string[] };
  faltas: string[]; faltas_q: number;
  niver: { nome: string; em: number }[]; niver_q: number;
  amanha: number; vieram: number;
  pacotes: { q: number; nomes: string[] } | null;
};
export type ExtrasDoHoje = {
  chamar: { sumidos: ResumoChamar; niver: ResumoChamar } | null;
  dicas: DicasDoBanco | null;
  /** quantas mensagens prontas por tipo, na ordem da fila; null = sem o Modo envio para esta pessoa (ou a parte falhou) */
  envio: { tipo: TipoEnvio; rotulo: string; quantas: number }[] | null;
  /** partes que o banco não conseguiu montar (a tela esconde o cartão; fica registrado) */
  falhas: { parte: string; erro: string }[];
};
export type PedidoDeExtras = { chamar: boolean; dicas: boolean; pacotes: boolean; envio: boolean; chamadosVolta: string[]; chamadosNiver: string[] };

type Cru = {
  chamar?: { sumidos?: Partial<ResumoChamar>; niver?: Partial<ResumoChamar> } | null;
  dicas?: Partial<DicasDoBanco> | null;
  envio?: Record<string, { n?: number; ver?: (string | null)[] }> | null;
  falhas?: { parte?: string; erro?: string }[];
};

const lista = (x: unknown): string[] => (Array.isArray(x) ? x.filter((n): n is string => typeof n === "string") : []);
const resumo = (r: Partial<ResumoChamar> | undefined): ResumoChamar => ({ todos: Number(r?.todos ?? 0), tutores: Number(r?.tutores ?? 0), pets: Number(r?.pets ?? 0), nomes: lista(r?.nomes), hoje: Boolean(r?.hoje) });

/** Contagem do Modo envio: o que o banco já contou mais os telefones escritos de outro jeito que a regra da tela aceita. */
export function contarEnvio(envio: Record<string, { n?: number; ver?: (string | null)[] }>): { tipo: TipoEnvio; rotulo: string; quantas: number }[] {
  return TIPOS_ENVIO.map((t) => {
    const x = envio[t.id];
    const quantas = Number(x?.n ?? 0) + (x?.ver ?? []).filter((fone) => Boolean(lerTelefone(fone).fone)).length;
    return { tipo: t.id, rotulo: t.rotulo, quantas };
  }).filter((x) => x.quantas > 0);
}

/** Monta o que a tela usa a partir da resposta do banco (separado para dar para testar sem banco). */
export function montarExtras(cru: Cru): ExtrasDoHoje {
  const d = cru.dicas;
  return {
    chamar: cru.chamar ? { sumidos: resumo(cru.chamar.sumidos), niver: resumo(cru.chamar.niver) } : null,
    dicas: d ? {
      sumidos: { q: Number(d.sumidos?.q ?? 0), nomes: lista(d.sumidos?.nomes) },
      faltas: lista(d.faltas), faltas_q: Number(d.faltas_q ?? lista(d.faltas).length),
      niver: (Array.isArray(d.niver) ? d.niver : []).filter((n) => n && typeof n.nome === "string").map((n) => ({ nome: n.nome, em: Number(n.em ?? 0) })),
      niver_q: Number(d.niver_q ?? 0),
      amanha: Number(d.amanha ?? 0), vieram: Number(d.vieram ?? 0),
      pacotes: d.pacotes ? { q: Number(d.pacotes.q ?? 0), nomes: lista(d.pacotes.nomes) } : null,
    } : null,
    envio: cru.envio ? contarEnvio(cru.envio) : null,
    falhas: (cru.falhas ?? []).map((f) => ({ parte: String(f.parte ?? "?"), erro: String(f.erro ?? "falhou") })),
  };
}

/** "Thor e Mel" / "Thor, Mel e mais 3": os dois primeiros nomes e quantos sobram, como a tela sempre escreveu. */
export const nomesEMais = (nomes: string[], total: number) => (total <= 2 ? nomes.slice(0, total).join(" e ") : `${nomes.slice(0, 2).join(", ")} e mais ${total - 2}`);

/** Lê os extras. `null`: o banco ainda não tem a função (a tela lê do jeito antigo). Outro erro sobe. */
export async function lerExtrasDoHoje(sb: Banco, petshopId: string, hoje: Date, q: PedidoDeExtras, agora = new Date()): Promise<ExtrasDoHoje | null> {
  if (!q.chamar && !q.dicas && !q.envio) return { chamar: null, dicas: null, envio: null, falhas: [] };
  const r = await (sb as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message: string } | null }> })
    .rpc("gestao_hoje_extras", {
      p: petshopId,
      a: { hoje_ini: hoje.toISOString(), agora: agora.toISOString(), dia: isoDia(hoje), chamar: q.chamar, dicas: q.dicas, pacotes: q.pacotes, envio: q.envio, chamados_volta: q.chamadosVolta, chamados_niver: q.chamadosNiver },
    });
  if (r.error) {
    if (r.error.code === "PGRST202" || r.error.code === "42883") return null;
    throw Object.assign(new Error(r.error.message), { code: r.error.code ?? "" });
  }
  if (!r.data || typeof r.data !== "object") return { chamar: null, dicas: null, envio: null, falhas: [] };
  return montarExtras(r.data as Cru);
}
