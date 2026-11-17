import type { DestinoDoPreco } from "./caderno";
import { CHAVES_HOTEL } from "./hotel-opcoes";
import { salvarOpcoes } from "./opcoes";
import type { Banco } from "./supabase";

/**
 * Foto da tabela de preços: para onde vai cada linha. Banho, tosa e o que tem hora marcada viram serviço da agenda; creche e
 * hotel nunca: a diária da creche vai para a diária da creche (Meu pet shop), a diária do hotel para a do hotel (por porte,
 * quando a tabela tem um preço por porte), e o plano mensal da creche ("mensal 3x semana") vira modelo de plano de
 * mensalista (Creche, Mensalistas, Modelos de plano). Pacote de banhos não entra sozinho (o modelo de pacote precisa do serviço).
 */

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Dias por semana escritos no nome: "3x semana", "3 vezes", "5 dias", "seg a sex", "todos os dias". */
export function vezesDoNome(nome: string): number | null {
  const n = sem(nome);
  const m = /(\d)\s*(?:x|vezes|vez|dias?)\b/.exec(n);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 7) return Number(m[1]);
  if (/seg(unda)?\s*(a|-|ate)\s*sex(ta)?|todos os dias|dias uteis|diario\b/.test(n)) return 5;
  return null;
}

/**
 * O destino de uma linha da tabela, pela leitura (`area` e `cobranca`) e pelo nome: o nome vale mesmo quando a leitura erra
 * ("Creche mensal 3x semana" marcado como serviço do banho e tosa continua sendo plano da creche).
 */
export function destinoDaLinha(nome: string, area: string, cobranca: string, vezesLidas: number | null): { destino: DestinoDoPreco; vezes: number | null } {
  const n = sem(nome);
  const creche = area === "creche" || /\bcreche\b|day ?care|daycare/.test(n);
  const hotel = !creche && (area === "hotel" || /\bhotel\b|hotelzinho|hospedagem|pernoite|\bpousada\b/.test(n));
  const mensal = cobranca === "mensal" || /mensal|mensalidade|mensalista|\bplano\b|por mes|\/\s*mes|\d\s*x\s*(por\s*)?sem|vezes (por|na) semana/.test(n);
  const vezes = vezesLidas != null && Number.isFinite(vezesLidas) && vezesLidas >= 1 && vezesLidas <= 7 ? Math.round(vezesLidas) : vezesDoNome(nome);
  if (creche && mensal) return { destino: "creche_plano", vezes };
  if (creche) return { destino: "creche_diaria", vezes: null };
  if (hotel) return { destino: "hotel_diaria", vezes: null };
  if (cobranca === "pacote" || /\bpacote\b|\d+\s*banhos\b/.test(n)) return { destino: "pacote", vezes: null };
  return { destino: "servico", vezes: null };
}

/** O que a tela mostra na linha: para onde o preço vai. */
export function rotuloDoDestino(destino: DestinoDoPreco | undefined, vezes?: number | null): string | null {
  if (destino === "creche_diaria") return "Vai para a diária da creche";
  if (destino === "hotel_diaria") return "Vai para a diária do hotel";
  if (destino === "creche_plano") return vezes ? `Vira modelo de plano da creche: ${vezes}x por semana` : "Vira modelo de plano da creche (confira quantos dias por semana)";
  if (destino === "pacote") return "Pacote: monte em Pacotes (não entra na agenda)";
  return null;
}

type Precos = { preco_p: number | null; preco_m: number | null; preco_g: number | null; preco_gg: number | null };
const PORTES = [["P", "preco_p"], ["M", "preco_m"], ["G", "preco_g"], ["GG", "preco_gg"]] as const;
/** Um preço só: o do porte médio, ou o primeiro escrito. */
const umPreco = (p: Precos) => p.preco_m ?? p.preco_p ?? p.preco_g ?? p.preco_gg ?? null;

/**
 * Grava uma linha de creche ou hotel no lugar certo e devolve a frase do resumo (null: nada a gravar, como o pacote).
 * Diárias e opções do hotel: só o dono (o banco confere); modelos de plano: dono ou quem cuida do financeiro.
 */
export async function gravarPrecoDaCasa(sb: Banco, petshopId: string, x: { nome: string; destino?: DestinoDoPreco; vezes?: number | null; precos: Precos }): Promise<string | null> {
  const v = umPreco(x.precos);
  if (v == null || !x.destino || x.destino === "servico" || x.destino === "pacote") return null;
  const ok = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); };
  if (x.destino === "creche_diaria") {
    ok(await sb.from("petshops").update({ diaria_creche: v }).eq("id", petshopId).select("id"));
    return `Diária da creche: ${v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`;
  }
  if (x.destino === "hotel_diaria") {
    const valores = PORTES.map(([p, c]) => [p, x.precos[c]] as const);
    const varia = new Set(valores.map(([, n]) => n).filter((n) => n != null)).size > 1;
    ok(await sb.from("petshops").update({ diaria_hotel: v }).eq("id", petshopId).select("id"));
    if (varia) await salvarOpcoes(sb, petshopId, { [CHAVES_HOTEL.porte]: { ativo: true, ...Object.fromEntries(valores) } });
    return varia ? "Diária do hotel por porte." : `Diária do hotel: ${v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`;
  }
  // plano mensal: modelo de plano (o mesmo nome atualiza o valor)
  const nome = x.nome.trim().slice(0, 60);
  const ja = await sb.from("creche_modelos").select("id").eq("petshop_id", petshopId).ilike("nome", nome.replace(/[%_]/g, "")).limit(1).maybeSingle();
  if (ja.data) ok(await sb.from("creche_modelos").update({ valor_mensal: v, ...(x.vezes ? { vezes: x.vezes } : {}) }).eq("id", ja.data.id).eq("petshop_id", petshopId).select("id"));
  else ok(await sb.from("creche_modelos").insert({ petshop_id: petshopId, nome, vezes: x.vezes ?? null, valor_mensal: v, ativo: true }).select("id"));
  return `Modelo de plano "${nome}".`;
}
