// Unidade: textos do boletim do pet (src/lib/gestao/boletim.ts): a mensagem do WhatsApp com o primeiro nome do tutor e o
// "do/da/de" do pet, o texto pronto só com o que a equipe marcou, a limpeza da resposta do modelo e o link do Google.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-boletim');
const Bo = lib('boletim');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

T.secao('mensagem do WhatsApp');
t('"Oi, Ana! O boletim do Thor de hoje: <link>" (primeiro nome do tutor, pet macho)', () =>
  assert.equal(Bo.mensagemDoBoletim({ tutor: 'Ana Souza', pet: 'Thor', sexo: 'M', url: 'https://x/b/1' }), 'Oi, Ana! O boletim do Thor de hoje: https://x/b/1'));
t('fêmea: "da Mel"; tratamento mantido: "Dona Zefa"', () =>
  assert.equal(Bo.mensagemDoBoletim({ tutor: 'Dona Zefa Lima', pet: 'Mel', sexo: 'F', url: 'u' }), 'Oi, Dona Zefa! O boletim da Mel de hoje: u'));
t('sem tutor e sem sexo: "Oi! O boletim de Bidu"', () =>
  assert.equal(Bo.mensagemDoBoletim({ tutor: null, pet: 'Bidu', sexo: null, url: 'u' }), 'Oi! O boletim de Bidu de hoje: u'));

T.secao('texto pronto (sem IA)');
t('banho: abertura com os serviços, uma frase por recado, a nota e o obrigado', () => {
  const s = Bo.textoModelo({ tipo: 'banho', pet: 'Thor', sexo: 'M', petshop: 'Pet X', servicos: 'Banho e Hidratação', chips: ['comportado', 'perfume'], nota: 'adorou a água' });
  assert.equal(s, 'Thor fez banho e hidratação aqui com a gente hoje. Se comportou muito bem. Saiu perfumado. adorou a água. Obrigado pela confiança!');
});
t('fêmea: "perfumada"; sem sexo: "com perfume"', () => {
  assert.match(Bo.textoModelo({ tipo: 'banho', pet: 'Mel', sexo: 'F', petshop: 'P', chips: ['perfume'] }), /Saiu perfumada\./);
  assert.match(Bo.textoModelo({ tipo: 'banho', pet: 'Bidu', sexo: null, petshop: 'P', chips: ['perfume'] }), /Saiu com perfume\./);
});
t('creche: comeu, brincou e a amizade; nada que não foi marcado', () => {
  const s = Bo.textoModelo({ tipo: 'creche', pet: 'Bob', sexo: 'M', petshop: 'P', chips: ['comeu_tudo', 'brincou'], amigo: 'Mel' });
  assert.equal(s, 'Bob passou o dia na creche com a gente. Comeu tudo. Brincou muito. Fez amizade com Mel. Obrigado pela confiança!');
  assert.doesNotMatch(s, /remédio|cocô|descansou/i);
});
t('hotel: "Notícias do Bob no hotel."', () => assert.match(Bo.textoModelo({ tipo: 'hotel', pet: 'Bob', sexo: 'M', petshop: 'P', chips: [] }), /^Notícias do Bob no hotel\./));
t('recados guardados e lidos de volta (com a amizade)', () => {
  const r = Bo.rotulosDosChips('creche', ['comeu_pouco', 'remedio'], ' Mel ');
  assert.deepEqual(r, ['Comeu pouco', 'Tomou remédio', 'Fez amizade com Mel']);
  assert.deepEqual(Bo.chipsDosRotulos('creche', r), { ids: ['comeu_pouco', 'remedio'], amigo: 'Mel' });
});
t('os dados que vão ao modelo não têm nada do tutor', () => {
  const d = Bo.dadosParaOModelo({ tipo: 'banho', pet: 'Thor', sexo: 'M', petshop: 'Pet X', chips: ['lacinho'], nota: 'oi' });
  assert.match(d, /Recados da equipe: Lacinho/);
  assert.doesNotMatch(d, /tutor|telefone/i);
});

T.secao('resposta do modelo');
t('tira markdown, link e telefone', () =>
  assert.equal(Bo.limparTextoDoModelo('**Thor** ficou lindo! Veja https://x.com e ligue (11) 98888-0001.'), 'Thor ficou lindo! Veja e ligue.'));
t('corta texto comprido', () => assert.ok(Bo.limparTextoDoModelo('palavra '.repeat(200)).length <= 702));

T.secao('link do Google');
for (const [bruto, certo] of [
  ['g.page/r/CabcDEF/review', 'https://g.page/r/CabcDEF/review'],
  ['  https://search.google.com/local/writereview?placeid=ChIJ1 ', 'https://search.google.com/local/writereview?placeid=ChIJ1'],
  ['http://maps.app.goo.gl/AbC', 'https://maps.app.goo.gl/AbC'],
  ['https://WWW.Google.com/maps/place/Loja', 'https://www.google.com/maps/place/Loja'],
]) t(`aceita ${bruto.trim()}`, () => assert.deepEqual(Bo.lerLinkDoGoogle(bruto), { link: certo, erro: null }));
for (const ruim of ['https://golpe.com/g.page/x', 'https://g.page.golpe.com/x', 'javascript:alert(1)', 'https://www.google.com.golpe.com/maps'])
  t(`recusa ${ruim}`, () => assert.ok(Bo.lerLinkDoGoogle(ruim).erro));
t('vazio: sem link e sem erro (tirar o link)', () => assert.deepEqual(Bo.lerLinkDoGoogle('  '), { link: null, erro: null }));

T.rodar(async () => {});
