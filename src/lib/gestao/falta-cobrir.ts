import { brl } from "./util";

/**
 * A frase da linha "contas fixas" da tela Hoje: quanto falta de faturamento para chegar ao valor das contas fixas do mês,
 * ou que já chegou. Usa os números de `contas_fixas_resumo` (os mesmos do quadro Quanto custa manter o pet shop).
 * Sem contas fixas cadastradas, devolve `null` (a linha não aparece).
 */
export function fraseDasContasFixas(r: { total_mensal: number; faturamento_mes: number; falta: number }) {
  if (!(r.total_mensal > 0)) return null;
  const falta = Math.max(0, Math.round(r.falta * 100) / 100);
  return falta > 0
    ? { titulo: `Faltam ${brl(falta)} para cobrir as contas fixas deste mês`, cobriu: false }
    : { titulo: "O faturamento deste mês já cobre as contas fixas", cobriu: true };
}
