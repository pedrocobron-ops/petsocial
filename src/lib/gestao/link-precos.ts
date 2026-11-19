/**
 * O valor que o link do cliente mostra ao tutor, pet por pet, e o total. Uma conta só, usada em três lugares:
 * - no formulário e no "Pedido enviado" (com os preços e as promoções que o link mostra);
 * - na página do pedido e no cartão do pedido de quem recebe (com o valor que o banco guardou ao receber o pedido:
 *   `pedidos_valores.visto`, migração 20261235, feito pela mesma regra).
 * Regra: o preço da lista no porte do pet; com promoção no horário, "de X por Y" (% arredonda no centavo, R$ vai até o preço).
 * Sem porte (ou sem preço para o porte): um preço só vale para todos; preços diferentes viram "de X a Y, conforme o porte".
 * O arredondamento é o mesmo do resto do sistema (`centavos` de util.ts, igual ao do banco).
 */
import { centavos } from "./util";
export type PrecosDaLista = { preco_p: number | null; preco_m: number | null; preco_g: number | null; preco_gg: number | null };
export type PromoDoPreco = { nome: string; tipo: "pct" | "reais"; valor: number };

/** O valor de um pet: `valor` quando dá para dizer o número; `de`/`ate` quando depende do porte. `base*` é o preço sem a promoção. */
export type ValorDoPet = {
  tipo: "servico" | "creche" | "hotel";
  porte?: string | null;
  base?: number | null; valor?: number | null;
  base_de?: number | null; base_ate?: number | null; de?: number | null; ate?: number | null;
  promo?: PromoDoPreco | null;
  /** creche e hotel */
  dias?: number | null; noites?: number | null; diaria?: number | null; total?: number | null; sinal?: number | null; varia?: boolean | null; desconto?: boolean | null;
  /** mais de um serviço no pedido (migração 20261239): cada serviço com o valor dele; o valor do pet é a soma */
  servicos?: ParteDoValor[] | null;
};
/** Um serviço dentro do valor do pet: "Hidratação R$ 30,00" ou "Hidratação de R$ 25,00 a R$ 40,00". */
export type ParteDoValor = { nome: string; base?: number | null; valor?: number | null; base_de?: number | null; base_ate?: number | null; de?: number | null; ate?: number | null };
export type LinhaDeValor = { nome: string; v: ValorDoPet };

const num = (x: unknown): number | null => (x == null || x === "" || !Number.isFinite(Number(x)) ? null : Number(x));

/** "R$ 42,41" (sempre com centavos: é valor de conta). */
export function real(v: number) {
  const [i, c] = Math.abs(v).toFixed(2).split(".");
  return `${v < 0 ? "-" : ""}R$ ${i.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${c}`;
}

/** Quanto a promoção tira de um preço (a mesma conta de `descontoNoPreco`, promocoes.ts, e de `promo_desconto_no_preco`, no banco). */
export function descontoDaPromo(p: Pick<PromoDoPreco, "tipo" | "valor"> | null | undefined, preco: number) {
  if (!p || !(preco > 0) || !Number.isFinite(Number(p.valor))) return 0;
  return p.tipo === "pct" ? centavos((preco * Number(p.valor)) / 100) : Math.min(Number(p.valor), preco);
}

/** O valor de um pet num serviço do link. null = o serviço não tem preço no link. */
export function valorDoServico(s: PrecosDaLista | null | undefined, porte: string | null | undefined, promo?: PromoDoPreco | null): ValorDoPet | null {
  if (!s) return null;
  const mapa: Record<string, number | null> = { P: num(s.preco_p), M: num(s.preco_m), G: num(s.preco_g), GG: num(s.preco_gg) };
  const todos = Object.values(mapa).filter((x): x is number => x != null);
  if (!todos.length) return null;
  const min = Math.min(...todos), max = Math.max(...todos);
  const base = (porte ? mapa[porte] : null) ?? (min === max ? min : null);
  const pr = promo ? { nome: promo.nome, tipo: promo.tipo, valor: Number(promo.valor) } : null;
  if (base != null) return { tipo: "servico", porte: porte ?? null, base, valor: centavos(base - descontoDaPromo(pr, base)), promo: pr };
  return { tipo: "servico", porte: porte ?? null, base_de: min, base_ate: max, de: centavos(min - descontoDaPromo(pr, min)), ate: centavos(max - descontoDaPromo(pr, max)), promo: pr };
}

