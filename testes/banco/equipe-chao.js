// Rodada 9 (N6): a equipe do chão (tosador, monitor) e os cuidados do hotel (migração 20261232).
//  - H1: quem não mexe com dinheiro recebe só o TOTAL da própria comissão e a quantidade de atendimentos: nem base, nem percentual,
//    nem valor por linha, em minha_comissao, comissao_extrato e na ferramenta ver_comissao do Mozart; o extrato vale por mês inteiro.
//    O dono liga "comissao.mostrar_valores" e os valores voltam. E a varredura: tudo o que a sessão do tosador e a do monitor leem
//    pela API (todas as tabelas e todas as funções de leitura) não traz nenhum dos preços semeados.
//  - H2: "Entregue ao tutor" no quadro conclui o atendimento: entra em Atendimentos para cobrar e na comissão, como o Concluir da Agenda.
//  - Mensalista: plano, valor e primeira cobrança numa gravação só (creche_plano_salvar): falhou uma parte, nada fica.
//  - Mozart do chão: ver_cuidados, marcar_cuidado, mover_no_quadro e registrar_ocorrencia, com as áreas de cada um.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('equipe-chao');
const F = lib('assistente/ferramentas');
const R = lib('reservado');
const A = lib('acessos');
const PM = lib('assistente/permissao');

