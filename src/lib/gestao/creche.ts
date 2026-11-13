import type { Database } from "./banco";
import type { Banco } from "./supabase";
import type { Cliente, Estadia, Pet } from "./tipos";
import { contando, lerTudo } from "./paginas";
import { saudacaoZap } from "./agenda";
import { brl, dataCompleta, dataCurta, deIsoDia, horarioDoDia, isoDia, nomeMes, somaDias } from "./util";

/**
 * Creche com mensalistas: plano por pet (dias fixos da semana), chamada do dia, dias extras e cobrança do mês.
 * As regras de banco estão em supabase/migrations/20261134000000_gestao_creche_mensalistas.sql.
 * A presença de um mensalista é uma estadia de creche comum, ligada ao plano (`plano_id`) e marcada em `mensalista`:
 * "plano" (dia do plano, coberto pela mensalidade), "extra" (veio fora do dia: entra na cobrança) ou "reposicao" (não cobra).
 */
type T = Database["public"]["Tables"];
export type Plano = T["creche_planos"]["Row"];
export type Falta = T["creche_faltas"]["Row"];
export type Cobranca = T["creche_cobrancas"]["Row"];
export type PetDoPlano = Pick<Pet, "id" | "nome" | "foto" | "especie" | "sexo" | "alertas" | "ativo"> & { clientes: Pick<Cliente, "id" | "nome" | "telefone"> | null };
/** Plano com o pet e, para quem vê o financeiro, os valores (senão ficam vazios). */
export type PlanoCompleto = Plano & { pets: PetDoPlano | null; valor_mensal: number | null; valor_extra: number | null; temValor: boolean };
export type Presenca = Pick<Estadia, "id" | "pet_id" | "tipo" | "status" | "entrada" | "saida" | "saida_prevista" | "plano_id" | "mensalista" | "dia" | "cobranca_id">;

export const SELECT_PLANO = "*, pets(id, nome, foto, especie, sexo, alertas, ativo, clientes(id, nome, telefone))";
export const COLS_PRESENCA = "id, pet_id, tipo, status, entrada, saida, saida_prevista, plano_id, mensalista, dia, cobranca_id";
export const CATEGORIA_MENSALIDADE = "Creche: mensalidade";

/** Dias da semana na ordem de quem trabalha: segunda primeiro. O número é o do banco (0 = domingo). */
export const DIAS_SEMANA = [
  { id: 1, curto: "seg", nome: "segunda" }, { id: 2, curto: "ter", nome: "terça" }, { id: 3, curto: "qua", nome: "quarta" },
  { id: 4, curto: "qui", nome: "quinta" }, { id: 5, curto: "sex", nome: "sexta" }, { id: 6, curto: "sáb", nome: "sábado" }, { id: 0, curto: "dom", nome: "domingo" },
] as const;
const ordemDoDia = (d: number) => (d + 6) % 7;
export const diasEmOrdem = (dias: number[]) => [...dias].sort((a, b) => ordemDoDia(a) - ordemDoDia(b));
/** "seg, qua e sex" */
export const textoDosDias = (dias: number[]) => juntar(diasEmOrdem(dias).map((d) => DIAS_SEMANA.find((x) => x.id === d)?.curto ?? ""));
export const juntar = (n: string[]) => (n.length <= 1 ? n[0] ?? "" : `${n.slice(0, -1).join(", ")} e ${n[n.length - 1]}`);

/* ---------- ler ---------- */

