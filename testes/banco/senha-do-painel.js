// Senha do painel do administrador (migração 20261247): no lugar do segundo fator, uma senha só do painel.
//   - admin sem senha registrada não abre nada: sou_admin() false, todas as admin_* recusam, a rota da cópia responde 403;
//   - registrar ou trocar a senha só com a chegada recente pelo link do e-mail (lido no Mailpit do Supabase local): recusa
//     com a sessão de senha e com o link de mais de 15 minutos; regras mínimas (10 a 200, diferente do e-mail);
//   - senha errada conta; 5 seguidas travam por 15 minutos (a senha certa também espera); a trava passa; a senha certa zera;
//   - senha certa abre o painel só nesta sessão de login: outro login do mesmo admin começa fechado; "Fechar o painel";
//     sair da conta fecha na hora; a sessão do painel vence;
//   - trocar a senha fecha as sessões do painel abertas e a senha antiga não vale mais;
//   - e-mail da conta trocado depois: a troca por e-mail é recusada até o painel abrir uma vez com a senha atual;
//   - quem não é admin recebe as mesmas respostas (e gasta o mesmo tempo) e não registra senha;
//   - o hash nunca sai pela API (nem com a chave de serviço, nem na cópia completa).
const B = require('../lib/base');
const { criarLoja, SENHA } = require('../lib/semente');
const T = require('../lib/teste')('senha-do-painel');
const { createClient } = require(require('path').join(B.RAIZ, 'node_modules', '@supabase', 'supabase-js'));

