import { dataCurta, inicioDoDia } from "./util";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

/**
 * Horário de um dia que ainda não chegou: "amanhã (quarta, 18/11)" ou "quarta, 18/11". Hoje ou dia que já passou: null
 * (concluir depois do dia é normal: a pessoa esqueceu de fechar a conta na hora).
 */
export function diaQueAindaNaoChegou(inicio: Date | string, agora = new Date()): string | null {
  const x = new Date(inicio);
  const dif = Math.round((inicioDoDia(x).getTime() - inicioDoDia(agora).getTime()) / 864e5);
  if (dif <= 0) return null;
  const dia = `${DIAS[x.getDay()]}, ${dataCurta(x)}`;
  return dif === 1 ? `amanhã (${dia})` : dia;
}

type Perguntar = (p: { titulo: string; texto?: string; confirmar?: string; perigo?: boolean }) => Promise<boolean>;

/**
 * Antes de concluir (ou fechar a conta de) um horário de outro dia: pergunta. Achado da Neide: concluiu hoje os horários de
 * amanhã sem perceber, e o dinheiro caiu fora do caixa. Horário de hoje ou de antes: não pergunta. Devolve false para voltar.
 */
export async function conferirDiaDoHorario(inicio: Date | string, perguntar: Perguntar, comDinheiro = false) {
  const dia = diaQueAindaNaoChegou(inicio);
  if (!dia) return true;
  return perguntar({
    titulo: `Este horário é de ${dia}`,
    texto: `Concluir agora conta como atendido hoje${comDinheiro ? ": o que for recebido entra no dinheiro de hoje (no caixa de hoje, se ele estiver aberto)" : ""}. Se o pet ainda não veio, volte: o horário fica marcado para ${dia.replace(/^amanhã \((.*)\)$/, "$1")}.`,
    confirmar: "Concluir hoje mesmo assim",
  });
}
