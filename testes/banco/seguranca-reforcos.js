// Reforços de segurança (migração 20261245): painel do administrador só com o segundo fator (aal2), teto da IA do teste grátis
// e e-mail do dono confirmado, IP dos aceites públicos só com o segredo do servidor, freio por rede do link (Tirar dúvida e as
// consultas anônimas), bucket `pets` privado (equipe por endereço assinado, logo e página do tutor pelas rotas do servidor) e
// as chaves compostas (lançamento e foto do diário de outro pet shop não entram).
const crypto = require('crypto');
const B = require('../lib/base');
const { criarLoja, SENHA } = require('../lib/semente');
const T = require('../lib/teste')('seguranca-reforcos');

const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
/** O segredo que o servidor de teste usa (sem GESTAO_SEGREDO_SERVIDOR: derivado da chave falsa da Anthropic, servidor.ts). */
const SEGREDO = crypto.createHmac('sha256', process.env.ANTHROPIC_API_KEY || 'sk-ant-chave-falsa').update('maestro-pet:servidor:v1').digest('hex');
const { createClient } = require(require('path').join(B.RAIZ, 'node_modules', '@supabase', 'supabase-js'));
/** Cliente com cabeçalhos escolhidos (o que alguém chamando a API direto consegue mandar). */
const clienteCom = (headers) => createClient(B.SUPABASE_URL, B.SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers } });
const config = (chave, valor) => B.sql(valor === null ? `delete from config_interna where chave = ${B.q(chave)}`
  : `insert into config_interna (chave, valor) values (${B.q(chave)}, ${B.q(valor)}) on conflict (chave) do update set valor = excluded.valor`);
