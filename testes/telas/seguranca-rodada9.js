// Telas, segurança rodada 9 (390 e 1366):
//   - a lista do que cada página pode carregar (Content-Security-Policy-Report-Only) bate com o que as páginas usam de verdade:
//     nenhum aviso "[Report Only]" no site de vendas, na entrada, no link do cliente e nas telas do aplicativo
//     (Supabase, fotos do bucket, fontes, imagens em blob). Se aparecer aviso, a lista de next.config.ts precisa do item novo
//     ANTES de alguém trocar o modo "só avisando" pelo modo que bloqueia;
//   - as páginas continuam abrindo com os cabeçalhos novos, sem erro e sem rolagem para o lado;
//   - painel do administrador, aba Cakto: cartão da trava do servidor (com a data da carência) e o teto de uso da IA do dia.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('seguranca-rodada9-tela');
const fs = require('fs');
const path = require('path');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Seg9 tela' });
  const uid = B.sql(`select user_id from profissionais where petshop_id='${L.P}' and papel='dono'`);
  B.sql(`insert into admins (user_id) values ('${uid}') on conflict do nothing`);
  T.depois(() => B.sql(`delete from admins where user_id='${uid}'`));
  const SAIDA = path.join(__dirname, '..', 'saida');
  fs.mkdirSync(SAIDA, { recursive: true });

  for (const [larg, alt] of [[390, 844], [1366, 900]]) {
    const { ctx, page, erros } = await N.contexto(larg, alt);
    const avisos = [];
    page.on('console', (m) => { if (/Report Only|Content Security Policy/i.test(m.text())) avisos.push(`${new URL(page.url()).pathname}: ${m.text().slice(0, 220)}`); });

    T.secao(`páginas públicas com os cabeçalhos novos (${larg})`);
    for (const rota of ['/gestao', '/gestao/entrar', '/gestao/criar-conta', `/gestao/agendar/${L.codigo}`, '/gestao/termos']) {
      const r = await page.goto(B.BASE_URL + rota);
      await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
      T.ok(`${rota.replace(L.codigo, '<código>')} abre (HTTP ${r?.status()})`, r && r.status() === 200 && (await page.locator('body').innerText()).length > 50);
    }

    T.secao(`aplicativo com os cabeçalhos novos (${larg})`);
    await N.entrar(page, L.emails.dono, L.senha);
    for (const [rota, sel] of [['/gestao/app', '.g-main'], ['/gestao/app/agenda', '.g-main'], ['/gestao/app/clientes', '.g-main'], ['/gestao/app/caixa', '.g-main'], ['/gestao/app/meu-petshop', '.g-main'], ['/gestao/app/manual', '.g-main']]) {
      await N.ir(page, rota, sel);
      T.ok(`${rota} abre sem rolagem para o lado`, (await N.rolagemLateral(page)) <= 1);
    }
    // o tópico novo do manual aparece na busca
    await N.ir(page, '/gestao/app/manual');
    const busca = page.locator('input[type=search], input.g-input').first();
    if (await busca.count()) { await busca.fill('limite do mozart'); await page.waitForTimeout(500); }
    T.ok('o Manual tem o tópico "O Mozart tem limite de uso?"', /O Mozart tem limite de uso\?/.test(await page.locator('.g-main').innerText()));

    T.secao(`painel do administrador, aba Cakto (${larg})`);
    await N.ir(page, '/gestao/admin', '.g-adm-abas');
    await page.locator('.g-adm-abas button', { hasText: 'Cakto' }).click();
    const teto = page.locator('[data-teste=teto-ia]');
    await teto.waitFor({ timeout: 20000 }).catch(() => {});
    const txt = await page.locator('.g-main, main').first().innerText().catch(() => '');
    T.ok('cartão Trava do servidor diz o estado e o que acontece', /Trava do servidor/.test(txt) && /(Ligada|Desligada)/.test(txt) && (/Ligada/.test(txt) || /seguem funcionando sem ela|não estão respondendo/.test(txt)), txt.slice(0, 300));
    const tt = (await teto.innerText().catch(() => ''));
    T.ok('cartão do teto da IA mostra cada canal com usado e teto', /Teto de uso da inteligência artificial hoje/.test(tt) && /Mozart/.test(tt) && /Tirar dúvida do link/.test(tt) && /\d+ de \d+/.test(tt), tt.slice(0, 300));
    T.ok('sem rolagem para o lado no painel', (await N.rolagemLateral(page)) <= 1);
    await teto.scrollIntoViewIfNeeded().catch(() => {});
    await page.screenshot({ path: path.join(SAIDA, `seguranca9-admin-${larg}.png`) });

    T.ok(`nenhum aviso da lista de carregamento ("Report Only") nas páginas visitadas (${larg})`, avisos.length === 0, avisos.slice(0, 6));
    T.ok(`sem erro nas páginas (${larg})`, erros.length === 0, erros.slice(0, 5));
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
