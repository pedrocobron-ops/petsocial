// Horário de cada serviço e da creche e do hotel (migração 20261242), pela API:
// - quem muda: só o dono (petshops.horario_creche/horario_hotel e servicos.horario, como petshops.horario); a equipe não muda;
// - o banco confere o formato (dias de 0 a 6, abre e fecha HH:MM, fecha depois de abrir, sem almoço, ao menos um dia aberto);
// - link_horarios: o serviço com horário próprio só tem horário nele; com outros serviços, só o que cabe em todos; o pedido fora
//   do horário do serviço é "ocupado"; link_info entrega o horário de cada serviço e o da creche e do hotel;
// - creche e hotel: sem horário próprio, seguem o pet shop ("domingo fechado" vale para os dois); com horário próprio, a
//   creche abre no domingo (link_estadia_cheios, link_espera_pedir) e o hotel recebe no domingo, na janela dele
//   (link_pedir_estadia: dia_fechado e fora_do_horario com o horário do hotel);
// - gestao_base entrega as colunas novas.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const T = require('../lib/teste')('horario-servico');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Horarios' });
  const { dono, caixa, tosador } = L.sb;
  const LOJA = L.P, COD = L.codigo;
  const BANHO = L.S['Banho'], HIDRA = L.S['Hidratação'], TOSA = L.S['Banho e tosa'];
  const anon = () => B.cliente(B.ipAleatorio());
  const horas = async (servico, dia, extras) => ((await anon().rpc('link_horarios', { p_codigo: COD, p_servico: servico, p_dia: dia, p_pets: 1, ...(extras ? { p_extras: extras } : {}) })).data ?? []).map((h) => String(h).slice(0, 5));
  const pedir = (funcao, args) => anon().rpc('link_pedir_com_termos', { p_funcao: funcao, p_args: { p_codigo: COD, ...args } }).then((r) => r.data ?? { erro: r.error?.message });
  const fone = (n) => `11${n}` + String(Date.now()).slice(-8);
  const semana = (f) => Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), f(d)]));
  // o pet shop: segunda a sábado 08:00 às 18:00, domingo fechado
  const LOJA_H = semana((d) => (d === 0 ? null : { abre: '08:00', fecha: '18:00' }));
  B.must(await dono.from('petshops').update({ horario: LOJA_H }).eq('id', LOJA).select('id'), 'horário do pet shop');
  for (const [id, min] of [[BANHO, 60], [HIDRA, 30], [TOSA, 90]]) B.must(await dono.from('servicos').update({ duracao_min: min }).eq('id', id).select('id'), 'duração');
  const domingo = B.proximoDia(L.dia(3), [0], true), segunda = B.proximoDia(L.dia(3), [1], true), sabado = B.proximoDia(L.dia(3), [6], true);

  T.secao('quem muda o horário');
  const CRECHE_H = semana((d) => ({ abre: d === 0 ? '08:00' : '07:00', fecha: d === 0 ? '18:00' : '19:00' }));
  const naoMuda = async (sb, tabela, campos, id) => (await sb.from(tabela).update(campos).eq('id', id).select('id')).data?.length ?? 0;
  T.ok('a recepção (todas as áreas da casa) não muda o horário da creche', await naoMuda(caixa, 'petshops', { horario_creche: CRECHE_H }, LOJA) === 0);
  T.ok('o tosador não muda o horário do hotel', await naoMuda(tosador, 'petshops', { horario_hotel: CRECHE_H }, LOJA) === 0);
  T.ok('o tosador não muda o horário de um serviço', await naoMuda(tosador, 'servicos', { horario: CRECHE_H }, HIDRA) === 0);
  T.ok('nada mudou', B.sql(`select coalesce(horario_creche::text, '-') || coalesce(horario_hotel::text, '-') from petshops where id='${LOJA}'`) === '--'
    && B.sql(`select coalesce(horario::text, '-') from servicos where id='${HIDRA}'`) === '-');
  const lido = await tosador.from('petshops').select('horario_creche, horario_hotel').eq('id', LOJA).single();
  T.ok('a equipe lê o horário da creche e do hotel (null = igual ao pet shop)', !lido.error && lido.data.horario_creche === null && lido.data.horario_hotel === null, lido.error?.message);
  const lidoS = await tosador.from('servicos').select('id, horario').eq('id', HIDRA).single();
  T.ok('e o horário do serviço', !lidoS.error && lidoS.data.horario === null, lidoS.error?.message);

  T.secao('o banco confere o formato');
  const recusa = async (nome, campos, tabela = 'petshops', id = LOJA) => {
    const r = await dono.from(tabela).update(campos).eq('id', id).select('id');
    T.ok(nome, !!r.error && /check|viola|violat/i.test(r.error.message), r.error?.message ?? r.data);
  };
  await recusa('dia 7 não existe', { horario_creche: { 7: { abre: '08:00', fecha: '18:00' } } });
  await recusa('fecha antes de abrir', { horario_hotel: { 1: { abre: '18:00', fecha: '08:00' } } });
  await recusa('hora fora do formato', { horario_creche: { 1: { abre: '8h', fecha: '18:00' } } });
  await recusa('almoço não vai no horário da creche', { horario_creche: { 1: { abre: '08:00', fecha: '18:00', almoco: { de: '12:00', ate: '13:00' } } } });
  await recusa('todos os dias fechados', { horario: semana(() => null) }, 'servicos', HIDRA);

  T.secao('o dono muda');
  T.passa('o dono põe a creche aberta no domingo (08:00 às 18:00)', await dono.from('petshops').update({ horario_creche: CRECHE_H }).eq('id', LOJA).select('id'));
  // Hidratação: só no domingo (09:00 às 15:00) e na segunda à tarde (14:00 às 18:00)
  const HIDRA_H = semana((d) => (d === 0 ? { abre: '09:00', fecha: '15:00' } : d === 1 ? { abre: '14:00', fecha: '18:00' } : null));
  T.passa('o dono põe horário próprio na Hidratação', await dono.from('servicos').update({ horario: HIDRA_H }).eq('id', HIDRA).select('id'));
  const base = B.must(await dono.rpc('gestao_base', { p: LOJA }), 'gestao_base');
  T.ok('gestao_base entrega o horário da creche, o do hotel e o de cada serviço', base.petshop.horario_creche?.['0']?.abre === '08:00' && base.petshop.horario_hotel === null
    && base.servicos.find((s) => s.id === HIDRA)?.horario?.['0']?.fecha === '15:00' && base.servicos.find((s) => s.id === BANHO)?.horario === null, base.petshop.horario_creche);

  T.secao('link do cliente: o horário de cada serviço');
  const info = B.must(await anon().rpc('link_info', { p_codigo: COD }), 'link_info');
  T.ok('link_info: o horário próprio da Hidratação e null no Banho', info.servicos.find((s) => s.id === HIDRA)?.horario?.['1']?.abre === '14:00' && info.servicos.find((s) => s.id === BANHO)?.horario === null);
  T.ok('link_info: a creche com o horário dela e o hotel com o do pet shop', info.horario_creche?.['0']?.abre === '08:00' && info.horario_hotel?.['0'] === null && info.horario_hotel?.['1']?.abre === '08:00', [info.horario_creche?.['0'], info.horario_hotel?.['0']]);
  const hDom = await horas(HIDRA, domingo);
  T.ok('Hidratação no domingo (pet shop fechado): das 09:00 às 14:30', hDom[0] === '09:00' && hDom[hDom.length - 1] === '14:30', hDom);
  T.ok('Banho no domingo (segue o pet shop): nenhum horário', (await horas(BANHO, domingo)).length === 0);
  const hSeg = await horas(HIDRA, segunda);
  T.ok('Hidratação na segunda: só à tarde (14:00 às 17:30)', hSeg[0] === '14:00' && hSeg[hSeg.length - 1] === '17:30', hSeg);
  T.ok('Hidratação no sábado: nenhum horário', (await horas(HIDRA, sabado)).length === 0);
  const bSeg = await horas(BANHO, segunda);
  T.ok('Banho na segunda: o dia todo do pet shop (08:00 às 17:00)', bSeg[0] === '08:00' && bSeg[bSeg.length - 1] === '17:00', bSeg);
  const juntos = await horas(TOSA, segunda, [HIDRA]);
  T.ok('Banho e tosa + Hidratação (120 min) na segunda: só o que cabe nos dois (14:00 às 16:00)', juntos[0] === '14:00' && juntos[juntos.length - 1] === '16:00', juntos);
  T.ok('Banho + Hidratação no domingo: nenhum (o Banho segue o pet shop, fechado)', (await horas(BANHO, domingo, [HIDRA])).length === 0);
  const fora = await pedir('link_pedir', { p_servico: HIDRA, p_dia: segunda, p_hora: '09:00', p_tutor: 'Tutora Cedo', p_telefone: fone(9), p_pet: 'Mel', p_porte: 'P' });
  T.ok('pedido fora do horário do serviço (09:00 na segunda): "ocupado"', fora.ok === false && fora.erro === 'ocupado', fora);
  const dentro = await pedir('link_pedir', { p_servico: HIDRA, p_dia: domingo, p_hora: '10:00', p_tutor: 'Tutora Domingo', p_telefone: fone(8), p_pet: 'Luna', p_porte: 'M' });
  T.ok('pedido no domingo, no horário da Hidratação: entra', dentro.ok === true, dentro);
  T.passa('o dono tira o horário próprio (volta a seguir o pet shop)', await dono.from('servicos').update({ horario: null }).eq('id', HIDRA).select('id'));
  T.ok('sem horário próprio, a Hidratação segue o pet shop: domingo sem horário, segunda o dia todo', (await horas(HIDRA, domingo)).length === 0 && (await horas(HIDRA, segunda))[0] === '08:00');

  T.secao('creche e hotel: seguem o pet shop, ou o horário deles');
  const cheios = async (tipo, de, ate) => ((await anon().rpc('link_estadia_cheios', { p_codigo: COD, p_tipo: tipo, p_de: de, p_ate: ate })).data ?? []).map(String);
  T.ok('a creche com horário próprio abre no domingo', !(await cheios('creche', domingo, domingo)).includes(domingo));
  B.must(await dono.from('petshops').update({ horario_creche: null }).eq('id', LOJA).select('id'), 'creche igual ao pet shop');
  T.ok('a creche sem horário próprio segue o pet shop: domingo fechado', (await cheios('creche', domingo, domingo)).includes(domingo));
  // lista de espera pelo link ligada (Meu pet shop, Opções da creche e do hotel)
  B.sql(`update petshops set opcoes = coalesce(opcoes, '{}'::jsonb) || '{"casa.espera": {"ativo": true, "link": true}}'::jsonb where id='${LOJA}'`);
  const esperaDom = await pedir('link_espera_pedir', { p_tipo: 'creche', p_entrada: domingo, p_saida: domingo, p_tutor: 'Tutor Espera', p_telefone: fone(7), p_pet: 'Rex' });
  T.ok('lista de espera da creche no domingo (segue o pet shop): "nao_abre"', esperaDom.ok === false && esperaDom.erro === 'nao_abre', esperaDom);
  const crecheDom = await pedir('link_pedir_estadia', { p_tipo: 'creche', p_entrada: domingo, p_saida: domingo, p_tutor: 'Tutor Creche', p_telefone: fone(6), p_pet: 'Fred', p_hora_entrada: '09:00', p_hora_saida: '17:00' });
  T.ok('creche no domingo (segue o pet shop): recusada', crecheDom.ok === false, crecheDom);
  B.must(await dono.from('petshops').update({ horario_creche: CRECHE_H }).eq('id', LOJA).select('id'), 'creche com horário próprio');
  const crecheDom2 = await pedir('link_pedir_estadia', { p_tipo: 'creche', p_entrada: domingo, p_saida: domingo, p_tutor: 'Tutor Creche', p_telefone: fone(5), p_pet: 'Fred', p_hora_entrada: '09:00', p_hora_saida: '17:00' });
  T.ok('creche no domingo com o horário dela: entra', crecheDom2.ok === true, crecheDom2);
  const crecheCedo = await pedir('link_pedir_estadia', { p_tipo: 'creche', p_entrada: segunda, p_saida: segunda, p_tutor: 'Tutor Cedo', p_telefone: fone(4), p_pet: 'Tico', p_hora_entrada: '07:00', p_hora_saida: '18:30' });
  T.ok('creche na segunda às 07:00 (o pet shop abre às 08:00, a creche às 07:00): entra', crecheCedo.ok === true, crecheCedo);

  const hotel = (entrada, saida, he, hs, n) => pedir('link_pedir_estadia', { p_tipo: 'hotel', p_entrada: entrada, p_saida: saida, p_tutor: 'Tutora Hotel', p_telefone: fone(n), p_pet: 'Nina', p_porte: 'M', p_hora_entrada: he, p_hora_saida: hs });
  const hDomFechado = await hotel(domingo, B.somaDias(domingo, 2), '09:00', '10:00', 3);
  T.ok('hotel sem horário próprio: chegada no domingo (pet shop fechado) é recusada', hDomFechado.ok === false && hDomFechado.erro === 'dia_fechado' && hDomFechado.quando === 'entrada', hDomFechado);
  T.passa('o dono põe o hotel recebendo no domingo (08:00 às 18:00)', await dono.from('petshops').update({ horario_hotel: CRECHE_H }).eq('id', LOJA).select('id'));
  const hDomCedo = await hotel(domingo, B.somaDias(domingo, 2), '07:30', '10:00', 2);
  T.ok('hotel: chegada no domingo antes das 08:00 é recusada com o horário do hotel', hDomCedo.ok === false && hDomCedo.erro === 'fora_do_horario' && hDomCedo.abre === '08:00' && hDomCedo.fecha === '18:00', hDomCedo);
  const hDomOk = await hotel(domingo, B.somaDias(domingo, 2), '09:00', '10:00', 1);
  T.ok('hotel: chegada no domingo às 09:00 entra', hDomOk.ok === true, hDomOk);
  const hSegCedo = await hotel(segunda, B.somaDias(segunda, 1), '07:00', '10:00', 0);
  T.ok('hotel na segunda às 07:00: o horário do hotel (07:00 às 19:00) vale, não o do pet shop', hSegCedo.ok === true, hSegCedo);
}))();
