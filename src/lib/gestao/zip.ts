/**
 * ZIP simples, sem compressão (método "store"): junta vários arquivos em um só para baixar.
 * Formato: para cada arquivo, um cabeçalho local + o conteúdo; no fim, o diretório central e o registro final.
 * Nomes em UTF-8 (bit 11 das flags). Sem ZIP64: até 65.535 arquivos e 4 GB, muito além de uma cópia de planilhas.
 * Conferência: `node --experimental-strip-types scripts/conferir-zip.mjs`.
 */
export type ArquivoZip = { nome: string; conteudo: string | Uint8Array };

let tabela: Uint32Array | null = null;
/** CRC-32 (o mesmo do ZIP, PNG e gzip). */
export function crc32(bytes: Uint8Array): number {
  if (!tabela) {
    tabela = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      tabela[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = tabela[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Monta o .zip. `quando` é a data gravada em cada arquivo (padrão: agora). */
export function montarZip(arquivos: ArquivoZip[], quando: Date = new Date()): Uint8Array {
  if (arquivos.length > 0xffff) throw new Error("Arquivos demais para um zip só.");
  const utf8 = new TextEncoder();
  // data e hora no formato do DOS (o ano começa em 1980, os segundos vão de 2 em 2)
  const hora = (quando.getHours() << 11) | (quando.getMinutes() << 5) | (quando.getSeconds() >> 1);
  const data = ((Math.max(1980, quando.getFullYear()) - 1980) << 9) | ((quando.getMonth() + 1) << 5) | quando.getDate();

  const itens = arquivos.map((a) => {
    const nome = utf8.encode(a.nome);
    const corpo = typeof a.conteudo === "string" ? utf8.encode(a.conteudo) : a.conteudo;
    return { nome, corpo, crc: crc32(corpo) };
  });
  const tamLocais = itens.reduce((s, i) => s + 30 + i.nome.length + i.corpo.length, 0);
  const tamCentral = itens.reduce((s, i) => s + 46 + i.nome.length, 0);
  if (tamLocais + tamCentral > 0xfffffff0) throw new Error("A cópia ficou grande demais para um zip só.");

  const saida = new Uint8Array(tamLocais + tamCentral + 22);
  const v = new DataView(saida.buffer);
  let p = 0;
  const u16 = (n: number) => { v.setUint16(p, n, true); p += 2; };
  const u32 = (n: number) => { v.setUint32(p, n >>> 0, true); p += 4; };
  const bytes = (b: Uint8Array) => { saida.set(b, p); p += b.length; };
  /** Campos iguais no cabeçalho local e no diretório central. */
  const comum = (i: (typeof itens)[number]) => {
    u16(20);      // versão necessária: 2.0
    u16(0x0800);  // flags: nome em UTF-8
    u16(0);       // método: guardado, sem compressão
    u16(hora); u16(data);
    u32(i.crc); u32(i.corpo.length); u32(i.corpo.length);
    u16(i.nome.length);
    u16(0);       // campo extra
  };

  const onde: number[] = [];
  for (const i of itens) {
    onde.push(p);
    u32(0x04034b50);
    comum(i);
    bytes(i.nome); bytes(i.corpo);
  }
  const inicioCentral = p;
  itens.forEach((i, n) => {
    u32(0x02014b50);
    u16(20);      // feito por: 2.0
    comum(i);
    u16(0);       // comentário
    u16(0);       // disco
    u16(0);       // atributos internos
    u32(0);       // atributos externos
    u32(onde[n]);
    bytes(i.nome);
  });
  u32(0x06054b50);
  u16(0); u16(0);
  u16(itens.length); u16(itens.length);
  u32(tamCentral); u32(inicioCentral);
  u16(0);
  return saida;
}
