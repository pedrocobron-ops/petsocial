/**
 * Memória curta das leituras das telas (`useDados` com `guardar`), releitura sozinha e prazo. Sem React, para dar para testar.
 *
 * - Memória: o último resultado de cada leitura fica guardado por alguns minutos. Voltar a uma tela pelo menu mostra na hora o
 *   que estava guardado; se tem menos de 30 segundos e nada foi gravado, nem busca de novo; senão busca por trás e troca
 *   quando chega. Qualquer gravação (do aplicativo ou do Mozart) marca tudo como velho: a tela aparece e já se atualiza.
 * - Releitura sozinha: ao voltar para a aba ou para a janela (no máximo uma vez a cada 30 segundos) e quando o dia vira.
 * - Prazo: pedido que não responde termina em erro, para a tela oferecer "Tentar de novo" em vez de ficar esperando.
 */

/** Guardado há menos que isto e sem gravação no meio: vale sem buscar de novo. */
export const FRESCO_MS = 30_000;
/** Guardado há mais que isto: não é mostrado (a tela espera a leitura nova). */
export const GUARDA_MS = 5 * 60_000;
/** Intervalo mínimo entre duas releituras ao voltar para a aba. */
export const MINIMO_ENTRE_RELEITURAS_MS = 30_000;
/** Prazo de uma leitura inteira (todas as páginas). Um pedido sozinho tem o prazo dele, menor, em `supabase.ts`. */
export const PRAZO_DA_LEITURA_MS = 60_000;
const MAXIMO_GUARDADO = 80;

type Entrada = { valor: unknown; em: number; velho: boolean };
const guardados = new Map<string, Entrada>();
const emCurso = new Map<string, Promise<unknown>>();
/** Sobe a cada gravação: leitura que começou antes de uma gravação não é guardada como nova. */
let geracao = 0;
let dono = "";

/** De quem é a memória (conta e pet shop). Trocou: esquece tudo, para nunca mostrar dado de outra loja. */
export function definirDonoDaMemoria(quem: string) {
  if (quem !== dono) { dono = quem; esquecerTudo(); }
}

/** Apaga a memória (sair da conta, trocar de pet shop). */
export function esquecerTudo() {
  guardados.clear();
  emCurso.clear();
  geracao++;
}

/** Algo foi gravado: o que está guardado ainda pode aparecer na hora, mas é buscado de novo. */
export function marcarTudoVelho() {
  geracao++;
  for (const e of guardados.values()) e.velho = true;
}

/** Nome da leitura + do que ela depende (as dependências do `useDados`). */
export function chaveDaLeitura(nome: string, deps: unknown[]): string {
  return `${nome}|${JSON.stringify(deps, (_k, v) => (typeof v === "function" ? "f" : v instanceof Date ? v.getTime() : v))}`;
}

/** O que está guardado para a chave: `fresco` = não precisa buscar de novo. Passou do tempo de guarda: nada. */
export function lerGuardado<T>(chave: string, agora = Date.now()): { valor: T; fresco: boolean } | null {
  const e = guardados.get(chave);
  if (!e) return null;
  if (agora - e.em > GUARDA_MS) { guardados.delete(chave); return null; }
  return { valor: e.valor as T, fresco: !e.velho && agora - e.em < FRESCO_MS };
}

function guardar(chave: string, valor: unknown, velho: boolean, agora: number) {
  guardados.delete(chave);
  guardados.set(chave, { valor, em: agora, velho });
  // os mais antigos saem (a ordem do Map é a de entrada)
  while (guardados.size > MAXIMO_GUARDADO) guardados.delete(guardados.keys().next().value as string);
}

/**
 * Busca e guarda. Duas telas pedindo a mesma leitura ao mesmo tempo dividem um pedido só. Leitura que começou antes de uma
 * gravação entrega o resultado, mas fica guardada como velha (a próxima visita busca de novo).
 */