/** Muda uma chave de config_interna até o fim do teste (volta ao que era). */
function configTemporaria(chave, valor) {
  const antes = B.sql(`select valor from config_interna where chave = ${B.q(chave)}`) || null;
  config(chave, valor);
  T.depois(() => config(chave, antes));
}

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Reforcos' });
  const O = await criarLoja(T, { nome: 'Reforcos Outro', equipe: false });
  const { dono, estoque, caixa } = L.sb;
  const anon = B.cliente();
  const P = L.P;

  // ---------------------------------------------------------------- 1
  T.secao('painel do administrador com o segundo fator');
  const adm = B.cliente();
  const emailAdm = `t-${L.suf}.admin@teste-auto.local`;
  B.must(await adm.auth.signUp({ email: emailAdm, password: SENHA, options: B.dadosDoCadastro() }), 'cadastro do admin');
  const uid = (await adm.auth.getUser()).data.user.id;
  B.sql(`insert into admins (user_id) values ('${uid}') on conflict do nothing`);
  T.depois(() => B.sql(`delete from admins where user_id='${uid}'`));
  const aal = async (sb) => JSON.parse(Buffer.from((await sb.auth.getSession()).data.session.access_token.split('.')[1], 'base64url').toString()).aal;
  T.ok('a sessão com senha é aal1', (await aal(adm)) === 'aal1');
  const s1 = B.must(await adm.rpc('admin_situacao'), 'situação');
  T.ok('admin_situacao: é admin, sessão ainda não é forte', s1.admin === true && s1.forte === false, s1);
  T.ok('sou_admin() é false com aal1', (await adm.rpc('sou_admin')).data === false);
  for (const f of ['admin_painel', 'admin_visao_geral', 'admin_uso_contas', 'admin_servidor_estado', 'admin_erros', 'admin_copias']) {
    T.recusa(`${f} recusado com aal1 (só a senha)`, await adm.rpc(f, f === 'admin_erros' ? { p_horas: 24, p_resolvidos: false } : {}), /restrito|Acesso/i);
  }
  T.recusa('admin_atualizar recusado com aal1', await adm.rpc('admin_atualizar', { p_petshop: P, p_status: 'ativa' }));
  T.ok('… e a loja continua em teste', B.sql(`select status from petshops where id='${P}'`) === 'teste');
  const tokenAal1 = (await adm.auth.getSession()).data.session.access_token;
  const copia1 = await fetch(`${B.BASE_URL}/api/gestao/admin/copia`, { headers: { authorization: `Bearer ${tokenAal1}` } });
  T.ok('rota da cópia completa: 403 com aal1', copia1.status === 403, copia1.status);
  void copia1.body?.cancel();
  T.ok('admin_situacao de quem não é admin: admin = false', B.must(await dono.rpc('admin_situacao'), 'situação do dono').admin === false);
  T.ok('anônimo não chama admin_situacao', !!(await anon.rpc('admin_situacao')).error);

  const segredo = await B.adminForte(adm);
  T.ok('cadastrou o fator TOTP e conferiu o código: a sessão vira aal2', (await aal(adm)) === 'aal2' && /^[A-Z2-7]{16,}$/.test(segredo), await aal(adm));
  T.ok('admin_situacao: forte', B.must(await adm.rpc('admin_situacao'), 'situação').forte === true);
  T.ok('sou_admin() é true com aal2', (await adm.rpc('sou_admin')).data === true);
  T.passa('admin_painel responde com aal2', await adm.rpc('admin_painel'));
  T.passa('admin_servidor_estado responde com aal2', await adm.rpc('admin_servidor_estado'));
  const copia2 = await fetch(`${B.BASE_URL}/api/gestao/admin/copia`, { headers: { authorization: `Bearer ${(await adm.auth.getSession()).data.session.access_token}` } });
  T.ok('rota da cópia completa: passa da conferência com aal2 (200, ou 503 sem a chave de serviço)', [200, 503].includes(copia2.status), copia2.status);
  void copia2.body?.cancel();
  // outra sessão do mesmo admin (outro aparelho): só a senha não basta, o código do aplicativo sim
  const adm2 = B.cliente();
  B.must(await adm2.auth.signInWithPassword({ email: emailAdm, password: SENHA }), 'login de novo');
  T.recusa('outro aparelho com a senha certa e sem o código: recusado', await adm2.rpc('admin_painel'));
  const fatores = B.must(await adm2.auth.mfa.listFactors(), 'fatores');
  T.recusa('código errado não passa', await adm2.auth.mfa.challengeAndVerify({ factorId: fatores.totp[0].id, code: B.totp(segredo) === '000000' ? '111111' : '000000' }));
  await B.adminForte(adm2);
  T.passa('com o código do aplicativo: passa', await adm2.rpc('admin_painel'));
  T.ok('o dono comum continua sem acesso ao painel', !!(await dono.rpc('admin_painel')).error);
  T.ok('nenhuma função fora do painel usa sou_admin() (só admin_* e as regras da Escola)',
    B.sql(`select coalesce(string_agg(proname, ','), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and prosrc ilike '%sou_admin()%' and proname not like 'admin\\_%' and proname <> 'sou_admin'`) === '');

  // ---------------------------------------------------------------- 2
  T.secao('IA do teste grátis: teto próprio e e-mail confirmado');
  const conta = (sb, petshop, tipo = 'pedido', canal = 'mozart') => sb.rpc('assistente_contar_v2', { p_petshop: petshop, p_canal: canal, p_tipo: tipo, p_limite: 50 });
  for (const [c, t] of [['mozart', 2000], ['ajuda', 750], ['boletim', 375], ['link_ia', 750], ['caderno', 750]]) {
    const antes = B.sql(`select valor from config_interna where chave = '${c}_dia_geral_teste'`);
    if (!antes) T.ok(`teto do teste de ${c}: um quarto do teto geral (${t})`, B.num(`select ia_teto_teste('${c}')`) === t, B.sql(`select ia_teto_teste('${c}')`));
  }
  T.ok('loja em teste com o e-mail do dono confirmado usa o Mozart', B.must(await conta(dono, P), 'conta').ok === true);
  configTemporaria('mozart_dia_geral_teste', String(B.num(`select ia_uso_teste('mozart')`)));
  configTemporaria('boletim_dia_geral_teste', String(B.num(`select ia_uso_teste('boletim')`)));
  configTemporaria('caderno_dia_geral_teste', String(B.num(`select ia_uso_teste('caderno')`)));
  configTemporaria('ajuda_dia_geral_teste', String(B.num(`select ia_uso_teste('ajuda')`)));
  let r = B.must(await conta(dono, P, 'chamada'), 'conta');
  T.ok('teto dos pet shops em teste cheio: o Mozart do teste para (motivo geral)', r.ok === false && r.motivo === 'geral', r);
  r = B.must(await conta(dono, P, 'pedido', 'ajuda'), 'ajuda');
  T.ok('… a Ajuda com IA também', r.ok === false && r.motivo === 'geral', r);
  r = B.must(await dono.rpc('boletim_ia_contar', { p_petshop: P }), 'boletim');
  T.ok('… o texto do boletim também', r.ok === false && r.motivo === 'geral', r);
  r = B.must(await dono.rpc('caderno_contar', { p_petshop: P, p_paginas: 1 }), 'caderno');
  T.ok('… a leitura do caderno também', r.ok === false && r.motivo === 'geral', r);
  T.ok('… mas a consulta de quanto resta do caderno continua respondendo', B.must(await dono.rpc('caderno_contar', { p_petshop: P, p_paginas: 0 }), 'resta').ok === true);
  B.sql(`update petshops set status = 'ativa' where id = '${O.P}'`);
  r = B.must(await conta(O.sb.dono, O.P, 'chamada'), 'conta paga');
  T.ok('pet shop que paga continua com o Mozart com o teto do teste cheio', r.ok === true, r);
  T.ok('… e o texto do boletim', B.must(await O.sb.dono.rpc('boletim_ia_contar', { p_petshop: O.P }), 'boletim pago').ok === true);
  B.sql(`update petshops set status = 'teste' where id = '${O.P}'`);

  for (const c of ['mozart', 'boletim', 'caderno', 'ajuda']) config(`${c}_dia_geral_teste`, '999999'); // o fim do teste volta ao que era
  const N = await criarLoja(T, { nome: 'Reforcos Sem Email', equipe: false, emailSemConfirmar: true });
  const semEmail = N.sb.dono;
  r = B.must(await conta(semEmail, N.P), 'conta sem e-mail');
  T.ok('teste grátis com o e-mail do dono sem confirmar: Mozart recusado (motivo email)', r.ok === false && r.motivo === 'email', r);
  r = B.must(await semEmail.rpc('boletim_ia_contar', { p_petshop: N.P }), 'boletim sem e-mail');
  T.ok('… texto do boletim recusado (email)', r.ok === false && r.motivo === 'email', r);
  r = B.must(await semEmail.rpc('caderno_contar', { p_petshop: N.P, p_paginas: 0 }), 'caderno sem e-mail');
  T.ok('… caderno avisa já na consulta (email)', r.ok === false && r.motivo === 'email', r);
  T.ok('nada foi contado para o pet shop sem e-mail', B.num(`select count(*) from assistente_uso where petshop_id = '${N.P}'`) === 0);
  B.sql(`insert into emails_confirmados (user_id, email) select id, lower(email) from auth.users where email = ${B.q(N.emails.dono)} on conflict (user_id) do nothing`);
  T.ok('depois de provar o e-mail (código ou link de senha): o Mozart atende', B.must(await conta(semEmail, N.P), 'conta provado').ok === true);
  B.sql(`delete from emails_confirmados where user_id = (select id from auth.users where email = ${B.q(N.emails.dono)}); update petshops set status = 'ativa' where id = '${N.P}'`);
  T.ok('pet shop que paga não depende do e-mail confirmado', B.must(await conta(semEmail, N.P), 'conta ativa').ok === true);
  B.sql(`update petshops set status = 'teste' where id = '${N.P}'`);

  // ---------------------------------------------------------------- 3
  T.secao('IP dos aceites públicos');
  const ini = B.instante(L.hoje, '09:00', L.fuso);
  const ag = B.must(await dono.from('agendamentos').insert({ petshop_id: P, pet_id: L.pets.Thor, servico_id: L.S.Banho, profissional_id: L.ids.tosador, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 60 }).select('id').single(), 'horário').id;
  const bol = B.must(await dono.rpc('boletim_salvar', { p_petshop: P, p_id: null, p_pet: L.pets.Thor, p_agendamento: ag, p_estadia: null, p_texto: 'Foi ótimo.', p_chips: [], p_nota: '', p_atencao: '', p_fotos: [] }), 'boletim');
  const ipReal = B.ipAleatorio();
  const forjado = clienteCom({ 'x-forwarded-for': ipReal, 'x-maestro-ip': '6.6.6.6', 'x-maestro-navegador': 'Navegador Inventado' });
  const a1 = B.must(await forjado.rpc('boletim_autorizar', { p_token: bol.token, p_escopo: 'boletim', p_marcar: '' }), 'autorizar sem segredo');
  const linha1 = B.sql(`select coalesce(ip, '') || '|' || coalesce(navegador, '') from fotos_autorizacoes where codigo = ${B.q(a1.codigo)}`).split('|');
  T.ok('sem o segredo do servidor: x-maestro-ip é ignorado (fica o IP que o banco vê)', linha1[0] === ipReal, linha1);
  T.ok('… e x-maestro-navegador também', linha1[1] !== 'Navegador Inventado', linha1);
  const a2 = B.must(await forjado.rpc('boletim_autorizar', { p_token: bol.token, p_escopo: 'todas', p_marcar: '', p_segredo: 'segredo-inventado-'.repeat(3) }), 'segredo errado');
  T.ok('com segredo errado: também ignorado', B.sql(`select ip from fotos_autorizacoes where codigo = ${B.q(a2.codigo)}`) === ipReal);
  // o servidor de verdade (rota da página do boletim, com o segredo) repassa o IP de quem tocou
  const travaAntes = B.sql(`select valor from config_interna where chave = 'servidor_segredo_sha256'`);
  B.sql(`select servidor_segredo_registrar('${SEGREDO}')`);
  T.depois(() => B.sql(travaAntes ? `update config_interna set valor = '${travaAntes}' where chave = 'servidor_segredo_sha256'` : `delete from config_interna where chave in ('servidor_segredo_sha256', 'servidor_segredo_sha256_em', 'servidor_segredo_origem')`));
  const ipTutor = B.ipAleatorio();
  const rota = await fetch(`${B.BASE_URL}/gestao/boletim/${bol.token}/autorizacao`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ipTutor, 'user-agent': 'Navegador do Tutor' }, body: JSON.stringify({ escopo: 'boletim', marcar: '@thor' }) });
  const rj = await rota.json().catch(() => null);
  T.ok('pela rota do servidor (com o segredo): grava o IP e o navegador de quem tocou', rota.status === 200 && B.sql(`select ip || '|' || navegador from fotos_autorizacoes where codigo = ${B.q(rj?.codigo ?? '')}`) === `${ipTutor}|Navegador do Tutor`, [rota.status, rj]);
  // aceite dos documentos (reaceite): o IP da Cloudflare antes do x-forwarded-for que o cliente manda
  const versoes = require('../lib/app').lib('documentos').aceiteDoCadastro();
  B.sql(`delete from aceites where user_id = (select id from auth.users where email = ${B.q(L.emails.dono)})`);
  const cf = B.ipAleatorio();
  const comCf = clienteCom({ 'x-forwarded-for': '6.6.6.6', 'cf-connecting-ip': cf });
  B.must(await comCf.auth.signInWithPassword({ email: L.emails.dono, password: SENHA }), 'login');
  B.must(await comCf.rpc('aceitar_documentos', { p_termos: versoes.termos, p_privacidade: versoes.privacidade }), 'reaceite');
  T.ok('aceitar_documentos grava o cf-connecting-ip, não o x-forwarded-for', B.sql(`select string_agg(distinct ip, ',') from aceites where user_id = (select id from auth.users where email = ${B.q(L.emails.dono)})`) === cf);

  // ---------------------------------------------------------------- 5
  T.secao('freio por rede do link');
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'link.ia': true } }), 'liga o Tirar dúvida');
  const pergunta = async (rede) => {
    const x = await fetch(`${B.BASE_URL}/api/gestao/link-ia`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': rede }, body: JSON.stringify({ codigo: L.codigo, falas: [{ de: 'eu', texto: 'Vocês abrem no domingo?' }] }) });
    return { status: x.status, j: await x.json().catch(() => null) };
  };
  const usoIa = () => B.num(`select coalesce(sum(perguntas), 0) from link_ia_uso where petshop_id='${P}'`);
  configTemporaria('link_ia_rede_hora', '3');
  const visitante = B.ipAleatorio();
  const respostas = [];
  for (let i = 0; i < 4; i++) respostas.push(await pergunta(visitante));
  T.ok('a mesma rede: as 3 primeiras perguntas respondidas', respostas.slice(0, 3).every((x) => x.status === 200 && !x.j?.limite), respostas.map((x) => x.status + ':' + !!x.j?.limite));
  T.ok('… a 4ª na hora fica no limite (freio do banco, vale em todas as instâncias)', respostas[3].j?.limite === true, respostas[3]);
  T.ok('… e não gastou a cota do pet shop', usoIa() === 3, usoIa());
  T.ok('outra rede continua perguntando', (await pergunta(B.ipAleatorio())).j?.limite !== true);
  T.ok('IPv6 da mesma casa (/64) conta junto', B.sql(`select rede_chave('2001:db8:1:2::1') = rede_chave('2001:db8:1:2:ffff::9') and rede_chave('2001:db8:1:2::1') <> rede_chave('2001:db8:1:3::1')`) === 't');
  let semSegredo = 0;
  for (let i = 0; i < 4; i++) if (B.must(await anon.rpc('link_ia_contar', { p_codigo: L.codigo, p_segredo: 'errado', p_rede: visitante }), 'direto').motivo === 'recusado') semSegredo++;
  T.ok('chamar a contagem direto com uma rede inventada e sem o segredo: recusado', semSegredo === 4);

  configTemporaria('link_freio_horarios_hora', '4');
  configTemporaria('link_freio_hotel_estimativa_hora', '3');
  configTemporaria('link_freio_estadia_cheios_hora', '3');
  const tutorRede = B.cliente(B.ipAleatorio()), outraRede = B.cliente(B.ipAleatorio());
  const diaUtil = B.proximoDia(L.hoje, [1, 2, 3, 4, 5]);
  const horarios = [];
  for (let i = 0; i < 5; i++) horarios.push(await tutorRede.rpc('link_horarios', { p_codigo: L.codigo, p_servico: L.S.Banho, p_dia: diaUtil, p_pets: 1 }));
  T.ok('link_horarios: as consultas dentro do limite respondem', horarios.slice(0, 4).every((x) => !x.error && Array.isArray(x.data)), horarios.map((x) => x.error?.message));
  T.ok('… a que passa do limite da rede: 429', horarios[4].error?.code === 'PT429', horarios[4].error);
  T.passa('… outra rede continua consultando', await outraRede.rpc('link_horarios', { p_codigo: L.codigo, p_servico: L.S.Banho, p_dia: diaUtil, p_pets: 1 }));
  T.passa('… a equipe (com login) não passa pelo freio', await dono.rpc('link_horarios', { p_codigo: L.codigo, p_servico: L.S.Banho, p_dia: diaUtil, p_pets: 1 }));
  const est = [];
  for (let i = 0; i < 4; i++) est.push(await tutorRede.rpc('link_hotel_estimativa', { p_codigo: L.codigo, p_entrada: L.dia(3), p_saida: L.dia(5), p_pets: [{ porte: 'M' }] }));
  T.ok('link_hotel_estimativa: 3 respondem, a 4ª é 429', est.slice(0, 3).every((x) => !x.error && x.data?.total > 0) && est[3].error?.code === 'PT429', est.map((x) => x.error?.code ?? x.data?.total));
  const cheios = [];
  for (let i = 0; i < 4; i++) cheios.push(await tutorRede.rpc('link_estadia_cheios', { p_codigo: L.codigo, p_tipo: 'hotel', p_de: L.dia(1), p_ate: L.dia(10) }));
  T.ok('link_estadia_cheios: 3 respondem, a 4ª é 429', cheios.slice(0, 3).every((x) => !x.error && Array.isArray(x.data)) && cheios[3].error?.code === 'PT429', cheios.map((x) => x.error?.code ?? 'ok'));
  T.ok('o freio guarda só o hash da rede, nunca o IP', B.num(`select count(*) from freios_rede where chave like '%${visitante}%'`) === 0);
  T.ok('a tabela do freio não é lida pela API', ((await dono.from('freios_rede').select('chave')).data ?? []).length === 0);

  // ---------------------------------------------------------------- 6
  T.secao('fotos dos pets: bucket privado');
  T.ok('o bucket pets não é público', B.sql(`select public from storage.buckets where id = 'pets'`) === 'f');
  const foto = `${P}/${B.uuid()}.jpg`;
  B.must(await dono.storage.from('pets').upload(foto, JPG, { contentType: 'image/jpeg' }), 'foto do Thor');
  B.must(await dono.from('pets').update({ foto }).eq('id', L.pets.Thor).select('id'), 'foto no cadastro');
  const publica = await fetch(`${B.SUPABASE_URL}/storage/v1/object/public/pets/${foto}`);
  T.ok('o endereço público da foto não abre mais', publica.status >= 400, publica.status);
  void publica.body?.cancel();
  const assinada = B.must(await dono.storage.from('pets').createSignedUrl(foto, 60), 'assinar');
  const baixada = await fetch(assinada.signedUrl);
  T.ok('a equipe vê a foto pelo endereço assinado', baixada.status === 200 && (baixada.headers.get('content-type') ?? '').startsWith('image/'), baixada.status);
  void baixada.body?.cancel();
  T.ok('anônimo não assina a foto do pet', !!(await anon.storage.from('pets').createSignedUrl(foto, 60)).error);
  T.ok('outro pet shop não assina a foto do pet', !!(await O.sb.dono.storage.from('pets').createSignedUrl(foto, 60)).error);
  T.ok('quem só tem o Estoque não manda foto de pet', !!(await estoque.storage.from('pets').upload(`${P}/${B.uuid()}.jpg`, JPG, { contentType: 'image/jpeg' })).error);
  const daRecepcao = `${P}/${B.uuid()}.jpg`;
  T.passa('a recepção (Clientes, Agenda, Caixa) manda', await caixa.storage.from('pets').upload(daRecepcao, JPG, { contentType: 'image/jpeg' }));
  const apagou = await estoque.storage.from('pets').remove([daRecepcao]);
  T.ok('quem só tem o Estoque não apaga', (apagou.data ?? []).length === 0 && B.num(`select count(*) from storage.objects where bucket_id = 'pets' and name = ${B.q(daRecepcao)}`) === 1, apagou);
  T.ok('outro pet shop não apaga', ((await O.sb.dono.storage.from('pets').remove([daRecepcao])).data ?? []).length === 0 && B.num(`select count(*) from storage.objects where bucket_id = 'pets' and name = ${B.q(daRecepcao)}`) === 1);
  T.ok('a recepção apaga a foto que mandou', ((await caixa.storage.from('pets').remove([daRecepcao])).data ?? []).length === 1);
  // a logo: qualquer um, pela rota do site
  const logo = `${P}/logo-${B.uuid()}.webp`;
  B.must(await dono.storage.from('pets').upload(logo, JPG, { contentType: 'image/webp' }), 'logo');
  B.must(await dono.from('petshops').update({ logo }).eq('id', P).select('id'), 'logo no pet shop');
  const rl = await fetch(`${B.BASE_URL}/gestao/marca/${logo}`);
  T.ok('a logo abre pela rota /gestao/marca (sem login)', rl.status === 200 && (rl.headers.get('content-type') ?? '').startsWith('image/'), rl.status);
  void rl.body?.cancel();
  const rf = await fetch(`${B.BASE_URL}/gestao/marca/${foto}`);
  T.ok('a rota da logo não entrega a foto de um pet (404)', rf.status === 404, rf.status);
  void rf.body?.cancel();
  T.ok('anônimo assina a logo (e só a logo)', !(await anon.storage.from('pets').createSignedUrl(logo, 60)).error);
  const bolHtml = await (await fetch(`${B.BASE_URL}/gestao/boletim/${bol.token}`)).text();
  T.ok('a página do boletim mostra a logo pela rota do site', bolHtml.includes(`/gestao/marca/${logo}`) && !bolHtml.includes('/object/public/pets'));
  // a página do tutor
  B.must(await dono.rpc('petshop_salvar_opcoes', { p: P, p_mudancas: { 'casa.tutor': { ativo: true, dias_fotos: 90 } } }), 'liga a página do tutor');
  const tokenAna = B.must(await dono.rpc('tutor_link', { p_cliente: L.tutores.Ana }), 'link da Ana');
  const tokenBeto = B.must(await dono.rpc('tutor_link', { p_cliente: L.tutores.Beto }), 'link do Beto');
  const pag = await (await fetch(`${B.BASE_URL}/gestao/tutor/${tokenAna}`)).text();
  T.ok('a página do tutor mostra a foto do pet pela rota do servidor', pag.includes(`/gestao/tutor/${tokenAna}/pet/${L.pets.Thor}`) && !pag.includes('/object/public/pets'));
  const rt = await fetch(`${B.BASE_URL}/gestao/tutor/${tokenAna}/pet/${L.pets.Thor}`);
  T.ok('… a foto do Thor abre para a Ana', rt.status === 200 && (rt.headers.get('content-type') ?? '').startsWith('image/'), rt.status);
  void rt.body?.cancel();
  const rb = await fetch(`${B.BASE_URL}/gestao/tutor/${tokenBeto}/pet/${L.pets.Thor}`);
  T.ok('… o link do Beto não abre a foto do Thor (404)', rb.status === 404, rb.status);
  void rb.body?.cancel();
  T.ok('o código do tutor no cabeçalho não assina foto de pet de outro tutor', !!(await clienteCom({ 'x-tutor-token': tokenBeto }).storage.from('pets').createSignedUrl(foto, 60)).error);
  T.ok('… e o da Ana assina a do Thor (regra pets_tutor_ler)', !(await clienteCom({ 'x-tutor-token': tokenAna }).storage.from('pets').createSignedUrl(foto, 60)).error);

  // ---------------------------------------------------------------- 7
  T.secao('chaves compostas');
  const lanc = (loja) => B.sql(`insert into lancamentos (petshop_id, tipo, valor, descricao, data) values ('${loja}', 'saida', 10, 'teste chave', current_date) returning id`).split('\n')[0];
  const la = lanc(P), lo = lanc(O.P);
  const fkFalha = (q) => { try { B.sql(q); return false; } catch (e) { return /violates foreign key|viola a restrição de chave estrangeira/i.test(String(e.stderr || e.message)); } };
  for (const col of ['conta_id', 'devolucao_de', 'multa_de']) {
    T.ok(`lancamentos.${col} de outro pet shop é recusado`, fkFalha(`update lancamentos set ${col} = '${lo}' where id = '${la}'`));
  }
  const la2 = lanc(P);
  B.sql(`update lancamentos set multa_de = '${la2}' where id = '${la}'`);
  T.ok('lancamentos.multa_de do mesmo pet shop continua valendo', B.sql(`select multa_de from lancamentos where id = '${la}'`) === la2);
  const estadia = B.sql(`insert into estadias (petshop_id, pet_id, tipo, status, entrada, saida_prevista) values ('${P}', '${L.pets.Thor}', 'creche', 'em_casa', now(), now() + interval '8 hours') returning id`).split('\n')[0];
  const petOutro = B.sql(`insert into pets (petshop_id, cliente_id, nome, especie) select '${O.P}', id, 'Bidu', 'cao' from clientes where petshop_id = '${O.P}' limit 1 returning id`).split('\n')[0];
  // (o gatilho diario_fotos_conferir já recusa antes; aqui sem ele, para ver a chave sozinha)
  T.ok('diario_fotos.pet_id de outro pet shop é recusado pela chave', fkFalha(`begin; alter table diario_fotos disable trigger diario_fotos_conferir; insert into diario_fotos (petshop_id, estadia_id, pet_id, dia, caminho) values ('${P}', '${estadia}', '${petOutro}', current_date, '${P}/x-${B.uuid()}.jpg'); rollback;`));
  T.ok('… do mesmo pet shop entra', !fkFalha(`insert into diario_fotos (petshop_id, estadia_id, pet_id, dia, caminho) values ('${P}', '${estadia}', '${L.pets.Thor}', current_date, '${P}/x-${B.uuid()}.jpg')`));
  T.ok('as quatro chaves estão validadas no banco', B.num(`select count(*) from pg_constraint where conname in ('lancamentos_conta_id_fkey', 'lancamentos_devolucao_de_fkey', 'lancamentos_multa_de_fkey', 'diario_fotos_pet_id_fkey') and convalidated and array_length(conkey, 1) = 2`) === 4);
}))();
