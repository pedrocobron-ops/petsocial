import type { Database } from "./banco";
import { saudacaoZap } from "./agenda";
import { opcao } from "./opcoes";
import { dataCurta, deIsoDia, isoDia, somaDias } from "./util";

/**
 * O cuidado com o tutor na creche e no hotel (`petshops.opcoes`, chaves "casa.*"). Tudo começa desligado:
 * - diário do dia: o que o pet fez, marcado em um toque, com a mensagem pronta para o tutor;
 * - quem pode buscar: as pessoas autorizadas e o veterinário de emergência, conferidos na saída;
 * - lista de espera: quem quer vaga num dia cheio, e o aviso quando abre lugar;
 * - ocorrências: briga, machucado, fuga ou vômito anotados na estadia.
 * Nada aqui tem dinheiro. As tabelas estão em supabase/migrations/20261146000000_gestao_diario_portaria.sql.
 */
type T = Database["public"]["Tables"];
export type Diario = T["estadias_diario"]["Row"];
export type Contato = T["pets_contatos"]["Row"];
export type Retirada = T["estadias_retiradas"]["Row"];
export type Ocorrencia = T["estadias_ocorrencias"]["Row"];
export type Espera = T["lista_espera"]["Row"];
type ComOpcoes = { opcoes?: unknown };

export const CHAVES_CASA = { diario: "casa.diario", portaria: "casa.portaria", espera: "casa.espera", ocorrencias: "casa.ocorrencias" } as const;

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/* ---------- diário ---------- */

/** O que o diário pergunta quando o dono ainda não mexeu na lista. */
export const ITENS_DO_DIARIO = ["Comeu bem", "Bebeu água", "Brincou", "Descansou", "Fez as necessidades", "Tomou o remédio"];
export const MAX_ITENS_DO_DIARIO = 12;
export type OpcaoDiario = { ativo: boolean; itens: string[] };
export function diarioDe(p: ComOpcoes): OpcaoDiario {
  const o = obj(opcao<unknown>(p, CHAVES_CASA.diario, {}));
  const lista = Array.isArray(o.itens) ? [...new Set(o.itens.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 40)).filter(Boolean))].slice(0, MAX_ITENS_DO_DIARIO) : [];
  return { ativo: o.ativo === true, itens: lista.length ? lista : ITENS_DO_DIARIO };
}
export const itensMarcados = (d: Pick<Diario, "itens"> | null | undefined): string[] => (Array.isArray(d?.itens) ? (d!.itens as unknown[]).filter((x): x is string => typeof x === "string") : []);

/* ---------- quem pode buscar ---------- */

export const portariaLigada = (p: ComOpcoes) => opcao<boolean>(p, CHAVES_CASA.portaria, false) === true;
/** Os contatos que valem para um pet: os do tutor (todos os pets dele) e os que são só deste pet. */
export const contatosDoPet = (todos: Contato[], pet: { id: string; clientes?: { id: string } | null; cliente_id?: string | null }) => {
  const tutor = pet.clientes?.id ?? pet.cliente_id ?? null;
  return todos.filter((c) => c.pet_id === pet.id || (c.pet_id == null && tutor != null && c.cliente_id === tutor));
};
/** "Maria (avó)" */
export const nomeComRelacao = (c: { nome: string; relacao?: string | null }) => `${c.nome}${c.relacao?.trim() ? ` (${c.relacao.trim()})` : ""}`;

/* ---------- ocorrências ---------- */

export const ocorrenciasLigadas = (p: ComOpcoes) => opcao<boolean>(p, CHAVES_CASA.ocorrencias, false) === true;
export const TIPOS_DE_OCORRENCIA = [
  { id: "briga", rotulo: "Briga", frase: "se envolveu numa briga" },
  { id: "machucado", rotulo: "Machucado", frase: "se machucou" },
  { id: "fugiu", rotulo: "Fugiu", frase: "tentou fugir" },
  { id: "vomitou", rotulo: "Vomitou", frase: "vomitou" },
  { id: "outro", rotulo: "Outra coisa", frase: "" },
] as const;
export type TipoDeOcorrencia = (typeof TIPOS_DE_OCORRENCIA)[number]["id"];
export const tipoDaOcorrencia = (id: string) => TIPOS_DE_OCORRENCIA.find((t) => t.id === id) ?? TIPOS_DE_OCORRENCIA[4];
const horaFalada = (d: string | Date) => { const x = new Date(d); return x.getMinutes() ? `${x.getHours()}h${String(x.getMinutes()).padStart(2, "0")}` : `${x.getHours()}h`; };
/** "às 14h30, vomitou. Já está bem." */
export function fraseDaOcorrencia(o: Pick<Ocorrencia, "tipo" | "texto" | "quando">) {
  const t = tipoDaOcorrencia(o.tipo), texto = o.texto.trim();
  return [`às ${horaFalada(o.quando)}`, [t.frase, texto].filter(Boolean).join(". ")].filter(Boolean).join(", ");
}

