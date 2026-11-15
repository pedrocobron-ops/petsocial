import type { Database } from "./banco";
import type { Banco } from "./supabase";
import type { Cliente, Estadia, Pet } from "./tipos";
import { contando, lerTudo } from "./paginas";
import { saudacaoZap } from "./agenda";
import { calendarioGuardado, diaFechado, lerCalendario } from "./feriados";
import { multaSugerida, opcoesDeCobranca } from "./dinheiro-opcoes";
import { opcao } from "./opcoes";
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
export type PlanoCompleto = Plano & { pets: PetDoPlano | null; valor_mensal: number | null; valor_extra: number | null; temValor: boolean; modelo_id?: string | null };
export type Presenca = Pick<Estadia, "id" | "pet_id" | "tipo" | "status" | "entrada" | "saida" | "saida_prevista" | "plano_id" | "mensalista" | "dia" | "cobranca_id">;

export const SELECT_PLANO = "*, pets(id, nome, foto, especie, sexo, alertas, ativo, clientes(id, nome, telefone))";
export const COLS_PRESENCA = "id, pet_id, tipo, status, entrada, saida, saida_prevista, plano_id, mensalista, dia, cobranca_id";
export const CATEGORIA_MENSALIDADE = "Creche: mensalidade";

/**
 * Quem mexe no plano de um mensalista (cadastrar, mudar os dias, pausar, encerrar): o dono e quem cuida do financeiro, porque o plano
 * decide o que é cobrado. O dono pode liberar para a equipe em Meu pet shop (opção abaixo). O banco confere a mesma regra.
 */
export const OPCAO_EQUIPE_MUDA_PLANO = "creche.equipe_muda_plano";
export const equipeMudaPlano = (petshop: { opcoes?: unknown }) => opcao<boolean>(petshop, OPCAO_EQUIPE_MUDA_PLANO, false) === true;
export const podeMudarPlano = (x: { petshop: { opcoes?: unknown }; souDono: boolean; cuidoDoFinanceiro: boolean }) => x.souDono || x.cuidoDoFinanceiro || equipeMudaPlano(x.petshop);

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
  const valores = new Map<string, { valor_mensal: number; valor_extra: number | null; modelo_id: string | null }>();
  if (vejoFinanceiro && planos.length) {
    const v = await lerTudo<{ plano_id: string; valor_mensal: number; valor_extra: number | null; modelo_id: string | null }>((de, ate, contar) =>
      sb.from("creche_planos_valores").select("plano_id, valor_mensal, valor_extra, modelo_id", contando(contar)).eq("petshop_id", petshopId).order("plano_id").range(de, ate)).catch(() => []);
    for (const x of v) valores.set(x.plano_id, { valor_mensal: Number(x.valor_mensal), valor_extra: x.valor_extra == null ? null : Number(x.valor_extra), modelo_id: x.modelo_id });
  }
  return planos.map((p) => ({ ...p, valor_mensal: valores.get(p.id)?.valor_mensal ?? null, valor_extra: valores.get(p.id)?.valor_extra ?? null, temValor: valores.has(p.id), modelo_id: valores.get(p.id)?.modelo_id ?? null }));
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
/**
 * O pet é esperado nesse dia: o plano vale, não está em pausa, é um dia da semana dele e o pet shop abre.
 * Dia que o dono marcou como fechado (feriado, folga) não espera ninguém: não entra na chamada, não vira falta e não ocupa vaga.
 */
export const esperadoNoDia = (p: Vigencia, dia: string, horario: unknown) =>
  planoVale(p, dia) && !emPausa(p, dia) && p.dias.includes(deIsoDia(dia).getDay()) && abreNoDia(horario, dia) && !diaFechado(dia);

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
    // dia extra reservado que ainda não chegou: é esperado, como os do plano
    const estado: EstadoChamada = presenca ? (presenca.status === "reservada" ? "esperado" : presenca.status === "em_casa" ? "na_casa" : "saiu") : falta ? "faltou" : "esperado";
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
  // reserva de dia extra que ainda não virou presença não conta como vinda
  const doPet = presencas.filter((e) => e.pet_id === plano.pet_id && e.status !== "reservada" && diaDaPresenca(e) >= de && diaDaPresenca(e) <= ate);
  const veio = new Set(doPet.map(diaDaPresenca));
  // falta anotada num dia que depois foi marcado como fechado não conta
  const faltou = faltas.filter((f) => f.pet_id === plano.pet_id && f.dia >= de && f.dia <= ate && !diaFechado(f.dia)).sort((a, b) => a.dia.localeCompare(b.dia));
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
 * Mensalidade sugerida para o mês: cheia, ou proporcional aos dias do plano quando ele começa ou termina no meio do mês ou tem pausa no mês.
 * Dia que o negócio não abre fica fora da conta dos dois lados (não é dia do plano): tanto o dia da semana fechado quanto a
 * data marcada como fechada (feriado, folga). Por isso feriado no mês não muda a mensalidade.
 * (Mesma conta de `creche_sugestao_mensal` no banco.)
 */
