// Boletim do pet (migração 20261189): quem lê e grava por área (agenda para o banho, creche e hotel para as estadias), o código do
// link, a página pública (só o que mostra, sem dado do tutor), prazo de 60 dias, fotos pela rota do servidor, valor e pagamento
// só com a opção, link do Google, limite do texto pela IA (rota com GESTAO_BOLETIM_FALSO=1: nunca chama o modelo), álbum do pet,
// foto apagada pelo dono e faxina dos arquivos. Precisa do servidor no ar.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const T = require('../lib/teste')('boletim');

const JPG = Buffer.from('/9j/4AAQSkZJRgABAQAAAAAAAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAQABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCkATEuf//Z', 'base64');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Boletim' });
  const Bl = await criarLoja(T, { nome: 'Boletim B', equipe: false, dados: false });
  const { dono, tosador, monitor: mon, estoque, caixa } = L.sb;
  const outro = Bl.sb.dono, anon = B.cliente();
  const P = L.P;
  B.sql(`update pets set sexo = 'M' where id in ('${L.pets.Thor}', '${L.pets.Bob}'); update pets set sexo = 'F' where id = '${L.pets.Mel}'`);
  const existe = (c) => B.num(`select count(*) from storage.objects where bucket_id='boletim' and name='${c}'`) === 1;
  const naFila = (c) => B.num(`select count(*) from boletim_lixo where caminho='${c}'`) === 1;

  // um banho com hidratação, concluído, e um dia de creche do Bob
  const ini = B.instante(L.hoje, '09:00', L.fuso);
  const ag = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Thor, servico_id: L.S.Banho, profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 60 }).select('id').single(), 'horário').id;
  B.must(await dono.rpc('agendamento_servicos_definir', { p_agendamento: ag, p_servicos: [{ servico_id: L.S['Hidratação'], preco: 30 }] }), 'hidratação');
  B.must(await tosador.from('agendamentos').update({ status: 'concluido' }).eq('id', ag).select('id'), 'conclui');
  const est = B.must(await mon.from('estadias').insert({ petshop_id: P, pet_id: L.pets.Bob, tipo: 'creche', status: 'em_casa', entrada: new Date().toISOString() }).select('id').single(), 'check-in').id;

  const foto = async (sb, pasta = P) => {
    const c = `${pasta}/${B.uuid()}.jpg`;
    const up = await sb.storage.from('boletim').upload(c, JPG, { contentType: 'image/jpeg' });
    if (up.error) return { erro: up.error.message, c };
    const s = B.must(await sb.storage.from('boletim').createSignedUrl(c, 61 * 86400), 'assinar');
    return { caminho: c, assinatura: new URL(s.signedUrl).searchParams.get('token') };
  };
  const salvar = (sb, o) => sb.rpc('boletim_salvar', { p_petshop: P, p_id: null, p_pet: L.pets.Thor, p_agendamento: ag, p_estadia: null, p_texto: 'Thor fez banho e hidratação.', p_chips: ['Comportado', 'Perfume'], p_nota: '', p_atencao: 'Vimos uma pulga.', p_fotos: [], ...o });

  T.secao('quem grava e quem lê');
  const f1 = await foto(tosador), f2 = await foto(tosador);
  T.ok('o tosador (agenda) sobe foto na pasta do pet shop', !f1.erro && !f2.erro, f1.erro);
  T.ok('quem só cuida do estoque não sobe foto', !!(await foto(estoque)).erro);
  T.ok('outro pet shop não sobe na pasta de A', !!(await foto(outro)).erro);
  T.ok('foto fora do formato <petshop>/<aleatório>.jpg é recusada', !!(await tosador.storage.from('boletim').upload(`${P}/x/y.jpg`, JPG, { contentType: 'image/jpeg' })).error);
  T.recusa('a monitora (sem agenda) não grava boletim do banho', await salvar(mon, { p_fotos: [f1] }), /agenda/);
  T.recusa('o tosador (sem creche e hotel) não grava boletim da creche', await tosador.rpc('boletim_salvar', { p_petshop: P, p_id: null, p_pet: L.pets.Bob, p_agendamento: null, p_estadia: est, p_texto: 'x', p_chips: [], p_nota: '', p_atencao: '', p_fotos: [] }), /creche/);
  T.recusa('pet que não é o da visita é recusado', await salvar(tosador, { p_pet: L.pets.Mel }), /Visita/);
  T.recusa('sem visita é recusado', await salvar(tosador, { p_agendamento: null }));
  T.recusa('foto sem assinatura é recusada', await salvar(tosador, { p_fotos: [{ caminho: f1.caminho, assinatura: 'x' }] }));
  T.recusa('foto que não está no bucket é recusada', await salvar(tosador, { p_fotos: [{ caminho: `${P}/${B.uuid()}.jpg`, assinatura: f1.assinatura }] }));
  T.recusa('foto de outra pasta é recusada', await salvar(tosador, { p_fotos: [{ caminho: `${Bl.P}/${B.uuid()}.jpg`, assinatura: f1.assinatura }] }));
  T.recusa('mais de 4 fotos é recusado', await salvar(tosador, { p_fotos: [f1, f2, f1, f2, f1] }));
  T.recusa('anônimo não grava', await salvar(anon, { p_fotos: [f1] }));
  const r = await salvar(tosador, { p_fotos: [f1, f2] });
  T.passa('o tosador grava o boletim do banho com 2 fotos', r);
  const bol = r.data;
  T.ok('o código do link tem 64 letras e números (ninguém escolhe)', /^[0-9a-f]{64}$/.test(bol?.token ?? ''), bol);
  T.ok('vale 60 dias', B.sql(`select (expira_em - criado_em) between interval '59 days 23 hours' and interval '60 days 1 hour' from boletins where id='${bol.id}'`) === 't');
  T.recusa('a mesma foto em outro boletim é recusada', await tosador.rpc('boletim_salvar', { p_petshop: P, p_id: null, p_pet: L.pets.Thor, p_agendamento: ag, p_estadia: null, p_texto: '', p_chips: [], p_nota: '', p_atencao: '', p_fotos: [f1] }), /outro boletim/);
  const ler = async (sb) => ((await sb.from('boletins').select('id, token').eq('id', bol.id)).data ?? []).length;
  T.ok('o tosador e a recepção (agenda) leem o boletim do banho', (await ler(tosador)) === 1 && (await ler(caixa)) === 1);
  T.ok('a monitora (sem agenda), o estoque, outro pet shop e o anônimo não leem', (await ler(mon)) + (await ler(estoque)) + (await ler(outro)) + (await ler(anon)) === 0);
  T.recusa('ninguém grava direto na tabela', await dono.from('boletins').update({ token: '0'.repeat(64) }).eq('id', bol.id).select('id'));
  T.recusa('ninguém insere direto na tabela', await dono.from('boletins').insert({ petshop_id: P, pet_id: L.pets.Thor, agendamento_id: ag, token: '1'.repeat(64) }).select('id'));
  for (const tb of ['boletim_lixo', 'boletim_acessos', 'boletim_ia_uso']) T.ok(`ninguém lê ${tb}`, ((await dono.from(tb).select('*').limit(1)).data ?? []).length === 0);
  const rc = await mon.rpc('boletim_salvar', { p_petshop: P, p_id: null, p_pet: L.pets.Bob, p_agendamento: null, p_estadia: est, p_texto: 'Bob passou o dia na creche.', p_chips: ['Comeu tudo', 'Fez amizade com Mel'], p_nota: '', p_atencao: '', p_fotos: [] });
  T.passa('a monitora grava o boletim da creche', rc);
  T.ok('o tosador não lê o boletim da creche', ((await tosador.from('boletins').select('id').eq('id', rc.data?.id)).data ?? []).length === 0);
  const fx = await foto(tosador);
  T.passa('corrigir o boletim troca a foto (a que saiu vai para a fila)', await salvar(tosador, { p_id: bol.id, p_fotos: [f1, fx] }));
  T.ok('a foto trocada está na fila de apagar', naFila(f2.caminho));
  T.ok('o código do link não muda na correção', B.sql(`select token from boletins where id='${bol.id}'`) === bol.token);

  T.secao('marcar como enviado');
  T.recusa('a monitora não marca o boletim do banho', await mon.rpc('boletim_enviado', { p_id: bol.id }));
  T.passa('o tosador marca como enviado', await tosador.rpc('boletim_enviado', { p_id: bol.id }));
  T.ok('enviado_em gravado', B.sql(`select enviado_em is not null from boletins where id='${bol.id}'`) === 't');

  T.secao('página pública');
  const pub = B.must(await anon.rpc('boletim_publico', { p_token: bol.token }), 'boletim_publico');
  const txt = JSON.stringify(pub);
  T.ok('mostra o pet, o pet shop, a data e os serviços (Banho e Hidratação)', pub?.pet?.nome === 'Thor' && pub.petshop.nome.startsWith('Boletim') && pub.tipo === 'banho' && JSON.stringify(pub.servicos) === '["Banho","Hidratação"]', pub);
  T.ok('mostra o texto, os recados, a atenção e quantas fotos (2)', pub.texto.includes('hidratação') && pub.chips.length === 2 && pub.atencao === 'Vimos uma pulga.' && pub.fotos === 2);
  T.ok('nada do tutor (nome, telefone) nem caminho ou assinatura de foto', !/Ana|11988880001|caminho|assinatura|storage|\.jpg/.test(txt), txt.slice(0, 300));
  T.ok('sem a opção, nenhum valor', pub.valores === null && !/"total"|preco/.test(txt));
  T.ok('com o link de agendamento ligado, traz o código para Marcar o próximo', pub.petshop.agendar === L.codigo);
  T.ok('código errado: nada', (await anon.rpc('boletim_publico', { p_token: 'f'.repeat(64) })).data === null);
  T.ok('código fora do formato: nada', (await anon.rpc('boletim_publico', { p_token: 'abc' })).data === null);
  T.ok('anônimo não lê a tabela', ((await anon.from('boletins').select('token')).data ?? []).length === 0);

  T.secao('rota da foto e página no servidor');
  const rota = (n, t = bol.token) => fetch(`${B.BASE_URL}/gestao/boletim/${t}/foto/${n}`);
  let h = await rota(0);
  const bytes = Buffer.from(await h.arrayBuffer());
  T.ok('a rota entrega a foto 0 com os bytes certos e cache privado', h.status === 200 && bytes.equals(JPG) && /private/.test(h.headers.get('cache-control') ?? ''), `${h.status} ${bytes.length}`);
  T.ok('foto 2 (não existe) dá 404; código errado dá 404', (await rota(2)).status === 404 && (await rota(0, 'f'.repeat(64))).status === 404);
  const html = await (await fetch(`${B.BASE_URL}/gestao/boletim/${bol.token}`)).text();
  T.ok('a página tem a prévia do WhatsApp (og:image da foto 0) e fica fora do Google', html.includes(`/gestao/boletim/${bol.token}/foto/0`) && /property="og:image"/.test(html) && /noindex/.test(html));
  T.ok('a página não leva endereço do storage nem o telefone do tutor', !html.includes('/storage/v1/') && !html.includes('11988880001') && !html.includes('99880001'));
  T.ok('a página mostra a atenção à saúde à parte e o Marcar o próximo', html.includes('Para você ficar de olho') && html.includes(`/gestao/agendar/${L.codigo}`));

  T.secao('valor e pagamento (opção) e Google');
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'boletim.valores': true } }), 'liga valores');
  let v = B.must(await anon.rpc('boletim_publico', { p_token: bol.token }), 'pub').valores;
  T.ok('com a opção: sem conta fechada, total R$ 90 e falta R$ 90', v && Number(v.total) === 90 && Number(v.pago) === 0 && Number(v.falta) === 90, v);
  // a conta do horário fica a receber (R$ 90) e o tutor paga R$ 50 em parte (como o botão Recebi grava)
  const conta = B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 90, categoria: 'Serviços', agendamento_id: ag, cliente_id: L.tutores.Ana, pago: false, vencimento: L.hoje, data: L.hoje }).select('id').single(), 'conta a receber').id;
  v = B.must(await anon.rpc('boletim_publico', { p_token: bol.token }), 'pub').valores;
  T.ok('conta a receber: total R$ 90, falta R$ 90', v && Number(v.total) === 90 && Number(v.pago) === 0 && Number(v.falta) === 90, v);
  B.sql(`insert into lancamentos (petshop_id, tipo, valor, forma, categoria, pago, data, conta_id, cliente_id) values ('${P}', 'entrada', 50, 'pix', 'Serviços', true, '${L.hoje}', '${conta}', '${L.tutores.Ana}');
         update lancamentos set valor = 40, valor_original = 90 where id = '${conta}';`);
  B.must(await dono.from('lancamentos').insert({ petshop_id: P, tipo: 'entrada', valor: 77, categoria: 'Outros', cliente_id: L.tutores.Ana, pago: false, vencimento: L.hoje, data: L.hoje }).select('id'), 'outra dívida');
  v = B.must(await anon.rpc('boletim_publico', { p_token: bol.token }), 'pub').valores;
  T.ok('pago R$ 50, falta R$ 40; a outra dívida do tutor (R$ 77) não aparece', v && Number(v.total) === 90 && Number(v.pago) === 50 && Number(v.falta) === 40, v);
  T.ok('a creche não mostra valor', B.must(await anon.rpc('boletim_publico', { p_token: rc.data.token }), 'creche').valores === null);
  T.recusa('quem não é dono não liga a opção', await caixa.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'boletim.valores': false } }));
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'loja.google': 'https://g.page/r/CTeste123/review' } }), 'google');
  T.ok('com o link do Google, a página traz o link', B.must(await anon.rpc('boletim_publico', { p_token: bol.token }), 'pub').petshop.google === 'https://g.page/r/CTeste123/review');
  T.ok('o link de agendamento também traz o link do Google', (await anon.rpc('link_google', { p_codigo: L.codigo })).data === 'https://g.page/r/CTeste123/review');
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'loja.google': 'https://golpe.example.com/google.com/maps' } }), 'google ruim');
  T.ok('link que não é do Google não aparece', B.must(await anon.rpc('boletim_publico', { p_token: bol.token }), 'pub').petshop.google === null && (await anon.rpc('link_google', { p_codigo: L.codigo })).data === null);

  T.secao('texto pelo Mozart (rota, sem chamar o modelo)');
  const sessao = async (sb) => (await sb.auth.getSession()).data.session.access_token;
  const ia = async (sb, corpo) => { const x = await fetch(`${B.BASE_URL}/api/gestao/boletim`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(sb ? { Authorization: `Bearer ${await sessao(sb)}` } : {}) }, body: JSON.stringify({ petshopId: P, petId: L.pets.Thor, tipo: 'banho', chips: ['comportado', 'perfume', 'inventado'], nota: 'adorou a água', ...corpo }) }); return { status: x.status, j: await x.json().catch(() => null) }; };
  let x = await ia(tosador);
  T.ok('o tosador recebe o texto (de teste) feito só com os recados e a nota', x.status === 200 && x.j.ia === true && /Thor/.test(x.j.texto) && /perfumado/.test(x.j.texto) && /adorou a água/.test(x.j.texto) && /texto de teste/.test(x.j.texto), x);
  T.ok('sem login: 401', (await ia(null)).status === 401);
  T.ok('pet de outro pet shop: 403', (await ia(outro, { petshopId: Bl.P })).status === 403);
  T.ok('quem só cuida do estoque: 403', (await ia(estoque)).status === 403);
  const usados = B.num(`select coalesce((select textos from boletim_ia_uso where petshop_id='${P}'), 0)`);
  T.ok('o dia do pet shop contou o texto', usados >= 1, usados);
  const lim = Number(B.sql(`select coalesce((select valor from config_interna where chave='boletim_ia_dia'), '100')`));
  B.sql(`update boletim_ia_uso set textos = ${lim - 1} where petshop_id='${P}'`);
  x = await ia(tosador);
  T.ok('com 1 sobrando no dia (limite boletim_ia_dia), ainda escreve', x.j?.ia === true, x.j);
  x = await ia(tosador);
  T.ok('passou do limite do dia: volta o texto pronto, sem IA', x.status === 200 && x.j?.ia === false && x.j.motivo === 'limite' && /Thor/.test(x.j.texto), x.j);
  T.ok('a contagem não passa do limite', B.num(`select textos from boletim_ia_uso where petshop_id='${P}'`) === lim);

  T.secao('prazo de 60 dias e freio');
  B.sql(`update boletins set expira_em = now() - interval '1 minute' where id='${bol.id}'`);
  T.ok('vencido: a página some (nada, 404) e a foto também', (await anon.rpc('boletim_publico', { p_token: bol.token })).data === null && (await anon.rpc('boletim_foto', { p_token: bol.token, p_n: 0 })).data === null && (await fetch(`${B.BASE_URL}/gestao/boletim/${bol.token}`)).status === 404);
  T.recusa('vencido não se corrige (faz um novo)', await salvar(tosador, { p_id: bol.id, p_fotos: [f1] }), /venceu/);
  T.ok('vencido, as fotos continuam guardadas (álbum)', existe(f1.caminho) && B.num(`select cardinality(fotos) from boletins where id='${bol.id}'`) === 2);
  B.sql(`update boletins set expira_em = now() + interval '60 days' where id='${bol.id}'`);
  B.sql(`insert into boletim_acessos (boletim_id, tipo, minuto, n) values ('${bol.id}', 'pagina', date_trunc('minute', now()), 60) on conflict (boletim_id, tipo, minuto) do update set n = 60`);
  const fr = await anon.rpc('boletim_publico', { p_token: bol.token });
  T.ok('passou de 60 aberturas no minuto: PT429', fr.error?.code === 'PT429', fr.error);
  B.sql(`delete from boletim_acessos where boletim_id='${bol.id}'`);

  T.secao('álbum do pet');
  const assinar = async (sb, cs) => (B.must(await sb.storage.from('boletim').createSignedUrls(cs, 61 * 86400), 'assinar')).map((s) => ({ caminho: s.path, assinatura: new URL(s.signedUrl).searchParams.get('token') }));
  T.recusa('foto de fora dos boletins do pet não entra (álbum vazio)', await tosador.rpc('album_criar', { p_petshop: P, p_pet: L.pets.Mel, p_fotos: await assinar(tosador, [f1.caminho]) }));
  T.recusa('quem só cuida do estoque não cria álbum', await estoque.rpc('album_criar', { p_petshop: P, p_pet: L.pets.Thor, p_fotos: [{ caminho: f1.caminho, assinatura: 'a.b.c' }] }));
  const al = await tosador.rpc('album_criar', { p_petshop: P, p_pet: L.pets.Thor, p_fotos: await assinar(tosador, [f1.caminho, fx.caminho]) });
  T.passa('o tosador cria o link do álbum do Thor', al, al.data?.fotos === 2);
  const ap = B.must(await anon.rpc('album_publico', { p_token: al.data.token }), 'album_publico');
  T.ok('o álbum público mostra 2 fotos (dia e tipo), sem caminho nem dado do tutor', ap.fotos.length === 2 && ap.fotos[0].tipo === 'banho' && !/caminho|assinatura|Ana|11988880001/.test(JSON.stringify(ap)), ap);
  h = await fetch(`${B.BASE_URL}/gestao/album/${al.data.token}/foto/1`);
  T.ok('a rota do álbum entrega a foto', h.status === 200 && Buffer.from(await h.arrayBuffer()).equals(JPG), h.status);
  T.ok('a página do álbum abre', (await fetch(`${B.BASE_URL}/gestao/album/${al.data.token}`)).status === 200);

  T.secao('apagar foto (só o dono) e faxina');
  T.recusa('o tosador não apaga foto do álbum', await tosador.rpc('boletim_apagar_foto', { p_boletim: bol.id, p_caminho: f1.caminho }), /dono/);
  T.passa('o dono apaga uma foto', await dono.rpc('boletim_apagar_foto', { p_boletim: bol.id, p_caminho: f1.caminho }));
  T.ok('a foto sai do boletim e do álbum e vai para a fila', B.num(`select cardinality(fotos) from boletins where id='${bol.id}'`) === 1 && B.must(await anon.rpc('album_publico', { p_token: al.data.token }), 'album').fotos.length === 1 && naFila(f1.caminho));
  await outro.storage.from('boletim').remove([f1.caminho]);
  T.ok('outro pet shop não apaga o arquivo da fila', existe(f1.caminho));
  const fz = B.must(await tosador.rpc('boletim_faxina', { p_petshop: P }), 'faxina');
  T.ok('a faxina devolve os arquivos da fila (o que saiu e o trocado)', fz.apagar.includes(f1.caminho) && fz.apagar.includes(f2.caminho), fz);
  await tosador.storage.from('boletim').remove(fz.apagar);
  T.ok('a equipe apaga os arquivos da fila', !existe(f1.caminho) && !existe(f2.caminho));
  T.ok('a foto que está em boletim não se apaga pela API', ((await tosador.storage.from('boletim').remove([fx.caminho])).data ?? []).length === 0 && existe(fx.caminho));
  const orfa = await foto(tosador);
  B.sql(`update storage.objects set created_at = now() - interval '2 days' where bucket_id='boletim' and name='${orfa.caminho}'`);
  const fz2 = B.must(await mon.rpc('boletim_faxina', { p_petshop: P }), 'faxina 2');
  T.ok('arquivo sem boletim há mais de um dia entra na faxina', fz2.apagar.includes(orfa.caminho), fz2);
  T.recusa('anônimo e outro pet shop não rodam a faxina', await anon.rpc('boletim_faxina', { p_petshop: P }));
  B.sql(`update albuns set expira_em = now() - interval '1 minute' where token='${al.data.token}'`);
  T.ok('álbum vencido some', (await anon.rpc('album_publico', { p_token: al.data.token })).data === null);
  B.sql(`select boletim_faxina_geral()`);
  T.ok('a faxina geral apaga o link vencido do álbum', B.num(`select count(*) from albuns where token='${al.data.token}'`) === 0);
  B.sql(`delete from pets where id='${L.pets.Thor}'`);
  T.ok('pet apagado: o boletim sai e a foto vai para a fila', B.num(`select count(*) from boletins where id='${bol.id}'`) === 0 && naFila(fx.caminho));
}))();
