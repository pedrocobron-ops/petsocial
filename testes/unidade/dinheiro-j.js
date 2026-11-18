// Unidade (rodada 8, J), sem banco: nascimento e sexo do pet na planilha de clientes (Sandra M6), o total do hotel que diz o
// que mudou (temporada, feriado, segundo pet), o comprovante da venda no balcão e do pacote (M5), a linha da promoção no
// comprovante (M1) e a dívida separada por vencimento (H2).
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-dinheiro-j');
const PL = lib('planilha'), H = lib('hotel'), C = lib('comprovante'), FI = lib('fiado');
const t = async (nome, f) => { try { await f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const sem = (s) => s.replace(/ /g, ' ');

(async () => T.rodar(async () => {
  T.secao('planilha de clientes: nascimento e sexo do pet');
  const hoje = '2026-11-18';
  await t('nascimento: 20/11/2021, 2021-11-20, 20/11 (sem ano = 1904), número do Excel', () => {
    assert.equal(PL.nascimentoDe('20/11/2021', hoje), '2021-11-20');
    assert.equal(PL.nascimentoDe('2021-11-20', hoje), '2021-11-20');
    assert.equal(PL.nascimentoDe('20/11', hoje), '1904-11-20');
    assert.equal(PL.nascimentoDe('20-11-21', hoje), '2021-11-20');
    assert.equal(PL.nascimentoDe('44520', hoje), '2021-11-20');
  });
  await t('nascimento que não existe, no futuro ou texto: em branco', () => {
    assert.equal(PL.nascimentoDe('31/02/2021', hoje), null);
    assert.equal(PL.nascimentoDe('20/11/2099', hoje), null);
    assert.equal(PL.nascimentoDe('filhote', hoje), null);
    assert.equal(PL.nascimentoDe('', hoje), null);
  });
  await t('sexo: Macho, M, masc. → M; Fêmea, F, fem → F; o resto em branco', () => {
    assert.deepEqual(['Macho', 'M', 'masc.', 'Fêmea', 'f', 'FEM', 'castrado', ''].map((x) => PL.sexoDe(x)), ['M', 'M', 'M', 'F', 'F', 'F', null, null]);
  });
  await t('linhasParaOBanco leva nascimento e sexo de cada pet; data ruim vai para o resumo', () => {
    const r = PL.linhasParaOBanco([
      { tutor: 'Ana', telefone: '11912345678', pet: 'Thor', nascimento: '20/11/2021', sexo: 'Macho' },
      { tutor: 'Bia', telefone: '11912345679', pet: 'Mel', nascimento: 'ontem', sexo: 'Fêmea' },
    ], true, hoje);
    assert.equal(r.linhas[0].nascimento, '2021-11-20'); assert.equal(r.linhas[0].sexo, 'M');
    assert.equal(r.linhas[1].nascimento, null); assert.equal(r.linhas[1].sexo, 'F');
    assert.deepEqual(r.extra.nascimento_ruim, ['Mel: ontem']);
  });
  await t('o resumo diz quantos entraram com o nascimento e quais datas não deu para ler', () => {
    const f = PL.frasesDoResumo({ tutores_novos: 2, pets_novos: 2, tutores_completados: 0, pets_completados: 0, ja_estavam: 0, linhas_repetidas: 0, mesmo_nome: [], homonimos: 0, com_alerta: 0, com_nascimento: 1, nascimento_ruim: ['Mel: ontem'] });
    assert.ok(f.some((x) => x.startsWith('1 pet entrou com a data de nascimento')), f.join(' | '));
    assert.ok(f.some((x) => x.includes('Mel: ontem')), f.join(' | '));
  });

  T.secao('hotel: o total diz o que mudou');
  await t('"com Férias, Feriado: Consciência Negra e desconto do segundo pet"', () => {
    const noites = [
      { dia: '2026-11-19', base: 140, temporada: 'Férias', cheia: 168, desconto: 0, valor: 168 },
      { dia: '2026-11-20', base: 140, temporada: 'Feriado: Consciência Negra', cheia: 175, desconto: 35, valor: 140 },
      { dia: '2026-11-21', base: 140, temporada: null, cheia: 140, desconto: 0, valor: 140 },
    ];
    assert.equal(H.oQueMudouNasNoites(noites), 'com Férias, Feriado: Consciência Negra e desconto do segundo pet');
    assert.equal(H.oQueMudouNasNoites([noites[2]]), '');
    assert.equal(H.oQueMudouNasNoites([noites[0]]), 'com Férias');
  });

  T.secao('comprovante');
  await t('promoção do horário como linha: aparece com o nome, sem "Desconto" repetido', () => {
    const txt = sem(C.textoComprovante({ petshop: 'Pet Feliz', tutor: 'Ana Souza', pet: 'Thor', quando: '2026-11-18T13:00:00Z', pagoEm: '2026-11-18', recebidos: [{ valor: 101.9, forma: 'pix', itens: [
      { tipo: 'servico', nome: 'Banho e tosa', qtd: 1, valor: 80 }, { tipo: 'produto', nome: 'Perfume Pet', qtd: 1, valor: 29.9 },
      { tipo: 'extra', nome: 'Promoção Aniversário do pet', qtd: 1, valor: -8, promo: true }] }] }));
    assert.ok(txt.includes('Promoção Aniversário do pet: -R$ 8,00'), txt);
    assert.ok(!txt.includes('Desconto:'), txt);
    assert.ok(txt.includes('Total: R$ 101,90'), txt);
  });
  await t('venda no balcão: "Segue o comprovante da compra", pagamento dividido com o valor de cada forma', () => {
    const txt = sem(C.textoComprovante({ petshop: 'Pet Feliz', tutor: 'Ana Souza', servico: 'Venda', quando: '2026-11-18T13:00:00Z', pagoEm: '2026-11-18', assunto: 'da compra',
      recebidos: [{ valor: 209.7, forma: 'debito', pagamentos: [{ forma: 'dinheiro', valor: 100 }, { forma: 'debito', valor: 109.7 }], itens: [{ tipo: 'produto', nome: 'Ração Golden', qtd: 1, valor: 209.7 }] }] }));
    assert.ok(txt.startsWith('Oi, Ana! Segue o comprovante da compra.'), txt);
    assert.ok(/Pagamento: Dinheiro R\$ 100,00 \+ Débito R\$ 109,70/.test(txt), txt);
    assert.ok(txt.includes('não é nota fiscal'), txt);
  });

  T.secao('maquininha: não paga no fim de semana (Sandra L10)');
  await t('domingo 17/01 e sábado 16/01 passam para segunda 18/01, somados ao que já caía nela', () => {
    const MQ = lib('maquininha');
    assert.deepEqual(MQ.emDiaUtil([{ dia: '2027-01-17', valor: 142.1 }, { dia: '2027-01-16', valor: 10 }, { dia: '2027-01-18', valor: 1 }, { dia: '2026-12-18', valor: 661.28 }]),
      [{ dia: '2026-12-18', valor: 661.28 }, { dia: '2027-01-18', valor: 153.1 }]);
  });

  T.secao('dívida por vencimento');
  await t('vencido, vence hoje (ou sem data), a vencer; o que conta no limite', () => {
    const d = FI.dividaPorVencimento([
      { valor: 100, vencimento: '2026-11-10', categoria: 'Banho e tosa' },
      { valor: 50, vencimento: null, categoria: 'Venda de produtos' },
      { valor: 79.9, vencimento: '2026-11-25', categoria: 'Venda de produtos', descricao: 'Venda: Ração' },
      { valor: 900, vencimento: '2026-12-05', categoria: 'Creche: mensalidade' },
    ], hoje);
    assert.deepEqual(d, { total: 1129.9, vencido: 100, venceHoje: 50, aVencer: 979.9, noLimite: 229.9, foraDoLimite: 900 });
  });
}))();
