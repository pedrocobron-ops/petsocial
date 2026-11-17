// Mozart e IA depois dos cinco testadores, com o banco de verdade e um modelo de mentira (roteiro fixo, sem chamar a API).
//  - Juliana H1: "coloca a Pipoca na creche amanhã" vira reserva da creche (estadia), nunca horário da agenda; o serviço
//    "Creche diária" que está na lista da agenda é recusado em marcar_horario. Mensalista no dia do plano não reserva; em
//    outro dia vira dia extra do plano. Hotel: entrada e saída.
//  - Juliana M5: a mesma confirmação de novo (a página recarregou no meio do "Pode fazer") grava uma vez só
//    (assistente_acao_reservar), inclusive para marcar horário, que não tinha chave.
//  - Rafael 5: ver_hospedes traz a creche dia a dia com o mensalista 5x esperado amanhã.
//  - Bia M1: ver_sinais (recebido no período e o que falta receber) é a mesma conta de lerSinaisDoPeriodo (Relatórios).
//  - Neide M6: para quem não vê dinheiro, a busca não diz "nada" de dívida: diz que ela não vê valores.
//  - Camila 6: a conta fixa que começou depois do vencimento diz "não entrou este mês" (nunca "deve estar paga").
//  - Juliana M1: a linha da tabela de preços de creche e hotel vai para a diária e para o modelo de plano.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('mozart-consertos');
const F = lib('assistente/ferramentas');
const C = lib('assistente/conversa');
const R = lib('reservado');
const A = lib('acessos');
const S = lib('sinais');
const TP = lib('tabela-precos');

