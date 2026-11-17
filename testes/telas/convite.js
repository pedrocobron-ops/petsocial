// Convite da equipe pelo link com código (migração 20261209), no navegador (celular, 390):
//   - Equipe: convite antigo, sem código, aparece com "Mande o convite de novo"; o convite aberto traz o link com &convite=;
//   - a pessoa convidada abre o link, cria a conta e cai direto no pet shop;
//   - quem já tem conta abre /gestao/entrar?convite=… e entra na equipe com o próprio login;
//   - o mesmo link de novo, com outra conta: "O convite não entrou".
const B = require('../lib/base');
const N = require('../lib/navegador');
const { criarLoja, SENHA } = require('../lib/semente');
const T = require('../lib/teste')('convite');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Convite tela', dados: false });
  const O = await criarLoja(T, { nome: 'Convite outra', equipe: false, dados: false });
  const mail = (q) => `t-${L.suf}.${q}@teste-auto.local`;
  // cabem os convites daqui nos 6 acessos do teste
  B.sql(`update profissionais set ativo = false where id in ('${L.ids.monitor}', '${L.ids.estoque}')`);
  const convite = async (q) => B.must(await L.sb.dono.from('profissionais').insert({ petshop_id: L.P, nome: `Nova ${q}`, email_convite: mail(q), acessos: ['agenda'], funcao: 'Recepção', papel: 'funcionario' }).select('id').single(), 'convite').id;
  const ligado = (id) => B.sql(`select coalesce(user_id::text, 'sem') from profissionais where id='${id}'`);

  T.secao('Equipe: convite antigo e o link com código');
  const idVelho = await convite('velha'); // como os convites de antes: sem código
  const { ctx, page, erros } = await N.contexto(390, 844);
  await N.entrar(page, L.emails.dono, SENHA);
  await N.ir(page, '/gestao/app/equipe', '.g-eq-grade');
  const cartao = page.locator('.g-eq-pessoa', { hasText: 'Nova velha' });
  await cartao.waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  T.ok('convite antigo: "Mande o convite de novo" no cartão', /Mande o convite de novo/.test(await cartao.textContent()), await cartao.textContent());
  T.ok('… com o botão "Mandar de novo"', await cartao.locator('button', { hasText: 'Mandar de novo' }).isVisible());
  await cartao.locator('button', { hasText: 'Mandar de novo' }).click();
  await page.waitForSelector('.g-eq-convite-txt', { state: 'attached', timeout: 15000 });
  const texto = await page.locator('.g-eq-convite-txt').textContent();
  const m = /\/gestao\/criar-conta\?email=([^&\s]+)&convite=([0-9a-f]{32})/.exec(texto || '');
  T.ok('o texto do convite leva o link com o e-mail e o código', !!m && decodeURIComponent(m[1]) === mail('velha'), texto);
  T.ok('… e diz que vale 7 dias e uma vez só', /7 dias/.test(texto) && /uma vez/.test(texto));
  const zap = await page.locator('.g-eq-convite a[href^="https://wa.me/"]').getAttribute('href');
  T.ok('o WhatsApp leva o mesmo texto, com o código', decodeURIComponent(zap || '').includes(m ? m[2] : '@@'));
  T.ok('o banco guarda o código (só o hash)', !!m && B.num(`select count(*) from convites_equipe where profissional_id='${idVelho}' and codigo_hash = encode(extensions.digest('${m[2]}', 'sha256'), 'hex')`) === 1);
  await page.locator('.g-folha button', { hasText: 'Fechar' }).first().click().catch(() => {});
  await page.waitForTimeout(800);
  T.ok('depois de mandar, o cartão mostra até quando o link vale', /link vale até \d{2}\/\d{2}/.test(await cartao.textContent()), await cartao.textContent());
  T.ok('Equipe: nenhum erro de página', erros.length === 0, erros);
  await ctx.close();

  T.secao('a pessoa convidada cria a conta pelo link');
  const novo = await N.contexto(390, 844);
  await novo.page.goto(B.BASE_URL + m[0]);
  await novo.page.waitForSelector('form.g-form');
  T.ok('o e-mail do convite já vem preenchido', (await novo.page.locator('input[autocomplete=email]').inputValue()) === mail('velha'));
  await novo.page.fill('input[autocomplete=name]', 'Nova Velha');
  await novo.page.fill('input[type=password]', SENHA);
  await novo.page.locator('input[type=checkbox]').check();
  await novo.page.click('button.g-btn.pri');
  await novo.page.waitForURL('**/gestao/app**', { timeout: 30000 });
  await novo.page.waitForSelector('.g-main', { timeout: 30000 });
  T.ok('criou a conta e caiu no pet shop (sem passar por Começar)', ligado(idVelho) !== 'sem' && novo.page.url().includes('/gestao/app'), novo.page.url());
  T.ok('cadastro pelo convite: nenhum erro de página', novo.erros.length === 0, novo.erros);
  await novo.ctx.close();

  T.secao('quem já tem conta abre o link de entrar');
  const idJa = await convite('ja');
  const codigoJa = B.must(await L.sb.dono.rpc('convite_gerar', { p_profissional: idJa }), 'código');
  const ja = B.cliente();
  B.must(await ja.auth.signUp({ email: mail('ja'), password: SENHA, options: B.dadosDoCadastro() }), 'conta que já existia');
  const c2 = await N.contexto(390, 844);
  await c2.page.goto(`${B.BASE_URL}/gestao/entrar?convite=${codigoJa}`);
  await c2.page.waitForSelector('form.g-form');
  T.ok('a tela pede para entrar e aceitar o convite', /aceitar o convite/i.test(await c2.page.locator('main').textContent()));
  await c2.page.fill('input[type=email]', mail('ja'));
  await c2.page.fill('input[type=password]', SENHA);
  await c2.page.click('button.g-btn.pri');
  await c2.page.waitForURL('**/gestao/app**', { timeout: 30000 });
  T.ok('entrou com a própria conta e ficou na equipe', ligado(idJa) !== 'sem');

  T.secao('o mesmo link com outra conta');
  await c2.page.evaluate(() => localStorage.clear());
  await c2.ctx.clearCookies();
  await c2.page.goto(`${B.BASE_URL}/gestao/entrar?convite=${codigoJa}`);
  await c2.page.waitForSelector('form.g-form');
  await c2.page.fill('input[type=email]', O.emails.dono);
  await c2.page.fill('input[type=password]', SENHA);
  await c2.page.click('button.g-btn.pri');
  await c2.page.waitForSelector('text=O convite não entrou', { timeout: 30000 });
  T.ok('outra conta: "O convite não entrou", com o motivo', /já foi usado|outro e-mail|não vale/.test(await c2.page.locator('main').textContent()));
  T.ok('… e a outra conta não entrou na equipe', B.num(`select count(*) from profissionais p join auth.users u on u.id = p.user_id where p.petshop_id='${L.P}' and u.email='${O.emails.dono}'`) === 0);
  await c2.ctx.close();
  await N.fecharNavegador();
}))();
