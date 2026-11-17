// Conferir o link do convite antes de criar a conta (migração 20261219, função convite_conferir), testes de 17/11:
//   - Juliana M3: e-mail errado criava uma conta que nunca entrava na equipe; agora a tela pergunta ao banco ANTES (anon);
//   - Juliana M4: link velho parecia normal; agora o banco diz 'substituido' (link novo gerado), 'cancelado', 'vencido', 'usado';
//   - a resposta só traz a situação e o nome do pet shop: nunca o e-mail do convite nem outro dado da loja;
//   - limites: 10 conferências com e-mail por hora para o mesmo código, 30 por hora por rede (IP).
const crypto = require('crypto');
const B = require('../lib/base');
const { criarLoja, SENHA } = require('../lib/semente');
const T = require('../lib/teste')('convite-conferir');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Convite conferir', dados: false });
  const dono = L.sb.dono;
  const mail = (q) => `t-${L.suf}.${q}@teste-auto.local`;
  B.sql(`update profissionais set ativo = false where id in ('${L.ids.monitor}', '${L.ids.estoque}')`);
  const nomeLoja = B.sql(`select nome from petshops where id='${L.P}'`);
  const novo = async (q) => B.must(await dono.from('profissionais').insert({ petshop_id: L.P, nome: `Conf ${q}`, email_convite: mail(q), acessos: ['agenda'], funcao: 'Recepção', papel: 'funcionario' }).select('id').single(), 'convite ' + q).id;
  const gerar = async (id) => B.must(await dono.rpc('convite_gerar', { p_profissional: id }), 'gerar');
  // cada conferência sai de um IP diferente, para o limite por rede não atrapalhar as outras partes do teste
  const conferir = async (codigo, email) => B.must(await B.cliente(B.ipAleatorio()).rpc('convite_conferir', { p_codigo: codigo, ...(email !== undefined ? { p_email: email } : {}) }), 'conferir');

  T.secao('link que vale');
  const idA = await novo('a');
  const codA = await gerar(idA);
  const r1 = await conferir(codA);
  T.ok('sem login, o link novo responde "valido" com o nome do pet shop', r1.situacao === 'valido' && r1.petshop === nomeLoja, r1);
  T.ok('a resposta não traz o e-mail do convite nem outros dados', !JSON.stringify(r1).includes('@') && Object.keys(r1).sort().join() === 'petshop,situacao', r1);
  T.ok('com o e-mail certo (maiúsculas e espaços não importam): "valido"', (await conferir(codA, `  ${mail('a').toUpperCase()} `)).situacao === 'valido');
  const r2 = await conferir(codA, mail('outra'));
  T.ok('com outro e-mail: "outro_email", sem dizer qual é o certo', r2.situacao === 'outro_email' && !JSON.stringify(r2).includes(mail('a')), r2);
  T.ok('conferir não cria conta nem gasta o convite', B.num(`select count(*) from convites_equipe where profissional_id='${idA}' and usado_em is null`) === 1
    && B.num(`select count(*) from auth.users where email='${mail('outra')}'`) === 0);
  T.ok('ninguém lê a tabela de conferências nem a de códigos antigos', !!(await B.cliente().from('convite_consultas').select('*').limit(1)).error
    && !!(await dono.from('convites_equipe_antigos').select('*').limit(1)).error);

  T.secao('links que não valem mais');
  T.ok('código inventado: "invalido", sem nome de loja', (await conferir(crypto.randomBytes(16).toString('hex'))).petshop === undefined);
  T.ok('texto que não é código: "invalido"', (await conferir("x' or 1=1 --")).situacao === 'invalido');
  const codA2 = await gerar(idA); // "Reenviar"
  const r3 = await conferir(codA);
  T.ok('o link de antes do "Reenviar": "substituido", com o nome do pet shop', r3.situacao === 'substituido' && r3.petshop === nomeLoja, r3);
  T.ok('… e o link novo vale', (await conferir(codA2)).situacao === 'valido');
  B.sql(`update convites_equipe set expira_em = now() - interval '1 minute' where profissional_id='${idA}'`);
  T.ok('passou dos 7 dias: "vencido"', (await conferir(codA2)).situacao === 'vencido');
  const codA3 = await gerar(idA);
  B.must(await dono.from('profissionais').update({ email_convite: mail('a-novo') }).eq('id', idA), 'trocar e-mail');
  T.ok('e-mail trocado em Equipe: o link vira "cancelado"', (await conferir(codA3)).situacao === 'cancelado');

  T.secao('link usado');
  const idB = await novo('b');
  const codB = await gerar(idB);
  const sb = B.cliente();
  B.must(await sb.auth.signUp({ email: mail('b'), password: SENHA, options: B.dadosDoCadastro() }), 'cadastro b');
  B.must(await sb.rpc('convite_aceitar', { p_codigo: codB }), 'aceitar');
  T.ok('depois de aceito: "usado"', (await conferir(codB)).situacao === 'usado');
  B.sql(`update profissionais set user_id = null where id='${idB}'`); // como "Tirar o acesso" (o gatilho apaga o convite)
  T.ok('a pessoa saiu da equipe depois: continua "usado" (não vira "invalido")', (await conferir(codB)).situacao === 'usado');

  T.secao('limites');
  const idC = await novo('c');
  const codC = await gerar(idC);
  const ip = B.ipAleatorio();
  let ultima = null;
  for (let i = 0; i < 11; i++) ultima = B.must(await B.cliente(B.ipAleatorio()).rpc('convite_conferir', { p_codigo: codC, p_email: mail(`tentativa${i}`) }), 'tentativa');
  T.ok('11ª tentativa de e-mail no mesmo código em 1 hora: "muitos" (não dá para descobrir o e-mail chutando)', ultima.situacao === 'muitos', ultima);
  T.ok('… sem e-mail, o mesmo link ainda responde', (await conferir(codC)).situacao === 'valido');
  const mesmo = B.cliente(ip);
  let r = null;
  for (let i = 0; i < 31; i++) r = B.must(await mesmo.rpc('convite_conferir', { p_codigo: crypto.randomBytes(16).toString('hex') }), 'rede');
  const redeFunciona = B.num(`select count(*) from convite_consultas where rede is not null and em > now() - interval '5 minutes'`) > 0;
  if (redeFunciona) T.ok('31ª conferência da mesma rede em 1 hora: "muitos"', r.situacao === 'muitos', r);
  else console.log('  (sem cabeçalho de IP neste Supabase local: limite por rede não testado)');

  T.secao('apagar a loja inteira com convites guardados');
  T.ok('há códigos antigos guardados desta loja', B.num(`select count(*) from convites_equipe_antigos where petshop_id='${L.P}'`) >= 2);
  // apagar o pet shop leva os convites junto (cascata) e o gatilho guarda os códigos: não pode travar a exclusão
  let apagou = '';
  try { apagou = B.sql(`begin; delete from petshops where id='${L.P}'; select (count(*) = 0)::text from petshops where id='${L.P}'; rollback;`); } catch (e) { apagou = e.message; }
  T.ok('apagar a loja com convites (ativos e antigos) não dá erro', /true/.test(apagou), apagou);
  T.ok('… e um link de loja que não existe mais responde "invalido"', B.sql(`begin; delete from petshops where id='${L.P}'; select public.convite_conferir('${codC}') ->> 'situacao'; rollback;`).includes('invalido'));
}))();
