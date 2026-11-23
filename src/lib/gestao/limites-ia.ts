/**
 * Os avisos de limite de uso da IA (pedidos ao Mozart e páginas lidas), iguais na tela e nas rotas. Os números vêm sempre do
 * banco (o limite em vigor, o de quem paga e se a conta está em teste: `assistente_contar_v2`, `caderno_contar` e
 * `mozart_anexo_reservar`, migração 20261248); aqui só se monta a frase. Sem promessa e sem pressão de venda.
 *
 * Páginas: cada foto, print ou página de PDF conta uma, e o saldo do dia é um só para a Foto do caderno e para os anexos do
 * Mozart (padrão: 20 por dia para quem paga, 10 no teste; config_interna `caderno_dia` e `caderno_teste_dia`).
 * Pedidos ao Mozart: 150 por dia para quem paga, 50 no teste (config_interna `mozart_loja_dia` e `mozart_teste_dia`).
 *
 * Sem importações: os testes de unidade leem este arquivo direto.
 */

/** O que o banco devolve junto com a contagem. */
export type LimiteDoBanco = { limite?: number | null; pago?: number | null; teste?: boolean | null };
/** O saldo de páginas do dia. */
export type SaldoDePaginas = { restam: number; limite: number; pago?: number | null; teste?: boolean | null };

const inteiro = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null);

/** Lê com cuidado o saldo que veio do banco ou da rota; null se não tem os números. */
export function lerSaldo(bruto: unknown): SaldoDePaginas | null {
  if (!bruto || typeof bruto !== "object") return null;
  const b = bruto as Record<string, unknown>;
  const restam = inteiro(b.restam), limite = inteiro(b.limite);
  if (restam == null || limite == null) return null;
  return { restam, limite, pago: inteiro(b.pago), teste: b.teste === true };
}

const paginas = (n: number) => (n === 1 ? "1 foto ou página" : `${n} fotos ou páginas`);
/** "No plano pago são 20 por dia.": só no teste e só quando o plano pago dá mais. */
const noPago = (l: LimiteDoBanco, o: (n: number) => string) => (l.teste && l.pago != null && l.limite != null && l.pago > l.limite ? ` ${o(l.pago)}` : "");

/**
 * Pedidos ao Mozart: o limite do dia acabou. Sem os números (banco antes da migração 20261248), devolve null e a rota usa a
 * frase de antes.
 */
export function textoDoLimiteDoMozart(l: LimiteDoBanco | null | undefined): string | null {
  const limite = inteiro(l?.limite);
  if (!l || limite == null || limite <= 0) return null;
  const telas = "Enquanto isso, as telas continuam funcionando pelos botões.";
  if (l.teste) return `Você chegou ao limite do período de teste: ${limite} pedidos ao Mozart por dia. Amanhã renova. ${telas}${noPago(l, (n) => `No plano pago, o limite é de ${n} pedidos por dia.`)}`;
  return `Você chegou ao limite de hoje: ${limite} pedidos ao Mozart por dia. Amanhã renova. ${telas}`;
}

/** Páginas: o pedido não cabe no que resta de hoje (ou o dia acabou). `pedidas`: quantas a pessoa tentou mandar. */
export function textoDoLimiteDePaginas(s: SaldoDePaginas): string {
  if (s.restam > 0) {
    return `Hoje ainda dá para ler ${paginas(s.restam)} (o limite ${s.teste ? "do período de teste " : ""}é de ${s.limite} por dia). Mande menos, ou continue amanhã.${noPago(s, (n) => `No plano pago são ${n} por dia.`)}`;
  }
  if (s.teste) return `Você chegou ao limite do período de teste: ${s.limite} fotos ou páginas por dia. Amanhã renova.${noPago(s, (n) => `No plano pago são ${n} por dia.`)}`;
  return `Você chegou ao limite de hoje: ${s.limite} fotos ou páginas por dia. Amanhã renova.`;
}

/** A partir de quantas páginas restantes a tela avisa que o saldo está acabando. */
export const SALDO_ACABANDO = 3;

/**
 * A linha do saldo perto do botão (do anexo do Mozart): só quando está acabando ou acabou; senão, null.
 * A Foto do caderno mostra sempre (`sempre`).
 */
export function linhaDoSaldo(s: SaldoDePaginas | null | undefined, sempre = false): string | null {
  if (!s) return null;
  if (s.restam <= 0) return textoDoLimiteDePaginas(s);
  if (!sempre && s.restam > SALDO_ACABANDO) return null;
  return `Hoje ainda dá para ler ${paginas(s.restam)}${s.teste ? ` (no teste são ${s.limite} por dia)` : ""}. A Foto do caderno e o Mozart usam o mesmo saldo.`;
}
