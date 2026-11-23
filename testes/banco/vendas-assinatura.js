// Rodada 9 (N10), vendas (migração 20261237):
//   - fim do teste: a conta fica só para consulta SEMPRE, com ou sem a chave 'assinatura_aberta' (antes, sem a chave, o teste
//     vencido continuava liberado e a tela dizia "a assinatura ainda não abriu");
//   - assinatura atrasada: liberada por 10 dias (config_interna 'assinatura_atraso_dias') a contar do dia em que atrasou, depois
//     só para consulta; a equipe lê a data da trava por `assinatura_situacao`; quem não é da equipe não lê;
//   - quem vende: `gestao_vendedor` é público, só o admin grava (`admin_vendedor_salvar`), e apagar o nome tira a linha;
//   - de onde veio: `origem_registrar` só o dono, uma vez, no dia do cadastro; código com lixo é ignorado; ninguém lê a tabela;
//   - painel: `admin_vendas` só o admin; pet shop por vendedor, cupom que veio no aviso da Cakto, telefone só de quem pediu ajuda;
//   - `admin_atraso_dias` só o admin, de 0 a 60.
// As chaves de config_interna são globais: o teste guarda como estavam e devolve no fim, e o que depende de mudar uma chave
// roda dentro de uma transação desfeita (para não atrapalhar outro teste rodando ao mesmo tempo).
const B = require('../lib/base');
const { criarLoja, SENHA } = require('../lib/semente');
const T = require('../lib/teste')('vendas-assinatura');

