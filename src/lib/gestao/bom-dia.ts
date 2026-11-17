import { brl, almocoDoDia, horarioDoDia } from "./util";
import { deMin, paraMin } from "./agenda";
import { linhaDoBomDiaContas } from "./contas-fixas";

/**
 * "Bom dia" do Mozart na tela Hoje: no máximo 3 linhas, sempre do banco (função gestao_bom_dia, uma ida só) e sem chamar a IA.
 * O banco já tira o que a pessoa não pode ver (dinheiro só com área de dinheiro; agenda, casa, pacotes pela área). Aqui só se
 * escolhe e escreve: primeiro o dia (agenda e casa), depois, nesta ordem, quem deve e vem hoje, conta fixa vencida, de hoje ou
 * de amanhã (só quem cuida do financeiro e vê o dinheiro: "Aluguel vence amanhã (R$ 2.500,00)"), produto vencido ou vencendo
 * (quem cuida do estoque), vacina vencendo de quem vem, pacote no último uso e aniversário.
 */
export type Sexo = string | null;
export type DadosDoBomDia = {
  dia: string;
  /** [início, fim] de cada horário de hoje (sem cancelados e faltas); só com a área Agenda */
  agenda?: [string, string][];
  casa?: { em_casa: number; chegam: number; saem: number };
  /** só com área de dinheiro */
  devem?: { tutor: string; valor: number; quando: string | null; pets: string[] | null }[];
  vacinas?: { pet: string; sexo: Sexo; nome: string; tipo: string; vence_em: string }[];
  pacotes?: { pet: string; sexo: Sexo; nome: string; quando: string }[];
  niver?: { pet: string; sexo: Sexo; vem: boolean }[];
  /** lotes com saldo vencidos ou vencendo em até 30 dias; só para quem cuida do estoque e só quando tem algum */
  validade?: { vencidos: number; vencendo: number; primeiro: string | null };
  /** contas fixas em A pagar vencidas, de hoje e de amanhã; só para quem cuida do financeiro e vê o dinheiro */
  contas_fixas?: { nome: string; valor: number; vencimento: string; estimado: boolean }[];
};
export type LinhaDoBomDia = { id: "dia" | "devem" | "contas" | "validade" | "vacinas" | "pacotes" | "niver"; texto: string };

export const MAX_LINHAS_BOM_DIA = 3;