/** Todos os planos do pet shop, com o pet. Os valores só vêm para quem vê o financeiro (o banco não entrega para os outros). */
export async function lerPlanos(sb: Banco, petshopId: string, vejoFinanceiro: boolean): Promise<PlanoCompleto[]> {
  const planos = await lerTudo<Plano & { pets: PetDoPlano | null }>((de, ate, contar) =>
    sb.from("creche_planos").select(SELECT_PLANO, contando(contar)).eq("petshop_id", petshopId).order("inicio").order("id").range(de, ate));
  const valores = new Map<string, { valor_mensal: number; valor_extra: number | null }>();
  if (vejoFinanceiro && planos.length) {
    const v = await lerTudo<{ plano_id: string; valor_mensal: number; valor_extra: number | null }>((de, ate, contar) =>
      sb.from("creche_planos_valores").select("plano_id, valor_mensal, valor_extra", contando(contar)).eq("petshop_id", petshopId).order("plano_id").range(de, ate)).catch(() => []);
    for (const x of v) valores.set(x.plano_id, { valor_mensal: Number(x.valor_mensal), valor_extra: x.valor_extra == null ? null : Number(x.valor_extra) });
  }
  return planos.map((p) => ({ ...p, valor_mensal: valores.get(p.id)?.valor_mensal ?? null, valor_extra: valores.get(p.id)?.valor_extra ?? null, temValor: valores.has(p.id) }));
}

/** Presenças de creche (mensalistas e avulsas) e faltas entre dois dias, inclusive. */
export async function lerPresencas(sb: Banco, petshopId: string, de: string, ate: string): Promise<{ presencas: Presenca[]; faltas: Falta[] }> {
  const inicio = deIsoDia(de).toISOString(), fim = somaDias(deIsoDia(ate), 1).toISOString();
  const [doDia, avulsas, faltas] = await Promise.all([
    lerTudo<Presenca>((a, b, contar) => sb.from("estadias").select(COLS_PRESENCA, contando(contar)).eq("petshop_id", petshopId).eq("tipo", "creche")
      .neq("status", "cancelada").gte("dia", de).lte("dia", ate).order("dia").order("id").range(a, b)),
    lerTudo<Presenca>((a, b, contar) => sb.from("estadias").select(COLS_PRESENCA, contando(contar)).eq("petshop_id", petshopId).eq("tipo", "creche")
      .in("status", ["em_casa", "encerrada"]).is("dia", null).gte("entrada", inicio).lt("entrada", fim).order("entrada").order("id").range(a, b)),
    lerTudo<Falta>((a, b, contar) => sb.from("creche_faltas").select("*", contando(contar)).eq("petshop_id", petshopId).gte("dia", de).lte("dia", ate).order("dia").order("id").range(a, b)),
  ]);
  return { presencas: [...doDia, ...avulsas], faltas };
}

/* ---------- regras ---------- */

/**
 * A regra de ocupação de vaga de uma estadia. É a mesma da função `estadia_ocupa` do banco, que o link público e o aceite de pedido usam.
 * Se mudar lá, mude aqui. As datas são dias "AAAA-MM-DD" no horário do pet shop.
 * - Quem está na casa sem saída prevista ocupa até sair.
 * - Hotel conta a noite: o dia da saída não ocupa vaga; reserva sem saída prevista vale uma noite.
 * - Creche: da entrada à saída prevista, os dois dias contam; quem está na casa e passou da saída prevista ocupa até hoje.
 */
export function estadiaOcupa(tipo: string, status: string, entrada: string, saida: string | null, dia: string, hoje: string): boolean {
  if (entrada > dia) return false;
  // na casa e sem saída marcada: o hotel segue ocupado até sair; a creche esvazia no fim do dia
  if (status === "em_casa" && saida == null) return tipo === "hotel" || dia <= hoje;
  // hotel conta a noite; quem passou da saída e ainda está na casa ocupa só hoje
  if (tipo === "hotel") return dia < (saida ?? isoDia(somaDias(deIsoDia(entrada), 1))) || (status === "em_casa" && saida != null && saida < hoje && dia === hoje);
  const fim = saida ?? entrada;
  return dia <= (status === "em_casa" && hoje > fim ? hoje : fim);
}

/** O pet shop abre nesse dia? Sem horário preenchido em Meu pet shop, vale todo dia. (Mesma regra de `creche_abre` no banco.) */
export function abreNoDia(horario: unknown, dia: string): boolean {
  const temHorario = Array.from({ length: 7 }, (_, i) => horarioDoDia(horario, new Date(2024, 0, 7 + i))).some(Boolean);
  return !temHorario || Boolean(horarioDoDia(horario, deIsoDia(dia)));
}

