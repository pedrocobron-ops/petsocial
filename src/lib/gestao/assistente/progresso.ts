/**
 * O que o Mozart está fazendo enquanto a pessoa espera ("Procurando Thor…", "Olhando a agenda de amanhã…"): uma frase curta
 * por consulta, mostrada embaixo dos três pontinhos. Sem `entrada` (a ferramenta acabou de ser escolhida e o modelo ainda
 * está escrevendo o pedido), sai a frase geral; com a entrada, a frase fica mais exata.
 */

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** "hoje", "amanhã", "ontem", "sexta, 20/11". `agora` é o horário local do pet shop ("AAAA-MM-DDTHH:mm"). */
export function nomeDoDia(dia: string, agora?: string): string {
  if (!RE_DIA.test(dia)) return "";
  const hoje = agora && RE_DIA.test(agora.slice(0, 10)) ? agora.slice(0, 10) : null;
  if (hoje) {
    const dif = Math.round((Date.parse(`${dia}T00:00:00Z`) - Date.parse(`${hoje}T00:00:00Z`)) / 864e5);
    if (dif === 0) return "hoje";
    if (dif === 1) return "amanhã";
    if (dif === -1) return "ontem";
  }
  return `${DIAS[new Date(`${dia}T00:00:00Z`).getUTCDay()]}, ${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

/** Período de/ate em palavras: "de hoje", "de amanhã", "da semana", "do período". */
function periodo(de: unknown, ate: unknown, agora?: string): string {
  const a = typeof de === "string" ? de : "", b = typeof ate === "string" ? ate : a;
  if (!RE_DIA.test(a)) return "";
  if (a === b || !RE_DIA.test(b)) return `de ${nomeDoDia(a, agora)}`;
  const dias = Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5) + 1;
  if (dias === 7) return "da semana";
  if (dias >= 28 && dias <= 31) return "do mês";
  return "do período";
}

/** Nome que a pessoa disse, limpo para a tela: sem símbolos, no máximo 40 letras, com a primeira maiúscula. */
function termo(v: unknown): string {
  if (typeof v !== "string") return "";
  const t = v.replace(/[^\p{L}\p{N} '\-]/gu, " ").replace(/\s+/g, " ").trim().slice(0, 40);
  if (!t || /^\d+$/.test(t)) return t;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

type Entrada = Record<string, unknown>;
const FRASES: Record<string, (e: Entrada | null, agora?: string, casa?: string) => string> = {
  buscar_pets: (e) => { const t = termo(e?.termo); return t ? `Procurando ${t}…` : "Procurando o pet…"; },
  ver_agenda: (e, agora) => { const p = e ? periodo(e.de, e.ate, agora) : ""; return p ? `Olhando a agenda ${p}…` : "Olhando a agenda…"; },
  horarios_livres: (e, agora) => { const d = typeof e?.dia === "string" ? nomeDoDia(e.dia, agora) : ""; return d ? `Vendo os horários livres de ${d}…` : "Vendo os horários livres…"; },
  clientes_sumidos: () => "Vendo quem está sumido…",
  ver_estoque: (e) => { const t = termo(e?.termo); return t ? `Conferindo ${t} no estoque…` : "Conferindo o estoque…"; },
  resumo_financeiro: (e, agora) => { const p = e ? periodo(e.de, e.ate, agora) : ""; return p ? `Somando o dinheiro ${p}…` : "Somando o dinheiro…"; },
  contas_em_aberto: () => "Conferindo as contas em aberto…",
  quem_me_deve: () => "Vendo quem está devendo…",
  // só hotel: "no hotel"; só creche: "na creche"
  ver_hospedes: (_e, _a, casa) => (casa === "Hotel" ? "Olhando quem está no hotel…" : casa === "Creche" ? "Olhando quem está na creche…" : "Olhando quem está na creche e no hotel…"),
  reservar_estadia: () => "Preparando a reserva para você conferir…",
  ver_sinais: () => "Somando os sinais…",
  ver_maquininha: () => "Olhando o que a maquininha vai pagar…",
  ver_descontos: () => "Somando os descontos…",
  ver_pacotes: () => "Conferindo os pacotes…",
  ver_caixa: () => "Conferindo o caixa…",
  ver_saude: () => "Olhando as vacinas e os cuidados…",
  preparar_mensagens: () => "Escrevendo as mensagens…",
  ver_planos_creche: () => "Olhando os planos da creche…",
  ver_comissao: () => "Calculando a comissão…",
  o_que_comprar: () => "Vendo o que precisa comprar…",
  mensagens_para_mandar: () => "Contando as mensagens para mandar…",
  ver_lucro: () => "Calculando quanto sobrou…",
  ver_contas_fixas: () => "Somando as contas fixas…",
};

/** A primeira frase de cada pedido, antes de o modelo responder: "Pensando…" ou, depois do "Pode fazer", "Conferindo o que ficou feito…". */
export function fraseInicial(mensagens: { role: string; content?: unknown }[]): string {
  const ultima = mensagens[mensagens.length - 1];
  const respondeuCartao = ultima?.role === "user" && Array.isArray(ultima.content) && ultima.content.some((b) => (b as { type?: string })?.type === "tool_result");
  return respondeuCartao ? "Conferindo o que ficou feito…" : "Pensando…";
}
/** Depois das consultas, enquanto o modelo escreve a resposta com o que elas trouxeram. */
export const FRASE_JUNTANDO = "Juntando a resposta…";

/** Frase de uma ferramenta que grava (o cartão): o Mozart prepara para a pessoa conferir. */
const PREPARANDO = "Preparando para você conferir…";

/** A frase de uma ferramenta. Nome desconhecido: "Conferindo…". `casa`: "Creche", "Hotel" ou "Creche e hotel" (`nomeDaCasa`). */
export function fraseDaFerramenta(nome: string, entrada?: unknown, agora?: string, grava?: boolean, casa?: string): string {
  const f = FRASES[nome];
  if (!f) return grava ? PREPARANDO : "Conferindo…";
  const e = entrada && typeof entrada === "object" ? (entrada as Entrada) : null;
  return f(e, agora, casa);
}

/** Todas as consultas que têm frase própria (o teste confere que nenhuma ferramenta de leitura ficou sem). */
export const FERRAMENTAS_COM_FRASE = Object.keys(FRASES);
