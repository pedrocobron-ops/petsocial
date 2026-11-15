// Segurança pela API (o que o navegador de cada pessoa consegue fazer direto no Supabase, sem passar pelas telas):
// isolamento entre pet shops, anônimo, assinatura e painel interno, o que cada papel da equipe grava,
// caixa fechado e a matriz de quem lê cada coluna com dinheiro.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const T = require('../lib/teste')('seguranca');

// "SIM" = veio valor; "-" = recusado (42501); "0" = nenhuma linha; "vazio" = linha sem o valor
const PAPEIS = ['dono', 'caixa', 'monitor', 'tosador', 'estoque', 'anon'];
const FECHADA = ['-', '-', '-', '-', '-', '-'];
const COLUNAS = {
  'agendamentos.preco': FECHADA, 'agendamento_servicos.preco': FECHADA,
  'servicos.preco_p': FECHADA, 'servicos.preco_gg': FECHADA,
  'produtos.preco_venda': FECHADA, 'produtos.custo': FECHADA, 'produtos.ultimo_custo': FECHADA, 'movimentos_estoque.custo_unitario': FECHADA,
  'petshops.diaria_creche': FECHADA, 'petshops.diaria_hotel': FECHADA, 'petshops.meta_mes': FECHADA, 'petshops.opcoes': FECHADA,
  'estadias.valor_diaria': FECHADA, 'estadias.valor_cobrado': FECHADA,
  'pacotes.preco': FECHADA, 'pacotes_clientes.preco': FECHADA, 'profissionais.comissao_pct': FECHADA,
  'lancamentos.valor': ['SIM', 'SIM', '0', '0', '0', '0'],
  'creche_planos_valores.valor_mensal': ['SIM', '0', '0', '0', '0', '-'],
  'hotel_precos.feriado': ['SIM', 'SIM', '0', '0', '0', '-'],
  'estadias_valores.sinal': ['SIM', 'SIM', '0', '0', '0', '-'],
  // cobranças da creche e valores dos planos: só quem cuida do financeiro (a recepção com caixa não lê)
  'creche_cobrancas.total': ['SIM', '0', '0', '0', '0', '-'],
};

