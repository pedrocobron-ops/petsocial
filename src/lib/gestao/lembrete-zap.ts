import { chamar } from "./util";

/**
 * O lembrete de WhatsApp do horário e da reserva, num modelo só (aprovado pelo dono), usado pela Agenda (detalhe do horário,
 * "Mandar os lembretes"), pelo Modo envio e pelo Mozart (preparar_mensagens com agendamento_ids ou estadia_id). O texto é
 * montado aqui, nunca escrito pelo modelo:
 *
 *   Olá, Ana! 🐾
 *   Aqui é do *Banho da Neide*. Passando para lembrar do horário do *Tobias*:
 *
 *   📅 *Quarta-feira, 25/11*
 *   🕒 *15h* (término previsto às 16h15)
 *   ✂️ Banho + corte de unhas
 *   📍 Rua das Flores, 10, Centro
 *
 *   Pode confirmar respondendo esta mensagem? Se precisar remarcar, é só avisar.
 *   Até lá!
 *
 * Datas e horas chegam no horário local do pet shop ("AAAA-MM-DDTHH:mm"): o servidor (Mozart) e o navegador dão o mesmo texto.
 * Sem importações de tela: dá para testar sozinho.
 */

export type OndeDoPetshop = { nome: string; endereco?: string | null; bairro?: string | null };
export type PetNoHorario = { nome: string; servicos: string[] };
/** Um horário: início e fim locais ("AAAA-MM-DDTHH:mm") e os pets atendidos nele. */
export type HorarioNoLembrete = { inicio: string; fim?: string | null; pets: PetNoHorario[] };

const DIAS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const RE_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const somaDia = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** "AAAA-MM-DDTHH:mm" de uma data no relógio de quem chama (no navegador, o horário local). */
export function localDe(d: Date | string): string {
  const x = typeof d === "string" ? new Date(d) : d;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}T${p(x.getHours())}:${p(x.getMinutes())}`;
}
/** "15h", "15h30". */
export const horaZap = (local: string) => { const h = Number(local.slice(11, 13)), m = local.slice(14, 16); return m === "00" ? `${h}h` : `${h}h${m}`; };
/** "Quarta-feira, 25/11"; hoje e amanhã: "Hoje, 25/11", "Amanhã, 26/11". */
export function diaZap(local: string, hoje?: string | null): string {
  const dia = local.slice(0, 10);
  const ddmm = `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
  if (hoje && dia === hoje) return `Hoje, ${ddmm}`;
  if (hoje && dia === somaDia(hoje, 1)) return `Amanhã, ${ddmm}`;
  return `${DIAS[new Date(`${dia}T00:00:00Z`).getUTCDay()]}, ${ddmm}`;
}
/** "Banho + corte de unhas": o primeiro como está, os outros com a primeira letra minúscula. */
export function servicosZap(nomes: (string | null | undefined)[]): string {
  const l = nomes.map((n) => (n ?? "").trim()).filter(Boolean);
  return l.map((n, i) => (i === 0 ? n.charAt(0).toUpperCase() + n.slice(1) : n.charAt(0).toLowerCase() + n.slice(1))).join(" + ");
}
/** "do *Mel*", "do *Mel* e do *Thor*", "do *Mel*, do *Thor* e do *Bidu*". */
function dosPets(nomes: string[]): string {
  const l = [...new Set(nomes.map((n) => n.trim()).filter(Boolean))].map((n) => `do *${n}*`);
  if (!l.length) return "do seu pet";
  return l.length === 1 ? l[0] : `${l.slice(0, -1).join(", ")} e ${l[l.length - 1]}`;
}
const enderecoZap = (p: OndeDoPetshop) => [p.endereco, p.bairro].map((x) => (x ?? "").trim()).filter(Boolean).join(", ");
const abertura = (tutor: string | null | undefined, petshop: OndeDoPetshop) => {
  const nome = chamar(tutor);
  return `${nome ? `Olá, ${nome}!` : "Olá!"} 🐾\nAqui é do *${petshop.nome.trim()}*.`;
};
const FECHO = "Pode confirmar respondendo esta mensagem? Se precisar remarcar, é só avisar.\nAté lá!";