export function buscarGuardando<T>(chave: string, buscar: () => Promise<T>, agora: () => number = Date.now): Promise<T> {
  const k = `${geracao}|${chave}`;
  const ja = emCurso.get(k);
  if (ja) return ja as Promise<T>;
  const minha = geracao, donoAgora = dono;
  const p = buscar().then((valor) => {
    if (donoAgora === dono) guardar(chave, valor, minha !== geracao, agora());
    return valor;
  }).finally(() => { if (emCurso.get(k) === p) emCurso.delete(k); });
  emCurso.set(k, p);
  return p;
}

/** Erro de prazo: o pedido não respondeu a tempo. O texto vira "demorou demais" em `mensagemDeErro`. */
export class TempoEsgotado extends Error {
  constructor() { super("tempo esgotado: o pedido demorou demais para responder"); this.name = "TempoEsgotado"; }
}

/** A promessa, com prazo: passou de `ms`, rejeita com `TempoEsgotado` (a promessa original segue por conta dela). */
export function comPrazo<T>(p: Promise<T>, ms: number): Promise<T> {
  if (!(ms > 0) || !Number.isFinite(ms)) return p;
  return new Promise<T>((resolver, rejeitar) => {
    const t = setTimeout(() => rejeitar(new TempoEsgotado()), ms);
    p.then((v) => { clearTimeout(t); resolver(v); }, (e) => { clearTimeout(t); rejeitar(e); });
  });
}

/** Já pode reler ao voltar para a aba? (uma vez a cada 30 segundos, no máximo) */
export const podeReler = (ultima: number, agora: number, minimo = MINIMO_ENTRE_RELEITURAS_MS) => agora - ultima >= minimo;

/** Milissegundos até o dia virar no relógio do aparelho (mais uma folga de 2 segundos). */
export function msAteVirarODia(agora = new Date()): number {
  const amanha = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + 1, 0, 0, 2);
  return Math.max(1000, amanha.getTime() - agora.getTime());
}

/** O dia do aparelho, para saber se virou (AAAA-M-D, só para comparar). */
export const diaDoAparelho = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

/**
 * Os dois resultados são iguais? Releitura que trouxe a mesma coisa não mexe na tela (não pisca, não desfaz o que a pessoa
 * está digitando). Compara objetos, listas, datas, Map e Set por dentro.
 */
export function iguais(a: unknown, b: unknown, fundo = 0): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (fundo > 40) return false;
  if (a instanceof Date || b instanceof Date) return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map) || !(b instanceof Map) || a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !iguais(v, b.get(k), fundo + 1)) return false;
    return true;
  }
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set) || !(b instanceof Set) || a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!iguais(a[i], b[i], fundo + 1)) return false;
    return true;
  }
  const pa = Object.getPrototypeOf(a), pb = Object.getPrototypeOf(b);
  if (pa !== pb || (pa !== Object.prototype && pa !== null)) return false;
  const ka = Object.keys(a as object), kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if (!iguais((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], fundo + 1)) return false;
  }
  return true;
}

/* ---------- leituras que falharam e a tela não tratou ---------- */

export type LeituraComErro = { texto: string; tentar: () => void };
const comErro = new Map<number, LeituraComErro>();
const ouvintes = new Set<() => void>();
let foto: LeituraComErro[] = [];
const avisarOuvintes = () => { foto = [...comErro.values()]; for (const o of ouvintes) o(); };

/** A leitura `id` falhou sem nada para mostrar e a tela não olhou o erro: entra no aviso comum (ou sai, com `null`). */
export function anotarLeituraComErro(id: number, erro: LeituraComErro | null) {
  if (erro) { const ja = comErro.get(id); if (ja && ja.texto === erro.texto && ja.tentar === erro.tentar) return; comErro.set(id, erro); }
  else if (!comErro.delete(id)) return;
  avisarOuvintes();
}
export const ouvirLeiturasComErro = (o: () => void) => { ouvintes.add(o); return () => { ouvintes.delete(o); }; };
export const leiturasComErro = () => foto;
const NENHUMA: LeituraComErro[] = [];
export const nenhumaLeituraComErro = () => NENHUMA;

/** Recusa do banco por falta de acesso: não é falha de leitura que "Tentar de novo" resolva (fica como sempre foi, sem aviso). */
export const ehRecusaDeAcesso = (mensagem: string, codigo = "") => codigo === "42501" || /row-level security|permission denied/i.test(mensagem);
