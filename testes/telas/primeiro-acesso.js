// Primeiro acesso de um dono novo até o primeiro resultado útil, contando toques e campos (Playwright).
// Celular (390): criar a conta, as duas perguntas do Mozart, "Começar já", o fim do guia ("Pronto em X minutos", "Marcar o
// primeiro horário", "Copiar meu link de agendamento") e o primeiro horário marcado com o pet novo cadastrado ali mesmo
// ("O primeiro horário … está marcado. Pronto em X minutos."). Computador (1366): o mesmo começo, até o link copiado.
// Teto de toques e campos: o caminho não pode voltar a crescer sem ninguém ver (antes desta mudança: 19 toques e 9 campos
// até o primeiro horário). A conta e a loja são apagadas no fim.
const fs = require('fs');
const path = require('path');
const B = require('../lib/base');
const N = require('../lib/navegador');
const { limpar, SENHA, DOMINIO } = require('../lib/semente');
const T = require('../lib/teste')('primeiro-acesso');

const SAIDA = path.join(__dirname, '..', 'saida');

async function percorrer(largura, { ateOHorario }) {
  const suf = B.sufixo();
  const email = `t-${suf}.dono@${DOMINIO}`;
  const L = { suf, P: null };
  T.depois(() => { if (!L.P) L.P = B.sql(`select coalesce((select p.petshop_id::text from profissionais p join auth.users u on u.id = p.user_id where u.email = '${email}' limit 1), '')`) || null; if (L.P) limpar(L); else B.sql(`delete from auth.users where email = '${email}'`); });
  const { ctx, page, erros } = await N.contexto(largura, largura < 500 ? 844 : 900);
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: B.BASE_URL }).catch(() => {});
  let toques = 0, campos = 0;
  const t0 = Date.now();
  const toque = async (loc) => { await loc.click(); toques++; await page.waitForTimeout(250); };
  const digita = async (loc, v) => { await loc.fill(v); campos++; };
  const foto = async (nome) => { if (process.env.FOTOS) { fs.mkdirSync(SAIDA, { recursive: true }); await page.screenshot({ path: path.join(SAIDA, `primeiro-acesso-${largura}-${nome}.png`), fullPage: false }); } };

  await page.goto(B.BASE_URL + '/gestao/criar-conta');
  await digita(page.locator('input[autocomplete=name]'), 'Dona Teste');
  await digita(page.locator('input[type=email]'), email);
  await digita(page.locator('input[type=password]').first(), SENHA);
  await toque(page.locator('input[type=checkbox]'));
  await toque(page.locator('button.g-btn.pri'));
  await page.waitForURL('**/gestao/comecar', { timeout: 30000 });
  await page.waitForSelector('.g-guia-h');
  await digita(page.locator('input[minlength="2"]'), `Banho Teste ${suf}`);
  await toque(page.locator('button.g-btn.pri', { hasText: 'Continuar' }));
  await toque(page.locator('.g-mod-op').first());
  await toque(page.locator('button.g-btn.pri', { hasText: 'Criar meu pet shop' }));
  await page.waitForURL('**/gestao/app**', { timeout: 30000 });
  L.P = B.sql(`select p.petshop_id from profissionais p join auth.users u on u.id = p.user_id where u.email = '${email}'`);

  const ja = page.locator('[data-teste=comecar-ja]');
  await ja.waitFor({ timeout: 30000 });
  await page.waitForTimeout(900);
  await foto('pergunta-cor');
  T.ok(`${largura}: "Começar já" aparece na primeira pergunta do guia`, await ja.isVisible());
  await toque(ja);
  await page.waitForSelector('.g-guia-ola', { timeout: 30000 });
  await page.waitForTimeout(600);
  await foto('fim-do-guia');
  const loja = B.sql(`select link_ativo || '|' || coalesce(guia_feito_em::text, '') || '|' || link_codigo from petshops where id = '${L.P}'`).split('|');
  T.ok(`${largura}: "Começar já" liga o link e marca o guia como feito`, ['t', 'true'].includes(loja[0]) && loja[1] !== '', loja);
  const pronto = await page.locator('[data-teste=pronto-em]').textContent().catch(() => '');
  T.ok(`${largura}: o fim do guia diz em quanto tempo ficou pronto`, /^Pronto em \d+ minutos?\.$/.test((pronto || '').trim()), pronto);
  const cta = page.locator('[data-teste=primeiro-horario]');
  T.ok(`${largura}: "Marcar o primeiro horário" é o botão principal do fim`, (await cta.isVisible()) && /\bpri\b/.test(await cta.getAttribute('class')));
  const copiar = page.locator('[data-teste=copiar-link]');
  T.ok(`${largura}: "Copiar meu link de agendamento" aparece com o link ligado`, await copiar.isVisible());
  T.ok(`${largura}: sem rolagem para o lado no fim do guia`, (await N.rolagemLateral(page)) <= 0);

  // primeiro resultado útil pelo link: um toque
  const antesDoLink = { toques, campos };
  await toque(copiar);
  await page.waitForTimeout(400);
  const copiado = await page.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '');
  T.ok(`${largura}: o link copiado é o link de agendamento da loja`, copiado.endsWith(`/gestao/agendar/${loja[2]}`) || (await copiar.textContent()).includes('Link copiado'), copiado);
  const linkEm = { toques, campos, s: (Date.now() - t0) / 1000 };
  console.log(`  ${largura}: link de agendamento copiado em ${linkEm.toques} toques e ${linkEm.campos} campos (${linkEm.s.toFixed(1)} s de máquina)`);
  T.ok(`${largura}: link pronto em até 10 toques e 4 campos (antes: o guia inteiro e "Mandar link" na tela Hoje)`, linkEm.toques <= 10 && linkEm.campos <= 4, linkEm);
  toques = antesDoLink.toques; campos = antesDoLink.campos; // o caminho do horário não conta o toque do link

  if (ateOHorario) {
    await toque(cta);
    await page.waitForURL('**/gestao/app/agenda**', { timeout: 30000 });
    await page.waitForSelector('.g-folha input[placeholder="Nome do pet ou do tutor"]', { timeout: 30000 });
    await digita(page.locator('.g-folha input[placeholder="Nome do pet ou do tutor"]'), 'Thor');
    await toque(page.locator('.g-folha button', { hasText: 'Cadastrar pet novo' }));
    await page.waitForSelector('#form-pet', { timeout: 30000 });
    await digita(page.locator('#form-pet input[maxlength="120"]'), 'Ana Souza');
    await toque(page.locator('.g-folha .g-chip', { hasText: 'Médio' }));
    await toque(page.locator('.g-folha .g-btn.pri', { hasText: 'Salvar' }));
    await page.waitForSelector('.g-folha button.g-chip', { timeout: 30000 });
    await toque(page.locator('.g-folha button.g-chip', { hasText: /^Banho$/ }).first());
    await page.waitForTimeout(500);
    // a hora livre de hoje, se ainda houver; senão amanhã (o teste roda a qualquer hora)
    let livre = page.locator('.g-folha button.g-chip', { hasText: /^\d\d:\d\d$/ });
    if (!(await livre.count())) {
      await digita(page.locator('.g-folha input[type=date]').first(), B.somaDias(B.hojeNo('America/Sao_Paulo'), 1));
      await page.waitForTimeout(600);
      livre = page.locator('.g-folha button.g-chip', { hasText: /^\d\d:\d\d$/ });
    }
    await toque(livre.first());
    await foto('marcar');
    await toque(page.locator('.g-folha .g-btn.pri', { hasText: 'Marcar' }));
    const aviso = page.locator('.g-agd-recem [data-teste=pronto-em]');
    await aviso.waitFor({ timeout: 30000 }).catch(() => {});
    await foto('marcado');
    const fim = { toques, campos, s: (Date.now() - t0) / 1000 };
    const n = Number(B.sql(`select count(*) from agendamentos where petshop_id = '${L.P}'`));
    T.ok(`${largura}: o primeiro horário ficou no banco, com o pet novo`, n === 1 && B.sql(`select count(*) from pets where petshop_id = '${L.P}' and nome = 'Thor'`) === '1', n);
    T.ok(`${largura}: o aviso do marcado diz "Pronto em X minutos"`, /O primeiro horário .* está marcado\. Pronto em \d+ minutos?\./.test((await aviso.textContent().catch(() => '')) || ''), await aviso.textContent().catch(() => ''));
    console.log(`  ${largura}: primeiro horário marcado em ${fim.toques} toques e ${fim.campos} campos (${fim.s.toFixed(1)} s de máquina)`);
    T.ok(`${largura}: primeiro horário em até 13 toques e 7 campos (antes: 19 toques e 9 campos)`, fim.toques <= 13 && fim.campos <= 7, fim);
  }
  T.ok(`${largura}: nenhum erro de página`, erros.length === 0, erros);
  await ctx.close();
}

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  T.secao('celular: conta nova até o primeiro horário');
  await percorrer(390, { ateOHorario: true });
  T.secao('computador: conta nova até o link copiado');
  await percorrer(1366, { ateOHorario: false });
  await N.fecharNavegador();
}))();
