import { opcao } from "./opcoes";
import type { Porte } from "./tipos";

/**
 * Opções do hotel e da creche (`petshops.opcoes`, chaves "hotel.*"). Todas começam desligadas:
 * negócio que nunca mexeu continua com a conta, os formulários e as mensagens de sempre.
 * As regras de preço estão em src/lib/gestao/hotel.ts.
 */
type ComOpcoes = { opcoes?: unknown };

export const CHAVES_HOTEL = {
  sinal: "hotel.sinal", pix: "hotel.pix", porte: "hotel.diaria_por_porte", temporadas: "hotel.temporadas",
  segundoPet: "hotel.desconto_segundo_pet", taxas: "hotel.taxas", cuidados: "hotel.cuidados", acomodacoes: "hotel.acomodacoes",
  mensagens: "hotel.mensagens",
} as const;

/** Sinal na reserva: sugestão em % do total previsto ou em valor fixo, e o texto da política (escrito pelo dono). */
export type OpcaoSinal = { ativo: boolean; modo: "pct" | "valor"; valor: number | null; politica: string; creche: boolean };
/** Diária do hotel por porte. Porte sem preço usa a diária do hotel de Meu pet shop. */
export type OpcaoPorte = { ativo: boolean } & Record<Porte, number | null>;
/** Temporada: um período com diária própria ("valor"), ou com acréscimo em % ("pct") ou em reais ("mais") por noite. */
export type Temporada = { id: string; nome: string; de: string; ate: string; modo: "valor" | "pct" | "mais"; valor: number };
export type OpcaoTemporadas = { ativo: boolean; lista: Temporada[] };
export type OpcaoSegundoPet = { ativo: boolean; pct: number | null };
/** Taxa opcional: fixa (uma vez na conta) ou por noite. Nenhuma entra sozinha: alguém marca. */
export type Taxa = { id: string; nome: string; valor: number; por: "fixa" | "noite" };
export type OpcaoTaxas = { ativo: boolean; lista: Taxa[] };
export type Acomodacao = { id: string; nome: string; vagas: number };
export type OpcaoAcomodacoes = { ativo: boolean; lista: Acomodacao[] };
/** Textos das mensagens do hotel e da creche, sem a saudação (que é sempre "Oi, Ana! Aqui é …"). Vazio = texto padrão. */
export type ModelosDeMensagem = Partial<Record<TipoDeMensagem, string>>;
export type TipoDeMensagem = "confirmar" | "chegada" | "saida" | "como_esta" | "sinal";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
const texto = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x) => x && typeof x === "object").map(obj) : []);
const ehDia = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function sinalDe(p: ComOpcoes): OpcaoSinal {
  const o = obj(opcao<unknown>(p, CHAVES_HOTEL.sinal, {}));
  return { ativo: o.ativo === true, modo: o.modo === "valor" ? "valor" : "pct", valor: num(o.valor), politica: texto(o.politica, 400), creche: o.creche === true };
}
export const pixDe = (p: ComOpcoes) => texto(opcao<unknown>(p, CHAVES_HOTEL.pix, ""), 120).trim();
export function porteDe(p: ComOpcoes): OpcaoPorte {
  const o = obj(opcao<unknown>(p, CHAVES_HOTEL.porte, {}));
  return { ativo: o.ativo === true, P: num(o.P), M: num(o.M), G: num(o.G), GG: num(o.GG) };
}
export function temporadasDe(p: ComOpcoes): OpcaoTemporadas {
  const o = obj(opcao<unknown>(p, CHAVES_HOTEL.temporadas, {}));
  const itens = lista(o.lista).flatMap((t): Temporada[] => {
    const valor = num(t.valor);
    if (!ehDia(t.de) || !ehDia(t.ate) || t.ate < t.de || valor == null) return [];
    return [{ id: texto(t.id, 40) || `${t.de}-${t.ate}`, nome: texto(t.nome, 40).trim() || "Temporada", de: t.de, ate: t.ate, modo: t.modo === "valor" || t.modo === "mais" ? t.modo : "pct", valor }];
  });
  return { ativo: o.ativo === true, lista: itens.sort((a, b) => a.de.localeCompare(b.de)) };
}
export function segundoPetDe(p: ComOpcoes): OpcaoSegundoPet {
  const o = obj(opcao<unknown>(p, CHAVES_HOTEL.segundoPet, {}));
  const pct = num(o.pct);
  return { ativo: o.ativo === true, pct: pct == null ? null : Math.min(100, pct) };
}
export function taxasDe(p: ComOpcoes): OpcaoTaxas {
  const o = obj(opcao<unknown>(p, CHAVES_HOTEL.taxas, {}));
  const itens = lista(o.lista).flatMap((t): Taxa[] => {
    const valor = num(t.valor), nome = texto(t.nome, 40).trim();
    return valor == null || !nome ? [] : [{ id: texto(t.id, 40) || nome, nome, valor, por: t.por === "noite" ? "noite" : "fixa" }];
  });
  return { ativo: o.ativo === true, lista: itens };
}
export const cuidadosLigados = (p: ComOpcoes) => opcao<boolean>(p, CHAVES_HOTEL.cuidados, false) === true;
export function acomodacoesDe(p: ComOpcoes): OpcaoAcomodacoes {
  const o = obj(opcao<unknown>(p, CHAVES_HOTEL.acomodacoes, {}));
  const itens = lista(o.lista).flatMap((a): Acomodacao[] => {
    const nome = texto(a.nome, 30).trim(), id = texto(a.id, 40);
    const vagas = num(a.vagas);
    return !nome || !id ? [] : [{ id, nome, vagas: Math.max(1, Math.round(vagas ?? 1)) }];
  });
  return { ativo: o.ativo === true, lista: itens };
}
export function modelosDe(p: ComOpcoes): ModelosDeMensagem {
  const o = obj(opcao<unknown>(p, CHAVES_HOTEL.mensagens, {}));
  const m: ModelosDeMensagem = {};
  for (const k of ["confirmar", "chegada", "saida", "como_esta", "sinal"] as const) { const t = texto(o[k], 600).trim(); if (t) m[k] = t; }
  return m;
}

/** Código curto para um item novo das listas (temporada, taxa, acomodação). */
export const novoCodigo = () => Math.random().toString(36).slice(2, 10);
