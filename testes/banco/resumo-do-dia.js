// Resumo do dia no banco e na rota (migração 20261246): gestao_resumo_do_dia (uma leitura, com as permissões de cada pessoa),
// gestao_resumo_visto, gestao_resumo_votar, gestao_resumo_ia_reservar / _guardar e a rota /api/gestao/resumo-do-dia.
//
// A loja: hoje, Thor 09:00 (com o tosador, confirmado), Mel 10:30 (sem profissional, só marcado) e Bob 14:00 (com a dona,
// confirmado); amanhã, três horários só marcados com o tosador; a creche com a Luna e o hotel esperando o Rex; a Ana deve R$ 35
// há 40 dias; a conta de luz (R$ 312,40) vence hoje; o previsto de hoje soma a agenda, a creche e o hotel e o que vence hoje; o shampoo está abaixo do mínimo; o pet shop abre das 07:00 às 20:00 com
// almoço das 12:00 às 13:00 e o "Banho" tem horário próprio, das 06:00 às 21:00.
// Precisa do servidor com GESTAO_RESUMO_FALSO=1 (o texto da IA sai de respostaDeTeste, sem chamar o modelo).
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('resumo-do-dia');
const R = lib('resumo-do-dia');

const sessao = async (sb) => (await sb.auth.getSession()).data.session.access_token;
const rota = async (sb, P) => {
  const x = await fetch(`${B.BASE_URL}/api/gestao/resumo-do-dia`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(sb ? { Authorization: `Bearer ${await sessao(sb)}` } : {}) }, body: JSON.stringify({ petshopId: P }) });
  return { status: x.status, j: await x.json().catch(() => null) };
};

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Resumo', resumo: true });
  const { dono, caixa, tosador, monitor, estoque } = L.sb;
  const P = L.P;
  const ler = async (sb) => B.must(await sb.rpc('gestao_resumo_do_dia', { p: P }), 'gestao_resumo_do_dia');
  const uid = (papel) => B.sql(`select user_id from profissionais where id = '${L.ids[papel]}'`);
  /** Apaga o resumo e os votos de uma pessoa (ou de todos), como se ela nunca tivesse aberto. */
  const zerar = (papel) => B.sql(`delete from resumo_do_dia where petshop_id = '${P}' ${papel ? `and user_id = '${uid(papel)}'` : ''}; delete from resumo_dica_votos where petshop_id = '${P}' ${papel ? `and user_id = '${uid(papel)}'` : ''}`);
  /** Passa um dia: o que era de hoje vira de ontem (o resumo e os votos da loja). */
  const passarUmDia = () => B.sql(`update resumo_do_dia set dia = dia - 1000 where petshop_id = '${P}'; update resumo_do_dia set dia = dia + 999 where petshop_id = '${P}';
    update resumo_dica_votos set dia = dia - 1000 where petshop_id = '${P}'; update resumo_dica_votos set dia = dia + 999 where petshop_id = '${P}'`);
  const dow = (iso) => B.diaDaSemana(iso);

  // ---------- a loja ----------
  const horario = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), { abre: '07:00', fecha: '20:00', almoco: { de: '12:00', ate: '13:00' } }]));
  B.must(await dono.from('petshops').update({ horario }).eq('id', P).select('id'), 'horário com almoço');
  B.must(await dono.from('servicos').update({ horario: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), { abre: '06:00', fecha: '21:00' }])) }).eq('id', L.S.Banho).select('id'), 'horário do Banho');
  B.must(await dono.from('profissionais').update({ atende: true }).eq('id', L.ids.dono).select('id'), 'a dona atende');
  const ag = async (pet, dia, hora, extra = {}) => {
    const ini = B.instante(dia, hora, L.fuso);
    return B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: pet, servico_id: L.S.Banho, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 60, ...extra }).select('id').single(), 'horário').id;
  };
  await ag(L.pets.Thor, L.hoje, '09:00', { profissional_id: L.ids.tosador, status: 'confirmado' });
  await ag(L.pets.Mel, L.hoje, '10:30');
  await ag(L.pets.Bob, L.hoje, '14:00', { profissional_id: L.ids.dono, status: 'confirmado', preco: 70 });
  for (const [pet, hora] of [['Thor', '09:00'], ['Mel', '10:00'], ['Bob', '11:00']]) await ag(L.pets[pet], L.dia(1), hora, { profissional_id: L.ids.tosador });
  B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Luna, tipo: 'creche', status: 'em_casa', entrada: B.instante(L.hoje, '07:30', L.fuso).toISOString() }).select('id'), 'creche');
  B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Rex, tipo: 'hotel', status: 'reservada', entrada: B.instante(L.hoje, '18:00', L.fuso).toISOString(), saida_prevista: B.instante(L.dia(2), '10:00', L.fuso).toISOString() }).select('id'), 'hotel');
  B.sql(`insert into lancamentos (petshop_id, tipo, valor, categoria, descricao, data, vencimento, pago, cliente_id, origem) values
           ('${P}', 'entrada', 35, 'Banho e tosa', 'Banho', '${L.dia(-45)}', '${L.dia(-40)}', false, '${L.tutores.Ana}', 'tela'),
           ('${P}', 'saida', 312.40, 'Contas', 'Conta de luz', '${L.hoje}', '${L.hoje}', false, null, 'tela')`);
  B.must(await dono.from('produtos').update({ estoque: 1, estoque_minimo: 2 }).eq('id', L.prod).select('id'), 'shampoo abaixo do mínimo');

  T.secao('o dia do resumo começa às 05:00 no fuso do pet shop');
  const diaEm = (quando, fuso) => B.sql(`select public.resumo_dia_em(timestamptz '${quando}', '${fuso}')`);
  T.ok('04:59 em São Paulo ainda é o dia anterior', diaEm('2026-11-24 04:59 America/Sao_Paulo', 'America/Sao_Paulo') === '2026-11-23');
  T.ok('05:00 já é o dia', diaEm('2026-11-24 05:00 America/Sao_Paulo', 'America/Sao_Paulo') === '2026-11-24');
  T.ok('o fuso é o do pet shop (Manaus: 05:00 de lá)', diaEm('2026-11-24 05:30 America/Sao_Paulo', 'America/Manaus') === '2026-11-23' && diaEm('2026-11-24 06:00 America/Sao_Paulo', 'America/Manaus') === '2026-11-24');
  T.ok('a mesma conta no aplicativo (diaDoResumo)', R.diaDoResumo(new Date('2026-11-24T07:59:00Z'), 'America/Sao_Paulo') === '2026-11-23' && R.diaDoResumo(new Date('2026-11-24T08:00:00Z'), 'America/Sao_Paulo') === '2026-11-24');

  T.secao('a dona: tudo o que o pet shop tem hoje');
  const d = await ler(dono);
  T.ok('o dia, a data, a hora e o nome', d.dia === B.sql(`select public.resumo_dia_em(now(), '${L.fuso}')`) && d.hoje === L.hoje && /^\d\d:\d\d$/.test(d.agora) && d.dow === dow(L.hoje) && d.nome === 'Dona', [d.dia, d.hoje, d.agora, d.nome]);
  T.ok('ainda não viu, e vê a agenda do pet shop inteiro', d.visto === false && d.so_meus === false);
  T.ok('3 atendimentos, 1 sem confirmar', d.agenda.total === 3 && d.agenda.sem_confirmar === 1, d.agenda);
  T.ok('os horários em ordem, com hora, pet, serviço e situação', JSON.stringify(d.agenda.itens.map((i) => [i.ini, i.fim, i.pet, i.servico, i.status])) === JSON.stringify([['09:00', '10:00', 'Thor', 'Banho', 'confirmado'], ['10:30', '11:30', 'Mel', 'Banho', 'marcado'], ['14:00', '15:00', 'Bob', 'Banho', 'confirmado']]), d.agenda.itens);
  T.ok('a janela do dia junta o pet shop e o serviço com horário próprio (06:00 às 21:00) e traz o almoço do pet shop', d.agenda.janela.abre === '06:00' && d.agenda.janela.fecha === '21:00' && d.agenda.janela.almoco.de === '12:00' && d.agenda.janela.almoco.ate === '13:00', d.agenda.janela);
  const buracos = (x, agora = '05:00') => R.buracosDoDia(x.agenda, agora).map((b) => `${b.de}-${b.ate}`).join(' ');
  T.ok('buracos: 06:00-09:00, 13:00-14:00 (depois do almoço) e 15:00-21:00; meia hora livre e o almoço não entram', buracos(d) === '06:00-09:00 13:00-14:00 15:00-21:00', buracos(d));
  const bloqueio = B.must(await dono.from('bloqueios').insert({ petshop_id: P, inicio: B.instante(L.hoje, '16:00', L.fuso).toISOString(), fim: B.instante(L.hoje, '17:00', L.fuso).toISOString(), motivo: 'Dentista' }).select('id').single(), 'bloqueio').id;
  const comBloqueio = await ler(dono);
  T.ok('um bloqueio do pet shop (16:00 às 17:00) corta o buraco', JSON.stringify(comBloqueio.agenda.bloqueios) === '[["16:00","17:00"]]' && buracos(comBloqueio) === '06:00-09:00 13:00-14:00 15:00-16:00 17:00-21:00', [comBloqueio.agenda.bloqueios, buracos(comBloqueio)]);
  B.must(await dono.from('bloqueios').delete().eq('id', bloqueio).select('id'), 'tirar o bloqueio');
  B.sql(`insert into dias_especiais (petshop_id, dia, nome, fechado) values ('${P}', '${L.hoje}', 'Folga', true), ('${P}', '${L.dia(2)}', 'Feriado', true)`);
  const fechado = await ler(dono);
  T.ok('dia fechado (Meu pet shop): sem janela e sem buraco, os horários marcados continuam', fechado.agenda.janela === null && buracos(fechado) === '' && fechado.agenda.total === 3, fechado.agenda.janela);
  T.ok('a semana: 7 dias a partir de hoje, com a contagem; o dia fechado não abre', fechado.semana.length === 7 && fechado.semana[0].dia === L.hoje && fechado.semana[0].n === 3 && fechado.semana[1].n === 3
    && fechado.semana[2].aberto === false && fechado.semana[0].aberto === false && fechado.semana[3].aberto === true && fechado.semana[6].dia === L.dia(6) && fechado.semana.every((x) => x.dow === dow(x.dia)), fechado.semana);
  B.sql(`delete from dias_especiais where petshop_id = '${P}' and dia = '${L.hoje}'`);
  T.ok('creche e hotel: 1 na creche e 1 chegando no hotel', d.casa.creche === 1 && d.casa.hotel === 1, d.casa);
  T.ok('dinheiro: previsto R$ 260,00 (agenda 60 + 60 + 70 e a diária de creche avulsa da Luna, 70), a conta de luz de hoje e a Ana devendo R$ 35,00', Number(d.dinheiro.previsto) === 260
    && Number(d.dinheiro.previsto_de.agenda) === 190 && Number(d.dinheiro.previsto_de.casa) === 70 && Number(d.dinheiro.previsto_de.receber) === 0 && d.dinheiro.casa_nome === 'Creche e hotel' && d.dinheiro.contas_hoje.quantas === 1 && Number(d.dinheiro.contas_hoje.valor) === 312.4
    && d.dinheiro.contas_hoje.nome === 'Conta de luz' && d.dinheiro.devendo.clientes === 1 && Number(d.dinheiro.devendo.valor) === 35, d.dinheiro);
  T.ok('a folha escreve o dinheiro com esses números', R.linhasDoDinheiro(d).map((l) => `${l.texto} ${l.valor.replace(/\u00a0/g, ' ')}`).join(' | ') === 'Previsto para entrar hoje R$ 260,00 | Conta de luz vence hoje R$ 312,40 | 1 cliente devendo R$ 35,00'
    && R.linhasDoDinheiro(d)[0].detalhe.replace(/\u00a0/g, ' ') === 'Agenda R$ 190,00 · Creche e hotel R$ 70,00');
  T.ok('o Rex, que só chega hoje no hotel (reserva), não entra no previsto', Number(d.dinheiro.previsto_de.casa) === 70);
  T.ok('não é conta nova e nada falta', d.conta_nova === false && d.falta.length === 0);
  T.ok('as linhas do Bom dia vêm junto (mesmas permissões)', d.bom_dia && d.bom_dia.dia === L.hoje && Array.isArray(d.bom_dia.agenda));

  T.secao('cada pessoa vê só o que pode');
  const dc = await ler(caixa), dt = await ler(tosador), dm = await ler(monitor), de = await ler(estoque);
  T.ok('recepção (Caixa): vê o dinheiro do dia e quem deve, não as contas a pagar', dc.dinheiro && Number(dc.dinheiro.previsto) === 260 && dc.dinheiro.devendo.clientes === 1 && !('contas_hoje' in dc.dinheiro), dc.dinheiro);
  T.ok('tosador: sem dinheiro nenhum', !('dinheiro' in dt) && dt.areas.dinheiro === false && dt.areas.financeiro === false && !('devem' in dt.bom_dia) && !('contas_fixas' in dt.bom_dia), Object.keys(dt));
  T.ok('tosador: só a própria agenda (o dele e o sem profissional): Thor e Mel, sem o Bob', dt.so_meus === true && dt.agenda.total === 2 && dt.agenda.itens.map((i) => i.pet).join() === 'Thor,Mel' && dt.agenda.sem_confirmar === 1, dt.agenda);
  T.ok('tosador: a semana conta só os horários dele', dt.semana[0].n === 2 && dt.semana[1].n === 3, dt.semana);
  T.ok('tosador: sem creche e hotel, sem a lista de quem chamar', !('casa' in dt) && !('chamar' in dt));
  T.ok('a recepção, que não atende, vê a agenda inteira', dc.so_meus === false && dc.agenda.total === 3);
  T.ok('monitor: só a casa (sem agenda, semana e dinheiro)', dm.casa.creche === 1 && !('agenda' in dm) && !('semana' in dm) && !('dinheiro' in dm), Object.keys(dm));
  T.ok('estoque: sem agenda, casa e dinheiro', !('agenda' in de) && !('casa' in de) && !('dinheiro' in de), Object.keys(de));
  T.ok('a folha do tosador não tem linha de dinheiro e diz "atendimentos seus"', R.linhasDoDinheiro(dt).length === 0 && R.numerosDeHoje(dt)[0].rotulo === 'atendimentos seus' && R.numerosDeHoje(dt).length === 2);

  T.secao('previsto para entrar hoje: creche e hotel, contas a receber de hoje, sem contar duas vezes');
  const previsto = async (sb = dono) => { const x = (await ler(sb)).dinheiro; return x ? `${Number(x.previsto)}=${Number(x.previsto_de.agenda)}+${Number(x.previsto_de.casa)}+${Number(x.previsto_de.receber)}` : 'sem dinheiro'; };
  const zelia = B.must(await dono.from('clientes').insert({ petshop_id: P, nome: 'Zélia Rocha', telefone: '11988880020' }).select('id').single(), 'Zélia').id;
  const fumaca = B.must(await dono.from('pets').insert({ petshop_id: P, cliente_id: zelia, nome: 'Fumaça', especie: 'cao', porte: 'M' }).select('id').single(), 'Fumaça').id;
  const tico = B.must(await dono.from('pets').insert({ petshop_id: P, cliente_id: zelia, nome: 'Tico', especie: 'cao', porte: 'M' }).select('id').single(), 'Tico').id;
  // Fumaça está no hotel há 2 noites (R$ 120 a diária) e sai hoje
  const hospedada = B.sql(`insert into estadias (petshop_id, pet_id, tipo, status, entrada, saida_prevista, valor_diaria)
    values ('${P}', '${fumaca}', 'hotel', 'em_casa', (date '${L.dia(-2)}' + time '10:00') at time zone '${L.fuso}', (date '${L.hoje}' + time '12:00') at time zone '${L.fuso}', 120) returning id`).split('\n')[0];
  T.ok('a conta da reserva (hotel_previsto) dá R$ 240,00: 2 noites de R$ 120,00', B.num(`select public.hotel_previsto('${hospedada}')`) === 240);
  T.ok('quem sai hoje do hotel entra pelo que falta receber: 260 + 240 = 500', (await previsto()) === '500=190+310+0', await previsto());
  // o Tico é mensalista da creche: o dia de hoje é cobrado na cobrança do mês
  B.sql(`insert into estadias (petshop_id, pet_id, tipo, status, entrada, mensalista, dia) values ('${P}', '${tico}', 'creche', 'em_casa', (date '${L.hoje}' + time '08:00') at time zone '${L.fuso}', 'extra', '${L.hoje}')`);
  T.ok('mensalista da creche não entra (é cobrado por mês)', (await previsto()) === '500=190+310+0', await previsto());
  // sinal de R$ 50,00 combinado e ainda não pago, com vencimento hoje: faz parte da conta do hotel, não entra de novo como "a receber"
  const sinal = B.sql(`insert into lancamentos (petshop_id, tipo, valor, categoria, descricao, data, vencimento, pago, cliente_id, origem)
    values ('${P}', 'entrada', 50, 'Creche e hotel', 'Sinal da reserva: hotel de Fumaça', '${L.hoje}', '${L.hoje}', false, '${zelia}', 'tela') returning id`).split('\n')[0];
  B.sql(`insert into estadias_valores (estadia_id, petshop_id, sinal, sinal_estado, sinal_lancamento_id) values ('${hospedada}', '${P}', 50, 'a_receber', '${sinal}')
         on conflict (estadia_id) do update set sinal = 50, sinal_estado = 'a_receber', sinal_lancamento_id = '${sinal}'`);
  T.ok('sinal a receber da estadia que sai hoje não é contado duas vezes', (await previsto()) === '500=190+310+0', await previsto());
  B.sql(`update estadias_valores set sinal_recebido = 50, sinal_estado = 'pago', sinal_pago_em = '${L.hoje}' where estadia_id = '${hospedada}'; update lancamentos set pago = true, pago_em = '${L.hoje}' where id = '${sinal}'`);
  const recebido = B.num(`select sinal_recebido from estadias_valores where estadia_id = '${hospedada}'`);
  T.ok('sinal já recebido (R$ 50,00) sai do previsto: 240 − 50 = 190 do hotel', recebido === 50 && (await previsto()) === '450=190+260+0', [recebido, await previsto()]);
  // contas a receber que vencem hoje: o fiado do Beto (R$ 45,00) entra; a conta do banho do Thor de hoje (já está na agenda) não
  const thorHoje = B.sql(`select id from agendamentos where petshop_id = '${P}' and pet_id = '${L.pets.Thor}' and inicio >= (date '${L.hoje}') at time zone '${L.fuso}' and inicio < (date '${L.dia(1)}') at time zone '${L.fuso}'`);
  B.sql(`insert into lancamentos (petshop_id, tipo, valor, categoria, descricao, data, vencimento, pago, cliente_id, origem, agendamento_id) values
           ('${P}', 'entrada', 45, 'Banho e tosa', 'Banho', '${L.dia(-10)}', '${L.hoje}', false, '${L.tutores.Beto}', 'tela', null),
           ('${P}', 'entrada', 60, 'Banho e tosa', 'Banho do Thor', '${L.hoje}', '${L.hoje}', false, '${L.tutores.Ana}', 'tela', '${thorHoje}'),
           ('${P}', 'entrada', 99, 'Banho e tosa', 'Banho', '${L.dia(-10)}', '${L.dia(1)}', false, '${L.tutores.Beto}', 'tela', null)`);
  T.ok('conta a receber que vence hoje entra (R$ 45,00); a do horário de hoje e a que vence amanhã não', (await previsto()) === '495=190+260+45', await previsto());
  const comTudo = await ler(dono);
  T.ok('a folha mostra o total numa linha só, com as três origens em texto pequeno', R.linhasDoDinheiro(comTudo)[0].valor.replace(/\u00a0/g, ' ') === 'R$ 495,00'
    && R.linhasDoDinheiro(comTudo)[0].detalhe.replace(/\u00a0/g, ' ') === 'Agenda R$ 190,00 · Creche e hotel R$ 260,00 · A receber R$ 45,00', R.linhasDoDinheiro(comTudo)[0]);
  T.ok('os fatos da IA levam o mesmo total, e os números dele valem na conferência', R.fatosParaIA(comTudo).previsto_para_entrar_hoje.total.replace(/\u00a0/g, ' ') === 'R$ 495,00' && R.numerosDosFatos(R.fatosParaIA(comTudo)).has(495));
  T.ok('a recepção (Caixa) vê o mesmo previsto', (await previsto(caixa)) === '495=190+260+45');
  T.ok('tosador, monitor e estoque continuam sem nada de dinheiro', (await previsto(tosador)) === 'sem dinheiro' && (await previsto(monitor)) === 'sem dinheiro' && (await previsto(estoque)) === 'sem dinheiro'
    && !('previsto_para_entrar_hoje' in R.fatosParaIA(await ler(tosador))));
  B.must(await dono.from('petshops').update({ modulos: ['banho_tosa'] }).eq('id', P).select('id'), 'só banho e tosa');
  T.ok('pet shop que não usa creche nem hotel: a casa não entra no previsto', (await previsto()) === '235=190+0+45', await previsto());
  B.must(await dono.from('petshops').update({ modulos: ['banho_tosa', 'creche', 'hotel', 'loja'] }).eq('id', P).select('id'), 'módulos de volta');
  // o que este bloco criou sai, para o resto do arquivo seguir com a loja de antes
  B.sql(`set session_replication_role = replica;
    delete from estadias_valores where petshop_id = '${P}' and estadia_id = '${hospedada}';
    delete from estadias where petshop_id = '${P}' and pet_id in ('${fumaca}', '${tico}');
    delete from lancamentos where petshop_id = '${P}' and (id = '${sinal}' or valor in (45, 60, 99));
    set session_replication_role = origin;`);
  T.ok('de volta ao previsto de antes', (await previsto()) === '260=190+70+0', await previsto());

  T.secao('outra loja não lê nada');
  const X = await criarLoja(T, { nome: 'Resumo Outra', equipe: false, dados: false, resumo: true });
  const deFora = await X.sb.dono.rpc('gestao_resumo_do_dia', { p: P });
  T.ok('quem não é da equipe recebe vazio', !deFora.error && deFora.data === null, deFora);
  T.ok('… e não marca visto, não vota e não reserva a vez da IA', (await X.sb.dono.rpc('gestao_resumo_visto', { p: P })).data === false
    && (await X.sb.dono.rpc('gestao_resumo_votar', { p: P, p_tipo: 'retorno', p_voto: 'util' })).data.ok === false
    && (await X.sb.dono.rpc('gestao_resumo_ia_reservar', { p: P })).data.ok === false
    && (await X.sb.dono.rpc('gestao_resumo_ia_guardar', { p: P, p_estado: 'feito', p_frase: 'oi' })).data === false);
  const linhasDeFora = await X.sb.dono.from('resumo_do_dia').select('dia').eq('petshop_id', P);
  T.ok('as tabelas do resumo desta loja não aparecem para a outra', !linhasDeFora.error && linhasDeFora.data.length === 0 && (await X.sb.dono.from('resumo_dica_votos').select('dia').eq('petshop_id', P)).data.length === 0);
  const meus = await dono.from('resumo_do_dia').select('user_id').eq('petshop_id', P);
  T.ok('cada um lê só a própria linha (a dona não vê a do tosador)', meus.data.length === 1 && meus.data[0].user_id === uid('dono'), meus.data);
  T.recusa('ninguém grava direto na tabela do resumo', await dono.from('resumo_do_dia').update({ visto_em: null }).eq('petshop_id', P).select('dia'));
  T.recusa('… nem nos votos', await dono.from('resumo_dica_votos').insert({ petshop_id: P, user_id: uid('dono'), tipo: 'retorno', dia: L.hoje, voto: 'util' }).select('dia'));
  const anon = B.cliente();
  T.recusa('sem login, a leitura é recusada', await anon.rpc('gestao_resumo_do_dia', { p: P }));
  T.recusa('… e o voto também', await anon.rpc('gestao_resumo_votar', { p: P, p_tipo: 'retorno', p_voto: 'util' }));

  T.secao('já viu hoje: por pessoa e pet shop, no banco');
  T.ok('a dona marca que viu', (await dono.rpc('gestao_resumo_visto', { p: P })).data === true && (await ler(dono)).visto === true);
  const outroAparelho = await require('../lib/semente').logar(L.emails.dono);
  T.ok('em outro aparelho (outra sessão da mesma pessoa), já consta como visto', (await ler(outroAparelho)).visto === true);
  T.ok('o tosador ainda não viu', (await ler(tosador)).visto === false);
  B.sql(`update resumo_do_dia set dia = dia - 1 where petshop_id = '${P}' and user_id = '${uid('dono')}'`);
  T.ok('no dia seguinte, volta a não ter visto', (await ler(dono)).visto === false);
  zerar();

  T.secao('a dica do dia: escolhida no banco, uma por dia');
  let x = await ler(dono);
  T.ok('a dona recebe "muitos horários sem confirmar" (a de maior prioridade), com os números e a ação', x.dica && x.dica.tipo === 'sem_confirmar' && [3, 4].includes(x.dica.dados.n) && x.dica.dados.total >= x.dica.dados.n
    && x.dica.acao.tipo === 'ir' && x.dica.acao.rota === '/gestao/app/mensagens' && x.dica.voto === null, x.dica);
  T.ok('o texto sem IA usa só esses números', R.textoDaDicaSemIA(x.dica).startsWith(`${x.dica.dados.n} dos ${x.dica.dados.total} horários de hoje e de amanhã`));
  T.ok('a escolha fica guardada e não muda ao rever', (await ler(dono)).dica.tipo === 'sem_confirmar' && B.sql(`select dica_tipo || '|' || dica_chave from resumo_do_dia where petshop_id = '${P}' and user_id = '${uid('dono')}'`) === 'sem_confirmar|sem_confirmar');
  T.ok('tosador: a dica é da agenda dele, nunca de dinheiro nem de estoque', dt.dica && dt.dica.tipo === 'sem_confirmar', dt.dica);
  T.ok('monitor: nenhum achado para ele, nenhuma dica', dm.dica === null);
  T.ok('estoque: "produto perto de acabar", com o nome', de.dica && de.dica.tipo === 'estoque_baixo' && de.dica.dados.n === 1 && de.dica.dados.primeiro === 'Shampoo Neutro' && de.dica.acao.rota === '/gestao/app/estoque', de.dica);

  T.secao('"Não quero esse tipo", "Útil" e não repetir');
  T.ok('voto com tipo ou valor estranho é recusado', (await dono.rpc('gestao_resumo_votar', { p: P, p_tipo: 'qualquer', p_voto: 'util' })).data.ok === false && (await dono.rpc('gestao_resumo_votar', { p: P, p_tipo: 'retorno', p_voto: 'talvez' })).data.ok === false);
  T.ok('"Não quero esse tipo" fica anotado na dica de hoje', (await dono.rpc('gestao_resumo_votar', { p: P, p_tipo: 'sem_confirmar', p_voto: 'nao_quero' })).data.ok === true && (await ler(dono)).dica.voto === 'nao_quero');
  passarUmDia();
  x = await ler(dono);
  T.ok('no dia seguinte o tipo silenciado não volta: vem "clientes devendo há muito tempo" (R$ 35,00, 1 cliente, mais de 30 dias)', x.dica && x.dica.tipo === 'devendo_antigo' && x.dica.dados.clientes === 1 && Number(x.dica.dados.valor) === 35 && x.dica.dados.dias === 30 && x.dica.acao.rota === '/gestao/app/financeiro', x.dica);
  passarUmDia();
  x = await ler(dono);
  T.ok('o mesmo achado não aparece em dois dias seguidos: hoje vem o estoque', x.dica && x.dica.tipo === 'estoque_baixo', x.dica);
  passarUmDia();
  x = await ler(dono);
  T.ok('… e no outro dia o de antes pode voltar', x.dica && x.dica.tipo === 'devendo_antigo', x.dica);
  zerar('dono');
  B.sql(`insert into resumo_dica_votos (petshop_id, user_id, tipo, dia, voto) values ('${P}', '${uid('dono')}', 'sem_confirmar', current_date - 3, 'nao_quero'), ('${P}', '${uid('dono')}', 'estoque_baixo', current_date - 3, 'util')`);
  x = await ler(dono);
  T.ok('"Útil" sobe a prioridade do tipo: o estoque (40 + 10) passa na frente de quem deve (45)', x.dica && x.dica.tipo === 'estoque_baixo', x.dica);
  zerar('dono');
  B.sql(`insert into resumo_dica_votos (petshop_id, user_id, tipo, dia, voto) values ('${P}', '${uid('dono')}', 'sem_confirmar', current_date - 95, 'nao_quero')`);
  T.ok('o silêncio vale 90 dias: depois disso o tipo volta', (await ler(dono)).dica.tipo === 'sem_confirmar');
  zerar('dono');
  B.sql(`insert into resumo_dica_votos (petshop_id, user_id, tipo, dia, voto) values ('${P}', '${uid('dono')}', 'sem_confirmar', current_date - 9, 'nao_quero'), ('${P}', '${uid('dono')}', 'sem_confirmar', current_date - 2, 'util')`);
  T.ok('um "Útil" depois do "Não quero" desfaz o silêncio', (await ler(dono)).dica.tipo === 'sem_confirmar');
  T.ok('o voto de uma pessoa não muda a dica da outra', (await ler(caixa)).dica.tipo === 'sem_confirmar');

  T.secao('quem está no prazo de voltar e o período vazio');
  T.ok('sem histórico, ninguém para chamar', Array.isArray(d.chamar) && d.chamar.length === 0, d.chamar);
  const eva = B.must(await dono.from('clientes').insert({ petshop_id: P, nome: 'Eva Prado', telefone: '11988880009' }).select('id').single(), 'Eva').id;
  const kiko = B.must(await dono.from('pets').insert({ petshop_id: P, cliente_id: eva, nome: 'Kiko', especie: 'cao', porte: 'P' }).select('id').single(), 'Kiko').id;
  const fabio = B.must(await dono.from('clientes').insert({ petshop_id: P, nome: 'Fábio Nunes', telefone: '11988880010' }).select('id').single(), 'Fábio').id;
  const pipa = B.must(await dono.from('pets').insert({ petshop_id: P, cliente_id: fabio, nome: 'Pipa', especie: 'cao', porte: 'P' }).select('id').single(), 'Pipa').id;
  const gil = B.must(await dono.from('clientes').insert({ petshop_id: P, nome: 'Gil Costa', telefone: '11988880011' }).select('id').single(), 'Gil').id;
  const nina = B.must(await dono.from('pets').insert({ petshop_id: P, cliente_id: gil, nome: 'Nina', especie: 'cao', porte: 'P' }).select('id').single(), 'Nina').id;
  const visita = (pet, dias) => `('${P}', '${pet}', '${L.S.Banho}', (date '${L.dia(-dias)}' + time '09:00') at time zone '${L.fuso}', (date '${L.dia(-dias)}' + time '10:00') at time zone '${L.fuso}', 'concluido')`;
  const novoPet = async (tutor, tel, pet) => {
    const c = B.must(await dono.from('clientes').insert({ petshop_id: P, nome: tutor, telefone: tel }).select('id').single(), tutor).id;
    return [c, B.must(await dono.from('pets').insert({ petshop_id: P, cliente_id: c, nome: pet, especie: 'cao', porte: 'P' }).select('id').single(), pet).id];
  };
  const [hugo, toto] = await novoPet('Hugo Maia', '11988880012', 'Totó');
  const [iara, zeca] = await novoPet('Iara Luz', '11988880013', 'Zeca');
  // Kiko, Totó e Zeca: a cada 14 dias, a última há 30 (passou de 14 + 5); Pipa: igual, mas o tutor não quer mensagens; Luna: igual, mas
  // está na creche hoje; Nina: a cada 14, a última há 16 (ainda no prazo)
  B.sql(`insert into agendamentos (petshop_id, pet_id, servico_id, inicio, fim, status) values
    ${[kiko, toto, zeca, pipa, L.pets.Luna].flatMap((pet) => [58, 44, 30].map((n) => visita(pet, n))).join(',\n')},
    ${[44, 30, 16].map((n) => visita(nina, n)).join(',\n')}`);
  B.sql(`update clientes set nao_quer_mensagens = true where id = '${fabio}'`);
  x = await ler(caixa);
  T.ok('3 clientes no prazo de voltar (Eva, Hugo e Iara); quem não quer mensagens, quem está na creche e quem ainda está no intervalo ficam de fora', [...x.chamar].sort().join() === [eva, hugo, iara].sort().join(), x.chamar);
  await ag(zeca, L.dia(3), '15:00', { profissional_id: L.ids.dono, status: 'confirmado' });
  T.ok('quem já tem horário marcado para a frente sai da lista', [...(await ler(caixa)).chamar].sort().join() === [eva, hugo].sort().join());
  B.sql(`delete from agendamentos where petshop_id = '${P}' and pet_id = '${zeca}' and inicio > now() + interval '2 days'`);
  zerar('dono');
  B.sql(`insert into resumo_dica_votos (petshop_id, user_id, tipo, dia, voto) values ('${P}', '${uid('dono')}', 'sem_confirmar', current_date - 3, 'nao_quero')`);
  x = await ler(dono);
  T.ok('com 3 clientes, vira a dica "passaram do intervalo habitual", com a ação de chamar os 3', x.dica && x.dica.tipo === 'retorno' && x.dica.dados.n === 3 && x.dica.acao.tipo === 'chamar' && [...x.dica.acao.clientes].sort().join() === [eva, hugo, iara].sort().join(), x.dica);
  T.ok('… e o botão diz "Chamar os 3"', R.rotuloDaAcao(x.dica) === 'Chamar os 3');
  T.ok('o tosador não recebe a lista de clientes para chamar', !('chamar' in (await ler(tosador))));
  // oito manhãs seguidas com horário (todas as manhãs da semana com movimento) e nenhuma tarde nas últimas 4 semanas
  B.sql(`insert into agendamentos (petshop_id, pet_id, servico_id, inicio, fim, status) values ${[1, 2, 3, 4, 5, 6, 7, 8].map((n) => visita(L.pets.Thor, n)).join(',\n')}`);
  zerar('dono');
  B.sql(`insert into resumo_dica_votos (petshop_id, user_id, tipo, dia, voto) values ('${P}', '${uid('dono')}', 'sem_confirmar', current_date - 3, 'nao_quero'), ('${P}', '${uid('dono')}', 'retorno', current_date - 3, 'nao_quero')`);
  x = await ler(dono);
  T.ok('período vazio: a tarde do dia da semana de amanhã, sem horário há 4 semanas, com quem chamar', x.dica && x.dica.tipo === 'periodo_vazio' && x.dica.chave === `${dow(L.dia(1))}-tarde` && x.dica.dados.semanas === 4
    && x.dica.dados.periodo === 'tarde' && x.dica.dados.chamar === 3 && x.dica.acao.tipo === 'chamar' && x.dica.acao.clientes.length === 3, x.dica);
  T.ok('… e o texto diz o dia e o período, sem promessa', /^(Suas|Seus) \S+ à tarde ficaram sem nenhum horário nas últimas 4 semanas\. 3 clientes já passaram/.test(R.textoDaDicaSemIA(x.dica)), R.textoDaDicaSemIA(x.dica));
  passarUmDia();
  x = await ler(dono);
  T.ok('no dia seguinte, outro período vazio pode vir, mas não o mesmo', x.dica && (x.dica.tipo !== 'periodo_vazio' || x.dica.chave !== `${dow(L.dia(1))}-tarde`), x.dica);

  T.secao('conta nova: o que falta no cadastro');
  const N = await criarLoja(T, { nome: 'Resumo Nova', equipe: false, dados: false, resumo: true });
  B.must(await N.sb.dono.from('petshops').update({ link_ativo: false }).eq('id', N.P).select('id'), 'link desligado');
  B.sql(`update servicos set preco_p = null, preco_m = null, preco_g = null, preco_gg = null where petshop_id = '${N.P}'`);
  const nova = B.must(await N.sb.dono.rpc('gestao_resumo_do_dia', { p: N.P }), 'conta nova');
  const servicosSemPreco = B.num(`select count(*) from servicos where petshop_id = '${N.P}' and ativo and categoria not in ('creche', 'hotel')`);
  T.ok('conta sem horário nem estadia: falta preço, primeiro pet e ligar o link', nova.conta_nova === true && nova.falta.map((f) => f.chave).join() === 'precos,pet,link' && nova.falta[0].n === servicosSemPreco, nova.falta);
  T.ok('a dica de começo é a primeira coisa que falta (os preços), com a ação', nova.dica && nova.dica.tipo === 'cadastro' && nova.dica.chave === 'precos' && nova.dica.dados.n === servicosSemPreco && nova.dica.acao.tipo === 'ir', nova.dica);
  T.ok('a frase e o texto de começo', R.fraseSemIA(nova) === 'Faltam poucos passos para o primeiro atendimento.' && R.textoDaDicaSemIA(nova.dica).startsWith(`${servicosSemPreco} serviços ainda estão sem preço`));

  T.secao('o texto do Mozart (rota, com a IA de teste)');
  zerar();
  const usoDe = (loja) => B.sql(`select coalesce((select pedidos || '/' || chamadas from assistente_uso where petshop_id = '${loja}' and canal = 'mozart' and dia = (now() at time zone '${L.fuso}')::date), '0/0')`);
  T.ok('sem login: 401', (await rota(null, P)).status === 401);
  T.ok('quem é de outra loja: 403', (await rota(X.sb.dono, P)).status === 403);
  const antes = usoDe(P);
  const r1 = await rota(dono, P);
  T.ok('a rota devolve a frase e a dica escritas pela IA de teste', r1.status === 200 && r1.j.ia === true && /pelo Mozart de teste\.$/.test(r1.j.frase) && /Texto do Mozart de teste\.$/.test(r1.j.dica), r1);
  const [p0, c0] = antes.split('/').map(Number), [p1, c1] = usoDe(P).split('/').map(Number);
  T.ok('contou um pedido e uma chamada na cota do Mozart do pet shop', p1 === p0 + 1 && c1 === c0 + 1, [antes, usoDe(P)]);
  x = await ler(dono);
  T.ok('o texto ficou guardado no resumo de hoje da pessoa', x.ia.estado === 'feito' && x.ia.frase === r1.j.frase && x.ia.dica === r1.j.dica, x.ia);
  const r2 = await rota(dono, P);
  T.ok('de novo no mesmo dia: o mesmo texto, sem contar outra vez', r2.j.ia === true && r2.j.frase === r1.j.frase && usoDe(P) === `${p1}/${c1}`, [r2.j, usoDe(P)]);
  T.ok('a vez é uma por dia: reservar de novo é recusado', (await dono.rpc('gestao_resumo_ia_reservar', { p: P })).data.ok === false);
  T.ok('guardar sem ter reservado não grava nada', (await caixa.rpc('gestao_resumo_ia_guardar', { p: P, p_estado: 'feito', p_frase: 'texto solto' })).data === false && (await ler(caixa)).ia.frase === null);
  // sem cota: o pet shop já usou o que cabia hoje
  B.sql(`insert into assistente_uso (petshop_id, canal, dia, pedidos, chamadas) values ('${P}', 'mozart', (now() at time zone '${L.fuso}')::date, 99999, 99999)
         on conflict (petshop_id, canal, dia) do update set pedidos = 99999, chamadas = 99999`);
  const semCota = await rota(caixa, P);
  T.ok('sem cota: a rota responde sem IA (limite) e a folha fica com o texto sem IA', semCota.status === 200 && semCota.j.ia === false && semCota.j.motivo === 'limite', semCota);
  T.ok('… e a vez volta, para tentar mais tarde', B.sql(`select coalesce(ia_estado, 'livre') from resumo_do_dia where petshop_id = '${P}' and user_id = '${uid('caixa')}'`) === 'livre');
  B.sql(`delete from assistente_uso where petshop_id = '${P}' and canal = 'mozart'`);
  const depois = await rota(caixa, P);
  T.ok('com a cota de volta, a mesma pessoa recebe o texto', depois.j.ia === true && /pelo Mozart de teste/.test(depois.j.frase), depois);
  const rt = await rota(tosador, P);
  T.ok('tosador: o texto dele não fala de dinheiro', rt.j.ia === true && !/R\$|deve|190|312/.test(rt.j.frase + rt.j.dica), rt.j);

  // teste grátis com o e-mail do dono sem confirmar: a mesma regra do Mozart (migração 20261245)
  const SE = await criarLoja(T, { nome: 'Resumo Sem Email', equipe: false, dados: false, emailSemConfirmar: true, resumo: true });
  const se = await rota(SE.sb.dono, SE.P);
  T.ok('e-mail do dono não confirmado: sem IA (motivo e-mail), nada contado', se.status === 200 && se.j.ia === false && se.j.motivo === 'email' && usoDe(SE.P) === '0/0', se);

  // a IA inventa um número: o texto é descartado
  const I = await criarLoja(T, { nome: `Resumo ${R.MARCA_IA_INVENTA}`, equipe: false, resumo: true });
  const inv = await rota(I.sb.dono, I.P);
  T.ok('número inventado pela IA: o texto é descartado (sem IA)', inv.status === 200 && inv.j.ia === false && inv.j.motivo === 'invalido', inv);
  const di = B.must(await I.sb.dono.rpc('gestao_resumo_do_dia', { p: I.P }), 'loja que inventa');
  T.ok('… nada da IA fica guardado e a folha usa o texto sem IA', di.ia.estado === 'falhou' && di.ia.frase === null && !/97/.test(R.fraseSemIA(di)), di.ia);
  T.ok('… e não tenta de novo no mesmo dia', (await rota(I.sb.dono, I.P)).j.motivo === 'ja' && usoDe(I.P) === '1/1', usoDe(I.P));

  T.secao('grants');
  const grants = B.sql(`select p.proname || ':' || coalesce((select string_agg(r.rolname, ',' order by r.rolname) from pg_roles r where r.rolname in ('anon', 'authenticated', 'public') and has_function_privilege(r.rolname, p.oid, 'execute')), '')
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'gestao_resumo%' order by 1`).split('\n');
  T.ok('as funções do resumo só para quem tem login (nada para anon nem public)', grants.length === 5 && grants.every((g) => g.endsWith(':authenticated')), grants);
  T.ok('security definer com search_path vazio', B.num(`select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname like 'gestao_resumo%' and p.prosecdef and p.proconfig @> array['search_path=""']`) === 5,
    B.sql(`select proname || ' ' || prosecdef || ' ' || coalesce(proconfig::text, '') from pg_proc where pronamespace = 'public'::regnamespace and proname like 'gestao_resumo%'`));
  T.ok('RLS ligado nas duas tabelas, sem nada para anon', B.sql(`select string_agg(relname || ':' || relrowsecurity, ',' order by relname) from pg_class where relname in ('resumo_do_dia', 'resumo_dica_votos') and relnamespace = 'public'::regnamespace`) === 'resumo_dica_votos:true,resumo_do_dia:true'
    && B.num(`select count(*) from information_schema.role_table_grants where table_schema = 'public' and table_name in ('resumo_do_dia', 'resumo_dica_votos') and grantee in ('anon', 'PUBLIC')`) === 0);
}))();