// preços quebrados, fáceis de achar numa resposta
const PRECO = { Banho: 67.31, 'Banho e tosa': 123.47, 'Hidratação': 44.83, 'Corte de unhas': 21.77 };
const DIARIAS = { creche: 58.13, hotel: 96.29 };
const MENSAL = 612.43, PRODUTO = 31.57;
const PROIBIDOS = [...Object.values(PRECO), ...Object.values(DIARIAS), MENSAL, PRODUTO];
/** O texto traz algum dos preços semeados? (67.31 ou "67,31") */
// sem número nem dois-pontos colado antes (a hora "12:34:21.773Z" não é o preço 21,77) e sem número depois
const achados = (texto) => PROIBIDOS.filter((v) => new RegExp(`(?<![\\d:.,])${v.toFixed(2).replace('.', '[.,]')}(?!\\d)`).test(texto));

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Chão' });
  const { dono, tosador, monitor: mon, caixa } = L.sb;
  const P = L.P;

  for (const [nome, v] of Object.entries(PRECO)) B.must(await dono.from('servicos').update({ preco_p: v, preco_m: v, preco_g: v, preco_gg: v }).eq('id', L.S[nome]).select('id'), 'preço ' + nome);
  B.must(await dono.from('petshops').update({ diaria_creche: DIARIAS.creche, diaria_hotel: DIARIAS.hotel }).eq('id', P).select('id'), 'diárias');
  B.must(await dono.from('produtos').update({ preco_venda: PRODUTO }).eq('id', L.prod).select('id'), 'preço do produto');

  const marcar = async (pet, hora, servico = 'Banho', o = {}) => {
    const ini = B.instante(L.hoje, hora, L.fuso);
    return B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets[pet], servico_id: L.S[servico], profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: PRECO[servico], ...o }).select('id').single(), 'marcar ' + pet).id;
  };
  const mel = await marcar('Mel', '08:00');
  const thor = await marcar('Thor', '09:00', 'Banho e tosa');
  const bob = await marcar('Bob', '10:00');
  const status = (id) => B.sql(`select status from agendamentos where id='${id}'`);
  const mover = (sb, id, para) => sb.rpc('quadro_mover', { p_petshop: P, p_agendamento: id, p_para: para });

  /* ---------- H2 ---------- */
  T.secao('H2: entregue pelo quadro conclui, entra em Atendimentos para cobrar e na comissão');
  B.must(await tosador.from('agendamentos').update({ status: 'em_atendimento' }).eq('id', mel).select('id'), 'Mel chegou');
  B.must(await tosador.from('agendamentos').update({ status: 'concluido' }).eq('id', mel).select('id'), 'Mel concluída pela agenda');
  T.passa('Thor chega pelo quadro', await mover(tosador, thor, 'banho'));
  T.passa('Thor pronto', await mover(tosador, thor, 'pronto'));
  const ent = await mover(tosador, thor, 'entregue');
  T.passa('Thor entregue ao tutor', ent, ent.data?.status === 'concluido' && Boolean(ent.data?.entregue_em));
  T.ok('o horário do Thor ficou concluído', status(thor) === 'concluido', status(thor));
  const paraCobrar = async (sb) => ((await sb.rpc('agendamentos_para_cobrar', { p: P })).data ?? []).map((x) => x.id);
  const doDono = await paraCobrar(dono);
  T.ok('Atendimentos para cobrar do dono traz o Thor (entregue pelo quadro) e a Mel (concluída na agenda)', doDono.includes(thor) && doDono.includes(mel), doDono);
  T.ok('o tosador recebe a marca Falta cobrar (sem valor) dos dois', (await paraCobrar(tosador)).includes(thor));
  T.ok('nenhum dinheiro lançado pelo quadro', B.num(`select count(*) from lancamentos where agendamento_id='${thor}'`) === 0);
  T.ok('o valor do atendimento ficou guardado na hora de concluir (como na agenda)', B.num(`select valor_concluido from agendamentos where id='${thor}'`) === PRECO['Banho e tosa']);
  const dois = await Promise.all([mover(tosador, thor, 'entregue'), mover(tosador, thor, 'entregue')]);
  T.ok('entregar de novo (dois toques) não muda nada', dois.every((r) => !r.error && r.data?.status === 'concluido'));
  T.recusa('entregue (concluído) não volta para Esperando', await mover(tosador, thor, 'esperando'), /concluído/);
  T.recusa('entregue sem ter chegado continua recusado', await mover(tosador, bob, 'entregue'), /não chegou/);
  T.recusa('a monitora (sem agenda) não entrega', await mover(mon, bob, 'banho'), /agenda/);
  const extDono = B.must(await dono.rpc('comissao_extrato', { p_petshop: P, p_de: L.hoje, p_ate: L.hoje }), 'extrato do dono');
  const tito = extDono.find((x) => x.profissional_id === L.ids.tosador);
  const real = (x) => Math.round(x * 100) / 100;
  const esperado = real(real(PRECO.Banho * 0.4) + real(PRECO['Banho e tosa'] * 0.4));
  T.ok('a comissão conta os dois: o concluído na agenda e o entregue pelo quadro', tito?.atendimentos === 2 && Math.abs(Number(tito.comissao) - esperado) < 0.011, tito && { n: tito.atendimentos, c: tito.comissao, esperado });

  /* ---------- H1 ---------- */
  T.secao('H1: comissão de quem não mexe com dinheiro: só o total');
  const minha = B.must(await tosador.rpc('minha_comissao', { p_petshop: P }), 'minha_comissao');
  const mes = minha.meses[0];
  T.ok('minha_comissao: total do mês e quantos atendimentos', mes.atendimentos === 2 && Math.abs(Number(mes.comissao) - esperado) < 0.011 && minha.tem_comissao === true && minha.so_total === true, mes);
  T.ok('minha_comissao: sem base, sem percentual, sem a divisão por serviço', minha.pct === null && mes.base === null && mes.base_produtos === null && mes.comissao_servicos === null && mes.comissao_produtos === null, { pct: minha.pct, mes });
  const ext = B.must(await tosador.rpc('comissao_extrato', { p_petshop: P, p_de: L.hoje, p_ate: L.hoje }), 'extrato do tosador');
  T.ok('comissao_extrato: só a própria pessoa, com o total', ext.length === 1 && ext[0].profissional_id === L.ids.tosador && Math.abs(Number(ext[0].comissao) - esperado) < 0.011 && ext[0].so_total === true, ext[0] && { c: ext[0].comissao });
  T.ok('comissao_extrato: base e percentual vazios', ext[0].pct === null && ext[0].base === null && ext[0].base_produtos === null);
  T.ok('comissao_extrato: as linhas dizem o pet e o serviço, sem valor nenhum', ext[0].linhas.length === 2 && ext[0].linhas.every((l) => l.base === null && l.pct === null && l.valor === null && l.valor_exato === null && l.pet && l.servico), ext[0].linhas);
  const fimDoMes = B.somaDias(B.somaDias(L.mes1, 32).slice(0, 8) + '01', -1);
  T.ok('pedir um dia só vale o mês inteiro (um dia não isola o valor de um atendimento)', ext[0].de === L.mes1 && ext[0].ate === fimDoMes, { de: ext[0].de, ate: ext[0].ate });
  T.ok('nenhum preço nas duas respostas', achados(JSON.stringify([minha, ext])).length === 0, achados(JSON.stringify([minha, ext])));
  T.ok('o dono continua com tudo: base, percentual e valor por linha', Number(tito.pct) === 40 && Number(tito.base) > 0 && tito.linhas.every((l) => Number(l.base) > 0 && Number(l.valor) > 0) && tito.de === L.hoje);
  const extMon = B.must(await mon.rpc('comissao_extrato', { p_petshop: P, p_de: L.hoje, p_ate: L.hoje }), 'extrato da monitora');
  T.ok('a monitora (sem comissão) recebe só a linha dela, zerada e sem valores', extMon.length <= 1 && achados(JSON.stringify(extMon)).length === 0 && !JSON.stringify(extMon).includes(L.ids.tosador));
  const extCaixa = B.must(await caixa.rpc('comissao_extrato', { p_petshop: P, p_de: L.hoje, p_ate: L.hoje, p_profissional: L.ids.tosador }), 'extrato pedido pela recepção');
  T.ok('a recepção (caixa, sem financeiro) não lê a comissão do tosador', !JSON.stringify(extCaixa).includes(L.ids.tosador));

  async function contexto(papel, agora = `${L.hoje}T10:00`) {
    const sb = L.sb[papel];
    const u = (await sb.auth.getUser()).data.user;
    const [p, e, s] = await Promise.all([R.lerPetshop(sb, P), R.lerEquipe(sb, P), R.lerServicos(sb, P)]);
    const eu = (e.data || []).find((x) => x.user_id === u.id && x.ativo);
    return { sb, userId: u.id, petshop: p.data, eu, equipe: e.data || [], servicos: s.data || [], areas: A.areasDe(eu),
      vejoFinanceiro: A.podeArea(eu, 'caixa') || A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'),
      cuidoDoFinanceiro: A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'), fusoMin: -180, agora };
  }
  const cTos = await contexto('tosador');
  const moz = await F.rodarConsulta(cTos, 'ver_comissao', {});
  const mozJ = JSON.parse(moz.conteudo);
  T.ok('Mozart (ver_comissao) para o tosador: total e atendimentos', !moz.erro && mozJ.pessoas?.[0]?.atendimentos === 2 && Math.abs(mozJ.pessoas[0].comissao_total - esperado) < 0.011 && Boolean(mozJ.so_total), moz.conteudo.slice(0, 300));
  T.ok('Mozart: nenhum campo de base, percentual ou valor por linha chega ao modelo', !/"base|"pct|"valor"|base_servicos|comissao_servicos/.test(JSON.stringify(mozJ.pessoas)) && achados(moz.conteudo).length === 0, moz.conteudo.slice(0, 400));
  const mozDono = JSON.parse((await F.rodarConsulta(await contexto('dono'), 'ver_comissao', {})).conteudo);
  T.ok('Mozart para o dono: continua linha por linha, com a base', mozDono.pessoas.some((p) => p.base_servicos > 0 && p.linhas.some((l) => l.base > 0 && l.pct === 40)) && !mozDono.so_total);

  T.secao('H1: o dono liga "a pessoa vê o valor de cada atendimento"');
  T.recusa('o tosador não liga a opção', await tosador.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'comissao.mostrar_valores': true } }), /dono/);
  T.passa('o dono liga', await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'comissao.mostrar_valores': true } }));
  const minha2 = B.must(await tosador.rpc('minha_comissao', { p_petshop: P }), 'minha_comissao com a opção');
  const ext2 = B.must(await tosador.rpc('comissao_extrato', { p_petshop: P, p_de: L.hoje, p_ate: L.hoje }), 'extrato com a opção');
  T.ok('com a opção: base, percentual e valor por linha aparecem para a própria pessoa', Number(minha2.pct) === 40 && Number(minha2.meses[0].base) > 0 && minha2.so_total === false && ext2[0].linhas.every((l) => Number(l.valor) > 0) && ext2[0].de === L.hoje);
  T.ok('com a opção, a monitora continua sem a comissão do tosador', !JSON.stringify(B.must(await mon.rpc('comissao_extrato', { p_petshop: P, p_de: L.hoje, p_ate: L.hoje, p_profissional: L.ids.tosador }), 'x')).includes(L.ids.tosador));
  T.passa('o dono desliga', await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'comissao.mostrar_valores': false } }));
  T.ok('desligada, volta a só o total', B.must(await tosador.rpc('minha_comissao', { p_petshop: P }), 'x').pct === null);

  /* ---------- mensalista ---------- */
  T.secao('mensalista numa gravação só (creche_plano_salvar)');
  const campos = { dias: [1, 3, 5], vence_dia: 10, inicio: L.mes1, fim: null, obs: null, pausa_de: null, pausa_ate: null, taxi: null, primeira_cobranca: L.mes1 };
  const salvar = (sb, o = {}) => sb.rpc('creche_plano_salvar', { p_petshop: P, p_pet: L.pets.Rex, p_plano: null, p_campos: campos, p_valores: { valor_mensal: MENSAL, valor_extra: null, modelo_id: null, taxi_valor: null, taxi_modo: 'dia' }, p_cobranca: null, ...o });
  const planos = () => B.num(`select count(*) from creche_planos where petshop_id='${P}'`);
  const valores = () => B.num(`select count(*) from creche_planos_valores where petshop_id='${P}'`);
  T.recusa('valor impossível: a gravação inteira é recusada', await salvar(dono, { p_valores: { valor_mensal: 99999999, taxi_modo: 'dia' } }));
  T.ok('nada ficou: nem plano "sem valor"', planos() === 0 && valores() === 0, { planos: planos(), valores: valores() });
  T.recusa('primeira cobrança num mês em que o plano não vale: a gravação inteira é recusada', await salvar(dono, { p_cobranca: { mes: B.somaDias(L.mes1, -40).slice(0, 8) + '01', valor: MENSAL, vencimento: L.hoje } }), /não vale|cobrado/);
  T.ok('nada ficou de novo', planos() === 0 && valores() === 0);
  T.recusa('a monitora não cadastra mensalista', await salvar(mon, { p_valores: null }), /dono|financeiro/);
  T.recusa('outro pet shop é recusado', await salvar(dono, { p_petshop: B.uuid() }));
  const feito = await salvar(dono, { p_cobranca: { mes: L.mes1, valor: MENSAL, vencimento: L.dia(3) } });
  T.passa('o dono salva plano + valor + primeira cobrança', feito, Boolean(feito.data?.id && feito.data?.cobranca_id));
  T.ok('as três partes entraram juntas', planos() === 1 && valores() === 1 && B.num(`select count(*) from creche_cobrancas where plano_id='${feito.data?.id}'`) === 1
    && B.num(`select valor_mensal from creche_planos_valores where plano_id='${feito.data?.id}'`) === MENSAL);
  const muda = await dono.rpc('creche_plano_salvar', { p_petshop: P, p_pet: L.pets.Rex, p_plano: feito.data.id, p_campos: { ...campos, dias: [2, 4] }, p_valores: { valor_mensal: MENSAL, valor_extra: 40, modelo_id: null, taxi_valor: null, taxi_modo: 'dia' } });
  T.passa('alterar o plano pela mesma função', muda, B.sql(`select array_to_string(dias, ',') from creche_planos where id='${feito.data.id}'`) === '2,4' && B.num(`select valor_extra from creche_planos_valores where plano_id='${feito.data.id}'`) === 40);
  T.recusa('anônimo não executa', await B.cliente().rpc('creche_plano_salvar', { p_petshop: P, p_pet: L.pets.Rex, p_plano: null, p_campos: campos }));

  /* ---------- Mozart do chão ---------- */
  T.secao('Mozart do chão: quem recebe cada ferramenta');
  const nomes = (c) => F.ferramentasPara(c).map((f) => f.name);
  const cMon = await contexto('monitor', `${L.hoje}T13:10`);
  const nTos = nomes(cTos), nMon = nomes(cMon);
  T.ok('tosador (Agenda): move no quadro; não recebe doses nem ocorrências', nTos.includes('mover_no_quadro') && !nTos.includes('marcar_cuidado') && !nTos.includes('registrar_ocorrencia') && !nTos.includes('ver_cuidados'), nTos);
  T.ok('monitora (Creche e hotel): doses e ocorrências; não move o quadro nem lê a agenda', nMon.includes('marcar_cuidado') && nMon.includes('registrar_ocorrencia') && nMon.includes('ver_cuidados') && !nMon.includes('mover_no_quadro') && !nMon.includes('ver_agenda'), nMon);
  T.ok('a recusa explica a área que falta', /Creche e hotel/.test(PM.motivoDaRecusa(F.definicao('marcar_cuidado'), cTos)) && /Agenda/.test(PM.motivoDaRecusa(F.definicao('mover_no_quadro'), cMon)));

  T.secao('Mozart: mover no quadro');
  const cartaoBob = await F.descrever(cTos, 'mover_no_quadro', { pet_id: L.pets.Bob });
  T.ok('cartão sem etapa dita: a próxima (Esperando → No banho)', cartaoBob.titulo === 'Mudar a etapa no Quadro do dia' && cartaoBob.linhas.some(([k, v]) => k === 'Para' && v === 'No banho') && cartaoBob.linhas.some(([k, v]) => k === 'De' && v === 'Esperando'), cartaoBob);
  T.ok('o cartão não mostra valor', achados(JSON.stringify(cartaoBob)).length === 0);
  T.ok('nada gravado só com o cartão', status(bob) === 'marcado');
  const g1 = await F.gravar(cTos, 'mover_no_quadro', { pet_id: L.pets.Bob });
  T.ok('"Pode fazer": o Bob chegou e está no banho', g1.feito && status(bob) === 'em_atendimento' && B.sql(`select etapa from quadro_atendimento where agendamento_id='${bob}'`) === 'banho', g1);
  await F.gravar(cTos, 'mover_no_quadro', { pet_id: L.pets.Bob, para: 'pronto' });
  const cartaoEnt = await F.descrever(cTos, 'mover_no_quadro', { pet_id: L.pets.Bob, para: 'entregue' });
  T.ok('entregar sem conta fechada: o cartão avisa que fica concluído e Falta cobrar', cartaoEnt.linhas.some(([k, v]) => k === 'Conta' && /Falta cobrar/.test(v)), cartaoEnt.linhas);
  const g2 = await F.gravar(cTos, 'mover_no_quadro', { pet_id: L.pets.Bob, para: 'entregue' });
  T.ok('entregue pelo Mozart conclui', g2.feito && status(bob) === 'concluido' && (await paraCobrar(dono)).includes(bob), g2);
  let erro = null;
  try { await F.descrever(cTos, 'mover_no_quadro', { pet_id: L.pets.Bob }); } catch (e) { erro = e; }
  T.ok('já entregue: explica e não monta cartão', F.ehErroDeUso(erro) && /já foi entregue/.test(erro.message), erro?.message);
  erro = null;
  try { await F.descrever(cTos, 'mover_no_quadro', { pet_id: L.pets.Luna }); } catch (e) { erro = e; }
  T.ok('pet sem horário hoje: explica', F.ehErroDeUso(erro) && /não tem horário hoje/.test(erro.message), erro?.message);

  T.secao('Mozart: doses e ocorrência (creche e hotel)');
  const cuidados = [
    { id: 'racao1', tipo: 'comida', oque: 'Ração', quanto: '1 xícara', horas: ['08:00', '13:00', '18:00'] },
    { id: 'gard1', tipo: 'remedio', oque: 'Gardenal', quanto: '1 comprimido', horas: ['08:00', '20:00'] },
  ];
  const estadia = B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Luna, tipo: 'hotel', status: 'em_casa', entrada: B.instante(L.dia(-1), '09:00', L.fuso).toISOString(), saida_prevista: B.instante(L.dia(2), '18:00', L.fuso).toISOString(), cuidados, obs: 'Passeio às 17h' }).select('id').single(), 'check-in da Luna').id;
  const ver = JSON.parse((await F.rodarConsulta(cMon, 'ver_cuidados', {})).conteudo);
  const luna = ver.pets?.find((p) => p.pet === 'Luna');
  const dose = (oque, hora) => luna?.cuidados.find((x) => x.oque === oque)?.doses.find((d) => d.hora === hora)?.situacao;
  T.ok('ver_cuidados lê a lista (não as observações): às 13h10, ração das 8h e Gardenal das 8h ATRASADOS, ração das 13h na hora, o resto mais tarde',
    dose('Ração', '08:00') === 'ATRASADA' && dose('Gardenal', '08:00') === 'ATRASADA' && dose('Ração', '13:00') === 'na hora' && dose('Ração', '18:00') === 'mais tarde' && dose('Gardenal', '20:00') === 'mais tarde' && ver.doses_atrasadas === 2 && ver.doses_na_hora === 1, luna);
  T.ok('ver_cuidados não traz diária nem valor', achados(JSON.stringify(ver)).length === 0);
  const cartaoDose = await F.descrever(cMon, 'marcar_cuidado', { pet_id: L.pets.Luna, cuidado: 'ração' });
  T.ok('"dei a ração da Luna" às 13h10: a dose é a das 13h (a pendente mais perto de agora)', cartaoDose.titulo === 'Marcar dose como feita' && cartaoDose.linhas.some(([k, v]) => k === 'Dose' && /13h/.test(v)), cartaoDose.linhas);
  T.ok('só o cartão não marca', B.num(`select count(*) from estadias_cuidados where estadia_id='${estadia}'`) === 0);
  const gd = await F.gravar(cMon, 'marcar_cuidado', { pet_id: L.pets.Luna, cuidado: 'ração' });
  T.ok('"Pode fazer": a dose das 13h fica feita, em nome da monitora', gd.feito && B.sql(`select item || '|' || hora || '|' || feito_nome from estadias_cuidados where estadia_id='${estadia}'`) === 'racao1|13:00|Mário Monitor');
  const gr = await F.gravar(cMon, 'marcar_cuidado', { pet_id: L.pets.Luna, cuidado: 'remédio', hora: '08:00' });
  T.ok('"a Luna tomou o remédio das 8h": o Gardenal das 8h', gr.feito && B.num(`select count(*) from estadias_cuidados where estadia_id='${estadia}' and item='gard1' and hora='08:00'`) === 1);
  erro = null;
  try { await F.descrever(cMon, 'marcar_cuidado', { pet_id: L.pets.Luna, cuidado: 'Gardenal', hora: '08:00' }); } catch (e) { erro = e; }
  T.ok('dose já feita: diz quem fez e não marca de novo', F.ehErroDeUso(erro) && /já estava marcado como feito por Mário/.test(erro.message), erro?.message);
  erro = null;
  try { await F.descrever(cMon, 'marcar_cuidado', { pet_id: L.pets.Luna, cuidado: 'antibiótico' }); } catch (e) { erro = e; }
  T.ok('remédio fora da lista: diz o que está combinado', F.ehErroDeUso(erro) && /Ração.*Gardenal|Gardenal.*Ração/.test(erro.message), erro?.message);
  erro = null;
  try { await F.descrever(cMon, 'marcar_cuidado', { pet_id: L.pets.Rex, cuidado: 'ração' }); } catch (e) { erro = e; }
  T.ok('pet que não está na casa: explica', F.ehErroDeUso(erro) && /não está na casa/.test(erro.message), erro?.message);

  const obsAntes = B.sql(`select coalesce(obs,'') || '|' || coalesce(alertas,'') from pets where id='${L.pets.Luna}'`);
  const cartaoOc = await F.descrever(cMon, 'registrar_ocorrencia', { pet_id: L.pets.Luna, tipo: 'vomitou', texto: 'Vomitou no pátio depois do almoço' });
  T.ok('cartão da ocorrência', cartaoOc.titulo === 'Registrar ocorrência' && cartaoOc.linhas.some(([k, v]) => k === 'O que foi' && v === 'Vomitou') && cartaoOc.linhas.some(([k, v]) => k === 'Fica' && /Hoje/.test(v)), cartaoOc.linhas);
  const go = await F.gravar(cMon, 'registrar_ocorrencia', { pet_id: L.pets.Luna, tipo: 'vomitou', texto: 'Vomitou no pátio depois do almoço' });
  const oc = B.sql(`select tipo || '|' || texto || '|' || criado_nome from estadias_ocorrencias where estadia_id='${estadia}'`);
  T.ok('a ocorrência entra em Ocorrências da estadia, com quem anotou', go.feito && oc.startsWith('vomitou|Vomitou no pátio depois do almoço|'), oc);
  T.ok('e NÃO nas observações nem nos alertas da ficha do pet', B.sql(`select coalesce(obs,'') || '|' || coalesce(alertas,'') from pets where id='${L.pets.Luna}'`) === obsAntes);
  await F.gravar(cMon, 'registrar_ocorrencia', { pet_id: L.pets.Luna, tipo: 'vomitou', texto: 'Vomitou no pátio depois do almoço' });
  T.ok('a mesma confirmação de novo não registra duas vezes', B.num(`select count(*) from estadias_ocorrencias where estadia_id='${estadia}'`) === 1);
  T.ok('o dono lê a ocorrência (a tela Hoje mostra)', ((await dono.from('estadias_ocorrencias').select('id').eq('petshop_id', P)).data ?? []).length === 1);
  erro = null;
  try { await F.descrever(cMon, 'registrar_ocorrencia', { pet_id: L.pets.Rex, tipo: 'briga' }); } catch (e) { erro = e; }
  T.ok('pet fora da casa: não registra e explica', F.ehErroDeUso(erro) && /não está na creche nem no hotel/.test(erro.message), erro?.message);
  erro = null;
  try { await F.gravar(cTos, 'registrar_ocorrencia', { pet_id: L.pets.Luna, tipo: 'briga', texto: 'x' }); } catch (e) { erro = e; }
  T.ok('o tosador (sem Creche e hotel) é recusado pelo banco mesmo forçando a ferramenta', Boolean(erro) && B.num(`select count(*) from estadias_ocorrencias where estadia_id='${estadia}'`) === 1, erro?.message);

  /* ---------- varredura ---------- */
  T.secao('H1: varredura de tudo o que a sessão da equipe lê pela API');
  B.must(await dono.from('estadias').update({ status: 'encerrada', saida: new Date().toISOString() }).eq('id', estadia).select('id'), 'check-out da Luna');
  const tabelas = B.sql(`select string_agg(c.relname, ',' order by c.relname) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')`).split(',');
  const colunasLiberadas = (t) => B.sql(`select coalesce(string_agg(column_name, ',' order by ordinal_position), '') from information_schema.columns c where table_schema='public' and table_name='${t}' and has_column_privilege('authenticated', 'public.${t}', column_name, 'SELECT')`);
  // funções de leitura (não mudam nada) que a equipe pode chamar: cada uma com os argumentos preenchidos pelo nome
  const funcoes = B.sql(`select coalesce(string_agg(p.proname || '~' || coalesce(pg_get_function_identity_arguments(p.oid), ''), '^' order by p.proname, p.oid), '')
    from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.provolatile in ('s', 'i') and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')`).split('^').filter(Boolean).map((x) => { const [nome, args] = x.split('~'); return { nome, args: args ? args.split(', ').map((a) => { const [n, ...t] = a.split(' '); return { n, t: t.join(' ') }; }) : [] }; });
  const ag = [mel, thor, bob];
  const valorDe = (a, eu) => {
    const n = a.n.toLowerCase();
    if (a.t === 'uuid') return /^(p|p_petshop|petshop|p_petshop_id|p_loja)$/.test(n) ? P : /agend/.test(n) ? thor : /estadia/.test(n) ? estadia : /plano/.test(n) ? feito.data.id : /prof|pessoa|quem/.test(n) ? eu : /cliente|tutor/.test(n) ? L.tutores.Ana : /produto/.test(n) ? L.prod : /servico/.test(n) ? L.S.Banho : /pet/.test(n) ? L.pets.Thor : P;
    if (a.t === 'uuid[]') return /agend|^p_ids$|^ids$/.test(n) ? ag : /estadia/.test(n) ? [estadia] : /produto/.test(n) ? [L.prod] : /servico/.test(n) ? Object.values(L.S) : /plano/.test(n) ? [feito.data.id] : /pet/.test(n) ? Object.values(L.pets) : ag;
    if (a.t === 'date') return /de$|ini|desde|mes/.test(n) ? L.mes1 : L.hoje;
    if (/^timestamp/.test(a.t)) return /de$|ini|desde/.test(n) ? B.instante(L.mes1, '00:00', L.fuso).toISOString() : new Date(Date.now() + 864e5).toISOString();
    if (a.t === 'text') return /tipo/.test(n) ? 'hotel' : '';
    if (a.t === 'boolean') return true;
    if (/^(integer|smallint|bigint|numeric)/.test(a.t)) return 30;
    if (a.t === 'text[]') return ['agenda'];
    if (a.t === 'jsonb' || a.t === 'json') return n === 'a' ? paramsDoHoje() : {};
    return undefined;
  };
  const ini = B.instante(L.hoje, '00:00', L.fuso);
  const paramsDoHoje = () => ({ hoje_ini: ini.toISOString(), amanha: new Date(+ini + 864e5).toISOString(), depois: new Date(+ini + 2 * 864e5).toISOString(), seg: new Date(+ini - 3 * 864e5).toISOString(), seg7: new Date(+ini + 4 * 864e5).toISOString(),
    ha30: new Date(+ini - 30 * 864e5).toISOString(), dia: L.hoje, ha6: L.dia(-6), mais7: L.dia(7), estoque: true, financeiro: true, cuido: true, pacotes: true, cobrar: true, cobrar_hoje: true, devolucao: [], cred_de: ini.toISOString(), cred_ate: new Date(+ini + 864e5).toISOString(), saude_ate: L.dia(30) });

  for (const papel of ['tosador', 'monitor']) {
    const sb = L.sb[papel];
    const token = (await sb.auth.getSession()).data.session.access_token;
    const pedir = async (caminho, corpo) => {
      const r = await fetch(`${B.SUPABASE_URL}/rest/v1/${caminho}`, { method: corpo === undefined ? 'GET' : 'POST', headers: { apikey: B.SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: corpo === undefined ? undefined : JSON.stringify(corpo) });
      return { status: r.status, texto: await r.text() };
    };
    const vazou = [];
    let lidas = 0, chamadas = 0, comDados = 0;
    for (const t of tabelas) {
      const cols = colunasLiberadas(t);
      for (const sel of ['*', cols].filter(Boolean)) {
        const r = await pedir(`${t}?select=${encodeURIComponent(sel)}&limit=1000`);
        lidas++;
        if (r.status === 200 && r.texto.length > 2) comDados++;
        const a = r.status === 200 ? achados(r.texto) : [];
        if (a.length) vazou.push(`${t} (${sel === '*' ? '*' : 'colunas liberadas'}): ${a.join(', ')}`);
      }
    }
    for (const f of funcoes) {
      const corpo = {};
      let da = true;
      for (const a of f.args) { const v = valorDe(a, L.ids[papel]); if (v === undefined || !a.n) { da = false; break; } corpo[a.n] = v; }
      if (!da) continue;
      const r = await pedir(`rpc/${f.nome}`, corpo);
      chamadas++;
      const a = r.status === 200 ? achados(r.texto) : [];
      if (a.length) vazou.push(`rpc ${f.nome}: ${a.join(', ')}`);
    }
    T.ok(`${papel}: ${lidas} leituras de tabela e ${chamadas} funções de leitura sem nenhum preço semeado`, vazou.length === 0 && lidas > 100 && chamadas > 80 && comDados > 5, vazou.length ? vazou : { lidas, chamadas, comDados });
  }
  // a varredura enxerga: o dono, pelas mesmas chamadas, acha os preços
  const tokenDono = (await dono.auth.getSession()).data.session.access_token;
  const rd = await fetch(`${B.SUPABASE_URL}/rest/v1/rpc/comissao_extrato`, { method: 'POST', headers: { apikey: B.SUPABASE_KEY, Authorization: `Bearer ${tokenDono}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_petshop: P, p_de: L.hoje, p_ate: L.hoje }) });
  T.ok('prova de que a varredura enxerga: na resposta do dono os preços aparecem', achados(await rd.text()).length >= 2);
}))();
