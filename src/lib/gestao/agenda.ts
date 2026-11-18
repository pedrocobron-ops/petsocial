import { chamar } from "./util";
import { usaCasa, usaModulo } from "./modulos";
/** Contas da agenda que não dependem do navegador (a tela e o assistente usam as mesmas). */

export type Intervalo = { inicio: number; fim: number }; // minutos desde 00:00 do dia

export const paraMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + (m || 0); };
export const deMin = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/**
 * Horários de início possíveis num dia: dentro do funcionamento, sem bater com o que já está marcado.
 * `aPartirDe` (minutos) corta os horários que já passaram quando o dia é hoje.
 */
export function horariosLivres(p: { abre: string; fecha: string; duracaoMin: number; ocupados: Intervalo[]; passo?: number; aPartirDe?: number; vagas?: number; bloqueados?: Intervalo[] }): string[] {
  const passo = p.passo ?? 30;
  const abre = paraMin(p.abre), fecha = paraMin(p.fecha);
  const livres: string[] = [];
  for (let t = abre; t + p.duracaoMin <= fecha; t += passo) {
    if (p.aPartirDe != null && t < p.aPartirDe) continue;
    const bate = (o: Intervalo) => t < o.fim && t + p.duracaoMin > o.inicio;
    if (p.bloqueados?.some(bate)) continue;
    // com mais de uma vaga, o horário só some quando todas estão tomadas
    if (p.ocupados.filter(bate).length >= Math.max(1, p.vagas ?? 1)) continue;
    livres.push(deMin(t));
  }
  return livres;
}

/**
 * Quantos pets o pet shop atende ao mesmo tempo: o número definido no guia de configuração
 * ou, se não foi definido, uma vaga por pessoa que atende na agenda.
 */
export function vagasDe(petshop: { vagas?: number | null }, equipe: { ativo: boolean; atende: boolean }[]) {
  return petshop.vagas ?? Math.max(1, equipe.filter((p) => p.ativo && p.atende).length);
}

/**
 * Como o negócio se apresenta numa mensagem: "Aqui é Banho da Neide." Sem "do/da", que só acerta por sorte
 * ("Aqui é do Escolinha", "Aqui é do Hotel Pet"). Todas as mensagens de WhatsApp começam por aqui.
 */
export const aquiE = (petshop: string) => `Aqui é ${petshop.trim()}.`;
/** Saudação inteira: "Oi, Dona Zefa! Aqui é Banho da Neide." */
export const saudacaoZap = (tutor: string | null | undefined, petshop: string) => `${tutor ? `Oi, ${chamar(tutor)}!` : "Oi!"} ${aquiE(petshop)}`;

/**
 * Convite que acompanha o link de agendamento. Quem só tem creche ou hotel convida para pedir vaga, não horário.
 */
export function textoDoLink(petshop: { nome: string; modulos?: string[] | null }, endereco: string, tutor?: string | null) {
  const soVaga = !usaModulo(petshop, "banho_tosa") && usaCasa(petshop);
  const corpo = soVaga
    ? "Agora dá para pedir vaga pelo celular. É só escolher o dia, e a gente confirma por aqui:"
    : "Agora dá para pedir horário pelo celular. É só escolher o serviço, o dia e a hora que estiver livre, e a gente confirma por aqui:";
  return `${saudacaoZap(tutor, petshop.nome)} ${corpo} ${endereco}`;
}

/** Sexo do pet na ficha ("M", "F" ou vazio). */
export type SexoPet = string | null | undefined;
/** "do Thor", "da Mel", "de Bidu" (sem sexo na ficha). */
export const doPet = (pet: string, sexo?: SexoPet) => `${sexo === "F" ? "da" : sexo === "M" ? "do" : "de"} ${pet}`;
/** "Thor marcado", "Mel marcada" (sem sexo: "Bidu marcado", como antes). */
export const marcadoPara = (pet: string, sexo?: SexoPet) => `${pet} ${sexo === "F" ? "marcada" : "marcado"}`;

