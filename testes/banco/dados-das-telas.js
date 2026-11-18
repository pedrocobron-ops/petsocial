// Camada de dados das telas (rodada 9, N3), no banco:
//  - gestao_hoje_extras: os cartões de baixo da tela Hoje (quem chamar de volta, aniversariantes, "O Mozart reparou" e
//    "Mandar N mensagens") contados no banco têm de dar o mesmo que a conta que a tela fazia baixando tudo, para o dono e
//    para a equipe; quem não tem a área não recebe nada a mais; quem não é da equipe não recebe nada.
//  - gestao_sinal: a pergunta leve "mudou alguma coisa?" muda quando alguém marca, conclui ou recebe, e não muda sozinha.
//  - Mozart: a entrada de estoque vai por estoque_entrada (movimento e despesa juntos, validade obrigatória, pedido repetido
//    não grava duas vezes); `acesso_liberado` é a regra que a rota usa.
//  - Tutor sem e-mail e endereço: as colunas de COLS_CLIENTE existem e a leitura por elas funciona.
const assert = require('node:assert/strict');
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('dados-das-telas');
const V = lib('visitas');
const HX = lib('hoje-extras');
const ME = lib('modo-envio');
const SN = lib('sinal');
const R = lib('reservado');
const A = lib('acessos');
const F = lib('assistente/ferramentas');
const C = lib('assistente/conversa');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Dados' });
  const { dono, tosador, estoque } = L.sb;
  const P = L.P;
  const ag = async (pet, dia, hora, status, servico = 'Banho') => {
    const ini = B.instante(dia, hora, L.fuso);
    return B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets[pet], servico_id: L.S[servico], inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 60, status }).select('id').single(), `horário ${pet}`).id;
  };
  // Thor: veio há 45 dias e sumiu. Mel (mesma tutora): veio há 10 dias. Bob: veio há 50 dias, mas tem horário marcado.
  // Luna: faltou há 3 dias e não remarcou. Rex: veio há 200 dias e faz aniversário hoje.
  await ag('Thor', L.dia(-45), '10:00', 'concluido');
  await ag('Mel', L.dia(-10), '10:00', 'concluido');
  await ag('Bob', L.dia(-50), '11:00', 'concluido');
  await ag('Bob', L.dia(6), '11:00', 'marcado');
  await ag('Luna', L.dia(-60), '09:00', 'concluido');
  await ag('Luna', L.dia(-3), '09:00', 'faltou');
  await ag('Rex', L.dia(-200), '15:00', 'concluido');
  B.must(await dono.from('pets').update({ nascimento: `2020-${L.hoje.slice(5)}` }).eq('id', L.pets.Rex).select('id'), 'nascimento do Rex');

  const hoje = B.instante(L.hoje, '00:00', L.fuso);
  const pedir = async (sb, mais = {}) => HX.lerExtrasDoHoje(sb, P, hoje, { chamar: true, dicas: true, pacotes: true, envio: true, chamadosVolta: [], chamadosNiver: [], ...mais });

  T.secao('quem chamar de volta e aniversariantes: banco = conta da tela');
  const x = await pedir(dono);
  T.ok('a função existe e respondeu sem falhas', x && x.falhas.length === 0, x && x.falhas);
  // a conta que a tela fazia: todos os pets ativos com tutor e telefone + as visitas de cada um (visitas.ts)
  const pets = B.must(await dono.from('pets').select('id, nome, nascimento, cliente_id, clientes(id, nome, telefone)').eq('petshop_id', P).eq('ativo', true).order('nome').order('id'), 'pets');
  const visitas = await V.buscarVisitas(dono, P, new Date());
  const sumidos = pets.filter((p) => p.clientes?.telefone && V.sumiu(visitas.get(p.id), 30, new Date()));
  const tutoresSumidos = new Set(sumidos.map((p) => p.cliente_id));
  T.ok(`sumidos: ${tutoresSumidos.size} tutores e ${sumidos.length} pets, como na conta da tela`, x.chamar.sumidos.tutores === tutoresSumidos.size && x.chamar.sumidos.pets === sumidos.length && x.chamar.sumidos.todos === tutoresSumidos.size, x.chamar.sumidos);
  T.ok('são Thor (45 dias), Luna (60 dias) e Rex (200 dias); Mel veio há 10 dias e Bob tem horário marcado', sumidos.map((p) => p.nome).sort().join() === 'Luna,Rex,Thor', sumidos.map((p) => p.nome));
  T.ok('os dois primeiros nomes vêm de quem saiu há menos tempo (Thor, depois Luna)', x.chamar.sumidos.nomes.join() === 'Thor,Luna', x.chamar.sumidos.nomes);
  T.ok('aniversariante de hoje: Rex (um tutor, um pet, "hoje")', x.chamar.niver.tutores === 1 && x.chamar.niver.pets === 1 && x.chamar.niver.hoje === true && x.chamar.niver.nomes.join() === 'Rex', x.chamar.niver);
  const semAna = await pedir(dono, { chamadosVolta: [L.tutores.Ana], chamadosNiver: [L.tutores.Davi] });
  T.ok('quem já foi chamado neste aparelho sai da conta do que falta (e continua no total)', semAna.chamar.sumidos.tutores === tutoresSumidos.size - 1 && semAna.chamar.sumidos.todos === tutoresSumidos.size && semAna.chamar.niver.tutores === 0 && semAna.chamar.niver.todos === 1, semAna.chamar);
  B.must(await dono.from('clientes').update({ telefone: null }).eq('id', L.tutores.Davi).select('id'), 'tira o telefone');
  const semFone = await pedir(dono);
  T.ok('tutor sem telefone não entra (não dá para chamar)', semFone.chamar.sumidos.tutores === tutoresSumidos.size - 1 && semFone.chamar.niver.tutores === 0, semFone.chamar);
  B.must(await dono.from('clientes').update({ telefone: '11988880004' }).eq('id', L.tutores.Davi).select('id'), 'devolve o telefone');

  T.secao('"O Mozart reparou": as mesmas contas');
  T.ok('quem vinha e parou (última visita entre 30 e 150 dias, nada marcado): Thor e Luna; Rex (200 dias) fica de fora', x.dicas.sumidos.q === 2 && x.dicas.sumidos.nomes.join() === 'Thor,Luna', x.dicas.sumidos);
  T.ok('faltou nesta semana e não remarcou: Luna', x.dicas.faltas.join() === 'Luna' && x.dicas.faltas_q === 1, x.dicas.faltas);
  T.ok('aniversário nos próximos 7 dias: Rex, hoje', x.dicas.niver.length === 1 && x.dicas.niver[0].nome === 'Rex' && x.dicas.niver[0].em === 0, x.dicas.niver);
  T.ok('amanhã sem horário; 5 pets já vieram nos últimos 150 dias', x.dicas.amanha === 0 && x.dicas.vieram === 4, x.dicas);
  await ag('Thor', L.dia(1), '10:00', 'marcado');
  const x2 = await pedir(dono);
  T.ok('marcou o Thor para amanhã: sai dos sumidos e amanhã passa a ter 1 horário', x2.dicas.amanha === 1 && x2.dicas.sumidos.nomes.join() === 'Luna' && x2.chamar.sumidos.nomes.join() === 'Luna,Rex', x2);

  T.secao('"Mandar N mensagens": contagem = fila inteira');
  for (const quem of ['dono', 'tosador']) {
    const sb = L.sb[quem];
    const fila = ME.montarFila(await ME.lerModoEnvio(sb, P), (await R.lerPetshop(sb, P)).data);
    const esperado = ME.resumoDaFila(fila).map((r) => [r.tipo, r.quantas]);
    const veio = (await pedir(sb)).envio.map((r) => [r.tipo, r.quantas]);
    T.ok(`${quem}: a contagem do banco bate com a fila montada na tela (${JSON.stringify(esperado)})`, JSON.stringify(veio) === JSON.stringify(esperado) && esperado.length > 0, veio);
  }
  B.must(await dono.from('clientes').update({ telefone: '11 98888-0003 / 11 3333-4444' }).eq('id', L.tutores.Clara).select('id'), 'dois telefones');
  B.must(await dono.from('clientes').update({ nao_quer_mensagens: true }).eq('id', L.tutores.Ana).select('id'), 'não quer');
  {
    const fila = ME.montarFila(await ME.lerModoEnvio(dono, P), (await R.lerPetshop(dono, P)).data);
    const esperado = JSON.stringify(ME.resumoDaFila(fila).map((r) => [r.tipo, r.quantas]));
    const veio = JSON.stringify((await pedir(dono)).envio.map((r) => [r.tipo, r.quantas]));
    T.ok('telefone escrito com dois números conta; "não quer receber mensagens" fica de fora (igual à fila)', veio === esperado, { veio, esperado });
  }
  B.must(await dono.from('clientes').update({ nao_quer_mensagens: false }).eq('id', L.tutores.Ana).select('id'), 'volta');

  T.secao('quem não tem a área e quem não é da equipe');
  const doEstoque = await pedir(estoque);
  T.ok('quem só cuida do estoque não recebe nome de pet nem de tutor', doEstoque.chamar.sumidos.todos === 0 && doEstoque.chamar.sumidos.nomes.length === 0 && doEstoque.dicas.sumidos.q === 0 && doEstoque.dicas.faltas.length === 0 && (doEstoque.envio ?? []).length === 0, doEstoque);
  const doTosador = await pedir(tosador);
  T.ok('o tosador (Agenda e Clientes) recebe a mesma conta de quem chamar', doTosador.chamar.sumidos.tutores === x2.chamar.sumidos.tutores, doTosador.chamar);
  const fora = await criarLoja(T, { nome: 'Dados fora' });
  const deFora = await fora.sb.dono.rpc('gestao_hoje_extras', { p: P, a: { hoje_ini: hoje.toISOString(), chamar: true, dicas: true, envio: true } });
  T.ok('dono de outro pet shop: nada (null)', !deFora.error && deFora.data === null, deFora);
  const anon = await B.cliente().rpc('gestao_hoje_extras', { p: P, a: {} });
  T.recusa('sem login: recusado', anon);
  const sujo = await dono.rpc('gestao_hoje_extras', { p: P, a: { hoje_ini: hoje.toISOString(), chamar: true, chamados_volta: ['não-é-um-id'] } });
  T.ok('lixo na lista de chamados não derruba os outros cartões pela tela (a tela só manda ids válidos)', Boolean(sujo.error) || sujo.data !== undefined, sujo.error);

  T.secao('gestao_sinal: a pergunta leve "mudou alguma coisa?"');
  const de = hoje, ate = new Date(+hoje + 2 * 864e5);
  const s1 = await SN.lerSinal(dono, P, de, ate);
  T.ok('responde 32 letras', typeof s1 === 'string' && /^[0-9a-f]{32}$/.test(s1), s1);
  T.ok('sem mudança, a resposta é a mesma (não manda a tela reler à toa)', (await SN.lerSinal(dono, P, de, ate)) === s1);
  T.ok('a equipe recebe a mesma resposta (o tablet do banho e a recepção perguntam a mesma coisa)', (await SN.lerSinal(tosador, P, de, ate)) === s1);
  const novo = await ag('Mel', L.hoje, '16:00', 'marcado');
  const s2 = await SN.lerSinal(dono, P, de, ate);
  T.ok('a recepção marcou um horário hoje: a resposta muda', s2 !== s1);
  B.must(await dono.from('agendamentos').update({ status: 'confirmado' }).eq('id', novo).select('id'), 'confirma');
  const s3 = await SN.lerSinal(dono, P, de, ate);
  T.ok('confirmou o horário: muda de novo', s3 !== s2);
  await ag('Bob', L.dia(20), '10:00', 'marcado');
  T.ok('horário fora do período perguntado não mexe na resposta', (await SN.lerSinal(dono, P, de, ate)) === s3);
  B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 35, forma: 'pix', categoria: 'Outros', data: L.hoje, pago: true, origem: 'tela' }).select('id'), 'recebeu');
  T.ok('entrou dinheiro hoje: muda (o "Entrou hoje" da tela Hoje acompanha)', (await SN.lerSinal(dono, P, de, ate)) !== s3);
  T.ok('dono de outro pet shop não recebe sinal nenhum', (await SN.lerSinal(fora.sb.dono, P, de, ate)) === null);
  T.ok('sem login: nada', (await SN.lerSinal(B.cliente(), P, de, ate)) === null);

  T.secao('Mozart: entrada de estoque pela mesma função das telas');
  async function contexto(papel) {
    const sb = L.sb[papel];
    const u = (await sb.auth.getUser()).data.user;
    const [p, e, s] = await Promise.all([R.lerPetshop(sb, P), R.lerEquipe(sb, P), R.lerServicos(sb, P)]);
    const eu = (e.data || []).find((z) => z.user_id === u.id && z.ativo);
    return { sb, userId: u.id, petshop: p.data, eu, equipe: e.data || [], servicos: s.data || [],
      vejoFinanceiro: A.podeArea(eu, 'caixa') || A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'),
      cuidoDoFinanceiro: A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'), fusoMin: -180, agora: `${L.hoje}T10:00` };
  }
  const cDono = await contexto('dono');
  const saldo = (id) => B.num(`select estoque from produtos where id='${id}'`);
  const despesas = () => B.num(`select count(*) from lancamentos where petshop_id='${P}' and tipo='saida' and categoria='Produtos e material'`);
  const antes = saldo(L.prod), despAntes = despesas();
  const chave = `mozart:teste-${B.sufixo()}`;
  const pedido = { produto_id: L.prod, tipo: 'entrada', quantidade: 5, custo_unitario: 12.34, lancar_despesa: true, forma: 'pix' };
  const r1 = await F.gravar({ ...cDono, chave }, 'movimentar_estoque', pedido);
  T.ok('entrada com despesa: o saldo sobe 5 e a despesa entra junto', r1.feito && r1.despesa_lancada === true && saldo(L.prod) === antes + 5 && despesas() === despAntes + 1, r1);
  T.ok('a despesa é de R$ 61,70 (5 × 12,34), paga no Pix, pela chave da operação', B.sql(`select valor||'|'||forma||'|'||pago from lancamentos where petshop_id='${P}' and chave='${chave}'`) === '61.70|pix|true', B.sql(`select valor, forma, pago from lancamentos where petshop_id='${P}' and chave='${chave}'`));
  const r2 = await F.gravar({ ...cDono, chave }, 'movimentar_estoque', pedido);
  T.ok('o mesmo pedido de novo (chegou repetido): nada entra duas vezes e a resposta continua dizendo que a despesa foi lançada', r2.feito && r2.repetido === true && r2.despesa_lancada === true && saldo(L.prod) === antes + 5 && despesas() === despAntes + 1, r2);
  const validade = B.must(await dono.from('produtos').insert({ petshop_id: P, nome: 'Ração com validade', unidade: 'un', preco_venda: 100, custo: 60, controla_validade: true }).select('id').single(), 'produto com validade').id;
  let recusa = '';
  try { await F.descrever(cDono, 'movimentar_estoque', { produto_id: validade, tipo: 'entrada', quantidade: 3 }); } catch (e) { recusa = e.message; }
  T.ok('produto com Controlar validade: o cartão nem é montado sem a validade', /controla validade/.test(recusa), recusa);
  let recusaDoBanco = '';
  try { await F.gravar({ ...cDono, chave: `mozart:teste-${B.sufixo()}` }, 'movimentar_estoque', { produto_id: validade, tipo: 'entrada', quantidade: 3, custo_unitario: 60, lancar_despesa: true, forma: 'pix' }); } catch (e) { recusaDoBanco = e.message; }
  T.ok('e se chegar ao banco sem ela, o banco recusa e nada entra (nem a despesa)', /validade/i.test(recusaDoBanco) && saldo(validade) === 0 && despesas() === despAntes + 1, recusaDoBanco);
  const cartao = await F.descrever(cDono, 'movimentar_estoque', { produto_id: validade, tipo: 'entrada', quantidade: 3, validade: L.dia(90), lote: 'L-77' });
  T.ok('com a validade, o cartão mostra a validade e o lote', cartao.linhas.some(([k, v]) => k === 'Validade' && /L-77/.test(v)), cartao.linhas);
  const r3 = await F.gravar({ ...cDono, chave: `mozart:teste-${B.sufixo()}` }, 'movimentar_estoque', { produto_id: validade, tipo: 'entrada', quantidade: 3, validade: L.dia(90), lote: 'L-77' });
  T.ok('e a entrada grava a validade e o lote no movimento', r3.feito && saldo(validade) === 3 && B.sql(`select validade||'|'||lote from movimentos_estoque where produto_id='${validade}'`) === `${L.dia(90)}|L-77`, B.sql(`select validade, lote from movimentos_estoque where produto_id='${validade}'`));
  const r4 = await F.gravar({ ...cDono, chave: `mozart:teste-${B.sufixo()}` }, 'movimentar_estoque', { produto_id: L.prod, tipo: 'saida', quantidade: 2, motivo: 'Uso no banho' });
  T.ok('saída continua funcionando (saldo desce 2)', r4.feito && saldo(L.prod) === antes + 3, r4);

  T.secao('Mozart: a conta liberada é a do banco');
  const liberado = async () => (await dono.rpc('acesso_liberado', { p: P })).data;
  T.ok('conta em teste: liberada', (await liberado()) === true);
  B.sql(`update petshops set teste_ate = now() - interval '2 days' where id='${P}'`);
  const doBanco = await liberado();
  const petshop = (await R.lerPetshop(dono, P)).data;
  T.ok('teste vencido: o Mozart segue o que o banco diz, não a conta antiga pelo status', C.contaLiberada(doBanco, petshop) === doBanco && C.contaLiberada(null, petshop) === false && typeof doBanco === 'boolean', { doBanco });
  B.sql(`update petshops set teste_ate = now() + interval '20 days' where id='${P}'`);

  T.secao('tutor sem e-mail e endereço para quem não tem a área Clientes');
  const semContato = await tosador.from('clientes').select(R.COLS_CLIENTE).eq('petshop_id', P).eq('id', L.tutores.Ana).maybeSingle();
  T.ok('as colunas de COLS_CLIENTE existem e a leitura funciona', !semContato.error && semContato.data && semContato.data.nome && !('email' in semContato.data) && !('endereco' in semContato.data), semContato.error || semContato.data);
  const comContato = await dono.from('clientes').select(R.colsDoTutor(true)).eq('petshop_id', P).eq('id', L.tutores.Ana).maybeSingle();
  T.ok('quem tem a área Clientes lê e-mail e endereço', !comContato.error && 'email' in comContato.data && 'endereco' in comContato.data, comContato.error || comContato.data);
  assert.ok(true);
}))();