/**
 * O valor de um pet em vários serviços (o primeiro é o principal): a soma do valor de cada um. A promoção do horário vale só
 * para o principal (como no horário da agenda). Algum serviço sem preço no link: null (o pedido fica "a combinar").
 * É a mesma conta que o banco guarda com o pedido (`pedidos_valor_visto`, migração 20261239).
 */
export function valorDosServicos(lista: (PrecosDaLista & { nome: string })[], porte: string | null | undefined, promo?: PromoDoPreco | null): ValorDoPet | null {
  if (!lista.length) return null;
  if (lista.length === 1) return valorDoServico(lista[0], porte, promo);
  const partes = lista.map((s, i) => ({ nome: s.nome, v: valorDoServico(s, porte, i === 0 ? promo : null) }));
  if (partes.some((p) => !p.v)) return null;
  const soma = (f: (v: ValorDoPet) => number) => centavos(partes.reduce((t, p) => t + f(p.v!), 0));
  const servicos: ParteDoValor[] = partes.map(({ nome, v }) => (v!.base != null ? { nome, base: v!.base, valor: v!.valor } : { nome, base_de: v!.base_de, base_ate: v!.base_ate, de: v!.de, ate: v!.ate }));
  const pr = partes[0].v!.promo ?? null;
  if (partes.every((p) => p.v!.base != null)) return { tipo: "servico", porte: porte ?? null, base: soma((v) => v.base!), valor: soma((v) => v.valor!), promo: pr, servicos };
  return {
    tipo: "servico", porte: porte ?? null, promo: pr, servicos,
    base_de: soma((v) => v.base ?? v.base_de!), base_ate: soma((v) => v.base ?? v.base_ate!), de: soma((v) => v.valor ?? v.de!), ate: soma((v) => v.valor ?? v.ate!),
  };
}

/** "Banho e tosa R$ 90,00 + Hidratação R$ 30,00" (cada serviço com o que o tutor paga). Um serviço só: null. */
export function partesPorExtenso(v: ValorDoPet): string | null {
  if (!v.servicos || v.servicos.length < 2) return null;
  return v.servicos.map((p) => {
    const quanto = p.valor != null ? real(p.valor) : p.de != null && p.ate != null ? (p.de === p.ate ? real(p.de) : `de ${real(p.de)} a ${real(p.ate)}`) : "a combinar";
    return `${p.nome} ${quanto}`;
  }).join(" + ");
}

/** O que o banco guardou (`pedidos_valores.visto`), com os números como número. null = nada guardado. */
export function lerVisto(x: unknown): ValorDoPet | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  const tipo = o.tipo === "creche" || o.tipo === "hotel" ? o.tipo : o.tipo === "servico" ? "servico" : null;
  if (!tipo) return null;
  const p = o.promo && typeof o.promo === "object" ? (o.promo as Record<string, unknown>) : null;
  const promo = p && (p.tipo === "pct" || p.tipo === "reais") && num(p.valor) != null ? { nome: String(p.nome ?? "Promoção"), tipo: p.tipo, valor: num(p.valor)! } as PromoDoPreco : null;
  return {
    tipo, porte: typeof o.porte === "string" ? o.porte : null, base: num(o.base), valor: num(o.valor),
    base_de: num(o.base_de), base_ate: num(o.base_ate), de: num(o.de), ate: num(o.ate), promo,
    dias: num(o.dias), noites: num(o.noites), diaria: num(o.diaria), total: num(o.total), sinal: num(o.sinal),
    varia: o.varia === true, desconto: o.desconto === true,
    servicos: Array.isArray(o.servicos) ? (o.servicos as unknown[]).filter((x): x is Record<string, unknown> => !!x && typeof x === "object").map((x) => ({
      nome: String(x.nome ?? "Serviço"), base: num(x.base), valor: num(x.valor), base_de: num(x.base_de), base_ate: num(x.base_ate), de: num(x.de), ate: num(x.ate),
    })) : null,
  };
}

