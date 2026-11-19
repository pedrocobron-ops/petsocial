// Mozart cadastra e muda (assistente/ferramenta-cadastros.ts), sem banco:
//  - quem pode: serviços, horário e diárias só o dono (nem o gerente, que abre todas as áreas); produto só com a área Estoque;
//    pacote só com Pacotes; tutor com Clientes, Agenda ou Creche e hotel. A recusa diz que é com o dono.
//  - conferências do pedido: preço único ou por porte (não os dois), valores fora do limite, aniversário que não existe, horário
//    que fecha antes de abrir, almoço fora do horário; o texto dos preços no cartão.
//  - vários cartões juntos (Confirmar tudo): gravam em ordem e o primeiro que falha para os seguintes (PAROU_ANTES), sem tocar no banco.
//  - movimentar_estoque aceita o preço de venda do produto novo.
const assert = require('node:assert/strict');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('unidade-mozart-cadastros');

const F = lib('assistente/ferramentas');
const K = lib('assistente/ferramenta-cadastros');
const C = lib('assistente/conversa');
const PM = lib('assistente/permissao');
const I = lib('assistente/instrucoes');
const A = lib('acessos');

const erro = (m) => new Error(m);
const t = (nome, f) => { try { f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const ta = async (nome, f) => { try { await f(); T.ok(nome, true); } catch (e) { T.ok(nome, false, e.message); } };
const lanca = (f, re) => assert.throws(f, (e) => re.test(e.message));
const nbsp = (s) => s.replace(/ /g, ' ');

(async () => T.rodar(async () => {
  T.secao('Quem pode usar cada ferramenta nova');
  const nomes = (c) => F.ferramentasPara(c).map((f) => f.name);
  const dono = { vejoFinanceiro: true, areas: A.areasDe({ papel: 'dono' }), dono: true };
  const gerente = { vejoFinanceiro: true, areas: A.areasDe({ papel: 'gerente' }), dono: false };
  const edu = { vejoFinanceiro: false, areas: ['estoque'], dono: false };
  const tito = { vejoFinanceiro: false, areas: ['agenda', 'clientes'], dono: false };
  const SO_DONO = ['criar_servico', 'alterar_servico', 'alterar_funcionamento', 'alterar_diarias'];
  t('são 9 ferramentas novas, todas com cartão', () => {
    const novas = ['criar_servico', 'alterar_servico', 'criar_produto', 'alterar_produto', 'alterar_tutor', 'criar_pacote', 'alterar_pacote', 'alterar_funcionamento', 'alterar_diarias'];
    for (const n of novas) assert.equal(F.definicao(n)?.grava, true, n);
  });
  t('o dono recebe todas', () => { const n = nomes(dono); for (const x of [...SO_DONO, 'criar_produto', 'alterar_tutor', 'criar_pacote']) assert.ok(n.includes(x), x); });
  t('o gerente (todas as áreas) não muda serviços, horário nem diárias', () => { const n = nomes(gerente); for (const x of SO_DONO) assert.ok(!n.includes(x), x); assert.ok(n.includes('criar_produto') && n.includes('alterar_pacote')); });
  t('quem só tem o Estoque cria e muda produto, mas não pacote, tutor nem serviço', () => {
    const n = nomes(edu);
    assert.ok(n.includes('criar_produto') && n.includes('alterar_produto'));
    for (const x of ['criar_pacote', 'alterar_tutor', ...SO_DONO]) assert.ok(!n.includes(x), x);
  });
  t('o tosador (Agenda e Clientes) muda o tutor, mas não produto nem pacote', () => {
    const n = nomes(tito);
    assert.ok(n.includes('alterar_tutor'));
    for (const x of ['criar_produto', 'alterar_produto', 'criar_pacote', 'alterar_pacote']) assert.ok(!n.includes(x), x);
  });
  t('sem a marca de dono, ferramenta do dono nunca é liberada', () => assert.equal(PM.ferramentaLiberada(F.definicao('alterar_servico'), { vejoFinanceiro: true, areas: A.areasDe({ papel: 'dono' }) }), false));
  t('a recusa diz que é com o dono e que nada foi gravado', () => assert.match(PM.motivoDaRecusa(F.definicao('alterar_servico'), gerente), /só o dono.*Nada foi gravado/));
  t('o modelo não vê a regra soDono', () => assert.ok(F.ferramentasPara(dono).every((f) => !('soDono' in f))));

  T.secao('Conferências do pedido');
  t('preço único vale para os quatro portes', () => assert.deepEqual(K.precosDoPedido({ preco: 30 }, erro), { preco_p: 30, preco_m: 30, preco_g: 30, preco_gg: 30 }));
  t('por porte: só os portes ditos', () => assert.deepEqual(K.precosDoPedido({ preco_p: 100, preco_m: 100 }, erro), { preco_p: 100, preco_m: 100 }));
  t('preço único junto com porte é recusado', () => lanca(() => K.precosDoPedido({ preco: 30, preco_g: 40 }, erro), /um preço só/));
  t('preço negativo ou acima de R$ 99.999 é recusado', () => { lanca(() => K.precosDoPedido({ preco: -1 }, erro), /entre R\$ 0/); lanca(() => K.precosDoPedido({ preco_p: 100000 }, erro), /entre R\$ 0/); });
  t('preço com centavos arredonda ao centavo', () => assert.equal(K.precosDoPedido({ preco: 19.999 }, erro).preco_p, 20));
  t('o cartão: "R$ 30,00 (todos os portes)"', () => assert.equal(nbsp(K.precosEmTexto({ preco_p: 30, preco_m: 30, preco_g: 30, preco_gg: 30 })), 'R$ 30,00 (todos os portes)'));
  t('o cartão: "P R$ 100,00 · M R$ 100,00 · G R$ 130,00 · GG R$ 130,00"', () => assert.equal(nbsp(K.precosEmTexto({ preco_p: 100, preco_m: 100, preco_g: 130, preco_gg: 130 })), 'P R$ 100,00 · M R$ 100,00 · G R$ 130,00 · GG R$ 130,00'));
  t('aniversário: 14/03 sem ano, 14/03/1980 com ano, "" tira, 31/04 não existe', () => {
    assert.equal(K.aniversarioDoPedido('14/03', erro), '1904-03-14');
    assert.equal(K.aniversarioDoPedido('14/03/1980', erro), '1980-03-14');
    assert.equal(K.aniversarioDoPedido('', erro), null);
    assert.equal(K.aniversarioDoPedido(undefined, erro), undefined);
    lanca(() => K.aniversarioDoPedido('31/04', erro), /não existe/);
    lanca(() => K.aniversarioDoPedido('março', erro), /DD\/MM/);
  });
  const semana = { 1: { abre: '08:00', fecha: '18:00' }, 2: { abre: '08:00', fecha: '18:00' }, 3: { abre: '08:00', fecha: '18:00' }, 4: { abre: '08:00', fecha: '18:00' }, 5: { abre: '08:00', fecha: '18:00' }, 6: { abre: '08:00', fecha: '13:00' }, 0: null };
  t('horário: sábado até as 14h e domingo fechado continua; só o sábado muda', () => {
    const r = K.horarioDoPedido(semana, { dias: [{ dia: 'sabado', fecha: '14:00' }] }, erro);
    assert.deepEqual(r.novo['6'], { abre: '08:00', fecha: '14:00' });
    assert.deepEqual(r.mudou, [['sábado', '8h às 13h → 8h às 14h']]);
  });
  t('horário: abrir o domingo pede abre e fecha', () => lanca(() => K.horarioDoPedido(semana, { dias: [{ dia: 'domingo', abre: '09:00' }] }, erro), /hora de abrir e de fechar/));
  t('horário: fechar antes de abrir é recusado (a mesma frase da tela)', () => lanca(() => K.horarioDoPedido(semana, { dias: [{ dia: 'segunda', abre: '18:00', fecha: '08:00' }] }, erro), /fechar precisa ser depois/));
  t('horário: almoço das 12h às 13h entra nos dias abertos', () => {
    const r = K.horarioDoPedido(semana, { almoco_de: '12:00', almoco_ate: '13:00' }, erro);
    assert.deepEqual(r.novo['1'].almoco, { de: '12:00', ate: '13:00' });
    assert.ok(r.mudou.some(([k]) => k === 'Almoço'));
  });
  t('horário: hora fora do formato é recusada', () => lanca(() => K.horarioDoPedido(semana, { dias: [{ dia: 'segunda', abre: '8h' }] }, erro), /HH:mm/));

  T.secao('Vários cartões juntos: em ordem, e o primeiro que falha para os seguintes');
  const nada = () => { throw new Error('não devia tocar no banco'); };
  const loja = { id: 'p', nome: 'Loja', horario: null, modulos: ['banho_tosa'], opcoes: {} };
  const cGerente = { sb: { from: nada, rpc: nada }, userId: 'u', petshop: loja, eu: { nome: 'Gil', papel: 'gerente', ativo: true }, equipe: [], servicos: [], ...gerente, cuidoDoFinanceiro: true, fusoMin: -180, agora: '2026-11-19T09:00' };
  const pend = [
    { type: 'tool_use', id: 'toolu_a1', name: 'alterar_servico', input: { servico_id: '11111111-1111-4111-8111-111111111111', preco: 30 } },
    { type: 'tool_use', id: 'toolu_a2', name: 'criar_produto', input: { nome: 'Mordedor' } },
    { type: 'tool_use', id: 'toolu_a3', name: 'criar_produto', input: { nome: 'Bolinha' } },
  ];
  await ta('cartões forjados pelo gerente: o do dono é recusado e os seguintes nem gravam (sem tocar no banco)', async () => {
    const r = await C.responderCartoes({ c: cGerente, pendentes: pend, liberado: true, decisoes: [{ id: 'toolu_a1', ok: true }, { id: 'toolu_a2', ok: true }, { id: 'toolu_a3', ok: false }], reservar: async () => { throw new Error('não devia reservar'); } });
    assert.equal(r.resultados.length, 3);
    assert.ok(r.resultados[0].is_error && /só o dono/.test(r.resultados[0].content));
    assert.ok(r.resultados[1].is_error && r.resultados[1].content === C.PAROU_ANTES);
    assert.match(r.resultados[2].content, /descartou/);
    assert.equal(r.mudou, false);
  });
  await ta('a volta do modelo com quatro serviços para o dono vira quatro cartões numa resposta só', async () => {
    const servicos = ['Banho', 'Corte de unhas', 'Hidratação'].map((nome, i) => ({ id: `1111111${i}-1111-4111-8111-111111111111`, nome, ativo: true }));
    const cDono = { ...cGerente, ...dono, eu: { nome: 'Dona', papel: 'dono', ativo: true }, servicos };
    // o cartão de cada um é montado por `descrever` (lê o banco); aqui o banco é de mentira e só confere que os quatro param juntos
    const usados = [];
    const sb = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ order: () => ({ order: async () => ({ data: servicos.map((s) => ({ ...s, categoria: 'outro', duracao_min: 30, cor: '#f97316', ordem: 1 })), error: null }) }) }) }) }) }),
      rpc: (f) => { usados.push(f); return { order: () => ({ range: async () => ({ data: servicos.map((s) => ({ id: s.id, preco_p: 50, preco_m: 60, preco_g: 70, preco_gg: 80 })), error: null }) }) }; } };
    let chamadas = 0;
    const s = await C.voltas({ c: { ...cDono, sb }, mensagens: [{ role: 'user', content: 'tabela de preços' }], liberado: true, contar: async () => true,
      chamar: async (msgs) => (++chamadas > 1 ? { content: [{ type: 'text', text: JSON.stringify(msgs[msgs.length - 1].content) }], stop_reason: 'end_turn' } : { content: [
        { type: 'tool_use', id: 'toolu_b1', name: 'alterar_servico', input: { servico_id: servicos[0].id, preco_p: 100, preco_m: 100, preco_g: 130, preco_gg: 130 } },
        { type: 'tool_use', id: 'toolu_b2', name: 'alterar_servico', input: { servico_id: servicos[1].id, preco: 30 } },
        { type: 'tool_use', id: 'toolu_b3', name: 'criar_servico', input: { nome: 'Escovação', duracao_min: 15, preco: 20 } },
        { type: 'tool_use', id: 'toolu_b4', name: 'alterar_servico', input: { servico_id: servicos[2].id, preco_p: 60, preco_m: 60, preco_g: 80, preco_gg: 80 } },
      ], stop_reason: 'tool_use' }) });
    assert.equal(s.propostas.length, 4, s.texto);
    assert.deepEqual(s.propostas.map((p) => p.ferramenta), ['alterar_servico', 'alterar_servico', 'criar_servico', 'alterar_servico']);
    const banho = s.propostas[0].resumo.linhas.map(([k, v]) => `${k}: ${nbsp(v)}`);
    assert.ok(banho.includes('Preço fica: P R$ 100,00 · M R$ 100,00 · G R$ 130,00 · GG R$ 130,00'), banho.join(' | '));
    assert.ok(banho.includes('Preço antes: P R$ 50,00 · M R$ 60,00 · G R$ 70,00 · GG R$ 80,00'), banho.join(' | '));
    assert.equal(s.propostas[2].resumo.titulo, 'Cadastrar serviço');
  });

  T.secao('Estoque: produto novo com preço de venda');
  t('movimentar_estoque aceita preco_venda (para o produto novo)', () => assert.ok('preco_venda' in F.definicao('movimentar_estoque').input_schema.properties));
  t('as instruções mandam não deixar o preço de venda de fora', () => assert.match(I.INSTRUCOES, /nunca deixe o preço de venda de fora/));

  T.secao('Instruções');
  t('não dizem mais que o Mozart não muda preços de serviços', () => assert.doesNotMatch(I.INSTRUCOES, /não muda preços de serviços/));
  t('pedem as ações independentes na mesma resposta (Confirmar tudo)', () => assert.match(I.INSTRUCOES, /Confirmar tudo/));
  t('o dono vê os serviços desativados no contexto', () => {
    const c = { petshop: { nome: 'Loja', horario: null, modulos: ['banho_tosa'], opcoes: {} }, servicos: [{ id: 's1', nome: 'Tosa velha', ativo: false, duracao_min: 30 }], equipe: [], eu: { nome: 'Dona', papel: 'dono' }, vejoFinanceiro: true, cuidoDoFinanceiro: true, areas: dono.areas, dono: true, agora: '2026-11-19T09:00' };
    assert.match(I.contextoDoPetshop(c), /Serviços desativados[^\n]*\n- Tosa velha \| id s1/);
    assert.doesNotMatch(I.contextoDoPetshop({ ...c, dono: false }), /Serviços desativados/);
  });
}))();
