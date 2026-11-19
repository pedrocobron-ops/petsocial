// Horário de cada serviço e da creche e do hotel (migração 20261242), no navegador, em 390x844 e 1366x900:
// - Meu pet shop, Horário de funcionamento: o pet shop fecha no domingo; em "Creche", "Horário próprio" e o domingo das 08:00
//   às 18:00, salvo no banco (o hotel continua "Igual ao pet shop");
// - a folha do serviço (Hidratação): "Horário próprio" só no domingo, das 09:00 às 15:00;
// - o link do cliente: com a Hidratação, só os domingos ficam abertos e os horários vão das 09:00 às 14:30;
// - o Mozart (roteiro de teste, GESTAO_MOZART_FALSO=1): "domingo a creche e o hotel abrem das 8h às 18h" vira dois cartões
//   com "Confirmar tudo (2)", e um toque grava os dois.
// Sem erro na página e sem rolagem para o lado.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('horario-servico-telas');

const foto = async (page, nome) => { if (process.env.FOTOS) await page.screenshot({ path: `${B.RAIZ}/testes/saida/horario-servico-${nome}.png`, fullPage: true }).catch(() => {}); };
const semana = (f) => JSON.stringify(Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), f(d)])));

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Horario telas', equipe: false, dados: false });
  const HIDRA = L.S['Hidratação'];
  const LOJA_H = semana((d) => (d === 0 ? null : { abre: '08:00', fecha: '18:00' }));
  const dia0 = (coluna, tabela = 'petshops', id = L.P) => B.sql(`select coalesce(${coluna} -> '0' ->> 'abre', '-') || '-' || coalesce(${coluna} -> '0' ->> 'fecha', '-') || '|' || coalesce(${coluna} -> '1' ->> 'abre', 'x') from ${tabela} where id='${id}'`);
  const esperar = async (f, ms = 10000) => { const fim = Date.now() + ms; while (Date.now() < fim) { if (f()) return true; await new Promise((ok) => setTimeout(ok, 250)); } return f(); };

  for (const [larg, alt] of [[390, 844], [1366, 900]]) {
    B.sql(`update petshops set horario='${LOJA_H}'::jsonb, horario_creche=null, horario_hotel=null where id='${L.P}'; update servicos set horario=null where id='${HIDRA}'`);
    const { ctx, page, erros } = await N.contexto(larg, alt);
    await N.entrar(page, L.emails.dono, L.senha);

    T.secao(`${larg}: Meu pet shop, o horário da creche`);
    await N.ir(page, '/gestao/app/meu-petshop');
    const creche = page.locator('[data-teste=horario-creche]');
    await creche.waitFor({ timeout: 20000 });
    T.ok('creche e hotel aparecem embaixo do horário do pet shop, "Igual ao pet shop"', (await page.locator('[data-teste=horario-hotel]').count()) === 1
      && (await creche.locator('button', { hasText: 'Igual ao pet shop' }).getAttribute('aria-pressed')) === 'true');
    await creche.locator('button', { hasText: 'Horário próprio' }).click();
    const domingo = creche.locator('.gj-dia', { has: page.locator('b', { hasText: /^domingo$/ }) });
    T.ok('o horário próprio começa igual ao pet shop (domingo fechado, sem almoço)', !(await domingo.locator('input[type=checkbox]').isChecked()) && (await creche.locator('text=Fecha para o almoço').count()) === 0);
    await domingo.locator('input[type=checkbox]').check();
    await domingo.locator('input[type=time]').nth(0).fill('08:00');
    await domingo.locator('input[type=time]').nth(1).fill('18:00');
    T.ok(`sem rolagem para o lado (${larg})`, (await N.rolagemLateral(page)) <= 1, await N.rolagemLateral(page));
    await foto(page, `${larg}-creche`);
    await creche.locator('button', { hasText: 'Salvar horário da creche' }).click();
    T.ok('salvo: a creche abre no domingo das 08:00 às 18:00 (e na segunda, como o pet shop)', await esperar(() => dia0('horario_creche') === '08:00-18:00|08:00'), dia0('horario_creche'));
    T.ok('o hotel continua igual ao pet shop', B.sql(`select coalesce(horario_hotel::text, '-') from petshops where id='${L.P}'`) === '-');

    T.secao(`${larg}: o horário próprio de um serviço`);
    await page.locator('.g-mp-serv', { hasText: 'Hidratação' }).first().click();
    const folha = page.locator('.g-folha').last();
    const campo = folha.locator('[data-teste=horario-do-servico]');
    await campo.waitFor({ timeout: 10000 });
    T.ok('a folha do serviço começa "Igual ao pet shop"', (await campo.locator('button', { hasText: 'Igual ao pet shop' }).getAttribute('aria-pressed')) === 'true');
    await campo.locator('button', { hasText: 'Horário próprio' }).click();
    for (const nome of ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']) {
      await campo.locator('.gj-dia', { has: page.locator('b', { hasText: new RegExp(`^${nome}$`) }) }).locator('input[type=checkbox]').uncheck();
    }
    const dom = campo.locator('.gj-dia', { has: page.locator('b', { hasText: /^domingo$/ }) });
    await dom.locator('input[type=checkbox]').check();
    await dom.locator('input[type=time]').nth(0).fill('09:00');
    await dom.locator('input[type=time]').nth(1).fill('15:00');
    T.ok(`sem rolagem para o lado na folha (${larg})`, (await N.rolagemLateral(page)) <= 1);
    await foto(page, `${larg}-servico`);
    await folha.locator('button.g-btn.pri', { hasText: 'Salvar' }).click();
    T.ok('salvo: a Hidratação só no domingo, das 09:00 às 15:00', await esperar(() => dia0('horario', 'servicos', HIDRA) === '09:00-15:00|x'), dia0('horario', 'servicos', HIDRA));
    await page.locator('.g-mp-serv', { hasText: 'Hidratação' }).first().waitFor({ timeout: 10000 });
    T.ok('a lista de serviços diz "horário próprio"', /horário próprio/.test(await page.locator('.g-mp-serv', { hasText: 'Hidratação' }).first().innerText()));

    T.secao(`${larg}: o link do cliente com a Hidratação`);
    const { ctx: ctx2, page: link, erros: erros2 } = await N.contexto(larg, alt);
    await link.goto(`${B.BASE_URL}/gestao/agendar/${L.codigo}`);
    const serv = link.locator('.g-lk-serv', { has: link.locator('b', { hasText: /^Hidratação$/ }) });
    await serv.waitFor({ timeout: 30000 });
    await serv.click();
    await link.locator('[data-teste=escolha-servicos]').getByRole('button', { name: 'Continuar' }).click();
    await link.locator('.g-lk-dia').first().waitFor({ timeout: 15000 });
    const abertos = await link.locator('.g-lk-dia:not([disabled])').evaluateAll((l) => l.map((b) => b.getAttribute('aria-label')));
    T.ok('só os domingos ficam abertos', abertos.length > 0 && abertos.every((a) => /^domingo/.test(a)), abertos);
    const respostas = link.waitForResponse((r) => /\/rpc\/link_horarios/.test(r.url()), { timeout: 20000 }).catch(() => null);
    await link.locator('.g-lk-dia:not([disabled])').nth(1).click();
    await respostas;
    await link.waitForFunction(() => !document.querySelector('.g-lk-hora-esq') && document.querySelectorAll('.g-lk-hora').length > 0, null, { timeout: 20000 });
    const hs = (await link.locator('.g-lk-hora').allInnerTexts()).map((h) => h.slice(0, 5)).sort();
    T.ok('os horários vão das 09:00 às 14:30', hs[0] === '09:00' && hs[hs.length - 1] === '14:30', hs);
    T.ok(`sem rolagem para o lado no link (${larg})`, (await N.rolagemLateral(link)) <= 1);
    await foto(link, `${larg}-link`);
    T.ok('nenhum erro no link', erros2.length === 0, erros2.slice(0, 3));
    await ctx2.close();

    T.secao(`${larg}: o Mozart muda a creche e o hotel juntos`);
    B.sql(`update petshops set horario_creche=null, horario_hotel=null where id='${L.P}'`);
    await N.ir(page, '/gestao/app');
    await page.locator(larg < 500 ? '.g-aba-mic' : '.g-fab').first().click();
    const painel = page.locator('.g-ass-painel[aria-label="Conversa com o Mozart"]');
    await painel.waitFor({ timeout: 10000 });
    await painel.locator('textarea').fill('Domingo a creche e o hotel abrem das 8h às 18h');
    await painel.locator('textarea').press('Enter');
    const tudo = painel.locator('button', { hasText: 'Confirmar tudo (2)' });
    await tudo.waitFor({ timeout: 20000 });
    await page.waitForFunction(() => !document.querySelector('.g-ass-painel .g-bolha.pensa'), null, { timeout: 15000 });
    const texto = (await painel.locator('.g-ass-conversa').innerText()).replace(/ /g, ' ');
    T.ok('dois cartões: "Mudar horário da creche" e "Mudar horário do hotel"', /Mudar horário da creche/.test(texto) && /Mudar horário do hotel/.test(texto), texto.slice(0, 600));
    T.ok('o cartão diz que antes era igual ao pet shop e o domingo novo', /igual ao pet shop/.test(texto) && /domingo[\s\S]{0,40}fechado → 8h às 18h/.test(texto), texto.slice(0, 600));
    T.ok('nada gravado antes de confirmar', B.sql(`select coalesce(horario_creche::text, '-') || coalesce(horario_hotel::text, '-') from petshops where id='${L.P}'`) === '--');
    T.ok(`sem rolagem para o lado no Mozart (${larg})`, (await N.rolagemLateral(page)) <= 1);
    await foto(page, `${larg}-mozart`);
    await tudo.click();
    await page.waitForFunction(() => document.querySelectorAll('.g-ass-painel .g-proposta.feita').length === 2, null, { timeout: 20000 });
    T.ok('um toque grava os dois: creche e hotel no domingo das 08:00 às 18:00', dia0('horario_creche') === '08:00-18:00|08:00' && dia0('horario_hotel') === '08:00-18:00|08:00', [dia0('horario_creche'), dia0('horario_hotel')]);
    T.ok('o pet shop continua fechado no domingo', B.sql(`select coalesce(horario -> '0' ->> 'abre', 'fechado') from petshops where id='${L.P}'`) === 'fechado');
    T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 3));
    await ctx.close();
  }
}))();
