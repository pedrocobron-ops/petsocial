// Painel do administrador (/gestao/admin) pela API: só quem está em `admins` chama as funções; anônimo e dono comum são recusados;
// o painel recebe só dados da conta e quantidades (nada de cliente, pet ou valor do pet shop); trocas de status ficam no histórico.
const B = require('../lib/base');
const { criarLoja, SENHA } = require('../lib/semente');
const T = require('../lib/teste')('admin');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Admin', equipe: false });
  const anon = B.cliente(), dono = L.sb.dono;
  const adm = B.cliente();
  const emailAdm = `t-${L.suf}.admin@teste-auto.local`;
  B.must(await adm.auth.signUp({ email: emailAdm, password: SENHA }), 'cadastro do admin');
  const uid = (await adm.auth.getUser()).data.user.id;
  B.sql(`insert into admins (user_id) values ('${uid}') on conflict do nothing`); // só por SQL: ninguém se torna admin pela API
  T.depois(() => B.sql(`delete from admins where user_id='${uid}'`));

  T.secao('quem chama');
  const chamadas = [['admin_painel', {}], ['admin_visao_geral', {}], ['admin_uso_contas', {}], ['admin_conta', { p_petshop: L.P }], ['admin_atualizar', { p_petshop: L.P, p_status: 'ativa' }], ['admin_cakto', {}]];
  for (const [f, a] of chamadas) {
    T.ok(`anônimo recusado em ${f}`, !!(await anon.rpc(f, a)).error);
    const rd = await dono.rpc(f, a);
    T.ok(`dono comum recusado em ${f}`, !!rd.error && !rd.data, rd.error?.message);
  }
  T.ok('o dono continua em teste (a tentativa não liberou nada)', B.sql(`select status from petshops where id='${L.P}'`) === 'teste');
  for (const [n, c] of [['anônimo', anon], ['dono', dono], ['admin', adm]]) {
    const q = await c.from('petshop_status_hist').select('*').limit(5);
    T.ok(`${n} não lê petshop_status_hist direto`, (q.data ?? []).length === 0, q.error?.message);
    T.ok(`${n} não grava petshop_status_hist`, !!(await c.from('petshop_status_hist').insert({ petshop_id: L.P, para: 'ativa' })).error);
  }

  T.secao('o que o admin recebe');
  const v = B.must(await adm.rpc('admin_visao_geral'), 'visão geral');
  const u = B.must(await adm.rpc('admin_uso_contas'), 'uso');
  const c = B.must(await adm.rpc('admin_conta', { p_petshop: L.P }), 'conta');
  const p = B.must(await adm.rpc('admin_painel'), 'painel');
  T.ok('visão geral com status e cadastros por dia', v && v.status && Array.isArray(v.cadastros), Object.keys(v ?? {}));
  const minha = u.find((x) => x.id === L.P);
  T.ok('a loja nova aparece no uso das contas', !!minha, u.length);
  const PERMITIDAS = new Set(['id', 'nome', 'status', 'plano', 'teste_ate', 'criado_em', 'limite', 'pessoas', 'ultimo_login', 'visto_em', 'ultima_gravacao', 'dias_14', 'agendamentos_14', 'vendas_14', 'creche_14', 'hotel_14', 'clientes_14', 'areas_14', 'ia_link_14']);
  const fora = [...new Set(u.flatMap((x) => Object.keys(x)).filter((k) => !PERMITIDAS.has(k)))];
  T.ok('admin_uso_contas só traz chaves de conta e quantidades', fora.length === 0, fora);
  T.ok('nenhum valor, preço, telefone de cliente ou pet na resposta', !/valor|preco|"telefone|cliente_id|pet_id/.test(JSON.stringify([v, u, c])));
  T.ok('a conta traz o histórico', Array.isArray(c.historico), Object.keys(c ?? {}));
  T.ok('o painel lista a loja', JSON.stringify(p).includes(L.P));

  T.secao('troca de status');
  T.passa('admin libera a conta', await adm.rpc('admin_atualizar', { p_petshop: L.P, p_status: 'ativa' }));
  T.ok('… a loja fica ativa', B.sql(`select status from petshops where id='${L.P}'`) === 'ativa');
  T.ok('… e a troca vai para o histórico (teste → ativa)', B.num(`select count(*) from petshop_status_hist where petshop_id='${L.P}' and para='ativa'`) === 1);
  const c2 = B.must(await adm.rpc('admin_conta', { p_petshop: L.P }), 'conta');
  T.ok('o histórico da conta mostra a troca', c2.historico.length >= 1 && JSON.stringify(c2.historico).includes('ativa'), c2.historico);
}))();
