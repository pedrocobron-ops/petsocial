// Creche: consertos do teste em produção (Rafael), pela API com o login de cada papel.
// - falta avisada com antecedência (creche_falta_futura): quem marca, que dias, a vaga que fica livre, a reposição só depois do dia,
//   e o resumo do cartão (vai faltar à parte das faltas);
// - corrigir a hora de chegada e de saída (estadia_corrigir_horas): só dono e quem cuida do financeiro, mesmo dia na creche, motivo
//   anotado, e a taxa de busca fora do horário refeita (anotada, tirada, mantida quando já cobrada, recusada se cobrada e a hora nova
//   sai do atraso);
// - o acerto da saída que não some (saidasParaAcertar): a mensalidade do mês da saída cheia aparece até ser acertada ou anotada;
// - Mozart, ver_planos_creche: dias do plano, falta avisada, e valor só para quem recebe.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('creche-rafael');
const CR = lib('creche');
const MZ = lib('assistente/creche-planos');
const U = lib('util');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Creche Rafael' });
  const { dono, monitor, caixa, tosador } = L.sb;
  const P = L.P;
  const TODOS = [0, 1, 2, 3, 4, 5, 6];
  const novoPlano = async (pet, dias, inicio, mensal, fim = null) => {
    const id = B.must(await dono.from('creche_planos').insert({ petshop_id: P, pet_id: L.pets[pet], dias, inicio, fim, vence_dia: 10 }).select('id').single(), 'plano ' + pet).id;
    B.must(await dono.from('creche_planos_valores').upsert({ plano_id: id, petshop_id: P, valor_mensal: mensal, valor_extra: 75 }).select('plano_id'), 'valor ' + pet);
    return id;
  };
  const horario = JSON.parse(B.sql(`select horario from petshops where id='${P}'`));

  T.secao('falta avisada com antecedência');
  const pLuna = await novoPlano('Luna', TODOS, L.mesAnterior, 520);
  const D = L.dia(3);
  const ocupam = (dia) => B.num(`select public.creche_planos_ocupam('${P}', '${dia}', '${L.hoje}')`);
  const antes = ocupam(D);
  T.passa('a monitora anota que a Luna vai faltar daqui a 3 dias', await monitor.rpc('creche_falta_futura', { p_plano: pLuna, p_dia: D }));
  T.ok('fica como falta com aviso', B.sql(`select avisou from creche_faltas where pet_id='${L.pets.Luna}' and dia='${D}'`) === 't');
  T.ok(`a vaga do dia fica livre (${antes} → ${antes - 1} mensalista)`, ocupam(D) === antes - 1, ocupam(D));
  T.passa('anotar de novo não duplica', await monitor.rpc('creche_falta_futura', { p_plano: pLuna, p_dia: D }), true);
  T.ok('… continua uma falta só', B.num(`select count(*) from creche_faltas where pet_id='${L.pets.Luna}' and dia='${D}'`) === 1);
  T.recusa('hoje é na chamada do dia', await monitor.rpc('creche_falta_futura', { p_plano: pLuna, p_dia: L.hoje }), /chamada do dia/);
  T.recusa('dia que passou também', await monitor.rpc('creche_falta_futura', { p_plano: pLuna, p_dia: L.dia(-2) }), /chamada do dia/);
  T.recusa('mais de 3 meses à frente: recusado', await monitor.rpc('creche_falta_futura', { p_plano: pLuna, p_dia: L.dia(100) }), /3 meses/);
  const pMel = await novoPlano('Mel', [B.diaDaSemana(L.dia(1))], L.mesAnterior, 520);
  T.recusa('dia que não é do plano: recusado', await monitor.rpc('creche_falta_futura', { p_plano: pMel, p_dia: L.dia(2) }), /não é do plano/);
  T.recusa('quem não trabalha na creche não anota (tosador)', await tosador.rpc('creche_falta_futura', { p_plano: pLuna, p_dia: D }), /não encontrado/);
  // reposição: a falta avisada só pode ser reposta depois do dia dela
  const cabe = (dia) => B.sql(`select cabe from public.creche_reposicao_cabe('${pLuna}', '${dia}')`) === 't';
  T.ok('reposição antes do dia da falta: não cabe', !cabe(L.dia(2)));
  T.ok('reposição depois do dia da falta: cabe (repõe a falta avisada)', cabe(L.dia(4)) && B.sql(`select repoe from public.creche_reposicao_cabe('${pLuna}', '${L.dia(4)}')`) === D);
  // o cartão do mensalista: a falta do dia que ainda vai chegar fica à parte
  if (D.slice(0, 7) === L.hoje.slice(0, 7)) {
    const fs = B.must(await monitor.from('creche_faltas').select('*').eq('petshop_id', P), 'faltas');
    const r = CR.resumoDoMes({ inicio: L.mesAnterior, fim: null, dias: TODOS, pet_id: L.pets.Luna }, new Date(), [], fs, horario, L.hoje);
    T.ok('resumo do mês: "vai faltar" à parte, sem contar como falta ainda', r.vaiFaltar.includes(D) && !r.faltas.some((f) => f.dia === D), r);
  }
  T.passa('desfazer a falta avisada', await monitor.rpc('creche_falta_futura', { p_plano: pLuna, p_dia: D, p_marcar: false }));
  T.ok('… a falta saiu e a vaga voltou', B.num(`select count(*) from creche_faltas where pet_id='${L.pets.Luna}' and dia='${D}'`) === 0 && ocupam(D) === antes);
  T.passa('anota de novo (para o Mozart ver)', await monitor.rpc('creche_falta_futura', { p_plano: pLuna, p_dia: D }));

  T.secao('Mozart: ver_planos_creche');
  const ctx = (sb, vejo) => ({ sb, petshop: { id: P, horario }, agora: `${L.hoje}T10:00`, fusoMin: -180, vejoFinanceiro: vejo });
  const doMonitor = (await MZ.consultarPlanosDaCreche(ctx(monitor, false), { pet_id: L.pets.Luna })).resultado;
  const luna = doMonitor.planos[0];
  T.ok('acha o plano da Luna com os dias da semana', luna && luna.pet === 'Luna' && luna.dias_da_semana.length === 7, doMonitor);
  T.ok('mostra a falta avisada nos próximos dias', luna.proximos_dias.some((x) => /vai faltar/.test(x.estado)), luna.proximos_dias);
  T.ok('sem valor para quem não recebe (monitora)', !('mensalidade' in luna) && !JSON.stringify(doMonitor).includes('520'), luna);
  const doDono = (await MZ.consultarPlanosDaCreche(ctx(dono, true), { pet_id: L.pets.Luna })).resultado;
  T.ok('com valor para o dono (R$ 520)', doDono.planos[0].mensalidade === 520, doDono.planos[0]);
  const semPlano = (await MZ.consultarPlanosDaCreche(ctx(monitor, false), { pet_id: L.pets.Rex })).resultado;
  T.ok('pet sem plano: diz que não tem', semPlano.planos.length === 0 && /não tem plano/.test(semPlano.aviso), semPlano);

  T.secao('corrigir a hora de chegada e de saída');
  // taxa de busca fora do horário: 18:00, R$ 30, sem tolerância
  B.sql(`insert into hotel_precos (petshop_id, atraso) values ('${P}', '{"ativo": true, "tolerancia": 0, "creche": {"hora": "18:00", "valor": 30}}'::jsonb)
         on conflict (petshop_id) do update set atraso = excluded.atraso`);
  const ontem = L.dia(-1);
  B.must(await monitor.rpc('creche_chamada', { p_plano: pLuna, p_dia: ontem, p_acao: 'chegou' }), 'presença de ontem');
  const est = B.sql(`select id from estadias where pet_id='${L.pets.Luna}' and dia='${ontem}'`);
  const as = (dia, hh) => B.sql(`select to_char(('${dia} ${hh}'::timestamp at time zone '${L.fuso}') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`);
  const corrigir = (sb, campos) => sb.rpc('estadia_corrigir_horas', { p_estadia: est, p_motivo: 'saiu mais tarde, a monitora marcou antes', ...campos });
  const taxa = () => B.sql(`select coalesce((select estado from creche_atrasos where estadia_id='${est}'), 'sem')`);
  T.recusa('a monitora não corrige', await corrigir(monitor, { p_saida: as(ontem, '19:30') }), /Só o dono ou quem cuida do financeiro/);
  T.recusa('a recepção (caixa, sem financeiro) não corrige', await corrigir(caixa, { p_saida: as(ontem, '19:30') }), /Só o dono ou quem cuida do financeiro/);
  T.recusa('sem motivo: recusado', await dono.rpc('estadia_corrigir_horas', { p_estadia: est, p_saida: as(ontem, '19:30'), p_motivo: '' }), /motivo/);
  T.recusa('saída noutro dia: recusado', await corrigir(dono, { p_saida: as(L.hoje, '07:30') }), /mesmo dia/);
  T.recusa('saída antes da chegada: recusado', await corrigir(dono, { p_saida: as(ontem, '07:00') }), /depois da chegada/);
  let r = await corrigir(dono, { p_saida: as(ontem, '19:30') });
  T.passa('o dono põe a saída às 19h30', r, r.data && r.data.taxa === 'anotada');
  T.ok('… a taxa de busca fora do horário fica para decidir (pendente, sem valor)', taxa() === 'pendente');
  T.ok('… a hora ficou gravada', B.sql(`select to_char(saida at time zone '${L.fuso}', 'HH24:MI') from estadias where id='${est}'`) === '19:30');
  r = await corrigir(dono, { p_saida: as(ontem, '17:40') });
  T.passa('corrige para 17h40 (dentro do horário)', r, r.data && r.data.taxa === 'tirada');
  T.ok('… a taxa saiu', taxa() === 'sem');
  r = await corrigir(dono, { p_saida: as(ontem, '19:10'), p_entrada: as(ontem, '09:15') });
  T.passa('19h10 de novo, e a chegada às 9h15', r, r.data && r.data.taxa === 'anotada');
  // a taxa foi recebida na hora (conta paga ligada): a hora não pode tirar o atraso
  const lanc = B.sql(`insert into lancamentos (petshop_id, tipo, valor, forma, categoria, data, pago) values ('${P}', 'entrada', 30, 'pix', 'Creche e hotel', '${ontem}', true) returning id`).split('\n')[0];
  B.sql(`update creche_atrasos set estado='recebida', valor=30, lancamento_id='${lanc}' where estadia_id='${est}'`);
  T.recusa('taxa já cobrada: pôr a saída no horário é recusado', await corrigir(dono, { p_saida: as(ontem, '17:00') }), /já foi cobrada/);
  r = await corrigir(dono, { p_saida: as(ontem, '19:20') });
  T.passa('… ainda fora do horário: muda a hora e a taxa fica como está', r, r.data && r.data.taxa === 'mantida' && taxa() === 'recebida');
  T.ok('cada correção fica anotada com o motivo (4)', B.num(`select count(*) from estadias_horas_hist where estadia_id='${est}' and motivo like 'saiu mais tarde%'`) === 4);
  const hist = await monitor.from('estadias_horas_hist').select('*').eq('estadia_id', est);
  T.passa('a equipe da creche lê as correções (sem valor nenhum)', hist, (hist.data ?? []).length === 4 && !JSON.stringify(hist.data).includes('"valor"'));
  T.recusa('ninguém grava direto na anotação', await dono.from('estadias_horas_hist').insert({ petshop_id: P, estadia_id: est, motivo: 'x' }).select('id'));
  // hotel: chegada de quem está na casa
  const hot = B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Rex, tipo: 'hotel', entrada: new Date(Date.now() - 2 * 864e5).toISOString(), status: 'em_casa' }).select('id').single(), 'hotel').id;
  const nova = new Date(Date.now() - 3 * 864e5).toISOString();
  T.passa('hotel: o dono corrige a chegada de quem está na casa', await dono.rpc('estadia_corrigir_horas', { p_estadia: hot, p_entrada: nova, p_motivo: 'chegou um dia antes' }));
  T.ok('… a chegada mudou', Math.abs(Number(B.sql(`select extract(epoch from entrada) from estadias where id='${hot}'`)) * 1000 - new Date(nova).getTime()) < 1000);
  T.recusa('hotel: saída de quem ainda está na casa é no Saiu', await dono.rpc('estadia_corrigir_horas', { p_estadia: hot, p_saida: new Date().toISOString(), p_motivo: 'teste' }), /ainda está na casa/);
  T.recusa('hora no futuro: recusada', await dono.rpc('estadia_corrigir_horas', { p_estadia: hot, p_entrada: new Date(Date.now() + 3600e3).toISOString(), p_motivo: 'teste' }), /futuro/);

  T.secao('acerto da saída que não some');
  const M = B.somaDias(L.hoje.slice(0, 8) + '28', 7).slice(0, 8) + '01'; // mês que vem: nada depende de hoje
  const fimM = B.somaDias(B.somaDias(M, 31).slice(0, 8) + '01', -1);
  const pBob = await novoPlano('Bob', [1, 2, 3, 4, 5], L.mesAnterior, 1100);
  const cBob = B.must(await dono.rpc('creche_cobranca_criar', { p_plano: pBob, p_mes: M }), 'cobrança do mês cheio');
  const saida = B.somaDias(M, 17);
  B.must(await dono.from('creche_planos').update({ fim: saida }).eq('id', pBob).select('id'), 'plano termina');
  let n = 0, todos = 0; for (let d = M; d <= fimM; d = B.somaDias(d, 1)) { const w = B.diaDaSemana(d); if (w >= 1 && w <= 5) { todos++; if (d <= saida) n++; } }
  const esperado = Math.round(1100 * n / todos * 100) / 100;
  const ler = async () => {
    const planos = B.must(await dono.from('creche_planos').select(CR.SELECT_PLANO).eq('id', pBob), 'plano');
    const cs = B.must(await dono.from('creche_cobrancas').select(CR.SELECT_COBRANCA).eq('id', cBob), 'cobrança');
    return CR.saidasParaAcertar(planos, cs, horario);
  };
  let lista = await ler();
  T.ok(`a mensalidade cheia do mês da saída pede acerto: R$ 1.100,00 × ${n}/${todos} = R$ ${esperado.toFixed(2)} (à mão)`, lista.length === 1 && lista[0].frase.includes(U.brl(esperado)) && lista[0].frase.includes(U.brl(1100)), lista.map((x) => x.frase));
  T.ok('… a conta do banco é a mesma', Number(B.sql(`select public.creche_sugestao_mensal('${pBob}', '${M}', 1100)`)) === esperado);
  B.must(await dono.rpc('creche_cobranca_anotar', { p_id: cBob, p_obs: `${CR.notaDaSaida(saida)}: mensalidade mantida` }), 'deixar como está');
  T.ok('"Deixar como está" fica anotado e o aviso some', (await ler()).length === 0);
  B.must(await dono.rpc('creche_cobranca_anotar', { p_id: cBob, p_obs: '' }), 'tira a anotação');
  T.ok('sem a anotação, o aviso volta (não depende da folha aberta)', (await ler()).length === 1);
  B.must(await dono.rpc('creche_cobranca_editar', { p_id: cBob, p_valor: esperado, p_desconto: 0, p_vencimento: B.sql(`select vencimento from creche_cobrancas where id='${cBob}'`) }), 'acertar');
  T.ok(`acertada para R$ ${esperado.toFixed(2)}: o aviso some`, (await ler()).length === 0 && Number(B.sql(`select total from creche_cobrancas where id='${cBob}'`)) === esperado);
}))();
