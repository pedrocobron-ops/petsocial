import { saudacaoZap, textoLembrete } from "./agenda";
import { servicosPorExtenso } from "./servicos-do-horario";
import { dataAmigavel, dataCompleta, deIsoDia, hora, inicioDoDia, semAcento } from "./util";

/**
 * Textos de WhatsApp que mais de uma tela monta (a tela de origem e o Modo envio): o lembrete do horário, o aviso de saúde
 * e o "chamar de volta" e o aniversário. Sem React: o Mozart e os testes usam os mesmos.
 */

/* ---------- lembrete do horário (Agenda, tela Hoje, Modo envio) ---------- */

type NaOrdem = { ordem: number };
/** O mínimo de um horário para o lembrete. */
export type HorarioDoLembrete = {
  inicio: string;
  pets?: { nome: string; clientes?: { nome: string } | null } | null;
  servicos?: { nome: string } | null;
  agendamento_servicos?: (NaOrdem & { servicos: { nome: string } | null })[] | null;
};

/** Mensagem do lembrete. Um horário: a mesma do detalhe. Mais de um do mesmo tutor no dia: uma mensagem só, citando todos. */
export function mensagemDoLembrete(ags: HorarioDoLembrete[], petshop: string) {
  const tutor = ags[0]?.pets?.clientes?.nome;
  if (ags.length === 1) {
    const a = ags[0];
    return textoLembrete({ tutor, pet: a.pets?.nome ?? "seu pet", servico: servicosPorExtenso(a), quando: dataAmigavel(a.inicio), hora: hora(a.inicio), petshop });
  }
  const partes = ags.map((a) => `${servicosPorExtenso(a)?.toLowerCase() ?? "horário"} de ${a.pets?.nome ?? "seu pet"} às ${hora(a.inicio)}`);
  const lista = `${partes.slice(0, -1).join(", ")} e ${partes[partes.length - 1]}`;
  return `${saudacaoZap(tutor, petshop)} Passando para lembrar dos horários de ${dataAmigavel(ags[0].inicio)}: ${lista}. Posso confirmar?`;
}

/* ---------- saúde (ficha do pet, Modo envio) ---------- */

/** Dias até o vencimento (negativo = já venceu). Sem data devolve null. */
export function diasParaVencer(venceEm: string | null | undefined, hoje: Date = new Date()): number | null {
  if (!venceEm) return null;
  return Math.round((deIsoDia(venceEm).getTime() - inicioDoDia(hoje).getTime()) / 864e5);
}

const ROTULO_SAUDE: Record<string, string> = { vacina: "Vacina", vermifugo: "Vermífugo", antipulgas: "Antipulgas" };

/** Mensagem pronta para o tutor: só lembra o cuidado e a data. Quem orienta é o veterinário dele. */
export function mensagemSaude(tutorNome: string, petNome: string, petshopNome: string, alerta: { tipo: string; nome: string; vence_em: string | null }[], hoje: Date = new Date()) {
  const linhas = alerta.map((c) => {
    const rotulo = ROTULO_SAUDE[c.tipo];
    const dias = diasParaVencer(c.vence_em, hoje) ?? 0;
    const nome = !rotulo || semAcento(c.nome) === semAcento(rotulo) ? c.nome : `${rotulo} ${c.nome}`;
    const quando = dias < 0 ? `venceu em ${dataCompleta(c.vence_em!)}` : dias === 0 ? "vence hoje" : `vence em ${dataCompleta(c.vence_em!)}`;
    return `- ${nome}: ${quando}`;
  });
  return [
    `${saudacaoZap(tutorNome, petshopNome)} Tudo bem?`,
    "",
    `Passando para lembrar ${alerta.length === 1 ? "de um cuidado" : "dos cuidados"} de ${petNome} que ${alerta.length === 1 ? "está" : "estão"} na nossa ficha:`,
    ...linhas,
    "",
    "Quando puder, vale conversar com o veterinário de vocês para ver a próxima dose. Depois é só nos contar a data nova que a gente atualiza a ficha.",
  ].join("\n");
}

/* ---------- chamar de volta e aniversário (Clientes, tela Hoje, Modo envio) ---------- */

export type AbaChamar = "volta" | "niver";

/** "Thor", "Thor e Mel", "Thor, Mel e Luna". */
export const juntarNomes = (n: string[]) => (n.length <= 1 ? n[0] ?? "" : `${n.slice(0, -1).join(", ")} e ${n[n.length - 1]}`);

/** Os textos padrão (o pet shop muda os dele em Chamar de volta; ficam em `modelos_mensagem`). */
export const MODELOS_PADRAO: Record<AbaChamar, string> = {
  volta: "Faz um tempinho desde a última visita de [pet]. Quer que eu veja um horário?",
  niver: "A gente lembrou do aniversário de [pet] e passou para dar os parabéns! Muita saúde e muito carinho.",
};
/** Como cada texto se chama na tabela `modelos_mensagem`. */
export const CHAVE_NO_BANCO: Record<AbaChamar, string> = { volta: "chamar.volta", niver: "chamar.niver" };

/** A mensagem inteira: a saudação entra sozinha e `[pet]` vira o nome do pet (ou dos pets) do tutor. Texto em branco usa o padrão. */
export function montarMensagem(aba: AbaChamar, modelo: string, p: { tutor: string | null; pets: string[]; petshop: string }) {
  const corpo = (modelo.trim() || MODELOS_PADRAO[aba]).replace(/\[pet\]/gi, juntarNomes(p.pets) || "seu pet");
  return `${saudacaoZap(p.tutor, p.petshop)} ${corpo}`;
}
