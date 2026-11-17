/**
 * Lê a primeira aba de uma planilha .xlsx (o formato do Excel e do Google Planilhas) e devolve as linhas como texto.
 * Sem biblioteca: o .xlsx é um .zip com XML dentro. O zip é aberto aqui e o "inflar" vem de fora (no navegador,
 * `DecompressionStream("deflate-raw")`; nos testes, o zlib do Node). Só texto e números: fórmula vale o último resultado salvo.
 */

/** Descompacta um trecho do zip (método deflate, sem cabeçalho). */
export type Inflar = (dados: Uint8Array) => Promise<Uint8Array>;

/** O inflar do navegador (Chrome, Edge, Safari 16.4+, Firefox 113+). Sem ele, a tela pede para salvar como CSV. */
export const temInflarNoNavegador = () => typeof DecompressionStream !== "undefined";
export async function inflarNoNavegador(dados: Uint8Array): Promise<Uint8Array> {
  const fluxo = new Blob([dados as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(fluxo).arrayBuffer());
}

/** Planilha .xlsx (começa como zip: "PK\x03\x04"). */
export const ehXlsx = (b: Uint8Array) => b.length > 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;

type Entrada = { metodo: number; inicio: number; tamanho: number };

function entradasDoZip(b: Uint8Array): Map<string, Entrada> {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let fim = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
  if (fim < 0) throw new Error("zip");
  const total = dv.getUint16(fim + 10, true);
  let p = dv.getUint32(fim + 16, true);
  const nomes = new TextDecoder("utf-8");
  const mapa = new Map<string, Entrada>();
  for (let k = 0; k < total && p + 46 <= b.length; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true), tamanho = dv.getUint32(p + 20, true);
    const nNome = dv.getUint16(p + 28, true), nExtra = dv.getUint16(p + 30, true), nComent = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const nome = nomes.decode(b.subarray(p + 46, p + 46 + nNome));
    if (local + 30 <= b.length && dv.getUint32(local, true) === 0x04034b50) {
      const inicio = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      mapa.set(nome, { metodo, inicio, tamanho });
    }
    p += 46 + nNome + nExtra + nComent;
  }
  return mapa;
}

const ENTIDADES: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
const texto = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTIDADES[e] ?? m);
/** Junta os <t> de um trecho (texto com partes formatadas vem em vários). */
const juntarT = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => texto(m[1])).join("");
/** "AB" → 27 (a coluna, contando do zero). */
function coluna(ref: string): number {
  const letras = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? "";
  let n = 0;
  for (const c of letras) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

/** Até 5.000 linhas e 60 colunas: planilha maior que isso é para dividir. */
const MAX_LINHAS = 5000, MAX_COLUNAS = 60;

export async function lerXlsx(b: Uint8Array, inflar: Inflar): Promise<string[][]> {
  const zip = entradasDoZip(b);
  const ler = async (nome: string) => {
    const e = zip.get(nome);
    if (!e) return null;
    const dados = b.subarray(e.inicio, e.inicio + e.tamanho);
    const cru = e.metodo === 0 ? dados : e.metodo === 8 ? await inflar(dados) : null;
    return cru ? new TextDecoder("utf-8").decode(cru) : null;
  };
  // a primeira aba, na ordem do caderno de abas
  let caminho = "xl/worksheets/sheet1.xml";
  const [livro, rels] = await Promise.all([ler("xl/workbook.xml"), ler("xl/_rels/workbook.xml.rels")]);
  const rid = livro?.match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1];
  if (rid && rels) {
    const alvo = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${rid}"`))?.match(/Target="([^"]+)"/)?.[1];
    if (alvo) caminho = alvo.startsWith("/") ? alvo.slice(1) : `xl/${alvo.replace(/^\.\//, "")}`;
  }
  const [aba, compartilhados] = await Promise.all([ler(caminho), ler("xl/sharedStrings.xml")]);
  if (aba == null) throw new Error("aba");
  const textos = compartilhados ? [...compartilhados.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => juntarT(m[1])) : [];

  const linhas: string[][] = [];
  for (const m of aba.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    if (linhas.length >= MAX_LINHAS) break;
    const linha: string[] = [];
    let seguinte = 0;
    for (const c of (m[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1], dentro = c[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+)\d*"/i)?.[1];
      const col = ref ? coluna(ref) : seguinte;
      seguinte = col + 1;
      if (col >= MAX_COLUNAS) continue;
      const tipo = attrs.match(/\bt="([^"]+)"/)?.[1];
      const v = dentro.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let valor = "";
      if (tipo === "s") valor = textos[Number(v)] ?? "";
      else if (tipo === "inlineStr") valor = juntarT(dentro);
      else if (tipo === "b") valor = v === "1" ? "VERDADEIRO" : "FALSO";
      else if (tipo === "str" || tipo === "e") valor = texto(v ?? "");
      else if (v != null) {
        // número: telefone gravado como número ("1.1912345678E10") volta a ser 11912345678
        const n = Number(v);
        valor = Number.isFinite(n) ? (Number.isInteger(n) ? n.toFixed(0) : String(n)) : texto(v);
      }
      linha[col] = valor;
    }
    const cheia = Array.from(linha, (x) => x ?? "");
    // linhas vazias ficam de fora; a ordem fica
    if (cheia.some((x) => x.trim())) linhas.push(cheia);
  }
  return linhas;
}
