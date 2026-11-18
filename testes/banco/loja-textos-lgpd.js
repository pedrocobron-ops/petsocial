// 2ª rodada das testadoras, conserto da migração 20261222 (loja, textos e LGPD):
// - estoque_entrada: produto com "Controlar validade" sem a validade é recusado (Camila: "Entraram 10 un de Bifinho" sem lote
//   nem validade, fora do Vencendo); com a validade e sem lote entra e vira um lote; produto sem o controle continua igual;
// - custo médio sem arredondar: 5 × 142 + 4 × 150 → custo 145,56 (como antes) e produtos_custo_exato 145,555… (valor em
//   estoque R$ 1.310,00, não 1.310,04); quem não vê o custo não lê; custo mudado na ficha esquece a média exata;
// - aniversário do pet sem o ano (1904) sai "20/11" na planilha do tutor (LGPD) e entra na promoção de aniversário.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('loja-textos-lgpd');
const D = lib('dinheiro'), C = lib('compra');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Camila2' });
  const { dono, estoque: est } = L.sb;
  const P = L.P;
  B.sql(`update petshops set opcoes = coalesce(opcoes, '{}'::jsonb) || '{"loja.margem": true}'::jsonb where id = '${P}'`);

  T.secao('entrada de produto com validade (Camila)');
  const bif = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Bifinho de carne 65 g', unidade: 'un', preco_venda: 9.9, custo: 4.8, controla_validade: true }).select('id').single(), 'produto').id;
  const entrar = (sb, mov) => sb.rpc('estoque_entrada', { p_petshop: P, p_chave: D.novaChaveDeOperacao(), p_movimento: { produto_id: bif, quantidade: 10, custo_unitario: 4.8, ...mov } });
  T.recusa('sem a validade (lote e validade vazios): recusada, com o motivo', await entrar(dono, {}), /validade/);
  T.recusa('só o lote, sem a validade: recusada', await entrar(dono, { lote: 'BIF1201' }), /validade/);
  T.ok('… e nada entrou no estoque', B.num(`select count(*) from movimentos_estoque where produto_id='${bif}'`) === 0 && Number(B.sql(`select estoque from produtos where id='${bif}'`)) === 0);
  const ok1 = await entrar(dono, { validade: L.dia(90) });
  T.passa('com a validade e sem lote: entra', ok1);
  T.ok('… e vira um lote com a validade (aparece no Vencendo)', B.num(`select count(*) from produtos_lotes where produto_id='${bif}' and lote is null and validade='${L.dia(90)}' and quantidade=10`) === 1);
  T.passa('com lote e validade: entra', await entrar(est, { lote: 'BIF0930', validade: L.dia(30) }));
  const shampoo = L.prod;
  T.passa('produto sem "Controlar validade": entra sem validade, como antes', await dono.rpc('estoque_entrada', { p_petshop: P, p_chave: D.novaChaveDeOperacao(), p_movimento: { produto_id: shampoo, quantidade: 2, custo_unitario: 12 } }));
  T.passa('a volta de venda desfeita (sem passar pela entrada) continua sem validade', await D.gravarMovimentos(dono, P, [{ petshop_id: P, produto_id: bif, tipo: 'entrada', quantidade: 1, motivo: 'Venda desfeita', chave: D.novaChaveDeOperacao() }]).then(() => ({ data: true, error: null }), (e) => ({ data: null, error: e })));

  T.secao('custo médio sem arredondar no valor em estoque (Camila)');
  const golden = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Ração Golden', unidade: 'un', preco_venda: 189.9 }).select('id').single(), 'golden').id;
  B.must(await dono.rpc('estoque_entrada', { p_petshop: P, p_chave: D.novaChaveDeOperacao(), p_movimento: { produto_id: golden, quantidade: 5, custo_unitario: 142 } }), 'entrada 1');
  B.must(await dono.rpc('estoque_entrada', { p_petshop: P, p_chave: D.novaChaveDeOperacao(), p_movimento: { produto_id: golden, quantidade: 4, custo_unitario: 150 } }), 'entrada 2');
  T.ok('o custo médio em centavos continua 145,56', Number(B.sql(`select custo from produtos where id='${golden}'`)) === 145.56);
  const ex = (await dono.rpc('produtos_custo_exato', { p: P })).data ?? [];
  const exGolden = Number(ex.find((x) => x.id === golden)?.custo);
  T.ok('o custo exato é 1.310 ÷ 9 (sem arredondar)', Math.abs(exGolden - 1310 / 9) < 1e-8, exGolden);
  T.ok('valor em estoque da Golden: R$ 1.310,00 (com o arredondado seria 1.310,04)', C.valorEmEstoque([{ estoque: 9, custo: 145.56, custo_exato: exGolden, tipo: 'produto' }]) === 1310);
  T.ok('quem tem Estoque sem a chave de custo não lê o custo exato', ((await est.rpc('produtos_custo_exato', { p: P })).data ?? []).length === 0);
  T.ok('a recepção (Caixa) também não', ((await L.sb.caixa.rpc('produtos_custo_exato', { p: P })).data ?? []).length === 0);
  T.ok('ninguém lê a coluna direto', !!(await dono.from('produtos').select('custo_exato').eq('id', golden)).error);
  B.must(await dono.from('produtos').update({ custo: 150 }).eq('id', golden).select('id'), 'custo na ficha');
  const ex2 = Number(((await dono.rpc('produtos_custo_exato', { p: P })).data ?? []).find((x) => x.id === golden)?.custo);
  T.ok('custo mudado na ficha: vale o custo digitado (a média exata é esquecida)', ex2 === 150, ex2);
  B.must(await dono.rpc('estoque_entrada', { p_petshop: P, p_chave: D.novaChaveDeOperacao(), p_movimento: { produto_id: golden, quantidade: 1, custo_unitario: 140 } }), 'entrada 3');
  T.ok('a média seguinte parte do custo digitado: (9 × 150 + 140) ÷ 10 = 149,00', Number(B.sql(`select custo from produtos where id='${golden}'`)) === 149);

  T.secao('aniversário do pet sem o ano (Neide)');
  B.sql(`update pets set nascimento = '1904-11-20', sexo = 'F' where id = '${L.pets.Mel ?? Object.values(L.pets)[0]}'`);
  const tutorDoPet = B.sql(`select cliente_id from pets where id = '${L.pets.Mel ?? Object.values(L.pets)[0]}'`);
  const dados = await dono.rpc('cliente_dados', { p_cliente: tutorDoPet });
  T.passa('a planilha do tutor sai', dados);
  const pets = (dados.data?.arquivos ?? []).find((a) => a.arquivo === 'pets.csv')?.linhas ?? [];
  T.ok('o aniversário sem o ano sai "20/11" (não "20/11/1904"), com "Fêmea"', pets.some((l) => l[5] === '20/11' && l[4] === 'Fêmea'), pets);
  T.ok('a promoção de aniversário vê o dia e o mês (niver_perto com 1904)', B.sql(`select public.niver_perto('1904-11-20'::date, '2026-11-18'::date, 7)::text`) === 'true');
}))();
