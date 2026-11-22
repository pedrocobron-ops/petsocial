// Unidade: o pet do pedido pelo link já está na ficha do tutor? (src/lib/gestao/pet-parecido.ts)
// Nome igual (sem acento): é ele, sem perguntar. Parecido: a tela pergunta. Bem diferente: pet novo, sem perguntar.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-pet-parecido');
const P = lib('pet-parecido');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

const pet = (nome, o = {}) => ({ id: `id-${nome}`, nome, especie: 'cao', sexo: null, porte: null, ativo: true, ...o });
const tipo = (nome, pets, especie = 'cao') => P.acharPet(nome, especie, pets).tipo;
const nomes = (nome, pets, especie = 'cao') => { const r = P.acharPet(nome, especie, pets); return r.tipo === 'parecido' ? r.pets.map((p) => p.nome) : r.tipo === 'igual' ? [r.pet.nome] : []; };
// o tutor tem um cão e um gato (assim a régua mais larga do "pet único da espécie" não entra nos casos comuns)
const comOutro = (...ps) => [...ps, pet('Xaxim', { especie: 'gato' }), pet('Zeca')];

T.secao('nome igual: é ele, sem perguntar');
t('maiúsculas e espaços', () => assert.equal(tipo('  thor ', comOutro(pet('Thor'))), 'igual'));
t('Pérola = Perola (acento não conta)', () => { assert.equal(tipo('Perola', comOutro(pet('Pérola'))), 'igual'); assert.equal(tipo('PÉROLA', comOutro(pet('Perola'))), 'igual'); });
t('a mesma conta do banco (nome_de_pet)', () => assert.equal(P.nomeDePet('  Pérola   da  Silva '), 'perola da silva'));
t('a tabela de troca do banco: ø, ÿ, ç, ã, maiúsculas', () => {
  assert.equal(P.nomeDePet('Bjørn'), 'bjorn'); assert.equal(P.nomeDePet('ÿves'), 'yves');
  assert.equal(P.nomeDePet('Çãø JOSÉ'), 'cao jose'); assert.equal(P.nomeDePet('ŁUKASZ Đorđe'), 'lukasz dorde');
});
t('Bjørn = Bjorn, Pipoção = Pipocao (acento fora do NFD também não conta)', () => { assert.equal(tipo('Bjorn', comOutro(pet('Bjørn'))), 'igual'); assert.equal(tipo('PIPOCAO', comOutro(pet('Pipoção'))), 'igual'); });
t('letra fora da tabela fica como está (o banco faz o mesmo)', () => assert.equal(P.nomeDePet('Æsir  Ω'), 'æsir ω'));
t('pet inativo com o mesmo nome: igual (o banco usa a ficha dele)', () => assert.equal(tipo('Mel', [pet('Mel', { ativo: false })]), 'igual'));

T.secao('nome parecido: pergunta');
t('Thor e Tor', () => { assert.deepEqual(nomes('Tor', comOutro(pet('Thor'))), ['Thor']); assert.deepEqual(nomes('Thor', comOutro(pet('Tor'))), ['Tor']); });
t('Mel e Melzinha', () => { assert.deepEqual(nomes('Melzinha', comOutro(pet('Mel'))), ['Mel']); assert.deepEqual(nomes('Mel', comOutro(pet('Melzinha'))), ['Melzinha']); });
t('Bob e Bobby', () => assert.deepEqual(nomes('Bobby', comOutro(pet('Bob'))), ['Bob']));
t('Luna e Lua', () => { assert.deepEqual(nomes('Lua', comOutro(pet('Luna'))), ['Luna']); assert.deepEqual(nomes('Luna', comOutro(pet('Lua'))), ['Lua']); });
t('erro de digitação num nome comprido: Pipoquinha e Pipoqinha', () => assert.deepEqual(nomes('Pipoqinha', comOutro(pet('Pipoquinha'))), ['Pipoquinha']));
t('parecença: 0 igual, 1 ou 2 parecido, null diferente', () => { assert.equal(P.parecenca('Pérola', 'perola'), 0); assert.equal(P.parecenca('Tor', 'Thor'), 1); assert.equal(P.parecenca('Rex', 'Mel'), null); });

