// Pedido pelo link: o pet certo na hora de aceitar (migração 20261243), pela API, com quem cuida da agenda (o tosador):
// - nome igual (maiúsculas, espaços e acento à parte: "Perola" = "Pérola") usa o pet da ficha, sem marcar "pet novo";
// - p_pets (o "Sim, é ele" da tela) põe o pedido no pet escolhido, em horário, creche e pedido com vários pets;
// - pet de outro tutor, de outra loja ou id inválido: recusado, e o pedido continua esperando;
// - nome diferente com tutor que já tem pets: pet novo e o pedido marcado (pet_novo); tutor novo: sem marca;
// - pedido_trocar_pet ("Era outro pet?"): passa o horário (ou a reserva) para o pet escolhido e apaga o pet criado só se
//   ele não tem mais nada e a ficha está como o aceite deixou; recusa pet de outro tutor, pedido de outra loja, pedido não
//   aceito, quem não entrou, quem não cuida da área (agenda / creche_hotel), horário que já passou e choque de horário;
//   com porte diferente refaz o preço da lista (o mudado à mão fica);
// - nome do tutor sem acento (José = Jose) e, com p_pet, o tutor é o dono do pet; o mesmo pet em dois pedidos: recusado;
// - public.nome_de_pet dá o mesmo que nomeDePet da tela;
// - as chamadas de antes (sem p_pet / p_pets) continuam servindo.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const PP = lib('pet-parecido');
const T = require('../lib/teste')('pet-parecido');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Parecido', dados: false });
  const { dono, tosador, monitor, caixa } = L.sb;
  const LOJA = L.P, BANHO = L.S['Banho'];
  const outra = await criarLoja(T, { nome: 'Outra Parecido', equipe: false, dados: false });
  const fim8 = String(Date.now()).slice(-7);
  const FONE = `1197${fim8}`, FONE2 = `1196${fim8}`, FONE3 = `1195${fim8}`, FONE4 = `1194${fim8}`;
  const ins = async (sb, tabela, linha, oque) => B.must(await sb.from(tabela).insert(linha).select('id').single(), oque).id;
  const ana = await ins(dono, 'clientes', { petshop_id: LOJA, nome: 'Ana Parecida', telefone: FONE }, 'tutora');
  const beto = await ins(dono, 'clientes', { petshop_id: LOJA, nome: 'Beto Outro', telefone: FONE2 }, 'outro tutor');
  const pet = (cliente, nome, o = {}) => ins(dono, 'pets', { petshop_id: LOJA, cliente_id: cliente, nome, especie: 'cao', ...o }, 'pet ' + nome);
  const THOR = await pet(ana, 'Thor', { porte: 'M', sexo: 'M' });
  const PEROLA = await pet(ana, 'Pérola', { porte: 'P', sexo: 'F' });
  const ZECA = await pet(ana, 'Zeca', { porte: 'G' });
  const BIDU = await pet(beto, 'Bidu');
  const deFora = await ins(outra.sb.dono, 'clientes', { petshop_id: outra.P, nome: 'Ana Parecida', telefone: FONE }, 'tutora da outra loja');
  const PET_FORA = await ins(outra.sb.dono, 'pets', { petshop_id: outra.P, cliente_id: deFora, nome: 'Thor', especie: 'cao' }, 'pet da outra loja');

  let n = 0;
  /** Um pedido pelo link (direto no banco: o que se testa aqui é o aceite). */
  const pedido = (nome, o = {}) => {
    n++;
    const dia = L.dia(3 + n);
    const tipo = o.tipo ?? 'servico';
    const [ini, fim] = tipo === 'servico' ? [`${dia} 10:00`, `${dia} 11:00`] : [`${dia} 08:00`, `${dia} 18:00`];
    return B.sql(`insert into pedidos_agendamento (petshop_id, tipo, servico_id, inicio, fim, tutor_nome, telefone, pet_nome, especie, porte, grupo_id)
      values ('${LOJA}', '${tipo}', ${tipo === 'servico' ? `'${BANHO}'` : 'null'}, (${B.q(ini)}::timestamp at time zone '${L.fuso}'), (${B.q(fim)}::timestamp at time zone '${L.fuso}'),
        ${B.q(o.tutor ?? 'Ana Parecida')}, '${o.fone ?? FONE}', ${B.q(nome)}, 'cao', ${o.porte ? B.q(o.porte) : 'null'}, ${o.grupo ? `'${o.grupo}'` : 'null'}) returning id`);
  };
  const aceitar = (ids, pets, sb = tosador) => sb.rpc('pedidos_aceitar_juntos', { p_ids: [].concat(ids), p_profissional: null, p_forcar: false, p_tutor_novo: false, p_portes: null, ...(pets !== undefined ? { p_pets: pets } : {}) });
  const petDo = (id) => B.sql(`select coalesce(a.pet_id, e.pet_id) from pedidos_agendamento p left join agendamentos a on a.id = p.agendamento_id left join estadias e on e.id = p.estadia_id where p.id='${id}'`);
  const marca = (id) => B.sql(`select pet_novo from pedidos_agendamento where id='${id}'`);
  const status = (id) => B.sql(`select status from pedidos_agendamento where id='${id}'`);
  const petsDaAna = () => B.num(`select count(*) from pets where cliente_id='${ana}'`);

  T.secao('nome igual: o pet da ficha, sem perguntar');
  const p1 = pedido('  thor ');
  T.passa('aceita "  thor "', await aceitar(p1));
  T.ok('o horário é do Thor da ficha', petDo(p1) === THOR, petDo(p1));
  T.ok('e o pedido não fica marcado como pet novo', marca(p1) === 'f', marca(p1));
  const p2 = pedido('PEROLA');
  T.passa('aceita "PEROLA" (sem acento)', await aceitar(p2));
  T.ok('acento não conta: é a Pérola da ficha', petDo(p2) === PEROLA, petDo(p2));
  T.ok('nenhum pet novo na ficha da Ana (3)', petsDaAna() === 3, petsDaAna());

  T.secao('"Sim, é ele": o pet escolhido');
  const p3 = pedido('Tor');
  T.passa('aceita "Tor" com p_pets apontando o Thor', await aceitar(p3, { [p3]: THOR }));
  T.ok('o horário é do Thor', petDo(p3) === THOR, petDo(p3));
  T.ok('sem pet novo e sem marca', petsDaAna() === 3 && marca(p3) === 'f', [petsDaAna(), marca(p3)]);
  const preco = B.sql(`select a.preco from pedidos_agendamento p join agendamentos a on a.id = p.agendamento_id where p.id='${p3}'`);
  T.ok('o preço vem do porte da ficha do Thor (M)', Number(preco) === L.preco('Banho', 'M'), preco);

  T.secao('pet escolhido que não pode');
  const p4 = pedido('Tor');
  T.recusa('pet de outro tutor (Bidu, do Beto): recusado', await aceitar(p4, { [p4]: BIDU }), /não é deste tutor/);
  T.recusa('pet de outra loja: recusado', await aceitar(p4, { [p4]: PET_FORA }), /não é deste tutor/);
  T.recusa('id que não é id: recusado', await aceitar(p4, { [p4]: 'nao-e-id' }), /não é deste tutor/);
  T.recusa('p_pets que não é objeto: recusado', await aceitar(p4, ['x']), /não é deste tutor/);
  T.ok('o pedido continua esperando', status(p4) === 'pendente' && petsDaAna() === 3, [status(p4), petsDaAna()]);

  T.secao('nome diferente: pet novo, com a marca');
  T.passa('aceita "Tor" sem escolher pet (a pessoa disse "É outro pet")', await aceitar(p4, null));
  const TOR = petDo(p4);
  T.ok('nasceu o pet Tor na ficha da Ana', B.sql(`select nome || '|' || cliente_id from pets where id='${TOR}'`) === `Tor|${ana}` && petsDaAna() === 4);
  T.ok('e o pedido ficou marcado (pet_novo)', marca(p4) === 't', marca(p4));
  const p5 = pedido('Fumaça', { tutor: 'Carla Nova', fone: FONE3 });
  T.passa('tutor novo (sem ficha): aceita', await aceitar(p5));
  T.ok('tutor novo: pet novo sem marca (não há outro pet para confundir)', marca(p5) === 'f', marca(p5));

  T.secao('"Era outro pet?": troca e apaga o pet vazio');
  T.recusa('quem não entrou não troca', await B.cliente().rpc('pedido_trocar_pet', { p_id: p4, p_pet: THOR }));
  T.recusa('outra loja não troca', await outra.sb.dono.rpc('pedido_trocar_pet', { p_id: p4, p_pet: THOR }), /não encontrado/);
  T.recusa('pet de outro tutor: recusado', await tosador.rpc('pedido_trocar_pet', { p_id: p4, p_pet: BIDU }), /deste tutor/);
  T.recusa('pet de outra loja: recusado', await tosador.rpc('pedido_trocar_pet', { p_id: p4, p_pet: PET_FORA }), /deste tutor/);
  const pend = pedido('Zeka');
  T.recusa('pedido ainda não aceito: recusado', await tosador.rpc('pedido_trocar_pet', { p_id: pend, p_pet: ZECA }), /não foi aceito/);
  const t1 = await tosador.rpc('pedido_trocar_pet', { p_id: p4, p_pet: THOR });
  T.passa('quem cuida da agenda troca o Tor pelo Thor', t1, t1.data?.ok === true && t1.data?.apagado === true);
  T.ok('o horário agora é do Thor', petDo(p4) === THOR, petDo(p4));
  T.ok('o Tor criado no aceite sumiu (não tinha mais nada)', B.num(`select count(*) from pets where id='${TOR}'`) === 0 && petsDaAna() === 3);
  T.ok('e a marca saiu', marca(p4) === 'f', marca(p4));

  T.secao('o pet criado com mais coisa ligada fica');
  const p6 = pedido('Rex');
  T.passa('aceita "Rex" (pet novo)', await aceitar(p6));
  const REX = petDo(p6);
  T.ok('marcado como pet novo', marca(p6) === 't');
  // alguém já marcou outro horário para o Rex
  await ins(dono, 'agendamentos', { petshop_id: LOJA, pet_id: REX, servico_id: BANHO, inicio: `${L.dia(40)}T13:00:00Z`, fim: `${L.dia(40)}T14:00:00Z` }, 'outro horário do Rex');
  const t2 = await tosador.rpc('pedido_trocar_pet', { p_id: p6, p_pet: ZECA });
  T.passa('troca o pedido para o Zeca', t2, t2.data?.ok === true && t2.data?.apagado === false);
  T.ok('o horário do pedido é do Zeca', petDo(p6) === ZECA);
  T.ok('o Rex fica (tem outro horário)', B.num(`select count(*) from pets where id='${REX}'`) === 1);

  T.secao('creche e hotel');
  const c1 = pedido('Tor', { tipo: 'creche' });
  T.passa('creche: aceita "Tor" escolhendo o Thor', await aceitar(c1, { [c1]: THOR }));
  T.ok('a reserva é do Thor', petDo(c1) === THOR, petDo(c1));
  const c2 = pedido('Bolinha', { tipo: 'hotel' });
  T.passa('hotel: aceita "Bolinha" (pet novo)', await aceitar(c2));
  const BOLINHA = petDo(c2);
  T.ok('marcado como pet novo', marca(c2) === 't');
  T.recusa('o tosador (sem Creche e hotel) não troca a reserva', await tosador.rpc('pedido_trocar_pet', { p_id: c2, p_pet: ZECA }), /acesso a Creche e hotel/);
  const t3 = await caixa.rpc('pedido_trocar_pet', { p_id: c2, p_pet: ZECA });
  T.passa('"Era outro pet?" na reserva, pela recepção: passa para o Zeca', t3, t3.data?.apagado === true);
  T.ok('a reserva é do Zeca e a Bolinha sumiu', petDo(c2) === ZECA && B.num(`select count(*) from pets where id='${BOLINHA}'`) === 0);
  const c3 = pedido('Tor', { tipo: 'creche' });
  B.sql(`update pedidos_agendamento set inicio = (select inicio from pedidos_agendamento where id='${c1}'), fim = (select fim from pedidos_agendamento where id='${c1}') where id='${c3}'`);
  T.passa('outra creche no mesmo dia, como pet novo', await aceitar(c3));
  T.recusa('trocar para o Thor, que já tem reserva nesse dia: recusado', await monitor.rpc('pedido_trocar_pet', { p_id: c3, p_pet: THOR }), /já tem reserva/);

  T.secao('vários pets no mesmo pedido');
  const g = B.uuid();
  const g1 = pedido('Tor', { grupo: g }), g2 = pedido('perola', { grupo: g }), g3 = pedido('Pipoca', { grupo: g });
  T.passa('aceita todos: "Tor" escolhendo o Thor, "perola" igual, "Pipoca" nova', await aceitar([g1, g2, g3], { [g1]: THOR }));
  T.ok('Tor → Thor, perola → Pérola', petDo(g1) === THOR && petDo(g2) === PEROLA, [petDo(g1), petDo(g2)]);
  T.ok('Pipoca nasce, marcada; os outros sem marca', marca(g3) === 't' && marca(g1) === 'f' && marca(g2) === 'f');
  const h = B.uuid();
  const h1 = pedido('Tor', { grupo: h }), h2 = pedido('Mel', { grupo: h });
  T.recusa('um pet errado no grupo: nenhum é aceito', await aceitar([h1, h2], { [h1]: THOR, [h2]: BIDU }), /não é deste tutor/);
  T.ok('os dois continuam esperando', status(h1) === 'pendente' && status(h2) === 'pendente');

  T.recusa('o mesmo pet escolhido para dois pedidos: recusado', await aceitar([h1, h2], { [h1]: THOR, [h2]: THOR }), /mesmo pet/);
  T.ok('e os dois continuam esperando', status(h1) === 'pendente' && status(h2) === 'pendente');

  T.secao('"Era outro pet?": quem pode e o que já passou');
  const trocar = (id, petId, sb = tosador) => sb.rpc('pedido_trocar_pet', { p_id: id, p_pet: petId });
  const agDo = (id) => `(select agendamento_id from pedidos_agendamento where id='${id}')`;
  const q1 = pedido('Faísca');
  T.passa('aceita "Faísca" (pet novo)', await aceitar(q1));
  const FAISCA = petDo(q1);
  T.recusa('o monitor (sem Agenda) não troca o horário', await trocar(q1, ZECA, monitor), /acesso a Agenda/);
  T.recusa('pedido que não criou pet novo: recusado', await trocar(p3, ZECA), /não criou pet novo/);
  B.sql(`update pets set raca = 'SRD' where id='${FAISCA}'`);
  const t4 = await trocar(q1, ZECA);
  T.passa('pet novo que já ganhou raça: troca, mas não apaga', t4, t4.data?.ok === true && t4.data?.apagado === false);
  T.ok('a Faísca continua na ficha', B.num(`select count(*) from pets where id='${FAISCA}'`) === 1);
  const q2 = pedido('Faro');
  T.passa('aceita "Faro" (pet novo)', await aceitar(q2));
  B.sql(`update agendamentos set status = 'concluido' where id=${agDo(q2)}`);
  T.recusa('horário já concluído: recusado', await trocar(q2, ZECA), /já foi atendido/);
  const q3 = pedido('Nino');
  T.passa('aceita "Nino" (pet novo)', await aceitar(q3));
  B.sql(`insert into agendamentos (petshop_id, pet_id, servico_id, inicio, fim) select petshop_id, '${THOR}', servico_id, inicio + interval '30 minutes', fim + interval '30 minutes' from agendamentos where id=${agDo(q3)}`);
  T.recusa('o Thor já tem horário nesse momento: recusado', await trocar(q3, THOR), /já tem horário/);
  T.ok('o horário continua do Nino', petDo(q3) !== THOR);

  T.secao('"Era outro pet?": o preço do porte');
  const precoDo = (id) => Number(B.sql(`select preco from agendamentos where id=${agDo(id)}`));
  const q4 = pedido('Pingo', { porte: 'P' });
  T.passa('aceita "Pingo", porte P (pet novo)', await aceitar(q4));
  T.ok('preço do P', precoDo(q4) === L.preco('Banho', 'P'), precoDo(q4));
  const t5 = await trocar(q4, THOR);
  T.passa('troca para o Thor (porte M)', t5, t5.data?.preco === true);
  T.ok('o preço passa para o do M', precoDo(q4) === L.preco('Banho', 'M'), precoDo(q4));
  const q5 = pedido('Pinga', { porte: 'P' });
  T.passa('aceita "Pinga", porte P (pet novo)', await aceitar(q5));
  B.sql(`update agendamentos set preco = 99.5 where id=${agDo(q5)}`);
  const t6 = await trocar(q5, THOR);
  T.passa('troca para o Thor com o preço mudado à mão', t6, t6.data?.preco === false);
  T.ok('o preço mudado à mão fica', precoDo(q5) === 99.5, precoDo(q5));

  T.secao('nome do tutor sem acento e tutor pelo pet escolhido');
  const jose = await ins(dono, 'clientes', { petshop_id: LOJA, nome: 'José Acento', telefone: FONE4 }, 'tutor José');
  const DUQUE = await pet(jose, 'Duque');
  const tutoresDoFone = () => B.num(`select count(*) from clientes where petshop_id='${LOJA}' and telefone='${FONE4}'`);
  const j1 = pedido('Duque', { tutor: 'Jose  acento', fone: FONE4 });
  T.passa('"Jose  acento" com "tutor novo": é o José (nome igual sem acento)', await tosador.rpc('pedido_aceitar_como', { p_id: j1, p_profissional: null, p_forcar: false, p_tutor_novo: true }));
  T.ok('nenhum tutor novo e o horário é do Duque', tutoresDoFone() === 1 && petDo(j1) === DUQUE, [tutoresDoFone(), petDo(j1)]);
  const j2 = pedido('Duk', { tutor: 'Marina Outra', fone: FONE4 });
  T.passa('outro nome com "tutor novo", mas escolhendo o Duque', await tosador.rpc('pedido_aceitar_como', { p_id: j2, p_profissional: null, p_forcar: false, p_tutor_novo: true, p_pet: DUQUE }));
  T.ok('o tutor é o dono do Duque: nenhum tutor novo', tutoresDoFone() === 1 && petDo(j2) === DUQUE, [tutoresDoFone(), petDo(j2)]);

  T.secao('nome_de_pet (banco) = nomeDePet (tela)');
  for (const nome of ['  Bjørn  ', 'ÿves', 'Çãø JOSÉ', 'Pérola   da Silva', 'ŁUKASZ Đorđe', 'Mel\tzinha', 'Ünal Şahin']) {
    const banco = B.sql(`select public.nome_de_pet(${B.q(nome)})`);
    T.ok(`"${nome}" → "${PP.nomeDePet(nome)}"`, banco === PP.nomeDePet(nome), [banco, PP.nomeDePet(nome)]);
  }

  T.secao('as chamadas de antes');
  const v1 = pedido('Thor');
  T.passa('pedidos_aceitar_juntos sem p_pets (o aplicativo de antes)', await tosador.rpc('pedidos_aceitar_juntos', { p_ids: [v1], p_profissional: null, p_forcar: false, p_tutor_novo: false, p_portes: null }));
  T.ok('e acha o Thor pelo nome', petDo(v1) === THOR);
  const v2 = pedido('Pérola');
  T.passa('pedido_aceitar_como de sempre (4 argumentos)', await tosador.rpc('pedido_aceitar_como', { p_id: v2, p_profissional: null, p_forcar: false, p_tutor_novo: false }));
  T.ok('e acha a Pérola', petDo(v2) === PEROLA);
  const v3 = pedido('Zeca');
  T.passa('pedido_aceitar de sempre (só p_id)', await tosador.rpc('pedido_aceitar', { p_id: v3 }));
  T.ok('e acha o Zeca', petDo(v3) === ZECA);
  T.recusa('o link (anônimo) não chama o aceite com pet', await B.cliente().rpc('pedido_aceitar', { p_id: pend, p_profissional: null, p_forcar: false, p_pet: THOR }));
}))();