// serviços que pedem "a" (o resto é "o": o banho, o corte de unhas, o spa)
const FEMININO = /^(tosa|hidrata|escova|limpeza|consulta|vacina|aplica|massagem|tintura|pintura|cauteriza|sess|avalia|higieniza|reconstru|depila|desembara|remo|aromaterapia|ozonioterapia|banheira|selagem|botox|cromoterapia|pedicure|manicure|tosagem|lavagem|secagem)/;
// serviços conhecidos: com eles a mensagem diz o nome ("O banho e a hidratação"); com outros, "O horário" / "O atendimento"
const CONHECIDO = /^(banho|tosa|hidrata|escova|corte|limpeza|spa|desembolo|desembara|tratamento|massagem|banho|tosagem|pedicure|aplica|vacina|consulta|higieniza|cauteriza|reconstru|ozonio|aromaterapia|selagem|botox|cromoterapia|lavagem|secagem)/;

/**
 * "Banho, Hidratação e Tosa" → "O banho, a hidratação e a tosa", com o que o verbo precisa saber: mais de um (plural) e
 * se todos são femininos. Serviço com nome que o sistema não conhece: null (a mensagem diz "O horário").
 */
export function servicoComArtigo(servico: string | null | undefined): { texto: string; varios: boolean; feminino: boolean } | null {
  const s = (servico ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  const partes = s.split(/, | e /).map((x) => x.trim()).filter(Boolean);
  if (!partes.length || !partes.every((x) => CONHECIDO.test(x))) return null;
  const com = partes.map((x) => `${FEMININO.test(x) ? "a" : "o"} ${x}`);
  const lista = com.length === 1 ? com[0] : `${com.slice(0, -1).join(", ")} e ${com[com.length - 1]}`;
  return { texto: lista[0].toUpperCase() + lista.slice(1), varios: partes.length > 1, feminino: partes.every((x) => FEMININO.test(x)) };
}
/** "ficou marcado", "ficou marcada", "ficaram marcados", "ficaram marcadas". */
const concorda = (x: { varios: boolean; feminino: boolean }, um: string, varios: string, part: string) =>
  `${x.varios ? varios : um} ${part}${x.feminino ? "a" : "o"}${x.varios ? "s" : ""}`;

/** Texto do lembrete que vai para o WhatsApp do tutor: "Passando para lembrar do banho e da hidratação da Luna hoje às 16:00." */
export function textoLembrete(p: { tutor?: string | null; pet: string; sexo?: SexoPet; servico?: string | null; quando: string; hora: string; petshop: string }) {
  const x = servicoComArtigo(p.servico);
  const doQue = x ? x.texto.toLowerCase().replace(/(^|, | e )([oa]) /g, (_m, sep: string, art: string) => `${sep}d${art} `) : "do horário";
  return `${saudacaoZap(p.tutor, p.petshop)} Passando para lembrar ${doQue} ${doPet(p.pet, p.sexo)} ${p.quando} às ${p.hora}. Posso confirmar?`;
}

/**
 * Texto do aviso de que o atendimento terminou e o pet pode ir para casa (WhatsApp do tutor).
 * Sem "pronto/pronta", que erra com metade dos pets: "O banho da Mel terminou. Já pode vir buscar."
 */
export function textoPronto(p: { tutor?: string | null; pet: string; sexo?: SexoPet; petshop: string; servico?: string | null }) {
  const x = servicoComArtigo(p.servico);
  return `${saudacaoZap(p.tutor, p.petshop)} ${x ? x.texto : "O atendimento"} ${doPet(p.pet, p.sexo)} ${x?.varios ? "terminaram" : "terminou"}. Já pode vir buscar.`;
}

/** Confirmação de um horário recém-marcado: "O banho da Mel ficou marcado para segunda, 16/11 às 09:00." */
export function textoConfirmacao(p: { tutor?: string | null; pet: string; sexo?: SexoPet; servico?: string | null; quando: string; hora: string; petshop: string }) {
  const x = servicoComArtigo(p.servico) ?? { texto: "O horário", varios: false, feminino: false };
  return `${saudacaoZap(p.tutor, p.petshop)} ${x.texto} ${doPet(p.pet, p.sexo)} ${concorda(x, "ficou", "ficaram", "marcad")} para ${p.quando} às ${p.hora}. Qualquer coisa, é só chamar por aqui.`;
}

/** Aviso de que o horário mudou: "O banho da Nina foi remarcado para amanhã às 14:00." A pessoa manda pelo WhatsApp. */
export function textoRemarcado(p: { tutor?: string | null; pet: string; sexo?: SexoPet; servico?: string | null; quando: string; hora: string; petshop: string }) {
  const x = servicoComArtigo(p.servico) ?? { texto: "O horário", varios: false, feminino: false };
  return `${saudacaoZap(p.tutor, p.petshop)} ${x.texto} ${doPet(p.pet, p.sexo)} ${concorda(x, "foi", "foram", "remarcad")} para ${p.quando} às ${p.hora}. Se esse horário não der, é só avisar que a gente acha outro.`;
}

/** Aviso de que o horário foi cancelado, com o convite para marcar outro dia. */
export function textoCancelado(p: { tutor?: string | null; pet: string; sexo?: SexoPet; quando: string; hora: string; petshop: string }) {
  return `${saudacaoZap(p.tutor, p.petshop)} O horário ${doPet(p.pet, p.sexo)} de ${p.quando} às ${p.hora} foi cancelado. Quando quiser marcar outro dia, é só chamar.`;
}

/* ---------- série (horário que se repete) e bloqueio ---------- */

const RE_DIA = /^\d{4}-\d{2}-\d{2}$/;
const somaDiasIso = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const diaDaSemanaIso = (dia: string) => new Date(`${dia}T00:00:00Z`).getUTCDay();

export const REPETICOES = [
  { semanas: 0, rotulo: "Não repete" },
  { semanas: 1, rotulo: "Toda semana" },
  { semanas: 2, rotulo: "A cada 2 semanas" },
  { semanas: 4, rotulo: "A cada 4 semanas" },
] as const;
export const MOTIVOS_BLOQUEIO = ["Almoço", "Folga", "Feriado", "Manutenção"];

/** Dias (AAAA-MM-DD) de uma série: o primeiro e os seguintes, de N em N semanas. */
export function datasDaSerie(dia: string, aCadaSemanas: number, vezes: number, maximo = 12): string[] {
  if (!RE_DIA.test(dia) || !aCadaSemanas || vezes < 2) return [dia];
  return Array.from({ length: Math.min(maximo, Math.floor(vezes)) }, (_, i) => somaDiasIso(dia, i * 7 * aCadaSemanas));
}

/**
 * Dias úteis a partir de `dia`, por N semanas: os dias em que o pet shop abre
 * (sem horário de funcionamento preenchido, de segunda a sexta). O primeiro dia entra sempre.
 */
export function diasUteis(dia: string, semanas: number, horario: unknown): string[] {
  if (!RE_DIA.test(dia)) return [dia];
  const h = (horario ?? {}) as Record<string, { abre?: string; fecha?: string } | null>;
  const abre = (d: number) => Boolean(h[String(d)]?.abre && h[String(d)]?.fecha);
  const temHorario = [0, 1, 2, 3, 4, 5, 6].some(abre);
  const util = (d: number) => (temHorario ? abre(d) : d >= 1 && d <= 5);
  const out = [dia];
  for (let i = 1; i < Math.max(1, Math.min(8, Math.floor(semanas))) * 7; i++) {
    const d = somaDiasIso(dia, i);
    if (util(diaDaSemanaIso(d))) out.push(d);
  }
  return out;
}

export type BloqueioCurto = { inicio: string; fim: string; profissional_id: string | null };
/** O bloqueio vale para esse profissional (ou é do pet shop inteiro) e cruza o intervalo (em milissegundos)? */
export function bloqueioPega(b: BloqueioCurto, profissionalId: string | null | undefined, inicioMs: number, fimMs: number) {
  if (b.profissional_id && b.profissional_id !== profissionalId) return false;
  return new Date(b.inicio).getTime() < fimMs && new Date(b.fim).getTime() > inicioMs;
}
