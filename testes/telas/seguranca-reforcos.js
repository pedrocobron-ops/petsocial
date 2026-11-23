// Telas dos reforços de segurança (migração 20261245, src/middleware.ts):
//   - a regra de conteúdo VALE no aplicativo e no painel (cabeçalho Content-Security-Policy com nonce, sem 'unsafe-inline' no
//     script) e nenhuma tela principal dispara `securitypolicyviolation` (nem o painel, aba por aba);
//   - a foto do pet aparece nas telas da equipe pelo endereço assinado (bucket privado);
//   - quem entra no aplicativo vindo da capa com os cookies aceitos (pixel da Meta carregado) chega numa página nova:
//     nada do fbevents.js nem do fbq dentro do aplicativo.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('seguranca-reforcos-tela');

const JPG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
const TELAS = ['/gestao/app', '/gestao/app/agenda', '/gestao/app/agenda/quadro', '/gestao/app/clientes', '/gestao/app/creche-hotel', '/gestao/app/caixa',
  '/gestao/app/financeiro', '/gestao/app/estoque', '/gestao/app/pacotes', '/gestao/app/relatorios', '/gestao/app/equipe', '/gestao/app/meu-petshop',
  '/gestao/app/mensagens', '/gestao/app/manual', '/gestao/app/escola', '/gestao/app/assinatura'];

