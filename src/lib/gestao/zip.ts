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

/** CRC-32 em partes: comece com 0xffffffff, siga passando o resultado e termine com `(crc ^ 0xffffffff) >>> 0`. */
export function crc32Parte(crc: number, bytes: Uint8Array): number {
  if (!tabela) crc32(new Uint8Array(0));
  const t = tabela!;
  for (let i = 0; i < bytes.length; i++) crc = t[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return crc >>> 0;
}

type Feito = { nome: Uint8Array; onde: number; crc: number; tam: number };

/**
 * ZIP montado aos poucos (sem compressão), para mandar por partes sem guardar tudo na memória: cada arquivo começa com o
 * cabeçalho local sem CRC nem tamanho (bit 3 das flags) e termina com o "descritor de dados", que traz os dois.
 * Uso: `const z = new ZipEmPartes(enviar)`; `z.comecar("a.json")`; `z.escrever(...)` quantas vezes quiser; `z.terminar()`;
 * no fim, `z.fechar()` manda o diretório central. Sem ZIP64: até 4 GB no total.
 */
export class ZipEmPartes {
  private p = 0;
  private atual: Feito | null = null;
  private feitos: Feito[] = [];
  private readonly hora: number;
  private readonly data: number;
  private readonly enviar: (b: Uint8Array) => void;
  constructor(enviar: (b: Uint8Array) => void, quando: Date = new Date()) {
    this.enviar = enviar;
    this.hora = (quando.getHours() << 11) | (quando.getMinutes() << 5) | (quando.getSeconds() >> 1);
    this.data = ((Math.max(1980, quando.getFullYear()) - 1980) << 9) | ((quando.getMonth() + 1) << 5) | quando.getDate();
  }
  private mandar(b: Uint8Array) {
    if (this.p + b.length > 0xfffffff0) throw new Error("A cópia ficou grande demais para um zip só.");
    this.p += b.length;
    this.enviar(b);
  }
  comecar(nome: string) {
    if (this.atual) this.terminar();
    const n = new TextEncoder().encode(nome);
    const b = new Uint8Array(30 + n.length), v = new DataView(b.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0808, true); v.setUint16(8, 0, true);
    v.setUint16(10, this.hora, true); v.setUint16(12, this.data, true); // CRC e tamanhos (14 a 25) ficam zerados
    v.setUint16(26, n.length, true); v.setUint16(28, 0, true); b.set(n, 30);
    this.atual = { nome: n, onde: this.p, crc: 0xffffffff, tam: 0 };
    this.mandar(b);
  }
  escrever(conteudo: string | Uint8Array) {
    if (!this.atual) throw new Error("Comece um arquivo antes de escrever.");
    const b = typeof conteudo === "string" ? new TextEncoder().encode(conteudo) : conteudo;
    if (!b.length) return;
    this.atual.crc = crc32Parte(this.atual.crc, b);
    this.atual.tam += b.length;
    this.mandar(b);
  }
  terminar() {
    const a = this.atual;
    if (!a) return;
    a.crc = (a.crc ^ 0xffffffff) >>> 0;
    const b = new Uint8Array(16), v = new DataView(b.buffer);
    v.setUint32(0, 0x08074b50, true); v.setUint32(4, a.crc, true); v.setUint32(8, a.tam, true); v.setUint32(12, a.tam, true);
    this.mandar(b);
    this.feitos.push(a);
    this.atual = null;
  }
  /** Um arquivo inteiro de uma vez. */
  arquivo(nome: string, conteudo: string | Uint8Array) { this.comecar(nome); this.escrever(conteudo); this.terminar(); }
  fechar() {
    this.terminar();
    if (this.feitos.length > 0xffff) throw new Error("Arquivos demais para um zip só.");
    const inicio = this.p;
    for (const a of this.feitos) {
      const b = new Uint8Array(46 + a.nome.length), v = new DataView(b.buffer);
      v.setUint32(0, 0x02014b50, true); v.setUint16(4, 20, true); v.setUint16(6, 20, true); v.setUint16(8, 0x0808, true); v.setUint16(10, 0, true);
      v.setUint16(12, this.hora, true); v.setUint16(14, this.data, true); v.setUint32(16, a.crc, true); v.setUint32(20, a.tam, true); v.setUint32(24, a.tam, true);
      v.setUint16(28, a.nome.length, true); v.setUint32(42, a.onde, true); b.set(a.nome, 46);
      this.mandar(b);
    }
    const fim = new Uint8Array(22), v = new DataView(fim.buffer);
    v.setUint32(0, 0x06054b50, true); v.setUint16(8, this.feitos.length, true); v.setUint16(10, this.feitos.length, true);
    v.setUint32(12, this.p - inicio, true); v.setUint32(16, inicio, true);
    this.mandar(fim);
  }
}
