// Rodada 9 (N10), vendas, no navegador (390 e 1366):
//   - página de venda: imagem, título e descrição de compartilhar; ordem (exemplo do boletim → preços → o que não faz → resto);
//     preços perto do alto no celular; lista de funções recolhida em "Ver todas as funções" (mas inteira no HTML); perguntas em
//     quatro blocos; devolução em 7 dias, "nada é cobrado no fim do teste" e "as formas de pagamento aparecem na tela da Cakto"
//     embaixo dos preços; nada de "em breve";
//   - do link do vendedor (?v=…&utm_source=…) até o pet shop criado: a origem fica gravada; o WhatsApp aparece aberto no começo
//     guiado, com o "quero ajuda da equipe" (desmarcado, só marca com o telefone);
//   - Assinatura: sem link de pagamento, "Assinar pelo WhatsApp" (nunca "Disponível em breve"); com link, o cupom entra no
//     endereço junto do e-mail e da marca do pet shop; conselho do plano; quem vende só quando preenchido;
//     teste vencido e assinatura atrasada (aviso com a data e, passado o prazo, só para consulta);
//   - Hoje: "Faltam R$ X para cobrir as contas fixas deste mês";
//   - painel do administrador, aba Vendas: gravar quem vende e ver o pet shop pelo vendedor.
const B = require('../lib/base');
const { criarLoja, limpar, SENHA, DOMINIO } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('vendas-tela');