/**
 * A mensagem do diário para o tutor: os itens marcados, o recado e as ocorrências que a equipe escolheu contar.
 * Só o que foi marcado entra: nada é escrito por conta própria.
 */
export function mensagemDoDiario(p: {
  tutor: string | null | undefined; petshop: string; pet: string; dia: string; hoje: string; itens: string[]; nota: string | null | undefined;
  ocorrencias: Pick<Ocorrencia, "tipo" | "texto" | "quando">[];
}) {
  const quando = p.dia === p.hoje ? "hoje" : `${dataCurta(deIsoDia(p.dia))}`;
  const linhas = [`${saudacaoZap(p.tutor, p.petshop)} Diário de ${p.pet}, ${quando}:`];
  for (const i of p.itens) linhas.push(`- ${i}`);
  const nota = (p.nota ?? "").trim();
  if (nota) linhas.push("", nota);
  if (p.ocorrencias.length) {
    linhas.push("", p.ocorrencias.length === 1 ? "Uma coisa para você saber:" : "Para você saber:");
    for (const o of [...p.ocorrencias].sort((a, b) => a.quando.localeCompare(b.quando))) linhas.push(`- ${fraseDaOcorrencia(o)}`);
  }
  return linhas.join("\n");
}

/* ---------- lista de espera ---------- */

export type OpcaoEspera = { ativo: boolean; link: boolean };
export function esperaDe(p: ComOpcoes): OpcaoEspera {
  const o = obj(opcao<unknown>(p, CHAVES_CASA.espera, {}));
  return { ativo: o.ativo === true, link: o.ativo === true && o.link === true };
}

/** Os dias em que o pedido da lista precisa de vaga (no hotel, o dia de buscar não ocupa a noite), de hoje em diante. */
export function diasDaEspera(e: Pick<Espera, "tipo" | "entrada" | "saida">, hoje: string): string[] {
  const dias: string[] = [];
  const fim = e.tipo === "hotel" && e.saida > e.entrada ? isoDia(somaDias(deIsoDia(e.saida), -1)) : e.saida;
  for (let d = deIsoDia(e.entrada); isoDia(d) <= fim && dias.length < 62; d = somaDias(d, 1)) if (isoDia(d) >= hoje) dias.push(isoDia(d));
  return dias;
}
/** "20/11" ou "20/11 a 23/11" */
export const periodoDaEspera = (e: Pick<Espera, "entrada" | "saida">) => (e.saida === e.entrada ? dataCurta(deIsoDia(e.entrada)) : `${dataCurta(deIsoDia(e.entrada))} a ${dataCurta(deIsoDia(e.saida))}`);
/** A lista ainda vale? (o último dia não passou) */
export const esperaVale = (e: Pick<Espera, "status" | "saida" | "entrada" | "tipo">, hoje: string) => (e.status === "esperando" || e.status === "chamado") && diasDaEspera(e, hoje).length > 0;

/** Mensagem para quem estava na lista, quando abre vaga. O sistema só prepara: quem manda é a pessoa. */
export function mensagemDeVaga(p: { tutor: string | null | undefined; petshop: string; pet: string; tipo: string; entrada: string; saida: string }) {
  const onde = p.tipo === "hotel" ? "no hotel" : "na creche";
  const quando = p.saida === p.entrada ? `em ${dataCurta(deIsoDia(p.entrada))}` : `de ${dataCurta(deIsoDia(p.entrada))} a ${dataCurta(deIsoDia(p.saida))}`;
  return `${saudacaoZap(p.tutor, p.petshop)} Abriu uma vaga ${onde} para ${p.pet} ${quando}. Você ainda quer? Me responde por aqui que eu deixo reservado.`;
}
