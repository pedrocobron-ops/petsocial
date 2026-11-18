/**
 * A conversa do Mozart guardada na aba (sessionStorage), por pet shop e por pessoa: recarregar a página (o celular troca de
 * aplicativo, puxar para atualizar) traz de volta a conversa e o cartão que espera o "Pode fazer". O cartão volta pendente:
 * ainda precisa da confirmação. Se a página recarregou no meio de um "Pode fazer" (`decidindo`), o aplicativo manda a mesma
 * confirmação de novo para terminar; o servidor grava cada cartão uma vez só (função `assistente_acao_reservar`).
 * Guardado só nesta aba e por no máximo 12 horas; sair da conta apaga (o sessionStorage é da aba).
 */
export type ConversaGuardada<I = unknown> = {
  v: 1; em: number;
  itens: I[]; mensagens: unknown[]; parciais: unknown[];
  /** "Pode fazer" mandado e sem resposta ainda: as decisões, para mandar de novo. */
  decidindo: { decisoes: { id: string; ok: boolean }[]; parciais: unknown[] } | null;
  /** Pedido de texto mandado e sem resposta ainda (a página recarregou antes). */
  esperando: boolean;
  /** O painel estava aberto: volta aberto depois de recarregar. */
  aberta: boolean;
  /** O texto que já tinha chegado quando a página saiu no meio da resposta (volta marcado como interrompido). */
  interrompida?: string | null;
};

const VALIDADE_MS = 12 * 3600_000;
export const chaveDaConversa = (petshop: string, usuario: string) => `gestao:mozart:${petshop}:${usuario}`;

function caixa(): Storage | null {
  try { return typeof window !== "undefined" && window.sessionStorage ? window.sessionStorage : null; } catch { return null; }
}

export function lerConversa<I = unknown>(chave: string, agora = Date.now()): ConversaGuardada<I> | null {
  try {
    const s = caixa()?.getItem(chave);
    if (!s) return null;
    const c = JSON.parse(s) as ConversaGuardada<I>;
    if (!c || c.v !== 1 || !Array.isArray(c.itens) || !Array.isArray(c.mensagens) || agora - Number(c.em) > VALIDADE_MS) { apagarConversa(chave); return null; }
    return { ...c, parciais: Array.isArray(c.parciais) ? c.parciais : [], decidindo: c.decidindo ?? null, esperando: Boolean(c.esperando), aberta: Boolean(c.aberta), interrompida: typeof c.interrompida === "string" ? c.interrompida.slice(0, 8000) : null };
  } catch { return null; }
}

export function guardarConversa<I>(chave: string, c: Omit<ConversaGuardada<I>, "v" | "em">) {
  const s = caixa();
  if (!s) return;
  const vazia = !c.itens.length && !c.mensagens.length && !c.aberta;
  try {
    if (vazia) { s.removeItem(chave); return; }
    s.setItem(chave, JSON.stringify({ v: 1, em: Date.now(), ...c }));
  } catch {
    // aba sem espaço: guarda pelo menos o que aparece na tela e o cartão (sem o histórico do modelo)
    try { s.setItem(chave, JSON.stringify({ v: 1, em: Date.now(), ...c, mensagens: [], parciais: [], decidindo: null })); } catch { /* segue sem guardar */ }
  }
}

export function apagarConversa(chave: string) {
  try { caixa()?.removeItem(chave); } catch { /* segue */ }
}

/** Depois de recarregar: o painel abre sozinho se estava aberto ou se um "Pode fazer" ficou no meio do caminho. */
export function abrirDepoisDeRecarregar(chave: string): boolean {
  const c = lerConversa(chave);
  return Boolean(c && (c.aberta || c.decidindo));
}
