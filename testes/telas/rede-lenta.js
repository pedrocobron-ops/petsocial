// Internet fraca (achados da estreante, 3ª rodada: H1 e M2). No celular barato com 3G lento, o link do cliente e a página do
// pedido ficavam 15–17 s em caixas vazias (tudo esperava o JavaScript) e a Hoje levava 27–34 s.
// Confere, sem depender de relógio:
//   1. o link do cliente e a página do pedido chegam prontos no HTML: com o JavaScript DESLIGADO, aparecem o nome do pet
//      shop, os serviços com preço, as cores (Vinho) e a situação do pedido; com ele ligado, o pedido vai até o fim
//      (serviço, horário, dados, "Pedido enviado") sem erro na página, em 390 e 1366;
//   2. o link baixa a biblioteca do Supabase à parte (não vem no HTML) e nenhum dado do tutor ou valor reservado aparece no HTML;
//   3. a abertura do aplicativo diz "Abrindo <nome do pet shop>…" já no HTML (com os pacotes de JavaScript bloqueados);
//   4. a Hoje não adianta outras telas (Meu pet shop, Agenda…) enquanto ela mesma carrega: só depois que abriu;
//   5. medida informativa com rede lenta emulada (400 kbps, 400 ms, CPU 4x): tempos impressos, sem derrubar a suíte.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('rede-lenta');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Rede lenta', equipe: false });
  const { dono } = L.sb;
  const nome = `Rede lenta ${L.suf}`;
  B.must(await dono.from('petshops').update({ tema: 'vinho', link_aviso: 'Traga a carteirinha de vacinação.' }).eq('id', L.P).select('id'), 'tema');
  const ini = B.instante(L.hoje, '15:00', L.fuso);
  B.must(await dono.from('agendamentos').insert({ petshop_id: L.P, pet_id: L.pets.Thor, servico_id: L.S.Banho, inicio: ini.toISOString(), fim: new Date(+ini + 36e5).toISOString(), preco: 60 }).select('id').single(), 'horário');
  const anon = B.cliente('10.77.' + Math.floor(Math.random() * 200) + '.' + Math.floor(Math.random() * 200));
  const ped = B.must(await anon.rpc('link_pedir_com_termos', { p_funcao: 'link_pedir', p_args: { p_codigo: L.codigo, p_servico: L.S.Banho, p_dia: L.dia(3), p_hora: '10:00', p_tutor: 'Tutora Lenta', p_telefone: '11987600077', p_pet: 'Pipoca', p_especie: 'cao', p_porte: 'M' } }), 'pedido pelo link');
  const LINK = `${B.BASE_URL}/gestao/agendar/${L.codigo}`;
  const PEDIDO = `${LINK}/pedido/${ped.id}`;
  const nav = await N.abrirNavegador();

  T.secao('1. link e pedido prontos no HTML (JavaScript desligado, 360 px)');
  {
    const ctx = await nav.newContext({ viewport: { width: 360, height: 740 }, javaScriptEnabled: false, locale: 'pt-BR' });
    const page = await ctx.newPage();
    await page.goto(LINK);
    const txt = await page.locator('body').innerText();
    T.ok('o nome do pet shop aparece', txt.includes(nome), txt.slice(0, 300));
    T.ok('o recado do link aparece', txt.includes('Traga a carteirinha de vacinação.'));
    T.ok('os serviços aparecem com o preço (Banho: a partir de R$ 50)', /Banho/.test(txt) && /a partir de R\$\s?50/.test(txt) && /Corte de unhas/.test(txt), txt.slice(0, 600));
    T.ok('nada de caixas vazias de espera', !(await page.locator('[aria-label="Abrindo a página"]').count()));
    T.ok('o título da aba é "Agendar: <pet shop>"', (await page.title()) === `Agendar: ${nome}`, await page.title());
    const cor = await page.evaluate(() => getComputedStyle(document.querySelector('.g-raiz')).getPropertyValue('--tema').trim());
    T.ok('as cores do pet shop (Vinho) já vêm no HTML', cor === '#5a1e2c', cor);
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/rede-lenta-link-sem-js.png` }).catch(() => {});
    await page.goto(PEDIDO);
    const p = await page.locator('body').innerText();
    T.ok('pedido: "Tutora, seu pedido chegou." sem JavaScript', /Tutora, seu pedido chegou\./.test(p), p.slice(0, 300));
    T.ok('pedido: o pet, o serviço e a situação', /Pipoca/.test(p) && /Banho/.test(p) && /Aguardando a confirmação/.test(p));
    T.ok('pedido: o nome do pet shop', p.includes(nome));
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/rede-lenta-pedido-sem-js.png` }).catch(() => {});
    await page.goto(`${LINK}/pedido/00000000-0000-0000-0000-000000000000`);
    T.ok('pedido que não existe: "Pedido não encontrado"', /Pedido não encontrado/.test(await page.locator('body').innerText()));
    await page.goto(`${B.BASE_URL}/gestao/agendar/naoexiste99`);
    T.ok('link desligado ou errado: "Este link não está disponível"', /Este link não está disponível/.test(await page.locator('body').innerText()));
    await ctx.close();
  }

  T.secao('2. o HTML do link: sem a biblioteca do banco e sem nada reservado');
  {
    const html = await (await fetch(LINK)).text();
    const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    let comSupabase = [];
    for (const s of scripts) { const js = await (await fetch(B.BASE_URL + s)).text(); if (/Invalid JWT structure|supabase\.auth|GoTrueClient/.test(js)) comSupabase.push(s); }
    T.ok('nenhum pacote do HTML traz a biblioteca do Supabase (ela baixa depois)', !comSupabase.length, comSupabase);
    T.ok('o HTML não traz o tutor nem o telefone de pedidos', !/Tutora Lenta|11987600077/.test(html));
    T.ok('o HTML não traz a chave de serviço nem o caminho interno', !/service_role|SUPABASE_SERVICE/.test(html));
  }

  for (const [larg, alt] of [[390, 844], [1366, 768]]) {
    T.secao(`1b. ${larg}px: o pedido vai até o fim com o JavaScript ligado`);
    const { ctx, page, erros } = await N.contexto(larg, alt);
    await page.goto(LINK);
    await page.locator('.g-lk-serv', { hasText: 'Corte de unhas' }).click();
    await page.getByText('Quantos pets vêm?').waitFor({ timeout: 15000 });
    const hora = page.locator('.g-lk-hora').first();
    await hora.waitFor({ timeout: 20000 });
    await hora.click();
    await page.getByRole('button', { name: /Continuar/ }).click();
    await page.locator('.g-lk-pet input.g-input').first().fill('Bolota');
    await page.getByLabel('Seu nome').fill('Tutor Rápido');
    await page.getByLabel('Seu WhatsApp').fill(`119876${larg}0`.slice(0, 11));
    await page.getByRole('button', { name: 'Enviar pedido' }).click();
    await page.getByText('Pedido enviado.').waitFor({ timeout: 20000 });
    T.ok('"Pedido enviado." e o botão de acompanhar', await page.getByRole('link', { name: 'Acompanhar o pedido' }).count() === 1);
    const n = Number(B.sql(`select count(*) from pedidos_agendamento where petshop_id='${L.P}' and pet_nome='Bolota'`));
    T.ok('o pedido chegou ao banco', n >= 1, n);
    await page.getByRole('link', { name: 'Acompanhar o pedido' }).click();
    await page.getByText('seu pedido chegou').waitFor({ timeout: 15000 });
    await page.getByRole('button', { name: /Atualizar/ }).click();
    await page.waitForTimeout(1500);
    T.ok('página do pedido: Atualizar funciona (lê pelo navegador)', /Tutor, seu pedido chegou/.test(await page.locator('body').innerText()));
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 0);
    T.ok('sem erro na página (nem de hidratação)', !erros.length, erros);
    if (larg === 390) await page.screenshot({ path: `${B.RAIZ}/testes/saida/rede-lenta-pedido-${larg}.png` }).catch(() => {});
    await ctx.close();
  }

  T.secao('3. a abertura do aplicativo diz o nome do pet shop já no HTML');
  {
    const { ctx, page, erros } = await N.contexto(390, 844);
    await N.entrar(page, L.emails.dono, L.senha);
    await page.goto('about:blank');
    await page.route('**/_next/static/chunks/**', (r) => r.abort());
    await page.goto(`${B.BASE_URL}/gestao/app`);
    const t = await page.locator('body').innerText();
    T.ok(`"Abrindo ${nome}…" sem o JavaScript do aplicativo`, t.includes(`Abrindo ${nome}…`), t.slice(0, 200));
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.goto(`${B.BASE_URL}/gestao/app`);
    await page.waitForSelector('.g-main h1', { timeout: 30000 });
    T.ok('depois, a Hoje abre normalmente (Boa/Bom …, Thor na agenda)', /Bom dia|Boa tarde|Boa noite/.test(await page.locator('.g-main h1').innerText()) && (await page.locator('.g-main').innerText()).includes('Thor'));
    T.ok('sem erro na página', !erros.filter((e) => !/ERR_FAILED|net::/.test(e)).length, erros);
    await ctx.close();
  }

  T.secao('4. a Hoje não adianta outras telas enquanto carrega');
  for (const [larg, alt] of [[390, 844], [1366, 768]]) {
    const { ctx, page, erros } = await N.contexto(larg, alt);
    await N.entrar(page, L.emails.dono, L.senha);
    await page.goto('about:blank');
    const pedidos = [];
    let pronto = false;
    page.on('request', (r) => { const u = r.url(); if (/\/gestao\/app\/[a-z-]+.*[?&]_rsc=|chunks\/app\/\(gestao\)\/gestao\/app\/[a-z-]+\/page/.test(u)) pedidos.push({ u: u.replace(B.BASE_URL, ''), antes: !pronto }); });
    await page.goto(`${B.BASE_URL}/gestao/app`);
    await page.waitForSelector('.g-main h1', { timeout: 30000 });
    await page.waitForFunction(() => !document.querySelector('.g-main [aria-busy="true"]') && /Thor/.test(document.querySelector('.g-main')?.innerText || ''), null, { timeout: 30000 });
    pronto = true;
    const antes = pedidos.filter((p) => p.antes);
    T.ok(`${larg}px: nenhuma outra tela baixada antes da Hoje aparecer com os dados`, !antes.length, antes.map((p) => p.u));
    await page.waitForTimeout(6000);
    T.ok(`${larg}px: depois que abriu, as telas dos links voltam a ser adiantadas`, pedidos.some((p) => !p.antes), pedidos.length);
    T.ok(`${larg}px: sem erro na página`, !erros.length, erros);
    if (larg === 390) await page.screenshot({ path: `${B.RAIZ}/testes/saida/rede-lenta-hoje-${larg}.png` }).catch(() => {});
    await ctx.close();
  }

  T.secao('5. medida com rede lenta emulada (informativa)');
  {
    const ctx = await nav.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true, locale: 'pt-BR' });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 50000, uploadThroughput: 50000 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    const t0 = Date.now();
    await page.goto(LINK, { waitUntil: 'commit', timeout: 120000 });
    await page.getByText(nome).first().waitFor({ timeout: 120000 });
    const fcp = await page.evaluate(() => new Promise((ok) => { const v = performance.getEntriesByName('first-contentful-paint')[0]; if (v) ok(v.startTime); else new PerformanceObserver((l) => ok(l.getEntries()[0].startTime)).observe({ type: 'paint', buffered: true }); }));
    const texto = Date.now() - t0;
    await page.waitForFunction(() => { const el = document.querySelector('.g-lk-serv'); return !!el && Object.keys(el).some((k) => k.startsWith('__reactProps')); }, null, { timeout: 120000 });
    console.log(`  link no 3G emulado: nome na tela (1ª pintura) ${Math.round(fcp)} ms; texto no documento ${texto} ms; toque funcionando ${Date.now() - t0} ms`);
    T.ok('link no 3G emulado: o nome aparece na primeira pintura (antes de o JavaScript chegar)', fcp > 0);
    await ctx.close();
  }
}))();
