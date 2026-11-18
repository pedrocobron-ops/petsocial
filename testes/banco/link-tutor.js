// Rodada 9 (N7), pela API: o que o tutor vê no link e o lado de quem recebe o pedido (migração 20261235).
// - dois pets de portes diferentes numa promoção: o banco guarda o valor de cada um (42,41 e 76,41), a página do pedido
//   devolve os dois, e é centavo por centavo o que a conta do pet shop cobra (preço do horário menos a promoção);
// - quem recebe lê "o cliente viu" (pedidos_vistos); quem não mexe com dinheiro e o anônimo não leem pedidos_valores;
// - hotel: a estimativa que o tutor viu fica guardada; creche: diária vezes os dias;
// - "Aceitar todos" numa operação só: os dois de uma vez, ou nenhum;
// - endereço do pet shop no link e na página do pedido; contato do link desligado;
// - creche só dentro do horário de funcionamento; hoje, hora de chegada que já passou é recusada;
// - outra data escolhendo um horário livre.
const B = require('../lib/base');
const { lib } = require('../lib/app');
const { criarLoja } = require('../lib/semente');
const T = require('../lib/teste')('link-tutor');
const P = lib('link-precos');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Vila' });
  const { dono, tosador, caixa } = L.sb;
  const LOJA = L.P, COD = L.codigo, BANHO = L.S.Banho;
  const anon = () => B.cliente(B.ipAleatorio());
  const pedir = (sb, funcao, args) => sb.rpc('link_pedir_com_termos', { p_funcao: funcao, p_args: { p_codigo: COD, ...args } }).then((r) => r.data ?? { erro: r.error?.message });
  B.must(await dono.from('servicos').update({ preco_p: 49.9, preco_m: 64.9, preco_g: 89.9, preco_gg: 119.9 }).eq('id', BANHO).select('id'), 'preços do banho');

  T.secao('endereço do pet shop');
  T.passa('o dono grava rua, bairro e complemento', await dono.from('petshops').update({ endereco: 'Rua das Flores, 120', bairro: 'Vila Nova', complemento: 'loja 2' }).eq('id', LOJA).select('id'));
  T.recusa('a equipe não muda o endereço', await tosador.from('petshops').update({ endereco: 'Rua Errada, 1' }).eq('id', LOJA).select('id').then((r) => (r.error || !(r.data ?? []).length ? { error: r.error ?? { message: 'nenhuma linha' } } : r)));
  const lido = B.must(await tosador.from('petshops').select('endereco, bairro, complemento').eq('id', LOJA).single(), 'ler endereço');
  T.ok('a equipe lê o endereço (vai nas mensagens)', lido.endereco === 'Rua das Flores, 120' && lido.bairro === 'Vila Nova' && lido.complemento === 'loja 2', lido);
  const info = B.must(await anon().rpc('link_info', { p_codigo: COD }), 'link_info');
  T.ok('o link mostra o endereço', info.endereco === 'Rua das Flores, 120' && info.bairro === 'Vila Nova' && info.complemento === 'loja 2' && info.cidade === 'São Paulo', info);
  const tudo = B.must(await anon().rpc('link_inicial', { p_codigo: COD }), 'link_inicial');
  T.ok('link_inicial traz o contato (nome e WhatsApp) junto', tudo.contato?.telefone === '11999990000' && tudo.contato?.nome === info.nome && tudo.info?.endereco === 'Rua das Flores, 120', tudo.contato);

  T.secao('dois pets de portes diferentes numa promoção');
  // um dia com horário para dois pets seguidos, e a promoção de 15% no dia da semana dele
  let dia = null, hora = null;
  for (let k = 3; k < 30 && !dia; k++) {
    const h = await anon().rpc('link_horarios', { p_codigo: COD, p_servico: BANHO, p_dia: L.dia(k), p_pets: 2 });
    if (h.data?.length) { dia = L.dia(k); hora = String(h.data[Math.floor(h.data.length / 2)]).slice(0, 5); }
  }
  if (!dia) throw new Error('sem horário no link para dois pets');
  const promo = await dono.rpc('promocao_salvar', { p: LOJA, p_id: null, p_dados: { nome: 'Dia do banho', dias: [B.diaDaSemana(dia)], hora_de: null, hora_ate: null, servicos: [BANHO], tipo: 'pct', valor: 15, comeca_em: null, termina_em: null, ativa: true } });
  T.passa('o dono cria a promoção de 15% no banho', promo);
  const fone = '119' + String(Date.now()).slice(-8);
  const r = await pedir(anon(), 'link_pedir', { p_servico: BANHO, p_dia: dia, p_hora: hora, p_tutor: 'Tutora Duas Portes', p_telefone: fone, p_pet: 'Mel', p_especie: 'cao', p_porte: 'P', p_outros: [{ nome: 'Bob', especie: 'cao', porte: 'G' }] });
  T.ok('o pedido dos dois pets entra', r.ok === true && r.pets === 2 && r.id, r);
  const pedido = B.must(await anon().rpc('link_pedido', { p_id: r.id }), 'link_pedido');
  const item = (nome) => pedido.itens.find((i) => i.pet === nome);
  const mel = P.lerVisto(item('Mel')?.valor), bob = P.lerVisto(item('Bob')?.valor);
  T.ok('Mel (porte P): de 49,90 por 42,41', mel?.base === 49.9 && mel?.valor === 42.41 && mel?.promo?.nome === 'Dia do banho', item('Mel')?.valor);
  T.ok('Bob (porte G): de 89,90 por 76,41 (não o preço do primeiro pet)', bob?.base === 89.9 && bob?.valor === 76.41, item('Bob')?.valor);
  const linhas = [{ nome: 'Mel', v: mel }, { nome: 'Bob', v: bob }];
  T.ok('total 118,82', P.totalDoPedido(linhas)?.valor === 118.82, P.totalDoPedido(linhas));
  // a página do formulário faz a mesma conta com o que o link mostra (preços e promoção públicos)
  const s = info.servicos.find((x) => x.id === BANHO);
  const sPublico = (B.must(await anon().rpc('link_info', { p_codigo: COD }), 'link_info 2')).servicos.find((x) => x.id === BANHO);
  const promosDoLink = B.must(await anon().rpc('link_promocoes', { p_codigo: COD }), 'link_promocoes');
  const pp = promosDoLink.find((x) => x.nome === 'Dia do banho');
  const naPagina = ['P', 'G'].map((porte) => P.valorDoServico(sPublico, porte, { nome: pp.nome, tipo: pp.tipo, valor: Number(pp.valor) }).valor);
  T.ok('a página do link chega nos mesmos números com o que ela recebe', s && pp && naPagina[0] === mel.valor && naPagina[1] === bob.valor, naPagina);
  T.ok('a página do pedido traz o serviço, o começo, o fim e o endereço', item('Mel').servico_id === BANHO && !!item('Mel').inicio && !!item('Mel').fim && item('Mel').hora_fim && pedido.endereco === 'Rua das Flores, 120' && pedido.bairro === 'Vila Nova' && pedido.cidade === 'São Paulo', { item: item('Mel'), endereco: pedido.endereco });

  T.secao('quem lê o valor que o cliente viu');
  const ids = B.sql(`select string_agg(id::text, ',' order by inicio) from pedidos_agendamento where petshop_id='${LOJA}' and telefone='${fone}'`).split(',');
  const vistosDono = B.must(await dono.rpc('pedidos_vistos', { p: LOJA }), 'pedidos_vistos (dono)');
  T.ok('o dono lê os dois valores (cartão do pedido: "o cliente viu")', Number(vistosDono[ids[0]]?.valor) === 42.41 && Number(vistosDono[ids[1]]?.valor) === 76.41, vistosDono);
  T.ok('a frase do cartão: "R$ 118,82 (Mel R$ 42,41 e Bob R$ 76,41)"', P.valorNaFrase([{ nome: 'Mel', v: P.lerVisto(vistosDono[ids[0]]) }, { nome: 'Bob', v: P.lerVisto(vistosDono[ids[1]]) }]) === 'R$ 118,82 (Mel R$ 42,41 e Bob R$ 76,41)');
  const vistosCaixa = B.must(await caixa.rpc('pedidos_vistos', { p: LOJA }), 'pedidos_vistos (caixa)');
  T.ok('quem recebe (Caixa) também lê', Number(vistosCaixa[ids[0]]?.valor) === 42.41, vistosCaixa);
  const vistosTos = B.must(await tosador.rpc('pedidos_vistos', { p: LOJA }), 'pedidos_vistos (tosador)');
  T.ok('quem não mexe com dinheiro recebe vazio', Object.keys(vistosTos ?? {}).length === 0, vistosTos);
  const outra = await criarLoja(T, { nome: 'Outra', equipe: false, dados: false });
  T.ok('dono de outra loja recebe vazio', Object.keys(B.must(await outra.sb.dono.rpc('pedidos_vistos', { p: LOJA }), 'pedidos_vistos (outra)') ?? {}).length === 0);
  for (const [quem, sb] of [['anônimo', anon()], ['tosador', tosador], ['dono', dono]]) {
    const t = await sb.from('pedidos_valores').select('pedido_id').limit(5);
    T.ok(`${quem}: a tabela pedidos_valores não é lida direto`, !!t.error || (t.data ?? []).length === 0, t.error?.message ?? t.data);
  }
  T.recusa('anônimo não chama pedidos_vistos', await anon().rpc('pedidos_vistos', { p: LOJA }));

  T.secao('Aceitar todos numa operação só');
  // um terceiro pedido de dois pets, em que um deles já foi respondido: o banco recusa o conjunto e nenhum é aceito
  let dia2 = null, hora2 = null;
  for (let k = 3; k < 30 && !dia2; k++) {
    if (L.dia(k) === dia) continue;
    const h = await anon().rpc('link_horarios', { p_codigo: COD, p_servico: BANHO, p_dia: L.dia(k), p_pets: 2 });
    if (h.data?.length) { dia2 = L.dia(k); hora2 = String(h.data[0]).slice(0, 5); }
  }
  const fone2 = '118' + String(Date.now()).slice(-8);
  const r2 = await pedir(anon(), 'link_pedir', { p_servico: BANHO, p_dia: dia2, p_hora: hora2, p_tutor: 'Tutor Pela Metade', p_telefone: fone2, p_pet: 'Um', p_porte: 'M', p_outros: [{ nome: 'Dois', especie: 'cao', porte: 'M' }] });
  const ids2 = B.sql(`select string_agg(id::text, ',' order by inicio) from pedidos_agendamento where petshop_id='${LOJA}' and telefone='${fone2}'`).split(',');
  T.ok('segundo pedido de dois pets entra', r2.ok === true && ids2.length === 2, r2);
  B.must(await dono.from('pedidos_agendamento').update({ status: 'recusado' }).eq('id', ids2[1]).select('id'), 'recusar o segundo');
  const metade = await dono.rpc('pedidos_aceitar_juntos', { p_ids: ids2 });
  T.ok('um dos dois já foi respondido: o banco recusa o conjunto', !!metade.error, metade.error?.message ?? metade.data);
  T.ok('e o outro continua esperando (nada aceito pela metade)', B.sql(`select status || '|' || coalesce(agendamento_id::text, '-') from pedidos_agendamento where id='${ids2[0]}'`) === 'pendente|-');
  T.recusa('anônimo não aceita pedido', await anon().rpc('pedidos_aceitar_juntos', { p_ids: ids }));
  T.recusa('dono de outra loja não aceita', await outra.sb.dono.rpc('pedidos_aceitar_juntos', { p_ids: ids }));
  T.ok('depois da tentativa de fora, os dois seguem pendentes', B.num(`select count(*) from pedidos_agendamento where id in ('${ids.join("','")}') and status='pendente'`) === 2);

  const aceito = await tosador.rpc('pedidos_aceitar_juntos', { p_ids: ids, p_profissional: L.ids.tosador });
  T.ok('quem cuida da agenda aceita os dois de uma vez', !aceito.error && aceito.data?.ok === true && aceito.data.feitos?.length === 2, aceito.error?.message ?? aceito.data);
  const marcados = B.sql(`select string_agg(p.pet_nome || ':' || p.status || ':' || a.preco || ':' || coalesce(a.promo ->> 'nome', '-') || ':' || coalesce(a.profissional_id::text, '-'), ',' order by p.inicio)
    from pedidos_agendamento p join agendamentos a on a.id = p.agendamento_id where p.id in ('${ids.join("','")}')`);
  T.ok('os dois viraram horário, cada um com o preço do seu porte, a promoção e quem atende',
    marcados === `Mel:aceito:49.90:Dia do banho:${L.ids.tosador},Bob:aceito:89.90:Dia do banho:${L.ids.tosador}`, marcados);
  // o que o pet shop cobra: preço do horário menos a promoção (a conta de sempre). Tem de ser o que o tutor viu, no centavo.
  const cobra = B.sql(`select string_agg((a.preco - public.promo_desconto_no_preco(a.promo, a.preco))::text, ',' order by a.inicio)
    from pedidos_agendamento p join agendamentos a on a.id = p.agendamento_id where p.id in ('${ids.join("','")}')`);
  T.ok('o que a conta cobra é o que o tutor viu: 42,41 e 76,41', cobra === '42.41,76.41', cobra);
  const naTela = lib('promocoes');
  T.ok('a conta da tela (descontoNoPreco) dá o mesmo', naTela.precoComPromo({ tipo: 'pct', valor: 15 }, 49.9) === 42.41 && naTela.precoComPromo({ tipo: 'pct', valor: 15 }, 89.9) === 76.41);
  const repete = await tosador.rpc('pedidos_aceitar_juntos', { p_ids: ids });
  T.ok('aceitar de novo (segundo toque) é recusado e não marca outro horário', !!repete.error && B.num(`select count(*) from agendamentos where petshop_id='${LOJA}' and origem='link'`) === 2, repete.error?.message ?? repete.data);
  const depois = B.must(await anon().rpc('link_pedido', { p_id: r.id }), 'link_pedido depois');
  T.ok('a página do pedido continua com o valor depois de aceito', depois.itens.every((i) => i.status === 'aceito') && Number(depois.itens.find((i) => i.pet === 'Bob').valor?.valor) === 76.41, depois.itens);

  T.secao('pet sem porte');
  let dia3 = null, hora3 = null;
  for (let k = 3; k < 30 && !dia3; k++) {
    if (L.dia(k) === dia || L.dia(k) === dia2) continue;
    const h = await anon().rpc('link_horarios', { p_codigo: COD, p_servico: BANHO, p_dia: L.dia(k), p_pets: 1 });
    if (h.data?.length) { dia3 = L.dia(k); hora3 = String(h.data[0]).slice(0, 5); }
  }
  const temPromo3 = B.diaDaSemana(dia3) === B.diaDaSemana(dia);
  const r3 = await pedir(anon(), 'link_pedir', { p_servico: BANHO, p_dia: dia3, p_hora: hora3, p_tutor: 'Tutor Sem Porte', p_telefone: '117' + String(Date.now()).slice(-8), p_pet: 'Thor' });
  const v3 = P.lerVisto((B.must(await anon().rpc('link_pedido', { p_id: r3.id }), 'link_pedido 3')).itens[0].valor);
  T.ok('sem porte e preço que muda: fica a faixa (de P a GG), não um preço inventado', r3.ok && v3 && v3.valor == null && v3.base_de === 49.9 && v3.base_ate === 119.9 && v3.de === (temPromo3 ? 42.41 : 49.9) && v3.ate === (temPromo3 ? 101.91 : 119.9), v3);
  const semPreco = B.must(await dono.from('servicos').insert({ petshop_id: LOJA, nome: 'Sem preço', categoria: 'outro', duracao_min: 30 }).select('id').single(), 'serviço sem preço').id;
  const h4 = (await anon().rpc('link_horarios', { p_codigo: COD, p_servico: semPreco, p_dia: dia3, p_pets: 1 })).data ?? [];
  const r4 = await pedir(anon(), 'link_pedir', { p_servico: semPreco, p_dia: dia3, p_hora: String(h4[h4.length - 1]).slice(0, 5), p_tutor: 'Tutor Sem Preço', p_telefone: '116' + String(Date.now()).slice(-8), p_pet: 'Lola', p_porte: 'P' });
  T.ok('serviço sem preço: o pedido entra e nada de valor é guardado', r4.ok && (B.must(await anon().rpc('link_pedido', { p_id: r4.id }), 'link_pedido 4')).itens[0].valor == null, r4);

  T.secao('hotel e creche: o que o tutor viu fica guardado');
  const ent = L.dia(40), sai = L.dia(43);
  const est = B.must(await anon().rpc('link_hotel_estimativa', { p_codigo: COD, p_entrada: ent, p_saida: sai, p_pets: [{ porte: 'M' }, { porte: 'P' }] }), 'estimativa');
  const rh = await pedir(anon(), 'link_pedir_estadia', { p_tipo: 'hotel', p_entrada: ent, p_saida: sai, p_tutor: 'Tutora do Hotel', p_telefone: '115' + String(Date.now()).slice(-8), p_pet: 'Nina', p_porte: 'M', p_hora_entrada: '09:00', p_hora_saida: '18:00', p_mais_pets: [{ nome: 'Pingo', especie: 'cao', porte: 'P' }] });
  const ph = B.must(await anon().rpc('link_pedido', { p_id: rh.id }), 'link_pedido hotel');
  const vh = ph.itens.map((i) => ({ pet: i.pet, v: P.lerVisto(i.valor) }));
  T.ok('hotel: cada pet com a sua parte e o total da estimativa que a página mostrou', rh.ok && est && vh.length === 2
    && vh.find((x) => x.pet === 'Nina')?.v?.valor === Number(est.pets[0].total) && vh.find((x) => x.pet === 'Pingo')?.v?.valor === Number(est.pets[1].total)
    && vh[0].v.total === Number(est.total) && vh[0].v.noites === 3, { est: est?.total, vh });
  T.ok('hotel: a página do pedido diz a hora de buscar', ph.itens[0].ate === sai && ph.itens[0].ate_hora === '18:00', ph.itens[0]);
  const rc = await pedir(anon(), 'link_pedir_estadia', { p_tipo: 'creche', p_entrada: L.dia(45), p_saida: L.dia(46), p_tutor: 'Tutor da Creche', p_telefone: '114' + String(Date.now()).slice(-8), p_pet: 'Fred', p_hora_entrada: '08:00', p_hora_saida: '18:00' });
  const vc = P.lerVisto((B.must(await anon().rpc('link_pedido', { p_id: rc.id }), 'link_pedido creche')).itens[0].valor);
  T.ok('creche: 2 dias de 70,00 = 140,00', rc.ok && vc?.tipo === 'creche' && vc.dias === 2 && vc.diaria === 70 && vc.valor === 140, vc);

  T.secao('creche e hotel no horário de funcionamento');
  const creche = (extra) => pedir(anon(), 'link_pedir_estadia', { p_tipo: 'creche', p_entrada: L.dia(50), p_saida: L.dia(50), p_tutor: 'Tutor Fora de Hora', p_telefone: '113' + String(Date.now()).slice(-8), p_pet: 'Zeca', ...extra });
  const cedo = await creche({ p_hora_entrada: '06:00', p_hora_saida: '18:00' });
  T.ok('creche: chegada antes de abrir (06:00, abre às 07:00) é recusada com o horário do dia', cedo.ok === false && cedo.erro === 'fora_do_horario' && cedo.quando === 'entrada' && cedo.abre === '07:00' && cedo.fecha === '20:00', cedo);
  const tarde = await creche({ p_hora_entrada: '08:00', p_hora_saida: '21:30' });
  T.ok('creche: buscar depois de fechar (21:30, fecha às 20:00) é recusado', tarde.ok === false && tarde.erro === 'fora_do_horario' && tarde.quando === 'saida', tarde);
  const noHorario = await creche({ p_hora_entrada: '07:00', p_hora_saida: '20:00' });
  T.ok('creche: no limite do horário (07:00 às 20:00) entra', noHorario.ok === true, noHorario);
  const semHoras = await pedir(anon(), 'link_pedir_estadia', { p_tipo: 'creche', p_entrada: L.dia(51), p_saida: L.dia(51), p_tutor: 'Página Antiga', p_telefone: '112' + String(Date.now()).slice(-8), p_pet: 'Tico' });
  T.ok('pedido sem as horas (página antiga) continua entrando', semHoras.ok === true, semHoras);
  // hoje, numa hora que já passou (no relógio do pet shop)
  const agora = B.sql(`select to_char(now() at time zone '${L.fuso}', 'HH24:MI')`);
  if (agora >= '07:20' && agora <= '19:30') {
    const passou = await pedir(anon(), 'link_pedir_estadia', { p_tipo: 'creche', p_entrada: L.hoje, p_saida: L.hoje, p_tutor: 'Tutor Atrasado', p_telefone: '111' + String(Date.now()).slice(-8), p_pet: 'Tuca', p_hora_entrada: '07:00', p_hora_saida: '20:00' });
    T.ok('creche hoje com chegada às 07:00 (já passou): recusada', passou.ok === false && passou.erro === 'datas' && passou.motivo === 'hora_passou', passou);
    const aindaDa = await pedir(anon(), 'link_pedir_estadia', { p_tipo: 'creche', p_entrada: L.hoje, p_saida: L.hoje, p_tutor: 'Tutor em Cima da Hora', p_telefone: '110' + String(Date.now()).slice(-8), p_pet: 'Teca', p_hora_entrada: '19:45', p_hora_saida: '20:00' });
    T.ok('creche hoje numa hora que ainda vem: não é recusada por "já passou"', aindaDa.motivo !== 'hora_passou', aindaDa);
    const hotelPassou = await pedir(anon(), 'link_pedir_estadia', { p_tipo: 'hotel', p_entrada: L.hoje, p_saida: L.dia(2), p_tutor: 'Hóspede Atrasado', p_telefone: '119' + String(Date.now()).slice(-8), p_pet: 'Toco', p_hora_entrada: '07:00', p_hora_saida: '18:00' });
    T.ok('hotel hoje com chegada numa hora que já passou: recusado', hotelPassou.ok === false && hotelPassou.motivo === 'hora_passou', hotelPassou);
  } else T.conhecido('hora que já passou hoje', false, `só dá para conferir entre 07:20 e 19:30 no fuso da loja (agora ${agora})`);

  T.secao('outra data escolhendo um horário livre');
  B.sql(`update petshops set opcoes = coalesce(opcoes, '{}'::jsonb) || '{"link.cancelar": true, "link.cancelar_horas": 2}'::jsonb where id='${LOJA}'`);
  const livres = (await anon().rpc('link_horarios', { p_codigo: COD, p_servico: BANHO, p_dia: dia2, p_pets: 2 })).data ?? [];
  const novaHora = String(livres[livres.length - 1]).slice(0, 5);
  const ocupado = await anon().rpc('link_pedido_pedir_horario', { p_id: r.id, p_dia: dia2, p_hora: '03:00' });
  T.ok('horário que o link não oferece é recusado', ocupado.data?.ok === false && ocupado.data.erro === 'ocupado', ocupado.data ?? ocupado.error?.message);
  const mudar = await anon().rpc('link_pedido_pedir_horario', { p_id: r.id, p_dia: dia2, p_hora: novaHora });
  T.ok('horário livre: vira o recado "Quero mudar para …"', mudar.data?.ok === true && new RegExp(`^Quero mudar para .+, ${dia2.slice(8)}/${dia2.slice(5, 7)}, às ${novaHora}`).test(mudar.data.recado ?? ''), mudar.data ?? mudar.error?.message);
  const comRecado = B.sql(`select count(*) || '|' || min(cliente_pediu) || '|' || min(cliente_recado) from pedidos_agendamento where id in ('${ids.join("','")}') and cliente_pediu = 'mudar'`);
  T.ok('o recado fica nos dois pets do pedido, e nada é desmarcado', comRecado.startsWith('2|mudar|Quero mudar para') && B.num(`select count(*) from agendamentos a join pedidos_agendamento p on p.agendamento_id = a.id where p.id in ('${ids.join("','")}') and a.status = 'marcado'`) === 2, comRecado);
  const acoes = B.must(await anon().rpc('link_pedido_cliente', { p_id: r.id }), 'link_pedido_cliente');
  T.ok('a página do pedido mostra o que o tutor pediu', acoes.pediu === 'mudar' && /Quero mudar para/.test(acoes.recado ?? ''), acoes);
  const naEstadia = await anon().rpc('link_pedido_pedir_horario', { p_id: rh.id, p_dia: dia2, p_hora: novaHora });
  T.ok('pedido de hotel não usa o horário do banho (segue pelo recado escrito)', naEstadia.data?.ok === false && naEstadia.data.erro === 'fechado', naEstadia.data);

  T.secao('link desligado');
  B.must(await dono.from('petshops').update({ link_ativo: false }).eq('id', LOJA).select('id'), 'desligar o link');
  const fora = B.must(await anon().rpc('link_inicial', { p_codigo: COD }), 'link_inicial desligado');
  T.ok('link desligado: sem serviços, mas com o nome e o WhatsApp para o botão', fora.info == null && fora.contato?.nome === info.nome && fora.contato?.telefone === '11999990000', fora);
  const c = B.must(await anon().rpc('link_contato', { p_codigo: COD }), 'link_contato');
  T.ok('link_contato: só nome e WhatsApp', JSON.stringify(Object.keys(c).sort()) === '["nome","telefone"]', c);
  T.ok('código que não existe: sem contato', (await anon().rpc('link_contato', { p_codigo: 'naoexiste00' })).data == null);
  B.must(await dono.from('petshops').update({ link_ativo: true }).eq('id', LOJA).select('id'), 'religar o link');
}))();
