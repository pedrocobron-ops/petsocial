import { saudacaoZap } from "./agenda";
import { lembreteDoHorario, localDe, type OndeDoPetshop } from "./lembrete-zap";
import { dataCompleta, deIsoDia, inicioDoDia, semAcento } from "./util";

/**
 * Textos de WhatsApp que mais de uma tela monta (a tela de origem e o Modo envio): o lembrete do horário, o aviso de saúde
 * e o "chamar de volta" e o aniversário. Sem React: o Mozart e os testes usam os mesmos.
 */

/* ---------- lembrete do horário (Agenda, tela Hoje, Modo envio) ---------- */

type NaOrdem = { ordem: number };
/** O mínimo de um horário para o lembrete. */
export type HorarioDoLembrete = {
  inicio: string;
  /** Fim do horário (para o "término previsto"); sem ele, a linha não diz o término. */
  fim?: string | null;
  pets?: { nome: string; sexo?: string | null; clientes?: { nome: string } | null } | null;
  servicos?: { nome: string } | null;
  agendamento_servicos?: (NaOrdem & { servicos: { nome: string } | null })[] | null;
};

/** Os nomes dos serviços do horário, na ordem (o principal primeiro). */
const nomesDosServicos = (a: HorarioDoLembrete) => [a.servicos?.nome, ...[...(a.agendamento_servicos ?? [])].sort((x, y) => x.ordem - y.ordem).map((x) => x.servicos?.nome)].filter((n): n is string => Boolean(n));

/**
 * Mensagem do lembrete (o modelo de `lembrete-zap.ts`). Um horário ou mais de um do mesmo tutor no dia: uma mensagem só.
 * `petshop`: o nome, ou o nome com o endereço (com ele, a linha 📍). `agora`: para "Hoje" e "Amanhã" (relógio do aparelho).
 */
export function mensagemDoLembrete(ags: HorarioDoLembrete[], petshop: string | OndeDoPetshop, agora: Date = new Date()) {
  return lembreteDoHorario({
    tutor: ags[0]?.pets?.clientes?.nome,
    petshop: typeof petshop === "string" ? { nome: petshop } : petshop,
    hoje: localDe(agora).slice(0, 10),
    horarios: ags.map((a) => ({ inicio: localDe(a.inicio), fim: a.fim ? localDe(a.fim) : null, pets: [{ nome: a.pets?.nome ?? "seu pet", servicos: nomesDosServicos(a) }] })),
  });
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
/** Os textos que o pet shop pode mudar: os do Chamar de volta e o do aniversário do tutor. */
export type ModeloChave = AbaChamar | "niver_tutor";

/** "Thor", "Thor e Mel", "Thor, Mel e Luna". */
export const juntarNomes = (n: string[]) => (n.length <= 1 ? n[0] ?? "" : `${n.slice(0, -1).join(", ")} e ${n[n.length - 1]}`);

/** Os textos padrão (o pet shop muda os dele em Chamar de volta; ficam em `modelos_mensagem`). */
export const MODELOS_PADRAO: Record<ModeloChave, string> = {
  volta: "Faz um tempinho desde a última visita de [pet]. Quer que eu veja um horário?",
  niver: "A gente lembrou do aniversário de [pet] e passou para dar os parabéns! Muita saúde e muito carinho.",
  niver_tutor: "Hoje é o seu aniversário! Toda a equipe deseja um dia muito feliz para você. Um abraço também para [pet].",
};
/** Como cada texto se chama na tabela `modelos_mensagem`. */
export const CHAVE_NO_BANCO: Record<ModeloChave, string> = { volta: "chamar.volta", niver: "chamar.niver", niver_tutor: "chamar.niver_tutor" };

/** A mensagem inteira: a saudação entra sozinha e `[pet]` vira o nome do pet (ou dos pets) do tutor. Texto em branco usa o padrão. */
export function montarMensagem(aba: ModeloChave, modelo: string, p: { tutor: string | null; pets: string[]; petshop: string }) {
  const corpo = (modelo.trim() || MODELOS_PADRAO[aba]).replace(/\[pet\]/gi, juntarNomes(p.pets) || "seu pet");
  return `${saudacaoZap(p.tutor, p.petshop)} ${corpo}`;
}
