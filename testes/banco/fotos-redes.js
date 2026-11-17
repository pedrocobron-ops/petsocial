// Autorização para postar a foto do pet nas redes da loja e o "Bom dia" do Mozart (migração 20261196).
// Fotos: o texto exato montado pelo banco (com e sem @), escolha obrigatória (nada vem marcado), mesma escolha devolve a mesma,
// quem lê (equipe com Clientes, Agenda ou Creche e hotel; nunca o código do "Não quero mais"), ninguém grava direto, o freio
// (5 por minuto por boletim), "todas" cobre o boletim e os seguintes (nunca os mais velhos), "Não quero mais" tira todas, as rotas
// do servidor (autorizar, retirar e a página). Bom dia: uma leitura com o que cada papel pode ver (quem deve só com dinheiro).
// Precisa do servidor (rotas públicas).
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const T = require('../lib/teste')('fotos-redes');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Redes' });
  const Lo = await criarLoja(T, { nome: 'Outra', equipe: false, dados: false });
  const { dono, tosador, monitor, estoque, caixa } = L.sb;
  const anon = B.cliente();
  const P = L.P;
  B.sql(`update pets set sexo = 'M' where id = '${L.pets.Thor}'; update pets set sexo = 'F' where id = '${L.pets.Mel}'`);
  const loja = B.sql(`select nome from petshops where id = '${P}'`);

  // dois banhos de hoje e um boletim (sem foto) para cada
  const horario = async (pet, hh) => {
    const ini = B.instante(L.hoje, hh, L.fuso);
    return B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: pet, servico_id: L.S.Banho, profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 60 }).select('id').single(), 'horário').id;
  };
  const boletim = async (pet, ag) => B.must(await dono.rpc('boletim_salvar', { p_petshop: P, p_id: null, p_pet: pet, p_agendamento: ag, p_estadia: null, p_texto: 'Foi ótimo.', p_chips: [], p_nota: '', p_atencao: '', p_fotos: [] }), 'boletim');
  const ag1 = await horario(L.pets.Thor, '09:00'), ag2 = await horario(L.pets.Thor, '11:00');
  const b1 = await boletim(L.pets.Thor, ag1);
  const b2 = await boletim(L.pets.Thor, ag2);
  const dia = B.sql(`select to_char((criado_em at time zone '${L.fuso}')::date, 'DD/MM/YYYY') from boletins where id = '${b1.id}'`);

  T.secao('o texto exato e a escolha');
  const a1 = B.must(await anon.rpc('boletim_autorizacao', { p_token: b1.token }), 'boletim_autorizacao');
  T.ok('nada autorizado ainda', a1.atual === null, a1);
  T.ok('texto "só este boletim", com do/da, o dia e o "Não quero mais"', a1.textos.boletim === `Autorizo ${loja} a postar nas redes sociais da loja as fotos do Thor deste boletim (${dia}). Sem marcar o meu perfil. Posso tirar esta autorização quando quiser, pelo link "Não quero mais".`, a1.textos.boletim);
  T.ok('texto "todas": deste boletim e das próximas visitas', /as fotos do Thor deste boletim e das próximas visitas\./.test(a1.textos.todas), a1.textos.todas);
  T.recusa('sem escolher quais fotos: recusado', await anon.rpc('boletim_autorizar', { p_token: b1.token, p_escopo: null, p_marcar: '' }), /Escolha quais fotos/);
  T.recusa('@ inválido: recusado', await anon.rpc('boletim_autorizar', { p_token: b1.token, p_escopo: 'boletim', p_marcar: 'ana pets!' }), /Confira o @/);
  T.recusa('código errado: recusado', await anon.rpc('boletim_autorizar', { p_token: 'f'.repeat(64), p_escopo: 'boletim', p_marcar: '' }), /não está mais no ar/);
  const r1 = B.must(await anon.rpc('boletim_autorizar', { p_token: b1.token, p_escopo: 'boletim', p_marcar: 'https://instagram.com/ana.pets/' }), 'autorizar');
  T.ok('guardou o @ arrumado e o texto com ele', r1.marcar === '@ana.pets' && r1.texto === a1.textos.boletim.replace('Sem marcar o meu perfil.', 'Pode marcar o meu perfil @ana.pets.'), r1);
  T.ok('a linha no banco tem o texto, a hora e o boletim', B.sql(`select count(*) from fotos_autorizacoes where boletim_id = '${b1.id}' and escopo = 'boletim' and texto = $q$${r1.texto}$q$ and autorizado_em > now() - interval '1 minute'`) === '1');
  const r1b = B.must(await anon.rpc('boletim_autorizar', { p_token: b1.token, p_escopo: 'boletim', p_marcar: '@ana.pets' }), 'de novo');
  T.ok('a mesma escolha de novo devolve a mesma autorização (sem linha nova)', r1b.codigo === r1.codigo && B.sql(`select count(*) from fotos_autorizacoes where pet_id = '${L.pets.Thor}'`) === '1');
  T.ok('o boletim 1 mostra a autorização com o código do "Não quero mais"', B.must(await anon.rpc('boletim_autorizacao', { p_token: b1.token }), 'ler').atual?.codigo === r1.codigo);
  T.ok('o boletim 2 (outro) não: a autorização era só do boletim 1', B.must(await anon.rpc('boletim_autorizacao', { p_token: b2.token }), 'ler 2').atual === null);

  T.secao('quem lê e quem grava');
  const ler = async (sb) => { const r = await sb.from('fotos_autorizacoes').select('id, escopo, marcar, texto, autorizado_em').eq('pet_id', L.pets.Thor); return r.error ? -1 : r.data.length; };
  T.ok('dono, tosador (agenda), monitora (creche e hotel) e recepção leem', (await ler(dono)) === 1 && (await ler(tosador)) === 1 && (await ler(monitor)) === 1 && (await ler(caixa)) === 1);
  T.ok('estoque, outro pet shop e anônimo não leem', (await ler(estoque)) <= 0 && (await ler(Lo.sb.dono)) <= 0 && (await ler(anon)) <= 0);
  T.recusa('a equipe não lê o código do "Não quero mais"', await dono.from('fotos_autorizacoes').select('codigo').eq('pet_id', L.pets.Thor));
  T.recusa('a equipe não grava autorização pelo tutor', await dono.from('fotos_autorizacoes').insert({ petshop_id: P, pet_id: L.pets.Mel, escopo: 'todas', texto: 'Autorizo tudo, pode postar sim.', codigo: 'a'.repeat(64) }));
  T.recusa('nem tira', await dono.from('fotos_autorizacoes').update({ retirado_em: new Date().toISOString(), retirado_motivo: 'tutor' }).eq('pet_id', L.pets.Thor).select('id'));

  T.secao('freio');
  let travou = null;
  for (let i = 0; i < 6 && !travou; i++) {
    const r = await anon.rpc('boletim_autorizar', { p_token: b1.token, p_escopo: 'boletim', p_marcar: '@ana.pets' });
    if (r.error) travou = r.error;
  }
  T.ok('mais de 5 por minuto no mesmo boletim: PT429', travou && travou.code === 'PT429', travou);

  T.secao('"todas": este boletim e os seguintes');
  const r2 = B.must(await anon.rpc('boletim_autorizar', { p_token: b2.token, p_escopo: 'todas', p_marcar: '' }), 'todas');
  T.ok('vale para o boletim 2', B.must(await anon.rpc('boletim_autorizacao', { p_token: b2.token }), 'ler').atual?.escopo === 'todas');
  const ag3 = await horario(L.pets.Thor, '15:00');
  const b3 = await boletim(L.pets.Thor, ag3);
  T.ok('vale para um boletim novo do Thor', B.must(await anon.rpc('boletim_autorizacao', { p_token: b3.token }), 'ler 3').atual?.codigo === r2.codigo);
  B.sql(`update boletins set criado_em = now() - interval '2 days' where id = '${b1.id}'; update fotos_autorizacoes set retirado_em = now(), retirado_motivo = 'trocada' where codigo = '${r1.codigo}'`);
  T.ok('não vale para um boletim mais velho que a autorização', B.must(await anon.rpc('boletim_autorizacao', { p_token: b1.token }), 'ler 1').atual === null);

  T.secao('"Não quero mais" e as rotas do servidor');
  const pag = await fetch(`${B.BASE_URL}/gestao/autorizacao/${r2.codigo}`);
  const html = await pag.text();
  T.ok('a página do link abre (200, noindex) com o texto autorizado', pag.status === 200 && html.includes('A autorização está valendo') && html.includes('deste boletim e das próximas visitas') && /noindex/.test(html), pag.status);
  T.ok('código inexistente: 404', (await fetch(`${B.BASE_URL}/gestao/autorizacao/${'0'.repeat(64)}`)).status === 404);
  const rota = await fetch(`${B.BASE_URL}/gestao/boletim/${b3.token}/autorizacao`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ escopo: 'boletim', marcar: '@thor.oficial' }) });
  const jr = await rota.json();
  T.ok('rota de autorizar: 200 com o texto e o código', rota.status === 200 && jr.marcar === '@thor.oficial' && /^[0-9a-f]{64}$/.test(jr.codigo), jr);
  T.ok('rota de autorizar sem escolha: 400', (await fetch(`${B.BASE_URL}/gestao/boletim/${b3.token}/autorizacao`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"marcar":"x"}' })).status === 400);
  const ret = await fetch(`${B.BASE_URL}/gestao/autorizacao/${r2.codigo}/retirar`, { method: 'POST' });
  const jret = await ret.json();
  T.ok('"Não quero mais" tira todas as que estão valendo do pet (a "todas" e a do boletim 3)', ret.status === 200 && jret.retiradas === 2, jret);
  T.ok('ninguém mais vale: boletins 2 e 3 sem autorização', B.must(await anon.rpc('boletim_autorizacao', { p_token: b2.token }), 'l2').atual === null && B.must(await anon.rpc('boletim_autorizacao', { p_token: b3.token }), 'l3').atual === null);
  T.ok('a equipe vê sem autorização na hora', (await dono.from('fotos_autorizacoes').select('id').eq('pet_id', L.pets.Thor).is('retirado_em', null)).data.length === 0);
  const pub = B.must(await anon.rpc('foto_autorizacao_publica', { p_codigo: r2.codigo }), 'publica');
  T.ok('o link mostra "retirada" com a hora', pub.retirado_em && pub.ativas === 0, pub);
  T.ok('o histórico fica: o texto e a hora de cada autorização e de cada retirada', B.sql(`select count(*) from fotos_autorizacoes where pet_id = '${L.pets.Thor}' and retirado_em is not null`) === '3');

  T.secao('Bom dia: o que cada papel vê');
  // Thor vem hoje (horários acima), a Ana deve 75 (já vencido), a V10 dele vence em 5 dias, ele faz aniversário hoje e usa a
  // última vez do pacote no horário das 15:00; o Bob está na creche
  const ana = L.tutores.Ana;
  B.sql(`insert into lancamentos (petshop_id, tipo, valor, categoria, descricao, data, vencimento, pago, cliente_id, origem)
         values ('${P}', 'entrada', 75, 'Banho e tosa', 'Banho', '${L.hoje}', '${L.hoje}', false, '${ana}', 'tela');
         insert into pets_saude (petshop_id, pet_id, tipo, nome, aplicado_em, vence_em) values ('${P}', '${L.pets.Thor}', 'vacina', 'V10', '${B.somaDias(L.hoje, -360)}', '${B.somaDias(L.hoje, 5)}');
         update pets set nascimento = ('${L.hoje}'::date - interval '3 years')::date where id = '${L.pets.Thor}';
         with pc as (insert into pacotes_clientes (petshop_id, pet_id, nome, servico_id, total, usados, comprado_em, preco, ativo) values ('${P}', '${L.pets.Thor}', 'Pacote 4 banhos', '${L.S.Banho}', 4, 3, '${L.hoje}', 200, true) returning id)
         update agendamentos set pacote_cliente_id = (select id from pc) where id = '${ag3}';`);
  B.must(await monitor.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Bob, tipo: 'creche', status: 'em_casa', entrada: new Date().toISOString() }).select('id'), 'check-in');
  const bd = async (sb) => sb.rpc('gestao_bom_dia', { p: P });
  const d = B.must(await bd(dono), 'dono');
  T.ok('dono: a agenda com os 3 horários e a casa com 1', d.agenda?.length === 3 && d.casa?.em_casa === 1, d);
  T.ok('dono: a Ana deve 75 e vem hoje com o Thor', d.devem?.length === 1 && Number(d.devem[0].valor) === 75 && d.devem[0].pets?.includes('Thor'), d.devem);
  T.ok('dono: a V10 do Thor, o aniversário e o pacote no último uso', d.vacinas?.[0]?.nome === 'V10' && d.niver?.some((x) => x.pet === 'Thor' && x.vem) && d.pacotes?.[0]?.pet === 'Thor', d);
  const tos = B.must(await bd(tosador), 'tosador');
  T.ok('tosador (sem dinheiro): agenda, vacina e aniversário, sem "devem" nem pacote', tos.agenda?.length === 3 && !('devem' in tos) && !('pacotes' in tos) && tos.vacinas?.length === 1 && !('casa' in tos), tos);
  const rec = B.must(await bd(caixa), 'recepção');
  T.ok('recepção (com caixa): vê quem deve', rec.devem?.length === 1, rec);
  const mon = B.must(await bd(monitor), 'monitora');
  T.ok('monitora (creche e hotel): a casa, sem agenda nem dinheiro', mon.casa?.em_casa === 1 && !('agenda' in mon) && !('devem' in mon), mon);
  const est = B.must(await bd(estoque), 'estoque');
  T.ok('estoque: só o dia, nada de pets nem dinheiro', est && Object.keys(est).join() === 'dia', est);
  T.ok('dono de outro pet shop: nada', (await bd(Lo.sb.dono)).data === null);
  T.recusa('anônimo: recusado', await bd(anon));
}))();
