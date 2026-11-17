// Ajustes da revisão jurídica (migração 20261210): registro de acesso (Marco Civil, 6 meses; ninguém lê além do admin; a faxina
// apaga o que passou de 6 meses), apagar os dados do tutor também limpa orçamentos e as conversas com o Mozart que citam o tutor,
// conversas com o assistente guardadas por 12 meses, texto novo da autorização de foto com IP e navegador, e o código (SHA-256)
// do aceite do checklist de entrada. As rotas do servidor (autorização pela página do boletim) só com o servidor no ar.
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const B = require('../lib/base');
const { criarLoja, SENHA } = require('../lib/semente');
const T = require('../lib/teste')('lgpd-ajustes');

const NAV = 'TesteLGPD/1.0 (navegador de teste)';
const JPG = Buffer.from('/9j/4AAQSkZJRgABAQAAAAAAAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAQABADASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAb/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAABgf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCkATEuf//Z', 'base64');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const clienteCom = (ip, nav = NAV) => createClient(B.SUPABASE_URL, B.SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { 'x-forwarded-for': ip, 'user-agent': nav } },
});

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'LGPD ajustes' });
  const O = await criarLoja(T, { nome: 'LGPD ajustes outra', equipe: false });
  const P = L.P, anon = B.cliente(), dono = L.sb.dono;
  const uidDono = B.sql(`select id from auth.users where email = ${B.q(L.emails.dono)}`);

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('registro de acesso: grava no login e na abertura (uma vez por dia)');
  const ip = B.ipAleatorio();
  const sbIp = clienteCom(ip);
  B.must(await sbIp.auth.signInWithPassword({ email: L.emails.dono, password: SENHA }), 'login com IP');
  const r1 = await sbIp.rpc('registrar_acesso', { p_origem: 'login' });
  T.passa('login: gravou', r1, r1.data === true);
  const linha = B.sql(`select origem || '|' || coalesce(ip, '') || '|' || coalesce(navegador, '') from registros_acesso where user_id = '${uidDono}' order by em desc limit 1`);
  T.ok('com o IP e o navegador do pedido', linha === `login|${ip}|${NAV}`, linha);
  T.ok('dois logins no mesmo minuto: grava um só', (await sbIp.rpc('registrar_acesso', { p_origem: 'login' })).data === false);
  T.ok('abertura no mesmo dia do login: não grava de novo', (await sbIp.rpc('registrar_acesso', { p_origem: 'abertura' })).data === false);
  T.ok('só uma linha desta pessoa hoje', B.num(`select count(*) from registros_acesso where user_id = '${uidDono}'`) === 1);
  const uidCaixa = B.sql(`select id from auth.users where email = ${B.q(L.emails.caixa)}`);
  T.ok('abertura (primeira do dia) da recepção: grava', (await L.sb.caixa.rpc('registrar_acesso', { p_origem: 'abertura' })).data === true);
  T.ok('segunda abertura no dia: não grava', (await L.sb.caixa.rpc('registrar_acesso', { p_origem: 'abertura' })).data === false
    && B.num(`select count(*) from registros_acesso where user_id = '${uidCaixa}'`) === 1);
  T.ok('origem inventada: não grava', (await L.sb.caixa.rpc('registrar_acesso', { p_origem: 'qualquer' })).data === false);
  T.recusa('anônimo não chama registrar_acesso', await anon.rpc('registrar_acesso', { p_origem: 'login' }));
  const navLongo = 'N'.repeat(800);
  const sbLongo = clienteCom(B.ipAleatorio(), navLongo);
  B.must(await sbLongo.auth.signInWithPassword({ email: L.emails.tosador, password: SENHA }), 'login do tosador');
  await sbLongo.rpc('registrar_acesso', { p_origem: 'login' });
  T.ok('navegador cortado em 300 letras', B.num(`select max(char_length(navegador)) from registros_acesso r join auth.users u on u.id = r.user_id where u.email = ${B.q(L.emails.tosador)}`) === 300);

  T.secao('registro de acesso: ninguém lê nem grava direto; o admin lê pela função');
  for (const [n, c] of [['anônimo', anon], ['dono', dono], ['recepção', L.sb.caixa]]) {
    const q = await c.from('registros_acesso').select('*').limit(5);
    T.ok(`${n} não lê a tabela`, !!q.error || (q.data ?? []).length === 0, q.error?.message);
    T.ok(`${n} não grava na tabela`, !!(await c.from('registros_acesso').insert({ user_id: uidDono, origem: 'login' })).error);
  }
  T.recusa('o dono não chama admin_registros_acesso', await dono.rpc('admin_registros_acesso', { p_email: L.emails.dono }), /restrito/);
  T.recusa('anônimo não chama admin_registros_acesso', await anon.rpc('admin_registros_acesso', { p_email: L.emails.dono }));
  const adm = B.cliente();
  const emailAdm = `t-${L.suf}.admin@teste-auto.local`;
  B.must(await adm.auth.signUp({ email: emailAdm, password: SENHA, options: B.dadosDoCadastro() }), 'cadastro do admin');
  const uidAdm = (await adm.auth.getUser()).data.user.id;
  B.sql(`insert into admins (user_id) values ('${uidAdm}') on conflict do nothing`);
  T.depois(() => B.sql(`delete from admins where user_id='${uidAdm}'`));
  const lidos = B.must(await adm.rpc('admin_registros_acesso', { p_email: L.emails.dono.toUpperCase() }), 'admin lê');
  T.ok('o admin lê os acessos do dono (pelo e-mail, sem diferença de maiúsculas), com IP e navegador', lidos.length === 1 && lidos[0].ip === ip && lidos[0].navegador === NAV && lidos[0].email === L.emails.dono, lidos);
  const porId = B.must(await adm.rpc('admin_registros_acesso', { p_user: uidCaixa }), 'admin lê por id');
  T.ok('e pelo login', porId.length === 1 && porId[0].origem === 'abertura', porId);

  T.secao('faxina: registro de acesso 6 meses, conversas com o assistente 12 meses');
  B.sql(`insert into registros_acesso (user_id, em, origem, ip) values
    ('${uidDono}', now() - interval '6 months' - interval '1 day', 'login', '10.0.0.1'),
    ('${uidDono}', now() - interval '6 months' + interval '1 day', 'login', '10.0.0.2')`);
  B.sql(`insert into conversas (petshop_id, user_id, canal, pergunta, resposta, criado_em) values
    ('${P}', '${uidDono}', 'mozart', 'conversa velha 13m', 'r', now() - interval '12 months' - interval '1 day'),
    ('${P}', '${uidDono}', 'ajuda', 'conversa de 11 meses', 'r', now() - interval '11 months')`);
  B.sql(`insert into assistente_eventos (petshop_id, user_id, acao, pedido, criado_em) values
    ('${P}', '${uidDono}', 'pedido', 'pedido velho 13m', now() - interval '12 months' - interval '1 day'),
    ('${P}', '${uidDono}', 'pedido', 'pedido de 11 meses', now() - interval '11 months')`);
  T.recusa('o dono não chama a faxina do banco', await dono.rpc('gestao_faxina_banco'));
  const fx = JSON.parse(B.sql(`select public.gestao_faxina_banco()::text`));
  T.ok('a faxina conta o que apagou', fx.acessos >= 1 && fx.conversas >= 1 && fx.eventos >= 1, fx);
  T.ok('acesso com mais de 6 meses: apagado', B.num(`select count(*) from registros_acesso where ip = '10.0.0.1' and user_id = '${uidDono}'`) === 0);
  T.ok('acesso com menos de 6 meses: fica', B.num(`select count(*) from registros_acesso where ip = '10.0.0.2' and user_id = '${uidDono}'`) === 1);
  T.ok('conversa com mais de 12 meses: apagada; a de 11 meses fica',
    B.num(`select count(*) from conversas where petshop_id = '${P}' and pergunta = 'conversa velha 13m'`) === 0
    && B.num(`select count(*) from conversas where petshop_id = '${P}' and pergunta = 'conversa de 11 meses'`) === 1);
  T.ok('histórico do Mozart com mais de 12 meses: apagado; o de 11 meses fica',
    B.num(`select count(*) from assistente_eventos where petshop_id = '${P}' and pedido = 'pedido velho 13m'`) === 0
    && B.num(`select count(*) from assistente_eventos where petshop_id = '${P}' and pedido = 'pedido de 11 meses'`) === 1);
  T.ok('a tarefa diária continua chamando a mesma faxina', B.num(`select count(*) from pg_extension where extname = 'pg_cron'`) === 0
    || B.num(`select count(*) from cron.job where jobname = 'gestao-faxina-diaria' and command like '%gestao_faxina_banco%'`) === 1);

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('apagar o tutor: orçamentos e conversas com o Mozart');
  const itens = [{ tipo: 'servico', nome: 'Banho', qtd: 1, valor: 60 }];
  const orc = async (o) => B.must(await dono.from('orcamentos').insert({ petshop_id: P, itens, validade: L.dia(10), ...o }).select('id').single(), 'orçamento').id;
  const oAna = await orc({ cliente_id: L.tutores.Ana, nome: 'Ana Souza', telefone: '(11) 98888-0001', obs: 'Banho do Thor para a Ana Souza' });
  const oFone = await orc({ nome: 'Ana S.', telefone: '+55 11 98888-0001' });
  const oConv = await orc({ cliente_id: L.tutores.Ana, nome: 'Ana Souza', telefone: '11988880001' });
  B.sql(`do $$ begin perform set_config('maestro.orcamento_marcar', '${oConv}', true); update orcamentos set status = 'convertido', convertido_em = now() where id = '${oConv}'; end $$;`);
  const oBeto = await orc({ cliente_id: L.tutores.Beto, nome: 'Beto Lima', telefone: '11988880002' });
  const conv = (loja, pergunta, resposta = 'Pronto.') => B.sql(`insert into conversas (petshop_id, user_id, canal, pergunta, resposta) values ('${loja}', '${uidDono}', 'mozart', ${B.q(pergunta)}, ${B.q(resposta)}) returning id`);
  const cNome = conv(P, 'marca banho para o Thor da ana souza amanhã');
  const cFone = conv(P, 'quem é o tutor do 11 98888-0001?', 'É a tutora do Thor.');
  const cResp = conv(P, 'quem vem amanhã?', 'Vem o Thor, da Ana   Souza, às 9h.');
  const cOutro = conv(P, 'marca banho para o Bob do Beto Lima');
  const cOutraLoja = conv(O.P, 'marca banho para a Ana Souza');
  const ev = (pedido, detalhes) => B.sql(`insert into assistente_eventos (petshop_id, user_id, acao, pedido, detalhes) values ('${P}', '${uidDono}', 'pedido', ${pedido == null ? 'null' : B.q(pedido)}, ${detalhes == null ? 'null' : B.q(JSON.stringify(detalhes)) + '::jsonb'}) returning id`);
  const eNome = ev('cadastra a Ana Souza de novo', null);
  const eId = ev(null, { pet_id: L.pets.Thor, servico: 'Banho' });
  const eOutro = ev('banho do Bob', { pet_id: L.pets.Bob });

  const r = await dono.rpc('cliente_anonimizar', { p_cliente: L.tutores.Ana, p_confirmacao: 'Ana Souza' });
  T.passa('apagou os dados da Ana', r, r.data?.ok === true && r.data.orcamentos === 3 && r.data.conversas >= 5);
  const o = (id) => B.sql(`select coalesce(nome, '-') || '|' || coalesce(telefone, '-') || '|' || coalesce(cliente_id::text, '-') || '|' || coalesce(obs, '-') || '|' || status || '|' || total from orcamentos where id = '${id}'`);
  T.ok('orçamento da Ana: sem nome, telefone e ficha; o nome sai da observação; o valor fica', o(oAna) === '-|-|-|Banho do Pet removido para a Cliente removido|aberto|60.00', o(oAna));
  T.ok('orçamento só com o telefone dela (+55 e espaços): limpo também', o(oFone).startsWith('-|-|-|'), o(oFone));
  T.ok('orçamento já convertido em venda: limpo também (continua convertido)', o(oConv).startsWith('-|-|-|-|convertido'), o(oConv));
  T.ok('orçamento do Beto: fica como estava', o(oBeto).startsWith(`Beto Lima|11988880002|${L.tutores.Beto}|`), o(oBeto));
  const existe = (tab, id) => B.num(`select count(*) from ${tab} where id = '${id}'`) === 1;
  T.ok('conversa com o nome dela (sem diferença de maiúsculas): apagada', !existe('conversas', cNome));
  T.ok('conversa com o telefone dela (formatado): apagada', !existe('conversas', cFone));
  T.ok('conversa com o nome dela na resposta (espaços a mais): apagada', !existe('conversas', cResp));
  T.ok('conversa sobre outro tutor: fica', existe('conversas', cOutro));
  T.ok('conversa de outro pet shop com o mesmo nome: fica', existe('conversas', cOutraLoja));
  T.ok('histórico do Mozart com o nome dela: apagado', !existe('assistente_eventos', eNome));
  T.ok('histórico do Mozart com o pet dela nos detalhes: apagado', !existe('assistente_eventos', eId));
  T.ok('histórico de outro tutor: fica', existe('assistente_eventos', eOutro));
  const reg = B.sql(`select detalhe::text from lgpd_registros where petshop_id = '${P}' and acao = 'apagou_tutor' order by 1 desc limit 1`);
  T.ok('o registro da LGPD conta orçamentos e conversas (sem nomes)', /"orcamentos": 3/.test(reg) && /"conversas"/.test(reg) && !/Ana/.test(reg), reg);

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('autorização de foto: texto novo, IP e navegador');
  B.sql(`update pets set sexo = 'M' where id = '${L.pets.Bob}'`);
  const loja = B.sql(`select nome from petshops where id = '${P}'`);
  const iniB = B.instante(L.hoje, '13:00', L.fuso);
  const agB = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Bob, servico_id: L.S.Banho, profissional_id: L.ids.tosador, inicio: iniB.toISOString(), fim: new Date(+iniB + 36e5).toISOString(), preco: 60 }).select('id').single(), 'horário do Bob').id;
  const bol = B.must(await dono.rpc('boletim_salvar', { p_petshop: P, p_id: null, p_pet: L.pets.Bob, p_agendamento: agB, p_estadia: null, p_texto: 'Foi ótimo.', p_chips: [], p_nota: '', p_atencao: '', p_fotos: [] }), 'boletim');
  const dia = B.sql(`select to_char((criado_em at time zone '${L.fuso}')::date, 'DD/MM/YYYY') from boletins where id = '${bol.id}'`);
  const textos = B.must(await anon.rpc('boletim_autorizacao', { p_token: bol.token }), 'textos').textos;
  const meio = 'para mostrar o trabalho da loja. As fotos não serão vendidas nem usadas por outras empresas. Se aparecer alguém na foto, a loja só posta com a autorização dessa pessoa.';
  T.ok('só este boletim: o texto novo, com a data', textos.boletim === `Autorizo ${loja} a postar nas redes sociais da loja, sem cobrar nada, as fotos do Bob deste boletim (${dia}), ${meio} Sem marcar o meu perfil. Posso tirar esta autorização quando quiser, pelo link "Não quero mais".`, textos.boletim);
  T.ok('este e as próximas: o texto novo', textos.todas === `Autorizo ${loja} a postar nas redes sociais da loja, sem cobrar nada, as fotos do Bob deste boletim e das próximas visitas, ${meio} Sem marcar o meu perfil. Posso tirar esta autorização quando quiser, pelo link "Não quero mais".`, textos.todas);
  T.ok('pet sem sexo: "de"', B.sql(`select public.foto_autorizacao_texto('Loja', 'Nina', null, 'boletim', '@ana', date '2026-11-17')`).includes('as fotos de Nina deste boletim (17/11/2026), para mostrar') , '');
  T.ok('com @: "Pode marcar o meu perfil @x."', B.sql(`select public.foto_autorizacao_texto('Loja', 'Mel', 'F', 'todas', '@ana', date '2026-11-17')`).includes('da Mel deste boletim e das próximas visitas, para mostrar o trabalho da loja.') &&
    B.sql(`select public.foto_autorizacao_texto('Loja', 'Mel', 'F', 'todas', '@ana', date '2026-11-17')`).includes('Pode marcar o meu perfil @ana. Posso tirar'));
  const ipF = B.ipAleatorio();
  const fa = B.must(await clienteCom(ipF).rpc('boletim_autorizar', { p_token: bol.token, p_escopo: 'boletim', p_marcar: '' }), 'autorizar');
  T.ok('a autorização guardou o texto novo', fa.texto === textos.boletim, fa.texto);
  const quem = B.sql(`select coalesce(ip, '') || '|' || coalesce(navegador, '') from fotos_autorizacoes where codigo = '${fa.codigo}'`);
  T.ok('e o IP e o navegador de quem autorizou', quem === `${ipF}|${NAV}`, quem);
  // autorização antiga: fica com o texto da época
  const antiga = 'Autorizo Loja a postar nas redes sociais da loja as fotos do Bob deste boletim (01/01/2026). Sem marcar o meu perfil.';
  B.sql(`update fotos_autorizacoes set texto = ${B.q(antiga)} where codigo = '${fa.codigo}'`);
  const de_novo = B.must(await anon.rpc('boletim_autorizar', { p_token: bol.token, p_escopo: 'boletim', p_marcar: '' }), 'de novo');
  T.ok('autorização antiga continua com o texto que o tutor aceitou', de_novo.codigo === fa.codigo && de_novo.texto === antiga, de_novo);
  if (await B.servidorNoAr()) {
    const ipR = B.ipAleatorio();
    const rr = await fetch(`${B.BASE_URL}/gestao/boletim/${bol.token}/autorizacao`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ipR, 'user-agent': 'NavegadorDoTutor/2.0' }, body: JSON.stringify({ escopo: 'todas', marcar: '@ana.pets' }) });
    const jr = await rr.json().catch(() => ({}));
    const q2 = B.sql(`select coalesce(ip, '') || '|' || coalesce(navegador, '') from fotos_autorizacoes where codigo = ${B.q(jr.codigo ?? '')}`);
    T.ok('pela rota da página: guarda o IP e o navegador do tutor (não os do servidor)', rr.status === 200 && q2 === `${ipR}|NavegadorDoTutor/2.0`, `${rr.status} ${q2}`);
  } else T.ok('servidor fora do ar: rota da autorização não conferida', true);

  // ---------------------------------------------------------------------------------------------------------------
  T.secao('checklist de entrada: código (SHA-256) do aceite');
  const { tosador, caixa } = L.sb;
  const ini = B.instante(L.hoje, '15:00', L.fuso);
  const ag = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Luna, servico_id: L.S.Banho, profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 60 }).select('id').single(), 'horário da Luna').id;
  const subir = async (ext) => { const c = `${P}/${B.uuid()}.${ext}`; const u = await tosador.storage.from('entrada').upload(c, ext === 'png' ? PNG : JPG, { contentType: ext === 'png' ? 'image/png' : 'image/jpeg' }); if (u.error) throw new Error(u.error.message); return c; };
  const f1 = await subir('jpg'), f2 = await subir('jpg');
  const termo = 'Conferi como a Luna chegou hoje.\nConcordo com o que está anotado.';
  const ent = B.must(await tosador.rpc('entrada_salvar', { p_petshop: P, p_id: null, p_pet: L.pets.Luna, p_agendamento: ag, p_estadia: null, p_dados: { temperamento: ['calmo'], termo }, p_fotos: [f1, f2] }), 'entrada');
  T.ok('sem aceite: sem código', B.sql(`select coalesce(aceite_hash, '-') from entradas where id = '${ent.id}'`) === '-');
  const sig = await subir('png');
  B.must(await caixa.rpc('entrada_assinar', { p_id: ent.id, p_nome: 'Clara Dias', p_assinatura: sig }), 'assinar');
  const esperado = crypto.createHash('sha256').update(`${termo}\n${f1}\n${f2}`, 'utf8').digest('hex');
  const h1 = B.sql(`select coalesce(aceite_hash, '-') from entradas where id = '${ent.id}'`);
  T.ok('assinatura no aparelho: guarda o SHA-256 do texto e das fotos', h1 === esperado, `${h1} x ${esperado}`);
  const lido = await dono.from('entradas').select('aceite_hash').eq('id', ent.id).single();
  T.ok('a equipe lê o código (vai no comprovante)', lido.data?.aceite_hash === esperado, lido.error?.message);
  T.recusa('ninguém grava o código direto', await dono.from('entradas').update({ aceite_hash: 'f'.repeat(64) }).eq('id', ent.id).select('id').single());
  // mudar a entrada desfaz o aceite: o código sai junto; aceite pelo link grava o novo
  B.must(await tosador.rpc('entrada_salvar', { p_petshop: P, p_id: ent.id, p_pet: L.pets.Luna, p_agendamento: ag, p_estadia: null, p_dados: { temperamento: ['agitado'], termo }, p_fotos: [f2] }), 'corrigir');
  T.ok('entrada mudou depois do aceite: código apagado com o aceite', B.sql(`select coalesce(aceite_hash, '-') || '|' || coalesce(aceito_em::text, '-') from entradas where id = '${ent.id}'`) === '-|-');
  const lk = B.must(await tosador.rpc('entrada_link', { p_id: ent.id, p_fotos: [{ caminho: f2, assinatura: 'a.b.c' }] }), 'link');
  B.must(await anon.rpc('entrada_aceitar', { p_token: lk.token, p_nome: 'Clara Dias', p_ip: '203.0.113.9', p_navegador: 'Celular' }), 'aceitar pelo link');
  const esperado2 = crypto.createHash('sha256').update(`${termo}\n${f2}`, 'utf8').digest('hex');
  T.ok('aceite pelo link: o código do que foi aceito agora', B.sql(`select aceite_hash from entradas where id = '${ent.id}'`) === esperado2);
  B.sql(`update entradas set devolvido_em = now() where id = '${ent.id}'`);
  T.ok('outra gravação na entrada aceita não muda o código', B.sql(`select aceite_hash from entradas where id = '${ent.id}'`) === esperado2);
}))();
