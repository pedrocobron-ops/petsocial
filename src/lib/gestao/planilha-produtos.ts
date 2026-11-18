/**
 * Leitura das colunas de produto que vêm de uma planilha (Trazer de planilha, no Estoque): a unidade escrita de jeitos diferentes
 * e a validade em qualquer formato comum. Sem importações: os testes (testes/lib/app.js) leem este arquivo direto.
 */

/** As unidades do estoque (as mesmas da ficha do produto). */
const UNIDADES: Record<string, string> = {
  un: "un", und: "un", unid: "un", unidade: "un", unidades: "un", u: "un", pc: "un", pca: "un", peca: "un", pecas: "un",
  kg: "kg", quilo: "kg", quilos: "kg", kilo: "kg", kilos: "kg",
  g: "g", gr: "g", grama: "g", gramas: "g",
  l: "L", lt: "L", litro: "L", litros: "L",
  ml: "ml", mililitro: "ml", mililitros: "ml",
  pacote: "pacote", pacotes: "pacote", pct: "pacote",
  saco: "saco", sacos: "saco", sc: "saco",
};
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "unidade" e "Unid." viram "un", "Litros" vira "L"; vazio vira "un"; o que não conhece fica como veio (até 12 letras). */
export function unidadeDaPlanilha(v: string | null | undefined): string {
  const s = semAcento(v ?? "").replace(/[.\s]+$/g, "");
  if (!s) return "un";
  return UNIDADES[s] ?? (v ?? "").trim().slice(0, 12);
}

const dois = (n: number) => String(n).padStart(2, "0");
const existe = (a: number, m: number, d: number) => {
  const x = new Date(Date.UTC(a, m - 1, d));
  return x.getUTCFullYear() === a && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
};

/**
 * Validade escrita na planilha → "AAAA-MM-DD". Aceita 10/02/2027, 10-02-27, 2027-02-10, 02/2027 (o último dia do mês)
 * e o número de data do Excel (46793). Vazio: null. Escrita que não é data: undefined (a linha entra sem validade e é avisada).
 */
export function validadeDaPlanilha(v: string | null | undefined): string | null | undefined {
  const s = (v ?? "").trim();
  if (!s) return null;
  let a: number, m: number, d: number;
  let x: RegExpMatchArray | null;
  if ((x = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) { a = +x[1]; m = +x[2]; d = +x[3]; }
  else if ((x = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) { d = +x[1]; m = +x[2]; a = x[3].length === 2 ? 2000 + +x[3] : +x[3]; }
  else if ((x = s.match(/^(\d{1,2})[/.-](\d{4})$/))) { m = +x[1]; a = +x[2]; d = m >= 1 && m <= 12 ? new Date(Date.UTC(a, m, 0)).getUTCDate() : 1; }
  else if (/^\d{5}$/.test(s)) {
    // número de série do Excel (dias desde 30/12/1899)
    const dt = new Date(Date.UTC(1899, 11, 30) + Number(s) * 864e5);
    a = dt.getUTCFullYear(); m = dt.getUTCMonth() + 1; d = dt.getUTCDate();
  } else return undefined;
  if (m < 1 || m > 12 || !existe(a, m, d) || a < 2000 || a > 2100) return undefined;
  return `${a}-${dois(m)}-${dois(d)}`;
}