let seq = 0;
const resp = (content, stop_reason = 'tool_use') => ({ content, stop_reason });
const uso = (name, input) => ({ type: 'tool_use', id: `toolu_mc${Date.now().toString(36)}${++seq}`, name, input });
const falar = (text) => resp([{ type: 'text', text }], 'end_turn');
const n = (x) => JSON.parse(JSON.stringify(x).replace(/ /g, ' '));

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'MozartC' });
  const { dono } = L.sb;
  const P = L.P;
  async function contexto(papel) {
    const sb = L.sb[papel];
    const u = (await sb.auth.getUser()).data.user;
    const [p, e, s] = await Promise.all([R.lerPetshop(sb, P), R.lerEquipe(sb, P), R.lerServicos(sb, P)]);
    const eu = (e.data || []).find((x) => x.user_id === u.id && x.ativo);
    return { sb, userId: u.id, petshop: p.data, eu, equipe: e.data || [], servicos: s.data || [],
      vejoFinanceiro: A.podeArea(eu, 'caixa') || A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'),
      cuidoDoFinanceiro: A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'), fusoMin: -180, agora: `${L.hoje}T10:00` };
  }
  const semContar = async () => true;
  const reservarNoBanco = (sb) => async (id) => B.must(await sb.rpc('assistente_acao_reservar', { p_petshop: P, p_uso: id }), 'reservar ação') === true;
  const liberarNoBanco = (sb) => async (id) => { await sb.rpc('assistente_acao_liberar', { p_petshop: P, p_uso: id }); };
  /** Roda uma conversa curta: o roteiro devolve a ferramenta; devolve a saída das voltas. */
  async function pedir(c, texto, passos) {
    let i = 0;
    const msgs = [{ role: 'user', content: [{ type: 'text', text: texto }] }];
    const s = await C.voltas({ c, mensagens: msgs, liberado: true, contar: semContar, chamar: async (m) => { const p = passos[i++]; return typeof p === 'function' ? p(m) : p ?? falar('Pronto.'); } });
    return { s, msgs };
  }

  // um serviço "Creche diária" de 1 hora na agenda (como a foto da tabela de preços criava)
  const sCreche = B.must(await dono.from('servicos').insert({ petshop_id: P, nome: 'Creche diária', categoria: 'outro', duracao_min: 60, preco_p: 60, preco_m: 60, preco_g: 60, preco_gg: 60 }).select('id').single(), 'serviço creche').id;
  const cDono = await contexto('dono');
  const amanha = L.dia(1);
  const agendaDoPet = (pet) => B.num(`select count(*) from agendamentos where petshop_id='${P}' and pet_id='${L.pets[pet]}'`);
  const estadiasDoPet = (pet, extra = '') => B.num(`select count(*) from estadias where petshop_id='${P}' and pet_id='${L.pets[pet]}' and status='reservada' ${extra}`);

  T.secao('Juliana H1: "coloca a Mel na creche amanhã" vai para a creche, não para a agenda');
  {
    const { s } = await pedir(cDono, 'coloca a Mel na creche amanhã, o dia todo', [
      resp([uso('marcar_horario', { pet_id: L.pets.Mel, servico_id: sCreche, inicio: `${amanha}T08:00` })]),
      (m) => { const r = m[m.length - 1].content[0]; T.ok('marcar_horario com "Creche diária" é recusado e manda usar reservar_estadia', r.is_error && /reservar_estadia/.test(r.content), r); return resp([uso('reservar_estadia', { pet_id: L.pets.Mel, tipo: 'creche', dias: [amanha] })]); },
    ]);
    T.ok('para no cartão "Reservar creche" (nada gravado ainda)', s.propostas.length === 1 && s.propostas[0].resumo.titulo === 'Reservar creche' && agendaDoPet('Mel') === 0 && estadiasDoPet('Mel') === 0, s.propostas);
    const card = n(s.propostas[0].resumo);
    T.ok('o cartão diz que não entra na agenda e mostra a diária', card.linhas.some(([k, v]) => k === 'Onde' && /não entra na agenda/.test(v)) && card.linhas.some(([k, v]) => k === 'Diária' && /R\$ 70,00 por dia/.test(v)), card.linhas);
    const pend = s.mensagens[s.mensagens.length - 1].content.filter((b) => b.type === 'tool_use');
    const opcoes = { c: cDono, pendentes: pend, liberado: true, decisoes: [{ id: s.propostas[0].id, ok: true }], parciais: s.parciais, reservar: reservarNoBanco(dono), liberar: liberarNoBanco(dono) };
    const r1 = await C.responderCartoes(opcoes);
    T.ok('"Pode fazer": uma reserva de creche para amanhã, nenhum horário na agenda', r1.mudou && estadiasDoPet('Mel', `and tipo='creche' and (entrada at time zone '${L.fuso}')::date = '${amanha}'`) === 1 && agendaDoPet('Mel') === 0, r1.resultados);
    // Juliana M5: a página recarregou e a mesma confirmação chegou de novo
    const r2 = await C.responderCartoes(opcoes);
    T.ok('a mesma confirmação de novo: "já tinha sido gravada", continua uma reserva só', /já tinha sido gravada/.test(r2.resultados[0].content) && !r2.mudou && estadiasDoPet('Mel') === 1, r2.resultados);
    const outra = await pedir(cDono, 'coloca a Mel na creche amanhã', [resp([uso('reservar_estadia', { pet_id: L.pets.Mel, tipo: 'creche', dias: [amanha] })])]);
    T.ok('pedir de novo para o mesmo dia: recusado ("já tem reserva")', !outra.s.propostas.length && /já tem reserva de creche/.test(JSON.stringify(outra.msgs)), outra.msgs[outra.msgs.length - 1]);
  }

  T.secao('Juliana M5: marcar horário (sem chave no banco) também grava uma vez só');
  {
    const { s } = await pedir(cDono, 'marca banho do thor amanhã às 9', [resp([uso('marcar_horario', { pet_id: L.pets.Thor, servico_id: L.S.Banho, inicio: `${amanha}T09:00` })])]);
    const pend = s.mensagens[s.mensagens.length - 1].content.filter((b) => b.type === 'tool_use');
    const o = { c: cDono, pendentes: pend, liberado: true, decisoes: [{ id: s.propostas[0].id, ok: true }], parciais: s.parciais, reservar: reservarNoBanco(dono), liberar: liberarNoBanco(dono) };
    await C.responderCartoes(o); await C.responderCartoes(o);
    T.ok('duas confirmações iguais: um horário só', agendaDoPet('Thor') === 1, agendaDoPet('Thor'));
    const r = await L.sb.tosador.rpc('assistente_acao_reservar', { p_petshop: '00000000-0000-4000-8000-000000000000', p_uso: 'toolu_qualquer' });
    T.ok('quem não é da loja não marca ação de outro pet shop', Boolean(r.error), r);
  }

  T.secao('Mensalista: dia do plano não reserva; outro dia vira dia extra');
  const todos = [0, 1, 2, 3, 4, 5, 6];
  const diaDaSemana = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
  // Bolt (aqui o Rex) vem todo dia; a Luna vem só no dia da semana de hoje
  B.must(await dono.from('creche_planos').insert({ petshop_id: P, pet_id: L.pets.Rex, dias: todos, inicio: L.mes1, vence_dia: 10 }).select('id').single(), 'plano Rex');
  B.must(await dono.from('creche_planos').insert({ petshop_id: P, pet_id: L.pets.Luna, dias: [diaDaSemana(L.hoje)], inicio: L.mes1, vence_dia: 10 }).select('id').single(), 'plano Luna');
  {
    const a = await pedir(cDono, 'coloca o rex na creche amanhã', [resp([uso('reservar_estadia', { pet_id: L.pets.Rex, tipo: 'creche', dias: [amanha] })])]);
    T.ok('Rex (todo dia): "já é dia do plano: não precisa reservar"', !a.s.propostas.length && /já é dia do plano/.test(JSON.stringify(a.msgs)), a.msgs[a.msgs.length - 1]);
    const b = await pedir(cDono, 'coloca a luna na creche amanhã', [resp([uso('reservar_estadia', { pet_id: L.pets.Luna, tipo: 'creche', dias: [amanha] })])]);
    T.ok('Luna (amanhã não é dia do plano): o cartão diz "dia extra do plano"', b.s.propostas.length === 1 && n(b.s.propostas[0].resumo).linhas.some(([k, v]) => k === 'Plano' && /dia extra/.test(v)), b.s.propostas[0]?.resumo);
    const pend = b.s.mensagens[b.s.mensagens.length - 1].content.filter((x) => x.type === 'tool_use');
    await C.responderCartoes({ c: cDono, pendentes: pend, liberado: true, decisoes: [{ id: b.s.propostas[0].id, ok: true }], parciais: b.s.parciais, reservar: reservarNoBanco(dono) });
    T.ok('vira dia extra do plano (mensalista = extra)', B.num(`select count(*) from estadias where pet_id='${L.pets.Luna}' and mensalista='extra' and dia='${amanha}'`) === 1);
  }

  T.secao('Rafael 5: "quem vem na creche?" traz o mensalista de todo dia');
  {
    const r = n(JSON.parse((await F.rodarConsulta(cDono, 'ver_hospedes', { dias: 3 })).conteudo));
    const dAmanha = r.creche_por_dia?.find((x) => x.dia.startsWith('amanhã'));
    T.ok('amanhã: Rex (mensalista de todo dia), Luna (dia extra) e Mel (reserva)', dAmanha && dAmanha.mensalistas.some((x) => x.startsWith('Rex')) && dAmanha.mensalistas.some((x) => x.startsWith('Luna')) && dAmanha.reservas.some((x) => x.startsWith('Mel')), dAmanha);
    const dHoje = r.creche_por_dia?.[0];
    T.ok('hoje: Rex e Luna esperados pelo plano', dHoje && dHoje.mensalistas.some((x) => x.startsWith('Rex')) && dHoje.mensalistas.some((x) => x.startsWith('Luna')), dHoje);
  }

  T.secao('Hotel pelo Mozart: entrada e saída');
  {
    const { s } = await pedir(cDono, 'o bob dorme aqui de amanhã a depois de amanhã', [resp([uso('reservar_estadia', { pet_id: L.pets.Bob, tipo: 'hotel', dias: [amanha], saida: L.dia(3) })])]);
    const card = s.propostas[0] && n(s.propostas[0].resumo);
    T.ok('cartão "Reservar hotel" com 2 noites e a diária do hotel', card && card.titulo === 'Reservar hotel' && card.linhas.some(([k, v]) => k === 'Saída' && /2 noites/.test(v)) && card.linhas.some(([k, v]) => k === 'Diária' && /120,00 por noite/.test(v)), card);
    const sem = await pedir(cDono, 'o bob dorme aqui amanhã', [resp([uso('reservar_estadia', { pet_id: L.pets.Bob, tipo: 'hotel', dias: [amanha] })])]);
    T.ok('hotel sem o dia da saída: pergunta até quando', !sem.s.propostas.length && /Falta o dia da saída/.test(JSON.stringify(sem.msgs)));
  }

  T.secao('Neide M6: quem não vê dinheiro não ouve "não deve nada"');
  {
    B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 85, categoria: 'Banho e tosa', descricao: 'Banho e tosa do Bob', data: L.hoje, vencimento: L.hoje, pago: false, cliente_id: L.tutores.Beto, origem: 'tela' }).select('id'), 'dívida');
    const cTosa = await contexto('tosador');
    const r = n(JSON.parse((await F.rodarConsulta(cTosa, 'buscar_pets', { termo: 'bob' })).conteudo));
    T.ok('a busca do tosador diz que ele não vê valores (e nunca "nada")', r.pets[0].tutor_deve === F.SEM_VALORES && !/R\$/.test(JSON.stringify(r)), r.pets[0]);
    const rd = n(JSON.parse((await F.rodarConsulta(cDono, 'buscar_pets', { termo: 'bob' })).conteudo));
    T.ok('a busca da dona continua com o valor', rd.pets[0].tutor_deve === 'R$ 85,00 em 1 conta', rd.pets[0]);
  }

  T.secao('Bia M1: "quanto recebi de sinal este mês?"');
  {
    const caixa = L.sb.caixa;
    const ch = (s) => `t-${s}-${B.sufixo()}`;
    async function reserva(pet, sinal) {
      const id = B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets[pet], tipo: 'hotel', status: 'reservada', entrada: B.instante(L.dia(10), '09:00', L.fuso).toISOString(),
        saida_prevista: B.instante(L.dia(12), '17:00', L.fuso).toISOString(), valor_diaria: 110 }).select('id').single(), pet).id;
      B.must(await caixa.rpc('estadia_sinal', { p_petshop: P, p_estadia: id, p_chave: ch('sinal'), p_passos: [
        { t: 'lancamento', nome: 'sinal', linha: { tipo: 'entrada', valor: sinal, forma: null, categoria: 'Creche e hotel', descricao: `Sinal da reserva: hotel de ${pet}`, cliente_id: L.tutores.Ana, pago: false, data: L.hoje, vencimento: L.hoje } },
        { t: 'estadia_valores', estadia: id, modo: 'upsert', campos: { sinal, sinal_estado: 'a_receber', sinal_lancamento_id: '$ref:sinal', sinal_pago_em: null } },
      ] }), 'sinal ' + pet);
      return id;
    }
    const thor = await reserva('Thor', 66);
    await reserva('Mel', 49.5);
    const conta = B.sql(`select sinal_lancamento_id from estadias_valores where estadia_id='${thor}'`);
    B.must(await caixa.rpc('receber_conta', { p_conta: conta, p_valor: 66, p_forma: 'pix', p_chave: ch('rec') }), 'recebe o sinal do Thor');
    const r = n(JSON.parse((await F.rodarConsulta(cDono, 'ver_sinais', { de: L.mes1, ate: L.hoje })).conteudo));
    const lib2 = await S.lerSinaisDoPeriodo(dono, P, L.mes1, L.hoje, -180);
    T.ok('Mozart: R$ 66 recebidos de 1 reserva; faltam R$ 49,50 de 1', r.sinais_recebidos === 66 && r.reservas_com_sinal_recebido === 1 && r.sinais_a_receber_agora === 49.5 && r.sinais_a_receber_quantos === 1, r);
    T.ok('o mesmo número da conta de Relatórios (lerSinaisDoPeriodo)', lib2.recebido === r.sinais_recebidos && lib2.devolvido === r.devolvido, lib2);
    const cTosa = await contexto('tosador');
    const x = await F.rodarConsulta(cTosa, 'ver_sinais', { de: L.mes1, ate: L.hoje });
    T.ok('quem não cuida do financeiro não vê os sinais', x.erro === true, x);
  }

  T.secao('Camila 6: conta fixa que começou depois do vencimento');
  {
    const comeca = L.hoje, dia = Math.max(1, Number(L.hoje.slice(8, 10)) - 1);
    if (Number(L.hoje.slice(8, 10)) > 1) {
      B.must(await dono.rpc('contas_fixas_salvar', { p: P, p_conta: { id: B.uuid(), nome: 'Aluguel', categoria: 'Aluguel', dia, valor: 3500, frequencia: 'mensal', comeca_em: comeca } }), 'conta fixa');
      const r = n(JSON.parse((await F.rodarConsulta(cDono, 'ver_contas_fixas', {})).conteudo));
      const al = (r.este_mes ?? []).find((x) => x.conta === 'Aluguel');
      T.ok('o aluguel diz que não existe conta deste mês (começou depois do vencimento) e que nada foi pago', al && al.situacao === 'antes_do_inicio' && /não existe conta de/.test(al.o_que_aconteceu) && /Nada foi pago/.test(al.o_que_aconteceu), al);
      T.ok('a regra manda nunca deduzir que foi paga', /nunca deduza que está paga/i.test(r.regra));
    } else T.ok('(dia 1: sem dia anterior no mês para testar)', true);
  }

  T.secao('Juliana: "a luz deste mês veio R$ 380" sem Luz cadastrada: o Mozart cadastra a conta fixa');
  {
    const { s } = await pedir(cDono, 'cadastra a luz, vence todo dia 15, uns 350', [resp([uso('criar_conta_fixa', { nome: 'Luz', valor: 350, dia: 15, valor_varia: true })])]);
    const card = s.propostas[0] && n(s.propostas[0].resumo);
    T.ok('cartão "Cadastrar conta fixa" com valor, dia e categoria', card && card.titulo === 'Cadastrar conta fixa' && card.linhas.some(([k, v]) => k === 'Vence' && v === 'todo dia 15') && card.linhas.some(([k, v]) => k === 'Categoria' && v === 'Água, luz e internet'), card);
    const pend = s.mensagens[s.mensagens.length - 1].content.filter((b) => b.type === 'tool_use');
    const o = { c: cDono, pendentes: pend, liberado: true, decisoes: [{ id: s.propostas[0].id, ok: true }], parciais: s.parciais, reservar: reservarNoBanco(dono) };
    await C.responderCartoes(o); await C.responderCartoes(o);
    T.ok('uma conta fixa Luz (a confirmação repetida não cria outra)', B.num(`select count(*) from contas_fixas where petshop_id='${P}' and nome='Luz' and valor_varia and dia=15`) === 1);
    const sem = await pedir(await contexto('tosador'), 'cadastra a luz', [resp([uso('criar_conta_fixa', { nome: 'Luz', valor: 350, dia: 15 })])]);
    T.ok('quem não cuida do financeiro não tem a ferramenta', !sem.s.propostas.length);
  }

  T.secao('Juliana M1: creche e hotel da tabela de preços no lugar certo');
  {
    T.ok('diária da creche', /Diária da creche/.test(await TP.gravarPrecoDaCasa(dono, P, { nome: 'Creche diária', destino: 'creche_diaria', precos: { preco_p: 60, preco_m: 60, preco_g: 60, preco_gg: 60 } })) && B.sql(`select diaria_creche from petshops where id='${P}'`) === '60.00');
    await TP.gravarPrecoDaCasa(dono, P, { nome: 'Creche mensal 3x semana', destino: 'creche_plano', vezes: 3, precos: { preco_p: 480, preco_m: 480, preco_g: 480, preco_gg: 480 } });
    await TP.gravarPrecoDaCasa(dono, P, { nome: 'Creche mensal 3x semana', destino: 'creche_plano', vezes: 3, precos: { preco_p: 500, preco_m: 500, preco_g: 500, preco_gg: 500 } });
    T.ok('plano mensal vira modelo de plano (3x, R$ 500; a segunda leitura atualiza, não duplica)', B.sql(`select string_agg(vezes || '|' || valor_mensal, ',') from creche_modelos where petshop_id='${P}'`) === '3|500.00');
    await TP.gravarPrecoDaCasa(dono, P, { nome: 'Hotel', destino: 'hotel_diaria', precos: { preco_p: 90, preco_m: 110, preco_g: 130, preco_gg: 150 } });
    T.ok('diária do hotel por porte (opção ligada com os quatro portes)', B.sql(`select opcoes->'hotel.diaria_por_porte'->>'ativo' || '|' || (opcoes->'hotel.diaria_por_porte'->>'M') from petshops where id='${P}'`) === 'true|110' && B.sql(`select diaria_hotel from petshops where id='${P}'`) === '110.00');
    T.ok('nenhum serviço de creche ou hotel novo na agenda', B.num(`select count(*) from servicos where petshop_id='${P}' and (nome ilike '%mensal%' or nome ilike 'hotel%')`) === 0);
  }
}))();
