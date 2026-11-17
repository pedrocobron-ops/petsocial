// Modo envio no banco (migração 20261198): gestao_modo_envio (o que espera mensagem, por área), modo_envio_marcar ("Enviou? Sim")
// e mensagens_enviadas. A loja tem: lembrete de amanhã para Thor e Mel (Ana, uma mensagem), Luna amanhã com a Clara que não quer
// receber mensagens, Kiko amanhã com a Eva sem telefone, banho do Thor de hoje concluído (pet pronto), Rex chega amanhã no hotel
// com o Davi de telefone incompleto, a Ana deve 35 (vencido), a V10 do Thor vence em 5 dias, a Mel faz aniversário hoje, o
// pacote do Thor acabou há 3 dias e o Bob não vem há 70 dias. Pela fila do app (montarFila), o dono tem 7 mensagens.
// Papéis: dinheiro só com área de dinheiro; cada tipo pela área; estoque nada; anônimo e outra loja nada.
// Marcar: a marca das outras telas (lembrete_em, pronto_avisado_em, avisos.chegada, cobrado_em) e o registro com quem e quando,
// uma vez por (tipo, ref, dia); ninguém grava direto; tipo de outra área recusado; ref de outra loja ignorada. O Mozart conta.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('modo-envio');
const ME = lib('modo-envio');
const F = lib('assistente/ferramentas');
const R = lib('reservado');
const A = lib('acessos');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Envio' });
  const { dono, caixa, tosador, monitor, estoque } = L.sb;
  const P = L.P;
  const amanha = L.dia(1);
  const ag = async (pet, dia, hora, extra = {}) => {
    const ini = B.instante(dia, hora, L.fuso);
    return B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: pet, servico_id: L.S.Banho, profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 60, ...extra }).select('id').single(), 'horário').id;
  };
  const eva = B.must(await dono.from('clientes').insert({ petshop_id: P, nome: 'Eva Prado' }).select('id').single(), 'Eva').id;
  const kiko = B.must(await dono.from('pets').insert({ petshop_id: P, cliente_id: eva, nome: 'Kiko', especie: 'cao', porte: 'P' }).select('id').single(), 'Kiko').id;
  T.passa('a recepção marca "Não quer receber mensagens" na ficha da Clara', await caixa.from('clientes').update({ nao_quer_mensagens: true }).eq('id', L.tutores.Clara).select('id, nao_quer_mensagens'));
  B.sql(`update clientes set telefone = '1198' where id = '${L.tutores.Davi}'`);
  const aThor = await ag(L.pets.Thor, amanha, '09:00'), aMel = await ag(L.pets.Mel, amanha, '10:00');
  await ag(L.pets.Luna, amanha, '11:00'); await ag(kiko, amanha, '12:00');
  const hojeThor = await ag(L.pets.Thor, L.hoje, '08:00');
  B.must(await dono.from('agendamentos').update({ status: 'concluido' }).eq('id', hojeThor).select('id'), 'concluir');
  const hotel = B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Rex, tipo: 'hotel', status: 'reservada', entrada: B.instante(amanha, '08:00', L.fuso).toISOString(), saida_prevista: B.instante(L.dia(3), '18:00', L.fuso).toISOString() }).select('id').single(), 'reserva').id;
  const conta = B.sql(`insert into lancamentos (petshop_id, tipo, valor, categoria, descricao, data, vencimento, pago, cliente_id, origem)
         values ('${P}', 'entrada', 35, 'Banho e tosa', 'Banho', '${L.dia(-3)}', '${L.dia(-1)}', false, '${L.tutores.Ana}', 'tela') returning id`).split('\n')[0];
  const saude = B.sql(`insert into pets_saude (petshop_id, pet_id, tipo, nome, aplicado_em, vence_em) values ('${P}', '${L.pets.Thor}', 'vacina', 'V10', '${L.dia(-360)}', '${L.dia(5)}') returning id`).split('\n')[0];
  B.sql(`update pets set nascimento = ('${L.hoje}'::date - interval '3 years')::date where id = '${L.pets.Mel}'`);
  const pacote = B.sql(`insert into pacotes_clientes (petshop_id, pet_id, nome, servico_id, total, usados, comprado_em, preco, ativo) values ('${P}', '${L.pets.Thor}', 'Pacote 4 banhos', '${L.S.Banho}', 4, 4, '${L.dia(-30)}', 200, true) returning id`).split('\n')[0];
  B.sql(`insert into agendamentos (petshop_id, pet_id, servico_id, inicio, fim, status, pacote_cliente_id) values
           ('${P}', '${L.pets.Thor}', '${L.S.Banho}', now() - interval '3 days', now() - interval '3 days' + interval '1 hour', 'concluido', '${pacote}'),
           ('${P}', '${L.pets.Bob}', '${L.S.Banho}', now() - interval '70 days', now() - interval '70 days' + interval '1 hour', 'concluido', null)`);

  const ler = (sb) => sb.rpc('gestao_modo_envio', { p: P, p_dias: 15 });
  const fila = (d) => ME.montarFila(d, { id: P, nome: 'Envio', opcoes: {} });

  T.secao('o que espera mensagem');
  const d = B.must(await ler(dono), 'dono');
  const f = fila(d);
  const n = ME.contarPorTipo(f);
  T.ok('dono: 7 mensagens, uma de cada (pronto, lembrete, cobrança, saúde, pacote, aniversário, chamar de volta)', f.mensagens.length === 7
    && ['pronto', 'lembrete', 'cobranca', 'saude', 'pacote', 'niver', 'volta'].every((t) => n[t] === 1), { n, pulados: f.pulados });
  const lemb = f.mensagens.find((m) => m.tipo === 'lembrete');
  T.ok('lembrete: Thor e Mel da Ana numa mensagem só', lemb && lemb.refs.length === 2 && lemb.refs.includes(aThor) && lemb.refs.includes(aMel) && /Thor/.test(lemb.texto) && /Mel/.test(lemb.texto), lemb);
  const motivo = (quem) => f.pulados.filter((p) => p.quem.startsWith(quem)).map((p) => `${p.tipo}:${p.motivo}`).sort().join();
  T.ok('de fora: Clara não quer receber, Eva sem telefone, Davi com telefone incompleto (chegada do Rex)',
    motivo('Clara') === 'lembrete:não quer receber mensagens' && motivo('Eva') === 'lembrete:sem telefone' && motivo('Davi') === 'chegada:telefone incompleto', f.pulados);
  T.ok('a cobrança traz a conta de R$ 35 da Ana', d.itens.cobranca?.length === 1 && Number(d.itens.cobranca[0].total) === 35 && d.itens.cobranca[0].contas[0].id === conta);
  T.ok('chamar de volta: o Bob (70 dias); o Thor (veio hoje) não', d.itens.volta?.length === 1 && d.itens.volta[0].pet.nome === 'Bob', d.itens.volta);

  const rec = B.must(await ler(caixa), 'recepção');
  T.ok('recepção (com caixa): todos os tipos, com a cobrança', ['lembrete', 'pronto', 'chegada', 'saude', 'niver', 'pacote', 'cobranca', 'volta'].every((t) => t in rec.itens), Object.keys(rec.itens));
  const tos = B.must(await ler(tosador), 'tosador');
  T.ok('tosador (agenda e clientes): sem cobrança, pacote nem chegada', ['lembrete', 'pronto', 'saude', 'niver', 'volta'].every((t) => t in tos.itens) && !('cobranca' in tos.itens) && !('pacote' in tos.itens) && !('chegada' in tos.itens), Object.keys(tos.itens));
  const mon = B.must(await ler(monitor), 'monitora');
  T.ok('monitora (clientes e creche/hotel): chegada, saúde, aniversário e chamar de volta; sem agenda nem dinheiro', ['chegada', 'saude', 'niver', 'volta'].every((t) => t in mon.itens) && !('lembrete' in mon.itens) && !('pronto' in mon.itens) && !('cobranca' in mon.itens), Object.keys(mon.itens));
  const est = B.must(await ler(estoque), 'estoque');
  T.ok('estoque: nada para mandar', est && Object.keys(est.itens).length === 0, est);
  T.recusa('anônimo recusado', await ler(B.cliente()));
  const L2 = await criarLoja(null, { nome: 'Envio outra', equipe: false, dados: false });
  T.depois(() => L2.limpar());
  const outra = await ler(L2.sb.dono);
  T.ok('dona de outra loja não lê nada', !outra.error && outra.data === null, outra);

  T.secao('Mozart: quantas mensagens tenho para mandar?');
  async function contexto(papel) {
    const sb = L.sb[papel];
    const u = (await sb.auth.getUser()).data.user;
    const [p, e, s] = await Promise.all([R.lerPetshop(sb, P), R.lerEquipe(sb, P), R.lerServicos(sb, P)]);
    const eu = (e.data || []).find((x) => x.user_id === u.id && x.ativo);
    return { sb, userId: u.id, petshop: p.data, eu, equipe: e.data || [], servicos: s.data || [],
      vejoFinanceiro: A.podeArea(eu, 'caixa') || A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'),
      cuidoDoFinanceiro: A.podeArea(eu, 'financeiro') || A.podeArea(eu, 'relatorios'), fusoMin: -180, agora: `${L.hoje}T10:00` };
  }
  T.ok('mensagens_para_mandar está na lista do Mozart (também sem dinheiro) e não grava', F.ferramentasPara({ vejoFinanceiro: false }).some((t) => t.name === 'mensagens_para_mandar') && F.definicao('mensagens_para_mandar').grava === false);
  const rd = await F.rodarConsulta(await contexto('dono'), 'mensagens_para_mandar', {});
  const jd = JSON.parse(rd.conteudo);
  T.ok('dono: 7, por tipo, os 3 de fora e onde mandar', !rd.erro && jd.total === 7 && jd.por_tipo.length === 7 && jd.ficaram_de_fora.reduce((s, x) => s + x.quantos, 0) === 3 && /Mandar mensagens/.test(jd.onde_mandar), jd);
  const rt = JSON.parse((await F.rodarConsulta(await contexto('tosador'), 'mensagens_para_mandar', {})).conteudo);
  T.ok('tosador: sem cobrança e sem pacote (5)', rt.total === 5 && !rt.por_tipo.some((x) => /Cobrança|pacote/i.test(x.tipo)), rt);

  T.secao('Enviou? Sim');
  const marcar = (sb, tipo, refs) => sb.rpc('modo_envio_marcar', { p: P, p_tipo: tipo, p_refs: refs });
  const r1 = await marcar(dono, 'lembrete', lemb.refs);
  T.passa('dono marca o lembrete da Ana (2 horários)', r1, r1.data?.marcadas === 2);
  T.ok('… lembrete_em gravado nos dois horários (a mesma marca da Agenda e da tela Hoje)', B.num(`select count(*) from agendamentos where id in ('${aThor}', '${aMel}') and lembrete_em is not null`) === 2);
  T.ok('… o registro tem o dia, a hora e quem mandou', B.num(`select count(*) from mensagens_enviadas where petshop_id='${P}' and tipo='lembrete' and enviado_por='${L.ids.dono}' and dia='${L.hoje}' and enviado_em > now() - interval '1 minute'`) === 2);
  const r2 = await marcar(caixa, 'lembrete', lemb.refs);
  T.ok('marcar de novo no mesmo dia não grava outra vez', !r2.error && r2.data.marcadas === 0 && r2.data.ja_estavam === 2 && B.num(`select count(*) from mensagens_enviadas where petshop_id='${P}' and tipo='lembrete'`) === 2, r2.data);
  const [x1, x2] = await Promise.all([marcar(dono, 'niver', [L.pets.Mel]), marcar(caixa, 'niver', [L.pets.Mel])]);
  T.ok('dois toques ao mesmo tempo: um registro só', !x1.error && !x2.error && x1.data.marcadas + x2.data.marcadas === 1 && B.num(`select count(*) from mensagens_enviadas where petshop_id='${P}' and tipo='niver'`) === 1, [x1, x2]);
  T.recusa('o tosador não marca cobrança (sem área de dinheiro)', await marcar(tosador, 'cobranca', [conta]));
  T.recusa('a monitora não marca lembrete (sem Agenda)', await marcar(monitor, 'lembrete', [aThor]));
  T.recusa('estoque não marca nada', await marcar(estoque, 'saude', [saude]));
  T.recusa('anônimo não marca', await marcar(B.cliente(), 'niver', [L.pets.Mel]));
  T.recusa('tipo desconhecido recusado', await marcar(dono, 'spam', [aThor]));
  T.recusa('mais de 50 de uma vez recusado', await marcar(dono, 'niver', Array.from({ length: 51 }, () => B.uuid())));
  const r3 = await marcar(dono, 'saude', [saude, B.uuid()]);
  T.ok('ref que não é desta loja é ignorada', !r3.error && r3.data.marcadas === 1 && r3.data.ignoradas === 1, r3.data);
  T.passa('a recepção marca a cobrança', await marcar(caixa, 'cobranca', [conta]));
  T.ok('… cobrado_em gravado (o mesmo do "Cobrar no WhatsApp")', B.num(`select count(*) from lancamentos where id='${conta}' and cobrado_em is not null`) === 1);
  T.passa('o tosador marca o pet pronto', await marcar(tosador, 'pronto', [hojeThor]));
  T.ok('… pronto_avisado_em gravado (o sininho da Agenda)', B.num(`select count(*) from agendamentos where id='${hojeThor}' and pronto_avisado_em is not null`) === 1);
  T.passa('a monitora marca a chegada do Rex', await marcar(monitor, 'chegada', [hotel]));
  const aviso = B.sql(`select avisos->>'chegada' from estadias where id='${hotel}'`);
  T.ok('… avisos.chegada gravado como data (o mesmo do "Avisar quem chega amanhã")', !Number.isNaN(new Date(aviso).getTime()) && Math.abs(Date.now() - new Date(aviso).getTime()) < 120000, aviso);
  T.passa('pacote e chamar de volta', !(await marcar(caixa, 'pacote', [pacote])).error && !(await marcar(tosador, 'volta', [L.tutores.Beto])).error ? { data: 1 } : { error: { message: 'falhou' } });
  const depois = fila(B.must(await ler(dono), 'dono depois'));
  T.ok('depois de tudo marcado, a fila do dono fica vazia (Clara e Eva continuam de fora; a chegada do Rex, marcada, saiu)', depois.mensagens.length === 0 && depois.pulados.length === 2, depois);

  T.secao('quem lê e quem grava o registro');
  const lido = await tosador.from('mensagens_enviadas').select('tipo, ref, enviado_por').eq('petshop_id', P);
  T.passa('a equipe lê o registro do pet shop', lido, (lido.data ?? []).length >= 7);
  const deFora = await L2.sb.dono.from('mensagens_enviadas').select('id').eq('petshop_id', P);
  T.ok('outra loja não lê', !deFora.error && deFora.data.length === 0);
  T.recusa('ninguém grava direto (nem o dono)', await dono.from('mensagens_enviadas').insert({ petshop_id: P, tipo: 'niver', ref: L.pets.Thor, dia: L.hoje }).select('id'));
  const apagar = await dono.from('mensagens_enviadas').delete().eq('petshop_id', P).select('id');
  T.ok('nem apaga', apagar.error || (apagar.data ?? []).length === 0);
}))();