const doPet = (nome: string, sexo: Sexo) => `${sexo === "F" ? "da" : sexo === "M" ? "do" : "de"} ${nome}`;
const ele = (sexo: Sexo) => (sexo === "F" ? "ela" : "ele");
const juntar = (l: string[]) => (l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`);
/** "Ana, Beto e Clara" ou, com mais de 3, "Ana, Beto, Clara e mais 2" */
const ate3 = (l: string[]) => (l.length <= 3 ? juntar(l) : `${l.slice(0, 3).join(", ")} e mais ${l.length - 3}`);
const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] ?? n;
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const minDoDia = (d: Date) => d.getHours() * 60 + d.getMinutes();

/**
 * O primeiro tempo livre de pelo menos `minimo` minutos que ainda vem hoje (nenhum horário marcado nele), dentro do funcionamento
 * e fora do almoço. Conta os horários como ocupados mesmo com mais de uma vaga: é um "buraco" na agenda, não a última vaga.
 */
export function buracoNaAgenda(horario: unknown, agenda: [string, string][], agora: Date, minimo = 60): { de: string; ate: string } | null {
  const h = horarioDoDia(horario, agora);
  if (!h) return null;
  const abre = paraMin(h.abre), fecha = paraMin(h.fecha);
  const ocupados = agenda.map(([i, f]) => [minDoDia(new Date(i)), minDoDia(new Date(f))] as [number, number]);
  const almoco = almocoDoDia(horario, agora);
  if (almoco) ocupados.push([almoco.inicio, almoco.fim]);
  ocupados.sort((a, b) => a[0] - b[0]);
  let livreDe = Math.max(abre, Math.ceil(minDoDia(agora) / 15) * 15);
  for (const [i, f] of ocupados) {
    if (i - livreDe >= minimo && i <= fecha) return { de: deMin(livreDe), ate: deMin(Math.min(i, fecha)) };
    livreDe = Math.max(livreDe, f);
  }
  return fecha - livreDe >= minimo ? { de: deMin(livreDe), ate: deMin(fecha) } : null;
}

/** As linhas do cartão (no máximo 3). Sem nada que valha dizer, a lista vem vazia e o cartão não aparece. */
export function linhasDoBomDia(d: DadosDoBomDia, o: { horario: unknown; agora?: Date; nomeDaCasa?: string }): LinhaDoBomDia[] {
  const agora = o.agora ?? new Date();
  const linhas: LinhaDoBomDia[] = [];

  // 1. o dia: agenda e casa numa linha só
  const partes: string[] = [];
  if (d.agenda) {
    const n = d.agenda.length;
    if (n) {
      const buraco = buracoNaAgenda(o.horario, d.agenda, agora);
      partes.push(`${n === 1 ? "1 horário" : `${n} horários`} na agenda, o primeiro às ${hhmm(d.agenda[0][0])}${buraco ? `; livre das ${buraco.de} às ${buraco.ate}` : ""}`);
    }
  }
  if (d.casa && d.casa.em_casa + d.casa.chegam + d.casa.saem > 0) {
    const c = d.casa, extra = [c.chegam ? `${c.chegam === 1 ? "1 chega" : `${c.chegam} chegam`}` : "", c.saem ? `${c.saem === 1 ? "1 sai" : `${c.saem} saem`}` : ""].filter(Boolean);
    partes.push(`${o.nomeDaCasa ?? "Na casa"}: ${c.em_casa === 1 ? "1 pet" : `${c.em_casa} pets`}${extra.length ? ` (${juntar(extra)} hoje)` : ""}`);
  }
  const comAgenda = Boolean(d.agenda?.length);
  if (partes.length) linhas.push({ id: "dia", texto: `Hoje: ${partes.join(". ")}.` });

  // 2. quem deve e vem hoje
  const devem = d.devem ?? [];
  if (devem.length === 1) {
    const x = devem[0];
    const pets = x.pets?.length ? ` com ${juntar(x.pets)}` : "";
    // a hora já passou (o pet já chegou, ou está na casa): "veio hoje", não "vem hoje"
    const passou = Boolean(x.quando && new Date(x.quando).getTime() < agora.getTime());
    linhas.push({ id: "devem", texto: `${x.tutor} deve ${brl(Number(x.valor))} e ${passou ? "veio" : "vem"} hoje${pets}${x.quando ? ` às ${hhmm(x.quando)}` : ""}. Bom momento para acertar.` });
  } else if (devem.length > 1) {
    linhas.push({ id: "devem", texto: `Vêm hoje e devem: ${ate3(devem.map((x) => `${primeiroNome(x.tutor)} (${brl(Number(x.valor))})`))}.` });
  }

  // 2b. contas fixas vencidas, de hoje e de amanhã
  const contas = linhaDoBomDiaContas((d.contas_fixas ?? []).map((c) => ({ ...c, valor: Number(c.valor), estimado: Boolean(c.estimado) })), d.dia);
  if (contas) linhas.push({ id: "contas", texto: contas });

  // 3. validade dos produtos (lotes com saldo)
  const val = d.validade;
  if (val && val.vencidos + val.vencendo > 0) {
    const partes = [
      val.vencidos ? `${val.vencidos === 1 ? "1 produto vencido" : `${val.vencidos} produtos vencidos`} na prateleira` : "",
      val.vencendo ? `${val.vencendo === 1 ? "1 vence" : `${val.vencendo} vencem`} em até 30 dias` : "",
    ].filter(Boolean);
    const um = val.vencidos + val.vencendo === 1 && val.primeiro ? ` (${val.primeiro})` : "";
    linhas.push({ id: "validade", texto: `Validade: ${juntar(partes)}${um}. Veja em Estoque, Vencendo.` });
  }

  // 4. vacina ou cuidado vencendo de quem vem hoje
  const vac = d.vacinas ?? [];
  const hoje = d.dia;
  if (vac.length === 1) {
    const v = vac[0];
    linhas.push({ id: "vacinas", texto: `${v.tipo === "vacina" ? "A vacina" : "O cuidado"} ${v.nome} ${doPet(v.pet, v.sexo)} ${v.vence_em < hoje ? "venceu" : v.vence_em === hoje ? "vence hoje" : "vence"}${v.vence_em === hoje ? "" : ` em ${ddmm(v.vence_em)}`}, e ${ele(v.sexo)} vem hoje.` });
  } else if (vac.length > 1) {
    const pets = [...new Set(vac.map((v) => v.pet))];
    linhas.push({ id: "vacinas", texto: `Vacina ou cuidado vencendo de quem vem hoje: ${ate3(pets)}.` });
  }

  // 5. pacote no último uso
  const pac = d.pacotes ?? [];
  const semPacote = (n: string) => n.replace(/^pacote\s+(de\s+)?/i, "");
  if (pac.length === 1) linhas.push({ id: "pacotes", texto: `${pac[0].pet} usa hoje a última vez do pacote ${semPacote(pac[0].nome)}: boa hora para oferecer a renovação.` });
  else if (pac.length > 1) linhas.push({ id: "pacotes", texto: `${ate3(pac.map((p) => p.pet))} usam hoje a última vez do pacote: boa hora para oferecer a renovação.` });

  // 6. aniversário
  const niver = d.niver ?? [];
  if (niver.length === 1) linhas.push({ id: "niver", texto: `Hoje é aniversário ${doPet(niver[0].pet, niver[0].sexo)}${niver[0].vem ? `, e ${ele(niver[0].sexo)} vem hoje` : ""}.` });
  else if (niver.length > 1) linhas.push({ id: "niver", texto: `Fazem aniversário hoje: ${ate3(niver.map((n) => n.pet))}.` });

  // só "agenda livre" não vale um cartão; com outras linhas, a agenda vazia aparece
  if (!linhas.length) return [];
  if (!partes.length && d.agenda && !comAgenda) linhas.unshift({ id: "dia", texto: "Hoje: agenda livre." });
  return linhas.slice(0, MAX_LINHAS_BOM_DIA);
}
