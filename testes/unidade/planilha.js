// Unidade: trazer clientes de uma planilha (src/lib/gestao/planilha.ts e xlsx.ts), sem banco. A planilha .xlsx (achado da
// Juliana: "a minha planilha é .xlsx"), "Luna, Bob" numa célula, observação de alergia que vira alerta, o resumo em frases e
// o texto separado por tabulação que a tela mostra.
const assert = require('node:assert/strict');
const zlib = require('zlib');
const { lib } = require('../lib/app');
const { xlsx } = require('../lib/xlsx');
const T = require('../lib/teste')('unidade-planilha');
const PL = lib('planilha');
const X = lib('xlsx');
const t = async (nome, f) => { try { await f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const inflar = async (d) => new Uint8Array(zlib.inflateRawSync(Buffer.from(d)));

(async () => T.rodar(async () => {
  T.secao('.xlsx');
  const linhas = [
    ['Nome do tutor', 'WhatsApp', 'Pet', 'Observações'],
    ['Ana & Cia', 11912345678, 'Luna, Bob', 'Alergia a shampoo comum'],
    ['José <Zé>', '(11) 98888-7777', 'Thor', ''],
    ['', '', '', ''],
    ['Bia "Pet"', 1.5, 'Mel', 'Gosta de laço'],
  ];
  await t('lê títulos, texto, número e caractere especial (compactada)', async () => {
    const r = await X.lerXlsx(new Uint8Array(xlsx(linhas)), inflar);
    assert.deepEqual(r[0], ['Nome do tutor', 'WhatsApp', 'Pet', 'Observações']);
    assert.deepEqual(r[1], ['Ana & Cia', '11912345678', 'Luna, Bob', 'Alergia a shampoo comum']);
    assert.deepEqual(r[2].slice(0, 3), ['José <Zé>', '(11) 98888-7777', 'Thor']);
    assert.equal(r.length, 4, 'a linha vazia fica de fora');
    assert.equal(r[3][1], '1.5');
  });
  await t('também sem compressão', async () => {
    const r = await X.lerXlsx(new Uint8Array(xlsx(linhas, { deflate: false })), inflar);
    assert.equal(r[1][0], 'Ana & Cia');
  });
  await t('a primeira aba pela ordem do caderno, não pelo nome do arquivo', async () => {
    const r = await X.lerXlsx(new Uint8Array(xlsx(linhas, { outraAbaAntes: true })), inflar);
    assert.equal(r[0][0], 'Nome do tutor');
  });
  await t('telefone salvo como número em notação científica volta inteiro', async () => {
    const r = await X.lerXlsx(new Uint8Array(xlsx([['Tutor', 'Fone'], ['Ana', { n: '1.1912345678E10' }]])), inflar);
    assert.equal(r[1][1], '11912345678');
  });
  await t('ehXlsx pelos primeiros bytes; CSV não', () => {
    assert.equal(X.ehXlsx(new Uint8Array(xlsx(linhas))), true);
    assert.equal(X.ehXlsx(new Uint8Array(Buffer.from('Tutor;Pet\nAna;Mel'))), false);
  });
  await t('zip quebrado: erro (a tela pede para salvar como CSV)', async () => {
    await assert.rejects(() => X.lerXlsx(new Uint8Array(Buffer.from('PK\x03\x04 quebrado')), inflar));
  });
  await t('o texto separado por tabulação volta igual pela leitura da tela (aspas, ponto e vírgula, quebra de linha)', async () => {
    const r = await X.lerXlsx(new Uint8Array(xlsx([...linhas, ['Carla; Silva', '11977776666', 'Nina\nsegunda linha', 'x']])), inflar);
    const texto = PL.tabelaComoTexto(r);
    const volta = PL.lerTabela(texto);
    assert.deepEqual(volta[0], r[0]);
    assert.equal(volta[1][2], 'Luna, Bob');
    assert.equal(volta[3][0], 'Bia "Pet"');
    assert.equal(volta[4][0], 'Carla; Silva');
    assert.equal(volta[4][2], 'Nina\nsegunda linha');
  });
  await t('planilha de uma coluna só ainda é lida', async () => {
    const volta = PL.lerTabela(PL.tabelaComoTexto([['Tutor'], ['Ana'], ['Beto, Lima']]));
    assert.equal(volta[2][0], 'Beto, Lima');
  });

  T.secao('pets, alertas e linhas para o banco');
  await t('"Luna, Bob", "Mel e Bob", "Thor / Rex": dois pets', () => {
    assert.deepEqual(PL.separarPets('Luna, Bob'), ['Luna', 'Bob']);
    assert.deepEqual(PL.separarPets('Mel e Bob'), ['Mel', 'Bob']);
    assert.deepEqual(PL.separarPets('Thor / Rex'), ['Thor', 'Rex']);
  });
  await t('nome de pet que não é lista fica como está', () => {
    assert.deepEqual(PL.separarPets('Thor filhote'), ['Thor filhote']);
    assert.deepEqual(PL.separarPets('Pé de Pano'), ['Pé de Pano']);
    assert.deepEqual(PL.separarPets('Branca de neve e os sete anões'), ['Branca de neve e os sete anões']);
    assert.deepEqual(PL.separarPets(''), []);
  });
  await t('alergia, bravo, medo, remédio: alerta; laço, secador sem medo: não', () => {
    for (const s of ['Alergia a shampoo comum', 'Bravo com outros machos', 'Tem medo de secador', 'Toma remédio do coração', 'Morde quando corta unha', 'Epilético']) assert.equal(PL.ehAlerta(s), true, s);
    for (const s of ['Gosta de laço', 'Usa secador', 'Vem às terças', 'Corte bebê', '']) assert.equal(PL.ehAlerta(s), false, s);
  });
  await t('linhas para o banco: um pet por linha, telefone limpo, alerta separado da observação', () => {
    const { linhas: l, extra } = PL.linhasParaOBanco([
      { tutor: 'Ana', telefone: '(11) 91234-5678 / 11 98888-0000', pet: 'Luna, Bob', especie: 'gato', porte: 'médio', obs: 'Alergia a shampoo comum' },
      { tutor: 'Beto', telefone: '1191', pet: '', obs: 'Gosta de laço' },
      { tutor: '  ', pet: 'Sem tutor' },
    ], true);
    assert.equal(l.length, 3);
    assert.deepEqual(l.map((x) => x.pet), ['Luna', 'Bob', '']);
    assert.equal(l[0].fone, '11912345678');
    assert.equal(l[0].especie, 'gato'); assert.equal(l[0].especie_dada, true); assert.equal(l[0].porte, 'M');
    assert.equal(l[0].alertas, 'Alergia a shampoo comum'); assert.equal(l[0].obs, '');
    assert.equal(l[2].fone, null);
    assert.deepEqual(extra, { fone_ruim: ['Beto'], dois_fones: ['Ana'], sem_pet: false, separados: 1 });
  });

  T.secao('o resumo');
  await t('a primeira frase usa os números do banco ("7 tutores novos e 7 pets novos")', () => {
    const f = PL.frasesDoResumo({ tutores_novos: 7, pets_novos: 7, tutores_completados: 0, pets_completados: 0, ja_estavam: 0, linhas_repetidas: 0, mesmo_nome: [], homonimos: 0, com_alerta: 0 });
    assert.deepEqual(f, ['7 tutores novos e 7 pets novos no cadastro.']);
  });
  await t('singular, nada novo, separados, alertas e telefones', () => {
    const f = PL.frasesDoResumo({ tutores_novos: 1, pets_novos: 1, tutores_completados: 0, pets_completados: 0, ja_estavam: 0, linhas_repetidas: 0, mesmo_nome: [], homonimos: 0, com_alerta: 2, separados: 1, fone_ruim: ['Beto'] });
    assert.equal(f[0], '1 tutor novo e 1 pet novo no cadastro.');
    assert.ok(f.some((x) => /1 linha tinha mais de um pet/.test(x)));
    assert.ok(f.some((x) => /2 pets ficaram com alerta/.test(x)));
    assert.ok(f.some((x) => /1 telefone estava incompleto e ficou em branco: Beto/.test(x)));
    assert.equal(PL.frasesDoResumo({ tutores_novos: 0, pets_novos: 0, tutores_completados: 0, pets_completados: 0, ja_estavam: 3, linhas_repetidas: 0, mesmo_nome: [], homonimos: 0, com_alerta: 0 })[0].startsWith('Nada novo'), true);
  });
  await t('resumo vazio ou estranho não quebra', () => {
    assert.equal(PL.frasesDoResumo({})[0].startsWith('Nada novo'), true);
  });
}))();
