// Checklist de entrada com termo (migração 20261202): quem grava e lê por área (agenda para o banho, creche e hotel para a estadia),
// as conferências de entrada_salvar (visita, pet, chips, fotos), dois toques gravam uma entrada só, assinatura no aparelho
// (nome, PNG na pasta, hora, uma vez), mudar depois do aceite pede o aceite de novo, o link de 7 dias (página pública sem nada do
// tutor, fotos pela rota do servidor, "Li e concordo" pela rota com IP e navegador, uma vez só, vencido some), pertences
// devolvidos e a faxina dos arquivos. Precisa do servidor no ar.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const T = require('../lib/teste')('entrada');

const JPG = Buffer.from('/9j/4AAQSkZJRgABAQAAAAAAAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAQABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCkATEuf//Z', 'base64');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Entrada' });
  const Bl = await criarLoja(T, { nome: 'Entrada B', equipe: false, dados: false });
  const { dono, tosador, monitor: mon, estoque, caixa } = L.sb;
  const outro = Bl.sb.dono, anon = B.cliente();
  const P = L.P;
  const existe = (c) => B.num(`select count(*) from storage.objects where bucket_id='entrada' and name='${c}'`) === 1;
  const naFila = (c) => B.num(`select count(*) from entrada_lixo where caminho='${c}'`) === 1;

  const ini = B.instante(L.hoje, '09:00', L.fuso);
  const ag = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Thor, servico_id: L.S.Banho, profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 60 }).select('id').single(), 'horário').id;
  B.must(await tosador.from('agendamentos').update({ status: 'em_atendimento' }).eq('id', ag).select('id'), 'chegou');
  const est = B.must(await mon.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Bob, tipo: 'hotel', status: 'em_casa', entrada: new Date().toISOString() }).select('id').single(), 'check-in').id;

  const subir = async (sb, ext = 'jpg', pasta = P) => {
    const c = `${pasta}/${B.uuid()}.${ext}`;
    const up = await sb.storage.from('entrada').upload(c, ext === 'png' ? PNG : JPG, { contentType: ext === 'png' ? 'image/png' : 'image/jpeg' });
    return up.error ? { erro: up.error.message, c } : { c };
  };
  const dados = { temperamento: ['agitado', 'medo'], cuidados: 'Alergia a shampoo de coco', lesoes: ['pulgas', 'ferida'], lesoes_obs: 'Ferida na pata de trás',
    idoso_doente: true, pertences: ['coleira', 'caminha'], pertences_outros: 'Cobertor azul', obs: 'Chegou sem comer', termo: 'Conferi como Thor chegou hoje.' };
  const salvar = (sb, o = {}) => sb.rpc('entrada_salvar', { p_petshop: P, p_id: null, p_pet: L.pets.Thor, p_agendamento: ag, p_estadia: null, p_dados: dados, p_fotos: [], ...o });

  T.secao('quem grava e quem lê');
  const f1 = await subir(tosador), f2 = await subir(tosador);
  T.ok('o tosador (agenda) sobe foto na pasta do pet shop', !f1.erro && !f2.erro, f1.erro);
  T.ok('quem só cuida do estoque não sobe foto', !!(await subir(estoque)).erro);
  T.ok('outro pet shop não sobe na pasta de A', !!(await subir(outro)).erro);
  T.ok('arquivo fora de <petshop>/<aleatório>.jpg|png é recusado', !!(await tosador.storage.from('entrada').upload(`${P}/x.gif`, JPG, { contentType: 'image/jpeg' })).error);
  T.recusa('a monitora (sem agenda) não grava a entrada do banho', await salvar(mon), /agenda/);
  T.recusa('o tosador (sem creche e hotel) não grava a da estadia', await tosador.rpc('entrada_salvar', { p_petshop: P, p_id: null, p_pet: L.pets.Bob, p_agendamento: null, p_estadia: est, p_dados: dados, p_fotos: [] }), /creche/);
  T.recusa('pet que não é o da visita é recusado', await salvar(tosador, { p_pet: L.pets.Mel }), /Visita/);
  T.recusa('temperamento fora da lista é recusado', await salvar(tosador, { p_dados: { ...dados, temperamento: ['bravo'] } }), /inválidos/);
  T.recusa('pertence fora da lista é recusado', await salvar(tosador, { p_dados: { ...dados, pertences: ['carro'] } }), /inválidos/);
  T.recusa('foto que não está no bucket é recusada', await salvar(tosador, { p_fotos: [`${P}/${B.uuid()}.jpg`] }), /chegou/);
  T.recusa('foto de outra pasta é recusada', await salvar(tosador, { p_fotos: [`${Bl.P}/${B.uuid()}.jpg`] }), /pasta/);
  T.recusa('mais de 4 fotos é recusado', await salvar(tosador, { p_fotos: [f1.c, f2.c, f1.c, f2.c, f1.c] }));
  T.recusa('anônimo não grava', await salvar(anon));
  const [r1, r2] = await Promise.all([salvar(tosador, { p_fotos: [f1.c, f2.c] }), salvar(tosador, { p_fotos: [f1.c, f2.c] })]);
  T.passa('dois toques no Salvar ao mesmo tempo', r1.error ? r1 : r2);
  T.ok('dois toques: uma entrada só, com as 2 fotos', B.num(`select count(*) from entradas where agendamento_id='${ag}'`) === 1 && B.num(`select cardinality(fotos) from entradas where agendamento_id='${ag}'`) === 2);
  const id = B.sql(`select id from entradas where agendamento_id='${ag}'`);
  T.ok('gravou temperamento, lesões, pertences e o termo', B.sql(`select temperamento::text || lesoes::text || pertences::text || idoso_doente || termo from entradas where id='${id}'`) === '{agitado,medo}{ferida,pulgas}{caminha,coleira}trueConferi como Thor chegou hoje.');
  const ler = async (sb) => ((await sb.from('entradas').select('id').eq('id', id)).data ?? []).length;
  T.ok('o tosador e a recepção (agenda) leem a entrada do banho', (await ler(tosador)) === 1 && (await ler(caixa)) === 1);
  T.ok('a monitora (sem agenda), o estoque, outro pet shop e o anônimo não leem', (await ler(mon)) + (await ler(estoque)) + (await ler(outro)) + (await ler(anon)) === 0);
  T.recusa('ninguém grava direto na tabela', await dono.from('entradas').update({ obs: 'x' }).eq('id', id).select('id'));
  T.recusa('ninguém insere direto na tabela', await dono.from('entradas').insert({ petshop_id: P, pet_id: L.pets.Thor, agendamento_id: ag }).select('id'));
  for (const tb of ['entrada_lixo', 'entrada_acessos']) T.ok(`ninguém lê ${tb}`, ((await dono.from(tb).select('*').limit(1)).data ?? []).length === 0);
  const re = await mon.rpc('entrada_salvar', { p_petshop: P, p_id: null, p_pet: L.pets.Bob, p_agendamento: null, p_estadia: est, p_dados: { pertences: ['racao'] }, p_fotos: [] });
  T.passa('a monitora grava a entrada do hotel', re);
  T.recusa('a foto de uma entrada não entra em outra', await mon.rpc('entrada_salvar', { p_petshop: P, p_id: re.data?.id, p_pet: L.pets.Bob, p_agendamento: null, p_estadia: est, p_dados: {}, p_fotos: [f1.c] }), /outra entrada/);

  T.secao('assinatura no aparelho');
  const sig = await subir(caixa, 'png');
  T.ok('a recepção sobe a assinatura (PNG)', !sig.erro, sig.erro);
  T.recusa('sem nome é recusado', await caixa.rpc('entrada_assinar', { p_id: id, p_nome: ' ', p_assinatura: sig.c }), /nome/);
  T.recusa('assinatura que não subiu é recusada', await caixa.rpc('entrada_assinar', { p_id: id, p_nome: 'Ana Souza', p_assinatura: `${P}/${B.uuid()}.png` }), /chegou/);
  T.recusa('a monitora (sem agenda) não assina a entrada do banho', await mon.rpc('entrada_assinar', { p_id: id, p_nome: 'Ana Souza', p_assinatura: sig.c }));
  const a1 = await caixa.rpc('entrada_assinar', { p_id: id, p_nome: '  Ana   Souza ', p_assinatura: sig.c });
  T.passa('a recepção guarda o aceite com a assinatura', a1);
  T.ok('aceite: aparelho, nome arrumado, hora', B.sql(`select aceite || '|' || aceite_nome || '|' || (aceito_em is not null) from entradas where id='${id}'`) === 'aparelho|Ana Souza|true');
  const a2 = await caixa.rpc('entrada_assinar', { p_id: id, p_nome: 'Outra', p_assinatura: sig.c });
  T.ok('assinar de novo devolve o aceite guardado (não troca)', a2.data?.ja_estava === true && a2.data?.nome === 'Ana Souza');
  T.recusa('link de entrada já aceita é recusado', await tosador.rpc('entrada_link', { p_id: id, p_fotos: [] }), /já aceitou/);
  T.passa('salvar igual não mexe no aceite', await salvar(tosador, { p_id: id, p_fotos: [f1.c, f2.c] }));
  T.ok('o aceite continua', B.sql(`select aceito_em is not null from entradas where id='${id}'`) === 't');
  const mud = await salvar(tosador, { p_id: id, p_dados: { ...dados, pertences: ['coleira'] }, p_fotos: [f1.c] });
  T.ok('mudar depois do aceite apaga o aceite (aceite_zerado)', mud.data?.aceite_zerado === true && B.sql(`select (aceito_em is null and aceite_assinatura is null)::text from entradas where id='${id}'`) === 'true', mud.error?.message);
  T.ok('a assinatura antiga e a foto tirada vão para a fila', naFila(sig.c) && naFila(f2.c));

  T.secao('o link para o tutor');
  T.recusa('link sem a assinatura das fotos é recusado', await tosador.rpc('entrada_link', { p_id: id, p_fotos: [] }), /assinatura/);
  const s1 = B.must(await tosador.storage.from('entrada').createSignedUrl(f1.c, 8 * 86400), 'assinar');
  const fotosLink = [{ caminho: f1.c, assinatura: new URL(s1.signedUrl).searchParams.get('token') }];
  T.recusa('a monitora não gera o link da entrada do banho', await mon.rpc('entrada_link', { p_id: id, p_fotos: fotosLink }));
  const l1 = await tosador.rpc('entrada_link', { p_id: id, p_fotos: fotosLink });
  T.passa('o tosador gera o link', l1);
  const tk = l1.data?.token;
  T.ok('código de 64 letras e números, 7 dias', /^[0-9a-f]{64}$/.test(tk ?? '') && B.sql(`select (token_expira - now()) between interval '6 days 23 hours' and interval '7 days 1 minute' from entradas where id='${id}'`) === 't');
  T.ok('pedir o link de novo devolve o mesmo código', (await tosador.rpc('entrada_link', { p_id: id, p_fotos: fotosLink })).data?.token === tk);
  const pub = B.must(await anon.rpc('entrada_publica', { p_token: tk }), 'entrada_publica');
  const txt = JSON.stringify(pub);
  T.ok('a página mostra o pet, os pertences, o termo e 1 foto', pub.pet?.nome === 'Thor' && pub.fotos === 1 && pub.pertences?.[0] === 'coleira' && pub.termo === 'Conferi como Thor chegou hoje.');
  T.ok('nada do tutor nem caminho de arquivo na página', !/Ana|telefone|cliente|\.jpg|token/.test(txt.replace(/"telefone":[^,]*,/, '')), txt);
  T.ok('código errado: nada', (await anon.rpc('entrada_publica', { p_token: '0'.repeat(64) })).data === null);
  const html = await (await fetch(`${B.BASE_URL}/gestao/entrada/${tk}`)).text();
  T.ok('a página abre, com "Li e concordo" e noindex', html.includes('Li e concordo') && /Como (<!-- -->)?Thor(<!-- -->)? chegou/.test(html) && /noindex/.test(html));
  let h = await fetch(`${B.BASE_URL}/gestao/entrada/${tk}/foto/0`);
  const bytes = Buffer.from(await h.arrayBuffer());
  T.ok('a foto vem pela rota do servidor, com os bytes certos', h.status === 200 && bytes.equals(JPG), h.status);
  T.ok('foto que não existe: 404', (await fetch(`${B.BASE_URL}/gestao/entrada/${tk}/foto/1`)).status === 404);
  const aceitar = (corpo, t = tk) => fetch(`${B.BASE_URL}/gestao/entrada/${t}/aceite`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'teste-entrada/1.0', 'X-Forwarded-For': '203.0.113.9' }, body: JSON.stringify(corpo) });
  T.ok('sem nome: 400', (await aceitar({ nome: '' })).status === 400);
  // o IP e o navegador que o servidor repassa só valem com a trava do servidor (20261245), como em produção
  const [x1, x2] = await B.comTravaDoServidor(() => Promise.all([aceitar({ nome: 'Ana Souza' }), aceitar({ nome: 'Ana Souza' })]));
  const j1 = await x1.json(), j2 = await x2.json();
  T.ok('"Li e concordo" duas vezes ao mesmo tempo: o mesmo aceite', x1.status === 200 && x2.status === 200 && j1.aceito_em === j2.aceito_em, [j1, j2]);
  T.ok('aceite pelo link com IP e navegador', B.sql(`select aceite || '|' || aceite_nome || '|' || coalesce(aceite_ip, '-') || '|' || coalesce(aceite_navegador, '-') from entradas where id='${id}'`).startsWith('link|Ana Souza|') && B.sql(`select aceite_navegador || '|' || aceite_ip from entradas where id='${id}'`) === 'teste-entrada/1.0|203.0.113.9');
  T.ok('a página mostra o aceite', (await anon.rpc('entrada_publica', { p_token: tk })).data?.aceito_em === j1.aceito_em);
  B.sql(`update entradas set token_expira = now() - interval '1 minute' where id='${id}'`);
  T.ok('vencido: página 404, foto 404 e aceite recusado', (await fetch(`${B.BASE_URL}/gestao/entrada/${tk}`)).status === 404
    && (await fetch(`${B.BASE_URL}/gestao/entrada/${tk}/foto/0`)).status === 404 && (await anon.rpc('entrada_aceitar', { p_token: tk, p_nome: 'X Y', p_ip: '', p_navegador: '' })).error != null);

  T.secao('pertences na saída');
  T.recusa('o tosador não marca a devolução da estadia', await tosador.rpc('entrada_devolver', { p_id: re.data.id, p_devolvido: true }));
  const d1 = await mon.rpc('entrada_devolver', { p_id: re.data.id, p_devolvido: true });
  T.ok('a monitora marca devolvido (hora)', !d1.error && d1.data != null, d1.error?.message);
  T.ok('desmarcar volta para nulo', (await mon.rpc('entrada_devolver', { p_id: re.data.id, p_devolvido: false })).data === null);

  T.secao('faxina dos arquivos');
  const solta = await subir(tosador);
  B.sql(`update storage.objects set created_at = now() - interval '2 days' where bucket_id='entrada' and name='${solta.c}'`);
  const fx = B.must(await tosador.rpc('entrada_faxina', { p_petshop: P }), 'faxina');
  T.ok('a foto solta de mais de um dia e a da fila voltam para apagar', fx.apagar.includes(solta.c) && fx.apagar.includes(f2.c) && !fx.apagar.includes(f1.c));
  T.recusa('o estoque não roda a faxina', await estoque.rpc('entrada_faxina', { p_petshop: P }));
  const rm = await tosador.storage.from('entrada').remove([solta.c, f2.c, sig.c, f1.c]);
  T.ok('apaga o que está na fila, nunca a foto em uso', !rm.error && !existe(solta.c) && !existe(f2.c) && !existe(sig.c) && existe(f1.c));
  B.sql(`delete from agendamentos where id='${ag}'`);
  T.ok('horário apagado: a entrada sai e a foto vai para a fila', B.num(`select count(*) from entradas where id='${id}'`) === 0 && naFila(f1.c));

  T.secao('dados do tutor apagados (LGPD)');
  const fb = await subir(mon);
  B.must(await mon.rpc('entrada_salvar', { p_petshop: P, p_id: re.data.id, p_pet: L.pets.Bob, p_agendamento: null, p_estadia: est, p_dados: { pertences: ['racao'] }, p_fotos: [fb.c] }), 'foto na entrada do Bob');
  const apag = await dono.rpc('cliente_anonimizar', { p_cliente: L.tutores.Beto, p_confirmacao: 'Beto Lima' });
  T.ok('apagar os dados do tutor apaga a entrada do pet', !apag.error && B.num(`select count(*) from entradas where id='${re.data.id}'`) === 0, apag.error?.message);
  T.ok('a foto da entrada vai para a fila da faxina (bucket entrada)', B.num(`select count(*) from arquivos_lixo where bucket='entrada' and caminho='${fb.c}'`) === 1);
}))();
