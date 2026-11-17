/**
 * Aniversário do tutor (`clientes.nascimento`). O ano é opcional: sem ele, o banco guarda o ano 1904
 * (bissexto, cabe 29/02, e ninguém vivo nasceu nele). A tela mostra só dia e mês nesse caso.
 * Nascido em 29/02: nos anos que não são bissextos, o aniversário é no dia 28/02 (a mesma regra do banco, `niver_no_dia`).
 */

/** O ano guardado quando a pessoa não sabe (ou não quer dizer) o ano. */
export const ANO_SEM = 1904;

export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const dois = (n: number) => String(n).padStart(2, "0");
const bissexto = (a: number) => (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
/** Quantos dias tem o mês (no ano sem ano, fevereiro tem 29). */
export const diasNoMes = (mes: number, ano: number | null) => (mes === 2 ? (bissexto(ano ?? ANO_SEM) ? 29 : 28) : [4, 6, 9, 11].includes(mes) ? 30 : 31);

export type Nascimento = { dia: number; mes: number; ano: number | null };

/** "1980-03-14" → { dia: 14, mes: 3, ano: 1980 }; "1904-03-14" → ano null. */
export function lerNascimento(iso: string | null | undefined): Nascimento | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return { dia: d, mes: m, ano: a === ANO_SEM ? null : a };
}

/**
 * Monta a data para o banco. Devolve null sem dia ou mês; `erro` quando a data não existe (31/04) ou o ano é estranho.
 * `hoje` só serve para conferir que o ano não está no futuro.
 */
export function montarNascimento(dia: number | null, mes: number | null, ano: number | null, hoje = new Date()): { valor: string | null; erro?: string } {
  if (!dia && !mes && !ano) return { valor: null };
  if (!dia || !mes) return { valor: null, erro: "Escolha o dia e o mês do aniversário." };
  if (ano != null && (ano < 1905 || ano > hoje.getFullYear())) return { valor: null, erro: "Confira o ano de nascimento (ou deixe em branco)." };
  if (dia > diasNoMes(mes, ano)) return { valor: null, erro: `${dia}/${dois(mes)}${ano ? `/${ano}` : ""} não existe. Confira o dia.` };
  return { valor: `${ano ?? ANO_SEM}-${dois(mes)}-${dois(dia)}` };
}

/** "14 de março" ou "14 de março de 1980". */
export function nascimentoPorExtenso(iso: string | null | undefined) {
  const n = lerNascimento(iso);
  if (!n) return null;
  return `${n.dia} de ${MESES[n.mes - 1]}${n.ano ? ` de ${n.ano}` : ""}`;
}

/** Faz aniversário neste dia? (29/02 comemora em 28/02 nos anos que não são bissextos) */
export function fazAniversario(iso: string | null | undefined, dia = new Date()) {
  const n = lerNascimento(iso);
  if (!n) return false;
  const m = dia.getMonth() + 1, d = dia.getDate();
  if (n.mes === m && n.dia === d) return true;
  return n.mes === 2 && n.dia === 29 && m === 2 && d === 28 && !bissexto(dia.getFullYear());
}

/** O dia do aniversário dentro de um mês de um ano (29/02 vira 28/02 em ano que não é bissexto). */
export function diaNoMes(iso: string | null | undefined, mes: number, ano: number): number | null {
  const n = lerNascimento(iso);
  if (!n || n.mes !== mes) return null;
  return n.mes === 2 && n.dia === 29 && !bissexto(ano) ? 28 : n.dia;
}

/** Quantos anos faz neste ano (só com o ano anotado). */
export const anosQueFaz = (iso: string | null | undefined, ano: number) => { const n = lerNascimento(iso); return n?.ano ? ano - n.ano : null; };