/** Junta as violações da regra de conteúdo (o evento do navegador e a linha "Refused to…" do console). */
async function vigiarCsp(ctx, page) {
  const visto = [];
  await ctx.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.log(`CSP-VIOLACAO ${e.effectiveDirective} ${e.blockedURI || '(em linha)'} ${e.sourceFile || ''}:${e.lineNumber || ''}`));
  });
  page.on('console', (m) => { const t = m.text(); if (/^CSP-VIOLACAO|Content Security Policy|Refused to (load|execute|apply|connect|frame)/.test(t)) visto.push(`${new URL(page.url()).pathname}: ${t.slice(0, 240)}`); });
  return visto;
}

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  T.depois(() => N.fecharNavegador());
  const L = await criarLoja(T, { nome: 'Reforcos tela' });
  const uid = B.sql(`select user_id from profissionais where petshop_id='${L.P}' and papel='dono'`);
  B.sql(`insert into admins (user_id) values ('${uid}') on conflict do nothing`);
  T.depois(() => B.sql(`delete from admins where user_id='${uid}'`));
  // foto do Thor, para ver a imagem assinada nas telas
  const foto = `${L.P}/${B.uuid()}.jpg`;
  B.must(await L.sb.dono.storage.from('pets').upload(foto, JPG, { contentType: 'image/jpeg' }), 'foto do Thor');
  B.must(await L.sb.dono.from('pets').update({ foto }).eq('id', L.pets.Thor).select('id'), 'foto no cadastro');

  T.secao('painel do administrador com a regra de conteúdo que vale, aba por aba');
  {
    const { ctx, page, erros } = await N.contexto(1366, 900);
    const csp = await vigiarCsp(ctx, page);
    await N.entrar(page, L.emails.dono, L.senha);
    const r = await page.goto(B.BASE_URL + '/gestao/admin');
    const cab = r?.headers()['content-security-policy'] ?? '';
    T.ok('o painel manda a regra de conteúdo que vale, com nonce e sem unsafe-inline no script', /script-src [^;]*'nonce-[A-Za-z0-9+/=]{16,}'/.test(cab) && !/script-src[^;]*unsafe-inline/.test(cab) && /frame-ancestors 'self'/.test(cab), cab.slice(0, 200));
    T.ok('… e não manda a regra "só avisando" do site', !r?.headers()['content-security-policy-report-only']);
    // a porta do painel (senha do painel, migração 20261247) tem a suíte dela: telas/senha-do-painel.js
    T.ok('a senha do painel abre o painel', (await N.abrirOPainel(page)) === 'abriu' && await page.locator('.g-adm-abas').isVisible());
    for (const aba of ['Visão geral', 'Uso', 'Contas', 'Conversas', 'Escola', 'Cakto', 'Vendas', 'Erros', 'Aceites', 'Dados']) {
      await page.locator('.g-adm-abas button', { hasText: aba }).first().click();
      await page.locator('[data-aba]:not([data-aba-carregando])').first().waitFor({ timeout: 20000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
    }
    T.ok('nenhuma violação no painel', csp.length === 0, csp);
    T.ok('sem erro na página do painel', erros.length === 0, erros);
    await ctx.close();
  }

  T.secao('aplicativo com a regra de conteúdo que vale');
  for (const [larg, alt] of [[390, 844], [1366, 900]]) {
    const { ctx, page, erros } = await N.contexto(larg, alt);
    const csp = await vigiarCsp(ctx, page);
    await N.entrar(page, L.emails.dono, L.senha);
    const r = await page.goto(B.BASE_URL + '/gestao/app/agenda');
    const cab = r?.headers()['content-security-policy'] ?? '';
    T.ok(`o aplicativo manda a regra que vale, com nonce (${larg})`, /script-src 'self' 'nonce-[^']+'/.test(cab) && /script-src-attr 'none'/.test(cab) && !/script-src[^;]*unsafe-inline/.test(cab) && !/facebook|cakto/.test(cab), cab.slice(0, 200));
    T.ok(`… cada página com um nonce novo (${larg})`, ((await page.request.get(B.BASE_URL + '/gestao/app/agenda')).headers()['content-security-policy'] ?? '') !== cab);
    for (const rota of TELAS) {
      await N.ir(page, rota);
      await N.fecharAvisos(page);
    }
    // ficha e lista com a foto do pet (endereço assinado do Supabase)
    await N.ir(page, `/gestao/app/clientes?pet=${L.pets.Thor}`);
    const img = page.locator('.g-avatar img').first();
    await img.waitFor({ timeout: 20000 }).catch(() => {});
    const src = (await img.getAttribute('src').catch(() => null)) ?? '';
    T.ok(`a foto do pet aparece pelo endereço assinado (${larg})`, /\/storage\/v1\/object\/sign\/pets\//.test(src) && await page.evaluate((u) => fetch(u).then((x) => x.ok && /^image\//.test(x.headers.get('content-type') ?? '')), src).catch(() => false), src.slice(0, 120));
    T.ok(`nenhuma violação da regra de conteúdo em ${TELAS.length + 1} telas (${larg})`, csp.length === 0, csp);
    if (larg === 1366) {
      // controle do vigia: um script em linha sem o nonce é barrado de verdade e aparece como violação
      const antes = csp.length;
      await page.evaluate(() => { const x = document.createElement('script'); x.textContent = 'window.__semNonce = 1'; document.body.appendChild(x); });
      await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = '<img src="data:image/png;base64,AAAA" onerror="window.__noAtributo = 1">'; document.body.appendChild(d); });
      await page.waitForTimeout(800);
      T.ok('controle: script em linha sem nonce e onerror="" não rodam, e o vigia vê as violações', csp.length >= antes + 2
        && await page.evaluate(() => window.__semNonce === undefined && window.__noAtributo === undefined), csp.slice(antes));
      csp.splice(antes);
      erros.splice(0, erros.length, ...erros.filter((e) => !/Content Security Policy|CSP-VIOLACAO/.test(e)));
    }
    T.ok(`sem erro nas telas (${larg})`, erros.filter((e) => !/facebook/.test(e)).length === 0, erros);
    await ctx.close();
  }

  T.secao('pixel da Meta fora do aplicativo');
  {
    const { ctx, page } = await N.contexto(1366, 900);
    await ctx.route(/connect\.facebook\.net|facebook\.com\/tr/, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.__fbeventsCarregou = true;' }));
    await N.entrar(page, L.emails.dono, L.senha);
    await page.goto(B.BASE_URL + '/');
    await page.evaluate(() => localStorage.setItem('mp-cookies', 'aceito'));
    await page.goto(B.BASE_URL + '/');
    await page.waitForFunction(() => !!document.querySelector('script[src*="fbevents"]'), null, { timeout: 20000 }).catch(() => {});
    T.ok('na capa, com os cookies aceitos, o fbevents.js carrega (a regra do site segue)', await page.evaluate(() => !!document.querySelector('script[src*="fbevents"]') && typeof window.fbq === 'function'));
    // navegação do próprio Next, sem recarregar, da capa para dentro do aplicativo
    await page.evaluate(() => window.next.router.push('/gestao/app'));
    await page.waitForURL('**/gestao/app', { timeout: 30000 });
    await page.waitForFunction(() => performance.getEntriesByType('navigation')[0]?.name.includes('/gestao/app'), null, { timeout: 30000 }).catch(() => {});
    await page.waitForSelector('.g-main', { timeout: 30000 });
    T.ok('entrando no aplicativo, a página é nova (carregou no endereço do aplicativo)', await page.evaluate(() => new URL(performance.getEntriesByType('navigation')[0].name).pathname === '/gestao/app'));
    T.ok('… sem fbevents.js, sem fbq e sem __fbeventsCarregou no aplicativo', await page.evaluate(() => !document.querySelector('script[src*="fbevents"]') && typeof window.fbq === 'undefined' && !window.__fbeventsCarregou));
    const pedidos = [];
    page.on('request', (q) => { if (/facebook/.test(q.url())) pedidos.push(q.url()); });
    await N.ir(page, '/gestao/app/clientes');
    await N.ir(page, '/gestao/app/agenda');
    T.ok('… e nenhum pedido para a Meta nas telas', pedidos.length === 0, pedidos);
    await ctx.close();
  }
}))();