type Vigencia = Pick<Plano, "inicio" | "fim" | "dias"> & { pausa_de?: string | null; pausa_ate?: string | null };
/** O plano está em pausa nesse dia (viagem, doença)? Na pausa o pet não é esperado e não leva falta. */
export const emPausa = (p: Vigencia, dia: string) => Boolean(p.pausa_de && p.pausa_ate && dia >= p.pausa_de && dia <= p.pausa_ate);
/** O plano vale nesse dia (entre o começo e o fim)? */
export const planoVale = (p: Vigencia, dia: string) => p.inicio <= dia && (!p.fim || p.fim >= dia);
/** O plano ainda não acabou (vale hoje ou começa depois). */
export const planoAtivo = (p: Vigencia, hoje: string) => !p.fim || p.fim >= hoje;
/** O pet é esperado nesse dia: o plano vale, não está em pausa, é um dia da semana dele e o pet shop abre. */
export const esperadoNoDia = (p: Vigencia, dia: string, horario: unknown) =>
  planoVale(p, dia) && !emPausa(p, dia) && p.dias.includes(deIsoDia(dia).getDay()) && abreNoDia(horario, dia);

const diaDaPresenca = (e: Presenca) => e.dia ?? isoDia(new Date(e.entrada));

/**
 * Quantos mensalistas ocupam vaga da creche no dia (de hoje em diante), além das estadias que já contam.
 * Mesma regra de `creche_planos_ocupam` no banco: não conta quem faltou, quem já saiu nem quem já tem estadia de creche contando no dia.
 * `estadias`: as de creche abertas (reservada, em_casa) e as encerradas de hoje. `faltas`: as de hoje em diante.
 */
export function mensalistasNoDia(planos: (Vigencia & { pet_id: string; pets?: { ativo: boolean } | null })[], dia: string, hoje: string, estadias: Presenca[], faltas: Pick<Falta, "pet_id" | "dia">[], horario: unknown): number {
  if (dia < hoje) return 0;
  let n = 0;
  for (const p of planos) {
    if (p.pets && !p.pets.ativo) continue;
    if (!esperadoNoDia(p, dia, horario)) continue;
    if (faltas.some((f) => f.pet_id === p.pet_id && f.dia === dia)) continue;
    const jaConta = estadias.some((e) => e.pet_id === p.pet_id && e.tipo === "creche" && (
      (["reservada", "em_casa"].includes(e.status) && estadiaOcupa(e.tipo, e.status, isoDia(new Date(e.entrada)), e.saida_prevista ? isoDia(new Date(e.saida_prevista)) : null, dia, hoje))
      || (e.status === "encerrada" && diaDaPresenca(e) === dia)));
    if (!jaConta) n++;
  }
  return n;
}

/* ---------- chamada ---------- */

export type EstadoChamada = "esperado" | "na_casa" | "saiu" | "faltou";
export type LinhaChamada = {
  plano: PlanoCompleto; estado: EstadoChamada; presenca: Presenca | null; falta: Falta | null;
  /** como o dia conta: do plano, extra, reposição ou check-in avulso (feito pelo formulário de sempre) */
  conta: "plano" | "extra" | "reposicao" | "avulsa";
};

/** A chamada de um dia: os esperados pelo plano e quem veio fora do dia (extra ou reposição). */
export function montarChamada(planos: PlanoCompleto[], dia: string, presencas: Presenca[], faltas: Falta[], horario: unknown): LinhaChamada[] {
  const linhas: LinhaChamada[] = [];
  for (const plano of planos) {
    if (!plano.pets || !plano.pets.ativo || !planoVale(plano, dia)) continue;
    const doPet = presencas.filter((e) => e.pet_id === plano.pet_id && diaDaPresenca(e) === dia);
    const presenca = doPet.find((e) => e.mensalista) ?? doPet[0] ?? null;
    const falta = faltas.find((f) => f.pet_id === plano.pet_id && f.dia === dia) ?? null;
    const esperado = esperadoNoDia(plano, dia, horario);
    if (!esperado && !presenca) continue;
    const estado: EstadoChamada = presenca ? (presenca.status === "em_casa" ? "na_casa" : "saiu") : falta ? "faltou" : "esperado";
    linhas.push({ plano, estado, presenca, falta, conta: presenca ? ((presenca.mensalista as LinhaChamada["conta"] | null) ?? "avulsa") : "plano" });
  }
  const ordem: Record<EstadoChamada, number> = { esperado: 0, na_casa: 1, saiu: 2, faltou: 3 };
  return linhas.sort((a, b) => ordem[a.estado] - ordem[b.estado] || (a.plano.pets?.nome ?? "").localeCompare(b.plano.pets?.nome ?? "", "pt-BR"));
}

