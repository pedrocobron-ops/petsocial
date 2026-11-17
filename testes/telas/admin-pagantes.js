// Cartão "Clientes pagantes" na Visão geral do painel do administrador, em 390 e 1366: número e barra "X de 15", a lista de quem
// paga, a lista de passos fechada em "Quando chegar em 15" e, com 15 ou mais (resposta de admin_pagantes trocada no navegador),
// o aviso "Chegou a hora de abrir a empresa" com os passos que se marcam e ficam gravados. Sem histórico confiável, o cartão
// diz que vale só o número de hoje. Sem rolagem para o lado e sem erro na página.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('admin-pagantes-tela');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Pagantes tela', equipe: false });
  // o dono desta loja vira admin só durante o teste (por SQL: ninguém vira admin pela API); a loja fica ativa para aparecer na lista
  const uid = B.sql(`select user_id from profissionais where petshop_id='${L.P}' and papel='dono'`);
  B.sql(`insert into admins (user_id) values ('${uid}') on conflict do nothing`);
  B.sql(`update petshops set status='ativa', assinatura_desde=now() - interval '10 days', pago_ate=now() + interval '20 days' where id='${L.P}'`);
  const nome = B.sql(`select nome from petshops where id='${L.P}'`);
  const passosAntes = B.sql(`select coalesce(json_agg(json_build_object('passo', passo, 'feito_em', feito_em, 'feito_por', feito_por)), '[]') from admin_empresa_passos`);
  T.depois(() => B.sql(`delete from admins where user_id='${uid}'; delete from admin_empresa_passos; insert into admin_empresa_passos (passo, feito_em, feito_por)
    select x.passo, x.feito_em, x.feito_por from json_to_recordset('${passosAntes}'::json) as x(passo text, feito_em timestamptz, feito_por uuid)`));
  B.sql(`delete from admin_empresa_passos`);

  // troca só alguns campos da resposta real de admin_pagantes
  const trocar = (page, mudar) => page.route('**/rest/v1/rpc/admin_pagantes*', async (r) => {
    const res = await r.fetch();
    const j = mudar(await res.json());
    await r.fulfill({ response: res, json: j });
  });
  const cartao = (page) => page.locator('[data-teste=pagantes]');
  const abrir = async (page) => {
    await N.ir(page, '/gestao/admin', '.g-adm-abas');
    await cartao(page).waitFor({ timeout: 20000 }).catch(() => {});
    await page.locator('[data-teste=pagantes-hoje]').waitFor({ timeout: 20000 }).catch(() => {});
  };

  for (const [larg, alt] of [[390, 844], [1366, 900]]) {
    const { ctx, page, erros } = await N.contexto(larg, alt);
    await N.entrar(page, L.emails.dono, L.senha);

    T.secao(`número de hoje (${larg})`);
    await abrir(page);
    const txt = (await cartao(page).innerText().catch(() => '')).replace(/\s+/g, ' ');
    const hoje = Number(await page.locator('[data-teste=pagantes-hoje]').innerText().catch(() => 'NaN'));
    T.ok('cartão "Clientes pagantes" na Visão geral', /Clientes pagantes/i.test(txt), txt.slice(0, 200));
    T.ok('barra "X de 15" com o mesmo número', Number.isFinite(hoje) && txt.includes(`${hoje} de 15`), [hoje, txt.slice(0, 200)]);
    T.ok('a loja ativa aparece na lista, com "pagante desde" e "pago até"', new RegExp(`${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*pagante desde \\d\\d/\\d\\d/\\d{4} · pago até`).test(txt), txt.slice(0, 600));
    T.ok('explica quem conta (ativa e atrasada; teste, cortesia e cancelada fora)', /ativa.*atrasada.*Teste, cortesia e cancelada ficam de fora/.test(txt));
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 1, await N.rolagemLateral(page));

    T.secao(`abaixo de 15 (${larg})`);
    await trocar(page, (j) => ({ ...j, hoje: 3, meses: j.meses.map((m) => ({ ...m, confiavel: false })) }));
    await abrir(page);
    const t2 = (await cartao(page).innerText().catch(() => '')).replace(/\s+/g, ' ');
    T.ok('mostra "3 de 15" e "Faltam 12"', t2.includes('3 de 15') && t2.includes('Faltam 12 clientes pagantes'), t2.slice(0, 300));
    T.ok('sem aviso de abrir a empresa', !(await page.locator('[data-teste=hora-da-empresa]').count()));
    T.ok('"Quando chegar em 15" começa fechado', /Quando chegar em 15/.test(t2) && !(await page.locator('[data-teste=passos-empresa]').count()));
    await cartao(page).locator('button', { hasText: 'Quando chegar em 15' }).click();
    T.ok('… e abre com os 6 passos', (await page.locator('[data-teste=passos-empresa] input[type=checkbox]').count()) === 6);
    T.ok('… com "confirme com o contador" e o MEI', /MEI não permite atividade de software ou SaaS.*Confirme com o contador/.test((await page.locator('[data-teste=passos-empresa]').innerText()).replace(/\s+/g, ' ')));
    T.ok('sem histórico confiável: diz que vale só o número de hoje', /vale só o número de hoje/.test(await page.locator('[data-teste=sem-historico]').innerText().catch(() => '')));
    T.ok('sem rolagem para o lado (lista aberta)', (await N.rolagemLateral(page)) <= 1, await N.rolagemLateral(page));
    if (process.env.FOTOS) await page.screenshot({ path: `${B.RAIZ}/testes/saida/admin-pagantes-abaixo-${larg}.png`, fullPage: true });
    await page.unroute('**/rest/v1/rpc/admin_pagantes*');

    T.secao(`chegou em 15 (${larg})`);
    await trocar(page, (j) => ({ ...j, hoje: 15 }));
    await abrir(page);
    const aviso = page.locator('[data-teste=hora-da-empresa]');
    T.ok('aviso "Chegou a hora de abrir a empresa" em destaque', await aviso.isVisible().catch(() => false) && /Chegou a hora de abrir a empresa/.test(await aviso.innerText()));
    T.ok('… com os 6 passos já abertos', (await aviso.locator('input[type=checkbox]').count()) === 6);
    T.ok('… e o pedido para o Claude atualizar src/lib/empresa.ts', /src\/lib\/empresa\.ts/.test(await aviso.innerText()));
    if (larg === 1366) {
      const cnpj = aviso.locator('label', { hasText: 'Abrir o CNPJ' }).locator('input');
      await cnpj.check(); await page.waitForTimeout(1200);
      T.ok('marcar "Abrir o CNPJ" grava no banco', B.num(`select count(*) from admin_empresa_passos where passo='cnpj' and feito_por='${uid}'`) === 1);
      await abrir(page);
      T.ok('… e continua marcado ao abrir de novo, com a data', await aviso.locator('label', { hasText: 'Abrir o CNPJ' }).locator('input').isChecked() && /Feito em \d\d\/\d\d\/\d{4}/.test(await aviso.innerText()));
      await aviso.locator('label', { hasText: 'Abrir o CNPJ' }).locator('input').uncheck(); await page.waitForTimeout(1200);
      T.ok('desmarcar tira do banco', B.num(`select count(*) from admin_empresa_passos where passo='cnpj'`) === 0);
    }
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 1, await N.rolagemLateral(page));
    if (process.env.FOTOS) await page.screenshot({ path: `${B.RAIZ}/testes/saida/admin-pagantes-15-${larg}.png`, fullPage: true });
    await page.unroute('**/rest/v1/rpc/admin_pagantes*');
    T.ok('nenhum erro na página', erros.length === 0, erros.slice(0, 4));
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
