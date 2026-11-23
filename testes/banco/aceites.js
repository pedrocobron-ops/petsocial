// Aceite dos Termos de uso e da Política de privacidade (migração 20261197): o cadastro com `aceite` nos dados grava os dois
// documentos na versão em vigor (gatilho no auth.users), sem `aceite` não grava nada; cada um lê só os próprios aceites;
// ninguém grava, muda ou apaga direto na tabela; `aceitar_documentos` grava a versão nova uma vez só (com IP e navegador),
// recusa versão estranha e o anônimo; `admin_aceites` só para o admin. Login apagado: o aceite fica, com o e-mail.
const B = require('../lib/base');
const { criarLoja, SENHA } = require('../lib/semente');
const { lib } = require('../lib/app');
const T = require('../lib/teste')('aceites');

(async () => T.rodar(async () => {
  const Doc = lib('documentos');
  const v = Doc.aceiteDoCadastro();
  const L = await criarLoja(T, { nome: 'Aceites', equipe: false, dados: false });
  const dono = L.sb.dono;
  const uidDono = (await dono.auth.getUser()).data.user.id;

  T.secao('cadastro');
  const linhas = (uid) => B.sql(`select coalesce(string_agg(documento || ':' || versao || ':' || origem, ',' order by documento), '') from aceites where user_id='${uid}'`);
  T.ok('cadastro pela semente (com aceite) gravou os dois documentos na versão em vigor', linhas(uidDono) === `privacidade:${v.privacidade}:cadastro,termos:${v.termos}:cadastro`, linhas(uidDono));
  T.ok('o e-mail da época fica no aceite', B.sql(`select count(*) from aceites where user_id='${uidDono}' and email='${L.emails.dono}'`) === '2');

  const semEmail = `t-${L.suf}.sem@teste-auto.local`;
  const sem = B.cliente();
  B.must(await sem.auth.signUp({ email: semEmail, password: SENHA }), 'cadastro sem aceite');
  if (!(await sem.auth.getSession()).data.session) B.must(await sem.auth.signInWithPassword({ email: semEmail, password: SENHA }), 'login sem aceite');
  const uidSem = (await sem.auth.getUser()).data.user.id;
  T.ok('cadastro sem aceite nos dados (outro app do mesmo projeto) não grava nada', linhas(uidSem) === '');
  const lixoEmail = `t-${L.suf}.lixo@teste-auto.local`;
  const lixo = B.cliente();
  B.must(await lixo.auth.signUp({ email: lixoEmail, password: SENHA, options: { data: { aceite: { termos: "'; drop table aceites; --", privacidade: 5 } } } }), 'cadastro com aceite estranho');
  T.ok('aceite estranho no cadastro não grava e não derruba o cadastro', B.sql(`select count(*) from aceites a join auth.users u on u.id = a.user_id where u.email='${lixoEmail}'`) === '0');

  T.secao('quem lê e quem grava');
  const meus = await sem.from('aceites').select('documento, versao');
  T.ok('quem não aceitou lê uma lista vazia (e o app mostra a tela de aceite)', !meus.error && meus.data.length === 0 && Doc.pendentes(meus.data).length === 2, meus.error?.message);
  const doDono = await dono.from('aceites').select('user_id, documento, versao');
  T.ok('o dono lê só os próprios aceites', !doDono.error && doDono.data.length === 2 && doDono.data.every((a) => a.user_id === uidDono) && Doc.pendentes(doDono.data).length === 0);
  T.ok('outro login não lê os aceites do dono', ((await sem.from('aceites').select('id').eq('user_id', uidDono)).data ?? []).length === 0);
  T.ok('anônimo não lê', ((await B.cliente().from('aceites').select('id')).data ?? []).length === 0);
  T.recusa('gravar direto na tabela é recusado', await sem.from('aceites').insert({ user_id: uidSem, documento: 'termos', versao: v.termos, origem: 'cadastro' }));
  await dono.from('aceites').update({ versao: '0.1' }).eq('user_id', uidDono);
  await dono.from('aceites').delete().eq('user_id', uidDono);
  T.ok('mudar ou apagar direto não mexe em nada', linhas(uidDono) === `privacidade:${v.privacidade}:cadastro,termos:${v.termos}:cadastro`);

  T.secao('aceitar_documentos');
  T.recusa('anônimo recusado', await B.cliente().rpc('aceitar_documentos', { p_termos: v.termos, p_privacidade: v.privacidade }));
  T.recusa('versão estranha recusada', await sem.rpc('aceitar_documentos', { p_termos: 'x y', p_privacidade: v.privacidade }), /Versão inválida/);
  const [r1, r2] = await Promise.all([1, 2].map(() => sem.rpc('aceitar_documentos', { p_termos: v.termos, p_privacidade: v.privacidade })));
  T.passa('aceitar a versão em vigor (dois toques ao mesmo tempo)', r1, Array.isArray(r1.data) && r1.data.length === 2);
  T.passa('o segundo toque também responde bem', r2, Array.isArray(r2.data) && r2.data.length === 2);
  T.ok('gravou uma vez cada documento, como versão nova', linhas(uidSem) === `privacidade:${v.privacidade}:reaceite,termos:${v.termos}:reaceite`, linhas(uidSem));
  T.ok('guardou o navegador do pedido', B.num(`select count(*) from aceites where user_id='${uidSem}' and navegador is not null`) === 2);
  T.ok('depois de aceitar, nada fica pendente', Doc.pendentes((await sem.from('aceites').select('documento, versao')).data ?? []).length === 0);
  T.ok('uma versão nova dos documentos volta a pedir o aceite', Doc.pendentes([{ documento: 'termos', versao: '0.9' }, { documento: 'privacidade', versao: v.privacidade }]).join() === 'termos');

  T.secao('painel do administrador');
  T.recusa('anônimo recusado em admin_aceites', await B.cliente().rpc('admin_aceites', {}));
  T.recusa('dono comum recusado em admin_aceites', await dono.rpc('admin_aceites', {}), /restrito/);
  const admEmail = `t-${L.suf}.admin@teste-auto.local`;
  const adm = B.cliente();
  B.must(await adm.auth.signUp({ email: admEmail, password: SENHA, options: B.dadosDoCadastro() }), 'cadastro do admin');
  if (!(await adm.auth.getSession()).data.session) B.must(await adm.auth.signInWithPassword({ email: admEmail, password: SENHA }), 'login do admin');
  const uidAdm = (await adm.auth.getUser()).data.user.id;
  B.sql(`insert into admins (user_id) values ('${uidAdm}') on conflict do nothing`);
  await B.adminAberto(adm); // o painel só responde depois da senha do painel (migração 20261247)
  T.depois(() => B.sql(`delete from admins where user_id='${uidAdm}'`));
  const painel = await adm.rpc('admin_aceites', { p_busca: `t-${L.suf}.`, p_limite: 50 });
  const lista = painel.data?.aceites ?? [];
  T.passa('o admin lê os aceites pela busca do e-mail', painel, lista.length === 6 && lista.every((a) => a.email.startsWith(`t-${L.suf}.`)));
  T.ok('com o pet shop de quem aceitou', lista.some((a) => a.email === L.emails.dono && (a.petshops ?? '').includes('Aceites')));
  T.ok('e a contagem por versão', (painel.data?.versoes ?? []).some((x) => x.documento === 'termos' && x.versao === v.termos && x.pessoas >= 3));

  T.secao('login apagado');
  B.sql(`delete from auth.users where id='${uidSem}'`);
  T.ok('o aceite fica, sem o login e com o e-mail', B.sql(`select count(*) from aceites where user_id is null and email='${semEmail}'`) === '2');
}))();
