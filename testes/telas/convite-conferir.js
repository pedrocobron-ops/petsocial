// Convite da equipe no navegador, depois do teste de 17/11 (Juliana M3/M4/L3/L4, Neide e Camila):
//   - "Reenviar" com o link ainda valendo pergunta antes ("para de funcionar"); "Manter o link atual" não troca nada;
//   - o link de antes, aberto depois, diz logo "Este link foi trocado por um mais novo" (criar conta e entrar), sem formulário;
//   - o link que vale mostra o nome do pet shop; com outro e-mail, o cadastro avisa e NÃO cria a conta;
//   - o dono, conectado, abrindo o link vê "Você está conectado como …".
// Capturas em testes/saida/convite-conferir-*.png (390 e 1366).
const path = require('path');
const B = require('../lib/base');
const N = require('../lib/navegador');
const { criarLoja, SENHA } = require('../lib/semente');
const T = require('../lib/teste')('convite-conferir-telas');
const SAIDA = path.join(B.RAIZ, 'testes', 'saida');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Convite conferir tela', dados: false });
  const mail = (q) => `t-${L.suf}.${q}@teste-auto.local`;
  B.sql(`update profissionais set ativo = false where id in ('${L.ids.monitor}', '${L.ids.estoque}')`);
  const nomeLoja = B.sql(`select nome from petshops where id='${L.P}'`);
  const id = B.must(await L.sb.dono.from('profissionais').insert({ petshop_id: L.P, nome: 'Recepção Nova', email_convite: mail('rec'), acessos: ['agenda'], funcao: 'Recepção', papel: 'funcionario' }).select('id').single(), 'pessoa').id;
  const codigo1 = B.must(await L.sb.dono.rpc('convite_gerar', { p_profissional: id }), 'código 1');
  const hash = () => B.sql(`select codigo_hash from convites_equipe where profissional_id='${id}'`);
  const hash1 = hash();

  T.secao('Equipe: Reenviar pergunta antes');
  const { ctx, page, erros } = await N.contexto(390, 844);
  await N.entrar(page, L.emails.dono, SENHA);
  await N.ir(page, '/gestao/app/equipe', '.g-eq-grade');
  const cartao = page.locator('.g-eq-pessoa', { hasText: 'Recepção Nova' });
  await cartao.waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  await cartao.locator('button', { hasText: 'Reenviar' }).click();
  const folha = page.locator('.g-folha', { hasText: 'Gerar um link novo?' });
  await folha.waitFor({ timeout: 10000 });
  T.ok('aparece "Gerar um link novo?" dizendo que o link atual para de funcionar', /para de funcionar/.test(await folha.textContent()), await folha.textContent());
  await page.screenshot({ path: path.join(SAIDA, 'convite-conferir-reenviar-390.png') });
  await folha.locator('button', { hasText: 'Manter o link atual' }).click();
  await page.waitForTimeout(800);
  T.ok('"Manter o link atual": nada muda no banco', hash() === hash1);
  T.ok('… e a folha do convite não abriu', !(await page.locator('.g-eq-convite-txt').count()));
  await cartao.locator('button', { hasText: 'Reenviar' }).click();
  await page.locator('.g-folha button', { hasText: 'Gerar link novo' }).click();
  await page.waitForSelector('.g-eq-convite-txt', { state: 'attached', timeout: 15000 });
  const texto = await page.locator('.g-eq-convite-txt').textContent();
  const m = /\/gestao\/criar-conta\?email=([^&\s]+)&convite=([0-9a-f]{32})/.exec(texto || '');
  T.ok('"Gerar link novo": sai um link novo', !!m && m[2] !== codigo1 && hash() !== hash1, texto);
  const linkNovo = m ? m[0] : '';

  T.secao('o dono conectado abre o link');
  await page.goto(B.BASE_URL + linkNovo);
  await page.waitForSelector('form.g-form');
  await page.waitForTimeout(1200);
  T.ok('aviso "Você está conectado como" com o e-mail do dono', (await page.locator('.g-aviso').textContent().catch(() => '')).includes(L.emails.dono));
  T.ok('Equipe e link: nenhum erro de página', erros.length === 0, erros);
  await ctx.close();

  for (const [w, h] of [[390, 844], [1366, 768]]) {
    T.secao(`link de antes (${w})`);
    const c = await N.contexto(w, h);
    await c.page.goto(`${B.BASE_URL}/gestao/criar-conta?email=${encodeURIComponent(mail('rec'))}&convite=${codigo1}`);
    await c.page.waitForSelector('main h1');
    await c.page.waitForFunction(() => !/Crie a sua conta/.test(document.querySelector('main h1')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
    const corpo = await c.page.locator('main').textContent();
    T.ok('criar conta com o link de antes: "Este link foi trocado por um mais novo", com o nome do pet shop', /trocado por um mais novo/.test(corpo) && corpo.includes(nomeLoja), corpo.slice(0, 300));
    T.ok('… sem o formulário de cadastro', !(await c.page.locator('form.g-form').count()));
    T.ok('… sem rolagem para o lado', (await N.rolagemLateral(c.page)) <= 0);
    await c.page.screenshot({ path: path.join(SAIDA, `convite-conferir-velho-${w}.png`) });
    await c.page.goto(`${B.BASE_URL}/gestao/entrar?convite=${codigo1}`);
    await c.page.waitForFunction(() => /trocado|Entre para aceitar/.test(document.querySelector('main')?.textContent || ''), null, { timeout: 15000 }).catch(() => {});
    T.ok('entrar com o link de antes: avisa antes de pedir a senha', /trocado por um mais novo/.test(await c.page.locator('main').textContent()) && !(await c.page.locator('input[type=password]').count()));
    T.ok('link de antes: nenhum erro de página', c.erros.length === 0, c.erros);
    await c.ctx.close();
  }

  T.secao('link que vale, com outro e-mail');
  const n = await N.contexto(390, 844);
  await n.page.goto(B.BASE_URL + linkNovo);
  await n.page.waitForSelector('form.g-form');
  await n.page.waitForFunction((nome) => document.querySelector('main')?.textContent?.includes(nome), nomeLoja, { timeout: 15000 }).catch(() => {});
  T.ok('a tela diz de qual pet shop é o convite', (await n.page.locator('main').textContent()).includes(`equipe de ${nomeLoja}`));
  T.ok('o aceite fala de uso na equipe, não "para o meu negócio"', /no trabalho com a equipe/.test(await n.page.locator('label.g-check').textContent()));
  await n.page.fill('input[autocomplete=name]', 'Recepção Errada');
  await n.page.fill('input[autocomplete=email]', mail('errado'));
  await n.page.fill('input[type=password]', SENHA);
  await n.page.locator('input[type=checkbox]').check();
  await n.page.click('button.g-btn.pri');
  await n.page.waitForSelector('.g-erro', { timeout: 15000 });
  const erro = await n.page.locator('.g-erro').textContent();
  T.ok('outro e-mail: o aviso diz qual e-mail usar', erro.includes(`Use ${mail('rec')}`), erro);
  T.ok('… e a conta NÃO foi criada', B.num(`select count(*) from auth.users where email='${mail('errado')}'`) === 0);
  await n.page.screenshot({ path: path.join(SAIDA, 'convite-conferir-outro-email-390.png'), fullPage: true });
  await n.page.fill('input[autocomplete=email]', mail('rec'));
  await n.page.click('button.g-btn.pri');
  await n.page.waitForURL('**/gestao/app**', { timeout: 30000 });
  T.ok('com o e-mail certo: criou a conta e caiu no pet shop', B.sql(`select coalesce(user_id::text, 'sem') from profissionais where id='${id}'`) !== 'sem');
  T.ok('cadastro: nenhum erro de página', n.erros.length === 0, n.erros);
  T.depois(() => B.sql(`delete from auth.users where email in ('${mail('rec')}', '${mail('errado')}')`));
  await n.ctx.close();
  await N.fecharNavegador();
}))();
