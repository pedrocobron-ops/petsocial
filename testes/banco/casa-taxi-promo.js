// Leva e traz e promoção em dias fracos na creche e no hotel (migração 20261207).
// Leva e traz: estadias.leva_traz_buscar / leva_traz_levar / endereco_leva_traz (leitura coluna por coluna para a equipe),
// leva_traz_estadia_marcar (área Creche e hotel; tosador, estoque, outro pet shop e anônimo não), estadia sem leva e traz, levar antes
// do check-in, cancelada, dois toques = uma viagem, desfazer, ninguém grava direto, quem lê; as viagens do dia no app (quadro.ts):
// hotel buscar na entrada e levar na saída, creche as duas no dia, mensalista fora.
// Promoção: promocoes.banho_tosa e casa (só o dono; onde vale é obrigatório), a estadia ganha a cópia ao ser marcada (creche no dia,
// hotel nas noites dos dias da promoção), a API não escreve (nem ao marcar, nem ao editar), {"tirada": true}, estadia marcada antes da
// promoção não ganha (nem ao remarcar), promoção só da creche não entra no banho e tosa, dia de experiência sem promoção,
// estadia_promo_usar por papel e depois da conta fechada, promo_usos pela conta guardada (limitado ao que a promoção pode dar),
// relatório com as estadias, link_promocoes com casa, pedido do link de creche leva a promoção e a estadia aceita fica com ela.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('casa-taxi-promo');
const Q = lib('quadro');
const PR = lib('promocoes');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Casa taxi', modulos: ['banho_tosa', 'creche', 'hotel', 'loja', 'pacotes'] });
  const { dono, caixa: cx, tosador: tos, monitor: mon, estoque: est } = L.sb;
  const P = L.P;
  const L2 = await criarLoja(null, { nome: 'Casa taxi outra', equipe: false, dados: false });
  T.depois(() => L2.limpar());
  const outro = L2.sb.dono, anon = B.cliente();
  B.sql(`update clientes set endereco = 'Rua das Flores, 10 - Centro' where id='${L.tutores.Ana}'`);

  const est_ = (sb, pet, tipo, dia, hora, o = {}) => sb.from('estadias')
    .insert({ petshop_id: P, pet_id: L.pets[pet], tipo, entrada: B.instante(dia, hora, L.fuso).toISOString(), ...o }).select('id, promo').single();
  const col = (id, c) => B.sql(`select coalesce(${c}::text, '-') from estadias where id='${id}'`);
  const promoDe = (id) => JSON.parse(B.sql(`select coalesce(promo, 'null'::jsonb) from estadias where id='${id}'`));

  // =====================================================================================================================
  T.secao('leva e traz: as colunas da estadia');
  const hotel = B.must(await est_(mon, 'Thor', 'hotel', L.hoje, '09:00', { saida_prevista: B.instante(L.dia(3), '12:00', L.fuso).toISOString(), leva_traz_buscar: true, leva_traz_levar: true }), 'hotel com leva e traz').id;
  const creche = B.must(await est_(mon, 'Mel', 'creche', L.hoje, '08:00', { leva_traz_buscar: true, leva_traz_levar: true, endereco_leva_traz: 'Av. Brasil, 500 - Jardim' }), 'creche com leva e traz').id;
  const semLT = B.must(await est_(mon, 'Bob', 'creche', L.hoje, '08:30'), 'creche sem leva e traz').id;
  T.ok('a monitora (Creche e hotel) grava buscar, levar e o endereço pela API', col(creche, 'leva_traz_buscar') === 'true' && col(creche, 'endereco_leva_traz') === 'Av. Brasil, 500 - Jardim');
  const lidas = await tos.from('estadias').select('id, leva_traz_buscar, leva_traz_levar, endereco_leva_traz, promo').eq('id', hotel);
  T.passa('a equipe lê as colunas novas (leitura coluna por coluna)', lidas, lidas.data?.length === 1 && lidas.data[0].leva_traz_levar === true);
  B.must(await mon.from('estadias').update({ endereco_leva_traz: 'Rua Nova, 1' }).eq('id', creche).select('id'), 'muda o endereço');
  T.ok('… e muda na edição', col(creche, 'endereco_leva_traz') === 'Rua Nova, 1');
  T.recusa('endereço com mais de 300 letras é recusado', await mon.from('estadias').update({ endereco_leva_traz: 'x'.repeat(301) }).eq('id', creche).select('id'));
  const deFora = await outro.from('estadias').select('id').eq('id', hotel);
  T.ok('outro pet shop não lê a estadia', !deFora.error && deFora.data.length === 0);

  T.secao('leva e traz: marcar as viagens');
  const viagem = (sb, id, perna, feito = true, p = P) => sb.rpc('leva_traz_estadia_marcar', { p_petshop: p, p_estadia: id, p_perna: perna, p_feito: feito });
  T.recusa('o tosador (sem Creche e hotel) não marca', await viagem(tos, hotel, 'buscar'), /creche e hotel/);
  T.recusa('quem só cuida do estoque não marca', await viagem(est, hotel, 'buscar'), /creche e hotel/);
  T.recusa('outro pet shop não marca', await viagem(outro, hotel, 'buscar'), /creche e hotel/);
  T.recusa('outro pet shop não marca pelo id do próprio pet shop', await viagem(outro, hotel, 'buscar', true, L2.P), /não encontrada/);
  T.recusa('anônimo não marca', await viagem(anon, hotel, 'buscar'));
  T.recusa('estadia sem leva e traz é recusada', await viagem(mon, semLT, 'buscar'), /não tem leva e traz/);
  T.recusa('viagem fora da lista é recusada', await viagem(mon, hotel, 'ir'), /inválida/);
  T.recusa('levar de volta antes do check-in é recusado', await viagem(mon, hotel, 'levar'), /não chegou/);
  const [b1, b2] = await Promise.all([viagem(mon, hotel, 'buscar'), viagem(cx, hotel, 'buscar')]);
  T.ok('dois toques em Buscado (monitora e recepção): uma viagem, a mesma hora', !b1.error && !b2.error && b1.data?.feito_em === b2.data?.feito_em
    && B.num(`select count(*) from leva_traz_estadias where estadia_id='${hotel}'`) === 1, b1.error?.message || b2.error?.message);
  T.ok('buscar não faz check-in', col(hotel, 'status') === 'reservada');
  B.must(await mon.from('estadias').update({ status: 'em_casa' }).eq('id', hotel).select('id'), 'check-in do hotel');
  T.passa('com o pet na casa, levar de volta passa', await viagem(mon, hotel, 'levar'));
  T.ok('levar não faz check-out', col(hotel, 'status') === 'em_casa');
  T.passa('desfazer o levar', await viagem(mon, hotel, 'levar', false));
  T.ok('desfazer apaga a viagem', B.num(`select count(*) from leva_traz_estadias where estadia_id='${hotel}' and perna='levar'`) === 0);
  T.passa('desfazer de novo não dá erro', await viagem(mon, hotel, 'levar', false));
  T.recusa('ninguém insere viagem direto (nem o dono)', await dono.from('leva_traz_estadias').insert({ estadia_id: creche, petshop_id: P, perna: 'buscar' }).select('estadia_id'));
  const ler = async (sb) => ((await sb.from('leva_traz_estadias').select('estadia_id').eq('petshop_id', P)).data ?? []).length;
  T.ok('monitora, recepção e dono leem as viagens', (await ler(mon)) === 1 && (await ler(cx)) === 1 && (await ler(dono)) === 1);
  T.ok('tosador, estoque, outro pet shop e anônimo não leem', (await ler(tos)) + (await ler(est)) + (await ler(outro)) + (await ler(anon)) === 0);
  B.must(await mon.from('estadias').update({ status: 'cancelada' }).eq('id', creche).select('id'), 'cancela a creche');
  T.recusa('estadia cancelada não ganha viagem', await viagem(mon, creche, 'buscar'), /cancelada/);
  B.sql(`update clientes set endereco = null where id='${L.tutores.Ana}'`);
  T.ok('estadias e leva_traz_viagens (dos horários) continuam separadas', B.num(`select count(*) from leva_traz_viagens where petshop_id='${P}'`) === 0);

  T.secao('leva e traz: as viagens do dia no app');
  const e = (o) => ({ id: 'x', tipo: 'hotel', entrada: '2026-03-02T12:00:00.000Z', saida_prevista: '2026-03-05T15:00:00.000Z', saida: null, status: 'reservada', mensalista: null,
    leva_traz_buscar: true, leva_traz_levar: true, endereco_leva_traz: null, pets: { clientes: { endereco: 'Rua da Ficha, 1' } }, ...o });
  const dl = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const h1 = e({});
  T.ok('hotel: buscar no dia da entrada (com o endereço da ficha)', Q.viagensDaEstadia(h1, dl(h1.entrada), new Map()).map((v) => v.perna).join() === 'buscar'
    && Q.viagensDaEstadia(h1, dl(h1.entrada), new Map())[0].endereco === 'Rua da Ficha, 1');
  T.ok('hotel: levar no dia da saída prevista (ainda sem check-in: não está pronto)', Q.viagensDaEstadia(h1, dl(h1.saida_prevista), new Map()).map((v) => `${v.perna}:${v.pronto}`).join() === 'levar:false');
  T.ok('hotel: nada nos dias do meio', Q.viagensDaEstadia(h1, B.somaDias(dl(h1.entrada), 1), new Map()).length === 0);
  const h2 = e({ status: 'encerrada', saida: '2026-03-04T15:00:00.000Z' });
  T.ok('hotel que saiu antes: levar no dia da saída de verdade', Q.viagensDaEstadia(h2, dl(h2.saida), new Map()).map((v) => `${v.perna}:${v.pronto}`).join() === 'levar:true'
    && Q.viagensDaEstadia(h2, dl(h2.saida_prevista), new Map()).length === 0);
  const c1 = e({ tipo: 'creche', saida_prevista: null, endereco_leva_traz: 'Rua A, 1', leva_traz_buscar: false });
  T.ok('creche: só levar marcado, no mesmo dia, com o endereço da estadia', Q.viagensDaEstadia(c1, dl(c1.entrada), new Map()).map((v) => `${v.perna}:${v.endereco}`).join() === 'levar:Rua A, 1');
  T.ok('mensalista e cancelada ficam de fora', Q.viagensDaEstadia(e({ mensalista: 'plano' }), dl(h1.entrada), new Map()).length === 0 && Q.viagensDaEstadia(e({ status: 'cancelada' }), dl(h1.entrada), new Map()).length === 0);
  const feitas = new Map([['x:buscar', { perna: 'buscar', feito_em: '2026-03-02T11:50:00.000Z', feito_por: null }]]);
  const junto = Q.juntarViagens(Q.viagensDaEstadia(h1, dl(h1.entrada), feitas), [{ chave: 'a:buscar', agendamentoId: 'a', perna: 'buscar', quando: '2026-03-02T10:00:00.000Z', pronto: true, prontoEm: null, feitoEm: null, feitoPor: null, endereco: null }]);
  T.ok('juntar horários e estadias na ordem do relógio, com a viagem feita', junto.map((v) => v.chave).join() === 'a:buscar,ex:buscar' && junto[1].feitoEm === '2026-03-02T11:50:00.000Z' && junto[1].estadiaId === 'x');

  // =====================================================================================================================
  T.secao('promoção: onde vale');
  // a estadia de creche marcada ANTES de a promoção existir (no dia da promoção)
  const D = L.dia(2), DOW = B.diaDaSemana(D);
  const antes = B.must(await est_(mon, 'Luna', 'creche', D, '08:00'), 'creche de antes').id;
  const salvar = (sb, id, dados, p = P) => sb.rpc('promocao_salvar', { p, p_id: id, p_dados: dados });
  const base = { nome: 'Dia da creche', dias: [DOW], hora_de: '07:00', hora_ate: '09:00', servicos: [L.S.Banho], tipo: 'pct', valor: 15, comeca_em: null, termina_em: null, ativa: true, banho_tosa: false, casa: ['creche'] };
  T.recusa('a monitora não cria promoção', await salvar(mon, null, base), /dono/);
  T.recusa('anônimo não cria', await salvar(anon, null, base));
  T.recusa('outro pet shop não cria nesta', await salvar(outro, null, base));
  T.recusa('sem banho e tosa e sem creche ou hotel: recusado', await salvar(dono, null, { ...base, casa: [] }), /onde/);
  T.recusa('lugar fora da lista: recusado', await salvar(dono, null, { ...base, casa: ['spa'] }), /creche ou hotel/);
  const r1 = await salvar(dono, null, base);
  T.passa('o dono cria "Dia da creche": só creche, 15% no dia da semana', r1);
  const pCreche = r1.data;
  T.ok('só creche: os serviços e a faixa de hora ficam em branco', B.sql(`select banho_tosa || '|' || array_to_string(casa, ',') || '|' || cardinality(servicos) || '|' || coalesce(hora_de::text, '-') from promocoes where id='${pCreche}'`) === 'false|creche|0|-');
  T.recusa('ninguém grava direto na tabela (nem o dono)', await dono.from('promocoes').update({ casa: ['hotel'] }).eq('id', pCreche).select('id'));

  T.secao('promoção: a creche ganha a cópia ao ser marcada');
  const c2 = B.must(await est_(mon, 'Thor', 'creche', D, '08:00'), 'creche no dia');
  T.ok('creche no dia da promoção: vem com ela (nome, %, dias, casa)', c2.promo?.nome === 'Dia da creche' && c2.promo.tipo === 'pct' && Number(c2.promo.valor) === 15 && c2.promo.casa === 'creche'
    && JSON.stringify(c2.promo.dias) === JSON.stringify([DOW]) && c2.promo.id === pCreche, c2.promo);
  T.ok('… a diária continua a da lista (R$ 70)', Number(B.sql(`select valor_diaria from estadias where id='${c2.id}'`)) === 70);
  const c3 = B.must(await est_(mon, 'Rex', 'creche', L.dia(3), '08:00'), 'creche no outro dia');
  T.ok('creche em outro dia da semana: sem promoção', c3.promo === null, c3.promo);
  const h3 = B.must(await est_(mon, 'Rex', 'hotel', D, '10:00', { saida_prevista: B.instante(L.dia(4), '10:00', L.fuso).toISOString() }), 'hotel no dia');
  T.ok('hotel no mesmo dia: a promoção é só da creche, não vem', h3.promo === null, h3.promo);
  const forj = B.must(await est_(mon, 'Bob', 'creche', L.dia(3), '09:00', { promo: { id: pCreche, nome: 'Inventada', tipo: 'pct', valor: 90, casa: 'creche', dias: [0, 1, 2, 3, 4, 5, 6] } }), 'promoção inventada');
  T.ok('a API não escreve a promoção ao marcar (a inventada some)', forj.promo === null, forj.promo);
  B.must(await mon.from('estadias').update({ promo: { id: pCreche, nome: 'Inventada', tipo: 'pct', valor: 90 } }).eq('id', c3.id).select('id'), 'tenta pela edição');
  T.ok('… nem pela edição', promoDe(c3.id) === null);
  B.must(await dono.from('estadias').update({ promo: null }).eq('id', c2.id).select('id'), 'tenta apagar pela edição');
  T.ok('… nem apagando pela edição (o dono também não)', promoDe(c2.id)?.nome === 'Dia da creche');
  const semEla = B.must(await est_(mon, 'Mel', 'creche', D, '09:00', { promo: { tirada: true } }), 'marcar sem a promoção');
  T.ok('marcar pedindo sem a promoção: a cópia vem tirada', semEla.promo?.nome === 'Dia da creche' && semEla.promo.tirada === true, semEla.promo);
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'creche.experiencia': { ativo: true } } }), 'liga o dia de experiência');
  const exp = B.must(await est_(mon, 'Bob', 'creche', D, '10:00', { experiencia: true }), 'dia de experiência');
  T.ok('dia de experiência: sem promoção', exp.promo === null, exp.promo);
  T.ok('estadia marcada antes de a promoção existir: sem promoção', promoDe(antes) === null);
  B.must(await mon.from('estadias').update({ entrada: B.instante(D, '09:30', L.fuso).toISOString() }).eq('id', antes).select('id'), 'remarca a de antes');
  T.ok('… nem ao remarcar dentro do dia (o preço não muda)', promoDe(antes) === null);
  B.must(await mon.from('estadias').update({ entrada: B.instante(L.dia(3), '08:00', L.fuso).toISOString() }).eq('id', c2.id).select('id'), 'remarca para outro dia');
  T.ok('remarcar a reserva para outro dia da semana: a promoção sai', promoDe(c2.id) === null);
  B.must(await mon.from('estadias').update({ entrada: B.instante(D, '08:00', L.fuso).toISOString() }).eq('id', c2.id).select('id'), 'volta para o dia');
  T.ok('… de volta para o dia: a promoção volta', promoDe(c2.id)?.nome === 'Dia da creche');
  B.must(await salvar(dono, pCreche, { ...base, valor: 30 }), 'o dono muda para 30%');
  T.ok('mudar a promoção não mexe na reserva já marcada (continua 15%)', Number(promoDe(c2.id).valor) === 15);
  B.must(await salvar(dono, pCreche, base), 'volta para 15%');

  T.secao('promoção: não entra no banho e tosa');
  const ini = B.instante(D, '08:00', L.fuso);
  const ag = B.must(await tos.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Thor, servico_id: L.S.Banho, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString() }).select('id, promo').single(), 'banho no dia');
  T.ok('banho no dia e na hora: a promoção só da creche não vem', ag.promo === null, ag.promo);
  T.ok('… nem ao pôr de volta pelo horário', (await tos.rpc('agendamento_promo_usar', { p_id: ag.id, p_usar: true })).data === null);

  T.secao('promoção: hotel, noite por noite');
  // promoção do hotel num dia da semana (DH); a reserva tem 3 noites e só uma cai nele
  const DH = L.dia(5), DOWH = B.diaDaSemana(DH);
  const r2 = await salvar(dono, null, { nome: 'Noite tranquila', dias: [DOWH], hora_de: null, hora_ate: null, servicos: [], tipo: 'reais', valor: 25, comeca_em: null, termina_em: null, ativa: true, banho_tosa: false, casa: ['hotel'] });
  T.passa('o dono cria "Noite tranquila": R$ 25 por noite no hotel', r2);
  const h4 = B.must(await est_(mon, 'Luna', 'hotel', L.dia(4), '14:00', { saida_prevista: B.instante(L.dia(7), '12:00', L.fuso).toISOString() }), 'hotel 3 noites');
  T.ok('hotel com uma noite no dia da promoção: vem com ela, com os dias', h4.promo?.nome === 'Noite tranquila' && h4.promo.casa === 'hotel' && JSON.stringify(h4.promo.dias) === JSON.stringify([DOWH]), h4.promo);
  const h5 = B.must(await est_(mon, 'Bob', 'hotel', L.dia(6), '14:00', { saida_prevista: B.instante(L.dia(8), '12:00', L.fuso).toISOString() }), 'hotel fora');
  T.ok('hotel sem nenhuma noite no dia: sem promoção', h5.promo === null, h5.promo);
  const pr = PR.lerPromoDaEstadia(h4.promo);
  const noites = [L.dia(4), L.dia(5), L.dia(6)].map((dia) => ({ dia, valor: 120 }));
  const d4 = PR.descontoDaPromoNaEstadia(pr, noites);
  T.ok('a conta: R$ 25 só na noite do dia da promoção', d4.valor === 25 && d4.dias.length === 1 && d4.dias[0] === DH, d4);
  T.ok('a conta em %: 15% só nas noites dos dias', PR.descontoDaPromoNaEstadia({ ...pr, tipo: 'pct', valor: 15 }, noites).valor === 18);
  T.ok('a conta: promoção tirada não desconta', PR.descontoDaPromoNaEstadia({ ...pr, tirada: true }, noites).valor === 0);
  T.ok('a escolha do app é a mesma do banco', PR.promoDaEstadia([PR.lerPromocao({ id: r2.data, nome: 'Noite tranquila', dias: [DOWH], servicos: [], tipo: 'reais', valor: 25, ativa: true, banho_tosa: false, casa: ['hotel'] })],
    { tipo: 'hotel', entrada: L.dia(4), saida: L.dia(7), diaria: 120 })?.nome === 'Noite tranquila'
    && PR.promoDaEstadia([PR.lerPromocao({ id: r2.data, nome: 'x', dias: [DOWH], servicos: [], tipo: 'reais', valor: 25, ativa: true, banho_tosa: false, casa: ['hotel'] })], { tipo: 'hotel', entrada: L.dia(6), saida: L.dia(8) }) === null);

  T.secao('promoção: tirar e pôr de volta');
  const usar = (sb, id, sim) => sb.rpc('estadia_promo_usar', { p_id: id, p_usar: sim });
  T.recusa('o tosador (sem Creche e hotel nem caixa) não tira', await usar(tos, h4.id, false), /não encontrada/);
  T.recusa('outro pet shop não tira', await usar(outro, h4.id, false), /não encontrada/);
  T.recusa('anônimo não tira', await usar(anon, h4.id, false));
  const [t1, t2] = await Promise.all([usar(mon, h4.id, false), usar(cx, h4.id, false)]);
  T.ok('dois toques em Tirar (monitora e recepção): fica tirada', !t1.error && !t2.error && promoDe(h4.id)?.tirada === true, t1.error?.message || t2.error?.message);
  T.passa('a recepção põe de volta', await usar(cx, h4.id, true), true);
  T.ok('… volta a mesma cópia, sem o "tirada"', promoDe(h4.id)?.nome === 'Noite tranquila' && promoDe(h4.id)?.tirada === undefined);
  T.ok('pôr de volta numa estadia sem cópia procura entre as que existiam quando ela foi marcada (a de antes não ganha)', (await usar(mon, antes, true)).data === null && promoDe(antes) === null);
  T.recusa('dia de experiência não tem promoção', await usar(mon, exp.id, true), /experiência/);

  T.secao('promoção: o desconto da conta vai para promo_usos');
  // a conta guardada no check-out (o mesmo passo estadia_valores do check-out): 2 diárias de R$ 120 e um desconto (forjado) de R$ 999
  B.must(await mon.from('estadias').update({ status: 'em_casa' }).eq('id', h4.id).select('id'), 'check-in');
  const conta = (desc, total = 240) => ({ v: 1, tipo: 'hotel', quando: new Date().toISOString(), diarias: 2, valor_diaria: 120, noites: null, pacote: null, total_diarias: total, taxas: [], extras: [], produtos: [],
    soma: total - desc, ajuste: 0, total: total - desc, sinal: 0, sinal_pago: false, a_pagar: total - desc, pendencias: [], pagamento: null, lancamento_id: null, promo: { id: r2.data, nome: 'Noite tranquila', tipo: 'reais', valor: 25, desconto: desc, dias: [DH] } });
  T.recusa('quem não cuida do dinheiro não grava a conta', await mon.from('estadias_valores').upsert({ estadia_id: h4.id, petshop_id: P, conta: conta(25) }, { onConflict: 'estadia_id' }).select('estadia_id'));
  B.must(await dono.from('estadias').update({ status: 'encerrada', saida: new Date().toISOString(), diarias_cobradas: 2, valor_cobrado: 215 }).eq('id', h4.id).select('id'), 'check-out');
  B.must(await dono.from('estadias_valores').upsert({ estadia_id: h4.id, petshop_id: P, conta: conta(999) }, { onConflict: 'estadia_id' }).select('estadia_id'), 'conta guardada');
  T.ok('o desconto anotado é limitado ao que a promoção pode dar (R$ 25 × 2 diárias = R$ 50)', B.sql(`select desconto from promo_usos where estadia_id='${h4.id}'`) === '50.00');
  B.must(await dono.from('estadias_valores').update({ conta: conta(25) }).eq('estadia_id', h4.id).select('estadia_id'), 'conta de novo');
  T.ok('gravar a conta de novo não anota duas vezes', B.num(`select count(*) from promo_usos where estadia_id='${h4.id}'`) === 1);
  T.recusa('depois da conta fechada, a promoção não muda mais', await usar(cx, h4.id, false), /fechada/);
  // a creche com a promoção tirada: a conta não anota nada
  B.must(await dono.from('estadias_valores').upsert({ estadia_id: semEla.id, petshop_id: P, conta: { ...conta(10, 70), tipo: 'creche', diarias: 1 } }, { onConflict: 'estadia_id' }).select('estadia_id'), 'conta da tirada');
  T.ok('estadia com a promoção tirada: nada em promo_usos', B.num(`select count(*) from promo_usos where estadia_id='${semEla.id}'`) === 0);
  T.recusa('ninguém lê promo_usos direto (nem o dono)', await dono.from('promo_usos').select('id').eq('petshop_id', P));

  T.secao('promoção: relatório');
  const rel = async (sb) => sb.rpc('relatorio_promocoes', { p: P, p_de: L.dia(-1), p_ate: L.dia(10) });
  const rr = await rel(dono);
  const linhaH = (rr.data ?? []).find((x) => x.nome === 'Noite tranquila'), linhaC = (rr.data ?? []).find((x) => x.nome === 'Dia da creche');
  T.passa('o dono vê o relatório', rr, Boolean(linhaH && linhaC));
  T.ok('Noite tranquila: 1 estadia, 1 encerrada, 1 conta, R$ 50 de desconto', linhaH?.estadias === 1 && linhaH.encerradas === 1 && linhaH.contas === 1 && Number(linhaH.desconto) === 50 && linhaH.marcados === 0, linhaH);
  T.ok('Dia da creche: 1 estadia (a tirada, a experiência e a de antes não contam), nenhum horário', linhaC?.estadias === 1 && linhaC.marcados === 0, linhaC);
  T.recusa('a monitora (sem dinheiro) não vê o relatório', await rel(mon), /permissão/);
  T.recusa('outro pet shop não vê', await outro.rpc('relatorio_promocoes', { p: P, p_de: L.dia(-1), p_ate: L.dia(10) }), /permissão/);

  T.secao('promoção: link do cliente e pedido');
  const lk = await anon.rpc('link_promocoes', { p_codigo: L.codigo });
  const daCreche = (lk.data ?? []).find((x) => x.nome === 'Dia da creche');
  T.passa('o link mostra a promoção da creche (casa, sem serviços do banho)', lk, daCreche && JSON.stringify(daCreche.casa) === '["creche"]' && daCreche.banho_tosa === false && daCreche.servicos.length === 0);
  T.ok('… sem o que não precisa (id, ligada, criada)', daCreche && !('id' in daCreche) && !('ativa' in daCreche));
  B.sql(`update petshops set link_creche = false where id='${P}'`);
  const lk2 = await anon.rpc('link_promocoes', { p_codigo: L.codigo });
  T.ok('com a creche fora do link, a promoção não mostra a creche', JSON.stringify((lk2.data ?? []).find((x) => x.nome === 'Dia da creche')?.casa) === '[]');
  B.sql(`update petshops set link_creche = true where id='${P}'`);
  // o pedido do link de creche no dia da promoção (o banco põe a promoção do pedido)
  const ped = B.sql(`insert into pedidos_agendamento (petshop_id, tutor_nome, telefone, pet_nome, porte, inicio, fim, tipo)
    values ('${P}', 'Ana Souza', '11988880001', 'Thor', 'M', '${B.instante(D, '08:00', L.fuso).toISOString()}', '${B.instante(D, '18:00', L.fuso).toISOString()}', 'creche') returning id`).split('\n')[0];
  T.ok('o pedido de creche no dia leva a promoção', B.sql(`select promo->>'nome' from pedidos_agendamento where id='${ped}'`) === 'Dia da creche');
  // aceito: a estadia (marcada sem a promoção, como se a promoção tivesse mudado depois do pedido) fica com a do pedido
  const doPedido = B.must(await est_(mon, 'Luna', 'creche', L.dia(3), '13:00'), 'estadia do pedido').id;
  B.sql(`update pedidos_agendamento set status = 'aceito', estadia_id = '${doPedido}' where id='${ped}'`);
  T.ok('pedido aceito: a estadia fica com a promoção do pedido', promoDe(doPedido)?.nome === 'Dia da creche');
}))();
