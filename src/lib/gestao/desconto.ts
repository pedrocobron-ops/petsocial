/**
 * Desconto em % na conta (caixa e conta do atendimento). O banco guarda o desconto em reais (a conta fecha em reais e a trava
 * de preço confere em reais): a % vira reais aqui, sobre a soma da conta (já sem a promoção do horário), arredondada no centavo.
 */

const centavos = (n: number) => Math.round(n * 100) / 100;

/** 10% de R$ 95,00 = R$ 9,50. `maximo`: o teto em reais da trava de preço (o arredondamento nunca passa dele). */
export function descontoDoPct(base: number, pct: number | null | undefined, maximo?: number | null): number | null {
  if (pct == null || !(pct > 0) || !(base > 0)) return null;
  const reais = centavos((base * Math.min(pct, 100)) / 100);
  return maximo != null && reais > maximo && reais - maximo < 0.011 ? maximo : reais;
}

/** A % que um desconto em reais dá sobre a soma ("9,50 de 95,00" = 10%), com até uma casa. */
export function pctDoDesconto(base: number, reais: number | null | undefined): number | null {
  if (reais == null || !(reais > 0) || !(base > 0)) return null;
  return Math.round((reais / base) * 1000) / 10;
}
