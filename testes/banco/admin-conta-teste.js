// Conta de teste no painel do administrador (migração 20261240): `petshops.conta_teste` só muda pelo administrador
// (`admin_conta_teste`); dono, recepção e anônimo não mudam nem leem a marca. Marcada, a conta sai dos números: Visão geral
// (situação, cadastros, planos), pagantes, vendas (lojas e pagamentos) e os números das conversas; a lista de pet shops
// (`admin_painel`) continua trazendo todas, com `conta_teste`. Desmarcada, volta. Nada é marcado sozinho pelo nome.
const B = require('../lib/base');
const { criarLoja, SENHA } = require('../lib/semente');
const T = require('../lib/teste')('admin-conta-teste');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Teste Maestro' }); // o nome parece de teste, mas só a marca do administrador vale
  const anon = B.cliente(), dono = L.sb.dono, caixa = L.sb.caixa;
  const adm = B.cliente();
  const emailAdm = `t-${L.suf}.admin@teste-auto.local`;
  B.must(await adm.auth.signUp({ email: emailAdm, password: SENHA, options: B.dadosDoCadastro() }), 'cadastro do admin');
  const uid = (await adm.auth.getUser()).data.user.id;
  B.sql(`insert into admins (user_id) values ('${uid}') on conflict do nothing`);
  await B.adminAberto(adm); // o painel só responde depois da senha do painel (migração 20261247)
  T.depois(() => B.sql(`delete from admins where user_id='${uid}'; delete from auth.users where id='${uid}'`));
  const P = L.P;
  // a loja paga (entra em pagantes, planos e vendas), com um pagamento da Cakto e a origem por vendedor
  B.sql(`update petshops set status='ativa', assinatura_desde=now() - interval '5 days', pago_ate=now() + interval '25 days' where id='${P}';
    insert into petshops_origem (petshop_id, vendedor) values ('${P}', 'vend-${L.suf}') on conflict (petshop_id) do update set vendedor = excluded.vendedor;
    insert into cakto_eventos (evento, email, petshop_id, payload) values ('purchase_approved', 'x@teste-auto.local', '${P}', '{"valor": 99}'::jsonb);
    insert into conversas (petshop_id, user_id, canal, pergunta, resposta) select '${P}', user_id, 'ajuda', 'oi', 'olá' from profissionais where petshop_id='${P}' and papel='dono' limit 1;`);
  T.depois(() => B.sql(`delete from cakto_eventos where petshop_id='${P}'`));

  const ler = async () => {
    const painel = B.must(await adm.rpc('admin_painel'), 'admin_painel');
    const visao = B.must(await adm.rpc('admin_visao_geral'), 'admin_visao_geral');
    const pag = B.must(await adm.rpc('admin_pagantes'), 'admin_pagantes');
    const vendas = B.must(await adm.rpc('admin_vendas'), 'admin_vendas');
    const conv = B.must(await adm.rpc('admin_conversas_numeros', {}), 'admin_conversas_numeros');
    const convLoja = B.must(await adm.rpc('admin_conversas_numeros', { p_petshop: P }), 'admin_conversas_numeros da loja');
    return { painel, visao, pag, vendas, conv, convLoja, linha: painel.find((l) => l.id === P) };
  };

  T.secao('começa fora da marca (o nome "Teste Maestro" não marca nada)');
  const antes = await ler();
  T.ok('a loja nova vem com conta_teste = false', antes.linha && antes.linha.conta_teste === false, antes.linha);
  T.ok('entra em pagantes', antes.pag.lojas.some((l) => l.id === P));
  T.ok('entra em vendas (lojas e pagamentos)', antes.vendas.lojas.some((l) => l.id === P) && antes.vendas.pagamentos.some((x) => x.petshop_id === P));

  T.secao('quem pode marcar');
  for (const [n, c] of [['anônimo', anon], ['dono', dono], ['recepção', caixa]]) {
    const r = await c.rpc('admin_conta_teste', { p_petshop: P, p_teste: true });
    T.ok(`${n} recusado em admin_conta_teste`, !!r.error, r.error?.message ?? r.data);
  }
  const direto = await dono.from('petshops').update({ conta_teste: true }).eq('id', P).select('id');
  T.ok('o dono não grava a coluna direto', !!direto.error || !(direto.data ?? []).length, direto.error?.message ?? direto.data);
  const lida = await dono.from('petshops').select('conta_teste').eq('id', P);
  T.ok('o dono não lê a coluna', !!lida.error, lida.data);
  T.ok('continua desmarcada', B.sql(`select conta_teste from petshops where id='${P}'`) === 'f');

  T.secao('marcada: fora dos números');
  T.ok('admin marca', B.must(await adm.rpc('admin_conta_teste', { p_petshop: P, p_teste: true }), 'marcar') === true);
  const dep = await ler();
  T.ok('a lista de pet shops continua com ela, marcada', dep.linha && dep.linha.conta_teste === true, dep.linha);
  T.ok('Visão geral: total um a menos e ativas um a menos', dep.visao.status.total === antes.visao.status.total - 1 && dep.visao.status.ativa === antes.visao.status.ativa - 1,
    [antes.visao.status, dep.visao.status]);
  const hoje = dep.visao.cadastros[dep.visao.cadastros.length - 1], hojeAntes = antes.visao.cadastros[antes.visao.cadastros.length - 1];
  T.ok('Visão geral: cadastros de hoje um a menos', hoje.n === hojeAntes.n - 1, [hojeAntes, hoje]);
  T.ok('Visão geral: diz quantas contas de teste ficaram fora', dep.visao.contas_teste === antes.visao.contas_teste + 1, [antes.visao.contas_teste, dep.visao.contas_teste]);
  const nPlanos = (v) => v.planos.reduce((t, p) => t + (p.status === 'ativa' ? p.n : 0), 0);
  T.ok('Visão geral: planos pagando um a menos', nPlanos(dep.visao) === nPlanos(antes.visao) - 1);
  T.ok('pagantes: fora da lista e do número de hoje', !dep.pag.lojas.some((l) => l.id === P) && dep.pag.hoje === antes.pag.hoje - 1, [antes.pag.hoje, dep.pag.hoje]);
  T.ok('vendas: fora das lojas e dos pagamentos', !dep.vendas.lojas.some((l) => l.id === P) && !dep.vendas.pagamentos.some((x) => x.petshop_id === P));
  T.ok('conversas no geral: uma a menos', dep.conv.conversas === antes.conv.conversas - 1, [antes.conv.conversas, dep.conv.conversas]);
  T.ok('conversas pedindo o pet shop: os números dele continuam', dep.convLoja.conversas === 1, dep.convLoja);
  T.ok('mozart_tempos continua respondendo', !(await adm.rpc('admin_mozart_tempos')).error);

  T.secao('desmarcada: volta');
  T.ok('admin desmarca', B.must(await adm.rpc('admin_conta_teste', { p_petshop: P, p_teste: false }), 'desmarcar') === false);
  const volta = await ler();
  T.ok('volta para os números', volta.visao.status.total === antes.visao.status.total && volta.pag.lojas.some((l) => l.id === P) && volta.vendas.lojas.some((l) => l.id === P));
  T.ok('pet shop que não existe: erro claro', /não encontrado/.test((await adm.rpc('admin_conta_teste', { p_petshop: B.uuid(), p_teste: true })).error?.message ?? ''));
}))();
