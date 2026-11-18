// Mozart na tela depois dos cinco testadores, com a rota de verdade e o roteiro de teste (GESTAO_MOZART_FALSO=1, nunca o modelo).
//  - Juliana M6: negrito e lista na bolha, sem asteriscos.
//  - Juliana M5 / Neide L6: recarregar a página traz de volta a conversa (o painel abre sozinho) e o cartão que espera o
//    "Pode fazer"; o cartão continua pedindo confirmação; confirmar grava uma vez. Recarregar NO MEIO do "Pode fazer": a
//    página termina sozinha e continua um bloqueio só.
//  - Rafael: "Ouvir esta resposta" num aparelho sem voz mostra o aviso (não fica mudo).
//  - Rafael 11: numa loja só de creche, as sugestões não falam de banho.
// Em 390 e 1366, sem erro na página e sem rolagem para o lado.
const B = require('../lib/base');
const { criarLoja } = require('../lib/semente');
const N = require('../lib/navegador');
const T = require('../lib/teste')('mozart-consertos-telas');
const { falsos } = require('../lib/voz-falsa');

(async () => T.rodar(async () => {
  if (!(await B.servidorNoAr())) throw new Error(`servidor fora do ar em ${B.BASE_URL} (veja testes/LEIAME.md)`);
  const L = await criarLoja(T, { nome: 'Mozart telas', equipe: false, dados: false });
  const bloqueios = () => B.num(`select count(*) from bloqueios where petshop_id='${L.P}'`);
  let esperados = 0;

  for (const [largura, altura] of [[390, 844], [1366, 900]]) {
    const celular = largura < 500;
    const { ctx, page, erros } = await N.contexto(largura, altura);
    await ctx.addInitScript(falsos);
    // aparelho sem nenhuma voz: o navegador "fala" sem som e sem avisar (como o Chromium da Rafael)
    await ctx.addInitScript(() => { window.__vozesFalsas = []; if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; });
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app');
    const abrir = async () => { await page.locator(celular ? '.g-aba-mic' : '.g-fab').first().click(); };
    const painel = page.locator('.g-ass-painel[aria-label="Conversa com o Mozart"]');
    const pedir = async (t) => { const c = painel.locator('textarea'); await c.fill(t); await c.press('Enter'); };
    const esperarResposta = () => page.waitForFunction(() => !document.querySelector('.g-ass-painel .g-bolha.pensa'), null, { timeout: 15000 });

    T.secao(`${largura}: negrito e lista`);
    await abrir();
    await painel.waitFor({ timeout: 10000 });
    await pedir('me mostra em markdown as contas fixas');
    await esperarResposta();
    const bolha = painel.locator('.g-bolha.ela', { hasText: 'contas fixas somam' }).last();
    const texto = await bolha.innerText();
    T.ok('sem asteriscos na bolha', !/\*/.test(texto), texto);
    T.ok('"R$ 2.969,90" em negrito e a lista com 2 itens', (await bolha.locator('b', { hasText: 'R$ 2.969,90' }).count()) === 1 && (await bolha.locator('ul li').count()) === 2, await bolha.innerHTML());
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/mozart-consertos-markdown-${largura}.png` }).catch(() => {});

    T.secao(`${largura}: "Ouvir esta resposta" sem voz no aparelho`);
    await bolha.locator('button[aria-label="Ouvir esta resposta"]').click();
    await bolha.locator('.g-ass-sem-voz').waitFor({ timeout: 6000 }).catch(() => {});
    T.ok('aparece o aviso de que o aparelho não tem voz', /não tem voz instalada/.test(await bolha.innerText()), await bolha.innerText());

    T.secao(`${largura}: recarregar não perde a conversa nem o cartão`);
    await pedir('bloqueia o almoço de amanhã');
    await painel.locator('button', { hasText: 'Pode fazer' }).waitFor({ timeout: 15000 });
    await esperarResposta();
    T.ok('o texto do cartão não manda clicar em "Pode fazer"', !/pode fazer|no cartão/i.test(await painel.locator('.g-bolha.ela').last().innerText()));
    await page.reload();
    await painel.waitFor({ timeout: 15000 });
    T.ok('depois de recarregar, o painel abre sozinho com a conversa', /contas fixas somam/.test(await painel.locator('.g-ass-conversa').innerText()));
    T.ok('o cartão voltou esperando o "Pode fazer"', (await painel.locator('.g-proposta:not(.feita):not(.descartada) button', { hasText: 'Pode fazer' }).count()) === 1);
    T.ok('nada foi gravado só por recarregar', bloqueios() === esperados, bloqueios());
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/mozart-consertos-recarregou-${largura}.png` }).catch(() => {});
    await painel.locator('button', { hasText: 'Pode fazer' }).click();
    await painel.locator('.g-proposta.feita').waitFor({ timeout: 15000 });
    await esperarResposta();
    esperados++;
    T.ok('confirmado: um bloqueio', bloqueios() === esperados, bloqueios());

    T.secao(`${largura}: recarregar no meio do "Pode fazer"`);
    await pedir('bloqueia o almoço de amanhã de novo');
    await painel.locator('.g-proposta:not(.feita):not(.descartada) button', { hasText: 'Pode fazer' }).waitFor({ timeout: 15000 });
    await esperarResposta();
    // a confirmação demora a chegar ao servidor: a página recarrega antes da resposta
    let segurou = 0;
    await page.route('**/api/gestao/assistente', async (rota) => {
      const corpo = JSON.parse(rota.request().postData() || '{}');
      if (Array.isArray(corpo.decisoes) && segurou++ === 0) { await new Promise((ok) => setTimeout(ok, 1500)); return rota.abort().catch(() => {}); }
      return rota.continue().catch(() => {});
    });
    await painel.locator('.g-proposta:not(.feita):not(.descartada) button', { hasText: 'Pode fazer' }).click();
    await page.waitForTimeout(300);
    await page.reload();
    await painel.waitFor({ timeout: 15000 });
    await page.waitForFunction(() => /Prontinho, ficou feito/.test(document.querySelector('.g-ass-conversa')?.textContent || '') && !document.querySelector('.g-ass-painel .g-bolha.pensa'), null, { timeout: 15000 }).catch(() => {});
    await page.unroute('**/api/gestao/assistente');
    esperados++;
    T.ok('a página terminou a confirmação sozinha: "Prontinho"', /Prontinho, ficou feito/.test(await painel.locator('.g-ass-conversa').innerText()));
    T.ok('e gravou uma vez só', bloqueios() === esperados, bloqueios());

    T.ok('nenhum erro na tela', erros.filter((e) => !/aborted|ERR_FAILED|Failed to fetch/i.test(String(e))).length === 0, erros.slice(0, 4));
    T.ok('sem rolagem para o lado', (await N.rolagemLateral(page)) <= 0);
    // conversa nova para a próxima largura não herdar nada
    await painel.locator('button[aria-label="Começar conversa nova"]').click();
    await ctx.close();
  }

  T.secao('Rafael: com o Tirar dúvida aberto no celular, o fim da página sobe acima da folha');
  {
    B.must(await L.sb.dono.rpc('petshop_salvar_opcoes', { p: L.P, p_mudancas: { 'link.ia': true } }), 'liga o tirar dúvida');
    const { ctx, page, erros } = await N.contexto(390, 844);
    await page.goto(`${B.BASE_URL}/gestao/agendar/${L.codigo}`, { waitUntil: 'networkidle' });
    await page.locator('.g-lk-duv-abrir').click();
    await page.locator('.g-lk-duv').waitFor({ timeout: 8000 });
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => ({ folha: document.querySelector('.g-lk-duv').getBoundingClientRect().top, conteudo: Math.max(...[...document.querySelectorAll('.g-lk-rodape > *')].map((e) => e.getBoundingClientRect().bottom)) }));
    T.ok('rolando até o fim, o conteúdo da página fica acima da folha de dúvidas', r.conteudo <= r.folha + 1, r);
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/mozart-consertos-duvida-390.png` }).catch(() => {});
    T.ok('sem erro e sem rolagem para o lado', erros.length === 0 && (await N.rolagemLateral(page)) <= 0, erros.slice(0, 3));
    await ctx.close();
  }

  T.secao('Juliana M1: foto da tabela com creche (390)');
  {
    const { ctx, page, erros } = await N.contexto(390, 844);
    // a leitura como o servidor devolve depois de limpar (caderno.ts): creche e hotel já com o destino
    const sv = (nome, destino, preco, extra = {}) => ({ nome, area: destino === 'servico' ? 'banho_tosa' : 'creche', duracao_min: null, preco_p: preco, preco_m: preco, preco_g: preco, preco_gg: preco, duvida: false, destino, vezes: null, ...extra });
    const leitura = { pagina: 'precos', clientes: [], dividas: [], agenda: [], vacinas: [], duvidas: [], servicos: [sv('Creche diária', 'creche_diaria', 60), sv('Creche mensal 3x semana', 'creche_plano', 480, { vezes: 3 }), sv('Creche mensal 5x semana', 'creche_plano', 720, { vezes: 5 }), sv('Tosa bebê', 'servico', 45, { duracao_min: 45 })] };
    await page.route('**/api/gestao/caderno', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ leitura, restam: 29, limite: 30, paginas: 1 }) }));
    await N.entrar(page, L.emails.dono, L.senha);
    await N.ir(page, '/gestao/app/clientes');
    await page.locator('button', { hasText: 'Foto do caderno' }).click();
    const folha = page.locator('.g-folha');
    await folha.locator('.g-cad-tipo', { hasText: 'Tabela de preços' }).click();
    const img = await page.screenshot({ type: 'png' });
    await page.locator('.g-folha input[type=file][multiple]').setInputFiles({ name: 'tabela.png', mimeType: 'image/png', buffer: img });
    await page.locator('.g-cad-arqs li').first().waitFor({ timeout: 10000 });
    await page.locator('.g-folha button', { hasText: /^Ler / }).click();
    await page.locator('.g-cad-secao').first().waitFor({ timeout: 30000 });
    const texto = (await folha.innerText()).replace(/\u00a0/g, ' ');
    T.ok('cada linha diz para onde vai (diária da creche, modelo de plano 3x e 5x)', /Vai para a diária da creche/.test(texto) && /modelo de plano da creche: 3x por semana/.test(texto) && /5x por semana/.test(texto), texto.slice(0, 500));
    await page.screenshot({ path: `${B.RAIZ}/testes/saida/mozart-consertos-tabela-390.png` }).catch(() => {});
    await page.locator('.g-cad-rodape button', { hasText: /^Salvar/ }).click();
    await folha.locator('.g-imp-resumo').waitFor({ timeout: 30000 });
    T.ok('a diária da creche ficou R$ 60', B.sql(`select diaria_creche from petshops where id='${L.P}'`) === '60.00');
    T.ok('os planos viraram modelos de plano (3x R$ 480, 5x R$ 720)', B.sql(`select string_agg(vezes || '|' || valor_mensal, ',' order by vezes) from creche_modelos where petshop_id='${L.P}'`) === '3|480.00,5|720.00');
    T.ok('nenhum serviço de creche na agenda; a Tosa bebê entrou', B.num(`select count(*) from servicos where petshop_id='${L.P}' and nome ilike 'creche%'`) === 0 && B.num(`select count(*) from servicos where petshop_id='${L.P}' and nome='Tosa bebê'`) === 1);
    T.ok('nenhum erro na tela', erros.length === 0, erros.slice(0, 3));
    await ctx.close();
  }

  T.secao('Rafael 11: loja só de creche');
  const C = await criarLoja(T, { nome: 'Mozart creche', equipe: false, dados: false, modulos: ['creche'] });
  const { ctx, page } = await N.contexto(390, 844);
  await N.entrar(page, C.emails.dono, C.senha);
  await N.ir(page, '/gestao/app');
  await page.locator('.g-aba-mic, .g-fab').first().click();
  const painel = page.locator('.g-ass-painel[aria-label="Conversa com o Mozart"]');
  await painel.waitFor({ timeout: 10000 });
  const sug = await painel.locator('.g-ass-rapidas').innerText();
  T.ok('as sugestões falam da creche, não de banho nem de horário livre', /creche/i.test(sug) && !/banho|horários tenho livres/i.test(sug), sug);
  await page.screenshot({ path: `${B.RAIZ}/testes/saida/mozart-consertos-creche-390.png` }).catch(() => {});
  await ctx.close();
}))();
