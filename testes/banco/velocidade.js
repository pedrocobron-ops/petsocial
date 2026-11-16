// Abrir o aplicativo numa ida só ao banco (migração 20261185): `lerBase` (gestao_base) tem de entregar o mesmo pet shop, equipe e
// serviços que a leitura antiga parte por parte (lerPetshop + lerEquipe + lerServicos), para cada papel, com as partes reservadas
// (meta, diárias, opções com valor, comissão, e-mail de convite, preços) só para quem pode. E as seis contagens da tela Hoje
// (gestao_contagens) = as contagens pela API. Anônimo não chama; outra loja não lê nada.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('velocidade');
const R = lib('reservado');

// a mesma lista nas duas leituras, sem depender da ordem das chaves
const normal = (x) => JSON.stringify(x, (k, v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((c) => [c, v[c]])) : v));

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Velocidade' });
  const { dono } = L.sb;
  B.must(await dono.from('petshops').update({ meta_mes: 5000 }).eq('id', L.P).select('id'), 'meta do mês');
  B.must(await dono.from('agendamentos').insert({ petshop_id: L.P, pet_id: L.pets.Thor, servico_id: L.S.Banho, inicio: B.instante(L.dia(-1), '10:00', L.fuso).toISOString(), fim: B.instante(L.dia(-1), '11:00', L.fuso).toISOString(), status: 'concluido', lembrete_em: new Date().toISOString() }).select('id'), 'horário');
  B.must(await dono.from('estadias').insert({ petshop_id: L.P, pet_id: L.pets.Bob, tipo: 'hotel', status: 'reservada', entrada: B.instante(L.dia(3), '09:00', L.fuso).toISOString(), saida_prevista: B.instante(L.dia(5), '18:00', L.fuso).toISOString() }).select('id'), 'estadia');

  for (const papel of ['dono', 'caixa', 'monitor', 'tosador', 'estoque']) {
    T.secao(papel);
    const sb = L.sb[papel];
    const r = await sb.rpc('gestao_base', { p: L.P });
    T.passa('gestao_base responde', r, r.data && r.data.petshop);
    const nova = await R.lerBase(sb, L.P);
    const [p, e, s] = await Promise.all([R.lerPetshop(sb, L.P), R.lerEquipe(sb, L.P), R.lerServicos(sb, L.P)]);
    T.ok('pet shop igual à leitura antiga (meta, diárias e opções conforme o papel)', !nova.erro && normal(nova.petshop) === normal(p.data), { nova: nova.petshop, antiga: p.data });
    T.ok('equipe igual (comissão e e-mail de convite conforme o papel)', normal(nova.equipe) === normal(e.data), { nova: nova.equipe, antiga: e.data });
    T.ok('serviços iguais, na mesma ordem (preços conforme o papel)', normal(nova.servicos) === normal(s.data), { nova: nova.servicos, antiga: s.data });
    const c = await sb.rpc('gestao_contagens', { p: L.P });
    const n = async (t, f) => { let q = sb.from(t).select('id', { count: 'exact', head: true }).eq('petshop_id', L.P); if (f) q = f(q); return (await q).count ?? 0; };
    const api = {
      pets: await n('pets'), agendamentos: await n('agendamentos'), concluidos: await n('agendamentos', (q) => q.eq('status', 'concluido')),
      lembrados: await n('agendamentos', (q) => q.not('lembrete_em', 'is', null)), estadias: await n('estadias'), produtos: await n('produtos'),
    };
    T.ok('contagens da tela Hoje = contagens pela API', !c.error && normal(c.data) === normal(api), { banco: c.data, api, erro: c.error && c.error.message });
  }
  T.ok('o dono recebe a meta e as diárias; o tosador não', (await R.lerBase(dono, L.P)).petshop.meta_mes === 5000 && (await R.lerBase(L.sb.tosador, L.P)).petshop.meta_mes == null);

  T.secao('quem não é da loja');
  T.recusa('anônimo não chama gestao_base', await B.cliente().rpc('gestao_base', { p: L.P }));
  T.recusa('anônimo não chama gestao_contagens', await B.cliente().rpc('gestao_contagens', { p: L.P }));
  const O = await criarLoja(T, { nome: 'Outra', equipe: false, dados: false });
  const fora = await O.sb.dono.rpc('gestao_base', { p: L.P });
  T.ok('dono de outra loja não lê nada', !fora.error && fora.data.petshop == null && !fora.data.equipe.length && !fora.data.servicos.length && fora.data.opcoes == null, fora.data);
  const cf = await O.sb.dono.rpc('gestao_contagens', { p: L.P });
  T.ok('dono de outra loja conta zero', !cf.error && Object.values(cf.data).every((v) => v === 0), cf.data);
  const lb = await R.lerBase(O.sb.dono, L.P);
  T.ok('lerBase de outra loja: sem pet shop (a tela mostra "não consegui carregar")', lb.petshop == null);
}))();
