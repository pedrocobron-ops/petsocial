// Promoção em dias fracos, aniversário do tutor e pacote acabando (migração 20261205).
// Promoção: o dono monta (promocao_salvar; equipe, anônimo e outra loja não); o banco põe a promoção no horário ao marcar pelo dia,
// pela hora e pelo serviço (a cópia fica no horário: mudar a promoção não mexe nele; horário marcado antes dela não ganha nem ao
// remarcar); a API não escreve a promoção; tirar e pôr de volta (agendamento_promo_usar) por papel; a conta com a promoção passa
// pelo preço travado e vai para promo_usos (o desconto a mais segue a regra de sempre); relatório; o link mostra a promoção (só o
// que pode) e o pedido leva a promoção até o horário aceito.
// Aniversário do tutor: clientes.nascimento (sem ano = 1904; 29/02 no dia 28 em ano não bissexto), 'niver_tutor' no Mandar mensagens
// (não quer receber, uma vez por ano, por área), LGPD (cliente_dados leva, cliente_anonimizar apaga).
// Pacote acabando: pacotes_acabando (1 uso, acabou, vencendo, vencido; quem renovou sai), acabou_em, o texto de oferecer renovar.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('promo-niver-pacote');
const ME = lib('modo-envio');
const PR = lib('promocoes');
const PA = lib('pacote-acabando');
const D = lib('dinheiro');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Promo', modulos: ['banho_tosa', 'creche', 'hotel', 'loja', 'pacotes'] });
  const { dono, caixa: cx, tosador: tos, monitor: mon, estoque: est } = L.sb;
  const P = L.P;
  const L2 = await criarLoja(null, { nome: 'Promo outra', equipe: false, dados: false });
  T.depois(() => L2.limpar());
  B.must(await dono.from('caixas').insert({ petshop_id: P, valor_inicial: 100 }).select('id'), 'abrir o caixa');

  // o dia da promoção: daqui a 2 dias (o dia da semana dele); antes das 11h, só Banho, 10%
  const DIA = L.dia(2), DOW = B.diaDaSemana(DIA);
  const ag = async (sb, pet, dia, hora, extra = {}) => {
    const ini = B.instante(dia, hora, L.fuso);
    return sb.from('agendamentos').insert({ petshop_id: P, pet_id: pet, servico_id: L.S.Banho, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), ...extra }).select('id, promo').single();
  };
  const promoDe = (id) => JSON.parse(B.sql(`select coalesce(promo, 'null'::jsonb) from agendamentos where id='${id}'`));
  const salvar = (sb, id, dados, p = P) => sb.rpc('promocao_salvar', { p, p_id: id, p_dados: dados });

  T.secao('o dono monta a promoção');
  // marcado ANTES de a promoção existir: não ganha a promoção nem quando for remarcado
  const antes = B.must(await ag(dono, L.pets.Luna, DIA, '08:00', { preco: 60 }), 'horário de antes').id;
  const base = { nome: 'Terça do banho', dias: [DOW], hora_de: null, hora_ate: '11:00', servicos: [L.S.Banho], tipo: 'pct', valor: 10, comeca_em: null, termina_em: null, ativa: true };
  const r1 = await salvar(dono, null, base);
  T.passa('dono cria "Terça do banho": o dia da semana, antes das 11h, Banho, 10%', r1);
  const promo1 = r1.data;
  T.recusa('a recepção não cria promoção', await salvar(cx, null, base), /dono/);
  T.recusa('o tosador não muda a promoção', await salvar(tos, promo1, { ...base, valor: 50 }), /dono/);
  T.recusa('anônimo não cria', await salvar(B.cliente(), null, base));
  T.recusa('a dona de outra loja não cria nesta', await salvar(L2.sb.dono, null, base));
  T.recusa('sem dia da semana: recusado', await salvar(dono, null, { ...base, dias: [] }), /dia da semana/);
  T.recusa('95%: recusado', await salvar(dono, null, { ...base, valor: 95 }), /90/);
  T.recusa('serviço de outra loja: recusado', await salvar(dono, null, { ...base, servicos: [B.uuid()] }), /serviço/);
  T.recusa('hora de começo depois da hora de fim: recusado', await salvar(dono, null, { ...base, hora_de: '12:00', hora_ate: '11:00' }), /hora/);
  const lidas = await tos.from('promocoes').select('id, nome').eq('petshop_id', P);
  T.passa('a equipe lê as promoções (para a tela de marcar)', lidas, lidas.data?.length === 1);
  const deFora = await L2.sb.dono.from('promocoes').select('id').eq('petshop_id', P);
  T.ok('outra loja não lê', !deFora.error && deFora.data.length === 0);
  T.recusa('ninguém grava direto na tabela (nem o dono)', await dono.from('promocoes').insert({ petshop_id: P, nome: 'Direto', dias: [1], tipo: 'pct', valor: 5 }).select('id'));

  T.secao('o horário ganha a promoção ao ser marcado');
  const a1 = B.must(await ag(dono, L.pets.Thor, DIA, '09:00', { preco: 60 }), 'Thor 09:00');
  T.ok('Thor, Banho, 09:00 do dia: vem com a promoção (cópia: nome, % e valor)', a1.promo?.nome === 'Terça do banho' && a1.promo.tipo === 'pct' && Number(a1.promo.valor) === 10 && a1.promo.id === promo1, a1.promo);
  T.ok('… o preço do horário continua o da lista (R$ 60)', Number(B.sql(`select preco from agendamentos where id='${a1.id}'`)) === 60);
  const a2 = B.must(await ag(dono, L.pets.Thor, DIA, '12:00', { preco: 60 }), 'Thor 12:00');
  T.ok('12:00 (depois das 11h): sem promoção', a2.promo === null, a2.promo);
  const a3 = B.must(await ag(dono, L.pets.Thor, DIA, '09:30', { preco: 15, servico_id: L.S['Corte de unhas'] }), 'unhas');
  T.ok('Corte de unhas (fora da promoção): sem promoção', a3.promo === null, a3.promo);
  const a4 = B.must(await ag(dono, L.pets.Thor, L.dia(3), '09:00', { preco: 60 }), 'outro dia');
  T.ok('outro dia da semana: sem promoção', a4.promo === null, a4.promo);
  const a5 = B.must(await ag(tos, L.pets.Bob, DIA, '10:00'), 'tosador marca o Bob');
  T.ok('o tosador (sem dinheiro) marca: vem com a promoção e o preço da lista do porte G (R$ 70)', a5.promo?.nome === 'Terça do banho' && Number(B.sql(`select preco from agendamentos where id='${a5.id}'`)) === 70, a5);
  const forjado = B.must(await ag(tos, L.pets.Mel, DIA, '13:00', { promo: { id: B.uuid(), nome: 'Inventada', tipo: 'reais', valor: 999, servicos: [] } }), 'promoção inventada');
  T.ok('a API não escreve a promoção: a inventada some (13:00 não tem promoção)', forjado.promo === null, forjado.promo);
  B.must(await tos.from('agendamentos').update({ promo: { id: promo1, nome: 'Inventada', tipo: 'reais', valor: 999, servicos: [] } }).eq('id', a2.id).select('id'), 'tentar pela edição');
  T.ok('… nem pela edição', promoDe(a2.id) === null);
  const semEla = B.must(await ag(tos, L.pets.Mel, DIA, '08:30', { promo: { tirada: true } }), 'marcar sem a promoção');
  T.ok('marcar pedindo sem a promoção: a cópia vem marcada como tirada', semEla.promo?.nome === 'Terça do banho' && semEla.promo.tirada === true, semEla.promo);

  T.secao('remarcar e mudar a promoção');
  B.must(await dono.from('agendamentos').update({ inicio: B.instante(DIA, '12:30', L.fuso).toISOString(), fim: B.instante(DIA, '13:30', L.fuso).toISOString() }).eq('id', a1.id).select('id'), 'remarcar para 12:30');
  T.ok('Thor remarcado para 12:30: a promoção sai', promoDe(a1.id) === null);
  B.must(await dono.from('agendamentos').update({ inicio: B.instante(DIA, '09:00', L.fuso).toISOString(), fim: B.instante(DIA, '10:00', L.fuso).toISOString() }).eq('id', a1.id).select('id'), 'de volta para 09:00');
  T.ok('… de volta para 09:00: a promoção volta', promoDe(a1.id)?.nome === 'Terça do banho');
  B.must(await dono.from('agendamentos').update({ inicio: B.instante(DIA, '08:15', L.fuso).toISOString(), fim: B.instante(DIA, '09:15', L.fuso).toISOString() }).eq('id', antes).select('id'), 'remarcar o de antes');
  T.ok('horário marcado antes de a promoção existir: remarcado para dentro dela, continua sem (o preço não muda)', promoDe(antes) === null);
  B.must(await salvar(dono, promo1, { ...base, valor: 20 }), 'dono muda para 20%');
  T.ok('o dono muda a promoção para 20%: o horário já marcado continua com 10%', Number(promoDe(a1.id).valor) === 10);
  B.must(await salvar(dono, promo1, base), 'volta a 10%');

  T.secao('tirar e pôr de volta');
  const usar = (sb, id, sim) => sb.rpc('agendamento_promo_usar', { p_id: id, p_usar: sim });
  const t1 = await usar(tos, a5.id, false);
  T.passa('o tosador (Agenda) tira a promoção do Bob', t1, t1.data?.tirada === true);
  T.passa('… e põe de volta', await usar(tos, a5.id, true), promoDe(a5.id)?.tirada === undefined && promoDe(a5.id)?.nome === 'Terça do banho');
  T.recusa('a monitora (sem Agenda nem Caixa) não mexe', await usar(mon, a5.id, false));
  T.recusa('o estoque não mexe', await usar(est, a5.id, false));
  T.recusa('outra loja não mexe', await usar(L2.sb.dono, a5.id, false));
  T.recusa('anônimo não mexe', await usar(B.cliente(), a5.id, false));
  T.ok('promo_do_horario chamada direto pela API não responde nada', (await dono.rpc('promo_do_horario', { p_petshop: P, p_servico: L.S.Banho, p_porte: 'M', p_inicio: B.instante(DIA, '09:00', L.fuso).toISOString(), p_criado_ate: new Date().toISOString() })).data == null);

  T.secao('a conta com a promoção (preço travado, caixa sem desconto)');
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'dinheiro.preco_travado': true, 'dinheiro.desconto_max_caixa': 0 } }), 'trava ligada');
  // promoção de hoje para todo o banho e tosa: R$ 10
  const r2 = await salvar(dono, null, { ...base, nome: 'Dia de hoje', dias: [B.diaDaSemana(L.hoje)], hora_ate: null, servicos: [], tipo: 'reais', valor: 10 });
  T.passa('dono cria "Dia de hoje": todo o banho e tosa, R$ 10', r2);
  const h1 = B.must(await ag(dono, L.pets.Thor, L.hoje, '08:00', { preco: 60, profissional_id: L.ids.tosador }), 'Thor hoje');
  T.ok('"Todos do banho e tosa": o banho de hoje vem com a promoção', h1.promo?.nome === 'Dia de hoje' && h1.promo.servicos.length === 0, h1.promo);
  const fechar = async (sb, agId, valor, itens) => {
    const chave = D.novaChaveDeOperacao();
    const passos = [
      { t: 'sem_recebimento', agendamento: agId },
      { t: 'lancamento', nome: 'principal', chave, linha: { tipo: 'entrada', valor, forma: null, categoria: 'Banho e tosa', descricao: 'Banho', data: L.hoje, vencimento: L.dia(5), pago: false, agendamento_id: agId, cliente_id: L.tutores.Ana, itens } },
      { t: 'agendamento', id: agId, status: 'concluido' },
    ];
    return sb.rpc('agendamento_fechar_conta', { p_petshop: P, p_agendamento: agId, p_chave: chave, p_passos: passos });
  };
  const banho60 = [{ tipo: 'servico', nome: 'Banho', qtd: 1, valor: 60 }];
  T.ok('a mesma conta da tela: Banho R$ 60 com R$ 10 off tira R$ 10', PR.descontoDaPromo(h1.promo, [{ tipo: 'servico', valor: 60, qtd: 1 }], L.S.Banho, () => 'banho') === 10);
  const f1 = await fechar(cx, h1.id, 50, banho60);
  T.passa('a recepção fecha a conta com a promoção (R$ 50): o preço travado aceita', f1);
  const uso = JSON.parse(B.sql(`select coalesce(json_agg(json_build_object('nome', promo_nome, 'desconto', desconto, 'promo', promo_id, 'ag', agendamento_id)), '[]') from promo_usos where petshop_id='${P}'`));
  T.ok('… promo_usos: R$ 10 da "Dia de hoje" nesse horário', uso.length === 1 && Number(uso[0].desconto) === 10 && uso[0].nome === 'Dia de hoje' && uso[0].ag === h1.id, uso);
  T.ok('… e nada em Alterações em valores (não é desconto do caixa)', B.num(`select count(*) from precos_alterados where petshop_id='${P}' and tipo='desconto'`) === 0);
  const h2 = B.must(await ag(dono, L.pets.Mel, L.hoje, '08:30', { preco: 50 }), 'Mel hoje');
  T.recusa('a recepção dá R$ 1 a mais que a promoção: recusado (caixa sem desconto)', await fechar(cx, h2.id, 39, [{ tipo: 'servico', nome: 'Banho', qtd: 1, valor: 50 }]), /desconto/);
  T.passa('a dona fecha com R$ 1 a mais', await fechar(dono, h2.id, 39, [{ tipo: 'servico', nome: 'Banho', qtd: 1, valor: 50 }]));
  const alt = B.sql(`select de || '|' || para from precos_alterados where petshop_id='${P}' and tipo='desconto'`);
  T.ok('… o desconto a mais fica anotado a partir do preço com a promoção (de 40 para 39)', alt === '40.00|39.00', alt);
  const h3 = B.must(await ag(dono, L.pets.Bob, L.hoje, '07:30', { preco: 70 }), 'Bob hoje');
  B.must(await usar(cx, h3.id, false), 'a recepção tira a promoção do Bob');
  T.recusa('promoção tirada: o mesmo desconto vira desconto do caixa e é recusado', await fechar(cx, h3.id, 60, [{ tipo: 'servico', nome: 'Banho', qtd: 1, valor: 70 }]), /desconto/);
  T.recusa('depois da conta lançada, a promoção não muda mais', await usar(dono, h1.id, false), /conta/);
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'dinheiro.preco_travado': false, 'dinheiro.desconto_max_caixa': null } }), 'trava desligada');

  T.secao('relatório');
  const rel = B.must(await dono.rpc('relatorio_promocoes', { p: P, p_de: L.dia(-1), p_ate: L.dia(5) }), 'relatório');
  const hoje1 = rel.find((x) => x.nome === 'Dia de hoje'), terca = rel.find((x) => x.nome === 'Terça do banho');
  T.ok('"Dia de hoje": 2 horários (o tirado não conta), 2 feitos, 2 contas, R$ 20 de desconto', hoje1 && hoje1.marcados === 2 && hoje1.concluidos === 2 && hoje1.contas === 2 && Number(hoje1.desconto) === 20, rel);
  T.ok('"Terça do banho": 2 horários marcados (Thor e Bob; o tirado e o de antes não), nenhuma conta', terca && terca.marcados === 2 && terca.contas === 0 && Number(terca.desconto) === 0, terca);
  T.recusa('o tosador (sem dinheiro) não vê o relatório', await tos.rpc('relatorio_promocoes', { p: P, p_de: L.hoje, p_ate: L.dia(5) }));
  T.recusa('a recepção (só caixa) não vê o relatório', await cx.rpc('relatorio_promocoes', { p: P, p_de: L.hoje, p_ate: L.dia(5) }));

  T.secao('link do cliente');
  const anon = B.cliente(B.ipAleatorio());
  const lp = B.must(await anon.rpc('link_promocoes', { p_codigo: L.codigo }), 'link_promocoes');
  const noLink = lp.find((x) => x.nome === 'Terça do banho');
  T.ok('o link mostra as promoções, com os serviços do link já abertos', lp.length === 2 && noLink && noLink.servicos.length === 1 && noLink.servicos[0] === L.S.Banho && noLink.hora_ate === '11:00' && Number(noLink.valor) === 10, lp);
  const chaves = [...new Set(lp.flatMap((x) => Object.keys(x)))].sort().join(',');
  T.ok('… só o que o cliente precisa (sem id, loja, quem criou nem datas de criação)', chaves === 'banho_tosa,casa,comeca_em,dias,hora_ate,hora_de,nome,servicos,termina_em,tipo,valor', chaves);
  T.ok('"Todos do banho e tosa" chega aberto (os serviços do link de banho e tosa)', lp.find((x) => x.nome === 'Dia de hoje').servicos.length >= 4);
  T.ok('código errado: lista vazia', (await anon.rpc('link_promocoes', { p_codigo: 'nao-existe' })).data?.length === 0);
  const horas = B.must(await anon.rpc('link_horarios', { p_codigo: L.codigo, p_servico: L.S.Banho, p_dia: DIA, p_pets: 1 }), 'horários');
  const cedo = horas.map((h) => String(h).slice(0, 5)).find((h) => h < '11:00');
  const promoTela = PR.promoDoHorario(lp.filter((x) => x.servicos.length).map((x, i) => ({ ...x, id: String(i), ativa: true, valor: Number(x.valor) })), { servicoId: L.S.Banho, dia: DIA, hora: cedo, preco: 60, categoriaDe: () => 'banho' });
  T.ok(`a página do link marca o horário ${cedo} com "10% off" e "de R$ 60 por R$ 54" (porte M)`, promoTela && PR.etiquetaPromo(promoTela) === '10% off' && PR.precoComPromo(promoTela, 60) === 54, promoTela);
  const ped = await anon.rpc('link_pedir_com_termos', { p_funcao: 'link_pedir', p_args: { p_codigo: L.codigo, p_servico: L.S.Banho, p_dia: DIA, p_hora: cedo, p_tutor: 'Tutor do Link', p_telefone: '11987609991', p_pet: 'Pipoca', p_especie: 'cao', p_porte: 'M' } });
  T.passa('pedido pelo link num horário da promoção', ped, ped.data?.ok === true);
  const pedId = ped.data?.id;
  T.ok('… o pedido leva a promoção', JSON.parse(B.sql(`select promo from pedidos_agendamento where id='${pedId}'`))?.nome === 'Terça do banho');
  B.must(await salvar(dono, promo1, { ...base, ativa: false }), 'dono desliga a promoção antes de aceitar');
  const aceito = B.must(await dono.rpc('pedido_aceitar_como', { p_id: pedId }), 'aceitar');
  T.ok('aceito depois de a promoção ser desligada: o horário fica com a promoção que o cliente viu', promoDe(aceito)?.nome === 'Terça do banho', promoDe(aceito));
  B.must(await salvar(dono, promo1, base), 'liga de novo');
  B.must(await dono.from('petshops').update({ link_ativo: false }).eq('id', P).select('id'), 'desliga o link');
  T.ok('link desligado: nenhuma promoção', (await anon.rpc('link_promocoes', { p_codigo: L.codigo })).data?.length === 0);
  B.must(await dono.from('petshops').update({ link_ativo: true }).eq('id', P).select('id'), 'liga o link');

  T.secao('aniversário do tutor');
  const mmdd = L.hoje.slice(5);
  T.passa('a recepção anota o aniversário da Ana sem o ano (1904)', await cx.from('clientes').update({ nascimento: `1904-${mmdd}` }).eq('id', L.tutores.Ana).select('id'));
  B.must(await dono.from('clientes').update({ nascimento: `1980-${mmdd}`, nao_quer_mensagens: true }).eq('id', L.tutores.Clara).select('id'), 'Clara');
  B.must(await dono.from('clientes').update({ nascimento: `1990-${L.dia(1).slice(5)}` }).eq('id', L.tutores.Beto).select('id'), 'Beto amanhã');
  T.recusa('ano 1900 recusado (sem o ano é 1904)', await dono.from('clientes').update({ nascimento: '1900-01-01' }).eq('id', L.tutores.Davi).select('id'));
  T.ok('29/02 sem o ano: em 2027 (não bissexto) no dia 28/02, em 2028 no 29/02', B.sql(`select public.niver_no_dia('1904-02-29', '2027-02-28') || '|' || public.niver_no_dia('1904-02-29', '2028-02-28') || '|' || public.niver_no_dia('1904-02-29', '2028-02-29')`) === 'true|false|true');
  const ler = (sb) => sb.rpc('gestao_modo_envio', { p: P, p_dias: 15 });
  const d1 = B.must(await ler(dono), 'fila');
  const nt = (d1.itens.niver_tutor ?? []).map((x) => x.nome).sort().join(',');
  T.ok('Mandar mensagens: Ana e Clara fazem aniversário hoje (Beto é amanhã)', nt === 'Ana Souza,Clara Dias', d1.itens.niver_tutor);
  const f = ME.montarFila(d1, { id: P, nome: 'Promo', opcoes: {} });
  const msg = f.mensagens.find((m) => m.tipo === 'niver_tutor');
  T.ok('… a Ana recebe os parabéns com o texto padrão (e os pets dela); a Clara, que não quer, fica de fora', msg && msg.refs[0] === L.tutores.Ana && /Hoje é o seu aniversário!.*Mel e Thor\.$/.test(msg.texto)
    && f.pulados.some((p) => p.tipo === 'niver_tutor' && p.quem === 'Clara Dias' && p.motivo === 'não quer receber mensagens'), { msg, pulados: f.pulados });
  B.must(await tos.from('modelos_mensagem').upsert({ petshop_id: P, chave: 'chamar.niver_tutor', texto: 'Feliz aniversário! Abraço do [pet].' }, { onConflict: 'petshop_id,chave' }).select('chave'), 'texto do pet shop');
  const d2 = B.must(await ler(dono), 'fila com o texto');
  T.ok('o texto do pet shop (modelos_mensagem) vai junto', d2.modelos['chamar.niver_tutor'] === 'Feliz aniversário! Abraço do [pet].' && /Abraço do Mel e Thor\.$/.test(ME.montarFila(d2, { id: P, nome: 'Promo', opcoes: {} }).mensagens.find((m) => m.tipo === 'niver_tutor').texto));
  T.ok('o tosador e a monitora veem; o estoque não', 'niver_tutor' in B.must(await ler(tos), 't').itens && 'niver_tutor' in B.must(await ler(mon), 'm').itens && !('niver_tutor' in B.must(await ler(est), 'e').itens));
  const marcar = (sb, refs) => sb.rpc('modo_envio_marcar', { p: P, p_tipo: 'niver_tutor', p_refs: refs });
  T.recusa('o estoque não marca', await marcar(est, [L.tutores.Ana]));
  const m1 = await marcar(mon, [L.tutores.Ana, B.uuid()]);
  T.passa('a monitora marca "Enviou? Sim" (ref de fora ignorada)', m1, m1.data?.marcadas === 1 && m1.data?.ignoradas === 1);
  const fora = (d) => !(d.itens.niver_tutor ?? []).some((x) => x.id === L.tutores.Ana);
  T.ok('… a Ana sai da fila (uma vez por ano)', fora(B.must(await ler(dono), 'depois')));
  B.sql(`update mensagens_enviadas set dia = dia - 200 where petshop_id='${P}' and tipo='niver_tutor'`);
  T.ok('mandada há 200 dias: continua fora', fora(B.must(await ler(dono), '200 dias')));
  B.sql(`update mensagens_enviadas set dia = dia - 160 where petshop_id='${P}' and tipo='niver_tutor'`);
  T.ok('mandada há 360 dias (ano passado): volta', !fora(B.must(await ler(dono), '360 dias')));
  B.sql(`update pets set ativo = false where cliente_id='${L.tutores.Clara}'`);
  T.ok('tutor sem pet ativo não entra', !(B.must(await ler(dono), 'sem pet').itens.niver_tutor ?? []).some((x) => x.id === L.tutores.Clara));

  T.secao('pacote acabando');
  const pac = (pet, total, usados, vence, extra = '') => B.sql(`insert into pacotes_clientes (petshop_id, pet_id, nome, servico_id, total, usados, comprado_em, vence_em, preco, ativo${extra ? ', criado_em' : ''})
    values ('${P}', '${pet}', 'Pacote 4 banhos', '${L.S.Banho}', ${total}, ${usados}, '${L.dia(-20)}', ${vence ? `'${vence}'` : 'null'}, 200, ${usados < total}${extra ? `, ${extra}` : ''}) returning id`).split('\n')[0];
  const pThor = pac(L.pets.Thor, 4, 3, null);
  const pMel = pac(L.pets.Mel, 4, 4, null);
  const pBob = pac(L.pets.Bob, 4, 1, L.dia(3));
  const pRex = pac(L.pets.Rex, 4, 2, L.dia(-5));
  const pLunaVelho = pac(L.pets.Luna, 4, 4, null, `now() - interval '10 days'`);
  pac(L.pets.Luna, 4, 0, L.dia(30));
  T.ok('acabou_em: o banco põe quando o último uso é marcado', B.sql(`select (acabou_em is not null)::text || '|' || (select (acabou_em is null)::text from pacotes_clientes where id='${pThor}') from pacotes_clientes where id='${pMel}'`) === 'true|true');
  const lista = B.must(await tos.rpc('pacotes_acabando', { p: P }), 'pacotes_acabando');
  const motivo = Object.fromEntries(lista.map((x) => [x.id, x.motivo]));
  T.ok('Thor: último uso; Mel: acabou; Bob: vence em 3 dias; Rex: venceu há 5 dias', motivo[pThor] === 'ultimo' && motivo[pMel] === 'acabou' && motivo[pBob] === 'vencendo' && motivo[pRex] === 'vencido', lista.map((x) => [x.pet.nome, x.motivo]));
  T.ok('a Luna (já comprou outro pacote valendo) não entra', !lista.some((x) => x.id === pLunaVelho) && !lista.some((x) => x.pet.nome === 'Luna'));
  T.ok('vem com o tutor e os dias até vencer', lista.find((x) => x.id === pBob)?.tutor?.nome === 'Beto Lima' && lista.find((x) => x.id === pBob)?.dias === 3);
  const soThor = B.must(await cx.rpc('pacotes_acabando', { p: P, p_pet: L.pets.Thor }), 'só do Thor');
  T.ok('só de um pet (a ficha, o horário e a conta)', soThor.length === 1 && soThor[0].id === pThor);
  T.ok('outra loja: vazio', (await L2.sb.dono.rpc('pacotes_acabando', { p: P })).data?.length === 0);
  T.recusa('anônimo recusado', await B.cliente().rpc('pacotes_acabando', { p: P }));
  B.must(await tos.from('pacotes_clientes').update({ usados: 4, ativo: false }).eq('id', pThor).select('id'), 'Thor usa o último');
  const thorDepois = B.must(await tos.rpc('pacotes_acabando', { p: P, p_pet: L.pets.Thor }), 'Thor depois');
  T.ok('Thor usou o último: passa a "acabou", com a data de hoje', thorDepois[0]?.motivo === 'acabou' && thorDepois[0]?.acabou_em === L.hoje, thorDepois);
  B.must(await tos.from('pacotes_clientes').update({ usados: 3, ativo: true }).eq('id', pThor).select('id'), 'desfaz');
  T.ok('desfazer o uso limpa acabou_em', B.sql(`select (acabou_em is null)::text from pacotes_clientes where id='${pThor}'`) === 'true');
  const tx = PA.textoOferecerRenovar(lista.find((x) => x.id === pThor), 'Banho da Neide');
  T.ok('o texto de oferecer renovar diz o que é verdade (falta 1 uso) e pergunta', tx === 'Oi, Ana! Aqui é Banho da Neide. Falta só 1 uso do pacote 4 banhos de Thor. Quer renovar para continuar? É só responder aqui que a gente já deixa separado.', tx);

  T.secao('LGPD');
  const dados = B.must(await dono.rpc('cliente_dados', { p_cliente: L.tutores.Ana }), 'dados da Ana');
  const cad = dados.arquivos.find((a) => a.arquivo === 'cadastro.csv');
  const col = cad.colunas.indexOf('Aniversário');
  T.ok('os dados do tutor levam o aniversário (sem o ano: dia e mês)', col >= 0 && cad.linhas[0][col] === `${mmdd.slice(3)}/${mmdd.slice(0, 2)}` && cad.linhas[0].length === cad.colunas.length, cad);
  const anon2 = B.must(await dono.rpc('cliente_anonimizar', { p_cliente: L.tutores.Ana, p_confirmacao: 'Ana Souza' }), 'apagar a Ana');
  T.ok('apagar os dados do tutor apaga o aniversário', B.sql(`select (nascimento is null)::text from clientes where id='${L.tutores.Ana}'`) === 'true', [anon2, B.sql(`select nome || '|' || coalesce(nascimento::text, '-') from clientes where id='${L.tutores.Ana}'`)]);
}))();
