// Clientes pagantes no painel do administrador (migração 20261206): só o admin chama `admin_pagantes` e `admin_empresa_marcar`;
// dono, recepção e anônimo são recusados e ninguém lê ou grava `admin_empresa_passos` direto. Pagante = ativa ou atrasada
// (teste, cortesia e cancelada ficam de fora, mesmo cancelada com período pago). Evolução por mês: status no fim de cada mês
// pelo histórico de trocas; mês antes do primeiro registro volta como não confiável.
const B = require('../lib/base');
const { criarLoja, SENHA } = require('../lib/semente');
const T = require('../lib/teste')('admin-pagantes');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Pagantes' }); // com equipe: a recepção (caixa) também tenta
  const anon = B.cliente(), dono = L.sb.dono, caixa = L.sb.caixa;
  const adm = B.cliente();
  const emailAdm = `t-${L.suf}.admin@teste-auto.local`;
  B.must(await adm.auth.signUp({ email: emailAdm, password: SENHA, options: B.dadosDoCadastro() }), 'cadastro do admin');
  const uid = (await adm.auth.getUser()).data.user.id;
  B.sql(`insert into admins (user_id) values ('${uid}') on conflict do nothing`); // só por SQL: ninguém vira admin pela API
  await B.adminForte(adm); // o painel só responde com o segundo fator (aal2, migração 20261245)
  T.depois(() => B.sql(`delete from admins where user_id='${uid}'; delete from auth.users where id='${uid}'`));
  // os passos são globais: guarda como estavam e devolve no fim
  const passosAntes = B.sql(`select coalesce(json_agg(json_build_object('passo', passo, 'feito_em', feito_em, 'feito_por', feito_por)), '[]') from admin_empresa_passos`);
  T.depois(() => B.sql(`delete from admin_empresa_passos; insert into admin_empresa_passos (passo, feito_em, feito_por)
    select x.passo, x.feito_em, x.feito_por from json_to_recordset('${passosAntes}'::json) as x(passo text, feito_em timestamptz, feito_por uuid)`));

  T.secao('quem chama');
  for (const [f, a] of [['admin_pagantes', {}], ['admin_empresa_marcar', { p_passo: 'cnpj', p_feito: true }]]) {
    for (const [n, c] of [['anônimo', anon], ['dono', dono], ['recepção', caixa]]) {
      const r = await c.rpc(f, a);
      T.ok(`${n} recusado em ${f}`, !!r.error && !r.data, r.error?.message ?? r.data);
    }
  }
  T.ok('a tentativa não marcou nada', B.num(`select count(*) from admin_empresa_passos where feito_por <> '${uid}' and feito_em > now() - interval '1 minute'`) === 0);
  for (const [n, c] of [['anônimo', anon], ['dono', dono], ['recepção', caixa], ['admin', adm]]) {
    const q = await c.from('admin_empresa_passos').select('*').limit(5);
    T.ok(`${n} não lê admin_empresa_passos direto`, (q.data ?? []).length === 0 && !!q.error, q.error?.message ?? q.data);
    T.ok(`${n} não grava admin_empresa_passos direto`, !!(await c.from('admin_empresa_passos').insert({ passo: 'notas' })).error);
  }
  T.ok('admin_status_em não é chamável pela API', !!(await adm.rpc('admin_status_em', { p_petshop: L.P, p_quando: new Date().toISOString() })).error);

  T.secao('quem conta como pagante');
  const lojas = { ativa: L.P };
  for (const st of ['atrasada', 'cortesia', 'teste', 'cancelada']) lojas[st] = (await criarLoja(T, { nome: `Pag ${st}`, equipe: false })).P;
  B.sql(`update petshops set status='ativa', assinatura_desde=now() - interval '20 days', pago_ate=now() + interval '10 days' where id='${lojas.ativa}';
    update petshops set status='atrasada', assinatura_desde=now() - interval '40 days', pago_ate=now() - interval '2 days' where id='${lojas.atrasada}';
    update petshops set status='cortesia' where id='${lojas.cortesia}';
    update petshops set status='cancelada', assinatura_desde=now() - interval '50 days', pago_ate=now() + interval '15 days' where id='${lojas.cancelada}';`);
  const r = B.must(await adm.rpc('admin_pagantes'), 'admin_pagantes');
  const ids = new Set((r.lojas ?? []).map((l) => l.id));
  T.ok('meta de 15', r.meta === 15, r.meta);
  T.ok('o número de hoje é o tamanho da lista', r.hoje === r.lojas.length, [r.hoje, r.lojas.length]);
  T.ok('ativa conta', ids.has(lojas.ativa));
  T.ok('atrasada conta', ids.has(lojas.atrasada));
  T.ok('cortesia fica de fora', !ids.has(lojas.cortesia));
  T.ok('teste fica de fora', !ids.has(lojas.teste));
  T.ok('cancelada fica de fora, mesmo com período pago até daqui a 15 dias', !ids.has(lojas.cancelada));
  const a = r.lojas.find((l) => l.id === lojas.ativa), at = r.lojas.find((l) => l.id === lojas.atrasada);
  T.ok('cada loja vem com status, desde quando e pago até', a?.status === 'ativa' && !!a.desde && !!a.pago_ate && at?.status === 'atrasada' && !!at.status_desde, [a, at]);
  T.ok('desde = assinante desde', Math.abs(new Date(a.desde).getTime() - (Date.now() - 20 * 864e5)) < 120e3, a.desde);
  T.ok('a lista não traz cliente, pet nem valor', !/telefone|cliente_id|pet_id|valor|preco|email/.test(JSON.stringify(r.lojas)));

  T.secao('marcar os passos');
  T.passa('admin marca "abrir o CNPJ"', await adm.rpc('admin_empresa_marcar', { p_passo: 'cnpj', p_feito: true }));
  const m2 = B.must(await adm.rpc('admin_empresa_marcar', { p_passo: 'cnpj', p_feito: true }), 'marcar de novo');
  T.ok('marcar de novo não duplica', 'cnpj' in m2 && B.num(`select count(*) from admin_empresa_passos where passo='cnpj'`) === 1, m2);
  const r2 = B.must(await adm.rpc('admin_pagantes'), 'admin_pagantes');
  T.ok('o passo marcado volta em admin_pagantes, com a data', !!r2.passos?.cnpj, r2.passos);
  T.ok('quem marcou fica gravado', B.sql(`select feito_por from admin_empresa_passos where passo='cnpj'`) === uid);
  const m3 = B.must(await adm.rpc('admin_empresa_marcar', { p_passo: 'cnpj', p_feito: false }), 'desmarcar');
  T.ok('desmarcar tira', !('cnpj' in m3) && B.num(`select count(*) from admin_empresa_passos where passo='cnpj'`) === 0, m3);
  T.recusa('passo desconhecido é recusado', await adm.rpc('admin_empresa_marcar', { p_passo: 'xyz', p_feito: true }), /Passo desconhecido/);

  T.secao('evolução por mês');
  T.ok('6 meses fechados, do mais antigo ao mais recente', Array.isArray(r.meses) && r.meses.length === 6 && r.meses.every((m, i) => i === 0 || m.mes > r.meses[i - 1].mes), r.meses);
  const mesAtual = B.sql(`select to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM')`);
  T.ok('o último é o mês passado (o atual ainda não fechou)', r.meses[5].mes < mesAtual, [r.meses[5].mes, mesAtual]);
  // uma loja com histórico montado: teste → ativa no dia 5 de 4 meses atrás; ativa → cancelada no dia 5 de 2 meses atrás
  const H = lojas.cancelada;
  const ini = (k) => `(date_trunc('month', now() at time zone 'America/Sao_Paulo') - interval '${k} months')`;
  B.sql(`update petshops set criado_em=now() - interval '8 months', assinatura_desde=(${ini(4)} + interval '4 days') at time zone 'America/Sao_Paulo' where id='${H}';
    delete from petshop_status_hist where petshop_id='${H}';
    insert into petshop_status_hist (petshop_id, de, para, em) values
      ('${H}', 'teste', 'ativa', (${ini(4)} + interval '4 days') at time zone 'America/Sao_Paulo'),
      ('${H}', 'ativa', 'cancelada', (${ini(2)} + interval '4 days') at time zone 'America/Sao_Paulo');`);
  const r3 = B.must(await adm.rpc('admin_pagantes'), 'admin_pagantes');
  const st = (fim) => B.sql(`select coalesce(admin_status_em('${H}', '${fim}')::text, '-')`);
  // meses[i] é o mês 6-i atrás; o fim dele é o dia 1 do mês seguinte
  const esperado = { 0: 'teste', 1: 'teste', 2: 'ativa', 3: 'ativa', 4: 'cancelada', 5: 'cancelada' };
  const visto = r3.meses.map((m) => st(m.fim));
  T.ok('status no fim de cada mês sai do histórico (teste, teste, ativa, ativa, cancelada, cancelada)', visto.every((s, i) => s === esperado[i]), visto);
  T.ok('… então ela conta como pagante só nos 2 meses em que estava ativa', r3.meses[2].n >= 1 && r3.meses[3].n >= 1, r3.meses.map((m) => m.n));
  T.ok('loja criada depois do fim do mês não existe naquele mês', B.sql(`select coalesce(admin_status_em('${lojas.teste}', now() - interval '1 year')::text, '-')`) === '-');
  T.ok('antes da primeira troca vale o status de antes dela (teste)', st(r3.meses[0].fim) === 'teste');
  const desde = new Date(r3.historico_desde).getTime();
  T.ok('historico_desde = primeiro registro de troca', !!r3.historico_desde && desde <= new Date(r3.meses[2].fim).getTime(), r3.historico_desde);
  T.ok('mês que fecha antes do primeiro registro volta como não confiável; depois, confiável',
    r3.meses.every((m) => m.confiavel === (new Date(m.fim).getTime() >= desde)), r3.meses.map((m) => [m.mes, m.confiavel]));
  // conta de verdade: refaz a contagem de um mês confiável pelo banco
  const m = r3.meses[3];
  const conta = B.num(`select count(*) from petshops p where admin_status_em(p.id, '${m.fim}') in ('ativa','atrasada') and (p.assinatura_desde is null or p.assinatura_desde <= '${m.fim}')`);
  T.ok('a contagem do mês bate com o banco', conta === m.n, [conta, m.n]);
}))();
