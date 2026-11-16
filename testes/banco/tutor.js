// Página do tutor (link /gestao/tutor/<token>) e fotos do diário: o tutor só vê os próprios pets, as fotos passam pela rota do
// servidor (assinatura com caminho reserva), prazo das fotos, faxina dos arquivos, quem lê e grava, e o freio de acessos.
// Precisa do servidor no ar (BASE_URL) para as rotas de foto e a página.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const T = require('../lib/teste')('tutor');

const JPG = Buffer.from('/9j/4AAQSkZJRgABAQAAAAAAAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAQABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCkATEuf//Z', 'base64');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Tutor' });
  const Bl = await criarLoja(T, { nome: 'Tutor B', equipe: false, dados: false });
  const { dono, monitor: mon, tosador: semCasa } = L.sb;
  const outro = Bl.sb.dono, anon = B.cliente();
  const P = L.P;
  const existe = (c) => B.num(`select count(*) from storage.objects where bucket_id='diario' and name='${c}'`) === 1;
  const naFila = (c) => B.num(`select count(*) from diario_fotos_lixo where caminho='${c}'`) === 1;
  const rota = (token, foto) => fetch(`${B.BASE_URL}/gestao/tutor/${token}/foto/${foto}`);

  const estadia = async (pet) => B.must(await mon.from('estadias').insert({ petshop_id: P, pet_id: L.pets[pet], tipo: 'creche', status: 'em_casa', entrada: new Date().toISOString() }).select('id').single(), 'check-in ' + pet).id;
  const eThor = await estadia('Thor'), eBob = await estadia('Bob');
  const foto = async (sb, est, pet) => {
    const c = `${P}/${L.pets[pet]}/${L.hoje}/${B.sufixo()}.jpg`;
    B.must(await sb.storage.from('diario').upload(c, JPG, { contentType: 'image/jpeg' }), 'upload');
    const id = B.must(await sb.from('diario_fotos').insert({ petshop_id: P, estadia_id: est, pet_id: L.pets[pet], dia: L.hoje, caminho: c }).select('id').single(), 'foto').id;
    return { id, c };
  };
  const faxina = async (sb) => {
    const r = B.must(await sb.rpc('diario_faxina', { p_petshop: P }), 'faxina');
    if (r.apagar.length) await sb.storage.from('diario').remove(r.apagar);
    // o mesmo que faxinaDasFotos (src/lib/gestao/tutor.ts) faz com as fotos sem assinatura
    if (r.assinar.length) {
      const s = B.must(await sb.storage.from('diario').createSignedUrls(r.assinar.map((x) => x.caminho), 30 * 86400), 'assinar');
      const ids = new Map(r.assinar.map((x) => [x.caminho, x.id]));
      const lista = s.filter((x) => x.signedUrl).map((x) => ({ id: ids.get(x.path), assinatura: new URL(x.signedUrl).searchParams.get('token'), segundos: 30 * 86400 }));
      B.must(await sb.rpc('diario_fotos_assinar', { p_petshop: P, p_lista: lista }), 'gravar assinaturas');
    }
    return r;
  };

  T.secao('link do tutor');
  T.ok('com a opção desligada, não há página', !(await anon.rpc('tutor_pagina', { p_token: '0'.repeat(64) })).data);
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'casa.tutor': { ativo: true, dias_fotos: 90 } } }), 'liga a página do tutor');
  const token = B.must(await dono.rpc('tutor_link', { p_cliente: L.tutores.Ana }), 'link da Ana');
  const tokenBeto = B.must(await dono.rpc('tutor_link', { p_cliente: L.tutores.Beto }), 'link do Beto');
  T.ok('o link é um código comprido', typeof token === 'string' && token.length >= 32, token);
  T.recusa('outro pet shop não gera link para tutor de A', await outro.rpc('tutor_link', { p_cliente: L.tutores.Ana }));
  const pg = B.must(await anon.rpc('tutor_pagina', { p_token: token }), 'página');
  const txt = JSON.stringify(pg);
  T.ok('a página da Ana mostra Thor e Mel, e não mostra o Bob (de outro tutor)', txt.includes('Thor') && txt.includes('Mel') && !txt.includes('Bob'), Object.keys(pg ?? {}));
  T.ok('a página não traz telefone de outros nem valores', !/valor|preco|11988880002/.test(txt));

  T.secao('fotos: quem grava e quem lê');
  const f = await foto(mon, eThor, 'Thor');
  const fb = await foto(mon, eBob, 'Bob');
  T.ok('anônimo não lê diario_fotos', ((await anon.from('diario_fotos').select('id, assinatura')).data ?? []).length === 0);
  T.ok('outro pet shop não lê as fotos', ((await outro.from('diario_fotos').select('id').eq('petshop_id', P)).data ?? []).length === 0);
  T.recusa('quem não tem Creche e hotel não grava foto', await semCasa.from('diario_fotos').insert({ petshop_id: P, estadia_id: eThor, pet_id: L.pets.Thor, dia: L.hoje, caminho: `${P}/x.jpg` }).select('id'));
  for (const tb of ['diario_fotos_lixo', 'tutor_acessos']) for (const [n, sb] of [['anônimo', anon], ['monitora', mon], ['dono', dono]]) {
    const r = await sb.from(tb).select('*').limit(1);
    T.ok(`${n} não lê ${tb}`, !!r.error || (r.data ?? []).length === 0);
  }
  T.recusa('anônimo não roda a faxina', await anon.rpc('diario_faxina', { p_petshop: P }));
  T.recusa('outro pet shop não roda a faxina de A', await outro.rpc('diario_faxina', { p_petshop: P }));
  T.recusa('anônimo não chama o freio direto', await anon.rpc('tutor_frear', { p_cliente: L.tutores.Ana, p_tipo: 'x', p_limite: 1 }));

  T.secao('rota da foto (servidor)');
  let r = B.must(await anon.rpc('tutor_foto', { p_token: token, p_foto: f.id }), 'tutor_foto');
  T.ok('sem assinatura, tutor_foto dá só o caminho', r?.caminho === f.c && !r.assinatura, r);
  let h = await rota(token, f.id);
  T.ok('a rota entrega pelo caminho reserva (sem assinatura)', h.status === 200 && h.headers.get('x-foto-caminho') === 'reserva' && /image/.test(h.headers.get('content-type') ?? ''), `${h.status} ${h.headers.get('x-foto-caminho')}`);
  await faxina(mon);
  T.ok('a faxina assina as fotos (vale por ~30 dias)', B.num(`select count(*) from diario_fotos where id='${f.id}' and assinatura is not null and assinatura_vale_ate > now() + interval '28 days'`) === 1);
  h = await rota(token, f.id);
  const bytes = Buffer.from(await h.arrayBuffer());
  T.ok('a rota entrega pelo caminho principal, com os bytes certos', h.status === 200 && h.headers.get('x-foto-caminho') === 'principal' && bytes.equals(JPG), `${h.status} ${h.headers.get('x-foto-caminho')} ${bytes.length}`);
  T.ok('a foto sai com cache privado e sem referência', /private/.test(h.headers.get('cache-control') ?? '') && h.headers.get('referrer-policy') === 'no-referrer');
  B.sql(`update diario_fotos set assinatura = 'aaa.bbb.ccc' where id='${f.id}'`);
  h = await rota(token, f.id);
  T.ok('assinatura estragada: cai no caminho reserva', h.status === 200 && h.headers.get('x-foto-caminho') === 'reserva');
  T.ok('assinatura fora do formato não entra', B.must(await mon.rpc('diario_fotos_assinar', { p_petshop: P, p_lista: [{ id: f.id, assinatura: 'http://mal.example/x', segundos: 999999 }] }), 'assinar') === 0);
  T.recusa('quem não tem Creche e hotel não grava assinatura', await semCasa.rpc('diario_fotos_assinar', { p_petshop: P, p_lista: [{ id: f.id, assinatura: 'a.b.c', segundos: 9 }] }));
  await mon.rpc('diario_fotos_assinar', { p_petshop: P, p_lista: [{ id: f.id, assinatura: 'a.b.c', segundos: 99999999 }] });
  T.ok('assinatura vale no máximo 30 dias', B.sql(`select assinatura_vale_ate < now() + interval '30 days' from diario_fotos where id='${f.id}'`) === 't');
  B.sql(`update diario_fotos set assinatura_vale_ate = now() + interval '1 day' where id='${f.id}'`);
  await faxina(mon);
  T.ok('a faxina renova a assinatura que vence em menos de 7 dias', (await rota(token, f.id)).headers.get('x-foto-caminho') === 'principal');
  T.ok('tutor não abre foto de pet de outro tutor', (await rota(token, fb.id)).status === 404);
  T.ok('código errado: 404', (await rota('0'.repeat(64), f.id)).status === 404);
  T.ok('id inválido: 404', (await rota(token, 'nao-e-uuid')).status === 404);
  let cf = await (await fetch(`${B.BASE_URL}/gestao/tutor/${token}/conferir?foto=${f.id}`)).json();
  T.ok('conferir: os dois caminhos funcionam', cf.principal === 'ok' && cf.reserva === 'ok', cf);
  B.sql(`update tutor_links set visto_em = null where cliente_id='${L.tutores.Ana}'`);
  await fetch(`${B.BASE_URL}/gestao/tutor/${token}/conferir?foto=${f.id}`);
  T.ok('conferir não marca a página como aberta', B.sql(`select visto_em is null from tutor_links where cliente_id='${L.tutores.Ana}'`) === 't');
  const html = await (await fetch(`${B.BASE_URL}/gestao/tutor/${token}`)).text();
  T.ok('a página aponta as fotos para a rota do servidor (sem endereço do storage)', html.includes(`/gestao/tutor/${token}/foto/${f.id}`) && !html.includes('/storage/v1/object/sign'));

  T.secao('prazo e faxina dos arquivos');
  const velha = await foto(mon, eThor, 'Thor');
  B.sql(`update diario_fotos set dia = '${L.hoje}'::date - 40 where id='${velha.id}'`);
  const temVelha = async () => JSON.stringify(B.must(await anon.rpc('tutor_pagina', { p_token: token }), 'página')).includes(velha.id);
  T.ok('com 90 dias, a foto de 40 dias aparece', await temVelha());
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'casa.tutor': { ativo: true, dias_fotos: 30 } } }), 'prazo 30');
  T.ok('com 30 dias, a página já não mostra (antes da faxina)', !(await temVelha()));
  T.ok('nem a rota entrega a foto fora do prazo', (await anon.rpc('tutor_foto', { p_token: token, p_foto: velha.id })).data === null);
  const fx = await faxina(mon);
  T.ok('a faxina apaga a foto fora do prazo e o arquivo', fx.vencidas >= 1 && !existe(velha.c) && B.num(`select count(*) from diario_fotos where id='${velha.id}'`) === 0, fx);
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'casa.tutor': { ativo: true, dias_fotos: 7 } } }), 'prazo 7');
  T.ok('prazo fora da lista vale 90', B.sql(`select tutor_dias_fotos('${P}')`) === '90');
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'casa.tutor': { ativo: true, dias_fotos: 90 } } }), 'prazo 90');
  const g = await foto(mon, eThor, 'Thor');
  T.ok('apagar a linha da foto põe o arquivo na fila', (B.must(await dono.from('diario_fotos').delete().eq('id', g.id).select('id'), 'apagar')).length === 1 && naFila(g.c) && existe(g.c));
  await outro.storage.from('diario').remove([g.c]);
  T.ok('outro pet shop não apaga arquivo da fila alheia', existe(g.c));
  await mon.storage.from('diario').remove([g.c]);
  T.ok('a equipe apaga o arquivo da fila', !existe(g.c));
  await faxina(mon);
  T.ok('a faxina tira da fila o que já sumiu', !naFila(g.c));
  const orfao = `${P}/${L.pets.Thor}/${L.hoje}/orfao-${B.sufixo()}.jpg`;
  B.must(await mon.storage.from('diario').upload(orfao, JPG, { contentType: 'image/jpeg' }), 'upload órfão');
  await faxina(mon);
  T.ok('arquivo sem foto de hoje fica (pode estar subindo)', existe(orfao));
  B.sql(`update storage.objects set created_at = now() - interval '2 days' where bucket_id='diario' and name='${orfao}'`);
  await faxina(mon);
  T.ok('arquivo sem foto há mais de um dia é apagado', !existe(orfao));

  T.secao('freio de acessos');
  // 30 por minuto por link: começa longe da virada do minuto, para as 32 chamadas caírem no mesmo minuto
  const s = new Date().getSeconds(); if (s > 45) await new Promise((ok) => setTimeout(ok, (61 - s) * 1000));
  B.sql(`delete from tutor_acessos where cliente_id in ('${L.tutores.Ana}', '${L.tutores.Beto}')`);
  let n429 = 0, primeiro = null, codigo = null;
  for (let i = 0; i < 32; i++) { const x = await anon.rpc('tutor_pagina', { p_token: token }); if (x.error) { n429++; if (primeiro === null) { primeiro = i + 1; codigo = x.error.code; } } }
  T.ok('página: 30 por minuto por link, depois "muitos acessos" (PT429)', primeiro === 31 && n429 === 2 && codigo === 'PT429', `${primeiro} ${n429} ${codigo}`);
  T.ok('a página do servidor mostra o aviso de muitos acessos', (await (await fetch(`${B.BASE_URL}/gestao/tutor/${token}`)).text()).includes('aberta muitas vezes'));
  T.passa('o freio é por link (outro tutor abre)', await anon.rpc('tutor_pagina', { p_token: tokenBeto }));
  T.ok('as fotos têm limite próprio (a foto ainda abre)', !!(await anon.rpc('tutor_foto', { p_token: token, p_foto: f.id })).data?.caminho);
  B.sql(`update tutor_acessos set n = 400 where cliente_id='${L.tutores.Ana}' and tipo='foto'`);
  T.ok('fotos: depois de 400 por minuto, 429', (await rota(token, f.id)).status === 429);
  B.sql(`delete from tutor_acessos where cliente_id in ('${L.tutores.Ana}', '${L.tutores.Beto}')`);
}))();
