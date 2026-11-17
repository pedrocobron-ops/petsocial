// Sugestão de compra e etiquetas no banco (migração 20261194):
// - "vem em caixa de" (produtos.embalagem_qtd): todos da equipe leem (permissão por coluna), só quem cuida do estoque grava;
// - código interno (produtos_gerar_codigos): MP + 6 números, na ordem do nome, sem repetir no pet shop (também contra produto fora
//   da lista e com dois pedidos ao mesmo tempo), produto que já tem código fica igual, outro pet shop não muda, papéis recusados;
// - o Mozart (o_que_comprar) com os movimentos de verdade, pela mesma conta da tela: a explicação, as quantidades, a caixa,
//   valores em R$ só para quem vê o financeiro e recusado para quem não tem a área Estoque.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('compra');
const F = lib('assistente/ferramentas');
const R = lib('reservado');
const A = lib('acessos');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Compra' });
  const { dono, estoque, caixa, tosador } = L.sb;
  const P = L.P;
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'loja.codigo_barras': true, 'loja.fornecedores': true } }), 'opções da loja');

  T.secao('vem em caixa de');
  T.passa('quem cuida do estoque grava "vem em caixa de 12"', await estoque.from('produtos').update({ embalagem_qtd: 12 }).eq('id', L.prod).select('id, embalagem_qtd'), true);
  T.ok('… e o banco guardou 12', B.num(`select embalagem_qtd from produtos where id='${L.prod}'`) === 12);
  const lido = await tosador.from('produtos').select('id, embalagem_qtd').eq('id', L.prod);
  T.passa('o tosador lê a coluna (permissão por coluna liberada)', lido, lido.data?.[0]?.embalagem_qtd === 12);
  const t2 = await tosador.from('produtos').update({ embalagem_qtd: 6 }).eq('id', L.prod).select('id');
  T.ok('o tosador não grava (nada muda)', (t2.error || !(t2.data ?? []).length) && B.num(`select embalagem_qtd from produtos where id='${L.prod}'`) === 12);
  T.recusa('caixa de 0 é recusada', await dono.from('produtos').update({ embalagem_qtd: 0 }).eq('id', L.prod).select('id'));
  T.recusa('anônimo não lê', await B.cliente().from('produtos').select('embalagem_qtd').eq('id', L.prod).then((r) => (r.data && r.data.length ? r : { error: { message: 'vazio' } })));

  T.secao('código interno');
  const novo = async (nome, extra = {}) => B.must(await dono.from('produtos').insert({ petshop_id: P, nome, unidade: 'un', estoque: 1, ...extra }).select('id').single(), nome).id;
  const pB = await novo('Bolinha'), pA = await novo('Areia fina'), pC = await novo('Coleira'), comCodigo = await novo('Ração com código', { codigo_barras: '7891234567895' });
  // um produto fora da lista já usou o MP000004: o próximo não pode repetir
  const velho = await novo('Antigo', { codigo_barras: 'MP000004' });
  B.must(await dono.from('produtos').update({ ativo: false }).eq('id', velho).select('id'), 'tirar da lista');
  for (const [quem, sb] of [['o tosador', tosador], ['a recepção (caixa)', caixa], ['o anônimo', B.cliente()]]) {
    T.recusa(`${quem} não gera código interno`, await sb.rpc('produtos_gerar_codigos', { p_petshop: P, p_produtos: [pA] }));
  }
  T.ok('… e nada mudou', B.num(`select count(*) from produtos where petshop_id='${P}' and codigo_barras like 'MP%'`) === 1);
  const g = B.must(await estoque.rpc('produtos_gerar_codigos', { p_petshop: P, p_produtos: [pB, pA, pC, comCodigo] }), 'gerar');
  const cod = (id) => g.find((x) => x.id === id)?.codigo_barras;
  T.ok('quem cuida do estoque gera: na ordem do nome, depois do MP000004 (Areia MP000005, Bolinha MP000006, Coleira MP000007)', cod(pA) === 'MP000005' && cod(pB) === 'MP000006' && cod(pC) === 'MP000007', g);
  T.ok('o produto que já tinha código fica com o dele', cod(comCodigo) === '7891234567895');
  const g2 = B.must(await dono.rpc('produtos_gerar_codigos', { p_petshop: P, p_produtos: [pA, pB] }), 'de novo');
  T.ok('pedir de novo devolve os mesmos códigos (não gera outro)', g2.every((x) => x.codigo_barras === cod(x.id)) && B.num(`select count(*) from produtos where petshop_id='${P}' and codigo_barras like 'MP%'`) === 4);
  // dois toques ao mesmo tempo, com produtos diferentes: números diferentes
  const d1 = await novo('Dupla 1'), d2 = await novo('Dupla 2');
  const [x1, x2] = await Promise.all([dono.rpc('produtos_gerar_codigos', { p_petshop: P, p_produtos: [d1] }), estoque.rpc('produtos_gerar_codigos', { p_petshop: P, p_produtos: [d2] })]);
  T.ok('dois pedidos ao mesmo tempo: MP000008 e MP000009, sem repetir', !x1.error && !x2.error && [x1.data[0].codigo_barras, x2.data[0].codigo_barras].sort().join() === 'MP000008,MP000009', [x1.error?.message, x2.error?.message, x1.data, x2.data]);
  T.ok('nenhum código repetido no pet shop', B.num(`select count(*) - count(distinct codigo_barras) from produtos where petshop_id='${P}' and codigo_barras is not null`) === 0);
  const L2 = await criarLoja(null, { nome: 'Compra outra', equipe: false, dados: false });
  T.depois(() => L2.limpar());
  const deOutra = B.must(await L2.sb.dono.from('produtos').insert({ petshop_id: L2.P, nome: 'Da outra loja', unidade: 'un' }).select('id').single(), 'outra loja').id;
  const r3 = await dono.rpc('produtos_gerar_codigos', { p_petshop: P, p_produtos: [deOutra] });
  T.ok('produto de outro pet shop não ganha código', !r3.error && (r3.data ?? []).length === 0 && B.sql(`select coalesce(codigo_barras, '') from produtos where id='${deOutra}'`) === '');
  T.recusa('a dona de outra loja não gera código aqui', await L2.sb.dono.rpc('produtos_gerar_codigos', { p_petshop: P, p_produtos: [pA] }));

  T.secao('Mozart: o que preciso comprar?');
  const forn = B.must(await dono.from('fornecedores').insert({ petshop_id: P, nome: 'Distribuidora Bom Pet', telefone: '11977770000' }).select('id').single(), 'fornecedor').id;
  const racao = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Ração Golden 15 kg', unidade: 'un', estoque: 0, estoque_minimo: 3, custo: 100, fornecedor_id: forn }).select('id').single(), 'ração').id;
  // 21 vendidos nas últimas 6 semanas (7 de 3), uma perda de 2 e uma entrada; depois o saldo fica em 4
  const movs = [...[2, 7, 13, 19, 25, 31, 38].map((d) => ['saida', 3, 'Venda', d]), ['saida', 2, 'Perda ou vencido', 5], ['entrada', 30, 'Compra', 40]];
  for (const [tipo, quantidade, motivo, dias] of [...movs].sort((a, b) => b[3] - a[3])) {
    const id = B.must(await dono.from('movimentos_estoque').insert({ petshop_id: P, produto_id: racao, tipo, quantidade, motivo }).select('id').single(), motivo).id;
    B.sql(`update movimentos_estoque set criado_em = now() - interval '${dias} days' where id='${id}'`);
  }
  B.sql(`update produtos set estoque = 4, criado_em = now() - interval '100 days' where id='${racao}'`);
  // produtos de antes, sem saída: ficam como parados (cadastrados há 100 dias)
  B.sql(`update produtos set criado_em = now() - interval '100 days' where petshop_id='${P}' and id <> '${racao}'`);

  async function contexto(papel) {
    const sb = L.sb[papel];
    const u = (await sb.auth.getUser()).data.user;
    const [p, e, s] = await Promise.all([R.lerPetshop(sb, P), R.lerEquipe(sb, P), R.lerServicos(sb, P)]);
    const eu = (e.data || []).find((x) => x.user_id === u.id && x.ativo);
    return { sb, userId: u.id, petshop: p.data, eu, equipe: e.data || [], servicos: s.data || [],
      vejoFinanceiro: A.podeArea(eu, 'caixa') || A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'),
      cuidoDoFinanceiro: A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'), fusoMin: -180, agora: `${L.hoje}T10:00` };
  }
  T.ok('o_que_comprar está na lista do Mozart (também para quem não vê dinheiro)', F.ferramentasPara({ vejoFinanceiro: false }).some((t) => t.name === 'o_que_comprar'));
  const rd = await F.rodarConsulta(await contexto('dono'), 'o_que_comprar', {});
  const d = JSON.parse(rd.conteudo);
  const grupo = (d.para_comprar ?? []).find((x) => x.fornecedor === 'Distribuidora Bom Pet');
  const item = grupo?.itens.find((x) => x.produto === 'Ração Golden 15 kg');
  T.ok('dona: Ração no grupo da Distribuidora Bom Pet, 3,5 por semana, comprar 6, perda 2 à parte', !rd.erro && item && item.media_por_semana === 3.5 && item.comprar === 6 && item.perda_no_periodo === 2 && item.saldo === 4, rd.conteudo.slice(0, 600));
  T.ok('… com a explicação da conta ("Vendeu em média 3,5 por semana nas últimas 6 semanas … Comprar 6 unidades.")', item && /^Vendeu em média 3,5 por semana nas últimas 6 semanas \(21 no total\)\. Para 2 semanas: 7 \+ mínimo 3 = 10\. Tem 4: faltam 6\. Comprar 6 unidades\./.test(item.explicacao), item?.explicacao);
  T.ok('… e o valor em estoque em R$ (custo × quantidade: Ração 400 + Shampoo 20 × 12 = 640)', d.valor_em_estoque === 640, d.valor_em_estoque);
  T.ok('… os parados há 60+ dias (o Shampoo, que nada saiu)', (d.parados_60_dias ?? []).some((x) => x.produto === 'Shampoo Neutro'), d.parados_60_dias);
  const r4 = JSON.parse((await F.rodarConsulta(await contexto('dono'), 'o_que_comprar', { semanas: 4 })).conteudo).para_comprar[0].itens[0];
  T.ok('para 4 semanas: 14 + 3 − 4 = 13', r4.comprar === 13, r4);
  B.sql(`update produtos set embalagem_qtd = 12 where id='${racao}'`);
  const r5 = JSON.parse((await F.rodarConsulta(await contexto('dono'), 'o_que_comprar', {})).conteudo).para_comprar[0].itens[0];
  T.ok('vem em caixa de 12: falta 6 vira 1 caixa = 12', r5.comprar === 12 && r5.caixas === 1 && /Vem em caixa de 12: 1 caixa = 12/.test(r5.explicacao), r5);
  const re = await F.rodarConsulta(await contexto('estoque'), 'o_que_comprar', {});
  const e = JSON.parse(re.conteudo);
  T.ok('quem cuida do estoque (sem dinheiro): a mesma sugestão, sem nenhum valor em R$', !re.erro && e.para_comprar[0].itens[0].comprar === 12 && !('valor_em_estoque' in e) && !/R\$|valor_/.test(re.conteudo), re.conteudo.slice(0, 300));
  const rt = await F.rodarConsulta(await contexto('tosador'), 'o_que_comprar', {});
  T.ok('o tosador (sem a área Estoque) ouve que é com quem cuida do estoque', rt.erro && /área Estoque/.test(rt.conteudo), rt.conteudo);
}))();
