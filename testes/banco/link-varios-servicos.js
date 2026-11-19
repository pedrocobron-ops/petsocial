// Link do cliente com mais de um serviço no mesmo pedido (migração 20261239), pela API:
// - Banho e tosa (90 min) + Hidratação (30) + Corte de unhas (15): os horários do link contam os 135 min de cada pet;
// - o pedido guarda os outros serviços, o fim é 135 min depois, e o valor que o tutor viu é a soma (90 + 30 + 15 = 135,00 no
//   porte M; com 10% no banho e tosa: 81 + 30 + 15 = 126,00), com cada serviço guardado; a página do link faz a mesma conta;
// - aceitar vira UM horário com os três serviços (os outros em agendamento_servicos, com o preço da lista) e a conta do
//   horário dá o que o tutor viu, no centavo;
// - dois pets com dois serviços: um depois do outro, cada um com o tempo e o preço do seu porte;
// - sem porte: faixa no valor; o porte respondido na hora de aceitar põe o preço em todos os serviços;
// - lista errada (serviço de outra loja, id inválido) é recusada; pedido de um serviço só segue igual (sem nada a mais).
const B = require('../lib/base');
const { lib } = require('../lib/app');
const { criarLoja } = require('../lib/semente');
const T = require('../lib/teste')('link-varios-servicos');
const P = lib('link-precos');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Varios' });
  const { dono, tosador } = L.sb;
  const LOJA = L.P, COD = L.codigo;
  const TOSA = L.S['Banho e tosa'], HIDRA = L.S['Hidratação'], UNHA = L.S['Corte de unhas'];
  const anon = () => B.cliente(B.ipAleatorio());
  const pedir = (args) => anon().rpc('link_pedir_com_termos', { p_funcao: 'link_pedir', p_args: { p_codigo: COD, ...args } }).then((r) => r.data ?? { erro: r.error?.message });
  for (const [id, min] of [[TOSA, 90], [HIDRA, 30], [UNHA, 15]]) B.must(await dono.from('servicos').update({ duracao_min: min, ativo: true }).eq('id', id).select('id'), 'duração');
  const fone = (n) => `11${n}` + String(Date.now()).slice(-8);
  const minutos = (id) => B.num(`select extract(epoch from fim - inicio)::int / 60 from pedidos_agendamento where id='${id}'`);

  T.secao('horários com o tempo de todos os serviços');
  let dia = null, so = [], tres = [];
  for (let k = 3; k < 30 && !dia; k++) {
    const a = (await anon().rpc('link_horarios', { p_codigo: COD, p_servico: TOSA, p_dia: L.dia(k), p_pets: 1 })).data ?? [];
    const b = (await anon().rpc('link_horarios', { p_codigo: COD, p_servico: TOSA, p_dia: L.dia(k), p_pets: 1, p_extras: [HIDRA, UNHA] })).data ?? [];
    if (a.length && b.length) { dia = L.dia(k); so = a.map((h) => String(h).slice(0, 5)); tres = b.map((h) => String(h).slice(0, 5)); }
  }
  if (!dia) throw new Error('sem horário no link');
  // a loja abre das 07:00 às 20:00: 90 min cabem até 18:30; 135 min, até 17:30
  T.ok('só o banho e tosa (90 min): o último horário é 18:30', so[so.length - 1] === '18:30', so.slice(-3));
  T.ok('com hidratação e unhas (135 min): o último horário é 17:30', tres[tres.length - 1] === '17:30' && !tres.includes('18:00'), tres.slice(-3));
  const doisPets = ((await anon().rpc('link_horarios', { p_codigo: COD, p_servico: TOSA, p_dia: dia, p_pets: 2, p_extras: [HIDRA] })).data ?? []).map((h) => String(h).slice(0, 5));
  T.ok('dois pets com banho e tosa + hidratação (2 × 120 min): o último horário é 16:00', doisPets[doisPets.length - 1] === '16:00', doisPets.slice(-3));
  const repetido = ((await anon().rpc('link_horarios', { p_codigo: COD, p_servico: TOSA, p_dia: dia, p_pets: 1, p_extras: [TOSA, HIDRA, HIDRA] })).data ?? []).map((h) => String(h).slice(0, 5));
  T.ok('serviço repetido (ou o principal de novo na lista) conta uma vez só', repetido[repetido.length - 1] === '18:00' && repetido.length > 0, repetido.slice(-2));
  const outra = await criarLoja(T, { nome: 'Outra', equipe: false, dados: false });
  const deFora = (await anon().rpc('link_horarios', { p_codigo: COD, p_servico: TOSA, p_dia: dia, p_pets: 1, p_extras: [outra.S['Hidratação']] })).data ?? [];
  T.ok('serviço de outra loja na lista: nenhum horário', deFora.length === 0, deFora);
  const lixo = (await anon().rpc('link_horarios', { p_codigo: COD, p_servico: TOSA, p_dia: dia, p_pets: 1, p_extras: ['nao-e-id'] })).data ?? [];
  T.ok('id que não é id: nenhum horário (sem erro)', lixo.length === 0, lixo);

  T.secao('pedido com três serviços (porte M e promoção no principal)');
  const promo = await dono.rpc('promocao_salvar', { p: LOJA, p_id: null, p_dados: { nome: 'Tosa da semana', dias: [B.diaDaSemana(dia)], hora_de: null, hora_ate: null, servicos: [TOSA], tipo: 'pct', valor: 10, comeca_em: null, termina_em: null, ativa: true } });
  T.passa('o dono cria 10% no banho e tosa', promo);
  const hora = tres[Math.floor(tres.length / 2)];
  const recusado = await pedir({ p_servico: TOSA, p_extras: [outra.S['Hidratação']], p_dia: dia, p_hora: hora, p_tutor: 'Tutor Errado', p_telefone: fone(7), p_pet: 'Erro', p_porte: 'M' });
  T.ok('serviço de outra loja no pedido: recusado com "dados"', recusado.ok === false && recusado.erro === 'dados', recusado);
  const naoCabe = await pedir({ p_servico: TOSA, p_extras: [HIDRA, UNHA], p_dia: dia, p_hora: '18:30', p_tutor: 'Tutor Tarde', p_telefone: fone(7), p_pet: 'Tardio', p_porte: 'M' });
  T.ok('18:30 cabe o banho e tosa, mas não os três: "ocupado"', naoCabe.ok === false && naoCabe.erro === 'ocupado', naoCabe);
  const r = await pedir({ p_servico: TOSA, p_extras: [HIDRA, UNHA], p_dia: dia, p_hora: hora, p_tutor: 'Tutora Três Serviços', p_telefone: fone(9), p_pet: 'Thor', p_porte: 'M' });
  T.ok('o pedido entra', r.ok === true && r.pets === 1 && r.id, r);
  const linha = B.sql(`select array_to_string(outros_servicos, ',') from pedidos_agendamento where id='${r.id}'`);
  T.ok('o pedido guarda os outros serviços, na ordem', linha === `${HIDRA},${UNHA}`, linha);
  T.ok('e dura 135 min (90 + 30 + 15)', minutos(r.id) === 135, minutos(r.id));
  const ped = B.must(await anon().rpc('link_pedido', { p_id: r.id }), 'link_pedido');
  const it = ped.itens[0];
  T.ok('a página do pedido diz os três serviços', it.servico === 'Banho e tosa + Hidratação + Corte de unhas' && JSON.stringify(it.servicos) === '["Banho e tosa","Hidratação","Corte de unhas"]' && JSON.stringify(it.extras) === JSON.stringify([HIDRA, UNHA]), it);
  T.ok('e o fim do horário (135 min depois)', it.hora === hora && it.hora_fim === B.sql(`select to_char(('${dia} ${hora}'::timestamp + interval '135 minutes'), 'HH24:MI')`), it);
  const visto = P.lerVisto(it.valor);
  T.ok('valor que o tutor viu: de 135,00 por 126,00 (10% só no banho e tosa)', visto?.base === 135 && visto?.valor === 126 && visto?.promo?.nome === 'Tosa da semana', it.valor);
  T.ok('com cada serviço guardado: 81 + 30 + 15', JSON.stringify((visto?.servicos ?? []).map((s) => [s.nome, s.valor])) === JSON.stringify([['Banho e tosa', 81], ['Hidratação', 30], ['Corte de unhas', 15]]), visto?.servicos);
  T.ok('"Banho e tosa R$ 81,00 + Hidratação R$ 30,00 + Corte de unhas R$ 15,00"', P.partesPorExtenso(visto) === 'Banho e tosa R$ 81,00 + Hidratação R$ 30,00 + Corte de unhas R$ 15,00', P.partesPorExtenso(visto));
  // a página do formulário chega no mesmo número com o que ela recebe do link
  const info = B.must(await anon().rpc('link_info', { p_codigo: COD }), 'link_info');
  const pr = B.must(await anon().rpc('link_promocoes', { p_codigo: COD }), 'link_promocoes').find((x) => x.nome === 'Tosa da semana');
  const naPagina = P.valorDosServicos([TOSA, HIDRA, UNHA].map((id) => info.servicos.find((s) => s.id === id)), 'M', { nome: pr.nome, tipo: pr.tipo, valor: Number(pr.valor) });
  T.ok('a página do link faz a mesma conta (126,00, base 135,00)', naPagina?.valor === 126 && naPagina?.base === 135 && naPagina?.servicos?.length === 3, naPagina);
  const mudar = await anon().rpc('link_pedido_pedir_horario', { p_id: r.id, p_dia: dia, p_hora: '18:30' });
  T.ok('outra data: 18:30 não comporta os três serviços', mudar.data?.ok === false && mudar.data.erro === 'ocupado', mudar.data ?? mudar.error?.message);

  T.secao('aceitar: um horário com os três serviços');
  const ok1 = await tosador.rpc('pedidos_aceitar_juntos', { p_ids: [r.id], p_profissional: L.ids.tosador });
  T.ok('quem cuida da agenda aceita', !ok1.error && ok1.data?.ok === true, ok1.error?.message ?? ok1.data);
  const ag = B.sql(`select a.id || '|' || a.preco || '|' || (extract(epoch from a.fim - a.inicio)::int / 60) || '|' || coalesce(a.promo ->> 'nome', '-') from pedidos_agendamento p join agendamentos a on a.id = p.agendamento_id where p.id='${r.id}'`).split('|');
  T.ok('um horário só, com o banho e tosa a 90,00, 135 min e a promoção', ag[1] === '90.00' && ag[2] === '135' && ag[3] === 'Tosa da semana', ag);
  T.ok('nenhum outro horário foi criado', B.num(`select count(*) from agendamentos where petshop_id='${LOJA}' and origem='link'`) === 1);
  const outros = B.sql(`select string_agg(s.nome || ':' || x.preco || ':' || x.ordem, ',' order by x.ordem) from agendamento_servicos x join servicos s on s.id = x.servico_id where x.agendamento_id='${ag[0]}'`);
  T.ok('hidratação 30,00 e unhas 15,00 entram no mesmo horário', outros === 'Hidratação:30.00:1,Corte de unhas:15.00:2', outros);
  const cobra = B.num(`select (a.preco - public.promo_desconto_no_preco(a.promo, a.preco)) + coalesce((select sum(x.preco) from agendamento_servicos x where x.agendamento_id = a.id), 0) from agendamentos a where a.id='${ag[0]}'`);
  T.ok('a conta do horário é o que o tutor viu: 126,00', cobra === 126, cobra);
  const depois = B.must(await anon().rpc('link_pedido', { p_id: r.id }), 'link_pedido depois');
  T.ok('a página do pedido aceito segue com os três serviços e o valor', depois.itens[0].status === 'aceito' && /Corte de unhas/.test(depois.itens[0].servico) && Number(depois.itens[0].valor?.valor) === 126, depois.itens[0]);

  T.secao('dois pets, cada um com banho e tosa + hidratação');
  const hora2 = doisPets[0];
  const r2 = await pedir({ p_servico: TOSA, p_extras: [HIDRA], p_dia: dia, p_hora: hora2, p_tutor: 'Tutor Dois Pets', p_telefone: fone(8), p_pet: 'Mel', p_porte: 'P', p_outros: [{ nome: 'Bob', especie: 'cao', porte: 'G' }] });
  T.ok('o pedido dos dois pets entra', r2.ok === true && r2.pets === 2, r2);
  const ids2 = B.sql(`select string_agg(id::text, ',' order by inicio) from pedidos_agendamento where petshop_id='${LOJA}' and pet_nome in ('Mel', 'Bob') and status='pendente'`).split(',');
  const tempos = B.sql(`select string_agg(to_char(inicio at time zone '${L.fuso}', 'HH24:MI') || '-' || to_char(fim at time zone '${L.fuso}', 'HH24:MI'), ',' order by inicio) from pedidos_agendamento where id in ('${ids2.join("','")}')`);
  T.ok('um depois do outro, 120 min cada', tempos === `${hora2}-${B.sql(`select to_char('${dia} ${hora2}'::timestamp + interval '120 minutes', 'HH24:MI')`)},${B.sql(`select to_char('${dia} ${hora2}'::timestamp + interval '120 minutes', 'HH24:MI')`)}-${B.sql(`select to_char('${dia} ${hora2}'::timestamp + interval '240 minutes', 'HH24:MI')`)}`, tempos);
  const p2 = B.must(await anon().rpc('link_pedido', { p_id: r2.id }), 'link_pedido 2');
  const v = (nome) => P.lerVisto(p2.itens.find((i) => i.pet === nome)?.valor);
  T.ok('Mel (P): 80 + 25 = 105,00; Bob (G): 100 + 35 = 135,00 (promoção só se cair no dia dela)', v('Mel')?.base === 105 && v('Bob')?.base === 135, p2.itens.map((i) => i.valor));
  const ok2 = await dono.rpc('pedidos_aceitar_juntos', { p_ids: ids2 });
  T.ok('"Aceitar todos" marca os dois', !ok2.error && ok2.data?.feitos?.length === 2, ok2.error?.message ?? ok2.data);
  const marc = B.sql(`select string_agg(p.pet_nome || ':' || a.preco || '+' || (select string_agg(x.preco::text, '+') from agendamento_servicos x where x.agendamento_id = a.id), ',' order by p.inicio)
    from pedidos_agendamento p join agendamentos a on a.id = p.agendamento_id where p.id in ('${ids2.join("','")}')`);
  T.ok('cada horário com os dois serviços no preço do seu porte', marc === 'Mel:80.00+25.00,Bob:100.00+35.00', marc);

  T.secao('sem porte: faixa, e o porte respondido ao aceitar');
  const h3 = ((await anon().rpc('link_horarios', { p_codigo: COD, p_servico: TOSA, p_dia: L.dia(31), p_pets: 1, p_extras: [UNHA] })).data ?? []).map((x) => String(x).slice(0, 5));
  const r3 = await pedir({ p_servico: TOSA, p_extras: [UNHA], p_dia: L.dia(31), p_hora: h3[0], p_tutor: 'Tutor Sem Porte', p_telefone: fone(6), p_pet: 'Rex' });
  const v3 = P.lerVisto(B.must(await anon().rpc('link_pedido', { p_id: r3.id }), 'link_pedido 3').itens[0].valor);
  const temPromo = B.diaDaSemana(L.dia(31)) === B.diaDaSemana(dia);
  T.ok('sem porte: de 95,00 a 135,00 (80 a 120 + 15)', r3.ok && v3?.valor == null && v3?.base_de === 95 && v3?.base_ate === 135 && v3?.de === (temPromo ? 87 : 95) && v3?.ate === (temPromo ? 123 : 135), v3);
  const ok3 = await tosador.rpc('pedidos_aceitar_juntos', { p_ids: [r3.id], p_portes: { [r3.id]: 'G' } });
  T.ok('aceito com o porte G respondido na hora', !ok3.error && ok3.data?.ok === true, ok3.error?.message ?? ok3.data);
  const precos3 = B.sql(`select a.preco || '+' || (select string_agg(x.preco::text, '+') from agendamento_servicos x where x.agendamento_id = a.id) from pedidos_agendamento p join agendamentos a on a.id = p.agendamento_id where p.id='${r3.id}'`);
  T.ok('o banho e tosa (100,00) e o corte de unhas (15,00) ganham o preço do porte G', precos3 === '100.00+15.00', precos3);

  T.secao('um serviço só segue igual');
  const h4 = ((await anon().rpc('link_horarios', { p_codigo: COD, p_servico: HIDRA, p_dia: L.dia(32), p_pets: 1 })).data ?? []).map((x) => String(x).slice(0, 5));
  const r4 = await pedir({ p_servico: HIDRA, p_dia: L.dia(32), p_hora: h4[0], p_tutor: 'Tutor de Um Só', p_telefone: fone(5), p_pet: 'Luna', p_porte: 'M' });
  const p4 = B.must(await anon().rpc('link_pedido', { p_id: r4.id }), 'link_pedido 4').itens[0];
  T.ok('sem outros serviços, 30 min, valor 30,00 sem a lista de serviços', r4.ok && minutos(r4.id) === 30 && p4.servico === 'Hidratação' && p4.servicos == null && p4.extras == null
    && P.lerVisto(p4.valor)?.valor === 30 && P.lerVisto(p4.valor)?.servicos == null && B.sql(`select coalesce(array_to_string(outros_servicos, ','), '-') from pedidos_agendamento where id='${r4.id}'`) === '-', p4);
  const r5 = await pedir({ p_servico: HIDRA, p_extras: [], p_dia: L.dia(32), p_hora: h4[1], p_tutor: 'Tutor Lista Vazia', p_telefone: fone(4), p_pet: 'Nina', p_porte: 'P' });
  T.ok('lista vazia de outros serviços: o mesmo que um serviço só', r5.ok === true && minutos(r5.id) === 30, r5);
  const ok4 = await tosador.rpc('pedidos_aceitar_juntos', { p_ids: [r4.id] });
  T.ok('aceito: um horário sem serviço a mais', !ok4.error && B.num(`select count(*) from agendamento_servicos x join pedidos_agendamento p on p.agendamento_id = x.agendamento_id where p.id='${r4.id}'`) === 0, ok4.error?.message);
}))();
