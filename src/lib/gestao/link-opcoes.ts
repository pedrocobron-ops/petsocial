import { opcao } from "./opcoes";

/**
 * Opções do link do cliente (Meu pet shop): regras que o tutor aceita antes de pedir e o cancelamento pela página do pedido.
 * Tudo começa desligado: quem não mexer aqui continua com o link de sempre.
 * O banco lê as mesmas chaves (função `link_opcoes_de`): mudou uma chave aqui, mude lá.
 */
export const OPCOES_LINK = {
  termos: "link.termos",
  termosTexto: "link.termos_texto",
  termosVacinas: "link.termos_vacinas",
  cancelar: "link.cancelar",
  cancelarHoras: "link.cancelar_horas",
} as const;

export const MAX_TERMOS = 2000;
export const HORAS_PADRAO = 24;
export const MAX_HORAS = 720;

/** Só um exemplo de formato para o dono trocar pelo texto dele. Não é modelo de contrato. */
export const EXEMPLO_DE_REGRAS = "Exemplo: Traga a carteira de vacinação no primeiro dia. Atrasos de mais de 15 minutos podem precisar de um novo horário.";

type ComOpcoes = { opcoes?: unknown };

export function opcoesDoLink(petshop: ComOpcoes) {
  const texto = opcao(petshop, OPCOES_LINK.termosTexto, "").trim().slice(0, MAX_TERMOS);
  const vacinas = opcao(petshop, OPCOES_LINK.termosVacinas, false);
  const horas = opcao(petshop, OPCOES_LINK.cancelarHoras, HORAS_PADRAO);
  const termos = opcao(petshop, OPCOES_LINK.termos, false);
  return {
    /** A chave do aceite está ligada (só vale no link quando há texto ou a declaração de vacinas). */
    termos,
    termosTexto: texto,
    termosVacinas: vacinas,
    /** O link está mesmo pedindo o aceite. */
    pedeAceite: termos && (texto !== "" || vacinas),
    cancelar: opcao(petshop, OPCOES_LINK.cancelar, false),
    cancelarHoras: Number.isFinite(horas) ? Math.min(MAX_HORAS, Math.max(0, Math.round(horas))) : HORAS_PADRAO,
  };
}

/** O pet shop já mexeu em alguma opção do link? (as telas nem procuram aceite ou cancelamento em quem nunca usou) */
export function usouOpcoesDoLink(petshop: ComOpcoes) {
  const o = petshop.opcoes;
  return !!o && typeof o === "object" && Object.values(OPCOES_LINK).some((k) => k in (o as Record<string, unknown>));
}

/** "até 24 horas antes", "até 2 dias antes", "até a hora marcada". */
export function prazoPorExtenso(horas: number) {
  if (horas <= 0) return "até a hora marcada";
  if (horas % 24 === 0) return horas === 24 ? "até 24 horas antes" : `até ${horas / 24} dias antes`;
  return horas === 1 ? "até 1 hora antes" : `até ${horas} horas antes`;
}

/** O que a página do link recebe do banco (`link_opcoes`). */
export type OpcoesNoLink = { termos: { texto: string; vacinas: boolean } | null; cancelar: { horas: number } | null };

/* ---------- pedidos lembrados neste aparelho (página pública) ---------- */

export type PedidoLembrado = { id: string; em: number; resumo: string };
const chaveDosPedidos = (codigo: string) => `mpg-pedidos-${codigo}`;
const VALE_POR = 90 * 864e5;

/** Pedidos feitos neste aparelho por este link, do mais novo para o mais antigo. Nada sai do aparelho. */
export function pedidosLembrados(codigo: string): PedidoLembrado[] {
  try {
    const lido = JSON.parse(window.localStorage.getItem(chaveDosPedidos(codigo)) ?? "[]") as unknown;
    if (!Array.isArray(lido)) return [];
    return (lido as PedidoLembrado[])
      .filter((x) => x && typeof x.id === "string" && /^[0-9a-f-]{36}$/i.test(x.id) && typeof x.em === "number" && Date.now() - x.em < VALE_POR)
      .map((x) => ({ id: x.id, em: x.em, resumo: String(x.resumo ?? "").slice(0, 120) }))
      .slice(0, 5);
  } catch { return []; }
}
export function lembrarPedido(codigo: string, id: string, resumo: string) {
  try {
    const lista = [{ id, em: Date.now(), resumo: resumo.slice(0, 120) }, ...pedidosLembrados(codigo).filter((x) => x.id !== id)].slice(0, 5);
    window.localStorage.setItem(chaveDosPedidos(codigo), JSON.stringify(lista));
  } catch { /* aparelho sem espaço ou em modo privado: segue sem lembrar */ }
}
export function esquecerPedido(codigo: string, id: string) {
  try {
    window.localStorage.setItem(chaveDosPedidos(codigo), JSON.stringify(pedidosLembrados(codigo).filter((x) => x.id !== id)));
  } catch { /* nada a fazer */ }
}