const tem = (v: ValorDoPet) => v.valor != null || (v.de != null && v.ate != null);
/** A promoção mudou o preço deste pet? */
export const comDesconto = (v: ValorDoPet) => (v.valor != null && v.base != null && v.valor < v.base) || (v.de != null && v.base_de != null && v.de < v.base_de);

/** "R$ 42,41" ou "de R$ 49,90 a R$ 119,90" (o que o tutor paga, já com a promoção). */
export function valorPorExtenso(v: ValorDoPet): string | null {
  if (v.valor != null) return real(v.valor);
  if (v.de != null && v.ate != null) return v.de === v.ate ? real(v.de) : `de ${real(v.de)} a ${real(v.ate)}`;
  return null;
}
/** "porte P", "sem porte" */
export const portePorExtenso = (v: ValorDoPet) => (v.porte ? `porte ${v.porte}` : "sem porte");

/**
 * Uma frase por pet: "Mel (porte P): de R$ 49,90 por R$ 42,41", "Bob (porte G): R$ 89,90",
 * "Thor (sem porte): de R$ 49,90 a R$ 119,90, conforme o porte". Sem valor, null.
 */
export function fraseDoPet(l: LinhaDeValor): string | null {
  const v = l.v;
  if (!tem(v)) return null;
  const quem = v.tipo === "servico" ? `${l.nome} (${portePorExtenso(v)})` : l.nome;
  if (v.valor != null) return comDesconto(v) ? `${quem}: de ${real(v.base!)} por ${real(v.valor)}` : `${quem}: ${real(v.valor)}`;
  return `${quem}: ${valorPorExtenso(v)}, conforme o porte`;
}

/** O total do pedido: um número quando todos os pets têm valor certo; uma faixa quando algum depende do porte; null sem valor. */
export function totalDoPedido(linhas: LinhaDeValor[]): { valor: number | null; de: number | null; ate: number | null; base: number | null } | null {
  if (!linhas.length || !linhas.every((l) => tem(l.v))) return null;
  const certo = linhas.every((l) => l.v.valor != null);
  const de = centavos(linhas.reduce((t, l) => t + (l.v.valor ?? l.v.de ?? 0), 0));
  const ate = centavos(linhas.reduce((t, l) => t + (l.v.valor ?? l.v.ate ?? 0), 0));
  const base = linhas.every((l) => l.v.base != null) ? centavos(linhas.reduce((t, l) => t + (l.v.base ?? 0), 0)) : null;
  return { valor: certo ? de : null, de, ate, base };
}
/** "R$ 118,82" ou "de R$ 92,31 a R$ 162,31". */
export function totalPorExtenso(linhas: LinhaDeValor[]): string | null {
  const t = totalDoPedido(linhas);
  if (!t) return null;
  return t.valor != null ? real(t.valor) : t.de === t.ate ? real(t.de ?? 0) : `de ${real(t.de ?? 0)} a ${real(t.ate ?? 0)}`;
}

/**
 * O valor numa frase só, para a mensagem do WhatsApp e para o cartão de quem recebe:
 * "R$ 42,41" (um pet), "R$ 118,82 (Mel R$ 42,41 e Bob R$ 76,41)" (vários), "cerca de R$ 575,40 (3 noites)" (hotel). Sem valor, null.
 */
export function valorNaFrase(linhas: LinhaDeValor[]): string | null {
  const total = totalPorExtenso(linhas);
  if (!total) return null;
  const v0 = linhas[0].v;
  if (v0.tipo !== "servico") {
    const n = v0.tipo === "hotel" ? v0.noites : v0.dias;
    const unidade = v0.tipo === "hotel" ? (n === 1 ? "noite" : "noites") : n === 1 ? "dia" : "dias";
    const partes = linhas.length > 1 ? `; ${lista(linhas.map((l) => `${l.nome} ${valorPorExtenso(l.v)}`))}` : "";
    return `cerca de ${total}${n ? ` (${n} ${unidade}${partes})` : partes ? ` (${partes.slice(2)})` : ""}`;
  }
  return linhas.length > 1 ? `${total} (${lista(linhas.map((l) => `${l.nome} ${valorPorExtenso(l.v)}`))})` : total;
}
const lista = (n: string[]) => (n.length <= 1 ? n[0] ?? "" : `${n.slice(0, -1).join(", ")} e ${n[n.length - 1]}`);
