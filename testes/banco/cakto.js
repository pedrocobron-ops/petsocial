// Assinatura pela Cakto, de ponta a ponta: o aviso (webhook) chega na rota /api/gestao/cakto do servidor, o banco casa a loja
// e aplica status, plano, período e pago_ate. Payloads montados como a documentação da Cakto. Também: segurança das funções do
// painel, segredo errado, outro produto, e-mail diferente (callback e pagamento sem conta), reembolso, contestação e a Escola.
//
// A configuração da Cakto é global (config_interna): o teste guarda a que estava, grava a sua e devolve a de antes no fim.
// Servidor: sem GESTAO_CAKTO_PRODUTO (ou com o mesmo código de produto deste teste). Ver testes/LEIAME.md.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const T = require('../lib/teste')('cakto');

const PRECOS = { solo: [79, 215, 399], equipe: [129, 349, 659], petshop: [179, 479, 909] };

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const suf = B.sufixo();
  const SEGREDO = 'segredo-teste-auto-' + suf;
  const PRODUTO = { id: B.uuid(), short_id: 'tp' + suf.slice(-6), name: 'Maestro Pet Gestão', type: 'subscription', supportEmail: 'suporte@exemplo.com', invoiceDescription: '' };
  const OFERTAS = [];
  for (const p of ['solo', 'equipe', 'petshop']) for (const [i, m] of [1, 3, 6].entries()) OFERTAS.push({ plano: p, meses: m, oferta: `t${suf.slice(-5)}${p.slice(0, 3)}${m}`, preco: PRECOS[p][i] });

  // guarda a configuração da Cakto que estava no banco e devolve no fim
  const FILTRO = `chave like 'cakto%' or chave = 'assinatura_aberta'`;
  const antes = B.sql(`select coalesce(json_agg(c), '[]') from config_interna c where ${FILTRO}`);
  T.depois(() => B.sql(`delete from config_interna where ${FILTRO}; insert into config_interna select * from json_populate_recordset(null::config_interna, ${B.q(antes)}::json);`));

  const lojas = [];
  for (let i = 0; i < OFERTAS.length; i++) lojas.push(await criarLoja(T, { nome: `Cakto ${OFERTAS[i].plano}${OFERTAS[i].meses}`, equipe: false, dados: false }));
  const [cb, comum] = [await criarLoja(T, { nome: 'Cakto callback', equipe: false, dados: false }), await criarLoja(T, { nome: 'Cakto comum', equipe: false, dados: false })];
  // Pagamento ligado só pelo e-mail vale apenas para dono que PROVOU o e-mail (migração 20261228): as lojas dos planos e a
  // "comum" fazem de conta que o dono já entrou por um link mandado ao e-mail. A do callback fica sem a prova de propósito.
  const provar = (...ls) => B.sql(`insert into emails_confirmados (user_id, email) select u.id, lower(u.email) from auth.users u join profissionais p on p.user_id = u.id
    where p.papel = 'dono' and p.petshop_id in (${ls.map((l) => `'${l.P}'`).join(', ')}) on conflict (user_id) do update set email = excluded.email`);
  provar(...lojas, comum);
  const adm = B.cliente();
  B.must(await adm.auth.signUp({ email: `t-${comum.suf}.admin@teste-auto.local`, password: comum.senha, options: B.dadosDoCadastro() }), 'admin');
  const uidAdm = (await adm.auth.getUser()).data.user.id;
  B.sql(`insert into admins (user_id) values ('${uidAdm}') on conflict do nothing`);
  await B.adminAberto(adm); // o painel só responde depois da senha do painel (migração 20261247)
  T.depois(() => B.sql(`delete from admins where user_id='${uidAdm}'`));
  const pagou = (q) => `pagou.${q}.${suf}@teste-auto.local`;
  T.depois(() => B.sql(`delete from cakto_eventos where email like '%${suf}%'; delete from escola_compras where email like '%${suf}%'`));

  const pedido = ({ email, oferta, preco, assinatura, produto = PRODUTO, status = 'paid', callback = null }) => {
    const agora = new Date().toISOString();
    return {
      id: 'ped-' + B.sufixo(), refId: B.sufixo().toUpperCase(), status, offer_type: 'main',
      checkoutUrl: `https://pay.cakto.com.br/${oferta}${callback ? `?callback=${callback}` : ''}`, baseAmount: preco, amount: preco, currency: 'BRL', fees: 3.1,
      installments: 1, paymentMethod: 'credit_card', paymentMethodName: 'Cartão de Crédito',
      customer: { id: 481920, name: 'Comprador Teste', email, phone: '5511999999999', docType: 'cpf', docNumber: '12345678909' },
      product: produto, offer: { id: oferta, name: 'Oferta', price: preco, currency: 'BRL' },
      subscription: assinatura ? { id: assinatura, status: 'active', current_period: 1, recurrence_period: 30 } : null, subscription_period: assinatura ? 1 : null,
      callback, createdAt: agora, paidAt: agora, refundedAt: null, chargedbackAt: null, canceledAt: null,
    };
  };
  const post = async (event, data, secret = SEGREDO) => {
    const r = await fetch(`${B.BASE_URL}/api/gestao/cakto`, { method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'CaktoBot/1.0' }, body: JSON.stringify({ secret, event, data }) });
    return { status: r.status, corpo: await r.json().catch(() => null) };
  };
  const loja = (P) => { const [status, plano, periodo, pago, ass, email] = B.sql(`select status, plano, periodo_meses, coalesce(extract(epoch from pago_ate)::bigint::text, ''), coalesce(cakto_assinatura, ''), coalesce(cakto_email, '') from petshops where id='${P}'`).split('|'); return { status, plano, periodo: Number(periodo), pago: pago ? Number(pago) : null, ass, email }; };
  const esperado = (meses) => { const d = new Date(); d.setMonth(d.getMonth() + meses); d.setDate(d.getDate() + 1); return d.getTime() / 1000; };
  const anon = B.cliente();

  T.secao('funções do painel: só o admin');
  for (const [fn, args] of [['admin_cakto', {}], ['admin_cakto_segredo', { p_qual: 'gestao', p_segredo: 'abcdefghij' }], ['admin_cakto_oferta', { p_plano: 'solo', p_meses: 1, p_oferta: 'zzz', p_link: '' }], ['admin_cakto_sem_conta', {}], ['admin_cakto_abrir', { p_aberta: true }], ['admin_cakto_produto', { p_produto: 'x' }]]) {
    T.ok(`anônimo não chama ${fn}`, !!(await anon.rpc(fn, args)).error);
    T.recusa(`dono comum não chama ${fn}`, await comum.sb.dono.rpc(fn, args), /restrito/i);
  }
  const pub = B.must(await anon.rpc('gestao_assinatura'), 'gestao_assinatura');
  T.ok('gestao_assinatura é público e só traz "aberta", os links, os dias do atraso e quem vende', Object.keys(pub).sort().join() === 'aberta,atraso_dias,links,vendedor', pub);
  T.ok('cakto_aplicar não é chamável de fora', !!(await anon.rpc('cakto_aplicar', { p_petshop: comum.P, p_evento: 'purchase_approved', p_email: 'x', p_assinatura: null, p_oferta: null })).error);
  T.ok('cakto_segredo_ok não é chamável de fora', !!(await anon.rpc('cakto_segredo_ok', { p_segredo: 'x' })).error);

  T.secao('o admin configura (chave, ofertas, produto)');
  T.passa('admin grava a chave da Gestão', await adm.rpc('admin_cakto_segredo', { p_qual: 'gestao', p_segredo: SEGREDO }));
  T.recusa('chave curta é recusada', await adm.rpc('admin_cakto_segredo', { p_qual: 'gestao', p_segredo: 'curta' }));
  const hash = B.sql(`select valor from config_interna where chave='cakto_segredo_gestao_sha256'`);
  T.ok('o banco guarda só o sha256 da chave', hash.length === 64 && !hash.includes(SEGREDO));
  const cfg = B.must(await adm.rpc('admin_cakto'), 'admin_cakto');
  T.ok('admin_cakto não devolve a chave nem o hash', !JSON.stringify(cfg).includes(SEGREDO) && !JSON.stringify(cfg).includes(hash) && cfg.segredo_gestao === true);
  for (const o of OFERTAS) B.must(await adm.rpc('admin_cakto_oferta', { p_plano: o.plano, p_meses: o.meses, p_oferta: o.oferta, p_link: `https://pay.cakto.com.br/${o.oferta}` }), 'oferta ' + o.oferta);
  T.recusa('período inválido é recusado', await adm.rpc('admin_cakto_oferta', { p_plano: 'solo', p_meses: 2, p_oferta: 'abc', p_link: '' }));
  T.recusa('link sem https é recusado', await adm.rpc('admin_cakto_oferta', { p_plano: 'solo', p_meses: 1, p_oferta: OFERTAS[0].oferta, p_link: 'javascript:alert(1)' }));
  T.passa('admin grava o produto', await adm.rpc('admin_cakto_produto', { p_produto: PRODUTO.short_id }));
  const pub2 = B.must(await anon.rpc('gestao_assinatura'), 'gestao_assinatura');
  T.ok('os 9 links aparecem no público', OFERTAS.every((o) => pub2.links[`${o.plano}:${o.meses}`] === `https://pay.cakto.com.br/${o.oferta}`), pub2.links);

  T.secao('compra aprovada de cada oferta');
  for (let i = 0; i < OFERTAS.length; i++) {
    const o = OFERTAS[i], email = lojas[i].emails.dono;
    const d = pedido({ email: email.toUpperCase(), oferta: o.oferta, preco: o.preco, assinatura: `sub-${suf}-${i + 1}` });
    // a quinta vem no formato novo: data em lista, com um order bump de outro produto junto
    const data = i === 4 ? [d, { ...pedido({ email, oferta: 'bump' + suf, preco: 10 }), offer_type: 'orderbump', product: { ...PRODUTO, id: B.uuid(), short_id: 'bump' + suf.slice(-4) } }] : d;
    const r = await post('purchase_approved', data);
    const l = loja(lojas[i].P);
    T.ok(`${o.plano}:${o.meses} → ativa, plano e período certos${i === 4 ? ' (data em lista)' : ''}`, r.status === 200 && r.corpo?.resultado === 'ok' && l.status === 'ativa' && l.plano === o.plano && l.periodo === o.meses, { r, l });
    T.ok(`${o.plano}:${o.meses} → pago até hoje + ${o.meses} ${o.meses === 1 ? 'mês' : 'meses'} + 1 dia, com assinatura e e-mail`, Math.abs(l.pago - esperado(o.meses)) < 120 && l.ass === `sub-${suf}-${i + 1}` && l.email === email, l);
  }

  T.secao('ciclo da assinatura');
  const a1 = lojas[0];
  const ev = (e, extra = {}) => post(e, pedido({ email: a1.emails.dono, oferta: OFERTAS[0].oferta, preco: 79, assinatura: `sub-${suf}-1`, ...extra }));
  let r = await ev('subscription_renewed'); let l = loja(a1.P);
  T.ok('renovada → ativa, pago até +1 mês +1 dia', r.corpo?.resultado === 'ok' && l.status === 'ativa' && Math.abs(l.pago - esperado(1)) < 120, l);
  r = await post('subscription_renewed', pedido({ email: pagou('trocado'), oferta: OFERTAS[0].oferta, preco: 79, assinatura: `sub-${suf}-1` }));
  T.ok('renovação com outro e-mail casa pela assinatura', r.corpo?.resultado === 'ok', r);
  // cupom (rodada 9, vendas): o aviso da Cakto traz `couponCode`; o sistema guarda o código, o desconto e o valor de tabela
  const comCupom = pedido({ email: a1.emails.dono, oferta: OFERTAS[0].oferta, preco: 71.1, assinatura: `sub-${suf}-1` });
  r = await post('subscription_renewed', { ...comCupom, baseAmount: 79, discount: '7.90', couponCode: ' ana10 ' });
  const guardado = JSON.parse(B.sql(`select payload from cakto_eventos where petshop_id='${a1.P}' and payload->>'pedido'='${comCupom.id}'`) || '{}');
  T.ok('pagamento com cupom: o código (em maiúsculas), o desconto e o valor de tabela ficam guardados', r.corpo?.resultado === 'ok' && guardado.cupom === 'ANA10' && guardado.desconto === 7.9 && guardado.valor_cheio === 79 && guardado.valor === 71.1, guardado);
  const semCupom = JSON.parse(B.sql(`select payload from cakto_eventos where petshop_id='${a1.P}' and coalesce(payload->>'cupom','')='' order by id desc limit 1`) || '{}');
  T.ok('pagamento sem cupom não ganha a chave', !('cupom' in semCupom) && !('desconto' in semCupom), semCupom);
  T.ok('o aviso guardado continua sem documento nem telefone do comprador', !/12345678909|5511999999999/.test(JSON.stringify(guardado)));
  await ev('subscription_late', { status: 'waiting_payment' });
  T.ok('atrasada → atrasada, e continua com acesso', loja(a1.P).status === 'atrasada' && B.sql(`select acesso_liberado('${a1.P}')`) === 't');
  T.ok('atrasada: o dia do atraso fica anotado, e a trava é 10 dias depois', B.num(`select count(*) from assinatura_atrasos where petshop_id='${a1.P}'`) === 1
    && Math.abs(Number(B.sql(`select extract(epoch from assinatura_trava_em('${a1.P}') - now())`)) - 10 * 86400) < 300);
  await ev('subscription_late_recovered');
  T.ok('recuperada → ativa', loja(a1.P).status === 'ativa');
  T.ok('recuperada: a anotação do atraso some', B.num(`select count(*) from assinatura_atrasos where petshop_id='${a1.P}'`) === 0);
  await ev('subscription_canceled', { status: 'canceled' }); l = loja(a1.P);
  T.ok('cancelada → cancelada, usa até o fim do que pagou', l.status === 'cancelada' && l.pago > Date.now() / 1000 && B.sql(`select acesso_liberado('${a1.P}')`) === 't', l);

  T.secao('reembolso e contestação');
  await post('refund', pedido({ email: lojas[1].emails.dono, oferta: OFERTAS[1].oferta, preco: 215, assinatura: `sub-${suf}-2`, status: 'refunded' }));
  l = loja(lojas[1].P);
  T.ok('reembolso → cancelada, pago_ate zerado e sem acesso', l.status === 'cancelada' && l.pago === null && B.sql(`select acesso_liberado('${lojas[1].P}')`) === 'f', l);
  await post('chargeback', pedido({ email: lojas[2].emails.dono, oferta: OFERTAS[2].oferta, preco: 299, assinatura: `sub-${suf}-3`, status: 'chargedback' }));
  T.ok('contestação → cancelada e pago_ate zerado', loja(lojas[2].P).status === 'cancelada' && loja(lojas[2].P).pago === null);
  await post('chargeback', pedido({ email: lojas[5].emails.dono, oferta: OFERTAS[5].oferta, preco: 449, assinatura: `sub-${suf}-6`, status: 'MED' }));
  T.ok('MED do Pix também cancela', loja(lojas[5].P).status === 'cancelada');
  r = await post('refund_requested', pedido({ email: lojas[6].emails.dono, oferta: OFERTAS[6].oferta, preco: 129, assinatura: `sub-${suf}-7`, status: 'refund_requested' }));
  T.ok('reembolso só pedido não muda nada', r.corpo?.resultado === 'ignorado' && loja(lojas[6].P).status === 'ativa', r);
  r = await post('purchase_refused', pedido({ email: comum.emails.dono, oferta: OFERTAS[0].oferta, preco: 79, assinatura: `sub-${suf}-z`, status: 'refused' }));
  T.ok('compra recusada não ativa ninguém', r.corpo?.resultado === 'ignorado' && loja(comum.P).status === 'teste', r);

  T.secao('segredo errado e outro produto');
  r = await post('purchase_approved', pedido({ email: comum.emails.dono, oferta: OFERTAS[0].oferta, preco: 79, assinatura: `sub-${suf}-w` }), 'segredo-errado-123');
  T.ok('segredo errado → 401 e nada muda', r.status === 401 && loja(comum.P).status === 'teste', r);
  r = await post('purchase_approved', pedido({ email: comum.emails.dono, oferta: OFERTAS[0].oferta, preco: 79, assinatura: `sub-${suf}-w` }), '');
  T.ok('sem segredo → 400 ou 401', r.status === 400 || r.status === 401, r);
  const outroProd = { ...PRODUTO, id: B.uuid(), short_id: 'guia' + suf.slice(-4), name: 'Guia', type: 'unique' };
  r = await post('purchase_approved', pedido({ email: comum.emails.dono, oferta: 'guia' + suf, preco: 37, assinatura: null, produto: outroProd }));
  T.ok('outro produto → "outro_produto" (pelo produto gravado no painel) e nada muda', r.status === 200 && r.corpo?.resultado === 'outro_produto' && loja(comum.P).status === 'teste', r);
  r = await post('purchase_approved', pedido({ email: comum.emails.dono, oferta: 'guia' + suf, preco: 37, assinatura: null, produto: outroProd }));
  T.ok('aviso repetido do mesmo produto: continua sem mudar nada', loja(comum.P).status === 'teste');

  T.secao('e-mail diferente');
  // o callback do link de pagamento: assinado (<id>.<ficha>, função assinatura_callback, migração 20261177) quando o banco já tem;
  // antes dela, o id do pet shop puro. O teste serve aos dois.
  const cbr = await cb.sb.dono.rpc('assinatura_callback', { p: cb.P });
  const assinado = !cbr.error && typeof cbr.data === 'string';
  const callback = assinado ? cbr.data : cb.P;
  if (assinado) {
    r = await post('purchase_approved', pedido({ email: pagou('forjado'), oferta: OFERTAS[3].oferta, preco: 89, assinatura: `sub-${suf}-fj`, callback: cb.P }));
    T.ok('callback forjado (só o id, sem a ficha) não casa com a loja', r.corpo?.resultado !== 'ok' && loja(cb.P).status === 'teste', r);
    T.ok('outro dono não pega o callback desta loja', !(await comum.sb.dono.rpc('assinatura_callback', { p: cb.P })).data);
  }
  r = await post('purchase_approved', pedido({ email: pagou('callback'), oferta: OFERTAS[3].oferta, preco: 89, assinatura: `sub-${suf}-cb`, callback }));
  l = loja(cb.P);
  T.ok('e-mail diferente com o callback do link → cai na loja certa', r.corpo?.resultado === 'ok' && l.status === 'ativa' && l.plano === 'equipe', { r, l });
  r = await post('purchase_approved', pedido({ email: pagou('semconta'), oferta: OFERTAS[4].oferta, preco: 239, assinatura: `sub-${suf}-x` }));
  T.ok('e-mail desconhecido → "sem_conta"', r.corpo?.resultado === 'sem_conta', r);
  const soltos = B.must(await adm.rpc('admin_cakto_sem_conta'), 'sem conta');
  T.ok('aparece em "Pagamentos sem conta" para o admin', soltos.some((s) => s.email === pagou('semconta') && s.plano === 'equipe:3'), soltos.slice(0, 3));

  T.secao('Escola (material avulso)');
  const escola = { ...PRODUTO, id: B.uuid(), short_id: 'esc' + suf.slice(-4), name: 'Confeitaria Pet: o manual do negócio', type: 'unique' };
  r = await post('purchase_approved', pedido({ email: comum.emails.dono, oferta: '35oowwt', preco: 67, assinatura: null, produto: escola }));
  T.ok('material da Escola → liberado', r.corpo?.resultado === 'escola' && B.num(`select count(*) from escola_compras where email='${comum.emails.dono}' and slug='confeitaria'`) === 1, r);
  await post('refund', pedido({ email: comum.emails.dono, oferta: '35oowwt', preco: 67, assinatura: null, produto: escola }));
  T.ok('reembolso do material → tirado', B.num(`select count(*) from escola_compras where email='${comum.emails.dono}' and slug='confeitaria'`) === 0);
  r = await post('purchase_approved', pedido({ email: comum.emails.dono, oferta: '35oowwt', preco: 67, assinatura: null, produto: escola }), 'segredo-errado-123');
  T.ok('material com segredo errado → 401', r.status === 401, r);
}))();