(async () => T.rodar(async () => {
  const L = await criarLoja(T, { nome: 'Vendas' }); // com equipe
  const Outra = await criarLoja(T, { nome: 'Vendas outra', equipe: false, dados: false });
  const anon = B.cliente(), dono = L.sb.dono, caixa = L.sb.caixa;
  const adm = B.cliente();
  B.must(await adm.auth.signUp({ email: `t-${L.suf}.admin@teste-auto.local`, password: SENHA, options: B.dadosDoCadastro() }), 'cadastro do admin');
  const uid = (await adm.auth.getUser()).data.user.id;
  B.sql(`insert into admins (user_id) values ('${uid}') on conflict do nothing`);
  await B.adminAberto(adm); // o painel só responde depois da senha do painel (migração 20261247)
  T.depois(() => B.sql(`delete from admins where user_id='${uid}'; delete from auth.users where id='${uid}'`));
  const FILTRO = `chave like 'vendedor\\_%' or chave = 'assinatura_atraso_dias'`;
  const antes = B.sql(`select coalesce(json_agg(c), '[]') from config_interna c where ${FILTRO}`);
  T.depois(() => B.sql(`delete from config_interna where ${FILTRO}; insert into config_interna select * from json_populate_recordset(null::config_interna, ${B.q(antes)}::json);`));
  T.depois(() => B.sql(`delete from cakto_eventos where email like '%${L.suf}%'`));
  const liberado = (P) => B.sql(`select acesso_liberado('${P}')::text`) === 'true';
  /** roda dentro de uma transação que é desfeita; devolve as linhas "CHAVE=valor" */
  const ensaio = (comandos) => Object.fromEntries(B.sql(`begin; ${comandos} rollback;`).split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]));
  const novoCliente = (sb, P, n) => sb.from('clientes').insert({ petshop_id: P, nome: `Cliente ${n}`, telefone: `1197${String(Date.now()).slice(-7)}` }).select('id');

  T.secao('fim do teste: só para consulta, com ou sem a chave antiga');
  T.ok('teste valendo: liberado', liberado(L.P));
  T.passa('teste valendo: o dono cadastra', await novoCliente(dono, L.P, 'a'));
  B.sql(`update petshops set teste_ate = now() - interval '1 hour' where id='${L.P}'`);
  T.ok('teste vencido: só para consulta', !liberado(L.P));
  let r = ensaio(`delete from config_interna where chave = 'assinatura_aberta'; select 'SEM=' || acesso_liberado('${L.P}')::text;
    insert into config_interna (chave, valor) values ('assinatura_aberta', now()::text) on conflict (chave) do nothing; select 'COM=' || acesso_liberado('${L.P}')::text;`);
  T.ok('… sem a chave "assinatura_aberta" também (antes ficava liberado)', r.SEM === 'false', r);
  T.ok('… e com a chave', r.COM === 'false', r);
  T.recusa('teste vencido: o banco recusa cadastrar', await novoCliente(dono, L.P, 'b'));
  T.passa('teste vencido: continua lendo', await dono.from('clientes').select('id').eq('petshop_id', L.P).limit(1));
  let s = B.must(await dono.rpc('assinatura_situacao', { p: L.P }), 'assinatura_situacao');
  T.ok('a situação diz que não está liberado e que não há atraso', s.liberado === false && s.trava_em === null && s.atraso_dias === 10, s);

  T.secao('assinatura atrasada: 10 dias e depois só para consulta');
  B.sql(`update petshops set status='ativa', assinatura_desde = now() - interval '40 days', pago_ate = now() - interval '1 day' where id='${L.P}'`);
  T.ok('ativa: liberado e sem anotação de atraso', liberado(L.P) && B.num(`select count(*) from assinatura_atrasos where petshop_id='${L.P}'`) === 0);
  B.sql(`update petshops set status='atrasada' where id='${L.P}'`);
  T.ok('atrasou agora: anotado e ainda liberado', liberado(L.P) && B.num(`select count(*) from assinatura_atrasos where petshop_id='${L.P}'`) === 1);
  s = B.must(await caixa.rpc('assinatura_situacao', { p: L.P }), 'assinatura_situacao (recepção)');
  const emDias = (iso) => (new Date(iso).getTime() - Date.now()) / 864e5;
  T.ok('a equipe lê a data da trava: daqui a 10 dias', s.liberado === true && Math.abs(emDias(s.trava_em) - 10) < 0.01 && s.atraso_dias === 10, s);
  T.passa('atrasada dentro do prazo: o dono cadastra', await novoCliente(dono, L.P, 'c'));
  B.sql(`update petshops set status='atrasada' where id='${L.P}'`);
  T.ok('outro aviso de atraso não recomeça a contagem', B.num(`select count(*) from assinatura_atrasos where petshop_id='${L.P}' and desde > now() - interval '5 minutes'`) === 1);
  B.sql(`update assinatura_atrasos set desde = now() - interval '9 days 23 hours' where petshop_id='${L.P}'`);
  T.ok('9 dias e 23 horas: ainda liberado', liberado(L.P));
  B.sql(`update assinatura_atrasos set desde = now() - interval '10 days 1 hour' where petshop_id='${L.P}'`);
  T.ok('10 dias e 1 hora: só para consulta', !liberado(L.P));
  T.recusa('… e o banco recusa cadastrar', await novoCliente(dono, L.P, 'd'));
  s = B.must(await dono.rpc('assinatura_situacao', { p: L.P }), 'assinatura_situacao');
  T.ok('a situação mostra a trava no passado', s.liberado === false && emDias(s.trava_em) < 0, s);
  r = ensaio(`insert into config_interna (chave, valor) values ('assinatura_atraso_dias', '20') on conflict (chave) do update set valor = excluded.valor; select 'V20=' || acesso_liberado('${L.P}')::text;
    update config_interna set valor = '0' where chave = 'assinatura_atraso_dias'; select 'V0=' || acesso_liberado('${L.P}')::text;
    update config_interna set valor = 'abc' where chave = 'assinatura_atraso_dias'; select 'LIXO=' || acesso_liberado('${L.P}')::text;`);
  T.ok('com o prazo em 20 dias no painel: liberado de novo', r.V20 === 'true', r);
  T.ok('com o prazo em 0: trava na hora', r.V0 === 'false', r);
  T.ok('valor que não é número: vale o padrão de 10 dias', r.LIXO === 'false', r);
  B.sql(`update petshops set status='ativa', pago_ate = now() + interval '30 days' where id='${L.P}'`);
  T.ok('pagou: volta a ativa, liberado, e a anotação some', liberado(L.P) && B.num(`select count(*) from assinatura_atrasos where petshop_id='${L.P}'`) === 0);
  T.passa('… e o dono cadastra de novo', await novoCliente(dono, L.P, 'e'));

  T.secao('quem lê a situação');
  T.recusa('dono de outro pet shop não lê', await Outra.sb.dono.rpc('assinatura_situacao', { p: L.P }), /restrito/i);
  T.ok('anônimo não lê', !!(await anon.rpc('assinatura_situacao', { p: L.P })).error);
  for (const f of ['assinatura_trava_em', 'assinatura_anotar_atraso']) T.ok(`${f} não é chamável pela API`, !!(await dono.rpc(f, { p: L.P })).error);
  for (const [n, c] of [['anônimo', anon], ['dono', dono], ['admin', adm]]) {
    const q = await c.from('assinatura_atrasos').select('*').limit(3);
    T.ok(`${n} não lê assinatura_atrasos direto`, (q.data ?? []).length === 0 && !!q.error, q.error?.message ?? q.data);
  }
  T.recusa('dono não muda o prazo do atraso', await dono.rpc('admin_atraso_dias', { p_dias: 60 }), /restrito/i);
  T.recusa('admin: prazo fora de 0 a 60 é recusado', await adm.rpc('admin_atraso_dias', { p_dias: 61 }), /0 a 60/);
  T.passa('admin grava 10', await adm.rpc('admin_atraso_dias', { p_dias: 10 }));

  T.secao('quem vende');
  for (const [n, c] of [['anônimo', anon], ['dono', dono], ['recepção', caixa]]) {
    T.ok(`${n} não grava quem vende`, !!(await c.rpc('admin_vendedor_salvar', { p_nome: 'Invasor', p_documento: '1' })).error);
  }
  const nomeTeste = `Empresa de Teste ${L.suf} Ltda`;
  let v = B.must(await adm.rpc('admin_vendedor_salvar', { p_nome: `  ${nomeTeste}  `, p_documento: '00.000.000/0001-00', p_endereco: 'Santos/SP', p_contato: '' }), 'gravar quem vende');
  T.ok('admin grava nome, documento e endereço; contato vazio não entra', v.nome === nomeTeste && v.documento === '00.000.000/0001-00' && v.endereco === 'Santos/SP' && !('contato' in v), v);
  v = B.must(await anon.rpc('gestao_vendedor'), 'gestao_vendedor');
  T.ok('qualquer pessoa lê quem vende (aparece na página de venda)', v.nome === nomeTeste && v.documento === '00.000.000/0001-00', v);
  const pub = B.must(await anon.rpc('gestao_assinatura'), 'gestao_assinatura');
  T.ok('gestao_assinatura traz quem vende e os dias do atraso', pub.vendedor?.nome === nomeTeste && pub.atraso_dias === 10 && typeof pub.aberta === 'boolean' && typeof pub.links === 'object', pub);
  v = B.must(await adm.rpc('admin_vendedor_salvar', { p_nome: '', p_documento: '' }), 'apagar quem vende');
  T.ok('apagar o nome e o documento tira tudo', Object.keys(v).length === 0 && Object.keys(B.must(await anon.rpc('gestao_vendedor'), 'gestao_vendedor')).length === 0, v);
  T.ok('nada disso fica legível direto na tabela', ((await dono.from('config_interna').select('*').limit(1)).data ?? []).length === 0);

  T.secao('de onde veio o pet shop');
  T.ok('anônimo não registra', !!(await anon.rpc('origem_registrar', { p: L.P, p_vendedor: 'ana' })).error);
  T.recusa('recepção não registra', await caixa.rpc('origem_registrar', { p: L.P, p_vendedor: 'ana' }), /restrito/i);
  T.recusa('dono de outro pet shop não registra', await Outra.sb.dono.rpc('origem_registrar', { p: L.P, p_vendedor: 'ana' }), /restrito/i);
  r = await dono.rpc('origem_registrar', { p: L.P, p_vendedor: ' Ana-10 ', p_utm: { utm_source: 'instagram', utm_campaign: 'x'.repeat(200), outra: 'fora', utm_term: 5 }, p_quer_ajuda: true });
  T.passa('o dono registra', r, r.data === true);
  let o = JSON.parse(B.sql(`select row_to_json(x) from petshops_origem x where petshop_id='${L.P}'`));
  T.ok('vendedor em minúsculas; só utm conhecidos, cortados em 80; aceite da ajuda com a hora', o.vendedor === 'ana-10' && o.utm.utm_source === 'instagram' && o.utm.utm_campaign.length === 80
    && !('outra' in o.utm) && !('utm_term' in o.utm) && o.quer_ajuda === true && !!o.quer_ajuda_em, o);
  r = await dono.rpc('origem_registrar', { p: L.P, p_vendedor: 'bia' });
  T.ok('a segunda vez não troca o vendedor', r.data === false && B.sql(`select vendedor from petshops_origem where petshop_id='${L.P}'`) === 'ana-10', r);
  r = await Outra.sb.dono.rpc('origem_registrar', { p: Outra.P, p_vendedor: '<script>alert(1)</script>', p_utm: 'texto' });
  o = JSON.parse(B.sql(`select row_to_json(x) from petshops_origem x where petshop_id='${Outra.P}'`));
  T.ok('código com lixo é ignorado (fica sem vendedor), utm que não é objeto também, e a ajuda fica desmarcada', r.data === true && o.vendedor === null && JSON.stringify(o.utm) === '{}' && o.quer_ajuda === false && o.quer_ajuda_em === null, o);
  const Velha = await criarLoja(T, { nome: 'Vendas velha', equipe: false, dados: false });
  B.sql(`update petshops set criado_em = now() - interval '2 days' where id='${Velha.P}'`);
  r = await Velha.sb.dono.rpc('origem_registrar', { p: Velha.P, p_vendedor: 'ana' });
  T.ok('pet shop criado há mais de um dia: não registra mais', r.data === false && B.num(`select count(*) from petshops_origem where petshop_id='${Velha.P}'`) === 0, r);
  for (const [n, c] of [['anônimo', anon], ['dono', dono], ['admin', adm]]) {
    const q = await c.from('petshops_origem').select('*').limit(3);
    T.ok(`${n} não lê petshops_origem direto`, (q.data ?? []).length === 0 && !!q.error, q.error?.message ?? q.data);
    T.ok(`${n} não grava petshops_origem direto`, !!(await c.from('petshops_origem').insert({ petshop_id: Velha.P, vendedor: 'x' })).error);
  }

  T.secao('painel: vendas por vendedor e cupom');
  for (const [n, c] of [['anônimo', anon], ['dono', dono], ['recepção', caixa]]) T.ok(`${n} não chama admin_vendas`, !!(await c.rpc('admin_vendas')).error);
  B.sql(`update petshops set telefone = '11988887777' where id in ('${L.P}', '${Outra.P}');
    insert into cakto_eventos (evento, email, petshop_id, payload) values
      ('purchase_approved', 'pagou.${L.suf}@teste-auto.local', '${L.P}', '{"pedido":"p1-${L.suf}","valor":71.1,"cupom":"ANA10","desconto":7.9,"valor_cheio":79}'),
      ('subscription_renewed', 'pagou.${L.suf}@teste-auto.local', '${L.P}', '{"pedido":"p2-${L.suf}","valor":79}'),
      ('subscription_late', 'pagou.${L.suf}@teste-auto.local', '${L.P}', '{"pedido":"p3-${L.suf}","valor":79}');`);
  const a = B.must(await adm.rpc('admin_vendas'), 'admin_vendas');
  const minha = a.lojas.find((x) => x.id === L.P), outra = a.lojas.find((x) => x.id === Outra.P);
  T.ok('o pet shop aparece com o vendedor, a origem e o cupom do primeiro pagamento', minha?.vendedor === 'ana-10' && minha.utm?.utm_source === 'instagram' && minha.cupom === 'ANA10' && minha.status === 'ativa', minha);
  T.ok('quem pediu ajuda vem com o telefone', minha?.quer_ajuda === true && minha.telefone === '11988887777', minha);
  T.ok('quem não tem vendedor, campanha, cupom nem pedido de ajuda não entra na lista', !outra && !a.lojas.some((x) => x.id === Velha.P), outra);
  B.sql(`update petshops_origem set utm = '{"utm_source":"google"}' where petshop_id='${Outra.P}'`);
  const a2 = B.must(await adm.rpc('admin_vendas'), 'admin_vendas');
  const outra2 = a2.lojas.find((x) => x.id === Outra.P);
  T.ok('quem veio de campanha entra, mas sem telefone (não pediu ajuda)', outra2?.utm?.utm_source === 'google' && outra2.telefone === null && outra2.quer_ajuda === false, outra2);
  const pagos = a.pagamentos.filter((x) => x.petshop_id === L.P);
  T.ok('pagamentos: os dois que entraram (o aviso de atraso não é pagamento), com vendedor e cupom', pagos.length === 2 && pagos.every((x) => x.vendedor === 'ana-10')
    && pagos.filter((x) => x.cupom === 'ANA10' && x.valor === 71.1 && x.desconto === 7.9).length === 1 && pagos.filter((x) => x.cupom === null).length === 1, pagos);
  T.ok('a lista não traz e-mail de comprador, cliente nem pet', !/@teste-auto|cliente_id|pet_id|docNumber/.test(JSON.stringify(a)));
}))();