T.secao('nome diferente: pet novo, sem perguntar');
t('Rex e Mel', () => assert.equal(tipo('Rex', comOutro(pet('Mel'))), 'novo'));
t('Mel e Bel: inicial diferente num nome curto', () => assert.equal(tipo('Bel', comOutro(pet('Mel'))), 'novo'));
t('tutor sem pets: novo', () => assert.equal(tipo('Thor', []), 'novo'));
t('pet parecido mas inativo: não pergunta', () => assert.equal(tipo('Tor', [pet('Thor', { ativo: false }), pet('Zeca')]), 'novo'));

T.secao('um pet só da mesma espécie: régua um pouco mais larga');
t('Luna e Lulu, com um cão só: pergunta', () => assert.deepEqual(nomes('Lulu', [pet('Luna'), pet('Xaxim', { especie: 'gato' })]), ['Luna']));
t('Luna e Lulu, com dois cães: não pergunta', () => assert.equal(tipo('Lulu', [pet('Luna'), pet('Zeca'), pet('Xaxim', { especie: 'gato' })]), 'novo'));
t('Luna (gato) e Lulu (cão): a régua larga é só para a mesma espécie', () => assert.equal(tipo('Lulu', [pet('Luna', { especie: 'gato' })], 'cao'), 'novo'));
t('nem com um pet só: Rex e Mel são diferentes', () => assert.equal(tipo('Rex', [pet('Mel')]), 'novo'));

T.secao('mais de um parecido');
t('"Meli" com Mel, Mely e Melzinha na ficha: pergunta entre Mel e Mely (Melzinha já é longe)', () => assert.deepEqual(nomes('Meli', comOutro(pet('Melzinha'), pet('Mely'), pet('Mel'))), ['Mel', 'Mely']));
t('"Mel" com Melzinha e Melissa: os dois parecidos', () => assert.deepEqual(nomes('Mel', comOutro(pet('Melzinha'), pet('Melissa'))), ['Melissa', 'Melzinha']));
t('a mesma espécie vem primeiro no empate', () => assert.deepEqual(nomes('Tor', [pet('Toy', { especie: 'gato' }), pet('Thor'), pet('Zeca')]), ['Thor', 'Toy']));
t('no máximo 3', () => assert.equal(nomes('Bia', [pet('Bia1'), pet('Bia2'), pet('Bia3'), pet('Bia4')]).length, 3));

T.secao('a pergunta');
t('com sexo: "É o Thor que já está cadastrado?" e "Sim, é ele"', () => { assert.equal(P.perguntaDoPet({ nome: 'Thor', sexo: 'M' }), 'É o Thor que já está cadastrado?'); assert.equal(P.simDoPet({ nome: 'Thor', sexo: 'M' }), 'Sim, é ele'); });
t('fêmea: "É a Mel que já está cadastrada?" e "Sim, é ela"', () => { assert.equal(P.perguntaDoPet({ nome: 'Mel', sexo: 'F' }), 'É a Mel que já está cadastrada?'); assert.equal(P.simDoPet({ nome: 'Mel', sexo: 'F' }), 'Sim, é ela'); });
t('sem sexo: frase neutra', () => { assert.equal(P.perguntaDoPet({ nome: 'Thor', sexo: null }), 'É Thor, que já tem cadastro?'); assert.equal(P.simDoPet({ nome: 'Thor' }), 'Sim, é esse pet'); });
t('com o nome (mais de um parecido)', () => assert.equal(P.simDoPet({ nome: 'Mel', sexo: 'F' }, true), 'Sim, é a Mel'));

(async () => T.rodar(async () => {}))();
