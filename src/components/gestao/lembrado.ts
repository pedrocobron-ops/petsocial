/** Pequenas lembranças guardadas no aparelho (cartão dispensado, passo visto). Sem armazenamento, segue sem lembrar. */
export function lerLembrado(chave: string): string | null {
  try { return localStorage.getItem(chave); } catch { return null; }
}
export function guardarLembrado(chave: string, valor: string) {
  try { localStorage.setItem(chave, valor); } catch { /* aparelho sem armazenamento: só não lembra */ }
}

/** Pede para o atalho do link de agendamento (que já está na tela) abrir a sua janela. */
export const EVENTO_LINK = "gestao:link";
export const abrirLinkDeAgendamento = () => window.dispatchEvent(new Event(EVENTO_LINK));
