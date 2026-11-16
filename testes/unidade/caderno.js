// Unidade: leitura do caderno ou do outro sistema (src/lib/gestao/caderno.ts e caderno-ia.ts), sem banco e sem modelo.
// Datas como estão escritas ("12/10" sem ano), horas, a limpeza do que a IA devolve (nada inventado), o tipo do arquivo pelos
// primeiros bytes e as páginas de um PDF.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-caderno');
const C = lib('caderno');
const IA = lib('caderno-ia');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

/** PDF mínimo com `n` páginas (objetos /Type /Page de verdade). */
function pdf(n) {
  const kids = Array.from({ length: n }, (_, i) => `${i + 3} 0 R`).join(' ');
  const pags = Array.from({ length: n }, (_, i) => `${i + 3} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >> endobj`).join('\n');
  return Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [${kids}] /Count ${n} >> endobj\n${pags}\ntrailer << /Root 1 0 R >>\n%%EOF\n`, 'latin1');
}

T.secao('datas do caderno');
const HOJE = '2026-11-16';
t('"12/10" sem ano, para quem deve: outubro deste ano', () => assert.equal(C.lerDataDoCaderno('12/10', HOJE, 'passado'), '2026-10-12'));
t('"20/12" sem ano, para quem deve: dezembro do ano passado (nunca depois de hoje)', () => assert.equal(C.lerDataDoCaderno('20/12', HOJE, 'passado'), '2025-12-20'));
t('"12/10" sem ano, na agenda: o mais perto de hoje (outubro deste ano, que já passou)', () => assert.equal(C.lerDataDoCaderno('12/10', HOJE, 'perto'), '2026-10-12'));
t('"05/01" sem ano, na agenda em novembro: janeiro do ano que vem', () => assert.equal(C.lerDataDoCaderno('05/01', HOJE, 'perto'), '2027-01-05'));
t('ano com 2 e 4 algarismos, ponto e traço', () => {
  assert.equal(C.lerDataDoCaderno('12/10/25', HOJE, 'passado'), '2025-10-12');
  assert.equal(C.lerDataDoCaderno('3-2-2026', HOJE, 'passado'), '2026-02-03');
  assert.equal(C.lerDataDoCaderno('12.10', HOJE, 'passado'), '2026-10-12');
});
t('data que não existe ou texto solto: null', () => {
  assert.equal(C.lerDataDoCaderno('31/02', HOJE, 'perto'), null);
  assert.equal(C.lerDataDoCaderno('ontem', HOJE, 'perto'), null);
  assert.equal(C.lerDataDoCaderno('', HOJE, 'perto'), null);
});
t('horas: 14h, 9h30, 14:30, 9 h; 25h não', () => {
  assert.equal(C.lerHoraDoCaderno('14h'), '14:00');
  assert.equal(C.lerHoraDoCaderno('9h30'), '09:30');
  assert.equal(C.lerHoraDoCaderno('14:30'), '14:30');
  assert.equal(C.lerHoraDoCaderno('9 h'), '09:00');
  assert.equal(C.lerHoraDoCaderno('25h'), null);
  assert.equal(C.lerHoraDoCaderno('de manhã'), null);
});

T.secao('limpeza do que a IA leu');
const L = C.limparLeitura({
  pagina: 'misturado',
  clientes: [{ nome: '  Ana   Souza ', telefone: '11 98888-0001', obs: '', certeza: 'alta', pets: [{ nome: 'Thor', especie: 'cao', raca: '', porte: 'X' }, { nome: '', especie: '', raca: '', porte: '' }] }, { nome: '', telefone: '', obs: '', certeza: 'alta', pets: [] }],
  dividas: [{ cliente_nome: 'Beto', telefone: '', valor: 35, desde: '12/10', descricao: 'Banho', certeza: 'alta' }, { cliente_nome: 'Joana', telefone: '', valor: null, desde: 'ontem', descricao: '', certeza: 'alta' }],
  agenda: [{ dia: '20/11', hora: '10h', pet_nome: 'Thor', tutor_nome: 'Ana', servico: 'Banho', certeza: 'alta' }, { dia: '', hora: '', pet_nome: 'Mel', tutor_nome: '', servico: '', certeza: 'alta' }],
  servicos: [{ nome: 'Tosa', area: 'xyz', duracao_min: 2, preco_unico: 40, preco_p: null, preco_m: null, preco_g: null, preco_gg: null, certeza: 'alta' }, { nome: 'Banho', area: 'banho_tosa', duracao_min: 60, preco_unico: null, preco_p: 50, preco_m: 55, preco_g: null, preco_gg: null, certeza: 'alta' }],
  vacinas: [{ tipo: 'vacina', nome: 'V10', aplicada: '10/10/2026', proxima: '', veterinario: 'Dra. Paula', certeza: 'alta' }, { tipo: 'pulga', nome: 'Bravecto', aplicada: '01/11/2026', proxima: '01/02/2027', veterinario: '', certeza: 'baixa' }],
  duvidas: ['Linha 3: telefone borrado'],
  extra: 'ignorado',
}, HOJE);
t('nomes com espaços arrumados; linha sem nada sai; pet sem nome sai; porte desconhecido vira vazio', () => {
  assert.equal(L.clientes.length, 1);
  assert.equal(L.clientes[0].nome, 'Ana Souza');
  assert.deepEqual(L.clientes[0].pets, [{ nome: 'Thor', especie: 'cao', raca: '', porte: null }]);
});
t('dívida: "desde" vira data; valor ilegível fica em branco e pede verificação (nada inventado)', () => {
  assert.equal(L.dividas[0].desde, '2026-10-12');
  assert.equal(L.dividas[0].duvida, false);
  assert.equal(L.dividas[1].valor, null);
  assert.equal(L.dividas[1].desde, null);
  assert.equal(L.dividas[1].duvida, true);
});
t('agenda: dia e hora conferidos; sem dia, fica em branco e com verificação', () => {
  assert.equal(L.agenda[0].dia, '2026-11-20');
  assert.equal(L.agenda[0].hora, '10:00');
  assert.equal(L.agenda[1].dia, null);
  assert.equal(L.agenda[1].duvida, true);
});
t('preço único vale para todos os portes; por porte, só os escritos; área desconhecida vira banho e tosa; tempo fora da faixa some', () => {
  assert.deepEqual([L.servicos[0].preco_p, L.servicos[0].preco_m, L.servicos[0].preco_g, L.servicos[0].preco_gg], [40, 40, 40, 40]);
  assert.equal(L.servicos[0].area, 'banho_tosa');
  assert.equal(L.servicos[0].duracao_min, null);
  assert.deepEqual([L.servicos[1].preco_p, L.servicos[1].preco_m, L.servicos[1].preco_g], [50, 55, null]);
});
t('carteirinha: a próxima dose só quando está escrita (nunca calculada); tipo desconhecido vira Outro', () => {
  assert.equal(L.vacinas[0].aplicado, '2026-10-10');
  assert.equal(L.vacinas[0].vence, null);
  assert.equal(L.vacinas[1].tipo, 'outro');
  assert.equal(L.vacinas[1].vence, '2027-02-01');
});
t('dúvidas passam; campo desconhecido não', () => { assert.deepEqual(L.duvidas, ['Linha 3: telefone borrado']); assert.equal(L.extra, undefined); });
t('resposta torta (não é objeto): listas vazias', () => { const v = C.limparLeitura('oi', HOJE); assert.equal(v.clientes.length + v.dividas.length + v.agenda.length + v.servicos.length + v.vacinas.length, 0); });

T.secao('leitura de teste e esquema');
t('a leitura de teste passa pela mesma limpeza; com PDF, o relatório do outro sistema', () => {
  const a = C.limparLeitura(IA.leituraDeTeste('auto', HOJE, false), HOJE);
  assert.ok(a.clientes.some((c) => c.nome === 'Ana Souza') && a.dividas.length === 2 && a.agenda.length === 2 && a.servicos.length === 0 && a.vacinas.length === 0);
  const p = C.limparLeitura(IA.leituraDeTeste('clientes', HOJE, true), HOJE);
  assert.deepEqual(p.clientes.map((c) => c.nome), ['Clara Dias', 'Paulo Nunes']);
  const v = C.limparLeitura(IA.leituraDeTeste('vacinas', HOJE, false), HOJE);
  assert.equal(v.vacinas.find((x) => x.nome === 'Antirrábica').vence, null);
});
t('esquema estrito: todo objeto fecha os campos e pede todos', () => {
  const ver = (o) => {
    if (o && o.type === 'object') { assert.equal(o.additionalProperties, false); assert.deepEqual([...o.required].sort(), Object.keys(o.properties).sort()); Object.values(o.properties).forEach(ver); }
    if (o && o.type === 'array') ver(o.items);
  };
  ver(IA.ESQUEMA_CADERNO);
});

T.secao('arquivos');
t('tipo pelos primeiros bytes', () => {
  assert.equal(IA.tipoDoArquivo(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'image/jpeg');
  assert.equal(IA.tipoDoArquivo(Buffer.from('\x89PNG\r\n\x1a\n0000', 'latin1')), 'image/png');
  assert.equal(IA.tipoDoArquivo(Buffer.from('RIFF0000WEBPVP8 ', 'latin1')), 'image/webp');
  assert.equal(IA.tipoDoArquivo(pdf(1)), 'application/pdf');
  assert.equal(IA.tipoDoArquivo(Buffer.from('nome;telefone\nAna;1199', 'utf8')), null);
});
t('páginas do PDF: 1, 3 e 25', () => { assert.equal(IA.paginasDoPdf(pdf(1)), 1); assert.equal(IA.paginasDoPdf(pdf(3)), 3); assert.equal(IA.paginasDoPdf(pdf(25)), 25); });

T.rodar(async () => {});