(async () => T.rodar(async () => {
  const A = await criarLoja(T, { nome: 'Seg A' });
  const Bl = await criarLoja(T, { nome: 'Seg B', equipe: false });
  const a = A.sb.dono, b = Bl.sb.dono, anon = B.cliente();
  const n = async (p) => { const r = await p; return r.error ? 'erro' : (r.data?.length ?? 0); };

  // dados com dinheiro em A (pelo caminho das telas)
  const ini = B.instante(A.dia(2), '10:00', A.fuso);
  const ag = B.must(await a.from('agendamentos').insert({ petshop_id: A.P, pet_id: A.pets.Thor, servico_id: A.S.Banho, profissional_id: A.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 60 * 6e4).toISOString(), preco: 60 }).select('id').single(), 'horário').id;
  B.must(await a.rpc('agendamento_servicos_definir', { p_agendamento: ag, p_servicos: [{ servico_id: A.S['Hidratação'], preco: 30 }] }), 'serviço a mais');
  B.must(await a.from('lancamentos').insert({ petshop_id: A.P, tipo: 'entrada', valor: 90, forma: 'pix', categoria: 'Serviços', data: A.hoje, pago: true, cliente_id: A.tutores.Ana }).select('id'), 'entrada');
  const pac = B.must(await a.from('pacotes').insert({ petshop_id: A.P, nome: 'Banho 4x', servico_id: A.S.Banho, quantidade: 4, validade_dias: 60, preco: 200 }).select('id').single(), 'pacote').id;
  B.must(await a.from('pacotes_clientes').insert({ petshop_id: A.P, pet_id: A.pets.Thor, pacote_id: pac, nome: 'Banho 4x', servico_id: A.S.Banho, total: 4, usados: 0, preco: 200 }).select('id'), 'pacote vendido');
  const est = B.must(await a.from('estadias').insert({ petshop_id: A.P, pet_id: A.pets.Mel, tipo: 'hotel', status: 'reservada', entrada: B.instante(A.dia(5), '12:00', A.fuso).toISOString(), saida_prevista: B.instante(A.dia(7), '12:00', A.fuso).toISOString(), valor_diaria: 120 }).select('id').single(), 'estadia').id;
  B.must(await a.from('estadias_valores').upsert({ estadia_id: est, petshop_id: A.P, sinal: 50, sinal_estado: 'a_receber' }, { onConflict: 'estadia_id' }).select('estadia_id'), 'sinal');
  B.must(await a.from('hotel_precos').upsert({ petshop_id: A.P, feriado: { ativo: true, modo: 'pct', valor: 20 }, atraso: { ativo: false } }, { onConflict: 'petshop_id' }).select('petshop_id'), 'preço de feriado');
  B.must(await a.from('movimentos_estoque').insert({ petshop_id: A.P, produto_id: A.prod, tipo: 'entrada', quantidade: 5, custo_unitario: 12 }).select('id'), 'entrada de estoque');
  const plano = B.must(await a.from('creche_planos').insert({ petshop_id: A.P, pet_id: A.pets.Luna, dias: [1, 3, 5], vence_dia: 10, inicio: A.mes1 }).select('id').single(), 'plano').id;
  B.must(await a.from('creche_planos_valores').upsert({ plano_id: plano, petshop_id: A.P, valor_mensal: 600, valor_extra: 70 }, { onConflict: 'plano_id' }).select('plano_id'), 'valor do plano');
  B.must(await a.rpc('creche_cobranca_criar', { p_plano: plano, p_mes: A.mes1 }), 'cobrança da creche');

  T.secao('isolamento entre pet shops e anônimo');
  for (const t of ['petshops', 'clientes', 'pets', 'agendamentos', 'lancamentos', 'produtos', 'profissionais', 'servicos', 'estadias', 'creche_planos', 'pacotes_clientes']) {
    const col = t === 'petshops' ? 'id' : 'petshop_id';
    const q = await b.from(t).select('id').eq(col, A.P);
    T.ok(`outro pet shop não lê ${t}`, !q.error && q.data.length === 0, q.error?.message ?? q.data.length);
    const qa = await anon.from(t).select('id').limit(5);
    T.ok(`anônimo não lê ${t}`, (qa.data ?? []).length === 0, qa.data?.length);
  }
  T.recusa('outro pet shop não grava cliente em A', await b.from('clientes').insert({ petshop_id: A.P, nome: 'invasor' }).select('id'));
  T.recusa('outro pet shop não liga pet a cliente de A', await b.from('pets').insert({ petshop_id: Bl.P, cliente_id: A.tutores.Ana, nome: 'x' }).select('id'));
  T.recusa('outro pet shop não marca horário com pet de A', await b.from('agendamentos').insert({ petshop_id: Bl.P, pet_id: A.pets.Thor, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString() }).select('id'));
  T.ok('outro pet shop não altera pet de A', (await n(b.from('pets').update({ nome: 'hack' }).eq('id', A.pets.Thor).select('id'))) !== 1);
  T.ok('outro pet shop não apaga cliente de A', (await n(b.from('clientes').delete().eq('id', A.tutores.Ana).select('id'))) !== 1);
  T.ok('equipe de A não lê nada de B', (await n(A.sb.caixa.from('clientes').select('id').eq('petshop_id', Bl.P))) === 0);

  T.secao('assinatura e painel interno');
  T.recusa('dono não muda o próprio status', await a.from('petshops').update({ status: 'ativa' }).eq('id', A.P).select('id'));
  T.recusa('dono não estica o próprio teste', await a.from('petshops').update({ teste_ate: '2030-01-01' }).eq('id', A.P).select('id'));
  T.recusa('dono não marca a assinatura como paga', await a.from('petshops').update({ pago_ate: '2030-01-01' }).eq('id', A.P).select('id'));
  T.passa('dono edita o nome do pet shop', await a.from('petshops').update({ nome: `Seg A ${A.suf} editado` }).eq('id', A.P).select('id'));
  const uidB = (await b.auth.getUser()).data.user.id;
  T.recusa('dono não troca o login de um membro da equipe', await a.from('profissionais').update({ user_id: uidB }).eq('id', A.ids.caixa).select('id'));
  T.recusa('não-admin não abre o painel interno', await b.rpc('admin_painel'));
  T.recusa('não-admin não se libera', await b.rpc('admin_atualizar', { p_petshop: Bl.P, p_status: 'ativa' }));
  T.recusa('ninguém se torna admin sozinho', await b.from('admins').insert({ user_id: uidB }).select());
  T.ok('config interna invisível', ((await a.from('config_interna').select('*')).data ?? []).length === 0);

  T.secao('equipe: o que cada papel grava');
  const tos = A.sb.tosador, cx = A.sb.caixa, mon = A.sb.monitor, estq = A.sb.estoque;
  T.ok('funcionário sem financeiro não lê lançamentos', (await n(tos.from('lancamentos').select('id').eq('petshop_id', A.P))) === 0);
  T.recusa('funcionário sem financeiro não lança dinheiro', await tos.from('lancamentos').insert({ petshop_id: A.P, tipo: 'entrada', valor: 10, forma: 'pix', categoria: 'Outros', data: A.hoje, pago: true }).select('id'));
  T.ok('funcionário não se promove', (await n(tos.from('profissionais').update({ papel: 'dono', ve_financeiro: true, acessos: ['caixa', 'financeiro'] }).eq('id', A.ids.tosador).select('id'))) !== 1);
  T.ok('funcionário não muda a comissão de ninguém', (await n(tos.from('profissionais').update({ comissao_pct: 90 }).eq('id', A.ids.tosador).select('id'))) !== 1);
  T.ok('tosador lê a agenda', (await n(tos.from('agendamentos').select('id').eq('petshop_id', A.P))) >= 1);
  T.ok('tosador lê o produto sem preço nem custo (para vender)', (await n(tos.from('produtos').select('id, nome').eq('petshop_id', A.P))) === 1);
  T.ok('tosador não altera produto', (await n(tos.from('produtos').update({ nome: 'X' }).eq('id', A.prod).select('id'))) !== 1);
  T.recusa('tosador não cria produto', await tos.from('produtos').insert({ petshop_id: A.P, nome: 'X' }).select('id'));
  T.ok('tosador não apaga produto', (await n(tos.from('produtos').delete().eq('id', A.prod).select('id'))) !== 1);
  T.ok('tosador não altera modelo de pacote', (await n(tos.from('pacotes').update({ nome: 'x' }).eq('id', pac).select('id'))) !== 1);
  T.recusa('tosador não cria pacote grátis', await tos.from('pacotes_clientes').insert({ petshop_id: A.P, pet_id: A.pets.Thor, nome: 'grátis', total: 10 }).select('id'));
  T.recusa('tosador não cria estadia', await tos.from('estadias').insert({ petshop_id: A.P, pet_id: A.pets.Thor, tipo: 'creche', status: 'em_casa', entrada: new Date().toISOString() }).select('id'));
  T.ok('tosador não altera preço de serviço', (await n(tos.from('servicos').update({ preco_p: 1 }).eq('id', A.S.Banho).select('id'))) !== 1);
  const ini2 = B.instante(A.dia(3), '09:00', A.fuso);
  T.ok('tosador marca horário', (await n(tos.from('agendamentos').insert({ petshop_id: A.P, pet_id: A.pets.Mel, servico_id: A.S.Banho, inicio: ini2.toISOString(), fim: new Date(+ini2 + 36e5).toISOString() }).select('id'))) === 1);
  T.ok('tosador remarca horário futuro', (await n(tos.from('agendamentos').update({ obs: 'ok' }).eq('id', ag).select('id'))) === 1);
  T.ok('monitor(a) faz check-in (estadia na creche)', (await n(mon.from('estadias').insert({ petshop_id: A.P, pet_id: A.pets.Rex, tipo: 'creche', status: 'em_casa', entrada: new Date().toISOString() }).select('id'))) === 1);
  T.ok('estoque dá entrada de mercadoria', (await n(estq.from('movimentos_estoque').insert({ petshop_id: A.P, produto_id: A.prod, tipo: 'entrada', quantidade: 2 }).select('id'))) === 1);
  T.recusa('estoque não lança dinheiro', await estq.from('lancamentos').insert({ petshop_id: A.P, tipo: 'saida', valor: 10, forma: 'pix', categoria: 'Fornecedor', data: A.hoje, pago: true }).select('id'));
  T.recusa('caixa não lança em outro dia (só quem cuida do financeiro)', await cx.from('lancamentos').insert({ petshop_id: A.P, tipo: 'entrada', valor: 10, forma: 'pix', categoria: 'Outros', data: A.dia(-3), pago: true }).select('id'));
  T.passa('caixa lança uma entrada de hoje', await cx.from('lancamentos').insert({ petshop_id: A.P, tipo: 'entrada', valor: 10, forma: 'pix', categoria: 'Outros', data: A.hoje, pago: true }).select('id'));
  T.recusa('funcionário não liga a opção de outro pet shop', await cx.rpc('petshop_salvar_opcoes', { p: Bl.P, p_mudancas: { 'link.ia': true } }));
  T.recusa('funcionário não muda as opções do negócio', await cx.rpc('petshop_salvar_opcoes', { p: A.P, p_mudancas: { 'dinheiro.preco_travado': false } }));

  T.secao('caixa fechado');
  const caixa = B.must(await a.from('caixas').insert({ petshop_id: A.P, valor_inicial: 0 }).select('id').single(), 'abrir caixa').id;
  const l1 = B.must(await a.from('lancamentos').insert({ petshop_id: A.P, tipo: 'entrada', valor: 40, forma: 'dinheiro', categoria: 'Banho e tosa', caixa_id: caixa, data: A.hoje, pago: true, cliente_id: A.tutores.Beto }).select('id').single(), 'lançamento no caixa').id;
  B.must(await a.from('caixas').update({ fechado_em: new Date().toISOString(), valor_contado: 40 }).eq('id', caixa).select('id'), 'fechar caixa');
  T.ok('caixa fechado não reabre', (await n(a.from('caixas').update({ fechado_em: null }).eq('id', caixa).select('id'))) !== 1);
  T.ok('caixa fechado não muda o contado', (await n(a.from('caixas').update({ valor_contado: 999 }).eq('id', caixa).select('id'))) !== 1);
  T.ok('caixa fechado não é apagado', (await n(a.from('caixas').delete().eq('id', caixa).select('id'))) !== 1);
  T.recusa('não lança dentro de caixa fechado', await a.from('lancamentos').insert({ petshop_id: A.P, tipo: 'entrada', valor: 5, forma: 'pix', categoria: 'Outros', caixa_id: caixa, data: A.hoje, pago: true }).select('id'));
  T.ok('lançamento de caixa fechado: valor travado', (await n(a.from('lancamentos').update({ valor: 45 }).eq('id', l1).select('id'))) !== 1);
  T.ok('lançamento de caixa fechado: categoria travada', (await n(a.from('lancamentos').update({ categoria: 'Outros' }).eq('id', l1).select('id'))) !== 1);
  T.ok('lançamento de caixa fechado: descrição ainda muda', (await n(a.from('lancamentos').update({ descricao: 'corrigido' }).eq('id', l1).select('id'))) === 1);
  T.ok('dono apaga cliente com histórico em caixa fechado (o banco desliga)', (await n(a.from('clientes').delete().eq('id', A.tutores.Beto).select('id'))) === 1);

  T.secao('quem lê cada coluna com dinheiro (REST direto)');
  const cli = { ...A.sb, anon };
  for (const [alvo, esperado] of Object.entries(COLUNAS)) {
    const [t, c] = alvo.split('.');
    const visto = [];
    for (const p of PAPEIS) {
      const r = await cli[p].from(t).select(c).eq(t === 'petshops' ? 'id' : 'petshop_id', A.P).limit(20);
      visto.push(r.error ? '-' : !r.data.length ? '0' : r.data.some((x) => x[c] != null) ? 'SIM' : 'vazio');
    }
    T.ok(`${alvo}: ${PAPEIS.map((p, i) => `${p}=${esperado[i]}`).join(' ')}`, visto.join() === esperado.join(), visto.join(' '));
  }
  T.secao('valores pelas funções (só quem recebe)');
  const fun = [
    ['servicos_precos', (c) => c.rpc('servicos_precos', { p: A.P }), (d) => d.some((x) => x.preco_m != null), ['SIM', 'SIM', 'vazio', 'vazio', 'vazio', '-']],
    ['agendamentos_precos', (c) => c.rpc('agendamentos_precos', { p: A.P, p_ids: [ag] }), (d) => d.some((x) => x.preco != null), ['SIM', 'SIM', '0', '0', '0', '-']],
    ['produtos_precos', (c) => c.rpc('produtos_precos', { p: A.P }), (d) => d.some((x) => x.preco_venda != null), ['SIM', 'SIM', '0', '0', 'SIM', '-']],
    ['petshop_diarias', (c) => c.rpc('petshop_diarias', { p: A.P }), (d) => d.some((x) => x.diaria_hotel != null), ['SIM', 'SIM', '0', '0', '0', '-']],
    ['minha_comissao', (c) => c.rpc('minha_comissao', { p_petshop: A.P }), (d) => d != null, ['SIM', 'SIM', 'SIM', 'SIM', 'SIM', '-']],
  ];
  for (const [nome, f, tem, esperado] of fun) {
    const visto = [];
    for (const p of PAPEIS) {
      const r = await f(cli[p]);
      if (r.error) visto.push('-');
      else { const d = Array.isArray(r.data) ? r.data : r.data; visto.push(Array.isArray(d) && !d.length ? '0' : tem(Array.isArray(d) ? d : [d]) ? 'SIM' : 'vazio'); }
    }
    T.ok(`${nome}: ${PAPEIS.map((p, i) => `${p}=${esperado[i]}`).join(' ')}`, visto.join() === esperado.join(), visto.join(' '));
  }
  const op = (await mon.rpc('petshop_opcoes', { p: A.P })).data ?? {};
  T.ok('opções do negócio para a equipe sem dinheiro: sem os valores', !JSON.stringify(op).match(/experiencia_preco|"valor":\s*\d/), op);
  T.ok('anônimo não executa preco_de_tabela', !!(await anon.rpc('preco_de_tabela', { p_petshop: A.P, p_servico: A.S.Banho, p_pet: A.pets.Thor })).error);
}))();