const limpo = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
const foto = async (page, nome, inteira = false) => { if (process.env.FOTOS) await page.screenshot({ path: `${B.RAIZ}/testes/saida/vendas-${nome}.png`, fullPage: inteira }); };

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);

  /* ---------- 1. o HTML da página de venda e do cadastro ---------- */
  T.secao('compartilhar: imagem, título e descrição');
  const meta = (html, prop) => (new RegExp(`<meta (?:property|name)="${prop}" content="([^"]*)"`).exec(html) ?? [])[1]?.replace(/&amp;/g, '&');
  for (const [rota, nome] of [['/gestao', 'página de venda'], ['/gestao/criar-conta', 'cadastro']]) {
    const html = await (await fetch(B.BASE_URL + rota)).text();
    const img = meta(html, 'og:image'), ti = meta(html, 'og:title'), de = meta(html, 'og:description');
    T.ok(`${nome}: og:image é a imagem de compartilhar, com endereço inteiro`, /^https?:\/\/.+\/gestao\/compartilhar\.jpg$/.test(img ?? ''), img);
    T.ok(`${nome}: imagem de 1200 x 630`, meta(html, 'og:image:width') === '1200' && meta(html, 'og:image:height') === '630');
    T.ok(`${nome}: og:title até 60 letras`, !!ti && ti.length <= 60, ti);
    T.ok(`${nome}: og:description até 155 letras`, !!de && de.length <= 155, `${de?.length}: ${de}`);
    T.ok(`${nome}: og:type, og:site_name, og:locale e twitter:image`, meta(html, 'og:type') === 'website' && meta(html, 'og:site_name') === 'Maestro Pet Gestão' && meta(html, 'og:locale') === 'pt_BR' && /compartilhar\.jpg$/.test(meta(html, 'twitter:image') ?? ''));
    if (rota === '/gestao') {
      const titulo = (/<title>([^<]*)<\/title>/.exec(html) ?? [])[1];
      T.ok('página de venda: <title> até 60 e descrição até 155', !!titulo && titulo.length <= 60 && (meta(html, 'description') ?? '').length <= 155, [titulo, meta(html, 'description')]);
      T.ok('página de venda: aparece no Google (index)', /<meta name="robots" content="index, follow"/.test(html));
      T.ok('no HTML: a lista inteira de funções, mesmo recolhida', /Leva e traz/.test(html) && /Preço travado no caixa/.test(html) && /Clientes da sua planilha/.test(html));
      T.ok('no HTML: todas as respostas das perguntas', /devolvemos o valor inteiro desse pagamento/.test(html) && /Não publicamos número de clientes nem depoimentos/.test(html) && /não emite nota fiscal/i.test(html));
      const ld = (/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html) ?? [])[1];
      let dados = null; try { dados = JSON.parse(ld); } catch { /* fica null */ }
      T.ok('dados para o Google: produto com 9 preços e as perguntas, sem nota nem avaliação', Array.isArray(dados) && dados[0]?.offers?.length === 9 && dados[1]?.mainEntity?.length >= 30 && !/aggregateRating|review/i.test(ld ?? ''), ld?.slice(0, 200));
      T.ok('sem "em breve", "ainda não abriu", "lançamento" ou "primeiros clientes" na página', !/em breve|ainda não abriu|lançamento|primeiros clientes/i.test(html.replace(/<script[\s\S]*?<\/script>/g, '')));
    }
  }
  const im = await fetch(B.BASE_URL + '/gestao/compartilhar.jpg');
  T.ok('a imagem abre (200, JPEG)', im.status === 200 && /image\/jpeg/.test(im.headers.get('content-type') ?? ''), im.status);

  /* ---------- 2. a página no navegador ---------- */
  for (const [larg, alt] of [[390, 844], [1366, 768]]) {
    T.secao(`página de venda (${larg})`);
    const { ctx, page, erros } = await N.contexto(larg, alt);
    await N.ir(page, '/gestao', '.gp');
    const m = await page.evaluate(() => {
      const topo = (s) => { const e = document.querySelector(s); return e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : -1; };
      return {
        altura: document.documentElement.scrollHeight,
        boletim: topo('#destaques'), plano: topo('#plano'), naoFaz: topo('#nao-faz'), dif: topo('#diferencas'), funcoes: topo('#todas-as-funcoes'), faq: topo('#perguntas'),
        botao: (() => { const b = document.querySelector('.gp-capa .gp-btn.pri.grande'); const r = b?.getBoundingClientRect(); return r ? Math.round(r.bottom) : -1; })(),
        gradeAberta: !!document.querySelector('.gp-inclui-mais')?.open,
        grupos: [...document.querySelectorAll('.gp-faq-grupo h3')].map((h) => h.textContent),
        perguntas: document.querySelectorAll('.gp-faq details').length,
        fotos: document.querySelectorAll('#destaques .gp-bm-fotos img').length,
      };
    });
    T.ok('ordem: exemplo do boletim → preços → o que não faz → o que muda → todas as funções → perguntas',
      m.boletim > 0 && m.boletim < m.plano && m.plano < m.naoFaz && m.naoFaz < m.dif && m.dif < m.funcoes && m.funcoes < m.faq, m);
    T.ok('o exemplo do boletim (antes e depois) vem antes dos preços, com as duas fotos', m.fotos === 2, m.fotos);
    if (larg === 390) {
      T.ok(`celular: os preços começam antes da 6ª tela (eram na 18ª) — em ${Math.round(m.plano / alt * 10) / 10} telas`, m.plano > 0 && m.plano < alt * 6, m.plano);
      T.ok(`celular: a página ficou com menos de 29.000 px (eram 34.000) — ${m.altura} px`, m.altura < 29000, m.altura);
    } else {
      T.ok(`computador 1366 x 768: o botão principal cabe na primeira tela (fim em ${m.botao} px)`, m.botao > 0 && m.botao <= alt, m.botao);
    }
    T.ok('a lista de funções começa recolhida', m.gradeAberta === false);
    T.ok('perguntas em quatro blocos', m.grupos.join(' | ') === 'Preço e pagamento | Começar | O que o sistema faz | Seus dados', m.grupos);
    T.ok('mais de 35 perguntas na página', m.perguntas > 35, m.perguntas);
    const regras = limpo(await page.locator('[data-teste=regras-dos-planos]').innerText());
    T.ok('embaixo dos preços: nada é cobrado no fim do teste', /Nada é cobrado sozinho no fim do teste/.test(regras), regras);
    T.ok('embaixo dos preços: devolução em 7 dias, inclusive 3 e 6 meses', /em até 7 dias depois do primeiro pagamento, devolvemos o valor inteiro, inclusive nos planos de 3 e 6 meses/.test(regras));
    T.ok('embaixo dos preços: as formas de pagamento aparecem na tela da Cakto (sem prometer Pix nem cartão)', /As formas de pagamento aparecem na tela da Cakto/.test(regras) && !/pix|boleto/i.test(regras));
    const taxa = page.locator('.gp-taxa');
    T.ok('embaixo dos preços: a linha discreta da taxa de serviço, sem nome de empresa', (await taxa.count()) === 1 && limpo(await taxa.innerText()) === 'Taxa de serviço do pagamento mostrada antes de concluir.'
      && parseFloat(await taxa.evaluate((e) => getComputedStyle(e).fontSize)) < 15, await taxa.innerText().catch(() => ''));
    T.ok('embaixo dos preços: cupom é da equipe, com validade', /cupom\?.*equipe de atendimento.*data combinada/i.test(regras));
    T.ok('legenda do exemplo: fotos e nomes ilustrativos', /Boletim de exemplo\. Fotos e nomes ilustrativos\./.test(limpo(await page.locator('#destaques').innerText())));
    const capa = limpo(await page.locator('.gp-capa-texto').innerText());
    T.ok('capa: "Nada é cobrado no fim do teste" ao lado do botão e o preço à vista', /Sem cartão\. Nada é cobrado no fim do teste\./.test(capa) && /Planos desde R\$\s?\d+ por mês/.test(capa), capa);
    await foto(page, `pagina-capa-${larg}`);
    // "Ver todas as funções" abre a lista
    const resumo = page.locator('.gp-inclui-mais summary');
    await resumo.scrollIntoViewIfNeeded();
    T.ok('"Ver todas as funções" diz quantas são', /Ver todas as funções \(\d+\)/.test(limpo(await resumo.innerText())), await resumo.innerText());
    await page.evaluate(() => document.querySelector('.gp-inclui-mais summary').click());
    await page.waitForTimeout(300);
    T.ok('… e abre a grade inteira', (await page.locator('.gp-inclui-mais .gp-grade li').count()) >= 36 && await page.locator('.gp-inclui-mais .gp-grade li').first().isVisible());
    await page.evaluate(() => document.querySelector('.gp-faq details summary').click());
    T.ok('uma pergunta abre com um toque', await page.locator('.gp-faq details[open] p').first().isVisible());
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 1, await N.rolagemLateral(page));
    T.ok('sem erro na página', erros.length === 0, erros.slice(0, 3));
    await page.locator('#plano').scrollIntoViewIfNeeded();
    await foto(page, `pagina-precos-${larg}`);
    await ctx.close();
  }

  /* ---------- 3. do link do vendedor até o pet shop criado ---------- */
  T.secao('link do vendedor → cadastro → pet shop (390)');
  const suf = B.sufixo();
  const email = `t-${suf}.dono@${DOMINIO}`;
  const Nova = { suf, P: null };
  T.depois(() => { if (!Nova.P) Nova.P = B.sql(`select coalesce((select p.petshop_id::text from profissionais p join auth.users u on u.id = p.user_id where u.email = '${email}' limit 1), '')`) || null; if (Nova.P) limpar(Nova); else B.sql(`delete from auth.users where email = '${email}'`); });
  {
    const { ctx, page, erros } = await N.contexto(390, 844);
    await N.ir(page, '/gestao?v=Ana-Teste&utm_source=whatsapp&utm_campaign=novembro', '.gp');
    const guardada = await page.evaluate(() => JSON.parse(localStorage.getItem('maestro-gestao-origem') ?? 'null'));
    T.ok('a página de venda guarda o código do vendedor e a campanha', guardada?.vendedor === 'ana-teste' && guardada.utm?.utm_source === 'whatsapp', guardada);
    T.ok('o botão principal leva ao cadastro', (await page.locator('.gp-capa .gp-btn.pri.grande').getAttribute('href')) === '/gestao/criar-conta');
    await page.goto(B.BASE_URL + '/gestao/criar-conta?v=outra');
    await page.fill('input[autocomplete=name]', 'Dona Vendas');
    await page.fill('input[autocomplete=email]', email);
    await page.fill('input[type=email][autocomplete=off]', email);
    await page.locator('input[type=password]').first().fill(SENHA);
    await page.locator('input[type=checkbox]').check();
    await page.click('button.g-btn.pri');
    await page.waitForURL('**/gestao/comecar', { timeout: 30000 });
    await page.waitForSelector('.g-guia-h');
    const zap = page.locator('input[name=whatsapp]'), ajuda = page.locator('input[name=quero_ajuda]');
    T.ok('o WhatsApp do pet shop aparece aberto na primeira pergunta (não dentro de "se quiser")', await zap.isVisible());
    T.ok('"Quero ajuda da equipe" começa desmarcado e só marca com o telefone', !(await ajuda.isChecked()) && await ajuda.isDisabled());
    T.ok('o texto diz para que serve e que não há propaganda', /Não mandamos propaganda/.test(limpo(await page.locator('.g-guia-corpo').innerText())));
    await page.fill('input[minlength="2"]', `Banho Vendas ${suf}`);
    await zap.fill('11988887777');
    await ajuda.check();
    await foto(page, 'comecar-390');
    await page.locator('button.g-btn.pri', { hasText: 'Continuar' }).click();
    await page.locator('.g-mod-op').first().click();
    await page.locator('button.g-btn.pri', { hasText: 'Continuar' }).click();
    await page.waitForURL('**/gestao/app**', { timeout: 30000 });
    Nova.P = B.sql(`select p.petshop_id from profissionais p join auth.users u on u.id = p.user_id where u.email = '${email}'`);
    await page.waitForTimeout(800);
    const o = JSON.parse(B.sql(`select coalesce((select row_to_json(x)::text from petshops_origem x where petshop_id='${Nova.P}'), 'null')`));
    T.ok('o pet shop ficou com o primeiro vendedor do link (ana-teste, não o segundo) e a campanha', o?.vendedor === 'ana-teste' && o.utm?.utm_source === 'whatsapp' && o.utm?.utm_campaign === 'novembro', o);
    T.ok('o pedido de ajuda ficou gravado, com a hora', o?.quer_ajuda === true && !!o.quer_ajuda_em, o);
    T.ok('o telefone ficou no pet shop', B.sql(`select telefone from petshops where id='${Nova.P}'`) === '11988887777');
    T.ok('depois de gravar, o aparelho esquece a origem', (await page.evaluate(() => localStorage.getItem('maestro-gestao-origem'))) === null);
    T.ok('sem erro na página', erros.length === 0, erros.slice(0, 3));
    await ctx.close();
  }

  /* ---------- 4. Assinatura, Hoje e avisos ---------- */
  const L = await criarLoja(T, { nome: 'Assina tela', equipe: false });
  const FILTRO = `chave like 'vendedor\\_%'`;
  const antes = B.sql(`select coalesce(json_agg(c), '[]') from config_interna c where ${FILTRO}`);
  T.depois(() => B.sql(`delete from config_interna where ${FILTRO}; insert into config_interna select * from json_populate_recordset(null::config_interna, ${B.q(antes)}::json);`));
  B.sql(`delete from config_interna where ${FILTRO}`);
  const LINKS = Object.fromEntries(['solo', 'equipe', 'petshop'].flatMap((p) => [1, 3, 6].map((mm) => [`${p}:${mm}`, `https://pay.cakto.com.br/teste-${p}-${mm}`])));
  // a configuração da Cakto é global e outros testes mexem nela: aqui a resposta de gestao_assinatura é trocada no navegador
  const comConfig = (page, cfg) => page.route('**/rest/v1/rpc/gestao_assinatura*', (r) => r.fulfill({ json: { atraso_dias: 10, vendedor: {}, ...cfg } }));

  for (const larg of [390, 1366]) {
    const { ctx, page, erros } = await N.contexto(larg, larg < 500 ? 844 : 900);
    await comConfig(page, { aberta: false, links: {} });
    await N.entrar(page, L.emails.dono, L.senha);

    T.secao(`Assinatura sem link de pagamento (${larg})`);
    B.sql(`update petshops set status='teste', teste_ate = now() + interval '5 days' where id='${L.P}'`);
    await N.ir(page, '/gestao/app/assinatura', '.g-as-planos');
    let txt = limpo(await page.locator('.g-main').innerText());
    T.ok('nada de "Disponível em breve", "ainda não abriu" nem "até a assinatura abrir"', !/em breve|ainda não abriu|assinatura abrir|planos estiverem disponíveis/i.test(txt), txt.slice(0, 300));
    T.ok('nenhum botão de assinar apagado', (await page.locator('.g-as-plano button[disabled]').count()) === 0);
    const zapSolo = await page.locator('[data-teste=assinar-solo]').getAttribute('href');
    T.ok('o botão é "Assinar pelo WhatsApp", com a mensagem pronta (plano, pet shop, e-mail)', /Assinar pelo WhatsApp/.test(txt) && /^https:\/\/wa\.me\/\d+\?text=/.test(zapSolo ?? '')
      && /Plano Solo, mensal/.test(decodeURIComponent(zapSolo)) && decodeURIComponent(zapSolo).includes(L.emails.dono), zapSolo);
    T.ok('o teste diz até quando vai, que nada é cobrado e o que acontece depois', /Teste grátis: faltam 5 dias/.test(txt) && /Nada é cobrado sozinho no fim do teste/.test(txt) && /a conta fica só para consulta/.test(txt));
    T.ok('conselho do plano: só o dono entra → Solo, e quem só aparece na agenda não conta', /Hoje só você entra no sistema: o plano Solo \(1 login\) serve\./.test(limpo(await page.locator('[data-teste=conselho-do-plano]').innerText())) && /só aparece na agenda/.test(txt), await page.locator('[data-teste=conselho-do-plano]').innerText());
    T.ok('o cartão do Solo vem marcado como o que serve', /Serve para a sua equipe de hoje/.test(limpo(await page.locator('.g-as-plano.realce').innerText())) && /Solo/.test(limpo(await page.locator('.g-as-plano.realce').innerText())));
    const regras = limpo(await page.locator('[data-teste=regras-da-assinatura]').innerText());
    T.ok('regras: devolução em 7 dias, sem fidelidade, formas de pagamento na tela da Cakto', /em até 7 dias depois do primeiro pagamento, devolvemos o valor inteiro/.test(regras) && /Sem fidelidade/.test(regras) && /aparecem na tela da Cakto/.test(regras), regras);
    T.ok('sem nome nem documento gravados, a linha de quem vende não aparece', (await page.locator('[data-teste=vendedor]').count()) === 0);
    await page.getByRole('button', { name: 'Tenho um cupom' }).click();
    await page.fill('input[name=cupom]', 'bia15');
    await page.locator('.g-seg button', { hasText: '6 meses' }).click();
    await page.waitForFunction(() => /6%20meses/.test(document.querySelector('[data-teste=assinar-equipe]')?.getAttribute('href') ?? ''), null, { timeout: 10000 }).catch(() => {});
    const zapCupom = decodeURIComponent(await page.locator('[data-teste=assinar-equipe]').getAttribute('href'));
    T.ok('pelo WhatsApp, o cupom e o período vão na mensagem', /Plano Equipe, de 6 meses/.test(zapCupom) && /Tenho o cupom BIA15/.test(zapCupom), zapCupom);
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 1);
    await foto(page, `assinatura-whatsapp-${larg}`, true);

    T.secao(`Assinatura: o pagamento ligado com o aplicativo já aberto (${larg})`);
    T.ok('a linha da taxa de serviço aparece embaixo dos planos', limpo(await page.locator('.g-as-taxa').innerText()) === 'Taxa de serviço do pagamento mostrada antes de concluir.');
    await N.ir(page, '/gestao/app', '.g-main');
    await page.unroute('**/rest/v1/rpc/gestao_assinatura*');
    await comConfig(page, { aberta: true, links: LINKS });
    // sem recarregar: o menu leva à Assinatura dentro do aplicativo, como quem já estava com ele aberto
    await page.evaluate(() => document.querySelector('a[href="/gestao/app/assinatura"]').click());
    await page.waitForSelector('.g-as-planos');
    await page.waitForFunction((l) => (document.querySelector('[data-teste=assinar-solo]')?.getAttribute('href') ?? '').startsWith(l), LINKS['solo:1'], { timeout: 15000 }).catch(() => {});
    const hrefSemRecarregar = await page.locator('[data-teste=assinar-solo]').getAttribute('href');
    T.ok('o botão vira "Assinar" com o link de pagamento, sem apertar F5', (hrefSemRecarregar ?? '').startsWith(LINKS['solo:1']) && !/Assinar pelo WhatsApp/.test(limpo(await page.locator('.g-as-planos').innerText())), hrefSemRecarregar);
    await page.unroute('**/rest/v1/rpc/gestao_assinatura*');
    await comConfig(page, { aberta: false, links: {} });

    T.secao(`Assinatura com link de pagamento e cupom (${larg})`);
    await page.unroute('**/rest/v1/rpc/gestao_assinatura*');
    await comConfig(page, { aberta: true, links: LINKS });
    B.sql(`insert into config_interna (chave, valor) values ('vendedor_nome', 'Empresa de Teste ${L.suf} Ltda'), ('vendedor_documento', '00.000.000/0001-00') on conflict (chave) do update set valor = excluded.valor`);
    await N.ir(page, '/gestao/app/assinatura', '.g-as-planos');
    await page.locator('[data-teste=assinar-solo]').waitFor();
    await page.waitForFunction(() => /callback=/.test(document.querySelector('[data-teste=assinar-solo]')?.getAttribute('href') ?? ''), null, { timeout: 15000 }).catch(() => {});
    let u = new URL(await page.locator('[data-teste=assinar-solo]').getAttribute('href'));
    const marca = u.searchParams.get('callback');
    T.ok('sem cupom: o link leva o e-mail (duas vezes) e a marca assinada do pet shop', u.origin + u.pathname === LINKS['solo:1'] && u.searchParams.get('email') === L.emails.dono && u.searchParams.get('confirmEmail') === L.emails.dono
      && new RegExp(`^${L.P}\\.[0-9a-f]{32}$`).test(marca ?? '') && !u.searchParams.has('coupon'), u.toString());
    await page.getByRole('button', { name: 'Tenho um cupom' }).click();
    await page.fill('input[name=cupom]', ' ana10 ');
    await page.waitForFunction(() => /coupon=/.test(document.querySelector('[data-teste=assinar-solo]')?.getAttribute('href') ?? ''), null, { timeout: 10000 }).catch(() => {});
    u = new URL(await page.locator('[data-teste=assinar-solo]').getAttribute('href'));
    T.ok('com cupom: entra coupon=ANA10 e o e-mail e a marca NÃO somem', u.searchParams.get('coupon') === 'ANA10' && u.searchParams.get('email') === L.emails.dono && u.searchParams.get('confirmEmail') === L.emails.dono && u.searchParams.get('callback') === marca, u.toString());
    T.ok('a tela avisa que o desconto aparece antes de pagar e que código vencido segue pelo preço normal', /O cupom ANA10 vai junto.*antes de você pagar.*preço normal/.test(limpo(await page.locator('.g-as-cupom').innerText())));
    await page.locator('.g-seg button', { hasText: '3 meses' }).click();
    await page.waitForFunction(() => /teste-petshop-3/.test(document.querySelector('[data-teste=assinar-petshop]')?.getAttribute('href') ?? ''), null, { timeout: 10000 }).catch(() => {});
    u = new URL(await page.locator('[data-teste=assinar-petshop]').getAttribute('href'));
    T.ok('trocar o período mantém o cupom no link do plano certo', u.origin + u.pathname === LINKS['petshop:3'] && u.searchParams.get('coupon') === 'ANA10' && u.searchParams.get('callback') === marca, u.toString());
    await page.getByRole('button', { name: 'Não tenho cupom' }).click();
    await page.waitForFunction(() => !/coupon=/.test(document.querySelector('[data-teste=assinar-petshop]')?.getAttribute('href') ?? ''), null, { timeout: 10000 }).catch(() => {});
    u = new URL(await page.locator('[data-teste=assinar-petshop]').getAttribute('href'));
    T.ok('"Não tenho cupom" tira o cupom do link', !u.searchParams.has('coupon') && u.searchParams.get('callback') === marca);
    T.ok('quem vende aparece, com CNPJ', limpo(await page.locator('[data-teste=vendedor]').innerText()) === `Vendido por Empresa de Teste ${L.suf} Ltda, CNPJ 00.000.000/0001-00.`, await page.locator('[data-teste=vendedor]').innerText().catch(() => ''));
    await foto(page, `assinatura-cupom-${larg}`, true);
    B.sql(`delete from config_interna where ${FILTRO}`);

    T.secao(`teste vencido (${larg})`);
    B.sql(`update petshops set teste_ate = now() - interval '2 hours' where id='${L.P}'`);
    await N.ir(page, '/gestao/app/assinatura', '.g-as-planos');
    txt = limpo(await page.locator('.g-main').innerText());
    T.ok('diz que terminou e que a conta está só para consulta (nunca "continua usando normalmente")', /Teste grátis: terminou em/.test(txt) && /A conta está só para consulta/.test(txt) && !/continua usando (tudo )?normalmente/.test(txt), txt.slice(0, 300));
    await N.ir(page, '/gestao/app');
    txt = limpo(await page.locator('.g-main').innerText());
    T.ok('Hoje: o cartão do teste diz o mesmo', /Seu teste grátis terminou/.test(txt) && /só para consulta/.test(txt) && !/até a assinatura abrir/.test(txt), txt.slice(0, 300));

    T.secao(`assinatura atrasada (${larg})`);
    B.sql(`update petshops set status='ativa', teste_ate = now() - interval '30 days', assinatura_desde = now() - interval '35 days', pago_ate = now() - interval '1 day' where id='${L.P}'; update petshops set status='atrasada' where id='${L.P}'`);
    const trava = new Date(Date.now() + 10 * 864e5).toLocaleDateString('pt-BR');
    await N.ir(page, '/gestao/app/assinatura', '[data-teste=aviso-de-atraso]');
    await page.waitForFunction(() => /Seu acesso continua até/.test(document.querySelector('[data-teste=aviso-de-atraso]')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
    txt = limpo(await page.locator('[data-teste=aviso-de-atraso]').innerText());
    T.ok(`Assinatura: "Seu acesso continua até ${trava} (10 dias…)" e o que acontece depois`, txt.includes(`Seu acesso continua até ${trava} (10 dias depois da cobrança que não passou)`) && /fica só para consulta/.test(txt), txt);
    const aviso = limpo(await page.locator('.g-aviso[role=alert]').first().innerText());
    T.ok('aviso no alto de todas as telas, com a data', aviso.includes(`Acerte até ${trava}`) && /só para consulta/.test(aviso), aviso);
    await foto(page, `atrasada-prazo-${larg}`);
    B.sql(`update assinatura_atrasos set desde = now() - interval '11 days' where petshop_id='${L.P}'`);
    await N.ir(page, '/gestao/app/assinatura', '[data-teste=aviso-de-atraso]');
    await page.waitForFunction(() => /só para consulta/.test(document.querySelector('.g-as-estado h2')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
    txt = limpo(await page.locator('.g-as-estado').innerText());
    T.ok('passado o prazo: "Assinatura atrasada: a conta está só para consulta", com o caminho para acertar', /Assinatura atrasada: a conta está só para consulta/.test(txt) && /assim que o pagamento entrar, tudo volta a funcionar/.test(txt), txt);
    await N.ir(page, '/gestao/app/clientes');
    await page.waitForFunction(() => /prazo para acertar passou/.test(document.querySelector('.g-main')?.textContent ?? ''), null, { timeout: 15000 }).catch(() => {});
    txt = limpo(await page.locator('.g-main').innerText());
    T.ok('nas outras telas: aviso de que o prazo passou e a conta só para consulta', /prazo para acertar passou/.test(txt) && /só para consulta até o pagamento entrar/.test(txt), txt.slice(0, 300));
    await foto(page, `atrasada-travada-${larg}`);
    B.sql(`update petshops set status='ativa', pago_ate = now() + interval '30 days' where id='${L.P}'`);

    T.secao(`Hoje: contas fixas (${larg})`);
    await page.route('**/rest/v1/rpc/contas_fixas_resumo*', (r) => r.fulfill({ json: { de: '2026-11-01', ate: '2026-11-18', contas: 4, nao_mensais: 0, total_mensal: 4759, faturamento_mes: 2136, pct: 44, falta: 2623 } }));
    await N.ir(page, '/gestao/app');
    const linha = page.locator('[data-teste=contas-fixas-hoje]');
    await linha.waitFor({ timeout: 20000 }).catch(() => {});
    txt = limpo(await linha.innerText().catch(() => ''));
    T.ok('"Faltam R$ 2.623,00 para cobrir as contas fixas deste mês", com as duas parcelas da conta', /Faltam R\$\s2\.623,00 para cobrir as contas fixas deste mês\./.test(txt) && /Contas fixas: R\$\s4\.759,00 por mês/.test(txt) && /Já faturou R\$\s2\.136,00/.test(txt), txt);
    T.ok('… e leva ao quadro do Financeiro', (await linha.getAttribute('href')) === '/gestao/app/financeiro?aba=fixas');
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 1);
    await linha.scrollIntoViewIfNeeded().catch(() => {});
    await foto(page, `hoje-contas-fixas-${larg}`);
    await page.unroute('**/rest/v1/rpc/contas_fixas_resumo*');
    await page.route('**/rest/v1/rpc/contas_fixas_resumo*', (r) => r.fulfill({ json: { de: '2026-11-01', ate: '2026-11-18', contas: 0, nao_mensais: 0, total_mensal: 0, faturamento_mes: 500, pct: null, falta: 0 } }));
    await N.ir(page, '/gestao/app');
    await page.waitForTimeout(1500);
    T.ok('sem contas fixas cadastradas, a linha não aparece', (await page.locator('[data-teste=contas-fixas-hoje]').count()) === 0);
    T.ok('sem erro na página', erros.length === 0, erros.slice(0, 3));
    await ctx.close();
  }

  /* ---------- 5. painel do administrador, aba Vendas ---------- */
  T.secao('painel: aba Vendas (1366 e 390)');
  const uid = B.sql(`select user_id from profissionais where petshop_id='${L.P}' and papel='dono'`);
  B.sql(`insert into admins (user_id) values ('${uid}') on conflict do nothing`);
  T.depois(() => B.sql(`delete from admins where user_id='${uid}'`));
  for (const larg of [1366, 390]) {
    const { ctx, page, erros } = await N.contexto(larg, 900);
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/admin', '.g-adm-abas');
    await page.locator('.g-adm-abas button', { hasText: 'Vendas' }).click();
    await page.locator('input[name=vendedor_nome]').waitFor({ timeout: 20000 });
    const lista = limpo(await page.locator('[data-teste=por-vendedor]').innerText());
    T.ok(`${larg}: o vendedor do link aparece com o cadastro em teste`, /ana-teste 1 cadastro · 1 em teste · 0 pagantes/.test(lista), lista.slice(0, 300));
    const origem = limpo(await page.locator('[data-teste=lojas-com-origem]').innerText());
    T.ok(`${larg}: o pet shop aparece com vendedor, campanha e o pedido de ajuda (com o botão do WhatsApp)`, new RegExp(`Banho Vendas ${suf}.*vendedor ana-teste.*veio de whatsapp \\(novembro\\).*pediu ajuda da equipe`).test(origem)
      && (await page.locator('[data-teste=lojas-com-origem] a[href*="wa.me/5511988887777"]').count()) === 1, origem.slice(0, 400));
    if (larg === 1366) {
      T.ok('sem nome e documento: a prévia pede para preencher', /Preencha o nome e o documento/.test(await page.locator('[data-teste=previa-vendedor]').innerText()));
      await page.fill('input[name=vendedor_nome]', `Pessoa de Teste ${L.suf}`);
      await page.fill('input[name=vendedor_documento]', '000.000.000-00');
      T.ok('a prévia mostra a linha como vai aparecer', limpo(await page.locator('[data-teste=previa-vendedor]').innerText()) === `Vai aparecer assim: Vendido por Pessoa de Teste ${L.suf}, CPF 000.000.000-00.`);
      await page.getByRole('button', { name: 'Gravar', exact: true }).click();
      await page.waitForTimeout(1200);
      T.ok('Gravar guarda no banco (config_interna)', B.sql(`select valor from config_interna where chave='vendedor_nome'`) === `Pessoa de Teste ${L.suf}` && B.sql(`select valor from config_interna where chave='vendedor_documento'`) === '000.000.000-00');
      await page.fill('input[name=atraso_dias]', '10');
      await page.getByRole('button', { name: 'Gravar prazo' }).click();
      await page.waitForTimeout(800);
      T.ok('o prazo do atraso grava', B.sql(`select valor from config_interna where chave='assinatura_atraso_dias'`) === '10');
    }
    T.ok(`${larg}: sem rolagem para o lado`, (await N.rolagemLateral(page)) <= 1, await N.rolagemLateral(page));
    T.ok(`${larg}: sem erro na página`, erros.length === 0, erros.slice(0, 3));
    await foto(page, `admin-vendas-${larg}`, true);
    await page.locator('.g-adm-abas button', { hasText: 'Cakto' }).click();
    await page.waitForTimeout(1500);
    const cakto = limpo(await page.locator('.g-main, body').first().innerText());
    {
      const campo = page.locator('input[placeholder="cole aqui a chave secreta"]').first();
      await campo.fill('chave-de-teste-123456');
      const antes = await campo.getAttribute('type');
      await page.getByRole('button', { name: 'Mostrar a chave' }).first().click();
      const depois = await campo.getAttribute('type');
      T.ok(`${larg}: a chave nasce escondida e o olho mostra o que foi colado`, antes === 'password' && depois === 'text', [antes, depois]);
      T.ok(`${larg}: tem o botão Colar e a dica de copiar na Cakto com a chave à mostra`, (await page.getByRole('button', { name: 'Colar' }).count()) >= 1 && /toque no olho do campo da chave antes de copiar/.test(limpo(await page.locator('body').innerText())));
      await campo.fill('');
    }
    T.ok(`${larg}: aba Cakto fala em "Pagamento pela Cakto" e que o teste vencido fica só para consulta nos dois casos`, /Pagamento pela Cakto/.test(cakto) && /Nos dois casos, quem termina o teste de 7 dias fica só para consulta/.test(cakto) && !/o teste não bloqueia ninguém/.test(cakto));
    await ctx.close();
  }
  await N.fecharNavegador();
}))();
