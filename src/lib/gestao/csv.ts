/**
 * Célula de planilha (CSV) segura: entre aspas, com as aspas de dentro dobradas, e, se o texto começa com = + - @ (ou
 * tabulação/retorno), com um apóstrofo na frente, para o Excel e o Google Planilhas não lerem como fórmula.
 * Use em toda exportação que leva texto vindo de fora (nome, observação, navegador de quem acessou).
 * Sem importações: os testes leem este arquivo direto.
 */
export function celulaCsv(v: string | number | null | undefined): string {
  const s = String(v ?? "");
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
}
