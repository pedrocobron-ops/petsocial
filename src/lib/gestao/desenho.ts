/**
 * Regras pequenas de desenho e acessibilidade que valem para o aplicativo inteiro (rodada 9), sem tela nem banco:
 * quanto tempo um aviso rápido fica na tela, quando um erro de tela é só falta de internet e quais elementos recebem o
 * foco do teclado dentro de uma folha.
 */

/** Tempo mínimo de um aviso rápido e quanto cada letra acrescenta (leitura calma: cerca de 16 letras por segundo). */
const AVISO_MINIMO = 4000, AVISO_POR_LETRA = 60, AVISO_MAXIMO = 12000;

/**
 * Quanto tempo (ms) o aviso rápido fica na tela: pelo tamanho do texto, nunca menos de 4 s. Erro fica pelo menos 6 s e
 * aviso com botão (Desfazer) pelo menos 8 s, porque a pessoa ainda precisa decidir e tocar.
 */
export function tempoDoAviso(texto: string, o: { erro?: boolean; acao?: boolean } = {}): number {
  const piso = o.acao ? 8000 : o.erro ? 6000 : AVISO_MINIMO;
  const peloTexto = (texto ?? "").trim().length * AVISO_POR_LETRA;
  return Math.min(AVISO_MAXIMO, Math.max(piso, peloTexto));
}

/**
 * O erro que derrubou a tela é só falta de internet? Sem conexão o navegador não baixa o pedaço da tela seguinte
 * (ChunkLoadError) nem os dados: isso não é defeito do aplicativo e a equipe não precisa ser avisada.
 */
export function ehFaltaDeInternet(erro: { name?: string; message?: string } | null | undefined, online: boolean): boolean {
  if (!online) return true;
  const texto = `${erro?.name ?? ""} ${erro?.message ?? ""}`;
  return /ChunkLoadError|Loading chunk [^ ]+ failed|Loading CSS chunk|Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i.test(texto);
}

/** O que recebe o foco do teclado (Tab) dentro de uma folha. */
export const SELETOR_FOCAVEL = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

/**
 * Para onde o Tab vai dentro de uma folha, dando a volta: do último para o primeiro e, com Shift, do primeiro para o último.
 * `atual` é a posição de quem tem o foco na lista (-1 quando o foco está fora dela). Devolve a posição de destino, ou null
 * quando o navegador pode seguir sozinho (está no meio da lista).
 */
export function proximoNoTab(total: number, atual: number, paraTras: boolean): number | null {
  if (total <= 0) return null;
  if (atual < 0) return paraTras ? total - 1 : 0;
  if (paraTras) return atual === 0 ? total - 1 : null;
  return atual === total - 1 ? 0 : null;
}