export function sugestaoDoMes(plano: Vigencia, mes: Date, valor: number, horario: unknown) {
  const ate = isoDia(ultimoDoMes(mes));
  let todos = 0, restam = 0;
  for (let d = primeiroDoMes(mes); isoDia(d) <= ate; d = somaDias(d, 1)) {
    const dia = isoDia(d);
    if (!plano.dias.includes(d.getDay()) || !abreNoDia(horario, dia) || diaFechado(dia)) continue;
    todos++;
    if (dia >= plano.inicio && (!plano.fim || dia <= plano.fim) && !emPausa(plano, dia)) restam++;
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

/** O plano entra na cobrança desse mês (vale em algum dia dele e o mês não é anterior à primeira cobrança escolhida)? */
export function cobraNoMes(plano: Vigencia & { primeira_cobranca?: string | null }, mes: Date) {
  if (plano.primeira_cobranca && isoDia(primeiroDoMes(mes)) < plano.primeira_cobranca) return false;
  return plano.inicio <= isoDia(ultimoDoMes(mes)) && (!plano.fim || plano.fim >= isoDia(primeiroDoMes(mes)));
}

/**
 * A primeira cobrança de um plano, quando o mês já começou: quem recebe escolhe (nada vem marcado).
 * "fora": o mês foi pago por fora do sistema, a primeira cobrança é a do mês seguinte.
 * "proporcional": cobra os dias do plano de hoje (ou do começo do plano) até o fim do mês. "inteiro": a mensalidade cheia.
 */
export type PrimeiraCobranca = "fora" | "proporcional" | "inteiro";
/** A conta do proporcional da primeira cobrança: os dias do plano de `desde` em diante, sobre todos os dias do plano no mês. */
export function proporcionalDesde(plano: Vigencia, mes: Date, valor: number, horario: unknown, desde: string) {
  return sugestaoDoMes({ ...plano, inicio: plano.inicio > desde ? plano.inicio : desde }, mes, valor, horario);
}

export type ExtraCobrado = { dia: string; valor: number };
export function extrasDaCobranca(c: Pick<Cobranca, "extras">): ExtraCobrado[] {
  if (!Array.isArray(c.extras)) return [];
  return (c.extras as unknown[]).flatMap((x) => {
    const e = x as { dia?: unknown; valor?: unknown };
    return typeof e?.dia === "string" ? [{ dia: e.dia, valor: Number(e.valor ?? 0) || 0 }] : [];
  });
}

/** As taxas de busca fora do horário que entraram na cobrança (quem recebe mandou para a mensalidade). */
export function taxasDaCobranca(c: Pick<Cobranca, "taxas">): ExtraCobrado[] {
  if (!Array.isArray(c.taxas)) return [];
  return (c.taxas as unknown[]).flatMap((x) => {
    const e = x as { dia?: unknown; valor?: unknown };
    return typeof e?.dia === "string" ? [{ dia: e.dia, valor: Number(e.valor ?? 0) || 0 }] : [];
  });
}
/** `valor_extras` soma os dias extras e as taxas de busca fora do horário: aqui, cada parte. */
export function partesDosExtras(c: Pick<Cobranca, "taxas" | "valor_extras">) {
  const taxas = centavos(taxasDaCobranca(c).reduce((s, x) => s + x.valor, 0));
  return { dias: centavos(Math.max(0, Number(c.valor_extras) - taxas)), taxas };
}
/** "1 taxa de busca fora do horário" */
export const textoDasTaxas = (n: number) => (n === 1 ? "1 taxa de busca fora do horário" : `${n} taxas de busca fora do horário`);

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

/** Quanto ainda falta receber de uma cobrança: o total, menos o que já foi recebido em partes (a conta dela guarda o que falta). */
export function faltaDaCobranca(c: Pick<CobrancaCompleta, "total" | "lancamentos">): number {
  const l = c.lancamentos;
  return l && !l.pago && Number(l.valor) < Number(c.total) ? Number(l.valor) : Number(c.total);
}

/** "03/10, 10/10 e 17/10" */
export const textoDasDatas = (dias: string[]) => juntar(dias.map((d) => dataCurta(d)));

/** Linha de um pet na mensagem: "Thor: mensalidade R$ 600,00 + 2 dias extras (03/10 e 17/10) R$ 120,00 = R$ 720,00". */
function linhaDaMensagem(c: CobrancaCompleta, comMes = false) {
  const extras = extrasDaCobranca(c), taxas = taxasDaCobranca(c), valores = partesDosExtras(c);
  // acerto da saída (o plano já acabou): não tem mensalidade, só o que ficou sem cobrar
  const partes = c.acerto_saida ? [] : [`mensalidade ${brl(c.valor_mensal)}`];
  if (extras.length) partes.push(`${extras.length === 1 ? "1 dia extra" : `${extras.length} dias extras`} (${textoDasDatas(extras.map((e) => e.dia))})${valores.dias > 0 ? ` ${brl(valores.dias)}` : ""}`);
  if (taxas.length) partes.push(`${textoDasTaxas(taxas.length)} (${textoDasDatas(taxas.map((e) => e.dia))}) ${brl(valores.taxas)}`);
  let texto = partes.join(" + ");
  // desconto para irmãos (opção da creche) numa linha própria; o resto do desconto, como sempre
  const d = partesDoDesconto(c);
  if (d.irmao > 0) texto += ` - desconto irmão ${brl(d.irmao)}`;
  if (d.outro > 0) texto += ` - desconto ${brl(d.outro)}`;
  if (partes.length > 1 || Number(c.desconto) > 0) texto += ` = ${brl(c.total)}`;
  // parte já recebida: a mensagem cobra só o que falta
  const falta = faltaDaCobranca(c);
  if (falta < Number(c.total)) texto += `. Já pago ${brl(centavos(Number(c.total) - falta))}, falta ${brl(falta)}`;
  return `${nomeNaMensagem(c, comMes)}: ${texto}`;
}
/** "Rex" ou, quando a mensagem junta meses diferentes, "Rex (novembro)". */
const nomeNaMensagem = (c: CobrancaCompleta, comMes: boolean) => `${c.pets?.nome ?? "Pet"}${c.acerto_saida ? " (acerto da saída)" : comMes ? ` (${nomeMes(deIsoDia(c.mes))})` : ""}`;

/**
 * Mensagem de cobrança de um tutor: o mês, uma linha por pet (com os dias extras e as datas), o total e o vencimento.
 * Tom neutro e educado, sem ameaça. A chave Pix e a multa seguem as Opções de cobrança. A pessoa pode mudar o texto antes de mandar.
 */
export function mensagemDeCobranca(p: { tutor: string | null | undefined; petshop: string; cobrancas: CobrancaCompleta[]; hoje: string; opcoes?: { opcoes?: unknown } }) {
  const cs = [...p.cobrancas].sort((a, b) => (a.pets?.nome ?? "").localeCompare(b.pets?.nome ?? "", "pt-BR") || a.mes.localeCompare(b.mes));
  if (!cs.length) return "";
  const meses = [...new Set(cs.filter((c) => !c.acerto_saida).map((c) => c.mes))].sort().map((m) => nomeMes(deIsoDia(m)));
  // o mesmo pet com mais de uma cobrança (ou meses diferentes): cada linha diz de que mês é
  const comMes = new Set(cs.map((c) => c.mes)).size > 1 || cs.some((c) => c.acerto_saida);
  const vencimentos = [...new Set(cs.map((c) => c.vencimento))].sort();
  const total = centavos(cs.reduce((s, c) => s + faltaDaCobranca(c), 0));
  const atrasada = vencimentos[0] < p.hoje;
  const oi = saudacaoZap(p.tutor, p.petshop);
  const doQue = meses.length ? `da mensalidade da creche de ${juntar(meses)}` : "do acerto da creche";
  const abre = atrasada
    ? `${oi} Passando para lembrar ${doQue}${meses.length && cs.some((c) => c.acerto_saida) ? " e do acerto da saída" : ""}:`
    : `${oi} Segue ${meses.length ? `a mensalidade da creche de ${juntar(meses)}${cs.some((c) => c.acerto_saida) ? " e o acerto da saída" : ""}` : "o acerto da creche"}:`;
  const vence = vencimentos.length === 1
    ? `Vencimento: ${dataCompleta(vencimentos[0])}`
    : `Vencimentos: ${cs.map((c) => `${nomeNaMensagem(c, comMes)} em ${dataCompleta(c.vencimento)}`).join(", ")}`;
  // as mesmas regras das outras mensagens de cobrança (Meu pet shop, Opções de cobrança): a chave Pix, se preenchida,
  // e a multa com os juros só quando o dono ligou a multa e marcou "mostrar na mensagem" (e a mensalidade está atrasada)
  const o = p.opcoes ? opcoesDeCobranca(p.opcoes) : null;
  let multas = 0;
  const linhas = cs.map((c) => {
    const m = o?.multaNaMensagem && p.opcoes ? multaSugerida(p.opcoes, { valor: faltaDaCobranca(c), vencimento: c.vencimento }, p.hoje) : null;
    if (m) multas = centavos(multas + m.total);
    return `${linhaDaMensagem(c, comMes)}${m ? ` + multa e juros por atraso ${brl(m.total)}` : ""}`;
  });
  const linhaTotal = multas > 0 ? [`Total: ${brl(total)} + multa e juros ${brl(multas)} = ${brl(centavos(total + multas))}`] : cs.length > 1 ? [`Total: ${brl(total)}`] : [];
  return [abre, "", ...linhas, "", ...linhaTotal, vence, ...(o?.pix ? [`Chave Pix: ${o.pix}`] : []), "", "Qualquer dúvida, é só chamar. Obrigado!"].join("\n");
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
  // dia marcado como fechado: a chamada não espera ninguém
  if (!calendarioGuardado(petshop.id, vejoFinanceiro)) await lerCalendario(sb, petshop.id, vejoFinanceiro);
  const mov = await lerPresencas(sb, petshop.id, hoje, hoje);
  const linhas = montarChamada(planos, hoje, mov.presencas, mov.faltas, petshop.horario).filter((l) => l.conta === "plano" || l.conta === "avulsa" || l.presenca?.status === "reservada");
  let vencemHoje = 0, atrasadas = 0, reposicoes = 0;
  const semValor: string[] = [];
  if (vejoFinanceiro) {
    // o que a equipe marcou e espera a conferência de quem recebe: reposição ("não cobrar") e plano ainda sem valor
    const [rep, valores] = await Promise.all([
      sb.from("creche_reposicoes").select("estadia_id", { count: "exact", head: true }).eq("petshop_id", petshop.id).eq("estado", "pendente"),
      sb.from("creche_planos_valores").select("plano_id").eq("petshop_id", petshop.id).limit(5000),
    ]);
    reposicoes = rep.count ?? 0;
    if (!valores.error) {
      const com = new Set((valores.data ?? []).map((v) => v.plano_id));
      for (const pl of planos) if (planoAtivo(pl, hoje) && pl.pets?.ativo !== false && !com.has(pl.id)) semValor.push(pl.pets?.nome ?? "Pet");
    }
    if (liberado) await sb.rpc("creche_gerar_cobrancas", { p_petshop: petshop.id });
    const r = await sb.from("creche_cobrancas").select("vencimento, lancamentos!inner(pago)").eq("petshop_id", petshop.id).eq("status", "aberta").eq("lancamentos.pago", false).lte("vencimento", hoje).limit(1000);
    for (const c of r.data ?? []) { if (c.vencimento === hoje) vencemHoje++; else atrasadas++; }
  }
  return {
    esperados: linhas.length, aindaNao: linhas.filter((l) => l.estado === "esperado").length,
    faltaram: linhas.filter((l) => l.estado === "faltou").map((l) => l.plano.pets?.nome ?? "Pet"),
    // quem faltou sem o tutor avisar: só para esses vale mandar mensagem perguntando
    semAviso: linhas.filter((l) => l.estado === "faltou" && !l.falta?.avisou).map((l) => l.plano.pets?.nome ?? "Pet"), vencemHoje, atrasadas, reposicoes, semValor,
    naCasa: linhas.filter((l) => l.estado === "na_casa").length,
    sairam: linhas.filter((l) => l.estado === "saiu").length,
  };
}

/**
 * Comprovante das mensalidades recebidas de uma vez (Receber tudo de um tutor), em texto simples para o WhatsApp.
 * Não é documento fiscal, e o texto diz isso no fim.
 */
export function textoComprovanteMensalidades(p: {
  petshop: string; tutor?: string | null; dia: string; forma: string;
  itens: { pet: string; mes: string; valor: number; multa: number; acerto?: boolean }[];
}) {
  const total = Math.round(p.itens.reduce((t, i) => t + i.valor + i.multa, 0) * 100) / 100;
  return [
    `${saudacaoZap(p.tutor, p.petshop).replace(/ Aqui é .*$/, "")} Segue o comprovante ${p.itens.length === 1 ? "da mensalidade" : "das mensalidades"} da creche.`,
    "",
    p.petshop,
    `Data: ${dataCompleta(p.dia)}`,
    "",
    ...p.itens.map((i) => `${i.pet}: ${i.acerto ? "acerto da saída" : `mensalidade de ${nomeMes(deIsoDia(i.mes))}`} ${brl(i.valor)}${i.multa > 0 ? ` + multa e juros por atraso ${brl(i.multa)}` : ""}`),
    `Total: ${brl(total)}`,
    `Pagamento: ${p.forma}`,
    "",
    "Este comprovante não é nota fiscal.",
  ].join("\n");
}

/* ---------- saldo de reposição ---------- */

/** Regra de reposição do negócio (Meu pet shop). Desligada: qualquer falta do plano pode ser reposta, sem prazo. */
export const OPCAO_REPOSICAO_PRAZO = "creche.reposicao_prazo";
export const OPCAO_REPOSICAO_SO_AVISOU = "creche.reposicao_so_avisou";
export type PrazoDeReposicao = "" | "mes" | "mes_seguinte";

/** O que a função `creche_reposicao_saldo` devolve: só datas, nada de valor. */
export type SaldoDeReposicao = {
  /** dá para marcar mais uma reposição no dia pedido */
  cabe: boolean;
  /** a falta que a reposição desse dia repõe */
  repoe: string | null;
  prazo: PrazoDeReposicao; so_avisou: boolean;
  /** faltas que ainda podem ser repostas no dia */
  livres: string[];
  /** faltas sem reposição cujo prazo já passou */
  vencidas: string[];
  pares: { falta: string; reposicao: string }[];
  /** reposições liberadas sem falta para repor (pelo dono ou por quem cuida do financeiro) */
  sem_falta: string[];
};

export async function lerSaldoDeReposicao(sb: Banco, planoId: string, dia?: string): Promise<SaldoDeReposicao | null> {
  const r = await sb.rpc("creche_reposicao_saldo", { p_plano: planoId, ...(dia ? { p_dia: dia } : {}) });
  // banco ainda sem a função: a tela segue sem o saldo
  if (r.error) return null;
  return r.data as unknown as SaldoDeReposicao;
}

/** "só falta com aviso, até o fim do mês seguinte à falta": a regra numa frase (vazia quando não há regra). */
export function textoDaRegraDeReposicao(s: Pick<SaldoDeReposicao, "prazo" | "so_avisou">) {
  const prazo = s.prazo === "mes" ? "no mesmo mês da falta" : s.prazo === "mes_seguinte" ? "até o fim do mês seguinte à falta" : "";
  return [s.so_avisou ? "só falta com aviso" : "", prazo].filter(Boolean).join(", ");
}

/** "Luna tem 1 falta para repor (10/11)." / "Luna não tem falta para repor. A falta de 10/11 já foi reposta em 13/11." */
export function fraseDoSaldo(nome: string, s: SaldoDeReposicao) {
  const regra = textoDaRegraDeReposicao(s);
  if (s.livres.length) return `${nome} tem ${s.livres.length === 1 ? "1 falta" : `${s.livres.length} faltas`} para repor (${textoDasDatas(s.livres)})${regra ? `. Regra: ${regra}` : ""}.`;
  const usadas = s.pares.length ? ` ${s.pares.length === 1 ? "A falta" : "As faltas"} já ${s.pares.length === 1 ? "foi reposta" : "foram repostas"}: ${juntar(s.pares.map((p) => `${dataCurta(p.falta)} em ${dataCurta(p.reposicao)}`))}.` : "";
  const vencidas = s.vencidas.length ? ` ${s.vencidas.length === 1 ? "A falta de" : "As faltas de"} ${textoDasDatas(s.vencidas)} já ${s.vencidas.length === 1 ? "passou" : "passaram"} do prazo.` : "";
  return `${nome} não tem falta para repor${regra ? ` (regra: ${regra})` : ""}.${usadas}${vencidas}`;
}

/* ---------- desconto para irmãos (opção da creche) ---------- */

/**
 * Desconto para irmãos (Meu pet shop, Opções da creche): o mesmo tutor com mais de um cão com plano no mês paga a mensalidade
 * cheia de um e os outros têm o desconto. Quem paga cheio: o plano de mensalidade mais alta ("mais_barato": o desconto vai para
 * os mais baratos) ou o plano que começou antes ("segundo"). Empate: o que começou antes. A conta é a de `creche_desconto_irmao`
 * no banco (migração 20261173); se mudar lá, mude aqui. O desconto fica dentro de `desconto` na cobrança, e a parte do irmão em
 * `desconto_irmao`.
 */
export const OPCAO_DESCONTO_IRMAO = "creche.desconto_irmao";
export type RegraIrmao = { ativo: boolean; tipo: "pct" | "reais"; valor: number | null; qual: "mais_barato" | "segundo" };
export function regraIrmaoDe(p: { opcoes?: unknown }): RegraIrmao {
  const o = opcao<unknown>(p, OPCAO_DESCONTO_IRMAO, null);
  const x = o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  return {
    ativo: x.ativo === true, tipo: x.tipo === "reais" ? "reais" : "pct",
    valor: typeof x.valor === "number" && x.valor > 0 ? x.valor : null, qual: x.qual === "segundo" ? "segundo" : "mais_barato",
  };
}
const irmaoLigado = (r: RegraIrmao) => r.ativo && r.valor != null && r.valor > 0;
/** Arredonda para o centavo como o banco (metade para cima), sem o erro de conta do número quebrado. */
const aoCentavo = (n: number) => Math.round(n * 100 + 1e-6) / 100;
/** O valor do desconto de um cão que tem o desconto: em %, sobre a mensalidade do mês; em R$, proporcional num mês proporcional. */
export function valorDoDescontoIrmao(r: RegraIrmao, mensal: number, cheio: number): number {
  if (!irmaoLigado(r) || mensal <= 0) return 0;
  const d = r.tipo === "pct" ? aoCentavo((mensal * Math.min(r.valor!, 100)) / 100)
    : cheio > 0 && mensal < cheio ? aoCentavo((r.valor! * mensal) / cheio) : r.valor!;
  return Math.min(Math.max(d, 0), mensal);
}
/** O plano tem algum dia no mês (não está em pausa o mês todo)? Mesma conta do banco: `creche_sugestao_mensal(plano, mês, 1) > 0`. */
function temDiaNoMes(p: Vigencia, mes: Date, horario: unknown) {
  if (p.inicio > isoDia(ultimoDoMes(mes)) || (p.fim && p.fim < isoDia(primeiroDoMes(mes)))) return false;
  const s = sugestaoDoMes(p, mes, 1, horario);
  return s.todos === 0 || s.restam > 0;
}
/** Os planos do mesmo tutor que contam como irmãos no mês, na ordem em que o primeiro paga cheio. */
export function irmaosNoMes(petshop: { opcoes?: unknown }, planos: PlanoCompleto[], plano: Pick<PlanoCompleto, "pets">, mes: Date, horario: unknown): PlanoCompleto[] {
  const tutor = plano.pets?.clientes?.id;
  if (!tutor) return [];
  const r = regraIrmaoDe(petshop);
  return planos.filter((p) => p.pets?.clientes?.id === tutor && p.temValor && p.valor_mensal != null && temDiaNoMes(p, mes, horario))
    .sort((a, b) => (r.qual === "segundo" ? 0 : Number(b.valor_mensal) - Number(a.valor_mensal)) || a.inicio.localeCompare(b.inicio)
      || new Date(a.criado_em).getTime() - new Date(b.criado_em).getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
/** O desconto de irmão de um plano num mês, para a mensalidade `mensal` (precisa dos valores dos planos: só quem cuida do financeiro). */
export function descontoIrmao(petshop: { opcoes?: unknown }, planos: PlanoCompleto[], plano: PlanoCompleto, mes: Date, mensal: number, horario: unknown): number {
  const r = regraIrmaoDe(petshop);
  if (!irmaoLigado(r) || mensal <= 0 || plano.valor_mensal == null) return 0;
  const ordem = irmaosNoMes(petshop, planos, plano, mes, horario);
  if (ordem.length < 2 || !ordem.some((p) => p.id === plano.id) || ordem[0].id === plano.id) return 0;
  return valorDoDescontoIrmao(r, mensal, Number(plano.valor_mensal));
}
/** "10%" ou "R$ 50,00" */
export const textoDaRegraIrmao = (r: RegraIrmao) => (r.valor == null ? "" : r.tipo === "pct" ? `${String(r.valor).replace(".", ",")}%` : brl(r.valor));
/** A parte do desconto que é de irmão e a que foi combinada à parte (as duas somam `desconto`). */
export function partesDoDesconto(c: Pick<Cobranca, "desconto"> & { desconto_irmao?: number | null }) {
  const total = Number(c.desconto) || 0, irmao = Math.min(Number(c.desconto_irmao ?? 0) || 0, total);
  return { irmao: centavos(irmao), outro: centavos(total - irmao) };
}

/* ---------- dia de experiência (opção da creche) ---------- */

/**
 * Dia de experiência: um dia avulso de creche para um cão novo, marcado em `estadias.experiencia`. O banco confere a opção, se o cão
 * já é mensalista e o limite por cão, e põe o preço (zero = gratuito). O preço fica em outra chave, que a equipe sem dinheiro não lê.
 */
export const OPCAO_EXPERIENCIA = "creche.experiencia";
export const OPCAO_EXPERIENCIA_PRECO = "creche.experiencia_preco";
export type RegraExperiencia = { ativo: boolean; max: number; link: boolean };
export function experienciaDe(p: { opcoes?: unknown }): RegraExperiencia {
  const o = opcao<unknown>(p, OPCAO_EXPERIENCIA, null);
  const x = o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {};
  const max = typeof x.max === "number" ? Math.max(1, Math.min(10, Math.round(x.max))) : 1;
  return { ativo: x.ativo === true, max, link: x.link === true };
}
/** Preço do dia de experiência (só chega para quem vê o financeiro). null = não definido, que vale como gratuito. */
export const precoDaExperiencia = (p: { opcoes?: unknown }) => { const v = opcao<number | null>(p, OPCAO_EXPERIENCIA_PRECO, null); return typeof v === "number" && v >= 0 ? v : null; };
/** Quantos dias depois do dia de experiência a tela ainda lembra de conversar com o tutor. */
export const DIAS_PARA_CONVERSAR = 14;

export type Experiencia = Pick<Estadia, "id" | "pet_id" | "status" | "entrada" | "saida" | "avisos"> & {
  pets: (Pick<Pet, "id" | "nome" | "foto" | "especie" | "sexo"> & { clientes: Pick<Cliente, "id" | "nome" | "telefone"> | null }) | null;
};
/** Os dias de experiência de hoje e os que já passaram e esperam a conversa com o tutor (cão ainda sem plano, sem "já conversei"). */
export async function lerExperiencias(sb: Banco, petshopId: string) {
  const hoje = isoDia(new Date()), desde = somaDias(deIsoDia(hoje), -DIAS_PARA_CONVERSAR);
  const [r, planos] = await Promise.all([
    sb.from("estadias").select("id, pet_id, status, entrada, saida, avisos, pets(id, nome, foto, especie, sexo, clientes(id, nome, telefone))")
      .eq("petshop_id", petshopId).eq("experiencia", true).neq("status", "cancelada").gte("entrada", desde.toISOString()).order("entrada").order("id").limit(500),
    sb.from("creche_planos").select("pet_id").eq("petshop_id", petshopId).limit(5000),
  ]);
  // banco ainda sem a coluna: a tela segue sem o dia de experiência
  if (r.error) return { hoje: [] as Experiencia[], conversar: [] as Experiencia[] };
  const comPlano = new Set((planos.data ?? []).map((p) => p.pet_id));
  const lista = (r.data ?? []) as unknown as Experiencia[];
  return {
    hoje: lista.filter((e) => isoDia(new Date(e.entrada)) === hoje),
    conversar: lista.filter((e) => e.status === "encerrada" && !comPlano.has(e.pet_id) && !jaConversou(e)),
  };
}
/** A equipe já mandou (ou marcou que conversou) a mensagem depois do dia de experiência. */
export const jaConversou = (e: Pick<Estadia, "avisos">) => Boolean(e.avisos && typeof e.avisos === "object" && (e.avisos as Record<string, unknown>).experiencia);

/**
 * Mensagem para o tutor depois do dia de experiência: pergunta como foi e oferece os planos (os modelos de plano, com preço
 * só para quem vê o financeiro). Sem nada inventado sobre o dia: quem manda pode acrescentar o que viu.
 */
export function mensagemDaExperiencia(p: { tutor: string | null | undefined; pet: string; sexo?: string | null; petshop: string; planos?: { nome: string; valor: number | null }[] }) {
  const doPet = p.sexo === "M" ? `do ${p.pet}` : p.sexo === "F" ? `da ${p.pet}` : `de ${p.pet}`;
  const planos = (p.planos ?? []).filter((x) => x.nome.trim());
  return [
    `${saudacaoZap(p.tutor, p.petshop)} Como foi o dia de experiência ${doPet} na creche? Queremos saber o que vocês acharam.`,
    "",
    planos.length
      ? [`Se quiser que ${p.pet} venha sempre, estes são os nossos planos:`, ...planos.map((x) => `- ${x.nome}${x.valor != null ? `: ${brl(x.valor)} por mês` : ""}`)].join("\n")
      : `Se quiser que ${p.pet} venha sempre, temos planos mensais com dias fixos na semana. A gente explica como funciona.`,
    "",
    "É só responder aqui que a gente combina os dias.",
  ].join("\n");
}

/* ---------- extrato do mês por cachorro (opção da creche) ---------- */

/** Extrato do mês de um cão (presenças, faltas, reposições, extras, taxas e, para quem vê o financeiro, a cobrança). */
export const OPCAO_EXTRATO_PET = "creche.extrato_pet";
export const extratoDoPetLigado = (p: { opcoes?: unknown }) => opcao<boolean>(p, OPCAO_EXTRATO_PET, false) === true;
export const linkDoExtratoDoPet = (petId: string, mes?: Date) => `/gestao/app/creche-hotel/extrato?pet=${petId}${mes ? `&mes=${isoMes(mes)}` : ""}`;

/** O que o extrato do mês de um cão mostra. Dinheiro (`cobranca`, `taxas` com valor) só para quem vê o financeiro. */
export type ExtratoDoPet = {
  mes: Date; pet: string; tutor: string | null;
  plano: Pick<Plano, "dias"> | null;
  /** dias do plano no mês até hoje (com a creche aberta) */
  esperados: number;
  presencas: string[]; faltas: { dia: string; avisou: boolean }[];
  reposicoes: { dia: string; repoe: string | null }[];
  extras: string[]; avulsos: string[]; experiencias: string[];
  /** saídas depois do horário (só quem vê o financeiro lê): valor e o que foi feito com a taxa */
  taxas: { dia: string; valor: number | null; estado: string }[];
  cobranca: CobrancaCompleta | null;
};

/** As linhas da cobrança do mês, para o extrato (papel e texto). */
export function linhasDaCobrancaDoPet(c: CobrancaCompleta) {
  const extras = extrasDaCobranca(c), taxas = taxasDaCobranca(c), partes = partesDosExtras(c), d = partesDoDesconto(c);
  return [
    ...(c.acerto_saida ? [] : [{ nome: `Mensalidade de ${nomeMes(deIsoDia(c.mes))}${Number(c.valor_mensal) < Number(c.valor_cheio) ? " (proporcional)" : ""}`, valor: Number(c.valor_mensal) }]),
    ...(extras.length ? [{ nome: `${extras.length === 1 ? "Dia extra" : `${extras.length} dias extras`} (${textoDasDatas(extras.map((x) => x.dia))})`, valor: partes.dias }] : []),
    ...(taxas.length ? [{ nome: `${textoDasTaxas(taxas.length)} (${textoDasDatas(taxas.map((x) => x.dia))})`, valor: partes.taxas }] : []),
    ...(d.irmao > 0 ? [{ nome: "Desconto irmão", valor: -d.irmao }] : []),
    ...(d.outro > 0 ? [{ nome: "Desconto", valor: -d.outro }] : []),
  ];
}

/** "10/11, com aviso; 17/11" */
const textoDasFaltas = (f: { dia: string; avisou: boolean }[]) => f.map((x) => `${dataCurta(x.dia)}${x.avisou ? ", com aviso" : ""}`).join("; ");

/**
 * O extrato do mês de um cão em texto simples, para o WhatsApp do tutor. Sem `comValores`, só as presenças (para a equipe que
 * não vê o financeiro): nenhum valor entra no texto.
 */
export function textoDoExtratoDoPet(x: ExtratoDoPet, petshop: string, comValores: boolean) {
  const mes = nomeMes(x.mes);
  const linhas: string[] = [];
  if (x.plano) linhas.push(`Plano: ${textoDosDias(x.plano.dias)}`);
  if (x.plano) linhas.push(`Presenças: ${x.presencas.length}${x.esperados ? ` de ${x.esperados} dias do plano` : ""}${x.presencas.length ? ` (${textoDasDatas(x.presencas)})` : ""}`);
  else if (x.presencas.length) linhas.push(`Presenças: ${x.presencas.length} (${textoDasDatas(x.presencas)})`);
  if (x.faltas.length) linhas.push(`Faltas: ${x.faltas.length} (${textoDasFaltas(x.faltas)})`);
  if (x.reposicoes.length) linhas.push(`Reposições: ${x.reposicoes.length} (${juntar(x.reposicoes.map((r) => `${dataCurta(r.dia)}${r.repoe ? `, repôs a falta de ${dataCurta(r.repoe)}` : ""}`))})`);
  if (x.extras.length) linhas.push(`Dias extras: ${x.extras.length} (${textoDasDatas(x.extras)}), entram na mensalidade seguinte`);
  if (x.experiencias.length) linhas.push(`Dia de experiência: ${textoDasDatas(x.experiencias)}`);
  if (x.avulsos.length) linhas.push(`Dias avulsos: ${x.avulsos.length} (${textoDasDatas(x.avulsos)})`);
  const taxas = comValores ? x.taxas.filter((t) => t.estado !== "dispensada") : [];
  if (taxas.length) linhas.push(`Saídas depois do horário: ${juntar(taxas.map((t) => `${dataCurta(t.dia)}${t.valor != null ? ` (taxa ${brl(t.valor)})` : ""}`))}`);
  if (!linhas.length) linhas.push(`Nenhum dia na creche em ${mes}.`);
  const conta: string[] = [];
  if (comValores && x.cobranca) {
    for (const l of linhasDaCobrancaDoPet(x.cobranca)) conta.push(`${l.nome}: ${l.valor < 0 ? `− ${brl(-l.valor)}` : brl(l.valor)}`);
    const c = x.cobranca, falta = faltaDaCobranca(c), paga = Boolean(c.lancamentos?.pago) || Number(c.total) <= 0;
    conta.push(`Total: ${brl(c.total)}${paga ? (Number(c.total) > 0 && c.lancamentos?.data ? `, pago em ${dataCurta(c.lancamentos.data)}` : "") : falta < Number(c.total) ? `. Já pago ${brl(centavos(Number(c.total) - falta))}, falta ${brl(falta)}` : `, vence em ${dataCurta(c.vencimento)}`}`);
  }
  return [
    `${saudacaoZap(x.tutor, petshop)} Segue o extrato de ${mes} de ${x.pet} na creche:`,
    "",
    ...linhas,
    ...(conta.length ? ["", ...conta] : []),
    "",
    "Qualquer dúvida, é só chamar.",
  ].join("\n");
}
