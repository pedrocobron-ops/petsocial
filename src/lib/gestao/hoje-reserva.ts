import { ehDemora, ehDeRede } from "./erros";

/**
 * A tela Hoje lê tudo numa ida ao banco (`gestao_hoje`). Quando essa leitura falha, vale ler do jeito antigo (umas 25
 * consultas ao mesmo tempo)? Só quando o problema é da função (não existe neste banco, ou quebrou por dentro). Quando o banco
 * demorou demais, está sem conexão livre, o servidor respondeu 5xx ou a internet caiu, não: as 25 consultas chegariam bem na
 * hora em que o banco está cheio e piorariam a fila de todo mundo. Aí a tela mostra o erro com "Tentar de novo".
 */
export function leituraAntigaVale(erro: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!erro) return true;
  const codigo = String(erro.code ?? ""), m = String(erro.message ?? "");
  // tempo esgotado, consulta cancelada, fila de conexões da API, banco sem recursos ou sem conexão
  if (/^(57014|57P0[1-3]|55P03|PGRST00[0-3])$/.test(codigo) || /^(53|08)/.test(codigo)) return false;
  if (ehDemora(m) || ehDeRede(m)) return false;
  if (/too many connections|remaining connection slots|Service Unavailable|Bad Gateway|Internal Server Error|\b50[0-4]\b|upstream/i.test(m)) return false;
  return true;
}
