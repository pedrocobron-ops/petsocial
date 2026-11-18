// Quadro de atendimento e leva e traz (migração 20261203): quem move o pet no quadro (área Agenda; monitora, estoque, outro pet shop e
// anônimo não), as colunas pelo status + etapa (o status continua com o mesmo sentido), a chegada anotada por qualquer tela (gatilho),
// voltar para Esperando devolve o status de antes, Entregue conclui o atendimento sem cobrar (rodada 9: antes ficava em atendimento
// e ninguém cobrava), dois toques = uma mudança (a hora fica a do primeiro),
// as viagens do leva e traz (buscar/levar, desfazer, levar = entregue no quadro), ninguém grava direto nas tabelas, a taxa de leva e
// traz fora das opções de quem não recebe e as contas do app (quadro.ts): colunas, próxima etapa, viagens, rota e taxa por bairro.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('quadro-taxi');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Quadro' });
  const Bl = await criarLoja(T, { nome: 'Quadro B', equipe: false, dados: false });
  const { dono, tosador, monitor: mon, estoque, caixa } = L.sb;
  const outro = Bl.sb.dono, anon = B.cliente();
  const P = L.P;
  const Q = lib('quadro');

  const marcar = async (pet, hora, o = {}, dia = L.hoje) => {
    const ini = B.instante(dia, hora, L.fuso);
    return B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets[pet], servico_id: L.S['Banho e tosa'], profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 90, ...o }).select('id').single(), 'horário ' + pet).id;
  };
  const thor = await marcar('Thor', '08:00', { leva_traz: true, endereco_leva_traz: 'Rua das Flores, 10 - Centro' });
  const mel = await marcar('Mel', '09:00', { servico_id: L.S.Banho });
  const rex = await marcar('Rex', '10:00', { leva_traz: true, endereco_leva_traz: 'Av. Brasil, 500 - Jardim América' });
  const luna = await marcar('Luna', '11:00', { status: 'cancelado' });
  const bob = await marcar('Bob', '09:00', {}, L.dia(1));
  const mover = (sb, id, para) => sb.rpc('quadro_mover', { p_petshop: P, p_agendamento: id, p_para: para });
  const linha = (id) => B.sql(`select coalesce(etapa,'-') || '|' || (chegou_em is not null) || '|' || coalesce(status_antes,'-') || '|' || (entregue_em is not null) from quadro_atendimento where agendamento_id='${id}'`);
  const status = (id) => B.sql(`select status from agendamentos where id='${id}'`);

  T.secao('quem mexe no quadro');
  T.recusa('a monitora (sem agenda) não move', await mover(mon, thor, 'banho'), /agenda/);
  T.recusa('quem só cuida do estoque não move', await mover(estoque, thor, 'banho'), /agenda/);
  T.recusa('outro pet shop não move', await outro.rpc('quadro_mover', { p_petshop: P, p_agendamento: thor, p_para: 'banho' }), /agenda/);
  T.recusa('outro pet shop não move pelo id do próprio pet shop', await outro.rpc('quadro_mover', { p_petshop: Bl.P, p_agendamento: thor, p_para: 'banho' }), /não encontrado/);
  T.recusa('anônimo não move', await mover(anon, thor, 'banho'));
  T.recusa('etapa fora da lista é recusada', await mover(tosador, thor, 'lavando'), /inválida/);
  T.recusa('horário de amanhã não entra no quadro', await mover(tosador, bob, 'banho'), /hoje/);
  T.recusa('horário desmarcado não entra', await mover(tosador, luna, 'banho'), /desmarcado/);
  T.ok('nada mudou com as recusas', status(thor) === 'marcado' && B.num(`select count(*) from quadro_atendimento where petshop_id='${P}'`) === 0);
  const r1 = await mover(tosador, thor, 'banho');
  T.passa('o tosador (agenda) leva o Thor para o banho', r1, r1.data?.etapa === 'banho' && r1.data?.status === 'em_atendimento');
  T.ok('o Thor chegou: em atendimento, etapa banho, hora da chegada e o status de antes', status(thor) === 'em_atendimento' && linha(thor) === 'banho|true|marcado|false', linha(thor));
  T.ok('agendamentos não ganhou coluna nova', B.num(`select count(*) from information_schema.columns where table_schema='public' and table_name='agendamentos' and column_name in ('etapa','entregue_em','chegou_em')`) === 0);

  T.secao('dois toques');
  const [d1, d2] = await Promise.all([mover(tosador, thor, 'secagem'), mover(caixa, thor, 'secagem')]);
  T.ok('dois toques ao mesmo tempo (tosador e recepção) passam', !d1.error && !d2.error, d1.error?.message || d2.error?.message);
  T.ok('uma linha só, na secagem, com a mesma hora nos dois', B.num(`select count(*) from quadro_atendimento where agendamento_id='${thor}'`) === 1 && linha(thor).startsWith('secagem|') && d1.data?.etapa_em === d2.data?.etapa_em);
  const em = B.sql(`select etapa_em from quadro_atendimento where agendamento_id='${thor}'`);
  await new Promise((r) => setTimeout(r, 50));
  await mover(tosador, thor, 'secagem');
  T.ok('tocar de novo depois não muda a hora da etapa', B.sql(`select etapa_em from quadro_atendimento where agendamento_id='${thor}'`) === em);

  T.secao('chegada por outra tela e voltar para Esperando');
  B.must(await tosador.from('agendamentos').update({ status: 'confirmado' }).eq('id', mel).select('id'), 'confirmou');
  B.must(await tosador.from('agendamentos').update({ status: 'em_atendimento' }).eq('id', mel).select('id'), 'chegou pela agenda');
  T.ok('"Chegou" pela Agenda anota a chegada no quadro (status de antes: confirmado)', linha(mel) === '-|true|confirmado|false', linha(mel));
  T.ok('sem etapa, o app põe a Mel em No banho', Q.colunaDe({ status: 'em_atendimento' }, { etapa: null, etapa_em: null, chegou_em: 'x', entregue_em: null }) === 'banho');
  T.passa('voltar para Esperando', await mover(tosador, mel, 'esperando'));
  T.ok('volta para confirmado e o quadro da Mel some', status(mel) === 'confirmado' && B.num(`select count(*) from quadro_atendimento where agendamento_id='${mel}'`) === 0);
  T.passa('Esperando de novo não muda nada', await mover(tosador, mel, 'esperando'));
  T.ok('a Mel continua confirmada', status(mel) === 'confirmado');

  T.secao('pronto e entregue: entregar conclui o atendimento, sem cobrar');
  T.recusa('entregue sem ter chegado é recusado', await mover(tosador, mel, 'entregue'), /não chegou/);
  T.passa('Thor pronto', await mover(tosador, thor, 'pronto'));
  const [e1, e2] = await Promise.all([mover(tosador, thor, 'entregue'), mover(tosador, thor, 'entregue')]);
  T.ok('dois toques em Entregue: uma hora só', !e1.error && !e2.error && e1.data?.entregue_em === e2.data?.entregue_em, e1.error?.message || e2.error?.message);
  T.ok('entregue: o atendimento fica concluído (falta cobrar)', status(thor) === 'concluido' && linha(thor) === 'pronto|true|marcado|true', linha(thor));
  T.ok('nenhum dinheiro lançado pelo quadro', B.num(`select count(*) from lancamentos where agendamento_id='${thor}'`) === 0);
  T.passa('de Entregue de volta para a tosa (toque errado)', await mover(tosador, thor, 'tosa'));
  T.ok('a volta tira o entregue', linha(thor) === 'tosa|true|marcado|false', linha(thor));
  T.ok('a volta de etapa mantém o atendimento concluído', status(thor) === 'concluido' && linha(thor) === 'tosa|true|marcado|false');
  T.recusa('concluído não volta para Esperando pelo quadro', await mover(tosador, thor, 'esperando'), /concluído/);
  T.passa('concluído vai para Pronto', await mover(tosador, thor, 'pronto'));
  T.ok('colunas do app: concluído + pronto = Pronto para buscar; concluído sem quadro = Entregue',
    Q.colunaDe({ status: 'concluido' }, { etapa: 'pronto', etapa_em: 'x', chegou_em: 'x', entregue_em: null }) === 'pronto' && Q.colunaDe({ status: 'concluido' }, null) === 'entregue');

  T.secao('quem lê e ninguém grava direto');
  const ler = async (sb, tb) => ((await sb.from(tb).select('agendamento_id').eq('petshop_id', P)).data ?? []).length;
  T.ok('tosador, recepção e dono leem o quadro', (await ler(tosador, 'quadro_atendimento')) === 1 && (await ler(caixa, 'quadro_atendimento')) === 1 && (await ler(dono, 'quadro_atendimento')) === 1);
  T.ok('monitora, estoque, outro pet shop e anônimo não leem', (await ler(mon, 'quadro_atendimento')) + (await ler(estoque, 'quadro_atendimento')) + (await ler(outro, 'quadro_atendimento')) + (await ler(anon, 'quadro_atendimento')) === 0);
  T.recusa('o dono não grava direto no quadro', await dono.from('quadro_atendimento').update({ etapa: 'banho' }).eq('agendamento_id', thor).select('agendamento_id'));
  T.recusa('o dono não insere direto no quadro', await dono.from('quadro_atendimento').insert({ agendamento_id: mel, petshop_id: P, etapa: 'banho' }).select('agendamento_id'));
  T.recusa('o dono não insere viagem direto', await dono.from('leva_traz_viagens').insert({ agendamento_id: thor, petshop_id: P, perna: 'buscar' }).select('agendamento_id'));

  T.secao('leva e traz');
  const viagem = (sb, id, perna, feito = true) => sb.rpc('leva_traz_marcar', { p_petshop: P, p_agendamento: id, p_perna: perna, p_feito: feito });
  T.recusa('a monitora (sem agenda) não marca', await viagem(mon, rex, 'buscar'), /agenda/);
  T.recusa('quem só cuida do estoque não marca', await viagem(estoque, rex, 'buscar'), /agenda/);
  T.recusa('outro pet shop não marca', await outro.rpc('leva_traz_marcar', { p_petshop: P, p_agendamento: rex, p_perna: 'buscar', p_feito: true }), /agenda/);
  T.recusa('anônimo não marca', await viagem(anon, rex, 'buscar'));
  T.recusa('horário sem leva e traz é recusado', await viagem(tosador, mel, 'buscar'), /não tem leva e traz/);
  T.recusa('viagem fora da lista é recusada', await viagem(tosador, rex, 'ir'), /inválida/);
  T.recusa('levar de volta antes de o pet chegar é recusado', await viagem(tosador, rex, 'levar'), /não chegou/);
  const [b1, b2] = await Promise.all([viagem(tosador, rex, 'buscar'), viagem(caixa, rex, 'buscar')]);
  T.ok('dois toques em Buscado: uma viagem, a mesma hora', !b1.error && !b2.error && b1.data?.feito_em === b2.data?.feito_em && B.num(`select count(*) from leva_traz_viagens where agendamento_id='${rex}'`) === 1, b1.error?.message || b2.error?.message);
  T.ok('buscar não muda o status (o pet ainda não chegou)', status(rex) === 'marcado');
  T.passa('o Rex chega e vai para o banho', await mover(tosador, rex, 'banho'));
  T.passa('o Rex é levado de volta', await viagem(tosador, rex, 'levar'));
  T.ok('levar de volta = entregue no quadro', linha(rex) === 'banho|true|marcado|true', linha(rex));
  // o buscar foi tocado pelos dois ao mesmo tempo: fica quem chegou primeiro; o levar foi o tosador
  T.ok('quem marcou fica anotado', B.sql(`select string_agg(v.perna || ':' || case when p.id='${L.ids.tosador}' then 'tosador' when p.id='${L.ids.caixa}' then 'caixa' else '?' end, ',' order by v.perna) from leva_traz_viagens v join profissionais p on p.user_id = v.feito_por and p.petshop_id = v.petshop_id where v.agendamento_id='${rex}'`).match(/^buscar:(tosador|caixa),levar:tosador$/));
  T.passa('desfazer o levar', await viagem(tosador, rex, 'levar', false));
  T.ok('desfazer apaga a viagem e tira o entregue', B.num(`select count(*) from leva_traz_viagens where agendamento_id='${rex}' and perna='levar'`) === 0 && linha(rex) === 'banho|true|marcado|false');
  T.ok('tosador e recepção leem as viagens; monitora, estoque, outro e anônimo não', (await ler(tosador, 'leva_traz_viagens')) === 1 && (await ler(caixa, 'leva_traz_viagens')) === 1
    && (await ler(mon, 'leva_traz_viagens')) + (await ler(estoque, 'leva_traz_viagens')) + (await ler(outro, 'leva_traz_viagens')) + (await ler(anon, 'leva_traz_viagens')) === 0);
  B.must(await tosador.from('agendamentos').update({ status: 'faltou' }).eq('id', mel).select('id'), 'faltou');
  B.must(await caixa.from('agendamentos').update({ status: 'marcado' }).eq('id', rex).select('id'), 'voltou para marcado');
  T.ok('voltar para marcado apaga o quadro do horário', B.num(`select count(*) from quadro_atendimento where agendamento_id='${rex}'`) === 0);

  T.secao('taxa de leva e traz');
  const taxa = { modo: 'bairro', valor: null, bairros: [{ nome: 'Centro', valor: 12 }, { nome: 'Jardim América', valor: 18.5 }, { nome: 'Jardim', valor: 15 }] };
  T.recusa('a recepção não muda a taxa', await caixa.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'taxi.taxa': taxa } }), /dono/);
  T.passa('o dono salva a taxa por bairro', await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'taxi.taxa': taxa } }));
  const op = async (sb) => (await sb.rpc('petshop_opcoes', { p: P })).data ?? {};
  T.ok('a recepção (caixa) lê a taxa', JSON.stringify((await op(caixa))['taxi.taxa']) === JSON.stringify(taxa));
  T.ok('o tosador (sem dinheiro) não lê a taxa', !('taxi.taxa' in (await op(tosador))));
  const lida = Q.taxaDoLevaTraz({ opcoes: taxa && { 'taxi.taxa': taxa } });
  T.ok('a conta acha o bairro no endereço (o nome mais comprido)', Q.taxaSugerida(lida, 'Av. Brasil, 500 - Jardim América')?.valor === 18.5 && Q.taxaSugerida(lida, 'rua x, centro')?.bairro === 'Centro');
  T.ok('sem bairro conhecido não sugere nada (a pessoa escolhe)', Q.taxaSugerida(lida, 'Rua Y, Vila Nova') === null && Q.temTaxa(lida));
  T.ok('valor fixo sugere o valor; sem valor, nada', Q.taxaSugerida(Q.taxaDoLevaTraz({ opcoes: { 'taxi.taxa': { modo: 'fixo', valor: 15 } } }), null)?.valor === 15 && !Q.temTaxa(Q.taxaDoLevaTraz({ opcoes: {} })));
  T.ok('bairro repetido é recusado ao gravar', 'erro' in Q.taxaParaGravar({ modo: 'bairro', valor: null, bairros: [{ nome: 'Centro', valor: 1 }, { nome: 'centro', valor: 2 }] }));
  T.ok('nenhum preço de horário mudou', B.num(`select count(*) from agendamentos where petshop_id='${P}' and preco <> 90 and servico_id='${L.S['Banho e tosa']}'`) === 0);

  T.secao('contas do app: próxima etapa, viagens e rota');
  T.ok('próxima etapa: esperando → banho → secagem → tosa (com tosa) → pronto → entregue',
    Q.proximaEtapa({ status: 'marcado' }, null, true) === 'banho' && Q.proximaEtapa({ status: 'em_atendimento' }, null, true) === 'secagem'
    && Q.proximaEtapa({ status: 'em_atendimento' }, { etapa: 'secagem' }, true) === 'tosa' && Q.proximaEtapa({ status: 'em_atendimento' }, { etapa: 'secagem' }, false) === 'pronto'
    && Q.proximaEtapa({ status: 'em_atendimento' }, { etapa: 'pronto' }, true) === 'entregue' && Q.proximaEtapa({ status: 'concluido' }, null, true) === null);
  const h = (id, ini, fim, o = {}) => ({ id, inicio: ini, fim, status: 'marcado', leva_traz: true, endereco_leva_traz: null, pronto_avisado_em: null, pets: { clientes: { endereco: 'Rua da Ficha, 1' } }, ...o });
  const vs = Q.montarViagens([h('a', '2026-01-01T12:00:00Z', '2026-01-01T13:00:00Z', { endereco_leva_traz: 'Rua A, 1' }), h('b', '2026-01-01T11:00:00Z', '2026-01-01T12:30:00Z'), h('c', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z', { status: 'cancelado' })], new Map(), new Map());
  T.ok('viagens na ordem do relógio, sem o cancelado; endereço do horário vale mais que o da ficha',
    vs.map((v) => `${v.agendamentoId}:${v.perna}`).join(',') === 'b:buscar,a:buscar,b:levar,a:levar' && vs[1].endereco === 'Rua A, 1' && vs[0].endereco === 'Rua da Ficha, 1', vs.map((v) => v.chave));
  const rota = Q.linkDaRota(Array.from({ length: 12 }, (_, i) => `Rua ${i + 1}`), 'São Paulo - SP');
  const u = new URL(rota.url);
  T.ok('rota: no máximo 10 endereços (9 no meio + o destino), com a cidade', rota.usados === 10 && rota.sobraram === 2 && u.searchParams.get('waypoints').split('|').length === 9 && u.searchParams.get('destination') === 'Rua 10, São Paulo - SP', rota.url);
  T.ok('endereço repetido em seguida entra uma vez', Q.linkDaRota(['Rua A', 'rua a', 'Rua B']).usados === 2);
  T.ok('mapa de um endereço pelo link de busca do Google', Q.linkDoMapa('Rua A, 1', 'Campinas') === 'https://www.google.com/maps/search/?api=1&query=Rua%20A%2C%201%2C%20Campinas');
  T.ok('"estou chegando" no WhatsApp', /Estou chegando para buscar Thor\.$/.test(Q.textoChegando({ tutor: 'Ana Souza', pet: 'Thor', petshop: 'Pet X', perna: 'buscar' })));
}))();