const jwt = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString());
const token = async (sb) => (await sb.auth.getSession()).data.session.access_token;
const abrir = async (sb, senha) => B.must(await sb.rpc('admin_painel_abrir', { p_senha: senha }), 'admin_painel_abrir');
const situacao = async (sb) => B.must(await sb.rpc('admin_situacao'), 'admin_situacao');
const copia = async (sb) => { const r = await fetch(`${B.BASE_URL}/api/gestao/admin/copia`, { headers: { authorization: `Bearer ${await token(sb)}` } }); void r.body?.cancel(); return r.status; };
/** Um valor qualquer para cada parâmetro obrigatório de uma função (pelo tipo), para chamar todas as admin_*. */
function argumentos(assinatura) {
  const args = {};
  for (const parte of assinatura.split(',').map((x) => x.trim()).filter((x) => x && !/ DEFAULT /i.test(x))) {
    const [nome, ...tipo] = parte.split(' ');
    const t = tipo.join(' ');
    args[nome] = /uuid/.test(t) ? B.uuid() : /int/.test(t) ? 1 : /bool/.test(t) ? false : /timestamp/.test(t) ? new Date().toISOString() : /status_assinatura/.test(t) ? 'ativa' : 'x';
  }
  return args;
}
/** Faz o link do e-mail parecer aberto há `min` minutos: a hora da chegada fica na sessão e vai para o token renovado. */
async function envelhecerChegada(sb, min) {
  const sid = jwt(await token(sb)).session_id;
  B.sql(`update auth.mfa_amr_claims set created_at = now() - interval '${min} minutes', updated_at = now() - interval '${min} minutes' where session_id = '${sid}' and authentication_method <> 'token_refresh'`);
  B.must(await sb.auth.refreshSession(), 'renovar o token');
}

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Senha painel', equipe: false });
  const { dono } = L.sb;
  const anon = B.cliente();
  const P = L.P;
  const SENHA_A = `Painel-A-${L.suf}-xyz`, SENHA_B = `Painel-B-${L.suf}-xyz`;

  const adm = B.cliente();
  const emailAdm = `t-${L.suf}.admin@teste-auto.local`;
  B.must(await adm.auth.signUp({ email: emailAdm, password: SENHA, options: B.dadosDoCadastro() }), 'cadastro do admin');
  const uid = (await adm.auth.getUser()).data.user.id;
  B.sql(`insert into admins (user_id) values ('${uid}') on conflict do nothing`);
  T.depois(() => B.sql(`delete from admins where user_id='${uid}'; delete from auth.users where id='${uid}'`));
  const uidDono = (await dono.auth.getUser()).data.user.id;
  T.depois(() => B.sql(`delete from admin_senha_tentativas where user_id='${uidDono}'`));

  // ---------------------------------------------------------------- 1
  T.secao('admin sem senha registrada não abre nada');
  let s = await situacao(adm);
  T.ok('admin_situacao: é admin, sem senha, painel fechado, não pode registrar agora', s.admin === true && s.tem_senha === false && s.aberto === false && s.pode_definir === false && s.bloqueado_ate === null, s);
  T.ok('sou_admin() é false', (await adm.rpc('sou_admin')).data === false);
  const funcoes = B.sql(`select proname || '#' || pg_get_function_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and proname like 'admin\\_%' and proname not in ('admin_situacao', 'admin_painel_abrir', 'admin_painel_fechar', 'admin_senha_definir')
      and has_function_privilege('authenticated', p.oid, 'execute') order by 1`).split('\n').map((l) => { const [f, a] = l.split('#'); return { f, args: argumentos(a) }; });
  T.ok('há pelo menos 35 funções admin_* para conferir', funcoes.length >= 35, funcoes.length);
  const passaram = [];
  for (const { f, args } of funcoes) { const r = await adm.rpc(f, args); if (!r.error) passaram.push(f); }
  T.ok(`todas as ${funcoes.length} admin_* recusam o admin sem o painel aberto`, passaram.length === 0, passaram);
  T.ok('toda admin_* de fora pergunta sou_admin()', B.sql(`select coalesce(string_agg(proname, ','), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and proname like 'admin\\_%' and proname not in ('admin_situacao', 'admin_painel_abrir', 'admin_painel_fechar', 'admin_senha_definir')
      and has_function_privilege('authenticated', p.oid, 'execute') and prosrc not ilike '%sou_admin()%'`) === '');
  T.ok('nenhuma função fora do painel usa sou_admin() (só admin_* e as regras da Escola)',
    B.sql(`select coalesce(string_agg(proname, ','), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and prosrc ilike '%sou_admin()%' and proname not like 'admin\\_%' and proname <> 'sou_admin'`) === '');
  T.ok('a sessão forte (aal2) não existe mais no banco', B.num(`select count(*) from pg_proc where proname = 'sessao_forte'`) === 0
    && B.num(`select count(*) from pg_proc where prosrc ilike '%aal2%' and pronamespace = 'public'::regnamespace`) === 0);
  T.ok('… e a loja não mudou (admin_atualizar recusado)', B.sql(`select status from petshops where id='${P}'`) === 'teste');
  T.ok('rota da cópia completa: 403', (await copia(adm)) === 403);
  let r = await abrir(adm, SENHA_A);
  T.ok('sem senha registrada, nenhuma senha abre (resposta de senha errada)', r.ok === false && r.motivo === 'senha' && r.restam === 4, r);
  T.ok('escola: o admin com o painel fechado não cria material', !!(await adm.from('escola_materiais').insert({ slug: `x-${L.suf}`, arquivo: `x-${L.suf}.pdf` }).select('slug')).error);

  // ---------------------------------------------------------------- 2
  T.secao('registrar a senha só chegando pelo e-mail');
  r = B.must(await adm.rpc('admin_senha_definir', { p_nova: SENHA_A }), 'definir');
  T.ok('com a sessão da senha da conta: recusado (motivo email)', r.ok === false && r.motivo === 'email', r);
  T.ok('… e nada foi gravado', B.num(`select count(*) from admin_senhas where user_id='${uid}'`) === 0);
  const amrSenha = jwt(await token(adm)).amr;
  T.ok('o token da senha da conta traz o método password', amrSenha.length === 1 && amrSenha[0].method === 'password', amrSenha);
  const ida = await B.chegarPeloEmail(adm, emailAdm);
  T.ok('o link do e-mail pede a volta para /gestao/admin deste endereço', ida.link.includes(`redirect_to=${B.BASE_URL}/gestao/admin`) && /#access_token=/.test(ida.destino), ida.link);
  const amr = jwt(await token(adm)).amr;
  T.ok('o token de quem chegou pelo link traz o método otp e a hora de agora', amr.some((a) => a.method === 'otp' && Math.abs(a.timestamp - Date.now() / 1000) < 120), amr);
  s = await situacao(adm);
  T.ok('admin_situacao: pode registrar a senha agora; o painel continua fechado', s.pode_definir === true && s.aberto === false && s.tem_senha === false, s);
  T.ok('chegar pelo e-mail sozinho não abre o painel', (await adm.rpc('sou_admin')).data === false && !!(await adm.rpc('admin_painel')).error);
  for (const [nova, motivo] of [['curta-123', 'curta'], [' '.repeat(12), 'curta'], ['x'.repeat(201), 'longa'], [emailAdm, 'igual_email'], [` ${emailAdm.toUpperCase()} `, 'igual_email']]) {
    r = B.must(await adm.rpc('admin_senha_definir', { p_nova: nova }), 'definir');
    T.ok(`senha recusada: ${motivo} (${nova.length} letras)`, r.ok === false && r.motivo === motivo, r);
  }
  T.ok('nada gravado com as senhas recusadas', B.num(`select count(*) from admin_senhas where user_id='${uid}'`) === 0);
  // link velho: a chegada passou de 15 minutos
  await envelhecerChegada(adm, 16);
  T.ok('token renovado guarda a hora da chegada (não vira "agora")', jwt(await token(adm)).amr.some((a) => a.method === 'otp' && a.timestamp < Date.now() / 1000 - 15 * 60), jwt(await token(adm)).amr);
  r = B.must(await adm.rpc('admin_senha_definir', { p_nova: SENHA_A }), 'definir');
  T.ok('chegada de mais de 15 minutos: recusado (motivo email)', r.ok === false && r.motivo === 'email' && (await situacao(adm)).pode_definir === false, r);
  await envelhecerChegada(adm, 14);
  r = B.must(await adm.rpc('admin_senha_definir', { p_nova: SENHA_A }), 'definir');
  T.ok('chegada de 14 minutos: a senha é registrada', r.ok === true && !!r.vale_ate, r);
  const hash = B.sql(`select hash from admin_senhas where user_id='${uid}'`);
  T.ok('no banco fica só o hash bcrypt com custo 12 (nunca a senha)', /^\$2[aby]\$12\$[./A-Za-z0-9]{53}$/.test(hash) && !hash.includes(SENHA_A), hash.slice(0, 7));
  T.ok('registrar a senha abre o painel nesta sessão', (await adm.rpc('sou_admin')).data === true && (await situacao(adm)).aberto === true);
  T.passa('admin_painel responde', await adm.rpc('admin_painel'));
  T.ok('a validade é de 12 horas', Math.abs(new Date(r.vale_ate).getTime() - Date.now() - 12 * 3600e3) < 5 * 60e3, r.vale_ate);

  // ---------------------------------------------------------------- 3
  T.secao('abrir com a senha, por sessão de login');
  const adm2 = B.cliente();
  B.must(await adm2.auth.signInWithPassword({ email: emailAdm, password: SENHA }), 'outro login');
  T.ok('outro login do mesmo admin tem outro session_id', jwt(await token(adm2)).session_id !== jwt(await token(adm)).session_id);
  T.ok('… e começa com o painel fechado', (await adm2.rpc('sou_admin')).data === false && !!(await adm2.rpc('admin_painel')).error && (await copia(adm2)) === 403);
  s = await situacao(adm2);
  T.ok('admin_situacao no outro login: tem senha, fechado, não pode trocar', s.tem_senha === true && s.aberto === false && s.pode_definir === false, s);
  r = await abrir(adm2, SENHA_A + '!');
  T.ok('senha errada: não abre e diz quantas tentativas restam', r.ok === false && r.motivo === 'senha' && r.restam === 4 && (await adm2.rpc('sou_admin')).data === false, r);
  for (const errada of [null, '', 'x'.repeat(500), SENHA_A.toLowerCase() === SENHA_A ? SENHA_A.toUpperCase() : SENHA_A.toLowerCase()]) {
    B.sql(`delete from admin_senha_tentativas where user_id='${uid}'`);
    r = await abrir(adm2, errada);
    T.ok(`não abre com ${errada === null ? 'nada' : errada === '' ? 'senha vazia' : errada.length > 100 ? 'senha de 500 letras' : 'a senha com outra caixa'}`, r.ok === false && r.motivo === 'senha', r);
  }
  B.sql(`delete from admin_senha_tentativas where user_id='${uid}'`);
  r = await abrir(adm2, SENHA_A);
  T.ok('senha certa: abre', r.ok === true && (await adm2.rpc('sou_admin')).data === true, r);
  T.passa('admin_painel e admin_servidor_estado respondem', await adm2.rpc('admin_servidor_estado'), !(await adm2.rpc('admin_painel')).error);
  T.ok('rota da cópia completa: passa da conferência (200, ou 503 sem a chave de serviço)', [200, 503].includes(await copia(adm2)));
  T.ok('a sessão do painel fica presa ao session_id e ao usuário do token', B.sql(`select sessao_id || '|' || user_id from admin_painel_sessoes where sessao_id='${jwt(await token(adm2)).session_id}'`) === `${jwt(await token(adm2)).session_id}|${uid}`);
  // nada que o cliente mande troca a sessão: o parâmetro a mais é recusado e a linha de outro não vale para mim
  T.ok('a função não aceita sessão vinda do pedido', !!(await adm2.rpc('admin_painel_abrir', { p_senha: SENHA_A, p_sessao: B.uuid() })).error);
  const sidDono = jwt(await token(dono)).session_id;
  B.sql(`insert into admin_painel_sessoes (sessao_id, user_id, vale_ate) values ('${sidDono}', '${uid}', now() + interval '1 hour')`);
  T.ok('uma linha com a sessão de outro usuário não abre o painel para ele', (await dono.rpc('sou_admin')).data === false && !!(await dono.rpc('admin_painel')).error);
  B.sql(`delete from admin_painel_sessoes where sessao_id='${sidDono}'`);
  // vencimento
  B.sql(`update admin_painel_sessoes set vale_ate = now() - interval '1 second' where sessao_id='${jwt(await token(adm2)).session_id}'`);
  T.ok('a sessão do painel vencida não vale', (await adm2.rpc('sou_admin')).data === false && !!(await adm2.rpc('admin_painel')).error && (await situacao(adm2)).aberto === false);
  r = await abrir(adm2, SENHA_A);
  T.ok('… e abre de novo com a senha', r.ok === true && (await adm2.rpc('sou_admin')).data === true);

  // ---------------------------------------------------------------- 4
  T.secao('fechar o painel e sair da conta');
  T.ok('"Fechar o painel" responde que estava aberto', B.must(await adm2.rpc('admin_painel_fechar'), 'fechar') === true);
  T.ok('fechado: sou_admin() false e as admin_* recusam, sem sair da conta', (await adm2.rpc('sou_admin')).data === false && !!(await adm2.rpc('admin_painel')).error
    && !(await adm2.rpc('entrar')).error && (await situacao(adm2)).aberto === false);
  T.ok('fechar de novo: não estava aberto', B.must(await adm2.rpc('admin_painel_fechar'), 'fechar') === false);
  T.ok('a outra sessão do admin continua aberta (fechar vale só para esta)', (await adm.rpc('sou_admin')).data === true);
  r = await abrir(adm2, SENHA_A);
  const tokenAntes = await token(adm2);
  const depoisDeSair = createClient(B.SUPABASE_URL, B.SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${tokenAntes}` } } });
  T.ok('aberto de novo antes de sair', r.ok === true && (await depoisDeSair.rpc('sou_admin')).data === true);
  B.must(await adm2.auth.signOut({ scope: 'local' }), 'sair');
  T.ok('saiu da conta: o token antigo (ainda no prazo) não abre mais o painel', (await depoisDeSair.rpc('sou_admin')).data === false && !!(await depoisDeSair.rpc('admin_painel')).error);
  r = B.must(await depoisDeSair.rpc('admin_painel_abrir', { p_senha: SENHA_A }), 'abrir depois de sair');
  T.ok('… nem com a senha certa (a sessão de login acabou)', r.ok === false && r.motivo === 'sessao', r);

  // ---------------------------------------------------------------- 5
  T.secao('freio: 5 senhas erradas travam por 15 minutos');
  const adm3 = B.cliente();
  B.must(await adm3.auth.signInWithPassword({ email: emailAdm, password: SENHA }), 'login');
  B.sql(`delete from admin_senha_tentativas where user_id='${uid}'`);
  const restam = [];
  for (let k = 0; k < 4; k++) restam.push((await abrir(adm3, 'errada-' + k)).restam);
  T.ok('quatro erradas: 4, 3, 2, 1 tentativas', restam.join() === '4,3,2,1', restam);
  r = await abrir(adm3, SENHA_A);
  T.ok('a certa na quinta abre e zera a conta', r.ok === true && B.num(`select erros from admin_senha_tentativas where user_id='${uid}'`) === 0, r);
  B.must(await adm3.rpc('admin_painel_fechar'), 'fechar');
  for (let k = 0; k < 4; k++) r = await abrir(adm3, 'errada-' + k);
  T.ok('depois de zerar, quatro erradas de novo ainda não travam', r.ok === false && r.motivo === 'senha', r);
  r = await abrir(adm3, 'errada-5');
  const minutos = (new Date(r.bloqueado_ate).getTime() - Date.now()) / 60000;
  T.ok('a quinta errada trava por 15 minutos', r.ok === false && r.motivo === 'bloqueado' && minutos > 14 && minutos < 15.5, r);
  r = await abrir(adm3, SENHA_A);
  T.ok('travado: nem a senha certa abre', r.ok === false && r.motivo === 'bloqueado' && (await adm3.rpc('sou_admin')).data === false, r);
  T.ok('admin_situacao mostra até quando', !!(await situacao(adm3)).bloqueado_ate);
  T.ok('a trava é do usuário: vale em outro login dele também', (await abrir(adm, SENHA_A)).motivo === 'bloqueado');
  T.ok('… e não fecha o painel que já estava aberto', (await adm.rpc('sou_admin')).data === true);
  // pedidos ao mesmo tempo não passam do limite juntos
  B.sql(`update admin_senha_tentativas set bloqueado_ate = null, erros = 0 where user_id='${uid}'`);
  const juntos = await Promise.all(Array.from({ length: 8 }, (_, k) => abrir(adm3, 'junto-' + k)));
  T.ok('8 erradas ao mesmo tempo: 4 contadas e o resto travado', juntos.filter((x) => x.motivo === 'senha').length === 4 && juntos.filter((x) => x.motivo === 'bloqueado').length === 4, juntos.map((x) => x.motivo));
  // a trava passa
  B.sql(`update admin_senha_tentativas set bloqueado_ate = now() - interval '1 second' where user_id='${uid}'`);
  T.ok('passados os 15 minutos, admin_situacao não mostra mais a trava', (await situacao(adm3)).bloqueado_ate === null);
  r = await abrir(adm3, SENHA_A);
  T.ok('… e a senha certa abre', r.ok === true && (await adm3.rpc('sou_admin')).data === true, r);

  // ---------------------------------------------------------------- 6
  T.secao('trocar a senha (só pelo e-mail) fecha as sessões do painel');
  T.ok('antes: duas sessões do painel abertas', B.num(`select count(*) from admin_painel_sessoes where user_id='${uid}' and vale_ate > now()`) === 2);
  r = B.must(await adm3.rpc('admin_senha_definir', { p_nova: SENHA_B }), 'definir');
  T.ok('com o painel aberto mas sem chegar pelo e-mail: não troca', r.ok === false && r.motivo === 'email', r);
  B.sql(`update admin_senha_tentativas set erros = 3 where user_id='${uid}'`);
  const adm4 = B.cliente();
  B.must(await adm4.auth.signInWithPassword({ email: emailAdm, password: SENHA }), 'login');
  await B.chegarPeloEmail(adm4, emailAdm);
  r = B.must(await adm4.rpc('admin_senha_definir', { p_nova: SENHA_B }), 'definir');
  T.ok('chegando pelo e-mail: troca', r.ok === true, r);
  T.ok('as sessões do painel de antes fecharam', (await adm.rpc('sou_admin')).data === false && (await adm3.rpc('sou_admin')).data === false && !!(await adm3.rpc('admin_painel')).error);
  T.ok('só a sessão que trocou fica aberta', (await adm4.rpc('sou_admin')).data === true && B.num(`select count(*) from admin_painel_sessoes where user_id='${uid}'`) === 1);
  T.ok('a troca zera o freio', B.num(`select count(*) from admin_senha_tentativas where user_id='${uid}'`) === 0);
  r = await abrir(adm3, SENHA_A);
  T.ok('a senha antiga não vale mais', r.ok === false && r.motivo === 'senha', r);
  r = await abrir(adm3, SENHA_B);
  T.ok('a senha nova abre', r.ok === true, r);
  T.ok('o hash mudou', B.sql(`select hash from admin_senhas where user_id='${uid}'`) !== hash);

  // ---------------------------------------------------------------- 6b
  T.secao('e-mail da conta trocado: a troca da senha por e-mail espera a senha atual');
  T.ok('a senha fica ligada ao e-mail da conta', B.sql(`select email from admin_senhas where user_id='${uid}'`) === emailAdm);
  // quem só tem a senha da conta troca o e-mail da conta para um dele e pede o link
  const emailNovo = `t-${L.suf}.outro@teste-auto.local`;
  B.sql(`update auth.users set email = ${B.q(emailNovo)} where id = '${uid}'; update auth.identities set identity_data = identity_data || jsonb_build_object('email', ${B.q(emailNovo)}) where user_id = '${uid}'`);
  const adm5 = B.cliente();
  B.must(await adm5.auth.signInWithPassword({ email: emailNovo, password: SENHA }), 'login com o e-mail novo');
  await B.chegarPeloEmail(adm5, emailNovo);
  r = B.must(await adm5.rpc('admin_senha_definir', { p_nova: SENHA_A }), 'definir');
  T.ok('chegando pelo link do e-mail novo: não troca a senha (motivo email_trocado)', r.ok === false && r.motivo === 'email_trocado' && (await adm5.rpc('sou_admin')).data === false, r);
  T.ok('… e a senha de antes continua valendo', (await abrir(adm5, SENHA_A)).ok === false && B.sql(`select email from admin_senhas where user_id='${uid}'`) === emailAdm);
  r = await abrir(adm5, SENHA_B);
  T.ok('abrir o painel com a senha atual confirma o e-mail novo', r.ok === true && B.sql(`select email from admin_senhas where user_id='${uid}'`) === emailNovo, r);
  r = B.must(await adm5.rpc('admin_senha_definir', { p_nova: SENHA_A }), 'definir');
  T.ok('depois disso, a troca por e-mail volta a valer', r.ok === true, r);
  r = B.must(await adm5.rpc('admin_senha_definir', { p_nova: SENHA_B }), 'definir');
  T.ok('… (de volta à senha B para o resto do teste)', r.ok === true, r);
  await abrir(adm4, SENHA_B);
  await abrir(adm3, SENHA_B);

  // ---------------------------------------------------------------- 7
  T.secao('quem não é admin não aprende nada');
  s = await situacao(dono);
  T.ok('admin_situacao de quem não é admin: só admin = false', s.admin === false && s.tem_senha === false && s.aberto === false && s.pode_definir === false && s.bloqueado_ate === null, s);
  B.sql(`delete from admin_senha_tentativas where user_id in ('${uidDono}', '${uid}')`);
  B.must(await adm3.rpc('admin_painel_fechar'), 'fechar');
  const t0 = Date.now(); const rDono = await abrir(dono, SENHA_B); const tDono = Date.now() - t0;
  const t1 = Date.now(); const rAdm = await abrir(adm3, SENHA_B + '!'); const tAdm = Date.now() - t1;
  T.ok('a senha do admin na conta de outro não abre nada, com a mesma resposta de senha errada', JSON.stringify(rDono) === JSON.stringify(rAdm) && rDono.motivo === 'senha', [rDono, rAdm]);
  T.ok('… e gasta o mesmo tempo (o bcrypt roda para os dois)', tDono > tAdm * 0.5 && tDono < tAdm * 2 + 150, [tDono, tAdm]);
  for (let k = 0; k < 3; k++) await abrir(dono, 'x' + k);
  r = await abrir(dono, 'x');
  T.ok('quem não é admin também trava na quinta', r.ok === false && r.motivo === 'bloqueado' && !!r.bloqueado_ate, r);
  T.ok('… e continua sem acesso', (await dono.rpc('sou_admin')).data === false && !!(await dono.rpc('admin_painel')).error);
  await B.chegarPeloEmail(dono, L.emails.dono);
  r = B.must(await dono.rpc('admin_senha_definir', { p_nova: SENHA_B }), 'definir');
  T.ok('quem não é admin, mesmo chegando pelo e-mail, não registra senha', r.ok === false && r.motivo === 'email' && B.num(`select count(*) from admin_senhas where user_id='${uidDono}'`) === 0, r);
  T.ok('anônimo não chama nenhuma das quatro', !!(await anon.rpc('admin_situacao')).error && !!(await anon.rpc('admin_painel_abrir', { p_senha: 'x' })).error
    && !!(await anon.rpc('admin_painel_fechar')).error && !!(await anon.rpc('admin_senha_definir', { p_nova: SENHA_B })).error);
  for (const f of ['painel_sessao', 'painel_aberto', 'painel_chegou_por_email']) T.ok(`${f} não é chamada pela API`, !!(await adm4.rpc(f)).error);
  T.ok('painel_senha_hash e painel_senha_prep não são chamadas pela API', !!(await adm4.rpc('painel_senha_hash', { p_senha: 'x' })).error && !!(await adm4.rpc('painel_senha_prep', { p_senha: 'x' })).error);

  // ---------------------------------------------------------------- 8
  T.secao('o hash nunca sai pela API');
  const clientes = [['anônimo', anon], ['dono comum', dono], ['admin com o painel aberto', adm4]];
  for (const [nome, sb] of clientes) {
    for (const tabela of ['admin_senhas', 'admin_painel_sessoes', 'admin_senha_tentativas']) {
      const l = await sb.from(tabela).select('*');
      T.ok(`${nome} não lê ${tabela}`, !!l.error && !(l.data ?? []).length, l.error?.message ?? l.data);
    }
    T.ok(`${nome} não grava em admin_senhas`, !!(await sb.from('admin_senhas').upsert({ user_id: uid, hash: '$2a$12$' + 'x'.repeat(53) })).error
      && !!(await sb.from('admin_painel_sessoes').insert({ sessao_id: B.uuid(), user_id: uid, vale_ate: new Date(Date.now() + 3600e3).toISOString() })).error);
  }
  T.ok('as três tabelas com RLS ligada e sem nenhuma regra', B.num(`select count(*) from pg_class where relname in ('admin_senhas', 'admin_painel_sessoes', 'admin_senha_tentativas') and relrowsecurity`) === 3
    && B.num(`select count(*) from pg_policies where tablename in ('admin_senhas', 'admin_painel_sessoes', 'admin_senha_tentativas')`) === 0);
  const respostas = JSON.stringify([await situacao(adm4), await abrir(adm4, SENHA_B), await abrir(adm4, 'errada'), B.must(await adm4.rpc('admin_painel'), 'painel').length]);
  T.ok('nenhuma resposta das funções traz o hash nem a senha', !respostas.includes('$2') && !respostas.includes(SENHA_B), respostas.slice(0, 200));
  // a chave de serviço (o papel service_role, pelo SQL: o .env.local dos testes não tem a chave)
  for (const tabela of ['admin_senhas', 'admin_painel_sessoes', 'admin_senha_tentativas']) {
    let recusa = '';
    try { B.sql(`set role service_role; select count(*) from ${tabela}`); } catch (e) { recusa = String(e.stderr ?? e.message); }
    T.ok(`a chave de serviço não lê ${tabela}`, /permission denied/.test(recusa), recusa.slice(0, 120));
  }
  const lista = B.sql(`select string_agg(x ->> 'tabela', ',') from jsonb_array_elements(gestao_copia_tabelas()) x`).split(',');
  T.ok('a cópia completa não leva as tabelas da senha do painel (e segue com as outras)', lista.length > 50
    && !lista.some((x) => ['admin_senhas', 'admin_painel_sessoes', 'admin_senha_tentativas'].includes(x)) && lista.includes('admins') && lista.includes('petshops'), lista.length);
  T.ok('… e a chave de serviço lê todas as tabelas que a cópia lista', B.num(`select count(*) from jsonb_array_elements(gestao_copia_tabelas()) x where not has_table_privilege('service_role', ('public.' || quote_ident(x ->> 'tabela'))::regclass, 'select')`) === 0);
  T.ok('todas as funções novas com search_path vazio', B.num(`select count(*) from pg_proc p where pronamespace = 'public'::regnamespace
    and proname in ('painel_sessao', 'painel_aberto', 'painel_chegou_por_email', 'painel_senha_prep', 'painel_senha_hash', 'sou_admin', 'admin_situacao', 'admin_painel_abrir', 'admin_painel_fechar', 'admin_senha_definir')
    and exists (select 1 from unnest(proconfig) c where c = 'search_path=""')`) === 10);
  T.ok('nenhuma função nova é chamada por anônimo', B.num(`select count(*) from pg_proc p where pronamespace = 'public'::regnamespace
    and (proname like 'painel\\_%' or proname in ('admin_situacao', 'admin_painel_abrir', 'admin_painel_fechar', 'admin_senha_definir'))
    and has_function_privilege('anon', p.oid, 'execute')`) === 0);

  // ---------------------------------------------------------------- 9
  T.secao('sair de admins fecha tudo');
  B.sql(`delete from admins where user_id='${uid}'`);
  T.ok('tirado de admins: sem senha, sem sessão do painel, sem acesso', B.num(`select (select count(*) from admin_senhas where user_id='${uid}') + (select count(*) from admin_painel_sessoes where user_id='${uid}')`) === 0
    && (await adm4.rpc('sou_admin')).data === false && (await situacao(adm4)).admin === false);
}))();
