// Unidade: segunda rodada no site real (Rafael, Bia, Juliana, Neide), creche, hotel, caixa e relatórios. Sem banco.
//   - erro técnico do banco nunca na tela: tempo esgotado vira "Demorou demais, tente de novo" (textoAmigavel, ehDemora);
//   - foto da entrada: tenta de novo quando a internet falha e desiste com aviso (subirFotoDaEntrada, com um banco de mentira);
//   - Termos e Política 2.3 vigentes desde 17/11/2026 (a versão não muda);
//   - mapa do leva e traz sem a cidade repetida (comCidade);
//   - comprovante com a data do pagamento quando o horário é de outro dia (linhasDaData, textoComprovante);
//   - Quanto sobrou com as linhas da creche e do hotel (linhasDaCasa);
//   - indicadores: reservas canceladas no período pelo dia do cancelamento (totaisIndicadores).
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-rodada2-h');
const ER = lib('erros');
const EN = lib('entrada');
const DOC = lib('documentos');
const QD = lib('quadro');
const CP = lib('comprovante');
const LU = lib('lucro');
const IN = lib('indicadores');
const HO = lib('hotel');
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const ta = async (nome, f) => { try { await f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };

(async () => T.rodar(async () => {
  T.secao('erro técnico do banco');
  t('tempo esgotado do banco vira "Demorou demais, tente de novo"', () => {
    assert.equal(ER.textoAmigavel('canceling statement due to statement timeout'), 'Demorou demais, tente de novo.');
    assert.ok(ER.ehDemora('[57014] canceling statement due to statement timeout'));
    assert.ok(ER.ehDemora('504 Gateway Timeout'));
  });
  t('erro 500 e texto do banco em inglês viram frase em português', () => {
    assert.match(ER.textoAmigavel('Internal Server Error'), /servidor falhou/);
    assert.match(ER.textoAmigavel('relation "x" does not exist'), /Algo deu errado/);
  });
  t('a recusa escrita para a pessoa continua como veio', () => {
    assert.equal(ER.textoAmigavel('Essa reserva já tinha sido alterada. Atualize a lista.'), null);
    assert.equal(ER.ehDemora('O plano não vale nesse mês.'), false);
  });

  T.secao('foto da entrada: tenta de novo e não some sem aviso');
  const banco = (respostas) => {
    const chamadas = [];
    return { chamadas, storage: { from: () => ({ upload: async (caminho) => { chamadas.push(caminho); const r = respostas.shift(); if (r === 'trava') return new Promise(() => {}); if (r instanceof Error) throw r; return r; } }) } };
  };
  await ta('falhou uma vez (544), na segunda subiu: devolve o caminho da segunda tentativa', async () => {
    const sb = banco([{ error: { message: 'Gateway timeout 544' } }, { error: null }]);
    const c = await EN.subirFotoDaEntrada(sb, 'loja', new Blob(['x']), 3, 200);
    assert.equal(sb.chamadas.length, 2);
    assert.equal(c, sb.chamadas[1]);
    assert.match(c, /^loja\/[0-9a-f-]{36}\.jpg$/);
  });
  await ta('a tentativa que trava passa do prazo e a próxima tenta de novo', async () => {
    const sb = banco(['trava', { error: null }]);
    const c = await EN.subirFotoDaEntrada(sb, 'loja', new Blob(['x']), 3, 50);
    assert.equal(sb.chamadas.length, 2);
    assert.equal(c, sb.chamadas[1]);
  });
  await ta('três falhas: erro com "Tentar de novo" (a tela guarda a foto)', async () => {
    const sb = banco([new Error('Failed to fetch'), { error: { message: '500' } }, { error: { message: '544' } }]);
    await assert.rejects(EN.subirFotoDaEntrada(sb, 'loja', new Blob(['x']), 3, 50), /Tentar de novo/);
    assert.equal(sb.chamadas.length, 3);
  });
  await ta('foto grande demais não tenta de novo', async () => {
    const sb = banco([{ error: { message: 'Payload too large: size' } }, { error: null }]);
    await assert.rejects(EN.subirFotoDaEntrada(sb, 'loja', new Blob(['x']), 3, 50), /grande demais/);
    assert.equal(sb.chamadas.length, 1);
  });

  T.secao('termos');
  t('Termos e Política 2.4 vigentes desde 18/11/2026', () => {
    assert.equal(DOC.DOCUMENTOS.termos.versao, '2.4');
    assert.equal(DOC.textoVigencia('termos'), 'Versão 2.4 — vigente desde 18/11/2026');
    assert.equal(DOC.textoVigencia('privacidade'), 'Versão 2.4 — vigente desde 18/11/2026');
  });

  T.secao('mapa do leva e traz');
  t('endereço que já diz a cidade não repete "Campinas, Campinas"', () => {
    assert.equal(QD.comCidade('Rua Teste 2, 200 - Taquaral, Campinas', 'Campinas - SP'), 'Rua Teste 2, 200 - Taquaral, Campinas - SP');
    assert.equal(QD.comCidade('Rua Teste 2, 200 - Taquaral, Campinas - SP', 'Campinas - SP'), 'Rua Teste 2, 200 - Taquaral, Campinas - SP');
    assert.equal(QD.comCidade('Rua Teste 2, 200 - Taquaral', 'Campinas - SP'), 'Rua Teste 2, 200 - Taquaral, Campinas - SP');
    assert.ok(!decodeURIComponent(QD.linkDoMapa('Rua Teste 2, 200 - Taquaral, Campinas', 'Campinas - SP')).includes('Campinas, Campinas'));
  });
  t('bairro com o nome parecido com a cidade não engana ("Campinas" ≠ "Campinas Velha" não conta como a cidade "Vinhedo")', () => {
    assert.equal(QD.comCidade('Rua A, 1 - Campinas Velha', 'Vinhedo - SP'), 'Rua A, 1 - Campinas Velha, Vinhedo - SP');
  });

  T.secao('comprovante: data do pagamento');
  t('mesmo dia: uma linha "Data:"', () => {
    assert.deepEqual(CP.linhasDaData('2026-11-17T13:00:00-03:00', '2026-11-17'), ['Data: 17/11/2026']);
  });
  t('horário de amanhã recebido hoje: "Data do pagamento: 17/11/2026" e "Atendimento: 18/11/2026"', () => {
    assert.deepEqual(CP.linhasDaData('2026-11-18T10:00:00-03:00', '2026-11-17'), ['Data do pagamento: 17/11/2026', 'Atendimento: 18/11/2026']);
    const txt = CP.textoComprovante({ petshop: 'Loja', tutor: 'Ana', pet: 'Thor', servico: 'Banho', quando: '2026-11-18T10:00:00-03:00', recebidos: [{ valor: 150, forma: 'pix', data: '2026-11-17' }] });
    assert.match(txt, /Data do pagamento: 17\/11\/2026/);
    assert.doesNotMatch(txt, /Data: 18\/11\/2026/);
  });

  T.secao('comprovante do hotel');
  t('2 noites de quem sai no dia 17: "(15/11 a 17/11)", não "(15/11 a 16/11)"', () => {
    const noite = (dia) => ({ dia, base: 130, temporada: null, cheia: 130, desconto: 0, valor: 130 });
    const c = { tipo: 'hotel', noites: [noite('2026-11-15'), noite('2026-11-16')], diarias: 2, taxas: [], extras: [], produtos: [], ajuste: 0, promo: null, pacote: null };
    const l = HO.linhasDaConta(c);
    assert.match(l[0].texto, /2 noites de R\$\s130,00 \(15\/11 a 17\/11\)/);
  });

  T.secao('Quanto sobrou: creche e hotel');
  t('mensalidades e diárias da creche viram linhas (sem custo por serviço); as outras categorias ficam de fora', () => {
    const l = LU.linhasDaCasa([{ categoria: 'Creche: mensalidade', valor: 2218.89, lancamentos: 3 }, { categoria: 'Creche e hotel', valor: 130, lancamentos: 1 }, { categoria: 'Outros', valor: 50, lancamentos: 1 }], () => 'Creche');
    assert.equal(l.length, 2);
    assert.equal(l[0].nome, 'Creche: mensalidades');
    assert.equal(l[0].receita, 2218.89);
    assert.equal(l[0].custo, null);
    assert.equal(l[1].nome, 'Creche: diárias e taxas');
  });

  T.secao('indicadores: cancelamentos pelo dia do cancelamento');
  const mes = (x) => ({ mes: '2026-11', de: '2026-11-01', ate: '2026-11-17', faturamento: 0, entradas: 0, saiu: 0, resultado: 0, taxas: 0, resultado_depois_taxas: 0, valor_medio: null,
    contas: 0, atendimentos: 0, faltas: 0, cancelados: 0, marcados: 1, estadias_creche: 0, estadias_hotel: 0, clientes: 0, primeira_vez: 0, voltaram: 0, estadias_marcadas: 1, estadias_canceladas: 0, ...x });
  const base = { de: '2026-11-01', ate: '2026-11-17', dinheiro: true, clientes: 0, primeira_vez: 0, retorno_60: { clientes: 0, voltaram: 0 }, servicos: [], produtos: [], mapa: [] };
  t('duas reservas canceladas hoje para dezembro aparecem no período', () => {
    const tt = IN.totaisIndicadores(IN.lerIndicadores({ ...base, meses: [mes({ estadias_canceladas_no_periodo: 2 })] }));
    assert.equal(tt.canceladasNoPeriodo, 2);
    assert.equal(tt.reservasCanceladas, 0); // pelo dia da entrada, continuam fora (são de dezembro)
  });
  t('banco antigo (sem o dia do cancelamento): como antes', () => {
    const tt = IN.totaisIndicadores(IN.lerIndicadores({ ...base, meses: [mes({ estadias_canceladas: 1 })] }));
    assert.equal(tt.canceladasNoPeriodo, 1);
  });
  t('a tela abre em Este mês', () => assert.equal(IN.PERIODO_INICIAL, 'mes'));
}))();