/**
 * O lembrete de um ou mais horários do mesmo tutor. Pets no mesmo horário viram um bloco só (com os serviços de cada um, se
 * forem diferentes); horários diferentes no mesmo dia ficam um embaixo do outro.
 */
export function lembreteDoHorario(o: { tutor?: string | null; petshop: OndeDoPetshop; horarios: HorarioNoLembrete[]; hoje?: string | null }): string {
  // junta os pets do mesmo início (dois atendimentos do mesmo tutor às 15h viram um bloco)
  const blocos: HorarioNoLembrete[] = [];
  for (const h of [...o.horarios].filter((x) => RE_LOCAL.test(x.inicio)).sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    const ja = blocos.find((b) => b.inicio.slice(0, 16) === h.inicio.slice(0, 16));
    if (!ja) { blocos.push({ inicio: h.inicio, fim: h.fim ?? null, pets: [...h.pets] }); continue; }
    ja.pets.push(...h.pets);
    if (h.fim && (!ja.fim || h.fim > ja.fim)) ja.fim = h.fim;
  }
  const pets = blocos.flatMap((b) => b.pets.map((p) => p.nome));
  const varios = blocos.length > 1;
  const linhas: string[] = [`${abertura(o.tutor, o.petshop)} Passando para lembrar ${varios ? "dos horários" : "do horário"} ${dosPets(pets)}:`, ""];
  let diaAnterior = "";
  for (const b of blocos) {
    if (b.inicio.slice(0, 10) !== diaAnterior) { linhas.push(`📅 *${diaZap(b.inicio, o.hoje)}*`); diaAnterior = b.inicio.slice(0, 10); }
    const fim = b.fim && RE_LOCAL.test(b.fim) && b.fim > b.inicio ? ` (término previsto às ${horaZap(b.fim)})` : "";
    linhas.push(`🕒 *${horaZap(b.inicio)}*${fim}`);
    const comServico = b.pets.filter((p) => servicosZap(p.servicos));
    const iguais = comServico.length > 0 && new Set(b.pets.map((p) => servicosZap(p.servicos))).size === 1;
    // mais de um pet no horário (ou mais de um pet na mensagem) com serviços diferentes: cada um com o seu
    if (iguais && !(varios && new Set(pets).size > 1)) linhas.push(`✂️ ${servicosZap(b.pets[0].servicos)}`);
    else for (const p of comServico) linhas.push(`✂️ ${p.nome}: ${servicosZap(p.servicos)}`);
  }
  const onde = enderecoZap(o.petshop);
  if (onde) linhas.push(`📍 ${onde}`);
  linhas.push("", FECHO);
  return linhas.join("\n");
}

/** O lembrete da creche ou do hotel: entrada (e saída, se houver), com ☀️ creche ou 🏨 hotel. */
export function lembreteDaEstadia(o: { tutor?: string | null; petshop: OndeDoPetshop; tipo: "creche" | "hotel"; pets: string[]; entrada: string; saida?: string | null; hoje?: string | null }): string {
  const quando = (local: string) => `*${diaZap(local, o.hoje)}, ${horaZap(local)}*`;
  const linhas: string[] = [`${abertura(o.tutor, o.petshop)} Passando para lembrar da reserva ${dosPets(o.pets)}:`, ""];
  linhas.push(o.tipo === "hotel" ? "🏨 Hotel" : "☀️ Creche");
  if (RE_LOCAL.test(o.entrada)) linhas.push(`📅 Entrada: ${quando(o.entrada)}`);
  if (o.saida && RE_LOCAL.test(o.saida)) linhas.push(`📅 Saída: ${quando(o.saida)}`);
  const onde = enderecoZap(o.petshop);
  if (onde) linhas.push(`📍 ${onde}`);
  linhas.push("", FECHO);
  return linhas.join("\n");
}
