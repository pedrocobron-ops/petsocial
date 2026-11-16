// Última visita de cada pet: a função do banco (visitas_dos_pets, usada por Clientes, Chamar de volta e Hoje) tem de dar o mesmo
// que a conta feita no navegador (buscarVisitasAqui, src/lib/gestao/visitas.ts), para o dono e para quem não vê dinheiro.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('visitas');
const V = lib('visitas');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Visitas' });
  const { dono } = L.sb;
  const P = L.P;
  const ag = async (pet, dia, hora, status, servico = 'Banho') => {
    const ini = B.instante(dia, hora, L.fuso);
    B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets[pet], servico_id: L.S[servico], inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 60, status }).select('id'), `horário ${pet}`);
  };
  const est = async (pet, tipo, de, ate, status) => B.must(await dono.from('estadias').insert({ petshop_id: P, pet_id: L.pets[pet], tipo, status, entrada: B.instante(de, '09:00', L.fuso).toISOString(), saida_prevista: B.instante(ate, '18:00', L.fuso).toISOString(), ...(status === 'encerrada' ? { saida: B.instante(ate, '17:00', L.fuso).toISOString(), diarias_cobradas: 1 } : {}), valor_diaria: 70 }).select('id'), `estadia ${pet}`);
  await ag('Thor', L.dia(-40), '10:00', 'concluido');
  await ag('Thor', L.dia(-10), '10:00', 'concluido', 'Hidratação');
  await ag('Thor', L.dia(5), '10:00', 'marcado');
  await ag('Mel', L.dia(-90), '09:00', 'concluido');
  await ag('Mel', L.dia(-20), '09:00', 'cancelado');
  await est('Bob', 'hotel', L.dia(-15), L.dia(-12), 'encerrada');
  await ag('Bob', L.dia(-30), '11:00', 'concluido');
  await est('Luna', 'creche', L.hoje, L.hoje, 'em_casa');
  await est('Rex', 'hotel', L.dia(10), L.dia(12), 'reservada');

  for (const quem of ['dono', 'tosador']) {
    T.secao(quem);
    const sb = L.sb[quem], agora = new Date();
    const a = await V.buscarVisitas(sb, P, agora), b = await V.buscarVisitasAqui(sb, P, agora);
    const ids = new Set([...a.keys(), ...b.keys()]);
    const dif = [...ids].filter((id) => { const x = a.get(id), y = b.get(id); return !(x && y && x.marcado === y.marcado && x.servico === y.servico && ((x.ultima == null && y.ultima == null) || (x.ultima && y.ultima && +new Date(x.ultima) === +new Date(y.ultima)))); });
    T.ok(`função do banco = conta do navegador para os ${ids.size} pets`, dif.length === 0 && ids.size === 5, dif.map((id) => ({ banco: a.get(id), aqui: b.get(id) })));
    const thor = a.get(L.pets.Thor);
    T.ok('Thor: última visita há 10 dias (Hidratação) e tem horário marcado', thor && thor.servico === 'Hidratação' && thor.marcado && B.hojeNo(L.fuso, 0) > new Date(thor.ultima).toISOString().slice(0, 10), thor);
    T.ok('Mel: o cancelado não conta como visita (última há 90 dias, nada marcado)', a.get(L.pets.Mel)?.marcado === false && new Date(a.get(L.pets.Mel).ultima) < new Date(Date.now() - 80 * 864e5), a.get(L.pets.Mel));
    T.ok('Bob: a saída do hotel conta como visita, mais recente que o banho', a.get(L.pets.Bob)?.servico === 'Hotel', a.get(L.pets.Bob));
    T.ok('Luna: está na creche agora (veio hoje e conta como marcado)', a.get(L.pets.Luna)?.marcado === true && a.get(L.pets.Luna)?.servico === 'Creche', a.get(L.pets.Luna));
    T.ok('Rex: nunca veio, mas tem reserva', a.get(L.pets.Rex)?.ultima == null && a.get(L.pets.Rex)?.marcado === true, a.get(L.pets.Rex));
  }
}))();