/* ---------- resumo do mês ---------- */

export type ResumoDoMes = {
  /** dias do plano no mês até hoje (com o pet shop aberto) */
  esperados: number; vieram: number; extras: string[]; reposicoes: string[]; faltas: { dia: string; avisou: boolean }[];
  /** dias do plano que já passaram e ficaram sem chamada (nem presença nem falta) */
  semChamada: string[];
};
const primeiroDoMes = (mes: Date) => new Date(mes.getFullYear(), mes.getMonth(), 1);
const ultimoDoMes = (mes: Date) => new Date(mes.getFullYear(), mes.getMonth() + 1, 0);
export const isoMes = (mes: Date) => isoDia(primeiroDoMes(mes));

/** Presenças, faltas e extras de um pet num mês (até hoje). */
export function resumoDoMes(plano: Vigencia & { pet_id: string }, mes: Date, presencas: Presenca[], faltas: Pick<Falta, "pet_id" | "dia" | "avisou">[], horario: unknown, hoje: string): ResumoDoMes {
  const de = isoDia(primeiroDoMes(mes)), ate = isoDia(ultimoDoMes(mes));
  const doPet = presencas.filter((e) => e.pet_id === plano.pet_id && diaDaPresenca(e) >= de && diaDaPresenca(e) <= ate);
  const veio = new Set(doPet.map(diaDaPresenca));
  const faltou = faltas.filter((f) => f.pet_id === plano.pet_id && f.dia >= de && f.dia <= ate).sort((a, b) => a.dia.localeCompare(b.dia));
  const r: ResumoDoMes = {
    esperados: 0, vieram: doPet.filter((e) => e.mensalista !== "extra" && e.mensalista !== "reposicao").length,
    extras: doPet.filter((e) => e.mensalista === "extra").map(diaDaPresenca).sort(),
    reposicoes: doPet.filter((e) => e.mensalista === "reposicao").map(diaDaPresenca).sort(),
    faltas: faltou.map((f) => ({ dia: f.dia, avisou: f.avisou })), semChamada: [],
  };
  for (let d = primeiroDoMes(mes); isoDia(d) <= ate && isoDia(d) <= hoje; d = somaDias(d, 1)) {
    const dia = isoDia(d);
    if (!esperadoNoDia(plano, dia, horario)) continue;
    r.esperados++;
    if (dia < hoje && !veio.has(dia) && !faltou.some((f) => f.dia === dia)) r.semChamada.push(dia);
  }
  return r;
}

/* ---------- cobrança ---------- */

const centavos = (n: number) => Math.round(n * 100) / 100;

/**
 * Mensalidade sugerida para o mês: cheia, ou proporcional aos dias do plano quando ele começa no meio do mês ou tem pausa no mês.
 * (Mesma conta de `creche_sugestao_mensal` no banco.)
 */
export function sugestaoDoMes(plano: Vigencia, mes: Date, valor: number, horario: unknown) {
  const ate = isoDia(ultimoDoMes(mes));
  let todos = 0, restam = 0;
  for (let d = primeiroDoMes(mes); isoDia(d) <= ate; d = somaDias(d, 1)) {
    const dia = isoDia(d);
    if (!plano.dias.includes(d.getDay()) || !abreNoDia(horario, dia)) continue;
    todos++;
    if (dia >= plano.inicio && !emPausa(plano, dia)) restam++;
  }
  const proporcional = todos > 0 && restam < todos;
  return { valor: proporcional ? centavos((valor * restam) / todos) : valor, proporcional, restam, todos };
}

