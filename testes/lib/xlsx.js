// Monta uma planilha .xlsx de verdade (zip com o XML do Excel) para os testes, sem biblioteca: `xlsx([[...títulos], [...linha]])`.
// Texto vai para sharedStrings (como o Excel salva); número puro vai como número (telefone salvo como número, como acontece).
// `deflate: false` grava sem compressão (alguns geradores fazem assim).
const zlib = require('zlib');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(arquivos, deflate = true) {
  const locais = [], centrais = [];
  let off = 0;
  for (const [nome, conteudo] of arquivos) {
    const dados = Buffer.from(conteudo, 'utf8');
    const comp = deflate ? zlib.deflateRawSync(dados) : dados;
    const nomeB = Buffer.from(nome, 'utf8');
    const crc = crc32(dados);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(dados.length, 22); local.writeUInt16LE(nomeB.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(deflate ? 8 : 0, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(dados.length, 24); central.writeUInt16LE(nomeB.length, 28);
    central.writeUInt32LE(off, 42);
    locais.push(local, nomeB, comp);
    centrais.push(central, nomeB);
    off += 30 + nomeB.length + comp.length;
  }
  const cd = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(arquivos.length, 8); fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(cd.length, 12); fim.writeUInt32LE(off, 16);
  return Buffer.concat([...locais, cd, fim]);
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const letra = (i) => { let s = ''; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };

/** linhas: arrays de células (string ou número; '' = célula vazia). A aba de verdade fica em `abaNome` (padrão "Clientes"). */
function xlsx(linhas, { deflate = true, abaNome = 'Clientes', outraAbaAntes = false } = {}) {
  const textos = [], indice = new Map();
  const s = (t) => { if (!indice.has(t)) { indice.set(t, textos.length); textos.push(t); } return indice.get(t); };
  const rows = linhas.map((l, r) => `<row r="${r + 1}">${l.map((v, c) => {
    if (v === '' || v == null) return '';
    const ref = `${letra(c)}${r + 1}`;
    if (typeof v === 'object') return `<c r="${ref}"><v>${v.n}</v></c>`; // número como o Excel grava ("1.1912345678E10")
    return typeof v === 'number' ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="s"><v>${s(v)}</v></c>`;
  }).join('')}</row>`).join('');
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="3" width="20"/></cols><sheetData>${rows}</sheetData></worksheet>`;
  const shared = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${textos.length}" uniqueCount="${textos.length}">${textos.map((t) => `<si><t xml:space="preserve">${esc(t)}</t></si>`).join('')}</sst>`;
  // a aba de verdade é sheet2.xml quando `outraAbaAntes` (a ordem das abas manda, não o nome do arquivo)
  const alvo = outraAbaAntes ? 'worksheets/sheet2.xml' : 'worksheets/sheet1.xml';
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${esc(abaNome)}" sheetId="1" r:id="rId7"/>${outraAbaAntes ? '<sheet name="Outra" sheetId="2" r:id="rId8"/>' : ''}</sheets></workbook>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${alvo}"/></Relationships>`;
  const arquivos = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'],
    ['xl/workbook.xml', workbook],
    ['xl/_rels/workbook.xml.rels', rels],
    ['xl/sharedStrings.xml', shared],
    [`xl/${alvo}`, sheet],
  ];
  if (outraAbaAntes) arquivos.push(['xl/worksheets/sheet1.xml', '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>errada</t></is></c></row></sheetData></worksheet>']);
  return zip(arquivos, deflate);
}

module.exports = { xlsx, zip };