/** Vencimento da cobrança do mês: o dia combinado; se o plano começou depois dele no mesmo mês, o dia em que começou. */
export function vencimentoDoMes(plano: Pick<Plano, "inicio" | "vence_dia">, mes: Date): string {
  const combinado = isoDia(new Date(mes.getFullYear(), mes.getMonth(), plano.vence_dia));
  const ate = isoDia(ultimoDoMes(mes));
  const comeco = plano.inicio > ate ? ate : plano.inicio;
  return comeco > combinado ? comeco : combinado;
}

/** O plano entra na cobrança desse mês (vale em algum dia dele)? */
export function cobraNoMes(plano: Vigencia, mes: Date) {
  return plano.inicio <= isoDia(ultimoDoMes(mes)) && (!plano.fim || plano.fim >= isoDia(primeiroDoMes(mes)));
}

export type ExtraCobrado = { dia: string; valor: number };
export function extrasDaCobranca(c: Pick<Cobranca, "extras">): ExtraCobrado[] {
  if (!Array.isArray(c.extras)) return [];
  return (c.extras as unknown[]).flatMap((x) => {
    const e = x as { dia?: unknown; valor?: unknown };
    return typeof e?.dia === "string" ? [{ dia: e.dia, valor: Number(e.valor ?? 0) || 0 }] : [];
  });
}

export type CobrancaCompleta = Cobranca & {
  pets: (Pick<Pet, "id" | "nome" | "foto" | "especie"> & { clientes: Pick<Cliente, "id" | "nome" | "telefone"> | null }) | null;
  lancamentos: { id: string; valor: number; pago: boolean; data: string; vencimento: string | null; forma: string | null; pagamentos: unknown } | null;
};
export const SELECT_COBRANCA = "*, pets(id, nome, foto, especie, clientes(id, nome, telefone)), lancamentos(id, valor, pago, data, vencimento, forma, pagamentos)";

export type EstadoCobranca = "paga" | "hoje" | "atrasada" | "a_vencer";
/** Em que bloco a cobrança fica. Cobrança zerada (desconto total) não tem conta a receber: fica com as pagas. */
export function estadoDaCobranca(c: CobrancaCompleta, hoje: string): { estado: EstadoCobranca; atraso: number; semValor: boolean } {
  const semValor = Number(c.total) <= 0;
  if (semValor || c.lancamentos?.pago) return { estado: "paga", atraso: 0, semValor };
  if (c.vencimento === hoje) return { estado: "hoje", atraso: 0, semValor };
  if (c.vencimento < hoje) return { estado: "atrasada", atraso: Math.round((deIsoDia(hoje).getTime() - deIsoDia(c.vencimento).getTime()) / 864e5), semValor };
  return { estado: "a_vencer", atraso: 0, semValor };
}

/** "03/10, 10/10 e 17/10" */
export const textoDasDatas = (dias: string[]) => juntar(dias.map((d) => dataCurta(d)));

/** Linha de um pet na mensagem: "Thor: mensalidade R$ 600,00 + 2 dias extras (03/10 e 17/10) R$ 120,00 = R$ 720,00". */
function linhaDaMensagem(c: CobrancaCompleta) {
  const extras = extrasDaCobranca(c);
  const partes = [`mensalidade ${brl(c.valor_mensal)}`];
  if (extras.length) partes.push(`${extras.length === 1 ? "1 dia extra" : `${extras.length} dias extras`} (${textoDasDatas(extras.map((e) => e.dia))})${Number(c.valor_extras) > 0 ? ` ${brl(c.valor_extras)}` : ""}`);
  let texto = partes.join(" + ");
  if (Number(c.desconto) > 0) texto += ` - desconto ${brl(c.desconto)}`;
  if (partes.length > 1 || Number(c.desconto) > 0) texto += ` = ${brl(c.total)}`;
  return `${c.pets?.nome ?? "Pet"}: ${texto}`;
}

/**
 * Mensagem de cobrança de um tutor: o mês, uma linha por pet (com os dias extras e as datas), o total e o vencimento.
 * Tom neutro e educado: sem multa, sem juros, sem ameaça. A pessoa pode mudar o texto antes de mandar.
 */
export function mensagemDeCobranca(p: { tutor: string | null | undefined; petshop: string; cobrancas: CobrancaCompleta[]; hoje: string }) {
  const cs = [...p.cobrancas].sort((a, b) => (a.pets?.nome ?? "").localeCompare(b.pets?.nome ?? "", "pt-BR"));
  if (!cs.length) return "";
  const meses = [...new Set(cs.map((c) => c.mes))].sort().map((m) => nomeMes(deIsoDia(m)));
  const vencimentos = [...new Set(cs.map((c) => c.vencimento))].sort();
  const total = centavos(cs.reduce((s, c) => s + Number(c.total), 0));
  const atrasada = vencimentos[0] < p.hoje;
  const oi = saudacaoZap(p.tutor, p.petshop);
  const abre = atrasada
    ? `${oi} Passando para lembrar da mensalidade da creche de ${juntar(meses)}:`
    : `${oi} Segue a mensalidade da creche de ${juntar(meses)}:`;
  const vence = vencimentos.length === 1
    ? `Vencimento: ${dataCompleta(vencimentos[0])}`
    : `Vencimentos: ${cs.map((c) => `${c.pets?.nome ?? "Pet"} em ${dataCompleta(c.vencimento)}`).join(", ")}`;
  return [abre, "", ...cs.map(linhaDaMensagem), "", ...(cs.length > 1 ? [`Total: ${brl(total)}`] : []), vence, "", "Qualquer dúvida, é só chamar. Obrigado!"].join("\n");
}

/** Erros que as funções da chamada devolvem com um código na frente. */
export function erroDaChamada(e: unknown): { vacina: string | null; texto: string } {
  const m = e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e);
  const vacina = /VACINA_VENCIDA:\s*(.*)$/.exec(m);
  return { vacina: vacina ? vacina[1] : null, texto: m };
}

/** Mensagem para o tutor do mensalista que não veio: "O Zeca não veio à creche hoje. Está tudo bem?" */
export function mensagemDeFalta(tutor: string | null | undefined, pet: string, sexo: string | null | undefined, petshop: string) {
  const quem = sexo === "M" ? `O ${pet}` : sexo === "F" ? `A ${pet}` : pet;
  return `${saudacaoZap(tutor, petshop)} ${quem} não veio à creche hoje. Está tudo bem?`;
}

/**
 * O que a tela Hoje mostra da creche: quantos mensalistas são esperados hoje, quantos ainda não chegaram, quem faltou e,
 * para quem vê o financeiro, as mensalidades que vencem hoje e as atrasadas (as do mês corrente que faltam são criadas antes, sem duplicar).
 */
export async function resumoDaCrecheHoje(sb: Banco, petshop: { id: string; horario: unknown }, vejoFinanceiro: boolean, liberado: boolean) {
  const hoje = isoDia(new Date());
  const planos = await lerPlanos(sb, petshop.id, false);
  if (!planos.length) return null;
  const mov = await lerPresencas(sb, petshop.id, hoje, hoje);
  const linhas = montarChamada(planos, hoje, mov.presencas, mov.faltas, petshop.horario).filter((l) => l.conta === "plano" || l.conta === "avulsa");
  let vencemHoje = 0, atrasadas = 0;
  if (vejoFinanceiro) {
    if (liberado) await sb.rpc("creche_gerar_cobrancas", { p_petshop: petshop.id });
    const r = await sb.from("creche_cobrancas").select("vencimento, lancamentos!inner(pago)").eq("petshop_id", petshop.id).eq("status", "aberta").eq("lancamentos.pago", false).lte("vencimento", hoje).limit(1000);
    for (const c of r.data ?? []) { if (c.vencimento === hoje) vencemHoje++; else atrasadas++; }
  }
  return {
    esperados: linhas.length, aindaNao: linhas.filter((l) => l.estado === "esperado").length,
    faltaram: linhas.filter((l) => l.estado === "faltou").map((l) => l.plano.pets?.nome ?? "Pet"), vencemHoje, atrasadas,
  };
}
